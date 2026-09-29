import { isRaidInstance, RAID_BOUNDS } from '../src/raid.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { setMonsterAssets, MONSTER_MODEL_KINDS } from '../src/monster-models.ts';
import { createCombatCompanions } from '../src/combat-companion-models.ts';
import { renderCombatCompanion } from '../src/pet-ui.ts';
import { SPELLS, abilityValid, abilityUnlocked, legacyAbility, spellCastTimeMs, GLOBAL_ATTACK_MS } from '../src/spells.ts';
import { tameableKind, combatCompanionStats } from '../src/combat-companions.ts';
import { chooseTarget, isHostilePlayer, isHostileTarget, combatCompanionOwner } from '../src/targeting.ts';
import { COLOSSEUM } from '../src/colosseum.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { ROOTVAULT_GUARDIAN } from '../src/dungeon.ts';
import { isArenaInstance } from '../src/arena.ts';
import { isInstantCombatInstance } from '../src/instant-combat.ts';
import { canTraverse, WORLD_BOUNDS } from '../src/realm.ts';
import { combatStats } from '../src/progression.ts';

const bytes = readFileSync(new URL('../public/models/monster-kit.glb', import.meta.url));
const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
setMonsterAssets(asset.scene, asset.animations);
const scene = new THREE.Scene(), terrain = (x, z) => .1 * x + .03 * z;
const companions = createCombatCompanions(scene, terrain);
const state = { kind: 'bramble-wolf', level: 12, hp: 100, maxHp: 120, x: 0, z: 0, rotation: 0, attackUntil: 0, targetId: null, bondReady: false };
const owner = { id: 'local', combatCompanion: state };
companions.update([owner], .016, 0, 1000);
const wolf = companions.get('local');
assert.equal(companions.size, 1);
companions.update([{ ...owner, combatCompanion: { ...state, x: 8, z: 3, rotation: 1 } }], .016, 1, 1000);
assert(wolf.position.x > 0 && wolf.position.x < 8, 'snapshots interpolate the actual combat position');
assert.equal(wolf.position.y, terrain(wolf.position.x, wolf.position.z));
companions.update([{ ...owner, combatCompanion: { ...state, hp: 80, attackUntil: 1500 } }], .016, 2, 1200);
companions.update([{ ...owner, combatCompanion: { ...state, hp: 80, attackUntil: 1500 } }], .016, 2.05, 1250);
assert.notEqual(wolf.rotation.z, 0, 'a health drop gives visible hit recoil');
wolf.traverse(node => { node.updateMatrixWorld(); assert(node.matrixWorld.elements.every(Number.isFinite)); });
companions.update([{ ...owner, combatCompanion: { ...state, x: 100 } }], .016, 3, 1600);
assert.equal(wolf.position.x, 100, 'teleport catches the companion up immediately');
companions.update([{ ...owner, combatCompanion: { ...state, kind: 'moss-slime' } }, { ...owner, id: 'remote' }], .016, 4, 2000);
assert.equal(wolf.parent, null, 'changing species removes the previous rig');
assert.equal(companions.size, 2, 'cosmetics are independent from local and remote combat companions');
companions.update([{ ...owner, combatCompanion: { ...state, hp: 0 } }], .016, 5, 2200);
assert.equal(companions.size, 0, 'defeated or departed companions leave no ghost model');
let disposed = 0;
asset.scene.traverse(node => { if (node.isMesh) node.geometry.addEventListener('dispose', () => disposed++); });
for (const kind of [...MONSTER_MODEL_KINDS, 'moss-slime', 'ice-wisp', 'briar-sentinel', 'root-warden']) {
  companions.update([{ ...owner, combatCompanion: { ...state, kind } }], .016, 0, 1000);
  const bounds = new THREE.Box3().setFromObject(companions.get('local')), size = bounds.getSize(new THREE.Vector3());
  assert(size.y <= 1.7 && size.x <= 2.5 && size.z <= 2.5, `${kind} stays readable at companion scale`);
}
companions.clear();
assert.equal(scene.children.length, 0);
assert.equal(disposed, 0, 'cleanup preserves shared monster assets');

const player = { hp: 100, zeppelin: null, appearance: { className: 'Ranger' }, talents: ['ranger-beastmaster'], tamedCompanion: { kind: state.kind, level: state.level, hp: state.hp }, combatCompanion: state };
const active = renderCombatCompanion(player, true, 1000);
assert.match(active, /<meter[^>]*max="120"[^>]*value="100"[^>]*aria-label="Bramble wolf health"/);
assert.match(active, /data-combat-companion="dismiss"[^>]*>Dismiss companion/);
assert.match(active, /World bosses and dungeon bosses cannot be tamed/);
assert.match(renderCombatCompanion({ ...player, combatCompanion: { ...state, bondReady: true } }, true, 1000), /Everlasting Bond ready/);
assert.match(renderCombatCompanion({ ...player, combatCompanionRecallAt: 5000 }, true, 1000), /data-combat-companion="dismiss"[^>]*disabled/, 'combat also blocks dismissing to avoid incoming attacks');
const resting = { ...player, combatCompanion: null };
assert.match(renderCombatCompanion(resting, true, 1000), /data-combat-companion="recall"[^>]*>Recall companion/);
assert.match(renderCombatCompanion({ ...resting, tamedCompanion: { ...resting.tamedCompanion, hp: 0 } }, true, 1000), /Revive &amp; recall companion/);
for (const blocked of [{ ...resting, combatCompanionRecallAt: 5000 }, { ...resting, hp: 0 }, { ...resting, travel: { mount: 'horse' } }, { ...resting, talents: [] }]) {
  assert.match(renderCombatCompanion(blocked, true, 1000), /data-combat-companion="recall"[^>]*disabled/);
}
assert.match(renderCombatCompanion(resting, false, 1000), /data-combat-companion="recall"[^>]*disabled/);
assert.equal(renderCombatCompanion({ hp: 100 }, true), '');
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
assert.match(main, /Double Tap ready · Instant/);
assert.match(main, /Arrowstorm .*arrowstormStacks/);
const act = stripTypeScriptTypes(main.slice(main.indexOf('function act('), main.indexOf('let characterView:', main.indexOf('function act('))));
function cast(ability, target = {}, companion = state, selectedId = 'creature', owners = []) {
  const sent = [], notices = [];
  const enemy = { id: 'creature', kind: 'bramble-wolf', level: 12, hp: 100, alive: true, x: 3, z: 0, ...target };
  const ctx = { ROOTVAULT_GUARDIAN, SPELLS, abilityValid, abilityUnlocked, legacyAbility, spellCastTimeMs, combatStats, GLOBAL_ATTACK_MS, tameableKind, combatCompanionStats, chooseTarget, isHostilePlayer,isHostileTarget,combatCompanionOwner,
    isRaidInstance,RAID_BOUNDS,isArenaInstance,isInstantCombatInstance, canTraverse, WORLD_BOUNDS, colliders: [],
    player: { ...player, id: 'hunter', pvp: true, level: 20, equipment: {}, learnedSpells: ['arrow'], combatCompanion: companion, talents: ['ranger-beastmaster', 'ranger-pathfinder-6'] }, appearance: player.appearance,
    connected: true, worldReady: true, worldInstance: null, worldZone: 'greenwood', position: { x: owners.length ? COLOSSEUM.x : 0, z: 0 }, enemies: enemy.id.startsWith('companion:') ? [] : [enemy], players: owners,
    selectedId, hoveredId: null, rotation: 0, lastPrimary: -Infinity, lastMove: 0, serverOffset: 0, cancelledCast: 0, jump: { grounded: true, y: 0 }, jumpFloor: () => 0, isMoving: false,
    Date: { now: () => 1000 }, performance: { now: () => 1000 }, modalOpen: () => false, waterAt: () => false,
    standUp() {}, cancelGathering() {}, hotbar: { predictCast() {} }, toast: text => notices.push(text), send: message => sent.push(message),
    setAutoAttack: targetId => sent.push({ type: 'autoAttack', targetId }), targetPoints: () => [{ ...enemy, kind: enemy.id.startsWith('companion:') ? 'companion' : 'enemy' }],
  };
  runInNewContext(`${main.match(/^function currentWorldBounds.*$/m)[0]}\n${main.match(/^function localSwimming.*$/m)[0]}\n${act}\nact('${ability}');`, ctx);
  return { sent, notices };
}
const tame = cast('tame-beast');
assert.equal(tame.sent[0].type, 'autoAttack'); assert.equal(tame.sent[0].targetId, null, 'taming stops auto attacks before casting');
assert.equal(tame.sent.at(-1).ability, 'tame-beast'); assert.equal(tame.sent.at(-1).targetId, 'creature');
for (const target of [{ level: 21 }, { worldBoss: true }, { dungeonBoss: true }, { id: ROOTVAULT_GUARDIAN.id, kind: 'root-warden' }, { kind: 'training-dummy' }, { alive: false }]) {
  const result = cast('tame-beast', target, state, target.id ?? 'creature'); assert.equal(result.sent.length, 0); assert(result.notices.length, 'invalid creature gets useful feedback');
}
assert.equal(cast('tame-beast', {}, state, null).sent.length, 0, 'taming requires an explicit creature target');
for (const companion of [null, { ...state, hp: 0 }]) {
  const rejected = cast('combined-assault', {}, companion);
  assert.equal(rejected.sent.length, 0, 'Combined Assault requires a living companion');
  assert.match(rejected.notices.at(-1), /living combat companion/);
}
for (const petX of [0, 9.99]) {
  const rejected = cast('combined-assault', { x: 12 }, { ...state, x: petX });
  assert.equal(rejected.sent.length, 0, 'Combined Assault does not command a companion outside melee range');
  assert.match(rejected.notices.at(-1), /companion must be in melee range/);
}
const rangedAssault = cast('combined-assault', { x: 12 }, { ...state, x: 10 });
assert.equal(rangedAssault.sent.at(-1)?.ability, 'combined-assault', 'Combined Assault accepts a pet exactly within two metres while the hunter stays at bow range');
assert.equal(rangedAssault.sent.at(-1).targetId, 'creature');
assert.equal(rangedAssault.sent.find(message => message.type === 'move').x, 0, 'issuing the command never moves the hunter toward melee');
const bowRange = SPELLS['combined-assault'].range;
assert.equal(cast('combined-assault', { x: bowRange }, { ...state, x: bowRange - 1 }).sent.at(-1)?.ability, 'combined-assault', 'the hunter can shoot at the spell range boundary');
const tooFar = cast('combined-assault', { x: bowRange + .01 }, { ...state, x: bowRange - 1 });
assert.equal(tooFar.sent.length, 0, 'an adjacent companion does not extend hunter bow range');
assert.match(tooFar.notices.at(-1), /Move closer/);
assert.equal(cast('combined-assault', {}, { ...state, x: 2 }).sent.at(-1)?.ability, 'combined-assault');
const opponent = { id: 'other', name: 'Other', hp: 100, pvp: true, x: COLOSSEUM.x, z: 0, combatCompanion: { ...state, x: COLOSSEUM.x + 3 } };
const petTarget = { id: 'companion:other', x: COLOSSEUM.x + 3 };
assert.equal(cast('arrow', petTarget, state, petTarget.id, [opponent]).sent.at(-1).targetId, petTarget.id, 'a hostile spell targets the pet, not its owner');
assert.equal(cast('arrow', petTarget, state, petTarget.id, [{ ...opponent, pvp: false }]).sent.length, 0, 'friendly pets cannot be damaged or redirect to another foe');
assert.equal(cast('tame-beast', petTarget, state, petTarget.id, [opponent]).sent.length, 0, 'another hunter’s pet cannot be tamed');
const sandOwner = { ...opponent, x: COLOSSEUM.x, z: COLOSSEUM.z, combatCompanion: { ...state, x: COLOSSEUM.x, z: COLOSSEUM.z } };
const sandAttacker = { id: 'attacker', hp: 100, pvp: true };
assert(isHostileTarget(sandAttacker, { id: petTarget.id, kind: 'companion' }, [sandOwner]));
sandOwner.combatCompanion.x += COLOSSEUM.radius + 1;
assert(!isHostileTarget(sandAttacker, { id: petTarget.id, kind: 'companion' }, [sandOwner]), 'the sand-ring boundary protects a pet even when its owner remains inside');
const targetCamera = new THREE.PerspectiveCamera(50, 1, .1, 100);
targetCamera.position.set(0, 0, 10); targetCamera.lookAt(0, 0, 0); targetCamera.updateMatrixWorld();
const petMesh = new THREE.Group(); petMesh.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2))); petMesh.updateMatrixWorld();
const match = { instanceId: 'arena-pet-test', arenaMatchId: 'pet-test', arenaPhase: 'active' };
const worldOwner = { ...opponent, ...match, arenaTeam: 1, combatCompanion: { ...state, x: 0, z: 0 } };
const targeting = { storyWorld: null, THREE, MONSTERS, combatCompanionOwner, isHostilePlayer, isHostileTarget, chooseTarget,
  player: { id: 'hunter', hp: 100, ...match, arenaTeam: 0 }, players: [worldOwner], worldInstance: match.instanceId,
  isRaidInstance,RAID_BOUNDS,isArenaInstance: () => true, usesArenaWorld: id => isArenaInstance(id) || isInstantCombatInstance(id), visibleInDungeonRoom: () => true, nodes: [], enemies: [], loot: [], lootMeshes: new Map(),
  position: { x: 0, z: 0 }, remote: new Map(), mountViews: new Map(),
  canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }) },
  camera: targetCamera, raycaster: new THREE.Raycaster(), pickTerrain: () => undefined, innerWidth: 400, innerHeight: 400,
  combatCompanions: new Map([[worldOwner.id, petMesh]]),
};
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function targetPoints('), main.indexOf('function cancelGathering('))
  + main.slice(main.indexOf('function pickTarget('), main.indexOf('let lastTargetText='))), targeting);
assert.equal(targeting.pickTarget(200, 200)?.id, 'companion:other', 'the actual world raycast selects the companion mesh');
assert.equal(targeting.targetPoints().find(point => point.kind === 'companion').label, 'Attack Other’s companion');
worldOwner.combatCompanion.hp = 0;
assert(!targeting.targetPoints().some(point => point.kind === 'companion'), 'dead pets are removed from actual selectable targets');
worldOwner.combatCompanion.hp = 100; worldOwner.instanceId = 'other-instance';
assert(!targeting.targetPoints().some(point => point.kind === 'companion'), 'other-instance pets are removed from actual selectable targets');
console.log('PASS: companion movement, actual monster rigs, scale, attack/hit animation, cleanup, accessible health, recall gates, taming guidance, Combined Assault living-pet/melee/bow-range boundaries, owner-based hostility and actual world raycast targeting.');
