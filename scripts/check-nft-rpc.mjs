import assert from 'node:assert/strict';
import { createNftRpc, getChainRpc } from '../src/nft-rpc.mjs';
import { createTreasureChain } from '../src/treasury-chain.mjs';
import { createStoreChain } from '../src/store-chain.mjs';
import { createAuctionChain } from '../src/auction-chain.mjs';
import { createNftChain } from '../src/nft-chain.mjs';

let clock = 100000, limited = false;
const starts = [], calls = [];
const rpc = createNftRpc(async (method, params) => {
  starts.push(clock); calls.push([method, params]);
  if (limited) throw Object.assign(Error('Controlled public RPC limit'), { code: -32005 });
  return method === 'eth_call' ? '0x01' : { number: '0x10' };
}, { now: () => clock, wait: async ms => { clock += ms; }, spacingMs: 200 });
const tag = { blockHash: '0x' + '11'.repeat(32), requireCanonical: true };
const read = asset => rpc('eth_call', [{ to: '0x' + '22'.repeat(20), data: '0x' + asset.toString(16).padStart(8, '0') }, tag]);
await Promise.all(Array.from({ length: 20 }, () => Promise.all(Array.from({ length: 24 }, (_, i) => read(i)))));
assert.equal(calls.length, 24, '480 overlapping ownership/auction reads share 24 exact immutable block reads');
assert(starts.slice(1).every((start, i) => start - starts[i] >= 200), 'cold reads are paced rather than burst into the public endpoint');
await Promise.all(Array.from({ length: 24 }, (_, i) => read(i)));
assert.equal(calls.length, 24, 'repeat reads at the same block hash use the bounded immutable cache');
await rpc('eth_getBlockByNumber', ['latest', false]); await rpc('eth_getBlockByNumber', ['latest', false]);
assert.equal(calls.length, 26, 'sequential head checks always contact the chain');
await rpc('eth_getTransactionReceipt', ['0x' + '33'.repeat(32)]); await rpc('eth_getTransactionReceipt', ['0x' + '33'.repeat(32)]);
assert.equal(calls.length, 28, 'pending receipts are never cached');
await rpc('eth_call', [{ to: '0x' + '22'.repeat(20), data: '0x00000000' }, { ...tag, blockHash: '0x' + '44'.repeat(32) }]);
assert.equal(calls.length, 29, 'a transferred asset at a new block must be read again');
limited = true;
await assert.rejects(rpc('eth_chainId', []), /rate limited/);
const afterLimit = calls.length;
await assert.rejects(read(0), /rate limited/, 'even cached reads cannot bypass an active uncertainty cooldown');
await assert.rejects(rpc('eth_chainId', []), /rate limited/);
assert.equal(calls.length, afterLimit, '429 cooldown prevents repeated requests from server and user retries');
clock += 15001; limited = false; await rpc('eth_chainId', []);
assert.equal(calls.length, afterLimit + 1, 'verification can recover after the bounded cooldown');
clock += 60001; await read(0);
assert.equal(calls.length, afterLimit + 1, 'unchanged finalized state remains reusable beyond one minute');
clock += 240001; await read(0);
assert.equal(calls.length, afterLimit + 2, 'immutable cache expires after five minutes even when repeatedly used');
console.log('PASS NFT RPC load: 480 concurrent reads become24 paced requests; heads/receipts and new block holdings stay fresh; rate-limit cooldown suspends access/retries and recovers.');

// Wallet reads at new heads must not evict frequently reused finalized configuration.
const cacheCalls = [];
let rejectRead = false;
const busyRpc = createNftRpc(async (_method, params) => {
  cacheCalls.push(params[0]);
  if (rejectRead) throw Error('Controlled unavailable state');
  return '0x01';
}, { spacingMs: 0 });
const cachedRead = key => busyRpc('eth_call', [key, tag]);
await cachedRead('cold'); await cachedRead('contract');
for (let wave = 0; wave < 4; wave++) {
  for (let wallet = 0; wallet < 240; wallet++) await cachedRead(`wallet-${wave}-${wallet}`);
  await cachedRead('contract');
}
assert.equal(cacheCalls.filter(key => key === 'contract').length, 1, 'hot finalized reads survive more than 512 unrelated wallet reads');
await cachedRead('cold');
assert.equal(cacheCalls.filter(key => key === 'cold').length, 2, 'the unchanged 512-entry bound still evicts unused values');
rejectRead = true; await assert.rejects(cachedRead('failed'), /unavailable/);
rejectRead = false; await cachedRead('failed');
assert.equal(cacheCalls.filter(key => key === 'failed').length, 2, 'failed reads are retried rather than cached');

// Balances and paid claims are immutable only within their explicit block hash.
let head = '11', payment = null, canonicalHash = '11';
const moneyCalls = [], states = { '11': { balance: 100n, paid: 0n }, '22': { balance: 5n, paid: 0n }, '33': { balance: 0n, paid: 5n } };
const moneyRpc = createNftRpc(async (method, params) => {
  moneyCalls.push([method, params]);
  if (method === 'eth_getBlockByNumber') return { hash: '0x' + (params[0] === 'latest' ? head : canonicalHash).repeat(32) };
  if (method === 'eth_getTransactionReceipt') return payment;
  return states[params[1].blockHash.slice(2, 4)][params[0].data].toString();
}, { spacingMs: 0 });
const readMoney = async () => {
  const block = await moneyRpc('eth_getBlockByNumber', ['latest', false]), at = { blockHash: block.hash, requireCanonical: true };
  const [balance, paid] = await Promise.all(['balance', 'paid'].map(data => moneyRpc('eth_call', [{ to: 'treasury', data }, at])));
  return { balance: BigInt(balance), capacity: BigInt(balance) + BigInt(paid) };
};
assert.deepEqual(await readMoney(), { balance: 100n, capacity: 100n });
head = '22';
assert.deepEqual(await readMoney(), { balance: 5n, capacity: 5n }, 'a confirmed owner withdrawal reduces current funding and capacity despite cached previous-block balances');
head = '33';
assert.deepEqual(await readMoney(), { balance: 0n, capacity: 5n }, 'a payout at a new block updates balance and cumulative paid without releasing issued capacity');
assert.equal(await moneyRpc('eth_getTransactionReceipt', ['payment']), null);
payment = { status: '0x1' };
assert.deepEqual(await moneyRpc('eth_getTransactionReceipt', ['payment']), payment, 'a previously pending transaction is checked again');
assert.equal((await moneyRpc('eth_getBlockByNumber', ['0x10', false])).hash, '0x' + '11'.repeat(32));
canonicalHash = '44';
assert.equal((await moneyRpc('eth_getBlockByNumber', ['0x10', false])).hash, '0x' + '44'.repeat(32), 'canonical block lookups cannot be hidden by the immutable-value cache');

const originalFetch = globalThis.fetch, originalNow = Date.now, originalAlchemyKey = process.env.ALCHEMY_WALLET_API_KEY;
try {
  delete process.env.ALCHEMY_WALLET_API_KEY;
  const requests = [], rpcUrl = 'https://rpc.invalid/shared-production-check', authorityKey = '0x' + '11'.repeat(32);
  globalThis.fetch = async (url, options) => {
    requests.push({ url, ...JSON.parse(options.body), at: performance.now() });
    return { ok: true, json: async () => ({ result: '0x1' }) };
  };
  const options = { rpcUrl, authorityKey, contract: '0x' + '22'.repeat(20) };
  const adapters = [createTreasureChain({ ...options, legacyContract: '0x' + '33'.repeat(20) }), createStoreChain({ ...options, legacyContract: '' }),
    createAuctionChain({ ...options, chainId: 4663 }), createAuctionChain({ ...options, currency: 'moss', chainId: 4663 }),
    createNftChain({ rpcUrl, authorityKey, petsContract: options.contract, housesContract: '0x' + '33'.repeat(20), feeReceiver: '0x' + '44'.repeat(20) })];
  const statuses = await Promise.all(adapters.map(adapter => adapter.status()));
  assert(statuses.every(status => status.enabled === false), 'all adapters reject the mocked wrong chain');
  assert.equal(requests.length, 1, 'current/legacy treasury, store, both auctions and NFT share one concurrent production chain check');
  assert.equal(getChainRpc(rpcUrl), getChainRpc(rpcUrl));
  assert.notEqual(getChainRpc(rpcUrl), getChainRpc(rpcUrl + '/other'), 'different endpoint configuration stays isolated');
  await Promise.all(['eth_getCode', 'eth_call', 'eth_getStorageAt'].map((method, i) => getChainRpc(rpcUrl)(method, ['unique-' + i, tag])));
  assert(requests.slice(1).every((request, i) => request.at - requests[i].at >= 190), 'all production consumers share the 200ms pacing floor (timer tolerance 10ms)');

  let cooldownClock = 100000, responseMode = 'limited', sent = 0;
  Date.now = () => cooldownClock;
  const cooling = getChainRpc('https://rpc.invalid/cooldown-check');
  globalThis.fetch = async () => { sent++; return responseMode === 'limited' ? { ok: false, status: 429 }
    : responseMode === 'rpc-limit' ? { ok: true, json: async () => ({ error: { code: -32005, message: 'private upstream details' } }) }
    : { ok: true, json: async () => ({ result: '0x1237' }) }; };
  await assert.rejects(cooling('eth_chainId', []), /rate limited/);
  await assert.rejects(getChainRpc('https://rpc.invalid/cooldown-check')('eth_getBlockByNumber', ['latest', false]), /rate limited/);
  assert.equal(sent, 1, 'HTTP429 cooldown is shared across consumers and never automatically retries');
  cooldownClock += 15001; responseMode = 'rpc-limit';
  await assert.rejects(cooling('eth_chainId', []), error => /rate limited/.test(error.message) && !error.message.includes('private'));
  cooldownClock += 15001; responseMode = 'ok';
  assert.equal(await cooling('eth_chainId', []), '0x1237');
  globalThis.fetch = async () => { throw Error('https://rpc.invalid/private-token'); };
  await assert.rejects(getChainRpc('https://rpc.invalid/error-check')('eth_chainId', []), error => /unavailable/.test(error.message) && !error.message.includes('private-token'));

  const archive='https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public',official='https://rpc.mainnet.chain.robinhood.com';
  const routed=[];let officialChain='0x1237',stateFailure=false,directHeaders=false;
  globalThis.fetch=async(url,options)=>{
    const request=JSON.parse(options.body);routed.push({url,...request});
    if(request.method==='eth_chainId')return {ok:true,json:async()=>({result:url===official?officialChain:'0x1237'})};
    if(url===archive&&request.method==='eth_getBlockByNumber'&&!directHeaders)return {ok:true,json:async()=>({error:{code:-32601,message:'Public endpoint only serves recent blocks'}})};
    if(url===official&&['eth_call','eth_getCode','eth_getStorageAt'].includes(request.method)||stateFailure)return {ok:true,json:async()=>({error:{code:-32000,message:'Historical state unavailable'}})};
    return {ok:true,json:async()=>({result:request.method.startsWith('eth_getBlock')?{number:'0x20000',hash:tag.blockHash,timestamp:'0x1'}:'0x42'})};
  };
  const combined=getChainRpc(archive);assert.equal(await combined('eth_chainId',[]),'0x1237');
  assert.deepEqual(routed.map(request=>request.url),[archive,official],'both provider chain identities are verified');
  for(const block of ['finalized','latest','0x100'])assert.equal((await combined('eth_getBlockByNumber',[block,false])).hash,tag.blockHash);
  assert(routed.filter(request=>request.method==='eth_getBlockByNumber').every(request=>request.url===official),'fresh finality and historical canonical headers come from the official node');
  for(const method of ['eth_getCode','eth_call','eth_getStorageAt'])assert.equal(await combined(method,['fixed-state',tag]),'0x42');
  assert(routed.filter(request=>['eth_getCode','eth_call','eth_getStorageAt'].includes(request.method)).every(request=>request.url===archive&&request.params.at(-1).blockHash===tag.blockHash&&request.params.at(-1).requireCanonical),'state stays on the state provider at the exact canonical hash');
  stateFailure=true;const beforeFailure=routed.length;
  await assert.rejects(combined('eth_call',['uncached-state',tag]),/could not verify/);
  assert.equal(routed.length,beforeFailure+1,'a missing state never retries against latest or an unpinned block number');stateFailure=false;
  officialChain='0x1';await assert.rejects(combined('eth_chainId',[]),/wrong chain|disagree/);
  officialChain='0x1237';assert.equal(await combined('eth_chainId',[]),'0x1237','provider recovery is checked again instead of retaining an old identity');
  const direct=getChainRpc(archive,{routeHeaders:false});directHeaders=true;
  assert.notEqual(direct,combined,'direct statistics and routed game clients have separate endpoint caches');
  assert.equal(direct,getChainRpc(archive,{routeHeaders:false}));
  routed.length=0;assert.equal(await direct('eth_chainId',[]),'0x1237');
  for(const block of ['finalized','latest','0x100'])assert.equal((await direct('eth_getBlockByNumber',[block,false])).hash,tag.blockHash);
  await direct('eth_getCode',['fixed-state',tag]);
  assert.equal(routed.filter(request=>request.method==='eth_getCode').length,1,'the direct client does not reuse routed-client cached state');
  assert(routed.every(request=>request.url===archive),'explicit direct routing keeps chain identity, headers and hash-pinned state on the selected endpoint');
  routed.length=0;await combined('eth_getCode',['fixed-state',tag]);
  assert.equal(routed.length,0,'creating a direct client does not replace the game client cache');
  await getChainRpc(archive)('eth_getBlockByNumber',['finalized',false]);
  assert.equal(routed[0].url,official,'all existing game callers retain official header routing by default');
  const custom=archive+'?private-provider=1';routed.length=0;await getChainRpc(custom)('eth_getBlockByNumber',['finalized',false]);
  assert(routed.every(request=>request.url===custom),'custom provider settings are never redirected');

  Date.now = originalNow;
  const alchemyKey = 'private-alchemy-test-key', alchemyUrl = `https://robinhood-mainnet.g.alchemy.com/v2/${alchemyKey}`;
  process.env.ALCHEMY_WALLET_API_KEY = alchemyKey;
  const paid = getChainRpc(archive), paidOfficial = getChainRpc(official + '/'), paidRequests = [];
  assert.equal(paid, paidOfficial, 'both default Robinhood URLs resolve to one Alchemy queue/cache before endpoint lookup');
  assert.equal(paid, getChainRpc(archive + '/'));
  assert.notEqual(paid, combined, 'paid routing does not reuse public-provider state or cooldown');
  globalThis.fetch = async (url, options) => {
    const request = JSON.parse(options.body); paidRequests.push({ url, ...request, at: performance.now() });
    return { ok: true, json: async () => ({ result: request.method.startsWith('eth_getBlock') ? { hash: tag.blockHash } : '0x1237' }) };
  };
  await Promise.all([paid('eth_chainId', []), paidOfficial('eth_chainId', [])]);
  assert.equal(paidRequests.length, 1, 'the paid endpoint shares concurrent identity verification without a public fallback');
  const stateParams = [{ to: '0x' + '22'.repeat(20), data: '0x12345678' }, tag];
  await Promise.all([paid('eth_getBlockByNumber', ['latest', false]), paidOfficial('eth_call', stateParams)]);
  await paidOfficial('eth_call', stateParams);
  assert.equal(paidRequests.length, 3, 'canonical immutable values share the effective endpoint cache across both default URLs');
  assert(paidRequests.every(request => request.url === alchemyUrl), 'headers, identity and state all use the server-only paid endpoint');
  assert.deepEqual(paidRequests.find(request => request.method === 'eth_call').params, stateParams, 'the exact canonical hash and requireCanonical flag survive routing');
  assert(paidRequests.slice(1).every((request, i) => request.at - paidRequests[i].at >= 190), 'headers and state share the same 200ms pacing floor');
  await paid('eth_getBlockByNumber', ['latest', false]);
  assert.equal(paidRequests.length, 4, 'Alchemy heads are still checked fresh rather than cached');

  paidRequests.length = 0;
  const testnet = 'https://rpc.testnet.chain.robinhood.com', customPaid = 'https://private.invalid/robinhood';
  await getChainRpc(archive, { routeHeaders: false })('eth_chainId', []);
  await getChainRpc(official, { routeHeaders: false })('eth_chainId', []);
  await getChainRpc(customPaid)('eth_chainId', []);
  await getChainRpc(testnet)('eth_chainId', []);
  await getChainRpc(custom)('eth_chainId', []);
  assert.deepEqual(paidRequests.map(request => request.url), [archive, official, customPaid, testnet, custom], 'explicit direct, custom and testnet URLs remain unchanged even with Alchemy configured');

  for (const invalid of ['bad/key?secret', 'tiny', ' invalid-key', 'x'.repeat(257)]) {
    process.env.ALCHEMY_WALLET_API_KEY = invalid;
    assert.throws(() => getChainRpc(official), error => /configuration is invalid/.test(error.message) && !error.message.includes(invalid), 'invalid configured keys fail closed without disclosure');
    assert.equal(getChainRpc(customPaid), getChainRpc(customPaid), 'custom routing does not depend on the unused Alchemy key');
    assert.equal(getChainRpc(archive, { routeHeaders: false }), direct, 'explicit direct routing does not depend on the unused Alchemy key');
  }
  process.env.ALCHEMY_WALLET_API_KEY = alchemyKey;
  let paidFailures = 0;
  globalThis.fetch = async url => { paidFailures++; assert.equal(url, alchemyUrl); throw Error(alchemyUrl); };
  await assert.rejects(paid('eth_getBlockByNumber', ['finalized', false]), error => /unavailable/.test(error.message) && !error.message.includes(alchemyKey));
  assert.equal(paidFailures, 1, 'network failure does not fall back to a public endpoint or weaker block');
  globalThis.fetch = async url => { paidFailures++; assert.equal(url, alchemyUrl); return { ok: true, json: async () => ({ error: { code: -32000, message: alchemyUrl } }) }; };
  await assert.rejects(paid('eth_call', [{ ...stateParams[0], data: '0xdeadbeef' }, tag]), error => /could not verify/.test(error.message) && !error.message.includes(alchemyKey));
  assert.equal(paidFailures, 2, 'state failure is surfaced without retrying at latest or leaking upstream credentials');
  delete process.env.ALCHEMY_WALLET_API_KEY;
  assert.equal(getChainRpc(archive), combined, 'without a configured key the existing public routing is preserved');
} finally {
  globalThis.fetch = originalFetch; Date.now = originalNow;
  if (originalAlchemyKey === undefined) delete process.env.ALCHEMY_WALLET_API_KEY; else process.env.ALCHEMY_WALLET_API_KEY = originalAlchemyKey;
}
console.log('PASS shared money RPC: production adapters share pacing/dedup/cooldown; owner withdrawals, payouts, receipts and canonical block changes stay fresh; configured Alchemy shares default header/state routing without weaker reads; direct/custom/testnet URLs and upstream secrets stay isolated.');
