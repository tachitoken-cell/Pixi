// Procedural voxel props (4 voxels per world unit). Each model is built once per variant
// and its geometry is shared by every placement.
import * as THREE from 'three';
import { VoxelGrid, meshGrid, jitter, mix } from './voxel.js';

export const PROP_VOXEL = 0.25;
const cache = new Map();

function rng(seed) {
  let s = (seed * 9301 + 49297) % 233280 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// returns { geo, footprint } where footprint is the blocking radius in world units
export function prop(kind, variant = 0) {
  const key = `${kind}:${variant}`;
  if (!cache.has(key)) {
    const R = rng(variant * 131 + kind.length * 17 + 7);
    const built = BUILDERS[kind](R, variant);
    cache.set(key, { geo: meshGrid(built.grid, { size: PROP_VOXEL, origin: built.origin, skipBottom: true }), footprint: built.footprint ?? 0, height: built.grid.ny * PROP_VOXEL });
  }
  return cache.get(key);
}

// other modules (e.g. the Miniland furniture) add their own voxel models here
export function registerProp(kind, builder) { BUILDERS[kind] = builder; }

const G = {
  leaf: [0x4f9a3a, 0x5aa842, 0x69b84a, 0x3f8a32],
  leafDark: 0x2f6a2a,
  bark: 0x6a4a2e, barkDark: 0x523820,
  stone: 0x9a968c, stoneDark: 0x7a766e,
  plaster: 0xf0e4c8, beam: 0x5a3e28,
};

const BUILDERS = {
  // round, fluffy NosTale-style tree
  oak(R, v) {
    const g = new VoxelGrid(40, 46, 40);
    const cx = 20, cz = 20;
    const trunkH = 14 + Math.floor(R() * 4);
    for (let y = 0; y < trunkH + 4; y++) {
      const r = y < 2 ? 2.8 : y < 4 ? 2.1 : 1.7;
      const sway = Math.sin(y * 0.25 + v) * 0.6;
      g.cylinder(cx + sway, cz, y, y, r, () => (R() < 0.3 ? G.barkDark : jitter(G.bark, 0.15, R)));
    }
    // branches
    for (let b = 0; b < 3; b++) {
      const a = R() * Math.PI * 2;
      for (let k = 0; k < 6; k++) g.set(cx + Math.cos(a) * k, trunkH - 3 + k * 0.7, cz + Math.sin(a) * k, G.bark);
    }
    const top = trunkH + 8;
    const tint = G.leaf[v % G.leaf.length];
    const blobs = [[0, 0, 0, 10, 8, 10]];
    for (let b = 0; b < 5; b++) {
      const a = (b / 5) * Math.PI * 2 + R();
      blobs.push([Math.cos(a) * 7, -3 + R() * 6, Math.sin(a) * 7, 6 + R() * 2, 5 + R() * 2, 6 + R() * 2]);
    }
    blobs.push([0, 7, 0, 7, 5, 7]);
    for (const [dx, dy, dz, rx, ry, rz] of blobs) {
      g.sphere(cx + dx, top + dy, cz + dz, rx, ry, rz, (x, y) => {
        const h = (y - (top - 8)) / 20;
        const base = mix(G.leafDark, tint, Math.min(1, Math.max(0, h + 0.2)));
        return R() < 0.06 ? mix(base, 0xb8e070, 0.5) : jitter(base, 0.14, R);
      }, 0.25, R);
    }
    return { grid: g, origin: [cx, 0, cz], footprint: 0.6 };
  },

  pine(R, v) {
    const g = new VoxelGrid(30, 58, 30);
    const cx = 15, cz = 15;
    for (let y = 0; y < 10; y++) g.cylinder(cx, cz, y, y, y < 2 ? 2 : 1.3, () => jitter(G.barkDark, 0.2, R));
    const layers = 6;
    let y = 8;
    for (let l = 0; l < layers; l++) {
      const r = 12 - l * 1.8;
      const h = 8 - l * 0.6;
      for (let k = 0; k < h; k++) {
        const rr = r * (1 - k / h) + 1;
        g.cylinder(cx, cz, Math.round(y + k), Math.round(y + k), rr, () => {
          const c = l % 2 ? 0x2f6a3a : 0x2a5e34;
          return R() < 0.08 ? 0x4a8a4a : jitter(c, 0.18, R);
        });
      }
      // drooping tips
      for (let a = 0; a < 8; a++) {
        const an = (a / 8) * Math.PI * 2 + l;
        g.set(cx + Math.cos(an) * (r + 0.5), y - 1, cz + Math.sin(an) * (r + 0.5), 0x2a5a30);
      }
      y += h * 0.72;
    }
    g.set(cx, Math.round(y + 1), cz, 0x3a7a42);
    return { grid: g, origin: [cx, 0, cz], footprint: 0.6 };
  },

  palm(R) {
    const g = new VoxelGrid(44, 50, 44);
    const cx = 22, cz = 22;
    let x = cx, z = cz;
    const lean = R() * Math.PI * 2;
    for (let y = 0; y < 30; y++) {
      x = cx + Math.cos(lean) * (y * y) / 120;
      z = cz + Math.sin(lean) * (y * y) / 120;
      g.cylinder(x, z, y, y, 1.4, () => ((y >> 1) % 2 ? 0x9a7a4e : 0x86663e));
    }
    const top = 30;
    g.sphere(x, top, z, 2.5, 2, 2.5, 0x6a5a2e);
    for (let f = 0; f < 7; f++) {
      const a = (f / 7) * Math.PI * 2;
      for (let k = 0; k < 16; k++) {
        const fx = x + Math.cos(a) * k, fz = z + Math.sin(a) * k;
        const fy = top + 1 + k * 0.5 - (k * k) / 18;
        const c = jitter(k % 3 ? 0x4f9a3a : 0x5aa842, 0.15, R);
        g.set(fx, fy, fz, c);
        g.set(fx + Math.sin(a), fy, fz - Math.cos(a), c);
        g.set(fx - Math.sin(a), fy, fz + Math.cos(a), c);
      }
    }
    for (let k = 0; k < 3; k++) g.sphere(x + (R() - 0.5) * 3, top - 2, z + (R() - 0.5) * 3, 1, 1, 1, 0x6a4a1e);
    return { grid: g, origin: [cx, 0, cz], footprint: 0.5 };
  },

  bush(R, v) {
    const g = new VoxelGrid(20, 12, 20);
    const flowers = [0xf0f0f0, 0xe86a8a, 0xf2d24a][v % 3];
    for (let b = 0; b < 4; b++) {
      g.sphere(10 + (R() - 0.5) * 7, 4 + R() * 2, 10 + (R() - 0.5) * 7, 4 + R() * 1.5, 3.5, 4 + R() * 1.5, (x, y) => {
        if (R() < 0.05 && y > 4) return flowers;
        return jitter(mix(0x3f7a32, 0x5aa842, y / 10), 0.15, R);
      }, 0.3, R);
    }
    return { grid: g, origin: [10, 0, 10], footprint: 0.5 };
  },

  rock(R, v) {
    const s = v % 3 === 0 ? 1.4 : 1;
    const g = new VoxelGrid(22, 14, 22);
    for (let b = 0; b < 3; b++) {
      g.sphere(11 + (R() - 0.5) * 6, 3 + R() * 2, 11 + (R() - 0.5) * 6, (4 + R() * 3) * s, (3 + R() * 2) * s, (4 + R() * 3) * s, (x, y) => {
        if (y > 5 * s && R() < 0.5) return jitter(0x6a9a42, 0.2, R);
        return jitter(R() < 0.3 ? G.stoneDark : G.stone, 0.12, R);
      }, 0.4, R);
    }
    return { grid: g, origin: [11, 0, 11], footprint: 0.9 * s };
  },

  // timber-frame cottage with a tiled roof; front (door) faces +z
  house(R, v) {
    const roofCols = [[0xc0503a, 0x9a3a28], [0x3d6aa8, 0x2c4e80], [0x4f8a3a, 0x3a6a2a], [0xb8703a, 0x8a5226], [0x7a4aa0, 0x5a3478]][v % 5];
    const W = 28, D = 22, H = 12;
    const g = new VoxelGrid(W + 6, H + 16, D + 6);
    const ox = 3, oz = 3;
    const wallCol = (x, y, z) => {
      const lx = x - ox, lz = z - oz;
      const onEdgeX = lx === 0 || lx === W - 1, onEdgeZ = lz === 0 || lz === D - 1;
      if (y < 3) return jitter((x + y + z) % 3 ? G.stone : G.stoneDark, 0.1, R);
      if (y === 3 || y === H - 1 || y === 7) return jitter(G.beam, 0.1, R);
      if ((onEdgeX && lz % 7 === 0) || (onEdgeZ && lx % 9 === 0)) return G.beam;
      // diagonal braces
      if (onEdgeZ && y > 3 && y < 7 && ((lx % 9) === (y - 3) || (lx % 9) === 8 - (y - 3))) return G.beam;
      return jitter(G.plaster, 0.05, R);
    };
    for (let y = 0; y < H; y++) for (let z = oz; z < oz + D; z++) for (let x = ox; x < ox + W; x++) {
      const edge = x === ox || x === ox + W - 1 || z === oz || z === oz + D - 1;
      if (edge) g.set(x, y, z, wallCol(x, y, z));
    }
    // floor (so the inside never shows through)
    g.box(ox + 1, 0, oz + 1, ox + W - 2, 0, oz + D - 2, 0x8a6a42);
    // door (arched) on the front
    const dz = oz + D - 1, dx = ox + 6;
    for (let y = 1; y < 9; y++) for (let x = dx; x < dx + 5; x++) {
      if (y === 8 && (x === dx || x === dx + 4)) continue;
      g.set(x, y, dz, y === 8 || x === dx || x === dx + 4 ? 0x3e2616 : jitter(0x7a4a28, 0.12, R));
    }
    g.set(dx + 3, 4, dz + 1, 0xd1a646);
    // windows with flower boxes
    const windows = [[ox + 17, dz, 'z'], [ox + 22, dz, 'z'], [ox + 6, oz, 'z'], [ox + 18, oz, 'z'], [ox, oz + 11, 'x'], [ox + W - 1, oz + 11, 'x']];
    for (const [wx, wz, axis] of windows) {
      for (let y = 4; y < 8; y++) for (let k = -1; k <= 2; k++) {
        const x = axis === 'z' ? wx + k : wx, z = axis === 'z' ? wz : wz + k;
        const frame = y === 4 || y === 7 || k === -1 || k === 2;
        g.set(x, y, z, frame ? 0x4a3020 : (y === 6 && k === 0 ? 0xcfe8ff : 0x6a9ac8));
      }
      if (axis === 'z') for (let k = -1; k <= 2; k++) {
        const out = wz === dz ? 1 : -1;
        g.set(wx + k, 3, wz + out, 0x6a4428);
        g.set(wx + k, 4, wz + out, [0xe84a5a, 0xf2d24a, 0xe86a8a, 0x5aa842][(k + 1 + v) % 4]);
      }
    }
    // gable roof along x, sloping to front/back, with overhang
    const ridgeH = 12;
    for (let k = 0; k <= ridgeH; k++) {
      const y = H + k;
      const zA = oz - 2 + k, zB = oz + D + 1 - k;
      if (zA > zB) break;
      for (let x = ox - 2; x < ox + W + 2; x++) {
        const tile = (x + k) % 4 === 0 ? roofCols[1] : jitter(roofCols[0], 0.1, R);
        g.set(x, y, zA, tile);
        g.set(x, y, zB, tile);
        if (zB - zA <= 1) { g.set(x, y, zA, roofCols[1]); g.set(x, y, zB, roofCols[1]); }
      }
      // gable ends: plaster triangle with a beam
      for (let z = zA + 1; z < zB; z++) for (const x of [ox, ox + W - 1]) g.set(x, y, z, k === 2 ? G.beam : jitter(G.plaster, 0.05, R));
    }
    // chimney
    g.box(ox + W - 7, H + 4, oz + 5, ox + W - 5, H + 12, oz + 7, () => jitter(0x8a5a4a, 0.15, R));
    g.box(ox + W - 7, H + 12, oz + 5, ox + W - 5, H + 12, oz + 7, 0x5a3a2a);
    return { grid: g, origin: [ox + W / 2, 0, oz + D / 2], footprint: 0 };
  },

  fence(R) {
    const g = new VoxelGrid(13, 6, 3);
    for (const x of [0, 12]) g.box(x, 0, 1, x, 5, 1, 0x7a5432);
    for (const y of [2, 4]) for (let x = 0; x < 13; x++) g.set(x, y, 1, jitter(0xa07a4e, 0.12, R));
    return { grid: g, origin: [6.5, 0, 1.5], footprint: 0 };
  },

  lamp(R) {
    const g = new VoxelGrid(7, 16, 7);
    g.box(2, 0, 2, 4, 0, 4, 0x3a3a40);
    g.box(3, 1, 3, 3, 11, 3, 0x3a3a40);
    g.box(1, 11, 1, 5, 11, 5, 0x2e2e34);
    g.box(2, 12, 2, 4, 14, 4, 0xffe28a);
    g.box(1, 15, 1, 5, 15, 5, 0x2e2e34);
    g.set(3, 16 - 1, 3, 0x2e2e34);
    return { grid: g, origin: [3.5, 0, 3.5], footprint: 0.3 };
  },

  fountain(R) {
    const g = new VoxelGrid(30, 18, 30);
    const c = 15;
    g.cylinder(c, c, 0, 3, 13, (x, y, z) => jitter((x + z) % 2 ? G.stone : 0xa8a49a, 0.08, R));
    for (let y = 1; y <= 3; y++) for (let z = 0; z < 30; z++) for (let x = 0; x < 30; x++) {
      if ((x - c) ** 2 + (z - c) ** 2 <= 11.5 * 11.5) g.clear(x, y, z);
    }
    g.cylinder(c, c, 1, 2, 11.5, () => jitter(0x4aa0d8, 0.1, R));
    g.cylinder(c, c, 3, 11, 2, () => jitter(0xb8b4a8, 0.08, R));
    g.cylinder(c, c, 11, 12, 6, () => jitter(G.stone, 0.08, R));
    g.cylinder(c, c, 12, 12, 5, () => jitter(0x6ab8e8, 0.1, R));
    g.cylinder(c, c, 13, 15, 1, 0xb8b4a8);
    g.sphere(c, 16, c, 1.5, 1.5, 1.5, 0x8ad0f0);
    return { grid: g, origin: [c, 0, c], footprint: 3.2 };
  },

  stall(R) {
    const g = new VoxelGrid(16, 16, 10);
    g.box(1, 0, 3, 14, 4, 7, (x, y) => (y === 4 ? 0x8a6a42 : jitter(0x7a5432, 0.12, R)));
    for (const x of [1, 14]) for (const z of [2, 8]) g.box(x, 0, z, x, 11, z, 0x6a4428);
    for (let x = 0; x < 16; x++) for (let z = 1; z < 10; z++) g.set(x, 12 - Math.abs(z - 5) * 0.3, z, Math.floor(x / 2) % 2 ? 0xf2e8d8 : 0xc8483a);
    for (let k = 0; k < 10; k++) g.set(2 + R() * 11, 5, 4 + R() * 3, [0xe84a3a, 0x7ccf5a, 0xf2d24a, 0xe8883a][k % 4]);
    return { grid: g, origin: [8, 0, 5], footprint: 1.6 };
  },

  crate(R) {
    const g = new VoxelGrid(5, 5, 5);
    g.box(0, 0, 0, 4, 4, 4, (x, y, z) => ((x % 4 === 0 && (y % 4 === 0 || z % 4 === 0)) || (y % 4 === 0 && z % 4 === 0) ? 0x7a5432 : jitter(0xb08a52, 0.1, R)));
    return { grid: g, origin: [2.5, 0, 2.5], footprint: 0.5 };
  },

  barrel(R) {
    const g = new VoxelGrid(7, 8, 7);
    g.cylinder(3, 3, 0, 7, 2.8, (x, y) => (y === 1 || y === 6 ? 0x4a4a4a : jitter(0x8a5a32, 0.12, R)));
    g.cylinder(3, 3, 7, 7, 2.2, 0x6a4428);
    return { grid: g, origin: [3.5, 0, 3.5], footprint: 0.5 };
  },

  // stone arch the portal swirl sits in; opening along x
  gate(R) {
    const g = new VoxelGrid(26, 26, 6);
    const stone = () => jitter(R() < 0.3 ? G.stoneDark : G.stone, 0.12, R);
    g.box(0, 0, 0, 4, 18, 5, stone);
    g.box(21, 0, 0, 25, 18, 5, stone);
    for (let x = 0; x < 26; x++) for (let y = 16; y < 26; y++) {
      const d = Math.hypot(x - 12.5, (y - 16) * 1.3);
      if (d > 8.5 && d < 13.5) g.box(x, y, 0, x, y, 5, stone);
    }
    // glowing runes
    for (const x of [2, 23]) for (let y = 4; y < 16; y += 4) { g.set(x, y, -0, 0x8ae8ff); g.set(x, y, 5, 0x8ae8ff); }
    g.box(11, 23, 0, 14, 24, 5, 0x8ae8ff);
    return { grid: g, origin: [13, 0, 3], footprint: 0 };
  },

  shroom(R, v) {
    const g = new VoxelGrid(10, 10, 10);
    const cap = [0xc8483a, 0xb8703a, 0x9a5ac8][v % 3];
    g.cylinder(5, 5, 0, 4, 1, 0xf0e2c4);
    g.sphere(5, 5, 5, 4, 2.5, 4, (x, y) => (R() < 0.15 && y > 5 ? 0xffffff : jitter(cap, 0.1, R)));
    for (let y = 0; y < 4; y++) for (let z = 0; z < 10; z++) for (let x = 0; x < 10; x++) if (y < 5 && g.get(x, y, z) && !((x - 5) ** 2 + (z - 5) ** 2 <= 2)) g.clear(x, y, z);
    return { grid: g, origin: [5, 0, 5], footprint: 0 };
  },

  log(R) {
    const g = new VoxelGrid(24, 7, 7);
    for (let x = 1; x < 23; x++) for (let y = 0; y < 7; y++) for (let z = 0; z < 7; z++) {
      if ((y - 3) ** 2 + (z - 3) ** 2 <= 9) g.set(x, y, z, x === 1 || x === 22 ? ((y - 3) ** 2 + (z - 3) ** 2 < 3 ? 0xc8a070 : 0xa07a4e) : (R() < 0.2 && y > 4 ? 0x5a8a3a : jitter(G.bark, 0.15, R)));
    }
    return { grid: g, origin: [12, 0, 3.5], footprint: 0.8 };
  },

  cloud(R) {
    const g = new VoxelGrid(40, 10, 24);
    for (let b = 0; b < 6; b++) g.sphere(8 + R() * 24, 4 + R() * 2, 8 + R() * 8, 5 + R() * 4, 3 + R() * 2, 5 + R() * 3, (x, y) => (y < 4 ? 0xe4ecf4 : 0xffffff), 0, R);
    return { grid: g, origin: [20, 0, 12], footprint: 0 };
  },

  boat(R) {
    const g = new VoxelGrid(10, 6, 22);
    for (let z = 0; z < 22; z++) {
      const w = Math.min(4, 1 + Math.min(z, 21 - z) * 0.6);
      for (let x = 0; x < 10; x++) if (Math.abs(x - 4.5) <= w) {
        g.set(x, 0, z, 0x6a4428);
        if (Math.abs(x - 4.5) > w - 1.2) for (let y = 1; y < 4; y++) g.set(x, y, z, jitter(0x8a5a32, 0.12, R));
      }
    }
    g.box(1, 2, 10, 8, 2, 11, 0x6a4428);
    return { grid: g, origin: [5, 0, 11], footprint: 1.5 };
  },

  sign(R) {
    const g = new VoxelGrid(10, 12, 3);
    g.box(4, 0, 1, 5, 10, 1, 0x6a4428);
    g.box(0, 7, 0, 9, 10, 2, (x, y) => (y === 7 || y === 10 ? 0x5a3a22 : jitter(0xa07a4e, 0.1, R)));
    return { grid: g, origin: [5, 0, 1.5], footprint: 0.3 };
  },
};

// Merge many placements of shared geometries into one mesh per material (fewer draw calls).
export function placeAll(list) {
  const geos = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  for (const it of list) {
    const g = it.geo.clone();
    e.set(0, it.ry || 0, 0);
    q.setFromEuler(e);
    s.setScalar(it.scale || 1);
    p.set(it.x, it.y, it.z);
    m.compose(p, q, s);
    g.applyMatrix4(m);
    geos.push(g);
  }
  return geos;
}
