import assert from 'node:assert/strict';
import { createGoldRound, goldRoundPayoutUsdMicros, settleGoldRound, upsertGoldRoundBid, validateGoldRound,
  GOLD_ROUND_DURATION_MS, GOLD_ROUND_BUDGET_USD_CENTS, GOLD_ROUND_MAX_PRICE_CENTS_PER_1000 } from '../src/gold-rounds.ts';
import { goldRoundArguments } from './open-gold-round.mjs';

const start = 1_900_000_000_000, contract = '0x1111111111111111111111111111111111111111';
const fresh = (changes = {}) => createGoldRound({ id: 'round-1', startsAt: start, contract, ...changes });
const offer = (characterId, gold, priceCentsPer1000) => ({ characterId, gold, priceCentsPer1000, wallet: '0x2222222222222222222222222222222222222222', realmId: 'eu' });
const add = (round, account, gold, price) => upsertGoldRoundBid(round, account, offer(`char-${account}`, gold, price), start);
let round = fresh();
assert.equal(round.endsAt, start + GOLD_ROUND_DURATION_MS);
assert.equal(round.budgetUsdCents, GOLD_ROUND_BUDGET_USD_CENTS);
assert.equal(round.maxPriceCentsPer1000, GOLD_ROUND_MAX_PRICE_CENTS_PER_1000);
assert.equal(goldRoundPayoutUsdMicros(round, 1000, 100), '1000000', '1,000 gold at $1 per 1,000 awards exactly one USD');
assert.equal(goldRoundPayoutUsdMicros(round, 1, 1), '10', 'sub-cent awards retain their full USD value');
assert(!Object.hasOwn(round, 'budgetWei'), 'the round never fixes a MOSS token pool');
round = add(round, 'expensive', 500_000, 100);
round = add(round, 'cheap', 1_000_000, 50);
round = add(round, 'middle', 1_000_000, 75);
const before = structuredClone(round), settled = settleGoldRound(round, round.endsAt);
assert.deepEqual(round, before, 'settlement does not mutate live offers');
assert.equal(settled.bids.cheap.filledGold, 1_000_000);
assert.equal(settled.bids.middle.filledGold, 666_666);
assert.equal(settled.bids.expensive.filledGold, 0);
assert.equal(settled.bids.cheap.payoutUsdMicros, '500000000');
assert.equal(settled.bids.middle.payoutUsdMicros, goldRoundPayoutUsdMicros(round, 666_666, 75));
assert.equal(settled.bids.middle.payoutUsdMicros, '499999500');
assert(!Object.hasOwn(settled.bids.cheap, 'payoutWei'), 'allocation records USD only; MOSS is priced separately');
assert.equal(settleGoldRound(settled, settled.endsAt + 1), settled, 'settlement replay is idempotent');
assert.throws(() => settleGoldRound(round, round.endsAt - 1), /not ended/);
assert.throws(() => add(settled, 'late', 1, 1), /not accepting/);
for (const now of [start - 1, round.endsAt]) assert.throws(() => upsertGoldRoundBid(round, 'late', offer('char-late', 1, 1), now), /not accepting/);

let tied = add(add(fresh(), 'first', 800_000, 100), 'second', 800_000, 100);
assert.equal(settleGoldRound(tied, tied.endsAt).bids.first.filledGold, 800_000);
tied = add(tied, 'first', 800_000, 100);
assert.equal(settleGoldRound(tied, tied.endsAt).bids.first.filledGold, 200_000, 'editing resets equal-price priority');
assert.equal(settleGoldRound(tied, tied.endsAt).bids.second.filledGold, 800_000);
assert.equal(Object.keys(tied.bids).length, 2, 'an edit replaces the account offer');
assert.throws(() => upsertGoldRoundBid(tied, 'first', offer('another-character', 1, 1), start), /original character/);
const empty = settleGoldRound(fresh(), round.endsAt);
assert.deepEqual(empty.bids, {}, 'no offers never spends the budget');
const dust = add(fresh({ budgetUsdCents: 1 }), 'only', 334, 3);
const dustResult = settleGoldRound(dust, dust.endsAt);
assert.equal(dustResult.bids.only.filledGold, 333, 'unused microUSD cannot buy an additional whole gold');
assert.equal(dustResult.bids.only.payoutUsdMicros, '9990', 'one-cent budget retains its sub-cent unspent remainder');

for (const invalid of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
  assert.throws(() => add(fresh(), 'invalid', invalid, 1));
  assert.throws(() => add(fresh(), 'invalid', 1, invalid));
}
assert.throws(() => add(fresh(), 'invalid', 1, 101));
for (const budgetUsdCents of [0, -1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '100000']) assert.throws(() => fresh({ budgetUsdCents }));
for (const contract of ['', '0x0', '0x' + '0'.repeat(40)]) assert.throws(() => fresh({ contract }));
assert.throws(() => fresh({ endsAt: start }));
assert.equal(fresh({ id: 'a'.repeat(128) }).id.length, 128);
assert.throws(() => fresh({ id: 'a'.repeat(129) }), /Invalid gold round terms/);
assert.throws(() => upsertGoldRoundBid(fresh(), '__proto__', offer('char', 1, 1), start));
assert.throws(() => upsertGoldRoundBid(fresh(), 'bad-wallet', { ...offer('char', 1, 1), wallet: contract.slice(1) }, start));
assert.throws(() => validateGoldRound({ ...settled, bids: { ...settled.bids, cheap: { ...settled.bids.cheap, payoutUsdMicros: '1' } } }));
assert.throws(() => validateGoldRound({ ...settled, budgetUsdCents: 1 }), /exceed its USD budget/);
const converted = { ...settled, budgetWei: String(1000n * 10n ** 18n), settlementPrice: { usdWei: String(10n ** 18n), observedAt: settled.endsAt },
  bids: Object.fromEntries(Object.entries(settled.bids).map(([key, bid]) => [key, { ...bid, payoutWei: String(BigInt(bid.payoutUsdMicros) * 10n ** 12n) }])) };
validateGoldRound(converted);
const locked = { ...round, closingPrice: converted.settlementPrice };
validateGoldRound(locked);
assert.deepEqual(settleGoldRound(locked, locked.endsAt).closingPrice, locked.closingPrice, 'USD allocation preserves a persisted closing quote');
validateGoldRound({ ...converted, closingPrice: converted.settlementPrice });
for (const closingPrice of [null, {}, { usdWei: '0', observedAt: start }, { usdWei: String(2n ** 256n), observedAt: start },
  { usdWei: '1', observedAt: 0 }, { usdWei: '1', observedAt: Number.MAX_SAFE_INTEGER + 1 }]) {
  assert.throws(() => validateGoldRound({ ...round, closingPrice }), /locked closing price/);
}
assert.throws(() => validateGoldRound({ ...converted, closingPrice: { ...converted.settlementPrice, usdWei: '1' } }), /locked closing price/);
assert.throws(() => validateGoldRound({ ...converted, closingPrice: { ...converted.settlementPrice, observedAt: start } }), /locked closing price/);
assert.equal(settleGoldRound(converted, converted.endsAt + 1), converted, 'replay retains the once-converted closing MOSS amounts');
assert.throws(() => validateGoldRound({ ...round, budgetWei: converted.budgetWei, settlementPrice: converted.settlementPrice }), /closing terms/);
assert.throws(() => validateGoldRound({ ...settled, settlementPrice: converted.settlementPrice }), /closing terms/);
assert.throws(() => validateGoldRound({ ...converted, bids: settled.bids }), /closing MOSS payout/);
assert.throws(() => validateGoldRound({ ...converted, budgetWei: '1' }), /closing MOSS budget/);
assert.throws(() => validateGoldRound({ ...tied, bids: { ...tied.bids, first: { ...tied.bids.first, sequence: tied.bids.second.sequence } } }));
assert.throws(() => validateGoldRound({ ...tied, bids: { ...tied.bids, first: { ...tied.bids.first, filledGold: 1 } } }));

const previewArgs = goldRoundArguments(['--id', 'pilot'], start);
assert.equal(previewArgs.open, false, 'operator CLI previews funding unless opening is explicit');
assert.deepEqual(previewArgs.terms, { id: 'pilot', budgetUsdCents: 100_000, startsAt: start,
  endsAt: start + GOLD_ROUND_DURATION_MS, maxPriceCentsPer1000: 100 });
assert(!Object.hasOwn(previewArgs.terms, 'budgetWei'), 'operator CLI sets a USD budget, never a fixed MOSS pool');
assert.deepEqual(goldRoundArguments(['--id', 'small-pilot', '--usd', '25.50', '--hours', '2.5', '--max-usd-per-1000', '0.75', '--open'], start),
  { open: true, terms: { id: 'small-pilot', budgetUsdCents: 2550, startsAt: start, endsAt: start + 2.5 * 3600000, maxPriceCentsPer1000: 75 } });
assert.deepEqual(goldRoundArguments(['--help']), { help: true });
assert.throws(() => goldRoundArguments([]), /--id/);
for (const hours of ['0', '-1', '24.1', 'NaN', 'Infinity']) assert.throws(() => goldRoundArguments(['--id', 'pilot', '--hours', hours]));
for (const usd of ['1.001', 'NaN', 'Infinity']) assert.throws(() => goldRoundArguments(['--id', 'pilot', '--usd', usd]));
assert.throws(() => goldRoundArguments(['--id', 'pilot', '--moss', '100']), /Unknown option/);

// Compare the greedy result to every possible whole-gold allocation for small books.
for (let budget = 1; budget <= 20; budget++) for (let quantity = 1; quantity <= 4; quantity++) {
  for (const prices of [[100, 700, 1300], [1300, 700, 100], [700, 700, 700]]) {
    let sample = fresh({ budgetUsdCents: budget, maxPriceCentsPer1000: 2000 });
    prices.forEach((price, index) => { sample = add(sample, `account-${index}`, (index + 1) * quantity, price); });
    const result = settleGoldRound(sample, sample.endsAt), bids = Object.values(result.bids);
    const spent = bids.reduce((total, bid) => total + BigInt(bid.payoutUsdMicros), 0n);
    assert(spent <= BigInt(budget) * 10000n);
    let optimum = 0;
    const costs = prices.map(price => BigInt(price) * 10n);
    for (let a = 0; a <= quantity; a++) for (let b = 0; b <= 2 * quantity; b++) for (let c = 0; c <= 3 * quantity; c++) {
      if (BigInt(a) * costs[0] + BigInt(b) * costs[1] + BigInt(c) * costs[2] <= BigInt(budget) * 10000n) optimum = Math.max(optimum, a + b + c);
    }
    assert.equal(bids.reduce((total, bid) => total + bid.filledGold, 0), optimum, 'buy the most whole gold for the fixed USD budget');
    validateGoldRound(result);
  }
}
console.log('PASS gold rounds: fixed USD budget, exact microUSD awards, price cap, cheapest asks, partial fills, FIFO edits, account scope, immutable/idempotent settlement, invalid inputs, sub-cent awards, payout bounds and exhaustive whole-gold optimality.');
