import { AUCTION_MAX_QUANTITY, AUCTION_RESOURCES, auctionEscrowHas, auctionItemChanges, type AuctionItem } from './auction.ts';
import { bagCanFit, bagKindValid, type OwnedBag } from './bags.ts';
import { gearIdValid } from './progression.ts';
import { lootItemValid } from './loot-items.ts';
import type { Player } from './shared.ts';

export const BANK_CAPACITY = 48;
export type BankItem = AuctionItem | { kind: 'bag'; id: string; quantity: number };
export interface BankState {
  gear: string[];
  resources: Partial<Record<typeof AUCTION_RESOURCES[number], number>>;
  items: Partial<Record<string, number>>;
  bags: OwnedBag[];
}
export interface BankView { npcId: string; bank: BankState; items: BankItem[]; capacity: number; open?: boolean; reason?: string }
type BankPlayer = Player;
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(value);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const quantity = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
export const newBank = (): BankState => ({ gear: [], resources: {}, items: {}, bags: [] });
export function bankItemValid(value: unknown): value is BankItem {
  if (!record(value) || Object.keys(value).length !== 3 || !['kind', 'id', 'quantity'].every(key => Object.hasOwn(value, key))
    || typeof value.id !== 'string' || !quantity(value.quantity) || value.quantity > AUCTION_MAX_QUANTITY) return false;
  return value.kind === 'gear' ? value.quantity === 1 && gearIdValid(value.id)
    : value.kind === 'bag' ? value.quantity === 1 && uuid(value.id)
    : value.kind === 'resource' ? AUCTION_RESOURCES.includes(value.id as typeof AUCTION_RESOURCES[number])
    : value.kind === 'item' && lootItemValid(value.id);
}
export function bankItems(bank: BankState): BankItem[] {
  return [
    ...bank.gear.map(id => ({ kind: 'gear' as const, id, quantity: 1 })),
    ...AUCTION_RESOURCES.filter(id => (bank.resources[id] ?? 0) > 0).map(id => ({ kind: 'resource' as const, id, quantity: bank.resources[id]! })),
    ...Object.entries(bank.items).filter(([,count]) => (count ?? 0) > 0).map(([id,count]) => ({ kind: 'item' as const, id, quantity: count! })),
    ...bank.bags.map(bag => ({ kind: 'bag' as const, id: bag.id, quantity: 1 })),
  ];
}
export function bankValid(value: unknown): value is BankState {
  if (!record(value) || Object.keys(value).length !== 4 || !['gear','resources','items','bags'].every(key => Object.hasOwn(value,key))) return false;
  if (!Array.isArray(value.gear) || !value.gear.every(id => typeof id === 'string' && gearIdValid(id)) || new Set(value.gear).size !== value.gear.length
    || !record(value.resources) || !Object.entries(value.resources).every(([id,count]) => AUCTION_RESOURCES.includes(id as typeof AUCTION_RESOURCES[number]) && quantity(count))
    || !record(value.items) || !Object.entries(value.items).every(([id,count]) => lootItemValid(id) && quantity(count))
    || !Array.isArray(value.bags) || !value.bags.every(bag => record(bag) && Object.keys(bag).length === 2 && uuid(bag.id) && bagKindValid(bag.kind))
    || new Set(value.bags.map(bag => bag.id)).size !== value.bags.length) return false;
  return bankItems(value as unknown as BankState).length <= BANK_CAPACITY;
}
export const bankEscrowHas = (player: { bank?: BankState }, id: string) => !!player.bank?.gear.includes(id);
export function bankPlayerValid(player: BankPlayer): boolean {
  const bank=player.bank === undefined ? newBank() : player.bank;
  return bankValid(bank) && bank.gear.every(id => !player.ownedGear.includes(id) && !Object.values(player.equipment).includes(id) && !auctionEscrowHas(player as Player,id))
    && bank.bags.every(bag => !(player.ownedBags ?? []).some(owned => owned.id === bag.id) && !player.equippedBags?.some(id => id === bag.id));
}
function changeBank(bank: BankState, item: BankItem, direction: 1 | -1, bag?: OwnedBag): BankState | null {
  if (item.kind === 'gear') return { ...bank, gear: direction === 1 ? [...bank.gear,item.id] : bank.gear.filter(id => id !== item.id) };
  if (item.kind === 'bag') return { ...bank, bags: direction === 1 ? [...bank.bags,bag!] : bank.bags.filter(bag => bag.id !== item.id) };
  const field=item.kind === 'resource' ? 'resources' : 'items', previous=(bank[field] as Record<string,number>)[item.id] ?? 0;
  const count=previous+item.quantity*direction;if (!Number.isSafeInteger(count) || count < 0) return null;
  const values:Partial<Record<string,number>>={...bank[field],[item.id]:count};if (count === 0) delete values[item.id];
  return {...bank,[field]:values};
}
/** Return a projected owner; the server persists it atomically before publishing a transfer. */
export function bankDeposit<T extends BankPlayer>(player: T, item: BankItem): T | null {
  if (!bankItemValid(item) || !bankPlayerValid(player)) return null;
  const bank=player.bank ?? newBank();let bag:OwnedBag|undefined;
  if (item.kind === 'gear') {
    if (!player.ownedGear.includes(item.id) || Object.values(player.equipment).includes(item.id) || bank.gear.includes(item.id)) return null;
  } else if (item.kind === 'bag') {
    bag=player.ownedBags?.find(bag => bag.id === item.id);if (!bag || player.equippedBags?.includes(item.id)) return null;
  } else if (item.kind === 'item' ? (player.carriedItems?.[item.id] ?? 0) < item.quantity : (player.inventory[item.id as keyof Player['inventory']] ?? 0) < item.quantity) return null;
  const nextBank=changeBank(bank,item,1,bag);if (!nextBank || !bankValid(nextBank)) return null;
  const changes=item.kind === 'bag' ? {ownedBags:player.ownedBags!.filter(bag => bag.id !== item.id)} : auctionItemChanges(player as Player,item,-1);
  const next={...player,...changes,bank:nextBank};return bankPlayerValid(next) && bagCanFit(next) ? next : null;
}
export function bankWithdraw<T extends BankPlayer>(player: T, item: BankItem): T | null {
  if (!bankItemValid(item) || !bankPlayerValid(player)) return null;
  const bank=player.bank ?? newBank();let bag:OwnedBag|undefined;
  if (item.kind === 'gear') { if (!bank.gear.includes(item.id) || player.ownedGear.includes(item.id) || auctionEscrowHas(player as Player,item.id)) return null; }
  else if (item.kind === 'bag') { bag=bank.bags.find(bag => bag.id === item.id);if (!bag || player.ownedBags?.some(owned => owned.id === item.id)) return null; }
  else if ((item.kind === 'resource' ? bank.resources[item.id as keyof BankState['resources']] ?? 0 : bank.items[item.id] ?? 0) < item.quantity) return null;
  const nextBank=changeBank(bank,item,-1);if (!nextBank) return null;
  const changes=item.kind === 'bag' ? {ownedBags:[...(player.ownedBags ?? []),bag!]} : auctionItemChanges(player as Player,item,1);
  const next={...player,...changes,bank:nextBank};return bankPlayerValid(next) && bagCanFit(next) ? next : null;
}
