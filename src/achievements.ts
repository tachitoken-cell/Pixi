import type { Player } from './shared';
import { CHAPTERS, ZONES, type ZoneId } from './content.ts';
import { DUNGEONS, type DungeonId } from './dungeon.ts';
import { skillProgress } from './skills.ts';
import { MOUNTS } from './travel.ts';

export const ACHIEVEMENT_CATEGORIES = ['Character', 'Combat', 'Quests', 'Exploration', 'Professions', 'Dungeons'] as const;
export type AchievementCategory = typeof ACHIEVEMENT_CATEGORIES[number];
export interface AchievementState {
  unlocked: Record<string, number>;
  kills: number; worldBosses: number; gathered: number; crafted: number; contracts: number;
  zones: ZoneId[];
  dungeons: Partial<Record<DungeonId, number>>;
}
type Metric = 'level' | 'mounts' | 'kills' | 'worldBosses' | 'chapters' | 'contracts' | 'zones' | 'ports' | 'gathered' | 'skill' | 'crafted' | DungeonId;
export interface AchievementDefinition {
  id: string; name: string; description: string; category: AchievementCategory; icon: string;
  points: number; target: number; metric: Metric;
}
export const ACHIEVEMENTS: AchievementDefinition[] = [
  { id: 'growing-roots', name: 'Growing Roots', description: 'Reach character level 5.', category: 'Character', icon: 'user', points: 5, target: 5, metric: 'level' },
  { id: 'seasoned-adventurer', name: 'Seasoned Adventurer', description: 'Reach character level 10.', category: 'Character', icon: 'shield', points: 10, target: 10, metric: 'level' },
  { id: 'road-veteran', name: 'Road Veteran', description: 'Reach character level 25.', category: 'Character', icon: 'shield', points: 20, target: 25, metric: 'level' },
  { id: 'living-legend', name: 'Living Legend', description: 'Reach character level 60.', category: 'Character', icon: 'shield', points: 30, target: 60, metric: 'level' },
  { id: 'saddle-up', name: 'Saddle Up', description: 'Own your first mount.', category: 'Character', icon: 'compass', points: 10, target: 1, metric: 'mounts' },
  { id: 'first-victory', name: 'First Victory', description: 'Defeat your first monster.', category: 'Combat', icon: 'sword', points: 5, target: 1, metric: 'kills' },
  { id: 'trail-warden', name: 'Trail Warden', description: 'Defeat 25 monsters.', category: 'Combat', icon: 'sword', points: 10, target: 25, metric: 'kills' },
  { id: 'realm-defender', name: 'Realm Defender', description: 'Defeat 100 monsters.', category: 'Combat', icon: 'shield', points: 20, target: 100, metric: 'kills' },
  { id: 'bane-of-monsters', name: 'Bane of Monsters', description: 'Defeat 500 monsters.', category: 'Combat', icon: 'sword', points: 30, target: 500, metric: 'kills' },
  { id: 'giant-slayer', name: 'Giant Slayer', description: 'Help defeat a world boss.', category: 'Combat', icon: 'boss', points: 20, target: 1, metric: 'worldBosses' },
  { id: 'first-chapter', name: 'A Story Begins', description: 'Complete the first campaign chapter.', category: 'Quests', icon: 'book', points: 5, target: 1, metric: 'chapters' },
  { id: 'lantern-bearer', name: 'Lantern Bearer', description: 'Complete four campaign chapters.', category: 'Quests', icon: 'book', points: 15, target: 4, metric: 'chapters' },
  { id: 'mossvale-hero', name: 'Hero of Mossvale', description: 'Complete the campaign and choose the lantern’s future.', category: 'Quests', icon: 'sun', points: 30, target: 9, metric: 'chapters' },
  { id: 'helping-hand', name: 'A Helping Hand', description: 'Claim your first contract reward.', category: 'Quests', icon: 'book', points: 5, target: 1, metric: 'contracts' },
  { id: 'trusted-by-townsfolk', name: 'Trusted by the Townsfolk', description: 'Claim 10 contract rewards.', category: 'Quests', icon: 'book', points: 15, target: 10, metric: 'contracts' },
  { id: 'beyond-the-grove', name: 'Beyond the Grove', description: 'Visit two overworld regions.', category: 'Exploration', icon: 'compass', points: 5, target: 2, metric: 'zones' },
  { id: 'lantern-roads', name: 'The Lantern Roads', description: 'Visit four overworld regions.', category: 'Exploration', icon: 'map', points: 15, target: 4, metric: 'zones' },
  { id: 'far-horizons', name: 'Far Horizons', description: 'Visit all six overworld regions.', category: 'Exploration', icon: 'map', points: 25, target: 6, metric: 'zones' },
  { id: 'skyway-scout', name: 'Skyway Scout', description: 'Discover three zeppelin docks.', category: 'Exploration', icon: 'compass', points: 10, target: 3, metric: 'ports' },
  { id: 'hands-on', name: 'Hands On', description: 'Gather your first resource node.', category: 'Professions', icon: 'gather', points: 5, target: 1, metric: 'gathered' },
  { id: 'rich-harvest', name: 'A Rich Harvest', description: 'Gather 50 resource nodes.', category: 'Professions', icon: 'leaf', points: 15, target: 50, metric: 'gathered' },
  { id: 'apprentice-gatherer', name: 'Apprentice Gatherer', description: 'Reach level 10 in any gathering profession.', category: 'Professions', icon: 'gather', points: 10, target: 10, metric: 'skill' },
  { id: 'skilled-gatherer', name: 'Skilled Gatherer', description: 'Reach level 25 in any gathering profession.', category: 'Professions', icon: 'crystal', points: 20, target: 25, metric: 'skill' },
  { id: 'made-by-hand', name: 'Made by Hand', description: 'Craft your first recipe at a workshop.', category: 'Professions', icon: 'wood', points: 5, target: 1, metric: 'crafted' },
  { id: 'workshop-regular', name: 'Workshop Regular', description: 'Craft 25 recipes at a workshop.', category: 'Professions', icon: 'gather', points: 15, target: 25, metric: 'crafted' },
  { id: 'rootvault-conqueror', name: 'Rootvault Conqueror', description: 'Clear the Rootvault dungeon.', category: 'Dungeons', icon: 'boss', points: 20, target: 1, metric: 'rootvault' },
  { id: 'cindercrypt-conqueror', name: 'Cindercrypt Conqueror', description: 'Clear the Cindercrypt dungeon.', category: 'Dungeons', icon: 'boss', points: 25, target: 1, metric: 'cindercrypt' },
  { id: 'frosthollow-conqueror', name: 'Frosthollow Conqueror', description: 'Clear the Frosthollow dungeon.', category: 'Dungeons', icon: 'boss', points: 25, target: 1, metric: 'frosthollow' },
  { id: 'nightroot-conqueror', name: 'Nightroot Conqueror', description: 'Clear the Nightroot dungeon.', category: 'Dungeons', icon: 'boss', points: 30, target: 1, metric: 'nightroot' },
];

/** Old saves credit only retained evidence; unrecorded historical totals cannot be reconstructed. */
export function newAchievements(player?: Partial<Player>): AchievementState {
  const q = player?.quest;
  const completed = CHAPTERS.slice(0, Number.isInteger(q?.chapter) ? q!.chapter : 0);
  const priorObjectives = (kind: string) => completed.reduce((sum, chapter) => sum + chapter.objectives.filter(o => o.kind === kind).reduce((n, o) => n + o.count, 0), 0);
  return {
    unlocked: {}, kills: priorObjectives('kill') + (q?.kills || 0), worldBosses: 0,
    gathered: Math.max(priorObjectives('gather') + (q?.crystals || 0), Object.values(player?.skills || {}).some(xp => xp > 0) ? 1 : 0), crafted: (player?.craftingXp || 0) > 0 ? 1 : 0,
    contracts: Object.keys(player?.contracts?.completed || {}).length,
    zones: player?.characterCreated && ZONES.some(zone => zone.id === player.zone) ? [player.zone!] : [],
    dungeons: player?.contracts?.completed?.['hollow-vault'] || (player?.contracts?.active?.['hollow-vault'] || 0) >= 1 ? { rootvault: 1 } : {},
  };
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;
export function achievementsValid(value: unknown): value is AchievementState {
  return record(value) && Object.keys(value).length === 8
    && ['kills', 'worldBosses', 'gathered', 'crafted', 'contracts'].every(key => integer(value[key]))
    && record(value.unlocked) && Object.entries(value.unlocked).every(([id, at]) => ACHIEVEMENTS.some(a => a.id === id) && integer(at) && (at as number) > 0 && (at as number) <= 8.64e15)
    && Array.isArray(value.zones) && new Set(value.zones).size === value.zones.length && value.zones.every(id => ZONES.some(zone => zone.id === id))
    && record(value.dungeons) && Object.entries(value.dungeons).every(([id, count]) => DUNGEONS.some(dungeon => dungeon.id === id) && integer(count));
}
export function achievementProgress(achievement: AchievementDefinition, player: Player): number {
  if (player.achievements?.unlocked[achievement.id] !== undefined) return achievement.target;
  const state = player.achievements;
  let progress: number;
  switch (achievement.metric) {
    case 'level': progress = player.level; break;
    // Store mounts award permanent achievement points only after their burn finalizes.
    case 'mounts': progress = player.ownedMounts.filter(id => !MOUNTS.find(mount => mount.id === id)?.storeOnly
      || player.storeOrders?.some(order => order.productId === id && order.status === 'delivered')).length; break;
    case 'chapters': progress = player.quest.completed ? CHAPTERS.length : player.quest.chapter; break;
    case 'zones': progress = state?.zones.length || 0; break;
    case 'ports': progress = player.zeppelinPorts?.length || 0; break;
    case 'skill': progress = Math.max(...Object.values(player.skills).map(xp => skillProgress(xp).level)); break;
    case 'kills': case 'worldBosses': case 'gathered': case 'crafted': case 'contracts': progress = state?.[achievement.metric] || 0; break;
    default: progress = state?.dungeons[achievement.metric] || 0;
  }
  return Math.max(0, Math.min(achievement.target, progress));
}
export function achievementPoints(player: Player): number {
  return ACHIEVEMENTS.reduce((total, achievement) => total + (player.achievements?.unlocked[achievement.id] !== undefined ? achievement.points : 0), 0);
}
/** Called only by the realm after accepted gameplay or when loading existing progress. */
export function unlockAchievements(player: Player, now: number): AchievementDefinition[] {
  if (!player.characterCreated || !player.achievements) return [];
  const unlocked = ACHIEVEMENTS.filter(achievement => player.achievements!.unlocked[achievement.id] === undefined && achievementProgress(achievement, player) >= achievement.target);
  for (const achievement of unlocked) player.achievements.unlocked[achievement.id] = now;
  return unlocked;
}
