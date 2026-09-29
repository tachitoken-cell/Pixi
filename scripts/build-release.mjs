import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { compressAssets } from './compress-assets.mjs';

const root = resolve(import.meta.dirname, '..');
// Advance when older realms cannot read or enforce persisted player state; independent of talent migrations.
const PLAYER_CATALOG_VERSION = 10;
// BBA removes .git from its checkout; CI puts the tested commit in this marker.
const marker = resolve(root, 'release-revision.txt');
const revision = process.env.MOSSVALE_REVISION || (existsSync(marker) ? readFileSync(marker, 'utf8').trim()
  : execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim());
if (!/^[a-f0-9]{40}$/.test(revision)) throw Error('A full release commit is required');
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const compressed = compressAssets(resolve(root, 'dist'));
console.log(`Compressed ${compressed.files} assets: ${compressed.original} bytes → ${compressed.br} Brotli / ${compressed.gzip} gzip bytes`);
const assets = {};
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.isFile() && path !== resolve(root, 'dist/release.json')) assets[relative(resolve(root, 'dist'), path)] = hash(path);
    else if (!entry.isFile()) throw Error('Release assets must be regular files');
  }
}
walk(resolve(root, 'dist'));
const hostFiles = Object.fromEntries(['deploy/ovh/compose.yml', 'deploy/ovh/Caddyfile', 'deploy/ovh/backup.sh',
  'deploy/ovh/database-tools.sh', 'public/realm-restarting.html'].map(path => [path, hash(resolve(root, path))]));
writeFileSync(resolve(root, 'dist/release.json'), JSON.stringify({ revision, playerCatalogVersion: PLAYER_CATALOG_VERSION, assets, hostFiles }) + '\n');
console.log(`Release ${revision}: ${Object.keys(assets).length} verified assets`);
