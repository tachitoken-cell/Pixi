// Builds one map from its definition in maps.js as a real voxel world: a height-mapped
// voxel terrain (hills, mountain walls around the edge, paths, cobblestone, sand, water)
// meshed with ambient occlusion, detailed voxel props, grass and flowers, a sky dome with
// drifting clouds, portal gates, NPCs and monsters.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { mat, Character } from './character.js';
import { CLASSES } from './classes.js';
import { Monster } from './monsters.js';
import { VoxelGrid, meshGrid, jitter, mix, VOXEL_MAT, PROP_MAT } from './voxel.js';
import { prop } from './props.js';

export const T = 0.5;            // terrain voxel size (world units)
const BASE = 8;                  // terrain height (in voxels) that sits at world y = 0
const MOUNT = 9;                 // thickness of the mountain wall around a map (world units)
const WATER_Y = -0.3;
const INWARD = { east: [-1, 0], west: [1, 0], north: [0, 1], south: [0, -1] };
const TOUCH = typeof matchMedia !== 'undefined' && (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);

// ---- value noise
function noise2(seed) {
  const h = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453; return s - Math.floor(s); };
  const sm = (t) => t * t * (3 - 2 * t);
  const n = (x, z) => {
    const i = Math.floor(x), j = Math.floor(z), fx = sm(x - i), fz = sm(z - j);
    const a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };
  return (x, z, oct = 3) => { let v = 0, amp = 1, f = 1, tot = 0; for (let o = 0; o < oct; o++) { v += n(x * f, z * f) * amp; tot += amp; amp *= 0.5; f *= 2; } return v / tot; };
}

const THEMES = {
  village: { grass: [0x86c440, 0x78b83a, 0x94cc4c], amp: 2, trees: 'oak' },
  fields: { grass: [0x8cc83c, 0x7cba36, 0x9cd04a], amp: 4, trees: 'oak' },
  woods: { grass: [0x5e9e3a, 0x528e34, 0x6aaa44], amp: 5, trees: 'pine' },
  coast: { grass: [0x90c848, 0x82bc40, 0x9ed054], amp: 3, trees: 'palm' },
  // dungeons: `grass` is the floor colour, `mini` the minimap floor colour
  cave: { grass: [0x5a5448, 0x4e4a40, 0x646052], amp: 3, trees: 'rock', mini: [96, 90, 78] },
  grotto: { grass: [0x4a7a72, 0x3e6c66, 0x56887e], amp: 2, trees: 'rock', mini: [74, 122, 114] },
  crypt: { grass: [0x6a6670, 0x5e5a64, 0x76727c], amp: 1, trees: 'rock', mini: [106, 102, 112] },
  frost: { grass: [0xe8f0f8, 0xd8e6f2, 0xf4f8fc], amp: 4, trees: 'pine', mini: [226, 236, 246] },
};
const SURF = {
  path: [0xc9a26a, 0xbb935c, 0xd2ad76],
  cobble: [0xb8b2a4, 0xaaa496, 0xc4beb0],
  sand: [0xeedca4, 0xe6d096, 0xf4e4b0],
  dirt: 0x8a6440, stone: 0x8e887c, stoneDark: 0x777266, moss: 0x5f8a3e,
};

export function portalPos(def, p) {
  const [W, D] = def.size;
  const inset = MOUNT + 1.5;
  switch (p.edge) {
    case 'east': return new THREE.Vector3(W / 2 - inset, 0, p.at);
    case 'west': return new THREE.Vector3(-W / 2 + inset, 0, p.at);
    case 'north': return new THREE.Vector3(p.at, 0, -D / 2 + inset);
    default: return new THREE.Vector3(p.at, 0, D / 2 - inset);
  }
}

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

// villagers reuse the player model with their own colours
const NPC_LOOKS = {
  elder: { ...CLASSES.adventurer, id: 'elder', hair: { color: 0xe8e4dc, dark: 0xc4c0b8, style: 'tall', seed: 4 }, vest: { color: 0x5a4a7a, trim: 0xd1a646 }, scarf: null, weapon: null },
  merchant: { ...CLASSES.adventurer, id: 'merchant', hair: { color: 0x2e2a2a, dark: 0x1c1a1a, style: 'shaggy', seed: 8 }, vest: { color: 0x3f7a4a, trim: null }, scarf: 0xe8b83a, weapon: null },
  guard: { ...CLASSES.knight, id: 'guard', hair: { color: 0x6a4428, dark: 0x4e301c, style: 'swept', seed: 12 } },
  master: { ...CLASSES.mage, id: 'master', hair: { color: 0xd8d4cc, dark: 0xa8a49c, style: 'swept', seed: 17 },
    robe: { ...CLASSES.mage.robe, color: 0x2e4a8a, dark: 0x223866 }, boot: 0x3a3a4a, bootCuff: 0x2e2e3a, sole: 0x1e1e28 },
};

// sky dome with a vertical gradient
function makeSky(horizon) {
  const geo = new THREE.SphereGeometry(400, 24, 12);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x5a9ee8) }, mid: { value: new THREE.Color(horizon).lerp(new THREE.Color(0xfff0d8), 0.35) }, bottom: { value: new THREE.Color(0xf6ead2) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.6)) : mix(mid, bottom, min(1.0, -h * 4.0)); gl_FragColor = vec4(c, 1.0); }',
  });
  const sky = new THREE.Mesh(geo, m);
  sky.renderOrder = -1;
  return sky;
}

export function buildMap(def) {
  const [W, D] = def.size;
  const theme = THEMES[def.theme];
  let s = def.seed * 7919 + 1;
  const R = () => ((s = (s * 16807) % 2147483647) & 0xffff) / 0xffff;
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const N = noise2(def.seed), N2 = noise2(def.seed + 99);
  const group = new THREE.Group();
  group.name = def.name;

  const portals = def.portals.map((p) => ({ ...p, pos: portalPos(def, p) }));
  const CX = Math.round(W / T), CZ = Math.round(D / T);      // columns
  const col = (x, z) => [Math.floor((x + W / 2) / T), Math.floor((z + D / 2) / T)];
  const colX = (i) => (i + 0.5) * T - W / 2, colZ = (j) => (j + 0.5) * T - D / 2;
  const H = new Int16Array(CX * CZ);
  const surf = new Array(CX * CZ).fill('grass');
  const blocked = new Uint8Array(CX * CZ);
  const k = (i, j) => j * CX + i;

  // paths from every portal to the map centre
  const paths = portals.map((p) => {
    const [ix, iz] = INWARD[p.edge];
    const bend = (R() - 0.5) * 12;
    const mid = [p.pos.x * 0.5 + iz * bend, p.pos.z * 0.5 + ix * bend];
    return [[p.pos.x - ix * (MOUNT + 3), p.pos.z - iz * (MOUNT + 3)], [p.pos.x, p.pos.z], mid, [0, 0]];
  });
  const pathDist = (x, z) => Math.min(...paths.map((pts) => Math.min(segDist(x, z, ...pts[0], ...pts[1]), segDist(x, z, ...pts[1], ...pts[2]), segDist(x, z, ...pts[2], ...pts[3]))));
  const flats = []; // [x, z, radius] areas forced flat (plaza, house pads)
  if (def.theme === 'village') {
    flats.push([0, 0, 11]);
    for (const [x, z] of [[-15, -13], [15, -14], [-15, 14], [16, 14], [-24, 0]]) flats.push([x, z, 7]);
  }

  // ---- heights and surfaces
  for (let j = 0; j < CZ; j++) for (let i = 0; i < CX; i++) {
    const x = colX(i), z = colZ(j);
    const edge = Math.min(x + W / 2, W / 2 - x, z + D / 2, D / 2 - z);
    let h = BASE + Math.round((N(x * 0.035, z * 0.035) - 0.45) * theme.amp * 2);
    let type = 'grass';
    // mountains around the map
    if (edge < MOUNT) {
      const t = (MOUNT - edge) / MOUNT;
      h += Math.round(t * t * 26 + N2(x * 0.12, z * 0.12) * 8 * t);
    }
    // gate corridors through the mountains
    for (const p of portals) {
      const along = p.edge === 'east' || p.edge === 'west' ? Math.abs(z - p.pos.z) : Math.abs(x - p.pos.x);
      const out = p.edge === 'east' ? x > p.pos.x - 2 : p.edge === 'west' ? x < p.pos.x + 2 : p.edge === 'north' ? z < p.pos.z + 2 : z > p.pos.z - 2;
      if (along < 3.2 && out) { h = BASE; type = 'path'; }
    }
    const pd = pathDist(x, z);
    if (pd < 1.7 && edge > 2) { h = BASE + Math.min(1, Math.max(0, h - BASE)); type = pd < 1.2 ? 'path' : type; }
    else if (pd < 9 && edge >= MOUNT) h = Math.round(BASE + (h - BASE) * Math.pow((pd - 1.7) / 7.3, 1.5));
    for (const [fx, fz, fr] of flats) {
      const d = Math.hypot(x - fx, z - fz);
      if (d < fr) h = BASE;
      else if (d < fr + 3) h = Math.round(BASE + (h - BASE) * ((d - fr) / 3));
    }
    if (def.theme === 'village' && Math.hypot(x, z) < 11) type = 'cobble';
    if (def.theme === 'fields') {
      const pond = Math.hypot(x + 16, z - 18) - (6 + N2(x * 0.2, z * 0.2) * 2);
      if (pond < 0) { h = BASE - 3; type = 'sand'; } else if (pond < 1.2 && type === 'grass') { h = BASE; type = 'sand'; }
    }
    if (def.theme === 'coast' && edge > 3) {
      const shore = W / 2 - 24 + Math.sin(z * 0.12) * 4 + N2(0.3, z * 0.05) * 6;
      if (x > shore + 5) { h = BASE - 4; type = 'sand'; }
      else if (x > shore - 6) { h = Math.min(h, BASE); type = type === 'path' ? 'path' : 'sand'; }
      if (x > shore + 5 && edge < MOUNT) h = BASE - 4; // open sea to the east
    }
    if (def.theme === 'crypt' && edge >= MOUNT && type === 'grass') type = 'cobble';
    if (def.theme === 'grotto' && edge > MOUNT + 2 && pd > 3) {
      const pool = Math.min(Math.hypot(x + 14, z - 6), Math.hypot(x - 10, z + 14), Math.hypot(x - 18, z - 4)) - (5 + N2(x * 0.2, z * 0.2) * 2);
      if (pool < 0) { h = BASE - 3; type = 'sand'; } else if (pool < 1.2) { h = BASE; type = 'sand'; }
    }
    if (h > BASE + 3 && type === 'grass' && edge < MOUNT) type = 'mountain';
    H[k(i, j)] = Math.max(1, h);
    surf[k(i, j)] = type;
  }

  const hAt = (i, j) => (i < 0 || j < 0 || i >= CX || j >= CZ ? 60 : H[k(i, j)]);
  const heightAt = (x, z) => { const [i, j] = col(x, z); return (hAt(i, j) - BASE) * T; };
  let camTopAt = heightAt;
  const isWater = (i, j) => (hAt(i, j) - BASE) * T < WATER_Y;

  // ---- voxel terrain, meshed in chunks
  let maxH = 0;
  for (let n = 0; n < H.length; n++) maxH = Math.max(maxH, H[n]);
  const grid = new VoxelGrid(CX, maxH + 1, CZ);
  const pal = def.theme === 'woods' ? { dirt: 0x6a4e34 } : { dirt: SURF.dirt };
  for (let j = 0; j < CZ; j++) for (let i = 0; i < CX; i++) {
    const h = H[k(i, j)], type = surf[k(i, j)];
    const n = N2(i * 0.3, j * 0.3);
    let top;
    if (type === 'path') top = jitter(SURF.path[(i + j * 3) % 3], 0.08, R);
    else if (type === 'cobble') top = jitter(((i >> 1) + (j >> 1)) % 2 ? SURF.cobble[0] : SURF.cobble[1], 0.06, R) - (R() < 0.08 ? 0x101010 : 0);
    else if (type === 'sand') top = jitter(pick(SURF.sand), 0.05, R);
    else if (type === 'mountain') top = n > 0.55 ? jitter(SURF.stone, 0.1, R) : jitter(mix(theme.grass[1], SURF.moss, 0.5), 0.1, R);
    else top = jitter(mix(theme.grass[0], theme.grass[n > 0.5 ? 2 : 1], Math.abs(n - 0.5) * 2), 0.07, R);
    // only the voxels that can be seen from the side need to exist below the surface
    const low = Math.min(hAt(i - 1, j), hAt(i + 1, j), hAt(i, j - 1), hAt(i, j + 1), h) - 1;
    for (let y = Math.max(0, low); y < h; y++) {
      const depth = h - 1 - y;
      let c = top;
      if (depth > 0) c = depth < 2 && type !== 'mountain' ? jitter(type === 'sand' ? 0xd8c088 : pal.dirt, 0.12, R) : jitter(R() < 0.3 ? SURF.stoneDark : SURF.stone, 0.1, R);
      if (depth > 0 && depth < 4 && R() < 0.12 && type !== 'sand') c = SURF.moss;
      grid.data[grid.idx(i, y, j)] = c + 1;
    }
  }
  const terrain = [];
  const CH = 32;
  for (let cz = 0; cz < CZ; cz += CH) for (let cx = 0; cx < CX; cx += CH) {
    const geo = meshGrid(grid, { size: T, origin: [CX / 2, BASE, CZ / 2], range: [cx, 0, cz, Math.min(CX, cx + CH) - 1, maxH, Math.min(CZ, cz + CH) - 1], skipBottom: true });
    if (!geo.index.count) continue;
    const m = new THREE.Mesh(geo, VOXEL_MAT);
    m.receiveShadow = true;
    m.castShadow = true;
    m.userData.terrain = true;
    group.add(m);
    terrain.push(m);
  }

  // ---- water
  const waterMat = new THREE.MeshPhongMaterial({ color: 0x3a9ad8, transparent: true, opacity: 0.78, shininess: 90, specular: 0x9ad8ff, depthWrite: false });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(W + 400, D + 400), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_Y;
  const hasWater = def.theme === 'fields' || def.theme === 'coast' || def.theme === 'grotto';
  if (def.theme === 'grotto') { waterMat.color.set(0x1e8a9a); waterMat.specular.set(0x7ae8ff); }
  if (hasWater) group.add(water);

  // ---- props
  for (let j = 0; j < CZ; j++) for (let i = 0; i < CX; i++) if (isWater(i, j)) blocked[k(i, j)] = 1;
  const placed = [];
  const blockCircle = (x, z, r) => {
    const [ci, cj] = col(x, z);
    const n = Math.ceil(r / T);
    for (let dj = -n; dj <= n; dj++) for (let di = -n; di <= n; di++) {
      if ((di * T) ** 2 + (dj * T) ** 2 > r * r + 0.01) continue;
      const i = ci + di, j = cj + dj;
      if (i >= 0 && j >= 0 && i < CX && j < CZ) blocked[k(i, j)] = 1;
    }
  };
  const blockRect = (x, z, w, d) => {
    for (let zz = z - d / 2; zz <= z + d / 2; zz += T / 2) for (let xx = x - w / 2; xx <= x + w / 2; xx += T / 2) {
      const [i, j] = col(xx, zz);
      if (i >= 0 && j >= 0 && i < CX && j < CZ) blocked[k(i, j)] = 1;
    }
  };
  // tallest thing per column, so the camera can keep clear of trees and roofs
  const camTop = new Float32Array(CX * CZ).fill(-99);
  const CANOPY = { oak: 2.8, pine: 3.2, palm: 3, house: 4.6, fountain: 3.2, stall: 2, gate: 4.2 };
  const raiseCam = (x, z, r, top) => {
    const [ci, cj] = col(x, z);
    const n = Math.ceil(r / T);
    for (let dj = -n; dj <= n; dj++) for (let di = -n; di <= n; di++) {
      if ((di * T) ** 2 + (dj * T) ** 2 > r * r) continue;
      const i = ci + di, j = cj + dj;
      if (i >= 0 && j >= 0 && i < CX && j < CZ) camTop[k(i, j)] = Math.max(camTop[k(i, j)], top);
    }
  };
  const place = (kind, x, z, { variant = 0, ry = 0, scale = 1, block = true, y = null } = {}) => {
    const p = prop(kind, variant);
    const py = y ?? heightAt(x, z);
    placed.push({ geo: p.geo, x, y: py, z, ry, scale });
    if (block && p.footprint) blockCircle(x, z, p.footprint * scale);
    if (CANOPY[kind]) raiseCam(x, z, CANOPY[kind] * scale, py + p.height * scale * 0.9);
    return p;
  };
  const colOK = (x, z, types = ['grass']) => {
    const [i, j] = col(x, z);
    if (i < 1 || j < 1 || i >= CX - 1 || j >= CZ - 1) return false;
    if (blocked[k(i, j)] || !types.includes(surf[k(i, j)])) return false;
    const h = H[k(i, j)];
    return Math.abs(hAt(i + 1, j) - h) <= 1 && Math.abs(hAt(i - 1, j) - h) <= 1 && Math.abs(hAt(i, j + 1) - h) <= 1 && Math.abs(hAt(i, j - 1) - h) <= 1;
  };
  const free = (x, z, clear = 5, types) => {
    if (Math.hypot(x, z) < clear) return false;
    if (portals.some((p) => Math.hypot(p.pos.x - x, p.pos.z - z) < 7)) return false;
    if (pathDist(x, z) < 2.4) return false;
    return colOK(x, z, types);
  };
  const rand = (margin = MOUNT - 1) => [(R() - 0.5) * (W - margin * 2), (R() - 0.5) * (D - margin * 2)];
  const scatter = (n, kind, opts = {}) => {
    for (let t = 0; t < n * 4 && n > 0; t++) {
      const [x, z] = rand(opts.margin);
      if (!free(x, z, opts.clear ?? 6, opts.types)) continue;
      place(kind, x, z, { variant: Math.floor(R() * (opts.variants || 3)), ry: Math.floor(R() * 4) * (Math.PI / 2), scale: (opts.scale || 1) * (0.85 + R() * 0.3), block: opts.block !== false });
      n--;
    }
  };
  // trees on the mountain slopes frame each map
  const ridgeTrees = (n, kind) => {
    for (let t = 0; t < n; t++) {
      const [x, z] = [(R() - 0.5) * (W - 3), (R() - 0.5) * (D - 3)];
      const edge = Math.min(x + W / 2, W / 2 - x, z + D / 2, D / 2 - z);
      if (edge > MOUNT + 1 || edge < 1.5) continue;
      if (portals.some((p) => Math.hypot(p.pos.x - x, p.pos.z - z) < 6)) continue;
      place(kind, x, z, { variant: Math.floor(R() * 4), ry: R() * 6, scale: 0.9 + R() * 0.4, block: false });
    }
  };

  let stonePile = null;
  const npcs = [];
  const update = [];

  if (def.theme === 'village') {
    place('fountain', 0, 0, { block: false });
    blockCircle(0, 0, 3.4);
    for (const [x, z] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) place('lamp', x, z);
    const houses = [[-15, -13, 0, 0], [15, -14, 1, 0], [-15, 14, 2, Math.PI], [16, 14, 3, Math.PI], [-24, 0, 4, Math.PI / 2]];
    for (const [x, z, v, ry] of houses) {
      place('house', x, z, { variant: v, ry, scale: 1.25, block: false });
      const rot = Math.abs(Math.sin(ry)) > 0.5;
      blockRect(x, z, (rot ? 22 : 28) * 0.25 * 1.25 + 0.4, (rot ? 28 : 22) * 0.25 * 1.25 + 0.4);
    }
    place('stall', -7, -12, { scale: 1.3 });
    for (const [x, z] of [[-11, -8], [-11.8, -9]]) place('barrel', x, z, { scale: 1.2 });
    for (const [x, z] of [[11, 9], [11.9, 9.6], [11.3, 10.4]]) place('crate', x, z, { scale: 1.3, ry: R() });
    for (const [x, z, ry] of [[19, -4, Math.PI / 2], [4, -19, 0]]) place('sign', x, z, { ry, scale: 1.3 });
    // fences along the fields
    for (let x = -26; x < -8; x += 3.25) place('fence', x, 22, { block: false });
    for (let x = 9; x < 27; x += 3.25) place('fence', x, 22, { block: false });
    scatter(18, 'oak', { clear: 16, variants: 4, scale: 1.1 });
    scatter(14, 'bush', { clear: 12 });
    scatter(6, 'rock', { clear: 12 });
    ridgeTrees(90, 'oak');
    const npcDefs = [
      ['elder', 'Elder Moss', [3.8, 4.2], 'Welcome to Mossvale! East lies Clover Fields, north the Whisperwood. Sit down to heal.'],
      ['merchant', 'Merchant Tilly', [-7, -10], 'Fresh apples and slingshot stones! The stone pile by the fountain is free.'],
      ['guard', 'Guard Bram', [20, 5], 'Jellies and Hoppers roam the fields. Wolves in the woods bite hard, be careful.'],
      ['master', 'Class Master Oren', [-4.6, 5], 'At Job Level 20 I can guide you onto a new path: Knight, Ranger or Mage.'],
    ];
    for (const [look, name, [x, z], line] of npcDefs) {
      const ch = new Character(NPC_LOOKS[look]);
      ch.root.position.set(x, heightAt(x, z), z);
      ch.root.rotation.y = Math.PI;
      ch.setArmed(look === 'guard' || look === 'master');
      ch.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      ch.blob.visible = true;
      group.add(ch.root);
      const npc = { ch, name, line, pos: ch.root.position, classMaster: look === 'master' };
      ch.root.traverse((o) => (o.userData.npc = npc));
      npcs.push(npc);
      blockCircle(x, z, 0.6);
    }
  }
  if (def.theme === 'fields') {
    scatter(46, 'oak', { variants: 4, scale: 1.05 });
    scatter(26, 'bush');
    scatter(22, 'rock');
    for (let n = 0; n < 12; n++) place('fence', -34 + n * 3.25, -24, { block: false });
    ridgeTrees(140, 'oak');
  }
  if (def.theme === 'woods') {
    scatter(150, 'pine', { clear: 7, variants: 4, scale: 1.1 });
    scatter(26, 'oak', { variants: 4 });
    scatter(40, 'shroom', { clear: 3, block: false });
    scatter(14, 'log');
    scatter(30, 'bush');
    scatter(16, 'rock');
    ridgeTrees(170, 'pine');
  }
  if (def.theme === 'coast') {
    scatter(34, 'palm', { types: ['sand'], variants: 3, scale: 1.1 });
    scatter(18, 'oak', { variants: 4 });
    scatter(28, 'rock', { types: ['grass', 'sand'] });
    scatter(12, 'bush');
    place('boat', W / 2 - 30, -16, { ry: 0.4 });
    ridgeTrees(110, 'oak');
  }

  if (def.theme === 'cave') {
    scatter(46, 'rock', { clear: 5, scale: 1.3 });
    scatter(34, 'shroom', { clear: 3, block: false, scale: 1.2 });
    scatter(10, 'log');
    ridgeTrees(160, 'rock');
  }
  if (def.theme === 'grotto') {
    scatter(40, 'rock', { clear: 5, types: ['grass', 'sand'], scale: 1.2 });
    scatter(16, 'shroom', { clear: 3, block: false });
    place('boat', -22, -18, { ry: 2.2 });
    ridgeTrees(150, 'rock');
  }
  if (def.theme === 'crypt') {
    // two rows of lamp posts down the main hall, broken fences and old crates
    for (let z = -D / 2 + MOUNT + 6; z < D / 2 - MOUNT - 4; z += 8) for (const x of [-6, 6]) place('lamp', x, z);
    scatter(26, 'rock', { clear: 7, types: ['cobble'] });
    scatter(10, 'crate', { clear: 7, types: ['cobble'] });
    scatter(8, 'barrel', { clear: 7, types: ['cobble'] });
    scatter(8, 'log', { clear: 7, types: ['cobble'] });
    for (let n = 0; n < 6; n++) place('fence', -20 + n * 3.25, -14, { block: false });
    ridgeTrees(140, 'rock');
  }
  if (def.theme === 'frost') {
    scatter(90, 'pine', { clear: 7, variants: 4, scale: 1.1 });
    scatter(30, 'rock', { clear: 5 });
    scatter(10, 'log');
    ridgeTrees(170, 'pine');
  }

  if (def.stones) {
    stonePile = new THREE.Group();
    for (const [x, y, z, sz] of [[0, 0.15, 0, 0.5], [0.35, 0.12, 0.1, 0.35], [-0.3, 0.12, 0.15, 0.4], [0.1, 0.1, -0.35, 0.35], [0.05, 0.42, 0.05, 0.3], [-0.15, 0.1, -0.2, 0.28]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat(R() < 0.5 ? 0x9a9aa2 : 0x85858e));
      m.scale.set(sz, sz * 0.8, sz);
      m.position.set(x, y, z);
      m.rotation.y = R() * 2;
      m.castShadow = true;
      stonePile.add(m);
    }
    stonePile.position.set(def.stones[0], heightAt(def.stones[0], def.stones[1]), def.stones[1]);
    group.add(stonePile);
  }

  // ---- portals: stone arch with a glowing swirl
  for (const p of portals) {
    p.pos.y = heightAt(p.pos.x, p.pos.z);
    const alongX = p.edge === 'north' || p.edge === 'south';
    placed.push({ geo: prop('gate').geo, x: p.pos.x, y: p.pos.y, z: p.pos.z, ry: alongX ? 0 : Math.PI / 2, scale: 1.25 });
    raiseCam(p.pos.x, p.pos.z, 4.2, p.pos.y + 8.2);
    const pg = new THREE.Group();
    pg.position.copy(p.pos);
    pg.rotation.y = alongX ? 0 : Math.PI / 2;
    const swirlMat = new THREE.MeshBasicMaterial({ color: 0x2a8ad8, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const swirl = new THREE.Mesh(new THREE.CircleGeometry(2.3, 24), swirlMat);
    swirl.position.y = 3.6;
    swirl.scale.y = 1.35;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 2.3, 24, 1, 0, Math.PI * 1.4), new THREE.MeshBasicMaterial({ color: 0x8ad8ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.position.y = 3.6;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(2.2, 20), new THREE.MeshBasicMaterial({ color: 0x3aa0ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.05;
    pg.add(swirl, ring, floor);
    const motes = [];
    for (let n = 0; n < 14; n++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: n % 2 ? 0xbef0ff : 0x6ac8ff }));
      m.userData.phase = n / 14;
      pg.add(m);
      motes.push(m);
    }
    update.push((t) => {
      ring.rotation.z = -t * 2.2;
      swirlMat.opacity = 0.32 + Math.sin(t * 3) * 0.08;
      for (const m of motes) {
        const q = (t * 0.4 + m.userData.phase) % 1;
        const a = m.userData.phase * Math.PI * 2 + t * 1.5;
        m.position.set(Math.cos(a) * 1.8, 0.2 + q * 5, Math.sin(a) * 0.6);
        m.scale.setScalar(0.14 * (1 - q));
      }
    });
    p.group = pg;
    group.add(pg);
    for (const sgn of [-1, 1]) blockCircle(p.pos.x + (alongX ? sgn * 3.4 : 0), p.pos.z + (alongX ? 0 : sgn * 3.4), 0.8);
  }

  // merge every static prop into a few big meshes
  for (let n = 0; n < placed.length; n += 400) {
    const chunk = placed.slice(n, n + 400).map((it) => {
      const g = it.geo.clone();
      const m4 = new THREE.Matrix4().compose(new THREE.Vector3(it.x, it.y, it.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, it.ry, 0)), new THREE.Vector3(it.scale, it.scale, it.scale));
      g.applyMatrix4(m4);
      return g;
    });
    const merged = mergeGeometries(chunk);
    const mesh = new THREE.Mesh(merged, PROP_MAT);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    chunk.forEach((g) => g.dispose());
  }

  // ---- grass tufts and flowers (instanced)
  const tufts = [], flowers = [];
  const tuftN = TOUCH ? 2500 : 6000;
  for (let t = 0; t < tuftN * 3 && tufts.length < tuftN; t++) {
    const x = (R() - 0.5) * (W - 6), z = (R() - 0.5) * (D - 6);
    const [i, j] = col(x, z);
    if (i < 0 || j < 0 || i >= CX || j >= CZ || blocked[k(i, j)] || surf[k(i, j)] !== 'grass') continue;
    const y = heightAt(x, z);
    if (!def.dungeon && R() < 0.08) flowers.push({ x, y, z, c: pick([0xf2d24a, 0xe86a8a, 0xffffff, 0x9a8aff, 0xff8a4a]) });
    else tufts.push({ x, y, z, c: jitter(mix(theme.grass[0], 0x3f7a2a, R() * 0.6), 0.1, R), s: 0.6 + R() * 0.7, r: R() * 3 });
  }
  const tuftGeo = new THREE.BoxGeometry(0.1, 0.34, 0.1).translate(0, 0.17, 0);
  const tuftMesh = new THREE.InstancedMesh(tuftGeo, new THREE.MeshLambertMaterial(), tufts.length * 3);
  const o = new THREE.Object3D(), c3 = new THREE.Color();
  let ti = 0;
  for (const tf of tufts) for (let b = 0; b < 3; b++) {
    o.position.set(tf.x + (b - 1) * 0.09, tf.y, tf.z + ((b * 7) % 3 - 1) * 0.07);
    o.rotation.set((b - 1) * 0.25, tf.r, 0);
    o.scale.set(1, tf.s * (b === 1 ? 1.3 : 1), 1);
    o.updateMatrix();
    tuftMesh.setMatrixAt(ti, o.matrix);
    tuftMesh.setColorAt(ti++, c3.setHex(tf.c));
  }
  group.add(tuftMesh);
  if (flowers.length) {
    const stem = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.3, 0.05).translate(0, 0.15, 0), new THREE.MeshLambertMaterial({ color: 0x3f7a2a }), flowers.length);
    const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.1, 0.16).translate(0, 0.33, 0), new THREE.MeshLambertMaterial(), flowers.length);
    flowers.forEach((f, n) => {
      o.position.set(f.x, f.y, f.z); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); o.updateMatrix();
      stem.setMatrixAt(n, o.matrix);
      head.setMatrixAt(n, o.matrix);
      head.setColorAt(n, c3.setHex(f.c));
    });
    group.add(stem, head);
  }

  // ---- sky and clouds
  group.add(makeSky(def.sky));
  const clouds = [];
  for (let n = 0; n < (def.dungeon && def.theme !== 'frost' ? 0 : 9); n++) {
    const m = new THREE.Mesh(prop('cloud', n % 4).geo, VOXEL_MAT);
    m.position.set((R() - 0.5) * (W + 80), 32 + R() * 14, (R() - 0.5) * (D + 80));
    m.scale.setScalar(1.6 + R());
    m.rotation.y = R() * 6;
    group.add(m);
    clouds.push(m);
  }
  update.push((t, dt) => {
    for (const m of clouds) { m.position.x += dt * 0.8; if (m.position.x > W / 2 + 60) m.position.x = -W / 2 - 60; }
    water.position.y = WATER_Y + Math.sin(t * 1.1) * 0.04;
  });

  camTopAt = (x, z) => {
    const [i, j] = col(x, z);
    const h = heightAt(x, z);
    return i < 0 || j < 0 || i >= CX || j >= CZ ? h : Math.max(h, camTop[k(i, j)]);
  };

  // ---- movement helpers
  const inCol = (x, z) => { const [i, j] = col(x, z); return i >= 0 && j >= 0 && i < CX && j < CZ ? [i, j] : null; };
  // can something standing at (fx, fz) step to (x, z)? one voxel of height difference is a step
  const walkable = (x, z, fx = x, fz = z) => {
    const c1 = inCol(x, z), c0 = inCol(fx, fz);
    if (!c1 || blocked[k(...c1)]) return false;
    if (!c0) return true;
    return Math.abs(H[k(...c1)] - H[k(...c0)]) <= 1;
  };
  const randomSpawn = () => {
    for (let n = 0; n < 300; n++) {
      const [x, z] = rand(MOUNT + 2);
      if (!colOK(x, z, ['grass', 'sand', 'cobble'])) continue;
      if (Math.hypot(x, z) < 8 || portals.some((p) => Math.hypot(p.pos.x - x, p.pos.z - z) < 9)) continue;
      return new THREE.Vector3(x, heightAt(x, z), z);
    }
    return new THREE.Vector3(0, 0, 0);
  };
  const arrive = (portalId) => {
    const p = portals.find((q) => q.id === portalId) || portals[0];
    const [ix, iz] = INWARD[p.edge];
    const pos = p.pos.clone().add(new THREE.Vector3(ix * 6, 0, iz * 6));
    pos.y = heightAt(pos.x, pos.z);
    return { pos, yaw: Math.atan2(ix, iz) };
  };

  // ---- monsters
  const monsters = [];
  for (const m of def.monsters || []) {
    if (m.at) monsters.push(new Monster(m.type, new THREE.Vector3(m.at[0], heightAt(m.at[0], m.at[1]), m.at[1])));
    else for (let n = 0; n < m.n; n++) monsters.push(new Monster(m.type, randomSpawn()));
  }
  for (const m of monsters) {
    group.add(m.root);
    if (m.t.static) blockCircle(m.pos.x, m.pos.z, 0.7);
  }

  // ---- minimap (one pixel per column, shaded by height)
  const minimap = document.createElement('canvas');
  minimap.width = CX; minimap.height = CZ;
  const mg = minimap.getContext('2d');
  const img = mg.createImageData(CX, CZ);
  const surfCol = { grass: [110, 180, 76], path: [204, 164, 108], cobble: [184, 178, 164], sand: [236, 218, 160], mountain: [120, 128, 100] };
  for (let j = 0; j < CZ; j++) for (let i = 0; i < CX; i++) {
    const n = k(i, j);
    let c = surfCol[surf[n]] || surfCol.grass;
    if (def.theme === 'woods' && surf[n] === 'grass') c = [80, 150, 62];
    if (theme.mini && (surf[n] === 'grass' || surf[n] === 'cobble')) c = theme.mini;
    if (isWater(i, j)) c = [64, 150, 214];
    const shade = 0.75 + Math.min(0.5, (H[n] - BASE) * 0.03);
    const b = blocked[n] && !isWater(i, j) ? 0.7 : 1;
    img.data.set([c[0] * shade * b, c[1] * shade * b, c[2] * shade * b, 255], n * 4);
  }
  mg.putImageData(img, 0, 0);

  return {
    def, group, W, D, portals, monsters, npcs, stonePile, minimap, terrain,
    walkable, heightAt, camTopAt: (x, z) => camTopAt(x, z), randomSpawn, arrive,
    surfaceAt: (x, z) => { const c = inCol(x, z); return c ? surf[k(...c)] : 'grass'; },
    update: (t, dt = 0.016) => update.forEach((f) => f(t, dt)),
  };
}
