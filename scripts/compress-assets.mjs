import { readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';

const compressible = new Set(['.html', '.js', '.css', '.json', '.svg', '.glb', '.gltf', '.bin']);
export function compressAssets(directory) {
  const totals = { files: 0, original: 0, br: 0, gzip: 0 };
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) { walk(path); continue; }
      if (!entry.isFile() || !compressible.has(extname(path)) || entry.name === 'release.json') continue;
      const body = readFileSync(path);
      totals.files++; totals.original += body.length;
      for (const [encoding, suffix, compress] of [
        ['br', '.br', value => brotliCompressSync(value, { params: { [constants.BROTLI_PARAM_QUALITY]: 6 } })],
        ['gzip', '.gz', value => gzipSync(value, { level: 9 })],
      ]) {
        const compressed = body.length >= 1024 ? compress(body) : body;
        // Small savings do not justify another stored representation.
        const useful = compressed.length + 128 < body.length && compressed.length < body.length * 0.95;
        if (useful) writeFileSync(path + suffix, compressed);
        else rmSync(path + suffix, { force: true });
        totals[encoding] += useful ? compressed.length : body.length;
      }
    }
  }
  walk(directory);
  return totals;
}
