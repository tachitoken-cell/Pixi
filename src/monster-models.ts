import * as THREE from 'three';
import { INSTANT_COMBAT_MODEL_KINDS } from './instant-combat.ts';
import { INSTANT_COMBAT_BOSS_CLIPS } from './instant-combat-visuals.ts';
import { applyIdleAnimation } from './idle-animation.ts';
import { THEMED_DUNGEON_ROSTERS } from './bestiary.ts';
import { DUNGEON_BOSS_MODEL_KINDS, type DungeonBossModel } from './dungeon-boss-models.ts';
import { RAID_CAST_CLIPS } from './raid-visuals.ts';
import { createRaidApproachModel, animateRaidApproachModel } from './raid-approach-models.ts';
import { configureAuthoredMaterials } from './authored-materials.ts';

export interface EnemyAttackPose { style: string; progress: number; impactProgress: number; chargeProgress?: number; basic?: boolean; clip?: string; authoredTime?: boolean }
export const MONSTER_MODEL_KINDS = ['bramble-wolf', 'briar-boar', 'grove-spider', 'ember-beetle', 'dune-scorpion', 'stone-golem', 'frost-yeti', 'crystal-bat', 'marsh-toad', 'void-stalker', 'briarhorn-elder', 'rimefang-matriarch', 'stormhorn-behemoth', 'ashen-crown-titan'] as const;
export const THEMED_MONSTER_KINDS = Object.values(THEMED_DUNGEON_ROSTERS).flat();
export const RAID_MODEL_KINDS=['horned-apostle','apostle-clone','apostle-incarnate'] as const;
type MonsterModelKind = typeof INSTANT_COMBAT_MODEL_KINDS[number] | typeof RAID_MODEL_KINDS[number] | typeof THEMED_MONSTER_KINDS[number] | typeof MONSTER_MODEL_KINDS[number] | DungeonBossModel | 'treasure-goblin' | 'training-dummy';
interface RestPose { node: THREE.Object3D; position: THREE.Vector3; rotation: THREE.Quaternion; scale: THREE.Vector3 }
interface MonsterRig {
  kind: MonsterModelKind; body: THREE.Object3D; head?: THREE.Object3D; legs: THREE.Object3D[]; arms: THREE.Object3D[]; wings: THREE.Object3D[]; tail?: THREE.Object3D;
  rest: RestPose[]; parts: Record<string, THREE.Object3D>; contacts?: Record<string, number>; casts?: Map<string,THREE.AnimationAction>; mixer?: THREE.AnimationMixer; idle?: THREE.AnimationAction; walk?: THREE.AnimationAction; action?: THREE.AnimationAction; auto?: THREE.AnimationAction; swipe?: THREE.AnimationAction; leap?: THREE.AnimationAction; cast?: THREE.AnimationAction; charge?: THREE.AnimationAction; death?: THREE.AnimationAction; activeAction?: THREE.AnimationAction; attacking: boolean; hitAt?: number;
}
const library = new Map<string, { source: THREE.Object3D; casts?: Map<string,THREE.AnimationClip>; idle?: THREE.AnimationClip; walk?: THREE.AnimationClip; clip?: THREE.AnimationClip; auto?: THREE.AnimationClip; swipe?: THREE.AnimationClip; leap?: THREE.AnimationClip; cast?: THREE.AnimationClip; charge?: THREE.AnimationClip; death?: THREE.AnimationClip }>();
const rigs = new WeakMap<THREE.Group, MonsterRig>();

/** Import once before creating monsters. Rigs share asset geometry/materials and own only transforms. */
export function setMonsterAssets(scene: THREE.Object3D, animations: THREE.AnimationClip[] = []): void {
  const entries = MONSTER_MODEL_KINDS.map(kind => {
    const source = scene.getObjectByName(kind);
    if (!source?.getObjectByName(`${kind}-body`)) throw new Error(`Missing monster model: ${kind}`);
    const clip = animations.find(animation => animation.name === `${kind}-attack`);
    if (animations.length && !clip) throw new Error(`Missing monster attack clip: ${kind}`);
    const auto = animations.find(animation => animation.name === `${kind}-auto`);
    if (animations.length && !auto) throw new Error(`Missing monster auto clip: ${kind}`);
    const death = animations.find(animation => animation.name === `${kind}-death`);
    if (animations.length && !death) throw new Error(`Missing monster death clip: ${kind}`);
    return [kind, { source, clip, auto, death, charge: animations.find(animation => animation.name === `${kind}-charge`), leap: animations.find(animation => animation.name === `${kind}-leap`), cast: animations.find(animation => animation.name === `${kind}-cast`), swipe: animations.find(animation => animation.name === `${kind}-swipe`) }] as const;
  });
  scene.traverse(node => { if (node instanceof THREE.Mesh) node.castShadow = node.receiveShadow = true; });
  for (const [kind, entry] of entries) library.set(kind, entry);
}

/** Dungeon creatures keep authored locomotion and attacks in a separate asset pack. */
export function setThemedMonsterAssets(scene: THREE.Object3D, animations: THREE.AnimationClip[]): void {
  setAuthoredDungeonAssets(scene, animations, THEMED_MONSTER_KINDS, 'themed monster');
}

export function setInstantCombatAssets(scene: THREE.Object3D, animations: THREE.AnimationClip[]): void {
  const entries=Object.entries(INSTANT_COMBAT_BOSS_CLIPS).map(([kind,names])=>[kind,new Map(names.map(name=>{
    const clip=animations.find(animation=>animation.name===`${kind}-${name}`);
    if(!clip)throw Error(`Missing Instant Combat boss ${name} clip: ${kind}`);
    return [name,clip] as const;
  }))] as const);
  setAuthoredDungeonAssets(scene, animations, INSTANT_COMBAT_MODEL_KINDS, 'Instant Combat monster');
  for(const [kind,casts] of entries)Object.assign(library.get(kind)!,{casts});
}

export function setDungeonBossAssets(scene: THREE.Object3D, animations: THREE.AnimationClip[]): void {
  setAuthoredDungeonAssets(scene, animations, DUNGEON_BOSS_MODEL_KINDS, 'dungeon boss');
}

export function setRaidAssets(scene:THREE.Object3D,animations:THREE.AnimationClip[]):void {
 const entries=RAID_MODEL_KINDS.map(kind=>[kind,new Map([...RAID_CAST_CLIPS,'cast'].map(suffix=>{
  const clip=animations.find(animation=>animation.name===`${kind}-${suffix}`);if(!clip)throw Error(`Missing raid ${suffix} clip: ${kind}`);return [suffix,clip] as const;
 }))] as const);
 setAuthoredDungeonAssets(scene,animations,RAID_MODEL_KINDS,'raid boss');
 for(const [kind,casts] of entries){
  for(const clip of animations)if(clip.name.startsWith(`${kind}-`))casts.set(clip.name.slice(kind.length+1),clip);
  Object.assign(library.get(kind)!,{casts,cast:casts.get('cast')});
 }
}

function setAuthoredDungeonAssets(scene: THREE.Object3D, animations: THREE.AnimationClip[], kinds: readonly string[], label: string): void {
  configureAuthoredMaterials(scene);
  const entries = kinds.map(kind => {
    const source = scene.getObjectByName(kind);
    if (!source?.getObjectByName(`${kind}-body`)) throw new Error(`Missing ${label} model: ${kind}`);
    const clips = ['idle', 'walk', 'auto', 'attack', 'death'].map(suffix => {
      const clip = animations.find(animation => animation.name === `${kind}-${suffix}`);
      if (!clip) throw new Error(`Missing ${label} ${suffix} clip: ${kind}`);
      return clip;
    });
    return [kind, { source, idle: clips[0], walk: clips[1], auto: clips[2], clip: clips[3], death: clips[4] }] as const;
  });
  scene.traverse(node => { if (node instanceof THREE.Mesh) node.castShadow = node.receiveShadow = true; });
  for (const [kind, entry] of entries) library.set(kind, entry);
}

/** Kept separate so the rare encounter kit can load alongside the main bestiary. */
export function setTreasureAssets(scene: THREE.Object3D, animations: THREE.AnimationClip[] = []): void {
  const source = scene.getObjectByName('lootGoblin');
  if (!source?.getObjectByName('treasure-goblin-body')) throw new Error('Missing treasure goblin model');
  const death = animations.find(clip => clip.name === 'treasure-goblin-death');
  if (animations.length && !death) throw new Error('Missing treasure goblin death clip');
  scene.traverse(node => { if (node instanceof THREE.Mesh) node.castShadow = node.receiveShadow = true; });
  library.set('treasure-goblin', { source, death });
}

export function setTrainingDummyAssets(scene: THREE.Object3D, animations: THREE.AnimationClip[]): void {
  const source = scene.getObjectByName('training-dummy');
  const clip = animations.find(animation => animation.name === 'training-dummy-hit');
  if (!source?.getObjectByName('training-dummy-body') || !clip) throw new Error('Missing training dummy model or hit animation');
  scene.traverse(node => { if (node instanceof THREE.Mesh) node.castShadow = node.receiveShadow = true; });
  library.set('training-dummy', { source, clip });
}

/** Damage events also arrive at 1 HP, so every landed hit can restart the recoil. */
export function playMonsterHit(group: THREE.Group | undefined, time: number): void {
  const rig = group && rigs.get(group);
  if (!rig || !Number.isFinite(time) || rig.kind !== 'training-dummy' && !rig.casts?.has('hit')) return;
  if(rig.kind==='training-dummy'){rig.mixer?.stopAllAction(); resetPose(rig);}
  rig.hitAt = time;
}

/** The authored contact keyframe is halfway through the clip, independent of server windup length. */
export function enemyAttackPhase(attack?: EnemyAttackPose, contact = .5): number {
  if (!attack || !Number.isFinite(attack.progress)) return -1;
  const progress = THREE.MathUtils.clamp(attack.progress, 0, 1);
  if (attack.authoredTime) return progress;
  const impact = Number.isFinite(attack.impactProgress) ? THREE.MathUtils.clamp(attack.impactProgress, attack.clip ? .000001 : .05, attack.clip ? .999999 : .95) : .5;
  if (attack.style === 'charge' && !attack.basic && Number.isFinite(attack.chargeProgress)) {
    const launch = THREE.MathUtils.clamp(attack.chargeProgress!, .01, impact - .01);
    if (progress <= launch) return progress / launch * .25;
    if (progress <= impact) return .25 + (progress - launch) / (impact - launch) * .25;
  }
  return progress <= impact ? progress / impact * contact : contact + (progress - impact) / (1 - impact) * (1 - contact);
}

export function createMonsterModel(kind: string): THREE.Group | undefined {
  const approach = createRaidApproachModel(kind); if (approach) return approach;
  if (!(RAID_MODEL_KINDS as readonly string[]).includes(kind) && kind !== 'training-dummy' && kind !== 'treasure-goblin' && !(MONSTER_MODEL_KINDS as readonly string[]).includes(kind) && !(THEMED_MONSTER_KINDS as readonly string[]).includes(kind) && !(INSTANT_COMBAT_MODEL_KINDS as readonly string[]).includes(kind) && !(DUNGEON_BOSS_MODEL_KINDS as readonly string[]).includes(kind)) return;
  const entry = library.get(kind);
  if (!entry) throw new Error(`Monster assets not loaded: ${kind}`);
  const group = new THREE.Group(); group.name = kind;
  // Loot removes this same marker from both imported and original rigs to keep corpses static.
  group.userData.enemyRig = { kind, imported: true };
  const model = entry.source.clone(true);
  model.position.set(0, 0, 0); model.quaternion.identity(); model.scale.set(1, 1, 1);
  group.add(model);
  const rest: RestPose[] = [], parts: Record<string, THREE.Object3D> = {}, legs: THREE.Object3D[] = [], arms: THREE.Object3D[] = [], wings: THREE.Object3D[] = [];
  model.traverse(node => {
    rest.push({ node, position: node.position.clone(), rotation: node.quaternion.clone(), scale: node.scale.clone() });
    if (node.name.startsWith(`${kind}-`)) parts[node.name.slice(kind.length + 1)] = node;
    if (/-(?:leg-\d+|left-leg|right-leg)$/.test(node.name)) legs.push(node);
    if (/-(?:left-arm|right-arm)$/.test(node.name)) arms.push(node);
    if (/-(?:left-wing|right-wing)$/.test(node.name)) wings.push(node);
  });
  const mixer = entry.clip || entry.death ? new THREE.AnimationMixer(model) : undefined;
  const idle = mixer && entry.idle ? mixer.clipAction(entry.idle).setLoop(THREE.LoopOnce, 1) : undefined;
  const walk = mixer && entry.walk ? mixer.clipAction(entry.walk).setLoop(THREE.LoopOnce, 1) : undefined;
  const action = mixer && entry.clip ? mixer.clipAction(entry.clip).setLoop(THREE.LoopOnce, 1) : undefined;
  const auto = mixer && entry.auto ? mixer.clipAction(entry.auto).setLoop(THREE.LoopOnce, 1) : undefined;
  const swipe = mixer && entry.swipe ? mixer.clipAction(entry.swipe).setLoop(THREE.LoopOnce, 1) : undefined;
  const leap = mixer && entry.leap ? mixer.clipAction(entry.leap).setLoop(THREE.LoopOnce, 1) : undefined;
  const cast = mixer && entry.cast ? mixer.clipAction(entry.cast).setLoop(THREE.LoopOnce, 1) : undefined;
  const charge = mixer && entry.charge ? mixer.clipAction(entry.charge).setLoop(THREE.LoopOnce, 1) : undefined;
  const death = mixer && entry.death ? mixer.clipAction(entry.death).setLoop(THREE.LoopOnce, 1) : undefined;
  const casts=mixer&&entry.casts?new Map([...entry.casts].map(([name,clip])=>[name,mixer.clipAction(clip).setLoop(THREE.LoopOnce,1)])):undefined;
  // Prime binding buffers during construction; per-frame scrubbing does not create scene resources.
  if (mixer) for (const clipAction of [idle, walk, action, auto, swipe, leap, cast, charge, death,...(casts?.values()??[])]) if (clipAction) { clipAction.clampWhenFinished = true; clipAction.play(); mixer.setTime(0); mixer.stopAllAction(); }
  const contactEvents: Record<string,string> = {'black-sun':'black_sun_detonate','death-palm':'palm_clench','four-hands':'hit_four_hands','suits-judgment':'judgment'};
  const metadata = model.userData.authoredAnimations as Record<string,{frames:number;events:{name:string;frame:number}[]}> | undefined;
  const contacts = Object.fromEntries(Object.entries(metadata || {}).flatMap(([name, clip]) => {
    const event = clip.events.find(event => event.name === (contactEvents[name] || 'hit')) || clip.events[0];
    return event ? [[name, event.frame / (clip.frames - 1)]] : [];
  }));
  rigs.set(group, { kind: kind as MonsterModelKind, contacts, body: model.getObjectByName(`${kind}-body`)!, head: model.getObjectByName(`${kind}-head`),
    tail: model.getObjectByName(`${kind}-tail`), legs, arms, wings, rest, parts, mixer, idle, walk, action, auto, swipe, leap, cast, charge, death, casts, attacking: false });
  return group;
}

function resetPose(rig: MonsterRig): void {
  for (const part of rig.rest) { part.node.position.copy(part.position); part.node.quaternion.copy(part.rotation); part.node.scale.copy(part.scale); }
}

/** Returns false for the four original voxel rigs, which keep their own procedural animation. */
export function animateMonsterModel(group: THREE.Group, time: number, moving: boolean, attack?: EnemyAttackPose, deathProgress?: number): boolean {
  if (animateRaidApproachModel(group,time,moving,attack,undefined,deathProgress)) return true;
  const rig = rigs.get(group);
  if (!rig) return false;
  if (rig.kind === 'training-dummy') {
    const age = time - (rig.hitAt ?? -Infinity);
    if (rig.action && rig.mixer && age >= 0 && age < rig.action.getClip().duration) {
      rig.action.reset().play(); rig.mixer.setTime(age);
    } else { rig.mixer?.stopAllAction(); resetPose(rig); }
    return true;
  }
  if (!group.userData.enemyRig) { applyIdleAnimation(rig.kind, group, rig.parts, time, false); return true; }
  if (deathProgress !== undefined && Number.isFinite(deathProgress)) {
    applyIdleAnimation(rig.kind, group, rig.parts, time, false);
    const action = rig.death;
    if (action && rig.mixer) {
      if (rig.activeAction !== action) { rig.mixer.stopAllAction(); resetPose(rig); rig.activeAction = action; }
      // Sample the authored collapse independently of wall time. Its final keys
      // hold the same grounded pose used by the subsequent loot corpse.
      rig.attacking = true;
      action.reset().play(); rig.mixer.setTime(THREE.MathUtils.clamp(deathProgress, 0, 1) * action.getClip().duration);
    }
    return true;
  }
  if (!Number.isFinite(time)) return true;
  const phase = enemyAttackPhase(attack);
  if (moving || phase >= 0) applyIdleAnimation(rig.kind, group, rig.parts, time, false);
  if (phase < 0 && rig.attacking) { rig.mixer?.stopAllAction(); rig.attacking = false; rig.activeAction = undefined; }
  if (phase >= 0) {
    rig.attacking = true;
    const action = (attack?.clip?rig.casts?.get(attack.clip):undefined)??(attack?.basic ? rig.auto : attack?.style === 'charge' && rig.charge ? rig.charge : attack?.style === 'swipe' && rig.swipe ? rig.swipe : attack?.style === 'leap' && rig.leap ? rig.leap : attack?.style === 'pulse' && rig.cast ? rig.cast : rig.action);
    if (action && rig.mixer) {
      if (rig.activeAction !== action) { rig.mixer.stopAllAction(); resetPose(rig); rig.activeAction = action; }
      const suffix = action.getClip().name.slice(rig.kind.length + 1);
      action.reset().play(); rig.mixer.setTime(enemyAttackPhase(attack, rig.contacts?.[suffix] ?? .5) * action.getClip().duration);
    } else {
      resetPose(rig);
      if (attack?.basic) {
        const strike = phase <= .5 ? phase * 2 : (1 - phase) * 2;
        rig.body.position.z += .2 * strike;
        if (rig.arms[0]) rig.arms[0].rotation.x -= strike;
        else if (rig.head) rig.head.rotation.x += .15 * strike;
        return true;
      }
      // A clip-free import still has a readable attack, using the same exported pivots.
      const charge = phase < .4 ? phase / .4 : phase < .5 ? 1 - (phase - .4) / .1 : 0;
      const hit = phase < .4 ? 0 : phase < .5 ? (phase - .4) / .1 : (1 - phase) / .5;
      rig.body.position.z += -.12 * charge + .42 * hit;
      rig.body.rotation.x += -.12 * charge + .18 * hit;
      if (rig.head) rig.head.rotation.x += -.18 * charge + .32 * hit;
      for (const arm of rig.arms) arm.rotation.x += -1.8 * charge - 1.2 * hit;
      if (attack?.style === 'sting' && rig.tail) rig.tail.rotation.x += -.7 * charge + 1.0 * hit;
      if (attack?.style === 'pulse' || attack?.style === 'spit') rig.body.scale.multiplyScalar(1 + .1 * charge + .18 * hit);
    }
    return true;
  }
  const hit=rig.casts?.get('hit'),hitAge=time-(rig.hitAt??-Infinity);
  const recoiling=hit&&hitAge>=0&&hitAge<hit.getClip().duration;
  const locomotion = recoiling?hit:moving ? rig.kind==='apostle-incarnate'?rig.casts?.get('run')??rig.walk:rig.walk : rig.idle;
  if (locomotion && rig.mixer) {
    if (rig.activeAction !== locomotion) { rig.mixer.stopAllAction(); resetPose(rig); rig.activeAction = locomotion; }
    locomotion.reset().play(); rig.mixer.setTime(recoiling?hitAge:((time % locomotion.getClip().duration) + locomotion.getClip().duration) % locomotion.getClip().duration);
    return true;
  }
  resetPose(rig);
  if (rig.kind === 'treasure-goblin') {
    const stride = moving ? Math.sin(time * 15) : 0;
    rig.body.position.y += Math.abs(stride) * .055 + Math.sin(time * 5) * .008;
    rig.body.rotation.z += stride * .045;
    for (let index = 0; index < rig.legs.length; index++) rig.legs[index].rotation.x += stride * (index % 2 ? -.85 : .85);
    for (let index = 0; index < rig.arms.length; index++) rig.arms[index].rotation.x -= stride * (index % 2 ? -.5 : .5);
    if (rig.head) rig.head.rotation.y += Math.sin(time * 3.1) * (moving ? .22 : .35);
    if (rig.parts.sack) { rig.parts.sack.rotation.x += Math.sin(time * 15 - .7) * (moving ? .055 : .01); rig.parts.sack.rotation.z -= stride * .035; }
    return true;
  }
  if (!moving && applyIdleAnimation(rig.kind, group, rig.parts, time)) return true;
  const stride = moving ? Math.sin(time * (['briarhorn-elder', 'rimefang-matriarch', 'stormhorn-behemoth', 'ashen-crown-titan'].includes(rig.kind) ? 3.5 : 7)) : 0;
  const breath = Math.sin(time * 1.8);
  rig.body.position.y += (rig.wings.length ? Math.sin(time * 2.2) * .10 : Math.abs(stride) * .025) + breath * .012;
  rig.body.rotation.z += stride * .018;
  if (rig.head) { rig.head.rotation.y += Math.sin(time * .9) * .035; rig.head.rotation.x += breath * .012; }
  for (let index = 0; index < rig.legs.length; index++) rig.legs[index].rotation.x += stride * (index % 2 ? -1 : 1) * (rig.legs.length > 4 ? .25 : .4);
  for (let index = 0; index < rig.arms.length; index++) rig.arms[index].rotation.x -= stride * (index % 2 ? -1 : 1) * .26;
  for (let index = 0; index < rig.wings.length; index++) rig.wings[index].rotation.z += Math.sin(time * 8) * (index % 2 ? -1 : 1) * .38;
  if (rig.tail) rig.tail.rotation.y += Math.sin(time * 2) * .12;
  return true;
}
