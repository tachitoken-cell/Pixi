import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEVM } from '@ethereumjs/evm';
import { createCustomCommon, Mainnet, Hardfork } from '@ethereumjs/common';
import { Account, bytesToHex, createAddressFromString, hexToBytes } from '@ethereumjs/util';
import { AbiCoder, Interface, Wallet, TypedDataEncoder, ZeroAddress, ZeroHash, id, keccak256, toBeHex, toQuantity, parseUnits, verifyTypedData } from 'ethers';
import { compileStoreContract } from './build-store-contract.mjs';
import { createStoreChain, readStorePrice, storeInterface as abi, STORE_ORDER_TYPES } from '../src/store-chain.mjs';
import { MOSS_TOKEN } from '../src/auction.ts';
import { STORE_PRODUCTS, storePlayerValid } from '../src/ingame-store.ts';
import { MOSS_TOKEN_RUNTIME_HASH, erc20Interface } from '../src/auction-chain.mjs';
import { treasureUsdAmount } from '../src/treasure-rewards.ts';

const artifact = compileStoreContract();
assert.deepEqual(artifact, JSON.parse(readFileSync(new URL('../public/contracts/MossvaleStore.json', import.meta.url), 'utf8')));
const runtime = readFileSync(new URL('./fixtures/moss-token-runtime.hex', import.meta.url), 'utf8').trim();
assert.equal(keccak256(runtime), MOSS_TOKEN_RUNTIME_HASH);
const authority = Wallet.createRandom(), buyer = Wallet.createRandom(), other = Wallet.createRandom();
const account = value => createAddressFromString(typeof value === 'string' ? value : value.address), tokenAddress = account(MOSS_TOKEN.address);
const tokenAbi = new Interface(['function balanceOf(address) view returns(uint256)', 'function totalSupply() view returns(uint256)',
  'function approve(address,uint256) returns(bool)', 'function allowance(address,address) view returns(uint256)']);
const evm = await createEVM({ common: createCustomCommon({ chainId: 4663 }, Mainnet, { hardfork: Hardfork.Cancun }) });
for (const wallet of [authority, buyer, other]) await evm.stateManager.putAccount(account(wallet), new Account(0n, 10n ** 20n));
await evm.stateManager.putCode(tokenAddress, hexToBytes(runtime));
const coder = AbiCoder.defaultAbiCoder(), initial = 1000n * 10n ** 18n;
// Seed ERC20 storage in the isolated EVM; execute the actual pinned MOSS bytecode, never a live transaction.
await evm.stateManager.putStorage(tokenAddress, hexToBytes(keccak256(coder.encode(['address', 'uint256'], [buyer.address, 0]))), hexToBytes(toBeHex(initial, 32)));
await evm.stateManager.putStorage(tokenAddress, hexToBytes(toBeHex(2, 32)), hexToBytes(toBeHex(initial, 32)));
let timestamp = 1000;
const block = () => ({ header: { number: 100n, timestamp: BigInt(timestamp), coinbase: account(ZeroAddress), difficulty: 0n,
  prevRandao: new Uint8Array(32), gasLimit: 30000000n, getBlobGasPrice: () => undefined } });
const deploy = (targetEvm, signer = authority.address) => targetEvm.runCall({ caller: account(authority),
  data: hexToBytes(artifact.bytecode + coder.encode(['address'], [signer]).slice(2)), gasLimit: 6000000n, block: block() });
assert((await deploy(evm, ZeroAddress)).execResult.exceptionError, 'zero authority rejected');
const wrong = await createEVM({ common: createCustomCommon({ chainId: 46630 }, Mainnet, { hardfork: Hardfork.Cancun }) });
await wrong.stateManager.putCode(tokenAddress, hexToBytes(runtime));
assert((await deploy(wrong)).execResult.exceptionError, 'wrong chain rejected');
const empty = await createEVM({ common: createCustomCommon({ chainId: 4663 }, Mainnet, { hardfork: Hardfork.Cancun }) });
assert((await deploy(empty)).execResult.exceptionError, 'missing MOSS code rejected');
const deployed = await deploy(evm); assert.equal(deployed.execResult.exceptionError, undefined);
const contract = deployed.createdAddress.toString();
const call = (target, iface, name, args = [], wallet = buyer, value = 0n) => evm.runCall({ to: account(target), caller: account(wallet),
  data: hexToBytes(iface.encodeFunctionData(name, args)), value, gasLimit: 3000000n, block: block() });
const read = async (target, iface, name, args = []) => {
  const result = await call(target, iface, name, args); assert.equal(result.execResult.exceptionError, undefined);
  return iface.decodeFunctionResult(name, bytesToHex(result.execResult.returnValue))[0];
};
assert.equal(await read(MOSS_TOKEN.address, tokenAbi, 'balanceOf', [buyer.address]), initial);
assert.equal(await read(MOSS_TOKEN.address, tokenAbi, 'totalSupply'), initial);
const domain = { name: 'MossvaleStore', version: '1', chainId: 4663, verifyingContract: contract };
const order = { orderId: id('quote'), productId: id('ember-fox'), characterId: id('character'), buyer: buyer.address, amountWei: 10n ** 18n, usdCents: 2000, deadline: 1300 };
const signature = await authority.signTypedData(domain, STORE_ORDER_TYPES, order);
const purchase = (value = order, sig = signature, wallet = buyer, eth = 0n) => call(contract, abi, 'buy', [value, sig], wallet, eth);
assert((await purchase()).execResult.exceptionError, 'burn requires allowance');
await call(MOSS_TOKEN.address, tokenAbi, 'approve', [contract, order.amountWei]);
for (const change of [{ buyer: other.address }, { characterId: id('stolen-character') }, { productId: id('stolen-product') }, { orderId: id('other-quote') },
  { amountWei: 2n }, { usdCents: 4000 }, { deadline: 1301 }]) assert((await purchase({ ...order, ...change })).execResult.exceptionError, 'signed field tampering rejected');
assert((await purchase(order, signature, other)).execResult.exceptionError, 'wrong caller rejected');
assert((await purchase(order, await other.signTypedData(domain, STORE_ORDER_TYPES, order))).execResult.exceptionError, 'wrong signer rejected');
assert((await purchase(order, '0x')).execResult.exceptionError, 'truncated signature rejected');
for (const change of [{ orderId: ZeroHash }, { productId: ZeroHash }, { characterId: ZeroHash }, { amountWei: 0n }, { usdCents: 1 }]) {
  const invalid = { ...order, ...change };
  assert((await purchase(invalid, await authority.signTypedData(domain, STORE_ORDER_TYPES, invalid))).execResult.exceptionError, 'invalid signed terms rejected');
}
const insufficient = { ...order, amountWei: initial + 1n };
await call(MOSS_TOKEN.address, tokenAbi, 'approve', [contract, insufficient.amountWei]);
assert((await purchase(insufficient, await authority.signTypedData(domain, STORE_ORDER_TYPES, insufficient))).execResult.exceptionError, 'insufficient balance reverts atomically');
assert.equal(await read(contract, abi, 'paidOrders', [order.orderId]), ZeroHash, 'failed burn never records payment');
assert.equal(await read(MOSS_TOKEN.address, tokenAbi, 'totalSupply'), initial, 'failed burn does not change supply');
await call(MOSS_TOKEN.address, tokenAbi, 'approve', [contract, order.amountWei]);
assert((await purchase(order, signature, buyer, 1n)).execResult.exceptionError, 'ETH rejected');
timestamp = 1301; assert((await purchase()).execResult.exceptionError, 'expired quote rejected before burning'); timestamp = 1000;
const paid = await purchase(); assert.equal(paid.execResult.exceptionError, undefined, 'real MOSS burn succeeds');
assert.equal(await read(MOSS_TOKEN.address, tokenAbi, 'balanceOf', [buyer.address]), initial - order.amountWei);
assert.equal(await read(MOSS_TOKEN.address, tokenAbi, 'totalSupply'), initial - order.amountWei, 'burn reduces real token supply exactly');
assert.equal(await read(MOSS_TOKEN.address, tokenAbi, 'balanceOf', [contract]), 0n, 'store holds no tokens');
assert.equal(await read(MOSS_TOKEN.address, tokenAbi, 'allowance', [buyer.address, contract]), 0n, 'exact approval consumed');
assert.equal(await read(contract, abi, 'paidOrders', [order.orderId]), TypedDataEncoder.hash(domain, STORE_ORDER_TYPES, order));
assert((await purchase()).execResult.exceptionError, 'onchain quote replay rejected');
assert.equal(await read(MOSS_TOKEN.address, tokenAbi, 'totalSupply'), initial - order.amountWei, 'replay burns nothing');
for (const usdCents of [200, 500, 4000, 5000, 10000]) {
  const smallOrder = { ...order, orderId: id(`new-price-${usdCents}`), usdCents };
  const supply = await read(MOSS_TOKEN.address, tokenAbi, 'totalSupply');
  const balance = await read(MOSS_TOKEN.address, tokenAbi, 'balanceOf', [buyer.address]);
  await call(MOSS_TOKEN.address, tokenAbi, 'approve', [contract, smallOrder.amountWei]);
  assert.equal((await purchase(smallOrder, await authority.signTypedData(domain, STORE_ORDER_TYPES, smallOrder))).execResult.exceptionError, undefined, `${usdCents} cents burns through actual MOSS/store bytecode`);
  assert.equal(await read(MOSS_TOKEN.address, tokenAbi, 'totalSupply'), supply - smallOrder.amountWei);
  assert.equal(await read(MOSS_TOKEN.address, tokenAbi, 'balanceOf', [buyer.address]), balance - smallOrder.amountWei);
  assert.equal(await read(MOSS_TOKEN.address, tokenAbi, 'balanceOf', [contract]), 0n);
  assert.equal(await read(MOSS_TOKEN.address, tokenAbi, 'allowance', [buyer.address, contract]), 0n);
  assert.equal(await read(contract, abi, 'paidOrders', [smallOrder.orderId]), TypedDataEncoder.hash(domain, STORE_ORDER_TYPES, smallOrder));
  assert((await purchase(smallOrder, await authority.signTypedData(domain, STORE_ORDER_TYPES, smallOrder))).execResult.exceptionError, 'every price tier rejects replay');
  assert.equal(await read(MOSS_TOKEN.address, tokenAbi, 'totalSupply'), supply - smallOrder.amountWei, 'replaying a paid order burns nothing');
}

const txHash = id('transaction'), now = 1000000;
let tokenCode = runtime, contractCode = artifact.deployedBytecode, chainId = '0x1237', receipt, unavailable, changeAfterRead;
let finalHead, latestHead, canonical, payments, service;
const makeBlock = (number, seconds, label = `block-${number}`) => ({ number: toQuantity(number), timestamp: toQuantity(seconds), hash: id(label) });
const rpc = async (method, params) => {
  if (method === unavailable) throw Error('RPC unavailable');
  if (method === 'eth_chainId') return chainId;
  if (method === 'eth_getBlockByNumber') return params[0] === 'finalized' ? finalHead : params[0] === 'latest' ? latestHead : canonical.get(params[0]);
  if (method === 'eth_getCode') return params[0].toLowerCase() === MOSS_TOKEN.address.toLowerCase() ? tokenCode : contractCode;
  if (method === 'eth_getTransactionReceipt') return receipt;
  if (method === 'eth_call') {
    assert.equal(params[1].requireCanonical, true, 'all store storage reads pin canonical block hashes');
    const isToken = params[0].to.toLowerCase() === MOSS_TOKEN.address.toLowerCase(), iface = isToken ? erc20Interface : abi;
    const call = iface.parseTransaction(params[0]);
    const values = { name: 'Mossvale', symbol: 'MOSS', decimals: 18, authority: authority.address, paymentToken: MOSS_TOKEN.address,
      paidOrders: payments.get(params[1].blockHash) ?? ZeroHash };
    if (call.name === 'paidOrders' && params[1].blockHash === latestHead.hash && changeAfterRead)
      canonical.set(latestHead.number, { ...latestHead, hash: id('changed-during-read') });
    return iface.encodeFunctionResult(call.name, [values[call.name]]);
  }
  throw Error(`Unexpected RPC ${method}`);
};
const resetChain = () => {
  finalHead = makeBlock(100, 900); latestHead = makeBlock(110, 1000);
  canonical = new Map([finalHead, makeBlock(109, 999), latestHead].map(value => [value.number, value])); payments = new Map();
  unavailable = undefined; changeAfterRead = false;
  service = createStoreChain({ contract, authorityKey: authority.privateKey, rpc, price: async ({ now }) => ({ usdWei: parseUnits('0.0003', 18).toString(), observedAt: now, source: 'fixture' }) });
};
const advanceLatest = (number, seconds, payment = ZeroHash) => {
  latestHead = makeBlock(number, seconds); canonical.set(latestHead.number, latestHead); payments.set(latestHead.hash, payment);
};
const withAnchor = (order, result) => ({ ...order, paymentBlock: { hash: result.blockHash, number: result.blockNumber } });
resetChain();
for (const product of STORE_PRODUCTS) {
  const terms = { id: `catalog-${product.id}`, characterId: 'character-id', productId: product.id, wallet: buyer.address, usdPrice: product.usdPrice };
  const quoted = await service.prepareOrder(terms, now);
  assert.equal(quoted.contractOrder.usdCents, String(product.usdPrice * 100));
  assert.equal((await service.settlement(quoted, now)).state, 'pending', `${product.id} uses the real quote and settlement adapter`);
  await assert.rejects(service.prepareOrder({ ...terms, usdPrice: product.usdPrice === 2 ? 5 : 2 }, now), /Invalid store product/);
}
await assert.rejects(service.prepareOrder({ id: 'unknown', characterId: 'character-id', productId: 'unknown', wallet: buyer.address, usdPrice: 20 }, now), /Invalid store product/);
await assert.rejects(service.prepareOrder({ id: 'retired', characterId: 'character-id', productId: 'burned', wallet: buyer.address, usdPrice: 100 }, now), /Invalid store product/, 'retired title cannot receive a burn authorization');
const classQuote = await service.prepareOrder({ id: 'class-change', characterId: 'character-id', productId: 'store-class-change', wallet: buyer.address, usdPrice: 50 }, now);
assert.equal(classQuote.amountWei, '166666666666666666666667', '$50 credit rounds the quoted MOSS amount upward');
assert.equal(classQuote.contractOrder.usdCents, '5000');
assert.equal(classQuote.contractOrder.productId, id('store-class-change'), 'the signed product buys a generic class-change credit');
assert.deepEqual(abi.decodeFunctionData('buy', classQuote.transaction.data)[0].toArray().map(String), Object.values(classQuote.contractOrder).map(String));
const rpcOrder = await service.prepareOrder({ id: 'quote-id', characterId: 'character-id', productId: 'store-cinder-kit', wallet: buyer.address, usdPrice: 20 }, now);
assert.equal(rpcOrder.amountWei, '66666666666666666666667', 'USD conversion rounds token base units upward');
assert.equal(rpcOrder.expiresAt, 1300000);
assert.deepEqual(abi.decodeFunctionData('buy', rpcOrder.transaction.data)[0].toArray().map(String), Object.values(rpcOrder.contractOrder).map(String));
assert.equal((await service.settlement(rpcOrder, now)).state, 'pending');
const retiredOrder = { ...rpcOrder, productId: 'burned', usdPrice: 100, contractOrder: { ...rpcOrder.contractOrder, productId: id('burned'), usdCents: '10000' } };
retiredOrder.signature = await authority.signTypedData(domain, STORE_ORDER_TYPES, retiredOrder.contractOrder);
retiredOrder.orderHash = TypedDataEncoder.hash(domain, STORE_ORDER_TYPES, retiredOrder.contractOrder);
assert.equal((await service.settlement(retiredOrder, now)).state, 'pending', 'historical title orders can still be settled');
assert.equal((await service.settlement({ ...rpcOrder, transactionHash: 'invalid client hint' }, now)).state, 'pending', 'a hash alone grants nothing');
assert.equal((await service.verifyPayment(rpcOrder, txHash, now)).state, 'pending', 'a submitted or reverted transaction without paid storage grants nothing');
payments.set(latestHead.hash, rpcOrder.orderHash);
let result = await service.settlement({ ...rpcOrder, transactionHash: 'invalid client hint' }, now);
assert.equal(result.state, 'paid', 'latest matching storage settles a mined purchase immediately without a transaction hash');
let anchored = withAnchor(rpcOrder, result);
advanceLatest(111, 1001, rpcOrder.orderHash);
result = await service.settlement(anchored, now + 1000);
assert.equal(result.state, 'paid'); assert.equal(result.blockHash, anchored.paymentBlock.hash, 'unchanged polls preserve the first canonical anchor');
assert.equal(result.reanchored, undefined);
const event = abi.encodeEventLog(abi.getEvent('Purchased'), [rpcOrder.contractOrder.orderId, rpcOrder.orderHash, buyer.address,
  rpcOrder.contractOrder.productId, rpcOrder.contractOrder.characterId, rpcOrder.amountWei, 2000]);
receipt = { status: '0x1', to: contract, from: buyer.address, transactionHash: txHash, blockNumber: '0x6d', blockHash: canonical.get('0x6d').hash, logs: [{ address: contract, ...event }] };
assert.equal((await service.verifyPayment(anchored, txHash, now + 1000)).state, 'paid');
const processedReceipt = receipt; receipt = { ...receipt, status: '0x0' };
await assert.rejects(service.verifyPayment(anchored, txHash, now + 1000), /receipt does not match/); receipt = processedReceipt;
finalHead = canonical.get('0x6e');
assert.equal((await service.settlement(anchored, now + 1000)).state, 'paid', 'finalized payment becomes permanent');
assert.equal((await service.settlement(anchored, now + 4000000)).state, 'paid', 'old finalized payment remains valid despite a stale RPC clock');
assert.equal((await service.verifyPayment(rpcOrder, txHash, now)).state, 'paid');
{
  const direct = receipt, entryPoint = '0x0000000071727De22E5E9d8BAf0edAc6f37da032', userOpHash = id('store-user-operation');
  const entryAbi = new Interface(['event BeforeExecution()', 'event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)']);
  const before = { address: entryPoint, ...entryAbi.encodeEventLog(entryAbi.getEvent('BeforeExecution'), []) };
  const end = opHash => ({ address: entryPoint, ...entryAbi.encodeEventLog(entryAbi.getEvent('UserOperationEvent'), [opHash, buyer.address, other.address, 1, true, 1000, 100]) });
  const wrap = entries => { receipt = { ...direct, from: other.address, to: entryPoint, logs: entries.map((log, index) => ({ ...log,
    logIndex: toQuantity(index), transactionHash: txHash, blockHash: direct.blockHash, blockNumber: direct.blockNumber })) }; };
  const sponsored = createStoreChain({ contract, authorityKey: authority.privateKey, rpc, sponsoredOperation: async query => {
    assert.deepEqual({ ...query, contract: query.contract.toLowerCase() }, { transactionHash: txHash, wallet: buyer.address, contract: contract.toLowerCase() });
    return { userOpHash, entryPoint, sender: buyer.address, paymaster: other.address };
  } });
  wrap([before, ...direct.logs, end(userOpHash)]);
  assert.equal((await sponsored.verifyPayment(rpcOrder, txHash, now)).state, 'paid');
  wrap([before, ...direct.logs, end(id('different-operation')), end(userOpHash)]);
  await assert.rejects(sponsored.verifyPayment(rpcOrder, txHash, now), /receipt/, 'another operation cannot supply the store reward event');
  receipt = direct;
}
for (const change of [{ characterId: 'other' }, { productId: 'other' }, { wallet: other.address }, { id: 'other' }, { amountWei: '1' }, { usdPrice: 100 }, { chainId: 1 }])
  await assert.rejects(service.settlement({ ...rpcOrder, ...change }, now), 'quote identities cannot be substituted');
for (const change of [{ from: other.address }, { to: other.address }, { status: '0x0' }, { blockNumber: '0x70' }, { logs: [] }, { logs: [...receipt.logs, ...receipt.logs] }, { transactionHash: id('another') }]) {
  const original = receipt; receipt = { ...receipt, ...change }; await assert.rejects(service.verifyPayment(rpcOrder, txHash, now)); receipt = original;
}
let originalBlock = canonical.get(receipt.blockNumber);
canonical.set(receipt.blockNumber, { ...originalBlock, hash: id('orphaned-receipt') });
await assert.rejects(service.verifyPayment(rpcOrder, txHash, now), /not canonical/); canonical.set(receipt.blockNumber, originalBlock);
await assert.rejects(service.verifyPayment(rpcOrder, 'invalid', now));
receipt = undefined; await assert.rejects(service.verifyPayment(rpcOrder, txHash, now));
assert.equal((await service.settlement({ ...rpcOrder, transactionHash: txHash }, now)).state, 'paid', 'missing optional receipt cannot block storage settlement');

// Provisional rewards survive uncertainty; revocation requires positive proof of an orphaned anchor.
resetChain(); payments.set(latestHead.hash, rpcOrder.orderHash);
anchored = withAnchor(rpcOrder, await service.settlement(rpcOrder, now));
unavailable = 'eth_call'; await assert.rejects(service.settlement(anchored, now), /unavailable/); unavailable = undefined;
advanceLatest(111, 1001, ZeroHash);
await assert.rejects(service.settlement(anchored, now + 1000), /missing from its canonical chain/, 'canonical payment cannot disappear: preserve entitlement on inconsistent RPC');
canonical.set(anchored.paymentBlock.number, { ...canonical.get(anchored.paymentBlock.number), hash: id('reorg-at-anchor') });
result = await service.settlement(anchored, now + 1000);
assert.equal(result.state, 'pending'); assert.equal(result.revoked, true, 'fresh unpaid chain and orphaned anchor revoke provisional reward');
advanceLatest(112, 1002, rpcOrder.orderHash);
result = await service.settlement(rpcOrder, now + 2000);
assert.equal(result.state, 'paid', 're-inclusion restores the purchase');
result = await service.settlement(anchored, now + 2000);
assert.equal(result.state, 'paid'); assert.equal(result.reanchored, true, 're-inclusion between polls refreshes orphaned anchor without removing reward');
assert.equal(result.blockHash, latestHead.hash);
anchored = withAnchor(rpcOrder, result);
advanceLatest(113, 1003, ZeroHash);
await assert.rejects(service.settlement(anchored, now + 3000), /missing from its canonical chain/, 'new canonical anchor protects later polls after re-inclusion');

resetChain(); payments.set(latestHead.hash, rpcOrder.orderHash);
anchored = withAnchor(rpcOrder, await service.settlement(rpcOrder, now));
originalBlock = latestHead;
latestHead = makeBlock(109, 1001); await assert.rejects(service.settlement(anchored, now + 1000), /stale or inconsistent/); latestHead = originalBlock;
await assert.rejects(service.settlement(anchored, now + 121000), /stale or inconsistent/, 'stale latest head never revokes');
const originalFinal = finalHead;
finalHead = makeBlock(99, 901); canonical.set(finalHead.number, finalHead); await assert.rejects(service.settlement(anchored, now), /finality regressed/);
finalHead = { ...originalFinal, hash: id('changed-finalized') }; canonical.set(finalHead.number, finalHead);
await assert.rejects(service.settlement(anchored, now), /finality regressed/); finalHead = originalFinal; canonical.set(finalHead.number, finalHead);
advanceLatest(111, 3002, ZeroHash);
await assert.rejects(service.settlement(anchored, 3002000), /stale or inconsistent/, 'stalled finality never revokes or expires');
payments.set(latestHead.hash, rpcOrder.orderHash);
assert.equal((await service.settlement(anchored, 3002000)).state, 'paid', 'fresh canonical store payment settles while finality lags over 30 minutes');
resetChain(); payments.set(latestHead.hash, rpcOrder.orderHash);
anchored = withAnchor(rpcOrder, await service.settlement(rpcOrder, now));
canonical.delete(anchored.paymentBlock.number); await assert.rejects(service.settlement(anchored, now), /unavailable/, 'missing historical anchor preserves the reward');
canonical.set(latestHead.number, latestHead);
changeAfterRead = true; await assert.rejects(service.settlement(anchored, now), /changed while verifying/, 'reorg during a state read requires retry'); changeAfterRead = false;
canonical.set(latestHead.number, latestHead);
for (const paymentBlock of [{ hash: 'invalid', number: '0x6e' }, { hash: latestHead.hash, number: '0x06e' }, { hash: latestHead.hash, number: '0x70' }])
  await assert.rejects(service.settlement({ ...rpcOrder, paymentBlock }, now), /block is unavailable/);
payments.set(latestHead.hash, id('conflict')); await assert.rejects(service.settlement(rpcOrder, now), /conflicting/);

resetChain(); payments.set(latestHead.hash, rpcOrder.orderHash);
anchored = withAnchor(rpcOrder, await service.settlement(rpcOrder, now));
canonical.set(latestHead.number, { ...latestHead, hash: id('reorg-before-expiry') });
finalHead = makeBlock(120, 1301); canonical.set(finalHead.number, finalHead); advanceLatest(130, 1302);
result = await service.settlement(anchored, 1302000);
assert.equal(result.state, 'expired'); assert.equal(result.revoked, true, 'reorg followed by finalized unpaid expiry revokes and permits requoting');
result = await service.settlement(rpcOrder, 1302000);
assert.equal(result.state, 'expired'); assert.equal(result.revoked, undefined, 'unpaid expiry without prior processed reward is not a revocation');
payments.set(latestHead.hash, rpcOrder.orderHash); await assert.rejects(service.settlement(rpcOrder, 1302000), /conflicts with finalized expiry/);
payments.set(finalHead.hash, rpcOrder.orderHash);
assert.equal((await service.settlement(rpcOrder, 1302000)).state, 'paid', 'payment wins over expired wall clock');

tokenCode = '0x00'; assert.equal((await service.status()).enabled, false); tokenCode = runtime;
contractCode = '0x00'; assert.equal((await service.status()).enabled, false); contractCode = artifact.deployedBytecode;
chainId = '0x1'; assert.equal((await service.status()).enabled, false); chainId = '0x1237';
assert.equal((await service.status()).enabled, true);
resetChain();
const stale = createStoreChain({ contract, authorityKey: authority.privateKey, rpc, price: async () => ({ usdWei: '1', observedAt: 1 }) });
await assert.rejects(stale.prepareOrder({ id: 'stale', characterId: 'x', productId: 'store-cinder-kit', wallet: buyer.address, usdPrice: 20 }, now));
assert.equal((await createStoreChain().status()).enabled, false, 'unconfigured contract fails closed');

// A contract replacement must still settle and verify both generations of saved burns.
resetChain();
const legacyContract = other.address, legacyCode = readFileSync(new URL('./fixtures/moss-store-v1-runtime.hex', import.meta.url), 'utf8').trim();
assert.equal(keccak256(legacyCode), '0x587388814dcc259118f76955800fcd4190eecbabfcc00a6eff6ff92dce78a489');
const previousContract = Wallet.createRandom().address, previousCode = readFileSync(new URL('./fixtures/moss-store-v2-runtime.hex', import.meta.url), 'utf8').trim();
assert.equal(keccak256(previousCode), '0xd9fc5437e90b8a851e39a19ccdee768fb7643e985966e0d580c07286f378aae8');
const oldContracts = [[legacyContract, legacyCode], [previousContract, previousCode]];
const oldRuntimes = new Map(oldContracts.map(([address, code]) => [address.toLowerCase(), code]));
const cutoverOptions = { legacyContract, previousContract, authorityKey: authority.privateKey,
  rpc: (method, params) => method === 'eth_getCode' && oldRuntimes.has(params[0].toLowerCase()) ? oldRuntimes.get(params[0].toLowerCase()) : rpc(method, params),
  price: async ({ now }) => ({ usdWei: parseUnits('0.0003', 18).toString(), observedAt: now }) };
const cutover = createStoreChain({ contract, ...cutoverOptions });
const newQuote = await cutover.prepareOrder({ id: 'new-credit', characterId: 'character-id', productId: 'store-class-change', wallet: buyer.address, usdPrice: 50 }, now);
assert.equal(newQuote.contract.toLowerCase(), contract.toLowerCase(), 'new purchases only use the replacement contract');
for (const [oldContract, oldCode] of oldContracts) {
  resetChain();
  const legacyDomain = { ...domain, verifyingContract: oldContract };
  const legacyOrder = { ...rpcOrder, contract: oldContract, signature: await authority.signTypedData(legacyDomain, STORE_ORDER_TYPES, rpcOrder.contractOrder),
    orderHash: TypedDataEncoder.hash(legacyDomain, STORE_ORDER_TYPES, rpcOrder.contractOrder) };
  assert.equal((await cutover.settlement(legacyOrder, now)).state, 'pending');
  payments.set(latestHead.hash, legacyOrder.orderHash);
  const legacyAnchored = withAnchor(legacyOrder, await cutover.settlement(legacyOrder, now));
  assert.equal((await cutover.settlement(legacyAnchored, now)).state, 'paid');
  finalHead = latestHead;
  assert.equal((await cutover.settlement(legacyAnchored, now)).state, 'paid', 'old finalized burns survive the contract cutover');
  const legacyEvent = abi.encodeEventLog(abi.getEvent('Purchased'), [legacyOrder.contractOrder.orderId, legacyOrder.orderHash, buyer.address,
    legacyOrder.contractOrder.productId, legacyOrder.contractOrder.characterId, legacyOrder.amountWei, 2000]);
  receipt = { status: '0x1', to: oldContract, from: buyer.address, transactionHash: txHash, blockNumber: latestHead.number,
    blockHash: latestHead.hash, logs: [{ address: oldContract, ...legacyEvent }] };
  assert.equal((await cutover.verifyPayment(legacyAnchored, txHash, now)).state, 'paid', 'old receipts use the old contract address and signing domain');
  await assert.rejects(cutover.settlement({ ...legacyOrder, contract: authority.address }, now), /Invalid store order/);
  oldRuntimes.set(oldContract.toLowerCase(), '0x00');
  await assert.rejects(cutover.settlement(legacyOrder, now), /reviewed MOSS burn contract/, 'legacy runtime remains pinned');
  oldRuntimes.set(oldContract.toLowerCase(), oldCode === legacyCode ? previousCode : legacyCode);
  await assert.rejects(cutover.settlement(legacyOrder, now), /reviewed MOSS burn contract/, 'a different reviewed generation at the configured address is still rejected');
  oldRuntimes.set(oldContract.toLowerCase(), oldCode);
  contractCode = '0x00';
  assert.equal((await cutover.status()).enabled, false);
  assert.equal((await cutover.settlement(legacyOrder, now)).state, 'paid', 'new store setup failure cannot strand an old finalized burn');
  contractCode = artifact.deployedBytecode;
  if (oldContract === previousContract) {
    const staged = createStoreChain({ ...cutoverOptions, previousContract: '', contract: previousContract });
    assert.equal((await staged.status()).enabled, false, 'new quotes stay disabled until the replacement runtime is configured');
    await assert.rejects(staged.prepareOrder({ id: 'staged-credit', characterId: 'character-id', productId: 'store-class-change', wallet: buyer.address, usdPrice: 50 }, now), /reviewed MOSS burn contract/);
    assert.equal((await staged.settlement(legacyOrder, now)).state, 'paid', 'staged code settles configured v2 without new environment settings');
    assert.equal((await staged.verifyPayment(legacyAnchored, txHash, now)).state, 'paid', 'staged v2 receipt verification uses the existing configuration');
    await assert.rejects(staged.settlement({ ...legacyOrder, contract: authority.address }, now), /Invalid store order/, 'staging never accepts an unconfigured contract');
    oldRuntimes.set(oldContract.toLowerCase(), legacyCode);
    await assert.rejects(staged.settlement(legacyOrder, now), /reviewed MOSS burn contract/, 'configured-current staging cannot accept the older v1 runtime');
    oldRuntimes.set(oldContract.toLowerCase(), '0x00');
    await assert.rejects(staged.settlement(legacyOrder, now), /reviewed MOSS burn contract/, 'configured-current staging rejects unknown runtime');
    oldRuntimes.set(oldContract.toLowerCase(), oldCode);
  }
}

// Activation uses unchanged production configuration; payment storage stays address/order specific.
resetChain();
const productionV1 = '0xD1CE3C27274A54F238eA95a53e82d90FD34075b2', productionV2 = '0x4d35c8Be28Fde974921a851627Ad785Ce2939cda';
const productionV3 = '0x745c8f5db2Ea7A4B1512437Bfd8654C3BF53B5b4';
const activationCodes = new Map([[productionV1.toLowerCase(), legacyCode], [productionV2.toLowerCase(), previousCode], [productionV3.toLowerCase(), artifact.deployedBytecode]]);
const activationPayments = new Map(), paymentKey = (address, orderId, blockHash) => `${address.toLowerCase()}:${orderId}:${blockHash}`;
let activationAuthority = authority.address;
const activationRpc = async (method, params) => {
  if (method === 'eth_getCode' && activationCodes.has(params[0].toLowerCase())) return activationCodes.get(params[0].toLowerCase());
  if (method === 'eth_call' && activationCodes.has(params[0].to.toLowerCase())) {
    const call = abi.parseTransaction(params[0]);
    if (call.name === 'authority') return abi.encodeFunctionResult('authority', [activationAuthority]);
    if (call.name === 'paidOrders') {
      assert.equal(params[1].requireCanonical, true);
      return abi.encodeFunctionResult('paidOrders', [activationPayments.get(paymentKey(params[0].to, call.args[0], params[1].blockHash)) ?? ZeroHash]);
    }
  }
  return rpc(method, params);
};
const activationOptions = { authorityKey: authority.privateKey, legacyContract: productionV1, previousContract: '', rpc: activationRpc, price: cutoverOptions.price };
const activated = createStoreChain({ ...activationOptions, contract: productionV2 });
assert.equal((await activated.status()).contract, productionV3);
assert.equal((await activated.status()).enabled, true);
const activatedQuote = await activated.prepareOrder({ id: '11111111-1111-4111-8111-111111111111', characterId: 'character-id', productId: 'store-class-change', wallet: buyer.address, usdPrice: 50 }, now);
assert.equal(activatedQuote.contract, productionV3); assert.equal(activatedQuote.transaction.to, productionV3);
assert.equal(erc20Interface.decodeFunctionData('approve', activatedQuote.approval.data)[0], productionV3);
assert.equal(activatedQuote.contractOrder.usdCents, '5000');
assert.equal(verifyTypedData({ ...domain, verifyingContract: productionV3 }, STORE_ORDER_TYPES, activatedQuote.contractOrder, activatedQuote.signature), authority.address);
assert.equal(activatedQuote.orderHash, TypedDataEncoder.hash({ ...domain, verifyingContract: productionV3 }, STORE_ORDER_TYPES, activatedQuote.contractOrder));
const classPlayer = { id: activatedQuote.characterId, storeOrders: [activatedQuote], storePurchases: [], ownedMounts: [], ownedPets: [] };
assert(storePlayerValid(classPlayer), 'the unchanged stage-one schema accepts v3 quotes');
const activationOrders = await Promise.all([productionV1, productionV2].map(async address => ({ ...rpcOrder, contract: address,
  orderHash: TypedDataEncoder.hash({ ...domain, verifyingContract: address }, STORE_ORDER_TYPES, rpcOrder.contractOrder),
  signature: await authority.signTypedData({ ...domain, verifyingContract: address }, STORE_ORDER_TYPES, rpcOrder.contractOrder) })));
activationOrders.push(activatedQuote);
for (const order of activationOrders) {
  activationPayments.set(paymentKey(order.contract, id('wrong-order'), latestHead.hash), order.orderHash);
  assert.equal((await activated.settlement(order, now)).state, 'pending', 'another contract/order payment cannot satisfy this order');
  activationPayments.set(paymentKey(order.contract, order.contractOrder.orderId, latestHead.hash), order.orderHash);
  const included = await activated.settlement(order, now);
  assert.equal(included.state, 'paid', 'each contract settles only its own saved order');
  if (order === activatedQuote) {
    const processed = { ...withAnchor(order, included), status: 'processed', reward: { kind: 'class-change', grantedAt: now } };
    assert(storePlayerValid({ ...classPlayer, storeOrders: [processed] }), 'stage-one readers accept processed v3 credits');
    assert(storePlayerValid({ ...classPlayer, storeOrders: [{ ...processed, reward: { ...processed.reward, className: 'Mage', redeemedAt: now } }] }), 'stage-one readers accept redeemed v3 credits');
  }
}
finalHead = latestHead;
for (const order of activationOrders) {
  const event = abi.encodeEventLog(abi.getEvent('Purchased'), [order.contractOrder.orderId, order.orderHash,
    order.wallet, order.contractOrder.productId, order.contractOrder.characterId, order.amountWei, order.contractOrder.usdCents]);
  receipt = { status: '0x1', to: order.contract, from: order.wallet, transactionHash: txHash, blockNumber: latestHead.number, blockHash: latestHead.hash, logs: [{ address: order.contract, ...event }] };
  assert.equal((await activated.verifyPayment(order, txHash, now)).state, 'paid', 'v1, v2 and v3 receipts retain their original contract and domain');
}
activationCodes.set(productionV3.toLowerCase(), previousCode);
assert.equal((await activated.status()).enabled, false, 'a wrong v3 runtime disables quotes without falling back to v2');
await assert.rejects(activated.prepareOrder({ id: 'no-fallback', characterId: 'character-id', productId: 'store-class-change', wallet: buyer.address, usdPrice: 50 }, now), /reviewed MOSS burn contract/);
await assert.rejects(activated.settlement(activatedQuote, now), /reviewed MOSS burn contract/);
assert.equal((await activated.settlement(activationOrders[1], now)).state, 'paid', 'v3 setup failure cannot strand v2 payments');
activationCodes.set(productionV3.toLowerCase(), artifact.deployedBytecode);
activationCodes.set(productionV2.toLowerCase(), artifact.deployedBytecode);
await assert.rejects(activated.settlement(activationOrders[1], now), /reviewed MOSS burn contract/, 'mapped old address remains pinned to v2');
activationCodes.set(productionV2.toLowerCase(), previousCode);
activationAuthority = other.address; assert.equal((await activated.status()).enabled, false); activationAuthority = authority.address;
chainId = '0x1'; assert.equal((await activated.status()).enabled, false); chainId = '0x1237';
await assert.rejects(activated.settlement({ ...activatedQuote, contract: other.address }, now), /Invalid store order/);
const existingStoreContract = process.env.STORE_CONTRACT;
try {
  process.env.STORE_CONTRACT = productionV2.toLowerCase();
  assert.equal((await createStoreChain(activationOptions).status()).contract, productionV3, 'the server default environment path activates the exact known address');
  assert.equal((await createStoreChain({ ...activationOptions, contract: '' }).status()).enabled, false, 'explicit empty configuration stays disabled');
  assert.equal((await createStoreChain({ ...activationOptions, contract }).status()).contract.toLowerCase(), contract.toLowerCase(), 'unrelated custom configuration stays unchanged');
} finally { if (existingStoreContract === undefined) delete process.env.STORE_CONTRACT; else process.env.STORE_CONTRACT = existingStoreContract; }

resetChain();
const reorgOnPrice = createStoreChain({ contract, authorityKey: authority.privateKey, rpc, price: async ({ now }) => {
  canonical.set(finalHead.number, { ...finalHead, hash: id('reorg-after-price') });
  return { usdWei: parseUnits('1', 18).toString(), observedAt: now };
} });
assert.equal((await reorgOnPrice.status()).enabled, false, 'cached contract/price reads cannot make an orphaned block ready');
canonical.set(finalHead.number, finalHead);
await assert.rejects(reorgOnPrice.prepareOrder({ id: 'reorg-price', characterId: 'character-id', productId: 'store-cinder-kit', wallet: buyer.address, usdPrice: 20 }, now),
  /changed while verifying/, 'a price-block reorg prevents signing a new store order');

// Deterministic issuer freshness, decimal multiplier, sparse liquidity and volatile-market pricing.
const priceNow = Date.now(), newest = { number: '0x10000', timestamp: toQuantity(Math.floor(priceNow / 1000)), hash: id('newest') };
const rblx = '0xF0C4BF4C582cb3836e98394b1d4e7B7281101bE8', deployment = { chainId: 4663, contractAddress: rblx };
let generatedAt = new Date(priceNow).toISOString(), multiplier = '1', liquidity = 20000n * 10n ** 18n, varied = false, wrongAsset = false;
const poolRuntime = readFileSync(new URL('./fixtures/store-pool-runtime.hex', import.meta.url), 'utf8').trim();
assert.equal(keccak256(poolRuntime), '0xbd3881180b547f5fe817545743cfb4343e96b1bc6640dcd70c106b0066e95626');
let bid = '1', ask = '1.01', halted = false, managerRuntime = poolRuntime;
const pricingRpc = async (method, params) => {
  if (method === 'eth_getCode') return managerRuntime;
  if (method === 'eth_getBlockByNumber') { const offset = Number(BigInt(newest.number) - BigInt(params[0])); return offset === 0 ? newest : { number: params[0], timestamp: toQuantity(Math.floor(priceNow / 1000) - offset / 10), hash: id(String(offset)) }; }
  if (method === 'eth_getStorageAt') return toBeHex(params[1].endsWith('efed') ? liquidity : varied && params[2].blockHash === newest.hash ? 2n ** 97n : 2n ** 96n, 32);
  throw Error(method);
};
const fetchJson = async url => url.endsWith('/assets') ? { assets: [{ tokenSymbol: 'RBLX', deployments: [deployment], status: 'ASSET_STATUS_ACTIVE', currentMultiplier: multiplier }] }
  : { quotes: [{ tokenSymbol: 'RBLX', deployments: [wrongAsset ? { ...deployment, chainId: 1 } : deployment], currency: 'USD', isTradingHalt: halted, generatedAt, bid, ask }] };
const quote = purpose => readStorePrice({ rpc: pricingRpc, block: newest, now: priceNow, fetchJson, purpose });
assert.equal((await quote()).usdWei, parseUnits('1', 18).toString());
multiplier = '2'; assert.equal((await quote()).usdWei, parseUnits('2', 18).toString()); multiplier = '1';
generatedAt = new Date(priceNow - 90001).toISOString(); await assert.rejects(quote()); generatedAt = new Date(priceNow).toISOString();
wrongAsset = true; await assert.rejects(quote()); wrongAsset = false;
liquidity = 1n; await assert.rejects(quote()); liquidity = 20000n * 10n ** 18n;
bid = '39'; ask = '61';
assert.equal((await quote('holdings')).usdWei, parseUnits('39', 18).toString(), 'wide-spread holdings use the issuer bid, never the ask or midpoint');
multiplier = '2'; assert.equal((await quote('holdings')).usdWei, parseUnits('78', 18).toString()); multiplier = '1';
const payoutPrice = await quote('payout');
assert.equal(payoutPrice.usdWei, parseUnits('61', 18).toString(), 'wide-spread payouts use the issuer ask');
assert.equal(payoutPrice.rblxUsdWei, parseUnits('61', 18).toString()); assert.match(payoutPrice.source, /Highest.*ask/);
multiplier = '2'; assert.equal((await quote('payout')).usdWei, parseUnits('122', 18).toString()); multiplier = '1';
bid = '10';
for (const [cents, legacy] of [[200, false], [1000, false], [500, true], [3000, true]])
  assert.equal(treasureUsdAmount(cents, (await quote('payout')).usdWei, legacy), treasureUsdAmount(cents, payoutPrice.usdWei, legacy), 'a lower issuer bid cannot inflate new or historical MOSS payouts');
bid = '39'; varied = true;
assert.equal((await quote('payout')).usdWei, parseUnits('244', 18).toString(), 'payouts use the highest of the three finalized pool samples'); varied = false;
liquidity = 200n * 10n ** 18n;
await assert.rejects(quote('payout'), /virtual quote liquidity/, 'payouts still require $10k of liquidity at the bid, even when the ask exceeds $10k'); liquidity = 20000n * 10n ** 18n;
for (const purpose of [undefined, 'payment', 'unknown']) await assert.rejects(quote(purpose), /spread is too wide/, 'only explicit holdings and payouts bypass the payment spread guard');
for (const purpose of ['holdings', 'payout']) {
for (const [badBid, badAsk] of [['0', '61'], ['39', '0'], ['39', '38'], ['invalid', '61'], ['39', 'NaN']]) {
  bid = badBid; ask = badAsk; await assert.rejects(quote(purpose), /invalid|Invalid/);
}
bid = '39'; ask = '61';
for (const offset of [-90001, 15001]) { generatedAt = new Date(priceNow + offset).toISOString(); await assert.rejects(quote(purpose), /fresh Robinhood/); }
generatedAt = new Date(priceNow).toISOString();
halted = true; await assert.rejects(quote(purpose), /fresh Robinhood/); halted = false;
wrongAsset = true; await assert.rejects(quote(purpose), /fresh Robinhood/); wrongAsset = false;
multiplier = '0'; await assert.rejects(quote(purpose), /invalid/); multiplier = '1';
managerRuntime = '0x00'; await assert.rejects(quote(purpose), /pool deployment/); managerRuntime = poolRuntime;
liquidity = 1n; await assert.rejects(quote(purpose), /virtual quote liquidity/); liquidity = 20000n * 10n ** 18n;
}
bid = '1'; ask = '1.01';
varied = true; assert.equal((await quote()).usdWei, parseUnits('1', 18).toString(), 'price movement does not block quotes; retain the lowest finalized sample');
for (const purpose of [undefined, 'holdings', 'payout']) {
  let sampled = false;
  await assert.rejects(readStorePrice({ block: newest, now: priceNow, fetchJson, purpose, rpc: async (method, params) => {
    const value = await pricingRpc(method, params);
    if (method === 'eth_getStorageAt') sampled = true;
    return method === 'eth_getBlockByNumber' && sampled ? { ...value, hash: id('orphaned-price-sample') } : value;
  } }), /price history changed/, 'cached pool samples still require fresh canonical history after all samples are read');
}
// Optional read-only integration with the current live pool and issuer quote.
if (process.argv.includes('--live')) {
  const liveRpc = async (method, params) => {
    const response = await fetch('https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(12000) });
    const result = await response.json(); if (result.error) throw Error(result.error.message); return result.result;
  };
  const liveBlock = await liveRpc('eth_getBlockByNumber', ['finalized', false]);
  const livePrice = await readStorePrice({ rpc: liveRpc, block: liveBlock });
  assert(BigInt(livePrice.usdWei) > 0n); console.log(`Live read-only MOSS/USD price: ${livePrice.usdWei} / 1e18; window ${livePrice.sampleWindowSeconds}s.`);
  const code = await liveRpc('eth_getCode', ['0x8366a39CC670B4001A1121B8F6A443A643e40951', 'finalized']);
  assert.equal(code, poolRuntime, 'live pool still matches the offline fixture');
}
console.log('Store chain passed: real MOSS supply burn including $50, exact allowance, signatures/identities/deadlines, replay rejection, processed/finalized recovery, v1/v2 cutover, staged quote disablement and exact-address v3 activation, reorg/re-inclusion, stale or unavailable RPC preservation, canonical receipts, deployment fingerprints, USD rounding, issuer freshness/identity/multiplier, virtual liquidity and volatile-market pricing. No funds sent.');
