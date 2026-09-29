import { CHARACTER_CLASSES, type CharacterClass, type Player } from './shared.ts';
import { bagCanFit } from './bags.ts';
import { MOSS_TOKEN } from './auction.ts';
import { GOLD_BOOST_COSTS } from './gold-economy.ts';

export const STORE_BOOST_DURATION_MS = 60 * 60 * 1000;
export const STORE_BOOST_IDS = ['profession-xp', 'combat-xp', 'damage', 'defense'] as const;
export type StoreBoostId = typeof STORE_BOOST_IDS[number];
export type StoreBoostValues = Partial<Record<StoreBoostId, number>>;
/** Complimentary content granted by the offline operator, never a payment receipt. */
export interface StoreGrant {
  id: string; characterId: string; productId: string; grantedAt: number; reason: 'review-access';
}
// ponytail: keep the character's immutable receipts together; archive receipts if 10,000 orders becomes common.
export const STORE_MAX_ORDERS = 10_000;
export const BOOST_PRODUCTS = [
  { id: 'store-profession-xp', kind: 'boost', boostId: 'profession-xp', name: 'Profession XP Boost', description: '+50% profession XP for 1 hour. Includes gathering and crafting. Activate after delivery; time continues while offline.', usdPrice: 2, icon: 'gather' },
  { id: 'store-combat-xp', kind: 'boost', boostId: 'combat-xp', name: 'XP Boost', description: '+50% character XP for 1 hour. Activate after delivery; time continues while offline.', usdPrice: 2, icon: 'book' },
  { id: 'store-damage', kind: 'boost', boostId: 'damage', name: 'Damage Power Up', description: '+20% damage for 1 hour. Activate after delivery; time continues while offline.', usdPrice: 2, icon: 'sword' },
  { id: 'store-defense', kind: 'boost', boostId: 'defense', name: 'Defense Power Up', description: '+20% defense for 1 hour. Activate after delivery; time continues while offline.', usdPrice: 2, icon: 'shield' },
] as const;
export const SP_STORE_PRODUCTS = [
  { id:'store-sp-protection-roll', kind:'sp-item', itemId:'sp-protection-roll', name:'Protection Roll', description:'Consumed on one specialist upgrade attempt. Prevents a fracture without increasing the success chance. Trade unused rolls for gold at the Auction House.', usdPrice:2, icon:'book' },
  { id:'store-sp-revival-core', kind:'sp-item', itemId:'sp-revival-core', name:'Soul Revival Core', description:'Repairs one fractured specialist while preserving every upgrade and job level. Trade unused cores for gold at the Auction House.', usdPrice:5, icon:'crystal' },
  { id:'store-sp-specialist-case', kind:'sp-item', itemId:'sp-specialist-case', name:'Specialist Case', description:'Seal one specialist as a transferable NFT. Every reseal consumes a new case. Trade unused cases for gold at the Auction House.', usdPrice:10, icon:'bag' },
] as const;
export const STORE_PRODUCTS = [
  { id: 'store-embermane', kind: 'mount', rewardId: 'store-embermane', name: 'Embermane', description: 'A flame-crowned steed in ember-forged armor. Requires level 25 and riding training to summon.', usdPrice: 40, icon: '/ui/store/store-embermane.png' },
  { id: 'store-cinderfang', kind: 'mount', rewardId: 'store-cinderfang', name: 'Cinderfang', description: 'An armored ash wolf with a blazing mane. Requires level 25 and riding training to summon.', usdPrice: 40, icon: '/ui/store/store-cinderfang.png' },
  { id: 'store-ashwing', kind: 'pet', rewardId: 'store-ashwing', name: 'Ashwing', description: 'A little ember drake with a crown of fire. A cosmetic companion for your travels.', usdPrice: 20, icon: '/ui/store/store-ashwing.png' },
  { id: 'store-cinder-kit', kind: 'pet', rewardId: 'store-cinder-kit', name: 'Cinder Kit', description: 'A curious fox with twin ember tails. A cosmetic companion for your travels.', usdPrice: 20, icon: '/ui/store/store-cinder-kit.png' },
  ...BOOST_PRODUCTS,
  ...SP_STORE_PRODUCTS,
  { id: 'store-class-change', kind: 'class-change', name: 'Class Change', description: 'Burn $50 worth of MOSS for one class change. Keep your level, progress and items. All trained abilities and talent choices reset. Current gear moves to your inventory or bank; your new class starts with basic gear.', usdPrice: 50, icon: 'book' },
  { id: 'store-cosmetic-box', kind: 'gacha', name: 'Cinder Cosmetic Box', description: 'One random, unowned Cinder mount or pet. Equal odds for every remaining reward. No duplicate rewards. Opens after the burn is processed.', usdPrice: 5, icon: 'dice' },
] as const;
// Retired products still validate saved orders and deliver or refund existing payments.
const RETIRED_STORE_PRODUCTS = [
  { id: 'burned', kind: 'title', rewardId: 'burned', name: 'Burned', description: 'Retired store title. Existing owners can still equip it.', usdPrice: 100, icon: '/ui/store/burned.png' },
] as const;
export type StoreProduct = typeof STORE_PRODUCTS[number] | typeof RETIRED_STORE_PRODUCTS[number];
export type StoreReward = { kind:'sp-item'; itemId:typeof SP_STORE_PRODUCTS[number]['itemId']; grantedAt:number } | { kind: 'boost'; boostId: StoreBoostId; grantedAt: number } | { kind: 'cosmetic'; productId: string; grantedAt: number }
  | { kind: 'class-change'; grantedAt: number; className?: CharacterClass; redeemedAt?: number };
export type StoreTransaction = { to: string; data: string; value: string; chainId: string };
export interface StoreOrder {
  id: string; productId: string; characterId: string; wallet: string; amountWei: string; mossAmount: string; usdPrice: number;
  quotedAt: number; expiresAt: number; chainId: number; token: string;
  contract: string; transaction: StoreTransaction; approval: StoreTransaction;
  status: 'quoted' | 'submitted' | 'processed' | 'delivered' | 'expired'; transactionHash?: string;
  reward?: StoreReward;
  paymentBlock?: { hash: string; number: string };
  signature: string; orderHash: string;
  contractOrder: { orderId: string; productId: string; characterId: string; buyer: string; amountWei: string; usdCents: string; deadline: number };
  price?: { usdWei: string; observedAt: number; source: string; sourceUrl?: string; poolId?: string; sampledBlocks?: string[]; sampleWindowSeconds?: number; issuerGeneratedAt?: string; rblxUsdWei?: string };
}
export interface StoreState {
  wallet: string | null; enabled: boolean; reason?: string; owned: string[]; orders: StoreOrder[];
  mobile?: { apple: boolean; google: boolean };
  mobileOrders?: Pick<MobileStoreOrder, 'id' | 'productId' | 'status' | 'createdAt' | 'expiresAt' | 'reward' | 'reason'>[];
  chainId?: number; token?: string; contract?: string;
  consumables?: StoreBoostValues; boosts?: StoreBoostValues;
}
export type MobileStorePlatform = 'apple' | 'google';
export interface MobileStoreOrder {
  id: string; characterId: string; productId: string; sku: string; platform: MobileStorePlatform;
  createdAt: number; expiresAt: number; status: 'pending' | 'abandoned' | 'delivered' | 'payment-confirmed' | 'refunded';
  abandonedAt?: number; activation?: { startsAt: number; endsAt: number };
  revocation?: { at: number; eventId: string; consumedMs: number };
  paymentId?: string; purchasedAt?: number; sandbox?: boolean; reward?: StoreReward;
  reason?: 'duplicate-cosmetic' | 'cosmetic-conflict' | 'empty-cosmetic-pool';
}
// Identifiers stay immutable once registered with either store.
export const MOBILE_STORE_SKUS: Readonly<Record<string, string>> = Object.freeze({
  'store-embermane': 'world.mossvale.game.store_embermane',
  'store-cinderfang': 'world.mossvale.game.store_cinderfang',
  'store-ashwing': 'world.mossvale.game.store_ashwing',
  'store-cinder-kit': 'world.mossvale.game.store_cinder_kit',
  burned: 'world.mossvale.game.burned',
  'store-profession-xp': 'world.mossvale.game.store_profession_xp',
  'store-combat-xp': 'world.mossvale.game.store_combat_xp',
  'store-damage': 'world.mossvale.game.store_damage',
  'store-defense': 'world.mossvale.game.store_defense',
  'store-cosmetic-box': 'world.mossvale.game.store_cosmetic_box',
});
export const mobileIntentIdValid = (id: unknown): id is string => typeof id === 'string' && /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/.test(id);
export function mobilePurchaseConflict(player: Player, product: StoreProduct, now = Date.now(), excluding?: string): MobileStoreOrder['reason'] | undefined {
  if (!storeRepeatable(product) && player.storePurchases?.includes(product.id)) return 'duplicate-cosmetic';
  if (product.kind === 'gacha' && !storeCosmeticPool(player).length) return 'empty-cosmetic-pool';
  const cosmetic = (item: StoreProduct) => ['mount', 'pet', 'gacha'].includes(item.kind);
  const conflicts = (id: string) => id === product.id && !storeRepeatable(product) || cosmetic(product) && cosmetic(storeProduct(id)!)
    && (product.kind === 'gacha' || storeProduct(id)!.kind === 'gacha');
  if (player.storeOrders?.some(order => !['delivered', 'expired'].includes(order.status) && conflicts(order.productId))
      || player.mobileStoreOrders?.some(order => order.id !== excluding && (order.status === 'payment-confirmed' || order.status === 'pending' && order.expiresAt > now) && conflicts(order.productId))) return 'cosmetic-conflict';
}
export function mobileRewardChanges(player: Player, order: MobileStoreOrder, now = Date.now(), random = Math.random): { reward: StoreReward; changes: Partial<Player> } {
  const product = storeProduct(order.productId)!;
  if (!product || !MOBILE_STORE_SKUS[product.id]) throw Error('This reward requires a MOSS burn in the browser game.');
  if (storeRepeatable(product)) {
    // Reward selection is shared with verified burns, but native receipt history
    // remains separate and can never masquerade as a signed burn order.
    return repeatableRewardChanges(player, product, now, random);
  }
  return { reward: { kind: 'cosmetic', productId: product.id, grantedAt: now }, changes: {
    storePurchases: [...(player.storePurchases || []), product.id],
    ...(product.kind === 'mount' ? { ownedMounts: [...player.ownedMounts, product.rewardId] } : {}),
    ...(product.kind === 'pet' ? { ownedPets: [...player.ownedPets, product.rewardId] } : {}),
  } };
}
export const storeProductForSale = (id: unknown) => STORE_PRODUCTS.find(product => product.id === id);
export const storeProduct = (id: unknown): StoreProduct | undefined => storeProductForSale(id) || RETIRED_STORE_PRODUCTS.find(product => product.id === id);
export const storeRepeatable = (product: StoreProduct) => product.kind === 'boost' || product.kind === 'gacha' || product.kind === 'class-change' || product.kind === 'sp-item';
export const storeCosmeticPool = (player: Pick<Player, 'ownedMounts' | 'ownedPets' | 'storePurchases'>) => STORE_PRODUCTS.filter(product =>
  (product.kind === 'mount' || product.kind === 'pet') && !(player.storePurchases || []).includes(product.id)
  && !(product.kind === 'mount' ? player.ownedMounts as readonly string[] : player.ownedPets as readonly string[])?.includes(product.rewardId));
export function storeRewardChanges(player: Player, order: StoreOrder, now = Date.now(), random = Math.random): { reward: StoreReward; changes: Partial<Player> } {
  const product = storeProduct(order.productId);
  if (!product || !storeRepeatable(product) || !(order.status === 'delivered' || product.kind === 'class-change' && order.status === 'processed') || order.reward || !Number.isSafeInteger(now) || now <= 0) throw Error('The reward needs a verified store payment.');
  return repeatableRewardChanges(player, product, now, random);
}
function repeatableRewardChanges(player: Player, product: StoreProduct, now: number, random: () => number): { reward: StoreReward; changes: Partial<Player> } {
  if (product.kind === 'sp-item') {
    const count=(player.carriedItems?.[product.itemId]||0)+1;
    if(!Number.isSafeInteger(count))throw Error('This item stack is full.');
    const changes={carriedItems:{...player.carriedItems,[product.itemId]:count}};
    if(!bagCanFit(player,changes))throw Error('Make room in your bags, then check delivery again. Your payment remains saved.');
    return {reward:{kind:'sp-item',itemId:product.itemId,grantedAt:now},changes};
  }
  if (product.kind === 'class-change') return { reward: { kind: 'class-change', grantedAt: now }, changes: {} };
  if (product.kind === 'boost') return { reward: { kind: 'boost', boostId: product.boostId, grantedAt: now },
    changes: { storeConsumables: { ...player.storeConsumables, [product.boostId]: (player.storeConsumables?.[product.boostId] || 0) + 1 } } };
  const pool = storeCosmeticPool(player), roll = random();
  if (!pool.length) throw Error('This character already owns the complete Cinder collection.');
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw Error('Invalid cosmetic reward roll.');
  const reward = pool[Math.floor(roll * pool.length)];
  if (reward.kind !== 'mount' && reward.kind !== 'pet') throw Error('Invalid cosmetic reward.');
  return { reward: { kind: 'cosmetic', productId: reward.id, grantedAt: now }, changes: {
    storePurchases: [...new Set([...(player.storePurchases || []), reward.id])],
    ...(reward.kind === 'mount' ? { ownedMounts: [...player.ownedMounts, reward.rewardId] } : { ownedPets: [...player.ownedPets, reward.rewardId] }),
  } };
}
export function storeActivationChanges(player: Player, boostId: unknown, now = Date.now()): Partial<Pick<Player, 'storeConsumables' | 'storeBoosts' | 'mobileStoreOrders'>> | null {
  if (!STORE_BOOST_IDS.includes(boostId as StoreBoostId) || !Number.isSafeInteger(now) || now <= 0) return null;
  const id = boostId as StoreBoostId, count = player.storeConsumables?.[id] || 0;
  const endsAt = Math.max(now, player.storeBoosts?.[id] || 0) + STORE_BOOST_DURATION_MS;
  if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(endsAt)) return null;
  // Consume an attributable native charge before legacy/web charges. Its exact
  // scheduled interval lets a later refund remove only its remaining benefit.
  const native = player.mobileStoreOrders?.find(order => order.status === 'delivered' && order.reward?.kind === 'boost' && order.reward.boostId === id && !order.activation);
  return { storeConsumables: { ...player.storeConsumables, [id]: count - 1 }, storeBoosts: { ...player.storeBoosts, [id]: endsAt },
    ...(native ? { mobileStoreOrders: player.mobileStoreOrders!.map(order => order.id === native.id ? { ...order, activation: { startsAt: endsAt - STORE_BOOST_DURATION_MS, endsAt } } : order) } : {}) };

}
export function mobileRefundChanges(player: Player, order: MobileStoreOrder, event: { at: number; eventId: string }, now = Date.now()): Partial<Player> {
  if (order.status === 'refunded') return {};
  const changes: Partial<Player> = {}, reward = order.status === 'delivered' ? order.reward : undefined;
  let consumedMs = 0, orders = player.mobileStoreOrders || [];
  if (reward?.kind === 'boost') {
    const id = reward.boostId;
    if (!order.activation) {
      const count = player.storeConsumables?.[id] || 0;
      if (count < 1) throw Object.assign(Error('This purchase needs support review before its benefit can be revoked.'), { code: 'PURCHASE_RECOVERY_REQUIRED' });
      changes.storeConsumables = { ...player.storeConsumables, [id]: count - 1 };
    } else {
      const { startsAt, endsAt } = order.activation;
      consumedMs = Math.min(STORE_BOOST_DURATION_MS, Math.max(0, now - startsAt));
      const remaining = STORE_BOOST_DURATION_MS - consumedMs;
      const adjustedEnd = (player.storeBoosts?.[id] || 0) - remaining;
      changes.storeBoosts = { ...player.storeBoosts, [id]: adjustedEnd > now ? adjustedEnd : 0 };
      if (remaining) {
        orders = orders.map(other => other.id !== order.id && other.status === 'delivered' && other.reward?.kind === 'boost'
          && other.reward.boostId === id && other.activation && other.activation.startsAt >= endsAt
          ? { ...other, activation: { startsAt: other.activation.startsAt - remaining, endsAt: other.activation.endsAt - remaining } } : other);
      }
    }
  } else if (reward?.kind === 'cosmetic') {
    const product = storeProduct(reward.productId)!;
    changes.storePurchases = (player.storePurchases || []).filter(id => id !== product.id);
    if (product.kind === 'mount') changes.ownedMounts = player.ownedMounts.filter(id => id !== product.rewardId);
    if (product.kind === 'pet') { changes.ownedPets = player.ownedPets.filter(id => id !== product.rewardId); if (player.summonedPet === product.rewardId) changes.summonedPet = null; }
    if (player.title === product.id) changes.title = null;
  }
  changes.mobileStoreOrders = orders.map(item => item.id === order.id ? { ...item, ...order, status: 'refunded', revocation: { ...event, consumedMs } } : item);
  return changes;
}
export function storeBoostMultiplier(player: Pick<Player, 'storeBoosts'>, boostId: StoreBoostId, now = Date.now()): number {
  return (player.storeBoosts?.[boostId] || 0) > now ? boostId === 'profession-xp' || boostId === 'combat-xp' ? 1.5 : 1.2 : 1;
}
const hash = (value: unknown) => typeof value === 'string' && /^0x[\da-f]{64}$/i.test(value);
const address = (value: unknown) => typeof value === 'string' && /^0x[\da-f]{40}$/i.test(value) && !/^0x0{40}$/i.test(value);
/** Only verified MOSS rewards can leave the refundable character entitlement system. */
export function storeNftConvertible(player: Pick<Player, 'storeOrders'>, assetId: string): boolean {
  return !!player.storeOrders?.some(order => {
    const product = storeProduct(order.reward?.kind === 'cosmetic' ? order.reward.productId : order.productId);
    return order.status === 'delivered' && (product?.kind === 'pet' || product?.kind === 'mount') && product.rewardId === assetId;
  });
}
export function storePlayerValid(player: Player): boolean {
  const orders = player.storeOrders, owned = player.storePurchases;
  if (!Array.isArray(orders) || orders.length > STORE_MAX_ORDERS || !Array.isArray(owned) || new Set(owned).size !== owned.length
      || owned.some(id => !storeProduct(id) || storeRepeatable(storeProduct(id)!)) || new Set(orders.map(order => order?.id)).size !== orders.length) return false;
  if (!orders.every(order => {
    const product = storeProduct(order?.productId), signed = order?.contractOrder;
    return product && order.characterId === player.id && typeof order.id === 'string' && /^[\da-f-]{36}$/.test(order.id)
      && address(order.wallet) && address(order.contract) && order.token === MOSS_TOKEN.address && order.chainId === MOSS_TOKEN.chainId
      && order.usdPrice === product.usdPrice && typeof order.amountWei === 'string' && /^[1-9]\d{0,77}$/.test(order.amountWei)
      && typeof order.mossAmount === 'string' && /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(order.mossAmount)
      && signed && Object.keys(signed).length === 7 && (['orderId', 'productId', 'characterId'] as const).every(key => hash(signed[key]) && !/^0x0{64}$/.test(signed[key]))
      && signed.buyer === order.wallet && signed.amountWei === order.amountWei && String(signed.usdCents) === String(product.usdPrice * 100)
      && Number.isSafeInteger(signed.deadline) && signed.deadline * 1000 === order.expiresAt
      && Number.isSafeInteger(order.quotedAt) && order.quotedAt > 0 && Number.isSafeInteger(order.expiresAt) && order.expiresAt > order.quotedAt
      && ['quoted', 'submitted', 'processed', 'delivered', 'expired'].includes(order.status) && (!order.transactionHash || hash(order.transactionHash))
      && (order.paymentBlock === undefined ? order.status !== 'processed' : order.paymentBlock && typeof order.paymentBlock === 'object'
        && !Array.isArray(order.paymentBlock) && Object.keys(order.paymentBlock).length === 2
        && hash(order.paymentBlock.hash) && !/^0x0{64}$/i.test(order.paymentBlock.hash)
        && typeof order.paymentBlock.number === 'string' && /^0x(?:0|[1-9a-fA-F][\da-fA-F]*)$/.test(order.paymentBlock.number))
      && hash(order.orderHash) && typeof order.signature === 'string' && /^0x[\da-f]{130}$/i.test(order.signature)
      && [order.transaction, order.approval].every(tx => tx && address(tx.to) && typeof tx.data === 'string' && /^0x[\da-f]+$/i.test(tx.data) && tx.value === '0x0' && tx.chainId === '0x1237');
  })) return false;
  const active = orders.filter(order => !['delivered', 'expired'].includes(order.status) && !(order.reward?.kind === 'class-change' && order.reward.redeemedAt !== undefined));
  if (new Set(active.map(order => order.productId)).size !== active.length) return false;
  const granted: string[] = [];
  const deliveredBoosts: StoreBoostValues = {};
  const grants = player.storeGrants === undefined ? [] : player.storeGrants;
  if (!Array.isArray(grants) || grants.length > STORE_MAX_ORDERS || new Set(grants.map(grant => grant?.id)).size !== grants.length) return false;
  for (const grant of grants) {
    const product = storeProduct(grant?.productId);
    if (!product || Array.isArray(grant) || !['mount', 'pet', 'title', 'boost'].includes(product.kind) || !mobileIntentIdValid(grant.id) || grant.characterId !== player.id
        || grant.reason !== 'review-access' || !Number.isSafeInteger(grant.grantedAt) || grant.grantedAt <= 0
        || Object.keys(grant).length !== 5) return false;
    if (product.kind === 'boost') deliveredBoosts[product.boostId] = (deliveredBoosts[product.boostId] || 0) + 1;
    else granted.push(product.id);
  }
  for (const order of orders) {
    const product = storeProduct(order.productId)!, reward = order.reward;
    if (product.kind === 'class-change') {
      const verified = order.status === 'processed' || order.status === 'delivered';
      if (!reward) { if (reward !== undefined || verified) return false; continue; }
      if (reward.kind !== 'class-change' || !order.paymentBlock || !Number.isSafeInteger(reward.grantedAt) || reward.grantedAt < order.quotedAt) return false;
      if (reward.redeemedAt === undefined) {
        if (!verified || Object.keys(reward).length !== 2) return false;
      } else if (!Number.isSafeInteger(reward.redeemedAt) || reward.redeemedAt < reward.grantedAt
          || !CHARACTER_CLASSES.includes(reward.className!) || Object.keys(reward).length !== 4) return false;
      // A used receipt survives a later reorg: never rewind character progress or grant a second swap.
      continue;
    }
    if (!storeRepeatable(product)) {
      if (reward !== undefined) return false;
      if (order.status === 'processed' || order.status === 'delivered') granted.push(product.id);
      continue;
    }
    if (order.status !== 'delivered') { if (reward !== undefined) return false; continue; }
    if (!reward || !order.paymentBlock || !Number.isSafeInteger(reward.grantedAt) || reward.grantedAt < order.quotedAt
      || Object.keys(reward).length !== 3) return false;
    if (product.kind === 'boost') {
      if (reward.kind !== 'boost' || reward.boostId !== product.boostId) return false;
      deliveredBoosts[product.boostId] = (deliveredBoosts[product.boostId] || 0) + 1;
    } else if(product.kind === 'sp-item') {
      if(reward.kind !== 'sp-item' || reward.itemId !== product.itemId)return false;
    } else {
      if (reward.kind !== 'cosmetic') return false;
      const cosmetic = storeProduct(reward.productId);
      if (!cosmetic || cosmetic.kind !== 'mount' && cosmetic.kind !== 'pet') return false;
      granted.push(cosmetic.id);
    }
  }
  const mobile = player.mobileStoreOrders === undefined ? [] : player.mobileStoreOrders;
  if (!Array.isArray(mobile) || mobile.length > STORE_MAX_ORDERS || new Set(mobile.map(order => order?.id)).size !== mobile.length) return false;
  for (const order of mobile) {
    const product = storeProduct(order?.productId), reward = order?.reward;
    if (!product || !MOBILE_STORE_SKUS[product.id] || !mobileIntentIdValid(order.id) || order.characterId !== player.id || order.sku !== MOBILE_STORE_SKUS[product.id]
        || !['apple', 'google'].includes(order.platform) || !Number.isSafeInteger(order.createdAt) || order.createdAt <= 0
        || !Number.isSafeInteger(order.expiresAt) || order.expiresAt <= order.createdAt
        || !['pending', 'abandoned', 'delivered', 'payment-confirmed', 'refunded'].includes(order.status)
        || Object.keys(order).some(key => !['id', 'characterId', 'productId', 'sku', 'platform', 'createdAt', 'expiresAt', 'status', 'paymentId', 'purchasedAt', 'sandbox', 'reward', 'reason', 'abandonedAt', 'activation', 'revocation'].includes(key))) return false;
    if (order.abandonedAt !== undefined && (!Number.isSafeInteger(order.abandonedAt) || order.abandonedAt < order.createdAt)) return false;
    if (order.status === 'abandoned' && order.abandonedAt === undefined) return false;
    if (order.activation !== undefined && (product.kind !== 'boost' || !reward || Object.keys(order.activation).length !== 2
        || !Number.isSafeInteger(order.activation.startsAt) || order.activation.startsAt < order.createdAt
        || order.activation.endsAt - order.activation.startsAt !== STORE_BOOST_DURATION_MS)) return false;
    if (order.status === 'pending' || order.status === 'abandoned') {
      if (['paymentId', 'purchasedAt', 'sandbox', 'reward', 'reason', 'activation', 'revocation'].some(key => Object.hasOwn(order, key))) return false;
      continue;
    }
    if (typeof order.paymentId !== 'string' || !(order.platform === 'apple' ? /^\d{1,40}$/ : /^[\da-f]{64}$/).test(order.paymentId)
        || !Number.isSafeInteger(order.purchasedAt) || order.purchasedAt! < order.createdAt - 30000 || typeof order.sandbox !== 'boolean') return false;
    if (order.status === 'refunded') {
      if (!order.revocation || Object.keys(order.revocation).length !== 3 || !Number.isSafeInteger(order.revocation.at)
          || order.revocation.at < order.createdAt - 30000 || typeof order.revocation.eventId !== 'string' || order.revocation.eventId.length > 200
          || !Number.isSafeInteger(order.revocation.consumedMs) || order.revocation.consumedMs < 0 || order.revocation.consumedMs > STORE_BOOST_DURATION_MS) return false;
      continue; // The original reward remains in history, but grants no entitlement.
    }
    if (order.revocation !== undefined) return false;
    if (order.status === 'payment-confirmed') {
      if (reward !== undefined || !['duplicate-cosmetic', 'cosmetic-conflict', 'empty-cosmetic-pool'].includes(order.reason!)) return false;
      continue;
    }
    if (order.reason !== undefined || !reward || Object.keys(reward).length !== 3 || !Number.isSafeInteger(reward.grantedAt) || reward.grantedAt < order.createdAt) return false;
    if (product.kind === 'boost') {
      if (reward.kind !== 'boost' || reward.boostId !== product.boostId) return false;
      deliveredBoosts[product.boostId] = (deliveredBoosts[product.boostId] || 0) + 1;
    } else {
      if (reward.kind !== 'cosmetic') return false;
      const cosmetic = storeProduct(reward.productId);
      if (!cosmetic || (product.kind === 'gacha' ? cosmetic.kind !== 'mount' && cosmetic.kind !== 'pet' : cosmetic.id !== product.id)) return false;
      granted.push(cosmetic.id);
    }
  }
  const valuesValid = (values: StoreBoostValues | undefined) => values === undefined || values !== null && typeof values === 'object' && !Array.isArray(values)
    && Object.entries(values).every(([key, value]) => STORE_BOOST_IDS.includes(key as StoreBoostId) && Number.isSafeInteger(value) && value >= 0);
  if (!valuesValid(player.storeConsumables) || !valuesValid(player.storeBoosts)) return false;
  // Gold purchases have no paid receipt; only receipt-exclusive boosts can use
  // paid delivery counts as their ownership bound. All receipts still validate above.
  if (STORE_BOOST_IDS.some(id => !Object.hasOwn(GOLD_BOOST_COSTS, id) && ((player.storeConsumables?.[id] || 0) > (deliveredBoosts[id] || 0)
    || (player.storeBoosts?.[id] || 0) > 0 && (deliveredBoosts[id] || 0) <= (player.storeConsumables?.[id] || 0)))) return false;
  return new Set(granted).size === granted.length && granted.length === owned.length && granted.every(id => owned.includes(id))
    && STORE_PRODUCTS.every(product => {
      if (product.kind !== 'mount' && product.kind !== 'pet') return true;
      const collection: readonly string[] = product.kind === 'mount' ? player.ownedMounts : player.ownedPets;
      const converted = player.nftOrders?.some(order => order.kind === product.kind && order.claimSource === 'learned'
        && order.assetId === product.rewardId && ['quoted', 'minted'].includes(order.status));
      if (converted && (!storeNftConvertible(player, product.rewardId) || collection?.includes(product.rewardId))) return false;
      return !!(collection?.includes(product.rewardId) || converted) === owned.includes(product.id);
    });
}
