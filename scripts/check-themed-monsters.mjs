import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MONSTERS } from '../src/bestiary.ts';
import { THEMED_MONSTER_KINDS, MONSTER_MODEL_KINDS, setMonsterAssets, setThemedMonsterAssets, createMonsterModel, animateMonsterModel } from '../src/monster-models.ts';
import { makeLootRemains } from '../src/loot.ts';

const bytes=readFileSync(new URL('../public/models/themed-monsters.glb',import.meta.url));
assert(bytes.length<10_000_000,'the 36-model detailed pack remains under 10 MB');
const asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
assert.equal(asset.animations.length,180,'36 creatures each have five distinct authored clips');
assert.throws(()=>setThemedMonsterAssets(asset.scene,asset.animations.filter(clip=>!clip.name.endsWith('-idle'))),/Missing themed monster idle clip/);
setThemedMonsterAssets(asset.scene,asset.animations);
const originalBytes=readFileSync(new URL('../public/models/monster-kit.glb',import.meta.url));
const original=await new GLTFLoader().parseAsync(originalBytes.buffer.slice(originalBytes.byteOffset,originalBytes.byteOffset+originalBytes.byteLength),'');
setMonsterAssets(original.scene,original.animations);
for(const kind of MONSTER_MODEL_KINDS)assert(createMonsterModel(kind),`${kind} original assets coexist with dungeon pack`);
const pose=group=>{const values=[];group.traverse(node=>values.push([node.name,...node.position.toArray(),...node.quaternion.toArray(),...node.scale.toArray()]));return values;};
const equalPose=(a,b)=>a.every((row,i)=>row.every((v,j)=>typeof v==='string'?v===b[i][j]:Math.abs(v-b[i][j])<1e-5));
const finite=group=>{group.updateMatrixWorld(true);group.traverse(node=>assert(node.matrixWorld.elements.every(Number.isFinite),'finite rig transforms'));};
const gripContracts=new Map(THEMED_MONSTER_KINDS.map(kind=>[kind,JSON.parse(asset.scene.getObjectByName(kind)?.userData.grip_contract??'[]')]));
let checkedGripSamples=0;
const checkedFingerGeometry=new Set();
const triangleCache=new WeakMap();
const ownMeshes=node=>node.isMesh?[node]:node.children.filter(child=>child.isMesh&&child.name.startsWith(node.name));
function assertWeaponGrip(model,kind,clearance=false){
 model.updateMatrixWorld(true);
 for(const entry of gripContracts.get(kind)){
  const prefix=kind+'-'+entry.side+'-',hand=model.getObjectByName(prefix+'hand-grip'),weapon=model.getObjectByName(prefix+'weapon-grip'),base=model.getObjectByName(prefix+'shaft-base'),tip=model.getObjectByName(prefix+'shaft-tip');
  assert(hand&&weapon&&base&&tip,`${kind}: stable hand, weapon and shaft attachment frames survive GLB optimization`);
  const hp=hand.getWorldPosition(new THREE.Vector3()),wp=weapon.getWorldPosition(new THREE.Vector3());
  assert(hp.distanceTo(wp)<1e-5,`${kind}: weapon handle stays in its gripping palm`);
  assert(hand.getWorldQuaternion(new THREE.Quaternion()).normalize().angleTo(weapon.getWorldQuaternion(new THREE.Quaternion()).normalize())<1e-5,`${kind}: curled fingers and weapon rotate together`);
  const a=base.getWorldPosition(new THREE.Vector3()),b=tip.getWorldPosition(new THREE.Vector3()),line=new THREE.Line3(a,b);
  assert(line.closestPointToPoint(hp,true,new THREE.Vector3()).distanceTo(hp)<1e-5,`${kind}: grip frame lies on the actual authored shaft axis`);
  if(!checkedFingerGeometry.has(prefix)){
   const handRoot=model.getObjectByName(prefix+'hand'),size=entry.scale??1,radius=entry.radius*size,axis=new THREE.Vector3().subVectors(b,a).normalize();
   for(const offset of [-.088,0,.088]){
    const center=hp.clone().addScaledVector(axis,offset*size);let nearestDistance=Infinity;
    for(const mesh of ownMeshes(handRoot)){
     const local=center.clone().applyMatrix4(mesh.matrixWorld.clone().invert()),positions=mesh.geometry.attributes.position,indices=mesh.geometry.index;
     for(let i=0;i<(indices?.count??positions.count);i+=3){
      const triangle=new THREE.Triangle(...[0,1,2].map(n=>new THREE.Vector3().fromBufferAttribute(positions,indices?indices.getX(i+n):i+n)));
      if(triangle.getArea()>1e-10)nearestDistance=Math.min(nearestDistance,triangle.closestPointToPoint(local,new THREE.Vector3()).distanceTo(local));
     }
    }
    assert(nearestDistance>radius*.8&&nearestDistance<radius+.018*size,`${kind}: actual curled finger/palm surfaces close around the handle at all three finger levels`);
   }
   checkedFingerGeometry.add(prefix);
  }
  if(clearance){
   for(const part of ['body',entry.side+'-arm'])for(const mesh of ownMeshes(model.getObjectByName(kind+'-'+part))){
    mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
    const radius=entry.radius*(entry.scale??1)*weapon.getWorldScale(new THREE.Vector3()).x;
    for(let j=0;j<=32;j++){
     const point=line.at(j/32,new THREE.Vector3());
     if(box.distanceToPoint(point)>radius)continue;
     if(!triangleCache.has(mesh.geometry)){
      const triangles=[],positions=mesh.geometry.attributes.position,indices=mesh.geometry.index;
      for(let i=0;i<(indices?.count??positions.count);i+=3)triangles.push(new THREE.Triangle(...[0,1,2].map(offset=>new THREE.Vector3().fromBufferAttribute(positions,indices?indices.getX(i+offset):i+offset))));
      triangleCache.set(mesh.geometry,triangles.filter(triangle=>triangle.getArea()>1e-10));
     }
     const local=point.applyMatrix4(mesh.matrixWorld.clone().invert()),nearest=new THREE.Vector3(),scale=mesh.getWorldScale(new THREE.Vector3()).x;
     assert(triangleCache.get(mesh.geometry).every(triangle=>triangle.closestPointToPoint(local,nearest).distanceTo(local)>radius*.8/scale),`${kind}: idle ${entry.kind} shaft clears actual ${part} surface, sample ${j}`);
    }
   }
  }
  checkedGripSamples++;
 }
}
const shared=new Set();asset.scene.traverse(node=>{if(node.isMesh){shared.add(node.geometry);shared.add(node.material);}});
for(const kind of THEMED_MONSTER_KINDS){
 const model=createMonsterModel(kind),twin=createMonsterModel(kind);model.position.set(7,0,4);
 const rest=pose(twin);let meshes=0,triangles=0;
 twin.traverse(node=>{if(node.isMesh){meshes++;triangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3;assert(shared.has(node.geometry)&&shared.has(node.material),'instances reuse geometry and materials');}});
 assert(meshes<=45,`${kind} draw budget`);assert(triangles>=1000&&triangles<=15000,`${kind} detail and triangle budget`);
 const bounds=new THREE.Box3().setFromObject(twin);assert(bounds.min.y>=-.03);assert(bounds.max.y<7);assert(MONSTERS[kind]?.model===kind);
 for(const suffix of ['idle','walk','auto','attack','death']){
  const clip=asset.animations.find(clip=>clip.name===`${kind}-${suffix}`);
  assert(clip?.tracks.length>=6,`${kind} ${suffix} animates several articulated parts`);
  assert(clip.tracks.every(track=>[...track.values].every(Number.isFinite)));
 }
 for(let step=0;step<=24;step++){animateMonsterModel(model,step/12,false);assertWeaponGrip(model,kind,true);}
 for(const moving of [false,true]){
  animateMonsterModel(model,0,moving);const a=pose(model);animateMonsterModel(model,.23,moving);assert(!equalPose(pose(model),a),`${kind} has authored ${moving?'walk':'idle'} motion`);
  animateMonsterModel(model,1e6,moving);finite(model);assertWeaponGrip(model,kind);
 }
 let special;
 for(const basic of [false,true]){
  for(const impact of [.2,.5,.8]){
   let first;
   for(const progress of [0,.1,impact,.9,1]){
    animateMonsterModel(model,0,false,{style:MONSTERS[kind].attackStyle,basic,progress,impactProgress:impact});finite(model);assertWeaponGrip(model,kind);
    assert(new THREE.Box3().setFromObject(model).min.y>=-.035,`${kind} attack remains grounded`);
    if(progress===0)first=pose(model);
    if(progress===impact){if(kind==='anvil-warden'&&!basic)assert(new THREE.Box3().setFromObject(model.getObjectByName(`${kind}-right-hand`)).min.y<.15,'Anvil Warden hammer reaches the ground at impact');const held=pose(model);animateMonsterModel(model,0,false,{style:MONSTERS[kind].attackStyle,basic,progress,impactProgress:impact});assert.deepEqual(pose(model),held,'repeated clip sampling does not accumulate transforms');assert(!equalPose(pose(model),first),'distinct contact pose');if(!basic)special=pose(model);else assert(!equalPose(pose(model),special),'separate basic and special contacts');}
    if(progress===1)assert(equalPose(pose(model),first),'full attack recovery');
   }
  }
 }
 animateMonsterModel(model,.23,true);animateMonsterModel(twin,.23,true);assert(equalPose(pose(model).slice(1),pose(twin).slice(1)),'attack cancellation restores authored locomotion');
 for(let step=0;step<=20;step++){
  animateMonsterModel(model,0,false,undefined,step/20);finite(model);assertWeaponGrip(model,kind);assert(new THREE.Box3().setFromObject(model).min.y>=-.04,`${kind} death remains grounded`);
 }
 const heldDeath=pose(model);animateMonsterModel(model,0,false,undefined,1);assert.deepEqual(pose(model),heldDeath,'death sampling does not accumulate transforms');
 const deadBounds=new THREE.Box3().setFromObject(model);assert(Math.abs(deadBounds.min.y)<.035,'settled corpse touches floor');
 const corpse=makeLootRemains(kind),fallen=corpse.getObjectByName(`fallen-${kind}`),dead=pose(fallen);
 animateMonsterModel(fallen,5,true,{style:'slam',progress:.5,impactProgress:.5});assert.deepEqual(pose(fallen),dead,'loot corpse stays still');
 assert.deepEqual(model.position.toArray(),[7,0,4],'animation preserves authoritative root');
 assert.deepEqual(pose(createMonsterModel(kind)),rest,'shared asset rest pose is untouched');
 console.log(`ASSET ${kind}: ${Math.round(triangles)} triangles, ${meshes} draws, ${bounds.max.y.toFixed(2)}m high; all five authored clips verified`);
}
console.log(`PASS: ${THEMED_MONSTER_KINDS.length} distinct dungeon monsters, 180 authored clips, ${(bytes.length/1e6).toFixed(2)} MB; contact alignment, locomotion, recovery, grounded deaths and isolated shared assets; ${checkedGripSamples} sampled weapon grip poses.`);
