// Miniland, as in NosTale: your own home plot.
//
// - The plot has three zones (see MAPS.miniland.zones): the stone Terrace (warehouses, carpets, pots,
//   tables, lanterns), the Garden (residences, the dog kennel, garden decorations) and the Production
//   area (minigames only). Installing in the wrong zone is refused, like in NosTale.
// - The Miniland menu (L or the Miniland button) works everywhere: status, visitors, Production
//   points, welcome message, Lock (required for Install / Delete mode), objects, minigames,
//   warehouse and NosMates. Outside the Miniland it offers the Bell of Sweet Home to go there.
// - Objects are bought from NPCs in town: Mimi (Miniland furniture and minigames), Malcolm (Bells of
//   Sweet Home), Gerta (buys materials). Residences set how many visitors fit; warehouses store materials.
// - Minigames (Quarry, Sawmill, Pond, Shooting Range; Easy / Medium / Good tiers) are small arcade
//   games. The score gives a reward level 1-5 of that game's materials. Taking a reward costs
//   100 Production points (2000 per day, Production Coupons add 500) and durability (repair with gold).
// State is saved in the browser (localStorage) when available.
import * as THREE from 'three';
import { ToonMat } from './anime.js';
import { prop } from './props.js';
import { PROP_MAT } from './voxel.js';
import './miniland-props.js';
import { MAX_MATES, mateXpNeeded } from './companions.js';

const SAVE_KEY = 'voxelquest-miniland-v2';
export const PP_MAX = 2000;
const PP_COST = 100, PP_COUPON = 500, DUR_MAX = 1000, BAG_SLOTS = 20, STACK = 99;
const today = () => new Date().toDateString();
const ZONE_NAME = { garden: 'Garden', terrace: 'Terrace', production: 'Production area' };
const TIERS = ['Easy', 'Medium', 'Good'];

// every Miniland object: zone, model [prop kind, variant], price (Mimi's shop), extra stats
export const OBJECTS = {
  tent: { name: 'Canvas Tent', cat: 'Residence', zone: 'garden', model: ['ml_tent', 0], price: 300, visitors: 5, desc: 'A striped tent. Room for 5 visitors.' },
  cabin: { name: 'Wooden Cabin', cat: 'Residence', zone: 'garden', model: ['ml_cabin', 0], price: 1600, visitors: 10, desc: 'A log cabin with a red roof. Room for 10 visitors.' },
  villa: { name: 'Stone Villa', cat: 'Residence', zone: 'garden', model: ['ml_villa', 0], price: 5000, visitors: 20, desc: 'A proper stone house. Room for 20 visitors.' },
  chest_tiny: { name: 'Tiny Chest', cat: 'Warehouse', zone: 'terrace', model: ['ml_chest_tiny', 0], price: 200, slots: 7, desc: 'Warehouse with 7 slots.' },
  chest: { name: 'Iron-bound Chest', cat: 'Warehouse', zone: 'terrace', model: ['ml_chest', 0], price: 700, slots: 14, desc: 'Warehouse with 14 slots.' },
  cabinet: { name: 'Oak Cabinet', cat: 'Warehouse', zone: 'terrace', model: ['ml_cabinet', 0], price: 1500, slots: 21, desc: 'Warehouse with 21 slots.' },
  shed: { name: 'Storage Shed', cat: 'Warehouse', zone: 'garden', model: ['ml_shed', 0], price: 3200, slots: 35, desc: 'Warehouse with 35 slots. Too big for the terrace.' },
  kennel: { name: 'Dog Kennel', cat: 'NosMate', zone: 'garden', model: ['ml_kennel', 0], price: 250, desc: 'Your dachshund naps here when he stays home.' },
  carpet_red: { name: 'Royal Carpet', cat: 'Terrace', zone: 'terrace', model: ['ml_carpet', 0], price: 120, flat: true, desc: 'Red and gold rug.' },
  carpet_blue: { name: 'Harbour Carpet', cat: 'Terrace', zone: 'terrace', model: ['ml_carpet', 1], price: 120, flat: true, desc: 'Blue and cream rug.' },
  pot_flower: { name: 'Flower Pot', cat: 'Terrace', zone: 'terrace', model: ['ml_pot', 0], price: 40, desc: 'Clay pot full of flowers.' },
  pot_palm: { name: 'Potted Palm', cat: 'Terrace', zone: 'terrace', model: ['ml_pot', 1], price: 60, desc: 'A small palm in a pot.' },
  pot_cactus: { name: 'Potted Cactus', cat: 'Terrace', zone: 'terrace', model: ['ml_pot', 2], price: 50, desc: 'Prickly but cute.' },
  teatable: { name: 'Tea Table', cat: 'Terrace', zone: 'terrace', model: ['ml_teatable', 0], price: 220, desc: 'Round table with two stools and tea.' },
  lantern: { name: 'Paper Lantern', cat: 'Terrace', zone: 'terrace', model: ['ml_lantern', 0], price: 90, desc: 'A red lantern on a pole.' },
  flowerbed: { name: 'Flower Bed', cat: 'Garden', zone: 'garden', model: ['ml_flowerbed', 0], price: 80, desc: 'Colourful flowers in a wooden bed.' },
  well: { name: 'Wishing Well', cat: 'Garden', zone: 'garden', model: ['ml_well', 0], price: 450, desc: 'Stone well with a little roof.' },
  windmill: { name: 'Garden Windmill', cat: 'Garden', zone: 'garden', model: ['ml_windmill', 0], price: 600, desc: 'A small windmill.' },
  statue: { name: 'Hero Statue', cat: 'Garden', zone: 'garden', model: ['ml_statue', 0], price: 900, desc: 'A statue of you, sword raised.' },
  bench: { name: 'Garden Bench', cat: 'Garden', zone: 'garden', model: ['ml_bench', 0], price: 70, desc: 'Take a seat.' },
  gnome: { name: 'Garden Gnome', cat: 'Garden', zone: 'garden', model: ['ml_gnome', 0], price: 35, desc: 'He watches over your flowers.' },
  signpost: { name: 'Miniland Signpost', cat: 'Garden', zone: 'garden', model: ['ml_signpost', 0], price: 100, desc: 'Shows your welcome message.' },
  quarry: { name: 'Quarry', cat: 'Minigame', zone: 'production', model: ['ml_quarry', 0], price: 600, game: true, desc: 'Mine the rock with ↑, squash caterpillars with ← →.' },
  sawmill: { name: 'Sawmill', cat: 'Minigame', zone: 'production', model: ['ml_sawmill', 0], price: 800, game: true, desc: 'Saw the logs on two belts with ↑ ↓ at the mark. Combos up to ×10.' },
  pond: { name: 'Fish Pond', cat: 'Minigame', zone: 'production', model: ['ml_pond', 0], price: 1000, game: true, desc: 'Four rods (← ↑ ↓ →). Golden fish need an arrow combo; leave the devils.' },
  range: { name: 'Shooting Range', cat: 'Minigame', zone: 'production', model: ['ml_range', 0], price: 1200, game: true, desc: 'Shoot chickens and vampires with ← →, reload with ↓. Hit the golden rooster!' },
};
// materials: [common, uncommon, rare] per minigame; sell prices at Gerta's
export const MATERIALS = {
  stone: { name: 'Stone', color: '#9a968c', price: 4 }, iron: { name: 'Iron Ore', color: '#8a6a5a', price: 15 }, crystal: { name: 'Crystal', color: '#6ae8ff', price: 60 },
  timber: { name: 'Timber', color: '#b08a52', price: 4 }, hardwood: { name: 'Hardwood', color: '#6a4428', price: 15 }, resin: { name: 'Amber Resin', color: '#f2a83a', price: 60 },
  carp: { name: 'Carp', color: '#8ab0c8', price: 4 }, mackerel: { name: 'Mackerel', color: '#3a6ab8', price: 15 }, pearl: { name: 'Pearl', color: '#f4f0f8', price: 60 },
  feather: { name: 'Feather', color: '#f4f0e8', price: 4 }, egg: { name: 'Egg', color: '#f2e2b8', price: 15 }, gfeather: { name: 'Golden Feather', color: '#ffd24a', price: 60 },
};
const GAME_MATS = { quarry: ['stone', 'iron', 'crystal'], sawmill: ['timber', 'hardwood', 'resin'], pond: ['carp', 'mackerel', 'pearl'], range: ['feather', 'egg', 'gfeather'] };
const UPGRADE = [null, { gold: 800, mats: [30, 15, 0] }, { gold: 2500, mats: [50, 30, 8] }];
export const SHOP_ITEMS = { bell: { name: 'Bell of Sweet Home', price: 150, desc: 'Go to your Miniland from anywhere; the exit brings you back.' }, coupon: { name: 'Production Coupon', price: 300, desc: '+500 Production points today.' } };

function defaultState() {
  return { gold: 0, bells: 3, coupons: 0, pp: PP_MAX, ppDay: today(), locked: false, message: 'Welcome to my Miniland!',
    visits: { total: 0, today: 0, day: today() }, storage: {}, placed: [], games: {}, bag: {}, wh: {}, petHome: false, gift: true, uid: 1, mates: [], activeMate: null };
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (s && typeof s === 'object') return { ...defaultState(), ...s };
  } catch { /* storage unavailable */ }
  return defaultState();
}
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createMiniland({ $, toast, audio, fx, game, player, placeLabel, labelsEl, bellTravel, onMates }) {
  const st = load();
  const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(st)); } catch { /* not saved */ } };
  const refreshDay = () => {
    if (st.ppDay !== today()) { st.pp = PP_MAX; st.ppDay = today(); }
    if (st.visits.day !== today()) { st.visits.today = 0; st.visits.day = today(); }
  };
  refreshDay();
  let map = null;
  const built = [];            // { entry, group, r, label }
  let mode = null;             // null | { install: id } | { remove: true }
  let ghost = null, overlays = null;

  // ---------------------------------------------------------------- inventory helpers
  const slotsUsed = (inv) => Object.values(inv).reduce((n, c) => n + Math.ceil(c / STACK), 0);
  const whSlots = () => Math.max(0, ...st.placed.map((e) => OBJECTS[e.id].slots || 0));
  const addTo = (inv, cap, id, n) => {
    let added = 0;
    while (added < n) {
      const c = inv[id] || 0;
      if (c % STACK === 0 && slotsUsed(inv) >= cap) break;           // needs a new stack and none is free
      inv[id] = c + 1; added++;
    }
    return added;
  };
  const count = (id) => (st.bag[id] || 0) + (st.wh[id] || 0);
  const take = (id, n) => { const b = Math.min(n, st.bag[id] || 0); st.bag[id] = (st.bag[id] || 0) - b; st.wh[id] = (st.wh[id] || 0) - (n - b); for (const inv of [st.bag, st.wh]) if (!inv[id]) delete inv[id]; };
  const residence = () => st.placed.map((e) => OBJECTS[e.id]).filter((o) => o.visitors).sort((a, b) => b.visitors - a.visitors)[0];

  // ---------------------------------------------------------------- zones
  function zoneAt(x, z) {
    if (!map) return null;
    const { zones } = map.def;
    const inRect = ([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
    if (Math.abs(x) > map.W / 2 - 10.5 || Math.abs(z) > map.D / 2 - 10.5) return null;
    if (map.portals.some((p) => Math.hypot(x - p.pos.x, z - p.pos.z) < 8)) return null;
    for (const [k, r] of Object.entries(zones)) if (inRect(r)) return k;
    return 'garden';
  }
  function showOverlays(on) {
    if (!map) return;
    if (!overlays) {
      overlays = new THREE.Group();
      const add = (r, color) => {
        const [x0, z0, x1, z1] = r;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false }));
        m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0.08, (z0 + z1) / 2);
        overlays.add(m);
      };
      const g = map.W / 2 - 10.5;
      add([-g, -g, g, g], 0x7ccf5a);
      add(map.def.zones.terrace, 0xd8b04a);
      add(map.def.zones.production, 0xc8683a);
      overlays.children.forEach((m, i) => { m.position.y += i * 0.02; });
      overlays.labels = Object.entries({ garden: [-11, 6], terrace: [0, -11.5], production: [10.5, 5] }).map(([k, [x, z]]) => {
        const el = document.createElement('div'); el.className = 'ml-zone-label'; el.textContent = ZONE_NAME[k]; labelsEl.appendChild(el);
        return { el, pos: new THREE.Vector3(x, 0, z) };
      });
    }
    overlays.visible = on;
    for (const l of overlays.labels) l.el.hidden = !on;
    if (on && !overlays.parent) map.group.add(overlays);
  }

  // ---------------------------------------------------------------- objects in the world
  function makeModel(id, tier = 0) {
    const o = OBJECTS[id], [kind, variant] = o.model;
    const p = prop(kind, o.game ? tier : variant);
    const m = new THREE.Mesh(p.geo, PROP_MAT);
    m.castShadow = !o.flat; m.receiveShadow = true;
    const g = new THREE.Group(); g.add(m);
    if (o.flat) m.position.y = 0.02;
    return { group: g, r: Math.max(0.5, p.footprint || 0.6) };
  }
  const radius = (id) => { const [k, v] = OBJECTS[id].model; return Math.max(0.5, prop(k, v).footprint || 0.6); };
  function spawn(entry) {
    const o = OBJECTS[entry.id];
    const { group, r } = makeModel(entry.id, st.games[entry.id]?.tier || 0);
    group.position.set(entry.x, map.heightAt(entry.x, entry.z), entry.z);
    group.rotation.y = entry.ry || 0;
    group.traverse((q) => { q.userData.miniland = entry; });
    map.group.add(group);
    if (!o.flat) map.setBlock(entry.x, entry.z, r * 0.85, true);
    let label = null;
    if (o.game || o.slots || o.id === 'signpost' || entry.id === 'signpost') {
      label = document.createElement('div'); label.className = 'ml-game-label'; labelsEl.appendChild(label);
    }
    built.push({ entry, group, r, label });
  }
  function unspawn(b) { map?.group.remove(b.group); if (!OBJECTS[b.entry.id].flat) map?.setBlock(b.entry.x, b.entry.z, b.r * 0.85, false); b.label?.remove(); }
  function clearBuilt() { for (const b of built) unspawn(b); built.length = 0; }

  function onEnter(m) {
    map = m;
    refreshDay();
    clearBuilt();
    for (const e of st.placed) spawn(e);
    st.visits.total++; st.visits.today++;
    if (st.gift) {
      st.gift = false;
      for (const id of ['tent', 'chest_tiny', 'quarry', 'kennel']) st.storage[id] = (st.storage[id] || 0) + 1;
      setTimeout(() => toast('Welcome to your Miniland! Housewarming gifts: a Canvas Tent, a Tiny Chest, a Dog Kennel and a Quarry. Press L, lock your Miniland and use Install mode.', 8000), 1200);
    } else setTimeout(() => toast(`“${st.message}”`, 3500), 900);
    save();
  }
  function onLeave() { setMode(null); closeWindow(); closeGame(); clearBuilt(); if (overlays) { overlays.labels.forEach((l) => l.el.remove()); overlays.parent?.remove(overlays); overlays = null; } map = null; }

  // ---------------------------------------------------------------- install / delete mode
  function setMode(m) {
    mode = m;
    if (ghost) { ghost.parent?.remove(ghost); ghost = null; }
    showOverlays(!!m);
    const bar = $('#ml-mode');
    bar.hidden = !m;
    if (!m) return;
    if (m.remove) bar.innerHTML = '<b>Deleting mode</b><span>Click an object to put it back into storage.</span><button id="ml-mode-stop">Done</button>';
    else {
      const items = Object.entries(st.storage).filter(([, n]) => n > 0);
      bar.innerHTML = `<b>Installing mode</b><div class="ml-tray">${items.map(([id, n]) => `<button data-pick="${id}" class="${m.install === id ? 'on' : ''}" title="${esc(OBJECTS[id].desc)}">${esc(OBJECTS[id].name)}<small>${ZONE_NAME[OBJECTS[id].zone]} · ×${n}</small></button>`).join('') || '<span>Storage is empty. Buy objects from Mimi in Mossvale.</span>'}</div><button id="ml-mode-stop">Done</button>`;
      for (const b of bar.querySelectorAll('[data-pick]')) b.onclick = () => setMode({ install: b.dataset.pick });
      if (m.install) {
        ghost = makeModel(m.install, 0).group;
        ghost.traverse((q) => { if (q.isMesh) { q.material = new ToonMat({ vertexColors: true, transparent: true, opacity: 0.6 }); q.castShadow = false; } });
        ghost.visible = false;
        map.group.add(ghost);
      }
    }
    $('#ml-mode-stop').onclick = () => setMode(null);
  }
  function hover(p) {
    if (!ghost || !p) return;
    const x = Math.round(p.x * 2) / 2, z = Math.round(p.z * 2) / 2;
    ghost.visible = true;
    ghost.position.set(x, map.heightAt(x, z) + 0.05, z);
    ghost.rotation.y = mode.ry || 0;
    const ok = canPlace(mode.install, x, z) === true;
    ghost.traverse((q) => { if (q.isMesh) q.material.color.set(ok ? 0xb8ffb0 : 0xff8a7a); });
  }
  function canPlace(id, x, z) {
    const o = OBJECTS[id], zone = zoneAt(x, z);
    if (!zone) return 'You cannot build there.';
    if (zone !== o.zone) return `${o.name} can only be installed in the ${ZONE_NAME[o.zone]}.`;
    const r = radius(id);
    if (!o.flat && built.some((b) => !OBJECTS[b.entry.id].flat && Math.hypot(b.entry.x - x, b.entry.z - z) < b.r + r * 0.8)) return 'Too close to another object.';
    if (!o.flat && Math.hypot(player.pos.x - x, player.pos.z - z) < r + 0.4) return 'You are standing there.';
    if (o.game && st.placed.some((e) => e.id === id)) return 'That minigame is already installed.';
    return true;
  }
  function install(id, p) {
    const x = Math.round(p.x * 2) / 2, z = Math.round(p.z * 2) / 2;
    const ok = canPlace(id, x, z);
    if (ok !== true) { audio.sfx('denied'); return toast(ok); }
    const entry = { uid: st.uid++, id, x, z, ry: mode.ry || 0 };
    st.storage[id]--; if (!st.storage[id]) delete st.storage[id];
    if (OBJECTS[id].game && !st.games[id]) st.games[id] = { tier: 0, dur: DUR_MAX };
    st.placed.push(entry);
    spawn(entry);
    fx.ring(new THREE.Vector3(x, map.heightAt(x, z), z), 0xfff2c0, 2.2, 0.06, 0.5);
    audio.sfx('click');
    save();
    setMode(st.storage[id] ? { install: id, ry: mode.ry } : { install: null });
  }
  function remove(entry) {
    const i = built.findIndex((b) => b.entry === entry);
    if (i < 0) return;
    if (OBJECTS[entry.id].slots && slotsUsed(st.wh) > 0 && st.placed.filter((e) => OBJECTS[e.id].slots).length === 1) {
      audio.sfx('denied'); return toast('Empty your warehouse before putting it away.');
    }
    unspawn(built[i]); built.splice(i, 1);
    st.placed.splice(st.placed.indexOf(entry), 1);
    st.storage[entry.id] = (st.storage[entry.id] || 0) + 1;
    audio.sfx('click'); toast(`${OBJECTS[entry.id].name} put back into storage.`); save();
  }

  // ---------------------------------------------------------------- clicks
  function click(obj, ground) {
    if (!map) return false;
    if (mode?.install && ground) { install(mode.install, ground); return true; }
    if (mode?.install === null) return true;
    const entry = obj?.userData.miniland;
    if (mode?.remove) { if (entry) remove(entry); return true; }
    if (!entry) return false;
    const o = OBJECTS[entry.id], b = built.find((q) => q.entry === entry);
    const d = Math.hypot(entry.x - player.pos.x, entry.z - player.pos.z);
    if (!o.game && !o.slots) { if (entry.id === 'signpost') toast(`Signpost: “${st.message}”`, 4000); return entry.id === 'signpost'; }
    if (d > b.r + 2.4) {
      const dir = new THREE.Vector3(player.pos.x - entry.x, 0, player.pos.z - entry.z).normalize();
      player.target = new THREE.Vector3(entry.x + dir.x * (b.r + 1.2), 0, entry.z + dir.z * (b.r + 1.2));
      player.target.y = map.heightAt(player.target.x, player.target.z);
      return true;
    }
    if (o.game) openGame(entry.id); else { tab = 'warehouse'; openWindow(); }
    return true;
  }
  const pickables = () => built.map((b) => b.group);

  // ---------------------------------------------------------------- the Miniland menu
  const win = $('#ml-window');
  let tab = 'overview';
  function openWindow() { refreshDay(); win.hidden = false; game.dialog = true; render(); }
  function closeWindow() { if (!win.hidden) { win.hidden = true; if ($('#minigame').hidden && $('#shop').hidden) game.dialog = false; } }
  function render() {
    if (win.hidden) return;
    const inside = !!map;
    const res = residence();
    for (const t of win.querySelectorAll('[data-tab]')) { t.classList.toggle('on', t.dataset.tab === tab); t.hidden = !inside && !['overview', 'bag', 'mates'].includes(t.dataset.tab); }
    if (!inside && !['overview', 'bag', 'mates'].includes(tab)) tab = 'overview';
    const B = $('#ml-body');
    if (tab === 'overview') {
      B.innerHTML = `
        <div class="ml-status ${st.locked ? 'locked' : ''}">${st.locked ? 'Locked · only you can enter' : 'Public · visitors welcome'}</div>
        <div class="ml-stats">
          <div><small>Visitors</small><b>${st.visits.today} today · ${st.visits.total} total</b></div>
          <div><small>Capacity</small><b>${res ? `${res.visitors} (${res.name})` : '3 (no residence)'}</b></div>
          <div><small>Production points</small><b>${st.pp} / ${PP_MAX}</b></div>
          <div><small>Gold</small><b>${st.gold}</b></div>
        </div>
        ${inside ? `
        <label class="ml-msg"><small>Welcome message</small><input id="ml-message" type="text" maxlength="60" value="${esc(st.message)}"></label>
        <label class="ml-toggle"><input type="checkbox" id="ml-lock" ${st.locked ? 'checked' : ''}> Lock Miniland <small>(needed for Install and Delete mode)</small></label>
        <div class="ml-row"><button id="ml-install" ${st.locked ? '' : 'disabled'}>Installing mode</button><button id="ml-delete" ${st.locked ? '' : 'disabled'}>Deleting mode</button></div>
        <div class="ml-row">${st.coupons ? `<button id="ml-coupon">Use Production Coupon (${st.coupons})</button>` : ''}</div>`
        : `<p class="ml-lead">You are away from home. The Miniland entrance is south of Mossvale, or ring a Bell of Sweet Home: your position is saved and the Miniland exit brings you back.</p>
        <div class="ml-row"><button id="ml-bell" class="primary" ${st.bells ? '' : 'disabled'}>Ring Bell of Sweet Home (${st.bells} left)</button></div>
        <p class="ml-note">Bells are sold by Malcolm in Mossvale.</p>`}`;
    } else if (tab === 'objects') {
      const placed = st.placed.map((e) => `<div class="ml-item"><b>${esc(OBJECTS[e.id].name)}</b><small>${ZONE_NAME[OBJECTS[e.id].zone]} · installed</small></div>`).join('');
      const stor = Object.entries(st.storage).filter(([, n]) => n > 0).map(([id, n]) => `<div class="ml-item"><b>${esc(OBJECTS[id].name)}</b><small>${OBJECTS[id].cat} · ${ZONE_NAME[OBJECTS[id].zone]} · ×${n} in storage</small></div>`).join('');
      B.innerHTML = `<h4>In storage</h4>${stor || '<p class="ml-empty">Nothing in storage. Mimi in Mossvale sells Miniland objects.</p>'}
        <h4>Installed</h4>${placed || '<p class="ml-empty">Nothing installed yet. Lock your Miniland and use Installing mode.</p>'}`;
    } else if (tab === 'games') {
      const rows = Object.keys(GAME_MATS).filter((id) => st.placed.some((e) => e.id === id) || st.storage[id]).map((id) => {
        const gs = st.games[id] || { tier: 0, dur: DUR_MAX }, up = UPGRADE[gs.tier + 1], mats = GAME_MATS[id];
        const need = up ? mats.map((m, i) => (up.mats[i] ? `${up.mats[i]} ${MATERIALS[m].name} (${count(m)})` : '')).filter(Boolean).join(', ') + ` + ${up.gold} gold` : '';
        const canUp = up && st.gold >= up.gold && mats.every((m, i) => count(m) >= up.mats[i]);
        return `<div class="ml-game"><b>${esc(OBJECTS[id].name)} · ${TIERS[gs.tier]}</b>
          <small>Durability ${gs.dur} / ${DUR_MAX} · rewards: ${mats.map((m) => MATERIALS[m].name).join(', ')}</small>
          <div class="ml-row"><button data-repair="${id}" ${gs.dur >= DUR_MAX || st.gold < DUR_MAX - gs.dur ? 'disabled' : ''}>${gs.dur >= DUR_MAX ? 'Durability full' : `Repair · ${DUR_MAX - gs.dur} gold`}</button>
          ${up ? `<button data-upgrade="${id}" ${canUp ? '' : 'disabled'} title="${esc(need)}">Upgrade to ${TIERS[gs.tier + 1]}</button>` : '<button disabled>Top tier</button>'}</div>
          ${up ? `<small class="ml-need">Upgrade needs ${esc(need)}</small>` : ''}</div>`;
      }).join('');
      B.innerHTML = `<p class="ml-note">Production points today: <b>${st.pp} / ${PP_MAX}</b>. Each reward costs ${PP_COST}.</p>${rows || '<p class="ml-empty">No minigames yet. Mimi sells them; install them in the Production area.</p>'}`;
    } else if (tab === 'warehouse') {
      const cap = whSlots();
      B.innerHTML = cap ? `<p class="ml-note">Warehouse: ${slotsUsed(st.wh)} / ${cap} slots · Bag: ${slotsUsed(st.bag)} / ${BAG_SLOTS} slots</p>
        <div class="ml-inv">${invRows(st.bag, 'bag')}</div><h4>In the warehouse</h4><div class="ml-inv">${invRows(st.wh, 'wh')}</div>`
        : '<p class="ml-empty">Install a warehouse (Tiny Chest, Iron-bound Chest, Oak Cabinet or Storage Shed) to store materials.</p>';
    } else if (tab === 'bag') {
      B.innerHTML = `<p class="ml-note">Bag: ${slotsUsed(st.bag)} / ${BAG_SLOTS} slots (${STACK} per slot) · Bells of Sweet Home: ${st.bells} · Production Coupons: ${st.coupons}</p><div class="ml-inv">${invRows(st.bag, null)}</div>`;
    } else if (tab === 'mates') {
      const kennel = st.placed.some((e) => e.id === 'kennel');
      B.innerHTML = `<div class="ml-game"><b>Dachshund</b><small>${st.petHome ? `Staying home${kennel ? ' by his kennel' : ''} in the Miniland.` : 'Travelling with you.'}</small>
        <div class="ml-row"><button id="ml-pet">${st.petHome ? 'Take him along' : 'Leave him at home'}</button></div></div>
        <h4>Caught companions <small>${st.mates.length} / ${MAX_MATES} · one travels with you, the others wait here</small></h4>
        ${st.mates.map((m) => `<div class="ml-game"><b>Lv.${m.lv} ${esc(m.name)}${m.id === st.activeMate ? ' <span class="ml-tag">With you</span>' : ''}</b>
          <small>XP ${m.lv >= 70 ? 'MAX' : `${m.xp} / ${mateXpNeeded(m.lv)}`} · ${m.id === st.activeMate ? 'Fights at your side and levels up from kills.' : 'Resting in the Miniland.'}</small>
          <div class="ml-row"><button data-mate-go="${m.id}">${m.id === st.activeMate ? 'Leave at home' : 'Take along'}</button><button data-mate-free="${m.id}">Release</button></div></div>`).join('')
          || '<p class="ml-empty">No companions yet. Weaken a monster below 50% HP and use Catch (slot 2).</p>'}`;
    }
    const q = (s) => win.querySelector(s);
    q('#ml-message') && (q('#ml-message').onchange = (e) => { st.message = e.target.value.trim() || 'Welcome to my Miniland!'; save(); });
    q('#ml-lock') && (q('#ml-lock').onchange = (e) => { st.locked = e.target.checked; if (!st.locked) setMode(null); save(); render(); });
    q('#ml-install') && (q('#ml-install').onclick = () => { closeWindow(); setMode({ install: null }); });
    q('#ml-delete') && (q('#ml-delete').onclick = () => { closeWindow(); setMode({ remove: true }); });
    q('#ml-coupon') && (q('#ml-coupon').onclick = () => { st.coupons--; st.pp += PP_COUPON; audio.sfx('heal'); save(); render(); });
    q('#ml-bell') && (q('#ml-bell').onclick = () => {
      const err = bellTravel();
      if (err) { audio.sfx('denied'); return toast(err); }
      st.bells--; save(); closeWindow();
    });
    q('#ml-pet') && (q('#ml-pet').onclick = () => { st.petHome = !st.petHome; save(); render(); });
    for (const b of win.querySelectorAll('[data-mate-go]')) b.onclick = () => {
      const id = Number(b.dataset.mateGo);
      st.activeMate = st.activeMate === id ? null : id;
      audio.sfx('click'); save(); onMates?.(); render();
    };
    for (const b of win.querySelectorAll('[data-mate-free]')) b.onclick = () => {
      if (!b.classList.contains('confirm')) { b.classList.add('confirm'); b.textContent = 'Click again to release'; return; }
      const id = Number(b.dataset.mateFree);
      st.mates = st.mates.filter((m) => m.id !== id);
      if (st.activeMate === id) st.activeMate = null;
      audio.sfx('pop'); toast('Your companion returned to the wild.'); save(); onMates?.(); render();
    };
    for (const b of win.querySelectorAll('[data-repair]')) b.onclick = () => { const gs = st.games[b.dataset.repair]; st.gold -= DUR_MAX - gs.dur; gs.dur = DUR_MAX; audio.sfx('heal'); save(); render(); };
    for (const b of win.querySelectorAll('[data-upgrade]')) b.onclick = () => {
      const id = b.dataset.upgrade, gs = st.games[id], up = UPGRADE[gs.tier + 1];
      st.gold -= up.gold; GAME_MATS[id].forEach((m, i) => up.mats[i] && take(m, up.mats[i]));
      gs.tier++; audio.sfx('jobUp'); toast(`${OBJECTS[id].name} upgraded to ${TIERS[gs.tier]}! Better rewards.`);
      const bl = built.find((x) => x.entry.id === id); if (bl) { unspawn(bl); built.splice(built.indexOf(bl), 1); spawn(bl.entry); }
      save(); render();
    };
    for (const b of win.querySelectorAll('[data-move]')) b.onclick = () => {
      const [from, id] = b.dataset.move.split(':'), src = from === 'bag' ? st.bag : st.wh, dst = from === 'bag' ? st.wh : st.bag;
      const cap = from === 'bag' ? whSlots() : BAG_SLOTS;
      const n = src[id] || 0, moved = addTo(dst, cap, id, n);
      src[id] = n - moved; if (!src[id]) delete src[id];
      if (moved < n) toast('Not enough free slots.');
      audio.sfx('click'); save(); render();
    };
  }
  function invRows(inv, from) {
    const rows = Object.entries(inv).filter(([, n]) => n > 0).map(([id, n]) => `<div class="ml-mat"><i style="background:${MATERIALS[id].color}"></i><b>${MATERIALS[id].name}</b><span>×${n}</span>${from ? `<button data-move="${from}:${id}">${from === 'bag' ? 'Store' : 'Take'}</button>` : ''}</div>`).join('');
    return rows || '<p class="ml-empty">Empty.</p>';
  }
  for (const t of win.querySelectorAll('[data-tab]')) t.onclick = () => { tab = t.dataset.tab; render(); };
  $('#ml-close').onclick = closeWindow;

  // ---------------------------------------------------------------- NPC shops in town
  const shopEl = $('#shop');
  function openShop(kind, npcName) {
    game.dialog = true;
    shopEl.hidden = false;
    $('#shop-who').textContent = npcName;
    renderShop(kind);
  }
  function closeShop() { shopEl.hidden = true; if (win.hidden && $('#minigame').hidden) game.dialog = false; }
  $('#shop-close').onclick = closeShop;
  function renderShop(kind) {
    const B = $('#shop-body');
    const title = { miniland: 'Miniland furniture', bells: 'Travel goods', materials: 'Material trader' }[kind];
    $('#shop-title').textContent = title;
    if (kind === 'materials') {
      const rows = Object.entries(st.bag).filter(([, n]) => n > 0).map(([id, n]) => `<div class="ml-mat"><i style="background:${MATERIALS[id].color}"></i><b>${MATERIALS[id].name}</b><span>×${n} · ${MATERIALS[id].price} g each</span><button data-sell="${id}">Sell all · ${n * MATERIALS[id].price} g</button></div>`).join('');
      B.innerHTML = `<p class="ml-note">You have ${st.gold} gold. I buy materials from your bag.</p>${rows || '<p class="ml-empty">Your bag has no materials. Play minigames in your Miniland.</p>'}`;
    } else {
      const list = kind === 'bells' ? Object.entries(SHOP_ITEMS) : Object.entries(OBJECTS);
      let cat = '';
      B.innerHTML = `<p class="ml-note">You have ${st.gold} gold.</p>` + list.map(([id, o]) => {
        const head = kind === 'miniland' && o.cat !== cat ? `<h4>${(cat = o.cat)}</h4>` : '';
        return `${head}<div class="ml-item"><b>${esc(o.name)}</b><small>${esc(o.desc)}${o.zone ? ` · ${ZONE_NAME[o.zone]}` : ''}</small><button data-buy="${id}" ${st.gold < o.price ? 'disabled' : ''}>${o.price} gold</button></div>`;
      }).join('');
    }
    for (const b of B.querySelectorAll('[data-buy]')) b.onclick = () => {
      const id = b.dataset.buy, o = OBJECTS[id] || SHOP_ITEMS[id];
      if (st.gold < o.price) return;
      st.gold -= o.price;
      if (id === 'bell') st.bells++; else if (id === 'coupon') st.coupons++; else st.storage[id] = (st.storage[id] || 0) + 1;
      audio.sfx('stones'); toast(`Bought ${o.name}.${OBJECTS[id] ? ' It is in your Miniland storage.' : ''}`); save(); renderShop(kind);
    };
    for (const b of B.querySelectorAll('[data-sell]')) b.onclick = () => {
      const id = b.dataset.sell, n = st.bag[id]; st.gold += n * MATERIALS[id].price; delete st.bag[id];
      audio.sfx('stones'); save(); renderShop(kind);
    };
  }

  // ---------------------------------------------------------------- minigames
  const mg = $('#minigame');
  let run = null, current = null;
  function openGame(id) {
    refreshDay();
    current = id;
    game.dialog = true;
    mg.hidden = false;
    const gs = st.games[id];
    $('#mg-title').textContent = `${OBJECTS[id].name} · ${TIERS[gs.tier]}`;
    $('#mg-desc').textContent = OBJECTS[id].desc;
    $('#mg-info').textContent = `Production points ${st.pp} / ${PP_MAX} · Durability ${gs.dur} / ${DUR_MAX}`;
    $('#mg-area').innerHTML = '';
    $('#mg-result').hidden = true;
    $('#mg-start').hidden = false;
    $('#mg-score').textContent = '';
    $('#mg-start').onclick = () => start(id);
  }
  function closeGame() { run?.stop(); run = null; if (!mg.hidden) { mg.hidden = true; if (win.hidden && shopEl.hidden) game.dialog = false; } }
  $('#mg-close').onclick = closeGame;
  function rewardFor(id, lv) {
    const tier = st.games[id].tier, [c, u, r] = GAME_MATS[id], k = [1, 1.5, 2][tier];
    const out = {};
    const add = (m, n) => { n = Math.round(n); if (n > 0) out[m] = (out[m] || 0) + n; };
    add(c, [0, 2, 4, 5, 6, 8][lv] * k);
    add(u, [0, 0, 0, 1, 2, 3][lv] * k);
    if (lv === 5 || (lv === 4 && Math.random() < 0.25 + tier * 0.25)) add(r, 1 + (tier === 2 && lv === 5 ? 1 : 0));
    return out;
  }
  function finish(id, score, steps) {
    run?.stop(); run = null;
    const lv = 1 + steps.filter((t) => score >= t).length;
    audio.sfx(lv >= 4 ? 'levelUp' : 'jobUp');
    const gs = st.games[id], reward = rewardFor(id, lv), durCost = 10 + lv * 10;
    const why = st.pp < PP_COST ? 'Not enough Production points today (Production Coupons add 500).' : gs.dur < durCost ? 'This minigame needs repairs (Miniland menu → Minigames).' : '';
    $('#mg-start').hidden = true;
    const res = $('#mg-result');
    res.hidden = false;
    res.innerHTML = `<div class="mg-level">${'★'.repeat(lv)}${'☆'.repeat(5 - lv)}<b>Level ${lv} · score ${score}</b></div>
      <div class="mg-reward">${Object.entries(reward).map(([m, n]) => `<span><i style="background:${MATERIALS[m].color}"></i>${n} ${MATERIALS[m].name}</span>`).join('')}</div>
      <button id="mg-take" class="primary" ${why ? 'disabled' : ''}>Take reward · −${PP_COST} Production points</button>
      ${why ? `<p class="mg-why">${why}</p>` : ''}<button id="mg-again">Play again</button>`;
    $('#mg-take').onclick = () => {
      let lost = 0;
      for (const [m, n] of Object.entries(reward)) { const a = addTo(st.bag, BAG_SLOTS, m, n); const w = addTo(st.wh, whSlots(), m, n - a); lost += n - a - w; }
      st.pp -= PP_COST; gs.dur -= durCost;
      audio.sfx('pop');
      toast(lost ? `Rewards taken, but ${lost} did not fit in your bag or warehouse.` : 'Rewards added to your bag.');
      save(); openGame(id);
    };
    $('#mg-again').onclick = () => openGame(id);
  }
  function start(id) {
    $('#mg-start').hidden = true;
    $('#mg-result').hidden = true;
    run = arcade($('#mg-area'), GAMES[id], (score, steps) => finish(id, score, steps), (s) => { $('#mg-score').textContent = s; });
  }
  // shared arcade shell: canvas + arrow keys (and WASD) + touch buttons
  function arcade(area, def, done, show) {
    area.innerHTML = `<canvas width="480" height="260" class="mg-canvas"></canvas><div class="mg-pad">${['left', 'up', 'down', 'right'].map((k) => `<button data-k="${k}" aria-label="${k}">${{ left: '←', up: '↑', down: '↓', right: '→' }[k]}</button>`).join('')}</div>`;
    const cv = area.querySelector('canvas'), cx = cv.getContext('2d');
    const s = def.init();
    let t0 = performance.now(), last = t0, raf, over = false;
    const press = (k) => { if (!over) def.key(s, k, (performance.now() - t0) / 1000, audio); };
    const map_ = { ArrowLeft: 'left', ArrowUp: 'up', ArrowDown: 'down', ArrowRight: 'right', KeyA: 'left', KeyW: 'up', KeyS: 'down', KeyD: 'right' };
    const onKey = (e) => { const k = map_[e.code]; if (!k) return; e.preventDefault(); e.stopPropagation(); if (!e.repeat) press(k); };
    addEventListener('keydown', onKey, true);
    for (const b of area.querySelectorAll('[data-k]')) b.onpointerdown = (e) => { e.preventDefault(); press(b.dataset.k); };
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const el = (now - t0) / 1000;
      def.update(s, dt, el, audio);
      def.draw(cx, s, el);
      const left = Math.max(0, def.time - el);
      show(`${Math.ceil(left)} s · score ${s.score}${s.lives !== undefined ? ` · lives ${'♥'.repeat(s.lives)}` : ''}${s.combo > 1 ? ` · combo ×${s.combo}` : ''}`);
      if (left <= 0 || s.lives === 0) { over = true; return done(s.score, def.levels); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return { stop() { over = true; cancelAnimationFrame(raf); removeEventListener('keydown', onKey, true); } };
  }
  // tiny drawing helpers
  const rect = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const text = (c, t, x, y, col = '#fff', size = 14) => { c.fillStyle = col; c.font = `800 ${size}px 'Nunito', sans-serif`; c.textAlign = 'center'; c.fillText(t, x, y); };
  function caterpillar(c, x, y, dir, t) { for (let i = 0; i < 4; i++) { const bx = x - dir * i * 10, by = y - Math.abs(Math.sin(t * 10 + i)) * 4; rect(c, bx - 6, by - 10, 12, 10, i ? '#7ccf5a' : '#5aa842'); } rect(c, x - 3 + dir * 2, y - 8, 3, 3, '#1a1414'); }
  function chicken(c, x, y, dir, kind, t) {
    const body = kind === 'rooster' ? '#ffd24a' : kind === 'vampire' ? '#3a2a4a' : '#f4f0e8';
    const bob = Math.abs(Math.sin(t * 14)) * 3;
    rect(c, x - 12, y - 16 - bob, 24, 16, body);
    rect(c, x + dir * 8 - 5, y - 26 - bob, 10, 11, body);
    rect(c, x + dir * 13 - 2, y - 22 - bob, 5, 3, '#f2b23a');
    rect(c, x + dir * 8 - 2, y - 30 - bob, 5, 4, '#d8483a');
    if (kind === 'vampire') { rect(c, x - 18, y - 18 - bob, 6, 10, '#7a1e18'); rect(c, x + 12, y - 18 - bob, 6, 10, '#7a1e18'); }
    rect(c, x + dir * 9, y - 22 - bob, 2, 2, kind === 'vampire' ? '#ff4a4a' : '#1a1414');
    rect(c, x - 5, y - bob, 2, 5, '#f2b23a'); rect(c, x + 3, y - bob, 2, 5, '#f2b23a');
  }
  const GAMES = {
    // ↑ mines the rock (steady rhythm), ← → squash caterpillars in the strike zone; a wrong swing freezes you
    quarry: {
      time: 40, levels: [22, 38, 55, 72],
      init: () => ({ score: 0, cats: [], spawn: 1.2, cd: 0, frozen: 0, shake: 0, chips: [], swing: 0 }),
      key(s, k, el, a) {
        if (s.frozen > 0) return;
        if (k === 'up') { if (s.cd > 0) return; s.cd = 0.3; s.score++; s.shake = 0.15; s.swing = 0.2; a.sfx('hit'); for (let i = 0; i < 4; i++) s.chips.push({ x: 240, y: 120, vx: (Math.random() - 0.5) * 160, vy: -80 - Math.random() * 90, t: 0.6 }); return; }
        if (k === 'left' || k === 'right') {
          const side = k === 'left' ? -1 : 1, hit = s.cats.find((q) => q.side === side && q.d < 0.3);
          if (hit) { s.cats.splice(s.cats.indexOf(hit), 1); s.score += 2; a.sfx('pop'); }
          else { s.frozen = 1; a.sfx('denied'); }
        }
      },
      update(s, dt, el, a) {
        s.cd -= dt; s.frozen = Math.max(0, s.frozen - dt); s.shake -= dt; s.swing -= dt;
        if ((s.spawn -= dt) <= 0) { s.spawn = Math.max(0.7, 1.7 - el * 0.025) * (0.7 + Math.random() * 0.6); s.cats.push({ side: Math.random() < 0.5 ? -1 : 1, d: 1, v: 0.28 + el * 0.004 }); }
        for (const q of [...s.cats]) { q.d -= q.v * dt; if (q.d <= 0.06) { s.cats.splice(s.cats.indexOf(q), 1); s.frozen = 1.5; a.sfx('hurt'); } }
        for (const p of s.chips) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; p.t -= dt; }
        s.chips = s.chips.filter((p) => p.t > 0);
      },
      draw(c, s, el) {
        rect(c, 0, 0, 480, 260, '#3a3448'); rect(c, 0, 190, 480, 70, '#6a5a48');
        for (const x of [0.3, 0.7]) rect(c, 480 * x - 2, 190, 4, 70, '#8a7a5a');
        const sh = s.shake > 0 ? (Math.random() - 0.5) * 6 : 0;
        c.fillStyle = '#9a968c'; c.beginPath(); c.ellipse(240 + sh, 140, 70, 58, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#7a766e'; c.beginPath(); c.ellipse(225 + sh, 150, 35, 28, 0.4, 0, Math.PI * 2); c.fill();
        for (const [x, y, col] of [[205, 120, '#6ae8ff'], [270, 150, '#ffd24a'], [250, 105, '#b88aff']]) rect(c, x + sh, y, 9, 9, col);
        rect(c, 225, 200, 30, 40, s.frozen > 0 ? '#8ad8ff' : '#e8483a'); rect(c, 230, 184, 20, 18, '#f2c8a0');   // you
        rect(c, 250, 186 - (s.swing > 0 ? 20 : 0), 6, 30, '#6a4428'); rect(c, 242, 180 - (s.swing > 0 ? 20 : 0), 22, 6, '#8a8a92');
        for (const q of s.cats) caterpillar(c, 240 + q.side * (40 + q.d * 200), 250, -q.side, el);
        for (const p of s.chips) rect(c, p.x, p.y, 5, 5, '#b8b4a8');
        if (s.frozen > 0) text(c, 'FROZEN!', 240, 40, '#8ad8ff', 22);
      },
    },
    // two belts; ↑ saws the top log, ↓ the bottom one when its mark is under the blade
    sawmill: {
      time: 40, levels: [20, 50, 95, 150],
      init: () => ({ score: 0, combo: 1, logs: [], spawn: 0.5, flash: 0, msg: '', msgT: 0 }),
      key(s, k, el, a) {
        if (k !== 'up' && k !== 'down') return;
        const belt = k === 'up' ? 0 : 1, saw = 150;
        const log = s.logs.filter((l) => l.belt === belt && !l.cut).sort((p, q) => Math.abs(p.x + 45 - saw) - Math.abs(q.x + 45 - saw))[0];
        const d = log ? Math.abs(log.x + 45 - saw) : 999;
        if (d < 7) { s.combo = Math.min(10, s.combo + 1); s.score += s.combo; s.msg = 'PERFECT'; a.sfx('crit'); }
        else if (d < 18) { s.score += 1; s.msg = 'Good'; a.sfx('hit'); }
        else { s.combo = 1; s.msg = 'Miss'; a.sfx('miss'); return; }
        log.cut = true; s.msgT = 0.5; s.flash = 0.12;
      },
      update(s, dt, el) {
        s.flash -= dt; s.msgT -= dt;
        if ((s.spawn -= dt) <= 0) { s.spawn = Math.max(0.45, 1.2 - el * 0.018) * (0.7 + Math.random() * 0.6); s.logs.push({ belt: Math.random() < 0.5 ? 0 : 1, x: 480, cut: false }); }
        const v = 150 + el * 3.5;
        for (const l of s.logs) { l.x -= v * dt; if (!l.cut && l.x + 45 < 150 - 22 && !l.missed) { l.missed = true; s.combo = 1; } }
        s.logs = s.logs.filter((l) => l.x > -100);
      },
      draw(c, s) {
        rect(c, 0, 0, 480, 260, '#4a3a2a');
        for (const [b, y] of [[0, 80], [1, 190]]) {
          rect(c, 0, y, 480, 16, '#3a3a40');
          for (let x = (performance.now() / 8) % 24; x < 480; x += 24) rect(c, 480 - x, y + 6, 10, 3, '#5a5a62');
          c.strokeStyle = s.flash > 0 ? '#fff' : '#c8ccd4'; c.lineWidth = 4; c.beginPath(); c.arc(150, y - 14, 22, 0, Math.PI * 2); c.stroke();
          rect(c, 148, y - 44, 4, 30, '#6a4428'); text(c, b ? '↓' : '↑', 150, y - 48, '#ffd66b', 16);
        }
        for (const l of s.logs) {
          const y = l.belt ? 190 : 80;
          if (l.cut) { rect(c, l.x, y - 18, 40, 18, '#b08a52'); rect(c, l.x + 50, y - 18, 40, 18, '#b08a52'); }
          else { rect(c, l.x, y - 18, 90, 18, '#9a6a3e'); rect(c, l.x, y - 18, 6, 18, '#c8a070'); rect(c, l.x + 43, y - 22, 4, 26, '#e8483a'); }
        }
        if (s.msgT > 0) text(c, s.msg, 330, 140, s.msg === 'PERFECT' ? '#ffd24a' : '#fff', 22);
        text(c, `×${s.combo}`, 440, 30, '#ffd66b', 20);
      },
    },
    // four rods (← ↑ ↓ →); pull fish while they bite; golden fish then need an arrow combo; devils cost a life
    pond: {
      time: 45, levels: [14, 28, 45, 65],
      init: () => ({ score: 0, lives: 3, rods: [0, 1, 2, 3].map(() => ({ state: 'idle', t: 1 + Math.random() * 2 })), combo: null, msg: '', msgT: 0 }),
      key(s, k, el, a) {
        const idx = { left: 0, up: 1, down: 2, right: 3 }[k];
        if (s.combo) {
          if (k === s.combo.seq[s.combo.i]) { s.combo.i++; a.sfx('click'); if (s.combo.i >= s.combo.seq.length) { s.score += 8; s.msg = 'Golden fish! +8'; s.msgT = 1; a.sfx('levelUp'); s.combo = null; } }
          else { s.msg = 'It got away…'; s.msgT = 1; a.sfx('miss'); s.combo = null; }
          return;
        }
        const r = s.rods[idx];
        if (r.state !== 'bite') { a.sfx('miss'); return; }
        if (r.kind === 'devil') { s.lives--; s.msg = 'A devil! −1 life'; s.msgT = 1; a.sfx('hurt'); }
        else if (r.kind === 'gold') { s.combo = { seq: Array.from({ length: 4 }, () => ['left', 'up', 'down', 'right'][Math.floor(Math.random() * 4)]), i: 0, t: 3 }; a.sfx('alert'); }
        else { const fast = r.t > r.win * 0.55; s.score += fast ? 3 : 2; s.msg = fast ? 'Quick catch! +3' : 'Caught +2'; s.msgT = 0.8; a.sfx('pop'); }
        r.state = 'idle'; r.t = 1 + Math.random() * 2.5;
      },
      update(s, dt, el, a) {
        s.msgT -= dt;
        if (s.combo && (s.combo.t -= dt) <= 0) { s.msg = 'Too slow, it got away'; s.msgT = 1; s.combo = null; }
        for (const r of s.rods) {
          r.t -= dt;
          if (r.state === 'idle' && r.t <= 0) {
            const roll = Math.random(), devilP = Math.min(0.35, 0.08 + el * 0.007);
            r.state = 'bite'; r.kind = roll < devilP ? 'devil' : roll < devilP + 0.12 ? 'gold' : 'fish';
            r.win = r.kind === 'devil' ? 1.4 : Math.max(0.55, 1.0 - el * 0.01); r.t = r.win;
          } else if (r.state === 'bite' && r.t <= 0) { r.state = 'idle'; r.t = 1 + Math.random() * 2.5; }
        }
      },
      draw(c, s, el) {
        rect(c, 0, 0, 480, 260, '#2a4a3a');
        c.fillStyle = '#3a8ad8'; c.beginPath(); c.ellipse(240, 150, 210, 90, 0, 0, Math.PI * 2); c.fill();
        s.rods.forEach((r, i) => {
          const x = 90 + i * 100, y = 150 + Math.sin(el * 2 + i) * 3;
          const bite = r.state === 'bite';
          rect(c, x - 1, 20, 2, y - 20, '#ddd');
          rect(c, x - 6, y - 6 + (bite ? Math.sin(el * 40) * 4 : 0), 12, 12, bite ? (r.kind === 'devil' ? '#e83a3a' : r.kind === 'gold' ? '#ffd24a' : '#fff') : '#e8483a');
          if (bite) text(c, r.kind === 'devil' ? '☠' : '!', x, y - 16, r.kind === 'devil' ? '#ff6a6a' : '#ffd24a', 22);
          text(c, ['←', '↑', '↓', '→'][i], x, 250, '#fff', 18);
        });
        if (s.combo) { rect(c, 110, 60, 260, 50, '#0008'); text(c, s.combo.seq.map((k, i) => (i < s.combo.i ? '·' : { left: '←', up: '↑', down: '↓', right: '→' }[k])).join('  '), 240, 94, '#ffd24a', 26); }
        if (s.msgT > 0) text(c, s.msg, 240, 40, '#fff', 18);
      },
    },
    // targets walk in from both sides; ← shoots the nearest on the left, → on the right; ↓ reloads
    range: {
      time: 40, levels: [14, 28, 46, 70],
      init: () => ({ score: 0, ammo: 6, reload: 0, free: 0, tg: [], spawn: 0.6, shots: [] }),
      key(s, k, el, a) {
        if (k === 'down') { if (s.reload <= 0 && s.ammo < 6) { s.reload = 0.7; a.sfx('creak'); } return; }
        if (k !== 'left' && k !== 'right') return;
        if (s.reload > 0) return;
        if (s.ammo <= 0 && s.free <= 0) { a.sfx('denied'); return; }
        if (s.free <= 0) s.ammo--;
        const side = k === 'left' ? -1 : 1;
        const t = s.tg.filter((q) => q.side === side).sort((p, q) => p.d - q.d)[0];
        s.shots.push({ side, t: 0.12 });
        a.sfx('twang');
        if (!t || t.d > 0.95) return;
        t.hp--;
        if (t.hp <= 0) {
          s.tg.splice(s.tg.indexOf(t), 1);
          if (t.kind === 'rooster') { s.score += 10; s.free = 6; a.sfx('levelUp'); } else { s.score += t.kind === 'vampire' ? 3 : 1; a.sfx('pop'); }
        } else a.sfx('hit');
      },
      update(s, dt, el) {
        if (s.reload > 0 && (s.reload -= dt) <= 0) s.ammo = 6;
        s.free -= dt;
        if ((s.spawn -= dt) <= 0) {
          s.spawn = Math.max(0.45, 1.1 - el * 0.015) * (0.6 + Math.random() * 0.8);
          const roll = Math.random(), kind = roll < 0.06 ? 'rooster' : roll < 0.3 ? 'vampire' : 'chicken';
          s.tg.push({ side: Math.random() < 0.5 ? -1 : 1, d: 1.05, kind, hp: kind === 'vampire' ? 2 : 1, v: (kind === 'rooster' ? 0.7 : 0.22) + el * 0.004 });
        }
        for (const t of s.tg) t.d -= t.v * dt;
        s.tg = s.tg.filter((t) => t.d > 0.08);
        for (const sh of s.shots) sh.t -= dt; s.shots = s.shots.filter((sh) => sh.t > 0);
      },
      draw(c, s, el) {
        rect(c, 0, 0, 480, 260, '#6a8ac8'); rect(c, 0, 180, 480, 80, '#6aaa4a');
        for (const t of s.tg) chicken(c, 240 + t.side * (30 + t.d * 200), 200, -t.side, t.kind, el);
        rect(c, 215, 150, 50, 70, '#c8483a'); rect(c, 205, 140, 70, 12, '#d8b078');       // booth
        for (const sh of s.shots) rect(c, sh.side < 0 ? 30 : 250, 188, 200, 2, '#fff8c0');
        for (let i = 0; i < 6; i++) rect(c, 20 + i * 14, 20, 10, 16, i < s.ammo ? '#ffd24a' : '#0005');
        if (s.reload > 0) text(c, 'Reloading…', 240, 40, '#fff', 18);
        if (s.free > 0) text(c, 'UNLIMITED AMMO!', 240, 40, '#ffd24a', 20);
      },
    },
  };

  // ---------------------------------------------------------------- per frame
  function update(dt) {
    for (const b of built) {
      if (!b.label) continue;
      const o = OBJECTS[b.entry.id];
      let txt;
      if (o.game) { const gs = st.games[b.entry.id]; txt = `${o.name}<small>${TIERS[gs.tier]} · ${gs.dur < 60 ? 'needs repair' : 'click to play'}</small>`; }
      else if (o.slots) txt = `Warehouse<small>${slotsUsed(st.wh)} / ${whSlots()} slots</small>`;
      else txt = `${esc(st.message)}`;
      if (b.label.innerHTML !== txt) b.label.innerHTML = txt;
      placeLabel(b.label, b.group.position, o.game ? 3.4 : 2.4);
    }
    if (overlays?.visible) for (const l of overlays.labels) placeLabel(l.el, l.pos, 0.2);
  }
  // where the dachshund hangs out when he stays home
  function petSpot() { const k = st.placed.find((e) => e.id === 'kennel'); return k ? new THREE.Vector3(k.x, 0, k.z + 1.8) : null; }

  return {
    state: st, save, onEnter, onLeave, click, hover, pickables, update, openWindow, closeWindow, openShop, petSpot,
    get active() { return !!map; }, get mode() { return mode; }, setMode,
    rotate() { if (mode?.install) { mode.ry = ((mode.ry || 0) + Math.PI / 2) % (Math.PI * 2); if (ghost) ghost.rotation.y = mode.ry; } },
    addGold(n) { st.gold += n; save(); },
    get windowOpen() { return !win.hidden || !mg.hidden || !shopEl.hidden; },
    closeAll() { closeWindow(); closeShop(); closeGame(); setMode(null); },
  };
}
