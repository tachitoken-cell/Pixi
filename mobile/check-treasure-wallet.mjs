import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { walletBrowsers, walletPageUrl } from './navigation.ts';

const native = runInNewContext(stripTypeScriptTypes(readFileSync(new URL('./native-bridge.ts', import.meta.url), 'utf8').replace(/^export /gm, ''), { mode: 'transform' }) + ';({NativeError, cancelled, fields, requireActive, trustedGamePage})', { Error, URL });
const source = stripTypeScriptTypes(readFileSync(new URL('./treasure-wallet.ts', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '').replace('export function', 'function'));
const origin = 'https://mossvale.world', address = '0x' + '1'.repeat(40), signature = '0x' + '2'.repeat(130), transactionHash = '0x' + '3'.repeat(64);
const id = 'a'.repeat(64), readToken = 'b'.repeat(64), walletToken = 'c'.repeat(64);
const reply = value => ({ ok: true, status: 200, json: async () => value });
const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
function fixture() {
  const timers = new Map(), listeners = new Set(), foreground = new Set(), posts = [], opened = [], choices = [], pending = [], detected = [];
  let choosing, blocked = false, installed = true, now = 10000, respond, openFailure = false, backgroundOnOpen = false;
  const context = { ...native, Error, URL, URLSearchParams, AbortController, walletBrowsers, walletPageUrl,
    Date: class extends Date { static now() { return now; } },
    setTimeout: (fn, ms) => { timers.set(fn, ms); return fn; }, clearTimeout: fn => timers.delete(fn),
    AppState: { currentState: 'active', addEventListener: (_, fn) => { foreground.add(fn); return { remove: () => foreground.delete(fn) }; } },
    Linking: {
      canOpenURL: async url => { detected.push(url); return typeof installed === 'string' ? url.startsWith(installed + ':') : installed; },
      openURL: async url => { assert.equal(listeners.size, 1); opened.push(url); if (backgroundOnOpen) activate('background'); if (openFailure) throw Error('Synthetic open failure'); },
      addEventListener: (_, fn) => { listeners.add(fn); return { remove: () => listeners.delete(fn) }; },
    },
    fetch: async (url, options) => {
      assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, url.endsWith('/start') ? 'Bearer header.synthetic.signature' : undefined, 'only start carries account authorization');
      assert(!options.body.includes('header.synthetic.signature'), 'account credentials never enter the wallet operation');
      const call = { url, path: url.split('/').at(-1), body: JSON.parse(options.body), signal: options.signal }; posts.push(call);
      if (call.path === 'result') assert.deepEqual(call.body, { id, token: readToken });
      return respond ? respond(call) : reply(call.path === 'start' ? { id, readToken, walletToken, expiresAt: now + 170000 } : { result: null });
    },
  };
  runInNewContext(source, context);
  const api = context.createTreasureWallet({ blocked: () => blocked, authorization: realm => {
    assert([origin, 'https://us.mossvale.world', 'https://asia.mossvale.world'].includes(realm)); return 'header.synthetic.signature';
  }, choose: fn => { choosing = fn; choices.push(fn); }, pending: value => pending.push(value) });
  function activate(value) { context.AppState.currentState = value; for (const fn of foreground) fn(value); }
  return { api, timers, listeners, foreground, posts, opened, choices, pending, detected, activate,
    execute: (method = 'treasure.connect', params = {}, signal = new AbortController().signal, realm = origin) => api.execute({ method, params, signal, url: new URL(realm + '/') }),
    choose: wallet => { (choosing || choices.find(Boolean))?.(wallet); },
    tick: ms => { for (const [fn, delay] of [...timers]) if (ms === delay) { timers.delete(fn); fn(); } },
    send: url => { for (const fn of listeners) fn({ url }); },
    set blocked(value) { blocked = value; }, set installed(value) { installed = value; }, set respond(value) { respond = value; },
    set openFailure(value) { openFailure = value; }, set backgroundOnOpen(value) { backgroundOnOpen = value; }, set now(value) { now = value; },
  };
}
const clean = f => { assert.equal(f.listeners.size, 0); assert.equal(f.foreground.size, 0); assert.equal(f.timers.size, 0); assert.equal(f.api.busy(), false); assert.equal(f.pending.at(-1), undefined); };
const complete = (f, result) => { f.respond = call => reply(call.path === 'start' ? { id, readToken, walletToken, expiresAt: 180000 } : { result }); };
for (const { id: wallet } of walletBrowsers) {
  const f = fixture(); complete(f, { address });
  const task = f.execute(); assert.equal(f.posts.length, 0); assert.equal(f.api.busy(), true);
  f.choose(wallet); f.choose(wallet);
  assert.deepEqual(JSON.parse(JSON.stringify(await task)), { address });
  assert.equal(f.opened.length, 1);
  assert.equal(f.opened[0], walletPageUrl(wallet, `${origin}/wallet-action.html#id=${id}&token=${walletToken}`, origin));
  assert(!f.opened[0].includes(readToken), 'native result proof cannot enter the wallet URL'); clean(f);
  assert(!f.opened[0].includes('header.synthetic.signature'), 'account credentials never enter wallet URLs');
  complete(f, { signature });
  assert.deepEqual(JSON.parse(JSON.stringify(await f.execute('treasure.sign', { address, message: 'ownership', expiresAt: 310000 }))), { signature }, 'the existing server challenge lasts five minutes; only the handoff uses the shorter timeout');
  assert.equal(f.opened.length, 2, 'sign reuses the selected wallet');
  complete(f, { transactionHash });
  assert.deepEqual(JSON.parse(JSON.stringify(await f.execute('treasure.collect', { claim: { id: 'saved-claim' } }))), { transactionHash });
  clean(f);
  f.api.clear(); const retry = f.execute(); assert.equal(f.opened.length, 3, 'document navigation forgets the prior wallet');
  f.pending.at(-1).controller.abort(); await assert.rejects(retry, error => error.code === 4001); clean(f);
}
for (const realm of [origin, 'https://us.mossvale.world', 'https://asia.mossvale.world']) {
  const f = fixture(); complete(f, { address });
  const task = f.execute('treasure.connect', {}, undefined, realm); f.choose('phantom'); await task;
  assert(f.posts.every(call => call.url.startsWith(realm + '/api/native-wallet/'))); clean(f);
}
for (const realm of ['http://mossvale.world', 'https://evil.test', 'https://mossvale.world.evil.test']) {
  const f = fixture(); await assert.rejects(f.execute('treasure.connect', {}, undefined, realm)); assert.equal(f.posts.length, 0);
}
{
  const f = fixture(); f.blocked = true; await assert.rejects(f.execute(), error => error.code === -32002);
  f.blocked = false; const controller = new AbortController(), task = f.execute('treasure.connect', {}, controller.signal);
  await assert.rejects(f.execute(), error => error.code === -32002);
  controller.abort(); await assert.rejects(task, error => error.code === 4001); clean(f);
}
for (const [method, params] of [
  ['eth_sendTransaction', {}], ['treasure.connect', { target: 'arbitrary' }], ['treasure.sign', { address, message: 'test', expiresAt: 1 }],
  ['treasure.sign', { address: '0x' + '0'.repeat(40), message: 'test', expiresAt: 120000 }], ['treasure.collect', { claim: [] }],
]) { const f = fixture(); await assert.rejects(f.execute(method, params)); assert.equal(f.posts.length, 0); }
for (const outcome of ['missing', 'open-failure']) {
  const f = fixture(); f.installed = outcome !== 'missing'; f.openFailure = outcome === 'open-failure';
  const task = f.execute('treasure.collect', { claim: {} }), rejected = assert.rejects(task, error => error.code === (outcome === 'missing' ? 4200 : -32000));
  f.choose('phantom'); await rejected; clean(f);
}
{
  const f = fixture(); f.installed = 'okxweb3'; complete(f, { address });
  const task = f.execute(); f.choose('okx'); await task;
  assert.deepEqual(f.detected, ['okxwallet://', 'okxweb3://']); assert.match(f.opened[0], /^okxweb3:/); clean(f);
}
{
  const f = fixture(), controller = new AbortController(); f.backgroundOnOpen = true; complete(f, { address });
  const task = f.execute('treasure.connect', {}, controller.signal); f.choose('phantom'); await flush();
  assert.equal(f.posts.length, 1, 'opening a wallet never polls in the background');
  f.activate('active'); await task; clean(f);
}
{
  const f = fixture(), controller = new AbortController();
  const task = f.execute('treasure.collect', { claim: {} }, controller.signal); f.choose('phantom'); await flush();
  assert.equal(f.posts.length, 2);
  for (const callback of [`https://evil.test/mobile-auth/callback#walletAction=${id}`, `${origin}/mobile-auth/callback#walletAction=${'d'.repeat(64)}`, `${origin}/mobile-auth/callback#walletAction=${id}&transactionHash=${transactionHash}`]) f.send(callback);
  await flush(); assert.equal(f.posts.length, 2, 'untrusted callbacks cannot cause a result or poll');
  f.activate('background'); f.tick(2000); await flush(); assert.equal(f.posts.length, 2);
  f.activate('active'); await flush(); assert.equal(f.posts.length, 3);
  controller.abort(); await assert.rejects(task, error => error.code === -32000 && /Check your payout/.test(error.message)); clean(f);
  f.tick(2000); f.activate('active'); await flush(); assert.equal(f.posts.length, 3);
}
for (const callbackOrigin of [origin, 'https://us.mossvale.world', 'https://asia.mossvale.world']) {
  const f = fixture(), task = f.execute(); f.choose('phantom'); await flush();
  complete(f, { address }); f.send(`${callbackOrigin}/mobile-auth/callback#walletAction=${id}`);
  await task; assert.equal(f.posts.length, 3, 'valid return wakes secret polling without trusting URL results'); clean(f);
}
for (const phase of ['start', 'result']) {
  const f = fixture(), controller = new AbortController(); let release;
  f.respond = call => call.path === phase ? new Promise(resolve => { release = resolve; }) : reply({ id, readToken, walletToken, expiresAt: 180000 });
  const task = f.execute('treasure.connect', {}, controller.signal); f.choose('phantom'); await flush();
  controller.abort(); await assert.rejects(task, error => error.code === 4001); await flush();
  assert(f.posts.at(-1).signal.aborted); clean(f);
  release(reply(phase === 'start' ? { id, readToken, walletToken, expiresAt: 180000 } : { result: { address } })); await flush();
  assert.equal(f.opened.length, phase === 'start' ? 0 : 1, 'cancel suppresses late launch/results'); clean(f);
}
{
  const f = fixture(); let release;
  f.respond = call => call.path === 'start' ? reply({ id, readToken, walletToken, expiresAt: 180000 }) : new Promise(resolve => { release = resolve; });
  const task = f.execute(); f.choose('phantom'); await flush();
  f.activate('background'); await flush(); assert(f.posts.at(-1).signal.aborted);
  release(reply({ result: { address } })); await flush(); assert.equal(f.api.busy(), true, 'background response cannot resolve a request');
  complete(f, { address }); f.activate('active'); await task; clean(f);
}
for (const result of [{ signature }, { address, extra: true }, { address: '0x' + '0'.repeat(40) }, { error: { code: '4001', message: 'bad' } }, 9, {}]) {
  const f = fixture(); complete(f, result); const task = f.execute(), rejected = assert.rejects(task, error => error.code === -32000);
  f.choose('phantom'); await rejected; clean(f);
}
{
  const f = fixture(); complete(f, { error: { code: 4001, message: 'Wallet request declined.' } });
  const task = f.execute(), rejected = assert.rejects(task, error => error.code === 4001); f.choose('phantom'); await rejected; clean(f);
}
{
  const f = fixture(); let attempt = 0;
  f.respond = call => call.path === 'start' ? reply({ id, readToken, walletToken, expiresAt: 180000 }) : ++attempt === 1 ? { ok: false, status: 429 } : reply({ result: { address } });
  const task = f.execute(); f.choose('phantom'); await flush(); f.tick(2000); await task; clean(f);
}
{
  const f=fixture();
  f.respond=call=>call.path==='start'?reply({id,readToken,walletToken,expiresAt:180000}):{ok:false,status:410};
  const task=f.execute('treasure.collect',{claim:{}}),rejected=assert.rejects(task,error=>error.code===-32000);
  f.choose('phantom');await rejected;clean(f);
}
{
  const f=fixture();f.respond=()=>({ok:false,status:401});
  const task=f.execute(),rejected=assert.rejects(task,error=>error.code===4100&&/Sign in/.test(error.message));
  f.choose('phantom');await rejected;assert.equal(f.opened.length,0);clean(f);
}
console.log('PASS native voucher wallets: scoped operations, three realms, explicit choice, selected-wallet reuse, proof separation, strict responses, callbacks only wake secret polling, retries, background cancellation and uncertain transaction recovery.');
