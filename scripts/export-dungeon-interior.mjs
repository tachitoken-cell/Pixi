/** Snapshot runtime geometry for Blender: node scripts/export-dungeon-interior.mjs [output] [dungeon-id|all] [--themed]. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createDungeonWorld } from '../src/zones.ts';
import { DUNGEONS, dungeonBounds, dungeonReturn, dungeonCheckpoint, dungeonPreparation, getDungeon, dungeonLayout, dungeonStages } from '../src/dungeon.ts';

const themed = process.argv.includes('--themed'), themedIds = ['plagueworks', 'emberfall', 'veilhaven'];
const [output, choice = themed ? 'all' : 'rootvault'] = process.argv.slice(2).filter(arg => arg !== '--themed');
const selected = choice === 'all' ? DUNGEONS.filter(dungeon => !themed || themedIds.includes(dungeon.id)) : [getDungeon(choice)];
assert(selected.every(Boolean), `Unknown dungeon: ${choice}`);
const destination = output ?? (choice === 'all' ? '/tmp/mossvale-dungeon-layouts' : `/tmp/${choice}-interior.json`);
if (choice === 'all') await mkdir(destination, { recursive: true });
const footprints = new Set();
const originalLoad = GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync = async function (url) {
  assert(['/models/rootvault-kit.glb', '/models/dungeon-portals.glb', ...themedIds.map(id => `/models/${id}-kit.glb`)].includes(url), `Unexpected dungeon model: ${url}`);
  const bytes = await readFile(new URL(`../public${url}`, import.meta.url));
  return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
};
try {
  for (const definition of selected) {
    let world;
    try {
      const scene = new THREE.Scene(), layout = dungeonLayout(definition.id);
      world = await createDungeonWorld(scene, definition.id); world.setDungeonState(null, 0); world.update(0);
      scene.updateMatrixWorld(true);
      const geometries = [], batches = [], ids = new Map(), matrix = new THREE.Matrix4(), color = new THREE.Color();
      const values = attribute => attribute && Array.from({ length: attribute.count }, (_, i) => [attribute.getX(i), attribute.getY(i), attribute.getZ(i)]).flat();
      scene.traverseVisible(mesh => {
        if (!mesh.isMesh || (mesh.isInstancedMesh && !mesh.count) || mesh.name.startsWith('Environmental')) return;
        assert(!Array.isArray(mesh.material), 'dungeon snapshot expects one material per authored batch');
        if (!ids.has(mesh.geometry)) {
          const id = geometries.length; ids.set(mesh.geometry, id);
          geometries.push({ id, positions: values(mesh.geometry.getAttribute('position')), colors: values(mesh.geometry.getAttribute('color')), indices: mesh.geometry.index && Array.from(mesh.geometry.index.array) });
        }
        const material = mesh.material, instances = [];
        for (let i = 0; i < (mesh.isInstancedMesh ? mesh.count : 1); i++) {
          if (mesh.isInstancedMesh) mesh.getMatrixAt(i, matrix); else matrix.identity();
          matrix.premultiply(mesh.matrixWorld); color.setRGB(1, 1, 1);
          if (mesh.isInstancedMesh && mesh.instanceColor) mesh.getColorAt(i, color);
          assert(matrix.elements.every(Number.isFinite), 'all source instance transforms are finite');
          instances.push({ matrix: matrix.toArray(), color: color.toArray() });
        }
        batches.push({ name: mesh.name, geometry: ids.get(mesh.geometry), objectIds: mesh.userData.objectIds,
          material: { color: material.color?.toArray() ?? [1, 1, 1], emissive: material.emissive?.toArray() ?? [0, 0, 0], emissiveIntensity: material.emissiveIntensity ?? 1,
            unlit: !!material.isMeshBasicMaterial, roughness: material.roughness ?? .84, metalness: material.metalness ?? 0, opacity: material.opacity, transparent: material.transparent,
            water: mesh.name.endsWith('pool-water') }, instances });
      });
      const floors = batches.find(batch => batch.name === 'Vault: fitted temple floors and shared walls');
      assert(floors, 'actual floor geometry is present');
      footprints.add(JSON.stringify(floors.instances.map(instance => instance.matrix)));
      assert(batches.some(b => b.name.endsWith('gate-leaf')) && batches.some(b => b.name.endsWith('wall-stone')), 'full composition includes authored gates and walls');
      assert(!layout.pools.length || batches.some(b => b.material.water), 'runtime pools retain water geometry');
      const target = choice === 'all' ? path.join(destination, `${definition.id}.json`) : destination;
      await writeFile(target, JSON.stringify({ id: definition.id, name: definition.name, minLevel: definition.minLevel, maxLevel: definition.maxLevel,
        state: 'initial encounter; gates closed; no players or creatures', geometries, batches, camera: { position: [7, 11, 30], target: [0, 1, -1] }, bounds: dungeonBounds(definition.id), returnPoint: dungeonReturn(definition.id), checkpoint: dungeonCheckpoint(definition.id), preparation: dungeonPreparation(definition.id), stages: dungeonStages(definition.id),
        layout: { rooms: layout.rooms, walls: layout.walls, doors: layout.doors, gates: layout.gates, pools: layout.pools, objects: layout.objects } }));
      console.log(`DUNGEON_SNAPSHOT ${definition.id}: ${batches.length} batches / ${batches.reduce((count, batch) => count + batch.instances.length, 0)} runtime instances → ${target}`);
    } finally { world?.dispose(); }
  }
  assert.equal(footprints.size, selected.length, 'each exported dungeon has a distinct runtime floorplan');
} finally { GLTFLoader.prototype.loadAsync = originalLoad; }
