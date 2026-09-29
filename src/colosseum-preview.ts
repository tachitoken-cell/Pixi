import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createOverworld } from './zones';
import { COLOSSEUM as WORLD_COLOSSEUM, COLOSSEUM_COLLIDERS as WORLD_COLOSSEUM_COLLIDERS } from './colosseum';
import { ARENA_COLLIDERS, isInArena } from './arena';
import { createArenaWorld } from './arena-world';
import { animateCharacter, loadCharacterAssets, makeCharacter } from './characters';
import { DEFAULT_APPEARANCE } from './appearance';
import { canTraverse } from './realm';
import { jumpFloor, moveJump, newJump, startJump, stepJump } from './jumping';
import { WALK_SPEED } from './travel';
import { disposeWorldGroup, type WorldInstance } from './world';

const instance = new URLSearchParams(location.search).get('instance') === '1';
const COLOSSEUM = instance ? { ...WORLD_COLOSSEUM, x: 0, z: 0 } : WORLD_COLOSSEUM;
const COLOSSEUM_COLLIDERS = instance ? ARENA_COLLIDERS : WORLD_COLOSSEUM_COLLIDERS;
const floor = (x: number, z: number) => jumpFloor(x, z, instance);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
renderer.domElement.tabIndex = 0; renderer.domElement.setAttribute('aria-label', 'Thornring arena. Drag to orbit, scroll to zoom. Choose Walk the arena for movement.');
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#82987a'); scene.fog = new THREE.Fog('#82987a', 250, 500);
scene.add(new THREE.HemisphereLight('#fff0ca', '#46664b', 2.3));
const sun = new THREE.DirectionalLight('#ffebcb', 3);
sun.position.set(COLOSSEUM.x + 64, 140, 80); sun.target.position.set(COLOSSEUM.x, 0, COLOSSEUM.z);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -100, right: 100, top: 100, bottom: -100, near: 1, far: 280 }); sun.shadow.bias = -.0005;
scene.add(sun, sun.target);
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, .1, 430);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxPolarAngle = Math.PI * .49;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const actors = new THREE.Group(); scene.add(actors);
const position = new THREE.Vector3(COLOSSEUM.x, floor(COLOSSEUM.x, 30), 30);
let jump = newJump(position.x, position.z, instance), world: WorldInstance | undefined, avatar: THREE.Group | undefined;
type View = 'overview' | 'floor' | 'seats' | 'layout' | 'walk';
let view: View = 'overview', disposed = false, checkStatus = '';
const keys = new Set<string>(), events = new AbortController();
const hints: Record<View, string> = {
  overview: 'Four stone pillars, opposing entrances and spectator terraces. Drag to orbit · Scroll to zoom.',
  floor: 'The fighting floor at character scale. Drag to look around · Scroll to zoom.',
  seats: 'A view from the spectator terraces. Drag to orbit · Scroll to zoom.',
  layout: 'Four cover pillars leave open center and outer routes. Drag to orbit · Scroll to zoom.',
  walk: 'WASD / arrows to move · Space to jump · Drag to turn · Scroll to zoom. Local movement only.',
};
function setView(next: View) {
  view = next; keys.clear();
  controls.enablePan = next !== 'walk'; controls.minDistance = next === 'walk' ? 3 : 1; controls.maxDistance = next === 'walk' ? 20 : 220;
  if (next === 'walk') {
    position.set(COLOSSEUM.x, floor(COLOSSEUM.x, 30), 30); jump = newJump(position.x, position.z, instance);
    controls.target.copy(position).y += 1.35; camera.position.copy(position).add(new THREE.Vector3(0, 4, 9));
    renderer.domElement.focus({ preventScroll: true });
  } else {
    controls.target.set(COLOSSEUM.x, next === 'overview' ? 5 : next === 'floor' ? 2 : 0, next === 'floor' ? -10 : 0);
    if (next === 'overview') camera.position.set(COLOSSEUM.x + 99, 113, 129);
    if (next === 'floor') camera.position.set(COLOSSEUM.x + 9, floor(COLOSSEUM.x + 9, 29) + 2.1, 29);
    if (next === 'seats') camera.position.set(COLOSSEUM.x + 32, floor(COLOSSEUM.x + 32, 46) + 2.1, 46);
    if (next === 'layout') camera.position.set(COLOSSEUM.x, 177, .01);
  }
  if (avatar) avatar.visible = next === 'walk';
  controls.update();
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === next)));
  document.querySelector<HTMLElement>('#walk-pad')!.hidden = next !== 'walk';
  if (world) status.textContent = `${hints[next]} ${checkStatus}`;
  const url = new URL(location.href); url.searchParams.set('view', next); history.replaceState(null, '', url);
  document.body.dataset.view = next;
}
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view as View), { signal: events.signal }));
const requestedView = new URLSearchParams(location.search).get('view');
setView(requestedView && Object.hasOwn(hints, requestedView) ? requestedView as View : 'overview');

function tryJump() { if (world && view === 'walk') startJump(jump, position.x, position.z, instance); }
addEventListener('keydown', event => {
  if (view !== 'walk' || event.target instanceof HTMLButtonElement) return;
  const key = event.key.toLowerCase();
  if (!['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) return;
  event.preventDefault(); keys.add(key); if (key === ' ' && !event.repeat) tryJump();
}, { signal: events.signal });
addEventListener('keyup', event => keys.delete(event.key.toLowerCase()), { signal: events.signal });
addEventListener('blur', () => keys.clear(), { signal: events.signal });
document.addEventListener('visibilitychange', () => keys.clear(), { signal: events.signal });
renderer.domElement.addEventListener('pointerdown', () => renderer.domElement.focus({ preventScroll: true }), { signal: events.signal });
document.querySelector<HTMLButtonElement>('#jump')!.addEventListener('click', () => { tryJump(); renderer.domElement.focus({ preventScroll: true }); }, { signal: events.signal });
document.querySelectorAll<HTMLButtonElement>('[data-key]').forEach(button => {
  button.addEventListener('pointerdown', event => { event.preventDefault(); keys.add(button.dataset.key!); button.setPointerCapture(event.pointerId); }, { signal: events.signal });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, () => keys.delete(button.dataset.key!), { signal: events.signal });
});

function moveTo(x: number, z: number) {
  const next = { x, z };
  if (!world || instance && !isInArena(next) || !canTraverse(position, next, world.colliders) || !moveJump(jump, position, next, instance)) return false;
  position.x = x; position.z = z; return true;
}
// Also runnable from the browser console: arenaPreview.selfCheck().
function selfCheck() {
  if (!world) throw new Error('World is still loading');
  const center = { x: COLOSSEUM.x, z: COLOSSEUM.z }, corridor = { x: COLOSSEUM.x, z: COLOSSEUM.z + 30 };
  if (!canTraverse(center, corridor, world.colliders)) throw new Error('The center walking route is blocked');
  for (const solid of COLOSSEUM_COLLIDERS) if (canTraverse(solid, solid, world.colliders)) throw new Error('Arena masonry does not block movement');
  const checkJump = newJump(center.x, center.z, instance);
  if (!moveJump(checkJump, center, corridor, instance) || !Number.isFinite(checkJump.y)) throw new Error('Arena floor movement failed');
  if (!startJump(checkJump, center.x, center.z, instance)) throw new Error('Arena jump failed');
  for (let i = 0; i < 120; i++) stepJump(checkJump, 1 / 60, floor(center.x, center.z));
  if (!checkJump.grounded || checkJump.y !== floor(center.x, center.z)) throw new Error('Arena jump did not land');
  return { ok: true, arenaColliders: COLOSSEUM_COLLIDERS.length, floorHeight: checkJump.y };
}
function dispose() {
  if (disposed) return;
  disposed = true; events.abort(); keys.clear(); renderer.setAnimationLoop(null); controls.dispose(); world?.dispose(); disposeWorldGroup(actors); sun.shadow.dispose(); renderer.dispose();
}
addEventListener('pagehide', dispose, { once: true });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); }, { signal: events.signal });

try {
  const [loadedWorld] = await Promise.all([(instance ? createArenaWorld(scene) : createOverworld(scene)).then(loaded => { world = loaded; if (disposed) loaded.dispose(); return loaded; }), loadCharacterAssets()]);
  world = loadedWorld;
  if (disposed) world.dispose();
  else {
    for (const [dx, dz, className] of [[-12, 10, 'Knight'], [13, -7, 'Ranger'], [39, 39, 'Mage']] as const) {
      const actor = makeCharacter({ ...DEFAULT_APPEARANCE, className });
      actor.position.set(COLOSSEUM.x + dx, floor(COLOSSEUM.x + dx, dz), dz); actor.rotation.y = dx < 0 ? Math.PI / 2 : -Math.PI / 2; actors.add(actor);
    }
    avatar = makeCharacter(DEFAULT_APPEARANCE); actors.add(avatar); setView(view);
    const result = selfCheck(); checkStatus = `${instance ? 'Private instance · ' : ''}Movement and cover checks passed.`;
    status.textContent = `${hints[view]} ${checkStatus}`; document.body.dataset.ready = 'true'; document.body.dataset.checks = 'passed'; document.body.dataset.arenaColliders = String(result.arenaColliders);
    Object.assign(window, { arenaPreview: { scene, camera, world, renderer, position, setView, overview: () => setView('overview'), floor: () => setView('floor'), seats: () => setView('seats'), layout: () => setView('layout'), walk: () => setView('walk'), selfCheck, dispose } });
    let previous = performance.now();
    const forward = new THREE.Vector3(), right = new THREE.Vector3(), delta = new THREE.Vector3(), old = new THREE.Vector3(), desiredCamera = new THREE.Vector3();
    renderer.setAnimationLoop(now => {
      const dt = Math.min(.05, Math.max(0, (now - previous) / 1000)); previous = now;
      let moving = false;
      if (view === 'walk') {
        forward.subVectors(controls.target, camera.position).setY(0).normalize(); right.set(-forward.z, 0, forward.x);
        delta.copy(forward).multiplyScalar(Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown')))
          .addScaledVector(right, Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'))).normalize().multiplyScalar(WALK_SPEED * dt);
        old.copy(position);
        if (delta.lengthSq() > 0) { moveTo(position.x + delta.x, position.z); moveTo(position.x, position.z + delta.z); moving = Math.hypot(position.x - old.x, position.z - old.z) > .001; }
        stepJump(jump, dt, floor(position.x, position.z)); position.y = jump.y;
        camera.position.add(delta.subVectors(position, old)); controls.target.copy(position).y += 1.35;
        avatar!.position.copy(position); if (moving) avatar!.rotation.y = Math.atan2(position.x - old.x, position.z - old.z);
        animateCharacter(avatar!, now / 1000, moving, false, undefined, false, { jump });
        document.body.dataset.position = `${position.x.toFixed(2)},${position.z.toFixed(2)}`;
      }
      controls.update(); desiredCamera.copy(camera.position);
      if (view === 'walk') { world!.constrainCamera?.(controls.target, camera.position); camera.lookAt(controls.target); }
      world!.update(now / 1000, camera.position, camera, 1); renderer.render(scene, camera);
      camera.position.copy(desiredCamera);
    });
  }
} catch (error) { status.textContent = `Could not load the local world: ${String(error)}`; console.error(error); dispose(); }
