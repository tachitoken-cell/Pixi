import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { setRaidAssets } from '../src/monster-models.ts';
import { PETS, isPetId } from '../src/pets.ts';
import { MOUNTS } from '../src/travel.ts';
import { createPetModel, animatePetModel, setPetAssets } from '../src/pet-models.ts';
import { makeMount, animateMount, disposeMount, setMountAssets } from '../src/mounts.ts';

const sources = await Promise.all(['pets', 'mounts', 'store-collection', 'wild-pets', 'verdant-revenant', 'autumn-pets', 'wayfinder-sprite', 'wayfarer-stag'].map(async name => {
  const bytes = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}));
const pets = new THREE.Group(); pets.add(sources[0], sources[2], sources[3], sources[5], sources[6]); setPetAssets(pets);
setMountAssets(sources[1]); setMountAssets(sources[2], ['store-embermane', 'store-cinderfang']);
setMountAssets(sources[4], ['verdant-revenant']); setMountAssets(sources[7], ['wayfarer-stag']);
const raidBytes=readFileSync(new URL('../public/models/horned-apostle.glb',import.meta.url)),raid=await new GLTFLoader().parseAsync(raidBytes.buffer.slice(raidBytes.byteOffset,raidBytes.byteOffset+raidBytes.byteLength),'');setRaidAssets(raid.scene,raid.animations);sources.push(raid.scene);
let sharedDisposed = 0;
const shared = new Set();
for (const source of sources) source.traverse(node => {
  if (!node.isMesh) return;
  for (const resource of [node.geometry, ...[].concat(node.material)]) if (!shared.has(resource)) {
    shared.add(resource); resource.addEventListener('dispose', () => sharedDisposed++);
  }
});

const window = Object.assign(new EventTarget(), { devicePixelRatio: 1 });
const document = Object.assign(new EventTarget(), { hidden: false });
const media = Object.assign(new EventTarget(), { matches: false });
const ready = new Set(), captures = new Set(); let layoutReads = 0, renderer, observer;
const canvas = Object.assign(new EventTarget(), {
  style: { touchAction: 'pan-y' }, parentElement: { classList: { add: key => ready.add(key), remove: key => ready.delete(key) } },
  setPointerCapture: id => captures.add(id), hasPointerCapture: id => captures.has(id), releasePointerCapture: id => captures.delete(id),
});
Object.defineProperties(canvas, { clientWidth: { get: () => { layoutReads++; return 580; } }, clientHeight: { get: () => { layoutReads++; return 420; } } });
class Renderer {
  shadowMap = {}; loop = null; renders = 0; resizes = 0; disposed = false; contextLost = false;
  constructor() { renderer = this; }
  setPixelRatio() {} setClearColor() {} setSize(width, height) { this.width = width; this.height = height; this.resizes++; }
  setAnimationLoop(callback) { this.loop = callback; }
  render(scene, camera) { this.scene = scene; this.camera = camera; scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); this.renders++; }
  dispose() { this.disposed = true; } forceContextLoss() { this.contextLost = true; }
}
class Observer {
  constructor(callback) { observer = this; this.callback = callback; }
  observe() {} disconnect() { this.disconnected = true; }
  resize(width, height) { this.callback([{ contentRect: { width, height } }]); }
}
const source = readFileSync(new URL('../src/collection-preview.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace('export function', 'function');
const create = runInNewContext(`${stripTypeScriptTypes(source)};createCollectionPreview;`, {
  THREE: { ...THREE, WebGLRenderer: Renderer }, createPetModel, animatePetModel, isPetId, makeMount, animateMount, disposeMount, MOUNTS,
  window, document, matchMedia: () => media, ResizeObserver: Observer, AbortController,
});
const preview = create(canvas);
const emit = (target, type, properties = {}) => { const event = Object.assign(new Event(type, { cancelable: true }), properties); target.dispatchEvent(event); return event; };
const model = () => renderer.scene.children.find(node => node.isGroup).children[0];
const turn = () => model().parent.rotation.y;
let inspected = 0, now = 1000;
for (const [kind, entries] of [['pets', PETS], ['mounts', MOUNTS]]) for (const entry of entries) {
  preview.show(kind, entry.id); assert(ready.has('is-ready'), `${entry.id} becomes ready after rendering`);
  for (const [width, height] of [[580, 420], [240, 300], [700, 300]]) {
    observer.resize(width, height);
    for (let angle = 0; angle < 8; angle++) {
      preview.rotate(Math.PI / 4); renderer.loop?.(now += 200);
      const bounds = new THREE.Box3().setFromObject(model());
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const projected = new THREE.Vector3(x, y, z).project(renderer.camera);
        assert([projected.x, projected.y, projected.z].every(Number.isFinite), `${entry.id} projection is finite`);
        assert(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 && Math.abs(projected.z) < 1, `${entry.id} fits ${width}x${height} at turn ${angle}: ${projected.toArray()}`);
      }
      inspected++;
    }
  }
}
assert.equal(layoutReads, 2, 'animation and rotation never read layout');
const before = turn();
emit(canvas, 'pointerdown', { button: 0, pointerId: 1, clientX: 50 });
emit(canvas, 'pointermove', { pointerId: 2, clientX: 100 }); assert.equal(turn(), before, 'another finger cannot turn the model');
emit(canvas, 'pointermove', { pointerId: 1, clientX: 100 }); assert.equal(turn(), before + .6);
emit(window, 'blur'); assert.equal(captures.size, 0, 'blur releases the drag capture');
const left = emit(canvas, 'keydown', { key: 'ArrowLeft' }); assert(left.defaultPrevented); assert.equal(turn(), before + .6 - Math.PI / 8);
media.matches = true; emit(media, 'change'); assert.equal(renderer.loop, null, 'reduced motion stops idle animation');
const reducedRenders = renderer.renders; preview.rotate(.2); assert.equal(renderer.renders, reducedRenders + 1, 'manual rotation still renders with reduced motion');
media.matches = false; emit(media, 'change'); assert.equal(typeof renderer.loop, 'function');
document.hidden = true; emit(document, 'visibilitychange'); assert.equal(renderer.loop, null, 'hidden document stops animation');
document.hidden = false; emit(document, 'visibilitychange'); assert.equal(typeof renderer.loop, 'function');
observer.resize(0, 0); assert.equal(renderer.loop, null, 'hidden canvas stops animation');
observer.resize(580, 420); assert.equal(typeof renderer.loop, 'function');
const resizes = renderer.resizes; observer.resize(580, 420); assert.equal(renderer.resizes, resizes, 'unchanged observer delivery cannot trigger a resize loop');
preview.show('pets','death-apostle',0);const firstEvolution=model();preview.show('pets','death-apostle',3);assert.notEqual(model(),firstEvolution,'evolving an open preview replaces its form');assert.equal(model().userData.apostleStage,3);
assert.throws(() => preview.show('pets', 'unknown'), /Unknown collection model/);
assert(!ready.has('is-ready')); assert.equal(renderer.loop, null, 'failed model restores portrait and stops stale rendering');
preview.show('mounts', 'horse');
const reins = model().getObjectByName('rider-reins'); let reinsDisposed = 0;
reins.geometry.addEventListener('dispose', () => reinsDisposed++);
const pedestal = renderer.scene.children.filter(node => node.isMesh); let pedestalDisposed = 0;
for (const mesh of pedestal) for (const resource of [mesh.geometry, mesh.material]) resource.addEventListener('dispose', () => pedestalDisposed++);
preview.dispose(); preview.dispose();
assert.equal(reinsDisposed, 1); assert.equal(pedestalDisposed, 4, 'owned pedestal geometry and materials are released once');
assert.equal(sharedDisposed, 0, 'shared game geometry and materials stay intact');
assert(renderer.disposed && renderer.contextLost && observer.disconnected); assert.equal(renderer.loop, null); assert.equal(canvas.style.touchAction, 'pan-y');
const finalRenders = renderer.renders;
emit(canvas, 'keydown', { key: 'ArrowLeft' }); emit(media, 'change'); emit(document, 'visibilitychange'); preview.rotate(1);
assert.equal(renderer.renders, finalRenders, 'disposed controller cannot restart or render'); assert(!ready.has('is-ready'));
console.log(`PASS collection preview: ${inspected} real-model framing checks; pointer/keyboard rotation; reduced motion; visibility; fallback; shared-safe cleanup.`);
