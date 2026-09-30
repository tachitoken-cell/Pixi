// World layout: maps connected by portals at their edges (NosTale style).
// Portal `edge` places it on that side of the map; `at` is the offset along that edge.
// Arriving through a portal puts you just inside the matching portal on the other map.
export const MAPS = {
  village: {
    name: 'Mossvale Village', theme: 'village', size: [72, 72], seed: 3, safe: true,
    sky: 0xa8d4f4, fog: [45, 110],
    portals: [
      { id: 'east', edge: 'east', at: 0, to: 'fields', toPortal: 'west' },
      { id: 'north', edge: 'north', at: 0, to: 'woods', toPortal: 'south' },
    ],
    monsters: [{ type: 'dummy', at: [7, -7] }],
    stones: [-6, 7],
  },
  fields: {
    name: 'Clover Fields', theme: 'fields', size: [92, 80], seed: 11, level: 'Lv. 1-3',
    sky: 0xb0dcf8, fog: [45, 115],
    portals: [
      { id: 'west', edge: 'west', at: 0, to: 'village', toPortal: 'east' },
      { id: 'east', edge: 'east', at: 8, to: 'coast', toPortal: 'west' },
      { id: 'south', edge: 'south', at: 10, to: 'crypt', toPortal: 'north' },
    ],
    monsters: [{ type: 'jelly', n: 12 }, { type: 'hopper', n: 8 }],
    stones: [-28, -8],
  },
  woods: {
    name: 'Whisperwood', theme: 'woods', size: [80, 92], seed: 21, level: 'Lv. 4-6',
    sky: 0x9cc4b4, fog: [28, 80],
    portals: [
      { id: 'south', edge: 'south', at: 0, to: 'village', toPortal: 'north' },
      { id: 'east', edge: 'east', at: -6, to: 'cavern', toPortal: 'west' },
      { id: 'north', edge: 'north', at: 6, to: 'frost', toPortal: 'south' },
    ],
    monsters: [{ type: 'shroom', n: 10 }, { type: 'wolf', n: 6 }],
  },
  coast: {
    name: 'Pebble Coast', theme: 'coast', size: [88, 80], seed: 31, level: 'Lv. 4-6',
    sky: 0xa8def8, fog: [45, 120],
    portals: [
      { id: 'west', edge: 'west', at: 8, to: 'fields', toPortal: 'east' },
      { id: 'south', edge: 'south', at: -14, to: 'grotto', toPortal: 'north' },
    ],
    monsters: [{ type: 'crab', n: 9 }, { type: 'bluejelly', n: 6 }],
    stones: [-24, 18],
  },

  // ---- dungeons: darker enclosed maps with a boss at the far end (dungeon: true)
  cavern: {
    name: 'Mossy Cavern', theme: 'cave', dungeon: true, size: [60, 84], seed: 41, level: 'Dungeon · Lv. 6-9',
    sky: 0x241e30, fog: [14, 50],
    portals: [{ id: 'west', edge: 'west', at: -22, to: 'woods', toPortal: 'east' }],
    monsters: [{ type: 'caveslime', n: 10 }, { type: 'stonecrab', n: 6 }, { type: 'cavernking', at: [8, 26] }],
  },
  grotto: {
    name: 'Sunken Grotto', theme: 'grotto', dungeon: true, size: [76, 72], seed: 53, level: 'Dungeon · Lv. 7-10',
    sky: 0x10283a, fog: [14, 50],
    portals: [{ id: 'north', edge: 'north', at: -20, to: 'coast', toPortal: 'south' }],
    monsters: [{ type: 'deepjelly', n: 10 }, { type: 'tidecrab', n: 7 }, { type: 'crabqueen', at: [20, 20] }],
  },
  crypt: {
    name: 'Old Crypt', theme: 'crypt', dungeon: true, size: [64, 80], seed: 67, level: 'Dungeon · Lv. 9-12',
    sky: 0x241f2c, fog: [12, 48],
    portals: [{ id: 'north', edge: 'north', at: 0, to: 'fields', toPortal: 'south' }],
    monsters: [{ type: 'cryptshroom', n: 10 }, { type: 'ghostwolf', n: 6 }, { type: 'lichshroom', at: [0, 26] }],
  },
  frost: {
    name: 'Frost Hollow', theme: 'frost', dungeon: true, size: [72, 84], seed: 79, level: 'Dungeon · Lv. 11-14',
    sky: 0x9cb4cc, fog: [16, 58],
    portals: [{ id: 'south', edge: 'south', at: 0, to: 'woods', toPortal: 'north' }],
    monsters: [{ type: 'frostjelly', n: 10 }, { type: 'snowwolf', n: 7 }, { type: 'frostalpha', at: [0, -26] }],
  },
};

export const START_MAP = 'village';
