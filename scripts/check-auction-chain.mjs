import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEVM } from '@ethereumjs/evm';
import { createCustomCommon, Mainnet, Hardfork } from '@ethereumjs/common';
import { Account, bytesToHex, createAddressFromString, hexToBytes } from '@ethereumjs/util';
import { AbiCoder, Wallet, TypedDataEncoder, ZeroAddress, ZeroHash, id } from 'ethers';
import { compileAuctionContract } from './build-auction-contract.mjs';
import { createAuctionChain, auctionInterface as abi, AUCTION_ORDER_TYPES, auctionPriceWei } from '../src/auction-chain.mjs';

// Deploy and execute the actual compiled Solidity locally; no network transactions or funded keys.
const artifact = compileAuctionContract();
assert.deepEqual(artifact, JSON.parse(readFileSync(new URL('../public/contracts/MossvaleAuction.json', import.meta.url), 'utf8')));
const authority = Wallet.createRandom(), buyer = Wallet.createRandom(), seller = Wallet.createRandom(), other = Wallet.createRandom();
const common = createCustomCommon({ chainId: 4663 }, Mainnet, { hardfork: Hardfork.Paris });
const evm = await createEVM({ common }), account = wallet => createAddressFromString(wallet.address);
for (const wallet of [authority, buyer, seller, other]) await evm.stateManager.putAccount(account(wallet), new Account(0n, 10n ** 20n));
let timestamp = 1000;
const block = () => ({ header: { number: 100n, timestamp: BigInt(timestamp), coinbase: createAddressFromString(ZeroAddress),
  difficulty: 0n, prevRandao: new Uint8Array(32), gasLimit: 30000000n, getBlobGasPrice: () => undefined } });
const deployed = await evm.runCall({ caller: account(authority), data: hexToBytes(artifact.bytecode + AbiCoder.defaultAbiCoder().encode(['address'], [authority.address]).slice(2)), gasLimit: 3000000n, block: block() });
assert.equal(deployed.execResult.exceptionError, undefined, 'contract deploys');
const contract = deployed.createdAddress, contractAddress = contract.toString();
assert.equal(bytesToHex(await evm.stateManager.getCode(contract)), artifact.deployedBytecode);
async function call(wallet, name, args = [], value = 0n, isStatic = false) {
  return evm.runCall({ caller: account(wallet), to: contract, data: hexToBytes(abi.encodeFunctionData(name, args)), value, gasLimit: 1000000n, block: block(), isStatic });
}
async function read(name, args) { const result = await call(other, name, args, 0n, true); assert.equal(result.execResult.exceptionError, undefined); return abi.decodeFunctionResult(name, bytesToHex(result.execResult.returnValue))[0]; }
const domain = { name: 'MossvaleAuction', version: '1', chainId: 4663, verifyingContract: contractAddress };
const order = { listingId: id('offline-listing'), buyer: buyer.address, seller: seller.address, priceWei: '1000000000000000', deadline: 1300, chainId: 4663, contract: contractAddress };
const signature = await authority.signTypedData(domain, AUCTION_ORDER_TYPES, order);
const rejected = async (wallet, change = {}, sig = signature, value = BigInt(order.priceWei)) => {
  const result = await call(wallet, 'buy', [{ ...order, ...change }, sig], value);
  assert.ok(result.execResult.exceptionError, 'invalid payment rejected');
  assert.equal(await read('paidOrders', [order.listingId]), ZeroHash);
  assert.equal(await read('proceeds', [seller.address]), 0n);
};
await rejected(other); // buyer front-running does not capture the item or money
await rejected(buyer, {}, signature, BigInt(order.priceWei) - 1n);
await rejected(buyer, {}, signature, BigInt(order.priceWei) + 1n);
await rejected(buyer, { seller: other.address });
await rejected(buyer, {}, await other.signTypedData(domain, AUCTION_ORDER_TYPES, order));
await rejected(buyer, {}, await authority.signTypedData({ ...domain, chainId: 46630 }, AUCTION_ORDER_TYPES, order));
await rejected(buyer, {}, await authority.signTypedData({ ...domain, verifyingContract: other.address }, AUCTION_ORDER_TYPES, order));
await rejected(buyer, {}, '0x1234');
timestamp = 1301; await rejected(buyer); timestamp = 1000;
const purchase = await call(buyer, 'buy', [order, signature], BigInt(order.priceWei));
assert.equal(purchase.execResult.exceptionError, undefined, 'valid purchase executes');
const digest = TypedDataEncoder.hash(domain, AUCTION_ORDER_TYPES, order);
assert.equal(await read('paidOrders', [order.listingId]), digest);
assert.equal(await read('proceeds', [seller.address]), BigInt(order.priceWei));
assert.ok((await call(buyer, 'buy', [order, signature], BigInt(order.priceWei))).execResult.exceptionError, 'replay rejected');
assert.equal(await read('proceeds', [seller.address]), BigInt(order.priceWei), 'one credit only');
assert.ok((await call(other, 'withdraw', [other.address])).execResult.exceptionError, 'other wallet cannot withdraw proceeds');
await evm.stateManager.putCode(account(other), hexToBytes('0x60006000fd'));
assert.ok((await call(seller, 'withdraw', [other.address])).execResult.exceptionError, 'reverting recipient does not lose proceeds');
assert.equal(await read('proceeds', [seller.address]), BigInt(order.priceWei));
await evm.stateManager.putCode(account(other), new Uint8Array());
const balance = (await evm.stateManager.getAccount(account(other))).balance;
assert.equal((await call(seller, 'withdraw', [other.address])).execResult.exceptionError, undefined);
assert.equal((await evm.stateManager.getAccount(account(other))).balance, balance + BigInt(order.priceWei));
assert.equal(await read('proceeds', [seller.address]), 0n);

// Exercise processed/finalized snapshots and actual contract event bytes without broadcasting.
const transactionHash = id('offline-transaction'), blockHash = id('offline-block');
let chain = '0x1237', finalizedTime = 1000, code = artifact.deployedBytecode, finalizedPaid = false, canonicalHash = blockHash;
let latestHash = id('offline-latest-block'), latestPaid = false, latestTime, latestNumber = '0x65', unavailableAnchor = false, reorgDuringLatestRead = false, receiptReads = 0;
let receipt = { status: '0x1', from: buyer.address, to: contractAddress, transactionHash, blockNumber: '0x64', blockHash,
  logs: purchase.execResult.logs.map(([address, topics, data]) => ({ address: bytesToHex(address), topics: topics.map(bytesToHex), data: bytesToHex(data) })) };
const rpc = async (method, params) => {
  if (method === 'eth_chainId') return chain;
  if (method === 'eth_getCode') return code;
  if (method === 'eth_getBlockByNumber') {
    if (params[0] === '0x65' && unavailableAnchor) return null;
    return ['latest', '0x65'].includes(params[0])
      ? { hash: latestHash, number: latestNumber, timestamp: `0x${(latestTime ?? finalizedTime).toString(16)}` }
      : { hash: params[0] === '0x64' ? canonicalHash : blockHash, number: '0x64', timestamp: `0x${finalizedTime.toString(16)}` };
  }
  if (method === 'eth_getTransactionReceipt') { receiptReads++; return receipt; }
  if (method === 'eth_call') {
    const parsed = abi.parseTransaction({ data: params[0].data });
    if (parsed.name === 'paidOrders') {
      assert.equal(params[1].requireCanonical, true);
      const latestRead = params[1].blockHash === latestHash, paid = latestRead ? latestPaid : finalizedPaid;
      if (latestRead && reorgDuringLatestRead) {
        if (reorgDuringLatestRead === 'finalized') canonicalHash = id('offline-finality-during-read');
        else latestHash = id('offline-reorg-during-read');
        reorgDuringLatestRead = false;
      }
      return abi.encodeFunctionResult('paidOrders', [paid ? digest : ZeroHash]);
    }
    return abi.encodeFunctionResult('authority', [authority.address]);
  }
  throw Error(`Unexpected RPC method ${method}`);
};
const settlement = createAuctionChain({ contract: contractAddress, authorityKey: authority.privateKey, chainId: 4663, rpc });
assert.equal((await createAuctionChain({ authorityKey: '', contract: '' }).status()).enabled, false);
assert.equal((await settlement.status()).enabled, true);
chain = '0x1'; assert.equal((await settlement.status()).enabled, false); chain = '0x1237';
code = '0x6000'; assert.equal((await settlement.status()).enabled, false); code = artifact.deployedBytecode;
assert.equal((await settlement.settlement(order, finalizedTime * 1000)).state, 'pending');
latestTime = 1301;
assert.equal((await settlement.settlement(order, latestTime * 1000)).state, 'pending', 'latest expiry cannot release escrow before finality');
latestTime = undefined; latestPaid = true;
latestTime = finalizedTime + 1901;
assert.equal((await settlement.settlement(order, latestTime * 1000)).state, 'paid', 'fresh canonical payment settles while finality lags over 30 minutes');
latestPaid = false;
await assert.rejects(settlement.settlement(order, latestTime * 1000), /stale or inconsistent/, 'stale finality cannot prove unpaid expiry');
latestTime = undefined; latestPaid = true;
const processed = await settlement.settlement(order, finalizedTime * 1000);
assert.equal(processed.state, 'paid', 'canonical processed contract state settles immediately without a client transaction hash');
assert.equal(processed.blockHash, latestHash); assert.equal(processed.blockNumber, '0x65');
const saved = { ...order, paymentBlock: { hash: processed.blockHash, number: processed.blockNumber } };
receipt = { ...receipt, blockHash: latestHash, blockNumber: '0x65' };
const originalSettlement = settlement.settlement;
let releaseSettlement;
const resumedSettlement = new Promise(resolve => { releaseSettlement = resolve; });
settlement.settlement = async (...args) => { await resumedSettlement; return originalSettlement.apply(settlement, args); };
const verifyingPayment = settlement.verifyPayment(saved, transactionHash, finalizedTime * 1000);
try { assert.equal(receiptReads, 1, 'receipt lookup overlaps independent canonical settlement verification'); }
finally { releaseSettlement(); settlement.settlement = originalSettlement; }
assert.equal((await verifyingPayment).state, 'paid');
const validReceipt = receipt;
receipt = null; await assert.rejects(settlement.verifyPayment(saved, transactionHash, finalizedTime * 1000), /receipt/, 'missing receipt cannot verify a submitted hash'); receipt = validReceipt;
receipt.status = '0x0'; await assert.rejects(settlement.verifyPayment(saved, transactionHash, finalizedTime * 1000), /receipt/); receipt.status = '0x1';
latestPaid = false;
await assert.rejects(settlement.settlement(saved, finalizedTime * 1000), /missing from its canonical chain/, 'missing payment under an unchanged anchor is not proof of reorg');
unavailableAnchor = true;
await assert.rejects(settlement.settlement(saved, finalizedTime * 1000), /unavailable/, 'an unavailable anchor preserves delivery'); unavailableAnchor = false;
latestHash = id('offline-reorganized-head');
await assert.rejects(settlement.settlement(saved, 2000000), /stale/, 'stale unpaid state cannot revoke delivery');
latestNumber = '0x63'; await assert.rejects(settlement.settlement(saved, finalizedTime * 1000), /stale or inconsistent/, 'lagging heads cannot revoke delivery'); latestNumber = '0x65';
reorgDuringLatestRead = true;
await assert.rejects(settlement.settlement(saved, finalizedTime * 1000), /changed during verification/, 'unpaid latest state must still be canonical after the anchor check');
reorgDuringLatestRead = 'finalized';
await assert.rejects(settlement.settlement(saved, finalizedTime * 1000), /changed during verification/, 'the finalized snapshot must remain canonical through latest verification'); canonicalHash = blockHash;
const revoked = await settlement.settlement(saved, finalizedTime * 1000);
assert.equal(revoked.state, 'pending'); assert.equal(revoked.revoked, true, 'orphaned anchor and fresh canonical unpaid state revoke delivery');
latestPaid = true;
const reanchored = await settlement.settlement(saved, finalizedTime * 1000);
assert.equal(reanchored.state, 'paid'); assert.equal(reanchored.reanchored, true); assert.equal(reanchored.blockHash, latestHash, 're-included payment keeps delivery with its new anchor');
latestPaid = false; receipt = { ...receipt, blockHash, blockNumber: '0x64' };
await assert.rejects(settlement.settlement({ ...order, chainId: 46630 }, finalizedTime * 1000), 'configuration changes cannot release old escrow');
await assert.rejects(settlement.settlement({ ...order, contract: other.address }, finalizedTime * 1000), 'original contract is required for settlement');
finalizedTime = 1300; assert.equal((await settlement.settlement(order, finalizedTime * 1000)).state, 'pending', 'deadline is inclusive');
finalizedTime = 1301; assert.equal((await settlement.settlement(order, finalizedTime * 1000)).state, 'expired', 'only finalized expiry releases escrow');
assert.equal((await settlement.settlement(saved, finalizedTime * 1000)).revoked, true, 'orphaned payment can be rolled back at finalized expiry');
latestPaid = true; await assert.rejects(settlement.settlement(saved, finalizedTime * 1000), /conflicts with finalized expiry/); latestPaid = false;
finalizedPaid = true; assert.equal((await settlement.settlement(order, finalizedTime * 1000)).state, 'paid', 'earlier payment wins even after expiry');
assert.equal((await settlement.verifyPayment(order, transactionHash, finalizedTime * 1000)).state, 'paid');
receipt.status = '0x0'; await assert.rejects(settlement.verifyPayment(order, transactionHash, finalizedTime * 1000)); receipt.status = '0x1';
receipt.from = other.address; await assert.rejects(settlement.verifyPayment(order, transactionHash, finalizedTime * 1000)); receipt.from = buyer.address;
receipt.to = other.address; await assert.rejects(settlement.verifyPayment(order, transactionHash, finalizedTime * 1000)); receipt.to = contractAddress;
canonicalHash = id('reorg'); await assert.rejects(settlement.verifyPayment(order, transactionHash, finalizedTime * 1000)); canonicalHash = blockHash;
const log = receipt.logs[0];
receipt.logs = [abi.encodeEventLog(abi.getEvent('Purchased'), [order.listingId, digest, buyer.address, seller.address, 1n])].map(value => ({ ...value, address: contractAddress }));
await assert.rejects(settlement.verifyPayment(order, transactionHash, finalizedTime * 1000), 'wrong amount rejected'); receipt.logs = [log];
await assert.rejects(settlement.settlement({ ...order, priceWei: '2' }, finalizedTime * 1000), 'different order keeps escrow locked');
// Overlapping listings must not let a slow earlier snapshot replace a newer observation.
for (const heldState of ['finalized', 'latest']) {
  let finalNumber = '0x64', headNumber = '0x65', held = false, release, reached;
  const paused = new Promise(resolve => { reached = resolve; }), resume = new Promise(resolve => { release = resolve; });
  const raceBlock = number => ({ number, hash: id(`race-${number}`), timestamp: '0x3e8' });
  const concurrent = createAuctionChain({ contract: contractAddress, authorityKey: authority.privateKey, chainId: 4663, rpc: async (method, params) => {
    if (method === 'eth_getBlockByNumber') return raceBlock(params[0] === 'finalized' ? finalNumber : params[0] === 'latest' ? headNumber : params[0]);
    if (method === 'eth_call' && abi.parseTransaction({ data: params[0].data }).name === 'paidOrders') {
      if (!held && params[1].blockHash === raceBlock(heldState === 'finalized' ? '0x64' : '0x65').hash) { held = true; reached(); await resume; }
      return abi.encodeFunctionResult('paidOrders', [ZeroHash]);
    }
    return rpc(method, params);
  } });
  const older = concurrent.settlement(order, 1000000);
  await paused;
  if (heldState === 'finalized') finalNumber = '0x65';
  headNumber = '0x66';
  assert.equal((await concurrent.settlement(order, 1000000)).state, 'pending');
  release();
  await assert.rejects(older, /regressed|stale or inconsistent/, `overlapping ${heldState} reads cannot regress the observed chain`);
}
finalizedTime = 1000;
const prepared = await settlement.prepareOrder({ listingId: 'new-order', buyer: buyer.address, seller: seller.address, priceWei: '123' }, 1000000);
assert.equal(prepared.deadline, 1300); assert.equal(prepared.transaction.value, '0x7b');
assert.equal(abi.parseTransaction({ data: prepared.transaction.data }).name, 'buy');
await assert.rejects(settlement.prepareOrder({ listingId: 'clock', buyer: buyer.address, seller: seller.address, priceWei: '123' }, 2000000), 'stale RPC clock fails closed');
assert.equal(auctionPriceWei('0.000000000000000001'), '1');
for (const value of ['0', '-1', '1e2', '1.0000000000000000001', ' 1', 1]) assert.throws(() => auctionPriceWei(value));
const challenge = settlement.challenge('hero', buyer.address, 'https://game.example', 1000);
const walletSignature = await buyer.signMessage(challenge.message);
assert.equal(settlement.verifyWallet('hero', walletSignature, 'https://game.example', 2000), buyer.address);
assert.throws(() => settlement.verifyWallet('hero', walletSignature, 'https://game.example', 2000), 'wallet challenge cannot replay');
const wrong = settlement.challenge('hero', buyer.address, 'https://game.example', 1000);
assert.throws(() => settlement.verifyWallet('hero', walletSignature, 'https://game.example', 2000), 'old signature cannot confirm a new challenge');
settlement.challenge('hero', buyer.address, 'https://game.example', 1000);
assert.throws(() => settlement.verifyWallet('hero', walletSignature, 'https://other.example', 2000));
settlement.challenge('hero', buyer.address, 'https://game.example', 1000);
assert.throws(() => settlement.verifyWallet('hero', walletSignature, 'https://game.example', 400000));
console.log('Auction chain: local EVM purchase/withdrawal, processed delivery, anchored rollback/re-inclusion, stale RPC guards, finalized expiry, receipt validation and wallet proof passed. No on-chain transaction sent.');
