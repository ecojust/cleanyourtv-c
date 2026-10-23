# Desktop bridge contract (implementation)

Tauri command `execute` receives `{ request }` and returns a `Snapshot` (camelCase JSON). Errors reject with a user-facing Chinese string. A separate `cancel` command sets an AtomicBool without taking the service lock; it cancels scanning and skips remaining batch operations; an in-flight mutation finishes and is verified before stopping (completed steps remain recorded). All work runs off the UI thread, serialized by a service Mutex. Browser-only preview uses an explicit demo adapter and never claims a device connection.

Rust core API for the shell:

```rust
pub struct Manager; // persistent state, ADB adapter, current device/catalogue
impl Manager {
  pub fn new(data_dir: std::path::PathBuf, cancel: std::sync::Arc<std::sync::atomic::AtomicBool>) -> Self;
  pub fn execute(&mut self, request: Request) -> Result<Snapshot, String>;
}
```

`Request` uses serde internally tagged `action`, camelCase variant names/fields:

- `getState`
- `setAdbPath { path: string }` (empty = auto discover)
- `connect { host: string, port: number }`
- `pair { host: string, port: number, code: string }` (pairing port, code never persisted)
- `disconnect`
- `scan`
- `setEnabled { packages: string[], enabled: boolean }`
- `uninstall { packages: string[] }` (current user, keep data)
- `restore { packages: string[] }` (install-existing for available packages)
- `install { paths: string[] }` (single APK files, batch sequential)
- `setHome { component: string }`
- `restoreHome`
- `clearHistory`

`Snapshot`:

```ts
interface Snapshot {
  adbPath: string | null;
  adbAvailable: boolean;
  device: Device | null;
  packages: PackageInfo[];
  launchers: LauncherInfo[];
  defaultHome: string | null;
  originalHome: string | null;
  history: HistoryEntry[];
  message: string;
}
interface Device { serial: string; model: string; androidVersion: string; userId: number; status: string; }
// status: device / unauthorized / offline; scan/mutations only for device
interface PackageInfo {
  packageName: string; label: string; system: boolean; enabled: boolean;
  installed: boolean; protectedReason: string | null;
}
// installed=false entries are recoverable candidates, not installed counts.
// Label falls back to packageName; don't fetch all APKs merely to obtain icons/labels.
interface LauncherInfo { component: string; packageName: string; label: string; isDefault: boolean; }
interface HistoryEntry {
  id: string; timestamp: number; action: string; target: string;
  device: string; userId: number; success: boolean; message: string;
}
// timestamp: Unix seconds. History bounded to 200 records, no pairing code or raw shell input.
```

Other Tauri commands:

- `choose_apks` -> `string[]` (native file picker, .apk, multiple)
- `choose_adb` -> `string | null` (native executable file picker)
- `open_resource { resource: "releases" | "platformTools" }` (fixed URL allowlist)

No generic shell/exec command is exposed to the webview. Tauri uses a restrictive local CSP and no remote scripts.

The backend owns validation and protection. On connect, verify devices state and scan only after authorization. Query current user, installed/system/disabled packages and separate `-u` recovery candidates. Protect platform core apps plus current HOME from disable/uninstall, never infer all system apps are removable. Save original HOME before switching, verify the target declares HOME, and verify resulting default. Confirmations in the UI list the actual selected targets, current serial/user and operation; no destructive selection defaults.

Batches are bounded, serial and independently recorded; no success claims from exit status alone. Remote shell arguments must be strictly validated. Paths to local APKs are passed as process arguments. Use explicit `-s SERIAL`, process timeout/output limit, and recheck the connected user's identity before mutation. Persist configured ADB path, original HOME per device/user and bounded history; do not persist pairing codes or APK contents.
