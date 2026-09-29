import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PETS } from './pets';
import { MONSTERS } from './bestiary';
import { loadPetAssets, createPetModel, animatePetModel } from './pet-models';
import { petDropLabel } from './pet-ui';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const select = $<HTMLSelectElement>('pet'), animation = $<HTMLSelectElement>('animation'), pause = $<HTMLButtonElement>('pause');
const scene = new THREE.Scene(); scene.background = new THREE.Color('#24332c');
const camera = new THREE.PerspectiveCamera(42, 1, .05, 80), renderer = new THREE.WebGLRenderer({ canvas: $<HTMLCanvasElement>('preview'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
scene.add(new THREE.HemisphereLight('#e4f5e8', '#728052', 2.1));
const sun = new THREE.DirectionalLight('#fff0d1', 3.4); sun.position.set(-5, 10, 6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, far: 35 }); scene.add(sun);
const rim = new THREE.DirectionalLight('#a2cfe0', 2); rim.position.set(7, 5, -5); scene.add(rim);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: '#526744', roughness: .9 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.minDistance = 1.4; controls.maxDistance = 30; controls.maxPolarAngle = Math.PI * .48;
let paused = matchMedia('(prefers-reduced-motion: reduce)').matches, elapsed = 0, previous = 0;
function updatePause() { pause.textContent = paused ? 'Play animation' : 'Pause animation'; pause.setAttribute('aria-pressed', String(paused)); }
updatePause(); pause.onclick = () => { paused = !paused; updatePause(); };
try {
  await loadPetAssets();
  const views = PETS.map(pet => {
    const mesh = createPetModel(pet.id), label = document.createElement('span'); scene.add(mesh);
    label.className = 'pet-label'; label.textContent = pet.name; $('labels').append(label);
    select.add(new Option(pet.name, pet.id)); return { pet, mesh, label, home: new THREE.Vector3() };
  });
  const params = new URLSearchParams(location.search);
  if (['new', 'all'].includes(params.get('pet') ?? '') || PETS.some(pet => pet.id === params.get('pet'))) select.value = params.get('pet')!;
  if (params.get('pose') === 'follow') animation.value = 'follow';
  function focus() {
    const selected = views.find(view => view.pet.id === select.value), narrow = camera.aspect < 1.05, columns = narrow ? 2 : 4;
    const visible = views.filter(view => selected ? view === selected : select.value !== 'new' || view.pet.source !== null);
    views.forEach(view => {
      const i = visible.indexOf(view);
      view.mesh.visible = i >= 0; view.label.hidden = !!selected || !view.mesh.visible;
      view.home.set(selected ? 0 : (i % columns - (columns - 1) / 2) * 2.6, 0, selected ? 0 : (Math.floor(i / columns) - (Math.ceil(visible.length / columns) - 1) / 2) * 3.1);
      view.mesh.position.copy(view.home); view.mesh.rotation.y = selected ? -.35 : -.18;
      animatePetModel(view.mesh, elapsed, false);
    });
    const bounds = new THREE.Box3(); visible.forEach(view => bounds.expandByObject(view.mesh));
    const sphere = bounds.getBoundingSphere(new THREE.Sphere()), halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const distance = sphere.radius / Math.sin(Math.min(halfFov, Math.atan(Math.tan(halfFov) * camera.aspect))) * 1.1;
    controls.target.copy(sphere.center); controls.maxDistance = Math.max(30, distance * 2);
    camera.position.copy(sphere.center).add(new THREE.Vector3(.35, .5, 1).normalize().multiplyScalar(distance)); controls.update();
    $('description').textContent = selected ? selected.pet.description : 'Eight new companions with bramble fur, carved feathers, ember gills, crystal quills and dew-lit wings.';
    $('source').textContent = selected ? selected.pet.retired ? 'Retired from drops. Existing companions and unlearned copies are preserved.' : selected.pet.id === 'wayfinder-sprite' ? '10 qualified referrals · Account-bound companion' : selected.pet.source === 'moss-slime' ? 'Slimes cannot drop pets. Existing Clover Mouse companions and unlearned copies are preserved.' : selected.pet.source ? `${MONSTERS[selected.pet.source].name}${selected.pet.source === 'ashen-crown-titan' ? ' · Level 40 world boss' : ' · Level 10 or higher'} · ${petDropLabel(selected.pet.dropChance)} per eligible kill` : selected.pet.storeOnly ? 'Ingame store · Burn $20 worth of MOSS' : 'The Horned Apostle · Level 60 raid reward' : 'Seven wild drops: 0.025% each (1 in 4,000) from eligible source monsters at level 10 or higher. Slimes cannot drop pets. Suncrest Peacock drops only from the level 40 Ashen Crown Titan. Existing pets are preserved.';
    const portrait = $<HTMLImageElement>('portrait'); portrait.hidden = !selected;
    if (selected) portrait.src = selected.pet.icon;
    document.body.dataset.pet = selected?.pet.id ?? 'all';
  }
  function resize() { const { clientWidth: width, clientHeight: height } = $('viewport'); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); }
  select.onchange = focus; addEventListener('resize', () => { resize(); focus(); }); resize(); focus(); document.body.dataset.ready = 'true';
  const projected = new THREE.Vector3();
  renderer.setAnimationLoop(now => {
    const dt = previous ? Math.min(.05, (now - previous) / 1000) : 0; previous = now; if (!paused) elapsed += dt;
    const moving = animation.value === 'follow';
    for (const view of views) {
      if (!view.mesh.visible) continue;
      view.mesh.position.copy(view.home);
      if (moving && ['new', 'all'].includes(select.value)) { view.mesh.position.x += Math.sin(elapsed * .65) * .55; view.mesh.position.z += Math.cos(elapsed * .65) * .35; view.mesh.rotation.y = Math.atan2(Math.cos(elapsed * .65) * .55, -Math.sin(elapsed * .65) * .35); }
      else view.mesh.rotation.y = -.35;
      animatePetModel(view.mesh, elapsed, moving);
      projected.copy(view.mesh.position); projected.y = -.15; projected.project(camera);
      view.label.style.left = `${(projected.x * .5 + .5) * renderer.domElement.clientWidth}px`; view.label.style.top = `${(-projected.y * .5 + .5) * renderer.domElement.clientHeight}px`;
    }
    controls.update(); renderer.render(scene, camera);
    $('status').textContent = `${select.value === 'all' ? `All ${PETS.length} pets` : select.value === 'new' ? `${PETS.filter(pet => pet.source !== null).length} new companions` : PETS.find(pet => pet.id === select.value)!.name} · ${moving ? 'Following' : 'Idle'}${paused ? ' · Paused' : ''} · ${renderer.info.render.triangles.toLocaleString('en-US')} triangles · ${renderer.info.render.calls} draws`;
    document.body.dataset.loadedModels = String(views.length); document.body.dataset.triangles = String(renderer.info.render.triangles); document.body.dataset.drawCalls = String(renderer.info.render.calls);
  });
  addEventListener('pagehide', () => { renderer.setAnimationLoop(null); controls.dispose(); renderer.dispose(); }, { once: true });
} catch (error) { $('status').textContent = `Pet preview could not load: ${error instanceof Error ? error.message : String(error)}`; console.error(error); }
