import assert from 'node:assert/strict';
import { VILLAGES, VILLAGE_PROPS, VILLAGE_NPCS, VILLAGE_COLLIDERS, VILLAGE_SAFE_RADIUS, VILLAGE_PROP_SIZES, villageFootprint, villagePropHeight, insideVillageSafeArea, WILDERNESS_SPAWNS } from '../src/settlements.ts';
import { EXPEDITIONS, REGION_ORIGINS, EXPEDITION_NODE_OFFSETS, groundHeight, surfaceAt, inCore, waterAt, WORLD_BOUNDS } from '../src/landscape.ts';
import { WORLD_COLLIDERS, WORLD_SCENERY, canTraverse } from '../src/realm.ts';
import { findPath } from '../src/navigation.ts';
import { MONSTERS } from '../src/bestiary.ts';

assert.equal(VILLAGES.length,12);assert.equal(VILLAGE_NPCS.length,38);assert.equal(VILLAGE_PROPS.length,84);assert.equal(VILLAGE_COLLIDERS.length,VILLAGE_PROPS.length);
assert.equal(VILLAGE_SAFE_RADIUS,36);assert.equal(WILDERNESS_SPAWNS.length,348);
assert.equal(new Set([...VILLAGES,...VILLAGE_PROPS,...VILLAGE_NPCS,...WILDERNESS_SPAWNS].map(point=>point.id)).size,VILLAGES.length+VILLAGE_PROPS.length+VILLAGE_NPCS.length+WILDERNESS_SPAWNS.length,'content IDs are unique across all shared catalogs');
const route=(from,to)=>{
 const path=findPath(from,to,WORLD_COLLIDERS,WORLD_BOUNDS);assert(path.length,`reachable ${to.id||JSON.stringify(to)}`);
 let previous=from;for(const step of path){assert(canTraverse(previous,step),'every route uses authoritative swept collision');previous=step;}
 assert(Math.hypot(previous.x-to.x,previous.z-to.z)<.01,'the route reaches its free destination');
};
for(const village of VILLAGES){
 assert(village.name&&village.description&&!waterAt(village.x,village.z)&&!inCore(village.x,village.z));assert(canTraverse(village,village),'every hamlet has a clear central square');assert(insideVillageSafeArea(village.x,village.z));
 assert.equal(surfaceAt(village.x,village.z).zone,village.zone);
 const residents=VILLAGE_NPCS.filter(npc=>npc.villageId===village.id),buildings=VILLAGE_PROPS.filter(prop=>prop.villageId===village.id);
 assert.deepEqual(residents.map(npc=>npc.role).sort(),['healer','merchant','warden']);
 assert.equal(buildings.filter(prop=>prop.kind==='cottage').length,2);assert.equal(buildings.filter(prop=>prop.kind==='lantern').length,2);
 for(const kind of ['inn','stall','well'])assert.equal(buildings.filter(prop=>prop.kind===kind).length,1);
 for(const npc of residents){
  assert(npc.name&&npc.lines.length>=2&&npc.lines.every(line=>line.length>10));assert.equal(npc.zone,village.zone);assert(!waterAt(npc.x,npc.z));assert(insideVillageSafeArea(npc.x,npc.z));
  for(const[dx,dz]of [[0,0],[.6,0],[-.6,0],[0,.6],[0,-.6]])assert(canTraverse({x:npc.x+dx,z:npc.z+dz},{x:npc.x+dx,z:npc.z+dz}),'villager interaction space stays clear of buildings and old camp pillars');
  route(village,npc);
  if(npc.role==='merchant'){const stall=buildings.find(prop=>prop.kind==='stall');assert(Math.hypot(npc.x-stall.x,npc.z-stall.z)<=4,'merchants stand beside their actual trading stall');}
 }
 route(REGION_ORIGINS[village.zone],village);
 assert(WILDERNESS_SPAWNS.some(spawn=>Math.hypot(spawn.x-village.x,spawn.z-village.z)<100),'each hamlet has nearby adventures beyond its safe circle');
}
assert(VILLAGES.some(v=>v.zone==='greenwood'&&Math.hypot(v.x,v.z)<125),'a new player reaches a hamlet soon after leaving the starter town');
for(const[propIndex,prop]of VILLAGE_PROPS.entries()){
 const collider=VILLAGE_COLLIDERS[propIndex],{width,depth}=villageFootprint(prop),plot=[];
 assert(Number.isFinite(prop.rotation)&&VILLAGE_PROP_SIZES[prop.kind]);assert.equal(collider.halfWidth,width/2);assert.equal(collider.halfDepth,depth/2);assert.equal(WORLD_COLLIDERS.includes(collider), !['cottage','inn'].includes(prop.kind),'home bounding proxies reserve plots but do not obstruct interiors');
 for(let dx=-width/2;dx<=width/2+.001;dx+=width/4)for(let dz=-depth/2;dz<=depth/2+.001;dz+=depth/4){assert(!waterAt(prop.x+dx,prop.z+dz)&&!inCore(prop.x+dx,prop.z+dz),'every building footprint is dry and outside existing towns');plot.push(groundHeight(prop.x+dx,prop.z+dz));}
 assert(Math.max(...plot)-Math.min(...plot)<=.5,'building plots have at most half a metre of slope');assert.equal(villagePropHeight(prop),Math.max(...plot),'authored model foundations use the highest ground tile');
 assert.equal(canTraverse(prop,prop), ['cottage','inn'].includes(prop.kind),'home centers are walkable; other physical props retain solid footprints');
 assert(!canTraverse({x:prop.x-width/2-2,z:prop.z},{x:prop.x+width/2+2,z:prop.z},[collider]),'a swept move cannot pass through a cottage or stall');
}
for(const camp of EXPEDITIONS){
 for(let i=0;i<3;i++){const spawn=WILDERNESS_SPAWNS.find(spawn=>spawn.id===`expedition-${camp.id}-enemy-${i}`);assert(spawn,'retained camp encounter IDs survive village construction');assert.equal(spawn.zone,camp.zone);}
 for(const offset of EXPEDITION_NODE_OFFSETS){const point={x:camp.x+offset.x,z:camp.z+offset.z};assert(canTraverse(point,point)&&!waterAt(point.x,point.z),'village construction preserves every existing resource anchor');route(camp,point);}
}
const quadrants=new Set(),regions=new Set();let nearStart=0;
for(const spawn of WILDERNESS_SPAWNS){
 assert([spawn.x,spawn.z].every(Number.isFinite));assert(!waterAt(spawn.x,spawn.z)&&!inCore(spawn.x,spawn.z));assert(canTraverse(spawn,spawn),'no monster starts inside a tree, rock, building or landmark');assert.equal(surfaceAt(spawn.x,spawn.z).zone,spawn.zone);
 assert(VILLAGES.every(village=>Math.hypot(spawn.x-village.x,spawn.z-village.z)>=VILLAGE_SAFE_RADIUS+9),'roaming monsters have room to wander without entering village safe areas');
 assert(MONSTERS[spawn.kind]&&!['root-warden','stormhorn-behemoth'].includes(spawn.kind),'ordinary wilderness homes use catalog monsters without duplicating bosses');
 const camp=EXPEDITIONS.reduce((a,b)=>Math.hypot(spawn.x-a.x,spawn.z-a.z)<Math.hypot(spawn.x-b.x,spawn.z-b.z)?a:b);route(camp,spawn);
 quadrants.add(`${spawn.x<48?'west':'east'}-${spawn.z< -48?'north':'south'}`);regions.add(surfaceAt(spawn.x,spawn.z).regionId);
 if(Math.hypot(spawn.x,spawn.z)<150)nearStart++;
}
assert.equal(quadrants.size,4);assert(regions.size>=16,'encounters populate all sixteen expedition regions');assert(nearStart>=10,'the first roads out of Lanternreach are populated');
for(const village of VILLAGES)assert(!WORLD_SCENERY.some(solid=>(solid.kind==='tree'||solid.kind==='rock')&&Math.hypot(solid.x-village.x,solid.z-village.z)<VILLAGE_SAFE_RADIUS+3),'old random woodland cannot cover new village plots');
console.log(`PASS: ${VILLAGES.length} dry hamlets, ${VILLAGE_PROPS.length} matching reserved footprints, ${VILLAGE_NPCS.length} reachable service NPCs, ${WILDERNESS_SPAWNS.length} collision-free roaming homes, ${nearStart} starter-road encounters and all expedition regions.`);
