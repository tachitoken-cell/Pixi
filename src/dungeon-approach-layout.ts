/** Metres relative to the portal. Blender, terrain and authoritative collision share this plan. */
export const DUNGEON_TEMPLE_BOUNDS = { minX: -33, maxX: 33, minZ: -5, maxZ: 63 } as const;
export const DUNGEON_TEMPLE_WALLS = [
  // The surviving sanctuary remains the destination, with breaches in both side walls.
  { x: 0, z: -4, width: 29.4, depth: 1.4, height: 10.4 },
  { x: -14, z: -.5, width: 1.4, depth: 7, height: 5.2 },
  { x: -14, z: 13.5, width: 1.4, depth: 9, height: 4.2 },
  { x: 14, z: -.5, width: 1.4, depth: 7, height: 5.8 },
  { x: 14, z: 13.5, width: 1.4, depth: 9, height: 4.8 },
  { x: 4.5, z: 14, width: 19, depth: 1.4, height: 6.8 },
  { x: -12.5, z: 14, width: 3, depth: 1.4, height: 5.1 },
  // The old cloister has fallen open in several places.
  { x: -27, z: 24, width: 10, depth: 1.4, height: 2.9 },
  { x: -10, z: 24, width: 8, depth: 1.4, height: 4.1 },
  { x: 2, z: 24, width: 6, depth: 1.4, height: 6.2 },
  { x: 15.5, z: 24, width: 9, depth: 1.4, height: 4.7 },
  { x: 29, z: 24, width: 6, depth: 1.4, height: 2.1 },
  // A broader outer court, with the formal gate and two collapsed side passages.
  { x: -27, z: 42, width: 10, depth: 1.4, height: 3.4 },
  { x: -11, z: 42, width: 10, depth: 1.4, height: 5.1 },
  { x: 11, z: 42, width: 10, depth: 1.4, height: 4.5 },
  { x: 27, z: 42, width: 10, depth: 1.4, height: 2.6 },
  // Perimeter remnants leave eight-metre breaches into the side wings.
  { x: -32, z: 4, width: 1.4, depth: 16, height: 3.3 },
  { x: -32, z: 29, width: 1.4, depth: 18, height: 4.1 },
  { x: -32, z: 54, width: 1.4, depth: 16, height: 2.5 },
  { x: 32, z: 5, width: 1.4, depth: 18, height: 3.8 },
  { x: 32, z: 31, width: 1.4, depth: 18, height: 2.9 },
  { x: 32, z: 55, width: 1.4, depth: 14, height: 4.2 },
  { x: -25, z: -4, width: 14, depth: 1.4, height: 2.4 },
  { x: 25, z: -4, width: 14, depth: 1.4, height: 3.1 },
  { x: -25, z: 62, width: 14, depth: 1.4, height: 2.2 },
  { x: -9, z: 62, width: 6, depth: 1.4, height: 4.1 },
  { x: 9, z: 62, width: 6, depth: 1.4, height: 3.5 },
  { x: 25, z: 62, width: 14, depth: 1.4, height: 1.8 },
  // Remains of small side chapels, open toward the courtyards.
  { x: -24, z: 52, width: 1.4, depth: 10, height: 3.7 },
  { x: -27, z: 47, width: 6, depth: 1.4, height: 2.2 },
  { x: 25, z: 53, width: 1.4, depth: 10, height: 3.2 },
  { x: 28, z: 48, width: 6, depth: 1.4, height: 1.6 },
] as const;
export const DUNGEON_TEMPLE_PILLARS = [
  { x: -6.9, z: 62, width: 1.8, depth: 1.8, height: 7.4 },
  { x: 6.9, z: 62, width: 1.8, depth: 1.8, height: 8.1 },
  { x: 4.1, z: 24, width: 1.8, depth: 1.8, height: 8.1 },
  { x: 11.9, z: 24, width: 1.8, depth: 1.8, height: 8.1 },
  { x: -11.9, z: 14, width: 1.8, depth: 1.8, height: 7.5 },
  { x: -4.1, z: 14, width: 1.8, depth: 1.8, height: 7.5 },
  { x: -11, z: 32, width: 2.8, depth: 2.8, height: 3.2 },
  { x: 10.5, z: 18.5, width: 3, depth: 3, height: 1.4 },
  { x: -10, z: 2, width: 2.4, depth: 2.4, height: 5.7 },
  { x: -6.9, z: 42, width: 1.8, depth: 1.8, height: 6.8 },
  { x: 6.9, z: 42, width: 1.8, depth: 1.8, height: 7.6 },
  { x: -9, z: 51, width: 2, depth: 2, height: 5.4 },
  { x: 9, z: 51, width: 2, depth: 2, height: 2.4 },
  { x: -27, z: 55, width: 3, depth: 2.4, height: 1.2 },
  { x: 28, z: 55, width: 2.4, depth: 2.4, height: 4.1 },
  { x: -27, z: 32, width: 2, depth: 2, height: 4.8 },
  { x: 27, z: 35, width: 2.6, depth: 2.6, height: 1.6 },
  { x: -22, z: 1, width: 3, depth: 2.4, height: 1.3 },
  { x: 24, z: 1, width: 2.4, depth: 2.4, height: 4.5 },
] as const;
export const DUNGEON_TEMPLE_ROUTE = [
  { x: 0, z: 70 }, { x: 0, z: 34 }, { x: 8, z: 34 },
  { x: 8, z: 18.5 }, { x: -8, z: 18.5 },
  { x: -8, z: 7 }, { x: 0, z: 7 }, { x: 0, z: 0 },
] as const;
/** Breaches are open in the mesh and collision, with routes that reconnect inside. */
export const DUNGEON_TEMPLE_ROUTES = [
  DUNGEON_TEMPLE_ROUTE,
  [{ x: -39, z: 16 }, { x: -25, z: 16 }, { x: -25, z: 6 }, { x: -8, z: 6 }, { x: 0, z: 6 }, { x: 0, z: 0 }],
  [{ x: 39, z: 18 }, { x: 25, z: 18 }, { x: 25, z: 6 }, { x: 9, z: 6 }, { x: 9, z: 3.5 }, { x: 0, z: 3.5 }, { x: 0, z: 0 }],
  [{ x: -15, z: 70 }, { x: -15, z: 52 }, { x: -19, z: 52 }, { x: -19, z: 19.5 }, { x: -8, z: 19.5 }, { x: -8, z: 7 }, { x: 0, z: 7 }, { x: 0, z: 0 }],
  [{ x: 15, z: 70 }, { x: 15, z: 52 }, { x: 19, z: 52 }, { x: 19, z: 34 }, { x: 23, z: 34 }, { x: 23, z: 18 }, { x: 25, z: 18 }, { x: 25, z: 6 }, { x: 9, z: 6 }, { x: 9, z: 3.5 }, { x: 0, z: 3.5 }, { x: 0, z: 0 }],
] as const;
