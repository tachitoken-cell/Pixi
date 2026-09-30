// Miniland, NosTale style: your own small home area.
// - Reached through the gate south of Mossvale or the Miniland button / L (Sweet Home Bell).
// - The Miniland window (L inside) shows the welcome message, visits, Production points and gold,
//   a Public / Private switch, Installing mode and Deleting mode (only while Private, like NosTale),
//   the structure shop, and whether the dachshund stays at home.
// - Minigames score a reward level 1-5. Taking a reward costs 100 Production points (2000 per day)
//   and some of the game's durability, which the owner repairs with gold.
// State is saved in the browser (localStorage) when available.
import * as THREE from 'three';
import { prop } from './props.js';
import { PROP_MAT } from './voxel.js';
import { mat } from './character.js';

const SAVE_KEY = 'voxelquest-miniland-v1';
export const PP_MAX = 2000;
const PP_COST = 100;
const DUR_MAX = 1000;
const today = () => new Date().toDateString();

// kind: 'game' (minigame, one of each) or 'decor'. price in gold.
export const CATALOG = {
  wood: { name: 'Woodcutting', kind: 'game', price: 400, desc: 'Chop in rhythm: stop the marker in the green zone.' },
  mining: { name: 'Rock Mining', kind: 'game', price: 900, desc: 'Strike the glowing ore before it fades.' },
  fishing: { name: 'Fishing', kind: 'game', price: 1200, desc: 'Wait for the bite, then pull as fast as you can.' },
  chicken: { name: 'Chicken Shooting', kind: 'game', price: 1500, desc: 'Hit the chickens running across the yard.' },
  oak: { name: 'Oak Tree', kind: 'decor', price: 60, model: ['oak', 1], scale: 1.1 },
  pine: { name: 'Pine Tree', kind: 'decor', price: 60, model: ['pine', 2], scale: 1.1 },
  bush: { name: 'Bush', kind: 'decor', price: 30, model: ['bush', 0], scale: 1.2 },
  rock: { name: 'Garden Rock', kind: 'decor', price: 30, model: ['rock', 1], scale: 1 },
  shroom: { name: 'Giant Mushroom', kind: 'decor', price: 40, model: ['shroom', 0], scale: 1.4 },
  lamp: { name: 'Street Lamp', kind: 'decor', price: 80, model: ['lamp', 0], scale: 1.2 },
  fence: { name: 'Fence', kind: 'decor', price: 20, model: ['fence', 0], scale: 1 },
  log: { name: 'Log Bench', kind: 'decor', price: 50, model: ['log', 0], scale: 1 },
  barrel: { name: 'Barrel', kind: 'decor', price: 25, model: ['barrel', 0], scale: 1.2 },
  crate: { name: 'Crate', kind: 'decor', price: 25, model: ['crate', 0], scale: 1.3 },
  sign: { name: 'Signpost', kind: 'decor', price: 40, model: ['sign', 0], scale: 1.3 },
  stall: { name: 'Market Stall', kind: 'decor', price: 300, model: ['stall', 0], scale: 1.3, block: 1.8 },
  boat: { name: 'Old Boat', kind: 'decor', price: 250, model: ['boat', 0], scale: 1, block: 2 },
  fountain: { name: 'Fountain', kind: 'decor', price: 600, model: ['fountain', 0], scale: 0.8, block: 2.8 },
  house: { name: 'Cottage', kind: 'decor', price: 1500, model: ['house', 1], scale: 0.9, block: 3.6 },
};
// reward per level: gold and Saat
const REWARDS = [null, { gold: 30, saat: 0 }, { gold: 60, saat: 0 }, { gold: 100, saat: 1 }, { gold: 160, saat: 2 }, { gold: 250, saat: 3 }];
const DUR_COST = (lv) => 10 + lv * 10;

function defaultState() {
  return { gold: 0, pp: PP_MAX, ppDay: today(), open: true, message: 'Welcome to my Miniland!',
    visits: { total: 0, today: 0, day: today() }, owned: { wood: 1 }, placed: [], dur: {}, petHome: false, gift: true };
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (s && typeof s === 'object') return { ...defaultState(), ...s };
  } catch { /* storage unavailable: start fresh */ }
  return defaultState();
}

// ---- models for the minigames (built from the game's props plus a few boxes)
function box(parent, w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
}
function propMesh(parent, kind, variant, scale, x = 0, z = 0, ry = 0) {
  const m = new THREE.Mesh(prop(kind, variant).geo, PROP_MAT);
  m.scale.setScalar(scale); m.position.set(x, 0, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true;
  parent.add(m); return m;
}
const GAME_MODEL = {
  wood(g) { propMesh(g, 'oak', 2, 1.05, 0.6, -0.4); propMesh(g, 'log', 0, 1, -1.1, 0.8, 0.6); box(g, 0.7, 0.45, 0.7, 0x8a6440, -1.4, 0.22, -0.6); box(g, 0.08, 0.7, 0.08, 0x6a4a2e, -1.35, 0.8, -0.6).rotation.z = 0.5; box(g, 0.34, 0.2, 0.06, 0xc8c8d0, -1.52, 1.05, -0.6); return 2.2; },
  mining(g) { propMesh(g, 'rock', 2, 1.9); for (const [x, y, z, c] of [[0.5, 0.9, 0.7, 0x6ae8ff], [-0.6, 0.6, 0.6, 0xffd24a], [0.1, 1.3, -0.2, 0x6ae8ff], [0.8, 0.4, -0.5, 0xb88aff]]) box(g, 0.24, 0.24, 0.24, c, x, y, z); box(g, 0.9, 0.35, 0.6, 0x6a4a2e, -1.5, 0.3, 0.8); return 2; },
  fishing(g) {
    const water = new THREE.Mesh(new THREE.CircleGeometry(1.9, 24), new THREE.MeshLambertMaterial({ color: 0x3a9ad8 }));
    water.rotation.x = -Math.PI / 2; water.position.y = 0.06; g.add(water);
    for (let a = 0; a < 16; a++) box(g, 0.5, 0.25, 0.3, a % 2 ? 0x9a968c : 0x85817a, Math.cos(a / 16 * Math.PI * 2) * 2.05, 0.12, Math.sin(a / 16 * Math.PI * 2) * 2.05).rotation.y = -a / 16 * Math.PI * 2;
    box(g, 0.08, 1.6, 0.08, 0x6a4a2e, 1.9, 0.8, 1.2).rotation.z = -0.5; propMesh(g, 'sign', 0, 1, -2.2, 1.6, 0.4);
    return 2.3;
  },
  chicken(g) {
    for (let i = 0; i < 4; i++) { const f = propMesh(g, 'fence', 0, 1, 0, 0, (i * Math.PI) / 2); f.position.set(Math.sin((i * Math.PI) / 2) * 1.6, 0, Math.cos((i * Math.PI) / 2) * 1.6); }
    for (const [x, z] of [[-0.5, 0.2], [0.5, -0.4]]) { box(g, 0.4, 0.35, 0.5, 0xf4f0e8, x, 0.3, z); box(g, 0.25, 0.25, 0.25, 0xf4f0e8, x, 0.6, z + 0.25); box(g, 0.1, 0.12, 0.06, 0xd8483a, x, 0.78, z + 0.25); box(g, 0.1, 0.06, 0.1, 0xf2b23a, x, 0.58, z + 0.42); }
    propMesh(g, 'crate', 0, 1.2, 1.0, 0.8);
    return 2;
  },
};

export function createMiniland({ $, toast, audio, fx, game, hero, player, placeLabel, labelsEl, onChange }) {
  const st = load();
  const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(st)); } catch { /* not saved */ } onChange?.(); };
  const refreshDay = () => {
    if (st.ppDay !== today()) { st.pp = PP_MAX; st.ppDay = today(); }
    if (st.visits.day !== today()) { st.visits.today = 0; st.visits.day = today(); }
  };
  refreshDay();
  let map = null;                  // the Miniland map while it is loaded
  const built = [];                // { entry, group, r, label }
  let mode = null;                 // null | { install: key } | { remove: true }

  // ---------------------------------------------------------------- structures in the world
  function inside(x, z) { return map && Math.abs(x) < map.W / 2 - 10 && Math.abs(z) < map.D / 2 - 10 && map.portals.every((p) => Math.hypot(x - p.pos.x, z - p.pos.z) > 8); }
  function spawn(entry) {
    const c = CATALOG[entry.id];
    const g = new THREE.Group();
    let r;
    if (c.kind === 'game') r = GAME_MODEL[entry.id](g);
    else { const [k, v] = c.model; propMesh(g, k, v, c.scale); r = c.block ?? Math.max(0.5, (prop(k, v).footprint || 0.5) * c.scale); }
    g.position.set(entry.x, map.heightAt(entry.x, entry.z), entry.z);
    g.rotation.y = entry.ry || 0;
    g.traverse((o) => { o.userData.miniland = entry; });
    map.group.add(g);
    map.setBlock(entry.x, entry.z, r * 0.8, true);
    let label = null;
    if (c.kind === 'game') {
      label = document.createElement('div');
      label.className = 'ml-game-label';
      labelsEl.appendChild(label);
    }
    built.push({ entry, group: g, r, label });
  }
  function clearBuilt() {
    for (const b of built) { map?.group.remove(b.group); map?.setBlock(b.entry.x, b.entry.z, b.r * 0.8, false); b.label?.remove(); }
    built.length = 0;
  }
  function onEnter(m) {
    map = m;
    refreshDay();
    clearBuilt();
    for (const e of st.placed) spawn(e);
    st.visits.total++; st.visits.today++;
    if (st.gift) {
      st.gift = false;
      setTimeout(() => toast('Welcome to your Miniland! A gift: Woodcutting. Press L to open the Miniland window and install it.', 6500), 1200);
    } else setTimeout(() => toast(`“${st.message}”`, 3500), 900);
    save();
  }
  function onLeave() { setMode(null); closeWindow(); clearBuilt(); map = null; }

  // ---------------------------------------------------------------- clicks in the Miniland
  // returns true when the click was used
  function click(obj, groundPoint) {
    if (!map) return false;
    if (mode?.install && groundPoint) { install(mode.install, groundPoint); return true; }
    const entry = obj?.userData.miniland;
    if (mode?.remove) { if (entry) remove(entry); return true; }
    if (entry && CATALOG[entry.id].kind === 'game') {
      const d = Math.hypot(entry.x - player.pos.x, entry.z - player.pos.z);
      const b = built.find((q) => q.entry === entry);
      if (d > b.r + 2.2) {
        const dir = new THREE.Vector3(player.pos.x - entry.x, 0, player.pos.z - entry.z).normalize();
        player.target = new THREE.Vector3(entry.x + dir.x * (b.r + 1), 0, entry.z + dir.z * (b.r + 1));
        player.target.y = map.heightAt(player.target.x, player.target.z);
        return true;
      }
      openGame(entry.id);
      return true;
    }
    return false;
  }
  function pickables() { return built.map((b) => b.group); }

  function install(id, p) {
    if (!inside(p.x, p.z)) { audio.sfx('denied'); return toast('You cannot build there.'); }
    const r = CATALOG[id].kind === 'game' ? 2.4 : 1;
    if (built.some((b) => Math.hypot(b.entry.x - p.x, b.entry.z - p.z) < b.r + r * 0.6) || Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < r) {
      audio.sfx('denied'); return toast('Too close to something else.');
    }
    const entry = { id, x: Math.round(p.x * 2) / 2, z: Math.round(p.z * 2) / 2, ry: Math.round(Math.atan2(player.pos.x - p.x, player.pos.z - p.z) / (Math.PI / 2)) * (Math.PI / 2) };
    st.owned[id]--;
    if (!st.owned[id]) delete st.owned[id];
    if (CATALOG[id].kind === 'game' && st.dur[id] === undefined) st.dur[id] = DUR_MAX;
    st.placed.push(entry);
    spawn(entry);
    fx.ring(new THREE.Vector3(entry.x, map.heightAt(entry.x, entry.z), entry.z), 0xfff2c0, 2.2, 0.06, 0.5);
    audio.sfx('click');
    save();
    if (!st.owned[id]) setMode(null);
    renderWindow();
  }
  function remove(entry) {
    const i = built.findIndex((b) => b.entry === entry);
    if (i < 0) return;
    const b = built[i];
    map.group.remove(b.group); map.setBlock(entry.x, entry.z, b.r * 0.8, false); b.label?.remove();
    built.splice(i, 1);
    st.placed.splice(st.placed.indexOf(entry), 1);
    st.owned[entry.id] = (st.owned[entry.id] || 0) + 1;
    audio.sfx('click');
    toast(`${CATALOG[entry.id].name} put away.`);
    save();
    renderWindow();
  }
  function setMode(m) {
    mode = m;
    const bar = $('#ml-mode');
    bar.hidden = !m;
    if (m) bar.innerHTML = m.install ? `<b>Installing: ${CATALOG[m.install].name}</b> · click the ground to place it <button id="ml-mode-stop">Done</button>`
      : `<b>Deleting mode</b> · click a structure to put it away <button id="ml-mode-stop">Done</button>`;
    if (m) $('#ml-mode-stop').onclick = () => setMode(null);
  }

  // ---------------------------------------------------------------- the Miniland window
  const win = $('#ml-window');
  let tab = 'home';
  function openWindow() {
    if (!map) return;
    refreshDay();
    win.hidden = false;
    game.dialog = true;
    renderWindow();
  }
  function closeWindow() { if (!win.hidden) { win.hidden = true; game.dialog = false; } }
  const owned = () => Object.entries(st.owned).filter(([, n]) => n > 0);
  function renderWindow() {
    if (win.hidden) return;
    const games = st.placed.filter((e) => CATALOG[e.id].kind === 'game');
    const hasGame = (id) => st.placed.some((e) => e.id === id) || st.owned[id];
    const shop = Object.entries(CATALOG).map(([id, c]) => {
      const own = c.kind === 'game' && hasGame(id);
      return `<div class="ml-item"><b>${c.name}</b><small>${c.kind === 'game' ? 'Minigame' : 'Decoration'}${c.desc ? ` · ${c.desc}` : ''}</small>
        <button data-buy="${id}" ${own || st.gold < c.price ? 'disabled' : ''}>${own ? 'Owned' : `${c.price} gold`}</button></div>`;
    }).join('');
    const store = owned().map(([id, n]) => `<div class="ml-item"><b>${CATALOG[id].name}</b><small>${n} in storage</small><button data-install="${id}">Install</button></div>`).join('')
      || '<p class="ml-empty">Nothing in storage. Buy structures in the shop.</p>';
    const dur = games.map((e) => {
      const d = st.dur[e.id] ?? DUR_MAX, cost = DUR_MAX - d;
      return `<div class="ml-item"><b>${CATALOG[e.id].name}</b><small>Durability ${d} / ${DUR_MAX}</small><button data-repair="${e.id}" ${cost === 0 || st.gold < cost ? 'disabled' : ''}>${cost === 0 ? 'Full' : `Repair · ${cost} gold`}</button></div>`;
    }).join('') || '<p class="ml-empty">No minigames installed yet.</p>';
    $('#ml-body').innerHTML = tab === 'home' ? `
      <div class="ml-stats">
        <div><small>Visits</small><b>${st.visits.today} today · ${st.visits.total} total</b></div>
        <div><small>Production points</small><b>${st.pp} / ${PP_MAX}</b></div>
        <div><small>Gold</small><b>${st.gold}</b></div>
      </div>
      <label class="ml-msg"><small>Welcome message</small><input id="ml-message" type="text" maxlength="60" value="${st.message.replace(/"/g, '&quot;')}"></label>
      <div class="ml-row">
        <div class="ml-seg" role="group" aria-label="Miniland access">
          <button data-open="1" class="${st.open ? 'on' : ''}">Public</button><button data-open="0" class="${st.open ? '' : 'on'}">Private</button>
        </div>
        <button id="ml-delete" ${st.open ? 'disabled title="Set your Miniland to Private first"' : ''}>Deleting mode</button>
      </div>
      <label class="ml-toggle"><input type="checkbox" id="ml-pet" ${st.petHome ? '' : 'checked'}> Dachshund travels with me <small>(unchecked: stays home in the Miniland)</small></label>
      <h4>Storage ${st.open ? '<small>· set Private to install</small>' : ''}</h4>${store}
      <h4>Minigames</h4>${dur}` : `<h4>Shop <small>· you have ${st.gold} gold</small></h4>${shop}`;
    for (const t of win.querySelectorAll('[data-tab]')) t.classList.toggle('on', t.dataset.tab === tab);
    const msg = $('#ml-message');
    if (msg) msg.onchange = () => { st.message = msg.value.trim() || 'Welcome to my Miniland!'; save(); };
    $('#ml-pet') && ($('#ml-pet').onchange = (e) => { st.petHome = !e.target.checked; save(); });
    $('#ml-delete') && ($('#ml-delete').onclick = () => { closeWindow(); setMode({ remove: true }); });
    for (const b of win.querySelectorAll('[data-open]')) b.onclick = () => { st.open = b.dataset.open === '1'; if (st.open) setMode(null); save(); renderWindow(); };
    for (const b of win.querySelectorAll('[data-install]')) b.onclick = () => {
      if (st.open) { audio.sfx('denied'); return toast('Set your Miniland to Private to install structures.'); }
      closeWindow(); setMode({ install: b.dataset.install });
    };
    for (const b of win.querySelectorAll('[data-buy]')) b.onclick = () => {
      const id = b.dataset.buy, c = CATALOG[id];
      if (st.gold < c.price) return;
      st.gold -= c.price; st.owned[id] = (st.owned[id] || 0) + 1;
      audio.sfx('stones'); toast(`Bought ${c.name}. Find it in your storage.`); save(); renderWindow();
    };
    for (const b of win.querySelectorAll('[data-repair]')) b.onclick = () => {
      const id = b.dataset.repair, cost = DUR_MAX - (st.dur[id] ?? DUR_MAX);
      if (st.gold < cost) return;
      st.gold -= cost; st.dur[id] = DUR_MAX; audio.sfx('heal'); save(); renderWindow();
    };
  }
  for (const t of win.querySelectorAll('[data-tab]')) t.onclick = () => { tab = t.dataset.tab; renderWindow(); };
  $('#ml-close').onclick = closeWindow;

  // ---------------------------------------------------------------- minigames
  const mg = $('#minigame');
  let run = null;       // the running game: { id, stop() }
  function openGame(id) {
    refreshDay();
    game.dialog = true;
    mg.hidden = false;
    $('#mg-title').textContent = CATALOG[id].name;
    $('#mg-desc').textContent = CATALOG[id].desc;
    $('#mg-info').textContent = `Production points ${st.pp} / ${PP_MAX} · Durability ${st.dur[id] ?? DUR_MAX} / ${DUR_MAX}`;
    $('#mg-area').innerHTML = '';
    $('#mg-result').hidden = true;
    $('#mg-start').hidden = false;
    $('#mg-score').textContent = '';
    $('#mg-start').onclick = () => start(id);
  }
  function closeGame() { run?.stop(); run = null; mg.hidden = true; game.dialog = false; }
  $('#mg-close').onclick = closeGame;
  function levelOf(score, steps) { return 1 + steps.filter((t) => score >= t).length; }
  function finish(id, score, steps) {
    run?.stop(); run = null;
    const lv = levelOf(score, steps);
    audio.sfx(lv >= 4 ? 'levelUp' : 'jobUp');
    const r = REWARDS[lv], durCost = DUR_COST(lv), dur = st.dur[id] ?? DUR_MAX;
    const res = $('#mg-result');
    res.hidden = false;
    $('#mg-start').hidden = true;
    const why = st.pp < PP_COST ? 'Not enough Production points today.' : dur < durCost ? 'This game needs repairs (Miniland window).' : '';
    res.innerHTML = `<div class="mg-level">${'★'.repeat(lv)}${'☆'.repeat(5 - lv)}<b>Level ${lv}</b></div>
      <p>Score ${score} · Reward: ${r.gold} gold${r.saat ? ` + ${r.saat} Saat` : ''}</p>
      <button id="mg-take" class="primary" ${why ? 'disabled' : ''}>Take reward · −${PP_COST} Production points</button>
      ${why ? `<p class="mg-why">${why}</p>` : ''}
      <button id="mg-again">Play again</button>`;
    $('#mg-take').onclick = () => {
      st.pp -= PP_COST; st.dur[id] = dur - durCost; st.gold += r.gold; game.saat += r.saat;
      audio.sfx('pop'); toast(`+${r.gold} gold${r.saat ? ` · +${r.saat} Saat` : ''}`); save(); openGame(id);
    };
    $('#mg-again').onclick = () => openGame(id);
  }
  function start(id) {
    $('#mg-start').hidden = true;
    $('#mg-result').hidden = true;
    const area = $('#mg-area');
    area.innerHTML = '';
    run = GAMES[id](area, (score, steps) => finish(id, score, steps), (s) => { $('#mg-score').textContent = s; });
  }
  // each game: (area, done(score, levelSteps), show(text)) -> { stop() }
  const GAMES = {
    // timing bar: 10 chops, marker speeds up, zone shrinks
    wood(area, done, show) {
      area.innerHTML = '<div class="mg-bar"><i class="zone"></i><i class="mark"></i></div><button class="mg-act">Chop! <kbd>Space</kbd></button>';
      const bar = area.querySelector('.mg-bar'), zone = bar.querySelector('.zone'), mark = bar.querySelector('.mark');
      let chop = 0, score = 0, pos = 0, dir = 1, z0 = 0, zw = 0, raf, last = performance.now();
      const newZone = () => { zw = Math.max(0.08, 0.22 - chop * 0.014); z0 = 0.1 + Math.random() * (0.8 - zw); zone.style.left = `${z0 * 100}%`; zone.style.width = `${zw * 100}%`; };
      const tick = (now) => { const dt = (now - last) / 1000; last = now; pos += dir * dt * (0.55 + chop * 0.09); if (pos > 1) { pos = 1; dir = -1; } if (pos < 0) { pos = 0; dir = 1; } mark.style.left = `${pos * 100}%`; raf = requestAnimationFrame(tick); };
      const hit = () => {
        const c = z0 + zw / 2, d = Math.abs(pos - c);
        const pts = d < zw * 0.18 ? 3 : d < zw / 2 ? 2 : d < zw / 2 + 0.05 ? 1 : 0;
        score += pts; chop++;
        audio.sfx(pts ? 'hit' : 'miss');
        bar.classList.remove('good', 'bad'); void bar.offsetWidth; bar.classList.add(pts >= 2 ? 'good' : 'bad');
        show(`Chop ${chop} / 10 · Score ${score}`);
        if (chop >= 10) return done(score, [6, 12, 18, 24]);
        newZone();
      };
      const key = (e) => { if (e.code === 'Space') { e.preventDefault(); e.stopPropagation(); hit(); } };
      area.querySelector('.mg-act').onclick = hit;
      addEventListener('keydown', key, true);
      newZone(); show('Chop 0 / 10 · Score 0'); raf = requestAnimationFrame(tick);
      return { stop() { cancelAnimationFrame(raf); removeEventListener('keydown', key, true); } };
    },
    // 3x3 rocks, one glows at a time; strike it before it fades. 20 seconds
    mining(area, done, show) {
      area.innerHTML = `<div class="mg-rocks">${Array.from({ length: 9 }, (_, i) => `<button data-i="${i}" aria-label="Rock ${i + 1}"></button>`).join('')}</div>`;
      const rocks = [...area.querySelectorAll('button')];
      let score = 0, lit = -1, litAt = 0, t0 = performance.now(), raf, window_ = 1.1;
      const light = () => { rocks.forEach((r) => r.classList.remove('lit')); let n; do n = Math.floor(Math.random() * 9); while (n === lit); lit = n; rocks[n].classList.add('lit'); litAt = performance.now(); };
      rocks.forEach((r, i) => (r.onclick = () => {
        if (i === lit) { score++; audio.sfx('hit'); window_ = Math.max(0.5, window_ - 0.03); light(); }
        else { score = Math.max(0, score - 1); audio.sfx('miss'); r.classList.add('bad'); setTimeout(() => r.classList.remove('bad'), 200); }
      }));
      const tick = (now) => {
        const left = 20 - (now - t0) / 1000;
        if (left <= 0) return done(score, [6, 11, 16, 21]);
        if ((now - litAt) / 1000 > window_) light();
        show(`${Math.ceil(left)} s · Ore ${score}`);
        raf = requestAnimationFrame(tick);
      };
      light(); raf = requestAnimationFrame(tick);
      return { stop() { cancelAnimationFrame(raf); } };
    },
    // 6 casts: wait for the bite, pull fast. Pulling too early loses the fish
    fishing(area, done, show) {
      area.innerHTML = '<div class="mg-pond"><div class="bob"></div><b class="bite">!</b></div><button class="mg-act">Pull! <kbd>Space</kbd></button>';
      const pond = area.querySelector('.mg-pond');
      let cast = 0, score = 0, biteAt = 0, timer, waiting = false;
      const next = () => {
        if (cast >= 6) return done(score, [6, 12, 18, 24]);
        cast++; waiting = true; biteAt = 0; pond.classList.remove('biting');
        show(`Cast ${cast} / 6 · Score ${score} · wait for the bite…`);
        timer = setTimeout(() => { biteAt = performance.now(); pond.classList.add('biting'); audio.sfx('alert'); timer = setTimeout(() => { if (waiting) { waiting = false; audio.sfx('miss'); show(`Too slow! · Score ${score}`); timer = setTimeout(next, 900); } }, 900); }, 1200 + Math.random() * 2300);
      };
      const pull = () => {
        if (!waiting) return;
        waiting = false; clearTimeout(timer); pond.classList.remove('biting');
        if (!biteAt) { audio.sfx('miss'); show(`Too early, the fish swam off · Score ${score}`); }
        else { const rt = (performance.now() - biteAt) / 1000, pts = rt < 0.3 ? 5 : rt < 0.5 ? 3 : 1; score += pts; audio.sfx('pop'); show(`Caught! ${rt.toFixed(2)} s · +${pts} · Score ${score}`); }
        timer = setTimeout(next, 900);
      };
      const key = (e) => { if (e.code === 'Space') { e.preventDefault(); e.stopPropagation(); pull(); } };
      area.querySelector('.mg-act').onclick = pull;
      addEventListener('keydown', key, true);
      next();
      return { stop() { clearTimeout(timer); removeEventListener('keydown', key, true); } };
    },
    // chickens run across the yard; click them. Golden chickens count 3. 25 seconds
    chicken(area, done, show) {
      area.innerHTML = '<div class="mg-yard"></div>';
      const yard = area.querySelector('.mg-yard');
      let score = 0, t0 = performance.now(), last = t0, spawnIn = 0, raf;
      const birds = new Set();
      const tick = (now) => {
        const dt = (now - last) / 1000; last = now;
        const el = (now - t0) / 1000, left = 25 - el;
        if (left <= 0) return done(score, [5, 10, 16, 22]);
        if ((spawnIn -= dt) <= 0) {
          spawnIn = Math.max(0.35, 1.0 - el * 0.025) * (0.6 + Math.random() * 0.8);
          const b = document.createElement('button');
          const gold = Math.random() < 0.12, fromLeft = Math.random() < 0.5;
          b.className = `bird${gold ? ' gold' : ''}${fromLeft ? '' : ' flip'}`;
          b.setAttribute('aria-label', gold ? 'Golden chicken' : 'Chicken');
          const bird = { el: b, x: fromLeft ? -0.08 : 1.02, v: (fromLeft ? 1 : -1) * (0.22 + el * 0.012 + Math.random() * 0.12) * (gold ? 1.5 : 1), gold };
          b.style.top = `${10 + Math.random() * 70}%`;
          b.onpointerdown = (e) => { e.preventDefault(); score += gold ? 3 : 1; audio.sfx('pop'); b.remove(); birds.delete(bird); };
          yard.appendChild(b); birds.add(bird);
        }
        for (const bd of birds) { bd.x += bd.v * dt; bd.el.style.left = `${bd.x * 100}%`; if (bd.x < -0.1 || bd.x > 1.1) { bd.el.remove(); birds.delete(bd); } }
        show(`${Math.ceil(left)} s · Chickens ${score}`);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return { stop() { cancelAnimationFrame(raf); } };
    },
  };

  // ---------------------------------------------------------------- per frame: labels over minigames
  function update() {
    for (const b of built) {
      if (!b.label) continue;
      const d = st.dur[b.entry.id] ?? DUR_MAX;
      const txt = `${CATALOG[b.entry.id].name}<small>${d < DUR_COST(5) ? 'Needs repair' : 'Click to play'}</small>`;
      if (b.label.innerHTML !== txt) b.label.innerHTML = txt;
      placeLabel(b.label, b.group.position, 3.2);
    }
  }

  return {
    state: st, save, onEnter, onLeave, click, pickables, update, openWindow, closeWindow,
    get active() { return !!map; }, get mode() { return mode; }, setMode,
    addGold(n) { st.gold += n; save(); },
    get windowOpen() { return !win.hidden || !mg.hidden; },
  };
}
