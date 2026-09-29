import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createMonsterModel, animateMonsterModel, setMonsterAssets, setTreasureAssets } from '../src/monster-models.ts';

const bytes = readFileSync(new URL('../public/models/treasure-goblin.glb', import.meta.url));
const doc = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
assert(bytes.length < 500_000, 'the entire treasure kit stays under 500 kB');
assert(!doc.images?.length, 'authored geometry needs no texture downloads');
assert.equal(doc.materials.length, 3);
const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const names = ['lootGoblin', 'shadyMerchant', 'goblinPortal', 'mossVoucher'];
assert.deepEqual(asset.scene.children.map(node => node.name).sort(), names.toSorted());
for (const name of names) {
  const root = asset.scene.getObjectByName(name), bounds = new THREE.Box3().setFromObject(root);
  assert(bounds.min.y >= -.02 && bounds.max.y <= 2.6, `${name} is grounded and correctly scaled`);
  assert(bounds.getSize(new THREE.Vector3()).x > .5, `${name} has visible geometry`);
  let triangles = 0, draws = 0;
  root.traverse(node => { if (node.isMesh) { draws++; triangles += node.geometry.index.count / 3; } });
  assert(draws <= 14 && triangles < 4_000, `${name} fits the existing mobile draw budget`);
  console.log(`${name}: ${triangles} triangles, ${draws} draws, ${bounds.max.y.toFixed(2)}m high`);
}
const glow = doc.materials.find(mat => mat.name === 'Portal light');
assert(glow.emissiveFactor[1] > glow.emissiveFactor[0] * 3, 'export retains jade emission');
assert(asset.animations.some(clip => clip.name === 'treasure-goblin-death' && Math.abs(clip.duration - 1.4) < .001));

const pose = group => { const values = []; group.traverse(node => values.push([node.name, ...node.position, ...node.quaternion, ...node.scale])); return values; };
assert.throws(() => setTreasureAssets(new THREE.Group()), /Missing treasure goblin/);
setTreasureAssets(asset.scene, asset.animations);
// Main and treasure asset fetches resolve in either order.
const baseBytes = readFileSync(new URL('../public/models/monster-kit.glb', import.meta.url));
const base = await new GLTFLoader().parseAsync(baseBytes.buffer.slice(baseBytes.byteOffset, baseBytes.byteOffset + baseBytes.byteLength), '');
setMonsterAssets(base.scene, base.animations);
const goblin = createMonsterModel('treasure-goblin'), twin = createMonsterModel('treasure-goblin');
const sourcePose = pose(asset.scene), twinPose = pose(twin), first = pose(goblin);
const shared = new Set(); asset.scene.traverse(node => { if (node.isMesh) shared.add(node.geometry); });
goblin.traverse(node => { if (node.isMesh) assert(shared.has(node.geometry)); });
for (const time of [0, .1, .4, 1, 6, 20]) {
  assert(animateMonsterModel(goblin, time, true));
  goblin.updateMatrixWorld(true); goblin.traverse(node => assert(node.matrixWorld.elements.every(Number.isFinite)));
}
assert.notDeepEqual(pose(goblin), first, 'quick feet, sack and head animate');
assert.deepEqual(pose(twin), twinPose, 'a second goblin retains its own pose');
assert.deepEqual(pose(asset.scene), sourcePose, 'the shared authored model is never animated');
for (let step = 0; step <= 60; step++) {
  animateMonsterModel(goblin, 0, false, undefined, step / 60);
  assert(new THREE.Box3().setFromObject(goblin, true).min.y >= -.02, 'the death collapse stays on the floor');
}
assert(new THREE.Box3().setFromObject(goblin, true).max.y < 1.6, 'death ends in a fallen pose');
delete goblin.userData.enemyRig;
const fallen = pose(goblin); animateMonsterModel(goblin, 20, true);
assert.deepEqual(pose(goblin), fallen, 'loot retains the final dead pose');
assert(statSync(new URL('../assets/source/treasure-goblin.blend', import.meta.url)).size > 100_000);
const preview = readFileSync(new URL('../assets/source/treasure-goblin-preview.png', import.meta.url));
assert.equal(preview.readUInt32BE(16), 1800); assert.equal(preview.readUInt32BE(20), 1000);

// Decode PNG filtering with Node's zlib to catch blank or cropped inventory art.
const png = readFileSync(new URL('../public/ui/loot/moss-voucher.png', import.meta.url)), chunks = [];
assert.equal(png.readUInt32BE(16), 256); assert.equal(png.readUInt32BE(20), 256); assert.equal(png[25], 6);
for (let offset = 8; offset < png.length;) {
  const size = png.readUInt32BE(offset);
  if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + size));
  offset += size + 12;
}
const data = inflateSync(Buffer.concat(chunks)), stride = 1024, occupied = [];
let previous = Buffer.alloc(stride);
for (let y = 0; y < 256; y++) {
  const filter = data[y * (stride + 1)], row = Buffer.from(data.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
  for (let i = 0; i < stride; i++) {
    const left = i >= 4 ? row[i - 4] : 0, up = previous[i], corner = i >= 4 ? previous[i - 4] : 0;
    const p = left + up - corner, a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - corner);
    const prediction = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : a <= b && a <= c ? left : b <= c ? up : corner;
    row[i] = (row[i] + prediction) & 255;
    if (i % 4 === 3 && row[i] > 16) occupied.push([(i - 3) / 4, y]);
  }
  previous = row;
}
assert(occupied.length > 10_000 && occupied.length < 50_000, 'icon has both content and transparent background');
assert(occupied.every(([x, y]) => x > 6 && y > 6 && x < 249 && y < 249), 'icon has uncropped transparent margins');
console.log(`PASS: Blender sources, ${bytes.length}B GLB, isolated run/death rigs, jade portal and transparent 256px voucher.`);
