import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeEnemy, animateEnemy, setMonsterAssets } from '../src/characters.ts';
import { MONSTER_MODEL_KINDS, enemyAttackPhase } from '../src/monster-models.ts';
import { makeLootRemains } from '../src/loot.ts';
const worldBosses=['briarhorn-elder','rimefang-matriarch','stormhorn-behemoth','ashen-crown-titan'];
const chargeKinds=['bramble-wolf','briar-boar','dune-scorpion','stone-golem','frost-yeti','void-stalker',...worldBosses];
for(const [chargeProgress,impactProgress] of [[.2,.5],[.45,.8],[.1,.7]]){
 const pose={style:'charge',progress:0,chargeProgress,impactProgress};
 assert.equal(enemyAttackPhase({...pose,progress:chargeProgress}),.25,'chargeAt aligns with the braced rush pose');
 assert.equal(enemyAttackPhase({...pose,progress:impactProgress}),.5,'dash end aligns with charge contact');
 assert.equal(enemyAttackPhase({...pose,progress:1}),1,'charge recovery finishes at endsAt');
 let last=-1;
 for(let step=0;step<=100;step++){const phase=enemyAttackPhase({...pose,progress:step/100});assert(phase>=last&&phase<=1,'charge phase advances through windup, rush and recovery');last=phase;}
}

const pose = group => { const result=[];group.traverse(node=>result.push([node.name,...node.position.toArray(),...node.quaternion.toArray(),...node.scale.toArray()]));return result; };
const finite = group => { group.updateMatrixWorld(true);group.traverse(node=>assert(node.matrixWorld.elements.every(Number.isFinite),'all monster transforms remain finite')); };
const source = readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const start = source.indexOf('function removeRig('), end = source.indexOf('function removeNode(',start);
const removeRig = Function('THREE',`${stripTypeScriptTypes(source.slice(start,end))};return removeRig;`)(THREE);

// Known clip transforms prove contact alignment at several different server windup fractions.
const fixture = new THREE.Group(), clips=[], geometry=new THREE.BoxGeometry(.6,1,.6),material=new THREE.MeshStandardMaterial();
for(const kind of MONSTER_MODEL_KINDS){
 const root=new THREE.Group();root.name=kind;fixture.add(root);
 const body=new THREE.Group();body.name=`${kind}-body`;root.add(body);
 const mesh=new THREE.Mesh(geometry,material);mesh.position.y=.5;body.add(mesh);
 const head=new THREE.Group();head.name=`${kind}-head`;head.position.set(0,.8,.1);body.add(head);
 for(const [index,name] of ['left-leg','right-leg','left-arm','right-arm'].entries()) {const part=new THREE.Group();part.name=`${kind}-${name}`;part.position.set(index%2?.25:-.25,.5,0);body.add(part);}
 clips.push(new THREE.AnimationClip(`${kind}-attack`,1,[new THREE.VectorKeyframeTrack(`${kind}-body.position`,[0,.25,.5,1],[0,0,0,0,0,-.2,0,0,.8,0,0,0])]));
 clips.push(new THREE.AnimationClip(`${kind}-auto`,.4,[new THREE.VectorKeyframeTrack(`${kind}-body.position`,[0,.2,.4],[0,0,0,0,0,.3,0,0,0])]));
 clips.push(new THREE.AnimationClip(`${kind}-death`,1.4,[new THREE.VectorKeyframeTrack(`${kind}-body.scale`,[0,1.4],[1,1,1,1,.3,1])]));
}
assert.throws(()=>makeEnemy(MONSTER_MODEL_KINDS[0]),/Monster assets not loaded/);
assert.throws(()=>setMonsterAssets(new THREE.Group(),clips),/Missing monster model/);
setMonsterAssets(fixture,clips);
assert.throws(()=>setMonsterAssets(fixture,clips.slice(1)),/Missing monster attack clip/,'incomplete assets cannot replace the valid library');
assert.throws(()=>setMonsterAssets(fixture,clips.filter(clip=>!clip.name.endsWith('-auto'))),/Missing monster auto clip/);
const fixtureRest=pose(fixture), clipData=clips.map(clip=>[...clip.tracks[0].values]);
for(const kind of MONSTER_MODEL_KINDS){
 const enemy=makeEnemy(kind),twin=makeEnemy(kind),scene=new THREE.Scene();scene.add(enemy,twin);
 const nodes=[];enemy.traverse(node=>nodes.push(node));enemy.position.set(17,4,-9);enemy.rotation.set(0,1.4,0);enemy.scale.setScalar(1.2);
 const twinBefore=pose(twin),body=enemy.getObjectByName(`${kind}-body`);
 for(const impact of [.2,.5,.8]){
  const attack=Object.freeze({style:'bite',progress:impact*.5,impactProgress:impact});animateEnemy(enemy,5,true,attack);
  assert(Math.abs(body.position.z+.2)<1e-6,'anticipation pose remains before the authoritative hit');
  animateEnemy(enemy,5,false,{...attack,progress:impact});assert(Math.abs(body.position.z-.8)<1e-6,'clip contact aligns exactly to each server impact timestamp');
  animateEnemy(enemy,5,false,{...attack,basic:true,progress:impact*.5});assert(Math.abs(body.position.z-.15)<1e-6,'basic attack moves directly forward without a charge');
  animateEnemy(enemy,5,false,{...attack,basic:true,progress:impact});assert(Math.abs(body.position.z-.3)<1e-6,'basic clip contact aligns exactly to server impact');
  const held=pose(enemy);animateEnemy(enemy,5,false,{...attack,basic:true,progress:impact});assert.deepEqual(pose(enemy),held,'repeated attack time preserves the mixer pose instead of resetting its cached transforms');
  animateEnemy(enemy,5,false,{...attack,progress:impact});assert(Math.abs(body.position.z-.8)<1e-6,'switching from basic to special clears the basic pose');
  for(const progress of [0,.03,impact,Math.min(.99,impact+.1),1]){animateEnemy(enemy,5,true,{...attack,progress});finite(enemy);}
  animateEnemy(enemy,5,false,{...attack,progress:impact});animateEnemy(enemy,.31,true);animateEnemy(twin,.31,true);
  const localPose=pose(enemy).slice(1);assert.deepEqual(localPose,pose(twin).slice(1),'canceling an attack restores every idle/walk transform');
 }
 assert.deepEqual(enemy.position.toArray(),[17,4,-9]);assert.equal(enemy.rotation.y,1.4);assert.deepEqual(enemy.scale.toArray(),[1.2,1.2,1.2]);
 const after=[];enemy.traverse(node=>after.push(node));assert.deepEqual(after,nodes,'updates never allocate scene objects');
 assert.notDeepEqual(twinBefore,pose(twin),'new monster limbs have locomotion as well as attack clips');
 const corpse=makeLootRemains(kind),fallen=corpse.getObjectByName(`fallen-${kind}`),deadPose=pose(corpse);
 animateEnemy(fallen,10,true,{style:'slam',progress:.5,impactProgress:.5});assert.deepEqual(pose(corpse),deadPose,'loot disables imported animation through the existing rig marker');
 const bounds=new THREE.Box3().setFromObject(fallen);assert(Math.abs(bounds.min.y)<1e-6,'imported remains rest on the floor');
 let disposed=0;const listener=()=>disposed++;geometry.addEventListener('dispose',listener);material.addEventListener('dispose',listener);
 removeRig(enemy);removeRig(corpse);assert.equal(disposed,0,'retiring monsters and loot keeps shared imported assets alive');assert.equal(twin.parent,scene);
 geometry.removeEventListener('dispose',listener);material.removeEventListener('dispose',listener);
}
assert.deepEqual(pose(fixture),fixtureRest,'attack poses never modify the shared Blender library');assert.deepEqual(clips.map(clip=>[...clip.tracks[0].values]),clipData);

for(const kind of ['moss-slime','briar-sentinel','ice-wisp','root-warden']){
 const enemy=makeEnemy(kind);enemy.position.set(3,2,8);enemy.rotation.y=.6;animateEnemy(enemy,.32,false);const idle=pose(enemy);
 animateEnemy(enemy,.32,false,{style:kind==='ice-wisp'?'pulse':'slam',progress:.3,impactProgress:.6});const windup=pose(enemy);
 animateEnemy(enemy,.32,false,{style:'slam',progress:.6,impactProgress:.6});const impact=pose(enemy);
 assert.notDeepEqual(windup,idle,`${kind} visibly anticipates its attack`);assert.notDeepEqual(impact,windup,`${kind} has a distinct contact pose`);
 for(const progress of [0,.1,.6,.9,1]){animateEnemy(enemy,.32,true,{style:'slam',progress,impactProgress:.6});finite(enemy);}
 animateEnemy(enemy,.32,false);assert.deepEqual(pose(enemy),idle,`${kind} cancels and restores every procedural pivot`);
 const body=enemy.getObjectByName('enemy-body'),idleScale=body.scale.toArray();
 for(const progress of [0,.02,.15,.375,.7,1]) {
  animateEnemy(enemy,.32,false,{style:'slam',basic:true,progress,impactProgress:.375});finite(enemy);
  assert.deepEqual(body.scale.toArray(),idleScale,`${kind} basic attack never charges or inflates`);
  if(progress===.02)assert(body.position.z>0,`${kind} immediately swings toward the target`);
  if(progress===.375)assert.notDeepEqual(pose(enemy),impact,`${kind} has a distinct short contact pose`);
 }
 assert(pose(enemy).every((part,index)=>part.every((value,component)=>value===idle[index][component])),`${kind} basic recovery restores idle`);
 animateEnemy(enemy,.32,false,{style:'slam',basic:true,progress:.375,impactProgress:.375});
 animateEnemy(enemy,.32,false);assert.deepEqual(pose(enemy),idle,`${kind} interrupted basic restores idle`);
 assert.deepEqual(enemy.position.toArray(),[3,2,8]);assert.equal(enemy.rotation.y,.6);
}
assert.throws(()=>makeEnemy('unknown-creature'),/Unknown enemy kind/);
console.log(`PASS: ${MONSTER_MODEL_KINDS.length+4} direct auto attacks and charged attacks, timestamp-aligned clip contact, anticipations/recovery, cancel restoration, finite isolated locomotion, static loot, shared assets and disposal.`);

// Inspect the actual exported library as well as the known contact fixture.
const assetURL=new URL('../public/models/monster-kit.glb',import.meta.url);
{
 const bytes=readFileSync(assetURL);const asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 assert(bytes.length<1_000_000,'the complete animated monster library remains under one megabyte');
 for(const kind of worldBosses)for(const suffix of ['attack','swipe','cast','auto','death'])assert(asset.animations.some(clip=>clip.name===`${kind}-${suffix}`),`${kind} has authored ${suffix}`);
 setMonsterAssets(asset.scene,asset.animations);
 const sourceMeshes=new Set();asset.scene.traverse(node=>{if(node.isMesh){sourceMeshes.add(node.geometry);sourceMeshes.add(node.material);}});
 for(const kind of MONSTER_MODEL_KINDS){
  const enemy=makeEnemy(kind);let meshes=0;enemy.traverse(node=>{if(node.isMesh){meshes++;assert(sourceMeshes.has(node.geometry)&&sourceMeshes.has(node.material));}});
  const rest=pose(enemy),bounds=new THREE.Box3().setFromObject(enemy);assert(!bounds.isEmpty());assert(bounds.min.y>=-.05);assert(bounds.max.y<10);assert(meshes<=30,'each articulated monster has bounded draws');
  let first,contact;
  for(const progress of [0,.15,.4,.5,.65,.9,1]){
   animateEnemy(enemy,0,false,{style:'bite',progress,impactProgress:.5});finite(enemy);
   if(progress===0)first=pose(enemy);
   if(progress===.5){contact=pose(enemy);assert.notDeepEqual(contact,rest,`${kind} has an authored moving attack`);assert(new THREE.Box3().setFromObject(enemy).min.y>=-.05,'the authored hit pose does not plunge into the floor');}
   if(progress===1)assert(pose(enemy).every((part,index)=>part.every((value,component)=>typeof value==='string'?value===first[index][component]:Math.abs(value-first[index][component])<1e-6)),'the attack clip returns to its starting pose within export precision');
  }
  const auto=asset.animations.find(clip=>clip.name===`${kind}-auto`);
  assert(auto && Math.abs(auto.duration-.4)<.001,`${kind} has a separate 0.4s Blender auto attack`);
  const body=enemy.getObjectByName(`${kind}-body`),baseZ=rest.find(part=>part[0]===`${kind}-body`)[3];
  for(const progress of [0,.02,.15,.375,.6,.9,1]) {
   animateEnemy(enemy,0,false,{style:'swipe',basic:true,progress,impactProgress:.375});finite(enemy);
   assert(new THREE.Box3().setFromObject(enemy).min.y>=-.05,`${kind} basic stays above the floor`);
   assert(body.position.z>=baseZ-1e-6,`${kind} basic never pulls back to charge`);
   if(progress===0)first=pose(enemy);
   if(progress===.02)assert(body.position.z>baseZ,`${kind} starts the direct strike immediately`);
   if(progress===.375)assert.notDeepEqual(pose(enemy),contact,`${kind} auto contact differs from charged attack`);
   if(progress===1)assert(pose(enemy).every((part,index)=>part.every((value,component)=>typeof value==='string'?value===first[index][component]:Math.abs(value-first[index][component])<1e-6)),'the direct strike returns to rest');
  }
  animateEnemy(enemy,0,false,{style:'slam',progress:.5,impactProgress:.5});assert.deepEqual(pose(enemy),contact,'special animation restores cleanly after an auto attack');
  if(chargeKinds.includes(kind)){
   const clip=asset.animations.find(clip=>clip.name===`${kind}-charge`);assert(clip&&Math.abs(clip.duration-1)<.001,`${kind} has a real one-second charge clip`);
   for(const [chargeProgress,impactProgress] of [[.2,.6],[.5,.8]]){
    const attack={style:'charge',progress:0,chargeProgress,impactProgress};
    animateEnemy(enemy,0,false,attack);const neutral=pose(enemy),x=body.position.x,z=body.position.z;
    for(let step=0;step<=60;step++){
     animateEnemy(enemy,0,true,{...attack,progress:step/60});finite(enemy);
     assert(Math.abs(body.position.x-x)<1e-6&&Math.abs(body.position.z-z)<1e-6,`${kind} charge leaves local X/Z anchored for authoritative root movement`);
     assert(new THREE.Box3().setFromObject(enemy).min.y>=-.05,`${kind} charge remains above the floor`);
    }
    assert(pose(enemy).every((part,i)=>part.every((value,j)=>typeof value==='string'?value===neutral[i][j]:Math.abs(value-neutral[i][j])<1e-6)),`${kind} charge fully recovers`);
    animateEnemy(enemy,0,false,{...attack,progress:chargeProgress*.6});const crouch=pose(enemy);
    animateEnemy(enemy,0,false,{...attack,progress:chargeProgress});const rush=pose(enemy);
    assert.notDeepEqual(crouch,neutral,`${kind} anticipates charge`);assert.notDeepEqual(rush,crouch,`${kind} braces for the dash`);
    animateEnemy(enemy,0,false,{...attack,progress:impactProgress});assert.notDeepEqual(pose(enemy),contact,`${kind} charge contact differs from regular attack`);
    animateEnemy(enemy,0,false,{style:'slam',progress:.5,impactProgress:.5});assert.deepEqual(pose(enemy),contact,`${kind} switching away from charge clears its pose`);
   }
  }
  if(worldBosses.includes(kind)){
   const contacts=[contact];
   for(const style of ['swipe','pulse']){
    const clip=asset.animations.find(clip=>clip.name===`${kind}-${style==='pulse'?'cast':style}`);
    assert(Math.abs(clip.duration-1)<.001,`${kind} ${style} is a one-second clip`);
    assert(clip.tracks.some(track=>[...track.times].some(time=>Math.abs(time-.5)<1e-6)),`${kind} ${style} retains its exact contact frame`);
    for(const impact of [.2,.5,.8]){
     animateEnemy(enemy,0,false,{style,progress:0,impactProgress:impact});const abilityRest=pose(enemy);
     for(let step=0;step<=40;step++){
      animateEnemy(enemy,0,false,{style,progress:step/40,impactProgress:impact});finite(enemy);
      assert(new THREE.Box3().setFromObject(enemy).min.y>=-.05,`${kind} ${style} stays above the floor across its timeline`);
     }
     assert(pose(enemy).every((part,i)=>part.every((value,j)=>typeof value==='string'?value===abilityRest[i][j]:Math.abs(value-abilityRest[i][j])<1e-6)),`${kind} ${style} recovers completely`);
     animateEnemy(enemy,0,false,{style,progress:impact,impactProgress:impact});const hit=pose(enemy);
     for(const other of contacts)assert.notDeepEqual(hit,other,`${kind} ${style} has a distinct contact silhouette`);
     if(impact===.8)contacts.push(hit);
    }
   }
   animateEnemy(enemy,0,false,{style:'slam',progress:.5,impactProgress:.5});assert.deepEqual(pose(enemy),contact,'switching authored actions clears the previous pose');
  }
  const extra = kind==='void-stalker' ? 'leap' : kind==='frost-yeti' ? 'cast' : null;
  if(extra){
   assert(asset.animations.some(clip=>clip.name===`${kind}-${extra}`),`${kind} includes its new authored ability clip`);
   const style=extra==='cast'?'pulse':'leap';
   for(const impact of [.3,.7]){
    animateEnemy(enemy,0,false,{style,progress:0,impactProgress:impact});const restAbility=pose(enemy);
    animateEnemy(enemy,0,false,{style,progress:impact*.7,impactProgress:impact});const anticipation=pose(enemy);
    animateEnemy(enemy,0,false,{style,progress:impact,impactProgress:impact});const contactAbility=pose(enemy);finite(enemy);
    assert.notDeepEqual(anticipation,restAbility);assert.notDeepEqual(contactAbility,anticipation);assert.notDeepEqual(contactAbility,contact,`${kind} ability differs from regular strike`);
    assert(new THREE.Box3().setFromObject(enemy).min.y>=-.05,`${kind} ability contact stays on the floor`);
    animateEnemy(enemy,0,false,{style,progress:1,impactProgress:impact});const recovered=pose(enemy);
    assert(recovered.every((part,i)=>part.every((value,j)=>typeof value==='string'?value===restAbility[i][j]:Math.abs(value-restAbility[i][j])<1e-6)),'new ability recovers to its own rest pose');
   }
   animateEnemy(enemy,.2,true);finite(enemy);
  }
  console.log(`ASSET ${kind}: ${meshes} meshes; bounds ${bounds.getSize(new THREE.Vector3()).toArray().map(value=>value.toFixed(2)).join(' × ')}`);
 }
 console.log('PASS: actual Blender monster roots, attack tracks, bounds, shared resources and draw budgets.');
}
