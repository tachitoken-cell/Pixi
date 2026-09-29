import assert from 'node:assert/strict';
import { BrowserProvider, hexlify, toUtf8Bytes, Wallet, verifyMessage } from 'ethers';
import { createTurnkeyProvider, walletCancelled } from '../src/turnkey-provider.ts';

const wallet = new Wallet(`0x${'11'.repeat(32)}`), destination = `0x${'22'.repeat(20)}`, hash = `0x${'ab'.repeat(32)}`;
let active = true, reject = false, prompts = 0, funding = 0, sends = 0, acks = 0, sent;
const approvals = [];
const session = {
  accounts: async () => active ? [{ address: wallet.address, walletId: 'wallet' }] : [],
  signMessage: async hex => wallet.signMessage(Buffer.from(hex.slice(2), 'hex')),
  configureSponsorRpc: () => assert.fail('Selecting a provider must not replace the shared recovery RPC'),
  sendTransaction: async (transaction, rpc) => { await rpc({ method: 'wallet_prepareCalls', params: [] }); sends++; sent = transaction; return hash; },
  acknowledgeTransaction: async value => { assert.equal(value, hash); acks++; },
};
const provider = createTurnkeyProvider(session, wallet.address, {
  approve: async request => { approvals.push(request); prompts++; if (reject) throw walletCancelled(); },
  walletRpc: async () => { funding++; return { ok: true }; },
  rpc: async (method, params) => { assert.equal(method, 'eth_getBalance'); assert.deepEqual(params, [wallet.address, 'latest']); return '0x0'; },
});
const ethers = new BrowserProvider(provider), signer = await ethers.getSigner();
assert.equal(await signer.getAddress(), wallet.address);
const text = 'Mossvale wallet\nThis links your wallet. It does not authorize a payment.';
assert.equal(verifyMessage(text, await signer.signMessage(text)), wallet.address, 'ethers personal_sign uses EIP-191, preserving existing linking');
assert.equal(funding, 0, 'ownership signatures do not request sponsorship or move ETH');
assert.equal(await provider.request({ method: 'eth_getBalance', params: [wallet.address, 'latest'] }), '0x0');
const transaction = { from: wallet.address, to: destination, data: '0x1234', value: '0x0', chainId: '0x1237' };
assert.equal(await provider.request({ method: 'eth_sendTransaction', params: [transaction] }), hash);
assert.deepEqual(sent, { ...transaction, value: '0', chainId: 4663 });
assert.equal(funding, 1); assert.equal(sends, 1); assert.equal(acks, 1);
for (const changes of [{ from: destination }, { chainId: '0x1' }, { value: '-1' }, { data: 'oops' }, { authorizationList: [] }]) {
  await assert.rejects(provider.request({ method: 'eth_sendTransaction', params: [{ ...transaction, ...changes }] }));
}
for (const method of ['eth_sign', 'eth_signTypedData_v4', 'eth_sendRawTransaction', 'wallet_grantPermissions']) await assert.rejects(provider.request({ method, params: [] }), error => error.code === 4200);
assert.equal(sends, 1, 'invalid requests never reach sponsorship or signing');
reject = true;
await assert.rejects(provider.request({ method: 'eth_sendTransaction', params: [transaction] }), error => error.code === 4001 && error.transactionNotSubmitted === true);
assert.equal(funding, 1, 'rejection leaves sponsorship untouched');
reject = false; active = false;
await assert.rejects(provider.request({ method: 'personal_sign', params: [hexlify(toUtf8Bytes(text)), wallet.address] }), /session changed/);
assert.equal(sends, 1); assert.equal(prompts, 3);

// Auction display context is copied before connection checks yield, and never enters RPC calldata.
active = true;
const auctionPurchase = { item: { kind: 'resource', id: 'wood', quantity: 5 }, listingId: 'listing', contract: destination, price: '12.5' };
const expectedPurchase = structuredClone(auctionPurchase);
const purchase = provider.request({ method: 'eth_sendTransaction', params: [transaction], auctionPurchase });
auctionPurchase.item.quantity = 99; auctionPurchase.price = '999';
assert.equal(await purchase, hash);
assert.deepEqual(approvals.at(-1).auctionPurchase, expectedPurchase, 'later caller mutation cannot change the reviewed item or price');
assert.notEqual(approvals.at(-1).auctionPurchase.item, auctionPurchase.item);
assert.deepEqual(sent, { ...transaction, value: '0', chainId: 4663 }, 'display metadata is not passed into the transaction');
await provider.request({ method: 'eth_sendTransaction', params: [transaction] });
assert(!Object.hasOwn(approvals.at(-1), 'auctionPurchase'), 'ordinary sends and withdrawals have no auction display context');
const ownershipMessage = hexlify(toUtf8Bytes(text));
await provider.request({ method: 'personal_sign', params: [ownershipMessage, wallet.address], auctionPurchase: expectedPurchase });
assert.deepEqual(approvals.at(-1), { message: ownershipMessage }, 'auction context is not forwarded for a signature request');
let auctionOpen = true;
const auctionProvider = createTurnkeyProvider(session, wallet.address, { approve: async () => {}, walletRpc: async () => { if (!auctionOpen) throw walletCancelled(); } });
auctionOpen = false;
await assert.rejects(auctionProvider.request({ method: 'eth_sendTransaction', params: [transaction] }), error => error.code === 4001);
const beforeIndependent = funding;
await provider.request({ method: 'eth_sendTransaction', params: [transaction] });
assert.equal(funding, beforeIndependent + 1, 'closing provider A cannot replace or poison provider B sponsorship transport');
const batch = { ...transaction, approval: { to: destination, data: '0xabcd', value: '0x0' } };
const beforeBatchPrompts = prompts, beforeBatchSends = sends;
const batchRequest = provider.request({ method: 'eth_sendTransaction', params: [batch], auctionPurchase: expectedPurchase });
batch.approval.data = '0xdead';
assert.equal(await batchRequest, hash);
assert.deepEqual(sent.approval, { to: destination, data: '0xabcd', value: '0' }, 'nested approval is copied before any asynchronous account check');
assert.deepEqual(approvals.at(-1).transaction, sent); assert.equal(prompts, beforeBatchPrompts + 1); assert.equal(sends, beforeBatchSends + 1);
const goodBatch = { ...transaction, approval: { to: destination, data: '0xabcd', value: '0' } };
for (const bad of [
  { ...goodBatch, value: '1' },
  ...[{ ...goodBatch.approval, value: '1' }, { ...goodBatch.approval, chainId: 4663 }, { ...goodBatch.approval, data: '0x1' }].map(approval => ({ ...goodBatch, approval })),
]) await assert.rejects(provider.request({ method: 'eth_sendTransaction', params: [bad], auctionPurchase: expectedPurchase }));
await assert.rejects(provider.request({ method: 'eth_sendTransaction', params: [goodBatch] }), /purchase approval/);
assert.equal(prompts, beforeBatchPrompts + 1, 'invalid or unreviewable batches never open a confirmation');
assert.equal(sends, beforeBatchSends + 1);
const sendTransaction = session.sendTransaction, acksBeforePreparationFailure = acks;
const preparationFailure = Object.assign(Error('The daily sponsorship limit has been reached.'), { transactionNotSubmitted: true });
session.sendTransaction = async () => { throw preparationFailure; };
await assert.rejects(provider.request({ method: 'eth_sendTransaction', params: [goodBatch], auctionPurchase: expectedPurchase }), error => error === preparationFailure, 'the provider preserves trusted no-submission classification');
assert.equal(acks, acksBeforePreparationFailure, 'rejected preparation cannot acknowledge a journal');
session.sendTransaction = sendTransaction;
// Only failures before the session handoff can safely release a fresh purchase for explicit retry.
for (const stage of ['accounts', 'review', 'recheck']) {
  const failure = Error(`${stage} unavailable`); let accountChecks = 0, handedOff = false;
  const guarded = createTurnkeyProvider({ ...session,
    accounts: async () => { if (stage === 'accounts' || stage === 'recheck' && ++accountChecks === 2) throw failure; return [{ address: wallet.address }]; },
    sendTransaction: async () => { handedOff = true; return hash; },
  }, wallet.address, { approve: async () => { if (stage === 'review') throw failure; }, walletRpc: async () => ({}) });
  await assert.rejects(guarded.request({ method: 'eth_sendTransaction', params: [transaction] }), error => error === failure && error.transactionNotSubmitted === true);
  assert.equal(handedOff, false, `${stage} failure never signs, resumes or submits an operation`);
}
for (const stage of ['send', 'acknowledge', 'cancelled']) {
  const failure = stage === 'cancelled' ? walletCancelled() : Error(`${stage} connection lost`);
  const uncertain = createTurnkeyProvider({ ...session,
    sendTransaction: async () => { if (stage !== 'acknowledge') throw failure; return hash; },
    acknowledgeTransaction: async () => { throw failure; },
  }, wallet.address, { approve: async () => {}, walletRpc: async () => ({}) });
  await assert.rejects(uncertain.request({ method: 'eth_sendTransaction', params: [transaction] }), error => error === failure && error.transactionNotSubmitted === undefined,
    `${stage} uncertainty must retain the pending purchase and journal`);
}
ethers.destroy();
console.log('Turnkey provider checks passed: ethers linking, explicit approval, cancellation, account/chain isolation, bounded RPC, no sponsorship after rejection and immutable transaction-only auction context.');
