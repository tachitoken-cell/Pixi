import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { Box3, Raycaster, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const bytes = readFileSync('public/models/zeppelin-kit.glb');
assert(bytes.length < 1_500_000, 'shared airship kit stays below 1.5 MB');
assert(existsSync('assets/source/zeppelin-kit.blend'), 'editable Blender source is retained');
const kit = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
kit.updateMatrixWorld(true);
assert.deepEqual(kit.children.map(o => o.name).sort(), ['zeppelin', 'zeppelin-dock']);
const ship = kit.getObjectByName('zeppelin'), dock = kit.getObjectByName('zeppelin-dock');
const bounds = new Box3().setFromObject(ship), size = bounds.getSize(new Vector3());
assert(size.z > 28 && size.z < 34 && size.x > 10 && size.x < 12, 'full passenger aircraft has the agreed world scale');
assert(bounds.min.y > -1.3 && bounds.min.y < -.9 && bounds.max.y > 13, 'hull clearance and overhead envelope are preserved');
assert.equal(ship.userData.deckY, 0);
assert.deepEqual(ship.userData.passengerPoint, [0, 0, -1]);
for (const name of ['zeppelin-propeller-port', 'zeppelin-propeller-starboard']) {
  const pivot = kit.getObjectByName(name);
  assert(pivot && pivot.parent === ship && pivot.children.length === 1, `${name} remains independently animateable`);
  assert.equal(pivot.userData.rotationAxis, 'Z');
  assert(Math.abs(pivot.position.y - 1.45) < .001 && Math.abs(pivot.position.z + 1.32) < .001);
}
const materials = new Set();
let meshes = 0;
kit.traverse(object => {
  assert(object.matrixWorld.elements.every(Number.isFinite));
  if (object.isMesh) {
    meshes++;
    materials.add(object.material);
    assert(object.geometry.getAttribute('color'), 'all geometry carries the Mossvale palette');
  }
});
assert.equal(meshes, 4);
assert.equal(materials.size, 1);
const ray = new Raycaster();
for (const x of [-.8, 0, .8]) {
  ray.set(new Vector3(x, 1, -8.5), new Vector3(0, 0, 1));
  assert.equal(ray.intersectObject(dock, true).length, 0, 'town entrance and boarding aisle are physically open');
  ray.set(new Vector3(x, 1, -6.5), new Vector3(0, 0, 1));
  const hits = ray.intersectObject(ship, true);
  assert(!hits.length || hits[0].distance > 8, 'rear boarding opening and passenger aisle are clear');
  ray.set(new Vector3(x, 1, -1), new Vector3(0, -1, 0));
  const deck = ray.intersectObject(ship, true)[0];
  assert(deck && Math.abs(deck.point.y) < .015, 'player stands directly on the declared deck origin');
}
for (const z of [-7.8, -7.2, -6.6, -6.05, -5, 0, 5]) {
  ray.set(new Vector3(.8, 1, z), new Vector3(0, -1, 0));
  const floor = ray.intersectObject(dock, true)[0];
  assert(floor && floor.point.y >= 0 && floor.point.y <= .181, 'ramp and boarding floor are continuous and shallow');
}
console.log(`PASS: original Blender zeppelin (${size.z.toFixed(2)}m × ${size.x.toFixed(2)}m), two propeller pivots, unobstructed deck/landing ramp, four meshes and ${(bytes.length / 1e6).toFixed(2)} MB kit.`);
