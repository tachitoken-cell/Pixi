import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function load(file, imports = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(source, { module, exports: module.exports, require: name => { assert(name in imports, name); return imports[name]; }, URL, AbortController, setTimeout, clearTimeout });
  return module.exports;
}
const bridge = load('./native-bridge.ts');
const stored = new Map(), calls = [];
let beforeRead, beforeWrite, failure;
const secureStore = {
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 7,
  async getItemAsync(key, options) { calls.push(['get', key, options]); if (beforeRead) await beforeRead(); if (failure) throw failure; return stored.get(key) ?? null; },
  async setItemAsync(key, value, options) { calls.push(['set', key, options]); if (beforeWrite) await beforeWrite(); if (failure) throw failure; stored.set(key, value); },
  async deleteItemAsync(key, options) { calls.push(['delete', key, options]); if (failure) throw failure; stored.delete(key); },
};
const api = load('./auth-session.ts', { 'expo-secure-store': secureStore, './native-bridge': bridge });
const settings = { issuer: 'https://auth.example/realms/mossvale', clientId: 'mossvale-web' };
let configured = settings;
const service = () => api.createAuthSessionService({ configuredAuth: () => configured });
const invoke = (instance, method, params, signal = new AbortController().signal, origin = 'https://mossvale.world') => instance.execute({ method: `auth.${method}`, params, signal, url: new URL(origin) });
const plain = value => JSON.parse(JSON.stringify(value));
const first = { token: 'header.account1.signature', refreshToken: 'header.refresh1.signature', idToken: 'header.identity1.signature' };
const second = { token: 'header.account2.signature', refreshToken: 'header.refresh2.signature' };
let active = service();
assert.equal(await invoke(active, 'restore', settings), null);
assert.deepEqual(plain(await invoke(active, 'save', { ...settings, ...first })), { saved: true });
assert.equal(stored.size, 1);
active = service(); // A new app process has no in-memory token or operation queue.
for (const origin of ['https://mossvale.world', 'https://us.mossvale.world', 'https://asia.mossvale.world']) {
  assert.deepEqual(plain(await invoke(active, 'restore', settings, undefined, origin)), first);
}
await invoke(active, 'save', { ...settings, ...second });
assert.deepEqual(plain(await invoke(service(), 'restore', settings)), second, 'only the rotated refresh token survives restart');
assert(![...stored.values()].some(value => value.includes('refresh1')));
for (const [, , options] of calls) {
  assert.equal(options.keychainAccessible, secureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY);
  assert.equal(options.keychainService, 'world.mossvale.game.auth');
}

const count = calls.length;
for (const params of [{ ...settings, issuer: 'https://evil.example' }, { ...settings, clientId: 'other' }, { ...settings, extra: true }]) {
  await assert.rejects(invoke(active, 'restore', params));
}
assert.equal(calls.length, count, 'wrong configuration never opens secure storage');
configured = { ...settings, clientId: 'other' };
assert.equal(await invoke(active, 'restore', configured), null, 'a saved session cannot cross client bindings');
configured = undefined;
await assert.rejects(invoke(active, 'restore', settings), error => error.code === 4100);
configured = settings;
for (const [name, value] of [['token', null], ['refreshToken', 'not-a-jwt'], ['idToken', []], ['token', 'a'.repeat(16385) + '.b.c']]) {
  await assert.rejects(invoke(active, 'save', { ...settings, ...first, [name]: value }), error => error.code === -32602);
}
assert.deepEqual(plain(await invoke(active, 'restore', settings)), second, 'invalid input cannot replace the valid session');
const key = [...stored.keys()][0];
for (const corrupt of ['not-json', '[]', JSON.stringify({ ...settings, ...first, token: 'bad' }), JSON.stringify({ ...settings, ...first, secretExtra: 'untrusted' })]) {
  stored.set(key, corrupt);
  assert.equal(await invoke(active, 'restore', settings), null);
  assert.equal(stored.size, 0, 'corrupt credentials are discarded');
}
await invoke(active, 'save', { ...settings, ...first });
await invoke(active, 'clear', {});
assert.equal(await invoke(service(), 'restore', settings), null, 'logout survives app restart');

function latch() { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; }
// An accepted rotation survives navigation while it waits behind another storage operation.
const heldRead = latch(); beforeRead = () => heldRead.promise;
const reading = invoke(active, 'restore', settings);
await Promise.resolve();
const cancelledSave = new AbortController();
const saving = invoke(active, 'save', { ...settings, ...first }, cancelledSave.signal);
cancelledSave.abort(); beforeRead = undefined; heldRead.release();
await reading; await saving;
assert.deepEqual(plain(await invoke(service(), 'restore', settings)), first, 'reload cannot lose an accepted refresh-token rotation');

// A logout accepted after a native write always wins, even if both pages then navigate.
const heldWrite = latch(); beforeWrite = () => heldWrite.promise;
const writingController = new AbortController();
const writing = invoke(active, 'save', { ...settings, ...first }, writingController.signal);
await Promise.resolve();
const logoutController = new AbortController();
const clearing = invoke(active, 'clear', {}, logoutController.signal);
writingController.abort(); logoutController.abort();
beforeWrite = undefined; heldWrite.release();
await writing; await clearing;
assert.equal(await invoke(service(), 'restore', settings), null, 'navigation cannot undo an accepted logout');
await invoke(active, 'save', { ...settings, ...second });
assert.deepEqual(plain(await invoke(service(), 'restore', settings)), second, 'cancelled operations do not poison future sign-in');

// A stale restore must not hand credentials to a replaced document or changed issuer.
const staleRead = latch(); beforeRead = () => staleRead.promise;
const readController = new AbortController();
const stale = invoke(active, 'restore', settings, readController.signal);
const rejectedRead = assert.rejects(stale, error => error.code === 4001);
await Promise.resolve(); readController.abort(); beforeRead = undefined; staleRead.release(); await rejectedRead;
const changedRead = latch(); beforeRead = () => changedRead.promise;
const changing = invoke(active, 'restore', settings);
const rejectedChanged = assert.rejects(changing, error => error.code === 4100);
await Promise.resolve(); configured = { ...settings, issuer: 'https://other.example/realms/mossvale' }; beforeRead = undefined; changedRead.release(); await rejectedChanged;
configured = settings;
failure = Error('secret internal detail: header.refresh2.signature');
await assert.rejects(invoke(active, 'restore', settings), error => error.code === 4000 && !error.message.includes('secret') && !error.message.includes('refresh2'));
failure = undefined;
await invoke(active, 'clear', {});
console.log('PASS secure native sign-in: process restart, cross-realm rotation, config binding, device-only Keychain, malformed records, rotation across reloads, stale-read cancellation, durable logout, and sanitized failures.');
