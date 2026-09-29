import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { setTimeout as delay } from 'node:timers/promises';
import { Interface, TypedDataEncoder, Wallet, toUtf8String } from 'ethers';
import { MOSS_TOKEN } from '../src/auction.ts';
import { treasureContractClaim, TREASURE_ABI, TREASURE_CLAIM_TYPES } from '../src/treasure-rewards.ts';
const hooks = registerHooks({ load(url, context, next) {
  return url.endsWith('/src/wallet-provider.ts') ? { format: 'module', shortCircuit: true, source: 'export const chooseWallet = () => globalThis.chooseActionWallet();' } : next(url, context);
} });
const { mountWalletAction } = await import('../src/wallet-action-ui.ts'); hooks.deregister();
const wallet = Wallet.createRandom(), other = Wallet.createRandom(), authority = Wallet.createRandom(), contract = Wallet.createRandom().address;
const origin = 'https://mossvale.world', id = 'a'.repeat(64), token = 'b'.repeat(64), transactionHash = `0x${'7'.repeat(64)}`;
const createdAt = Date.now(), claim = { id: 'claim-one', realmId: 'eu', characterId: 'hero-one', wallet: wallet.address, amount: 7,
  createdAt, chainId: 4663, token: MOSS_TOKEN.address, contract, status: 'pending' };
claim.contractClaim = treasureContractClaim(claim); claim.amountWei = claim.contractClaim.amountWei;
const domain = { name: 'MossvaleTreasureTreasury', version: '1', chainId: 4663, verifyingContract: contract };
claim.signature = await authority.signTypedData(domain, TREASURE_CLAIM_TYPES, claim.contractClaim);
claim.claimHash = TypedDataEncoder.hash(domain, TREASURE_CLAIM_TYPES, claim.contractClaim);
claim.transaction = { to: contract, data: new Interface(TREASURE_ABI).encodeFunctionData('claim', [claim.contractClaim, claim.signature]), value: '0x0', chainId: '0x1237' };
const signing = () => {
  const expiresAt = Date.now() + 120000;
  return { kind: 'sign', address: wallet.address, expiresAt, message: `Mossvale wallet\nOrigin: ${origin}\nCharacter: store:hero-one\nWallet: ${wallet.address}\nNonce: 00000000-0000-4000-8000-000000000001\nExpires: ${new Date(expiresAt).toISOString()}\nThis links your wallet for the ingame store and auction trading. It does not authorize a payment.` };
};
class Element {
  constructor() { this.nodes = new Map(); this.hidden = false; this.disabled = false; this.textContent = ''; this.attributes = {}; }
  set innerHTML(html) { for (const [, key] of html.matchAll(/id="([^"]+)"/g)) this.nodes.set(`#${key}`, new Element()); }
  querySelector(selector) { return this.nodes.get(selector); }
  setAttribute(name, value) { this.attributes[name] = value; }
}
const flush = () => delay(10);
const deferred = () => { let resolve; const promise = new Promise(done => resolve = done); return { promise, resolve }; };
function fixture(operation = { kind: 'connect' }, settings = {}) {
  const root = new Element(), calls = [], posts = [], gates = {}, state = { now: Date.now(), selected: wallet.address, network: '0x1237', selections: 0, postFailures: 0, ...settings };
  const provider = { async request({ method, params }) {
    calls.push({ method, params }); if (gates[method]) await gates[method];
    if (state.failMethod === method) throw state.failure || Object.assign(Error('Declined'), { code: 4001 });
    if (method === 'eth_requestAccounts') return [state.selected];
    if (method === 'eth_accounts') return [state.rereadAddress || state.selected];
    if (method === 'eth_chainId') return state.rereadChain && calls.filter(call => call.method === method).length > 1 ? state.rereadChain : state.network;
    if (method === 'wallet_switchEthereumChain') { assert.deepEqual(params, [{ chainId: '0x1237' }]); if (state.missingNetwork) throw { info: { error: { code: 4902 } } }; if (!state.ignoreSwitch) state.network = '0x1237'; return null; }
    if (method === 'wallet_addEthereumChain') { assert.equal(params[0].chainId, '0x1237'); state.missingNetwork = false; return null; }
    if (method === 'personal_sign') { assert.equal(toUtf8String(params[0]), operation.message); assert.equal(params[1], operation.address); return wallet.signMessage(operation.message); }
    if (method === 'eth_sendTransaction') return state.hash || transactionHash;
    assert.fail(`Unexpected RPC ${method}`);
  } };
  globalThis.chooseActionWallet = async () => { state.selections++; if (gates.picker) await gates.picker; if (state.pickerFailure) throw state.pickerFailure; return provider; };
  const ui = mountWalletAction(root, { id: settings.id ?? id, token: settings.token ?? token, origin: settings.origin || origin, now: () => state.now,
    async request(url, init) {
      assert.equal(init.method, 'POST'); assert.equal(init.credentials, 'same-origin'); assert.equal(init.cache, 'no-store');
      assert.equal(init.headers['Content-Type'], 'application/json'); const body = JSON.parse(init.body); posts.push({ url, body, init });
      assert.equal(body.id, settings.id ?? id); assert.equal(body.token, settings.token ?? token);
      if (url.endsWith('/request')) {
        if (gates.request) await gates.request;
        if (state.requestFailure) throw Error('Connection interrupted.');
        return { ok: true, json: async () => ({ operation, expiresAt: settings.expiresAt ?? state.now + 120000 }) };
      }
      assert.equal(url, '/api/native-wallet/complete'); assert.equal(init.keepalive, true);
      if (gates.complete) await gates.complete;
      if (state.postFailures > 0) { state.postFailures--; throw Error('Controlled outage'); }
      return { ok: true, json: async () => ({ ok: true }) };
    } });
  const node = name => root.querySelector(`#wallet-${name}`);
  return { ui, node, calls, posts, gates, state, click: name => node(name).onclick?.(), results: () => posts.filter(post => post.url.endsWith('/complete')).map(post => post.body.result) };
}

let test = fixture(); await test.ui.ready; assert.equal(test.calls.length, 0, 'loading never opens wallet');
await Promise.all([test.click('approve'), test.click('approve')]); assert.equal(test.state.selections, 1); assert.deepEqual(test.results(), [{ address: wallet.address }]);
assert.equal(test.node('return-link').href, `https://us.mossvale.world/mobile-auth/callback#walletAction=${id}`); test.ui.dispose();

const sign = signing(); test = fixture(sign); await test.ui.ready; assert.equal(test.node('message-text').textContent, sign.message); assert(!test.node('message').hidden);
await test.click('approve'); assert.equal(test.calls.filter(call => call.method === 'personal_sign').length, 1); assert.equal(test.results().length, 1);
assert(test.calls.every(call => ['eth_requestAccounts', 'eth_accounts', 'personal_sign'].includes(call.method)), 'ownership never sends a financial request'); test.ui.dispose();

test = fixture({ kind: 'claim', claim }, { network: '0x1' }); await test.ui.ready;
assert.match(test.node('description').textContent, /Collect 7 MOSS/); assert.match(test.node('address').textContent, new RegExp(wallet.address)); assert(!test.node('fee').hidden);
await Promise.all([test.click('approve'), test.click('approve')]);
assert.deepEqual(test.calls.map(call => call.method), ['eth_requestAccounts', 'eth_chainId', 'wallet_switchEthereumChain', 'eth_accounts', 'eth_chainId', 'eth_sendTransaction']);
assert.deepEqual(test.calls.at(-1).params, [{ ...claim.transaction, from: wallet.address }]); assert.deepEqual(test.results(), [{ transactionHash }]);
test.click('approve'); await flush(); assert.equal(test.calls.filter(call => call.method === 'eth_sendTransaction').length, 1); test.ui.dispose();

test = fixture({ kind: 'claim', claim }, { network: '0x1', missingNetwork: true }); await test.ui.ready; await test.click('approve');
assert.deepEqual(test.calls.filter(call => call.method.startsWith('wallet_')).map(call => call.method), ['wallet_switchEthereumChain', 'wallet_addEthereumChain', 'wallet_switchEthereumChain']);
assert.deepEqual(test.results(), [{ transactionHash }]); test.ui.dispose();
for (const failure of [Object.assign(Error('Unexpected error'), { code: -32603 }), Object.assign(Error('Cancelled'), { code: 4001 }),
  { code: '4001' }, { code: 'UNKNOWN_ERROR', error: { code: '4001' } }, { info: { error: { code: 4001 } } }]) {
  test = fixture({ kind: 'claim', claim }, { network: '0x1', failMethod: 'wallet_switchEthereumChain', failure }); await test.ui.ready; await test.click('approve');
  assert(!test.calls.some(call => ['wallet_addEthereumChain', 'eth_sendTransaction'].includes(call.method)));
  assert.equal(test.results()[0].error.code, failure.code === -32603 ? 4000 : 4001);
  if (failure.code === -32603) assert.match(test.results()[0].error.message, /another wallet with the same payout address/);
  test.ui.dispose();
}
test = fixture({ kind: 'claim', claim }, { network: '0x1', missingNetwork: true }); await test.ui.ready;
const addGate = deferred(); test.gates.wallet_addEthereumChain = addGate.promise;
const adding = test.click('approve'); await flush(); test.click('cancel'); addGate.resolve(); await adding;
assert.equal(test.calls.filter(call => call.method === 'wallet_switchEthereumChain').length, 1, 'cancel while adding a network cannot open another wallet prompt');
assert(!test.calls.some(call => call.method === 'eth_sendTransaction')); test.ui.dispose();

for (const operation of [signing(), { kind: 'claim', claim }]) {
  for (const settings of [{ selected: other.address }, { rereadAddress: other.address }]) {
    test = fixture(operation, settings); await test.ui.ready; await test.click('approve');
    assert(!test.calls.some(call => ['personal_sign', 'eth_sendTransaction'].includes(call.method))); assert.equal(test.results()[0].error.code, 4000); test.ui.dispose();
  }
}
for (const settings of [{ network: '0x1', ignoreSwitch: true }, { rereadChain: '0x1' }]) {
  test = fixture({ kind: 'claim', claim }, settings); await test.ui.ready; await test.click('approve');
  assert(!test.calls.some(call => call.method === 'eth_sendTransaction')); assert.equal(test.results()[0].error.code, 4000); test.ui.dispose();
}

for (const [operation, failMethod] of [[{ kind: 'connect' }, 'eth_requestAccounts'], [signing(), 'personal_sign'], [{ kind: 'claim', claim }, 'eth_sendTransaction']]) {
  test = fixture(operation, { failMethod }); await test.ui.ready; await test.click('approve');
  assert.equal(test.results()[0].error.code, 4001); assert(!test.node('return').hidden); test.ui.dispose();
}
test = fixture({ kind: 'connect' }, { pickerFailure: { code: 'WALLET_SELECTION_CANCELLED' } }); await test.ui.ready; await test.click('approve');
assert.equal(test.results()[0].error.code, 4001); assert.equal(test.calls.length, 0); test.ui.dispose();

for (const stage of ['picker', 'eth_requestAccounts', 'eth_accounts', 'eth_chainId']) {
  test = fixture({ kind: 'claim', claim }); await test.ui.ready; const gate = deferred(); test.gates[stage] = gate.promise;
  const work = test.click('approve'); await flush(); test.click('cancel'); test.click('cancel'); gate.resolve(); await work;
  assert.equal(test.results().length, 1, 'cancellation is completed once'); assert.equal(test.results()[0].error.code, 4001);
  assert(!test.calls.some(call => call.method === 'eth_sendTransaction'), `cancel during ${stage} cannot send transaction`); test.ui.dispose();
}
for (const stage of ['picker', 'eth_requestAccounts', 'eth_accounts', 'eth_chainId', 'personal_sign']) {
  test = fixture(stage === 'personal_sign' ? signing() : { kind: 'claim', claim }); await test.ui.ready; const gate = deferred(); test.gates[stage] = gate.promise;
  const work = test.click('approve'); await flush(); test.ui.dispose(); gate.resolve(); await work;
  assert.equal(test.results().length, 0, `disposed ${stage} cannot complete stale request`); assert(!test.calls.some(call => call.method === 'eth_sendTransaction'));
}

for (const expiresAt of [Date.now() - 1, Date.now() + 181000]) {
  test = fixture({ kind: 'connect' }, { expiresAt }); await test.ui.ready; await test.click('approve'); assert.equal(test.calls.length, 0); assert.match(test.node('error').textContent, /expired|invalid/); test.ui.dispose();
}
for (const stage of ['picker', 'eth_requestAccounts', 'eth_accounts', 'eth_chainId']) {
  test = fixture({ kind: 'claim', claim }); await test.ui.ready; const gate = deferred(); test.gates[stage] = gate.promise;
  const work = test.click('approve'); await flush(); test.state.now += 180001; gate.resolve(); await work;
  assert(!test.calls.some(call => call.method === 'eth_sendTransaction'), `expiry during ${stage} prevents send`); assert.equal(test.results()[0].error.code, 4000); test.ui.dispose();
}
for (const operation of [{ kind: 'send', transaction: claim.transaction }, { kind: 'connect', method: 'eth_sendTransaction' },
  { ...signing(), message: 'Send me MOSS' }, { kind: 'claim', claim: { ...claim, transaction: { ...claim.transaction, data: '0xdeadbeef' } } },
  { kind: 'claim', claim: { ...claim, chainId: 1 } }]) {
  test = fixture(operation); await test.ui.ready; await test.click('approve'); assert.equal(test.calls.length, 0); assert(!test.node('error').hidden); test.ui.dispose();
}
for (const settings of [{ id: 'invalid' }, { token: 'A'.repeat(64) }]) {
  test = fixture({ kind: 'connect' }, settings); await test.ui.ready; assert.equal(test.posts.length, 0); assert(!test.node('error').hidden); test.ui.dispose();
}

// A failed return retries only the already completed result, even after the request expires.
for (const operation of [{ kind: 'connect' }, signing(), { kind: 'claim', claim }]) {
  test = fixture(operation, { postFailures: 1 }); await test.ui.ready; await test.click('approve');
  const before = test.calls.length; assert(!test.node('retry').hidden); assert(!test.node('error').hidden); test.state.now += 180001;
  const gate = deferred(); test.gates.complete = gate.promise; test.click('retry'); test.click('retry'); await flush(); gate.resolve(); await flush();
  assert.equal(test.calls.length, before, 'retrying return never repeats wallet operation'); assert.equal(test.results().length, 2); assert.deepEqual(test.results()[0], test.results()[1]);
  assert(!test.node('return').hidden); test.ui.dispose();
}
test = fixture({ kind: 'claim', claim }); await test.ui.ready; const sent = deferred(); test.gates.eth_sendTransaction = sent.promise;
const work = test.click('approve'); await flush(); assert(test.node('cancel').disabled); test.click('cancel'); test.ui.dispose(); test.state.now += 180001; sent.resolve(); await work;
assert.deepEqual(test.results(), [{ transactionHash }], 'late submitted hash survives pagehide and expiry');
assert.equal(test.calls.filter(call => call.method === 'eth_sendTransaction').length, 1);

test = fixture({ kind: 'claim', claim }, { hash: `0x${'0'.repeat(64)}` }); await test.ui.ready; await test.click('approve');
assert.equal(test.results()[0].error.code, -32000); assert.match(test.results()[0].error.message, /Check payout/); test.ui.dispose();
test = fixture({ kind: 'connect' }, { requestFailure: true }); await test.ui.ready; test.click('retry'); await test.click('approve'); assert.equal(test.posts.length, 1, 'single-use request is never retried'); test.ui.dispose();
test = fixture({ kind: 'connect' }, { origin: 'https://asia.mossvale.world' }); await test.ui.ready; assert(test.node('return-link').href.startsWith('https://mossvale.world/')); test.ui.dispose();

const entry = stripTypeScriptTypes(readFileSync(new URL('../src/wallet-action.ts', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, ''));
const events = new Map(), order = [];
runInNewContext(entry, { URLSearchParams, location: { hash: `#id=${id}&token=${token}`, pathname: '/wallet-action.html', origin },
  history: { replaceState(_data, _title, path) { order.push('clear'); assert.equal(path, '/wallet-action.html'); } },
  document: { querySelector: () => ({}) }, window: { addEventListener: (name, fn) => events.set(name, fn) },
  mountWalletAction(_root, options) { order.push('mount'); assert.equal(options.id, id); assert.equal(options.token, token); return { dispose() { order.push('dispose'); } }; } });
assert.deepEqual(order, ['clear', 'mount']); events.get('pagehide')(); events.get('hashchange')(); assert.deepEqual(order, ['clear', 'mount', 'dispose', 'dispose']);
console.log('PASS native wallet approval: exact connect/sign/claim, explicit provider choice, recipient/network/expiry validation, cancellation/disposal guards, one transaction, late hash preservation and result-only return retries.');
