use std::collections::BTreeSet;
use std::net::IpAddr;

pub(crate) fn package(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 255
        && value.split('.').all(|part| {
            !part.is_empty()
                && part.as_bytes()[0].is_ascii_alphabetic()
                && part.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
        })
}
pub(crate) fn component(value: &str) -> bool {
    let Some((pkg, class)) = value.split_once('/') else {
        return false;
    };
    package(pkg)
        && !class.is_empty()
        && class.len() <= 512
        && class
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'$'))
        && class.bytes().any(|b| b.is_ascii_alphabetic())
}
/// Match Android ComponentName.unflattenFromString: a leading dot is
/// relative to the package. Shell query variants may use either spelling.
pub(crate) fn normalize_component(value: &str) -> Option<String> {
    if !component(value) {
        return None;
    }
    let (pkg, class) = value.split_once('/')?;
    Some(if class.starts_with('.') {
        format!("{pkg}/{pkg}{class}")
    } else {
        value.to_string()
    })
}
pub(crate) fn component_arg(value: &str) -> String {
    // ADB assembles remote shell arguments. Dollar signs in Android nested class
    // names must remain literal even though the local process uses argv arrays.
    format!("'{value}'")
}
pub(crate) fn endpoint(host: &str, port: u16) -> Result<String, String> {
    let host = host.trim();
    if port == 0 || host.is_empty() || host.len() > 253 {
        return Err("请输入有效的电视 IP／主机名和端口".into());
    }
    let normalized = host
        .strip_prefix('[')
        .and_then(|s| s.strip_suffix(']'))
        .unwrap_or(host);
    if let Ok(ip) = normalized.parse::<IpAddr>() {
        return Ok(match ip {
            IpAddr::V4(_) => format!("{ip}:{port}"),
            IpAddr::V6(_) => format!("[{ip}]:{port}"),
        });
    }
    if host.split('.').any(|part| {
        part.is_empty()
            || part.len() > 63
            || part.starts_with('-')
            || part.ends_with('-')
            || !part.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
    }) {
        return Err("电视地址只能是 IP 或有效主机名，不能包含命令字符".into());
    }
    Ok(format!("{host}:{port}"))
}
pub(crate) fn packages(output: &str) -> Result<BTreeSet<String>, String> {
    let mut values = BTreeSet::new();
    for line in output.lines().map(str::trim).filter(|s| !s.is_empty()) {
        let Some(name) = line.strip_prefix("package:") else {
            return Err(format!("无法识别应用列表：{}", short(line, 160)));
        };
        if !package(name) {
            return Err("设备返回了无效包名".into());
        }
        values.insert(name.to_string());
        if values.len() > 10000 {
            return Err("设备应用数量超过 10,000 项上限".into());
        }
    }
    Ok(values)
}
pub(crate) fn components(output: &str) -> Vec<String> {
    let mut values = BTreeSet::new();
    for line in output.lines().map(str::trim) {
        if let Some(value) = normalize_component(line) {
            values.insert(value);
        }
    }
    values.into_iter().collect()
}
pub(crate) fn default_home(output: &str) -> Option<String> {
    components(output)
        .into_iter()
        .find(|value| !value.contains("ResolverActivity") && !value.contains("ChooserActivity"))
}
pub(crate) fn devices(output: &str) -> Vec<(String, String)> {
    output
        .lines()
        .filter_map(|line| {
            let mut items = line.split_whitespace();
            let serial = items.next()?;
            let state = items.next()?;
            if matches!(state, "device" | "offline" | "unauthorized") {
                Some((serial.to_string(), state.to_string()))
            } else {
                None
            }
        })
        .collect()
}
pub(crate) fn short(value: &str, count: usize) -> String {
    value.chars().take(count).collect()
}
pub(crate) fn label(pkg: &str) -> String {
    match pkg {
        "com.ecojust.cleanyourtv" => "pureTV",
        "com.ecojust.music" => "Music TV",
        "com.ecojust.shortvideo" => "ShortVideo TV",
        "com.ecojust.webtv" => "WebTV",
        "com.gathin.tvhome" => "CleanYourTV",
        "com.android.tv.settings" | "com.android.settings" => "系统设置",
        "com.android.systemui" => "系统界面",
        "com.google.android.tvlauncher" => "Android TV 桌面",
        "com.google.android.apps.tv.launcherx" => "Google TV 桌面",
        _ => pkg,
    }
    .to_string()
}
pub(crate) fn core_package(pkg: &str) -> bool {
    matches!(
        pkg,
        "android"
            | "com.android.systemui"
            | "com.android.settings"
            | "com.android.tv.settings"
            | "com.android.providers.settings"
            | "com.android.permissioncontroller"
            | "com.google.android.permissioncontroller"
            | "com.android.packageinstaller"
            | "com.google.android.packageinstaller"
            | "com.android.providers.downloads"
            | "com.android.providers.media"
            | "com.android.providers.media.module"
            | "com.android.externalstorage"
            | "com.android.shell"
            | "com.android.providers.telephony"
            | "com.android.phone"
            | "com.google.android.gms"
            | "com.google.android.gsf"
            | "com.android.networkstack"
            | "com.google.android.networkstack"
            | "com.android.inputmethod.latin"
            | "com.google.android.inputmethod.latin"
            | "com.google.android.inputmethod.latin.tv"
            | "com.android.bluetooth"
            | "com.android.documentsui"
    )
}
