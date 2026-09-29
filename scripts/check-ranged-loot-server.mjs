import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { MONSTERS } from '../src/bestiary.ts';
import { starterGear, combatStats } from '../src/progression.ts';
import { AUTO_ATTACKS, autoAttackDamage, autoAttackTiming } from '../src/auto-attacks.ts';
import { SPELLS } from '../src/spells.ts';
import { combatTiming } from '../src/combat-timing.ts';
import { OVERWORLD_SPAWNS, canTraverse } from '../src/realm.ts';
import { movementCost } from '../src/landscape.ts';
import { WALK_SPEED } from '../src/travel.ts';

const dir = mkdtempSync(join(tmpdir(), 'mossvale-ranged-loot-')), clients = [], realNow = Date.now;
const home = OVERWORLD_SPAWNS.find(enemy => enemy.id === 'slime-0');
const oldSlime = { ...MONSTERS['moss-slime'] };
let clock = realNow(), game, port;
Date.now = () => clock;
Object.assign(MONSTERS['moss-slime'], { speed: 0, aggroRange: 0 });
const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function hero(name, dx, dz) {
  return { id: randomUUID(), name, x: home.x + dx, z: home.z + dz, zone: 'greenwood', coordinateVersion: 2, rotation: 0,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
    characterCreated: true, talents: [], ...starterGear('Ranger'), learnedSpells: ['arrow', 'power-shot'],
    level: 25, xp: 0, gold: 0, hp: 388, maxHp: 388, inventory: { wood: 0, crystal: 0, herb: 0, potion: 3 },
    skills: { mining: 0, woodcutting: 0, herbalism: 0 },
    quest: { chapter: 0, stage: 1, kills: 0, crystals: 0, progress: { 'grove-slimes': 0, 'grove-crystals': 0 }, completed: false, ending: null } };
}
async function until(fn, label) {
  const end = realNow() + 4000;
  while (realNow() < end) { const value = fn(); if (value) return value; await delay(15); }
  throw Error(`Timed out: ${label}`);
}
async function tick(ms) { clock += Math.ceil(ms); await delay(120); }
async function walk(client, destination) {
  while (gap(client.player(), destination) > .01) {
    const p = client.player(), distance = gap(p, destination), step = Math.min(2, distance);
    const point = { x: p.x + (destination.x - p.x) / distance * step, z: p.z + (destination.z - p.z) / distance * step };
    assert(canTraverse(p, point), 'fixture walk follows a clear route');
    await tick(movementCost(p, point) / WALK_SPEED * 1000 + 10);
    client.send({ type: 'move', ...point, rotation: 0 });
    await until(() => gap(client.player(), point) < .01, 'legal movement');
  }
}
async function connect(token, id) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), client = { socket, messages: [], id };
  clients.push(client); client.send = message => socket.send(JSON.stringify(message));
  client.player = () => client.snapshot?.players.find(player => player.id === id);
  socket.on('message', raw => { const m = JSON.parse(raw); client.messages.push(m); if (['snapshot', 'roster'].includes(m.type)) client[m.type] = m; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  client.send({ type: 'join', token }); await until(() => client.roster, 'private roster');
  client.send({ type: 'selectCharacter', characterId: id }); await until(() => client.player(), 'character enters');
  return client;
}
try {
  const heroes = [hero('Long range ranger', 17, 0), hero('Nearby party member', 10, 0), hero('Distant party member', 0, 17), hero('Unrelated observer', 0, 11)];
  assert(heroes.every(player => canTraverse(player, home)), 'fixture positions have clear routes to the actual enemy home');
  const tokens = heroes.map(() => randomBytes(32).toString('base64url'));
  writeFileSync(join(dir, 'players.json'), JSON.stringify(Object.fromEntries(heroes.map((player, i) => [createHash('sha256').update(tokens[i]).digest('hex'), { characters: [player] }]))));
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '', treasureMapRandomInt: () => 99 });
  port = await game.start();
  const [owner, near, far, stranger] = await Promise.all(tokens.map((token, i) => connect(token, heroes[i].id)));
  for (const member of [near, far]) {
    await tick(1200); owner.send({ type: 'partyInvite', targetId: member.id });
    const invitation = await until(() => member.snapshot.partyInvites.find(invite => invite.inviterId === owner.id), 'party invitation');
    member.send({ type: 'partyAccept', invitationId: invitation.id });
    await until(() => owner.snapshot.party?.members.some(player => player.id === member.id), 'party accepted');
  }
  assert(gap(owner.player(), home) > 14 && gap(owner.player(), home) <= SPELLS['power-shot'].range);
  owner.send({ type: 'attack', ability: 'power-shot', targetId: home.id });
  const cast = await until(() => owner.player().casting, 'Power Shot preparation');
  await tick(cast.endsAt - clock);
  const release = await until(() => owner.messages.find(m => m.type === 'combat' && m.playerId === owner.id), 'Power Shot released');
  const timing = combatTiming(release.ability, gap(release.from, release.targets[0]));
  await tick((timing.delay + timing.flight) * 1000 + 1);
  const dead = owner.snapshot.enemies.find(enemy => enemy.id === home.id);
  assert.equal(dead.alive, false); assert(gap(owner.player(), dead) > 14, 'lethal impact is outside party reward sharing range');
  const drops = [owner, near].flatMap(client => client.snapshot.loot.filter(drop => drop.enemyId === home.id));
  assert.deepEqual(drops.map(drop => drop.ownerId).sort(), [owner.id, near.id].sort(), 'ranged killer and nearby party member receive personal corpses; distant party and bystander do not');
  for (const client of [owner, near, far, stranger]) assert(client.snapshot.loot.every(drop => drop.ownerId === client.id), 'snapshots send only the recipient’s personal loot, including party and distant observers');
  for (const client of [owner, near]) {
    assert.equal(client.player().xp, oldSlime.xp); assert.equal(client.player().quest.kills, 1); assert.equal(client.player().gold, 0);
  }
  for (const client of [far, stranger]) { assert.equal(client.player().xp, 0); assert.equal(client.player().quest.kills, 0); }
  const drop = drops.find(drop => drop.ownerId === owner.id);
  assert.deepEqual([drop.x, drop.z], [dead.x, dead.z]);
  owner.send({ type: 'loot', targetId: drop.id, itemId: 'gold' });
  near.send({ type: 'loot', targetId: drop.id, itemId: 'gold' });
  await tick(15000);
  assert.equal(owner.player().gold, 0, 'ranged credit still requires walking to loot');
  assert.equal(near.player().gold, 0, 'party membership cannot collect someone else’s corpse');
  assert(owner.snapshot.enemies.find(enemy => enemy.id === home.id).alive, 'enemy has respawned');
  assert.deepEqual(owner.snapshot.loot.find(item => item.id === drop.id), drop, 'personal remains survive enemy respawn');
  await walk(owner, { x: drop.x + 1, z: drop.z });
  owner.send({ type: 'loot', targetId: drop.id, itemId: 'gold' });
  await until(() => owner.player().gold === oldSlime.gold, 'ranged kill gold is collectible');
  assert.equal(owner.player().quest.kills, 1, 'collection does not duplicate kill credit');
  const range = AUTO_ATTACKS.Ranger.range, outside = { x: home.x + range + .1, z: home.z }, inside = { x: home.x + range - .1, z: home.z };
  const basics = () => owner.messages.filter(m => m.type === 'combat' && m.basic && m.playerId === owner.id);
  await walk(owner, outside); owner.send({ type: 'autoAttack', targetId: home.id });
  await until(() => owner.player().autoAttack?.targetId === home.id, 'ranged auto targeting armed');
  await tick(1000); assert.equal(basics().length, 0, 'ranged auto attacks still require range at release');
  const initialHp = owner.snapshot.enemies.find(enemy => enemy.id === home.id).hp;
  await walk(owner, inside);
  const basic = await until(() => basics()[0], 'automatic arrow released');
  const basicTiming = autoAttackTiming('Ranger', gap(basic.from, basic.targets[0]));
  const arrival = basic.startedAt + (basicTiming.delay + basicTiming.flight) * 1000;
  await tick(basicTiming.delay * 1000 + 1); await walk(owner, outside);
  assert(clock < arrival, 'ranger moves out of range while the arrow is in flight');
  assert.equal(owner.snapshot.enemies.find(enemy => enemy.id === home.id).hp, initialHp, 'projectile damage waits for arrival');
  await tick(arrival - clock + 1);
  assert.equal(owner.snapshot.enemies.find(enemy => enemy.id === home.id).hp, Math.max(0, initialHp - autoAttackDamage('Ranger', combatStats(owner.player()))), 'released automatic arrows land after the attacker leaves range');
  console.log('PASS: Power Shot outside 14 units grants killer loot, XP and quest credit; nearby-only party sharing; ownership/range checks; persistent remains after respawn and manual collection; automatic arrows require range at release and land after the attacker moves away.');
} finally {
  for (const client of clients) client.socket.terminate();
  await game?.stop(); Date.now = realNow; Object.assign(MONSTERS['moss-slime'], oldSlime); rmSync(dir, { recursive: true, force: true });
}
