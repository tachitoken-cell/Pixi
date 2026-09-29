import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { ZONES } from '../src/content.ts';
import { starterGear } from '../src/progression.ts';
import { DUNGEON_ENTRANCE } from '../src/adventure.ts';
import { canTraverse, regionAt, toWorld } from '../src/realm.ts';
import { waterAt, WORLD_BOUNDS } from '../src/landscape.ts';
import { MOUNT_UNLOCK_LEVEL, MOUNT_UPGRADE_LEVEL, MOUNT_CAST_MS, STAMINA_MAX, SPRINT_SPEED, WALK_SPEED, mountSpeed, canSprint } from '../src/travel.ts';
import { createMovementCredit, MOVEMENT_CREDIT_SECONDS } from '../src/movement-credit.mjs';

// A real server pause may retain elapsed movement time; a client/network pause may not.
function checkMovementCredit() {
  function fixture() {
    let monotonic = 0;
    const credit = createMovementCredit(() => monotonic);
    const session = { player: { x: 0, z: 0 }, travel: { mount: null }, instanceId: null, lastMove: 0, moveBudget: 0 };
    const observe = at => { monotonic = at; return credit.observe(); };
    const move = (at, cost, wall = at) => {
      const receipt = observe(at); credit.refill(session, wall, receipt);
      if (cost > session.moveBudget + 1e-9) return false;
      session.moveBudget -= cost; session.player.x += cost * WALK_SPEED;
      credit.accepted(session, receipt, cost * WALK_SPEED); return true;
    };
    assert(move(50, .05)); observe(100);
    return { credit, session, observe, move };
  }
  for (const timerFirst of [false, true]) for (const drainMs of [0, 5]) {
    const { session, observe, move } = fixture();
    if (timerFirst) observe(1000);
    const count = drainMs ? 21 : 19;
    for (let packet = 0; packet < count; packet++) assert(move(1000 + packet * drainMs, .05), 'legal 20 Hz positions survive a real pause and gradual queue drain');
    assert(session.moveBudget < .001, 'only elapsed time was spent, with no pause bonus');
    assert(!move(1000 + (count - 1) * drainMs, .05), 'the same pause cannot be granted again for another packet');
  }
  {
    const { session, observe, move } = fixture();
    for (let at = 200; at <= 1000; at += 100) observe(at);
    assert(move(1000, .5, 100000));
    assert(!move(1000, .1, 100000), 'network delay and wall-clock jumps keep the ordinary cap while server heartbeats run');
    assert(session.moveBudget <= MOVEMENT_CREDIT_SECONDS);
  }
  for (const invalidate of [
    ({ credit, session }) => credit.reset(session),
    ({ session }) => { session.lastMove++; },
    ({ session }) => { session.moveBudget = .1; },
    ({ session }) => { session.player.x++; },
    ({ session }) => { session.player.z++; },
    ({ session }) => { session.instanceId = 'other-room'; },
    ({ session }) => { session.travel.mount = 'horse'; },
    ({ move }) => { assert(move(100, 0)); },
  ]) {
    const state = fixture(); invalidate(state);
    assert(!state.move(1000, .6), 'corrections, authoritative movement resets, mount changes and idle inputs invalidate pause eligibility');
  }
  {
    const { credit, session, observe, move } = fixture();
    assert(move(1000, .05));
    for (let at = 1100; at <= 1600; at += 100) observe(at);
    credit.refill(session, 1600, observe(1600));
    assert.equal(session.moveBudget, MOVEMENT_CREDIT_SECONDS, 'the fixed grace expires even with unspent credit');
    assert(move(1600, 0)); assert(!move(2300, .6), 'idle packets cannot bank an old pause for a new pause');
  }
  {
    const { session, observe, move } = fixture();
    assert(move(3100, 1.9));
    assert(!move(3100, .11), 'very long server pauses are bounded to two seconds');
    assert(move(3150, .15)); observe(3200);
    assert(move(4100, .9), 'a later genuine pause grants only later elapsed time');
    assert(session.moveBudget < .051);
    assert(!move(4100, 100), 'forged movement remains rejected');
  }
  console.log('Movement credit: server-only pauses, either event order, slow drain, expiry, resets and unchanged network limits passed.');
}
checkMovementCredit();

const dir = mkdtempSync(join(tmpdir(), 'mossvale-travel-')), realNow = Date.now, clients = [];
let clock = realNow(), game, port;
Date.now = () => clock;
function hero(name, level, point = { x: 0, z: 8 }) {
  return { id: randomUUID(), name, ...point, zone: regionAt(point.x, point.z), coordinateVersion: 2, rotation: 0,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
    characterCreated: true, talents: [], ...starterGear('Ranger'), level, hp: 100 + (level - 1) * 12, maxHp: 100 + (level - 1) * 12, xp: 0, gold: 0,
    inventory: { wood: 0, crystal: 0, herb: 0, potion: 3, relic: 0 }, quest: { stage: 0, kills: 0, crystals: 0 } };
}
async function until(fn, label) {
  const end = realNow() + 4000;
  while (realNow() < end) { const value = fn(); if (value) return value; await delay(10); }
  throw Error(`Timed out: ${label}`);
}
async function tick(ms = 0) {
  clock += ms; await delay(120);
  await until(() => clients.every(c => c.socket.readyState !== WebSocket.OPEN || !c.player() || c.snapshot.serverTime >= clock), 'simulation tick');
}
async function connect(token) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, messages: [], snapshots: 0 };
  clients.push(c); c.send = message => socket.send(JSON.stringify(message));
  c.player = () => c.snapshot?.players.find(p => p.id === c.welcome?.id);
  socket.on('message', raw => { const m = JSON.parse(raw); c.messages.push(m); if (['snapshot', 'roster', 'welcome'].includes(m.type)) c[m.type] = m; if (m.type === 'snapshot') c.snapshots++; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token }); await until(() => c.roster, 'roster');
  c.send({ type: 'selectCharacter', characterId: c.roster.characters[0].id }); await until(() => c.player(), 'world entry'); return c;
}
async function action(c, message, ms = 0) {
  clock += ms; const count = c.snapshots; c.send(message); await until(() => c.snapshots > count, message.type); return c.player();
}
async function summon(c, mount) {
  await action(c, { type: 'mount', mount });
  assert.equal(c.player().travel.mount, null, 'summoning and switching mounts both require a cast');
  assert.equal(c.player().casting?.ability, 'mount'); assert.equal(c.player().casting.mount, mount);
  assert.equal(c.player().casting.endsAt - c.player().casting.startedAt, 2000);
  await tick(MOUNT_CAST_MS - 1); assert.equal(c.player().travel.mount, null, 'not mounted at 1999ms');
  await tick(1); assert.equal(c.player().travel.mount, mount, 'mounted at 2000ms'); assert.equal(c.player().casting, null);
}
async function move(c, point, ms, sprint = false) {
  const before = c.messages.length;
  await action(c, { type: 'move', zone: c.player().zone, ...point, rotation: 0, sprint }, ms);
  // A periodic snapshot can arrive before the server handles this movement.
  await until(() => Math.hypot(c.player().x - point.x, c.player().z - point.z) < .0001
    || c.messages.slice(before).some(message => message.type === 'correction'), 'movement outcome');
  const p = c.player();
  assert(Math.hypot(p.x - point.x, p.z - point.z) < .0001, `legal movement: ${JSON.stringify(c.messages.slice(before).filter(m => m.type === 'correction'))}`); return p;
}
async function deniedMove(c, point, extra = {}, ms = 0) {
  const before = { x: c.player().x, z: c.player().z }, count = c.messages.length;
  await action(c, { type: 'move', zone: c.player().zone, ...point, rotation: 0, ...extra }, ms);
  assert.deepEqual({ x: c.player().x, z: c.player().z }, before);
  assert(c.messages.slice(count).some(m => m.type === 'correction'), 'speed/state forgery is corrected');
}
function shorePoint() {
  for (let z = WORLD_BOUNDS.minZ + 10; z < WORLD_BOUNDS.maxZ - 10; z += 4) for (let x = WORLD_BOUNDS.minX + 10; x < WORLD_BOUNDS.maxX - 14; x += 4) {
    if (!waterAt(x, z) && waterAt(x + 4, z) && canTraverse({ x, z }, { x: x + 5, z })) for (let i = 0; i < 40; i++) {
      const a = x + i * .1;
      if (!waterAt(a, z) && waterAt(a + .1, z)) return { x: a - .05, z };
    }
  }
  throw Error('Missing shoreline fixture');
}
try {
  assert.equal(MOUNT_UNLOCK_LEVEL, 25); assert.equal(MOUNT_UPGRADE_LEVEL, 50); assert.equal(MOUNT_CAST_MS, 2000);
  assert.deepEqual([24, 25, 49, 50].map(level => mountSpeed(level)), [0, 10, 10, 14]);
  const shore = shorePoint(), encounter = { x: -182, z: 14 }, actors = [24, 25, 49, 50].map(level => hero(`Rider ${level}`, level));
  actors.push(hero('Shore rider', 25, shore), { ...hero('Dungeon rider', 25, toWorld('hollow', DUNGEON_ENTRANCE)), rootvaultUnlocked: true }, hero('Combat rider', 25, { x: encounter.x + 3, z: encounter.z }), { ...hero('Fallen rider', 25, { x: encounter.x + .5, z: encounter.z }), hp: 1 });
  const tokens = actors.map(() => randomBytes(32).toString('base64url'));
  writeFileSync(join(dir, 'players.json'), JSON.stringify(Object.fromEntries(actors.map((p, i) => [createHash('sha256').update(tokens[i]).digest('hex'), { characters: [p] }]))));
  const oldEnemies = ZONES[0].enemies, oldNodes = ZONES[0].nodes;
  ZONES[0].enemies = [{ id: 'travel-foe', kind: 'root-warden', x: encounter.x, z: encounter.z }];
  ZONES[0].nodes = [{ id: 'travel-node', kind: 'timber', x: 0, z: 10 }];
  try { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' }); }
  finally { ZONES[0].enemies = oldEnemies; ZONES[0].nodes = oldNodes; }
  port = await game.start();
  const riders = [];
  for (const token of tokens.slice(0, 4)) riders.push(await connect(token));
  const [locked, rider, trained, expert] = riders;
  await action(locked, { type: 'mount', mount: 'horse' }); assert.equal(locked.player().travel.mount, null, 'level24 is locked');
  const cooldowns = { ...rider.player().abilityCooldowns }, globalCooldown = rider.player().globalCooldownUntil;
  await action(rider, { type: 'mount', mount: 'horse' });
  const startedAt = rider.player().casting.startedAt;
  await until(() => locked.snapshot.players.find(p => p.id === rider.welcome.id).casting?.mount === 'horse', 'other players receive mount preparation');
  await deniedMove(rider, { x: 0, z: 8.9 }); assert.equal(rider.player().casting.startedAt, startedAt, 'summoning grants no riding speed');
  await action(rider, { type: 'mount', mount: 'horse' }, 1000);
  assert.equal(rider.player().casting.startedAt, startedAt, 'repeated summon keeps the original timer');
  await tick(999); assert.equal(rider.player().travel.mount, null, 'still unmounted at 1999ms');
  await tick(1); assert.equal(rider.player().travel.mount, 'horse', 'mount completes at 2000ms');
  await deniedMove(rider, { x: 0, z: 10 }, {}, 0);
  assert.deepEqual(rider.player().abilityCooldowns, cooldowns); assert.equal(rider.player().globalCooldownUntil, globalCooldown, 'mounting has no combat cooldown');
  assert(!rider.messages.some(m => m.type === 'combat' && m.playerId === rider.welcome.id), 'mount preparation emits no combat effect');
  for (const c of riders.slice(2)) await summon(c, 'horse');
  assert.equal(rider.player().travel.stamina, STAMINA_MAX);
  await move(rider, { x: 0, z: 10 }, 200); await move(trained, { x: 0, z: 10 }, 200); await move(expert, { x: 0, z: 10.8 }, 200);
  assert.equal(locked.snapshot.players.find(p => p.id === rider.welcome.id).travel.mount, 'horse', 'other players receive mount state');
  await deniedMove(rider, { x: 0, z: 17 }, {}, 200);
  await action(rider, { type: 'mount', mount: 'dragon' }); assert.equal(rider.player().travel.mount, 'horse', 'unknown mount does not change state');
  await summon(rider, 'wolf');
  await action(rider, { type: 'gather', targetId: 'travel-node' }); assert(rider.player().gathering); assert.equal(rider.player().travel.mount, null, 'accepted gathering dismounts');
  await action(rider, { type: 'cancelGather' });
  for (const message of [{ type: 'cancelCast' }, { type: 'jump' }, { type: 'gather', targetId: 'travel-node' }, { type: 'mount', mount: null }]) {
    await action(rider, { type: 'mount', mount: 'horse' }); assert.equal(rider.player().casting?.ability, 'mount');
    await action(rider, message); await until(() => rider.player().casting === null, `${message.type} interrupts summoning`);
    await tick(MOUNT_CAST_MS); assert.equal(rider.player().travel.mount, null, 'interrupted summon never finishes later');
    if (rider.player().gathering) await action(rider, { type: 'cancelGather' });
  }
  await action(rider, { type: 'mount', mount: 'horse' });
  await move(rider, { x: 0, z: 9.5 }, 0); assert.equal(rider.player().casting, null, 'movement interrupts summoning');
  await tick(MOUNT_CAST_MS); assert.equal(rider.player().travel.mount, null);
  await action(rider, { type: 'cancelGather' }); await move(rider, { x: 0, z: 8 }, 500);
  await action(rider, { type: 'move', x: 0, z: 8, rotation: 0, sprint: true }, 9000);
  assert.equal(rider.player().travel.stamina, STAMINA_MAX, 'holding sprint while stationary costs no stamina');
  assert.equal(rider.player().travel.sprinting, false);
  for (let i = 0; i < 16; i++) await move(rider, { x: 0, z: i % 2 ? 8 : 8 + SPRINT_SPEED * .5 }, 500, true);
  assert.equal(rider.player().travel.stamina, 0, 'eight seconds of full-speed sprint exhausts stamina');
  assert.equal(rider.player().travel.exhausted, true); assert.equal(canSprint(rider.player().travel), false);
  await move(rider, { x: 0, z: 8 + WALK_SPEED * .2 }, 200, true);
  assert.equal(rider.player().travel.sprinting, false, 'exhausted sprint input stays at walking speed');
  await tick(1000); assert(rider.player().travel.stamina > 0 && rider.player().travel.stamina < 25); assert(rider.player().travel.exhausted);
  await tick(800); assert.equal(rider.player().travel.exhausted, false); assert(canSprint(rider.player().travel));
  const rested = rider.player().travel.stamina;
  await move(rider, { x: 0, z: 8 + WALK_SPEED * .2 + SPRINT_SPEED * .2 }, 200, true); assert(rider.player().travel.stamina < rested + 18 * .2); assert(rider.player().travel.sprinting);
  const stamina = rider.player().travel.stamina;
  await action(rider, { type: 'mount', mount: 'horse' }); await action(rider, { type: 'mount', mount: null }); assert.equal(rider.player().travel.stamina, stamina, 'mount toggles cannot refill fatigue');
  await deniedMove(rider, { x: rider.player().x + .1, z: rider.player().z }, { stamina: 100 });
  await deniedMove(rider, { x: rider.player().x + .1, z: rider.player().z }, { sprint: 'yes' });
  await deniedMove(rider, { x: 1e300, z: 1e300 }, {}, 2000);
  const swimmer = await connect(tokens[4]); await summon(swimmer, 'wolf');
  await move(swimmer, { x: shore.x + .31, z: shore.z }, 200);
  // Crossing the bank starts a fall; advance physics until the rider reaches water.
  for (let step = 0; step < 10 && !swimmer.player().jump.grounded; step++) await tick(100);
  assert(swimmer.player().jump.grounded, 'shore rider reaches the water surface');
  assert(waterAt(swimmer.player().x, swimmer.player().z)); assert.equal(swimmer.player().travel.mount, null, 'shore crossing dismounts');
  await action(swimmer, { type: 'mount', mount: 'horse' }); assert.equal(swimmer.player().travel.mount, null, 'cannot summon in water');
  const dungeon = await connect(tokens[5]); await action(dungeon, { type: 'mount', mount: 'horse' }); assert.equal(dungeon.player().casting?.ability, 'mount');
  await action(dungeon, { type: 'dungeonEnter' }); assert(dungeon.player().instanceId); assert.equal(dungeon.player().travel.mount, null);
  assert.equal(dungeon.player().casting, null, 'entering a dungeon cancels summoning'); await tick(MOUNT_CAST_MS);
  await action(dungeon, { type: 'mount', mount: 'wolf' }); assert.equal(dungeon.player().travel.mount, null, 'cannot summon in dungeon');
  await move(dungeon, { x: 0, z: 24 }, 500); await action(dungeon, { type: 'dungeonExit' }); assert.equal(dungeon.player().instanceId, null);
  const fallen = await connect(tokens[7]); await action(fallen, { type: 'mount', mount: 'horse' });
  for (let i = 0; i < 12 && fallen.player().hp > 0; i++) await tick(1000);
  assert.equal(fallen.player().hp, 0); assert.equal(fallen.player().travel.mount, null, 'death removes mount'); assert.equal(fallen.player().casting, null, 'death cancels summoning');
  const fighter = await connect(tokens[6]); await summon(fighter, 'wolf');
  await action(fighter, { type: 'attack', ability: 'arrow', targetId: 'travel-foe' }); assert.equal(fighter.player().travel.mount, null, 'accepted attack dismounts');
  assert(fighter.messages.some(m => m.type === 'combat' && m.playerId === fighter.welcome.id));
  await action(rider, { type: 'mount', mount: 'wolf' }); rider.send({ type: 'leaveWorld' }); await tick();
  rider.send({ type: 'selectCharacter', characterId: actors[1].id }); await tick(MOUNT_CAST_MS); assert.equal(rider.player().travel.mount, null, 'character selection cancels summoning'); assert.equal(rider.player().casting, null);
  await action(rider, { type: 'mount', mount: 'horse' }); rider.socket.close(); await until(() => rider.socket.readyState === WebSocket.CLOSED, 'logout');
  const rejoined = await connect(tokens[1]); await tick(MOUNT_CAST_MS); assert.equal(rejoined.player().travel.mount, null, 'reconnect cancels summoning'); assert.equal(rejoined.player().casting, null);
  await summon(rejoined, 'horse');
  await action(rejoined, { type: 'mount', mount: null }); assert.equal(rejoined.player().travel.mount, null, 'dismount is instant'); assert.equal(rejoined.player().casting, null);
  await summon(rejoined, 'horse');
  await move(rejoined, { x: rejoined.player().x, z: rejoined.player().z + .7 }, 0);
  await action(rejoined, { type: 'mount', mount: 'wolf' });
  await deniedMove(rejoined, { x: rejoined.player().x, z: rejoined.player().z + .7 });
  // Legal 20 Hz riding inputs can arrive together after a network stall. The
  // bounded movement credit may require a correction, but arrival time cannot
  // distinguish those queued positions from attempted speed cheating.
  for (let batch = 0; batch < 12; batch++) {
    const start = { x: expert.player().x, z: expert.player().z }, before = expert.messages.length, snapshots = expert.snapshots;
    const direction = batch % 2 ? -1 : 1, step = mountSpeed(50) * .05;
    clock += 1500;
    let previous = start;
    for (let packet = 1; packet <= 30; packet++) {
      const point = { x: start.x, z: start.z + direction * step * (packet <= 20 ? packet : 40 - packet) };
      assert(canTraverse(previous, point) && !waterAt(point.x, point.z), 'delayed packets describe legal dry-land riding');
      assert(Math.hypot(point.x - previous.x, point.z - previous.z) <= step + 1e-9, 'client never exceeds riding speed');
      expert.send({ type: 'move', ...point, rotation: 0 }); previous = point;
    }
    await until(() => expert.snapshots > snapshots || expert.socket.readyState !== WebSocket.OPEN, 'queued positions handled');
    assert.equal(expert.socket.readyState, WebSocket.OPEN, 'repeated network stalls never cause a safety cooldown');
    const replies = expert.messages.slice(before);
    assert(replies.some(message => message.type === 'correction'), 'delayed excess is corrected to the existing credit limit');
    assert(!replies.some(message => message.type === 'event' && /Movement was too fast/.test(message.text)), 'network timing is not reported as cheating');
    assert(Math.abs(expert.player().z - start.z) <= 3.2 / WALK_SPEED * mountSpeed(50) + .1, 'queued inputs cannot bypass the movement-credit cap');
  }
  const authoritative = { x: expert.player().x, z: expert.player().z };
  for (let attempt = 0; attempt < 12; attempt++) await deniedMove(expert, { x: authoritative.x + 100, z: authoritative.z }, {}, 600);
  assert.deepEqual({ x: expert.player().x, z: expert.player().z }, authoritative, 'repeated speed cheats never gain distance');
  await move(expert, { x: authoritative.x, z: authoritative.z + .7 }, 50);
  console.log('PASS movement jitter: twelve delayed 20 Hz riding batches stay connected, bounded credit corrects queued positions, repeated 100m speed attempts gain no distance, and legal riding resumes.');
  console.log('PASS travel: exact 2-second mount preparation, repeat/switch/interruption/lifecycle behavior, instant dismount, riding speed and replication, sprint fatigue, forged movement, water/dungeon/combat/gather/death/selection/logout cleanup.');
} finally { for (const c of clients) c.socket.terminate(); await game?.stop(); Date.now = realNow; rmSync(dir, { recursive: true, force: true }); }
