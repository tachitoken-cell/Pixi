import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { makeCharacter, animateCharacter, makeEnemy, animateEnemy, makeSlime } from '../src/characters.ts';
import { GEAR, starterGear } from '../src/progression.ts';

const appearance = { skin: '#eeb58b', hair: '#62452f', hairStyle: 'swept', outfit: '#548d68', accent: '#e5b961', className: 'Ranger' };
const geometry = new Set();
const upgradedEquipment = className => Object.fromEntries(['weapon', 'armor', 'charm'].map(slot => [slot,
  Object.values(GEAR).find(item => item.slot === slot && (item.className === className || !item.className) && item.price > 0).id,
]));
function voxelSignature(group) {
  const parts = [];
  group.traverse(node => {
    parts.push([node.name, node.position.toArray(), node.rotation.toArray(), node.scale.toArray(), node.visible,
      node.isInstancedMesh ? [...node.instanceMatrix.array] : [], node.isInstancedMesh ? [...node.instanceColor.array] : []]);
  });
  return parts;
}
for (const className of ['Ranger', 'Knight', 'Mage']) {
  const base = Object.freeze({ ...appearance, className });
  const starter = Object.freeze(starterGear(className).equipment);
  const preview = makeCharacter(base);
  assert.deepEqual(voxelSignature(makeCharacter(base, starter)), voxelSignature(preview), 'starter gear preserves the exact creator preview');
  for (const slot of ['weapon', 'armor', 'charm']) {
    const changed = makeCharacter(base, Object.freeze({ ...starter, [slot]: upgradedEquipment(className)[slot] }));
    assert.notDeepEqual(voxelSignature(changed), voxelSignature(preview), `${className} ${slot} equipment visibly changes its voxels`);
    assert.deepEqual(voxelSignature(changed.getObjectByName('head')), voxelSignature(preview.getObjectByName('head')), 'equipment preserves the chosen face and hair');
    assert.equal(changed.userData.rig.className, className, 'equipment never changes class identity');
  }
  for (const hairStyle of ['swept', 'long', 'mohawk', 'none']) for (const equipment of [undefined, upgradedEquipment(className)]) {
    const character = makeCharacter({ ...appearance, className, hairStyle }, equipment);
    const bounds = new THREE.Box3().setFromObject(character);
    assert(Math.abs(bounds.min.y) < 0.001, 'feet must rest on the ground');
    assert(bounds.max.y > 2 && bounds.max.y < 2.6, 'avatar must retain its world scale');
    assert(character.getObjectByName({ Ranger: 'bow', Knight: 'sword', Mage: 'staff' }[className]), 'class gear must differ');
    character.position.set(12, 0, 8);
    animateCharacter(character, 0.1, true, true);
    assert.deepEqual(character.position.toArray(), [12, 0, 8], 'animation must not move the world root');
    assert.notEqual(character.getObjectByName('left-leg').rotation.x, 0, 'legs must still animate after batching');
    const objects = [];
    character.traverse(node => objects.push(node));
    const gear = ['bow', 'sword', 'shield', 'staff'].map(name => character.getObjectByName(name)).filter(Boolean);
    const pickaxe = character.getObjectByName('pickaxe'), axe = character.getObjectByName('axe');
    assert.equal(pickaxe.parent.name, 'right-arm', 'pickaxe follows the working hand');
    assert.equal(axe.parent, pickaxe.parent, 'both gathering tools use the working hand');
    assert(!pickaxe.visible && !axe.visible, 'gathering tools stay stowed during combat');
    const pose = () => objects.map(node => [...node.position.toArray(), ...node.rotation.toArray(), node.visible]);
    const combatPose = pose();
    for (const skill of ['mining', 'woodcutting', 'herbalism']) {
      let firstPose;
      for (const time of [0, 0.20, 0.506, 0.70, 0.92, 12.5]) {
        animateCharacter(character, time, false, true, skill);
        assert.equal(pickaxe.visible, skill === 'mining');
        assert.equal(axe.visible, skill === 'woodcutting');
        assert(gear.every(node => !node.visible), `${className} puts away class equipment for ${skill}`);
        assert.deepEqual(character.position.toArray(), [12, 0, 8], 'gathering preserves world position');
        character.updateMatrixWorld(true);
        const after = [];
        character.traverse(node => { after.push(node); assert(node.matrixWorld.elements.every(Number.isFinite)); });
        assert.deepEqual(after, objects, 'gathering allocates no new scene objects');
        if (time === 0) firstPose = pose();
        if (time === 0.20) assert.notDeepEqual(pose(), firstPose, `${skill} has an animated working pose`);
        if (time === 0.506 && skill === 'mining') {
          const hand = pickaxe.getWorldPosition(new THREE.Vector3());
          const head = character.getObjectByName('head').getWorldPosition(new THREE.Vector3());
          assert(hand.y > head.y, 'mining raises the pickaxe hand overhead before its strike');
        }
        if (skill === 'herbalism') assert(character.getObjectByName('body').position.y < -0.2, 'herbalism crouches to gather');
      }
      animateCharacter(character, 0.1, true, true);
      assert.deepEqual(pose(), combatPose, 'ending any gathering mode restores every combat transform and class weapon');
    }
    for (const moving of [false, true]) {
      let firstSwim;
      character.position.y = -.65;
      for (const time of [0, .2, .5, 12.5]) {
        animateCharacter(character, time, moving, false, 'mining', true);
        assert(!pickaxe.visible && !axe.visible && gear.every(node => !node.visible), 'swimming stows all handheld equipment and gathering tools');
        assert.deepEqual(character.position.toArray(), [12, -.65, 8], 'swimming preserves the supplied surface height and position');
        assert.equal(character.getObjectByName('body').rotation.x > .9, moving, 'travel uses a forward swimming stroke while idle treads upright');
        character.updateMatrixWorld(true);
        const after = [];
        character.traverse(node => { after.push(node); assert(node.matrixWorld.elements.every(Number.isFinite)); });
        assert.deepEqual(after, objects, 'swimming reuses the entire existing rig');
        if (time === 0) firstSwim = pose();
        if (time === .2) assert.notDeepEqual(pose(), firstSwim, 'both treading and traveling animate');
      }
      animateCharacter(character, .25, moving, { ability: { Ranger: 'arrow', Knight: 'strike', Mage: 'fireball' }[className], progress: .4 }, undefined, true);
      assert(gear.every(node => node.visible), 'accepted water combat temporarily restores the class weapon');
      assert(character.getObjectByName('body').rotation.x < .2, 'water combat rises into a treading cast pose');
      character.position.y = 0;
      animateCharacter(character, .1, true, true);
      assert.deepEqual(pose(), combatPose, 'leaving water restores every land pivot, bow and weapon');
    }
    let draws = 0;
    character.traverse(node => {
      if (node.isMesh) {
        assert(node.castShadow);
        assert(node.isInstancedMesh && node.instanceColor, 'static pieces retain individual colors in one draw');
        geometry.add(node.geometry);
        draws++;
      }
    });
    assert(draws <= 14, 'avatar buffers stay bounded, including two hidden gathering tools');
    assert(draws - 2 <= 12, 'visible avatar draw calls stay within the existing budget');
    character.updateMatrixWorld(true);
    character.traverse(node => assert(node.matrixWorld.elements.every(Number.isFinite), 'animation must remain finite'));
  }
}
const slime = makeSlime();
const bounds = new THREE.Box3().setFromObject(slime);
assert(Math.abs(bounds.min.y) < 0.001 && bounds.max.y < 0.8);
assert(slime.getObjectByName('voxel-parts').isInstancedMesh, 'legacy slime factory keeps instanced geometry');
const signatures = new Set();
const materials = new Set();
for (const [kind, minHeight, maxHeight] of [['moss-slime', .6, .8], ['briar-sentinel', 2.3, 2.8], ['ice-wisp', 1.2, 2.2], ['root-warden', 4.5, 5.1]]) {
  const enemy = makeEnemy(kind);
  const rest = new THREE.Box3().setFromObject(enemy);
  const size = rest.getSize(new THREE.Vector3());
  assert(size.y > minHeight && size.y < maxHeight, `${kind} keeps its intended scale`);
  assert(kind === 'ice-wisp' ? rest.min.y > .2 : Math.abs(rest.min.y) < .002, `${kind} stays grounded or deliberately levitates`);
  let draws = 0, pieces = 0;
  enemy.traverse(node => {
    if (!node.isMesh) return;
    assert(node.isInstancedMesh && node.count > 0 && node.instanceColor, `${kind} retains colored, nonempty instances`);
    assert(node.castShadow && node.receiveShadow);
    geometry.add(node.geometry);
    materials.add(node.material);
    draws++;
    pieces += node.count;
  });
  assert(draws <= 8, `${kind} uses at most eight animated draw groups`);
  signatures.add(`${pieces}:${size.toArray().map(n => n.toFixed(2)).join(',')}`);
  enemy.position.set(-4, 2, 7);
  enemy.rotation.y = 1.2;
  enemy.scale.setScalar(1.1);
  const before = [];
  enemy.traverse(node => before.push(node));
  for (const moving of [false, true]) for (const time of [0, .25, 1, 12.5]) {
    animateEnemy(enemy, time, moving);
    enemy.updateMatrixWorld(true);
    assert.deepEqual(enemy.position.toArray(), [-4, 2, 7], `${kind} animation preserves the server position`);
    assert.equal(enemy.rotation.y, 1.2);
    assert.deepEqual(enemy.scale.toArray(), [1.1, 1.1, 1.1]);
    const after = [];
    enemy.traverse(node => { after.push(node); assert(node.matrixWorld.elements.every(Number.isFinite)); });
    assert.deepEqual(after, before, 'animation reuses every existing object');
  }
}
assert.equal(signatures.size, 4, 'all four enemies have distinct geometry silhouettes');
assert.equal(materials.size, 1, 'enemy variants share a single instanced material');
assert.throws(() => makeEnemy('unknown-creature'), /Unknown enemy kind/);
assert.equal(geometry.size, 1, 'all avatars share cube geometry');

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const cleanupStart = main.indexOf('function removeRig('), cleanupEnd = main.indexOf('function replaceAvatar(');
assert(cleanupStart >= 0 && cleanupEnd > cleanupStart, 'exercise the actual UI cleanup functions');
const { removeRig, removeNode } = Function('THREE', `${stripTypeScriptTypes(main.slice(cleanupStart, cleanupEnd))}; return { removeRig, removeNode };`)(THREE);
const scene = new THREE.Scene(), retiring = makeCharacter(appearance, upgradedEquipment('Ranger')), remaining = makeCharacter(appearance);
scene.add(retiring, remaining);
const buffers = new Map(), shared = new Map();
retiring.traverse(mesh => {
  if (!mesh.isInstancedMesh) return;
  buffers.set(mesh, 0);
  mesh.addEventListener('dispose', () => buffers.set(mesh, buffers.get(mesh) + 1));
  for (const resource of [mesh.geometry, mesh.material]) {
    if (shared.has(resource)) continue;
    shared.set(resource, 0);
    resource.addEventListener('dispose', () => shared.set(resource, shared.get(resource) + 1));
  }
});
removeRig(retiring);
assert.equal(retiring.parent, null);
assert.equal(remaining.parent, scene, 'replacing one avatar must preserve another avatar');
assert(buffers.size > 0 && [...buffers.values()].every(count => count === 1), 'every retired instance buffer receives its renderer disposal signal');
for (const name of ['pickaxe', 'axe']) assert.equal(buffers.get(retiring.getObjectByName(name).children[0]), 1, 'hidden gathering tools release their instance buffers too');
assert([...shared.values()].every(count => count === 0), 'rig cleanup must preserve shared geometry and materials');

const node = new THREE.Group(), nested = new THREE.Group();
const owned = [new THREE.BoxGeometry(), new THREE.SphereGeometry(), new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()];
const disposed = new Map(owned.map(resource => [resource, 0]));
for (const resource of owned) resource.addEventListener('dispose', () => disposed.set(resource, disposed.get(resource) + 1));
node.add(new THREE.Mesh(owned[0], [owned[2], owned[3]]), nested);
nested.add(new THREE.Mesh(owned[0], owned[2]), new THREE.Mesh(owned[1], owned[3]));
scene.add(node);
removeNode(node);
assert.equal(node.parent, null);
assert([...disposed.values()].every(count => count === 1), 'node cleanup disposes every owned geometry/material once, including nested and array materials');
assert([...shared.values()].every(count => count === 0), 'resource-node cleanup must not dispose live avatar assets');
console.log('PASS: 24 base/equipped avatars, visible gear in every slot, preserved identity, 3 gathering animations, swimming/treading/water combat, 4 enemy kinds, tool/combat/land restoration, finite isolated animation, shared assets, bounded draw calls and isolated disposal.');
