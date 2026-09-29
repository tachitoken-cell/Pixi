// Export the real game hierarchies and sampled runtime poses, including the bow string.
// Run: node scripts/export-trailer-actors.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { DEFAULT_APPEARANCE } from '../src/appearance.ts';
import { starterGear } from '../src/progression.ts';

const runtimeURL = new URL('../src/characters.ts', import.meta.url);
const source = readFileSync(runtimeURL, 'utf8');
const script = stripTypeScriptTypes(source).replace(/from\s+(['"])([^'"]+)\1/g,
  (_, quote, specifier) => `from ${quote}${specifier.startsWith('.') ? new URL(specifier, runtimeURL).href : import.meta.resolve(specifier)}${quote}`);
const { makeCharacter, animateCharacter, setCharacterCustomization, setCharacterGear, setCharacterRaces } =
  await import(`data:text/javascript;base64,${Buffer.from(script).toString('base64')}`);
for (const [name, setter] of [['customization-kit', setCharacterCustomization], ['gear-kit', setCharacterGear], ['race-kit', setCharacterRaces]]) {
  const bytes = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
  setter((await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene);
}
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }); }
};

const scene = new THREE.Scene(), clips = [], reports = [], fps = 24;
const cast = [
  { id: 'ranger', className: 'Ranger', outfit: '#3c7443', accent: '#d3b569', hair: '#543823', face: 'bright', ability: 'arrow', weapon: 'warden-longbow' },
  { id: 'knight', className: 'Knight', outfit: '#923f36', accent: '#b64b40', hair: '#4d2f24', face: 'stern', ability: 'strike', weapon: 'sunsteel-sword', armor: 'sunsteel-plate' },
  { id: 'mage', className: 'Mage', outfit: '#6452a1', accent: '#759bd8', hair: '#ece5d9', face: 'calm', ability: 'fireball', weapon: 'starfall-staff' },
];
for (const entry of cast) {
  const equipment = { ...starterGear(entry.className).equipment, weapon: entry.weapon, head: `${entry.id}-head` };
  if (entry.armor) equipment.armor = entry.armor;
  const avatar = makeCharacter({ ...DEFAULT_APPEARANCE, ...Object.fromEntries(['className','outfit','accent','hair','face'].map(key => [key, entry[key]])) }, equipment);
  animateCharacter(avatar, 0, false);
  const rig = avatar.userData.rig, links = [], instances = [], names = new Set();
  function name(value) {
    const base = `${entry.id}-${value || 'part'}`;
    let candidate = base, suffix = 2;
    while (names.has(candidate)) candidate = `${base}-${suffix++}`;
    names.add(candidate);
    return candidate;
  }
  function copyTransform(from, to) {
    to.position.copy(from.position); to.quaternion.copy(from.quaternion); to.scale.copy(from.scale);
  }
  const matrix = new THREE.Matrix4(), tint = new THREE.Color();
  function instanceTransform(batch, index, mesh) {
    batch.getMatrixAt(index, matrix);
    // Runtime hides the nocked arrow with a zero matrix scale; decomposition would yield NaNs.
    if (Math.abs(matrix.determinant()) < 1e-12) {
      mesh.position.setFromMatrixPosition(matrix); mesh.quaternion.identity(); mesh.scale.setScalar(0);
    } else matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
  }
  function convert(node) {
    if (!node.visible) return null;
    const result = node.isMesh && !node.isInstancedMesh ? new THREE.Mesh(node.geometry, node.material) : new THREE.Group();
    result.name = node === avatar ? `hero-${entry.id}` : name(node.name);
    copyTransform(node, result); links.push([node, result]);
    if (node.isInstancedMesh) {
      const namedParts = Object.fromEntries(Object.entries(node.userData.namedParts || {}).map(([key, index]) => [index, key]));
      for (let index = 0; index < node.count; index++) {
        const material = node.material.clone();
        if (node.instanceColor) { node.getColorAt(index, tint); material.color.multiply(tint); }
        const mesh = new THREE.Mesh(node.geometry, material);
        mesh.name = name(`${node.parent.name}-${namedParts[index] || `voxel-${index}`}`);
        instanceTransform(node, index, mesh); result.add(mesh); instances.push([node, index, mesh]);
      }
    }
    for (const child of node.children) { const converted = convert(child); if (converted) result.add(converted); }
    return result;
  }
  const root = convert(avatar);
  root.userData = { role: entry.id, source: 'src/characters.ts + race-kit/customization-kit/gear-kit.glb', forward: '+Z', feet: 'Y=0' };
  scene.add(root);
  const nodes = []; root.traverse(node => nodes.push(node));
  const report = { hero: root.name, meshes: nodes.filter(node => node.isMesh).length, nodes: nodes.length, clips: [] }, actorClips = [];
  for (const [kind, frames] of [['run', 20], ['idle', 48], ['attack', 24]]) {
    const duration = frames / fps, times = Array.from({ length: frames + 1 }, (_, index) => index / fps);
    const samples = new Map(nodes.map(node => [node, { position: [], quaternion: [], scale: [] }]));
    for (const t of times) {
      const runtimeTime = kind === 'run' ? t / duration * Math.PI * 2 / 11 : t;
      animateCharacter(avatar, runtimeTime, kind === 'run', kind === 'attack' ? { ability: entry.ability, progress: t / duration } : false);
      for (const [from, to] of links) copyTransform(from, to);
      for (const [batch, index, mesh] of instances) instanceTransform(batch, index, mesh);
      for (const node of nodes) {
        const sample = samples.get(node);
        sample.position.push(...node.position.toArray());
        sample.quaternion.push(...node.quaternion.toArray());
        sample.scale.push(...node.scale.toArray());
      }
    }
    const tracks = [];
    for (const [node, samplesByProperty] of samples) for (const [property, values] of Object.entries(samplesByProperty)) {
      const size = property === 'quaternion' ? 4 : 3;
      // Closing the loop also closes the tiny runtime breathing and eye variations.
      if (kind !== 'attack') values.splice(values.length - size, size, ...values.slice(0, size));
      assert(values.every(Number.isFinite), `${node.name}.${property} contains invalid values`);
      if (!values.some((value, index) => Math.abs(value - values[index % size]) > 1e-6)) continue;
      const Track = property === 'quaternion' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
      tracks.push(new Track(`${node.name}.${property}`, times, values));
    }
    assert(tracks.length > 4, `${entry.id}-${kind} has no articulated animation`);
    if (kind === 'run') {
      const leg = tracks.find(track => track.name === `${entry.id}-left-leg.quaternion`);
      assert(leg && Math.max(...leg.values) - Math.min(...leg.values) > .25, 'Run must articulate legs');
    }
    if (kind === 'attack') {
      const arm = tracks.find(track => track.name === `${entry.id}-right-arm.quaternion`);
      assert(arm && Math.abs(arm.values[4 * 6] - arm.values[0]) > .15, 'Attack must move the weapon arm');
      if (entry.id === 'ranger') {
        assert(tracks.some(track => track.name.includes('string-bottom.quaternion')), 'Bow must deform');
        assert(tracks.some(track => track.name.includes('nocked-arrow-0.scale')), 'Nocked arrow must appear and release');
      }
    }
    const clip = new THREE.AnimationClip(`${entry.id}-${kind}`, duration, tracks);
    actorClips.push({ clip, times, samples });
  }
  // Every clip resets every animated pivot, including legs at rest and the released bow.
  const animatedNames = new Set(actorClips.flatMap(({ clip }) => clip.tracks.map(track => track.name.split('.')[0])));
  for (const { clip, times, samples } of actorClips) {
    for (const [node, properties] of samples) if (animatedNames.has(node.name)) for (const [property, values] of Object.entries(properties)) {
      const target = `${node.name}.${property}`;
      if (clip.tracks.some(track => track.name === target)) continue;
      const Track = property === 'quaternion' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
      clip.tracks.push(new Track(target, times, values));
    }
    clips.push(clip); report.clips.push({ name: clip.name, duration: clip.duration, tracks: clip.tracks.length });
  }
  animateCharacter(avatar, 0, false);
  for (const [from, to] of links) copyTransform(from, to);
  for (const [batch, index, mesh] of instances) instanceTransform(batch, index, mesh);
  reports.push(report);
}

const glb = Buffer.from(await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true, animations: clips, trs: true }));
const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
assert.equal(json.animations.length, 9);
assert(!json.extensionsUsed?.includes('EXT_mesh_gpu_instancing'), 'Blender must get regular articulated objects');
for (const animation of json.animations) for (const channel of animation.channels) assert(json.nodes[channel.target.node]?.name, 'Animation references a missing node');
const roundtrip = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
assert.equal(roundtrip.animations.length, 9);
for (const { id } of cast) {
  const leg = roundtrip.scene.getObjectByName(`${id}-left-leg`), mixer = new THREE.AnimationMixer(roundtrip.scene);
  const action = mixer.clipAction(THREE.AnimationClip.findByName(roundtrip.animations, `${id}-run`));
  action.play(); mixer.setTime(0); const before = leg.quaternion.clone(); mixer.setTime(.2);
  assert(before.angleTo(leg.quaternion) > .4, 'Exported run must still articulate in an actual GLTF loader');
  mixer.stopAllAction();
  const weapon = roundtrip.scene.getObjectByName(`${id}-${{ ranger: 'bow', knight: 'sword', mage: 'staff' }[id]}`);
  mixer.clipAction(THREE.AnimationClip.findByName(roundtrip.animations, `${id}-attack`)).play(); mixer.setTime(0);
  const weaponStart = weapon.getWorldPosition(new THREE.Vector3()); mixer.setTime(.25);
  assert(weaponStart.distanceTo(weapon.getWorldPosition(new THREE.Vector3())) > .15, 'Exported attack must move the held weapon');
  mixer.stopAllAction();
  mixer.clipAction(THREE.AnimationClip.findByName(roundtrip.animations, `${id}-idle`)).play(); mixer.setTime(.1);
  assert(leg.quaternion.angleTo(before) < 1e-5, 'Idle must reset the running leg pose');
  mixer.stopAllAction();
}
const output = new URL('../assets/trailer-story/', import.meta.url);
mkdirSync(output, { recursive: true });
writeFileSync(new URL('actors.glb', output), glb);
writeFileSync(new URL('actor-inspection.json', output), JSON.stringify({ fps, sourceSHA256: createHash('sha256').update(source).digest('hex'), bytes: glb.length, checks: 'finite TRS; run legs; attack arms; bow deformation; all 9 clips and targets; GLTFLoader run playback', actors: reports }, null, 2));
console.log(JSON.stringify({ output: new URL('actors.glb', output).pathname, bytes: glb.length, actors: reports }, null, 2));
