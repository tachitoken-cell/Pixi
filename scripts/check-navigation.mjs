import assert from 'node:assert/strict';
import { findPath } from '../src/navigation.ts';
import { DUNGEON_START, DUNGEON_EXIT, DUNGEON_OBJECTS, DUNGEON_STAGES, dungeonLayout } from '../src/dungeon.ts';
import { REGION_ORIGINS, WORLD_COLLIDERS, WORLD_BOUNDS, DUNGEON_COLLIDERS, DUNGEON_BOUNDS, canTraverse } from '../src/realm.ts';

function assertRoute(start, end, colliders, bounds) {
  const route = findPath(start, end, colliders, bounds);
  assert(route.length, `A walkable route exists from ${JSON.stringify(start)} to ${JSON.stringify(end)}`);
  let previous = start;
  for (const point of route) {
    assert(canTraverse(previous, point, colliders, bounds), 'every smoothed segment obeys the server swept-collision rule');
    previous = point;
  }
  assert.deepEqual(route.at(-1), end);
  return route;
}

const start = { x: -8, z: 0 }, end = { x: 8, z: 0 };
assert.deepEqual(findPath(start, end, []), [end]);
const obstacle = { x: 0, z: 0, r: 3 };
const path = findPath(start, end, [obstacle]);
assert.ok(path.length > 2, 'Route must bend around the building');
for (const p of path) assert.ok(Math.hypot(p.x, p.z) > 3.39, 'Path cannot enter the building');
assert.deepEqual(path.at(-1), end);
assert.deepEqual(findPath(start, end, [{ x: 0, z: 0, r: 60 }]), []);
assertRoute(start, end, [obstacle], WORLD_BOUNDS);
const roads = ['greenwood', 'amberwild', 'frostmarch', 'hollow', 'greenwood'];
for (let i = 1; i < roads.length; i++) {
  const from = REGION_ORIGINS[roads[i - 1]], to = REGION_ORIGINS[roads[i]];
  assertRoute(from, to, WORLD_COLLIDERS, WORLD_BOUNDS);
  assertRoute(to, from, WORLD_COLLIDERS, WORLD_BOUNDS);
}
const layout = dungeonLayout();
for (const target of [DUNGEON_START, DUNGEON_EXIT, ...DUNGEON_OBJECTS, ...DUNGEON_STAGES.flatMap(stage => [stage, ...stage.enemies]), ...layout.portals.flatMap(portal => [portal, portal.destination])]) {
  const room = layout.rooms.find(room => Math.abs(target.x - room.x) < room.width / 2 && Math.abs(target.z - room.z) < room.depth / 2);
  assert(room, 'every navigation target belongs to a chamber');
  assertRoute({ x: room.x, z: room.z }, { x: target.x, z: target.z }, DUNGEON_COLLIDERS, DUNGEON_BOUNDS);
}
const pillar = layout.walls.find(wall => wall.halfWidth <= 1 && wall.halfDepth <= 1);
const cover = assertRoute({ x: pillar.x - 3, z: pillar.z }, { x: pillar.x + 3, z: pillar.z }, DUNGEON_COLLIDERS, DUNGEON_BOUNDS);
assert(cover.length > 2, 'dungeon navigation bends around the solid encounter cover');
for (const stage of DUNGEON_STAGES) assert.deepEqual(findPath(DUNGEON_START, { x: stage.x, z: stage.z }, DUNGEON_COLLIDERS, DUNGEON_BOUNDS), [], 'walking cannot cross sealed chamber walls; room portals are required');
for (const portal of layout.portals) assert(!canTraverse(portal, portal.destination, DUNGEON_COLLIDERS, DUNGEON_BOUNDS), 'teleport links never become straight walking segments');
assert.deepEqual(findPath(DUNGEON_START, { x: DUNGEON_BOUNDS.maxX + 1, z: DUNGEON_START.z }, DUNGEON_COLLIDERS, DUNGEON_BOUNDS), [], 'dungeon routes cannot use the larger overworld bounds');
for (const invalid of [{ x: NaN, z: 0 }, { x: Infinity, z: 0 }, { x: 0, z: -Infinity }]) {
  assert.deepEqual(findPath(start, invalid, []), []);
  assert.deepEqual(findPath(invalid, end, []), []);
}
console.log('PASS: obstacle detours, continuous collision, all four scattered regional routes, local paths in all eight dungeon encounters, seals, caches, portal approaches and cover, sealed room boundaries, instance bounds and nonfinite input rejection.');
