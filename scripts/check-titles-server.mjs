import { COMMUNITY_VERSION } from '../src/community.ts';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { TITLES, getTitle, titleUnlocked, playerTitle } from '../src/titles.ts';
import { ACHIEVEMENTS } from '../src/achievements.ts';
import { starterGear } from '../src/progression.ts';
import { OVERWORLD_SPAWNS } from '../src/realm.ts';

const dir = mkdtempSync(join(tmpdir(), 'mossvale-titles-')), file = join(dir, 'players.json'), clients = [], realNow = Date.now;
let clock = realNow(), game, port;
Date.now = () => clock;
const hash = token => createHash('sha256').update(token).digest('hex');
const slime = OVERWORLD_SPAWNS.find(enemy => enemy.id === 'slime-1');
const appearance = { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' };
function hero(name, extra = {}) {
  const level = extra.level || 1;
  return { id: randomUUID(), name, appearance, x: slime.x, z: slime.z + 2, zone: 'greenwood', coordinateVersion: 2, rotation: 0,
    characterCreated: true, ...starterGear('Ranger'), talents: [], level, hp: 100 + (level - 1) * 12, maxHp: 100 + (level - 1) * 12, xp: 0, gold: 0,
    inventory: { wood: 0, crystal: 0, herb: 0, potion: 3, relic: 0 }, learnedSpells: ['arrow'], ridingRank: 0, ownedMounts: [],
    quest: { stage: 0, kills: 0, crystals: 0 }, ...extra };
}
const heroes = { beta: hero('Early adventurer', { level: 4, xp: 399 }), ordinary: hero('Later adventurer', { betaTester: true }) }, sibling = hero('Second journey');
const tokens = Object.fromEntries(Object.keys(heroes).map(key => [key, randomBytes(32).toString('base64url')]));
async function until(fn, label) { const end = realNow() + 6000; while (realNow() < end) { const result = fn(); if (result) return result; await delay(10); } throw Error(`Timed out: ${label}`); }
async function tick(ms = 700) { clock += ms; await delay(130); }
async function start() { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' }); port = await game.start(); }
async function connect(key) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, messages: [] }; clients.push(c);
  c.send = message => socket.send(JSON.stringify(message)); c.player = () => c.snapshot?.players.find(p => p.id === c.welcome?.id);
  socket.on('message', raw => { const m = JSON.parse(raw); c.messages.push(m); if (['snapshot', 'roster', 'welcome'].includes(m.type)) c[m.type] = m; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token: tokens[key], characterId: heroes[key].id }); await until(() => c.player(), `enter ${key}`); return c;
}
async function title(c, titleId, error, extra = {}) {
  const index = c.messages.length; c.send({ type: 'selectTitle', titleId, ...extra });
  const reply = await until(() => c.messages.slice(index).find(m => m.type === 'titleSelected'), 'title selection acknowledged');
  if (error) assert.match(reply.error || '', error);
  else { assert.equal(reply.error, undefined); assert.equal(reply.titleId, titleId); assert.equal(c.player().title, titleId, 'authoritative snapshot arrives before success acknowledgment'); }
  return reply;
}
try {
  assert.equal(new Set(TITLES.map(t => t.id)).size, TITLES.length);
  assert(TITLES.every(t => ['beta-tester', 'burned', 'pons-lover', 'death-defier'].includes(t.id) || ACHIEVEMENTS.some(a => a.id === t.achievementId)), 'titles refer to existing gameplay unlocks');
  assert(!titleUnlocked({raidProgress:{clears:0}},getTitle('death-defier')));
  assert(titleUnlocked({raidProgress:{clears:1}},getTitle('death-defier')));
  assert.equal(getTitle('__proto__'), undefined); assert.equal(playerTitle({ title: 'missing' }), null);
  assert(!titleUnlocked({ betaTester: false }, getTitle('beta-tester'))); assert(titleUnlocked({ betaTester: true }, getTitle('beta-tester')));
  writeFileSync(file, JSON.stringify({ [hash(tokens.beta)]: { betaTester: true, characters: [heroes.beta, sibling] }, [hash(tokens.ordinary)]: { characters: [heroes.ordinary] } }));
  await start(); let beta = await connect('beta'), ordinary = await connect('ordinary');
  assert.equal(beta.player().betaTester, true); assert.equal(ordinary.player().betaTester, false, 'character save flags cannot grant account entitlement');
  assert.equal(beta.player().title, null, 'legacy characters start without a displayed title');
  await title(beta, 'death-defier', /Unlock/);
  await title(beta, 'adventurer', /Unlock/);
  await title(beta, 'beta-tester'); assert.equal(playerTitle(beta.player()), 'Beta Tester'); assert.equal(beta.player().name, heroes.beta.name);
  await until(() => ordinary.snapshot.players.some(p => p.id === heroes.beta.id && p.title === 'beta-tester' && p.betaTester), 'nearby players see authoritative title');
  await title(beta, 'beta-tester');
  await title(beta, null); assert.equal(playerTitle(beta.player()), null);
  await title(ordinary, 'beta-tester', /Unlock/); await title(ordinary, '__proto__', /known/); await title(ordinary, '<GM>', /known/);
  await tick(); await title(ordinary, 'beta-tester', /controlled by the realm/, { betaTester: true });
  await title(ordinary, null, /known/, { account: { betaTester: true } });
  assert.equal(ordinary.player().title, null); assert.equal(ordinary.player().betaTester, false);

  for (let attacks = 0; attacks < 8 && !beta.player().achievements.unlocked['growing-roots']; attacks++) { await tick(1100); beta.send({ type: 'attack', ability: 'arrow', targetId: slime.id }); await tick(800); }
  assert(beta.player().achievements.unlocked['growing-roots'], 'ordinary monster combat earns the title prerequisite');
  await title(beta, 'adventurer'); assert.equal(playerTitle(beta.player()), 'Adventurer');
  await delay(1200); mkdirSync(`${file}.tmp`);
  await title(beta, 'beta-tester', /could not be saved/); assert.equal(beta.player().title, 'adventurer', 'failed persistence cannot change selected title');
  rmSync(`${file}.tmp`, { recursive: true }); await title(beta, 'beta-tester');

  beta.send({ type: 'selectCharacter', characterId: sibling.id }); await until(() => beta.player()?.id === sibling.id, 'switch character');
  assert.equal(beta.player().title, null, 'selected titles are per character'); assert.equal(beta.player().betaTester, true, 'account entitlement covers siblings');
  await title(beta, 'death-defier', /Unlock/);
  await title(beta, 'adventurer', /Unlock/); await title(beta, 'beta-tester');
  beta.send({ type: 'leaveWorld' }); await until(() => beta.roster, 'return to roster');
  const before = beta.roster.characters.length;
  beta.send({ type: 'acceptCommunityRules', version: COMMUNITY_VERSION });
  await until(() => beta.messages.some(m => m.type === 'community' && m.accepted), 'accepted rules before future character');
  beta.send({ type: 'createCharacter', name: 'Future journey', appearance, title: 'living-legend', betaTester: false });
  await until(() => beta.roster.characters.length === before + 1, 'future character created');
  const future = beta.roster.characters.find(p => p.name === 'Future journey'); assert.equal(future.title, 'beta-tester', 'new eligible characters wear the account award by default'); assert.equal(future.betaTester, true);
  beta.send({ type: 'selectCharacter', characterId: future.id }); await until(() => beta.player()?.id === future.id, 'future character enters');
  await title(beta, 'beta-tester'); assert.equal(beta.player().name, 'Future journey');
  for (const client of clients) client.socket.terminate(); await game.stop(); game = undefined;
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(saved[hash(tokens.beta)].betaTester, true);
  assert(saved[hash(tokens.beta)].characters.every(p => p.title === 'beta-tester' && !Object.hasOwn(p, 'betaTester')), 'only account stores the entitlement; characters store selection');
  assert(!Object.hasOwn(saved[hash(tokens.ordinary)], 'betaTester')); assert(!Object.hasOwn(saved[hash(tokens.ordinary)].characters[0], 'betaTester'));
  await start(); beta = await connect('beta'); ordinary = await connect('ordinary');
  assert.equal(beta.player().title, 'beta-tester'); assert.equal(beta.player().betaTester, true); assert.equal(ordinary.player().betaTester, false);
  await title(beta, null); assert.equal(beta.player().betaTester, true, 'clearing display does not remove entitlement');
  for (const client of clients) client.socket.terminate(); await game.stop(); game = undefined;
  await start(); beta = await connect('beta'); assert.equal(beta.player().title, null, 'an explicit None choice survives later loads');
  for (const client of clients) client.socket.terminate(); await game.stop(); game = undefined;
  for (const invalid of [false, 'true', 1, null]) {
    const records = structuredClone(saved); records[hash(tokens.beta)].betaTester = invalid; writeFileSync(file, JSON.stringify(records));
    assert.throws(() => createGameServer({ port: 0, dataDir: dir, keycloak: null, databaseUrl: '' }), /Invalid player save/, 'present invalid account entitlements fail closed');
  }
  const forgedSave = structuredClone(saved); forgedSave[hash(tokens.ordinary)].characters[0].title = 'beta-tester'; forgedSave[hash(tokens.ordinary)].characters[0].betaTester = true;
  writeFileSync(file, JSON.stringify(forgedSave)); assert.throws(() => createGameServer({ port: 0, dataDir: dir, keycloak: null, databaseUrl: '' }), /Invalid player save/, 'stored title cannot bypass account entitlement');
  console.log('PASS real title unlock/selection/clear, causal acknowledgments, public snapshots, unchanged names, locked/forged rejection, failed-save rollback, per-character display, account entitlement for existing/future characters, restart and strict save validation.');
} finally { rmSync(`${file}.tmp`, { recursive: true, force: true }); for (const client of clients) client.socket.terminate(); await game?.stop(); Date.now = realNow; rmSync(dir, { recursive: true, force: true }); }
