import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { ZONES } from '../src/content.ts';
import { MONSTERS, monsterLevelScale } from '../src/bestiary.ts';
import { storeBoostMultiplier } from '../src/ingame-store.ts';
import { starterGear, combatStats } from '../src/progression.ts';
import { SPELLS, spellsForClass, spellDamage } from '../src/spells.ts';
import { combatTiming } from '../src/combat-timing.ts';
import { toWorld, canTraverse, OVERWORLD_SPAWNS } from '../src/realm.ts';
import { newContracts } from '../src/adventure.ts';
import { dungeonHazardContains } from '../src/dungeon-mechanics.ts';
import { DUNGEON_START, dungeonColliders, dungeonBounds, dungeonStages, inDungeonPreparation, ROOTVAULT_ENTRANCE } from '../src/dungeon.ts';

// Real WebSockets and impact timestamps; fixtures stay beyond the capital's safe walls.
const dir = mkdtempSync(join(tmpdir(), 'mossvale-damage-')), clients = [], realNow = Date.now, slime = { ...MONSTERS['moss-slime'] };
let game, port, clock = realNow(); Date.now = () => clock;
const home = OVERWORLD_SPAWNS.find(spawn => spawn.id === 'slime-1');
const target = { id: 'damage-target', kind: 'moss-slime', x: home.x, z: home.z };
const start = { x: target.x, z: target.z - 4 };
assert(canTraverse(start,target),'canonical slime approach is clear outside the protected town footprint');
function hero(extra = {}) { return { id: randomUUID(), name: 'Damage tester', appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
  coordinateVersion: 2, zone: 'greenwood', ...start, rotation: 0, hp: 388, maxHp: 388, level: 25, xp: 0, gold: 0, characterCreated: true,
  talents: [], ...starterGear('Ranger'), learnedSpells: spellsForClass('Ranger').filter(spell=>spell.requiredLevel<=25).map(spell => spell.id),
  inventory: { wood: 0, crystal: 0, potion: 3, herb: 0, relic: 0 }, skills: { mining: 0, woodcutting: 0, herbalism: 0 },
  quest: { stage: 0, kills: 0, crystals: 0 }, ...extra }; }
async function until(fn, label) { const end = realNow() + 5000; while (realNow() < end) { const value = fn(); if (value) return value; await delay(10); } throw Error(`Timed out: ${label}`); }
async function tick(at = clock) { clock = Math.ceil(at); await delay(120); }
async function stop() { for (const client of clients.splice(0)) client.socket.terminate(); await game?.stop(); game = null; }
async function connect(token) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), client = { socket, messages: [] }; clients.push(client);
  client.send = message => socket.send(JSON.stringify(message));
  client.player = () => client.snapshot?.players.find(player => player.id === client.welcome?.id);
  client.damage = () => client.messages.filter(message => message.type === 'damage' && !message.effect);
  client.effects = effect => client.messages.filter(message => message.type === 'damage' && message.effect === effect);
  socket.on('message', raw => { const message = JSON.parse(raw); client.messages.push(message); if (['roster', 'welcome', 'snapshot'].includes(message.type)) client[message.type] = message; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  client.send({ type: 'join', token }); await until(() => client.roster, 'roster');
  client.send({ type: 'selectCharacter', characterId: client.roster.characters[0].id }); await until(() => client.player(), 'character'); return client;
}
async function fixture(heroes, hp = 100, aggroRange = 0) {
  clock += 20000;
  const tokens = heroes.map(() => randomBytes(32).toString('base64url'));
  writeFileSync(join(dir, 'players.json'), JSON.stringify(Object.fromEntries(heroes.map((player, index) => [createHash('sha256').update(tokens[index]).digest('hex'), { characters: [player] }]))));
  const spawns = ZONES[0].enemies; ZONES[0].enemies = [target]; Object.assign(MONSTERS['moss-slime'], { hp, speed: 0, aggroRange });
  try { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' }); }
  finally { ZONES[0].enemies = spawns; }
  port = await game.start(); return Promise.all(tokens.map(connect));
}
async function cast(client, ability = 'arrow') {
  await tick(clock + 2000); const count = client.damage().length, releases = client.messages.length;
  client.send({ type: 'attack', targetId: target.id, ability });
  const preparation = await until(() => client.player().casting || client.messages.slice(releases).find(message => message.type === 'combat'), 'cast or instant release');
  if(preparation.endsAt){await tick(preparation.endsAt - 1); assert.equal(client.damage().length, count, 'no numbers during preparation');await tick(preparation.endsAt);}
  const release = await until(() => client.messages.slice(releases).find(message => message.type === 'combat'), 'release');
  const timing = combatTiming(ability, Math.hypot(release.from.x - release.targets[0].x, release.from.z - release.targets[0].z));
  const impact = release.startedAt + (timing.delay + timing.flight) * 1000;
  await tick(impact - 1); assert.equal(client.damage().length, count, 'no numbers before projectile impact');
  return impact;
}
try {
  // Completed-vault legacy saves retain entry after the guardian was introduced.
  const contracts = newContracts(); contracts.completed['hollow-vault'] = clock - 1000;
  const [actor, remote, dungeon] = await fixture([hero(), hero({ zone: 'amberwild', ...toWorld('amberwild', { x: 0, z: 22 }) }), hero({ ...ROOTVAULT_ENTRANCE, contracts })]);
  assert.equal(dungeon.player().rootvaultUnlocked,true,'the isolated observer uses earned legacy dungeon access');
  dungeon.send({ type: 'dungeonEnter' }); await until(() => dungeon.player().instanceId, 'isolated dungeon');
  let due = await cast(actor), amount = spellDamage(SPELLS.arrow, combatStats(actor.player())); await tick(due + 1);
  assert.deepEqual(actor.damage(), [{ type: 'damage', targetId: target.id, targetKind: 'enemy', amount, x: target.x, z: target.z }]);
  assert.deepEqual(remote.damage(), actor.damage(), 'continuous-world observers retain cross-biome routing');
  assert(!dungeon.damage().some(event => event.targetId === target.id), 'overworld damage never leaks into a dungeon instance');
  assert.equal(actor.snapshot.enemies.find(enemy => enemy.id === target.id).hp, 100 - amount);
  due = await cast(actor, 'power-shot'); await tick(due + 1);
  assert.equal(actor.damage()[1].amount, 100 - amount, 'killing blow reports actual remaining HP, not overkill');
  assert.equal(actor.snapshot.enemies.find(enemy => enemy.id === target.id).alive, false);
  assert.deepEqual(actor.effects('xp'),[{type:'damage',targetId:actor.player().id,targetKind:'player',effect:'xp',amount:actor.player().xp,x:actor.player().x,z:actor.player().z}],'kill XP appears once over its actual recipient');
  assert(actor.effects('xp')[0].amount>0);assert.equal(remote.effects('xp').length,0,'another player never sees your private XP');assert.equal(dungeon.effects('xp').length,0);
  await tick(clock + 1000); assert.equal(actor.damage().length, 2, 'dead targets do not produce extra numbers'); assert.equal(actor.effects('xp').length,1,'a killing blow grants only one XP number'); await stop();

  const [ranger] = await fixture([hero()], 1000); due = await cast(ranger, 'poison-shot'); await tick(due + 1);
  const stats = combatStats(ranger.player()), poison = SPELLS['poison-shot'].status;
  assert.equal(ranger.damage()[0].amount, spellDamage(SPELLS['poison-shot'], stats));
  for (let i = 1; i <= poison.ticks; i++) {
    await tick(due + i * poison.durationMs / poison.ticks - 1); assert.equal(ranger.damage().length, i, 'poison numbers wait for each real tick');
    await tick(clock + 2); assert.equal(ranger.damage()[i].amount, Math.max(1, Math.round(stats.primaryDamage * poison.tickScale)));
  }
  assert.equal(1000 - ranger.snapshot.enemies.find(enemy => enemy.id === target.id).hp, ranger.damage().reduce((sum, event) => sum + event.amount, 0)); await stop();

  for (const hp of [1, 385]) {
    const [victim] = await fixture([hero({ x: target.x, z: target.z - .5, hp })], 100, slime.aggroRange);
    const attack = await until(() => victim.snapshot.enemies.find(enemy => enemy.id === target.id).attack, 'monster attack');
    await tick(attack.impactAt - 1); assert.equal(victim.damage().length, 0, 'incoming numbers wait for the swing');
    await tick(attack.impactAt);
    assert.deepEqual(victim.damage()[0], { type: 'damage', targetId: victim.player().id, targetKind: 'player', amount: hp - victim.player().hp, x: victim.player().x, z: victim.player().z });
    assert(victim.damage()[0].amount > 0); if (hp === 1) assert.equal(victim.damage()[0].amount, 1);
    if (hp > 1) {
      const count = victim.damage().length, before = victim.player().hp;
      victim.send({ type: 'heal' }); await until(() => victim.player().hp > before && victim.effects('heal').length, 'healing');
      const healed=victim.player().hp-before;
      assert.equal(victim.damage().length,count,'healing does not add a harmful-damage event');assert.equal(victim.player().hp,victim.player().maxHp);
      assert(healed>0&&healed<55,'near-full health clamps the displayed heal instead of reporting the nominal potion power');
      assert.deepEqual(victim.effects('heal'),[{type:'damage',targetId:victim.player().id,targetKind:'player',effect:'heal',amount:healed,x:victim.player().x,z:victim.player().z}]);
      await tick(clock+1500);victim.send({type:'heal'});await delay(40);assert.equal(victim.effects('heal').length,1,'zero overhealing creates no extra number');
    }
    await stop();
  }

  // Exercise the shipped eruption resolver at its exact boundary without replaying every dungeon room.
  const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  const extract = (name, next) => `(${source.match(new RegExp(`  function ${name}\\([^]*?\\n  \\}\\n  function ${next}`))[0].replace(new RegExp(`\\n  function ${next}$`), '').trim()})`;
  const events = [], applyDamage = runInNewContext(extract('applyDamage', 'event'), {arenaMode:s=>s?.duel?.mode==='arena',sessions:new Map(),broadcast: (event, zone, instanceId) => events.push({ event: JSON.parse(JSON.stringify(event)), zone, instanceId }) });
  const player = hero({ zone: 'hollow', ...DUNGEON_START, hp: 3 }), session = { player, instanceId: 'damage-vault' };
  const observers = ['invisible', 'flying'].map(mode => ({ player: hero({ zone: 'hollow', ...DUNGEON_START, hp: 3 }), instanceId: session.instanceId, gm: { [mode]: true } }));
  const hazard = { ...DUNGEON_START, r: 4.5, damage: 32, startedAt: clock, endsAt: clock + 1800, sourceId: 'fixture-boss', sourceLevel: 14, sourceName: 'The Heartkeeper', label: 'Root eruption · move out' }, vault = { id: session.instanceId, members: [player.id, ...observers.map(s => s.player.id)], hazards: [hazard], lastHazard: clock + 99999 };
  const eruption = runInNewContext(extract('updateDungeonHazards', 'leaveSession'), { dungeons: new Map([[vault.id, vault]]), enemies: [{ id: 'fixture-boss', kind: 'root-warden', alive: true, instanceId: vault.id, level: 14, ...DUNGEON_START }],
    sessions: new Map([session, ...observers].map(s => [s.player.id, s])), gmObserver: s => !!(s.gm?.invisible || s.gm?.flying), distance: (a, b) => Math.hypot(a.x - b.x, a.z - b.z), canTraverse, instanceColliders: () => dungeonColliders(), dungeonHazardContains, dungeonBounds, dungeonStages, inDungeonPreparation, dungeonPreparing: s => inDungeonPreparation(s.player), combatStats, storeBoostMultiplier, monsterLevelScale, applyDamage,
    activeCompanion: () => null, enemyCombatCompanion: () => null, stand: () => {}, playerDied: () => {}, event: () => {}, dirty: () => {} });
  eruption(hazard.endsAt - 1, true); assert.equal(events.length, 0); eruption(hazard.endsAt, true);
  assert.deepEqual(events, [{ event: { type: 'damage', targetId: player.id, targetKind: 'player', amount: 3, x: player.x, z: player.z }, zone: 'hollow', instanceId: vault.id }]);
  assert(observers.every(s => s.player.hp === 3), 'invisible and flying GM observers are excluded from dungeon hazards');
  eruption(hazard.endsAt + 1, true); assert.equal(events.length, 1, 'resolved hazards do not emit twice');
  console.log('Damage events passed: canonical spawn projectile/poison impacts, actual damage and healing clamps, private XP recipients, continuous-world routing, legacy-unlocked dungeon isolation and eruption timing.');
} finally { await stop(); Date.now = realNow; Object.assign(MONSTERS['moss-slime'], slime); rmSync(dir, { recursive: true, force: true }); }
