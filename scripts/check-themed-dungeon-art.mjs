import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createDungeonWorld } from '../src/zones.ts';
import { dungeonLayout, dungeonStages, dungeonColliders, dungeonBounds, dungeonReturn, dungeonPreparation, DUNGEON_START } from '../src/dungeon.ts';
import { THEMED_DUNGEON_ART } from '../src/themed-dungeon-art.ts';
const originalLoad=GLTFLoader.prototype.loadAsync;
let loadedKit;
GLTFLoader.prototype.loadAsync=async function(url){const bytes=await readFile(new URL(`../public${url}`,import.meta.url));loadedKit=await this.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');return loadedKit;};
try {
 // Exercise the production batch builder across positive/negative cell seams.
 // Every authored part, colour and transformed vertex must remain identical.
 const source=await readFile(new URL('../src/zones.ts',import.meta.url),'utf8'),context={THREE,GLTFLoader};
 const start=source.indexOf('async function templeProps('),end=source.indexOf('\nconst templePalettes',start);assert(start>=0&&end>start);
 runInNewContext(stripTypeScriptTypes(source.slice(start,end)),context);
 const group=new THREE.Group(),points=[-64,-32,-.2,0,31,32,64].map((x,i)=>({id:`wall-${i}`,x,z:i===6?256:0,y:i*.1,turn:i*.2,scale:[1+i*.01,1.2,.8],tint:0xffffff-i*0x1000}));
 const bindings=await context.templeProps(group,new Map([['wall',points],['alcove',points.map(p=>({...p,id:`alcove-${p.id}`}))]]),{value:0},'emberfall');
 const transform=new THREE.Object3D(),actual=new THREE.Matrix4(),expected=new THREE.Matrix4(),colour=new THREE.Color();
 for(const name of ['wall','alcove']){
  const parts=[];loadedKit.scene.getObjectByName(`emberfall-${name}`).traverse(part=>{if(part.isMesh)parts.push(part);});
  const meshes=group.children.filter(mesh=>mesh.userData.asset===name);
  assert(meshes.length>parts.length,'distant masonry has independently culled batches');
  assert.equal(meshes.reduce((n,mesh)=>n+mesh.count,0),parts.length*points.length,'batching preserves every instance exactly once');
  for(const part of parts){const batches=meshes.filter(mesh=>mesh.geometry===part.geometry);assert(batches.length>1);assert(batches.every(mesh=>mesh.material===batches[0].material),'batches share their original geometry and material');}
  for(const point of points){
   const id=name==='wall'?point.id:`alcove-${point.id}`,entries=bindings.get(id);assert.equal(entries.length,parts.length);
   transform.position.set(point.x,point.y,point.z);transform.rotation.set(0,point.turn,0);transform.scale.set(...point.scale);transform.updateMatrix();
   for(const binding of entries){
    const part=parts.find(part=>part.geometry===binding.mesh.geometry);expected.multiplyMatrices(transform.matrix,part.matrixWorld);binding.mesh.getMatrixAt(binding.index,actual);
    assert(actual.elements.every((value,i)=>Math.abs(value-expected.elements[i])<.00001),'spatial batches preserve authored world transforms');
    binding.mesh.getColorAt(binding.index,colour);const tint=new THREE.Color(point.tint);assert(colour.toArray().every((value,i)=>Math.abs(value-tint.toArray()[i])<.000001),'spatial batches preserve instance tint');
   }
  }
 }
 group.updateMatrixWorld(true);
 const camera=new THREE.PerspectiveCamera(52,1,.1,60);camera.position.set(0,8,20);camera.lookAt(0,2,0);camera.updateMatrixWorld(true);
 const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
 assert(bindings.get('wall-3').some(({mesh})=>frustum.intersectsObject(mesh)),'nearby masonry stays visible');
 assert(bindings.get('wall-6').every(({mesh})=>!frustum.intersectsObject(mesh)),'a distant room no longer rides inside the nearby wall batch');
 for(const id of Object.keys(THEMED_DUNGEON_ART)){
  const bytes=await readFile(new URL(`../public/models/${id}-kit.glb`,import.meta.url));
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
  assert(bytes.length<3_000_000,`${id}: detailed kit remains below 3MB`);
  assert(!json.textures?.length&&!json.cameras?.length&&!json.extensions?.KHR_lights_punctual,`${id}: no preview payloads or image substitutes`);
  assert((await stat(new URL(`../assets/source/${id}-kit.blend`,import.meta.url))).size>50000);
  assert((await stat(new URL(`../assets/source/${id}-kit-preview.png`,import.meta.url))).size>50000);
  const kit=await new GLTFLoader().loadAsync(`/models/${id}-kit.glb`);let triangles=0;
  for(const name of ['wall','alcove','arch','pillar','guardian','brazier','pool','landmark','gate','chest','seal','checkpoint','mushrooms'])assert(kit.scene.getObjectByName(`${id}-${name}`),`${id}: missing ${name}`);
  kit.scene.traverse(node=>{if(!node.isMesh)return;assert(node.geometry.getAttribute('color'));triangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3;for(const a of Object.values(node.geometry.attributes))assert(a.array.every(Number.isFinite));});
  assert(triangles>10000&&triangles<50000,`${id}: authored geometry has detail without an excessive mesh budget`);
  const landmark=new THREE.Box3().setFromObject(kit.scene.getObjectByName(`${id}-landmark`));assert(landmark.max.y>3,`${id}: hero set provides a real silhouette`);
  const scene=new THREE.Scene(),world=await createDungeonWorld(scene,id),root=scene.children.find(n=>n.isGroup),layout=dungeonLayout(id);
  try {
   const meshes=[];root.traverse(n=>{if(n.isMesh&&n.userData.authoredDungeon===id)meshes.push(n);});assert(meshes.length>20);
   assert(!root.children.some(n=>n.userData.asset==='dungeon-cave-rock'),`${id}: architecture uses its own authored kit`);
   assert(meshes.some(n=>n.userData.asset==='landmark'&&n.count===layout.pools.length),`${id}: hero architecture is actually placed`);
   assert.deepEqual(world.colliders,dungeonColliders([],[],id));
   const inside=(x,z)=>layout.colliders.some(c=>c.halfWidth!==undefined?Math.abs(x-c.x)<=c.halfWidth+.003&&Math.abs(z-c.z)<=c.halfDepth+.003:Math.hypot(x-c.x,z-c.z)<=c.r+.003);
   const matrix=new THREE.Matrix4(),point=new THREE.Vector3();let inspected=0;
   const extent=dungeonBounds(id),floor=root.getObjectByName('Vault: fitted temple floors and shared walls'),floorTiles=new Set();
   for(let i=0;i<floor.count;i++){
    floor.getMatrixAt(i,matrix);point.setFromMatrixPosition(matrix);if(Math.abs(point.y+.075)>.0001)continue;
    const hw=matrix.elements[0]/2,hd=matrix.elements[10]/2;
    assert(point.x-hw>=extent.minX-.001&&point.x+hw<=extent.maxX+.001&&point.z-hd>=extent.minZ-.001&&point.z+hd<=extent.maxZ+.001,`${id}: floor stays inside this dungeon's extent`);
    for(const dx of [-hw,hw])for(const dz of [-hd,hd])assert(layout.rooms.some(room=>Math.abs(point.x+dx-room.x)<=room.width/2+.001&&Math.abs(point.z+dz-room.z)<=room.depth/2+.001),`${id}: rendered tile does not invent floor in an exploration gap`);
    floorTiles.add(`${Math.floor(point.x/2)},${Math.floor(point.z/2)}`);
   }
   for(const room of layout.rooms)assert(floorTiles.has(`${Math.floor(room.x/2)},${Math.floor(room.z/2)}`),`${id}: every authored room and passage receives floor, including distant optional branches`);
   const portal=root.getObjectByName('Dungeon: completion return'),end=dungeonReturn(id);assert.equal(portal.position.x,end.x);assert.equal(portal.position.z,end.z);
   const preparation=dungeonPreparation(id),ward=root.getObjectByName('Dungeon: arrival sanctuary ward');
   assert(preparation&&ward?.count>=64,`${id}: arrival sanctuary has a visible boundary and four preparation spots`);
   for(let i=0;i<ward.count;i++){ward.getMatrixAt(i,matrix);point.setFromMatrixPosition(matrix);assert(point.y<.1&&point.x>=preparation.minX&&point.x<=preparation.maxX&&point.z>=preparation.minZ&&point.z<=preparation.maxZ,`${id}: sanctuary marking is flat and matches its protected footprint`);}
   assert(!dungeonStages(id).some(stage=>stage.enemies.some(enemy=>Math.hypot(enemy.x-DUNGEON_START.x,enemy.z-DUNGEON_START.z)<12)),`${id}: arrival is separated from combat spawns`);


   for(const mesh of meshes.filter(n=>['wall','alcove','arch','pillar','guardian','landmark','bell-shrine'].includes(n.userData.asset))){
    const positions=mesh.geometry.getAttribute('position');
    for(let i=0;i<mesh.count;i++) {mesh.getMatrixAt(i,matrix);for(let v=0;v<positions.count;v++){point.fromBufferAttribute(positions,v).applyMatrix4(matrix);if(point.y>.01&&point.y<1.8){assert(inside(point.x,point.z),`${id}: ${mesh.name} at ${point.toArray()} protrudes into a playable path`);inspected++;}}}
   }
   assert(inspected>10000,`${id}: collision check inspects actual detail vertices`);
   if(id==='veilhaven') {
    const shrineMeshes=meshes.filter(mesh=>mesh.userData.asset==='bell-shrine');
    assert.equal(layout.shrines.length,dungeonStages(id).length,'each Veilhaven combat room receives a bell shrine');
    assert(shrineMeshes.length && shrineMeshes.every(mesh=>mesh.count===layout.shrines.length),'authored bell shrines are instanced in the real scene');
    for(const shrine of layout.shrines) {
     assert(layout.colliders.some(solid=>solid.x===shrine.x&&solid.z===shrine.z&&solid.halfWidth===shrine.width/2&&solid.halfDepth===shrine.depth/2),'shrine collider matches its base');
     assert(!layout.portals.some(portal=>Math.abs(portal.x-shrine.x)<shrine.width/2+2.9&&Math.abs(portal.z-shrine.z)<shrine.depth/2+2.9),'portal pads stay clear of the shrine');
     const target=new THREE.Vector3(shrine.x,1.2,shrine.z+3),desired=new THREE.Vector3(shrine.x,1.2,shrine.z-3);
     world.constrainCamera(target,desired);assert(desired.z>shrine.z+shrine.depth/2,'camera cannot enter the shrine');
    }
   }
   const all={clearedStages:dungeonStages(id).map(s=>s.id),objects:layout.objects.map(o=>({...o,activated:true,available:false})),hazards:[]};world.setDungeonState(all);world.update(3);root.updateMatrixWorld(true);
   const ray=new THREE.Raycaster();ray.far=4;
   for(const door of layout.doors){ray.set(new THREE.Vector3(door.x+(door.axis==='z'?2:0),1.2,door.z+(door.axis==='x'?2:0)),new THREE.Vector3(door.axis==='z'?-1:0,0,door.axis==='x'?-1:0));assert.equal(ray.intersectObjects(meshes).length,0,`${id}: opening remains clear`);}
   ray.far=2;for(const enemy of dungeonStages(id).flatMap(s=>s.enemies)){ray.set(new THREE.Vector3(enemy.x,2,enemy.z),new THREE.Vector3(0,-1,0));assert.equal(ray.intersectObjects(meshes.filter(n=>['wall','alcove','arch','pillar','guardian','landmark','bell-shrine'].includes(n.userData.asset))).length,0,`${id}: enemy spawn remains visually clear`);}
   const motes=root.children.find(n=>/drifting spores|rising embers|wandering spirit lights/.test(n.name)),before=motes.instanceMatrix.array.slice();world.update(4);assert(motes.instanceMatrix.array.some((v,i)=>v!==before[i]));
   const portalLocks=root.getObjectByName('Dungeon: room teleport vortices').geometry.getAttribute('portalLocked');assert(portalLocks.array.every(value=>value===0),`${id}: cleared portals open`);world.setDungeonState(null);assert(portalLocks.array.some(value=>value===1),`${id}: state resets its room portal seals`);
   console.log(`PASS ${id}: ${triangles} triangles, ${bytes.length} bytes, ${inspected} collision-fitted vertices, real landmarks, clear doors/spawns and animated ambience.`);
  }finally{world.dispose();world.dispose();assert.equal(scene.children.length,0);}
 }
}finally{GLTFLoader.prototype.loadAsync=originalLoad;}
