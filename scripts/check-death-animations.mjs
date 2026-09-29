import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeCharacter, animateCharacter, makeEnemy, animateEnemy, setMonsterAssets, setDeathAnimations, setCharacterRaces, setCharacterCustomization, setCharacterGear } from '../src/characters.ts';
import { MONSTER_MODEL_KINDS } from '../src/monster-models.ts';
import { makeLootRemains } from '../src/loot.ts';
import { DEFAULT_APPEARANCE, RACES, GENDERS } from '../src/appearance.ts';
import { GEAR, GEAR_SETS, starterGear } from '../src/progression.ts';
import { DEATH_ANIMATION_MS } from '../src/shared.ts';

for (const [file, set] of [['monster-kit', setMonsterAssets], ['death-animations', setDeathAnimations], ['race-kit', setCharacterRaces], ['customization-kit', setCharacterCustomization], ['gear-kit', setCharacterGear]]) {
  const bytes = readFileSync(new URL(`../public/models/${file}.glb`, import.meta.url));
  const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  set(asset.scene, asset.animations);
}
const pose = root => { const values = []; root.traverse(node => values.push([node.name, ...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray(), node.visible])); return values; };
const samePose = (a,b,message) => assert(a.length===b.length && a.every((row,i)=>row.every((value,j)=>typeof value==='number'?Math.abs(value-b[i][j])<1e-6:value===b[i][j])),message);
const bounds = root => {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3(), point = new THREE.Vector3(), instance = new THREE.Matrix4(), transform = new THREE.Matrix4();
  root.traverseVisible(node => {
    if (!node.isMesh) return;
    const vertices = node.geometry.getAttribute('position');
    for (let copy = 0; copy < (node.isInstancedMesh ? node.count : 1); copy++) {
      if (node.isInstancedMesh) { node.getMatrixAt(copy, instance); transform.multiplyMatrices(node.matrixWorld, instance); } else transform.copy(node.matrixWorld);
      if(Math.abs(transform.determinant())<1e-12)continue;
      for (let i = 0; i < vertices.count; i++) box.expandByPoint(point.fromBufferAttribute(vertices, i).applyMatrix4(transform));
    }
  });
  return box;
};

function verify(root, animate, name) {
  animate(undefined); const idle = pose(root), standing = bounds(root), twinRoot = root.position.clone();
  for (const progress of [0, .05, .2, .5, .75, .9, 1]) {
    animate(progress); root.updateMatrixWorld(true);
    root.traverse(node => assert(node.matrixWorld.elements.every(Number.isFinite), `${name} has finite death transforms`));
    assert(bounds(root).min.y >= -.04, `${name} does not sink through the ground at ${progress}`);
    const held = pose(root); animate(progress); samePose(pose(root), held, `${name} can sample the same death frame repeatedly`);
  }
  const fallen = pose(root);
  assert.notDeepEqual(fallen, idle, `${name} has a different fallen pose`);
  const body = root.getObjectByName(`${name}-body`), overturned = body && new THREE.Vector3(0,1,0).applyQuaternion(body.quaternion).y < -.4;
  assert(bounds(root).max.y < standing.max.y * .95 || overturned, `${name} visibly collapses or overturns`);
  animate(1); samePose(pose(root), fallen, `${name} holds its final pose`);
  animate(undefined); samePose(pose(root), idle, `${name} restores all living pivots after revival`);
  assert(root.position.equals(twinRoot), `${name} never changes the gameplay root`);
}
for (const race of RACES) for (const gender of GENDERS) for (const className of ['Knight', 'Ranger', 'Mage']) {
  const look = { ...DEFAULT_APPEARANCE, race: race.id, gender: gender.id, className }, root = makeCharacter(look), twin = makeCharacter(look), untouched = pose(twin);
  verify(root, progress => animateCharacter(root, .31, false, false, undefined, false, undefined, progress), `${race.id}/${gender.id}/${className}`);
  animateCharacter(root, 4, false, true, 'mining');
  animateCharacter(root, 4, true, true, 'mining', true, { sprinting: true }, .5);
  assert(!root.userData.rig.pickaxe.visible && !root.userData.rig.axe.visible, 'death cancels gathering tools');
  assert.deepEqual(pose(twin), untouched, 'player deaths never modify another character or the Blender library');
}
for (const set of GEAR_SETS) {
  const equipment = { ...starterGear(set.className).equipment };
  for (const item of Object.values(GEAR).filter(item => item.setId === set.id)) equipment[item.slot === 'ring' ? 'ring1' : item.slot] = item.id;
  const root = makeCharacter({ ...DEFAULT_APPEARANCE, className: set.className }, equipment);
  verify(root, progress => animateCharacter(root, .31, false, false, undefined, false, undefined, progress), set.id);
}
for (const kind of ['moss-slime', 'briar-sentinel', 'ice-wisp', 'root-warden', ...MONSTER_MODEL_KINDS]) {
  const root = makeEnemy(kind);
  verify(root, progress => animateEnemy(root, .31, false, undefined, progress), kind);
  animateEnemy(root, .31, false, { style: 'slam', basic: true, progress: .5, impactProgress: .5 });
  animateEnemy(root, .31, true, { style: 'slam', progress: .5, impactProgress: .5 }, 1);
  const end = bounds(root), corpse = makeLootRemains(kind), fallen = corpse.getObjectByName(`fallen-${kind}`), actual = bounds(fallen);
  assert(end.min.distanceTo(actual.min) < .001 && end.max.distanceTo(actual.max) < .001, `${kind} loot matches the exact final death pose without recentering or shrinking`);
  const still = pose(corpse); animateEnemy(fallen, 30, true); assert.deepEqual(pose(corpse), still, `${kind} loot never resumes animation`);
}
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const runtime = { THREE, DEATH_ANIMATION_MS, serverOffset: 0 };
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function deathProgress('), main.indexOf('function syncEntities('))), runtime);
for (const [elapsed, expected] of [[-100, 0], [0, 0], [700, .5], [1400, 1], [15000, 1]]) assert.equal(runtime.deathProgress(10000, 10000 + elapsed), expected);
assert.equal(runtime.deathProgress(undefined), 1, 'an old corpse settles immediately when entering interest range');
// Run the actual frame loop: finished deaths must stop consuming animation,
// terrain and label work, while a newly falling or revived enemy still updates.
const loopStart=main.lastIndexOf('for(const e of enemies){'),loopEnd=main.indexOf('for(const drop of loot)',loopStart);assert(loopStart>=0&&loopEnd>loopStart);
const enemyLoop=stripTypeScriptTypes(main.slice(loopStart,loopEnd)),calls={terrain:0,animation:0,queries:0,labels:0};
const dots={textContent:'',hidden:true},cast={hidden:true},label={hidden:false,querySelector(selector){calls.queries++;return selector==='.enemy-dots'?dots:cast;}};
const enemy={id:'test',kind:'moss-slime',x:3,z:4,alive:false,diedAt:1000},view={mesh:new THREE.Group(),label,height:1};
const frame={visibleInDungeonRoom:()=>true,THREE,enemies:[enemy],enemyMeshes:new Map([[enemy.id,view]]),monsterNow:3000,dt:1/60,elapsed:3,deathProgress:runtime.deathProgress,dungeonAttackCues:new Map(),playerId:'player',MONSTERS:{'moss-slime':{height:1}},
 surfaceHeight(){calls.terrain++;return 0;},animateEnemy(){calls.animation++;},damageOverTimeLabels:()=>'',placeLabel(){calls.labels++;}};
const runFrame=()=>{for(const name of Object.keys(calls))calls[name]=0;runInNewContext(enemyLoop,frame);};
runFrame();assert.equal(view.mesh.visible,false);assert.deepEqual(calls,{terrain:0,animation:0,queries:0,labels:0},'finished invisible deaths do no animation, terrain or DOM queries');
enemy.diedAt=2300;runFrame();assert(view.mesh.visible);assert.equal(calls.animation,1,'the first collapse still animates');assert.equal(calls.terrain,1);assert.equal(calls.labels,1);
enemy.diedAt=1000;runFrame();enemy.alive=true;runFrame();assert(view.mesh.visible);assert.equal(label.hidden,false,'reviving restores a previously hidden label');assert.equal(calls.animation,1);assert.equal(calls.terrain,1);assert.equal(calls.labels,1);
console.log('PASS: Blender death poses for all 36 race/gender/class combinations, 15 complete gear sets and 18 monsters; floor contact, interrupted attacks, held corpses, exact loot transition, revive resets, authoritative timeline and finished-death frame skipping.');
