import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { setRaidAssets, createMonsterModel, animateMonsterModel, playMonsterHit } from '../src/monster-models.ts';
import { setRaidRewardAssets, makeRaidAdornment, makeDeathApostlePet, animateDeathApostlePet } from '../src/raid-model.ts';
import { RAID_CAST_CLIPS, RAID_EXTRA_CLIPS } from '../src/raid-visuals.ts';

const bytes=readFileSync(new URL('../public/models/horned-apostle.glb',import.meta.url));
assert(bytes.length<5_500_000,'three 37/38-bone variants, 78 supplied clips and cosmetics stay under 5.5 MB after deduplication');
const asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
assert.equal(asset.animations.length,78,'all three variants retain all 26 source clips');
setRaidAssets(asset.scene,asset.animations);setRaidRewardAssets(asset.scene);
const poses=group=>{const pose=[];group.traverse(n=>pose.push([n.name,...n.position,...n.quaternion,...n.scale]));return pose;};
const sourceRest=poses(asset.scene), geometries=new Set(),materials=new Set(),gold=new Set();
asset.scene.traverse(n=>{if(n.isMesh){geometries.add(n.geometry);materials.add(n.material);if(n.material.name==='True Apostle gold halo gem')gold.add(n.geometry);assert(!n.material.map,'source palette needs no texture download');}});
let tinted=0,cold=0;
for(const geometry of geometries){const color=geometry.getAttribute('color');if(!color||gold.has(geometry))continue;
 for(let i=0;i<color.count;i++){const r=color.getX(i),g=color.getY(i),b=color.getZ(i);tinted++;if(b>r*1.05&&b>g) cold++;
  assert(!(g>r*1.3&&g>b*1.12&&g>.08),'void assets contain no moss-green palette');
  assert(!(r>b*1.4&&g>b*1.15&&g>.15),'warm gold is confined to the separate real-copy gem; crimson eyes remain allowed');
 }}
assert(cold/tinted>.95,'obsidian, violet and cyan dominate the authored vertex palette');
for(const kind of ['horned-apostle','apostle-clone','apostle-incarnate']){
 const model=createMonsterModel(kind),twin=createMonsterModel(kind);let draws=0,triangles=0;
 for(const part of ['body','head','left-arm','right-arm','left-lower-arm','right-lower-arm','left-wing','right-wing','halo','stars'])assert(model.getObjectByName(`${kind}-${part}`),`${kind} preserves articulated ${part}`);
 model.traverse(n=>{if(n.isMesh){draws++;triangles+=(n.geometry.index?.count??n.geometry.attributes.position.count)/3;assert(geometries.has(n.geometry)&&materials.has(n.material),'instances share source buffers');}});
 assert(draws<=80,'the 37/38-bone supplied rig stays within its rigid-part draw budget');assert(triangles>12000&&triangles<13000,'layered void armor, etched sigils and eclipse fragments preserve the source triangle count');
 for(const clip of ['idle','walk','auto','attack','cast','death',...RAID_CAST_CLIPS,...RAID_EXTRA_CLIPS]){
  const authored=asset.animations.find(c=>c.name===`${kind}-${clip}`);
  assert(authored?.tracks.length>=9,`${kind} ${clip} retains its articulated animation after constant-track pruning`);
  for(const part of ['body','left-arm','right-arm','left-lower-arm','right-lower-arm'])assert(authored.tracks.some(track=>track.name.startsWith(`${kind}-${part}.`)),`${kind} ${clip} animates ${part}`);
 }
 for(const moving of [false,true]){animateMonsterModel(model,0,moving);const a=poses(model);animateMonsterModel(model,.3,moving);assert.notDeepEqual(poses(model),a,'authored locomotion changes pose');}
 for(const basic of [true,false])for(let step=0;step<=20;step++){
  animateMonsterModel(model,0,false,{style:'pulse',basic,progress:step/20,impactProgress:.5});model.updateMatrixWorld(true);
  model.traverse(n=>assert(n.matrixWorld.elements.every(Number.isFinite)));
  assert(new THREE.Box3().setFromObject(model,true).min.y>-.28,`${kind} attack preserves the supplied shallow ankle sway`);
 }
 const spellPoses=new Set();
 for(const clip of [...RAID_CAST_CLIPS,...RAID_EXTRA_CLIPS]){
  for(let step=0;step<=20;step++){
   animateMonsterModel(model,0,false,{clip,style:'pulse',progress:step/20,impactProgress:.5});
   model.updateMatrixWorld(true);model.traverse(n=>assert(n.matrixWorld.elements.every(Number.isFinite)));
   assert(new THREE.Box3().setFromObject(model,true).min.y>(clip==='spawn'?-7.12:-.28),`${kind} ${clip} remains inside the supplied emergence/sway bounds`);
  }
  animateMonsterModel(model,0,false,{clip,style:'pulse',progress:.4,impactProgress:.5});
  const pose=poses(model);spellPoses.add(JSON.stringify(pose));
  animateMonsterModel(model,0,false,{clip,style:'pulse',progress:.4,impactProgress:.5});assert.deepEqual(poses(model),pose,'paused spell sampling does not accumulate transforms');
 }
 assert.equal(spellPoses.size,RAID_CAST_CLIPS.length+RAID_EXTRA_CLIPS.length,'every spell has a distinct authored silhouette');
 animateMonsterModel(model,10,false);const idlePose=poses(model);playMonsterHit(model,10);animateMonsterModel(model,10.2,false);
 assert.notDeepEqual(poses(model),idlePose,'real damage drives the supplied hit clip');
 const activeCast={clip:'death-palm',style:'pulse',progress:.4,impactProgress:.5};
 animateMonsterModel(model,10.2,false,activeCast);const casting=poses(model);playMonsterHit(model,10.2);animateMonsterModel(model,10.2,false,activeCast);
 assert.deepEqual(poses(model),casting,'damage recoil cannot interrupt an authoritative cast');
 for(let step=0;step<=20;step++){animateMonsterModel(model,0,false,undefined,step/20);assert(new THREE.Box3().setFromObject(model,true).min.y>-.4,`${kind} supplied death fragments stay near the floor`);}
 model.traverse(node=>{if(node.isMesh)assert(new THREE.Box3().setFromObject(node,true).getSize(new THREE.Vector3()).length()<.1,'the supplied death clip burns each fragment away');});
 const pose=poses(model);animateMonsterModel(model,0,false,undefined,1);assert.deepEqual(poses(model),pose,'repeated sampling never accumulates transforms');
 assert(Math.abs(new THREE.Box3().setFromObject(twin,true).min.y)<.00001,'independent model stays at source pose');
 console.log(`${kind}: ${draws} draws, ${triangles} triangles; four arms, detailed wings and 26 clips`);
}
assert(asset.scene.getObjectByName('horned-apostle-halo-gem'),'real clone has a separate gold halo gem');
assert(!asset.scene.getObjectByName('apostle-clone-halo-gem'),'false clone lacks the real gem');
for(const kind of ['wings','crown','aura','weapon']){
 const model=makeRaidAdornment(kind);assert(model.children.length);assert(new THREE.Box3().setFromObject(model,true).getSize(new THREE.Vector3()).length()>0);
 if(kind==='wings'){let triangles=0;model.traverse(n=>{if(n.isMesh)triangles+=(n.geometry.index?.count??n.geometry.attributes.position.count)/3;});assert(triangles>2500,'wearable wings include inset sails, veins and hand stitches');}
}
for(const stage of [0,1,2,3]){
 const pet=makeDeathApostlePet(stage);pet.position.set(4,0,3);const scale=pet.scale.clone();animateDeathApostlePet(pet,.23,true);
 assert.deepEqual(pet.position.toArray(),[4,0,3]);assert(pet.scale.equals(scale));assert.equal(pet.userData.apostleStage,stage);
 const boss=stage===3?'apostle-incarnate':'horned-apostle';assert.equal(pet.getObjectByName(`${boss}-left-wing`).visible,stage>=1);
 assert(new THREE.Box3().setFromObject(pet,true).max.y<1.5,'companion stays pet-sized');
}
assert.equal(makeDeathApostlePet(NaN).userData.apostleStage,0);assert.equal(makeDeathApostlePet(99).userData.apostleStage,3);
assert.deepEqual(poses(asset.scene),sourceRest,'rendering never changes source transforms');
console.log(`PASS Apostle asset: ${(bytes.length/1e3).toFixed(0)} KB, ${asset.animations.length} clips, distinct spells, shared geometry, cosmetics, four pet stages.`);
