export function snapshot() {
  return {
    adbPath: 'C:\\platform-tools\\adb.exe', adbAvailable: true,
    device: { serial: '192.168.1.50:5555', model: '测试电视', androidVersion: '12', userId: 0, status: 'device' },
    packages: [
      { packageName: 'com.vendor.recommendations', label: '厂商推荐', system: true, enabled: true, installed: true, protectedReason: null },
      { packageName: 'com.vendor.disabled', label: '已停用示例', system: true, enabled: false, installed: true, protectedReason: null },
      { packageName: 'com.vendor.removed', label: '可恢复示例', system: true, enabled: false, installed: false, protectedReason: null },
      { packageName: 'com.ecojust.webtv', label: 'WebTV', system: false, enabled: true, installed: true, protectedReason: null },
      { packageName: 'com.ecojust.cleanyourtv', label: 'pureTV', system: false, enabled: true, installed: true, protectedReason: null },
      { packageName: 'com.vendor.home', label: '原厂桌面', system: true, enabled: true, installed: true, protectedReason: '当前默认启动器' },
      { packageName: 'com.android.settings', label: '系统设置', system: true, enabled: true, installed: true, protectedReason: '关键系统组件' },
    ],
    launchers: [
      { packageName: 'com.vendor.home', component: 'com.vendor.home/.Main', label: '原厂桌面', isDefault: true },
      { packageName: 'com.ecojust.cleanyourtv', component: 'com.ecojust.cleanyourtv/.MainActivity', label: 'pureTV', isDefault: false },
    ],
    defaultHome: 'com.vendor.home/.Main', originalHome: null, history: [], message: '',
  };
}

export async function mockBridge(page, initial = snapshot(), options = {}) {
  await page.addInitScript(({initial, options}) => {
    const state = structuredClone(initial);
    const callbacks = new Map(); let nextCallback = 1, downloadCancelled = false, toolsInstalled = !!options.toolsInstalled;
    window.__requests = []; window.__pickerCalls = 0; window.__xss = false; window.__toolsInstalls = 0; window.__resources = [];
    window.__TAURI_INTERNALS__ = {
      transformCallback: callback => { const id = nextCallback++; callbacks.set(id, callback); return id; },
      unregisterCallback: id => { callbacks.delete(id); },
      invoke: async (command, args = {}) => {
        if (command === 'choose_apks') {
          window.__pickerCalls++;
          return window.__pickerCalls === 1 ? ['C:\\我的安装包\\custom music.apk'] : ['C:\\我的安装包\\custom music.apk','C:\\Downloads\\second.apk'];
        }
        if (command === 'choose_adb') return 'C:\\platform-tools\\adb.exe';
        if (command === 'cancel') { window.__requests.push({action:'cancel'}); downloadCancelled = true; return; }
        if (command === 'open_resource') { window.__resources.push(args.resource); return; }
        if (command === 'platform_tools_info') return {version:'37.0.1',platform:'macos',downloadBytes:16110554,installed:toolsInstalled,supported:!options.unsupportedTools,message:options.unsupportedTools ? '此系统请手动配置 ADB' : ''};
        if (command === 'install_platform_tools') {
          if (args.acceptedLicense !== true) throw new Error('必须先同意 Android SDK 许可协议');
          if (state.device) throw new Error('请先断开电视');
          window.__toolsInstalls++; window.__requests.push({action:'installPlatformTools',acceptedLicense:args.acceptedLicense});
          downloadCancelled = false; let index = 0;
          const emit = (stage,downloaded) => callbacks.get(args.onProgress.id)?.({index:index++,message:{stage,downloaded,total:16110554}});
          try {
            emit(toolsInstalled ? 'checking' : 'downloading', 8055277);
            await new Promise(resolve => setTimeout(resolve, options.slowDownload ? 900 : 180));
            if (downloadCancelled) throw new Error('下载已取消，临时文件已清理');
            if (options.failDownloadOnce && window.__toolsInstalls === 1) throw new Error('下载失败，请检查网络后重试');
            emit('verifying',16110554); emit('extracting',16110554); emit('checking',16110554);
            state.adbPath = '/Users/test/Library/Application Support/com.ecojust.puretv.manager/tools/platform-tools-37.0.1/platform-tools/adb';
            state.adbAvailable = true; toolsInstalled = true; state.message = 'ADB 已就绪，可以连接电视';
            return structuredClone(state);
          } finally { callbacks.get(args.onProgress.id)?.({index,end:true}); }
        }
        if (command !== 'execute') throw new Error('Unexpected command: '+command);
        const r = args.request;
        if (r.action === 'getState') return structuredClone(state);
        window.__requests.push(structuredClone(r));
        if (options.failAction === r.action) throw new Error('电视拒绝了操作，请检查授权');
        if (r.action === 'scan' && options.slowScan) await new Promise(resolve => setTimeout(resolve,600));
        if (options.partialFailure && r.action === 'setEnabled') {
          state.history.unshift({id:'partial',timestamp:1,action:r.action,target:r.packages[0],device:state.device.serial,userId:0,success:false,message:'固件拒绝停用'});
          state.message = '成功 0 项，失败 1 项'; return structuredClone(state);
        }
        if (r.action === 'setEnabled' || r.action === 'uninstall' || r.action === 'restore') {
          for (const name of r.packages) {
            const p = state.packages.find(p => p.packageName === name);
            if (!p || p.protectedReason) throw new Error('受保护');
            if (r.action === 'setEnabled') p.enabled = r.enabled;
            else if (r.action === 'uninstall') p.installed = false;
            else { p.installed = true; p.enabled = true; }
          }
        }
        if (r.action === 'setHome') { state.originalHome ??= state.defaultHome; state.defaultHome = r.component; }
        if (r.action === 'restoreHome') state.defaultHome = state.originalHome;
        if (r.action === 'setHome' || r.action === 'restoreHome') {
          for (const p of state.packages) {
            if (p.protectedReason === '当前默认启动器') p.protectedReason = null;
            if (p.packageName === state.defaultHome?.split('/')[0]) p.protectedReason = '当前默认启动器';
          }
          state.launchers.forEach(l => l.isDefault = l.component === state.defaultHome);
        }
        if (r.action === 'disconnect') { state.device = null; state.packages = []; state.launchers = []; }
        if (r.action === 'clearHistory') state.history = [];
        else state.history.unshift({id: String(Date.now()), timestamp: Math.floor(Date.now()/1000), action:r.action, target:(r.packages||r.paths||[r.component||'电视']).join(', '), device:initial.device?.serial||'',userId:0,success:true,message:'执行后状态已核对'});
        state.message = '操作完成，状态已核对';
        return structuredClone(state);
      },
    };
  }, {initial, options});
}
