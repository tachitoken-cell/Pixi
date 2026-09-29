import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CITY, CITY_RADIUS, CITY_WALL_RADIUS, CITY_CLOCKTOWER, CITY_PROPS, CITY_COLLIDERS, CITY_VENDORS, AUCTIONEER, insideCity } from '../src/city.ts';
import { TRAINER_NPCS } from '../src/training.ts';
import { BUILDINGS, BUILDING_CHAIRS, buildingPoint, chairApproach, buildingFloorHeight } from '../src/buildings.ts';
import { WORLD_SCENERY, WORLD_COLLIDERS, canTraverse } from '../src/realm.ts';
import { groundHeight, waterAt } from '../src/landscape.ts';
import { ZONES, NPCS } from '../src/content.ts';
import { insideVillageSafeArea } from '../src/settlements.ts';

const bytes=readFileSync('public/models/city-kit.glb');
assert(bytes.length<4_000_000,'the expanded furnished shared capital kit stays below 4MB');
const kit=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
kit.updateMatrixWorld(true);
assert.equal(kit.children.length,12);
const materials=new Set(),expected=[];
for(const prop of CITY_PROPS){
  const model=kit.getObjectByName(prop.kind);assert(model,`${prop.kind} is an actual Blender model`);
  assert.equal(model.userData.width,prop.width);assert.equal(model.userData.depth,prop.depth);
  const c=Math.cos(prop.rotation),s=Math.sin(prop.rotation);
  for(const [x,z,w,d] of JSON.parse(model.userData.solidFootprints))expected.push({
    x:prop.x+x*c+z*s,z:prop.z-x*s+z*c,halfWidth:(Math.abs(c)*w+Math.abs(s)*d)/2,halfDepth:(Math.abs(s)*w+Math.abs(c)*d)/2,
  });
}
const signature=p=>[p.x,p.z,p.halfWidth,p.halfDepth].map(n=>Math.round(n*10000)/10000).join(',');
assert.deepEqual(CITY_COLLIDERS.map(signature).sort(),expected.map(signature).sort(),'all rendered walls, posts, counters, shelves and troughs have exact shared collision');
assert(CITY_COLLIDERS.every(c=>WORLD_COLLIDERS.includes(c)));
for(const root of kit.children)root.traverse(object=>{
  assert(object.matrixWorld.elements.every(Number.isFinite));
  if(object.isMesh){assert(object.userData.part&&object.geometry.getAttribute('color'));materials.add(object.material);}
});
assert.equal(materials.size,2,'civic geometry shares one opaque palette and one clear glazing material');
assert.equal([...materials].filter(material=>material.transparent&&material.opacity<=.25).length,1);
for(const part of ['body','head','left-arm','right-arm'])assert(kit.getObjectByName(`city-auctioneer-${part}`));
const ray=new THREE.Raycaster(),hall=kit.getObjectByName('city-auction-hall');
const bounds=name=>new THREE.Box3().setFromObject(kit.getObjectByName(name));
assert(bounds('city-wall').max.y>=9,'stone walls are more than twice their former height');
assert(bounds('city-gate').max.y>=16,'gate towers rise above the curtain wall');
const clock=kit.getObjectByName('city-clocktower');
assert(bounds('city-clocktower').max.y>=29,'the clocktower is a major building on the skyline');
assert(!WORLD_SCENERY.some(p=>p.kind==='bell'),'the small old clock/bell tower is removed');
for(const prop of CITY_PROPS.filter(p=>p.kind==='city-lantern'))assert(!(Math.abs(prop.x-CITY_CLOCKTOWER.x)<CITY_CLOCKTOWER.width/2&&Math.abs(prop.z-CITY_CLOCKTOWER.z)<CITY_CLOCKTOWER.depth/2),'town hall interior contains no old street lantern');
for(const x of [-1.5,0,1.5]){
  const front=CITY_CLOCKTOWER.depth/2+2;
  ray.set(new THREE.Vector3(x,1.6,front),new THREE.Vector3(0,0,-1));
  assert(ray.intersectObject(clock,true)[0].distance>front+4,'the four-metre town hall entrance and centre aisle stay open to Rowan');
}

for(const x of [-2.6,0,2.6]){
  ray.set(new THREE.Vector3(x,1,10),new THREE.Vector3(0,0,-1));
  assert(ray.intersectObject(hall,true)[0].distance>17,'real six-metre portal and centre aisle stay open');
}
const roof=kit.getObjectByName('city-stable').children.find(o=>o.userData.part==='roof-shingles');
for(let x=-7.7;x<7.8;x+=.17){ray.set(new THREE.Vector3(x,10,.2),new THREE.Vector3(0,-1,0));assert(ray.intersectObject(roof,true).length,'stable roof is continuous');}
for(const role of ['ranger','knight','mage']){
  const roof=kit.getObjectByName(`city-${role}-pavilion`).children.find(o=>o.userData.part==='roof-shingles');
  for(let z=-2;z<=2;z+=.1)for(const dx of [-.5,0,.5]){
    ray.set(new THREE.Vector3(0,2.5,z),new THREE.Vector3(dx,1,.1).normalize());
    assert(ray.intersectObject(roof,true).length,'guild roof blocks sky through its tile seams from inside');
  }
}

// Half-metre flood fill independently verifies the entire capital with swept movement.
const limit=CITY_RADIUS+6,step=.5,width=limit*4+1,start=ZONES.find(z=>z.id==='greenwood').spawn;
const index=(x,z)=>Math.round((x+limit)/step)+Math.round((z+limit)/step)*width;
const point=id=>({x:(id%width)*step-limit,z:Math.floor(id/width)*step-limit});
const reached=new Set([index(start.x,start.z)]),queue=[index(start.x,start.z)];
for(let i=0;i<queue.length;i++){
  const from=point(queue[i]);
  for(const [dx,dz]of [[step,0],[-step,0],[0,step],[0,-step]]){
    const to={x:from.x+dx,z:from.z+dz},id=index(to.x,to.z);
    if(Math.abs(to.x)>limit||Math.abs(to.z)>limit||reached.has(id)||waterAt(to.x,to.z)||!canTraverse(from,to))continue;
    reached.add(id);queue.push(id);
  }
}
function reachable(target){
  assert(canTraverse(target,target)&&!waterAt(target.x,target.z),`${target.id} stands on free dry land`);
  const x=Math.round(target.x/step)*step,z=Math.round(target.z/step)*step;
  assert([-step,0,step].some(dx=>[-step,0,step].some(dz=>reached.has(index(x+dx,z+dz))&&canTraverse({x:x+dx,z:z+dz},target))),`${target.id} is reachable from spawn`);
}
const services=[...TRAINER_NPCS.filter(npc=>npc.zone===CITY.zone),...CITY_VENDORS,AUCTIONEER];
assert.equal(services.length,9);
for(const npc of services){
  reachable(npc);reachable({...npc,x:npc.x+Math.sin(npc.rotation)*1.5,z:npc.z+Math.cos(npc.rotation)*1.5});
  assert(insideVillageSafeArea(npc.x,npc.z),'all capital services are in the safe area');
}
const rowan=NPCS.find(npc=>npc.id==='rowan');
reachable(rowan);reachable({...rowan,z:rowan.z+2,id:'rowan-approach'});
assert(insideVillageSafeArea(rowan.x,rowan.z),'Rowan remains safe inside the town hall');
const houses=BUILDINGS.filter(home=>insideCity(home.x,home.z));
for(const home of houses){
  reachable({...buildingPoint(home,0,home.depth/2+3),id:home.id+'-entrance'});
  reachable({...buildingPoint(home,0,1.5),id:home.id+'-interior'});
  for(const chair of BUILDING_CHAIRS.filter(c=>c.buildingId===home.id))reachable({...chairApproach(chair),id:chair.id});
}
for(const gate of CITY_PROPS.filter(p=>p.kind==='city-gate')){
  for(const z of [-6,6])reachable({...buildingPoint(gate,0,z),id:gate.id+'-'+z});
  assert(canTraverse(buildingPoint(gate,0,-6),buildingPoint(gate,0,6)),'all four city gates are open passages');
}
for(const prop of CITY_PROPS.filter(p=>/pavilion|stable|market-stall/.test(p.kind))){
  assert.equal(buildingFloorHeight(prop.x,prop.z),groundHeight(prop.x,prop.z)+.08);
}
assert(!WORLD_SCENERY.some(p=>['tree','rock'].includes(p.kind)&&insideCity(p.x,p.z)),'capital streets are clear of old random scenery');

const hook=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const {buildWorldMapScene}=await import('../src/world-map.ts');hook.deregister();
const atlas=buildWorldMapScene(false,{minX:-90,maxX:90,minZ:-90,maxZ:90});
assert.equal(atlas.markers.find(m=>m.name==='rowan').userData.mapPoint.label,CITY.name,'old stable capital marker ID is preserved');
for(const npc of services){const marker=atlas.markers.find(m=>m.name===npc.id);assert(marker,'every service is selectable for a waypoint');assert.equal(marker.position.x,npc.x);assert.equal(marker.position.z,npc.z);}
const transform=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion();let hallRoof=false,clockSpire=false,tallWall=false;
for(let i=0;i<atlas.scenery.count;i++){
  atlas.scenery.getMatrixAt(i,transform);transform.decompose(position,rotation,scale);
  if(Math.abs(position.x-CITY_CLOCKTOWER.x)<.01&&Math.abs(position.z-CITY_CLOCKTOWER.z)<.01&&position.y>28)clockSpire=true;
  if(Math.abs(position.z-CITY_WALL_RADIUS)<.01&&scale.x===8&&scale.y>8)tallWall=true;
  if(Math.abs(position.x-25)<.01&&Math.abs(position.z+22)<.01&&scale.x>24&&position.y>groundHeight(25,-22)+7)hallRoof=true;
}
assert(clockSpire&&tallWall,'atlas and minimap show the taller wall and clocktower silhouettes');
const clockPin=atlas.markers.find(m=>m.name===CITY_CLOCKTOWER.id);
assert(clockPin,'town hall is available as a map waypoint');
assert.equal(clockPin.userData.mapPoint.label,'Town hall · Rowan','the waypoint names the town hall and its quest giver');
assert(clockPin.position.z>CITY_CLOCKTOWER.z+CITY_CLOCKTOWER.depth/2+2,'clocktower waypoint is visible outside its solid atlas footprint');
assert(canTraverse(clockPin.userData.mapPoint,clockPin.userData.mapPoint),'clock waypoint leads to the accessible entrance');
assert(hallRoof,'atlas and minimap include the actual capital hall footprint and elevation');
atlas.dispose();
console.log(`PASS: 12 Blender capital models, exact ${expected.length} colliders, ${services.length} reachable services, ${houses.length} walkable buildings, four gates, ${reached.size} flood-fill cells and shared capital/service atlas markers.`);
