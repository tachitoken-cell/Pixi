// A character drawn with a rigged GLB model instead of the procedural boxes.
// It keeps the procedural pivot rig from Character as an invisible driver, so every animation and
// skill (idle, walk, run, attack, all class skills, sit, wave...) works unchanged: each frame the
// model's bones copy the rotation of the matching pivot group. Weapons stay attached to the hands.
import * as THREE from 'three';
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
      gltf.scene.traverse((o) => { if (o.isMesh) o.material.map = map; });
    }
    return gltf;
  })());
  return cache.get(key);
}

// model bone -> procedural pivot group (see Character constructor)
const BONES = [['Body', 'body'], ['Torso', 'torso'], ['Neck', 'neck'], ['ArmL', 'armL'], ['HandL', 'handL'],
  ['ArmR', 'armR'], ['HandR', 'handR'], ['LegL', 'legL'], ['LegR', 'legR']];

const MODEL_HEIGHT = 1.5;                        // exported model height (soles to hair top)
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3();

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
      const map = o.material.map;
      o.material = new THREE.MeshLambertMaterial({ map });
    });
    const s = this.procHeight / MODEL_HEIGHT;       // skinned bounding boxes are unreliable before posing
    model.scale.setScalar(s);
    this.root.add(model);
    this.root.updateMatrixWorld(true);

    const rootInv = this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
    this.bones = BONES.map(([bone, group]) => {
      const b = byName[bone];
      if (!b) return null;
      return {
        bone: b, group: this[group],
        rest: rootInv.clone().multiply(b.getWorldQuaternion(new THREE.Quaternion())),    // rest rotation, root space
        restPos: b.position.clone(), restWorld: b.getWorldPosition(new THREE.Vector3()),
      };
    }).filter(Boolean);
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
      const posed = {};
      for (const e of this.bones) {
        // pivot rotation relative to the character root, applied on top of the bone's rest rotation
        const want = rootInv.clone().multiply(e.group.getWorldQuaternion(_q)).multiply(e.rest);
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
        _v.copy(body.restWorld).add(new THREE.Vector3(0, dy, 0).applyQuaternion(this.root.quaternion));
        body.bone.position.copy(body.bone.parent.worldToLocal(_v));
      }
      this.model.updateMatrixWorld(true);
    }
    // weapon holders follow the model hands (or the procedural hands until the model is loaded)
    for (const side of ['handR', 'handL']) {
      const holder = this.holders[side], src = this.model ? this.boneBy[side === 'handR' ? 'HandR' : 'HandL']?.bone : null;
      (src ?? this[side]).getWorldPosition(_v);
      holder.position.copy(this.root.worldToLocal(_v));
      holder.quaternion.copy(rootInv).multiply(this[side].getWorldQuaternion(_q));
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
