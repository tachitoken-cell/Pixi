import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const profiles=JSON.parse(readFileSync(new URL('../assets/source/race-fit.json',import.meta.url),'utf8'));
const bytes=readFileSync(new URL('../public/models/race-kit.glb',import.meta.url));
const asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
assert.deepEqual(asset.scene.children.map(root=>root.name).sort(),Object.values(profiles).map(p=>p.root).sort());
assert(bytes.length<700_000);assert.equal(asset.animations.length,0);assert.equal(asset.parser.json.images?.length??0,0);
const materials=new Set(),signatures=new Set(),counts=[];let triangles=0;
const eyes=[-1,1].map(side=>new THREE.Box3(new THREE.Vector3(side*.155-.0525,-.115,.314),new THREE.Vector3(side*.155+.0525,.025,1.2)));
const triangle=new THREE.Triangle();
function eachTriangle(mesh,fn){
 const geometry=mesh.geometry,p=geometry.attributes.position,index=geometry.index,count=index?.count??p.count;
 for(let i=0;i<count;i+=3){triangle.a.fromBufferAttribute(p,index?index.getX(i):i);triangle.b.fromBufferAttribute(p,index?index.getX(i+1):i+1);triangle.c.fromBufferAttribute(p,index?index.getX(i+2):i+2);fn(triangle);}
}
const area=poly=>Math.abs(poly.reduce((sum,p,i)=>{const next=poly[(i+1)%poly.length];return sum+p[0]*next[1]-next[0]*p[1];},0))/2;
function intersectionArea(subject,clip){
 let result=subject;
 for(let i=0;i<clip.length;i++){
  const a=clip[i],b=clip[(i+1)%clip.length],cross=p=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
  const input=result;result=[];if(!input.length)break;
  for(let j=0;j<input.length;j++){
   const p=input[j],q=input[(j+1)%input.length],cp=cross(p),cq=cross(q),insideP=cp>=-1e-8,insideQ=cq>=-1e-8;
   if(insideP)result.push(p);
   if(insideP!==insideQ){const t=cp/(cp-cq);result.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}
  }
 }
 return result.length<3?0:area(result);
}
for(const profile of Object.values(profiles)){
 const root=asset.scene.getObjectByName(profile.root),hash=createHash('sha256');let meshes=0;
 assert.deepEqual(root.userData.fit,profile);assert(root.userData.authoredAnatomy);
 assert(root.position.length()<1e-7);
 const expected={torso:{x:0,y:0,z:0},head:profile.head,'left-arm':profile.shoulder,'right-arm':{...profile.shoulder,x:-profile.shoulder.x},'left-leg':profile.hip,'right-leg':{...profile.hip,x:-profile.hip.x}};
 for(const [part,position] of Object.entries(expected)){
  const node=root.getObjectByName(`${root.name}-${part}`);assert(node&&node.parent===root);
  assert(node.position.distanceTo(new THREE.Vector3(position.x,position.y,position.z))<1e-6);assert.equal(node.userData.part,part);
 }
 const bounds=new THREE.Box3().setFromObject(root);assert(Math.abs(bounds.min.y)<1e-6,`${root.name} has authored feet exactly on the floor`);assert(bounds.max.y<3.2&&bounds.max.y>1.8);
 const leftFoot=new THREE.Box3().setFromObject(root.getObjectByName(`${root.name}-left-leg`)),rightFoot=new THREE.Box3().setFromObject(root.getObjectByName(`${root.name}-right-leg`));
 assert(leftFoot.min.x-rightFoot.max.x>.025,`${root.name} has separate left and right foot silhouettes`);
 const cranium=root.getObjectByName(`${root.name}-head-cranium`);assert(cranium?.isMesh&&cranium.userData.anatomy==='cranium'&&cranium.userData.tint==='skin');
 const chest=root.getObjectByName(`${root.name}-torso-chest`);assert.equal(chest.userData.tint,'outfit');assert.equal(chest.userData.slot,'armor');
 assert.equal(chest.userData.anatomy,profile.gender==='female'?'clothed-chest':'chest');
 chest.geometry.computeBoundingBox();assert(Math.abs(chest.geometry.boundingBox.max.z-profile.torso.chestFront)<1e-6,'chest geometry matches the fitted clothing envelope');
 const front=[];
 root.traverse(node=>{
  assert(node.scale.distanceTo(new THREE.Vector3(1,1,1))<1e-7,'every anatomy joint and mesh has unit scale');
  assert(node.quaternion.angleTo(new THREE.Quaternion())<1e-7,'rest rotations are baked');
  if(!node.isMesh)return;
  meshes++;materials.add(node.material);assert(['skin','hair','outfit','accent','leather','fixed'].includes(node.userData.tint));
  assert(!node.userData.slot||['armor','legs','shoes'].includes(node.userData.slot));
  if(node.userData.tint==='skin')assert(!node.userData.slot,'anatomy stays when clothing changes');
  assert(!/eye|hand-palm/.test(node.name),'runtime owns the blinking eyes and common palm cubes');
  const p=node.geometry.attributes.position,c=node.geometry.attributes.color;assert(p&&c&&p.count===c.count);
  assert([...p.array,...c.array].every(Number.isFinite));
  if(node.userData.tint!=='fixed')for(let i=0;i<c.count;i++)assert(c.getX(i)>.9999&&c.getY(i)>.9999&&c.getZ(i)>.9999,'dynamic tint is neutral white');
  hash.update(node.name.replace(root.name,''));hash.update(Buffer.from(p.array.buffer,p.array.byteOffset,p.array.byteLength));
  eachTriangle(node,t=>{
   triangles++;
   if(node.parent.userData.part==='head')for(const eye of eyes)assert(!eye.intersectsTriangle(t),`${node.name} keeps the eye area clear`);
   if(node.parent.userData.part==='torso'&&Math.abs(t.a.z-t.b.z)<1e-7&&Math.abs(t.a.z-t.c.z)<1e-7&&t.getNormal(new THREE.Vector3()).z>.99)front.push({z:t.a.z,points:[t.a,t.b,t.c].map(p=>[p.x,p.y]),name:node.name});
  });
 });
 // Overlapping front faces caused visible diagonal chest/hem striping in the browser.
 for(let i=0;i<front.length;i++)for(let j=i+1;j<front.length;j++)if(Math.abs(front[i].z-front[j].z)<1e-6)assert(intersectionArea(front[i].points,front[j].points)<1e-6,`${root.name} has coplanar overlapping torso fronts: ${front[i].name} / ${front[j].name}`);
 assert(meshes<=32,'an authored body has bounded material groups');counts.push(meshes);signatures.add(hash.digest('hex'));
 if(profile.race==='foxfolk')assert(root.getObjectByName(`${root.name}-tail`));
}
assert.equal(signatures.size,Object.keys(profiles).length,'all eighteen complete bodies have distinct authored geometry');assert.equal(materials.size,1);assert(triangles<22000);
assert(statSync(new URL('../assets/source/race-kit.blend',import.meta.url)).size>100_000);
const png=readFileSync(new URL('../assets/source/race-kit-preview.png',import.meta.url));assert.equal(png.subarray(1,4).toString(),'PNG');
console.log(`PASS: 18 authored race/gender anatomies; ${bytes.length} bytes, ${triangles} triangles, ${Math.min(...counts)}–${Math.max(...counts)} tint meshes/body; unit scales, exact pivots/floors, clothed chest envelopes, clear eyes, no coplanar torso fronts, shared material and retained Blender source/gallery.`);
