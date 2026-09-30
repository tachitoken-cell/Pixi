import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { Character, ANIM_NAMES, setWireframe } from './character.js';
import { makeCharacter } from './model-character.js';
import { createMiniland } from './miniland.js';
import { CLASSES, CLASS_ORDER, CLASS_CHANGE_LEVEL, CLASS_CHOICES } from './classes.js';
import { Effects } from './effects.js';
import { buildMap } from './world.js';
import { SEE_THROUGH } from './voxel.js';
import { MAPS, START_MAP } from './maps.js';
import * as audio from './audio.js';
import { Dachshund } from './pet.js';
import { CLASS_SKILLS, MAX_JOB, MAX_LEVEL, CLASS_CHANGE_JOB, BUFF_TIME, MAX_STONES, jobXpNeeded } from './skills.js';

// ---------------------------------------------------------------- renderer / scene
const canvas = document.getElementById('view');
// phones and tablets: touch controls, lighter rendering
const TOUCH = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
document.body.classList.toggle('touch', TOUCH);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 900);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 4;
controls.maxDistance = 26;
controls.maxPolarAngle = Math.PI * 0.52;

const hemi = new THREE.HemisphereLight(0xe6ecff, 0x4a4038, 1.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
sun.position.set(4, 9, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(TOUCH ? 1024 : 2048, TOUCH ? 1024 : 2048);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const rim = new THREE.DirectionalLight(0xbcd0ff, 1.1);
rim.position.set(-5, 5, -7);
scene.add(rim);

// studio floor
const studio = new THREE.Group();
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.35 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
const disc = new THREE.Mesh(new THREE.CircleGeometry(1.6, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.05 }));
disc.rotation.x = -Math.PI / 2;
disc.position.y = 0.005;
studio.add(floor, disc);
scene.add(studio);

// open world: each map is built the first time you enter it and kept afterwards
const maps = {};
let map = null;

const fx = new Effects(scene);

// ---------------------------------------------------------------- characters
// the hero's dachshund companion
const pet = new Dachshund();
scene.add(pet.root);
const petState = { vel: 0 };
const chars = {};
for (const id of CLASS_ORDER) {
  const ch = makeCharacter(CLASSES[id]);
  ch.onEvent = (name, c) => { fx.handle(name, c); audio.animEvent(name); onCombatEvent(name, c); };
  chars[id] = ch;
  scene.add(ch.root);
}

const state = {
  mode: 'showcase', cls: 'adventurer', armed: true, turntable: false, pixel: false, wire: false,
  view: 0.5, anim: 'idle', zoom: 1.25,
  cam: { yaw: 0, pitch: 0.72, dist: 17 }, // 360° orbit camera in play mode
  camMode: 'classic',                      // 'classic' = fixed NosTale-style view, 'free' = 360° orbit
};
const player = { pos: new THREE.Vector3(0, 0, 0), yaw: 0, target: null, sitting: false, dash: null, pending: null };
// Adventurer progression and combat state
const game = { heroClass: 'adventurer', time: 0, jobLv: 1, jobXp: 0, stones: MAX_STONES, cds: {}, buffs: { atk: 0, def: 0 }, casting: null, auraIn: 0, target: null, travelling: false, combatUntil: 0,
  saat: 5, saatReadyAt: 0, shieldUntil: 0 };
// Saat: revive where you fell with 50% HP and MP; costs 5 and then has a cooldown
const SAAT_COST = 5, SAAT_CD = 300, SAAT_DROP = 0.12;
const clockText = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
// hero level, health and mana
const hero = { name: 'Hero', lv: 1, xp: 0, hp: 0, mp: 0, dead: false };
const xpNeeded = (lv) => Math.round(70 * Math.pow(lv, 1.6));
// class stats (1-5) scale the hero; the Adventurer is the 1.0 baseline
const classMul = (k) => 0.7 + CLASSES[game.heroClass].stats[k] * 0.1;
const maxHp = () => Math.round((120 + (hero.lv - 1) * 30) * classMul('hp'));
const maxMp = () => Math.round((60 + (hero.lv - 1) * 12) * classMul('mp'));
const heroAtk = () => (14 + hero.lv * 5 + game.jobLv * 2) * classMul('atk');
const maxJob = () => MAX_JOB[game.heroClass];
let SKILLS = CLASS_SKILLS.adventurer;
// critical hits: chance and damage come from the class, crit damage also grows a little with level
const critRate = () => CLASSES[game.heroClass].crit.rate / 100;
const critDmg = () => (CLASSES[game.heroClass].crit.dmg + (hero.lv - 1)) / 100;
const heroDef = () => (2 + hero.lv * 1.5) * classMul('def') * (game.buffs.def > game.time ? 1.3 : 1);
hero.hp = maxHp(); hero.mp = maxMp();
const keys = new Set();

// ---------------------------------------------------------------- UI
const $ = (s) => document.querySelector(s);
const labels = $('#labels');
const miniland = createMiniland({ $, toast, audio, fx, game, hero, player, placeLabel: (el, pos, y) => place(el, pos, y), labelsEl: labels });
let homeReturn = null;   // where the Miniland exit leads: { id, portalId } or { id, pos, yaw }

function renderInfo() {
  const c = CLASSES[state.cls];
  document.documentElement.style.setProperty('--accent', c.accent);
  $('#c-role').textContent = c.role;
  $('#c-name').textContent = c.name;
  $('#c-desc').textContent = c.desc;
  $('#c-weapon').textContent = c.weaponName;
  $('#c-crit').textContent = `${c.crit.rate}% · ${c.crit.dmg}%`;
  const lock = $('#c-lock');
  lock.hidden = c.id === game.heroClass || c.id === 'adventurer';
  lock.textContent = game.heroClass === 'adventurer' ? `Preview · choose at Job Lv. ${CLASS_CHANGE_LEVEL} from the Class Master in Mossvale` : 'Preview';
  const names = { hp: 'HP', mp: 'MP', atk: 'ATK', def: 'DEF', spd: 'SPD' };
  $('#c-stats').innerHTML = Object.entries(c.stats).map(([k, v]) =>
    `<div class="stat"><span>${names[k]}</span><div class="bar">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= v ? 'f' : ''}"></i>`).join('')}</div></div>`).join('');
  document.querySelectorAll('.card').forEach((el) => el.classList.toggle('on', el.dataset.cls === state.cls));
  $('#skills-title').hidden = skillBox.hidden = !c.starter;
  refreshCards();
}

const animBox = $('#anims');
for (const a of ANIM_NAMES) {
  const b = document.createElement('button');
  b.textContent = a;
  b.dataset.anim = a;
  b.onclick = () => playAnim(a);
  animBox.appendChild(b);
}
const skillBox = $('#skill-previews');
for (const sk of SKILLS) {
  const b = document.createElement('button');
  b.textContent = sk.name;
  b.title = `Job Lv. ${sk.jobLv}: ${sk.desc}`;
  b.onclick = () => playAnim(sk.anim);
  skillBox.appendChild(b);
}
function markAnim() {
  animBox.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.anim === state.anim));
}

function activeChars() {
  return state.mode === 'lineup' ? CLASS_ORDER.map((id) => chars[id]) : [chars[state.cls]];
}
function playAnim(a) {
  if (a === 'sit' && state.anim !== 'sit') audio.sfx('heal');
  if (['idle', 'walk', 'run', 'sit'].includes(a)) {
    state.anim = a;
    player.sitting = a === 'sit';
  }
  for (const ch of activeChars()) ch.play(a);
  markAnim();
}

document.querySelectorAll('#modes button').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
document.querySelectorAll('#views button').forEach((b) => (b.onclick = () => {
  state.view = parseFloat(b.dataset.view);
  $('#opt-rotate').checked = state.turntable = false;
}));
$('#opt-weapon').onchange = (e) => { state.armed = e.target.checked; for (const ch of Object.values(chars)) ch.setArmed(state.armed); };
$('#opt-rotate').onchange = (e) => (state.turntable = e.target.checked);
$('#opt-wire').onchange = (e) => setWireframe((state.wire = e.target.checked));
$('#opt-pixel').onchange = (e) => { state.pixel = e.target.checked; canvas.classList.toggle('pixel', state.pixel); resize(); };

const locked = (id) => id !== game.heroClass;
let toastTimer;
function toast(msg, ms = 2200) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), ms);
}

function selectClass(id, force = false) {
  if (id === state.cls) return;
  if (state.mode === 'play' && locked(id) && !force) {
    toast(game.heroClass === 'adventurer'
      ? `Reach Job Lv. ${CLASS_CHANGE_LEVEL} and visit the Class Master in Mossvale to become a ${CLASSES[id].name}`
      : `You already walk the path of the ${CLASSES[game.heroClass].name}`, 3500);
    return;
  }
  const prev = chars[state.cls];
  state.cls = id;
  const ch = chars[id];
  if (state.mode === 'play') {
    prev.root.visible = false;
    ch.root.visible = true;
    fx.burst(player.pos.clone().setY(1.2), parseInt(CLASSES[id].accent.slice(1), 16), 24, 3.5, 0.14);
  }
  if (state.mode === 'showcase') {
    prev.root.visible = false;
    ch.root.visible = true;
    ch.play('victory');
  }
  ch.play(state.anim === 'sit' && state.mode !== 'play' ? 'sit' : state.anim);
  renderInfo();
  layout();
}

// ---------------------------------------------------------------- thumbnails (head portraits)
function makeThumbs() {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(176, 176);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.15;
  const s = new THREE.Scene();
  s.add(new THREE.HemisphereLight(0xe6ecff, 0x4a4038, 1.7));
  const l = new THREE.DirectionalLight(0xfff1dc, 2.4); l.position.set(3, 5, 6); s.add(l);
  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  cam.position.set(1.3, 2.8, 6.4);
  cam.lookAt(0, 2.45, 0);
  const out = {};
  for (const id of CLASS_ORDER) {
    const ch = makeCharacter(CLASSES[id]);
    ch.root.rotation.y = 0.25;
    ch.update(0.016);
    s.add(ch.root);
    r.render(s, cam);
    out[id] = r.domElement.toDataURL();
    s.remove(ch.root);
  }
  r.dispose();
  return out;
}
const thumbs = makeThumbs();
const bar = $('#classbar');
for (const id of CLASS_ORDER) {
  const c = CLASSES[id];
  const el = document.createElement('button');
  el.className = 'card';
  el.dataset.cls = id;
  el.style.setProperty('--c', c.accent);
  el.innerHTML = `<span class="star"></span><span class="lock"></span><img src="${thumbs[id]}" alt=""><b>${c.name}</b><small></small>`;
  el.onclick = () => selectClass(id);
  bar.appendChild(el);
}
// badges follow the hero's actual class
function refreshCards() {
  document.querySelectorAll('.card').forEach((el) => {
    const id = el.dataset.cls, mine = id === game.heroClass, adv = game.heroClass === 'adventurer';
    el.classList.toggle('locked', !mine);
    el.querySelector('.star').hidden = !mine;
    el.querySelector('.star').textContent = 'YOU';
    el.querySelector('.lock').hidden = mine;
    el.querySelector('.lock').textContent = id === 'adventurer' ? 'Start' : adv ? `Job ${CLASS_CHANGE_LEVEL}` : '—';
    el.querySelector('small').textContent = mine ? 'Your class' : id === 'adventurer' ? 'Starting class' : adv ? 'Choose at Job 20' : 'Not your path';
  });
}

// ---------------------------------------------------------------- modes
function setMode(m) {
  state.mode = m;
  document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  document.body.classList.toggle('play', m === 'play');
  document.body.classList.toggle('lineup', m === 'lineup');
  $('#help').hidden = hud.hidden = m !== 'play';
  for (const id of ['#pframe', '#mapbox']) $(id).hidden = m !== 'play';
  if (m !== 'play') $('#tframe').hidden = true;
  $('#stick').hidden = !(TOUCH && m === 'play');
  stick.x = stick.y = 0;
  studio.visible = m !== 'play';
  if (map) map.group.visible = m === 'play';
  if (m !== 'play') { scene.background = null; scene.fog = null; setLighting(false); }
  controls.enabled = m !== 'play';
  labels.innerHTML = '';
  layout();
  resize();
  if (m === 'play') {
    if (state.cls !== game.heroClass) selectClass(game.heroClass, true);
    player.sitting = false;
    state.anim = 'idle';
    chars[state.cls].play('idle');
    markAnim();
    if (!map) enterMap(START_MAP, null);
    else { applyMapLook(); snapCamera(); }
  }
}

function layout() {
  for (const id of CLASS_ORDER) {
    const ch = chars[id];
    ch.root.visible = state.mode === 'lineup' || id === state.cls;
  }
  if (state.mode === 'showcase') {
    chars[state.cls].root.position.set(0, 0, 0);
    pet.root.position.set(1.9, 0, 0.6);
    pet.root.rotation.y = -0.5;
    controls.target.set(0, 1.45, 0);
    camera.position.set(0, 2.6, 12);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -4;
    sun.shadow.camera.right = sun.shadow.camera.top = 4;
  } else if (state.mode === 'lineup') {
    CLASS_ORDER.forEach((id, i) => chars[id].root.position.set((i - (CLASS_ORDER.length - 1) / 2) * 2.8, 0, 0));
    pet.root.position.set(-(CLASS_ORDER.length + 1) / 2 * 2.8 + 0.6, 0, 0.6);
    pet.root.rotation.y = 0.4;
    controls.target.set(0, 1.7, 0);
    camera.position.set(0, 3.2, 23);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -9;
    sun.shadow.camera.right = sun.shadow.camera.top = 9;
    labels.innerHTML = CLASS_ORDER.map((id) => `<div class="label" data-id="${id}" style="color:${CLASSES[id].accent}">${CLASSES[id].name}</div>`).join('');
  } else {
    sun.shadow.camera.left = sun.shadow.camera.bottom = -26;
    sun.shadow.camera.right = sun.shadow.camera.top = 26;
    sun.shadow.camera.far = 90;
    labels.innerHTML = '<div class="nametag" id="nametag"></div>';
  }
  sun.shadow.camera.updateProjectionMatrix();
  controls.update();
}

// ---------------------------------------------------------------- play mode input
const typing = () => document.activeElement?.tagName === 'INPUT' && document.activeElement.type === 'text';
addEventListener('keydown', (e) => {
  if (typing()) return;
  const k = e.key.toLowerCase();
  keys.add(k);
  // use the physical key so Shift+1 still means skill 1 while sprinting
  const slot = e.code === 'Space' ? 0 : e.code.startsWith('Digit') ? (Number(e.code.slice(5)) + 9) % 10 : -1;
  if (slot >= 0 && !e.repeat) {
    e.preventDefault();
    if (state.mode === 'play') useSkill(slot);
    else if (CLASSES[state.cls].starter) playAnim(SKILLS[slot].anim);
    else if (slot < 2) playAnim(slot ? 'skill' : 'attack');
  }
  if (k === 'f') action('wave');
  if (k === 'l' && !e.repeat) goToMiniland();
  if (k === 'escape') { miniland.closeWindow(); miniland.setMode(null); }
  if (k === 'v') toggleCam();
  if (state.camMode === 'classic' && !e.repeat && (k === 'q' || k === 'e')) state.camYawGoal += (k === 'q' ? 1 : -1) * Math.PI / 2;
  if (k === 'r') action('victory');
  if (k === 'x') { if (state.anim === 'sit') playAnim('idle'); else playAnim('sit'); }
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

function action(a) {
  const ch = chars[state.cls];
  if (state.mode === 'play') {
    if (ch.busy) return;
    if (player.sitting) { player.sitting = false; state.anim = 'idle'; ch.play('idle'); }
    player.target = null;
    ch.play(a);
    markAnim();
  } else playAnim(a);
}


// ---------------------------------------------------------------- maps and travel
// NosTale-style lighting for the world: warm, bright and soft (strong sky light, gentle sun),
// studio lighting for the character screens
function setLighting(world) {
  if (world) {
    hemi.color.set(0xfff2dc); hemi.groundColor.set(0x8a7a52); hemi.intensity = 2.3;
    sun.color.set(0xffe2b8); sun.intensity = 1.7;
    rim.intensity = 0.35;
    renderer.toneMappingExposure = 1.08;
    if (map?.def.dungeon) {
      const frost = map.def.theme === 'frost';
      hemi.color.set(frost ? 0xe8f2ff : 0xcfc8ff); hemi.groundColor.set(frost ? 0x8aa0b8 : 0x3a3448);
      hemi.intensity = frost ? 2.0 : 1.9; sun.intensity = frost ? 1.2 : 0.95; sun.color.set(frost ? 0xeef6ff : 0xd8c8ff);
    }
  } else {
    hemi.color.set(0xe6ecff); hemi.groundColor.set(0x4a4038); hemi.intensity = 1.6;
    sun.color.set(0xfff1dc); sun.intensity = 2.6;
    rim.intensity = 1.1;
    renderer.toneMappingExposure = 1.15;
  }
  // characters get a soft round shadow in the world instead of a hard cast shadow
  for (const ch of Object.values(chars)) {
    ch.root.traverse((o) => { if (o.isMesh && !o.userData.blob) o.castShadow = !world; });
    ch.blob.visible = world;
  }
  pet.blob.visible = world;
  pet.root.traverse((o) => { if (o.isMesh && o !== pet.blob) o.castShadow = !world; });
}
function applyMapLook() {
  const d = map.def;
  setLighting(true);
  scene.background = new THREE.Color(d.sky);
  // warm, hazy distance like NosTale's painted backdrops; dungeons fade into their own darkness
  scene.fog = new THREE.Fog(d.dungeon ? new THREE.Color(d.sky) : new THREE.Color(d.sky).lerp(new THREE.Color(0xf6e6c8), 0.45), d.fog[0], d.fog[1]);
  document.body.style.setProperty('--sky', `#${d.sky.toString(16).padStart(6, '0')}`);
}
// camera offset from the hero; when a hill or mountain blocks the view the camera first
// tilts up, then moves in
const CLASSIC = { pitch: 0.95, dist: 30 };
function camOffset() {
  const classic = state.camMode === 'classic';
  const yaw = state.cam.yaw;
  const dist = classic ? CLASSIC.dist * (state.cam.dist / 17) : state.cam.dist;
  const ty = player.pos.y + 1.4;
  const dirAt = (pitch) => new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const clearUntil = (dir) => {
    if (!map) return dist;
    for (let t = 1; t <= dist; t += 0.4) {
      const top = classic ? map.heightAt(player.pos.x + dir.x * t, player.pos.z + dir.z * t) : map.camTopAt(player.pos.x + dir.x * t, player.pos.z + dir.z * t);
      if (top + 1.1 > ty + dir.y * t) return t;
    }
    return dist;
  };
  let pitch = classic ? CLASSIC.pitch : state.cam.pitch;
  let dir = dirAt(pitch), d = clearUntil(dir);
  while (d < dist && pitch < 1.4) { pitch += 0.08; dir = dirAt(pitch); d = clearUntil(dir); }
  return dir.multiplyScalar(d < dist ? Math.max(3, d - 1) : dist);
}
function snapCamera() {
  camera.position.copy(player.pos).add(camOffset());
  camera.lookAt(player.pos.x, player.pos.y + 1.4, player.pos.z);
}
function enterMap(id, portalId) {
  if (map?.def.miniland) miniland.onLeave();
  if (map) scene.remove(map.group);
  if (!maps[id]) { maps[id] = buildMap({ ...MAPS[id], id }); }
  map = maps[id];
  scene.add(map.group);
  map.group.visible = true;
  const at = portalId ? map.arrive(portalId) : { pos: new THREE.Vector3(0, map.heightAt(0, 6), 6), yaw: 0 };
  player.pos.copy(at.pos);
  player.yaw = at.yaw;
  // classic view keeps its fixed diagonal angle; free view looks back at the gate you came through
  state.cam.yaw = state.camMode === 'classic' ? state.cam.yaw : portalId ? at.yaw + 0.5 : Math.PI * 0.15;
  player.target = player.pending = player.dash = null;
  game.target = null;
  const ch = chars[state.cls];
  ch.root.position.copy(player.pos);
  ch.root.rotation.y = player.yaw;
  pet.root.position.copy(player.pos).add(new THREE.Vector3(1.2, 0, -0.8));
  applyMapLook();
  audio.playMusic(map.def.theme);
  snapCamera();
  labels.querySelectorAll('.mob, .npcname, .portalname').forEach((el) => el.remove());
  $('#mapname').textContent = map.def.name;
  const banner = $('#banner');
  $('#banner-name').textContent = map.def.name;
  $('#banner-lv').textContent = map.def.miniland ? 'Your home · press L' : map.def.safe ? 'Safe zone' : map.def.level || '';
  if (map.def.miniland) miniland.onEnter(map);
  banner.classList.remove('show');
  void banner.offsetWidth;
  banner.classList.add('show');
}
function travel(portal) {
  if (game.travelling) return;
  game.travelling = true;
  if (portal.to === 'miniland' && !portal.bell) homeReturn = { id: map.def.id, portalId: portal.id };
  audio.sfx('portal');
  $('#fade').classList.add('on');
  setTimeout(() => {
    if (portal.to === 'back') {
      const r = homeReturn || { id: START_MAP, portalId: 'south' };
      enterMap(r.id, r.portalId || null);
      if (r.pos) {
        player.pos.copy(r.pos); player.yaw = r.yaw;
        chars[state.cls].root.position.copy(r.pos);
        pet.root.position.copy(r.pos).add(new THREE.Vector3(1.2, 0, -0.8));
        snapCamera();
      }
    } else enterMap(portal.to, portal.toPortal);
    $('#fade').classList.remove('on');
    setTimeout(() => (game.travelling = false), 400);
  }, 380);
}

// Sweet Home Bell: the Miniland button / L. Inside the Miniland it opens the Miniland window
function goToMiniland() {
  if (state.mode !== 'play' || !map || hero.dead || game.travelling) return;
  if (map.def.miniland) return miniland.windowOpen ? miniland.closeWindow() : miniland.openWindow();
  if (map.def.dungeon) return audio.sfx('denied'), toast('The Sweet Home Bell does not work in dungeons.');
  if (game.combatUntil > game.time) return audio.sfx('denied'), toast('You cannot go home in the middle of a fight.');
  homeReturn = { id: map.def.id, pos: player.pos.clone(), yaw: player.yaw };
  travel({ to: 'miniland', toPortal: 'exit', bell: true });
}

// ---------------------------------------------------------------- adventurer skills
const isUnlocked = (sk) => game.jobLv >= sk.jobLv;
const alive = () => (map ? map.monsters.filter((m) => m.alive && m.root.visible) : []);
const distTo = (m) => Math.hypot(m.pos.x - player.pos.x, m.pos.z - player.pos.z);
function nearestMonster(maxDist, filter = () => true) {
  let best = null, bd = maxDist;
  for (const m of alive()) {
    const d = distTo(m);
    if (d < bd && filter(m)) { best = m; bd = d; }
  }
  return best;
}
const reachOf = (sk) => (sk.kind === 'ranged' ? sk.range : sk.reach ? sk.reach : sk.dash ? sk.dash : sk.range - 0.7);

function useSkill(i) {
  const sk = SKILLS[i];
  const ch = chars[state.cls];
  if (!sk || ch.busy || player.dash || hero.dead || game.travelling || game.dialog) return;
  if (!isUnlocked(sk)) return audio.sfx('denied'), toast(`${sk.name} unlocks at Job Lv. ${sk.jobLv}`);
  if ((game.cds[sk.id] || 0) > game.time) return;
  if (sk.ammo && game.stones < sk.ammo) return audio.sfx('denied'), toast('Out of stones. Refill at a stone pile.');
  if (hero.mp < sk.mp) return audio.sfx('denied'), toast('Not enough MP. Sit down to recover.');
  if (player.sitting) { player.sitting = false; state.anim = 'idle'; ch.play('idle'); }
  player.target = null;
  if (sk.kind !== 'buff') {
    // NosTale-style targeting: use the selected monster, or pick the closest one
    let tgt = game.target?.alive ? game.target : nearestMonster(sk.kind === 'ranged' ? sk.range + 2 : 9);
    if (tgt) {
      game.target = tgt;
      if (distTo(tgt) > reachOf(sk)) { player.pending = { i, tgt }; return; } // walk into range first
      const d = tgt.pos.clone().sub(player.pos);
      player.yaw = Math.atan2(d.x, d.z);
      ch.root.rotation.y = player.yaw;
    }
  }
  player.pending = null;
  game.cds[sk.id] = game.time + sk.cd;
  if (sk.ammo) game.stones -= sk.ammo;
  hero.mp -= sk.mp;
  game.casting = sk;
  ch.play(sk.anim);
  markAnim();
}

function onCombatEvent(name, ch) {
  if (state.mode !== 'play' || ch !== chars[state.cls] || !map) return;
  const sk = game.casting || SKILLS[0];
  const fwd = new THREE.Vector3(Math.sin(ch.root.rotation.y), 0, Math.cos(ch.root.rotation.y));
  const facing = (m) => { const d = m.pos.clone().sub(player.pos).setY(0); return d.length() < 0.01 ? 1 : d.normalize().dot(fwd); };
  const tgt = game.target?.alive ? game.target : null;
  switch (name) {
    case 'buffAtk': case 'buffDef': {
      const key = name === 'buffAtk' ? 'atk' : 'def';
      game.buffs[key] = game.time + BUFF_TIME;
      toast(key === 'atk' ? 'Attack +30%' : 'Defence +30% · Hit chance +15%');
      break;
    }
    case 'dash': {
      const from = player.pos.clone();
      const aim = tgt && distTo(tgt) < sk.dash ? tgt.pos.clone().setY(0) : null;
      const dir = aim ? aim.clone().sub(from).normalize() : fwd.clone();
      const len = aim ? Math.max(0, from.distanceTo(aim) - 1.3) : 5;
      const to = from.clone();
      for (let k = 0.25; k <= len; k += 0.25) {
        const nx = from.x + dir.x * k, nz = from.z + dir.z * k;
        if (!map.walkable(nx, nz, to.x, to.z)) break;
        to.set(nx, map.heightAt(nx, nz), nz);
      }
      player.dash = { from, to, t: 0, dur: 0.38 };
      break;
    }
    case 'slash': case 'punch': case 'slam': {
      const inReach = (m) => distTo(m) < sk.range + 0.5 && facing(m) > 0.2;
      const m = tgt && inReach(tgt) ? tgt : nearestMonster(sk.range + 0.5, inReach);
      if (m) hitMonster(m, sk, name === 'slam' ? 1.5 : 1, 0);
      break;
    }
    case 'spin': case 'nova':
      for (const m of alive()) if (distTo(m) < sk.range) hitMonster(m, sk, 1, 0);
      break;
    case 'guard':
      game.buffs.def = game.time + BUFF_TIME;
      toast('Defence +30% · Hit chance +15%');
      break;
    case 'arrow': case 'bolt': {
      const ok = (m) => distTo(m) < sk.range + 2 && facing(m) > 0.9;
      const m = tgt && ok(tgt) ? tgt : nearestMonster(sk.range + 2, ok);
      if (m) hitMonster(m, sk, 1, (distTo(m) / (name === 'bolt' ? 9 : 16)) * 1000);
      break;
    }
    case 'volley': {
      // arrows land around the target (or in front of the hero)
      const at = tgt && distTo(tgt) < (sk.reach || 12) ? tgt.pos.clone() : player.pos.clone().addScaledVector(fwd, 4.5);
      for (const m of alive()) if (Math.hypot(m.pos.x - at.x, m.pos.z - at.z) < sk.range) hitMonster(m, sk, 1, 700);
      break;
    }
    case 'stone': case 'ebolt': {
      const ok = (m) => distTo(m) < sk.range + 2 && facing(m) > 0.9;
      const m = tgt && ok(tgt) ? tgt : nearestMonster(sk.range + 2, ok);
      if (m) {
        const speed = name === 'ebolt' ? 9 : sk.id === 'target' ? 20 : 15;
        hitMonster(m, sk, 1, (distTo(m) / speed) * 1000);
      }
      break;
    }
  }
}

function hitMonster(m, sk, extra, delay) {
  setTimeout(() => {
    if (!m.alive || !map.monsters.includes(m)) return;
    const acc = Math.min(1, (sk.acc ?? 0.95) + (game.buffs.def > game.time ? 0.15 : 0));
    if (Math.random() > acc) return audio.sfx('miss'), popDamage(m.pos, m.height, 'MISS');
    const crit = Math.random() < critRate();
    let dmg = heroAtk() * sk.mult * extra * (0.85 + Math.random() * 0.3);
    if (game.buffs.atk > game.time) dmg *= 1.3;
    if (crit) dmg *= critDmg();
    dmg = Math.max(1, Math.round(dmg - m.t.def));
    popDamage(m.pos, m.height, dmg, crit ? 'crit' : sk.magic ? 'magic' : '');
    audio.sfx(crit ? 'crit' : sk.magic ? 'magicHit' : 'hit');
    game.target = m;
    game.combatUntil = game.time + 5;
    if (m.t.static) gainJobXp(m.t.jobXp);
    if (m.damage(dmg)) {
      audio.sfx('pop');
      fx.burst(m.pos.clone().setY(0.6), m.t.color ?? 0xffffff, 18, 3.5, 0.12);
      gainXp(m.t.xp);
      gainJobXp(m.t.jobXp);
      let loot = '';
      const gold = m.t.static ? 0 : m.t.boss ? 300 : Math.round(m.t.lv * 6 * (0.7 + Math.random() * 0.6));
      if (gold) { miniland.addGold(gold); loot += `  +${gold} gold`; }
      if (m.t.boss) {
        game.saat += 3;
        fx.ring(m.pos, 0xffd66b, 5, 0.1, 1.2);
        audio.sfx('jobUp');
        setTimeout(() => toast(`${map.def.name} cleared! +3 Saat`, 5000), 900);
      } else if (!m.t.static && Math.random() < SAAT_DROP) { game.saat++; loot += '  +1 Saat'; }
      toast(`${m.t.name} defeated  +${m.t.xp} XP  +${m.t.jobXp} Job XP${loot}`);
      if (game.target === m) game.target = null;
    }
  }, delay);
}

function monsterAttack(m) {
  if (hero.dead || state.mode !== 'play' || game.shieldUntil > game.time) return;
  game.combatUntil = game.time + 5;
  if (Math.random() < 0.08) return audio.sfx('miss'), popDamage(player.pos, 3.2, 'MISS');
  const dmg = Math.max(1, Math.round(m.t.atk * (0.85 + Math.random() * 0.3) - heroDef()));
  hero.hp -= dmg;
  popDamage(player.pos, 3.2, dmg, 'hurt');
  audio.sfx('hurt');
  const ch = chars[state.cls];
  if (!ch.busy) ch.play('hit');
  if (!game.target?.alive) game.target = m;
  if (hero.hp <= 0) die();
}

function die() {
  audio.sfx('die');
  hero.hp = 0;
  hero.dead = true;
  player.sitting = false;
  player.pending = player.target = null;
  chars[state.cls].play('death');
  setTimeout(() => audio.sfx('thud'), 850);          // hits the ground
  setTimeout(() => { if (hero.dead) openDeath(); }, 1700);
}
const deathEl = $('#death');
function openDeath() { deathEl.hidden = false; updateDeath(); }
function updateDeath() {
  if (deathEl.hidden) return;
  const left = Math.max(0, game.saatReadyAt - game.time);
  const btn = $('#death-saat');
  btn.disabled = left > 0 || game.saat < SAAT_COST;
  $('#death-saat-count').textContent = `${game.saat}`;
  $('#death-saat-note').textContent = left > 0 ? `Saat on cooldown · ${clockText(left)}`
    : game.saat < SAAT_COST ? `You need ${SAAT_COST} Saat, you have ${game.saat}`
    : `Uses ${SAAT_COST} Saat · then ${SAAT_CD / 60} min cooldown`;
}
$('#death-saat').onclick = () => {
  if (!hero.dead || game.saat < SAAT_COST || game.saatReadyAt > game.time) return;
  game.saat -= SAAT_COST;
  game.saatReadyAt = game.time + SAAT_CD;
  deathEl.hidden = true;
  hero.dead = false;
  hero.hp = Math.round(maxHp() * 0.5);
  hero.mp = Math.round(maxMp() * 0.5);
  game.shieldUntil = game.time + 2.5;           // a moment to get up before monsters hit again
  const ch = chars[state.cls];
  ch.play('victory');
  fx.ring(ch.root.position, 0x9be86a, 3.2, 0.08, 0.9);
  fx.burst(ch.root.position.clone().setY(1.5), 0xc8f59a, 34, 4.5, 0.14, 2.5);
  audio.sfx('levelUp');
  toast(`Revived with Saat · 50% HP and MP · ${game.saat} Saat left`, 3000);
};
$('#death-return').onclick = () => { deathEl.hidden = true; returnToVillage(); };
function returnToVillage() {
  toast('Returning to Mossvale Village…');
  setTimeout(() => {
    $('#fade').classList.add('on');
    setTimeout(() => {
      enterMap(START_MAP, null);
      hero.dead = false;
      chars[state.cls].play('idle');                   // get up again
      state.anim = 'idle';
      hero.hp = Math.round(maxHp() * 0.6);
      hero.mp = Math.round(maxMp() * 0.6);
      for (const m of Object.values(maps).flatMap((mp) => mp.monsters)) if (m.state === 'chase' || m.state === 'attack') { m.state = 'return'; m.provoked = false; }
      $('#fade').classList.remove('on');
    }, 400);
  }, 300);
}

function gainXp(n) {
  if (hero.lv >= MAX_LEVEL) return;
  hero.xp += n;
  while (hero.lv < MAX_LEVEL && hero.xp >= xpNeeded(hero.lv)) {
    hero.xp -= xpNeeded(hero.lv);
    hero.lv++;
    hero.hp = maxHp();
    hero.mp = maxMp();
    const ch = chars[state.cls];
    fx.ring(ch.root.position, 0xffffff, 3.4, 0.08, 0.9);
    fx.burst(ch.root.position.clone().setY(1.5), 0xfff2c0, 30, 4.5, 0.14, 2.5);
    audio.sfx('levelUp');
    setTimeout(() => toast(`Level ${hero.lv}! HP and MP restored.`), 400);
  }
  if (hero.lv >= MAX_LEVEL) hero.xp = 0;
}
function gainJobXp(n) {
  if (game.jobLv >= maxJob()) return;
  game.jobXp += n;
  while (game.jobLv < maxJob() && game.jobXp >= jobXpNeeded(game.jobLv)) {
    game.jobXp -= jobXpNeeded(game.jobLv);
    setJobLv(game.jobLv + 1);
  }
}
function setJobLv(lv) {
  const before = game.jobLv;
  game.jobLv = lv;
  if (lv >= maxJob()) game.jobXp = 0;
  const fresh = SKILLS.filter((sk) => sk.jobLv > before && sk.jobLv <= lv).map((sk) => sk.name);
  const ch = chars[state.cls];
  fx.ring(ch.root.position, 0xffd66b, 3, 0.08, 0.8);
  fx.burst(ch.root.position.clone().setY(1.5), 0xffd66b, 26, 4, 0.13, 2);
  audio.sfx('jobUp');
  const ready = game.heroClass === 'adventurer' && lv >= CLASS_CHANGE_JOB;
  toast(`Job Lv. ${lv}!${fresh.length ? ` New skill: ${fresh.join(', ')}` : ''}${ready ? ' Visit the Class Master in Mossvale to choose your class!' : ''}`, ready ? 5000 : 2200);
}

// ---------------------------------------------------------------- HUD (play mode)
function drawIcon(sk) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  const [a, b] = sk.icon;
  g.fillStyle = b; g.fillRect(0, 0, 16, 16);
  g.fillStyle = a; g.fillRect(1, 1, 14, 14);
  g.fillStyle = b;
  const px = (pts) => pts.forEach(([x, y]) => g.fillRect(x, y, 1, 1));
  const line = (x0, y0, x1, y1, w = 1) => { for (let i = 0; i <= 20; i++) g.fillRect(Math.round(x0 + (x1 - x0) * i / 20), Math.round(y0 + (y1 - y0) * i / 20), w, w); };
  g.fillStyle = '#fff8e8';
  switch (sk.id) {
    case 'swing': line(4, 12, 11, 5, 2); g.fillStyle = b; line(3, 10, 6, 13); break;
    case 'strong': line(3, 12, 11, 4, 3); g.fillStyle = b; px([[12, 3], [13, 2]]); break;
    case 'slingshot': case 'target':
      g.fillStyle = b; line(8, 13, 8, 8, 2); line(8, 8, 4, 4); line(8, 8, 12, 4);
      g.fillStyle = '#fff8e8'; g.fillRect(7, 3, 3, 3);
      if (sk.id === 'target') { g.strokeStyle = '#7a1e18'; g.strokeRect(2.5, 2.5, 11, 11); }
      break;
    case 'energy': line(10, 2, 5, 9, 2); line(5, 8, 11, 8, 2); line(11, 8, 6, 14, 2); break;
    case 'spin': g.strokeStyle = '#fff8e8'; g.lineWidth = 2; g.beginPath(); g.arc(8, 8, 5, 0.3, 5.6); g.stroke(); g.fillRect(12, 2, 2, 4); break;
    case 'combat': case 'morale': line(8, 3, 8, 13, 2); line(8, 3, 4, 7, 2); line(8, 3, 12, 7, 2); break;
    case 'beatup': [3, 7, 11].forEach((x) => line(x, 12, x + 2, 4, 1)); break;
    case 'charge': [2, 7].forEach((x) => { line(x, 3, x + 5, 8, 2); line(x + 5, 8, x, 13, 2); }); break;
    case 'k_slash': line(4, 12, 12, 4, 2); g.fillStyle = '#d1a646'; line(3, 10, 6, 13, 1); break;
    case 'k_guard': g.fillRect(4, 3, 8, 7); line(4, 10, 8, 14, 2); line(12, 10, 8, 14, 2); g.fillStyle = '#d1a646'; g.fillRect(7, 4, 2, 7); break;
    case 'r_shot': line(3, 13, 13, 3, 1); g.fillRect(11, 3, 3, 1); g.fillRect(13, 3, 1, 3); line(3, 11, 5, 13, 1); break;
    case 'r_rain': [3, 7, 11].forEach((x) => { line(x, 2, x, 11, 1); g.fillRect(x - 1, 11, 3, 2); }); break;
    case 'm_bolt': line(8, 2, 13, 8, 2); line(13, 8, 8, 14, 2); line(8, 14, 3, 8, 2); line(3, 8, 8, 2, 2); break;
    case 'm_nova': g.strokeStyle = '#fff8e8'; g.lineWidth = 2; g.beginPath(); g.arc(8, 8, 5.5, 0, 6.3); g.stroke(); g.fillRect(7, 7, 2, 2); break;
  }
  return c.toDataURL();
}

const hud = $('#hud');
const slotsEl = $('#slots');
let slotEls = [];
function buildSlots() {
  slotsEl.innerHTML = '';
  slotEls = SKILLS.map((sk, i) => {
    const el = document.createElement('button');
    el.className = 'slot';
    el.innerHTML = `<img src="${drawIcon(sk)}" alt=""><kbd>${i === 9 ? 0 : i + 1}</kbd><span class="cd"></span><span class="lk">Job ${sk.jobLv}</span>${sk.ammo ? '<span class="ammo"></span>' : ''}`;
    el.title = `${sk.name} (Job Lv. ${sk.jobLv})\n${sk.desc}\nMP ${sk.mp} · Cooldown ${sk.cd}s`;
    el.onclick = () => useSkill(i);
    slotsEl.appendChild(el);
    return el;
  });
}
buildSlots();
$('#job-test').onclick = () => { if (game.jobLv < maxJob()) setJobLv(maxJob()); };

const pct = (a, b) => `${Math.max(0, Math.min(100, (a / b) * 100))}%`;
function updateHud() {
  $('#job-lv').textContent = `Job Lv. ${game.jobLv}`;
  const need = jobXpNeeded(game.jobLv);
  const full = game.jobLv >= maxJob();
  $('#job-fill').style.width = full ? '100%' : pct(game.jobXp, need);
  $('#job-xp').textContent = full ? (game.heroClass === 'adventurer' ? 'MAX · see the Class Master' : 'MAX') : `${game.jobXp} / ${need}`;
  SKILLS.forEach((sk, i) => {
    const el = slotEls[i];
    el.classList.toggle('locked', !isUnlocked(sk));
    el.classList.toggle('nomp', hero.mp < sk.mp);
    const left = Math.max(0, (game.cds[sk.id] || 0) - game.time);
    el.querySelector('.cd').style.height = `${(left / sk.cd) * 100}%`;
    if (sk.ammo) el.querySelector('.ammo').textContent = game.stones;
  });
  const b = [];
  if (game.buffs.atk > game.time) b.push(`<span class="buff atk">Combat ${Math.ceil(game.buffs.atk - game.time)}s</span>`);
  if (game.buffs.def > game.time) b.push(`<span class="buff def">Morale ${Math.ceil(game.buffs.def - game.time)}s</span>`);
  if (SKILLS.some((sk) => sk.ammo)) b.push(`<span class="buff stones">Stones ${game.stones}</span>`);
  const saatCd = Math.max(0, game.saatReadyAt - game.time);
  b.push(`<span class="buff gold" title="Gold: buy and repair Miniland structures">Gold ${miniland.state.gold}</span>`);
  b.push(`<span class="buff saat" title="Saat: ${SAAT_COST} revive you where you fall with 50% HP and MP">Saat ${game.saat}${saatCd > 0 ? ` · ${clockText(saatCd)}` : ''}</span>`);
  updateDeath();
  const html = b.join('');
  if ($('#buffs').innerHTML !== html) $('#buffs').innerHTML = html;

  // player frame
  $('#pf-lv').textContent = `Lv. ${hero.lv}${hero.lv >= MAX_LEVEL ? ' (max)' : ''}`;
  $('#pf-hp').style.width = pct(hero.hp, maxHp());
  $('#pf-mp').style.width = pct(hero.mp, maxMp());
  $('#pf-xp').style.width = pct(hero.xp, xpNeeded(hero.lv));
  $('#pf-hpt').textContent = `${Math.ceil(hero.hp)} / ${maxHp()}`;
  $('#pf-mpt').textContent = `${Math.floor(hero.mp)} / ${maxMp()}`;
  $('#pf-crit').textContent = `Crit ${Math.round(critRate() * 100)}% · Crit DMG ${Math.round(critDmg() * 100)}%`;
  // target frame
  const t = game.target;
  const tf = $('#tframe');
  tf.hidden = !(t && t.alive);
  if (t && t.alive) {
    $('#tf-name').textContent = `Lv. ${t.t.lv} ${t.t.name}`;
    $('#tf-hp').style.width = t.t.static ? '100%' : pct(t.hp, t.maxHp);
  }
}

// minimap: the map's tile image plus live dots
const mini = $('#minimap'), mctx = mini.getContext('2d');
function drawMinimap() {
  if (!map) return;
  const w = mini.width, h = mini.height;
  const sx = w / map.W, sz = h / map.D;
  const X = (x) => (x + map.W / 2) * sx, Z = (z) => (z + map.D / 2) * sz;
  mctx.imageSmoothingEnabled = false;
  mctx.clearRect(0, 0, w, h);
  mctx.drawImage(map.minimap, 0, 0, w, h);
  mctx.fillStyle = '#8ae0ff';
  for (const p of map.portals) mctx.fillRect(X(p.pos.x) - 4, Z(p.pos.z) - 4, 8, 8);
  mctx.fillStyle = '#ffd24a';
  for (const n of map.npcs) mctx.fillRect(X(n.pos.x) - 2, Z(n.pos.z) - 2, 5, 5);
  for (const m of map.monsters) {
    if (!m.alive) continue;
    mctx.fillStyle = m === game.target ? '#ffffff' : m.t.static ? '#c8b070' : '#e8483a';
    mctx.fillRect(X(m.pos.x) - 2, Z(m.pos.z) - 2, 4, 4);
  }
  const px = X(player.pos.x), pz = Z(player.pos.z);
  mctx.save();
  mctx.translate(px, pz);
  mctx.rotate(-chars[state.cls].root.rotation.y + Math.PI);
  mctx.fillStyle = '#fff';
  mctx.strokeStyle = '#000';
  mctx.beginPath(); mctx.moveTo(0, -6); mctx.lineTo(4.5, 5); mctx.lineTo(-4.5, 5); mctx.closePath();
  mctx.fill(); mctx.stroke();
  mctx.restore();
}

// floating labels: monster name plates, NPC names, portal destinations
function plate(obj, cls, html) {
  if (!obj.plate) {
    obj.plate = document.createElement('div');
    obj.plate.className = cls;
    obj.plate.innerHTML = html;
  }
  if (!obj.plate.isConnected) labels.appendChild(obj.plate);
  return obj.plate;
}
function place(el, pos, y) {
  tmp.copy(pos).setY(pos.y + y).project(camera);
  const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
  el.style.display = vis ? '' : 'none';
  if (vis) {
    el.style.left = `${(tmp.x * 0.5 + 0.5) * innerWidth}px`;
    el.style.top = `${(-tmp.y * 0.5 + 0.5) * innerHeight}px`;
  }
}
function updateLabels() {
  for (const m of map.monsters) {
    const el = plate(m, m.t.boss ? 'mob boss' : 'mob', `<span class="alert">!</span><b>${m.t.boss ? '<em>BOSS</em> ' : ''}Lv.${m.t.lv} ${m.t.name}</b><i><u></u></i>`);
    const near = m.alive && distTo(m) < (m.t.boss ? 30 : 20);
    if (!near) { el.style.display = 'none'; continue; }
    el.classList.toggle('sel', m === game.target);
    el.classList.toggle('alerted', m.alert > 0);
    el.classList.toggle('hurt', !m.t.static && m.hp < m.maxHp);
    el.lastChild.firstChild.style.width = pct(m.hp, m.maxHp);
    place(el, m.pos, m.height + 0.5);
  }
  for (const n of map.npcs) place(plate(n, 'npcname', `<small>NPC</small>${n.name}`), n.pos, 3.9);
  miniland.update();
  for (const p of map.portals) {
    const el = plate(p, 'portalname', '');
    const dest = `→ ${p.to === 'back' ? MAPS[homeReturn?.id ?? START_MAP].name : MAPS[p.to].name}`;
    if (el.textContent !== dest) el.textContent = dest;
    if (p.pos.distanceTo(player.pos) > 16) el.style.display = 'none';
    else place(el, p.pos, 7.6);
  }
}

// ---------------------------------------------------------------- class change (Class Master, Job Lv. 20)
const pickEl = $('#classpick');
function openClassPick() {
  game.dialog = true;
  $('#toast').hidden = true;
  const names = { hp: 'HP', mp: 'MP', atk: 'ATK', def: 'DEF', spd: 'SPD' };
  $('#cp-cards').innerHTML = CLASS_CHOICES.map((id) => {
    const c = CLASSES[id];
    return `<div class="cp-card" style="--c:${c.accent}"><img src="${thumbs[id]}" alt=""><b>${c.name}</b><small>${c.role}</small><p>${c.desc}</p>
      <div class="cp-stats">${Object.entries(c.stats).map(([k, v]) => `<div class="stat"><span>${names[k]}</span><div class="bar">${[1, 2, 3, 4, 5].map((n) => `<i class="${n <= v ? 'f' : ''}"></i>`).join('')}</div></div>`).join('')}</div>
      <div class="cp-crit">Crit ${c.crit.rate}% · Crit DMG ${c.crit.dmg}%</div>
      <button data-cls="${id}">Become a ${c.name}</button></div>`;
  }).join('');
  pickEl.querySelectorAll('button[data-cls]').forEach((b) => (b.onclick = () => {
    if (!b.classList.contains('confirm')) {
      pickEl.querySelectorAll('button[data-cls]').forEach((o) => { o.classList.remove('confirm'); o.textContent = `Become a ${CLASSES[o.dataset.cls].name}`; });
      b.classList.add('confirm');
      b.textContent = 'Tap again to confirm (final)';
      audio.sfx('click');
      return;
    }
    closeClassPick();
    changeClass(b.dataset.cls);
  }));
  pickEl.hidden = false;
}
function closeClassPick() { pickEl.hidden = true; game.dialog = false; }
$('#cp-close').onclick = closeClassPick;

function changeClass(id) {
  game.heroClass = id;
  SKILLS = CLASS_SKILLS[id];
  game.jobLv = 1;
  game.jobXp = 0;
  game.cds = {};
  game.casting = null;
  buildSlots();
  selectClass(id, true);
  hero.hp = maxHp();
  hero.mp = maxMp();
  const ch = chars[id];
  ch.root.position.copy(player.pos);
  ch.play('victory');
  const col = parseInt(CLASSES[id].accent.slice(1), 16);
  fx.ring(player.pos, col, 4, 0.08, 1.1);
  fx.ring(player.pos, 0xffffff, 3, 0.1, 0.8);
  fx.burst(player.pos.clone().setY(player.pos.y + 1.6), col, 40, 5, 0.15, 3);
  audio.sfx('levelUp');
  renderInfo();
  toast(`You are now a ${CLASSES[id].name}! Your Job Level starts again at 1.`, 5000);
}

// ---------------------------------------------------------------- input: click / tap the world
const ray = new THREE.Raycaster();
let downAt = null;
// two-finger pinch zooms the play camera
const touches = new Map();
let pinch = 0;
canvas.addEventListener('pointerdown', (e) => {
  downAt = [e.clientX, e.clientY];
  touches.set(e.pointerId, [e.clientX, e.clientY]);
  if (touches.size > 1) downAt = null;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointermove', (e) => {
  if (!touches.has(e.pointerId)) return;
  const prev = touches.get(e.pointerId);
  touches.set(e.pointerId, [e.clientX, e.clientY]);
  if (state.mode !== 'play') return;
  if (touches.size === 1) {
    // drag (any button, or one finger) orbits the camera 360°
    if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 8) return;
    downAt = null;
    if (state.camMode === 'classic') return;
    state.cam.yaw -= (e.clientX - prev[0]) * 0.008;
    state.cam.pitch = Math.min(1.35, Math.max(0.28, state.cam.pitch + (e.clientY - prev[1]) * 0.005));
    return;
  }
  if (touches.size !== 2) return;
  const [a, b] = [...touches.values()];
  const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
  if (pinch) state.cam.dist = Math.min(34, Math.max(8, state.cam.dist * (pinch / d)));
  pinch = d;
});
const endTouch = (e) => { touches.delete(e.pointerId); if (touches.size < 2) pinch = 0; };
canvas.addEventListener('pointercancel', endTouch);
canvas.addEventListener('pointerup', (e) => {
  endTouch(e);
  if (state.mode !== 'play' || !downAt || hero.dead || !map) return;
  if (Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 10) return;
  const r = canvas.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  if (miniland.active) {
    const mhit = ray.intersectObjects(miniland.pickables(), true)[0];
    const ground = ray.intersectObjects(map.terrain, false)[0];
    if (miniland.click(mhit?.object, ground?.point)) return;
  }
  // monsters and NPCs first
  const pickables = [...alive().map((m) => m.root), ...map.npcs.map((n) => n.ch.root)];
  const hits = ray.intersectObjects(pickables, true);
  const obj = hits[0]?.object;
  if (obj?.userData.monster) {
    const m = obj.userData.monster;
    game.target = m;
    useSkill(0); // click a monster: attack it (walks there first when needed)
    return;
  }
  if (obj?.userData.npc) return talk(obj.userData.npc);
  const ground = ray.intersectObjects(map.terrain, false)[0];
  if (ground) {
    const hit = ground.point;
    player.target = hit;
    player.pending = null;
    player.sitting = false;
    fx.ring(hit, 0xffffff, 0.8, 0.06, 0.4);
  }
});
canvas.addEventListener('wheel', (e) => {
  if (state.mode !== 'play') return;
  state.cam.dist = Math.min(34, Math.max(8, state.cam.dist * (e.deltaY > 0 ? 1.1 : 0.9)));
}, { passive: true });

function talk(npc) {
  if (npc.pos.distanceTo(player.pos) > 6) {
    player.target = npc.pos.clone().add(player.pos.clone().sub(npc.pos).setY(0).normalize().multiplyScalar(1.6));
    return;
  }
  const d = player.pos.clone().sub(npc.pos);
  npc.ch.root.rotation.y = Math.atan2(d.x, d.z);
  npc.ch.play('wave');
  audio.sfx('talk');
  if (npc.classMaster) {
    if (game.heroClass !== 'adventurer') return toast(`${npc.name}: “You walk the path of the ${CLASSES[game.heroClass].name}. Your training continues.”`, 5000);
    if (game.jobLv < CLASS_CHANGE_JOB) return toast(`${npc.name}: “Come back when your Job Level is ${CLASS_CHANGE_JOB}. You are Job Lv. ${game.jobLv}.”`, 5000);
    return openClassPick();
  }
  toast(`${npc.name}: “${npc.line}”`, 5000);
}

// virtual joystick (touch play mode)
const stick = { x: 0, y: 0, id: null };
const stickEl = $('#stick'), knob = stickEl.querySelector('.knob');
function moveStick(e) {
  const r = stickEl.getBoundingClientRect();
  const R = r.width / 2;
  let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
  const len = Math.hypot(dx, dy);
  if (len > R) { dx *= R / len; dy *= R / len; }
  stick.x = dx / R; stick.y = dy / R;
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
}
stickEl.addEventListener('pointerdown', (e) => { stick.id = e.pointerId; stickEl.setPointerCapture(e.pointerId); moveStick(e); });
stickEl.addEventListener('pointermove', (e) => { if (e.pointerId === stick.id) moveStick(e); });
const releaseStick = (e) => { if (e.pointerId !== stick.id) return; stick.id = null; stick.x = stick.y = 0; knob.style.transform = ''; };
stickEl.addEventListener('pointerup', releaseStick);
stickEl.addEventListener('pointercancel', releaseStick);
document.querySelectorAll('#emotes button').forEach((b) => (b.onclick = () => {
  if (b.dataset.emote === 'cam') return toggleCam();
  if (b.dataset.emote === 'miniland') return goToMiniland();
  if (b.dataset.emote === 'sprint') { state.sprint = !state.sprint; b.classList.toggle('on', state.sprint); return; }
  if (b.dataset.emote === 'sit') { if (state.anim === 'sit') playAnim('idle'); else playAnim('sit'); }
  else action(b.dataset.emote);
}));
$('#tframe').onclick = () => (game.target = null);
// phones: ask to play in landscape. Android can switch by itself (fullscreen + orientation
// lock); iPhone browsers don't allow that, so the prompt explains how to rotate instead.
let keepVertical = false;
try { keepVertical = sessionStorage.getItem('vq-vertical') === '1'; } catch { /* ignore */ }
const portraitQuery = matchMedia('(orientation: portrait)');
function updatePortraitAsk() { document.body.classList.toggle('portrait-ask', TOUCH && portraitQuery.matches && !keepVertical); }
portraitQuery.addEventListener?.('change', () => { updatePortraitAsk(); resize(); });
updatePortraitAsk();
$('#rotate-go').onclick = async () => {
  audio.unlock();
  try {
    await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
    await screen.orientation?.lock?.('landscape');
  } catch {
    toast('Rotate your phone sideways (turn off rotation lock if it stays vertical).', 4000);
  }
};
$('#rotate-stay').onclick = () => {
  keepVertical = true;
  try { sessionStorage.setItem('vq-vertical', '1'); } catch { /* ignore */ }
  updatePortraitAsk();
};

// camera view toggle: NosTale-style fixed view ↔ free 360°
state.camYawGoal = state.cam.yaw = Math.PI / 4;
function toggleCam() {
  state.camMode = state.camMode === 'classic' ? 'free' : 'classic';
  if (state.camMode === 'classic') state.camYawGoal = Math.round((state.cam.yaw - Math.PI / 4) / (Math.PI / 2)) * (Math.PI / 2) + Math.PI / 4;
  $('#cam-btn').textContent = state.camMode === 'classic' ? 'View: Classic' : 'View: 360°';
  resize();
  toast(state.camMode === 'classic' ? 'Classic view (Q / E turn 90°)' : 'Free 360° view (drag or Q / E to turn)');
}
$('#cam-btn').onclick = toggleCam;

// audio can only start after the player interacts with the page
for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, audio.unlock, { capture: true, passive: true });
const musicBtn = $('#snd-music'), sfxBtn = $('#snd-sfx');
const markAudio = () => { musicBtn.classList.toggle('on', audio.audioSettings.music); sfxBtn.classList.toggle('on', audio.audioSettings.sfx); };
musicBtn.onclick = () => { audio.unlock(); audio.setMusic(!audio.audioSettings.music); markAudio(); };
sfxBtn.onclick = () => { audio.unlock(); audio.setSfx(!audio.audioSettings.sfx); markAudio(); audio.sfx('click'); };
markAudio();
// stop iOS Safari from zooming the page on pinch / double tap
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

// ---------------------------------------------------------------- per-frame play update
function tryMove(dx, dz) {
  const { x, z } = player.pos;
  const nx = x + dx, nz = z + dz;
  if (map.walkable(nx, nz, x, z)) { player.pos.x = nx; player.pos.z = nz; return true; }
  if (map.walkable(nx, z, x, z)) { player.pos.x = nx; return true; }
  if (map.walkable(x, nz, x, z)) { player.pos.z = nz; return true; }
  return false;
}

function updatePlayer(dt) {
  const ch = chars[state.cls];
  const move = new THREE.Vector3();
  if (!hero.dead && !game.dialog) {
    if (keys.has('w') || keys.has('arrowup')) move.z -= 1;
    if (keys.has('s') || keys.has('arrowdown')) move.z += 1;
    if (keys.has('a') || keys.has('arrowleft')) move.x -= 1;
    if (keys.has('d') || keys.has('arrowright')) move.x += 1;
  }
  const stickMag = hero.dead ? 0 : Math.hypot(stick.x, stick.y);
  if (stickMag > 0.18) { move.x += stick.x; move.z += stick.y; }
  if (state.camMode === 'free') {
    if (keys.has('q')) state.cam.yaw += dt * 2.2;
    if (keys.has('e')) state.cam.yaw -= dt * 2.2;
  } else {
    // classic view turns in smooth 90° steps
    state.cam.yaw += (state.camYawGoal - state.cam.yaw) * Math.min(1, dt * 8);
  }
  // input is relative to where the camera looks
  if (move.lengthSq() > 0) {
    const cy = Math.cos(state.cam.yaw), sy = Math.sin(state.cam.yaw);
    move.set(move.x * cy + move.z * sy, 0, move.z * cy - move.x * sy);
  }
  if (move.lengthSq() > 0) { player.target = null; player.pending = null; }
  else if (player.pending) {
    // walking toward a monster to use a skill on it
    const { i, tgt } = player.pending;
    if (!tgt.alive) player.pending = null;
    else if (distTo(tgt) <= reachOf(SKILLS[i])) { player.pending = null; useSkill(i); }
    else move.copy(tgt.pos).sub(player.pos).setY(0);
  } else if (player.target) {
    move.copy(player.target).sub(player.pos).setY(0);
    if (move.length() < 0.15) { player.target = null; move.set(0, 0, 0); }
  }
  const walking = stickMag > 0.18 && stickMag < 0.6;
  const sprinting = !walking && (keys.has('shift') || state.sprint);
  let loco = 'idle';
  if (player.dash) {
    const ds = player.dash;
    ds.t += dt;
    const k = Math.min(1, ds.t / ds.dur);
    player.pos.lerpVectors(ds.from, ds.to, k * (2 - k));
    if (k >= 1) player.dash = null;
    move.set(0, 0, 0);
  }
  if (move.lengthSq() > 0 && !ch.busy && !hero.dead) {
    move.normalize();
    player.sitting = false;
    const speed = (walking ? 2.3 : sprinting ? 8.6 : 5.2) * (0.85 + CLASSES[state.cls].stats.spd * 0.05);
    if (!tryMove(move.x * speed * dt, move.z * speed * dt)) player.target = null;
    player.yaw = Math.atan2(move.x, move.z);
    loco = walking ? 'walk' : sprinting ? 'sprint' : 'run';
    // footsteps, sounding like the ground under the hero
    game.stepDist = (game.stepDist || 0) + speed * dt;
    if (game.stepDist > (walking ? 1.0 : sprinting ? 1.7 : 1.35)) { game.stepDist = 0; audio.sfx('step', map.surfaceAt(player.pos.x, player.pos.z)); }
    if (sprinting && (game.dustIn = (game.dustIn || 0) - dt) < 0) {
      game.dustIn = 0.12;
      fx.burst(player.pos.clone().setY(player.pos.y + 0.1), 0xd8c8a0, 3, 1.2, 0.09, 0.6);
    }
  }
  if (player.sitting) loco = 'sit';
  if (!hero.dead && loco !== state.anim) { state.anim = loco; ch.play(loco); markAnim(); }

  // follow the terrain
  if (!player.dash) player.pos.y += (map.heightAt(player.pos.x, player.pos.z) - player.pos.y) * Math.min(1, dt * 16);
  // portals
  if (!hero.dead && !game.travelling) for (const p of map.portals) if (Math.hypot(p.pos.x - player.pos.x, p.pos.z - player.pos.z) < 1.6) travel(p);

  // stones, regeneration and buff auras
  if (map.stonePile && SKILLS.some((sk) => sk.ammo) && game.stones < MAX_STONES && player.pos.distanceTo(map.stonePile.position) < 1.8) {
    game.stones = MAX_STONES;
    audio.sfx('stones');
    toast(`Picked up stones (${MAX_STONES})`);
  }
  if (!hero.dead) {
    const resting = player.sitting ? 6 : game.time > game.combatUntil ? 1 : 0.3;
    hero.hp = Math.min(maxHp(), hero.hp + maxHp() * 0.008 * resting * dt);
    hero.mp = Math.min(maxMp(), hero.mp + maxMp() * 0.012 * resting * dt);
  }
  if ((game.auraIn -= dt) < 0) {
    game.auraIn = 0.25;
    if (game.buffs.atk > game.time) fx.aura(ch, 0xff6a4a, 2);
    if (game.buffs.def > game.time) fx.aura(ch, 0x6aa8ff, 2);
  }

  let dy = player.yaw - ch.root.rotation.y;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  ch.root.rotation.y += dy * Math.min(1, dt * 14);
  ch.root.position.copy(player.pos);

  camera.position.lerp(player.pos.clone().add(camOffset()), Math.min(1, dt * 8));
  camera.lookAt(player.pos.x, player.pos.y + 1.4, player.pos.z);
  sun.position.copy(player.pos).add(new THREE.Vector3(18, 34, 14));
  sun.target.position.copy(player.pos);

  // the dachshund trots after the hero and stays a little to the side, or lives in the Miniland
  const petHome = miniland.state.petHome;
  pet.root.visible = !petHome || !!map.def.miniland;
  if (petHome && map.def.miniland) {
    if (!petState.goal || (petState.wander -= dt) < 0) {
      petState.goal = new THREE.Vector3((Math.random() - 0.5) * 16, 0, (Math.random() - 0.5) * 16);
      petState.wander = 3 + Math.random() * 4;
    }
    const to = petState.goal.clone().sub(pet.root.position).setY(0), d = to.length();
    let v = 0;
    if (d > 0.4) {
      v = 2.4;
      pet.root.position.addScaledVector(to.normalize(), Math.min(d, v * dt));
      pet.root.rotation.y += Math.atan2(Math.sin(Math.atan2(to.x, to.z) - pet.root.rotation.y), Math.cos(Math.atan2(to.x, to.z) - pet.root.rotation.y)) * Math.min(1, dt * 6);
    }
    pet.root.position.y += (map.heightAt(pet.root.position.x, pet.root.position.z) - pet.root.position.y) * Math.min(1, dt * 14);
    petState.vel = v;
  } else {
    const to = player.pos.clone().sub(pet.root.position).setY(0);
    const d = to.length();
    let v = 0;
    if (d > 2.2) {
      v = Math.min(9.5, d * 2.4);
      const stepLen = Math.min(d - 1.8, v * dt);
      pet.root.position.addScaledVector(to.normalize(), stepLen);
      pet.root.rotation.y += Math.atan2(Math.sin(Math.atan2(to.x, to.z) - pet.root.rotation.y), Math.cos(Math.atan2(to.x, to.z) - pet.root.rotation.y)) * Math.min(1, dt * 10);
    }
    if (d > 25) pet.root.position.copy(player.pos).add(new THREE.Vector3(1.2, 0, -0.8)); // catch up after a dash or respawn
    pet.root.position.y += (map.heightAt(pet.root.position.x, pet.root.position.z) - pet.root.position.y) * Math.min(1, dt * 14);
    petState.vel = v;
  }
  // the world around the player
  const ctx = {
    dt, player: player.pos, playerAlive: !hero.dead, safe: !!map.def.safe,
    walkable: map.walkable, heightAt: map.heightAt, attack: monsterAttack, respawnPoint: map.randomSpawn,
    onNotice: () => audio.sfx('alert'),
  };
  for (const m of map.monsters) m.update(ctx);
  for (const n of map.npcs) n.ch.update(dt);
  map.update(game.time, dt);
  if (game.target && !game.target.alive) game.target = null;
}

function popDamage(pos, height, n, kind = '') {
  const p = pos.clone().setY(pos.y + height + 0.3).project(camera);
  const el = document.createElement('div');
  el.className = `dmg ${kind}${n === 'MISS' ? ' miss' : ''}`;
  el.textContent = kind === 'crit' ? `${n}!` : n;
  if (kind === 'crit') el.dataset.label = 'CRITICAL';
  el.style.left = `${(p.x * 0.5 + 0.5) * innerWidth + (Math.random() - 0.5) * 40}px`;
  el.style.top = `${(-p.y * 0.5 + 0.5) * innerHeight}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

// ---------------------------------------------------------------- loop
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(state.pixel ? Math.max(0.15, 240 / Math.min(w, h)) : Math.min(devicePixelRatio, TOUCH ? 1.5 : 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // widen the view in portrait so the whole character and more of the world fit
  const base = state.mode === 'play' ? (state.camMode === 'classic' ? 30 : 40) : 30;
  camera.fov = w < h ? Math.min(65, base / Math.max(0.5, w / h) * 0.8) : base;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
let miniIn = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  game.time += dt;
  if (state.mode === 'play' && map) {
    updatePlayer(dt);
    updateHud();
    if ((miniIn -= dt) < 0) { miniIn = 0.1; drawMinimap(); }
  } else {
    for (const ch of activeChars()) {
      if (state.turntable) ch.root.rotation.y += dt * 0.7;
      else {
        let dy = state.view - ch.root.rotation.y;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        ch.root.rotation.y += dy * Math.min(1, dt * 6);
      }
    }
    controls.update();
  }
  for (const ch of activeChars()) ch.update(dt);
  pet.update(dt, state.mode === 'play' ? petState.vel : 0);
  fx.update(dt);

  if (state.mode === 'lineup') {
    for (const el of labels.children) {
      tmp.copy(chars[el.dataset.id].root.position).setY(4.1).project(camera);
      el.style.left = `${(tmp.x * 0.5 + 0.5) * innerWidth}px`;
      el.style.top = `${(-tmp.y * 0.5 + 0.5) * innerHeight}px`;
    }
  } else if (state.mode === 'play' && map) {
    camera.updateMatrixWorld();
    SEE_THROUGH.uCam.value.copy(camera.position);
    SEE_THROUGH.uHero.value.set(player.pos.x, player.pos.y + 1.3, player.pos.z);
    const tag = document.getElementById('nametag');
    const html = `<small>Lv.${hero.lv} ${CLASSES[state.cls].name} · Job ${game.jobLv}</small>${hero.name}`;
    if (tag.innerHTML !== html) tag.innerHTML = html;
    place(tag, player.pos, 4.1);
    updateLabels();
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

resize();
renderInfo();
markAnim();
for (const ch of Object.values(chars)) ch.root.rotation.y = state.view;
setMode('play');
requestAnimationFrame(frame);
$('#loading').classList.add('done');

// handy for debugging from the console
Object.assign(window, { changeClass, openClassPick, chars, state, setMode, selectClass, playAnim, game, player, hero, useSkill, enterMap, maps, getMap: () => map });

// test hook, only with ?debug in the URL: lets automated checks jump between maps and trigger events
if (new URLSearchParams(location.search).has('debug')) window.voxelQuest = { game, hero, player, state, enterMap, die, miniland, get map() { return map; }, maps };
