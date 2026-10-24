import './styles.css';
import * as api from './bridge';
import { emptySnapshot, type Request, type PackageInfo, type PlatformToolsInfo, type DownloadProgress } from './types';

type Page = 'connect' | 'apps' | 'launchers' | 'install' | 'history';
type Filter = 'all' | 'system' | 'user' | 'disabled' | 'recoverable';
const pages: Record<Page, [string, string, string]> = {
  connect: ['设备连接', '连接电视，开始管理你的应用和桌面', 'monitor'],
  apps: ['应用管理', '查看电视中的应用，按需停用或恢复', 'grid'],
  launchers: ['启动器', '选择电视的默认桌面，随时回到原来的启动器', 'home'],
  install: ['安装应用', '添加本地安装包，选择后安装到当前电视', 'download'],
  history: ['操作记录', '逐项查看操作结果，确认电视上的实际变化', 'list'],
};
let snapshot = emptySnapshot();
let mcpInfo: api.McpInfo | null = null, mcpError = "";
let page: Page = api.demo ? 'apps' : 'connect';
let filter: Filter = 'all', query = '', busy = false, busyLabel = '', cancelling = false;
let notice = '', noticeKind: 'info' | 'success' | 'error' = 'info';
let host = api.demo ? '192.168.1.50' : '', port = '5555', pairHost = '', pairPort = '', pairCode = '', adbPath = '';
let selected = new Set<string>();
let apkPaths: string[] = [], selectedApks = new Set<string>();
let toolsInfo: PlatformToolsInfo | null = null, toolsInfoError = '', toolsPreparing = false, downloadingTools = false;
let toolsProgress: DownloadProgress | null = null;
const root = document.querySelector<HTMLDivElement>('#app')!;
const dialog = document.createElement('dialog');
dialog.className = 'modal'; document.body.append(dialog);
const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const disabled = (value: boolean): string => value ? ' disabled' : '';
const online = (): boolean => snapshot.device?.status === 'device';
const available = (): boolean => (api.desktop || api.demo) && snapshot.adbAvailable;
const fileName = (path: string): string => path.split(/[\\/]/).pop() || path;
function icon(name: string): string {
  const paths: Record<string, string> = {
    monitor: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    home: '<path d="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    list: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    search: '<circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/>',
    refresh: '<path d="M20 7a9 9 0 0 0-15-2L2 8m0-6v6h6M4 17a9 9 0 0 0 15 2l3-3m0 6v-6h-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    link: '<path d="m10 13 4-4m-6 8-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2-1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(1 -1)"/>',
    settings: '<path d="m10 3-1 3-3 1-3-1-1 3 2 2v3l-2 2 2 3 3-1 3 1 1 3h3l1-3 3-1 3 1 1-3-2-2v-3l2-2-2-3-3 1-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    box: '<path d="m3 7 9-4 9 4v10l-9 4-9-4Zm0 0 9 4 9-4M12 11v10"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  };
  return `<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.box}</svg>`;
}
function actionButton(act: string, label: string, options = '', cls = ''): string { return `<button type="button" data-act="${act}" class="${cls}"${options}>${label}</button>`; }
function deviceStatus(): [string, string] {
  if (!snapshot.device) return ['未连接电视', 'muted'];
  if (online()) return [snapshot.device.model || snapshot.device.serial, 'good'];
  return [snapshot.device.status === 'unauthorized' ? '等待电视授权' : '设备离线', 'warn'];
}
function showNotice(message: string, kind: typeof noticeKind = 'info'): void { notice = message; noticeKind = kind; render(); }
const bytes = (value: number): string => `${(Math.max(0, value) / 1048576).toFixed(1)} MiB`;
const platformName = (value: string): string => ({ windows: 'Windows', macos: 'macOS', linux: 'Linux', demo: '演示电脑' }[value] || '当前电脑');
function progressText(): string {
  if (!toolsProgress) return '准备官方 Platform Tools…';
  const labels = { downloading: '正在下载', verifying: '校验下载文件', extracting: '解压工具', checking: '检查 ADB 并配置路径' };
  if (toolsProgress.stage !== 'downloading') return labels[toolsProgress.stage];
  const total = toolsProgress.total, downloaded = Math.min(Math.max(0, toolsProgress.downloaded), total);
  return total > 0 ? `${labels.downloading} ${Math.floor(downloaded / total * 100)}% · ${bytes(downloaded)} / ${bytes(total)}` : labels.downloading;
}
function busyIndicator(): string {
  if (!busy) return '';
  const label = downloadingTools ? progressText() : busyLabel;
  const cancellingLabel = downloadingTools ? ' · 正在取消并清理临时文件' : ' · 当前修改会完成并复查，后续项将停止';
  return `<div class="busy-bar" role="status"><span class="spinner"></span><span data-busy-label>${esc(label)}${cancelling ? cancellingLabel : ''}</span>${downloadingTools ? downloadMeter() : ''}${actionButton('cancel', cancelling ? '正在取消' : downloadingTools ? '取消下载' : '停止后续操作', disabled(cancelling), 'small')}</div>`;
}
function downloadMeter(): string {
  if (!toolsProgress || toolsProgress.stage !== 'downloading' || toolsProgress.total <= 0) return '';
  const value = Math.min(Math.max(0, toolsProgress.downloaded), toolsProgress.total);
  return `<progress class="download-meter" max="${toolsProgress.total}" value="${value}" aria-label="Platform Tools 下载进度"></progress>`;
}
function mcpPanel(): string {
  if (!api.desktop || api.demo) return '';
  return `<section class="panel"><h2>MCP · Agent 调试</h2><p>Agent 可操作当前窗口的全部电视管理功能，状态和结果同步显示。</p>${mcpInfo ? `<p class="hint">保持管理器打开，将以下配置加入 Agent 的 MCP 设置：</p><pre class="mcp-config" tabindex="0">${esc(JSON.stringify(mcpInfo.config, null, 2))}</pre><p class="hint">仅本机连接；关闭管理器后停止服务。操作沿用设备保护规则，批量结果请查看操作记录。</p>` : `<p class="hint">${esc(mcpError || '正在读取 MCP 配置…')}</p>`}</section>`;
}
function adbPanel(): string {
  const unavailable = busy || toolsPreparing || (!api.desktop && !api.demo), connected = !!snapshot.device;
  const installLabel = toolsPreparing ? '读取工具信息…' : toolsInfo?.installed ? '使用已下载 ADB' : '下载并配置 ADB';
  const detail = toolsInfo ? toolsInfo.supported ? `Platform Tools ${toolsInfo.version} · ${platformName(toolsInfo.platform)} · ${toolsInfo.installed ? '已下载，优先使用本地工具' : `下载 ${bytes(toolsInfo.downloadBytes)}`}` : toolsInfo.message : toolsInfoError || '从 Google 官方下载，完成后自动配置。';
  return `<section class="panel adb-panel"><div class="panel-heading">${icon('settings')}<div><h2>ADB 工具</h2><p>${snapshot.adbAvailable ? '已找到本地工具，可直接连接电视' : '连接电视前，先准备 ADB 工具'}</p></div></div><div class="adb-download"><div class="button-row">${actionButton('download-adb', icon('download') + installLabel, disabled(unavailable || connected || toolsInfo?.supported === false), snapshot.adbAvailable ? '' : 'primary')}</div><p class="hint">${esc(detail)}</p>${connected ? '<p class="hint">请先断开电视，再更换或配置 ADB。</p>' : ''}${api.demo ? '<p class="hint">演示模式仅模拟进度，不会下载文件。</p>' : ''}</div><label class="field-label">已有 ADB 路径<input name="adbPath" placeholder="自动查找，或选择 adb / adb.exe" value="${esc(adbPath || snapshot.adbPath || '')}"${disabled(unavailable || connected)}></label><div class="button-row">${actionButton('choose-adb', '选择 ADB', disabled(unavailable || connected))}${actionButton('save-adb', '应用路径', disabled(unavailable || connected))}${actionButton('auto-adb', '自动查找', disabled(unavailable || connected), 'text-button')}</div>${actionButton('platform-tools', '手动下载官方工具 ↗', '', 'text-button link-button')}<p class="hint">也可选择已解压的 adb.exe（Windows）或 adb（macOS / Linux）。</p></section>`;
}
function shell(): string {
  const [label, status] = deviceStatus();
  return `<aside class="sidebar"><a class="brand" href="#" aria-label="pureTV 电视管理器">pure<span>TV</span></a><p class="brand-caption">电视管理器</p><nav aria-label="主要页面">${(Object.entries(pages) as [Page, [string, string, string]][]).map(([key, data]) => `<button class="nav-item ${page === key ? 'active' : ''}" data-page="${key}" ${page === key ? 'aria-current="page"' : ''}>${icon(data[2])}<span>${data[0]}</span></button>`).join('')}</nav><div class="sidebar-foot">${icon('settings')}<span>本地管理<br><small>无需电视端常驻服务</small></span></div></aside><main><header class="page-header"><div><h1>${pages[page][0]}</h1><p>${pages[page][1]}</p></div><div class="header-actions"><span class="device-badge"><i class="dot ${status}"></i>${esc(label)}</span>${page !== 'connect' ? actionButton('go-connect', icon('link') + '管理连接') : ''}</div></header>${api.demo ? '<div class="banner demo-banner">演示模式 · 示例设备和应用，所有操作仅用于预览，不会连接真实电视。</div>' : !api.desktop ? '<div class="banner warning-banner">这是浏览器预览。请运行桌面应用来连接电视和安装 APK。</div>' : ''}${notice ? `<div class="banner notice ${noticeKind}" role="status"><span>${esc(notice)}</span><button class="icon-button" aria-label="关闭提示" data-act="dismiss">${icon('close')}</button></div>` : ''}${busyIndicator()}<section id="page-content">${content()}</section><footer class="app-footer"><span>pureTV 电视管理器</span><span>${api.demo ? '演示数据 · 不执行 ADB' : snapshot.device ? `目标 ${esc(snapshot.device.serial)} · 用户 ${snapshot.device.userId}` : '选择设备后开始管理'}</span></footer></main>`;
}
function render(): void { root.innerHTML = shell(); updateSelectAll(); }
function content(): string {
  switch (page) {
    case 'connect': return connectionPage() + mcpPanel();
    case 'apps': return appsPage();
    case 'launchers': return launchersPage();
    case 'install': return installPage();
    case 'history': return historyPage();
  }
}
function connectionStrip(): string {
  const [label, status] = deviceStatus();
  return `<div class="connection-strip"><label>电视 IP<input name="host" autocomplete="off" placeholder="192.168.1.50" value="${esc(host)}"${disabled(busy)}></label><label class="port-field">端口<input name="port" inputmode="numeric" maxlength="5" value="${esc(port)}"${disabled(busy)}></label>${actionButton('connect', icon('link') + (snapshot.device ? '重新连接' : '连接电视'), disabled(busy || !available()))}<span class="connection-status"><i class="dot ${status}"></i>${online() ? `已连接 · Android ${esc(snapshot.device?.androidVersion)}` : esc(label)}</span>${snapshot.device ? actionButton('disconnect', '断开', disabled(busy), 'text-button') : '<span class="strip-hint">首次连接请在电视上允许调试</span>'}</div>`;
}
function connectionPage(): string {
  return `${connectionStrip()}<div class="two-columns"><section class="panel"><div class="panel-heading">${icon('monitor')}<div><h2>连接你的电视</h2><p>电视与电脑连接同一网络</p></div></div><ol class="steps"><li><span>1</span><div><strong>开启电视开发者选项</strong><p>在系统设置中找到“关于”，连续点击版本号，再开启 USB 或网络调试。</p></div></li><li><span>2</span><div><strong>输入电视 IP 和调试端口</strong><p>常见端口为 5555；如果电视显示其他端口，以电视上的值为准。</p></div></li><li><span>3</span><div><strong>在电视上允许连接</strong><p>确认电脑的调试授权。连接成功后会扫描当前用户的应用。</p></div></li></ol>${snapshot.device ? `<div class="device-summary"><span>设备</span><strong>${esc(snapshot.device.model || snapshot.device.serial)}</strong><span>地址</span><code>${esc(snapshot.device.serial)}</code><span>当前用户</span><strong>${snapshot.device.userId}</strong><span>状态</span><strong>${esc(deviceStatus()[0])}</strong></div>` : ''}</section><div class="stack">${adbPanel()}<section class="panel"><div class="panel-heading">${icon('link')}<div><h2>无线调试配对</h2><p>仅当电视提供配对码界面时使用</p></div></div><div class="pair-fields"><label class="field-label">IP<input name="pairHost" autocomplete="off" value="${esc(pairHost || host)}" placeholder="电视 IP"${disabled(busy)}></label><label class="field-label">配对端口<input name="pairPort" inputmode="numeric" maxlength="5" value="${esc(pairPort)}" placeholder="配对端口"${disabled(busy)}></label><label class="field-label">配对码<input name="pairCode" type="password" autocomplete="off" inputmode="numeric" maxlength="6" value="${esc(pairCode)}" placeholder="6 位数字"${disabled(busy)}></label></div>${actionButton('pair', '配对设备', disabled(busy || !available()))}<p class="hint">配对完成后，用上方的<strong>调试端口</strong>连接。配对端口与调试端口可能不同。</p></section></div></div>`;
}
const filters: [Filter, string][] = [['all', '全部'], ['system', '系统应用'], ['user', '用户应用'], ['disabled', '已停用'], ['recoverable', '可恢复']];
function inFilter(p: PackageInfo, f: Filter): boolean { return f === 'recoverable' ? !p.installed : p.installed && (f === 'all' || f === 'system' && p.system || f === 'user' && !p.system || f === 'disabled' && !p.enabled); }
function visiblePackages(): PackageInfo[] { const needle = query.trim().toLocaleLowerCase(); return snapshot.packages.filter(p => inFilter(p, filter) && (!needle || `${p.label} ${p.packageName}`.toLocaleLowerCase().includes(needle))); }
function selectedPackages(): PackageInfo[] { return snapshot.packages.filter(p => selected.has(p.packageName)); }
function appIcon(p: PackageInfo): string {
  let color = 'slate', text = (p.label || p.packageName).slice(0, 1).toUpperCase();
  if (p.packageName === 'com.ecojust.cleanyourtv') { color = 'green'; text = 'P'; }
  else if (p.packageName === 'com.ecojust.music') { color = 'rose'; text = '♪'; }
  else if (p.packageName === 'com.ecojust.webtv') { color = 'blue'; text = '▶'; }
  else if (p.packageName === 'com.ecojust.shortvideo') { color = 'charcoal'; text = '▶'; }
  else if (p.system) color = 'violet';
  return `<span class="app-icon ${color}" aria-hidden="true">${p.protectedReason ? icon('shield') : esc(text)}</span>`;
}
function appRows(): string {
  const list = visiblePackages();
  if (!list.length) return `<tr><td colspan="5"><div class="empty-state">${icon(snapshot.device ? 'search' : 'monitor')}<h3>${!online() ? '先连接一台电视' : query ? '没有匹配的应用' : filter === 'recoverable' ? '暂无可恢复的应用' : '暂无应用'}</h3><p>${!online() ? '连接并授权后，即可扫描电视当前用户的应用。' : query ? '试试其他应用名或包名。' : '重新扫描可获取设备上的最新状态。'}</p>${!online() ? actionButton('go-connect', '前往连接', '', 'primary') : ''}</div></td></tr>`;
  return list.map(p => `<tr data-package="${esc(p.packageName)}" class="${selected.has(p.packageName) ? 'selected' : ''}"><td class="check-cell"><input type="checkbox" data-select-package="${esc(p.packageName)}" aria-label="选择 ${esc(p.label)}"${selected.has(p.packageName) ? ' checked' : ''}${disabled(busy || !online() || !!p.protectedReason)}></td><td><div class="app-identity">${appIcon(p)}<div><strong>${esc(p.label || p.packageName)}</strong><code>${esc(p.packageName)}</code></div></div></td><td><span class="type-text">${p.system ? '系统应用' : '用户应用'}</span></td><td><span class="status"><i class="dot ${p.protectedReason ? 'muted' : !p.installed || !p.enabled ? 'muted' : 'good'}"></i>${p.protectedReason ? '受保护' : !p.installed ? '可恢复' : p.enabled ? '正常' : '已停用'}</span></td><td class="row-actions">${actionButton('details', '详情', ` data-pkg="${esc(p.packageName)}"`, 'small')}${!p.protectedReason && (!p.installed || !p.enabled) ? actionButton(p.installed ? 'enable-one' : 'restore-one', p.installed ? '启用' : '恢复', ` data-pkg="${esc(p.packageName)}"${disabled(busy || !online())}`, 'small text-button') : ''}</td></tr>`).join('');
}
function selectionBar(): string {
  const items = selectedPackages(), ready = !busy && online() && items.length > 0 && !items.some(p => p.protectedReason);
  return `<div class="bulk-bar"><strong>已选择 ${items.length} 项</strong>${actionButton('clear-selection', '取消选择', disabled(!items.length || busy))}${actionButton('disable', '停用', disabled(!ready || items.some(p => !p.installed || !p.enabled)), 'primary')}${actionButton('enable', '启用', disabled(!ready || items.some(p => !p.installed || p.enabled)))}${actionButton('uninstall', '为当前用户卸载', disabled(!ready || items.some(p => !p.installed)), 'danger-outline')}${actionButton('restore', '恢复安装', disabled(!ready || items.some(p => p.installed)))}<p>操作前会列出所选应用；已完成的操作可在记录中查看。</p></div>`;
}
function appsPage(): string {
  return `${connectionStrip()}<section class="panel app-panel"><div class="apps-toolbar"><label class="search">${icon('search')}<input name="search" aria-label="搜索应用名称或包名" value="${esc(query)}" placeholder="搜索应用名称或包名"></label><div class="toolbar-buttons">${actionButton('scan', icon('refresh') + '重新扫描', disabled(busy || !online()))}${actionButton('go-install', icon('plus') + '添加安装包', disabled(busy), 'primary')}</div></div><div class="filter-tabs" aria-label="应用分类">${filters.map(([f, label]) => `<button data-filter="${f}" class="${filter === f ? 'active' : ''}" aria-pressed="${filter === f}">${label}<span>${snapshot.packages.filter(p => inFilter(p, f)).length}</span></button>`).join('')}</div><div class="table-scroll"><table class="apps-table"><thead><tr><th class="check-cell"><input type="checkbox" data-select-all aria-label="选择当前列表中可操作的应用"${disabled(busy || !online() || !visiblePackages().some(p => !p.protectedReason))}></th><th>应用</th><th>类型</th><th>状态</th><th>操作</th></tr></thead><tbody id="app-rows">${appRows()}</tbody></table></div><div id="list-count" class="list-count">显示 ${visiblePackages().length} / ${snapshot.packages.filter(p => inFilter(p, filter)).length} 个应用</div><div id="selection-bar">${selectionBar()}</div></section><p class="hint">名称无法读取时显示完整包名。系统应用“卸载”仅针对当前用户，不会删除系统分区中的安装包。</p>`;
}
function launchersPage(): string {
  return `${connectionStrip()}<div class="section-title"><div><h2>已安装的启动器</h2><p>选择具备电视首页入口的应用作为默认桌面。</p></div><div class="button-row">${actionButton('scan', icon('refresh') + '重新扫描', disabled(busy || !online()))}${actionButton('add-launcher', icon('plus') + '添加启动器 APK', disabled(busy), 'primary')}</div></div><div class="launcher-grid">${snapshot.launchers.length ? snapshot.launchers.map(l => `<article class="panel launcher-card ${l.isDefault ? 'current' : ''}"><div class="launcher-top"><span class="large-icon">${icon('home')}</span>${l.isDefault ? '<span class="pill">当前默认桌面</span>' : ''}</div><h3>${esc(l.label || l.packageName)}</h3><code>${esc(l.component)}</code>${actionButton('set-home', l.isDefault ? '正在使用' : '设为默认桌面', ` data-component="${esc(l.component)}"${disabled(busy || !online() || l.isDefault)}`, l.isDefault ? '' : 'primary')}</article>`).join('') : `<section class="panel empty-state">${icon('home')}<h3>${online() ? '未查询到启动器' : '连接后查看启动器'}</h3><p>连接电视并扫描，即可选择已安装的桌面。</p></section>`}</div><section class="panel restore-panel"><div><h2>恢复原桌面</h2><p>${snapshot.originalHome ? esc(snapshot.originalHome) : '首次切换前会记录原来的默认桌面。'}</p></div>${actionButton('restore-home', '恢复原桌面', disabled(busy || !online() || !snapshot.originalHome || snapshot.originalHome === snapshot.defaultHome))}</section><p class="hint">安装自定义启动器后会刷新列表。部分电视固件限制更换默认桌面，工具会复查实际结果。</p>`;
}
function installPage(): string {
  return `${connectionStrip()}<section class="panel install-panel"><div class="section-title"><div><h2>待安装的 APK</h2><p>从电脑导入安装包，勾选要安装的文件；添加不会立即安装。</p></div>${actionButton('add-apks', icon('plus') + '添加安装包', disabled(busy || (!api.desktop && !api.demo)), 'primary')}</div>${apkPaths.length ? `<div class="apk-list">${apkPaths.map(path => `<div class="apk-item" data-apk="${esc(path)}"><input type="checkbox" data-select-apk="${esc(path)}" aria-label="选择 ${esc(fileName(path))}"${selectedApks.has(path) ? ' checked' : ''}${disabled(busy)}><span class="large-icon">${icon('box')}</span><div class="apk-name"><strong>${esc(fileName(path))}</strong><code>${esc(path)}</code></div>${actionButton('remove-apk', '移除', ` data-path="${esc(path)}"${disabled(busy)}`, 'text-button')}</div>`).join('')}</div>` : `<div class="empty-state upload-state">${icon('download')}<h3>添加你自己的安装包</h3><p>支持多次添加和多选 APK。移除列表项不会删除电脑文件。</p>${actionButton('add-apks', '选择本地 APK', disabled(busy || (!api.desktop && !api.demo)))}</div>`}<div class="install-footer"><span>共 ${apkPaths.length} 个文件 · 已选择 ${selectedApks.size} 个</span><div class="button-row">${actionButton('select-apks', '全选', disabled(busy || !apkPaths.length))}${actionButton('clear-apks-selection', '取消选择', disabled(busy || !selectedApks.size))}${actionButton('install-apks', '安装所选', disabled(busy || !online() || !selectedApks.size), 'primary')}</div></div></section><div class="two-columns install-notes"><section class="panel"><h2>获取 pureTV 应用</h2><p>启动器、Music TV、ShortVideo TV 和 WebTV 可分别下载安装。</p>${actionButton('releases', '打开官方下载页 ↗', '', 'text-button link-button')}</section><section class="panel"><h2>安装说明</h2><p>首版支持单个 APK 文件，可批量顺序安装多个应用。分包应用（APKS / XAPK）需使用其他安装方式。</p><p class="hint">同包名升级需签名一致。安装结束后会更新应用列表。</p></section></div>`;
}
const actionNames: Record<string, string> = { setEnabled: '更改启用状态', disable: '停用', enable: '启用', uninstall: '当前用户卸载', restore: '恢复安装', install: '安装 APK', setHome: '切换桌面', restoreHome: '恢复桌面', connect: '连接设备', pair: '配对设备', scan: '扫描应用', disconnect: '断开连接' };
function historyPage(): string {
  return `<div class="section-title"><div><h2>最近的操作</h2><p>最多保留 200 条记录。每条记录包含执行设备、用户和结果。</p></div>${actionButton('clear-history', '清空记录', disabled(busy || !snapshot.history.length))}</div><section class="panel history-panel">${snapshot.history.length ? `<div class="table-scroll"><table><thead><tr><th>时间 / 操作</th><th>目标</th><th>结果</th></tr></thead><tbody>${snapshot.history.map(h => `<tr><td><strong>${esc(actionNames[h.action] || h.action)}</strong><span class="secondary">${esc(new Date(h.timestamp * 1000).toLocaleString())}</span></td><td><code class="history-target">${esc(h.target)}</code><span class="secondary">${esc(h.device)} · 用户 ${h.userId}</span></td><td><span class="status"><i class="dot ${h.success ? 'good' : 'bad'}"></i>${h.success ? '完成' : '未完成'}</span><p class="history-message">${esc(h.message)}</p></td></tr>`).join('')}</tbody></table></div>` : `<div class="empty-state">${icon('list')}<h3>还没有操作记录</h3><p>应用安装、停用、卸载和桌面切换的结果会显示在这里。</p></div>`}</section><p class="hint">需要恢复应用时，在应用管理的“已停用”或“可恢复”分类中选择目标操作。</p>`;
}
function updateSelectAll(): void {
  const box = root.querySelector<HTMLInputElement>('[data-select-all]'); if (!box) return;
  const eligible = visiblePackages().filter(p => !p.protectedReason);
  const count = eligible.filter(p => selected.has(p.packageName)).length;
  box.checked = eligible.length > 0 && count === eligible.length; box.indeterminate = count > 0 && count < eligible.length;
}
function updateList(): void {
  const focused = document.activeElement as HTMLElement | null;
  const focusPackage = focused?.dataset.selectPackage;
  const focusAll = focused?.hasAttribute('data-select-all');
  const rows = document.querySelector('#app-rows'); if (rows) rows.innerHTML = appRows();
  const count = document.querySelector('#list-count'); if (count) count.textContent = `显示 ${visiblePackages().length} / ${snapshot.packages.filter(p => inFilter(p, filter)).length} 个应用`;
  const bar = document.querySelector('#selection-bar'); if (bar) bar.innerHTML = selectionBar();
  updateSelectAll();
  if (focusPackage) Array.from(root.querySelectorAll<HTMLInputElement>('[data-select-package]')).find(input => input.dataset.selectPackage === focusPackage)?.focus();
  else if (focusAll) root.querySelector<HTMLInputElement>('[data-select-all]')?.focus();
}
function cleanSelection(): void {
  const valid = new Set(snapshot.packages.filter(p => !p.protectedReason).map(p => p.packageName));
  selected = new Set([...selected].filter(p => valid.has(p)));
}
async function run(request: Request, label: string): Promise<boolean> {
  if (busy) return false; busy = true; cancelling = false; busyLabel = label; notice = ''; render();
  let success = false;
  try {
    const before = snapshot.device?.serial, previousEntries = new Set(snapshot.history.map(entry => entry.id));
    snapshot = await api.execute(request);
    if (before !== snapshot.device?.serial) selected.clear(); cleanSelection();
    const failed = snapshot.history.some(entry => !previousEntries.has(entry.id) && !entry.success);
    const unready = request.action === 'connect' && !online();
    notice = snapshot.message;
    noticeKind = failed ? 'error' : cancelling || unready ? 'info' : 'success';
    success = !failed && !cancelling && !unready;
    if (request.action === 'connect' && online()) page = 'apps';
    if (request.action === 'setAdbPath') adbPath = snapshot.adbPath || '';
  } catch (e) {
    notice = e instanceof Error ? e.message : String(e); noticeKind = 'error';
    try { const previousDevice = snapshot.device?.serial; snapshot = await api.execute({ action: 'getState' }); if (previousDevice !== snapshot.device?.serial) selected.clear(); cleanSelection(); } catch { /* Keep the last known snapshot if state refresh also fails. */ }
  } finally { busy = false; cancelling = false; render(); }
  return success;
}
function confirm(title: string, description: string, targets: string[], button: string, danger = false): Promise<boolean> {
  if (dialog.open) dialog.close();
  dialog.innerHTML = `<div class="modal-heading"><h2>${esc(title)}</h2><button class="icon-button" data-act="close-dialog" aria-label="关闭">${icon('close')}</button></div><p>${esc(description)}</p>${snapshot.device ? `<div class="target-device">目标电视：<strong>${esc(snapshot.device.model || snapshot.device.serial)}</strong><br><code>${esc(snapshot.device.serial)}</code> · 当前用户 ${snapshot.device.userId}</div>` : ''}<ul class="target-list">${targets.map(t => `<li>${esc(t)}</li>`).join('')}</ul><div class="modal-actions">${actionButton('close-dialog', '取消')}<button id="confirm-operation" class="${danger ? 'danger' : 'primary'}">${esc(button)}</button></div>`;
  dialog.setAttribute('aria-label', title); dialog.returnValue = ''; dialog.showModal(); dialog.querySelector<HTMLButtonElement>('[data-act="close-dialog"]')?.focus();
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirmed'), { once: true });
    dialog.querySelector<HTMLButtonElement>('#confirm-operation')!.onclick = () => dialog.close('confirmed');
  });
}
async function refreshToolsInfo(): Promise<void> {
  if (!api.desktop && !api.demo) return;
  try { toolsInfo = await api.platformToolsInfo(); toolsInfoError = ''; }
  catch (error) { toolsInfoError = `暂时无法读取下载信息：${error instanceof Error ? error.message : String(error)}`; }
}
function confirmTools(info: PlatformToolsInfo): Promise<boolean> {
  if (dialog.open) dialog.close();
  const title = info.installed ? '使用已下载的 ADB' : '下载官方 Platform Tools';
  dialog.innerHTML = `<div class="modal-heading"><h2>${title}</h2><button class="icon-button" data-act="close-dialog" aria-label="关闭">${icon('close')}</button></div><p>${info.installed ? '优先验证并使用已下载工具；校验失败时会重新下载并修复；Google 不可用时自动尝试腾讯镜像。' : '优先从 Google 官方下载，失败时自动尝试腾讯镜像；校验并解压到本应用的数据目录后自动配置 ADB。'}</p><dl><dt>版本</dt><dd>${esc(info.version)}</dd><dt>适用系统</dt><dd>${esc(platformName(info.platform))}</dd><dt>下载大小</dt><dd>${info.installed ? `缓存完整时 0 MiB；需修复时 ${bytes(info.downloadBytes)}` : bytes(info.downloadBytes)}</dd><dt>来源</dt><dd>Google · dl.google.com<br>备用：腾讯镜像 · mirrors.cloud.tencent.com<br>所有来源均核对官方文件大小和 SHA256</dd></dl>${api.demo ? '<p>演示模式：仅模拟此流程，不下载文件。</p>' : ''}${actionButton('platform-tools-license', '阅读 Android SDK 许可协议 ↗', '', 'text-button link-button')}<label class="license-consent"><input type="checkbox" id="platform-tools-license"><span>我已阅读并同意 Android SDK 许可协议</span></label><div class="modal-actions">${actionButton('close-dialog', '取消')}<button id="confirm-platform-tools" class="primary" disabled>${info.installed ? '验证并使用' : '确认下载'}</button></div>`;
  dialog.setAttribute('aria-label', title); dialog.returnValue = ''; dialog.showModal();
  const consent = dialog.querySelector<HTMLInputElement>('#platform-tools-license')!;
  const accept = dialog.querySelector<HTMLButtonElement>('#confirm-platform-tools')!;
  consent.onchange = () => { accept.disabled = !consent.checked; };
  dialog.querySelector<HTMLButtonElement>('[data-act="close-dialog"]')?.focus();
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirmed'), { once: true });
    accept.onclick = () => { if (consent.checked) dialog.close('confirmed'); };
  });
}
function updateToolsProgress(progress: DownloadProgress): void {
  if (!downloadingTools) return;
  toolsProgress = progress;
  const bar = root.querySelector<HTMLDivElement>('.busy-bar');
  if (!bar) return;
  const label = bar.querySelector<HTMLElement>('[data-busy-label]');
  if (label) label.textContent = progressText() + (cancelling ? ' · 正在取消并清理临时文件' : '');
  const meter = bar.querySelector<HTMLProgressElement>('progress');
  if (progress.stage === 'downloading' && progress.total > 0) {
    if (meter) { meter.max = progress.total; meter.value = Math.min(Math.max(0, progress.downloaded), progress.total); }
    else bar.querySelector('button')?.insertAdjacentHTML('beforebegin', downloadMeter());
  } else meter?.remove();
}
async function downloadTools(): Promise<void> {
  if (busy || toolsPreparing || snapshot.device || (!api.desktop && !api.demo)) return;
  toolsPreparing = true; render();
  let info: PlatformToolsInfo;
  try { info = await api.platformToolsInfo(); toolsInfo = info; toolsInfoError = ''; }
  finally { toolsPreparing = false; render(); }
  if (!info.supported) throw new Error(info.message || '当前电脑不支持在线配置，请手动选择 ADB');
  if (!await confirmTools(info) || busy || snapshot.device) return;
  busy = true; downloadingTools = true; cancelling = false; notice = '';
  toolsProgress = { stage: info.installed ? 'checking' : 'downloading', downloaded: 0, total: info.downloadBytes }; render();
  try {
    const value = await api.installPlatformTools(updateToolsProgress);
    if (!value.adbAvailable || !value.adbPath) throw new Error('工具尚未就绪，请重试或手动选择 ADB');
    snapshot = value; adbPath = value.adbPath; toolsInfo = { ...info, installed: true };
    notice = value.message || 'ADB 已就绪，可以连接电视'; noticeKind = cancelling ? 'info' : 'success';
  } catch (error) {
    notice = error instanceof Error ? error.message : String(error);
    noticeKind = cancelling ? 'info' : 'error';
    try { snapshot = await api.execute({ action: 'getState' }); adbPath = snapshot.adbPath || ''; } catch { /* Retain last known state if refresh fails. */ }
  } finally {
    downloadingTools = false; busy = false; cancelling = false; toolsProgress = null; render();
  }
}
function details(pkg: string): void {
  const p = snapshot.packages.find(p => p.packageName === pkg); if (!p) return;
  if (dialog.open) dialog.close();
  dialog.innerHTML = `<div class="modal-heading"><h2>应用详情</h2><button class="icon-button" data-act="close-dialog" aria-label="关闭">${icon('close')}</button></div><div class="detail-identity">${appIcon(p)}<h3>${esc(p.label)}</h3></div><dl><dt>包名</dt><dd><code>${esc(p.packageName)}</code></dd><dt>类型</dt><dd>${p.system ? '系统应用' : '用户应用'}</dd><dt>当前用户状态</dt><dd>${!p.installed ? '未安装，可尝试恢复' : p.enabled ? '已安装，已启用' : '已安装，已停用'}</dd>${p.protectedReason ? `<dt>保护原因</dt><dd>${esc(p.protectedReason)}</dd>` : ''}</dl><p class="hint">名称无法读取时以包名显示；操作前请确认具体应用。</p><div class="modal-actions">${actionButton('close-dialog', '关闭')}</div>`;
  dialog.setAttribute('aria-label', '应用详情'); dialog.showModal();
}
function checkedPackages(kind: 'disable' | 'enable' | 'uninstall' | 'restore', one?: string): PackageInfo[] {
  const items = one ? snapshot.packages.filter(p => p.packageName === one) : selectedPackages();
  if (!items.length) throw new Error('请先选择应用');
  if (items.length > 100) throw new Error('一次最多操作 100 个应用，请减少所选数量后重试');
  if (items.some(p => p.protectedReason)) throw new Error('所选应用中包含受保护组件，请先取消选择');
  if (items.some(p => kind === 'restore' ? p.installed : !p.installed)) throw new Error('所选应用的安装状态不适合此操作，请重新扫描');
  return items;
}
async function packageAction(kind: 'disable' | 'enable' | 'uninstall' | 'restore', one?: string): Promise<void> {
  if (busy || !online()) return;
  const items = checkedPackages(kind, one), labels = { disable: '停用', enable: '启用', uninstall: '为当前用户卸载', restore: '恢复安装' };
  const descriptions = {
    disable: '停用后，这些应用将不能在当前电视用户下运行。可在“已停用”分类中重新启用。',
    enable: '重新启用以下应用。',
    uninstall: '仅为当前用户卸载并保留数据。系统分区安装包不会删除；普通第三方应用可能需要重新安装 APK 才能恢复。',
    restore: '尝试恢复设备仍保有安装包的以下应用，实际结果将在操作记录中显示。',
  };
  if (!await confirm(`${labels[kind]} ${items.length} 个应用`, descriptions[kind], items.map(p => `${p.label} · ${p.packageName}`), labels[kind], kind === 'uninstall')) return;
  const packages = items.map(p => p.packageName);
  const request: Request = kind === 'disable' || kind === 'enable' ? { action: 'setEnabled', packages, enabled: kind === 'enable' } : { action: kind, packages };
  await run(request, `${labels[kind]}，逐项执行并核对结果…`); selected.clear(); render();
}
function validAddress(rawHost: string, rawPort: string): { host: string; port: number } {
  const value = rawHost.trim(), number = Number(rawPort);
  if (!value || value.length > 253 || /[\s/\\;|&$`'"<>]/.test(value)) throw new Error('请输入有效的电视 IP 或主机名，不要包含协议或端口');
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(number) || number < 1 || number > 65535) throw new Error('端口应为 1–65535 的整数');
  return { host: value, port: number };
}
async function addApks(): Promise<void> {
  if (busy) return; const values = await api.chooseApks();
  if (!values.length) return;
  let added = 0;
  for (const path of values) if (!apkPaths.includes(path)) { apkPaths.push(path); selectedApks.add(path); added++; }
  page = 'install'; showNotice(`已添加 ${added} 个安装包。请勾选后点击“安装所选”。`);
}
async function doAction(button: HTMLButtonElement): Promise<void> {
  if (button.disabled) return; const action = button.dataset.act;
  switch (action) {
    case 'go-connect': page = 'connect'; render(); break;
    case 'go-install': page = 'install'; render(); break;
    case 'dismiss': notice = ''; render(); break;
    case 'close-dialog': dialog.close(); break;
    case 'connect': await run({ action: 'connect', ...validAddress(host, port) }, '连接电视并读取设备信息…'); break;
    case 'disconnect': await run({ action: 'disconnect' }, '断开当前电视…'); break;
    case 'pair': {
      const address = validAddress(pairHost || host, pairPort), code = pairCode.trim();
      if (!/^\d{6}$/.test(code)) throw new Error('请输入电视上显示的 6 位配对码');
      pairCode = ''; await run({ action: 'pair', ...address, code }, '正在配对，请保持电视配对界面打开…'); break;
    }
    case 'choose-adb': { const path = await api.chooseAdb(); if (path) { adbPath = path; await run({ action: 'setAdbPath', path }, '验证 ADB 工具…'); } break; }
    case 'save-adb': await run({ action: 'setAdbPath', path: adbPath.trim() }, '验证 ADB 工具…'); break;
    case 'auto-adb': adbPath = ''; await run({ action: 'setAdbPath', path: '' }, '查找 ADB 工具…'); break;
    case 'download-adb': await downloadTools(); break;
    case 'platform-tools': await api.openResource('platformTools'); break;
    case 'platform-tools-license': await api.openResource('platformToolsLicense'); break;
    case 'releases': await api.openResource('releases'); break;
    case 'scan': await run({ action: 'scan' }, '扫描电视应用，读取当前用户状态…'); break;
    case 'cancel': cancelling = true; render(); await api.cancel(); break;
    case 'details': details(button.dataset.pkg!); break;
    case 'clear-selection': selected.clear(); updateList(); break;
    case 'disable': case 'enable': case 'uninstall': case 'restore': await packageAction(action); break;
    case 'enable-one': await packageAction('enable', button.dataset.pkg); break;
    case 'restore-one': await packageAction('restore', button.dataset.pkg); break;
    case 'add-launcher': case 'add-apks': await addApks(); break;
    case 'remove-apk': { const path = button.dataset.path!; apkPaths = apkPaths.filter(p => p !== path); selectedApks.delete(path); render(); break; }
    case 'select-apks': selectedApks = new Set(apkPaths); render(); break;
    case 'clear-apks-selection': selectedApks.clear(); render(); break;
    case 'install-apks': {
      const paths = apkPaths.filter(p => selectedApks.has(p)); if (!paths.length || busy || !online()) return;
      if (paths.length > 10) throw new Error('一次最多安装 10 个 APK，请减少所选数量；其他文件会保留在列表中');
      if (await confirm(`安装 ${paths.length} 个应用`, '将按顺序安装以下 APK。同包名且签名一致的应用会尝试覆盖升级。', paths, '开始安装')) await run({ action: 'install', paths }, '正在安装所选 APK，完成后刷新应用…'); break;
    }
    case 'set-home': {
      const component = button.dataset.component!;
      if (await confirm('更换默认桌面', '切换前会记录原来的桌面，便于之后恢复。', [component], '设为默认桌面')) await run({ action: 'setHome', component }, '切换默认桌面并核对结果…'); break;
    }
    case 'restore-home': if (snapshot.originalHome && await confirm('恢复原来的桌面', '将当前电视的默认桌面切换回记录的启动器。', [snapshot.originalHome], '恢复原桌面')) await run({ action: 'restoreHome' }, '恢复原桌面并核对结果…'); break;
    case 'clear-history': if (await confirm('清空操作记录', '仅清空本机保存的记录，不撤销电视上已执行的操作。', [`${snapshot.history.length} 条记录`], '清空记录')) await run({ action: 'clearHistory' }, '清空记录…'); break;
  }
}
document.addEventListener('click', event => {
  const target = event.target as HTMLElement;
  if (target.closest('.brand')) { event.preventDefault(); page = 'connect'; render(); return; }
  const nav = target.closest<HTMLButtonElement>('[data-page]');
  if (nav) { page = nav.dataset.page as Page; render(); return; }
  const tab = target.closest<HTMLButtonElement>('[data-filter]');
  if (tab) { filter = tab.dataset.filter as Filter; selected.clear(); render(); return; }
  const button = target.closest<HTMLButtonElement>('button[data-act]');
  if (button) void doAction(button).catch(e => showNotice(e instanceof Error ? e.message : String(e), 'error'));
});
document.addEventListener('input', event => {
  const input = event.target as HTMLInputElement;
  switch (input.name) {
    case 'host': host = input.value; break;
    case 'port': port = input.value; break;
    case 'pairHost': pairHost = input.value; break;
    case 'pairPort': pairPort = input.value; break;
    case 'pairCode': pairCode = input.value; break;
    case 'adbPath': adbPath = input.value; break;
    case 'search': query = input.value; updateList(); break;
  }
});
document.addEventListener('change', event => {
  const input = event.target as HTMLInputElement;
  if (input.dataset.selectPackage) { input.checked ? selected.add(input.dataset.selectPackage) : selected.delete(input.dataset.selectPackage); updateList(); }
  else if (input.hasAttribute('data-select-all')) { for (const p of visiblePackages().filter(p => !p.protectedReason)) input.checked ? selected.add(p.packageName) : selected.delete(p.packageName); updateList(); }
  else if (input.dataset.selectApk) {
    const path = input.dataset.selectApk; input.checked ? selectedApks.add(path) : selectedApks.delete(path); render();
    Array.from(root.querySelectorAll<HTMLInputElement>('[data-select-apk]')).find(checkbox => checkbox.dataset.selectApk === path)?.focus();
  }
});
document.addEventListener('keydown', event => {
  const input = event.target as HTMLInputElement;
  if (event.key === 'Enter' && !busy && !dialog.open && ['host', 'port'].includes(input.name)) {
    event.preventDefault(); const button = root.querySelector<HTMLButtonElement>('[data-act="connect"]'); if (button && !button.disabled) button.click();
  }
});
render();
void api.execute({ action: 'getState' }).then(value => {
  snapshot = value; adbPath = value.adbPath || ''; notice = value.message;
  render();
  void refreshToolsInfo().then(render);
}).catch(e => showNotice(e instanceof Error ? e.message : String(e), 'error'));

void api.mcpInfo().then(value => { mcpInfo = value; render(); }).catch(error => { mcpError = String(error); render(); });
void api.watchMcp(value => {
  busy = value.running; cancelling = false;
  busyLabel = `Agent 正在执行 ${value.tool}…`;
  downloadingTools = value.running && value.tool === 'install_platform_tools';
  if (value.running) { notice = ''; toolsProgress = null; }
  if (value.snapshot) {
    const previous = snapshot.device?.serial;
    snapshot = value.snapshot; adbPath = snapshot.adbPath || '';
    if (previous !== snapshot.device?.serial) selected.clear();
    cleanSelection();
    notice = value.error || snapshot.message; noticeKind = value.error ? 'error' : 'info';
  }
  if (!value.running) { toolsProgress = null; void refreshToolsInfo().then(render); }
  render();
}, updateToolsProgress).catch(error => { mcpError = `无法订阅 Agent 状态：${String(error)}`; render(); });
