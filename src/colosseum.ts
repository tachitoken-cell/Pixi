/** Shared by authoritative combat, movement, terrain and the world atlas. */
export const COLOSSEUM = { id: 'mossvale-colosseum', name: 'Thornring Colosseum', x: 176, z: 0, radius: 42.5, outerRadius: 65, zone: 'amberwild' as const };
export const COLOSSEUM_ENTRANCE = { x: COLOSSEUM.x, z: COLOSSEUM.z + 75 };
export const isInColosseum = (point: { x: number; z: number }) =>
  Number.isFinite(point.x) && Number.isFinite(point.z) && Math.hypot(point.x - COLOSSEUM.x, point.z - COLOSSEUM.z) <= COLOSSEUM.radius;
export const inColosseumClearing = (x: number, z: number) => Math.hypot(x - COLOSSEUM.x, z - COLOSSEUM.z) < 80;

/** Exact Blender terrace tops; the four gate passages remain at ground level. */
export function colosseumFloorHeight(x: number, z: number): number | undefined {
  const dx = x - COLOSSEUM.x, dz = z - COLOSSEUM.z, radius = Math.hypot(dx, dz) / 2.5;
  // Support the top terrace through the wall's stepped collider edge, including its corner recesses.
  if (radius < 17.99 || radius > COLOSSEUM.outerRadius / 2.5 || Math.min(Math.abs(dx), Math.abs(dz)) < 8) return;
  if (radius < 18.586) return 1.5;
  const row = Math.min(14, Math.floor((radius - 18.586) / .43));
  return (1.52 + row * .4) * 1.5;
}

/** The four 6m square Blender pillars block both movement and spell line of sight. */
export const COLOSSEUM_PILLARS = [-18, 18].flatMap(x => [-18, 18].map(z => ({ x: COLOSSEUM.x + x, z: COLOSSEUM.z + z, r: Math.hypot(3, 3), halfWidth: 3, halfDepth: 3 })));
// Exterior masonry, gate piers and combat cover are solid; spectators walk on terraces.
export const COLOSSEUM_COLLIDERS: { x: number; z: number; r: number; halfWidth: number; halfDepth: number }[] = [...COLOSSEUM_PILLARS];
for (let x = -66; x < 66; x++) for (let z = -66; z < 66; z++) {
  const radius = Math.hypot(x + .5, z + .5);
  if (radius < 62.7 || radius > 65.5 || Math.abs(x + .5) < 8.5 || Math.abs(z + .5) < 8.5) continue;
  COLOSSEUM_COLLIDERS.push({ x: COLOSSEUM.x + x + .5, z: COLOSSEUM.z + z + .5, r: Math.SQRT1_2, halfWidth: .5, halfDepth: .5 });
}
for (const side of [-1, 1]) for (const direction of [-1, 1]) {
  const pier = { x: side * 11.375, z: direction * 61, r: Math.hypot(3.375,3.875), halfWidth: 3.375, halfDepth: 3.875 };
  COLOSSEUM_COLLIDERS.push({ ...pier, x: COLOSSEUM.x + pier.x, z: COLOSSEUM.z + pier.z },
    { ...pier, x: COLOSSEUM.x + pier.z, z: COLOSSEUM.z + pier.x, halfWidth: pier.halfDepth, halfDepth: pier.halfWidth });
}
