import * as THREE from 'three';
import { makeCharacter, animateCharacter } from './characters.ts';
import type { Player } from './shared.ts';
import { activeSpecialist } from './raid-progression.ts';

export interface CharacterView {
  update(player: Player): void;
  render(elapsed: number): void;
  resize(): void;
  dispose(): void;
}

/** An equipment-window preview. Its caller owns the frame loop and closes it with the window. */
export function mountCharacterView(container: HTMLElement, player: Player): CharacterView {
  const canvas = container.ownerDocument.createElement('canvas');
  canvas.className = 'character-view-canvas'; canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', touchAction: 'pan-y', cursor: 'grab' });
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#12281d');
  const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .1, 30);
  scene.add(new THREE.HemisphereLight('#fff1d3', '#345654', 1.8));
  const key = new THREE.DirectionalLight('#ffdeb0', 2.6); key.position.set(-3, 6, 5); key.castShadow = true;
  key.shadow.mapSize.set(512, 512); key.shadow.normalBias = .025; key.shadow.bias = -.0003;
  Object.assign(key.shadow.camera, { left: -3, right: 3, top: 4, bottom: -3, near: .5, far: 14 });
  scene.add(key);
  const rim = new THREE.DirectionalLight('#8ec5cc', 1.4); rim.position.set(3, 3, -4); scene.add(rim);
  const stage = new THREE.Group(); stage.name = 'Equipment preview pedestal'; scene.add(stage);
  const stone = new THREE.MeshStandardMaterial({ color: '#49563b', roughness: .94 });
  const edge = new THREE.MeshStandardMaterial({ color: '#b29461', roughness: .7, metalness: .15 });
  for (const [radius, height, y, material] of [[1.25, .20, -.17, stone], [1.18, .035, -.0525, edge], [1.13, .035, -.0175, stone]] as const) {
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 8), material);
    platform.rotation.y = Math.PI / 8; platform.position.y = y; platform.receiveShadow = platform.castShadow = true; stage.add(platform);
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshStandardMaterial({ color: '#203923', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.28; ground.receiveShadow = true; stage.add(ground);

  let rig: THREE.Group | undefined, fingerprint = '', characterId = '', rotation = -.25, disposed = false, contextLost = false;
  let width = 0, height = 0;
  const bounds = new THREE.Box3();
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  let drag: { id: number; x: number; y: number; rotation: number; moving: boolean } | undefined;
  function releaseRig() {
    if (!rig) return;
    rig.removeFromParent();
    // The gameplay avatar shares this module's cube and material. Only instance buffers belong here.
    rig.traverse(node => { if (node instanceof THREE.InstancedMesh) node.dispose(); });
    rig = undefined;
  }
  function frame() {
    if (!width || !height || bounds.isEmpty()) return;
    const aspect = width / height, pitch = .12;
    // A swept horizontal radius fits the equipped silhouette at every drag angle, without camera pumping.
    const radius = Math.max(.95, ...[bounds.min.x, bounds.max.x].flatMap(x => [bounds.min.z, bounds.max.z].map(z => Math.hypot(x, z)))) + .07;
    const bottom = Math.min(-.28, bounds.min.y - .04), top = bounds.max.y + .07, center = (top + bottom) / 2;
    const vertical = (top - bottom) / 2 * Math.cos(pitch) + radius * Math.sin(pitch);
    const halfHeight = Math.max(vertical, radius / aspect) * 1.10;
    camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect; camera.top = halfHeight; camera.bottom = -halfHeight;
    camera.position.set(0, center + Math.sin(pitch) * 8, Math.cos(pitch) * 8); camera.lookAt(0, center, 0);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  }
  function resize() {
    if (disposed) return;
    const rect = canvas.getBoundingClientRect();
    width = Math.max(0, rect.width); height = Math.max(0, rect.height);
    if (!width || !height) return;
    renderer.setSize(width, height, false); frame();
  }
  function update(next: Player) {
    if (disposed) return;
    canvas.setAttribute('aria-label', `${next.name}, ${next.appearance.className}. 3D equipment preview. Drag horizontally or use Left and Right arrows to rotate; Home resets the view.`);
    const card=activeSpecialist(next.raidProgress,next.appearance.className);
    const signature = JSON.stringify([next.id, next.appearance, next.equipment, next.raidProgress?.equippedCosmetics, card&&[card.className,card.upgrade,card.broken,card.sealed]]);
    if (signature === fingerprint) return;
    if (characterId !== next.id) { rotation = -.25; endDrag(); }
    characterId = next.id; fingerprint = signature; releaseRig();
    rig = makeCharacter(next.appearance, next.equipment, next.raidProgress); scene.add(rig); animateCharacter(rig, 0, false); rig.updateMatrixWorld(true);
    bounds.makeEmpty();
    // Hidden gathering tools must not shrink the displayed adventurer.
    rig.traverseVisible(node => { if (node instanceof THREE.Mesh) bounds.expandByObject(node); });
    rig.rotation.y = rotation; frame();
  }
  function render(elapsed: number) {
    if (disposed || contextLost || !width || !height || !rig) return;
    animateCharacter(rig, reducedMotion?.matches || !Number.isFinite(elapsed) ? 0 : elapsed, false);
    rig.rotation.y = rotation; renderer.render(scene, camera);
  }
  function endDrag() {
    const id = drag?.id; drag = undefined; canvas.style.cursor = 'grab';
    if (id !== undefined && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }
  function pointerDown(event: PointerEvent) {
    if (event.button !== 0 || event.isPrimary === false || drag) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, rotation, moving: false };
    canvas.setPointerCapture(event.pointerId); canvas.focus({ preventScroll: true }); event.stopPropagation();
  }
  function pointerMove(event: PointerEvent) {
    if (drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moving && Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { endDrag(); return; }
    if (Math.abs(dx) > 4) drag.moving = true;
    if (!drag.moving) return;
    event.preventDefault(); event.stopPropagation(); canvas.style.cursor = 'grabbing'; rotation = drag.rotation + dx * .012;
  }
  function pointerEnd(event: PointerEvent) { if (drag?.id === event.pointerId) endDrag(); }
  function keyDown(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); endDrag();
    rotation = event.key === 'Home' ? -.25 : rotation + (event.key === 'ArrowLeft' ? -1 : 1) * Math.PI / 8;
  }
  function lost(event: Event) { event.preventDefault(); contextLost = true; endDrag(); }
  function restored() { contextLost = false; resize(); }
  canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointermove', pointerMove);
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, pointerEnd as EventListener);
  canvas.addEventListener('keydown', keyDown); canvas.addEventListener('webglcontextlost', lost); canvas.addEventListener('webglcontextrestored', restored);
  const observer = new ResizeObserver(resize); container.append(canvas); observer.observe(container); update(player); resize();
  return {
    update, render, resize,
    dispose() {
      if (disposed) return;
      disposed = true; observer.disconnect(); endDrag(); releaseRig();
      canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointermove', pointerMove);
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.removeEventListener(event, pointerEnd as EventListener);
      canvas.removeEventListener('keydown', keyDown); canvas.removeEventListener('webglcontextlost', lost); canvas.removeEventListener('webglcontextrestored', restored);
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      stage.traverse(node => { if (node instanceof THREE.Mesh) { geometries.add(node.geometry); for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material); } });
      geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); key.shadow.dispose();
      scene.clear(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    },
  };
}
