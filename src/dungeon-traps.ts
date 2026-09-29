import { DUNGEON_START, DUNGEON_EXIT, getDungeon, dungeonCheckpoint, dungeonLayout, dungeonPreparation, dungeonReturn, dungeonStages, type DungeonId } from './dungeon.ts';
import type { RealmPoint } from './realm.ts';

export interface DungeonSpikeTrap extends RealmPoint {
  id: string; roomId: string; width: number; depth: number; offsetMs: number;
}
export const DUNGEON_SPIKE_CYCLE_MS = 8000;
export const DUNGEON_SPIKE_SAFE_MS = 4000;
export const DUNGEON_SPIKE_WARNING_MS = 1600;
export const DUNGEON_SPIKE_DAMAGE_FRACTION = .12;

export function dungeonSpikePhase(trap: DungeonSpikeTrap, now: number): { phase: 'safe' | 'warning' | 'active'; progress: number; cycle: number } {
  const time = now + trap.offsetMs, cycle = Math.floor(time / DUNGEON_SPIKE_CYCLE_MS);
  const elapsed = time - cycle * DUNGEON_SPIKE_CYCLE_MS;
  if (elapsed < DUNGEON_SPIKE_SAFE_MS) return { phase: 'safe', progress: elapsed / DUNGEON_SPIKE_SAFE_MS, cycle };
  if (elapsed < DUNGEON_SPIKE_SAFE_MS + DUNGEON_SPIKE_WARNING_MS)
    return { phase: 'warning', progress: (elapsed - DUNGEON_SPIKE_SAFE_MS) / DUNGEON_SPIKE_WARNING_MS, cycle };
  return { phase: 'active', progress: (elapsed - DUNGEON_SPIKE_SAFE_MS - DUNGEON_SPIKE_WARNING_MS) / (DUNGEON_SPIKE_CYCLE_MS - DUNGEON_SPIKE_SAFE_MS - DUNGEON_SPIKE_WARNING_MS), cycle };
}

export function dungeonSpikeContains(trap: DungeonSpikeTrap, point: RealmPoint, radius = 0): boolean {
  return Math.hypot(Math.max(0, Math.abs(point.x - trap.x) - trap.width / 2), Math.max(0, Math.abs(point.z - trap.z) - trap.depth / 2)) <= radius;
}

const noTraps: readonly DungeonSpikeTrap[] = [];
const layouts = new Map<DungeonId, readonly DungeonSpikeTrap[]>();
/** Beds leave a permanent cross aisle and are excluded from all interaction and travel anchors. */
export function dungeonSpikeTraps(id: DungeonId = 'rootvault'): readonly DungeonSpikeTrap[] {
  // The Quest Bible authors spike trials only for the Temple of the Veiled Sun.
  if (getDungeon(id)?.storyQuestId && id !== 'veiled-sun-temple') return noTraps;
  const cached = layouts.get(id); if (cached) return cached;
  const layout = dungeonLayout(id), stageIds = new Set(dungeonStages(id).map(stage => stage.id)), traps: DungeonSpikeTrap[] = [];
  const anchors = [DUNGEON_START, DUNGEON_EXIT, dungeonCheckpoint(id), dungeonReturn(id), ...layout.portals.flatMap(portal => [portal, portal.destination])];
  const preparation = dungeonPreparation(id);
  for (const [roomIndex, room] of layout.rooms.entries()) {
    if (!stageIds.has(room.id) || room.width < 16 || room.depth < 16) continue;
    for (const side of [-1, 1]) {
      for (const direction of [-1, 1]) {
        const trap = { id: `${room.id}-${side < 0 ? 'west' : 'east'}-spikes`, roomId: room.id,
          x: room.x + side * Math.min(6, room.width / 4), z: room.z + direction * Math.min(5, room.depth / 2 - 3.5), width: 3.6, depth: 5,
          offsetMs: (roomIndex * 1100 + (side < 0 ? 0 : 4000)) % DUNGEON_SPIKE_CYCLE_MS };
        const overlaps = (point: RealmPoint, halfWidth: number, halfDepth: number, margin = .8) =>
          Math.abs(trap.x - point.x) < trap.width / 2 + halfWidth + margin && Math.abs(trap.z - point.z) < trap.depth / 2 + halfDepth + margin;
        if (anchors.some(point => dungeonSpikeContains(trap, point, 4)) || layout.objects.some(object => dungeonSpikeContains(trap, object, object.r + 2.2))) continue;
        if (preparation && overlaps({ x: (preparation.minX + preparation.maxX) / 2, z: (preparation.minZ + preparation.maxZ) / 2 },
          (preparation.maxX - preparation.minX) / 2, (preparation.maxZ - preparation.minZ) / 2)) continue;
        if (layout.colliders.some(solid => solid.halfWidth === undefined ? dungeonSpikeContains(trap, solid, solid.r + .8)
          : overlaps(solid, solid.halfWidth, solid.halfDepth!))) continue;
        if (layout.doors.some(door => overlaps(door, door.axis === 'x' ? door.width / 2 : 1.5, door.axis === 'z' ? door.width / 2 : 1.5, 1.5))) continue;
        traps.push(trap); break;
      }
    }
  }
  layouts.set(id, traps); return traps;
}
