import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { CITY_LAYOUTS, insideAnyCity } from '../src/city.ts';
import { TRAINING_DUMMIES, TRAINING_DUMMY_HP, TRAINING_DUMMY_RESET_MS } from '../src/training-dummies.ts';
import { MONSTERS, monsterLevel, monsterStatsAtLevel } from '../src/bestiary.ts';
import { canTraverse, createOverworldSpawns } from '../src/realm.ts';
import { starterGear, combatStats } from '../src/progression.ts';
import { SPELLS, spellsForClass, spellDamage, spellTotalDamage } from '../src/spells.ts';
import { AUTO_ATTACKS, autoAttackTiming, autoAttackDamage } from '../src/auto-attacks.ts';
import { combatTiming } from '../src/combat-timing.ts';

// Real combat messages and ticks, with isolated saves and a controllable wall clock.
const dir = mkdtempSync(join(tmpdir(), 'mossvale-training-dummies-')), realNow = Date.now, clients = [];
let clock = realNow(), game, port;
Date.now = () => clock;
const classes = ['Ranger', 'Knight', 'Mage', 'Cleric'];
async function until(fn, label) {
  const end = realNow() + 5000;
  while (realNow() < end) { const value = fn(); if (value) return value; await delay(10); }
  throw Error(`Timed out: ${label}`);
}
async function tick(at = clock) {
  assert(at >= clock, 'monotonic fixture clock'); const before = clients.map(client => client.snapshot); clock = Math.ceil(at);
  await until(() => clients.every((client, index) => client.snapshot !== before[index] && client.snapshot?.serverTime >= clock), `realm snapshots at ${clock}`);
}
function hero(dummy, index) {
  const className = classes[index % classes.length], point = { x: dummy.x, z: dummy.z + 2 };
  assert(canTraverse(point, dummy), `${dummy.zone}: unobstructed melee/spell approach`);
  return { id: randomUUID(), name: `Practitioner ${index}`, appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className },
    coordinateVersion: 2, zone: dummy.zone, ...point, rotation: Math.PI, level: 60, hp: 808, maxHp: 808, xp: 0, gold: 0,
    characterCreated: true, talents: [], ...starterGear(className), learnedSpells: spellsForClass(className).map(spell => spell.id),
    inventory: { wood: 0, crystal: 0, herb: 0, potion: 3, relic: 0 }, skills: { mining: 0, woodcutting: 0, herbalism: 0 }, quest: { stage: 0, kills: 0, crystals: 0 } };
}
async function connect(token, dummy) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, dummy, messages: [] }; clients.push(c);
  c.send = message => socket.send(JSON.stringify(message));
  c.player = () => c.snapshot?.players.find(player => player.id === c.welcome?.id);
  c.enemy = () => c.snapshot?.enemies.find(enemy => enemy.id === dummy.id);
  c.hits = () => c.messages.filter(message => message.type === 'damage' && message.targetId === dummy.id && !message.effect);
  socket.on('message', raw => { const message = JSON.parse(raw); c.messages.push(message); if (['roster', 'welcome', 'snapshot'].includes(message.type)) c[message.type] = message; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token }); await until(() => c.roster, 'roster');
  c.send({ type: 'selectCharacter', characterId: c.roster.characters[0].id }); await until(() => c.player() && c.enemy(), 'city world entry');
  return c;
}
async function cast(c, ability) {
  await tick(Math.max(clock, c.player().globalCooldownUntil || 0, c.player().abilityCooldowns[ability] || 0) + 1);
  const index = c.messages.length, hits = c.hits().length;
  c.send({ type: 'attack', targetId: c.dummy.id, ability });
  const prepared = await until(() => c.player().casting || c.messages.slice(index).find(message => message.type === 'combat' && message.playerId === c.player().id), `${ability}: accepted`);
  if (prepared.endsAt) await tick(prepared.nextTickAt ?? prepared.endsAt);
  const release = await until(() => c.messages.slice(index).find(message => message.type === 'combat' && message.playerId === c.player().id), `${ability}: released`);
  const target = release.targets.find(target => target.id === c.dummy.id); assert(target, `${ability}: includes the city dummy`);
  const timing = combatTiming(ability, Math.hypot(target.x - release.from.x, target.z - release.from.z), release.targets.indexOf(target));
  const due = release.startedAt + (timing.delay + timing.flight) * 1000;
  if (due > clock) await tick(due - 1);
  assert.equal(c.hits().length, hits, 'damage and hit animation wait for contact');
  await tick(Math.max(clock, due)); await until(() => c.hits().length > hits, `${ability}: damage event`);
  return due;
}
async function basic(c) {
  await tick(Math.max(clock, c.player().globalCooldownUntil || 0) + 2000);
  const index = c.messages.length, hits = c.hits().length;
  c.send({ type: 'autoAttack', targetId: c.dummy.id });
  const release = await until(() => c.messages.slice(index).find(message => message.type === 'combat' && message.basic && message.playerId === c.player().id), 'auto release');
  const timing = autoAttackTiming(c.player().appearance.className, 2), due = release.startedAt + (timing.delay + timing.flight) * 1000;
  await tick(due); await until(() => c.hits().length > hits, 'auto impact');
  c.send({ type: 'autoAttack', targetId: null }); await until(() => c.player().autoAttack === null, 'auto stop');
  return due;
}
const progress = c => structuredClone({ xp: c.player().xp, gold: c.player().gold, inventory: c.player().inventory, achievements: c.player().achievements, quest: c.player().quest, contracts: c.player().contracts });
try {
  assert.equal(TRAINING_DUMMY_HP, 100000);
  assert.equal(TRAINING_DUMMIES.length, CITY_LAYOUTS.length, 'one dummy in every city');
  assert.equal(new Set(TRAINING_DUMMIES.map(dummy => dummy.zone)).size, CITY_LAYOUTS.length);
  assert.deepEqual(createOverworldSpawns().filter(spawn => spawn.kind === 'training-dummy'), TRAINING_DUMMIES);
  for (const dummy of TRAINING_DUMMIES) {
    assert(insideAnyCity(dummy.x, dummy.z));
    assert.equal(monsterLevel(dummy.kind, dummy.zone, dummy.zone, dummy.id), 1, 'no regional mitigation for practice');
    assert.equal(monsterStatsAtLevel(dummy.kind, 60).hp, 100000, 'frontier scaling cannot alter dummy HP');
  }
  const players = TRAINING_DUMMIES.map(hero), tokens = players.map(() => randomBytes(32).toString('base64url'));
  writeFileSync(join(dir, 'players.json'), JSON.stringify(Object.fromEntries(players.map((player, index) => [createHash('sha256').update(tokens[index]).digest('hex'), { characters: [player] }]))));
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' }); port = await game.start();
  for (const [index, dummy] of TRAINING_DUMMIES.entries()) await connect(tokens[index], dummy);
  const originalProgress = clients.map(progress);
  for (const c of clients) {
    assert.equal(c.enemy().maxHp, 100000); assert.equal(c.enemy().hp, 100000); assert(c.enemy().alive);
    const ability = AUTO_ATTACKS[c.player().appearance.className].ability;
    const castAt = await cast(c, ability);
    assert.equal(c.hits().at(-1).amount, spellDamage(SPELLS[ability], combatStats(c.player())));
    assert.equal(c.enemy().hp, 100000 - c.hits().at(-1).amount, `${c.dummy.zone}: real spell damage`);
    const status = SPELLS[ability].status;
    if (status?.kind === 'burn' || status?.kind === 'poison') {
      await tick(castAt + status.durationMs);
      assert.equal(c.enemy().hp, 100000 - spellTotalDamage(SPELLS[ability], combatStats(c.player())), 'practice includes the full damage-over-time effect');
    }
    const before = c.enemy().hp; await basic(c);
    assert.equal(c.enemy().hp, before - autoAttackDamage(c.player().appearance.className, combatStats(c.player())), 'normal basic damage');
  }
  // A boosted catalog fixture reaches 1 HP in one hit without trusting forged network damage.
  const ranger = clients[0], poison = SPELLS['poison-shot'], scale = poison.damageScale;
  let due;
  try { poison.damageScale = 100000; due = await cast(ranger, poison.id); } finally { poison.damageScale = scale; }
  assert.equal(ranger.enemy().hp, 1); assert(ranger.enemy().alive);
  const hitCount = ranger.hits().length;
  for (let i = 1; i <= poison.status.ticks; i++) {
    await tick(due + i * poison.status.durationMs / poison.status.ticks);
    assert.equal(ranger.enemy().hp, 1); assert.equal(ranger.hits().length, hitCount + i, 'poison emits recoil at 1 HP');
  }
  const lastPoison = due + poison.status.durationMs;
  await tick(lastPoison + TRAINING_DUMMY_RESET_MS - 1000); assert.equal(ranger.enemy().hp, 1, 'no early reset');
  due = await cast(ranger, 'arrow'); assert.equal(ranger.enemy().hp, 1, 'an impact before the deadline renews inactivity');
  await tick(due + TRAINING_DUMMY_RESET_MS - 1); assert.equal(ranger.enemy().hp, 1, 'floor hits refresh the timer');
  await tick(due + TRAINING_DUMMY_RESET_MS); assert.equal(ranger.enemy().hp, 100000, 'exact ten-second full reset');
  const volley = SPELLS.volley, volleyScale = volley.damageScale;
  try { volley.damageScale = 100000; await cast(ranger, volley.id); } finally { volley.damageScale = volleyScale; }
  assert.equal(ranger.enemy().hp, 1, 'radial spell cannot kill the dummy');
  const beforeBasic = ranger.hits().length; await basic(ranger); assert.equal(ranger.enemy().hp, 1); assert.equal(ranger.hits().length, beforeBasic + 1, 'basic recoil still fires at the floor');
  await cast(clients[1], 'shield-bash'); await cast(clients[2], 'frostbolt');
  await tick(clock + 60000);
  for (const [index, c] of clients.entries()) {
    assert.equal(c.enemy().hp, 100000, 'late tick resets fully'); assert(c.enemy().alive); assert.equal(c.enemy().diedAt, 0);
    assert.deepEqual({ x: c.enemy().x, z: c.enemy().z }, { x: c.dummy.x, z: c.dummy.z }, 'no patrol, chase, knockback or relocation');
    assert.equal(c.enemy().attack, null); assert.equal(c.enemy().targetId, null); assert.equal(c.player().hp, c.player().maxHp, 'no retaliation');
    assert.deepEqual(progress(c), originalProgress[index], 'no XP, gold, inventory, quest, contract or achievement rewards');
    assert(!c.snapshot.loot.some(drop => drop.enemyId === c.dummy.id), 'no corpse or loot');
  }
  // Delayed server ticks may resolve two old impacts across an inactivity boundary in one pass.
  const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  const applyDamageSource = source.match(/  function applyDamage\([^]*?\n  \}/)[0], events = [];
  const applyDamage = runInNewContext(`(${applyDamageSource})`, { TRAINING_DUMMY_RESET_MS, triggerEdicts() {}, broadcast: event => events.push(event) });
  const target = { ...TRAINING_DUMMIES[0], hp: 100000, maxHp: 100000 };
  applyDamage(target, 'enemy', 200000, null, 0); assert.equal(target.hp, 1);
  applyDamage(target, 'enemy', 20, null, TRAINING_DUMMY_RESET_MS); assert.equal(target.hp, 99980, 'heal precedes a late hit after ten idle seconds');
  applyDamage(target, 'enemy', 0, null, 15000); assert.equal(target.lastHitAt, 10000, 'zero damage does not refresh inactivity');
  assert.equal(events.length, 2); assert.equal(MONSTERS['training-dummy'].xp, 0); assert.equal(MONSTERS['training-dummy'].gold, 0);
  console.log('PASS: city dummies through real spell, melee, ranged auto, radial, poison and status combat; 100k HP, 1 HP floor, visible floor hits, ten-second/late reset, stationary/passive behavior and no rewards.');
} finally {
  for (const c of clients) c.socket.terminate();
  await game?.stop(); Date.now = realNow; rmSync(dir, { recursive: true, force: true });
}
