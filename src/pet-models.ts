import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PETS, type PetId } from './pets.ts';
import { loadRaidAssets, makeDeathApostlePet, animateDeathApostlePet } from './raid-model.ts';

const models = new Map<PetId, THREE.Object3D>();
interface Joint { node: THREE.Object3D; rotation: THREE.Euler }
interface PetRig { model: THREE.Object3D; restY: number; locomotion: string; head?: Joint; tail?: Joint; legs: Joint[]; wings: Joint[] }
const rigs = new WeakMap<THREE.Group, PetRig>();

export function setPetAssets(asset: THREE.Object3D) {
  const entries = PETS.filter(pet=>pet.id!=='death-apostle').map(pet => {
    const source = asset.getObjectByName(pet.id);
    if (!source) throw new Error(`Missing pet model: ${pet.id}`);
    source.traverse(node => { if (node instanceof THREE.Mesh) node.castShadow = node.receiveShadow = true; });
    return [pet.id, source] as const;
  });
  models.clear();
  for (const [id, source] of entries) models.set(id, source);
}

export async function loadPetAssets() {
  await loadRaidAssets();
  const [base, store, wild, autumn, referral] = await Promise.all(['/models/pets.glb', '/models/store-collection.glb', '/models/wild-pets.glb', '/models/autumn-pets.glb', '/models/wayfinder-sprite.glb'].map(path => new GLTFLoader().loadAsync(path)));
  base.scene.add(store.scene, wild.scene, autumn.scene, referral.scene); setPetAssets(base.scene);
}

export function createPetModel(id: PetId, evolution=0): THREE.Group {
  if(id==='death-apostle')return makeDeathApostlePet(evolution);
  const source = models.get(id);
  if (!source) throw new Error(`Pet assets not loaded: ${id}`);
  const group = new THREE.Group(), model = source.clone(true);
  group.name = id; group.userData.petId = id;
  model.position.set(0, 0, 0); model.quaternion.identity();
  group.add(model);
  const joint = (name: string): Joint | undefined => {
    const node = model.getObjectByName(`${id}-${name}`);
    return node ? { node, rotation: node.rotation.clone() } : undefined;
  };
  const collect = (names: string[]) => names.map(joint).filter((part): part is Joint => !!part);
  rigs.set(group, { model, restY: model.position.y, locomotion: source.userData.locomotion ?? (id === 'moon-owl' || id === 'lantern-moth' ? 'hover' : id === 'bloom-hare' ? 'hop' : 'walk'),
    head: joint('head'), tail: joint('tail'), legs: collect(['leg-front-left', 'leg-front-right', 'leg-rear-left', 'leg-rear-right']), wings: collect(['wing-left', 'wing-right']) });
  return group;
}

export function animatePetModel(group: THREE.Group, time: number, moving: boolean) {
  if(group.userData.petId==='death-apostle'){animateDeathApostlePet(group,time,moving);return;}
  const rig = rigs.get(group);
  if (!rig || !Number.isFinite(time)) return;
  for (const part of [rig.head, rig.tail, ...rig.legs, ...rig.wings]) if (part) part.node.rotation.copy(part.rotation);
  const slow = group.userData.petId === 'crystal-tortoise' || group.userData.petId === 'amethyst-terrapin', stride = Math.sin(time * (slow ? 5 : 10)), breath = Math.sin(time * 2);
  rig.model.position.y = rig.restY + (rig.locomotion === 'hover' ? .8 + Math.sin(time * 2.8) * .09 : rig.locomotion === 'hop' && moving ? Math.max(0, stride) * .23 : moving ? Math.abs(stride) * .025 : .008 * breath);
  rig.model.rotation.z = moving && rig.locomotion === 'walk' ? stride * .018 : 0;
  if (rig.head) { rig.head.node.rotation.y += Math.sin(time * .8) * (moving ? .035 : .13); rig.head.node.rotation.x += breath * .035; }
  if (rig.tail) rig.tail.node.rotation.y += Math.sin(time * (moving ? 7 : 2.3)) * (moving ? .3 : .16);
  rig.legs.forEach((part, index) => { part.node.rotation.x += moving ? stride * (index === 0 || index === 3 ? 1 : -1) * (slow ? .18 : rig.locomotion === 'hop' ? .6 : .42) : 0; });
  rig.wings.forEach((part, index) => { part.node.rotation.z += Math.sin(time * (group.userData.petId === 'lantern-moth' ? 18 : 8)) * (index ? -1 : 1) * (rig.locomotion === 'hover' ? .42 : moving ? .25 : .07); });
}

export interface PetFollowerOwner { id: string; pet: PetId; x: number; z: number; rotation: number; evolution?: number; petPosition?: { x: number; z: number } | null }

/** Followers share imported geometry/materials; removing one releases only its transforms. */
export function createPetFollowers(scene: THREE.Scene, groundAt: (x: number, z: number) => number, canWalk = (_from: { x: number; z: number }, _to: { x: number; z: number }) => true) {
  const views = new Map<string, { pet: PetId; mesh: THREE.Group; phase: number }>();
  return {
    get size() { return views.size; },
    clear() { for (const view of views.values()) view.mesh.removeFromParent(); views.clear(); },
    update(owners: readonly PetFollowerOwner[], dt: number, time: number) {
      const present = new Set(owners.map(owner => owner.id));
      for (const [id, view] of views) if (!present.has(id)) { view.mesh.removeFromParent(); views.delete(id); }
      for (const owner of owners) {
        if (![owner.x, owner.z, owner.rotation, dt, time].every(Number.isFinite)) continue;
        const petPosition = owner.petPosition && [owner.petPosition.x, owner.petPosition.z].every(Number.isFinite) ? owner.petPosition : null;
        let x = owner.x + Math.cos(owner.rotation) * 1.15 - Math.sin(owner.rotation) * 1.6;
        let z = owner.z - Math.sin(owner.rotation) * 1.15 - Math.cos(owner.rotation) * 1.6;
        if (petPosition) { x = petPosition.x; z = petPosition.z; }
        if (!canWalk(owner, { x, z })) { x = owner.x; z = owner.z; }
        let view = views.get(owner.id);
        if (view?.pet !== owner.pet||owner.pet==='death-apostle'&&view?.mesh.userData.apostleStage!==(owner.evolution||0)) { view?.mesh.removeFromParent(); views.delete(owner.id); view = undefined; }
        if (!view) {
          const mesh = createPetModel(owner.pet,owner.evolution);
          mesh.name = `pet:${owner.id}`; mesh.userData.ownerId = owner.id;
          mesh.position.set(x, groundAt(x, z), z); mesh.rotation.y = owner.rotation;
          view = { pet: owner.pet, mesh, phase: [...owner.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 19 };
          views.set(owner.id, view); scene.add(mesh);
        }
        const { mesh } = view, dx = x - mesh.position.x, dz = z - mesh.position.z, gap = Math.hypot(dx, dz), clear = canWalk(mesh.position, { x, z }), moving = gap > .18 && clear;
        if (petPosition ? gap > 18 && Math.hypot(x - owner.x, z - owner.z) <= 3 : gap > 18 || !clear) mesh.position.set(x, groundAt(x, z), z);
        else if (moving) {
          const step = Math.min(gap, Math.max(0, Math.min(dt, .1)) * Math.min(20, 4 + gap * 2));
          mesh.position.x += dx / gap * step; mesh.position.z += dz / gap * step;
          const turn = Math.atan2(dx, dz) - mesh.rotation.y;
          mesh.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, dt * 12);
        }
        mesh.position.y = groundAt(mesh.position.x, mesh.position.z);
        animatePetModel(mesh, time + view.phase, moving);
      }
    },
  };
}
