import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { setImmediate as nextTurn } from 'node:timers/promises';

let calls = [], dialogs = [], reloads = 0, sequence = 0;
globalThis.location = { origin: 'https://mossvale.world', reload: () => reloads++ };
globalThis.localStorage = globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.updateGateKeycloak = class {
  constructor() { calls.push('constructor'); }
  async init() { calls.push('init'); this.authenticated = false; }
};
globalThis.updateGateSession = () => ({ restore: async () => { calls.push('restore'); }, save() {}, clear() {} });
const hook = registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.includes('/src/auth.ts')) {
    if (specifier === 'keycloak-js') return { shortCircuit: true, url: 'data:text/javascript,export default globalThis.updateGateKeycloak' };
    if (specifier === './native-auth.ts') return { shortCircuit: true, url: 'data:text/javascript,export const nativeAccountSession=()=>globalThis.updateGateSession()' };
  }
  return next(specifier, context);
} });
const policy = { apple: { minVersion: '1.0.3', minBuild: '50' }, google: { minVersion: '1.0.3', minBuild: '60' } };
async function open({ native = true, info, ua = '', device = '', touch = 0, selectedPolicy = policy, guest = false } = {}) {
  calls = []; dialogs = []; reloads = 0;
  globalThis.window = { __MOSSVALE_NATIVE__: native, __MOSSVALE_NATIVE_APP__: info, addEventListener() {} };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: ua, platform: device, maxTouchPoints: touch } });
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, 'dialog');
      const button = {}, handlers = new Map(), attributes = new Map();
      return { button, handlers, attributes, setAttribute: (key, value) => attributes.set(key, value),
        addEventListener: (name, handler) => handlers.set(name, handler), querySelector: () => button,
        showModal() { this.modal = true; } };
    },
    body: { append: dialog => dialogs.push(dialog) },
  };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/config?app-startup=1', 'startup must bypass already-installed workers that reject new config fields and return cached policy');
    assert.equal(options.cache, 'no-store');
    return Response.json({ keycloak: guest ? null : { url: 'https://accounts.example', realm: 'mossvale', clientId: 'game' }, mobileAppUpdate: selectedPolicy });
  };
  const auth = await import(`../src/auth.ts?app-update=${sequence++}`);
  let settled = false, result;
  const pending = auth.initAuth().then(value => { settled = true; result = value; });
  await nextTurn();
  return { auth, pending, settled: () => settled, result: () => result };
}
try {
  for (const options of [
    { native: false },
    { selectedPolicy: null },
    { info: { platform: 'apple', version: '1.0.3', build: '50' } },
    { info: { platform: 'google', version: '1.0.4', build: '1' } },
    { info: { platform: 'apple' }, selectedPolicy: { google: policy.google } },
  ]) {
    const test = await open(options); await test.pending;
    assert.equal(test.result(), 'signed-out'); assert.deepEqual(calls, ['constructor', 'restore', 'init']);
    assert.equal(dialogs.length, 0, 'browser, current, newer and unconfigured native platforms retain normal sign-in');
  }
  for (const options of [
    { info: { platform: 'apple', version: '1.0.2', build: '999' }, store: 'apple' },
    { info: { platform: 'google', version: '1.0.3', build: '59' }, store: 'google' },
    { ua: 'Android', store: 'google' },
    { device: 'MacIntel', touch: 5, store: 'apple' },
    { store: 'both' },
    { guest: true, ua: 'Android', store: 'google' },
  ]) {
    const test = await open(options);
    assert.equal(test.settled(), false, 'required updates keep authentication and guest startup pending');
    assert.deepEqual(calls, [], 'the update gate runs before creating Keycloak or restoring secure credentials');
    await assert.rejects(test.auth.getAccessToken(), /not ready/);
    await assert.rejects(test.auth.signIn(), /could not be opened/);
    await assert.rejects(test.auth.createAccount(), /could not be opened/);
    assert.equal(dialogs.length, 1); const dialog = dialogs[0]; assert(dialog.modal);
    assert.equal(dialog.attributes.get('aria-labelledby'), 'native-app-update-title');
    assert.equal(dialog.attributes.get('closedby'), 'none', 'browser close requests cannot dismiss the required update');
    assert.match(dialog.innerHTML, /Update Mossvale to continue/); assert.match(dialog.innerHTML, /Check again/); assert.match(dialog.innerHTML, /TestFlight/);
    assert.equal(dialog.innerHTML.includes('https://apps.apple.com/app/id6811825860'), options.store !== 'google');
    assert.equal(dialog.innerHTML.includes('https://play.google.com/store/apps/details?id=world.mossvale.game'), options.store !== 'apple');
    let prevented = false; dialog.handlers.get('cancel')({ preventDefault() { prevented = true; } });
    assert(prevented, 'Escape and native back cannot dismiss the required update');
    let stopped = false; prevented = false;
    dialog.handlers.get('keydown')({ key: 'Escape', preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
    assert(prevented && stopped, 'older WebViews stop Escape before native cancellation or game handlers');
    dialog.button.onclick(); assert.equal(reloads, 1); assert.equal(test.settled(), false, 'Check again reloads and cannot authorize the old binary');
  }
  console.log('PASS native app update: current/browser/disabled policy, old and unknown binaries, platform stores, non-dismissable gate, reload, and auth/guest blocked before credentials.');
} finally { hook.deregister(); }
