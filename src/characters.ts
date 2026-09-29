import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Appearance } from './shared';
import { activeSpecialist, type RaidProgress } from './raid-progression.ts';
import { loadArsenalAssets, arsenalWeapon, animateArsenalWeapon } from './arsenal.ts';
import { makeRaidAdornment } from './raid-model.ts';
import { normalizeAppearance, RACES, GENDERS, FACES, HAIRSTYLES } from './appearance.ts';
import { GEAR, gearById, starterGear, type Equipment, type EquipmentSlot } from './progression.ts';
import { createMonsterModel, animateMonsterModel, enemyAttackPhase, type EnemyAttackPose } from './monster-models.ts';
import { applyDeathAnimation, groundDeathPose } from './death-animation.ts';
import { applyIdleAnimation } from './idle-animation.ts';
import { applyClimbingAnimation, setClimbingAnimations } from './climbing-animation.ts';
import { EMOTES, emoteValid, type EmoteId } from './emotes.ts';
export { setDeathAnimations, DEATH_DURATION } from './death-animation.ts';
import { mountBob, mountSeat } from './mounts.ts';
import type { MountId } from './travel.ts';
import { SPELLS, SPELL_EFFECT_IDS, type AbilityId } from './spells.ts';
import { AUTO_ATTACKS, AUTO_ATTACK_ANIMATION_MS } from './auto-attacks.ts';
export { setMonsterAssets } from './monster-models.ts';
export type { EnemyAttackPose } from './monster-models.ts';

let gearLibrary: THREE.Group | undefined;
let clericLibrary: THREE.Group | undefined;
let customizationLibrary: THREE.Group | undefined;
let raceLibrary: THREE.Group | undefined;
const customizationMaterials = new Map<string, THREE.Material>();
const clericGearMaterials = new Map<string, THREE.MeshStandardMaterial>();
const eyeMatrix = new THREE.Matrix4();

let characterAssets: Promise<void> | undefined;
/** Players and practice NPCs share one decoded kit, including during parallel world startup. */
export function loadCharacterAssets(): Promise<void> {
  return characterAssets ??= Promise.all([...([
    ['race-kit', setCharacterRaces], ['customization-kit', setCharacterCustomization],
    ['gear-kit', setCharacterGear], ['cleric-kit', setCharacterClericAssets],
    ['climbing-animations', setClimbingAnimations],
  ] as const).map(async ([name, install]) => {
    const path = `/models/${name}.glb`, loader = new GLTFLoader();
    try { const asset = await loader.loadAsync(path); install(asset.scene, asset.animations); }
    catch {
      // A newer client can receive an older worker's fallback kit. Queries bypass that fallback.
      const asset = await loader.loadAsync(`${path}?build=${encodeURIComponent(import.meta.url)}`); install(asset.scene, asset.animations);
    }
  }), loadArsenalAssets()]).then(() => {}).catch(error => { characterAssets = undefined; throw error; });
}

export function setCharacterRaces(asset: THREE.Group): void {
  for (const race of RACES) for (const gender of GENDERS) {
    const name = `race-${race.id}-${gender.id}`, root = asset.getObjectByName(name);
    if (!root?.userData.fit) throw new Error(`Missing race anatomy: ${name}`);
    for (const part of ['torso', 'head', 'left-arm', 'right-arm', 'left-leg', 'right-leg']) {
      if (!root.getObjectByName(`${name}-${part}`)) throw new Error(`Missing race joint: ${name}-${part}`);
    }
  }
  asset.traverse(node => { if (node instanceof THREE.Mesh) node.castShadow = node.receiveShadow = true; });
  raceLibrary = asset;
}

/** Imported Blender parts share geometry; tint and transforms belong to each adventurer. */
export function setCharacterCustomization(asset: THREE.Group): void {
  const names=[...HAIRSTYLES.filter(o=>o.id!=='none').map(o=>`hair-${o.id}`),...RACES.filter(o=>o.id!=='human').map(o=>`race-${o.id}`),...FACES.map(o=>`face-${o.id}`),'race-foxfolk-tail','tool-fishing-rod'];
  for(const name of names) if(!asset.getObjectByName(name)) throw new Error(`Missing customization model: ${name}`);
  asset.traverse(node=>{if(node instanceof THREE.Mesh){if(!['skin','hair','hairHighlight','accent','fixed'].includes(node.userData.tint))throw new Error(`Missing customization tint: ${node.name}`);node.castShadow=node.receiveShadow=true;}});
  customizationLibrary=asset;
}
function customizationPart(name:string, appearance:Appearance, library=customizationLibrary): THREE.Object3D | undefined {
  const source=library?.getObjectByName(name);if(!source)return;
  const part=source.clone(true);
  part.traverse(node=>{if(!(node instanceof THREE.Mesh)||node.userData.tint==='fixed')return;
    const armorColor=appearance.armorColors?.[node.userData.slot as keyof NonNullable<Appearance['armorColors']>];
    const tint=armorColor && (node.userData.tint==='outfit'||node.userData.tint==='leather') ? armorColor : node.userData.tint==='leather'?leather:appearance[node.userData.tint as 'skin'|'hair'|'hairHighlight'|'outfit'|'accent']!;
    const sourceMaterial=node.material as THREE.MeshStandardMaterial,key=`${sourceMaterial.uuid}:${tint}`;
    let material=customizationMaterials.get(key);
    if(!material){material=sourceMaterial.clone();(material as THREE.MeshStandardMaterial).color.set(tint);customizationMaterials.set(key,material);}
    node.material=material;
  });
  return part;
}

/** Loaded once before character selection; all avatars share the imported meshes. */
export function setCharacterGear(asset: THREE.Group): void {
  for (const item of Object.values(GEAR)) if (item.model && !item.model.startsWith('cleric-') && !asset.getObjectByName(item.model)) throw new Error(`Missing equipment model: ${item.model}`);
  asset.traverse(node => { if (node instanceof THREE.Mesh) node.castShadow = node.receiveShadow = true; });
  gearLibrary = asset;
}

/** Separate kit keeps the original equipment library and its cached buffers intact. */
export function setCharacterClericAssets(asset: THREE.Group): void {
  for (const part of ['head', 'body', 'legs', 'shoes', 'back', 'weapon', 'offhand']) {
    if (!asset.getObjectByName(`cleric-${part}`)) throw new Error(`Missing Cleric equipment: cleric-${part}`);
  }
  asset.traverse(node => { if (node instanceof THREE.Mesh) node.castShadow = node.receiveShadow = true; });
  clericLibrary = asset;
}

const cube = new THREE.BoxGeometry(1, 1, 1);
const materials = new Map<string, THREE.MeshStandardMaterial>();
const ink = '#26333e';
const leather = '#704836';
const gold = '#f3c36d';
const steel = '#bacdd2';
const instanceMaterial = new THREE.MeshStandardMaterial({ roughness: 0.88 });
const poseBlock = new THREE.Object3D();
const poseDirection = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const palmDirection = new THREE.Vector3(0, -.625, .04).normalize();
const poseRotation = new THREE.Quaternion();
const bowFacing = new THREE.Quaternion().setFromAxisAngle(up, Math.PI / 2);

function block(parent: THREE.Object3D, color: string, x: number, y: number, z: number, w: number, h: number, d: number) {
  let material = materials.get(color);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color, roughness: 0.88 });
    materials.set(color, material);
  }
  const mesh = new THREE.Mesh(cube, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(w, h, d);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function pivot(parent: THREE.Object3D, name: string, x = 0, y = 0, z = 0) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(x, y, z);
  parent.add(group);
  return group;
}

function rod(parent: THREE.Object3D, color: string, start: number[], end: number[], width: number) {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const direction = b.clone().sub(a);
  const mesh = block(parent, color, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, width, direction.length(), width);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

// Each moving pivot gets one draw call; cubes keep their colors and shared geometry.
function batchCubes(group: THREE.Group): void {
  for (const child of group.children) if (child instanceof THREE.Group) batchCubes(child);
  const meshes = group.children.filter((child): child is THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> => child instanceof THREE.Mesh);
  if (!meshes.length) return;
  const batch = new THREE.InstancedMesh(cube, instanceMaterial, meshes.length);
  batch.name = 'voxel-parts';
  batch.castShadow = true;
  batch.receiveShadow = true;
  const namedParts: Record<string, number> = {};
  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i];
    mesh.updateMatrix();
    batch.setMatrixAt(i, mesh.matrix);
    batch.setColorAt(i, mesh.material.color);
    if (mesh.name) namedParts[mesh.name] = i;
    group.remove(mesh);
  }
  batch.computeBoundingBox();
  batch.computeBoundingSphere();
  batch.userData.namedParts = namedParts;
  group.add(batch);
}

interface CharacterRig {
  body: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftHand: THREE.Group;
  rightHand: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  cape: THREE.Group;
  pickaxe: THREE.Group;
  axe: THREE.Group;
  fishingRod: THREE.Group;
  classGear: THREE.Object3D[];
  gearRotations: THREE.Quaternion[];
  grips: { hand: THREE.Group; batch: THREE.InstancedMesh; held: THREE.Object3D | null | undefined; items: { node: THREE.Object3D; halfSize: THREE.Vector3 }[] }[];
  className: Appearance['className'];
  race: Appearance['race'];
  idleParts: Record<string, THREE.Object3D | undefined>;
  shield?: THREE.Object3D;
  weapon?: THREE.Object3D;
  eyes?: { batch:THREE.InstancedMesh; parts:{index:number;rest:THREE.Matrix4}[]; phase:number; period:number; openness:number };
  tail?: THREE.Object3D;
  bow?: { pivot: THREE.Object3D; batch: THREE.InstancedMesh; parts: Record<string, number> };
}

export interface CharacterAttack { ability: string; progress: number; basic?: boolean }
export interface CharacterTravel { seated?: boolean; mount?: MountId | null; driverId?: string; sprinting?: boolean; exhausted?: boolean; upgraded?: boolean; climbing?: boolean; jump?: { grounded: boolean; velocity: number } }

// Deform the string and nocked arrow inside the existing bow batch, without extra draws.
function drawBow(bow: NonNullable<CharacterRig['bow']>, pull: number, arrowVisible: boolean): void {
  const nock = -0.31 - pull * 0.38;
  for (let side = -1; side <= 1; side += 2) {
    poseBlock.position.set(0, side * 0.24, (-0.31 + nock) / 2);
    poseDirection.set(0, side * 0.48, -0.31 - nock);
    poseBlock.scale.set(0.014, poseDirection.length(), 0.014);
    poseBlock.quaternion.setFromUnitVectors(up, poseDirection.normalize());
    poseBlock.updateMatrix();
    bow.batch.setMatrixAt(bow.parts[side < 0 ? 'string-bottom' : 'string-top'], poseBlock.matrix);
  }
  poseBlock.quaternion.identity();
  for (let i = 0; i < 4; i++) {
    poseBlock.position.set(0, 0, nock + (i === 0 ? 0.42 : i === 1 ? 0.88 : 0.12));
    if (!arrowVisible) poseBlock.scale.setScalar(0);
    else if (i === 0) poseBlock.scale.set(0.035, 0.035, 0.84);
    else if (i === 1) poseBlock.scale.set(0.12, 0.09, 0.14);
    else poseBlock.scale.set(i === 2 ? 0.13 : 0.035, i === 2 ? 0.035 : 0.13, 0.18);
    poseBlock.updateMatrix();
    bow.batch.setMatrixAt(bow.parts[`nocked-arrow-${i}`], poseBlock.matrix);
  }
  bow.batch.instanceMatrix.needsUpdate = true;
}

/** Reusable voxel avatar. Forward is +Z; feet touch Y=0. */
export function makeCharacter(appearance: Appearance, equipment?: Equipment, raidProgress?: RaidProgress): THREE.Group {
  const look=normalizeAppearance(appearance);
  const { skin, hair, hairStyle, outfit, accent, className, race, gender, face } = look;
  const raceName=`race-${race}-${gender}`, raceBody=customizationPart(raceName,look,raceLibrary);
  const raceModel=raceBody?undefined:customizationPart(`race-${race}`,look),faceModel=customizationPart(`face-${face}`,look);
  const equipped = equipment ?? starterGear(className).equipment;
  // Starter clothes retain the chosen outfit colours; purchased body armour covers them.
  const model = (slot: EquipmentSlot) => {
    const id = equipped[slot], item = id ? gearById(id)! : undefined;
    if(id==='death-horns')return makeRaidAdornment('crown');
    if(slot==='weapon'&&item){const authored=arsenalWeapon(item);if(authored)return authored;}
    if (!item?.model || (slot === 'armor' && item.price === 0 && className !== 'Cleric')) return;
    const library = item.model.startsWith('cleric-') ? clericLibrary ?? gearLibrary : gearLibrary;
    return (raceBody ? library?.getObjectByName(`${item.model}-${race}-${gender}`) ?? (['catfolk','dogfolk','lizardfolk'].includes(race) ? library?.getObjectByName(`${item.model}-human-${gender}`) : undefined) : undefined) || library?.getObjectByName(item.model);
  };
  const headGear = model('head'), bodyGear = model('armor'), legGear = model('legs'), shoeGear = model('shoes'), backGear = model('back');
  const weaponGear = model('weapon');
  const character = new THREE.Group();
  character.name = 'voxel-adventurer';
  const body = pivot(character, 'body');
  const joint=(anchor:THREE.Group,name:string)=>{const part=raceBody?.getObjectByName(`${raceName}-${name}`);if(part)anchor.position.copy(part.position);return anchor;};
  const hairModel=!headGear&&hairStyle!=='none'?customizationPart(`hair-${hairStyle}`,look):undefined;

  // The tunic sits over trousers, with a hem, cuffs and a tiny brass buckle.
  if (!raceBody) {
  block(body, outfit, 0, 1.22, 0, 0.7, 0.66, 0.4);
  block(body, outfit, 0, 0.89, 0, 0.77, 0.15, 0.44);
  block(body, accent, 0, 1.49, 0.04, 0.46, 0.12, 0.44);
  block(body, leather, 0, 0.99, 0.015, 0.72, 0.11, 0.45);
  block(body, gold, 0, 0.99, 0.257, 0.12, 0.10, 0.04);
  block(body, leather, -0.24, 1.03, 0.275, 0.14, 0.18, 0.13);
  block(body, gold, -0.24, 1.065, 0.35, 0.045, 0.045, 0.02);
  block(body, skin, 0, 1.60, 0, 0.24, 0.21, 0.22);
  }

  const leftLeg = joint(pivot(body, 'left-leg', 0.20, 0.86, 0),'left-leg');
  const rightLeg = joint(pivot(body, 'right-leg', -0.20, 0.86, 0),'right-leg');
  if (!raceBody) for (const leg of [leftLeg, rightLeg]) {
    if (!legGear) block(leg, '#414b50', 0, -0.24, 0, 0.26, 0.44, 0.28);
    if (!shoeGear) {
    block(leg, leather, 0, -0.58, 0.03, 0.29, 0.40, 0.34);
    block(leg, '#4d382d', 0, -0.77, 0.10, 0.31, 0.18, 0.46);
    block(leg, accent, 0, -0.43, 0, 0.31, 0.08, 0.35);
    }
  }

  const leftArm = joint(pivot(body, 'left-arm', 0.47, 1.44),'left-arm');
  const rightArm = joint(pivot(body, 'right-arm', -0.47, 1.44),'right-arm');
  const leftHand = pivot(leftArm, 'left-hand', 0, -.625, .04);
  const rightHand = pivot(rightArm, 'right-hand', 0, -.625, .04);
  for (const arm of [leftArm, rightArm]) {
    const hand = arm === leftArm ? leftHand : rightHand;
    if (!raceBody) {
    block(arm, outfit, 0, -0.15, 0, 0.28, 0.34, 0.31);
    block(arm, accent, 0, -0.31, 0, 0.29, 0.095, 0.33);
    block(arm, skin, 0, -0.43, 0.005, 0.21, 0.20, 0.23);
    block(arm, leather, 0, -0.54, 0.02, 0.23, 0.13, 0.26);
    block(hand, skin, arm === leftArm ? -.095 : .095, .035, .10, .075, .10, .055);
    block(hand, skin, 0, -.025, .126, .17, .065, .045);
    }
    // Fingers enclose a handle channel instead of burying the handle in a solid cube.
    for (const side of [-1, 1]) {
      block(hand, skin, side * .09, 0, 0, .04, .15, .14).name = `grip-side-${side}`;
      block(hand, skin, 0, 0, side * .0925, .22, .15, .045).name = `grip-front-${side}`;
    }
  }

  const cape = pivot(body, 'cape', 0, 1.49, -0.23);
  if(raceBody){const at=raceBody.userData.fit.cape;cape.position.set(at.x,at.y,at.z);}
  if (!backGear && !raceBody) {
  block(cape, accent, 0, -0.23, -0.08, 0.73, 0.47, 0.09);
  block(cape, accent, 0, -0.54, -0.13, 0.64, 0.18, 0.09);
  block(cape, accent, -0.21, -0.66, -0.15, 0.20, 0.12, 0.09);
  block(cape, accent, 0.21, -0.66, -0.15, 0.20, 0.12, 0.09);
  block(body, leather, 0, 1.22, -0.37, 0.40, 0.42, 0.23);
  block(body, '#a37446', 0, 1.38, -0.395, 0.43, 0.12, 0.25);
  block(body, gold, 0, 1.30, -0.505, 0.065, 0.12, 0.025);
  block(body, '#d6c3a1', 0, 1.49, -0.36, 0.54, 0.15, 0.18);
  }

  const head = joint(pivot(body, 'head', 0, 1.90),'head');
  if(!raceBody)block(head, skin, 0, 0, 0, 0.73, 0.67, 0.62);
  if(!raceBody&&!raceModel){
    block(head, skin, -0.395, -0.065, 0, 0.12, 0.20, 0.20);
    block(head, skin, 0.395, -0.065, 0, 0.12, 0.20, 0.20);
  }
  if(!faceModel){
    block(head, '#f1a48c', -0.245, -0.17, 0.319, 0.11, 0.07, 0.015);
    block(head, '#f1a48c', 0.245, -0.17, 0.319, 0.11, 0.07, 0.015);
    block(head, '#9f6759', 0.012, -0.242, 0.321, 0.11, 0.025, 0.022);
  }
  const eyeHeight=face==='calm'||face==='weathered'?.10:face==='stern'?.11:.14;
  for (const [index,x] of [-0.155,0.155].entries()) {
    block(head, ink, x, -0.045, 0.322, 0.105, eyeHeight, 0.028).name=`eye-${index}`;
    block(head, '#fff4d9', x - 0.018, -0.045+eyeHeight*.26, 0.341, 0.036, eyeHeight*.33, 0.014).name=`eye-glint-${index}`;
    if(!faceModel)block(head, hair, x, 0.092, 0.323, 0.13, 0.044, 0.026);
  }
  if(!raceBody&&(!raceModel||race==='elf'))block(head, skin, 0, -0.12, 0.343, 0.095, 0.085, 0.12);

  if (hairStyle !== 'none' && !headGear && !hairModel) {
    block(head, hair, 0, 0.305, -0.015, 0.78, 0.16, 0.69);
    block(head, hair, 0, 0.09, -0.295, 0.76, 0.37, 0.10);
    if (hairStyle === 'swept') {
      block(head, hair, -0.24, 0.21, 0.29, 0.30, 0.22, 0.13);
      block(head, hair, 0.015, 0.275, 0.30, 0.26, 0.12, 0.12);
      block(head, hair, -0.13, 0.417, -0.04, 0.50, 0.11, 0.46);
      block(head, hair, -0.28, 0.475, -0.06, 0.20, 0.08, 0.33);
      block(head, hair, -0.36, 0.04, -0.015, 0.11, 0.32, 0.43);
    } else if (hairStyle === 'long') {
      for (let i = -1; i <= 1; i++) {
        block(head, hair, i * 0.24, -0.16, -0.33, 0.24, i === 0 ? 0.67 : 0.57, 0.15);
      }
      block(head, hair, -0.35, -0.12, 0.045, 0.14, 0.67, 0.43);
      block(head, hair, 0.35, -0.12, 0.045, 0.14, 0.67, 0.43);
      block(head, hair, -0.205, 0.245, 0.30, 0.35, 0.15, 0.13);
      block(head, hair, 0.225, 0.245, 0.30, 0.31, 0.15, 0.13);
      block(head, accent, -0.36, -0.30, 0.11, 0.155, 0.08, 0.20);
      block(head, accent, 0.36, -0.30, 0.11, 0.155, 0.08, 0.20);
    } else {
      block(head, hair, 0, 0.438, -0.07, 0.19, 0.18, 0.58);
      block(head, hair, 0, 0.558, -0.095, 0.16, 0.12, 0.36);
      block(head, hair, 0, 0.335, 0.32, 0.18, 0.18, 0.12);
    }
  }

  if (className === 'Ranger') {
    const bow = pivot(leftArm, 'bow', 0, -.625, .04);
    const points = [[0, -0.48, -0.05], [0, -0.35, 0.16], [0, 0, 0.26], [0, 0.35, 0.16], [0, 0.48, -0.05]];
    for (let i = 1; i < points.length; i++) rod(bow, '#b98448', points[i - 1], points[i], 0.065);
    rod(bow, '#f1dfab', points[0], [0, 0, -0.05], 0.014).name = 'string-bottom';
    rod(bow, '#f1dfab', points[4], [0, 0, -0.05], 0.014).name = 'string-top';
    for (let i = 0; i < 4; i++) block(bow, i === 0 ? '#e4c992' : i === 1 ? steel : accent, 0, 0, 0, 0, 0, 0).name = `nocked-arrow-${i}`;
    block(bow, leather, 0, 0, 0.26, 0.082, 0.16, 0.082).name = 'weapon-grip';
    if (!backGear) {
    const quiver = pivot(body, 'quiver', 0.31, 1.35, -0.40);
    if(raceBody)quiver.position.set(leftArm.position.x*.66,leftArm.position.y-.09,cape.position.z-.17);
    quiver.rotation.z = -0.22;
    block(quiver, leather, 0, -0.09, 0, 0.19, 0.51, 0.20);
    for (const x of [-0.045, 0.045]) {
      block(quiver, '#dfca94', x, 0.29, 0, 0.025, 0.38, 0.025);
      block(quiver, accent, x, 0.47, 0, 0.065, 0.11, 0.07);
    }
    }
    if (!headGear) {
    const feather = block(head, accent, 0.42, 0.25, -0.06, 0.075, 0.34, 0.11);
    feather.rotation.z = -0.3;
    }
  } else if (className === 'Knight') {
    if (!bodyGear && !raceBody) {
    block(body, steel, 0, 1.285, 0.23, 0.49, 0.37, 0.09);
    block(body, '#e4eff0', 0, 1.30, 0.285, 0.10, 0.29, 0.025);
    block(body, gold, 0, 1.41, 0.304, 0.19, 0.065, 0.035);
    for (const arm of [leftArm, rightArm]) {
      block(arm, steel, 0, -0.035, 0, 0.38, 0.18, 0.40);
      block(arm, '#e4eff0', 0, 0.045, 0, 0.28, 0.055, 0.34);
    }
    }
    const sword = pivot(rightArm, 'sword', 0, -.625, .04);
    sword.rotation.x = rightArm.position.y < 1.3 ? 2.05 : 2.2;
    block(sword, leather, 0, 0, 0, 0.065, 0.22, 0.065).name = 'weapon-grip';
    block(sword, gold, 0, -0.145, 0, 0.10, 0.07, 0.10);
    block(sword, gold, 0, 0.14, 0, 0.31, 0.07, 0.11);
    block(sword, steel, 0, 0.49, 0, 0.13, 0.66, 0.065);
    block(sword, '#eff9ed', -0.037, 0.49, 0.035, 0.035, 0.62, 0.012);
    block(sword, steel, 0, 0.855, 0, 0.073, 0.10, 0.055);
    const shield = pivot(leftArm, 'shield', 0, -.625, .04);
    block(shield, leather, 0, -.105, -.19, .085, .24, .085).name = 'weapon-grip';
    for (const y of [-.25, .04]) block(shield, leather, 0, y, -.115, .11, .045, .20);
    block(shield, gold, 0, 0, 0, 0.43, 0.53, 0.09);
    block(shield, gold, 0, -0.31, 0, 0.29, 0.12, 0.09);
    block(shield, accent, 0, 0, 0.052, 0.33, 0.43, 0.04);
    block(shield, gold, 0, 0, 0.08, 0.075, 0.30, 0.028);
    block(shield, gold, 0, 0.045, 0.08, 0.23, 0.07, 0.028);
  } else if (className === 'Cleric') {
    // A compact sun mace and prayer tome distinguish the Cleric even before GLB loading.
    if (!bodyGear) {
      const torso = raceBody?.userData.fit.torso;
      const chestY = torso?.chestY ?? 1.31, front = (torso?.chestFront ?? .225) + .065;
      block(body, '#e8ddbf', 0, chestY, front, (torso?.chestWidth ?? .7) * .92, .43, .075);
      for (const side of [-1, 1]) block(body, '#327c78', side * .22, chestY - .09, front + .044, .13, .62, .028);
      block(body, gold, 0, chestY - .23, front + .06, .69, .05, .035);
      block(body, '#ffe9ac', 0, chestY + .08, front + .06, .12, .12, .045).rotation.z = Math.PI / 4;
      for (const arm of [leftArm, rightArm]) {
        block(arm, '#e8ddbf', 0, .035, 0, .36, .15, .39);
        block(arm, gold, 0, .11, 0, .30, .04, .35);
      }
    }
    const mace = pivot(rightArm, 'mace', 0, -.625, .04);
    mace.rotation.set(.18, 0, .32);
    block(mace, leather, 0, 0, 0, .105, .21, .105).name = 'weapon-grip';
    block(mace, leather, 0, .16, 0, .08, .59, .08);
    block(mace, gold, 0, -.18, 0, .12, .09, .12);
    block(mace, gold, 0, .49, 0, .37, .27, .28);
    block(mace, '#e8ddbf', 0, .49, .16, .22, .17, .045);
    block(mace, '#ffe9ac', 0, .49, .19, .10, .10, .025).rotation.z = Math.PI / 4;
    const tome = pivot(leftArm, 'tome', 0, -.625, .04);
    tome.rotation.set(-.13, .15, -.10);
    block(tome, leather, 0, 0, 0, .095, .205, .095).name = 'weapon-grip';
    block(tome, '#327c78', 0, .045, .19, .4, .53, .095);
    block(tome, '#ddcda0', 0, .045, .25, .35, .46, .075);
    block(tome, '#224b50', 0, .045, .3, .4, .53, .04);
    block(tome, gold, 0, .06, .33, .16, .16, .03).rotation.z = Math.PI / 4;
  } else {
    if (!bodyGear && !raceBody) {
    block(body, accent, 0, 0.81, 0, 0.80, 0.21, 0.46);
    block(body, gold, 0, 1.33, 0.243, 0.08, 0.18, 0.05);
    const gem = block(body, '#bbf5e1', 0, 1.27, 0.276, 0.09, 0.09, 0.05);
    gem.rotation.z = Math.PI / 4;
    }
    const staff = pivot(rightArm, 'staff', 0, -.625, .04);
    staff.rotation.set(1.2, 0, .20);
    block(staff, '#8a5f49', 0, 0.24, 0, 0.075, 1.62, 0.075);
    block(staff, leather, 0, 0, 0, .10, .20, .10).name = 'weapon-grip';
    block(staff, gold, 0, 0.94, 0, 0.16, 0.11, 0.16);
    block(staff, gold, -0.14, 1.07, 0, 0.065, 0.24, 0.08);
    block(staff, gold, 0.14, 1.07, 0, 0.065, 0.24, 0.08);
    const crystal = block(staff, '#adf6df', 0, 1.18, 0, 0.20, 0.25, 0.20);
    crystal.rotation.z = Math.PI / 4;
    block(staff, '#e9fff0', -0.045, 1.24, 0.11, 0.07, 0.09, 0.028);
    block(leftArm, gold, 0, -0.40, 0, 0.24, 0.065, 0.25);
  }

  // Equipped details join the same animated batches; a new kit never changes the base identity.
  const weapon = equipment && gearById(equipment.weapon)!;
  if (!weaponGear && weapon?.slot === 'weapon' && weapon.className === className && weapon.price > 0) {
    if (className === 'Ranger') {
      const bow = character.getObjectByName('bow')!;
      bow.scale.set(1, 1.18, 1.05);
      for (const side of [-1, 1]) {
        block(bow, weapon.color, 0, side * 0.35, 0.17, 0.13, 0.15, 0.13);
        block(bow, steel, 0, side * 0.47, -0.01, 0.14, 0.15, 0.12);
      }
      block(bow, '#d6f7d4', 0, 0, 0.325, 0.12, 0.12, 0.055);
    } else if (className === 'Knight') {
      const sword = character.getObjectByName('sword')!;
      sword.scale.set(1.12, 1.15, 1);
      block(sword, weapon.color, 0, 0.50, 0.052, 0.075, 0.61, 0.025);
      block(sword, weapon.color, 0, 0.14, 0, 0.43, 0.09, 0.14);
      block(sword, '#f9f3c7', 0, 0.14, 0.09, 0.11, 0.13, 0.065);
      for (const side of [-1, 1]) block(sword, weapon.color, side * 0.10, 0.26, 0, 0.10, 0.15, 0.08);
    } else if (className === 'Cleric') {
      const mace = character.getObjectByName('mace')!;
      block(mace, weapon.color, 0, .49, .213, .18, .18, .025).rotation.z = Math.PI / 4;
    } else {
      const staff = character.getObjectByName('staff')!;
      block(staff, weapon.color, 0, 1.20, 0, 0.31, 0.32, 0.30).rotation.z = Math.PI / 4;
      block(staff, '#f2e8ff', -0.06, 1.27, 0.17, 0.11, 0.11, 0.055);
      for (const side of [-1, 1]) {
        block(staff, steel, side * 0.23, 1.09, 0, 0.075, 0.32, 0.12);
        block(staff, weapon.color, side * 0.17, 1.32, 0, 0.14, 0.10, 0.11);
      }
      block(staff, weapon.color, 0, 0.60, 0, 0.13, 0.12, 0.13);
    }
  }
  const armor = equipment && gearById(equipment.armor)!;
  if (!bodyGear && armor?.slot === 'armor' && armor.className === className && armor.price > 0) {
    block(body, armor.color, 0, 1.25, 0.29, 0.59, 0.46, 0.10);
    block(body, gold, 0, 1.49, 0.32, 0.60, 0.07, 0.10);
    block(body, gold, 0, 1.04, 0.33, 0.61, 0.065, 0.09);
    block(body, accent, 0, 1.25, 0.35, 0.16, 0.36, 0.025);
    for (const arm of [leftArm, rightArm]) {
      block(arm, armor.color, 0, 0.015, 0, 0.44, 0.20, 0.45);
      block(arm, gold, 0, 0.12, 0, 0.35, 0.055, 0.39);
      block(arm, armor.color, 0, -0.40, 0.02, 0.265, 0.12, 0.30);
    }
    if (className === 'Knight') {
      for (const leg of [leftLeg, rightLeg]) block(leg, armor.color, 0, -0.54, 0.225, 0.27, 0.25, 0.075);
      block(character.getObjectByName('shield')!, armor.color, 0, 0, 0.105, 0.32, 0.41, 0.035);
      block(character.getObjectByName('shield')!, gold, 0, 0, 0.14, 0.14, 0.21, 0.045);
    } else {
      block(cape, armor.color, 0, -0.26, -0.145, 0.78, 0.51, 0.10);
      block(cape, gold, 0, -0.53, -0.16, 0.72, 0.065, 0.10);
      if (className === 'Mage') {
        block(body, armor.color, 0, 0.80, 0.02, 0.84, 0.25, 0.49);
        block(body, gold, 0, 0.675, 0.02, 0.86, 0.065, 0.51);
      }
    }
  }
  const charm = equipment?.charm ? gearById(equipment.charm)! : undefined;
  if (!model('charm') && charm?.slot === 'charm' && (!charm.className || charm.className === className)) {
    for (const side of [-1, 1]) rod(body, charm.color, [side * 0.14, 1.58, 0.26], [0, 1.31, 0.41], 0.03);
    block(body, charm.color, 0, 1.26, 0.405, 0.23, 0.25, 0.13);
    block(body, '#fff1ad', 0, 1.26, 0.48, 0.135, 0.15, 0.04);
    block(body, charm.color, 0, 1.405, 0.405, 0.12, 0.045, 0.10);
  }

  // Tools stay attached to the right hand; only their existing pivots move during gathering.
  const pickaxe = pivot(rightArm, 'pickaxe', 0, -.625, .04);
  pickaxe.rotation.set(1.75, Math.PI / 2, 0);
  block(pickaxe, '#9d7146', 0, 0.27, 0, 0.075, 0.93, 0.075);
  block(pickaxe, leather, 0, 0, 0, 0.10, 0.25, 0.10).name = 'weapon-grip';
  block(pickaxe, gold, 0, 0.65, 0, 0.12, 0.13, 0.12);
  block(pickaxe, steel, 0, 0.74, 0, 0.76, 0.13, 0.15);
  block(pickaxe, '#e4eff0', -0.36, 0.675, 0, 0.17, 0.15, 0.12);
  block(pickaxe, steel, 0.36, 0.675, 0, 0.17, 0.15, 0.12);
  block(pickaxe, steel, -0.43, 0.59, 0, 0.10, 0.12, 0.085);
  block(pickaxe, steel, 0.43, 0.59, 0, 0.10, 0.12, 0.085);
  const axe = pivot(rightArm, 'axe', 0, -.625, .04);
  axe.rotation.x = 1.55;
  block(axe, '#9d7146', 0, 0.23, 0, 0.09, 0.84, 0.09);
  block(axe, leather, 0, 0, 0, 0.12, 0.24, 0.12).name = 'weapon-grip';
  block(axe, gold, 0, 0.57, 0, 0.14, 0.16, 0.14);
  block(axe, steel, -0.20, 0.60, 0, 0.34, 0.27, 0.15);
  block(axe, steel, -0.35, 0.58, 0, 0.17, 0.40, 0.13);
  block(axe, '#e4eff0', -0.45, 0.58, 0, 0.07, 0.43, 0.08);
  const fishingRod=pivot(rightArm,'fishing-rod',0,-.625,.04);
  const rodModel=customizationPart('tool-fishing-rod',look);
  if(rodModel)fishingRod.add(rodModel);
  else { rod(fishingRod,'#9d7146',[0,0,0],[0,.80,.95],.045);rod(fishingRod,'#d9d5bf',[0,.80,.95],[0,-.30,1.1],.012);block(fishingRod,accent,0,-.30,1.1,.065,.09,.065); }
  pickaxe.visible = axe.visible = fishingRod.visible = false;
  const classGear = ['bow', 'sword', 'shield', 'staff', 'mace', 'tome'].flatMap(name => {
    const gear = character.getObjectByName(name);
    return gear ? [gear] : [];
  });

  const rig: CharacterRig = { body, head, leftArm, rightArm, leftHand, rightHand, leftLeg, rightLeg, cape, pickaxe, axe, fishingRod, classGear, gearRotations: [], grips: [], className, race, idleParts: {} };
  character.userData.rig = rig;
  const weaponHolder = character.getObjectByName(({ Ranger: 'bow', Knight: 'sword', Mage: 'staff', Cleric: 'mace' } as const)[className]) as THREE.Group;
  rig.weapon = weaponHolder;
  if (weaponGear) for (const part of [...weaponHolder.children]) {
    // Keep the animated string and arrow; the Blender model supplies the handle and limbs.
    if (className !== 'Ranger' || !/^(string-|nocked-arrow-)/.test(part.name)) weaponHolder.remove(part);
  }
  const offhand = className === 'Cleric' ? character.getObjectByName('tome') : undefined;
  const offhandSource = (clericLibrary ?? gearLibrary)?.getObjectByName('cleric-offhand');
  if (offhand && offhandSource) offhand.clear();
  // Rotate and upgrade the bow around its leather grip, never around its string.
  const bowModel = character.getObjectByName('bow');
  if (bowModel) {
    bowModel.rotation.z = -.65;
    for (const part of bowModel.children) part.position.z -= .26;
  }
  const shieldModel = character.getObjectByName('shield');
  if (shieldModel) {
    rig.shield = shieldModel;
    for (const part of shieldModel.children) { part.position.y += .105; part.position.z += .19; }
  }
  batchCubes(character);
  const eyeBatch=head.getObjectByName('voxel-parts') as THREE.InstancedMesh;
  const seed=Object.values(look).join('').split('').reduce((seed,ch)=>(seed*31+ch.charCodeAt(0))>>>0,0);
  rig.eyes={batch:eyeBatch,parts:['eye-0','eye-1','eye-glint-0','eye-glint-1'].map(name=>{const index=eyeBatch.userData.namedParts[name],rest=new THREE.Matrix4();eyeBatch.getMatrixAt(index,rest);return {index,rest};}),phase:(seed%3200)/1000,period:4.5+(seed%5)*.2,openness:1};
  // Attach authored parts after batching so their original meshes and vertex colours survive.
  if(raceBody){
    const anchors:Record<string,THREE.Group>={torso:body,head,'left-arm':leftArm,'right-arm':rightArm,'left-leg':leftLeg,'right-leg':rightLeg};
    for(const [name,anchor] of Object.entries(anchors)){
      const part=raceBody.getObjectByName(`${raceName}-${name}`)!;
      part.position.set(0,0,0);
      part.traverse(node=>{const slot=node.userData.slot;if((slot==='armor'&&bodyGear)||(slot==='legs'&&legGear)||(slot==='shoes'&&shoeGear))node.visible=false;});
      if (anchor === leftArm || anchor === rightArm) {
        const hand = anchor === leftArm ? leftHand : rightHand;
        for (const digits of [...part.children]) if (digits.userData.anatomy === 'hand') {
          digits.position.sub(hand.position); hand.add(digits);
        }
      }
      anchor.add(part);
    }
    const tail=raceBody.getObjectByName(`${raceName}-tail`);if(tail){body.add(tail);rig.tail=tail;}
    character.userData.raceModel=raceName;
  }
  for(const part of [raceModel,faceModel,hairModel])if(part)head.add(part);
  if(race==='foxfolk'&&!raceBody){const tail=customizationPart('race-foxfolk-tail',look);if(tail){body.add(tail);rig.tail=tail;}}
  const bow = character.getObjectByName('bow');
  if (bow) {
    const batch = bow.getObjectByName('voxel-parts') as THREE.InstancedMesh;
    rig.bow = { pivot: bow, batch, parts: batch.userData.namedParts };
    // The drawn arrow can extend beyond the resting limbs of the bow.
    if (batch.boundingSphere) batch.boundingSphere.radius = Math.max(batch.boundingSphere.radius, 1.4);
    drawBow(rig.bow, 0, false);
  }
  // Imported geometry is attached after voxel batching, so it keeps its authored vertex colours.
  const attach = (slot: EquipmentSlot, anchor: THREE.Group, source = model(slot)) => {
    if (!source) return;
    const mesh = source.clone(true); mesh.name = `equipment-${slot}`; mesh.userData.gearSlot = slot;
    const itemId = equipped[slot], item = itemId ? gearById(itemId)! : undefined;
    if (item?.className === 'Cleric' && item.price > 0 && source.name.startsWith('cleric-')) {
      mesh.traverse(node => {
        if (!(node instanceof THREE.Mesh) || !(node.material instanceof THREE.MeshStandardMaterial)) return;
        const key = `${node.material.uuid}:${item.color}`;
        let tinted = clericGearMaterials.get(key);
        if (!tinted) {
          tinted = node.material.clone();
          // A restrained set tint preserves the authored ivory, teal and brass contrast.
          tinted.color.set(item.color).lerp(new THREE.Color('white'), .55);
          clericGearMaterials.set(key, tinted);
        }
        node.material = tinted;
      });
    }
    const dye=look.armorColors[slot as keyof typeof look.armorColors];
    if(dye)mesh.traverse(node=>{
      if(!(node instanceof THREE.Mesh)||!(node.material instanceof THREE.MeshStandardMaterial))return;
      const key=`dye:${node.material.uuid}:${dye}`;let material=customizationMaterials.get(key);
      if(!material){material=node.material.clone();(material as THREE.MeshStandardMaterial).color.set(dye);customizationMaterials.set(key,material);}
      node.material=material;
    });
    anchor.add(mesh); return mesh;
  };
  const weaponModel = attach('weapon', weaponHolder, weaponGear);
  if (offhand && offhandSource) {
    const tome = offhandSource.clone(true); tome.name = 'equipment-offhand'; offhand.add(tome);
  }
  if (weaponModel && className === 'Ranger') {
    weaponModel.position.z -= .26;
    weaponModel.traverse(node => { if (node.userData.role === 'bow-string') node.visible = false; });
  }
  attach('head', head, headGear);
  const armorModel = attach('armor', body, bodyGear);
  for (const [part, arm] of [['left-arm', leftArm], ['right-arm', rightArm]] as const) {
    const shoulder = armorModel?.getObjectByName(`${bodyGear?.name}-${part}`);
    if (shoulder) arm.add(shoulder);
  }
  for (const leg of [leftLeg, rightLeg]) { attach('legs', leg, legGear); attach('shoes', leg, shoeGear); }
  attach('back', cape, backGear); attach('charm', body); attach('ring1', leftArm); attach('ring2', rightArm);
  const specialist=activeSpecialist(raidProgress,className);
  const wingStage=specialist?specialist.upgrade>=15?3:specialist.upgrade>=10?2:specialist.upgrade>=5?1:0:0;
  if(raidProgress?.equippedCosmetics.includes('apostle-wings')||wingStage){const wings=makeRaidAdornment('wings');wings.name='raid-wings';wings.position.set(0,1.5,-.28);wings.scale.setScalar(wingStage?[.65,.8,1][wingStage-1]:.8);body.add(wings);}
  if(raidProgress?.equippedCosmetics.includes('black-aura')){const aura=makeRaidAdornment('aura');aura.name='raid-aura';aura.position.y=1.2;body.add(aura);}
  if(raidProgress?.equippedCosmetics.includes('apostle-weapon')){const effect=makeRaidAdornment('weapon');effect.name='raid-weapon-skin';effect.position.y=className==='Mage'?1.15:className==='Cleric'?.6:.7;effect.scale.setScalar(.6);weaponHolder.add(effect);}
  rig.gearRotations = classGear.map(gear => gear.quaternion.clone());
  character.updateMatrixWorld(true);
  rig.grips = [leftHand, rightHand].map(hand => ({ hand, batch: hand.getObjectByName('voxel-parts') as THREE.InstancedMesh, held: null,
    items: [pickaxe, axe, fishingRod, ...classGear].filter(item => item.parent === hand.parent).map(node => {
      const bounds = new THREE.Box3(), inverse = node.matrixWorld.clone().invert();
      node.traverse(part => {
        if (!(part instanceof THREE.Mesh)) return;
        const index = part.userData.namedParts?.['weapon-grip'];
        if (part.userData.role !== 'weapon-grip' && index === undefined) return;
        const matrix = new THREE.Matrix4().multiplyMatrices(inverse, part.matrixWorld);
        if (part instanceof THREE.InstancedMesh) { part.getMatrixAt(index, poseBlock.matrix); matrix.multiply(poseBlock.matrix); }
        part.geometry.computeBoundingBox(); bounds.union(part.geometry.boundingBox!.clone().applyMatrix4(matrix));
      });
      const halfSize = bounds.isEmpty() ? new THREE.Vector3(.03, .1, .03) : bounds.getSize(new THREE.Vector3()).multiply(node.scale).multiplyScalar(.5);
      return { node, halfSize };
    }) }));
  syncCharacterGrips(rig);
  rig.idleParts = { body, head, 'left-arm': leftArm, 'right-arm': rightArm, 'left-leg': leftLeg, 'right-leg': rightLeg, cape, tail: rig.tail };
  return character;
}

/** Shared joints keep each race's authored proportions, including equipped armour. */
function animateEmote(rig: CharacterRig, id: EmoteId, elapsed: number): void {
  const { body, head, leftArm, rightArm, leftLeg, rightLeg, cape, tail } = rig;
  for (const part of Object.values(rig.idleParts)) part?.rotation.set(0, 0, 0);
  body.position.set(0, 0, 0);
  leftArm.rotation.z = -.045; rightArm.rotation.z = .045; cape.rotation.x = -.08;
  for (const gear of rig.classGear) gear.visible = false;
  const beat = elapsed * Math.PI * 2, sway = Math.sin(beat), bounce = Math.abs(sway);
  if (id === 'dance') {
    switch (rig.race) {
      case 'human': // Side shuffle, alternating heels and swinging arms.
        body.position.set(sway * .10, bounce * .045, 0); body.rotation.set(0, sway * .20, sway * -.045);
        leftLeg.rotation.set(sway * .55, sway * .16, .06); rightLeg.rotation.set(-sway * .55, sway * .16, -.06);
        leftArm.rotation.set(-.45 - sway * .55, 0, .40); rightArm.rotation.set(-.45 + sway * .55, 0, -.40);
        head.rotation.x = Math.sin(beat * 2) * .10;
        break;
      case 'elf': // A slow full turn with open, floating arms and light steps.
        body.rotation.y = elapsed % 4 * Math.PI / 2;
        body.position.y = bounce * .065;
        leftArm.rotation.set(-.30 + sway * .25, -.20, 1.10 + sway * .18);
        rightArm.rotation.set(-.30 - sway * .25, .20, -1.10 + sway * .18);
        leftLeg.rotation.x = sway * .32; rightLeg.rotation.x = -sway * .32;
        head.rotation.set(-.10, Math.sin(beat / 2) * .25, 0);
        break;
      case 'dwarf': // Wide planted stance and heavy alternating boot stomps.
        body.position.y = bounce * .07; body.rotation.y = sway * .09;
        leftLeg.rotation.set(-Math.max(0, sway) * .85, 0, .19);
        rightLeg.rotation.set(-Math.max(0, -sway) * .85, 0, -.19);
        leftArm.rotation.set(-.85 + sway * .35, 0, .65); rightArm.rotation.set(-.85 - sway * .35, 0, -.65);
        head.rotation.x = .08 + Math.cos(beat * 2) * .12;
        break;
      case 'orc': // Broad alternating overhead drum beats with a torso twist.
        body.rotation.y = sway * .38; body.position.y = bounce * .045;
        leftArm.rotation.set(-1.35 - sway * .95, -.15, .65);
        rightArm.rotation.set(-1.35 + sway * .95, .15, -.65);
        leftLeg.rotation.set(-Math.max(0, -sway) * .35, 0, .22);
        rightLeg.rotation.set(-Math.max(0, sway) * .35, 0, -.22);
        head.rotation.set(.06, -body.rotation.y * .65, 0);
        break;
      case 'goblin': { // Quick jitter, crooked elbows and scissoring feet.
        const jitter = Math.sin(beat * 2);
        body.position.set(jitter * .12, Math.abs(jitter) * .075, 0); body.rotation.z = jitter * -.10;
        leftArm.rotation.set(-1.05 + jitter * .50, sway * .30, .85 + sway * .30);
        rightArm.rotation.set(-1.05 - jitter * .50, -sway * .30, -.85 + sway * .30);
        leftLeg.rotation.set(jitter * .65, 0, sway * .20); rightLeg.rotation.set(-jitter * .65, 0, sway * .20);
        head.rotation.set(0, sway * .30, -jitter * .12);
        break;
      }
      case 'catfolk':
      case 'dogfolk':
      case 'lizardfolk':
      case 'foxfolk': // Springy two-foot hops with a sweeping, counterbalanced tail.
        body.position.set(sway * .07, bounce * .24, 0); body.rotation.y = sway * .27;
        leftLeg.rotation.set(-bounce * .45, 0, .09); rightLeg.rotation.set(-bounce * .45, 0, -.09);
        leftArm.rotation.set(-.55 + sway * .20, 0, .80 + bounce * .45);
        rightArm.rotation.set(-.55 - sway * .20, 0, -.80 - bounce * .45);
        head.rotation.set(-bounce * .10, -sway * .18, sway * .07);
        if (tail) tail.rotation.set(-.22 - bounce * .25, sway * .85, 0);
        if(rig.race==='catfolk'){body.rotation.z=sway*.16;head.rotation.y=sway*.30;}
        if(rig.race==='dogfolk'){head.rotation.z=sway*.18;body.position.y=bounce*.12;}
        if(rig.race==='lizardfolk'){body.rotation.y=sway*.45;leftArm.rotation.x=-bounce*.8;}
        break;
    }
    cape.rotation.x = -.12 - bounce * .12;
  } else if (id === 'laugh') {
    const chuckle = Math.sin(beat * 3);
    body.position.y = Math.abs(chuckle) * .035; body.rotation.x = .08 + chuckle * .035;
    head.rotation.set(-.27 + chuckle * .12, 0, sway * .06);
    leftArm.rotation.set(-.70, 0, -.50); rightArm.rotation.set(-.70, 0, .50);
  } else if (id === 'wave') {
    rightArm.rotation.set(-.15, 0, -2.60 + Math.sin(beat * 2) * .38);
    head.rotation.set(-.06, -.15, -.08);
  } else if (id === 'cheer') {
    body.position.y = bounce * .12; head.rotation.x = -.20;
    leftArm.rotation.set(-.30, 0, 2.60 + sway * .18); rightArm.rotation.set(-.30, 0, -2.60 - sway * .18);
  } else if (id === 'clap') {
    // Solve both palms toward a shared point so narrow and broad races actually clap.
    const gap = .045 + (1 - Math.cos(beat * 2)) * .13;
    for (const arm of [leftArm, rightArm]) {
      const x = Math.sign(arm.position.x) * gap - arm.position.x;
      poseDirection.set(x, -.10, Math.sqrt(Math.max(.01, .625 ** 2 + .04 ** 2 - x * x - .10 ** 2))).normalize();
      arm.quaternion.setFromUnitVectors(palmDirection, poseDirection);
    }
    head.rotation.x = -.08;
  } else if (id === 'bow') {
    const lean = .75 * Math.sin(Math.min(1, elapsed / (EMOTES.bow.duration / 1000)) * Math.PI);
    body.rotation.x = lean; leftLeg.rotation.x = rightLeg.rotation.x = -lean;
    body.position.set(0, leftLeg.position.y * (1 - Math.cos(lean)), -leftLeg.position.y * Math.sin(lean));
    head.rotation.x = lean * .35;
    leftArm.rotation.set(-.70, 0, -.55); rightArm.rotation.set(.40, 0, -.15);
  } else if (id === 'shrug') {
    leftArm.rotation.set(-.95, -.45, .80); rightArm.rotation.set(-.95, .45, -.80);
    head.rotation.set(-.08, 0, .18 * Math.sin(beat / 2));
  } else if (id === 'cry') {
    body.rotation.x = .12 + Math.sin(beat * 3) * .025;
    head.rotation.set(.35, Math.sin(beat * 2) * .07, 0);
    leftArm.rotation.set(-2.45, -.25, -.35); rightArm.rotation.set(-2.45, .25, .35);
  }
  const duration = EMOTES[id].duration;
  const weight = THREE.MathUtils.smoothstep(elapsed, 0, .18) * (duration === null ? 1 : THREE.MathUtils.smoothstep(duration / 1000 - elapsed, 0, .25));
  body.position.multiplyScalar(weight);
  for (const part of Object.values(rig.idleParts)) if (part) {
    part.rotation.x *= weight; part.rotation.y *= weight; part.rotation.z *= weight;
  }
}

/** Animates only child pivots, leaving the caller's world position and heading intact. */
function syncCharacterGrips(rig: CharacterRig): void {
  for (const grip of rig.grips) {
    const { hand, items, batch } = grip, held = items.find(item => item.node.visible);
    if (held) hand.quaternion.copy(held.node.quaternion);
    else hand.quaternion.identity();
    if (held?.node === rig.fishingRod) hand.rotateX(Math.atan2(.95, .80));
    if (held?.node === grip.held) continue;
    grip.held = held?.node;
    const x = held ? held.halfSize.x + .002 : 0, z = held ? held.halfSize.z + .002 : 0;
    poseBlock.quaternion.identity();
    for (const side of [-1, 1]) {
      poseBlock.position.set(side * (.11 + x) / 2, 0, 0); poseBlock.scale.set(.11 - x, .15, z * 2); poseBlock.updateMatrix();
      batch.setMatrixAt(batch.userData.namedParts[`grip-side-${side}`], poseBlock.matrix);
      poseBlock.position.set(0, 0, side * (.115 + z) / 2); poseBlock.scale.set(.22, .15, .115 - z); poseBlock.updateMatrix();
      batch.setMatrixAt(batch.userData.namedParts[`grip-front-${side}`], poseBlock.matrix);
    }
    batch.instanceMatrix.needsUpdate = true;
  }
}

/** Apply the wrist grip after every pose, including early-return idle, travel and death poses. */
export function animateCharacter(...args: Parameters<typeof animateCharacterPose>): void {
  animateCharacterPose(...args);
  const rig = args[0].userData.rig as CharacterRig | undefined;
  if (rig) {syncCharacterGrips(rig);animateArsenalWeapon(rig.weapon?.getObjectByName('equipment-weapon'),args[1]);}
}

function blendSpellLimb(limb: THREE.Object3D, x: number, y: number, z: number, blend: number) {
  poseBlock.rotation.set(x, y, z);
  limb.quaternion.slerp(poseBlock.quaternion, blend);
}

function animateCharacterPose(group: THREE.Group, time: number, moving: boolean, attacking: boolean | CharacterAttack = false, gathering?: 'mining' | 'woodcutting' | 'herbalism' | 'fishing', swimming = false, travel?: CharacterTravel, deathProgress?: number, emote?: { id: EmoteId; elapsed: number }): void {
  const rig = group.userData.rig as CharacterRig | undefined;
  if (!rig || !Number.isFinite(time)) return;
  const dying = deathProgress !== undefined && Number.isFinite(deathProgress);
  const climbing = !dying && !swimming && !travel?.mount && travel?.climbing;
  if (climbing) { gathering = undefined; attacking = false; }
  if (swimming) gathering = undefined;
  const mounted = !swimming && !attacking && !gathering ? travel?.mount : undefined;
  const airborne = !swimming && travel?.jump && !travel.jump.grounded;
  const sprinting = !airborne && moving && travel?.sprinting && !mounted && !swimming && !attacking && !gathering;
  const exhausted = travel?.exhausted && !mounted && !swimming && !attacking && !gathering;
  const seated = !dying && !attacking && !gathering && !swimming && travel?.seated;
  const resting = !climbing && !seated && !dying && !moving && !attacking && !gathering && !swimming && !airborne;
  const emoting = resting && !mounted && emote && emoteValid(emote.id) && Number.isFinite(emote.elapsed) && emote.elapsed >= 0
    && (EMOTES[emote.id].duration === null || emote.elapsed * 1000 < EMOTES[emote.id].duration!);
  const idle = resting && !exhausted && !emoting;
  if (!idle) applyIdleAnimation(mounted ? 'rider' : 'player', group, rig.idleParts, time, false);
  if(rig.eyes){
    const eyes=rig.eyes,phase=((time+eyes.phase)%eyes.period+eyes.period)%eyes.period,progress=(phase-eyes.period+.18)/.18;
    const openness=dying ? .025 : progress<=0?1:Math.max(.025,progress<.3?1-progress/.3:progress<.55?0:(progress-.55)/.45);
    if(openness!==eyes.openness){for(const part of eyes.parts){eyeMatrix.copy(part.rest);eyeMatrix.elements[5]*=openness;eyeMatrix.elements[13]=-.045+(part.rest.elements[13]+.045)*openness;eyes.batch.setMatrixAt(part.index,eyeMatrix);}eyes.batch.instanceMatrix.needsUpdate=true;eyes.openness=openness;}
  }
  if (dying) {
    rig.pickaxe.visible = rig.axe.visible = rig.fishingRod.visible = false;
    for (const [index, gear] of rig.classGear.entries()) { gear.visible = true; gear.quaternion.copy(rig.gearRotations[index]); }
    if (rig.bow) { rig.bow.pivot.rotation.set(0, 0, -.65); drawBow(rig.bow, 0, false); }
    if (rig.shield) rig.shield.rotation.set(0, 0, 0);
    if (rig.tail) rig.tail.rotation.set(-Math.PI / 2 * THREE.MathUtils.clamp(deathProgress!, 0, 1), 0, 0);
    rig.body.position.set(0, 0, 0);
    applyDeathAnimation('player', { body: rig.body, head: rig.head, 'left-arm': rig.leftArm, 'right-arm': rig.rightArm, 'left-leg': rig.leftLeg, 'right-leg': rig.rightLeg, cape: rig.cape, ...Object.fromEntries(rig.classGear.map(gear => [gear.name, gear])) }, deathProgress!);
    groundDeathPose(group, rig.body);
    return;
  }
  if(rig.tail)rig.tail.rotation.set(0,Math.sin(time*2.1)*.13,0);
  const stride = moving ? Math.sin(time * (sprinting ? 16 : 11)) : 0;
  const breath = Math.sin(time * (exhausted ? 5.8 : 2.7));
  rig.pickaxe.visible = gathering === 'mining';
  rig.axe.visible = gathering === 'woodcutting';
  rig.fishingRod.visible = gathering === 'fishing';
  for (const [index, gear] of rig.classGear.entries()) { gear.visible = !mounted && !gathering && (!swimming || !!attacking); gear.quaternion.copy(rig.gearRotations[index]); }
  if (rig.bow) { rig.bow.pivot.rotation.set(0, 0, -.65); drawBow(rig.bow, 0, false); }
  if (rig.shield) rig.shield.rotation.set(0, 0, 0);
  if (climbing) {
    rig.body.position.set(0, 0, 0);
    for (const joint of Object.values(rig.idleParts)) joint?.rotation.set(0, 0, 0);
    for (const gear of rig.classGear) gear.visible = false;
    applyClimbingAnimation(rig.idleParts, time, moving);
    return;
  }
  if (emoting) { animateEmote(rig, emote.id, emote.elapsed); return; }
  if (idle && !mounted) {
    rig.body.position.set(0, 0, 0); rig.body.rotation.set(0, 0, 0); rig.head.rotation.set(0, 0, 0);
    rig.leftLeg.rotation.set(0, 0, 0); rig.rightLeg.rotation.set(0, 0, 0);
    rig.leftArm.rotation.set(0, 0, -.045); rig.rightArm.rotation.set(rig.className === 'Mage' ? -.75 : 0, 0, rig.className === 'Mage' ? -.35 : .045); rig.cape.rotation.set(-.08, 0, 0);
    rig.tail?.rotation.set(0, 0, 0);
    if (applyIdleAnimation('player', group, rig.idleParts, time)) return;
    if (rig.tail) rig.tail.rotation.y = Math.sin(time * 2.1) * .13;
  }
  rig.body.rotation.set(0, 0, 0);
  rig.body.position.set(0, moving ? Math.abs(stride) * 0.065 : breath * 0.014, 0);
  rig.head.rotation.set(0, 0, moving ? stride * 0.025 : breath * 0.015);
  rig.leftLeg.rotation.set(stride * 0.62, 0, 0);
  rig.rightLeg.rotation.set(-stride * 0.62, 0, 0);
  rig.leftArm.rotation.set(-stride * 0.40, 0, -0.045 - breath * 0.015);
  // Carry the staff ahead and outside the torso; its shaft leaves the fist across the forearm.
  rig.rightArm.rotation.set(rig.className === 'Mage' ? -.75 + stride * .20 : stride * .40, 0, rig.className === 'Mage' ? -.35 : .045 + breath * .015);
  rig.cape.rotation.set(-0.08 - (moving ? 0.20 + Math.abs(stride) * 0.12 : breath * 0.025), 0, 0);
  if (seated) {
    rig.body.position.set(0, .8 - rig.leftLeg.position.y, 0);
    rig.body.rotation.set(.025, 0, 0);rig.head.rotation.set(-.025+breath*.01,Math.sin(time*.7)*.04,0);
    rig.leftLeg.rotation.set(-1.22,0,.06);rig.rightLeg.rotation.set(-1.22,0,-.06);
    rig.leftArm.rotation.set(-.65,0,-.10);rig.rightArm.rotation.set(-.65,0,.10);
    rig.cape.rotation.set(.12,0,0);
    for(const gear of rig.classGear)gear.visible=false;
    return;
  }
  if (mounted) {
    const hipY = rig.leftLeg.position.y, lean = airborne ? (travel!.jump!.velocity > 0 ? .24 : -.06) : moving ? .10 : .035;
    // Rotate around the authored hips: every race sits on the saddle without scaling its anatomy.
    rig.body.rotation.x = lean;
    rig.body.position.set(0, mountBob(time, moving, travel?.upgraded, mounted, !!airborne) + hipY * (1 - Math.cos(lean)), mountSeat(mounted, !!travel?.driverId).seatZ - hipY * Math.sin(lean));
    rig.head.rotation.set(-lean, Math.sin(time * .8) * .025, 0);
    rig.leftLeg.rotation.set(-.48, -.10, .72);
    rig.rightLeg.rotation.set(-.48, .10, -.72);
    rig.leftArm.rotation.set(-.74, 0, -.35);
    rig.rightArm.rotation.set(-.74, 0, .35);
    rig.cape.rotation.x = mounted === 'verdant-revenant' ? -.25 + Math.sin(time * 1.65) * .08 : moving ? -.50 + Math.sin(time * 12) * .055 : -.10;
    if (idle) {
      rig.head.rotation.y = 0; rig.tail?.rotation.set(0, 0, 0);
      if (!applyIdleAnimation('rider', group, rig.idleParts, time)) {
        rig.head.rotation.y = Math.sin(time * .8) * .025;
        if (rig.tail) rig.tail.rotation.y = Math.sin(time * 2.1) * .13;
      }
    }
    return;
  }
  if (airborne) {
    const rising = travel!.jump!.velocity > 0;
    rig.body.position.set(0, 0, 0);
    rig.body.rotation.x = rising ? .12 : -.06;
    rig.head.rotation.x = rising ? -.12 : .06;
    rig.leftLeg.rotation.set(rising ? -.65 : -.18, 0, .08);
    rig.rightLeg.rotation.set(rising ? .35 : -.12, 0, -.08);
    rig.leftArm.rotation.set(-.85, 0, -.30);
    rig.rightArm.rotation.set(-.65, 0, rig.className === 'Mage' ? -.35 : .30);
    rig.cape.rotation.x = rising ? -.8 : -.35;
    if (!attacking) return;
  }
  if (!airborne && (sprinting || exhausted)) {
    const lean = sprinting ? .22 : .13, hipY = rig.leftLeg.position.y;
    rig.body.rotation.x = lean;
    rig.body.position.y += hipY * (1 - Math.cos(lean)) + (sprinting ? Math.abs(stride) * .07 : breath * .023);
    rig.body.position.z = -hipY * Math.sin(lean);
    rig.head.rotation.x = -lean * .65;
    if (sprinting) {
      rig.leftLeg.rotation.x = stride * .95; rig.rightLeg.rotation.x = -stride * .95;
      rig.leftArm.rotation.x = -.25 - stride * .78; rig.rightArm.rotation.x = rig.className === 'Mage' ? -.75 + stride * .25 : -.25 + stride * .78;
      rig.cape.rotation.x = -.56 - Math.abs(stride) * .16;
    } else {
      rig.leftArm.rotation.x -= .08 + breath * .035; rig.rightArm.rotation.x -= .08 + breath * .035;
    }
  }
  if (swimming) {
    const rate = moving && travel?.sprinting && !travel.exhausted ? 7.6 : 5.4;
    const stroke = Math.sin(time * rate), recovery = Math.cos(time * rate), kick = Math.sin(time * rate * 2);
    if (moving && !attacking) {
      // Lean around the torso rather than moving the world root; alternating arms pull
      // through the surface while the submerged legs kick behind the swimmer.
      rig.body.position.set(0, .18 + breath * .025, -.82);
      rig.body.rotation.set(1.05, 0, recovery * .055);
      rig.head.rotation.set(-.90, recovery * .035, 0);
      rig.leftArm.rotation.set(-1.0 - stroke * 1.45, recovery * .08, .30 + recovery * .18);
      rig.rightArm.rotation.set(-1.0 + stroke * 1.45, -recovery * .08, -.30 + recovery * .18);
      rig.leftLeg.rotation.set(.08 + kick * .28, 0, .055);
      rig.rightLeg.rotation.set(.08 - kick * .28, 0, -.055);
      rig.cape.rotation.x = .24 + recovery * .08;
    } else {
      rig.body.position.set(0, -.38 + breath * .035, -.12);
      rig.body.rotation.set(.12, 0, stroke * .025);
      rig.head.rotation.set(-.10, 0, 0);
      rig.leftArm.rotation.set(-.55 + stroke * .22, .16, .45 + recovery * .18);
      rig.rightArm.rotation.set(-.55 - stroke * .22, -.16, rig.className === 'Mage' ? -.35 : -.45 - recovery * .18);
      rig.leftLeg.rotation.set(-.22 + kick * .20, 0, .12);
      rig.rightLeg.rotation.set(-.22 - kick * .20, 0, -.12);
      rig.cape.rotation.x = .18 + recovery * .06;
    }
    if (!attacking) return;
  }
  if(gathering==='fishing'){
    rig.rightArm.rotation.set(-.55+Math.sin(time*1.8)*.025,0,.04);
    rig.leftArm.rotation.set(-.35,0,-.10);rig.head.rotation.x=.13;return;
  }
  if (gathering) {
    const phase = ((time % 0.92) + 0.92) % 0.92 / 0.92;
    // A slow wind-up followed by a sharp strike reads clearly at the game's camera distance.
    const windup = phase < 0.55 ? (1 - Math.cos(phase / 0.55 * Math.PI)) / 2
      : phase < 0.78 ? (1 + Math.cos((phase - 0.55) / 0.23 * Math.PI)) / 2 : 0;
    rig.leftLeg.rotation.x = rig.rightLeg.rotation.x = 0;
    rig.head.rotation.set(0.16, 0, 0);
    rig.cape.rotation.x = -0.13;
    if (gathering === 'mining') {
      rig.body.position.y = -0.035 * (1 - windup);
      rig.rightArm.rotation.set(-0.35 - windup * 2.30, 0, -0.32);
      rig.leftArm.rotation.set(-0.75 - windup * 1.20, 0, -0.48);
    } else if (gathering === 'woodcutting') {
      rig.body.position.y = -0.025;
      rig.body.rotation.y = 0.18 - windup * 0.32;
      rig.rightArm.rotation.set(-1.08, -0.70 + windup * 1.55, 0.18 + windup * 0.25);
      rig.leftArm.rotation.set(-0.55, 0, -0.30);
    } else {
      const reach = Math.sin(time * Math.PI * 2 / 0.92);
      rig.body.position.y = -0.30;
      rig.head.rotation.x = 0.32;
      rig.leftLeg.rotation.x = -0.95;
      rig.rightLeg.rotation.x = 0.90;
      rig.rightArm.rotation.set(-1.02 + reach * 0.22, 0, -0.12);
      rig.leftArm.rotation.set(-0.80 - reach * 0.15, 0, -0.30);
    }
  } else if (attacking) {
    let progress = typeof attacking === 'boolean' ? ((time % 0.7) + 0.7) % 0.7 / 0.7
      : Number.isFinite(attacking.progress) ? Math.max(0, Math.min(1, attacking.progress)) : 0;
    if (progress === 0 || progress === 1) return;
    const basic = typeof attacking !== 'boolean' && attacking.basic;
    if (basic && rig.className === 'Ranger') {
      // Keep the solved nock/palm motion, releasing at the shared 180ms launch.
      const release = .18 / (AUTO_ATTACK_ANIMATION_MS / 1000);
      progress = progress <= release ? progress / release * .26 : .26 + (progress - release) / (1 - release) * .74;
    }
    const ability = typeof attacking === 'boolean' ? '' : attacking.ability;
    const blend = Math.sin(Math.min(1, progress / 0.12) * Math.PI / 2) * Math.max(0, Math.min(1, (1 - progress) / 0.36));
    if (ability === SPELL_EFFECT_IDS.roll) {
      const angle = progress * Math.PI * 2;
      rig.body.rotation.x = angle;
      rig.body.position.set(0, .8 * (1 - Math.cos(angle)), -.8 * Math.sin(angle));
      rig.leftLeg.rotation.x = rig.rightLeg.rotation.x = -.8;
      rig.leftArm.rotation.x = rig.rightArm.rotation.x = -1;
      return;
    }
    if (rig.className === 'Ranger') {
      const pull = progress < .26 ? Math.sin(progress / .26 * Math.PI / 2) : Math.max(0, 1 - (progress - .26) / .065);
      if (rig.bow) {
        // Prepare the bow before lifting it; lower the arms before untwisting.
        const lift = Math.sin(Math.max(0, Math.min(1, (progress - .02) / .10)) * Math.PI / 2);
        const lower = Math.max(0, Math.min(1, (progress - .55) / .30));
        const settle = Math.max(0, Math.min(1, (1 - progress) / .15));
        const transit = progress < .12 ? Math.sin(progress / .12 * Math.PI) : Math.sin(lower * Math.PI);
        const drop = progress < .12 ? transit * .18 : 0;
        // Keep the follow-through reach when the string springs back.
        const halfDraw = (.31 + (progress > .26 ? 1 : pull) * .38) * rig.bow.pivot.scale.z / 2;
        const shoulder = rig.leftArm.position.x;
        const reach = Math.sqrt(.625 ** 2 + .04 ** 2 - (shoulder - halfDraw) ** 2 - drop ** 2);
        poseDirection.set(halfDraw - shoulder, -drop, reach).normalize();
        poseBlock.quaternion.identity();
        poseRotation.setFromUnitVectors(palmDirection, poseDirection).slerp(poseBlock.quaternion, lower);
        rig.leftArm.quaternion.slerp(poseRotation, lift * settle);
        poseDirection.x *= -1;
        poseRotation.setFromUnitVectors(palmDirection, poseDirection).slerp(poseBlock.quaternion, lower);
        rig.rightArm.quaternion.slerp(poseRotation, lift * settle);
        rig.body.rotation.y = -Math.PI / 2 * lift * settle;
        rig.head.rotation.y = Math.PI / 2 * lift * settle;
        poseRotation.copy(rig.leftArm.quaternion).invert().multiply(bowFacing);
        rig.bow.pivot.quaternion.slerp(poseRotation, Math.min(1, progress / .03, Math.max(0, (.75 - progress) / .10)));
        rig.bow.pivot.rotateZ(transit * 1.57 + .18 * lift * (1 - lower));
        drawBow(rig.bow, pull, progress >= .12 && progress <= .26);
      }
    } else if (basic) {
      if (rig.className === 'Mage') {
        // A short staff snap, without the free-hand preparation of a learned spell.
        const thrust = Math.sin(Math.min(1, progress / (.18 / (AUTO_ATTACK_ANIMATION_MS / 1000))) * Math.PI / 2);
        rig.rightArm.rotation.x += (-.32 - thrust * .36 - rig.rightArm.rotation.x) * blend;
        rig.rightArm.rotation.z += (-.35 - rig.rightArm.rotation.z) * blend;
        rig.leftArm.rotation.x += (-.25 - rig.leftArm.rotation.x) * blend;
        if (rig.weapon) rig.weapon.rotation.x += .78 * thrust * blend;
        rig.body.rotation.y = -.08 * blend;
        rig.head.rotation.x -= .035 * blend;
      } else {
        const contact = AUTO_ATTACKS[rig.className].impactMs! / AUTO_ATTACK_ANIMATION_MS;
        const swing = THREE.MathUtils.smoothstep(progress, .11 / (AUTO_ATTACK_ANIMATION_MS / 1000), contact);
        // The brief backswing becomes a forward weapon hit at exactly 300ms.
        rig.rightArm.rotation.x += (-1.85 + swing * .85 - rig.rightArm.rotation.x) * blend;
        rig.rightArm.rotation.y += ((.24 - swing * .38) - rig.rightArm.rotation.y) * blend;
        rig.rightArm.rotation.z += ((-.16 + swing * .24) - rig.rightArm.rotation.z) * blend;
        rig.leftArm.rotation.x += (-.48 - rig.leftArm.rotation.x) * blend;
        rig.leftArm.rotation.z += (-.16 - rig.leftArm.rotation.z) * blend;
        rig.body.rotation.y = (.13 - swing * .26) * blend;
        rig.head.rotation.y = -rig.body.rotation.y;
        if (rig.shield) rig.shield.rotation.x = -rig.leftArm.rotation.x * blend;
        // The mace turns at its palm-centered grip, never becoming a holy cast.
        if (rig.className === 'Cleric' && rig.weapon) rig.weapon.rotation.x += 1.85 * blend;
      }
      rig.cape.rotation.x -= .06 * blend;
    } else if (rig.className === 'Mage') {
      // The free hand casts forward while the staff rises, then both settle naturally.
      const release = Math.sin(Math.min(1, progress / 0.30) * Math.PI / 2);
      rig.rightArm.rotation.x += (-0.28 - release * 0.42 - rig.rightArm.rotation.x) * blend;
      rig.rightArm.rotation.z += (-.35 - rig.rightArm.rotation.z) * blend;
      rig.leftArm.rotation.x += (-0.90 - release * 0.80 - rig.leftArm.rotation.x) * blend;
      rig.leftArm.rotation.z += ((['nova','arcane-burst','meteor'].includes(ability) ? -0.85 : -0.24) - rig.leftArm.rotation.z) * blend;
      rig.head.rotation.x += (-0.10 - rig.head.rotation.x) * blend;
      rig.body.rotation.y = -0.12 * blend;
      rig.cape.rotation.x -= 0.12 * blend;
    } else if (rig.className === 'Cleric') {
      // Read from the tome, then direct a blessing or a holy bolt with the mace.
      // Both weapons rotate at their actual grip and never leave their palms.
      const release = Math.sin(Math.min(1, progress / .32) * Math.PI / 2);
      const spell = Object.hasOwn(SPELLS, ability) ? SPELLS[ability as AbilityId] : undefined;
      const healing = spell?.effect === 'heal' || spell?.effect === 'shield';
      const pulse = Math.sin(progress * Math.PI * 4) * .035;
      rig.leftArm.rotation.x += ((healing ? -.73 : -.47) - rig.leftArm.rotation.x) * blend;
      rig.leftArm.rotation.z += (-.18 - rig.leftArm.rotation.z) * blend;
      rig.rightArm.rotation.x += ((healing ? -.32 - release * .25 : -.40 - release * .63) - rig.rightArm.rotation.x) * blend;
      rig.rightArm.rotation.z += (.38 - rig.rightArm.rotation.z) * blend;
      rig.head.rotation.x += ((healing ? .12 : -.08) - rig.head.rotation.x) * blend;
      rig.body.rotation.y = (healing ? -.05 : -.15) * blend;
      rig.cape.rotation.x -= (.08 + pulse) * blend;
    } else {
      const sweep = Math.sin(Math.min(1, progress / 0.52) * Math.PI);
      rig.rightArm.rotation.x += (-0.60 - sweep * 1.50 - rig.rightArm.rotation.x) * blend;
      rig.rightArm.rotation.z += (-0.28 - rig.rightArm.rotation.z) * blend;
      rig.leftArm.rotation.x += ((ability === 'shield-bash' ? -1.7 : -.65) - rig.leftArm.rotation.x) * blend;
      if (rig.shield) rig.shield.rotation.x = -rig.leftArm.rotation.x * blend;
      if (ability === 'shockwave') rig.body.position.y -= Math.sin(progress * Math.PI) * .2;
      rig.body.rotation.y = ability === 'whirlwind' ? (progress < 1 ? Math.PI * 2 * progress : 0) : (0.45 - progress * 0.9) * blend;
      // The new Knight calls read through the body as well as their woodland spell models.
      const brace = Math.sin(progress * Math.PI);
      switch (ability) {
        case 'charge':
          blendSpellLimb(rig.body, .14 + brace * .1, 0, 0, blend);
          blendSpellLimb(rig.leftArm, -.9 - brace * .3, 0, -.16, blend);
          blendSpellLimb(rig.rightArm, .35, 0, -.28, blend);
          rig.cape.rotation.x -= .25 * blend;
          break;
        case 'powerful-throw': {
          const release = THREE.MathUtils.smoothstep(progress, .25, .62);
          rig.body.rotation.y = (-.5 + release * .9) * blend;
          blendSpellLimb(rig.leftArm, -.55 - release * .75, -.65 + release * 1.1, -.45, blend);
          blendSpellLimb(rig.rightArm, -.3, 0, -.35, blend);
          rig.cape.rotation.x -= .13 * blend;
          break;
        }
        case 'guard': case 'adamant-guardian':
          rig.body.position.y -= (ability === 'guard' ? .08 : .13) * brace * blend;
          rig.body.rotation.y = -.12 * blend;
          blendSpellLimb(rig.leftArm, -.95 - brace * .3, 0, -.18, blend);
          blendSpellLimb(rig.rightArm, -.4, 0, -.4, blend);
          rig.head.rotation.x += (-.08 - rig.head.rotation.x) * blend;
          break;
        case 'taunt':
          blendSpellLimb(rig.rightArm, -1.55 + Math.sin(progress * Math.PI * 2) * .3, -.15, -.38, blend);
          blendSpellLimb(rig.leftArm, -.9, 0, -.14, blend);
          rig.body.rotation.y = -.18 * blend;
          break;
        case 'courageous-call': case 'lord-of-battle':
          blendSpellLimb(rig.rightArm, -1.1 - brace * (ability === 'courageous-call' ? 1.25 : .8), 0, -.65, blend);
          blendSpellLimb(rig.leftArm, -.75, 0, -.28, blend);
          rig.body.rotation.y = -.08 * blend;
          rig.head.rotation.x += (-.12 - rig.head.rotation.x) * blend;
          break;
      }
      if (rig.shield) rig.shield.rotation.x = -rig.leftArm.rotation.x * blend;
    }
  }
}

function slimeModel(): THREE.Group {
  const slime = new THREE.Group();
  slime.name = 'meadow-slime';
  block(slime, '#6cad55', 0, 0.14, 0, 0.69, 0.28, 0.61);
  block(slime, '#85c962', 0, 0.33, 0, 0.83, 0.30, 0.67);
  block(slime, '#97d977', 0, 0.53, -0.025, 0.65, 0.18, 0.54);
  block(slime, '#afe889', 0, 0.655, -0.025, 0.42, 0.075, 0.35);
  block(slime, '#c6f5a4', -0.19, 0.535, 0.26, 0.14, 0.07, 0.025);
  block(slime, '#c6f5a4', -0.265, 0.435, 0.342, 0.055, 0.055, 0.02);
  for (const x of [-0.18, 0.18]) {
    block(slime, ink, x, 0.34, 0.342, 0.10, 0.105, 0.025);
    block(slime, '#e9ffc2', x - 0.017, 0.365, 0.36, 0.028, 0.028, 0.014);
    const brow = block(slime, '#4c7740', x, 0.431, 0.346, 0.14, 0.04, 0.025);
    brow.rotation.z = x < 0 ? -0.20 : 0.20;
  }
  block(slime, '#45683b', 0, 0.22, 0.344, 0.12, 0.035, 0.025);
  block(slime, '#f3f4bf', 0.035, 0.19, 0.36, 0.035, 0.04, 0.02);
  return slime;
}

interface EnemyRig {
  kind: string;
  body: THREE.Group;
  head?: THREE.Group;
  arms?: THREE.Group[];
  legs?: THREE.Group[];
  wings?: THREE.Group[];
  core?: THREE.Group;
  parts: Record<string, THREE.Object3D | undefined>;
  rest: { node: THREE.Object3D; position: THREE.Vector3; rotation: THREE.Quaternion; scale: THREE.Vector3 }[];
}

/** Enemy origins stay on the ground; only the ice wisp's child body levitates. */
export function makeEnemy(kind: string): THREE.Group {
  const imported = createMonsterModel(kind);
  if (imported) return imported;
  const enemy = new THREE.Group();
  enemy.name = kind;
  const body = kind === 'moss-slime' ? slimeModel() : new THREE.Group();
  body.name = 'enemy-body';
  enemy.add(body);
  const rig: EnemyRig = { kind, body, rest: [], parts: {} };

  if (kind === 'briar-sentinel' || kind === 'root-warden') {
    const boss = kind === 'root-warden';
    const bark = boss ? '#665143' : '#95633c';
    const dark = boss ? '#443b37' : '#65432f';
    const grain = boss ? '#9c8560' : '#bf8d4c';
    const leaf = boss ? '#69864d' : '#d69c3e';
    const brightLeaf = boss ? '#94a866' : '#f1c866';
    const magic = boss ? '#c6a0f0' : '#fff0ad';
    const size = boss ? 1.9 : 1;
    // Both woodland creatures use the same simple joints, with separate silhouettes.
    block(body, bark, 0, 1.31 * size, 0, .83 * size, .96 * size, .61 * size);
    block(body, dark, 0, .90 * size, 0, .64 * size, .32 * size, .56 * size);
    for (const x of [-.29, .27]) block(body, grain, x * size, 1.28 * size, .321 * size, .07 * size, .76 * size, .035 * size);
    const core = pivot(body, 'heart-crystal', 0, 1.36 * size, .40 * size);
    block(core, dark, 0, 0, -.04 * size, .41 * size, .45 * size, .12 * size);
    const heart = block(core, magic, 0, 0, .025 * size, .23 * size, .23 * size, .17 * size);
    heart.rotation.z = Math.PI / 4;
    block(core, '#fff1d7', -.04 * size, .045 * size, .12 * size, .055 * size, .085 * size, .025 * size);
    rig.core = core;

    const head = pivot(body, 'enemy-head', 0, 1.98 * size, .025 * size);
    block(head, bark, 0, 0, 0, .67 * size, .55 * size, .59 * size);
    block(head, dark, 0, -.01 * size, .306 * size, .52 * size, .18 * size, .045 * size);
    for (const side of [-1, 1]) {
      block(head, magic, side * .16 * size, .012 * size, .339 * size, .125 * size, .055 * size, .035 * size);
      const brow = block(head, grain, side * .17 * size, .109 * size, .331 * size, .23 * size, .076 * size, .08 * size);
      brow.rotation.z = side * .14;
      block(head, bark, side * .22 * size, -.19 * size, .32 * size, .10 * size, .20 * size, .08 * size);
      rod(head, bark, [side * .25 * size, .22 * size, 0], [side * .44 * size, .47 * size, -.06 * size], .105 * size);
      rod(head, grain, [side * .44 * size, .47 * size, -.06 * size], [side * .63 * size, .57 * size, -.04 * size], .065 * size);
      block(head, leaf, side * .44 * size, .44 * size, -.055 * size, .28 * size, .17 * size, .30 * size);
      block(head, brightLeaf, side * .60 * size, .59 * size, -.06 * size, .20 * size, .09 * size, .22 * size);
    }
    block(head, dark, 0, -.18 * size, .317 * size, .16 * size, .035 * size, .045 * size);
    block(head, leaf, -.09 * size, .28 * size, -.05 * size, .60 * size, .15 * size, .62 * size);
    rig.head = head;

    rig.arms = [];
    rig.legs = [];
    for (const side of [-1, 1]) {
      const arm = pivot(body, side < 0 ? 'enemy-left-arm' : 'enemy-right-arm', side * .55 * size, 1.58 * size, 0);
      rod(arm, bark, [0, 0, 0], [side * .15 * size, -.43 * size, .05 * size], .22 * size);
      block(arm, grain, side * .17 * size, -.46 * size, .05 * size, .28 * size, .18 * size, .27 * size);
      rod(arm, bark, [side * .17 * size, -.46 * size, .05 * size], [side * .23 * size, -.75 * size, .10 * size], .21 * size);
      block(arm, dark, side * .23 * size, -.80 * size, .13 * size, .30 * size, .21 * size, .32 * size);
      for (const finger of [-1, 0, 1]) block(arm, grain, (side * .23 + finger * .10) * size, -.95 * size, .18 * size, .065 * size, .20 * size, .10 * size);
      block(arm, leaf, 0, .04 * size, -.02 * size, .44 * size, .20 * size, .47 * size);
      block(arm, brightLeaf, side * .16 * size, .12 * size, 0, .23 * size, .13 * size, .31 * size);
      const leg = pivot(body, side < 0 ? 'enemy-left-leg' : 'enemy-right-leg', side * .25 * size, .86 * size, 0);
      rod(leg, bark, [0, 0, 0], [side * .07 * size, -.58 * size, .04 * size], .25 * size);
      block(leg, dark, side * .07 * size, -.72 * size, .11 * size, .35 * size, .28 * size, .49 * size);
      for (const root of [-1, 0, 1]) block(leg, grain, (side * .07 + root * .105) * size, -.81 * size, .36 * size, .10 * size, .10 * size, .31 * size);
      rig.arms.push(arm);
      rig.legs.push(leg);
    }

    if (boss) {
      // Wide root plates, gnarled shoulders and an exposed violet heart distinguish the boss.
      block(body, bark, 0, 2.38, -.19, 1.91, 1.45, 1.10);
      block(body, dark, 0, 1.64, -.10, 1.54, .42, 1.09);
      for (const side of [-1, 1]) {
        const arm = rig.arms[side < 0 ? 0 : 1];
        block(arm, bark, side * .23, -.31, -.04, .62, .94, .76);
        block(arm, leaf, side * .15, .13, -.06, .91, .24, .82);
        block(arm, brightLeaf, side * .36, .32, -.12, .47, .21, .48);
        rod(arm, dark, [side * .36, -.65, 0], [side * .68, -.27, -.10], .12);
        const thorn = block(arm, '#a37bc7', side * .66, -.13, -.09, .18, .44, .18);
        thorn.rotation.z = -side * .28;
        const leg = rig.legs[side < 0 ? 0 : 1];
        block(leg, bark, side * .27, -1.45, .17, .79, .37, .93);
        block(leg, grain, side * .55, -1.54, .29, .50, .19, .88);
        block(leg, dark, side * .73, -1.57, .44, .26, .13, .66);
        block(head, dark, side * .29, -.40, .48, .15, .36, .17);
      }
      // A split ancient crown and back-grown crystal clusters are visible from every heading.
      block(head, dark, -.14, .56, -.10, .17, .50, .19);
      block(head, grain, .12, .47, -.15, .16, .34, .22);
      for (let i = 0; i < 3; i++) {
        const shard = block(body, i === 1 ? '#c49bea' : '#9873b8', -.38 + i * .39, 2.92 + i * .13, -.86, .26, .72, .24);
        shard.rotation.z = .23 - i * .24;
      }
      core.position.z = .79;
      core.scale.setScalar(1.45);
      // Scale the model's crown to 4.8 world units while keeping planted roots at zero.
      body.scale.setScalar(.965);
    }
  } else if (kind === 'ice-wisp') {
    body.position.y = 1.19;
    const core = pivot(body, 'wisp-core');
    const crystal = block(core, '#98dbe6', 0, 0, 0, .46, .61, .42);
    crystal.rotation.z = Math.PI / 4;
    const inner = block(core, '#d6f9f2', -.04, .065, .228, .23, .29, .06);
    inner.rotation.z = Math.PI / 4;
    block(core, '#548fb6', -.15, .018, .30, .065, .095, .035);
    block(core, '#548fb6', .14, .018, .30, .065, .095, .035);
    block(core, '#ffffff', -.16, .045, .324, .025, .027, .014);
    for (let i = -1; i <= 1; i++) {
      const point = block(core, i === 0 ? '#e4fff9' : '#89c5e1', i * .15, .42 + (i === 0 ? .12 : 0), -.025, .12, .30, .13);
      point.rotation.z = -i * .23;
    }
    const tail = block(core, '#d7f5f9', 0, -.55, -.01, .18, .27, .17);
    tail.rotation.z = Math.PI / 4;
    block(core, '#9fc5ec', -.09, -.80, 0, .09, .09, .09);
    rig.core = core;
    rig.wings = [];
    for (const side of [-1, 1]) {
      const wing = pivot(body, side < 0 ? 'ice-left-wing' : 'ice-right-wing', side * .28, .11, -.06);
      for (let i = 0; i < 3; i++) {
        const blade = block(wing, ['#c5f3f4', '#a3d9ee', '#e4faf3'][i], side * (.19 + i * .23), .07 + i * .12, -.015 - i * .015, .22, .54 - i * .07, .11);
        blade.rotation.z = -side * (.44 + i * .10);
      }
      block(wing, '#71aacb', side * .13, -.10, 0, .31, .09, .13);
      rig.wings.push(wing);
    }
  } else if (kind !== 'moss-slime') {
    throw new Error(`Unknown enemy kind: ${kind}`);
  }
  enemy.userData.enemyRig = rig;
  batchCubes(enemy);
  for (const node of [body, rig.head, rig.core, ...(rig.arms || []), ...(rig.legs || []), ...(rig.wings || [])]) {
    if (node) rig.rest.push({ node, position: node.position.clone(), rotation: node.quaternion.clone(), scale: node.scale.clone() });
  }
  rig.parts = { body, head: rig.head, core: rig.core, 'left-arm': rig.arms?.[0], 'right-arm': rig.arms?.[1], 'left-leg': rig.legs?.[0], 'right-leg': rig.legs?.[1], 'left-wing': rig.wings?.[0], 'right-wing': rig.wings?.[1] };
  return enemy;
}

const smoothEnemyPose = (value: number) => value * value * (3 - 2 * value);

export function animateEnemy(group: THREE.Group, time: number, moving: boolean, attack?: EnemyAttackPose, deathProgress?: number): void {
  if (animateMonsterModel(group, time, moving, attack, deathProgress)) return;
  const rig = group.userData.enemyRig as EnemyRig | undefined;
  if (!rig || !Number.isFinite(time)) return;
  for (const part of rig.rest) { part.node.position.copy(part.position); part.node.quaternion.copy(part.rotation); part.node.scale.copy(part.scale); }
  if (deathProgress !== undefined && Number.isFinite(deathProgress)) {
    applyIdleAnimation(rig.kind, group, rig.parts, time, false);
    applyDeathAnimation(rig.kind, rig.parts, deathProgress);
    groundDeathPose(group, rig.body, rig.kind === 'ice-wisp' && deathProgress < .72);
    return;
  }
  const phase = enemyAttackPhase(attack);
  if (moving || phase >= 0) applyIdleAnimation(rig.kind, group, rig.parts, time, false);
  else if (applyIdleAnimation(rig.kind, group, rig.parts, time)) return;
  if (phase >= 0) moving = false;
  if (rig.kind === 'moss-slime') {
    const hop = Math.abs(Math.sin(time * (moving ? 7 : 2.4)));
    rig.body.position.y = hop * (moving ? .17 : .025);
    rig.body.scale.set(1 + (1 - hop) * .045, .94 + hop * .06, 1 + (1 - hop) * .045);
  } else if (rig.kind === 'ice-wisp') {
    rig.body.position.y = 1.19 + Math.sin(time * 2.4) * .13;
    rig.body.rotation.z = Math.sin(time * 1.6) * .065;
    rig.wings![0].rotation.z = Math.sin(time * 6) * .19;
    rig.wings![1].rotation.z = -Math.sin(time * 6) * .19;
    rig.core!.rotation.y = Math.sin(time * 1.8) * .12;
  } else {
    const boss = rig.kind === 'root-warden';
    const stride = moving ? Math.sin(time * (boss ? 4.4 : 7)) : 0;
    rig.body.position.y = Math.abs(stride) * (boss ? .045 : .07);
    rig.head!.rotation.y = Math.sin(time * .85) * .08;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      rig.arms![i].rotation.x = stride * side * (boss ? .24 : .42);
      rig.arms![i].rotation.z = side * (.07 + Math.sin(time * 1.5) * .018);
      rig.legs![i].rotation.x = -stride * side * (boss ? .20 : .40);
    }
    rig.core!.scale.setScalar((boss ? 1.45 : 1) * (1 + Math.sin(time * 2.1) * .045));
  }
  if (phase < 0) return;
  if (attack?.basic) {
    const strike = phase <= .5 ? phase * 2 : (1 - phase) * 2;
    rig.body.position.z += (rig.kind === 'root-warden' ? .24 : .18) * strike;
    if (rig.kind === 'moss-slime') {
      rig.body.position.y += .09 * strike;
      rig.body.rotation.x += .12 * strike;
    } else if (rig.kind === 'ice-wisp') {
      rig.body.rotation.x -= .16 * strike;
      rig.wings![0].rotation.z += .25 * strike;
      rig.wings![1].rotation.z -= .25 * strike;
    } else {
      rig.body.rotation.y = -.14 * strike;
      rig.arms![1].rotation.x = -1.15 * strike;
      rig.arms![1].rotation.y = .3 * strike;
      rig.head!.rotation.x = .06 * strike;
    }
    return;
  }
  const charge = phase < .38 ? smoothEnemyPose(phase / .38) : phase < .5 ? 1 - smoothEnemyPose((phase - .38) / .12) : 0;
  const hit = phase < .38 ? 0 : phase < .5 ? smoothEnemyPose((phase - .38) / .12) : 1 - smoothEnemyPose((phase - .5) / .5);
  if (attack?.style === 'leap' && rig.arms && rig.legs) {
    const flight = phase > .32 && phase < .5 ? Math.sin((phase-.32)/.18*Math.PI) : 0;
    rig.body.scale.y *= 1 - charge*.12;
    rig.body.position.y += flight*(rig.kind==='root-warden'?1.3:.8);
    rig.body.position.z += hit*.22;
    for(let i=0;i<2;i++){rig.arms[i].rotation.x=-.7*charge-1.5*hit;rig.arms[i].rotation.z+=(i?1:-1)*flight*.35;rig.legs[i].rotation.x+=(i?-.3:.3)*flight;}
    rig.core?.scale.multiplyScalar(1+.3*charge+.45*hit);
    return;
  }
  if (rig.kind === 'moss-slime') {
    rig.body.scale.x *= 1 + charge * .35 - hit * .08;
    rig.body.scale.y *= 1 - charge * .36 + hit * .22;
    rig.body.scale.z *= 1 + charge * .22;
    rig.body.position.y += hit * .36;
    rig.body.position.z += -.12 * charge + .55 * hit;
    rig.body.rotation.x = -.12 * charge + .30 * hit;
  } else if (rig.kind === 'ice-wisp') {
    rig.body.position.y += .22 * charge - .12 * hit;
    rig.body.position.z += .25 * hit;
    rig.body.rotation.x = .12 * charge - .22 * hit;
    rig.core!.scale.multiplyScalar(1 + .35 * charge + .85 * hit);
    rig.wings![0].rotation.z += -.42 * charge + .66 * hit;
    rig.wings![1].rotation.z -= -.42 * charge + .66 * hit;
  } else {
    const size = rig.kind === 'root-warden' ? 1.65 : 1;
    rig.body.position.y -= hit * .12 * size;
    rig.body.position.z += (-.12 * charge + .24 * hit) * size;
    rig.body.rotation.x = -.16 * charge + .30 * hit;
    rig.head!.rotation.x = .20 * charge - .12 * hit;
    for (let index = 0; index < 2; index++) {
      const side = index === 0 ? -1 : 1;
      rig.arms![index].rotation.x = -2.65 * charge - 1.25 * hit;
      rig.arms![index].rotation.z += side * (.15 * charge + .08 * hit);
      rig.legs![index].rotation.x += .18 * hit;
    }
    if (attack?.style === 'swipe') {
      rig.body.rotation.y = -.42 * charge + .38 * hit;
      rig.arms![1].rotation.y = -.55 * charge + .70 * hit;
      rig.arms![0].rotation.x *= .45;
    }
    rig.core!.scale.multiplyScalar(1 + .2 * charge + .5 * hit);
  }
}

export function makeSlime(): THREE.Group {
  return makeEnemy('moss-slime');
}
