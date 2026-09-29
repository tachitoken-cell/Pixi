import { wildBiomeAt } from './world-features.ts';
import { CITY_RADIUS, REGION_ORIGINS } from './city.ts';
import { COLOSSEUM, inColosseumClearing } from './colosseum.ts';
import { DUNGEONS } from './dungeon.ts';
import { WORLD_BOSSES } from './bestiary.ts';
import { DUNGEON_TEMPLE_BOUNDS } from './dungeon-approach-layout.ts';
import type { ZoneId } from './content.ts';

/** Retained only to identify the original, compact realm in saves and diagnostics. */
export const CORE_BOUNDS = { minX: -48, maxX: 144, minZ: -144, maxZ: 48 };
export const LEGACY_WORLD_BOUNDS = { minX: -336, maxX: 432, minZ: -432, maxZ: 336 };
export const PRE_EXPANSION_BOUNDS = { minX: -720, maxX: 816, minZ: -816, maxZ: 720 };
export const WORLD_BOUNDS = { minX: -1488, maxX: 1584, minZ: -1584, maxZ: 1488 };
export { REGION_ORIGINS } from './city.ts';
export const TOWN_HEIGHTS: Record<ZoneId, number> = { greenwood: 0, amberwild: 18, frostmarch: 25, hollow: 8, sunveil: 14, mistwood: 22 };
export const TERRAIN_STEP = 4;
export const TERRAIN_MAX_STEP = 1.5;
export const WATER_LEVEL = -.18;
export const SWIM_SPEED = 4.34;
export const EXPEDITIONS: readonly { id: string; name: string; zone: ZoneId; x: number; z: number; radius: number }[] = [
  { id: 'pinewake', name: 'Pinewake Hills', zone: 'greenwood', x: -280, z: 160, radius: 170 },
  { id: 'redleaf', name: 'Redleaf Highlands', zone: 'amberwild', x: -520, z: -340, radius: 190 },
  { id: 'sunscar', name: 'Sunscar Coast', zone: 'amberwild', x: -500, z: -610, radius: 145 },
  { id: 'stormcrag', name: 'Stormcrag Tundra', zone: 'frostmarch', x: 80, z: -590, radius: 200 },
  { id: 'northglass', name: 'Northglass Fjords', zone: 'frostmarch', x: 500, z: -540, radius: 185 },
  { id: 'moonfen', name: 'Moonfen Marsh', zone: 'hollow', x: 660, z: -160, radius: 145 },
  { id: 'shadewood', name: 'Shadewood Wilds', zone: 'hollow', x: 600, z: 320, radius: 185 },
  { id: 'elderwood', name: 'Elderwood Reach', zone: 'greenwood', x: 230, z: 420, radius: 180 },
  { id: 'tidewatch', name: 'Tidewatch Isle', zone: 'greenwood', x: -130, z: 490, radius: 190 },
  { id: 'whisper', name: 'Whispering Isles', zone: 'greenwood', x: -510, z: 480, radius: 190 },
  { id: 'silverreach', name: 'Silverreach Meadow', zone: 'greenwood', x: -310, z: 0, radius: 190 },
  { id: 'cindergrove', name: 'Cindergrove', zone: 'amberwild', x: 60, z: -230, radius: 175 },
  { id: 'opal-isles', name: 'Opal Isles', zone: 'frostmarch', x: -220, z: -690, radius: 110 },
  { id: 'bracken-crown', name: 'Bracken Crown', zone: 'greenwood', x: -600, z: 40, radius: 100 },
  { id: 'emberfall', name: 'Emberfall Ridge', zone: 'amberwild', x: 360, z: -60, radius: 140 },
  { id: 'violet-reach', name: 'Violet Reach', zone: 'hollow', x: 590, z: 590, radius: 125 },
  { id: 'winterspire', name: 'Winterspire Mountains', zone: 'frostmarch', x: 80, z: -1190, radius: 320 },
  { id: 'aurora-reach', name: 'Aurora Reach', zone: 'frostmarch', x: 610, z: -1250, radius: 310 },
  { id: 'copper-highlands', name: 'Copper Highlands', zone: 'amberwild', x: -410, z: -1110, radius: 290 },
  { id: 'westwind-meadows', name: 'Westwind Meadows', zone: 'greenwood', x: -1070, z: 150, radius: 300 },
  { id: 'oakheart-coast', name: 'Oakheart Coast', zone: 'greenwood', x: -1020, z: 760, radius: 350 },
  { id: 'umbral-shores', name: 'Umbral Shores', zone: 'hollow', x: 1110, z: -180, radius: 300 },
  { id: 'nightbloom', name: 'Nightbloom Wilds', zone: 'hollow', x: 1260, z: 370, radius: 280 },
  { id: 'southwind-basin', name: 'Southwind Basin', zone: 'greenwood', x: -320, z: 1100, radius: 360 },
  { id: 'dune-wells', name: 'Dunewell Oasis', zone: 'sunveil', x: -1110, z: -420, radius: 340 },
  { id: 'saffron-mesa', name: 'Saffron Mesa', zone: 'sunveil', x: -750, z: -1060, radius: 340 },
  { id: 'glass-dunes', name: 'Glass Dunes', zone: 'sunveil', x: -1170, z: -1220, radius: 300 },
  { id: 'sunveil-badlands', name: 'Sunveil Badlands', zone: 'sunveil', x: -1320, z: -740, radius: 280 },
  { id: 'canopy-reach', name: 'Canopy Reach', zone: 'mistwood', x: 550, z: 860, radius: 340 },
  { id: 'jade-rainforest', name: 'Jade Rainforest', zone: 'mistwood', x: 1100, z: 610, radius: 340 },
  { id: 'mistwood-basin', name: 'Mistwood Basin', zone: 'mistwood', x: 1050, z: 1180, radius: 310 },
  { id: 'orchid-isles', name: 'Orchid Isles', zone: 'mistwood', x: 390, z: 1300, radius: 280 },
  { id: 'ancient-canopy', name: 'The Ancient Canopy', zone: 'mistwood', x: 1370, z: 1100, radius: 280 },
];
export const EXPEDITION_ENEMY_OFFSETS = [{ x: -12, z: -8 }, { x: 12, z: -8 }, { x: 0, z: -18 }];
export const EXPEDITION_NODE_OFFSETS = [{ x: -9, z: 10 }, { x: 9, z: 10 }, { x: 0, z: 16 }];
export interface WorldSurface { water: boolean; height: number; zone: ZoneId; regionId: string; beach: boolean }
const towns = Object.entries(REGION_ORIGINS) as [ZoneId, { x: number; z: number }][];
export function townAt(x: number, z: number): ZoneId | undefined {
  return towns.find(([id,origin]) => { const radius=CITY_RADIUS+3; return x>=origin.x-radius&&x<origin.x+radius&&z>=origin.z-radius&&z<origin.z+radius||Math.abs(x-origin.x)<=12&&z-origin.z>=78&&z-origin.z<=124; })?.[0];
}
/** Protected town footprints are separate squares with level, walkable ground. */
export const inCore = (x: number, z: number) => towns.some(([,origin])=>Math.abs(x-origin.x)<CITY_RADIUS+3&&Math.abs(z-origin.z)<CITY_RADIUS+3);
const columns = (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX) / TERRAIN_STEP;
const rows = (WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ) / TERRAIN_STEP;
const cells: WorldSurface[] = [];
const townRadii = { greenwood: 165, amberwild: 275, frostmarch: 310, hollow: 215, sunveil: 340, mistwood: 340 };
const smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
// Broad overlapping ridges make climbable mountains; the winding cuts between
// them are low grassy valleys, rather than another ring of decorative meshes.
const mountainRidges = [
  [-160, -180, 155, 210, 110], [90, -420, 180, 260, 145], [450, -230, 190, 210, 145],
  [-510, -450, 125, 200, 118], [635, 90, 120, 240, 108], [240, 415, 140, 130, 92],
  [-300, 240, 145, 120, 88], [600, 500, 100, 165, 90],
  [-1180, -970, 280, 390, 84], [-730, -1280, 260, 260, 98], [80, -1260, 260, 290, 142],
  [650, -1240, 260, 310, 132], [-1130, 810, 230, 320, 106], [-300, 1220, 330, 230, 80],
  [1230, 1040, 270, 320, 118], [620, 1030, 250, 370, 104], [1270, 220, 270, 270, 126],
];
const relief = (x: number, z: number) => {
  let height = 8 + 13 * (.5 + .5 * Math.sin(x * .011 + Math.sin(z * .007))) + 8 * (.5 + .5 * Math.cos(z * .013 - x * .005));
  for (const [cx, cz, width, length, peak] of mountainRidges) {
    const distance = ((x - cx) / width) ** 2 + ((z - cz) / length) ** 2;
    height = Math.max(height, peak * Math.exp(-distance * .8) + 5 * Math.sin(x * .025 + z * .016) ** 2);
  }
  const valley = Math.min(Math.abs(z - (70 + 48 * Math.sin((x + 80) * .007))), Math.abs(x - (195 + 50 * Math.sin(z * .008))));
  const valleyFloor = 4 + 3 * (.5 + .5 * Math.sin((x + z) * .009));
  return valleyFloor + (height - valleyFloor) * smooth((valley - 16) / 82);
};
// Camps and hamlets retain level ground and gentle approaches even on a high
// plateau. The first hamlet sits south of town rather than at its camp marker.
const clearings = [...EXPEDITIONS, { x: -26, z: 100 }].map(point => ({ ...point, radius: 29, height: Math.round(relief(point.x, point.z) * 2) / 2 }));
for (const { entrance } of DUNGEONS) {
  const x=entrance.x+(DUNGEON_TEMPLE_BOUNDS.minX+DUNGEON_TEMPLE_BOUNDS.maxX)/2,z=entrance.z+(DUNGEON_TEMPLE_BOUNDS.minZ+DUNGEON_TEMPLE_BOUNDS.maxZ)/2;
  clearings.push({x,z,radius:Math.hypot((DUNGEON_TEMPLE_BOUNDS.maxX-DUNGEON_TEMPLE_BOUNDS.minX)/2,(DUNGEON_TEMPLE_BOUNDS.maxZ-DUNGEON_TEMPLE_BOUNDS.minZ)/2)+TERRAIN_STEP,height:Math.round(relief(x,z)*2)/2});
}
clearings.push({ x: COLOSSEUM.x, z: COLOSSEUM.z, radius: 76, height: 0 });
clearings.push(...WORLD_BOSSES.map(boss => ({ x: boss.x, z: boss.z, radius: boss.arenaRadius + TERRAIN_STEP, height: Math.round(relief(boss.x, boss.z) * 2) / 2 })));
// One immutable four-metre heightfield drives rendering, grounding, swimming and the atlas.
for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
  const x = WORLD_BOUNDS.minX + (i + .5) * TERRAIN_STEP, z = WORLD_BOUNDS.minZ + (j + .5) * TERRAIN_STEP;
  const town = townAt(x, z);
  const originalCell = x >= PRE_EXPANSION_BOUNDS.minX && x <= PRE_EXPANSION_BOUNDS.maxX && z >= PRE_EXPANSION_BOUNDS.minZ && z <= PRE_EXPANSION_BOUNDS.maxZ;
  let nearest = EXPEDITIONS[0], distance = Infinity, land = !!town, height = relief(x, z);
  for (const [index,region] of EXPEDITIONS.entries()) {
    const dx = x - region.x, dz = z - region.z, gap = Math.hypot(dx, dz);
    // Existing saves keep their biome ownership; new regions extend the old coastline.
    if (gap < distance && (!originalCell || index < 16)) { distance = gap; nearest = region; }
    if (!land && gap < Math.max(32, region.radius * (.88 + .09 + .06))) {
      const angle = Math.atan2(dz, dx);
      const edge = region.radius * (.88 + .09 * Math.sin(angle * 3 + region.x) + .06 * Math.sin(angle * 7 + region.z));
      if (gap < edge || gap < 32) land = true;
    }
  }
  for (const clearing of clearings) {
    // Beyond the blend bounds this clearing leaves the height unchanged.
    if (Math.abs(x - clearing.x) >= clearing.radius + 42 || Math.abs(z - clearing.z) >= clearing.radius + 42) continue;
    const blend = smooth((Math.hypot(x - clearing.x, z - clearing.z) - clearing.radius) / 42);
    height = clearing.height * (1 - blend) + height * blend;
  }
  for (const [id, origin] of towns) {
    const dx = x - origin.x, dz = z - origin.z;
    if (!land && Math.hypot(dx, dz) < townRadii[id] * (1 + .055 * Math.sin(Math.atan2(dz, dx) * 5))) land = true;
    const outside = Math.max(0, Math.max(Math.abs(dx), Math.abs(dz)) - (CITY_RADIUS+3));
    const blend = smooth(outside / 120);
    height = TOWN_HEIGHTS[id] * (1 - blend) + height * blend;
    height = Math.max(height, TOWN_HEIGHTS[id] - outside * .10);
  }
  // Broad river valleys add inland shorelines while every camp retains a dry approach.
  if (!town && distance > 42 && x > -390 && x < -175 && z > -80 && z < 190 && Math.abs(x - (-280 + Math.sin(z * .016) * 34)) < 9) land = false;
  if (x < WORLD_BOUNDS.minX + 8 || x > WORLD_BOUNDS.maxX - 8 || z < WORLD_BOUNDS.minZ + 8 || z > WORLD_BOUNDS.maxZ - 8) land = false;
  if (Math.hypot(x - COLOSSEUM.x, z - COLOSSEUM.z) < 86) land = true;
  const arena = inColosseumClearing(x, z), zone = town || nearest.zone;
  cells.push({ water: !land, height: land ? Math.round(Math.max(0, Math.min(145, town ? TOWN_HEIGHTS[town] : height)) * 2) / 2 : -3, zone, regionId: arena ? COLOSSEUM.id : town && distance>=12 ? town : wildBiomeAt(x, z)?.id ?? nearest.id, beach: false });
}
// Shore constraints propagate inland as a Manhattan distance transform. Every dry
// neighbouring tile remains an ordinary climbable terrace, including valley walls.
const limit = (a: number, b: number) => {
  const cell = cells[a], next = cells[b]; if (cell.water) return;
  cell.height = Math.min(cell.height, next.water ? 0 : next.height + TERRAIN_MAX_STEP);
};
const limitSlopes = () => {
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) { const k = j * columns + i; if (i) limit(k, k - 1); if (j) limit(k, k - columns); }
  for (let j = rows - 1; j >= 0; j--) for (let i = columns - 1; i >= 0; i--) { const k = j * columns + i; if (i + 1 < columns) limit(k, k + 1); if (j + 1 < rows) limit(k, k + columns); }
};
limitSlopes();
for (const clearing of clearings) {
  const plots: WorldSurface[] = [];
  const startX = Math.max(0, Math.floor((clearing.x - clearing.radius - WORLD_BOUNDS.minX) / TERRAIN_STEP)), endX = Math.min(columns - 1, Math.floor((clearing.x + clearing.radius - WORLD_BOUNDS.minX) / TERRAIN_STEP));
  const startZ = Math.max(0, Math.floor((clearing.z - clearing.radius - WORLD_BOUNDS.minZ) / TERRAIN_STEP)), endZ = Math.min(rows - 1, Math.floor((clearing.z + clearing.radius - WORLD_BOUNDS.minZ) / TERRAIN_STEP));
  for (let j = startZ; j <= endZ; j++) for (let i = startX; i <= endX; i++) {
    const x = WORLD_BOUNDS.minX + (i + .5) * TERRAIN_STEP, z = WORLD_BOUNDS.minZ + (j + .5) * TERRAIN_STEP;
    if (Math.hypot(x - clearing.x, z - clearing.z) <= clearing.radius && !cells[j * columns + i].water && !inCore(x, z)) plots.push(cells[j * columns + i]);
  }
  const floor = Math.min(...plots.map(cell => cell.height));
  for (const cell of plots) cell.height = floor;
}
limitSlopes();
for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
  const cell = cells[j * columns + i]; if (cell.water) continue;
  cell.beach = [[-1,0],[1,0],[0,-1],[0,1]].some(([dx,dz]) => i+dx<0 || i+dx>=columns || j+dz<0 || j+dz>=rows || cells[(j+dz)*columns+i+dx].water);
}
const sea: WorldSurface = { water: true, height: -3, zone: 'greenwood', regionId: 'sea', beach: false };
export function surfaceAt(x: number, z: number): WorldSurface {
  const i = Math.floor((x - WORLD_BOUNDS.minX) / TERRAIN_STEP), j = Math.floor((z - WORLD_BOUNDS.minZ) / TERRAIN_STEP);
  if (Number.isFinite(x) && Number.isFinite(z) && x >= WORLD_BOUNDS.minX && x <= WORLD_BOUNDS.maxX && z >= WORLD_BOUNDS.minZ && z <= WORLD_BOUNDS.maxZ)
    return cells[Math.min(rows - 1, j) * columns + Math.min(columns - 1, i)];
  return sea;
}
/** Exact rendered tile top; water returns its seabed, not the swimming surface. */
export const groundHeight = (x: number, z: number) => surfaceAt(x, z).height;
export const waterAt = (x: number, z: number) => surfaceAt(x, z).water;

const legacyOrigins: Record<ZoneId, { x: number; z: number }> = {
  greenwood: { x: 0, z: 0 }, amberwild: { x: 0, z: -96 }, frostmarch: { x: 96, z: -96 }, hollow: { x: 96, z: 0 },
  sunveil: REGION_ORIGINS.sunveil, mistwood: REGION_ORIGINS.mistwood,
};
const legacyCamps = [[-220,65],[-220,-125],[-190,-315],[15,-315],[215,-300],[325,-120],[325,95],[140,210],[-35,245],[-240,240],[-65,110],[130,-200]];
const legacyCore = (x: number, z: number) => x >= -48 && x <= 144 && z >= -144 && z <= 48;
const legacyCampIndex = (x: number, z: number) => {
  x = LEGACY_WORLD_BOUNDS.minX + (Math.min(191, Math.floor((x - LEGACY_WORLD_BOUNDS.minX) / 4)) + .5) * 4;
  z = LEGACY_WORLD_BOUNDS.minZ + (Math.min(191, Math.floor((z - LEGACY_WORLD_BOUNDS.minZ) / 4)) + .5) * 4;
  return legacyCamps.reduce((best, point, index) => Math.hypot(x - point[0], z - point[1]) < Math.hypot(x - legacyCamps[best][0], z - legacyCamps[best][1]) ? index : best, 0);
};
export function legacyRegionAt(x: number, z: number): ZoneId | undefined {
  if (![x,z].every(Number.isFinite) || x < LEGACY_WORLD_BOUNDS.minX || x > LEGACY_WORLD_BOUNDS.maxX || z < LEGACY_WORLD_BOUNDS.minZ || z > LEGACY_WORLD_BOUNDS.maxZ) return;
  return legacyCore(x,z) ? x < 48 ? z < -48 ? 'amberwild' : 'greenwood' : z < -48 ? 'frostmarch' : 'hollow' : EXPEDITIONS[legacyCampIndex(x,z)].zone;
}
/** Upgrade once from coordinateVersion 1; invalid coordinates are never legitimised. */
export function migrateWorldPositionV2(point: { x: number; z: number; zone: ZoneId }): { x: number; z: number; zone: ZoneId } {
  const oldZone = legacyRegionAt(point.x, point.z);
  if (!oldZone || oldZone !== point.zone) throw new Error('Invalid legacy world position');
  let x: number, z: number;
  if (legacyCore(point.x, point.z)) {
    x = point.x - legacyOrigins[oldZone].x + REGION_ORIGINS[oldZone].x;
    z = point.z - legacyOrigins[oldZone].z + REGION_ORIGINS[oldZone].z;
  } else {
    const index = legacyCampIndex(point.x, point.z), region = EXPEDITIONS[index];
    x = region.x + point.x - legacyCamps[index][0]; z = region.z + point.z - legacyCamps[index][1];
    if (x < WORLD_BOUNDS.minX || x > WORLD_BOUNDS.maxX || z < WORLD_BOUNDS.minZ || z > WORLD_BOUNDS.maxZ) { x = region.x; z = region.z; }
  }
  return { x, z, zone: surfaceAt(x,z).zone };
}
/** Charge shore-crossing segments by their actual surface, including both endpoints. */
export function movementCost(from: { x: number; z: number }, to: { x: number; z: number }): number {
  const distance = Math.hypot(to.x - from.x, to.z - from.z);
  if (!Number.isFinite(distance)) return Infinity;
  const steps = Math.max(1, Math.ceil(distance / .5)); let total = 0;
  for (let i = 0; i < steps; i++) {
    const t = (i + .5) / steps;
    total += waterAt(from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t) ? 2.3 : 1;
  }
  return distance * total / steps;
}
