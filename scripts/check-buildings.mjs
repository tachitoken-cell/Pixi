import assert from 'node:assert/strict';
import { BUILDINGS, BUILDING_CHAIRS, BUILDING_COLLIDERS, BUILDING_DOOR_WIDTH, BUILDING_RAMP_LENGTH, BUILDING_FLOOR_LIFT, buildingPoint, buildingAt, buildingFloorHeight, chairApproach } from '../src/buildings.ts';
import { WORLD_COLLIDERS, WORLD_SCENERY, canTraverse, toWorld } from '../src/realm.ts';
import { groundHeight, waterAt } from '../src/landscape.ts';
import { VILLAGES, VILLAGE_NPCS, VILLAGE_PROPS, insideVillageSafeArea } from '../src/settlements.ts';
import { CITY_LAYOUTS, BANK_HOME_IDS } from '../src/city.ts';
import { ZONES } from '../src/content.ts';
import { TRAINER_NPCS } from '../src/training.ts';
import { newJump, moveJump, startJump, jumpFloor, stepJump } from '../src/jumping.ts';

assert.equal(BUILDINGS.length,CITY_LAYOUTS.reduce((sum,city)=>sum+city.homes.length+2,0)+VILLAGE_PROPS.filter(p=>p.kind==='cottage'||p.kind==='inn').length);
assert.equal(BUILDING_CHAIRS.length,BUILDINGS.reduce((sum,b)=>sum+(b.id===BANK_HOME_IDS[b.zone]||b.kind==='auction-hall'?0:b.kind==='clocktower'?8:b.kind==='inn'?4:2),0));
assert.equal(new Set([...BUILDINGS,...BUILDING_CHAIRS].map(p=>p.id)).size,BUILDINGS.length+BUILDING_CHAIRS.length);
assert(BUILDING_COLLIDERS.every(collider=>WORLD_COLLIDERS.includes(collider)));
let raised = 0;
for (const building of BUILDINGS) {
  const {width,depth} = building;
  assert(width>=10&&depth>=9,'homes are at least twice their former width');
  assert.equal(buildingAt(building.x,building.z)?.id,building.id);
  assert.equal(buildingFloorHeight(building.x,building.z),building.y);
  const outside=buildingPoint(building,0,depth/2+BUILDING_RAMP_LENGTH), doorway=buildingPoint(building,0,depth/2), inside=buildingPoint(building,0,1.5);
  assert(!buildingAt(outside.x,outside.z));
  assert(canTraverse(outside,inside), `${building.id} has a clear outside-to-interior doorway`);
  // The door is wide enough for more than a single point/ray to enter.
  for (const x of [-.5,.5]) assert(canTraverse(buildingPoint(building,x,depth/2+1),buildingPoint(building,x,depth/2-1)));
  assert(canTraverse(doorway,doorway));
  const jump=newJump(outside.x,outside.z); let previous=outside;
  for(let i=1;i<=40;i++){
    const p={x:outside.x+(inside.x-outside.x)*i/40,z:outside.z+(inside.z-outside.z)*i/40};
    assert(!waterAt(p.x,p.z)); assert(moveJump(jump,previous,p),'ordinary walking can enter a raised floor');
    stepJump(jump,.025,jumpFloor(p.x,p.z));
    assert(Math.abs(jump.y-buildingFloorHeight(p.x,p.z))<.0001);previous=p;
  }
  assert.equal(jump.y,building.y);assert(jump.grounded);
  assert(startJump(jump,inside.x,inside.z));
  for(let t=0;t<100;t++)stepJump(jump,.02,jumpFloor(inside.x,inside.z));
  assert(jump.grounded);assert.equal(jump.y,building.y,'jumping lands on the interior floor');
  for(const [x,z,dx,dz]of [[-width/2,0,1,0],[width/2,0,1,0],[0,-depth/2,0,1],[width/2-1,depth/2,0,1]]){
    assert(!canTraverse(buildingPoint(building,x-dx,z-dz),buildingPoint(building,x+dx,z+dz)),`${building.id} solid walls cannot be crossed`);
  }
  for(let x=-width/2;x<=width/2;x++)for(let z=-depth/2;z<=depth/2;z++){
    const p=buildingPoint(building,x,z);assert(!waterAt(p.x,p.z));assert(building.y-groundHeight(p.x,p.z)>=BUILDING_FLOOR_LIFT-1e-9,'floorboards are lifted above all underlying terrain');
    if(building.y>groundHeight(p.x,p.z))raised++;
  }
  const village=VILLAGES.find(v=>building.id.startsWith(v.id+'-'));
  if(village)for(const x of [-width/2,width/2])for(const z of [-depth/2,depth/2]){
    const p=buildingPoint(building,x,z);assert(insideVillageSafeArea(p.x,p.z),'the whole home is protected by its settlement safe area');
  }
  for(const chair of BUILDING_CHAIRS.filter(chair=>chair.buildingId===building.id)){
    assert.equal(chair.y,building.y+.8); assert.equal(buildingAt(chair.x,chair.z)?.id,building.id);
    const approach=chairApproach(chair); assert(canTraverse(approach,approach),`${chair.id} approach is clear`);
    const dx=approach.x-building.x,dz=approach.z-building.z,c=Math.cos(building.rotation),s=Math.sin(building.rotation),localX=dx*c-dz*s;
    const aisle=buildingPoint(building,localX,1.5);
    if(building.kind!=='clocktower')assert(canTraverse(inside,aisle)&&canTraverse(aisle,approach),`${chair.id} can be reached around the dining table`);
    assert(!canTraverse(chair,chair),'standing movement cannot clip through chair geometry');
  }
  assert(!WORLD_SCENERY.some(p=>['tree','rock'].includes(p.kind)&&Math.abs(p.x-building.x)<width/2+.6&&Math.abs(p.z-building.z)<depth/2+.6),'no legacy scenery covers a house');
}
for(const npc of [...TRAINER_NPCS,...VILLAGE_NPCS,...ZONES.map(zone=>toWorld(zone.id,zone.npc))]){
  assert(canTraverse(npc,npc),'building expansion preserves NPC positions');
}
for(const zone of ZONES)for(const point of [zone.spawn,...zone.nodes,...zone.enemies,...zone.gateways,...(zone.beacon?[zone.beacon]:[])]){
  const p=toWorld(zone.id,point);assert(canTraverse(p,p),'building expansion preserves quest, resource and encounter anchors');
}
// Exercise a raised foundation too: current chosen plots are perfectly level.
const raisedHome=BUILDINGS[0], originalY=raisedHome.y;
try {
  raisedHome.y+=.5;
  const outer=buildingPoint(raisedHome,0,raisedHome.depth/2+BUILDING_RAMP_LENGTH), inner=buildingPoint(raisedHome,0,raisedHome.depth/2);
  const outerY=groundHeight(outer.x,outer.z),jump=newJump(outer.x,outer.z);let previous=outer;
  for(let i=0;i<=30;i++){
    const p={x:outer.x+(inner.x-outer.x)*i/30,z:outer.z+(inner.z-outer.z)*i/30};
    assert(Math.abs(buildingFloorHeight(p.x,p.z)-(outerY+(raisedHome.y-outerY)*i/30))<.00001,'front ramp smoothly bridges terrain and the raised floor');
    assert(moveJump(jump,previous,p));previous=p;
  }
  assert.equal(jump.y,raisedHome.y);
} finally { raisedHome.y=originalY; }
assert.equal(BUILDING_DOOR_WIDTH,2.8);
console.log(`PASS: ${BUILDINGS.length} enlarged dry homes, wall and furniture collision, ${BUILDING_CHAIRS.length} reachable chairs, terrain ramps, indoor jumping and preserved NPC/quest anchors (${raised} raised floor samples).`);
