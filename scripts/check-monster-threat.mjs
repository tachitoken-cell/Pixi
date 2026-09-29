import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { ZONES } from '../src/content.ts';
import { starterGear, combatStats } from '../src/progression.ts';
import { combatTiming } from '../src/combat-timing.ts';
import { canTraverse, regionAt } from '../src/realm.ts';
import { movementCost } from '../src/landscape.ts';
import { WALK_SPEED } from '../src/travel.ts';
import { SPELLS, spellCastTimeMs } from '../src/spells.ts';
import { MONSTERS, monsterPursuitSpeed } from '../src/bestiary.ts';

const dir = mkdtempSync(join(tmpdir(), 'mossvale-threat-')), realNow = Date.now, clients = [];
let clock = realNow(), game, port;
Date.now = () => clock;
// The capital is safe and has solid buildings; retain this encounter on a clear wilderness corridor.
const offsetX = -452, corridorZ = -60;
const spawn = { id: 'threat-target', kind: 'root-warden', x: 12 + offsetX, z: corridorZ, roaming: true };
function hero(name, x, level = 1) {
  return { id: randomUUID(), name, x: x + offsetX, z: corridorZ, zone: regionAt(x + offsetX, corridorZ), coordinateVersion: 2, rotation: 0,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
    characterCreated: true, talents: [], learnedSpells: level >= SPELLS['poison-shot'].requiredLevel ? ['arrow', 'poison-shot'] : ['arrow'], ...starterGear('Ranger'), level, hp: 100 + (level - 1) * 12, maxHp: 100 + (level - 1) * 12, xp: 0, gold: 0,
    inventory: { wood: 0, crystal: 0, herb: 0, potion: 3, relic: 0 }, quest: { stage: 0, kills: 0, crystals: 0 } };
}
async function until(fn, label) {
  const end = realNow() + 4000;
  while (realNow() < end) { const value = fn(); if (value) return value; await delay(10); }
  throw Error(`Timed out: ${label}`);
}
async function tick(ms = 0) { clock += ms; await delay(120); }
async function start(players) {
  clock += 20000;
  const tokens = players.map(() => randomBytes(32).toString('base64url'));
  writeFileSync(join(dir, 'players.json'), JSON.stringify(Object.fromEntries(players.map((p, i) =>
    [createHash('sha256').update(tokens[i]).digest('hex'), { characters: [p] }]))));
  const original = ZONES[0].enemies;
  ZONES[0].enemies = [spawn];
  try { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' }); }
  finally { ZONES[0].enemies = original; }
  port = await game.start();
  return tokens;
}
async function connect(token) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, messages: [] };
  clients.push(c);
  c.send = message => socket.send(JSON.stringify(message));
  c.player = () => c.snapshot?.players.find(p => p.id === c.welcome?.id);
  c.enemy = () => c.snapshot?.enemies.find(e => e.id === spawn.id);
  socket.on('message', raw => {
    const m = JSON.parse(raw); c.messages.push(m);
    if (['snapshot', 'roster', 'welcome'].includes(m.type)) c[m.type] = m;
  });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token }); await until(() => c.roster, 'roster');
  c.send({ type: 'selectCharacter', characterId: c.roster.characters[0].id });
  await until(() => c.player(), 'world entry');
  await tick(); return c;
}
async function disconnect(c) {
  c.socket.close(); await until(() => c.socket.readyState === WebSocket.CLOSED, 'disconnect'); await tick();
}
async function stop() { for (const c of clients.splice(0)) c.socket.terminate(); await game?.stop(); game = null; }
async function cast(c, ability = 'arrow') {
  const readyAt=Math.max(c.player().globalCooldownUntil||0,c.player().abilityCooldowns?.[ability]||0);
  if(readyAt>clock)await tick(readyAt-clock+1);
  const oldCount = c.messages.length;
  c.send({ type: 'attack', ability, targetId: spawn.id });
  const duration = spellCastTimeMs(SPELLS[ability], combatStats(c.player()));
  let releasedAt=clock;
  if(duration){
    const casting = await until(() => c.player().casting, 'attack preparation');
    assert.equal(casting.endsAt - casting.startedAt, duration);
    assert(!c.messages.slice(oldCount).some(m => m.type === 'combat' && m.playerId === c.welcome.id), 'preparation adds no attack event or damage threat');
    releasedAt=casting.endsAt;await tick(releasedAt - clock);
  }
  const event = await until(() => c.messages.slice(oldCount).find(m => m.type === 'combat' && m.playerId === c.welcome.id), 'released attack');
  assert.equal(event.startedAt, releasedAt);
  const target = event.targets.find(t => t.id === spawn.id), timing = combatTiming(ability, Math.hypot(target.x - event.from.x, target.z - event.from.z));
  return event.startedAt + (timing.delay + timing.flight) * 1000;
}
async function impact(c, ability) { const due = await cast(c, ability); await tick(due - clock + 1); return due; }
async function move(c, x) {
  const p = c.player(), to = { x, z: corridorZ };
  assert(canTraverse(p, to), 'fixture movement is unobstructed');
  c.send({ type: 'move', ...to, rotation: 0, zone: p.zone });
  await until(() => Math.abs(c.player().x - x) < .00001, 'accepted movement');
}
async function walk(c, x) {
  while (Math.abs(c.player().x - x) > .001) {
    const p = c.player(), next = p.x + Math.sign(x - p.x) * Math.min(3, Math.abs(x - p.x));
    clock += Math.ceil(movementCost(p, { x: next, z: corridorZ }) / WALK_SPEED * 1000) + 30;
    await move(c, next);
  }
}
try {
  const level = SPELLS['poison-shot'].requiredLevel;
  const aHero = hero('First attacker', 14, level), bHero = hero('Second attacker', 16, level);
  let tokens = await start([aHero, bHero]), a = await connect(tokens[0]), b = await connect(tokens[1]);
  assert.equal(a.enemy().targetId, aHero.id, 'the first nearby target is retained');
  await impact(a); await tick(600);
  let due = await cast(b); await tick(due - clock - 1);
  assert.equal(b.enemy().targetId, aHero.id, 'casting does not generate early threat');
  await tick(2); assert.equal(b.enemy().targetId, aHero.id, 'equal damage does not steal aggro');
  await tick(600); due = await cast(b); await tick(due - clock - 1);
  assert.equal(b.enemy().targetId, aHero.id, 'higher pending damage waits for impact');
  await tick(2); assert.equal(b.enemy().targetId, bHero.id, 'higher accumulated damage takes aggro despite the first player being closer');
  await tick(600); due = await impact(a, 'poison-shot');
  assert.equal(a.enemy().targetId, bHero.id, 'weaker poison impact does not take aggro');
  await tick(due + 1001 - clock); assert.equal(a.enemy().targetId, bHero.id, 'a poison tick reaching equal threat retains the target');
  await tick(1000); assert.equal(a.enemy().targetId, aHero.id, 'later poison damage can overtake threat');
  await disconnect(a); assert.equal(b.enemy().targetId, bHero.id, 'disconnect drops the old target and keeps another combatant');
  a = await connect(tokens[0]); assert.equal(a.enemy().targetId, bHero.id, 'reconnecting does not restore stale threat');
  await stop();

  tokens = await start([hero('Chase tester', 19)]); a = await connect(tokens[0]);
  const beforeChase = { ...a.enemy() };
  assert.equal(MONSTERS[spawn.kind].speed, 2.7, 'warden chase speed is increased from 1.8 to 2.7m/s');
  await tick(200);
  assert(Math.abs(Math.hypot(a.enemy().x - beforeChase.x, a.enemy().z - beforeChase.z) - monsterPursuitSpeed(spawn.kind) * .2) < 1e-6, 'server pursuit covers the configured distance in a 200ms tick');
  await impact(a);
  await walk(a, 43 + offsetX);
  assert.equal(a.enemy().targetId, a.welcome.id, 'chase continues outside initial aggro and 20-meter home radius');
  for (let i = 0; i < 90 && a.enemy().x < 33 + offsetX; i++) await tick(200);
  assert(a.enemy().x > 32 + offsetX, 'the monster physically chases beyond its former home leash');
  while (a.player().x - a.enemy().x < 37.8) await walk(a, a.player().x + Math.min(3, 38 - (a.player().x - a.enemy().x)));
  // Refill movement budget first, then freeze the clock so the exact boundary is observable.
  await tick(1000); await move(a, a.enemy().x + 40);
  assert.equal(a.enemy().targetId, a.welcome.id, '40 meters is still in chase range');
  await move(a, a.player().x + .01);
  assert.equal(a.enemy().targetId, null, 'more than 40 meters drops aggro');
  assert(a.enemy().alive, 'evading leaves a living monster available for a new encounter');
  console.log('PASS monster threat: chase beyond aggro/home ranges, exact 40m boundary, damage-impact timing, equal-threat retention, damage/poison overtakes, disconnect and reconnect cleanup.');
} finally { await stop(); Date.now = realNow; rmSync(dir, { recursive: true, force: true }); }
