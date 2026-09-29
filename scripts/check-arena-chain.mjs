import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Wallet, TypedDataEncoder, ZeroAddress, ZeroHash, id, parseEther, verifyTypedData, toQuantity } from 'ethers';
import { createArenaChain, arenaInterface as abi, ARENA_MATCH_TYPES, ARENA_RESULT_TYPES } from '../src/arena-chain.mjs';
import { MOSS_TOKEN, MOSS_AUCTION_DEV_TEAM } from '../src/auction.ts';
import { erc20Interface } from '../src/auction-chain.mjs';

// Real signatures and calldata with independent latest/finalized snapshots; no broadcasts or funded keys.
const artifact = JSON.parse(readFileSync(new URL('../public/contracts/MossvaleArena.json', import.meta.url), 'utf8'));
const tokenRuntime = readFileSync(new URL('./fixtures/moss-token-runtime.hex', import.meta.url), 'utf8').trim();
const authority = Wallet.createRandom(), a = Wallet.createRandom(), b = Wallet.createRandom(), other = Wallet.createRandom();
const contract = Wallet.createRandom().address, treasury = Wallet.createRandom().address, now = Math.floor(Date.now() / 1000);
const initialBlock = { number: '0x65', hash: id('arena-latest'), timestamp: toQuantity(now - 2) };
const initialFinalized = { number: '0x64', hash: id('arena-finalized'), timestamp: toQuantity(now - 300) };
const calls = [];
let heads, canonical, chainId, code, tokenCode, identity, states, unavailable, replaceAfterRead, service;
const rpc = async (method, params) => {
  calls.push({ method, params });
  if (unavailable) throw Error('Controlled RPC outage');
  if (method === 'eth_chainId') return chainId;
  if (method === 'eth_getBlockByNumber') {
    if (params[0] === 'latest' || params[0] === 'finalized') return heads[params[0]];
    const mode = Object.keys(heads).find(mode => heads[mode]?.number === params[0]);
    assert(mode, 'Canonical rereads use the selected block number.');
    return canonical[mode];
  }
  const mode = Object.keys(heads).find(mode => heads[mode]?.hash === params[1]?.blockHash);
  if (method === 'eth_getCode' || method === 'eth_call') {
    assert(mode, 'Identity and funding reads pin a selected snapshot.');
    assert.deepEqual(params[1], { blockHash: heads[mode].hash, requireCanonical: true }, 'Reads require the exact canonical block hash.');
  }
  if (method === 'eth_getCode') return params[0].toLowerCase() === contract.toLowerCase() ? code : tokenCode;
  if (method === 'eth_call') {
    const token = params[0].to.toLowerCase() === MOSS_TOKEN.address.toLowerCase(), iface = token ? erc20Interface : abi;
    const call = iface.parseTransaction(params[0]);
    if (call.name === 'matches') {
      assert.equal(call.args[0], terms.matchId);
      if (replaceAfterRead === mode) canonical[mode] = { ...heads[mode], hash: id('reorg-during-funding-read') };
      return abi.encodeFunctionResult('matches', states[mode]);
    }
    return iface.encodeFunctionResult(call.name, [identity[call.name]]);
  }
  throw Error(`Unexpected RPC ${method}; this service must not broadcast transactions.`);
};
const options = { contract, treasury, authorityKey: authority.privateKey, rpc };
function reset() {
  heads = { latest: { ...initialBlock }, finalized: { ...initialFinalized } };
  canonical = structuredClone(heads); chainId = '0x1237';
  code = artifact.deployedBytecode; tokenCode = tokenRuntime; states = { latest: [ZeroHash, 0n, false], finalized: [ZeroHash, 0n, false] };
  identity = { authority: authority.address, paymentToken: MOSS_TOKEN.address, treasury, devTeam: MOSS_AUCTION_DEV_TEAM,
    TAX_BPS: 500n, name: 'Mossvale', symbol: 'MOSS', decimals: 18n };
  unavailable = replaceAfterRead = false; calls.length = 0; service = createArenaChain(options);
}
const terms = { matchId: id('arena-match'), playerA: a.address, playerB: b.address, stakeWei: parseEther('100').toString(), fundingDeadline: now + 600, refundAfter: now + 1800 };
const domain = { name: 'MossvaleArena', version: '1', chainId: 4663, verifyingContract: contract };
reset();
const status = await service.status();
assert.deepEqual(status, { configured: true, enabled: true, chainId: 4663, token: MOSS_TOKEN.address, symbol: 'MOSS', decimals: 18,
  contract, authority: authority.address, treasury, devTeam: MOSS_AUCTION_DEV_TEAM, taxBps: 500 });
const order = await service.prepareMatch(terms), digest = TypedDataEncoder.hash(domain, ARENA_MATCH_TYPES, terms);
assert.equal(order.termsHash, digest); assert.equal(order.contract, contract); assert.equal(order.chainId, 4663); assert.equal(order.token, MOSS_TOKEN.address);
assert.equal(verifyTypedData(domain, ARENA_MATCH_TYPES, order, order.signature), authority.address);
assert.deepEqual(JSON.parse(JSON.stringify(order)), order, 'Authored terms are durable JSON without BigInts.');
assert.deepEqual(await service.prepareMatch(terms), order, 'Retrying unchanged unsigned terms produces the same complete authorization.');
const funding = abi.parseTransaction(order), approval = erc20Interface.parseTransaction(order.approval);
assert.equal(order.to, contract); assert.equal(funding.name, 'fund'); assert.equal(funding.args[0].matchId, terms.matchId);
assert.equal(funding.args[0].stakeWei, BigInt(terms.stakeWei)); assert.equal(funding.args[1], order.signature);
assert.equal(order.approval.to, MOSS_TOKEN.address); assert.equal(approval.name, 'approve');
assert.equal(approval.args[0], contract); assert.equal(approval.args[1], BigInt(terms.stakeWei), 'Approval is exactly one stake.');
assert.deepEqual(await service.verifyMatch(order), { funded: 0, closed: false, block: initialBlock });

for (const funded of [1, 2, 3]) {
  states.latest = [digest, BigInt(funded), false];
  assert.deepEqual(await service.verifyMatch(order), { funded, closed: false, block: initialBlock });
  await assert.rejects(service.prepareMatch(terms), /already has a funding record/);
}
assert.deepEqual(await service.verifyMatch(order, { finalized: true }), { funded: 0, closed: false, block: initialFinalized }, 'Soft funding does not pretend the finalized snapshot is funded.');
heads.finalized = null;
assert.equal((await service.verifyMatch(order)).funded, 3, 'Fresh canonical deposits are usable without waiting for finality.');
assert((await service.status()).enabled, 'Unavailable finality does not disable soft funding.');
await assert.rejects(service.verifyMatch(order, { finalized: true }), 'Terminal cleanup cannot fall back to latest when finality is missing.');
states.latest = [ZeroHash, 0n, false];
assert.deepEqual(await service.prepareMatch(terms), order, 'New authorizations use the latest snapshot even while finality is unavailable.');
heads.finalized = { ...initialFinalized };
for (const funded of [0, 1, 2, 3]) {
  states.latest = [digest, BigInt(funded), true];
  assert.deepEqual(await service.verifyMatch(order), { funded, closed: true, block: initialBlock }, 'Draws, unilateral refunds and settled matches remain closed.');
}
for (const invalid of [[ZeroHash, 1n, false], [ZeroHash, 0n, true], [digest, 4n, false], [digest, 0n, false], [id('other-terms'), 3n, false]]) {
  states.latest = invalid; await assert.rejects(service.verifyMatch(order), /does not match|do not match/);
}
states.latest = [ZeroHash, 0n, false];

for (const change of [
  { matchId: 'uuid-is-not-bytes32' }, { matchId: ZeroHash }, { playerA: ZeroAddress }, { playerB: a.address }, { playerA: contract }, { playerB: contract },
  ...['0', '-1', '01', '1.5', '1e18', '', '1'.repeat(1000), (1n << 255n).toString(), 100, null].map(stakeWei => ({ stakeWei })),
  { fundingDeadline: 0 }, { fundingDeadline: 1.5 }, { fundingDeadline: String(now + 600) },
  { refundAfter: now + 599 }, { refundAfter: now + 600 }, { refundAfter: Number.MAX_SAFE_INTEGER + 1 },
]) {
  const mark = calls.length;
  await assert.rejects(service.prepareMatch({ ...terms, ...change }));
  assert.equal(calls.length, mark, 'Malformed match terms fail before RPC or signing.');
}
await assert.rejects(service.prepareMatch({ ...terms, fundingDeadline: now - 1 }), /deadline has expired/);
for (const change of [
  { stakeWei: '1' }, { playerA: other.address }, { playerB: other.address }, { matchId: id('forged-match') },
  { fundingDeadline: terms.fundingDeadline + 1 }, { refundAfter: terms.refundAfter + 1 }, { termsHash: ZeroHash },
  { contract: other.address }, { token: other.address }, { chainId: 46630 }, { to: other.address }, { data: '0x' },
  { approval: { ...order.approval, to: other.address } }, { approval: { ...order.approval, data: erc20Interface.encodeFunctionData('approve', [contract, 1n]) } },
  { signature: '0x1234' }, { signature: await other.signTypedData(domain, ARENA_MATCH_TYPES, terms) },
  { signature: await authority.signTypedData({ ...domain, chainId: 46630 }, ARENA_MATCH_TYPES, terms) },
  { signature: await authority.signTypedData({ ...domain, verifyingContract: other.address }, ARENA_MATCH_TYPES, terms) },
]) {
  const mark = calls.length;
  await assert.rejects(service.verifyMatch({ ...order, ...change }));
  await assert.rejects(service.prepareResult({ ...order, ...change }, a.address));
  assert.throws(() => service.refund({ ...order, ...change }));
  assert.equal(calls.length, mark, 'Forged persisted authorizations are rejected before chain access.');
}

unavailable = true;
const beforeOffline = calls.length;
for (const winner of [a.address, b.address, ZeroAddress]) {
  const result = await service.prepareResult(order, winner), decoded = abi.parseTransaction(result);
  assert.equal(result.winner, winner); assert.equal(result.chainId, 4663); assert.equal(result.contract, contract); assert.equal(result.matchId, terms.matchId);
  assert.equal(decoded.name, 'settle'); assert.equal(decoded.args[0].matchId, terms.matchId); assert.equal(decoded.args[1], winner); assert.equal(decoded.args[2], result.signature);
  assert.equal(verifyTypedData(domain, ARENA_RESULT_TYPES, { matchId: terms.matchId, termsHash: digest, winner }, result.signature), authority.address);
  assert.deepEqual(await service.prepareResult(order, winner), result, 'A frozen result produces one repeatable signed payout.');
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
}
await assert.rejects(service.prepareResult(order, other.address), /winner must be one of/);
const refund = service.refund(order); assert.equal(abi.parseTransaction(refund).name, 'refund'); assert.equal(refund.to, contract);
assert.equal(calls.length, beforeOffline, 'Result signing and refund encoding still work during an RPC outage.');
assert.equal((await service.status()).enabled, false); await assert.rejects(service.verifyMatch(order), /RPC outage/);
unavailable = false; assert.equal((await service.status()).enabled, true, 'RPC failure does not poison later checks.');

for (const [field, value] of [['authority', other.address], ['paymentToken', other.address], ['treasury', other.address], ['devTeam', other.address],
  ['TAX_BPS', 501n], ['name', 'Fake Moss'], ['symbol', 'FAKE'], ['decimals', 6n]]) {
  const original = identity[field]; identity[field] = value;
  assert.equal((await service.status()).enabled, false, `${field} mismatch disables wagers`);
  await assert.rejects(service.verifyMatch(order)); identity[field] = original;
}
code = '0x6000'; assert.equal((await service.status()).enabled, false); code = artifact.deployedBytecode;
tokenCode = '0x6000'; assert.equal((await service.status()).enabled, false); tokenCode = tokenRuntime;
chainId = '0x1'; assert.equal((await service.status()).enabled, false); chainId = '0x1237';
canonical.latest = { ...heads.latest, hash: id('different-canonical-hash') };
assert.equal((await service.status()).enabled, false); canonical.latest = { ...heads.latest };
for (const mode of ['latest', 'finalized']) {
  replaceAfterRead = mode;
  await assert.rejects(service.verifyMatch(order, { finalized: mode === 'finalized' }), /changed during verification/);
  replaceAfterRead = false; canonical[mode] = { ...heads[mode] };
}
for (const invalid of [null, { ...initialBlock, timestamp: toQuantity(now - 130) }, { ...initialBlock, timestamp: toQuantity(now + 600) },
  { ...initialBlock, number: '0x065' }, { ...initialBlock, timestamp: '0xno' }]) {
  heads.latest = canonical.latest = invalid;
  assert.equal((await service.status()).enabled, false, 'Missing, stale, future or malformed latest snapshots fail closed.');
  await assert.rejects(service.verifyMatch(order));
}
heads.latest = canonical.latest = { ...initialBlock, hash: id('replacement-latest-block') };
states.latest = [digest, 1n, false];
assert.equal((await service.verifyMatch(order)).funded, 1, 'A later read may recover onto a canonical same-height reorganization.');
heads.latest = canonical.latest = { ...initialBlock, number: '0x63', hash: id('lower-latest-block') };
states.latest = [ZeroHash, 0n, false];
assert.equal((await service.verifyMatch(order)).funded, 0, 'Latest state may regress after a reorganization without poisoning the reader.');
heads.latest = canonical.latest = { ...initialBlock };
await service.verifyMatch(order, { finalized: true });
for (const invalid of [null, { ...initialFinalized, number: '0x63' }, { ...initialFinalized, hash: id('conflicting-finalized-block') },
  { ...initialFinalized, timestamp: toQuantity(now - 1900) }, { ...initialFinalized, timestamp: toQuantity(now + 600) },
  { ...initialFinalized, number: '0x064' }, { ...initialFinalized, timestamp: '0xno' }]) {
  heads.finalized = canonical.finalized = invalid;
  await assert.rejects(service.verifyMatch(order, { finalized: true }), 'Unavailable, regressed, stale and inconsistent finality fails closed.');
  assert((await service.status()).enabled, 'Finalized cleanup failure does not poison latest verification.');
}
reset();
states.latest = [digest, 3n, true]; states.finalized = [digest, 1n, false];
const [ready, first, second, finalizedFirst, finalizedSecond] = await Promise.all([service.status(), service.verifyMatch(order), service.verifyMatch(order),
  service.verifyMatch(order, { finalized: true }), service.verifyMatch(order, { finalized: true })]);
assert(ready.enabled);
assert.deepEqual(first, { funded: 3, closed: true, block: initialBlock }); assert.deepEqual(second, first);
assert.deepEqual(finalizedFirst, { funded: 1, closed: false, block: initialFinalized }); assert.deepEqual(finalizedSecond, finalizedFirst);
assert.equal(calls.filter(c => c.method === 'eth_chainId').length, 2, 'Concurrent readers share identity verification only within their requested mode.');
for (const mode of ['latest', 'finalized']) assert.equal(calls.filter(c => c.method === 'eth_getBlockByNumber' && c.params[0] === mode).length, 1);
await service.status(); assert.equal(calls.filter(c => c.method === 'eth_chainId').length, 3, 'A completed verification never hides a future outage or identity change.');
for (const optionsChange of [{ contract: '' }, { authorityKey: '' }, { treasury: '' }, { treasury: contract }, { authorityKey: 'invalid' }, { chainId: 46630 }]) {
  const mark = calls.length;
  assert.equal((await createArenaChain({ ...options, ...optionsChange }).status()).enabled, false);
  assert.equal(calls.length, mark, 'Missing or unsupported configuration does not issue RPC requests.');
}
assert(!JSON.stringify(status).includes(authority.privateKey));
assert(!calls.some(c => /send|TransactionReceipt/.test(c.method)), 'No client transaction hash can replace canonical match storage.');
console.log('Arena chain passed: fresh canonical soft funding, independent finalized cleanup, reorganization recovery, pinned contract/token/tax identity, exact approvals, signed terms, offline results, replay state and concurrent verification.');
