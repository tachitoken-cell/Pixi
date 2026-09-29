import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const bytes=readFileSync(new URL('../public/models/raid-props.glb',import.meta.url));
assert(bytes.length<900_000,'four shared prop models stay under 900 KB');
const asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const materials=new Set(),geometries=new Set();
const props=['raid-crystal','raid-shield','raid-column','raid-sun'];
assert.deepEqual(asset.scene.children.map(child=>child.name).sort(),[...props].sort(),'only the four stable gameplay roots are exported');
for(const name of props){
 const root=asset.scene.getObjectByName(name),bounds=new THREE.Box3().setFromObject(root,true),size=bounds.getSize(new THREE.Vector3());
 assert.deepEqual(root.position.toArray(),[0,0,0],'gameplay roots keep their attachment origin');
 let draws=0,triangles=0;
 root.traverse(node=>{if(!node.isMesh)return;draws++;materials.add(node.material);geometries.add(node.geometry);
  triangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3;
  assert(!node.material.map,'details use shared vertex palettes without texture downloads');
  assert(node.geometry.attributes.color,'each part retains its authored color details');
  const color=node.geometry.attributes.color;
  for(let i=0;i<color.count;i++){
   const r=color.getX(i),g=color.getY(i),b=color.getZ(i);
   assert(b>=r&&b>=g,'encounter props use the obsidian/violet/cyan palette without green or warm-metal dominance');
  }
  for(const value of node.geometry.attributes.position.array)assert(Number.isFinite(value));
 });
 assert(draws<=3,'geometry is merged by the three shared palettes');
 assert(triangles>500&&triangles<16000,'each model has authored detail within a modest triangle budget');
 if(name==='raid-sun'){
  assert(Math.max(...bounds.min.toArray().map(Math.abs),...bounds.max.toArray().map(Math.abs))<6,'centered Black Sun fits radius six');
  assert(size.x>10&&size.y>10&&size.z>7,'corona and solid orb retain full depth');
 }else{
  assert(bounds.min.y>=-.01&&bounds.min.y<=.01,'the base rests on the floor');
  assert(size.y>(name==='raid-column'?6.8:3.8)&&size.y<(name==='raid-column'?7.05:4.05),'authored prop height needs no runtime correction');
 }
 const clone=root.clone(true);clone.traverse(node=>{if(node.isMesh)assert(geometries.has(node.geometry)&&materials.has(node.material),'instances reuse buffers and materials');});
 console.log(`${name}: ${draws} draws, ${triangles} triangles, ${size.toArray().map(n=>n.toFixed(2)).join(' × ')}m`);
}
assert.equal(materials.size,3,'all props share three material palettes');
assert.equal(asset.animations.length,0,'static props need no animation payload');
console.log(`PASS raid props: ${(bytes.length/1000).toFixed(0)} KB, stable roots, finite meshes, pivots/bounds, reusable geometry and shared palettes.`);
