import { CITY_TRAINER_POSITIONS } from './city.ts';
import type { CharacterClass } from './shared.ts';
import type { ZoneId } from './content.ts';
import { REGION_ORIGINS } from './landscape.ts';
import { SPELLS, type AbilityId } from './spells.ts';

export type TrainerRole = 'riding-trainer' | 'mount-seller' | 'ranger-trainer' | 'knight-trainer' | 'mage-trainer' | 'cleric-trainer';
export interface TrainerNPC {
  id: string; name: string; title: string; role: TrainerRole; zone: ZoneId;
  x: number; z: number; rotation: number; className?: CharacterClass;
}

const roles: readonly { role: TrainerRole; title: string; className?: CharacterClass }[] = [
  { role: 'riding-trainer', title: 'Riding trainer' },
  { role: 'mount-seller', title: 'Mount seller' },
  { role: 'ranger-trainer', title: 'Ranger trainer', className: 'Ranger' },
  { role: 'knight-trainer', title: 'Knight trainer', className: 'Knight' },
  { role: 'cleric-trainer', title: 'Cleric trainer', className: 'Cleric' },
  { role: 'mage-trainer', title: 'Mage trainer', className: 'Mage' },
];
const names: Record<ZoneId, readonly string[]> = {
  greenwood: ['Tamsin Reed', 'Bram Oatley', 'Sylva Fletch', 'Garrick Vale', 'Aurelia Dawn', 'Elowen Ash'],
  amberwild: ['Rhea Sunstride', 'Otto Dune', 'Kestrel Flint', 'Darian Cinder', 'Mira Sunwell', 'Azra Ember'],
  frostmarch: ['Freya Snowrein', 'Mikkel Frostmane', 'Neris Whitepine', 'Torren Iceguard', 'Solveig Lightkeep', 'Liora Starfall'],
  hollow: ['Vera Duskride', 'Corin Mossbridle', 'Thalia Shadeleaf', 'Ronan Thorn', 'Seren Kindlight', 'Vesper Rune'],
  sunveil: ['Nadia Sandrein', 'Idris Copperbridle', 'Suri Dunestrider', 'Kamil Sunshield', 'Soraya Dawnwell', 'Amir Glassflame'],
  mistwood: ['Lani Fernrein', 'Mateo Rainbridle', 'Yara Canopywatch', 'Tomas Jadeward', 'Neri Bloomlight', 'Ixara Mistweave'],
};
/** Every city uses the same authored guild halls and stable service spots. */
export const TRAINER_NPCS: readonly TrainerNPC[] = (Object.keys(REGION_ORIGINS) as ZoneId[]).flatMap(zone =>
  roles.map((role, index) => {
    const placement = CITY_TRAINER_POSITIONS[role.role];
    return { ...role, id: `trainer-${zone}-${role.role}`, name: names[zone][index], zone,
      x: REGION_ORIGINS[zone].x + placement.x, z: REGION_ORIGINS[zone].z + placement.z, rotation: 0 };
  }));

export const RIDING_LESSONS = [
  { rank: 1, level: 25, cost: 100, label: 'Apprentice riding' },
  { rank: 2, level: 50, cost: 500, label: 'Expert riding' },
] as const;
export const MOUNT_PRICES = { horse: 75, wolf: 125 } as const;
export function spellTrainingCost(id: AbilityId): number {
  return SPELLS[id].requiredLevel === 1 ? 0 : SPELLS[id].requiredLevel * 5;
}
