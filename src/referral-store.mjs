import { createHash } from 'node:crypto';
import { newReferral, referralValid, referralWallets, referralWalletsOverlap, referralFeeBps, REFERRAL_LEVEL, REFERRAL_DAYS, REFERRAL_USD_CENTS, REFERRAL_PET, REFERRAL_MOUNT } from './referrals.ts';
export const referralCode = key => createHash('sha256').update(`mossvale-referral:${key}`).digest('hex').slice(0, 24);
export function migrateReferral(account, key) {
  if (Object.hasOwn(account, 'referral')) return account;
  account.referral = newReferral(referralCode(key), account.characters.length === 0);
  const wallets = referralWallets(account); account.referral.wallets = wallets;
  account.referral.payoutWallet ||= wallets[0] || null;
  account.referral.level = Math.max(account.referral.level, ...account.characters.map(player => player.level));
  return account;
}
export function grantReferralRewards(account) {
  if (!account.referral) return;
  for (const player of account.characters) {
    if (account.referral.qualifiedCount >= 10 && !player.ownedPets.includes(REFERRAL_PET)) player.ownedPets = [...player.ownedPets, REFERRAL_PET];
    if (account.referral.qualifiedCount >= 25 && !player.ownedMounts.includes(REFERRAL_MOUNT)) player.ownedMounts = [...player.ownedMounts, REFERRAL_MOUNT];
  }
}
export function mergeReferral(account, current, key) {
  const before = current.referral, proposed = account.referral;
  if (!before && !proposed) return;
  if (!referralValid(proposed) || proposed.code !== referralCode(key) || before.referredBy && proposed.referredBy !== before.referredBy
      || !before.canBind && !before.referredBy && proposed.referredBy) throw Error('Referral attribution is permanent and must precede gameplay.');
  account.referral = { ...proposed, canBind: before.canBind && proposed.canBind,
    boundAt: before.boundAt || proposed.boundAt, qualified: before.qualified, qualifiedCount: before.qualifiedCount,
    spentUsdCents: before.spentUsdCents, level: Math.max(before.level, proposed.level, ...account.characters.map(p => p.level)),
    days: [...new Set([...before.days, ...proposed.days])].sort((a,b) => a-b).slice(0,2),
    wallets: [...new Set([...referralWallets(current), ...referralWallets(account)])] };
  const changedWallet = account.characters.find(player => player.auctionWallet && current.characters.find(old => old.id === player.id)?.auctionWallet?.toLowerCase() !== player.auctionWallet.toLowerCase())?.auctionWallet;
  account.referral.payoutWallet = changedWallet?.toLowerCase() || before.payoutWallet || account.referral.wallets[0] || null;
  if (account.referral.days.length || account.referral.referredBy) account.referral.canBind = false;
}
/** Called inside the player-row transaction; referrer rows are locked with both trading accounts. */
export function applyReferralCommit(existing, projected, purchase, blockedWalletAccounts = new Set(), enabled = true) {
  const updates = new Map(projected.map(row => [row.account_key, row]));
  const row = key => { const found = updates.get(key) || existing.get(key); return found && { ...found, deleting: existing.get(key)?.deleting }; };
  // A referral or payout change during quote preparation must not expose stale signed terms.
  for (const entry of projected) for (const player of entry.state.characters) for (const listing of player.auctions || []) {
    const reservation = listing.reservation, order = reservation?.order;
    if (!order || order.referralUsdCents === undefined || existing.get(entry.account_key)?.state.characters.some(p => p.auctions?.some(old => old.id === listing.id && old.reservation))) continue;
    const buyer = [...updates.values()].find(candidate => candidate.state.characters.some(p => p.id === reservation.buyerId));
    const referral = buyer?.state.referral, referrerRow = row(referral?.referredBy), referrer = referrerRow?.state;
    if (!referral?.referredBy || reservation.referralBoundAt !== referral.boundAt || !referrer || referrer.ban || referrerRow.deleting
        || buyer.account_key === entry.account_key || referral.referredBy === entry.account_key || referralWalletsOverlap(buyer.state, referrer)
        || referralWallets(referrer).includes(order.seller.toLowerCase()) || referralWallets(referrer).includes(order.buyer.toLowerCase())) throw Error('Referral eligibility changed while preparing the auction. Please retry.');
    const rate = existing.get(buyer.account_key).state.referral.qualified ? referralFeeBps(referrer.referral.qualifiedCount, order.referralBps >= 500 ? 1 : 2) : 0;
    if ((order.referralBps || 0) !== rate || rate && order.referrer?.toLowerCase() !== referrer.referral.payoutWallet) throw Error('Referral payout terms changed. Please retry the auction.');
  }
  if (purchase) {
    const { buyerKey, sellerKey, listingId, orderHash } = purchase, seller = existing.get(sellerKey)?.state, buyer = updates.get(buyerKey)?.state;
    const listing = seller?.characters.flatMap(p => p.auctions || []).find(entry => entry.id === listingId);
    const order = listing?.reservation?.order;
    if (!buyer || !updates.has(sellerKey) || listing?.currency !== 'moss' || order?.orderHash !== orderHash
        || !buyer.characters.some(p => p.id === listing.reservation.buyerId)
        || updates.get(sellerKey).state.characters.some(p => p.auctions.some(entry => entry.id === listingId))) throw Error('Referral spend requires an atomic finalized auction delivery.');
    const cents = order.referralUsdCents;
    const referrerRow = row(buyer.referral.referredBy), referrer = referrerRow?.state;
    if (buyer.referral.referredBy && listing.reservation.referralBoundAt === buyer.referral.boundAt && referrer
        && !referrer.ban && !referrerRow.deleting && Number.isSafeInteger(cents) && cents > 0 && !referralWalletsOverlap(buyer, referrer)
        && !referralWallets(referrer).includes(order.buyer.toLowerCase()) && !referralWallets(referrer).includes(order.seller?.toLowerCase()) && sellerKey !== buyer.referral.referredBy) {
      buyer.referral.spentUsdCents = Math.min(Number.MAX_SAFE_INTEGER, buyer.referral.spentUsdCents + cents);
    }
  }
  if (!enabled) return [...updates.values()];
  for (const entry of projected) {
    const account = entry.state, referral = account.referral, key = entry.account_key;
    if (!referral?.referredBy || referral.qualified) continue;
    const referrer = row(referral.referredBy);
    if (key === referral.referredBy) throw Error('You cannot refer your own account.');
    if (!referrer || referrer.state.ban || referrer.deleting) { if (!existing.get(key).state.referral.referredBy) throw Error('The referrer is unavailable.'); else continue; }
    if (!existing.get(key).state.referral.referredBy && (referralWalletsOverlap(account, referrer.state) || referrer.state.referral.referredBy === key)) throw Error('Use a different account and wallet for referrals.');
    const reusedWallet = blockedWalletAccounts.has(key) || [...existing, ...updates].some(([otherKey, other]) => otherKey !== key && other.state.referral?.qualified && referralWalletsOverlap(account, other.state));
    if (reusedWallet || referral.level < REFERRAL_LEVEL || referral.days.length < REFERRAL_DAYS || referral.spentUsdCents < REFERRAL_USD_CENTS || referralWalletsOverlap(account, referrer.state)) continue;
    referral.qualified = true;
    if (!updates.has(referral.referredBy)) updates.set(referral.referredBy, { ...structuredClone(referrer), credits: {}, pending: structuredClone(referrer.pending_credits || referrer.pending || {}) });
    updates.get(referral.referredBy).state.referral.qualifiedCount++;
  }
  for (const entry of updates.values()) grantReferralRewards(entry.state);
  return [...updates.values()];
}
