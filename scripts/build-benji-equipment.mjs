import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { createBenjiModel, exportBenjiGlb } from './lib/benji-model.mjs';

const source = new URL('../assets/source/benji-equipment-2026-09-28/', import.meta.url);
const read = name => JSON.parse(gunzipSync(readFileSync(new URL(name + '.json.gz', source))));
const scene = new THREE.Group(), animations = [];
for (const quality of ['epic', 'mythic']) for (const cls of ['knight', 'ranger', 'mage', 'cleric']) for (const rank of [0, 5]) {
  const name = `${quality}-${cls}-weapon_plus${rank}`, data = read(`arsenal/${name}`);
  const model = createBenjiModel(data, { name });
  model.scene.rotation.x = -Math.PI / 2;
  model.scene.userData.arsenal = data.weapon;
  scene.add(model.scene); animations.push(...model.animations);
}
writeFileSync(new URL('../public/models/benji-arsenal.glb', import.meta.url), await exportBenjiGlb(scene, animations));

// Retarget only motion, never the supplied SP1 mannequin, onto the existing player rig.
const poses = {}, basis = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2), inverse = basis.clone().invert();
for (const cls of ['knight', 'ranger', 'mage', 'cleric']) {
  poses[cls] = {};
  for (const outcome of ['channel', 'success', 'fail', 'break']) {
    const data = read(`upgrades/${cls}/sp_upgrade_${outcome}`), animation = data.animations[`sp_upgrade_${outcome}`];
    poses[cls][outcome] = { duration: animation.duration, parts: {} };
    for (const part of ['root', 'body', 'head', 'left-arm', 'right-arm', 'left-leg', 'right-leg', 'cape']) {
      const index = data.skeleton.findIndex(bone => bone.name === `rig-${part}`), bone = data.skeleton[index], track = animation.tracks.find(track => track.bone === index);
      if (!bone || !track) throw Error(`Missing ${cls}/${outcome}/${part}`);
      poses[cls][outcome].parts[part] = {
        r: track.r.map(q => new THREE.Quaternion().fromArray(q).normalize().premultiply(basis).multiply(inverse).toArray()),
        t: track.t.map(t => new THREE.Vector3().fromArray(t).sub(new THREE.Vector3().fromArray(bone.rest.t)).applyQuaternion(basis).toArray()),
      };
    }
  }
}
const fxScene = new THREE.Group(), fxAnimations = [];
for (const outcome of ['channel', 'success', 'fail', 'break']) {
  const data = read(`upgrades/ranger/sp_upgrade_${outcome}`), root = data.skeleton.findIndex(bone => bone.name === 'skill-sp-upgrade');
  const selected = new Set([root]); data.skeleton.forEach((bone, index) => { if (selected.has(bone.parent)) selected.add(index); });
  const indices = [...selected], remap = new Map(indices.map((old, next) => [old, next]));
  const subset = { ...data, skeleton: indices.map(index => ({ ...data.skeleton[index], parent: remap.get(data.skeleton[index].parent) ?? -1 })),
    meshes: data.meshes.filter(mesh => !mesh.preview_only && mesh.bone.every(bone => selected.has(bone))).map(mesh => ({ ...mesh, bone: mesh.bone.map(bone => remap.get(bone)) })),
    animations: Object.fromEntries(Object.entries(data.animations).map(([name, animation]) => [name, { ...animation, tracks: animation.tracks.filter(track => selected.has(track.bone)).map(track => ({ ...track, bone: remap.get(track.bone) })) }])) };
  const model = createBenjiModel(subset, { name: `upgrade-${outcome}` }); fxScene.add(model.scene); fxAnimations.push(...model.animations);
}
writeFileSync(new URL('../public/models/benji-upgrades.glb', import.meta.url), await exportBenjiGlb(fxScene, fxAnimations));
mkdirSync(new URL('../public/animations/', import.meta.url), { recursive: true });
writeFileSync(new URL('../public/animations/benji-upgrade-poses.json', import.meta.url), JSON.stringify(poses));
console.log('Built 16 active arsenal variants and four upgrade effects with motion for all four existing classes.');
