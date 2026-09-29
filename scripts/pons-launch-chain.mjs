import { readFileSync } from 'node:fs';
import { Contract, Interface, MaxUint256, ZeroAddress, ZeroHash, getAddress, isHexString, keccak256 } from 'ethers';
import solc from 'solc';

export const CHAIN_ID = 4663;
export const RPC_URL = 'https://rpc.mainnet.chain.robinhood.com';
export const FACTORY = '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e';
export const ROUTER = '0xe33E9E479dF8802cb0866d5d05258bEc4cF62948';
export const RBLX = '0xF0C4BF4C582cb3836e98394b1d4e7B7281101bE8';
const BPS = 10_000n;
const RUNTIME_HASHES = [
  '0x89a27da6f703e0a7cdd4f233e7cb57604ff75b164530962d3ff7cf8483a67d84',
  '0xed9065184519eaa24a22c2556403d5d8bbb230ff94dbc5c414cf5028e20e52e7',
]; // Matched live code to exact-match Sourcify sources at block 61291327.

let compiled;
export function compilePonsInterfaces() {
  if (compiled) return compiled;
  const source = readFileSync(new URL('../contracts/IPonsLaunch.sol', import.meta.url), 'utf8');
  const output = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: { 'IPonsLaunch.sol': { content: source } }, settings: { outputSelection: { '*': { '*': ['abi'] } } } })));
  const errors = output.errors?.filter(error => error.severity === 'error');
  if (errors?.length) throw new Error(errors.map(error => error.formattedMessage).join('\n'));
  const contracts = output.contracts['IPonsLaunch.sol'];
  compiled = { factoryAbi: contracts.IPonsLaunchFactory.abi, routerAbi: contracts.IPonsLaunchAndBuy.abi, curveAbi: contracts.IPonsLaunchCurve.abi, tokenAbi: contracts.IPonsLaunchToken.abi };
  return compiled;
}

function uint(value, label, positive = false) {
  if (typeof value !== 'bigint' || value < (positive ? 1n : 0n) || value > MaxUint256) throw new Error(`Invalid ${label}`);
  return value;
}
function address(value) {
  const result = getAddress(value);
  if (result === ZeroAddress) throw new Error('Use a nonzero creator address');
  return result;
}
function text(value, label, required = false) {
  if (typeof value !== 'string' || (required && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error(`Invalid ${label}`);
  return value;
}

export function buildTokenParams(config, creator, expectedEconomics, salt) {
  if (!isHexString(expectedEconomics, 32) || expectedEconomics === ZeroHash) throw new Error('A nonzero economics pin is required');
  if (!isHexString(salt, 32) || salt === ZeroHash) throw new Error('A fresh nonzero 32-byte salt is required');
  if (BigInt(config.creatorTaxBps ?? 0) !== 0n || (config.buybackEnabled ?? false) !== false) throw new Error('This launch uses zero creator tax and no buybacks');
  return {
    name: text(config.name, 'name', true), symbol: text(config.symbol, 'symbol', true),
    logo: text(config.logo ?? '', 'logo'), description: text(config.description ?? '', 'description'),
    socials: Object.fromEntries(['twitter', 'telegram', 'discord', 'website', 'farcaster'].map(key => [key, text(config.socials?.[key] ?? '', key)])),
    creatorFeeRecipient: address(creator), creatorTaxBps: 0, buybackEnabled: false, expectedEconomics, salt,
  };
}

export async function readLaunchState(provider, creator, configId = 0n) {
  creator = address(creator);
  uint(configId, 'launch config ID');
  if ((await provider.getNetwork()).chainId !== BigInt(CHAIN_ID)) throw new Error('Use Robinhood Chain 4663');
  const blockNumber = await provider.getBlockNumber();
  const at = { blockTag: blockNumber };
  const { factoryAbi, routerAbi, tokenAbi } = compilePonsInterfaces();
  const factory = new Contract(FACTORY, factoryAbi, provider);
  const router = new Contract(ROUTER, routerAbi, provider);
  const token = new Contract(RBLX, tokenAbi, provider);
  const [config, pairEconomics, launchFee, expectedEconomics, allowed, approved, forwarder, upstream, decimals, factoryCode, routerCode] = await Promise.all([
    factory.getLaunchConfig(configId, at), factory.pairTokenEconomics(RBLX, at), factory.launchFee(at),
    factory.previewLaunchEconomics(configId, RBLX, at), factory.canLaunch(creator, at), factory.approvedPairTokens(RBLX, at),
    factory.launchForwarder(at), router.factory(at), token.decimals(at), provider.getCode(FACTORY, blockNumber), provider.getCode(ROUTER, blockNumber),
  ]);
  if (!allowed || !approved || !config.enabled) throw new Error('PONS does not allow this creator, RBLX pair, or launch config');
  if (getAddress(forwarder) !== ROUTER || getAddress(upstream) !== FACTORY || [factoryCode, routerCode].some((code, index) => keccak256(code) !== RUNTIME_HASHES[index])) throw new Error('PONS deployment differs from the verified contracts');
  if (decimals !== 18n || pairEconomics.decimals !== decimals || pairEconomics.phantomQuote <= 0n || pairEconomics.graduationThreshold <= 0n) throw new Error('Invalid RBLX economics');
  return {
    blockNumber, creator, configId, launchFee, expectedEconomics,
    config: { supply: config.supply, curveFeeBps: config.curveFeeBps, poolFee: config.poolFee, tickSpacing: config.tickSpacing },
    pairEconomics: { phantomQuote: pairEconomics.phantomQuote, graduationThreshold: pairEconomics.graduationThreshold, decimals },
  };
}

// Exact initial-curve integer order. The official router exempts the dev-buy recipient from the opening tax.
export function quoteInitialBuy(quoteIn, state, creatorTaxBps = 0n) {
  uint(quoteIn, 'dev buy', true);
  const supply = uint(state.config.supply, 'supply', true);
  const feeBps = uint(state.config.curveFeeBps, 'curve fee');
  uint(creatorTaxBps, 'creator tax');
  const phantom = uint(state.pairEconomics.phantomQuote, 'phantom reserve', true);
  const threshold = uint(state.pairEconomics.graduationThreshold, 'graduation threshold', true);
  if (feeBps > 1000n || creatorTaxBps > 1000n || phantom + threshold > MaxUint256 || quoteIn * feeBps > MaxUint256 || quoteIn * creatorTaxBps > MaxUint256) throw new Error('Unsupported launch economics');
  const net = quoteIn - quoteIn * feeBps / BPS - quoteIn * creatorTaxBps / BPS;
  const reserved = supply * phantom / (phantom + threshold);
  if (reserved === 0n || reserved >= supply || phantom + net > MaxUint256) throw new Error('Invalid curve allocation');
  let tokensOut = net * supply / (phantom + net);
  let spent = quoteIn;
  const sellable = supply - reserved;
  if (tokensOut > sellable) {
    tokensOut = sellable;
    const netRequired = sellable * phantom / (supply - sellable) + 1n;
    const feeScale = BPS - feeBps - creatorTaxBps;
    const gross = (netRequired * BPS + feeScale - 1n) / feeScale;
    spent = gross < quoteIn ? gross : quoteIn;
  }
  if (tokensOut === 0n) throw new Error('Dev buy rounds to zero tokens');
  return { tokensOut, spent, refund: quoteIn - spent };
}

export function minimumTokensOut(tokensOut, slippageBps = 100n) {
  uint(tokensOut, 'quoted tokens', true);
  uint(slippageBps, 'slippage');
  if (slippageBps > 100n) throw new Error('Dev buy slippage may not exceed 1%');
  return tokensOut - tokensOut * slippageBps / BPS;
}

export function buildLaunchTransaction({ config, creator, salt, state, quoteIn, minTokensOut }) {
  creator = address(creator);
  if (creator !== getAddress(state.creator) || BigInt(config.launchConfigId ?? 0) !== state.configId) throw new Error('Launch identity or config changed after the quote');
  const params = buildTokenParams(config, creator, state.expectedEconomics, salt);
  const quote = quoteInitialBuy(quoteIn, state);
  uint(minTokensOut, 'minimum token output', true);
  if (minTokensOut < minimumTokensOut(quote.tokensOut) || minTokensOut > quote.tokensOut) throw new Error('Minimum token output differs from the protected quote');
  const data = new Interface(compilePonsInterfaces().routerAbi).encodeFunctionData('launchAndBuy', [params, state.configId, RBLX, quoteIn, minTokensOut, creator, []]);
  return { to: ROUTER, data, value: uint(state.launchFee, 'launch fee'), chainId: CHAIN_ID };
}
