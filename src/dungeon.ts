import type { EnemyKind, ZoneId } from './content.ts';
import type { RealmBounds, RealmCollider, RealmPoint } from './realm.ts';
export const ROOTVAULT_ENTRANCE = { zone:'hollow' as const,x:540,z:112 };
export const ROOTVAULT_GUARDIAN = { id:'rootvault-gate-guardian',kind:'root-warden' as const,zone:'hollow' as const,x:540,z:122 };

export type LegacyDungeonId = 'rootvault' | 'cindercrypt' | 'frosthollow' | 'nightroot' | 'plagueworks' | 'emberfall' | 'veilhaven';
export type StoryDungeonId = 'greenwood-root-chamber' | 'broken-watch' | 'ashbound-hall' | 'frozen-memory' | 'hollow-door' | 'veiled-sun-temple';
export type DungeonId = LegacyDungeonId | StoryDungeonId;
export interface DungeonDefinition {
  id: DungeonId; name: string; minLevel: number; maxLevel: number; description: string; completionXp: number;
  /** Quest chambers use one-time quest rewards and existing regional dungeon art. */
  storyQuestId?: string; themeId?: LegacyDungeonId;
  entrance: { zone: ZoneId; x: number; z: number }; summonStone: { x: number; z: number }; color: string;
}
export const LEGACY_DUNGEONS: readonly DungeonDefinition[] = [
  { id: 'rootvault', name: 'The Rootvault', minLevel: 10, maxLevel: 14, description: 'Break the living roots and awaken the two ancient seals.', completionXp: 750,
    entrance: ROOTVAULT_ENTRANCE, summonStone: { x: 545, z: 118 }, color: '#a9ef48' },
  { id: 'cindercrypt', name: 'Cindercrypt', minLevel: 15, maxLevel: 19, description: 'Unseal the furnace portals and battle through the ash chambers to the Cinder Colossus.', completionXp: 1250,
    entrance: { zone: 'amberwild', x: 360, z: -22 }, summonStone: { x: 365, z: -16 }, color: '#ff963d' },
  { id: 'frosthollow', name: 'Frosthollow', minLevel: 20, maxLevel: 24, description: 'Cross enchanted portals into vast crystal chambers and challenge the Rime Sovereign.', completionXp: 1900,
    entrance: { zone: 'frostmarch', x: 570, z: -520 }, summonStone: { x: 575, z: -514 }, color: '#75dfff' },
  { id: 'nightroot', name: 'Nightroot Citadel', minLevel: 25, maxLevel: 30, description: 'Clear the citadel’s sealed chambers and awaken the portals into the Dreadheart court.', completionXp: 2800,
    entrance: { zone: 'hollow', x: 590, z: 630 }, summonStone: { x: 595, z: 636 }, color: '#c692ff' },
  { id: 'plagueworks', name: 'The Plagueworks', minLevel: 30, maxLevel: 35, description: 'Purge infested catacombs, silence Broodmother Vex, and destroy the Plague Abomination.', completionXp: 4000,
    entrance: { zone: 'hollow', x: 1110, z: -90 }, summonStone: { x: 1115, z: -84 }, color: '#a8dc54' },
  { id: 'emberfall', name: 'Emberfall Foundry', minLevel: 40, maxLevel: 45, description: 'Cross the dwarven furnace halls, break the Anvil Warden, and extinguish Pyrelord Ignivar.', completionXp: 6200,
    entrance: { zone: 'sunveil', x: -750, z: -990 }, summonStone: { x: -745, z: -984 }, color: '#ff7635' },
  { id: 'veilhaven', name: 'Veilhaven Monastery', minLevel: 50, maxLevel: 55, description: 'Unseal the haunted cloisters, still Bellkeeper Shen, and confront the Veiled Abbess.', completionXp: 9000,
    entrance: { zone: 'mistwood', x: 1100, z: 700 }, summonStone: { x: 1105, z: 706 }, color: '#65e0dc' },
];
/** Authored room counts and levels; placements use the current realm, not the separate atlas. */
export const STORY_DUNGEONS: readonly DungeonDefinition[] = [
  { id:'greenwood-root-chamber', name:'Greenwood Root Chamber', minLevel:7, maxLevel:7, completionXp:0, storyQuestId:'story-the-sealed-root', themeId:'rootvault',
    description:'Clear five root-bound chambers and awaken both root seals.', entrance:{zone:'greenwood',x:-200,z:100}, summonStone:{x:-195,z:106}, color:'#a9ef48' },
  { id:'broken-watch', name:'The Broken Watch', minLevel:10, maxLevel:10, completionXp:0, storyQuestId:'story-the-broken-watch', themeId:'cindercrypt',
    description:'Repair three watch mechanisms across six chambers and defeat the watch guardian.', entrance:{zone:'amberwild',x:-630,z:-420}, summonStone:{x:-625,z:-414}, color:'#ffb55e' },
  { id:'ashbound-hall', name:'Ashbound Hall', minLevel:14, maxLevel:14, completionXp:0, storyQuestId:'story-ashbound-hall', themeId:'cindercrypt',
    description:'Find the key, survive the ambush, pull the lever and defend the furnace before facing its guardian.', entrance:{zone:'amberwild',x:420,z:-170}, summonStone:{x:425,z:-164}, color:'#ff963d' },
  { id:'frozen-memory', name:'Frozen Memory', minLevel:18, maxLevel:18, completionXp:0, storyQuestId:'story-memory-beneath-ice', themeId:'frosthollow',
    description:'Solve the frozen runes, weather the siege and reach the archive guarded by the Memory Warden.', entrance:{zone:'frostmarch',x:260,z:-650}, summonStone:{x:265,z:-644}, color:'#75dfff' },
  { id:'hollow-door', name:'The Hollow Door', minLevel:24, maxLevel:24, completionXp:0, storyQuestId:'story-the-hollow-door', themeId:'nightroot',
    description:'Recover the shadow keys and guard the lantern through eight haunted chambers.', entrance:{zone:'hollow',x:650,z:370}, summonStone:{x:655,z:376}, color:'#c692ff' },
  { id:'veiled-sun-temple', name:'Temple of the Veiled Sun', minLevel:44, maxLevel:44, completionXp:0, storyQuestId:'story-temple-of-the-veiled-sun', themeId:'emberfall',
    description:'Cross ten temple rooms with traps, sealed doors, an optional treasury and a final guardian.', entrance:{zone:'sunveil',x:-1190,z:-1300}, summonStone:{x:-1185,z:-1294}, color:'#ffc66e' },
];
export const DUNGEONS: readonly DungeonDefinition[] = [...LEGACY_DUNGEONS, ...STORY_DUNGEONS];
export const dungeonThemeId = (id: DungeonId): LegacyDungeonId => getDungeon(id)?.themeId ?? id as LegacyDungeonId;
export const getDungeon = (id: unknown = 'rootvault'): DungeonDefinition | undefined => DUNGEONS.find(dungeon => dungeon.id === id);

export const DUNGEON_BOUNDS = { minX: -50, maxX: 50, minZ: -120, maxZ: 27 };
export const DUNGEON_START = { x: 0, z: 22 };
export const DUNGEON_EXIT = { x: 0, z: 25 };
export const DUNGEON_RETURN = { x: 0, z: -113 };
/** Intersect the doorway plane so a legal movement step cannot skip the portal. */
export function crossedDungeonPortal(from: RealmPoint, to: RealmPoint, portal: RealmPoint): boolean {
  const plane = portal.z + .4;
  if (from.z <= plane || to.z > plane) return false;
  const along = (plane - from.z) / (to.z - from.z);
  return Math.abs(from.x + (to.x - from.x) * along - portal.x) <= 2.5;
}
export const DUNGEON_CHECKPOINT = { x: 0, z: -61 };
export const DUNGEON_COMPLETION_XP = 750;
export interface DungeonRoom { id: string; name: string; x: number; z: number; width: number; depth: number; theme: 'moss' | 'amber' | 'frost' | 'root'; optional?: boolean }
export const DUNGEON_ROOMS: DungeonRoom[] = [
  { id: 'threshold', name: 'The Overgrown Threshold', x: 0, z: 12, width: 30, depth: 28, theme: 'moss' },
  { id: 'crossing', name: 'Lantern Crossing', x: 0, z: -20, width: 30, depth: 36, theme: 'moss' },
  { id: 'west-seal', name: 'The Sunken Garden', x: -31.5, z: -23, width: 33, depth: 34, theme: 'moss' },
  { id: 'east-seal', name: 'The Frozen Archive', x: 31.5, z: -23, width: 33, depth: 34, theme: 'frost' },
  { id: 'confluence', name: 'Sanctuary of Two Lights', x: 0, z: -55, width: 30, depth: 34, theme: 'amber' },
  { id: 'reliquary', name: 'The Lost Reliquary', x: -31.5, z: -70, width: 33, depth: 40, theme: 'amber' },
  { id: 'forge', name: 'The Heartroot Forge', x: 31.5, z: -70, width: 33, depth: 40, theme: 'root' },
  { id: 'rootway', name: 'The Processional Way', x: 0, z: -81, width: 30, depth: 18, theme: 'root' },
  { id: 'throne', name: 'The Heartkeeper’s Court', x: 0, z: -104, width: 76, depth: 28, theme: 'root' },
];
export interface DungeonWall { x: number; z: number; r: number; halfWidth: number; halfDepth: number; height: number }
const walls: DungeonWall[] = [];
function wall(x: number, z: number, width: number, depth: number, height = 4.4) {
  walls.push({ x, z, r: Math.hypot(width / 2, depth / 2), halfWidth: width / 2, halfDepth: depth / 2, height });
}
// The exterior follows the rooms, closing the unused strips between the two wings.
for (const side of [-1, 1]) {
  wall(side * 15, 4.5, 1.2, 43); wall(side * 15, -42, 1.2, 34); wall(side * 15, -78.5, 1.2, 23);
  wall(side * 48, -23, 1.4, 34); wall(side * 48, -70, 1.4, 40);
  for (const z of [-6, -40, -50]) wall(side * 31.5, z, 33, 1.2);
  wall(side * 38, -104, 1.4, 28);
}
wall(0, -118, 77.4, 1.4);
// Every arch is an eight-metre opening in the collision walls.
for (const z of [26, -2, -38, -90]) {
  const edge = z === -90 ? 48 : 15;
  wall(-(edge + 4) / 2, z, edge - 4, 1.2); wall((edge + 4) / 2, z, edge - 4, 1.2);
}
// Pillars provide cover without filling the central route or the shallow basins.
for (const [x, z] of [[-9, 6], [9, 6], [-9, -12], [9, -12], [-39, -29], [-24, -33], [39, -29], [24, -33], [-9, -46], [9, -46], [-40, -73], [-24, -81], [40, -73], [24, -81], [-13, -100], [13, -100], [-27, -110], [27, -110]]) wall(x, z, 1.8, 1.8, 5.6);
export const DUNGEON_WALLS: readonly DungeonWall[] = walls;
export interface DungeonGate { id: string; label: string; x: number; z: number; width: number; axis: 'x' | 'z'; requires: string[]; seals?: string[] }
export interface DungeonRoomPortal extends RealmPoint {
  id: string; label: string; roomId: string; targetRoomId: string; destination: RealmPoint; requires: string[]; seals?: string[];
}
export interface DungeonShrine extends RealmPoint { roomId: string; width: number; depth: number; height: number }
export const DUNGEON_GATES: DungeonGate[] = [
  { id: 'threshold-gate', label: 'Clear the Threshold', x: 0, z: -2, width: 8, axis: 'x', requires: ['threshold'] },
  { id: 'garden-gate', label: 'Clear Lantern Crossing', x: -15, z: -21, width: 8, axis: 'z', requires: ['crossing'] },
  { id: 'archive-gate', label: 'Clear Lantern Crossing', x: 15, z: -21, width: 8, axis: 'z', requires: ['crossing'] },
  { id: 'sanctuary-gate', label: 'Clear both wings and awaken their seals', x: 0, z: -38, width: 8, axis: 'x', requires: ['west-seal', 'east-seal'], seals: ['verdant-seal', 'glacial-seal'] },
  { id: 'reliquary-gate', label: 'Clear the Sanctuary', x: -15, z: -63, width: 8, axis: 'z', requires: ['confluence'] },
  { id: 'forge-gate', label: 'Clear the Sanctuary', x: 15, z: -63, width: 8, axis: 'z', requires: ['confluence'] },
  { id: 'heartkeeper-gate', label: 'Clear the Reliquary and Forge', x: 0, z: -90, width: 8, axis: 'x', requires: ['reliquary', 'forge'] },
];
export const DUNGEON_DOORS = [
  { x: 0, z: 26, width: 8, axis: 'x' as const },
  ...DUNGEON_GATES.map(({ x, z, width, axis }) => ({ x, z, width, axis })),
];
export const DUNGEON_LANTERNS = [
  ...[-12.8, 12.8].flatMap(x => [22, 1, -32, -54, -73, -85].map(z => ({ x, z }))),
  ...[-44.8, 44.8].flatMap(x => [-19, -35, -62, -84].map(z => ({ x, z }))),
  { x: -6, z: -113 }, { x: 6, z: -113 },
];
// Full basin extents; the water sits inside the authored stone rim.
export const DUNGEON_POOLS = [-1, 1].flatMap(side => [
  { x: side * 9, z: 17, width: 6.46, depth: 4.64 }, { x: side * 9, z: -29, width: 6.46, depth: 4.64 },
  { x: side * 40, z: -13, width: 6.46, depth: 4.64 }, { x: side * 40, z: -56, width: 6.46, depth: 4.64 },
]);
export const DUNGEON_COLLIDERS: RealmCollider[] = [
  ...DUNGEON_WALLS.map(({ height: _, ...collider }) => collider),
  ...DUNGEON_LANTERNS.map(point => ({ ...point, r: .35 })),
  ...DUNGEON_POOLS.map(pool => ({ x: pool.x, z: pool.z, r: Math.hypot(pool.width / 2, pool.depth / 2), halfWidth: pool.width / 2, halfDepth: pool.depth / 2 })),
];
type DungeonProgress = ReadonlySet<string> | readonly string[];
const hasProgress = (progress: DungeonProgress, id: string) => Array.isArray(progress) ? progress.includes(id) : (progress as ReadonlySet<string>).has(id);
export function dungeonGateOpen(gate: DungeonGate, clearedStages: DungeonProgress = [], activatedObjects: DungeonProgress = []): boolean {
  return gate.requires.every(id => hasProgress(clearedStages, id)) && (!gate.seals || gate.seals.every(id => hasProgress(activatedObjects, id)));
}
export function dungeonRoomPortalOpen(portal: DungeonRoomPortal, clearedStages: DungeonProgress = [], activatedObjects: DungeonProgress = []): boolean {
  return (portal.roomId === 'preparation' || hasProgress(clearedStages, portal.roomId))
    && portal.requires.every(id => hasProgress(clearedStages, id)) && (!portal.seals || portal.seals.every(id => hasProgress(activatedObjects, id)));
}
const colliderStates = new Map<string, RealmCollider[]>();
export function dungeonColliders(clearedStages: DungeonProgress = [], activatedObjects: DungeonProgress = [], id: DungeonId = 'rootvault'): RealmCollider[] {
  const layout = dungeonLayout(id);
  let closed = 0;
  for (let i = 0; i < layout.gates.length; i++) if (!dungeonGateOpen(layout.gates[i], clearedStages, activatedObjects)) closed |= 1 << i;
  if (!closed) return layout.colliders;
  const key = `${id}:${closed}`;
  let colliders = colliderStates.get(key);
  if (!colliders) {
    colliders = [...layout.colliders, ...layout.gates.filter((_, i) => closed & 1 << i).map(gate => ({ x: gate.x, z: gate.z, r: gate.width / 2,
      halfWidth: gate.axis === 'x' ? gate.width / 2 : .3, halfDepth: gate.axis === 'z' ? gate.width / 2 : .3 }))];
    colliderStates.set(key, colliders);
  }
  return colliders;
}
export interface DungeonStoryObjective {
  kind: 'survival' | 'defense' | 'protection'; label: string; durationMs: number; protectRadius?: number; waves: EnemyKind[][];
}
export interface DungeonStage { id: string; level: number; name: string; x: number; z: number; requires: string[]; optional?: boolean;
  storyObjective?: DungeonStoryObjective; enemies: { kind: EnemyKind; x: number; z: number; boss?: boolean; name?: string }[] }
const storyStages = new Map<DungeonId, DungeonStage[]>();
export const DUNGEON_STAGES: DungeonStage[] = [
  { id: 'threshold', level: 10, name: 'The Overgrown Threshold', x: 0, z: 10, requires: [], enemies: [{ kind: 'moss-slime', x: -3, z: 11 }, { kind: 'moss-slime', x: 3, z: 11 }, { kind: 'briar-sentinel', x: 0, z: 5 }] },
  { id: 'crossing', level: 10, name: 'Lantern Crossing', x: 0, z: -18, requires: ['threshold'], enemies: [{ kind: 'briar-sentinel', x: -5, z: -17 }, { kind: 'moss-slime', x: 5, z: -17 }, { kind: 'ice-wisp', x: 0, z: -24 }] },
  { id: 'west-seal', level: 11, name: 'The Sunken Garden', x: -31, z: -25, requires: ['crossing'], enemies: [{ kind: 'moss-slime', x: -35, z: -24 }, { kind: 'moss-slime', x: -27, z: -24 }, { kind: 'briar-sentinel', x: -31, z: -30 }] },
  { id: 'east-seal', level: 11, name: 'The Frozen Archive', x: 31, z: -25, requires: ['crossing'], enemies: [{ kind: 'ice-wisp', x: 27, z: -24 }, { kind: 'ice-wisp', x: 35, z: -24 }, { kind: 'briar-sentinel', x: 31, z: -30 }] },
  { id: 'confluence', level: 12, name: 'Sanctuary of Two Lights', x: 0, z: -52, requires: ['west-seal', 'east-seal'], enemies: [{ kind: 'briar-sentinel', x: -5, z: -53 }, { kind: 'briar-sentinel', x: 5, z: -53 }, { kind: 'ice-wisp', x: 0, z: -45 }] },
  { id: 'reliquary', level: 13, name: 'The Lost Reliquary', x: -31, z: -73, requires: ['confluence'], enemies: [{ kind: 'briar-sentinel', x: -35, z: -71 }, { kind: 'ice-wisp', x: -27, z: -71 }, { kind: 'moss-slime', x: -31, z: -79 }] },
  { id: 'forge', level: 13, name: 'The Heartroot Forge', x: 31, z: -73, requires: ['confluence'], enemies: [{ kind: 'briar-sentinel', x: 27, z: -71 }, { kind: 'briar-sentinel', x: 35, z: -71 }, { kind: 'ice-wisp', x: 31, z: -79 }] },
  { id: 'throne', level: 14, name: 'The Heartkeeper’s Court', x: 0, z: -104, requires: ['reliquary', 'forge'], enemies: [{ kind: 'root-warden', x: 0, z: -108 }, { kind: 'ice-wisp', x: -7, z: -99 }, { kind: 'briar-sentinel', x: 7, z: -99 }] },
];
// The authored kit is shared; routes, encounter positions, pack sizes, and dependencies are not.
const themedStages: Record<Exclude<LegacyDungeonId, 'rootvault'>, { names: string[]; kinds: EnemyKind[][] }> = {
  cindercrypt: {
    names: ['Ashen Vestibule', 'Ember Crossing', 'The Scorched Ossuary', 'The Molten Archive', 'Sanctuary of Cinders', 'The Charred Reliquary', 'The Furnace of Echoes', 'The Cinder Colossus'],
    kinds: [['ember-beetle', 'ember-beetle', 'dune-scorpion'], ['dune-scorpion', 'ember-beetle', 'stone-golem'], ['ember-beetle', 'dune-scorpion', 'stone-golem'], ['ember-beetle', 'ember-beetle', 'stone-golem'], ['stone-golem', 'dune-scorpion', 'ember-beetle'], ['dune-scorpion', 'stone-golem', 'ember-beetle'], ['stone-golem', 'stone-golem', 'ember-beetle'], ['stone-golem', 'ember-beetle', 'dune-scorpion']],
  },
  frosthollow: {
    names: ['Rimebound Threshold', 'The White Crossing', 'The Hoarfrost Garden', 'The Crystal Archive', 'Sanctuary of Still Winter', 'The Glacial Reliquary', 'The Frostheart Crucible', 'The Rime Sovereign'],
    kinds: [['frost-yeti', 'ice-wisp', 'frost-yeti'], ['crystal-bat', 'frost-yeti', 'ice-wisp'], ['frost-yeti', 'frost-yeti', 'ice-wisp'], ['ice-wisp', 'crystal-bat', 'frost-yeti'], ['frost-yeti', 'frost-yeti', 'ice-wisp'], ['frost-yeti', 'crystal-bat', 'ice-wisp'], ['frost-yeti', 'frost-yeti', 'crystal-bat'], ['frost-yeti', 'frost-yeti', 'ice-wisp']],
  },
  nightroot: {
    names: ['The Twilight Breach', 'Crossing of Whispers', 'The Withered Grove', 'The Forbidden Archive', 'Sanctuary of the Eclipse', 'The Shadow Reliquary', 'The Blackroot Crucible', 'The Dreadheart Throne'],
    kinds: [['void-stalker', 'void-stalker', 'root-warden'], ['void-stalker', 'root-warden', 'grove-spider'], ['root-warden', 'void-stalker', 'grove-spider'], ['void-stalker', 'void-stalker', 'root-warden'], ['root-warden', 'root-warden', 'void-stalker'], ['void-stalker', 'root-warden', 'grove-spider'], ['root-warden', 'root-warden', 'void-stalker'], ['root-warden', 'void-stalker', 'void-stalker']],
  },
  plagueworks: {
    names: ['Quarantine Descent', 'The Bone Sluice', 'The Cocoon Vault', 'The Alchemical Cistern', 'Broodmother Vex’s Nest', 'The Specimen Gallery', 'The Blighted Laboratory', 'The Abomination Reservoir'],
    kinds: [['bone-rat', 'crypt-bat', 'corpse-scarab'], ['bone-rat', 'mire-leech', 'carrion-hound'], ['crypt-weaver', 'corpse-scarab', 'crypt-bat'], ['plague-alchemist', 'mire-leech', 'fungal-thrall'], ['broodmother-vex', 'crypt-weaver', 'corpse-scarab'], ['plague-knight', 'crypt-bat', 'fungal-thrall'], ['plague-alchemist', 'fungal-thrall', 'sewer-horror'], ['plague-abomination', 'plague-knight', 'sewer-horror']],
  },
  emberfall: {
    names: ['The Brass Descent', 'Slagworks Crossing', 'The Crucible Hall', 'The Runic Smeltery', 'The Anvil Warden’s Dais', 'The Chainworks', 'The Crown Furnace', 'Pyrelord Ignivar’s Crucible'],
    kinds: [['ember-imp', 'slag-crawler', 'cinder-hound'], ['forge-spider', 'furnace-revenant', 'ember-imp'], ['slag-crawler', 'slag-elemental', 'brass-sentinel'], ['furnace-priest', 'ember-imp', 'ash-drake'], ['anvil-warden', 'brass-sentinel', 'forge-spider'], ['chain-jailer', 'furnace-revenant', 'forge-spider'], ['slag-elemental', 'furnace-priest', 'cinder-hound'], ['pyrelord-ignivar', 'ash-drake', 'chain-jailer']],
  },
  veilhaven: {
    names: ['The Pilgrim Steps', 'The Lantern Court', 'The Ancestral Archive', 'The Jade Reliquary', 'Bellkeeper Shen’s Hall', 'The Incense Cloister', 'The Mourning Garden', 'The Veiled Abbess’s Sanctum'],
    kinds: [['paper-shikigami', 'grave-fox', 'mist-crane'], ['lantern-wraith', 'paper-shikigami', 'jade-sentinel'], ['mist-crane', 'incense-acolyte', 'lantern-wraith'], ['jade-sentinel', 'jade-lion', 'spirit-koi'], ['bellkeeper-shen', 'temple-ronin', 'lantern-wraith'], ['incense-acolyte', 'paper-shikigami', 'mourning-mask'], ['grave-fox', 'spirit-koi', 'jade-lion'], ['veiled-abbess', 'mourning-mask', 'temple-ronin']],
  },
};
export function dungeonStages(id: DungeonId = 'rootvault'): DungeonStage[] {
  return storyStages.get(id) ?? (id === 'rootvault' ? DUNGEON_STAGES : stageVariants[id as Exclude<LegacyDungeonId, 'rootvault'>]);
}

export interface DungeonObject { id: string; kind: 'seal' | 'chest' | 'checkpoint'; label: string; x: number; z: number; r: number; stageId: string; requires?: string[] }
// r is the visible marker radius; server interaction range is always three metres.
export const DUNGEON_OBJECTS: DungeonObject[] = [
  { id: 'verdant-seal', kind: 'seal', label: 'Verdant rune seal', x: -31, z: -35, r: 1.3, stageId: 'west-seal' },
  { id: 'glacial-seal', kind: 'seal', label: 'Glacial rune seal', x: 31, z: -35, r: 1.3, stageId: 'east-seal' },
  { id: 'garden-cache', kind: 'chest', label: 'Sunken garden cache', x: -42, z: -35, r: 1, stageId: 'west-seal' },
  { id: 'archive-cache', kind: 'chest', label: 'Forgotten archive cache', x: 42, z: -35, r: 1, stageId: 'east-seal' },
  { id: 'sanctuary', kind: 'checkpoint', label: 'Sanctuary checkpoint', ...DUNGEON_CHECKPOINT, r: 1.5, stageId: 'confluence' },
  { id: 'reliquary-cache', kind: 'chest', label: 'Relic keeper’s cache', x: -40, z: -85, r: 1, stageId: 'reliquary' },
  { id: 'forge-cache', kind: 'chest', label: 'Heartroot forge cache', x: 40, z: -85, r: 1, stageId: 'forge' },
];

export interface DungeonLayout {
  rooms: DungeonRoom[]; walls: readonly DungeonWall[]; lanterns: { x: number; z: number }[];
  doors: { x: number; z: number; width: number; axis: 'x' | 'z' }[];
  pools: { x: number; z: number; width: number; depth: number }[]; gates: DungeonGate[];
  objects: DungeonObject[]; colliders: RealmCollider[]; checkpointStages: string[]; portals: DungeonRoomPortal[]; shrines: DungeonShrine[];
  bounds?: RealmBounds; returnPoint?: RealmPoint; checkpoint?: RealmPoint; preparation?: RealmBounds;
}
const checkpointStages = ['threshold', 'crossing', 'west-seal', 'east-seal', 'confluence'];
type RoomSpec = [id: string, x: number, z: number, width: number, depth: number];
type GateSpec = [id: string, x: number, z: number, axis: 'x' | 'z', requires: string[], seals?: string[]];
const seals = ['verdant-seal', 'glacial-seal'];
const stageIds = DUNGEON_STAGES.map(stage => stage.id);
const makeWall = (x: number, z: number, width: number, depth: number, height = 4.4): DungeonWall => ({ x, z, halfWidth: width / 2, halfDepth: depth / 2, height, r: Math.hypot(width / 2, depth / 2) });

/** Trace the union of the authored two-metre room tiles, so an empty gap is never a bypass. */
function perimeterWalls(rooms: DungeonRoom[]): DungeonWall[] {
  const floor = new Set<string>(), edges = new Map<string, number[]>();
  const minX = Math.floor(Math.min(...rooms.map(room => room.x - room.width / 2)) / 2) * 2 + 1;
  const minZ = Math.floor(Math.min(...rooms.map(room => room.z - room.depth / 2)) / 2) * 2 + 1;
  const maxX = Math.max(...rooms.map(room => room.x + room.width / 2)), maxZ = Math.max(...rooms.map(room => room.z + room.depth / 2));
  for (let x = minX; x < maxX; x += 2) for (let z = minZ; z < maxZ; z += 2)
    if (rooms.some(room => Math.abs(x - room.x) < room.width / 2 && Math.abs(z - room.z) < room.depth / 2)) floor.add(`${x},${z}`);
  const edge = (axis: string, fixed: number, start: number) => { const key = `${axis}:${fixed}`, list = edges.get(key) ?? []; list.push(start); edges.set(key, list); };
  for (const cell of floor) {
    const [x, z] = cell.split(',').map(Number);
    if (!floor.has(`${x - 2},${z}`)) edge('z', x - 1, z - 1);
    if (!floor.has(`${x + 2},${z}`)) edge('z', x + 1, z - 1);
    if (!floor.has(`${x},${z - 2}`)) edge('x', z - 1, x - 1);
    if (!floor.has(`${x},${z + 2}`) && !(z + 1 === 26 && Math.abs(x) < 4)) edge('x', z + 1, x - 1);
  }
  const result: DungeonWall[] = [];
  for (const [key, points] of edges) {
    const [axis, value] = key.split(':'), fixed = Number(value); points.sort((a, b) => a - b);
    for (let i = 0; i < points.length;) {
      const start = points[i]; let end = start + 2; i++;
      while (i < points.length && points[i] === end) { end += 2; i++; }
      result.push(axis === 'x' ? makeWall((start + end) / 2, fixed, end - start, 1.2) : makeWall(fixed, (start + end) / 2, 1.2, end - start));
    }
  }
  return result;
}
function authorLayout(id: Exclude<LegacyDungeonId, 'rootvault'>, roomSpecs: RoomSpec[], passages: RoomSpec[], gateSpecs: GateSpec[], cover: number[][], pools: DungeonLayout['pools'], objectPoints: number[][]): DungeonLayout {
  const theme = id === 'cindercrypt' || id === 'emberfall' ? 'amber' : id === 'frosthollow' || id === 'veilhaven' ? 'frost' : id === 'plagueworks' ? 'moss' : 'root';
  const rooms: DungeonRoom[] = [...roomSpecs, ...passages].map(([roomId, x, z, width, depth]) => ({ id: roomId,
    name: themedStages[id].names[stageIds.indexOf(roomId)] ?? 'Passage', x, z, width, depth, theme, ...(roomSpecs.some(room => room[0] === roomId) ? {} : { optional: true }) }));
  const walls = [...perimeterWalls(rooms), ...cover.map(([x, z]) => makeWall(x, z, 1.8, 1.8, 5.6))];
  const gates: DungeonGate[] = gateSpecs.map(([id, x, z, axis, requires, seals]) => ({ id, label: 'Clear the defending encounter', x, z, axis, width: 8, requires, ...(seals ? { seals } : {}) }));
  const lanterns = roomSpecs.flatMap(([, x, z, width, depth]) => [-1, 1].map(side => ({ x: x + side * (width / 2 - 2), z: z + depth / 2 - 3 })));
  const objects = DUNGEON_OBJECTS.map((object, index) => ({ ...object, x: objectPoints[index][0], z: objectPoints[index][1] }));
  const colliders: RealmCollider[] = [...walls.map(({ height: _, ...solid }) => solid), ...lanterns.map(p => ({ ...p, r: .35 })),
    ...pools.map(p => ({ x: p.x, z: p.z, halfWidth: p.width / 2, halfDepth: p.depth / 2, r: Math.hypot(p.width / 2, p.depth / 2) }))];
  return { rooms, walls, lanterns, pools, gates, objects, colliders, checkpointStages, portals: [], shrines: [],
    doors: [{ x: 0, z: 26, width: 8, axis: 'x' }, ...gates.map(({ x, z, width, axis }) => ({ x, z, width, axis }))] };
}
type ExplorationId = 'plagueworks' | 'emberfall' | 'veilhaven';
type ExplorationSector = [id: string, x: number, z: number, westName: string, eastName: string];
/** Each authored sector contains two optional encounters. Alternating sectors join behind
 * their rooms to form flanking circuits; the progression links remain independently gated. */
function explorationLayout(id: ExplorationId, sectors: ExplorationSector[], spread: number, circuits: number[]): DungeonLayout {
  const rooms: RoomSpec[] = [], passages: RoomSpec[] = [], gates: GateSpec[] = [], cover: number[][] = [], pools: DungeonLayout['pools'] = [];
  const roomNames = new Map<string, string>();
  const passage = (name: string, a: RealmPoint, b: RealmPoint) => {
    if (a.x === b.x && a.z === b.z) return;
    passages.push([name, (a.x + b.x) / 2, (a.z + b.z) / 2, a.x === b.x ? 8 : Math.abs(a.x - b.x) + 8, a.z === b.z ? 8 : Math.abs(a.z - b.z) + 8]);
  };
  for (const [index, [stage, x, z, westName, eastName]] of sectors.entries()) {
    rooms.push([stage, x, z, stage === 'confluence' || stage === 'throne' ? 32 : 20, stage === 'confluence' || stage === 'throne' ? 28 : 20]);
    cover.push([x - 8, z + 2], [x + 8, z + 2]);
    for (const [side, name] of [[-1, westName], [1, eastName]] as const) {
      const branchId = `${stage}-${side < 0 ? 'west' : 'east'}-branch`, branchX = x + side * spread;
      rooms.push([branchId, branchX, z, 20, id === 'emberfall' ? 20 : 16]); roomNames.set(branchId, name);
      passage(`${branchId}-door`, { x, z }, { x: branchX, z });
      cover.push([branchX - side * 8, z - 6]);
      // Off-centre basins preserve the encounter centre and both circuit entrances.
      if ((index + side) % 2 !== 0) pools.push({ x: branchX - 5, z: z + 6, width: 3, depth: 2 });
      if (circuits.includes(index)) passage(`${branchId}-flank`, { x: branchX, z }, { x: branchX, z: z - 20 });
    }
    if (circuits.includes(index)) passage(`${stage}-circuit`, { x: x - spread, z: z - 20 }, { x: x + spread, z: z - 20 });
  }
  const point = (stage: string) => { const [, x, z] = sectors.find(sector => sector[0] === stage)!; return { x, z }; };
  const connect = (fromId: string, toId: string, requires: string[], gateId: string, sealIds?: string[]) => {
    const from = point(fromId), to = point(toId), bend = (from.z + to.z) / 2;
    passage(`${gateId}-approach`, from, { x: from.x, z: bend });
    passage(`${gateId}-bridge`, { x: from.x, z: bend }, { x: to.x, z: bend });
    passage(`${gateId}-descent`, { x: to.x, z: bend }, to);
    gates.push([gateId, (from.x + to.x) / 2, bend, from.x === to.x ? 'x' : 'z', requires, sealIds]);
  };
  connect('threshold', 'crossing', ['threshold'], 'threshold-gate');
  connect('crossing', 'west-seal', ['crossing'], 'garden-gate');
  if (id === 'veilhaven') {
    connect('crossing', 'east-seal', ['crossing'], 'archive-gate');
    connect('west-seal', 'confluence', ['west-seal', 'east-seal'], 'sanctuary-gate', seals);
    connect('east-seal', 'confluence', ['west-seal', 'east-seal'], 'sanctuary-east-gate', seals);
    connect('confluence', 'reliquary', ['confluence'], 'reliquary-gate');
    connect('confluence', 'forge', ['confluence'], 'forge-gate');
    connect('reliquary', 'throne', ['reliquary', 'forge'], 'heartkeeper-gate');
    connect('forge', 'throne', ['reliquary', 'forge'], 'abbess-east-gate');
  } else {
    connect('west-seal', 'east-seal', ['west-seal'], 'archive-gate');
    connect('east-seal', 'confluence', ['west-seal', 'east-seal'], 'sanctuary-gate', seals);
    connect('confluence', 'reliquary', ['confluence'], 'reliquary-gate');
    connect('reliquary', 'forge', ['reliquary'], 'forge-gate');
    connect('forge', 'throne', ['forge'], 'heartkeeper-gate');
  }
  passages.push(['preparation', 0, 20, 20, 12]);
  cover.push([-8, 23], [8, 23]);
  passage('arrival-stair', { x: 0, z: 20 }, point('threshold'));
  const objectPoints = DUNGEON_OBJECTS.map(object => { const p = point(object.stageId); return [p.x + (object.kind === 'seal' ? -5 : object.kind === 'checkpoint' ? 0 : 5), p.z + 6]; });
  const result = authorLayout(id, rooms, passages, gates, cover, pools, objectPoints);
  for (const room of result.rooms) {
    if (roomNames.has(room.id)) room.name = roomNames.get(room.id)!;
    if (room.id === 'preparation') room.name = 'Arrival Sanctuary';
  }
  result.preparation = { minX: -8, maxX: 8, minZ: 14, maxZ: 26 };
  for (const x of [-8, 8]) { result.lanterns.push({ x, z: 15 }); result.colliders.push({ x, z: 15, r: .35 }); }
  // Guarded treasures punctuate four deeper side trips rather than every encounter.
  for (const index of [1, 3, 5, 6]) {
    const stageId = `${sectors[index][0]}-east-branch`, room = result.rooms.find(room => room.id === stageId)!;
    result.objects.push({ id: `${stageId}-cache`, kind: 'chest', label: `${room.name} cache`, x: room.x + 5, z: room.z + 6, r: 1, stageId });
  }
  result.bounds = {
    minX: Math.floor((Math.min(...result.rooms.map(room => room.x - room.width / 2)) - 2) / 2) * 2,
    maxX: Math.ceil((Math.max(...result.rooms.map(room => room.x + room.width / 2)) + 2) / 2) * 2,
    minZ: Math.floor((Math.min(...result.rooms.map(room => room.z - room.depth / 2)) - 2) / 2) * 2, maxZ: 27,
  };
  result.returnPoint = { x: point('throne').x, z: point('throne').z - 9 };
  result.checkpoint = { x: point('confluence').x, z: point('confluence').z + 6 };
  return result;
}
const layouts: Record<string, DungeonLayout> = {
  rootvault: { rooms: DUNGEON_ROOMS, walls: DUNGEON_WALLS, lanterns: DUNGEON_LANTERNS, doors: DUNGEON_DOORS, pools: DUNGEON_POOLS, gates: DUNGEON_GATES, objects: DUNGEON_OBJECTS, colliders: DUNGEON_COLLIDERS, checkpointStages, portals: [], shrines: [] },
  cindercrypt: authorLayout('cindercrypt', [
    ['threshold', 0, 16, 20, 20], ['crossing', -24, 10, 20, 16], ['west-seal', -26, -18, 20, 20], ['east-seal', 20, -24, 24, 20],
    ['confluence', 0, -60, 28, 24], ['reliquary', -30, -66, 20, 20], ['forge', -26, -92, 24, 16], ['throne', 10, -104, 44, 28],
  ], [
    ['ash-stair', -12, 12, 4, 8], ['coal-chute', -24, -3, 8, 10], ['furnace-channel', -4, -20, 24, 8],
    ['hot-turn', 20, -39, 8, 10], ['cooling-walk', 10, -40, 28, 8], ['sanctuary-stair', 0, -42, 8, 12],
    ['relic-turn', -17, -62, 6, 8], ['echo-stair', -26, -80, 8, 8], ['colossus-door', -13, -94, 2, 8],
  ], [
    ['threshold-gate', -12, 12, 'z', ['threshold']], ['garden-gate', -24, -4, 'x', ['crossing']], ['archive-gate', -12, -20, 'z', ['west-seal']],
    ['sanctuary-gate', 0, -46, 'x', ['west-seal', 'east-seal'], seals], ['reliquary-gate', -16, -62, 'z', ['confluence']],
    ['forge-gate', -26, -80, 'x', ['reliquary']], ['heartkeeper-gate', -13, -94, 'z', ['forge']],
  ], [[-32, 12], [-32, -18], [28, -22], [9, -64], [-36, -66], [-34, -92], [24, -106], [20, -96]],
  [{ x: -31, z: 6, width: 4, depth: 3 }, { x: 12, z: -28, width: 4, depth: 3 }, { x: -8, z: -66, width: 4, depth: 3 }],
  [[-30, -24], [26, -30], [-20, -24], [16, -30], [0, -61], [-36, -72], [-32, -96]]),
  frosthollow: authorLayout('frosthollow', [
    ['threshold', 0, 16, 20, 20], ['crossing', 0, -4, 28, 16], ['west-seal', -30, -28, 28, 24], ['east-seal', 30, -12, 20, 24],
    ['confluence', 0, -60, 36, 24], ['reliquary', -30, -82, 24, 16], ['forge', 24, -84, 24, 16], ['throne', 0, -108, 56, 20],
  ], [
    ['rime-step', 0, 5, 8, 2], ['west-causeway', -24, -4, 20, 8], ['crystal-descent', -30, -8, 8, 16], ['east-causeway', 17, -4, 6, 8],
    ['winter-bridge', 0, -30, 8, 36], ['glacial-turn', -26, -62, 16, 8], ['glacial-descent', -30, -66, 8, 16],
    ['frostheart-bridge', 16, -74, 8, 4], ['western-final-bridge', -22, -94, 8, 8], ['eastern-final-bridge', 20, -95, 8, 6],
  ], [
    ['threshold-gate', 0, 5, 'x', ['threshold']], ['garden-gate', -18, -4, 'z', ['crossing']], ['archive-gate', 16, -4, 'z', ['crossing']],
    ['sanctuary-gate', 0, -16, 'x', ['west-seal', 'east-seal'], seals], ['reliquary-gate', -22, -62, 'z', ['confluence']],
    ['forge-gate', 16, -74, 'x', ['reliquary']], ['heartkeeper-gate', -22, -94, 'x', ['reliquary', 'forge']], ['rime-east-gate', 20, -96, 'x', ['reliquary', 'forge']],
  ], [[-8, 12], [10, -4], [-40, -24], [-20, -22], [36, -10], [-10, -60], [10, -60], [-38, -82], [32, -82], [-18, -108], [18, -108]],
  [{ x: -38, z: -34, width: 4, depth: 3 }, { x: 34, z: -20, width: 4, depth: 3 }, { x: -10, z: -66, width: 5, depth: 3 }],
  [[-34, -34], [34, -18], [-22, -34], [24, -18], [0, -61], [-36, -86], [30, -86]]),
  nightroot: authorLayout('nightroot', [
    ['threshold', 0, 16, 24, 20], ['crossing', 18, -2, 28, 16], ['west-seal', -26, -22, 24, 24], ['east-seal', 26, -32, 24, 20],
    ['confluence', 0, -60, 36, 24], ['reliquary', -28, -86, 28, 20], ['forge', 24, -84, 20, 16], ['throne', 0, -108, 60, 20],
  ], [
    ['barracks-walk', -13, -2, 34, 8], ['grove-stair', -26, -4, 8, 12], ['archive-stair', 26, -16, 8, 12], ['rear-battlement', 0, -24, 28, 8],
    ['western-flank', -26, -47, 8, 26], ['western-entry', -24, -60, 12, 8], ['eastern-flank', 26, -53, 8, 22], ['eastern-entry', 24, -60, 12, 8],
    ['relic-bridge', -16, -74, 8, 4], ['root-bridge', 16, -74, 8, 4], ['west-court-door', -24, -97, 8, 2], ['east-court-door', 24, -95, 8, 6],
  ], [
    ['threshold-gate', 8, 6, 'x', ['threshold']], ['garden-gate', 0, -2, 'z', ['crossing']],
    ['archive-gate', 26, -16, 'x', ['west-seal']], ['archive-flank-gate', 10, -24, 'z', ['west-seal']],
    ['sanctuary-gate', -20, -60, 'z', ['west-seal', 'east-seal'], seals], ['sanctuary-east-gate', 20, -60, 'z', ['west-seal', 'east-seal'], seals],
    ['reliquary-gate', -16, -74, 'x', ['confluence']], ['forge-gate', 16, -74, 'x', ['confluence']],
    ['heartkeeper-gate', -24, -97, 'x', ['reliquary', 'forge']], ['dreadheart-east-gate', 24, -95, 'x', ['reliquary', 'forge']],
  ], [[-8, 14], [10, -2], [28, -2], [-34, -20], [34, -30], [-9, -58], [9, -62], [-38, -86], [30, -80], [-16, -106], [16, -106]],
  [{ x: -10, z: -52, width: 5, depth: 3 }, { x: 10, z: -68, width: 5, depth: 3 }, { x: -34, z: -92, width: 4, depth: 3 }],
  [[-32, -28], [30, -38], [-20, -28], [20, -38], [0, -61], [-36, -90], [28, -88]]),
  plagueworks: explorationLayout('plagueworks', [
    ['threshold', 0, -16, 'The Intake Crypt', 'The Ratcatcher’s Store'],
    ['crossing', -36, -80, 'The Bone Mill', 'The Drowned Ossuary'],
    ['west-seal', -12, -144, 'The Silk Nursery', 'The Undertaker’s Vault'],
    ['east-seal', 36, -208, 'The Leech Baths', 'The Distiller’s Hoard'],
    ['confluence', 0, -272, 'The Molting Chapel', 'The Carapace Grotto'],
    ['reliquary', -36, -336, 'The Failed Specimens', 'The Curator’s Crypt'],
    ['forge', 12, -400, 'The Venom Pumps', 'The Apothecary’s Reserve'],
    ['throne', 36, -464, 'The Carrion Gallery', 'The Final Quarantine'],
  ], 32, [0, 2, 4, 6]),
  emberfall: explorationLayout('emberfall', [
    ['threshold', 0, -16, 'The Coal Assay', 'The Brass Watch'],
    ['crossing', 36, -76, 'The Broken Gearworks', 'The Paymaster’s Strongroom'],
    ['west-seal', 72, -136, 'The Obsidian Cutters', 'The Crucible Overflow'],
    ['east-seal', 36, -196, 'The Cooling Baths', 'The Rune-Smith’s Treasury'],
    ['confluence', 0, -256, 'The Hammer Gallery', 'The Anvil Graveyard'],
    ['reliquary', -36, -316, 'The Chain Winches', 'The Master’s Armory'],
    ['forge', 0, -376, 'The Bellows Chamber', 'The Cinder Reservoir'],
    ['throne', 36, -436, 'The Crown Moulds', 'The King’s Last Offering'],
  ], 32, [1, 3, 5, 7]),
  veilhaven: explorationLayout('veilhaven', [
    ['threshold', 0, -16, 'The Pilgrim’s Rest', 'The Silent Tea House'],
    ['crossing', 0, -76, 'The Rain Pavilion', 'The Lantern Keeper’s Vault'],
    ['west-seal', -86, -140, 'The Sutra Library', 'The Ancestral Offering'],
    ['east-seal', 86, -140, 'The Jade Conservatory', 'The Mirror of Names'],
    ['confluence', 0, -212, 'The Echoing Belfry', 'The Bell Founder’s Tomb'],
    ['reliquary', -86, -284, 'The Incense Kilns', 'The Abbot’s Secret Store'],
    ['forge', 86, -284, 'The Moonlit Koi Court', 'The Mourner’s Treasury'],
    ['throne', 0, -356, 'The Veil Weaver’s Hall', 'The Empty Procession'],
  ], 30, [0, 2, 5, 7]),
};
export function dungeonLayout(id: DungeonId = 'rootvault'): DungeonLayout { return layouts[id]; }
export function dungeonBounds(id: DungeonId = 'rootvault'): typeof DUNGEON_BOUNDS { return layouts[id].bounds ?? DUNGEON_BOUNDS; }
export function dungeonReturn(id: DungeonId = 'rootvault'): RealmPoint { return layouts[id].returnPoint ?? DUNGEON_RETURN; }
export function dungeonCheckpoint(id: DungeonId = 'rootvault'): RealmPoint { return layouts[id].checkpoint ?? DUNGEON_CHECKPOINT; }
export function dungeonPreparation(id: DungeonId = 'rootvault'): RealmBounds | undefined { return layouts[id].preparation; }
export function inDungeonPreparation(point: RealmPoint, id: DungeonId = 'rootvault'): boolean {
  const area = dungeonPreparation(id);
  return !!area && point.x >= area.minX && point.x <= area.maxX && point.z >= area.minZ && point.z <= area.maxZ;
}
const packCounts = { cindercrypt: [2, 4, 3, 5, 2, 4, 3, 4], frosthollow: [3, 2, 5, 2, 4, 3, 4, 3], nightroot: [4, 3, 2, 4, 5, 2, 4, 5],
  plagueworks: [4, 3, 5, 4, 3, 4, 5, 3], emberfall: [4, 5, 3, 4, 3, 5, 4, 3], veilhaven: [5, 4, 3, 5, 3, 4, 5, 3] };
const formations = { cindercrypt: [[0, -3], [-3, 0], [3, 0], [0, 3], [4, -4]], frosthollow: [[0, -4], [-4, 0], [4, 0], [-3, 4], [3, 4]], nightroot: [[0, -4], [-5, -2], [5, 2], [-3, 4], [4, -4]],
  plagueworks: [[0, -3], [-4, 1], [4, 1], [-3, 4], [3, -4]], emberfall: [[0, -3], [-4, 1], [4, 1], [-3, 4], [3, -4]], veilhaven: [[0, -3], [-4, 1], [4, 1], [-3, 4], [3, -4]] };
const newDungeons = ['plagueworks', 'emberfall', 'veilhaven'];
const stageVariants = Object.fromEntries((Object.keys(themedStages) as Exclude<LegacyDungeonId, 'rootvault'>[]).map(id => [id, DUNGEON_STAGES.map((stage, index) => {
  const room = layouts[id].rooms.find(room => room.id === stage.id)!, definition = getDungeon(id)!, kinds = themedStages[id].kinds[index];
  const requires = ['cindercrypt', 'plagueworks', 'emberfall'].includes(id) ? index === 0 ? [] : stage.id === 'confluence' ? ['west-seal', 'east-seal'] : [stageIds[index - 1]]
    : id === 'frosthollow' && stage.id === 'forge' ? ['reliquary'] : id === 'nightroot' && stage.id === 'east-seal' ? ['west-seal'] : [...stage.requires];
  return { ...stage, x: room.x, z: room.z, name: room.name, requires, level: stage.id === 'throne' ? definition.maxLevel : stage.level + definition.minLevel - 10,
    enemies: Array.from({ length: packCounts[id][index] }, (_, enemyIndex) => ({ kind: kinds[enemyIndex % kinds.length], x: room.x + formations[id][enemyIndex][0], z: room.z + formations[id][enemyIndex][1],
      ...(newDungeons.includes(id) && enemyIndex === 0 && (stage.id === 'confluence' || stage.id === 'throne') ? { boss: true } : {}) })) };
})])) as Record<Exclude<LegacyDungeonId, 'rootvault'>, DungeonStage[]>;
// Side-room inhabitants match their workshops, crypts, libraries, and gardens.
const explorationBranchKinds: Record<ExplorationId, [EnemyKind[], EnemyKind[]][]> = {
  plagueworks: [
    [['crypt-bat', 'bone-rat'], ['corpse-scarab', 'bone-rat']],
    [['carrion-hound', 'bone-rat'], ['plague-knight', 'mire-leech']],
    [['crypt-weaver', 'crypt-bat'], ['plague-knight', 'corpse-scarab']],
    [['mire-leech', 'sewer-horror'], ['fungal-thrall', 'plague-alchemist']],
    [['fungal-thrall', 'crypt-weaver'], ['corpse-scarab', 'carrion-hound']],
    [['sewer-horror', 'plague-alchemist'], ['plague-knight', 'crypt-bat']],
    [['mire-leech', 'sewer-horror'], ['plague-alchemist', 'fungal-thrall']],
    [['carrion-hound', 'crypt-bat'], ['sewer-horror', 'plague-knight']],
  ],
  emberfall: [
    [['slag-crawler', 'forge-spider'], ['brass-sentinel', 'ember-imp']],
    [['forge-spider', 'chain-jailer'], ['brass-sentinel', 'furnace-revenant']],
    [['slag-crawler', 'slag-elemental'], ['ember-imp', 'slag-elemental']],
    [['cinder-hound', 'furnace-revenant'], ['furnace-priest', 'brass-sentinel']],
    [['furnace-revenant', 'chain-jailer'], ['forge-spider', 'slag-crawler']],
    [['chain-jailer', 'forge-spider'], ['brass-sentinel', 'furnace-revenant']],
    [['furnace-priest', 'slag-elemental'], ['ash-drake', 'cinder-hound']],
    [['slag-crawler', 'slag-elemental'], ['furnace-priest', 'ash-drake']],
  ],
  veilhaven: [
    [['grave-fox', 'paper-shikigami'], ['spirit-koi', 'mist-crane']],
    [['mist-crane', 'spirit-koi'], ['lantern-wraith', 'temple-ronin']],
    [['paper-shikigami', 'mourning-mask'], ['incense-acolyte', 'lantern-wraith']],
    [['jade-lion', 'spirit-koi'], ['jade-sentinel', 'mourning-mask']],
    [['mist-crane', 'mourning-mask'], ['jade-sentinel', 'temple-ronin']],
    [['incense-acolyte', 'paper-shikigami'], ['temple-ronin', 'lantern-wraith']],
    [['spirit-koi', 'grave-fox'], ['jade-lion', 'mourning-mask']],
    [['paper-shikigami', 'lantern-wraith'], ['temple-ronin', 'incense-acolyte']],
  ],
};
for (const id of newDungeons as ExplorationId[]) {
  const original = stageVariants[id];
  stageVariants[id] = original.flatMap((stage, index) => {
    const branches: DungeonStage[] = [-1, 1].map((side, branchIndex) => {
      const room = layouts[id].rooms.find(room => room.id === `${stage.id}-${side < 0 ? 'west' : 'east'}-branch`)!;
      const count = id === 'veilhaven' ? 4 : index === 0 ? 3 : 4;
      const kinds = explorationBranchKinds[id][index][branchIndex];
      return { id: room.id, name: room.name, x: room.x, z: room.z, level: stage.level, requires: [...stage.requires], optional: true,
        enemies: Array.from({ length: count }, (_, enemyIndex) => ({ kind: kinds[(enemyIndex + branchIndex) % kinds.length], x: room.x + formations[id][enemyIndex][0], z: room.z + formations[id][enemyIndex][1] })) };
    });
    // The final boss stays the last entry; optional rooms never become main-route prerequisites.
    return stage.id === 'throne' ? [...branches, stage] : [stage, ...branches];
  });
}
for (const id of newDungeons as DungeonId[]) {
  const runeNames = id === 'plagueworks' ? ['Quarantine rune seal', 'Distillation rune seal'] : id === 'emberfall' ? ['Crucible rune seal', 'Smeltery rune seal'] : ['Ancestor rune seal', 'Jade rune seal'];
  for (const object of layouts[id].objects) object.label = object.kind === 'seal' ? runeNames[object.id === 'verdant-seal' ? 0 : 1]
    : object.kind === 'checkpoint' ? 'Sanctuary checkpoint' : `${layouts[id].rooms.find(room => room.id === object.stageId)!.name} cache`;
}

/** Rehouse the authored encounters and props in sealed arenas; only portals cross rooms. */
for (const definition of LEGACY_DUNGEONS) {
  const id = definition.id, layout = layouts[id], stages = dungeonStages(id);
  const originals = layout.rooms.filter(room => stages.some(stage => stage.id === room.id));
  const mainStages = stages.filter(stage => !stage.optional);
  const rooms: DungeonRoom[] = [{ id: 'preparation', name: 'Arrival Sanctuary', x: 0, z: 20, width: 24, depth: 20, theme: originals[0].theme, optional: true }];
  for (const stage of stages) {
    const owner = stage.optional ? stage.id.replace(/-(west|east)-branch$/, '') : stage.id;
    const index = mainStages.findIndex(main => main.id === owner), original = originals.find(room => room.id === stage.id)!;
    const boss = stage.id === 'throne' || stage.enemies.some(enemy => enemy.boss);
    // Broad courts, square chambers and longer galleries follow the Moss Gate map references.
    const shape = (index + DUNGEONS.indexOf(definition) + (stage.optional ? stage.id.endsWith('-west-branch') ? 2 : 4 : 0)) % 6;
    const centerX = [0, 12, -12, 16, -16, 8, -8, 0][index], branchSide = stage.id.endsWith('-west-branch') ? -1 : 1;
    rooms.push({ ...original, x: centerX + (stage.optional ? branchSide * 88 : 0),
      z: -60 - index * 84 + (stage.optional ? branchSide * 8 : 0), width: Math.max(boss ? 64 : [40, 52, 44, 60, 48, 42][shape], Math.ceil((original.width + 4) / 2) * 2),
      depth: Math.max(boss ? 48 : [44, 36, 52, 38, 48, 56][shape], Math.ceil((original.depth + 4) / 2) * 2), optional: stage.optional });
  }
  const roomById = new Map(rooms.map(room => [room.id, room]));
  const relocate = (point: RealmPoint, stageId?: string, margin = 3) => {
    const old = stageId ? originals.find(room => room.id === stageId) : originals.filter(room => Math.abs(point.x - room.x) <= room.width / 2 && Math.abs(point.z - room.z) <= room.depth / 2)
      .sort((a, b) => Math.hypot(point.x - a.x, point.z - a.z) - Math.hypot(point.x - b.x, point.z - b.z))[0];
    if (!old) return undefined;
    const room = roomById.get(old.id)!;
    return { x: room.x + Math.max(-room.width / 2 + margin, Math.min(room.width / 2 - margin, point.x - old.x)),
      z: room.z + Math.max(-room.depth / 2 + margin, Math.min(room.depth / 2 - margin, point.z - old.z)) };
  };
  const objects = layout.objects.map(object => ({ ...object, ...relocate(object, object.stageId)! }));
  const pools = layout.pools.flatMap(pool => { const point = relocate(pool, undefined, Math.max(pool.width, pool.depth) / 2 + 3); return point ? [{ ...pool, ...point }] : []; });
  const pillars = layout.walls.filter(wall => wall.halfWidth <= 1 && wall.halfDepth <= 1).flatMap(wall => {
    const point = relocate(wall, undefined, 4); return point ? [makeWall(point.x, point.z, wall.halfWidth * 2, wall.halfDepth * 2, wall.height)] : [];
  });
  const walls = rooms.flatMap(room => [makeWall(room.x - room.width / 2, room.z, 1.2, room.depth + 1.2), makeWall(room.x + room.width / 2, room.z, 1.2, room.depth + 1.2),
    makeWall(room.x, room.z - room.depth / 2, room.width, 1.2), makeWall(room.x, room.z + room.depth / 2, room.width, 1.2)]).concat(pillars);
  const lanterns = rooms.flatMap(room => [-1, 1].flatMap(side => [-1, 1].map(end => ({ x: room.x + side * (room.width / 2 - 2), z: room.z + end * (room.depth / 2 - 3) }))));
  const shrines: DungeonShrine[] = id === 'veilhaven' ? rooms.filter(room => room.id !== 'preparation').map(room => ({ roomId: room.id, x: room.x, z: room.z - room.depth / 2 + 3.5, width: 3.8, depth: 2.9, height: 5.2 })) : [];
  const colliders: RealmCollider[] = [...walls.map(({ height: _, ...wall }) => wall), ...lanterns.map(point => ({ ...point, r: .35 })),
    ...[...pools, ...shrines].map(solid => ({ x: solid.x, z: solid.z, halfWidth: solid.width / 2, halfDepth: solid.depth / 2, r: Math.hypot(solid.width / 2, solid.depth / 2) }))];
  const checkpoint = objects.find(object => object.kind === 'checkpoint')!, throne = roomById.get('throne')!;
  const returnPoint = { x: throne.x + (id === 'veilhaven' ? 10 : 0), z: throne.z - throne.depth / 2 + 4 };
  const portals: DungeonRoomPortal[] = [], anchors = [DUNGEON_START, DUNGEON_EXIT, checkpoint, returnPoint, ...objects];
  const clear = (point: RealmPoint, radius: number) => !colliders.some(solid => solid.halfWidth === undefined ? Math.hypot(point.x - solid.x, point.z - solid.z) <= solid.r + radius
    : Math.hypot(Math.max(0, Math.abs(point.x - solid.x) - solid.halfWidth), Math.max(0, Math.abs(point.z - solid.z) - solid.halfDepth!)) <= radius);
  const positions = new Map<string, { x: number; z: number; destination: RealmPoint }[]>();
  for (const room of rooms) {
    const slots = [];
    for (const side of [-1, 1]) for (const offset of [-10, 0, 10]) {
      if (Math.abs(offset) < room.width / 2 - 3) slots.push({ x: room.x + offset, z: room.z + side * (room.depth / 2 - 4), destination: { x: room.x + offset, z: room.z + side * (room.depth / 2 - 8) } });
      if (Math.abs(offset) < room.depth / 2 - 3) slots.push({ x: room.x + side * (room.width / 2 - 4), z: room.z + offset, destination: { x: room.x + side * (room.width / 2 - 8), z: room.z + offset } });
    }
    positions.set(room.id, slots.filter(slot => clear(slot, 2.9) && clear(slot.destination, .6) && !anchors.some(point => Math.hypot(point.x - slot.x, point.z - slot.z) < 4 || Math.hypot(point.x - slot.destination.x, point.z - slot.destination.z) < 2)));
  }
  const reserve = (roomId: string, role: 'forward' | 'back' | 'west' | 'east', side = 0) => {
    const room = roomById.get(roomId)!, slots = positions.get(roomId)!;
    const branch = role === 'west' || role === 'east';
    const preferred = { x: room.x + (branch ? (role === 'west' ? -1 : 1) * (room.width / 2 - 4) : side * 6),
      z: room.z + (role === 'back' ? room.depth / 2 - 4 : -room.depth / 2 + (branch ? 8 : 4)) };
    slots.sort((a, b) => Math.hypot(a.x - preferred.x, a.z - preferred.z) - Math.hypot(b.x - preferred.x, b.z - preferred.z));
    const slot = slots.shift();
    if (!slot) throw new Error(`No clear room portal position: ${id}/${roomId}`);
    positions.set(roomId, slots.filter(other => Math.hypot(other.x - slot.x, other.z - slot.z) >= 6));
    return slot;
  };
  const connect = (fromId: string, target: DungeonStage, requires = target.requires) => {
    const side = (roomId: string) => roomId.includes('west') || roomId === 'reliquary' ? -1 : roomId.includes('east') || roomId === 'forge' ? 1 : 0;
    const from = reserve(fromId, target.optional ? target.id.endsWith('-west-branch') ? 'west' : 'east' : 'forward', side(target.id));
    const to = reserve(target.id, 'back', !target.optional && target.requires.length > 1 ? side(fromId) : 0), sourceRoom = roomById.get(fromId)!, targetRoom = roomById.get(target.id)!;
    portals.push({ id: `${fromId}-to-${target.id}`, label: targetRoom.name, roomId: fromId, targetRoomId: target.id, x: from.x, z: from.z, destination: to.destination,
      requires: [...requires], ...(target.id === 'confluence' ? { seals: [...seals] } : {}) });
    portals.push({ id: `${target.id}-to-${fromId}`, label: sourceRoom.name, roomId: target.id, targetRoomId: fromId, x: to.x, z: to.z, destination: from.destination, requires: [] });
  };
  // A prerequisite need not have its own doorway: retain both seals without duplicating every return route.
  for (const stage of mainStages) connect(stage.requires.at(-1) ?? 'preparation', stage);
  for (const stage of mainStages) {
    const west = stages.find(branch => branch.id === `${stage.id}-west-branch`), east = stages.find(branch => branch.id === `${stage.id}-east-branch`);
    if (!west || !east) continue;
    // Keep fork hubs at three exits; their optional spur starts in the adjacent wing instead.
    const sourceId = id === 'veilhaven' && stage.id === 'crossing' ? 'west-seal' : id === 'veilhaven' && stage.id === 'confluence' ? 'reliquary' : stage.id;
    connect(sourceId, west, [stage.id]);
    connect(west.id, east, [stage.id]);
  }
  for (const stage of stages) {
    const room = roomById.get(stage.id)!;
    for (const enemy of stage.enemies) {
      const spread = { x: room.x + (enemy.x - stage.x) * 1.6, z: room.z + (enemy.z - stage.z) * 1.6 };
      if (clear(spread, .8) && !portals.some(portal => Math.hypot(portal.x - spread.x, portal.z - spread.z) < 3 || Math.hypot(portal.destination.x - spread.x, portal.destination.z - spread.z) < 2)) Object.assign(enemy, spread);
      else { enemy.x += room.x - stage.x; enemy.z += room.z - stage.z; }
    }
    stage.x = room.x; stage.z = room.z;
  }
  const bounds = { minX: Math.min(...rooms.map(room => room.x - room.width / 2)) - 2, maxX: Math.max(...rooms.map(room => room.x + room.width / 2)) + 2,
    minZ: Math.min(...rooms.map(room => room.z - room.depth / 2)) - 2, maxZ: 32 };
  if (id === 'rootvault') {
    DUNGEON_ROOMS.splice(0, DUNGEON_ROOMS.length, ...rooms); (DUNGEON_WALLS as DungeonWall[]).splice(0, DUNGEON_WALLS.length, ...walls);
    DUNGEON_LANTERNS.splice(0, DUNGEON_LANTERNS.length, ...lanterns); DUNGEON_POOLS.splice(0, DUNGEON_POOLS.length, ...pools);
    DUNGEON_OBJECTS.splice(0, DUNGEON_OBJECTS.length, ...objects); DUNGEON_COLLIDERS.splice(0, DUNGEON_COLLIDERS.length, ...colliders);
    DUNGEON_DOORS.length = DUNGEON_GATES.length = 0; Object.assign(DUNGEON_BOUNDS, bounds); Object.assign(DUNGEON_RETURN, returnPoint); Object.assign(DUNGEON_CHECKPOINT, { x: checkpoint.x, z: checkpoint.z });
    Object.assign(layout, { portals, shrines, bounds: DUNGEON_BOUNDS, returnPoint: DUNGEON_RETURN, checkpoint: DUNGEON_CHECKPOINT });
  } else Object.assign(layout, { rooms, walls, lanterns, pools, objects, colliders, portals, shrines, doors: [], gates: [], bounds, returnPoint, checkpoint: { x: checkpoint.x, z: checkpoint.z } });
  layout.preparation = { minX: -10, maxX: 10, minZ: 12, maxZ: 28 };
}

// Quest Bible chambers reuse the same isolated-room geometry, props and portal contract.
// The source specifies mechanics/counts but no coordinates, enemy packs or timings.
// These conservative current-realm defaults are documented alongside the source coverage.
interface StoryRoomSpec {
  id: string; name: string; kinds: EnemyKind[]; boss?: string; optional?: boolean;
  objects?: { id: string; label: string; kind?: 'seal' | 'chest'; requires?: string[] }[];
  objective?: DungeonStoryObjective;
}
const timedDefense = (kind: DungeonStoryObjective['kind'], label: string, pair: [EnemyKind, EnemyKind]): DungeonStoryObjective =>
  ({ kind, label, durationMs: 30_000, ...(kind === 'protection' ? { protectRadius: 6 } : {}), waves: [[...pair], [...pair], [...pair]] });
const storyRooms: Record<StoryDungeonId, StoryRoomSpec[]> = {
  'greenwood-root-chamber': [
    { id:'threshold', name:'Rootbound Threshold', kinds:['moss-slime','briar-sentinel'] },
    { id:'first-root', name:'The Living Seal', kinds:['briar-sentinel','moss-slime'], objects:[{id:'root-seal-one',label:'Awaken the first root seal'}] },
    { id:'root-gallery', name:'The Thorn Gallery', kinds:['briar-sentinel','briar-sentinel','moss-slime'] },
    { id:'second-root', name:'The Ancient Seal', kinds:['briar-sentinel','moss-slime'], objects:[{id:'root-seal-two',label:'Awaken the second root seal'}] },
    { id:'throne', name:'The Root Chamber Heart', kinds:['root-warden','moss-slime'], boss:'Root Chamber Guardian' },
  ],
  'broken-watch': [
    { id:'threshold', name:'The Fallen Watch', kinds:['ember-beetle','dune-scorpion'] },
    { id:'watch-gears', name:'The Broken Gearworks', kinds:['stone-golem','ember-beetle'], objects:[{id:'watch-mechanism-one',label:'Repair the watch gear mechanism'}] },
    { id:'watch-ambush', name:'The Lower Barracks', kinds:['dune-scorpion','dune-scorpion','ember-beetle'] },
    { id:'watch-beacon', name:'The Silent Beacon', kinds:['stone-golem','ember-beetle'], objects:[{id:'watch-mechanism-two',label:'Repair the beacon mechanism'}] },
    { id:'watch-power', name:'The Power Chamber', kinds:['stone-golem','dune-scorpion'], objects:[{id:'watch-mechanism-three',label:'Repair the power mechanism'}] },
    { id:'throne', name:'The Watch Guardian', kinds:['stone-golem','ember-beetle'], boss:'Watch Guardian' },
  ],
  'ashbound-hall': [
    { id:'threshold', name:'Ashbound Vestibule', kinds:['ember-beetle','dune-scorpion'] },
    { id:'furnace-key', name:'The Key Keeper', kinds:['stone-golem','ember-beetle'], objects:[{id:'ashbound-key',label:'Recover the furnace key'}] },
    { id:'ash-ambush', name:'The Ashen Ambush', kinds:['ember-beetle','dune-scorpion','ember-beetle','dune-scorpion'] },
    { id:'furnace-lever', name:'The Furnace Lever', kinds:['stone-golem','ember-beetle'], objects:[{id:'ashbound-lever',label:'Unlock and pull the furnace lever',requires:['ashbound-key']}] },
    { id:'furnace-defense', name:'Hold the Furnace', kinds:[], objective:timedDefense('defense','Defend the furnace for 30 seconds and defeat every attacker',['ember-beetle','dune-scorpion']) },
    { id:'ash-treasury', name:'The Ashbound Treasury', kinds:['stone-golem','ember-beetle'], objects:[{id:'ashbound-treasure',label:'Recover the ashbound treasure',kind:'chest'}] },
    { id:'throne', name:'The Ashbound Guardian', kinds:['stone-golem','dune-scorpion'], boss:'Ashbound Guardian' },
  ],
  'frozen-memory': [
    { id:'threshold', name:'The Frozen Descent', kinds:['ice-wisp','crystal-bat'] },
    { id:'frozen-runes', name:'Runes of Remembrance', kinds:['ice-wisp','crystal-bat'], objects:[
      {id:'memory-rune-one',label:'Rune I · awaken the first memory'},
      {id:'memory-rune-two',label:'Rune II · follows the first memory',requires:['memory-rune-one']},
      {id:'memory-rune-three',label:'Rune III · follows the second memory',requires:['memory-rune-two']}] },
    { id:'winter-survival', name:'The Winter Siege', kinds:[], objective:timedDefense('survival','Survive the winter siege for 30 seconds and defeat every attacker',['ice-wisp','crystal-bat']) },
    { id:'frozen-keys', name:'The Frozen Keys', kinds:['frost-yeti','ice-wisp'], objects:[{id:'memory-key-one',label:'Recover the first frozen key'},{id:'memory-key-two',label:'Recover the second frozen key'}] },
    { id:'archive-keeper', name:'The Archive Keeper', kinds:['frost-yeti','crystal-bat'], boss:'Frozen Archive Keeper' },
    { id:'central-archive', name:'The Central Archive', kinds:['ice-wisp','crystal-bat'], objects:[{id:'memory-archive',label:'Read the central archive'}] },
    { id:'memory-gallery', name:'Gallery of Lost Voices', kinds:['frost-yeti','ice-wisp','crystal-bat'] },
    { id:'throne', name:'The Memory Warden', kinds:['frost-yeti','ice-wisp'], boss:'Memory Warden' },
  ],
  'hollow-door': [
    { id:'threshold', name:'The Unlit Threshold', kinds:['void-stalker','grove-spider'] },
    { id:'lantern-vault', name:'The Last Lantern', kinds:['grove-spider','void-stalker'], objects:[{id:'hollow-lantern',label:'Light the warding lantern'}] },
    { id:'shadow-ambush', name:'Whispers in the Dark', kinds:['void-stalker','grove-spider','void-stalker'] },
    { id:'shadow-key', name:'The Shadow Key', kinds:['root-warden','grove-spider'], objects:[{id:'hollow-key-one',label:'Recover the first shadow key'}] },
    { id:'lantern-protection', name:'Guard the Warding Light', kinds:[], objective:timedDefense('protection','Remain within the lantern light for 30 seconds and defeat every attacker',['void-stalker','grove-spider']) },
    { id:'hollow-ambush', name:'The Hollow Procession', kinds:['void-stalker','grove-spider','root-warden'] },
    { id:'hollow-key', name:'The Final Lock', kinds:['root-warden','void-stalker'], objects:[{id:'hollow-key-two',label:'Recover the final shadow key'}] },
    { id:'throne', name:'Keeper of the Hollow Door', kinds:['root-warden','void-stalker'], boss:'Hollow Door Keeper' },
  ],
  'veiled-sun-temple': [
    { id:'threshold', name:'The Sunlit Vestibule', kinds:['brass-sentinel','ember-imp'] },
    { id:'sun-traps', name:'The First Trial of Patience', kinds:['forge-spider','cinder-hound'] },
    { id:'sun-key-one', name:'The Dawn Key', kinds:['brass-sentinel','furnace-revenant'], objects:[{id:'temple-key-one',label:'Recover the dawn key'}] },
    { id:'sun-watch', name:'The Sun Watch', kinds:['brass-sentinel','furnace-priest','ember-imp'] },
    { id:'sun-key-two', name:'The Dusk Key', kinds:['chain-jailer','furnace-revenant'], objects:[{id:'temple-key-two',label:'Recover the dusk key'}] },
    { id:'sun-runes', name:'The Veiled Sun Seals', kinds:['slag-elemental','furnace-priest'], objects:[{id:'sun-seal-one',label:'Dawn seal · turn toward the rising sun'},{id:'sun-seal-two',label:'Dusk seal · follows the dawn',requires:['sun-seal-one']}] },
    { id:'sun-gauntlet', name:'The Second Trial of Patience', kinds:['forge-spider','chain-jailer','cinder-hound'] },
    { id:'sun-antechamber', name:'The Guardian Antechamber', kinds:['brass-sentinel','furnace-priest'] },
    { id:'sun-treasury', name:'The Hidden Sun Treasury', kinds:['brass-sentinel','furnace-revenant'], optional:true, objects:[{id:'veiled-sun-treasure',label:'Recover the optional sun treasure',kind:'chest'}] },
    { id:'throne', name:'Guardian of the Veiled Sun', kinds:['anvil-warden','brass-sentinel'], boss:'Veiled Sun Guardian' },
  ],
};
for (const definition of STORY_DUNGEONS) {
  const specs = storyRooms[definition.id as StoryDungeonId], theme = definition.themeId === 'frosthollow' ? 'frost' : definition.themeId === 'nightroot' ? 'root' : definition.themeId === 'rootvault' ? 'moss' : 'amber';
  const rooms: DungeonRoom[] = [{id:'preparation',name:'Arrival Sanctuary',x:0,z:20,width:24,depth:20,theme,optional:true}];
  const stages: DungeonStage[] = [], objects: DungeonObject[] = [], portals: DungeonRoomPortal[] = [];
  let previous = 'preparation';
  for (const [index,spec] of specs.entries()) {
    const room: DungeonRoom = {id:spec.id,name:spec.name,x:spec.optional ? 96 : [0,12,-12,16,-16,8,-8,0,12,-12][index],z:-60-index*84,
      width:spec.boss?64:[40,52,44,60,48,42][index%6],depth:spec.boss?48:[44,36,52,38,48,56][index%6],theme,...(spec.optional?{optional:true}:{})};
    rooms.push(room);
    stages.push({id:spec.id,name:spec.name,level:definition.minLevel,x:room.x,z:room.z,requires:previous==='preparation'?[]:[previous],...(spec.optional?{optional:true}:{}),
      ...(spec.objective?{storyObjective:spec.objective}:{}),enemies:spec.kinds.map((kind,i)=>({kind,x:room.x+[-3,3,0,-8][i],z:room.z+[-3,-3,4,4][i],...(i===0&&spec.boss?{boss:true,name:spec.boss}:{})}))});
    for (const [objectIndex,object] of (spec.objects??[]).entries()) objects.push({...object,kind:object.kind??'seal',x:room.x+(objectIndex-(spec.objects!.length-1)/2)*6,z:room.z-9,r:object.kind==='chest'?1:1.3,stageId:spec.id});
    if (!spec.optional) previous=spec.id;
  }
  const roomById = new Map(rooms.map(room=>[room.id,room]));
  for (const stage of stages) {
    const sourceId=stage.requires.at(-1)??'preparation',source=roomById.get(sourceId)!,target=roomById.get(stage.id)!;
    const side=stage.optional?1:0;
    const from={x:source.x+(side?source.width/2-4:0),z:source.z+(side?0:-source.depth/2+4)};
    const to={x:target.x,z:target.z+target.depth/2-4};
    const seals=objects.filter(object=>object.stageId===sourceId&&(object.kind==='seal'||object.kind==='chest'&&!source.optional)).map(object=>object.id);
    portals.push({id:`${sourceId}-to-${stage.id}`,label:target.name,roomId:sourceId,targetRoomId:stage.id,...from,destination:{x:to.x,z:to.z-4},requires:[...stage.requires],...(seals.length?{seals}:{})});
    portals.push({id:`${stage.id}-to-${sourceId}`,label:source.name,roomId:stage.id,targetRoomId:sourceId,...to,destination:{x:from.x-(side?4:0),z:from.z+(side?0:4)},requires:[]});
  }
  const checkpointIndex=Math.floor((specs.length-1)/2), checkpointRoom=rooms[checkpointIndex+1], checkpoint={x:checkpointRoom.x+10,z:checkpointRoom.z+6};
  objects.push({id:'story-sanctuary',kind:'checkpoint',label:'Chamber checkpoint',...checkpoint,r:1.5,stageId:checkpointRoom.id});
  const walls=rooms.flatMap(room=>[makeWall(room.x-room.width/2,room.z,1.2,room.depth+1.2),makeWall(room.x+room.width/2,room.z,1.2,room.depth+1.2),
    makeWall(room.x,room.z-room.depth/2,room.width,1.2),makeWall(room.x,room.z+room.depth/2,room.width,1.2)]);
  const lanterns=rooms.flatMap(room=>[-1,1].flatMap(side=>[-1,1].map(end=>({x:room.x+side*(room.width/2-2),z:room.z+end*(room.depth/2-3)}))));
  const colliders: RealmCollider[]=[...walls.map(({height:_,...wall})=>wall),...lanterns.map(point=>({...point,r:.35}))];
  const throne=roomById.get('throne')!;
  layouts[definition.id]={rooms,walls,lanterns,colliders,objects,portals,pools:[],gates:[],doors:[],shrines:[],checkpoint,
    checkpointStages:stages.slice(0,checkpointIndex+1).filter(stage=>!stage.optional).map(stage=>stage.id),
    returnPoint:{x:throne.x+10,z:throne.z-throne.depth/2+4},preparation:{minX:-10,maxX:10,minZ:12,maxZ:28},
    bounds:{minX:Math.min(...rooms.map(room=>room.x-room.width/2))-2,maxX:Math.max(...rooms.map(room=>room.x+room.width/2))+2,minZ:Math.min(...rooms.map(room=>room.z-room.depth/2))-2,maxZ:32}};
  storyStages.set(definition.id,stages);
}
