import * as THREE from 'three';
import type { DungeonRoom } from './dungeon.ts';

type Point = { x: number; z: number };
export function dungeonRoomAt(rooms: readonly DungeonRoom[], point: Point) {
  return rooms.find(room => Math.abs(point.x - room.x) <= room.width / 2 && Math.abs(point.z - room.z) <= room.depth / 2);
}

/** Shared render boundary: keep the batches resident and change only four planes on room travel. */
export function createDungeonRoomVisibility(rooms: readonly DungeonRoom[]) {
  const planes = [new THREE.Plane(new THREE.Vector3(1, 0, 0)), new THREE.Plane(new THREE.Vector3(-1, 0, 0)),
    new THREE.Plane(new THREE.Vector3(0, 0, 1)), new THREE.Plane(new THREE.Vector3(0, 0, -1))];
  let current: DungeonRoom | null = null;
  function select(id: string | null) {
    const next = id === null ? null : rooms.find(room => room.id === id) ?? null;
    if (id !== null && !next) throw new Error(`Unknown dungeon room: ${id}`);
    current = next;
    // Include the outer masonry and authored wall ornaments. Rooms remain separated by empty space.
    const margin = 2;
    const constants = current ? [current.width / 2 + margin - current.x, current.width / 2 + margin + current.x,
      current.depth / 2 + margin - current.z, current.depth / 2 + margin + current.z] : [1e9, 1e9, 1e9, 1e9];
    planes.forEach((plane, index) => { plane.constant = constants[index]; });
  }
  select(rooms.find(room => room.id === 'preparation')?.id ?? rooms[0].id);
  return { planes, select, get roomId() { return current?.id ?? null; },
    contains(point: Point) { return !current || dungeonRoomAt(rooms, point)?.id === current.id; } };
}
