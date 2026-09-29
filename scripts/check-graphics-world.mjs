import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { graphics, GRAPHICS_PRESETS } from '../src/graphics-settings.ts';
import { createEnvironmentLights, updateEffectTexture } from '../src/environment-lights.ts';
import { createOverworld, createDungeonWorld } from '../src/zones.ts';
import { WORLD_BOUNDS, TERRAIN_STEP, WATER_LEVEL, surfaceAt } from '../src/landscape.ts';

const original = { ...graphics }, load = GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync = async function (url) {
  const bytes = await readFile(new URL(`../public${url}`, import.meta.url));
  return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
};
let world, dungeon, environment;
try {
  Object.assign(graphics, GRAPHICS_PRESETS.high);
  const root = new THREE.Group(), source = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); root.add(source);
  environment = createEnvironmentLights(root, Array.from({ length: 8 }, (_, i) => ({ position: new THREE.Vector3(i, 2, 0), color: 0xffbb66, fire: true, source })));
  const group = root.getObjectByName('Mossvale environmental effects'), lights = group.children.filter(node => node.isPointLight);
  const halos = root.getObjectByName('Environmental lamp halos'), sparks = root.getObjectByName('Environmental flame and embers'), smoke = root.getObjectByName('Environmental rising smoke');
  environment.update(1, new THREE.Vector3());
  const highSparks = sparks.count, highSmoke = smoke.count, texture = halos.material.map, fullPixels = texture.image.data;
  let textureDisposals = 0; texture.addEventListener('dispose', () => textureDisposals++);
  assert.equal(lights.filter(light => light.visible).length, 6); assert(halos.count > 0 && highSparks > 0 && highSmoke > 0);
  graphics.effects = 'low'; graphics.textures = 'medium'; environment.update(2, new THREE.Vector3());
  assert.equal(lights.filter(light => light.visible).length, 2, 'disabled lights leave the shader light list');
  assert(sparks.count < highSparks && smoke.count < highSmoke, 'Low builds fewer cosmetic particle instances');
  assert.equal(texture.image.width, 16); assert.equal(halos.material.map, texture);
  graphics.effects = 'off'; graphics.bloom = false; graphics.textures = 'low'; environment.update(3, new THREE.Vector3());
  assert(lights.every(light => !light.visible && light.intensity === 0));
  assert.equal(halos.count + sparks.count + smoke.count, 0); assert(source.visible, 'authored lamps and fire remain visible');
  assert.equal(texture.image.width, 8); const lowPixels = texture.image.data, version = texture.version;
  environment.update(4); assert.equal(texture.image.data, lowPixels); assert.equal(texture.version, version, 'unchanged texture settings allocate and upload nothing');
  graphics.bloom = true; environment.update(5); assert(halos.count > 0); assert.equal(sparks.count + smoke.count, 0, 'glow works independently with effects off');
  graphics.textures = 'high'; environment.update(6); assert.equal(texture.image.data, fullPixels, 'High restores original texture pixels exactly');
  assert.equal(textureDisposals, 3, 'each dimension change releases immutable GPU storage before the next upload');
  const oddPixels = Uint8Array.from({ length: 15 }, (_, i) => i), odd = new THREE.DataTexture(oddPixels, 5, 3, THREE.RedFormat);
  graphics.textures = 'low'; updateEffectTexture(odd, oddPixels, 5, 3);
  assert.deepEqual([...odd.image.data], [7, 9], 'downsampling includes partial edge blocks'); odd.dispose();

  Object.assign(graphics, GRAPHICS_PRESETS.high);
  // The original town floor has its own geometry and need not own a landscape chunk.
  const scene = new THREE.Scene(), observer = new THREE.Vector3(500, 0, 500); scene.background = new THREE.Color('#cce4dd');
  world = await createOverworld(scene); world.update(1, observer);
  const chunks = [], oceans = []; scene.traverse(node => { if (node.userData.landscapeChunk) chunks.push(node); if (node.userData.water) oceans.push(node); });
  const columns = (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX) / TERRAIN_STEP, rows = (WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ) / TERRAIN_STEP;
  const floors = new Uint8Array(columns * rows), waters = new Uint8Array(columns * rows), matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3();
  scene.updateMatrixWorld(true);
  scene.traverse(mesh => {
    if (!mesh.isInstancedMesh || !(mesh.userData.water || mesh.userData.collision === 'terrain')) return;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix); position.setFromMatrixPosition(matrix).applyMatrix4(mesh.matrixWorld); scale.setFromMatrixScale(matrix);
      if (Math.abs(scale.x - TERRAIN_STEP) > .001 || Math.abs(scale.z - TERRAIN_STEP) > .001) continue;
      const x = (position.x - WORLD_BOUNDS.minX) / TERRAIN_STEP - .5, z = (position.z - WORLD_BOUNDS.minZ) / TERRAIN_STEP - .5;
      if (Math.abs(x - Math.round(x)) > .001 || Math.abs(z - Math.round(z)) > .001) continue;
      assert(x >= 0 && x < columns && z >= 0 && z < rows, 'terrain batches stay within canonical world bounds');
      const key = Math.round(z) * columns + Math.round(x), surface = surfaceAt(position.x, position.z);
      if (mesh.userData.water) { assert(surface.water && Math.abs(position.y - WATER_LEVEL) < .0001); waters[key]++; }
      else {
        // Authored town floors are level at their region origin; only wilderness
        // tiles use the heightfield at each cell (shore terraces can differ).
        const height = mesh.name === 'Landscape: terrain' ? surface.height : mesh.matrixWorld.elements[13];
        assert(Math.abs(position.y + scale.y / 2 - height) < .0001, `terrain retains its height at ${position.x},${position.z}`); floors[key]++;
      }
    }
  });
  for (let z = 0; z < rows; z++) for (let x = 0; x < columns; x++) {
    const key = z * columns + x, surface = surfaceAt(WORLD_BOUNDS.minX + (x + .5) * TERRAIN_STEP, WORLD_BOUNDS.minZ + (z + .5) * TERRAIN_STEP);
    assert.equal(floors[key], 1, 'every terrain cell has exactly one floor across chunk seams and original town floors');
    assert.equal(waters[key], Number(surface.water), 'water batches cover exactly the canonical water cells');
  }
  const highChunks = chunks.filter(chunk => chunk.visible).length, material = oceans[0].material;
  const compile = () => { const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader }; material.onBeforeCompile(shader); return shader; };
  const highShader = compile(), shore = highShader.uniforms.mossvaleWaterShore.value, shorePixels = shore.image.data, shoreWidth = shore.image.width;
  assert(highShader.fragmentShader.includes('vec3 waterReflection = reflect('));
  const materialVersion = material.version, highKey = material.customProgramCacheKey();
  Object.assign(graphics, GRAPHICS_PRESETS.low); world.update(2, observer);
  assert(chunks.filter(chunk => chunk.visible).length < highChunks, 'Low removes whole distant terrain and tree batches');
  const nearby = chunks.filter(chunk => { const { x, z, size } = chunk.userData.landscapeChunk; return x <= observer.x && x + size >= observer.x && z <= observer.z && z + size >= observer.z; });
  assert(nearby.length && nearby.every(chunk => chunk.visible), 'terrain containing the player never disappears');
  assert.equal(shore.image.width, Math.ceil(shoreWidth / 4)); assert(material.version > materialVersion); assert.notEqual(material.customProgramCacheKey(), highKey);
  const lowShader = compile(); assert(!lowShader.fragmentShader.includes('vec3 waterReflection = reflect('), 'disabled reflections remove sky and glint calculations from the shader');
  assert(lowShader.fragmentShader.includes('texture2D(mossvaleWaterShore') && lowShader.fragmentShader.includes('normal = normalize((viewMatrix'), 'shoreline and water normals remain intact');
  const lowVersion = material.version; world.update(3, observer); assert.equal(material.version, lowVersion, 'unchanged reflections do not recompile');
  assert.equal(scene.getObjectByName('Landscape: swimming effects').visible, false);
  Object.assign(graphics, GRAPHICS_PRESETS.high); world.update(4, observer);
  assert.equal(chunks.filter(chunk => chunk.visible).length, highChunks); assert.equal(shore.image.data, shorePixels); assert.equal(material.customProgramCacheKey(), highKey);
  assert.equal(scene.getObjectByName('Landscape: swimming effects').visible, true);
  world.dispose(); world = undefined;

  Object.assign(graphics, GRAPHICS_PRESETS.low);
  const dungeonScene = new THREE.Scene(); dungeon = await createDungeonWorld(dungeonScene, 'rootvault');
  const now = Date.now(); dungeon.setDungeonState({ clearedStages: [], objects: [], hazards: [{ id: 'danger', x: 0, z: 17, r: 3, kind: 'roots', startedAt: now, endsAt: now + 1800, damage: 20 }] }, now);
  dungeon.update(1, observer);
  assert(dungeonScene.getObjectByName('Vault: boss danger outlines').count > 0);
  assert(dungeonScene.getObjectByName('Vault: boss danger fill').count > 0, 'Low graphics preserves actionable dungeon danger markers');
} finally {
  world?.dispose(); dungeon?.dispose(); environment?.dispose(); Object.assign(graphics, original); GLTFLoader.prototype.loadAsync = load;
}
console.log('PASS: every canonical terrain/water cell survives chunking; graphics change visibility, shader work, lights/particles and texture sizes; High restores state and Low preserves danger markers.');
