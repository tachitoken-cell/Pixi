import type { CharacterClass } from './shared.ts';
import type { RaidProgress, SpecialistCard } from './raid-progression.ts';

// Suspend the current SP classes without migrating away owned cards or saved progression.
export const SPECIALISTS_ENABLED = false;
export function activeSpecialist(progress:RaidProgress|undefined,className:CharacterClass):SpecialistCard|undefined {
  if(!SPECIALISTS_ENABLED)return undefined;
  return progress?.specialists.find(card=>card.id===progress.activeSpecialistId&&!card.sealed&&!card.broken&&card.className===className);
}
