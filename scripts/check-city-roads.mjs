import assert from 'node:assert/strict';
import { CITY, CITY_RADIUS, CITY_ROADS, CITY_HOMES, CITY_PROPS, CITY_VENDORS, AUCTIONEER, insideCity } from '../src/city.ts';
import { BUILDINGS, buildingPoint, buildingDoorWidth, BUILDING_RAMP_LENGTH, BUILDING_FLOOR_LIFT, buildingFloorHeight } from '../src/buildings.ts';
import { WORLD_COLLIDERS, WORLD_BOUNDS, WORLD_SCENERY, PLAYER_RADIUS, canTraverse, toWorld } from '../src/realm.ts';
import { findPath } from '../src/navigation.ts';
import { TRAINER_NPCS } from '../src/training.ts';
import { WILDERNESS_SPAWNS, insideVillageSafeArea } from '../src/settlements.ts';
import { groundHeight, waterAt, surfaceAt, TERRAIN_STEP, TERRAIN_MAX_STEP } from '../src/landscape.ts';
import { ZONES } from '../src/content.ts';
import { WORLD_BOSS } from '../src/bestiary.ts';

const ratio=(CITY_RADIUS/47)**2;
assert(ratio>=2.8&&ratio<=3.2,`capital footprint should be about three times the old area, got ${ratio.toFixed(2)}×`);
assert.equal(CITY_HOMES.length,17,'the expanded residential layout includes seventeen homes');
assert.equal(new Set(CITY_HOMES.map(home=>home.id)).size,17,'each home has a stable unique identity');
assert(CITY_ROADS.length>10,'the city publishes its actual road network');
assert(insideCity(CITY.x+CITY_RADIUS-.01,CITY.z)&&!insideCity(CITY.x+CITY_RADIUS+.01,CITY.z),'public safe-area radius matches its published boundary');
const gates=CITY_PROPS.filter(prop=>prop.kind==='city-gate');assert.equal(gates.length,4);
assert.deepEqual(gates.map(gate=>[gate.x,gate.z]).sort(),[[0,78],[0,-78],[78,0],[-78,0]].sort(),'all four cardinal gates border the enlarged city');

const key=(x,z)=>`${Math.round(x*2)},${Math.round(z*2)}`,point=id=>{const [x,z]=id.split(',').map(Number);return {x:x/2,z:z/2};};
const roadContains=(p,road,inset=0)=>{
  const dx=road.x2-road.x1,dz=road.z2-road.z1,length=Math.hypot(dx,dz),px=p.x-road.x1,pz=p.z-road.z1;
  const along=(px*dx+pz*dz)/length,across=Math.abs(px*dz-pz*dx)/length;
  return along>=-1e-7&&along<=length+1e-7&&across<=road.width/2-inset+1e-7;
};
const onRoad=(p,inset=0)=>CITY_ROADS.some(road=>roadContains(p,road,inset));
const roadNodes=new Map(),blocked=[];
for(const [index,road] of CITY_ROADS.entries()){
  assert([road.x1,road.z1,road.x2,road.z2,road.width].every(Number.isFinite));
  const dx=road.x2-road.x1,dz=road.z2-road.z1,length=Math.hypot(dx,dz);assert(length>0&&road.width>=1.5,`road ${index} has positive length and walkable width`);
  const nx=-dz/length,nz=dx/length,alongSteps=Math.ceil(length/.5),acrossSteps=Math.max(2,Math.ceil((road.width-PLAYER_RADIUS*2)/.5));
  // Player centres at the inner pavement edges sweep the entire declared street width.
  for(let i=0;i<=alongSteps;i++)for(let j=0;j<=acrossSteps;j++){
    const offset=(-road.width/2+PLAYER_RADIUS)+(road.width-PLAYER_RADIUS*2)*j/acrossSteps;
    const p={x:road.x1+dx*i/alongSteps+nx*offset,z:road.z1+dz*i/alongSteps+nz*offset};
    if(!canTraverse(p,p,WORLD_COLLIDERS,WORLD_BOUNDS)){
      if(!blocked.some(value=>value.road===index))blocked.push({road:index,point:p,solids:WORLD_COLLIDERS.filter(s=>!canTraverse(p,p,[s],WORLD_BOUNDS)).map(({x,z,halfWidth,halfDepth,r})=>({x,z,halfWidth,halfDepth,r}))});
    }
    assert(!waterAt(p.x,p.z),`road ${index} never crosses water`);
    if(insideCity(p.x,p.z))assert.equal(surfaceAt(p.x,p.z).zone,CITY.zone,`road ${index} retains capital biome identity`);
    assert(Math.abs(groundHeight(p.x,p.z)-groundHeight(CITY.x,CITY.z))<.01,`road ${index} remains on the same level city ground`);
  }
  for(let x=Math.ceil((Math.min(road.x1,road.x2)-road.width/2)*2)/2;x<=Math.max(road.x1,road.x2)+road.width/2+.001;x+=.5)
    for(let z=Math.ceil((Math.min(road.z1,road.z2)-road.width/2)*2)/2;z<=Math.max(road.z1,road.z2)+road.width/2+.001;z+=.5){
      const p={x,z};if(roadContains(p,road,PLAYER_RADIUS)&&canTraverse(p,p))roadNodes.set(key(x,z),p);
    }
}
assert.deepEqual(blocked,[],'painted road widths cannot cover shared building walls, posts, trees, counters or other solids');
const seed=gates[0],reached=new Set(),queue=[];
function joins(target){
  return [...[-.5,0,.5]].flatMap(dx=>[-.5,0,.5].map(dz=>({x:Math.round(target.x*2)/2+dx,z:Math.round(target.z*2)/2+dz})))
    .filter(p=>roadNodes.has(key(p.x,p.z))&&canTraverse(target,p));
}
for(const p of joins(seed)){const id=key(p.x,p.z);reached.add(id);queue.push(id);}
assert(queue.length,'the first gate opens directly onto painted streets');
for(let index=0;index<queue.length;index++){
  const from=point(queue[index]);
  for(const [dx,dz] of [[.5,0],[-.5,0],[0,.5],[0,-.5]]){
    const to={x:from.x+dx,z:from.z+dz},id=key(to.x,to.z);
    if(reached.has(id)||!roadNodes.has(id)||!canTraverse(from,to))continue;
    reached.add(id);queue.push(id);
  }
}
function roadReachable(target,label){assert(onRoad(target),`${label} connects to a painted street`);assert(joins(target).some(p=>reached.has(key(p.x,p.z))),`${label} connects through collision-free streets to all four gates`);}
for(const gate of gates){
  roadReachable(gate,gate.id);assert(canTraverse(buildingPoint(gate,0,-6),buildingPoint(gate,0,6)),`${gate.id} has an open passage through both wall faces`);
}
const cityBuildings=BUILDINGS.filter(building=>insideCity(building.x,building.z));
for(const plot of CITY_HOMES)assert(cityBuildings.some(building=>building.id===plot.id),`${plot.id} is registered as a real walkable building`);
for(const building of cityBuildings){
  const ramp=buildingPoint(building,0,building.depth/2+BUILDING_RAMP_LENGTH),door=buildingPoint(building,0,building.depth/2),aisle=buildingPoint(building,0,1.5);
  roadReachable(door,`${building.id} front door`);
  assert(canTraverse(ramp,door)&&canTraverse(door,aisle),`${building.id} has a clear front door and interior aisle`);
  for(const offset of [-buildingDoorWidth(building)/2+PLAYER_RADIUS+.06,0,buildingDoorWidth(building)/2-PLAYER_RADIUS-.06]){
    assert(canTraverse(buildingPoint(building,offset,building.depth/2+.5),buildingPoint(building,offset,building.depth/2-.5)),`${building.id} retains its full usable doorway width`);
  }
  assert(Math.abs(buildingFloorHeight(aisle.x,aisle.z)-building.y)<.01,`${building.id} uses the same rendered and authoritative floor`);
  assert(Math.abs(building.y-groundHeight(building.x,building.z)-BUILDING_FLOOR_LIFT)<.01,`${building.id} sits on the expanded level ground`);
}
const spawn=toWorld(CITY.zone,ZONES.find(zone=>zone.id===CITY.zone).spawn);
const services=[...TRAINER_NPCS.filter(npc=>npc.zone===CITY.zone),...CITY_VENDORS,AUCTIONEER];assert.equal(services.length,9);
for(const npc of services){
  const front={x:npc.x+Math.sin(npc.rotation)*1.5,z:npc.z+Math.cos(npc.rotation)*1.5};
  assert(insideVillageSafeArea(npc.x,npc.z)&&canTraverse(front,npc)&&!waterAt(front.x,front.z),`${npc.id} has a safe, dry frontal interaction`);
  const route=findPath(spawn,front,WORLD_COLLIDERS,WORLD_BOUNDS);assert(route.length,`${npc.id} is reachable on foot from spawn`);
  let previous=spawn;for(const step of route){assert(canTraverse(previous,step),`${npc.id} route obeys shared collision`);previous=step;}
  assert(Math.hypot(previous.x-front.x,previous.z-front.z)<.01,`${npc.id} route reaches its actual front instead of stopping at a wall`);
}
assert(!WORLD_SCENERY.some(solid=>['tree','rock'].includes(solid.kind)&&insideCity(solid.x,solid.z)),'no old or generated trees and rocks spawn in the new city footprint');
const monsters=[...ZONES.flatMap(zone=>zone.enemies.map(enemy=>toWorld(zone.id,enemy))),...WILDERNESS_SPAWNS,WORLD_BOSS];
assert.deepEqual(monsters.filter(enemy=>insideCity(enemy.x,enemy.z)).map(enemy=>enemy.id),[],'static, roaming and boss homes stay outside the expanded capital');
for(let x=-CITY_RADIUS-12;x<=CITY_RADIUS+12;x+=TERRAIN_STEP)for(let z=-CITY_RADIUS-12;z<=CITY_RADIUS+12;z+=TERRAIN_STEP)
  for(const [dx,dz] of [[TERRAIN_STEP,0],[0,TERRAIN_STEP]])if(!waterAt(x,z)&&!waterAt(x+dx,z+dz))assert(Math.abs(groundHeight(x,z)-groundHeight(x+dx,z+dz))<=TERRAIN_MAX_STEP+.001,'city boundary terrain retains climbable continuous terraces');
console.log(`PASS city roads: ${ratio.toFixed(2)}× area, ${CITY_HOMES.length} homes, ${CITY_ROADS.length} clear full-width roads, four-gate connected street network, ${cityBuildings.length} walkable entrances/aisles, ${services.length} reachable NPC fronts, safe spawning and continuous terrain.`);
