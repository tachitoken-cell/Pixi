import * as THREE from 'three';
import { createPetModel, animatePetModel } from './pet-models';
import { isPetId } from './pets';
import { makeMount, animateMount, disposeMount } from './mounts';
import { MOUNTS } from './travel';

/** Uses the game's loaded asset libraries; only the pedestal and renderer belong to this view. */
export function createCollectionPreview(canvas: HTMLCanvasElement) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(36, 1, .01, 100);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene.add(new THREE.HemisphereLight('#e8f1d5', '#344329', 2.3));
  const key = new THREE.DirectionalLight('#ffe3b3', 3.5);
  key.position.set(-4, 7, 5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.normalBias = .025;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#a6dec6', 2); rim.position.set(4, 3, -4); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshStandardMaterial({ color: '#273e2c', roughness: .95, transparent: true, opacity: .72 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const edge = new THREE.Mesh(new THREE.RingGeometry(.975, 1, 64), new THREE.MeshBasicMaterial({ color: '#b6a575', transparent: true, opacity: .28 }));
  edge.rotation.x = -Math.PI / 2; edge.position.y = .002; scene.add(edge);
  const turntable = new THREE.Group(); scene.add(turntable);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)'), events = new AbortController();
  const box = new THREE.Box3(), size = new THREE.Vector3(), center = new THREE.Vector3(), target = new THREE.Vector3();
  let model: THREE.Group | undefined, kind: 'pets' | 'mounts' = 'pets', selected = '', evolution=0;
  let width = 0, height = 0, radius = 1, modelHeight = 1, elapsed = 0, previous = 0, disposed = false;
  const active = () => !disposed && !!model && width > 0 && height > 0 && !document.hidden;
  const animate = () => {
    if (!model) return;
    if (kind === 'pets') animatePetModel(model, elapsed, false);
    else animateMount(model, elapsed, false);
  };
  const render = () => {
    if (!active()) return;
    renderer.render(scene, camera); canvas.parentElement?.classList.add('is-ready');
  };
  const frame = (now: number) => {
    elapsed += previous ? Math.min((now - previous) / 1000, .05) : 0; previous = now;
    animate(); render();
  };
  const sync = () => {
    previous = 0;
    renderer.setAnimationLoop(active() && !reducedMotion.matches ? frame : null);
    render();
  };
  const fit = () => {
    if (!width || !height) return;
    camera.aspect = width / height;
    const vertical = THREE.MathUtils.degToRad(camera.fov / 2), horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
    // A horizontal bounding circle keeps every drag angle inside the same stable framing.
    const distance = Math.max(radius / Math.tan(horizontal), modelHeight * .6 / Math.tan(vertical)) + radius;
    camera.position.set(0, target.y + distance * .18, distance * 1.12);
    camera.near = Math.max(.01, distance / 100); camera.far = distance * 10;
    camera.lookAt(target); camera.updateProjectionMatrix();
  };
  const resize = (nextWidth: number, nextHeight: number) => {
    nextWidth = Math.round(nextWidth); nextHeight = Math.round(nextHeight);
    if (width === nextWidth && height === nextHeight) return;
    width = nextWidth; height = nextHeight;
    if (width > 0 && height > 0) { renderer.setSize(width, height, false); fit(); }
    sync();
  };
  const observer = new ResizeObserver(entries => {
    const bounds = entries[0]?.contentRect; if (bounds) resize(bounds.width, bounds.height);
  });
  observer.observe(canvas);
  resize(canvas.clientWidth, canvas.clientHeight);
  const rotate = (delta: number) => {
    if (disposed || !Number.isFinite(delta)) return;
    turntable.rotation.y += delta; render();
  };
  let pointer: number | undefined, pointerX = 0;
  const stopDrag = () => {
    const captured = pointer; pointer = undefined;
    if (captured !== undefined && canvas.hasPointerCapture(captured)) canvas.releasePointerCapture(captured);
  };
  const touchAction = canvas.style.touchAction; canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || pointer !== undefined || !active()) return;
    event.preventDefault(); pointer = event.pointerId; pointerX = event.clientX; canvas.setPointerCapture(pointer);
  }, { signal: events.signal });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer) return;
    if (!active()) { stopDrag(); return; }
    rotate((event.clientX - pointerX) * .012); pointerX = event.clientX;
  }, { signal: events.signal });
  canvas.addEventListener('keydown', event => {
    if (!active() || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); rotate((event.key === 'ArrowLeft' ? -1 : 1) * Math.PI / 8);
  }, { signal: events.signal });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, event => {
    if ((event as PointerEvent).pointerId === pointer) stopDrag();
  }, { signal: events.signal });
  window.addEventListener('blur', stopDrag, { signal: events.signal });
  document.addEventListener('visibilitychange', () => { stopDrag(); sync(); }, { signal: events.signal });
  reducedMotion.addEventListener('change', sync, { signal: events.signal });
  const removeModel = () => {
    if (model && kind === 'mounts') disposeMount(model);
    else model?.removeFromParent();
    model = undefined;
  };
  return {
    show(nextKind: 'pets' | 'mounts', id: string, nextEvolution=0) {
      if (disposed || kind === nextKind && selected === id && evolution===nextEvolution) return;
      canvas.parentElement?.classList.remove('is-ready');
      const mount = MOUNTS.find(entry => entry.id === id);
      let next: THREE.Group;
      try {
        if (nextKind === 'pets' ? !isPetId(id) : !mount) throw new Error(`Unknown collection model: ${nextKind}/${id}`);
        next = nextKind === 'pets' && isPetId(id) ? createPetModel(id,nextEvolution) : makeMount(mount!.id);
      } catch (error) { selected = ''; removeModel(); sync(); throw error; }
      removeModel(); kind = nextKind; selected = id; evolution=nextEvolution; model = next; elapsed = 0;
      turntable.rotation.y = 0; turntable.add(model);
      turntable.updateWorldMatrix(true, true);
      box.setFromObject(model); box.getCenter(center);
      model.position.set(-center.x, -box.min.y + .02, -center.z);
      animate(); box.setFromObject(model); box.getSize(size); box.getCenter(target);
      // Leave room for hovering and wingbeats without moving the camera during an idle.
      radius = Math.max(.2, Math.hypot(size.x, size.z) / 2) * 1.1; modelHeight = Math.max(.2, size.y) * 1.35;
      turntable.rotation.y = -.55;
      const floorRadius = radius * 1.18;
      floor.scale.setScalar(floorRadius); edge.scale.setScalar(floorRadius);
      key.position.set(-radius * 3, modelHeight + radius * 4, radius * 3);
      Object.assign(key.shadow.camera, { left: -floorRadius * 2, right: floorRadius * 2, top: floorRadius * 2, bottom: -floorRadius * 2, near: .01, far: radius * 14 + modelHeight * 2 });
      key.shadow.camera.updateProjectionMatrix();
      fit(); sync();
    },
    rotate,
    dispose() {
      if (disposed) return;
      disposed = true; stopDrag(); events.abort(); observer.disconnect(); renderer.setAnimationLoop(null);
      canvas.parentElement?.classList.remove('is-ready');
      removeModel(); floor.geometry.dispose(); floor.material.dispose(); edge.geometry.dispose(); edge.material.dispose(); key.shadow.dispose();
      renderer.dispose(); renderer.forceContextLoss(); canvas.style.touchAction = touchAction;
    },
  };
}
