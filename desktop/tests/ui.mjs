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
const nav = (p, page) => p.locator(`[data-page="${page}"]`).click();
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
  await check('official ADB setup requires explicit license consent and configures automatically', async p => {
    assert.equal(await act(p,'connect').isDisabled(),true);
    assert.equal(await p.evaluate(()=>window.__toolsInstalls),0,'Startup must not download');
    await act(p,'download-adb').click();
    assert.match(await p.locator('dialog').innerText(),/37\.0\.1/);
    assert.match(await p.locator('dialog').innerText(),/macOS/);
    assert.match(await p.locator('dialog').innerText(),/15\.4 MiB/);
    assert.match(await p.locator('dialog').innerText(),/dl\.google\.com/);
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
    assert.match(await p.locator('dialog').innerText(),/校验失败时会从 Google 重新下载/);
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
    assert.equal(await p.locator('.apk-item').count(),1);
    assert.equal((await requests(p)).length,1,'Remove only edits local list');
  });
  await check('launcher selection and original HOME recovery', async p => {
    await nav(p,'launchers');
    await p.locator('[data-act="set-home"]:enabled').click();
    await confirmOperation(p);
    assert.deepEqual((await requests(p))[0],{action:'setHome',component:'com.ecojust.cleanyourtv/.MainActivity'});
    assert.equal(await act(p,'restore-home').isEnabled(),true);
    await act(p,'restore-home').click(); await confirmOperation(p);
    assert.deepEqual((await requests(p))[1],{action:'restoreHome'});
    assert.equal(await act(p,'restore-home').isDisabled(),true);
    await act(p,'add-launcher').click();
    await p.locator('.apk-item').first().waitFor();
    assert.equal(await p.locator('[data-page="install"]').getAttribute('aria-current'),'page');
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
