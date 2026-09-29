import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { ZONES } from '../src/content.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { starterGear } from '../src/progression.ts';
import { GLOBAL_ATTACK_MS, SPELLS, spellsForClass } from '../src/spells.ts';
import { canTraverse } from '../src/realm.ts';
import { waterAt } from '../src/landscape.ts';
import { insideVillageSafeArea, WILDERNESS_SPAWNS } from '../src/settlements.ts';

// Actual WebSockets and realm ticks; only the encounter and wall clock are controlled.
const dir = mkdtempSync(join(tmpdir(), 'mossvale-radial-')), realNow = Date.now;
const monsters = Object.fromEntries(['moss-slime', 'briar-sentinel'].map(kind => [kind, { ...MONSTERS[kind] }]));
const base = ZONES[0].enemies.find(enemy => enemy.id === 'slime-1'), at = (x, z) => ({ x: base.x + x, z: base.z + z });
const spawns = [{ id: 'anchor', kind: 'moss-slime', ...at(0, 2) }, { id: 'neighbor', kind: 'briar-sentinel', ...at(1, 3) }];
assert([base, ...spawns].every(point => !waterAt(point.x, point.z) && !insideVillageSafeArea(point.x, point.z) && canTraverse(base, point)));
let clock = realNow(), game, port;
const clients = [];
Date.now = () => clock;
async function until(fn, label) {
  const end = realNow() + 4000;
  while (realNow() < end) { const value = fn(); if (value) return value; await delay(10); }
  throw Error(`Timed out: ${label}`);
}
async function tick(time) { clock = time; await delay(120); }
async function stop() { for (const client of clients.splice(0)) client.socket.terminate(); await game?.stop(); game = null; }
function hero(className) {
  return { id: randomUUID(), name: 'Radial tester', appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className },
    coordinateVersion: 2, zone: 'greenwood', ...at(0, 0), rotation: 0, hp: 100, maxHp: 808, level: 60, xp: 0, gold: 0, characterCreated: true,
    talents: [], ...starterGear(className), learnedSpells: spellsForClass(className).map(spell => spell.id),
    inventory: { wood: 0, crystal: 0, potion: 3, herb: 0, relic: 0 }, skills: { mining: 0, woodcutting: 0, herbalism: 0 }, quest: { stage: 0, kills: 0, crystals: 0 } };
}
async function fixture(className, encounter = spawns) {
  await stop(); clock += 30000;
  const tokens = [className, 'Ranger'].map(() => randomBytes(32).toString('base64url'));
  writeFileSync(join(dir, 'players.json'), JSON.stringify(Object.fromEntries([className, 'Ranger'].map((name, i) =>
    [createHash('sha256').update(tokens[i]).digest('hex'), { characters: [hero(name)] }]))));
  const previous = ZONES[0].enemies, wilderness = WILDERNESS_SPAWNS.splice(0); ZONES[0].enemies = encounter;
  Object.assign(MONSTERS['moss-slime'], { hp: 1, speed: 0, aggroRange: 0 });
  Object.assign(MONSTERS['briar-sentinel'], { hp: 100000, speed: 0, aggroRange: 0 });
  try { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' }); }
  finally { ZONES[0].enemies = previous; WILDERNESS_SPAWNS.push(...wilderness); }
  port = await game.start();
  return Promise.all(tokens.map(async token => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), client = { socket, messages: [] }; clients.push(client);
    client.send = message => socket.send(JSON.stringify(message));
    client.player = () => client.snapshot?.players.find(player => player.id === client.welcome?.id);
    client.enemy = id => client.snapshot.enemies.find(enemy => enemy.id === id);
    client.releases = () => client.messages.filter(message => message.type === 'combat' && message.playerId === client.welcome.id);
    socket.on('message', raw => { const message = JSON.parse(raw); client.messages.push(message); if (['roster', 'welcome', 'snapshot'].includes(message.type)) client[message.type] = message; });
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    client.send({ type: 'join', token }); await until(() => client.roster, 'roster');
    client.send({ type: 'selectCharacter', characterId: client.roster.characters[0].id }); await until(() => client.player(), 'character'); return client;
  }));
}
async function begin(client, ability, targetId = 'anchor') {
  const count = client.releases().length;
  client.send({ type: 'attack', ability, ...(targetId === null ? {} : { targetId }) });
  return until(() => client.player().casting || client.releases()[count], `begin ${ability}`);
}
async function killAnchor(client) {
  await begin(client, 'arrow'); await tick(clock + 401);
  assert.equal(client.enemy('anchor').alive, false, 'helper arrow kills the original anchor before preparation finishes');
}
try {
  const radial = Object.values(SPELLS).filter(spell => spell.targetRelation === 'hostile' && spell.targeting === 'radial');
  for (const className of ['Ranger', 'Knight', 'Mage', 'Cleric']) {
    const [actor] = await fixture(className, []);
    for (const spell of spellsForClass(className).filter(spell => spell.targeting === 'radial')) {
      await tick(clock + 90001);
      const count = actor.releases().length, cast = await begin(actor, spell.id, null), duration = spell.channel?.durationMs || spell.castTimeMs;
      assert.equal(actor.player().rotation, 0, `${spell.label} preserves facing without choosing an enemy`);
      assert.equal(actor.player().globalCooldownUntil, cast.startedAt + GLOBAL_ATTACK_MS);
      if (duration) {
        assert.equal(cast.targetId, actor.player().id, 'self-centered preparations and channels anchor to the caster');
        assert.equal(cast.endsAt - cast.startedAt, duration);
        if (spell.channel) assert.equal(actor.player().abilityCooldowns[spell.id], cast.startedAt + spell.cooldownMs);
        else assert(!actor.player().abilityCooldowns[spell.id], 'preparation waits to spend its cooldown');
        await tick(cast.startedAt + (spell.channel?.tickMs || duration) - 1);
        assert.equal(actor.releases().length, count, 'empty-space spells still wait for preparation or their first channel tick');
      }
      await tick(cast.startedAt + duration + 1);
      const releases = actor.releases().slice(count), ticks = spell.channel ? duration / spell.channel.tickMs : 1;
      assert.equal(releases.length, ticks, `${spell.label} completes every release without nearby enemies`);
      for (const release of releases) assert.deepEqual(release.targets.map(target => target.id), spell.targetRelation === 'hostile' ? [] : [actor.player().id]);
      assert.equal(actor.player().casting, null);
      assert.equal(actor.player().abilityCooldowns[spell.id], cast.startedAt + (spell.channel ? 0 : duration) + spell.cooldownMs);
    }
  }
  {
    const [actor] = await fixture('Mage', []), first = await begin(actor, 'nova', null);
    actor.send({ type: 'attack', ability: 'flamewave' }); await tick(first.startedAt + GLOBAL_ATTACK_MS - 1);
    assert.equal(actor.releases().length, 1, 'empty Frost Nova starts the same global cooldown');
    await tick(first.startedAt + GLOBAL_ATTACK_MS); await begin(actor, 'flamewave', null);
    await tick(first.startedAt + SPELLS.nova.cooldownMs - 1);
    actor.send({ type: 'attack', ability: 'nova' }); await delay(40);
    assert.equal(actor.releases().length, 2, 'individual cooldown also blocks empty-space spam after the GCD');
    await tick(first.startedAt + SPELLS.nova.cooldownMs); await begin(actor, 'nova', null);
    assert.equal(actor.releases().length, 3);
    await tick(clock + 4000);
    for (const targetId of ['', 42, [], 'x'.repeat(129)]) actor.send({ type: 'attack', ability: 'nova', targetId });
    for (const ability of ['fireball', 'chain-lightning', 'meteor']) actor.send({ type: 'attack', ability });
    await delay(80);
    assert.equal(actor.releases().length, 3, 'malformed radial input and target-centered spells without enemies remain rejected');
    assert.equal(actor.player().casting, null);
  }
  {
    const [actor, helper] = await fixture('Mage', [...spawns, { id: 'far', kind: 'briar-sentinel', ...at(0, 30) }]);
    for (const targetId of [null, 'missing-enemy', helper.player().id, 'far', 'anchor']) {
      await tick(clock + 4000);
      if (targetId === 'anchor') {
        if (helper.enemy('anchor').alive) await killAnchor(helper);
        assert.equal(actor.enemy('anchor').alive, false, 'selected anchor is dead');
      }
      const hp = actor.enemy('neighbor').hp, count = actor.releases().length;
      const cast = await begin(actor, 'nova', targetId); await tick(cast.startedAt + 1000);
      assert.equal(actor.releases().length, count + 1, 'missing, stale, friendly, far and dead selection cannot block Frost Nova');
      assert(actor.enemy('neighbor').hp < hp, 'Frost Nova damages living nearby enemies without a valid selection');
      assert.equal(actor.enemy('far').hp, actor.enemy('far').maxHp, 'out-of-range selections never extend the radial area');
      assert.equal(actor.player().rotation, 0);
    }
  }
  {
    const [actor, friend] = await fixture('Cleric');
    actor.send({ type: 'partyInvite', targetId: friend.player().id }); await until(() => friend.snapshot.partyInvites.length, 'party invitation');
    friend.send({ type: 'partyAccept', invitationId: friend.snapshot.partyInvites[0].id }); await until(() => actor.snapshot.party?.members.length === 2, 'party formed');
    const ownHp = actor.player().hp, friendHp = friend.player().hp;
    await begin(actor, 'circle-of-healing', 'anchor'); await tick(clock + 1);
    assert(actor.player().hp > ownHp && friend.player().hp > friendHp, 'party radial heals center on the caster even with an enemy selected');
    assert.deepEqual(actor.releases()[0].targets.map(target => target.id).sort(), [actor.player().id, friend.player().id].sort());
    await tick(clock + 22001); await begin(actor, 'circle-of-healing', 'missing-enemy');
    assert.equal(actor.releases().length, 2, 'friendly radial healing also ignores stale selection');
    await tick(clock + 1500);
    for (const ability of ['heal', 'prayer-of-mending']) actor.send({ type: 'attack', ability, targetId: 'anchor' });
    await delay(60); assert.equal(actor.player().casting, null, 'friendly single and chain spells still reject hostile anchors');
  }
  for (const ability of ['groundbreaker', 'bladestorm']) for (const action of ['cancelCast', 'move', 'jump']) {
    const [actor] = await fixture('Knight', []), cast = await begin(actor, ability, null);
    if (SPELLS[ability].channel) {
      await tick(cast.startedAt + SPELLS[ability].channel.tickMs);
      assert.deepEqual(actor.releases()[0].targets, [], 'an empty channel begins normally before interruption');
    }
    const count = actor.releases().length;
    actor.send(action === 'move' ? { type: action, ...at(.2, 0), rotation: 0 } : { type: action });
    await until(() => actor.player().casting === null, `${action} cancels empty ${ability}`);
    await tick(cast.endsAt + 1500);
    assert.equal(actor.releases().length, count, `${action} prevents later empty-space releases`);
    assert.equal(actor.player().abilityCooldowns[ability], SPELLS[ability].channel ? cast.startedAt + SPELLS[ability].cooldownMs : undefined);
    assert.equal(actor.player().globalCooldownUntil, cast.startedAt + GLOBAL_ATTACK_MS);
  }
  for (const spell of radial.filter(spell => spell.channel)) {
    const [actor] = await fixture(spell.className), cast = await begin(actor, spell.id);
    await tick(cast.startedAt + spell.channel.tickMs + 400);
    assert.equal(actor.enemy('anchor').alive, false, `${spell.label} kills the original anchor on its first wave`);
    await tick(cast.endsAt + 1500);
    assert.equal(actor.releases().length, spell.channel.durationMs / spell.channel.tickMs, `${spell.label} continues every tick after anchor death`);
    assert(actor.releases().slice(1).every(event => event.targets.some(target => target.id === 'neighbor') && event.targets.every(target => target.id !== 'anchor')));
    const hits = actor.messages.filter(event => event.type === 'damage' && event.targetId === 'neighbor');
    assert.equal(hits.length, actor.releases().length, `${spell.label} lands every remaining wave on the living neighbor`);
    assert.equal(actor.player().casting, null);
  }
  for (const spell of radial.filter(spell => spell.castTimeMs > 0)) {
    const [actor, helper] = await fixture(spell.className), cast = await begin(actor, spell.id);
    await killAnchor(helper); await tick(cast.endsAt + 1500);
    assert.equal(actor.releases().length, 1, `${spell.label} releases even after the original anchor dies during preparation`);
    assert(actor.releases()[0].targets.some(target => target.id === 'neighbor'));
    assert(actor.releases()[0].targets.every(target => target.id !== 'anchor'));
    assert(actor.enemy('neighbor').hp < actor.enemy('neighbor').maxHp, 'prepared radial damage actually lands');
  }
  for (const ability of ['fireball', 'chain-lightning', 'meteor']) {
    const [actor, helper] = await fixture('Mage'), cast = await begin(actor, ability);
    await killAnchor(helper); await tick(cast.endsAt + 1500);
    assert.equal(actor.releases().length, 0, `${SPELLS[ability].targeting} spells still require the original living target`);
    assert.equal(actor.enemy('neighbor').hp, actor.enemy('neighbor').maxHp, 'invalid targeted spells never silently retarget');
    assert.equal(actor.enemy('anchor').hp, 0, 'dead enemies remain dead');
  }
  const castTime = SPELLS.fireball.castTimeMs;
  try {
    // Stretch this fixture's cast past the ordinary 14-second respawn to exercise the same-ID, new-life guard.
    SPELLS.fireball.castTimeMs = 18000;
    const [actor, helper] = await fixture('Mage'), cast = await begin(actor, 'fireball');
    await killAnchor(helper); await tick(clock + 14001);
    assert.equal(actor.enemy('anchor').alive, true, 'the original target respawns during the pending cast');
    await tick(cast.endsAt + 1500);
    assert.equal(actor.releases().length, 0, 'single-target preparation never crosses enemy lifetimes');
    assert.equal(actor.enemy('anchor').hp, actor.enemy('anchor').maxHp, 'respawned target receives no old-life damage');
  } finally { SPELLS.fireball.castTimeMs = castTime; }
  console.log('PASS radial casts: every radial spell works without a selection; empty-space timing/cooldowns/cancellation, stale/friendly/far/dead selection, party healing, anchor death and single/chain/splash/respawn guards verified over actual WebSockets.');
} finally {
  await stop(); Date.now = realNow;
  for (const [kind, stats] of Object.entries(monsters)) Object.assign(MONSTERS[kind], stats);
  rmSync(dir, { recursive: true, force: true });
}
