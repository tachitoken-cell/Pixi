import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

/** Offline adapter: every supplied vertex has one full-weight bone. Partition
 * triangles at those rigid joints and apply inverse bind matrices exactly, so
 * the runtime keeps ordinary shared meshes and independent cloned transforms. */
export function createBenjiModel(data, { name, boneName = bone => `${name}-${bone.name}` } = {}) {
  assert.equal(data.format, 'horned_apostle.skinned_model');
  assert(name, 'A stable runtime root name is required');
  const scene = new THREE.Group(); scene.name = name;
  const bones = data.skeleton.map(bone => {
    const node = new THREE.Group(); node.name = boneName(bone);
    node.userData.sourceName = bone.name;
    node.position.fromArray(bone.rest.t); node.quaternion.fromArray(bone.rest.r).normalize(); node.scale.fromArray(bone.rest.s);
    return node;
  });
  data.skeleton.forEach((bone, index) => (bone.parent < 0 ? scene : bones[bone.parent]).add(bones[index]));
  const materials = data.materials.map(source => {
    const material = new THREE.MeshStandardMaterial({ name: source.name, color: 0xffffff, vertexColors: true,
      roughness: source.roughness, metalness: source.metallic || 0, side: THREE.DoubleSide });
    if (source.emission_from_vertex_color) material.userData.benjiVertexEmission = Math.min(source.emission_strength, 4);
    else if (source.emission_strength > 0) {
      material.emissive.fromArray(source.emission_color); material.emissiveIntensity = Math.min(source.emission_strength, 4);
    }
    return material;
  });
  for (const source of data.meshes) {
    assert.equal(source.bone.length, source.vertex_count);
    const groups = new Map();
    for (const submesh of source.submeshes) for (let at = 0; at < submesh.indices.length; at += 3) {
      const triangle = submesh.indices.slice(at, at + 3), bone = source.bone[triangle[0]];
      assert(triangle.length === 3 && triangle.every(index => source.bone[index] === bone), `${source.name}: triangle spans bones`);
      const key = `${bone}:${submesh.material}`;
      if (!groups.has(key)) groups.set(key, { bone, material: submesh.material, indices: [] });
      groups.get(key).indices.push(...triangle);
    }
    for (const { bone, material, indices } of groups.values()) {
      const remap = new Map(), positions = [], normals = [], colors = [], mapped = [];
      for (const original of indices) {
        if (!remap.has(original)) {
          remap.set(original, remap.size);
          positions.push(...source.positions.slice(original * 3, original * 3 + 3));
          normals.push(...source.normals.slice(original * 3, original * 3 + 3));
          colors.push(...source.colors.slice(original * 4, original * 4 + 3));
        }
        mapped.push(remap.get(original));
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.setIndex(mapped);
      geometry.applyMatrix4(new THREE.Matrix4().fromArray(data.skeleton[bone].inverse_bind));
      const mesh = new THREE.Mesh(geometry, materials[material]); mesh.name = `${bones[bone].name}-mesh-${material}`;
      if (data.materials[material].name === 'True Apostle gold halo gem') mesh.name = `${name}-halo-gem`;
      mesh.userData.sourceMesh = source.name; bones[bone].add(mesh);
    }
  }
  const animations = Object.entries(data.animations || {}).map(([suffix, animation]) => {
    const tracks = [];
    for (const source of animation.tracks) for (const [key, property] of [['t', 'position'], ['r', 'quaternion'], ['s', 'scale']]) {
      const values = source[key]; if (!values?.length) continue;
      const times = values.map((_, index) => values.length === 1 ? 0 : index * animation.duration / (values.length - 1));
      const Track = key === 'r' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
      tracks.push(new Track(`${bones[source.bone].name}.${property}`, times, values.flat()));
    }
    return new THREE.AnimationClip(`${name}-${suffix}`, animation.duration, tracks);
  });
  scene.userData.authoredAnimations = Object.fromEntries(Object.entries(data.animations || {}).map(([key, { tracks, ...metadata }]) => [key, metadata]));
  scene.updateMatrixWorld(true);
  return { scene, bones, animations };
}

/** GLTFExporter only uses FileReader for its generated binary buffer here. */
export async function exportBenjiGlb(scene, animations = []) {
  const PreviousFileReader = globalThis.FileReader;
  globalThis.FileReader = class {
    async readAsArrayBuffer(blob) { this.result = await blob.arrayBuffer(); this.onloadend?.(); }
  };
  try { return Buffer.from(await new GLTFExporter().parseAsync(scene, { binary: true, animations, onlyVisible: false })); }
  finally { if (PreviousFileReader) globalThis.FileReader = PreviousFileReader; else delete globalThis.FileReader; }
}
