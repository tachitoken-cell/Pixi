import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DUNGEON_BOSS_MODELS, DUNGEON_BOSS_MODEL_KINDS } from '../src/dungeon-boss-models.ts';
import { setDungeonBossAssets, setMonsterAssets, createMonsterModel, animateMonsterModel } from '../src/monster-models.ts';
import { makeEnemy } from '../src/characters.ts';
import { makeLootRemains } from '../src/loot.ts';
import { dungeonStages } from '../src/dungeon.ts';

const load = async name => {
  const bytes = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
  return { bytes, ...await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '') };
};
const asset = await load('legacy-dungeon-bosses');
assert(asset.bytes.length < 4_000_000, 'eight articulated bosses stay within a bounded shared asset pack');
assert(statSync(new URL('../assets/source/legacy-dungeon-bosses.blend', import.meta.url)).size > 10_000, 'editable Blender source is included');
assert.equal(new Set(DUNGEON_BOSS_MODEL_KINDS).size, 8);
assert.equal(asset.animations.length, 40, 'eight distinct models each have five authored clips');
assert.throws(() => setDungeonBossAssets(asset.scene, asset.animations.filter(clip => !clip.name.endsWith('-death'))), /Missing.*death.*clip/);
setDungeonBossAssets(asset.scene, asset.animations);
const originals = await load('monster-kit'); setMonsterAssets(originals.scene, originals.animations);
const pose = group => { const result = []; group.traverse(node => result.push([node.name, ...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()])); return result; };
const equalPose = (a, b) => a.length === b.length && a.every((row, i) => row.every((v, j) => typeof v === 'string' ? v === b[i][j] : Math.abs(v - b[i][j]) < 1e-5));
const finite = group => { group.updateMatrixWorld(true); group.traverse(node => assert(node.matrixWorld.elements.every(Number.isFinite), 'all animated transforms remain finite')); };
const shared = new Set(); asset.scene.traverse(mesh => { if (mesh.isMesh) { shared.add(mesh.geometry); shared.add(mesh.material); } });
const libraryPose = pose(asset.scene);
let trianglesTotal = 0;
for (const entry of DUNGEON_BOSS_MODELS) {
  const kind = entry.model, model = createMonsterModel(kind), twin = createMonsterModel(kind);
  const root = asset.scene.getObjectByName(kind), rest = pose(twin);
  assert(root?.getObjectByName(`${kind}-body`), `${kind}: authored named body survives export`);
  assert.equal(root.userData.theme, entry.dungeonId);
  let triangles = 0, draws = 0;
  model.traverse(mesh => { if (mesh.isMesh) { draws++; triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3; assert(shared.has(mesh.geometry) && shared.has(mesh.material), 'instances retain shared source geometry/materials'); } });
  assert(draws <= 45 && triangles >= 1000 && triangles <= 15_000, `${kind}: useful detail with bounded draw/triangle counts (${draws}/${triangles})`);
  const bounds = new THREE.Box3().setFromObject(model);
  assert(bounds.min.y >= -.04 && bounds.max.y < 7 && bounds.max.y > 2, `${kind}: ground origin and readable boss height`);
  for (const suffix of ['idle', 'walk', 'auto', 'attack', 'death']) {
    const clip = asset.animations.find(clip => clip.name === `${kind}-${suffix}`);
    assert(clip?.tracks.length >= 6, `${kind}: articulated ${suffix} animation`);
    assert(clip.tracks.every(track => [...track.values].every(Number.isFinite)));
  }
  model.position.set(7, 0, -4);
  for (const moving of [false, true]) {
    animateMonsterModel(model, 0, moving); const start = pose(model);
    animateMonsterModel(model, .23, moving); assert(!equalPose(start, pose(model)), `${kind}: authored ${moving ? 'walk' : 'idle'} motion`);
    animateMonsterModel(model, 1e6, moving); finite(model);
  }
  let special;
  for (const basic of [false, true]) {
    let canonicalContact;
    for (const impactProgress of [.2, .5, .8]) {
      animateMonsterModel(model, 0, false, {style: 'slam', basic, progress: 0, impactProgress}); const start = pose(model);
      for (const progress of [0, .1, impactProgress, .9, 1]) {
        animateMonsterModel(model, 0, false, {style: 'slam', basic, progress, impactProgress}); finite(model);
        assert(new THREE.Box3().setFromObject(model).min.y >= -.045, `${kind}: contact remains grounded`);
        if (progress === impactProgress) {
          const contact = pose(model); assert(!equalPose(start, contact), `${kind}: distinct contact pose`);
          animateMonsterModel(model, 0, false, {style: 'slam', basic, progress, impactProgress}); assert.deepEqual(pose(model), contact, 'repeated sampling does not accumulate transforms');
          if (canonicalContact) assert(equalPose(canonicalContact, contact), 'contact stays aligned across different server windup fractions');
          canonicalContact = contact;
        }
        if (progress === 1) assert(equalPose(start, pose(model)), `${kind}: full attack recovery`);
      }
    }
    if (basic) assert(!equalPose(canonicalContact, special), `${kind}: separate auto and special contact`);
    else special = canonicalContact;
  }
  animateMonsterModel(model, .23, true); animateMonsterModel(twin, .23, true);
  assert(equalPose(pose(model).slice(1), pose(twin).slice(1)), 'attack cancellation restores locomotion');
  for (let sample = 0; sample <= 20; sample++) {
    animateMonsterModel(model, 0, false, undefined, sample / 20); finite(model);
    assert(new THREE.Box3().setFromObject(model).min.y >= -.045, `${kind}: death stays above the floor`);
  }
  assert(Math.abs(new THREE.Box3().setFromObject(model).min.y) < .04, `${kind}: settled corpse touches floor`);
  const baseKind = dungeonStages(entry.dungeonId).find(stage => stage.id === entry.stageId).enemies[0].kind;
  const remains = makeLootRemains(baseKind, false, kind), fallen = remains.getObjectByName(`fallen-${kind}`);
  assert(fallen?.getObjectByName(`${kind}-body`), `${kind}: corpse retains the exact boss appearance`);
  const corpsePose = pose(fallen); animateMonsterModel(fallen, 10, true, {style: 'slam', progress: .5, impactProgress: .5});
  assert.deepEqual(pose(fallen), corpsePose, 'loot remains stay frozen');
  const ordinary = makeEnemy(baseKind); assert(!ordinary.getObjectByName(`${kind}-body`), 'regular and overworld monsters keep their existing appearance');
  assert.deepEqual(model.position.toArray(), [7, 0, -4], 'animation never moves the authoritative root');
  assert.deepEqual(pose(createMonsterModel(kind)), rest, 'instances never mutate source rest transforms');
  trianglesTotal += triangles;
  console.log(`ASSET ${kind}: ${draws} draws, ${Math.round(triangles)} triangles, ${bounds.max.y.toFixed(2)}m tall`);
}
assert.deepEqual(pose(asset.scene), libraryPose, 'shared Blender library remains untouched');
console.log(`PASS: 8 legacy dungeon boss models, 40 authored clips, ${trianglesTotal} triangles, ${(asset.bytes.length / 1e6).toFixed(2)} MB; synchronized contacts, locomotion, recovery, grounded deaths, matching corpses and unchanged ordinary models.`);
