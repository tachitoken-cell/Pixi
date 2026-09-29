import { contractCooldown } from './gold-economy.ts';
import type { ZoneId } from './content.ts';
import type { CharacterClass, Player } from './shared.ts';
import { GEAR, GEAR_SETS } from './progression.ts';
import { LOOT_ITEMS } from './loot-items.ts';
import { skillProgress, professionXpGain } from './skills.ts';
import { REGION_ORIGINS } from './landscape.ts';
import { ROOTVAULT_ENTRANCE } from './dungeon.ts';
export { ROOTVAULT_ENTRANCE, ROOTVAULT_GUARDIAN } from './dungeon.ts';

export const BOARD_POSITION = { x: 3, z: 2 };
export const WORKSHOP_POSITION = { x: -4, z: 3 };
export const DUNGEON_ENTRANCE = {zone:'hollow' as const,x:ROOTVAULT_ENTRANCE.x-REGION_ORIGINS.hollow.x,z:ROOTVAULT_ENTRANCE.z-REGION_ORIGINS.hollow.z};
export const MAX_ACTIVE_CONTRACTS = 3;
export type ContractKind = 'kill' | 'gather' | 'craft' | 'dungeon';
export interface ContractState { active: Record<string, number>; completed: Record<string, number> }
export interface Contract {
  id: string; label: string; description: string; zone: ZoneId; kind: ContractKind; target: string; count: number;
  reward: { xp: number; gold: number }; cooldownMs: number;
  requiredLevel?:number; targetRegion?:string; targetLevel?:number;
}
export const CONTRACTS: Contract[] = [
  { id: 'greenwood-hunt', label: 'Keep the trails clear', description: 'Defeat four woodland slimes for the village patrol.', zone: 'greenwood', kind: 'kill', target: 'moss-slime', count: 4, reward: { xp: 60, gold: 18 }, cooldownMs: 120000 },
  { id: 'greenwood-timber', label: 'Timber for the road', description: 'Gather six loads of timber to repair the lantern posts.', zone: 'greenwood', kind: 'gather', target: 'timber', count: 6, reward: { xp: 45, gold: 15 }, cooldownMs: 120000 },
  { id: 'greenwood-herbs', label: 'The keeper’s garden', description: 'Gather six herbs for the village apothecary.', zone: 'greenwood', kind: 'gather', target: 'herb', count: 6, reward: { xp: 45, gold: 15 }, cooldownMs: 120000 },
  { id: 'greenwood-tonics', label: 'A remedy for the road', description: 'Brew two trail tonics at a workshop.', zone: 'greenwood', kind: 'craft', target: 'trail-tonic', count: 2, reward: { xp: 50, gold: 18 }, cooldownMs: 180000 },
  { id: 'amberwild-hunt', label: 'End the old watch', description: 'Defeat four briar sentinels among the forgotten roads.', zone: 'amberwild', kind: 'kill', target: 'briar-sentinel', count: 4, reward: { xp: 90, gold: 25 }, cooldownMs: 180000 },
  { id: 'amberwild-embers', label: 'Embers of the city', description: 'Gather five ember shards for the beacon keepers.', zone: 'amberwild', kind: 'gather', target: 'ember-shard', count: 5, reward: { xp: 70, gold: 20 }, cooldownMs: 180000 },
  { id: 'amberwild-timber', label: 'Rebuild the crossings', description: 'Gather eight loads of timber for the ruined bridges.', zone: 'amberwild', kind: 'gather', target: 'timber', count: 8, reward: { xp: 65, gold: 22 }, cooldownMs: 180000 },
  { id: 'frostmarch-hunt', label: 'Quiet the ice', description: 'Defeat four ice wisps along the observatory paths.', zone: 'frostmarch', kind: 'kill', target: 'ice-wisp', count: 4, reward: { xp: 110, gold: 30 }, cooldownMs: 180000 },
  { id: 'frostmarch-stars', label: 'Fallen starlight', description: 'Gather five star fragments for the astronomers.', zone: 'frostmarch', kind: 'gather', target: 'star-fragment', count: 5, reward: { xp: 90, gold: 25 }, cooldownMs: 180000 },
  { id: 'frostmarch-supplies', label: 'Supplies for the pass', description: 'Complete three workshop recipes for the winter travelers.', zone: 'frostmarch', kind: 'craft', target: '*', count: 3, reward: { xp: 90, gold: 28 }, cooldownMs: 180000 },
  { id: 'hollow-hunt', label: 'The keeper’s burden', description: 'Defeat a Rootbound Warden beneath the Hollow.', zone: 'hollow', kind: 'kill', target: 'root-warden', count: 1, reward: { xp: 150, gold: 45 }, cooldownMs: 300000 },
  { id: 'hollow-heartroots', label: 'Light beneath the roots', description: 'Gather three heartroots to steady the old lanterns.', zone: 'hollow', kind: 'gather', target: 'heartroot', count: 3, reward: { xp: 130, gold: 32 }, cooldownMs: 300000 },
  { id: 'hollow-vault', label: 'Into the Root Vault', description: 'Defeat the Root Vault’s final guardian and recover its relics.', zone: 'hollow', kind: 'dungeon', target: 'root-vault', count: 1, reward: { xp: 180, gold: 50 }, cooldownMs: 300000 },
  ...([
    [6,'amberwild','redleaf','Redleaf Highlands','briar-sentinel','Briar sentinels','ember-shard',6],
    [12,'frostmarch','stormcrag','Stormcrag Tundra','ice-wisp','Ice wisps','star-fragment',12],
    [18,'hollow','moonfen','Moonfen Marsh','ice-wisp','Ice wisps','heartroot',16],
    [24,'greenwood','elderwood','Elderwood Reach','moss-slime','Woodland slimes','timber',24],
    [28,'hollow','violet-reach','Violet Reach','briar-sentinel','Briar sentinels','heartroot',24],
    [30,'sunveil','dune-wells','Dunewell Oasis','dune-scorpion','Dune scorpions','ember-shard',30],
    [35,'sunveil','saffron-mesa','Saffron Mesa','stone-golem','Stone golems','ember-shard',36],
    [40,'sunveil','glass-dunes','Glass Dunes','ember-beetle','Ember beetles','ember-shard',40],
    [45,'mistwood','canopy-reach','Canopy Reach','grove-spider','Grove spiders','heartroot',45],
    [50,'mistwood','jade-rainforest','Jade Rainforest','marsh-toad','Marsh toads','heartroot',48],
    [55,'mistwood','mistwood-basin','Mistwood Basin','briar-boar','Briar boars','heartroot',52],
    [60,'mistwood','ancient-canopy','Ancient Canopy','void-stalker','Void stalkers','heartroot',56],
  ] as const).flatMap(([level,zone,region,label,kind,enemyLabel,resource,enemyLevel]):Contract[]=>[
    {id:`${region}-patrol`,label:`Patrol ${label}`,description:`Defeat eight ${enemyLabel.toLowerCase()} of level ${enemyLevel} or higher in ${label}.`,zone,kind:'kill',target:kind,count:8,requiredLevel:level,targetRegion:region,targetLevel:enemyLevel,reward:{xp:level*80,gold:level*6},cooldownMs:360000},
    {id:`${region}-supplies`,label:`Supplies from ${label}`,description:`Gather eight ${{heartroot:'heartroots','ember-shard':'ember shards','star-fragment':'star fragments',timber:'loads of timber'}[resource]} in ${label} for the expedition healers.`,zone,kind:'gather',target:resource,count:8,requiredLevel:level,targetRegion:region,reward:{xp:level*60,gold:level*4},cooldownMs:360000},
  ]),
];

export type CraftingMaterial = 'wood' | 'crystal' | 'herb' | 'relic';
export interface Recipe {
  id: string; label: string; description: string; cost: Partial<Record<CraftingMaterial, number>>;
  itemCost?: Record<string, number>;
  output: { resource?: 'wood' | 'crystal' | 'herb' | 'potion'; quantity?: number; gear?: string; item?: string };
  requiredLevel: number; requiredCraftingLevel: number; discipline: 'alchemy' | 'smithing' | 'woodworking'; className?: CharacterClass; craftingXp: number;
}
export const RECIPES: Recipe[] = [
  { id: 'trail-tonic', label: 'Trail tonic', description: 'Brew a healing potion from fresh herbs and a crystal.', cost: { herb: 2, crystal: 1 }, output: { resource: 'potion', quantity: 1 }, requiredCraftingLevel: 1, requiredLevel: 1, discipline: 'alchemy', craftingXp: 12 },
  { id: 'travelers-kit', label: 'Traveler’s remedies', description: 'Pack three healing potions for a longer journey.', cost: { herb: 5, crystal: 2, wood: 2 }, output: { resource: 'potion', quantity: 3 }, requiredCraftingLevel: 1, requiredLevel: 2, discipline: 'alchemy', craftingXp: 25 },
  { id: 'warden-longbow', label: 'Warden longbow', description: 'Shape a stronger bow from timber and crystal.', cost: { wood: 8, crystal: 3, herb: 2 }, output: { gear: 'warden-longbow' }, requiredCraftingLevel: 1, requiredLevel: 2, className: 'Ranger', discipline: 'woodworking', craftingXp: 40 },
  { id: 'sunsteel-sword', label: 'Sunsteel sword', description: 'Forge a bright blade for the village’s defenders.', cost: { wood: 3, crystal: 8, herb: 1 }, output: { gear: 'sunsteel-sword' }, requiredCraftingLevel: 1, requiredLevel: 2, className: 'Knight', discipline: 'smithing', craftingXp: 40 },
  { id: 'dawnlight-mace', label: 'Dawnlight mace', description: 'Set a golden sun crystal into a holy mace.', cost: { wood: 3, crystal: 7, herb: 3 }, output: { gear: 'dawnlight-mace' }, requiredCraftingLevel: 1, requiredLevel: 2, className: 'Cleric', discipline: 'smithing', craftingXp: 40 },
  { id: 'dawnweave-robes', label: 'Dawnweave vestments', description: 'Weave protective vestments for a pilgrim.', cost: { herb: 6, crystal: 4, wood: 2 }, output: { gear: 'dawnweave-robes' }, requiredCraftingLevel: 1, requiredLevel: 2, className: 'Cleric', discipline: 'alchemy', craftingXp: 35 },
  { id: 'starfall-staff', label: 'Starfall staff', description: 'Bind a crown of crystals to a carved woodland staff.', cost: { wood: 4, crystal: 7, herb: 2 }, output: { gear: 'starfall-staff' }, requiredCraftingLevel: 1, requiredLevel: 2, className: 'Mage', discipline: 'woodworking', craftingXp: 40 },
  { id: 'ranger-mantle', label: 'Warden mantle', description: 'Make a sturdy mantle for the deeper woodland.', cost: { wood: 6, herb: 5, crystal: 2 }, output: { gear: 'ranger-mantle' }, requiredCraftingLevel: 1, requiredLevel: 2, className: 'Ranger', discipline: 'woodworking', craftingXp: 35 },
  { id: 'sunsteel-plate', label: 'Sunsteel plate', description: 'Fit protective plates for the road ahead.', cost: { wood: 4, crystal: 8 }, output: { gear: 'sunsteel-plate' }, requiredCraftingLevel: 1, requiredLevel: 2, className: 'Knight', discipline: 'smithing', craftingXp: 35 },
  { id: 'starwoven-robes', label: 'Starwoven robes', description: 'Weave a little crystal light into a scholar’s robes.', cost: { herb: 4, crystal: 6, wood: 2 }, output: { gear: 'starwoven-robes' }, requiredCraftingLevel: 1, requiredLevel: 2, className: 'Mage', discipline: 'alchemy', craftingXp: 35 },
  { id: 'rootforged-sigil', label: 'Rootforged sigil', description: 'Bind two Root Vault relics into a powerful protective charm.', cost: { relic: 2, crystal: 5, wood: 3 }, output: { gear: 'rootforged-charm' }, requiredCraftingLevel: 1, requiredLevel: 3, discipline: 'smithing', craftingXp: 90 },
  { id: 'woodland-remedies', label: 'Woodland remedies', description: 'Prepare a fresh batch of three trail potions. An efficient first step toward journeyman crafting.', cost: { herb: 4, crystal: 2, wood: 1 }, output: { resource: 'potion', quantity: 3 }, requiredLevel: 1, requiredCraftingLevel: 1, discipline: 'alchemy', craftingXp: 100 },
  { id: 'reclaim-timber', label: 'Reclaim heartwood', description: 'Trim weathered bark into sound timber for equipment and remedies.', cost: {}, itemCost: { 'gnarled-bark': 3 }, output: { resource: 'wood', quantity: 2 }, requiredLevel: 1, requiredCraftingLevel: 1, discipline: 'woodworking', craftingXp: 75 },
  { id: 'polish-crystals', label: 'Polish clouded shards', description: 'Cut away the cloudy crust to recover useful crafting crystals.', cost: {}, itemCost: { 'frost-shard': 3 }, output: { resource: 'crystal', quantity: 2 }, requiredLevel: 1, requiredCraftingLevel: 1, discipline: 'smithing', craftingXp: 75 },
  { id: 'moonpetal-remedies', label: 'Moonpetal remedies', description: 'Concentrate woodland herbs into two greater healing tonics, each restoring 100 health.', cost: { herb: 8, crystal: 3, wood: 2 }, output: { item: 'greater-tonic', quantity: 2 }, requiredLevel: 1, requiredCraftingLevel: 10, discipline: 'alchemy', craftingXp: 600 },
  { id: 'frostbloom-remedies', label: 'Frostbloom remedies', description: 'Distill a winter expedition supply of five greater healing tonics.', cost: { herb: 15, crystal: 6, wood: 3 }, output: { item: 'greater-tonic', quantity: 5 }, requiredLevel: 1, requiredCraftingLevel: 25, discipline: 'alchemy', craftingXp: 2000 },
  { id: 'sunblossom-remedies', label: 'Sunblossom remedies', description: 'An artisan batch of nine greater healing tonics for the longest journeys.', cost: { herb: 24, crystal: 9, wood: 6 }, output: { item: 'greater-tonic', quantity: 9 }, requiredLevel: 1, requiredCraftingLevel: 50, discipline: 'alchemy', craftingXp: 5000 },
  ...GEAR_SETS.filter(set => [12, 25, 50].includes(set.requiredLevel)).flatMap(set => (['weapon', 'armor'] as const).map(slot => {
    const gear = GEAR[`${set.id}-${slot}`], requiredCraftingLevel = set.requiredLevel === 12 ? 10 : set.requiredLevel;
    const scale = requiredCraftingLevel === 10 ? 1 : requiredCraftingLevel === 25 ? 2 : 4;
    return { id: `craft-${gear.id}`, label: gear.label, description: `Craft ${gear.label} for your next expedition. ${gear.description}`,
      cost: { wood: (set.className === 'Ranger' ? 14 : 6) * scale, crystal: (set.className === 'Knight' ? 16 : 8) * scale, herb: (set.className === 'Mage' || set.className === 'Cleric' ? 14 : 6) * scale },
      output: { gear: gear.id }, requiredLevel: gear.requiredLevel, requiredCraftingLevel, className: set.className,
      discipline: set.className === 'Knight' || set.className === 'Cleric' && slot === 'weapon' ? 'smithing' as const : slot === 'weapon' || set.className === 'Ranger' ? 'woodworking' as const : 'alchemy' as const,
      craftingXp: requiredCraftingLevel === 10 ? 900 : requiredCraftingLevel === 25 ? 3000 : 7500 };
  })),
];

const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object'
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
export const newContracts = (): ContractState => ({ active: {}, completed: {} });
export function validateContracts(value: unknown): value is ContractState {
  if (!record(value) || Object.keys(value).length !== 2 || !Object.hasOwn(value, 'active') || !Object.hasOwn(value, 'completed')
      || !record(value.active) || !record(value.completed) || Object.keys(value.active).length > MAX_ACTIVE_CONTRACTS) return false;
  return Object.entries(value.active).every(([id, progress]) => {
    const contract = CONTRACTS.find(item => item.id === id);
    return contract && integer(progress) && progress <= contract.count;
  }) && Object.entries(value.completed).every(([id, nextAvailableAt]) => CONTRACTS.some(item => item.id === id) && integer(nextAvailableAt));
}
export function acceptContract(state: ContractState, id: string, zone: ZoneId, now: number, level=1): boolean {
  const contract = CONTRACTS.find(item => item.id === id);
  if (!validateContracts(state) || !contract || contract.zone !== zone || !integer(now) || !integer(level) || level<(contract.requiredLevel??1)
      || Object.keys(state.active).length >= MAX_ACTIVE_CONTRACTS || Object.hasOwn(state.active, id) || (state.completed[id] ?? 0) > now) return false;
  state.active[id] = 0;
  return true;
}
export function cancelContract(state: ContractState, id: string): boolean {
  if (typeof id !== 'string' || !validateContracts(state) || !Object.hasOwn(state.active, id)) return false;
  delete state.active[id];
  return true;
}
export function contractProgress(state: ContractState, kind: ContractKind, target: string, amount = 1, context?:{zone:ZoneId;regionId:string;level?:number}): boolean {
  if (!validateContracts(state) || !integer(amount) || amount === 0 || typeof target !== 'string' || !target) return false;
  let changed = false;
  for (const id of Object.keys(state.active)) {
    const contract = CONTRACTS.find(item => item.id === id)!;
    if (contract.kind !== kind || contract.target !== target && contract.target !== '*') continue;
    if(contract.targetRegion&&(!context||context.zone!==contract.zone||context.regionId!==contract.targetRegion
      ||contract.targetLevel!==undefined&&(!Number.isSafeInteger(context.level)||context.level!<contract.targetLevel)))continue;
    const progress = state.active[id] + Math.min(amount, contract.count - state.active[id]);
    if (progress !== state.active[id]) { state.active[id] = progress; changed = true; }
  }
  return changed;
}
export function claimContract(state: ContractState, id: string, zone: ZoneId, now: number, active = false): Contract | null {
  const contract = CONTRACTS.find(item => item.id === id);
  if (!validateContracts(state) || !contract || contract.zone !== zone || !integer(now) || !integer(now + contract.cooldownMs)
      || !Object.hasOwn(state.active, id) || state.active[id] !== contract.count) return null;
  delete state.active[id];
  state.completed[id] = now + contractCooldown(contract, active);
  return contract;
}
export interface CraftingPlayer {
  level: number; craftingXp?: number; appearance: { className: CharacterClass }; ownedGear: string[]; carriedItems?: Partial<Record<string, number>>;
  inventory: { wood: number; crystal: number; herb: number; potion: number; relic?: number };
}
export const craftingProgress = skillProgress;
export const craftingXpGain = (recipe: Recipe, totalXp: number) => professionXpGain(recipe.craftingXp, recipe.requiredCraftingLevel, totalXp);
export function nextCraftingUnlock(className: CharacterClass, totalXp: number): { level: number; recipes: Recipe[] } | undefined {
  const future = RECIPES.filter(recipe => (!recipe.className || recipe.className === className) && recipe.requiredCraftingLevel > craftingProgress(totalXp).level);
  if (!future.length) return;
  const level = Math.min(...future.map(recipe => recipe.requiredCraftingLevel));
  return { level, recipes: future.filter(recipe => recipe.requiredCraftingLevel === level) };
}
export function recipeMaterialRows(player: CraftingPlayer, recipe: Recipe): { id: string; label: string; owned: number; quantity: number }[] {
  return [
    ...Object.entries(recipe.cost).map(([id, quantity]) => ({ id, label: id, owned: player.inventory[id as CraftingMaterial] ?? 0, quantity })),
    ...Object.entries(recipe.itemCost || {}).map(([id, quantity]) => ({ id, label: LOOT_ITEMS[id].label, owned: player.carriedItems?.[id] ?? 0, quantity })),
  ];
}
export function recipeAllowed(player: CraftingPlayer, recipe: Recipe): boolean {
  if (!RECIPES.includes(recipe) || !integer(player.level) || player.level < recipe.requiredLevel
      || !integer(player.craftingXp ?? 0) || craftingProgress(player.craftingXp ?? 0).level < recipe.requiredCraftingLevel
      || recipe.className && player.appearance.className !== recipe.className) return false;
  if (!recipeMaterialRows(player, recipe).every(({ owned, quantity }) => integer(owned) && owned >= quantity)) return false;
  if (recipe.output.gear) {
    const gear = GEAR[recipe.output.gear];
    return !!gear && player.level >= gear.requiredLevel && (!gear.className || player.appearance.className === gear.className)
      && !player.ownedGear.includes(gear.id);
  }
  const count = recipe.output.item ? player.carriedItems?.[recipe.output.item] ?? 0 : player.inventory[recipe.output.resource!];
  return (!recipe.output.item || Object.hasOwn(LOOT_ITEMS, recipe.output.item)) && integer(count) && integer(count + recipe.output.quantity!);
}

/** One projected bag state for the workshop UI and the authoritative commit. */
export function recipeOutput(player: Pick<Player, 'inventory' | 'ownedGear' | 'carriedItems'>, recipe: Recipe) {
  const inventory = { ...player.inventory }, ownedGear = [...player.ownedGear], carriedItems = { ...player.carriedItems };
  for (const [resource, quantity] of Object.entries(recipe.cost)) inventory[resource as CraftingMaterial] -= quantity;
  for (const [item, quantity] of Object.entries(recipe.itemCost || {})) carriedItems[item] = (carriedItems[item] ?? 0) - quantity;
  if (recipe.output.gear) ownedGear.push(recipe.output.gear);
  else if (recipe.output.item) carriedItems[recipe.output.item] = (carriedItems[recipe.output.item] ?? 0) + recipe.output.quantity!;
  else inventory[recipe.output.resource!] += recipe.output.quantity!;
  return { inventory, ownedGear, carriedItems };
}
