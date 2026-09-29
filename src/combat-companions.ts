import { MONSTERS, WORLD_BOSSES, THEMED_DUNGEON_ROSTERS, type EnemyKind } from './bestiary.ts';

export interface TamedCompanion { kind: EnemyKind; level: number; hp: number; dismissed?: boolean }
export interface CombatCompanion extends TamedCompanion { maxHp: number; x: number; z: number; rotation: number; attackUntil: number; targetId: string | null; bondReady: boolean }

// Creature appearance does not import elite encounter health or damage into a player companion.
export function combatCompanionStats(level: number) {
  return { maxHp: 100 + (level - 1) * 12, damage: Math.round((6 + level * 1.8) * .5), defense: Math.floor(level * .4), range: 2, cooldownMs: 2000 };
}
const bossKinds = new Set<string>([...WORLD_BOSSES.map(boss => boss.kind), ...Object.values(THEMED_DUNGEON_ROSTERS).flatMap(roster => roster.slice(-2))]);
export function tameableKind(kind: unknown): kind is EnemyKind {
  return typeof kind === 'string' && Object.hasOwn(MONSTERS, kind) && kind !== 'training-dummy' && !bossKinds.has(kind);
}
export function tameableCreature(enemy: { kind: unknown; level: number; hp: number; alive: boolean; worldBoss?: boolean; dungeonBoss?: boolean }, level: number) {
  return tameableKind(enemy.kind) && !enemy.worldBoss && !enemy.dungeonBoss && enemy.alive && enemy.hp > 0
    && Number.isSafeInteger(enemy.level) && enemy.level >= 1 && enemy.level <= level;
}
export function tamedCompanionValid(value: unknown): value is TamedCompanion | null {
  if (value === null) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const pet = value as TamedCompanion;
  return Object.keys(pet).every(key => ['kind', 'level', 'hp', 'dismissed'].includes(key)) && tameableKind(pet.kind)
    && Number.isSafeInteger(pet.level) && pet.level >= 1 && pet.level <= 60
    && Number.isSafeInteger(pet.hp) && pet.hp >= 0 && pet.hp <= combatCompanionStats(pet.level).maxHp
    && (pet.dismissed === undefined || typeof pet.dismissed === 'boolean');
}
