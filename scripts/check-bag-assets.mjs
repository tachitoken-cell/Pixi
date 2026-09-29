import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ids = ['linen-pouch','trail-satchel','wayfarer-pack','runewoven-holdall'];
const bytes = await readFile(new URL('../public/models/bag-kit.glb',import.meta.url));
assert(bytes.length < 500_000, 'four detailed bag models stay below 500KB');
const json = JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
assert(!json.images?.length && !json.textures?.length && !json.cameras?.length && !json.animations?.length,
  'the lazy bag library ships only static geometry and a vertex palette');
assert(!json.extensionsRequired?.some(name=>/draco|meshopt/i.test(name)), 'no extra geometry decoder is required');
assert((await stat(new URL('../assets/source/bag-kit.blend',import.meta.url))).size>30_000, 'editable Blender source is retained');
const png = await readFile(new URL('../assets/source/bag-kit-preview.png',import.meta.url));
assert.equal(png.subarray(1,4).toString(),'PNG');
assert.equal(png.readUInt32BE(16),2000);assert.equal(png.readUInt32BE(20),1000);

const kit = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
kit.updateMatrixWorld(true);
assert.deepEqual(kit.children.map(root=>root.name).sort(),ids.map(id=>'bag-'+id).sort());
const materials = new Set(), silhouettes = new Set(), ray = new THREE.Raycaster();
let triangles = 0,draws = 0;
for (const id of ids) {
  const model=kit.getObjectByName('bag-'+id);
  assert.equal(model.userData.itemId,id);
  assert.deepEqual(model.position.toArray(),[0,0,0]);
  assert.deepEqual(model.scale.toArray(),[1,1,1]);
  const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
  assert(Math.abs(bounds.min.y)<1e-6, `${id}: authored bottom meets Y=0`);
  assert(Math.abs(bounds.min.x+bounds.max.x)<1e-6 && Math.abs(bounds.min.z+bounds.max.z)<1e-6,
    `${id}: the turntable origin is centred in X/Z`);
  assert(size.x>.4&&size.x<1.2&&size.y>.65&&size.y<1.3&&size.z>.25&&size.z<.75,
    `${id}: metre-scale authored proportions fit the item camera`);
  silhouettes.add(size.toArray().map(v=>v.toFixed(3)).join(','));
  const meshes=[];
  model.traverse(node=>{
    assert(node.matrixWorld.elements.every(Number.isFinite));
    if(!node.isMesh)return;
    meshes.push(node);draws++;materials.add(node.material);
    assert(node.geometry.attributes.color&&node.material.vertexColors, `${id}: palette renders in Three.js`);
    for(const attribute of Object.values(node.geometry.attributes))assert(attribute.array.every(Number.isFinite));
    const count=(node.geometry.index?.count??node.geometry.attributes.position.count)/3;
    assert(count>400&&count<4000, `${id}: real detail with a bounded mesh budget`);triangles+=count;
    const colours=node.geometry.attributes.color;
    const unique=new Set(Array.from({length:colours.count},(_,i)=>[colours.getX(i),colours.getY(i),colours.getZ(i)].join(',')));
    assert(unique.size>=7, `${id}: cloth, leather and fittings have distinct authored tones`);
  });
  assert.equal(meshes.length,1,`${id}: one draw for the turntable model`);
  const clone=model.clone(true);
  assert.equal(clone.children[0].geometry,meshes[0].geometry,'repeated previews reuse imported buffers');
}
assert.equal(materials.size,1);assert.equal(silhouettes.size,4);
assert.equal(draws,4);assert(triangles<12_000);

// These rays distinguish real hollow/raised geometry from painted features.
ray.set(new THREE.Vector3(0,2,0),new THREE.Vector3(0,-1,0));
const pouchInside=ray.intersectObject(kit.getObjectByName('bag-linen-pouch'),true)[0];
assert(pouchInside&&pouchInside.point.y<.15,'drawstring pouch has a hollow mouth down to its fabric floor');
for(const [id,y] of [['trail-satchel',.80],['runewoven-holdall',.79]]) {
  ray.set(new THREE.Vector3(0,y,2),new THREE.Vector3(0,0,-1));
  assert.equal(ray.intersectObject(kit.getObjectByName('bag-'+id),true).length,0,`${id}: daylight passes through the handle`);
}
ray.set(new THREE.Vector3(.21,.4,-2),new THREE.Vector3(0,0,1));
const backpack=ray.intersectObject(kit.getObjectByName('bag-wayfarer-pack'),true)[0];
assert(backpack&&backpack.point.z<-.25,'backpack straps are raised from the back panel');
console.log(`PASS: four distinct Blender bags, exact preview roots, grounded centred pivots, hollow pouch and handles, raised backpack straps, one palette, ${draws} draws, ${triangles} triangles, ${bytes.length} bytes.`);
