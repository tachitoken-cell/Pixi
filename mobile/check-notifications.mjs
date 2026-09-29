import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function load(file, imports = {}, globals = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  runInNewContext(source, { module, exports: module.exports, require: id => { assert(id in imports, id); return imports[id]; }, URL, AbortController, setTimeout, clearTimeout, atob, ...globals });
  return module.exports;
}
const bridge = load('./native-bridge.ts');
const origin = 'https://mossvale.world';
const all = { worldEvents: true, invites: true, reminders: true }, off = { worldEvents: false, invites: false, reminders: false };
const jwt = (sub, refresh = 0) => `header.${Buffer.from(JSON.stringify({ iss: 'https://account.mossvale.world/realms/mossvale', sub, refresh })).toString('base64url')}.signature`;
const plain = value => JSON.parse(JSON.stringify(value));
async function flush() { for (let i = 0; i < 80; i++) await Promise.resolve(); }
function fixture(store = new Map()) {
  const state = { permission: 'undetermined', canAskAgain: true, allow: true, prompts: 0, settings: 0, channels: [], calls: [], alerts: [], listeners: new Map(), token: 'ExpoPushToken[device-one]', tokenCalls: 0, offline: false, timers: new Map() };
  const access = () => ({ status: state.permission, granted: state.permission === 'granted', canAskAgain: state.canAskAgain });
  const listen = (type, listener) => { state.listeners.set(type, listener); return { remove: () => state.listeners.delete(type) }; };
  const sdk = {
    setNotificationHandler: value => { state.handler = value; },
    getPermissionsAsync: async () => access(),
    requestPermissionsAsync: async () => { state.prompts++; state.permission = state.allow ? 'granted' : 'denied'; return access(); },
    getExpoPushTokenAsync: async options => { assert.equal(options.projectId, 'project-id'); state.tokenCalls++; return state.getToken ? state.getToken() : { data: state.token }; },
    setNotificationChannelAsync: async (id, value) => state.channels.push({ id, ...value }),
    AndroidImportance: { HIGH: 4 },
    addPushTokenListener: listener => listen('token', listener),
  };
  let id = 0;
  const { createNativeNotifications } = load('./notifications.ts', {
    'react-native': { Alert: { alert: (...args) => state.alerts.push(args) }, Platform: { OS: 'android' }, AppState: { currentState: 'active', addEventListener: (_type, listener) => listen('state', listener) }, Linking: { openSettings: async () => { state.settings++; } } },
    'expo-notifications': sdk,
    'expo-constants': { default: { easConfig: { projectId: 'project-id' } }, __esModule: true },
    'expo-secure-store': { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only', getItemAsync: async key => store.get(key) || null, setItemAsync: async (key, value, options) => { assert.equal(options.keychainAccessible, 'device-only'); store.set(key, value); if (state.write) await state.write(JSON.parse(value)); } },
    './native-bridge': { ...bridge, randomDocumentId: () => (++id).toString(16).padStart(32, '0') },
  }, { setTimeout: (callback, ms) => { const id = Symbol(); state.timers.set(id, { callback, ms }); return id; }, clearTimeout: id => state.timers.delete(id) });
  const service = createNativeNotifications({ configuredUrl: origin + '/', development: false, request: async (url, options) => {
    const body = JSON.parse(options.body); state.calls.push({ url, ...options, body });
    assert.equal(options.redirect, 'error'); assert.equal(url.includes('ExpoPushToken'), false);
    if (state.offline) throw Error('Network unavailable');
    if (state.fetch) return state.fetch(url, options);
    return { ok: true, json: async () => ({ registered: url.endsWith('/register') }) };
  } });
  const execute = (method, params = {}, signal = new AbortController().signal) => service.execute({ method, params, signal, url: new URL(origin) });
  return { state, store, service, execute, saved: () => JSON.parse(store.get('mossvale.notifications')), authorize: token => execute('notifications.authorize', { accessToken: token }), configure: preferences => execute('notifications.configure', { preferences }) };
}

{
  const f = fixture();
  assert.deepEqual(plain(await f.state.handler.handleNotification()), { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false });
  f.service.start(); await flush();
  assert.equal(f.state.listeners.size, 2); assert.equal(f.state.prompts, 0);
  assert.deepEqual(plain(await f.execute('notifications.status')), { permission: 'undetermined', canAskAgain: true, registered: false, pendingRemoval: false, hasChosen: false, preferences: off });
  await assert.rejects(f.configure(all), error => error.code === 4100);
  await f.authorize(jwt('alice')); assert.equal(f.state.calls.length, 0); assert.equal(f.state.prompts, 0, 'sign-in never prompts');
  const configured = await f.configure(all);
  assert.deepEqual(plain(configured.preferences), all); assert.equal(configured.registered, true); assert.equal(f.state.prompts, 1);
  assert(f.state.channels.every(channel => channel.id === 'mossvale' && channel.importance === 4 && channel.sound === 'default' && channel.enableVibrate === true), 'new Android channels use high importance with sound and vibration for heads-up alerts');
  const registered = f.state.calls.at(-1), secret = registered.body.revokeSecret;
  assert.equal(registered.url, origin + '/api/notifications/register'); assert.equal(registered.headers.Authorization, `Bearer ${jwt('alice')}`);
  assert.deepEqual(registered.body, { token: f.state.token, revokeSecret: secret, platform: 'android', preferences: all });
  assert.match(secret, /^[a-f0-9]{64}$/); assert(!JSON.stringify(configured).includes('PushToken'), 'device token remains native-only');
  await f.authorize(jwt('alice', 1)); assert.equal(f.state.calls.at(-1).body.revokeSecret, secret, 'JWT refresh preserves account consent');
  const before = f.state.calls.length; f.state.listeners.get('state')('background'); await flush(); assert.equal(f.state.calls.length, before);
  f.state.listeners.get('state')('active'); await flush(); assert.equal(f.state.calls.length, before + 1);
  const beforeRotation = f.state.calls.length;
  f.state.token = 'ExpoPushToken[device-rotated]'; f.state.listeners.get('token')(); await flush();
  assert.deepEqual(f.state.calls.slice(beforeRotation).map(call => call.url.split('/').at(-1)), ['unregister', 'register'], 'token rotation revokes the old token before registering its replacement');
  assert.equal(f.saved().pending.length, 0, 'successful rotation leaves no old subscription waiting for a future sync');
  assert.equal(f.saved().registration.token, f.state.token); assert.notEqual(f.saved().registration.revokeSecret, secret, 'rotation gets a fresh revocation capability');
  await f.authorize(jwt('bob'));
  assert.equal(f.state.calls.at(-1).url, origin + '/api/notifications/unregister');
  assert.deepEqual(plain((await f.execute('notifications.status')).preferences), off, 'account switches cannot inherit another player\'s consent');
  assert.equal(f.state.prompts, 1);
  await f.execute('notifications.settings'); assert.equal(f.state.settings, 1);
  f.service.stop(); assert.equal(f.state.listeners.size, 0); assert.equal(f.state.timers.size, 0);
}
{
  const f = fixture();
  assert.equal((await f.execute('notifications.prompt')).shown, false, 'no prompt before a resolved sign-in');
  await f.authorize(jwt('alice'));
  assert.equal((await f.execute('notifications.prompt')).shown, true);
  assert.equal(f.state.alerts.length, 1); assert.equal(f.state.prompts, 0, 'entering the world only shows our explanation, not an OS permission request');
  const [title, description, buttons, options] = f.state.alerts[0];
  assert.equal(title, 'Stay in the adventure'); assert.match(description, /daily reminder after 24 hours/);
  assert.equal(options.cancelable, true); assert.equal(buttons[0].text, 'Not now');
  assert.equal((await f.execute('notifications.prompt')).shown, false, 'reconnecting cannot nag again');
  buttons[1].onPress(); await flush();
  assert.equal(f.state.prompts, 1); assert.deepEqual(f.saved().preferences, { worldEvents: true, invites: true, reminders: false });
  await f.configure(off); await f.authorize(null); await f.authorize(jwt('alice'));
  assert.equal((await f.execute('notifications.prompt')).shown, false, 'saved opt-outs stay respected after sign-out and sign-in');
  assert.deepEqual(plain((await f.execute('notifications.status')).preferences), off);
  assert.equal((await f.execute('notifications.status')).hasChosen, true);
  const restored = fixture(f.store); await restored.authorize(jwt('alice'));
  assert.equal((await restored.execute('notifications.prompt')).shown, false, 'prompt decisions survive process restart');
  await restored.authorize(jwt('bob')); assert.equal((await restored.execute('notifications.prompt')).shown, true);
  restored.state.alerts[0][2][2].onPress(); await flush();
  assert.deepEqual(restored.saved().preferences, all, 'daily reminders require their own explicit opt-in choice');
}
{
  const f = fixture(); await f.authorize(jwt('alice')); await f.execute('notifications.prompt');
  const enable = f.state.alerts[0][2][1].onPress;
  await f.authorize(null); enable(); await flush();
  assert.equal(f.state.prompts, 0, 'a dismissed account cannot enable notifications from a stale prompt');
  const restored = fixture(f.store); await restored.authorize(jwt('alice'));
  assert.equal((await restored.execute('notifications.prompt')).shown, false, 'Not now is remembered across sign-ins and app restarts');
}
{
  const f = fixture(); await f.authorize(jwt('alice')); f.state.allow = false;
  assert.deepEqual(plain((await f.configure(all)).preferences), off); assert.equal(f.state.calls.length, 0);
  assert.equal((await f.execute('notifications.prompt')).shown, false, 'OS denial also suppresses the first-entry prompt');
  f.state.canAskAgain = false; await f.configure(all); assert.equal(f.state.prompts, 1, 'a blocked OS permission is not repeatedly requested');
  await assert.rejects(f.configure({ ...all, unwanted: true }), error => error.code === -32602);
  await assert.rejects(f.configure({ ...all, invites: 'yes' }), error => error.code === -32602);
  await assert.rejects(f.authorize('invalid'), error => error.code === 4100);
}
{
  const f = fixture(); await f.authorize(jwt('alice')); await f.configure(all);
  f.state.permission = 'denied';
  const status = await f.execute('notifications.status');
  assert.equal(status.registered, false);
  assert.equal(f.state.calls.at(-1).url, origin + '/api/notifications/unregister', 'checking status after OS revocation removes server subscription');
}
{
  const f = fixture(); await f.authorize(jwt('alice')); await f.configure(all);
  f.state.permission = 'denied'; f.state.canAskAgain = false;
  const status = await f.configure(off);
  assert.equal(status.registered, false); assert.deepEqual(plain(status.preferences), off);
  assert.equal(f.state.calls.at(-1).url, origin + '/api/notifications/unregister', 'turning off works even after OS permission was revoked');
}
{
  const f = fixture(); await f.authorize(jwt('alice'));
  let finish;
  f.state.write = saved => saved.registration ? new Promise(resolve => { finish = resolve; }) : undefined;
  const enabling = f.configure(all); await flush(); assert(finish);
  const logout = f.authorize(null); f.state.write = undefined; finish();
  await enabling; await logout; await flush();
  assert(f.state.calls.every(call => call.url.endsWith('/unregister')), 'logout while secure storage is pending must prevent register dispatch');
  assert.equal(f.saved().account, undefined);
}
{
  const f = fixture(); await f.authorize(jwt('alice')); await f.configure(all);
  f.state.offline = true;
  const disabled = await f.configure(off);
  assert.equal(disabled.pendingRemoval, true, 'offline opt-out reports that server removal is still pending');
  assert.deepEqual(plain(disabled.preferences), off); assert.equal(disabled.registered, false);
  assert.equal((await f.execute('notifications.status')).pendingRemoval, true, 'status cannot report completed removal while the device is offline');
  f.state.offline = false;
  assert.equal((await f.execute('notifications.status')).pendingRemoval, false, 'refresh retries removal and only clears the warning after confirmation');
  assert.equal(f.saved().pending.length, 0);
}
{
  const f = fixture(); await f.authorize(jwt('alice')); await f.configure(all);
  f.state.offline = true; await f.authorize(null);
  assert.equal(f.saved().pending.length, 1); assert.equal(f.saved().account, undefined); assert.equal(f.saved().registration, undefined);
  assert(!JSON.stringify(f.saved()).includes(jwt('alice')), 'offline logout never persists the bearer token');
  assert.deepEqual(plain((await f.execute('notifications.status')).preferences), off);
  const restored = fixture(f.store); restored.service.start(); await flush();
  assert.equal(restored.saved().pending.length, 0, 'a cold start retries logout without requiring another sign-in');
  assert.equal(restored.state.calls[0].url, origin + '/api/notifications/unregister'); assert.equal(restored.state.calls[0].headers.Authorization, undefined);
  assert.equal(restored.state.prompts, 0); restored.service.stop();
}
{
  const f = fixture(); await f.authorize(jwt('alice'));
  let finish; f.state.getToken = () => new Promise(resolve => { finish = resolve; });
  const enabling = f.configure(all); await flush();
  const logout = f.authorize(null); finish({ data: f.state.token }); await enabling; await logout;
  assert.equal(f.state.calls.length, 0, 'token acquisition completing after logout cannot register');
  assert.equal(f.saved().account, undefined);
}
for (const stall of ['token', 'request', 'body']) {
  const f = fixture(); await f.authorize(jwt('alice'));
  if (stall === 'token') f.state.getToken = () => new Promise(() => {});
  else f.state.fetch = async () => stall === 'request' ? new Promise(() => {}) : { ok: true, json: () => new Promise(() => {}) };
  const enabling = f.configure(all), rejected = assert.rejects(enabling, error => error.code === 4000);
  await flush(); assert.equal(f.state.timers.size, 1);
  [...f.state.timers.values()][0].callback(); await rejected;
  f.state.fetch = undefined; await f.authorize(null); await flush();
  assert.equal(f.saved().registration, undefined, `${stall}: an unresponsive native API cannot strand logout`);
  assert.equal(f.state.timers.size, 0);
}
console.log('PASS native notifications: first-entry prompt, remembered dismissals and opt-outs, event/invite defaults, optional daily reminders, explicit OS consent, token rotation, foreground suppression, durable offline logout and bounded stalled requests.');
