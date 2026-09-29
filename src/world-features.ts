import type { NodeKind, ZoneId, EnemyKind } from './content.ts';

/** Local biomes preserve the six realm identities and all existing saved coordinates. */
export const WILD_BIOMES = [
  { id: 'slimefen', name: 'Slimefen', zone: 'greenwood' as ZoneId, x: -1010, z: 230, radius: 86, floor: [0x547937, 0x698941, 0x405f36], accent: 0xb9eb65, enemy: 'moss-slime' as EnemyKind, description: 'Luminous slime pools, crooked fungi and a reclaimed herb garden.' },
  { id: 'sugarbloom', name: 'Sugarbloom Orchard', zone: 'greenwood' as ZoneId, x: -280, z: 1000, radius: 86, floor: [0xbf8b9b, 0xd2a3aa, 0xa47f93], accent: 0xffd1aa, enemy: 'briar-sentinel' as EnemyKind, description: 'Crystallized sugar canes, rose-colored soil and candy-crowned trees.' },
] as const;
export const wildBiomeAt = (x: number, z: number) => WILD_BIOMES.find(biome => Math.hypot(x - biome.x, z - biome.z) < biome.radius);
export const RESOURCE_SITES: readonly { id: string; name: string; zone: ZoneId; x: number; z: number; kind: 'cave' | 'quarry' | 'mine' | 'grove' | 'garden' | 'farm'; resources: readonly NodeKind[] }[] = [
  { id: 'copper-quarry', name: 'Copperstep Quarry', zone: 'amberwild', x: 120, z: -258, kind: 'quarry', resources: ['crystal', 'copper-vein'] },
  { id: 'cobalt-cave', name: 'Blueglass Cave', zone: 'frostmarch', x: 140, z: -575, kind: 'cave', resources: ['star-fragment', 'cobalt-vein'] },
  { id: 'sunstone-mine', name: 'Sunstone Mineshaft', zone: 'sunveil', x: -1090, z: -470, kind: 'mine', resources: ['sunstone-vein'] },
  { id: 'silver-grove', name: 'Silverleaf Grove', zone: 'greenwood', x: -235, z: 155, kind: 'grove', resources: ['timber', 'silver-birch'] },
  { id: 'slimefen-garden', name: 'Slimefen Herb Garden', zone: 'greenwood', x: -1030, z: 220, kind: 'garden', resources: ['herb', 'moonpetal'] },
  { id: 'sugarbloom-farm', name: 'Sugarbloom Farm', zone: 'greenwood', x: -280, z: 1020, kind: 'farm', resources: ['herb', 'frostbloom'] },
  { id: 'elder-grove', name: 'Ancient Elderwood Grove', zone: 'mistwood', x: 1100, z: 640, kind: 'grove', resources: ['elderwood', 'sunblossom'] },
];
export const RESOURCE_SITE_WALLS = RESOURCE_SITES.filter(site => ['cave', 'mine', 'quarry'].includes(site.kind)).flatMap(site => [
  { x: site.x - 10, z: site.z, halfWidth: 1.5, halfDepth: 13, height: site.kind === 'quarry' ? 3 : 7, r: 14 },
  { x: site.x + 10, z: site.z, halfWidth: 1.5, halfDepth: 13, height: site.kind === 'quarry' ? 3 : 7, r: 14 },
  { x: site.x, z: site.z - 12, halfWidth: 10, halfDepth: 1.5, height: site.kind === 'quarry' ? 3 : 7, r: 11 },
]);
export const WORLD_CURIOS = [
  { id: 'curio-last-campfire', name: 'The Last Campfire', x: -1010, z: 182, text: 'A weathered knight left a bent sword by the coals. The inscription reads: “Rest here. Try again.” Someone has scratched a tiny sun beneath it.' },
  { id: 'curio-companion-crate', name: 'Companion Crate', x: -260, z: 982, text: 'A wooden crate bears a pink heart. The attached orchard test report insists that the cake was real. The crate offers no comment.' },
] as const;
export const DREAM_DURATION_MS = 3 * 60 * 1000;
export const DREAM_REST_COOLDOWN_MS = 10 * 60 * 1000;
