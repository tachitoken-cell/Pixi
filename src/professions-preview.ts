import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadGatheringAssets, makeResource, makeWorkshop, showResource } from './resources';
import { SKILLS, RESOURCE_TYPES, skillProgress, type SkillId } from './skills';
import { renderSkills } from './skills-ui';
import { renderCrafting } from './adventure-ui';
import { newBags } from './bags';
import { starterGear } from './progression';
import { disposeWorldGroup } from './world';
import type { NodeKind } from './content';
import type { Player } from './shared';
import './style.css';
import './art.css';
import './skills.css';
import './adventure.css';
import './professions-preview.css';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const collection = $<HTMLSelectElement>('collection'), sampleLevel = $<HTMLSelectElement>('sample-level');
const scene = new THREE.Scene(); scene.background = new THREE.Color('#536d52');
const camera = new THREE.PerspectiveCamera(38, 1, .05, 140);
const renderer = new THREE.WebGLRenderer({ canvas: $<HTMLCanvasElement>('preview'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
scene.add(new THREE.HemisphereLight('#f0f4df', '#364b32', 2.3));
const sun = new THREE.DirectionalLight('#ffebbf', 3.2); sun.position.set(-8, 16, 10); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 18, bottom: -18, far: 60 }); sun.shadow.bias = -.0003; scene.add(sun);
const rim = new THREE.DirectionalLight('#c8ded7', 1.6); rim.position.set(12, 8, -8); scene.add(rim);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ color: '#61764b', roughness: 1 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.position.y = -.04; scene.add(floor);
const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.maxPolarAngle = Math.PI * .48; controls.minDistance = 1; controls.maxDistance = 70;
const models = new THREE.Group(); scene.add(models);
type View = { model: THREE.Group; label: HTMLButtonElement; kind?: NodeKind; title: string };
let views: View[] = [], harvested = false, focused: View | undefined, page = 'gathering';
const player = { appearance: { className: 'Knight' }, level: 60, hp: 100, maxHp: 100, skills: { mining: 0, woodcutting: 0, herbalism: 0, fishing: 0 }, craftingXp: 0,
  inventory: { wood: 20, crystal: 20, herb: 20, potion: 0, relic: 2 }, carriedItems: { 'gnarled-bark': 8, 'frost-shard': 8 }, ...starterGear('Knight'), ...newBags() } as unknown as Player;
function journal() {
  const xp = 50 * (Number(sampleLevel.value) - 1) ** 2;
  player.skills = { mining: xp, woodcutting: xp, herbalism: xp, fishing: xp }; player.craftingXp = xp;
  $('panel-content').innerHTML = page === 'gathering' ? renderSkills(player) : renderCrafting(player, false);
  document.querySelectorAll<HTMLElement>('[data-page]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.page === page)));
}
function frame(view?: View) {
  focused = view;
  views.forEach(item => { item.model.visible = !view || item === view; item.label.hidden = !!view; });
  const box = new THREE.Box3(); views.filter(item => item.model.visible).forEach(item => box.union(new THREE.Box3().setFromObject(item.model)));
  const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  controls.target.copy(center); controls.target.y = Math.max(.3, center.y - .35);
  const vertical = Math.max(size.y + 3, size.x / camera.aspect, size.z * .65), distance = vertical / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * (camera.aspect < .85 ? 1.5 : 1.18);
  camera.position.copy(controls.target).add(new THREE.Vector3(.23, .38, .9).normalize().multiplyScalar(distance)); controls.update();
  $('collection-title').textContent = view?.title ?? (collection.value === 'workshops' ? 'The village workshops' : SKILLS[collection.value as SkillId].label);
  $('model-description').textContent = view ? 'Authored mesh detail, shown at its in-game scale. Reset view to compare the full progression.' : collection.value === 'workshops' ? 'Carved timber, riveted iron and glassware. Every town workshop supports all crafting disciplines.' : 'Apprentice → Journeyman → Expert → Artisan. Richer silhouettes mark resources unlocked at levels 1, 10, 25 and 50.';
}
function arrange() {
  const narrow = camera.aspect < .85, columns = narrow ? 2 : views.length;
  views.forEach((view, index) => view.model.position.set((index % columns - (columns - 1) / 2) * (collection.value === 'woodcutting' ? 6.6 : 4.7), 0, narrow ? (Math.floor(index / columns) - .5) * 6.4 : 0));
  frame(focused);
}
function showCollection() {
  for (const view of views) disposeWorldGroup(view.model);
  views = []; focused = undefined; $('model-labels').replaceChildren();
  const entries = collection.value === 'workshops' ? [
    { title: 'Woodworking bench', model: makeWorkshop('greenwood') }, { title: 'Sunsteel forge', model: makeWorkshop('amberwild') }, { title: 'Apothecary bench', model: makeWorkshop('hollow') },
  ] : (Object.entries(RESOURCE_TYPES) as [NodeKind, typeof RESOURCE_TYPES[NodeKind]][]).filter(([, resource]) => resource.skill === collection.value && resource.model).sort((a, b) => a[1].requiredLevel - b[1].requiredLevel).map(([kind, info]) => ({ title: info.label, kind, model: makeResource(kind) }));
  for (const entry of entries) {
    const label = document.createElement('button'); label.className = 'model-label';
    label.innerHTML = `<strong>${entry.title}</strong><span>${'kind' in entry ? `Level ${RESOURCE_TYPES[entry.kind!].requiredLevel}` : 'Crafting station'}</span>`;
    const view: View = { ...entry, label }; views.push(view); models.add(entry.model); $('model-labels').append(label);
    if (view.kind) showResource(view.model, !harvested);
    label.onclick = () => frame(view);
  }
  $('regrowth').hidden = collection.value === 'workshops'; arrange();
}
function resize() { const { clientWidth: width, clientHeight: height } = $('viewport'); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); if (views.length) arrange(); }
function setPage(value: string) { page = value; journal(); }
function focusResource(kind: NodeKind) { collection.value = RESOURCE_TYPES[kind].skill; showCollection(); frame(views.find(view => view.kind === kind)); }
$('panel-content').onclick = event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button || button.disabled) return;
  const data = button.dataset;
  if (data.resourceKind) focusResource(data.resourceKind as NodeKind);
  if (data.trainSkill || data.findMaterial) {
    collection.value = data.trainSkill || ({ wood: 'woodcutting', crystal: 'mining', herb: 'herbalism' } as Record<string, string>)[data.findMaterial!]; showCollection();
  }
  if ('findWorkshop' in data) { collection.value = 'workshops'; showCollection(); $('preview-notice').textContent = 'In the game, Find a workshop marks the town workshop on your map.'; }
  if ('openCrafting' in data) setPage('crafting');
  if ('openProfessions' in data) setPage('gathering');
};
document.querySelectorAll<HTMLButtonElement>('[data-page]').forEach(button => button.onclick = () => setPage(button.dataset.page!));
sampleLevel.onchange = journal; $('reset-view').onclick = () => frame();
$('regrowth').onclick = () => { harvested = !harvested; for (const view of views) if (view.kind) showResource(view.model, !harvested); $('regrowth').textContent = harvested ? 'Show regrown' : 'Show harvested'; $('regrowth').setAttribute('aria-pressed', String(harvested)); };
try {
  await loadGatheringAssets(); resize(); showCollection(); journal(); collection.onchange = showCollection;
  const point = new THREE.Vector3();
  renderer.setAnimationLoop(() => {
    controls.update(); renderer.render(scene, camera);
    for (const view of views) {
      if (view.label.hidden) continue;
      point.copy(view.model.position); point.y = -.15; point.project(camera);
      view.label.style.left = `${(point.x * .5 + .5) * renderer.domElement.clientWidth}px`;
      view.label.style.top = `${(-point.y * .5 + .5) * renderer.domElement.clientHeight}px`;
    }
    $('render-status').textContent = `${views.filter(view => view.model.visible).length} models · ${renderer.info.render.triangles.toLocaleString()} triangles · ${renderer.info.render.calls} draws`;
  });
  function selfCheck() {
    if (views.some(view => new THREE.Box3().setFromObject(view.model).isEmpty())) throw new Error('Empty model');
    if (skillProgress(player.craftingXp).level !== Number(sampleLevel.value)) throw new Error('Preview rank disagrees with game rules');
    if (!renderCrafting(player, false).includes('data-craft=')) throw new Error('Preview crafting sample is incomplete');
    return { ok: true, models: views.length, level: Number(sampleLevel.value), page };
  }
  selfCheck(); document.body.dataset.ready = 'true';
  Object.assign(window, { professionsPreview: { scene, camera, renderer, selfCheck } });
  addEventListener('resize', resize);
  addEventListener('pagehide', () => { renderer.setAnimationLoop(null); controls.dispose(); disposeWorldGroup(models); floor.geometry.dispose(); floor.material.dispose(); sun.shadow.dispose(); renderer.dispose(); }, { once: true });
} catch (error) { $('render-status').textContent = `Could not load models: ${String(error)}`; console.error(error); }
