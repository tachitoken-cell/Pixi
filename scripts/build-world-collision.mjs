import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, basename, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceAssets = new Map();
const sourceFiles = new Map();

/** Reuse the real scene builders without a browser, HTTP server or GPU. */
export function installLocalAssetLoader() {
  sourceFiles.set('scripts/build-world-collision.mjs', hash(readFileSync(fileURLToPath(import.meta.url))));
  const entry = process.argv[1] && relative(ROOT, resolve(process.argv[1]));
  if (entry?.startsWith('scripts/')) sourceFiles.set(entry, hash(readFileSync(resolve(ROOT, entry))));
  const hook = registerHooks({ resolve(specifier, context, next) {
    const result = next(context.parentURL?.includes('/src/') && /^\.\/[\w-]+$/.test(specifier) ? `${specifier}.ts` : specifier, context);
    if (result.url.startsWith('file:')) {
      const path = relative(ROOT, fileURLToPath(result.url));
      if (path.startsWith('src/') && !sourceFiles.has(path)) sourceFiles.set(path, hash(readFileSync(fileURLToPath(result.url))));
    }
    return result;
  } });
  const original = GLTFLoader.prototype.loadAsync;
  GLTFLoader.prototype.loadAsync = async function (url) {
    const pathname = new URL(url, 'http://collision.local').pathname;
    assert(pathname.startsWith('/models/') && !pathname.includes('..'), `Unexpected collision asset: ${url}`);
    const bytes = readFileSync(resolve(ROOT, 'public', pathname.slice(1)));
    sourceAssets.set(pathname, hash(bytes));
    return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  };
  return () => { hook.deregister(); GLTFLoader.prototype.loadAsync = original; };
}

/** Indexed local geometry is stored once; every rendered instance keeps its exact transform. */
export function collectCollision(root, { context = 'world' } = {}) {
  const shapes = [], instances = [], chunks = [], shapeIds = new Map(), geometryIds = new Map();
  const coverage = { context, meshes: 0, includedMeshes: 0, excluded: {}, triangles: 0, uniqueTriangles: 0 };
  let offset = 0;
  root.updateWorldMatrix(true, true);
  const matrix = new THREE.Matrix4(), local = new THREE.Matrix4();
  function visit(node, inherited, inheritedState) {
    const classification = node.userData.collision ?? inherited;
    const condition = node.userData.collisionState ?? inheritedState;
    if (node.isMesh) {
      coverage.meshes++;
      assert(['solid', 'terrain', 'foliage', 'water', 'effect', 'actor'].includes(classification), `Unclassified collision mesh: ${node.name}`);
      const count = node.isInstancedMesh ? node.count : 1;
      if (classification !== 'solid') {
        coverage.excluded[classification] ??= { meshes: 0, instances: 0 };
        coverage.excluded[classification].meshes++;
        coverage.excluded[classification].instances += count;
      } else if (!count) {
        coverage.excluded.empty ??= { meshes: 0, instances: 0 };
        coverage.excluded.empty.meshes++;
      } else {
        coverage.includedMeshes++;
        let shape = geometryIds.get(node.geometry);
        if (shape === undefined) {
          const position = node.geometry.getAttribute('position'), sourceIndex = node.geometry.index;
          assert(position && position.itemSize === 3, `Missing collision positions: ${node.name}`);
          // Rendering splits vertices for normals/colors. Collision needs each position once.
          const points = [], vertexIds = new Map(), remap = new Uint32Array(position.count);
          for (let i = 0; i < position.count; i++) {
            const point = [position.getX(i), position.getY(i), position.getZ(i)].map(Math.fround);
            assert(point.every(Number.isFinite), `Invalid collision vertex: ${node.name}`);
            const key = point.join(','); let index = vertexIds.get(key);
            if (index === undefined) { index = points.length; points.push(point); vertexIds.set(key, index); }
            remap[i] = index;
          }
          const vertices = Buffer.alloc(points.length * 12);
          for (const [i, point] of points.entries()) for (let axis = 0; axis < 3; axis++) vertices.writeFloatLE(point[axis], i * 12 + axis * 4);
          const indexCount = sourceIndex?.count ?? position.count, indices = Buffer.alloc(indexCount * 4);
          assert(indexCount % 3 === 0, `Invalid collision triangles: ${node.name}`);
          for (let i = 0; i < indexCount; i++) {
            const value = sourceIndex ? sourceIndex.getX(i) : i;
            assert(Number.isInteger(value) && value >= 0 && value < position.count, `Invalid collision index: ${node.name}`);
            indices.writeUInt32LE(remap[value], i * 4);
          }
          const key = createHash('sha256').update(vertices).update(indices).digest('hex');
          shape = shapeIds.get(key);
          if (shape === undefined) {
            shape = shapes.length; shapeIds.set(key, shape);
            shapes.push({ vertexOffset: offset, vertexCount: points.length, indexOffset: offset + vertices.length, indexCount });
            chunks.push(vertices, indices); offset += vertices.length + indices.length;
            coverage.uniqueTriangles += indexCount / 3;
          }
          geometryIds.set(node.geometry, shape);
        }
        for (let index = 0; index < count; index++) {
          matrix.copy(node.matrixWorld);
          if (node.isInstancedMesh) { node.getMatrixAt(index, local); matrix.multiply(local); }
          assert(matrix.elements.every(Number.isFinite), `Invalid collision transform: ${node.name}`);
          if (Math.abs(matrix.determinant()) < 1e-12) continue;
          const state = node.userData.collisionStates?.[index] ?? condition;
          instances.push({ shape, matrix: matrix.toArray(), tag: node.name || node.parent?.name || context, ...(state ? { state } : {}) });
          coverage.triangles += shapes[shape].indexCount / 3;
        }
      }
    }
    for (const child of node.children) visit(child, classification, condition);
  }
  visit(root);
  const binary = Buffer.concat(chunks);
  return { manifest: { version: 1, shapes, instances, coverage, binaryBytes: binary.length, binarySha256: hash(binary), sourceAssets: Object.fromEntries([...sourceAssets].sort()), sourceFiles: Object.fromEntries([...sourceFiles].sort()) }, binary };
}

/** Build/check only: stale renderer sources or GLBs must be rebaked before release. */
export function checkCollisionSources(manifest) {
  assert(Object.keys(manifest.sourceFiles ?? {}).length, 'Collision manifest has no source fingerprints; rebuild collision assets.');
  for (const [path, expected] of Object.entries(manifest.sourceFiles))
    assert.equal(hash(readFileSync(resolve(ROOT, path))), expected, `Collision source changed: ${path}; rebuild collision assets.`);
  for (const [path, expected] of Object.entries(manifest.sourceAssets))
    assert.equal(hash(readFileSync(resolve(ROOT, 'public', path.slice(1)))), expected, `Collision model changed: ${path}; rebuild collision assets.`);
}

export function writeCollision(root, outPrefix, options = {}) {
  const { manifest, binary } = collectCollision(root, options);
  manifest.binary = basename(outPrefix) + '.bin';
  mkdirSync(dirname(outPrefix), { recursive: true });
  writeFileSync(outPrefix + '.bin', binary);
  writeFileSync(outPrefix + '.json', JSON.stringify(manifest));
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    let checked = 0;
    for (const name of readdirSync(resolve(ROOT, 'public/collision')).filter(name => name.endsWith('.json'))) {
      const manifest = JSON.parse(readFileSync(resolve(ROOT, 'public/collision', name), 'utf8'));
      if (!manifest.shapes) continue;
      checkCollisionSources(manifest);
      const binary = readFileSync(resolve(ROOT, 'public/collision', manifest.binary));
      assert.equal(binary.length, manifest.binaryBytes, `Collision binary size mismatch: ${name}`);
      assert.equal(hash(binary), manifest.binarySha256, `Collision binary hash mismatch: ${name}`);
      checked++;
    }
    assert(checked, 'No collision scenes found.');
    console.log(`Collision source fingerprints and binary integrity passed for ${checked} scenes.`);
    process.exit(0);
  }
  const started = performance.now(), restore = installLocalAssetLoader();
  const { createOverworld } = await import('../src/zones.ts');
  const scene = new THREE.Scene();
  await createOverworld(scene);
  const { createZeppelins } = await import('../src/zeppelin-models.ts');
  const zeppelins = await createZeppelins(scene);
  const { WORLD_GATHERING_NODES } = await import('../src/gathering-nodes.ts');
  const { makeResource } = await import('../src/resources.ts');
  const { BUILDINGS, buildingFloorHeight } = await import('../src/buildings.ts');
  const { CITY_LAYOUTS } = await import('../src/city.ts');
  const { ZEPPELIN_PORTS } = await import('../src/zeppelin.ts');
  const { WATER_LEVEL } = await import('../src/landscape.ts');
  for (const node of WORLD_GATHERING_NODES) {
    const mesh = makeResource(node.kind); mesh.name = `resource:${node.id}`;
    mesh.position.set(node.x, buildingFloorHeight(node.x, node.z), node.z);
    mesh.userData.collision = 'solid'; mesh.userData.collisionState = { key: `depleted:${node.id}`, value: false };
    if (node.waterX !== undefined && node.waterZ !== undefined) {
      mesh.rotation.y = Math.atan2(node.waterX - node.x, node.waterZ - node.z);
      for (const child of mesh.children) if (child.name === 'Fishing ripple') { child.position.y = WATER_LEVEL + .025 - mesh.position.y; child.userData.collision = 'effect'; }
    }
    scene.add(mesh);
  }
  const prefix = resolve(ROOT, 'public/collision/overworld');
  for (const building of BUILDINGS) assert(scene.getObjectByName(building.id), `Missing building: ${building.id}`);
  for (const city of CITY_LAYOUTS) assert(scene.getObjectByName(`${city.name} — Blender city`), `Missing city: ${city.name}`);
  assert.equal(zeppelins.docks.size, ZEPPELIN_PORTS.length);
  const manifest = writeCollision(scene, prefix, { context: 'overworld' });
  // Re-extraction must be byte-identical, including all instance matrices.
  const repeated = collectCollision(scene, { context: 'overworld' });
  assert.equal(repeated.manifest.binarySha256, manifest.binarySha256);
  assert.deepEqual(repeated.manifest.instances, manifest.instances);
  for (const category of ['terrain', 'actor', 'water', 'effect']) assert(manifest.coverage.excluded[category]?.meshes, `Missing ${category} exclusions`);
  for (const tag of ['Foundation and entry steps', 'Landscape: WoodlandOak', 'Lanternreach cobbled streets', 'training-weapon-rack'])
    assert(manifest.instances.some(instance => instance.tag.includes(tag)), `Missing physical category: ${tag}`);
  const resourceStates = new Set(manifest.instances.filter(instance => instance.state?.value === false).map(instance => instance.state.key));
  assert.deepEqual(resourceStates, new Set(WORLD_GATHERING_NODES.map(node => `depleted:${node.id}`)));
  restore();
  console.log(JSON.stringify({ ...manifest.coverage, buildings: BUILDINGS.length, cities: CITY_LAYOUTS.length, docks: zeppelins.docks.size, resources: resourceStates.size, shapes: manifest.shapes.length, instances: manifest.instances.length, binaryBytes: manifest.binaryBytes, jsonBytes: readFileSync(prefix + '.json').length, seconds: Math.round((performance.now() - started) / 100) / 10, binarySha256: manifest.binarySha256 }, null, 2));
}
