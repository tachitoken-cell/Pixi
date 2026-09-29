import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';

const compiled = await build({ stdin: { contents: "export { mountNotificationSettings } from './src/notification-settings'; export { authorizeNativeBilling, promptNativeNotifications } from './src/native-client';", resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', globalName: 'notificationUI' });
const profile = mkdtempSync(join(tmpdir(), 'moss-notifications-'));
const chrome = spawn(process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--no-sandbox', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let endpoint = '', socket;
chrome.stderr.on('data', bytes => { endpoint ||= bytes.toString().match(/DevTools listening on (ws:\/\/\S+)/)?.[1] || ''; });
try {
  for (let i = 0; i < 100 && !endpoint; i++) await delay(50);
  assert(endpoint, 'Chrome did not start; set CHROME_BIN to its executable.');
  const tabs = await fetch(`http://${new URL(endpoint).host}/json/list`).then(response => response.json());
  socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.once('open', resolve));
  let sequence = 0;
  const pending = new Map();
  socket.on('message', raw => { const result = JSON.parse(raw); if (result.id) { pending.get(result.id)?.(result); pending.delete(result.id); } });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, result => result.error ? reject(result.error) : resolve(result.result)); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert(!result.exceptionDetails, result.exceptionDetails?.exception?.description);
    return result.result.value;
  };
  const css = ['src/style.css', 'src/campaign.css', 'src/art.css', 'src/graphics-settings.css'].map(path => readFileSync(path, 'utf8')).join('\n');
  await send('Page.navigate', { url: 'data:text/html,' + encodeURIComponent(`<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}body{overflow:auto;background:#1c3027}</style><dialog open id="panel" class="panel" data-mode="settings"><div class="panel-heading"><h2 id="panel-title">Options</h2></div><div id="panel-content"><div class="settings-layout"><nav class="settings-nav">${['Language','Graphics','Wallet','Audio','Notifications','Updates','Keybindings','Controls'].map(label=>`<button type="button" ${label==='Notifications'?'aria-current="page"':''}>${label}</button>`).join('')}</nav><div class="settings-pages"><div id="notification-check-host"></div></div></div></div></dialog>`) });
  await evaluate(compiled.outputFiles[0].text + `
    window.__MOSSVALE_NATIVE__ = true;
    window.calls = [];
    window.result = {permission:'undetermined',canAskAgain:true,registered:false,hasChosen:false,preferences:{worldEvents:false,invites:false,reminders:false}};
    window.mossvaleNative = {version:1,platform:'google',notifications:true,request:async(method,params)=>{
      calls.push({method,params});
      if(window.fail)throw new Error(window.fail);
      if(method==='notifications.configure'){result={...result,permission:'granted',registered:Object.values(params.preferences).some(Boolean),hasChosen:true,preferences:params.preferences};}
      return structuredClone(result);
    }};
    window.mount = () => notificationUI.mountNotificationSettings(document.getElementById('notification-check-host'));
    window.settle = () => new Promise(resolve=>setTimeout(resolve,0));
    window.check = (condition,message) => {if(!condition)throw new Error(message)};
  `);
  await evaluate(`
    dispatchEvent(new Event('mossvale-native-ready'));
    check(calls.length===0,'native ready must not unregister an unresolved session');
    notificationUI.promptNativeNotifications();check(calls.length===0,'entry prompt waits for resolved sign-in');
    notificationUI.authorizeNativeBilling('current-token');
    check(calls.map(call=>call.method).join(',')==='billing.authorize,notifications.authorize','auth sync includes billing and notifications');
    check(calls[1].params.accessToken==='current-token','push uses the authenticated token');
    notificationUI.promptNativeNotifications();check(calls.at(-1).method==='notifications.prompt','successful game entry requests the native explanation');
    dispatchEvent(new Event('mossvale-native-ready'));
    check(calls.at(-1).params.accessToken==='current-token','ready replays the resolved session');
    notificationUI.authorizeNativeBilling(null);
    check(calls.at(-1).method==='notifications.authorize'&&calls.at(-1).params.accessToken===null,'explicit sign-out unregisters notifications');
    delete mossvaleNative.notifications;calls=[];notificationUI.authorizeNativeBilling('new-token');
    check(calls.length===1&&calls[0].method==='billing.authorize','old native versions never receive push commands');
    mount();check(document.body.textContent.includes('Update the Mossvale app'),'old native app has update guidance');
    check(document.querySelector('a').href.includes('play.google.com'),'update link matches platform');
    window.__MOSSVALE_NATIVE__=false;window.savedClient=mossvaleNative;delete window.mossvaleNative;calls=[];
    mount();check(document.body.textContent.includes('available in the Mossvale mobile app'),'browser explains mobile availability');
    check(calls.length===0,'browser never requests permissions');
    window.__MOSSVALE_NATIVE__=true;window.mossvaleNative=savedClient;mossvaleNative.notifications=true;mount();
  `);
  await evaluate(`(async()=>{
    await settle();
    check(calls.length===1&&calls[0].method==='notifications.status','opening settings only reads status');
    check(document.getElementById('notify-worldEvents').checked&&document.getElementById('notify-invites').checked&&!document.getElementById('notify-reminders').checked,'first consent suggests events and invites with reminders optional');
    check(getComputedStyle(document.querySelector('[data-notification-settings]')).display==='none','device settings recovery stays hidden until needed');
    document.getElementById('notify-invites').click();
    check(calls.length===1,'a checkbox does not request permission');
    document.querySelector('form').requestSubmit();await settle();
    check(calls.at(-1).method==='notifications.configure','saving opts in');
    check(JSON.stringify(calls.at(-1).params.preferences)===JSON.stringify({worldEvents:true,invites:false,reminders:false}),'categories are independent');
    check(document.querySelector('[role=status]').textContent.includes('saved'),'successful save confirmed');
    window.fail='<img src=x onerror=alert(1)> service unavailable';
    document.querySelector('form').requestSubmit();await settle();
    check(document.querySelector('[role=status]').textContent.includes('service unavailable'),'save failures are visible');
    check(!document.querySelector('[role=status] img'),'errors are escaped');
    check(document.getElementById('notify-worldEvents').checked,'failed save preserves choice for retry');
    window.fail='';result={permission:'denied',canAskAgain:false,registered:false,hasChosen:true,preferences:{worldEvents:false,invites:false,reminders:false}};
    document.querySelector('[data-notification-refresh]').click();await settle();
    check(!document.querySelector('[data-notification-settings]').hidden,'denied permission has settings recovery');
    check(document.querySelector('[role=status]').textContent.includes('blocked'),'denied status is explicit');
    check([...document.querySelectorAll('input')].every(input=>!input.checked),'saved opt-outs are never overridden by first-consent suggestions');
    document.querySelector('[data-notification-settings]').click();await settle();
    check(calls.at(-1).method==='notifications.settings','device settings action uses native bridge');
    window.fail='Offline';mount();await settle();
    check([...document.querySelectorAll('input')].every(input=>input.disabled),'unknown saved choices cannot be overwritten');
    check(!document.querySelector('[data-notification-refresh]').disabled,'status failures can be retried');
    window.fail='';result={permission:'granted',canAskAgain:true,registered:true,preferences:{worldEvents:true,invites:true,reminders:true}};
    document.querySelector('[data-notification-refresh]').click();await settle();
    check([...document.querySelectorAll('input')].every(input=>input.checked),'saved choices are restored');
    result.pendingRemoval=true;
    for(const input of document.querySelectorAll('input'))input.click();
    document.querySelector('form').requestSubmit();await settle();
    check(document.querySelector('[role=status]').textContent.includes('Waiting for a connection'),'offline opt-out explains pending subscription removal');
    check(document.querySelector('[role=status]').textContent.includes('may still arrive'),'offline opt-out makes continued delivery explicit');
    check(!document.querySelector('[role=status]').textContent.includes('All notifications are off'),'unconfirmed removal never claims all notifications are off');
    result.pendingRemoval=false;document.querySelector('[data-notification-refresh]').click();await settle();
    check(document.querySelector('[role=status]').textContent.includes('All notifications are off'),'confirmed removal clears the pending warning');
    result.preferences={worldEvents:true,invites:true,reminders:true};result.registered=true;
    document.querySelector('[data-notification-refresh]').click();await settle();
  })()`);
  for (const [name, width, height] of [['mobile', 390, 844], ['desktop', 1024, 800]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: name === 'mobile' });
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'), `${name} settings should fit without horizontal scrolling`);
    writeFileSync(join(tmpdir(), `mossvale-notifications-${name}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  }
  const main = readFileSync('src/main.ts', 'utf8');
  assert.match(main, /data-settings-tab="notifications">Notifications/);
  assert.match(main, /settingsTab==='notifications'\)mountNotificationSettings/);
  assert.match(main, /switchZone\(player.zone,player.instanceId\?\?null\)\.then\(\(\)=>\{if\(current\(\)&&!entryActive&&!rosterActive&&worldReady&&playerId===msg.id\)promptNativeNotifications\(\);\}\)/);
  console.log('PASS notification settings: explicit opt-in, independent choices, denied/offline recovery, legacy/browser guidance, auth and logout sync, phone/desktop layout.');
} finally {
  socket?.close();
  chrome.kill('SIGTERM');
  await delay(200);
  rmSync(profile, { recursive: true, force: true });
}
