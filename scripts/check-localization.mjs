import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createServer as createVite } from 'vite';
import { createGameServer } from '../server.mjs';
import { CHAPTERS } from '../src/content.ts';
import { POLL_BOOTHS } from '../src/poll-booths.ts';
import { COMMUNITY_VERSION } from '../src/community.ts';
import { GEAR, rollGear, starterGear } from '../src/progression.ts';
import { newBags } from '../src/bags.ts';
import { newContracts } from '../src/adventure.ts';
import { preferredLanguage, translateText } from '../src/localization.ts';
import { UI_ZH, UI_PATTERNS } from '../src/locales/zh-CN-ui.ts';
import { GAME_ZH, GAME_PATTERNS } from '../src/locales/zh-CN-game.ts';
import { UI_ID, UI_ID_PATTERNS } from '../src/locales/id-ui.ts';
import { GAME_ID, GAME_ID_PATTERNS } from '../src/locales/id-game.ts';

assert.equal(preferredLanguage(null, ['zh-CN', 'en']), 'zh-CN');
assert.equal(preferredLanguage(null, ['en-US', 'zh-CN']), 'en');
assert.equal(preferredLanguage('en', ['zh-CN']), 'en');
assert.equal(preferredLanguage('zh-CN', ['sv-SE']), 'zh-CN');
assert.equal(preferredLanguage('invalid', ['sv-SE']), 'en');
assert.equal(preferredLanguage(null, ['id-ID', 'en']), 'id');
assert.equal(preferredLanguage(null, ['sv-SE', 'ID', 'zh-CN']), 'id');
assert.equal(preferredLanguage(null, ['en-US', 'id-ID']), 'en');
assert.equal(preferredLanguage(null, ['zh-TW', 'id-ID']), 'zh-CN');
assert.equal(preferredLanguage('id', ['en-US']), 'id');
assert.equal(preferredLanguage('en', ['id-ID']), 'en');
assert.equal(preferredLanguage('invalid', ['id-ID']), 'id');
assert.equal(preferredLanguage(null, []), 'en');
assert.deepEqual(Object.keys(UI_ID).sort(), Object.keys(UI_ZH).sort(), 'Indonesian UI catalog parity');
assert.deepEqual(Object.keys(GAME_ID).sort(), Object.keys(GAME_ZH).sort(), 'Indonesian game catalog parity');
assert.deepEqual(UI_ID_PATTERNS.map(([source]) => source), UI_PATTERNS.map(([source]) => source), 'Indonesian UI template parity');
assert.deepEqual(GAME_ID_PATTERNS.map(([source]) => source), GAME_PATTERNS.map(([source]) => source), 'Indonesian game template parity');
for (const [source, translated] of [...Object.entries(UI_ZH), ...Object.entries(GAME_ZH), ...UI_PATTERNS, ...GAME_PATTERNS, ...Object.entries(UI_ID), ...Object.entries(GAME_ID), ...UI_ID_PATTERNS, ...GAME_ID_PATTERNS]) {
  assert(source.trim() && translated.trim(), `Empty translation: ${source}`);
  assert.deepEqual([...new Set(translated.match(/\{\d+\}/g) || [])].sort(), [...new Set(source.match(/\{\d+\}/g) || [])].sort(), `Template slots: ${source}`);
}
for (const locale of ['zh-CN', 'id']) {
  for (const phrase of ['Welcome to Mossvale', 'Language', 'Create character', 'Backpack', 'Ranger', 'Fireball']) {
    assert.notEqual(translateText(phrase, locale), phrase, `Translated ${locale}: ${phrase}`);
    assert.equal(translateText(phrase, 'en'), phrase);
  }
  assert.equal(translateText('An unpublished message', locale), 'An unpublished message');
  assert.equal(translateText('constructor', locale), 'constructor');
  assert.equal(translateText('I confirm', locale), 'I confirm');
  assert(translateText('Portal to Ranger', locale).includes('Ranger'), 'Template arguments stay verbatim');
  const baseGear = Object.values(GEAR).find(item => item.price > 0), rolledGear = rollGear(baseGear.id, 'rare', () => .5);
  assert.equal(translateText(`${rolledGear.label} +5`, locale), `${translateText('Rare', locale)} ${translateText(baseGear.label, locale)} +5`);
  assert(translateText(rolledGear.description, locale).startsWith(translateText(baseGear.description, locale)));
  assert(!translateText(rolledGear.description, locale).includes('Upgrade with'));
  assert.equal(translateText('Key 1 · 2s cast · 8m range', locale), ['Key 1', '2s cast', '8m range'].map(part => translateText(part, locale)).join(' · '));
}
assert.equal(translateText('  Language  ', 'zh-CN'), '  语言  ');
assert.equal(translateText('  Language  ', 'id'), '  Bahasa  ');
assert.equal(translateText('Lv 30 Ranger', 'zh-CN'), '30级 游侠');
assert(translateText('Lv 30 Ranger', 'id').includes('Penjelajah'));
for (const locale of ['id', 'zh-CN', 'en', 'id', 'zh-CN']) assert.equal(translateText('Backpack', locale), { id: 'Ransel', 'zh-CN': '背包', en: 'Backpack' }[locale], 'Cache stays scoped to the language');
if (process.argv.includes('--catalog-only')) { console.log('PASS localization catalog, templates, language preference and English fallback.'); process.exit(0); }

// Real client and WebSocket server with an isolated guest; no realm or real account is contacted.
const root = fileURLToPath(new URL('../', import.meta.url)), output = join(root, 'artifacts/localization');
const directory = await mkdtemp(join(tmpdir(), 'mossvale-localization-')), session = `localization-${process.pid}`;
const token = randomBytes(32).toString('base64url'), key = createHash('sha256').update(token).digest('hex');
const player = { id: randomUUID(), name: 'Ranger', x: POLL_BOOTHS[0].x, z: POLL_BOOTHS[0].z + 1.5, zone: POLL_BOOTHS[0].zone, coordinateVersion: 2, rotation: 0,
  appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
  characterCreated: true, talents: [], ...starterGear('Ranger'), ...newBags(), level: 30, xp: 0, gold: 100, hp: 448, maxHp: 448,
  inventory: { wood: 1, crystal: 0, herb: 0, potion: 1, relic: 0 }, carriedItems: {}, skills: { mining: 0, woodcutting: 0, herbalism: 0 }, craftingXp: 0, contracts: newContracts(),
  quest: { chapter: 0, stage: 0, kills: 0, crystals: 0, progress: Object.fromEntries(CHAPTERS[0].objectives.map(o => [o.id, 0])), completed: false, ending: null } };
await writeFile(join(directory, 'players.json'), JSON.stringify({ [key]: { characters: [player], communityRulesVersion: COMMUNITY_VERSION } }));
await mkdir(output, { recursive: true });
const run = promisify(execFile);
const browser = async (...args) => (await run('npx', ['--yes', 'agent-browser', '--session', session, ...args], { cwd: root, timeout: 60000, maxBuffer: 2_000_000 })).stdout;
const evaluate = async source => JSON.parse(await browser('eval', `(async()=>{const check=(ok,message)=>{if(!ok)throw Error(message)};${source}})()`));
const game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: directory, databaseUrl: '', keycloak: null });
let vite, locale;
try {
  const port = await game.start();
  vite = await createVite({ root, configFile: false, logLevel: 'error', cacheDir: join(directory, 'vite'),
    server: { host: '127.0.0.1', port: 0, proxy: { '/socket': { target: `ws://127.0.0.1:${port}`, ws: true }, '/api': `http://127.0.0.1:${port}` } },
    plugins: [{ name: 'localization-proof', configureServer(server) {
      server.middlewares.use('/__localization-proof', (_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<script>localStorage.setItem('mossvale-x-advertising-v1','denied');localStorage.setItem('mossvale-session',${JSON.stringify(token)});localStorage.setItem('mossvale-language',${JSON.stringify(locale)});location.replace('/');</script>`);
      });
    } }],
  });
  await vite.listen(); const base = vite.resolvedUrls.local[0];
  for (locale of ['zh-CN', 'id']) {
    await browser('set', 'viewport', '1440', '1000');
    await browser('open', `${base}__localization-proof`);
    await browser('wait', '--fn', "!document.querySelector('#loading') && !document.querySelector('#login-guest').hidden");
    await browser('snapshot', '-i');
    await evaluate(`check(document.documentElement.lang===${JSON.stringify(locale)},'document language');check(document.querySelector('#login-title').textContent===${JSON.stringify(translateText('Welcome to Mossvale', locale))},'translated login');check(document.querySelector('#login-language option[value="id"]').textContent==='Bahasa Indonesia','native language label');return true;`);
    await browser('screenshot', join(output, `${locale}-login-desktop.png`));
    await browser('set', 'viewport', '390', '844');
    await evaluate("const picker=document.querySelector('#login-language'),r=picker.getBoundingClientRect();check(r.x>=0&&r.right<=innerWidth&&r.top>=0,'mobile picker fits');check(picker===document.elementFromPoint(r.x+r.width/2,r.y+r.height/2),'picker unobstructed');return true;");
    await browser('screenshot', join(output, `${locale}-login-mobile.png`));
    await browser('set', 'viewport', '1440', '1000');
    await browser('click', '#login-guest');
    await browser('wait', '--fn', "!document.querySelector('#roster-enter').disabled");
    await evaluate("check(document.querySelector('.roster-character-copy strong').textContent==='Ranger','player name is not the class translation');check(document.querySelector('#roster-character-name').textContent==='Ranger','selected name preserved');return true;");
    await browser('click', '#roster-enter');
    await browser('wait', '--fn', "!document.body.classList.contains('at-roster') && document.querySelector('#game').dataset.connected==='true'");
    await browser('click', '#customize-button');
    await evaluate("check(document.querySelector('#panel-title').textContent==='Ranger','inventory title preserves name');check(document.querySelector('.character-identity strong').textContent==='Ranger','inventory name preserved');return true;");
    await browser('screenshot', join(output, `${locale}-inventory.png`));
    await browser('click', '#close-panel');
    await browser('click', '#pets-button');
    await browser('wait', '#collection-preview');
    await evaluate(`const canvas=document.querySelector('#collection-preview'),buttons=[...document.querySelectorAll('[data-collection-select]')],unchanged=buttons[2];buttons[1].click();check(document.querySelector('#collection-preview')===canvas,'collection keeps its preview');check([...document.querySelectorAll('[data-collection-select]')][2]===unchanged,'translated collection keeps unchanged controls');const picker=document.querySelector('#login-language');picker.value='en';picker.dispatchEvent(new Event('change',{bubbles:true}));check(canvas.getAttribute('aria-label').startsWith('3D preview of '),'retained preview restores English accessibility text');picker.value='${locale}';picker.dispatchEvent(new Event('change',{bubbles:true}));return true;`);
    await browser('click', '#close-panel');
    await browser('click', '#settings-button');
    await browser('click', '[data-settings-tab="language"]');
    await browser('screenshot', join(output, `${locale}-settings.png`));
    await browser('set', 'viewport', '390', '844');
    await evaluate("const picker=document.querySelector('#settings-language'),r=picker.getBoundingClientRect();check(r.x>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,'phone settings picker fits');return true;");
    await browser('screenshot', join(output, `${locale}-settings-mobile.png`));
    await browser('set', 'viewport', '1440', '1000');
    for (const switched of ['id', 'zh-CN']) {
      await browser('select', '#settings-language', switched);
      await evaluate(`check(document.documentElement.lang===${JSON.stringify(switched)},'switch between translations');check(document.querySelector('#panel-title').textContent===${JSON.stringify(translateText('Options', switched))},'correct catalog after switching');check(document.querySelector('#game').dataset.connected==='true','language switch keeps connection');return true;`);
    }
    await browser('select', '#settings-language', 'en');
    await evaluate("check(document.documentElement.lang==='en','switch to English');check(document.querySelector('#panel-title').textContent==='Options','original English restored');check(document.querySelector('#settings-language').value==='en','select value unchanged by translation');return true;");
    await browser('select', '#settings-language', locale);
    await evaluate(`const span=document.createElement('span');span.id='localization-dynamic';span.textContent='Backpack';span.title='Create character';document.body.append(span);const input=document.createElement('input');input.id='localization-input';input.value='Settings';input.placeholder='Choose a name';document.body.append(input);await new Promise(resolve=>setTimeout(resolve,0));check(span.textContent!=='Backpack'&&span.title!=='Create character','dynamic text and attributes translated');check(input.value==='Settings','typed input untouched');const picker=document.querySelector('#settings-language');picker.value='en';picker.dispatchEvent(new Event('change',{bubbles:true}));check(span.textContent==='Backpack'&&span.title==='Create character','dynamic English restored');picker.value='${locale}';picker.dispatchEvent(new Event('change',{bubbles:true}));span.remove();input.remove();return true;`);
    await browser('click', '#close-panel');
    await evaluate("document.querySelector('#chat-input').value='Settings';document.querySelector('#chat-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));return true;");
    await browser('wait', '--fn', "document.querySelector('#chat-log-world')?.textContent.includes('Settings')");
    await evaluate("check(document.querySelector('#chat-log-world').textContent.includes('Ranger: Settings'),'chat and sender remain verbatim');check(document.querySelector('#player-name').textContent==='Ranger','HUD player name preserved');check(document.querySelector('#profile').getAttribute('aria-label').startsWith('Ranger'),'accessible player name preserved');return true;");
    await browser('reload');
    await browser('wait', '--fn', "document.querySelector('#login-title') && !document.querySelector('#loading')");
    await evaluate(`check(document.documentElement.lang===${JSON.stringify(locale)}&&document.querySelector('#login-language').value===${JSON.stringify(locale)},'preference persists after reload');return true;`);
    assert.equal((await browser('errors')).trim(), '', 'No browser exceptions');
    console.log(`PASS ${locale} localization: catalogs, fallback, saved preference, real login/roster/world, inventory, language switching, dynamic text/attributes, untouched names/chat/input, mobile fit. Screenshots: ${output}`);
  }
} catch (error) {
  console.error(await browser('errors').catch(() => ''));
  console.error(await browser('snapshot', '-i').catch(() => ''));
  await browser('screenshot', join(output, 'failure.png')).catch(() => {});
  throw error;
} finally {
  await browser('close').catch(() => {}); await vite?.close(); await game.stop(); await rm(directory, { recursive: true, force: true });
}
