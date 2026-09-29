import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const source = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
for (const name of ['src/main.ts', 'src/minimap.ts', 'src/world-map.ts', 'src/collision-context.ts', 'src/shared.ts', 'server.mjs']) {
  assert.doesNotMatch(source(name), /from ['"][^'"]*world-atlas|createWorldAtlasWorld|loadWorldAtlasAssets|atlasInstanceId|handleAtlasTravel|advanceAtlasTravel|interactAtlasDoor/, `${name}: unfinished explorable Atlas has no runtime entry or import`);
}
const main = source('src/main.ts');
assert.doesNotMatch(main, /Explore the World Atlas|atlas-enter-leave|type:\s*'atlas'/, 'the map cannot enter the removed world');
assert.match(main, /\$\('minimap-button'\)\.onclick=openMap/, 'the minimap still opens the functioning map');
assert.match(main, /if\(key==='m'\)openMap\(\)/, 'M still opens the functioning map');
assert.match(main, /createWorldMap\(/);assert.match(main, /createMinimap\(/);
assert.doesNotMatch(source('src/shared.ts'), /type:\s*'atlas'/, 'removed travel messages are absent from the client protocol');
for (const name of ['src/world-atlas.ts', 'src/world-atlas-data.ts', 'src/world-atlas-world.ts', 'src/world-atlas-review.ts', 'world-atlas-review.html', 'public/world-atlas/world.json']) {
  assert(!existsSync(new URL(`../${name}`, import.meta.url)), `${name}: exclusive unfinished world source/assets removed`);
}
console.log('PASS: unfinished explorable World Atlas has no client entry, protocol route, renderer or shipped catalog; M map and minimap remain available.');
