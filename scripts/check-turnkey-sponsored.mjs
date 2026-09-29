import assert from 'node:assert/strict';
import { Interface, Wallet, ZeroAddress, getBytes, hashAuthorization, hashMessage } from 'ethers';
import { getUserOperationHash } from 'viem/account-abstraction';
import { createSponsoredWallet } from '../src/turnkey-sponsored.ts';
import { SPONSORED_DELEGATE, SPONSORED_ENTRY_POINT, SPONSORED_NATIVE_TOKEN, signedIdentity, validateSponsoredPrepared, validateSponsoredSigned } from '../src/turnkey-sponsored-validation.mjs';

const player = new Wallet(`0x${'11'.repeat(32)}`), other = new Wallet(`0x${'22'.repeat(32)}`);
const target = `0x${'33'.repeat(20)}`, paymaster = `0x${'44'.repeat(20)}`, transactionHash = `0x${'55'.repeat(32)}`;
const abi = new Interface(['function execute(address target,uint256 value,bytes data)', 'function executeBatch((address target,uint256 value,bytes data)[] calls)']);
const transaction = { from: player.address, to: target, value: '17', data: '0x1234', chainId: 4663 };
function prepare({ authorization = false, changes = {} } = {}) {
  const data = { sender: player.address, nonce: '0x0', callData: abi.encodeFunctionData('executeBatch', [[[target, 17n, '0x1234']]]),
    callGasLimit: '0x5208', verificationGasLimit: '0x10000', preVerificationGas: '0x10000', maxFeePerGas: '0x3b9aca00', maxPriorityFeePerGas: '0x0',
    paymaster, paymasterData: '0x1234', paymasterVerificationGasLimit: '0x10000', paymasterPostOpGasLimit: '0x0', ...changes };
  const numeric = { ...data };
  for (const key of ['nonce', 'callGasLimit', 'verificationGasLimit', 'preVerificationGas', 'maxFeePerGas', 'maxPriorityFeePerGas', 'paymasterVerificationGasLimit', 'paymasterPostOpGasLimit']) numeric[key] = BigInt(numeric[key]);
  const userOpHash = getUserOperationHash({ chainId: 4663, entryPointAddress: SPONSORED_ENTRY_POINT, entryPointVersion: '0.7', userOperation: numeric });
  const op = { type: 'user-operation-v070', data, chainId: '0x1237', signatureRequest: { type: 'personal_sign', data: { raw: userOpHash }, rawPayload: hashMessage(getBytes(userOpHash)) }, feePayment: { sponsored: true, tokenAddress: SPONSORED_NATIVE_TOKEN, maxAmount: `0x${(217608000000000n).toString(16)}` } };
  const auth = { type: 'authorization', data: { address: SPONSORED_DELEGATE, nonce: '0x0' }, chainId: '0x1237',
    signatureRequest: { type: 'eip7702Auth', rawPayload: hashAuthorization({ chainId: 4663, address: SPONSORED_DELEGATE, nonce: 0 }) } };
  return authorization ? { type: 'array', data: [auth, op] } : op;
}
const original = prepare(), info = validateSponsoredPrepared(original, transaction);
assert.equal(info.sender, player.address); assert(info.costWei > 0n); assert.equal(info.callId.length, 130);
assert.equal(info.fingerprint, signedIdentity(original));
assert.equal(info.costWei, 217608000000000n, 'the ledger reserves signed gas limits, not a zero player-charge placeholder');
for (const amount of ['0x0', '0x00', '0x-1', '1', `0x${(2n ** 256n).toString(16)}`, `0x${(info.costWei - 1n).toString(16)}`, `0x${(info.costWei + 1n).toString(16)}`]) {
  const changed = structuredClone(original); changed.feePayment.maxAmount = amount;
  assert.throws(() => validateSponsoredPrepared(changed, transaction), /does not match/);
}
for (const change of [
  p => { p.chainId = '0x1'; }, p => { p.data.sender = other.address; }, p => { p.feePayment.sponsored = false; },
  p => { delete p.feePayment.sponsored; }, p => { p.feePayment.tokenAddress = target; }, p => { p.feePayment.tokenAddress = ZeroAddress; },
  p => { p.feePayment.maxAmount = '0x1'; }, p => { p.data.paymaster = ZeroAddress; }, p => { p.data.factory = target; },
  p => { p.signatureRequest.data.raw = `0x${'ff'.repeat(32)}`; }, p => { p.signatureRequest.rawPayload = `0x${'ff'.repeat(32)}`; },
  p => { p.signatureRequest = { type: 'eth_signTypedData_v4', data: {} }; }, p => { p.data.maxPriorityFeePerGas = '0xffffffff'; },
  p => { p.data.callData = abi.encodeFunctionData('execute', [target, 18n, '0x1234']); },
  p => { p.data.callData = abi.encodeFunctionData('execute', [target, 17n, '0x1235']); },
  p => { p.data.callData = abi.encodeFunctionData('executeBatch', [[[target, 17n, '0x1234'], [other.address, 0n, '0x']]]); },
  p => { p.data.callData += '00'; },
]) { const tampered = structuredClone(original); change(tampered); assert.throws(() => validateSponsoredPrepared(tampered, transaction), /does not match/); }
assert.throws(() => validateSponsoredPrepared(original, transaction, { maxOperationWei: 1n }), /does not match/);
assert.throws(() => validateSponsoredPrepared(original, transaction, { maxFeePerGasWei: 1n }), /does not match/);
for (const change of [p => { p.data[0].data.address = other.address; }, p => { p.data[0].chainId = '0x0'; }, p => { p.data[0].data.nonce = '0x1'; }]) {
  const prepared = prepare({ authorization: true }); change(prepared); assert.throws(() => validateSponsoredPrepared(prepared, transaction), /does not match/);
}

let active = true, signatures = 0, prepares = 0, sends = 0, checks = 0, prepared = prepare({ authorization: true }), saved;
let expectedTransaction = transaction;
const expectedCalls = () => [...(expectedTransaction.approval ? [expectedTransaction.approval] : []), expectedTransaction].map(call => ({ to: call.to, data: call.data, value: `0x${BigInt(call.value).toString(16)}` }));
let loseResponse = false, responseStatus = 200, beforeSignature, receiptLogs = [], expiredProof;
const httpClient = { async signRawPayload(params) {
  beforeSignature?.(); signatures++;
  assert.equal(params.organizationId, 'player-org'); assert.equal(params.signWith, player.address); assert.equal(params.hashFunction, 'HASH_FUNCTION_NO_OP');
  const digest = params.encoding === 'PAYLOAD_ENCODING_EIP7702_AUTHORIZATION' ? hashAuthorization(JSON.parse(params.payload)) : params.payload;
  const signature = player.signingKey.sign(digest);
  return { r: signature.r.slice(2), s: signature.s.slice(2), v: String(signature.yParity), activity: { status: 'ACTIVITY_STATUS_COMPLETED' } };
} };
const rpc = async ({ method, params }) => {
  if (method === 'wallet_prepareCalls') {
    prepares++; assert.equal(params[0].from, player.address); assert.equal(params[0].chainId, '0x1237');
    assert.deepEqual(params[0].calls, expectedCalls());
    assert.equal(params[0].capabilities, undefined); return structuredClone(prepared);
  }
  const info = validateSponsoredPrepared(prepared, expectedTransaction);
  if (method === 'wallet_sendPreparedCalls') {
    sends++; assert(saved, 'signed operation is persisted before dispatch'); assert.deepEqual(JSON.parse(JSON.stringify(params[0])), JSON.parse(JSON.stringify(saved.signed)));
    validateSponsoredSigned(params[0], info, expectedTransaction);
    if (expiredProof) throw Object.assign(Error('Expired sponsor authorization'), { code: 5731, data: expiredProof });
    if (loseResponse) throw Error('Lost submission response');
    return { id: info.callId, preparedCallIds: [info.callId], details: { type: 'user-operation', data: { hash: info.userOpHash, calls: expectedCalls() } } };
  }
  assert.equal(method, 'wallet_getCallsStatus'); checks++; assert.deepEqual(params, [info.callId]);
  return { id: info.callId, version: '2.0.0', chainId: '0x1237', status: responseStatus, atomic: true,
    receipts: [{ transactionHash, blockHash: `0x${'66'.repeat(32)}`, blockNumber: '0x1', gasUsed: '0x1', logs: receiptLogs, status: '0x1' }] };
};
const options = { httpClient, organizationId: 'player-org', address: player.address, rpc, guard: async () => { if (!active) throw Error('Disconnected'); } };
let wallet = await createSponsoredWallet(options);
assert.equal(await wallet.send(transaction, record => { saved = record; }), transactionHash);
assert.equal(signatures, 2, 'initial delegation and exact UserOp each require a player signature');
assert.equal(prepares, 1); assert.equal(sends, 1); assert.equal(checks, 1);
const signed = structuredClone(saved.signed), signedInfo = validateSponsoredPrepared(saved.prepared, transaction);
signed.data[1].signature.data = await other.signMessage(getBytes(signedInfo.userOpHash));
assert.throws(() => validateSponsoredSigned(signed, signedInfo, transaction), /does not match/);
signed.data[1].signature.data = saved.signed.data[1].signature.data; signed.data[1].data.nonce = '0x1';
assert.throws(() => validateSponsoredSigned(signed, signedInfo, transaction), /does not match/);
loseResponse = true;
await assert.rejects(wallet.send(transaction, record => { saved = record; }), /Lost submission response/);
const persisted = JSON.parse(JSON.stringify(saved)), signedBeforeRetry = signatures, preparedBeforeRetry = prepares;
loseResponse = false; wallet = await createSponsoredWallet(options);
assert.equal(await wallet.resume(transaction, persisted), transactionHash);
assert.equal(signatures, signedBeforeRetry); assert.equal(prepares, preparedBeforeRetry, 'recovery only repeats the same signed operation');
expiredProof = { reason: 'expired-unused', id: signedInfo.callId, userOpHash: signedInfo.userOpHash, sender: signedInfo.sender, fingerprint: signedInfo.fingerprint };
await assert.rejects(wallet.send(transaction, record => { saved = record; }), error => error.confirmedSponsoredFailure === true,
  'exact broker expiry proof survives SDK wrapping on the initial submission');
await assert.rejects(wallet.resume(transaction, persisted), error => error.confirmedSponsoredFailure === true);
for (const change of [{ reason: 'expired' }, { id: `${signedInfo.callId}00` }, { userOpHash: `0x${'ee'.repeat(32)}` },
  { sender: other.address }, { fingerprint: `0x${'ff'.repeat(32)}` }]) {
  const valid = expiredProof; expiredProof = { ...valid, ...change };
  await assert.rejects(wallet.resume(transaction, persisted), error => !error.confirmedSponsoredFailure,
    'mismatched or incomplete expiry evidence cannot clear a pending signed operation');
  expiredProof = valid;
}
expiredProof = { reason: 'expired-unused' };
await assert.rejects(wallet.resume(transaction, persisted), error => !error.confirmedSponsoredFailure);
expiredProof = undefined;
responseStatus = 500;
await assert.rejects(wallet.resume(transaction, persisted), /did not complete successfully/, 'successful outer receipt cannot disguise failed UserOp');
const eventAbi = new Interface(['event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)']);
const failureEvent = eventAbi.encodeEventLog(eventAbi.getEvent('UserOperationEvent'), [signedInfo.userOpHash, player.address, paymaster, 0n, false, 1n, 1n]);
receiptLogs = [{ address: SPONSORED_ENTRY_POINT, ...failureEvent }];
await assert.rejects(wallet.resume(transaction, persisted), error => error.confirmedSponsoredFailure === true);
receiptLogs = [];
responseStatus = 200;
// One actual SDK UserOp covers the approval and purchase in exactly that order.
expectedTransaction = { ...transaction, value: '0', approval: { to: other.address, data: '0xabcd', value: '0' } };
const batchCalls = [[other.address, 0n, '0xabcd'], [target, 0n, '0x1234']];
prepared = prepare({ changes: { callData: abi.encodeFunctionData('executeBatch', [batchCalls]) } });
const batchPrepares = prepares, batchSignatures = signatures, batchSends = sends;
loseResponse = true;
await assert.rejects(wallet.send(expectedTransaction, record => { saved = record; }), /Lost submission response/);
assert.equal(prepares, batchPrepares + 1); assert.equal(signatures, batchSignatures + 1); assert.equal(sends, batchSends + 1);
const persistedBatch = JSON.parse(JSON.stringify(saved)); loseResponse = false;
assert.equal(await wallet.resume(expectedTransaction, persistedBatch), transactionHash);
assert.equal(prepares, batchPrepares + 1); assert.equal(signatures, batchSignatures + 1, 'batch recovery repeats the exact signed UserOp with no new approval');
for (const calls of [[...batchCalls].reverse(), [[other.address, 0n, '0xabce'], batchCalls[1]], [batchCalls[1]]]) {
  prepared = prepare({ changes: { callData: abi.encodeFunctionData('executeBatch', [calls]) } });
  await assert.rejects(wallet.send(expectedTransaction, () => assert.fail('Invalid operation must not be journaled')), /does not match/);
}
assert.equal(signatures, batchSignatures + 1, 'removed, reordered or changed approval fails before Turnkey signing');
expectedTransaction = transaction; prepared = prepare({ authorization: true });
beforeSignature = () => { active = false; };
const sendsBeforeCancel = sends;
await assert.rejects(wallet.send(transaction, () => {}), /Disconnected/);
assert.equal(sends, sendsBeforeCancel, 'logout during a signing response prevents submission');
active = true; beforeSignature = undefined;
prepared = prepare(); prepared.signatureRequest.data.raw = `0x${'77'.repeat(32)}`;
const signaturesBefore = signatures;
await assert.rejects(wallet.send(transaction, () => {}), /does not match/);
assert.equal(signatures, signaturesBefore, 'unrelated provider signing requests never reach Turnkey');
console.log('Sponsored wallet checks passed: actual SDK encoding, exact calls/value/chain/delegate, fee-only policy, signature/hash binding, pre-submit journal, identical recovery, exact expired-unused proof, UserOp failure and logout guards.');
