import { isArenaInstance, ARENA_BOUNDS } from './arena.ts';
import { isRaidInstance, RAID_BOUNDS } from './raid.ts';
import { isInstantCombatInstance } from './instant-combat.ts';
import { instantCombatMap } from './instant-combat-maps.ts';
import { DUNGEONS, dungeonBounds, dungeonLayout, type DungeonId } from './dungeon.ts';
import { dungeonSpikeTraps, dungeonSpikePhase } from './dungeon-traps.ts';
import { canTraverse, WORLD_BOUNDS, type RealmPoint } from './realm.ts';

export const COLLISION_SCENES = ['overworld', 'arena', ...DUNGEONS.map(d => `dungeon-${d.id}`),
  ...Array.from({ length: 8 }, (_, i) => `raid-${i}`), 'instant-bone-pit', 'instant-void-rift'];

export function collisionSceneKey(instanceId: string | null, kind: DungeonId = 'rootvault', raidRoom = 0, mapId = 'bone-pit') {
  return isRaidInstance(instanceId) ? `raid-${Math.min(7, Math.max(0, raidRoom))}`
    : isInstantCombatInstance(instanceId) ? `instant-${mapId}` : isArenaInstance(instanceId) ? 'arena'
      : instanceId ? `dungeon-${kind}` : 'overworld';
}

// Physical walls have climbable tops. Match bounds and sealed room travel remain game rules.
export function collisionRouteAllowed(from: RealmPoint, to: RealmPoint, instanceId: string | null, kind: DungeonId = 'rootvault', mapId = 'bone-pit') {
  const bounds = isRaidInstance(instanceId) ? RAID_BOUNDS : isInstantCombatInstance(instanceId) ? instantCombatMap(mapId).bounds
    : isArenaInstance(instanceId) ? ARENA_BOUNDS : instanceId ? dungeonBounds(kind) : WORLD_BOUNDS;
  const barriers = isInstantCombatInstance(instanceId) ? instantCombatMap(mapId).colliders.filter(c => c.height === undefined) : [];
  if (!canTraverse(from, to, barriers, bounds)) return false;
  if (!instanceId || isRaidInstance(instanceId) || isInstantCombatInstance(instanceId) || isArenaInstance(instanceId)) return true;
  // Include the outer masonry; never allow walking or climbing across the void between rooms.
  const room = dungeonLayout(kind).rooms.find(r => Math.abs(from.x - r.x) <= r.width / 2 + 2 && Math.abs(from.z - r.z) <= r.depth / 2 + 2);
  return !!room && Math.abs(to.x - room.x) <= room.width / 2 + 2 && Math.abs(to.z - room.z) <= room.depth / 2 + 2;
}

export function dungeonCollisionFlags(kind: DungeonId, activated: Iterable<string>, cleared: Iterable<string>, completed: boolean, dream: boolean, now: number) {
  const flags: Record<string, boolean> = { 'dungeon:traps': !dream }, used = new Set(activated), done = new Set(cleared);
  for (const object of dungeonLayout(kind).objects) flags[`object:${object.id}`] = used.has(object.id);
  for (const gate of dungeonLayout(kind).gates) flags[`gate:${gate.id}`] = gate.requires.every(id => done.has(id)) && (!gate.seals || gate.seals.every(id => used.has(id)));
  for (const trap of dungeonSpikeTraps(kind)) {
    const raised = !completed && !dream && dungeonSpikePhase(trap, now).phase === 'active';
    flags[`spike:${trap.id}:raised`] = raised;
    flags[`spike:${trap.id}:lowered`] = !dream && !raised;
  }
  return flags;
}
