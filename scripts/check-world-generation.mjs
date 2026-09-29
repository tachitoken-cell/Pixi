import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { WORLD_BOUNDS, TERRAIN_STEP, surfaceAt } from '../src/landscape.ts';

// Captured before startup optimizations at aa21c8898e6ca215c464e10db3efa67b28f619e8.
// Updated for six story-chamber entrances: their clearings change 9,284 terrain
// heights and nearby generated placements, plus add 324 approach colliders.
// Restoring LEGACY_DUNGEONS alone reproduces all four previous fingerprints.
// Change these only when a reviewed world-layout change intentionally moves content.
const expected = {
  terrain: '0d6d563acbe21c138327f37d682d5655f72857790dd7884c1fe358770d468564',
  settlements: 'd01ba596d80e85308a3d62f8e7d19865d33fdd6c6a40c17314cb29ea5f99f044',
  realm: '31342eab6f89781e032c7b2be2eea4d925caf99df519eaac1d2fa36162c4c483',
  'gathering-nodes': 'f3be0ac61e8c93c99db3d7a333bc6b87f19f0c600b12d00cf91284f20e176ee8',
};
const finite = (_key, value) => {
  if (typeof value === 'number') assert(Number.isFinite(value), 'World generation must contain finite numbers');
  return value;
};
const terrain = createHash('sha256');
let cells = 0;
for (let z = WORLD_BOUNDS.minZ + TERRAIN_STEP / 2; z < WORLD_BOUNDS.maxZ; z += TERRAIN_STEP)
  for (let x = WORLD_BOUNDS.minX + TERRAIN_STEP / 2; x < WORLD_BOUNDS.maxX; x += TERRAIN_STEP) {
    terrain.update(JSON.stringify(surfaceAt(x, z), finite)); cells++;
  }
assert.equal(cells, 589824);
assert.equal(terrain.digest('hex'), expected.terrain, 'Every terrain cell keeps its exact height, water, biome and beach state');
for (const name of ['settlements', 'realm', 'gathering-nodes']) {
  const module = await import(`../src/${name}.ts`);
  const data = Object.fromEntries(Object.entries(module).filter(([, value]) => typeof value !== 'function'));
  // Preserve ordering and content; ignore only sub-nanometre platform math differences.
  const serialized = JSON.stringify(data, (key, value) => typeof finite(key, value) === 'number' ? Math.round(value * 1e9) / 1e9 : value);
  assert.equal(createHash('sha256').update(serialized).digest('hex'), expected[name], `${name}: generated content and positions match the reviewed world`);
}
console.log(`PASS world generation: ${cells} exact terrain cells and reviewed towns, NPCs, scenery, collisions, enemies and gathering spots.`);
