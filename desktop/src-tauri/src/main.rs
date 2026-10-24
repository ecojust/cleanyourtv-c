#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod mcp;
mod platform_tools;

use puretv_core::{Manager as TvManager, Request, Snapshot};
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

#[derive(Clone)]
struct Bridge {
    manager: Arc<Mutex<TvManager>>,
    cancel: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
    snapshot: Arc<Mutex<Snapshot>>,
    progress: Arc<Mutex<Option<platform_tools::Progress>>>,
}

#[tauri::command]
async fn execute(request: Request, bridge: tauri::State<'_, Bridge>) -> Result<Snapshot, String> {
    if bridge
        .running
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err("已有操作正在执行，请等待完成或取消".into());
    }
    bridge.cancel.store(false, Ordering::Release);
    let manager = bridge.manager.clone();
    let cache = bridge.snapshot.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut manager = manager
            .lock()
            .map_err(|_| "管理状态不可用，请重新打开程序".to_string())?;
        let result = manager.execute(request);
        *cache.lock().map_err(|_| "状态缓存不可用")? = manager.snapshot();
        result
    })
    .await;
    bridge.running.store(false, Ordering::Release);
    result.map_err(|_| "操作任务异常结束，请重新扫描设备状态".to_string())?
}

#[tauri::command]
fn cancel(bridge: tauri::State<'_, Bridge>) {
    bridge.cancel.store(true, Ordering::Release);
}

#[tauri::command]
fn platform_tools_info(app: tauri::AppHandle) -> Result<platform_tools::Info, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|_| "无法定位应用数据目录")?;
    platform_tools::info(&directory)
}

#[tauri::command]
async fn install_platform_tools(
    accepted_license: bool,
    on_progress: tauri::ipc::Channel<platform_tools::Progress>,
    app: tauri::AppHandle,
    bridge: tauri::State<'_, Bridge>,
) -> Result<Snapshot, String> {
    if !accepted_license {
        return Err("请先阅读并同意 Android SDK 许可协议".into());
    }
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|_| "无法定位应用数据目录")?;
    if bridge
        .running
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err("已有操作正在执行，请等待完成或取消".into());
    }
    bridge.cancel.store(false, Ordering::Release);
    let manager = bridge.manager.clone();
    let cancel = bridge.cancel.clone();
    let cache = bridge.snapshot.clone();
    let progress_cache = bridge.progress.clone();
    *progress_cache.lock().map_err(|_| "进度不可用")? = None;
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut manager = manager
            .lock()
            .map_err(|_| "管理状态不可用，请重新打开程序")?;
        if manager.execute(Request::GetState)?.device.is_some() {
            return Err("请先断开当前电视，再准备或更换 ADB".into());
        }
        let result = platform_tools::install(
            &directory,
            &cancel,
            |progress| {
                *progress_cache.lock().map_err(|_| "进度不可用")? = Some(progress.clone());
                on_progress
                    .send(progress)
                    .map_err(|_| "下载界面已关闭，请重试".to_string())
            },
            |path| {
                manager.execute(Request::SetAdbPath {
                    path: path.to_string_lossy().into_owned(),
                })
            },
        );
        *cache.lock().map_err(|_| "状态缓存不可用")? = manager.snapshot();
        result
    })
    .await;
    bridge.running.store(false, Ordering::Release);
    result.map_err(|_| "工具安装任务异常结束，请重试".to_string())?
}

#[tauri::command]
async fn choose_apks(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || pick_apks(&app))
        .await
        .map_err(|_| "无法打开文件选择器".to_string())?
}
fn pick_apks(app: &tauri::AppHandle) -> Result<Vec<String>, String> {
    app.dialog()
        .file()
        .set_title("选择安装到电视的 APK")
        .add_filter("Android APK", &["apk"])
        .blocking_pick_files()
        .unwrap_or_default()
        .into_iter()
        .map(|file| {
            file.into_path()
                .map(|path| path.to_string_lossy().into_owned())
                .map_err(|_| "请选择本地 APK 文件".to_string())
        })
        .collect()
}

#[tauri::command]
async fn choose_adb(app: tauri::AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || pick_adb(&app))
        .await
        .map_err(|_| "无法打开文件选择器".to_string())?
}
fn pick_adb(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    app.dialog()
        .file()
        .set_title("选择 Android Platform Tools 中的 adb 或 adb.exe")
        .blocking_pick_file()
        .map(|file| {
            file.into_path()
                .map(|path| path.to_string_lossy().into_owned())
                .map_err(|_| "请选择本地 ADB 程序".to_string())
        })
        .transpose()
}

#[tauri::command]
fn open_resource(resource: &str, app: tauri::AppHandle) -> Result<(), String> {
    let url = match resource {
        "releases" => "https://github.com/ecojust/pureTV/releases",
        "platformTools" => "https://developer.android.com/tools/releases/platform-tools",
        "platformToolsLicense" => "https://developer.android.com/studio/terms",
        _ => return Err("不支持的资源".into()),
    };
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|_| "无法打开浏览器".into())
}

#[tauri::command]
fn mcp_info(info: tauri::State<'_, mcp::Info>) -> mcp::Info {
    info.inner().clone()
}

fn mcp_call(
    app: &tauri::AppHandle,
    bridge: &Bridge,
    name: &str,
    args: Value,
) -> Result<Value, String> {
    if name == "get_state" {
        return serde_json::to_value(bridge.snapshot.lock().map_err(|_| "状态不可用")?.clone())
            .map_err(|e| e.to_string());
    }
    if name == "get_status" {
        return Ok(
            json!({"running":bridge.running.load(Ordering::Acquire),"cancelling":bridge.running.load(Ordering::Acquire) && bridge.cancel.load(Ordering::Acquire),"progress":bridge.progress.lock().map_err(|_| "进度不可用")?.clone(),"snapshot":bridge.snapshot.lock().map_err(|_| "状态不可用")?.clone()}),
        );
    }
    if name == "cancel" {
        bridge.cancel.store(true, Ordering::Release);
        return Ok(json!({"requested":true}));
    }
    if name == "platform_tools_info" {
        return serde_json::to_value(platform_tools_info(app.clone())?).map_err(|e| e.to_string());
    }
    if bridge
        .running
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err("已有操作正在执行，请等待完成或取消".into());
    }
    struct Busy<'a>(&'a AtomicBool);
    impl Drop for Busy<'_> {
        fn drop(&mut self) {
            self.0.store(false, Ordering::Release);
        }
    }
    let guard = Busy(&bridge.running);
    bridge.cancel.store(false, Ordering::Release);
    *bridge.progress.lock().map_err(|_| "进度不可用")? = None;
    let _ = app.emit("mcp-operation", json!({"running":true,"tool":name}));
    let result = (|| -> Result<Value, String> {
        match name {
            "choose_apks" => return Ok(json!(pick_apks(app)?)),
            "choose_adb" => return Ok(json!(pick_adb(app)?)),
            "open_resource" => {
                open_resource(args["resource"].as_str().ok_or("资源无效")?, app.clone())?;
                return Ok(json!({"opened":true}));
            }
            _ => {}
        }
        let mut manager = bridge.manager.lock().map_err(|_| "管理状态不可用")?;
        let prior_ids: std::collections::BTreeSet<_> = manager
            .snapshot()
            .history
            .iter()
            .map(|entry| entry.id.clone())
            .collect();
        let result = if name == "install_platform_tools" {
            if args["acceptedLicense"] != true {
                return Err("请先阅读并同意 Android SDK 许可协议".into());
            }
            if manager.snapshot().device.is_some() {
                return Err("请先断开当前电视，再准备或更换 ADB".into());
            }
            let directory = app
                .path()
                .app_data_dir()
                .map_err(|_| "无法定位应用数据目录")?;
            platform_tools::install(
                &directory,
                &bridge.cancel,
                |progress| {
                    *bridge.progress.lock().map_err(|_| "进度不可用")? = Some(progress.clone());
                    let _ = app.emit("mcp-progress", progress);
                    Ok(())
                },
                |path| {
                    manager.execute(Request::SetAdbPath {
                        path: path.to_string_lossy().into_owned(),
                    })
                },
            )
        } else {
            let request = mcp::core_request(name, args)?;
            manager.execute(request)
        };
        *bridge.snapshot.lock().map_err(|_| "状态不可用")? = manager.snapshot();
        result.and_then(|snapshot| {
            let failed: Vec<_> = snapshot
                .history
                .iter()
                .filter(|entry| !entry.success && !prior_ids.contains(&entry.id))
                .cloned()
                .collect();
            if failed.is_empty() {
                serde_json::to_value(snapshot).map_err(|e| e.to_string())
            } else {
                Ok(json!({"snapshot":snapshot,"failedTargets":failed}))
            }
        })
    })();
    let snapshot = bridge.snapshot.lock().map_err(|_| "状态不可用")?.clone();
    let _ = app.emit(
        "mcp-operation",
        json!({"running":false,"tool":name,"snapshot":snapshot,"error":result.as_ref().err()}),
    );
    drop(guard);
    result
}

fn main() {
    let args: Vec<_> = std::env::args_os().collect();
    if args.get(1).is_some_and(|arg| arg == "--mcp") {
        let result = args
            .get(2)
            .ok_or_else(|| "用法：puretv-desktop --mcp <管理器显示的会话文件路径>".to_string())
            .and_then(|path| mcp::relay(std::path::Path::new(path)));
        if let Err(error) = result {
            eprintln!("{error}");
            std::process::exit(1)
        }
        return;
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            let cancel = Arc::new(AtomicBool::new(false));
            std::fs::create_dir_all(&directory)?;
            let lock = std::fs::OpenOptions::new()
                .read(true)
                .write(true)
                .create(true)
                .truncate(false)
                .open(directory.join("manager.lock"))?;
            lock.try_lock()
                .map_err(|_| "pureTV 管理器已运行，请使用已有窗口")?;
            app.manage(lock);
            let manager = TvManager::new(directory.clone(), cancel.clone());
            let snapshot = manager.snapshot();
            let bridge = Bridge {
                manager: Arc::new(Mutex::new(manager)),
                cancel,
                running: Arc::new(AtomicBool::new(false)),
                snapshot: Arc::new(Mutex::new(snapshot)),
                progress: Arc::new(Mutex::new(None)),
            };
            let handle = app.handle().clone();
            let service = bridge.clone();
            let info = mcp::start(
                &directory,
                Arc::new(move |name, args| mcp_call(&handle, &service, name, args)),
            )?;
            app.manage(info);
            app.manage(bridge);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            execute,
            cancel,
            choose_apks,
            choose_adb,
            platform_tools_info,
            install_platform_tools,
            open_resource,
            mcp_info
        ])
        .run(tauri::generate_context!())
        .expect("无法启动 pureTV 电视管理器");
}
