// Sample the game's articulated monster rigs into reusable trailer clips.
// node scripts/export-trailer-monsters.mjs
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createMonsterModel, animateMonsterModel, setMonsterAssets } from '../src/monster-models.ts';

globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }); }
};
const loader = new GLTFLoader();
const bytes = readFileSync(new URL('../public/models/monster-kit.glb', import.meta.url));
const asset = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
setMonsterAssets(asset.scene, asset.animations);
const scene = new THREE.Scene(), clips = [], inspection = [];
const fps = 24;
for (const [id, kind] of [['wolf', 'bramble-wolf'], ['golem', 'stone-golem'], ['boss', 'stormhorn-behemoth']]) {
  const root = createMonsterModel(kind);
  root.name = `monster-${id}`;
  scene.add(root);
  const nodes = [];
  root.traverse(node => nodes.push(node));
  const metrics = { root: root.name, kind, clips: [] };
  for (const mode of ['idle', 'run', 'attack']) {
    const duration = mode === 'idle' ? 2 : 1, frames = duration * fps;
    const times = Array.from({ length: frames + 1 }, (_, frame) => frame / fps);
    const samples = nodes.map(() => ({ position: [], quaternion: [], scale: [] }));
    for (let frame = 0; frame <= frames; frame++) {
      // A full stride fits one second; source attack contact remains at 0.5.
      const progress = frame / frames;
      const time = mode === 'run' ? progress * Math.PI * 2 / (id === 'boss' ? 3.5 : 7) : frame / fps;
      animateMonsterModel(root, time, mode === 'run', mode === 'attack' ? { style: 'slam', progress, impactProgress: .5 } : undefined);
      nodes.forEach((node, index) => {
        for (const property of ['position', 'quaternion', 'scale']) samples[index][property].push(...node[property].toArray());
      });
    }
    const tracks = [];
    for (const [index, node] of nodes.entries()) {
      for (const property of ['position', 'quaternion', 'scale']) {
        const values = samples[index][property], size = property === 'quaternion' ? 4 : 3;
        if (mode !== 'attack') values.splice(values.length - size, size, ...values.slice(0, size));
        if (!values.some((value, i) => Math.abs(value - values[i % size]) > 1e-6)) continue;
        const Track = property === 'quaternion' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
        tracks.push(new Track(`${node.uuid}.${property}`, times, values));
      }
    }
    assert(tracks.length > 0, `${id}-${mode} must contain articulated motion`);
    if (mode === 'run') {
      const leg = nodes.find(node => /-(?:leg-\d+|left-leg|right-leg)$/.test(node.name));
      assert(leg && tracks.some(track => track.name === `${leg.uuid}.quaternion`), `${id} run must animate a leg pivot`);
    }
    if (mode === 'attack') {
      const body = nodes.find(node => node.name === `${kind}-body`);
      assert(tracks.some(track => track.name.startsWith(`${body.uuid}.`)), `${id} attack must animate its body`);
    }
    const clip = new THREE.AnimationClip(`${id}-${mode}`, duration, tracks);
    clips.push(clip);
    metrics.clips.push({ name: clip.name, duration, tracks: tracks.length });
  }
  animateMonsterModel(root, 0, false);
  root.traverse(node => { node.userData = {}; });
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  metrics.bounds = { min: bounds.min.toArray(), max: bounds.max.toArray() };
  metrics.nodes = nodes.length;
  inspection.push(metrics);
}
const outputDir = new URL('../assets/trailer-story/', import.meta.url);
mkdirSync(outputDir, { recursive: true });
const glb = await new GLTFExporter().parseAsync(scene, { binary: true, animations: clips, onlyVisible: true });
const reloaded = await loader.parseAsync(glb, '');
assert.deepEqual(reloaded.animations.map(clip => clip.name).sort(), clips.map(clip => clip.name).sort());
assert.equal(reloaded.animations.length, 9);
for (const entry of inspection) assert(reloaded.scene.getObjectByName(entry.root), `Missing exported root ${entry.root}`);
writeFileSync(new URL('monsters.glb', outputDir), Buffer.from(glb));
writeFileSync(new URL('monsters-inspection.json', outputDir), JSON.stringify({ fps, bytes: glb.byteLength, monsters: inspection }, null, 2));
console.log(JSON.stringify({ output: new URL('monsters.glb', outputDir).pathname, bytes: glb.byteLength, monsters: inspection }, null, 2));
