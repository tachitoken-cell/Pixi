import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { ZONES } from '../src/content.ts';
import { starterGear } from '../src/progression.ts';
import { spellsForClass } from '../src/spells.ts';
import { toWorld, regionAt } from '../src/realm.ts';
import { INSTANT_COMBAT, INSTANT_COMBAT_CREATURES, instantCombatSchedule, instantCombatEncounter } from '../src/instant-combat.ts';

const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-instant-combat-')), clients = [], realNow = Date.now;
const startsAt = Date.UTC(2026, 8, 28, 14);
let now = startsAt - INSTANT_COMBAT.registrationMs - 1000, game, port;
Date.now = () => now;
async function until(predicate, label) {
  const end = realNow() + 7000;
  while (realNow() < end) { const result = predicate(); if (result) return result; await delay(20); }
  throw Error(`Timed out: ${label}`);
}
async function tick(ms) { now += ms; await delay(150); }
const levels = [...Array(21).fill(16), 31, 46, 60, 15];
const heroes = levels.map((level, index) => {
  const className = index === 1 || index === 23 ? 'Cleric' : 'Ranger';
  const point = toWorld(index % 2 ? 'greenwood' : 'frostmarch', { x: 0, z: 22 });
  return { id: randomUUID(), name: `Fighter${String.fromCharCode(65 + index)}`, ...point, zone: regionAt(point.x, point.z), coordinateVersion: 2, rotation: 0,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className },
    characterCreated: true, talents: [], ...starterGear(className), learnedSpells: spellsForClass(className).filter(spell => spell.requiredLevel <= level).map(spell => spell.id), level, xp: 0, gold: 0,
    hp: 100 + (level - 1) * 12, maxHp: 100 + (level - 1) * 12,
    inventory: { wood: 0, crystal: 0, herb: 0, potion: 0, relic: 0 }, quest: { stage: 0, kills: 0, crystals: 0 } };
});
const tokens = heroes.map(() => randomBytes(32).toString('base64url'));
async function connect(index) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), client = { socket, id: heroes[index].id, messages: [] };
  clients.push(client);
  client.send = message => socket.send(JSON.stringify(message));
  client.player = () => client.snapshot?.players.find(player => player.id === client.id);
  socket.on('message', raw => { const message = JSON.parse(raw); if (message.type === 'snapshot') client.snapshot = message; else client.messages.push(message); });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  client.send({ type: 'join', token: tokens[index], characterId: client.id });
  await until(() => client.player(), 'character selection'); return client;
}
try {
  assert.equal(instantCombatSchedule(startsAt - 1).registrationOpen, true);
  assert.equal(instantCombatSchedule(startsAt).registrationOpen, false);
  assert.equal(instantCombatSchedule(startsAt).startsAt, startsAt + INSTANT_COMBAT.intervalMs);
  writeFileSync(join(dataDir, 'players.json'), JSON.stringify(Object.fromEntries(heroes.map((hero, index) => [createHash('sha256').update(tokens[index]).digest('hex'), { characters: [hero] }]))));
  const spawns = ZONES.map(zone => zone.enemies); ZONES.forEach(zone => { zone.enemies = []; });
  try { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir, keycloak: null, databaseUrl: '' }); }
  finally { ZONES.forEach((zone, index) => { zone.enemies = spawns[index]; }); }
  port = await game.start();
  const everyone = await Promise.all(heroes.map((_, index) => connect(index))), team = everyone.slice(0, -1), underlevel = everyone.at(-1), lead = team[0];
  const origins = everyone.map(client => ({ x: client.player().x, z: client.player().z, zone: client.player().zone }));
  lead.send({ type: 'instantCombatRegister' }); await tick(1);
  assert(!lead.snapshot.instantCombat.registered, 'registration is closed before the warning');
  await tick(1000);
  await until(() => team.every(client => client.snapshot.instantCombat.registrationOpen), 'realm-wide signup window');
  assert(lead.messages.some(message => message.type === 'event' && /Instant Combat/.test(message.text)), 'server warning reaches players');
  underlevel.send({ type: 'instantCombatRegister' }); await tick(1);
  assert(!underlevel.snapshot.instantCombat.registered && !underlevel.snapshot.instantCombat.bracketId, 'level 15 cannot register');
  for (const client of team) client.send({ type: 'instantCombatRegister' });
  await until(() => team.every(client => client.snapshot.instantCombat.registered), 'all brackets register from different regions');
  lead.send({ type: 'instantCombatRegister' }); await tick(1);
  assert.equal(lead.snapshot.instantCombat.registeredCount, 21, 'duplicate registration cannot take extra seats');
  for (const client of team) assert.equal(client.snapshot.instanceId, null, 'registration itself does not teleport');
  await tick(startsAt - now);
  await until(() => team.every(client => client.snapshot.instantCombat.run?.phase === 'preparing'), 'scheduled teleport');
  assert(!underlevel.snapshot.instanceId, 'level 15 stays in the world at cutoff');
  assert.equal(new Set(team.map(client => client.snapshot.instantCombat.run.bracketId)).size, 3);
  const instances = new Map();
  const encounter = instantCombatEncounter(startsAt);
  for (let i = 0; i < team.length; i++) {
    const client = team[i], state = client.snapshot.instantCombat;
    assert.match(client.snapshot.instanceId, /^instant-combat-/);
    assert.equal(state.run.mapId, encounter.mapId, 'all brackets and overflow rooms receive the scheduled map');
    assert.equal(state.run.bossModel, encounter.bossModel, 'all brackets and overflow rooms receive the scheduled boss');
    assert.equal(client.snapshot.dungeon, null); assert.equal(client.snapshot.arena, null); assert.equal(client.snapshot.raid, null);
    assert.equal(client.snapshot.enemies.length, 0, 'preparation is enemy-free');
    assert(levels[i] >= state.run.minLevel && levels[i] <= state.run.maxLevel);
    assert(client.snapshot.players.every(player => player.level >= state.run.minLevel && player.level <= state.run.maxLevel));
    assert(client.snapshot.players.every(player => !player.pvp && !player.arenaMatchId), 'event members remain cooperative');
    assert(client.snapshot.players.length <= 20);
    instances.set(client.snapshot.instanceId, client.snapshot.players.length);
  }
  assert.deepEqual([...instances.values()].sort((a, b) => a - b), [1, 1, 2, 20], '21 same-bracket entrants overflow into a second arena');
  const preparationEndsAt = lead.snapshot.instantCombat.run.phaseEndsAt;
  team[1].send({ type: 'attack', ability: 'flash-heal', targetId: lead.id });
  await until(() => team[1].player().casting?.ability === 'flash-heal', 'friendly healing starts during preparation');
  await tick(2000);
  await until(() => team[1].messages.some(message => message.type === 'combat' && message.ability === 'flash-heal' && message.targets.some(target => target.id === lead.id)), 'friendly healing resolves during preparation');
  const outsider = team[20];
  outsider.send({ type: 'instantCombatLeave' });
  await until(() => !outsider.snapshot.instanceId, 'manual return');
  outsider.send({ type: 'instantCombatRegister' }); await tick(1);
  assert(!outsider.snapshot.instantCombat.registered, 'late entry waits for next event');
  assert.deepEqual({ x: outsider.player().x, z: outsider.player().z, zone: outsider.player().zone }, origins[20]);
  await tick(preparationEndsAt - now - 1);
  assert.equal(lead.snapshot.instantCombat.run.phase, 'preparing');
  await tick(1);
  await until(() => lead.snapshot.instantCombat.run.phase === 'fighting', 'round one starts');
  assert.equal(lead.snapshot.instantCombat.run.round, 1); assert.equal(lead.snapshot.instantCombat.run.totalRounds, 5);
  assert(lead.snapshot.enemies.some(enemy => enemy.alive));
  assert(lead.snapshot.enemies.every(enemy => enemy.instanceId === lead.snapshot.instanceId), 'enemy snapshots stay isolated');
  const wave = INSTANT_COMBAT_CREATURES[encounter.mapId].waves[0];
  assert(lead.snapshot.enemies.every(enemy => enemy.model === wave.model && enemy.name === wave.name && enemy.kind === wave.kind), 'first-wave snapshots identify the new map-specific creatures');
  const target = lead.snapshot.enemies.filter(enemy => enemy.alive).sort((a, b) => Math.hypot(a.x - lead.player().x, a.z - lead.player().z) - Math.hypot(b.x - lead.player().x, b.z - lead.player().z))[0];
  const targetHp = target.hp;
  lead.send({ type: 'attack', ability: 'arrow', targetId: target.id });
  await until(() => lead.player().casting?.ability === 'arrow' || lead.messages.some(message => message.type === 'combat' && message.playerId === lead.id && message.ability === 'arrow'), 'ordinary spell accepted');
  await tick(2000);
  await until(() => lead.snapshot.enemies.find(enemy => enemy.id === target.id)?.hp < targetHp, 'authoritative spell damage reaches event enemy');
  const healer = team[23], ally = team[22];
  healer.send({ type: 'attack', ability: 'prayer-of-mending', targetId: ally.id });
  await until(() => healer.player().casting?.ability === 'prayer-of-mending', 'group heal accepts unpartied event teammate');
  await tick(2000);
  await until(() => healer.messages.some(message => message.type === 'combat' && message.ability === 'prayer-of-mending' && message.targets.some(target => target.id === ally.id)), 'group heal resolves across event team');

  assert(!JSON.stringify(lead.snapshot).includes('"threat"'), 'combat runtime does not leak into snapshots');
  lead.socket.terminate();
  await until(() => team[1].snapshot.instantCombat.run.members === 19, 'disconnect removes participant');
  const rejoined = await connect(0);
  assert.equal(rejoined.snapshot.instanceId, null, 'reconnect cannot bypass closed registration');
  assert.deepEqual({ x: rejoined.player().x, z: rejoined.player().z, zone: rejoined.player().zone }, origins[0]);
  await tick(INSTANT_COMBAT.maxDurationMs + INSTANT_COMBAT.returnMs + 1);
  await tick(INSTANT_COMBAT.returnMs + 1);
  await until(() => team.slice(1).every(client => !client.snapshot.instanceId), 'bounded encounter cleanup');
  for (const client of clients) client.socket.terminate();
  await game.stop(); game = null;
  const saved = JSON.parse(readFileSync(join(dataDir, 'players.json'), 'utf8'));
  heroes.forEach((hero, index) => {
    const player = saved[createHash('sha256').update(tokens[index]).digest('hex')].characters[0];
    assert.equal(player.x, origins[index].x); assert.equal(player.z, origins[index].z, 'saved locations never contain arena coordinates');
    assert.equal(player.gold, hero.gold); assert.equal(player.xp, hero.xp, 'baseline event does not silently add reward economics');
  });
  console.log('PASS live Instant Combat: warning, authoritative signup cutoff, duplicate registration, 3 brackets (16–60), 20-player overflow, 90-second preparation, PvE instance isolation, five-round kickoff, leave, reconnect, timeout and durable return coordinates.');
} finally {
  for (const client of clients) client.socket.terminate();
  await game?.stop(); Date.now = realNow; rmSync(dataDir, { recursive: true, force: true });
}
