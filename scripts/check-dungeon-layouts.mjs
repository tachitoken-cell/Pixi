import assert from 'node:assert/strict';
import { LEGACY_DUNGEONS as DUNGEONS, DUNGEON_START, DUNGEON_EXIT, DUNGEON_ROOMS, DUNGEON_WALLS, DUNGEON_COLLIDERS, dungeonLayout, dungeonStages, dungeonColliders, dungeonRoomPortalOpen, dungeonBounds, dungeonReturn, dungeonCheckpoint, inDungeonPreparation } from '../src/dungeon.ts';
import { THEMED_DUNGEON_ROSTERS } from '../src/bestiary.ts';
import { canTraverse } from '../src/realm.ts';
import { findPath } from '../src/navigation.ts';

const enemyCounts = { rootvault: 24, cindercrypt: 27, frosthollow: 26, nightroot: 29, plagueworks: 93, emberfall: 93, veilhaven: 96 };
const sealIds = ['verdant-seal', 'glacial-seal'];
for (const dungeon of DUNGEONS) {
  const id = dungeon.id, layout = dungeonLayout(id), stages = dungeonStages(id), bounds = dungeonBounds(id), cleared = new Set(), activated = new Set();
  const themed = id in THEMED_DUNGEON_ROSTERS;
  assert.equal(stages.length, themed ? 24 : 8);
  assert.equal(stages.reduce((sum, stage) => sum + stage.enemies.length, 0), enemyCounts[id]);
  assert.equal(dungeonStages(id), stages, 'the canonical roster is cached');
  assert.equal(layout.rooms.length, stages.length + 1, 'only combat chambers and a foyer, no corridor floor');
  assert.equal(layout.gates.length + layout.doors.length, 0, 'no walk-through gates between chambers');
  assert.equal(dungeonColliders([], [], id), layout.colliders);
  assert.equal(dungeonColliders(stages.map(stage => stage.id), sealIds, id), layout.colliders, 'progress never opens a physical wall');
  assert.equal(new Set(layout.portals.map(portal => portal.id)).size, layout.portals.length);
  const exitCounts = layout.rooms.map(room => layout.portals.filter(portal => portal.roomId === room.id).length);
  assert(exitCounts.every(count => count >= 1 && count <= 3), `${id}: readable rooms have one to three exits`);
  assert(new Set(exitCounts).size >= 2, `${id}: routes alternate passages and dead ends or forks`);
  assert(new Set(layout.rooms.filter(room => room.id !== 'preparation').map(room => `${room.width}x${room.depth}`)).size >= 4, `${id}: chamber proportions vary`);
  assert(inDungeonPreparation(DUNGEON_START, id) && inDungeonPreparation(DUNGEON_EXIT, id));
  const inRoom = (point, room) => Math.abs(point.x - room.x) < room.width / 2 && Math.abs(point.z - room.z) < room.depth / 2;
  const walk = (from, target, label) => {
    const path = findPath(from, target, layout.colliders, bounds);
    assert(path.length && Math.hypot(path.at(-1).x - target.x, path.at(-1).z - target.z) < .001, `${id}: ${label}`);
    let previous = from; for (const point of path) { assert(canTraverse(previous, point, layout.colliders, bounds)); previous = point; }
  };
  for (const room of layout.rooms) {
    if (room.id !== 'preparation') assert(room.width >= 40 && room.depth >= 36, `${id}/${room.id}: expanded combat space`);
    for (const other of layout.rooms.filter(other => other !== room)) assert(Math.abs(room.x - other.x) >= (room.width + other.width) / 2 + 8 || Math.abs(room.z - other.z) >= (room.depth + other.depth) / 2 + 8, 'chambers are physically disconnected');
    const local = [...(stages.find(stage => stage.id === room.id)?.enemies ?? []), ...layout.objects.filter(object => object.stageId === room.id),
      ...layout.portals.filter(portal => portal.roomId === room.id), ...layout.portals.filter(portal => portal.targetRoomId === room.id).map(portal => portal.destination)];
    if (room.id === 'preparation') local.push(DUNGEON_START, DUNGEON_EXIT);
    if (room.id === 'throne') local.push(dungeonReturn(id));
    for (const point of local) { assert(inRoom(point, room), `${id}/${room.id}: local anchor stays inside its chamber`); walk(room, point, `${room.id} reaches every enemy, object and portal`); }
    // A swept flood cannot leave this room even after every progression requirement is satisfied.
    const queue = [{ x: room.x, z: room.z }], seen = new Set([`${room.x},${room.z}`]);
    for (let index = 0; index < queue.length; index++) for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
      const point = { x: queue[index].x + dx, z: queue[index].z + dz }, key = `${point.x},${point.z}`;
      if (seen.has(key) || !canTraverse(queue[index], point, layout.colliders, bounds)) continue;
      assert(inRoom(point, room), `${id}/${room.id}: a wall allowed walking into the empty gap`); seen.add(key); queue.push(point);
    }
    assert(queue.length > (room.id === 'preparation' ? 60 : 220), 'expanded room has substantial usable floor');
  }
  for (const portal of layout.portals) {
    const reverse = layout.portals.find(other => other.roomId === portal.targetRoomId && other.targetRoomId === portal.roomId);
    assert(reverse, `${portal.id}: reciprocal return exists`);
    assert(Math.abs(Math.hypot(reverse.x - portal.destination.x, reverse.z - portal.destination.z) - 4) < .001, 'arrival is four meters inward from return portal');
    walk(portal.destination, reverse, 'arrival can reach its return portal');
  }
  const reachable = (from = 'preparation') => {
    const result = new Set([from]), pending = [from];
    for (const roomId of pending) for (const portal of layout.portals) if (portal.roomId === roomId && dungeonRoomPortalOpen(portal, cleared, activated) && !result.has(portal.targetRoomId)) { result.add(portal.targetRoomId); pending.push(portal.targetRoomId); }
    return result;
  };
  assert.deepEqual([...reachable()].sort(), ['preparation', 'threshold']);
  for (const stage of stages.filter(stage => !stage.optional)) {
    assert(reachable().has(stage.id), `${id}: ${stage.id} can be reached when its requirements are met`);
    for (const next of stages.filter(next => !next.optional && !next.requires.every(required => cleared.has(required)))) assert(!reachable().has(next.id), `${id}: portal graph cannot skip ${next.id} requirements`);
    cleared.add(stage.id);
    for (const object of layout.objects.filter(object => object.stageId === stage.id && object.kind === 'seal')) activated.add(object.id);
  }
  assert.equal(cleared.size, stages.filter(stage => !stage.optional).length, 'the main route never requires clearing an optional room');
  for (const stage of stages.filter(stage => stage.optional)) {
    assert(reachable().has(stage.id), `${id}/${stage.id}: optional detours remain reachable after main progression`);
    cleared.add(stage.id);
  }
  assert.equal(reachable().size, layout.rooms.length, 'full progression opens every chamber and return route');
  activated.delete('glacial-seal');
  assert(layout.portals.filter(portal => portal.targetRoomId === 'confluence' && portal.requires.length).every(portal => !dungeonRoomPortalOpen(portal, cleared, activated)), 'both seals remain required');
  cleared.clear(); activated.clear();
  for (const stage of layout.checkpointStages) cleared.add(stage); sealIds.forEach(seal => activated.add(seal));
  assert(inRoom(dungeonCheckpoint(id), layout.rooms.find(room => room.id === 'confluence')));
  assert(reachable('confluence').has('reliquary') && !reachable('confluence').has('throne'), 'checkpoint preserves secured progress and locks uncleared boss routes');
  if (themed) {
    assert.equal(stages.filter(stage => stage.optional).length, 16); assert.equal(layout.objects.filter(object => object.kind === 'chest').length, 8);
    assert.deepEqual([...new Set(stages.flatMap(stage => stage.enemies.map(enemy => enemy.kind)))].sort(), [...THEMED_DUNGEON_ROSTERS[id]].sort());
    assert.deepEqual(stages.flatMap(stage => stage.enemies.filter(enemy => enemy.boss).map(() => stage.id)), ['confluence', 'throne']);
  }
  console.log(`${id}: ${layout.rooms.length} varied chambers, ${stages.length} encounters, ${enemyCounts[id]} enemies, ${layout.portals.length} room portals, exits ${[...new Set(exitCounts)].sort().join('/')}`);
}
assert.equal(dungeonLayout().rooms, DUNGEON_ROOMS); assert.equal(dungeonLayout().walls, DUNGEON_WALLS); assert.equal(dungeonLayout().colliders, DUNGEON_COLLIDERS);
const rootThrone = dungeonLayout().rooms.find(room => room.id === 'throne');
assert(rootThrone.width * rootThrone.depth > 76 * 28, 'Rootvault final room grows beyond its original floor area');
console.log('PASS: enlarged isolated chambers, clear enemy/object/portal paths, reciprocal arrivals, exact rosters/rewards, gated room graph, both rune seals, checkpoint reset and optional exploration.');
