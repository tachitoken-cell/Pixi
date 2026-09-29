import { CITY, CITY_RADIUS, CITY_LAYOUTS, CITY_VENDORS, insideAnyCity, insideAirshipApproach, ALL_CITY_COLLIDERS } from './city.ts';
import { getZone, type ZoneId, type EnemyKind } from './content.ts';
import { EXPEDITIONS, EXPEDITION_ENEMY_OFFSETS, EXPEDITION_NODE_OFFSETS, REGION_ORIGINS, WORLD_BOUNDS, surfaceAt, groundHeight, inCore } from './landscape.ts';

export interface Village { id: string; name: string; zone: ZoneId; x: number; z: number; description: string; size?:'town' }
export type VillagePropKind = 'cottage' | 'inn' | 'stall' | 'well' | 'lantern';
export interface VillageProp { id: string; villageId: string; kind: VillagePropKind; x: number; z: number; rotation: number }
export interface VillageNPC { id: string; villageId: string; name: string; role: 'merchant' | 'warden' | 'healer'; x: number; z: number; rotation: number; zone: ZoneId; lines: string[] }
export interface WildernessSpawn { id: string; kind: EnemyKind; zone: ZoneId; x: number; z: number }
export const VILLAGE_SAFE_RADIUS = 36;
export const VILLAGE_PROP_SIZES: Record<VillagePropKind, { width: number; depth: number }> = {
  cottage: { width: 10, depth: 9 }, inn: { width: 14, depth: 12 }, stall: { width: 3, depth: 2 }, well: { width: 2, depth: 2 }, lantern: { width: .4, depth: .4 },
};
const villageDetails = [
  ['Willowbrook', 'A wayside hamlet where the southern road leaves Lanternreach.', 'Mira', 'Oren', 'Lina'],
  ['Copperleaf', 'Amber roofs shelter the orchard keepers of Redleaf Highlands.', 'Perrin', 'Sela', 'Jun'],
  ['Sunhaven', 'Salt-worn cottages gather around a warm well above the Sunscar coast.', 'Nessa', 'Tor', 'Amri'],
  ['Stormrest', 'A sturdy refuge for travellers crossing the high tundra.', 'Bram', 'Idra', 'Eira'],
  ['Glasswick', 'Blue lanterns guide wanderers home from the Northglass fjords.', 'Anwen', 'Keld', 'Fenn'],
  ['Moonbridge', 'Quiet marshfolk keep their lanterns burning through the mist.', 'Vela', 'Hollis', 'Moss'],
  ['Shadewick', 'Root-carved eaves shelter a small community deep in the Hollow.', 'Daro', 'Yara', 'Aven'],
  ['Elderstead', 'Woodcutters and herbalists share the clearing beneath the elder trees.', 'Tessa', 'Arlo', 'Wren'],
  ['Tidehaven', 'An island village whose paths always lead back to the sea.', 'Corin', 'Isla', 'Neri'],
  ['Whisperwell', 'A remote gathering place among the western green isles.', 'Elow', 'Maren', 'Sage'],
  ['Silverbrook', 'Meadow cottages overlook the river crossings of Silverreach.', 'Finn', 'Della', 'Ivo'],
  ['Cinderhome', 'A welcoming stop where the amber ridges meet Cindergrove.', 'Runa', 'Bryn', 'Suri'],
  ['Saffron Wells', 'A caravan hamlet around the desert’s deep freshwater wells.', 'Zari', 'Malik', 'Safiya'],
  ['Orchid Landing', 'Jungle explorers rest above the rain-fed island channels.', 'Tavi', 'Koa', 'Nima'],
  ['Sunveil Bazaar', 'A sandstone market town sheltering the caravans beneath cloth awnings.', 'Nasrin', 'Rafi', 'Samira'],
  ['Mistwood Haven', 'A timber town beneath the great jungle canopy, built for the long expeditions ahead.', 'Izel', 'Tane', 'Amaya'],
];
export const VILLAGES: readonly Village[] = [...EXPEDITIONS.slice(0, 12), ...['dune-wells','orchid-isles'].map(id=>EXPEDITIONS.find(camp=>camp.id===id)!)].map((camp, index) => ({
  id: `village-${camp.id}`, name: villageDetails[index][0], zone: camp.zone,
  x: index ? camp.x : -26, z: index ? camp.z : 100, description: villageDetails[index][1],
})).concat(CITY_LAYOUTS.slice(1).map(city=>({id:city.id,name:city.name,zone:city.zone,x:city.x,z:city.z,description:`A thriving walled city with guild halls, gardens and airship passage.`,size:'town' as const})));
export const insideVillageSafeArea = (x: number, z: number) => insideAnyCity(x,z) || VILLAGES.some(village => Math.hypot(x - village.x, z - village.z) < VILLAGE_SAFE_RADIUS);
export function villageFootprint(prop: Pick<VillageProp, 'kind' | 'rotation'>) {
  const size = VILLAGE_PROP_SIZES[prop.kind], turned = Math.abs(Math.sin(prop.rotation)) > .5;
  return { width: turned ? size.depth : size.width, depth: turned ? size.width : size.depth };
}
function plotSamples(prop: Pick<VillageProp, 'kind' | 'rotation' | 'x' | 'z'>, coreTown=false) {
  const { width, depth } = villageFootprint(prop), heights: number[] = [];
  for (let x = prop.x - width / 2; x <= prop.x + width / 2 + .001; x += width / 4) for (let z = prop.z - depth / 2; z <= prop.z + depth / 2 + .001; z += depth / 4) {
    const surface = surfaceAt(x, z); if (surface.water || insideAirshipApproach(x,z) || !coreTown&&inCore(x,z)) return;
    heights.push(surface.height);
  }
  return heights;
}
/** Place the authored ground-origin model on a level foundation above the highest plot tile. */
export function villagePropHeight(prop: VillageProp) { return Math.max(...plotSamples(prop,prop.villageId.startsWith('town-')) ?? [groundHeight(prop.x,prop.z)]); }
const reservedCamps = EXPEDITIONS.flatMap(camp => [
  ...EXPEDITION_ENEMY_OFFSETS.map(point => ({ x: camp.x + point.x, z: camp.z + point.z, r: 1 })),
  ...EXPEDITION_NODE_OFFSETS.map(point => ({ x: camp.x + point.x, z: camp.z + point.z, r: 1.8 })),
  ...[-5,5].map(dx => ({x:camp.x+dx,z:camp.z,r:1.2})),
]);
const props: VillageProp[] = [];
function separated(prop: VillageProp) {
  const { width, depth } = villageFootprint(prop);
  const circleGap = (point: { x:number; z:number; r:number }) => Math.hypot(Math.max(0,Math.abs(point.x-prop.x)-width/2),Math.max(0,Math.abs(point.z-prop.z)-depth/2)) > point.r + .6;
  if (!reservedCamps.every(circleGap) || !VILLAGES.every(village => circleGap({...village,r:2.5}))) return false;
  return props.every(other => {
    const footprint = villageFootprint(other);
    if(Math.abs(prop.x-other.x) <= (width+footprint.width)/2+1.7 && Math.abs(prop.z-other.z) <= (depth+footprint.depth)/2+1.7)return false;
    // Reserve the actual front ramp as well as the room, including subsequently placed lamps.
    for(const [house,obstacle] of [[prop,other],[other,prop]]){
      if(house.kind!=='cottage'&&house.kind!=='inn')continue;
      const offset=VILLAGE_PROP_SIZES[house.kind].depth/2+1.5,turned=Math.abs(Math.sin(house.rotation))>.5,size=villageFootprint(obstacle);
      const x=house.x+Math.sin(house.rotation)*offset,z=house.z+Math.cos(house.rotation)*offset;
      if(Math.abs(x-obstacle.x)<size.width/2+(turned?1.5:1.4)+.8&&Math.abs(z-obstacle.z)<size.depth/2+(turned?1.4:1.5)+.8)return false;
    }
    return true;
  });
}
const plan: [VillagePropKind,number,number,number][] = [
  ['inn',0,-17,0],['cottage',-17,-4,Math.PI/2],['cottage',17,-4,-Math.PI/2],
  ['stall',12,6,-Math.PI/2],['well',0,7,0],['lantern',-7,-4,0],['lantern',7,-4,0],
];
const townPlan: [VillagePropKind,number,number,number][] = [
  ['stall',-12,25,0],['well',9,25,0],['lantern',-7,-4,0],['lantern',7,-4,0],
];
for (const village of VILLAGES) for (const [index,entry] of (village.size==='town'?townPlan:plan).entries()) {
  const [kind,plannedX,dz,rotation] = entry; let chosen:VillageProp|undefined, score=Infinity;
  // Keep Willowbrook's west cottage entry ramp clear of the neighboring inn.
  const dx=village.id==='village-pinewake'&&index===1?-25:plannedX;
  const search=village.size==='town'?0:22;
  for(let ox=-search;ox<=search;ox+=2)for(let oz=-search;oz<=search;oz+=2){
    if(ox*ox+oz*oz>=score)continue; // Slope variation cannot improve this lower bound.
    const prop={id:`${village.id}-${kind}-${index}`,villageId:village.id,kind,x:village.x+dx+ox,z:village.z+dz+oz,rotation};
    const heights=plotSamples(prop,village.size==='town');if(!heights||surfaceAt(prop.x,prop.z).zone!==village.zone||Math.hypot(prop.x-village.x,prop.z-village.z)>(village.size==='town'?46:26)||!separated(prop))continue;
    const variation=Math.max(...heights)-Math.min(...heights);if(variation>.5)continue;
    const value=ox*ox+oz*oz+variation*8;if(value<score){chosen=prop;score=value;}
  }
  if(!chosen)throw new Error(`No dry, gently sloping building plot for ${village.id}/${kind}`);
  props.push(chosen);
}
export const VILLAGE_PROPS: readonly VillageProp[] = props;
export interface TownBounds { id:string; name:string; zone:ZoneId; minX:number; maxX:number; minZ:number; maxZ:number }
export const TOWN_SPAWN_DISTANCE = 100;
/** Include the whole town, not just its map marker. Scenery and pursuit keep their separate rules. */
export const TOWN_BOUNDS: readonly TownBounds[] = [
  ...Object.entries(REGION_ORIGINS).map(([zone, origin]) => {
    const radius=CITY_RADIUS;
    return {id:`town-${zone}`,name:zone==='greenwood'?CITY.name:getZone(zone as ZoneId).name,zone:zone as ZoneId,minX:origin.x-radius,maxX:origin.x+radius,minZ:origin.z-radius,maxZ:origin.z+radius};
  }),
  ...VILLAGES.filter(village=>village.size!=='town').map(village=>{
    const plots=VILLAGE_PROPS.filter(prop=>prop.villageId===village.id);
    return {id:village.id,name:village.name,zone:village.zone,
      minX:Math.min(village.x-8,...plots.map(prop=>prop.x-villageFootprint(prop).width/2-3)),
      maxX:Math.max(village.x+8,...plots.map(prop=>prop.x+villageFootprint(prop).width/2+3)),
      minZ:Math.min(village.z-8,...plots.map(prop=>prop.z-villageFootprint(prop).depth/2-3)),
      maxZ:Math.max(village.z+8,...plots.map(prop=>prop.z+villageFootprint(prop).depth/2+3))};
  }),
];
export function townDistance(point:{x:number;z:number}) {
  if(!Number.isFinite(point.x)||!Number.isFinite(point.z))return -Infinity;
  return Math.min(...TOWN_BOUNDS.map(town=>Math.hypot(Math.max(town.minX-point.x,0,point.x-town.maxX),Math.max(town.minZ-point.z,0,point.z-town.maxZ))));
}
export const townSpawnAllowed = (point:{x:number;z:number}) => townDistance(point)>=TOWN_SPAWN_DISTANCE;
// Full footprints reserve space for NPCs and scenery; houses use wall colliders at runtime.
export const VILLAGE_COLLIDERS = VILLAGE_PROPS.map(prop=>{
  const {width,depth}=villageFootprint(prop);
  return {x:prop.x,z:prop.z,r:Math.hypot(width,depth)/2,halfWidth:width/2,halfDepth:depth/2};
});
const npcs:VillageNPC[]=[];
for(const [index,village] of VILLAGES.entries())for(const[roleIndex,role]of(['merchant','warden','healer'] as const).entries()){
  const landmark=VILLAGE_PROPS.find(prop=>prop.villageId===village.id&&prop.kind===(role==='merchant'?'stall':'well'))!;
  const desired=role==='merchant'?{x:landmark.x-village.x+Math.sin(landmark.rotation)*2.6,z:landmark.z-village.z+Math.cos(landmark.rotation)*2.6}:role==='healer'?{x:landmark.x-village.x-2.4,z:landmark.z-village.z}:{x:0,z:-3};
  let at:{x:number;z:number}|undefined,score=Infinity;
  // City stalls and wells sit beyond the hamlets' 22m placement window.
  const search=village.size==='town'?32:22,radius=village.size==='town'?46:24;
  for(let dx=-search;dx<=search;dx++)for(let dz=-search;dz<=search;dz++){
    const value=(dx-desired.x)**2+(dz-desired.z)**2;if(value>=score)continue;
    const x=village.x+dx,z=village.z+dz;
    if(Math.hypot(dx,dz)>radius||surfaceAt(x,z).water||surfaceAt(x,z).zone!==village.zone||reservedCamps.some(p=>Math.hypot(x-p.x,z-p.z)<p.r+1)||VILLAGE_COLLIDERS.some(p=>Math.abs(x-p.x)<p.halfWidth+1.2&&Math.abs(z-p.z)<p.halfDepth+1.2)||ALL_CITY_COLLIDERS.some(p=>Math.abs(x-p.x)<p.halfWidth+1.2&&Math.abs(z-p.z)<p.halfDepth+1.2)||npcs.some(p=>Math.hypot(x-p.x,z-p.z)<2.4))continue;
    at={x,z};score=value;
  }
  if(!at)throw new Error(`No clear NPC position in ${village.id}`);
  const lines=role==='merchant'?[`Welcome to ${village.name}. My stall is stocked for the road ahead.`,`Trade a little, then follow the lanterns to your next adventure.`]
    :role==='warden'?[`The paths outside ${village.name} have grown restless. Keep your weapon close.`,`Wildlife usually keeps beyond our lanterns. Lose any pursuers before you come inside.`]
    :[`Rest a moment. Even the longest journey needs a quiet place to recover.`,`The well of ${village.name} is always open to weary travellers.`];
  npcs.push({id:`${village.id}-${role}`,villageId:village.id,name:(village.size==='town'?{greenwood:['Hilda','Oren','Lina'],amberwild:['Ada Copperfield','Hugh Emberwatch','Maris Sunleaf'],frostmarch:['Edda Snowledger','Bjorn Icewatch','Liv Starwell'],hollow:['Nyra Dusktrade','Dain Rootwatch','Lyra Moonwell'],sunveil:villageDetails[14].slice(2),mistwood:villageDetails[15].slice(2)}[village.zone]:villageDetails[index].slice(2))[roleIndex],role,...at,rotation:role==='merchant'?landmark.rotation:role==='healer'?Math.PI/2:0,zone:village.zone,lines});
}
const shadyHost = npcs.find(npc => npc.zone === 'greenwood' && npc.role === 'merchant')!;
const shadySpot = Array.from({length: 81}, (_, i) => ({x:shadyHost.x + i % 9 - 4, z:shadyHost.z + Math.floor(i / 9) - 4}))
  .find(at => Math.hypot(at.x-shadyHost.x,at.z-shadyHost.z) >= 3 && !surfaceAt(at.x,at.z).water
    && !npcs.some(npc => Math.hypot(at.x-npc.x,at.z-npc.z)<2.4)
    && ![...VILLAGE_COLLIDERS,...ALL_CITY_COLLIDERS].some(p=>Math.abs(at.x-p.x)<p.halfWidth+1.2&&Math.abs(at.z-p.z)<p.halfDepth+1.2));
if (!shadySpot) throw Error('No clear shady merchant position.');
export const SHADY_MERCHANT: VillageNPC = { ...shadyHost, ...shadySpot, id:'shady-merchant', name:'Veyl', rotation:0,
  lines:['Keep your voice down. Those goblins carry more than stolen gold.', 'Bring me a sealed MOSS voucher. I know a treasury that will honor it.'] };
export const VILLAGE_NPCS: readonly VillageNPC[] = [...npcs, ...CITY_VENDORS, SHADY_MERCHANT];

const spawns:WildernessSpawn[]=[];
const enemyKind=(zone:ZoneId,index:number):EnemyKind=>zone==='hollow'?(index%2?'ice-wisp':'briar-sentinel'):getZone(zone).enemyKind;
const wildKinds:Record<ZoneId,readonly EnemyKind[]>={
  greenwood:['moss-slime','bramble-wolf','briar-boar','grove-spider','marsh-toad'],
  amberwild:['briar-sentinel','ember-beetle','dune-scorpion','stone-golem'],
  frostmarch:['ice-wisp','frost-yeti','crystal-bat','stone-golem'],
  hollow:['briar-sentinel','ice-wisp','marsh-toad','void-stalker','grove-spider'],
  sunveil:['dune-scorpion','ember-beetle','stone-golem','crystal-bat'],
  mistwood:['grove-spider','marsh-toad','briar-boar','void-stalker'],
};
function spawnable(x:number,z:number,zone?:ZoneId){
  const surface=surfaceAt(x,z);
  if(surface.water||surface.beach||(zone&&surface.zone!==zone)||x<WORLD_BOUNDS.minX+10||x>WORLD_BOUNDS.maxX-10||z<WORLD_BOUNDS.minZ+10||z>WORLD_BOUNDS.maxZ-10)return false;
  if(!townSpawnAllowed({x,z}))return false;
  if(VILLAGES.some(v=>Math.hypot(x-v.x,z-v.z)<VILLAGE_SAFE_RADIUS+9)||reservedCamps.some(p=>Math.hypot(x-p.x,z-p.z)<p.r+2)||spawns.some(p=>Math.hypot(x-p.x,z-p.z)<11))return false;
  return [[-3,0],[3,0],[0,-3],[0,3]].every(([dx,dz])=>!surfaceAt(x+dx,z+dz).water);
}
for(const camp of EXPEDITIONS)for(let index=0;index<(camp.zone==='sunveil'||camp.zone==='mistwood'?4:3);index++){
  let chosen:{x:number;z:number}|undefined;
  for(let radius=138;radius<=640&&!chosen;radius+=8)for(let step=0;step<32;step++){
    const angle=(index/3+step/32)*Math.PI*2,x=Math.round((camp.x+Math.sin(angle)*radius)/2)*2,z=Math.round((camp.z+Math.cos(angle)*radius)/2)*2;
    if(spawnable(x,z,camp.zone)&&(!(camp.zone==='sunveil'||camp.zone==='mistwood')||surfaceAt(x,z).regionId===camp.id)){chosen={x,z};break;}
  }
  if(!chosen)throw new Error(`No safe roaming position for ${camp.id}/${index}`);
  spawns.push({id:`expedition-${camp.id}-enemy-${index}`,kind:camp.zone==='sunveil'||camp.zone==='mistwood'?wildKinds[camp.zone][index]:enemyKind(camp.zone,index),zone:camp.zone,...chosen});
}
export const WILDERNESS_ENCOUNTER_COUNT = 900;
let newCount=0;
function addWild(x:number,z:number){
  if(newCount>=WILDERNESS_ENCOUNTER_COUNT||!spawnable(x,z))return;
  const zone=surfaceAt(x,z).zone;
  spawns.push({id:`wilderness-${zone}-${String(newCount).padStart(3,'0')}`,kind:wildKinds[zone][newCount%wildKinds[zone].length],zone,x,z});newCount++;
}
// The first few paths out of the starter town have encounters, not a long empty march.
for(let step=0;step<48&&newCount<12;step++){
  const angle=step/12*Math.PI*2,radius=190+Math.floor(step/12)*22;
  addWild(Math.round(Math.sin(angle)*radius/2)*2,Math.round(Math.cos(angle)*radius/2)*2);
}
// A shuffled coarse lattice spreads persistent encounter homes over the entire dry realm.
const candidates:{x:number;z:number;order:number}[]=[];
for(let x=WORLD_BOUNDS.minX+32;x<WORLD_BOUNDS.maxX;x+=64)for(let z=WORLD_BOUNDS.minZ+32;z<WORLD_BOUNDS.maxZ;z+=64){
  let hash=(Math.imul(x+811,73856093)^Math.imul(z+997,19349663))>>>0;
  candidates.push({x:x+(hash%15-7)*2,z:z+((hash>>>8)%15-7)*2,order:hash});
}
candidates.sort((a,b)=>a.order-b.order);
for(const point of candidates)addWild(point.x,point.z);
if(newCount<WILDERNESS_ENCOUNTER_COUNT)for(const point of candidates){addWild(point.x+22,point.z+22);if(newCount===WILDERNESS_ENCOUNTER_COUNT)break;}
if(newCount!==WILDERNESS_ENCOUNTER_COUNT)throw new Error(`Only ${newCount} safe wilderness homes found`);
export const WILDERNESS_SPAWNS: readonly WildernessSpawn[] = spawns;
