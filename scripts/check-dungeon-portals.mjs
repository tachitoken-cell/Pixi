import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DUNGEONS, dungeonThemeId, ROOTVAULT_GUARDIAN, dungeonReturn, dungeonStages, dungeonLayout, dungeonColliders } from '../src/dungeon.ts';
import { WORLD_BOUNDS, WORLD_COLLIDERS, WORLD_SCENERY, DUNGEON_APPROACH_COLLIDERS, DUNGEON_APPROACH_WALLS, OVERWORLD_SPAWNS, overworldSpawnAllowed, PLAYER_RADIUS, canTraverse } from '../src/realm.ts';
import { groundHeight, waterAt, TERRAIN_MAX_STEP } from '../src/landscape.ts';
import { findPath } from '../src/navigation.ts';
import { DUNGEON_TEMPLE_BOUNDS, DUNGEON_TEMPLE_WALLS, DUNGEON_TEMPLE_PILLARS, DUNGEON_TEMPLE_ROUTE, DUNGEON_TEMPLE_ROUTES } from '../src/dungeon-approach-layout.ts';
import { createDungeonApproaches, dungeonApproachModel } from '../src/dungeon-portals.ts';
import { disposeWorldGroup } from '../src/world.ts';
import { registerHooks } from 'node:module';
const hook=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const {buildWorldMapScene}=await import('../src/world-map.ts');
const {createDungeonWorld}=await import('../src/zones.ts');hook.deregister();
const bytes=readFileSync(new URL('../public/models/dungeon-portals.glb',import.meta.url));
const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
assert(bytes.length<4_000_000);assert(!json.textures?.length);assert(statSync(new URL('../assets/source/dungeon-portals.blend',import.meta.url)).size>50_000);
for(const name of ['dungeon-portal','dungeon-summon-stone','dungeon-cinder','dungeon-frost','dungeon-nightroot',...DUNGEONS.map(d=>dungeonApproachModel(d.id))])assert(json.nodes.some(node=>node.name===name));
const worldRoute=(d,route=DUNGEON_TEMPLE_ROUTE)=>route.map(point=>({x:d.entrance.x+point.x,z:d.entrance.z+point.z}));
const bounds=DUNGEON_TEMPLE_BOUNDS;
assert(bounds.maxX-bounds.minX>=60&&bounds.maxZ-bounds.minZ>=60,'the temple precinct expands substantially in both directions');
assert(DUNGEON_TEMPLE_ROUTES.some(route=>route[0].x<bounds.minX)&&DUNGEON_TEMPLE_ROUTES.some(route=>route[0].x>bounds.maxX)&&DUNGEON_TEMPLE_ROUTES.some(route=>route[0].z>bounds.maxZ),'separate western, eastern and front entrances reach the temple');
assert(new Set(DUNGEON_TEMPLE_ROUTES.map(route=>JSON.stringify(route[0]))).size===DUNGEON_TEMPLE_ROUTES.length,'alternate routes use separate exterior breaches');
const samples=(min,max)=>[...Array.from({length:Math.ceil((max-min)/4)},(_,i)=>min+i*4),max];
for(const d of DUNGEONS){
 const e=d.entrance,landing={x:d.summonStone.x,z:d.summonStone.z+2};
 for(const [index,local]of DUNGEON_TEMPLE_ROUTES.entries()){
  const route=worldRoute(d,local),mouth=route[0];assert.deepEqual(route.at(-1),{x:e.x,z:e.z},'each breach route leads to the portal');
  for(let i=1;i<route.length;i++){
   const from=route[i-1],to=route[i],dx=to.x-from.x,dz=to.z-from.z,length=Math.hypot(dx,dz);
   for(const side of [-PLAYER_RADIUS,0,PLAYER_RADIUS])assert(canTraverse({x:from.x+dz/length*side,z:from.z-dx/length*side},{x:to.x+dz/length*side,z:to.z-dx/length*side}),`${d.id}: breach route ${index+1}, segment ${i} has player clearance`);
  }
  for(const target of [e,landing]){const path=findPath(mouth,target,WORLD_COLLIDERS,WORLD_BOUNDS);assert(path.length&&Math.hypot(path.at(-1).x-target.x,path.at(-1).z-target.z)<.01,'pathfinding reaches the inner portal and summon landing from each entrance');}
 }
 assert(canTraverse(landing,landing));assert(!canTraverse(d.summonStone,d.summonStone),'summon model has a real solid base');
 assert(!waterAt(landing.x,landing.z));
 for(const dx of samples(bounds.minX,bounds.maxX))for(const dz of samples(bounds.minZ,bounds.maxZ)){const x=e.x+dx,z=e.z+dz;assert(!waterAt(x,z),'the expanded temple, including its corners, stays dry');assert.equal(groundHeight(x,z),groundHeight(e.x,e.z),'the full temple keeps a level rendered/authoritative floor');}
 for(let x=e.x+bounds.minX-24;x<=e.x+bounds.maxX+24;x+=4)for(let z=e.z+bounds.minZ-24;z<=e.z+bounds.maxZ+24;z+=4)for(const [dx,dz]of[[4,0],[0,4]])if(!waterAt(x,z)&&!waterAt(x+dx,z+dz))assert(Math.abs(groundHeight(x,z)-groundHeight(x+dx,z+dz))<=TERRAIN_MAX_STEP,'approach blends into climbable terrain');
 assert(!WORLD_SCENERY.some(s=>['tree','rock'].includes(s.kind)&&s.x>e.x+bounds.minX-5&&s.x<e.x+bounds.maxX+5&&s.z>e.z+bounds.minZ-5&&s.z<e.z+bounds.maxZ+5),'scenery cannot fill the expanded temple or its breaches');
}
assert.deepEqual(OVERWORLD_SPAWNS.find(spawn=>spawn.id===ROOTVAULT_GUARDIAN.id),ROOTVAULT_GUARDIAN,'the curated guardian keeps its exact temple home');
assert(overworldSpawnAllowed(ROOTVAULT_GUARDIAN,'hollow'),'the guardian keeps dry ground and all two-metre movement probes');
assert(!overworldSpawnAllowed({...ROOTVAULT_GUARDIAN,id:'ordinary-wandering-monster'},'hollow'),'ordinary monsters retain the town buffer');
assert(!overworldSpawnAllowed({...ROOTVAULT_GUARDIAN,x:ROOTVAULT_GUARDIAN.x+1},'hollow'),'the guardian exemption cannot move away from its exact landmark');
assert(canTraverse(ROOTVAULT_GUARDIAN,ROOTVAULT_GUARDIAN),'the guardian position stays clear');
assert(findPath(worldRoute(DUNGEONS[0])[0],ROOTVAULT_GUARDIAN,WORLD_COLLIDERS,WORLD_BOUNDS).length,'the guardian remains reachable through the temple');
assert.equal(DUNGEON_APPROACH_WALLS.length,DUNGEONS.length*(DUNGEON_TEMPLE_WALLS.length+DUNGEON_TEMPLE_PILLARS.length));
assert.equal(DUNGEON_APPROACH_COLLIDERS.length,DUNGEON_APPROACH_WALLS.length+DUNGEONS.length*3);
const load=GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync=async function(url){const b=readFileSync(new URL(`../public${url}`,import.meta.url));return this.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};
try{
 const root=new THREE.Group(),approaches=await createDungeonApproaches(root);assert.equal(approaches.portals.size,DUNGEONS.length);
 const ray=new THREE.Raycaster(),start=new THREE.Vector3(),end=new THREE.Vector3(),direction=new THREE.Vector3();
 root.updateMatrixWorld(true);
 const visibleRoute=(from,to,meshes,description)=>{
  const length=Math.hypot(to.x-from.x,to.z-from.z),across={x:(to.z-from.z)/length,z:-(to.x-from.x)/length};
  for(const side of [-PLAYER_RADIUS,0,PLAYER_RADIUS])for(const height of [.2,.9,1.6,2.4]){
   start.set(from.x+across.x*side,groundHeight(from.x,from.z)+height,from.z+across.z*side);
   end.set(to.x+across.x*side,groundHeight(to.x,to.z)+height,to.z+across.z*side);
   direction.subVectors(end,start);ray.set(start,direction.clone().normalize());ray.near=.001;ray.far=direction.length();
   const hit=ray.intersectObjects(meshes,false)[0];assert(!hit,`${description}: rendered ${hit?.object.name} obstructs the player volume`);
  }
 };

 for(const d of DUNGEONS){
  const chamber=approaches.portals.get(d.id),authored=chamber.children.filter(n=>n.userData.asset===dungeonApproachModel(d.id));
  assert(authored.length>=2,'each dungeon loads its authored approach shell');
  assert(!authored.some(mesh=>mesh.name.endsWith('-roof')),'the ruined temple is open to the sky');
  const renderedBounds=new THREE.Box3();for(const mesh of authored.filter(mesh=>mesh.name.endsWith('-stone')))renderedBounds.expandByObject(mesh);const extent=renderedBounds.getSize(new THREE.Vector3());
  assert(extent.x>=60&&extent.z>=60,'the exported temple actually fills the larger precinct');
  const walls=DUNGEON_APPROACH_WALLS.filter(wall=>wall.dungeonId===d.id),point=new THREE.Vector3(),matrix=new THREE.Matrix4();
  for(const mesh of authored.filter(mesh=>!mesh.name.endsWith('-foliage'))){
   mesh.getMatrixAt(0,matrix);matrix.premultiply(mesh.matrixWorld);const positions=mesh.geometry.getAttribute('position');
   for(let i=0;i<positions.count;i++){
    point.fromBufferAttribute(positions,i).applyMatrix4(matrix);if(point.y-groundHeight(d.entrance.x,d.entrance.z)>2.5)continue;
    assert(walls.some(wall=>Math.abs(point.x-wall.x)<=wall.halfWidth+.003&&Math.abs(point.z-wall.z)<=wall.halfDepth+.003),`${d.id}: low authored vertex ${point.x-d.entrance.x},${point.y-groundHeight(d.entrance.x,d.entrance.z)},${point.z-d.entrance.z} escapes its collision footprint`);
   }
  }
  const visibleSolids=chamber.children.filter(mesh=>mesh.isInstancedMesh&&mesh.userData.asset&&!mesh.name.endsWith('-foliage')),sides=new Map(visibleSolids.map(mesh=>[mesh.material,mesh.material.side]));
  for(const material of sides.keys())material.side=THREE.DoubleSide;
  try{
   for(const [index,local]of DUNGEON_TEMPLE_ROUTES.entries()){const route=worldRoute(d,local);for(let i=1;i<route.length;i++)visibleRoute(route[i-1],route[i],visibleSolids,`${d.id}: breach route ${index+1}, segment ${i}`);}
   const mouth=worldRoute(d)[0];start.set(mouth.x,groundHeight(mouth.x,mouth.z)+1.6,mouth.z);ray.set(start,new THREE.Vector3(0,0,-1));ray.near=.001;ray.far=mouth.z-d.entrance.z-1;
   assert(ray.intersectObjects(authored.filter(mesh=>mesh.name.endsWith('-stone')),false).length,'temple crosswalls conceal the portal at eye height');
   for(const local of DUNGEON_TEMPLE_ROUTES){let previous=worldRoute(d,local)[0];for(const point of findPath(previous,{x:d.summonStone.x,z:d.summonStone.z+2},WORLD_COLLIDERS,WORLD_BOUNDS)){visibleRoute(previous,point,visibleSolids,`${d.id}: summon approach`);previous=point;}}
  }finally{for(const [material,side]of sides)material.side=side;}

  const target=new THREE.Vector3(d.entrance.x+2,groundHeight(d.entrance.x,d.entrance.z)+1.4,d.entrance.z+18.5);
  const desired=target.clone().add(new THREE.Vector3(0,4,13.5));
  approaches.constrainCamera(target,desired);assert(desired.z<d.entrance.z+24-.7&&desired.distanceTo(target)<10,'temple camera stops before the crosswall and keeps the avatar visible');
  target.set(d.entrance.x-27,groundHeight(d.entrance.x,d.entrance.z)+1.4,d.entrance.z+29);desired.copy(target).add(new THREE.Vector3(-13,2,0));
  approaches.constrainCamera(target,desired);assert(desired.x>d.entrance.x-32+.7&&desired.distanceTo(target)<6,'camera collision also protects the expanded side wing');
 }
 const outside=new THREE.Vector3(-900,2,-900),distant=outside.clone().add(new THREE.Vector3(7,8,20)),unchanged=distant.clone();approaches.constrainCamera(outside,distant);assert(distant.equals(unchanged),'camera stays unchanged away from temples');
 // Compare the indexed camera with the original triangle raycaster, including
 // broken wall crests, overhead arches, both faces and the near/far cutoffs.
 const cameraTemples=DUNGEONS.map(d=>({...d.entrance,meshes:approaches.portals.get(d.id).children.filter(mesh=>mesh.userData.asset===dungeonApproachModel(d.id)&&mesh.name.endsWith('-stone'))}));
 const referenceCamera=(target,desired)=>{
  const distance=direction.subVectors(desired,target).length();if(!Number.isFinite(distance)||distance<.001)return;
  ray.set(target,direction.multiplyScalar(1/distance));ray.near=.001;ray.far=distance;let nearest=distance;
  for(const temple of cameraTemples){
   if(target.x<temple.x+bounds.minX-8||target.x>temple.x+bounds.maxX+8||target.z<temple.z+bounds.minZ-8||target.z>temple.z+bounds.maxZ+8)continue;
   const hit=ray.intersectObjects(temple.meshes,false)[0];if(hit)nearest=Math.min(nearest,hit.distance);
  }
  if(nearest<distance)desired.copy(target).addScaledVector(direction,Math.max(.05,nearest-.35));
 };
 const cameraCases=[];
 for(const d of DUNGEONS)for(const [x,z]of[[2,18.5],[-27,29],[8,24],[-8,14],[0,62]])for(const height of[1.4,4.2,7.8,10])for(let i=0;i<8;i++){
  const target=new THREE.Vector3(d.entrance.x+x,groundHeight(d.entrance.x,d.entrance.z)+height,d.entrance.z+z);
  cameraCases.push([target,target.clone().add(new THREE.Vector3(Math.sin(i*Math.PI/4)*21,4,Math.cos(i*Math.PI/4)*21))]);
 }
 for(const temple of cameraTemples)for(const mesh of temple.meshes){
  assert.equal(mesh.material.side,THREE.DoubleSide,'the exact camera index retains the authored double-sided stone');
  const p=mesh.geometry.getAttribute('position'),indices=mesh.geometry.index,matrix=new THREE.Matrix4();mesh.getMatrixAt(0,matrix);matrix.premultiply(mesh.matrixWorld);
  const triangle=new THREE.Triangle(...[0,1,2].map(i=>new THREE.Vector3().fromBufferAttribute(p,indices?indices.getX(i):i).applyMatrix4(matrix))),normal=triangle.getNormal(new THREE.Vector3()),target=triangle.getMidpoint(new THREE.Vector3()).addScaledVector(normal,.0005);
  cameraCases.push([target,target.clone().addScaledVector(normal,-21)],[target,target.clone().addScaledVector(normal,-.0009)]);
 }
 for(const [target,destination]of cameraCases){const expected=destination.clone(),actual=destination.clone();referenceCamera(target,expected);approaches.constrainCamera(target,actual);assert(expected.distanceTo(actual)<1e-7,'indexed camera exactly matches triangle collision through walls, gaps and upper stonework');}
 // The reported Veilhaven position, with a moving/orbiting camera rather than
 // a stationary-input cache. Count narrow-phase work as the stable regression.
 const movingCamera=Array.from({length:128},(_,i)=>{const target=new THREE.Vector3(1103.91+i*.01,40.25,704.85+i*.015),yaw=.34+i*.025,pitch=.35;return[target,target.clone().add(new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch)*21,Math.sin(pitch)*21,Math.cos(yaw)*Math.cos(pitch)*21))];});
 const measure=constrain=>{const original=THREE.Ray.prototype.intersectTriangle;let triangles=0;THREE.Ray.prototype.intersectTriangle=function(...args){triangles++;return original.apply(this,args);};const started=performance.now();try{for(const[target,destination]of movingCamera)constrain(target,destination.clone());}finally{THREE.Ray.prototype.intersectTriangle=original;}return{milliseconds:performance.now()-started,triangles};};
 const brute=measure(referenceCamera),indexed=measure(approaches.constrainCamera);
 assert(indexed.triangles<brute.triangles*.1,'moving cameras test less than a tenth of the original stone triangles');
 console.log(`Camera parity: ${cameraCases.length} rays; moving Veilhaven camera: ${JSON.stringify({brute,indexed})}`);
 const paving=root.getObjectByName('Dungeon: worn approach paving'),paverPose=new THREE.Matrix4(),paverPosition=new THREE.Vector3();
 assert(paving?.isInstancedMesh&&paving.count>100,'worn paving is batched');
 for(let i=0;i<paving.count;i++){paving.getMatrixAt(i,paverPose);paverPosition.setFromMatrixPosition(paverPose);assert(Math.abs(paverPosition.y-groundHeight(paverPosition.x,paverPosition.z)-.026)<.0001,'each fragment follows the shared terrain');}

 const resources=new Set(),counts=new Map();root.traverse(n=>{if(n.isMesh){resources.add(n.geometry);for(const m of Array.isArray(n.material)?n.material:[n.material])resources.add(m);if(n.isInstancedMesh)resources.add(n);}});
 for(const r of resources)r.addEventListener('dispose',()=>counts.set(r,(counts.get(r)||0)+1));
 approaches.update(1);const shader=root.getObjectsByProperty('name','Dungeon: portal energy');assert.equal(shader.length,DUNGEONS.length);
 for(const mesh of shader)assert.equal(mesh.material.uniforms.portalTime.value,1);
 for(const d of DUNGEONS){const portal=approaches.portals.get(d.id),energy=portal.getObjectByName('Dungeon: portal energy');assert.equal(energy.material.uniforms.returnPortal.value,false,'entrances retain their own portal style');assert.equal(energy.material.uniforms.portalColor.value.getHexString(),'a9ef48','regional Moss Gates share recognizable green portal energy');}
 const sparks=root.getObjectsByProperty('name','Dungeon: portal sparks'),first=sparks[0].instanceMatrix.array.slice();approaches.update(2);
 assert(sparks[0].instanceMatrix.array.some((v,i)=>v!==first[i]),'sparks actually move with time');
 for(const mesh of shader)assert.equal(mesh.material.uniforms.portalTime.value,2);
 disposeWorldGroup(root);assert([...resources].every(r=>counts.get(r)===1),'every approach resource is released exactly once');
 const palettes=[];
 for(const d of DUNGEONS){const scene=new THREE.Scene(),world=await createDungeonWorld(scene,d.id),group=scene.children.find(n=>n.isGroup);
  assert(group);const floor=group.children.find(n=>n.name.includes('floor'));
  palettes.push(Array.from(floor.instanceColor.array.slice(27,99)).join(','));
  assert.deepEqual(world.colliders,dungeonColliders([],[],d.id),'runtime collision uses this dungeon floorplan');
  const portal=group.getObjectByName('Dungeon: completion return');assert(portal,'interior includes return energy');assert.equal(portal.visible,false);
  const energy=portal.getObjectByName('Dungeon: portal energy'),embers=portal.getObjectByName('Dungeon: portal sparks'),light=portal.children.find(n=>n.isPointLight);
  assert.equal(energy.material.uniforms.returnPortal.value,true,'completion return uses the oval variant');
  for(const color of [energy.material.uniforms.portalColor.value,embers.material.color,light.color])assert.equal(color.getHexString(),'ff3028','every return uses red energy, embers and light');
  const released=new Map();portal.traverse(n=>{if(n.isMesh)for(const resource of [n.geometry,...(Array.isArray(n.material)?n.material:[n.material]),...(n.isInstancedMesh?[n]:[])])if(!released.has(resource)){released.set(resource,0);resource.addEventListener('dispose',()=>released.set(resource,released.get(resource)+1));}});
  const all={id:`test-${d.id}`,kind:d.id,completed:true,clearedStages:dungeonStages(d.id).map(s=>s.id),objects:dungeonLayout(d.id).objects.map(o=>({...o,available:false,activated:true})),hazards:[],checkpoint:{active:true}};
  world.setDungeonState(all,Date.now());world.update(5);assert.equal(portal.visible,false,'completed return stays hidden from the arrival sanctuary');world.setDungeonRoom('throne');world.update(5);assert.equal(portal.visible,true,'final return becomes visible after boss clear in its throne room');assert.equal(portal.position.x,dungeonReturn(d.id).x);assert.equal(portal.position.z,dungeonReturn(d.id).z);
  const before=embers.instanceMatrix.array.slice();world.update(6);assert.equal(energy.material.uniforms.portalTime.value,6);assert(embers.instanceMatrix.array.every(Number.isFinite)&&embers.instanceMatrix.array.some((v,i)=>v!==before[i]),'return embers remain finite and move with time');assert(Number.isFinite(light.intensity)&&light.intensity>0,'completed return emits light');
  assert.deepEqual(world.colliders,dungeonColliders(all.clearedStages,all.objects.map(o=>o.id),d.id),'opened gates release the correct dungeon corridors');
  if(d.id==='frosthollow'){const now=Date.now(),room=dungeonLayout(d.id).rooms.find(room=>room.id==='throne');world.setDungeonState({...all,hazards:[{id:'safe-centre',kind:'frost',label:'Frost ring',x:room.x,z:room.z,r:6,innerR:3,startedAt:now,endsAt:now+1500,damage:25}]},now);const fill=group.getObjectByName('Vault: boss danger fill');assert.equal(fill.count,1);assert.equal(fill.geometry.getAttribute('safeRadius').getX(0),.5,'the warning leaves the same safe radius as authoritative annulus damage');}
  const decor=[];group.traverse(n=>{if(n.userData.asset?.startsWith('dungeon-')||n.name.startsWith(`Blender ${dungeonThemeId(d.id)}:`))decor.push(n.userData.asset);});if(d.id!=='rootvault')assert(decor.length>0,`${d.name} has its authored landmark geometry`);
  if(d.id==='hollow-door'){const marker=group.getObjectByName('Chamber: warding lantern boundary'),stage=dungeonStages(d.id).find(stage=>stage.storyObjective?.kind==='protection');assert(marker&&stage);assert.equal(marker.geometry.parameters.outerRadius,stage.storyObjective.protectRadius);assert.equal(marker.position.x,stage.x);assert.equal(marker.position.z,stage.z);assert.equal(marker.visible,false);world.setDungeonRoom(stage.id);assert.equal(marker.visible,true);world.setDungeonRoom('threshold');assert.equal(marker.visible,false);}
  world.setDungeonState(null);world.update(7);assert.equal(portal.visible,false,'reset hides the final return');assert.equal(light.intensity,0,'hidden return emits no light');
  world.dispose();world.dispose();assert.equal(scene.children.length,0);assert([...released.values()].every(count=>count===1),'every return resource is released exactly once');
 }
 assert(new Set(palettes).size>=3,'tiers visibly change environment palette');
}finally{GLTFLoader.prototype.loadAsync=load;}
for(const d of DUNGEONS){const atlas=buildWorldMapScene(true,undefined,d.id);for(const object of dungeonLayout(d.id).objects){const marker=atlas.markers.find(m=>m.name===object.id);assert(marker);assert.equal(marker.position.x,object.x);assert.equal(marker.position.z,object.z);}atlas.dispose();}
const map=buildWorldMapScene();for(const d of DUNGEONS){assert(map.markers.some(m=>m.name===(d.id==='rootvault'?'dungeon-entrance':`dungeon-entrance-${d.id}`)));assert(map.markers.some(m=>m.name===`dungeon-summon-${d.id}`));}disposeWorldGroup(map.group);
console.log('PASS: Blender asset budgets; 13 expanded biome temples with five separate breached-wall routes, player-volume mesh/collision clearance, dry level precincts, concealed portals, grounded paving and camera clearance; animated portal uniforms/sparks; themed interiors, completion-only return, map destinations and resource disposal.');
