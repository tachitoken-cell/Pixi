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
import { HEARTHLING_NPC, MEADGOD_QUEST_COST } from '../src/hearthling.ts';
import { CHAPTERS } from '../src/content.ts';
import { COMMUNITY_VERSION } from '../src/community.ts';
import { starterGear } from '../src/progression.ts';
import { newBags } from '../src/bags.ts';
import { newContracts } from '../src/adventure.ts';
import { newOnboarding } from '../src/onboarding.ts';

// Two isolated fixture accounts exercise real UI/server actions without changing a live realm.
const root = fileURLToPath(new URL('../', import.meta.url)), output = join(root, 'artifacts/hearthling');
const directory = await mkdtemp(join(tmpdir(), 'mossvale-hearthling-browser-')), session = `hearthling-${process.pid}`;
const fixtures = Object.fromEntries(['poor', 'payer'].map(phase => {
  const token = randomBytes(32).toString('base64url'), key = createHash('sha256').update(token).digest('hex');
  return [phase, { token, key, player: { id: randomUUID(), name: `Pons ${phase === 'poor' ? 'Visitor' : 'Lover'}`,
    x: HEARTHLING_NPC.x, z: HEARTHLING_NPC.z + 1.8, zone: HEARTHLING_NPC.zone, coordinateVersion: 2, rotation: Math.PI,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
    characterCreated: true, talents: [], ...starterGear('Ranger'), ...newBags(), level: 60, xp: 0, gold: MEADGOD_QUEST_COST - (phase === 'poor' ? 1 : 0), hp: 808, maxHp: 808,
    inventory: { wood: 9, crystal: 8, herb: 11, potion: 0, relic: 0 }, carriedItems: {}, skills: { mining: 0, woodcutting: 0, herbalism: 0 }, craftingXp: 0, contracts: newContracts(),
    onboarding: { ...newOnboarding(), looted: true, bagViewed: true, gearViewed: true, completed: true },
    ownedPets: ['moss-fox'], summonedPet: 'moss-fox', title: null, meadGodPaid: false,
    quest: { chapter: 0, stage: 0, kills: 0, crystals: 0, progress: Object.fromEntries(CHAPTERS[0].objectives.map(objective => [objective.id, 0])), completed: false, ending: null },
  } }];
}));
await writeFile(join(directory, 'players.json'), JSON.stringify(Object.fromEntries(Object.values(fixtures).map(({ key, player }) => [key, { characters: [player], communityRulesVersion: COMMUNITY_VERSION }]))));
await mkdir(output, { recursive: true });
const run = promisify(execFile);
const browser = async (...args) => (await run('npx', ['--no-install', 'agent-browser', '--session', session, ...args], { cwd: root, timeout: 60000, maxBuffer: 2_000_000 })).stdout;
const evaluate = async source => JSON.parse(await browser('eval', `(()=>{const check=(ok,message)=>{if(!ok)throw Error(message)};${source}})()`));
const game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: directory, databaseUrl: '', keycloak: null });
let vite, saveBlocked = false;
try {
  const port = await game.start();
  vite = await createVite({ root, configFile: false, logLevel: 'error', cacheDir: join(directory, 'vite'),
    server: { host: '127.0.0.1', port: 0, hmr: false, proxy: { '/socket': { target: `ws://127.0.0.1:${port}`, ws: true }, '/api': `http://127.0.0.1:${port}` } },
    plugins: [{ name: 'hearthling-proof', configureServer(server) {
      server.middlewares.use('/__hearthling-proof', (req, res) => {
        const fixture = fixtures[new URL(req.url, 'http://localhost').searchParams.get('phase') || 'poor'];
        if (!fixture) { res.statusCode = 404; res.end(); return; }
        res.setHeader('Content-Type', 'text/html');
        res.end(`<script>localStorage.setItem('mossvale-session',${JSON.stringify(fixture.token)});localStorage.setItem('hearthling-proof-id',${JSON.stringify(fixture.player.id)});localStorage.setItem('mossvale-graphics',JSON.stringify({resolution:1,renderDistance:120,shadows:'low',textures:'high',effects:'low',bloom:true,reflections:false}));location.replace('/');</script>`);
      });
    }, transformIndexHtml: { order: 'pre', handler: () => [{ tag: 'script', injectTo: 'head-prepend', children: `performance.setResourceTimingBufferSize(5000);window.hearthProof={sent:[],messages:[],player:null};const NativeSocket=WebSocket;window.WebSocket=class extends NativeSocket{constructor(...args){super(...args);window.hearthProofSocket=this;this.addEventListener('message',event=>{const value=JSON.parse(event.data);if(value.type==='snapshot')hearthProof.player=value.players.find(player=>player.id===localStorage.getItem('hearthling-proof-id'))||hearthProof.player;else if(value.type==='dialogue'||value.type==='event')hearthProof.messages.push(value)});}send(data){try{const value=JSON.parse(data);if(['meadGodQuest','selectTitle','interact'].includes(value.type))hearthProof.sent.push(value)}catch{}super.send(data)}};` }] } }],
  });
  await vite.listen(); const base = vite.resolvedUrls.local[0];
  async function enter(phase) {
    await browser('open', `${base}__hearthling-proof?phase=${phase}`);
    await browser('wait', '--fn', "!document.querySelector('#loading') && !document.querySelector('#login-guest').hidden");
    await browser('snapshot', '-i'); await browser('click', '#login-guest');
    await browser('wait', '--fn', "!document.querySelector('#roster-enter').disabled");
    await browser('click', '#roster-enter');
    await browser('wait', '--fn', "!document.body.classList.contains('at-roster') && document.querySelector('#game').dataset.connected==='true' && hearthProof.player");
    await evaluate("check(document.body.innerText.trim().length>0,'meaningful game content');check(!document.querySelector('vite-error-overlay'),'no Vite error overlay');return true;");
  }
  await browser('set', 'viewport', '1440', '1000');
  await enter('poor');
  await browser('wait', '--fn', "performance.getEntriesByType('resource').some(entry=>entry.name.includes('/models/hearthling.glb'))");
  await browser('wait', '--fn', "Number(getComputedStyle(document.querySelector('#region-intro')).opacity)<0.01");
  await browser('screenshot', join(output, 'npc-in-game.png'));
  await browser('press', 'e');
  await browser('wait', '--fn', "document.querySelector('#hearthling-action')?.dataset.hearthlingAction==='pay'");
  await browser('snapshot', '-i');
  await evaluate(`check(hearthProof.sent.some(message=>message.type==='interact'&&message.targetId===${JSON.stringify(HEARTHLING_NPC.id)}),'E targets MEADGod');check(hearthProof.messages.some(message=>message.type==='dialogue'&&message.npcId===${JSON.stringify(HEARTHLING_NPC.id)}),'real server NPC dialogue');check(document.querySelector('#panel').innerText.includes('MEADGod'),'exact NPC name shown');check(!/One-time quest|This is a one-time payment for your character/i.test(document.querySelector('#panel').innerText),'removed one-time phrases are absent from actual dialogue');check(document.querySelector('#hearthling-action').disabled,'99,999 gold cannot pay 100,000');check(document.querySelector('#panel').innerText.includes('100,000'),'exact cost shown');return true;`);
  await browser('screenshot', join(output, 'npc-dialogue-desktop.png'));
  await evaluate("document.querySelector('#hearthling-action').click();check(!hearthProof.sent.some(message=>message.type==='meadGodQuest'),'unaffordable payment cannot submit');check(hearthProof.player.gold===99999&&!hearthProof.player.meadGodPaid,'insufficient balance unchanged');return true;");
  await browser('press', 'Escape'); await browser('press', 'j');
  await browser('wait', '--fn', "document.querySelector('[data-open-hearthling]')!==null");
  await browser('snapshot', '-i'); await browser('click', '[data-open-hearthling]');
  await browser('wait', '--fn', "document.querySelector('#hearthling-action')?.dataset.hearthlingAction==='pay'");
  await browser('set', 'viewport', '390', '844');
  await evaluate("document.body.classList.add('mobile-controls');const panel=document.querySelector('#panel'),r=panel.getBoundingClientRect(),title=panel.querySelector('h2').getBoundingClientRect(),portrait=panel.querySelector('.trainer-portrait').getBoundingClientRect();check(r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,'quest panel fits phone');check(panel.scrollWidth<=panel.clientWidth+1,'no horizontal panel overflow');check(title.left>=portrait.right,'mobile portrait does not cover the NPC name');return true;");
  await browser('screenshot', join(output, 'npc-dialogue-mobile.png'));
  await browser('click', '[data-close-hearthling]'); await browser('click', '#mobile-interact');
  await browser('wait', '--fn', "document.querySelector('#hearthling-action')?.dataset.hearthlingAction==='pay'");
  assert.equal((await browser('errors')).trim(), '', 'no browser exceptions in unaffordable quest');

  await browser('set', 'viewport', '1440', '1000');
  await enter('payer');
  await browser('wait', '--fn', "Number(getComputedStyle(document.querySelector('#region-intro')).opacity)<0.01");
  await browser('press', 'e');
  await browser('wait', '--fn', "document.querySelector('#hearthling-action')?.disabled===false");
  await browser('snapshot', '-i');
  await mkdir(join(directory, 'players.json.tmp')); saveBlocked = true;
  await browser('click', '#hearthling-action');
  await browser('wait', '--fn', "document.querySelector('#hearthling-action')?.disabled===false && document.querySelector('#hearthling-status')?.textContent.includes('could not be saved')");
  await evaluate("check(hearthProof.messages.some(message=>message.requestType==='meadGodQuest'&&message.kind==='info'&&message.text.includes('could not be saved')),'save failure correlated to this quest');check(!hearthProof.player.meadGodPaid&&hearthProof.player.gold===100000,'failed payment keeps gold and quest unchanged');check(hearthProof.player.title===null,'failed payment does not equip title');check(document.querySelector('#hearthling-action').textContent.includes('100,000'),'failed payment permits retry');return true;");
  const failedSave = JSON.parse(await readFile(join(directory, 'players.json'), 'utf8'))[fixtures.payer.key].characters[0];
  assert.equal(failedSave.meadGodPaid, false); assert.equal(failedSave.gold, 100000); assert.equal(failedSave.title, null);
  await rm(join(directory, 'players.json.tmp'), { recursive: true }); saveBlocked = false;
  await evaluate("const before=hearthProof.sent.filter(message=>message.type==='meadGodQuest').length,button=document.querySelector('#hearthling-action');button.click();check(document.querySelector('#hearthling-action').disabled,'payment disabled while saving');button.click();check(hearthProof.sent.filter(message=>message.type==='meadGodQuest').length===before+1,'double click sends only one payment');check(!hearthProof.player.meadGodPaid&&hearthProof.player.gold===100000,'pending payment is not optimistic');return true;");
  await browser('wait', '--fn', "hearthProof.player?.meadGodPaid===true && document.querySelector('[data-open-titles]')!==null");
  await evaluate("check(hearthProof.player.gold===0,'exactly 100,000 gold deducted');check(hearthProof.player.title===null,'new title is not autoequipped');check(hearthProof.player.ownedPets.length===1&&hearthProof.player.summonedPet==='moss-fox','pet ownership and summon unchanged');check(hearthProof.player.inventory.wood===9&&hearthProof.player.inventory.crystal===8&&hearthProof.player.inventory.herb===11,'materials retained');return true;");
  await browser('screenshot', join(output, 'quest-complete-desktop.png'));
  await evaluate("hearthProof.messages=[];hearthProofSocket.send(JSON.stringify({type:'meadGodQuest'}));return true;");
  await browser('wait', '--fn', "hearthProof.messages.some(message=>message.requestType==='meadGodQuest'&&message.kind==='info')");
  await evaluate("check(hearthProof.player.gold===0&&hearthProof.player.meadGodPaid,'replayed payment changes nothing');return true;");
  const saved = JSON.parse(await readFile(join(directory, 'players.json'), 'utf8'))[fixtures.payer.key].characters[0];
  assert.equal(saved.meadGodPaid, true); assert.equal(saved.gold, 0); assert.equal(saved.title, null);
  await browser('click', '[data-open-titles]');
  await browser('wait', '--fn', "document.querySelector('#achievement-title option[value=\"pons-lover\"]')?.disabled===false");
  await browser('snapshot', '-i'); await browser('select', '#achievement-title', 'pons-lover');
  await browser('wait', '--fn', "hearthProof.player?.title==='pons-lover' && document.querySelector('#achievement-title')?.disabled===false");
  await browser('screenshot', join(output, 'pons-lover-equipped-desktop.png'));
  assert.equal((await browser('errors')).trim(), '', 'no browser exceptions in completed quest');
  await writeFile(join(output, 'browser-check.json'), JSON.stringify({ passed: true, npc: HEARTHLING_NPC.name, cost: MEADGOD_QUEST_COST, checks: ['world GLB loaded', 'E opens real NPC dialogue without removed one-time phrases', '99,999 gold cannot pay', 'double click prevented', 'journal discovery', 'phone fit, readable NPC header and touch interaction', 'failed save keeps gold/title unchanged and enables retry with inline error', 'retry deducts exactly 100,000 gold and permanently unlocks title', 'pet ownership and materials unchanged', 'replayed payment rejected', 'title not autoequipped', 'Pons Lover equipped through real title selector'], fixture: 'isolated characters with 99,999 and exactly 100,000 gold; temporary save-path blocker for failed payment' }, null, 2) + '\n');
  await rm(join(output, 'browser-failure.png'), { force: true });
  await rm(join(output, 'pet-unlocked-desktop.png'), { force: true });
  console.log(`PASS MEADGod browser: actual NPC, exact payment, failure/retry, permanent title unlock, title picker and replay protection. Screenshots: ${output}`);
} catch (error) {
  console.error(await browser('errors').catch(() => ''));
  console.error(await browser('snapshot', '-i').catch(() => ''));
  await browser('screenshot', join(output, 'browser-failure.png')).catch(() => {});
  throw error;
} finally {
  await browser('close').catch(() => {}); await vite?.close();
  if (saveBlocked) await rm(join(directory, 'players.json.tmp'), { recursive: true });
  await game.stop(); await rm(directory, { recursive: true, force: true });
}
