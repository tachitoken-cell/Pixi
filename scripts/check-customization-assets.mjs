import { HAIRSTYLES, RACES } from '../src/appearance.ts';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const hairs = HAIRSTYLES.filter(h=>h.id!=='none').map(h=>h.id);
const races = RACES.filter(r=>r.id!=='human').map(r=>r.id);
const faces = ['bright','calm','stern','smile','freckles','scarred','painted','weathered'];
const names = [...hairs.map(id=>`hair-${id}`),...races.map(id=>`race-${id}`),...faces.map(id=>`face-${id}`),'race-foxfolk-tail','tool-fishing-rod'];
const url = new URL('../public/models/customization-kit.glb',import.meta.url);
const bytes = readFileSync(url);
const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
assert(bytes.length<500_000,'the complete customization library stays under 500 KB');
assert.deepEqual(asset.scene.children.map(node=>node.name).sort(),names.toSorted());
assert.equal(asset.animations.length,0,'blinking is driven by the live procedural eyes');
const json = asset.parser.json;
assert.equal(json.images?.length??0,0);assert.equal(json.cameras?.length??0,0);
assert(!(json.extensionsRequired??[]).some(name=>/draco|meshopt/i.test(name)),'no geometry decoder is needed');
const materials = new Set(),signatures = new Map();let triangles=0,meshes=0;
const eyes = [-1,1].map(side=>new THREE.Box3(new THREE.Vector3(side*.155-.0525,-.115,.31),new THREE.Vector3(side*.155+.0525,.025,1.2)));
const triangle = new THREE.Triangle();
for(const name of names){
 const root = asset.scene.getObjectByName(name),bounds = new THREE.Box3().setFromObject(root),hash=createHash('sha256');let rootMeshes=0;
 assert.equal(root.userData.anchor,name.startsWith('tool-')?'hand':name.endsWith('-tail')?'body':'head');
 assert(bounds.min.toArray().concat(bounds.max.toArray()).every(Number.isFinite));
 assert(!bounds.isEmpty());
 assert(bounds.min.x>=-.9&&bounds.max.x<=.9,'head add-ons fit the voxel character scale');
 if(name.startsWith('tool-')){assert(bounds.min.y>-.6&&bounds.max.y<1);assert(bounds.min.z>-.1&&bounds.max.z<1.2);}
 else if(name.endsWith('-tail')){
  assert(bounds.min.y>.75&&bounds.max.y<1.4);assert(bounds.min.z>=-1.05&&bounds.max.z<-.2,'the tail anchors behind the lower body');
 }else{
  assert(bounds.min.y>-.9&&bounds.max.y<1);assert(bounds.min.z>-.9&&bounds.max.z<.7);
 }
 root.traverse(node=>{
  assert(node.position.length()<1e-7&&node.quaternion.angleTo(new THREE.Quaternion())<1e-7&&node.scale.distanceTo(new THREE.Vector3(1,1,1))<1e-7,'all exported transforms are applied');
  assert(!node.isLight&&!node.isCamera);assert(!/eyeball|eyelid|eye-glint/.test(node.name));
  if(!node.isMesh)return;
  meshes++;rootMeshes++;materials.add(node.material);
  assert(['skin','hair','hairHighlight','accent','fixed'].includes(node.userData.tint));
  const geometry=node.geometry,position=geometry.getAttribute('position'),color=geometry.getAttribute('color');
  assert(position&&color&&position.count===color.count);assert([...position.array,...color.array].every(Number.isFinite));
  if(node.userData.tint!=='fixed')for(let i=0;i<color.count;i++)assert(Math.abs(color.getX(i)-1)<1e-6&&Math.abs(color.getY(i)-1)<1e-6&&Math.abs(color.getZ(i)-1)<1e-6,'dynamic tint starts from neutral white');
  hash.update(node.userData.tint);hash.update(Buffer.from(position.array.buffer,position.array.byteOffset,position.array.byteLength));hash.update(Buffer.from(color.array.buffer,color.array.byteOffset,color.array.byteLength));
  const index=geometry.index,count=index?.count??position.count;triangles+=count/3;
  if(name.endsWith('-tail')||name.startsWith('tool-'))return;
  for(let i=0;i<count;i+=3){
   triangle.a.fromBufferAttribute(position,index?index.getX(i):i);triangle.b.fromBufferAttribute(position,index?index.getX(i+1):i+1);triangle.c.fromBufferAttribute(position,index?index.getX(i+2):i+2);
   for(const eye of eyes)assert(!eye.intersectsTriangle(triangle),`${name} leaves the full blinking eye area unobscured`);
  }
 });
 assert(rootMeshes>=1&&rootMeshes<=3,'each modular piece needs at most three tint draws');
 signatures.set(name,hash.digest('hex'));
}
for(const group of [hairs.map(id=>`hair-${id}`),races.map(id=>`race-${id}`),faces.map(id=>`face-${id}`)])assert.equal(new Set(group.map(name=>signatures.get(name))).size,group.length,'each choice has original distinct geometry or face details');
assert.equal(materials.size,1,'every source mesh shares one neutral material');assert(triangles<6500);assert(meshes<=80);
const png=readFileSync(new URL('../assets/source/customization-kit-preview.png',import.meta.url));
assert.equal(png.subarray(1,4).toString(),'PNG');assert(png.readUInt32BE(16)>=1800&&png.readUInt32BE(20)>=1400);
assert(statSync(new URL('../assets/source/customization-kit.blend',import.meta.url)).size>100_000,'editable Blender source is retained');
console.log(`PASS: ${names.length} Blender roots, ${meshes} tint meshes, ${triangles} triangles, ${bytes.length} bytes; shared material, identity transforms, clear eyes, distinct choices, body-local tail and retained gallery/source.`);
