import { readFileSync, writeFileSync, mkdirSync, renameSync, openSync, closeSync, unlinkSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { Contract, Interface, JsonRpcProvider, Transaction, Wallet, formatEther, formatUnits, getAddress, hexlify, randomBytes, keccak256 } from 'ethers';
import { CHAIN_ID, FACTORY, ROUTER, RBLX, RPC_URL, compilePonsInterfaces, readLaunchState, quoteInitialBuy, minimumTokensOut, buildLaunchTransaction } from './pons-launch-chain.mjs';
import { DEV_BUY_WEI, quoteRblxSwap } from './pons-rblx-swap.mjs';

const { values: options } = parseArgs({ options: {
  broadcast: { type: 'boolean', default: false }, status: { type: 'boolean', default: false },
  wallet: { type: 'string' }, 'key-file': { type: 'string' }, rpc: { type: 'string', default: process.env.PONS_RPC_URL || RPC_URL },
  config: { type: 'string', default: new URL('../contracts/mossvale-pons.json', import.meta.url).pathname },
  journal: { type: 'string', default: new URL('../.data/pons-launch.json', import.meta.url).pathname },
  help: { type: 'boolean', default: false },
} });
const stringify = value => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item, 2) + '\n';
const ensure = (condition, message) => { if (!condition) throw Error(message); };
const MAX_GAS = { swap: 1_000_000n, approve: 100_000n, launch: 12_000_000n };
const journalPath = resolve(options.journal);
let lockPath, provider;

function save(journal) {
  const temporary = journalPath + '.tmp';
  writeFileSync(temporary, stringify(journal), { mode: 0o600 });
  renameSync(temporary, journalPath);
}

function lock() {
  mkdirSync(dirname(journalPath), { recursive: true, mode: 0o700 });
  const candidate = journalPath + '.lock';
  ensure(!existsSync(candidate), `Launch journal is locked. Check its process before removing the lock: ${candidate}`);
  const fd = openSync(candidate, 'wx', 0o600);
  lockPath = candidate;
  writeFileSync(fd, String(process.pid));
  closeSync(fd);
}

async function readWallet() {
  let key;
  if (options['key-file']) {
    const file = resolve(options['key-file']), stat = statSync(file);
    ensure(stat.isFile() && stat.size < 256 && (stat.mode & 0o077) === 0, 'Key file must be a small local file with mode 600.');
    key = readFileSync(file, 'utf8').trim();
  } else {
    ensure(process.stdin.isTTY, 'Run in a local terminal for hidden key entry, or use --key-file with a mode-600 file.');
    process.stderr.write('Private key (hidden, kept in memory): ');
    const muted = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
    const input = createInterface({ input: process.stdin, output: muted, terminal: true });
    try { key = (await input.question('')).trim(); }
    finally { input.close(); process.stderr.write('\n'); }
  }
  try { return new Wallet(key.startsWith('0x') ? key : `0x${key}`, provider); }
  catch { throw Error('Invalid private key. Its value has not been logged.'); }
  finally { key = undefined; }
}

export async function sendStep(journal, signer, name, transaction, rpc = provider, persist = save) {
  let step = journal.steps[name];
  if (!step) {
    const [latestNonce, pendingNonce, gasEstimate] = await Promise.all([
      rpc.getTransactionCount(signer.address, 'latest'), rpc.getTransactionCount(signer.address, 'pending'),
      rpc.estimateGas({ ...transaction, from: signer.address }),
    ]);
    ensure(latestNonce === pendingNonce, 'Wallet has pending transactions; wait for them before continuing.');
    const gasLimit = gasEstimate * 120n / 100n;
    ensure(gasLimit <= MAX_GAS[name], `${name} gas exceeds the prepared limit; inspect before changing the limit.`);
    const request = { ...transaction, chainId: CHAIN_ID, nonce: pendingNonce, gasLimit,
      type: 2, maxFeePerGas: BigInt(journal.maxFeePerGas), maxPriorityFeePerGas: BigInt(journal.maxPriorityFeePerGas) };
    ensure(await rpc.getBalance(signer.address) >= (request.value || 0n) + gasLimit * request.maxFeePerGas, 'Insufficient ETH including maximum transaction gas.');
    const raw = await signer.signTransaction(request);
    step = journal.steps[name] = { hash: keccak256(raw), raw, nonce: pendingNonce, status: 'signed' };
    persist(journal); // Persist before submission; a lost RPC response must not cause a second spend.
  }
  const signed = Transaction.from(step.raw);
  ensure(signed.hash === step.hash && signed.from === signer.address && signed.chainId === BigInt(CHAIN_ID)
    && signed.to === getAddress(transaction.to) && signed.data === transaction.data && signed.value === (transaction.value || 0n)
    && signed.nonce === step.nonce, 'Signed journal transaction does not match this launch step.');
  let receipt = await rpc.getTransactionReceipt(step.hash);
  if (!receipt) {
    const pending = await rpc.getTransaction(step.hash);
    if (!pending) {
      ensure(await rpc.getTransactionCount(signer.address, 'latest') <= step.nonce, 'Nonce was consumed by another transaction. Inspect the journal; do not start a second launch.');
      await rpc.broadcastTransaction(step.raw); // Resume submits the identical signed transaction only.
    }
    console.log(`${name}: ${step.hash}`);
  }
  receipt = await rpc.waitForTransaction(step.hash, 2, 60_000);
  ensure(receipt, 'Transaction is still pending. Rerun the same command and journal to resume.');
  ensure((await rpc.getBlock(receipt.blockNumber))?.hash === receipt.blockHash, 'Transaction block is no longer canonical. Resume after the RPC catches up.');
  step.status = receipt.status === 1 ? 'confirmed' : 'reverted';
  step.blockNumber = receipt.blockNumber;
  step.gasUsed = receipt.gasUsed.toString();
  persist(journal);
  ensure(receipt.status === 1, `${name} reverted. The journal preserves prior transactions; inspect it before retrying.`);
  return receipt;
}

async function verifyLaunch(journal, receipt, tokenAbi) {
  const router = new Interface(compilePonsInterfaces().routerAbi);
  const factory = new Interface(compilePonsInterfaces().factoryAbi);
  const events = receipt.logs.filter(log => log.address.toLowerCase() === FACTORY.toLowerCase())
    .map(log => { try { return factory.parseLog(log); } catch { return null; } });
  const event = events.find(log => log?.name === 'TokenLaunched');
  ensure(event, 'Successful receipt has no PONS TokenLaunched event; inspect it before continuing.');
  const tokenAddress = getAddress(event.args.token), curveAddress = getAddress(event.args.curve);
  const token = new Contract(tokenAddress, tokenAbi, provider);
  const readAt = { blockTag: receipt.blockNumber };
  const { factoryAbi, curveAbi } = compilePonsInterfaces();
  const registry = new Contract(FACTORY, factoryAbi, provider);
  const curve = new Contract(curveAddress, curveAbi, provider);
  const [name, symbol, balance, supply, code, info, launch, pair] = await Promise.all([
    token.name(readAt), token.symbol(readAt), token.balanceOf(journal.wallet, readAt), token.totalSupply(readAt), provider.getCode(tokenAddress, receipt.blockNumber),
    token.getTokenInfo(readAt), registry.getLaunchedToken(tokenAddress, readAt), curve.pairToken(readAt),
  ]);
  ensure(name === journal.config.name && symbol === journal.config.symbol && code !== '0x', 'Launched token metadata/code differs from the prepared launch.');
  const minimum = BigInt(journal.minTokensOut);
  ensure(balance >= minimum, 'Dev token balance is below the signed minimum.');
  ensure(supply === BigInt(journal.supply), 'Unexpected token supply.');
  ensure(info.tokenDeployer === journal.wallet && launch.deployer === journal.wallet && event.args.deployer === journal.wallet,
    'Token creator differs from the deployment wallet.');
  ensure(launch.exists && launch.creatorFeeRecipient === journal.wallet && launch.pairToken === RBLX && pair === RBLX
    && launch.curve === curveAddress && launch.creatorTaxBps === 0n && launch.buybackEnabled === false, 'Unexpected PONS token configuration.');
  const buys = receipt.logs.filter(log => log.address.toLowerCase() === curveAddress.toLowerCase())
    .map(log => { try { return curve.interface.parseLog(log); } catch { return null; } });
  const buy = buys.find(log => log?.name === 'CurveBuy');
  ensure(buy && buy.args.recipient === journal.wallet && buy.args.quoteIn === BigInt(journal.quoteIn)
    && buy.args.tokensOut >= minimum && buy.args.tokensOut === balance, 'Dev buy event does not match the intended spend and receipt.');
  // Decode the signed launch again to bind this receipt to this creator, pair and buy.
  const signedLaunch = router.parseTransaction({ data: journal.launchTransaction.data });
  ensure(getAddress(signedLaunch.args.recipient) === journal.wallet && getAddress(signedLaunch.args.pairToken) === RBLX, 'Unexpected launch recipient or pairing asset.');
  journal.result = { token: tokenAddress, curve: curveAddress, wallet: journal.wallet, pair: RBLX,
    tokensBought: balance.toString(), totalSupply: supply.toString(), transactionHash: receipt.hash, blockNumber: receipt.blockNumber };
  save(journal);
  console.log(stringify(journal.result));
}

async function main() {
  if (options.help) {
    console.log('Preview: node scripts/deploy-pons.mjs --wallet 0xPUBLIC_ADDRESS\nLaunch:  node scripts/deploy-pons.mjs --broadcast [--key-file /local/key-file]\nStatus:  node scripts/deploy-pons.mjs --status\nThe buy spends 0.01 ETH on RBLX. The PONS launch fee and gas are additional.');
    return;
  }
  provider = new JsonRpcProvider(options.rpc, undefined, { batchMaxCount: 1, cacheTimeout: -1 });
  ensure((await provider.getNetwork()).chainId === BigInt(CHAIN_ID), 'Expected Robinhood Chain mainnet 4663.');
  if (options.status) {
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
    const status = {};
    for (const [name, step] of Object.entries(journal.steps)) {
      const receipt = await provider.getTransactionReceipt(step.hash);
      status[name] = { hash: step.hash, status: receipt ? receipt.status === 1 ? 'confirmed' : 'reverted' : 'pending or not submitted' };
    }
    console.log(stringify({ wallet: journal.wallet, steps: status, result: journal.result || null }));
    return;
  }
  const config = JSON.parse(readFileSync(options.config, 'utf8'));
  const configId = BigInt(config.launchConfigId);
  const { tokenAbi } = compilePonsInterfaces();
  let signer, journal;
  if (options.broadcast) {
    lock();
    signer = await readWallet();
    if (options.wallet) ensure(getAddress(options.wallet) === signer.address, 'Private key does not match --wallet.');
    if (existsSync(journalPath)) {
      journal = JSON.parse(readFileSync(journalPath, 'utf8'));
      ensure(journal.wallet === signer.address && journal.chainId === CHAIN_ID, 'Journal belongs to a different wallet or chain.');
      ensure(stringify(journal.config) === stringify(config), 'Config changed since this launch began. Restore it before resuming.');
      if (journal.result) { console.log(stringify(journal.result)); return; }
    }
  }
  const creator = signer?.address || (options.wallet ? getAddress(options.wallet) : '0x0000000000000000000000000000000000000001');
  const state = journal ? null : await readLaunchState(provider, creator, configId);
  if (!options.broadcast) {
    const swap = await quoteRblxSwap(provider, creator);
    const quote = quoteInitialBuy(swap.minOut, state);
    const salt = hexlify(randomBytes(32));
    buildLaunchTransaction({ config, creator, salt, state, quoteIn: swap.minOut, minTokensOut: minimumTokensOut(quote.tokensOut) });
    console.log(stringify({ mode: 'preview; no transactions sent', wallet: options.wallet || 'not supplied',
      name: config.name, symbol: config.symbol, pair: RBLX, devBuyETH: formatEther(DEV_BUY_WEI),
      launchFeeETH: formatEther(state.launchFee), gas: 'additional', expectedRBLX: formatUnits(swap.expectedOut, 18),
      minimumRBLX: formatUnits(swap.minOut, 18), estimatedMossvaleAtMinimumSwap: formatUnits(quote.tokensOut, 18),
      supply: state.config.supply, creatorTaxBps: config.creatorTaxBps, buybackEnabled: config.buybackEnabled }));
    return;
  }
  const stock = new Contract(RBLX, tokenAbi, provider);
  if (!journal) {
    const [fees, balance, latestNonce, pendingNonce] = await Promise.all([
      provider.getFeeData(), provider.getBalance(creator),
      provider.getTransactionCount(creator, 'latest'), provider.getTransactionCount(creator, 'pending'),
    ]);
    ensure(latestNonce === pendingNonce, 'Wallet has pending transactions.');
    ensure(fees.maxFeePerGas && fees.maxPriorityFeePerGas !== null, 'RPC did not provide EIP-1559 gas fees.');
    const maximumBudget = DEV_BUY_WEI + state.launchFee + Object.values(MAX_GAS).reduce((a, b) => a + b) * fees.maxFeePerGas;
    ensure(balance >= maximumBudget, `Fund at least ${formatEther(maximumBudget)} ETH for the buy, launch fee and conservative gas reserve.`);
    const swap = await quoteRblxSwap(provider, creator);
    // Validate launch metadata/encoding before spending any ETH on the stock swap.
    const salt = hexlify(randomBytes(32));
    buildLaunchTransaction({ config, creator, salt, state, quoteIn: swap.minOut, minTokensOut: minimumTokensOut(quoteInitialBuy(swap.minOut, state).tokensOut) });
    journal = { version: 1, chainId: CHAIN_ID, wallet: creator, config, salt, createdAt: new Date().toISOString(),
      maxFeePerGas: fees.maxFeePerGas.toString(), maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString(),
      expectedEconomics: state.expectedEconomics, launchFee: state.launchFee.toString(), minimumRblx: swap.minOut.toString(),
      swapTransaction: swap.transaction, steps: {} };
    save(journal);
    console.log(`${config.name} (${config.symbol}), RBLX pair; dev buy 0.01 ETH; launch fee ${formatEther(state.launchFee)} ETH; gas additional.`);
  }
  if (!journal.steps.swap) {
    const ready = await readLaunchState(provider, creator, configId);
    ensure(ready.expectedEconomics === journal.expectedEconomics && ready.launchFee === BigInt(journal.launchFee),
      'PONS economics or launch fee changed before the swap. Inspect the saved launch settings before spending.');
    const freshSwap = await quoteRblxSwap(provider, creator);
    journal.swapTransaction = freshSwap.transaction;
    journal.minimumRblx = freshSwap.minOut.toString();
    save(journal);
  }
  const asRequest = transaction => ({ ...transaction, chainId: CHAIN_ID, value: BigInt(transaction.value || 0) });
  const swapReceipt = await sendStep(journal, signer, 'swap', asRequest(journal.swapTransaction));
  if (!journal.quoteIn) {
    const transfers = new Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
    const bought = swapReceipt.logs.filter(log => log.address.toLowerCase() === RBLX.toLowerCase()).reduce((sum, log) => {
      let parsed; try { parsed = transfers.parseLog(log); } catch { return sum; }
      return sum + (parsed?.args.to === creator ? parsed.args.value : 0n) - (parsed?.args.from === creator ? parsed.args.value : 0n);
    }, 0n);
    ensure(bought >= BigInt(journal.minimumRblx), 'Confirmed RBLX receipt is below the swap minimum.');
    journal.quoteIn = bought.toString();
    save(journal);
  }
  if (!journal.steps.launch) ensure(await stock.balanceOf(creator) >= BigInt(journal.quoteIn), 'The RBLX purchased for this launch is no longer in the wallet.');
  const approval = { to: RBLX, data: stock.interface.encodeFunctionData('approve', [ROUTER, BigInt(journal.quoteIn)]), value: 0n };
  await sendStep(journal, signer, 'approve', approval);
  if (!journal.steps.launch) {
    ensure(await stock.allowance(creator, ROUTER) === BigInt(journal.quoteIn), 'Router allowance differs from this dev buy.');
    const freshState = await readLaunchState(provider, creator, configId);
    ensure(freshState.expectedEconomics === journal.expectedEconomics && freshState.launchFee === BigInt(journal.launchFee),
      'PONS economics or launch fee changed after preparation. The purchased RBLX remains in your wallet; inspect before proceeding.');
    const quote = quoteInitialBuy(BigInt(journal.quoteIn), freshState);
    ensure(quote.refund === 0n, 'Dev buy would finish the curve; inspect this launch before proceeding.');
    journal.minTokensOut = minimumTokensOut(quote.tokensOut).toString();
    journal.supply = freshState.config.supply.toString();
    journal.launchTransaction = buildLaunchTransaction({ config, creator, salt: journal.salt, state: freshState,
      quoteIn: BigInt(journal.quoteIn), minTokensOut: BigInt(journal.minTokensOut) });
    save(journal);
    await provider.call({ ...asRequest(journal.launchTransaction), from: creator });
  }
  const receipt = await sendStep(journal, signer, 'launch', asRequest(journal.launchTransaction));
  await verifyLaunch(journal, receipt, tokenAbi);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await main(); }
  catch (error) {
    // Do not dump ethers request objects, signed bytes, RPC credentials or key input.
    const message = String(error.reason || error.shortMessage || error.message || 'Launch failed');
    console.error(message.replace(/https?:\/\/[^\s]+/g, '[RPC URL]').replace(/0x[0-9a-fA-F]{64,}/g, '[hex data]'));
    process.exitCode = 1;
  } finally {
    if (lockPath) unlinkSync(lockPath);
    provider?.destroy();
  }
}
