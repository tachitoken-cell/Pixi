import type { ZoneId } from './content.ts';
import type { SkillId } from './skills.ts';
import type { GearSlot } from './progression.ts';
import { STORY_QUESTS } from './story-quest-data.ts';
export { STORY_QUESTS } from './story-quest-data.ts';

export interface StoryObjective {
  id: string; kind: 'kill' | 'gather' | 'interact' | 'dungeon'; targets: readonly string[];
  count: number; label: string; displayKind?: 'collect'; scope: 'overworld' | 'dungeon';
  zone?: ZoneId; regionId?: string; siteId?: string; dungeonId?: string; minTargetLevel?: number;
  /** Stable enemy or gathering-node IDs and ordered steps are checked against authoritative events. */
  spawnIds?: readonly string[]; requires?: readonly string[];
}
export interface StoryQuest {
  id: string; title: string; zone: ZoneId; requiredLevel: number; npcId: string; turnInNpcId?: string;
  source: { chapter: number; row: number }; requires?: readonly string[]; objectives: readonly StoryObjective[];
  dialogue: { intro: readonly string[]; progress: readonly string[]; complete: readonly string[] };
  /** Gold is a base amount: the server applies the existing contract Gold policy. */
  reward: { xp: number; gold: number; potions?: number; crystal?: number; relic?: number;
    inventory?: Partial<Record<'wood' | 'herb', number>>; items?: Record<string, number>;
    professionXp?: Partial<Record<SkillId, number>>;
    gear?: { quality: 'uncommon' | 'rare'; slots: readonly GearSlot[]; choice?: boolean } };
}
export const STORY_TREASURE_IDS = ['ashbound-treasure', 'veiled-sun-treasure'] as const;
export interface StoryQuestState { active: Record<string, number[]>; completed: string[]; treasures?: (typeof STORY_TREASURE_IDS)[number][] }
export interface StoryQuestPlayer { level: number; storyQuests?: StoryQuestState }
export interface StoryQuestEvent {
  kind: StoryObjective['kind']; target: string; scope: StoryObjective['scope'];
  zone?: ZoneId; regionId?: string; siteId?: string; dungeonId?: string; targetLevel?: number; spawnId?: string; amount?: number;
}
export type StoryQuestPhase = 'offer' | 'progress' | 'complete' | 'reward';
export interface StoryQuestDialogue {
  type: 'storyQuestDialogue'; questId: string; npcId: string; title: string;
  phase: StoryQuestPhase; lines: string[];
  reward?: StoryQuest['reward'];
}
export const MAX_ACTIVE_STORY_QUESTS = 6;
export const storyQuestById = (id: string): StoryQuest | undefined => STORY_QUESTS.find(quest => quest.id === id);
export const newStoryQuests = (): StoryQuestState => ({ active: {}, completed: [] });
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object'
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const nonnegativeInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
export function storyQuestsValid(value: unknown): value is StoryQuestState {
  if (!record(value) || Object.keys(value).some(key => !['active', 'completed', 'treasures'].includes(key))
    || !record(value.active) || !Array.isArray(value.completed)
    || Object.hasOwn(value, 'treasures') && (!Array.isArray(value.treasures) || value.treasures.length < 1
      || value.treasures.length > STORY_TREASURE_IDS.length || new Set(value.treasures).size !== value.treasures.length
      || !value.treasures.every(id => STORY_TREASURE_IDS.includes(id)))
    || value.completed.length > STORY_QUESTS.length || new Set(value.completed).size !== value.completed.length
    || !value.completed.every(id => typeof id === 'string' && !!storyQuestById(id))
    || Object.keys(value.active).length > MAX_ACTIVE_STORY_QUESTS) return false;
  const completed = value.completed as string[];
  if (completed.some(id => storyQuestById(id)!.requires?.some(required => !completed.includes(required)))) return false;
  return Object.entries(value.active).every(([id, progress]) => {
    const quest = storyQuestById(id);
    return quest && !completed.includes(id) && !quest.requires?.some(required => !completed.includes(required))
      && Array.isArray(progress) && progress.length === quest.objectives.length
      && progress.every((count, index) => nonnegativeInteger(count) && count <= quest.objectives[index].count
        && (count === 0 || objectivePrerequisitesMet(quest, progress as number[], quest.objectives[index])));
  });
}
function objectivePrerequisitesMet(quest: StoryQuest, progress: readonly number[], objective: StoryObjective): boolean {
  return !objective.requires?.some(id => {
    const index = quest.objectives.findIndex(step => step.id === id);
    return index < 0 || progress[index] !== quest.objectives[index].count;
  });
}
/** Shared marker visibility and interaction gate; the server still checks quest, instance and proximity. */
export function storyInteractAvailable(state: StoryQuestState | undefined, target: string, questId?: string): boolean {
  if (!storyQuestsValid(state)) return false;
  return Object.entries(state.active).some(([id, progress]) => {
    if (questId && id !== questId) return false;
    const quest = storyQuestById(id)!;
    return quest.objectives.some((objective, index) => objective.kind === 'interact' && objective.targets.includes(target)
      && progress[index] < objective.count && objectivePrerequisitesMet(quest, progress, objective));
  });
}
export function storyQuestAvailable(player: StoryQuestPlayer, quest: StoryQuest): boolean {
  const state = player.storyQuests ?? newStoryQuests();
  return STORY_QUESTS.includes(quest) && storyQuestsValid(state) && Number.isSafeInteger(player.level)
    && player.level >= quest.requiredLevel && !state.completed.includes(quest.id) && !Object.hasOwn(state.active, quest.id)
    && !quest.requires?.some(id => !state.completed.includes(id));
}
export function storyQuestReady(state: StoryQuestState | undefined, id: string): boolean {
  const quest = storyQuestById(id), progress = state?.active[id];
  return !!quest && !!progress && progress.length === quest.objectives.length
    && quest.objectives.every((objective, index) => progress[index] === objective.count);
}
/** Active quests first, followed by available offers; existing campaign and contracts remain separate. */
export function listStoryQuests(player: StoryQuestPlayer, npcId?: string): StoryQuest[] {
  const state = player.storyQuests ?? newStoryQuests();
  if (!storyQuestsValid(state)) return [];
  return STORY_QUESTS.filter(quest => (Object.hasOwn(state.active, quest.id) || storyQuestAvailable(player, quest))
    && (!npcId || (Object.hasOwn(state.active, quest.id) ? quest.turnInNpcId ?? quest.npcId : quest.npcId) === npcId))
    .sort((a, b) => Number(Object.hasOwn(state.active, b.id)) - Number(Object.hasOwn(state.active, a.id))
      || a.requiredLevel - b.requiredLevel || a.source.chapter - b.source.chapter || a.source.row - b.source.row);
}
export function acceptStoryQuest(state: StoryQuestState, id: string, level: number): boolean {
  const quest = storyQuestById(id);
  if (!quest || !storyQuestAvailable({ level, storyQuests: state }, quest)
    || Object.keys(state.active).length >= MAX_ACTIVE_STORY_QUESTS) return false;
  state.active[id] = quest.objectives.map(() => 0);
  return true;
}
export function abandonStoryQuest(state: StoryQuestState, id: string): boolean {
  if (!storyQuestsValid(state) || !Object.hasOwn(state.active, id)) return false;
  delete state.active[id];
  return true;
}
/** Call only from verified server events. Collection samples are quest counters, never tradable inventory. */
export function storyQuestProgress(state: StoryQuestState, event: StoryQuestEvent): boolean {
  const amount = event.amount ?? 1;
  if (!storyQuestsValid(state) || !nonnegativeInteger(amount) || amount === 0 || !event.target) return false;
  let changed = false;
  for (const [id, progress] of Object.entries(state.active)) {
    const quest = storyQuestById(id)!;
    const before = [...progress];
    quest.objectives.forEach((objective, index) => {
      if (objective.kind !== event.kind || objective.scope !== event.scope
        || !objective.targets.includes(event.target) && !objective.targets.includes('*')
        || objective.zone && objective.zone !== event.zone || objective.regionId && objective.regionId !== event.regionId
        || objective.siteId && objective.siteId !== event.siteId
        || objective.spawnIds && (!event.spawnId || !objective.spawnIds.includes(event.spawnId))
        || !objectivePrerequisitesMet(quest, before, objective)
        || objective.dungeonId && objective.dungeonId !== event.dungeonId
        || objective.minTargetLevel !== undefined && (!Number.isSafeInteger(event.targetLevel) || event.targetLevel! < objective.minTargetLevel)) return;
      const next = Math.min(objective.count, progress[index] + amount);
      if (next !== progress[index]) { progress[index] = next; changed = true; }
    });
  }
  return changed;
}
/** Apply only after the server preflights the reward; removing active and recording completed makes retries inert. */
export function claimStoryQuest(state: StoryQuestState, id: string): StoryQuest | undefined {
  if (!storyQuestsValid(state) || !storyQuestReady(state, id)) return;
  const quest = storyQuestById(id)!;
  delete state.active[id];
  state.completed.push(id);
  return quest;
}
