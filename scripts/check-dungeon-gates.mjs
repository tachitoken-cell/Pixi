import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { canTraverse } from '../src/realm.ts';
import { DUNGEONS, dungeonLayout, dungeonColliders, dungeonRoomPortalOpen, dungeonBounds } from '../src/dungeon.ts';

for (const { id } of DUNGEONS) {
  const layout = dungeonLayout(id), all = new Set(layout.rooms.map(room => room.id)), seals = new Set(layout.objects.map(object => object.id));
  const first = layout.portals.find(portal => portal.roomId === 'preparation');
  assert(dungeonRoomPortalOpen(first));
  for (const portal of layout.portals) {
    assert(dungeonRoomPortalOpen(portal, all, seals));
    assert.equal(dungeonRoomPortalOpen(portal, [...all], [...seals]), dungeonRoomPortalOpen(portal, all, seals), 'client arrays and authoritative sets agree');
    for (const required of portal.requires) { const missing = new Set(all); missing.delete(required); assert(!dungeonRoomPortalOpen(portal, missing, seals), `${id}/${portal.id}: every prerequisite is enforced`); }
    if (portal.seals) for (const required of portal.seals) { const missing = new Set(seals); missing.delete(required); assert(!dungeonRoomPortalOpen(portal, all, missing), `${id}: neither rune can be skipped`); }
    if (portal.roomId !== 'preparation') {
      const occupied = new Set(all); occupied.delete(portal.roomId);
      assert(!dungeonRoomPortalOpen(portal, occupied, seals), `${id}/${portal.id}: every exit seals while its room is uncleared`);
      assert(!dungeonRoomPortalOpen(portal, [...occupied], [...seals]), 'client locks the same uncleared room as the server');
      if (!portal.requires.length) assert(dungeonRoomPortalOpen(portal, [portal.roomId]), `${id}/${portal.id}: clearing the room unlocks its return portal`);
    }
  }
  const initial = dungeonColliders([], [], id), finished = dungeonColliders(all, seals, id);
  assert.equal(initial, finished, 'clearing combat opens portals, never holes in chamber walls');
}
// Execute the authoritative attack-range helper against a sealed chamber wall.
const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const extract = source.match(/  function autoAttackInRange\([^]*?\n  \}/)[0];
const inRange = runInNewContext(`(${extract})`, { distance: (a, b) => Math.hypot(a.x - b.x, a.z - b.z), canTraverse,
  instanceBounds: () => dungeonBounds(), instanceColliders: () => dungeonColliders() });
const room = dungeonLayout().rooms.find(room => room.id === 'threshold'), player = { x: room.x, z: room.z + room.depth / 2 - 2 };
assert(!inRange({ player, instanceId: 'run' }, { x: room.x, z: room.z + room.depth / 2 + 2 }, 9), 'server attacks cannot pass through a chamber wall');
assert(inRange({ player, instanceId: 'run' }, { x: player.x, z: player.z - 3 }, 9), 'targets on the same clear floor remain attackable');
console.log('PASS: all exits seal in uncleared rooms, cleared-room backtracking, portal prerequisites, rune seals, array/set parity, immutable collision and authoritative attack isolation.');
