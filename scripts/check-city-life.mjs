import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createCityLife, loadCityMountAssets, cityPatrolRoutes } from '../src/city-life.ts';
import { CITY_LAYOUTS, CITY_ROADS, CITY_PROPS } from '../src/city.ts';
import { CITY_SERVICE_NPCS } from '../src/city-services.ts';
import { canTraverse, toWorld } from '../src/realm.ts';
import { NPCS } from '../src/content.ts';
import { VILLAGE_NPCS } from '../src/settlements.ts';
import { TRAINER_NPCS } from '../src/training.ts';
import { TRAINING_PRACTICE } from '../src/training-grounds-data.ts';
import { buildingPoint, buildingFloorHeight } from '../src/buildings.ts';
import { waterAt } from '../src/landscape.ts';

async function asset(path){const data=readFileSync(new URL(`../public${path}`,import.meta.url));return new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');}
const originalLoader=GLTFLoader.prototype.loadAsync;let mountLoads=0;
GLTFLoader.prototype.loadAsync=async function(url){assert(['/models/mounts.glb','/models/store-collection.glb','/models/verdant-revenant.glb','/models/wayfarer-stag.glb'].includes(url));mountLoads++;return asset(url);};
let first,second;
try {
  await Promise.all([loadCityMountAssets(),loadCityMountAssets()]);assert.equal(mountLoads,4,'concurrent world/player calls decode each shared mount library once');
  const village=(await asset('/models/village-kit.glb')).scene;
  const sourceGeometries=new Set(),sourceMaterials=new Set();village.traverse(node=>{if(node.isMesh){sourceGeometries.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material])sourceMaterials.add(material);}});
  let sourceDisposals=0;[...sourceGeometries,...sourceMaterials].forEach(resource=>resource.addEventListener('dispose',()=>sourceDisposals++));
  first=await createCityLife(village);second=await createCityLife(village);assert.equal(mountLoads,4);
  assert.equal(first.root.userData.population,24);assert.equal(first.root.userData.stableAnimals,3);assert.equal(first.root.userData.cosmetic,true);
  const batches=first.root.children.filter(node=>node.isInstancedMesh);
  assert.equal(batches.length,18,'six independently posed authored parts per each of three roles stay at18 draws for24 citizens');
  assert(batches.every(batch=>batch.count===8));
  assert.equal(first.citizens.size,24);assert.equal(new Set([...first.citizens.values()].map(citizen=>citizen.name)).size,24);
  assert.deepEqual([...first.citizens.keys()],Array.from({length:24},(_,index)=>`city-citizen-${index}`));
  assert.deepEqual([...first.citizens].map(([id,c])=>[id,c.name,c.title]),[...second.citizens].map(([id,c])=>[id,c.name,c.title]),'citizen identities remain stable between worlds');
  const citizenRigs=[...first.citizens.values()].map(citizen=>citizen.mesh);
  for(const [index,citizen] of [...first.citizens.values()].entries()){
    assert.equal(citizen.title,['Townsperson','Town guard','Pilgrim'][Math.floor(index/8)]);
    assert.equal(citizen.mesh.parent,null);assert.equal(first.root.getObjectById(citizen.mesh.id),undefined,'selectable rigs never add duplicate rendered models');
  }
  let renderedMeshes=0;first.root.traverse(node=>{if(node.isMesh)renderedMeshes++;});assert.equal(renderedMeshes,51,'citizen selection adds no draws');
  const citizenRay=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0));
  const checkPicking=()=>{
    for(const [index,mesh] of citizenRigs.entries())if(mesh.visible){
      const point=first.root.userData.actorPositions[index];assert.equal(mesh.position.x,point.x);assert.equal(mesh.position.z,point.z);
      citizenRay.ray.origin.set(point.x,mesh.position.y+5,point.z);
      const hits=citizenRay.intersectObject(mesh,true);assert(hits.length>0,'every visible animated rig can be ray-picked at its actual position');
      const role=['merchant','warden','healer'][Math.floor(index/8)];
      mesh.traverse(part=>{if(!part.isMesh)return;const batch=batches.find(batch=>batch.name===`City citizens ${role} ${part.name}`);assert(batch);const actual=new THREE.Matrix4();batch.getMatrixAt(index%8,actual);assert(actual.elements.every((value,i)=>Math.abs(value-part.matrixWorld.elements[i])<.00001),'picking geometry exactly follows its rendered instance');});
    }
  };
  for(const role of ['merchant','warden','healer']){
    const original=village.getObjectByName(`village-${role}-body`).geometry;
    const owned=batches.filter(batch=>batch.name.startsWith(`City citizens ${role} `)&&(/-body$|city-leg-/.test(batch.name))).map(batch=>batch.geometry);
    assert.equal(owned.length,3);assert.equal(owned.reduce((sum,g)=>sum+g.attributes.position.count,0),original.index?.count||original.attributes.position.count,'leg pivots preserve every original Blender triangle');
  }
  const residents=[...VILLAGE_NPCS,...TRAINER_NPCS,...TRAINING_PRACTICE,...CITY_SERVICE_NPCS,...NPCS.map(npc=>toWorld(npc.zone,npc))];
  const roadDistance=(p,road)=>{const dx=road.x2-road.x1,dz=road.z2-road.z1,t=Math.max(0,Math.min(1,((p.x-road.x1)*dx+(p.z-road.z1)*dz)/(dx*dx+dz*dz)));return Math.hypot(p.x-road.x1-dx*t,p.z-road.z1-dz*t);};
  const matrix=new THREE.Matrix4(),position=new THREE.Vector3();
  const patrols=cityPatrolRoutes();assert.equal(patrols.length,24);
  const segmentPointDistance=(p,a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);};
  const cross=(a,b,p)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
  for(let a=0;a<patrols.length;a++)for(let b=a+1;b<patrols.length;b++){
    const one=patrols[a],two=patrols[b];
    assert(!(cross(one.start,one.end,two.start)*cross(one.start,one.end,two.end)<0&&cross(two.start,two.end,one.start)*cross(two.start,two.end,one.end)<0),'patrols cannot cross while citizens are moving');
    const gap=Math.min(segmentPointDistance(one.start,two.start,two.end),segmentPointDistance(one.end,two.start,two.end),segmentPointDistance(two.start,one.start,one.end),segmentPointDistance(two.end,one.start,one.end));
    assert(gap>=1.6-1e-9,'the entire patrols, including paused endpoints, retain body clearance at any animation time');
  }
  const initial=structuredClone(first.root.userData.actorPositions);let movements=0;
  for(let time=0;time<=120;time+=.25){
    first.update(time);second.update(time);
    assert.deepEqual(first.root.userData.actorPositions,second.root.userData.actorPositions,'ambient movement is deterministic');
    for(const [index,p] of first.root.userData.actorPositions.entries()){
      assert([p.x,p.z].every(Number.isFinite));assert(canTraverse(p,p)&&!waterAt(p.x,p.z),'citizens never walk through buildings, scenery or water');
      assert(CITY_ROADS.some(road=>roadDistance(p,road)<=road.width/2),'every citizen stays on the authored road network');
      assert(residents.every(npc=>Math.hypot(p.x-npc.x,p.z-npc.z)>=1.59),'street routes keep room around interactive NPCs');
      if(Math.hypot(p.x-initial[index].x,p.z-initial[index].z)>1)movements++;
    }
    const citizens=first.root.userData.actorPositions;
    for(let a=0;a<citizens.length;a++)for(let b=a+1;b<citizens.length;b++)assert(Math.hypot(citizens[a].x-citizens[b].x,citizens[a].z-citizens[b].z)>=1.6-1e-9,'animated citizens never share overlapping body positions');
    if(time%30===0)checkPicking();
    for(const batch of batches){assert([...batch.instanceMatrix.array].every(Number.isFinite));for(let i=0;i<8;i++){batch.getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix);assert(position.y>-.2&&position.y<4,'posed parts stay at the street surface');}}
  }
  assert(movements>1000,'citizens visibly walk their routes rather than standing still');
  const stable=CITY_PROPS.find(prop=>prop.kind==='city-stable'),animals=first.root.children.filter(node=>node.name.startsWith('Stable '));
  assert.equal(animals.filter(animal=>animal.name.includes('horse')).length,2);assert.equal(animals.filter(animal=>animal.name.includes('wolf')).length,1);
  animals.forEach((animal,index)=>{const p=buildingPoint(stable,[-5.15,0,5.15][index],-1.5);assert.equal(animal.position.x,p.x);assert.equal(animal.position.z,p.z);assert.equal(animal.position.y,buildingFloorHeight(p.x,p.z));assert(animal.getObjectByName(index===2?'wolf-head':'horse-head'),'stable uses the actual articulated mount');});
  const horse=animals[0].getObjectByName('horse-head'),before=horse.quaternion.clone();first.update(122.3);assert(!horse.quaternion.equals(before),'stable animals use mount idle animations');
  const uniforms=new Set(),roleMixes=new Set(),movementPatterns=new Set(),identities=new Set(),names=new Set(),gestures=new Set();
  for(const city of CITY_LAYOUTS){
    const life=await createCityLife(village,city);
    try{
      assert.equal(life.citizens.size,24);assert.equal(life.root.userData.stableAnimals,3);
      const meshes=life.root.children.filter(node=>node.isInstancedMesh);
      assert.equal(meshes.length,18,'regional personalities add no citizen draws');
      const bodies=meshes.filter(mesh=>mesh.name.endsWith('-body'));
      roleMixes.add(bodies.map(mesh=>mesh.count).join(','));
      uniforms.add(bodies.map(mesh=>Array.from(mesh.instanceColor.array.slice(0,3)).join(',')).join(';'));
      for(const mesh of meshes.filter(mesh=>mesh.name.endsWith('-head')))assert([...mesh.instanceColor.array].every(value=>value===1),'regional clothing dyes preserve skin tones');
      for(const [id,citizen] of life.citizens){assert(!identities.has(id));identities.add(id);assert(!names.has(citizen.name));names.add(citizen.name);}
      const samples=[];let previous=[];
      for(let time=0;time<=60;time+=.5){
        life.update(time);
        for(const point of life.root.userData.actorPositions){
          assert(canTraverse(point,point)&&!waterAt(point.x,point.z),`${city.name}: walking residents avoid solids and water`);
          assert(city.roads.some(road=>roadDistance(point,road)<=road.width/2),`${city.name}: residents stay on streets`);
          assert(residents.every(npc=>Math.hypot(point.x-npc.x,point.z-npc.z)>=1.59),`${city.name}: bank, auction and other service NPCs retain clearance`);
        }
        const points=life.root.userData.actorPositions;
        for(let a=0;a<points.length;a++)for(let b=a+1;b<points.length;b++)assert(Math.hypot(points[a].x-points[b].x,points[a].z-points[b].z)>=1.6-1e-9);
        const poses=[...life.citizens.values()].map(({mesh},index)=>{
          const role=['merchant','warden','healer'].find(role=>mesh.getObjectByName(`village-${role}-body`));
          const angle=role==='warden'?mesh.rotation.y:mesh.getObjectByName(`village-${role}-${role==='merchant'?'right':'left'}-arm`).rotation.x;
          const before=previous[index],point=points[index];
          if(before&&Math.hypot(point.x-before.x,point.z-before.z)<.0001&&Math.abs(angle-before.angle)>.05)gestures.add(role);
          return {...point,angle};
        });previous=poses;
        samples.push([points[0].x-city.x,points[0].z-city.z]);
      }
      movementPatterns.add(JSON.stringify(samples));
    }finally{life.dispose();}
  }
  assert.equal(roleMixes.size,6,'each town has its own occupational balance');
  assert.equal(uniforms.size,6,'all six towns have visibly different clothing palettes');
  assert.equal(movementPatterns.size,6,'local pace and pauses produce different street rhythms');
  assert.equal(gestures.size,3,'paused merchants gesture, guards look around and pilgrims tend their hands');
  first.update(123,{x:1000,z:1000});assert(!first.root.visible,'the whole city population is culled outside its area');assert(citizenRigs.every(mesh=>!mesh.visible),'off-scene picking rigs honor whole-city culling');
  first.update(124,{x:0,z:0});assert(first.root.visible);assert(first.root.userData.visibleCitizens>0);assert.equal(citizenRigs.filter(mesh=>mesh.visible).length,first.root.userData.visibleCitizens);checkPicking();
  first.update(125,{x:170,z:0});assert.equal(first.root.userData.visibleCitizens,0);assert(animals.every(animal=>!animal.visible));assert(citizenRigs.every(mesh=>!mesh.visible),'off-scene rigs honor individual distance culling');
  first.update(126);const beforeYield=structuredClone(first.root.userData.actorPositions);
  second.update(126);second.update(126.1);const next=second.root.userData.actorPositions[0];
  first.update(126.1,next);assert.deepEqual(first.root.userData.actorPositions[0],beforeYield[0],'a citizen yields to the nearby player instead of advancing through them');
  let ownDisposals=0;const owned=new Set(batches.map(batch=>batch.geometry).filter(geometry=>!sourceGeometries.has(geometry)));assert.equal(owned.size,9);
  owned.forEach(geometry=>geometry.addEventListener('dispose',()=>ownDisposals++));
  first.dispose();first.dispose();first.update(130);assert.equal(first.root.children.length,0);assert.equal(first.citizens.size,0);assert(citizenRigs.every(mesh=>!mesh.visible&&mesh.children.length===0),'disposed citizen rigs cannot remain pickable');assert.equal(ownDisposals,9);assert.equal(sourceDisposals,0,'world and player-owned shared Blender resources survive city-life teardown');
  console.log('PASS city life: six distinct regional role mixes, clothing palettes and street rhythms; 144 named citizens; 24 separated patrols and 18 instanced draws per city; bank/auction clearance; preserved Blender walking joints, exact picking, stable idles, player yielding, shared mount decodes and isolated disposal.');
} finally {first?.dispose();second?.dispose();GLTFLoader.prototype.loadAsync=originalLoader;}
