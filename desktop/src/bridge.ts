import { invoke } from '@tauri-apps/api/core';
import { emptySnapshot, type Snapshot, type Request } from './types';

export const demo = new URLSearchParams(location.search).get('demo') === '1';
export const desktop = '__TAURI_INTERNALS__' in window;
const unavailable = '浏览器预览不能连接电视，请运行 pureTV 桌面应用。';
const sample = emptySnapshot();
if (demo) {
  sample.adbAvailable = true;
  sample.adbPath = '演示 / platform-tools / adb';
  sample.device = { serial: '192.168.1.50:5555', model: '客厅电视', androidVersion: '12', userId: 0, status: 'device' };
  sample.packages = [
    { packageName: 'com.ecojust.cleanyourtv', label: 'pureTV', system: false, enabled: true, installed: true, protectedReason: null },
    { packageName: 'com.ecojust.music', label: 'Music TV', system: false, enabled: true, installed: true, protectedReason: null },
    { packageName: 'com.ecojust.webtv', label: 'WebTV', system: false, enabled: true, installed: true, protectedReason: null },
    { packageName: 'com.vendor.recommendations', label: '厂商推荐', system: true, enabled: true, installed: true, protectedReason: null },
    { packageName: 'com.vendor.contentcenter', label: '厂商内容中心', system: true, enabled: false, installed: true, protectedReason: null },
    { packageName: 'com.android.tv.settings', label: '系统设置', system: true, enabled: true, installed: true, protectedReason: '系统设置组件' },
    { packageName: 'com.ecojust.shortvideo', label: 'ShortVideo TV', system: false, enabled: true, installed: true, protectedReason: null },
    { packageName: 'com.vendor.launcher', label: '原厂桌面', system: true, enabled: true, installed: true, protectedReason: '当前默认启动器' },
    { packageName: 'com.vendor.suggestions', label: '内容推荐服务', system: true, enabled: false, installed: false, protectedReason: null },
  ];
  sample.defaultHome = 'com.vendor.launcher/.Home';
  sample.launchers = [
    { component: 'com.vendor.launcher/.Home', packageName: 'com.vendor.launcher', label: '原厂桌面', isDefault: true },
    { component: 'com.ecojust.cleanyourtv/.MainActivity', packageName: 'com.ecojust.cleanyourtv', label: 'pureTV', isDefault: false },
  ];
}
function copy(): Snapshot { return structuredClone(sample); }
function record(action: string, target: string): void {
  sample.history.unshift({ id: crypto.randomUUID(), timestamp: Math.floor(Date.now() / 1000), action, target, device: sample.device?.serial ?? '演示设备', userId: sample.device?.userId ?? 0, success: true, message: '演示结果，未向任何设备发送命令' });
  sample.history = sample.history.slice(0, 200);
}
function protectCurrentHome(): void {
  const pkg = sample.defaultHome?.split('/')[0];
  for (const p of sample.packages) {
    if (p.protectedReason === '当前默认启动器') p.protectedReason = null;
    if (p.packageName === pkg) p.protectedReason = '当前默认启动器';
  }
  for (const l of sample.launchers) l.isDefault = l.component === sample.defaultHome;
}
async function simulate(request: Request): Promise<Snapshot> {
  if (request.action !== 'getState') await new Promise(resolve => setTimeout(resolve, 200));
  if (request.action === 'disconnect') { sample.device = null; sample.packages = []; sample.launchers = []; sample.defaultHome = null; sample.originalHome = null; }
  else if (request.action === 'connect') sample.device = { serial: `${request.host}:${request.port}`, model: '演示电视', androidVersion: '12', userId: 0, status: 'device' };
  else if (request.action === 'setAdbPath') { sample.adbPath = request.path || '演示 / platform-tools / adb'; sample.adbAvailable = true; }
  else if (request.action === 'clearHistory') sample.history = [];
  else if (request.action === 'setEnabled' || request.action === 'uninstall' || request.action === 'restore') {
    for (const pkg of request.packages) {
      const p = sample.packages.find(value => value.packageName === pkg);
      if (!p || p.protectedReason) throw new Error('该应用在演示中受保护');
      if (request.action === 'setEnabled') p.enabled = request.enabled;
      else if (request.action === 'uninstall') p.installed = false;
      else { p.installed = true; p.enabled = true; }
      record(request.action, p.packageName);
    }
  } else if (request.action === 'setHome') {
    sample.originalHome ??= sample.defaultHome; sample.defaultHome = request.component;
    protectCurrentHome(); record('setHome', request.component);
  } else if (request.action === 'restoreHome') {
    if (!sample.originalHome) throw new Error('没有已记录的原桌面');
    sample.defaultHome = sample.originalHome; protectCurrentHome(); record('restoreHome', sample.defaultHome);
  } else if (request.action === 'install') for (const file of request.paths) record('install', file);
  sample.message = request.action === 'getState' ? '' : '演示操作完成，未连接真实设备';
  return copy();
}
export async function execute(request: Request): Promise<Snapshot> {
  if (demo) return simulate(request);
  if (!desktop) {
    if (request.action === 'getState') return { ...emptySnapshot(), message: unavailable };
    throw new Error(unavailable);
  }
  return invoke<Snapshot>('execute', { request });
}
export async function cancel(): Promise<void> { if (demo) return; if (!desktop) throw new Error(unavailable); await invoke('cancel'); }
export async function chooseApks(): Promise<string[]> {
  if (demo) return ['C:\\Applications\\pureTV-0.1.5.apk'];
  if (!desktop) throw new Error(unavailable);
  return invoke<string[]>('choose_apks');
}
export async function chooseAdb(): Promise<string | null> {
  if (demo) return 'C:\\platform-tools\\adb.exe';
  if (!desktop) throw new Error(unavailable);
  return invoke<string | null>('choose_adb');
}
export async function openResource(resource: 'releases' | 'platformTools'): Promise<void> {
  if (demo || !desktop) {
    const url = resource === 'releases' ? 'https://github.com/ecojust/pureTV/releases/latest' : 'https://developer.android.com/tools/releases/platform-tools';
    window.open(url, '_blank', 'noopener,noreferrer'); return;
  }
  await invoke('open_resource', { resource });
}
