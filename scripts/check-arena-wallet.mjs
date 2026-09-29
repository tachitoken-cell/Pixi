import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { Wallet, getBytes, verifyMessage } from 'ethers';

class Element extends EventTarget {
  constructor(tagName) { super(); this.tagName = tagName; this.children = []; this.dataset = {}; this.hidden = false; this.scrollTop = 0; }
  setAttribute() {}
  append(node) { node.parentElement = this; this.children.push(node); }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  querySelectorAll() { return []; }
  querySelector() { return null; }
}
globalThis.HTMLElement = Element;
globalThis.document = { body: new Element('body'), createElement: tag => new Element(tag), activeElement: null };
globalThis.window = new EventTarget();
const wallet = Wallet.createRandom(), oldWallet = Wallet.createRandom(), sent = [], requested = [], connected = [];
const provider = { mossvaleWallet: true, async request(args) {
  requested.push(args);
  if (args.method === 'eth_chainId') return '0x1237';
  if (['eth_accounts', 'eth_requestAccounts'].includes(args.method)) return [wallet.address];
  if (args.method === 'personal_sign') { assert.equal(args.params[1].toLowerCase(), wallet.address.toLowerCase()); return wallet.signMessage(getBytes(args.params[0])); }
  assert.fail(`Connecting must not submit a transaction: ${args.method}`);
} };
let connect = async () => provider;
globalThis.__connectArenaWallet = signal => { connected.push(signal); return connect(signal); };
const hook = registerHooks({
  resolve(specifier, context, next) { return next(context.parentURL?.includes('/src/') && /^\.\/[\w-]+$/.test(specifier) ? `${specifier}.ts` : specifier, context); },
  load(url, context, next) {
    if (url.endsWith('/src/wallet-provider.ts')) return { format: 'module', shortCircuit: true, source: 'export const connectMossvaleWallet = signal => globalThis.__connectArenaWallet(signal);' };
    if (url.endsWith('.css')) return { format: 'module', shortCircuit: true, source: '' };
    return next(url, context);
  },
});
const { mountArenaWagerUI } = await import('../src/arena-wager-ui.ts'); hook.deregister();
let player = { id: 'arena-player', name: 'Fighter' }, opens = 0;
const ui = mountArenaWagerUI({ send: message => sent.push(message), getPlayer: () => player, allowed: () => true, onOpen: () => { opens++; } });
const state = wallet => ({ type: 'arenaWagers', status: { enabled: true }, wallet, wagers: [], open: true });
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(test) { for (let attempt = 0; attempt < 100; attempt++) { if (test()) return; await new Promise(resolve => setTimeout(resolve, 5)); } assert.fail('Wallet operation did not finish'); }

assert.equal(ui.walletReady(), false);
ui.update(state(oldWallet.address)); assert.equal(ui.walletReady(), false, 'A previous external wallet binding is not an integrated connection.');
ui.reset(); sent.length = 0;
ui.connect(); assert(ui.isOpen()); assert.equal(sent.length, 0, 'Opening the integrated wallet cannot race an arenaWagerOpen reply.');
await until(() => sent.some(message => message.type === 'arenaWalletChallenge'));
assert.equal(connected.length, 1); assert(connected[0] instanceof AbortSignal);
assert.deepEqual(sent, [{ type: 'arenaWalletChallenge', wallet: wallet.address }]);
assert.equal(ui.walletReady(), false, 'The local account still needs an ownership signature and authoritative binding.');
assert(!requested.some(request => request.method === 'personal_sign'), 'Connecting alone does not authorize ownership.');
const proof = 'Mossvale arena wallet ownership proof';
await ui.walletChallenge({ type: 'arenaWalletChallenge', address: wallet.address, message: proof, expiresAt: Date.now() + 30000 });
assert.equal(sent.at(-1).type, 'arenaWalletBind'); assert.equal(verifyMessage(proof, sent.at(-1).signature), wallet.address);
assert.equal(requested.filter(request => request.method === 'personal_sign').length, 1, 'Ownership goes through the selected integrated provider approval.');
assert.equal(ui.walletReady(), false);
ui.update(state(oldWallet.address)); assert.equal(ui.walletReady(), false, 'An old external binding cannot authorize an integrated stake.');
ui.update(state(wallet.address));
assert(!Object.hasOwn(player, 'auctionWallet'), 'Public player snapshots deliberately omit private wallet fields.');
assert.equal(ui.walletReady(), true, 'The same player and privately confirmed integrated wallet enable consent.');
player = { id: 'other-character', name: 'Other' }; assert.equal(ui.walletReady(), false, 'Another character does not inherit wallet readiness.');
ui.reset(); player = { id: 'arena-player', name: 'Fighter' }; assert.equal(ui.walletReady(), false);

for (const cancel of [() => ui.close(), () => ui.reset()]) {
  let resolve;
  connect = () => new Promise(done => { resolve = done; });
  const before = sent.length;
  ui.connect(); const signal = connected.at(-1); cancel(); assert(signal.aborted, 'Closing or resetting aborts the outstanding wallet UI.');
  resolve(provider); await tick();
  assert.equal(ui.isOpen(), false); assert.equal(ui.walletReady(), false); assert.equal(sent.length, before, 'A late wallet response cannot bind or authorize the old arena.');
  ui.reset();
}
connect = async () => ({ ...provider, mossvaleWallet: false });
const beforeExternal = sent.length; ui.connect(); await tick();
assert.equal(ui.walletReady(), false); assert.equal(sent.length, beforeExternal, 'An external provider returned accidentally is rejected before wallet binding.');
ui.reset(); connect = async () => provider;
ui.connect(); await until(() => sent.slice(beforeExternal).some(message => message.type === 'arenaWalletChallenge'));
ui.update(state(wallet.address)); assert.equal(ui.walletReady(), true);
window.dispatchEvent(new Event('mossvale-wallet-reset'));
assert.equal(ui.isOpen(), false); assert.equal(ui.walletReady(), false, 'Integrated wallet logout clears arena readiness.');
assert(opens > 0); delete globalThis.__connectArenaWallet;
console.log('Arena integrated wallet passed: direct connection, explicit ownership proof, private wallet binding, character isolation, external-provider rejection, logout and late-response cancellation.');
