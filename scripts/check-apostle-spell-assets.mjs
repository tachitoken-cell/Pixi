import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const names=['palm','star','claws','feather','eclipse','vortex','soul','rift','chain','rune-ring','portal-crown','black-hole'];
const bytes=readFileSync(new URL('../public/models/apostle-spells.glb',import.meta.url));
assert(bytes.length<2_000_000,'the 12-model animated void kit stays under two megabytes');
const asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
assert.deepEqual(asset.scene.children.map(node=>node.name).sort(),names.map(name=>'apostle-spell-'+name).sort(),'stable spell roots contain no cameras, lamps or inspection labels');
assert.equal(asset.animations.length,36,'every supplied motif carries spawn, loop and vanish');
const materials=new Set(),geometries=new Set();let totalTriangles=0;
// Native rig dimensions, measured in metres. The world applies its attachment
// scale/orientation outside this rig; exact key-pose fidelity is checked separately.
const dimensions={palm:[1.99703,3.32838,.46395],star:[2.36,2.36,.59698],claws:[2.75,4.47,.37510],
 feather:[2.01465,5.445,.59322],eclipse:[3.30656,3.30656,2],vortex:[3.37084,3.32402,3.23338],
 soul:[4.70699,7.58638,3.59749],rift:[2.63928,4.01996,.31290],chain:[5.13886,7.51410,1.91664],
 'rune-ring':[2.006,2.006,.08878],'portal-crown':[2.97866,2.97866,.19],'black-hole':[7.93132,1.21,7.93132]};
const pose=root=>{const result=[];root.traverse(node=>result.push([node.name,...node.position,...node.quaternion,...node.scale]));return result;};
for(const name of names){
 const root=asset.scene.getObjectByName('apostle-spell-'+name),box=new THREE.Box3().setFromObject(root,true),size=box.getSize(new THREE.Vector3());
 assert.deepEqual(root.position.toArray(),[0,0,0],`${name} has an attachment origin at zero`);assert.deepEqual(root.scale.toArray(),[1,1,1]);assert.deepEqual(root.quaternion.toArray(),[0,0,0,1]);
 let triangles=0,draws=0,rigNodes=0;
 root.traverse(node=>{
  assert(node.type==='Object3D'||node.isGroup||node.isMesh,'the reusable rig contains only transforms and meshes');
  if(node.userData.sourceName)rigNodes++;
  if(!node.isMesh)return;draws++;materials.add(node.material);geometries.add(node.geometry);
  assert(!node.material.map&&!node.material.emissiveMap,'spell detail does not require textures');assert(!node.isSkinnedMesh,'rigid parts clone without a skinning skeleton');
  const positions=node.geometry.attributes.position,colors=node.geometry.attributes.color,normals=node.geometry.attributes.normal;
  assert(colors&&normals,'authored palette and normals are present');assert.equal(colors.count,positions.count);assert.equal(normals.count,positions.count);
  for(const attribute of [positions,colors,normals])assert(attribute.array.every(Number.isFinite),'geometry attributes are finite');
  for(let i=0;i<colors.count;i++)assert(colors.getZ(i)>=colors.getX(i)&&colors.getZ(i)>=colors.getY(i),'void palette contains no warm gold or green surfaces');
  if(node.geometry.index)assert(node.geometry.index.array.every(index=>Number.isInteger(index)&&index>=0&&index<positions.count),'indices address valid vertices');
  triangles+=(node.geometry.index?.count??positions.count)/3;
 });
 assert.equal(draws,name==='black-hole'?5:name==='star'?3:2,'the native rigid batches remain bounded');assert.equal(rigNodes,name==='black-hole'?5:name==='star'?4:3,'all independently animated source parts are addressable');
 assert(triangles>150&&triangles<7500,'each silhouette keeps detail within the existing budget');totalTriangles+=triangles;
 for(let axis=0;axis<3;axis++)assert(Math.abs(size.getComponent(axis)-dimensions[name][axis])<.001,`${name} native axis ${axis} preserves its supplied size`);
 const clone=root.clone(true),twin=root.clone(true),sourceRest=pose(root),twinRest=pose(twin),mixer=new THREE.AnimationMixer(clone);
 clone.traverse(node=>{if(node.isMesh)assert(geometries.has(node.geometry)&&materials.has(node.material),'repeat effects share source geometry and palettes');});
 for(const suffix of ['spawn','loop','vanish']){
  const clip=asset.animations.find(clip=>clip.name===`${root.name}-${suffix}`);assert(clip&&clip.tracks.length,'every stage has authored articulated motion');
  assert(Math.abs(clip.duration-({spawn:2/3,loop:2,vanish:.5}[suffix]))<.00001,'native timing is preserved');
  for(const track of clip.tracks){const target=track.name.slice(0,track.name.lastIndexOf('.'));assert(clone.getObjectByName(target),`${clip.name} binds only its own rig`);assert(track.times.every(Number.isFinite)&&track.values.every(Number.isFinite),'animation keys are finite');}
  const action=mixer.clipAction(clip).setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
  mixer.setTime(clip.duration*.2);const early=pose(clone);mixer.setTime(clip.duration*.6);assert.notDeepEqual(pose(clone),early,`${suffix} changes the source rig pose`);
  const atSix=pose(clone);mixer.setTime(clip.duration*.1);mixer.setTime(clip.duration*.6);assert.deepEqual(pose(clone),atSix,'absolute-time rewind cannot accumulate transforms');
  clone.updateMatrixWorld(true);clone.traverse(node=>assert(node.matrixWorld.elements.every(Number.isFinite),'sampled matrices stay finite'));
  assert.deepEqual(pose(root),sourceRest,'animating a clone never mutates source transforms');assert.deepEqual(pose(twin),twinRest,'separate effects animate independently');mixer.stopAllAction();
 }
 console.log(`${name}: ${draws} draws, ${triangles} triangles, ${size.toArray().map(n=>n.toFixed(3)).join(' × ')}m`);
}
const star=asset.scene.getObjectByName('apostle-spell-star');
for(const part of ['core','shards','runes'])assert(star.getObjectByName('apostle-spell-star-'+part),'star core and fragments remain independently addressable');
assert.equal(materials.size,3,'all motifs reuse the carved, luminous and black-hole palette materials');assert(totalTriangles<35000,'the complete animated kit retains the existing 35k triangle budget');
assert(new THREE.Box3().setFromObject(asset.scene.getObjectByName('apostle-spell-feather'),true).min.y>=-.01,'the native upright feather grows from its base pivot');
console.log(`PASS Apostle spell kit: ${bytes.length} bytes, ${totalTriangles} triangles,12 native rigs/36 clips, stable pivots, finite data, shared resources and independent deterministic clones.`);
