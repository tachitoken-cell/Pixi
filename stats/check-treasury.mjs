import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Interface, id, keccak256, toQuantity } from 'ethers';
import { createTreasuryStats, MOSS_TOKEN, TREASURIES } from './treasury.mjs';

const abi = new Interface(['function totalPaid() view returns (uint256)', 'function balanceOf(address) view returns (uint256)']);
const tokenHash = '0x41881f8aa07050b6e0432355047d8c4fa6ea3648afbe5b6945ce96502b4c1542';
assert.equal(keccak256(JSON.parse(readFileSync(new URL('../public/contracts/MossvaleTreasureTreasury.json', import.meta.url))).deployedBytecode), TREASURIES[0][1]);
assert.equal(keccak256(readFileSync(new URL('../scripts/fixtures/moss-token-runtime.hex', import.meta.url), 'utf8').trim()), tokenHash);
assert.deepEqual(TREASURIES.slice(1).map(([address]) => address), ['0x8671Bc2c3A675239c7A2CFcdc4516Ec45e2d677f', '0xac278da160bC4E2db77F287EA9a09c5d52466C92']);

function fixture({ defaultRpc = false } = {}) {
  const state = { now: Date.parse('2026-09-18T10:00:00Z'), chain: '0x1237', paid: [10n ** 50n + 1n, 2n * 10n ** 18n, 7n], balance: 3n * 10n ** 30n + 123n, calls: [], offline: false };
  const block = (number, age) => ({ number: toQuantity(number), hash: id(`block-${number}`), timestamp: toQuantity(state.now / 1000 - age) });
  state.finalized = block(100, 60); state.latest = block(110, 0);
  state.canonical = new Map([state.finalized, state.latest].map(value => [value.number, value]));
  const codeHashes = new Map([...TREASURIES, [MOSS_TOKEN, tokenHash]]);
  const rpc = async (method, params) => {
    state.calls.push({ method, params });
    if (state.offline) throw Error('offline');
    if (method === 'eth_chainId') return state.chain;
    if (method === 'eth_getBlockByNumber') {
      if (params[0] === 'finalized') {
        state.finalizedLookups = (state.finalizedLookups || 0) + 1;
        return state.finalizedLookups % 2 === 0 && Object.hasOwn(state, 'finalizedRecheck') ? state.finalizedRecheck : state.finalized;
      }
      if (params[0] === 'latest') return state.latest;
      if (state.recentHeadersOnly && params[0] === state.finalized.number) throw Object.assign(Error('public endpoint only serves recent blocks (last 1024)'), { code: -32601 });
      return state.canonical.get(params[0]);
    }
    assert.equal(params[1].requireCanonical, true);
    if (method === 'eth_getCode') {
      assert.equal(params[1].blockHash, state.finalized.hash);
      return state.wrongCode ? 'wrong' : params[0];
    }
    assert.equal(method, 'eth_call', 'statistics never use a transaction or signing RPC');
    const call = abi.parseTransaction(params[0]);
    if (state.malformed) return '0x1';
    if (call.name === 'totalPaid') {
      assert.equal(params[1].blockHash, state.finalized.hash, 'payouts use finalized storage');
      return abi.encodeFunctionResult('totalPaid', [state.paid[TREASURIES.findIndex(([address]) => address === params[0].to)]]);
    }
    assert.equal(call.name, 'balanceOf'); assert.equal(params[0].to, MOSS_TOKEN);
    assert.equal(call.args[0], TREASURIES[0][0], 'vault balance uses only the active treasury');
    assert.equal(params[1].blockHash, state.latest.hash, 'current vault includes latest canonical withdrawals and deposits');
    return abi.encodeFunctionResult('balanceOf', [state.balance]);
  };
  // Hashing is injected so old deployment bytecode is not duplicated into another fixture.
  const get = createTreasuryStats({ ...(defaultRpc ? {} : { rpc }), now: () => state.now, hashCode: code => codeHashes.get(code) });
  return { state, get, rpc };
}

const { state, get } = fixture();
const a = get(), b = get(); assert.equal(a, b, 'simultaneous requests share one snapshot');
const first = await a;
assert.equal(first.status, 'ok');
assert.equal(first.totalPaidWei, state.paid.reduce((sum, value) => sum + value, 0n).toString(), 'all three payout counters retain every wei');
assert.equal(first.balanceWei, state.balance.toString());
assert.equal(first.finalizedBlock.number, '100'); assert.equal(first.balanceBlock.number, '110');
assert.equal(first.payoutBasis, 'finalized'); assert.equal(first.balanceBasis, 'latest');
assert.equal(first.decimals, 18); assert.equal(first.chainId, 4663);
const calls = state.calls.length; state.now += 29999;
assert.equal(await get(), first); assert.equal(state.calls.length, calls, 'cache avoids polling on every page request');
state.now += 1; state.balance -= 123n;
const withdrawn = await get();
assert.equal(withdrawn.totalPaidWei, first.totalPaidWei, 'a withdrawal changes balance, never voucher payouts');
assert.equal(withdrawn.balanceWei, (BigInt(first.balanceWei) - 123n).toString());
state.now += 30000; state.offline = true;
const stale = await get();
assert.equal(stale.status, 'stale'); assert.equal(stale.totalPaidWei, first.totalPaidWei);
assert.equal(stale.balanceWei, withdrawn.balanceWei); assert.equal(stale.updatedAt, withdrawn.updatedAt);
const failedCalls = state.calls.length; await get(); assert.equal(state.calls.length, failedCalls, 'outages are also paced');
state.now += 30000; state.offline = false;
assert.equal((await get()).status, 'ok', 'refresh recovers after an outage');

const zero = fixture(); zero.state.paid = [0n, 0n, 0n]; zero.state.balance = 0n;
assert.equal((await zero.get()).totalPaidWei, '0'); assert.equal((await zero.get()).balanceWei, '0');
for (const change of [
  s => { s.offline = true; }, s => { s.chain = '0x1'; }, s => { s.chain = 'invalid'; },
  s => { s.wrongCode = true; }, s => { s.malformed = true; },
  s => { s.finalized = { ...s.finalized, hash: 'invalid' }; },
  s => { s.latest = { ...s.latest, timestamp: toQuantity(s.now / 1000 - 121) }; },
  s => { s.finalized = { ...s.finalized, timestamp: toQuantity(s.now / 1000 - 1801) }; },
  s => { s.latest = { ...s.latest, timestamp: toQuantity(s.now / 1000 + 31) }; },
  s => { s.latest = { ...s.latest, number: '0x63' }; },
  s => { s.latest = { ...s.latest, number: s.finalized.number }; },
  s => { s.canonical.set(s.latest.number, { ...s.latest, hash: id('reorg') }); },
  s => { s.finalizedRecheck = null; },
  s => { s.finalizedRecheck = { ...s.finalized, number: '0x65', hash: id('advanced-finality') }; },
  s => { s.finalizedRecheck = { ...s.finalized, hash: id('conflicting-finality') }; },
]) {
  const test = fixture(); change(test.state); const value = await test.get();
  assert.equal(value.status, 'unavailable'); assert.equal(value.totalPaidWei, null); assert.equal(value.balanceWei, null); assert.equal(value.updatedAt, null);
}
const recentOnly = fixture(); recentOnly.state.recentHeadersOnly = true;
assert.equal((await recentOnly.get()).status, 'ok', 'The provider may reject historical numeric headers while serving the exact finalized tag');
assert(!recentOnly.state.calls.some(call => call.method === 'eth_getBlockByNumber' && call.params[0] === recentOnly.state.finalized.number), 'Finalized canonicality must not require the unsupported historical endpoint');
assert.equal(recentOnly.state.calls.filter(call => call.method === 'eth_getBlockByNumber' && call.params[0] === 'finalized').length, 2, 'Finalized block number and hash are observed before and after all state reads');
for (const change of [
  s => { s.finalized = { ...s.finalized, number: '0x63' }; },
  s => { s.finalized = { ...s.finalized, hash: id('finality-regression') }; },
  s => { s.latest = { ...s.latest, number: '0x6d' }; },
]) {
  const test = fixture(); await test.get(); test.state.now += 30000; change(test.state);
  assert.equal((await test.get()).status, 'stale', 'regressed or conflicting chain observations do not replace verified values');
}
const originalFetch = globalThis.fetch;
try {
  const direct = fixture({ defaultRpc: true }), requests = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public', 'statistics avoid the official endpoint that throttles Cloudflare egress');
    const { method, params } = JSON.parse(options.body); requests.push({ method, params });
    return { ok: true, json: async () => ({ result: await direct.rpc(method, params) }) };
  };
  const value = await direct.get();
  assert.equal(value.status, 'ok');
  assert.equal(value.totalPaidWei, first.totalPaidWei);
  assert.equal(requests.filter(request => request.method === 'eth_getCode').length, 4, 'direct routing still verifies every treasury and token runtime');
  assert.deepEqual(requests.filter(request => request.method === 'eth_getBlockByNumber').map(request => request.params[0]), ['finalized', 'latest', 'finalized', '0x6e'], 'direct routing retains both finality snapshots and final canonical rereads');
} finally { globalThis.fetch = originalFetch; }
const originalTimeout = globalThis.setTimeout;
try {
  globalThis.setTimeout = (callback, delay) => { assert.equal(delay, 18000); queueMicrotask(callback); return 0; };
  const hanging = createTreasuryStats({ rpc: () => new Promise(() => {}) });
  assert.equal((await hanging()).status, 'unavailable', 'the snapshot deadline also bounds a hung RPC');
} finally { globalThis.setTimeout = originalTimeout; }
console.log('Treasury statistics: exact three-contract payout totals, current vault, read-only RPC, canonical blocks, freshness, cache and outage checks passed.');
