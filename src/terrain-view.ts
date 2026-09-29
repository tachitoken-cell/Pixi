import * as THREE from 'three';
import { waterAt, WATER_LEVEL, WORLD_BOUNDS } from './landscape.ts';
import { buildingFloorHeight } from './buildings.ts';

export const surfaceHeight = (x: number, z: number, dungeon = false) => dungeon ? 0 : waterAt(x, z) ? WATER_LEVEL : buildingFloorHeight(x, z);

/** Pick the visible height field, including terrace faces, without raycasting every voxel. */
export function pickTerrain(ray: THREE.Ray, dungeon = false, maxDistance = 500): THREE.Vector3 | undefined {
  if (![...ray.origin.toArray(), ...ray.direction.toArray(), maxDistance].every(Number.isFinite) || maxDistance <= 0) return;
  if (dungeon) {
    const hit = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    return hit && hit.distanceTo(ray.origin) <= Math.min(1000, maxDistance) ? hit : undefined;
  }
  const point = new THREE.Vector3();
  const inside = (p: THREE.Vector3) => p.x >= WORLD_BOUNDS.minX && p.x <= WORLD_BOUNDS.maxX && p.z >= WORLD_BOUNDS.minZ && p.z <= WORLD_BOUNDS.maxZ;
  let previous = 0;
  for (let distance = 0; distance <= Math.min(1000, maxDistance); distance += .5) {
    ray.at(distance, point);
    if (!inside(point)) { previous = distance; continue; }
    if (point.y > surfaceHeight(point.x, point.z)) { previous = distance; continue; }
    let low = previous, high = distance;
    for (let i = 0; i < 12; i++) {
      const mid = (low + high) / 2; ray.at(mid, point);
      if (point.y > surfaceHeight(point.x, point.z)) low = mid; else high = mid;
    }
    ray.at(high, point); point.y = surfaceHeight(point.x, point.z); return point;
  }
}
