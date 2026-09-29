import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

const revision = process.argv[2];
const gameRevision = process.env.GAME_REVISION || revision;
assert.match(gameRevision || '', /^[a-f0-9]{40}$/, 'Pass the full expected game revision');
assert.match(revision || '', /^[a-f0-9]{40}$/, 'Pass the full expected release revision');
assert.ok(process.argv.length === 3 || (process.argv.length === 4 && process.argv[3] === '--realms-only'), 'Unknown verification option');
const origins = ['https://mossvale.world', 'https://us.mossvale.world', 'https://asia.mossvale.world'];
const wiki = 'https://wiki.mossvale.world';
async function request(origin, path) {
  return fetch(`${origin}/${path}?wiki-check=${revision}`, {
    headers: { 'User-Agent': 'Mossvale-Wiki-Verification/1.0', 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(30_000),
  });
}
async function checkRealms() {
  await Promise.all(origins.map(async origin => {
    const response = await request(origin, 'release.json');
    assert.equal(response.status, 200, `${origin}: release HTTP status`);
    assert.equal((await response.json()).revision, gameRevision, `${origin}: game must match the expected release`);
  }));
}
await checkRealms();
if (process.argv[3] !== '--realms-only') {
  const out = resolve(import.meta.dirname, '../wiki-dist');
  const manifest = JSON.parse(await readFile(resolve(out, 'release.json'), 'utf8'));
  assert.equal(manifest.revision, revision, 'Local wiki build must match expected revision');
  const files = (await readdir(out, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name !== '_headers')
    .map(entry => relative(out, resolve(entry.parentPath, entry.name)));
  for (let offset = 0; offset < files.length; offset += 8) {
    await Promise.all(files.slice(offset, offset + 8).map(async file => {
      const path = file === '404.html' ? 'wiki-verification-page-does-not-exist/' : file.replace(/(^|\/)index\.html$/, '$1');
      const response = await request(wiki, path);
      assert.equal(response.status, file === '404.html' ? 404 : 200, `${file}: public HTTP status`);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(resolve(out, file)), `${file}: public content differs from build`);
    }));
  }
  await checkRealms();
  console.log(`Live wiki verified: ${files.length} files, patch notes, search, sitemap and 404 match ${revision}.`);
}
console.log(`EU, US and Asia match ${gameRevision}.`);
