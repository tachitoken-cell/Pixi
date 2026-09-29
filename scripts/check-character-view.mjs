import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import * as THREE from 'three';
import { makeCharacter, animateCharacter } from '../src/characters.ts';
import { GEAR, starterGear, equipmentSlotFor } from '../src/progression.ts';

// Substitute only the GPU/DOM boundary; the mounted scene, avatar, equipment and camera are real Three.js objects.
const renderers = [], observers = [], motion = { matches: false };
class Canvas extends EventTarget {
  style = {}; attrs = new Map(); captures = new Set(); listeners = new Map();
  addEventListener(type, listener) { super.addEventListener(type, listener); this.listeners.set(listener, type); }
  removeEventListener(type, listener) { super.removeEventListener(type, listener); this.listeners.delete(listener); }
  setAttribute(key, value) { this.attrs.set(key, value); }
  getBoundingClientRect() { return this.parent.rect; }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); }
  focus() { this.focused = true; }
  remove() { this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
}
class Renderer {
  shadowMap = {}; frames = 0; disposed = 0; lost = 0;
  constructor({ canvas }) { this.domElement = canvas; renderers.push(this); }
  setPixelRatio(value) { this.pixelRatio = value; }
  setSize(width, height) { assert(width > 0 && height > 0); this.size = [width, height]; }
  render(scene, camera) { this.frames++; this.scene = scene; this.camera = camera; scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); }
  dispose() { this.disposed++; }
  forceContextLoss() { this.lost++; }
}
class Observer {
  constructor(callback) { this.callback = callback; observers.push(this); }
  observe(container) { this.container = container; }
  disconnect() { this.disconnected = true; }
}
const source = stripTypeScriptTypes(readFileSync(new URL('../src/character-view.ts', import.meta.url), 'utf8'))
  .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
const mount = vm.runInNewContext(`${source}\nmountCharacterView`, {
  THREE: { ...THREE, WebGLRenderer: Renderer }, makeCharacter, animateCharacter, ResizeObserver: Observer,
  devicePixelRatio: 3, matchMedia: () => motion,
});
const container = { rect: { width: 240, height: 360 }, children: [], ownerDocument: { createElement: () => new Canvas() }, append(canvas) { this.children.push(canvas); canvas.parent = this; } };
const appearance = { skin: '#eeb58b', hair: '#62452f', hairStyle: 'swept', outfit: '#548d68', accent: '#e5b961', className: 'Ranger' };
let player = { id: 'character-a', name: 'Moss Archer', appearance, equipment: starterGear('Ranger').equipment };
const view = mount(container, player), renderer = renderers[0], observer = observers[0], canvas = container.children[0];
assert.equal(renderers.length, 1); assert.equal(canvas.tabIndex, 0); assert.equal(canvas.style.touchAction, 'pan-y');
assert.equal(renderer.pixelRatio, 1.6, 'the extra renderer caps its pixel cost');
assert(canvas.attrs.get('aria-label').includes('Left and Right arrows'));
view.render(0); const rig = () => renderer.scene.getObjectByName('voxel-adventurer');
assert(rig() && renderer.scene.getObjectByName('Equipment preview pedestal'), 'the preview mounts an actual 3D model and pedestal');
function event(type, properties = {}) { const event = new Event(type, { cancelable: true }); Object.assign(event, properties); canvas.dispatchEvent(event); return event; }
const pointer = (type, x, y, id = 1) => event(type, { pointerId: id, button: 0, isPrimary: true, clientX: x, clientY: y });
pointer('pointerdown', 10, 10); pointer('pointermove', 50, 11); view.render(0);
assert(canvas.focused && canvas.captures.has(1)); assert(rig().rotation.y > -.25, 'dragging turns the actual avatar');
const dragged = rig().rotation.y;
pointer('pointermove', 100, 10, 2); view.render(0); assert.equal(rig().rotation.y, dragged, 'other fingers cannot take over a drag');
pointer('pointercancel', 50, 10); assert.equal(canvas.captures.size, 0);
pointer('pointerdown', 10, 10); pointer('pointermove', 11, 45); view.render(0);
assert.equal(rig().rotation.y, dragged); assert.equal(canvas.captures.size, 0, 'vertical movement releases the stage for page scrolling');
assert(event('keydown', { key: 'ArrowRight' }).defaultPrevented); view.render(0); assert(rig().rotation.y > dragged);
event('keydown', { key: 'Home' }); view.render(0); assert.equal(rig().rotation.y, -.25);

const matrix = new THREE.Matrix4(), local = new THREE.Vector3(), projected = new THREE.Vector3();
function assertFramed() {
  rig().traverseVisible(node => {
    if (!node.isInstancedMesh) return;
    for (let index = 0; index < node.count; index++) {
      node.getMatrixAt(index, matrix);
      if (Math.abs(matrix.determinant()) < 1e-12) continue; // The bow's hidden arrow has zero scale and draws no triangles.
      matrix.premultiply(node.matrixWorld);
      for (const x of [-.5, .5]) for (const y of [-.5, .5]) for (const z of [-.5, .5]) {
        projected.copy(local.set(x, y, z).applyMatrix4(matrix)).project(renderer.camera);
        assert(projected.toArray().every(Number.isFinite));
        assert(Math.abs(projected.x) < .985 && Math.abs(projected.y) < .985 && Math.abs(projected.z) < 1,
          `full equipped body remains framed at ${container.rect.width}x${container.rect.height}: ${projected.toArray()} (${player.appearance.className}/${node.parent.name}/${index}, rotation ${rig().rotation.y}, world ${local.toArray()}, half-width ${renderer.camera.right})`);
      }
    }
  });
}
function signature(group) { const values = []; group.traverse(node => { if (node.isInstancedMesh) values.push([...node.instanceMatrix.array, ...node.instanceColor.array]); }); return JSON.stringify(values); }
const sharedDisposals = new Map(), instanceDisposals = new Map();
function watchRig() {
  rig().traverse(node => {
    if (!node.isInstancedMesh) return;
    for (const resource of [node.geometry, node.material]) if (!sharedDisposals.has(resource)) {
      sharedDisposals.set(resource, 0); resource.addEventListener('dispose', () => sharedDisposals.set(resource, sharedDisposals.get(resource) + 1));
    }
    if (!instanceDisposals.has(node)) { instanceDisposals.set(node, 0); node.addEventListener('dispose', () => instanceDisposals.set(node, instanceDisposals.get(node) + 1)); }
  });
}
watchRig();
for (const className of ['Ranger', 'Mage', 'Knight']) {
  const starter = starterGear(className).equipment;
  const upgraded = Object.fromEntries(['weapon', 'armor', 'charm'].map(slot => [slot, Object.values(GEAR).find(gear => gear.slot === slot && (!gear.className || gear.className === className) && gear.price > 0).id]));
  for (const hairStyle of ['swept', 'long', 'mohawk', 'none']) {
    player = { ...player, appearance: { ...appearance, className, hairStyle }, equipment: starter }; view.update(player); view.render(0); watchRig();
    const base = signature(rig()), head = signature(rig().getObjectByName('head'));
    player = { ...player, equipment: upgraded }; view.update(player); view.render(0); watchRig();
    assert.notEqual(signature(rig()), base, 'the preview reflects the equipped weapon, armor and charm');
    assert.equal(signature(rig().getObjectByName('head')), head, 'equipment retains the chosen identity');
    const fullSet={...upgraded};
    for(const item of Object.values(GEAR)) if(item.price>0 && (!item.className || item.className===className)) fullSet[equipmentSlotFor(fullSet,item.id)]=item.id;
    player={...player,equipment:fullSet};view.update(player);view.render(0);watchRig();
    for (const [width, height] of [[130, 320], [210, 300], [320, 240], [440, 500]]) {
      container.rect = { width, height }; observer.callback();
      for (let angle = 0; angle < 16; angle++) { event('keydown', { key: 'ArrowRight' }); view.render(angle * .31); assertFramed(); }
    }
  }
}
const priorRig = rig(); view.update({ ...player, name: 'Different name', hp: 1 }); view.render(2); assert.equal(rig(), priorRig, 'unrelated snapshots do not rebuild the mesh');
assert(canvas.attrs.get('aria-label').startsWith('Different name'));
pointer('pointerdown', 10, 10); view.update({ ...player, id: 'character-b' }); view.render(2); watchRig();
assert.equal(rig().rotation.y, -.25); assert.equal(canvas.captures.size, 0, 'switching character resets rotation and an active drag');
motion.matches = true; view.render(1); const still = rig().getObjectByName('body').position.y; view.render(99); assert.equal(rig().getObjectByName('body').position.y, still, 'reduced motion stops idle movement');
motion.matches = false;
const frames = renderer.frames; assert(event('webglcontextlost').defaultPrevented); view.render(2); assert.equal(renderer.frames, frames);
event('webglcontextrestored'); view.render(2); assert.equal(renderer.frames, frames + 1, 'rendering resumes after context restoration');
container.rect = { width: 0, height: 0 }; observer.callback(); view.render(2); assert.equal(renderer.frames, frames + 1, 'hidden stages skip rendering');
container.rect = { width: 200, height: 300 }; observer.callback(); view.render(2);

const owned = new Map(); renderer.scene.getObjectByName('Equipment preview pedestal').traverse(node => {
  if (!node.isMesh) return;
  for (const resource of [node.geometry, node.material]) if (!owned.has(resource)) { owned.set(resource, 0); resource.addEventListener('dispose', () => owned.set(resource, owned.get(resource) + 1)); }
});
pointer('pointerdown', 10, 10); view.dispose(); view.dispose();
assert(observer.disconnected && canvas.parent === null && canvas.captures.size === 0 && canvas.listeners.size === 0);
assert.equal(renderer.disposed, 1); assert.equal(renderer.lost, 1);
assert([...owned.values()].every(count => count === 1), 'preview-owned geometry and materials dispose exactly once');
assert([...instanceDisposals.values()].every(count => count === 1), 'replaced and closed rigs release every instance buffer once');
assert([...sharedDisposals.values()].every(count => count === 0), 'closing the preview cannot dispose gameplay avatar resources');
const closedFrames = renderer.frames; view.render(3); view.update(player); view.resize(); assert.equal(renderer.frames, closedFrames);
console.log('Character view checked: real equipment meshes, full-body fit at 130–440 px and every angle, drag/keyboard, reduced motion, resize/context recovery and isolated disposal.');
