import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { Interface, formatUnits, getAddress, ZeroAddress } from 'ethers';

const abi = new Interface(['function proceeds(address) view returns(uint256)', 'function withdraw(address recipient)']);
const wallet = getAddress('0x' + '11'.repeat(20)), other = getAddress('0x' + '22'.repeat(20));
const current = getAddress('0x' + '33'.repeat(20)), previous = getAddress('0x' + '44'.repeat(20));
const oldest = getAddress('0x' + '55'.repeat(20));
const hash = '0x' + 'aa'.repeat(32), amount = 2n * 10n ** 18n;
const baseHealth = { ok: true, realmId: 'us', mossAuction: { enabled: true, chainId: 4663, decimals: 18,
  token: '0x6742883Eef788E2424CE5a1b0d4303144AaEc0a5', contract: current, previousContract: previous } };
class Element extends EventTarget {
  constructor(tag) { super(); this.tagName = tag; this.children = []; this.textContent = ''; this.disabled = false; }
  setAttribute() {}
  append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
  replaceChildren(...nodes) { for (const child of this.children) child.parentElement = undefined; this.children = []; this.append(...nodes); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = undefined; }
  get isConnected() { return this === document.body || !!this.parentElement?.isConnected; }
  querySelectorAll(tag) { return this.children.flatMap(child => [...(child.tagName === tag ? [child] : []), ...child.querySelectorAll(tag)]); }
  click() { if (!this.disabled) this.onclick?.(); }
}
globalThis.document = { createElement: tag => new Element(tag), body: new Element('body') };
globalThis.window = new EventTarget();
let identity, realm, health, selectedAccount, chain, balances, choiceHold, callHold, sendHold, receiptHold, sends, calls, fetches, chooserCalls, events, choices, descriptions, switchErrors, onSwitch, native = false;
const external = {
  on(event, fn) { events.set(event, fn); }, removeListener(event) { events.delete(event); },
  async request({ method, params = [] }) {
    calls.push(method);
    if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [selectedAccount];
    if (method === 'eth_chainId') return chain;
    if (method === 'wallet_switchEthereumChain') {
      assert.deepEqual(params, [{ chainId: '0x1237' }]);
      if (switchErrors.length) throw switchErrors.shift();
      if (onSwitch) await onSwitch();
      chain = '0x1237'; events.get('chainChanged')?.(chain); return null;
    }
    if (method === 'wallet_addEthereumChain') {
      assert.equal(params[0].chainId, '0x1237'); assert.deepEqual(params[0].rpcUrls, ['https://rpc.mainnet.chain.robinhood.com']); return null;
    }
    if (method === 'eth_call') { if (callHold) { const pending = callHold; callHold = undefined; await pending; } return abi.encodeFunctionResult('proceeds', [balances.get(params[0].to) ?? 0n]); }
    if (method === 'eth_sendTransaction') { sends.push(structuredClone(params[0])); if (sendHold) await sendHold; return hash; }
    throw Error(`Unexpected wallet method ${method}`);
  },
};
class BrowserProvider {
  constructor(provider) { this.provider = provider; }
  send(method, params) { return this.provider.request({ method, params }); }
  call(transaction) { return this.send('eth_call', [transaction, 'latest']); }
  async waitForTransaction() { if (receiptHold) await receiptHold; return { status: 1 }; }
  destroy() {}
}
globalThis.__recovery = { BrowserProvider, Interface, formatUnits, getAddress, ZeroAddress,
  MOSS_TOKEN: { address: baseHealth.mossAuction.token, decimals: baseHealth.mossAuction.decimals },
  getWalletIdentity: () => identity,
  isNativeApp: () => native,
  activeRealmTarget: path => { assert.equal(path, '/api/config'); return { url: 'https://us.mossvale.world/api/config', signal: realm.signal }; },
  chooseWallet: async options => { chooserCalls++; assert.equal(options.embedded, false); assert(options.signal instanceof AbortSignal);
    descriptions.push(options.description);
    if (choiceHold) await choiceHold; if (options.signal.aborted) throw Error('Selection cancelled.');
    const choice = choices.shift(); if (choice instanceof Error) throw choice; return choice ?? external; },
};
const exported = { ethers: ['BrowserProvider', 'Interface', 'formatUnits', 'getAddress', 'ZeroAddress'], './auth.ts': ['getWalletIdentity'],
  './hosting-client.ts': ['activeRealmTarget'], './wallet-provider.ts': ['chooseWallet'], './native-client.ts': ['isNativeApp'], './auction.ts': ['MOSS_TOKEN'] };
const hook = registerHooks({
  resolve(specifier, context, next) { return context.parentURL?.endsWith('/auction-recovery.ts') && exported[specifier]
    ? { url: `recovery-fixture:${specifier}`, shortCircuit: true } : next(specifier, context); },
  load(url, context, next) { return url.startsWith('recovery-fixture:') ? { format: 'module', shortCircuit: true,
    source: exported[url.slice('recovery-fixture:'.length)].map(name => `export const ${name}=globalThis.__recovery.${name};`).join('\n') } : next(url, context); },
});
const { mountAuctionRecovery } = await import('../src/auction-recovery.ts'); hook.deregister();
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function until(fn) { for (let i = 0; i < 200; i++) { if (fn()) return; await delay(5); } throw Error('Recovery fixture timed out.'); }
function fixture() {
  identity = 'game-account'; realm = new AbortController(); health = structuredClone(baseHealth); selectedAccount = wallet; chain = '0x1237';
  balances = new Map([[current, amount], [previous, 10n ** 18n]]); choiceHold = callHold = sendHold = receiptHold = undefined;
  sends = []; calls = []; fetches = []; chooserCalls = 0; events = new Map(); choices = []; descriptions = []; switchErrors = []; onSwitch = undefined;
  globalThis.fetch = async (url, options) => { fetches.push(String(url)); assert.equal(String(url), 'https://us.mossvale.world/api/health');
    assert.equal(options.cache, 'no-store'); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error'); return { ok: true, json: async () => structuredClone(health) }; };
  const container = new Element('section'); document.body.append(container); const parent = new AbortController();
  const dispose = mountAuctionRecovery(container, parent.signal), root = container.children[0];
  return { parent, dispose, root, connect: root.children[2], status: root.children[4], actions: () => root.children[3].children,
    async connected() { this.connect.click(); await until(() => !this.connect.disabled); }, close() { dispose(); container.remove(); } };
}
let f = fixture();
assert.equal(chooserCalls, 0); assert.equal(fetches.length, 0); assert.equal(calls.length, 0, 'mounting never opens a wallet or reads balances');
await f.connected(); assert.equal(chooserCalls, 1); assert.equal(f.actions().length, 2); assert.match(f.status.textContent, /game wallet remains unchanged/);
f.actions()[0].click(); f.actions()[0].click(); await until(() => /withdrawn/.test(f.status.textContent));
assert.equal(sends.length, 1, 'busy withdrawal cannot submit twice');
assert.deepEqual(sends[0], { from: wallet, to: current, data: abi.encodeFunctionData('withdraw', [wallet]), value: '0x0', chainId: '0x1237' });
assert(!calls.some(method => /sign|prepare|grant/i.test(method)), 'recovery never links wallets or requests game sponsorship'); f.close();

f = fixture(); health.mossAuction.enabled = false; await f.connected(); assert.equal(f.actions().length, 1);
f.actions()[0].click(); await until(() => /withdrawn/.test(f.status.textContent)); assert.equal(sends[0].to, previous, 'verified previous escrow survives new-settlement outage'); f.close();
for (const target of [previous, oldest]) {
  f = fixture(); health.mossAuction.enabled = false;
  health.mossAuction.previousContracts = [previous, oldest, previous.toLowerCase()]; balances.set(oldest, amount);
  await f.connected(); assert.equal(f.actions().length, 2, 'both independently verified previous escrows survive and duplicate aliases collapse');
  const index = target === previous ? 0 : 1;
  assert.notEqual(f.actions()[0].textContent, f.actions()[1].textContent, 'previous settlements have distinguishable labels');
  f.actions()[index].click(); await until(() => /withdrawn/.test(f.status.textContent));
  assert.equal(sends.length, 1); assert.equal(sends[0].to, target); assert.equal(abi.decodeFunctionData('withdraw', sends[0].data)[0], wallet); f.close();
}
f = fixture(); health.mossAuction.previousContracts = [previous, oldest]; balances.set(oldest, amount);
await f.connected(); assert.equal(f.actions().length, 3);
health.mossAuction.previousContracts = [previous]; f.actions()[2].click(); await until(() => !f.connect.disabled);
assert.equal(sends.length, 0, 'removing a verified historical destination prevents its withdrawal'); f.close();
f = fixture(); balances.clear(); await f.connected(); assert.equal(f.actions().length, 0); assert.match(f.status.textContent, /No existing/); f.close();
for (const change of [{ chainId: 1 }, { token: other }, { decimals: 6 }, { contract: ZeroAddress }, { previousContract: current }, { previousContracts: [previous, current] }, { previousContracts: [ZeroAddress] }, { previousContracts: [other, null] }, { previousContracts: 'invalid' }]) {
  f = fixture(); Object.assign(health.mossAuction, change); await f.connected(); assert.equal(f.actions().length, 0); assert.equal(sends.length, 0); f.close();
}
for (const missing of [false, true]) {
  f = fixture(); chain = '0x1'; if (missing) switchErrors = [Object.assign(Error('Unknown chain'), { code: 4902 })];
  await f.connected(); assert.equal(chooserCalls, 1); assert.equal(f.actions().length, 2, 'connection requests the required network before reading escrow');
  assert.deepEqual(calls.filter(method => method.startsWith('wallet_')), missing
    ? ['wallet_switchEthereumChain', 'wallet_addEthereumChain', 'wallet_switchEthereumChain'] : ['wallet_switchEthereumChain']);
  assert.equal(sends.length, 0, 'connecting never withdraws automatically'); f.close();
}
for (const noOp of [false, true]) {
  f = fixture(); const incompatibleCalls = [];
  const incompatible = { async request({ method }) {
    incompatibleCalls.push(method);
    if (method === 'eth_requestAccounts') return [wallet];
    if (method === 'eth_chainId') return '0x1';
    if (method === 'wallet_switchEthereumChain') { if (noOp) return null; throw Object.assign(Error('Unsupported network'), { code: 4200 }); }
    throw Error(`Incompatible wallet must not receive ${method}`);
  } };
  choices = [incompatible, external]; await f.connected();
  assert.equal(chooserCalls, 2, 'unsupported wallets and ignored switches reopen wallet selection');
  assert.match(descriptions[1], /Choose another wallet app with your original auction address/);
  assert.equal(f.actions().length, 2); assert.equal(fetches.length, 1, 'only the compatible selection reads verified escrow');
  assert(!incompatibleCalls.some(method => ['eth_call', 'eth_sendTransaction'].includes(method)));
  f.actions()[0].click(); await until(() => /withdrawn/.test(f.status.textContent));
  assert.equal(sends.length, 1); assert.equal(sends[0].from, wallet); assert.equal(abi.decodeFunctionData('withdraw', sends[0].data)[0], wallet); f.close();
}
for (const cancellation of [Object.assign(Error('Request cancelled.'), { code: 4001 }),
  Object.assign(Error('Request cancelled.'), { code: 'UNKNOWN_ERROR', info: { error: { code: '4001' } } }),
  Object.assign(Error('Request cancelled.'), { code: 'ACTION_REJECTED' })]) {
  f = fixture(); chain = '0x1'; switchErrors = [cancellation]; await f.connected();
  assert.equal(chooserCalls, 1, 'declining a network request does not reopen selection');
  assert.match(f.status.textContent, /cancelled/); assert.equal(fetches.length, 0); assert.equal(sends.length, 0); f.close();
}
f = fixture(); chain = '0x1'; switchErrors = [Object.assign(Error('Unsupported network'), { code: 4200 })];
choices = [external, Object.assign(Error('Wallet selection cancelled.'), { code: 'WALLET_SELECTION_CANCELLED' })];
await f.connected(); assert.equal(chooserCalls, 2); assert.match(f.status.textContent, /cancelled/);
assert.equal(fetches.length, 0); assert.equal(sends.length, 0); assert.equal(f.actions().length, 0); f.close();

for (const cancel of [f => f.parent.abort(), () => realm.abort(), () => window.dispatchEvent(new Event('mossvale-wallet-reset'))]) {
  f = fixture(); chain = '0x1'; const switching = deferred(); onSwitch = () => switching.promise;
  f.connect.click(); await until(() => calls.includes('wallet_switchEthereumChain')); cancel(f); switching.resolve();
  await delay(20); assert.equal(chooserCalls, 1, 'closing during the network prompt cannot reopen selection');
  assert.equal(fetches.length, 0); assert.equal(sends.length, 0); f.close();
}

for (const mutate of [() => { selectedAccount = other; }, () => { chain = '0x1'; }, () => { balances.set(current, amount + 1n); },
  () => { health.mossAuction.contract = other; }, () => { identity = 'another-game-account'; }]) {
  f = fixture(); await f.connected(); mutate(); f.actions()[0].click(); await until(() => !f.connect.disabled || /session changed/.test(f.status.textContent));
  assert.equal(sends.length, 0, 'changed account, network, amount or verified destination prevents submission');
  assert.equal(chooserCalls, 1); assert(!calls.includes('wallet_switchEthereumChain'), 'withdrawal revalidation never changes the reviewed network'); f.close();
}
for (const cancel of [f => f.parent.abort(), () => realm.abort(), () => window.dispatchEvent(new Event('mossvale-wallet-reset'))]) {
  f = fixture(); const choice = deferred(); choiceHold = choice.promise; f.connect.click(); await until(() => chooserCalls === 1); cancel(f); choice.resolve();
  await delay(20); assert.equal(calls.length, 0, 'closing or switching session while picker is open prevents wallet RPC'); f.close();
}
f = fixture(); await f.connected(); const held = deferred(); callHold = held.promise; f.actions()[0].click(); await until(() => callHold === undefined);
realm.abort(); held.resolve(); await delay(20); assert.equal(sends.length, 0, 'realm changes during balance revalidation stop signing'); f.close();
f = fixture(); await f.connected(); events.get('accountsChanged')([other]); f.actions()[0].click(); assert.equal(sends.length, 0); assert.match(f.status.textContent, /account changed/); f.close();
f = fixture(); await f.connected(); const sent = deferred(); sendHold = sent.promise; f.actions()[0].click(); await until(() => sends.length === 1);
identity = 'another-account'; sent.resolve(); await until(() => /session changed/.test(f.status.textContent));
assert.doesNotMatch(f.status.textContent, /not sent|nothing.*sent/i, 'account change after submission never claims nothing was sent'); f.close();
native = true; const nativeHost = new Element('section'); document.body.append(nativeHost);
mountAuctionRecovery(nativeHost, new AbortController().signal)(); assert.equal(nativeHost.children.length, 0, 'native never exposes external recovery actions'); nativeHost.remove();
console.log('Auction recovery passed: explicit external-only connection, current/previous verified MOSS escrow, exact self recipient, no relink/sponsorship, positive balances only, revalidation, duplicate guards and account/realm/session cancellation. All RPC was simulated.');
