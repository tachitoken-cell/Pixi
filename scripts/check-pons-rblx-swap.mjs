import assert from 'node:assert/strict';
import { JsonRpcProvider, formatEther, toQuantity } from 'ethers';
import { DEV_BUY_WEI, quoteRblxSwap, swapRouterInterface } from './pons-rblx-swap.mjs';

// Read-only live contract execution; the fake sender's ETH exists only inside eth_call.
const provider = new JsonRpcProvider(process.env.PONS_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com');
try {
  const sender = '0x000000000000000000000000000000000000dEaD';
  await assert.rejects(quoteRblxSwap({ send: async () => '0x1' }, sender), /requires Robinhood/);
  const quote = await quoteRblxSwap(provider, sender);
  assert.equal(quote.transaction.value, DEV_BUY_WEI);
  assert.equal(quote.minOut, quote.expectedOut * 99n / 100n);
  const batch = swapRouterInterface.decodeFunctionData('multicall', quote.transaction.data);
  assert.equal(batch.deadline, quote.deadline);
  const swap = swapRouterInterface.decodeFunctionData('exactInputSingle', batch.data[0])[0];
  assert.equal(swap.recipient, sender);
  assert.equal(swap.amountIn, DEV_BUY_WEI);
  assert.equal(swap.amountOutMinimum, quote.minOut);
  assert.equal(swapRouterInterface.parseTransaction({ data: batch.data[1] }).name, 'refundETH');
  const call = data => provider.send('eth_call', [{ from: sender, to: quote.transaction.to, data, value: toQuantity(DEV_BUY_WEI) },
    toQuantity(quote.blockNumber), { [sender]: { balance: toQuantity(10n ** 18n) } }]);
  const output = await call(quote.transaction.data);
  const [results] = swapRouterInterface.decodeFunctionResult('multicall', output);
  const [received] = swapRouterInterface.decodeFunctionResult('exactInputSingle', results[0]);
  assert.equal(received, quote.expectedOut, 'real router execution agrees with quoter at the same block');
  const expired = swapRouterInterface.encodeFunctionData('multicall', [quote.deadline - 301n, batch.data]);
  await assert.rejects(call(expired), /revert/i, 'expired swap is rejected');
  const excessiveMinimum = [...swap]; excessiveMinimum[5] = quote.expectedOut + 1n;
  const tooLittle = swapRouterInterface.encodeFunctionData('multicall', [quote.deadline,
    [swapRouterInterface.encodeFunctionData('exactInputSingle', [excessiveMinimum]), batch.data[1]]]);
  await assert.rejects(call(tooLittle), /revert/i, 'minimum output is enforced by the live router');
  console.log(`RBLX swap checked at block ${quote.blockNumber}: 0.01 ETH -> ${formatEther(received)} RBLX; deadline and minimum-output rejection passed. No transaction sent.`);
} finally {
  provider.destroy();
}
