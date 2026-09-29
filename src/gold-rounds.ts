export const GOLD_ROUND_DURATION_MS = 4 * 60 * 60 * 1000;
export const GOLD_ROUND_BUDGET_USD_CENTS = 100_000;
/** Pilot spending ceiling, not a claim about gold's market value. */
export const GOLD_ROUND_MAX_PRICE_CENTS_PER_1000 = 100;

export interface GoldRoundBid {
  characterId: string; wallet: string; realmId: string;
  gold: number; priceCentsPer1000: number; sequence: number;
  filledGold?: number; payoutUsdMicros?: string; payoutWei?: string; refunded?: boolean; claimed?: boolean; claimId?: string;
}
export interface GoldRound {
  id: string; startsAt: number; endsAt: number; contract: string;
  budgetUsdCents: number; maxPriceCentsPer1000: number;
  /** Locked on the first valid closing quote, including while waiting for enough MOSS. */
  closingPrice?: { usdWei: string; observedAt: number };
  /** Added only when the closing USD awards are converted together into MOSS. */
  settlementPrice?: { usdWei: string; observedAt: number }; budgetWei?: string;
  status: 'open' | 'settled'; bids: Record<string, GoldRoundBid>; nextSequence?: number; settledAt?: number;
}
type GoldRoundTerms = Pick<GoldRound, 'id' | 'contract'>
  & Partial<Pick<GoldRound, 'startsAt' | 'endsAt' | 'budgetUsdCents' | 'maxPriceCentsPer1000'>>;
type GoldRoundOffer = Pick<GoldRoundBid, 'characterId' | 'wallet' | 'realmId' | 'gold' | 'priceCentsPer1000'>;
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[\w:-]{1,256}$/.test(value)
  && !['__proto__', 'constructor', 'prototype'].includes(value);
const address = (value: unknown): value is string => typeof value === 'string' && /^0x[\da-f]{40}$/i.test(value) && !/^0x0{40}$/i.test(value);
const wei = (value: unknown): value is string => typeof value === 'string' && /^(0|[1-9]\d{0,77})$/.test(value) && BigInt(value) < 2n ** 256n;
const fail = (message: string): never => { throw Error(message); };

function validateTerms(round: GoldRoundTerms) {
  if (!round || !identifier(round.id) || round.id.length > 128 || !address(round.contract)
    || !positive(round.startsAt) || !positive(round.endsAt) || round.endsAt <= round.startsAt
    || !positive(round.budgetUsdCents) || !positive(round.maxPriceCentsPer1000)) fail('Invalid gold round terms.');
}
function validateOffer(round: Pick<GoldRound, 'maxPriceCentsPer1000'>, offer: GoldRoundOffer) {
  if (!offer || !identifier(offer.characterId) || !address(offer.wallet) || !identifier(offer.realmId)
    || !positive(offer.gold) || !positive(offer.priceCentsPer1000) || offer.priceCentsPer1000 > round.maxPriceCentsPer1000) fail('Invalid gold merchant offer.');
}
export function validateGoldRound(round: GoldRound): void {
  validateTerms(round);
  if (!['open', 'settled'].includes(round.status) || !round.bids || typeof round.bids !== 'object' || Array.isArray(round.bids)
    || (round.nextSequence !== undefined && !positive(round.nextSequence))) fail('Invalid gold round state.');
  if (round.closingPrice !== undefined && (!round.closingPrice || !wei(round.closingPrice.usdWei) || BigInt(round.closingPrice.usdWei) === 0n
    || !positive(round.closingPrice.observedAt))) fail('Invalid locked closing price.');
  const converted = round.settlementPrice !== undefined || round.budgetWei !== undefined || Object.values(round.bids).some(bid => bid?.payoutWei !== undefined);
  if (converted && (round.status !== 'settled' || !wei(round.budgetWei) || BigInt(round.budgetWei) === 0n
    || !round.settlementPrice || !wei(round.settlementPrice.usdWei) || BigInt(round.settlementPrice.usdWei) === 0n
    || !positive(round.settlementPrice.observedAt))) fail('MOSS conversion requires complete closing terms.');
  if (round.closingPrice && round.settlementPrice && (round.closingPrice.usdWei !== round.settlementPrice.usdWei
    || round.closingPrice.observedAt !== round.settlementPrice.observedAt)) fail('Settlement must use the locked closing price.');
  const sequences = new Set<number>();
  let committed = 0n, committedWei = 0n;
  for (const [accountKey, bid] of Object.entries(round.bids)) {
    validateOffer(round, bid);
    if (!identifier(accountKey) || !positive(bid.sequence) || sequences.has(bid.sequence)
      || (round.nextSequence !== undefined && bid.sequence >= round.nextSequence)) fail('Invalid gold offer priority.');
    sequences.add(bid.sequence);
    if ((bid.refunded !== undefined && typeof bid.refunded !== 'boolean') || (bid.claimed !== undefined && typeof bid.claimed !== 'boolean')
      || (bid.claimId !== undefined && !identifier(bid.claimId))) fail('Invalid gold offer settlement.');
    if (round.status === 'open') {
      if (bid.filledGold !== undefined || bid.payoutUsdMicros !== undefined || bid.refunded || bid.claimed || bid.claimId) fail('An open round cannot have settled offers.');
    } else {
      if (!Number.isSafeInteger(bid.filledGold) || Number(bid.filledGold) < 0 || Number(bid.filledGold) > bid.gold
        || bid.payoutUsdMicros !== goldRoundPayoutUsdMicros(round, bid.filledGold!, bid.priceCentsPer1000)) fail('Invalid gold offer payout.');
      committed += BigInt(bid.payoutUsdMicros!);
      if (converted) {
        if (!wei(bid.payoutWei) || (bid.filledGold === 0) !== (BigInt(bid.payoutWei) === 0n)) fail('Invalid closing MOSS payout.');
        committedWei += BigInt(bid.payoutWei!);
      }
    }
  }
  if (committed > BigInt(round.budgetUsdCents) * 10000n) fail('Gold round payouts exceed its USD budget.');
  if (converted && committedWei > BigInt(round.budgetWei!)) fail('Gold round payouts exceed its closing MOSS budget.');
}
export function createGoldRound(terms: GoldRoundTerms): GoldRound {
  const startsAt = terms.startsAt ?? Date.now();
  const round: GoldRound = { id: terms.id, startsAt, endsAt: terms.endsAt ?? startsAt + GOLD_ROUND_DURATION_MS,
    contract: terms.contract, budgetUsdCents: terms.budgetUsdCents ?? GOLD_ROUND_BUDGET_USD_CENTS,
    maxPriceCentsPer1000: terms.maxPriceCentsPer1000 ?? GOLD_ROUND_MAX_PRICE_CENTS_PER_1000,
    status: 'open', bids: {}, nextSequence: 1 };
  validateGoldRound(round);
  return round;
}
/** Exact USD awards; the MOSS conversion is separate from auction allocation. */
export function goldRoundPayoutUsdMicros(round: Pick<GoldRound, 'budgetUsdCents' | 'maxPriceCentsPer1000'>, gold: number, priceCentsPer1000: number): string {
  if (!Number.isSafeInteger(gold) || gold < 0) fail('Invalid gold quantity.');
  if (!round || !positive(round.budgetUsdCents) || !positive(round.maxPriceCentsPer1000)
    || !positive(priceCentsPer1000) || priceCentsPer1000 > round.maxPriceCentsPer1000) fail('Invalid gold price.');
  return (BigInt(gold) * BigInt(priceCentsPer1000) * 10n).toString();
}
export function upsertGoldRoundBid(round: GoldRound, accountKey: string, offer: GoldRoundOffer, now = Date.now()): GoldRound {
  validateGoldRound(round); validateOffer(round, offer);
  if (!identifier(accountKey) || !positive(now) || round.status !== 'open' || now < round.startsAt || now >= round.endsAt) fail('The gold round is not accepting offers.');
  const previous = Object.hasOwn(round.bids, accountKey) ? round.bids[accountKey] : undefined;
  if (previous && previous.characterId !== offer.characterId) fail('Update this account\'s offer with its original character.');
  const sequence = round.nextSequence ?? Object.values(round.bids).reduce((next, bid) => Math.max(next, bid.sequence + 1), 1);
  if (!positive(sequence + 1)) fail('Gold offer priority is exhausted.');
  const bid: GoldRoundBid = { characterId: offer.characterId, wallet: offer.wallet, realmId: offer.realmId,
    gold: offer.gold, priceCentsPer1000: offer.priceCentsPer1000, sequence };
  return { ...round, nextSequence: sequence + 1, bids: { ...round.bids, [accountKey]: bid } };
}
/** Cheapest asks first; equal prices keep FIFO priority, which every edit resets. */
export function settleGoldRound(round: GoldRound, now = Date.now()): GoldRound {
  validateGoldRound(round);
  if (!positive(now)) fail('Invalid gold settlement time.');
  if (round.status === 'settled') return round;
  if (now < round.endsAt) fail('The gold round has not ended.');
  let remaining = BigInt(round.budgetUsdCents) * 10000n;
  const bids: Record<string, GoldRoundBid> = {};
  for (const [accountKey, bid] of Object.entries(round.bids).sort(([, a], [, b]) => a.priceCentsPer1000 - b.priceCentsPer1000 || a.sequence - b.sequence)) {
    const unitUsdMicros = BigInt(bid.priceCentsPer1000) * 10n, affordable = remaining / unitUsdMicros;
    const filledGold = Number(affordable < BigInt(bid.gold) ? affordable : BigInt(bid.gold));
    const payoutUsdMicros = (BigInt(filledGold) * unitUsdMicros).toString();
    remaining -= BigInt(payoutUsdMicros);
    bids[accountKey] = { ...bid, filledGold, payoutUsdMicros };
  }
  return { ...round, status: 'settled', settledAt: now, bids };
}
