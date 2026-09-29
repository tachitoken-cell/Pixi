import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import vm from 'node:vm';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { CHAPTERS } from '../src/content.ts';
import { BANKER } from '../src/city.ts';
import { equippedAttributes, maxHealth, gearUpgradeQuote, starterGear } from '../src/progression.ts';
import { newBags } from '../src/bags.ts';
import { newBank } from '../src/bank.ts';
import { newContracts } from '../src/adventure.ts';

const dir = mkdtempSync(join(tmpdir(), 'mossvale-attributes-')), file = join(dir, 'players.json'), clients = [];
const realNow = Date.now; let clock = realNow(), game, port; Date.now = () => clock;
const hero = name => ({ id: randomUUID(), name, coordinateVersion: 2, zone: 'greenwood', x: BANKER.x - 1.5, z: BANKER.z, rotation: 0,
  appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
  characterCreated: true, talents: [], ...starterGear('Ranger'), ...newBags(), bank: newBank(), auctions: [], level: 10, xp: 0, hp: 50, maxHp: 208, gold: 10000,
  inventory: { wood: 1000, crystal: 1000, herb: 1000, relic: 1000, potion: 20 }, carriedItems: {}, itemUseReadyAt: 0,
  skills: { mining: 0, woodcutting: 0, herbalism: 0 }, craftingXp: 0, contracts: newContracts(),
  quest: { chapter: 0, stage: 0, kills: 0, crystals: 0, progress: Object.fromEntries(CHAPTERS[0].objectives.map(o => [o.id, 0])), completed: false, ending: null } });
const heroes = { owner: hero('Attribute Tester'), dead: hero('Fallen Tester') };
for (const p of Object.values(heroes)) { p.ownedGear.push('ranger-head', 'ranger-mantle', 'lantern-charm'); p.equipment.head = 'ranger-head'; }
heroes.dead.hp = 0;
const tokens = Object.fromEntries(Object.keys(heroes).map(name => [name, randomBytes(32).toString('base64url')]));
const hash = token => createHash('sha256').update(token).digest('hex'), saved = () => JSON.parse(readFileSync(file, 'utf8'));
const stored = name => saved()[hash(tokens[name])].characters[0];
const assets = p => structuredClone({ equipment: p.equipment, ownedGear: p.ownedGear, hp: p.hp, maxHp: p.maxHp, inventory: p.inventory, gold: p.gold });
async function until(fn, label) { const end = realNow() + 6000; while (realNow() < end) { const result = fn(); if (result) return result; await delay(10); } throw Error(`Timed out: ${label}`); }
async function tick(ms = 200) { clock += ms; await delay(120); }
async function start() { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' }); port = await game.start(); }
async function stop() { for (const c of clients.splice(0)) c.socket.terminate(); await game?.stop(); game = null; }
async function connect(name) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, messages: [] }; clients.push(c);
  c.send = message => socket.send(JSON.stringify(message)); c.player = () => c.snapshot?.players.find(p => p.id === heroes[name].id);
  socket.on('message', raw => { const message = JSON.parse(raw); c.messages.push(message); if (message.type === 'snapshot') c.snapshot = message; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token: tokens[name], characterId: heroes[name].id }); await until(() => c.player(), `${name} enters`); return c;
}
async function equip(c, id, slot) { await tick(); c.send({ type: 'equipGear', itemId: id, ...(slot ? { slot } : {}) }); await until(() => Object.values(c.player().equipment).includes(id), `${id} equipped`); }

try {
  writeFileSync(file, JSON.stringify(Object.fromEntries(Object.entries(heroes).map(([name, p]) => [hash(tokens[name]), { characters: [p] }]))));
  await start(); let owner = await connect('owner'), dead = await connect('dead');
  assert.equal(owner.player().maxHp, 213, 'legacy catalog stamina migrates max health'); assert.equal(owner.player().hp, 50, 'migration does not heal');
  assert.equal(dead.player().maxHp, 213); assert.equal(dead.player().hp, 0, 'migration does not revive dead players');
  await equip(owner, 'lantern-charm'); assert.equal(owner.player().maxHp, 218); assert.equal(owner.player().hp, 50);
  assert.equal(stored('owner').maxHp, 218, 'equipped stamina is saved with the item');
  const spirit = equippedAttributes(owner.player()).spirit; assert.equal(spirit, 1);
  await tick(4000); assert.equal(owner.player().hp, 50, 'spirit waits five seconds');
  await tick(1000); assert.equal(owner.player().hp, 50 + spirit, 'spirit heals at its real server tick'); assert.equal(dead.player().hp, 0);
  await tick(60000); assert.equal(owner.player().hp, 50 + spirit * 2, 'a delayed tick grants one pulse, never offline catch-up');
  await equip(owner, 'ranger-mantle'); assert.equal(owner.player().maxHp, 228); assert.equal(owner.player().hp, 52);
  while (owner.player().hp < owner.player().maxHp) { await tick(1300); const hp = owner.player().hp; owner.send({ type: 'heal' }); await until(() => owner.player().hp > hp, 'potion heals up to equipped maximum'); }
  owner.send({ type: 'unequipGear', slot: 'head' }); await until(() => owner.player().equipment.head === null, 'head removed');
  assert.equal(owner.player().maxHp, 223); assert.equal(owner.player().hp, 223, 'removing stamina clamps current health');
  await equip(owner, 'ranger-head'); assert.equal(owner.player().maxHp, 228); assert.equal(owner.player().hp, 223, 're-equipping stamina cannot farm healing');
  await tick(); const beforeFailure = assets(owner.player()), diskBefore = assets(stored('owner'));
  mkdirSync(file + '.tmp'); const messageAt = owner.messages.length; owner.send({ type: 'unequipGear', slot: 'head' });
  await until(() => owner.messages.slice(messageAt).some(m => m.type === 'event' && /could not be saved/.test(m.text)), 'failed equipment save');
  assert.deepEqual(assets(owner.player()), beforeFailure); assert.deepEqual(assets(stored('owner')), diskBefore, 'failed save keeps both equipment and health');
  rmSync(file + '.tmp', { recursive: true });
  const quote = gearUpgradeQuote('ranger-head'); await tick(); owner.send({ type: 'upgradeGear', gearId: 'ranger-head' });
  await until(() => owner.player().equipment.head === quote.nextId, 'stamina equipment upgraded');
  assert.equal(owner.player().maxHp, 233); assert.equal(owner.player().hp, 223, 'upgrade raises capacity without granting health');
  assert.equal(stored('owner').maxHp, 233); const beforeRestart = assets(owner.player());
  await stop(); clock += 3600000; await start(); owner = await connect('owner'); dead = await connect('dead');
  assert.deepEqual(assets(owner.player()), beforeRestart, 'attributes and wounded health survive restart without offline recovery');
  await tick(4000); assert.equal(owner.player().hp, beforeRestart.hp, 'reconnect starts a fresh spirit timer');
  await tick(1000); assert.equal(owner.player().hp, beforeRestart.hp + spirit); assert.equal(dead.player().hp, 0);
  await stop(); const corrupt = saved(); corrupt[hash(tokens.owner)].characters[0].maxHp += 7; const bytes = JSON.stringify(corrupt); writeFileSync(file, bytes);
  assert.throws(() => createGameServer({ dataDir: dir, keycloak: null, databaseUrl: '' }), /Invalid player save/); assert.equal(readFileSync(file, 'utf8'), bytes, 'invalid health saves are rejected without overwrite');

  // Hold the real transaction callback open while party XP and an incoming hit change live health.
  const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8'), body = source.slice(source.indexOf('  function completeTraining('), source.indexOf('\n  const auctionNearby'));
  const p = hero('Concurrent Tester'); p.achievements = { unlocked: {} }; const session = { player: p, recordKey: 'owner' }; let release, pending;
  const context = { maxHealth, Date, Object, Math, console, Map, committingAccounts: new Map(), stagedPlayerChanges: (_p, changes) => () => changes,
    auctionItemsRetained: () => true, onboardingCanComplete: () => false, unlockAchievements: () => [], sendAchievements() {}, event() {}, send() {}, snapshot() {}, dirty() {}, liveSession: () => true,
    closing: false, database: null, releasingAccounts: new Map(), accountConnections: new Map([['owner', { session }]]),
    save: (overrides, afterPersist) => { overrides.get(p.id)(); return new Promise(resolve => { release = () => { afterPersist(); resolve(); }; }); } };
  vm.createContext(context); vm.runInContext(`${source.match(/  const auctionFinalityMessage = .*;/)[0]}\n${body};globalThis.completeTraining=completeTraining`, context);
  pending = context.completeTraining(session, { equipment: { ...p.equipment, armor: 'ranger-mantle' } }, 'equip', undefined, false);
  assert.equal(await context.completeTraining(session, { gold: p.gold + 100 }, 'overlapping save', undefined, false), false,
    'an overlapping inventory request cannot replace the active account transaction');
  p.level++; p.hp = 25; release(); await pending; assert.equal(p.maxHp, maxHealth(p)); assert.equal(p.hp, 25, 'pending equipment save preserves new level and incoming damage');
  context.save = async () => { throw Error('Controlled fixture save failure'); };
  assert.equal(await context.completeTraining(session, {}, 'failed save', undefined, false), false, 'generic save failures still resolve through the transaction error handler');

  const bystander = hero('Bystander'); bystander.equipment.charm = 'lantern-charm';
  const targetSession = { player: bystander, nextSpiritAt: clock, recordKey: 'bystander' };
  let combat = false;
  const impactContext = { Date, Math, equippedAttributes, sessions: new Map([[bystander.id, targetSession]]), committingAccounts: new Map(),
    arenaMode: () => false, inCombat: () => combat, liveSession: () => true, broadcast() {}, dirty() {} };
  const extract = name => source.match(new RegExp(`  function ${name}\\([^]*?\\n  \\}`))[0];
  vm.createContext(impactContext); vm.runInContext(['knightDamageTaken', 'activeCompanion', 'healCompanion', 'applyDamage', 'restoreHealth', 'recoverSpirit'].map(extract).join('\n') + ';this.api={applyDamage,recoverSpirit}', impactContext);
  impactContext.api.applyDamage(bystander, 'player', 10, null, clock);
  impactContext.api.recoverSpirit(targetSession, clock); assert.equal(bystander.hp, 40, 'a bystander hit resets spirit even without enemy threat');
  impactContext.api.recoverSpirit(targetSession, clock + 4999); assert.equal(bystander.hp, 40);
  impactContext.api.recoverSpirit(targetSession, clock + 5000); assert.equal(bystander.hp, 41);
  combat = true; impactContext.api.recoverSpirit(targetSession, clock + 10000); assert.equal(bystander.hp, 41, 'combat suppresses spirit');
  combat = false; impactContext.api.recoverSpirit(targetSession, clock + 14999); assert.equal(bystander.hp, 41);
  impactContext.api.recoverSpirit(targetSession, clock + 15000); assert.equal(bystander.hp, 42, 'spirit resumes five seconds after combat');
  console.log('PASS: actual WS primary-attribute health, legacy wounded/dead migration, spirit timing and no offline catch-up, equip/unequip clamp and no heal farming, durable upgrades, disk failure rollback, restart, corrupt-save rejection, and concurrent XP/damage during an equipment commit.');
} finally { rmSync(file + '.tmp', { recursive: true, force: true }); await stop(); Date.now = realNow; rmSync(dir, { recursive: true, force: true }); }
