import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createServer as createVite } from 'vite';
import { createGameServer } from '../server.mjs';
import { POLLS } from '../src/polls.ts';
import { POLL_BOOTHS } from '../src/poll-booths.ts';
import { CHAPTERS } from '../src/content.ts';
import { COMMUNITY_VERSION } from '../src/community.ts';
import { starterGear } from '../src/progression.ts';
import { newBags } from '../src/bags.ts';
import { newContracts } from '../src/adventure.ts';

// Real client and local WebSocket server; temporary accounts never touch a realm.
const root = fileURLToPath(new URL('../', import.meta.url)), output = join(root, 'artifacts/polls');
const directory = await mkdtemp(join(tmpdir(), 'mossvale-poll-game-')), session = `poll-game-${process.pid}`;
const token = randomBytes(32).toString('base64url'), key = createHash('sha256').update(token).digest('hex');
const booth = POLL_BOOTHS[0], now = Date.now();
const poll = { ...POLLS[0], opensAt: now - 60000, closesAt: now + 3600000 };
const player = { id: randomUUID(), name: 'Booth Tester', x: booth.x, z: booth.z + 1.5, zone: booth.zone, coordinateVersion: 2, rotation: Math.PI,
  appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
  characterCreated: true, talents: [], ...starterGear('Ranger'), ...newBags(), level: 60, xp: 0, gold: 0, hp: 808, maxHp: 808,
  inventory: { wood: 0, crystal: 0, herb: 0, potion: 0, relic: 0 }, carriedItems: {}, skills: { mining: 0, woodcutting: 0, herbalism: 0 }, craftingXp: 0, contracts: newContracts(),
  quest: { chapter: 0, stage: 0, kills: 0, crystals: 0, progress: Object.fromEntries(CHAPTERS[0].objectives.map(o => [o.id, 0])), completed: false, ending: null } };
await writeFile(join(directory, 'players.json'), JSON.stringify({ [key]: { characters: [player], communityRulesVersion: COMMUNITY_VERSION } }));
await mkdir(output, { recursive: true });
const run = promisify(execFile);
const browser = async (...args) => (await run('npx', ['--no-install', 'agent-browser', '--session', session, ...args], { cwd: root, timeout: 60000, maxBuffer: 2_000_000 })).stdout;
const evaluate = async source => JSON.parse(await browser('eval', `(()=>{const check=(ok,message)=>{if(!ok)throw Error(message)};${source}})()`));
const game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: directory, databaseUrl: '', keycloak: null, polls: [poll] });
let vite;
try {
  const port = await game.start();
  vite = await createVite({ root, configFile: false, logLevel: 'error', cacheDir: join(directory, 'vite'),
    server: { host: '127.0.0.1', port: 0, proxy: { '/socket': { target: `ws://127.0.0.1:${port}`, ws: true }, '/api': `http://127.0.0.1:${port}` } },
    plugins: [{ name: 'poll-proof', configureServer(server) {
      server.middlewares.use('/__poll-proof', (_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<script>localStorage.setItem('mossvale-session',${JSON.stringify(token)});localStorage.setItem('mossvale-graphics',JSON.stringify({resolution:1,renderDistance:120,shadows:'low',textures:'high',effects:'low',bloom:true,reflections:false}));location.replace('/');</script>`);
      });
    }, transformIndexHtml: { order: 'pre', handler: () => [{ tag: 'script', injectTo: 'head-prepend', children: `performance.setResourceTimingBufferSize(5000);window.pollProofMessages=[];window.pollProofSent=[];const NativeSocket=WebSocket;window.WebSocket=class extends NativeSocket{constructor(...args){super(...args);this.addEventListener('message',event=>{const value=JSON.parse(event.data);if(value.type==='polls')pollProofMessages.push(value)});}send(data){try{const value=JSON.parse(data);if(value.type.startsWith('poll'))pollProofSent.push(value)}catch{}super.send(data)}};` }] } }],
  });
  await vite.listen(); const base = vite.resolvedUrls.local[0];
  await browser('set', 'viewport', '1440', '1000');
  await browser('open', `${base}__poll-proof`);
  await browser('wait', '--fn', "!document.querySelector('#loading') && !document.querySelector('#login-guest').hidden");
  await browser('snapshot', '-i'); await browser('click', '#login-guest');
  await browser('wait', '--fn', "!document.querySelector('#roster-enter').disabled");
  await browser('click', '#roster-enter');
  await browser('wait', '--fn', "!document.body.classList.contains('at-roster') && document.querySelector('#game').dataset.connected==='true'");
  await browser('screenshot', join(output, 'booth-in-game.png'));
  await browser('press', 'e');
  await browser('wait', '--fn', "document.querySelector('#poll-window')?.hidden===false");
  await browser('snapshot', '-i');
  await evaluate(`check(pollProofSent.some(message=>message.type==='pollOpen'&&message.boothId===${JSON.stringify(booth.id)}),'E uses the real polling booth');check(pollProofMessages.at(-1).polls[0].title==='Stake MOSS?','actual server catalog shown');check(!pollProofMessages.at(-1).polls[0].results,'live totals hidden');check(performance.getEntriesByType('resource').some(entry=>entry.name.includes('/models/poll-booth.glb')),'authored Blender model loaded');return true;`);
  await browser('screenshot', join(output, 'stake-moss-in-game.png'));
  await browser('check', '#poll-answer-0-yes'); await browser('click', '#poll-review');
  await evaluate("check(pollProofSent.every(message=>message.type!=='pollVote'),'review has not submitted');return true;");
  await browser('click', '#poll-submit');
  await browser('wait', '--fn', "document.querySelector('.poll-receipt')!==null");
  const saved = JSON.parse(await readFile(join(directory, 'polls.json'), 'utf8'));
  assert.equal(saved.ballots.length, 1); assert.equal(saved.ballots[0].accountKey, key); assert.equal(saved.ballots[0].answers['add-staking'], 'yes');
  await browser('press', 'Escape');
  await evaluate("check(document.querySelector('#poll-window').hidden,'Escape closes real game poll');return true;");
  await browser('press', 'e'); await browser('wait', '--fn', "document.querySelector('.poll-receipt')!==null");
  await evaluate("check(!document.querySelector('#poll-submit')&&!document.querySelector('input[data-poll-question]'),'reopening preserves final account ballot');return true;");
  await browser('set', 'viewport', '390', '844');
  await evaluate("document.body.classList.add('mobile-controls');const panel=document.querySelector('#poll-window'),r=panel.getBoundingClientRect();check(r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,'poll panel fits phone');check(panel.scrollWidth<=panel.clientWidth,'no panel overflow');return true;");
  await browser('screenshot', join(output, 'stake-moss-mobile-in-game.png'));
  await browser('click', '#poll-close');
  await browser('click', '#mobile-interact');
  await browser('wait', '--fn', "document.querySelector('.poll-receipt')!==null");
  assert.equal((await browser('errors')).trim(), '', 'no browser exceptions');
  await writeFile(join(output, 'game-check.json'), JSON.stringify({ passed: true, poll: poll.id, booth: booth.id, checks: ['actual Blender GLB loaded', 'keyboard booth interaction', 'server ballot and hidden results', 'review before submit', 'durable account vote', 'reopen receipt', 'mobile fit and touch interaction'], fixture: 'isolated local account and poll dates' }, null, 2) + '\n');
  console.log(`PASS real game poll: rendered Blender booth, E and mobile interaction, review, durable vote, reopen receipt, desktop/mobile layout. Screenshots: ${output}`);
} catch (error) {
  console.error(await browser('errors').catch(() => ''));
  console.error(await browser('snapshot', '-i').catch(() => ''));
  await browser('screenshot', join(output, 'game-failure.png')).catch(() => {});
  throw error;
} finally {
  await browser('close').catch(() => {}); await vite?.close(); await game.stop(); await rm(directory, { recursive: true, force: true });
}
