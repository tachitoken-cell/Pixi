import type { ZoneId } from './content.ts';

export const REGION_ORIGINS: Record<ZoneId, { x: number; z: number }> = {
  greenwood: { x: 0, z: 0 }, amberwild: { x: -440, z: -260 },
  frostmarch: { x: 440, z: -432 }, hollow: { x: 448, z: 280 },
  sunveil: { x: -1040, z: -920 }, mistwood: { x: 1080, z: 1000 },
};
export const CITY = { id: 'city-lanternreach', name: 'Lanternreach', x: 0, z: 0, zone: 'greenwood' as ZoneId,
  description: 'The realm’s capital. Class halls, riding lessons, a bank, a market and player auctions within the lantern walls.' };
// 162m across versus the original94m: approximately three times the area.
export const CITY_RADIUS = 81;
export const CITY_WALL_RADIUS = 78;
export const insideCity = (x: number, z: number) => Math.abs(x) < CITY_RADIUS && Math.abs(z) < CITY_RADIUS;

export interface CityHome { id:string; kind:'cottage'|'inn'; x:number; z:number; rotation:number; width:number; depth:number }
const home=(id:string,kind:CityHome['kind'],x:number,z:number,rotation=0):CityHome=>({id,kind,x,z,rotation,width:kind==='inn'?14:10,depth:kind==='inn'?12:9});
export const CITY_HOMES:readonly CityHome[]=[
  home('house-greenwood-0','inn',-18,22), home('house-greenwood-1','cottage',-34,31),
  home('house-greenwood-2','cottage',-35,13), home('house-greenwood-3','cottage',32,29),home('house-greenwood-4','cottage',13,34),
  ...[-50,-23,21,54].map((z,i)=>home(`house-city-west-${i}`,i===2?'inn':'cottage',-59,z,Math.PI/2)),
  ...[-50,-22,24,54].map((z,i)=>home(`house-city-east-${i}`,i===2?'inn':'cottage',59,z,-Math.PI/2)),
  ...[-30,25].map((x,i)=>home(`house-city-north-${i}`,'cottage',x,-59)),
  ...[-28,25].map((x,i)=>home(`house-city-south-${i}`,'cottage',x,59,Math.PI)),
];
export interface CityRoad { x1:number; z1:number; x2:number; z2:number; width:number }
const road=(x1:number,z1:number,x2:number,z2:number,width=3):CityRoad=>({x1,z1,x2,z2,width});
/** Authored once for pavement, pedestrian routes and collision regression checks. */
export const CITY_ROADS:readonly CityRoad[]=[
  road(0,-84,0,-10,5),road(0,-10,0,10,2),road(0,10,0,92,5),
  road(-84,0,-10,0,5),road(-10,0,10,0,2),road(10,0,84,0,3),
  road(-46,-62,-46,62,4),road(46,-62,46,62,4),road(-46,-46,46,-46,4),road(-46,46,46,46,4),
  road(-25,-38,-25,12),road(-25,-11.5,25,-11.5,2),road(25,-11.5,25,-13,2),road(-13,-11.5,-13,-13,2),
  road(-25,-31.5,-18,-31.5,2),road(-18,-31.5,-18,-33,2),road(-25,-28,-28,-28,2),road(-28,-28,-28,-30,2),
  road(-25,-16,-33,-16),road(-33,-16,-33,-18,2),road(-33,0,-33,-3,2),
  road(-25,-3,-18,-3,2),road(-18,-3,-18,-5,2),road(-25,12,0,12),road(-17,12,-17,10,2),
  road(0,18,38,18,4),road(23,18,23,12,3),road(19,18,19,16,2),road(27,18,27,16,2),
  road(-46,41,46,41,3),road(-18,41,-18,28,2),road(-34,41,-34,35.5,2),road(32,41,32,33.5,2),road(13,41,13,38.5,2),
  road(-46,19,-35,19,2),road(-35,19,-35,17.5,2),
  ...[-50,-23,21,54].map((z,i)=>road(-46,z,i===2?-53:-54.5,z,2)),
  ...[-50,-22,24,54].map((z,i)=>road(46,z,i===2?53:54.5,z,2)),
  ...[-30,25].map(x=>road(x,-46,x,-54.5,2)),...[-28,25].map(x=>road(x,46,x,54.5,2)),
];
export const CITY_TRAINER_POSITIONS = {
  'riding-trainer': { x: 19, z: 14 }, 'mount-seller': { x: 27, z: 14 },
  'cleric-trainer': { x: -28, z: -32 },
  'ranger-trainer': { x: -33, z: -5 }, 'knight-trainer': { x: -33, z: -20 }, 'mage-trainer': { x: -18, z: -35 },
};
export const CITY_VENDORS = [
  { id: 'city-armorer', name: 'Hilda Ironstitch', title: 'Armor & accessories', x: -18, z: -5 },
  { id: 'city-weaponsmith', name: 'Orin Brightsteel', title: 'Weaponsmith', x: -17, z: 10 },
].map(npc => ({ ...npc, villageId: CITY.id, role: 'merchant' as const, zone: CITY.zone, rotation: 0,
  lines: [`Welcome to Lanternreach. Browse my ${npc.id === 'city-armorer' ? 'armor and accessories' : 'weapons'} for every class and level.`] }));
export const AUCTIONEER = { id: 'city-auctioneer', name: 'Merrick Ledger', title: 'Auctioneer', role: 'auctioneer' as const,
  zone: CITY.zone, x: 25, z: -25, rotation: 0 };
export const DEED_AUCTIONEER = { id: 'city-deed-auctioneer', name: 'Bram Oakledger', title: 'House Deed Auctions', role: 'auctioneer' as const,
  zone: CITY.zone, x: 31, z: -25, rotation: -Math.PI / 4 };
export const BANK_HOME_ID = 'house-city-east-2';
export const BANK_HOME_IDS: Record<ZoneId,string> = {
  greenwood:BANK_HOME_ID, amberwild:'town-amberwild-home-11', frostmarch:'town-frostmarch-home-11',
  hollow:'town-hollow-home-11', sunveil:'town-sunveil-home-11', mistwood:'town-mistwood-home-11',
};
export const BANKER = { id:'city-banker', name:'Elara Mossledger', title:'Banker', role:'banker' as const,
  zone:CITY.zone, x:59, z:24, rotation:-Math.PI/2 };
export interface CityFurnishing { kind:string; x:number; z:number; rotation:number; width:number; depth:number; buildingId?:string }
/** Interior coordinates are local to the existing building; garden coordinates are world-space. */
export const CITY_FURNISHINGS:readonly CityFurnishing[] = [
  {kind:'auction-reading-desk',x:0,z:-7.5,width:4,depth:1.2,rotation:0,buildingId:'city-auction-hall-25--22'},
  ...[-1,1].flatMap(side=>[
    {kind:'auction-bookcase',x:side*10.4,z:1,width:1.2,depth:4,rotation:0,buildingId:'city-auction-hall-25--22'},
    {kind:'auction-display-case',x:side*6.7,z:1,width:3,depth:1.4,rotation:0,buildingId:'city-auction-hall-25--22'},
    {kind:'auction-bench',x:side*7,z:5.6,width:3.2,depth:.8,rotation:0,buildingId:'city-auction-hall-25--22'},
  ]),
  {kind:'bank-counter',x:0,z:-2.4,width:4.4,depth:.9,rotation:0,buildingId:BANK_HOME_ID},
  {kind:'bank-vault',x:0,z:-5.6,width:4,depth:.6,rotation:0,buildingId:BANK_HOME_ID},
  {kind:'bank-crest',x:0,z:6.24,width:1.5,depth:.1,rotation:0,buildingId:BANK_HOME_ID},
  ...[[-36,-38],[9,-54],[38,-55],[-38,56],[37,54]].map(([x,z])=>({kind:'courtyard-tree',x,z,width:3,depth:3,rotation:0})),
  ...[[8,-23],[8,-29],[-13,52],[13,52],[-38,23],[38,32]].map(([x,z])=>({kind:'bush-planter',x,z,width:2.4,depth:1.2,rotation:0})),
  ...[[8,-8],[-9,8],[35,-39]].map(([x,z])=>({kind:'lantern-statue',x,z,width:2.8,depth:2.8,rotation:0})),
];
export interface CityProp { id: string; kind: string; x: number; z: number; rotation: number; width: number; depth: number }
const prop = (kind: string, x: number, z: number, width: number, depth: number, rotation = 0): CityProp =>
  ({ id: `${kind}-${x}-${z}`, kind, x, z, width, depth, rotation });
export const CITY_HALL = prop('city-auction-hall',25,-22,24,18);
export const CITY_CLOCKTOWER = { ...prop('city-clocktower',-13,-21,20,16), id: 'city-clocktower--10--20' };
export const TOWN_HALL_SEATS = [
  ...[-2.5,0,2.5].flatMap(z=>[{x:-8.85,z,rotation:Math.PI/2},{x:-2.15,z,rotation:-Math.PI/2}]),
  ...[4.9,6.5].map(x=>({x,z:5.4,rotation:Math.PI})),
];
export const CITY_PROPS: readonly CityProp[] = [
  CITY_HALL, CITY_CLOCKTOWER, prop('city-fountain',10,8,6,6), prop('city-fountain',18,-39,6,6),
  prop('city-ranger-pavilion',-33,-6,8,6), prop('city-knight-pavilion',-33,-21,8,6), prop('city-mage-pavilion',-18,-36,8,6),
  prop('city-stable',23,7,16,10), prop('city-market-stall',-18,-8,8,4), prop('city-market-stall',-17,7,8,4),
  prop('city-gate',0,CITY_WALL_RADIUS,12,5), prop('city-gate',0,-CITY_WALL_RADIUS,12,5,Math.PI),
  prop('city-gate',CITY_WALL_RADIUS,0,12,5,Math.PI/2), prop('city-gate',-CITY_WALL_RADIUS,0,12,5,-Math.PI/2),
  ...[-5,5].flatMap(x=>[-34,-22,22,34].filter(z=>x!==-5||z!==-22).map(z=>prop('city-lantern',x,z,.7,.7))),
  prop('city-lantern',-13,-9,.7,.7),prop('city-lantern',-7,-9,.7,.7),
  ...[-38,38].flatMap(x=>[-5,5].map(z=>prop('city-lantern',x,z,.7,.7))),
  ...[-43,43].flatMap(x=>[-58,-32,32,58].map(z=>prop('city-lantern',x,z,.7,.7))),
  ...[-74,-66,-58,-50,-42,-34,-26,-18,-10,10,18,26,34,42,50,58,66,74].flatMap(at => [
    prop('city-wall',at,CITY_WALL_RADIUS,8,2.4), prop('city-wall',at,-CITY_WALL_RADIUS,8,2.4),
    prop('city-wall',CITY_WALL_RADIUS,at,8,2.4,Math.PI/2), prop('city-wall',-CITY_WALL_RADIUS,at,8,2.4,Math.PI/2),
  ]),
];
function box(p: CityProp, x: number, z: number, width: number, depth: number) {
  const c = Math.cos(p.rotation), s = Math.sin(p.rotation), turned = Math.abs(s) > .5;
  return { x: p.x+x*c+z*s, z: p.z-x*s+z*c, r: Math.hypot(width,depth)/2,
    halfWidth: (turned ? depth : width)/2, halfDepth: (turned ? width : depth)/2 };
}
/** Dimensions match the Blender kit; open entrances and aisles stay walkable on both peers. */
export const cityColliders = (props: readonly CityProp[]) => props.flatMap(p => {
  if (p.kind === 'city-gate') return [-1,1].map(side => box(p,side*4.5,0,3,5));
  if (p.kind === 'city-fountain' || p.kind === 'city-wall') return [box(p,0,0,p.width,p.depth)];
  if (p.kind === 'city-lantern') return [box(p,0,0,.58,.58)];
  if (p.kind === 'city-clocktower') return [
    box(p,-9.7,0,.6,16),box(p,9.7,0,.6,16),box(p,0,-7.7,20,.6),
    ...[-1,1].map(side=>box(p,side*6,7.7,8,.6)),
    box(p,-5.3,-.5,2.4,6),box(p,0,-6,4.8,1.6),box(p,8.65,-1.5,1.1,7.2),
    box(p,-8.65,-4.8,1.1,3.5),box(p,5.7,-6.6,4.2,1.2),box(p,5.7,2.8,3.2,1.6),
    ...[-1,1].map(side=>box(p,side*8.5,5.8,1,1)),
    ...TOWN_HALL_SEATS.map(seat=>box(p,seat.x,seat.z,.85,.85)),
  ];
  if (p.kind === 'city-auction-hall') return [
    box(p,-11.7,0,.6,18),box(p,11.7,0,.6,18),box(p,0,-8.7,24,.6),
    ...[-1,1].flatMap(side => [box(p,side*7.5,8.7,9,.6),box(p,side*6.5,-6.1,6,1.8),box(p,side*10.25,-5.6,1.3,4.9)]),
  ];
  if (p.kind === 'city-stable') return [box(p,0,-4.825,16,.35),...[-1,1].flatMap(side=>[
    box(p,side*7.825,0,.35,10),box(p,side*2.6,-2.325,.22,4.65),
    ...[-4.6,0,4.6].map(z=>box(p,side*7.64,z,.49,.49)),
  ]),...[-5.15,0,5.15].map(x=>box(p,x,-3.85,2.7,1))];
  const stall = p.kind === 'city-market-stall';
  return [box(p,0,stall ? -.8 : -1.7,stall ? 6.4 : 4,stall ? .9 : 1),
    ...[-1,1].flatMap(x=>[-1,1].map(z=>box(p,x*3.65,z*(stall?1.65:2.65),stall?.34:.54,stall?.34:.54))),
    ...stall ? [] : [box(p,0,-2.85,8,.3)],
  ];
});

export const CITY_COLLIDERS = cityColliders(CITY_PROPS);
export const CITY_GARDEN_COLLIDERS = CITY_FURNISHINGS.filter(p=>!p.buildingId).map(p=>({x:p.x,z:p.z,r:Math.hypot(p.width,p.depth)/2,halfWidth:p.width/2,halfDepth:p.depth/2}));


const regionalHomes = [
  home('southwest-inn','inn',-30,29), home('southwest-home','cottage',-15,38),
  home('west-home','cottage',-33,14), home('southeast-home','cottage',32,34), home('south-home','cottage',16,38),
  ...CITY_HOMES.slice(5),
];
// Authored residential districts: staggered orchard lanes, northern terraces,
// lantern courts, a southern bazaar and sheltered woodland clusters.
const regionalPlots: Record<Exclude<ZoneId,'greenwood'>, readonly (readonly [number,number,number])[]> = {
  amberwild:[[-61,-55,1],[-58,-28,1],[-64,18,1],[-59,56,1],[61,-55,-1],[58,-26,-1],[63,24,-1],[60,56,-1],[-30,-64,0],[25,-59,0],[-28,63,2],[25,59,2]],
  frostmarch:[[-62,-47,1],[-62,-21,1],[-62,30,1],[62,-49,-1],[62,-22,-1],[62,49,-1],[26,-65,0],[-32,-65,0],[-14,-65,0],[-32,64,2],[17,64,2],[34,64,2]],
  hollow:[[-63,-38,1],[-59,29,1],[62,-53,-1],[58,-24,-1],[64,22,-1],[60,52,-1],[25,65,2],[-32,-61,0],[-14,-66,0],[25,-61,0],[-31,62,2],[-18,66,2]],
  sunveil:[[-59,-54,1],[-63,-27,1],[-60,24,1],[-63,55,1],[62,-39,-1],[60,38,-1],[26,-64,0],[-32,-64,0],[-14,-64,0],[-32,62,2],[17,65,2],[33,62,2]],
  mistwood:[[-60,-48,1],[-64,-20,1],[-58,39,1],[61,-46,-1],[65,-16,-1],[60,48,-1],[28,-65,0],[-33,-59,0],[-15,-66,0],[13,-63,0],[-28,64,2],[25,60,2]],
};
const townNames: Record<ZoneId,string> = {greenwood:CITY.name,amberwild:'Amberwild',frostmarch:'Frostmarch',hollow:'Hollow Lanternhaven',sunveil:'Sunveil Bazaar',mistwood:'Mistwood Haven'};
export interface CityLayout {
  id:string; name:string; zone:ZoneId; x:number; z:number; tint:number;
  homes:readonly CityHome[]; props:readonly CityProp[]; roads:readonly CityRoad[]; furnishings:readonly CityFurnishing[];
}
/** Shared Blender architecture, individually authored residential districts. */
export const CITY_LAYOUTS: readonly CityLayout[] = (Object.keys(REGION_ORIGINS) as ZoneId[]).map(zone=>{
  const origin=REGION_ORIGINS[zone], capital=zone==='greenwood';
  const move=<T extends {x:number;z:number}>(point:T):T=>({...point,x:point.x+origin.x,z:point.z+origin.z});
  const id=(value:string)=>capital?value:`town-${zone}-${value}`;
  const localHomes=capital?CITY_HOMES:regionalHomes.map((home,index)=>{
    const plot=index>=5?regionalPlots[zone as Exclude<ZoneId,'greenwood'>][index-5]:undefined;
    return {...home,...plot?{x:plot[0],z:plot[1],rotation:plot[2]*Math.PI/2}:{},id:zone==='amberwild'&&index<2?`house-amberwild-${index+5}`:id(`home-${index}`)};
  });
  const homes=capital?localHomes:localHomes.map(move);
  const props=capital?CITY_PROPS:CITY_PROPS.map(p=>move({...p,id:id(p.id),...(p.kind==='city-fountain'&&p.z===8?{x:34,z:24}:{})}));
  const furnishings=capital?CITY_FURNISHINGS:CITY_FURNISHINGS.map(p=>p.buildingId?{...p,buildingId:p.buildingId===BANK_HOME_ID?BANK_HOME_IDS[zone]:id(p.buildingId)}:move({...p,...(p.x===-38&&p.z===23?{x:-41,z:24}:p.x===38&&p.z===32?{x:41,z:34}:{})}));
  const localRoads=capital?CITY_ROADS:[...CITY_ROADS.slice(0,29),
    road(-46,41,-24,41,3),road(26,41,46,41,3),road(-30,41,-30,35,2),road(-15,46,-15,42.5,2),road(16,46,16,42.5,2),road(32,41,32,38.5,2),road(-46,20,-33,20,2),road(-33,20,-33,18.5,2),
    ...localHomes.slice(5).map(h=>{
      const s=Math.sin(h.rotation),c=Math.cos(h.rotation),x=h.x+s*h.depth/2,z=h.z+c*h.depth/2;
      return Math.abs(s)>.5?road(Math.sign(h.x)*46,z,x,z,2):road(x,Math.sign(h.z)*46,x,z,2);
    }),
  ];
  const roads=localRoads.flatMap((r,index)=>{
    if((zone==='amberwild'||zone==='frostmarch')&&index===0)return [road(0,-84,0,-16,5),road(0,-16,0,-10,1.5)];
    if((zone==='amberwild'||zone==='frostmarch')&&index===11)return [road(-25,-11.5,-3,-11.5,2),road(-3,-11.5,-3,-8.5,2),road(-3,-8.5,3,-8.5,2),road(3,-8.5,3,-11.5,2),road(3,-11.5,25,-11.5,2)];
    return [r];
  }).map(r=>({...r,x1:r.x1+origin.x,z1:r.z1+origin.z,x2:r.x2+origin.x,z2:r.z2+origin.z}));
  return {id:capital?CITY.id:`town-${zone}`,name:townNames[zone],zone,...origin,tint:{greenwood:0xffffff,amberwild:0xffd4a1,frostmarch:0xc7e4ff,hollow:0xc9b3ea,sunveil:0xffd49b,mistwood:0xbde0bc}[zone],homes,props,roads,furnishings};
});
export const ALL_CITY_PROPS=CITY_LAYOUTS.flatMap(city=>city.props);
export const ALL_CITY_ROADS=CITY_LAYOUTS.flatMap(city=>city.roads);
export const ALL_CITY_FURNISHINGS=CITY_LAYOUTS.flatMap(city=>city.furnishings);
export const ALL_CITY_COLLIDERS=[...CITY_COLLIDERS,...CITY_LAYOUTS.slice(1).flatMap(city=>cityColliders(city.props))];
export const ALL_CITY_GARDEN_COLLIDERS=[...CITY_GARDEN_COLLIDERS,...CITY_LAYOUTS.slice(1).flatMap(city=>city.furnishings.filter(p=>!p.buildingId).map(p=>({x:p.x,z:p.z,r:Math.hypot(p.width,p.depth)/2,halfWidth:p.width/2,halfDepth:p.depth/2})))];
export const insideAnyCity=(x:number,z:number)=>CITY_LAYOUTS.some(city=>insideCity(x-city.x,z-city.z));
export const insideAirshipApproach=(x:number,z:number)=>CITY_LAYOUTS.some(city=>Math.abs(x-city.x)<=12&&z-city.z>=78&&z-city.z<=124);
