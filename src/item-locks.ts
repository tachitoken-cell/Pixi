import type { Player } from './shared';
import { gearIdValid } from './progression.ts';
import { lootItemValid } from './loot-items.ts';

// The same keys identify items in bags and storage. Stack protection follows the
// item type, including future pickups, until explicitly unlocked; use is allowed.
export const itemLocked = (player: Pick<Player, 'lockedItems'>, id: string) => player.lockedItems?.includes(id) === true;
export const itemLockKey = (item: { kind: string; id: string }) => item.kind === 'item' || item.kind === 'bag' ? `${item.kind}:${item.id}` : item.id;
const resources = ['wood', 'crystal', 'herb', 'potion', 'relic'];
export function itemLockIdValid(id: unknown): id is string {
  return typeof id === 'string' && id.length <= 128 && (resources.includes(id)
    || id.startsWith('item:') && lootItemValid(id.slice(5)) || /^bag:[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(id) || gearIdValid(id));
}
export function itemLocksValid(player: Pick<Player, 'lockedItems'>): boolean {
  const locks = player.lockedItems;
  return locks === undefined || Array.isArray(locks) && locks.length <= 2048 && locks.every(itemLockIdValid) && new Set(locks).size === locks.length;
}
export function ownsLockItem(player: Pick<Player, 'ownedGear' | 'ownedBags' | 'inventory' | 'carriedItems' | 'bank'>, id: string): boolean {
  if (!itemLockIdValid(id)) return false;
  if (id.startsWith('bag:')) return [...(player.ownedBags || []), ...(player.bank?.bags || [])].some(bag => bag.id === id.slice(4));
  if (id.startsWith('item:')) return (player.carriedItems?.[id.slice(5)] || 0) + (player.bank?.items[id.slice(5)] || 0) > 0;
  if (resources.includes(id)) return (player.inventory[id as keyof Player['inventory']] || 0) + (player.bank?.resources[id as keyof Player['inventory']] || 0) > 0;
  return player.ownedGear.includes(id) || player.bank?.gear.includes(id) === true;
}
