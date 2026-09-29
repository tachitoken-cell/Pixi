import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { installLocalAssetLoader, collectCollision, writeCollision } from './build-world-collision.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const restore = installLocalAssetLoader(), started = performance.now();
const { createDungeonWorld } = await import('../src/zones.ts');
const { DUNGEONS, dungeonLayout, dungeonStages } = await import('../src/dungeon.ts');
const { createArenaWorld } = await import('../src/arena-world.ts');
const { loadRaidWorldAssets, createRaidScenery } = await import('../src/raid-world.ts');
const { loadInstantCombatScenery } = await import('../src/instant-combat-world.ts');
const { INSTANT_COMBAT_MAPS } = await import('../src/instant-combat-maps.ts');
const entries = [];

function staticGeometrySignature(root) {
  const { manifest, binary } = collectCollision(root);
  const shapes = manifest.shapes.map(shape => createHash('sha256').update(binary.subarray(shape.vertexOffset, shape.indexOffset + shape.indexCount * 4)).digest('hex'));
  const signature = createHash('sha256');
  for (const instance of manifest.instances) {
    if (instance.state?.key === 'dungeon:traps' || instance.state?.key.startsWith('spike:')) continue;
    signature.update(JSON.stringify([shapes[instance.shape], instance.matrix, instance.tag]));
  }
  return signature.digest('hex');
}

function save(root, context, metadata = {}) {
  const prefix = resolve(ROOT, 'public/collision', context);
  const manifest = writeCollision(root, prefix, { context });
  assert(manifest.shapes.length && manifest.instances.length, `Empty collision scene: ${context}`);
  assert.equal(manifest.coverage.meshes, manifest.coverage.includedMeshes + Object.values(manifest.coverage.excluded).reduce((sum, excluded) => sum + excluded.meshes, 0), `Incomplete mesh coverage: ${context}`);
  const repeated = collectCollision(root, { context });
  assert.equal(repeated.manifest.binarySha256, manifest.binarySha256);
  assert.deepEqual(repeated.manifest.instances, manifest.instances);
  const stateKeys = [...new Set(manifest.instances.flatMap(instance => instance.state ? [instance.state.key] : []))].sort();
  Object.assign(manifest, { stateKeys, ...metadata });
  writeFileSync(prefix + '.json', JSON.stringify(manifest));
  const entry = { key: context, shapes: manifest.shapes.length, instances: manifest.instances.length, binaryBytes: manifest.binaryBytes, jsonBytes: readFileSync(prefix + '.json').length, ...manifest.coverage, ...metadata };
  entries.push(entry);
  console.log(JSON.stringify(entry));
  return manifest;
}

for (const { id, storyQuestId } of DUNGEONS) {
  const scene = new THREE.Scene(), world = await createDungeonWorld(scene, id), layout = dungeonLayout(id);
  const staticSignature = staticGeometrySignature(scene);
  const closed = [], lowered = scene.getObjectByName('Dungeon: timed spikes');
  scene.traverse(node => {
    if (node.isInstancedMesh && node.userData.collisionStates?.some(state => /^(object|gate):/.test(state.key))) closed.push(node.clone());
  });
  if (layout.objects.some(object => object.kind === 'chest')) assert(closed.length, `No chest lid bindings: ${id}`);
  // The renderer supplies both hinged chest poses and any legacy lowered gates.
  // Cloning before setDungeonState preserves the exact closed matrices and flags.
  const lowSpikes = lowered?.clone(), highSpikes = lowered?.clone();
  world.setDungeonState({ kind: id, objects: layout.objects.map(object => ({ ...object, activated: true, available: true })), clearedStages: dungeonStages(id).map(stage => stage.id), hazards: [], completed: false }, 0);
  for (const clone of closed) scene.children[0].add(clone);
  if (lowered) {
    assert(lowSpikes && highSpikes);
    highSpikes.name += ' (raised)';
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < highSpikes.count; index++) {
      highSpikes.getMatrixAt(index, matrix);
      // The rendered cone scales only vertically between .025 and 1.
      // Initial update(enabled=false) is the exact lowered pose for every trap.
      matrix.elements[5] = 1;
      highSpikes.setMatrixAt(index, matrix);
      highSpikes.userData.collisionStates[index].key = highSpikes.userData.collisionStates[index].key.replace(/:lowered$/, ':raised');
    }
    lowered.parent.add(lowSpikes, highSpikes);
    lowered.removeFromParent();
  }
  const manifest = save(scene, `dungeon-${id}`, { rooms: layout.rooms.map(room => room.id), dreamSharesGeometry: true });
  for (const object of layout.objects.filter(object => object.kind === 'chest')) {
    const variants = manifest.instances.filter(instance => instance.state?.key === `object:${object.id}`);
    assert(variants.some(instance => instance.state.value) && variants.some(instance => !instance.state.value), `Missing chest pose: ${id}/${object.id}`);
    const open = variants.find(instance => instance.state.value), shut = variants.find(instance => !instance.state.value);
    assert.notDeepEqual(open.matrix, shut.matrix, `Unchanged chest hinge: ${id}/${object.id}`);
  }
  if (!storyQuestId) assert(manifest.coverage.excluded.water?.meshes, `Missing liquid exclusion: ${id}`);
  assert(manifest.instances.some(instance => instance.tag.includes('fitted temple floors')), `Missing dungeon floor: ${id}`);
  assert(manifest.instances.some(instance => instance.tag.includes('wall-stone')), `Missing dungeon walls: ${id}`);
  for (const trap of lowered?.userData.traps ?? []) for (const phase of ['raised', 'lowered']) {
    assert.equal(manifest.instances.filter(instance => instance.state?.key === `spike:${trap.id}:${phase}`).length, 24, `Incomplete spike pose: ${id}/${trap.id}/${phase}`);
  }
  world.dispose();
  // Dream palettes and particles differ, but their remaining physical scenery
  // must match the same authoritative key after the trap flags are disabled.
  for (const dream of ['pleasant', 'nightmare']) {
    const dreamScene = new THREE.Scene(), dreamWorld = await createDungeonWorld(dreamScene, id, dream);
    assert.equal(staticGeometrySignature(dreamScene), staticSignature, `Dream scenery differs: ${id}/${dream}`);
    dreamWorld.dispose();
  }
}

const arena = new THREE.Scene(), arenaWorld = await createArenaWorld(arena);
const arenaManifest = save(arena, 'arena');
assert.equal(arenaManifest.instances.length, 5, 'Arena stone shell and four cover pillars must all be solid');
assert.equal(arenaManifest.coverage.excluded.effect.meshes, 2, 'Arena fire and boundary ring are effects');
arenaWorld.dispose();

await loadRaidWorldAssets();
for (let room = 0; room < 8; room++) save(createRaidScenery(room), `raid-${room}`, { room });
for (const map of INSTANT_COMBAT_MAPS) {
  const scene = await loadInstantCombatScenery(map.id), manifest = save(scene, `instant-${map.id}`);
  assert.equal(manifest.coverage.excluded.effect.meshes, map.id === 'bone-pit' ? 2 : 3, 'Only the fire and stars are nonphysical map effects');
}

writeFileSync(resolve(ROOT, 'public/collision/instances.json'), JSON.stringify({
  version: 1, entries,
  stateContract: {
    selection: 'Include an instance when state is absent, or (flags[state.key] ?? false) === state.value.',
    'object:<id>': 'Dungeon object activated; selects the exact open chest lid when true and closed lid when false.',
    'gate:<id>': 'dungeonGateOpen; selects the exact lowered gate when true and closed gate when false. Current room layouts have no gates.',
    'dungeon:traps': 'True in normal dungeons, including completed dungeons; false in dreams, whose renderer omits beds and spikes.',
    'spike:<id>:raised': 'True only outside dreams while dungeon is incomplete and dungeonSpikePhase(trap, serverNow).phase is active.',
    'spike:<id>:lowered': 'True only outside dreams when the corresponding raised flag is false.',
  },
  contexts: 'Dungeon keys include every room; dream variants reuse their dungeon key with traps disabled. Raid key is raid-<approach.roomIndex ?? 7>. Arena and Instant Combat use their map keys.',
}));
restore();
console.log(JSON.stringify({ scenes: entries.length, binaryBytes: entries.reduce((sum, entry) => sum + entry.binaryBytes, 0), seconds: Math.round((performance.now() - started) / 100) / 10 }));
