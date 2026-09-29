const WEI = 10n ** 18n;
const UINT256_MAX = (1n << 256n) - 1n;
const MAX_CENTS = BigInt(Number.MAX_SAFE_INTEGER);
const ceilDivide = (value, divisor) => (value + divisor - 1n) / divisor;

/**
 * Pricing primitive for a proposed Mossvale principal resale of an auction item.
 * This is not connected to or enabled for IAP, reservations, or treasury payouts.
 * Both MOSS quantity and USD-per-MOSS price use 18 decimal places. The combined
 * deductionBps applies to the gross store price; fixed costs are additional USD
 * cents. All costs/rates and configured USD price points must be supplied.
 * Rounding covers costs in whole cents; it never changes the seller's MOSS amount.
 */
export function auctionResalePrice(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Auction resale pricing configuration is required.');
  const { mossAmountWei, usdPerMossWei, deductionBps, fixedCostCents, storePricePointsCents } = input;
  for (const [name, value] of [['mossAmountWei', mossAmountWei], ['usdPerMossWei', usdPerMossWei]]) {
    if (typeof value !== 'bigint' || value <= 0n || value > UINT256_MAX) throw new RangeError(`${name} must be a positive uint256 bigint.`);
  }
  if (!Number.isSafeInteger(deductionBps) || deductionBps < 0 || deductionBps >= 10000)
    throw new RangeError('deductionBps must be an integer from 0 through 9999.');
  if (!Number.isSafeInteger(fixedCostCents) || fixedCostCents < 0)
    throw new RangeError('fixedCostCents must be a nonnegative safe integer.');
  if (!Array.isArray(storePricePointsCents) || !storePricePointsCents.length)
    throw new TypeError('storePricePointsCents must be a nonempty array.');
  // Validate every tier, including entries after a usable price and sparse slots.
  for (const price of storePricePointsCents) {
    if (!Number.isSafeInteger(price) || price <= 0) throw new RangeError('Every store price point must be a positive safe integer in USD cents.');
  }

  const assetCost = ceilDivide(mossAmountWei * usdPerMossWei * 100n, WEI * WEI);
  const totalCost = assetCost + BigInt(fixedCostCents);
  if (totalCost > MAX_CENTS) throw new RangeError('Auction resale cost exceeds safe integer USD cents.');
  let selected;
  for (const price of storePricePointsCents) {
    const gross = BigInt(price), deduction = ceilDivide(gross * BigInt(deductionBps), 10000n);
    const net = gross - deduction;
    if (net >= totalCost && (!selected || gross < selected.gross)) selected = { gross, deduction, net };
  }
  if (!selected) throw new RangeError('No configured store price point covers the auction resale cost.');
  return {
    mossAmountWei, usdPerMossWei, deductionBps,
    assetCostCents: Number(assetCost), fixedCostCents, totalCostCents: Number(totalCost),
    storePriceCents: Number(selected.gross), deductionCents: Number(selected.deduction),
    netProceedsCents: Number(selected.net), surplusCents: Number(selected.net - totalCost),
  };
}
