import { VILLAGE_NPCS } from './settlements.ts';
import type { Player } from './shared';
import { carriedItemsValid } from './loot-items.ts';

export type BagKind = 'linen-pouch' | 'trail-satchel' | 'wayfarer-pack' | 'runewoven-holdall';
export interface BagDefinition { id: BagKind; label: string; description: string; slots: number; price: number; requiredLevel: number; quality: 'common' | 'uncommon' | 'rare' | 'epic' }
export interface OwnedBag { id: string; kind: BagKind }
export type EquippedBags = [string | null, string | null, string | null, string | null];
export const BAG_SLOT_COUNT = 4;
export const BASE_BAG_CAPACITY = 16;
export const BAG_ITEMS: Readonly<Record<BagKind, BagDefinition>> = {
  'linen-pouch': { id: 'linen-pouch', label: 'Linen Pouch', description: 'A simple woven pouch for the first steps of an adventure.', slots: 8, price: 24, requiredLevel: 1, quality: 'common' },
  'trail-satchel': { id: 'trail-satchel', label: 'Trail Satchel', description: 'A sturdy leather satchel with room for trail supplies.', slots: 12, price: 80, requiredLevel: 5, quality: 'uncommon' },
  'wayfarer-pack': { id: 'wayfarer-pack', label: 'Wayfarer Pack', description: 'A reinforced pack made for journeys across the realm.', slots: 16, price: 240, requiredLevel: 12, quality: 'rare' },
  'runewoven-holdall': { id: 'runewoven-holdall', label: 'Runewoven Holdall', description: 'Runic cloth expands this holdall for the longest expeditions.', slots: 24, price: 650, requiredLevel: 25, quality: 'epic' },
};
type BagInventory = Pick<Player, 'ownedGear' | 'equipment' | 'inventory' | 'ownedBags' | 'equippedBags' | 'carriedItems'>;
export const newBags = (): { ownedBags: OwnedBag[]; equippedBags: EquippedBags } => ({ ownedBags: [], equippedBags: [null, null, null, null] });
export const bagKindValid = (kind: unknown): kind is BagKind => typeof kind === 'string' && Object.hasOwn(BAG_ITEMS, kind);
export function bagMerchantStock(npcId: string): BagDefinition[] {
  return npcId !== 'city-weaponsmith' && VILLAGE_NPCS.some(npc => npc.id === npcId && npc.role === 'merchant') ? Object.values(BAG_ITEMS) : [];
}
/** Stable display order shared by the bag windows and authoritative capacity checks. */
export function bagItems(player: BagInventory): string[] {
  const equipped = new Set(Object.values(player.equipment)), bags = new Set(player.equippedBags || []);
  return [
    ...player.ownedGear.filter(id => !equipped.has(id)),
    ...(['wood', 'crystal', 'herb', 'potion', 'relic'] as const).filter(id => player.inventory[id] > 0),
    ...Object.entries(player.carriedItems||{}).filter(([,count])=>(count||0)>0).map(([id])=>`item:${id}`),
    ...(player.ownedBags || []).filter(bag => !bags.has(bag.id)).map(bag => `bag:${bag.id}`),
  ];
}
export function bagCapacity(player: Pick<Player, 'ownedBags' | 'equippedBags'>): number {
  const equipped = new Set(player.equippedBags || []);
  return BASE_BAG_CAPACITY + (player.ownedBags || []).reduce((slots, bag) => slots + (equipped.has(bag.id) && bagKindValid(bag.kind) ? BAG_ITEMS[bag.kind].slots : 0), 0);
}
export const bagUsage = (player: BagInventory) => bagItems(player).length;
export function bagCanFit(player: BagInventory, changes: Partial<BagInventory> = {}): boolean {
  const next = { ...player, ...changes };
  return carriedItemsValid(next) && Object.values(next.inventory).every(amount => Number.isSafeInteger(amount) && amount >= 0) && bagUsage(next) <= bagCapacity(next);
}
export function bagsValid(player: BagInventory & Pick<Player, 'level'>): boolean {
  const bags = player.ownedBags, slots = player.equippedBags;
  return Array.isArray(bags) && Array.isArray(slots) && slots.length === BAG_SLOT_COUNT
    && bags.every(bag => bag && typeof bag === 'object' && !Array.isArray(bag) && Object.keys(bag).length === 2
      && typeof bag.id === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(bag.id)
      && bagKindValid(bag.kind) && player.level >= BAG_ITEMS[bag.kind].requiredLevel)
    && new Set(bags.map(bag => bag.id)).size === bags.length
    && slots.every(id => id === null || typeof id === 'string' && bags.some(bag => bag.id === id))
    && new Set(slots.filter(id => id !== null)).size === slots.filter(id => id !== null).length
    && bagCanFit(player);
}
/** Only pre-bag saves receive enough equipped bags to preserve every existing item. */
export function migrateBags(player: BagInventory & Pick<Player, 'level'>, makeId: () => string): void {
  if (Object.hasOwn(player, 'ownedBags') || Object.hasOwn(player, 'equippedBags')) return;
  Object.assign(player, newBags());
  if (!Array.isArray(player.ownedGear) || !player.equipment || !player.inventory) return;
  const available = Object.values(BAG_ITEMS).filter(bag => bag.requiredLevel <= player.level);
  for (let slot = 0; slot < BAG_SLOT_COUNT && bagUsage(player) > bagCapacity(player); slot++) {
    const needed = bagUsage(player) - bagCapacity(player);
    const kind = (available.find(bag => bag.slots >= needed) || available.at(-1))?.id;
    if (!kind) return;
    const bag = { id: makeId(), kind }; player.ownedBags!.push(bag); player.equippedBags![slot] = bag.id;
  }
}
