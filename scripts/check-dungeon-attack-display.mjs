import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { dungeonHazardAttack, dungeonHazardPattern, dungeonDeathHazardPattern, dungeonHazardContains } from '../src/dungeon-mechanics.ts';
import { enemyAttackPhase } from '../src/monster-models.ts';
import { createMonsterEffects } from '../src/monster-effects.ts';
import { canTraverse } from '../src/realm.ts';
import { dungeonBounds, dungeonLayout, dungeonColliders, inDungeonPreparation } from '../src/dungeon.ts';
import { DEATH_ANIMATION_MS } from '../src/shared.ts';

const hazard = { id: 'warning', sourceId: 'guardian', x: 0, z: 17, r: 3, kind: 'roots', startedAt: 10000, endsAt: 11800, damage: 20 };
for (const kind of ['roots', 'fire', 'frost', 'shadow']) {
  const attack = dungeonHazardAttack({ ...hazard, kind });
  assert.equal(attack.impactAt, hazard.endsAt); assert.equal(attack.endsAt, hazard.endsAt + 450);
  assert.equal(attack.dungeonHazard, true);
  const duration = attack.endsAt - attack.startedAt, impactProgress = (attack.impactAt - attack.startedAt) / duration;
  assert.equal(enemyAttackPhase({ style: attack.style, progress: impactProgress, impactProgress }), .5, 'authored contact matches authoritative impact');
  assert.equal(enemyAttackPhase({ style: attack.style, progress: 1, impactProgress }), 1, 'the complete recovery is retained');
}
assert.equal(dungeonHazardAttack(hazard, { x: 0, z: 12, rotation: .8 }).rotation, 0);
assert.equal(dungeonHazardAttack(hazard, { x: 0, z: 17, rotation: .8 }).rotation, .8, 'source-centered casts and completed leaps retain their facing');

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const cueStart = main.indexOf(' for(const hazard of dungeon?.hazards??[])');
const cueEnd = main.indexOf(' const mapTarget=', cueStart);
assert(cueStart > 0 && cueEnd > cueStart);
const updateCues = runInNewContext(`(function(dungeonAttackCues,dungeon,enemies,worldInstance,monsterNow){${stripTypeScriptTypes(main.slice(cueStart,cueEnd))};return dungeonEffects;})`, { dungeonHazardAttack, dungeonDeathHazardPattern });
const cues = new Map(), enemy = { id: hazard.sourceId, kind: 'briar-sentinel', alive: true, x: 0, z: 12, instanceId: 'run', rotation: .2 };
assert.equal(updateCues(cues, { hazards: [hazard] }, [enemy], 'run', 11000).length, 1);
assert.equal(updateCues(cues, { hazards: [] }, [enemy], 'run', 11799).length, 0, 'an interrupted warning cancels before impact');
updateCues(cues, { hazards: [hazard] }, [enemy], 'run', 11000);
assert.equal(updateCues(cues, { hazards: [] }, [enemy], 'run', 11900).length, 1, 'a resolved warning retains its contact effect');
assert.equal(updateCues(cues, {kind:'rootvault', hazards: []}, [{...enemy,alive:false}], 'run', 11900).length, 0, 'late source death cancels its synthetic blast');
const corpse={...hazard,kind:'fire'};
assert.equal(updateCues(cues, {kind:'cindercrypt',hazards:[corpse]}, [{...enemy,kind:'ember-beetle',alive:false}], 'run', 11900).length, 1, 'intentional beetle corpse blasts survive source death');
assert.equal(updateCues(cues, { hazards: [] }, [], 'run', 11900).length, 0, 'retired sources cannot produce scene effects');
assert.equal(updateCues(cues, { hazards: [] }, [enemy], 'run', 12251).length, 0, 'recovery retires on time');
updateCues(cues, { hazards: [hazard] }, [enemy], 'run', 11000);
assert.equal(updateCues(cues, null, [enemy], null, 11000).length, 0, 'leaving the instance clears cues');

const scene = new THREE.Scene(), effects = createMonsterEffects(scene, () => 0), attack = dungeonHazardAttack(hazard, enemy);
effects.update([{ ...enemy, attack }], 11000);
const group = scene.getObjectByName('Monster attack warnings');
assert.equal(group.children.length, 1);
assert.equal(group.getObjectByName('impact-warning').visible, false, 'the dungeon world owns the warning ring');
assert.equal(group.getObjectByName('impact-area').visible, false, 'a second full disk cannot obscure a frost safe center');
effects.update([{ ...enemy, attack: { ...attack, dungeonHazard: undefined } }], 11000);
assert.equal(group.getObjectByName('impact-warning').visible, true, 'ordinary dungeon specials keep their warning');
effects.update([], 11001); assert.equal(group.children.length, 0, 'cancellation releases the effect entry');
effects.dispose(); assert.equal(scene.children.length, 0, 'effect disposal releases its scene group');

// Replay the actual preview button and impact loop with a wall between source and mark.
const preview = readFileSync(new URL('../src/dungeon-preview.ts', import.meta.url), 'utf8');
const buttonStart = preview.indexOf('  mechanicButton.onclick=()=>{'), buttonEnd = preview.indexOf('\n\n  Object.assign(window', buttonStart);
const resolveStart = preview.indexOf('    for(const demo of demonstrations)if('), resolveEnd = preview.indexOf('    if(demonstrations.length', resolveStart);
const poseStart = preview.indexOf('    for (const enemy of enemies) if (enemy.mesh.visible)'), poseEnd = preview.indexOf('    controls.update(); desiredCamera', poseStart);
assert(buttonStart > 0 && buttonEnd > buttonStart && resolveEnd > resolveStart && poseEnd > poseStart);
function demoFixture(kind, enemyKind, wall = false) {
  const room = dungeonLayout(kind).rooms.find(room => room.id === 'threshold');
  const mesh = new THREE.Group(); mesh.position.set(room.x, 0, room.z);
  const source = { stageId: room.id, kind: enemyKind, mesh, dungeonBoss: false, spawn: { x: room.x, z: room.z } }, poseCalls = [];
  const blocker = { x: room.x, z: room.z + 2.5, r: 5, halfWidth: 5, halfDepth: .5 };
  const ctx = { mechanicButton: { disabled: false }, definition: { id: kind }, select: { value: 'threshold' }, enemies: [source],
    position: new THREE.Vector3(room.x, 0, room.z + 5), overview: false, abilitySequence: 0, demonstrations: [], Date: { now: () => 10000 }, mechanicNote: { textContent: '' },
    dungeonHazardPattern, dungeonDeathHazardPattern, dungeonHazardContains, dungeonHazardAttack, canTraverse, dungeonBounds, inDungeonPreparation, bounds: dungeonBounds(kind), DEATH_ANIMATION_MS,
    world: { colliders: [...dungeonColliders([], [], kind), ...(wall ? [blocker] : [])] }, syncState() {}, canvas: { focus() {} },
    animateEnemy: (...args) => poseCalls.push(args), monsterEffects: { update() {} }, clock: 10000, now: 10000,
  };
  runInNewContext(stripTypeScriptTypes(preview.slice(buttonStart,buttonEnd)), ctx); ctx.mechanicButton.onclick();
  return { ctx, source, blocker, poseCalls, resolve(clock) { ctx.clock = clock; runInNewContext(stripTypeScriptTypes(preview.slice(resolveStart,resolveEnd)), ctx); }, pose(clock) { ctx.clock = clock; runInNewContext(stripTypeScriptTypes(preview.slice(poseStart,poseEnd)), ctx); } };
}
{
  const blocked = demoFixture('nightroot', 'void-stalker', true);
  assert.equal(blocked.ctx.demonstrations.length, 0, 'preview applies the server source-to-mark collision filter before showing warnings');
  const closingGate = demoFixture('nightroot', 'void-stalker');
  assert.equal(closingGate.ctx.demonstrations.length, 1, 'the warning exists before cover blocks the leap');
  closingGate.ctx.world.colliders.push(closingGate.blocker); closingGate.resolve(11500);
  assert.equal(closingGate.source.mesh.position.z, closingGate.source.spawn.z); assert(!closingGate.ctx.mechanicNote.textContent.startsWith('Hit'), 'a blocked leap cannot report a preview hit');
  const leap = demoFixture('nightroot', 'void-stalker'); leap.resolve(11500);
  assert.equal(leap.source.mesh.position.z, leap.ctx.position.z, 'valid preview leap reaches its locked mark');
}
{
  const death = demoFixture('cindercrypt', 'ember-beetle'); death.pose(10800);
  assert(death.poseCalls.some(args => Number.isFinite(args[4])), 'beetle death demo uses the real collapse animation');
  assert.equal(death.source.mesh.rotation.z, 0, 'death pose does not permanently rotate the world-space enemy root');
}
console.log('PASS dungeon display: timestamp-aligned contact/recovery, stable facing, cue cancellation/retirement, single warning geometry, scene disposal, preview wall checks and actual beetle death animation.');
