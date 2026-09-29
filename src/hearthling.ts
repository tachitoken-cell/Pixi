export const HEARTHLING_NPC = {
  id: 'hearthling-npc', name: 'MEADGod', title: 'Keeper of little homes',
  role: 'visitor' as const, zone: 'greenwood' as const,
  x: -24, z: 116, rotation: Math.PI, scale: 4,
};
export const MEADGOD_QUEST_COST = 100_000;
export const MEADGOD_QUEST = {
  title: 'Pons Lover',
  intro: ['Welcome, traveler. I am MEADGod. A fine title deserves a fine tribute.', 'Pay me 100,000 gold to earn the title “Pons Lover”.'],
  complete: 'Your tribute is received. The title “Pons Lover” is yours. Choose it in Achievements to display it beneath your name.',
};
