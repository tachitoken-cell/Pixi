/** Benji's 24 creatures form the six chambers before Morgrath and the Apostle. */
export type RaidApproachArchetype='cleave'|'burst'|'line'|'ring'|'leap'|'volley';
const creature=<const Slug extends string>(slug:Slug,name:string,archetype:RaidApproachArchetype,ability:string,hpPerPlayer:number)=>({model:`raid-${slug}` as const,name,archetype,ability,hpPerPlayer});
export const RAID_APPROACH_MONSTERS=[
 creature('moss-golem','Moss Golem','ring','Voidroot Quake',1200),
 creature('shroom-shaman','Shroom Shaman','volley','Nightspore Volley',650),
 creature('vine-stalker','Vine Stalker','line','Grasping Voidvine',750),
 creature('grumble-root','Grumble Root','burst','Root Grumble',950),
 creature('puffling','Puffling','burst','Umbral Puff',600),
 creature('acorn-seedle','Acorn Seedle','volley','Obsidian Seedfall',650),
 creature('cinder-seedle','Cinder Seedle','ring','Cold Cinder Ring',700),
 creature('pudgy-piglet','Pudgy Piglet','leap','Void Trot',850),
 creature('crimson-weaver','Crimson Weaver','line','Abyssal Silk',750),
 creature('stinger-wasp','Stinger Wasp','line','Void Sting',650),
 creature('dusk-vampie','Dusk Vampie','cleave','Dusk Wingbite',650),
 creature('spring-boing','Spring Boing','leap','Rift Bounce',850),
 creature('thorn-knight','Thorn Knight','cleave','Thornblade Arc',1100),
 creature('hollow-scarecrow','Hollow Scarecrow','volley','Hollow Soul Volley',800),
 creature('grave-knight','Grave Knight','cleave','Graveblade Cleave',1100),
 creature('gloom-gargoyle','Gloom Gargoyle','leap','Gloom Descent',950),
 creature('thornback-boar','Thornback Boar','line','Thornback Rush',1100),
 creature('hammer-stump','Hammer Stump','burst','Void Anvil',1050),
 creature('rotwood-treant','Rotwood Treant','ring','Rotwood Rupture',1200),
 creature('magma-brute','Magma Brute','cleave','Abyssal Hammer',1400),
 creature('tunnel-mole','Tunnel Mole','leap','Umbral Eruption',750),
 creature('gnoll-scout','Gnoll Scout','volley','Rift Arrow Volley',700),
 creature('crested-basilisk','Crested Basilisk','line','Basilisk Gaze',1100),
 creature('tidelord-crab','Tidelord Crab','ring','Tidelord Undertow',1200),
] as const;
export type RaidApproachModel=typeof RAID_APPROACH_MONSTERS[number]['model']|'morgrath';
export const RAID_APPROACH_ROOMS=[
 {id:'void-garden',name:'Void Garden'}, {id:'umbral-kennels',name:'Umbral Kennels'},
 {id:'hollow-hive',name:'Hollow Hive'}, {id:'silent-ossuary',name:'Silent Ossuary'},
 {id:'black-forge',name:'Black Forge'}, {id:'fallen-citadel',name:'Fallen Citadel'},
].map((room,index)=>({...room,monsters:RAID_APPROACH_MONSTERS.slice(index*4,index*4+4).map(monster=>monster.model)}));
export const RAID_APPROACH_EXIT={x:0,z:-27};
export const RAID_APPROACH_GATE_RANGE=8;
export const RAID_APPROACH_TOTAL_ROOMS=8;
export const RAID_MORGRATH_MODEL='morgrath' as const;
export const raidApproachRoomName=(index:number)=>RAID_APPROACH_ROOMS[index]?.name??(index===6?'Morgrath’s Throne':'Apostle Sanctum');
