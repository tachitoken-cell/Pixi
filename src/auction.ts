import { gearById, gearIdValid, starterGear } from './progression.ts';
import { bagCanFit } from './bags.ts';
import { itemLocked, itemLockKey } from './item-locks.ts';
import { LOOT_ITEMS, lootItemValid } from './loot-items.ts';
import type { Player } from './shared';

export const MOSS_TOKEN = { address: '0x6742883Eef788E2424CE5a1b0d4303144AaEc0a5', symbol: 'MOSS', decimals: 18, chainId: 4663 } as const;
export const MOSS_AUCTION_DEV_TEAM = '0x6D96b833C760774175Cc6E2c4F7424122EA3798f';
export type AuctionCurrency = 'gold' | 'eth' | 'moss';
export interface AuctionCryptoStatus { enabled: boolean; reason?: string; chainId?: number; contract?: string; previousContract?: string; previousContracts?: string[]; symbol?: string; testnet?: boolean; token?: string; decimals?: number; taxBps?: number; treasury?: string; devTeam?: string; referralsEnabled?: boolean; feeVersion?: 2 }
export interface AuctionItem { kind: 'gear' | 'resource' | 'item'; id: string; quantity: number }
export type AuctionAsset = AuctionItem | { kind: 'gold'; id: 'gold'; quantity: number };
export type AuctionPendingPurchase = { id: string; item: AuctionAsset; currency: AuctionCurrency; price: string; expiresAt: number };
export const auctionGoldFee = (quantity: number) => Math.ceil(quantity / 200);
export const auctionItemFee = (price: number) => Math.ceil(price / 20);
export interface AuctionOrder {
  listingId: string; buyer: string; seller: string; priceWei: string; deadline: number; signature: string; orderHash: string; chainId: number; contract: string;
  currency?: 'eth' | 'moss'; token?: string;
  referrer?: string; referralBps?: 0 | 10 | 25 | 50 | 75 | 100 | 500 | 1000; referralUsdCents?: number;
  paymentBlock?: { hash: string; number: string };
  approval?: { to: string; data: string; value: string; chainId: string };
  transaction: { to: string; data: string; value: string; chainId: string };
}
export const AUCTION_ORDER_TYPES = { Order: [
  { name: 'listingId', type: 'bytes32' }, { name: 'buyer', type: 'address' }, { name: 'seller', type: 'address' },
  { name: 'priceWei', type: 'uint256' }, { name: 'deadline', type: 'uint64' },
] };
export const MOSS_AUCTION_ORDER_TYPES = { Order: [...AUCTION_ORDER_TYPES.Order,
  { name: 'referrer', type: 'address' }, { name: 'referralBps', type: 'uint16' },
] };
export const auctionOrderTypes = (order: Pick<AuctionOrder, 'referralBps'>) => order.referralBps === undefined ? AUCTION_ORDER_TYPES : MOSS_AUCTION_ORDER_TYPES;
/** Historical MOSS reservations have neither referral field; new reservations bind both in the signature. */
export function auctionOrderReferralValid(order: Pick<AuctionOrder, 'currency' | 'buyer' | 'seller' | 'contract' | 'referrer' | 'referralBps' | 'referralUsdCents'>): boolean {
  if (order.currency !== 'moss') return order.referrer === undefined && order.referralBps === undefined && order.referralUsdCents === undefined;
  if (order.referralUsdCents !== undefined && (!Number.isSafeInteger(order.referralUsdCents) || order.referralUsdCents < 0)) return false;
  if (order.referrer === undefined || order.referralBps === undefined) return order.referrer === undefined && order.referralBps === undefined;
  if (order.referralBps === 0) return /^0x0{40}$/i.test(order.referrer);
  return [10, 25, 50, 75, 100, 500, 1000].includes(order.referralBps) && wallet(order.referrer)
    && ![order.buyer, order.seller, order.contract].some(value => typeof value === 'string' && value.toLowerCase() === order.referrer!.toLowerCase());
}
export interface AuctionListing {
  id: string; sellerId: string; sellerName: string; item: AuctionAsset;
  goldFee?: number;
  currency: AuctionCurrency; price: string; createdAt: number;
  sellerWallet?: string;
  reservation?: { buyerId: string; expiresAt: number; referralBoundAt?: number; order?: AuctionOrder; delivered?: true; processed?: true };
}
export interface AuctionSale {
  id: string; item: AuctionAsset; goldFee?: number; currency: AuctionCurrency; price: string; buyerName: string; soldAt: number;
}
export interface AuctionState {
  npcId?: string;
  open?: boolean;
  economyVersion?: number;
  goldExchangeEnabled?: boolean;
  listings: AuctionListing[]; mine: AuctionListing[];
  sold?: AuctionSale[];
  crypto: AuctionCryptoStatus & { moss?: AuctionCryptoStatus };
  wallet: string | null;
  reason?: string;
}
export const AUCTION_MAX_LISTINGS = 24;
export const AUCTION_MAX_SALES = 100;
export const AUCTION_MAX_QUANTITY = 1_000_000;
export const AUCTION_MAX_GOLD = 1_000_000_000;
export const AUCTION_RESOURCES = ['wood', 'crystal', 'herb', 'potion', 'relic'] as const;
const starterItems = new Set(['Ranger', 'Knight', 'Mage', 'Cleric'].flatMap(name => starterGear(name as Player['appearance']['className']).ownedGear));
const wallet = (value: unknown) => typeof value === 'string' && /^0x[\da-f]{40}$/i.test(value) && !/^0x0{40}$/i.test(value);
export const auctionEthPrice = (value: unknown): value is string => typeof value === 'string' && /^(?:0|[1-9]\d{0,5})(?:\.\d{1,18})?$/.test(value) && /[1-9]/.test(value);
/** Version 2 keeps 5% total: 1.25% each treasury/dev, remainder burns after volume-based referrals. */
export function auctionMossTax(price: string, referralBps = 0, feeVersion = referralBps > 0 && referralBps <= 100 ? 2 : 1): { tax: string; proceeds: string; burn: string; treasury: string; devTeam: string; referral?: string } | null {
  if (!auctionEthPrice(price) || ![1, 2].includes(feeVersion) || !(feeVersion === 2 ? [0, 10, 25, 50, 75, 100] : [0, 500, 1000]).includes(referralBps)) return null;
  const [whole, fraction = ''] = price.split('.');
  const amount = BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, '0')), tax = amount / 20n, share = tax / (feeVersion === 2 ? 4n : 10n);
  const decimal = (value: bigint) => { const digits = String(value).padStart(19, '0'); return `${digits.slice(0, -18)}.${digits.slice(-18)}`.replace(/\.?0+$/, ''); };
  const burn = tax - share * 2n, referral = referralBps ? (feeVersion === 2 ? amount : burn) * BigInt(referralBps) / 10000n : 0n;
  return { tax: decimal(tax), proceeds: decimal(amount - tax), burn: decimal(burn - referral), treasury: decimal(share), devTeam: decimal(share), ...(referralBps ? { referral: decimal(referral) } : {}) };
}
const uuid = (value: unknown) => typeof value === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(value);
export function auctionItemValid(item: unknown): item is AuctionItem {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  const value = item as AuctionItem;
  if (Object.keys(item).length !== 3 || !Number.isSafeInteger(value.quantity) || value.quantity < 1 || value.quantity > AUCTION_MAX_QUANTITY || typeof value.id !== 'string') return false;
  return value.kind === 'gear' ? value.quantity === 1 && gearIdValid(value.id) && !starterItems.has(value.id)
    : value.kind === 'item' ? lootItemValid(value.id)
    : value.kind === 'resource' && AUCTION_RESOURCES.includes(value.id as typeof AUCTION_RESOURCES[number]);
}
export function auctionAssetValid(item: unknown): item is AuctionAsset {
  if (auctionItemValid(item)) return true;
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  const asset = item as AuctionAsset;
  return Object.keys(item).length === 3 && asset.kind === 'gold' && asset.id === 'gold'
    && Number.isSafeInteger(asset.quantity) && asset.quantity >= 200 && asset.quantity <= AUCTION_MAX_GOLD;
}
function auctionFeeValid(row: Pick<AuctionListing, 'item' | 'currency' | 'price' | 'goldFee'>): boolean {
  return row.item.kind === 'gold' ? row.currency === 'moss' && row.goldFee === auctionGoldFee(row.item.quantity)
    : row.goldFee === undefined || row.currency === 'gold' && row.goldFee === auctionItemFee(Number(row.price));
}
export function auctionGoldPrice(price: unknown): number | null {
  return typeof price === 'string' && /^[1-9]\d{0,9}$/.test(price) && Number(price) <= AUCTION_MAX_GOLD ? Number(price) : null;
}
export function auctionListingsValid(player: Player): boolean {
  const listings = player.auctions;
  const sales = player.auctionSales === undefined ? [] : player.auctionSales;
  if (!Array.isArray(sales) || sales.length > AUCTION_MAX_SALES || new Set(sales.map(sale => sale?.id)).size !== sales.length
    || !sales.every(sale => sale && uuid(sale.id) && auctionAssetValid(sale.item) && auctionFeeValid(sale)
      && (sale.currency === 'gold' ? auctionGoldPrice(sale.price) !== null : (sale.currency === 'eth' || sale.currency === 'moss') && auctionEthPrice(sale.price))
      && typeof sale.buyerName === 'string' && sale.buyerName.length > 0 && sale.buyerName.length <= 20
      && !/[<>\u0000-\u001f\u007f]/.test(sale.buyerName) && sale.buyerName.trim() === sale.buyerName
      && Number.isSafeInteger(sale.soldAt) && sale.soldAt > 0 && Number.isFinite(new Date(sale.soldAt).getTime()))) return false;
  if (player.auctionWallet !== undefined && player.auctionWallet !== null && !wallet(player.auctionWallet)) return false;
  return Array.isArray(listings) && listings.length <= AUCTION_MAX_LISTINGS && new Set(listings.map(listing => listing?.id)).size === listings.length
    && listings.every(listing => listing && uuid(listing.id) && listing.sellerId === player.id && listing.sellerName === player.name
      && auctionAssetValid(listing.item) && auctionFeeValid(listing) && (listing.currency === 'gold' ? auctionGoldPrice(listing.price) !== null && !listing.sellerWallet && !listing.reservation
        : (listing.currency === 'eth' || listing.currency === 'moss') && auctionEthPrice(listing.price) && wallet(listing.sellerWallet) && (!listing.reservation || auctionReservationValid(listing)))
      && Number.isSafeInteger(listing.createdAt) && listing.createdAt > 0
      && (listing.item.kind !== 'gear' || !player.ownedGear.includes(listing.item.id)))
    && new Set(listings.filter(listing => listing.item.kind === 'gear').map(listing => listing.item.id)).size === listings.filter(listing => listing.item.kind === 'gear').length;
}
export function auctionRecordSale(player: Player, listing: AuctionListing, buyerName: string): AuctionSale[] {
  const { id, item, currency, price, goldFee } = listing;
  return [{ id, item: { ...item }, currency, price, ...(goldFee !== undefined ? { goldFee } : {}), buyerName, soldAt: Date.now() }, ...(player.auctionSales ?? []).filter(sale => sale.id !== id)].slice(0, AUCTION_MAX_SALES);
}
function auctionReservationValid(listing: AuctionListing): boolean {
  const reservation = listing.reservation, order = reservation?.order;
  return !!reservation && !!order && uuid(reservation.buyerId) && reservation.buyerId !== listing.sellerId
    && (reservation.processed === undefined || listing.item.kind === 'gold' && reservation.processed === true && !!order.paymentBlock)
    && (reservation.delivered === undefined || listing.item.kind !== 'gold' && reservation.delivered === true && !!order.paymentBlock)
    && (order.paymentBlock === undefined || !!order.paymentBlock && typeof order.paymentBlock.hash === 'string' && /^0x[\da-f]{64}$/i.test(order.paymentBlock.hash)
      && typeof order.paymentBlock.number === 'string' && /^0x(?:0|[1-9a-f][\da-f]*)$/i.test(order.paymentBlock.number))
    && (reservation.referralBoundAt === undefined ? order.referralUsdCents === undefined
      : Number.isSafeInteger(reservation.referralBoundAt) && reservation.referralBoundAt > 0 && reservation.referralBoundAt <= reservation.expiresAt)
    && Number.isSafeInteger(reservation.expiresAt) && reservation.expiresAt === order.deadline * 1000
    && /^0x[\da-f]{64}$/i.test(order.listingId) && /^0x[\da-f]{64}$/i.test(order.orderHash)
    && auctionOrderReferralValid(order)
    && wallet(order.buyer) && order.seller === listing.sellerWallet && wallet(order.contract) && [4663, 46630].includes(order.chainId)
    && (listing.currency === 'moss' ? order.currency === 'moss' && typeof order.token === 'string' && order.token.toLowerCase() === MOSS_TOKEN.address.toLowerCase() && order.chainId === MOSS_TOKEN.chainId
      && !!order.approval && typeof order.approval.to === 'string' && order.approval.to.toLowerCase() === MOSS_TOKEN.address.toLowerCase()
      && /^0x[\da-f]+$/i.test(order.approval.data) && order.approval.value === '0x0' && order.approval.chainId === '0x1237' && order.transaction?.value === '0x0'
      : (order.currency === undefined || order.currency === 'eth') && order.token === undefined && order.approval === undefined)
    && typeof order.priceWei === 'string' && /^[1-9]\d{0,24}$/.test(order.priceWei)
    && /^0x[\da-f]{130}$/i.test(order.signature) && !!order.transaction
    && order.transaction.to === order.contract && /^0x[\da-f]+$/i.test(order.transaction.data)
    && /^0x[\da-f]+$/i.test(order.transaction.value) && /^0x[\da-f]+$/i.test(order.transaction.chainId);
}
export function auctionEscrowHas(player: Player, gearId: string): boolean {
  return !!player.auctions?.some(listing => listing.item.kind === 'gear' && listing.item.id === gearId);
}
export function auctionCanList(player: Player, item: AuctionAsset): boolean {
  if (!auctionAssetValid(item) || (player.auctions?.length || 0) >= AUCTION_MAX_LISTINGS) return false;
  if (item.kind === 'gold') return player.gold >= item.quantity;
  if (itemLocked(player, itemLockKey(item))) return false;
  return item.kind === 'gear' ? player.ownedGear.includes(item.id) && !Object.values(player.equipment).includes(item.id)
    : item.kind === 'item' ? (player.carriedItems?.[item.id] || 0) >= item.quantity
    : player.inventory[item.id as keyof Player['inventory']] >= item.quantity;
}
export function auctionCanReceive(player: Player, item: AuctionAsset, returning = false): boolean {
  if (!auctionAssetValid(item)) return false;
  if (item.kind === 'gold') return Number.isSafeInteger(player.gold + (item.quantity - (returning ? 0 : auctionGoldFee(item.quantity))));
  if (!bagCanFit(player, { ...player, ...auctionItemChanges(player, item, 1) })) return false;
  return item.kind === 'gear' ? !player.ownedGear.includes(item.id) && !auctionEscrowHas(player, item.id)
    && (returning || !gearById(item.id)!.className || gearById(item.id)!.className === player.appearance.className) && gearById(item.id)!.requiredLevel <= player.level
    : item.kind === 'item' ? Number.isSafeInteger((player.carriedItems?.[item.id] || 0) + item.quantity)
    : Number.isSafeInteger(player.inventory[item.id as keyof Player['inventory']] + item.quantity);
}
export function auctionItemChanges(player: Player, item: AuctionAsset, direction: 1 | -1): Pick<Player, 'ownedGear'> | Pick<Player, 'inventory'> | Pick<Player, 'carriedItems'> | Pick<Player, 'gold'> {
  if (item.kind === 'gold') return { gold: player.gold + item.quantity * direction };
  if (item.kind === 'gear') return { ownedGear: direction === 1 ? [...player.ownedGear, item.id] : player.ownedGear.filter(id => id !== item.id) };
  if (item.kind === 'item') {
    const carriedItems = { ...player.carriedItems, [item.id]: (player.carriedItems?.[item.id] || 0) + item.quantity * direction };
    if (!carriedItems[item.id]) delete carriedItems[item.id];
    return { carriedItems };
  }
  const id = item.id as keyof Player['inventory'];
  return { inventory: { ...player.inventory, [id]: player.inventory[id] + item.quantity * direction } };
}
export function auctionItemLabel(item: AuctionAsset): string {
  if (item.kind === 'gold') return 'Gold';
  return item.kind === 'gear' ? gearById(item.id)!?.label || item.id : item.kind === 'item' ? LOOT_ITEMS[item.id]?.label || item.id
    : ({ wood: 'Wood', crystal: 'Crystals', herb: 'Herbs', potion: 'Healing potions', relic: 'Relics' } as Record<string, string>)[item.id] || item.id;
}
