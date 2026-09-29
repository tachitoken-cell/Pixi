import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createServer as createVite } from 'vite';
import { createGameServer } from '../server.mjs';
import { COMMUNITY_VERSION } from '../src/community.ts';
import { DEFAULT_APPEARANCE } from '../src/appearance.ts';
import { starterGear } from '../src/progression.ts';
import { newOnboarding } from '../src/onboarding.ts';
import { regionAt } from '../src/realm.ts';
import { actorFloor, actorCanStand, installCollisionScene, updateCollisionSceneState } from '../src/collision3d.ts';
import { collisionRouteAllowed, dungeonCollisionFlags } from '../src/collision-context.ts';
import { dungeonLayout } from '../src/dungeon.ts';

// Uses a disposable, authenticated local realm and its actual baked scenery.
const { chromium } = await import(process.env.MOSSVALE_PLAYWRIGHT || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'mossvale-solid-world-'));
const output = process.env.SOLID_WORLD_PROOF_DIR || join(root, 'artifacts/solid-world');
await mkdir(output, { recursive: true });
async function loadScene(key) {
  const data = JSON.parse(await readFile(join(root, 'public/collision', key + '.json'), 'utf8'));
  const binary = await readFile(join(root, 'public/collision', key + '.bin'));
  await installCollisionScene(key, data, binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength));
}
await loadScene('overworld');
const roof = { x: -34, z: 33 }, roofY = actorFloor('overworld', roof.x, roof.z, 20);
assert(roofY > 8 && actorCanStand('overworld', roof.x, roofY, roof.z), 'fixture is a real cottage roof');
const fixtures = [
  { name: 'Rock climber', x: 26, z: -88.6 },
  { name: 'Roof walker', ...roof, standingPosition: { ...roof, y: roofY } },
  { name: 'Ceiling jumper', x: -34, z: 35 },
];
const accounts = fixtures.map(fixture => {
  const token = randomBytes(32).toString('base64url');
  const player = { id: randomUUID(), ...fixture, zone: regionAt(fixture.x, fixture.z), coordinateVersion: 2, rotation: Math.PI,
    appearance: { ...DEFAULT_APPEARANCE }, characterCreated: true, ...starterGear('Ranger'), level: 60, hp: 808, maxHp: 808, xp: 0, gold: 0, talents: [],
    inventory: { wood: 0, crystal: 0, herb: 0, potion: 3, relic: 0 },
    onboarding: { ...newOnboarding(), completed: true, looted: true, bagViewed: true, gearViewed: true }, quest: { stage: 0, kills: 0, crystals: 0 } };
  return { token, player };
});
await writeFile(join(directory, 'players.json'), JSON.stringify(Object.fromEntries(accounts.map(({ token, player }) => [createHash('sha256').update(token).digest('hex'), { characters: [player], communityRulesVersion: COMMUNITY_VERSION }]))));
const game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: directory, databaseUrl: '', keycloak: null });
let vite, browser, page;
const errors = [], results = {};
async function enter(account) {
  await page?.close();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ token, id }) => {
    localStorage.setItem('mossvale-session', token);
    localStorage.setItem('mossvale-graphics', JSON.stringify({ resolution: 1, renderDistance: 120, shadows: 'low', textures: 'high', effects: 'low', bloom: false, reflections: false }));
    window.solidProof = { sent: [], states: [], player: null, socket: null };
    const NativeSocket = WebSocket;
    window.WebSocket = class extends NativeSocket {
      constructor(...args) {
        super(...args); solidProof.socket = this;
        this.addEventListener('message', event => {
          const message = JSON.parse(event.data);
          if (message.type !== 'snapshot') return;
          const player = message.players.find(player => player.id === id);
          if (!player) return;
          solidProof.player = player;
          solidProof.states.push({ x: player.x, z: player.z, ...player.jump, stamina: player.travel?.stamina });
          if (solidProof.states.length > 1000) solidProof.states.shift();
          const stop = solidProof.stopOnLanding;
          if (stop && player.jump?.grounded && !player.jump.climb && (stop.above ? player.jump.y > stop.height : player.jump.y < stop.height)) {
            // Release the normal movement input at the authoritative landing;
            // screenshots can take longer than these short ascents or falls.
            window.dispatchEvent(new KeyboardEvent('keyup', { key: stop.key, code: `Key${stop.key.toUpperCase()}`, bubbles: true }));
            solidProof.stopOnLanding = null;
          }
        });
      }
      send(data) {
        const message = JSON.parse(data);
        if (['climb', 'climbStop', 'jump'].includes(message.type)) solidProof.sent.push(message);
        super.send(data);
      }
    };
  }, { token: account.token, id: account.player.id });
  await page.goto(vite.resolvedUrls.local[0]);
  await login();
}
async function login() {
  await page.waitForFunction(() => document.querySelector('[data-x-choice="denied"]') || !document.querySelector('#loading') && document.querySelector('#login-guest')?.hidden === false, undefined, { timeout: 120000 });
  const declineCookies = page.getByRole('button', { name: 'Decline X cookies', exact: true });
  if (await declineCookies.isVisible()) await declineCookies.click();
  await page.waitForFunction(() => !document.querySelector('#loading') && document.querySelector('#login-guest')?.hidden === false, undefined, { timeout: 120000 });
  await page.locator('#login-guest').click();
  await page.locator('#roster-enter').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('#roster-enter').disabled);
  await page.locator('#roster-enter').click();
  await page.waitForFunction(() => !document.body.classList.contains('at-roster') && document.querySelector('#game').dataset.connected === 'true' && solidProof.player, undefined, { timeout: 120000 });
  await page.waitForFunction(() => document.querySelector('#region-intro').textContent && Number(getComputedStyle(document.querySelector('#region-intro')).opacity) < .01);
  // Rotate the visible camera through its normal drag control so WASD matches
  // the surveyed north/south/east fixture approaches.
  await page.mouse.move(780, 510); await page.mouse.down();
  await page.mouse.move(780 + .34 / .006, 510); await page.mouse.up();
}
const state = () => page.evaluate(() => ({ player: solidProof.player, states: solidProof.states, sent: solidProof.sent }));
const screenshot = name => page.screenshot({ path: join(output, name + '.png') });
async function jumpAndLand(floor) {
  await page.evaluate(() => { solidProof.states = []; });
  await page.keyboard.press('Space');
  await page.waitForFunction(floor => !solidProof.player.jump.grounded && solidProof.player.jump.y > floor + .15, floor, { timeout: 10000 });
  await screenshot('jump-' + (floor > 8 ? 'roof' : floor > .5 ? 'rock' : 'ceiling'));
  await page.waitForFunction(() => solidProof.player.jump.grounded, undefined, { timeout: 10000 });
  const proof = await state();
  assert(Math.abs(proof.player.jump.y - floor) < .07, 'jump lands back on the same authored support');
  return { ...proof, peak: Math.max(...proof.states.map(state => state.y)) };
}
try {
  const port = await game.start();
  vite = await createVite({ root, configFile: join(root, 'vite.config.js'), logLevel: 'error', cacheDir: join(directory, 'vite'), server: { host: '127.0.0.1', port: 0, hmr: false, proxy: { '/socket': { target: `ws://127.0.0.1:${port}`, ws: true }, '/api': `http://127.0.0.1:${port}` } } });
  await vite.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.MOSSVALE_CHROME ? { executablePath: process.env.MOSSVALE_CHROME } : {}) });

  await enter(accounts[0]);
  await screenshot('rock-before');
  await page.evaluate(() => { solidProof.stopOnLanding = { key: 'w', height: 1.2, above: true }; });
  await page.keyboard.down('w');
  await page.waitForFunction(() => solidProof.states.some(state => state.climb && state.stamina < 100), undefined, { timeout: 10000 });
  await screenshot('rock-climbing');
  await page.waitForFunction(() => !solidProof.player.jump.climb && solidProof.player.jump.grounded && solidProof.player.jump.y > 1.2, undefined, { timeout: 10000 });
  await page.keyboard.up('w');
  results.rock = await state();
  assert(results.rock.sent.some(message => message.type === 'climb'), 'ground input triggers climbing on actual rock geometry');
  assert(results.rock.states.some(state => state.climb && state.stamina < 100), 'server charges rock climbing energy');
  await screenshot('rock-standing');
  results.rockJump = await jumpAndLand(results.rock.player.jump.y);
  await page.evaluate(() => { solidProof.states = []; solidProof.stopOnLanding = { key: 's', height: 1, above: false }; });
  await page.keyboard.down('s');
  await page.waitForFunction(() => solidProof.states.some(state => !state.grounded && !state.climb), undefined, { timeout: 10000 });
  await page.waitForFunction(() => solidProof.player.jump.grounded && solidProof.player.jump.y < 1, undefined, { timeout: 10000 });
  await page.keyboard.up('s');
  results.rockStepOff = await state();
  await screenshot('rock-step-off');

  await enter(accounts[1]);
  assert(Math.abs((await state()).player.jump.y - roofY) < .05, 'trusted saved support restores the exact roof');
  await screenshot('roof-standing');
  results.roofJump = await jumpAndLand(roofY);
  assert(results.roofJump.peak > roofY + .5, 'jump launches from the roof');
  await page.reload(); await login();
  results.roofReconnect = await state();
  assert(Math.abs(results.roofReconnect.player.jump.y - roofY) < .05, 'disconnect/reconnect preserves valid standing support');
  await screenshot('roof-reconnected');
  await page.evaluate(() => { solidProof.states = []; solidProof.stopOnLanding = { key: 'd', height: 1, above: false }; });
  await page.keyboard.down('d');
  await page.waitForFunction(() => solidProof.states.some(state => !state.grounded && !state.climb), undefined, { timeout: 10000 });
  await screenshot('roof-step-off');
  await page.waitForFunction(() => solidProof.player.jump.grounded && solidProof.player.jump.y < 1, undefined, { timeout: 10000 });
  await page.keyboard.up('d');
  results.roofStepOff = await state();

  await enter(accounts[2]);
  const ceilingFloor = (await state()).player.jump.y;
  results.ceiling = await jumpAndLand(ceilingFloor);
  assert(results.ceiling.peak < ceilingFloor + 1.5 && results.ceiling.peak > ceilingFloor + .5, 'actual cottage eave stops upward travel before the free jump apex');
  await page.evaluate(() => { const p = solidProof.player; solidProof.socket.send(JSON.stringify({ type: 'move', x: p.x, z: p.z, rotation: 0, y: 999 })); });
  await page.waitForTimeout(300);
  assert((await state()).player.jump.y < 2, 'client-forged height is rejected');

  await loadScene('dungeon-rootvault');
  const layout = dungeonLayout('rootvault'), room = layout.rooms[0], another = layout.rooms[1];
  assert(collisionRouteAllowed(room, { x: room.x + 1, z: room.z }, 'dungeon-proof'), 'room interior routes remain legal');
  assert(!collisionRouteAllowed(room, another, 'dungeon-proof'), 'physical climbing cannot cross the void into another room');
  const chest = layout.objects.find(object => object.kind === 'chest');
  const closedFlags = dungeonCollisionFlags('rootvault', [], [], false, false, 0);
  updateCollisionSceneState('dungeon-rootvault', closedFlags);
  const closedY = actorFloor('dungeon-rootvault', chest.x, chest.z, 3);
  updateCollisionSceneState('dungeon-rootvault', { ...closedFlags, [`object:${chest.id}`]: true });
  const openY = actorFloor('dungeon-rootvault', chest.x, chest.z, 3);
  assert(Math.abs(closedY - openY) > .1, 'live object flags switch actual hinged chest support');
  results.dungeon = { chest: chest.id, closedY, openY, roomBoundaryBlocked: true };
  assert.deepEqual(errors, [], 'no browser exceptions');
  await writeFile(join(output, 'proof.json'), JSON.stringify({ passed: true, fixtures, roofY, results }, null, 2) + '\n');
  console.log(`PASS solid-world browser/server: rock climb and energy, jump from rock/roof, ceiling, step-off, roof reconnect, forged height rejection, room boundaries and actual chest poses. Evidence: ${output}`);
} catch (error) {
  console.error('Browser errors:', errors);
  const failed = await state().catch(() => null);
  await writeFile(join(output, 'failure-state.json'), JSON.stringify(failed, null, 2));
  console.error(JSON.stringify(failed && { player: { x: failed.player?.x, z: failed.player?.z, jump: failed.player?.jump, travel: failed.player?.travel }, states: failed.states.slice(-12), sent: failed.sent }, null, 2));
  await screenshot('failure').catch(() => {});
  throw error;
} finally {
  await browser?.close(); await vite?.close(); await game.stop();
  await rm(directory, { recursive: true, force: true });
}
