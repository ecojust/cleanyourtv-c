use super::*;
use crate::LauncherRequest;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::io::Read;
const PACKAGE: &str = "com.ecojust.cleanyourtv";
const URI: &str = "content://com.ecojust.cleanyourtv.layout";
const LAYOUT_LIMIT: usize = 48 * 1024;

pub(crate) fn validate_layout(layout: &Value) -> Result<(), String> {
    let object = layout.as_object().ok_or("apps.json 应为对象")?;
    if object
        .keys()
        .any(|key| !["version", "columns", "home", "apps"].contains(&key.as_str()))
        || layout["version"] != 1
        || !layout["columns"]
            .as_u64()
            .is_some_and(|n| (1..=6).contains(&n))
        || layout.to_string().len() > LAYOUT_LIMIT
    {
        return Err("apps.json 版本、列数或大小无效".into());
    }
    for (section, min, max) in [("home", 1, 24), ("apps", 0, 100)] {
        let entries = layout[section].as_array().ok_or("home/apps 应为列表")?;
        if entries.len() < min || entries.len() > max {
            return Err("布局应用数量超出限制".into());
        }
        let mut seen = BTreeSet::new();
        for entry in entries {
            let fields = entry.as_object().ok_or("布局项应为对象")?;
            if fields.keys().any(|key| {
                !["action", "packageName", "label", "icon", "color"].contains(&key.as_str())
            }) {
                return Err("布局含未知字段".into());
            }
            let action = entry
                .get("action")
                .map(|v| v.as_str().ok_or("action 应为字符串"))
                .transpose()?
                .unwrap_or("app");
            if ![
                "app",
                "music",
                "bilibili",
                "files",
                "apps",
                "shortvideo",
                "webtv",
                "placeholder",
            ]
            .contains(&action)
            {
                return Err("布局操作不支持".into());
            }
            let key = if action == "app" {
                let package = entry["packageName"].as_str().ok_or("请指定应用包名")?;
                if !parse::package(package) {
                    return Err("应用包名无效".into());
                }
                package
            } else {
                if entry.get("packageName").is_some() {
                    return Err("内置入口不能指定 packageName".into());
                }
                action
            };
            if action != "placeholder" && !seen.insert(key) {
                return Err("布局中有重复应用".into());
            }
            if entry
                .get("label")
                .is_some_and(|v| v.as_str().is_none_or(|s| s.chars().count() > 100))
            {
                return Err("显示名称无效".into());
            }
            if entry.get("icon").is_some_and(|v| {
                v.as_str().is_none_or(|s| {
                    ![
                        "app", "music", "video", "files", "apps", "picture", "settings", "input",
                    ]
                    .contains(&s)
                })
            }) {
                return Err("图标类型无效".into());
            }
            if entry.get("color").is_some_and(|v| {
                v.as_str().is_none_or(|s| {
                    s.len() != 7
                        || !s.starts_with('#')
                        || !s[1..].bytes().all(|b| b.is_ascii_hexdigit())
                })
            }) {
                return Err("卡片颜色应为 #RRGGBB".into());
            }
        }
    }
    Ok(())
}
fn provider_result(output: &str) -> Result<Value, String> {
    let encoded = output
        .split("result=")
        .nth(1)
        .ok_or("启动器未返回布局接口结果")?
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '/' | '='))
        .collect::<String>();
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|_| "启动器布局响应编码无效")?;
    if bytes.len() > 2 * 1024 * 1024 {
        return Err("启动器布局响应过大".into());
    }
    let mut value: Value = serde_json::from_slice(&bytes).map_err(|_| "启动器布局响应无效")?;
    if value["supported"] != true || value["version"] != 1 {
        return Err("启动器布局接口版本不支持".into());
    }
    validate_layout(&value["layout"])?;
    let apps = value["apps"].as_array().ok_or("启动器应用列表无效")?;
    if apps.len() > 100 {
        return Err("启动器应用列表超过限制".into());
    }
    let mut clean = Vec::new();
    for app in apps {
        let package = app["packageName"].as_str().ok_or("应用包名无效")?;
        if !parse::package(package) {
            return Err("应用包名无效".into());
        }
        let label: String = app["label"]
            .as_str()
            .unwrap_or(package)
            .chars()
            .take(200)
            .collect();
        let mut entry = json!({"packageName":package,"label":label});
        if let Some(encoded) = app["iconPng"].as_str().filter(|s| s.len() <= 12000) {
            if STANDARD
                .decode(encoded)
                .is_ok_and(|data| data.len() <= 8192 && data.starts_with(b"\x89PNG\r\n\x1a\n"))
            {
                entry["iconPng"] = json!(encoded);
            }
        }
        clean.push(entry);
    }
    value["apps"] = json!(clean);
    Ok(value)
}
impl Manager {
    fn layout_provider(
        &mut self,
        device: &Device,
        method: &str,
        arg: Option<String>,
    ) -> Result<Value, String> {
        let mut args = vec![
            "-s".into(),
            device.serial.clone(),
            "shell".into(),
            "content".into(),
            "call".into(),
            "--uri".into(),
            URI.into(),
            "--user".into(),
            device.user_id.to_string(),
            "--method".into(),
            method.into(),
        ];
        if let Some(arg) = arg {
            args.extend(["--arg".into(), arg]);
        }
        provider_result(&self.run(args, None, 20)?)
    }
    pub fn execute_launcher(&mut self, request: LauncherRequest) -> Result<Value, String> {
        let device = self.ensure_device(true)?;
        self.read_catalogue(&device)?;
        let component = self
            .state
            .default_home
            .clone()
            .ok_or("无法确认当前默认启动器")?;
        if matches!(request, LauncherRequest::CapturePreview) {
            return self.capture_launcher(&device, &component);
        }
        if component.split('/').next() != Some(PACKAGE) {
            if !matches!(request, LauncherRequest::GetLayout) {
                return Err("当前启动器未接入可验证的布局接口，未修改配置".into());
            }
            return Ok(
                json!({"supported":false,"component":component,"message":"此启动器尚未接入可验证的布局接口，请使用它自身的自定义设置。管理器不会尝试改写未知格式。"}),
            );
        }
        let value = match self.layout_provider(&device, "status", None) {
            Ok(mut value) => {
                value["component"] = json!(component);
                value
            }
            Err(error) => {
                if matches!(request, LauncherRequest::GetLayout) {
                    return Ok(
                        json!({"supported":false,"component":component,"message":format!("当前 pureTV 未开放布局接口或设备限制访问；请安装支持 apps.json 的新版启动器。{error}")}),
                    );
                }
                return Err("无法读取布局接口，未修改启动器配置".into());
            }
        };
        if matches!(request, LauncherRequest::GetLayout) {
            return Ok(value);
        }
        let (method, arg, expected) = match request {
            LauncherRequest::ApplyLayout { layout } => {
                validate_layout(&layout)?;
                (
                    "apply",
                    Some(STANDARD.encode(layout.to_string())),
                    Some(layout),
                )
            }
            LauncherRequest::ResetLayout => ("reset", None, None),
            _ => unreachable!(),
        };
        // Recheck target/user and HOME immediately before writing.
        self.ensure_device(true)?;
        self.read_catalogue(&device)?;
        if self.state.default_home.as_deref() != Some(component.as_str()) {
            return Err("默认启动器已改变，请重新读取布局".into());
        }
        self.defer_cancel = true;
        let result = (|| {
            let returned = self.layout_provider(&device, method, arg)?;
            if expected
                .as_ref()
                .is_some_and(|layout| &returned["layout"] != layout)
                || (method == "reset" && returned["custom"] != false)
            {
                return Err("启动器未确认预期布局，请重新读取核对".into());
            }
            let reread = self.layout_provider(&device, "status", None)?;
            if returned["layout"] != reread["layout"] {
                return Err("布局写入后复查不一致".into());
            }
            let mut reread = reread;
            reread["component"] = json!(component);
            reread["message"] = json!(if method == "reset" {
                "默认布局已恢复并复查"
            } else {
                "布局已应用并复查"
            });
            Ok(reread)
        })();
        self.defer_cancel = false;
        self.record(
            "启动器布局",
            &component,
            result.is_ok(),
            if result.is_ok() {
                "布局已应用并复查"
            } else {
                "布局应用失败，请重新读取核对"
            },
        );
        self.state.revision = self.state.revision.saturating_add(1);
        self.persist()?;
        result
    }
    fn capture_launcher(&mut self, device: &Device, component: &str) -> Result<Value, String> {
        if !parse::component(component) {
            return Err("默认启动器组件无效".into());
        }
        // Opening the current HOME is explicit in the UI; this does not change the default.
        self.shell(
            &device.serial,
            &[
                "am",
                "start",
                "-W",
                "-n",
                &parse::component_arg(component),
                "-a",
                "android.intent.action.MAIN",
                "-c",
                "android.intent.category.HOME",
            ],
        )?;
        std::thread::sleep(Duration::from_millis(400));
        let remote = format!("/sdcard/.puretv-manager-preview-{}.png", device.user_id);
        let directory = self.data_dir.join("previews");
        fs::create_dir_all(&directory).map_err(|_| "无法创建截图临时目录")?;
        let path = directory.join(format!(
            "capture-{}.png",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        let result = (|| {
            self.shell(&device.serial, &["screencap", "-p", &remote])?;
            self.run(
                vec![
                    "-s".into(),
                    device.serial.clone(),
                    "pull".into(),
                    remote.clone(),
                    path.to_string_lossy().into_owned(),
                ],
                None,
                20,
            )?;
            let mut bytes = Vec::new();
            fs::File::open(&path)
                .map_err(|_| "无法读取电视截图")?
                .take(8 * 1024 * 1024 + 1)
                .read_to_end(&mut bytes)
                .map_err(|_| "无法读取电视截图")?;
            if bytes.len() > 8 * 1024 * 1024
                || bytes.len() < 24
                || !bytes.starts_with(b"\x89PNG\r\n\x1a\n")
                || &bytes[12..16] != b"IHDR"
            {
                return Err("电视未返回有效的 PNG 截图，或截图超过 8 MiB".into());
            }
            let width = u32::from_be_bytes(bytes[16..20].try_into().unwrap());
            let height = u32::from_be_bytes(bytes[20..24].try_into().unwrap());
            if width == 0
                || height == 0
                || width > 7680
                || height > 7680
                || u64::from(width) * u64::from(height) > 40_000_000
            {
                return Err("截图尺寸无效或过大".into());
            }
            Ok(
                json!({"component":component,"image":format!("data:image/png;base64,{}",STANDARD.encode(&bytes)),"width":width,"height":height,"message":"电视当前桌面截图"}),
            )
        })();
        self.defer_cancel = true;
        let _ = self.shell(&device.serial, &["rm", "-f", &remote]);
        self.defer_cancel = false;
        let _ = fs::remove_file(&path);
        result
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn layout_validation_and_provider_response_are_bounded_and_data_only() {
        let valid: Value = serde_json::from_str(include_str!(
            "../../../launcher/app/src/main/assets/apps.json"
        ))
        .unwrap();
        validate_layout(&valid).unwrap();
        for update in [
            json!({"columns":7}),
            json!({"version":2}),
            json!({"home":[{"packageName":"x;reboot"}]}),
            json!({"home":[{"packageName":"com.example.app","command":"reboot"}]}),
            json!({"home":[{"packageName":"com.example.app","icon":"https://untrusted/icon"}]}),
        ] {
            let mut bad = valid.clone();
            for (key, value) in update.as_object().unwrap() {
                bad[key] = value.clone();
            }
            assert!(validate_layout(&bad).is_err());
        }
        let value = json!({"supported":true,"version":1,"layout":valid,"apps":[]});
        assert_eq!(
            provider_result(&format!(
                "Bundle[{{result={}}}]",
                STANDARD.encode(value.to_string())
            ))
            .unwrap(),
            value
        );
        assert!(provider_result("Permission denial").is_err());
    }
}
