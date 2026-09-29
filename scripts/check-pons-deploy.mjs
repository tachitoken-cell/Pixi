import assert from 'node:assert/strict';
import { Transaction, Wallet, id, keccak256 } from 'ethers';
import { sendStep } from './deploy-pons.mjs';

// Real offline signatures, fake RPC; no funded wallet and no network submission.
const wallet = Wallet.createRandom();
const request = { to: '0x000000000000000000000000000000000000dEaD', data: '0x', value: 1n, chainId: 4663 };
const clone = value => JSON.parse(JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item));
function fixture() {
  const test = { journal: { wallet: wallet.address, chainId: 4663, maxFeePerGas: '1000000000', maxPriorityFeePerGas: '1000000', steps: {} },
    signed: 0, sent: [], saved: [], waits: [], latestNonce: 0, pendingNonce: 0, pending: null, receipt: null, loseResponse: false, acceptedBeforeLoss: false, status: 1, canonical: true };
  test.signer = { address: wallet.address, signTransaction: transaction => { test.signed++; return wallet.signTransaction(transaction); } };
  test.persist = journal => { test.saved.push(clone(journal)); };
  const mined = hash => ({ hash, status: test.status, blockNumber: 42, blockHash: id('canonical block'), gasUsed: 21000n,
    from: wallet.address, to: request.to, confirmations: async () => 2 });
  test.rpc = {
    getNetwork: async () => ({ chainId: 4663n }),
    getTransactionCount: async (_address, tag) => tag === 'pending' ? test.pendingNonce : test.latestNonce,
    estimateGas: async () => 21000n,
    getBalance: async () => 10n ** 18n,
    getTransactionReceipt: async () => test.receipt,
    getTransaction: async () => test.pending,
    getBlockNumber: async () => 43,
    getBlock: async () => ({ hash: id(test.canonical ? 'canonical block' : 'replacement block'), number: 42 }),
    broadcastTransaction: async raw => {
      assert.equal(test.saved.at(-1).steps.swap.raw, raw, 'signed transaction persisted before any submission');
      test.sent.push(raw);
      if (test.loseResponse) {
        test.loseResponse = false;
        if (test.acceptedBeforeLoss) test.pending = { hash: keccak256(raw) };
        throw Error('RPC response lost');
      }
      test.pending = { hash: keccak256(raw) };
      return test.pending;
    },
    waitForTransaction: async (hash, confirmations) => { test.waits.push(confirmations); return test.receipt = mined(hash); },
  };
  test.run = (transaction = request) => sendStep(test.journal, test.signer, 'swap', transaction, test.rpc, test.persist);
  return test;
}

const resumed = fixture();
resumed.loseResponse = true;
await assert.rejects(resumed.run(), /response lost/);
assert.equal(resumed.journal.steps.swap.status, 'signed');
const original = resumed.journal.steps.swap.raw;
resumed.journal = clone(resumed.saved.at(-1)); // Resume from precisely what survives process exit.
await resumed.run();
assert.equal(resumed.signed, 1, 'resume never signs a second transaction');
assert.deepEqual(resumed.sent, [original, original], 'lost response only permits identical raw retransmission');
const signed = Transaction.from(original);
assert.equal(signed.chainId, 4663n);
assert.equal(signed.from, wallet.address);
assert.equal(signed.to, request.to);
assert.equal(signed.value, 1n);
assert.equal(resumed.journal.steps.swap.status, 'confirmed');
const waitsBeforeResume = resumed.waits.length;
await resumed.run();
assert.equal(resumed.sent.length, 2, 'confirmed step cannot spend again');
assert.equal(resumed.signed, 1);
assert.equal(resumed.waits.length, waitsBeforeResume + 1, 'already-mined receipts still require confirmation checks');
assert.ok(resumed.waits.every(confirmations => confirmations >= 2));

const accepted = fixture(); accepted.loseResponse = accepted.acceptedBeforeLoss = true;
await assert.rejects(accepted.run(), /response lost/);
await accepted.run();
assert.equal(accepted.sent.length, 1, 'pending acceptance discovered after a lost response is not rebroadcast');
assert.equal(accepted.signed, 1);

const pending = fixture(); pending.pendingNonce = 1;
await assert.rejects(pending.run(), /pending/i);
assert.equal(pending.signed, 0);
assert.equal(pending.sent.length, 0);

const reverted = fixture(); reverted.status = 0;
await assert.rejects(reverted.run(), /reverted/i);
assert.equal(reverted.journal.steps.swap.status, 'reverted');
await assert.rejects(reverted.run(), /reverted/i);
assert.equal(reverted.sent.length, 1, 'reverted step requires inspection, not a fresh spend');

for (const corrupt of [
  test => { test.journal.steps.swap.hash = id('wrong transaction'); },
  test => { test.journal.steps.swap.nonce++; },
]) {
  const tampered = fixture(); tampered.loseResponse = true;
  await assert.rejects(tampered.run(), /response lost/);
  corrupt(tampered);
  await assert.rejects(tampered.run(), /journal|transaction|nonce|signed/i);
  assert.equal(tampered.sent.length, 1, 'corrupt journal cannot submit a transaction');
}
const changed = fixture(); changed.loseResponse = true;
await assert.rejects(changed.run(), /response lost/);
await assert.rejects(changed.run({ ...request, value: 2n }), /journal|transaction|signed/i);
assert.equal(changed.sent.length, 1, 'resume binds signed value to the requested spend');

const consumed = fixture(); consumed.loseResponse = true;
await assert.rejects(consumed.run(), /response lost/);
consumed.latestNonce = 1;
await assert.rejects(consumed.run(), /nonce/i);
assert.equal(consumed.sent.length, 1, 'another transaction consuming the nonce blocks retransmission');

const reorg = fixture(); reorg.canonical = false;
await assert.rejects(reorg.run(), /canonical|reorg|block/i);
assert.notEqual(reorg.journal.steps.swap.status, 'confirmed');
console.log('PONS deploy: persisted signatures, identical resume, no repeated spend, revert/nonce/journal guards and canonical receipts passed. No transaction sent.');
