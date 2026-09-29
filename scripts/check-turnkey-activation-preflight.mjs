import assert from 'node:assert/strict';
import { Interface, getBytes, hashAuthorization, hashMessage } from 'ethers';
import { getUserOperationHash } from 'viem/account-abstraction';
import { turnkeyActivationPreflight } from './turnkey-activation-preflight.mjs';
import { SPONSORED_DELEGATE, SPONSORED_ENTRY_POINT, SPONSORED_NATIVE_TOKEN } from '../src/turnkey-sponsored-validation.mjs';

const env = { ALCHEMY_WALLET_API_KEY: 'private-preflight-fixture-key', ALCHEMY_GAS_POLICY_ID: '11111111-2222-4333-8444-555555555555',
  TURNKEY_SPONSOR_MAX_OPERATION_WEI: '2000000', TURNKEY_SPONSOR_ACCOUNT_DAILY_WEI: '4000000', TURNKEY_SPONSOR_WALLET_DAILY_WEI: '4000000',
  TURNKEY_SPONSOR_GLOBAL_DAILY_WEI: '100000000', TURNKEY_SPONSOR_MAX_FEE_PER_GAS_WEI: '10', TURNKEY_SPONSOR_GLOBAL_DAILY_OPERATIONS: '100' };
const target = `0x${'11'.repeat(20)}`, auction = `0x${'22'.repeat(20)}`, paymaster = `0x${'33'.repeat(20)}`;
const token = new Interface(['function approve(address,uint256) returns(bool)', 'function decimals() view returns(uint8)']);
const settlement = new Interface(['function paymentToken() view returns(address)']);
const account = new Interface(['function executeBatch((address,uint256,bytes)[])']);
const delegate = new Interface(['function entryPoint() view returns(address)']);
const expiry = new Interface(['function validatePaymasterUserOp((address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature),bytes32,uint256) returns(bytes,uint256)']);
const now = Math.floor(Date.now() / 1000), addresses = new Set();
let failure, preparations = 0, expiryCalls = 0;
const latest = { number: '0x2a', hash: `0x${'ab'.repeat(32)}`, timestamp: `0x${now.toString(16)}` };
const finalized = { number: '0x20', hash: `0x${'cd'.repeat(32)}`, timestamp: `0x${(now - 600).toString(16)}` };
const pinnedReads = [];
function prepared(input) {
  const call = input.calls[0], data = { sender: input.from, nonce: '0x0', callData: account.encodeFunctionData('executeBatch', [[[call.to, call.value, call.data]]]),
    callGasLimit: '0xc350', verificationGasLimit: '0x7530', preVerificationGas: '0x5208', maxFeePerGas: '0xa', maxPriorityFeePerGas: '0x0',
    paymaster, paymasterVerificationGasLimit: '0xbb8', paymasterPostOpGasLimit: '0x0', paymasterData: '0x1234' };
  const numeric = Object.fromEntries(Object.entries(data).map(([key, value]) => [key,
    ['nonce', 'callGasLimit', 'verificationGasLimit', 'preVerificationGas', 'maxFeePerGas', 'maxPriorityFeePerGas', 'paymasterVerificationGasLimit', 'paymasterPostOpGasLimit'].includes(key) ? BigInt(value) : value]));
  const hash = getUserOperationHash({ chainId: 4663, entryPointAddress: SPONSORED_ENTRY_POINT, entryPointVersion: '0.7', userOperation: numeric });
  return { type: 'array', data: [
    { type: 'authorization', chainId: '0x1237', data: { address: SPONSORED_DELEGATE, nonce: '0x0' },
      signatureRequest: { type: 'eip7702Auth', rawPayload: hashAuthorization({ chainId: 4663, address: SPONSORED_DELEGATE, nonce: 0 }) } },
    { type: 'user-operation-v070', chainId: '0x1237', data, feePayment: { sponsored: failure !== 'paid', tokenAddress: SPONSORED_NATIVE_TOKEN, maxAmount: `0x${(1040000n).toString(16)}` },
      signatureRequest: { type: 'personal_sign', data: { raw: hash }, rawPayload: hashMessage(getBytes(hash)) } },
  ] };
}
const fetcher = async (url, options) => {
  assert.equal(options.redirect, 'error');
  if (url === 'https://mossvale.world/api/health') return new Response(JSON.stringify({ ok: true, realmId: 'eu', available: false,
    mossAuction: { enabled: true, chainId: 4663, symbol: 'MOSS', testnet: false, token: target, contract: auction } }));
  assert.equal(url, `https://api.g.alchemy.com/v2/${env.ALCHEMY_WALLET_API_KEY}`);
  const request = JSON.parse(options.body), input = request.params[0];
  assert.equal(request.method, 'wallet_prepareCalls', 'no signing, sending or wallet creation is permitted');
  assert.equal(request.params.length, 1); assert.equal(input.chainId, '0x1237');
  assert.deepEqual(input.capabilities, { paymasterService: { policyId: env.ALCHEMY_GAS_POLICY_ID }, eip7702Auth: { delegation: SPONSORED_DELEGATE } });
  assert.deepEqual(input.calls, [{ to: target, value: '0x0', data: token.encodeFunctionData('approve', [auction, 0n]) }]);
  assert(!addresses.has(input.from), 'each preflight uses a fresh address'); addresses.add(input.from); preparations++;
  if (failure === 'provider') throw Error(`Upstream secret-bearing URL ${url}`);
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: prepared(input) }));
};
const provider = {
  async send(method, params) {
    if (method === 'eth_chainId') return failure === 'chain' ? '0x1' : '0x1237';
    if (method === 'eth_getBlockByNumber') {
      assert.equal(params[1], false);
      const block = ['latest', latest.number].includes(params[0]) ? latest : ['finalized', finalized.number].includes(params[0]) ? finalized : null;
      assert(block, 'only the two selected headers may be read');
      return failure === 'canonical' && params[0] === finalized.number ? { ...block, hash: latest.hash } : block;
    }
    assert(['eth_getCode', 'eth_call'].includes(method), 'preflight permits only chain reads');
    const tag = params[1];
    assert([latest.hash, finalized.hash].includes(tag?.blockHash));
    assert.deepEqual(tag, { blockHash: tag.blockHash, requireCanonical: true }, 'no latest/number fallback may weaken a pinned state read');
    pinnedReads.push({ method, tag });
    if (failure === 'pinned' && tag.blockHash === finalized.hash) throw Error(`Unsupported state at secret URL https://example/${env.ALCHEMY_WALLET_API_KEY}`);
    if (method === 'eth_getCode') { assert([target, auction].includes(params[0])); return failure === 'code' ? '0x' : '0x6000'; }
    const input = params[0];
    if (input.to === auction) {
      assert.equal(input.data, settlement.encodeFunctionData('paymentToken'));
      return settlement.encodeFunctionResult('paymentToken', [failure === 'token' ? paymaster : target]);
    }
    assert.deepEqual(input, { to: target, data: token.encodeFunctionData('decimals') });
    return token.encodeFunctionResult('decimals', [18]);
  },
  async getCode(address) { return [SPONSORED_DELEGATE, SPONSORED_ENTRY_POINT].includes(address) && failure !== 'delegate' ? '0x6000' : '0x'; },
  async getTransactionCount() { return 0; },
  async getBlock() { return { number: 42, hash: `0x${'ab'.repeat(32)}`, timestamp: now }; },
  async call(input) {
    if (input.to === SPONSORED_DELEGATE) return delegate.encodeFunctionResult('entryPoint', [SPONSORED_ENTRY_POINT]);
    assert.equal(input.to, paymaster); assert.equal(input.from, SPONSORED_ENTRY_POINT); assert.equal(input.blockTag, 42);
    const [operation, , maxCost] = expiry.decodeFunctionData('validatePaymasterUserOp', input.data);
    assert.equal(operation.signature, '0x'); assert.equal(operation.initCode, '0x'); assert(maxCost > 0n); expiryCalls++;
    return expiry.encodeFunctionResult('validatePaymasterUserOp', ['0x', failure === 'expiry' ? 0n : BigInt(now + 120) << 160n]);
  },
};
assert.equal(await turnkeyActivationPreflight({ env, fetcher, provider }), true);
assert.equal(preparations, 1); assert.equal(expiryCalls, 1);
assert.equal(pinnedReads.length, 8);
for (const block of [latest, finalized]) {
  assert.equal(pinnedReads.filter(read => read.tag.blockHash === block.hash && read.method === 'eth_getCode').length, 2);
  assert.equal(pinnedReads.filter(read => read.tag.blockHash === block.hash && read.method === 'eth_call').length, 2);
}
assert.equal(await turnkeyActivationPreflight({ env, fetcher, provider, chainOnly: true }), true);
assert.equal(preparations, 1, 'chain-only verification must not request a gas authorization');
assert.equal(expiryCalls, 1, 'chain-only verification stops before the paymaster quote phase');
failure = 'pinned';
await assert.rejects(turnkeyActivationPreflight({ env, fetcher, provider, chainOnly: true }), /failed at canonical chain reads/);
assert.equal(preparations, 1, 'unsupported chain-only state never falls through to sponsorship');
for (const mode of ['pinned', 'canonical', 'code', 'token']) {
  failure = mode; const before = preparations;
  await assert.rejects(turnkeyActivationPreflight({ env, fetcher, provider }), error =>
    error.message === 'Turnkey activation preflight failed at canonical chain reads. No transaction was signed or sent.');
  assert.equal(preparations, before, 'incompatible canonical reads stop before requesting a gas authorization');
}
for (const mode of ['chain', 'delegate', 'provider', 'paid', 'expiry']) {
  failure = mode;
  await assert.rejects(turnkeyActivationPreflight({ env, fetcher, provider }), error =>
    /^Turnkey activation preflight failed at [a-z -]+\. No transaction was signed or sent\.$/.test(error.message)
    && !error.message.includes(env.ALCHEMY_WALLET_API_KEY) && !error.message.includes('https://'));
}
await assert.rejects(turnkeyActivationPreflight({ env: {}, fetcher, provider }), /failed at configuration/);
console.log('Turnkey activation preflight checks passed: canonical latest/finalized EIP-1898 state, no weaker fallback, prepare-only zero approval, fresh address, exact policy, finite expiry and sanitized failures.');
