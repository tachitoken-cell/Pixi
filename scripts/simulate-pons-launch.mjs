import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEVM } from '@ethereumjs/evm';
import { createCustomCommon, Mainnet, Hardfork } from '@ethereumjs/common';
import { RPCStateManager, RPCBlockChain } from '@ethereumjs/statemanager';
import { Account, bytesToHex, createAddressFromString, hexToBytes } from '@ethereumjs/util';
import { Interface, JsonRpcProvider, Wallet, ZeroAddress, formatEther, id, keccak256, randomBytes, hexlify, toQuantity } from 'ethers';
import { DEV_BUY_WEI, quoteRblxSwap } from './pons-rblx-swap.mjs';
import { CHAIN_ID, FACTORY, ROUTER, RBLX, RPC_URL, buildLaunchTransaction, compilePonsInterfaces, minimumTokensOut, quoteInitialBuy, readLaunchState } from './pons-launch-chain.mjs';

// Runs deployed contract bytecode against one fixed RPC block. No signer or broadcast method.
const config = JSON.parse(readFileSync(new URL('../contracts/mossvale-pons.json', import.meta.url), 'utf8'));
const rpcUrl = process.env.PONS_RPC_URL || RPC_URL;
const provider = new JsonRpcProvider(rpcUrl);
const rpc = provider.send.bind(provider);
let forkTag;
provider.send = (method, params) => {
  const blockIndex = { eth_getBalance: 1, eth_getCode: 1, eth_getTransactionCount: 1, eth_getStorageAt: 2, eth_call: 1, eth_getProof: 2 }[method];
  assert.ok(['eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_gasPrice', 'eth_maxPriorityFeePerGas'].includes(method) || blockIndex !== undefined, `Forbidden RPC method: ${method}`);
  if (forkTag) {
    if (method === 'eth_blockNumber') return Promise.resolve(forkTag);
    params = [...params];
    if (blockIndex !== undefined) params[blockIndex] = forkTag;
    if (method === 'eth_getBlockByNumber' && params[0] === 'latest') params[0] = forkTag;
  }
  return rpc(method, params);
};

try {
  const creator = Wallet.createRandom().address;
  const caller = createAddressFromString(creator);
  const swap = await quoteRblxSwap(provider, creator);
  forkTag = toQuantity(swap.blockNumber);
  const rpcBlock = await provider.send('eth_getBlockByNumber', [forkTag, false]);
  const state = await readLaunchState(provider, creator, BigInt(config.launchConfigId));
  assert.equal(state.blockNumber, swap.blockNumber);
  const common = createCustomCommon({ chainId: CHAIN_ID }, Mainnet, { hardfork: Hardfork.Cancun });
  const stateManager = new RPCStateManager({ provider: rpcUrl, blockTag: BigInt(swap.blockNumber), common });
  // Public Robinhood RPC prunes old trie proofs; ordinary historical account/slot reads still work.
  stateManager.getAccountFromProvider = async address => {
    const [balance, nonce, code] = await Promise.all([provider.getBalance(address.toString(), swap.blockNumber),
      provider.getTransactionCount(address.toString(), swap.blockNumber), stateManager.getCode(address)]);
    return new Account(BigInt(nonce), balance, undefined, hexToBytes(keccak256(code)));
  };
  // v10.1.3 checkpoints all caches but only commits accounts; CREATE also needs its codeHash updated.
  stateManager.commit = async () => stateManager._caches.commit();
  const putCode = stateManager.putCode.bind(stateManager);
  stateManager.putCode = async (address, code) => {
    await putCode(address, code);
    if (!(await stateManager.getAccount(address))) await stateManager.putAccount(address, new Account());
    await stateManager.modifyAccountFields(address, { codeHash: hexToBytes(keccak256(code)) });
  };
  const evm = await createEVM({ common, stateManager, blockchain: new RPCBlockChain(rpcUrl) });
  const block = { header: {
    number: BigInt(rpcBlock.number), timestamp: BigInt(rpcBlock.timestamp),
    coinbase: createAddressFromString(rpcBlock.miner || ZeroAddress), difficulty: 0n,
    prevRandao: hexToBytes(rpcBlock.mixHash || `0x${'00'.repeat(32)}`),
    gasLimit: BigInt(rpcBlock.gasLimit), baseFeePerGas: BigInt(rpcBlock.baseFeePerGas || 0),
    getBlobGasPrice: () => undefined,
  } };
  const fundedBalance = 10n ** 18n;
  await stateManager.putAccount(caller, new Account(0n, fundedBalance));
  // Check nested rollback before relying on the fork's mutable storage and code caches.
  const slot = hexToBytes(id('simulation-cache-check'));
  await stateManager.checkpoint();
  await stateManager.putStorage(caller, slot, Uint8Array.of(1));
  await stateManager.checkpoint();
  await stateManager.putStorage(caller, slot, Uint8Array.of(2));
  await stateManager.putCode(caller, Uint8Array.of(0));
  assert.equal(bytesToHex((await stateManager.getAccount(caller)).codeHash), keccak256(Uint8Array.of(0)));
  await stateManager.commit();
  await stateManager.revert();
  assert.ok((await stateManager.getStorage(caller, slot)).every(byte => byte === 0));
  assert.equal((await stateManager.getCode(caller)).length, 0);

  const abi = Object.fromEntries(Object.entries(compilePonsInterfaces()).map(([name, value]) => [name, new Interface(value)]));
  const gas = {};
  async function execute(transaction, label, { isStatic = false, allowFailure = false } = {}) {
    evm.journal.cleanJournal();
    stateManager.originalStorageCache.clear();
    evm.journal.addWarmedAddress(caller.bytes);
    evm.journal.addWarmedAddress(createAddressFromString(transaction.to).bytes);
    const result = await evm.runCall({ caller, origin: caller, to: createAddressFromString(transaction.to),
      data: hexToBytes(transaction.data), value: BigInt(transaction.value || 0), gasLimit: 30_000_000n,
      block, isStatic, skipNonceIncrement: isStatic });
    if (!allowFailure) assert.equal(result.execResult.exceptionError, undefined,
      `${label}: ${result.execResult.exceptionError?.error || ''} ${bytesToHex(result.execResult.returnValue)}`);
    if (!isStatic && !allowFailure) gas[label] = result.execResult.executionGasUsed;
    return result;
  }
  async function read(address, contractAbi, method, args = []) {
    const result = await execute({ to: address, data: contractAbi.encodeFunctionData(method, args) }, method, { isStatic: true });
    return contractAbi.decodeFunctionResult(method, bytesToHex(result.execResult.returnValue));
  }
  const rblxBalance = async address => (await read(RBLX, abi.tokenAbi, 'balanceOf', [address]))[0];
  assert.equal(await rblxBalance(creator), 0n);
  await execute(swap.transaction, 'ETH to RBLX');
  const quoteIn = await rblxBalance(creator);
  assert.equal(quoteIn, swap.expectedOut, 'actual swap agrees with live quoter at the fixed block');
  assert.ok(quoteIn >= swap.minOut);
  assert.equal((await stateManager.getAccount(caller)).balance, fundedBalance - DEV_BUY_WEI);
  await execute({ to: RBLX, data: abi.tokenAbi.encodeFunctionData('approve', [ROUTER, quoteIn]) }, 'RBLX approval');
  assert.equal((await read(RBLX, abi.tokenAbi, 'allowance', [creator, ROUTER]))[0], quoteIn);

  const expectedBuy = quoteInitialBuy(quoteIn, state);
  const launch = buildLaunchTransaction({ config, creator, salt: hexlify(randomBytes(32)), state, quoteIn,
    minTokensOut: minimumTokensOut(expectedBuy.tokensOut) });
  const launchArgs = [...abi.routerAbi.decodeFunctionData('launchAndBuy', launch.data)];
  launchArgs[4] = expectedBuy.tokensOut + 1n;
  const rejected = await execute({ ...launch, data: abi.routerAbi.encodeFunctionData('launchAndBuy', launchArgs) }, 'excessive launch minimum', { allowFailure: true });
  assert.ok(rejected.execResult.exceptionError, 'launch must reject insufficient token output');
  assert.equal(await rblxBalance(creator), quoteIn, 'failed launch returns the complete RBLX buy amount');
  assert.equal((await stateManager.getAccount(caller)).balance, fundedBalance - DEV_BUY_WEI, 'failed launch returns the ETH launch fee');
  const result = await execute(launch, 'PONS launch and dev buy');
  const [token, curve, tokensOut] = abi.routerAbi.decodeFunctionResult('launchAndBuy', bytesToHex(result.execResult.returnValue));
  assert.equal(tokensOut, expectedBuy.tokensOut);
  const [registered] = await read(FACTORY, abi.factoryAbi, 'getLaunchedToken', [token]);
  assert.equal(registered.exists, true);
  for (const [field, expected] of Object.entries({ token, curve, deployer: creator, creatorFeeRecipient: creator, pairToken: RBLX,
    poolFee: state.config.poolFee, tickSpacing: state.config.tickSpacing, creatorTaxBps: 0n, buybackEnabled: false })) assert.equal(registered[field], expected, field);
  for (const [method, expected] of Object.entries({ name: config.name, symbol: config.symbol, decimals: 18n,
    totalSupply: state.config.supply, launchFactory: FACTORY, curve })) assert.equal((await read(token, abi.tokenAbi, method))[0], expected, method);
  assert.equal((await read(token, abi.tokenAbi, 'balanceOf', [creator]))[0], tokensOut);
  assert.equal((await read(token, abi.tokenAbi, 'balanceOf', [curve]))[0] + tokensOut, state.config.supply);
  const info = await read(token, abi.tokenAbi, 'getTokenInfo');
  assert.equal(info.tokenDeployer, creator);
  assert.equal(info.tokenLogo, config.logo);
  assert.equal(info.tokenDescription, config.description);
  for (const key of ['twitter', 'telegram', 'discord', 'website', 'farcaster']) assert.equal(info.tokenSocials[key], config.socials[key] ?? '');
  assert.equal((await read(curve, abi.curveAbi, 'pairToken'))[0], RBLX);
  assert.equal((await read(curve, abi.curveAbi, 'feeBps'))[0], state.config.curveFeeBps);
  assert.equal((await read(curve, abi.curveAbi, 'creatorTaxBps'))[0], 0n);
  assert.equal((await read(curve, abi.curveAbi, 'currentSnipeTaxBps', [creator]))[0], 0n);
  assert.equal(await rblxBalance(creator), expectedBuy.refund);
  assert.equal((await read(RBLX, abi.tokenAbi, 'allowance', [creator, ROUTER]))[0], 0n);
  assert.equal((await stateManager.getAccount(caller)).balance, fundedBalance - DEV_BUY_WEI - state.launchFee);

  // The verified factory created this runtime directly. Check there is no proxy delegatecall.
  const runtime = await stateManager.getCode(createAddressFromString(token));
  assert.ok(runtime.length > 1000, 'full token runtime was deployed');
  const metadataLength = runtime.at(-2) * 256 + runtime.at(-1) + 2;
  assert.ok(metadataLength < runtime.length, 'Solidity metadata footer');
  for (let pc = 0; pc < runtime.length - metadataLength; pc++) {
    const opcode = runtime[pc];
    assert.notEqual(opcode, 0xf4, 'token runtime must not delegatecall to an upgradeable implementation');
    if (opcode >= 0x60 && opcode <= 0x7f) pc += opcode - 0x5f;
  }
  assert.equal((await provider.send('eth_getBlockByNumber', [forkTag, false])).hash, rpcBlock.hash, 'fork block remains canonical');
  console.log(JSON.stringify({ simulation: 'passed; no network transactions sent', chainId: CHAIN_ID,
    block: swap.blockNumber, blockHash: rpcBlock.hash, creator, token, curve, name: config.name, symbol: config.symbol,
    pairedWith: 'RBLX', devBuyEth: formatEther(DEV_BUY_WEI), rblxReceived: formatEther(quoteIn),
    devTokensReceived: formatEther(tokensOut), totalSupply: formatEther(state.config.supply),
    launchFeeEth: formatEther(state.launchFee), curveFeeBps: String(state.config.curveFeeBps),
    creatorTaxBps: 0, gas: Object.fromEntries(Object.entries(gas).map(([key, value]) => [key, String(value)])),
    gasNote: 'EVM execution gas only; excludes transaction intrinsic gas, refunds, and Robinhood L1 data fees.',
    checks: 'Swap, exact approval, atomic launch and buy, failed-launch refund, supply, creator, fee recipient, metadata, RBLX pair, zero creator tax, dev-buy tax exemption, full token runtime.' }, null, 2));
} finally {
  provider.destroy();
}
