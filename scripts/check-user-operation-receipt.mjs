import assert from 'node:assert/strict';
import { Interface, Wallet, ZeroAddress, id, toQuantity } from 'ethers';
import { receiptOperationLogs } from '../src/user-operation-receipt.mjs';

const entryPoint = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
const [wallet, contract, paymaster, bundler, other] = Array.from({ length: 5 }, () => Wallet.createRandom().address);
const abi = new Interface(['event BeforeExecution()',
  'event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)']);
const userOpHash = id('authorized-operation'), transactionHash = id('bundle'), blockHash = id('canonical-block');
const proof = { entryPoint, userOpHash, sender: wallet, paymaster };
const before = { address: entryPoint, ...abi.encodeEventLog(abi.getEvent('BeforeExecution'), []) };
const operation = (opHash = userOpHash, sender = wallet, success = true, payer = paymaster) => ({ address: entryPoint,
  ...abi.encodeEventLog(abi.getEvent('UserOperationEvent'), [opHash, sender, payer, 1, success, 1000, 100]) });
const gameEvent = { address: contract, topics: [id('game-event')], data: '0x' };
const receipt = logs => ({ from: bundler, to: entryPoint, status: '0x1', transactionHash, blockHash, blockNumber: '0x64',
  logs: logs.map((log, index) => ({ ...log, logIndex: toQuantity(index), transactionHash, blockHash, blockNumber: '0x64' })) });
let lookupCalls = 0;
const options = { wallet, contract, sponsoredOperation: async query => {
  lookupCalls++; assert.deepEqual(query, { transactionHash, wallet, contract }); return proof;
} };
const direct = { ...receipt([gameEvent]), from: wallet, to: contract };
assert.deepEqual(await receiptOperationLogs(direct, options), direct.logs);
assert.equal(lookupCalls, 0, 'direct wallet receipts do not depend on the sponsorship service');
const included = receipt([gameEvent, before, gameEvent, operation()]);
assert.deepEqual(await receiptOperationLogs(included, options), [included.logs[2]], 'validation logs are excluded');
const bundle = receipt([before, gameEvent, operation(id('previous-operation')), gameEvent, operation(), gameEvent, operation(id('following-operation'))]);
assert.deepEqual(await receiptOperationLogs(bundle, options), [bundle.logs[3]], 'only the authorized operation execution range is returned');
const outside = receipt([before, gameEvent, operation(id('other-operation')), operation()]);
assert.deepEqual(await receiptOperationLogs(outside, options), [], 'a prior operation cannot supply the required game event');

const reject = (value, changes = {}) => assert.rejects(receiptOperationLogs(value, { ...options, ...changes }), /receipt/);
await reject(included, { sponsoredOperation: undefined });
await reject(included, { sponsoredOperation: async () => null });
for (const change of [{ userOpHash: id('not-authorized') }, { sender: other }, { entryPoint: other }, { paymaster: other },
  { paymaster: ZeroAddress }, { userOpHash: 'invalid' }]) {
  await reject(included, { sponsoredOperation: async () => ({ ...proof, ...change }) });
}
for (const logs of [[before, gameEvent, operation(userOpHash, wallet, false)], [before, gameEvent, operation(userOpHash, other)],
  [before, gameEvent, operation(userOpHash, wallet, true, other)], [gameEvent, operation()], [operation(), before, gameEvent],
  [before, before, gameEvent, operation()], [before, gameEvent, operation(), operation()],
  [{ ...before, address: other }, gameEvent, operation()], [before, gameEvent, { ...operation(), address: other }],
  [before, gameEvent, { ...operation(), data: '0x' }]]) await reject(receipt(logs));
for (const change of [{ status: '0x0' }, { to: other }, { logs: null }]) await reject({ ...included, ...change });
for (const change of [{ removed: true }, { logIndex: '0x0' }, { logIndex: undefined }, { transactionHash: id('other-bundle') },
  { blockHash: id('orphaned') }, { blockNumber: '0x65' }]) {
  const changed = structuredClone(included); Object.assign(changed.logs[2], change); await reject(changed);
}
const reversed = structuredClone(included); reversed.logs.reverse(); await reject(reversed);
console.log('UserOperation receipts: durable authorization, pinned EntryPoint, successful player operation, exact event range and malformed/foreign bundle rejection passed.');
