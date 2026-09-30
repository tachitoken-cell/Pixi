// Voxel models for the Miniland: residences, warehouses, the dog kennel, terrace and garden
// decorations and the four minigame stations. 4 voxels = 1 world unit (see props.js).
import { VoxelGrid, jitter, mix } from './voxel.js';
import { registerProp } from './props.js';

const WOOD = 0xa07a4e, WOOD_D = 0x7a5432, WOOD_DD = 0x5a3a22, IRON = 0x4a4a52, GOLD = 0xd8b04a;
const STONE = 0x9a968c, STONE_D = 0x7a766e, CANVAS = 0xf2e8d0, RED = 0xc8483a, BLUE = 0x3a6ab8;
const TIER = [0xb87a4a, 0xc8ccd4, 0xf2c84a];         // bronze / silver / gold pennant for Easy / Medium / Good

function pennant(g, x, y, z, tier) {
  g.box(x, y, z, x, y + 7, z, WOOD_DD);
  for (let k = 0; k < 4; k++) g.box(x + 1, y + 7 - k, z, x + 4 - k, y + 7 - k, z, TIER[tier]);
}

const MODELS = {
  // ---------------- residences (garden)
  ml_tent(R) {
    const g = new VoxelGrid(22, 16, 26);
    for (let z = 1; z < 25; z++) for (let y = 0; y < 14; y++) {
      const half = (14 - y) * 0.75;
      for (let x = Math.round(11 - half); x <= Math.round(11 + half); x++) {
        const edge = Math.abs(x - 11) > half - 1.2;
        if (!edge && z > 1 && z < 24) continue;                     // hollow inside
        g.set(x, y, z, Math.floor(z / 3) % 2 ? jitter(CANVAS, 0.05, R) : jitter(RED, 0.08, R));
      }
    }
    for (let y = 0; y < 8; y++) for (let x = 9; x <= 13; x++) if (Math.abs(x - 11) < (8 - y) * 0.35 + 0.5) g.set(x, y, 1, 0x3a2a24); // open flap
    for (const z of [0, 25]) g.box(11, 0, z, 11, 15, z, WOOD_DD);
    g.box(11, 14, 0, 11, 14, 25, WOOD_D);
    g.box(3, 0, 0, 4, 1, 0, 0x6a4a2e); g.box(18, 0, 25, 19, 1, 25, 0x6a4a2e);
    return { grid: g, origin: [11, 0, 13], footprint: 2.6 };
  },
  ml_cabin(R) {
    const g = new VoxelGrid(30, 30, 26);
    for (let y = 0; y < 16; y++) for (let z = 2; z < 24; z++) for (let x = 2; x < 28; x++) {
      const wall = x === 2 || x === 27 || z === 2 || z === 23;
      if (!wall) continue;
      g.set(x, y, z, y % 3 === 0 ? WOOD_DD : jitter(0x9a6a3e, 0.12, R));          // stacked logs
    }
    for (const [x, z] of [[2, 2], [27, 2], [2, 23], [27, 23]]) g.box(x, 0, z, x, 16, z, 0x6a4428);
    g.box(12, 0, 23, 17, 10, 23, 0x5a3a22); g.box(16, 5, 24, 16, 5, 24, GOLD);          // door, handle
    for (const x of [5, 21]) { g.box(x, 6, 23, x + 3, 10, 23, 0x9ad8f0); g.box(x - 1, 5, 24, x + 4, 5, 24, WOOD_DD); }
    for (let k = 0; k < 13; k++) for (let z = 0; z < 26; z++) {                      // red roof
      const y = 16 + k;
      g.set(1 + k, y, z, jitter(0xb8403a, 0.1, R)); g.set(28 - k, y, z, jitter(0xb8403a, 0.1, R));
      if (z === 2 || z === 23) for (let x = 2 + k; x <= 27 - k; x++) g.set(x, y, z, jitter(0x9a6a3e, 0.1, R));
    }
    g.box(21, 22, 8, 23, 29, 10, () => jitter(0x8a5a4a, 0.15, R));
    return { grid: g, origin: [15, 0, 13], footprint: 3.4 };
  },
  ml_villa(R) {
    const g = new VoxelGrid(40, 38, 30);
    const stone = () => jitter(R() < 0.3 ? STONE_D : STONE, 0.1, R);
    for (let y = 0; y < 22; y++) for (let z = 2; z < 28; z++) for (let x = 2; x < 38; x++) {
      if (x === 2 || x === 37 || z === 2 || z === 27) g.set(x, y, z, y === 11 ? 0xd8d0c0 : stone());
    }
    g.box(16, 0, 27, 23, 14, 27, 0x5a3a22); g.box(15, 15, 28, 24, 15, 29, 0xd8d0c0);  // door + lintel
    g.box(14, 0, 28, 25, 0, 30, STONE_D);                                          // steps
    for (const x of [5, 27]) for (const y of [4, 15]) { g.box(x, y, 27, x + 5, y + 4, 27, 0x9ad8f0); g.box(x - 1, y - 1, 28, x + 6, y - 1, 28, 0xd8d0c0); }
    for (let k = 0; k < 16; k++) for (let z = 0; z < 30; z++) {
      const y = 22 + k * 0.9;
      g.set(1 + k, y, z, jitter(BLUE, 0.1, R)); g.set(38 - k, y, z, jitter(BLUE, 0.1, R));
      if (z === 2 || z === 27) for (let x = 2 + k; x <= 37 - k; x++) g.set(x, y, z, stone());
    }
    for (const x of [8, 30]) g.box(x, 26, 6, x + 2, 36, 8, () => jitter(0x8a5a4a, 0.15, R));
    return { grid: g, origin: [20, 0, 15], footprint: 4.4 };
  },
  // ---------------- warehouses (terrace)
  ml_chest_tiny(R) {
    const g = new VoxelGrid(8, 7, 6);
    g.box(0, 0, 0, 7, 4, 5, (x, y, z) => (x === 0 || x === 7 || y === 4 ? WOOD_DD : jitter(WOOD, 0.1, R)));
    g.box(0, 5, 1, 7, 5, 4, WOOD_D); g.box(3, 3, 6, 4, 4, 6, GOLD);
    for (const x of [2, 5]) g.box(x, 0, 0, x, 5, 0, IRON);
    return { grid: g, origin: [4, 0, 3], footprint: 0.9 };
  },
  ml_chest(R) {
    const g = new VoxelGrid(12, 10, 8);
    g.box(0, 0, 0, 11, 5, 7, () => jitter(0x8a5a32, 0.1, R));
    g.sphere(5.5, 6, 3.5, 6, 3, 4, () => jitter(0x9a6a3e, 0.1, R));
    for (let y = 0; y < 10; y++) for (let z = 0; z < 8; z++) for (let x = 0; x < 12; x++) if (y > 5 && (x < 0 || x > 11)) g.clear(x, y, z);
    for (const x of [1, 5, 10]) for (let y = 0; y < 9; y++) for (let z = -1; z < 9; z++) if (g.get(x, y, z)) g.set(x, y, z, IRON);
    g.box(5, 3, 8, 6, 5, 8, GOLD);
    return { grid: g, origin: [6, 0, 4], footprint: 1.2 };
  },
  ml_cabinet(R) {
    const g = new VoxelGrid(12, 18, 7);
    g.box(0, 0, 0, 11, 16, 6, (x, y) => (y === 16 || x === 0 || x === 11 ? WOOD_DD : jitter(0x8a5a32, 0.08, R)));
    g.box(1, 1, 7, 5, 15, 7, jitter(WOOD, 0.1, R)); g.box(6, 1, 7, 10, 15, 7, jitter(WOOD, 0.1, R));
    g.box(5, 8, 7, 5, 9, 7, GOLD); g.box(6, 8, 7, 6, 9, 7, GOLD);
    g.box(-1, 17, -1, 12, 17, 7, WOOD_DD);
    return { grid: g, origin: [6, 0, 3.5], footprint: 1.3 };
  },
  ml_shed(R) {
    const g = new VoxelGrid(20, 20, 16);
    for (let y = 0; y < 13; y++) for (let z = 1; z < 15; z++) for (let x = 1; x < 19; x++)
      if (x === 1 || x === 18 || z === 1 || z === 14) g.set(x, y, z, x % 3 === 0 ? WOOD_D : jitter(0x9a7a4e, 0.1, R));
    g.box(5, 0, 14, 14, 10, 14, (x, y) => (x === 9 || x === 10 || y === 10 || (x - 5) === (y) || (14 - x) === y ? WOOD_DD : jitter(0x8a5a32, 0.1, R)));
    for (let k = 0; k < 10; k++) for (let z = 0; z < 16; z++) { g.set(k, 13 + k * 0.7, z, jitter(0x4a6a3a, 0.1, R)); g.set(19 - k, 13 + k * 0.7, z, jitter(0x4a6a3a, 0.1, R)); }
    return { grid: g, origin: [10, 0, 8], footprint: 2.3 };
  },
  // ---------------- NosMate
  ml_kennel(R) {
    const g = new VoxelGrid(12, 12, 12);
    for (let y = 0; y < 6; y++) for (let z = 1; z < 11; z++) for (let x = 1; x < 11; x++) if (x === 1 || x === 10 || z === 1 || z === 10) g.set(x, y, z, jitter(0xd8b078, 0.1, R));
    for (let y = 0; y < 5; y++) for (let x = 4; x < 8; x++) if (Math.hypot(x - 5.5, y - 1) < 3.2) g.clear(x, y, 10);
    for (let k = 0; k < 6; k++) for (let z = 0; z < 12; z++) { g.set(k, 6 + k, z, jitter(0x3a6ab8, 0.1, R)); g.set(11 - k, 6 + k, z, jitter(0x3a6ab8, 0.1, R)); }
    g.box(3, 7, 11, 8, 8, 11, 0xf2e8d0);                                           // name plate
    g.cylinder(9.5, 11.5, 0, 0, 1.2, RED);                                            // food bowl
    g.set(9, 1, 11, 0x8a5a32); g.set(10, 1, 12, 0x8a5a32);
    return { grid: g, origin: [6, 0, 6], footprint: 1.4 };
  },
  // ---------------- terrace decorations
  ml_carpet(R, v) {
    const g = new VoxelGrid(18, 1, 12);
    const [a, b, c] = v ? [0x3a5ab8, 0xf2e8d0, 0x2a3a78] : [0xb8342b, 0xf2c84a, 0x7a1e18];
    for (let z = 0; z < 12; z++) for (let x = 0; x < 18; x++) {
      const border = x < 1 || x > 16 || z < 1 || z > 10, inner = x === 3 || x === 14 || z === 3 || z === 8;
      const diamond = Math.abs(x - 8.5) + Math.abs(z - 5.5) < 3;
      g.set(x, 0, z, border ? c : diamond ? b : inner ? b : jitter(a, 0.05, R));
    }
    return { grid: g, origin: [9, 0, 6], footprint: 0 };
  },
  ml_pot(R, v) {
    const g = new VoxelGrid(8, 16, 8);
    g.cylinder(3.5, 3.5, 0, 3, 2.6, (x, y) => (y === 3 ? 0xc87a4a : jitter(0xb0603a, 0.08, R)));
    g.cylinder(3.5, 3.5, 3, 3, 2, 0x5a3a22);
    if (v === 0) { g.sphere(3.5, 6, 3.5, 3, 2.6, 3, (x, y, z) => (R() < 0.35 ? [0xe86a8a, 0xf2d24a, 0xffffff][Math.floor(R() * 3)] : jitter(0x4f9a3a, 0.12, R)), 0.3, R); }
    else if (v === 1) { g.box(3, 4, 3, 4, 11, 4, 0x8a6a3e); for (let a = 0; a < 6; a++) for (let k = 0; k < 4; k++) g.set(3.5 + Math.cos(a) * k, 12 - k * 0.6, 3.5 + Math.sin(a) * k, jitter(0x5aa842, 0.1, R)); }
    else { g.box(3, 4, 3, 4, 10, 4, 0x6aaa4a); g.box(1, 6, 3, 2, 8, 3, 0x6aaa4a); g.box(5, 7, 4, 6, 9, 4, 0x6aaa4a); g.set(3, 11, 3, 0xf28aa8); }
    return { grid: g, origin: [4, 0, 4], footprint: 0.5 };
  },
  ml_teatable(R) {
    const g = new VoxelGrid(18, 7, 12);
    g.cylinder(9, 6, 4, 4, 3.4, jitter(0xb08a52, 0.05, R)); g.box(9, 0, 6, 9, 3, 6, WOOD_DD);
    g.box(10, 5, 5, 10, 5, 6, 0xf2f2f2); g.set(8, 5, 7, 0xf2f2f2);                  // cups
    for (const x of [2, 16]) { g.box(x - 1, 2, 5, x + 1, 2, 7, RED); for (const [dx, dz] of [[-1, 5], [1, 7]]) g.box(x + dx, 0, dz, x + dx, 1, dz, WOOD_DD); }
    return { grid: g, origin: [9, 0, 6], footprint: 1.2 };
  },
  ml_lantern(R) {
    const g = new VoxelGrid(7, 18, 7);
    g.box(2, 0, 2, 4, 0, 4, WOOD_DD); g.box(3, 1, 3, 3, 12, 3, WOOD_DD);
    g.sphere(3, 14.5, 3, 2.6, 3, 2.6, (x, y) => (y === 12 || y === 17 ? 0x2a2a2a : 0xf26a4a));
    g.box(3, 15, 1, 3, 15, 1, GOLD); g.box(3, 15, 5, 3, 15, 5, GOLD);
    return { grid: g, origin: [3.5, 0, 3.5], footprint: 0.4 };
  },
  // ---------------- garden decorations
  ml_flowerbed(R) {
    const g = new VoxelGrid(16, 4, 8);
    g.box(0, 0, 0, 15, 1, 7, (x, y, z) => (x === 0 || x === 15 || z === 0 || z === 7 ? WOOD_D : 0x6a4a2e));
    for (let z = 1; z < 7; z++) for (let x = 1; x < 15; x++) {
      g.set(x, 2, z, jitter(0x4f9a3a, 0.15, R));
      if (R() < 0.45) g.set(x, 3, z, [0xe84a6a, 0xf2d24a, 0xffffff, 0x9a8aff, 0xff8a4a][Math.floor(R() * 5)]);
    }
    return { grid: g, origin: [8, 0, 4], footprint: 1.2 };
  },
  ml_well(R) {
    const g = new VoxelGrid(14, 22, 14);
    g.cylinder(7, 7, 0, 5, 5.5, () => jitter(R() < 0.3 ? STONE_D : STONE, 0.1, R));
    for (let y = 1; y <= 5; y++) for (let z = 0; z < 14; z++) for (let x = 0; x < 14; x++) if ((x - 7) ** 2 + (z - 7) ** 2 < 16) g.clear(x, y, z);
    g.cylinder(7, 7, 1, 1, 4, 0x3a8ad8);
    for (const x of [2, 12]) g.box(x, 5, 7, x, 16, 7, WOOD_DD);
    g.box(2, 13, 7, 12, 13, 7, WOOD_D); g.box(6, 9, 6, 8, 11, 8, 0x8a5a32);        // winch + bucket
    for (let k = 0; k < 7; k++) for (let z = 3; z < 12; z++) { g.set(1 + k, 16 + k * 0.8, z, jitter(0xb8403a, 0.1, R)); g.set(13 - k, 16 + k * 0.8, z, jitter(0xb8403a, 0.1, R)); }
    return { grid: g, origin: [7, 0, 7], footprint: 1.5 };
  },
  ml_windmill(R) {
    const g = new VoxelGrid(22, 32, 12);
    for (let y = 0; y < 20; y++) { const r = 4.2 - y * 0.12; g.cylinder(11, 6, y, y, r, () => jitter(y % 5 === 0 ? 0xd8c8a8 : 0xf0e4c8, 0.05, R)); }
    g.sphere(11, 21, 6, 3.4, 3, 3.4, () => jitter(0xb8403a, 0.1, R));
    g.box(10, 13, 10, 11, 17, 10, 0x5a3a22);
    for (let k = -9; k <= 9; k++) { g.set(11 + k, 19 + k, 11, WOOD_D); g.set(11 + k, 19 - k, 11, WOOD_D); }
    for (let k = 3; k <= 9; k++) for (const [sx, sy] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) g.set(11 + sx * k + (sx === sy ? 1 : 0), 19 + sy * k, 11, 0xf2e8d0);
    return { grid: g, origin: [11, 0, 6], footprint: 1.4 };
  },
  ml_statue(R) {
    const g = new VoxelGrid(12, 26, 12);
    g.box(1, 0, 1, 10, 3, 10, () => jitter(STONE_D, 0.08, R));
    const s = () => jitter(0xb8b4a8, 0.08, R);
    g.box(4, 4, 5, 5, 9, 6, s); g.box(6, 4, 5, 7, 9, 6, s);                          // legs
    g.box(3, 10, 4, 8, 15, 7, s);                                                     // body
    g.box(1, 12, 5, 2, 15, 6, s); g.box(9, 13, 5, 10, 18, 6, s);                      // arms (one raised)
    g.box(9, 18, 5, 9, 25, 5, 0xd8d0c0);                                              // sword
    g.sphere(5.5, 18.5, 5.5, 3, 3, 3, s);                                             // head
    g.sphere(5.5, 20.5, 5.5, 3.2, 1.6, 3.2, s, 0.4, R);                               // hair
    g.box(3, 1, 11, 8, 2, 11, GOLD);                                                  // plaque
    return { grid: g, origin: [6, 0, 6], footprint: 1.3 };
  },
  ml_bench(R) {
    const g = new VoxelGrid(16, 8, 6);
    g.box(0, 3, 1, 15, 3, 4, () => jitter(WOOD, 0.08, R)); g.box(0, 4, 5, 15, 7, 5, () => jitter(WOOD, 0.08, R));
    for (const x of [1, 14]) { g.box(x, 0, 1, x, 2, 1, IRON); g.box(x, 0, 4, x, 7, 4, IRON); }
    return { grid: g, origin: [8, 0, 3], footprint: 1 };
  },
  ml_gnome(R) {
    const g = new VoxelGrid(6, 12, 6);
    g.box(1, 0, 2, 4, 1, 3, 0x5a3a22); g.box(1, 2, 1, 4, 5, 4, BLUE);
    g.box(1, 6, 1, 4, 8, 4, 0xf2c8a0); g.box(1, 5, 4, 4, 6, 5, 0xffffff);             // face + beard
    for (let k = 0; k < 4; k++) g.box(1 + k * 0.4, 9 + k, 1 + k * 0.4, 4 - k * 0.4, 9 + k, 4 - k * 0.4, RED);
    return { grid: g, origin: [3, 0, 3], footprint: 0.4 };
  },
  ml_signpost(R) {
    const g = new VoxelGrid(12, 16, 4);
    g.box(5, 0, 2, 6, 14, 2, WOOD_DD);
    g.box(0, 9, 1, 11, 13, 3, (x, y) => (y === 9 || y === 13 ? WOOD_DD : jitter(0xd8b078, 0.08, R)));
    for (let x = 2; x < 10; x++) if (x % 2) g.set(x, 11, 4, 0x3a2a24);
    g.box(4, 14, 2, 7, 15, 2, RED);
    return { grid: g, origin: [6, 0, 2], footprint: 0.5 };
  },
  // ---------------- minigame stations (production area); variant = tier 0..2
  ml_quarry(R, v) {
    const g = new VoxelGrid(24, 18, 20);
    g.sphere(10, 5, 9, 8, 7, 7, (x, y) => (R() < 0.08 ? [0x6ae8ff, 0xffd24a, 0xb88aff][Math.floor(R() * 3)] : jitter(R() < 0.4 ? STONE_D : STONE, 0.12, R)), 0.3, R);
    g.box(16, 0, 14, 22, 3, 18, () => jitter(0x6a4a2e, 0.1, R)); g.box(17, 4, 15, 21, 5, 17, () => jitter(STONE, 0.1, R)); // cart
    for (const x of [16, 22]) g.box(x, 0, 13, x, 1, 13, IRON);
    g.box(3, 0, 16, 3, 7, 16, WOOD_DD); g.box(1, 7, 16, 6, 8, 16, IRON);              // pickaxe
    pennant(g, 1, 0, 3, v);
    return { grid: g, origin: [12, 0, 10], footprint: 2.2 };
  },
  ml_sawmill(R, v) {
    const g = new VoxelGrid(28, 16, 18);
    g.box(0, 3, 6, 27, 4, 11, (x) => (x % 4 === 0 ? 0x3a3a40 : 0x5a5a62));            // conveyor
    for (const x of [1, 26]) for (const z of [6, 11]) g.box(x, 0, z, x, 2, z, WOOD_DD);
    for (let a = 0; a < 40; a++) { const r = 4, y = 7 + Math.sin(a / 40 * Math.PI * 2) * r, x = 14 + Math.cos(a / 40 * Math.PI * 2) * r; g.set(x, y, 8, a % 4 ? 0xc8ccd4 : 0x8a8a92); }
    g.box(13, 3, 7, 15, 12, 7, 0x6a4428);
    for (let k = 0; k < 3; k++) for (let x = 2; x < 11; x++) for (let z = 13 + k * 0; z < 17; z++) if ((z - 15) ** 2 + (k * 2.5 - 2.5) ** 2 < 5) g.set(x, 1 + k * 2, z, x === 2 || x === 10 ? 0xc8a070 : jitter(0x7a5432, 0.12, R));
    for (let k = 0; k < 3; k++) for (let x = 17; x < 26; x++) g.set(x, 5, 8 + k, jitter(0xd8b078, 0.1, R));
    pennant(g, 26, 0, 16, v);
    return { grid: g, origin: [14, 0, 9], footprint: 2.5 };
  },
  ml_pond(R, v) {
    const g = new VoxelGrid(26, 12, 26);
    for (let z = 0; z < 26; z++) for (let x = 0; x < 26; x++) {
      const d = Math.hypot(x - 13, z - 13);
      if (d < 12) g.set(x, 0, z, d > 10.5 ? jitter(R() < 0.4 ? STONE_D : STONE, 0.1, R) : jitter(0x3a9ad8, 0.06, R));
      if (d >= 10.5 && d < 12) g.set(x, 1, z, jitter(STONE, 0.1, R));
    }
    for (let i = 0; i < 4; i++) {                                                     // four rods on posts
      const a = i * Math.PI / 2 + 0.6, px = 13 + Math.cos(a) * 11, pz = 13 + Math.sin(a) * 11;
      g.box(px, 1, pz, px, 4, pz, WOOD_DD);
      for (let k = 0; k < 8; k++) g.set(px - Math.cos(a) * k * 0.8, 4 + k * 0.7, pz - Math.sin(a) * k * 0.8, 0x6a4428);
      g.set(13 + Math.cos(a) * 5, 1, 13 + Math.sin(a) * 5, i % 2 ? RED : 0xffffff);
    }
    g.box(2, 1, 22, 3, 2, 24, WOOD_D);
    pennant(g, 1, 1, 1, v);
    return { grid: g, origin: [13, 0, 13], footprint: 2.8 };
  },
  ml_range(R, v) {
    const g = new VoxelGrid(26, 18, 16);
    g.box(0, 0, 11, 25, 4, 14, (x, y) => (y === 4 ? 0xd8b078 : jitter(RED, 0.08, R)));   // counter
    for (const x of [0, 25]) g.box(x, 0, 12, x, 14, 12, WOOD_DD);
    for (let x = 0; x < 26; x++) g.set(x, 15, 12, x % 4 < 2 ? RED : CANVAS);          // awning
    for (let x = 0; x < 26; x++) g.set(x, 14, 13, x % 4 < 2 ? RED : CANVAS);
    g.box(0, 0, 0, 25, 8, 0, () => jitter(WOOD, 0.1, R));                              // back wall
    for (const x of [5, 13, 20]) { g.box(x - 1, 4, 1, x + 1, 6, 1, 0xf4f0e8); g.set(x + 1, 7, 1, RED); g.set(x + 2, 5, 1, 0xf2b23a); } // chicken targets
    g.box(9, 3, 1, 10, 6, 1, 0x3a2a4a); g.set(9, 7, 1, 0xd8483a);                       // a vampire target
    pennant(g, 24, 5, 14, v);
    return { grid: g, origin: [13, 0, 8], footprint: 2.5 };
  },
};
for (const [k, fn] of Object.entries(MODELS)) registerProp(k, fn);

// ---------------- town props (villages)
const TOWN = {
  crops(R, v) {                                   // a patch of wheat (0) or cabbages (1)
    const g = new VoxelGrid(16, 6, 16);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      g.set(x, 0, z, (z % 4 === 0) ? 0x6a4a2e : 0x7a5a3a);
      if (z % 4 === 0) continue;
      if (v === 0) { const h = 3 + Math.floor(R() * 3); for (let y = 1; y <= h; y++) g.set(x, y, z, y === h ? jitter(0xf2d26a, 0.12, R) : jitter(0xc8b04a, 0.12, R)); }
      else if (x % 3 === 1 && z % 4 === 2) g.sphere(x, 1.5, z, 1.4, 1.2, 1.4, () => jitter(0x7ccf5a, 0.15, R));
    }
    return { grid: g, origin: [8, 0, 8], footprint: 0 };
  },
  haybale(R) {
    const g = new VoxelGrid(8, 7, 8);
    g.cylinder(4, 4, 0, 5, 3.5, (x, y) => (y === 2 ? 0xb8903a : jitter(0xe8c86a, 0.1, R)));
    return { grid: g, origin: [4, 0, 4], footprint: 0.9 };
  },
  mtent(R, v) {                                   // market tent with coloured roof
    const g = new VoxelGrid(18, 16, 14);
    const col = [0xc8483a, 0x3a6ab8, 0x4f9a3a, 0xe8a83a][v % 4];
    for (const [x, z] of [[1, 1], [16, 1], [1, 12], [16, 12]]) g.box(x, 0, z, x, 10, z, WOOD_DD);
    for (let k = 0; k < 6; k++) for (let x = 0; x < 18; x++) for (let z = k; z < 14 - k; z++) if (z === k || z === 13 - k) g.set(x, 10 + k, z, x % 4 < 2 ? col : CANVAS);
    g.box(2, 0, 3, 15, 3, 5, (x, y) => (y === 3 ? 0xd8b078 : jitter(WOOD_D, 0.1, R)));
    for (let k = 0; k < 10; k++) g.set(3 + R() * 12, 4, 3 + R() * 2, [0xe84a3a, 0x7ccf5a, 0xf2d24a, 0xe8883a, 0x9a8aff][k % 5]);
    return { grid: g, origin: [9, 0, 7], footprint: 1.9 };
  },
  anvil(R) {
    const g = new VoxelGrid(10, 7, 6);
    g.box(3, 0, 1, 6, 2, 4, 0x5a3a22); g.box(4, 3, 2, 5, 3, 3, IRON); g.box(1, 4, 1, 8, 5, 4, 0x3a3a42); g.box(8, 5, 2, 9, 5, 3, 0x3a3a42);
    return { grid: g, origin: [5, 0, 3], footprint: 0.8 };
  },
  pier(R) {                                        // wooden planks on posts
    const g = new VoxelGrid(12, 5, 40);
    for (let z = 0; z < 40; z++) for (let x = 0; x < 12; x++) g.set(x, 4, z, z % 3 === 0 ? WOOD_DD : jitter(WOOD, 0.1, R));
    for (let z = 2; z < 40; z += 8) for (const x of [0, 11]) g.box(x, 0, z, x, 3, z, WOOD_DD);
    return { grid: g, origin: [6, 0, 20], footprint: 0 };
  },
  logpile(R) {
    const g = new VoxelGrid(22, 10, 10);
    for (let row = 0; row < 3; row++) for (let n = 0; n < 3 - row; n++) {
      const cz = 2.5 + n * 5 + row * 2.5, cy = 2 + row * 3.6;
      for (let x = 0; x < 22; x++) for (let z = 0; z < 10; z++) for (let y = 0; y < 10; y++) if ((z - cz) ** 2 + (y - cy) ** 2 < 5.2) g.set(x, y, z, x === 0 || x === 21 ? 0xc8a070 : jitter(0x7a5432, 0.12, R));
    }
    return { grid: g, origin: [11, 0, 5], footprint: 1.4 };
  },
};
for (const [k, fn] of Object.entries(TOWN)) registerProp(k, fn);
