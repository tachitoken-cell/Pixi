import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const sourceRoot = new URL('../assets/source/horned-apostle/benji-2026-09-28/', import.meta.url);
const source = name => JSON.parse(gunzipSync(fs.readFileSync(new URL(`${name}.json.gz`, sourceRoot))));
const load = async name => { const bytes = fs.readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url)); return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ''); };
const actor = await load('horned-apostle'), fx = await load('apostle-spells');
let samples=0,maximumError=0;
for(const [name,pack,runtimeName] of [
 ...['horned-apostle','apostle-clone','apostle-incarnate'].map(name=>[name,actor,name]),
 ...['claws','star','palm','chain','feather','eclipse','soul','vortex','black-hole','rune-ring','rift','portal-crown'].map(name=>[`spell-${name}`,fx,`apostle-spell-${name}`]),
]){
 const data=source(name),model=pack.scene.getObjectByName(runtimeName);assert(model,`Missing supplied model ${name}`);
 const rest=[];model.traverse(node=>rest.push([node,node.position.clone(),node.quaternion.clone(),node.scale.clone()]));
 for(const [suffix,animation] of Object.entries(data.animations)){
  const clip=pack.animations.find(clip=>clip.name===`${runtimeName}-${suffix}`);assert(clip,`Missing clip ${name}/${suffix}`);
  assert(Math.abs(clip.duration-animation.duration)<.00001,`${name}/${suffix} retains duration`);
  assert.deepEqual(model.userData.authoredAnimations[suffix].events,animation.events,`${name}/${suffix} preserves authored event metadata`);
  const mixer=new THREE.AnimationMixer(model),action=mixer.clipAction(clip).setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
  for(const sample of [0,.25,.5,.75,1]){
   const fraction=Math.round(sample*(animation.frames-1))/(animation.frames-1);
   const time=animation.duration*fraction,world=[];
   for(const [index,bone] of data.skeleton.entries()){
    const track=animation.tracks.find(track=>track.bone===index),values={};
    for(const key of ['t','r','s']){
     const frames=track?.[key]||[bone.rest[key]],position=Math.round(fraction*(frames.length-1)),a=Math.floor(position),b=Math.min(frames.length-1,a+1),weight=position-a;
     values[key]=key==='r'?new THREE.Quaternion().fromArray(frames[a]).slerp(new THREE.Quaternion().fromArray(frames[b]),weight):new THREE.Vector3().fromArray(frames[a]).lerp(new THREE.Vector3().fromArray(frames[b]),weight);
    }
    const matrix=new THREE.Matrix4().compose(values.t,values.r,values.s);if(bone.parent>=0)matrix.premultiply(world[bone.parent]);world.push(matrix);
   }
   const skin=world.map((matrix,index)=>matrix.clone().multiply(new THREE.Matrix4().fromArray(data.skeleton[index].inverse_bind))),expected=new THREE.Box3(),point=new THREE.Vector3();
   for(const mesh of data.meshes)for(let i=0;i<mesh.vertex_count;i++)expected.expandByPoint(point.fromArray(mesh.positions,i*3).applyMatrix4(skin[mesh.bone[i]]));
   mixer.setTime(time);model.updateMatrixWorld(true);const actual=new THREE.Box3().setFromObject(model,true),error=Math.max(actual.min.distanceTo(expected.min),actual.max.distanceTo(expected.max));
   maximumError=Math.max(maximumError,error);samples++;assert(error<.001,`${name}/${suffix}@${fraction}: source pose changed by ${error}m`);
  }
  mixer.stopAllAction();for(const[node,p,q,s]of rest){node.position.copy(p);node.quaternion.copy(q);node.scale.copy(s);}
 }
}
console.log(`PASS supplied skinning/GLB fidelity: 15 models, 114 clips, ${samples} authored key poses, maximum bound error ${maximumError.toExponential(3)}m; event metadata preserved.`);
