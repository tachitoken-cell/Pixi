// Adventurer skills, unlocked by Job level.
// kind: melee (hits in front), aoe (hits all around), ranged (projectile), buff (self).
export const ADVENTURER_SKILLS = [
  { id: 'swing', mp: 0, name: 'Swing', jobLv: 1, anim: 'attack', cd: 0.7, kind: 'melee', mult: 1.0, range: 2.8,
    icon: ['#a77b4d', '#6b4a2e'], desc: 'Basic melee attack with the wooden sword.' },
  { id: 'slingshot', mp: 0, name: 'Shooting Slingshot', jobLv: 2, anim: 'slingshot', cd: 1.2, kind: 'ranged', mult: 0.9, range: 14, acc: 0.85, ammo: 1,
    icon: ['#8a8a92', '#9a3a2a'], desc: 'Ranged shot with the slingshot. Uses 1 stone.' },
  { id: 'strong', mp: 6, name: 'Strong Hit', jobLv: 4, anim: 'strongHit', cd: 4, kind: 'melee', mult: 1.8, range: 3,
    icon: ['#d0703a', '#6b3a1e'], desc: 'A powerful melee blow with increased damage.' },
  { id: 'target', mp: 5, name: 'Target Shooting', jobLv: 6, anim: 'targetShot', cd: 5, kind: 'ranged', mult: 1.5, range: 16, acc: 1.2, ammo: 1,
    icon: ['#e8c64a', '#8a8a92'], desc: 'An aimed slingshot shot with a higher hit chance. Uses 1 stone.' },
  { id: 'energy', mp: 12, name: 'Energy Bolt', jobLv: 8, anim: 'energyBolt', cd: 6, kind: 'ranged', mult: 2.0, range: 12, acc: 1, magic: true,
    icon: ['#6ec8ff', '#2a5aa0'], desc: 'A magic attack that deals elemental damage.' },
  { id: 'spin', mp: 10, name: 'Spinning Hit', jobLv: 10, anim: 'skill', cd: 8, kind: 'aoe', mult: 1.6, range: 3.2,
    icon: ['#f2e2b0', '#a77b4d'], desc: 'A spinning physical attack that hits every enemy nearby.' },
  { id: 'combat', mp: 15, name: 'Shout of Combat', jobLv: 12, anim: 'shoutCombat', cd: 30, kind: 'buff', buff: 'atk',
    icon: ['#e04a3a', '#7a1e18'], desc: 'Self buff: attack power +30% for 20 seconds.' },
  { id: 'beatup', mp: 14, name: 'Beat Up', jobLv: 15, anim: 'beatUp', cd: 10, kind: 'melee', mult: 1.3, range: 3,
    icon: ['#c8483a', '#f2c46a'], desc: 'A strong melee combo of three hits.' },
  { id: 'morale', mp: 15, name: 'Shout of Morale', jobLv: 17, anim: 'shoutMorale', cd: 30, kind: 'buff', buff: 'def',
    icon: ['#4a8ae0', '#1e3a7a'], desc: 'Self buff: defence +30% and hit chance +15% for 20 seconds.' },
  { id: 'charge', mp: 12, name: 'Charging Attack', jobLv: 19, anim: 'chargeAttack', cd: 12, kind: 'melee', mult: 2.2, range: 3, dash: 10,
    icon: ['#f2a63a', '#7a4a1e'], desc: 'A fast rush that carries you straight to the enemy, then strikes.' },
];

// Skills of the three classes the Adventurer can become at Job Lv. 20. These are placeholders
// (a basic attack and one special each) until the full class skill lists are designed.
export const CLASS_SKILLS = {
  adventurer: ADVENTURER_SKILLS,
  knight: [
    { id: 'k_slash', mp: 0, name: 'Sword Slash', jobLv: 1, anim: 'attack', cd: 0.8, kind: 'melee', mult: 1.3, range: 2.8,
      icon: ['#4a64b0', '#23305a'], desc: 'A sword thrust. (Placeholder until the Knight skills are designed.)' },
    { id: 'k_guard', mp: 12, name: 'Shield Guard', jobLv: 1, anim: 'skill', cd: 25, kind: 'buff', buff: 'def',
      icon: ['#d1a646', '#4a64b0'], desc: 'Raise the shield: defence +30% and hit chance +15% for 20 seconds. (Placeholder)' },
  ],
  ranger: [
    { id: 'r_shot', mp: 0, name: 'Bow Shot', jobLv: 1, anim: 'attack', cd: 1.0, kind: 'ranged', mult: 1.2, range: 16, acc: 0.95,
      icon: ['#6f8f3c', '#3a4a1e'], desc: 'An arrow from the longbow. (Placeholder until the Ranger skills are designed.)' },
    { id: 'r_rain', mp: 12, name: 'Arrow Rain', jobLv: 1, anim: 'skill', cd: 10, kind: 'aoe', mult: 1.4, range: 4, reach: 12,
      icon: ['#b8e070', '#3a4a1e'], desc: 'A volley that rains down on the target and everything near it. (Placeholder)' },
  ],
  mage: [
    { id: 'm_bolt', mp: 4, name: 'Arcane Bolt', jobLv: 1, anim: 'attack', cd: 1.1, kind: 'ranged', mult: 1.4, range: 12, acc: 1, magic: true,
      icon: ['#8a55c8', '#3a1e5a'], desc: 'A bolt of violet magic. (Placeholder until the Mage skills are designed.)' },
    { id: 'm_nova', mp: 16, name: 'Arcane Nova', jobLv: 1, anim: 'skill', cd: 10, kind: 'aoe', mult: 1.8, range: 4.6, magic: true,
      icon: ['#e0b8ff', '#5a2e8a'], desc: 'A burst of magic that hits every enemy around you. (Placeholder)' },
  ],
};

export const MAX_LEVEL = 70;                                   // main (XP) level cap
export const MAX_JOB = { adventurer: 20, knight: 20, ranger: 20, mage: 20 }; // class caps are placeholders
export const CLASS_CHANGE_JOB = 20;                             // Adventurer job level needed to pick a class
export const MAX_JOB_LV = 20;
export const BUFF_TIME = 20;
export const MAX_STONES = 40;
export const jobXpNeeded = (lv) => 30 + lv * 20;
