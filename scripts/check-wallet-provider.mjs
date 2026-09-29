import assert from 'node:assert/strict';
import { configureHosting, setActiveHostingRealm } from '../src/hosting-client.ts';
import { createHostingConfig } from '../src/hosting-realms.ts';
import { chooseWallet, connectMossvaleWallet, openMossvaleWallet } from '../src/wallet-provider.ts';
import { registerHooks } from 'node:module';

class Element extends EventTarget {
  constructor(tagName = 'div') { super(); this.tagName = tagName; this.children = []; this.attributes = {}; this.hidden = false; this.open = false; }
  setAttribute(name, value) { this.attributes[name] = value; }
  append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
  remove() { this.parentElement.children = this.parentElement.children.filter(node => node !== this); this.parentElement = undefined; }
  get isConnected() { return this === document.body || !!this.parentElement?.isConnected; }
  focus() { document.activeElement = this; }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event('close')); }
  click() { this.dispatchEvent(new Event('click')); }
}
globalThis.HTMLElement = Element;
globalThis.location = { origin: 'https://mossvale.world' };
globalThis.document = { createElement: tag => new Element(tag), body: new Element('body') };
globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
const events = new EventTarget();
const listeners = new Set();
globalThis.window = {
  addEventListener(type, listener) { events.addEventListener(type, listener); if (type === 'eip6963:announceProvider') listeners.add(listener); },
  removeEventListener(type, listener) { events.removeEventListener(type, listener); if (type === 'eip6963:announceProvider') listeners.delete(listener); },
  dispatchEvent: event => events.dispatchEvent(event),
};
const trigger = new Element('button'); document.body.append(trigger); trigger.focus();
let requests = 0;
const provider = extra => ({ ...extra, request() { requests++; throw Error('Choosing an app must never contact a wallet'); } });
const preferred = provider({ isMetaMask: true }), alternative = provider({ isPhantom: true });
const dialog = () => document.body.children.find(node => node.tagName === 'dialog');
const buttons = () => dialog().children.find(node => node.className === 'wallet-picker-list').children;
const announce = (wallet, name) => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info: { name }, provider: wallet } }));
const cleaned = () => { assert.equal(dialog(), undefined); assert.equal(listeners.size, 1, 'EIP-6963 discovery keeps one lifetime listener'); assert.equal(document.activeElement, trigger); assert.equal(requests, 0); };

window.ethereum = { ...provider({}), providers: [preferred, alternative] };
let selection = chooseWallet(); assert.equal(buttons().length, 2, 'legacy provider arrays expose individual apps, not the preferred-wallet multiplexer');
buttons()[0].click(); assert.equal(await selection, preferred); cleaned();

delete window.ethereum;
selection = chooseWallet(); assert.equal(buttons().length, 0); assert(!dialog().children.find(node => node.className === 'wallet-picker-empty').hidden);
window.phantom = { ethereum: alternative };
dialog().children.find(node => node.className === 'wallet-picker-actions').children[0].click();
assert.equal(buttons().length, 1, 'refresh discovers a newly injected wallet');
buttons()[0].click(); assert.equal(await selection, alternative); cleaned();
delete window.phantom;

window.ethereum = preferred;
let settled = false; selection = chooseWallet(); void selection.then(() => { settled = true; });
await Promise.resolve();
assert.equal(settled, false, 'even one previously preferred wallet requires an explicit choice');
assert(dialog().open); assert.equal(buttons()[0].textContent, 'MetaMask');
announce(alternative, 'Phantom <img onerror=alert(1)>');
assert.equal(settled, false, 'late provider discovery never selects a wallet');
assert.equal(buttons().length, 1, 'direct announcements replace the ambiguous preferred-wallet fallback');
assert.equal(buttons()[0].textContent, 'Phantom <img onerror=alert(1)>', 'untrusted names remain text');
announce(alternative, 'Phantom'); assert.equal(buttons().length, 1, 'repeat announcements do not duplicate providers');
window.ethereum = provider({ isRabby: true });
buttons()[0].click(); assert.equal(await selection, alternative, 'the clicked provider is pinned despite a changed browser default'); cleaned();

window.trustwallet = preferred;
selection = chooseWallet(); assert.equal(buttons().length, 2, 'a legacy-only wallet remains available beside announced wallets');
const previousList = dialog().children.find(node => node.className === 'wallet-picker-list');
buttons().find(button => button.textContent === 'Trust Wallet').click(); assert.equal(await selection, preferred); cleaned();
delete window.trustwallet;
announce(preferred, 'MetaMask'); assert.equal(previousList.children.length, 2, 'closed dialogs stop reacting to announcements'); cleaned();

for (const cancelWith of ['Cancel', 'Escape', 'native cancel', 'native close']) {
  selection = chooseWallet(); const rejected = assert.rejects(selection, error => error.code === 'WALLET_SELECTION_CANCELLED');
  assert(dialog().open, 'a new link always opens a fresh chooser');
  if (cancelWith === 'Cancel') dialog().children.find(node => node.className === 'wallet-picker-actions').children[1].click();
  else if (cancelWith === 'Escape') { const event = new Event('keydown', { cancelable: true }); Object.defineProperty(event, 'key', { value: 'Escape' }); dialog().dispatchEvent(event); assert(event.defaultPrevented); }
  else if (cancelWith === 'native cancel') dialog().dispatchEvent(new Event('cancel', { cancelable: true }));
  else dialog().close();
  await rejected; cleaned();
}

selection = chooseWallet(); assert.equal(buttons().length, 2, 'late announcements stay available to the next explicit chooser');
buttons()[0].click(); assert.equal(await selection, alternative); cleaned();
// Optional embedded wallets arrive asynchronously without contacting Turnkey or selecting a wallet.
let configReads = 0;
configureHosting(createHostingConfig('eu', '', 'https://us.mossvale.world', 'https://asia.mossvale.world')); setActiveHostingRealm('us');
globalThis.fetch = async (url, options) => { assert.equal(url, 'https://us.mossvale.world/api/config'); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error'); configReads++; return { ok: true, json: async () => ({ turnkey: { organizationId: '11111111-1111-4111-8111-111111111111', authProxyConfigId: '22222222-2222-4222-8222-222222222222' } }) }; };
selection = chooseWallet();
await new Promise(resolve => setImmediate(resolve));
const embedded = buttons().find(button => button.textContent === 'Mossvale wallet · game account');
assert(embedded, 'configured embedded wallet appears beside external wallets');
embedded.click(); const selectedEmbedded = await selection; assert.equal(selectedEmbedded.mossvaleWallet, true); cleaned();
setActiveHostingRealm('asia'); await assert.rejects(selectedEmbedded.request({ method: 'eth_requestAccounts' }), /realm changed/); setActiveHostingRealm('us');
const before = configReads;
selection = chooseWallet({ embedded: false, description: 'Choose another wallet with your original auction address.' });
assert.equal(dialog().children.find(node => node.id === 'wallet-picker-description').textContent, 'Choose another wallet with your original auction address.');
await new Promise(resolve => setImmediate(resolve));
assert.equal(configReads, before, 'native handoff never loads an account-dependent wallet');
assert(!buttons().some(button => button.textContent.includes('game account')));
buttons()[0].click(); await selection; cleaned();
console.log('Wallet chooser checks passed: explicit choice, delayed discovery, legacy wallets, safe labels, cancellation and cleanup.');
const lifetime = new AbortController();
selection = chooseWallet({ embedded: false, signal: lifetime.signal });
const aborted = assert.rejects(selection, error => error.name === 'AbortError');
lifetime.abort(); await aborted; cleaned();
await assert.rejects(chooseWallet({ signal: lifetime.signal }), error => error.name === 'AbortError');
cleaned();

// Arena connects straight to the integrated wallet; the existing provider still owns approvals.
const config = { organizationId: '11111111-1111-4111-8111-111111111111', authProxyConfigId: '22222222-2222-4222-8222-222222222222' };
const walletRequests = [], opened = [], timeouts = [], fetches = [];
const integrated = { mossvaleWallet: true, async request(args) { walletRequests.push(args); return args.method; }, on() {}, removeListener() {} };
let directOpen = () => integrated, discoveries = 0;
const discovered = () => { discoveries++; };
window.addEventListener('eip6963:requestProvider', discovered);
globalThis.__directMossvaleWallet = (...args) => { opened.push(args); return directOpen(...args); };
const uiModule = new URL('../src/turnkey-ui.ts', import.meta.url).href;
const hook = registerHooks({ load(url, context, next) {
  return url === uiModule ? { format: 'module', shortCircuit: true, source: 'export const openTurnkeyWallet = (...args) => globalThis.__directMossvaleWallet(...args);' } : next(url, context);
} });
const originalTimeout = AbortSignal.timeout;
AbortSignal.timeout = ms => { assert.equal(ms, 5000); const controller = new AbortController(); timeouts.push(controller); return controller.signal; };
const response = (value = { turnkey: config }) => ({ ok: true, json: async () => value });
const configured = async (url, options) => {
  assert.equal(url, 'https://us.mossvale.world/api/config'); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store'); assert(options.signal instanceof AbortSignal);
  fetches.push(options.signal); options.signal.throwIfAborted(); return response();
};
try {
  globalThis.fetch = configured;
  const caller = new AbortController(), connected = await connectMossvaleWallet(caller.signal);
  assert.equal(connected, integrated, 'Return the existing integrated provider without wrapping or replacing its approvals.');
  assert.equal(connectMossvaleWallet, openMossvaleWallet, 'Arena and auctions share the reviewed realm-aware connection.');
  const walletOptions = opened.at(-1)[2];
  assert.deepEqual(opened.at(-1), [config, undefined, { connect: true, signal: walletOptions.signal }]);
  assert(walletOptions.signal instanceof AbortSignal); assert.notEqual(walletOptions.signal, caller.signal, 'Wallet lifetime also follows the active realm.');
  assert.notEqual(fetches.at(-1), caller.signal, 'Configuration reads combine caller cancellation with their own timeout.');
  assert.equal(walletRequests.length, 0, 'Opening the wallet never silently signs ownership or sends a transaction.');
  timeouts.at(-1).abort(new DOMException('Timed out', 'TimeoutError'));
  assert.equal(caller.signal.aborted, false, 'The config timeout must not cancel the wallet after it opens.');
  for (const args of [{ method: 'eth_requestAccounts' }, { method: 'personal_sign', params: ['ownership-proof'] },
    { method: 'eth_sendTransaction', params: [{ to: 'reviewed-contract', data: 'reviewed-transaction' }] }]) {
    assert.equal(await connected.request(args), args.method); assert.equal(walletRequests.at(-1), args, 'Explicit requests reach the unchanged approval provider.');
  }
  assert.equal(await connectMossvaleWallet(), integrated); assert.equal(opened.at(-1)[2].connect, true); assert(opened.at(-1)[2].signal instanceof AbortSignal);

  const successfulOpens = opened.length;
  for (const value of [{}, { turnkey: null }, { turnkey: {} }, { turnkey: { ...config, organizationId: 'invalid' } },
    { turnkey: { ...config, authProxyConfigId: 12 } }, { turnkey: { ...config, authProxyConfigId: null } }]) {
    globalThis.fetch = async () => response(value);
    await assert.rejects(connectMossvaleWallet(), /unavailable/);
  }
  globalThis.fetch = async () => ({ ok: false }); await assert.rejects(connectMossvaleWallet(), /could not load/);
  globalThis.fetch = async () => { throw Error('Config network unavailable'); }; await assert.rejects(connectMossvaleWallet(), /Config network unavailable/);
  globalThis.fetch = async () => ({ ok: true, json: async () => { throw Error('Invalid config response'); } });
  await assert.rejects(connectMossvaleWallet(), /Invalid config response/);
  assert.equal(opened.length, successfulOpens, 'Missing or failed configuration never opens a wallet or falls back to external discovery.');

  globalThis.fetch = configured;
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(connectMossvaleWallet(cancelled.signal), error => error.name === 'AbortError');
  let returnConfig;
  globalThis.fetch = () => new Promise(resolve => { returnConfig = resolve; });
  const late = new AbortController(), lateOpen = connectMossvaleWallet(late.signal);
  late.abort(); returnConfig(response());
  await assert.rejects(lateOpen, error => error.name === 'AbortError');
  assert.equal(opened.length, successfulOpens, 'A late successful config response cannot reopen a closed arena.');

  globalThis.fetch = (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
  const timedOut = connectMossvaleWallet(); timeouts.at(-1).abort(new DOMException('Timed out', 'TimeoutError'));
  await assert.rejects(timedOut, error => error.name === 'TimeoutError');
  assert.equal(opened.length, successfulOpens);

  globalThis.fetch = configured;
  directOpen = (_config, _container, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
  const closing = new AbortController(), opening = connectMossvaleWallet(closing.signal);
  await new Promise(resolve => setImmediate(resolve)); assert.notEqual(opened.at(-1)[2].signal, closing.signal); assert.equal(opened.at(-1)[2].connect, true);
  closing.abort(); await assert.rejects(opening, error => error.name === 'AbortError');
  directOpen = () => { throw Object.assign(Error('Wallet approval cancelled'), { code: 'WALLET_ACTION_CANCELLED' }); };
  await assert.rejects(connectMossvaleWallet(), error => error.code === 'WALLET_ACTION_CANCELLED');
  assert.equal(discoveries, 0, 'Direct Mossvale connection never dispatches external-wallet discovery.');
  assert.equal(dialog(), undefined, 'Direct connection never opens the wallet chooser.');
  assert.equal(requests, 0, 'Injected external wallets are never contacted.');
} finally {
  AbortSignal.timeout = originalTimeout; hook.deregister(); window.removeEventListener('eip6963:requestProvider', discovered);
  delete globalThis.__directMossvaleWallet;
}
console.log('Wallet provider checks passed: explicit chooser, safe discovery/cleanup, direct integrated connection, unchanged approvals, config failures, timeout and cancellation without external-wallet fallback.');
