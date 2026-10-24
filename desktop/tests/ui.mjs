import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { mockBridge, snapshot } from './fixtures.mjs';

const directory = fileURLToPath(new URL('..', import.meta.url));
const port = 1429, url = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = ''; server.stdout.on('data', d => serverLog += d); server.stderr.on('data', d => serverLog += d);
let browser, passed = 0;
const act = (p, action) => p.locator(`[data-act="${action}"]`).first();
const nav = async (p, page) => {if(page==='install'){await p.locator('[data-page="apps"]').click();await p.locator('[data-act="go-install"]').first().click();}else await p.locator(`[data-page="${page}"]`).click();};
const requests = p => p.evaluate(() => window.__requests);
const box = (p, pkg) => p.locator(`input[data-select-package="${pkg}"]`);
const settled = p => p.waitForFunction(() => !document.querySelector('.busy-bar'));
async function confirmOperation(p) {
  const before = (await requests(p)).length;
  await p.locator('#confirm-operation').click();
  await p.waitForFunction(n => window.__requests.length > n, before);
  await settled(p);
}
function withoutAdb() {
  return {...snapshot(),adbPath:null,adbAvailable:false,device:null,packages:[],launchers:[],defaultHome:null};
}
async function acceptTools(p) {
  const before = await p.evaluate(()=>window.__toolsInstalls);
  await p.locator('#platform-tools-license').check();
  await p.locator('#confirm-platform-tools').click();
  await p.waitForFunction(n=>window.__toolsInstalls > n, before);
}
const captureDir = process.env.PURETV_CAPTURE_DIR;
async function shot(p, name) { if (captureDir) { await mkdir(captureDir, { recursive: true }); await p.screenshot({path:`${captureDir}/${name}.png`, fullPage:true}); } }
async function check(name, run, state = snapshot(), options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await context.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message));
  try {
    if (state) await mockBridge(p, state, options);
    await p.goto(url);
    await p.locator('.connection-strip').waitFor();
    if (state?.device) await p.getByText(state.device.model, { exact:true }).first().waitFor();
    await run(p);
    assert.deepEqual(errors, [], 'No uncaught JavaScript errors');
    console.log(`PASS ${++passed}: ${name}`);
  } catch (e) { await shot(p, `failed-${passed+1}`); throw new Error(`${name}: ${e.message}`, {cause:e}); }
  finally { await context.close(); }
}
try {
  for (let attempt = 0; ; attempt++) {
    if (server.exitCode !== null) throw new Error(`Preview server stopped: ${serverLog}`);
    try { if ((await fetch(url)).ok) break; } catch { /* Startup only. */ }
    if (attempt > 100) throw new Error(`Preview did not start: ${serverLog}`);
    await new Promise(resolve => setTimeout(resolve,100));
  }
  browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_PATH || undefined, args:['--no-sandbox']});
  await check('browser preview never pretends to connect', async p => {
    assert.match(await p.locator('.warning-banner').innerText(), /浏览器预览/);
    assert.equal(await act(p,'connect').isDisabled(), true);
    assert.equal(await act(p,'download-adb').isDisabled(), true);
    await nav(p,'apps'); assert.equal(await p.locator('input[data-select-package]').count(),0);
  }, null);
  await check('MCP configuration and agent operations synchronize with the window', async p => {
    await p.locator('.mcp-config').waitFor();
    assert.match(await p.locator('.mcp-config').innerText(), /--mcp/);
    await p.evaluate(() => window.__emitMcp('mcp-operation',{running:true,tool:'scan'}));
    await p.locator('.busy-bar').waitFor();
    assert.equal(await act(p,'connect').isDisabled(),true);
    const updated = snapshot(); updated.revision = 2; updated.device.model = 'Agent TV'; updated.message = 'Agent 扫描完成';
    await p.evaluate(value => window.__emitMcp('mcp-operation',{running:false,tool:'scan',snapshot:value}),updated);
    await settled(p);
    assert.match(await p.locator('.device-badge').innerText(), /Agent TV/);
    assert.match(await p.locator('.notice').innerText(), /Agent 扫描完成/);
    await p.evaluate(value => window.__emitMcp('mcp-operation',{running:false,tool:'scan',snapshot:value}),snapshot());
    assert.match(await p.locator('.device-badge').innerText(), /Agent TV/, 'Older state must not replace a newer agent result');
    await p.evaluate(() => window.__emitMcp('mcp-operation',{running:true,tool:'install_platform_tools'}));
    await p.evaluate(() => window.__emitMcp('mcp-progress',{stage:'downloading',downloaded:50,total:100}));
    assert.match(await p.locator('.busy-bar').innerText(),/50%/);
    await p.evaluate(value => window.__emitMcp('mcp-operation',{running:false,tool:'install_platform_tools',snapshot:value,error:'下载已取消'}),updated);
    assert.match(await p.locator('.notice.error').innerText(),/下载已取消/);
  },withoutAdb());
  await check('finishing a GUI request does not clear the next agent busy state', async p => {
    await nav(p,'apps'); await act(p,'scan').click();
    await p.locator('.busy-bar').waitFor();
    await p.evaluate(() => window.__emitMcp('mcp-operation',{running:true,tool:'scan'}));
    await p.waitForTimeout(750);
    assert.equal(await act(p,'scan').isDisabled(),true);
    assert.match(await p.locator('.busy-bar').innerText(),/Agent/);
    await p.evaluate(value => window.__emitMcp('mcp-operation',{running:false,tool:'scan',snapshot:value}),snapshot());
    await settled(p);
  },snapshot(),{slowScan:true});
  await check('user APK sizes are explicit and missing sizes are not invented', async p => {
    await nav(p,'apps');
    assert.match(await p.locator('tr[data-package="com.ecojust.webtv"] .size-cell').innerText(),/12.0 MiB/);
    assert.equal(await p.locator('tr[data-package="com.ecojust.puretv"] .size-cell').innerText(),'未能读取');
    assert.equal(await p.locator('tr[data-package="com.android.settings"] .size-cell').innerText(),'未能读取');
    await p.locator('tr[data-package="com.ecojust.webtv"] [data-act="details"]').click();
    assert.match(await p.locator('dialog').innerText(),/不含私有数据和缓存/);
  });
  const longState = snapshot();
  longState.packages = Array.from({length:120},(_,i)=>({packageName:`com.example.app${i}`,label:`应用 ${i}`,installed:true,system:false,enabled:true,protectedReason:null,apkSizeBytes:1048576}));
  longState.launchers = Array.from({length:30},(_,i)=>({packageName:`com.example.home${i}`,component:`com.example.home${i}/.Main`,label:`桌面 ${i}`,isDefault:false}));
  longState.history = Array.from({length:100},(_,i)=>({id:String(i),timestamp:1,action:'install',target:`com.example.app${i}`,device:'tv',userId:0,success:true,message:'已完成'}));
  await check('all long lists scroll internally while top actions and surrounding content stay fixed', async p => {
    for (const viewport of [{width:1440,height:900},{width:960,height:640}]) {
      await p.setViewportSize(viewport);
      for (const [page,key] of [['apps','apps'],['launchers','launchers'],['history','history'],['install','apks']]) {
        await nav(p,page);
        if (page==='install' && !await p.locator('[data-scroll="apks"]').count()) await act(p,'add-apks').click();
        const area = p.locator(`[data-scroll="${key}"]`);
        const metrics = await area.evaluate(el=>({height:el.clientHeight,total:el.scrollHeight}));
        assert.ok(metrics.height>45 && metrics.total>metrics.height,`${page} has a usable internal scroll area at ${viewport.width}: ${JSON.stringify(metrics)}`);
        assert.ok(await p.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),`${page}: no document vertical overflow`);
        const header = await p.locator('.page-header').boundingBox();
        const toolbar = page==='apps' ? p.locator('#selection-bar') : page==='install' ? p.locator('.install-footer') : null;
        if (toolbar) assert.ok((await toolbar.boundingBox()).y+(await toolbar.boundingBox()).height <= (await area.boundingBox()).y+1,'Batch actions are above the list');
        await area.evaluate(el=>{el.scrollTop=1000;});
        const box = await area.boundingBox(); await p.mouse.move(box.x+box.width/2,box.y+box.height/2); await p.mouse.wheel(0,500);
        await p.waitForTimeout(80);
        assert.ok(await area.evaluate(el=>el.scrollTop>0));
        assert.equal((await p.locator('.page-header').boundingBox()).y,header.y,'Header does not move');
        assert.equal(await p.evaluate(()=>scrollY),0);
        if (page==='apps') {
          const before=await area.evaluate(el=>el.scrollTop);
          await p.locator('[data-select-all]').check();
          assert.equal(await area.evaluate(el=>el.scrollTop),before,'Selection keeps list position');
          const head=await p.locator('.apps-table thead th').first().boundingBox();
          assert.ok(head.y >= box.y-1,'Table headings remain visible');
        }
        if (page==='install') {
          if (await act(p,'clear-apks-selection').isDisabled()) await act(p,'select-apks').click();
          const before=await area.evaluate(el=>el.scrollTop);
          await act(p,'clear-apks-selection').click();
          assert.equal(await area.evaluate(el=>el.scrollTop),before,'APK rerender keeps list position');
        }
      }
    }
    await nav(p,'apps');
    await shot(p,'scrolling-lists');
  },longState,{apkPaths:Array.from({length:40},(_,i)=>`/tmp/application-${i}.apk`)});
  await check('unsupported launchers are not editable but current HOME can be previewed', async p => {
    await nav(p,'launchers'); await act(p,'read-layout').click(); await settled(p);
    await p.locator('.layout-editor').getByText('此启动器尚未接入可验证的布局接口，请使用它自身的设置。').waitFor();
    assert.equal(await act(p,'apply-layout').count(),0);
    await act(p,'capture-launcher').click();await settled(p);
    await p.locator('.launcher-cover img[src^="data:image/png;base64,"]').waitFor();
    assert.deepEqual(await p.evaluate(()=>window.__launcherRequests.map(r=>r.action)),['getLayout','capturePreview']);
  });
  const customHome = snapshot(); customHome.defaultHome='com.ecojust.puretv/.MainActivity';
  customHome.launchers.forEach(l=>l.isDefault=l.component===customHome.defaultHome);
  await check('supported current launcher edits real layout, icons and app order only on apply', async p => {
    await nav(p,'launchers');await act(p,'read-layout').click();await settled(p);
    await act(p,'apply-layout').waitFor();
    await p.locator('[name="layoutColumns"]').fill('3');await p.locator('[name="layoutColumns"]').dispatchEvent('change');
    await p.locator('[data-act="layout-up"][data-index="1"]').click();
    let draft=JSON.parse(await p.locator('[name="layoutJson"]').inputValue());assert.equal(draft.home[0].action,'files');
    await p.locator('[data-layout-label="0"]').fill('文件入口');await p.locator('[data-layout-label="0"]').dispatchEvent('change');
    await p.locator('[data-layout-icon="0"]').selectOption('video');
    await p.locator('[name="layoutApp"]').selectOption('com.ecojust.webtv');await act(p,'layout-add').click();
    draft=JSON.parse(await p.locator('[name="layoutJson"]').inputValue());assert.equal(draft.columns,3);assert.equal(draft.home.length,4);assert.equal(draft.home[0].icon,'video');
    assert.equal(await p.evaluate(()=>window.__launcherRequests.length),1,'Draft edits do not touch the TV');
    await act(p,'apply-layout').click();await p.locator('#confirm-operation').click();await p.waitForFunction(()=>window.__launcherRequests.some(r=>r.action==='applyLayout'));await settled(p);
    const applied=await p.evaluate(()=>window.__launcherRequests.find(r=>r.action==='applyLayout'));
    assert.equal(applied.layout.columns,3);assert.equal(applied.layout.home[0].label,'文件入口');
    await act(p,'import-layout').click();assert.equal(JSON.parse(await p.locator('[name="layoutJson"]').inputValue()).columns,2);
    assert.equal(await p.evaluate(()=>window.__launcherRequests.length),2,'Import is local until applied');
    await act(p,'reset-layout').click();await p.locator('#confirm-operation').click();await p.waitForFunction(()=>window.__launcherRequests.some(r=>r.action==='resetLayout'));await settled(p);
    assert.equal(JSON.parse(await p.locator('[name="layoutJson"]').inputValue()).columns,4);
    await p.evaluate(value=>window.__emitMcp('mcp-operation',{running:false,tool:'apply_launcher_layout',snapshot:value,launcherResult:{supported:true,component:value.defaultHome,layout:{version:1,columns:5,home:[{action:'music',icon:'music'}],apps:[]},apps:[]}}),customHome);
    assert.equal(await p.locator('[name="layoutColumns"]').inputValue(),'5','Agent layout changes reach the editor');
    const another=structuredClone(customHome);another.device.serial='192.168.1.51:5555';another.revision=1;
    await p.evaluate(value=>window.__emitMcp('mcp-operation',{running:false,tool:'connect',snapshot:value}),another);
    assert.equal(await act(p,'apply-layout').count(),0,'Capabilities from another TV must not enable writes');
  },customHome,{layoutSupported:true});
  await check('system information is visible at home and connection controls stay only there', async p => {
    assert.match(await p.locator('.device-info').innerText(),/Test Maker/);
    assert.match(await p.locator('.device-info').innerText(),/4.0 GiB/);
    assert.match(await p.locator('.device-info').innerText(),/32.0 GiB/);
    assert.equal(await p.locator('[data-page="install"]').count(),0,'No separate install navigation');
    for(const page of ['apps','launchers','install','history','live']) {
      await nav(p,page);assert.equal(await p.locator('.connection-strip').count(),0,`No connection form on ${page}`);
      assert.match(await p.locator('.device-badge').innerText(),/已连接/);
    }
    await nav(p,'connect');assert.equal(await p.locator('[name="host"]').count(),1);
  });
  await check('live screen receives frames without rebuilding controls and supports pause and stop', async p => {
    await nav(p,'live');await act(p,'start-live').click();
    await p.waitForFunction(()=>window.__liveRequests.some(r=>r.action==='start'));
    await p.evaluate(()=>window.__emitMcp('live-frame',{frame:{serial:'192.168.1.50:5555',userId:0,image:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZCksAAAAASUVORK5CYII=',timestampMs:123},status:{running:true,paused:false,serial:'192.168.1.50:5555',userId:0,targetFps:1,actualFps:1,frames:1,timestampMs:123,message:'正在显示电视画面'}}));
    assert.equal(await p.locator('#live-image').isVisible(),true);
    assert.match(await p.locator('#live-status').innerText(),/1 帧/);
    await act(p,'pause-live').click();assert.equal(await p.locator('#live-image').isVisible(),true);
    await act(p,'stop-live').click();assert.equal(await p.locator('#live-image').isVisible(),false);
    assert.equal(await p.locator('#live-empty').isVisible(),true);
  });
  await check('pending APKs install inside app management and new apps become layout choices', async p => {
    await nav(p,'install');await act(p,'add-apks').click();await p.locator('.apk-item').first().waitFor();
    await act(p,'install-apks').click();await confirmOperation(p);
    assert.equal(await p.locator('.apk-item').count(),0,'Successful installs leave the pending queue');
    await act(p,'go-apps').click();assert.equal(await box(p,'com.imported.app').count(),1);
    await nav(p,'launchers');await p.locator('[name="layoutApp"]').waitFor();
    assert.match(await p.locator('[name="layoutApp"]').innerText(),/新安装应用/);
  },customHome,{layoutSupported:true});
  await check('partial installation removes only successful paths and retains failures', async p => {
    await nav(p,'install');await act(p,'add-apks').click();await p.locator('.apk-item').first().waitFor();
    await act(p,'install-apks').click();await confirmOperation(p);
    assert.equal(await p.locator('.apk-item').count(),1);assert.match(await p.locator('.apk-item').innerText(),/failed.apk/);
    assert.match(await p.locator('.notice.error').innerText(),/失败 1 项/);
  },snapshot(),{apkPaths:['/tmp/success.apk','/tmp/failed.apk'],partialInstall:true});
  await check('official ADB setup requires explicit license consent and configures automatically', async p => {
    assert.equal(await act(p,'connect').isDisabled(),true);
    assert.equal(await p.evaluate(()=>window.__toolsInstalls),0,'Startup must not download');
    await act(p,'download-adb').click();
    assert.match(await p.locator('dialog').innerText(),/37\.0\.1/);
    assert.match(await p.locator('dialog').innerText(),/macOS/);
    assert.match(await p.locator('dialog').innerText(),/15\.4 MiB/);
    assert.match(await p.locator('dialog').innerText(),/dl\.google\.com/);
    assert.match(await p.locator('dialog').innerText(),/mirrors\.cloud\.tencent\.com/);
    assert.equal(await p.locator('#platform-tools-license').isChecked(),false);
    assert.equal(await p.locator('#confirm-platform-tools').isDisabled(),true);
    await act(p,'platform-tools-license').click();
    assert.deepEqual(await p.evaluate(()=>window.__resources),['platformToolsLicense']);
    await act(p,'close-dialog').click(); assert.equal(await p.evaluate(()=>window.__toolsInstalls),0);
    await act(p,'download-adb').click(); await acceptTools(p);
    await p.locator('.busy-bar').waitFor();
    assert.match(await p.locator('.busy-bar').innerText(),/50%/);
    assert.equal(await p.locator('progress').getAttribute('max'),'16110554');
    assert.equal(await act(p,'choose-adb').isDisabled(),true);
    await settled(p);
    assert.deepEqual(await requests(p),[{action:'installPlatformTools',acceptedLicense:true}]);
    assert.match(await p.locator('.notice.success').innerText(),/ADB 已就绪/);
    assert.match(await p.locator('[name="adbPath"]').inputValue(),/platform-tools-37\.0\.1/);
    assert.equal(await act(p,'connect').isEnabled(),true);
    assert.match(await act(p,'download-adb').innerText(),/使用已下载 ADB/);
    await shot(p,'adb-ready');
  },withoutAdb(),{slowDownload:true});
  await check('ADB download failure stays unconfigured and can be retried', async p => {
    await act(p,'download-adb').click(); await acceptTools(p); await settled(p);
    assert.match(await p.locator('.notice.error').innerText(),/下载失败/);
    assert.equal(await act(p,'connect').isDisabled(),true);
    assert.equal(await p.locator('[name="adbPath"]').inputValue(),'');
    await act(p,'download-adb').click();
    assert.equal(await p.locator('#platform-tools-license').isChecked(),false,'Consent is explicit on retry');
    await acceptTools(p); await settled(p);
    assert.equal(await p.evaluate(()=>window.__toolsInstalls),2);
    assert.equal(await act(p,'connect').isEnabled(),true);
  },withoutAdb(),{failDownloadOnce:true});
  await check('ADB download cancellation retains setup controls and does not show success', async p => {
    await act(p,'download-adb').click(); await acceptTools(p); await p.locator('.busy-bar').waitFor();
    assert.equal(await act(p,'cancel').innerText(),'取消下载');
    await act(p,'cancel').click();
    assert.match(await p.locator('.busy-bar').innerText(),/清理临时文件/);
    assert.doesNotMatch(await p.locator('.busy-bar').innerText(),/当前修改会完成/);
    await settled(p);
    assert.match(await p.locator('.notice.info').innerText(),/已取消/);
    assert.equal(await p.locator('.notice.success').count(),0);
    assert.equal(await act(p,'download-adb').isEnabled(),true);
    assert.equal(await act(p,'connect').isDisabled(),true);
    assert.deepEqual(await requests(p),[{action:'installPlatformTools',acceptedLicense:true},{action:'cancel'}]);
  },withoutAdb(),{slowDownload:true});
  await check('downloaded tools are offered for offline reuse and connected TVs prevent switching', async p => {
    assert.equal(await act(p,'download-adb').isDisabled(),true);
    assert.match(await p.locator('.adb-panel').innerText(),/先断开电视/);
    await act(p,'disconnect').click(); await settled(p);
    await act(p,'download-adb').click();
    assert.match(await p.locator('dialog').innerText(),/优先验证并使用已下载工具/);
    assert.match(await p.locator('dialog').innerText(),/校验失败时会重新下载并修复/);
    assert.match(await p.locator('dialog').innerText(),/0 MiB/);
    await acceptTools(p); await settled(p);
    assert.equal(await act(p,'connect').isEnabled(),true);
    assert.equal(await p.evaluate(()=>window.__toolsInstalls),1);
  },snapshot(),{toolsInstalled:true});
  await check('unsupported online setup keeps manual ADB selection available', async p => {
    await p.getByText('此系统请手动配置 ADB',{exact:true}).waitFor();
    assert.equal(await act(p,'download-adb').isDisabled(),true);
    assert.equal(await act(p,'choose-adb').isEnabled(),true);
    assert.equal(await p.evaluate(()=>window.__toolsInstalls),0);
  },withoutAdb(),{unsupportedTools:true});
  await check('installed/recoverable filters, search and protected components', async p => {
    await nav(p,'apps');
    assert.equal(await p.locator('input[data-select-package]').count(),6);
    assert.equal(await box(p,'com.vendor.home').isDisabled(),true);
    assert.equal(await box(p,'com.android.settings').isDisabled(),true);
    await p.locator('[data-filter="recoverable"]').click();
    assert.equal(await p.locator('input[data-select-package]').count(),1);
    assert.equal(await box(p,'com.vendor.removed').count(),1);
    await p.locator('[data-filter="user"]').click();
    assert.equal(await p.locator('input[data-select-package]').count(),2);
    await p.locator('[name="search"]').fill('webtv');
    assert.equal(await p.locator('input[data-select-package]').count(),1);
    await p.locator('[name="search"]').fill(''); await p.locator('[data-filter="all"]').click();
    await shot(p,'applications');
    await p.setViewportSize({width:960,height:640});
    for (const page of ['apps','connect','launchers','install','history']) {
      await nav(p,page);
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No horizontal overflow on ${page}`);
    }
  });
  await check('cancel confirmation sends no mutation; confirmed disable sends exact target', async p => {
    await nav(p,'apps'); await box(p,'com.vendor.recommendations').check();
    await act(p,'disable').click();
    assert.match(await p.locator('dialog').innerText(),/192\.168\.1\.50:5555/);
    assert.match(await p.locator('dialog').innerText(),/com\.vendor\.recommendations/);
    await p.getByRole('button',{name:'取消',exact:true}).click();
    assert.deepEqual(await requests(p),[]);
    await act(p,'disable').click(); await confirmOperation(p);
    assert.deepEqual(await requests(p),[{action:'setEnabled',packages:['com.vendor.recommendations'],enabled:false}]);
    await p.locator('[data-filter="disabled"]').click(); assert.equal(await p.locator('input[data-select-package]').count(),2);
    await nav(p,'history'); assert.match(await p.locator('.history-panel').innerText(),/com\.vendor\.recommendations/);
  });
  await check('external APK picker appends/deduplicates; installs only selected paths after confirmation', async p => {
    await nav(p,'install'); await act(p,'add-apks').click();
    await p.locator('.apk-item').first().waitFor();
    assert.equal(await p.locator('.apk-item').count(),1);
    assert.deepEqual(await requests(p),[],'Import must not install');
    await act(p,'add-apks').click();
    await p.waitForFunction(() => document.querySelectorAll('.apk-item').length === 2);
    await act(p,'clear-apks-selection').click();
    assert.equal(await act(p,'install-apks').isDisabled(),true);
    await p.getByRole('checkbox',{name:'选择 custom music.apk',exact:true}).check();
    await shot(p,'import-apks');
    await act(p,'install-apks').click();
    assert.match(await p.locator('dialog').innerText(),/C:\\我的安装包\\custom music\.apk/);
    assert.doesNotMatch(await p.locator('dialog').innerText(),/second\.apk/);
    assert.deepEqual(await requests(p),[]);
    await confirmOperation(p);
    assert.deepEqual(await requests(p),[{action:'install',paths:['C:\\我的安装包\\custom music.apk']}]);
    await p.locator('.apk-item').filter({hasText:'second.apk'}).locator('[data-act="remove-apk"]').click();
    assert.equal(await p.locator('.apk-item').count(),0);
    assert.equal((await requests(p)).length,1,'Remove only edits local list');
  });
  await check('launcher selection and original HOME recovery', async p => {
    await nav(p,'launchers');
    await p.locator('[data-act="set-home"]:enabled').click();
    await confirmOperation(p);
    assert.deepEqual((await requests(p))[0],{action:'setHome',component:'com.ecojust.puretv/.MainActivity'});
    assert.equal(await act(p,'restore-home').isEnabled(),true);
    await act(p,'restore-home').click(); await confirmOperation(p);
    assert.deepEqual((await requests(p))[1],{action:'restoreHome'});
    assert.equal(await act(p,'restore-home').isDisabled(),true);
    await act(p,'add-launcher').click();
    await p.locator('.apk-item').first().waitFor();
    assert.equal(await p.locator('[data-page="apps"]').getAttribute('aria-current'),'page');
  });
  await check('failed mutation shows error and retains actual package state', async p => {
    await nav(p,'apps'); await box(p,'com.vendor.recommendations').check();
    await act(p,'disable').click(); await confirmOperation(p);
    assert.match(await p.locator('.notice.error').innerText(),/电视拒绝/);
    await p.locator('[data-filter="disabled"]').click(); assert.equal(await p.locator('input[data-select-package]').count(),1);
  },snapshot(),{failAction:'setEnabled'});
  await check('partial batch failure is not reported as success', async p => {
    await nav(p,'apps'); await box(p,'com.vendor.recommendations').check();
    await act(p,'disable').click(); await confirmOperation(p);
    assert.equal(await p.locator('.notice.success').count(),0);
    assert.match(await p.locator('.notice').innerText(),/失败 1 项/);
  },snapshot(),{partialFailure:true});
  await check('host validation, pairing code cleanup and no browser persistence', async p => {
    await p.locator('[name="host"]').fill('192.168.1.50;reboot'); await act(p,'connect').click();
    assert.deepEqual(await requests(p),[]);
    assert.match(await p.locator('.notice.error').innerText(),/有效/);
    await p.locator('[name="pairHost"]').fill('192.168.1.50');
    await p.locator('[name="pairPort"]').fill('37001'); await p.locator('[name="pairCode"]').fill('123456');
    await act(p,'pair').click(); await settled(p);
    assert.deepEqual((await requests(p))[0],{action:'pair',host:'192.168.1.50',port:37001,code:'123456'});
    assert.equal(await p.locator('[name="pairCode"]').inputValue(),'');
    assert.equal(await p.evaluate(() => localStorage.length + sessionStorage.length),0);
  });
  await check('scan disables competing actions and exposes cancellation', async p => {
    await nav(p,'apps'); await act(p,'scan').click(); await p.locator('.busy-bar').waitFor();
    assert.equal(await act(p,'scan').isDisabled(),true);
    assert.equal(await box(p,'com.vendor.recommendations').isDisabled(),true);
    await act(p,'cancel').click(); await settled(p);
    assert.deepEqual(await requests(p),[{action:'scan'},{action:'cancel'}]);
  },snapshot(),{slowScan:true});
  const injected = snapshot(); injected.device.model = '<img src=x onerror="window.__xss=true">'; injected.packages[0].label = injected.device.model;
  await check('device and application metadata render as text',async p => {
    await nav(p,'apps'); assert.equal(await p.locator('img').count(),0); assert.equal(await p.evaluate(()=>window.__xss),false);
    assert.match(await p.locator('.apps-table').innerText(),/onerror/);
  },injected);
  console.log(`${passed} UI scenarios passed`);
} finally {
  await browser?.close(); server.kill();
}
