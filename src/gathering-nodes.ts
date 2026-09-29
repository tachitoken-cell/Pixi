import { RESOURCE_SITES } from './world-features.ts';
import { ZONES, type NodeKind, type ZoneId } from './content.ts';
import { EXPEDITIONS, EXPEDITION_NODE_OFFSETS, WORLD_BOUNDS, surfaceAt } from './landscape.ts';
import { WORLD_COLLIDERS, canTraverse, toWorld } from './realm.ts';
import { townDistance } from './settlements.ts';
import { insideAirshipApproach } from './city.ts';
import { inColosseumClearing } from './colosseum.ts';
import { WORLD_BOSSES } from './bestiary.ts';
import { DUNGEONS } from './dungeon.ts';

export interface GatheringNode { id: string; kind: NodeKind; zone: ZoneId; x: number; z: number; respawnMs?: number; siteId?: string; waterX?: number; waterZ?: number }
/** Actual maximum Blender footprints; trees include their crowns to avoid clipping buildings. */
export const GATHERING_FOOTPRINTS = {
  'copper-vein': 2, 'cobalt-vein': 2.2, 'sunstone-vein': 2.4,
  'silver-birch': 3, ironwood: 4, elderwood: 5,
  moonpetal: 1.5, frostbloom: 1.8, sunblossom: 2,
} as const;

/** Authored dry, collision-free placements with verified approaches; original quest nodes remain unchanged. */
export const GATHERING_NODES: readonly GatheringNode[] = [
  { id: 'gathering-capital-east-copper-vein-0', kind: 'copper-vein', zone: 'amberwild', x: 104, z: 16 },
  { id: 'gathering-capital-east-copper-vein-1', kind: 'copper-vein', zone: 'amberwild', x: 109, z: 13.5 },
  { id: 'gathering-capital-east-silver-birch-0', kind: 'silver-birch', zone: 'amberwild', x: 111, z: 4 },
  { id: 'gathering-capital-east-silver-birch-1', kind: 'silver-birch', zone: 'amberwild', x: 105, z: 0 },
  { id: 'gathering-capital-east-moonpetal-0', kind: 'moonpetal', zone: 'amberwild', x: 97, z: 4 },
  { id: 'gathering-capital-east-moonpetal-1', kind: 'moonpetal', zone: 'amberwild', x: 96.5, z: 11 },
  { id: 'gathering-capital-north-copper-vein-0', kind: 'copper-vein', zone: 'amberwild', x: -4.5, z: -97 },
  { id: 'gathering-capital-north-copper-vein-1', kind: 'copper-vein', zone: 'amberwild', x: 0, z: -102.5 },
  { id: 'gathering-capital-north-silver-birch-0', kind: 'silver-birch', zone: 'amberwild', x: -3.5, z: -110.5 },
  { id: 'gathering-capital-north-silver-birch-1', kind: 'silver-birch', zone: 'amberwild', x: -10.5, z: -111.5 },
  { id: 'gathering-capital-north-moonpetal-0', kind: 'moonpetal', zone: 'amberwild', x: -16, z: -104.5 },
  { id: 'gathering-capital-north-moonpetal-1', kind: 'moonpetal', zone: 'amberwild', x: -13.5, z: -98 },
  { id: 'gathering-pinewake-copper-vein-0', kind: 'copper-vein', zone: 'greenwood', x: -289.5, z: 113 },
  { id: 'gathering-pinewake-copper-vein-1', kind: 'copper-vein', zone: 'greenwood', x: -233.5, z: 147 },
  { id: 'gathering-pinewake-silver-birch-0', kind: 'silver-birch', zone: 'greenwood', x: -274.5, z: 112.5 },
  { id: 'gathering-pinewake-silver-birch-1', kind: 'silver-birch', zone: 'greenwood', x: -314, z: 126 },
  { id: 'gathering-pinewake-moonpetal-0', kind: 'moonpetal', zone: 'greenwood', x: -324, z: 179 },
  { id: 'gathering-pinewake-moonpetal-1', kind: 'moonpetal', zone: 'greenwood', x: -292.5, z: 206.5 },
  { id: 'gathering-silverreach-copper-vein-0', kind: 'copper-vein', zone: 'greenwood', x: -275, z: -33 },
  { id: 'gathering-silverreach-copper-vein-1', kind: 'copper-vein', zone: 'greenwood', x: -274.5, z: 32.5 },
  { id: 'gathering-silverreach-silver-birch-0', kind: 'silver-birch', zone: 'greenwood', x: -328, z: 44.5 },
  { id: 'gathering-silverreach-silver-birch-1', kind: 'silver-birch', zone: 'greenwood', x: -286.5, z: 41.5 },
  { id: 'gathering-silverreach-moonpetal-0', kind: 'moonpetal', zone: 'greenwood', x: -340.5, z: 37 },
  { id: 'gathering-silverreach-moonpetal-1', kind: 'moonpetal', zone: 'greenwood', x: -285.5, z: -41.5 },
  { id: 'gathering-elderwood-silver-birch-0', kind: 'silver-birch', zone: 'greenwood', x: 246, z: 375 },
  { id: 'gathering-elderwood-silver-birch-1', kind: 'silver-birch', zone: 'greenwood', x: 276, z: 433 },
  { id: 'gathering-elderwood-moonpetal-0', kind: 'moonpetal', zone: 'greenwood', x: 259, z: 382 },
  { id: 'gathering-elderwood-moonpetal-1', kind: 'moonpetal', zone: 'greenwood', x: 249.5, z: 464 },
  { id: 'gathering-redleaf-copper-vein-0', kind: 'copper-vein', zone: 'amberwild', x: -494.5, z: -379 },
  { id: 'gathering-redleaf-copper-vein-1', kind: 'copper-vein', zone: 'amberwild', x: -543, z: -298 },
  { id: 'gathering-redleaf-ironwood-0', kind: 'ironwood', zone: 'amberwild', x: -526, z: -299 },
  { id: 'gathering-redleaf-ironwood-1', kind: 'ironwood', zone: 'amberwild', x: -559, z: -312 },
  { id: 'gathering-cindergrove-copper-vein-0', kind: 'copper-vein', zone: 'amberwild', x: 75, z: -275.5 },
  { id: 'gathering-cindergrove-copper-vein-1', kind: 'copper-vein', zone: 'amberwild', x: 34, z: -270 },
  { id: 'gathering-cindergrove-ironwood-0', kind: 'ironwood', zone: 'amberwild', x: 46.5, z: -276 },
  { id: 'gathering-cindergrove-ironwood-1', kind: 'ironwood', zone: 'amberwild', x: 38, z: -187.5 },
  { id: 'gathering-sunscar-ironwood-0', kind: 'ironwood', zone: 'amberwild', x: -527, z: -570 },
  { id: 'gathering-sunscar-ironwood-1', kind: 'ironwood', zone: 'amberwild', x: -485.5, z: -564 },
  { id: 'gathering-stormcrag-cobalt-vein-0', kind: 'cobalt-vein', zone: 'frostmarch', x: 52, z: -629 },
  { id: 'gathering-stormcrag-cobalt-vein-1', kind: 'cobalt-vein', zone: 'frostmarch', x: 113.5, z: -556 },
  { id: 'gathering-stormcrag-frostbloom-0', kind: 'frostbloom', zone: 'frostmarch', x: 60, z: -546.5 },
  { id: 'gathering-stormcrag-frostbloom-1', kind: 'frostbloom', zone: 'frostmarch', x: 101.5, z: -547 },
  { id: 'gathering-northglass-cobalt-vein-0', kind: 'cobalt-vein', zone: 'frostmarch', x: 526, z: -501.5 },
  { id: 'gathering-northglass-cobalt-vein-1', kind: 'cobalt-vein', zone: 'frostmarch', x: 530, z: -502.5 },
  { id: 'gathering-northglass-frostbloom-0', kind: 'frostbloom', zone: 'frostmarch', x: 531, z: -576.5 },
  { id: 'gathering-northglass-frostbloom-1', kind: 'frostbloom', zone: 'frostmarch', x: 475, z: -517 },
  { id: 'gathering-moonfen-moonpetal-0', kind: 'moonpetal', zone: 'hollow', x: 695, z: -127 },
  { id: 'gathering-moonfen-moonpetal-1', kind: 'moonpetal', zone: 'hollow', x: 629.5, z: -123 },
  { id: 'gathering-moonfen-ironwood-0', kind: 'ironwood', zone: 'hollow', x: 620, z: -133 },
  { id: 'gathering-moonfen-ironwood-1', kind: 'ironwood', zone: 'hollow', x: 695, z: -193 },
  { id: 'gathering-shadewood-ironwood-0', kind: 'ironwood', zone: 'hollow', x: 646, z: 333.5 },
  { id: 'gathering-shadewood-ironwood-1', kind: 'ironwood', zone: 'hollow', x: 631, z: 356.5 },
  { id: 'gathering-dune-wells-sunstone-vein-0', kind: 'sunstone-vein', zone: 'sunveil', x: -1139, z: -381.5 },
  { id: 'gathering-dune-wells-sunstone-vein-1', kind: 'sunstone-vein', zone: 'sunveil', x: -1098, z: -373.5 },
  { id: 'gathering-dune-wells-sunblossom-0', kind: 'sunblossom', zone: 'sunveil', x: -1076.5, z: -454 },
  { id: 'gathering-dune-wells-sunblossom-1', kind: 'sunblossom', zone: 'sunveil', x: -1073.5, z: -389 },
  { id: 'gathering-saffron-mesa-sunstone-vein-0', kind: 'sunstone-vein', zone: 'sunveil', x: -758.5, z: -1012.5 },
  { id: 'gathering-saffron-mesa-sunstone-vein-1', kind: 'sunstone-vein', zone: 'sunveil', x: -718, z: -1024 },
  { id: 'gathering-saffron-mesa-sunblossom-0', kind: 'sunblossom', zone: 'sunveil', x: -705, z: -1076.5 },
  { id: 'gathering-saffron-mesa-sunblossom-1', kind: 'sunblossom', zone: 'sunveil', x: -734.5, z: -1105.5 },
  { id: 'gathering-glass-dunes-sunstone-vein-0', kind: 'sunstone-vein', zone: 'sunveil', x: -1156, z: -1174 },
  { id: 'gathering-glass-dunes-sunstone-vein-1', kind: 'sunstone-vein', zone: 'sunveil', x: -1125.5, z: -1202.5 },
  { id: 'gathering-glass-dunes-sunblossom-0', kind: 'sunblossom', zone: 'sunveil', x: -1132.5, z: -1190.5 },
  { id: 'gathering-glass-dunes-sunblossom-1', kind: 'sunblossom', zone: 'sunveil', x: -1177, z: -1267.5 },
  { id: 'gathering-sunveil-badlands-sunstone-vein-0', kind: 'sunstone-vein', zone: 'sunveil', x: -1286.5, z: -705.5 },
  { id: 'gathering-sunveil-badlands-sunstone-vein-1', kind: 'sunstone-vein', zone: 'sunveil', x: -1358.5, z: -769 },
  { id: 'gathering-sunveil-badlands-sunblossom-0', kind: 'sunblossom', zone: 'sunveil', x: -1306.5, z: -786 },
  { id: 'gathering-sunveil-badlands-sunblossom-1', kind: 'sunblossom', zone: 'sunveil', x: -1347.5, z: -779 },
  { id: 'gathering-canopy-reach-elderwood-0', kind: 'elderwood', zone: 'mistwood', x: 538.5, z: 906.5 },
  { id: 'gathering-canopy-reach-elderwood-1', kind: 'elderwood', zone: 'mistwood', x: 590.5, z: 834.5 },
  { id: 'gathering-jade-rainforest-elderwood-0', kind: 'elderwood', zone: 'mistwood', x: 1060.5, z: 582.5 },
  { id: 'gathering-jade-rainforest-elderwood-1', kind: 'elderwood', zone: 'mistwood', x: 1054, z: 624 },
  { id: 'gathering-mistwood-basin-elderwood-0', kind: 'elderwood', zone: 'mistwood', x: 1052.5, z: 1132 },
  { id: 'gathering-mistwood-basin-elderwood-1', kind: 'elderwood', zone: 'mistwood', x: 1014, z: 1148.5 },
  { id: 'gathering-orchid-isles-elderwood-0', kind: 'elderwood', zone: 'mistwood', x: 344.5, z: 1316 },
  { id: 'gathering-orchid-isles-elderwood-1', kind: 'elderwood', zone: 'mistwood', x: 416.5, z: 1340 },
  { id: 'gathering-ancient-canopy-elderwood-0', kind: 'elderwood', zone: 'mistwood', x: 1371, z: 1052 },
  { id: 'gathering-ancient-canopy-elderwood-1', kind: 'elderwood', zone: 'mistwood', x: 1376.5, z: 1147.5 },
  { id: 'gathering-sunveil-town-sunstone-vein-0', kind: 'sunstone-vein', zone: 'sunveil', x: -954.5, z: -917.5 },
  { id: 'gathering-sunveil-town-sunstone-vein-1', kind: 'sunstone-vein', zone: 'sunveil', x: -1037.5, z: -834.5 },
  { id: 'gathering-sunveil-town-sunblossom-0', kind: 'sunblossom', zone: 'sunveil', x: -1038, z: -1005 },
  { id: 'gathering-sunveil-town-sunblossom-1', kind: 'sunblossom', zone: 'sunveil', x: -1042, z: -835 },
  { id: 'gathering-mistwood-town-elderwood-0', kind: 'elderwood', zone: 'mistwood', x: 1082.5, z: 1088 },
  { id: 'gathering-mistwood-town-elderwood-1', kind: 'elderwood', zone: 'mistwood', x: 993.5, z: 1002 },
];

/** Keep story/training supplies reachable, then scatter finds across the whole dry world. */
export function createGatheringNodes(): GatheringNode[] {
  const nodes: GatheringNode[] = [
    ...GATHERING_NODES,
    ...ZONES.flatMap(zone => zone.nodes.map(node => ({ ...toWorld(zone.id, node), zone: zone.id }))),
    ...EXPEDITIONS.flatMap(camp => EXPEDITION_NODE_OFFSETS.map((offset, i) => ({
      id: `expedition-${camp.id}-node-${i}`, kind: (['timber', 'herb', ZONES.find(zone => zone.id === camp.zone)!.nodeKind] as NodeKind[])[i],
      zone: camp.zone, x: camp.x + offset.x, z: camp.z + offset.z,
    }))),
  ];
  const kinds: Record<ZoneId, NodeKind[]> = {
    greenwood: ['crystal', 'timber', 'herb', 'copper-vein', 'silver-birch', 'moonpetal'],
    amberwild: ['ember-shard', 'timber', 'herb', 'copper-vein', 'ironwood', 'moonpetal'],
    frostmarch: ['star-fragment', 'timber', 'herb', 'cobalt-vein', 'ironwood', 'frostbloom'],
    hollow: ['heartroot', 'timber', 'herb', 'cobalt-vein', 'ironwood', 'moonpetal'],
    sunveil: ['ember-shard', 'timber', 'herb', 'sunstone-vein', 'ironwood', 'sunblossom'],
    mistwood: ['heartroot', 'timber', 'herb', 'cobalt-vein', 'elderwood', 'sunblossom'],
  };
  let seed = 9132026;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const radius = (kind: NodeKind) => (GATHERING_FOOTPRINTS[kind as keyof typeof GATHERING_FOOTPRINTS] ?? (kind === 'timber' ? 2.5 : 1.6)) / 2;
  const add = (node: GatheringNode, spacing: number) => {
    const r = radius(node.kind) + .5, surface = surfaceAt(node.x, node.z);
    if (surface.water || surface.beach || surface.zone !== node.zone || townDistance(node) < r + 8
      || insideAirshipApproach(node.x, node.z) || inColosseumClearing(node.x, node.z)
      || WORLD_BOSSES.some(boss => Math.hypot(node.x - boss.x, node.z - boss.z) < boss.arenaRadius + r)
      || DUNGEONS.some(dungeon => Math.hypot(node.x - dungeon.entrance.x, node.z - dungeon.entrance.z) < 32)
      || !canTraverse(node, node, WORLD_COLLIDERS, WORLD_BOUNDS, r)) return false;
    for (let i = 0; i < 8; i++) {
      const edge = { x: node.x + Math.sin(i * Math.PI / 4) * r, z: node.z + Math.cos(i * Math.PI / 4) * r };
      const ground = surfaceAt(edge.x, edge.z);
      if (ground.water || ground.zone !== node.zone || Math.abs(ground.height - surface.height) > 1.5 || !canTraverse(node, edge)) return false;
    }
    // ponytail: one startup scan over a bounded layout; use spatial cells if the world grows.
    if (nodes.some(other => Math.hypot(node.x - other.x, node.z - other.z) < Math.max(spacing, r + radius(other.kind) + 1))) return false;
    nodes.push(node); return true;
  };
  // Rich, shared deposits have faster replenishment but retain one server-owned claim per node.
  for (const site of RESOURCE_SITES) for (let i = 0; i < 8; i++) {
    const kind = site.resources[i % site.resources.length];
    add({ id: `${site.id}-resource-${i}`, siteId: site.id, kind, zone: site.zone, x: site.x + (i % 2 ? 4 : -4), z: site.z - 8 + Math.floor(i / 2) * 5, respawnMs: 10000 }, 3);
  }
  // Jitter the grid so open stretches have individual finds, with occasional small deposits/groves.
  for (let x = WORLD_BOUNDS.minX + 40; x < WORLD_BOUNDS.maxX; x += 80) for (let z = WORLD_BOUNDS.minZ + 40; z < WORLD_BOUNDS.maxZ; z += 80) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const point = { x: Math.round(x + (random() - .5) * 60), z: Math.round(z + (random() - .5) * 60) };
      const zone = surfaceAt(point.x, point.z).zone, kind = kinds[zone][Math.floor(random() * kinds[zone].length)];
      const node = { ...point, id: `wild-gathering-${x}-${z}`, kind, zone };
      if (!add(node, 24)) continue;
      if (random() < .23) {
        const count = 2 + Math.floor(random() * 3);
        for (let i = 0; i < count; i++) for (let retry = 0; retry < 8; retry++) {
          const angle = random() * Math.PI * 2, distance = 6 + random() * 8;
          if (add({ ...node, id: `${node.id}-cluster-${i}`, x: Math.round(node.x + Math.sin(angle) * distance), z: Math.round(node.z + Math.cos(angle) * distance) }, 5)) break;
        }
      }
      break;
    }
  }
  // Cast from dry banks; water and a walkable land approach are both required.
  const fishingCounts = new Map<string, number>(), fishingNodes: GatheringNode[] = [];
  for (let x = WORLD_BOUNDS.minX + 4; x < WORLD_BOUNDS.maxX; x += 8) for (let z = WORLD_BOUNDS.minZ + 4; z < WORLD_BOUNDS.maxZ; z += 8) {
    const surface = surfaceAt(x, z); if (surface.water || surface.height > 1.5 || !surface.beach) continue;
    const count = fishingCounts.get(surface.zone) || 0; if (count >= 14) continue;
    if (fishingNodes.some(node => Math.hypot(x-node.x,z-node.z)<90)) continue;
    const water = [[4,0],[-4,0],[0,4],[0,-4]].map(([dx,dz]) => ({x:x+dx,z:z+dz,dx,dz})).find(point => surfaceAt(point.x, point.z).water);
    if (!water || !canTraverse({x,z},{x:x-water.dx,z:z-water.dz}) || !canTraverse({x,z},{x,z},WORLD_COLLIDERS,WORLD_BOUNDS,1.4)) continue;
    const tier = surface.zone === 'frostmarch' ? 2 : surface.zone === 'hollow' || surface.zone === 'mistwood' ? 3 : surface.zone === 'amberwild' || surface.zone === 'sunveil' ? 1 : 0;
    fishingCounts.set(surface.zone, count + 1);
    fishingNodes.push({id: `fishing-${surface.zone}-${count}`,kind: (['brook-shoal','silver-shoal','glacial-shoal','moonfin-shoal'] as NodeKind[])[tier],zone:surface.zone,x,z,waterX:water.x,waterZ:water.z,respawnMs:14000});
  }
  return [...nodes,...fishingNodes];
}

/** Shared by the server and profession waypoints; stable IDs/positions across reconnects. */
export const WORLD_GATHERING_NODES: readonly GatheringNode[] = createGatheringNodes();
