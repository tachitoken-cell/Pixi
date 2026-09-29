import * as THREE from 'three';
import { makeCharacter, animateCharacter, makeEnemy, animateEnemy } from './characters.ts';
import type { Appearance, Equipment, EnemyKind } from './shared.ts';
import type { DungeonBossModel } from './dungeon-boss-models.ts';

export type UnitPortraitSubject =
  | { id: string; kind: 'player'; appearance: Appearance; equipment?: Equipment }
  | { id: string; kind: 'enemy'; enemyKind: EnemyKind; model?: import('./shared').Enemy['model'] }
  | { id: string; kind: 'npc'; source: THREE.Group };
type Slot = 'player' | 'target' | 'focus';
type Subjects = Partial<Record<Slot, UnitPortraitSubject>>;
const SIZE = 144;

/** Trainer headers need one still portrait; release the temporary GPU surface after copying it. */
export function drawNpcPortrait(canvas: HTMLCanvasElement, source: THREE.Group) {
  const makeCanvas = () => canvas.ownerDocument.createElement('canvas'), scratch = makeCanvas();
  const portraits = createUnitPortraits({ player: scratch, target: makeCanvas(), focus: makeCanvas() });
  try {
    portraits.update({ player: { id: source.uuid, kind: 'npc', source } }); portraits.render(0);
    canvas.width = canvas.height = SIZE;
    canvas.getContext('2d')?.drawImage(scratch, 0, 0);
  } finally { portraits.dispose(); }
}

// World NPC userData contains circular rig references. Copy transforms and instance
// buffers explicitly; imported geometry/materials remain owned by the world.
function copyNpc(source: THREE.Object3D): THREE.Object3D {
  let copy: THREE.Object3D;
  if (source instanceof THREE.InstancedMesh) {
    const mesh = new THREE.InstancedMesh(source.geometry, source.material, source.count);
    mesh.instanceMatrix.copy(source.instanceMatrix);
    if (source.instanceColor) mesh.instanceColor = new THREE.InstancedBufferAttribute(source.instanceColor.array.slice(), source.instanceColor.itemSize, source.instanceColor.normalized, source.instanceColor.meshPerAttribute);
    mesh.computeBoundingBox(); mesh.computeBoundingSphere(); copy = mesh;
  } else if (source instanceof THREE.Mesh) copy = new THREE.Mesh(source.geometry, source.material);
  else copy = new THREE.Group();
  copy.name = source.name; copy.visible = source.visible;
  copy.position.copy(source.position); copy.quaternion.copy(source.quaternion); copy.scale.copy(source.scale);
  for (const child of source.children) copy.add(copyNpc(child));
  return copy;
}

function framePortrait(rig: THREE.Group, head?: THREE.Object3D): THREE.OrthographicCamera {
  rig.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  (head ?? rig).traverseVisible(node => { if (node instanceof THREE.Mesh) bounds.expandByObject(node); });
  if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-.5, 0, -.5), new THREE.Vector3(.5, 1, .5));
  const size = bounds.getSize(new THREE.Vector3());
  // Include shoulders below the actual hair/helmet silhouette. Slimes, wisps,
  // and flying bats retain their complete recognizable shape and wing movement.
  if (head) {
    bounds.min.y -= size.y * .42;
    bounds.min.x -= size.x * .08; bounds.max.x += size.x * .08;
  }
  const center = bounds.getCenter(new THREE.Vector3());
  const distance = Math.max(8, size.length() * 3);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, distance * 3);
  camera.position.copy(center).add(new THREE.Vector3(0, .10, 1).normalize().multiplyScalar(distance));
  camera.lookAt(center); camera.updateMatrixWorld(true);
  let half = .1;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const point = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    half = Math.max(half, Math.abs(point.x), Math.abs(point.y));
  }
  half *= 1.25; // Leave room for the authored idle sway and ear movement.
  camera.left = camera.bottom = -half; camera.right = camera.top = half;
  camera.updateProjectionMatrix(); return camera;
}

/** One small GPU surface supplies all HUD portraits; the game owns this frame loop. */
export function createUnitPortraits(canvases: Record<Slot, HTMLCanvasElement>) {
  const slots = (['player', 'target', 'focus'] as const).map(name => {
    const canvas = canvases[name], context = canvas.getContext('2d');
    if (!context) throw new Error('Portrait canvas is unavailable');
    canvas.width = canvas.height = SIZE;
    return { name, canvas, context, signature: '', subject: undefined as UnitPortraitSubject | undefined,
      rig: undefined as THREE.Group | undefined, camera: undefined as THREE.OrthographicCamera | undefined };
  });
  const surface = canvases.player.ownerDocument.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas: surface, antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(1); renderer.setSize(SIZE, SIZE, false); renderer.shadowMap.enabled = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#233638');
  scene.add(new THREE.HemisphereLight('#fff1d3', '#345654', 1.8));
  const key = new THREE.DirectionalLight('#ffdeb0', 2.6); key.position.set(-3, 6, 5); scene.add(key);
  const rim = new THREE.DirectionalLight('#8ec5cc', 1.4); rim.position.set(3, 3, -4); scene.add(rim);
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  let disposed = false, contextLost = false, lastFrame = -Infinity;
  function release(slot: typeof slots[number]) {
    slot.rig?.removeFromParent();
    slot.rig?.traverse(node => { if (node instanceof THREE.InstancedMesh) node.dispose(); });
    slot.rig = undefined; slot.camera = undefined; slot.subject = undefined; slot.signature = '';
    slot.context.clearRect(0, 0, SIZE, SIZE);
  }
  function update(subjects: Subjects) {
    if (disposed) return;
    for (const slot of slots) {
      const subject = subjects[slot.name];
      const signature = !subject ? '' : subject.kind === 'npc' ? `${subject.id}:npc:${subject.source.uuid}`
        : JSON.stringify(subject.kind === 'player' ? [subject.id, subject.kind, subject.appearance, subject.equipment] : [subject.id, subject.kind, subject.enemyKind, subject.model]);
      if (signature === slot.signature) continue;
      release(slot);
      if (!subject) continue;
      const rig = subject.kind === 'player' ? makeCharacter(subject.appearance, subject.equipment)
        : subject.kind === 'enemy' ? makeEnemy(subject.model ?? subject.enemyKind) : copyNpc(subject.source) as THREE.Group;
      rig.position.set(0, 0, 0); rig.rotation.set(0, -.20, 0); rig.scale.set(1, 1, 1); rig.visible = true;
      if (subject.kind === 'player') animateCharacter(rig, 0, false);
      else if (subject.kind === 'enemy') animateEnemy(rig, 0, false);
      const head = subject.kind === 'player' ? rig.userData.rig?.head
        : subject.kind === 'enemy' ? !subject.model && subject.enemyKind === 'crystal-bat' ? undefined : rig.getObjectByName(`${subject.model ?? subject.enemyKind}-head`) ?? rig.userData.enemyRig?.head
        : rig.getObjectByName(subject.source.userData.villagerIdle?.head?.name ?? subject.source.userData.rig?.head?.name ?? 'head');
      slot.rig = rig; slot.subject = subject; slot.camera = framePortrait(rig, head); slot.signature = signature;
    }
  }
  function render(elapsed: number) {
    if (disposed || contextLost) return;
    const now = Number.isFinite(elapsed) ? elapsed : 0;
    if (now >= lastFrame && now - lastFrame < 1 / 15) return;
    lastFrame = now;
    const time = reducedMotion?.matches ? 0 : now;
    for (const slot of slots) {
      if (!slot.rig || !slot.camera || !slot.subject) continue;
      if (slot.subject.kind === 'player') animateCharacter(slot.rig, time, false);
      else if (slot.subject.kind === 'enemy') animateEnemy(slot.rig, time, false);
      else slot.rig.rotation.y = -.20 + Math.sin(time * .75) * .018;
      scene.add(slot.rig);
      try {
        renderer.render(scene, slot.camera);
        slot.context.clearRect(0, 0, SIZE, SIZE);
        slot.context.drawImage(surface, 0, 0, SIZE, SIZE);
      } finally { slot.rig.removeFromParent(); }
    }
  }
  function clear() { for (const slot of slots) release(slot); lastFrame = -Infinity; }
  function lost(event: Event) { event.preventDefault(); contextLost = true; }
  function restored() { contextLost = false; lastFrame = -Infinity; }
  surface.addEventListener('webglcontextlost', lost); surface.addEventListener('webglcontextrestored', restored);
  return { update, render, clear, dispose() {
    if (disposed) return;
    disposed = true; clear();
    surface.removeEventListener('webglcontextlost', lost); surface.removeEventListener('webglcontextrestored', restored);
    scene.clear(); renderer.dispose(); renderer.forceContextLoss(); surface.remove();
  } };
}
