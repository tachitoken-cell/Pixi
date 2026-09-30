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
import './miniland-props.js';

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
  miniland: { grass: [0x8ed04a, 0x80c442, 0x9cd858], amp: 1, trees: 'oak' },
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
const villager = (id, o) => ({ ...CLASSES.adventurer, id, weapon: null, backpack: false, xStraps: false, scarf: null, ...o });
const NPC_LOOKS = {
  villager: villager('villager', { hair: { color: 0x8a5a3a, dark: 0x6a4028, style: 'shaggy', seed: 21 }, vest: { color: 0x7a6a4a, trim: null } }),
  farmer: villager('farmer', { hair: { color: 0xc89a5a, dark: 0xa07a40, style: 'messy', seed: 23 }, shirt: 0xe8dcc0, vest: { color: 0x4a6a3a, trim: null }, pants: 0x5a4a3a }),
  smith: villager('smith', { hair: { color: 0x2a2020, dark: 0x1a1414, style: 'swept', seed: 25 }, shirt: 0x8a8a8a, vest: { color: 0x3a2a24, trim: null }, pants: 0x2a2424, armed: true, weapon: 'woodSword' }),
  innkeeper: villager('innkeeper', { hair: { color: 0xb8402a, dark: 0x8a2a1a, style: 'tall', seed: 27 }, shirt: 0xf2ece0, vest: { color: 0x8a3a4a, trim: 0xd1a646 } }),
  kid: villager('kid', { hair: { color: 0xe8c068, dark: 0xc89a48, style: 'messy', seed: 29 }, shirt: 0x6ab8e8, vest: { color: 0x3a6ab8, trim: null }, pants: 0x3a3a4a }),
  fisher: villager('fisher', { hair: { color: 0x4a3a2a, dark: 0x2e241a, style: 'shaggy', seed: 31 }, shirt: 0xd8e8f0, vest: { color: 0x2a5a8a, trim: null }, scarf: 0xe8b83a }),
  lumberjack: villager('lumberjack', { hair: { color: 0x8a3a1a, dark: 0x6a2a12, style: 'messy', seed: 33 }, shirt: 0xb8342b, vest: { color: 0x3a3a2a, trim: null }, pants: 0x3a3a44 }),
  priestess: { ...CLASSES.mage, id: 'priestess', weapon: null, hair: { color: 0xf2e6c8, dark: 0xd8c8a0, style: 'tall', seed: 35 }, robe: { ...CLASSES.mage.robe, color: 0xf2eee4, dark: 0xd8d0c0, trim: 0xd1a646 } },
  noble: villager('noble', { hair: { color: 0xd8c8a8, dark: 0xb8a888, style: 'swept', seed: 37 }, shirt: 0xf2f2f2, vest: { color: 0x6a2a6a, trim: 0xd1a646 }, scarf: 0xd1a646 }),
  bard: villager('bard', { hair: { color: 0x6a3a8a, dark: 0x4a2a6a, style: 'shaggy', seed: 39 }, shirt: 0xf2e0b8, vest: { color: 0x2a8a6a, trim: 0xd1a646 }, scarf: 0xc8483a }),
  mimi: villager('mimi', { hair: { color: 0xf28ab8, dark: 0xd86a98, style: 'tall', seed: 41 }, shirt: 0xfff0f4, vest: { color: 0xe86a9a, trim: 0xffffff } }),
  malcolm: villager('malcolm', { hair: { color: 0x3a2a4a, dark: 0x241a30, style: 'swept', seed: 43 }, shirt: 0xe8e0f0, vest: { color: 0x4a3a8a, trim: 0xd1a646 }, scarf: 0x9a6ad8 }),
  gerta: villager('gerta', { hair: { color: 0x9a9a9a, dark: 0x7a7a7a, style: 'tall', seed: 45 }, shirt: 0xe8dcc8, vest: { color: 0x8a6a3a, trim: null }, scarf: 0x5a8a3a }),
  elder: { ...CLASSES.adventurer, id: 'elder', hair: { color: 0xe8e4dc, dark: 0xc4c0b8, style: 'tall', seed: 4 }, vest: { color: 0x5a4a7a, trim: 0xd1a646 }, scarf: null, weapon: null },
  merchant: { ...CLASSES.adventurer, id: 'merchant', hair: { color: 0x2e2a2a, dark: 0x1c1a1a, style: 'shaggy', seed: 8 }, vest: { color: 0x3f7a4a, trim: null }, scarf: 0xe8b83a, weapon: null },
  guard: { ...CLASSES.knight, id: 'guard', armed: true, hair: { color: 0x6a4428, dark: 0x4e301c, style: 'swept', seed: 12 } },
  master: { ...CLASSES.mage, id: 'master', armed: true, hair: { color: 0xd8d4cc, dark: 0xa8a49c, style: 'swept', seed: 17 },
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

// Houses along a town's streets: both sides, facing the street, skipping the plaza, portals,
// reserved districts (market, farms, parks, landmarks) and other houses. Returns their flat pads too.
function planTown(def, town, R, portals, pathDist) {
  const [W, D] = def.size, limX = W / 2 - MOUNT - 5, limZ = D / 2 - MOUNT - 5;
  const P = town.plaza ?? 11, houses = [], flats = [[0, 0, P]];
  const reserved = (x, z, pad) => (town.reserve || []).some(([x0, z0, x1, z1]) => x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad);
  for (const [x, z, v, ry, scale] of town.fixedHouses || []) { houses.push({ x, z, v, ry, scale, kind: 'house' }); flats.push([x, z, 5 * scale]); }
  const spacing = town.houseSpacing ?? 13, off = town.houseOffset ?? 9, kind = town.houseKind || 'house';
  for (const pts of town.streets || []) for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    for (let s = spacing / 2; s < len - 3; s += spacing) for (const side of [-1, 1]) {
      const nx = -dz * side, nz = dx * side;
      const x = ax + dx * s + nx * off, z = az + dz * s + nz * off;
      if (Math.abs(x) > limX || Math.abs(z) > limZ || Math.hypot(x, z) < P + 9) continue;
      if (portals.some((p) => Math.hypot(p.pos.x - x, p.pos.z - z) < 13)) continue;
      if (reserved(x, z, 5) || pathDist(x, z) < off - 3.5) continue;
      if (houses.some((h) => Math.hypot(h.x - x, h.z - z) < spacing - 1)) continue;
      if (R() < (town.gaps ?? 0.12)) continue;
      const ry = Math.round(Math.atan2(-nx, -nz) / (Math.PI / 2)) * (Math.PI / 2);   // door faces the street
      houses.push({ x, z, v: Math.floor(R() * 5), ry, scale: town.houseScale ?? 1.25, kind });
      flats.push([x, z, 6.5]);
    }
  }
  return { houses, flats };
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

  // paths from every portal to the map centre (straight streets in towns), plus a town's own streets
  const town = def.town;
  const paths = portals.map((p) => {
    const [ix, iz] = INWARD[p.edge];
    const bend = town ? (R(), 0) : (R() - 0.5) * 12;
    const mid = [p.pos.x * 0.5 + iz * bend, p.pos.z * 0.5 + ix * bend];
    return [[p.pos.x - ix * (MOUNT + 3), p.pos.z - iz * (MOUNT + 3)], [p.pos.x, p.pos.z], mid, [0, 0]];
  });
  if (town) for (const st of town.streets || []) paths.push(st);
  const pathDist = (x, z) => {
    let d = Infinity;
    for (const pts of paths) for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(x, z, ...pts[i], ...pts[i + 1]));
    return d;
  };
  const PW = town ? 2.6 : 1.7;                                   // half width of paths / streets
  const flats = []; // [x, z, radius] areas forced flat (plaza, house pads)
  const plan = town ? planTown(def, town, R, portals, pathDist) : null;
  if (plan) flats.push(...plan.flats);

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
    if (pd < PW && edge > 2) { h = BASE + Math.min(1, Math.max(0, h - BASE)); type = pd < PW - 0.5 ? 'path' : type; }
    else if (pd < 9 && edge >= MOUNT) h = Math.round(BASE + (h - BASE) * Math.pow((pd - PW) / (9 - PW), 1.5));
    for (const [fx, fz, fr] of flats) {
      const d = Math.hypot(x - fx, z - fz);
      if (d < fr) h = BASE;
      else if (d < fr + 3) h = Math.round(BASE + (h - BASE) * ((d - fr) / 3));
    }
    if (town && Math.hypot(x, z) < (town.plaza ?? 11)) type = 'cobble';
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
    if (def.theme === 'miniland' && edge >= MOUNT) {                  // flat plot: stone terrace, dirt production yard
      h = BASE;
      const inZ = (r) => r && x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];
      if (inZ(def.zones?.terrace)) type = 'cobble';
      else if (inZ(def.zones?.production)) type = 'path';
    }
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
  const CANOPY = { oak: 2.8, pine: 3.2, palm: 3, house: 4.6, fountain: 3.2, stall: 2, gate: 4.2, ml_cabin: 4, ml_villa: 5, mtent: 2.4, ml_windmill: 2, ml_well: 1.8 };
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

  if (town) {
    const P = town.plaza ?? 11;
    if (town.fountain !== false) { place('fountain', 0, 0, { block: false }); blockCircle(0, 0, 3.4); }
    if (town.well) place('ml_well', 0, 0, { scale: 1.4 });
    // houses along the streets (planned before the terrain so their pads are flat)
    for (const h of plan.houses) {
      place(h.kind, h.x, h.z, { variant: h.v, ry: h.ry, scale: h.scale, block: h.kind !== 'house' });
      if (h.kind === 'house') { const rot = Math.abs(Math.sin(h.ry)) > 0.5; blockRect(h.x, h.z, (rot ? 22 : 28) * 0.25 * h.scale + 0.4, (rot ? 28 : 22) * 0.25 * h.scale + 0.4); }
    }
    for (const [kind, x, z, o = {}] of town.props || []) place(kind, x, z, { variant: o.v ?? 0, ry: o.ry ?? 0, scale: o.scale ?? 1, block: o.block !== false });
    // fenced farms with crop patches and hay bales; the side facing the town centre has a gap
    for (const [x0, z0, x1, z1] of town.farms || []) {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      for (let x = x0 + 1.6; x < x1; x += 3.25) for (const z of [z0, z1]) if (!(Math.abs(x - cx) < 3 && Math.abs(z) < Math.abs(cz))) place('fence', x, z, { block: false });
      for (let z = z0 + 1.6; z < z1; z += 3.25) for (const x of [x0, x1]) if (!(Math.abs(z - cz) < 3 && Math.abs(x) < Math.abs(cx))) place('fence', x, z, { ry: Math.PI / 2, block: false });
      for (let z = z0 + 4; z < z1 - 3; z += 4.4) for (let x = x0 + 4; x < x1 - 3; x += 4.4) if (colOK(x, z, ['grass'])) place('crops', x, z, { variant: (Math.floor((x - x0) / 9) + Math.floor((z - z0) / 9)) % 2, block: false });
      for (let n = 0; n < 3; n++) { const x = x0 + 2 + R() * (x1 - x0 - 4), z = z0 + 2 + R() * 3; if (colOK(x, z, ['grass'])) place('haybale', x, z, { ry: R() * 3 }); }
    }
    // parks: a ring of trees with benches and flower beds
    for (const [px, pz, pr] of town.parks || []) {
      for (let n = 0; n < 10; n++) { const a = n / 10 * Math.PI * 2; const x = px + Math.cos(a) * pr, z = pz + Math.sin(a) * pr; if (colOK(x, z)) place(town.treeKind || 'oak', x, z, { variant: n % 4, scale: 1.1 }); }
      for (let n = 0; n < 4; n++) { const a = n / 4 * Math.PI * 2 + 0.4; place('ml_bench', px + Math.cos(a) * pr * 0.5, pz + Math.sin(a) * pr * 0.5, { ry: -a - Math.PI / 2 }); place('ml_flowerbed', px + Math.cos(a + 0.8) * pr * 0.55, pz + Math.sin(a + 0.8) * pr * 0.55, { ry: -a }); }
    }
    // street lamps
    for (const pts of town.streets || []) for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
      for (let s = 8; s < len - 4; s += town.lampSpacing ?? 18) {
        const x = ax + dx * s - dz * (PW + 0.9), z = az + dz * s + dx * (PW + 0.9);
        if (Math.hypot(x, z) > P + 2 && colOK(x, z, ['grass', 'path'])) place('lamp', x, z, { scale: 1.2 });
      }
    }
    for (const [kind, n, o = {}] of town.scatter || [['oak', 24, { variants: 4, scale: 1.1 }], ['bush', 16]]) scatter(n, kind, { clear: P + 8, ...o });
    ridgeTrees(town.ridge ?? Math.round((W + D) * 0.9), town.treeKind || 'oak');
    for (const [look, name, [x, z], line, extra = {}] of town.npcs || []) {
      const ch = new Character(NPC_LOOKS[look] || NPC_LOOKS.villager);
      ch.root.position.set(x, heightAt(x, z), z);
      ch.root.rotation.y = extra.ry ?? Math.PI;
      ch.setArmed(!!NPC_LOOKS[look]?.armed);
      if (extra.small) ch.root.scale.setScalar(0.72);
      ch.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      ch.blob.visible = true;
      group.add(ch.root);
      const npc = { ch, name, line, pos: ch.root.position, home: ch.root.position.clone(), classMaster: look === 'master', shop: extra.shop, wander: extra.wander };
      ch.root.traverse((o) => (o.userData.npc = npc));
      npcs.push(npc);
      if (!extra.wander) blockCircle(x, z, 0.6);
    }
  }
  if (def.theme === 'fields' && !town) {
    scatter(46, 'oak', { variants: 4, scale: 1.05 });
    scatter(26, 'bush');
    scatter(22, 'rock');
    for (let n = 0; n < 12; n++) place('fence', -34 + n * 3.25, -24, { block: false });
    ridgeTrees(140, 'oak');
  }
  if (def.theme === 'woods' && !town) {
    scatter(150, 'pine', { clear: 7, variants: 4, scale: 1.1 });
    scatter(26, 'oak', { variants: 4 });
    scatter(40, 'shroom', { clear: 3, block: false });
    scatter(14, 'log');
    scatter(30, 'bush');
    scatter(16, 'rock');
    ridgeTrees(170, 'pine');
  }
  if (def.theme === 'coast' && !town) {
    scatter(34, 'palm', { types: ['sand'], variants: 3, scale: 1.1 });
    scatter(18, 'oak', { variants: 4 });
    scatter(28, 'rock', { types: ['grass', 'sand'] });
    scatter(12, 'bush');
    place('boat', W / 2 - 30, -16, { ry: 0.4 });
    ridgeTrees(110, 'oak');
  }

  if (def.theme === 'miniland') {
    // the plot itself stays free for your own objects; hedges and trees all around
    ridgeTrees(140, 'oak');
    for (let x = -16; x <= 16; x += 3.25) for (const z of [-17.2]) place('fence', x, z, { block: false });
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
  // structures placed at runtime (Miniland) block and free ground here
  const setBlock = (x, z, r, on) => {
    const [ci, cj] = col(x, z);
    const n = Math.ceil(r / T);
    for (let dj = -n; dj <= n; dj++) for (let di = -n; di <= n; di++) {
      if ((di * T) ** 2 + (dj * T) ** 2 > r * r + 0.01) continue;
      const i = ci + di, j = cj + dj;
      if (i >= 0 && j >= 0 && i < CX && j < CZ) blocked[k(i, j)] = on ? 1 : 0;
    }
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
    walkable, heightAt, camTopAt: (x, z) => camTopAt(x, z), randomSpawn, arrive, setBlock,
    surfaceAt: (x, z) => { const c = inCol(x, z); return c ? surf[k(...c)] : 'grass'; },
    update: (t, dt = 0.016) => update.forEach((f) => f(t, dt)),
  };
}
