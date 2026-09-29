// Run: node wiki/render-monsters.mjs [kind] [--serve]. With --serve, open the printed URL in a browser.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { build } from 'esbuild';
import { MONSTERS } from '../src/bestiary.ts';

const args = process.argv.slice(2), serve = args.includes('--serve');
const selected = args.filter(arg => arg !== '--serve');
assert(selected.every(kind => Object.hasOwn(MONSTERS, kind)), 'Choose a known monster kind');
const kinds = selected.length ? selected : Object.keys(MONSTERS);
const root = fileURLToPath(new URL('../', import.meta.url));
const out = new URL('./assets/monsters/', import.meta.url);
const artifacts = new URL('../artifacts/wiki/', import.meta.url);
await Promise.all([mkdir(out, { recursive: true }), mkdir(artifacts, { recursive: true })]);
const bundle = await build({ bundle: true, format: 'esm', write: false, stdin: {
  resolveDir: root, sourcefile: 'wiki-monster-renderer.js', contents: `
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeEnemy, setMonsterAssets } from './src/characters.ts';
import { setTrainingDummyAssets, setTreasureAssets, setThemedMonsterAssets } from './src/monster-models.ts';
import { MONSTERS } from './src/bestiary.ts';

try {
  const asset = await new GLTFLoader().loadAsync('/monster-kit.glb');
  setMonsterAssets(asset.scene, asset.animations);
  for (const [path, register] of [['themed-monsters', setThemedMonsterAssets], ['training-dummy', setTrainingDummyAssets], ['treasure-goblin', setTreasureAssets]]) {
    const asset = await new GLTFLoader().loadAsync('/' + path + '.glb'); register(asset.scene, asset.animations);
  }
  const kinds = ${JSON.stringify(kinds)};
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(320, 320); renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 1000);
  scene.add(new THREE.HemisphereLight('#f1f7ff', '#827661', 2.2));
  const sun = new THREE.DirectionalLight('#fff1d8', 3.4); sun.position.set(-4, 8, 6); scene.add(sun);
  const fill = new THREE.DirectionalLight('#bcdcff', 1.6); fill.position.set(5, 3, -4); scene.add(fill);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 320;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const sheet = document.createElement('canvas'); sheet.width = Math.min(6, kinds.length) * 320; sheet.height = Math.ceil(kinds.length / 6) * 350;
  const contact = sheet.getContext('2d'); contact.fillStyle = '#fff'; contact.fillRect(0, 0, sheet.width, sheet.height);
  const results = [];
  async function save(name, canvas) {
    const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const response = await fetch('/save/' + name, { method: 'POST', body: png });
    if (!response.ok) throw new Error('Cannot save ' + name);
  }
  for (const kind of kinds) {
    const monster = MONSTERS[kind];
    const model = makeEnemy(kind); scene.add(model);
    const box = new THREE.Box3().setFromObject(model), center = box.getCenter(new THREE.Vector3());
    const extent = box.getSize(new THREE.Vector3()).length();
    camera.position.copy(center).addScaledVector(new THREE.Vector3(1, .65, 1.8).normalize(), extent * 3);
    camera.lookAt(center); camera.updateMatrixWorld();
    const viewBox = new THREE.Box3();
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z])
      viewBox.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
    const half = Math.max(viewBox.max.x - viewBox.min.x, viewBox.max.y - viewBox.min.y) * .57;
    camera.left = -half; camera.right = half; camera.top = half; camera.bottom = -half; camera.updateProjectionMatrix();
    renderer.render(scene, camera); ctx.clearRect(0, 0, 320, 320); ctx.drawImage(renderer.domElement, 0, 0);
    const pixels = ctx.getImageData(0, 0, 320, 320).data;
    let visible = 0, minX = 320, minY = 320, maxX = 0, maxY = 0;
    for (let y = 0; y < 320; y++) for (let x = 0; x < 320; x++) if (pixels[(y * 320 + x) * 4 + 3] > 10) {
      visible++; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    if (visible < 1500 || minX < 6 || minY < 6 || maxX > 313 || maxY > 313) throw new Error(kind + ': missing or cropped model');
    await save(kind, canvas);
    const i = results.length, x = i % 6 * 320, y = Math.floor(i / 6) * 350;
    contact.drawImage(canvas, x, y); contact.fillStyle = '#222'; contact.font = '15px sans-serif'; contact.textAlign = 'center';
    contact.fillText(monster.name, x + 160, y + 335);
    results.push({ kind, visible, bounds: [minX, minY, maxX, maxY] }); scene.remove(model);
  }
  await save('contact-sheet', sheet);
  await fetch('/done', { method: 'POST', body: JSON.stringify(results) }); renderer.dispose();
} catch (error) {
  await fetch('/error', { method: 'POST', body: error.stack || String(error) });
}
` } });

let complete, fail;
const finished = new Promise((resolve, reject) => { complete = resolve; fail = reject; });
const hashes = new Set();
const server = createServer(async (request, response) => {
  try {
    if (request.method === 'POST') {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      const match = request.url.match(/^\/save\/([a-z]+(?:-[a-z]+)*)$/);
      if (match) {
        assert(bytes.length > 1000 && bytes.length < 4_000_000, 'valid PNG size');
        assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
        const name = match[1];
        assert(name === 'contact-sheet' || kinds.includes(name), 'only requested portraits may be saved');
        if (name !== 'contact-sheet') {
          assert.equal(bytes.readUInt32BE(16), 320); assert.equal(bytes.readUInt32BE(20), 320);
          const hash = createHash('sha256').update(bytes).digest('hex');
          assert(!hashes.has(hash), 'every monster has a distinct image'); hashes.add(hash);
        }
        await writeFile(new URL(name === 'contact-sheet' ? 'monster-contact-sheet.png' : name + '.png', name === 'contact-sheet' ? artifacts : out), bytes);
      } else if (request.url === '/done') complete(JSON.parse(bytes));
      else if (request.url === '/error') fail(new Error(bytes.toString()));
      else throw new Error('Unknown capture request');
      response.end('OK'); return;
    }
    if (['/monster-kit.glb', '/themed-monsters.glb', '/training-dummy.glb', '/treasure-goblin.glb'].includes(request.url)) response.end(await readFile(new URL('../public/models' + request.url, import.meta.url)));
    else if (request.url === '/render.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundle.outputFiles[0].contents); }
    else { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Wiki monster capture</title><script type="module" src="/render.js"></script>'); }
  } catch (error) { response.statusCode = 500; response.end('Capture failed'); fail(error); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = (...args) => promisify(execFile)('npx', ['--no-install', 'agent-browser', '--session', 'wiki-monster-capture', ...args], { cwd: root });
const timeout = setTimeout(() => fail(new Error('Monster capture timed out')), 90_000);
try {
  const url = 'http://127.0.0.1:' + server.address().port;
  if (serve) console.log('Open ' + url + ' to render ' + kinds.join(', '));
  const results = serve ? await finished : (await Promise.all([browser('open', url), finished]))[1];
  assert.deepEqual(results.map(result => result.kind), kinds); assert.equal(hashes.size, results.length);
  await writeFile(new URL('monster-portraits.json', artifacts), JSON.stringify(results, null, 2) + '\n');
  console.log('PASS: ' + results.length + ' distinct 320×320 monster portraits; every silhouette fully inside the frame.');
} finally {
  clearTimeout(timeout); if (!serve) await browser('close').catch(() => {}); server.close(); server.closeAllConnections();
}
