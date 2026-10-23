//! A small, GUI-independent ADB manager. All device mutations are scoped to a
//! verified serial and Android user. No arbitrary shell execution is exposed.
mod adb;
mod manager;
mod parse;

pub use manager::Manager;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(
    tag = "action",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Request {
    GetState,
    SetAdbPath {
        path: String,
    },
    Connect {
        host: String,
        port: u16,
    },
    Pair {
        host: String,
        port: u16,
        code: String,
    },
    Disconnect,
    Scan,
    SetEnabled {
        packages: Vec<String>,
        enabled: bool,
    },
    Uninstall {
        packages: Vec<String>,
    },
    Restore {
        packages: Vec<String>,
    },
    Install {
        paths: Vec<String>,
    },
    SetHome {
        component: String,
    },
    RestoreHome,
    ClearHistory,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub adb_path: Option<String>,
    pub adb_available: bool,
    pub device: Option<Device>,
    pub packages: Vec<PackageInfo>,
    pub launchers: Vec<LauncherInfo>,
    pub default_home: Option<String>,
    pub original_home: Option<String>,
    pub history: Vec<HistoryEntry>,
    pub message: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub serial: String,
    pub model: String,
    pub android_version: String,
    pub user_id: u32,
    pub status: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageInfo {
    pub package_name: String,
    pub label: String,
    pub system: bool,
    pub enabled: bool,
    pub installed: bool,
    pub protected_reason: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherInfo {
    pub component: String,
    pub package_name: String,
    pub label: String,
    pub is_default: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub timestamp: u64,
    pub action: String,
    pub target: String,
    pub device: String,
    pub user_id: u32,
    pub success: bool,
    pub message: String,
}
