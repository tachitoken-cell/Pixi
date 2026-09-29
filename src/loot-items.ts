import { GEAR, MAX_LEVEL, copyGear, gearById, gearQuality, rollGear, type Gear, type GearQuality } from './progression.ts';
import { THEMED_DUNGEON_ROSTERS, type EnemyKind } from './bestiary.ts';
import type { Player, LootDrop, Enemy } from './shared';
import { PETS } from './pets.ts';
import { MOUNTS } from './travel.ts';

// Quest source requests fire resistance but gives no strength or duration.
export const HEATPROOF_DURATION_MS = 5 * 60 * 1000;
export const HEATPROOF_DAMAGE_MULTIPLIER = .8;
export type LootQuality = GearQuality;
export interface LootItem { id: string; label: string; description: string; quality: LootQuality; category: 'junk' | 'food' | 'potion' | 'treasure' | 'pet' | 'mount'; sellPrice: number; heal?: number }
export interface LootEntry { id: string; kind: 'gold' | 'resource' | 'item' | 'gear'; itemId: string; quantity: number; quality: LootQuality }
export const LOOT_ITEMS: Readonly<Record<string, LootItem>> = Object.fromEntries(([
  { id:'sp-protection-roll', label:'Protection Roll', description:'Consumed by a protected specialist upgrade. Prevents fractures without increasing success. Use in Raid collection or trade for gold.', quality:'rare', category:'treasure', sellPrice:0 },
  { id:'sp-revival-core', label:'Soul Revival Core', description:'Repairs a fractured specialist and preserves its job XP and upgrade level. Use in Raid collection or trade for gold.', quality:'epic', category:'treasure', sellPrice:0 },
  { id:'sp-specialist-case', label:'Specialist Case', description:'Consumed when sealing a specialist into a transferable NFT. Each reseal needs a new case. Use in Specialist trading or trade for gold.', quality:'epic', category:'treasure', sellPrice:0 },
  { id:'brook-trout', label:'Brook trout', description:'Freshly caught from a woodland stream. Eat out of combat or sell to a merchant.', quality:'common', category:'food', sellPrice:4, heal:30 },
  { id:'silver-carp', label:'Silver carp', description:'Freshly caught from a quiet lakeshore. Eat out of combat or sell to a merchant.', quality:'uncommon', category:'food', sellPrice:9, heal:60 },
  { id:'glacial-char', label:'Glacial char', description:'Freshly caught from a frozen fjord. Eat out of combat or sell to a merchant.', quality:'uncommon', category:'food', sellPrice:15, heal:100 },
  { id:'moonfin', label:'Moonfin', description:'Freshly caught from a moonlit coast. Eat out of combat or sell to a merchant.', quality:'rare', category:'food', sellPrice:25, heal:150 },
  { id:'dream-petal', label:'Dream petal', description:'A soft glow carried home from a pleasant dream. Merchants collect these impossible flowers.', quality:'rare', category:'treasure', sellPrice:35 },
  { id:'nightmare-shard', label:'Nightmare shard', description:'A fragment reclaimed from a nightmare. Proof that the dark did not keep you.', quality:'rare', category:'treasure', sellPrice:55 },
  { id:'moss-voucher', label:'MOSS voucher', description:'Bring this sealed token to Veyl, the shady merchant in Willowbrook. Your linked wallet must hold at least $30 USD worth of MOSS to redeem. Rewards have a 90% chance of $2–$5 and a 10% chance of $6–$10 USD worth of MOSS, priced when you redeem. The assigned USD reward stays fixed; its MOSS amount can be refreshed before collecting.', quality:'epic', category:'treasure', sellPrice:0 },
  { id:'treasure-map', label:'Weathered treasure map', description:'Follow a clue to buried treasure. Defeat its guardian for gold and supplies, with a 1% chance of a MOSS voucher. Using this map starts one saved expedition.', quality:'rare', category:'treasure', sellPrice:0 },
  { id:'slime-residue', label:'Slime residue', description:'A sticky glob with no practical use. A merchant will buy it.', quality:'uncommon', category:'junk', sellPrice:2 },
  { id:'gnarled-bark', label:'Gnarled bark', description:'Weathered bark shed by an ancient woodland creature.', quality:'uncommon', category:'junk', sellPrice:3 },
  { id:'chipped-fang', label:'Chipped fang', description:'A broken fang. Too brittle to craft with, but worth a few coins.', quality:'uncommon', category:'junk', sellPrice:3 },
  { id:'cracked-carapace', label:'Cracked carapace', description:'A damaged shell collected from a fallen insect.', quality:'uncommon', category:'junk', sellPrice:4 },
  { id:'frost-shard', label:'Clouded frost shard', description:'A cloudy shard whose magic has faded.', quality:'uncommon', category:'junk', sellPrice:5 },
  { id:'tattered-pelt', label:'Tattered pelt', description:'A worn scrap of fur that can be sold to a merchant.', quality:'uncommon', category:'junk', sellPrice:4 },
  { id:'bog-gland', label:'Bog gland', description:'A pungent remnant of a marsh creature.', quality:'uncommon', category:'junk', sellPrice:4 },
  { id:'void-dust', label:'Faded void dust', description:'Dark motes left behind when a shadow creature falls.', quality:'uncommon', category:'junk', sellPrice:7 },
  { id:'trail-bread', label:'Trail bread', description:'A small loaf for a quiet moment between battles.', quality:'common', category:'food', sellPrice:2, heal:25 },
  { id:'roast-meat', label:'Roast meat', description:'A hearty bite to recover after a fight.', quality:'common', category:'food', sellPrice:4, heal:40 },
  { id:'berry-tart', label:'Berry tart', description:'Sweet woodland berries baked into a crisp pastry.', quality:'common', category:'food', sellPrice:5, heal:55 },
  { id:'hearty-stew', label:'Hearty stew', description:'A warming bowl for tired adventurers.', quality:'common', category:'food', sellPrice:7, heal:75 },
  { id:'prismatic-pearl', label:'Prismatic pearl', description:'A rare pearl treasured by merchants across the realm.', quality:'rare', category:'treasure', sellPrice:45 },
  { id:'ancient-coin', label:'Ancient coin', description:'A collector’s coin from the cities beneath the roots.', quality:'rare', category:'treasure', sellPrice:35 },
  { id:'stormhorn-core', label:'Stormhorn core', description:'An epic trophy from the Stormhorn Behemoth, still bright with thunder.', quality:'epic', category:'treasure', sellPrice:150 },
  { id:'greater-tonic', label:'Greater healing tonic', description:'A potent restorative that can be used during combat.', quality:'uncommon', category:'potion', sellPrice:12, heal:100 },
  { id:'heatproof-tonic', label:'Heatproof tonic', description:'Reduces fire damage taken by 20% for 5 minutes. Drinking another refreshes the duration. Usable at full health and during combat.', quality:'uncommon', category:'potion', sellPrice:0 },
  ...PETS.filter(pet => !pet.storeOnly && !('referralOnly' in pet)).map(pet => ({ id: pet.id, label: pet.name, description: `${pet.description} Learn this companion or list it on the auction house.`, quality: pet.quality, category: 'pet' as const, sellPrice: 0 })),
  ...MOUNTS.filter(mount => mount.nftAssetId !== null && !mount.storeOnly).map(mount => ({ id: mount.id, label: mount.name, description: `${mount.description} Learn this mount, trade it or mint it when the mount collection is enabled.`, quality: mount.quality, category: 'mount' as const, sellPrice: 0 })),
] satisfies LootItem[]).map(item=>[item.id,item]));
export const lootItemValid = (id: unknown): id is string => typeof id === 'string' && Object.hasOwn(LOOT_ITEMS,id);
export function carriedItemsValid(player: Pick<Player,'carriedItems'>): boolean {
  const items=player.carriedItems;
  return items===undefined || !!items && typeof items==='object' && !Array.isArray(items)
    && Object.entries(items).every(([id,count])=>lootItemValid(id)&&typeof count==='number'&&Number.isSafeInteger(count)&&count>=0);
}
export const gearLootQuality = gearQuality;
interface DropRule { kind:'item'|'resource'|'gear'; itemId:string; chance:number; min?:number; max?:number }
export const LOOT_TABLES: Readonly<Record<EnemyKind,readonly DropRule[]>> = {
  'bone-rat': [{kind:'item',itemId:'chipped-fang',chance:1,max:2},{kind:'resource',itemId:'herb',chance:0.3,max:2}],
  'corpse-scarab': [{kind:'item',itemId:'cracked-carapace',chance:1,max:2},{kind:'item',itemId:'bog-gland',chance:0.35,max:1}],
  'mire-leech': [{kind:'item',itemId:'bog-gland',chance:1,max:2},{kind:'resource',itemId:'herb',chance:0.4,max:2}],
  'crypt-bat': [{kind:'item',itemId:'chipped-fang',chance:1,max:2},{kind:'item',itemId:'greater-tonic',chance:0.2,max:1}],
  'fungal-thrall': [{kind:'item',itemId:'slime-residue',chance:1,max:2},{kind:'resource',itemId:'herb',chance:0.6,max:2}],
  'plague-knight': [{kind:'item',itemId:'ancient-coin',chance:0.2,max:1},{kind:'item',itemId:'greater-tonic',chance:0.3,max:1},{kind:'resource',itemId:'crystal',chance:0.3,max:2}],
  'carrion-hound': [{kind:'item',itemId:'tattered-pelt',chance:1,max:2},{kind:'item',itemId:'chipped-fang',chance:0.5,max:2},{kind:'resource',itemId:'herb',chance:0.25,max:1}],
  'sewer-horror': [{kind:'item',itemId:'bog-gland',chance:1,max:3},{kind:'item',itemId:'slime-residue',chance:0.5,max:2},{kind:'item',itemId:'greater-tonic',chance:0.25,max:1}],
  'ember-imp': [{kind:'item',itemId:'void-dust',chance:1,max:2},{kind:'resource',itemId:'crystal',chance:0.3,max:2}],
  'cinder-hound': [{kind:'item',itemId:'chipped-fang',chance:1,max:2},{kind:'item',itemId:'roast-meat',chance:0.35,max:1}],
  'forge-spider': [{kind:'item',itemId:'cracked-carapace',chance:1,max:2},{kind:'resource',itemId:'crystal',chance:0.4,max:2}],
  'brass-sentinel': [{kind:'resource',itemId:'crystal',chance:0.5,max:2},{kind:'item',itemId:'ancient-coin',chance:0.15,max:1}],
  'slag-elemental': [{kind:'item',itemId:'void-dust',chance:1,max:2},{kind:'resource',itemId:'crystal',chance:0.6,max:2}],
  'ash-drake': [{kind:'item',itemId:'chipped-fang',chance:1,max:3},{kind:'item',itemId:'hearty-stew',chance:0.3,max:1}],
  'furnace-priest': [{kind:'item',itemId:'greater-tonic',chance:0.35,max:1},{kind:'resource',itemId:'crystal',chance:0.35,max:2},{kind:'item',itemId:'void-dust',chance:1,max:1}],
  'chain-jailer': [{kind:'item',itemId:'ancient-coin',chance:0.2,max:1},{kind:'item',itemId:'void-dust',chance:1,max:2},{kind:'resource',itemId:'crystal',chance:0.3,max:1}],
  'paper-shikigami': [{kind:'item',itemId:'void-dust',chance:0.6,max:1},{kind:'resource',itemId:'wood',chance:0.5,max:2}],
  'grave-fox': [{kind:'item',itemId:'tattered-pelt',chance:1,max:2},{kind:'resource',itemId:'herb',chance:0.3,max:2}],
  'mist-crane': [{kind:'item',itemId:'frost-shard',chance:0.8,max:2},{kind:'item',itemId:'prismatic-pearl',chance:0.08,max:1}],
  'temple-ronin': [{kind:'item',itemId:'tattered-pelt',chance:1,max:1},{kind:'item',itemId:'ancient-coin',chance:0.2,max:1},{kind:'item',itemId:'greater-tonic',chance:0.25,max:1}],
  'incense-acolyte': [{kind:'resource',itemId:'herb',chance:0.6,max:2},{kind:'item',itemId:'greater-tonic',chance:0.3,max:1},{kind:'item',itemId:'void-dust',chance:1,max:1}],
  'jade-lion': [{kind:'item',itemId:'frost-shard',chance:1,max:2},{kind:'resource',itemId:'crystal',chance:0.45,max:2}],
  'mourning-mask': [{kind:'item',itemId:'void-dust',chance:1,max:2},{kind:'resource',itemId:'wood',chance:0.35,max:2}],
  'spirit-koi': [{kind:'item',itemId:'moonfin',chance:0.4,max:1},{kind:'item',itemId:'prismatic-pearl',chance:0.08,max:1},{kind:'resource',itemId:'crystal',chance:0.35,max:2}],
  'crypt-weaver': [{kind:'item',itemId:'cracked-carapace',chance:1,max:3},{kind:'item',itemId:'bog-gland',chance:0.45,max:2}],
  'plague-alchemist': [{kind:'item',itemId:'bog-gland',chance:1,max:3},{kind:'item',itemId:'greater-tonic',chance:0.35,max:1}],
  'broodmother-vex': [{kind:'resource',itemId:'herb',chance:1,min:2,max:3},{kind:'item',itemId:'cracked-carapace',chance:1,max:5},{kind:'item',itemId:'ancient-coin',chance:1,max:1},{kind:'item',itemId:'greater-tonic',chance:0.7,max:2}],
  'plague-abomination': [{kind:'resource',itemId:'herb',chance:1,min:2,max:3},{kind:'item',itemId:'bog-gland',chance:1,max:5},{kind:'item',itemId:'prismatic-pearl',chance:1,max:1},{kind:'item',itemId:'greater-tonic',chance:1,max:2}],
  'slag-crawler': [{kind:'item',itemId:'cracked-carapace',chance:1,max:3},{kind:'item',itemId:'ancient-coin',chance:0.12,max:1}],
  'furnace-revenant': [{kind:'item',itemId:'void-dust',chance:1,max:3},{kind:'item',itemId:'greater-tonic',chance:0.35,max:1}],
  'anvil-warden': [{kind:'resource',itemId:'crystal',chance:1,min:2,max:3},{kind:'item',itemId:'ancient-coin',chance:1,max:2},{kind:'item',itemId:'greater-tonic',chance:0.7,max:2}],
  'pyrelord-ignivar': [{kind:'resource',itemId:'crystal',chance:1,min:2,max:3},{kind:'item',itemId:'prismatic-pearl',chance:1,max:1},{kind:'item',itemId:'ancient-coin',chance:1,max:2},{kind:'item',itemId:'greater-tonic',chance:1,max:2}],
  'lantern-wraith': [{kind:'item',itemId:'void-dust',chance:1,max:3},{kind:'item',itemId:'greater-tonic',chance:0.35,max:1}],
  'jade-sentinel': [{kind:'item',itemId:'frost-shard',chance:1,max:3},{kind:'item',itemId:'ancient-coin',chance:0.2,max:1}],
  'bellkeeper-shen': [{kind:'resource',itemId:'wood',chance:1,min:2,max:3},{kind:'item',itemId:'ancient-coin',chance:1,max:2},{kind:'item',itemId:'greater-tonic',chance:0.7,max:2}],
  'veiled-abbess': [{kind:'resource',itemId:'wood',chance:1,min:2,max:3},{kind:'item',itemId:'prismatic-pearl',chance:1,max:2},{kind:'item',itemId:'void-dust',chance:1,max:4},{kind:'item',itemId:'greater-tonic',chance:1,max:2}],
  'training-dummy': [],
  'treasure-goblin': [{kind:'item',itemId:'ancient-coin',chance:1},{kind:'item',itemId:'prismatic-pearl',chance:.2}],
  'moss-slime': [{kind:'item',itemId:'slime-residue',chance:1,max:2},{kind:'item',itemId:'trail-bread',chance:.35},{kind:'resource',itemId:'potion',chance:.18},{kind:'gear',itemId:'common',chance:.04},{kind:'gear',itemId:'uncommon',chance:.015}],
  'briar-sentinel': [{kind:'item',itemId:'gnarled-bark',chance:1,max:3},{kind:'item',itemId:'berry-tart',chance:.28},{kind:'resource',itemId:'potion',chance:.2},{kind:'gear',itemId:'uncommon',chance:.05}],
  'ice-wisp': [{kind:'item',itemId:'frost-shard',chance:1,max:2},{kind:'resource',itemId:'potion',chance:.4},{kind:'item',itemId:'prismatic-pearl',chance:.07},{kind:'gear',itemId:'rare',chance:.04}],
  'root-warden': [{kind:'item',itemId:'gnarled-bark',chance:1,min:2,max:4},{kind:'item',itemId:'hearty-stew',chance:.6},{kind:'item',itemId:'ancient-coin',chance:.6},{kind:'resource',itemId:'potion',chance:1,max:2},{kind:'gear',itemId:'uncommon',chance:.325},{kind:'gear',itemId:'rare',chance:.125}],
  'bramble-wolf': [{kind:'item',itemId:'chipped-fang',chance:1,max:2},{kind:'item',itemId:'tattered-pelt',chance:.4},{kind:'item',itemId:'roast-meat',chance:.5},{kind:'gear',itemId:'common',chance:.06},{kind:'gear',itemId:'uncommon',chance:.02}],
  'briar-boar': [{kind:'item',itemId:'chipped-fang',chance:1,max:3},{kind:'item',itemId:'tattered-pelt',chance:.3},{kind:'item',itemId:'roast-meat',chance:.65},{kind:'gear',itemId:'common',chance:.06},{kind:'gear',itemId:'uncommon',chance:.02}],
  'grove-spider': [{kind:'item',itemId:'cracked-carapace',chance:1},{kind:'item',itemId:'bog-gland',chance:.35},{kind:'resource',itemId:'potion',chance:.15},{kind:'gear',itemId:'common',chance:.05},{kind:'gear',itemId:'uncommon',chance:.02}],
  'ember-beetle': [{kind:'item',itemId:'cracked-carapace',chance:1,max:3},{kind:'item',itemId:'trail-bread',chance:.25},{kind:'item',itemId:'ancient-coin',chance:.05},{kind:'gear',itemId:'uncommon',chance:.06}],
  'dune-scorpion': [{kind:'item',itemId:'cracked-carapace',chance:1,max:2},{kind:'item',itemId:'bog-gland',chance:.5},{kind:'resource',itemId:'potion',chance:.25},{kind:'gear',itemId:'uncommon',chance:.07}],
  'stone-golem': [{kind:'item',itemId:'gnarled-bark',chance:.7,max:3},{kind:'item',itemId:'frost-shard',chance:1,max:3},{kind:'item',itemId:'ancient-coin',chance:.18},{kind:'gear',itemId:'uncommon',chance:.1}],
  'frost-yeti': [{kind:'item',itemId:'tattered-pelt',chance:1,min:2,max:4},{kind:'item',itemId:'hearty-stew',chance:.5},{kind:'item',itemId:'greater-tonic',chance:.2},{kind:'gear',itemId:'rare',chance:.1}],
  'crystal-bat': [{kind:'item',itemId:'frost-shard',chance:1,max:2},{kind:'item',itemId:'prismatic-pearl',chance:.12},{kind:'resource',itemId:'potion',chance:.3},{kind:'gear',itemId:'uncommon',chance:.06}],
  'marsh-toad': [{kind:'item',itemId:'bog-gland',chance:1,max:3},{kind:'item',itemId:'slime-residue',chance:.35},{kind:'item',itemId:'berry-tart',chance:.4},{kind:'gear',itemId:'common',chance:.06},{kind:'gear',itemId:'uncommon',chance:.02}],
  'void-stalker': [{kind:'item',itemId:'void-dust',chance:1,max:3},{kind:'item',itemId:'greater-tonic',chance:.35},{kind:'item',itemId:'prismatic-pearl',chance:.15},{kind:'gear',itemId:'rare',chance:.12},{kind:'gear',itemId:'epic',chance:.02}],
  'briarhorn-elder': [{kind:'item',itemId:'ancient-coin',chance:1},{kind:'item',itemId:'hearty-stew',chance:1,min:1,max:2},{kind:'resource',itemId:'potion',chance:1,max:2},{kind:'gear',itemId:'uncommon',chance:.5},{kind:'gear',itemId:'rare',chance:.075}],
  'rimefang-matriarch': [{kind:'item',itemId:'prismatic-pearl',chance:1},{kind:'item',itemId:'frost-shard',chance:1,min:3,max:5},{kind:'item',itemId:'greater-tonic',chance:1,min:1,max:2},{kind:'gear',itemId:'rare',chance:.5}],
  'stormhorn-behemoth': [{kind:'item',itemId:'stormhorn-core',chance:1},{kind:'item',itemId:'prismatic-pearl',chance:.65,min:1,max:2},{kind:'item',itemId:'greater-tonic',chance:1,min:2,max:3},{kind:'gear',itemId:'rare',chance:.5},{kind:'gear',itemId:'epic',chance:.1}],
  'ashen-crown-titan': [{kind:'item',itemId:'ancient-coin',chance:1,min:2,max:3},{kind:'item',itemId:'prismatic-pearl',chance:1,min:2,max:3},{kind:'item',itemId:'greater-tonic',chance:1,min:3,max:4},{kind:'gear',itemId:'rare',chance:.5},{kind:'gear',itemId:'epic',chance:.25}],
};
export const DUNGEON_CACHE_ODDS = { rare: .7, epic: .24, legendary: .05, mythic: .01 } as const;
export const DUNGEON_GEAR_DROP_CHANCES = { cache: .2, midpoint: .275, final: .35 } as const;
export const LEGACY_DUNGEON_GEAR_DROP_CHANCE = .5;
export const DUNGEON_MIDPOINT_ODDS = { rare: .5, epic: .4, legendary: .09, mythic: .01 } as const;
export const DUNGEON_FINAL_ODDS = { epic: .85, legendary: .14, mythic: .01 } as const;
export const isThemedDungeonLoot = (id?: string): boolean => typeof id === 'string' && Object.hasOwn(THEMED_DUNGEON_ROSTERS, id);
export type LootRollTrace = (detail: Record<string, unknown>) => void;
export interface DungeonLootOptions { themed?: boolean; tier?: 'cache' | 'midpoint' | 'final'; reservedGear?: readonly string[]; trace?: LootRollTrace }
interface MonsterLootSource extends Pick<Enemy, 'worldBoss' | 'instanceId'> { dungeonKind?: string; dungeonBoss?: boolean; stageId?: string; reservedGear?: readonly string[]; trace?: LootRollTrace }
export const WORLD_GEAR_ODDS = { common: .6, uncommon: .3, rare: .09, epic: .01 } as const;
export const DUNGEON_GEAR_ODDS = { common: .1, uncommon: .3, rare: .45, epic: .12, legendary: .025, mythic: .005 } as const;
export const WORLD_GEAR_ROLL_CHANCE = .06;
export const DUNGEON_GEAR_ROLL_CHANCE = .15;
function rollQuality(odds: Partial<Record<GearQuality, number>>, random: () => number, trace?: LootRollTrace): GearQuality {
  const draw = random(); let roll = draw;
  let selected: GearQuality | undefined;
  for (const [quality, chance] of Object.entries(odds)) if ((roll -= chance) < 0) { selected = quality as GearQuality; break; }
  selected ??= Object.keys(odds).at(-1) as GearQuality;
  trace?.({ stage: 'gear-quality', draw, odds, quality: selected });
  return selected;
}
function reserveGear(gear: Gear, owned: Set<string>) {
  let collisions = 0;
  // Preserve a successful equipment roll even when its seed collides with owned or reserved gear.
  while (owned.has(gear.id)) {
    const parts = gear.id.split('~'); parts[3] = ((BigInt(`0x${parts[3]}`) + 1n) % (1n << 64n)).toString(16).padStart(16, '0');
    gear = gearById(parts.join('~'))!; collisions++;
  }
  owned.add(gear.id);
  return { gear, collisions };
}
function rollEquipmentLoot(level: number, player: Player, quality: GearQuality, random: () => number, owned: Set<string>, encounterLevel = false, trace?: LootRollTrace): LootEntry | undefined {
  const maxLevel = Math.min(player.level, level + (encounterLevel ? 0 : 2));
  const pool = Object.values(GEAR).filter(gear => gear.price > 0 && (!gear.className || gear.className === player.appearance.className)
    && gear.requiredLevel <= maxLevel);
  const bestLevel = Math.max(0, ...pool.map(gear => gear.requiredLevel)), eligible = pool.filter(gear => gear.requiredLevel === bestLevel);
  if (!eligible.length) { trace?.({ stage: 'random-gear', quality, className: player.appearance.className, maxLevel, bandLevel: bestLevel, eligibleCount: 0, reason: 'no-class-level-gear' }); return; }
  const dropLevel = encounterLevel && [25, 40, 50].includes(bestLevel) ? Math.min(MAX_LEVEL, player.level, level) : bestLevel === 50 ? Math.min(MAX_LEVEL, player.level, level + 2) : bestLevel;
  const draw = random();
  const { gear, collisions } = reserveGear(rollGear(eligible[Math.floor(draw * eligible.length)].id, quality, random, dropLevel), owned);
  trace?.({ stage: 'random-gear', quality, className: player.appearance.className, maxLevel, bandLevel: bestLevel, eligibleCount: eligible.length, draw, dropLevel, collisions, itemId: gear.id });
  return { id: `gear:${gear.id}`, kind: 'gear', itemId: gear.id, quantity: 1, quality };
}
const ownedEquipment = (player: Player) => new Set([...player.ownedGear, ...(player.bank?.gear ?? []), ...(player.auctions ?? []).filter(listing => listing.item.kind === 'gear').map(listing => listing.item.id)]);
/* Each cache or boss reward rolls once for equipment; upgrade supplies survive a miss. */
export function rollDungeonCacheLoot(level: number, player: Player, random = Math.random, options: DungeonLootOptions = {}): LootEntry[] {
  const owned = ownedEquipment(player);
  for (const id of options.reservedGear ?? []) owned.add(id);
  const chance = options.themed ? DUNGEON_GEAR_DROP_CHANCES[options.tier ?? 'cache'] : LEGACY_DUNGEON_GEAR_DROP_CHANCE;
  const draw = random(), dropsGear = draw < chance;
  options.trace?.({ stage: 'extra-gear', source: options.tier ?? 'cache', chance, draw, passed: dropsGear });
  const odds = options.tier === 'final' ? DUNGEON_FINAL_ODDS : options.tier === 'midpoint' ? DUNGEON_MIDPOINT_ODDS : DUNGEON_CACHE_ODDS;
  const gear = dropsGear ? rollEquipmentLoot(level, player, rollQuality(odds, random, options.trace), random, owned, options.themed, options.trace) : undefined;
  return [ ...(gear ? [gear] : []),
    { id: 'resource:crystal', kind: 'resource', itemId: 'crystal', quantity: Math.max(3, Math.floor(level / 3)), quality: 'uncommon' },
    { id: 'resource:relic', kind: 'resource', itemId: 'relic', quantity: Math.max(1, Math.floor(level / 10)), quality: 'rare' },
  ];
}
/** Rolled once on death for each credited player; opening a corpse never rerolls it. */
export function rollMonsterLoot(kind: EnemyKind, level: number, player: Player, random= Math.random, source?: MonsterLootSource): LootEntry[] {
  const trace = source?.trace;
  if (kind === 'training-dummy') { trace?.({ stage: 'rolled-items', reason: 'training-dummy', items: [] }); return []; }
  const result:LootEntry[]=[], owned=ownedEquipment(player);
  const themed = !!source?.instanceId && isThemedDungeonLoot(source.dungeonKind);
  for (const id of source?.reservedGear ?? []) owned.add(id);
  for(const rule of LOOT_TABLES[kind]){
    const draw = random();
    if(draw>=rule.chance){ trace?.({ stage: 'table-rule', kind: rule.kind, itemId: rule.itemId, draw, chance: rule.chance, passed: false }); continue; }
    let itemId=rule.itemId, quality:LootQuality=rule.kind==='item'?LOOT_ITEMS[itemId].quality:'common';
    if(rule.kind==='gear'){
      const pool=Object.values(GEAR).filter(gear=>gear.price>0&&(!gear.className||gear.className===player.appearance.className)
        &&gear.requiredLevel<=Math.min(player.level,level+2)&&gearLootQuality(gear)===rule.itemId);
      const minimumLevel=rule.itemId==='common'||rule.itemId==='uncommon'?Math.max(0,...pool.map(gear=>gear.requiredLevel)):0;
      const eligible=pool.filter(gear=>gear.requiredLevel>=minimumLevel);
      trace?.({ stage: 'static-gear', quality: rule.itemId, className: player.appearance.className, minLevel: minimumLevel, maxLevel: Math.min(player.level,level+2), poolCount: pool.length,
        bandCount: pool.filter(gear=>gear.requiredLevel>=minimumLevel).length, eligibleCount: eligible.length,
        reason: eligible.length ? 'eligible' : 'no-class-level-quality-gear' });
      if(!eligible.length){ trace?.({ stage: 'table-rule', kind: rule.kind, itemId: rule.itemId, draw, chance: rule.chance, passed: true, awarded: false }); continue; }
      const { gear } = reserveGear(copyGear(eligible[Math.floor(random()*eligible.length)].id, random), owned);
      itemId=gear.id;quality=gearLootQuality(gear);
    }
    const min=rule.min||1,quantity=min+Math.floor(random()*((rule.max||min)-min+1));
    result.push({id:`${rule.kind}:${itemId}`,kind:rule.kind,itemId,quantity,quality});
    trace?.({ stage: 'table-rule', kind: rule.kind, ruleItemId: rule.itemId, draw, chance: rule.chance, passed: true, awarded: true, itemId, quantity, quality });
  }
  if (source && !(themed && source.dungeonBoss)) {
    const chance = source.instanceId ? DUNGEON_GEAR_ROLL_CHANCE : WORLD_GEAR_ROLL_CHANCE, draw = random();
    trace?.({ stage: 'extra-gear', source: source.instanceId ? 'dungeon' : 'world', draw, chance, passed: draw < chance });
    if (draw < chance) {
      const gear = rollEquipmentLoot(level, player, rollQuality(source.instanceId ? DUNGEON_GEAR_ODDS : WORLD_GEAR_ODDS, random, trace), random, owned, themed, trace);
      if (gear) result.push(gear);
    }
  } else {
    trace?.({ stage: 'extra-gear', reason: source ? 'themed-boss-reward' : 'no-killed-enemy-source' });
  }
  if (themed && source?.dungeonBoss && source.stageId === 'confluence') result.push(...rollDungeonCacheLoot(level, player, random, {
    themed: true, tier: 'midpoint', reservedGear: [...owned], trace,
  }));
  // Only a killed enemy supplies source; dungeon caches never award companion drops.
  const pet = source && kind !== 'moss-slime' && level >= 10 && PETS.find(pet => pet.source === kind
    && (pet.source !== 'ashen-crown-titan' || source.worldBoss === true && source.instanceId === null && level === 40));
  if (pet) {
    const draw = random();
    trace?.({ stage: 'pet', itemId: pet.id, draw, chance: pet.dropChance, passed: draw < pet.dropChance });
    if (draw < pet.dropChance) result.push({ id: `item:${pet.id}`, kind: 'item', itemId: pet.id, quantity: 1, quality: pet.quality });
  } else trace?.({ stage: 'pet', reason: 'no-eligible-pet' });
  trace?.({ stage: 'rolled-items', items: result.map(row => ({ kind: row.kind, itemId: row.itemId, quantity: row.quantity, quality: row.quality })) });
  return result;
}
export function lootRows(drop: Pick<LootDrop,'gold'|'relic'|'items'>): LootEntry[] {
  const rows: LootEntry[] = [
    ...(drop.gold>0?[{id:'gold',kind:'gold' as const,itemId:'gold',quantity:drop.gold,quality:'common' as const}]:[]),
    ...(drop.relic>0?[{id:'resource:relic',kind:'resource' as const,itemId:'relic',quantity:drop.relic,quality:'rare' as const}]:[]),
    ...(drop.items||[]),
  ];
  const result: LootEntry[] = [], stacks = new Map<string, LootEntry>();
  for (const row of rows) {
    const previous = stacks.get(row.id);
    if (previous) previous.quantity += row.quantity;
    else { const copy = { ...row }; result.push(copy); if (row.kind === 'item' || row.kind === 'resource') stacks.set(row.id, copy); }
  }
  return result;
}
