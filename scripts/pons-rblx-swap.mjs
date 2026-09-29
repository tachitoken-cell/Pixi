import { Contract, Interface, ZeroAddress, getAddress } from 'ethers';

export const PONS_SWAP_CHAIN_ID = 4663n;
export const RBLX_ADDRESS = '0xF0C4BF4C582cb3836e98394b1d4e7B7281101bE8';
export const WETH_ADDRESS = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73';
export const UNISWAP_V3_FACTORY = '0x1f7d7550B1b028f7571E69A784071F0205FD2EfA';
export const UNISWAP_SWAP_ROUTER = '0xCaf681a66D020601342297493863E78C959E5cb2';
export const UNISWAP_QUOTER = '0x33e885eD0Ec9bF04EcfB19341582aADCb4c8A9E7';
export const RBLX_POOL_FEE = 3000;
export const DEV_BUY_WEI = 10n ** 16n;

// Official deployments: github.com/Uniswap/sdks/blob/main/sdks/sdk-core/src/addresses.ts
// ABI: github.com/Uniswap/swap-router-contracts/blob/main/contracts/interfaces/IV3SwapRouter.sol
// SwapRouter02 has no deadline in its swap struct; the enclosing multicall enforces it.
export const swapRouterInterface = new Interface([
  'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns(uint256 amountOut)',
  'function multicall(uint256 deadline,bytes[] data) payable returns(bytes[] results)',
  'function refundETH() payable',
]);

export async function quoteRblxSwap(provider, wallet) {
  if (BigInt(await provider.send('eth_chainId', [])) !== PONS_SWAP_CHAIN_ID) throw Error('RBLX swap requires Robinhood mainnet (4663).');
  const recipient = getAddress(typeof wallet === 'string' ? wallet : await wallet.getAddress());
  if (recipient === ZeroAddress) throw Error('RBLX swap recipient cannot be zero.');
  const block = await provider.getBlock('latest');
  if (!block || Math.abs(Math.floor(Date.now() / 1000) - block.timestamp) > 120) throw Error('RBLX quote requires a recent Robinhood block.');
  const overrides = { blockTag: block.number };
  const contract = (address, abi) => new Contract(address, abi, provider);
  const stateAbi = ['function factory() view returns(address)', 'function WETH9() view returns(address)'];
  const router = contract(UNISWAP_SWAP_ROUTER, stateAbi);
  const quoter = contract(UNISWAP_QUOTER, [...stateAbi,
    'function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)',
  ]);
  const token = contract(RBLX_ADDRESS, ['function name() view returns(string)', 'function symbol() view returns(string)', 'function decimals() view returns(uint8)']);
  const factory = contract(UNISWAP_V3_FACTORY, ['function getPool(address,address,uint24) view returns(address)']);
  const [codes, name, symbol, decimals, routerFactory, routerWeth, quoterFactory, quoterWeth, pool] = await Promise.all([
    Promise.all([RBLX_ADDRESS, WETH_ADDRESS, UNISWAP_V3_FACTORY, UNISWAP_SWAP_ROUTER, UNISWAP_QUOTER].map(address => provider.getCode(address, block.number))),
    token.name(overrides), token.symbol(overrides), token.decimals(overrides),
    router.factory(overrides), router.WETH9(overrides), quoter.factory(overrides), quoter.WETH9(overrides),
    factory.getPool(WETH_ADDRESS, RBLX_ADDRESS, RBLX_POOL_FEE, overrides),
  ]);
  if (codes.some(code => code === '0x')) throw Error('A required RBLX swap contract is missing.');
  if (name !== 'Roblox • Robinhood Token' || symbol !== 'RBLX' || decimals !== 18n) throw Error('Unexpected Roblox token metadata.');
  if (routerFactory !== UNISWAP_V3_FACTORY || quoterFactory !== UNISWAP_V3_FACTORY || routerWeth !== WETH_ADDRESS || quoterWeth !== WETH_ADDRESS) throw Error('Uniswap router/quoter configuration does not match Robinhood.');
  if (pool === ZeroAddress || await provider.getCode(pool, block.number) === '0x') throw Error('The ETH/RBLX pool is unavailable.');
  const poolContract = contract(pool, ['function token0() view returns(address)', 'function token1() view returns(address)', 'function fee() view returns(uint24)', 'function factory() view returns(address)', 'function liquidity() view returns(uint128)']);
  const [token0, token1, fee, poolFactory, liquidity] = await Promise.all(['token0', 'token1', 'fee', 'factory', 'liquidity'].map(method => poolContract[method](overrides)));
  if (token0 !== WETH_ADDRESS || token1 !== RBLX_ADDRESS || fee !== BigInt(RBLX_POOL_FEE) || poolFactory !== UNISWAP_V3_FACTORY || liquidity <= 0n) throw Error('The ETH/RBLX pool has invalid configuration or no active liquidity.');
  const [expectedOut, , , gasEstimate] = await quoter.quoteExactInputSingle.staticCall([WETH_ADDRESS, RBLX_ADDRESS, DEV_BUY_WEI, RBLX_POOL_FEE, 0n], overrides);
  const minOut = expectedOut * 9900n / 10000n;
  if (minOut <= 0n) throw Error('The ETH/RBLX quote returned no usable output.');
  const deadline = BigInt(block.timestamp) + 300n;
  const data = swapRouterInterface.encodeFunctionData('multicall', [deadline, [
    swapRouterInterface.encodeFunctionData('exactInputSingle', [[WETH_ADDRESS, RBLX_ADDRESS, RBLX_POOL_FEE, recipient, DEV_BUY_WEI, minOut, 0n]]),
    swapRouterInterface.encodeFunctionData('refundETH'),
  ]]);
  return { transaction: { to: UNISWAP_SWAP_ROUTER, data, value: DEV_BUY_WEI, chainId: PONS_SWAP_CHAIN_ID }, recipient, pool,
    expectedOut, minOut, amountIn: DEV_BUY_WEI, deadline, blockNumber: block.number, gasEstimate, slippageBps: 100 };
}
