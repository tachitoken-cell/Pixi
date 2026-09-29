import { Interface, TypedDataEncoder, formatUnits, getAddress, id, parseUnits } from 'ethers';
import { MOSS_TOKEN } from './auction.ts';

export const TREASURE_MAX_CLAIMS = 1000;
export const TREASURE_CLAIM_TYPES = { Claim: [
  { name: 'claimId', type: 'bytes32' }, { name: 'characterId', type: 'bytes32' },
  { name: 'recipient', type: 'address' }, { name: 'amountWei', type: 'uint256' },
] };
export const TREASURE_REWARD_TIERS = [
  { weight: 9000, min: 200, max: 500 }, { weight: 1000, min: 600, max: 1000 },
] as const;
/** Pass node:crypto randomInt on the server. The reward is rolled only for a durable issuance. */
export function rollTreasureUsd(draw: (min: number, max: number) => number): number {
  let roll = draw(0, 10000);
  if (!Number.isSafeInteger(roll) || roll < 0 || roll >= 10000) throw Error('Invalid treasury reward roll.');
  for (const tier of TREASURE_REWARD_TIERS) {
    if (roll < tier.weight) {
      const amount = draw(tier.min, tier.max + 1);
      if (!Number.isSafeInteger(amount) || amount < tier.min || amount > tier.max) throw Error('Invalid treasury reward amount.');
      return amount;
    }
    roll -= tier.weight;
  }
  throw Error('Invalid treasury reward tier.');
}
/** Lock a dollar award to whole token base units without exceeding its USD amount. */
export function goldUsdAmountWei(payoutUsdMicros: string, priceUsdWei: string): string {
  if ([payoutUsdMicros, priceUsdWei].some(value => typeof value !== 'string' || !/^[1-9]\d{0,77}$/.test(value) || BigInt(value) >= 2n ** 256n))
    throw Error('Invalid gold round USD amount or MOSS price.');
  const amount = BigInt(payoutUsdMicros) * 10n ** 30n / BigInt(priceUsdWei);
  if (amount <= 0n || amount >= 2n ** 256n) throw Error('The gold award cannot be represented as a positive MOSS amount.');
  return amount.toString();
}
/** New rewards use $2–$10; historical $5–$30 authorizations keep their original bounds. */
export function treasureUsdAmount(usdCents: number, priceUsdWei: string, legacy = false): string {
  if (!Number.isSafeInteger(usdCents) || (legacy ? usdCents < 500 || usdCents > 3000
    : !TREASURE_REWARD_TIERS.some(tier => usdCents >= tier.min && usdCents <= tier.max))
    || typeof priceUsdWei !== 'string' || !/^[1-9]\d{0,77}$/.test(priceUsdWei) || BigInt(priceUsdWei) >= 2n ** 256n)
    throw Error('Invalid MOSS treasure price.');
  const price = BigInt(priceUsdWei), scale = 10n ** 34n;
  const minimum = ((legacy ? 500n : 200n) * scale + price - 1n) / price, maximum = (legacy ? 3000n : 1000n) * scale / price;
  const rounded = (BigInt(usdCents) * scale + price - 1n) / price, amount = rounded < maximum ? rounded : maximum;
  if (amount < minimum || amount <= 0n || amount >= 2n ** 256n) throw Error('Invalid MOSS treasure amount.');
  return formatUnits(amount, 18);
}
export interface TreasureClaim {
  id: string; realmId: string; characterId: string; wallet: string; amount: number | string; amountWei: string; createdAt: number;
  usdCents?: number; price?: { usdWei: string; observedAt: number }; goldRoundId?: string;
  chainId: number; token: string; contract: string; status: 'pending' | 'processed' | 'paid'; claimHash: string; signature: string;
  contractClaim: { claimId: string; characterId: string; recipient: string; amountWei: string };
  transaction: { to: string; data: string; value: string; chainId: string };
  transactionHash?: string; paymentBlock?: { hash: string; number: string }; paidAt?: number;
  previousQuotes?: TreasureClaim[]; settledClaimHash?: string;
}
export const treasureQuotes = (claim: TreasureClaim): TreasureClaim[] => [...(claim.previousQuotes ?? []), claim];
export interface TreasureState {
  configured: boolean; enabled: boolean; reason?: string; chainId?: number; contract?: string; token?: string; capacityWei?: string; balanceWei?: string;
  legacyContract?: string; legacyBalanceWei?: string;
  wallet: string | null; claims: TreasureClaim[]; vouchers: number; nextRedemptionAt?: number;
}
/** Quote refreshes retain the original redemption day; gold awards are not vouchers. */
export function treasureNextRedemptionAt(account: { lastTreasureClaimAt?: number; characters: { treasureClaims?: TreasureClaim[] }[] }): number {
  const latest = account.characters.reduce((last, player) => (player.treasureClaims ?? []).reduce((at, claim) =>
    claim.goldRoundId ? at : Math.max(at, treasureQuotes(claim)[0].createdAt), last), account.lastTreasureClaimAt ?? 0);
  return latest ? (Math.floor(latest / 86400000) + 1) * 86400000 : 0;
}
export const TREASURE_ABI = ['function claim((bytes32 claimId,bytes32 characterId,address recipient,uint256 amountWei),bytes signature)'];
const claimInterface = new Interface(TREASURE_ABI);
const same = (a: unknown, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
const hash = (value: unknown): value is string => typeof value === 'string' && /^0x[\da-f]{64}$/i.test(value) && BigInt(value) !== 0n;
const address = (value: unknown) => typeof value === 'string' && /^0x[\da-f]{40}$/i.test(value) && BigInt(value) !== 0n && !!getAddress(value);
const identity = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 128;
export function treasureContractClaim(input: Pick<TreasureClaim, 'id' | 'realmId' | 'characterId' | 'wallet' | 'amount' | 'goldRoundId'>) {
  const validAmount = typeof input.amount === 'number' ? Number.isSafeInteger(input.amount) && input.amount >= 1 && input.amount <= 1000
    : typeof input.amount === 'string' && /^(?:0|[1-9]\d{0,77})\.\d{1,18}$/.test(input.amount)
      && formatUnits(parseUnits(input.amount, 18), 18) === input.amount;
  const goldRound = input.goldRoundId !== undefined;
  if (![input.id, input.realmId, input.characterId].every(identity) || !validAmount || !address(input.wallet)
    || goldRound && (!identity(input.goldRoundId) || typeof input.amount !== 'string'))
    throw Error('Invalid MOSS treasure claim.');
  const amountWei = parseUnits(String(input.amount), 18);
  if (amountWei <= 0n || amountWei >= 2n ** 256n) throw Error('Invalid MOSS treasure claim.');
  return { claimId: id(JSON.stringify(goldRound ? ['mossvale-gold-round', input.goldRoundId, input.realmId, input.characterId, input.id]
    : ['mossvale-treasure', input.realmId, input.characterId, input.id])),
    characterId: id(JSON.stringify(['mossvale-character', input.realmId, input.characterId])), recipient: getAddress(input.wallet), amountWei: amountWei.toString() };
}
/** Reconstruct one signed authorization and its wallet transaction. */
function treasureQuoteValid(value: unknown): value is TreasureClaim {
  try {
    const claim = value as TreasureClaim;
    if (!claim || !['pending', 'processed', 'paid'].includes(claim.status) || !address(claim.contract)
      || claim.chainId !== MOSS_TOKEN.chainId || !same(claim.token, MOSS_TOKEN.address)
      || !Number.isSafeInteger(claim.createdAt) || claim.createdAt <= 0 || !hash(claim.claimHash)
      || typeof claim.signature !== 'string' || !/^0x[\da-f]{130}$/i.test(claim.signature)
      || claim.transactionHash !== undefined && !hash(claim.transactionHash)
      || claim.paidAt !== undefined && (!Number.isSafeInteger(claim.paidAt) || claim.paidAt < claim.createdAt)) return false;
    if (claim.goldRoundId !== undefined) {
      if (!identity(claim.goldRoundId) || typeof claim.amount !== 'string' || claim.usdCents !== undefined || claim.price !== undefined
        || claim.previousQuotes !== undefined) return false;
    } else if (typeof claim.amount === 'string') {
      if (!claim.price || !Number.isSafeInteger(claim.price.observedAt) || claim.price.observedAt <= 0
        || claim.createdAt - claim.price.observedAt > 90000 || claim.price.observedAt > claim.createdAt + 15000
        || ![false, true].some(legacy => {
          try { return treasureUsdAmount(claim.usdCents!, claim.price!.usdWei, legacy) === claim.amount; }
          catch { return false; }
        })) return false;
    } else if (claim.usdCents !== undefined || claim.price !== undefined) return false;
    const expected = treasureContractClaim(claim);
    const domain = { name: 'MossvaleTreasureTreasury', version: '1', chainId: claim.chainId, verifyingContract: claim.contract };
    const digest = TypedDataEncoder.hash(domain, TREASURE_CLAIM_TYPES, expected);
    if (claim.amountWei !== expected.amountWei || !same(claim.claimHash, digest)
      || TypedDataEncoder.hash(domain, TREASURE_CLAIM_TYPES, claim.contractClaim) !== digest) return false;
    const tx = claim.transaction;
    if (!tx || !same(tx.to, claim.contract) || !same(tx.data, claimInterface.encodeFunctionData('claim', [expected, claim.signature]))
      || tx.value !== '0x0' || tx.chainId !== '0x1237') return false;
    if (claim.paymentBlock === undefined) return claim.status === 'pending';
    return !!claim.paymentBlock && hash(claim.paymentBlock.hash) && typeof claim.paymentBlock.number === 'string'
      && /^0x(?:0|[1-9a-f][\da-f]*)$/i.test(claim.paymentBlock.number);
  } catch { return false; }
}
/** Prior signed authorizations remain valid; refreshes cannot change their payout identity. */
export function treasureClaimValid(value: unknown): value is TreasureClaim {
  if (!treasureQuoteValid(value)) return false;
  const claim = value, previous = claim.previousQuotes ?? [];
  if (claim.previousQuotes !== undefined && !Array.isArray(claim.previousQuotes) || previous.length >= TREASURE_MAX_CLAIMS) return false;
  if (!previous.every(quote => treasureQuoteValid(quote) && !Object.hasOwn(quote, 'previousQuotes') && !Object.hasOwn(quote, 'settledClaimHash')
    && quote.status === 'pending' && quote.transactionHash === undefined && quote.paymentBlock === undefined && quote.paidAt === undefined
    && ['id', 'realmId', 'characterId', 'chainId', 'usdCents', 'goldRoundId'].every(field => quote[field as keyof TreasureClaim] === claim[field as keyof TreasureClaim])
    && ['wallet', 'contract', 'token'].every(field => same(quote[field as 'wallet' | 'contract' | 'token'], claim[field as 'wallet' | 'contract' | 'token'])))) return false;
  const quotes = treasureQuotes(claim);
  return claim.settledClaimHash === undefined || claim.status !== 'pending' && hash(claim.settledClaimHash) && quotes.some(quote => same(quote.claimHash, claim.settledClaimHash!));
}
export function treasurePlayerValid(player: { id?: string; treasureClaims?: TreasureClaim[] }): boolean {
  const claims = player.treasureClaims ?? [];
  return Array.isArray(claims) && claims.length <= TREASURE_MAX_CLAIMS
    && claims.every(claim => treasureClaimValid(claim) && claim.characterId === player.id)
    && claims.reduce((count, claim) => count + treasureQuotes(claim).length, 0) <= TREASURE_MAX_CLAIMS
    && new Set(claims.map(claim => claim.id)).size === claims.length
    && new Set(claims.map(claim => claim.claimHash.toLowerCase())).size === claims.length;
}
