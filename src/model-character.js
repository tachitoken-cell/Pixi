// A character drawn with a rigged GLB model instead of the procedural boxes.
// It keeps the procedural pivot rig from Character as an invisible driver, so every animation and
// skill (idle, walk, run, attack, all class skills, sit, wave...) works unchanged: each frame the
// model's bones copy the rotation of the matching pivot group. Weapons stay attached to the hands.
import * as THREE from 'three';
import { ToonMat } from './anime.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import * as SkeletonUtils from '../vendor/SkeletonUtils.js';
import { Character, LOCO_SPEED } from './character.js';

const loader = new GLTFLoader();
const cache = new Map();
// url: a .glb/.gltf file, or a .js module whose default export is the GLB as base64 (for hosts that only
// serve scripts and images). texture: optional image that replaces the model's base colour texture.
function loadModel(url, texture) {
  const key = url + '|' + (texture ?? '');
  if (!cache.has(key)) cache.set(key, (async () => {
    let gltf;
    if (url.endsWith('.js')) {
      const b64 = (await import(new URL(url, document.baseURI).href)).default;
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      gltf = await loader.parseAsync(bytes.buffer, '');
    } else gltf = await loader.loadAsync(url);
    if (texture) {
      const map = await new THREE.TextureLoader().loadAsync(texture);
      map.flipY = false;                        // glTF texture convention
      map.colorSpace = THREE.SRGBColorSpace;
      // the model has one textured material; in hosts that block the embedded image it arrives without a map
      gltf.scene.traverse((o) => { if (o.isMesh) for (const m of [o.material].flat()) { m.map = map; m.color?.set(0xffffff); m.needsUpdate = true; } });
    }
    return gltf;
  })());
  return cache.get(key);
}

// model bone -> procedural pivot group (see Character constructor)
const BONES = [['Body', 'body'], ['Torso', 'torso'], ['Neck', 'neck'], ['ArmL', 'armL'], ['ArmR', 'armR'], ['LegL', 'legL'], ['LegR', 'legR']];
// joints the procedural rig doesn't have: they follow their parent bone plus a bend around the character's
// side-to-side axis, read from the pose (knees, ankles, elbows). Hands follow the forearm; weapons still turn
// with the procedural hand pivot. The first model (v1) only had the bones above plus HandL/HandR.
const JOINTS = [['ForeArmL', 'ArmL', 'elbowL'], ['ForeArmR', 'ArmR', 'elbowR'], ['HandL', 'ForeArmL', null], ['HandR', 'ForeArmR', null],
  ['ShinL', 'LegL', 'kneeL'], ['ShinR', 'LegR', 'kneeR'], ['FootL', 'ShinL', 'footL'], ['FootR', 'ShinR', 'footR']];
const X_AXIS = new THREE.Vector3(1, 0, 0);

const MODEL_HEIGHT = 1.5;                        // exported model height (soles to hair top)
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

export class ModelCharacter extends Character {
  constructor(cls) {
    super(cls);
    // weapons move from the procedural hands to holders that follow the model's hands
    const weapons = new Set([...this.weaponParts, this.sling?.g, this.bow?.g, this.staff?.g, this.orb].filter(Boolean));
    this.holders = {};
    for (const side of ['handR', 'handL']) {
      const holder = new THREE.Group();
      this.root.add(holder);
      for (const child of [...this[side].children]) if (weapons.has(child)) holder.add(child);
      this.holders[side] = holder;
    }
    this.procHeight = this.measureHeight();
    this.model = null;
    loadModel(cls.model, cls.modelTexture).then((gltf) => this.attach(gltf)).catch((e) => console.warn('model load failed, keeping the procedural look', e));
  }

  measureHeight() {
    this.root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const shown = (o) => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };
    this.body.traverse((o) => { if (o.isMesh && shown(o) && !this.holders.handR.getObjectById(o.id) && !this.holders.handL.getObjectById(o.id)) box.expandByObject(o); });
    return box.max.y - Math.min(0, box.min.y);
  }

  attach(gltf) {
    if (gltf.scene.getObjectByName('mixamorigHips')) return this.attachMixamo(gltf);
    const model = gltf.scene.clone(true);           // clone: several characters may share one file
    // skinned meshes need their skeleton re-bound to the cloned bones
    const byName = {};
    model.traverse((o) => { if (o.isBone) byName[o.name] = o; });
    model.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      const bones = o.skeleton.bones.map((b) => byName[b.name]);
      o.bind(new THREE.Skeleton(bones, o.skeleton.boneInverses), o.bindMatrix);
      o.castShadow = true;
      o.frustumCulled = false;
      const lambert = (m) => new ToonMat({ map: m.map, color: m.map ? 0xffffff : m.color });
      o.material = Array.isArray(o.material) ? o.material.map(lambert) : lambert(o.material);
    });
    const s = this.procHeight / MODEL_HEIGHT;       // skinned bounding boxes are unreliable before posing
    model.scale.setScalar(s);
    this.root.add(model);
    this.root.updateMatrixWorld(true);

    const rootInv = this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
    const entry = (b, extra) => ({
      bone: b, ...extra,
      rest: rootInv.clone().multiply(b.getWorldQuaternion(new THREE.Quaternion())),    // rest rotation, root space
      restPos: b.position.clone(), restLocal: this.root.worldToLocal(b.getWorldPosition(new THREE.Vector3())), // root space: follows the character
    });
    this.bones = BONES.filter(([bone]) => byName[bone]).map(([bone, group]) => entry(byName[bone], { group: this[group] }));
    // v2 rig: extra joints (processed after their parents); the v1 rig drives its hands from the hand pivots
    if (byName.ForeArmL) for (const [bone, parent, key] of JOINTS) this.bones.push(entry(byName[bone], { parent, key }));
    else for (const [bone, group] of [['HandL', 'handL'], ['HandR', 'handR']]) if (byName[bone]) this.bones.push(entry(byName[bone], { group: this[group] }));
    this.boneBy = Object.fromEntries(this.bones.map((e) => [e.bone.name, e]));
    // the procedural body is only a driver from now on: hide its meshes (weapons live on the holders)
    this.body.traverse((o) => { if (o.isMesh) o.visible = false; });
    this.model = model;
    this.sync();
  }

  update(dt) {
    super.update(dt);
    if (this.mix) this.syncMixamo(dt); else this.sync();
  }

  sync() {
    this.root.updateMatrixWorld(true);
    const rootInv = this.root.getWorldQuaternion(_q2).invert();
    if (this.model) {
      const posed = {}, delta = {};
      for (const e of this.bones) {
        let want;
        if (e.group) {
          // pivot rotation relative to the character root, applied on top of the bone's rest rotation
          delta[e.bone.name] = rootInv.clone().multiply(e.group.getWorldQuaternion(_q));
          want = delta[e.bone.name].clone().multiply(e.rest);
        } else {
          // extra joint: the parent's rotation, then its own bend around the side-to-side axis
          const d = delta[e.parent].clone();
          if (e.key) d.multiply(_q.setFromAxisAngle(X_AXIS, this.pose[e.key] || 0));
          delta[e.bone.name] = d;
          want = d.clone().multiply(e.rest);
        }
        const parent = posed[e.bone.parent?.name] ?? rootInv.clone().multiply(e.bone.parent.getWorldQuaternion(_q));
        e.bone.quaternion.copy(parent.clone().invert().multiply(want));
        posed[e.bone.name] = want;
      }
      // body bob / crouch: move the body bone by the pivot's height offset
      const body = this.boneBy.Body;
      if (body) {
        const dy = this.body.position.y - this.bodyRestY;
        body.bone.position.copy(body.restPos);
        this.model.updateMatrixWorld(true);
        _v.copy(body.restLocal); _v.y += dy;
        body.bone.position.copy(body.bone.parent.worldToLocal(this.root.localToWorld(_v)));
      }
      this.model.updateMatrixWorld(true);
    }
    // weapon holders follow the model hands (or the procedural hands until the model is loaded); with elbows the
    // weapon also turns with the forearm's bend
    for (const side of ['handR', 'handL']) {
      const holder = this.holders[side], S = side === 'handR' ? 'R' : 'L';
      const src = this.model ? this.boneBy['Hand' + S]?.bone : null;
      (src ?? this[side]).getWorldPosition(_v);
      const fore = src && this.boneBy['ForeArm' + S]?.bone;
      if (fore) {                                   // grip = the middle of the fist, a little past the wrist
        const dir = _v.clone().sub(fore.getWorldPosition(_v2)).normalize();
        _v.addScaledVector(dir, 0.055 * this.model.scale.x * this.root.getWorldScale(_v2).x);
      }
      holder.position.copy(this.root.worldToLocal(_v));
      holder.quaternion.copy(rootInv).multiply(this[side].getWorldQuaternion(_q));
      const bend = this.model && this.boneBy['ForeArm' + S] ? this.pose['elbow' + S] || 0 : 0;
      if (bend) {
        // rotate about the upper arm's current side axis
        const armD = rootInv.clone().multiply(this['arm' + S].getWorldQuaternion(new THREE.Quaternion()));
        const axis = X_AXIS.clone().applyQuaternion(armD);
        holder.quaternion.premultiply(_q.setFromAxisAngle(axis, bend));
      }
    }
  }

  // ---------------------------------------------------------------- rigged + animated models (Mixamo skeleton)
  // The model's own clips play for idle, walking, running, the wounded walk and the attacks. Everything the clips
  // don't cover (skills, sit, wave, cheer, hit, death...) is the procedural pose retargeted onto the same bones,
  // with a short crossfade between the two.
  locomote(speed, turn) { super.locomote(speed, turn); this.locoSpeedSeen = speed; this.drivenAt = this.clock; }

  attachMixamo(gltf) {
    const model = SkeletonUtils.clone(gltf.scene);
    model.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      o.castShadow = true; o.frustumCulled = false;
      const lambert = (m) => new ToonMat({ map: m.map, color: m.map ? 0xffffff : m.color });
      o.material = Array.isArray(o.material) ? o.material.map(lambert) : lambert(o.material);
    });
    let top = 1.7;
    model.traverse((o) => { if (o.isSkinnedMesh) { o.geometry.computeBoundingBox(); top = o.geometry.boundingBox.max.y; } });
    model.scale.setScalar(this.procHeight / top);
    this.root.add(model);
    this.model = model;
    const B = (n) => model.getObjectByName('mixamorig' + n);
    this.mx = { hips: B('Hips'), bones: [] };
    this.root.updateMatrixWorld(true);
    const rootInv = this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
    const rq = (o) => rootInv.clone().multiply(o.getWorldQuaternion(new THREE.Quaternion()));
    // the bind pose is a T-pose: turn the arms down so "no rotation" matches the procedural arms hanging down
    const down = { Left: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2 + 0.2),
      Right: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2 - 0.2) };
    const map = { Hips: { group: 'body' }, Spine: { group: 'torso' }, Head: { group: 'neck' },
      LeftUpLeg: { group: 'legL' }, RightUpLeg: { group: 'legR' }, LeftLeg: { parent: 'LeftUpLeg', key: 'kneeL' }, RightLeg: { parent: 'RightUpLeg', key: 'kneeR' },
      LeftFoot: { parent: 'LeftLeg', key: 'footL' }, RightFoot: { parent: 'RightLeg', key: 'footR' },
      LeftArm: { group: 'armL', side: 'Left' }, RightArm: { group: 'armR', side: 'Right' },
      LeftForeArm: { parent: 'LeftArm', key: 'elbowL', side: 'Left' }, RightForeArm: { parent: 'RightArm', key: 'elbowR', side: 'Right' },
      LeftHand: { parent: 'LeftForeArm', side: 'Left' }, RightHand: { parent: 'RightForeArm', side: 'Right' } };
    // every bone in hierarchy order, with its bind rotation (local and root space)
    this.mx.hips.traverse((o) => {
      if (!o.isBone) return;
      const name = o.name.replace('mixamorig', ''), m = map[name] || {};
      let rest = rq(o);
      if (m.side) rest = down[m.side].clone().multiply(rest);
      this.mx.bones.push({ bone: o, name, group: m.group && this[m.group], parent: m.parent, key: m.key, rest, restLocal: o.quaternion.clone() });
    });
    this.mx.by = Object.fromEntries(this.mx.bones.map((b) => [b.name, b]));
    this.mx.hipsRest = this.mx.hips.position.clone();
    this.mx.hipsParentQ = rq(this.mx.hips.parent);
    // clips: keep them in place (no drift), face forward, split the attack combo into two strikes
    const mixer = new THREE.AnimationMixer(model);
    const clip = (n) => gltf.animations.find((a) => a.name === n);
    const inPlace = (c) => {
      for (const tr of c.tracks) if (tr.name.endsWith('Hips.position')) {
        const v = tr.values, x0 = v[0], z0 = v[2];
        for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
      }
      return c;
    };
    const faceForward = (c) => {           // take out the clip's average turn of the hips
      const tr = c.tracks.find((t) => t.name.endsWith('Hips.quaternion'));
      if (!tr) return c;
      const q = new THREE.Quaternion(), e = new THREE.Euler();
      let sum = 0;
      for (let i = 0; i < tr.values.length; i += 4) { q.fromArray(tr.values, i); sum += e.setFromQuaternion(q, 'YXZ').y; }
      const fix = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -sum / (tr.values.length / 4));
      for (let i = 0; i < tr.values.length; i += 4) { q.fromArray(tr.values, i).premultiply(fix).toArray(tr.values, i); }
      return c;
    };
    const A = {};
    for (const n of ['Idle', 'Walk', 'Run', 'Tired']) if (clip(n)) {
      const c = inPlace(n === 'Idle' ? faceForward(clip(n).clone()) : clip(n).clone());
      A[n] = mixer.clipAction(c); A[n].play(); A[n].setEffectiveWeight(0);
    }
    const atk = clip('Attack') && inPlace(clip('Attack').clone());
    if (atk) {
      const fps = 30;
      A.Strike1 = mixer.clipAction(faceForward(THREE.AnimationUtils.subclip(atk, 'Strike1', Math.round(0.2 * fps), Math.round(0.95 * fps), fps)));
      A.Strike2 = mixer.clipAction(faceForward(THREE.AnimationUtils.subclip(atk, 'Strike2', Math.round(0.95 * fps), Math.round(1.8 * fps), fps)));
      A.Combo = mixer.clipAction(faceForward(atk));
      for (const k of ['Strike1', 'Strike2', 'Combo']) { A[k].setLoop(THREE.LoopOnce); A[k].clampWhenFinished = true; }
    }
    this.mix = { mixer, A, w: 1, strike: 0, oneShot: null, loco: { Idle: 1, Walk: 0, Run: 0, Tired: 0 } };
    // weapon grip: the fist is between the hand bone and the middle fingertip
    this.mx.fingerR = B('RightHandMiddle4'); this.mx.fingerL = B('LeftHandMiddle4');
    this.body.traverse((o) => { if (o.isMesh) o.visible = false; });
    this.mixSetup = true;
  }

  syncMixamo(dt) {
    const { mixer, A } = this.mix, mx = this.mx;
    this.root.updateMatrixWorld(true);
    const rootInv = this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
    // which one-shots the model's own clips play; everything else is procedural
    const CLIP_SHOTS = { attack: () => (this.mix.strike ^= 1) ? 'Strike1' : 'Strike2', strongHit: () => 'Strike2', beatUp: () => 'Combo' };
    const shot = this.oneShot && CLIP_SHOTS[this.state] && A.Strike1 ? this.state : null;
    if (shot && this.mix.oneShotFor !== this.shotSeq) {
      this.mix.oneShotFor = this.shotSeq;
      const act = A[CLIP_SHOTS[shot]()];
      const D = this.duration(this.state);
      act.reset(); act.setEffectiveWeight(1); act.timeScale = act.getClip().duration / D; act.fadeIn(0.06); act.play();
      if (this.mix.oneShot && this.mix.oneShot !== act) this.mix.oneShot.fadeOut(0.08);
      this.mix.oneShot = act;
    }
    if (!shot && this.mix.oneShot) { this.mix.oneShot.fadeOut(0.15); this.mix.oneShot = null; this.mix.oneShotFor = null; }
    const procedural = !shot && (this.oneShot || !['idle', 'walk', 'run', 'sprint'].includes(this.base) || this.base === 'sit');
    // locomotion weights from the real speed (idle -> walk -> run), the wounded walk when HP is low
    const spd = this.clock - (this.drivenAt ?? -9) < 0.25 ? this.locoSpeedSeen : (LOCO_SPEED[this.base] ?? 0);
    const L = { Idle: 0, Walk: 0, Run: 0, Tired: 0 };
    const moving = Math.min(1, spd / 1.2);
    L.Idle = 1 - moving;
    if (this.tired && A.Tired) L.Tired = moving;
    else { const t = Math.max(0, Math.min(1, (spd - 2.3) / 2.9)); L.Walk = moving * (1 - t); L.Run = moving * t; }
    const k = 1 - Math.exp(-dt * 10);
    for (const n of Object.keys(L)) if (A[n]) {
      this.mix.loco[n] += (L[n] - this.mix.loco[n]) * k;
      A[n].setEffectiveWeight(this.mix.loco[n] * (this.mix.oneShot ? 0.02 : 1));
    }
    // the clips' natural speeds (world units / s) set how fast they play, so the feet match the ground
    const native = { Walk: 2.6, Run: 6.2, Tired: 1.2 };
    if (A.Walk) A.Walk.timeScale = Math.max(0.5, Math.min(1.8, (spd || 2.3) / native.Walk));
    if (A.Run) A.Run.timeScale = Math.max(0.6, Math.min(1.6, (spd || 5.2) / native.Run));
    if (A.Tired) A.Tired.timeScale = Math.max(0.6, Math.min(2.5, (spd || 1.2) / 2.2));
    mixer.update(dt);
    // crossfade to the procedural pose
    this.mix.w += ((procedural ? 1 : 0) - this.mix.w) * (1 - Math.exp(-dt * 14));
    const w = this.mix.w;
    if (w > 0.002) {
      const R = {}, delta = {};
      let parentQ = mx.hipsParentQ;
      for (const b of mx.bones) {
        const pq = b.bone.parent && R[b.bone.parent.name] ? R[b.bone.parent.name] : parentQ;
        let want;
        if (b.group) {
          delta[b.name] = rootInv.clone().multiply(b.group.getWorldQuaternion(new THREE.Quaternion()));
          want = delta[b.name].clone().multiply(b.rest);
        } else if (b.parent && delta[b.parent]) {
          const d = delta[b.parent].clone();
          if (b.key) d.multiply(new THREE.Quaternion().setFromAxisAngle(X_AXIS, this.pose[b.key] || 0));
          delta[b.name] = d;
          want = d.clone().multiply(b.rest);
        } else want = pq.clone().multiply(b.restLocal);
        R[b.bone.name] = want;
        const local = pq.clone().invert().multiply(want);
        b.bone.quaternion.slerp(local, w);
      }
      // body bob / crouch from the procedural hips height
      const dy = (this.body.position.y - this.bodyRestY) / this.model.scale.y;
      _v.copy(mx.hipsRest); _v.y += dy;
      mx.hips.position.lerp(_v, w);
    }
    this.model.updateMatrixWorld(true);
    // weapons follow the real hands; the wrist angle of the procedural pose still turns them
    for (const side of ['handR', 'handL']) {
      const S = side === 'handR' ? 'Right' : 'Left';
      const hb = mx.by[S + 'Hand'].bone, tip = side === 'handR' ? mx.fingerR : mx.fingerL;
      hb.getWorldPosition(_v);
      if (tip) _v.lerp(tip.getWorldPosition(_v2), 0.45);
      const holder = this.holders[side];
      holder.position.copy(this.root.worldToLocal(_v));
      const hand = this[side];
      // bone frame -> the procedural arm frame it replaces, then the procedural wrist turn
      const boneQ = rootInv.clone().multiply(hb.getWorldQuaternion(new THREE.Quaternion()));
      const restFix = mx.by[S + 'Hand'].rest.clone().invert();
      holder.quaternion.copy(boneQ).multiply(restFix).multiply(hand.quaternion);
    }
  }

  get bodyRestY() { return this._bodyRestY ??= (this.body.position.y - this.pose.bodyY); }

  worldPos(obj, x = 0, y = 0, z = 0) {
    if (obj === this.handR) obj = this.holders.handR;
    else if (obj === this.handL) obj = this.holders.handL;
    return obj.localToWorld(new THREE.Vector3(x, y, z));
  }
}

export function makeCharacter(cls) {
  return cls.model ? new ModelCharacter(cls) : new Character(cls);
}
