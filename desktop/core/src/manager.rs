use crate::{
    adb::{self, Output, ProcessRunner, Runner},
    parse, Device, HistoryEntry, LauncherInfo, PackageInfo, Request, Snapshot,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const LIMIT_HISTORY: usize = 200;
#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
struct Saved {
    adb_path: Option<String>,
    homes: Vec<Home>,
    enabled_states: Vec<EnabledState>,
    history: Vec<HistoryEntry>,
}
#[derive(Serialize, Deserialize)]
struct EnabledState {
    key: String,
    package: String,
    state: u8,
}
#[derive(Serialize, Deserialize)]
struct Home {
    key: String,
    component: String,
}
#[derive(Clone, Copy)]
enum Action {
    Enable,
    Disable,
    Uninstall,
    Restore,
}
impl Action {
    fn label(self) -> &'static str {
        match self {
            Self::Enable => "启用",
            Self::Disable => "停用",
            Self::Uninstall => "为当前用户卸载",
            Self::Restore => "恢复安装",
        }
    }
}

pub struct Manager {
    data_dir: PathBuf,
    saved: Saved,
    state: Snapshot,
    runner: Box<dyn Runner>,
    cancel: Arc<AtomicBool>,
    defer_cancel: bool,
}
impl Manager {
    pub fn new(data_dir: PathBuf, cancel: Arc<AtomicBool>) -> Self {
        let saved = read_saved(&data_dir);
        let state = Snapshot {
            history: saved.history.clone(),
            message: "选择 ADB 后连接电视；首次连接请在电视上授权".into(),
            ..Snapshot::default()
        };
        let mut manager = Self {
            data_dir,
            saved,
            state,
            runner: Box::new(ProcessRunner),
            cancel,
            defer_cancel: false,
        };
        manager.locate_adb();
        manager
    }
    pub fn snapshot(&self) -> Snapshot {
        self.state.clone()
    }

    pub fn execute(&mut self, request: Request) -> Result<Snapshot, String> {
        // The caller resets cancellation once, before dispatching the task.
        // Resetting here could swallow an immediate cancel queued before lock acquisition.
        self.defer_cancel = false;
        let result = match request {
            Request::GetState => {
                self.locate_adb();
                Ok(())
            }
            Request::SetAdbPath { path } => self.set_adb(path),
            Request::Connect { host, port } => self.connect(&host, port),
            Request::Pair { host, port, code } => self.pair(&host, port, &code),
            Request::Disconnect => self.disconnect(),
            Request::Scan => self.scan(),
            Request::SetEnabled { packages, enabled } => self.batch(
                packages,
                if enabled {
                    Action::Enable
                } else {
                    Action::Disable
                },
            ),
            Request::Uninstall { packages } => self.batch(packages, Action::Uninstall),
            Request::Restore { packages } => self.batch(packages, Action::Restore),
            Request::Install { paths } => self.install(paths),
            Request::SetHome { component } => self.set_home(&component, false),
            Request::RestoreHome => {
                let home = self.state.original_home.clone();
                match home {
                    Some(value) => self.set_home(&value, true),
                    None => Err("此电视用户尚无已记录的原桌面".into()),
                }
            }
            Request::ClearHistory => {
                self.state.history.clear();
                self.state.message = "操作记录已清空".into();
                self.persist()
            }
        };
        self.defer_cancel = false;
        self.state.revision = self.state.revision.saturating_add(1);
        match result {
            Ok(()) => Ok(self.state.clone()),
            Err(error) => {
                self.state.message = error.clone();
                Err(error)
            }
        }
    }
    fn locate_adb(&mut self) {
        let path = adb::discover(self.saved.adb_path.as_deref());
        self.state.adb_available = path.is_some();
        self.state.adb_path = path
            .map(|p| p.to_string_lossy().into_owned())
            .or_else(|| self.saved.adb_path.clone());
    }
    fn run(
        &mut self,
        args: Vec<String>,
        input: Option<&str>,
        seconds: u64,
    ) -> Result<String, String> {
        let path = self
            .state
            .adb_path
            .as_ref()
            .ok_or("未找到 ADB，请选择 Platform Tools 中的 adb")?;
        let deferred = AtomicBool::new(false);
        let flag = if self.defer_cancel {
            &deferred
        } else {
            self.cancel.as_ref()
        };
        let output = self.runner.run(
            Path::new(path),
            &args,
            input,
            flag,
            Duration::from_secs(seconds),
        )?;
        check_output(output)
    }
    fn shell(&mut self, serial: &str, args: &[&str]) -> Result<String, String> {
        let mut values = vec!["-s".to_string(), serial.to_string(), "shell".to_string()];
        values.extend(args.iter().map(|s| s.to_string()));
        self.run(values, None, 25)
    }
    fn verify_adb(&mut self) -> Result<(), String> {
        self.locate_adb();
        if !self.state.adb_available {
            return Err("未找到 ADB，请选择 Platform Tools 中的 adb".into());
        }
        let output = self.run(vec!["version".into()], None, 8)?;
        if !output.contains("Android Debug Bridge version") {
            return Err("所选文件不是有效的 Android Debug Bridge".into());
        }
        Ok(())
    }
    fn set_adb(&mut self, path: String) -> Result<(), String> {
        if self.state.device.is_some() {
            return Err("请先断开当前电视，再更换 ADB".into());
        }
        let path = path.trim();
        if path.len() > 4096 {
            return Err("ADB 路径过长".into());
        }
        let old = self.saved.adb_path.clone();
        self.saved.adb_path = (!path.is_empty()).then(|| path.to_string());
        if let Err(error) = self.verify_adb().and_then(|_| self.persist()) {
            self.saved.adb_path = old;
            self.locate_adb();
            return Err(error);
        }
        self.state.message = "ADB 已就绪".into();
        Ok(())
    }
    fn connect(&mut self, host: &str, port: u16) -> Result<(), String> {
        let serial = parse::endpoint(host, port)?;
        self.verify_adb()?;
        // Selecting another target never leaves the previous television active
        // behind a failed connection attempt.
        self.state.device = None;
        self.state.packages.clear();
        self.state.launchers.clear();
        self.state.default_home = None;
        self.state.original_home = None;
        let connection = self.run(vec!["connect".into(), serial.clone()], None, 20);
        // ADB can report "failed to authenticate" while it adds an unauthorized
        // device and the television is showing its approval dialog.
        let status = match self.device_status(&serial)? {
            Some(status) => status,
            None => {
                return Err(connection
                    .err()
                    .unwrap_or_else(|| "电视未出现在 ADB 列表，请检查 IP、端口与调试设置".into()))
            }
        };
        self.state.device = Some(Device {
            serial: serial.clone(),
            model: "Android TV".into(),
            android_version: String::new(),
            user_id: 0,
            status: status.clone(),
        });
        self.state.packages.clear();
        self.state.launchers.clear();
        self.state.default_home = None;
        self.state.original_home = None;
        if status != "device" {
            self.state.message = if status == "unauthorized" {
                "等待电视授权：请在电视上允许此电脑进行调试"
            } else {
                "电视离线，请检查连接后重新连接"
            }
            .into();
            return Ok(());
        }
        self.scan()
    }
    fn pair(&mut self, host: &str, port: u16, code: &str) -> Result<(), String> {
        let endpoint = parse::endpoint(host, port)?;
        if code.len() != 6 || !code.bytes().all(|b| b.is_ascii_digit()) {
            return Err("请输入电视显示的六位配对码".into());
        }
        self.verify_adb()?;
        // Never put a pairing code in argv, logs or persisted configuration.
        let result = self.run(
            vec!["pair".into(), endpoint],
            Some(&format!("{code}\n")),
            30,
        );
        match result {
            Ok(output) if output.contains("Successfully paired") => {
                self.state.message =
                    "配对成功，请使用电视显示的调试端口连接（可能与配对端口不同）".into();
                Ok(())
            }
            Ok(_) => Err("配对未成功，请检查配对端口及电视上的六位配对码".into()),
            Err(_) => Err("配对失败或已取消，请检查配对端口及配对码后重试".into()),
        }
    }
    fn disconnect(&mut self) -> Result<(), String> {
        if let Some(device) = self.state.device.clone() {
            self.run(vec!["disconnect".into(), device.serial], None, 10)?;
        }
        self.state.device = None;
        self.state.packages.clear();
        self.state.launchers.clear();
        self.state.default_home = None;
        self.state.original_home = None;
        self.state.message = "已断开电视".into();
        Ok(())
    }
    fn device_status(&mut self, serial: &str) -> Result<Option<String>, String> {
        let devices = self.run(vec!["devices".into(), "-l".into()], None, 10)?;
        Ok(parse::devices(&devices)
            .into_iter()
            .find(|(id, _)| id == serial)
            .map(|(_, status)| status))
    }
    fn ensure_device(&mut self, same_user: bool) -> Result<Device, String> {
        let old = self.state.device.clone().ok_or("请先连接电视")?;
        let status = self
            .device_status(&old.serial)?
            .unwrap_or_else(|| "offline".into());
        if let Some(current) = self.state.device.as_mut() {
            current.status = status.clone();
        }
        if status != "device" {
            return Err(if status == "unauthorized" {
                "电视尚未授权，请在电视上允许连接"
            } else {
                "电视已离线，请重新连接"
            }
            .into());
        }
        let user = self
            .shell(&old.serial, &["am", "get-current-user"])?
            .trim()
            .parse::<u32>()
            .map_err(|_| "无法确认电视的当前用户，已停止操作")?;
        if user > i32::MAX as u32 {
            return Err("电视返回了无效用户 ID".into());
        }
        if same_user && old.user_id != user {
            return Err("电视当前用户已改变，请重新扫描并确认操作目标".into());
        }
        if !same_user && old.user_id != user {
            // Never associate a previous user's catalogue with the new identity,
            // even if a later read fails or scanning is cancelled.
            self.state.packages.clear();
            self.state.launchers.clear();
            self.state.default_home = None;
            self.state.original_home = None;
        }
        let current = self.state.device.as_mut().ok_or("电视连接已失效")?;
        current.user_id = user;
        Ok(current.clone())
    }
    fn list(&mut self, device: &Device, flags: &[&str]) -> Result<BTreeSet<String>, String> {
        let user = device.user_id.to_string();
        let mut args = vec!["pm", "list", "packages"];
        args.extend(flags);
        args.extend(["--user", user.as_str()]);
        parse::packages(&self.shell(&device.serial, &args)?)
    }
    fn homes(&mut self, device: &Device) -> Result<(Vec<String>, Option<String>), String> {
        let user = device.user_id.to_string();
        let list = self.shell(
            &device.serial,
            &[
                "cmd",
                "package",
                "query-activities",
                "--components",
                "--user",
                &user,
                "-a",
                "android.intent.action.MAIN",
                "-c",
                "android.intent.category.HOME",
            ],
        )?;
        let current = self.shell(
            &device.serial,
            &[
                "cmd",
                "package",
                "resolve-activity",
                "--brief",
                "--user",
                &user,
                "-a",
                "android.intent.action.MAIN",
                "-c",
                "android.intent.category.HOME",
            ],
        )?;
        Ok((parse::components(&list), parse::default_home(&current)))
    }
    fn read_catalogue(&mut self, device: &Device) -> Result<(), String> {
        let installed = self.list(device, &[])?;
        if installed.is_empty() {
            return Err("电视未返回已安装应用，旧列表已保留".into());
        }
        let system = self.list(device, &["-s", "-u"])?;
        let disabled = self.list(device, &["-d"])?;
        let known = self.list(device, &["-u"])?;
        let (homes, default) = match self.homes(device) {
            Ok(values) => values,
            Err(error)
                if (!self.defer_cancel && self.cancel.load(Ordering::Relaxed))
                    || error.contains("操作已取消") =>
            {
                return Err(error)
            }
            // Some firmware restricts HOME queries while allowing package
            // inspection. Keep the useful catalogue; cleanup stays fail-closed.
            Err(_) => (Vec::new(), None),
        };
        let home_pkg = default
            .as_deref()
            .and_then(|s| s.split_once('/'))
            .map(|(p, _)| p);
        let all: BTreeSet<_> = installed
            .iter()
            .cloned()
            .chain(known.intersection(&system).cloned())
            .collect();
        let packages = all
            .into_iter()
            .map(|pkg| {
                let protected_reason = if parse::core_package(&pkg) {
                    Some("核心系统组件".into())
                } else if home_pkg == Some(pkg.as_str()) {
                    Some("当前默认桌面，请先切换到其他启动器".into())
                } else {
                    None
                };
                PackageInfo {
                    label: parse::label(&pkg),
                    system: system.contains(&pkg),
                    enabled: !disabled.contains(&pkg),
                    installed: installed.contains(&pkg),
                    package_name: pkg,
                    protected_reason,
                }
            })
            .collect();
        self.state.launchers = homes
            .into_iter()
            .map(|component| {
                let package_name = component.split('/').next().unwrap_or_default().to_string();
                LauncherInfo {
                    label: parse::label(&package_name),
                    package_name,
                    is_default: default.as_ref() == Some(&component),
                    component,
                }
            })
            .collect();
        self.state.default_home = default;
        self.state.packages = packages;
        let key = device_key(device);
        self.state.original_home = self
            .saved
            .homes
            .iter()
            .find(|h| h.key == key)
            .map(|h| h.component.clone());
        Ok(())
    }
    fn scan(&mut self) -> Result<(), String> {
        let mut device = self.ensure_device(false)?;
        device.model = parse::short(
            self.shell(&device.serial, &["getprop", "ro.product.model"])?
                .trim(),
            120,
        );
        device.android_version = parse::short(
            self.shell(&device.serial, &["getprop", "ro.build.version.release"])?
                .trim(),
            40,
        );
        self.state.device = Some(device.clone());
        self.read_catalogue(&device)?;
        self.state.message = format!(
            "扫描完成：{} 个已安装应用{}",
            self.state.packages.iter().filter(|p| p.installed).count(),
            if self.state.default_home.is_none() {
                "；无法确认默认桌面，停用／卸载暂不可用"
            } else {
                ""
            }
        );
        Ok(())
    }
    fn batch(&mut self, packages: Vec<String>, action: Action) -> Result<(), String> {
        let targets = validate_targets(packages)?;
        let device = self.ensure_device(true)?;
        self.read_catalogue(&device)?;
        let mut success = 0;
        let mut failed = 0;
        for target in &targets {
            if self.cancel.load(Ordering::Relaxed) {
                break;
            }
            let result = self.change_one(target, action);
            self.defer_cancel = false;
            match &result {
                Ok(_) => success += 1,
                Err(_) => failed += 1,
            }
            self.record(
                action.label(),
                target,
                result.is_ok(),
                result.as_deref().unwrap_or_else(|e| e),
            );
            if self
                .state
                .device
                .as_ref()
                .is_none_or(|d| d.status != "device")
            {
                break;
            }
        }
        let skipped = targets.len() - success - failed;
        self.state.message = format!(
            "{}完成：成功 {success} 项，失败 {failed} 项，未执行 {skipped} 项",
            action.label()
        );
        self.persist()?;
        Ok(())
    }
    fn change_one(&mut self, target: &str, action: Action) -> Result<String, String> {
        let device = self.ensure_device(true)?;
        self.read_catalogue(&device)?; // Re-read HOME and installed state before every mutation.
        let package = self
            .state
            .packages
            .iter()
            .find(|p| p.package_name == target)
            .cloned()
            .ok_or("应用不在当前设备列表中，请重新扫描")?;
        if matches!(action, Action::Disable | Action::Uninstall) {
            if self.state.default_home.is_none() {
                return Err("无法确认当前默认桌面，已停止停用／卸载操作".into());
            }
            if let Some(reason) = package.protected_reason {
                return Err(format!("无法操作：{reason}"));
            }
        }
        if !matches!(action, Action::Restore) && !package.installed {
            return Err("应用已不在当前用户中安装".into());
        }
        if matches!(action, Action::Restore) && (package.installed || !package.system) {
            return Err("此应用不是可恢复的系统应用".into());
        }
        if matches!(action, Action::Disable) && !package.enabled {
            return Ok("应用已停用，未重复修改".into());
        }
        // A cancellation skips the remaining targets; it never kills a package
        // mutation halfway through or skips verification of the current target.
        let key = device_key(&device);
        if matches!(action, Action::Disable) && package.enabled {
            let dump = self.shell(&device.serial, &["dumpsys", "package", target])?;
            let prior = enabled_state(&dump, device.user_id)
                .ok_or("无法确认应用原始启用状态，已停止停用操作")?;
            self.saved
                .enabled_states
                .retain(|s| !(s.key == key && s.package == target));
            if self.saved.enabled_states.len() >= 200 {
                self.saved.enabled_states.remove(0);
            }
            self.saved.enabled_states.push(EnabledState {
                key: key.clone(),
                package: target.to_string(),
                state: prior,
            });
            self.persist()?;
        }
        self.defer_cancel = true;
        let user = device.user_id.to_string();
        let restore_default = self
            .saved
            .enabled_states
            .iter()
            .any(|s| s.key == key && s.package == target && s.state == 0);
        let output = match action {
            Action::Enable => self.shell(
                &device.serial,
                &[
                    "pm",
                    if restore_default {
                        "default-state"
                    } else {
                        "enable"
                    },
                    "--user",
                    &user,
                    target,
                ],
            ),
            Action::Disable => self.shell(
                &device.serial,
                &["pm", "disable-user", "--user", &user, target],
            ),
            Action::Uninstall => self.shell(
                &device.serial,
                &["pm", "uninstall", "-k", "--user", &user, target],
            ),
            Action::Restore => self.shell(
                &device.serial,
                &[
                    "cmd",
                    "package",
                    "install-existing",
                    "--user",
                    &user,
                    target,
                ],
            ),
        }
        .map_err(uncertain)?;
        if matches!(action, Action::Uninstall) && !output.lines().any(|l| l.trim() == "Success") {
            return Err(format!(
                "电视未确认卸载成功：{}",
                parse::short(&output, 250)
            ));
        }
        self.ensure_device(true).map_err(uncertain)?;
        self.read_catalogue(&device).map_err(uncertain)?;
        let updated = self
            .state
            .packages
            .iter()
            .find(|p| p.package_name == target);
        let verified = match action {
            Action::Enable => updated.is_some_and(|p| p.installed && p.enabled),
            Action::Disable => updated.is_some_and(|p| p.installed && !p.enabled),
            Action::Uninstall => updated.is_none_or(|p| !p.installed),
            Action::Restore => updated.is_some_and(|p| p.installed),
        };
        if !verified {
            return Err("命令已返回，但复查未确认预期状态；请重新扫描".into());
        }
        if matches!(action, Action::Enable) {
            self.saved
                .enabled_states
                .retain(|s| !(s.key == key && s.package == target));
        }
        Ok(format!("{}成功，已复查设备状态", action.label()))
    }
    fn install(&mut self, paths: Vec<String>) -> Result<(), String> {
        if paths.is_empty() || paths.len() > 10 {
            return Err("每次请选择 1–10 个 APK 文件".into());
        }
        let files: Vec<PathBuf> = paths
            .iter()
            .map(|s| validate_apk(s))
            .collect::<Result<_, _>>()?;
        let mut succeeded = 0;
        let mut failed = 0;
        for file in &files {
            if self.cancel.load(Ordering::Relaxed) {
                break;
            }
            let result = self.install_one(file);
            self.defer_cancel = false;
            if result.is_ok() {
                succeeded += 1;
            } else {
                failed += 1;
            }
            self.record(
                "安装 APK",
                &file.file_name().unwrap_or_default().to_string_lossy(),
                result.is_ok(),
                result.as_deref().unwrap_or_else(|e| e),
            );
            if self
                .state
                .device
                .as_ref()
                .is_none_or(|d| d.status != "device")
            {
                break;
            }
        }
        self.state.message = format!(
            "安装完成：成功 {succeeded} 项，失败 {failed} 项，未执行 {} 项",
            files.len() - succeeded - failed
        );
        self.persist()?;
        Ok(())
    }
    fn install_one(&mut self, file: &Path) -> Result<String, String> {
        let device = self.ensure_device(true)?;
        let file = validate_apk(&file.to_string_lossy())?;
        self.defer_cancel = true;
        let output = self
            .run(
                vec![
                    "-s".into(),
                    device.serial.clone(),
                    "install".into(),
                    "--user".into(),
                    device.user_id.to_string(),
                    "-r".into(),
                    file.to_string_lossy().into_owned(),
                ],
                None,
                180,
            )
            .map_err(uncertain)?;
        if !output.lines().any(|l| l.trim() == "Success") {
            return Err(format!(
                "电视未确认安装成功：{}",
                parse::short(&output, 250)
            ));
        }
        self.ensure_device(true).map_err(uncertain)?;
        self.read_catalogue(&device).map_err(uncertain)?;
        Ok("电视已确认安装成功，已刷新应用列表".into())
    }
    fn set_home(&mut self, component: &str, restore: bool) -> Result<(), String> {
        let normalized = parse::normalize_component(component).ok_or("启动器组件格式无效")?;
        let component = normalized.as_str();
        let device = self.ensure_device(true)?;
        self.read_catalogue(&device)?;
        if !self
            .state
            .launchers
            .iter()
            .any(|l| l.component == component)
        {
            return Err("所选应用未提供可用的 HOME 启动器，请先安装／启用后重新扫描".into());
        }
        let key = device_key(&device);
        if !restore && !self.saved.homes.iter().any(|h| h.key == key) {
            if let Some(old) = self.state.default_home.clone() {
                if old != component {
                    if self.saved.homes.len() >= 8 {
                        self.saved.homes.remove(0);
                    }
                    self.saved.homes.push(Home {
                        key,
                        component: old.clone(),
                    });
                    self.state.original_home = Some(old);
                }
            }
        }
        // Every attempt, including a retry after a failed write, must ensure
        // recovery information reached disk before changing the television.
        self.persist()?;
        let action = if restore {
            "恢复原桌面"
        } else {
            "设置默认桌面"
        };
        self.defer_cancel = true;
        let user = device.user_id.to_string();
        let quoted = parse::component_arg(component);
        let result = self
            .shell(
                &device.serial,
                &[
                    "cmd",
                    "package",
                    "set-home-activity",
                    "--user",
                    &user,
                    &quoted,
                ],
            )
            .and_then(|_| {
                self.ensure_device(true)?;
                self.read_catalogue(&device)?;
                if self.state.default_home.as_deref() == Some(component) {
                    Ok("默认桌面设置成功，已核对 HOME 组件".to_string())
                } else {
                    Err("电视未采用所选默认桌面，可能受到厂商固件限制".to_string())
                }
            });
        self.defer_cancel = false;
        self.record(
            action,
            component,
            result.is_ok(),
            result.as_deref().unwrap_or_else(|e| e),
        );
        self.persist()?;
        self.state.message = result?;
        Ok(())
    }
    fn record(&mut self, action: &str, target: &str, success: bool, message: &str) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default();
        let (device, user_id) = self
            .state
            .device
            .as_ref()
            .map(|d| (d.serial.clone(), d.user_id))
            .unwrap_or_default();
        self.state.history.insert(
            0,
            HistoryEntry {
                id: now.as_nanos().to_string(),
                timestamp: now.as_secs(),
                action: action.to_string(),
                target: parse::short(target, 512),
                device,
                user_id,
                success,
                message: parse::short(message, 500),
            },
        );
        self.state.history.truncate(LIMIT_HISTORY);
        if let Err(error) = self.persist() {
            self.state.message = error;
        }
    }
    fn persist(&mut self) -> Result<(), String> {
        self.saved.history = self.state.history.clone();
        fs::create_dir_all(&self.data_dir).map_err(|_| "无法创建本地配置目录")?;
        let body = serde_json::to_vec(&self.saved).map_err(|_| "无法保存本地配置")?;
        let temporary = self.data_dir.join("state.new");
        let destination = self.data_dir.join("state.json");
        let backup = self.data_dir.join("state.backup.json");
        fs::write(&temporary, body).map_err(|_| "无法写入本地配置与操作记录")?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&temporary, fs::Permissions::from_mode(0o600));
        }
        if destination.exists() {
            let _ = fs::remove_file(&backup);
            fs::rename(&destination, &backup).map_err(|_| "无法更新本地配置备份")?;
        }
        if fs::rename(&temporary, &destination).is_err() {
            let _ = fs::rename(&backup, &destination);
            return Err("无法保存本地配置，已尝试恢复旧配置".into());
        }
        Ok(())
    }
}
fn enabled_state(output: &str, user: u32) -> Option<u8> {
    let prefix = format!("User {user}:");
    output
        .lines()
        .map(str::trim)
        .find(|line| line.starts_with(&prefix))?
        .split_whitespace()
        .find_map(|field| {
            field
                .strip_prefix("enabled=")
                .and_then(|s| s.parse::<u8>().ok())
                .filter(|v| *v <= 4)
        })
}
fn device_key(device: &Device) -> String {
    format!("{}#{}", device.serial, device.user_id)
}
fn uncertain(error: String) -> String {
    format!("执行结果未确认，操作可能已生效，请重新扫描：{error}")
}
fn check_output(output: Output) -> Result<String, String> {
    let lower = output.text.to_ascii_lowercase();
    let failure = output.code != 0
        || lower.contains("failure [")
        || lower.lines().any(|l| {
            let l = l.trim();
            let exception_head = l.split(':').next().unwrap_or_default();
            let exception = l.contains(':')
                && exception_head.ends_with("exception")
                && exception_head
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'$'));
            exception
                || l.starts_with("exception occurred")
                || l.starts_with("error:")
                || l.starts_with("error ")
                || l.starts_with("unknown command")
                || l.starts_with("adb: error")
                || l.starts_with("failed to")
                || l.starts_with("cannot connect")
        });
    if failure {
        Err(format!(
            "ADB 操作失败：{}",
            parse::short(output.text.trim(), 500)
        ))
    } else {
        Ok(output.text)
    }
}
fn validate_targets(values: Vec<String>) -> Result<Vec<String>, String> {
    if values.is_empty() || values.len() > 100 {
        return Err("每次请选择 1–100 个应用".into());
    }
    let mut seen = BTreeSet::new();
    let mut result = Vec::new();
    for value in values {
        if !parse::package(&value) {
            return Err("应用包名格式无效".into());
        }
        if seen.insert(value.clone()) {
            result.push(value);
        }
    }
    Ok(result)
}
fn validate_apk(value: &str) -> Result<PathBuf, String> {
    if value.len() > 4096 || value.contains('\0') {
        return Err("APK 路径无效".into());
    }
    let path = PathBuf::from(value);
    if !path.is_absolute()
        || !path
            .extension()
            .is_some_and(|s| s.eq_ignore_ascii_case("apk"))
    {
        return Err("请选择本地 APK 文件的完整路径（不支持 XAPK／APKS）".into());
    }
    let metadata = path.metadata().map_err(|_| "APK 文件不存在或无法访问")?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > 2 * 1024 * 1024 * 1024 {
        return Err("APK 必须是非空普通文件，且不超过 2 GiB".into());
    }
    path.canonicalize()
        .map_err(|_| "无法读取 APK 的完整路径".into())
}
fn read_saved(directory: &Path) -> Saved {
    for name in ["state.json", "state.backup.json"] {
        let path = directory.join(name);
        if !path
            .metadata()
            .is_ok_and(|m| m.is_file() && m.len() <= 1024 * 1024)
        {
            continue;
        }
        if let Ok(body) = fs::read(path) {
            if let Ok(mut saved) = serde_json::from_slice::<Saved>(&body) {
                saved.history.truncate(LIMIT_HISTORY);
                saved
                    .homes
                    .retain(|h| h.key.len() <= 300 && parse::component(&h.component));
                saved.homes.truncate(8);
                for home in &mut saved.homes {
                    if let Some(component) = parse::normalize_component(&home.component) {
                        home.component = component;
                    }
                }
                saved
                    .enabled_states
                    .retain(|s| s.key.len() <= 300 && parse::package(&s.package) && s.state <= 4);
                saved.enabled_states.truncate(200);
                if saved.adb_path.as_ref().is_some_and(|p| p.len() > 4096) {
                    saved.adb_path = None;
                }
                return saved;
            }
        }
    }
    Saved::default()
}

#[cfg(test)]
mod tests;
