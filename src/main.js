import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { Character, ANIM_NAMES, setWireframe } from './character.js';
import { makeCharacter } from './model-character.js';
import { createMiniland } from './miniland.js';
import { CLASSES, CLASS_ORDER, CLASS_CHANGE_LEVEL, CLASS_CHOICES } from './classes.js';
import { Effects } from './effects.js';
import { buildMap } from './world.js';
import { SEE_THROUGH, PROP_MAT } from './voxel.js';
import { prop } from './props.js';
import { TIMESPACES, chamberId, rankFor } from './timespace.js';
import { createSkillTree } from './skilltree.js';
import { MAPS, START_MAP } from './maps.js';
import * as audio from './audio.js';
import { Dachshund } from './pet.js';
import { CompanionEntity, MAX_MATES, mateXpNeeded } from './companions.js';
import { createTutorial } from './tutorial.js';
import { createQuests } from './quests.js';
import { createAnimePass, createPetals } from './anime.js';
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
// anime look: ink outlines + colour pass over the whole picture, cherry petals outdoors
const anime = createAnimePass(renderer, { samples: TOUCH ? 0 : 4 });
const petals = createPetals(TOUCH ? 90 : 160);
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
scene.add(petals.points);

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
  saat: 5, saatReadyAt: 0, shieldUntil: 0,
  aa: false,                                  // auto-attack: keeps using the basic attack on the target
  bar: ['sit', 'catch', null, null, null, null, null, null, null, null], // hotbar slots 1-0 (skill ids or actions)
  learned: new Set(['swing']) };              // skills learned from Skill Master Kael (the basic attack is known)
// Saat: revive where you fell with 50% HP and MP; costs 5 and then has a cooldown
const SAAT_CD = 300, SAAT_DROP = 0.12;
let tree = null;                                   // skill tree (created with the UI below)
const saatCost = () => tree?.saatCost() ?? 5;
const clockText = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
// hero level, health and mana
const hero = { name: 'Hero', lv: 1, xp: 0, hp: 0, mp: 0, dead: false };
const xpNeeded = (lv) => Math.round(70 * Math.pow(lv, 1.6));
// class stats (1-5) scale the hero; the Adventurer is the 1.0 baseline
const classMul = (k) => 0.7 + CLASSES[game.heroClass].stats[k] * 0.1;
const maxHp = () => Math.round((120 + (hero.lv - 1) * 30) * classMul('hp') * (tree?.hp() ?? 1));
const maxMp = () => Math.round((60 + (hero.lv - 1) * 12) * classMul('mp') * (tree?.mp() ?? 1));
const heroAtk = () => (14 + hero.lv * 5 + game.jobLv * 2) * classMul('atk') * (tree?.atk() ?? 1);
const maxJob = () => MAX_JOB[game.heroClass];
let SKILLS = CLASS_SKILLS.adventurer;
// critical hits: chance and damage come from the class, crit damage also grows a little with level
const critRate = () => CLASSES[game.heroClass].crit.rate / 100 + (tree?.crit() ?? 0);
const critDmg = () => (CLASSES[game.heroClass].crit.dmg + (hero.lv - 1)) / 100 + (tree?.critDmg() ?? 0);
const heroDef = () => (2 + hero.lv * 1.5) * classMul('def') * (game.buffs.def > game.time ? 1.3 : 1) * (tree?.def() ?? 1);
hero.hp = maxHp(); hero.mp = maxMp();
const keys = new Set();

// ---------------------------------------------------------------- UI
const $ = (s) => document.querySelector(s);
const labels = $('#labels');
const miniland = createMiniland({ $, toast, audio, fx, game, player, placeLabel: (el, pos, y) => place(el, pos, y), labelsEl: labels, bellTravel: () => bellTravel(), onMates: () => syncMate() });
const tutorial = createTutorial({ $, audio, toast, player, getMapId: () => map?.def.id,
  fx: () => { const ch = chars[state.cls]; fx.ring(ch.root.position, 0xffd24a, 2.6, 0.08, 0.7); },
  reward: () => { game.saat += 2; miniland.addGold(100); } });
scene.add(tutorial.arrow);
tree = createSkillTree({ $, audio, toast, getHero: () => hero, getSkills: () => SKILLS.slice(1), isLearned: (sk) => game.learned.has(sk.id),
  onChange: () => { hero.hp = Math.min(hero.hp, maxHp()); hero.mp = Math.min(hero.mp, maxMp()); } });
const quests = createQuests({ $, audio, toast, getHero: () => hero, getJob: () => game.jobLv, getMapId: () => map?.def.id,
  fx: () => { const ch = chars[state.cls]; fx.ring(ch.root.position, 0xffd24a, 3, 0.08, 0.9); fx.burst(ch.root.position.clone().setY(ch.root.position.y + 1.5), 0xffe08a, 28, 4, 0.13, 2); },
  reward: (r) => { if (r.gold) miniland.addGold(r.gold); if (r.saat) game.saat += r.saat; if (r.xp) gainXp(r.xp); if (r.jobXp) gainJobXp(r.jobXp); } });
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
$('#opt-anime').onchange = (e) => (anime.enabled = e.target.checked);
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
    if (state.mode === 'play') { if (e.code === 'Space') startAutoAttack(); else useSlot(slot); }
    else if (CLASSES[state.cls].starter) playAnim(SKILLS[slot].anim);
    else if (slot < 2) playAnim(slot ? 'skill' : 'attack');
  }
  if (k === 'f') action('wave');
  if (k === 'l' && !e.repeat) goToMiniland();
  if (k === 'escape') { miniland.closeAll(); closeSkills(); quests.closeAll(); tsWin.hidden = true; tree.toggle(false); }
  if (k === 'j' && !e.repeat && state.mode === 'play') quests.toggleLog();
  if (k === 't' && !e.repeat && state.mode === 'play') tree.toggle();
  if (k === 'k' && !e.repeat && state.mode === 'play') { if (skillWin.hidden) openSkills(false); else closeSkills(); }
  if (k === 'v') toggleCam();
  if (state.camMode === 'classic' && !e.repeat && (k === 'q' || k === 'e')) state.camYawGoal += (k === 'q' ? 1 : -1) * Math.PI / 2;
  if (k === 'r') { if (miniland.mode?.install) miniland.rotate(); else action('victory'); }
  if (k === 'x') toggleSit();
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
const CLASSIC = { pitch: 0.8, dist: 25 };           // NosTale-like: about 45° down, fairly close
let camPitchNow = null, camDistNow = null, camDt = 0.016;
function camOffset(snap = false) {
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
  // when a cliff blocks the view the camera tilts up first, then moves in; both ease so it never jumps
  let pitch = classic ? CLASSIC.pitch : state.cam.pitch;
  let dir = dirAt(pitch), d = clearUntil(dir);
  while (d < dist && pitch < 1.3) { pitch += 0.05; dir = dirAt(pitch); d = clearUntil(dir); }
  const wantDist = d < dist ? Math.max(4, d - 1) : dist;
  if (snap || camPitchNow === null) { camPitchNow = pitch; camDistNow = wantDist; }
  const k = Math.min(1, camDt * 2.5);
  camPitchNow += (pitch - camPitchNow) * k;
  camDistNow += (wantDist - camDistNow) * (wantDist < camDistNow ? Math.min(1, camDt * 6) : k);
  return dirAt(camPitchNow).multiplyScalar(camDistNow);
}
function snapCamera() {
  camera.position.copy(player.pos).add(camOffset(true));
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
  game.aa = false;
  syncMate();
  mate?.place(player.pos);
  applyMapLook();
  audio.playMusic(map.def.music || map.def.theme);
  snapCamera();
  labels.querySelectorAll('.mob, .npcname, .portalname, .tsname').forEach((el) => el.remove());
  $('#mapname').textContent = map.def.name;
  const banner = $('#banner');
  $('#banner-name').textContent = map.def.name;
  $('#banner-lv').textContent = map.def.miniland ? 'Your home · press L' : map.def.safe ? 'Safe zone' : map.def.level || '';
  if (map.def.miniland) miniland.onEnter(map);
  quests.onEvent('visit', id);
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

// the Miniland menu (button / L) opens everywhere; away from home it offers the Bell of Sweet Home
function goToMiniland() {
  if (state.mode !== 'play' || !map) return;
  if (miniland.windowOpen) return miniland.closeWindow();
  miniland.openWindow();
}
// Bell of Sweet Home: saves where you are and takes you home; the Miniland exit brings you back
function bellTravel() {
  if (state.mode !== 'play' || !map || hero.dead || game.travelling) return 'You cannot do that right now.';
  if (map.def.miniland) return 'You are already home.';
  if (map.def.dungeon) return 'The Bell of Sweet Home does not work in dungeons.';
  if (game.combatUntil > game.time) return 'You cannot go home in the middle of a fight.';
  homeReturn = { id: map.def.id, pos: player.pos.clone(), yaw: player.yaw };
  travel({ to: 'miniland', toPortal: 'exit', bell: true });
  return null;
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
  const mpCost = Math.ceil(sk.mp * tree.mpCost());
  if (hero.mp < mpCost) return audio.sfx('denied'), toast('Not enough MP. Sit down to recover.');
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
  if (i === 0 && sk.kind !== 'buff' && game.target?.alive) game.aa = true;   // the basic attack keeps going on its own
  game.cds[sk.id] = game.time + sk.cd * tree.skillCd(sk.id);
  if (sk.ammo) game.stones -= sk.ammo;
  hero.mp -= mpCost;
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
    let dmg = heroAtk() * sk.mult * extra * (0.85 + Math.random() * 0.3) * tree.skillDmg(sk.id);
    if (tree.berserk() && hero.hp < maxHp() / 2) dmg *= 1.2;
    if (game.buffs.atk > game.time) dmg *= 1.3;
    if (crit) dmg *= critDmg();
    dmg = Math.max(1, Math.round(dmg - m.t.def));
    popDamage(m.pos, m.height, dmg, crit ? 'crit' : sk.magic ? 'magic' : '');
    audio.sfx(crit ? 'crit' : sk.magic ? 'magicHit' : 'hit');
    game.target = m;
    game.combatUntil = game.time + 5;
    if (m.t.static) gainJobXp(m.t.jobXp);
    if (m.damage(dmg)) onMonsterKilled(m);
  }, delay);
}

// rewards for a defeated monster (by the hero or the companion)
function onMonsterKilled(m) {
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
  if (mate && !m.t.static && mate.gainXp(m.t.xp)) {
    fx.ring(mate.pos, 0x9be86a, 2, 0.08, 0.7);
    audio.sfx('jobUp');
    setTimeout(() => toast(`${mate.data.name} reached Lv. ${mate.data.lv}!`), 700);
  }
  if (mate) miniland.save();
  toast(`${m.t.name} defeated  +${m.t.xp} XP  +${m.t.jobXp} Job XP${loot}`);
  if (game.target === m) { game.target = null; game.aa = false; }
  tutorial.event('kill');
  quests.onKill(m.typeId);
}

// ---------------------------------------------------------------- hotbar actions, auto-attack, Catch, companions
// actions that sit on the bar next to learned skills
const ACTIONS = {
  sit: { id: 'sit', name: 'Sit', icon: ['#7ab86a', '#2e5a28'], desc: 'Sit down to rest: HP and MP recover much faster.', cd: 0, mp: 0, jobLv: 1 },
  catch: { id: 'catch', name: 'Catch', icon: ['#e86a8a', '#7a1e3a'], desc: 'Catch a weakened monster (HP below 50%) as your companion. It fights at your side and levels up with you.', cd: 4, mp: 5, jobLv: 1, range: 6 },
};
const barEntry = (id) => ACTIONS[id] || SKILLS.find((sk) => sk.id === id) || null;
function toggleSit() {
  if (state.mode !== 'play') return playAnim(state.anim === 'sit' ? 'idle' : 'sit');
  if (hero.dead) return;                            // during an attack or emote the hero sits down right after it
  game.aa = false;
  if (state.anim === 'sit') playAnim('idle');
  else { player.target = player.pending = null; playAnim('sit'); tutorial.event('sit'); }
}
function useSlot(i) {
  const id = game.bar[i];
  if (!id) return;
  if (id === 'sit') return toggleSit();
  if (id === 'catch') return tryCatch();
  const idx = SKILLS.findIndex((sk) => sk.id === id);
  if (idx >= 0) useSkill(idx);
}
// Space / clicking a monster: select the nearest monster and keep hitting it with the basic attack
function startAutoAttack() {
  if (hero.dead || game.dialog) return;
  if (!game.target?.alive) game.target = nearestMonster(SKILLS[0].kind === 'ranged' ? SKILLS[0].range + 2 : 9);
  if (!game.target) return toast('No monster nearby.');
  game.aa = true;
  useSkill(0);
}

function tryCatch() {
  const ch = chars[state.cls], A = ACTIONS.catch;
  if (ch.busy || hero.dead || game.travelling || game.dialog) return;
  if ((game.cds.catch || 0) > game.time) return;
  const deny = (msg) => { audio.sfx('denied'); toast(msg, 3000); };
  const m = game.target?.alive ? game.target : nearestMonster(A.range);
  if (!m) return deny('Select a monster to catch.');
  if (m.t.static || m.t.boss) return deny(`${m.t.name} cannot be caught.`);
  if (mates().length >= MAX_MATES) return deny(`You already have ${MAX_MATES} companions. Release one in the Miniland menu (L → NosMates).`);
  if (m.hp > m.maxHp * 0.5) return deny(`Weaken ${m.t.name} first: its HP must be below 50%.`);
  if (hero.mp < Math.ceil(A.mp * tree.mpCost())) return deny('Not enough MP. Sit down to recover.');
  game.target = m;
  if (distTo(m) > A.range) { player.pending = { catch: true, tgt: m }; return; }
  if (player.sitting) { player.sitting = false; state.anim = 'idle'; }
  player.pending = player.target = null;
  game.aa = false;
  game.cds.catch = game.time + A.cd;
  hero.mp -= Math.ceil(A.mp * tree.mpCost());
  const d = m.pos.clone().sub(player.pos);
  player.yaw = ch.root.rotation.y = Math.atan2(d.x, d.z);
  ch.play('wave');
  audio.sfx('talk');
  fx.ring(m.pos, 0xff8ab8, 1.6, 0.06, 0.6);
  setTimeout(() => {
    if (!m.alive) return;
    // weaker (lower HP) and lower-level monsters are easier to catch
    const chance = Math.min(0.95, Math.max(0.15, 0.4 + (0.5 - m.hp / m.maxHp) * 1.1 + (hero.lv - m.t.lv) * 0.05));
    if (Math.random() > chance) {
      audio.sfx('miss');
      popDamage(m.pos, m.height, 'ESCAPED');
      return toast(`${m.t.name} broke free! Try again.`);
    }
    m.hp = 0; m.state = 'dead'; m.deadFor = 0;
    if (game.target === m) game.target = null;
    fx.burst(m.pos.clone().setY(0.8), 0xff8ab8, 30, 4, 0.13, 2);
    fx.ring(m.pos, 0xffffff, 2.4, 0.08, 0.8);
    audio.sfx('levelUp');
    const st = miniland.state;
    const data = { id: st.uid++, type: m.typeId, lv: m.t.lv, xp: 0, name: m.t.name };
    st.mates.push(data);
    const first = !st.activeMate || !mate;
    if (first) st.activeMate = data.id;
    miniland.save();
    syncMate();
    if (first) mate?.place(player.pos);
    toast(first ? `You caught a ${m.t.name}! It is your companion now.` : `You caught a ${m.t.name}! It waits in your Miniland (L → NosMates).`, 4000);
    tutorial.event('catch');
    quests.onEvent('catch');
  }, 650);
}

// the companion travelling with the hero (one at a time)
const mates = () => miniland.state.mates;
let mate = null;
function syncMate() {
  const want = mates().find((d) => d.id === miniland.state.activeMate) || null;
  if (mate?.data === want) return;
  if (mate) { scene.remove(mate.root); mate.plate?.remove(); }
  mate = want ? new CompanionEntity(want) : null;
  if (mate) { scene.add(mate.root); mate.place(player.pos); mate.m.root.traverse((o) => { if (o.isMesh) o.castShadow = false; }); }
}
function mateHit(m, dmg) {
  if (!m.alive || !map.monsters.includes(m)) return;
  popDamage(m.pos, m.height, dmg, 'mate');
  audio.sfx('hit');
  game.combatUntil = game.time + 5;
  if (m.damage(dmg)) onMonsterKilled(m);
}

function monsterAttack(m) {
  if (hero.dead || state.mode !== 'play' || game.shieldUntil > game.time) return;
  game.combatUntil = game.time + 5;
  if (Math.random() < 0.08) return audio.sfx('miss'), popDamage(player.pos, 3.2, 'MISS');
  const dmg = Math.max(1, Math.round(m.t.atk * (0.85 + Math.random() * 0.3) - heroDef()));
  const absorbed = Math.min(Math.floor(hero.mp), Math.round(dmg * tree.manaShield()));   // Mana Shield
  hero.mp -= absorbed;
  hero.hp -= dmg - absorbed;
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
  btn.disabled = left > 0 || game.saat < saatCost();
  btn.firstChild.textContent = `Use ${saatCost()} Saat · revive here`;
  $('#death-saat-count').textContent = `${game.saat}`;
  $('#death-saat-note').textContent = left > 0 ? `Saat on cooldown · ${clockText(left)}`
    : game.saat < saatCost() ? `You need ${saatCost()} Saat, you have ${game.saat}`
    : `Uses ${saatCost()} Saat · then ${SAAT_CD / 60} min cooldown`;
}
$('#death-saat').onclick = () => {
  if (!hero.dead || game.saat < saatCost() || game.saatReadyAt > game.time) return;
  game.saat -= saatCost();
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
// ---------------------------------------------------------------- Time-Spaces
const tsWin = $('#tswin'), tsTimer = $('#tstimer'), tsRes = $('#tsresult');
let tsBest = {};
try { tsBest = JSON.parse(localStorage.getItem('voxelquest-ts') || '{}'); } catch { /* no storage */ }
let tsChest = null, tsPendingStone = null;
function clickStone(stone) {
  if (stone.pos.distanceTo(player.pos) > 5) {             // walk up to it first
    player.target = stone.pos.clone().add(player.pos.clone().sub(stone.pos).setY(0).normalize().multiplyScalar(3));
    tsPendingStone = stone;
    return;
  }
  openTsWindow(stone.id);
}
function openTsWindow(id) {
  const ts = TIMESPACES[id], r = ts.reward, best = tsBest[id];
  $('#ts-who').textContent = `Time-Space ${ts.num} · ${ts.level}`;
  $('#ts-title').textContent = ts.name;
  $('#ts-desc').textContent = ts.desc;
  $('#ts-info').innerHTML = `<div><small>Chambers</small><b>${ts.chambers.length}</b></div><div><small>Time limit</small><b>${clockText(ts.limit)}</b></div><div><small>Best rank</small><b>${best ? `${best.rank} · ${clockText(best.time)}` : '—'}</b></div>`;
  $('#ts-reward').textContent = `Rewards (rank B): ${r.xp} XP · ${r.jobXp} Job XP · ${r.gold} gold · ${r.saat} Saat. Rank S ×1.5, A ×1.25, C ×0.75`;
  const low = hero.lv < ts.minLv;
  $('#ts-enter').disabled = low;
  $('#ts-enter').textContent = low ? `Requires Lv. ${ts.minLv}` : 'Enter the Time-Space';
  $('#ts-enter').onclick = () => { tsWin.hidden = true; enterTimeSpace(id); };
  tsWin.hidden = false;
  audio.sfx('portal');
}
$('#ts-close').onclick = () => (tsWin.hidden = true);
function enterTimeSpace(id) {
  const ts = TIMESPACES[id];
  // every run starts fresh: forget chambers built before
  ts.chambers.forEach((_, i) => { const cid = chamberId(id, i); if (maps[cid]) { scene.remove(maps[cid].group); delete maps[cid]; } });
  game.ts = { id, start: game.time, limit: ts.limit, returnTo: { id: map.def.id, pos: player.pos.clone(), yaw: player.yaw }, finished: false };
  travel({ to: chamberId(id, 0), toPortal: 'south', ts: true });
  setTimeout(() => toast(`Time-Space ${ts.num}: ${ts.name}. Defeat every monster to open the gate!`, 4000), 700);
}
function exitTimeSpace(msg) {
  const r = game.ts?.returnTo;
  game.ts = null;
  if (tsChest) { tsChest.removeFromParent(); tsChest = null; }
  tsTimer.hidden = true;
  if (!r) return;
  game.travelling = true;
  $('#fade').classList.add('on');
  setTimeout(() => {
    enterMap(r.id, null);
    player.pos.copy(r.pos); player.yaw = r.yaw;
    chars[state.cls].root.position.copy(r.pos);
    pet.root.position.copy(r.pos).add(new THREE.Vector3(1.2, 0, -0.8));
    mate?.place(player.pos);
    snapCamera();
    $('#fade').classList.remove('on');
    setTimeout(() => (game.travelling = false), 400);
    if (msg) toast(msg, 3500);
  }, 380);
}
function updateTimeSpace() {
  if (tsPendingStone && !player.target) {
    if (tsPendingStone.pos.distanceTo(player.pos) < 5.5) openTsWindow(tsPendingStone.id);
    tsPendingStone = null;
  }
  const g = game.ts;
  if (!g || !map) { tsTimer.hidden = true; return; }
  if (!map.def.timespace) { if (!game.travelling) { game.ts = null; tsTimer.hidden = true; toast('You left the Time-Space.'); } return; }
  const left = Math.max(0, g.limit - (game.time - g.start));
  const ts = TIMESPACES[g.id], n = alive().length;
  tsTimer.hidden = false;
  const html = `<small>TS ${ts.num} · ${ts.name} · Chamber ${map.def.chamber + 1}/${ts.chambers.length}</small><b class="${left < 30 ? 'low' : ''}">${clockText(left)}</b><span>${g.finished ? 'Cleared!' : n ? `${n} monster${n > 1 ? 's' : ''} left` : map.def.last ? 'Open the chest!' : 'Gate open: go north'}</span>`;
  if (tsTimer.innerHTML !== html) tsTimer.innerHTML = html;
  // gates light up once the chamber is clear
  for (const p of map.portals) if (p.to !== 'sealed') p.group.visible = !n;
  if (!g.finished && left <= 0 && !hero.dead) { audio.sfx('denied'); return exitTimeSpace('Time is up! The Time-Space collapsed around you.'); }
  if (map.def.last && !n && !tsChest && !g.finished) spawnChest();
  if (tsChest && !g.finished && tsChest.position.distanceTo(player.pos) < 2.2) openChest();
}
function spawnChest() {
  const p = prop('ml_chest');
  tsChest = new THREE.Group();
  const m = new THREE.Mesh(p.geo, PROP_MAT);
  m.scale.setScalar(0.9);
  const glow = new THREE.Mesh(new THREE.RingGeometry(1.4, 2, 28), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.06;
  tsChest.add(m, glow);
  tsChest.traverse((o) => (o.userData.tsChest = true));
  tsChest.position.set(0, map.heightAt(0, 4), 4);
  map.group.add(tsChest);
  fx.burst(tsChest.position.clone().setY(tsChest.position.y + 1), 0xffe08a, 40, 5, 0.14, 2.5);
  audio.sfx('jobUp');
  toast('A reward chest appeared! Walk to it.', 3500);
}
function openChest() {
  const g = game.ts;
  if (!g || g.finished) return;
  g.finished = true;
  const ts = TIMESPACES[g.id], used = game.time - g.start;
  const [rank, , mul] = rankFor(used, g.limit);
  const r = ts.reward, got = { xp: Math.round(r.xp * mul), jobXp: Math.round(r.jobXp * mul), gold: Math.round(r.gold * mul), saat: Math.max(1, Math.round(r.saat * mul)) };
  miniland.addGold(got.gold); game.saat += got.saat; gainXp(got.xp); gainJobXp(got.jobXp);
  const best = tsBest[g.id];
  const order = 'SABC';
  if (!best || order.indexOf(rank) < order.indexOf(best.rank) || (rank === best.rank && used < best.time)) { tsBest[g.id] = { rank, time: Math.round(used) }; try { localStorage.setItem('voxelquest-ts', JSON.stringify(tsBest)); } catch { /* not saved */ } }
  audio.sfx('levelUp');
  fx.ring(player.pos, 0xffe08a, 4, 0.1, 1.2);
  $('#tsr-title').textContent = `Time-Space ${ts.num} cleared!`;
  $('#tsr-rank').textContent = rank;
  $('#tsr-rank').className = `tsr-rank r${rank}`;
  $('#tsr-time').textContent = `Time ${clockText(used)} of ${clockText(g.limit)}`;
  $('#tsr-reward').textContent = `+${got.xp} XP · +${got.jobXp} Job XP · +${got.gold} gold · +${got.saat} Saat`;
  tsRes.hidden = false;
}
$('#tsr-leave').onclick = () => { tsRes.hidden = true; exitTimeSpace(null); };

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
    setTimeout(() => toast(`Level ${hero.lv}! HP and MP restored. +1 skill point (T)`), 400);
    tree.render();
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
  quests.onEvent('job', lv);
  const ready = game.heroClass === 'adventurer' && lv >= CLASS_CHANGE_JOB;
  toast(`Job Lv. ${lv}!${fresh.length ? ` New skill at Skill Master Kael: ${fresh.join(', ')}` : ''}${ready ? ' Visit the Class Master in Mossvale to choose your class!' : ''}`, ready ? 5000 : 2200);
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
    case 'sit': g.fillRect(5, 3, 4, 4); line(7, 7, 7, 10, 2); line(7, 10, 12, 10, 2); line(12, 10, 12, 14, 2); line(4, 9, 7, 9, 1); break;
    case 'catch': g.strokeStyle = '#fff8e8'; g.lineWidth = 2; g.beginPath(); g.arc(8, 8, 5, 0, 6.3); g.stroke(); line(3, 8, 13, 8, 1); g.fillRect(7, 7, 3, 3); break;
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

// ---------------------------------------------------------------- skill window (Skill Master Kael, or K)
// Learn skills from Kael once your Job Level is high enough, then set skills and actions on slots 1-0:
// pick a skill, then click the slot it should go on (click a filled slot with nothing picked to clear it).
const skillWin = $('#skillwin');
let skillPick = null, atKael = false;
function openSkills(kael) {
  atKael = kael;
  skillPick = null;
  game.dialog = true;
  game.aa = false;
  skillWin.hidden = false;
  renderSkills();
  if (kael) tutorial.event('skills');
}
function closeSkills() { if (skillWin.hidden) return; skillWin.hidden = true; game.dialog = false; skillPick = null; }
function renderSkills() {
  $('#sw-who').textContent = atKael ? 'Skill Master Kael' : 'Your skills';
  const basic = SKILLS[0];
  const row = (sk, status, btn) => `<div class="sw-skill${skillPick === sk.id ? ' pick' : ''}" ${btn === 'pick' ? `data-pick="${sk.id}"` : ''}>
    <img src="${drawIcon(sk)}" alt=""><div><b>${sk.name}</b><small>${status}</small><p>${sk.desc}</p></div>
    ${btn === 'learn' ? `<button class="primary" data-learn="${sk.id}">Learn</button>` : btn === 'pick' ? `<button data-pick="${sk.id}">${skillPick === sk.id ? 'Picked' : 'Set on bar'}</button>` : ''}</div>`;
  const rows = [row(basic, 'Auto-attack · Space or click a monster', null), row(ACTIONS.sit, 'Action · always known', 'pick'), row(ACTIONS.catch, `Action · MP ${ACTIONS.catch.mp} · Cooldown ${ACTIONS.catch.cd}s`, 'pick')];
  for (const sk of SKILLS.slice(1)) {
    const info = `Job Lv. ${sk.jobLv}${sk.mp ? ` · MP ${sk.mp}` : ''} · Cooldown ${sk.cd}s`;
    if (game.learned.has(sk.id)) rows.push(row(sk, `${info} · learned`, 'pick'));
    else if (!isUnlocked(sk)) rows.push(row(sk, `${info} · reach Job Lv. ${sk.jobLv} first`, null));
    else if (atKael) rows.push(row(sk, `${info} · ready to learn`, 'learn'));
    else rows.push(row(sk, `${info} · learn it from Skill Master Kael in Mossvale`, null));
  }
  $('#sw-bar').innerHTML = game.bar.map((id, i) => {
    const sk = id && barEntry(id);
    return `<button class="slot${sk ? '' : ' empty'}" data-slot="${i}" title="${sk ? sk.name : 'Empty'}">${sk ? `<img src="${drawIcon(sk)}" alt="">` : ''}<kbd>${i === 9 ? 0 : i + 1}</kbd></button>`;
  }).join('');
  $('#sw-hint').textContent = skillPick ? `Now click a slot for ${barEntry(skillPick).name}.` : 'Pick a skill, then click a slot. Click a filled slot to clear it.';
  $('#sw-list').innerHTML = rows.join('');
  for (const b of skillWin.querySelectorAll('[data-learn]')) b.onclick = (e) => {
    e.stopPropagation();
    const sk = SKILLS.find((k) => k.id === b.dataset.learn);
    game.learned.add(sk.id);
    const free = game.bar.indexOf(null);
    if (free >= 0) { game.bar[free] = sk.id; buildSlots(); }
    audio.sfx('jobUp');
    toast(`Learned ${sk.name}!${free >= 0 ? ` It is on slot ${free === 9 ? 0 : free + 1}.` : ''}`);
    renderSkills();
  };
  for (const el of skillWin.querySelectorAll('[data-pick]')) el.onclick = (e) => {
    e.stopPropagation();
    skillPick = skillPick === el.dataset.pick ? null : el.dataset.pick;
    audio.sfx('click');
    renderSkills();
  };
  for (const b of skillWin.querySelectorAll('[data-slot]')) b.onclick = () => {
    const i = Number(b.dataset.slot);
    if (skillPick) {
      const old = game.bar.indexOf(skillPick);
      if (old >= 0) game.bar[old] = game.bar[i];           // swap when it already sits on another slot
      game.bar[i] = skillPick;
      skillPick = null;
    } else game.bar[i] = null;
    audio.sfx('click');
    buildSlots();
    renderSkills();
  };
}
$('#sw-close').onclick = closeSkills;

const hud = $('#hud');
const slotsEl = $('#slots');
let slotEls = [];
function buildSlots() {
  slotsEl.innerHTML = '';
  // the basic attack is the auto-attack (Space), then slots 1-0 as set up in the skill window (K)
  const basic = SKILLS[0];
  const aa = document.createElement('button');
  aa.className = 'slot aa';
  aa.innerHTML = `<img src="${drawIcon(basic)}" alt=""><kbd>Space</kbd><span class="cd"></span><span class="aa-tag">AUTO</span>`;
  aa.title = `${basic.name}: auto-attack\nClick a monster or press Space: your hero keeps attacking until it falls.`;
  aa.onclick = startAutoAttack;
  slotsEl.appendChild(aa);
  slotEls = game.bar.map((id, i) => {
    const sk = id && barEntry(id);
    const el = document.createElement('button');
    el.className = sk ? 'slot' : 'slot empty';
    el.innerHTML = sk ? `<img src="${drawIcon(sk)}" alt=""><kbd>${i === 9 ? 0 : i + 1}</kbd><span class="cd"></span>${sk.ammo ? '<span class="ammo"></span>' : ''}`
      : `<kbd>${i === 9 ? 0 : i + 1}</kbd>`;
    el.title = sk ? `${sk.name}\n${sk.desc}${sk.mp ? `\nMP ${sk.mp}` : ''}${sk.cd ? ` · Cooldown ${sk.cd}s` : ''}` : 'Empty slot: set up skills with Skill Master Kael, or press K';
    el.onclick = () => (sk ? useSlot(i) : openSkills(false));
    slotsEl.appendChild(el);
    return el;
  });
  slotEls.aa = aa;
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
  const cdOf = (sk) => (sk.cd ? Math.max(0, (game.cds[sk.id] || 0) - game.time) / sk.cd : 0);
  slotEls.aa.classList.toggle('on', game.aa);
  slotEls.aa.querySelector('.cd').style.height = `${cdOf(SKILLS[0]) * 100}%`;
  game.bar.forEach((id, i) => {
    const sk = id && barEntry(id), el = slotEls[i];
    if (!sk) return;
    el.classList.toggle('nomp', hero.mp < (sk.mp || 0));
    el.classList.toggle('on', id === 'sit' && player.sitting);
    el.querySelector('.cd').style.height = `${cdOf(sk) * 100}%`;
    if (sk.ammo) el.querySelector('.ammo').textContent = game.stones;
  });
  const b = [];
  if (game.buffs.atk > game.time) b.push(`<span class="buff atk">Combat ${Math.ceil(game.buffs.atk - game.time)}s</span>`);
  if (game.buffs.def > game.time) b.push(`<span class="buff def">Morale ${Math.ceil(game.buffs.def - game.time)}s</span>`);
  if (SKILLS.some((sk) => sk.ammo && game.learned.has(sk.id))) b.push(`<span class="buff stones">Stones ${game.stones}</span>`);
  const saatCd = Math.max(0, game.saatReadyAt - game.time);
  b.push(`<span class="buff gold" title="Gold: buy and repair Miniland structures">Gold ${miniland.state.gold}</span>`);
  b.push(`<span class="buff saat" title="Saat: ${saatCost()} revive you where you fall with 50% HP and MP">Saat ${game.saat}${saatCd > 0 ? ` · ${clockText(saatCd)}` : ''}</span>`);
  updateDeath();
  const tp = tree.points(), tb = $('#tree-btn');
  const tt = tp ? `Tree (${tp})` : 'Tree';
  if (tb.textContent !== tt) { tb.textContent = tt; tb.classList.toggle('glow', tp > 0); }
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
  for (const n of map.npcs) {
    const q = n.plate?.dataset.q, big = q === 'new' || q === 'ready';
    mctx.fillStyle = big ? '#ffe600' : '#d8a83a';
    const r = big ? 4 : 2;
    mctx.fillRect(X(n.pos.x) - r, Z(n.pos.z) - r, r * 2 + 1, r * 2 + 1);
  }
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
  for (const n of map.npcs) {
    const el = plate(n, 'npcname', `<span class="qmark"></span><small>${n.guide ? 'Guide · tutorial' : n.skills ? 'Skills' : 'NPC'}</small>${n.name}`);
    const mk = quests.marker(n.name);
    if (el.dataset.q !== mk) { el.dataset.q = mk; el.firstChild.textContent = mk === 'new' ? '!' : mk ? '?' : ''; }
    place(el, n.pos, 3.9);
  }
  if (mate) {
    const el = plate(mate, 'matename', '');
    const html = `<small>Companion</small>Lv.${mate.data.lv} ${mate.data.name}`;
    if (el.innerHTML !== html) el.innerHTML = html;
    place(el, mate.pos, mate.m.height + 0.4);
  }
  miniland.update();
  for (const t of map.tsStones || []) {
    const el = plate(t, 'tsname', `<small>Click to enter</small>${t.name} · ${TIMESPACES[t.id].name}`);
    if (t.pos.distanceTo(player.pos) > 26) el.style.display = 'none'; else place(el, t.pos, 7.4);
  }
  for (const p of map.portals) {
    const el = plate(p, 'portalname', '');
    const dest = p.to === 'sealed' ? '' : map.def.timespace ? (alive().length ? '' : '→ Next chamber') : `→ ${p.to === 'back' ? MAPS[homeReturn?.id ?? START_MAP].name : MAPS[p.to].name}`;
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
  game.learned = new Set([SKILLS[0].id]);
  game.bar = ['sit', 'catch', null, null, null, null, null, null, null, null];
  game.aa = false;
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
  if (miniland.mode?.install && state.mode === 'play' && map) {        // ghost preview follows the pointer
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    miniland.hover(ray.intersectObjects(map.terrain, false)[0]?.point);
  }
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
  const pickables = [...alive().map((m) => m.root), ...map.npcs.map((n) => n.ch.root), ...(map.tsStones || []).map((t) => t.group), ...(tsChest ? [tsChest] : [])];
  const hits = ray.intersectObjects(pickables, true);
  const obj = hits[0]?.object;
  if (obj?.userData.tsStone) return clickStone(obj.userData.tsStone);
  if (obj?.userData.tsChest) return openChest();
  if (obj?.userData.monster) {
    const m = obj.userData.monster;
    game.target = m;
    startAutoAttack(); // click a monster: auto-attack it (walks there first when needed)
    return;
  }
  if (obj?.userData.npc) return talk(obj.userData.npc);
  const ground = ray.intersectObjects(map.terrain, false)[0];
  if (ground) {
    const hit = ground.point;
    player.target = hit;
    player.pending = null;
    player.sitting = false;
    game.aa = false;
    fx.ring(hit, 0xffffff, 0.8, 0.06, 0.4);
  }
});
canvas.addEventListener('wheel', (e) => {
  if (state.mode !== 'play') return;
  state.cam.dist = Math.min(34, Math.max(8, state.cam.dist * (e.deltaY > 0 ? 1.1 : 0.9)));
}, { passive: true });

// villagers with `wander` stroll around their home spot and pause now and then
function walkNpc(n, dt) {
  n.t = (n.t ?? Math.random() * 3) - dt;
  if (!n.goal) {
    if (n.t > 0) return;
    const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * n.wander;
    const x = n.home.x + Math.cos(a) * r, z = n.home.z + Math.sin(a) * r;
    if (map.walkable(x, z)) { n.goal = new THREE.Vector3(x, 0, z); n.ch.play('walk'); }
    n.t = 2 + Math.random() * 4;
    return;
  }
  const to = n.goal.clone().sub(n.pos).setY(0), d = to.length();
  const stop = () => { n.goal = null; n.t = 2 + Math.random() * 5; n.ch.play('idle'); };
  if (d < 0.3 || n.t < -10) return stop();
  to.normalize();
  const step = Math.min(d, 1.7 * dt), nx = n.pos.x + to.x * step, nz = n.pos.z + to.z * step;
  if (!map.walkable(nx, nz, n.pos.x, n.pos.z) || Math.hypot(nx - player.pos.x, nz - player.pos.z) < 1) return stop();
  n.pos.x = nx; n.pos.z = nz; n.pos.y = map.heightAt(nx, nz);
  n.ch.root.rotation.y = Math.atan2(to.x, to.z);
}

function talk(npc) {
  if (npc.pos.distanceTo(player.pos) > 6) {
    player.target = npc.pos.clone().add(player.pos.clone().sub(npc.pos).setY(0).normalize().multiplyScalar(1.6));
    return;
  }
  if (npc.wander) { npc.goal = null; npc.t = 6; }
  const d = player.pos.clone().sub(npc.pos);
  npc.ch.root.rotation.y = Math.atan2(d.x, d.z);
  npc.ch.play('wave');
  audio.sfx('talk');
  if (!(npc.skills && tutorial.active) && quests.talkTo(npc.name)) return;   // the tutorial sends you to Kael's skills first
  if (npc.shop) return miniland.openShop(npc.shop, npc.name);
  if (npc.guide) {
    if (tutorial.active) return toast(`${npc.name}: “Follow the golden arrow, you are doing great!”`, 4000);
    toast(`${npc.name}: “Let's go through it again!”`, 3000);
    return tutorial.replay();
  }
  if (npc.skills) { toast(`${npc.name}: “${npc.line}”`, 4000); return openSkills(true); }
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
  if (b.dataset.emote === 'quests') return quests.toggleLog();
  if (b.dataset.emote === 'tree') return tree.toggle();
  if (b.dataset.emote === 'sprint') { state.sprint = !state.sprint; b.classList.toggle('on', state.sprint); return; }
  if (b.dataset.emote === 'sit') toggleSit();
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
  if (move.lengthSq() > 0) { player.target = null; player.pending = null; game.aa = false; }
  else if (player.pending) {
    // walking toward a monster to use a skill (or Catch) on it
    const { i, tgt, catch: isCatch } = player.pending;
    const reach = isCatch ? ACTIONS.catch.range : reachOf(SKILLS[i]);
    if (!tgt.alive) player.pending = null;
    else if (distTo(tgt) <= reach) { player.pending = null; if (isCatch) tryCatch(); else useSkill(i); }
    else move.copy(tgt.pos).sub(player.pos).setY(0);
  } else if (player.target) {
    move.copy(player.target).sub(player.pos).setY(0);
    if (move.length() < 0.15) { player.target = null; move.set(0, 0, 0); }
  }
  // auto-attack: swing again whenever the basic attack is ready
  if (game.aa) {
    const t = game.target;
    if (!t?.alive || hero.dead || player.sitting) game.aa = false;
    else if (!player.pending && !ch.busy && !player.dash && hero.mp >= (SKILLS[0].mp || 0) && (game.cds[SKILLS[0].id] || 0) <= game.time) useSkill(0);
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
  // velocity with acceleration: the hero speeds up and brakes over a moment instead of jumping between
  // standing and full speed, and curves round when the direction changes
  const vel = player.vel ||= new THREE.Vector3();
  const wantVel = new THREE.Vector3();
  if (move.lengthSq() > 0 && !ch.busy && !hero.dead) {
    const dist = move.length();
    move.normalize();
    player.sitting = false;
    let speed = (walking ? 2.3 : sprinting ? 8.6 : 5.2) * (0.85 + CLASSES[state.cls].stats.spd * 0.05);
    if (player.target && !player.pending) speed *= Math.min(1, 0.3 + dist / 1.4);       // ease in when arriving at a clicked spot
    wantVel.copy(move).multiplyScalar(speed);
    player.yaw = Math.atan2(move.x, move.z);
  }
  if (player.dash || hero.dead) vel.set(0, 0, 0);
  else vel.lerp(wantVel, 1 - Math.exp(-dt * (wantVel.lengthSq() >= vel.lengthSq() ? 11 : 15)));
  const speedNow = vel.length();
  if (speedNow > 0.02) {
    if (!tryMove(vel.x * dt, vel.z * dt)) { player.target = null; vel.multiplyScalar(0.4); }
    // footsteps at each foot fall, sounding like the ground under the hero
    game.stepDist = (game.stepDist || 0) + speedNow * dt;
    if (game.stepDist > (speedNow < 3.2 ? 1.05 : speedNow < 6.8 ? 1.75 : 2.3)) { game.stepDist = 0; audio.sfx('step', map.surfaceAt(player.pos.x, player.pos.z)); }
    if (speedNow > 6.8 && (game.dustIn = (game.dustIn || 0) - dt) < 0) {
      game.dustIn = 0.12;
      fx.burst(player.pos.clone().setY(player.pos.y + 0.1), 0xd8c8a0, 3, 1.2, 0.09, 0.6);
    }
  } else vel.set(0, 0, 0);
  if (speedNow > 0.35) loco = 'run';
  if (player.sitting) loco = 'sit';
  if (!hero.dead && loco !== state.anim) { state.anim = loco; ch.play(loco); markAnim(); }

  // follow the terrain
  if (!player.dash) player.pos.y += (map.heightAt(player.pos.x, player.pos.z) - player.pos.y) * Math.min(1, dt * 16);
  // portals
  if (!hero.dead && !game.travelling) for (const p of map.portals) {
    if (Math.hypot(p.pos.x - player.pos.x, p.pos.z - player.pos.z) >= 1.6 || p.to === 'sealed') continue;
    if (map.def.timespace && alive().length) {           // Time-Space gates open once the chamber is clear
      if (game.time > (game.gateMsg || 0)) { game.gateMsg = game.time + 3; audio.sfx('denied'); toast(`The gate is sealed. Defeat all monsters (${alive().length} left).`); }
      continue;
    }
    travel(p);
  }
  updateTimeSpace(dt);

  // stones, regeneration and buff auras
  if (map.stonePile && SKILLS.some((sk) => sk.ammo) && game.stones < MAX_STONES && player.pos.distanceTo(map.stonePile.position) < 1.8) {
    game.stones = MAX_STONES;
    audio.sfx('stones');
    toast(`Picked up stones (${MAX_STONES})`);
  }
  if (!hero.dead) {
    const resting = player.sitting ? 6 : game.time > game.combatUntil ? 1 : 0.3;
    hero.hp = Math.min(maxHp(), hero.hp + maxHp() * 0.008 * resting * dt * tree.hpRegen());
    hero.mp = Math.min(maxMp(), hero.mp + maxMp() * 0.012 * resting * dt * tree.mpRegen());
  }
  if ((game.auraIn -= dt) < 0) {
    game.auraIn = 0.25;
    if (game.buffs.atk > game.time) fx.aura(ch, 0xff6a4a, 2);
    if (game.buffs.def > game.time) fx.aura(ch, 0x6aa8ff, 2);
  }

  let dy = player.yaw - ch.root.rotation.y;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  const turnStep = dy * Math.min(1, dt * 12);
  ch.root.rotation.y += turnStep;
  // tell the animation the real speed and turn rate (step rhythm, leaning into curves)
  player.turn = (player.turn || 0) + ((turnStep / Math.max(dt, 1e-3)) - (player.turn || 0)) * Math.min(1, dt * 8);
  if (state.anim === 'run') ch.locomote(speedNow, player.turn);
  ch.root.position.copy(player.pos);

  camDt = dt;
  camera.position.lerp(player.pos.clone().add(camOffset()), Math.min(1, dt * 10));
  camera.lookAt(player.pos.x, player.pos.y + 1.4, player.pos.z);
  sun.position.copy(player.pos).add(new THREE.Vector3(18, 34, 14));
  sun.target.position.copy(player.pos);

  // the dachshund trots after the hero and stays a little to the side, or lives in the Miniland
  const petHome = miniland.state.petHome;
  pet.root.visible = !petHome || !!map.def.miniland;
  if (petHome && map.def.miniland) {
    if (!petState.goal || (petState.wander -= dt) < 0) {
      const spot = miniland.petSpot();                 // napping by his kennel, or roaming the garden
      petState.goal = spot ? spot.add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, Math.random() * 1.5)) : new THREE.Vector3(-8 + (Math.random() - 0.5) * 10, 0, 4 + (Math.random() - 0.5) * 10);
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
  if (mate) {
    const t = game.target?.alive && !hero.dead && (game.aa || game.target.provoked) ? game.target : null;
    mate.update({ dt, player: player.pos, yaw: player.yaw, target: t, heightAt: map.heightAt, walkable: map.walkable, hit: mateHit });
  }
  tutorial.update(game.time);
  for (const n of map.npcs) { if (n.wander) walkNpc(n, dt); n.ch.update(dt); }
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
  anime.setSize();
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
  petals.update(dt, player.pos, state.mode === 'play' && !!map && !map.def.dungeon && map.def.theme !== 'coast');
  anime.render(scene, camera);
  requestAnimationFrame(frame);
}

resize();
renderInfo();
markAnim();
for (const ch of Object.values(chars)) ch.root.rotation.y = state.view;
setMode('play');
tutorial.autostart();
requestAnimationFrame(frame);
$('#loading').classList.add('done');

// handy for debugging from the console
Object.assign(window, { changeClass, openClassPick, chars, state, setMode, selectClass, playAnim, game, player, hero, useSkill, enterMap, maps, getMap: () => map });

// test hook, only with ?debug in the URL: lets automated checks jump between maps and trigger events
if (new URLSearchParams(location.search).has('debug')) window.voxelQuest = { tree, anime, openTsWindow, enterTimeSpace, clickStone, game, hero, player, state, enterMap, die, miniland, tutorial, quests, tryCatch, useSlot, openSkills, get mate() { return mate; }, get map() { return map; }, maps };
