import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const names = ['race-kit', 'customization-kit', 'gear-kit', 'cleric-kit', 'climbing-animations'], kits = new Map();
const arsenalPath = '/models/benji-arsenal.glb', arsenalBytes = readFileSync(new URL(`../public${arsenalPath}`, import.meta.url));
let arsenalRequests = 0, arsenalDecodes = 0;
for (const name of names) {
  const bytes = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
  kits.set(`/models/${name}.glb`, await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ''));
}
const staleRace = kits.get('/models/race-kit.glb').scene.clone(true);
const missingRace = staleRace.getObjectByName('race-human-male');
assert(missingRace); missingRace.removeFromParent();
const original = GLTFLoader.prototype.loadAsync;
try {
  for (const failure of ['network', 'stale', 'permanent']) {
    const { loadCharacterAssets } = await import(`../src/characters.ts?loading-check=${failure}`);
    const calls = [];
    let unavailable = failure === 'permanent';
    GLTFLoader.prototype.loadAsync = async url => {
      const parsed = new URL(url, 'https://game.test');
      // All queried character modules share arsenal.ts's own successful load memo.
      if (parsed.pathname === arsenalPath) {
        arsenalRequests++;
        assert.equal(parsed.search, '', 'arsenal is loaded through its shared asset loader');
        const asset = await new GLTFLoader().parseAsync(arsenalBytes.buffer.slice(arsenalBytes.byteOffset, arsenalBytes.byteOffset + arsenalBytes.byteLength), '');
        arsenalDecodes++;
        return asset;
      }
      calls.push(url);
      assert(kits.has(parsed.pathname), 'only shipped character kits are requested');
      if (parsed.search) assert(parsed.searchParams.get('build')?.includes('characters.ts'), 'retry is bound to the calling client module');
      if (parsed.pathname.endsWith('/race-kit.glb')) {
        if (unavailable || failure === 'network' && !parsed.search) throw Error('Controlled model download failure');
        if (failure === 'stale' && !parsed.search) return { scene: staleRace };
      }
      return kits.get(parsed.pathname);
    };
    const first = loadCharacterAssets(), parallel = loadCharacterAssets();
    assert.equal(first, parallel, 'world and player startup share their pending attempt');
    if (unavailable) {
      await assert.rejects(first, /Controlled model download failure/);
      assert.equal(calls.length, names.length + 1, 'permanent failure performs only one fresh retry');
      unavailable = false;
      await Promise.all([loadCharacterAssets(), loadCharacterAssets()]);
      assert.equal(calls.length, names.length * 2 + 1, 'a failed attempt resets the memo and can recover later');
    } else {
      await first;
      assert.equal(calls.length, names.length + 1, 'only the failed or incompatible kit is fetched again');
    }
    const count = calls.length;
    await loadCharacterAssets();
    assert.equal(calls.length, count, 'successful decoded kits remain cached');
  }
  assert.equal(arsenalRequests, 1, 'all character attempts share one arsenal request');
  assert.equal(arsenalDecodes, 1, 'the real arsenal GLB is decoded once across all character attempts');
} finally { GLTFLoader.prototype.loadAsync = original; }
console.log('PASS character loading: real kits, one shared arsenal request/decode, shared startup, stale-model/download recovery, one build-bound fallback bypass, permanent failure and later retry.');
