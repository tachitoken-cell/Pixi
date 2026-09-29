import { GEAR, gearById, gearIdValid, type Gear } from './progression.ts';
import { VILLAGE_NPCS } from './settlements.ts';

export const MERCHANT_SET_LEVELS: Readonly<Record<string, number>> = {
  'village-pinewake-merchant': 5,
  'village-sunscar-merchant': 12,
  'village-northglass-merchant': 25,
  'village-stormcrag-merchant': 40,
  'village-elderwood-merchant': 50,
};

export const gearSellPrice = (itemId: string): number => gearIdValid(itemId) ? gearById(itemId)!.sellPrice ?? Math.floor(gearById(itemId)!.price / 4) : 0;

export function merchantStock(npcId: string): Gear[] {
  if (!VILLAGE_NPCS.some(npc => npc.id === npcId && npc.role === 'merchant')) return [];
  if (npcId === 'city-armorer' || npcId === 'city-weaponsmith') return Object.values(GEAR).filter(item => item.price > 0 && !item.dropOnly && (npcId === 'city-weaponsmith' ? item.slot === 'weapon' : item.slot !== 'weapon'));
  const level = MERCHANT_SET_LEVELS[npcId];
  return Object.values(GEAR).filter(item => item.price > 0 && !item.dropOnly && (!item.setId || item.requiredLevel === level));
}
