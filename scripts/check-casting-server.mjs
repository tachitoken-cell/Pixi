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
import { SPELLS, spellsForClass, spellDamage, spellTotalPower, spellCastTimeMs } from '../src/spells.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { combatTiming } from '../src/combat-timing.ts';
import { canTraverse, OVERWORLD_SPAWNS } from '../src/realm.ts';
import { waterAt } from '../src/landscape.ts';
import { insideCity } from '../src/city.ts';
import { ARENA_ENTRANCE } from '../src/arena.ts';

// Real WebSockets and the shipped tick loop; controlled integer milliseconds match Date.now without wall-time races.
const dir = mkdtempSync(join(tmpdir(), 'mossvale-casting-')), realNow = Date.now;
let clock = realNow(), game, port, manualTick;
Date.now = () => clock;
const slimeStats = { ...MONSTERS['moss-slime'] };
Object.assign(MONSTERS['moss-slime'], { speed: 0, aggroRange: 0 });
const clients = [];
// Keep the same encounter geometry on clear ground beyond the new capital walls.
const combatBase = OVERWORLD_SPAWNS.find(enemy=>enemy.id==='slime-1');
const at = (x, z) => ({ x: combatBase.x + x - 12, z: combatBase.z + z + 1 });
assert(canTraverse(at(12, -5), at(12, 10)) && !waterAt(at(12, -1).x, at(12, -1).z) && !insideCity(at(12, -1).x, at(12, -1).z));
async function until(fn, label) {
  const end = realNow() + 3500;
  while (realNow() < end) { const value = fn(); if (value) return value; await delay(10); }
  throw Error(`Timed out: ${label}`);
}
async function tick(at = clock) { clock = Math.ceil(at); manualTick?.(); await delay(120); }
async function request(client, message) {
  const id = client.messages.length;
  client.send(message); client.send({ type: 'ping', id });
  await until(() => client.messages.some(reply => reply.type === 'pong' && reply.id === id), `${message.type} processed before the next tick`);
}
function hero(className, extra = {}) {
  const level = 25, maxHp = 100 + (level - 1) * 12;
  return { id: randomUUID(), name: 'Cast tester', appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className },
    coordinateVersion: 2, zone: 'greenwood', x: 12, z: -1, rotation: 0, hp: maxHp, maxHp, level, xp: 0, gold: 0, characterCreated: true,
    talents: [], ...starterGear(className), learnedSpells: spellsForClass(className).filter(spell=>spell.requiredLevel<=level).map(spell => spell.id), ridingRank: 1, ownedMounts: ['horse'],
    inventory: { wood: 0, crystal: 0, potion: 3, herb: 0, relic: 0 }, skills: { mining: 0, woodcutting: 0, herbalism: 0 },
    quest: { chapter: 0, stage: 1, kills: 0, crystals: 0, progress: { 'grove-slimes': 0, 'grove-crystals': 0 }, completed: false, ending: null }, ...extra, ...at(extra.x ?? 12, extra.z ?? -1) };
}
async function fixture(heroes, spawns = [{ id: 'cast-target', kind: 'moss-slime', x: 12, z: 3 }], targetHp = 2000, pauseTicks = false) {
  clock += 20000;
  const tokens = heroes.map(() => randomBytes(32).toString('base64url'));
  writeFileSync(join(dir, 'players.json'), JSON.stringify(Object.fromEntries(heroes.map((player, i) => [createHash('sha256').update(tokens[i]).digest('hex'), { characters: [player] }]))));
  const oldEnemies = ZONES[0].enemies, oldNodes = ZONES[0].nodes, oldHp = MONSTERS['moss-slime'].hp;
  ZONES[0].enemies = spawns.map(spawn => ({ ...spawn, ...at(spawn.x, spawn.z) })); ZONES[0].nodes = [{ id: 'cast-herb', kind: 'herb', ...at(12, 0) }]; MONSTERS['moss-slime'].hp = targetHp;
  const originalInterval = globalThis.setInterval;
  manualTick = null;
  // Capture the shipped loop to place a real WebSocket action between cast completion and its next tick.
  if (pauseTicks) globalThis.setInterval = (callback, ms, ...args) => ms === 100
    ? (manualTick = callback, originalInterval(() => {}, 3600000)) : originalInterval(callback, ms, ...args);
  try { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' }); }
  finally { globalThis.setInterval = originalInterval; ZONES[0].enemies = oldEnemies; ZONES[0].nodes = oldNodes; MONSTERS['moss-slime'].hp = oldHp; }
  port = await game.start();
  return Promise.all(tokens.map(connect));
}
async function connect(token) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), client = { socket, messages: [], token };
  clients.push(client);
  client.send = value => socket.send(JSON.stringify(value));
  client.player = () => client.snapshot?.players.find(player => player.id === client.welcome?.id);
  client.releases = () => client.messages.filter(message => message.type === 'combat');
  socket.on('message', raw => { const message = JSON.parse(raw); client.messages.push(message); if (['snapshot', 'roster', 'welcome'].includes(message.type)) client[message.type] = message; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  client.send({ type: 'join', token }); await until(() => client.roster, 'roster');
  client.send({ type: 'selectCharacter', characterId: client.roster.characters[0].id }); await until(() => client.player(), 'world');
  return client;
}
async function begin(client, ability = 'meteor') {
  const before=client.releases().length;
  client.send({ type: 'attack', ability, targetId: 'cast-target', endsAt: clock, castTimeMs: 0 });
  const result=await until(()=>client.player()?.casting||client.releases()[before],`cast starts: ${ability}`);
  return structuredClone(result.type==='combat'?{ability,startedAt:result.startedAt,endsAt:result.startedAt,rotation:result.rotation,targetId:result.targets[0].id}:result);
}
function impact(release) {
  const target = release.targets[0], timing = combatTiming(release.ability, Math.hypot(target.x - release.from.x, target.z - release.from.z));
  return release.startedAt + (timing.delay + timing.flight) * 1000;
}
try {
  const durations = [];
  for (const spell of ['arrow','volley','power-shot','multishot','poison-shot','fireball','nova','frostbolt','arcane-burst','meteor','strike','whirlwind','cleave','shockwave','shield-bash'].map(id=>SPELLS[id])) {
    const [actor] = await fixture([hero(spell.className)]), stats = combatStats(actor.player()), cast = await begin(actor, spell.id);
    assert.deepEqual(Object.keys(cast).sort(), ['ability', 'endsAt', 'rotation', 'startedAt', 'targetId'], 'private target refs and damage cannot leak into snapshots');
    const duration = spellCastTimeMs(spell, stats);
    assert.equal(cast.endsAt - cast.startedAt, duration);
    assert.equal(actor.releases().length,duration===0?1:0,'only instant abilities release immediately');
    if(duration>0)assert.deepEqual(actor.player().abilityCooldowns, {}, 'preparation does not spend spell cooldown');
    assert.equal(actor.player().globalCooldownUntil,cast.startedAt+1500,'GCD starts before preparation');
    const totalDamage = spellTotalPower(spell, stats);
    durations.push({ damage: totalDamage, duration });
    actor.send({ type: 'attack', ability: spellsForClass(spell.className).find(other => other.id !== spell.id).id, targetId: 'cast-target' });
    if(duration>0){await tick(cast.endsAt - 1);
    assert.deepEqual(actor.player().casting, cast, 'overlap cannot replace the active cast');
    assert.equal(actor.releases().length, 0, 'no release before the final millisecond');}
    assert.equal(actor.snapshot.enemies.find(enemy => enemy.id === 'cast-target').hp, 2000);
    await tick(cast.endsAt);
    const release = await until(() => actor.releases()[0], 'cast released');
    assert.equal(release.startedAt, cast.endsAt); assert.equal(release.castTimeMs, duration);
    assert.equal(actor.player().casting, null);
    assert.equal(actor.player().abilityCooldowns[spell.id], cast.endsAt + spell.cooldownMs);
    await tick(impact(release) - 1);
    assert.equal(actor.snapshot.enemies.find(enemy => enemy.id === 'cast-target').hp, 2000, 'damage still waits for projectile/weapon impact after casting');
    await tick(impact(release) + 1);
    assert.equal(actor.snapshot.enemies.find(enemy => enemy.id === 'cast-target').hp, 2000 - spellDamage(spell, stats));
    if (spell.status?.ticks) {
      await tick(impact(release) + spell.status.durationMs + 1);
      assert.equal(actor.snapshot.enemies.find(enemy => enemy.id === 'cast-target').hp, 2000 - totalDamage, 'cast duration includes poison damage but ticks keep their own timing');
    }
    await game.stop(); game = null;
  }
  assert(durations.some(({duration})=>duration===0)&&durations.some(({duration})=>duration>0),'legacy catalog includes both instant actions and prepared spells');

  for (const action of ['cancelCast', 'move', 'jump']) for (const offset of [-1, 0, 1]) {
    const [actor] = await fixture([hero('Mage')], undefined, 2000, true), stats = combatStats(actor.player());
    const cast = await begin(actor, 'fireball');
    clock = cast.endsAt + offset;
    await request(actor, action === 'move' ? { type: action, ...at(12.2, -1), rotation: 0 } : { type: action });
    const release = actor.releases()[0];
    assert.equal(actor.releases().length, offset < 0 ? 0 : 1, `${action} at cast end ${offset}: only unfinished casts are interrupted`);
    if (release) assert.equal(release.startedAt, cast.endsAt, 'input settlement preserves the authored release time');
    await tick(release ? impact(release) + 1 : cast.endsAt + 2000);
    assert.equal(actor.player().casting, null);
    assert.equal(actor.snapshot.enemies.find(enemy => enemy.id === 'cast-target').hp, 2000 - (release ? spellDamage(SPELLS.fireball, stats) : 0));
    await game.stop(); game = null;
  }
  for (const ability of ['arrow', 'power-shot', 'fireball']) {
    const spell = SPELLS[ability], target = at(12, 3);
    const direction = [[1,0],[-1,0],[0,1],[0,-1]].find(([x,z]) => {
      const outside = at(12+x*(spell.range+.1),3+z*(spell.range+.1));
      return canTraverse(target,outside) && !waterAt(outside.x,outside.z) && !insideCity(outside.x,outside.z);
    });
    assert(direction, `${ability} has a clear range boundary`);
    const [x,z] = direction, outside = at(12+x*(spell.range+.1),3+z*(spell.range+.1));
    const [actor] = await fixture([hero(spell.className, { x:12+x*(spell.range-.1), z:3+z*(spell.range-.1) })], undefined, 2000, true);
    const stats = combatStats(actor.player()), cast = await begin(actor, ability);
    await tick(cast.endsAt);
    const release = actor.releases()[0];
    await request(actor, { type:'move', ...outside, rotation:0 });
    await tick(clock+1);
    assert(Math.hypot(actor.player().x-target.x,actor.player().z-target.z)>spell.range, 'movement crosses the spell range before impact');
    assert.equal(actor.snapshot.enemies.find(enemy => enemy.id === 'cast-target').hp, 2000);
    await tick(impact(release)+1);
    assert.equal(actor.snapshot.enemies.find(enemy => enemy.id === 'cast-target').hp, 2000-spellDamage(spell,stats), `${ability} lands after its caster leaves range`);
    await game.stop(); game = null;
  }

  for (const action of ['cancelCast', 'move', 'jump', 'gather', 'mount', 'leaveWorld', 'disconnect', 'takeover']) {
    const [actor, observer] = await fixture([hero('Mage'), hero('Ranger', { name: 'Observer', x: 0, z: 22 })]);
    const cast = await begin(actor);
    if (action === 'move') actor.send({ type: 'move', ...at(12.2, -1), rotation: 0 });
    else if (action === 'mount') actor.send({ type: 'mount', mount: 'horse' });
    else if (action === 'gather') actor.send({ type: 'gather', targetId: 'cast-herb' });
    else if (action === 'disconnect') actor.socket.close();
    else if (action === 'takeover') await connect(actor.token);
    else actor.send({ type: action });
    if (action === 'mount') {
      await until(() => actor.player().casting?.ability === 'mount', 'mount preparation replaces spell');
      assert.equal(actor.player().travel.mount, null, 'replacing a spell does not mount immediately');
    }
    await delay(50); await tick(cast.endsAt + 5000);
    assert.equal(observer.releases().length, 0, `${action} cancels before release`);
    assert.equal(observer.snapshot.enemies.find(enemy => enemy.id === 'cast-target').hp, 2000, `${action} cannot leave delayed damage`);
    const player = observer.snapshot.players.find(player => player.id === actor.welcome.id);
    if (player) { assert.equal(player.casting, null); assert.deepEqual(player.abilityCooldowns, {}); }
    if (action === 'mount') assert.equal(player.travel.mount, 'horse', 'replacement mount finishes after preparation');
    if (action === 'cancelCast') {
      const retry = await begin(actor); assert.equal(retry.startedAt, clock, 'explicit cancellation can be retried without a cooldown');
    }
    await game.stop(); game = null;
  }

  {
    const [actor] = await fixture([hero('Ranger')]), stats = combatStats(actor.player()), cast = await begin(actor, 'power-shot');
    actor.send({ type: 'learnTalent', talentId: 'ranger-1' });
    await until(() => actor.player().talents.includes('ranger-1'), 'learn a talent during preparation');
    assert(spellDamage(SPELLS['power-shot'],combatStats(actor.player())) > spellDamage(SPELLS['power-shot'],stats));
    assert.deepEqual(actor.player().casting, cast, 'stat changes cannot shorten a cast already being prepared');
    await tick(cast.endsAt);
    await tick(impact(actor.releases()[0]) + 1);
    assert.equal(actor.snapshot.enemies.find(enemy => enemy.id === 'cast-target').hp, 2000 - spellDamage(SPELLS['power-shot'], stats), 'damage is captured with the cast duration, before equipment or talent changes');
    await game.stop(); game = null;
  }
  {
    const [actor, archer] = await fixture([hero('Mage'), hero('Ranger')], undefined, 20);
    const longCast = await begin(actor), shortCast = await begin(archer, 'arrow');
    await tick(shortCast.endsAt);
    const hitAt = impact(archer.releases()[0]); assert(hitAt < longCast.endsAt);
    await tick(longCast.endsAt);
    assert.equal(actor.snapshot.enemies.find(enemy => enemy.id === 'cast-target').alive, false);
    assert.equal(actor.releases().length, 1, 'a target killed during preparation cannot receive the later spell');
    assert.equal(actor.releases()[0].ability, 'arrow'); assert.equal(actor.player().casting, null);
    assert.deepEqual(actor.player().abilityCooldowns, {});
    await game.stop(); game = null;
  }
  {
    Object.assign(MONSTERS['moss-slime'], { aggroRange: 20, speed: 15 });
    const [decoy, actor] = await fixture([hero('Ranger', { x: 12, z: 4 }), hero('Mage', { x: 12, z: -5 })]);
    await until(() => actor.snapshot.enemies.find(enemy => enemy.id === 'cast-target').targetId === decoy.welcome.id, 'target chases nearby decoy');
    const cast = await begin(actor, 'fireball');
    for (let step = 1; step <= 6; step++) {
      await tick(cast.startedAt + step * 250);
      decoy.send({ type: 'move', ...at(12, 4 + step), rotation: 0 });
      await until(() => decoy.player().z === at(12, 4 + step).z, 'decoy walks away');
    }
    await tick(cast.endsAt);
    const target = actor.snapshot.enemies.find(enemy => enemy.id === 'cast-target');
    assert(Math.hypot(target.x - actor.player().x, target.z - actor.player().z) > SPELLS.fireball.range);
    assert.equal(actor.releases().length, 0, 'release revalidates range after the target moves');
    assert.equal(actor.player().casting, null); assert.deepEqual(actor.player().abilityCooldowns, {});
    await game.stop(); game = null;
  }

  // A lethal enemy swing earlier in a delayed tick cancels the later release.
  Object.assign(MONSTERS['moss-slime'], slimeStats);
  {
    const [victim] = await fixture([hero('Mage', { hp:1, x:12, z:2.5 })], undefined, 2000, true);
    await tick();
    const lethal = victim.snapshot.enemies.find(enemy => enemy.id === 'cast-target').attack;
    const cast = await begin(victim);
    assert(lethal.impactAt < cast.endsAt);
    clock = cast.endsAt;
    await request(victim, { type:'move', ...at(12.2,2.5), rotation:0 });
    await tick();
    assert.equal(victim.player().hp, 0); assert.equal(victim.player().casting, null);
    assert.equal(victim.releases().length, 0, 'movement at cast completion cannot bypass an earlier lethal enemy hit');
    assert.deepEqual(victim.player().abilityCooldowns, {});
    await game.stop(); game = null;
  }
  const [victim, observer] = await fixture([hero('Mage', { hp: 1, x: 12, z: 2.5 }), hero('Ranger', { name: 'Observer', x: 0, z: 22 })]);
  await until(() => victim.snapshot.enemies.find(enemy => enemy.id === 'cast-target').attack, 'enemy melee begins');
  const lethal = victim.snapshot.enemies.find(enemy => enemy.id === 'cast-target').attack;
  const cast = await begin(victim);
  assert(lethal.impactAt < cast.endsAt);
  await tick(cast.endsAt + 100);
  assert.equal(victim.player().hp, 0); assert.equal(victim.player().casting, null);
  assert.equal(observer.releases().length, 0, 'earlier enemy death wins over a later cast in the same tick');
  assert.deepEqual(victim.player().abilityCooldowns, {});
  await game.stop(); game = null;
  // Arena timeout settlement must not bypass the ordinary PvE impact/cast ordering.
  Object.assign(MONSTERS['moss-slime'], { speed: 0, aggroRange: 0 });
  {
    const arenaHero = (name, offset) => ({ ...hero('Ranger'), name, x: ARENA_ENTRANCE.x + offset, z: ARENA_ENTRANCE.z, zone: ARENA_ENTRANCE.zone });
    const [a, b, victim, observer] = await fixture([arenaHero('Amber', -1), arenaHero('Briar', 1), hero('Mage', { hp: 1, x: 12, z: 2.5 }), hero('Ranger', { name: 'Observer', x: 0, z: 22 })]);
    a.send({ type: 'arenaRequest', targetId: b.welcome.id, size: 1 });
    const invite = await until(() => b.snapshot.arenaInvites[0], 'arena invitation');
    b.send({ type: 'arenaAccept', invitationId: invite.id });
    const match = await until(() => a.snapshot.arena?.phase === 'countdown' && a.snapshot.arena, 'arena countdown');
    await tick(match.startsAt + 1);
    Object.assign(MONSTERS['moss-slime'], slimeStats);
    await tick(match.endsAt - 3100);
    const lethal = await until(() => victim.snapshot.enemies.find(enemy => enemy.id === 'cast-target').attack, 'unrelated enemy melee begins');
    const cast = await begin(victim);
    assert(lethal.impactAt < cast.endsAt && cast.endsAt < match.endsAt, 'enemy hit, cast, deadline ordered within one delayed tick');
    await tick(match.endsAt + 25);
    assert.equal(a.snapshot.arena.phase, 'finished'); assert.equal(a.snapshot.arena.winnerTeam, null);
    assert.equal(victim.player().hp, 0); assert.equal(victim.player().casting, null);
    assert.equal(observer.releases().length, 0, 'arena timeout cannot release an unrelated cast before its earlier lethal enemy impact');
    assert.deepEqual(victim.player().abilityCooldowns, {});
    await game.stop(); game = null;
  }
  console.log('Casting checks passed: all 15 retained spell IDs, explicit instant and fixed cast durations, authoritative release and impact, overlap protection, cast-boundary input ordering, released shots beyond range, cancellation, lifecycle, lethal timestamp ordering, and arena deadline isolation.');
} finally {
  for (const client of clients) client.socket.terminate();
  await game?.stop(); Date.now = realNow; Object.assign(MONSTERS['moss-slime'], slimeStats); rmSync(dir, { recursive: true, force: true });
}
