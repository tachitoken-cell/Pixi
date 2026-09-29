import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { GEAR, GEAR_SETS, PRIMARY_ATTRIBUTES, starterGear, combatStats, gearFitsSlot } from '../src/progression.ts';
import { VILLAGE_NPCS } from '../src/settlements.ts';
import { regionAt, canTraverse, createOverworldSpawns } from '../src/realm.ts';
import { SPELLS, spellDamage, spellsForClass } from '../src/spells.ts';
import { BASIC_ATTACK, MONSTERS, monsterStatsAtLevel, monsterLevelScale } from '../src/bestiary.ts';

const classes = ['Ranger', 'Knight', 'Mage', 'Cleric'], slots = ['head', 'armor', 'legs', 'shoes', 'back', 'charm', 'ring', 'weapon'];
assert.equal(GEAR_SETS.length, 20); assert.equal(new Set(GEAR_SETS.map(set => set.id)).size, 20);
assert.equal(Object.values(GEAR).filter(item => item.setId).length, 160);
assert.equal(new Set(Object.values(GEAR).filter(item => item.setId).map(item => item.model)).size, 128);
for (const className of classes) {
  const sets = GEAR_SETS.filter(set => set.className === className);
  assert.deepEqual(sets.map(set => set.requiredLevel), [5, 12, 25, 40, 50]);
  let previous = { primaryDamage: 0, specialDamage: 0, defense: 0 };
  for (const set of sets) {
    const items = Object.values(GEAR).filter(item => item.setId === set.id);
    assert.deepEqual(items.map(item => item.slot), slots);
    const totals = { primaryDamage: 0, specialDamage: 0, defense: 0 };
    for (const item of items) {
      assert.equal(item.id, `${set.id}-${item.slot}`); assert.equal(item.className, className); assert.equal(item.requiredLevel, set.requiredLevel);
      const suffix=item.slot === 'armor' ? 'body' : item.slot === 'charm' ? 'necklace' : item.slot;
      assert.equal(item.model, className==='Cleric' ? ['ring','necklace'].includes(suffix) ? suffix : `cleric-${suffix}` : `${set.id}-${suffix}`);
      assert(Number.isSafeInteger(item.price) && item.price > 0); assert.equal(item.color, set.color);
      assert(gearFitsSlot(item.id, item.slot === 'ring' ? 'ring1' : item.slot));
      assert(Object.values(item.stats).some(value => value > 0), `${item.id} has a useful stat bonus`);
      for (const [stat, value] of Object.entries(item.stats)) { assert((stat in totals || PRIMARY_ATTRIBUTES.includes(stat)) && Number.isSafeInteger(value) && value > 0); if (stat in totals) totals[stat] += value; }
    }
    for (const stat of Object.keys(totals)) assert(totals[stat] > previous[stat], `${className} ${set.label} improves full-set ${stat}`);
    assert(totals.defense <= 13, 'gear defense remains moderate'); previous = totals;
  }
}
const dir = mkdtempSync(join(tmpdir(), 'mossvale-gear-sets-')), file = join(dir, 'players.json'), clients = [], realNow = Date.now;
let clock = realNow(), game, port; Date.now = () => clock;
const actualSpawns = createOverworldSpawns();
const spawns = actualSpawns.filter(spawn => spawn.kind === 'stone-golem' && !actualSpawns.some(other => other !== spawn && Math.hypot(other.x - spawn.x, other.z - spawn.z) < 15)).slice(0, classes.length);
assert.equal(spawns.length, classes.length);
const key = token => createHash('sha256').update(token).digest('hex');
const merchantIds = ['village-pinewake-merchant', 'village-sunscar-merchant', 'village-northglass-merchant', 'village-stormcrag-merchant', 'village-elderwood-merchant'];
const merchants = merchantIds.map(id => VILLAGE_NPCS.find(npc => npc.id === id));
const shopPoints = merchants.map(npc => {
  const point = { x: npc.x, z: npc.z + 1 };
  assert(canTraverse(point, npc), `reachable stockist ${npc.id}`); return point;
});
const shopping = GEAR_SETS.map(set => ({ set, tier: [5, 12, 25, 40, 50].indexOf(set.requiredLevel) }));
const combatStart=shopping.length, gateStart=combatStart+classes.length;
const tokens = Array.from({ length: gateStart+3 }, () => randomBytes(32).toString('base64url'));
function hero(className, level, gold, index, point) {
  return { id: randomUUID(), name: `Gear set tester ${index}`, ...point, zone: regionAt(point.x, point.z), coordinateVersion: 2, rotation: 0, characterCreated: true,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className },
    ...starterGear(className), learnedSpells: spellsForClass(className).filter(spell=>spell.requiredLevel<=level).map(spell=>spell.id), talents: [], level, hp: 100 + (level - 1) * 12, maxHp: 100 + (level - 1) * 12, xp: 0, gold,
    inventory: { wood: 0, crystal: 0, herb: 0, potion: 3, relic: 0 }, quest: { stage: 0, kills: 0, crystals: 0 } };
}
const heroes = shopping.map(({ set, tier }, index) => hero(set.className, set.requiredLevel, 50000, index, shopPoints[tier]));
// Purchase all 160 pieces at their stockists, then independently test the same
// catalog gear in combat fixtures. Every preowned combat save uses normal validation.
for (const [index, className] of classes.entries()) {
  const p = hero(className, 50, 50000, heroes.length, { x: spawns[index].x + 1, z: spawns[index].z });
  const set = GEAR_SETS.find(set => set.className === className && set.requiredLevel === 50);
  for (const item of Object.values(GEAR).filter(item => item.setId === set.id)) {
    p.ownedGear.push(item.id); p.equipment[item.slot === 'ring' ? 'ring1' : item.slot] = item.id;
  }
  heroes.push(p);
}
heroes.push(hero('Ranger', 4, 50000, gateStart, shopPoints[0]), hero('Ranger', 49, 50000, gateStart+1, shopPoints[4]), hero('Ranger', 50, 0, gateStart+2, shopPoints[0]));
writeFileSync(file, JSON.stringify(Object.fromEntries(heroes.map((p, index) => [key(tokens[index]), { characters: [p] }]))));
async function until(fn, label) { const end = realNow() + 5000; while (realNow() < end) { const value = fn(); if (value) return value; await delay(10); } throw Error(`Timed out: ${typeof label==='function'?label():label}`); }
async function tick(ms = 1000) { clock += ms; await delay(120); }
async function start() { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' }); port = await game.start(); }
async function connect(token) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, messages: [] }; clients.push(c);
  c.send = message => socket.send(JSON.stringify(message)); c.player = () => c.snapshot?.players.find(p => p.id === c.welcome?.id);
  socket.on('message', raw => { const m = JSON.parse(raw); c.messages.push(m); if (['roster', 'welcome', 'snapshot'].includes(m.type)) c[m.type] = m; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token }); await until(() => c.roster, 'roster');
  c.send({ type: 'selectCharacter', characterId: c.roster.characters[0].id }); await until(() => c.player(), 'world entry'); return c;
}
const economy = p => ({ gold: p.gold, ownedGear: p.ownedGear, equipment: p.equipment });
try {
  await start(); let players = await Promise.all(tokens.map((token,index) => index >= combatStart && index < gateStart ? null : connect(token)));
  const before = players.map(c => c ? structuredClone(economy(c.player())) : null);
  players[0].send({ type: 'buyGear', npcId: merchants[0].id, itemId: 'ironbastion-head' });
  players[0].send({ type: 'equipGear', itemId: 'briarwatch-head' });
  players[gateStart].send({ type: 'buyGear', npcId: merchants[0].id, itemId: 'briarwatch-head' });
  players[gateStart+1].send({ type: 'buyGear', npcId: merchants[4].id, itemId: 'elderwild-head' });
  players[gateStart+2].send({ type: 'buyGear', npcId: merchants[0].id, itemId: 'briarwatch-head' });
  await tick();
  for (const index of [0, gateStart, gateStart+1, gateStart+2]) assert.deepEqual(economy(players[index].player()), before[index], 'new gear enforces class, level, ownership and gold gates at its actual merchant');
  for (const [index, { set, tier }] of shopping.entries()) {
    const c = players[index], npcId = merchants[tier].id, items = Object.values(GEAR).filter(item => item.setId === set.id);
    const gold = c.player().gold, cost = items.reduce((sum, item) => sum + item.price, 0);
    for (const item of items) { c.send({ type: 'buyGear', npcId, itemId: item.id }); c.send({ type: 'buyGear', npcId, itemId: item.id }); }
    await until(() => items.every(item => c.player().ownedGear.includes(item.id)), `${set.label} purchased from its stockist`);
    assert.equal(c.player().gold, gold - cost, 'all eight items charge exactly once');
    for (const item of items) { const slot = item.slot === 'ring' ? 'ring1' : item.slot; c.send({ type: 'equipGear', itemId: item.id, slot }); await until(() => c.player().equipment[slot] === item.id, `${item.label} equipped durably`); }
    await until(() => items.every(item => c.player().equipment[item.slot === 'ring' ? 'ring1' : item.slot] === item.id), `${set.label} equipped`);
    const base = combatStats({ ...c.player(), equipment: starterGear(set.className).equipment }), stats = combatStats(c.player());
    const primary = set.className === 'Knight' ? 'strength' : set.className === 'Ranger' ? 'agility' : 'intellect';
    for (const stat of ['primaryDamage', 'specialDamage', 'defense']) assert.equal(stats[stat], base[stat] + items.reduce((sum, item) => sum + (item.stats[stat] || 0) + (stat === 'defense' ? 0 : item.stats[primary] || 0), 0));
    assert.equal(c.player().ownedGear.length, 10, 'eight bought set pieces plus two starter pieces');
    const equipped = structuredClone(economy(c.player()));
    c.send({ type: 'equipGear', itemId: c.player().equipment.ring1, slot: 'ring2' }); await tick();
    assert.deepEqual(economy(c.player()), equipped, 'a set ring cannot be duplicated across both hands');
  }
  // Enter combat only after shopping: advancing the clock during 160 purchases must not kill idle fighters.
  for (let index=combatStart; index<gateStart; index++) players[index]=await connect(tokens[index]);
  const fighters = players.slice(combatStart, gateStart);
  for (const [index, c] of fighters.entries()) {
    const enemy = () => c.snapshot.enemies.find(e => e.id === spawns[index].id);
    for (let tries = 0; tries < 100 && !(enemy()?.attack?.basic && enemy().attack.impactAt > clock); tries++) await tick(100);
    const attack = enemy().attack; assert(attack?.basic && attack.impactAt > clock, `${classes[index]} fighter hp ${c.player().hp}, enemy ${JSON.stringify(enemy())}`);
    const hp = c.player().hp, stats = combatStats(c.player()); await tick(attack.impactAt - clock);
    assert.equal(c.player().hp, hp - Math.max(1, Math.round(Math.round(monsterStatsAtLevel('stone-golem', enemy().level).damage * BASIC_ATTACK.damageScale) * monsterLevelScale(enemy().level, c.player().level)) - stats.defense), 'equipped set defense reduces actual monster contact damage');
  }
  for (const [special, abilities] of [[false, ['arrow', 'strike', 'fireball', 'smite']], [true, ['volley', 'whirlwind', 'nova', 'holy-nova']]]) {
    if (special) await tick(15000);
    for (const [index, c] of fighters.entries()) {
      const spell=SPELLS[abilities[index]], start = c.messages.length;
      const damage = spellDamage(spell,combatStats(c.player())), hpBefore = c.snapshot.enemies.find(e => e.id === spawns[index].id).hp;
      c.send({ type: 'attack', ability: abilities[index], targetId: spawns[index].id });
      await until(() => c.player().casting?.ability === abilities[index] || c.messages.slice(start).some(m => m.type === 'combat' && m.playerId === c.welcome.id), ()=>`set weapon cast accepted: ${abilities[index]}, hp ${c.player().hp}, messages ${JSON.stringify(c.messages.slice(start).filter(m=>m.kind).map(m=>m.text))}`);
      await tick(Math.max(1000, (c.player().casting?.endsAt ?? clock) - clock + 50));
      await tick(1000);
      assert(c.messages.slice(start).some(m => m.kind === 'combat' && m.playerId === c.welcome.id && m.text.includes(`for ${damage}${special ? ' with a special attack' : ''}.`)), `${abilities[index]} set stats reach authoritative combat damage (${damage})`);
      assert(c.snapshot.enemies.find(e => e.id === spawns[index].id).hp <= Math.max(0,hpBefore-damage), 'the observed weapon hit removes actual enemy health');
    }
  }
  const saved = players.slice(0, gateStart).map(c => structuredClone(economy(c.player()))), stats = players.slice(0, gateStart).map(c => combatStats(c.player()));
  for (let index = 0; index < saved.length; index++) {
    const c = await connect(tokens[index]); assert.deepEqual(economy(c.player()), saved[index], 'all purchased sets and equipped pieces survive reconnect');
  }
  await game.stop(); game = null;
  const disk = JSON.parse(readFileSync(file, 'utf8'));
  for (let index = 0; index < saved.length; index++) assert.deepEqual(economy(disk[key(tokens[index])].characters[0]), saved[index]);
  await start(); players = await Promise.all(tokens.slice(0, saved.length).map(connect));
  for (let index = 0; index < saved.length; index++) { assert.deepEqual(economy(players[index].player()), saved[index]); assert.deepEqual(combatStats(players[index].player()), stats[index]); }
  console.log('PASS: 20 class sets / 160 unique pieces with 128 reusable models; five increasing tiers; real nearby-stockist purchases/equipment/stats for every item; class/level/gold/ownership/ring gates; actual primary/special damage and defense; reconnect and server-restart persistence.');
} finally { for (const c of clients) c.socket.terminate(); await game?.stop(); Date.now = realNow; rmSync(dir, { recursive: true, force: true }); }
