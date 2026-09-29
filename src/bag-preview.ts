import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BAG_ITEMS, bagKindValid } from './bags';

let library: Promise<THREE.Group> | undefined;
/** Load the small Blender library only when a bag is inspected; render only on change. */
export function mountBagPreview(container: HTMLElement, kind: string) {
  if (!bagKindValid(kind)) return;
  const canvas = document.createElement('canvas');
  canvas.tabIndex = 0; canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `${BAG_ITEMS[kind].label}. Drag or use Left and Right arrows to rotate the 3D bag.`);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(34, 1, .01, 20);
  scene.add(new THREE.HemisphereLight('#fff1cf', '#344d45', 2.2));
  const light = new THREE.DirectionalLight('#fff0ce', 3); light.position.set(-3, 4, 5); scene.add(light);
  const controls = new OrbitControls(camera, canvas); controls.enablePan = false; controls.enableZoom = false;
  controls.minPolarAngle = .25; controls.maxPolarAngle = Math.PI * .8;
  let disposed = false, model: THREE.Object3D | undefined, radius = 1, fallback: Text | undefined;
  const render = () => { if (!disposed && model) renderer.render(scene, camera); };
  function resize() {
    const { width, height } = container.getBoundingClientRect();
    if (disposed || !width || !height) return;
    renderer.setSize(width, height, false); camera.aspect = width / height;
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(17)) / Math.min(1, camera.aspect);
    camera.position.copy(controls.target).add(new THREE.Vector3(1, .55, 1.65).normalize().multiplyScalar(distance));
    camera.updateProjectionMatrix(); controls.update(); render();
  }
  function keydown(event: KeyboardEvent) {
    if (!model || !['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    model.rotation.y = event.key === 'Home' ? 0 : model.rotation.y + (event.key === 'ArrowLeft' ? -1 : 1) * Math.PI / 8;
    render();
  }
  const lost = (event: Event) => event.preventDefault();
  canvas.addEventListener('keydown', keydown); canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', resize); controls.addEventListener('change', render);
  const observer = new ResizeObserver(resize); container.append(canvas); observer.observe(container);
  library ||= new GLTFLoader().loadAsync('/models/bag-kit.glb').then(asset => asset.scene).catch(error => { library = undefined; throw error; });
  void library.then(asset => {
    if (disposed) return;
    const source = asset.getObjectByName(`bag-${kind}`); if (!source) throw new Error('Bag model unavailable');
    model = source.clone(true); scene.add(model);
    const bounds = new THREE.Box3().setFromObject(model), sphere = bounds.getBoundingSphere(new THREE.Sphere());
    radius = Math.max(.1, sphere.radius) * 1.12; controls.target.copy(sphere.center); resize();
  }).catch(() => { if (!disposed) { canvas.hidden = true; fallback = document.createTextNode('3D preview unavailable.'); container.append(fallback); } });
  return { dispose() {
    if (disposed) return; disposed = true; observer.disconnect(); controls.dispose();
    canvas.removeEventListener('keydown', keydown); canvas.removeEventListener('webglcontextlost', lost);
    canvas.removeEventListener('webglcontextrestored', resize); scene.clear();
    // Source geometries/materials stay cached for the next bag inspection.
    renderer.dispose(); renderer.forceContextLoss(); canvas.remove(); fallback?.remove();
  } };
}
