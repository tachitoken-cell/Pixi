// Class definitions: colours, hair style, outfit and weapon for each class.
// Adventurer is the starting class (NosTale-style); the four real classes are
// Warrior, Knight, Ranger and Mage.

const SKIN = 0xf3c7a0;

export const CLASSES = {
  adventurer: {
    id: 'adventurer',
    name: 'Adventurer',
    starter: true,
    role: 'Starting class',
    weaponName: 'Wooden Sword',
    desc: 'Every hero begins here: a light traveller with a red scarf. At Job Level 20 the Class Master in Mossvale lets you become a Knight, Ranger or Mage.',
    stats: { hp: 3, mp: 2, atk: 2, def: 2, spd: 3 },
    crit: { rate: 8, dmg: 150 }, // crit chance % and crit damage %
    accent: '#c8483a',
    skin: SKIN,
    eyes: 0x8a4a22,
    hair: { color: 0xa0552e, dark: 0x7d3f22, style: 'messy', seed: 11 },
    shirt: 0xe6d3b3,
    pants: 0x3a3330,
    vest: { color: 0x7a4a2c, trim: null },
    straps: 0x5a3520,
    belt: 0x5c3a24,
    bracer: 0x6a4028, cuff: 0xd2b184, glove: 0x6a4028,
    boot: 0x6e4229, bootCuff: 0xd2b184, sole: 0x3c2618,
    scarf: 0xb8342b,
    backpack: true,
    xStraps: true,
    weapon: 'woodSword',
    stride: 1,
  },
  warrior: {
    id: 'warrior',
    name: 'Warrior',
    role: 'Melee · Damage',
    weaponName: 'Iron Greatsword',
    desc: 'Charges into the fight with a heavy greatsword. High HP and raw strength.',
    stats: { hp: 5, mp: 1, atk: 5, def: 3, spd: 2 },
    crit: { rate: 10, dmg: 170 }, // crit chance % and crit damage %
    accent: '#b5703c',
    skin: SKIN,
    eyes: 0x7a4a26,
    hair: { color: 0x8a4a28, dark: 0x6a3519, style: 'messy', seed: 3 },
    shirt: 0xe6d3b3,
    pants: 0x3b3534,
    vest: { color: 0x6a4028, trim: null },
    straps: 0x4e2e1a,
    belt: 0x5c3a24,
    bracer: 0x6a4028, cuff: 0xd2b184, glove: 0x5e3a22,
    boot: 0x6e4229, bootCuff: 0xd2b184, sole: 0x3c2618,
    weapon: 'greatsword',
    stride: 1,
  },
  knight: {
    id: 'knight',
    name: 'Knight',
    role: 'Tank · Protector',
    weaponName: 'Longsword & Kite Shield',
    desc: 'A sworn defender. Blocks with a kite shield and holds the line for the party.',
    stats: { hp: 5, mp: 2, atk: 3, def: 5, spd: 2 },
    crit: { rate: 6, dmg: 140 }, // crit chance % and crit damage %
    accent: '#4a64b0',
    skin: SKIN,
    eyes: 0x3a6ad8,
    hair: { color: 0xe8cf8a, dark: 0xc9a95e, style: 'swept', seed: 7 },
    shirt: 0xeeeae0,
    pants: 0x3a4a82,
    vest: { color: 0x3d5296, trim: 0xd1a646 },
    tabard: { color: 0x3d5296, trim: 0xd1a646 },
    straps: null,
    belt: 0x5c3a24,
    bracer: 0x6a4028, cuff: 0xd2b184, glove: 0x5a4a46,
    boot: 0x6e4229, bootCuff: 0xd2b184, sole: 0x3c2618,
    weapon: 'swordShield',
    stride: 1,
  },
  ranger: {
    id: 'ranger',
    name: 'Ranger',
    role: 'Ranged · Agility',
    weaponName: 'Oak Longbow',
    desc: 'A forest scout who strikes from afar. Fast feet, sharp eyes, and a full quiver.',
    stats: { hp: 3, mp: 2, atk: 4, def: 2, spd: 5 },
    crit: { rate: 15, dmg: 180 }, // crit chance % and crit damage %
    accent: '#6f8f3c',
    skin: SKIN,
    eyes: 0x4a8a3a,
    hair: { color: 0x7f8a42, dark: 0x5f6a2e, style: 'shaggy', seed: 5 },
    shirt: 0xdcc9a4,
    pants: 0x3a4630,
    tunic: { color: 0x5c7a3a, dark: 0x4a6530 },
    sash: 0x5c3a24,
    belt: 0x5c3a24,
    bracer: 0x6a4028, cuff: 0xd2b184, glove: 0x3f5a36,
    boot: 0x6e4229, bootCuff: 0xd2b184, sole: 0x3c2618,
    weapon: 'bow',
    stride: 1.1,
  },
  mage: {
    id: 'mage',
    name: 'Mage',
    role: 'Magic · Area damage',
    weaponName: 'Amethyst Staff',
    desc: 'Scholar of the arcane. Fragile, but calls down storms of violet fire.',
    stats: { hp: 2, mp: 5, atk: 5, def: 1, spd: 3 },
    crit: { rate: 8, dmg: 160 }, // crit chance % and crit damage %
    accent: '#8a55c8',
    skin: SKIN,
    eyes: 0x7a4ad0,
    hair: { color: 0x8a5cc4, dark: 0x6a3fa3, style: 'tall', seed: 9 },
    shirt: 0xded0ae,
    pants: 0x3a2f4e,
    robe: { color: 0x6b3fa0, dark: 0x55307f, trim: 0xd1a646, panel: 0xe0d2ad, cuff: 0xece2c6 },
    belt: 0x5c3a24,
    bracer: null, cuff: null, glove: SKIN,
    boot: 0x5e5a86, bootCuff: 0x4c3f74, sole: 0x2e2a44,
    weapon: 'staff',
    stride: 0.7,
  },
};

// Adventurer job level at which the Class Master lets you pick one of the three classes.
export const CLASS_CHANGE_LEVEL = 20;

// The Warrior design is kept in this file but is not one of the playable classes right now.
export const CLASS_ORDER = ['adventurer', 'knight', 'ranger', 'mage'];
export const CLASS_CHOICES = ['knight', 'ranger', 'mage'];
