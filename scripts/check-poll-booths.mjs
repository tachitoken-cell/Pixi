import assert from 'node:assert/strict';
import { POLL_BOOTHS, POLL_BOOTH_COLLIDERS } from '../src/poll-booths.ts';
import { CITY_LAYOUTS } from '../src/city.ts';
import { ZONES } from '../src/content.ts';
import { WORLD_COLLIDERS, WORLD_BOUNDS, canTraverse, toWorld } from '../src/realm.ts';
import { findPath } from '../src/navigation.ts';
import { waterAt } from '../src/landscape.ts';

assert.equal(POLL_BOOTHS.length, CITY_LAYOUTS.length);
assert.equal(new Set(POLL_BOOTHS.map(booth => booth.id)).size, 6);
for (const [index, booth] of POLL_BOOTHS.entries()) {
  assert(WORLD_COLLIDERS.includes(POLL_BOOTH_COLLIDERS[index]), 'both peers use the booth collision');
  assert(canTraverse(booth, booth) && !waterAt(booth.x, booth.z), `${booth.id}: clear, dry service point`);
  const spawn = toWorld(booth.zone, ZONES.find(zone => zone.id === booth.zone).spawn);
  const route = findPath(spawn, booth, WORLD_COLLIDERS, WORLD_BOUNDS);
  assert(route.length && Math.hypot(route.at(-1).x - booth.x, route.at(-1).z - booth.z) < .01, `${booth.id}: reachable from town spawn`);
  let previous = spawn;
  for (const point of route) { assert(canTraverse(previous, point)); previous = point; }
  const behind = { x: booth.modelX, z: booth.modelZ - 1.5 };
  assert(canTraverse(behind, behind), 'the rear approach itself is clear');
  assert(!canTraverse(behind, booth), 'the solid kiosk blocks voting through its back');
  assert(canTraverse({ x: booth.x, z: booth.z + 2 }, booth), 'the front approach has line of sight');
  assert(!canTraverse(booth, { x: booth.modelX, z: booth.modelZ }), 'players cannot walk through the ballot box');
}
console.log('PASS six polling booths: shared solid footprints, dry service points, navigable town approaches and front/rear line of sight.');
