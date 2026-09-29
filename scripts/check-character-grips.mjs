import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeCharacter, animateCharacter, setCharacterCustomization, setCharacterGear, setCharacterRaces, setCharacterClericAssets, setDeathAnimations } from '../src/characters.ts';
import { RACES, GENDERS, DEFAULT_APPEARANCE } from '../src/appearance.ts';
import { GEAR, GEAR_SETS, starterGear, equipmentSlotFor } from '../src/progression.ts';
import { spellsForClass } from '../src/spells.ts';
import { setMountAssets } from '../src/mounts.ts';
import { AUTO_ATTACKS } from '../src/auto-attacks.ts';
import { setIdleAnimations } from '../src/idle-animation.ts';

const classes = ['Ranger', 'Knight', 'Mage', 'Cleric'];
const fallbackModels = classes.map(className => makeCharacter({ ...DEFAULT_APPEARANCE, className }));

let raceLibrary;
for (const [name, install] of [['customization-kit', setCharacterCustomization], ['gear-kit', setCharacterGear], ['cleric-kit', setCharacterClericAssets], ['race-kit', setCharacterRaces],['mounts',setMountAssets]]) {
  const bytes = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
  const scene = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
  install(scene); if (name === 'race-kit') raceLibrary = scene;
}
function namedCube(root, name) {
  let result;
  root.traverse(node => {
    const index = node.userData.namedParts?.[name];
    if (node.isInstancedMesh && Number.isInteger(index)) { assert(!result, `one actual ${name} cube per attachment`); result = { batch: node, index }; }
    if (node.isMesh && !node.isInstancedMesh && node.userData.role === name) { assert(!result, `one actual ${name} mesh per attachment`); result = { mesh: node }; }
  });
  assert(result, `named geometry ${name} exists in ${root.name}`); return result;
}
function cubeWorld({ batch, index, mesh }) { if(mesh)return mesh.matrixWorld;const matrix = new THREE.Matrix4(); batch.getMatrixAt(index, matrix); return matrix.premultiply(batch.matrixWorld); }
function center(cube) { if(cube.mesh){cube.mesh.geometry.computeBoundingBox();return cube.mesh.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(cube.mesh.matrixWorld);}return new THREE.Vector3().setFromMatrixPosition(cubeWorld(cube)); }
const handSolids = new WeakMap();
function assertGrip(weapon, hand, grip, label) {
  assert(center(grip).distanceTo(hand.getWorldPosition(new THREE.Vector3())) < 1e-5, `${label}: actual ${weapon.name} handle stays centered inside its palm`);
  if (!weapon.visible) return;
  assert(weapon.getWorldQuaternion(new THREE.Quaternion()).angleTo(hand.getWorldQuaternion(new THREE.Quaternion())) < 1e-6, `${label}: ${weapon.name} and gripping fingers rotate together`);
  const inverse = hand.matrixWorld.clone().invert();
  if (!handSolids.has(hand)) handSolids.set(hand, new WeakMap());
  const cached = handSolids.get(hand);
  if (!cached.has(weapon)) {
    const solids = [];
    hand.traverseVisible(node => {
      if (!node.isMesh) return;
      node.geometry.computeBoundingBox();
      for (let i = 0; i < (node.isInstancedMesh ? node.count : 1); i++) {
        const matrix = new THREE.Matrix4().multiplyMatrices(inverse, node.matrixWorld);
        if (node.isInstancedMesh) { const instance = new THREE.Matrix4(); node.getMatrixAt(i, instance); matrix.multiply(instance); }
        const bounds = node.geometry.boundingBox.clone().applyMatrix4(matrix), triangles = [];
        if (!node.isInstancedMesh) {
          const position = node.geometry.attributes.position, index = node.geometry.index;
          for (let vertex = 0; vertex < (index?.count ?? position.count); vertex += 3) triangles.push(new THREE.Triangle(...[0, 1, 2].map(offset => new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(vertex + offset) : vertex + offset).applyMatrix4(matrix))));
        }
        const name = node.isInstancedMesh ? Object.entries(node.userData.namedParts ?? {}).find(([, index]) => index === i)?.[0] : node.name;
        solids.push({ bounds, triangles, name });
      }
    });
    assert(solids.length >= 4, `${label}: clearance checks actual palm and finger geometry`);
    cached.set(weapon, solids);
  }
  const geometry = (grip.mesh ?? grip.batch).geometry; geometry.computeBoundingBox();
  const handle = geometry.boundingBox.clone().applyMatrix4(inverse.multiply(cubeWorld(grip)));
  for (const { bounds, triangles, name } of cached.get(weapon)) {
    if (name?.startsWith('grip-')) {
      const axis = name.startsWith('grip-side-') ? 'x' : 'z', gap = name.endsWith('--1') ? handle.min[axis] - bounds.max[axis] : bounds.min[axis] - handle.max[axis];
      assert(gap >= -1e-6 && gap <= .003, `${label}: ${weapon.name} fingers close around its actual handle without a loose gap (${gap})`);
    }
    const overlap = handle.clone().intersect(bounds).getSize(new THREE.Vector3());
    if (overlap.x < 1e-6 || overlap.y < 1e-6 || overlap.z < 1e-6) continue;
    assert(triangles.length && !triangles.some(triangle => handle.intersectsTriangle(triangle)), `${label}: ${weapon.name} handle must not intersect actual fingers (${overlap.toArray()})`);
  }
}
function assertFishingGrip(rig) {
  if (!rig.fishingRod.visible) return;
  assert(rig.fishingRod.getWorldPosition(new THREE.Vector3()).distanceTo(rig.rightHand.getWorldPosition(new THREE.Vector3())) < 1e-5, 'the fishing rod stays in the working palm');
  const shaft = new THREE.Vector3(0, .80, .95).transformDirection(rig.fishingRod.matrixWorld), channel = new THREE.Vector3(0, 1, 0).transformDirection(rig.rightHand.matrixWorld);
  assert(shaft.angleTo(channel) < 1e-6, 'the gripping fingers follow the authored and fallback fishing shaft axis');
}
function poseSignature(root) {
  const parts = [];
  root.traverse(node => parts.push([node.position.toArray(), node.quaternion.toArray(), node.scale.toArray(), node.visible, node.isInstancedMesh ? [...node.instanceMatrix.array] : null]));
  return parts;
}
const anatomyCache = new Map();
function meshAnatomy(mesh) {
  if (!anatomyCache.has(mesh.geometry)) {
    const geometry = mesh.geometry, position = geometry.attributes.position, indices = geometry.index;
    geometry.computeBoundingBox();
    const triangles = [];
    for (let i = 0; i < (indices?.count ?? position.count); i += 3) triangles.push(new THREE.Triangle(...[0, 1, 2].map(offset => new THREE.Vector3().fromBufferAttribute(position, indices ? indices.getX(i + offset) : i + offset))));
    anatomyCache.set(geometry, { bounds: geometry.boundingBox.clone().expandByScalar(-.015), triangles });
  }
  return { mesh, ...anatomyCache.get(mesh.geometry) };
}
function headAnatomy(character) {
  const root = character.userData.raceModel, mesh = character.getObjectByName(`${root}-head-cranium`);
  assert(mesh?.isMesh && !mesh.isInstancedMesh && mesh.userData.anatomy === 'cranium', 'clearance uses the actual authored cranium mesh');
  assert.equal(mesh.geometry, raceLibrary.getObjectByName(mesh.name).geometry);
  const anatomy = meshAnatomy(mesh);
  assert(anatomy.triangles.length >= 12, 'the head collision check uses the exported surface triangles');
  assert(insideAnatomy(anatomy.bounds.getCenter(new THREE.Vector3()), anatomy), 'the actual cranium surface encloses its center, so the clipping test cannot silently pass an open or empty mesh');
  if (root.startsWith('race-human-')) assert(insideAnatomy(new THREE.Vector3(0, -.23, 0), anatomy), 'overlapping skull and jaw solids remain occupied');
  return anatomy;
}
const samplePoints = [];
const clippingIssues = new Map();
const meshSamples = new Map();
for (const x of [-.5, 0, .5]) for (const y of [-.5, 0, .5]) for (const z of [-.5, 0, .5]) samplePoints.push([x, y, z]);
function insideAnatomy(point, anatomy) {
  if (!anatomy.bounds.containsPoint(point)) return false;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), cross = new THREE.Vector3(), nearest = new THREE.Vector3();
  let winding = 0;
  for (const triangle of anatomy.triangles) {
    if (triangle.closestPointToPoint(point, nearest).distanceToSquared(point) < .015 ** 2) return false;
    a.subVectors(triangle.a, point); b.subVectors(triangle.b, point); c.subVectors(triangle.c, point);
    const la = a.length(), lb = b.length(), lc = c.length();
    // Nonzero winding treats the library's overlapping skull/jaw volumes as solid.
    winding += 2 * Math.atan2(a.dot(cross.crossVectors(b, c)), la * lb * lc + a.dot(b) * lc + b.dot(c) * la + c.dot(a) * lb);
  }
  return Math.abs(winding) > Math.PI * 2;
}
function assertAnatomyClear(anatomy, weapon, label) {
  if (!weapon.visible) return;
  const inverse = anatomy.mesh.matrixWorld.clone().invert(), point = new THREE.Vector3(), transform = new THREE.Matrix4();
  weapon.traverseVisible(node => {
    if(node.isMesh && !node.isInstancedMesh) {
      if(!meshSamples.has(node.geometry)) {
        const {position}=node.geometry.attributes,index=node.geometry.index,samples=[];
        for(let i=0;i<position.count;i++)samples.push(new THREE.Vector3().fromBufferAttribute(position,i));
        for(let i=0;i<(index?.count??position.count);i+=3) {
          const triangle=[0,1,2].map(offset=>new THREE.Vector3().fromBufferAttribute(position,index?index.getX(i+offset):i+offset));
          samples.push(triangle[0].add(triangle[1]).add(triangle[2]).divideScalar(3));
        }
        meshSamples.set(node.geometry,samples);
      }
      transform.copy(inverse).multiply(node.matrixWorld);
      for(const sample of meshSamples.get(node.geometry))if(insideAnatomy(point.copy(sample).applyMatrix4(transform),anatomy)) {
        clippingIssues.set(`${label}: ${weapon.name}`,{mesh:node.name,localPoint:point.toArray().map(value=>Number(value.toFixed(4)))});return;
      }
    }
    if (!node.isInstancedMesh) return;
    for (let index = 0; index < node.count; index++) {
      node.getMatrixAt(index, transform); if (Math.abs(transform.determinant()) < 1e-12) continue;
      transform.premultiply(node.matrixWorld).premultiply(inverse);
      for (const sample of samplePoints) {
        point.fromArray(sample).applyMatrix4(transform);
        if (insideAnatomy(point, anatomy)) {
          const local = new THREE.Matrix4(); node.getMatrixAt(index, local);
          const center = new THREE.Vector3().setFromMatrixPosition(local.premultiply(node.matrixWorld).premultiply(weapon.matrixWorld.clone().invert()));
          const rounded = vector => vector.toArray().map(value => Number(value.toFixed(4)));
          clippingIssues.set(`${label}: ${weapon.name}`, { instance: index, partCenter: rounded(center), sample, localPoint: rounded(point) }); return;
        }
      }
    }
  });
}
const weaponHands = { bow: 'left-hand', sword: 'right-hand', shield: 'left-hand', staff: 'right-hand', mace: 'right-hand', tome: 'left-hand', pickaxe: 'right-hand', axe: 'right-hand' };
const drawProgress = [.12, .18, .24, .26, .265, .2699], times = [0, .12, .30, .506, .70, .92, 2.1];
const attackProgress = [...new Set([...Array.from({ length: 26 }, (_, index) => index / 25), ...drawProgress, .27, .2701, .30, .45, .85])].sort((a, b) => a - b);
let rigs = 0, poses = 0;
const idleStaffModels = [];
for (const race of RACES) for (const gender of GENDERS) for (const className of classes) for (const variant of ['starter','legacy',...GEAR_SETS.filter(set=>set.className===className).map(set=>set.id)]) {
  const appearance = Object.freeze({ ...DEFAULT_APPEARANCE, race: race.id, gender: gender.id, className });
  const equipment = starterGear(className).equipment;
  if(variant!=='starter')for(const item of Object.values(GEAR))if((variant==='legacy'?!item.setId&&item.price>0:item.setId===variant)&&(!item.className||item.className===className))equipment[equipmentSlotFor(equipment,item.id)]=item.id;
  const character = makeCharacter(appearance, Object.freeze(equipment)), rig = character.userData.rig;
  const anatomy = headAnatomy(character), source = raceLibrary.getObjectByName(character.userData.raceModel);
  const joints = Object.fromEntries(['head', 'left-arm', 'right-arm', 'left-leg', 'right-leg'].map(name => [name, source.getObjectByName(`${source.name}-${name}`).position.clone()]));
  const staffBody = [];
  if (className === 'Mage') for (const root of [character.getObjectByName(`${source.name}-torso`), character.getObjectByName('equipment-armor'), ...[rig.leftArm, rig.rightArm, rig.leftLeg, rig.rightLeg].flatMap(limb => limb.children.filter(node => node.name === `${source.name}-${limb.name}` || node.userData.anchor === limb.name || ['armor', 'legs', 'shoes'].includes(node.userData.gearSlot)))].filter(Boolean)) {
    root.traverseVisible(node => { if (node.isMesh) staffBody.push(meshAnatomy(node)); });
  }

  const authored=variant!=='starter'&&variant!=='legacy';
  const label = `${race.id}/${gender.id}/${className}/${variant}`, objects = [];
  if (className === 'Mage') idleStaffModels.push({ character, staffBody, label });
  character.traverse(node => objects.push(node)); character.updateMatrixWorld(true); rigs++;
  const hands = Object.fromEntries(['left-hand', 'right-hand'].map(name => [name, character.getObjectByName(name)]));
  for (const hand of Object.values(hands)) {
    assert(hand?.isGroup, `${label}: an independent wrist holds the fingers`);
    assert(hand.children.some(node => node.userData.anatomy === 'hand'), `${label}: authored knuckles follow the wrist`);
  }
  const weapons = Object.entries(weaponHands).flatMap(([name, hand]) => {
    const weapon = character.getObjectByName(name); return weapon ? [{ weapon, hand: hands[hand], grip: namedCube(weapon, 'weapon-grip') }] : [];
  });
  const bounds = new THREE.Box3(); character.traverseVisible(node => { if (node.isMesh) bounds.expandByObject(node); });
  assert(bounds.min.y > -.04 && bounds.min.y < .01, `${label}: resting held equipment does not sink below the feet`);
  character.position.set(12, 4, -8); character.rotation.y = .73; character.scale.setScalar(1.1);
  function check(time, moving = false, attack = false, gathering, swimming = false, travel) {
    animateCharacter(character, time, moving, attack, gathering, swimming, travel); character.updateMatrixWorld(true); poses++; assertFishingGrip(rig);
    const after = []; character.traverse(node => { after.push(node); assert(node.matrixWorld.elements.every(Number.isFinite), `${label}: finite transforms`); });
    assert.deepEqual(after, objects); assert.deepEqual(character.position.toArray(), [12, 4, -8]); assert.equal(character.rotation.y, .73); assert.deepEqual(character.scale.toArray(), [1.1, 1.1, 1.1]);
    for (const [name, position] of Object.entries(joints)) assert(character.getObjectByName(name).position.distanceTo(position) < 1e-6, `${name}: grip solving leaves every authored joint attached`);
    for (const name of ['body', 'head', 'left-arm', 'right-arm', 'left-leg', 'right-leg', 'cape']) assert.deepEqual(character.getObjectByName(name).scale.toArray(), [1, 1, 1], `${name}: anatomy and limb length remain authored at unit scale`);
    for (const { weapon, hand, grip } of weapons) {
      assertGrip(weapon, hand, grip, label);
      assertAnatomyClear(anatomy, weapon, `${label}, ${gathering || attack && `${attack.ability}(${attack.progress})` || swimming && 'swimming' || moving && 'walking' || 'idle'} at ${time}${swimming ? ' in water' : moving ? ' walking' : ''}`);
    }
    if (!moving && !attack && !gathering && !swimming && !travel) for (const part of staffBody) assertAnatomyClear(part, rig.weapon, `${label}: standing staff vs ${part.mesh.name}`);
    if (rig.bow && attack && !attack.basic && attack.progress >= .12 && attack.progress <= .26 && !gathering) {
      const shaft = { batch: rig.bow.batch, index: rig.bow.parts['nocked-arrow-0'] }, matrix = cubeWorld(shaft);
      assert(Math.abs(matrix.determinant()) > 1e-8, 'the checked draw pose contains a visible arrow');
      const nock = new THREE.Vector3(0, 0, -.5).applyMatrix4(matrix);
      assert(nock.distanceTo(hands['right-hand'].getWorldPosition(new THREE.Vector3())) < 1e-5, `${label}: ${attack.ability} at ${attack.progress} keeps the drawing palm on the actual arrow nock`);
      const direction = new THREE.Vector3(0, 0, .5).applyMatrix4(matrix).sub(nock).transformDirection(character.matrixWorld.clone().invert());
      if (!swimming) assert(Math.abs(direction.x) < 1e-5 && Math.abs(direction.y) < 1e-5 && direction.z > .99999, 'the sideways land stance still aims the arrow along the character heading');
      const palmSpace = hands['right-hand'].worldToLocal(nock.clone());
      assert(palmSpace.length() < 1e-5, 'the arrow rear is inside the drawing hand');
    }
    if (rig.bow && attack && !attack.basic && (attack.progress < .12 || attack.progress > .26) && !gathering) {
      const shaft = { batch: rig.bow.batch, index: rig.bow.parts['nocked-arrow-0'] };
      assert(Math.abs(cubeWorld(shaft).determinant()) < 1e-12, `${label}: no nocked arrow remains after release or before drawing at ${attack.progress}`);
    }
  }
  check(0); const rest = poseSignature(character);
  for (const moving of [false, true]) for (const time of times) check(time, moving);
  for (const skill of ['mining', 'woodcutting', 'herbalism', 'fishing']) {
    for (const time of times) check(time, false, false, skill);
    check(0); assert.deepEqual(poseSignature(character), rest, `${label}: gathering restores all grips and arm transforms`);
  }
  for (const progress of attackProgress) check(.37, false, { ability: AUTO_ATTACKS[className].ability, progress, basic: true });
  for (const spell of spellsForClass(className).filter(spell=>!authored||['volley','fireball','nova','strike','shield-bash','shockwave','whirlwind','smite','holy-nova','charge','taunt','powerful-throw','guard','adamant-guardian','courageous-call','lord-of-battle'].includes(spell.id))) {
    for (const progress of attackProgress) for (const [moving, swimming] of [[false, false], [true, false], [false, true]]) check(.37, moving, { ability: spell.id, progress }, undefined, swimming);
    for (const [moving, swimming] of [[false, false], [true, false], [false, true]]) for (const [endpoint, adjacent] of [[0, .0001], [1, .9999]]) {
      check(.37, moving, { ability: spell.id, progress: endpoint }, undefined, swimming);
      const baseline = objects.map(node => ({ node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone() }));
      check(.37, moving, { ability: spell.id, progress: adjacent }, undefined, swimming);
      for (const { node, position, quaternion, scale } of baseline) {
        assert(node.position.distanceTo(position) < .005 && node.quaternion.angleTo(quaternion) < .02 && node.scale.distanceTo(scale) < .005,
          `${label}: ${spell.id} at ${adjacent} transitions continuously into ${node.name || node.type}${swimming ? ' while swimming' : moving ? ' while walking' : ''}`);
      }
    }
    check(0); assert.deepEqual(poseSignature(character), rest, `${label}: ${spell.id} restores every resting grip`);
  }
  for (const moving of [false, true]) for (const time of times) check(time, moving, false, undefined, true);
  check(0); assert.deepEqual(poseSignature(character), rest, `${label}: swimming restores every resting grip`);
  if(authored) {
    const imported=character.getObjectByName('equipment-weapon');assert(imported,'the actual Blender weapon is mounted');
    for(const mount of ['horse','wolf']){check(.37,true,false,undefined,false,{mount});assert(rig.classGear.every(weapon=>!weapon.visible),'mounted riders stow all held weapons');}
    check(.37,true,false,undefined,false,{sprinting:true});check(.37,true,false,undefined,false,{jump:{grounded:false,velocity:4}});
    check(0);assert.deepEqual(poseSignature(character),rest,`${label}: mounts, sprinting and jumping restore every grip`);
  }
}
assert.equal(rigs, RACES.length * GENDERS.length * (classes.length * 2 + GEAR_SETS.length), 'every race/gender fit covers four classes and all Blender weapon sets');

// Sample shipping idle/death clips after the deterministic rest/recovery checks above.
for (const [name, install] of [['idle-animations', setIdleAnimations], ['death-animations', setDeathAnimations]]) {
  const bytes = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
  const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  install(asset.scene, asset.animations);
}
for (const { character, staffBody, label } of idleStaffModels) {
  const { weapon, rightHand } = character.userData.rig, grip = namedCube(weapon, 'weapon-grip');
  for (const time of times) {
    animateCharacter(character, time, false); character.updateMatrixWorld(true); poses++;
    assertGrip(weapon, rightHand, grip, label);
    for (const part of staffBody) assertAnatomyClear(part, weapon, `${label}: authored idle staff vs ${part.mesh.name}`);
  }
}
const clipModels = [...fallbackModels];
for (const className of classes) for (const upgraded of [false, true]) {
  const equipment = starterGear(className).equipment, set = GEAR_SETS.filter(set => set.className === className).at(-1);
  if (upgraded) for (const item of Object.values(GEAR).filter(item => item.setId === set.id)) equipment[equipmentSlotFor(equipment, item.id)] = item.id;
  clipModels.push(makeCharacter({ ...DEFAULT_APPEARANCE, className }, equipment));
}
for (const character of clipModels) {
  const rig = character.userData.rig, label = `${rig.className}/${character.userData.raceModel ?? 'fallback'}`;
  const held = Object.entries(weaponHands).flatMap(([name, hand]) => {
    const weapon = character.getObjectByName(name); return weapon ? [{ weapon, hand: character.getObjectByName(hand), grip: namedCube(weapon, 'weapon-grip') }] : [];
  });
  const check = (...pose) => {
    animateCharacter(character, ...pose); character.updateMatrixWorld(true); poses++; assertFishingGrip(rig);
    for (const { weapon, hand, grip } of held) assertGrip(weapon, hand, grip, label);
  };
  check(.37, true); const walking = poseSignature(character);
  for (const time of times) check(time, false);
  for (const progress of [0, .2, .5, .8, 1]) {
    check(.37, false, { ability: AUTO_ATTACKS[rig.className].ability, progress, basic: true });
    check(.37, false, false, undefined, false, undefined, progress);
  }
  for (const gathering of ['mining', 'woodcutting', 'herbalism', 'fishing']) check(.37, false, false, gathering);
  check(.37, true); assert.deepEqual(poseSignature(character), walking, `${label}: authored idle/death and tool transitions restore the entire walking rig`);
}

assert.equal(clippingIssues.size, 0, `Visible weapon geometry must stay outside the checked authored anatomy:\n${[...clippingIssues].map(([label, detail]) => `${label}: ${JSON.stringify(detail)}`).join('\n')}`);
console.log(`PASS: ${rigs} loaded race/gender/class/equipment rigs, ${clipModels.length} fallback/authored idle/death rigs and ${poses} poses; actual handles centered in rotating wrists without finger intersections, drawing hands on arrow nocks, face/standing-staff body clearance, grounded equipment, finite isolated transforms and exact tool/attack/swim recovery.`);
