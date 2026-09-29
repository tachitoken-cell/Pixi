import type { Player } from './shared.ts';
import { SPELLS } from './spells.ts';

export interface OnboardingState {
  version: 1;
  looted: boolean;
  bagViewed: boolean;
  gearViewed: boolean;
  completed: boolean;
}
export type OnboardingPlayer = Pick<Player, 'gold' | 'level' | 'quest' | 'appearance' | 'learnedSpells' | 'contracts' | 'skills'> & { onboarding?: OnboardingState };
export type OnboardingFeature = 'bag' | 'gear' | 'professions' | 'spells' | 'crafting' | 'contracts' | 'party' | 'dungeon' | 'talents' | 'auction' | 'mounts';
export type OnboardingStepId = 'meet-rowan' | 'first-kill' | 'loot' | 'bag' | 'gear' | 'gather-crystals' | 'finish-hunt' | 'return-rowan' | 'train-spell' | 'accept-contract';
export interface OnboardingStep {
  id: OnboardingStepId;
  title: string;
  description: string;
  hint: string;
  index: number;
  total: number;
  action?: 'bag' | 'gear';
}
export const newOnboarding = (): OnboardingState => ({ version: 1, looted: false, bagViewed: false, gearViewed: false, completed: false });
export function onboardingValid(value: unknown): value is OnboardingState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  return Object.keys(state).length === 5 && state.version === 1
    && ['looted', 'bagViewed', 'gearViewed', 'completed'].every(key => typeof state[key] === 'boolean')
    && (!state.gearViewed || state.bagViewed === true && state.looted === true)
    && (!state.completed || state.gearViewed === true);
}
const turnedIn = (player: OnboardingPlayer) => player.quest.chapter > 0 || player.quest.completed;
const killed = (player: OnboardingPlayer) => turnedIn(player) || (player.quest.progress['grove-slimes'] ?? 0) > 0;
const gathered = (player: OnboardingPlayer) => turnedIn(player) || Object.values(player.skills).some(xp => xp > 0) || (player.quest.progress['grove-crystals'] ?? 0) > 0;
const trained = (player: OnboardingPlayer) => player.learnedSpells.some(id => SPELLS[id]?.className === player.appearance.className && SPELLS[id].requiredLevel === 2);
const lessonsDone = (player: OnboardingPlayer) => !!player.onboarding?.looted && !!player.onboarding.bagViewed && !!player.onboarding.gearViewed;

/** Missing state belongs to an existing character; a new character always receives explicit state. */
export function onboardingFeatureUnlocked(player: OnboardingPlayer, feature: OnboardingFeature): boolean {
  if (player.onboarding === undefined) return true;
  if (!onboardingValid(player.onboarding)) return false;
  if (feature === 'talents') return player.level >= 5;
  if (feature === 'auction') return player.level >= 10;
  if (feature === 'mounts') return player.level >= 25;
  if (player.onboarding.completed) return true;
  switch (feature) {
    case 'bag': return killed(player);
    case 'gear': return player.onboarding.looted;
    case 'professions': return gathered(player);
    case 'spells': return turnedIn(player);
    case 'crafting': return trained(player);
    case 'contracts': return turnedIn(player);
    case 'party': case 'dungeon': return false;
  }
}
const LOCK_REASONS: Record<OnboardingFeature, string> = {
  bag: 'Defeat your first woodland slime to unlock your backpack.',
  gear: 'Loot a defeated monster to unlock your character and gear.',
  professions: 'Gather your first resource to unlock professions.',
  spells: 'Finish Rowan’s first quest to unlock your spellbook and class training.',
  crafting: 'Learn your level 2 spell from your class trainer to unlock crafting.',
  contracts: 'Finish Rowan’s first quest to unlock adventure contracts.',
  party: 'Complete your beginner journey to unlock parties.',
  dungeon: 'Complete your beginner journey to unlock dungeons.',
  talents: 'Reach level 5 to unlock the Skill Tree. Your earned points will be waiting.',
  auction: 'Reach level 10 to unlock the auction house.',
  mounts: 'Reach level 25 to learn riding and buy a mount.',
};
export function onboardingLockReason(player: OnboardingPlayer, feature: OnboardingFeature): string {
  return onboardingFeatureUnlocked(player, feature) ? '' : player.onboarding !== undefined && !onboardingValid(player.onboarding)
    ? 'Reconnect to restore your beginner journey.' : LOCK_REASONS[feature];
}
const LESSONS: readonly Omit<OnboardingStep, 'index' | 'total'>[] = [
  { id: 'meet-rowan', title: 'Welcome to Lanternreach', description: 'Meet Rowan inside the town hall beneath the clock tower.', hint: 'WASD to move. Right-click Rowan, or press E nearby.' },
  { id: 'first-kill', title: 'Protect the woodland', description: 'Follow the west road and defeat one woodland slime.', hint: 'Right-click a slime to auto attack. Use 1 for your first spell.' },
  { id: 'loot', title: 'Claim your spoils', description: 'Return to a defeated monster and collect something from its remains.', hint: 'Right-click the remains, then choose an item or Loot all.' },
  { id: 'bag', title: 'A place for your finds', description: 'Open your profile inventory to see your backpack and collected items.', hint: 'Press B to open your profile. Select an item to see its details.', action: 'bag' },
  { id: 'gear', title: 'Know your equipment', description: 'Select your equipped weapon or armor beside your character to inspect it.', hint: 'Keep your profile open to view your gear and backpack together. Press C if it is closed.', action: 'gear' },
  { id: 'gather-crystals', title: 'Light for the lantern', description: 'Gather three grove crystals for Rowan.', hint: 'Right-click a crystal, or stand beside it and press E.' },
  { id: 'finish-hunt', title: 'Quiet the grove', description: 'Defeat three woodland slimes in total for Rowan.', hint: 'Follow the arrow to a living slime.' },
  { id: 'return-rowan', title: 'Bring the light home', description: 'Return to Rowan in the town hall and collect your quest reward.', hint: 'Speak to Rowan to finish the quest and reach level 2.' },
  { id: 'train-spell', title: 'Learn your next ability', description: 'Visit your class trainer and learn your level 2 spell for 10 gold.', hint: 'Open the spellbook with K afterward.' },
  { id: 'accept-contract', title: 'Choose your next adventure', description: 'Accept a Greenwood contract from the quest board to finish your beginner journey.', hint: 'The quest board is in the town square. Completing the journey unlocks parties and dungeons.' },
];
function lesson(index: number, player: OnboardingPlayer): OnboardingStep {
  const entry = { ...LESSONS[index], index: index + 1, total: LESSONS.length };
  if (entry.id === 'gather-crystals') entry.description = `Gather grove crystals for Rowan · ${Math.min(3, player.quest.progress['grove-crystals'] ?? 0)} / 3.`;
  if (entry.id === 'train-spell' && player.gold < 10) { entry.description = 'Your next spell costs 10 gold. Sell unwanted finds to a merchant or complete a Greenwood contract, then visit your trainer.'; entry.hint = 'Press J for contracts, or sell your loot at a merchant.'; }
  if (entry.id === 'finish-hunt') entry.description = `Defeat woodland slimes for Rowan · ${Math.min(3, player.quest.progress['grove-slimes'] ?? 0)} / 3.`;
  return entry;
}
export function getOnboardingStep(player: OnboardingPlayer): OnboardingStep | null {
  const state = player.onboarding;
  if (state === undefined) return null;
  if (!onboardingValid(state)) return { ...lesson(0, player), description: 'Reconnect to restore your beginner journey.', hint: '' };
  if (state.completed) return null;
  if (!turnedIn(player) && player.quest.stage === 0) return lesson(0, player);
  if (!killed(player)) return lesson(1, player);
  if (!state.looted) return lesson(2, player);
  if (!state.bagViewed) return lesson(3, player);
  if (!state.gearViewed) return lesson(4, player);
  if (!turnedIn(player) && (player.quest.progress['grove-crystals'] ?? 0) < 3) return lesson(5, player);
  if (!turnedIn(player) && (player.quest.progress['grove-slimes'] ?? 0) < 3) return lesson(6, player);
  if (!turnedIn(player)) return lesson(7, player);
  if (!trained(player)) return lesson(8, player);
  return lesson(9, player);
}
/** Call after an authoritative lesson/contract/view update; early contracts count once the other lessons are done. */
export function onboardingCanComplete(player: OnboardingPlayer): boolean {
  return player.onboarding !== undefined && onboardingValid(player.onboarding) && !player.onboarding.completed
    && turnedIn(player) && trained(player) && lessonsDone(player)
    && (Object.keys(player.contracts.active).length > 0 || Object.keys(player.contracts.completed).length > 0);
}
