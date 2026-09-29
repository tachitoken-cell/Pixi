import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createMonsterModel, animateMonsterModel, setRaidAssets } from './monster-models.ts';
import { loadRaidApproachAssets } from './raid-approach-models.ts';

let raidAssets:Promise<void>|undefined;
export function loadRaidAssets(){return raidAssets??=Promise.all([loadRaidApproachAssets(),new GLTFLoader().loadAsync('/models/horned-apostle.glb').then(({scene,animations})=>{setRaidAssets(scene,animations);setRaidRewardAssets(scene);})]).then(()=>{}).catch(error=>{raidAssets=undefined;throw error;});}

export type RaidAdornment = 'wings' | 'crown' | 'aura' | 'weapon';
const adornments = new Map<RaidAdornment, THREE.Object3D>();
/** Register the extra roots in the same GLB loaded for the encounter. */
export function setRaidRewardAssets(scene: THREE.Object3D): void {
  const entries = (['wings', 'crown', 'aura', 'weapon'] as const).map(kind => {
    const source = scene.getObjectByName(`apostle-${kind}`);
    if (!source) throw new Error(`Missing Apostle reward model: ${kind}`);
    source.traverse(node => { if (node instanceof THREE.Mesh) node.castShadow = node.receiveShadow = true; });
    return [kind, source] as const;
  });
  for (const [kind, source] of entries) adornments.set(kind, source);
}

/** Local transforms only: reward instances share immutable geometry and materials. */
export function makeRaidAdornment(kind: RaidAdornment): THREE.Object3D {
  const source = adornments.get(kind);
  if (!source) throw new Error(`Apostle reward assets not loaded: ${kind}`);
  const model = source.clone(true); model.position.set(0, 0, 0); model.quaternion.identity();
  return model;
}

export function makeDeathApostlePet(stage: number): THREE.Group {
  const evolution = Number.isFinite(stage) ? Math.max(0, Math.min(3, Math.floor(stage))) : 0;
  const kind = evolution === 3 ? 'apostle-incarnate' : 'horned-apostle';
  const model = createMonsterModel(kind);
  if (!model) throw new Error('Death Apostle pet assets not loaded');
  model.name = 'death-apostle'; model.userData.petId = 'death-apostle'; model.userData.apostleStage = evolution;
  // Keep companion size independent of changes to the source boss rig.
  const height = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y;
  model.scale.setScalar([.87, 1.03, 1.2, 1.3][evolution] / height);
  for (const part of ['stars', 'halo', 'halo-gem']) { const node = model.getObjectByName(`${kind}-${part}`); if (node) node.visible = evolution >= 2; }
  for (const part of ['left-wing', 'right-wing', 'left-lower-arm', 'right-lower-arm']) { const node = model.getObjectByName(`${kind}-${part}`); if (node) node.visible = evolution >= 1; }
  return model;
}

export function animateDeathApostlePet(model: THREE.Group, time: number, moving: boolean): void {
  animateMonsterModel(model, time, moving);
}
