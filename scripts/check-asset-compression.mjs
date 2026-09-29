import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { compressAssets } from './compress-assets.mjs';
import { serveStaticAsset } from '../src/static-assets.mjs';

const directory = mkdtempSync(join(tmpdir(), 'mossvale-compression-'));
const model = Buffer.from('glTF model vertices and texture coordinates\0'.repeat(4096));
const collision = Buffer.from(Array.from({ length: 32768 }, (_, index) => index % 256));
const path = join(directory, 'model.glb');
const collisionPath = join(directory, 'collision.bin');
const server = createServer((req, res) => {
  const noStore = req.url === '/auth';
  const file = req.url === '/small' ? join(directory, 'small.js') : req.url === '/collision.bin' ? collisionPath : req.url === '/model.glb.br' ? path + '.br' : path;
  res.setHeader('Vary', 'Origin');
  serveStaticAsset(req, res, file, { 'Content-Type': req.url === '/model.glb.br' || req.url === '/collision.bin' ? 'application/octet-stream' : 'model/gltf-binary',
    ...(noStore ? { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } : {}) });
});
const get = (headers = {}, method = 'GET', url = '/') => new Promise((resolve, reject) => {
  const req = request({ host: '127.0.0.1', port: server.address().port, path: url, headers, method }, res => {
    const chunks = [];
    res.on('data', chunk => chunks.push(chunk));
    res.on('error', reject);
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
  });
  req.on('error', reject); req.end();
});
try {
  writeFileSync(path, model);
  writeFileSync(collisionPath, collision);
  writeFileSync(join(directory, 'small.js'), 'export const ready = true;');
  writeFileSync(join(directory, 'picture.png'), model);
  const totals = compressAssets(directory);
  assert.equal(totals.files, 3);
  assert(totals.br < totals.original / 5 && totals.gzip < totals.original / 5);
  assert(!existsSync(join(directory, 'small.js.br')) && !existsSync(join(directory, 'picture.png.br')), 'small files and already encoded images stay untouched');
  for (const [suffix, decompress] of [['.br', brotliDecompressSync], ['.gz', gunzipSync]]) assert.deepEqual(decompress(readFileSync(path + suffix)), model, 'compression is lossless');
  assert.deepEqual(compressAssets(directory), totals, 'repeated builds never recursively compress the sidecars');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  for (const [encoding, decompress] of [['br', brotliDecompressSync], ['gzip', gunzipSync]]) {
    const result = await get({ 'Accept-Encoding': encoding }, 'GET', '/collision.bin');
    assert.equal(result.status, 200); assert.equal(result.headers['content-encoding'], encoding);
    assert.equal(result.headers['content-type'], 'application/octet-stream');
    assert.equal(Number(result.headers['content-length']), result.body.length);
    assert.deepEqual(decompress(result.body), collision, 'compressed collision binaries preserve every byte used by the client SHA-256 check');
  }
  const identity = await get();
  assert.equal(identity.status, 200); assert.deepEqual(identity.body, model);
  assert.equal(identity.headers['content-encoding'], undefined);
  assert.equal(identity.headers['cache-control'], 'no-cache');
  assert.equal(identity.headers.vary, 'Origin, Accept-Encoding');
  assert.match(identity.headers.etag, /^W\/"[a-f0-9]{64}"$/);
  for (const [accept, encoding] of [
    ['gzip, deflate, br', 'br'], ['gzip', 'gzip'], ['BR ; q=1, gzip;q=0.5', 'br'],
    ['br;q=0, gzip', 'gzip'], ['br;q=0.4, gzip;q=0.8, identity;q=0.1', 'gzip'],
    ['*', 'br'], ['identity', undefined], ['br;q=0, gzip;q=0', undefined],
    ['br;q=invalid, gzip;q=2', undefined], ['br;q=0.2', undefined],
  ]) {
    const result = await get({ 'Accept-Encoding': accept });
    assert.equal(result.status, 200, accept); assert.equal(result.headers['content-encoding'], encoding, accept);
    assert.equal(result.headers['content-type'], 'model/gltf-binary');
    assert.equal(Number(result.headers['content-length']), result.body.length);
    assert.equal(result.headers.etag, identity.headers.etag, 'weak ETag describes the same decoded asset across encodings');
    assert.deepEqual(encoding === 'br' ? brotliDecompressSync(result.body) : encoding === 'gzip' ? gunzipSync(result.body) : result.body, model);
  }
  const head = await get({ 'Accept-Encoding': 'br' }, 'HEAD');
  assert.equal(head.body.length, 0); assert.equal(head.headers['content-encoding'], 'br');
  assert.equal(Number(head.headers['content-length']), readFileSync(path + '.br').length);
  const cached = await get({ 'Accept-Encoding': 'br', 'If-None-Match': `"unrelated", ${identity.headers.etag.slice(2)}` });
  assert.equal(cached.status, 304); assert.equal(cached.body.length, 0); assert.equal(cached.headers.vary, 'Origin, Accept-Encoding');
  assert.equal((await get({ 'If-None-Match': '*' })).status, 304);
  const auth = await get({ 'Accept-Encoding': 'br', 'If-None-Match': '*' }, 'GET', '/auth');
  assert.equal(auth.status, 200); assert.equal(auth.headers.etag, undefined);
  assert.equal(auth.headers['cache-control'], 'no-store'); assert.equal(auth.headers['referrer-policy'], 'no-referrer');
  assert.equal((await get({ 'Accept-Encoding': '*;q=0' })).status, 406);
  assert.equal((await get({ 'Accept-Encoding': 'br,identity;q=0' }, 'GET', '/small')).status, 406);
  assert.equal((await get({ 'Accept-Encoding': 'br' }, 'GET', '/small')).headers['content-encoding'], undefined, 'missing sidecars fall back to identity');
  const direct = await get({ 'Accept-Encoding': 'br,gzip' }, 'GET', '/model.glb.br');
  assert.equal(direct.headers['content-encoding'], undefined);
  assert.deepEqual(direct.body, readFileSync(path + '.br'), 'release verification reads sidecar bytes without double decoding');
  writeFileSync(path, Buffer.from('updated model'.repeat(8192)));
  utimesSync(path, new Date(), new Date(Date.now() + 1000));
  compressAssets(directory);
  const changed = await get({ 'If-None-Match': identity.headers.etag, 'Accept-Encoding': 'br' });
  assert.equal(changed.status, 200); assert.notEqual(changed.headers.etag, identity.headers.etag);
  assert.deepEqual(brotliDecompressSync(changed.body), readFileSync(path), 'changed mutable paths invalidate the previous response');
  writeFileSync(path, 'small'); compressAssets(directory);
  assert(!existsSync(path + '.br') && !existsSync(path + '.gz'), 'rebuilding removes a representation that no longer saves bytes');
  console.log('PASS lossless model and collision binary compression; HTTP Brotli/gzip negotiation, HEAD, ETag revalidation, identity fallback and auth cache policy');
} finally {
  await new Promise(resolve => server.close(resolve));
  rmSync(directory, { recursive: true, force: true });
}
