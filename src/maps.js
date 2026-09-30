// World layout: maps connected by portals at their edges (NosTale style).
// Portal `edge` places it on that side of the map; `at` is the offset along that edge.
// Arriving through a portal puts you just inside the matching portal on the other map.
export const MAPS = {
  // Mossvale: the home town. Cross streets from the gates, a ring road and side streets with houses
  // along them; market street east of the plaza, town hall, inn, smithy and chapel around the plaza,
  // a farm in the north-east and a park in the south-east.
  village: {
    name: 'Mossvale', theme: 'village', size: [168, 168], seed: 3, safe: true,
    sky: 0xa8d4f4, fog: [70, 170],
    portals: [
      { id: 'east', edge: 'east', at: 0, to: 'fields', toPortal: 'west' },
      { id: 'north', edge: 'north', at: 0, to: 'woods', toPortal: 'south' },
      { id: 'south', edge: 'south', at: 0, to: 'miniland', toPortal: 'exit' },
      { id: 'west', edge: 'west', at: 0, to: 'brookhollow', toPortal: 'east' },
    ],
    monsters: [{ type: 'dummy', at: [10, -10] }],
    stones: [-9, 10],
    town: {
      plaza: 14,
      streets: [
        [[-72, 0], [72, 0]], [[0, -72], [0, 72]],
        [[-42, -42], [42, -42], [42, 42], [-42, 42], [-42, -42]],
        [[-42, -21], [-70, -21]], [[-42, 21], [-70, 21]], [[42, 21], [70, 21]], [[-21, 42], [-21, 70]], [[21, -42], [21, -70]],
      ],
      reserve: [[15, -9, 38, 9], [-35, -35, -13, -13], [13, -35, 35, -13], [-35, 13, -13, 35], [13, 13, 35, 35], [44, -74, 74, -44], [44, 44, 74, 74]],
      fixedHouses: [[-24, -24, 4, 0, 2.0], [24, -24, 2, 0, 1.7], [-24, 24, 1, Math.PI, 1.5], [24, 24, 3, Math.PI, 1.6]],
      props: [
        ['mtent', 19, -6, { v: 0 }], ['mtent', 27, -6, { v: 1 }], ['mtent', 35, -6, { v: 2 }],
        ['mtent', 19, 6, { v: 3, ry: Math.PI }], ['mtent', 27, 6, { v: 0, ry: Math.PI }], ['mtent', 35, 6, { v: 1, ry: Math.PI }],
        ['ml_statue', -8, -8, { scale: 1.8 }], ['ml_bench', 9, 9, { ry: -0.8 }], ['ml_bench', -9, 9, { ry: 0.8 }],
        ['anvil', -17, 21, { scale: 1.3 }], ['barrel', -16, 25, { scale: 1.2 }], ['crate', -16, 27, { scale: 1.3 }],
        ['ml_windmill', 66, -66, { scale: 2.4 }], ['ml_well', 58, 58, { scale: 1.3 }],
        ['barrel', 16, -17, { scale: 1.2 }], ['barrel', 17, -16, { scale: 1.2 }], ['stall', -8, 18, { scale: 1.3 }],
      ],
      farms: [[46, -72, 72, -46]],
      parks: [[58, 58, 12]],
      npcs: [
        ['elder', 'Elder Moss', [5, 5], 'Welcome to Mossvale! Beyond the gates: Clover Fields (east), Whisperwood (north), Brookhollow (west). Your Miniland gate is south.'],
        ['master', 'Class Master Oren', [-5, 6], 'At Job Level 20 I can guide you onto a new path: Knight, Ranger or Mage.'],
        ['mimi', 'Mimi Mentor', [19, -2], 'Tents, chests, carpets, minigames… everything for your Miniland! Open the menu with L.', { shop: 'miniland', ry: 0 }],
        ['malcolm', 'Malcolm Mix', [27, -2], 'A Bell of Sweet Home takes you to your Miniland from anywhere, and back again.', { shop: 'bells', ry: 0 }],
        ['gerta', 'Gerta the Trader', [35, 2], 'Stone, timber, fish, feathers: I buy all the materials your minigames produce.', { shop: 'materials' }],
        ['merchant', 'Merchant Tilly', [30, 10], 'Fresh apples! The stone pile by the fountain has free slingshot stones.'],
        ['guard', 'Guard Bram', [66, 6], 'Clover Fields lies east. Jellies and Hoppers: easy prey for a new Adventurer.', { ry: -Math.PI / 2 }],
        ['guard', 'Guard Hilda', [6, -66], 'North is the Whisperwood. Wolves bite hard, and the caves beyond are worse.', { ry: 0 }],
        ['guard', 'Guard Tobin', [-66, -6], 'The road west leads to Brookhollow, our farming village.', { ry: Math.PI / 2 }],
        ['noble', 'Mayor Aldwin', [-24, -14], 'Mossvale has grown five times over! We owe it to adventurers like you.'],
        ['innkeeper', 'Innkeeper Rosa', [24, -14], 'Sit down anywhere to rest and heal. My stew is the best in the realm!'],
        ['smith', 'Blacksmith Doran', [-19, 18], 'Four dungeons lie around Mossvale. Each hides a boss; bring Saat.'],
        ['priestess', 'Priestess Liora', [24, 15], 'When you fall, Saat lets you rise where you stand. Five of them, once every few minutes.'],
        ['farmer', 'Farmer Hobb', [58, -58], 'Wheat, cabbages and one very lazy windmill.', { wander: 8 }],
        ['kid', 'Pip', [-10, 14], 'Have you seen a dachshund? He is SO cute!', { small: true, wander: 10 }],
        ['kid', 'Lina', [12, -14], 'I want a Miniland with a windmill when I grow up!', { small: true, wander: 10 }],
        ['bard', 'Felix the Bard', [-12, -2], 'Every map has its own song. Listen closely in the dungeons…', { ry: Math.PI / 2 }],
        ['villager', 'Old Maud', [56, 50], 'The park is lovely at noon. Mind the ducks, dear.', { wander: 5 }],
        ['fisher', 'Traveller Sable', [-60, 4], 'I just came from Saltmere, a fishing village north of Pebble Coast.'],
        ['lumberjack', 'Woodsman Egon', [-2, -58], 'Pinecrest, the lumber village, lies west of the Whisperwood.', { wander: 6 }],
      ],
    },
  },
  // Brookhollow: a farming village west of Mossvale
  brookhollow: {
    name: 'Brookhollow', theme: 'village', size: [112, 112], seed: 113, safe: true,
    sky: 0xb0dcf8, fog: [60, 140],
    portals: [{ id: 'east', edge: 'east', at: 0, to: 'village', toPortal: 'west' }],
    town: {
      plaza: 9, fountain: false, well: true, houseSpacing: 14,
      streets: [[[-46, 0], [46, 0]], [[0, -46], [0, 46]]],
      reserve: [[-47, -47, -12, -12], [12, -47, 47, -12], [-47, 12, -12, 47]],
      farms: [[-44, -44, -14, -14], [14, -44, 44, -14], [-44, 14, -14, 44]],
      props: [['ml_windmill', 30, 30, { scale: 2.6 }], ['haybale', 22, 24], ['haybale', 24, 20], ['logpile', 36, 22, { ry: 1.2 }], ['mtent', -6, 12, { v: 2, ry: Math.PI }]],
      scatter: [['oak', 14, { variants: 4, scale: 1.1 }], ['bush', 10]],
      npcs: [
        ['farmer', 'Farmer Greta', [4, -4], 'Welcome to Brookhollow! Our wheat feeds all of Mossvale.'],
        ['farmer', 'Farmer Ben', [-28, -28], 'Hoppers keep eating my cabbages…', { wander: 9 }],
        ['farmer', 'Miller Anton', [27, 27], 'The windmill grinds flour for the whole valley.', { wander: 4 }],
        ['kid', 'Rosie', [6, 6], 'I can outrun a Hopper! Well… almost.', { small: true, wander: 8 }],
        ['gerta', 'Trader Wilma', [-6, 8], 'I buy materials too, same prices as Gerta in Mossvale.', { shop: 'materials' }],
        ['villager', 'Old Jonas', [-24, 24], 'I have lived here eighty summers. Mossvale used to be tiny, you know.', { wander: 6 }],
      ],
    },
  },
  // Pinecrest: a lumber village west of the Whisperwood, log cabins and a big sawmill
  pinecrest: {
    name: 'Pinecrest', theme: 'woods', size: [112, 112], seed: 127, safe: true, music: 'woods',
    sky: 0x9cc4b4, fog: [40, 110],
    portals: [{ id: 'east', edge: 'east', at: 0, to: 'woods', toPortal: 'west' }],
    town: {
      plaza: 9, fountain: false, well: true, houseKind: 'ml_cabin', houseScale: 1.6, houseSpacing: 15, houseOffset: 10,
      streets: [[[-46, 0], [46, 0]], [[-20, -40], [-20, 40]], [[20, -40], [20, 40]]],
      reserve: [[-12, -34, 12, -14]],
      props: [['ml_sawmill', 0, -24, { scale: 1.9 }], ['logpile', -8, -14, { ry: 0.2 }], ['logpile', 9, -15, { ry: -0.3 }], ['logpile', 32, 24], ['logpile', -32, -26, { ry: 1.4 }]],
      scatter: [['pine', 40, { variants: 4, scale: 1.1 }], ['bush', 14], ['rock', 10]], treeKind: 'pine',
      npcs: [
        ['lumberjack', 'Chief Bjorn', [4, -4], 'Pinecrest timber builds every house in Mossvale. Mind the sawmill!'],
        ['lumberjack', 'Axel', [-4, -20], 'Timber, Hardwood, Amber Resin… a Sawmill in your Miniland makes all three.', { wander: 5 }],
        ['lumberjack', 'Hanna', [24, 18], 'The Mossy Cavern is east of the Whisperwood. Cave slimes, ugh.', { wander: 8 }],
        ['mimi', 'Carpenter Ivo', [-8, 6], 'Mimi in Mossvale sells my furniture. I only build it.', { shop: 'miniland' }],
        ['kid', 'Finn', [10, 8], 'I climbed the tallest pine yesterday!', { small: true, wander: 9 }],
        ['guard', 'Ranger Wren', [40, 4], 'Whisperwood lies east. Stay on the path.', { ry: -Math.PI / 2 }],
      ],
    },
  },
  // Saltmere: a fishing village north of Pebble Coast, open sea to the east
  saltmere: {
    name: 'Saltmere', theme: 'coast', size: [112, 100], seed: 139, safe: true, music: 'coast',
    sky: 0xa8def8, fog: [60, 140],
    portals: [{ id: 'south', edge: 'south', at: -10, to: 'coast', toPortal: 'north' }],
    town: {
      plaza: 9, fountain: false, well: true, houseSpacing: 14,
      streets: [[[-46, 0], [22, 0]], [[-20, -38], [-20, 38]], [[4, -38], [4, 38]]],
      props: [['pier', 38, -12, { ry: Math.PI / 2 }], ['pier', 38, 14, { ry: Math.PI / 2 }], ['boat', 44, -4, { ry: 1.6 }], ['boat', 46, 22, { ry: 1.4 }],
        ['barrel', 26, -12], ['crate', 27, -10], ['mtent', 14, -10, { v: 1 }]],
      scatter: [['palm', 16, { types: ['sand'], variants: 3, scale: 1.1 }], ['oak', 10, { variants: 4 }], ['rock', 12, { types: ['grass', 'sand'] }]],
      npcs: [
        ['fisher', 'Captain Mara', [4, -4], 'Saltmere fishers sail at dawn. Pebble Coast is south of here.'],
        ['fisher', 'Old Salt Ned', [30, -12], 'A Fish Pond in your Miniland gives Carp, Mackerel and sometimes a Pearl.', { wander: 4 }],
        ['fisher', 'Nadia', [30, 14], 'Deep jellies live in the Sunken Grotto, south of Pebble Coast.', { wander: 5 }],
        ['gerta', 'Fishmonger Lotte', [14, -4], 'Fresh fish! And I buy materials, same as Gerta.', { shop: 'materials' }],
        ['malcolm', 'Bellmaker Otto', [-8, 6], 'Bells of Sweet Home, fresh from the foundry.', { shop: 'bells' }],
        ['kid', 'Moss', [-6, -8], 'I found a crab in my boot this morning!', { small: true, wander: 9 }],
      ],
    },
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
      { id: 'west', edge: 'west', at: 4, to: 'pinecrest', toPortal: 'east' },
    ],
    monsters: [{ type: 'shroom', n: 10 }, { type: 'wolf', n: 6 }],
  },
  coast: {
    name: 'Pebble Coast', theme: 'coast', size: [88, 80], seed: 31, level: 'Lv. 4-6',
    sky: 0xa8def8, fog: [45, 120],
    portals: [
      { id: 'west', edge: 'west', at: 8, to: 'fields', toPortal: 'east' },
      { id: 'south', edge: 'south', at: -14, to: 'grotto', toPortal: 'north' },
      { id: 'north', edge: 'north', at: -10, to: 'saltmere', toPortal: 'south' },
    ],
    monsters: [{ type: 'crab', n: 9 }, { type: 'bluejelly', n: 6 }],
    stones: [-24, 18],
  },

  // ---- your Miniland (see miniland.js); its exit gate leads back to where you came from
  miniland: {
    name: 'Miniland', theme: 'miniland', miniland: true, safe: true, size: [52, 52], seed: 97,
    // NosTale-style zones: [x0, z0, x1, z1]; everything else inside the fence is the Garden
    zones: { terrace: [-10, -15.5, 10, -7], production: [5, -3, 15.5, 12] },
    sky: 0xa8d8f8, fog: [40, 100],
    portals: [{ id: 'exit', edge: 'south', at: 0, to: 'back' }],
    monsters: [],
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
