import assert from 'node:assert/strict';
import { auctionResalePrice } from '../src/auction-resale-price.mjs';

const WEI = 10n ** 18n, UINT256_MAX = (1n << 256n) - 1n;
const base = { mossAmountWei: WEI, usdPerMossWei: WEI, deductionBps: 0, fixedCostCents: 0, storePricePointsCents: [100] };
const quote = change => auctionResalePrice({ ...base, ...change });
assert.deepEqual(quote({}), { mossAmountWei: WEI, usdPerMossWei: WEI, deductionBps: 0,
  assetCostCents: 100, fixedCostCents: 0, totalCostCents: 100, storePriceCents: 100,
  deductionCents: 0, netProceedsCents: 100, surplusCents: 0 });

// A fraction of a cent is still a cost; exact cents must not gain an extra cent.
assert.equal(quote({ mossAmountWei: 1n, usdPerMossWei: 1n, storePricePointsCents: [1] }).assetCostCents, 1);
assert.equal(quote({ usdPerMossWei: WEI / 100n, storePricePointsCents: [1] }).assetCostCents, 1);
assert.equal(quote({ usdPerMossWei: WEI / 100n + 1n, storePricePointsCents: [1, 2] }).assetCostCents, 2);

const points = Object.freeze([300, 175, 175, 150, 174]);
const exactMoss = 1234567890123456789n;
const priced = quote({ mossAmountWei: exactMoss, deductionBps: 2500, fixedCostCents: 7, storePricePointsCents: points });
assert.deepEqual(priced, { mossAmountWei: exactMoss, usdPerMossWei: WEI, deductionBps: 2500,
  assetCostCents: 124, fixedCostCents: 7, totalCostCents: 131, storePriceCents: 175,
  deductionCents: 44, netProceedsCents: 131, surplusCents: 0 });
assert.deepEqual(points, [300, 175, 175, 150, 174], 'unsorted duplicate tiers are accepted without mutation');
assert.equal(quote({ mossAmountWei: exactMoss, deductionBps: 2500, fixedCostCents: 7,
  storePricePointsCents: [200] }).surplusCents, 19, 'tier headroom does not reduce the seller MOSS payout');

const roundedFee = quote({ deductionBps: 1, storePricePointsCents: [100, 101] });
assert.equal(roundedFee.storePriceCents, 101, 'even a sub-cent deduction must be covered');
assert.equal(roundedFee.deductionCents, 1);
const third = quote({ deductionBps: 3333, storePricePointsCents: [149, 150] });
assert.equal(third.storePriceCents, 150);
assert.equal(third.deductionCents, 50);
assert.equal(third.netProceedsCents, 100);
const highFee = quote({ usdPerMossWei: WEI / 100n, deductionBps: 9999, storePricePointsCents: [9999, 10000] });
assert.equal(highFee.storePriceCents, 10000);
assert.equal(highFee.netProceedsCents, 1);
assert.equal(highFee.deductionCents, 9999);
assert.throws(() => quote({ deductionBps: 3333, storePricePointsCents: [149, 100] }), /No configured store price point/);
assert.throws(() => quote({ fixedCostCents: 1 }), /No configured store price point/);

// Products and percentage calculations exceed Number precision, even with safe cent inputs.
const large = quote({ mossAmountWei: 9006298534815516n * WEI / 100n, deductionBps: 1,
  storePricePointsCents: [Number.MAX_SAFE_INTEGER] });
assert.equal(large.deductionCents, 900719925475);
assert.equal(large.netProceedsCents, 9006298534815516);
assert.equal(large.totalCostCents, 9006298534815516);
assert.equal(large.surplusCents, 0);
assert.equal(quote({ mossAmountWei: BigInt(Number.MAX_SAFE_INTEGER) * WEI / 100n,
  storePricePointsCents: [Number.MAX_SAFE_INTEGER] }).totalCostCents, Number.MAX_SAFE_INTEGER);

for (const name of ['mossAmountWei', 'usdPerMossWei']) {
  for (const value of [undefined, null, 0n, -1n, UINT256_MAX + 1n, 1, 1.1, '1', NaN, Infinity])
    assert.throws(() => quote({ [name]: value }), undefined, `${name} rejects ${String(value)}`);
}
for (const value of [undefined, null, -1, 10000, 0.1, NaN, Infinity, '0', 0n, Number.MAX_SAFE_INTEGER + 1])
  assert.throws(() => quote({ deductionBps: value }));
for (const value of [undefined, null, -1, 0.1, NaN, Infinity, '0', 0n, Number.MAX_SAFE_INTEGER + 1])
  assert.throws(() => quote({ fixedCostCents: value }));
for (const value of [undefined, null, {}, [], [0], [-1], [0.1], [NaN], [Infinity], ['100'], [100n],
  [Number.MAX_SAFE_INTEGER + 1], [100, undefined], [100, NaN], new Array(2), [[100]]])
  assert.throws(() => quote({ storePricePointsCents: value }));
for (const value of [undefined, null, [], 1, 'config']) assert.throws(() => auctionResalePrice(value));
assert.throws(() => auctionResalePrice({}), /mossAmountWei/);
assert.throws(() => quote({ mossAmountWei: UINT256_MAX, usdPerMossWei: 1n }), /exceeds safe integer/);
assert.throws(() => quote({ mossAmountWei: UINT256_MAX, usdPerMossWei: UINT256_MAX }), /exceeds safe integer/);
assert.throws(() => quote({ mossAmountWei: (BigInt(Number.MAX_SAFE_INTEGER) + 1n) * WEI / 100n }), /exceeds safe integer/);
assert.throws(() => quote({ mossAmountWei: BigInt(Number.MAX_SAFE_INTEGER) * WEI / 100n, fixedCostCents: 1 }), /exceeds safe integer/);

console.log('PASS auction resale pricing: exact MOSS payout, upward cent rounding, complete cost coverage, lowest configured tier, immutable configuration and integer bounds; pricing only, no IAP integration.');
