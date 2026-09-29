import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
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
import { groundHeight } from '../src/landscape.ts';
import { regionAt } from '../src/realm.ts';

// Run against an isolated temporary realm. MOSSVALE_PLAYWRIGHT may point to the
// existing workspace runtime; MOSSVALE_CHROME may point to installed Chrome.
const { chromium } = await import(process.env.MOSSVALE_PLAYWRIGHT || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'mossvale-climbing-browser-'));
const output = process.env.CLIMBING_PROOF_DIR || join(root, 'artifacts/climbing');
const token = randomBytes(32).toString('base64url'), id = randomUUID();
const spawn = { x: -2, z: -95.75 }, floor = groundHeight(spawn.x, spawn.z);
const player = {
  id, name: 'Climbing proof', ...spawn, zone: regionAt(spawn.x, spawn.z), coordinateVersion: 2, rotation: Math.PI,
  appearance: { ...DEFAULT_APPEARANCE }, characterCreated: true, ...starterGear('Ranger'),
  level: 60, hp: 808, maxHp: 808, xp: 0, gold: 0, talents: [],
  inventory: { wood: 0, crystal: 0, herb: 0, potion: 3, relic: 0 },
  onboarding: { ...newOnboarding(), completed: true, looted: true, bagViewed: true, gearViewed: true },
  quest: { stage: 0, kills: 0, crystals: 0 },
};
await writeFile(join(directory, 'players.json'), JSON.stringify({
  [createHash('sha256').update(token).digest('hex')]: { characters: [player], communityRulesVersion: COMMUNITY_VERSION },
}));
await mkdir(output, { recursive: true });
const game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: directory, databaseUrl: '', keycloak: null });
const gallery = `<!doctype html><html><head><meta charset="utf-8"><title>All playable models climbing</title><style>
body{margin:0;background:#162923;color:#f0e6c9;font:15px system-ui}canvas{position:absolute;inset:0}#labels{position:absolute;inset:0;display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(9,1fr);pointer-events:none}#labels div{padding:12px;text-align:center;border:1px solid #f0e6c920;box-sizing:border-box}
</style></head><body><div id="labels"></div><script type="module">
import * as THREE from 'three';
import {loadCharacterAssets,makeCharacter,animateCharacter} from '/src/characters.ts';
import {RACES,GENDERS,DEFAULT_APPEARANCE} from '/src/appearance.ts';
import {starterGear} from '/src/progression.ts';
await loadCharacterAssets();
const scene=new THREE.Scene(),renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);renderer.setClearColor('#162923');renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.prepend(renderer.domElement);
scene.add(new THREE.HemisphereLight('#fff6df','#497963',3));const light=new THREE.DirectionalLight('#ffe4bb',4);light.position.set(-4,8,12);scene.add(light);
const width=22.4,height=28.8,camera=new THREE.OrthographicCamera(-width/2,width/2,height/2,-height/2,.1,100);camera.position.set(0,0,40);camera.lookAt(0,0,0);
const models=[];for(const [row,race]of RACES.entries())for(const [genderIndex,gender]of GENDERS.entries())for(const [classIndex,className]of ['Ranger','Knight','Mage','Cleric'].entries()){
 const col=genderIndex*4+classIndex,model=makeCharacter({...DEFAULT_APPEARANCE,race:race.id,gender:gender.id,className},starterGear(className).equipment);
 model.position.set((col-3.5)*2.8,(4-row)*3.2-1.2,0);model.scale.setScalar(.86);model.rotation.y=.65;scene.add(model);models.push({model,race:race.id,gender:gender.id,className});
 const label=document.createElement('div');label.textContent=race.label+' · '+gender.label+' · '+className;document.querySelector('#labels').append(label);
}
window.renderProof=time=>{let finite=true,hiddenTools=true;const poses=[];
 for(const {model,race,gender,className}of models){animateCharacter(model,time,true,false,undefined,false,{climbing:true});model.updateMatrixWorld(true);model.traverse(node=>{finite&&=node.matrixWorld.elements.every(Number.isFinite)});const rig=model.userData.rig;hiddenTools&&=rig.classGear.every(gear=>!gear.visible);poses.push({race,gender,className,arm:rig.leftArm.quaternion.toArray(),leg:rig.rightLeg.quaternion.toArray()});}
 renderer.render(scene,camera);return {count:models.length,finite,hiddenTools,triangles:renderer.info.render.triangles,poses};};
renderProof(0);window.galleryReady=true;
</script></body></html>`;
let vite, browser, page;
const errors = [];
try {
  const port = await game.start();
  vite = await createVite({ root, configFile: false, logLevel: 'error', cacheDir: join(directory, 'vite'),
    server: { host: '127.0.0.1', port: 0, hmr: false, proxy: { '/socket': { target: `ws://127.0.0.1:${port}`, ws: true }, '/api': `http://127.0.0.1:${port}` } },
    plugins: [{ name: 'climbing-model-gallery', configureServer(server) { server.middlewares.use('/__climbing-models', async (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(await server.transformIndexHtml('/__climbing-models', gallery)); }); } }],
  });
  await vite.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.MOSSVALE_CHROME ? { executablePath: process.env.MOSSVALE_CHROME } : {}) });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ token, id }) => {
    localStorage.setItem('mossvale-session', token);
    localStorage.setItem('mossvale-graphics', JSON.stringify({ resolution: 1, renderDistance: 120, shadows: 'low', textures: 'high', effects: 'low', bloom: false, reflections: false }));
    window.climbingProof = { sent: [], states: [], player: null };
    const NativeSocket = WebSocket;
    window.WebSocket = class extends NativeSocket {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', event => {
          const message = JSON.parse(event.data);
          if (message.type !== 'snapshot') return;
          const player = message.players.find(player => player.id === id);
          if (!player) return;
          climbingProof.player = player;
          climbingProof.states.push({ x: player.x, z: player.z, y: player.jump?.y, grounded: player.jump?.grounded, climb: player.jump?.climb, stamina: player.travel?.stamina });
          if (climbingProof.states.length > 400) climbingProof.states.shift();
        });
      }
      send(data) {
        const message = JSON.parse(data);
        if (['climb', 'climbStop', 'jump'].includes(message.type)) climbingProof.sent.push(message);
        super.send(data);
      }
    };
  }, { token, id });
  await page.goto(vite.resolvedUrls.local[0]);
  await page.waitForFunction(() => !document.querySelector('#loading') && !document.querySelector('#login-guest').hidden, undefined, { timeout: 120000 });
  await page.locator('#login-guest').click();
  await page.locator('#roster-enter').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('#roster-enter').disabled);
  await page.locator('#roster-enter').click();
  await page.waitForFunction(() => !document.body.classList.contains('at-roster') && document.querySelector('#game').dataset.connected === 'true' && climbingProof.player, undefined, { timeout: 120000 });
  await page.waitForFunction(() => document.querySelector('#region-intro').textContent && Number(getComputedStyle(document.querySelector('#region-intro')).opacity) < .01);
  await page.screenshot({ path: join(output, 'climbing-before.png') });
  await page.keyboard.down('w');
  await page.waitForFunction(() => climbingProof.player?.jump?.climb && climbingProof.player.travel.stamina < 100, undefined, { timeout: 10000 });
  assert.equal(await page.locator('#stamina-label').textContent(), 'Climbing', 'energy HUD names climbing');
  await page.screenshot({ path: join(output, 'climbing-active.png') });
  await page.waitForFunction(floor => !climbingProof.player?.jump?.climb && climbingProof.player?.jump?.grounded && climbingProof.player.jump.y > floor + .5, floor, { timeout: 10000 });
  await page.keyboard.up('w');
  await page.screenshot({ path: join(output, 'climbing-complete.png') });
  const proof = await page.evaluate(() => ({ sent: climbingProof.sent, states: climbingProof.states, player: climbingProof.player }));
  assert(proof.sent.some(message => message.type === 'climb'), 'walking into a ledge sends a climbing request');
  assert(proof.states.some(state => state.climb && !state.grounded && state.stamina < 100), 'authoritative climbing is airborne and consumes energy');
  assert(proof.states.some(state => state.climb && state.y > floor), 'server advances climbing height');
  assert(proof.player.jump.grounded && proof.player.jump.y > floor + .5, 'climber lands on the upper terrace');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.body.classList.add('mobile-controls'); document.querySelector('#chat').classList.add('collapsed'); });
  const stick = await page.locator('#mobile-joystick').boundingBox();
  assert(stick, 'mobile movement joystick is visible');
  const nextFloor = proof.player.jump.y;
  await page.mouse.move(stick.x + stick.width / 2, stick.y + stick.height / 2);
  await page.mouse.down();
  await page.mouse.move(stick.x + stick.width / 2, stick.y + stick.height / 2 - 40);
  await page.waitForFunction(floor => climbingProof.player?.jump?.climb && climbingProof.player.jump.y > floor + .12, nextFloor, { timeout: 10000 });
  await page.screenshot({ path: join(output, 'climbing-mobile.png') });
  await page.mouse.up();
  await page.waitForFunction(() => climbingProof.sent.some(message => message.type === 'climbStop') && !climbingProof.player?.jump?.climb && climbingProof.player?.jump?.grounded, undefined, { timeout: 10000 });
  const dropped = await page.evaluate(() => ({ ...climbingProof.player.jump, stamina: climbingProof.player.travel.stamina }));
  assert.equal(dropped.y, nextFloor, 'releasing the mobile joystick drops to the lower terrace');
  await page.screenshot({ path: join(output, 'climbing-released.png') });
  await page.setViewportSize({ width: 2400, height: 2880 });
  await page.goto(new URL('/__climbing-models', vite.resolvedUrls.local[0]).href);
  await page.waitForFunction(() => window.galleryReady, undefined, { timeout: 60000 });
  const poses = [];
  for (const time of [0, .45]) {
    const result = await page.evaluate(time => renderProof(time), time);
    assert.equal(result.count, 72, 'all nine races, two genders and four classes render');
    assert(result.finite && result.hiddenTools && result.triangles > 10000, 'all models have finite transforms and climbing stows held equipment');
    poses.push(result);
    await page.screenshot({ path: join(output, `climbing-models-${time === 0 ? 'reach' : 'pull'}.png`) });
  }
  poses[0].poses.forEach((pose, i) => assert.notDeepEqual(pose.arm, poses[1].poses[i].arm, `${pose.race}/${pose.gender}/${pose.className} animates between phases`));
  assert.deepEqual(errors, [], 'no browser exceptions');
  await writeFile(join(output, 'browser-check.json'), JSON.stringify({ passed: true, fixture: spawn, floor, final: { x: proof.player.x, z: proof.player.z, y: proof.player.jump.y, stamina: proof.player.travel.stamina }, mobileDrop: dropped, models: poses, requests: proof.sent, states: proof.states }, null, 2) + '\n');
  console.log(`PASS climbing browser: full login/roster, keyboard ascent, authoritative energy drain and landing, mobile joystick release/drop, all 72 models in two climbing phases. Screenshots: ${output}`);
} catch (error) {
  console.error('Browser errors:', errors);
  console.error(await page?.evaluate(() => ({ text: document.body.innerText.slice(-2000), proof: window.climbingProof })).catch(() => null));
  await page?.screenshot({ path: join(output, 'climbing-failure.png') }).catch(() => {});
  throw error;
} finally {
  await browser?.close(); await vite?.close(); await game.stop();
  await rm(directory, { recursive: true, force: true });
}
