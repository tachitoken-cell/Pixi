import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CITY, CITY_ROADS, ALL_CITY_FURNISHINGS as CITY_FURNISHINGS, ALL_CITY_GARDEN_COLLIDERS as CITY_GARDEN_COLLIDERS, BANKER, BANK_HOME_ID, AUCTIONEER } from '../src/city.ts';
import { BUILDINGS, CIVIC_FURNITURE_COLLIDERS, buildingPoint, buildingFloorHeight } from '../src/buildings.ts';
import { WORLD_COLLIDERS, WORLD_BOUNDS, canTraverse, toWorld, REGION_ORIGINS } from '../src/realm.ts';
import { ZONES } from '../src/content.ts';
import { groundHeight, waterAt, WATER_LEVEL } from '../src/landscape.ts';
import { findPath } from '../src/navigation.ts';
import { createOverworld } from '../src/zones.ts';
import { TRAINING_GROUNDS } from '../src/training-grounds-data.ts';
import { graphics } from '../src/graphics-settings.ts';

// Reuse the full-width pavement sweep and connected four-gate road graph regression.
await import('./check-city-roads.mjs');
const bank=BUILDINGS.find(b=>b.id===BANK_HOME_ID);assert(bank);
const placed=CITY_FURNISHINGS.filter(p=>p.kind!=='bank-crest');
assert.equal(CIVIC_FURNITURE_COLLIDERS.length+CITY_GARDEN_COLLIDERS.length,placed.length);
for(const collider of [...CIVIC_FURNITURE_COLLIDERS,...CITY_GARDEN_COLLIDERS])
  assert(WORLD_COLLIDERS.includes(collider),'civic and garden furniture blocks authoritative movement');
for(const placement of placed) {
  const home=placement.buildingId&&BUILDINGS.find(b=>b.id===placement.buildingId);
  const at=home?buildingPoint(home,placement.x,placement.z):placement;
  const rotation=placement.rotation+(home?.rotation||0),turned=Math.abs(Math.sin(rotation))>.5;
  const w=turned?placement.depth:placement.width,d=turned?placement.width:placement.depth;
  assert(WORLD_COLLIDERS.some(c=>Math.abs(c.x-at.x)<.001&&Math.abs(c.z-at.z)<.001&&Math.abs(c.halfWidth-w/2)<.001&&Math.abs(c.halfDepth-d/2)<.001),
    `${placement.kind}: placement and collision envelope agree`);
}
const spawn=toWorld(CITY.zone,ZONES.find(z=>z.id===CITY.zone).spawn);
for(const npc of [BANKER,AUCTIONEER]) {
  const front={x:npc.x+Math.sin(npc.rotation)*1.5,z:npc.z+Math.cos(npc.rotation)*1.5};
  assert(canTraverse(front,npc)&&!waterAt(front.x,front.z),`${npc.id}: clear dry interaction front`);
  const path=findPath(spawn,front,WORLD_COLLIDERS,WORLD_BOUNDS);
  assert(path.length,`${npc.id}: reachable from spawn`);
  let previous=spawn;for(const point of path){assert(canTraverse(previous,point));previous=point;}
  assert(Math.hypot(previous.x-front.x,previous.z-front.z)<.01,`${npc.id}: route reaches real interaction front`);
}
for(const x of [-5,-2.5,0,2.5,5])for(const z of [0,1.5,3,4.5,5.3]) {
  const point=buildingPoint(bank,x,z);
  assert(canTraverse(point,point),`bank foyer remains clear at ${x},${z}`);
  assert(Math.abs(buildingFloorHeight(point.x,point.z)-bank.y)<.01,'bank floor matches shared walk height');
}
assert(canTraverse(buildingPoint(bank,0,bank.depth/2+3),BANKER),'bank ramp, doorway and banker aisle are continuous');

const sources=new Map(),originalLoad=GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync=async function(url){
  assert(typeof url==='string'&&url.startsWith('/models/')&&url.endsWith('.glb')&&!url.includes('..'));
  const bytes=await readFile(new URL(`../public${url}`,import.meta.url));
  const result=await this.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  sources.set(url,result.scene);return result;
};
const scene=new THREE.Scene();let world;
const budgets={environmentDraws:180,environmentTriangles:2_000_000,architectureDraws:360,architectureTriangles:1_080_000,actorDraws:51,actorTriangles:20_000,trainingDraws:310,trainingTriangles:36_000};
const measurements=[],failures=[];
try {
  world=await createOverworld(scene);const root=scene.children[0];root.updateMatrixWorld(true);
  const civic=sources.get('/models/city-furnishings.glb');assert(civic);
  const point=new THREE.Vector3();
  for(const placement of placed) {
    const source=civic.getObjectByName(`furnishing-${placement.kind}`);assert(source);
    assert.equal(source.userData.width,placement.width);assert.equal(source.userData.depth,placement.depth);
    source.updateMatrixWorld(true);
    for(const mesh of source.children)for(let i=0;i<mesh.geometry.attributes.position.count;i++) {
      point.fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld);
      if(point.y>2.3)continue;
      assert(Math.abs(point.x)<=placement.width/2+.001&&Math.abs(point.z)<=placement.depth/2+.001,
        `${placement.kind}: actual reachable Blender geometry is inside its collision envelope`);
    }
  }
  assert(world.villagers.has(BANKER.id)&&world.villagers.has(AUCTIONEER.id),'both services load their actual NPC rigs');
  const bankModel=root.getObjectByName(BANK_HOME_ID);assert(bankModel);
  let bankFloor=false,oldFurniture=false;
  bankModel.traverse(n=>{const p=String(n.userData.part);bankFloor ||= p==='interior-floor';oldFurniture ||= p.startsWith('interior-')&&p!=='interior-floor';});
  assert(bankFloor&&!oldFurniture,'bank runtime preserves floor and removes obsolete interior furniture');

  // Match production NPC culling, camera position, camera obstruction and world updates.
  const main=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
  const start=main.indexOf(' for(const [id,view] of npcViews){'),end=main.indexOf('  if(!view.mesh.visible)continue;',start);
  assert(start>=0&&end>start);
  const visibilitySource=stripTypeScriptTypes(main.slice(start,end)+'\n }');
  const state={graphics,mobileLabels:null,selectedId:null,worldInstance:null,position:{x:0,z:0},npcViews:new Map([...world.villagers].map(([id,mesh])=>[id,{mesh,label:{hidden:false}}]))};
  const meshes=[];root.traverse(n=>{if(n.isMesh)meshes.push(n);});
  const architecture=new Set(['Walkable homes','Lanternreach — Blender city']);
  const views=[{id:'capital-plaza',x:0,z:8,yaw:.34},{...BANKER,id:'bank-foyer',yaw:-Math.PI/2},
    {id:'auction-hall',x:25,z:-20,yaw:.34},{id:'sunveil-town',...REGION_ORIGINS.sunveil,yaw:.34},
    {id:'mistwood-town',...REGION_ORIGINS.mistwood,yaw:.34},{id:'frostmarch-town',...REGION_ORIGINS.frostmarch,yaw:.34},
    ...TRAINING_GROUNDS.map(area=>({...area,id:`training-${area.className.toLowerCase()}`,yaw:.34}))];
  for(const at of views) {
    state.position=at;runInNewContext(visibilitySource,state);
    const camera=new THREE.PerspectiveCamera(52,16/9,.1,500),base=groundHeight(at.x,at.z)+1.2;
    const x=at.x+Math.sin(at.yaw)*Math.cos(.35)*21,z=at.z+Math.cos(at.yaw)*Math.cos(.35)*21;
    camera.position.set(x,Math.max(base+Math.sin(.35)*21,(waterAt(x,z)?WATER_LEVEL:groundHeight(x,z))+1.6),z);
    world.constrainCamera?.(new THREE.Vector3(at.x,base,at.z),camera.position);
    camera.lookAt(at.x,base,at.z);camera.updateMatrixWorld(true);
    world.setInteriorView(at,camera.position);world.update(12,new THREE.Vector3(at.x,base-1.2,at.z),camera,1);root.updateMatrixWorld(true);
    const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    const result={id:at.id,environmentDraws:0,environmentTriangles:0,architectureDraws:0,architectureTriangles:0,actorDraws:0,actorTriangles:0,trainingDraws:0,trainingTriangles:0};
    for(const mesh of meshes) {
      let visible=true,owner=mesh;
      for(let node=mesh;node;node=node.parent){if(!node.visible)visible=false;if(node.parent===root)owner=node;}
      if(!visible||(mesh.isInstancedMesh&&!mesh.count)||(mesh.frustumCulled!==false&&!frustum.intersectsObject(mesh)))continue;
      const kind=architecture.has(owner.name)?'architecture':owner.name==='Lanternreach townsfolk and stable animals'?'actor':owner.name==='Lanternreach training grounds'?'training':'environment';
      result[`${kind}Draws`]++;
      result[`${kind}Triangles`]+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3*(mesh.isInstancedMesh?mesh.count:1);
    }
    measurements.push(result);
    for(const [key,limit]of Object.entries(budgets))if(result[key]>(key==='actorDraws'||key==='actorTriangles'?limit:limit-.0001))failures.push(`${at.id}: ${key} ${result[key]} exceeds original ${limit}`);
  }
  console.log(`Ten actual 500m production-camera views: ${JSON.stringify(measurements)}`);
  console.log(`Loaded actual world: ${meshes.length} meshes, ${meshes.reduce((sum,m)=>sum+(m.isInstancedMesh?m.count:0),0)} instances.`);
} finally {
  world?.dispose();GLTFLoader.prototype.loadAsync=originalLoad;
}
assert.deepEqual(failures,[],'existing world budgets remain unchanged and training stays within its separate measured budget');
console.log(`PASS: ${CITY_FURNISHINGS.length} civic placements/collision envelopes, ${CITY_ROADS.length} clear full-width roads, reachable banker/auctioneer, empty bank foyer and ten measured production-camera views.`);
