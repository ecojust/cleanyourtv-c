export interface Device { serial: string; model: string; androidVersion: string; userId: number; status: string }
export interface PackageInfo { apkSizeBytes?: number | null; packageName: string; label: string; system: boolean; enabled: boolean; installed: boolean; protectedReason: string | null }
export interface LauncherInfo { component: string; packageName: string; label: string; isDefault: boolean }
export interface HistoryEntry { id: string; timestamp: number; action: string; target: string; device: string; userId: number; success: boolean; message: string }
export interface PlatformToolsInfo {
  version: string; platform: string; downloadBytes: number; installed: boolean; supported: boolean; message: string;
}
export interface DownloadProgress {
  stage: 'downloading' | 'verifying' | 'extracting' | 'checking'; downloaded: number; total: number;
}
export interface Snapshot {
  revision: number;
  adbPath: string | null; adbAvailable: boolean; device: Device | null;
  packages: PackageInfo[]; launchers: LauncherInfo[]; defaultHome: string | null;
  originalHome: string | null; history: HistoryEntry[]; message: string;
}
export type Request =
  | { action: 'getState' | 'disconnect' | 'scan' | 'restoreHome' | 'clearHistory' }
  | { action: 'setAdbPath'; path: string }
  | { action: 'connect'; host: string; port: number }
  | { action: 'pair'; host: string; port: number; code: string }
  | { action: 'setEnabled'; packages: string[]; enabled: boolean }
  | { action: 'uninstall' | 'restore'; packages: string[] }
  | { action: 'install'; paths: string[] }
  | { action: 'setHome'; component: string };
export const emptySnapshot = (): Snapshot => ({ revision: 0, adbPath: null, adbAvailable: false, device: null, packages: [], launchers: [], defaultHome: null, originalHome: null, history: [], message: '' });
export interface LayoutEntry { action?: string; packageName?: string; label?: string; icon?: string; color?: string }
export interface LauncherLayout { version: 1; columns: number; home: LayoutEntry[]; apps: LayoutEntry[] }
export interface LauncherLayoutInfo { supported: boolean; component?: string; message?: string; custom?: boolean; layout?: LauncherLayout; apps?: {packageName: string; label: string; iconPng?: string}[] }
export interface LauncherPreview { component: string; image: string; width: number; height: number; message: string }
export type LauncherRequest = { action:'getLayout'|'resetLayout'|'capturePreview' } | { action:'applyLayout'; layout: LauncherLayout };
