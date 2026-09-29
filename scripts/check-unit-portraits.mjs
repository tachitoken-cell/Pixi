import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeCharacter, animateCharacter, makeEnemy, animateEnemy, setCharacterRaces, setCharacterCustomization, setCharacterGear, setMonsterAssets } from '../src/characters.ts';
import { setTrainingDummyAssets, setTreasureAssets, setThemedMonsterAssets, setDungeonBossAssets } from '../src/monster-models.ts';
import { DUNGEON_BOSS_MODELS } from '../src/dungeon-boss-models.ts';
import { dungeonStages } from '../src/dungeon.ts';
import { setIdleAnimations } from '../src/idle-animation.ts';
import { createVillager, animateVillager } from '../src/village-models.ts';
import { DEFAULT_APPEARANCE, RACES, GENDERS } from '../src/appearance.ts';
import { GEAR, starterGear } from '../src/progression.ts';
import { MONSTERS } from '../src/bestiary.ts';

async function load(name) {
  const bytes = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}
const libraries = await Promise.all(['race-kit', 'customization-kit', 'gear-kit', 'monster-kit', 'idle-animations', 'village-kit', 'trainer-kit', 'city-kit', 'training-dummy', 'treasure-goblin', 'themed-monsters', 'legacy-dungeon-bosses'].map(load));
for (const [index, install] of [setCharacterRaces, setCharacterCustomization, setCharacterGear, setMonsterAssets, setIdleAnimations].entries()) install(libraries[index].scene, libraries[index].animations);
setTrainingDummyAssets(libraries[8].scene, libraries[8].animations);
setTreasureAssets(libraries[9].scene, libraries[9].animations);
setThemedMonsterAssets(libraries[10].scene, libraries[10].animations);
setDungeonBossAssets(libraries[11].scene, libraries[11].animations);
const pose = root => { const values = []; root.traverse(node => values.push([node.name, ...node.position, ...node.quaternion, ...node.scale, node.visible])); return JSON.stringify(values); };
const libraryPoses = libraries.map(asset => pose(asset.scene));
const shared = new Map(), instances = new Map();
function watch(root) {
  root.traverse(node => {
    if (!node.isMesh) return;
    for (const resource of [node.geometry, ...[].concat(node.material)]) if (!shared.has(resource)) {
      shared.set(resource, 0); resource.addEventListener('dispose', () => shared.set(resource, shared.get(resource) + 1));
    }
    if (node.isInstancedMesh && !instances.has(node)) {
      instances.set(node, 0); node.addEventListener('dispose', () => instances.set(node, instances.get(node) + 1));
    }
  });
}
libraries.forEach(asset => watch(asset.scene));

// Only the GPU and DOM are substituted. Models, animation and projection use the shipping assets.
const renderers = [], motion = { matches: false };
class Canvas extends EventTarget {
  width = 0; height = 0; listeners = new Set(); ownerDocument = { createElement: () => new Canvas() };
  context = { clears: 0, draws: 0, clearRect: () => { this.context.clears++; }, drawImage: (surface, ...size) => {
    assert.equal(surface, renderers[0].domElement); assert.deepEqual(size, [0, 0, 144, 144]);
    this.context.draws++; this.frame = renderers[0].last;
  } };
  getContext(type) { assert.equal(type, '2d'); return this.context; }
  addEventListener(type, listener) { super.addEventListener(type, listener); this.listeners.add(listener); }
  removeEventListener(type, listener) { super.removeEventListener(type, listener); this.listeners.delete(listener); }
  remove() { this.removed = true; }
}
class Renderer {
  shadowMap = {}; frames = 0; disposed = 0; lost = 0;
  constructor({ canvas }) { this.domElement = canvas; renderers.push(this); }
  setPixelRatio(value) { this.pixelRatio = value; }
  setSize(width, height) { this.size = [width, height]; }
  render(scene, camera) {
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    const rigs = scene.children.filter(node => node.isGroup);
    assert.equal(rigs.length, 1, 'only the current subject occupies the shared scene');
    watch(rigs[0]); this.frames++; this.last = { rig: rigs[0], camera };
  }
  dispose() { this.disposed++; }
  forceContextLoss() { this.lost++; }
}
const source = stripTypeScriptTypes(readFileSync(new URL('../src/unit-portraits.ts', import.meta.url), 'utf8'))
  .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
const create = vm.runInNewContext(`${source}\ncreateUnitPortraits`, {
  THREE: { ...THREE, WebGLRenderer: Renderer }, makeCharacter, animateCharacter, makeEnemy, animateEnemy, matchMedia: () => motion,
});
const canvases = { player: new Canvas(), target: new Canvas(), focus: new Canvas() }, portraits = create(canvases), renderer = renderers[0];
assert.equal(renderers.length, 1, 'three portraits share one WebGL context');
assert.equal(renderer.pixelRatio, 1); assert.deepEqual(renderer.size, [144, 144]); assert.equal(renderer.shadowMap.enabled, false);
let time = 0;
const draw = subjects => { portraits.update(subjects); portraits.render(time += .1); };
function assertFramed(frame, part, label) {
  const bounds = new THREE.Box3();
  part.traverseVisible(node => { if (node.isMesh) bounds.expandByObject(node); });
  assert(!bounds.isEmpty(), `${label} has visible authored geometry`);
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const point = new THREE.Vector3(x, y, z).project(frame.camera);
    assert(point.toArray().every(Number.isFinite) && Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && Math.abs(point.z) < 1,
      `${label} clips its head or silhouette: ${point.toArray()}`);
  }
  assert(bounds.getSize(new THREE.Vector3()).length() / (frame.camera.top * 2) > .35, `${label} is large enough to recognize`);
}
let player;
for (const race of RACES) for (const gender of GENDERS) for (const className of ['Ranger', 'Knight', 'Mage']) for (const helmet of [false, true]) {
  const equipment = starterGear(className).equipment;
  if (helmet) equipment.head = Object.values(GEAR).filter(item => item.slot === 'head' && (!item.className || item.className === className)).sort((a, b) => b.price - a.price)[0].id;
  player = { id: 'self', kind: 'player', appearance: { ...DEFAULT_APPEARANCE, race: race.id, gender: gender.id, className, hairStyle: helmet ? 'long' : 'mohawk' }, equipment };
  draw({ player });
  for (const offset of [0, .7, 2.1]) {
    portraits.render(time += offset + .1);
    const frame = canvases.player.frame; assertFramed(frame, frame.rig.userData.rig.head, `${race.id}/${gender.id}/${className}/${helmet}`);
  }
}
for (const enemyKind of Object.keys(MONSTERS)) {
  draw({ player, target: { id: enemyKind, kind: 'enemy', enemyKind } });
  for (let sample = 0; sample < 26; sample++) {
    portraits.render(time += .4); const frame = canvases.target.frame;
    const head = enemyKind === 'crystal-bat' ? undefined : frame.rig.getObjectByName(`${enemyKind}-head`) ?? frame.rig.userData.enemyRig?.head;
    assertFramed(frame, head ?? frame.rig, enemyKind);
  }
}
for (const { model, dungeonId, stageId } of DUNGEON_BOSS_MODELS) {
  const enemyKind = dungeonStages(dungeonId).find(stage => stage.id === stageId).enemies[0].kind;
  draw({ player, target: { id: 'same-encounter', kind: 'enemy', enemyKind } });
  const ordinary = canvases.target.frame.rig;
  draw({ player, target: { id: 'same-encounter', kind: 'enemy', enemyKind, model } });
  assert.notEqual(canvases.target.frame.rig, ordinary, 'visual identity participates in the portrait cache key');
  assert.equal(canvases.target.frame.rig.name, model, 'the portrait uses the authoritative variant, not its combat kind');
  for (let sample = 0; sample < 26; sample++) {
    portraits.render(time += .4); const frame = canvases.target.frame;
    assertFramed(frame, frame.rig.getObjectByName(`${model}-head`) ?? frame.rig, model);
  }
}
const roles = ['merchant', 'warden', 'healer', 'riding-trainer', 'mount-seller', 'ranger-trainer', 'knight-trainer', 'mage-trainer', 'auctioneer'];
for (const [index, role] of roles.entries()) {
  const npc = createVillager(libraries[index < 3 ? 5 : role === 'auctioneer' ? 7 : 6].scene, role);
  npc.position.set(100, 8, -500); npc.rotation.y = 2; animateVillager(npc, 4);
  const before = pose(npc), npcSubject = { id: role, kind: 'npc', source: npc };
  draw({ player, target: npcSubject, focus: npcSubject });
  assert.notEqual(canvases.target.frame.rig, npc); assert.notEqual(canvases.target.frame.rig, canvases.focus.frame.rig);
  for (const offset of [0, .8]) {
    portraits.render(time += offset + .1); const frame = canvases.target.frame;
    assertFramed(frame, frame.rig.getObjectByName(npc.userData.villagerIdle.head.name), role);
  }
  const rig = canvases.target.frame.rig;
  draw({ player: { ...player, hp: 4 }, target: { ...npcSubject }, focus: npcSubject });
  assert.equal(canvases.target.frame.rig, rig, 'circular world rig data never enters the cache signature');
  assert.equal(pose(npc), before, 'portrait construction and animation never move the world NPC');
}

draw({ player, target: { id: 'bat', kind: 'enemy', enemyKind: 'crystal-bat' }, focus: player });
const cached = canvases.player.frame.rig, cachedTarget = canvases.target.frame.rig;
draw({ player: { ...player, hp: 1 }, target: { id: 'bat', kind: 'enemy', enemyKind: 'crystal-bat', hp: 0 }, focus: player });
assert.equal(canvases.player.frame.rig, cached); assert.equal(canvases.target.frame.rig, cachedTarget);
assert.notEqual(canvases.player.frame.rig, canvases.focus.frame.rig, 'each portrait owns its pose and instance buffers');
const beforeFrames = renderer.frames;
portraits.render(time + .01); portraits.render(time + .06); assert.equal(renderer.frames, beforeFrames, 'updates run at most 15 FPS');
portraits.render(time += .07); assert.equal(renderer.frames, beforeFrames + 3);
const eyeStates = new Set(), playerPoses = new Set(), monsterPoses = new Set();
for (let step = 0; step < 110; step++) {
  portraits.render(time += .08);
  eyeStates.add(JSON.stringify([...cached.userData.rig.eyes.batch.instanceMatrix.array]));
  playerPoses.add(pose(cached)); monsterPoses.add(pose(cachedTarget));
}
assert(eyeStates.size > 1, 'live player eyes blink'); assert(playerPoses.size > 3 && monsterPoses.size > 3, 'authored player and monster idles remain live');
motion.matches = true; portraits.render(time += 1); const still = pose(cached); portraits.render(time += 1); assert.equal(pose(cached), still, 'reduced motion freezes idle poses'); motion.matches = false;
const event = new Event('webglcontextlost', { cancelable: true }); renderer.domElement.dispatchEvent(event);
assert(event.defaultPrevented); const lostFrames = renderer.frames; portraits.render(time += 1); assert.equal(renderer.frames, lostFrames);
renderer.domElement.dispatchEvent(new Event('webglcontextrestored')); portraits.render(time += 1); assert.equal(renderer.frames, lostFrames + 3);

// A source character is also a valid NPC fallback, including independent procedural instance buffers.
const npcCharacter = makeCharacter(DEFAULT_APPEARANCE), original = pose(npcCharacter);
draw({ target: { id: 'rowan', kind: 'npc', source: npcCharacter } });
const npcCopy = canvases.target.frame.rig;
assert.equal(pose(npcCharacter), original); assertFramed(canvases.target.frame, npcCopy.getObjectByName('head'), 'character NPC fallback');
npcCopy.traverse(node => {
  if (node.isInstancedMesh) assert.notEqual(node.instanceMatrix.array, npcCharacter.getObjectByName(node.parent.name)?.children.find(child => child.isInstancedMesh)?.instanceMatrix.array);
});
portraits.clear(); const clearedFrames = renderer.frames; portraits.render(time += 1); assert.equal(renderer.frames, clearedFrames);
draw({ player }); portraits.dispose(); portraits.dispose();
assert.equal(renderer.disposed, 1); assert.equal(renderer.lost, 1); assert(renderer.domElement.removed && renderer.domElement.listeners.size === 0);
const disposedFrames = renderer.frames; portraits.update({ player }); portraits.render(time += 1); assert.equal(renderer.frames, disposedFrames);
assert([...shared.values()].every(count => count === 0), 'portrait disposal leaves every shared mesh geometry/material intact');
assert([...instances.values()].every(count => count === 1), 'every rendered portrait instance buffer is released exactly once');
assert.deepEqual(libraries.map(asset => pose(asset.scene)), libraryPoses, 'the Blender source transforms remain untouched');
console.log(`Unit portraits checked: all ${RACES.length * GENDERS.length} race/gender bodies across classes and helmets, all ${Object.keys(MONSTERS).length} monsters and 8 dungeon boss variants, all ${roles.length} NPC roles, head framing, live blink/idles, one 15 FPS context, caching and isolated cleanup.`);
