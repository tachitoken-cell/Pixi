import { ZONES } from './content.ts';
import * as THREE from 'three';
import type { RealmCollider } from './realm.ts';
import type { DungeonState, Player } from './shared.ts';
import type { RaidState } from './raid.ts';
import type { Swimmer } from './water-effects.ts';
import { createEnvironmentLights, type EnvironmentEmitter } from './environment-lights.ts';

type Block = { x: number; y: number; z: number; w: number; h: number; d: number; color: number; rotation: number };
export type WorldCollider = RealmCollider;
export type WorldCitizen = { name: string; title: string; mesh: THREE.Group };
export type WorldInstance = { citizens?: Map<string, WorldCitizen>; boards?: Map<string, THREE.Object3D>; pollBooths?: Map<string, THREE.Object3D>; chairs?: Map<string, THREE.Object3D>; setInteriorView?: (player: {x:number;z:number}, camera: {x:number;z:number}) => void; constrainCamera?: (target: THREE.Vector3, desired: THREE.Vector3) => void; villagers?: Map<string, THREE.Group>; colliders: WorldCollider[]; update: (time: number, observer?: THREE.Vector3, camera?: THREE.Camera, daylight?: number) => void; dispose: () => void; setBeaconLit?: (lit: boolean) => void; setRegionBeaconLit?: (zone: string, lit: boolean) => void; setInstantCombatState?: (state: import('./instant-combat').InstantCombatState | null, serverNow?: number) => void; setRaidState?: (state: RaidState | null, serverNow?: number, players?: readonly Player[]) => void; setDungeonState?: (state: DungeonState | null, serverNow?: number) => void; setDungeonRoom?: (roomId: string | null) => void; dungeonRoomClipping?: THREE.Plane[]; setSwimmers?: (points: readonly Swimmer[]) => void };

export function disposeWorldGroup(group: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  group.removeFromParent();
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
    if (object instanceof THREE.InstancedMesh) object.dispose();
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  textures.forEach(texture => texture.dispose());
  group.clear();
}

/** The terrain stays at y=0; gameplay entities belong to the simulation. */
export async function createWorld(scene: THREE.Scene): Promise<WorldInstance> {
  const group = new THREE.Group();
  group.name = 'Mossvale';
  scene.add(group);
  const colliders: WorldCollider[] = [];
  const emitters: EnvironmentEmitter[] = [];
  const blocks: Block[] = [];
  let seed = 81224;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = (colors: number[]) => colors[Math.floor(random() * colors.length)];
  const cube = (x: number, y: number, z: number, w: number, h: number, d: number, color: number, rotation = 0) => {
    blocks.push({ x, y, z, w, h, d, color, rotation });
  };
  const grass = [0x75a851, 0x72a34d, 0x7cac55, 0x6fa04b, 0x7dac57];
  const bark = [0x725237, 0x684d35, 0x795b3c];
  const leaves = [0x348a50, 0x45974e, 0x51a152, 0x62aa4f, 0x3e9450];
  const riverX = (z: number) => -20 + Math.sin(z * .075) * 2.3;
  const onPath = (x: number, z: number, margin = 0) =>
    Math.abs(x - Math.sin(z * .12) * 1.1) < 2.1 + margin ||
    Math.abs(z - 4 - Math.sin(x * .1) * .5) < 1.8 + margin ||
    (z < -11 && z > -14 && x > -13 && x < 14);
  const houses = [
    { x: -10, z: -8.2, w: 5.7, d: 5.2, h: 3.5, angle: -.09, roof: 0xc96442 },
    { x: 7.4, z: -18.3, w: 6.9, d: 5.8, h: 4.1, angle: .05, roof: 0xc57646 },
    { x: -27.2, z: -7.5, w: 6.5, d: 5.8, h: 3.5, angle: -.13, roof: 0xbd6241 },
    { x: 20.5, z: -17.5, w: 5.8, d: 5.2, h: 3.3, angle: -.17, roof: 0xad6249 },
    { x: -7.2, z: 16, w: 5.2, d: 5, h: 3.3, angle: .12, roof: 0xc77e51 },
  ];

  // One shared box geometry and one material keep thousands of voxel details cheap.
  cube(0, -1.25, 0, 115, 2, 115, 0x698652);
  for (let x = -48; x < 48; x += 2) {
    for (let z = -48; z < 48; z += 2) cube(x + 1, -.14, z + 1, 2.015, .28, 2.015, pick(grass));
  }

  // Small individual paving stones let the roads have soft, irregular edges.
  for (let x = -36; x <= 36; x += .75) {
    for (let z = -34; z <= 34; z += .75) {
      if (!onPath(x, z) || Math.abs(x - riverX(z)) < 2.2) continue;
      if (onPath(x, z, -.25) || random() > .45) {
        cube(x + random() * .08, .018, z + random() * .08, .70 + random() * .09, .045, .7 + random() * .09,
          pick([0xc8b78c, 0xd4c49c, 0xcaba92, 0xc1b189, 0xcfbe94]), (random() - .5) * .05);
      }
    }
  }
  for (let i = 0; i < 45; i++) {
    const a = random() * Math.PI * 2, r = Math.sqrt(random()) * 3;
    cube(Math.cos(a) * r, .026, Math.sin(a) * r, .74, .055, .74, pick([0xcfbf96, 0xc6b68f, 0xd5c5a0]));
  }

  // River tiles share one animated material; the banks keep its blocky silhouette.
  const waterMaterial = new THREE.MeshStandardMaterial({ color: 0x58b8bf, roughness: .31, metalness: .15, transparent: true, opacity: .85 });
  const waterGeometry = new THREE.BoxGeometry(1, 1, 1);
  const water = new THREE.InstancedMesh(waterGeometry, waterMaterial, 100);
  water.name = 'Willowbrook';
  const temp = new THREE.Object3D();
  for (let i = 0; i < 100; i++) {
    const z = -50 + i;
    temp.position.set(riverX(z), .035, z); temp.scale.set(4.4, .04, 1.04); temp.updateMatrix();
    water.setMatrixAt(i, temp.matrix);
    for (const side of [-1, 1]) {
      const bx = riverX(z) + side * (2.35 + random() * .18);
      cube(bx, .03, z, .6 + random() * .45, .11 + random() * .13, .85, pick([0x9ca88b, 0x899b7a, 0xb1b297]));
    }
  }
  water.receiveShadow = true;
  group.add(water);
  const rippleMaterial = new THREE.MeshBasicMaterial({ color: 0xb6e4d2, transparent: true, opacity: .45 });
  const ripples = new THREE.InstancedMesh(waterGeometry, rippleMaterial, 64);
  const rippleData = Array.from({ length: 64 }, () => ({ x: (random() - .5) * 3.5, z: random() * 90 - 45, w: .35 + random() * .8 }));
  group.add(ripples);

  const bx = riverX(4);
  for (let i = 0; i < 18; i++) cube(bx - 4.1 + i * .48, .14, 4, .43, .22, 3.6, pick([0x9c744c, 0xad8156, 0x936d48]));
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) cube(bx - 3.8 + i * 1.9, .72, 4 + side * 1.64, .21, 1.48, .21, 0x70563c);
    cube(bx, 1.28, 4 + side * 1.64, 8.3, .18, .18, 0x846243);
    cube(bx, .72, 4 + side * 1.64, 8.3, .12, .12, 0x846243);
  }

  function cottage(house: typeof houses[number]) {
    const { x, z, w, d, h, angle, roof } = house;
    const local = (lx: number, y: number, lz: number, sx: number, sy: number, sz: number, color: number) =>
      cube(x + lx * Math.cos(angle) + lz * Math.sin(angle), y, z - lx * Math.sin(angle) + lz * Math.cos(angle), sx, sy, sz, color, angle);
    colliders.push({ x, z, r: Math.max(w, d) * .57 });
    local(0, .2, 0, w + .28, .4, d + .28, 0x9a9b84);
    local(0, h / 2 + .3, 0, w, h, d, 0xe2d1a8);
    const oak = 0x65513d;
    for (const xx of [-w / 2 + .1, 0, w / 2 - .1]) {
      for (const zz of [-d / 2, d / 2]) local(xx, h / 2 + .3, zz, .2, h, .17, oak);
    }
    for (const yy of [.57, h + .22]) local(0, yy, 0, w + .13, .18, d + .16, oak);
    local(0, 1.25, d / 2 + .08, 1.05, 2.04, .15, 0x725638);
    local(.31, 1.22, d / 2 + .18, .09, .1, .08, 0xdbb661);
    local(0, .17, d / 2 + .52, 1.6, .25, .8, 0xb7ae93);
    for (const xx of [-w * .29, w * .29]) {
      local(xx, 2.05, d / 2 + .1, 1.1, 1.2, .14, oak);
      local(xx, 2.05, d / 2 + .19, .88, .97, .10, 0x98bdac);
      local(xx, 2.05, d / 2 + .26, .08, 1.04, .08, 0xf2dfb7);
      local(xx, 2.05, d / 2 + .27, .94, .08, .08, 0xf2dfb7);
      for (const side of [-1, 1]) local(xx + side * .7, 2.06, d / 2 + .15, .26, 1.18, .16, 0x78957b);
      local(xx, 1.34, d / 2 + .31, 1.35, .27, .38, 0x77563d);
      for (let i = 0; i < 6; i++) {
        local(xx - .52 + i * .21, 1.59 + random() * .14, d / 2 + .34, .25, .2, .29, 0x74984d);
        local(xx - .52 + i * .21, 1.78 + random() * .13, d / 2 + .34, .15, .14, .15, pick([0xe2ba73, 0xd88483, 0xebd1ac]));
      }
    }
    // Seven square courses form the unmistakable terracotta voxel roof.
    const levels = 8;
    for (let i = 0; i < levels; i++) {
      const rw = w + .9 - i * (w + .5) / levels;
      local(0, h + .48 + i * .28, 0, rw, .31, d + .92, i % 2 ? roof : new THREE.Color(roof).multiplyScalar(1.1).getHex());
      if (i < levels - 1) {
        local(rw / 2 - .04, h + .57 + i * .28, 0, .09, .15, d + .99, 0xdf9462);
        local(-rw / 2 + .04, h + .57 + i * .28, 0, .09, .15, d + .99, 0xdf9462);
      }
    }
    local(0, h + .48 + levels * .28, 0, .55, .22, d + 1.05, roof);
    local(w * .27, h + 1.98, -d * .25, .73, 2, .75, 0xaaa58d);
    local(w * .27, h + 3.01, -d * .25, .91, .21, .91, 0x7d806f);
    // A side extension makes the buildings feel inhabited, not repeated boxes.
    local(-w / 2 - .7, .65, -.7, 1.3, 1.15, 1.5, 0xb99962);
    for (let i = 0; i < 4; i++) local(-w / 2 - .7, 1.3 + i * .04, -.7 + i * .28, 1.42, .08, .18, 0xc8aa71);
  }
  houses.forEach(cottage);

  const treePositions: { x: number; z: number; scale: number; pine: boolean }[] = [];
  const isClear = (x: number, z: number) => {
    if (onPath(x, z, 1.2) || Math.abs(x - riverX(z)) < 3.2) return false;
    if (Math.hypot(x, z) < 7.1 || Math.hypot(x + 7, z + 16) < 5) return false;
    if (houses.some(h => Math.hypot(h.x - x, h.z - z) < Math.max(h.w, h.d) * .64 + 2.2)) return false;
    if ([[-9, -4], [-13, 3], [11, -12], [10, 1], [15, -5], [8, -10], [18, 7], ...ZONES[0].nodes.map(n => [n.x, n.z])].some(([px, pz]) => Math.hypot(px - x, pz - z) < 3.2)) return false;
    return !treePositions.some(t => Math.hypot(t.x - x, t.z - z) < 3.5);
  };
  for (let i = 0; i < 440; i++) {
    const x = (random() - .5) * 87, z = (random() - .5) * 86;
    // Leave a broad sightline behind spawn for the low third-person camera.
    if (x > -7 && x < 20 && z > 6 && z < 30) continue;
    if (isClear(x, z)) treePositions.push({ x, z, scale: .78 + random() * .58, pine: random() > .77 });
    if (treePositions.length >= 100) break;
  }
  function tree(x: number, z: number, s: number, pine = false) {
    const wood = pick(bark), leaf = pick(leaves);
    cube(x, 1.4 * s, z, .58 * s, 2.8 * s, .58 * s, wood);
    cube(x, .14, z, .98 * s, .28, .98 * s, 0x729051);
    if (pine) {
      for (let i = 0; i < 5; i++) {
        const width = (3.9 - i * .64) * s;
        cube(x, (2.3 + i * .74) * s, z, width, .83 * s, width, i % 2 ? 0x267450 : 0x368a55);
      }
    } else {
      cube(x + .49 * s, 2.23 * s, z, 1.35 * s, .35 * s, .35 * s, wood);
      cube(x - .42 * s, 2.72 * s, z + .35 * s, .36 * s, 1.3 * s, .36 * s, wood);
      cube(x, 3.6 * s, z, 3.55 * s, 1.45 * s, 3.55 * s, leaf);
      cube(x - .31 * s, 4.6 * s, z + .13 * s, 2.83 * s, 1.04 * s, 2.8 * s, 0x60a64e);
      cube(x + .45 * s, 5.23 * s, z, 1.6 * s, .48 * s, 1.92 * s, 0x7bb853);
      cube(x + 1.68 * s, 3.5 * s, z - .28 * s, 1.1 * s, .89 * s, 1.63 * s, 0x3d8c46);
      cube(x - 1.68 * s, 3.37 * s, z + .12 * s, 1.06 * s, 1.09 * s, 1.94 * s, 0x34814a);
      cube(x - .28 * s, 3.36 * s, z + 1.65 * s, 1.9 * s, .98 * s, .9 * s, 0x4d9a48);
      cube(x + .29 * s, 3.83 * s, z - 1.59 * s, 2.15 * s, .85 * s, .89 * s, 0x69ae4f);
    }
    colliders.push({ x, z, r: .68 * s });
  }
  treePositions.forEach(t => tree(t.x, t.z, t.scale, t.pine));

  // Low garden borders, tiny meadow flowers, reeds, pebbles and mushrooms.
  for (let i = 0; i < 1850; i++) {
    const x = (random() - .5) * 82, z = (random() - .5) * 82;
    if (onPath(x, z, .3) || Math.abs(x - riverX(z)) < 2.6 || houses.some(h => Math.hypot(h.x - x, h.z - z) < Math.max(h.w, h.d) * .61)) continue;
    if (random() < .7) {
      const h = .14 + random() * .23;
      cube(x, h / 2, z, .06, h, .055, pick([0x95af62, 0xa5b872, 0x6e894a]));
      cube(x + .1, h * .4, z + .08, .055, h * .8, .06, 0x92a95e);
      if (random() > .55) cube(x, h + .04, z, .14, .10, .14, pick([0xf4d59b, 0xefe4bf, 0xd4a0aa, 0xa79fc3, 0xe3bc67]));
    } else if (random() > .45) {
      cube(x, .09, z, .23 + random() * .28, .13 + random() * .12, .21 + random() * .3, pick([0xa0a48d, 0xb2b29b, 0x909881]), random());
    } else {
      cube(x, .14, z, .08, .26, .08, 0xe5d9b7);
      cube(x, .27, z, .29, .13, .28, pick([0xc87853, 0xbe7a58, 0xd3af75]));
      cube(x - .04, .345, z + .04, .07, .025, .065, 0xead7ab);
    }
  }
  for (let i = 0; i < 80; i++) {
    const z = random() * 78 - 39, x = riverX(z) + (random() > .5 ? 1 : -1) * (2.5 + random() * .55);
    if (Math.abs(z - 4) < 2.1) continue;
    const h = .45 + random() * .6;
    cube(x, h / 2, z, .07, h, .08, 0x8c9b57);
    if (random() > .35) cube(x, h, z, .12, .25, .13, 0x926f48);
  }

  function fence(x: number, z: number, length: number, alongZ = false) {
    const count = Math.floor(length / 1.6);
    for (let i = 0; i <= count; i++) cube(x + (alongZ ? 0 : i * 1.6), .54, z + (alongZ ? i * 1.6 : 0), .17, 1.09, .17, 0xa79061);
    for (const y of [.42, .86]) cube(x + (alongZ ? 0 : length / 2), y, z + (alongZ ? length / 2 : 0), alongZ ? .11 : length, .14, alongZ ? length : .11, 0xb09a6d);
  }
  fence(-13.3, -4, 5); fence(-14, -12.5, 7, true); fence(4, -13.7, 8); fence(-32, -3.5, 7);
  fence(20, -11.8, 5); fence(-12, 12.4, 3.5); fence(-10.5, 19.5, 7);

  // Market canopy and stacked produce bring life to the village square.
  const mx = 6.3, mz = -4.6;
  for (const dx of [-1.8, 1.8]) for (const dz of [-.85, .85]) cube(mx + dx, 1.34, mz + dz, .16, 2.7, .16, 0x7c6344);
  for (let i = 0; i < 8; i++) cube(mx - 1.77 + i * .5, 2.76, mz, .5, .18, 2.2, i % 2 ? 0xe4d1a1 : 0xaa7056);
  cube(mx, 1.01, mz + .4, 3.8, .16, 1.1, 0xa38457);
  for (let i = 0; i < 3; i++) {
    cube(mx - 1.18 + i * 1.15, 1.14, mz + .4, .95, .26, .86, 0x826643);
    for (let j = 0; j < 6; j++) cube(mx - 1.43 + i * 1.15 + (j % 3) * .25, 1.35, mz + .25 + Math.floor(j / 3) * .28, .23, .25, .23, [0xb95d48, 0xc9a94f, 0x84a15a][i]);
  }
  colliders.push({ x: mx, z: mz, r: 1.9 });
  // The signposts are deliberately geometry-only; interactive labels are DOM UI.
  for (const [x, z] of [[2.8, 5.6], [-15, 6.4], [3, -9]]) {
    cube(x, 1, z, .16, 2, .16, 0x746047);
    cube(x + .2, 1.72, z, 1.38, .34, .12, 0xb29461);
    cube(x - .16, 1.32, z, 1.23, .3, .12, 0xa98956);
  }

  // Glass and the bounded environmental light pool share these exact lamp positions.
  const lanternMaterial = new THREE.MeshStandardMaterial({ color: 0xffd999, emissive: 0xffb85c, emissiveIntensity: .72, roughness: .65 });
  for (const [x, z] of [[-3.1, 3], [3.3, -2], [-15.2, 2], [3.7, -11.5]]) {
    cube(x, 1.22, z, .13, 2.43, .13, 0x5e5540);
    cube(x + .24, 2.43, z, .58, .13, .13, 0x5e5540);
    cube(x + .45, 2.01, z, .42, .12, .42, 0x5e5540);
    cube(x + .45, 2.47, z, .52, .12, .52, 0x5e5540);
    const lamp = new THREE.Mesh(waterGeometry, lanternMaterial);
    lamp.scale.set(.29, .33, .29); lamp.position.set(x + .45, 2.23, z);
    group.add(lamp);
    emitters.push({ position: lamp.position.clone(), size: lamp.scale.clone(), color: 0xffc77e, scale: .7, source: lamp });
  }

  // Distant hills use small stepped columns; low foothills leave gaps in the skyline.
  const mountains = [
    [-63, -76, 34, 14], [-31, -88, 38, 17], [3, -101, 42, 21], [35, -88, 36, 15], [66, -77, 34, 18],
    [-83, -42, 36, 15], [-80, -7, 34, 10], [-84, 30, 36, 17], [-66, 70, 35, 13],
    [84, -42, 36, 14], [81, -7, 34, 10], [85, 30, 37, 16], [66, 74, 35, 14],
    [-32, 88, 36, 14], [2, 101, 40, 19], [36, 88, 37, 15],
  ];
  cube(0, -1.6, 0, 230, 2, 230, 0x719d61);
  function hill(x: number, z: number, width: number, peak: number) {
    const cell = 2.5, radius = width / 2;
    for (let dx = -radius; dx <= radius; dx += cell) {
      for (let dz = -radius; dz <= radius; dz += cell) {
        const r = Math.hypot(dx / radius, dz / (radius * .88));
        const shape = 1 - r + Math.sin(dx * .46 + z) * Math.cos(dz * .39 + x) * .075;
        if (shape <= .035) continue;
        const h = Math.max(1.6, Math.floor(Math.min(1, shape) * peak / 1.75) * 1.75);
        cube(x + dx, h / 2 - .45, z + dz, cell + .015, h, cell + .015, pick([0x879988, 0x8b9e8d, 0x91a490]));
        cube(x + dx, h - .5, z + dz, cell + .04, .62, cell + .04, pick([0x60a552, 0x6cac58, 0x72ae5c]));
        if (h > peak * .55 && random() > .965) {
          cube(x + dx, h + .55, z + dz, 1.7, 1.45, 1.7, 0x42874d);
          cube(x + dx + .2, h + 1.55, z + dz, 1.1, .65, 1.15, 0x5b9d50);
        }
      }
    }
  }
  mountains.forEach(([x, z, width, peak]) => {
    hill(x, z, width, peak);
    hill(x * .77 + 2.5, z * .77, width * .68, 4 + peak * .16);
  });
  // Crisp pale cloud slabs keep their silhouette through the atmospheric fog.
  const cloudMaterial = new THREE.MeshLambertMaterial({ color: 0xf4f5e9, emissive: 0x788987, emissiveIntensity: .3, fog: false });
  const cloudShapes = [[-62, 23, -112, 24], [-17, 24, -129, 27], [37, 21, -120, 24], [79, 24, -95, 22]];
  const cloudMesh = new THREE.InstancedMesh(waterGeometry, cloudMaterial, cloudShapes.length * 4);
  cloudMesh.name = 'Distant voxel clouds';
  cloudShapes.forEach(([x, y, z, width], i) => {
    [[0, 0, 0, width, 1.4, 7], [-width * .22, 1.4, 0, width * .42, 1.4, 6], [width * .21, .9, -.6, width * .35, 1.1, 5], [0, -.35, 3.5, width * .65, .75, 4]].forEach(([dx, dy, dz, w, h, d], j) => {
      temp.position.set(x + dx, y + dy, z + dz); temp.scale.set(w, h, d); temp.rotation.set(0, 0, 0); temp.updateMatrix();
      cloudMesh.setMatrixAt(i * 4 + j, temp.matrix);
    });
  });
  cloudMesh.computeBoundingSphere();
  group.add(cloudMesh);

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ roughness: .94, metalness: 0 });
  const worldMesh = new THREE.InstancedMesh(geometry, material, blocks.length);
  worldMesh.name = 'Village voxel geometry';
  worldMesh.castShadow = true;
  worldMesh.receiveShadow = true;
  const color = new THREE.Color();
  blocks.forEach((b, i) => {
    temp.position.set(b.x, b.y, b.z); temp.scale.set(b.w, b.h, b.d); temp.rotation.set(0, b.rotation, 0); temp.updateMatrix();
    worldMesh.setMatrixAt(i, temp.matrix); worldMesh.setColorAt(i, color.setHex(b.color));
  });
  worldMesh.computeBoundingSphere();
  group.add(worldMesh);

  const environment = createEnvironmentLights(group, emitters);
  let disposed = false;
  return {
    colliders,
    dispose() { if (!disposed) { disposed = true; environment.dispose(); disposeWorldGroup(group); } },
    update(time: number, observer?: THREE.Vector3, camera?: THREE.Camera) {
      if (disposed) return;
      environment.update(time, observer, camera);
      rippleData.forEach((r, i) => {
        const z = ((r.z + time * .55 + 45) % 90) - 45;
        temp.position.set(riverX(z) + r.x, .062, z); temp.rotation.set(0, 0, 0); temp.scale.set(r.w, .008, .055); temp.updateMatrix();
        ripples.setMatrixAt(i, temp.matrix);
      });
      ripples.instanceMatrix.needsUpdate = true;
    },
  };
}
