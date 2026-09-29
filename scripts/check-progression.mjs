import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { VILLAGE_NPCS } from '../src/settlements.ts';
import { canTraverse, regionAt, createOverworldSpawns } from '../src/realm.ts';
import { ZONES } from '../src/content.ts';
import { COMMUNITY_VERSION } from '../src/community.ts';
import { GLOBAL_ATTACK_MS } from '../src/spells.ts';
import { normalizeAppearance } from '../src/appearance.ts';
import { GEAR, TALENTS, RESOURCE_PRICES, starterGear, combatStats, earnedTalentPoints, availableTalentPoints, canLearnTalent } from '../src/progression.ts';

const merchant = VILLAGE_NPCS.find(npc => npc.id === 'village-pinewake-merchant');
const shopPoint = { x: merchant.x, z: merchant.z + 1 };
assert(canTraverse(shopPoint, merchant), 'merchant fixture has an unobstructed interaction');
const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-progression-'));
const appearance = { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' };
const tokens = Array.from({ length: 3 }, () => randomBytes(32).toString('base64url'));
const key = token => createHash('sha256').update(token).digest('hex');
const records = Object.fromEntries(tokens.map((token, i) => [key(token), {
  id: randomUUID(), name: `Legacy.${i}`, appearance: { ...appearance, className: ['Ranger', 'Knight', 'Mage'][i] }, zone: 'greenwood',
  x: [7, 10, 0][i], z: [2, 1, 8][i], rotation: 0, hp: i === 2 ? 100 : 124, maxHp: i === 2 ? 100 : 124, level: i === 2 ? 1 : 3, xp: 7, gold: 160,
  inventory: { wood: 40, crystal: 20, potion: 3, herb: 10 }, skills: { fishing: 0, mining: 75, woodcutting: 40, herbalism: 20 },
  quest: { chapter: 0, stage: 1, kills: 0, crystals: 0, progress: { 'grove-slimes': 0, 'grove-crystals': 0 }, completed: false, ending: null },
}]));
writeFileSync(join(dataDir, 'players.json'), JSON.stringify(records));
const clients = [];
let game, port;
async function until(predicate, label, timeout = 4500) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const result = predicate(); if (result) return result; await delay(20); }
  throw new Error(`Timed out: ${label}`);
}
async function start() {
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir, keycloak: null, databaseUrl: '' });
  port = await game.start();
}
async function connect(token) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`);
  const c = { socket, snapshot: null, roster: null, welcome: null, messages: [] }; clients.push(c);
  socket.on('message', raw => {
    const m = JSON.parse(raw.toString()); c.messages.push(m);
    if (m.type === 'snapshot') c.snapshot = m;
    if (m.type === 'welcome') c.welcome = m;
    if (m.type === 'roster') c.roster = m;
  });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send = m => socket.send(JSON.stringify(m));
  c.send({ type: 'join', token });
  await until(() => c.roster, 'roster loaded');
  c.player = () => c.snapshot?.players.find(p => p.id === c.welcome?.id);
  if (c.roster.characters.length) {
    c.send({ type: 'selectCharacter', characterId: c.roster.characters[0].id });
    await until(() => c.welcome && c.player(), 'character entered');
  }
  return c;
}
// Reposition persisted fixtures between the migration, shopping and combat phases.
// Transactions still run against a real nearby NPC; traversal is covered separately.
async function placeFixtures(points) {
  await game.stop();
  const file = join(dataDir, 'players.json'), saved = JSON.parse(readFileSync(file, 'utf8'));
  for (const [index, point] of points.entries()) Object.assign(saved[key(tokens[index])].characters[0], point, { zone: regionAt(point.x, point.z) });
  writeFileSync(file, JSON.stringify(saved)); await start();
  return Promise.all(tokens.map(connect));
}
const economy = p => ({ gold: p.gold, inventory: p.inventory, equipment: p.equipment, ownedGear: p.ownedGear, talents: p.talents });

try {
  await start();
  let ranger = await connect(tokens[0]), knight = await connect(tokens[1]), mage = await connect(tokens[2]);
  for (const [index, c] of [ranger, knight, mage].entries()) {
    assert.equal(c.player().characterCreated, true, 'legacy identities are already final');
    assert.equal(c.player().name, `Legacy.${index}`, 'existing names keep the older valid format');
    assert.deepEqual(c.player().talents, []);
    assert.deepEqual(c.player().equipment, starterGear(c.player().appearance.className).equipment);
    assert.deepEqual(c.player().ownedGear, starterGear(c.player().appearance.className).ownedGear);
    assert.deepEqual(c.player().skills, records[key(tokens[index])].skills);
    assert.equal(c.player().gold, 160);
    assert.equal(availableTalentPoints(c.player()), earnedTalentPoints(c.player().level));
  }
  const pending = await connect();
  const pendingToken = pending.roster.token;
  pending.send({ type: 'acceptCommunityRules', version: COMMUNITY_VERSION });
  await until(() => pending.messages.some(message => message.type === 'community' && message.accepted), 'community rules accepted');
  assert.deepEqual(pending.roster.characters, []);
  const finalAppearance = normalizeAppearance({ ...appearance, className: 'Knight', outfit: '#789abb', hairStyle: 'mohawk' });
  pending.send({ type: 'createCharacter', name: 'First Keeper', appearance: finalAppearance });
  await until(() => pending.roster.characters.length === 1, 'character created in roster');
  assert.equal(pending.welcome, null, 'creation does not enter the world');
  pending.send({ type: 'selectCharacter', characterId: pending.roster.characters[0].id });
  await until(() => pending.player(), 'created character selected');
  assert.equal(pending.player().name, 'First Keeper');
  assert.deepEqual(pending.player().appearance, finalAppearance);
  assert.deepEqual(pending.player().equipment, starterGear('Knight').equipment);
  pending.send({ type: 'appearance', name: 'Changed identity', appearance });
  pending.send({ type: 'createCharacter', name: 'Bypass while playing', appearance });
  await delay(150);
  assert.equal(pending.player().name, 'First Keeper');
  assert.deepEqual(pending.player().appearance, finalAppearance, 'class and appearance remain permanent');

  [ranger, knight, mage] = await placeFixtures([shopPoint, shopPoint, shopPoint]);
  const before = structuredClone(economy(ranger.player()));
  for (const m of [{ type: 'buyGear', npcId: merchant.id, itemId: '__proto__' }, { type: 'buyGear', npcId: merchant.id, itemId: 'sunsteel-sword' }, { type: 'equipGear', itemId: 'warden-longbow' }, { type: 'buyGear', npcId: merchant.id, itemId: 'ranger-bow' }, { type: 'learnTalent', talentId: 'ranger-2' }, { type: 'learnTalent', talentId: 'mage-1' }, { type: 'learnTalent', talentId: {} }]) ranger.send(m);
  for (const quantity of [0, -1, 0.5, '1', 1000001, Number.MAX_SAFE_INTEGER]) ranger.send({ type: 'sellResource', npcId: merchant.id, resource: 'wood', quantity });
  ranger.send({ type: 'sellResource', npcId: merchant.id, resource: '__proto__', quantity: 1 });
  await delay(150);
  assert.deepEqual(economy(ranger.player()), before, 'invalid transactions do not mutate balances or ownership');
  mage.send({ type: 'buyGear', npcId: merchant.id, itemId: 'starfall-staff' });
  await delay(150);
  assert.equal(mage.player().gold, 160, 'level restriction applies even with enough gold');
  ranger.send({ type: 'buyGear', npcId: merchant.id, itemId: 'warden-longbow' });
  ranger.send({ type: 'buyGear', npcId: merchant.id, itemId: 'warden-longbow' });
  await until(() => ranger.player().ownedGear.includes('warden-longbow'), 'weapon bought');
  assert.equal(ranger.player().gold, 95, 'repeated purchase charges exactly once');
  assert.equal(ranger.player().equipment.weapon, 'ranger-bow', 'purchase and equipment selection are separate');
  for (const id of ['ranger-mantle', 'lantern-charm']) ranger.send({ type: 'buyGear', npcId: merchant.id, itemId: id });
  await until(() => ranger.player().ownedGear.includes('lantern-charm'), 'armor and charm bought');
  assert.equal(ranger.player().gold, 10);
  for (const id of ['warden-longbow', 'ranger-mantle', 'lantern-charm']) { ranger.send({ type: 'equipGear', itemId: id }); await until(() => Object.values(ranger.player().equipment).includes(id), `${id} equipped durably`); }
  await until(() => ranger.player().equipment.charm === 'lantern-charm', 'three gear slots equipped');
  assert.equal(ranger.player().equipment.weapon, 'warden-longbow');
  assert.equal(ranger.player().equipment.armor, 'ranger-mantle');
  const goldBeforeSell = ranger.player().gold;
  for (const resource of Object.keys(RESOURCE_PRICES)) ranger.send({ type: 'sellResource', npcId: merchant.id, resource, quantity: 2 });
  await until(() => ranger.player().gold === goldBeforeSell + 20, 'resource sales pay catalog prices');
  assert.deepEqual(ranger.player().inventory, { wood: 38, crystal: 18, potion: 3, herb: 8, relic: 0 });
  for (const id of ['ranger-1']) {
    assert.ok(canLearnTalent(ranger.player(), id)); ranger.send({ type: 'learnTalent', talentId: id });
    await until(() => ranger.player().talents.includes(id), `learned ${id}`);
  }
  ranger.send({ type: 'learnTalent', talentId: 'ranger-1' });
  ranger.send({ type: 'learnTalent', talentId: 'ranger-4' });
  await delay(150);
  assert.deepEqual(ranger.player().talents, ['ranger-1']);
  assert.equal(availableTalentPoints(ranger.player()), 0);
  assert.deepEqual(combatStats(ranger.player()), { range: 13.5, primaryDamage: 30, specialDamage: 51, skillDamage: 6, defense: 3, spellBonuses: { direct: 2 },
    critChance:0, attackSpeedMultiplier:1, castSpeedMultiplier:1, damageMultiplier:1, magicDamageMultiplier:1 }, 'three agility adds three attack and skill power without granting percentage passives');
  for (const id of ['knight-4']) {
    knight.send({ type: 'learnTalent', talentId: id });
    await until(() => knight.player().talents.includes(id), `learned ${id}`);
  }
  knight.send({ type: 'buyGear', npcId: merchant.id, itemId: 'sunsteel-plate' });
  knight.send({ type: 'equipGear', itemId: 'sunsteel-plate' });
  await until(() => knight.player().equipment.armor === 'sunsteel-plate', 'defensive armor equipped durably');
  knight.send({ type: 'buyGear', npcId: merchant.id, itemId: 'lantern-charm' });
  knight.send({ type: 'equipGear', itemId: 'lantern-charm' });
  await until(() => knight.player().equipment.charm === 'lantern-charm', 'defensive gear equipped');
  assert.equal(combatStats(knight.player()).defense, 4);
  assert.equal(knight.player().maxHp, 139, 'three stamina adds fifteen maximum health');
  const combatSlime = createOverworldSpawns().find(enemy=>enemy.id==='slime-0');
  const combatPoints=[{x:combatSlime.x-6,z:combatSlime.z},{x:combatSlime.x,z:combatSlime.z+1},{x:0,z:8}];
  assert(combatPoints.slice(0,2).every(point=>canTraverse(point,combatSlime)), 'combat fixtures face the actual slime beyond the city walls');
  [ranger, knight, mage] = await placeFixtures(combatPoints);
  ranger.send({ type: 'attack', targetId: 'slime-0' });
  await until(() => ranger.messages.some(m => m.kind === 'combat' && m.text.includes('for 37.')), 'attack power, skill gear and percentage talent damage applied');
  await delay(GLOBAL_ATTACK_MS+100);
  ranger.send({ type: 'attack', targetId: 'slime-0' });
  await until(() => ranger.messages.filter(m => m.kind === 'combat' && m.text.includes('for 37.')).length === 2, 'geared primary finishes the enemy before special spells unlock');
  // The defeated slime respawns and attacks with the new defense applied.
  const startDamage = knight.messages.length;
  await until(() => knight.messages.slice(startDamage).some(m => m.kind === 'damage' && m.text.endsWith('for 1.')), 'defense reduces real enemy damage', 18000);

  const savedRanger = structuredClone(economy(ranger.player()));
  await game.stop();
  const disk = readFileSync(join(dataDir, 'players.json'), 'utf8');
  assert.ok(!disk.includes(pendingToken) && !disk.includes('gathering'));
  await start();
  const restored = await connect(tokens[0]), restoredCreation = await connect(pendingToken);
  assert.deepEqual(economy(restored.player()), savedRanger);
  assert.equal(restoredCreation.player().name, 'First Keeper');
  assert.deepEqual(restoredCreation.player().appearance, finalAppearance);
  assert.equal(restoredCreation.player().characterCreated, true);
  const invalidDir = join(dataDir, 'invalid'); mkdirSync(invalidDir);
  for (const corrupt of [p => { p.characterCreated = null; }, p => { p.talents = null; }, p => { p.talents = ['ranger-2']; }, p => { p.talents = ['mage-1']; }, p => { p.talents = ['ranger-1', 'ranger-1']; }, p => { p.ownedGear.push('missing'); }, p => { p.ownedGear.push('knight-sword'); p.equipment.weapon = 'knight-sword'; }, p => { p.ownedGear.push(p.ownedGear[0]); }, p => { p.equipment.weapon = 'ranger-mantle'; }, p => { p.equipment.armor = null; }, p => { p.equipment.charm = 'unowned'; }]) {
    const copy = JSON.parse(disk); corrupt(copy[key(tokens[0])].characters[0]);
    const text = JSON.stringify(copy), file = join(invalidDir, 'players.json'); writeFileSync(file, text);
    assert.throws(() => createGameServer({ dataDir: invalidDir, keycloak: null, databaseUrl: '' }), /Invalid player save/);
    assert.equal(readFileSync(file, 'utf8'), text, 'corrupt progression is never silently reset');
  }
  assert.equal(Object.keys(TALENTS).length, 130);
  assert.equal(Object.values(GEAR).filter(item => !item.dropOnly && item.price > 0).length, 187);
  console.log('PASS: immutable character creation; explicit roster entry; migration; talent prerequisites/points; gold sales, class/level/ownership checks, exactly-once purchases, real equipped damage/defense, restart persistence and corrupt-save preservation.');
} finally {
  for (const c of clients) c.socket.terminate();
  await game?.stop();
  rmSync(dataDir, { recursive: true, force: true });
}
