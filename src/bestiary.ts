import type { ZoneId } from './content.ts';
import { regionLevelRange } from './region-levels.ts';
import { TRAINING_DUMMY_HP } from './training-dummies.ts';

/** Shared identity catalog: ten regular creatures and two bosses per themed dungeon. */
export const THEMED_DUNGEON_ROSTERS = {
  plagueworks: ['crypt-weaver', 'plague-alchemist', 'bone-rat', 'corpse-scarab', 'mire-leech', 'crypt-bat', 'fungal-thrall', 'plague-knight', 'carrion-hound', 'sewer-horror', 'broodmother-vex', 'plague-abomination'],
  emberfall: ['slag-crawler', 'furnace-revenant', 'ember-imp', 'cinder-hound', 'forge-spider', 'brass-sentinel', 'slag-elemental', 'ash-drake', 'furnace-priest', 'chain-jailer', 'anvil-warden', 'pyrelord-ignivar'],
  veilhaven: ['lantern-wraith', 'jade-sentinel', 'paper-shikigami', 'grave-fox', 'mist-crane', 'temple-ronin', 'incense-acolyte', 'jade-lion', 'mourning-mask', 'spirit-koi', 'bellkeeper-shen', 'veiled-abbess'],
} as const;
export type ThemedEnemyKind = (typeof THEMED_DUNGEON_ROSTERS)[keyof typeof THEMED_DUNGEON_ROSTERS][number];

export type EnemyKind = 'moss-slime' | 'briar-sentinel' | 'ice-wisp' | 'root-warden'
  | 'bramble-wolf' | 'briar-boar' | 'grove-spider' | 'ember-beetle' | 'dune-scorpion'
  | 'stone-golem' | 'frost-yeti' | 'crystal-bat' | 'marsh-toad' | 'void-stalker'
  | 'briarhorn-elder' | 'rimefang-matriarch' | 'stormhorn-behemoth' | 'ashen-crown-titan' | 'treasure-goblin' | 'training-dummy'
  | ThemedEnemyKind;
export type EnemyAttackStyle = 'bite' | 'swipe' | 'slam' | 'spit' | 'pulse' | 'sting' | 'charge';
export interface Monster {
  name: string; level: number; hp: number; damage: number; xp: number; gold: number; height: number;
  attackStyle: EnemyAttackStyle; range: number; attackRadius: number; windupMs: number; recoveryMs: number; cooldownMs: number;
  speed: number; aggroRange: number; model?: string; attackSchool?: 'fire';
}
export const MONSTERS: Record<EnemyKind, Monster> = {
  'bone-rat': { level: 30, name: 'Bone rat', hp: 48, damage: 8, xp: 16, gold: 14, height: 0.72, attackStyle: 'bite', range: 1.8, attackRadius: 0.9, windupMs: 500, recoveryMs: 300, cooldownMs: 1450, speed: 4.5, aggroRange: 10, model: 'bone-rat' },
  'corpse-scarab': { level: 30, name: 'Corpse scarab', hp: 86, damage: 9, xp: 22, gold: 20, height: 0.9, attackStyle: 'sting', range: 2.2, attackRadius: 1.1, windupMs: 800, recoveryMs: 450, cooldownMs: 2100, speed: 2.9, aggroRange: 10, model: 'corpse-scarab' },
  'mire-leech': { level: 31, name: 'Mire leech', hp: 60, damage: 10, xp: 22, gold: 18, height: 0.75, attackStyle: 'spit', range: 5.8, attackRadius: 1.3, windupMs: 1050, recoveryMs: 450, cooldownMs: 2600, speed: 2.3, aggroRange: 11, model: 'mire-leech' },
  'crypt-bat': { level: 30, name: 'Crypt bat', hp: 46, damage: 8, xp: 18, gold: 16, height: 1.8, attackStyle: 'bite', range: 2, attackRadius: 1, windupMs: 550, recoveryMs: 300, cooldownMs: 1600, speed: 4.7, aggroRange: 11, model: 'crypt-bat' },
  'fungal-thrall': { level: 32, name: 'Fungal thrall', hp: 86, damage: 10, xp: 26, gold: 22, height: 2.3, attackStyle: 'pulse', range: 4.8, attackRadius: 2.5, windupMs: 1250, recoveryMs: 600, cooldownMs: 2900, speed: 2.1, aggroRange: 10, model: 'fungal-thrall' },
  'plague-knight': { level: 33, name: 'Plague knight', hp: 112, damage: 12, xp: 30, gold: 28, height: 2.8, attackStyle: 'swipe', range: 3, attackRadius: 1.8, windupMs: 1100, recoveryMs: 600, cooldownMs: 2800, speed: 2.4, aggroRange: 11, model: 'plague-knight' },
  'carrion-hound': { level: 32, name: 'Carrion hound', hp: 66, damage: 10, xp: 24, gold: 22, height: 1.35, attackStyle: 'bite', range: 2.4, attackRadius: 1.2, windupMs: 700, recoveryMs: 350, cooldownMs: 1900, speed: 4.3, aggroRange: 11, model: 'carrion-hound' },
  'sewer-horror': { level: 34, name: 'Sewer horror', hp: 116, damage: 13, xp: 35, gold: 30, height: 3.2, attackStyle: 'slam', range: 4, attackRadius: 2.8, windupMs: 1450, recoveryMs: 700, cooldownMs: 3300, speed: 1.9, aggroRange: 10, model: 'sewer-horror' },
  'ember-imp': { attackSchool: 'fire', level: 40, name: 'Ember imp', hp: 56, damage: 7, xp: 22, gold: 20, height: 1.25, attackStyle: 'spit', range: 6, attackRadius: 1.2, windupMs: 900, recoveryMs: 400, cooldownMs: 2300, speed: 3.6, aggroRange: 11, model: 'ember-imp' },
  'cinder-hound': { level: 40, name: 'Cinder hound', hp: 72, damage: 8, xp: 26, gold: 23, height: 1.45, attackStyle: 'bite', range: 2.4, attackRadius: 1.2, windupMs: 650, recoveryMs: 350, cooldownMs: 1800, speed: 4.3, aggroRange: 11, model: 'cinder-hound' },
  'forge-spider': { level: 41, name: 'Forge spider', hp: 64, damage: 8, xp: 26, gold: 24, height: 1.1, attackStyle: 'sting', range: 2.6, attackRadius: 1.4, windupMs: 750, recoveryMs: 400, cooldownMs: 2100, speed: 3.9, aggroRange: 11, model: 'forge-spider' },
  'brass-sentinel': { level: 42, name: 'Brass sentinel', hp: 125, damage: 9, xp: 35, gold: 30, height: 3.1, attackStyle: 'swipe', range: 3.2, attackRadius: 2, windupMs: 1200, recoveryMs: 650, cooldownMs: 2900, speed: 2.1, aggroRange: 10, model: 'brass-sentinel' },
  'slag-elemental': { level: 43, name: 'Slag elemental', hp: 110, damage: 10, xp: 35, gold: 31, height: 2.5, attackStyle: 'slam', range: 4, attackRadius: 3, windupMs: 1400, recoveryMs: 700, cooldownMs: 3300, speed: 1.8, aggroRange: 10, model: 'slag-elemental' },
  'ash-drake': { attackSchool: 'fire', level: 43, name: 'Ash drake', hp: 95, damage: 9, xp: 36, gold: 31, height: 2.4, attackStyle: 'spit', range: 7, attackRadius: 2, windupMs: 1300, recoveryMs: 650, cooldownMs: 3100, speed: 3, aggroRange: 11, model: 'ash-drake' },
  'furnace-priest': { attackSchool: 'fire', level: 42, name: 'Furnace priest', hp: 80, damage: 8, xp: 31, gold: 28, height: 2.8, attackStyle: 'pulse', range: 6, attackRadius: 2, windupMs: 1100, recoveryMs: 550, cooldownMs: 2800, speed: 2.6, aggroRange: 11, model: 'furnace-priest' },
  'chain-jailer': { level: 44, name: 'Chain jailer', hp: 115, damage: 10, xp: 38, gold: 34, height: 3.1, attackStyle: 'swipe', range: 4, attackRadius: 2.4, windupMs: 1300, recoveryMs: 650, cooldownMs: 3000, speed: 2.2, aggroRange: 11, model: 'chain-jailer' },
  'paper-shikigami': { level: 50, name: 'Paper shikigami', hp: 56, damage: 5, xp: 25, gold: 22, height: 1.6, attackStyle: 'sting', range: 2.3, attackRadius: 1.1, windupMs: 600, recoveryMs: 300, cooldownMs: 1600, speed: 4.3, aggroRange: 10, model: 'paper-shikigami' },
  'grave-fox': { level: 50, name: 'Grave fox', hp: 70, damage: 6, xp: 28, gold: 25, height: 1.4, attackStyle: 'bite', range: 2.3, attackRadius: 1.2, windupMs: 650, recoveryMs: 350, cooldownMs: 1900, speed: 4.5, aggroRange: 11, model: 'grave-fox' },
  'mist-crane': { level: 51, name: 'Mist crane', hp: 66, damage: 6, xp: 28, gold: 25, height: 2.7, attackStyle: 'spit', range: 6.5, attackRadius: 1.3, windupMs: 1000, recoveryMs: 450, cooldownMs: 2500, speed: 3.8, aggroRange: 11, model: 'mist-crane' },
  'temple-ronin': { level: 52, name: 'Temple ronin', hp: 94, damage: 8, xp: 34, gold: 29, height: 2.7, attackStyle: 'swipe', range: 3, attackRadius: 1.6, windupMs: 950, recoveryMs: 450, cooldownMs: 2400, speed: 3.1, aggroRange: 11, model: 'temple-ronin' },
  'incense-acolyte': { level: 52, name: 'Incense acolyte', hp: 82, damage: 7, xp: 32, gold: 28, height: 2.55, attackStyle: 'pulse', range: 5.8, attackRadius: 2.1, windupMs: 1200, recoveryMs: 550, cooldownMs: 2900, speed: 2.5, aggroRange: 10, model: 'incense-acolyte' },
  'jade-lion': { level: 53, name: 'Jade lion', hp: 134, damage: 8, xp: 38, gold: 33, height: 2.1, attackStyle: 'slam', range: 3.6, attackRadius: 2.6, windupMs: 1350, recoveryMs: 650, cooldownMs: 3100, speed: 2.7, aggroRange: 11, model: 'jade-lion' },
  'mourning-mask': { level: 53, name: 'Mourning mask', hp: 76, damage: 7, xp: 34, gold: 30, height: 2.1, attackStyle: 'pulse', range: 6.5, attackRadius: 2.3, windupMs: 1350, recoveryMs: 600, cooldownMs: 3000, speed: 2.7, aggroRange: 11, model: 'mourning-mask' },
  'spirit-koi': { level: 54, name: 'Spirit koi', hp: 68, damage: 6, xp: 32, gold: 28, height: 1.4, attackStyle: 'spit', range: 6, attackRadius: 1.7, windupMs: 1050, recoveryMs: 500, cooldownMs: 2600, speed: 3.4, aggroRange: 11, model: 'spirit-koi' },
  'crypt-weaver': { level: 30, name: 'Crypt weaver', hp: 68, damage: 11, xp: 22, gold: 20, height: 1.53, attackStyle: 'bite', range: 2.3, attackRadius: 1.3, windupMs: 650, recoveryMs: 350, cooldownMs: 1700, speed: 3.7, aggroRange: 11, model: 'crypt-weaver' },
  'plague-alchemist': { level: 31, name: 'Plague alchemist', hp: 74, damage: 12, xp: 25, gold: 22, height: 2.76, attackStyle: 'spit', range: 6, attackRadius: 1.7, windupMs: 1000, recoveryMs: 500, cooldownMs: 2400, speed: 2.5, aggroRange: 11, model: 'plague-alchemist' },
  'broodmother-vex': { level: 32, name: 'Broodmother Vex', hp: 210, damage: 15, xp: 75, gold: 70, height: 3.14, attackStyle: 'spit', range: 6.8, attackRadius: 2.8, windupMs: 1350, recoveryMs: 700, cooldownMs: 3000, speed: 2.7, aggroRange: 11, model: 'broodmother-vex' },
  'plague-abomination': { level: 35, name: 'Plague Abomination', hp: 320, damage: 17, xp: 115, gold: 100, height: 3.78, attackStyle: 'slam', range: 4.5, attackRadius: 3.2, windupMs: 1500, recoveryMs: 750, cooldownMs: 3300, speed: 2.2, aggroRange: 11, model: 'plague-abomination' },
  'slag-crawler': { level: 40, name: 'Slag crawler', hp: 78, damage: 9, xp: 28, gold: 24, height: 1.1, attackStyle: 'sting', range: 2.8, attackRadius: 1.5, windupMs: 850, recoveryMs: 450, cooldownMs: 2100, speed: 3.3, aggroRange: 11, model: 'slag-crawler' },
  'furnace-revenant': { level: 41, name: 'Furnace revenant', hp: 90, damage: 10, xp: 30, gold: 27, height: 3.27, attackStyle: 'swipe', range: 2.6, attackRadius: 1.8, windupMs: 900, recoveryMs: 500, cooldownMs: 2200, speed: 2.8, aggroRange: 11, model: 'furnace-revenant' },
  'anvil-warden': { level: 42, name: 'Anvil Warden', hp: 235, damage: 12, xp: 90, gold: 80, height: 3.74, attackStyle: 'slam', range: 4.6, attackRadius: 3.0, windupMs: 1500, recoveryMs: 750, cooldownMs: 3400, speed: 2.2, aggroRange: 11, model: 'anvil-warden' },
  'pyrelord-ignivar': { attackSchool: 'fire', level: 45, name: 'Pyrelord Ignivar', hp: 345, damage: 13, xp: 130, gold: 110, height: 5.31, attackStyle: 'pulse', range: 6.2, attackRadius: 3.8, windupMs: 1650, recoveryMs: 800, cooldownMs: 3600, speed: 2.6, aggroRange: 11, model: 'pyrelord-ignivar' },
  'lantern-wraith': { level: 50, name: 'Lantern wraith', hp: 82, damage: 7, xp: 32, gold: 28, height: 2.9, attackStyle: 'pulse', range: 5.8, attackRadius: 1.9, windupMs: 1000, recoveryMs: 500, cooldownMs: 2400, speed: 3.3, aggroRange: 11, model: 'lantern-wraith' },
  'jade-sentinel': { level: 51, name: 'Jade sentinel', hp: 105, damage: 8, xp: 35, gold: 30, height: 3.59, attackStyle: 'swipe', range: 3.2, attackRadius: 1.8, windupMs: 950, recoveryMs: 550, cooldownMs: 2500, speed: 2.6, aggroRange: 11, model: 'jade-sentinel' },
  'bellkeeper-shen': { level: 52, name: 'Bellkeeper Shen', hp: 260, damage: 10, xp: 105, gold: 90, height: 4.03, attackStyle: 'pulse', range: 5.6, attackRadius: 3.1, windupMs: 1500, recoveryMs: 750, cooldownMs: 3400, speed: 2.5, aggroRange: 11, model: 'bellkeeper-shen' },
  'veiled-abbess': { level: 55, name: 'The Veiled Abbess', hp: 370, damage: 11, xp: 150, gold: 120, height: 5.3, attackStyle: 'pulse', range: 6.5, attackRadius: 4.0, windupMs: 1700, recoveryMs: 850, cooldownMs: 3800, speed: 2.7, aggroRange: 11, model: 'veiled-abbess' },
  'training-dummy': { level: 1, name: 'Training dummy', hp: TRAINING_DUMMY_HP, damage: 0, xp: 0, gold: 0, height: 3.06, attackStyle: 'swipe', range: 0, attackRadius: 0, windupMs: 0, recoveryMs: 0, cooldownMs: 1400, speed: 0, aggroRange: 0, model: 'training-dummy' },
  'treasure-goblin': { level: 1, name: 'Loot goblin', hp: 160, damage: 0, xp: 30, gold: 50, height: 2.2, attackStyle: 'swipe', range: 0, attackRadius: 0, windupMs: 0, recoveryMs: 0, cooldownMs: 1400, speed: 6.4, aggroRange: 12, model: 'treasure-goblin' },
  'moss-slime': { level: 1, name: 'Woodland slime', hp: 44, damage: 8, xp: 7, gold: 8, height: 1.2, attackStyle: 'slam', range: 1.7, attackRadius: .9, windupMs: 450, recoveryMs: 400, cooldownMs: 1400, speed: 2.7, aggroRange: 7 },
  'briar-sentinel': { level: 3, name: 'Briar sentinel', hp: 64, damage: 10, xp: 9, gold: 10, height: 2.9, attackStyle: 'swipe', range: 1.7, attackRadius: 1.1, windupMs: 550, recoveryMs: 400, cooldownMs: 1400, speed: 2.7, aggroRange: 7 },
  'ice-wisp': { level: 5, name: 'Ice wisp', hp: 58, damage: 10, xp: 11, gold: 12, height: 2.6, attackStyle: 'pulse', range: 1.7, attackRadius: 1.1, windupMs: 600, recoveryMs: 350, cooldownMs: 1400, speed: 2.7, aggroRange: 7 },
  'root-warden': { level: 8, name: 'Rootbound Warden', hp: 240, damage: 14, xp: 36, gold: 60, height: 5.1, attackStyle: 'slam', range: 2.8, attackRadius: 1.7, windupMs: 750, recoveryMs: 500, cooldownMs: 1400, speed: 2.7, aggroRange: 13 },
  'bramble-wolf': { level: 3, name: 'Bramble wolf', hp: 56, damage: 9, xp: 8, gold: 9, height: 1.81, attackStyle: 'bite', range: 1.8, attackRadius: .9, windupMs: 450, recoveryMs: 350, cooldownMs: 1300, speed: 4.05, aggroRange: 9, model: 'bramble-wolf' },
  'briar-boar': { level: 4, name: 'Briar boar', hp: 82, damage: 12, xp: 10, gold: 11, height: 1.54, attackStyle: 'swipe', range: 2, attackRadius: 1.3, windupMs: 650, recoveryMs: 450, cooldownMs: 1700, speed: 3, aggroRange: 8, model: 'briar-boar' },
  'grove-spider': { level: 2, name: 'Grove spider', hp: 48, damage: 9, xp: 8, gold: 9, height: 1.06, attackStyle: 'bite', range: 1.8, attackRadius: .9, windupMs: 450, recoveryMs: 300, cooldownMs: 1200, speed: 3.6, aggroRange: 8, model: 'grove-spider' },
  'ember-beetle': { attackSchool: 'fire', level: 6, name: 'Ember beetle', hp: 76, damage: 12, xp: 11, gold: 13, height: 0.98, attackStyle: 'spit', range: 6, attackRadius: 1.3, windupMs: 850, recoveryMs: 450, cooldownMs: 2100, speed: 2.55, aggroRange: 10, model: 'ember-beetle' },
  'dune-scorpion': { level: 8, name: 'Dune scorpion', hp: 88, damage: 14, xp: 12, gold: 14, height: 1.79, attackStyle: 'sting', range: 2.5, attackRadius: 1.2, windupMs: 700, recoveryMs: 500, cooldownMs: 1900, speed: 2.85, aggroRange: 8, model: 'dune-scorpion' },
  'stone-golem': { level: 10, name: 'Stone golem', hp: 150, damage: 19, xp: 17, gold: 20, height: 2.53, attackStyle: 'slam', range: 3, attackRadius: 2.2, windupMs: 1100, recoveryMs: 650, cooldownMs: 2600, speed: 1.95, aggroRange: 9, model: 'stone-golem' },
  'frost-yeti': { level: 12, name: 'Frost yeti', hp: 138, damage: 17, xp: 16, gold: 18, height: 2.71, attackStyle: 'swipe', range: 2.8, attackRadius: 1.7, windupMs: 850, recoveryMs: 550, cooldownMs: 2200, speed: 3, aggroRange: 10, model: 'frost-yeti' },
  'crystal-bat': { level: 9, name: 'Crystal bat', hp: 58, damage: 11, xp: 12, gold: 13, height: 1.59, attackStyle: 'pulse', range: 4.5, attackRadius: 1.6, windupMs: 750, recoveryMs: 400, cooldownMs: 1800, speed: 3.9, aggroRange: 10, model: 'crystal-bat' },
  'marsh-toad': { level: 7, name: 'Marsh toad', hp: 94, damage: 13, xp: 12, gold: 15, height: 0.97, attackStyle: 'spit', range: 6.5, attackRadius: 1.5, windupMs: 900, recoveryMs: 500, cooldownMs: 2100, speed: 2.25, aggroRange: 10, model: 'marsh-toad' },
  'void-stalker': { level: 16, name: 'Void stalker', hp: 108, damage: 16, xp: 15, gold: 18, height: 2.72, attackStyle: 'swipe', range: 2.2, attackRadius: 1.3, windupMs: 600, recoveryMs: 450, cooldownMs: 1600, speed: 3.75, aggroRange: 10, model: 'void-stalker' },
  'briarhorn-elder': { level: 10, name: 'Briarhorn Elder', hp: 96000, damage: 90, xp: 100, gold: 80, height: 4, attackStyle: 'swipe', range: 5, attackRadius: 2.5, windupMs: 1300, recoveryMs: 700, cooldownMs: 2800, speed: 3, aggroRange: 18, model: 'briarhorn-elder' },
  'rimefang-matriarch': { level: 20, name: 'Rimefang Matriarch', hp: 185000, damage: 145, xp: 170, gold: 160, height: 5.63, attackStyle: 'swipe', range: 6, attackRadius: 3, windupMs: 1400, recoveryMs: 750, cooldownMs: 3200, speed: 3.1, aggroRange: 22, model: 'rimefang-matriarch' },
  'stormhorn-behemoth': { level: 30, name: 'Stormhorn Behemoth', hp: 265000, damage: 195, xp: 240, gold: 240, height: 6.49, attackStyle: 'swipe', range: 6, attackRadius: 2.7, windupMs: 1400, recoveryMs: 800, cooldownMs: 3600, speed: 3.15, aggroRange: 24, model: 'stormhorn-behemoth' },
  'ashen-crown-titan': { level: 40, name: 'Ashen Crown Titan', hp: 350000, damage: 250, xp: 340, gold: 340, height: 7.11, attackStyle: 'slam', range: 7, attackRadius: 3.5, windupMs: 1500, recoveryMs: 850, cooldownMs: 3800, speed: 2.8, aggroRange: 26, model: 'ashen-crown-titan' },
};
/** Spawn levels remain fixed when enemies chase, respawn, or players join. */
export function monsterLevel(kind: EnemyKind, zone: ZoneId, regionId: string = zone, spawnId?: string): number {
  if (kind === 'training-dummy' || WORLD_BOSSES.some(boss => boss.kind === kind)) return MONSTERS[kind].level;
  const { min, max } = regionLevelRange(regionId, zone);
  if (spawnId === undefined) return Math.max(min, Math.min(max, MONSTERS[kind].level));
  let hash = 2166136261;
  for (let i = 0; i < spawnId.length; i++) hash = Math.imul(hash ^ spawnId.charCodeAt(i), 16777619) >>> 0;
  return min + hash % (max - min + 1);
}
export const monsterLevelScale = (enemyLevel: number, playerLevel: number) => 1 + Math.min(10, Math.max(0, enemyLevel - playerLevel)) * .15;

/** Fixed spawn levels govern combat strength; raid bosses retain their authored group balance. */
export function monsterStatsAtLevel(kind:EnemyKind,level:number):Monster {
  const stats=MONSTERS[kind],growth=Math.max(0,level-1),frontier=Math.max(0,level-30);
  if(!growth||kind==='training-dummy'||WORLD_BOSSES.some(boss=>boss.kind===kind))return stats;
  const hpScale=kind==='treasure-goblin'?1+frontier*.35:1+growth*.18+growth*growth*.003;
  return {...stats,hp:Math.round(stats.hp*hpScale),damage:Math.round(stats.damage*(1+growth*.16)),
    xp:Math.round(stats.xp*(1+frontier*.15)),gold:Math.round(stats.gold*(1+frontier*.08))};
}
export function monsterSpawnLevel(spawn:{id:string;kind:EnemyKind;zone:ZoneId;roaming?:boolean},regionId:string) {
  return monsterLevel(spawn.kind,spawn.zone,spawn.roaming?regionId:spawn.zone,spawn.roaming?spawn.id:undefined);
}

export const BASIC_ATTACK = { impactMs: 150, recoveryMs: 250, damageScale: .65 } as const;
export const basicAttackRange = (kind: EnemyKind) => Math.min(MONSTERS[kind].range, WORLD_BOSSES.some(boss => boss.kind === kind) ? 4 : 2);
export const basicAttackCooldown = (kind: EnemyKind) => Math.max(1300, Math.min(1800, MONSTERS[kind].cooldownMs));
export const monsterPursuitSpeed = (kind: EnemyKind) => MONSTERS[kind].speed === 0 ? 0 : 5.8 + MONSTERS[kind].speed * .32;
export const CHARGE_ATTACK = { speed: 24, maxDistance: 22, overshoot: 10, minRange: 4, maxRange: 14, windupMs: 800, cooldownMs: 12000, radius: 1.6, damageScale: 1.2, recoveryMs: 500 } as const;
export const CHARGING_MONSTERS: readonly EnemyKind[] = ['bramble-wolf','briar-boar','dune-scorpion','stone-golem','frost-yeti','void-stalker'];

export interface WorldBossAttack {
  name: string; description: string; style: EnemyAttackStyle; center: 'self' | 'target'; radius: number; windupMs: number; damageScale: number;
}
export interface WorldBoss {
  id: string; kind: EnemyKind; name: string; regionId: string; zone: ZoneId; x: number; z: number;
  arenaRadius: number; leashRadius: number; respawnMs: number; relic: number; description: string; attacks: readonly WorldBossAttack[];
}
/** Recommended same-level group, organized as five parties of four. */
export const WORLD_BOSS_GROUP_SIZE = 20;
export const WORLD_BOSS_BERSERK_MS = 210000;
export const WORLD_BOSSES: readonly WorldBoss[] = [
  { id: 'worldboss-briarhorn', kind: 'briarhorn-elder', name: 'Briarhorn Elder', regionId: 'tidewatch', zone: 'greenwood',
    x: -190, z: 602, arenaRadius: 18, leashRadius: 30, respawnMs: 300000, relic: 1,
    description: 'Gather about 20 level 10 adventurers with healers. Defeat it before it goes berserk after 3½ minutes. An ancient tusked boar beneath Tidewatch’s leafy canopy. Step out of Tusk Rake, then retreat from its expanding roots before Briar Quake lands. Sidestep the marked lane when Briarhorn Charge closes the gap. It is immune to stuns. Below half health its attacks become faster and stronger. Fight together and collect your own rewards.',
    attacks: [
      { name: 'Tusk Rake', description: 'Step out of the marked ground before the elder sweeps its tusks.', style: 'swipe', center: 'target', radius: 2.5, windupMs: 1300, damageScale: 1 },
      { name: 'Briar Quake', description: 'Move beyond the root circle before the elder stamps the ground.', style: 'slam', center: 'self', radius: 5.5, windupMs: 1600, damageScale: 1.4 },
      { name: 'Briarhorn Charge', description: 'Sidestep the root-lined lane; the full lane is struck when the charge ends.', style: 'charge', center: 'target', radius: 2, windupMs: 900, damageScale: 1.2 },
    ] },
  { id: 'worldboss-rimefang', kind: 'rimefang-matriarch', name: 'Rimefang Matriarch', regionId: 'northglass', zone: 'frostmarch',
    x: 397, z: -635, arenaRadius: 22, leashRadius: 34, respawnMs: 300000, relic: 2,
    description: 'Gather about 20 level 20 adventurers with healers. Defeat it before it goes berserk after 3½ minutes. A glacier-armored matriarch guarding the Northglass heights. Sidestep Rime Claws and leave the frost circle before Whiteout Roar bursts. Sidestep the ice-marked lane during Glacier Rush. It is immune to stuns. Below half health its attacks become faster and stronger. Fight together and collect your own rewards.',
    attacks: [
      { name: 'Rime Claws', description: 'Sidestep the marked ground before the matriarch rakes it with ice.', style: 'swipe', center: 'target', radius: 3, windupMs: 1400, damageScale: 1 },
      { name: 'Whiteout Roar', description: 'Leave the frost circle before the matriarch releases its freezing roar.', style: 'pulse', center: 'self', radius: 7, windupMs: 1900, damageScale: 1.4 },
      { name: 'Glacier Rush', description: 'Sidestep the ice-marked lane; the full lane is struck when the charge ends.', style: 'charge', center: 'target', radius: 2.2, windupMs: 900, damageScale: 1.25 },
    ] },
  { id: 'worldboss-stormhorn', kind: 'stormhorn-behemoth', name: 'Stormhorn Behemoth', regionId: 'elderwood', zone: 'greenwood',
    x: 174, z: 528, arenaRadius: 24, leashRadius: 36, respawnMs: 300000, relic: 3,
    description: 'Gather about 20 level 30 adventurers with healers. Defeat it before it goes berserk after 3½ minutes. A thunder-charged behemoth in Elderwood Reach. Dodge Thunderclaw, retreat from Thunderquake, and clear the wider circle before Stormcall strikes. Step sideways out of Thunder Rush’s lightning lane. It is immune to stuns. Below half health its attacks become faster and stronger. Fight together and collect your own rewards.',
    attacks: [
      { name: 'Thunderclaw', description: 'Dodge the marked ground before the behemoth sweeps its charged claws.', style: 'swipe', center: 'target', radius: 2.7, windupMs: 1400, damageScale: 1 },
      { name: 'Thunderquake', description: 'Move outside the shockwave circle before the behemoth slams down.', style: 'slam', center: 'self', radius: 7, windupMs: 1700, damageScale: 1.5 },
      { name: 'Stormcall', description: 'Clear the wider lightning circle before the storm discharges.', style: 'pulse', center: 'self', radius: 9, windupMs: 2200, damageScale: 1.25 },
      { name: 'Thunder Rush', description: 'Sidestep the lightning-marked lane; the full lane is struck when the charge ends.', style: 'charge', center: 'target', radius: 2.4, windupMs: 900, damageScale: 1.3 },
    ] },
  { id: 'worldboss-ashen-crown', kind: 'ashen-crown-titan', name: 'Ashen Crown Titan', regionId: 'sunveil-badlands', zone: 'sunveil',
    x: -1226, z: -654, arenaRadius: 26, leashRadius: 40, respawnMs: 300000, relic: 4,
    description: 'Gather about 20 level 40 adventurers with healers. Defeat it before it goes berserk after 3½ minutes. A crowned titan of cracked basalt and molten rock in the Sunveil Badlands. Leave Magma Hammer’s marked impact, then retreat beyond the molten circle before Cinder Eruption. Sidestep the molten lane during Caldera Charge. It is immune to stuns. Below half health its attacks become faster and stronger. Fight together and collect your own rewards.',
    attacks: [
      { name: 'Magma Hammer', description: 'Leave the marked ground before the titan hammers it with molten stone.', style: 'slam', center: 'target', radius: 3.5, windupMs: 1500, damageScale: 1.2 },
      { name: 'Cinder Eruption', description: 'Retreat beyond the molten circle before the titan erupts.', style: 'pulse', center: 'self', radius: 9, windupMs: 2300, damageScale: 1.5 },
      { name: 'Caldera Charge', description: 'Sidestep the molten lane; the full lane is struck when the charge ends.', style: 'charge', center: 'target', radius: 2.8, windupMs: 1000, damageScale: 1.35 },
    ] },
];
/** Existing Stormhorn references retain the same encounter object. */
export const WORLD_BOSS = WORLD_BOSSES[2];
