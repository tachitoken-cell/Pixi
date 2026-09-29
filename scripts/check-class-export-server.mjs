import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { starterGear, canLearnTalent, talentsValid, TALENTS, TALENT_VERSION } from '../src/progression.ts';
import { SPELLS, spellsForClass } from '../src/spells.ts';
import { COLOSSEUM } from '../src/colosseum.ts';
import { canTraverse, regionAt } from '../src/realm.ts';

// Public WebSocket actions exercise real movement, collision, combat and saved talent validation.
const directory = mkdtempSync(join(tmpdir(), 'mossvale-class-export-')), clients = [], realNow = Date.now, realRandom = Math.random;
let clock = realNow(), game, port;
Date.now = () => clock;
const point = (x = 0, z = 0) => ({ x: COLOSSEUM.x + x, z: COLOSSEUM.z + z });
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const talent = label => { const node = Object.values(TALENTS).find(t => t.label === label); assert(node, `${label} exists`); return node; };
const spell = label => { const ability = Object.values(SPELLS).find(s => s.label === label); assert(ability, `${label} exists`); return ability.id; };
function build(className, ...labels) {
  const p = { appearance: { className }, level: 60, talents: [] };
  function buy(node, rank = node.maxRank) {
    if (node.prerequisite) buy(TALENTS[node.prerequisite], node.prerequisiteRank);
    while (p.talents.filter(id => id === node.id).length < rank) {
      const next = canLearnTalent(p, node.id) ? node : Object.values(TALENTS).find(t => t.className === className && t.branch === node.branch && canLearnTalent(p, t.id));
      assert(next, `${node.label} is reachable`); p.talents.push(next.id);
    }
  }
  labels.forEach(label => buy(talent(label))); assert(talentsValid(p), 'fixture allocation is legal'); return p.talents;
}
async function until(predicate, label) {
  const deadline = realNow() + 5000;
  while (realNow() < deadline) { const result = predicate(); if (result) return result; await delay(10); }
  throw Error(`Timed out: ${label}`);
}
async function tick(ms = 1000) { assert(ms >= 0); clock += ms; await delay(125); }
async function stop() { clients.splice(0).forEach(c => c.socket.terminate()); await game?.stop(); game = undefined; }
async function fixture(className, labels = [], offsets = [[0, 0], [2, 0]]) {
  await stop(); clock += 30000;
  const heroes = offsets.map(([x, z], index) => {
    const role = index ? 'Mage' : className, location = point(x, z);
    return { id: randomUUID(), name: `Export Fighter ${index}`, appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: role },
      coordinateVersion: 2, ...location, zone: regionAt(location.x, location.z), rotation: 0, level: 60, hp: index ? 808 : 500, maxHp: 808, xp: 0, gold: 0,
      characterCreated: true, talents: index ? [] : build(className, ...labels), talentVersion: TALENT_VERSION, ...starterGear(role),
      learnedSpells: spellsForClass(role).map(s => s.id), inventory: { wood: 0, crystal: 0, herb: 0, potion: 0, relic: 0 }, quest: { stage: 0, kills: 0, crystals: 0 } };
  });
  assert(heroes.every(hero => canTraverse(heroes[0], hero)), 'fixture paths are clear');
  const tokens = heroes.map(() => randomBytes(32).toString('base64url'));
  writeFileSync(join(directory, 'players.json'), JSON.stringify(Object.fromEntries(heroes.map((hero, index) => [createHash('sha256').update(tokens[index]).digest('hex'), { characters: [hero] }]))));
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: directory, keycloak: null, databaseUrl: '' }); port = await game.start();
  const result = [];
  for (const [index, hero] of heroes.entries()) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, id: hero.id, messages: [] }; clients.push(c);
    c.send = message => socket.send(JSON.stringify(message)); c.player = () => c.snapshot?.players.find(p => p.id === c.id);
    c.hits = (target = c, effect) => c.messages.filter(m => m.type === 'damage' && m.targetId === target.id && m.effect === effect);
    socket.on('message', raw => { const m = JSON.parse(raw); c.messages.push(m); if (m.type === 'snapshot') c.snapshot = m; });
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    c.send({ type: 'join', token: tokens[index], characterId: hero.id }); await until(() => c.player(), 'world entry'); result.push(c);
  }
  Math.random = () => .99; return result;
}
async function cast(c, ability, target) {
  await tick(Math.max(0, (c.player().globalCooldownUntil || 0) - clock, (c.player().abilityCooldowns[ability] || 0) - clock) + 1);
  const start = c.messages.length;
  c.send({ type: 'attack', ability, ...(target ? { targetId: target.id } : {}) });
  const released = () => c.messages.slice(start).find(m => m.type === 'combat' && m.playerId === c.id && m.ability === ability);
  await until(() => c.player().casting || released(), `${ability} accepted`);
  if (c.player().casting) await tick(c.player().casting.endsAt - clock);
  const event = await until(released, `${ability} released`); await tick(1); return event;
}
async function hit(attacker, target) {
  const before = attacker.hits(target).length + attacker.hits(target, 'absorb').length;
  await cast(attacker, 'arcane-burst', target); await tick(1000);
  assert(attacker.hits(target).length + attacker.hits(target, 'absorb').length > before, 'hostile spell reaches the target');
}
const edicts = c => c.player().combatTalents?.edicts || [];
try {
  for (const [className, label, meters] of [['Ranger', 'Roll', 12], ['Mage', 'Blink', 15]]) {
    const [caster, enemy] = await fixture(className, [], [[0, -15], [2, -15]]), origin = { ...caster.player() }, hp = enemy.player().hp;
    assert(canTraverse(origin, { x: origin.x, z: origin.z + meters }), `${label} has an unobstructed full-distance route`);
    await cast(caster, spell(label));
    assert(Math.abs(distance(origin, caster.player()) - meters) < .1, `${label} travels its authored distance without a hostile target`);
    assert.equal(enemy.player().hp, hp, `${label} does not damage nearby enemies`);
    const after = { ...caster.player() }; caster.send({ type: 'attack', ability: spell(label) }); await delay(150);
    assert(distance(after, caster.player()) < .01, `${label} cannot bypass its cooldown`);
  }
  for (const [className, label] of [['Mage', 'Blink'], ['Cleric', 'Lighspeed']]) {
    const [caster, enemy] = await fixture(className, [], [[0, -15], [2, -15]]);
    await cast(enemy, 'frostbolt', caster); await tick(1200);
    assert(caster.player().duelStatus?.slowUntil > clock, 'real Frostbolt applied a movement impairment');
    await cast(caster, spell(label));
    assert(!(caster.player().duelStatus?.slowUntil > clock), `${label} removes a hostile slow`);
    if (className === 'Cleric') {
      const state = caster.player().combatTalents;
      assert(state.movementSpeedUntil > clock && state.movementSpeedUntil - clock <= 5000, 'Lighspeed exposes its five-second speed duration');
      await tick(500);
      const destination = { x: caster.player().x, z: caster.player().z + 4 };
      caster.send({ type: 'move', ...destination, rotation: 0 });
      await until(() => distance(caster.player(), destination) < .01, 'Lighspeed authorizes four meters of walking in half a second');
      await tick(5001); assert(!(caster.player().combatTalents.movementSpeedUntil > clock), 'Lighspeed expires');
      const expired = { ...caster.player() }, start = caster.messages.length;
      caster.send({ type: 'move', x: expired.x, z: expired.z + 4, rotation: 0 });
      await until(() => caster.messages.slice(start).some(m => m.type === 'correction'), 'expired speed is rejected by realm movement validation');
      assert(distance(expired, caster.player()) < .01, 'expired Lighspeed cannot retain excess movement credit');
    }
  }
  {
    const [cleric, enemy] = await fixture('Cleric', ['Edict of Light']);
    await cast(cleric, 'flash-heal', cleric); assert(edicts(cleric).some(e => e.kind === 'light'), 'healing leaves an Edict of Light');
    const heals = cleric.hits(cleric, 'heal').length; await hit(enemy, cleric);
    assert(cleric.hits(cleric, 'heal').length > heals, 'the next damaging hit activates extra healing');
    assert(!edicts(cleric).some(e => e.kind === 'light'), 'ordinary Light is consumed after one activation');
  }
  {
    const [cleric, enemy] = await fixture('Cleric', ['Edict of Protection']);
    await cast(cleric, 'power-word-shield', cleric); assert(edicts(cleric).some(e => e.kind === 'protection'), 'defensive magic leaves an Edict of Protection');
    const hp = enemy.player().hp; await hit(enemy, cleric);
    assert(cleric.hits(cleric, 'absorb').length, 'Protection adds real absorption');
    assert(enemy.player().hp < hp, 'Protection damages the actual attacker');
    assert(!edicts(cleric).some(e => e.kind === 'protection'), 'ordinary Protection is consumed');
  }
  {
    const [cleric, enemy] = await fixture('Cleric', ['Edict of Harm']);
    await cast(cleric, 'searing-light', enemy); await tick(1000);
    assert.equal(cleric.hits(enemy).length, 1, 'the marking damage does not immediately activate its own Harm');
    await cast(cleric, 'judgment', enemy); await tick(1000);
    assert(cleric.hits(enemy).length >= 3, 'the next damaging spell activates additional Harm damage');
  }
  {
    const [cleric, enemy] = await fixture('Cleric', ["Titan's Edict"]);
    await cast(cleric, 'titans-edict', cleric);
    const shield = cleric.player().shield.amount, protection = edicts(cleric).find(e => e.kind === 'protection').power, hp = enemy.player().hp;
    await hit(enemy, cleric);
    const absorbed = cleric.hits(cleric, 'absorb').reduce((sum, event) => sum + event.amount, 0);
    assert(absorbed > 0); assert.equal(cleric.player().shield.amount, shield + protection - absorbed, 'Titan shield absorbs the hit alongside the triggered Protection bonus');
    assert(enemy.player().hp < hp, 'Titan reflects damage into its attacker');
    assert(cleric.hits(enemy).length >= 2, 'Titan reflects separately from the Protection retaliation');
  }
  {
    const [cleric, enemy] = await fixture('Cleric', ['Eternal Edict']);
    await cast(cleric, 'binding-light', enemy); await tick(1000);
    await cast(cleric, 'eternal-edict');
    const before = cleric.hits(enemy).length;
    await cast(cleric, 'holy-word-chastise', enemy); await tick(1000);
    assert(cleric.hits(enemy).length >= before + 2, 'Eternal allows an existing Harm mark to activate');
    const repeated = cleric.hits(enemy).length;
    await cast(cleric, 'searing-light', enemy); await tick(1000);
    assert.equal(cleric.hits(enemy).length, repeated + 2, 'Eternal preserves the same mark for another activation within eight seconds');
    await tick(8001); const expired = cleric.hits(enemy).length;
    await cast(cleric, 'searing-light', enemy); await tick(1000);
    assert.equal(cleric.hits(enemy).length, expired + 1, 'expired Eternal marks cannot activate');
  }
  console.log('PASS: authored movement distances, cooldowns and slow cleanse; real Light, Protection, Harm, Titan and Eternal combat against WebSocket players.');
} finally { await stop(); Date.now = realNow; Math.random = realRandom; rmSync(directory, { recursive: true, force: true }); }
