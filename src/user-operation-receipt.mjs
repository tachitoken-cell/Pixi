import { Interface, isAddress, ZeroAddress } from 'ethers';

const entryPointInterface = new Interface([
  'event BeforeExecution()',
  'event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)',
]);
// Reviewed Alchemy 7702 account's EntryPoint v0.7 on Robinhood Chain.
const ENTRY_POINT = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
const beforeExecution = entryPointInterface.getEvent('BeforeExecution').topicHash;
const userOperation = entryPointInterface.getEvent('UserOperationEvent').topicHash;
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const hash = value => typeof value === 'string' && /^0x[\da-f]{64}$/i.test(value);
const quantity = value => typeof value === 'string' && /^0x(?:0|[1-9a-f][\da-f]*)$/i.test(value);
const fail = () => { throw Error('Sponsored receipt does not match the authorized player operation.'); };

/** The caller still verifies canonical settlement, receipt finality and the exact game event.
 * The lookup is server-owned durable authorization, never proof supplied by the browser.
 * EntryPoint emits BeforeExecution after bundle validation and UserOperationEvent after each
 * execution, so only this range can contain the authorized operation's game events. */
export async function receiptOperationLogs(receipt, { wallet, contract, sponsoredOperation }) {
  if (!receipt || receipt.status !== '0x1' || !Array.isArray(receipt.logs)) fail();
  if (same(receipt.from, wallet) && same(receipt.to, contract)) return receipt.logs;
  if (typeof sponsoredOperation !== 'function') fail();
  const proof = await sponsoredOperation({ transactionHash: receipt.transactionHash, wallet, contract });
  if (!hash(proof?.userOpHash) || !same(proof.entryPoint, ENTRY_POINT)
    || !same(proof.sender, wallet) || !isAddress(proof.paymaster) || same(proof.paymaster, ZeroAddress)
    || !same(receipt.to, proof.entryPoint)) fail();

  let previousIndex = -1n, start = -1, begins = 0, operationCount = 0, selected;
  for (let index = 0; index < receipt.logs.length; index++) {
    const log = receipt.logs[index];
    // Raw chain log order and inclusion metadata are required on the sponsored path.
    if (!log || log.removed || !quantity(log.logIndex) || BigInt(log.logIndex) <= previousIndex
      || !same(log.transactionHash, receipt.transactionHash) || !same(log.blockHash, receipt.blockHash)
      || log.blockNumber !== receipt.blockNumber) fail();
    previousIndex = BigInt(log.logIndex);
    if (!same(log.address, proof.entryPoint)) continue;
    const topic = log.topics?.[0];
    if (!same(topic, beforeExecution) && !same(topic, userOperation)) continue;
    let event;
    try { event = entryPointInterface.parseLog(log); } catch { fail(); }
    if (!event) fail();
    if (event.name === 'BeforeExecution') {
      if (++begins !== 1 || operationCount) fail();
      start = index;
      continue;
    }
    if (start < 0) fail();
    operationCount++;
    if (same(event.args.userOpHash, proof.userOpHash)) {
      if (selected || !same(event.args.sender, wallet) || !same(event.args.paymaster, proof.paymaster)
        || event.args.success !== true) fail();
      selected = receipt.logs.slice(start + 1, index);
    }
    start = index;
  }
  if (begins !== 1 || !selected) fail();
  return selected;
}
