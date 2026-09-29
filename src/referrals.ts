export const REFERRAL_LEVEL = 20;
export const REFERRAL_DAYS = 2;
export const REFERRAL_USD_CENTS = 1000;
export const REFERRAL_PET = 'wayfinder-sprite';
export const REFERRAL_MOUNT = 'wayfarer-stag';
export type ReferralProgress = { code: string; canBind: boolean; referredBy: string | null; boundAt: number; days: number[]; level: number; spentUsdCents: number; qualified: boolean; qualifiedCount: number; wallets: string[]; payoutWallet: string | null };
export type ReferralState = { code: string; canBind: boolean; referredBy: boolean; qualifiedCount: number; feeShareBps: number; feeVersion?: 1 | 2; petUnlocked: boolean; mountUnlocked: boolean; payoutWallet: string | null; programEnabled: boolean; referralsEnabled: boolean; progress: { level: number; daysPlayed: number; spentUsdCents: number; qualified: boolean }; error?: string };
export const REFERRAL_TIERS = [{ count: 1, bps: 10 }, { count: 10, bps: 25 }, { count: 25, bps: 50 }, { count: 50, bps: 75 }, { count: 100, bps: 100 }] as const;
export const referralFeeBps = (count: number, feeVersion = 2): number => feeVersion === 1 ? count >= 50 ? 1000 : count >= 1 ? 500 : 0 : [...REFERRAL_TIERS].reverse().find(tier => count >= tier.count)?.bps ?? 0;
/** Accept the same code or copied invite link in the browser and at the server boundary. */
export function normalizeReferralCode(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  let code = value.trim();
  if (/^https?:\/\//i.test(code)) {
    try { code = new URL(code).searchParams.get('ref') || ''; } catch { return null; }
  }
  code = code.trim().toLowerCase();
  return referralCodeValid(code) ? code : null;
}
export const referralCodeValid = (code: unknown): code is string => typeof code === 'string' && /^[a-f0-9]{24}$/.test(code);
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const wallet = (value: unknown): value is string => typeof value === 'string' && /^0x[a-f0-9]{40}$/.test(value) && !/^0x0{40}$/.test(value);
export function newReferral(code: string, canBind = false): ReferralProgress { return { code, canBind, referredBy: null, boundAt: 0, days: [], level: 0, spentUsdCents: 0, qualified: false, qualifiedCount: 0, wallets: [], payoutWallet: null }; }
export function referralValid(value: any): value is ReferralProgress {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 11 && Object.keys(value).every(key => ['code','canBind','referredBy','boundAt','days','level','spentUsdCents','qualified','qualifiedCount','wallets','payoutWallet'].includes(key))
    && referralCodeValid(value.code) && typeof value.canBind === 'boolean' && typeof value.qualified === 'boolean'
    && (value.referredBy === null || typeof value.referredBy === 'string' && /^[a-f0-9]{64}$/.test(value.referredBy))
    && [value.boundAt,value.level,value.spentUsdCents,value.qualifiedCount].every(integer)
    && (value.referredBy ? value.boundAt > 0 && !value.canBind : value.boundAt === 0 && !value.qualified && value.spentUsdCents === 0)
    && Array.isArray(value.days) && value.days.length <= 2 && value.days.every(integer) && new Set(value.days).size === value.days.length
    && (!value.canBind || !value.days.length) && Array.isArray(value.wallets) && value.wallets.every(wallet) && new Set(value.wallets).size === value.wallets.length
    && (value.payoutWallet === null || wallet(value.payoutWallet) && value.wallets.includes(value.payoutWallet))
    && (!value.qualified || value.level >= REFERRAL_LEVEL && value.days.length >= REFERRAL_DAYS && value.spentUsdCents >= REFERRAL_USD_CENTS);
}
export function referralWallets(account: any): string[] { return [...new Set<string>([...(account?.referral?.wallets || []), ...(account?.characters || []).map((p: any) => p.auctionWallet?.toLowerCase()).filter(Boolean)])]; }
export function referralWalletsOverlap(account: any, referrer: any): boolean { const wallets = referralWallets(referrer); return referralWallets(account).some(value => wallets.includes(value)); }
export function referralPlayed(referral: ReferralProgress, now: number, level: number): boolean {
  const day = Math.floor(now / 86400000), changed = referral.canBind || level > referral.level || referral.days.length < 2 && !referral.days.includes(day);
  referral.canBind = false; referral.level = Math.max(referral.level, level);
  if (referral.days.length < 2 && !referral.days.includes(day)) referral.days.push(day);
  return changed;
}
export function referralView(referral: ReferralProgress, referralsEnabled: boolean, error?: string, programEnabled = true, feeVersion: 1 | 2 = 2): ReferralState {
  return { code: referral.code, canBind: programEnabled && referral.canBind, referredBy: !!referral.referredBy, qualifiedCount: referral.qualifiedCount,
    feeShareBps: referralFeeBps(referral.qualifiedCount, feeVersion), feeVersion, petUnlocked: referral.qualifiedCount >= 10, mountUnlocked: referral.qualifiedCount >= 25,
    payoutWallet: referral.payoutWallet, programEnabled, referralsEnabled, progress: { level: referral.level, daysPlayed: referral.days.length, spentUsdCents: referral.spentUsdCents, qualified: referral.qualified }, ...(error ? { error } : {}) };
}
