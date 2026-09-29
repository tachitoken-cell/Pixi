import type { EnemyKind } from './bestiary';
import type { RaidHazard } from './raid';
import type { InstantCombatMapId } from './instant-combat-maps';
import { goldSource } from './gold-economy.ts';
import { DUNGEON_GEAR_DROP_CHANCES, type LootEntry } from './loot-items.ts';

export type InstantCombatMechanic = 'anchors' | 'stomps' | 'notes' | 'brood' | 'rifts' | 'webs' | 'charge' | 'gaze';

export const INSTANT_COMBAT = {
  intervalMs: 2 * 60 * 60 * 1000,
  registrationMs: 5 * 60 * 1000,
  preparationMs: 90 * 1000,
  maxPlayers: 20,
  rounds: 5,
  defenseBypass: [.3, .4, .5, .6, .7],
  subwaves: 3,
  movementSpeedMultiplier: 2,
  attackRateMultiplier: 1.25,
  roundBreakMs: 20 * 1000,
  maxDurationMs: 30 * 60 * 1000,
  returnMs: 30 * 1000,
  mechanicMs: 45 * 1000,
  runeChargeMs: 3 * 1000,
} as const;

export const INSTANT_COMBAT_WAVES = [
  { minimum: 1, perPlayer: .5, hp: .35, damage: .3 },
  { minimum: 2, perPlayer: .65, hp: .55, damage: .5 },
  { minimum: 3, perPlayer: .9, hp: .9, damage: .85 },
  { minimum: 5, perPlayer: 1.35, hp: 1.2, damage: 1.2 },
] as const;

export const INSTANT_COMBAT_CREATURES = {
  'bone-pit': {
    waves: [{ model: 'bone-reaver', name: 'Bone Reaver', kind: 'briar-sentinel' }, { model: 'ossuary-scarab', name: 'Ossuary Scarab', kind: 'ember-beetle' }],
    bosses: [
      { model: 'ossuary-tyrant', name: 'Ossuary Tyrant', kind: 'root-warden', attacks: ['cleave', 'barrage', 'cross'], mechanic: 'anchors', instruction: 'At 70% and 35%, destroy every Bone Chain to break the shield. The second binding adds another chain.' },
      { model: 'marrow-colossus', name: 'Marrow Colossus', kind: 'root-warden', attacks: ['ring', 'cleave', 'ring'], mechanic: 'stomps', instruction: 'At 70% and 35%, stand in the gold stomp circle when it lands. Soak 3, then 4 stomps to crack its armor.' },
      { model: 'grave-cantor', name: 'Grave Cantor', kind: 'root-warden', attacks: ['cross', 'barrage', 'ring'], mechanic: 'notes', instruction: 'At 70% and 35%, charge 3, then 4 numbered notes in order. Only the active note is safe; a wrong note interrupts its charge.' },
      { model: 'carrion-queen', name: 'Carrion Queen', kind: 'root-warden', attacks: ['barrage', 'ring', 'cleave'], mechanic: 'brood', instruction: 'At 70% and 35%, clear 2, then 3 brood batches. Destroy nests before their 10-second hatch or defeat the scarabs that emerge.' },
    ],
    anchor: { model: 'bone-anchor', name: 'Bone Anchor', kind: 'briar-sentinel' },
  },
  'void-rift': {
    waves: [{ model: 'rift-stalker', name: 'Rift Stalker', kind: 'void-stalker' }, { model: 'void-cantor', name: 'Void Cantor', kind: 'ice-wisp' }],
    bosses: [
      { model: 'rift-sovereign', name: 'Rift Sovereign', kind: 'root-warden', attacks: ['cross', 'cleave', 'barrage'], mechanic: 'rifts', instruction: 'At 70% and 35%, stand in each blue rift for 3 seconds to seal it. Progress persists; the second phase opens an extra rift.' },
      { model: 'nullweaver', name: 'Nullweaver', kind: 'root-warden', attacks: ['barrage', 'cross', 'cross'], mechanic: 'webs', instruction: 'At 70% and 35%, every marked player must move 6 meters from their web origin within 8 seconds. Sever 2, then 3 rounds of webs.' },
      { model: 'umbral-behemoth', name: 'Umbral Behemoth', kind: 'root-warden', attacks: ['cleave', 'ring', 'barrage'], mechanic: 'charge', instruction: 'At 70% and 35%, the marked player baits the charge through the pillar, then dodges its locked red lane. Shatter 2, then 3 pillars; player attacks cannot break them.' },
      { model: 'eclipse-oracle', name: 'Eclipse Oracle', kind: 'root-warden', attacks: ['ring', 'cross', 'ring'], mechanic: 'gaze', instruction: 'At 70% and 35%, everyone must turn their character away from the boss when its gaze lands. Avoid 2, then 3 gazes together.' },
    ],
    anchor: { model: 'rift-anchor', name: 'Rift Anchor', kind: 'briar-sentinel' },
  },
} as const satisfies Record<InstantCombatMapId, { waves: readonly { model: string; name: string; kind: EnemyKind }[]; bosses: readonly { model: string; name: string; kind: EnemyKind; attacks: readonly ('cleave' | 'barrage' | 'cross' | 'ring')[]; mechanic: InstantCombatMechanic; instruction: string }[]; anchor: { model: string; name: string; kind: EnemyKind } }>;
export const INSTANT_COMBAT_BROOD_NEST = { model: 'brood-nest', name: 'Brood Nest', kind: 'briar-sentinel' } as const;
export const INSTANT_COMBAT_MODEL_KINDS = [...Object.values(INSTANT_COMBAT_CREATURES).flatMap(({ waves, bosses, anchor }) => [...waves, ...bosses, anchor].map(creature => creature.model)), INSTANT_COMBAT_BROOD_NEST.model];

/** Each map advances its own four-boss rotation on its next scheduled appearance. */
export function instantCombatEncounter(startsAt: number) {
  const slot = Math.floor(startsAt / INSTANT_COMBAT.intervalMs), mapId = slot % 2 ? 'void-rift' : 'bone-pit';
  return { mapId, bossModel: INSTANT_COMBAT_CREATURES[mapId].bosses[Math.floor(slot / 2) % 4].model } as const;
}

export const INSTANT_COMBAT_BRACKETS = [
  { id: '16-30', minLevel: 16, maxLevel: 30 },
  { id: '31-45', minLevel: 31, maxLevel: 45 },
  { id: '46-60', minLevel: 46, maxLevel: 60 },
] as const;

export function instantCombatBracket(level: number) {
  return Number.isInteger(level) ? INSTANT_COMBAT_BRACKETS.find(bracket => level >= bracket.minLevel && level <= bracket.maxLevel) : undefined;
}

/** Personal ground rewards are created once at a cleared wave, never by individual enemies. */
export function instantCombatWaveReward(bracketId: string, round: number, economyActive = false) {
  const bracket = INSTANT_COMBAT_BRACKETS.findIndex(entry => entry.id === bracketId);
  if (bracket < 0 || !Number.isInteger(round) || round < 1 || round > INSTANT_COMBAT.rounds) return null;
  const items: LootEntry[] = [];
  const resource = (itemId: 'potion' | 'herb' | 'crystal' | 'relic', quantity: number) => items.push({ id: `resource:${itemId}`, kind: 'resource', itemId, quantity, quality: itemId === 'relic' ? 'rare' : itemId === 'crystal' ? 'uncommon' : 'common' });
  const tonic = (quantity: number) => items.push({ id: 'item:greater-tonic', kind: 'item', itemId: 'greater-tonic', quantity, quality: 'uncommon' });
  if (round === 1) resource('potion', 2);
  if (round === 2) { resource('potion', 3); resource('herb', 2); }
  if (round === 3) { tonic(1); resource('crystal', 2); }
  if (round === 4) { tonic(2); resource('crystal', 3); resource('herb', 3); }
  if (round === 5) { resource('crystal', bracket + 3); resource('relic', bracket + 1); }
  return { gold: goldSource((bracket + 1) * 10 * [1, 2, 3, 5, 9][round - 1], 'cache', economyActive), items,
    xp: round === 5 ? (bracket + 1) * 600 : 0, gearChance: round === 5 ? DUNGEON_GEAR_DROP_CHANCES.cache : 0 };
}

/** Registration closes exactly on the even UTC hour; that instant belongs to the next signup window. */
export function instantCombatSchedule(now: number) {
  const startsAt = (Math.floor(now / INSTANT_COMBAT.intervalMs) + 1) * INSTANT_COMBAT.intervalMs;
  const registrationOpensAt = startsAt - INSTANT_COMBAT.registrationMs;
  return { startsAt, registrationOpensAt, registrationOpen: now >= registrationOpensAt };
}

export const isInstantCombatInstance = (id: string | null | undefined): boolean => !!id?.startsWith('instant-combat-');

export interface InstantCombatState {
  startsAt: number;
  registrationOpensAt: number;
  registrationOpen: boolean;
  registered: boolean;
  bracketId: string | null;
  registeredCount: number;
  run: {
    id: string;
    mapId: InstantCombatMapId;
    bossModel: string;
    bracketId: string;
    minLevel: number;
    maxLevel: number;
    phase: 'preparing' | 'fighting' | 'intermission' | 'completed' | 'failed';
    round: number;
    totalRounds: number;
    subwave: number;
    totalSubwaves: number;
    phaseEndsAt: number;
    members: number;
    enemiesRemaining: number;
    objective: string;
    control?: { stunUntil: number; rootUntil: number; silenceUntil: number; blindUntil: number; darkUntil: number };
    boss: { id: string; name: string; x: number; z: number; hp: number; maxHp: number; phase: 'combat' | 'mechanic' | 'final'; shielded: boolean; endsAt: number } | null;
    mechanic: { kind: InstantCombatMechanic; label: string; progress: number; goal: number; nextAt: number; targetId?: string } | null;
    hazards: RaidHazard[];
    runes: { id: string; x: number; z: number; r: number; charge: number; kind?: 'charge' | 'ordered' | 'soak' | 'web' | 'bait' | 'gaze'; label?: string; active?: boolean; playerId?: string; targetX?: number; targetZ?: number }[];
  } | null;
}
