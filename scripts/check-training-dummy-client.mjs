import { isInstantCombatInstance } from '../src/instant-combat.ts';
import { instantCombatMap } from '../src/instant-combat-maps.ts';
import { isRaidInstance, RAID_BOUNDS } from '../src/raid.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeEnemy, animateEnemy } from '../src/characters.ts';
import { setTrainingDummyAssets, playMonsterHit } from '../src/monster-models.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { chooseTarget, isHostilePlayer, isHostileTarget, combatCompanionOwner } from '../src/targeting.ts';
import { SPELLS, abilityValid, abilityUnlocked, legacyAbility, spellCastTimeMs, GLOBAL_ATTACK_MS } from '../src/spells.ts';
import { AUTO_ATTACKS } from '../src/auto-attacks.ts';
import { combatStats, starterGear } from '../src/progression.ts';
import { ARENA_BOUNDS, ARENA_COLLIDERS, isArenaInstance } from '../src/arena.ts';
import { canTraverse } from '../src/realm.ts';

const bytes = readFileSync(new URL('../public/models/training-dummy.glb', import.meta.url));
const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
assert.throws(() => setTrainingDummyAssets(new THREE.Group(), []), /Missing training dummy/);
setTrainingDummyAssets(asset.scene, asset.animations);
const clip = asset.animations.find(clip => clip.name === 'training-dummy-hit');
assert(clip.duration >= .7 && clip.duration <= 1.1, 'authored recoil is short enough for repeated attacks');
const pose = model => { const parts = []; model.traverse(node => parts.push([...node.position, ...node.quaternion, ...node.scale])); return parts; };
const closePose = (a, b) => a.every((part, i) => part.every((value, j) => Math.abs(value - b[i][j]) < 1e-5));
const dummy = makeEnemy('training-dummy'), twin = makeEnemy('training-dummy');
const rest = pose(dummy), twinRest = pose(twin), sourceRest = pose(asset.scene);
const bounds = new THREE.Box3().setFromObject(dummy);
assert(bounds.min.y >= -.05 && bounds.max.y > 2 && bounds.max.y < 3.5, 'dummy stands at player scale above ground');
assert(bounds.getSize(new THREE.Vector3()).x < 2.5, 'training dummy fits beside city paths');
assert(bytes.length < 2_000_000, 'detailed shared model stays a small download');
let draws = 0;
dummy.traverse(node => { if (node.isMesh) { draws++; const source = asset.scene.getObjectByName(node.name); assert.equal(node.geometry, source.geometry); assert.equal(node.material, source.material); } });
assert(draws <= 8, 'detail is batched into a few draws');
for (const time of [0, 1, 25]) {
 animateEnemy(dummy, time, true, {style:'slam', progress:.5, impactProgress:.5}, .5);
 assert.deepEqual(pose(dummy), rest, 'idle dummies never walk, attack or collapse');
}
playMonsterHit(dummy, 10);
animateEnemy(dummy, 10, false); const clipRest = pose(dummy);
animateEnemy(dummy, 10.12, false); const struck = pose(dummy);
assert(!closePose(struck, clipRest), 'real exported clip visibly recoils on a hit');
assert(!dummy.getObjectByName('training-dummy-body').quaternion.equals(twin.getObjectByName('training-dummy-body').quaternion), 'body pivot visibly moves');
animateEnemy(dummy, 10.12, false); assert.deepEqual(pose(dummy), struck, 'repeated animation samples hold their authored transforms');
playMonsterHit(dummy, 10.15); animateEnemy(dummy, 10.27, false);
assert(closePose(pose(dummy), struck), 'rapid repeat hits restart the same recoil');
for (let i = 0; i <= 30; i++) {
 animateEnemy(dummy, 10.15 + clip.duration * i / 30, false);
 dummy.updateMatrixWorld(true); dummy.traverse(node => assert(node.matrixWorld.elements.every(Number.isFinite)));
}
assert(closePose(pose(dummy), rest), 'recoil returns to original rest without drift');
assert.deepEqual(pose(twin), twinRest, 'city clones animate independently');
assert.deepEqual(pose(asset.scene), sourceRest, 'playing impacts never mutates the imported source');

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('main.ts', main, ts.ScriptTarget.Latest, true);
const functions = names => names.map(name => tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(tree)).join('\n');
const sent = [], displayed = [];
const enemy = {id:'training-greenwood', kind:'training-dummy', name:'Training dummy', x:2, z:0, hp:1, maxHp:100000, alive:true, instanceId:'arena-test'};
const context = {storyWorld: undefined, visibleInDungeonRoom:()=>true,MONSTERS, SPELLS, abilityValid, abilityUnlocked, legacyAbility, spellCastTimeMs, combatStats, GLOBAL_ATTACK_MS, chooseTarget, isHostilePlayer,isHostileTarget,combatCompanionOwner, keys:new Set(), AUTO_ATTACKS,
 player:{hp:100, level:1, appearance:{className:'Mage'}, talents:[], ...starterGear('Mage')}, appearance:{className:'Mage'}, playerId:'hero', position:{x:0,z:0}, players:[], enemies:[enemy], nodes:[], loot:[],
 worldInstance:'arena-test', usesArenaWorld:isArenaInstance, isInstantCombatInstance, instantCombatMap, instantCombat:null, isRaidInstance,RAID_BOUNDS,isArenaInstance, ARENA_BOUNDS, canTraverse, colliders:ARENA_COLLIDERS, worldZone:'greenwood', connected:true, worldReady:true, entryActive:false, rosterActive:false,
 selectedId:enemy.id, hoveredId:null, autoAttackTarget:null, lastAutoAttackRequest:-Infinity, performance:{now:()=>10000}, Date:{now:()=>10000},
 serverOffset:0, lastPrimary:-Infinity, cancelledCast:0, jump:{grounded:true,y:0}, jumpFloor:()=>0, waterAt:()=>false, isMoving:false, modalOpen:()=>false, toast:message=>assert.fail(message),
 standUp(){}, cancelGathering(){}, send:message=>sent.push(message), hotbar:{predictCast(){}}, rotation:0, lastMove:0,
 damageNumbers:{play:event=>displayed.push(event)}, gameAudio:{play(){}}, elapsed:20, enemyMeshes:new Map([[enemy.id,{mesh:dummy}]]), playMonsterHit,
};
runInNewContext(stripTypeScriptTypes(functions(['currentWorldBounds','localSwimming','targetPoints','act','setAutoAttack','autoAttackSelectionValid','reconcileAutoAttack'])), context);
const point = context.targetPoints().find(point => point.id === enemy.id);
assert.equal(point.kind, 'enemy'); assert.equal(point.name, enemy.name);
context.act('fireball');
assert.equal(sent.at(-1).type, 'attack'); assert.equal(sent.at(-1).targetId, enemy.id, '1 HP dummy accepts normal targeted spell input');
context.setAutoAttack(enemy.id); context.reconcileAutoAttack();
assert.equal(sent.at(-1).type, 'autoAttack'); assert.equal(context.autoAttackTarget, enemy.id, '1 HP dummy remains a living auto-attack target');
let damageBranch;
const visit = node => { if (ts.isIfStatement(node) && node.expression.getText(tree) === "msg.type==='damage'") damageBranch = node.thenStatement; ts.forEachChild(node, visit); }; visit(tree);
context.msg = {type:'damage', targetId:enemy.id, targetKind:'enemy', amount:287, x:2, z:0};
runInNewContext(stripTypeScriptTypes(damageBranch.getText(tree)), context);
animateEnemy(dummy, 20.12, false);
assert(!closePose(pose(dummy), rest), 'actual damage message triggers recoil while server HP remains 1');
assert.equal(displayed[0].amount, 287, 'damage numbers retain full training hit damage');
context.elapsed = 21; runInNewContext(stripTypeScriptTypes(damageBranch.getText(tree)), context); animateEnemy(dummy, 21.12, false);
assert(closePose(pose(dummy), struck), 'later damage at unchanged HP retriggers recoil');
console.log(`PASS: detailed Blender dummy (${draws} draws), authored recoil/recovery, isolated clones, static idle, real targeting/spell/auto input and repeat damage impacts at 1 HP.`);
