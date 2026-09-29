import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createMovementCredit } from '../src/movement-credit.mjs';
import { spawnSync } from 'node:child_process';
import { DUNGEONS, dungeonLayout, dungeonStages, dungeonBounds, dungeonColliders, dungeonRoomPortalOpen } from '../src/dungeon.ts';
import { canTraverse } from '../src/realm.ts';
import { newJump, jumpFloor } from '../src/jumping.ts';
import { installCollisionScene, actorLineOfSight, disposeCollisionScene } from '../src/collision3d.ts';

for (const { id } of DUNGEONS) {
  const layout = dungeonLayout(id), stages = dungeonStages(id), cleared = new Set(), activated = new Set();
  assert(layout.portals.length >= stages.length * 2, `${id}: connected room portals`);
  const reachable = () => {
    const seen = new Set(['preparation']);
    for (const room of seen) for (const portal of layout.portals) if (portal.roomId === room && dungeonRoomPortalOpen(portal, cleared, activated)) seen.add(portal.targetRoomId);
    return seen;
  };
  for (const portal of layout.portals) {
    const room = layout.rooms.find(room => room.id === portal.roomId), target = layout.rooms.find(room => room.id === portal.targetRoomId);
    assert(room && target && room !== target);
    assert(Math.abs(portal.x - room.x) < room.width / 2 && Math.abs(portal.z - room.z) < room.depth / 2);
    assert(Math.abs(portal.destination.x - target.x) < target.width / 2 && Math.abs(portal.destination.z - target.z) < target.depth / 2);
    assert(canTraverse(portal, portal, layout.colliders, dungeonBounds(id)) && canTraverse(portal.destination, portal.destination, layout.colliders, dungeonBounds(id)), `${id}: clear portal approaches and arrivals`);
    assert(!canTraverse(portal, portal.destination, layout.colliders, dungeonBounds(id)), `${id}: rooms require teleporting instead of walking through walls`);
  }
  for (const stage of stages.filter(stage => !stage.optional)) {
    assert(reachable().has(stage.id), `${id}: main room ${stage.id} becomes reachable in order`);
    for (const future of stages.filter(other => !other.optional && !other.requires.every(required => cleared.has(required)))) assert(!reachable().has(future.id), `${id}: cannot skip ${future.id} guardians`);
    cleared.add(stage.id);
    for (const object of layout.objects.filter(object => object.stageId === stage.id)) activated.add(object.id);
  }
  for (const stage of stages.filter(stage => stage.optional)) {
    assert(reachable().has(stage.id), `${id}: optional spur ${stage.id} remains reachable after completion`);
    cleared.add(stage.id);
  }
  assert.equal(reachable().size, layout.rooms.length, `${id}: optional rooms and backtracking remain available after completion`);
}

const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const extract = name => { const match = source.match(new RegExp(`  function ${name}\\([^\\n]*\\}\\n`)) || source.match(new RegExp(`  function ${name}\\([^]*?\\n  \\}`)); assert(match, name); return match[0]; };
const run = { id: 'portal-run', kind: 'veilhaven', cleared: new Set(), activated: new Set(), members: ['hero'], roster: [{ id: 'hero' }], partySize: 1, startedAt: 0 };
const scene='dungeon-veilhaven', binary=readFileSync(new URL(`../public/collision/${scene}.bin`,import.meta.url));
await installCollisionScene(scene,JSON.parse(readFileSync(new URL(`../public/collision/${scene}.json`,import.meta.url),'utf8')),binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength));
const portal = dungeonLayout(run.kind).portals.find(portal => portal.roomId === 'threshold' && portal.targetRoomId === 'crossing');
const player = { id: 'hero', hp: 100, maxHp: 100, zone: 'hollow', x: portal.x, z: portal.z, rotation: 0 };
const session = { player, instanceId: run.id, socket: {}, jump: newJump(player.x, player.z, true,scene), gm: {}, moveBudget: 0 }, sessions = new Map([[player.id, session]]);
const messages = [], actions = [], now = 100000, extraWalls = [];
const context = { movementCredit: createMovementCredit(() => now), Date: { now: () => now }, dungeons: new Map([[run.id, run]]), sessions, dungeonLayout, dungeonRoomPortalOpen, dungeonBounds,
  dungeonColliders: (...args) => [...dungeonColliders(...args), ...extraWalls], canTraverse, distance: (a, b) => Math.hypot(a.x - b.x, a.z - b.z),
  liveSession: () => true, event: (_, kind, text) => messages.push({ kind, text }), dirty() {}, newJump, jumpFloor, gmFlying: () => false,
  floorHeights:new WeakMap(),collisionScene:()=>scene,actorLineOfSight,
  cancelTradeFor: () => actions.push('trade'), endDuel() {}, arenaMode: () => false, removeDuelInvitations() {}, dismount() {},
  passengers: { leave() {} }, gatheringClaims: new Map(), pendingHits: [], enemies: [],
  correction: (s, reason) => messages.push({ correction: reason, x: s.player.x, z: s.player.z }),
  send: (_, message) => messages.push(message), snapshot: s => ({ snapshot: true, x: s.player.x, z: s.player.z, companionReset: s.companion === null }),
};
const api = runInNewContext(['groundLevel','targetHeight','physicalReach','rememberStanding','cancelCast', 'stand', 'resetJump', 'cancelGathering', 'cancelPlayerCombat', 'cancelHits', 'startDungeonTimer', 'dungeonInteract'].map(extract).join('\n') + '\n({dungeonInteract})', context);
const assertStillHere = label => assert.deepEqual({ x: player.x, z: player.z }, { x: portal.x, z: portal.z }, label);
api.dungeonInteract(session, 'spoofed-portal'); assertStillHere('unknown portal cannot relocate');
api.dungeonInteract(session, portal.id); assertStillHere('guardians seal progression portal');
run.cleared.add('threshold');
api.dungeonInteract(session, portal.id, true); assertStillHere('automatic pet chest interactions cannot activate room portals');
player.x += 4; api.dungeonInteract(session, portal.id); assert.equal(player.x, portal.x + 4, 'out-of-range use rejected'); player.x = portal.x;
player.hp = 0; api.dungeonInteract(session, portal.id); assertStillHere('dead player cannot teleport'); player.hp = 100;
extraWalls.push({ x: portal.x, z: portal.z + 1, r: 3, halfWidth: 3, halfDepth: .3 }); player.z += 2;
api.dungeonInteract(session, portal.id); assert.equal(player.z, portal.z + 2, 'within-range use through a wall is rejected'); player.z = portal.z; extraWalls.length = 0;
run.dream = { endsAt: now - 1 }; api.dungeonInteract(session, portal.id); assertStillHere('expired dream cannot teleport'); delete run.dream;
Object.assign(session, { companion: {}, gathering: { nodeId: 'node' }, casting: {}, autoAttack: {}, seated: {}, moveBudget: 10 });
context.pendingHits.push({ session, enemy: {} });
api.dungeonInteract(session, portal.id);
assert.deepEqual({ x: player.x, z: player.z }, portal.destination); assert.equal(player.hp, 100); assert.equal(session.instanceId, run.id);
assert.equal(session.casting, null); assert.equal(session.autoAttack, null); assert.equal(session.gathering, null); assert.equal(session.companion, null);
assert.equal(session.moveBudget, 0); assert.equal(session.lifeStartedAt, now); assert.equal(session.jump.sequence, 1); assert.equal(context.pendingHits.length, 0);
assert.equal(run.startedAt, now, 'first accepted room teleport starts the authoritative timer');
assert.deepEqual(actions, ['trade']); assert(messages.some(message => message.snapshot && message.companionReset));
assert(messages.some(message => message.correction === portal.label));
assert.match(source, /session\.dungeonPortalUntil > now && distance\(p, message\) > 6/, 'late departure-room movement is corrected without a false cheat strike');
console.log('PASS seven portal graphs, guardian/seal gates, enclosed-room boundaries, spoofed/locked/distant/dead/through-wall/expired-dream rejection and actual server teleport cleanup.');
disposeCollisionScene(scene);
const result = spawnSync(process.execPath, ['scripts/check-dungeon-expansion-server.mjs', '--portals-only'], { stdio: 'inherit' });
assert.equal(result.status, 0, 'real WebSocket portal validation');
