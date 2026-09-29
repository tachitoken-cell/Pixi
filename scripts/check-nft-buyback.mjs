import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AbiCoder, Interface, JsonRpcProvider, ZeroAddress, id, keccak256, parseUnits, solidityPacked, toBeHex, toQuantity } from 'ethers';
import solc from 'solc';
import { NFT_BUYBACK_ADDRESSES as a, NFT_BUYBACK_POOL, NFT_V4_SWAP_TUPLE, nftBuybackCommands, quoteNftBuyback } from './nft-buyback.mjs';

const coder = AbiCoder.defaultAbiCoder();
const artifact = JSON.parse(readFileSync(new URL('../public/contracts/MossvaleBuyBurn.json', import.meta.url), 'utf8'));
const feeAbi = new Interface(artifact.abi);
const receiver = '0x000000000000000000000000000000000000cafE', operator = '0x000000000000000000000000000000000000bEEF';
for (const token of ['ETH', 'WETH', 'RBLX']) {
  const { commands, inputs } = nftBuybackCommands(token, 100n, 200n, 300n), viaWeth = token !== 'RBLX';
  assert.equal(commands, viaWeth ? '0x0010' : '0x10');
  assert.equal(inputs.length, viaWeth ? 2 : 1);
  if (viaWeth) {
    const [recipient, amount, minimum, path, payer, hopPrices] = coder.decode(['address', 'uint256', 'uint256', 'bytes', 'bool', 'uint256[]'], inputs[0]);
    assert.equal(recipient, '0x0000000000000000000000000000000000000002');
    assert.equal(amount, 100n); assert.equal(minimum, 198n); assert.equal(payer, true); assert.equal(hopPrices.length, 0);
    assert.equal(path, solidityPacked(['address', 'uint24', 'address'], [a.weth, 3000, a.rblx]));
  }
  const [actions, params] = coder.decode(['bytes', 'bytes[]'], inputs.at(-1));
  assert.equal(actions, '0x0b060f', 'settle, swap all credit, and take output');
  const [input, settled, payer] = coder.decode(['address', 'uint256', 'bool'], params[0]);
  assert.equal(input, a.rblx); assert.equal(settled, viaWeth ? 1n << 255n : 100n); assert.equal(payer, !viaWeth);
  const [swap] = coder.decode([NFT_V4_SWAP_TUPLE], params[1]);
  assert.deepEqual(swap[0].toArray(), NFT_BUYBACK_POOL.map(value => typeof value === 'number' ? BigInt(value) : value));
  assert.equal(swap[1], false); assert.equal(swap[2], 0n, 'all settled RBLX credit goes into MOSS');
  assert.equal(swap[3], 300n); assert.equal(swap[4], 0n); assert.equal(swap[5], '0x');
  const [output, minimum] = coder.decode(['address', 'uint256'], params[2]);
  assert.equal(output, a.moss); assert.equal(minimum, 300n, 'MOSS is taken by the calling fee receiver');
}
for (const args of [['MOSS', 1n, 1n, 1n], ['ETH', 0n, 1n, 1n], ['WETH', 1n, 1n, 0n], ['RBLX', 2n ** 128n, 1n, 1n]])
  assert.throws(() => nftBuybackCommands(...args), /Invalid/);
await assert.rejects(quoteNftBuyback({ send: async () => '0x1' }, { receiver, amountIn: 1n }), /Robinhood/);

// Deterministic boundary checks use the actual pinned MOSS/receiver code; no network is required by default.
const mossRuntime = readFileSync(new URL('./fixtures/moss-token-runtime.hex', import.meta.url), 'utf8').trim();
const tokenAbi = new Interface(['function balanceOf(address) view returns(uint256)', 'function totalSupply() view returns(uint256)',
  'function allowance(address,address) view returns(uint256)']);
let balance = 100n, wrongCode = false, wrongOperator = false, reorg = false, stale = false;
const mockBlock = () => ({ number: '0x10', hash: id('quote-block'), timestamp: toQuantity(Math.floor(Date.now() / 1000) - (stale ? 1000 : 0)) });
const fake = { async send(method, args) {
  if (method === 'eth_chainId') return '0x1237';
  if (method === 'eth_getBlockByNumber') return { ...mockBlock(), ...(reorg && args[0] !== 'latest' ? { hash: id('reorg') } : {}) };
  if (method === 'eth_getCode') return wrongCode ? '0x' : args[0].toLowerCase() === receiver.toLowerCase() ? artifact.deployedBytecode : mossRuntime;
  if (method === 'eth_call') {
    assert.equal(args[1].requireCanonical, true);
    const iface = args[0].to.toLowerCase() === receiver.toLowerCase() ? feeAbi : tokenAbi, parsed = iface.parseTransaction(args[0]);
    const values = { owner: wrongOperator ? ZeroAddress : operator, paymentToken: a.moss, swapRouter: a.router, wrappedNative: a.weth, permit2: a.permit2, balanceOf: balance };
    return iface.encodeFunctionResult(parsed.name, [values[parsed.name]]);
  }
  throw Error(`Unexpected quote RPC ${method}`);
} };
const terms = { receiver, token: 'MOSS', amountIn: 100n, operator };
const burn = await quoteNftBuyback(fake, terms);
assert.equal(feeAbi.parseTransaction(burn.transaction).name, 'burnMoss');
assert.equal(feeAbi.decodeFunctionData('burnMoss', burn.transaction.data)[0], 100n);
assert.equal(burn.transaction.to, receiver); assert.equal(burn.expectedMossOut, 100n);
balance = 99n; await assert.rejects(quoteNftBuyback(fake, terms), /insufficient/); balance = 100n;
wrongCode = true; await assert.rejects(quoteNftBuyback(fake, terms), /deployment/); wrongCode = false;
wrongOperator = true; await assert.rejects(quoteNftBuyback(fake, terms), /operator/); wrongOperator = false;
reorg = true; await assert.rejects(quoteNftBuyback(fake, terms), /block changed/); reorg = false;
stale = true; await assert.rejects(quoteNftBuyback(fake, terms), /recent/); stale = false;
console.log('Buyback encoding and quote boundaries passed: fixed V3/V4 pools, full intermediate settlement, exact inputs, minimum MOSS output, operator/config/code checks, direct MOSS burn and canonical quote block.');

if (process.argv.includes('--live')) {
  // Only the probe and proposed receiver are injected. Existing router, Permit2, tokens, pools and hook execute live bytecode/state.
  const source = `pragma solidity 0.8.36;
interface Token { function balanceOf(address) external view returns(uint256); function totalSupply() external view returns(uint256);
 function allowance(address,address) external view returns(uint256); function transfer(address,uint256) external returns(bool); function approve(address,uint256) external returns(bool); function deposit() external payable; }
interface Permit { function allowance(address,address,address) external view returns(uint160,uint48,uint48); }
interface Receiver { function totalMossBurned() external view returns(uint256); }
interface V3 { struct Params { address tokenIn;address tokenOut;uint24 fee;address recipient;uint256 amountIn;uint256 amountOutMinimum;uint160 sqrtPriceLimitX96; } function exactInputSingle(Params calldata) external payable returns(uint256); }
contract Probe {
 struct Result { uint256 beforeSupply;uint256 afterSupply;uint256 burned;uint256 beforeInput;uint256 afterInput;uint256 tokenAllowance;uint256 permitAllowance; }
 function run(address receiver,address input,bytes calldata data) external payable returns(Result memory r) {
  address moss=${a.moss}; address weth=${a.weth}; address rblx=${a.rblx};
  if(msg.value>0){Token(weth).deposit{value:msg.value}();if(input==weth){require(Token(weth).transfer(receiver,msg.value));}
   else{address router=0xCaf681a66D020601342297493863E78C959E5cb2;require(input==rblx);require(Token(weth).approve(router,msg.value));V3(router).exactInputSingle(V3.Params(weth,rblx,3000,receiver,msg.value,1,0));}}
  r.beforeSupply=Token(moss).totalSupply();r.beforeInput=input==address(0)?receiver.balance:Token(input).balanceOf(receiver);
  (bool ok,bytes memory output)=receiver.call(data);if(!ok)assembly{revert(add(output,32),mload(output))}
  r.afterSupply=Token(moss).totalSupply();r.burned=Receiver(receiver).totalMossBurned();r.afterInput=input==address(0)?receiver.balance:Token(input).balanceOf(receiver);
  address payment=input==address(0)?weth:input;r.tokenAllowance=Token(payment).allowance(receiver,${a.permit2});
  (r.permitAllowance,,)=Permit(${a.permit2}).allowance(receiver,payment,${a.router});
 }
}`;
  const compiled = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: { 'Probe.sol': { content: source } }, settings: {
    optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun', outputSelection: { '*': { '*': ['abi', 'evm.deployedBytecode.object'] } },
  } })));
  assert.equal(compiled.errors?.filter(error => error.severity === 'error').length || 0, 0, JSON.stringify(compiled.errors));
  const probe = compiled.contracts['Probe.sol'].Probe, probeAbi = new Interface(probe.abi);
  const provider = new JsonRpcProvider(process.env.NFT_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com');
  const stateDiff = Object.fromEntries([operator, a.router, a.weth, a.permit2].map((value, i) => [toBeHex([0, 2, 3, 4][i], 32), toBeHex(BigInt(value), 32)]));
  const nativeAmount = parseUnits('0.0001', 18);
  const overrides = { [operator]: { code: `0x${probe.evm.deployedBytecode.object}`, balance: toQuantity(10n ** 18n) },
    [receiver]: { code: artifact.deployedBytecode, balance: toQuantity(nativeAmount), stateDiff } };
  try {
    for (const token of ['ETH', 'WETH', 'RBLX', 'MOSS']) {
      const amountIn = token === 'RBLX' ? parseUnits('0.001', 18) : nativeAmount;
      const state = { ...overrides };
      if (token === 'MOSS') state[a.moss] = { stateDiff: {
        [keccak256(coder.encode(['address', 'uint256'], [receiver, 0]))]: toBeHex(amountIn, 32),
      } };
      const quoteProvider = { async send(method, args) {
        if (method === 'eth_getCode' && args[0].toLowerCase() === receiver.toLowerCase()) return artifact.deployedBytecode;
        if (method === 'eth_getBalance' && args[0].toLowerCase() === receiver.toLowerCase()) return toQuantity(nativeAmount);
        if (method === 'eth_call') {
          if ([a.weth, a.rblx].some(address => address.toLowerCase() === args[0].to.toLowerCase())
            && args[0].data === tokenAbi.encodeFunctionData('balanceOf', [receiver])) return tokenAbi.encodeFunctionResult('balanceOf', [amountIn]);
          return provider.send(method, [...args, state]);
        }
        return provider.send(method, args);
      } };
      const quote = await quoteNftBuyback(quoteProvider, { receiver, token, amountIn, operator });
      const liveCall = data => provider.send('eth_call', [{ from: operator, to: operator,
        data: probeAbi.encodeFunctionData('run', [receiver, quote.tokenIn, data]), gas: '0x989680',
        value: ['WETH', 'RBLX'].includes(token) ? toQuantity(nativeAmount) : '0x0' }, toQuantity(quote.blockNumber), state]);
      const [result] = probeAbi.decodeFunctionResult('run', await liveCall(quote.transaction.data));
      assert.equal(result.burned, quote.expectedMossOut, 'actual deployed route agrees with executable quote');
      assert.equal(result.beforeSupply - result.afterSupply, result.burned, 'actual MOSS totalSupply decreases exactly');
      assert.equal(result.beforeInput - result.afterInput, amountIn, 'only the exact fee amount is spent');
      assert.equal(result.tokenAllowance, 0n); assert.equal(result.permitAllowance, 0n, 'both allowances reset on real Permit2');
      if (token === 'ETH') {
        const original = feeAbi.decodeFunctionData('buyAndBurn', quote.transaction.data).toArray();
        const excessive = [...original]; excessive[2] = quote.expectedMossOut + 1n;
        await assert.rejects(liveCall(feeAbi.encodeFunctionData('buyAndBurn', excessive)), /revert/i, 'receiver rejects output below the authorized minimum');
        const expired = [...original]; expired[3] = quote.deadline - 301n;
        await assert.rejects(liveCall(feeAbi.encodeFunctionData('buyAndBurn', expired)), /revert/i, 'expired buyback rejected');
      }
      console.log(`Live read-only ${token} fee proof at block ${quote.blockNumber}: spent ${amountIn}, bought/burned ${result.burned} MOSS base units; exact supply and allowance checks passed. No transaction sent.`);
    }
  } finally { provider.destroy(); }
}
