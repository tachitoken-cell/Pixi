import type { DungeonId } from './dungeon.ts';

/** Visual identity only. Enemy kinds, encounter flags, combat stats and rewards remain authoritative. */
export const DUNGEON_BOSS_MODELS = [
  { dungeonId: 'rootvault', stageId: 'confluence', model: 'twinlight-sentinel', name: 'Twinlight Sentinel' },
  { dungeonId: 'rootvault', stageId: 'throne', model: 'heartkeeper', name: 'The Heartkeeper' },
  { dungeonId: 'cindercrypt', stageId: 'confluence', model: 'cinder-castellan', name: 'Cinder Castellan' },
  { dungeonId: 'cindercrypt', stageId: 'throne', model: 'cinder-colossus', name: 'Cinder Colossus' },
  { dungeonId: 'frosthollow', stageId: 'confluence', model: 'rimebound-guardian', name: 'Rimebound Guardian' },
  { dungeonId: 'frosthollow', stageId: 'throne', model: 'rime-sovereign', name: 'Rime Sovereign' },
  { dungeonId: 'nightroot', stageId: 'confluence', model: 'eclipse-keeper', name: 'Eclipse Keeper' },
  { dungeonId: 'nightroot', stageId: 'throne', model: 'dreadheart', name: 'Dreadheart' },
] as const;
export type DungeonBossModel = typeof DUNGEON_BOSS_MODELS[number]['model'];
export const DUNGEON_BOSS_MODEL_KINDS = DUNGEON_BOSS_MODELS.map(entry => entry.model);

export function dungeonBossVisual(dungeonId: DungeonId, stageId: string, enemyIndex: number): { model: DungeonBossModel; name: string } | undefined {
  if (enemyIndex !== 0) return;
  const entry = DUNGEON_BOSS_MODELS.find(entry => entry.dungeonId === dungeonId && entry.stageId === stageId);
  if (entry) return { model: entry.model, name: entry.name };
}
