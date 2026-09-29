import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Box3, Raycaster, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const bytes = await readFile(new URL('../public/models/poll-booth.glb', import.meta.url));
assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
assert.equal(bytes.readUInt32LE(8), bytes.length);
assert(bytes.length < 300_000, 'the static kiosk must stay below 300 KB');
const document = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
assert.deepEqual(document.nodes.map(node => node.name).sort(), ['poll-booth', 'poll-booth-body', 'poll-booth-lantern-glow']);
assert.equal(document.meshes.length, 2);
assert.equal(document.materials.length, 2);
for (const key of ['animations', 'images', 'textures', 'cameras']) assert(!document[key]?.length, key);
assert(!(document.extensionsRequired || []).some(extension => /draco|meshopt/.test(extension)), 'no extra decoder');

// Exercise the actual game loader, exported transforms, vertex palettes and clickable geometry.
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const bounds = new Box3().setFromObject(gltf.scene);
assert(bounds.min.distanceTo(new Vector3(-1.1, 0, -.918)) < .0001, 'ground-centred, +Z-front origin');
assert(bounds.max.distanceTo(new Vector3(1.1, 3.1, .9706)) < .0001, 'authored metre-scale bounds');
let triangles = 0, draws = 0;
gltf.scene.traverse(mesh => {
  if (!mesh.isMesh) return;
  draws++; triangles += mesh.geometry.index.count / 3;
  assert(mesh.material.isMeshStandardMaterial && mesh.material.vertexColors && mesh.geometry.getAttribute('color'));
  assert(mesh.frustumCulled, 'distant booth meshes retain native frustum culling');
});
assert.equal(draws, 2);
assert(triangles < 6000);
const glow = gltf.scene.getObjectByName('poll-booth-lantern-glow').material;
assert(glow.emissive.r > glow.emissive.b && glow.emissiveIntensity >= 1, 'warm light survives GLB export');
assert(new Raycaster(new Vector3(0, 1.8, 3), new Vector3(0, 0, -1)).intersectObject(gltf.scene, true).length, 'front interaction ray hits real booth geometry');

const preview = await readFile(new URL('../assets/source/poll-booth-preview.png', import.meta.url));
assert.equal(preview.readUInt32BE(16), 1200);
assert.equal(preview.readUInt32BE(20), 1200);
assert((await readFile(new URL('../assets/source/poll-booth.blend', import.meta.url))).length > 100_000, 'editable Blender source retained');
console.log(`PASS polling booth asset: ${triangles} triangles, ${draws} draws, ${bytes.length} bytes, source/preview, bounds, warm palette and Three.js ray targeting.`);
