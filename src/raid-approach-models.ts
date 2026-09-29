import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { EnemyAttackPose } from './monster-models.ts';

export const RAID_APPROACH_MODEL_KINDS = [
  'raid-moss-golem', 'raid-thorn-knight', 'raid-shroom-shaman', 'raid-vine-stalker',
  'raid-grumble-root', 'raid-puffling', 'raid-acorn-seedle', 'raid-cinder-seedle',
  'raid-pudgy-piglet', 'raid-thornback-boar', 'raid-dusk-vampie', 'raid-hammer-stump',
  'raid-rotwood-treant', 'raid-gloom-gargoyle', 'raid-crimson-weaver', 'raid-stinger-wasp',
  'raid-hollow-scarecrow', 'raid-grave-knight', 'raid-magma-brute', 'raid-tunnel-mole',
  'raid-spring-boing', 'raid-gnoll-scout', 'raid-crested-basilisk', 'raid-tidelord-crab', 'morgrath',
] as const;
const clips = ['idle', 'walk', 'auto', 'attack', 'cast', 'death'] as const;
type Clip = typeof clips[number] | 'rift' | 'rupture';
type ModelClips<T> = Record<typeof clips[number], T> & Partial<Record<'rift' | 'rupture', T>>;
const library = new Map<string, { source: THREE.Object3D; clips: ModelClips<THREE.AnimationClip> }>();
const rigs = new WeakMap<THREE.Group, { mixer: THREE.AnimationMixer; actions: ModelClips<THREE.AnimationAction>; active?: Clip }>();
let loading: Promise<void> | undefined;

/** One pack request; clones share immutable authored geometry and materials. */
export function loadRaidApproachAssets(): Promise<void> {
  return loading ??= new GLTFLoader().loadAsync('/models/raid-approach-monsters.glb').then(({ scene, animations }) => {
    const entries = RAID_APPROACH_MODEL_KINDS.map(key => {
      const source = scene.getObjectByName(key);
      if (!source?.getObjectByName(`${key}-body`)) throw Error(`Missing raid approach model: ${key}`);
      const authored = Object.fromEntries((key === 'morgrath' ? [...clips, 'rift', 'rupture'] : clips).map(name => {
        const clip = animations.find(animation => animation.name === `${key}-${name}`);
        if (!clip) throw Error(`Missing raid approach ${name}: ${key}`);
        return [name, clip];
      })) as ModelClips<THREE.AnimationClip>;
      source.traverse(node => { if (node instanceof THREE.Mesh) node.castShadow = node.receiveShadow = true; });
      return [key, { source, clips: authored }] as const;
    });
    for (const [key, entry] of entries) library.set(key, entry);
  }).catch(error => { loading = undefined; throw error; });
}

export function createRaidApproachModel(key: string): THREE.Group | undefined {
  if (!(RAID_APPROACH_MODEL_KINDS as readonly string[]).includes(key)) return;
  const entry = library.get(key);
  if (!entry) throw Error(`Raid approach assets are not loaded: ${key}`);
  const group = new THREE.Group(), model = entry.source.clone(true);
  group.name = key; group.userData.enemyRig = { kind: key, imported: true };
  model.position.set(0, 0, 0); model.quaternion.identity(); model.scale.setScalar(1); group.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const actions = Object.fromEntries(Object.entries(entry.clips).map(([name, clip]) => {
    const action = mixer.clipAction(clip); action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true;
    action.play(); mixer.setTime(0); mixer.stopAllAction(); return [name, action];
  })) as ModelClips<THREE.AnimationAction>;
  rigs.set(group, { mixer, actions }); return group;
}

/** Absolute clip sampling keeps pause, correction and corpse poses deterministic. */
export function animateRaidApproachModel(group: THREE.Group, time: number, moving: boolean, attack?: EnemyAttackPose, cast?: number, deathProgress?: number): boolean {
  const rig = rigs.get(group); if (!rig) return false;
  if (!group.userData.enemyRig || !Number.isFinite(time)) return true;
  let name: Clip = moving ? 'walk' : 'idle', progress: number | undefined;
  if (Number.isFinite(deathProgress)) { name = 'death'; progress = deathProgress; }
  else if (Number.isFinite(cast)) { name = 'cast'; progress = cast; }
  else if (attack && Number.isFinite(attack.progress)) {
    name = attack.basic ? 'auto' : attack.clip === 'rift' && rig.actions.rift ? 'rift' : attack.clip === 'rupture' && rig.actions.rupture ? 'rupture'
      : ['pulse', 'spit'].includes(attack.style) || attack.clip === 'cast' ? 'cast' : 'attack';
    const value = THREE.MathUtils.clamp(attack.progress, 0, 1), impact = Number.isFinite(attack.impactProgress) ? THREE.MathUtils.clamp(attack.impactProgress, .001, .999) : .5;
    progress = value <= impact ? value / impact * .5 : .5 + (value - impact) / (1 - impact) * .5;
  }
  if (rig.active !== name) { rig.mixer.stopAllAction(); rig.active = name; }
  const action = rig.actions[name] ?? rig.actions.attack, duration = action.getClip().duration;
  action.reset().play();
  rig.mixer.setTime(progress === undefined ? ((time % duration) + duration) % duration : THREE.MathUtils.clamp(progress, 0, 1) * duration);
  return true;
}
