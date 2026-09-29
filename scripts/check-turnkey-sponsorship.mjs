import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { Interface, Wallet, getBytes, hashAuthorization, hashMessage, toBeHex, ZeroAddress } from 'ethers';
import { getUserOperationHash } from 'viem/account-abstraction';
import { createTurnkeySponsorshipConfig, createTurnkeySponsorship, createTurnkeySponsorshipHandler, sponsorshipError } from '../src/turnkey-sponsorship.mjs';
import { SPONSORED_DELEGATE, SPONSORED_ENTRY_POINT, SPONSORED_NATIVE_TOKEN, validateSponsoredPrepared } from '../src/turnkey-sponsored-validation.mjs';
import { MOSS_TOKEN } from '../src/auction.ts';
import { erc20Interface } from '../src/auction-chain.mjs';

const buyer = new Wallet('0x' + '1'.repeat(64)), other = new Wallet('0x' + '2'.repeat(64));
const contract = '0x' + '3'.repeat(40), paymaster = '0x' + '4'.repeat(40);
const env = { ALCHEMY_WALLET_API_KEY: 'private-test-api-key', ALCHEMY_GAS_POLICY_ID: '11111111-2222-4333-8444-555555555555',
  TURNKEY_SPONSOR_MAX_OPERATION_WEI: '2000000', TURNKEY_SPONSOR_ACCOUNT_DAILY_WEI: '4000000', TURNKEY_SPONSOR_WALLET_DAILY_WEI: '4000000',
  TURNKEY_SPONSOR_GLOBAL_DAILY_WEI: '100000000', TURNKEY_SPONSOR_MAX_FEE_PER_GAS_WEI: '10', TURNKEY_SPONSOR_GLOBAL_DAILY_OPERATIONS: '100' };
const config = createTurnkeySponsorshipConfig(env), account = name => createHash('sha256').update(name).digest('hex');
assert.equal(createTurnkeySponsorshipConfig({}), null);
assert.equal(await createTurnkeySponsorship().sponsoredOperation({}), null);
for (const key of Object.keys(env)) assert.throws(() => createTurnkeySponsorshipConfig({ ...env, [key]: '' }));
for (const value of ['0', '-1', '1.5', '1e3']) assert.throws(() => createTurnkeySponsorshipConfig({ ...env, TURNKEY_SPONSOR_MAX_OPERATION_WEI: value }));
assert.throws(() => createTurnkeySponsorshipConfig({ ...env, TURNKEY_SPONSOR_GLOBAL_DAILY_OPERATIONS: '1000001' }));
assert.throws(() => createTurnkeySponsorship({ config }), /canonical PostgreSQL/);

const suffix = randomUUID().replaceAll('-', ''), schema = `turnkey_sponsored_${suffix}`, services = [];
let admin, container, http, url, nextNonce = 0n, failure, badPrepared, delegationNonce = 0, code = '0x', balance = 1000000000000000000n;
const originalNow = Date.now; let timeOffset = 0, invalidWindow = false, changedWindow = false, nonceOverride, reorg = false, retainNonce = false, tokenAllowance = 0n;
let finalizedNumber = 42, reorgDuringFinality = false;
Date.now = () => originalNow() + timeOffset;
const prepared = new Map(), accepted = new Map(), receipts = new Map(), sends = [], prepares = [];
const windows = new Map();
const blockTimes = new Map();
const abi = new Interface(['function execute(address,uint256,bytes)', 'function executeBatch((address,uint256,bytes)[])']);
const entryPoint = new Interface(['function getNonce(address,uint192) view returns(uint256)']);
const paymasterValidation = new Interface(['function validatePaymasterUserOp((address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature),bytes32,uint256) returns(bytes,uint256)']);
const events = new Interface(['event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)']);
const transaction = (from = buyer.address, value = '0x0') => ({ from, to: contract, data: '0x1234', value, chainId: '0x1237' });
const requestParams = tx => [{ from: tx.from, chainId: tx.chainId, calls: [...(tx.approval ? [tx.approval] : []), { to: tx.to, data: tx.data, value: tx.value }], capabilities: {} }];
const authorize = (id, tx = transaction()) => async () => ({ id, transaction: tx });
const provider = {
  async send(method) { assert.equal(method, 'eth_chainId'); return '0x1237'; },
  async getCode() { return code; }, async getBalance() { return balance; }, async getTransactionCount() { return delegationNonce; },
  async call(input) {
    if (input.to === SPONSORED_ENTRY_POINT) return entryPoint.encodeFunctionResult('getNonce', [nonceOverride ?? nextNonce]);
    if (input.to === MOSS_TOKEN.address) {
      const args = erc20Interface.decodeFunctionData('allowance', input.data);
      assert.equal(args[0], buyer.address); assert.equal(args[1], contract);
      return erc20Interface.encodeFunctionResult('allowance', [tokenAllowance]);
    }
    assert.equal(input.to, paymaster); assert.equal(input.from, SPONSORED_ENTRY_POINT); assert.equal(input.blockTag, 42);
    const [op, opHash, maxCost] = paymasterValidation.decodeFunctionData('validatePaymasterUserOp', input.data);
    assert.equal(op.initCode, '0x'); assert.equal(op.signature, '0x'); assert(maxCost > 0n);
    const until = windows.get(opHash); assert(until, 'validate the exact previously prepared operation');
    return paymasterValidation.encodeFunctionResult('validatePaymasterUserOp', ['0x', invalidWindow ? 0n : (BigInt(until + (changedWindow ? 1 : 0)) << 160n)]);
  },
  async getTransactionReceipt(hash) { return receipts.get(hash) ?? null; },
  async getBlock(tag) {
    if (tag === 'finalized' && reorgDuringFinality) reorg = true;
    return { number: tag === 'finalized' ? finalizedNumber : typeof tag === 'number' ? tag : 42,
      hash: '0x' + (reorg && typeof tag === 'number' ? 'd' : 'a').repeat(64),
      timestamp: typeof tag === 'number' && blockTimes.has(tag) ? blockTimes.get(tag) : Math.floor(Date.now() / 1000) };
  },
};
function fixture(input) {
  if (!retainNonce) nextNonce++;
  const call = input.calls[0], op = { sender: input.from, nonce: `0x${nextNonce.toString(16)}`, callData: abi.encodeFunctionData('executeBatch', [input.calls.map(call => [call.to, call.value, call.data])]),
    callGasLimit: '0xc350', verificationGasLimit: '0x7530', preVerificationGas: '0x5208', maxFeePerGas: '0xa', maxPriorityFeePerGas: '0x0',
    paymaster, paymasterVerificationGasLimit: '0xbb8', paymasterPostOpGasLimit: '0x0', paymasterData: toBeHex(Math.floor(Date.now() / 1000) + 120) };
  if (badPrepared) op.callData = abi.encodeFunctionData('executeBatch', [[[other.address, '0x0', call.data]]]);
  const numeric = Object.fromEntries(Object.entries(op).map(([key, value]) => [key, ['nonce', 'callGasLimit', 'verificationGasLimit', 'preVerificationGas', 'maxFeePerGas', 'maxPriorityFeePerGas', 'paymasterVerificationGasLimit', 'paymasterPostOpGasLimit'].includes(key) ? BigInt(value) : value]));
  const hash = getUserOperationHash({ chainId: 4663, entryPointAddress: SPONSORED_ENTRY_POINT, entryPointVersion: '0.7', userOperation: numeric });
  windows.set(hash, Math.floor(Date.now() / 1000) + 120);
  const authorization = { type: 'authorization', data: { address: SPONSORED_DELEGATE, nonce: `0x${delegationNonce.toString(16)}` }, chainId: '0x1237',
    signatureRequest: { type: 'eip7702Auth', rawPayload: hashAuthorization({ address: SPONSORED_DELEGATE, nonce: delegationNonce, chainId: 4663 }) } };
  const operation = { type: 'user-operation-v070', data: op, chainId: '0x1237', feePayment: { sponsored: true, tokenAddress: SPONSORED_NATIVE_TOKEN, maxAmount: `0x${(1040000n).toString(16)}` },
    signatureRequest: { type: 'personal_sign', data: { raw: hash }, rawPayload: hashMessage(getBytes(hash)) } };
  const result = { type: 'array', data: [authorization, operation] };
  prepared.set(`${toBeHex(4663, 32)}${hash.slice(2)}`, result); return result;
}
const upstream = async (method, params) => {
  if (method === 'wallet_prepareCalls') {
    assert.equal(params[0].capabilities.paymasterService.policyId, config.policyId);
    assert.equal(params[0].capabilities.eip7702Auth.delegation, SPONSORED_DELEGATE);
    prepares.push(structuredClone(params)); return fixture(params[0]);
  }
  if (method === 'wallet_getCallsStatus') {
    if (!accepted.has(params[0])) throw Object.assign(sponsorshipError(404, 'unknown operation'), { rpcCode: 5730 });
    return structuredClone(accepted.get(params[0]));
  }
  assert.equal(method, 'wallet_sendPreparedCalls');
  assert.equal(params[0].capabilities.paymasterService.policyId, config.policyId);
  assert((await rows()).some(row => row.signed), 'signed operation must be durable before provider submission');
  sends.push(structuredClone(params));
  if (failure === 'before') { failure = undefined; throw sponsorshipError(503, 'unknown submission'); }
  const value = params[0].type === 'array' ? params[0].data.find(part => part.type === 'user-operation-v070') : params[0];
  const saved = [...prepared.entries()].find(([, entry]) => entry.data.find(part => part.type === 'user-operation-v070').data.nonce === value.data.nonce);
  assert(saved); const [id] = saved;
  accepted.set(id, { id, chainId: '0x1237', status: 100 });
  if (failure === 'after') { failure = undefined; throw sponsorshipError(503, 'lost response'); }
  return { id };
};
async function sign(value, signer = buyer) {
  const parts = value.type === 'array' ? value.data : [value];
  const result = await Promise.all(parts.map(async part => {
    const { signatureRequest, feePayment: _, ...rest } = part;
    const signature = part.type === 'authorization' ? signer.signingKey.sign(signatureRequest.rawPayload).serialized : await signer.signMessage(getBytes(signatureRequest.data.raw));
    return { ...rest, signature: { type: 'secp256k1', data: signature } };
  }));
  return { type: 'array', data: result, capabilities: {} };
}
const rows = async () => (await admin.query(`SELECT * FROM ${schema}.mossvale_sponsored_operations ORDER BY created_at`)).rows;
function mine(row, success = true) {
  const transactionHash = '0x' + (success ? 'b' : 'c').repeat(64), blockHash = '0x' + 'a'.repeat(64);
  const nonce = row.prepared.data.find(part => part.type === 'user-operation-v070').data.nonce;
  nextNonce = BigInt(nonce) + 1n;
  blockTimes.set(42, Math.floor(Date.now() / 1000));
  const log = events.encodeEventLog('UserOperationEvent', [row.user_op_hash, row.wallet, row.paymaster, nonce, success, 100n, 100n]);
  receipts.set(transactionHash, { hash: transactionHash, status: 1, blockNumber: 42, blockHash, gasUsed: 21000n,
    logs: [{ address: SPONSORED_ENTRY_POINT, ...log, blockNumber: 42, blockHash, transactionHash, index: 0 }] });
  accepted.set(row.call_id, { id: row.call_id, chainId: '0x1237', status: success ? 200 : 500, receipts: [{ transactionHash }] });
  return transactionHash;
}
async function reset() {
  await admin.query(`TRUNCATE ${schema}.mossvale_sponsored_operations`);
  prepared.clear(); accepted.clear(); receipts.clear(); sends.length = prepares.length = 0;
  nextNonce = 0n; failure = badPrepared = undefined; delegationNonce = 0; code = '0x'; balance = 1000000000000000000n;
  timeOffset = 0; invalidWindow = changedWindow = reorg = retainNonce = false; nonceOverride = undefined; windows.clear(); tokenAllowance = 0n;
  finalizedNumber = 42; reorgDuringFinality = false; blockTimes.clear();
}
try {
  let connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    container = `mossvale-sponsored-${suffix}`;
    execFileSync('docker', ['run', '--detach', '--rm', '--name', container, '--env', 'POSTGRES_PASSWORD=isolated-test-only', '--publish', '127.0.0.1::5432', 'postgres:17-bookworm'], { stdio: 'pipe' });
    connectionString = `postgresql://postgres:isolated-test-only@${execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8' }).trim()}/postgres`;
  }
  url = new URL(connectionString); assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Use disposable local PostgreSQL only');
  for (let attempt = 0; ; attempt++) {
    admin = new pg.Client({ connectionString, connectionTimeoutMillis: 1000 });
    try { await admin.connect(); break; } catch (error) { await admin.end(); if (attempt >= 100) throw error; await delay(100); }
  }
  await admin.query(`CREATE SCHEMA ${schema}`); url.searchParams.set('options', `-c search_path=${schema}`);
  async function make(extra = {}) {
    const service = createTurnkeySponsorship({ config: { ...config, ...extra }, connection: { connectionString: url.toString() }, provider, request: upstream });
    services.push(service); await service.start(); return service;
  }
  const eu = await make(), us = await make(), asia = await make(), key = account('buyer');
  await reset();
  const [quote, sameQuote] = await Promise.all([eu.rpc(key, 'wallet_prepareCalls', requestParams(transaction()), authorize('claim')),
    us.rpc(key, 'wallet_prepareCalls', requestParams(transaction()), authorize('claim'))]);
  assert.deepEqual(sameQuote, quote); assert.equal(prepares.length, 1); assert.equal((await rows()).length, 1);
  assert.deepEqual(quote.data[1].feePayment, [...prepared.values()][0].data[1].feePayment, 'the broker preserves validated sponsor cost metadata');
  assert.deepEqual((await rows())[0].prepared.data[1].feePayment, quote.data[1].feePayment, 'the saved quote preserves the same metadata');
  assert(!JSON.stringify(quote).includes(config.policyId)); assert(!JSON.stringify(quote).includes(config.apiKey));
  const signed = await sign(quote), checked = validateSponsoredPrepared(quote, transaction(), config);
  await assert.rejects(asia.rpc(account('other'), 'wallet_sendPreparedCalls', [signed], authorize('claim')), /no matching/);
  await assert.rejects(eu.rpc(key, 'wallet_sendPreparedCalls', [await sign(quote, other)], authorize('claim')), /reviewed/);
  const tampered = structuredClone(signed); tampered.data[1].data.maxFeePerGas = '0xb';
  await assert.rejects(eu.rpc(key, 'wallet_sendPreparedCalls', [tampered], authorize('claim')), /no matching/);
  failure = 'after'; await assert.rejects(eu.rpc(key, 'wallet_sendPreparedCalls', [signed], authorize('claim')), /lost response/);
  const resumed = await us.rpc(key, 'wallet_sendPreparedCalls', [signed], authorize('claim'));
  assert.equal(resumed.id, checked.callId); assert.equal(resumed.preparedCallIds[0], checked.callId); assert.equal(sends.length, 1);
  await assert.rejects(asia.rpc(account('other'), 'wallet_getCallsStatus', [checked.callId]), /no submitted/);
  const [row] = await rows(), transactionHash = mine(row);
  const status = await asia.rpc(key, 'wallet_getCallsStatus', [checked.callId]); assert.equal(status.status, 200);
  assert.equal(status.receipts[0].transactionHash, transactionHash); assert((await rows())[0].settled_at > 0);
  assert.deepEqual(await eu.sponsoredOperation({ transactionHash, wallet: buyer.address, contract }),
    { userOpHash: checked.userOpHash, entryPoint: SPONSORED_ENTRY_POINT, sender: buyer.address.toLowerCase(), paymaster: paymaster.toLowerCase() });
  assert.equal(await eu.sponsoredOperation({ transactionHash, wallet: buyer.address, contract: other.address }), null);

  await reset();
  const batchTransaction = { ...transaction(), approval: { to: MOSS_TOKEN.address, data: erc20Interface.encodeFunctionData('approve', [contract, 100n]), value: '0x0' } };
  const batchIntent = 'auction:exact-order:buy', atomic = await make({ globalDailyOperations: 1 });
  const batchQuote = await atomic.rpc(key, 'wallet_prepareCalls', requestParams(batchTransaction), authorize(batchIntent, batchTransaction));
  const batchInfo = validateSponsoredPrepared(batchQuote, batchTransaction, config), [batchRow] = await rows();
  assert.equal(batchRow.contract, contract, 'atomic receipt lookup remains bound to the primary auction contract');
  assert.deepEqual(batchRow.transaction, batchTransaction, 'both exact calls are saved in the durable transaction');
  assert.deepEqual(prepares[0][0].calls, requestParams(batchTransaction)[0].calls, 'the provider receives approval then buy in one operation');
  assert.equal(batchRow.cost_wei, batchInfo.costWei.toString(), 'one full signed UserOp cost reserves the atomic purchase budget');
  const decodedCalls = abi.decodeFunctionData('executeBatch', batchQuote.data[1].data.callData)[0].map(call => [...call]);
  for (const callData of [
    abi.encodeFunctionData('executeBatch', [[...decodedCalls].reverse()]),
    abi.encodeFunctionData('executeBatch', [[...decodedCalls, decodedCalls[1]]]),
    abi.encodeFunctionData('executeBatch', [[decodedCalls[1]]]),
    abi.encodeFunctionData('executeBatch', [[[other.address, 0n, decodedCalls[0][2]], decodedCalls[1]]]),
    abi.encodeFunctionData('executeBatch', [[[decodedCalls[0][0], 1n, decodedCalls[0][2]], decodedCalls[1]]]),
    abi.encodeFunctionData('executeBatch', [[decodedCalls[0], [decodedCalls[1][0], 0n, decodedCalls[1][2] + '00']]]),
    abi.encodeFunctionData('execute', decodedCalls[1]), batchQuote.data[1].data.callData + '00',
  ]) {
    const mutated = structuredClone(batchQuote); mutated.data[1].data.callData = callData;
    assert.throws(() => validateSponsoredPrepared(mutated, batchTransaction, config), /reviewed/, 'only the exact canonical ordered two-call batch can be signed');
  }
  const batchSigned = await sign(batchQuote);
  await assert.rejects(atomic.rpc(account('other'), 'wallet_sendPreparedCalls', [batchSigned], authorize(batchIntent, batchTransaction)), /no matching/);
  const modifiedBatch = structuredClone(batchSigned); modifiedBatch.data[1].data.callData += '00';
  await assert.rejects(atomic.rpc(key, 'wallet_sendPreparedCalls', [modifiedBatch], authorize(batchIntent, batchTransaction)), /no matching/);
  failure = 'before'; await assert.rejects(atomic.rpc(key, 'wallet_sendPreparedCalls', [batchSigned], authorize(batchIntent, batchTransaction)), /unknown submission/);
  const batchSent = await us.rpc(key, 'wallet_sendPreparedCalls', [batchSigned], authorize(batchIntent, batchTransaction));
  assert.deepEqual(batchSent.details.data.calls, requestParams(batchTransaction)[0].calls);
  assert.equal(sends.length, 2); assert.deepEqual(sends[0], sends[1]); assert.equal((await rows()).length, 1, 'uncertain batch recovery replays one exact saved operation');
  const batchHash = mine((await rows())[0]);
  assert.equal((await asia.rpc(key, 'wallet_getCallsStatus', [batchInfo.callId])).status, 200);
  assert.equal((await eu.sponsoredOperation({ transactionHash: batchHash, wallet: buyer.address, contract })).userOpHash, batchInfo.userOpHash);
  await assert.rejects(atomic.rpc(account('later'), 'wallet_prepareCalls', requestParams(transaction(other.address)), authorize('later', transaction(other.address))), /daily fee sponsorship/);
  assert.equal(prepares.length, 1, 'one batch consumes exactly one operation reservation, with caps enforced before another provider request');
  assert.deepEqual(await us.rpc(key, 'wallet_prepareCalls', requestParams(transaction()), authorize(batchIntent)), batchQuote,
    'switching a buy from batch to single cannot create a parallel sponsorship');
  assert.throws(() => validateSponsoredPrepared(batchQuote, transaction()), /reviewed/);

  await reset();
  const legacyQuote = await eu.rpc(key, 'wallet_prepareCalls', requestParams(transaction()), authorize(batchIntent));
  assert.deepEqual(await us.rpc(key, 'wallet_prepareCalls', requestParams(batchTransaction), authorize(batchIntent, batchTransaction)), legacyQuote,
    'an existing single-buy intent keeps its immutable quote instead of allocating a parallel batch');
  assert.throws(() => validateSponsoredPrepared(legacyQuote, batchTransaction), /reviewed/);
  assert.equal(prepares.length, 1); assert.equal((await rows()).length, 1);

  await reset(); failure = 'before';
  const quote2 = await eu.rpc(key, 'wallet_prepareCalls', requestParams(transaction()), authorize('retry')), signed2 = await sign(quote2);
  await assert.rejects(eu.rpc(key, 'wallet_sendPreparedCalls', [signed2], authorize('retry')), /unknown submission/);
  await asia.rpc(key, 'wallet_sendPreparedCalls', [signed2], authorize('retry'));
  assert.equal(sends.length, 2); assert.deepEqual(sends[0], sends[1]); assert.equal(accepted.size, 1); assert.equal((await rows()).length, 1);
  const [failedRow] = await rows(); mine(failedRow, false);
  assert.equal((await eu.rpc(key, 'wallet_getCallsStatus', [failedRow.call_id])).status, 500, 'canonical UserOp failure can close client pending state');
  const replacement = await us.rpc(key, 'wallet_prepareCalls', requestParams(transaction()), authorize('retry'));
  assert.notEqual(validateSponsoredPrepared(replacement, transaction(), config).userOpHash, failedRow.user_op_hash, 'a fresh canonical failure allows a new current-nonce quote');
  accepted.set(failedRow.call_id, { id: failedRow.call_id, chainId: '0x1237', status: 400 });
  await assert.rejects(eu.rpc(key, 'wallet_getCallsStatus', [failedRow.call_id]), /saved authorization requires review/);

  await reset(); badPrepared = true;
  await assert.rejects(eu.rpc(key, 'wallet_prepareCalls', requestParams(transaction()), authorize('bad-provider')), /reviewed/); assert.equal((await rows()).length, 0);
  badPrepared = false;
  await assert.rejects(eu.rpc(key, 'wallet_prepareCalls', [{ ...requestParams(transaction())[0], capabilities: { paymasterService: { policyId: config.policyId } } }], authorize('client-policy')), /selected by the game/);
  await assert.rejects(eu.rpc(key, 'wallet_prepareCalls', requestParams(transaction(other.address)), authorize('wrong-owner')), /changed/);
  await assert.rejects(eu.rpc(key, 'eth_sendRawTransaction', ['0x1234'], authorize('raw')), /not available/);
  await assert.rejects(eu.rpc(key, 'wallet_prepareCalls', [{ ...requestParams(transaction())[0], calls: [...requestParams(transaction())[0].calls, ...requestParams(transaction())[0].calls] }], authorize('batch')), /changed/);
  await assert.rejects(eu.rpc(key, 'wallet_prepareCalls', [{ ...requestParams(transaction())[0], calls: Array(3).fill(requestParams(transaction())[0].calls[0]) }], authorize('batch')), /one exact/);
  code = '0x1234'; await assert.rejects(eu.rpc(key, 'wallet_prepareCalls', requestParams(transaction()), authorize('code')), /unsupported/);
  code = '0x'; balance = 0n; await assert.rejects(eu.rpc(key, 'wallet_prepareCalls', requestParams(transaction(buyer.address, '0x1')), authorize('eth-buy', transaction(buyer.address, '0x1'))), /purchase amount/);
  balance = 1n; const valueQuote = await eu.rpc(key, 'wallet_prepareCalls', requestParams(transaction(buyer.address, '0x1')), authorize('eth-buy', transaction(buyer.address, '0x1')));
  assert(validateSponsoredPrepared(valueQuote, transaction(buyer.address, '0x1'), config));

  await reset(); const limited = await make({ globalDailyOperations: 2 });
  await limited.rpc(key, 'wallet_prepareCalls', requestParams(transaction()), authorize('count-one'));
  await limited.rpc(key, 'wallet_prepareCalls', requestParams(transaction()), authorize('count-two'));
  await admin.query(`UPDATE ${schema}.mossvale_sponsored_operations SET day=day-1,created_at=created_at-86400000`);
  await assert.rejects(limited.rpc(account('new-player'), 'wallet_prepareCalls', requestParams(transaction(other.address)), authorize('count-three', transaction(other.address))), /daily fee sponsorship/);
  assert.equal((await rows()).length, 2, 'old-day unsettled authorizations reserve the new day budget');
  assert.equal(prepares.length, 2, 'an exhausted count must not call the upstream preparation API');
  await admin.query(`UPDATE ${schema}.mossvale_sponsored_operations SET settled_at=$1`, [Date.now() - 86400000]);
  await limited.rpc(account('new-player'), 'wallet_prepareCalls', requestParams(transaction(other.address)), authorize('count-three', transaction(other.address)));
  assert.equal((await rows()).length, 3, 'prior-day canonical settlement permits a new day reservation');
  await reset(); for (let i = 0; i < 2; i++) await eu.rpc(key, 'wallet_prepareCalls', requestParams(transaction()), authorize(`wei-${i}`));
  await assert.rejects(eu.rpc(key, 'wallet_prepareCalls', requestParams(transaction()), authorize('wei-three')), /daily fee sponsorship/);
  assert.equal(prepares.length, 2, 'an exhausted conservative wei allowance must not call the upstream preparation API');

  await reset(); const midnightLimit = await make({ globalDailyOperations: 1 });
  timeOffset = (Math.floor(originalNow() / 86400000) + 1) * 86400000 - 30000 - originalNow();
  const midnightQuote = await midnightLimit.rpc(key, 'wallet_prepareCalls', requestParams(transaction()), authorize('midnight'));
  await midnightLimit.rpc(key, 'wallet_sendPreparedCalls', [await sign(midnightQuote)], authorize('midnight'));
  const [midnightRow] = await rows(); mine(midnightRow); finalizedNumber = 41;
  assert.equal((await midnightLimit.rpc(key, 'wallet_getCallsStatus', [midnightRow.call_id])).status, 200);
  assert.equal((await rows())[0].settled_at, null, 'canonical inclusion alone cannot release the budget carry');
  timeOffset += 40000;
  await assert.rejects(midnightLimit.rpc(account('next-day'), 'wallet_prepareCalls', requestParams(transaction(other.address)), authorize('after-midnight', transaction(other.address))), /daily fee sponsorship/);
  assert.equal(prepares.length, 1, 'a prior-day nonfinal receipt with a live quote still reserves the new day');
  finalizedNumber = 42; reorgDuringFinality = true;
  await assert.rejects(midnightLimit.rpc(key, 'wallet_getCallsStatus', [midnightRow.call_id]), /receipt changed while checking finality/);
  assert.equal((await rows())[0].settled_at, null); reorg = reorgDuringFinality = false;
  assert.equal((await midnightLimit.rpc(key, 'wallet_getCallsStatus', [midnightRow.call_id])).status, 200);
  assert.equal(Math.floor(Number((await rows())[0].settled_at) / 86400000), Number(midnightRow.day));
  await midnightLimit.rpc(account('next-day'), 'wallet_prepareCalls', requestParams(transaction(other.address)), authorize('after-midnight', transaction(other.address)));
  assert.equal(prepares.length, 2, 'a finalized prior-day receipt releases the new-day reservation');

  await reset(); invalidWindow = true;
  await assert.rejects(eu.rpc(key, 'wallet_prepareCalls', requestParams(transaction()), authorize('infinite')), /invalid sponsorship authorization/);
  assert.equal((await rows()).length, 0, 'an unbounded paymaster authorization must never reach the player');
  await reset();
  let expired = await eu.rpc(key, 'wallet_prepareCalls', requestParams(transaction()), authorize('expiry'));
  timeOffset = 181000; changedWindow = true;
  await assert.rejects(us.rpc(key, 'wallet_prepareCalls', requestParams(transaction()), authorize('expiry')), /quote is expiring/);
  assert.equal((await rows())[0].released_at, null, 'changed paymaster validity must keep the old reservation');
  changedWindow = false; reorg = true;
  await assert.rejects(us.rpc(key, 'wallet_prepareCalls', requestParams(transaction()), authorize('expiry')), /expiry block changed/);
  assert.equal((await rows())[0].released_at, null); reorg = false;
  nonceOverride = 99n;
  await assert.rejects(us.rpc(key, 'wallet_prepareCalls', requestParams(transaction()), authorize('expiry')), /quote is expiring/);
  assert.equal((await rows())[0].released_at, null, 'a consumed nonce cannot be treated as unused');
  await reset(); expired = await eu.rpc(key, 'wallet_prepareCalls', requestParams(transaction()), authorize('expiry')); timeOffset = 181000;
  retainNonce = true;
  const refreshed = await us.rpc(key, 'wallet_prepareCalls', requestParams(transaction()), authorize('expiry'));
  assert.notDeepEqual(refreshed, expired); assert((await rows()).find(row => row.released_at));
  assert.equal(refreshed.data[1].data.nonce, expired.data[1].data.nonce, 'preparing does not consume the EntryPoint nonce');
  await assert.rejects(eu.rpc(key, 'wallet_sendPreparedCalls', [await sign(expired)], authorize('expiry')), error =>
    error.rpcCode === 5731 && error.rpcData.reason === 'expired-unused' && error.rpcData.id === validateSponsoredPrepared(expired, transaction()).callId);
  assert.equal((await rows()).length, 2, 'expired unsigned quotes can refresh once canonical time and nonce prove non-use');
  // Released authorizations retain their issuance-day quota, then stop carrying forever.
  timeOffset += 86400000;
  await limited.rpc(account('tomorrow'), 'wallet_prepareCalls', requestParams(transaction(other.address)), authorize('next-day', transaction(other.address)));
  assert.equal((await rows()).length, 3);

  await reset();
  const slowQuote = await eu.rpc(key, 'wallet_prepareCalls', requestParams(transaction()), authorize('slow-sign')), slowSigned = await sign(slowQuote);
  timeOffset = 121000;
  await assert.rejects(us.rpc(key, 'wallet_sendPreparedCalls', [slowSigned], authorize('slow-sign')), /authorization expired/);
  assert.equal((await rows())[0].signed, null); assert.equal(sends.length, 0);
  timeOffset = 181000;
  await assert.rejects(asia.rpc(key, 'wallet_sendPreparedCalls', [slowSigned], authorize('slow-sign')), error =>
    error.rpcCode === 5731 && error.rpcData.fingerprint === validateSponsoredPrepared(slowQuote, transaction()).fingerprint);
  assert((await rows())[0].released_at, 'slow signing can definitively clear a client-only journal after finalized unused expiry');
  await reset();
  const uncertainQuote = await eu.rpc(key, 'wallet_prepareCalls', requestParams(transaction()), authorize('uncertain')), uncertainSigned = await sign(uncertainQuote);
  failure = 'before'; await assert.rejects(eu.rpc(key, 'wallet_sendPreparedCalls', [uncertainSigned], authorize('uncertain')), /unknown submission/);
  timeOffset = 121000;
  await assert.rejects(us.rpc(key, 'wallet_prepareCalls', requestParams(transaction()), authorize('uncertain')), /quote is expiring/);
  assert.equal((await rows())[0].released_at, null, 'signature plus ordinary expiry must remain held before finalized expiry and lag');
  timeOffset = 181000;
  const differentSignature = structuredClone(uncertainSigned), originalSignature = differentSignature.data[1].signature.data;
  differentSignature.data[1].signature.data = originalSignature.slice(0, -2) + (Number.parseInt(originalSignature.slice(-2), 16) - 27).toString(16).padStart(2, '0');
  await assert.rejects(us.rpc(key, 'wallet_sendPreparedCalls', [differentSignature], authorize('uncertain')), /exact previously signed/);
  await assert.rejects(us.rpc(key, 'wallet_sendPreparedCalls', [uncertainSigned], authorize('uncertain')), error => error.rpcCode === 5731);
  assert((await rows())[0].released_at, 'finalized unused nonce proves even a lost signed request never executed');
  assert.equal(sends.length, 1, 'definitive expiry does not rebroadcast a signed request');

  await reset(); const onePerDay = await make({ globalDailyOperations: 1 });
  const ambiguousQuote = await onePerDay.rpc(key, 'wallet_prepareCalls', requestParams(transaction()), authorize('ambiguous')), ambiguousSigned = await sign(ambiguousQuote);
  failure = 'before'; await assert.rejects(onePerDay.rpc(key, 'wallet_sendPreparedCalls', [ambiguousSigned], authorize('ambiguous')), /unknown submission/);
  timeOffset = 181000; nonceOverride = 99n;
  await assert.rejects(onePerDay.rpc(key, 'wallet_prepareCalls', requestParams(transaction()), authorize('ambiguous')), /quote is expiring/);
  assert((await rows())[0].expired_at); assert.equal((await rows())[0].released_at, null, 'changed nonce establishes only budget expiry, never unused execution');
  await assert.rejects(onePerDay.rpc(key, 'wallet_sendPreparedCalls', [ambiguousSigned], authorize('ambiguous')), /earlier execution remains unknown/);
  await assert.rejects(onePerDay.rpc(account('tomorrow'), 'wallet_prepareCalls', requestParams(transaction(other.address)), authorize('future', transaction(other.address))), /daily fee sponsorship/);
  assert.equal(prepares.length, 1, 'ambiguous expiration retains the full proof-day reservation');
  timeOffset += 86400000; nonceOverride = undefined;
  await onePerDay.rpc(account('tomorrow'), 'wallet_prepareCalls', requestParams(transaction(other.address)), authorize('future', transaction(other.address)));
  assert.equal((await rows()).length, 2, 'expired ambiguous signatures cannot permanently exhaust future global budgets');

  await reset();
  const approveA = { ...transaction(), to: MOSS_TOKEN.address, data: erc20Interface.encodeFunctionData('approve', [contract, 100n]) };
  const approvalQuote = await eu.rpc(key, 'wallet_prepareCalls', requestParams(approveA), authorize('auction:A:approve', approveA));
  await eu.rpc(key, 'wallet_sendPreparedCalls', [await sign(approvalQuote)], authorize('auction:A:approve', approveA));
  const [approvalRow] = await rows(); mine(approvalRow); tokenAllowance = 100n;
  await eu.rpc(key, 'wallet_getCallsStatus', [approvalRow.call_id]);
  assert.deepEqual(await us.rpc(key, 'wallet_prepareCalls', requestParams(approveA), authorize('auction:A:approve', approveA)), approvalQuote);
  assert.equal(prepares.length, 1, 'a sufficient allowance must not issue another sponsorship authorization');
  // Another purchase through the same spender consumes A's previously granted allowance.
  tokenAllowance = 0n; nonceOverride = BigInt(approvalQuote.data[1].data.nonce);
  await assert.rejects(us.rpc(key, 'wallet_prepareCalls', requestParams(approveA), authorize('auction:A:approve', approveA)), /nonce is not yet consumed/);
  nonceOverride = undefined;
  const renewedApproval = await us.rpc(key, 'wallet_prepareCalls', requestParams(approveA), authorize('auction:A:approve', approveA));
  assert.notDeepEqual(renewedApproval, approvalQuote); assert.equal(prepares.length, 2);
  assert.equal(renewedApproval.data[1].data.callData, approvalQuote.data[1].data.callData, 'renew only the same exact bounded approval');

  const origins = ['https://mossvale.world', 'https://us.mossvale.world', 'https://asia.mossvale.world'];
  let authenticationCalls = 0, rpcCalls = 0;
  http = createServer(createTurnkeySponsorshipHandler({ sponsor: { rpc: (...args) => { rpcCalls++; return eu.rpc(...args); } }, originAllowed: req => origins.includes(req.headers.origin),
    authenticate: async token => { authenticationCalls++; if (token !== 'valid') throw Error('invalid'); return { recordKey: key }; }, authorize: async (_, tx) => ({ id: 'http', transaction: tx }) }));
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve)); const endpoint = `http://127.0.0.1:${http.address().port}`;
  const headers = { origin: origins[0], authorization: 'Bearer valid', 'content-type': 'application/json' };
  const preflightHeaders = { origin: origins[0], 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, content-type' };
  for (const origin of origins) {
    const response = await fetch(endpoint, { method: 'OPTIONS', headers: { ...preflightHeaders, origin } });
    assert.equal(response.status, 204); assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.equal(response.headers.get('access-control-allow-methods'), 'POST'); assert.equal(response.headers.get('vary'), 'Origin');
    assert.equal(response.headers.get('access-control-allow-credentials'), null);
  }
  for (const extra of [{ origin: 'null' }, { origin: 'https://attacker.test' }, { origin: 'https://user:password@us.mossvale.world' },
    { 'access-control-request-method': 'GET' }, { 'access-control-request-headers': 'authorization, x-evil' }]) {
    const response = await fetch(endpoint, { method: 'OPTIONS', headers: { ...preflightHeaders, ...extra } }); assert.equal(response.status, 403);
    if (extra.origin) assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  assert.equal((await fetch(endpoint, { method: 'OPTIONS', headers: { ...preflightHeaders, cookie: 'unrelated=ignored', authorization: 'Bearer invalid' } })).status, 204);
  assert.equal((await fetch(endpoint, { method: 'OPTIONS', headers: { 'access-control-request-method': 'POST' } })).status, 403);
  assert.equal(authenticationCalls, 0); assert.equal(rpcCalls, 0, 'preflight never authenticates or contacts the provider');
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_sendRawTransaction', params: ['0x1234'] });
  for (const [extra, expected] of [[{ origin: 'null' }, 403], [{ origin: 'https://attacker.test' }, 403],
    [{ 'content-type': 'text/plain' }, 415], [{ authorization: 'Basic invalid' }, 401]]) {
    assert.equal((await fetch(endpoint, { method: 'POST', headers: { ...headers, ...extra }, body })).status, expected);
  }
  assert.equal((await fetch(endpoint, { method: 'POST', headers: { origin: origins[0], 'content-type': 'application/json', cookie: 'session=ignored' }, body })).status, 401);
  assert.equal(authenticationCalls, 0); assert.equal(rpcCalls, 0, 'invalid origins, headers and credential modes fail before authentication');
  for (const origin of origins) {
    const response = await fetch(endpoint, { method: 'POST', headers: { ...headers, origin, cookie: 'unrelated=ignored' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'wallet_getCallsStatus', params: [approvalRow.call_id] }) });
    assert.equal(response.status, 200); assert.equal(response.headers.get('access-control-allow-origin'), origin); assert.equal((await response.json()).result.status, 200);
  }
  assert.equal(authenticationCalls, 3); assert.equal(rpcCalls, 3, 'every actual cross-origin request still authenticates before provider access');
  assert.equal((await fetch(endpoint, { method: 'POST', headers, body })).status, 403);
  assert.equal((await fetch(endpoint, { method: 'POST', headers: { ...headers, origin: 'https://attacker.test' }, body })).status, 403);
  assert.equal((await fetch(endpoint, { method: 'POST', headers: { ...headers, authorization: 'Bearer invalid' }, body })).status, 401);
  assert.equal((await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify([{ jsonrpc: '2.0', id: 1 }]) })).status, 400);
  assert.equal((await fetch(endpoint, { method: 'GET', headers })).status, 405);
  console.log('Fee-only sponsorship: immutable prepared/signature binding, same-account isolation, cross-realm durable replay, exact canonical receipts, explicit caps and old-day carryover, purchase-value separation, restricted HTTP proxy passed.');
} finally {
  Date.now = originalNow;
  if (http) await new Promise(resolve => http.close(resolve));
  await Promise.allSettled(services.map(service => service.close()));
  if (admin) { try { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); } finally { await admin.end(); } }
  if (container) execFileSync('docker', ['rm', '--force', container], { stdio: 'pipe' });
}
