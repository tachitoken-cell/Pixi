// A character drawn with a rigged GLB model instead of the procedural boxes.
// It keeps the procedural pivot rig from Character as an invisible driver, so every animation and
// skill (idle, walk, run, attack, all class skills, sit, wave...) works unchanged: each frame the
// model's bones copy the rotation of the matching pivot group. Weapons stay attached to the hands.
import * as THREE from 'three';
import { ToonMat } from './anime.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { Character } from './character.js';

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
      gltf.scene.traverse((o) => { if (o.isMesh) for (const m of [o.material].flat()) if (m.map) m.map = map; }); // only textured parts (the face and hair)
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
    const weapons = new Set([...this.weaponParts, this.sling?.g, this.bow?.g, this.staff?.g].filter(Boolean));
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
    this.sync();
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
