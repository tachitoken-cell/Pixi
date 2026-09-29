import type { Contract, Recipe } from './adventure.ts';
import type { Player } from './shared.ts';
import type { StoreBoostId } from './ingame-store.ts';

export const GOLD_ZEPPELIN_COST = 25;
export const GOLD_CLASS_CHANGE_COST = 2500;
export const GOLD_BOOST_COSTS: Readonly<Record<StoreBoostId, number>> = { 'profession-xp': 250, 'combat-xp': 250, damage: 500, defense: 500 };
/** Apply once, to a source reward or unit resale quote; never to transfers. */
export function goldSource(amount: number, source: 'monster' | 'boss' | 'cache' | 'treasure' | 'contract' | 'resale', active = false): number {
  return active && amount > 0 ? Math.max(1, Math.floor(amount / (source === 'monster' ? 4 : 2))) : amount;
}
export const craftingGoldCost = (recipe: Recipe, active = false) => !active ? 0 : recipe.output.gear ? 5 * recipe.requiredLevel : (recipe.output.quantity ?? 1) * (recipe.output.item === 'greater-tonic' ? 3 : 1);
export const talentResetGoldCost = (player: Pick<Player, 'level' | 'talents'>, active = false) => active && player.talents.length ? 5 * player.level : 0;
export const contractCooldown = (contract: Contract, active = false) => active && contract.targetRegion ? 15 * 60 * 1000 : contract.cooldownMs;
export const goldStorePrice = (productId: string, active = false) => !active ? 0 : productId === 'store-class-change' ? GOLD_CLASS_CHANGE_COST : GOLD_BOOST_COSTS[productId.replace(/^store-/, '') as StoreBoostId] || 0;
export function goldBoostPurchase(player: Pick<Player, 'gold' | 'storeConsumables'>, boostId: unknown, active = false) {
  if (!active || typeof boostId !== 'string' || !Object.hasOwn(GOLD_BOOST_COSTS, boostId)) return null;
  const id = boostId as StoreBoostId, price = GOLD_BOOST_COSTS[id], charges = player.storeConsumables?.[id] || 0;
  if (!Number.isSafeInteger(player.gold) || player.gold < price || !Number.isSafeInteger(charges + 1)) return null;
  return { gold: player.gold - price, storeConsumables: { ...player.storeConsumables, [id]: charges + 1 } };
}
