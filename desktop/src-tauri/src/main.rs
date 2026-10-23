#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod platform_tools;

use puretv_core::{Manager as TvManager, Request, Snapshot};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

struct Bridge {
    manager: Arc<Mutex<TvManager>>,
    cancel: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
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
    let result = tauri::async_runtime::spawn_blocking(move || {
        manager
            .lock()
            .map_err(|_| "管理状态不可用，请重新打开程序".to_string())?
            .execute(request)
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
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut manager = manager
            .lock()
            .map_err(|_| "管理状态不可用，请重新打开程序")?;
        if manager.execute(Request::GetState)?.device.is_some() {
            return Err("请先断开当前电视，再准备或更换 ADB".into());
        }
        platform_tools::install(
            &directory,
            &cancel,
            |progress| {
                on_progress
                    .send(progress)
                    .map_err(|_| "下载界面已关闭，请重试".to_string())
            },
            |path| {
                manager.execute(Request::SetAdbPath {
                    path: path.to_string_lossy().into_owned(),
                })
            },
        )
    })
    .await;
    bridge.running.store(false, Ordering::Release);
    result.map_err(|_| "工具安装任务异常结束，请重试".to_string())?
}

#[tauri::command]
async fn choose_apks(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
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
    })
    .await
    .map_err(|_| "无法打开文件选择器".to_string())?
}

#[tauri::command]
async fn choose_adb(app: tauri::AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
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
    })
    .await
    .map_err(|_| "无法打开文件选择器".to_string())?
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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            let cancel = Arc::new(AtomicBool::new(false));
            app.manage(Bridge {
                manager: Arc::new(Mutex::new(TvManager::new(directory, cancel.clone()))),
                cancel,
                running: Arc::new(AtomicBool::new(false)),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            execute,
            cancel,
            choose_apks,
            choose_adb,
            platform_tools_info,
            install_platform_tools,
            open_resource
        ])
        .run(tauri::generate_context!())
        .expect("无法启动 pureTV 电视管理器");
}
