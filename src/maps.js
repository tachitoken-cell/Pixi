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
    ],
    monsters: [{ type: 'jelly', n: 12 }, { type: 'hopper', n: 8 }],
    stones: [-28, -8],
  },
  woods: {
    name: 'Whisperwood', theme: 'woods', size: [80, 92], seed: 21, level: 'Lv. 4-6',
    sky: 0x9cc4b4, fog: [28, 80],
    portals: [
      { id: 'south', edge: 'south', at: 0, to: 'village', toPortal: 'north' },
    ],
    monsters: [{ type: 'shroom', n: 10 }, { type: 'wolf', n: 6 }],
  },
  coast: {
    name: 'Pebble Coast', theme: 'coast', size: [88, 80], seed: 31, level: 'Lv. 4-6',
    sky: 0xa8def8, fog: [45, 120],
    portals: [
      { id: 'west', edge: 'west', at: 8, to: 'fields', toPortal: 'east' },
    ],
    monsters: [{ type: 'crab', n: 9 }, { type: 'bluejelly', n: 6 }],
    stones: [-24, 18],
  },
};

export const START_MAP = 'village';
