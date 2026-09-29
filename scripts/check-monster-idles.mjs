import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeEnemy, animateEnemy, setMonsterAssets, setDeathAnimations } from '../src/characters.ts';
import { setIdleAnimations } from '../src/idle-animation.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { makeLootRemains } from '../src/loot.ts';

const readAsset=async name=>{
 const bytes=readFileSync(new URL(`../public/models/${name}.glb`,import.meta.url));
 return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
};
const monsterAsset=await readAsset('monster-kit'),deathAsset=await readAsset('death-animations');
setMonsterAssets(monsterAsset.scene,monsterAsset.animations);setDeathAnimations(deathAsset.scene,deathAsset.animations);
const pose=root=>{const values=[];root.traverse(node=>values.push([node.name,...node.position.toArray(),...node.quaternion.toArray(),...node.scale.toArray()]));return values;};
const samePose=(a,b,label)=>assert(a.length===b.length&&a.every((row,i)=>row.every((value,j)=>typeof value==='number'?Math.abs(value-b[i][j])<1e-5:value===b[i][j])),label);
const renderedPose=root=>{root.updateMatrixWorld(true);const values=[];root.traverseVisible(node=>{if(node.isMesh)values.push(...node.matrixWorld.elements);});return values;};
const cases=[
 {name:'walk',moving:true},
 {name:'basic windup',attack:{style:'slam',basic:true,progress:.15,impactProgress:.375}},
 {name:'basic contact',attack:{style:'slam',basic:true,progress:.375,impactProgress:.375}},
 {name:'special contact',attack:{style:'slam',progress:.7,impactProgress:.7}},
 {name:'collapse',death:.5},
 {name:'settled death',death:1},
];
// Capture the existing active-animation result before loading idles. The new library must not alter these poses.
const baselines=new Map();
for(const kind of Object.keys(MONSTERS).filter(kind=>kind!=='training-dummy'))for(const state of cases){
 const root=makeEnemy(kind);animateEnemy(root,2.1,!!state.moving,state.attack,state.death);baselines.set(`${kind}/${state.name}`,pose(root));
}
const idleAsset=await readAsset('idle-animations');setIdleAnimations(idleAsset.scene,idleAsset.animations);
const sourcePose=pose(monsterAsset.scene),sourceKeys=idleAsset.animations.map(clip=>clip.tracks.map(track=>Array.from(track.values)));
for(const kind of Object.keys(MONSTERS).filter(kind=>kind!=='training-dummy')){
 const clip=idleAsset.animations.find(clip=>clip.name===`${kind}-idle`);assert(clip,`${kind} has an authored idle loop`);
 const root=makeEnemy(kind),twin=makeEnemy(kind),untouched=pose(twin),objects=[],resources=[];
 root.traverse(node=>{objects.push(node);if(node.isMesh)resources.push([node,node.geometry,node.material]);});
 for(const track of clip.tracks){
  const name=track.name.split('.')[0],part=name.slice(kind.length+1);
  assert(root.getObjectByName(name)||root.userData.enemyRig.parts?.[part],`${kind} binds authored part ${part}`);
 }
 root.position.set(17,4,-9);root.rotation.y=1.4;root.scale.setScalar(1.2);const transform=[...root.position,...root.quaternion,...root.scale];
 animateEnemy(root,0,false);let first,visibleMotion=false;
 for(let frame=1;frame<=32;frame++){
  animateEnemy(root,frame*clip.duration/16,false);const rendered=renderedPose(root);
  assert(rendered.every(Number.isFinite),`${kind} idle transforms remain finite`);
  if(!first)first=rendered;else if(rendered.some((value,index)=>Math.abs(value-first[index])>1e-4))visibleMotion=true;
  assert.deepEqual([...root.position,...root.quaternion,...root.scale],transform,`${kind} idle never moves its gameplay root`);
 }
 assert(visibleMotion,`${kind} visibly moves rendered geometry while stationary`);
 assert.deepEqual(pose(twin),untouched,`${kind} cannot animate another instance`);
 animateEnemy(root,clip.duration*2+.37,false);const repeated=pose(root);
 for(let repeat=0;repeat<20;repeat++)animateEnemy(root,clip.duration*2+.37,false);
 samePose(pose(root),repeated,`${kind} additive idle does not accumulate on repeated frames`);
 animateEnemy(root,clip.duration*3+.37,false);samePose(pose(root),repeated,`${kind} loops continuously without drifting`);
 // Compare matching local poses; only the root's deliberate placement differs.
 animateEnemy(twin,0,false);animateEnemy(twin,clip.duration*3+.37,false);
 assert.notDeepEqual(pose(twin).slice(1),pose(root).slice(1),`${kind} instances are not synchronized`);
 const after=[];root.traverse(node=>after.push(node));assert.deepEqual(after,objects,`${kind} idle never allocates scene nodes`);
 for(const [node,geometry,material] of resources){assert.equal(node.geometry,geometry);assert.equal(node.material,material);}
 for(const state of cases){
  const actor=makeEnemy(kind);animateEnemy(actor,0,false);animateEnemy(actor,1,false);
  animateEnemy(actor,2.1,!!state.moving,state.attack,state.death);
  samePose(pose(actor),baselines.get(`${kind}/${state.name}`),`${kind} ${state.name} fully overrides idle, preserving authored contact`);
 }
 const corpse=makeLootRemains(kind),fallen=corpse.getObjectByName(`fallen-${kind}`),held=pose(corpse);
 for(const time of [0,2,12,100])animateEnemy(fallen,time,false);
 samePose(pose(corpse),held,`${kind} loot corpse stays frozen`);
}
samePose(pose(monsterAsset.scene),sourcePose,'idles do not modify the shared model library');
assert.deepEqual(idleAsset.animations.map(clip=>clip.tracks.map(track=>Array.from(track.values))),sourceKeys,'sampling never changes authored clip data');
console.log('PASS: all 18 authored monster idles animate visible geometry, bind every part, loop/dephase without accumulation or root movement, preserve shared assets and exact walk/attack/death priorities, and leave loot corpses frozen.');
