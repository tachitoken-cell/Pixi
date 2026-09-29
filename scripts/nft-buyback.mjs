import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { AbiCoder, Interface, JsonRpcProvider, ZeroAddress, getAddress, keccak256, parseUnits, solidityPacked, toQuantity } from 'ethers';
import { MOSS_TOKEN_RUNTIME_HASH } from '../src/auction-chain.mjs';

// Official deployment registry + observed code hashes. A deployment change requires review, never automatic repinning.
// https://developers.uniswap.org/deployments.json
// https://github.com/Uniswap/universal-router/blob/main/contracts/base/Dispatcher.sol
// https://github.com/Uniswap/v4-periphery/blob/main/src/interfaces/IV4Router.sol
// Quoter ABI: https://sourcify.dev/server/v2/contract/4663/0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94?fields=abi,sources
export const NFT_BUYBACK_DEPLOYMENTS = JSON.parse(readFileSync(new URL('./fixtures/nft-buyback-deployments.json', import.meta.url), 'utf8'));
export const NFT_BUYBACK_ADDRESSES = Object.fromEntries(Object.entries(NFT_BUYBACK_DEPLOYMENTS.contracts).map(([name, value]) => [name, getAddress(value.address)]));
const addresses = NFT_BUYBACK_ADDRESSES;
const receiverArtifact = () => JSON.parse(readFileSync(new URL('../public/contracts/MossvaleBuyBurn.json', import.meta.url), 'utf8'));
const coder = AbiCoder.defaultAbiCoder();
const stateAbi = new Interface(['function owner() view returns(address)', 'function paymentToken() view returns(address)',
  'function swapRouter() view returns(address)', 'function permit2() view returns(address)', 'function wrappedNative() view returns(address)',
  'function poolManager() view returns(address)', 'function factory() view returns(address)', 'function WETH9() view returns(address)',
  'function getPool(address,address,uint24) view returns(address)', 'function implementation() view returns(address)',
  'function balanceOf(address) view returns(uint256)', 'function decimals() view returns(uint8)']);
const v3Abi = new Interface(['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256 amountOut,uint160,uint32,uint256)']);
const v4Abi = new Interface(['function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData)) returns(uint256 amountOut,uint256 gasEstimate)']);
export const NFT_BUYBACK_POOL = [addresses.moss, addresses.rblx, 0, 200, addresses.hook];
// This deployed router uses the current per-hop-price fields. check-nft-buyback --live executes the actual deployed ABI.
export const NFT_V4_SWAP_TUPLE = 'tuple(tuple(address,address,uint24,int24,address),bool,uint128,uint128,uint256,bytes)';
const tokens = { ETH: ZeroAddress, WETH: addresses.weth, RBLX: addresses.rblx, MOSS: addresses.moss };
const equal = (a, b) => a.toLowerCase() === b.toLowerCase();

export function nftBuybackCommands(token, amountIn, rblxExpected, minMossOut) {
  if (!['ETH', 'WETH', 'RBLX'].includes(token) || [amountIn, rblxExpected, minMossOut].some(value => typeof value !== 'bigint' || value <= 0n || value >= 2n ** 128n))
    throw Error('Invalid fixed-route buyback terms.');
  const viaWeth = token !== 'RBLX', inputs = [];
  if (viaWeth) inputs.push(coder.encode(['address', 'uint256', 'uint256', 'bytes', 'bool', 'uint256[]'], [
    '0x0000000000000000000000000000000000000002', amountIn, rblxExpected * 99n / 100n,
    solidityPacked(['address', 'uint24', 'address'], [addresses.weth, 3000, addresses.rblx]), true, [],
  ]));
  // Settle the full V3 output first, then spend that V4 credit. No intermediate RBLX remains trapped in the router.
  const settle = coder.encode(['address', 'uint256', 'bool'], [addresses.rblx, viaWeth ? 1n << 255n : amountIn, !viaWeth]);
  const swap = coder.encode([NFT_V4_SWAP_TUPLE], [[NFT_BUYBACK_POOL, false, 0, minMossOut, 0, '0x']]);
  const take = coder.encode(['address', 'uint256'], [addresses.moss, minMossOut]);
  inputs.push(coder.encode(['bytes', 'bytes[]'], ['0x0b060f', [settle, swap, take]]));
  return { commands: viaWeth ? '0x0010' : '0x10', inputs };
}

export async function quoteNftBuyback(provider, { receiver, token = 'ETH', amountIn, operator }) {
  receiver = getAddress(receiver);
  if (receiver === ZeroAddress || !Object.hasOwn(tokens, token)) throw Error('Use a deployed receiver and ETH, WETH, RBLX, or MOSS.');
  if (typeof amountIn !== 'bigint' || amountIn <= 0n || amountIn >= 2n ** 128n) throw Error('Amount must be a positive uint128 in token base units.');
  if (BigInt(await provider.send('eth_chainId', [])) !== 4663n) throw Error('NFT buybacks require Robinhood mainnet (4663).');
  const block = await provider.send('eth_getBlockByNumber', ['latest', false]);
  if (!block?.hash || !/^0x[\da-f]{64}$/i.test(block.hash) || !/^0x[\da-f]+$/i.test(block.number || '')
    || !/^0x[\da-f]+$/i.test(block.timestamp || '') || Math.abs(Number(BigInt(block.timestamp)) - Math.floor(Date.now() / 1000)) > 120)
    throw Error('A recent canonical block is required for a buyback quote.');
  const tag = { blockHash: block.hash, requireCanonical: true };
  const call = async (to, iface, name, args = []) => iface.decodeFunctionResult(name,
    await provider.send('eth_call', [{ to, data: iface.encodeFunctionData(name, args) }, tag]));
  const read = async (to, name, args = []) => (await call(to, stateAbi, name, args))[0];
  const artifact = receiverArtifact();
  const entries = token === 'MOSS' ? [['moss', NFT_BUYBACK_DEPLOYMENTS.contracts.moss]] : Object.entries(NFT_BUYBACK_DEPLOYMENTS.contracts);
  await Promise.all([...entries, ['receiver', { address: receiver, codeHash: artifact.runtimeCodeHash }]].map(async ([name, info]) => {
    const code = await provider.send('eth_getCode', [info.address, tag]);
    if (keccak256(code) !== info.codeHash) throw Error(`The ${name} deployment differs from the reviewed buyback contracts.`);
  }));
  if (NFT_BUYBACK_DEPLOYMENTS.contracts.moss.codeHash !== MOSS_TOKEN_RUNTIME_HASH) throw Error('MOSS fingerprint mismatch.');
  const [owner, moss, router, wrapped, permit2] = await Promise.all(['owner', 'paymentToken', 'swapRouter', 'wrappedNative', 'permit2'].map(name => read(receiver, name)));
  if (owner === ZeroAddress || operator && !equal(owner, getAddress(operator))) throw Error('The requested operator does not own this buyback receiver.');
  if (![equal(moss, addresses.moss), equal(router, addresses.router), equal(wrapped, addresses.weth), equal(permit2, addresses.permit2)].every(Boolean))
    throw Error('Receiver configuration must use the verified MOSS, UniversalRouter, WETH and Permit2.');
  const tokenIn = tokens[token];
  const balance = token === 'ETH' ? BigInt(await provider.send('eth_getBalance', [receiver, tag])) : await read(tokenIn, 'balanceOf', [receiver]);
  if (balance < amountIn) throw Error('The receiver has insufficient collected fees.');
  const base = { action: token === 'MOSS' ? 'burn' : 'buy-and-burn', receiver, operator: owner, token, tokenIn, amountIn,
    chainId: 4663, blockNumber: Number(BigInt(block.number)), blockHash: block.hash };
  let result;
  const abi = new Interface(artifact.abi);
  if (token === 'MOSS') {
    result = { ...base, expectedMossOut: amountIn, minMossOut: amountIn, slippageBps: 0,
      transaction: { from: owner, to: receiver, data: abi.encodeFunctionData('burnMoss', [amountIn]), value: '0x0', chainId: toQuantity(4663) } };
  } else {
    const [manager, quoterManager, factory, weth, pool, implementation, rblxDecimals, wethDecimals] = await Promise.all([
      read(addresses.router, 'poolManager'), read(addresses.v4Quoter, 'poolManager'), read(addresses.v3Quoter, 'factory'),
      read(addresses.v3Quoter, 'WETH9'), read(addresses.v3Factory, 'getPool', [addresses.weth, addresses.rblx, 3000]),
      read(addresses.rblxBeacon, 'implementation'), read(addresses.rblx, 'decimals'), read(addresses.weth, 'decimals'),
    ]);
    if (!equal(manager, addresses.manager) || !equal(quoterManager, addresses.manager) || !equal(factory, addresses.v3Factory)
      || !equal(weth, addresses.weth) || !equal(pool, addresses.v3Pool) || !equal(implementation, addresses.rblxImplementation)
      || rblxDecimals !== 18n || wethDecimals !== 18n) throw Error('Swap pool, quoter, or RBLX implementation configuration changed.');
    const viaWeth = token !== 'RBLX';
    const rblxExpected = viaWeth ? (await call(addresses.v3Quoter, v3Abi, 'quoteExactInputSingle', [[addresses.weth, addresses.rblx, amountIn, 3000, 0]]))[0] : amountIn;
    if (rblxExpected <= 0n || rblxExpected >= 2n ** 128n) throw Error('Unusable RBLX intermediate quote.');
    const [expectedMossOut] = await call(addresses.v4Quoter, v4Abi, 'quoteExactInputSingle', [[NFT_BUYBACK_POOL, false, rblxExpected, '0x']]);
    const minMossOut = expectedMossOut * 99n / 100n;
    if (minMossOut <= 0n || expectedMossOut >= 2n ** 128n) throw Error('Unusable MOSS output quote.');
    const { commands, inputs } = nftBuybackCommands(token, amountIn, rblxExpected, minMossOut);
    const deadline = BigInt(block.timestamp) + 300n;
    result = { ...base, router, rblxExpected, expectedMossOut, minMossOut, deadline, slippageBps: 100, commands, inputs,
      quoteSource: 'Executable Uniswap V3 and V4 quoter calls at the same canonical block; this is a market quote, not a manipulation-resistant price oracle.',
      transaction: { from: owner, to: receiver, data: abi.encodeFunctionData('buyAndBurn', [tokenIn, amountIn, minMossOut, deadline, commands, inputs]), value: '0x0', chainId: toQuantity(4663) } };
  }
  const canonical = await provider.send('eth_getBlockByNumber', [block.number, false]);
  if (!canonical?.hash || !equal(canonical.hash, block.hash)) throw Error('The quote block changed; obtain a new quote.');
  return result;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const { values } = parseArgs({ options: { receiver: { type: 'string' }, token: { type: 'string', default: 'ETH' }, amount: { type: 'string' },
    operator: { type: 'string' }, rpc: { type: 'string', default: process.env.NFT_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com' } } });
  if (!values.receiver || !values.amount) throw Error('Usage: node scripts/nft-buyback.mjs --receiver 0x... --token ETH|WETH|RBLX|MOSS --amount 0.01 [--operator 0x...]');
  const provider = new JsonRpcProvider(values.rpc);
  try {
    const quote = await quoteNftBuyback(provider, { receiver: values.receiver, token: values.token, amountIn: parseUnits(values.amount, 18), operator: values.operator });
    console.log(JSON.stringify({ ...quote, broadcast: false }, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2));
  } finally { provider.destroy(); }
}
