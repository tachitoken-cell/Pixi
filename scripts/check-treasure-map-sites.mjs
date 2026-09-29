import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  return next(context.parentURL?.includes('/src/') && /^\.\/[\w-]+$/.test(specifier) ? `${specifier}.ts` : specifier, context);
} });
const { TREASURE_MAP_SITES } = await import('../src/treasure-maps.ts');
const { ZONES } = await import('../src/content.ts');
const { WORLD_BOSSES } = await import('../src/bestiary.ts');
const { DUNGEONS } = await import('../src/dungeon.ts');
const { WORLD_COLLIDERS, OVERWORLD_SPAWNS, canTraverse, overworldSpawnAllowed } = await import('../src/realm.ts');
const { surfaceAt, TERRAIN_MAX_STEP } = await import('../src/landscape.ts');
const { regionLevelRange } = await import('../src/region-levels.ts');
const { findPath } = await import('../src/navigation.ts');

assert.equal(TREASURE_MAP_SITES.length, 12);
assert.equal(new Set(TREASURE_MAP_SITES.map(site => site.id)).size, TREASURE_MAP_SITES.length);
for (const zone of ZONES) assert.equal(TREASURE_MAP_SITES.filter(site => site.zone === zone.id).length, 2, `${zone.id}: two destinations`);
for (const site of TREASURE_MAP_SITES) {
  const center = { x: site.searchX, z: site.searchZ }, floor = surfaceAt(site.x, site.z).height;
  const safe = point => {
    assert(overworldSpawnAllowed(point, site.zone), `${site.id}: dry, same-zone wilderness with shared spawn clearance`);
    assert(WORLD_BOSSES.every(boss => Math.hypot(point.x - boss.x, point.z - boss.z) > boss.arenaRadius + 12), `${site.id}: outside boss arenas`);
    assert(DUNGEONS.every(dungeon => Math.hypot(point.x - dungeon.entrance.x, point.z - dungeon.entrance.z) > 90), `${site.id}: outside dungeon approaches`);
  };
  safe(site); safe(center);
  assert(site.radius >= 32 && site.radius <= 40);
  assert(Math.hypot(site.x - center.x, site.z - center.z) < site.radius, `${site.id}: target lies inside search area`);
  assert(OVERWORLD_SPAWNS.every(spawn => Math.hypot(site.x - spawn.x, site.z - spawn.z) >= 9), `${site.id}: no overlap with existing monster homes`);
  const region = surfaceAt(site.x, site.z).regionId, level = regionLevelRange(region, site.zone);
  assert(level.min <= regionLevelRange(site.zone, site.zone).min + 6, `${site.id}: destination suits its zone's early players`);

  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
    const point = { x: site.x + x, z: site.z + z };
    safe(point);
    assert(canTraverse(site, point), `${site.id}: guardian footprint clears scenery`);
    assert(Math.abs(surfaceAt(point.x, point.z).height - floor) <= TERRAIN_MAX_STEP, `${site.id}: guardian footprint has no steep terrain`);
  }
  for (const x of [-1.5, 0, 1.5]) for (const z of [-1.5, 0, 1.5])
    assert.equal(surfaceAt(site.x + x, site.z + z).height, floor, `${site.id}: chest has a flat three-metre footprint`);
  for (let x = -site.radius; x <= site.radius; x += 4) for (let z = -site.radius; z <= site.radius; z += 4) {
    if (Math.hypot(x, z) > site.radius) continue;
    const surface = surfaceAt(center.x + x, center.z + z);
    assert(!surface.water && !surface.beach && surface.zone === site.zone, `${site.id}: search area stays on dry ground in its zone`);
  }
  const direction = site.x > center.x ? 'east' : site.x < center.x ? 'west' : site.z > center.z ? 'south' : 'north';
  assert.equal(site.clue, `Search ${direction} of the marked area's center.`, `${site.id}: clue matches actual target direction`);
  const path = findPath(center, site, WORLD_COLLIDERS);
  assert(path.length, `${site.id}: search center has a walking route to treasure`);
  let previous = center;
  for (const step of path) {
    assert(canTraverse(previous, step), `${site.id}: route respects server collision`);
    const samples = Math.max(1, Math.ceil(Math.hypot(step.x - previous.x, step.z - previous.z) / .5));
    for (let i = 0; i <= samples; i++) {
      const surface = surfaceAt(previous.x + (step.x - previous.x) * i / samples, previous.z + (step.z - previous.z) * i / samples);
      assert(!surface.water && !surface.beach && surface.zone === site.zone, `${site.id}: walking route remains dry and in the same zone`);
    }
    previous = step;
  }
  assert(Math.hypot(previous.x - site.x, previous.z - site.z) < .01, `${site.id}: route reaches the exact site`);
}
console.log('Treasure map sites PASS: 12 accessible destinations, accurate clues, safe terrain and suitable region levels.');
