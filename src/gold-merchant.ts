import type { TreasureClaim } from './treasure-rewards';

/** Parked outside Lanternreach's south gate, clear of the road and sky-dock approach. */
export const GOLD_CARAVAN = { x: 18, z: 89, rotation: Math.PI };
export const GOLD_MERCHANT = {
  id: 'gold-merchant', name: 'Gold merchant', title: 'Traveling gold merchant',
  role: 'visitor' as const, zone: 'greenwood' as const,
  x: GOLD_CARAVAN.x - 3.05, z: GOLD_CARAVAN.z, rotation: Math.PI - .18,
  dialogue: ["I'm waiting for a new shipment of MOSS."],
};
export const GOLD_MERCHANT_REQUIREMENTS = { level: 30, usdCents: 2500 };
export interface GoldMerchantRound {
  id: string; startsAt: number; endsAt: number; status: 'open' | 'settled';
  budgetUsdCents: number; budgetWei?: string; closingMossWei?: string; estimatedMossWei?: string; priceCheckedAt?: number; maxPriceCentsPer1000: number;
  totalGold?: number; spentUsdMicros?: string; offerCount?: number;
}
export interface GoldMerchantOffer {
  roundId: string; gold: number; priceCentsPer1000: number; wallet: string;
  status: 'open' | 'cancelled' | 'settled'; filledGold?: number; payoutUsdMicros?: string; payoutWei?: string; claimId?: string;
}
export interface GoldMerchantState {
  characterId: string; level: number; wallet: string | null;
  balanceWei?: string; valueUsdCents?: string; checkedAt?: number; reason?: string;
  round?: GoldMerchantRound; offer?: GoldMerchantOffer; awards?: GoldMerchantOffer[];
  claims?: TreasureClaim[]; treasuryAuthorizationCount?: number;
  treasury?: { contract: string; balanceWei?: string; legacyContract?: string; legacyBalanceWei?: string };
}
// Authored GLB at a half-turn: carriage, then the two harnessed horses.
// Foot NPCs remain nonblocking, like other friendly NPCs.
export const GOLD_CARAVAN_COLLIDERS = [
  { x: 18, z: 91.6, halfWidth: 1.915, halfDepth: 2.48, r: Math.hypot(1.915, 2.48) },
  ...[-.86, .86].map(dx => ({ x: 18 + dx, z: 85.85, halfWidth: .62, halfDepth: 1.71, r: Math.hypot(.62, 1.71) })),
];
