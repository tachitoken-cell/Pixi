import type { NodeKind } from './content';

export type SkillId = 'mining' | 'woodcutting' | 'herbalism' | 'fishing';
export const SKILLS: Record<SkillId, { label: string; description: string; tool: 'pickaxe' | 'axe' | 'hands' | 'rod' }> = {
  fishing: { label: 'Fishing', description: 'Cast from the shore and catch fish to eat or sell. Your rod is supplied.', tool: 'rod' },
  mining: { label: 'Mining', description: 'Extract crystals and forgotten fragments with your pickaxe.', tool: 'pickaxe' },
  woodcutting: { label: 'Woodcutting', description: 'Chop timber and tend the ancient heartroots.', tool: 'axe' },
  herbalism: { label: 'Herbalism', description: 'Collect wild herbs along the lantern roads.', tool: 'hands' },
};
export interface ResourceDefinition {
  label: string; verb: string; skill: SkillId; xp: number; reward: 'wood' | 'crystal' | 'herb' | 'fish'; item?: string;
  adventureXp: number; duration: number; requiredLevel: number; yield: number; model?: string; height?: number;
}
export const RESOURCE_TYPES: Record<NodeKind, ResourceDefinition> = {
  'moonfin-shoal': { label: 'Moonfin shoal', verb: 'Fish', skill: 'fishing', xp: 5000, reward: 'fish', item: 'moonfin', adventureXp: 8, duration: 9000, requiredLevel: 50, yield: 1, height: .5 },
  'glacial-shoal': { label: 'Glacial char shoal', verb: 'Fish', skill: 'fishing', xp: 2000, reward: 'fish', item: 'glacial-char', adventureXp: 8, duration: 8000, requiredLevel: 25, yield: 1, height: .5 },
  'silver-shoal': { label: 'Silver carp shoal', verb: 'Fish', skill: 'fishing', xp: 600, reward: 'fish', item: 'silver-carp', adventureXp: 8, duration: 7000, requiredLevel: 10, yield: 1, height: .5 },
  'brook-shoal': { label: 'Brook trout shoal', verb: 'Fish', skill: 'fishing', xp: 100, reward: 'fish', item: 'brook-trout', adventureXp: 8, duration: 6000, requiredLevel: 1, yield: 1, height: .5 },
  crystal: { label: 'Grove crystal', verb: 'Mine', skill: 'mining', xp: 100, reward: 'crystal', adventureXp: 12, duration: 2400, requiredLevel: 1, yield: 1, model: 'gathering-crystal', height: 1.5 },
  'ember-shard': { label: 'Ember shard', verb: 'Mine', skill: 'mining', xp: 100, reward: 'crystal', adventureXp: 15, duration: 2600, requiredLevel: 1, yield: 1, height: 1.5 },
  'star-fragment': { label: 'Star fragment', verb: 'Mine', skill: 'mining', xp: 100, reward: 'crystal', adventureXp: 18, duration: 2800, requiredLevel: 1, yield: 1, height: 1.5 },
  heartroot: { label: 'Heartroot', verb: 'Cleanse', skill: 'woodcutting', xp: 100, reward: 'wood', adventureXp: 25, duration: 2800, requiredLevel: 1, yield: 1, height: 1.5 },
  timber: { label: 'Timber tree', verb: 'Chop', skill: 'woodcutting', xp: 100, reward: 'wood', adventureXp: 8, duration: 2800, requiredLevel: 1, yield: 1, model: 'gathering-timber', height: 3.1 },
  herb: { label: 'Wild herbs', verb: 'Harvest', skill: 'herbalism', xp: 100, reward: 'herb', adventureXp: 6, duration: 1800, requiredLevel: 1, yield: 1, model: 'gathering-herb', height: 0.85 },
  'copper-vein': { label: 'Copper vein', verb: 'Mine', skill: 'mining', xp: 600, reward: 'crystal', adventureXp: 12, duration: 3000, requiredLevel: 10, yield: 2, model: 'gathering-copper-vein', height: 1.25 },
  'silver-birch': { label: 'Silver birch', verb: 'Chop', skill: 'woodcutting', xp: 600, reward: 'wood', adventureXp: 12, duration: 3000, requiredLevel: 10, yield: 2, model: 'gathering-silver-birch', height: 4.5 },
  moonpetal: { label: 'Moonpetal', verb: 'Harvest', skill: 'herbalism', xp: 600, reward: 'herb', adventureXp: 12, duration: 3000, requiredLevel: 10, yield: 2, model: 'gathering-moonpetal', height: 0.8 },
  'cobalt-vein': { label: 'Cobalt vein', verb: 'Mine', skill: 'mining', xp: 2000, reward: 'crystal', adventureXp: 16, duration: 3600, requiredLevel: 25, yield: 3, model: 'gathering-cobalt-vein', height: 2 },
  ironwood: { label: 'Ironwood', verb: 'Chop', skill: 'woodcutting', xp: 2000, reward: 'wood', adventureXp: 16, duration: 3600, requiredLevel: 25, yield: 3, model: 'gathering-ironwood', height: 6 },
  frostbloom: { label: 'Frostbloom', verb: 'Harvest', skill: 'herbalism', xp: 2000, reward: 'herb', adventureXp: 16, duration: 3600, requiredLevel: 25, yield: 3, model: 'gathering-frostbloom', height: 1.1 },
  'sunstone-vein': { label: 'Sunstone vein', verb: 'Mine', skill: 'mining', xp: 5000, reward: 'crystal', adventureXp: 20, duration: 4200, requiredLevel: 50, yield: 5, model: 'gathering-sunstone-vein', height: 2.7 },
  elderwood: { label: 'Elderwood', verb: 'Chop', skill: 'woodcutting', xp: 5000, reward: 'wood', adventureXp: 20, duration: 4200, requiredLevel: 50, yield: 5, model: 'gathering-elderwood', height: 8 },
  sunblossom: { label: 'Sunblossom', verb: 'Harvest', skill: 'herbalism', xp: 5000, reward: 'herb', adventureXp: 20, duration: 4200, requiredLevel: 50, yield: 5, model: 'gathering-sunblossom', height: 1.5 },
};
export const MAX_SKILL_XP = 50 * 98 ** 2;

export function skillProgress(totalXp: number) {
  const total = Math.max(0, Math.min(MAX_SKILL_XP, Number.isFinite(totalXp) ? Math.floor(totalXp) : 0));
  const level = Math.min(99, Math.floor(Math.sqrt(total / 50)) + 1);
  const xp = total - 50 * (level - 1) ** 2;
  const nextLevelXp = level === 99 ? 0 : 50 * (2 * level - 1);
  return { level, xp, nextLevelXp, percent: nextLevelXp ? xp / nextLevelXp * 100 : 100 };
}

export function gatheringDuration(kind: NodeKind, totalSkillXp: number) {
  return Math.round(RESOURCE_TYPES[kind].duration * (1 - Math.min(0.3, (skillProgress(totalSkillXp).level - 1) * 0.01)));
}

/** Requirements always use the relevant profession XP, never the adventure level. */
export function canGather(kind: NodeKind, totalSkillXp: number): boolean {
  return Object.hasOwn(RESOURCE_TYPES, kind) && skillProgress(totalSkillXp).level >= RESOURCE_TYPES[kind].requiredLevel;
}
export function gatheringUnlocks(skill: SkillId, fromLevel: number, toLevel: number): NodeKind[] {
  return (Object.keys(RESOURCE_TYPES) as NodeKind[]).filter(kind => {
    const resource = RESOURCE_TYPES[kind];
    return resource.skill === skill && resource.requiredLevel > fromLevel && resource.requiredLevel <= toLevel;
  });
}
export function nextGatheringUnlock(skill: SkillId, totalSkillXp: number): { level: number; resources: NodeKind[] } | undefined {
  const level = skillProgress(totalSkillXp).level, future = gatheringUnlocks(skill, level, 99);
  if (!future.length) return;
  const next = Math.min(...future.map(kind => RESOURCE_TYPES[kind].requiredLevel));
  return { level: next, resources: future.filter(kind => RESOURCE_TYPES[kind].requiredLevel === next) };
}

export const PROFESSION_RANKS = [
  { id: 'apprentice', label: 'Apprentice', level: 1, maxLevel: 9 },
  { id: 'journeyman', label: 'Journeyman', level: 10, maxLevel: 24 },
  { id: 'expert', label: 'Expert', level: 25, maxLevel: 49 },
  { id: 'artisan', label: 'Artisan', level: 50, maxLevel: 99 },
] as const;
export const professionRank = (totalXp: number) => PROFESSION_RANKS.find(rank => skillProgress(totalXp).level <= rank.maxLevel)!;
export type ProfessionDifficulty = 'locked' | 'challenging' | 'practiced' | 'familiar' | 'mastered';
/** Familiar work remains useful until its successor unlocks; the last rank trains to 99. */
export function professionDifficulty(requiredLevel: number, totalXp: number): ProfessionDifficulty {
  const level = skillProgress(totalXp).level;
  if (level < requiredLevel) return 'locked';
  const end = PROFESSION_RANKS.find(rank => rank.level > requiredLevel)?.level ?? 99;
  if (level >= end) return 'mastered';
  const progress = (level - requiredLevel) / (end - requiredLevel);
  return progress < .5 ? 'challenging' : progress < .8 ? 'practiced' : 'familiar';
}
export function professionXpGain(baseXp: number, requiredLevel: number, totalXp: number): number {
  const factor = { locked: 0, challenging: 1, practiced: .6, familiar: .25, mastered: 0 }[professionDifficulty(requiredLevel, totalXp)];
  return Math.max(0, Math.min(MAX_SKILL_XP - totalXp, Math.floor(baseXp * factor)));
}
export const gatheringXpGain = (kind: NodeKind, totalXp: number) => professionXpGain(RESOURCE_TYPES[kind].xp, RESOURCE_TYPES[kind].requiredLevel, totalXp);
