import type { EnemyKind, ZoneId } from './content.ts';

/** Explicit current-realm coordinates, verified with the same collision and terrain as the server. */
export interface StoryObject { id: string; name: string; zone: ZoneId; x: number; z: number; kind: 'pack' | 'marker' | 'lantern' | 'tree' | 'seal' | 'bell' | 'crate' | 'shrine' | 'npc'; questId: string; requires?: readonly string[]; regionId?: string }
export interface StoryEnemy { id: string; kind: EnemyKind; level: number; zone: ZoneId; x: number; z: number; name?: string; elite?: boolean; questId?: string }
export interface StoryEncounter { id: string; questId: string; zone: ZoneId; objectId: string; route?: readonly { x: number; z: number }[]; waves: readonly (readonly { kind: EnemyKind; count: number; level: number }[])[] }
export const STORY_OBJECTS: readonly StoryObject[] = [
  {
    "id": "story-abandoned-pack",
    "name": "Inspect the abandoned pack at the old Greenwood camp",
    "zone": "greenwood",
    "x": -50,
    "z": 120,
    "kind": "pack",
    "questId": "story-the-old-campfire",
    "regionId": "pinewake"
  },
  {
    "id": "story-whisper-stone-1",
    "name": "Inspect marked stone 1",
    "zone": "greenwood",
    "x": -530,
    "z": 466,
    "kind": "marker",
    "questId": "story-whispers-from-the-isles",
    "regionId": "whisper"
  },
  {
    "id": "story-whisper-stone-2",
    "name": "Inspect marked stone 2",
    "zone": "greenwood",
    "x": -498,
    "z": 492,
    "kind": "marker",
    "questId": "story-whispers-from-the-isles",
    "regionId": "whisper"
  },
  {
    "id": "story-whisper-stone-3",
    "name": "Inspect marked stone 3",
    "zone": "greenwood",
    "x": -510,
    "z": 542,
    "kind": "marker",
    "questId": "story-whispers-from-the-isles",
    "regionId": "whisper"
  },
  {
    "id": "story-survey-marker-1",
    "name": "Inspect survey marker 1",
    "zone": "amberwild",
    "x": -554,
    "z": -348,
    "kind": "marker",
    "questId": "story-the-missing-surveyor",
    "regionId": "redleaf"
  },
  {
    "id": "story-survey-marker-2",
    "name": "Inspect survey marker 2",
    "zone": "amberwild",
    "x": -534,
    "z": -380,
    "kind": "marker",
    "questId": "story-the-missing-surveyor",
    "regionId": "redleaf"
  },
  {
    "id": "story-survey-marker-3",
    "name": "Inspect survey marker 3",
    "zone": "amberwild",
    "x": -488,
    "z": -376,
    "kind": "marker",
    "questId": "story-the-missing-surveyor",
    "regionId": "redleaf"
  },
  {
    "id": "story-surveyor-camp",
    "name": "Locate the surveyor’s abandoned camp",
    "zone": "amberwild",
    "x": -483,
    "z": -345,
    "kind": "pack",
    "questId": "story-the-missing-surveyor",
    "requires": [
      "story-survey-marker-1",
      "story-survey-marker-2",
      "story-survey-marker-3"
    ],
    "regionId": "redleaf"
  },
  {
    "id": "story-sunscar-crate-1",
    "name": "Recover cargo crate 1",
    "zone": "amberwild",
    "x": -520,
    "z": -636,
    "kind": "crate",
    "questId": "story-sunscar-wreckage",
    "regionId": "sunscar"
  },
  {
    "id": "story-sunscar-crate-2",
    "name": "Recover cargo crate 2",
    "zone": "amberwild",
    "x": -488,
    "z": -644,
    "kind": "crate",
    "questId": "story-sunscar-wreckage",
    "regionId": "sunscar"
  },
  {
    "id": "story-sunscar-crate-3",
    "name": "Recover cargo crate 3",
    "zone": "amberwild",
    "x": -473,
    "z": -610,
    "kind": "crate",
    "questId": "story-sunscar-wreckage",
    "regionId": "sunscar"
  },
  {
    "id": "story-sunscar-crate-4",
    "name": "Recover cargo crate 4",
    "zone": "amberwild",
    "x": -490,
    "z": -578,
    "kind": "crate",
    "questId": "story-sunscar-wreckage",
    "regionId": "sunscar"
  },
  {
    "id": "story-sunscar-crate-5",
    "name": "Recover cargo crate 5",
    "zone": "amberwild",
    "x": -526,
    "z": -590,
    "kind": "crate",
    "questId": "story-sunscar-wreckage",
    "regionId": "sunscar"
  },
  {
    "id": "story-stormcrag-track-1",
    "name": "Follow track marker 1",
    "zone": "frostmarch",
    "x": 42,
    "z": -590,
    "kind": "marker",
    "questId": "story-tracks-across-stormcrag",
    "regionId": "stormcrag"
  },
  {
    "id": "story-stormcrag-track-2",
    "name": "Follow track marker 2",
    "zone": "frostmarch",
    "x": 56,
    "z": -624,
    "kind": "marker",
    "questId": "story-tracks-across-stormcrag",
    "requires": [
      "story-stormcrag-track-1"
    ],
    "regionId": "stormcrag"
  },
  {
    "id": "story-stormcrag-track-3",
    "name": "Follow track marker 3",
    "zone": "frostmarch",
    "x": 84,
    "z": -638,
    "kind": "marker",
    "questId": "story-tracks-across-stormcrag",
    "requires": [
      "story-stormcrag-track-2"
    ],
    "regionId": "stormcrag"
  },
  {
    "id": "story-stormcrag-track-4",
    "name": "Follow track marker 4",
    "zone": "frostmarch",
    "x": 112,
    "z": -616,
    "kind": "marker",
    "questId": "story-tracks-across-stormcrag",
    "requires": [
      "story-stormcrag-track-3"
    ],
    "regionId": "stormcrag"
  },
  {
    "id": "story-stormcrag-track-5",
    "name": "Follow track marker 5",
    "zone": "frostmarch",
    "x": 112,
    "z": -582,
    "kind": "marker",
    "questId": "story-tracks-across-stormcrag",
    "requires": [
      "story-stormcrag-track-4"
    ],
    "regionId": "stormcrag"
  },
  {
    "id": "story-lost-scout",
    "name": "Find the lost scout",
    "zone": "frostmarch",
    "x": 110,
    "z": -568,
    "kind": "npc",
    "questId": "story-the-lost-scout",
    "regionId": "stormcrag"
  },
  {
    "id": "story-frozen-seal-1",
    "name": "Activate ancient Frozen Seal 1",
    "zone": "frostmarch",
    "x": 42,
    "z": -662,
    "kind": "seal",
    "questId": "story-three-frozen-seals",
    "regionId": "stormcrag"
  },
  {
    "id": "story-frozen-seal-2",
    "name": "Activate ancient Frozen Seal 2",
    "zone": "frostmarch",
    "x": 82,
    "z": -684,
    "kind": "seal",
    "questId": "story-three-frozen-seals",
    "regionId": "stormcrag"
  },
  {
    "id": "story-frozen-seal-3",
    "name": "Activate ancient Frozen Seal 3",
    "zone": "frostmarch",
    "x": 122,
    "z": -654,
    "kind": "seal",
    "questId": "story-three-frozen-seals",
    "regionId": "stormcrag"
  },
  {
    "id": "story-moonfen-lantern-1",
    "name": "Light ward lantern 1",
    "zone": "hollow",
    "x": 638,
    "z": -176,
    "kind": "lantern",
    "questId": "story-lanterns-in-the-marsh",
    "regionId": "moonfen"
  },
  {
    "id": "story-moonfen-lantern-2",
    "name": "Light ward lantern 2",
    "zone": "hollow",
    "x": 674,
    "z": -184,
    "kind": "lantern",
    "questId": "story-lanterns-in-the-marsh",
    "regionId": "moonfen"
  },
  {
    "id": "story-moonfen-lantern-3",
    "name": "Light ward lantern 3",
    "zone": "hollow",
    "x": 684,
    "z": -140,
    "kind": "lantern",
    "questId": "story-lanterns-in-the-marsh",
    "regionId": "moonfen"
  },
  {
    "id": "story-moonfen-lantern-4",
    "name": "Light ward lantern 4",
    "zone": "hollow",
    "x": 646,
    "z": -130,
    "kind": "lantern",
    "questId": "story-lanterns-in-the-marsh",
    "regionId": "moonfen"
  },
  {
    "id": "story-caravan-survivors",
    "name": "Find the wounded caravan survivors",
    "zone": "hollow",
    "x": 623,
    "z": 305,
    "kind": "npc",
    "questId": "story-the-wounded-caravan",
    "regionId": "shadewood"
  },
  {
    "id": "story-whisper-tree-1",
    "name": "Inspect whispering tree 1",
    "zone": "hollow",
    "x": 580,
    "z": 299,
    "kind": "tree",
    "questId": "story-shadewood-voices",
    "regionId": "shadewood"
  },
  {
    "id": "story-whisper-tree-2",
    "name": "Inspect whispering tree 2",
    "zone": "hollow",
    "x": 618,
    "z": 326,
    "kind": "tree",
    "questId": "story-shadewood-voices",
    "regionId": "shadewood"
  },
  {
    "id": "story-whisper-tree-3",
    "name": "Inspect whispering tree 3",
    "zone": "hollow",
    "x": 588,
    "z": 348,
    "kind": "tree",
    "questId": "story-shadewood-voices",
    "regionId": "shadewood"
  },
  {
    "id": "story-whisper-tree-4",
    "name": "Inspect whispering tree 4",
    "zone": "hollow",
    "x": 558,
    "z": 330,
    "kind": "tree",
    "questId": "story-shadewood-voices",
    "regionId": "shadewood"
  },
  {
    "id": "story-plague-mechanism-1",
    "name": "Inspect broken mechanism 1",
    "zone": "hollow",
    "x": 1090,
    "z": -126,
    "kind": "marker",
    "questId": "story-plague-signs",
    "regionId": "umbral-shores"
  },
  {
    "id": "story-plague-mechanism-2",
    "name": "Inspect broken mechanism 2",
    "zone": "hollow",
    "x": 1122,
    "z": -132,
    "kind": "marker",
    "questId": "story-plague-signs",
    "regionId": "umbral-shores"
  },
  {
    "id": "story-plague-mechanism-3",
    "name": "Inspect broken mechanism 3",
    "zone": "hollow",
    "x": 1136,
    "z": -154,
    "kind": "marker",
    "questId": "story-plague-signs",
    "regionId": "umbral-shores"
  },
  {
    "id": "story-bazaar-supplies",
    "name": "Collect supplies in Sunveil Bazaar",
    "zone": "sunveil",
    "x": -1034,
    "z": -906,
    "kind": "crate",
    "questId": "story-water-before-glory"
  },
  {
    "id": "story-dunewell-delivery",
    "name": "Deliver supplies to Dunewell Oasis",
    "zone": "sunveil",
    "x": -1110,
    "z": -406,
    "kind": "crate",
    "questId": "story-water-before-glory",
    "requires": [
      "story-bazaar-supplies"
    ],
    "regionId": "dune-wells"
  },
  {
    "id": "story-expedition-marker-1",
    "name": "Find buried expedition marker 1",
    "zone": "sunveil",
    "x": -1162,
    "z": -396,
    "kind": "marker",
    "questId": "story-the-buried-markers",
    "regionId": "dune-wells"
  },
  {
    "id": "story-expedition-marker-2",
    "name": "Find buried expedition marker 2",
    "zone": "sunveil",
    "x": -1120,
    "z": -362,
    "kind": "marker",
    "questId": "story-the-buried-markers",
    "regionId": "dune-wells"
  },
  {
    "id": "story-expedition-marker-3",
    "name": "Find buried expedition marker 3",
    "zone": "sunveil",
    "x": -1070,
    "z": -384,
    "kind": "marker",
    "questId": "story-the-buried-markers",
    "regionId": "dune-wells"
  },
  {
    "id": "story-expedition-marker-4",
    "name": "Find buried expedition marker 4",
    "zone": "sunveil",
    "x": -1080,
    "z": -450,
    "kind": "marker",
    "questId": "story-the-buried-markers",
    "regionId": "dune-wells"
  },
  {
    "id": "story-expedition-marker-5",
    "name": "Find buried expedition marker 5",
    "zone": "sunveil",
    "x": -1142,
    "z": -462,
    "kind": "marker",
    "questId": "story-the-buried-markers",
    "regionId": "dune-wells"
  },
  {
    "id": "story-signal-pylon-1",
    "name": "Activate signal pylon 1",
    "zone": "sunveil",
    "x": -1340,
    "z": -752,
    "kind": "shrine",
    "questId": "story-badlands-signal",
    "regionId": "sunveil-badlands"
  },
  {
    "id": "story-signal-pylon-2",
    "name": "Activate signal pylon 2",
    "zone": "sunveil",
    "x": -1304,
    "z": -724,
    "kind": "shrine",
    "questId": "story-badlands-signal",
    "regionId": "sunveil-badlands"
  },
  {
    "id": "story-signal-pylon-3",
    "name": "Activate signal pylon 3",
    "zone": "sunveil",
    "x": -1282,
    "z": -760,
    "kind": "shrine",
    "questId": "story-badlands-signal",
    "regionId": "sunveil-badlands"
  },
  {
    "id": "story-canopy-landmark-1",
    "name": "Survey Canopy Reach landmark 1",
    "zone": "mistwood",
    "x": 531,
    "z": 846,
    "kind": "marker",
    "questId": "story-under-the-canopy",
    "regionId": "canopy-reach"
  },
  {
    "id": "story-canopy-landmark-2",
    "name": "Survey Canopy Reach landmark 2",
    "zone": "mistwood",
    "x": 568,
    "z": 888,
    "kind": "marker",
    "questId": "story-under-the-canopy",
    "regionId": "canopy-reach"
  },
  {
    "id": "story-canopy-landmark-3",
    "name": "Survey Canopy Reach landmark 3",
    "zone": "mistwood",
    "x": 512,
    "z": 906,
    "kind": "marker",
    "questId": "story-under-the-canopy",
    "regionId": "canopy-reach"
  },
  {
    "id": "story-jungle-bell-1",
    "name": "Ring jungle bell 1",
    "zone": "mistwood",
    "x": 548,
    "z": 822,
    "kind": "bell",
    "questId": "story-the-bell-that-rings-alone",
    "regionId": "canopy-reach"
  },
  {
    "id": "story-jungle-bell-2",
    "name": "Ring jungle bell 2",
    "zone": "mistwood",
    "x": 576,
    "z": 850,
    "kind": "bell",
    "questId": "story-the-bell-that-rings-alone",
    "requires": [
      "story-jungle-bell-1"
    ],
    "regionId": "canopy-reach"
  },
  {
    "id": "story-jungle-bell-3",
    "name": "Ring jungle bell 3",
    "zone": "mistwood",
    "x": 556,
    "z": 900,
    "kind": "bell",
    "questId": "story-the-bell-that-rings-alone",
    "requires": [
      "story-jungle-bell-2"
    ],
    "regionId": "canopy-reach"
  },
  {
    "id": "story-orchid-rubbing-1",
    "name": "Search island ruin and take inscription rubbing 1",
    "zone": "mistwood",
    "x": 362,
    "z": 1282,
    "kind": "shrine",
    "questId": "story-orchid-isles",
    "regionId": "orchid-isles"
  },
  {
    "id": "story-orchid-rubbing-2",
    "name": "Search island ruin and take inscription rubbing 2",
    "zone": "mistwood",
    "x": 412,
    "z": 1282,
    "kind": "shrine",
    "questId": "story-orchid-isles",
    "regionId": "orchid-isles"
  },
  {
    "id": "story-orchid-rubbing-3",
    "name": "Search island ruin and take inscription rubbing 3",
    "zone": "mistwood",
    "x": 420,
    "z": 1332,
    "kind": "shrine",
    "questId": "story-orchid-isles",
    "regionId": "orchid-isles"
  },
  {
    "id": "story-orchid-rubbing-4",
    "name": "Search island ruin and take inscription rubbing 4",
    "zone": "mistwood",
    "x": 366,
    "z": 1340,
    "kind": "shrine",
    "questId": "story-orchid-isles",
    "regionId": "orchid-isles"
  }
];
export const STORY_ENEMIES: readonly StoryEnemy[] = [
  {
    "id": "story-briar-sentinel-1",
    "kind": "briar-sentinel",
    "level": 6,
    "zone": "greenwood",
    "x": -436,
    "z": -38
  },
  {
    "id": "story-briar-sentinel-2",
    "kind": "briar-sentinel",
    "level": 6,
    "zone": "greenwood",
    "x": -431,
    "z": -61
  },
  {
    "id": "story-briar-sentinel-3",
    "kind": "briar-sentinel",
    "level": 6,
    "zone": "greenwood",
    "x": -436,
    "z": -54
  },
  {
    "id": "story-briar-sentinel-4",
    "kind": "briar-sentinel",
    "level": 6,
    "zone": "greenwood",
    "x": -437,
    "z": -70
  },
  {
    "id": "story-briar-sentinel-5",
    "kind": "briar-sentinel",
    "level": 6,
    "zone": "greenwood",
    "x": -430,
    "z": -77
  },
  {
    "id": "story-briar-sentinel-6",
    "kind": "briar-sentinel",
    "level": 6,
    "zone": "greenwood",
    "x": -444,
    "z": -53
  },
  {
    "id": "story-mire-leech-1",
    "kind": "mire-leech",
    "level": 19,
    "zone": "hollow",
    "x": 715,
    "z": -283
  },
  {
    "id": "story-mire-leech-2",
    "kind": "mire-leech",
    "level": 19,
    "zone": "hollow",
    "x": 787,
    "z": -172
  },
  {
    "id": "story-mire-leech-3",
    "kind": "mire-leech",
    "level": 19,
    "zone": "hollow",
    "x": 708,
    "z": -285
  },
  {
    "id": "story-mire-leech-4",
    "kind": "mire-leech",
    "level": 19,
    "zone": "hollow",
    "x": 720,
    "z": -288
  },
  {
    "id": "story-mire-leech-5",
    "kind": "mire-leech",
    "level": 19,
    "zone": "hollow",
    "x": 721,
    "z": -295
  },
  {
    "id": "story-mire-leech-6",
    "kind": "mire-leech",
    "level": 19,
    "zone": "hollow",
    "x": 699,
    "z": -287
  },
  {
    "id": "story-bone-rat-1",
    "kind": "bone-rat",
    "level": 20,
    "zone": "hollow",
    "x": 688,
    "z": 408
  },
  {
    "id": "story-bone-rat-2",
    "kind": "bone-rat",
    "level": 20,
    "zone": "hollow",
    "x": 695,
    "z": 401
  },
  {
    "id": "story-bone-rat-3",
    "kind": "bone-rat",
    "level": 20,
    "zone": "hollow",
    "x": 659,
    "z": 425
  },
  {
    "id": "story-crypt-bat-1",
    "kind": "crypt-bat",
    "level": 20,
    "zone": "hollow",
    "x": 687,
    "z": 415
  },
  {
    "id": "story-crypt-bat-2",
    "kind": "crypt-bat",
    "level": 20,
    "zone": "hollow",
    "x": 703,
    "z": 391
  },
  {
    "id": "story-crypt-bat-3",
    "kind": "crypt-bat",
    "level": 20,
    "zone": "hollow",
    "x": 647,
    "z": 429
  },
  {
    "id": "story-corpse-scarab-1",
    "kind": "corpse-scarab",
    "level": 21,
    "zone": "hollow",
    "x": 567,
    "z": -261
  },
  {
    "id": "story-corpse-scarab-2",
    "kind": "corpse-scarab",
    "level": 21,
    "zone": "hollow",
    "x": 622,
    "z": -286
  },
  {
    "id": "story-corpse-scarab-3",
    "kind": "corpse-scarab",
    "level": 21,
    "zone": "hollow",
    "x": 587,
    "z": -275
  },
  {
    "id": "story-corpse-scarab-4",
    "kind": "corpse-scarab",
    "level": 21,
    "zone": "hollow",
    "x": 602,
    "z": -282
  },
  {
    "id": "story-corpse-scarab-5",
    "kind": "corpse-scarab",
    "level": 21,
    "zone": "hollow",
    "x": 636,
    "z": -286
  },
  {
    "id": "story-carrion-hound-1",
    "kind": "carrion-hound",
    "level": 27,
    "zone": "hollow",
    "x": 578,
    "z": 450
  },
  {
    "id": "story-carrion-hound-2",
    "kind": "carrion-hound",
    "level": 27,
    "zone": "hollow",
    "x": 591,
    "z": 440
  },
  {
    "id": "story-carrion-hound-3",
    "kind": "carrion-hound",
    "level": 27,
    "zone": "hollow",
    "x": 598,
    "z": 442
  },
  {
    "id": "story-carrion-hound-4",
    "kind": "carrion-hound",
    "level": 27,
    "zone": "hollow",
    "x": 602,
    "z": 432
  },
  {
    "id": "story-carrion-hound-5",
    "kind": "carrion-hound",
    "level": 27,
    "zone": "hollow",
    "x": 609,
    "z": 431
  },
  {
    "id": "story-carrion-hound-6",
    "kind": "carrion-hound",
    "level": 27,
    "zone": "hollow",
    "x": 593,
    "z": 448
  },
  {
    "id": "story-jade-sentinel-1",
    "kind": "jade-sentinel",
    "level": 46,
    "zone": "mistwood",
    "x": 608,
    "z": 802
  },
  {
    "id": "story-jade-sentinel-2",
    "kind": "jade-sentinel",
    "level": 46,
    "zone": "mistwood",
    "x": 608,
    "z": 810
  },
  {
    "id": "story-jade-sentinel-3",
    "kind": "jade-sentinel",
    "level": 46,
    "zone": "mistwood",
    "x": 591,
    "z": 832
  },
  {
    "id": "story-jade-sentinel-4",
    "kind": "jade-sentinel",
    "level": 46,
    "zone": "mistwood",
    "x": 610,
    "z": 832
  },
  {
    "id": "story-jade-sentinel-5",
    "kind": "jade-sentinel",
    "level": 46,
    "zone": "mistwood",
    "x": 626,
    "z": 820
  },
  {
    "id": "story-jade-sentinel-6",
    "kind": "jade-sentinel",
    "level": 46,
    "zone": "mistwood",
    "x": 608,
    "z": 792
  },
  {
    "id": "story-temple-keeper-1",
    "kind": "stone-golem",
    "level": 43,
    "zone": "sunveil",
    "x": -1210,
    "z": -1200,
    "name": "Temple Key Keeper 1",
    "elite": true,
    "questId": "story-temple-keys"
  },
  {
    "id": "story-temple-keeper-2",
    "kind": "stone-golem",
    "level": 43,
    "zone": "sunveil",
    "x": -1170,
    "z": -1166,
    "name": "Temple Key Keeper 2",
    "elite": true,
    "questId": "story-temple-keys"
  },
  {
    "id": "story-temple-keeper-3",
    "kind": "stone-golem",
    "level": 43,
    "zone": "sunveil",
    "x": -1130,
    "z": -1220,
    "name": "Temple Key Keeper 3",
    "elite": true,
    "questId": "story-temple-keys"
  },
  {
    "id": "story-bracken-boar-1",
    "kind": "briar-boar",
    "level": 8,
    "zone": "greenwood",
    "x": -536,
    "z": 21,
    "questId": "story-boars-of-bracken-crown"
  },
  {
    "id": "story-bracken-boar-2",
    "kind": "briar-boar",
    "level": 8,
    "zone": "greenwood",
    "x": -540,
    "z": 14,
    "questId": "story-boars-of-bracken-crown"
  }
];
export const STORY_ENCOUNTERS: readonly StoryEncounter[] = [
  {
    "id": "story-defend-scout",
    "questId": "story-the-lost-scout",
    "zone": "frostmarch",
    "objectId": "story-lost-scout",
    "waves": [
      [
        {
          "kind": "ice-wisp",
          "count": 2,
          "level": 16
        }
      ],
      [
        {
          "kind": "ice-wisp",
          "count": 2,
          "level": 16
        }
      ],
      [
        {
          "kind": "frost-yeti",
          "count": 1,
          "level": 16
        }
      ]
    ]
  },
  {
    "id": "story-escort-caravan",
    "questId": "story-the-wounded-caravan",
    "zone": "hollow",
    "objectId": "story-caravan-survivors",
    "route": [
      {
        "x": 623,
        "z": 305
      },
      {
        "x": 622.5,
        "z": 304.5
      },
      {
        "x": 621,
        "z": 309
      },
      {
        "x": 619.5,
        "z": 310.5
      },
      {
        "x": 600,
        "z": 312
      }
    ],
    "waves": [
      [
        {
          "kind": "bone-rat",
          "count": 2,
          "level": 22
        }
      ],
      [
        {
          "kind": "crypt-bat",
          "count": 2,
          "level": 22
        }
      ]
    ]
  }
];
