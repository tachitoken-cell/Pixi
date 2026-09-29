import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RACES, GENDERS, FACES, HAIRSTYLES, DEFAULT_APPEARANCE } from '../src/appearance.ts';
import { makeCharacter, animateCharacter, setCharacterCustomization, setCharacterGear, setCharacterRaces } from '../src/characters.ts';
import { GEAR, starterGear } from '../src/progression.ts';

async function load(name) {
  const bytes = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}
const library = await load('customization-kit'), gearLibrary = await load('gear-kit'), raceLibrary = await load('race-kit');
const expectedRoots = [...HAIRSTYLES.filter(o => o.id !== 'none').map(o => `hair-${o.id}`), ...RACES.filter(o => o.id !== 'human').map(o => `race-${o.id}`), ...FACES.map(o => `face-${o.id}`), 'race-foxfolk-tail','tool-fishing-rod'];
assert.equal(expectedRoots.length, 33);
for (const name of expectedRoots) assert(library.getObjectByName(name), `the Blender library contains ${name}`);
assert.throws(() => setCharacterCustomization(new THREE.Group()), /Missing customization model/);
assert.throws(() => setCharacterRaces(new THREE.Group()), /Missing race anatomy/);
setCharacterCustomization(library); setCharacterGear(gearLibrary); setCharacterRaces(raceLibrary);

const meshes = root => { const result = []; root?.traverse(node => { if (node.isMesh) result.push(node); }); return result; };
const sourceMeshes = new Map([...meshes(library), ...meshes(raceLibrary)].map(mesh => [mesh.name, mesh]));
const sources = new Map([...sourceMeshes.values(), ...meshes(gearLibrary)].map(mesh => [mesh.geometry, Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([key, value]) => [key, value.array.slice()]))]));
const geometrySignature = root => {
  const hash = createHash('sha256');
  for (const mesh of meshes(root)) for (const attribute of [mesh.geometry.attributes.position, mesh.geometry.index].filter(Boolean)) {
    hash.update(String(attribute.count)); hash.update(new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
  }
  return hash.digest('hex');
};
const pivots = ['body', 'head', 'left-arm', 'right-arm', 'left-leg', 'right-leg', 'cape'];
const unitPivots = character => { for (const name of pivots) assert.deepEqual(character.getObjectByName(name).scale.toArray(), [1, 1, 1], `${name} retains authored anatomy without runtime scaling`); };
const signature = root => JSON.stringify(meshes(root).map(mesh => ({
  positions: [...mesh.geometry.attributes.position.array], index: mesh.geometry.index ? [...mesh.geometry.index.array] : null,
  colors: mesh.geometry.attributes.color ? [...mesh.geometry.attributes.color.array] : null,
  position: mesh.position.toArray(), rotation: mesh.rotation.toArray(), scale: mesh.scale.toArray(), tint: mesh.material.color.toArray(),
  instances: mesh.isInstancedMesh ? [...mesh.instanceMatrix.array] : null,
  instanceColors: mesh.instanceColor ? [...mesh.instanceColor.array] : null,
})));
const rigState = root => {
  const result = []; root.traverse(node => result.push([node.position.toArray(), node.rotation.toArray(), node.scale.toArray(), node.visible]));
  return JSON.stringify([result, signature(root)]);
};
function visibleBounds(root) {
  root.updateMatrixWorld(true); const bounds = new THREE.Box3();
  root.traverseVisible(node => { if (node.isMesh) bounds.expandByObject(node); }); return bounds;
}
function assertPart(character, name, parent = 'head') {
  const part = character.getObjectByName(name); assert(part?.visible, `${name} is visible`); assert.equal(part.parent.name, parent);
  for (const mesh of meshes(part)) {
    const source = sourceMeshes.get(mesh.name); assert(source, `${name} uses its authored meshes`);
    assert.equal(mesh.geometry, source.geometry, 'avatars share the imported geometry');
    assert(mesh.material.vertexColors && mesh.geometry.attributes.color, 'authored shading survives cloning');
    if (mesh.userData.tint === 'fixed') assert.equal(mesh.material, source.material, 'fixed colors retain the shared source material');
  }
  return part;
}
const builds = new Set(), characters = [];
for (const [raceIndex, race] of RACES.entries()) for (const [genderIndex, gender] of GENDERS.entries()) {
  const className = ['Ranger', 'Knight', 'Mage'][(raceIndex + genderIndex) % 3];
  const look = Object.freeze({ ...DEFAULT_APPEARANCE, race: race.id, gender: gender.id, className, face: FACES[raceIndex % FACES.length].id });
  const character = makeCharacter(look); characters.push(character);
  assert.deepEqual(character.position.toArray(), [0, 0, 0]); assert.deepEqual(character.scale.toArray(), [1, 1, 1]);
  assert.equal(character.userData.rig.className, className);
  unitPivots(character);
  const rootName = `race-${race.id}-${gender.id}`, source = raceLibrary.getObjectByName(rootName);
  assert.equal(character.userData.raceModel, rootName);
  assert(source?.userData.fit); assert.deepEqual(source.scale.toArray(), [1, 1, 1]); builds.add(geometrySignature(source));
  for (const partName of ['torso', 'head', 'left-arm', 'right-arm', 'left-leg', 'right-leg']) {
    const name = `${rootName}-${partName}`, anchor = partName === 'torso' ? 'body' : partName;
    const part = assertPart(character, name, anchor), original = source.getObjectByName(name);
    assert.deepEqual(part.position.toArray(), [0, 0, 0], 'joint-local meshes do not apply the authored joint offset twice');
    assert(character.getObjectByName(anchor).position.distanceTo(original.position) < 1e-6, `${name} stays on its authored pivot`);
    original.traverse(node => assert.deepEqual(node.scale.toArray(), [1, 1, 1], 'body proportions are authored vertices'));
  }
  const bounds = visibleBounds(character); assert(Math.abs(bounds.min.y) < .002, `${race.id}/${gender.id} keeps feet on the ground`);
  assert(bounds.max.y > 1.6 && bounds.max.y < 3.3, 'each race keeps a playable character scale');
  for (const legacyRace of RACES) assert.equal(character.getObjectByName(`race-${legacyRace.id}`), undefined, 'authored anatomy replaces every old additive race part');
  assertPart(character, `face-${look.face}`); assertPart(character, 'hair-swept');
  assert.equal(character.getObjectByName('race-foxfolk-tail'), undefined);
  if (race.id === 'foxfolk') assertPart(character, `${rootName}-tail`, 'body');
  const chest = character.getObjectByName(`${rootName}-torso-chest`);
  assert(chest?.isMesh && chest.visible && chest.userData.slot === 'armor' && chest.userData.tint === 'outfit', 'the modeled chest is visibly clothed');
  assert.equal(chest.userData.anatomy, gender.id === 'female' ? 'clothed-chest' : 'chest');
  assert.equal(source.userData.fit.torso.femaleChest, gender.id === 'female');
  if (gender.id === 'female') {
    const positions = chest.geometry.attributes.position, front = { left: -Infinity, right: -Infinity };
    for (let i = 0; i < positions.count; i++) { const side = positions.getX(i) < 0 ? 'left' : 'right'; front[side] = Math.max(front[side], positions.getZ(i)); }
    assert(Object.values(front).every(z => z >= source.userData.fit.torso.chestFront - .02 && z > source.userData.fit.torso.depth / 2 + .05), 'female chest has actual forward contour vertices on both sides');
    const maleChest = raceLibrary.getObjectByName(`race-${race.id}-male-torso-chest`);
    assert.notEqual(geometrySignature(chest), geometrySignature(maleChest), 'female chest anatomy differs in geometry, not only metadata');
  }
}
assert.equal(builds.size, RACES.length * GENDERS.length, 'all ten male/female race bodies use distinct authored geometry');

const hairSignatures = new Set();
for (const hair of HAIRSTYLES) {
  const character = makeCharacter({ ...DEFAULT_APPEARANCE, hairStyle: hair.id });
  const part = character.getObjectByName(`hair-${hair.id}`);
  if (hair.id === 'none') { assert(!part); hairSignatures.add('bald'); }
  else { assertPart(character, `hair-${hair.id}`); hairSignatures.add(signature(part)); }
}
assert.equal(hairSignatures.size, HAIRSTYLES.length, 'each haircut has different actual Blender geometry');
const faceSignatures = new Set();
for (const face of FACES) {
  const character = makeCharacter({ ...DEFAULT_APPEARANCE, face: face.id, hairStyle: 'none' });
  faceSignatures.add(signature(assertPart(character, `face-${face.id}`)));
}
assert.equal(faceSignatures.size, 8, 'all face choices have distinct visible authored detail');

const look = { ...DEFAULT_APPEARANCE, race: 'foxfolk', face: 'painted', hairStyle: 'braids' };
const first = makeCharacter(look), twin = makeCharacter(look), beforeTint = signature(first);
assert.equal(first.userData.rig.eyes.phase, twin.userData.rig.eyes.phase); assert.equal(first.userData.rig.eyes.period, twin.userData.rig.eyes.period, 'rebuilding an unchanged appearance keeps its blink phase');
const changedColors = { skin: '749d58', hair: 'cf7251', outfit: '327abe', accent: '568bd0' };
const changed = makeCharacter({ ...look, ...Object.fromEntries(Object.entries(changedColors).map(([role, color]) => [role, `#${color}`])) });
assert.notEqual(signature(changed), beforeTint); assert.equal(signature(first), beforeTint, 'building another palette never recolors an existing avatar');
for (const mesh of meshes(first).filter(mesh => sourceMeshes.has(mesh.name))) {
  const other = twin.getObjectByName(mesh.name), recolored = changed.getObjectByName(mesh.name);
  assert.equal(mesh.geometry, other.geometry); assert.equal(mesh.geometry, recolored.geometry);
  assert.equal(mesh.material, other.material, 'equal palettes reuse cached tint materials');
  if (Object.hasOwn(changedColors, mesh.userData.tint)) {
    assert.notEqual(mesh.material, recolored.material, 'different palettes receive independent materials');
    assert.equal(recolored.material.color.getHexString(), changedColors[mesh.userData.tint]);
  } else assert.equal(mesh.material, recolored.material, 'fixed and leather materials stay cached across palettes');
  if (mesh.userData.tint === 'leather') assert.equal(mesh.material.color.getHexString(), '704836');
}

for (const [index, race] of RACES.entries()) {
  const className = ['Ranger', 'Knight', 'Mage'][index % 3], identity = Object.freeze({ ...look, race: race.id, className });
  const equipment = starterGear(className).equipment;
  const hat = Object.values(GEAR).find(item => item.slot === 'head' && item.className === className);
  const bare = makeCharacter(identity, equipment), hatted = makeCharacter(identity, { ...equipment, head: hat.id });
  assert(hatted.getObjectByName('equipment-head')); assert.equal(hatted.getObjectByName('hair-braids'), undefined, 'headgear hides imported hair');
  assert.equal(signature(assertPart(hatted, 'face-painted')), signature(assertPart(bare, 'face-painted')), 'headgear preserves face details');
  assertPart(hatted, `race-${race.id}-male-head`);
  if (race.id === 'foxfolk') assertPart(hatted, `race-${race.id}-male-tail`, 'body');
  assert.equal(hatted.userData.rig.eyes.parts.length, 4, 'headgear preserves eyes and glints');
  const restored = makeCharacter(identity, { ...equipment, head: null });
  assert.equal(signature(restored), signature(bare), 'removing headgear restores the selected hair, face and race exactly');
  characters.push(hatted);
}

for (const race of RACES) for (const gender of GENDERS) {
  const identity = { ...DEFAULT_APPEARANCE, race: race.id, gender: gender.id }, base = starterGear('Ranger').equipment;
  const upgrades = Object.fromEntries(['armor', 'legs', 'shoes'].map(slot => [slot, Object.values(GEAR).find(item => item.slot === slot && item.className === 'Ranger' && item.price > 0).id]));
  const bare = makeCharacter(identity, base), equipped = makeCharacter(identity, { ...base, ...upgrades });
  for (const [slot, id] of Object.entries(upgrades)) {
    assert(equipped.getObjectByName(`equipment-${slot}`), `${id} is loaded`);
    const clothes = meshes(bare).filter(mesh => mesh.userData.slot === slot);
    if (race.id === 'foxfolk' && slot === 'shoes') {
      assert.equal(clothes.length, 0, 'foxfolk have authored bare paws rather than base boots');
      bare.updateMatrixWorld(true); equipped.updateMatrixWorld(true);
      for (const side of ['left-leg', 'right-leg']) {
        const boot = equipped.getObjectByName(side).getObjectByName('equipment-shoes'), bounds = new THREE.Box3().setFromObject(boot).expandByScalar(.002);
        let pawVertices = 0;
        for (const mesh of meshes(bare.getObjectByName(side)).filter(mesh => ['skin', 'fixed'].includes(mesh.userData.tint))) {
          const positions = mesh.geometry.attributes.position, point = new THREE.Vector3();
          for (let index = 0; index < positions.count; index++) {
            point.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld);
            if (point.y > .20) continue;
            pawVertices++; assert(bounds.containsPoint(point), `${race.id}/${gender.id}: fitted boots contain the existing paw and claw geometry`);
          }
        }
        assert(pawVertices > 0, 'the barefoot exception is checked against real paw vertices');
      }
    } else assert(clothes.length && clothes.every(mesh => mesh.visible), `${race.id}/${gender.id}: base ${slot} clothing is present`);
    for (const mesh of clothes) assert.equal(equipped.getObjectByName(mesh.name).visible, false, 'actual equipped gear hides its base clothing without deleting shared meshes');
  }
  characters.push(equipped);
}

const matrix = new THREE.Matrix4(), modes = [
  [false, false, undefined, false], [true, false, undefined, false],
  [false, false, 'mining', false], [false, false, 'woodcutting', false], [false, false, 'herbalism', false],
  [false, false, undefined, true], [true, false, undefined, true],
  [false, { ability: 'primary', progress: 0 }, undefined, false], [false, { ability: 'primary', progress: 1 }, undefined, false],
  [false, { ability: 'primary', progress: .4 }, undefined, false], [true, { ability: 'primary', progress: .4 }, undefined, true],
];
for (const character of characters) {
  const rig = character.userData.rig, eyes = rig.eyes, nodes = [], references = [];
  const ability = { Ranger: 'volley', Knight: 'whirlwind', Mage: 'nova' }[rig.className];
  const characterModes = modes.map(mode => [mode[0], typeof mode[1] === 'object' ? { ...mode[1], ability } : mode[1], mode[2], mode[3]]);
  character.traverse(node => { nodes.push(node); if (node.isMesh) references.push([node.geometry, node.material]); });
  assert(eyes.batch.isInstancedMesh && eyes.batch.parent === rig.head);
  assert.equal(new Set(eyes.parts.map(part => part.index)).size, 4);
  const restParts = eyes.parts.map(part => part.rest), buffers = [eyes.batch.instanceMatrix, eyes.batch.instanceMatrix.array];
  const blinkStart = eyes.period - .18 - eyes.phase;
  const rootPosition = [12, 4, -8], rootScale = [1.1, 1.1, 1.1]; character.position.fromArray(rootPosition); character.rotation.y = .8; character.scale.fromArray(rootScale);
  const probeObject = new THREE.Object3D(), probeGeometry = new THREE.BufferGeometry(), probeMaterial = new THREE.MeshBasicMaterial();
  for (const mode of characterModes) for (const [offset, expected] of [[-.02, 1], [.075, .025], [.20, 1]]) {
    const time = blinkStart + offset;
    animateCharacter(character, time, ...mode); character.updateMatrixWorld(true);
    assert(Math.abs(eyes.openness - expected) < .001, 'eyes open, close and reopen even through gathering, swimming and attack early returns');
    for (const part of eyes.parts) {
      eyes.batch.getMatrixAt(part.index, matrix);
      assert(matrix.elements.every(Number.isFinite));
      assert(Math.abs(matrix.elements[5] - part.rest.elements[5] * expected) < 1e-6, 'the actual eye instance shrinks vertically');
      if (expected === 1) assert(matrix.elements.every((value, i) => Math.abs(value - part.rest.elements[i]) < 1e-6), 'blink completion restores every eye matrix');
    }
    const after = []; character.traverse(node => { after.push(node); assert(node.matrixWorld.elements.every(Number.isFinite)); }); unitPivots(character);
    assert.deepEqual(after, nodes); assert.deepEqual(character.position.toArray(), rootPosition); assert.deepEqual(character.scale.toArray(), rootScale); assert.equal(character.rotation.y, .8);
    assert.equal(eyes.batch.instanceMatrix, buffers[0]); assert.equal(eyes.batch.instanceMatrix.array, buffers[1]);
    assert(eyes.parts.every((part, i) => part.rest === restParts[i]), 'blinking reuses rest matrices');
  }
  assert.equal(new THREE.Object3D().id, probeObject.id + 1, 'animation allocates no scene objects');
  const finalGeometry = new THREE.BufferGeometry(), finalMaterial = new THREE.MeshBasicMaterial();
  assert.equal(finalGeometry.id, probeGeometry.id + 1); assert.equal(finalMaterial.id, probeMaterial.id + 1, 'animation allocates no render assets');
  probeGeometry.dispose(); finalGeometry.dispose(); probeMaterial.dispose(); finalMaterial.dispose();
  const beforeInvalid = rigState(character), beforeOpen = eyes.openness;
  for (const time of [NaN, Infinity, -Infinity]) animateCharacter(character, time, true, true, 'mining', true);
  assert.equal(rigState(character), beforeInvalid); assert.equal(eyes.openness, beforeOpen, 'nonfinite time leaves every transform and instance unchanged');
  for (const progress of [NaN, Infinity, -Infinity]) {
    animateCharacter(character, blinkStart, false, { ability, progress }); character.updateMatrixWorld(true);
    character.traverse(node => assert(node.matrixWorld.elements.every(Number.isFinite), 'malformed attack progress cannot corrupt the rig'));
  }
  const afterReferences = []; character.traverse(node => { if (node.isMesh) afterReferences.push([node.geometry, node.material]); });
  assert.deepEqual(afterReferences, references);
}


// New colors are isolated per equipment slot and never mutate shared originals.
const dyes={head:'#f45183',armor:'#2784cb',legs:'#8129a1',shoes:'#23ad81',back:'#f2ba61'};
const dyedEquipment={...starterGear('Ranger').equipment};
for(const slot of Object.keys(dyes))dyedEquipment[slot]=Object.values(GEAR).find(item=>item.slot===slot&&item.className==='Ranger'&&item.price>0).id;
const dyed=makeCharacter({...DEFAULT_APPEARANCE,armorColors:dyes,hairHighlight:'#d631bf'},dyedEquipment);
for(const [slot,dye] of Object.entries(dyes))for(const mesh of meshes(dyed.getObjectByName(`equipment-${slot}`)))assert.equal(mesh.material.color.getHexString(),dye.slice(1));
const highlighted=makeCharacter({...DEFAULT_APPEARANCE,hairHighlight:'#d631bf'});
assert.equal(highlighted.getObjectByName('hair-swept-hairHighlight').material.color.getHexString(),'d631bf');
const fox=makeCharacter({...DEFAULT_APPEARANCE,race:'foxfolk',skin:'#123456',hair:'#abcdef'});
for(const mesh of meshes(fox.userData.rig.tail).filter(mesh=>mesh.userData.tint!=='fixed'))assert.equal(mesh.material.color.getHexString(),'123456','fox fur follows skin');
for(const race of RACES)for(const className of ['Ranger','Knight','Mage','Cleric']){
 const character=makeCharacter({...DEFAULT_APPEARANCE,race:race.id,className}),rig=character.userData.rig;
 for(const part of [rig.leftArm,rig.rightArm,rig.leftLeg,rig.rightLeg])assert.equal(part.visible,true,'every selectable race has its normal limbs');
 animateCharacter(character,3,false,false,'fishing');assert(rig.fishingRod.visible&&!rig.pickaxe.visible&&!rig.axe.visible);
 assert(rig.fishingRod.getObjectByName('tool-fishing-rod'),'held rod uses the authored Blender model');
 assert.equal(rig.fishingRod.parent,rig.rightArm,'fishing rod stays in the hand');
 animateCharacter(character,4,false);assert(!rig.fishingRod.visible);
}

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8'), start = main.indexOf('function removeRig('), end = main.indexOf('function removeNode(');
assert(start >= 0 && end > start);
const removeRig = Function('THREE', `${stripTypeScriptTypes(main.slice(start, end))}; return removeRig;`)(THREE);
const scene = new THREE.Scene(); scene.add(first, twin);
const instanceDisposals = new Map(), sharedDisposals = new Map();
for (const mesh of meshes(first)) {
  if (mesh.isInstancedMesh) { instanceDisposals.set(mesh, 0); mesh.addEventListener('dispose', () => instanceDisposals.set(mesh, instanceDisposals.get(mesh) + 1)); }
  for (const resource of [mesh.geometry, mesh.material]) if (!sharedDisposals.has(resource)) {
    sharedDisposals.set(resource, 0); resource.addEventListener('dispose', () => sharedDisposals.set(resource, sharedDisposals.get(resource) + 1));
  }
}
const remainingSignature = signature(twin); removeRig(first);
assert.equal(first.parent, null); assert.equal(twin.parent, scene); assert.equal(signature(twin), remainingSignature);
assert([...instanceDisposals.values()].every(count => count === 1)); assert([...sharedDisposals.values()].every(count => count === 0), 'removing one rig preserves shared customization geometry and tint materials');
for (const [geometry, attributes] of sources) for (const [name, values] of Object.entries(attributes)) assert.deepEqual(geometry.attributes[name].array, values, 'construction and animation leave the asset library unchanged');
console.log('PASS: 18 distinct authored male/female race bodies with real clothed chest contours and unit joint scales; 16 haircuts/eight faces and hair highlights; five armor dyes; fox skin-colored tail; hand-held fishing rods; isolated cached tinting; gear hides base clothing and preserves face/eyes; grounded finite rigs; blinking in every mode; no frame scene/render allocations; shared-asset-safe cleanup.');
