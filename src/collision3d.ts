import RAPIER from '@dimforge/rapier3d-compat';
import { groundHeight, waterAt, WATER_LEVEL } from './landscape.ts';

export interface Point3 { x: number; y: number; z: number }
export interface CollisionSceneData {
  shapes: { vertexOffset: number; vertexCount: number; indexOffset: number; indexCount: number }[];
  instances: { shape: number; matrix: number[]; tag?: string; state?: { key: string; value: boolean } }[];
}
type Bounds = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
type Shape = { vertices: Float32Array; indices: Uint32Array; bounds: Bounds; closed: boolean };
type Instance = CollisionSceneData['instances'][number] & { bounds: Bounds };
type Mesh = { bounds: Bounds; closed: boolean; triangles: number; tag?: string };
type Chunk = { world: RAPIER.World; meshes: Map<number, Mesh>; states: Set<string>; triangles: number };
type Geometry = { shapes: Shape[]; instances: Instance[]; cells: Map<string, number[]>; overworld: boolean; minY: number };
type Scene = { geometry: Geometry; flags: Record<string, boolean>; chunks: Map<string, Chunk> };
const scenes = new Map<string, Scene>();
const cachedChunks = new Map<Chunk, { scene: Scene; id: string }>();
let cachedTriangles = 0;
let ready: Promise<void> | undefined;
const CELL = 16, PADDING = 4, MAX_CHUNKS = 256, MAX_CACHED_TRIANGLES = 1_000_000;
export const ACTOR_RADIUS = .4;
export const ACTOR_HEIGHT = 2.5;
const SKIN = .015, rotation = { x: 0, y: 0, z: 0, w: 1 };
const capsule = () => new RAPIER.Capsule(ACTOR_HEIGHT / 2 - ACTOR_RADIUS, ACTOR_RADIUS - SKIN);
const center = (point: Point3) => ({ x: point.x, y: point.y + ACTOR_HEIGHT / 2, z: point.z });
const finite = (p: Point3) => [p.x, p.y, p.z].every(Number.isFinite);
const transformed = (m: readonly number[], x: number, y: number, z: number): Point3 => ({ x: m[0] * x + m[4] * y + m[8] * z + m[12], y: m[1] * x + m[5] * y + m[9] * z + m[13], z: m[2] * x + m[6] * y + m[10] * z + m[14] });
const emptyBounds = (): Bounds => ({ minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity });
function include(bounds: Bounds, p: Point3) {
  bounds.minX = Math.min(bounds.minX, p.x); bounds.maxX = Math.max(bounds.maxX, p.x);
  bounds.minY = Math.min(bounds.minY, p.y); bounds.maxY = Math.max(bounds.maxY, p.y);
  bounds.minZ = Math.min(bounds.minZ, p.z); bounds.maxZ = Math.max(bounds.maxZ, p.z);
}
// Flat-shaded GLBs repeat vertices at material/normal seams. Weld positions for
// topology only. Merged props can contain independently mirrored closed solids;
// orient each shell outward so backface queries do not mistake air for its inside.
function meshTopology(vertices: Float32Array, source: Uint32Array): { indices: Uint32Array; closed: boolean } {
  const points = new Map<string, number>(), welded: number[] = [], edges = new Map<string, { count: number; triangle: number }>();
  const parents = Array.from({ length: source.length / 3 }, (_, i) => i);
  const root = (i: number): number => { while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; } return i; };
  for (let i = 0; i < vertices.length; i += 3) {
    const key = `${vertices[i]},${vertices[i + 1]},${vertices[i + 2]}`;
    if (!points.has(key)) points.set(key, points.size);
    welded.push(points.get(key)!);
  }
  for (let i = 0; i < source.length; i += 3) {
    const triangle = [welded[source[i]], welded[source[i + 1]], welded[source[i + 2]]];
    if (new Set(triangle).size !== 3) continue;
    for (let e = 0; e < 3; e++) {
      const a = triangle[e], b = triangle[(e + 1) % 3], key = a < b ? `${a},${b}` : `${b},${a}`;
      const edge = edges.get(key);
      if (edge) { edge.count++; parents[root(i / 3)] = root(edge.triangle); }
      else edges.set(key, { count: 1, triangle: i / 3 });
    }
  }
  const open = new Set<number>();
  for (const edge of edges.values()) if (edge.count !== 2) open.add(root(edge.triangle));
  const shells = new Map<number, { origin: number; volume: number; bounds: Bounds; triangles: number[] }>();
  for (let i = 0; i < source.length; i += 3) {
    const id = root(i / 3); if (open.has(id)) continue;
    const a = source[i] * 3, b = source[i + 1] * 3, c = source[i + 2] * 3;
    const shell = shells.get(id) || { origin: a, volume: 0, bounds: emptyBounds(), triangles: [] }, o = shell.origin;
    shell.triangles.push(i);
    for (const index of [a, b, c]) include(shell.bounds, { x: vertices[index], y: vertices[index + 1], z: vertices[index + 2] });
    const ax = vertices[a] - vertices[o], ay = vertices[a + 1] - vertices[o + 1], az = vertices[a + 2] - vertices[o + 2];
    const bx = vertices[b] - vertices[o], by = vertices[b + 1] - vertices[o + 1], bz = vertices[b + 2] - vertices[o + 2];
    const cx = vertices[c] - vertices[o], cy = vertices[c + 1] - vertices[o + 1], cz = vertices[c + 2] - vertices[o + 2];
    shell.volume += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
    shells.set(id, shell);
  }
  let indices = source;
  for (const shell of shells.values()) if (shell.volume < -1e-9) {
    // An inward shell enclosed by an outward shell is an intentional cavity.
    // Bounds reject ordinary separate props cheaply; solid angles test only
    // potential enclosing shells without relying on their current winding.
    let depth = 0;
    for (const other of shells.values()) {
      const a = shell.bounds, b = other.bounds;
      if (other === shell || b.minX >= a.minX || b.maxX <= a.maxX || b.minY >= a.minY || b.maxY <= a.maxY || b.minZ >= a.minZ || b.maxZ <= a.maxZ) continue;
      let angle = 0;
      for (const i of other.triangles) {
        const offsets = [source[i] * 3, source[i + 1] * 3, source[i + 2] * 3];
        const [u, v, w] = offsets.map(index => [vertices[index] - vertices[shell.origin], vertices[index + 1] - vertices[shell.origin + 1], vertices[index + 2] - vertices[shell.origin + 2]]);
        const lu = Math.hypot(...u), lv = Math.hypot(...v), lw = Math.hypot(...w);
        const dot = (p: number[], q: number[]) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
        const det = u[0] * (v[1] * w[2] - v[2] * w[1]) + u[1] * (v[2] * w[0] - v[0] * w[2]) + u[2] * (v[0] * w[1] - v[1] * w[0]);
        angle += 2 * Math.atan2(det, lu * lv * lw + dot(u, v) * lw + dot(v, w) * lu + dot(w, u) * lv);
      }
      if (Math.abs(angle) > 2 * Math.PI) depth++;
    }
    if (depth % 2) continue;
    if (indices === source) indices = source.slice();
    for (const i of shell.triangles) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  }
  return { indices, closed: edges.size > 0 && open.size === 0 };
}
function freeChunk(chunk: Chunk) {
  const cached = cachedChunks.get(chunk); if (!cached) return;
  cached.scene.chunks.delete(cached.id); cachedChunks.delete(chunk); cachedTriangles -= chunk.triangles; chunk.world.free();
}
function clearChunks(scene: Scene) { for (const chunk of scene.chunks.values()) freeChunk(chunk); }
export function hasCollisionScene(key?: string): boolean { return !!key && scenes.has(key); }
export function disposeCollisionScene(key: string) { const scene = scenes.get(key); if (scene) clearChunks(scene); scenes.delete(key); }
export function cloneCollisionScene(baseKey: string, key: string) {
  const source = scenes.get(baseKey); if (!source) throw Error(`Collision scene is not loaded: ${baseKey}`);
  disposeCollisionScene(key); scenes.set(key, { geometry: source.geometry, flags: {}, chunks: new Map() });
}
export function updateCollisionSceneState(key: string, flags: Record<string, boolean>) {
  const scene = scenes.get(key); if (!scene) throw Error(`Collision scene is not loaded: ${key}`);
  if (Object.keys(flags).length === Object.keys(scene.flags).length && Object.entries(flags).every(([name, value]) => scene.flags[name] === value)) return;
  const changed = new Set([...Object.keys(flags), ...Object.keys(scene.flags)].filter(name => !!flags[name] !== !!scene.flags[name]));
  scene.flags = { ...flags };
  for (const chunk of scene.chunks.values()) if ([...changed].some(name => chunk.states.has(name))) freeChunk(chunk);
}
export async function installCollisionScene(key: string, data: CollisionSceneData, buffer: ArrayBuffer) {
  await (ready ??= RAPIER.init());
  const shapes = data.shapes.map(shape => {
    const { vertexOffset, vertexCount, indexOffset, indexCount } = shape;
    if (![vertexOffset, vertexCount, indexOffset, indexCount].every(n => Number.isSafeInteger(n) && n >= 0)
      || vertexOffset % 4 || indexOffset % 4 || vertexCount < 3 || indexCount % 3 || vertexOffset + vertexCount * 12 > buffer.byteLength || indexOffset + indexCount * 4 > buffer.byteLength) throw Error('Invalid collision shape');
    const vertices = new Float32Array(buffer, vertexOffset, vertexCount * 3), indices = new Uint32Array(buffer, indexOffset, indexCount), bounds = emptyBounds();
    for (let i = 0; i < vertices.length; i += 3) { const p = { x: vertices[i], y: vertices[i + 1], z: vertices[i + 2] }; if (!finite(p)) throw Error('Invalid collision vertex'); include(bounds, p); }
    if (indices.some(index => index >= vertexCount)) throw Error('Invalid collision triangle');
    return { vertices, bounds, ...meshTopology(vertices, indices) };
  });
  const instances = data.instances.map(instance => {
    const shape = shapes[instance.shape];
    if (!shape || instance.matrix.length !== 16 || !instance.matrix.every(Number.isFinite)) throw Error('Invalid collision instance');
    const bounds = emptyBounds(), b = shape.bounds;
    for (const x of [b.minX, b.maxX]) for (const y of [b.minY, b.maxY]) for (const z of [b.minZ, b.maxZ]) include(bounds, transformed(instance.matrix, x, y, z));
    return { ...instance, bounds };
  });
  const cells = new Map<string, number[]>();
  instances.forEach(({ bounds: b }, index) => {
    for (let x = Math.floor(b.minX / CELL); x <= Math.floor(b.maxX / CELL); x++) for (let z = Math.floor(b.minZ / CELL); z <= Math.floor(b.maxZ / CELL); z++) {
      const cell = `${x},${z}`, ids = cells.get(cell) || []; ids.push(index); cells.set(cell, ids);
    }
  });
  disposeCollisionScene(key);
  scenes.set(key, { geometry: { shapes, instances, cells, overworld: key === 'overworld', minY: instances.reduce((y, instance) => Math.min(y, instance.bounds.minY), -100) }, flags: {}, chunks: new Map() });
}
function chunkAt(key: string, from: { x: number; z: number }, to = from): Chunk {
  const scene = scenes.get(key); if (!scene) throw Error(`Collision scene is not loaded: ${key}`);
  const x0 = Math.floor(Math.min(from.x, to.x) / CELL), x1 = Math.floor(Math.max(from.x, to.x) / CELL);
  const z0 = Math.floor(Math.min(from.z, to.z) / CELL), z1 = Math.floor(Math.max(from.z, to.z) / CELL), id = `${x0},${z0}:${x1},${z1}`;
  const existing = scene.chunks.get(id);
  if (existing) { const cached = cachedChunks.get(existing)!; cachedChunks.delete(existing); cachedChunks.set(existing, cached); return existing; }
  const minX = x0 * CELL - PADDING, maxX = (x1 + 1) * CELL + PADDING, minZ = z0 * CELL - PADDING, maxZ = (z1 + 1) * CELL + PADDING;
  const ids = new Set<number>(), geometry = scene.geometry;
  for (let x = Math.floor(minX / CELL); x <= Math.floor(maxX / CELL); x++) for (let z = Math.floor(minZ / CELL); z <= Math.floor(maxZ / CELL); z++)
    for (const i of geometry.cells.get(`${x},${z}`) || []) ids.add(i);
  const prepared: { vertices: Float32Array; indices: Uint32Array; mesh: Mesh }[] = [], states = new Set<string>();
  let triangles = 0;
  for (const index of ids) {
    const instance = geometry.instances[index], b = instance.bounds;
    if (b.maxX < minX || b.minX > maxX || b.maxZ < minZ || b.minZ > maxZ) continue;
    if (instance.state) { states.add(instance.state.key); if (!!scene.flags[instance.state.key] !== instance.state.value) continue; }
    const shape = geometry.shapes[instance.shape], vertices = new Float32Array(shape.vertices.length), indices: number[] = [];
    for (let i = 0; i < vertices.length; i += 3) {
      const p = transformed(instance.matrix, shape.vertices[i], shape.vertices[i + 1], shape.vertices[i + 2]);
      vertices[i] = p.x; vertices[i + 1] = p.y; vertices[i + 2] = p.z;
    }
    for (let i = 0; i < shape.indices.length; i += 3) {
      const a = shape.indices[i] * 3, c = shape.indices[i + 1] * 3, d = shape.indices[i + 2] * 3;
      if (Math.max(vertices[a], vertices[c], vertices[d]) < minX || Math.min(vertices[a], vertices[c], vertices[d]) > maxX
        || Math.max(vertices[a + 2], vertices[c + 2], vertices[d + 2]) < minZ || Math.min(vertices[a + 2], vertices[c + 2], vertices[d + 2]) > maxZ) continue;
      indices.push(a / 3, c / 3, d / 3);
    }
    if (!indices.length) continue;
    const used = new Map<number, number>(), compact: number[] = [];
    const remapped = indices.map(index => {
      if (!used.has(index)) { used.set(index, used.size); compact.push(vertices[index * 3], vertices[index * 3 + 1], vertices[index * 3 + 2]); }
      return used.get(index)!;
    });
    const m = instance.matrix, determinant = m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
    if (determinant < 0) for (let i = 0; i < remapped.length; i += 3) [remapped[i + 1], remapped[i + 2]] = [remapped[i + 2], remapped[i + 1]];
    triangles += remapped.length / 3;
    // Resource models may name their submeshes generically; their depletion
    // state identifies the particular node shared by all of those submeshes.
    const tag = instance.state?.key.startsWith('depleted:') ? `resource:${instance.state.key.slice(9)}` : instance.tag;
    prepared.push({ vertices: new Float32Array(compact), indices: new Uint32Array(remapped), mesh: { bounds: b, closed: shape.closed, triangles: remapped.length / 3, tag } });
  }
  // All instances share one budget. Free WASM capacity before building its
  // replacement: allocating first permanently raises the allocator's high-water mark.
  // ponytail: a single oversized query retains its full geometry; split such
  // queries if normal gameplay ever exceeds the whole cache budget.
  while (cachedChunks.size && (cachedChunks.size >= MAX_CHUNKS || cachedTriangles + triangles > MAX_CACHED_TRIANGLES)) freeChunk(cachedChunks.keys().next().value!);
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 }), meshes = new Map<number, Mesh>();
  try {
    for (const shape of prepared) {
      const collider = world.createCollider(RAPIER.ColliderDesc.trimesh(shape.vertices, shape.indices));
      meshes.set(collider.handle, shape.mesh);
    }
    world.updateSceneQueries();
  } catch (error) { world.free(); throw error; }
  const chunk = { world, meshes, states, triangles }; scene.chunks.set(id, chunk);
  cachedChunks.set(chunk, { scene, id }); cachedTriangles += triangles;
  return chunk;
}
export function actorBaseFloor(key: string, x: number, z: number): number {
  return scenes.get(key)?.geometry.overworld ? waterAt(x, z) ? WATER_LEVEL - .47 : groundHeight(x, z) : -Infinity;
}
export function actorFloor(key: string, x: number, z: number, feetCeiling: number): number {
  if (![x, z, feetCeiling].every(Number.isFinite)) return -Infinity;
  const base = actorBaseFloor(key, x, z), { world, meshes } = chunkAt(key, { x, z });
  const depth = Math.max(1, feetCeiling + SKIN - scenes.get(key)!.geometry.minY);
  let floor = base <= feetCeiling + .001 ? base : -Infinity;
  const ray = new RAPIER.Ray({ x, y: feetCeiling + SKIN, z }, { x: 0, y: -1, z: 0 });
  world.intersectionsWithRay(ray, depth, false, hit => {
    const y = feetCeiling + SKIN - hit.toi;
    // Rapier points ray normals toward the ray, including on backfaces. Its
    // second set of triangle feature IDs identifies those backfaces.
    if (hit.featureId! < meshes.get(hit.collider.handle)!.triangles && hit.normal.y > .5 && y <= feetCeiling + .002 && y > floor) floor = y;
    return true;
  });
  // A capsule rests above a sloped roof's center ray. Query its actual support
  // so walking down a pitched roof does not lower the body through the slope.
  const support = world.castShape(center({ x, y: feetCeiling + SKIN, z }), rotation, { x: 0, y: -1, z: 0 }, capsule(), depth, false);
  if (support && support.normal1.y > .5) {
    const y = feetCeiling + 2 * SKIN - support.toi;
    if (y <= feetCeiling + .002 && y > floor + .001) floor = y;
  }
  return floor;
}
function insideSolid(chunk: Chunk, point: Point3): boolean {
  for (const [handle, mesh] of chunk.meshes) {
    const b = mesh.bounds;
    if (!mesh.closed || point.x <= b.minX || point.x >= b.maxX || point.y <= b.minY || point.y >= b.maxY || point.z <= b.minZ || point.z >= b.maxZ) continue;
    const hit = chunk.world.getCollider(handle).castRayAndGetNormal(new RAPIER.Ray(point, { x: 0, y: -1, z: 0 }), point.y - b.minY + 1, false);
    if (hit && hit.featureId! >= mesh.triangles) return true;
  }
  return false;
}
export function actorCanStand(key: string, x: number, y: number, z: number): boolean {
  if (![x, y, z].every(Number.isFinite)) return false;
  const chunk = chunkAt(key, { x, z }), point = center({ x, y, z });
  return chunk.world.intersectionWithShape(point, rotation, capsule()) === null && !insideSolid(chunk, point);
}
export function actorSweep(key: string, from: Point3, to: Point3): number {
  if (!finite(from) || !finite(to)) return 0;
  const delta = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  if (Math.hypot(delta.x, delta.y, delta.z) < 1e-9) return actorCanStand(key, from.x, from.y, from.z) ? 1 : 0;
  // A moving chest lid can overlap a previously valid pose. Rapier's exit mode
  // permits motion out of that initial contact while still blocking deeper entry
  // and every later obstacle along the sweep.
  const hit = chunkAt(key, from, to).world.castShape(center(from), rotation, delta, capsule(), 1, false);
  return hit ? Math.max(0, Math.min(1, hit.toi - .001 / Math.hypot(delta.x, delta.y, delta.z))) : 1;
}
export function actorCanMove(key: string, from: Point3, to: Point3): boolean { return actorSweep(key, from, to) >= 1 - 1e-6; }
export function actorLineOfSight(key: string, from: Point3, to: Point3, ignoredTag?: string): boolean {
  if (!finite(from) || !finite(to)) return false;
  const direction = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  if (Math.hypot(direction.x, direction.y, direction.z) < .001) return true;
  const { world, meshes } = chunkAt(key, from, to);
  return !world.castRay(new RAPIER.Ray(from, direction), .999, true, undefined, undefined, undefined, undefined,
    ignoredTag ? collider => meshes.get(collider.handle)?.tag !== ignoredTag : undefined);
}
export function actorWall(key: string, position: Point3, direction: { x: number; z: number }, reach: number) {
  const length = Math.hypot(direction.x, direction.z); if (!length || !finite(position)) return null;
  const dir = { x: direction.x / length, y: 0, z: direction.z / length }, { world, meshes } = chunkAt(key, position, { x: position.x + dir.x * reach, z: position.z + dir.z * reach });
  // A single low ray drops the grip in mortar seams or just below a cap.
  // Stop at the first usable contact; ordinary continuous walls still cost one ray.
  for (const side of [0, -.15, .15]) for (const height of [.25, 1, 1.8, .05]) {
    const origin = { x: position.x - dir.z * side, y: position.y + height, z: position.z + dir.x * side };
    const hit = world.castRayAndGetNormal(new RAPIER.Ray(origin, dir), ACTOR_RADIUS + reach, false);
    if (!hit || hit.featureId! >= meshes.get(hit.collider.handle)!.triangles || Math.abs(hit.normal.y) > .5 || hit.normal.x * dir.x + hit.normal.z * dir.z >= -.1) continue;
    return { x: origin.x + dir.x * hit.toi, z: origin.z + dir.z * hit.toi, normalX: hit.normal.x, normalZ: hit.normal.z, topY: meshes.get(hit.collider.handle)!.bounds.maxY };
  }
  return null;
}
