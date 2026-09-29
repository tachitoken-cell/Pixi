import type { ZoneId } from './content';
import { MAX_LEVEL } from './progression.ts';

export const TREASURE_MAP = { dropChancePercent: 5, voucherChancePercent: 1, searchRange: 4, openRange: 3 } as const;
export interface TreasureMapSite {
  id: string; zone: ZoneId; x: number; z: number; searchX: number; searchZ: number; radius: number; clue: string; label: string;
}
/** Fixed sites keep expeditions in saved characters stable across restarts. */
export const TREASURE_MAP_SITES: readonly TreasureMapSite[] = [
  {id:'greenwood-1',zone:'greenwood',x:-258,z:150,searchX:-258,searchZ:174,radius:36,clue:"Search north of the marked area's center.",label:'Pinewake Hills cache'},
  {id:'greenwood-2',zone:'greenwood',x:-442,z:54,searchX:-442,searchZ:30,radius:36,clue:"Search south of the marked area's center.",label:'Silverreach Meadow cache'},
  {id:'amberwild-1',zone:'amberwild',x:-650,z:-338,searchX:-650,searchZ:-314,radius:36,clue:"Search north of the marked area's center.",label:'Redleaf Highlands cache'},
  {id:'amberwild-2',zone:'amberwild',x:-422,z:-494,searchX:-422,searchZ:-470,radius:36,clue:"Search north of the marked area's center.",label:'Sunscar Coast cache'},
  {id:'frostmarch-1',zone:'frostmarch',x:82,z:-474,searchX:106,searchZ:-474,radius:36,clue:"Search west of the marked area's center.",label:'Stormcrag Tundra cache'},
  {id:'frostmarch-2',zone:'frostmarch',x:526,z:-670,searchX:502,searchZ:-670,radius:36,clue:"Search east of the marked area's center.",label:'Northglass Fjords cache'},
  {id:'hollow-1',zone:'hollow',x:690,z:-322,searchX:666,searchZ:-322,radius:36,clue:"Search east of the marked area's center.",label:'Moonfen Marsh cache'},
  {id:'hollow-2',zone:'hollow',x:602,z:438,searchX:626,searchZ:438,radius:36,clue:"Search west of the marked area's center.",label:'Shadewood Wilds cache'},
  {id:'sunveil-1',zone:'sunveil',x:-954,z:-354,searchX:-954,searchZ:-330,radius:36,clue:"Search north of the marked area's center.",label:'Dunewell Oasis cache'},
  {id:'sunveil-2',zone:'sunveil',x:-726,z:-1058,searchX:-702,searchZ:-1058,radius:36,clue:"Search west of the marked area's center.",label:'Saffron Mesa cache'},
  {id:'mistwood-1',zone:'mistwood',x:558,z:882,searchX:558,searchZ:858,radius:36,clue:"Search south of the marked area's center.",label:'Canopy Reach cache'},
  {id:'mistwood-2',zone:'mistwood',x:1118,z:626,searchX:1094,searchZ:626,radius:36,clue:"Search east of the marked area's center.",label:'Jade Rainforest cache'},
];
export interface TreasureMapProgress { id: string; siteId: string; stage: 'search' | 'guardian' | 'chest'; level: number }
/** The reward roll stays on the realm until the chest is opened. */
export interface TreasureMapExpedition extends TreasureMapProgress { voucher: boolean }
export const treasureMapReward = (level: number) => ({ gold: 25 + 5 * level, potions: 2, coins: 1 });

export function treasureMapPlayerValid(player: { treasureMap?: unknown }): boolean {
  const state = player.treasureMap;
  if (state === undefined || state === null) return true;
  if (typeof state !== 'object' || Array.isArray(state)) return false;
  const map = state as TreasureMapExpedition;
  return Object.keys(state).length === 5 && ['id', 'siteId', 'stage', 'level', 'voucher'].every(key => Object.hasOwn(state, key))
    && typeof map.id === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(map.id)
    && TREASURE_MAP_SITES.some(site => site.id === map.siteId) && ['search', 'guardian', 'chest'].includes(map.stage)
    && Number.isSafeInteger(map.level) && map.level >= 1 && map.level <= MAX_LEVEL && typeof map.voucher === 'boolean';
}
