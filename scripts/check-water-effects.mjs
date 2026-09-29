import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSwimEffects } from '../src/water-effects.ts';
import { graphics, GRAPHICS_PRESETS } from '../src/graphics-settings.ts';
import { createOverworld } from '../src/zones.ts';
import { WATER_LEVEL, waterAt } from '../src/landscape.ts';

Object.assign(graphics, GRAPHICS_PRESETS.high); // Exercise authored water reflections independently of Auto startup.

const names = ['ripples', 'wakes', 'splashes', 'droplets'];
const water = { x: -708, z: -804 }, otherWater = { x: -698, z: -804 };
assert(waterAt(water.x, water.z) && waterAt(otherWater.x, otherWater.z));
function fixture(asset) {
  const parent = new THREE.Group(), unrelated = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); parent.add(unrelated);
  const effect = createSwimEffects(parent, asset);
  return { parent, unrelated, effect, batch: name => parent.getObjectByName(`Landscape: swimmer ${name}`) };
}
function parts(f, name) {
  const mesh = f.batch(name), matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion(), values = [];
  assert(mesh?.isInstancedMesh, `${name} uses a reusable instance batch`);
  const opacity = mesh.geometry.getAttribute('effectOpacity'); assert(opacity, 'particles carry their own fading opacity');
  assert(mesh.count <= mesh.instanceMatrix.count);
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix); assert(matrix.elements.every(Number.isFinite), 'effect transforms are finite');
    matrix.decompose(position, rotation, scale); assert(scale.toArray().every(value => value >= 0));
    assert(Number.isFinite(opacity.getX(i)) && opacity.getX(i) >= 0 && opacity.getX(i) <= 1, 'particle opacity stays in range');
    values.push({ position: position.clone(), matrix: matrix.toArray(), opacity: opacity.getX(i) });
  }
  return values;
}
function fingerprint(f, point) {
  return names.flatMap(name => parts(f, name).filter(part => Math.hypot(part.position.x-point.x, part.position.z-point.z) < 3)
    .map(part => `${name}:${part.matrix.map(n => n.toFixed(6)).join(',')}:${part.opacity.toFixed(6)}`)).sort();
}
function disposal(f) {
  const resources = new Set(), counts = new Map();
  f.parent.getObjectByName('Landscape: swimming effects').traverse(node => {
    if (!node.isMesh) return; resources.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) resources.add(material);
    if (node.isInstancedMesh) resources.add(node);
  });
  for (const resource of resources) { counts.set(resource, 0); resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1)); }
  let unrelatedDisposals = 0;
  f.unrelated.geometry.addEventListener('dispose', () => unrelatedDisposals++); f.unrelated.material.addEventListener('dispose', () => unrelatedDisposals++);
  f.effect.dispose(); f.effect.dispose(); f.effect.setSwimmers([{ id: 'retired', ...water }]); f.effect.update(90);
  assert.deepEqual(f.parent.children, [f.unrelated], 'disposing effects leaves unrelated parent content intact');
  assert([...counts.values()].every(count => count === 1), 'all owned instance buffers, geometry and materials release exactly once');
  assert.equal(unrelatedDisposals, 0); f.unrelated.geometry.dispose(); f.unrelated.material.dispose();
}

const a = fixture(), b = fixture(), alpha = { id: 'alpha', ...water, moving: false }, beta = { id: 'beta', ...otherWater, moving: false };
a.effect.update(0); b.effect.update(0);
const supplied = [{ ...alpha }, { ...beta }]; a.effect.setSwimmers(supplied); b.effect.setSwimmers([alpha, beta]); supplied[0].x = 0;
a.effect.update(.01); b.effect.update(.01);
assert.deepEqual(fingerprint(a, water), fingerprint(b, water), 'setSwimmers copies positions rather than retaining caller objects');
assert(parts(a, 'splashes').length + parts(a, 'droplets').length > 0, 'entering water emits a visible splash');
for (const time of [.05, .1, .2, .35]) {
  a.effect.setSwimmers([alpha, beta]); a.effect.update(time); b.effect.update(time);
}
assert.deepEqual(fingerprint(a, water), fingerprint(b, water), 'repeated snapshots do not replay entry splashes');
a.effect.update(3); b.effect.update(3);
assert.equal(parts(a, 'wakes').length, 0); assert.equal(parts(a, 'splashes').length, 0); assert.equal(parts(a, 'droplets').length, 0);
assert.equal(parts(a, 'ripples').length, 4, 'two stable idle rings remain for each swimmer after entry fades');
a.effect.setSwimmers([beta, alpha]); b.effect.setSwimmers([alpha, beta]); a.effect.update(3.1); b.effect.update(3.1);
assert.deepEqual(fingerprint(a, water), fingerprint(b, water), 'actor IDs preserve ring phases across snapshot reordering');
a.effect.setSwimmers([alpha]); a.effect.update(3.2); b.effect.update(3.2);
assert.deepEqual(fingerprint(a, water), fingerprint(b, water), 'removing another swimmer does not change the remaining actor phase');

let strokeDroplets = false;
for (let i = 1; i <= 10; i++) {
  const z = water.z + i * .2;
  a.effect.setSwimmers([{ ...alpha, z, rotation: 0, moving: true }]); a.effect.update(3.2 + i * .1);
  const wake = parts(a, 'wakes'); assert.equal(wake.length, 1, 'a moving swimmer has one directional wake');
  a.batch('wakes').geometry.computeBoundingBox();
  const wakeCenter = a.batch('wakes').geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(new THREE.Matrix4().fromArray(wake[0].matrix));
  assert(wakeCenter.z < z, 'the rendered wake geometry trails behind forward motion');
  strokeDroplets ||= parts(a, 'droplets').length > 0;
}
assert(strokeDroplets, 'swimming strokes produce droplets after the entry splash has expired');
a.effect.setSwimmers([]); a.effect.update(4.25);
assert.equal(parts(a, 'wakes').length, 0); assert(names.some(name => parts(a, name).length > 0), 'leaving water lets the existing trail dissipate');
a.effect.update(8); assert(names.every(name => parts(a, name).length === 0), 'exit residuals expire without a permanent trail');
a.effect.setSwimmers([{ id: 'land', x: 0, z: 0 }, { x: NaN, z: water.z }, { x: water.x, z: Infinity }, { x: 9999, z: 9999 }]); a.effect.update(8.1);
assert(names.every(name => parts(a, name).length === 0), 'land, invalid and out-of-world positions cannot emit swim effects');
const existingBatches = names.map(name => a.batch(name));
a.effect.setSwimmers(Array.from({ length: 100 }, (_, i) => ({ id: `crowd-${i}`, ...water, moving: true, rotation: i * .1 }))); a.effect.update(8.2);
assert.equal(parts(a, 'wakes').length, 64, 'the current swimmer set is capped at 64 actors');
assert(parts(a, 'ripples').length <= 640); assert(parts(a, 'droplets').length <= 512); assert(parts(a, 'splashes').length <= 512);
assert.deepEqual(names.map(name => a.batch(name)), existingBatches, 'crowds reuse existing GPU buffers');
assert(parts(a, 'ripples').every(part => Math.abs(part.position.y-WATER_LEVEL) < .15), 'rings stay on the water surface');
disposal(a); disposal(b);

// Consume the actual Blender scene once; live batches own baked clones, not retired GLB resources.
const glb = await readFile(new URL('../public/models/water-effects.glb', import.meta.url));
const asset = (await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '')).scene;
const source = new Set(), sourceDisposals = new Map();
asset.traverse(node => { if (node.isMesh) { source.add(node.geometry); for (const material of Array.isArray(node.material) ? node.material : [node.material]) source.add(material); } });
for (const name of ['wake', 'splash', 'droplet']) assert(asset.getObjectByName(name)?.isMesh, `Blender asset provides ${name}`);
for (const resource of source) { sourceDisposals.set(resource, 0); resource.addEventListener('dispose', () => sourceDisposals.set(resource, sourceDisposals.get(resource) + 1)); }
const authored = fixture(asset);
assert.equal(asset.children.length, 0); assert([...sourceDisposals.values()].every(count => count === 1), 'consumed GLB resources release once after baking');
for (const name of names) assert(!source.has(authored.batch(name).geometry), 'live effect geometry is independent of consumed assets');
authored.effect.setSwimmers([{ id: 'authored', ...water, moving: true }]); authored.effect.update(.1);
for (const name of names) parts(authored, name);
disposal(authored); assert([...sourceDisposals.values()].every(count => count === 1), 'effect cleanup does not dispose consumed source resources again');

// Exercise the live ocean shader through the real world constructor and loaded Blender assets.
const originalLoad = GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync = async function(url) {
  const bytes = await readFile(new URL(`../public${url}`, import.meta.url));
  return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
};
let world;
try {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#cce4dd');
  world = await createOverworld(scene);
  const oceans = []; scene.traverse(node => { if (node.userData.water) oceans.push(node); });
  assert(oceans.length > 1); assert(oceans.every(mesh => mesh.material === oceans[0].material), 'all ocean chunks share one water shader');
  const compile = () => {
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    oceans[0].material.onBeforeCompile(shader); return shader;
  };
  const shader = compile(), again = compile(), uniforms = shader.uniforms;
  for (const name of ['mossvaleWaterTime', 'mossvaleWaterSky', 'mossvaleWaterDaylight'])
    assert.equal(uniforms[name], again.uniforms[name], 'shader recompilation reuses live uniform objects');
  const skyUniform = uniforms.mossvaleWaterSky.value;
  assert.notEqual(skyUniform, scene.background, 'water copies the sky without retaining or mutating the scene color');
  world.update(6.5, undefined, undefined, 1);
  assert.equal(uniforms.mossvaleWaterTime.value, 6.5); assert.equal(uniforms.mossvaleWaterDaylight.value, 1);
  assert(skyUniform.equals(scene.background)); const daySky = skyUniform.clone();
  scene.background = new THREE.Color('#10182f'); world.update(7, undefined, undefined, 0);
  assert.equal(uniforms.mossvaleWaterSky.value, skyUniform, 'time and biome updates do not allocate a new sky uniform');
  assert(skyUniform.equals(scene.background)); assert.equal(uniforms.mossvaleWaterDaylight.value, 0);
  assert(skyUniform.toArray().every((channel, i) => channel < daySky.toArray()[i]), 'the actual night sky reaches every ocean chunk');
  world.update(8, undefined, undefined, 2); assert.equal(uniforms.mossvaleWaterDaylight.value, 1);
  world.update(8.1, undefined, undefined, -1); assert.equal(uniforms.mossvaleWaterDaylight.value, 0);
  world.update(NaN, undefined, undefined, NaN);
  assert.equal(uniforms.mossvaleWaterTime.value, 8.1); assert.equal(uniforms.mossvaleWaterDaylight.value, 1);
  const validSky = skyUniform.clone(); scene.background = new THREE.Color(Infinity, 0, 0); world.update(9);
  assert(skyUniform.equals(validSky) && skyUniform.toArray().every(Number.isFinite), 'invalid sky input cannot poison GPU uniforms');
  scene.background = null; world.update(10); assert(skyUniform.equals(validSky), 'a non-color background retains the last valid reflection tint');
  assert(shader.fragmentShader.includes('uniform vec3 mossvaleWaterSky;') && shader.fragmentShader.includes('uniform float mossvaleWaterDaylight;'));
  assert.match(shader.fragmentShader, /waterSky\s*=\s*max\([^;]*mossvaleWaterDaylight[^;]*\);/, 'emissive reflection uses daylight and retains a dim night floor');
  assert.match(shader.fragmentShader, /#if NUM_DIR_LIGHTS > 0\s+vec3 waterLightDirection = inverseTransformDirection\(directionalLights\[0\]\.direction, viewMatrix\);/,
    'glints use the existing primary light in world space and also compile in scenes without a directional light');
  assert(shader.fragmentShader.includes('directionalLights[0].color') && shader.fragmentShader.includes('max(waterLightStrength, .00001)'), 'a disabled primary light cannot divide by zero');
  assert(!shader.fragmentShader.includes('normalize(vec3(-.45, .80, .25))'), 'the old fixed daytime sun direction is absent');
  assert(shader.fragmentShader.includes('texture2D(mossvaleWaterShore') && shader.fragmentShader.includes('normal = normalize((viewMatrix * vec4(waterNormal'), 'shore foam and animated surface normals remain intact');
  let shoreDisposals = 0; uniforms.mossvaleWaterShore.value.addEventListener('dispose', () => shoreDisposals++);
  world.dispose(); world.dispose(); world.update(11, undefined, undefined, 0);
  assert.equal(shoreDisposals, 1, 'the shared ocean distance texture is released exactly once');
  assert.equal(uniforms.mossvaleWaterTime.value, 10, 'disposed ocean shaders stop receiving updates');
  assert.equal(scene.children.length, 0);
} finally { world?.dispose(); GLTFLoader.prototype.loadAsync = originalLoad; }
console.log('PASS: stable swimmers, entry/stroke/fading effects, bounded finite pools, shared live ocean sky/daylight uniforms, directional sun/moon glints, preserved shore waves, and isolated idempotent cleanup.');
