import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import { INSTANT_COMBAT_MODEL_KINDS } from '../src/instant-combat.ts';
import { INSTANT_COMBAT_BOSS_CLIPS, instantCombatCastCue } from '../src/instant-combat-visuals.ts';
import { INSTANT_COMBAT_SKILLS } from '../src/instant-combat-skills.ts';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ids=INSTANT_COMBAT_MODEL_KINDS;
const source=fs.readFileSync(new URL('../public/models/instant-combat-monsters.glb',import.meta.url));
const gltf=await new Promise((resolve,reject)=>new GLTFLoader().parse(source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength),'',resolve,reject));
assert.equal(gltf.animations.length,ids.length*5+Object.values(INSTANT_COMBAT_BOSS_CLIPS).flat().length);
assert.deepEqual(new Set(gltf.scene.children.map(root=>root.name)),new Set(ids));
let meshes=0,triangles=0;const materials=new Set();
for(const id of ids){
 const root=gltf.scene.getObjectByName(id),rest=[];
 assert(root.getObjectByName(`${id}-body`),`${id}: required body`);
 assert.deepEqual(root.position.toArray(),[0,0,0]);assert.deepEqual(root.scale.toArray(),[1,1,1]);
 root.traverse(node=>{
  rest.push([node,node.position.clone(),node.quaternion.clone(),node.scale.clone()]);
  if(!node.isMesh)return;
  meshes++;triangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3;
  assert(node.geometry.attributes.color,`${node.name}: modeled palette`);
  materials.add(node.material);assert.equal(node.isSkinnedMesh,undefined,'Rigid parts clone safely');
 });
 const bounds=new THREE.Box3().setFromObject(root,true),height=bounds.max.y-bounds.min.y;
 assert(bounds.min.y>=-.012&&bounds.min.y<.5,`${id}: authored foot or hovering-caster height (${bounds.min.y})`);
 assert(height>1.4&&height<5.1,`${id}: authored scale (${height})`);
 const mixer=new THREE.AnimationMixer(root);
 const attacks=new Set();
 for(const suffix of ['idle','walk','auto','attack','death',...(INSTANT_COMBAT_BOSS_CLIPS[id]??[])]){
  const clip=gltf.animations.find(clip=>clip.name===`${id}-${suffix}`);assert(clip,`${id}-${suffix}`);assert(clip.duration>0);
  for(const track of clip.tracks)assert(track.name.startsWith(`${id}-`),`${clip.name}: foreign node ${track.name}`);
  if(INSTANT_COMBAT_BOSS_CLIPS[id]?.includes(suffix))attacks.add(JSON.stringify(clip.tracks.map(track=>Array.from(track.values))));
  const action=mixer.clipAction(clip).setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
  for(const t of [0,.25,.4,.5,.75,1]){
   mixer.setTime(clip.duration*t);root.updateWorldMatrix(true,true);
   // Box bounds conservatively include empty corners of rotated rigid geometry.
   let min=Infinity;root.traverse(node=>{if(!node.isMesh)return;const positions=node.geometry.attributes.position,p=new THREE.Vector3();for(let i=0;i<positions.count;i++){p.fromBufferAttribute(positions,i).applyMatrix4(node.matrixWorld);min=Math.min(min,p.y);}});
   assert(min>-.012,`${clip.name} t=${t}: below ground ${min}`);
   if(suffix==='death'&&t===1)assert(min>=-.012&&min<.04,`${id}: source corpse rests within four centimetres of the floor (${min})`);
  }
  mixer.stopAllAction();for(const [node,position,quaternion,scale] of rest){node.position.copy(position);node.quaternion.copy(quaternion);node.scale.copy(scale);}
 }
 assert.equal(attacks.size,INSTANT_COMBAT_BOSS_CLIPS[id]?.length??0,`${id}: every authored ability has distinct motion`);
}
assert.equal(materials.size,2);
const hooks=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?specifier+'.ts':specifier,context);}});
const {setInstantCombatAssets,createMonsterModel,animateMonsterModel}=await import('../src/monster-models.ts');hooks.deregister();
assert.throws(()=>setInstantCombatAssets(gltf.scene,gltf.animations.filter(clip=>clip.name!==ids[0]+'-death')),/Missing Instant Combat monster death clip/,'a partial pack cannot silently show fallback models');
setInstantCombatAssets(gltf.scene,gltf.animations);
assert.throws(()=>setInstantCombatAssets(gltf.scene,gltf.animations.filter(clip=>clip.name!=='ossuary-tyrant-anchors')),/Missing Instant Combat boss anchors clip/,'a missing boss ritual cannot silently reuse the generic strike');
const pose=root=>{const result=[];root.traverse(node=>result.push([node.name,...node.position.toArray(),...node.quaternion.toArray(),...node.scale.toArray()]));return result;};
for(const id of ids){
 const a=createMonsterModel(id),b=createMonsterModel(id);assert(a&&b,'registered model creates through gameplay path');
 const original=pose(gltf.scene.getObjectByName(id)),other=pose(b);
 assert(animateMonsterModel(a,1,true),'walk uses imported model');
 assert(animateMonsterModel(a,1,false,{style:'pulse',progress:.5,impactProgress:.5}),'attack uses authored clip');
 assert(animateMonsterModel(a,1,false,undefined,1),'death uses authored clip');
 assert.deepEqual(pose(b),other,'one actor animation cannot move another actor');
 assert.deepEqual(pose(gltf.scene.getObjectByName(id)),original,'animation cannot mutate the shared source');
 for(const suffix of INSTANT_COMBAT_BOSS_CLIPS[id]??[]){
  const expected=gltf.scene.getObjectByName(id).clone(true),clip=gltf.animations.find(clip=>clip.name===`${id}-${suffix}`),mixer=new THREE.AnimationMixer(expected);
  const authoredTime=suffix.startsWith('skill-');
  const action=mixer.clipAction(clip).setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();mixer.setTime(clip.duration*(authoredTime?.8:.5));
  animateMonsterModel(a,1,false,{clip:suffix,style:'pulse',progress:.8,impactProgress:.8,authoredTime});
  assert.deepEqual(pose(a.children[0]),pose(expected),`${id} ${suffix}: runtime selects its authored contact pose at authoritative impact`);
  assert.deepEqual(pose(b),other,'boss casting cannot move another actor');
 }
}

const names={cleave:'Rending Cleave',cross:'Ruin Cross',ring:'Hollow Nova',barrage:'Falling Ruin'};
for(const [model,clips] of Object.entries(INSTANT_COMBAT_BOSS_CLIPS)){
 const enemy={id:'boss',model,alive:true,rotation:1},mechanic=clips.at(-1),run={phase:'fighting',boss:{id:'boss',shielded:false,endsAt:0},mechanic:null},state={run};
 for(const skill of INSTANT_COMBAT_SKILLS[model]){
  enemy.attack={name:skill.name,style:'pulse',startedAt:1000,impactAt:1000+skill.events[0].ms,endsAt:1000+skill.castMs};
  const before=structuredClone(state),sample=1000+skill.castMs*.4,cue=instantCombatCastCue(state,enemy,sample);
  assert.equal(cue.clip,`skill-${skill.id}`);assert.equal(cue.progress,.4,'full source timeline preserves every event, including repeated strikes');assert(cue.authoredTime);
  assert.equal(instantCombatCastCue(state,enemy,999),undefined);assert.equal(instantCombatCastCue(state,enemy,enemy.attack.endsAt),undefined);
  assert.deepEqual(instantCombatCastCue(state,enemy,sample),cue,'paused snapshot has a deterministic pose');assert.deepEqual(state,before,'animation never changes combat');
 }
 enemy.attack=null;run.boss={id:'boss',shielded:true,endsAt:46000};run.mechanic={kind:mechanic};
 assert.equal(instantCombatCastCue(state,enemy,2000)?.clip,mechanic,`${model}: the shield ritual animates even without an ordinary attack`);
 assert.equal(instantCombatCastCue(state,enemy,999),undefined);assert.equal(instantCombatCastCue(state,enemy,46000),undefined);
 assert.equal(instantCombatCastCue(state,{...enemy,id:'objective'},2000),undefined,'objectives do not borrow boss casts');
 assert.equal(instantCombatCastCue(state,{...enemy,alive:false},2000),undefined,'death interrupts a ritual');
 run.boss.shielded=false;run.mechanic=null;assert.equal(instantCombatCastCue(state,enemy,2000),undefined,'clearing the mechanic immediately restores normal animation');
 enemy.attack={name:'Basic',basic:true,style:'swipe',startedAt:1000,impactAt:1500,endsAt:2000};assert.equal(instantCombatCastCue(state,enemy,1500),undefined,'basic attacks keep the boss-specific auto clip');
}

console.log(`Instant Combat monster assets passed: ${ids.length} original models, ${gltf.animations.length} clips, ${meshes} primitives, ${triangles} triangles, 2 materials, ${source.length} bytes.`);
