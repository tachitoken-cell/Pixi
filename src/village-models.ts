import * as THREE from 'three';
import type { TrainerRole } from './training.ts';
import { applyIdleAnimation } from './idle-animation.ts';

export type VillagePropKind = 'cottage' | 'inn' | 'stall' | 'well' | 'lantern';
export type VillagerRole = 'merchant' | 'warden' | 'healer' | TrainerRole | 'auctioneer';
export interface VillagePropPlacement { kind: string; x: number; y: number; z: number; rotation?: number }

/** Instance the authored prop meshes at terrain-grounded placement transforms. */
export function createVillageProps(asset: THREE.Group, placements: readonly VillagePropPlacement[], prefix = 'village-'): THREE.Group {
  const group = new THREE.Group(); group.name = 'Blender village props';
  asset.updateMatrixWorld(true);
  const pose = new THREE.Object3D(), local = new THREE.Matrix4(), inverse = new THREE.Matrix4();
  // Local batches keep distant villages out of the frustum without cloning geometry.
  const batches = new Map<string, VillagePropPlacement[]>();
  for (const placement of placements) {
    if (![placement.x, placement.y, placement.z, placement.rotation ?? 0].every(Number.isFinite)) throw new Error('Village placement has invalid coordinates');
    const key = `${Math.floor(placement.x / 128)},${Math.floor(placement.z / 128)}:${placement.kind}`;
    const batch = batches.get(key); if (batch) batch.push(placement); else batches.set(key, [placement]);
  }
  for (const [key, batch] of batches) {
    const model = asset.getObjectByName(`${prefix}${batch[0].kind}`);
    if (!model) throw new Error(`Missing village prop: ${batch[0].kind}`);
    inverse.copy(model.matrixWorld).invert();
    model.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const mesh = new THREE.InstancedMesh(object.geometry, object.material, batch.length);
      mesh.name = `${object.name} instances ${key}`; mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.villageProp = batch[0].kind;
      if (object.userData.collision) mesh.userData.collision = object.userData.collision;
      local.multiplyMatrices(inverse, object.matrixWorld);
      for (let index = 0; index < batch.length; index++) {
        const at = batch[index]; pose.position.set(at.x, at.y, at.z); pose.rotation.set(0, at.rotation ?? 0, 0); pose.updateMatrix();
        mesh.setMatrixAt(index, new THREE.Matrix4().multiplyMatrices(pose.matrix, local));
      }
      mesh.computeBoundingBox(); mesh.computeBoundingSphere(); group.add(mesh);
    });
  }
  return group;
}

interface VillagerIdle {
  role: VillagerRole; phase: number;
  body: THREE.Object3D; head: THREE.Object3D; leftArm: THREE.Object3D; rightArm: THREE.Object3D;
  parts: Record<string, THREE.Object3D>;
  rest: { node: THREE.Object3D; position: THREE.Vector3; rotation: THREE.Quaternion; scale: THREE.Vector3 }[];
}
let villagerSequence = 0;

/** Clone only transform nodes; all villagers share the world-owned imported resources. */
export function createVillager(asset: THREE.Group, role: VillagerRole, modelName = `${role === 'auctioneer' ? 'city-' : 'village-'}${role}`): THREE.Group {
  const source = asset.getObjectByName(modelName);
  if (!source) throw new Error(`Missing village NPC: ${role}`);
  const group = source.clone(true) as THREE.Group; group.name = `Village ${role}`;
  group.position.set(0, 0, 0); group.rotation.set(0, 0, 0); group.scale.set(1, 1, 1);
  group.traverse(object => { if (object instanceof THREE.Mesh) object.castShadow = object.receiveShadow = true; });
  const part = (name: string) => {
    const object = group.getObjectByName(`${modelName}-${name}`);
    if (!object) throw new Error(`Missing ${role} idle part: ${name}`);
    return object;
  };
  const body = part('body'), head = part('head'), leftArm = part('left-arm'), rightArm = part('right-arm');
  group.userData.villagerIdle = { role, phase: (++villagerSequence * 2.39996) % (Math.PI * 2), body, head, leftArm, rightArm,
    parts: { body, head, 'left-arm': leftArm, 'right-arm': rightArm },
    rest: [body, head, leftArm, rightArm].map(node => ({ node, position: node.position.clone(), rotation: node.quaternion.clone(), scale: node.scale.clone() })) } satisfies VillagerIdle;
  return group;
}

export function animateVillager(group: THREE.Group, time: number, lookRotation?: number): void {
  const idle = group.userData.villagerIdle as VillagerIdle | undefined;
  if (!idle || !Number.isFinite(time)) return;
  if (lookRotation !== undefined && Number.isFinite(lookRotation)) group.rotation.y = lookRotation;
  for (const part of idle.rest) { part.node.position.copy(part.position); part.node.quaternion.copy(part.rotation); part.node.scale.copy(part.scale); }
  if (applyIdleAnimation(idle.role, group, idle.parts, time)) return;
  const breath = Math.sin(time * 1.45 + idle.phase), gesture = Math.sin(time * .78 + idle.phase);
  idle.body.position.y += breath * .012;
  idle.head.rotation.y += gesture * .065; idle.head.rotation.x += breath * .018;
  idle.leftArm.rotation.z -= breath * .018;
  idle.rightArm.rotation.x += idle.role === 'healer' ? -.12 + gesture * .055 : idle.role === 'merchant' ? gesture * .055 : breath * .009;
}
