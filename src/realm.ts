import { WILD_BIOMES, RESOURCE_SITES, RESOURCE_SITE_WALLS, WORLD_CURIOS } from './world-features.ts';
import { ALL_CITY_COLLIDERS, ALL_CITY_GARDEN_COLLIDERS, insideAnyCity, insideAirshipApproach } from './city.ts';
import { COLOSSEUM, COLOSSEUM_COLLIDERS, inColosseumClearing } from './colosseum.ts';
import { TRAINING_GROUND_COLLIDERS } from './training-grounds-data.ts';
import { TRAINING_DUMMIES } from './training-dummies.ts';
import { GOLD_CARAVAN_COLLIDERS } from './gold-merchant.ts';
import { POLL_BOOTH_COLLIDERS } from './poll-booths.ts';
import { ZONES, type ZoneId, type EnemyKind } from './content.ts';
import { WORLD_BOSSES } from './bestiary.ts';
import { TRAINER_NPCS } from './training.ts';
import { DUNGEONS, ROOTVAULT_GUARDIAN } from './dungeon.ts';
import { DUNGEON_TEMPLE_WALLS, DUNGEON_TEMPLE_PILLARS, DUNGEON_TEMPLE_BOUNDS } from './dungeon-approach-layout.ts';
import { WORLD_BOUNDS, REGION_ORIGINS, TERRAIN_STEP, EXPEDITIONS, EXPEDITION_ENEMY_OFFSETS, EXPEDITION_NODE_OFFSETS, surfaceAt, inCore } from './landscape.ts';
export { WORLD_BOUNDS, REGION_ORIGINS } from './landscape.ts';
import { VILLAGES, VILLAGE_PROPS, VILLAGE_NPCS, VILLAGE_COLLIDERS, VILLAGE_SAFE_RADIUS, WILDERNESS_SPAWNS, townSpawnAllowed } from './settlements.ts';
export { VILLAGE_COLLIDERS } from './settlements.ts';
import { BUILDINGS, BUILDING_COLLIDERS, CIVIC_FURNITURE_COLLIDERS, buildingPoint, BUILDING_RAMP_LENGTH } from './buildings.ts';

export interface RealmPoint { x: number; z: number }
export interface RealmBounds { minX: number; maxX: number; minZ: number; maxZ: number }
export interface RealmCollider extends RealmPoint { r: number; halfWidth?: number; halfDepth?: number }
export const PLAYER_RADIUS = .4;
export { DUNGEON_BOUNDS, DUNGEON_WALLS, DUNGEON_COLLIDERS, DUNGEON_LANTERNS, type DungeonWall } from './dungeon.ts';
export const REGIONAL_LANTERNS = [[-2.5, 5.5], [2.5, -5.5], [-2.5, 41], [2.5, -41], [-41, 2.5], [41, -2.5]] as const;
export function toWorld<T extends RealmPoint>(zone: ZoneId, point: T): T {
  const origin = REGION_ORIGINS[zone]; return { ...point, x: point.x + origin.x, z: point.z + origin.z };
}
export function toLocal<T extends RealmPoint>(zone: ZoneId, point: T): T {
  const origin = REGION_ORIGINS[zone]; return { ...point, x: point.x - origin.x, z: point.z - origin.z };
}
export function regionAt(x: number, z: number): ZoneId | undefined {
  if (!Number.isFinite(x) || !Number.isFinite(z) || x < WORLD_BOUNDS.minX || x > WORLD_BOUNDS.maxX || z < WORLD_BOUNDS.minZ || z > WORLD_BOUNDS.maxZ) return;
  return surfaceAt(x, z).zone;
}

export interface RealmSolid extends RealmCollider {
  kind: 'house' | 'tree' | 'rock' | 'pillar' | 'board' | 'workshop';
  zone: ZoneId; height: number; scale: number;
  treeModel?: 'ElderOak' | 'GiantPine' | 'frontier-sunveil-palm' | 'frontier-mistwood-broadleaf';
}
export const DUNGEON_APPROACH_WALLS = DUNGEONS.flatMap(({id:dungeonId,entrance:{zone,x,z}})=>
  [...DUNGEON_TEMPLE_WALLS,...DUNGEON_TEMPLE_PILLARS].map(wall=>({dungeonId,zone,x:x+wall.x,z:z+wall.z,r:Math.hypot(wall.width/2,wall.depth/2),halfWidth:wall.width/2,halfDepth:wall.depth/2,height:wall.height})));
export const DUNGEON_APPROACH_COLLIDERS: RealmCollider[] = [
  ...DUNGEON_APPROACH_WALLS,
  ...DUNGEONS.flatMap(({entrance:{x,z},summonStone})=>[
    ...[-1,1].map(side=>({x:x+side*4.425,z:z+.535,r:Math.hypot(1.425,1.565),halfWidth:1.425,halfDepth:1.565})),
    {...summonStone,r:1.2},
  ]),
];
const inDungeonApproach=(x:number,z:number)=>DUNGEONS.some(({entrance})=>x>entrance.x+DUNGEON_TEMPLE_BOUNDS.minX-5&&x<entrance.x+DUNGEON_TEMPLE_BOUNDS.maxX+5&&z>entrance.z+DUNGEON_TEMPLE_BOUNDS.minZ-5&&z<entrance.z+DUNGEON_TEMPLE_BOUNDS.maxZ+5);
const solids: RealmSolid[] = [];
function addSolid(zone: ZoneId, kind: RealmSolid['kind'], x: number, z: number, r: number, height: number, scale = 1, halfWidth?: number, halfDepth?: number,treeModel?:RealmSolid['treeModel']) {
  solids.push({ ...toWorld(zone, { x, z }), kind, zone, r, height, scale, ...(halfWidth === undefined ? {} : { halfWidth, halfDepth }),...(treeModel?{treeModel}:{}) });
}
const frontierTree=(zone:ZoneId,t:number)=>{
  const scale=zone==='sunveil'?.8+t*.4:.9+t*.5;
  return {scale,r:(zone==='sunveil'?.8:2.4)*scale,height:(zone==='sunveil'?12.04:17.01)*scale,treeModel:zone==='sunveil'?'frontier-sunveil-palm' as const:'frontier-mistwood-broadleaf' as const};
};
const frontierDoors=BUILDINGS.filter(b=>b.zone==='sunveil'||b.zone==='mistwood').map(b=>buildingPoint(b,0,b.depth/2+BUILDING_RAMP_LENGTH));
const frontierPeople=[...VILLAGE_NPCS,...TRAINER_NPCS,...ZONES.map(zone=>({...toWorld(zone.id,zone.npc),zone:zone.id,rotation:0}))]
  .filter(npc=>npc.zone==='sunveil'||npc.zone==='mistwood').flatMap(npc=>[npc,{x:npc.x+Math.sin(npc.rotation)*1.5,z:npc.z+Math.cos(npc.rotation)*1.5}]);
const blocksDoor=(point:RealmPoint,r:number)=>frontierDoors.some(door=>Math.hypot(point.x-door.x,point.z-door.z)<r+2)
  ||frontierPeople.some(npc=>Math.hypot(point.x-npc.x,point.z-npc.z)<r+1.5);
// This deterministic layout is shared with the server. Rendering does not decide collision.
for (const zone of ZONES) {
  addSolid(zone.id, 'board', 3, 2, .90, 2.2, 1, .85, .26);
  addSolid(zone.id, 'workshop', -4, 3, Math.hypot(2.2, 1.6), 3.6, 1, 2.2, 1.6);
  for (const building of BUILDINGS.filter(building=>building.zone===zone.id && ['cottage','inn'].includes(building.kind))) {
    const { x,z,width,depth } = building, turned=Math.abs(Math.sin(building.rotation))>.5;
    solids.push({x,z,kind:'house',zone:zone.id,r:Math.hypot(width,depth)/2,height:building.kind==='inn'?8.2:6.5,scale:1,halfWidth:(turned?depth:width)/2,halfDepth:(turned?width:depth)/2});
  }
  let seed = { greenwood: 81224, amberwild: 716381, frostmarch: 987273, hollow: 461982, sunveil: 618311, mistwood: 297461 }[zone.id];
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const reserved = [zone.npc, zone.spawn, ...zone.nodes, ...zone.enemies, ...zone.gateways, ...(zone.beacon ? [zone.beacon] : []), { x: 3, z: 2 }, { x: -4, z: 3 }, { x: 0, z: -24 }];
  let trees = 0;
  for (let i = 0; i < 430 && trees < 68; i++) {
    const x = random() * 86 - 43, z = random() * 86 - 43, scale = .76 + random() * .50;
    const worldPoint=toWorld(zone.id,{x,z});
    if (insideAnyCity(worldPoint.x,worldPoint.z)||insideAirshipApproach(worldPoint.x,worldPoint.z)) continue;
    // Every biome has a four-unit road to each neighboring midpoint and a clear NPC square.
    if (Math.abs(x) < 4.2 || Math.abs(z) < 4.2 || Math.hypot(x, z) < 7 || reserved.some(p => Math.hypot(p.x - x, p.z - z) < 3.3)) continue;
    const point = toWorld(zone.id, { x, z });
    if(inDungeonApproach(point.x,point.z))continue;
    if(VILLAGE_COLLIDERS.some(prop=>Math.abs(point.x-prop.x)<prop.halfWidth+3.5&&Math.abs(point.z-prop.z)<prop.halfDepth+3.5))continue;
    if (solids.some(s => s.zone === zone.id && Math.hypot(s.x - point.x, s.z - point.z) < s.r + 2.8)) continue;
    const rock = trees % 8 === 7;
    if(zone.id==='sunveil'||zone.id==='mistwood'){
      const tree=frontierTree(zone.id,(scale-.76)/.5),r=rock?.9*scale:tree.r;
      if(blocksDoor(point,r)||solids.some(s=>Math.hypot(s.x-point.x,s.z-point.z)<s.r+r+1))continue;
      addSolid(zone.id,rock?'rock':'tree',x,z,r,rock?scale:tree.height,rock?scale:tree.scale,undefined,undefined,rock?undefined:tree.treeModel);trees++;continue;
    }
    addSolid(zone.id, rock ? 'rock' : 'tree', x, z, (rock ? .9 : .59) * scale, (rock ? 1.0 : 5.8) * scale, scale);
    trees++;
  }
}
// Outer camps and wilderness share the same collision and rendered coordinates.
for (const region of EXPEDITIONS) {
  const reserved = [...EXPEDITION_ENEMY_OFFSETS, ...EXPEDITION_NODE_OFFSETS, { x: 0, z: 0 }];
  for (const dx of [-5, 5]) solids.push({ x: region.x + dx, z: region.z, r: .9, kind: 'pillar', zone: region.zone, height: 4.2, scale: 1, halfWidth: .65, halfDepth: .65 });
  let seed = (region.x * 7919 + region.z * 104729) >>> 0;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0, placed = 0; i < 1200 && placed < 100; i++) {
    const x = Math.floor((region.x + (random() * 2 - 1) * region.radius) / TERRAIN_STEP) * TERRAIN_STEP + TERRAIN_STEP / 2;
    const z = Math.floor((region.z + (random() * 2 - 1) * region.radius) / TERRAIN_STEP) * TERRAIN_STEP + TERRAIN_STEP / 2;
    const surface = surfaceAt(x, z);
    if(inDungeonApproach(x,z))continue;
    if (inColosseumClearing(x,z) || inCore(x, z) || insideAirshipApproach(x,z) || surface.water || surface.beach || surface.regionId !== region.id || x < WORLD_BOUNDS.minX + 4 || x > WORLD_BOUNDS.maxX - 4 || z < WORLD_BOUNDS.minZ + 4 || z > WORLD_BOUNDS.maxZ - 4) continue;
    if (Math.abs(x - region.x) < 4 || Math.abs(z - region.z) < 4 || reserved.some(point => Math.hypot(x - region.x - point.x, z - region.z - point.z) < 4)) continue;
    if (VILLAGES.some(village => Math.hypot(x-village.x,z-village.z) < VILLAGE_SAFE_RADIUS + 3) || WILDERNESS_SPAWNS.some(spawn => Math.hypot(x-spawn.x,z-spawn.z) < 3.5)) continue;
    if (solids.some(solid => Math.hypot(x - solid.x, z - solid.z) < solid.r + 3)) continue;
    const rock = placed % 7 === 0, giant = !rock && placed % 3 === 0;
    const scale = rock ? .85 + random() * .8 : giant ? .8 + random() * .4 : 1.65 + random() * .75;
    if(surface.zone==='sunveil'||surface.zone==='mistwood'){
      const tree=frontierTree(surface.zone,random()),r=rock?.9*scale:tree.r;
      if(blocksDoor({x,z},r)||solids.some(s=>Math.hypot(s.x-x,s.z-z)<s.r+r+1)||WILDERNESS_SPAWNS.some(spawn=>Math.hypot(x-spawn.x,z-spawn.z)<r+2.5))continue;
      solids.push({x,z,zone:surface.zone,kind:rock?'rock':'tree',r,height:rock?scale:tree.height,scale:rock?scale:tree.scale,...(rock?{}:{treeModel:tree.treeModel})});placed++;continue;
    }
    const treeModel = surface.zone === 'frostmarch' || placed % 4 === 0 ? 'GiantPine' : 'ElderOak';
    solids.push({ x, z, zone: surface.zone, kind: rock ? 'rock' : 'tree', r: (rock ? .9 : giant ? 1.5 : .59) * scale, height: (rock ? 1 : giant ? treeModel === 'ElderOak' ? 24 : 29.7 : 5.8) * scale, scale, ...(giant ? { treeModel } : {}) }); placed++;
  }
}
// Woodland frames the stone bowl while leaving its four approaches open.
for (let i = 0; i < 12; i++) {
  const angle = (i + .5) * Math.PI / 6, x = Math.round((COLOSSEUM.x + Math.sin(angle) * 78 - 2) / 4) * 4 + 2, z = Math.round((COLOSSEUM.z + Math.cos(angle) * 78 - 2) / 4) * 4 + 2;
  if (surfaceAt(x,z).water || solids.some(s=>Math.hypot(s.x-x,s.z-z)<s.r+4)) continue;
  solids.push({x,z,zone:COLOSSEUM.zone,kind:'tree',treeModel:'ElderOak',scale:.8,r:1.2,height:19.2});
}
// These local biomes override camp region IDs, so camp woodland cannot populate them.
// Seed their defining canopies explicitly, using the same solids for server collision and rendering.
for(const biome of WILD_BIOMES)for(let ring=0;ring<4;ring++)for(let i=0;i<12;i++) {
  const angle=(i+.35*ring)*Math.PI/6,radius=[13,29,47,68][ring];
  const x=biome.x+Math.cos(angle)*radius,z=biome.z+Math.sin(angle)*radius,scale=1.3+(i%4)*.18;
  if(surfaceAt(x,z).water||solids.some(s=>Math.hypot(s.x-x,s.z-z)<s.r+3)||EXPEDITIONS.some(camp=>Math.hypot(x-camp.x,z-camp.z)<9))continue;
  solids.push({x,z,zone:biome.zone,kind:'tree',r:.75*scale,height:(biome.id==='slimefen'?4.64:5.95)*scale,scale});
}
export const WORLD_SCENERY: readonly RealmSolid[] = solids.filter(solid => !RESOURCE_SITES.some(site => Math.hypot(solid.x-site.x,solid.z-site.z)<24+solid.r) && !WORLD_CURIOS.some(site => Math.hypot(solid.x-site.x,solid.z-site.z)<5+solid.r) && !WORLD_BOSSES.some(boss => Math.hypot(solid.x-boss.x,solid.z-boss.z) < boss.arenaRadius+solid.r+1));
export const WORLD_COLLIDERS: RealmCollider[] = [
  ...POLL_BOOTH_COLLIDERS,
  ...GOLD_CARAVAN_COLLIDERS,
  ...RESOURCE_SITE_WALLS,
  ...DUNGEON_APPROACH_COLLIDERS,
  ...VILLAGE_COLLIDERS.filter((_, index) => !['cottage','inn'].includes(VILLAGE_PROPS[index].kind)),
  ...BUILDING_COLLIDERS, ...ALL_CITY_COLLIDERS, ...ALL_CITY_GARDEN_COLLIDERS, ...CIVIC_FURNITURE_COLLIDERS, ...TRAINING_GROUND_COLLIDERS, ...COLOSSEUM_COLLIDERS,
  ...WORLD_SCENERY.filter(solid=>solid.kind!=='house').map(({ x, z, r, halfWidth, halfDepth }) => ({ x, z, r, ...(halfWidth === undefined ? {} : { halfWidth, halfDepth }) })),
  ...ZONES.flatMap(zone => zone.beacon ? [-1, 1].map(side => toWorld(zone.id, { x: zone.beacon!.x + side, z: zone.beacon!.z, r: .20 })) : []),
];

const collisionCells = new Map<string, RealmCollider[]>();
for (const collider of WORLD_COLLIDERS) {
  const w = (collider.halfWidth ?? collider.r) + PLAYER_RADIUS, d = (collider.halfDepth ?? collider.r) + PLAYER_RADIUS;
  for (let x = Math.floor((collider.x - w) / 16); x <= Math.floor((collider.x + w) / 16); x++) for (let z = Math.floor((collider.z - d) / 16); z <= Math.floor((collider.z + d) / 16); z++) {
    const key = `${x},${z}`, cell = collisionCells.get(key); if (cell) cell.push(collider); else collisionCells.set(key, [collider]);
  }
}
function nearbySolids(from: RealmPoint, to: RealmPoint): Iterable<RealmCollider> {
  const found = new Set<RealmCollider>();
  for (let x = Math.floor(Math.min(from.x, to.x) / 16); x <= Math.floor(Math.max(from.x, to.x) / 16); x++) for (let z = Math.floor(Math.min(from.z, to.z) / 16); z <= Math.floor(Math.max(from.z, to.z) / 16); z++)
    for (const collider of collisionCells.get(`${x},${z}`) || []) found.add(collider);
  return found;
}

/** Swept player-circle collision: no skipped samples, so even long moves cannot tunnel. */
export function canTraverse(from: RealmPoint, to: RealmPoint, colliders: readonly RealmCollider[] = WORLD_COLLIDERS, bounds: RealmBounds = WORLD_BOUNDS, radius = PLAYER_RADIUS): boolean {
  if (![from.x, from.z, to.x, to.z, radius].every(Number.isFinite) || radius < 0) return false;
  for (const p of [from, to]) if (p.x < bounds.minX + radius || p.x > bounds.maxX - radius || p.z < bounds.minZ + radius || p.z > bounds.maxZ - radius) return false;
  const dx = to.x - from.x, dz = to.z - from.z, lengthSquared = dx * dx + dz * dz;
  for (const collider of colliders === WORLD_COLLIDERS && radius === PLAYER_RADIUS ? nearbySolids(from, to) : colliders) {
    if (collider.halfWidth !== undefined && collider.halfDepth !== undefined) {
      // Expanded slabs conservatively include the rounded corners of a swept circle.
      const minX = collider.x - collider.halfWidth - radius, maxX = collider.x + collider.halfWidth + radius;
      const minZ = collider.z - collider.halfDepth - radius, maxZ = collider.z + collider.halfDepth + radius;
      let enter = 0, leave = 1;
      for (const [start, delta, min, max] of [[from.x, dx, minX, maxX], [from.z, dz, minZ, maxZ]]) {
        if (Math.abs(delta) < 1e-12) { if (start < min || start > max) { enter = 2; break; } }
        else { const a = (min - start) / delta, b = (max - start) / delta; enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b)); }
      }
      if (enter <= leave) return false;
    } else {
      const projection = lengthSquared ? Math.max(0, Math.min(1, ((collider.x - from.x) * dx + (collider.z - from.z) * dz) / lengthSquared)) : 0;
      const x = from.x + dx * projection - collider.x, z = from.z + dz * projection - collider.z;
      if (x * x + z * z < (collider.r + radius) ** 2 - 1e-10) return false;
    }
  }
  return true;
}

export interface OverworldSpawn extends RealmPoint { id:string; kind:EnemyKind; zone:ZoneId; roaming?:boolean; worldBoss?:boolean }
/** One authority for every open-world home, including story monsters and world bosses. */
export function overworldSpawnAllowed(point:RealmPoint & Partial<Pick<OverworldSpawn,'id'|'kind'|'zone'>>,zone?:ZoneId) {
  const surface=surfaceAt(point.x,point.z);
  // The curated temple guardian belongs at its landmark; wandering monsters retain the town buffer.
  const templeGuardian=point.id===ROOTVAULT_GUARDIAN.id&&point.kind===ROOTVAULT_GUARDIAN.kind&&point.zone===ROOTVAULT_GUARDIAN.zone&&point.x===ROOTVAULT_GUARDIAN.x&&point.z===ROOTVAULT_GUARDIAN.z;
  const trainingDummy=TRAINING_DUMMIES.some(dummy=>dummy.id===point.id&&dummy.kind===point.kind&&dummy.zone===point.zone&&dummy.x===point.x&&dummy.z===point.z);
  return !inColosseumClearing(point.x,point.z)&&(templeGuardian||trainingDummy||townSpawnAllowed(point))&&!surface.water&&!surface.beach&&(!zone||surface.zone===zone)
    && [[0,0],[-2,0],[2,0],[0,-2],[0,2]].every(([x,z])=>{
      const adjacent={x:point.x+x,z:point.z+z};return !surfaceAt(adjacent.x,adjacent.z).water&&canTraverse(point,adjacent);
    });
}
export function relocateOverworldSpawn<T extends OverworldSpawn>(spawn:T,occupied:readonly RealmPoint[]=[]):T {
  const allowed=(point:RealmPoint)=>overworldSpawnAllowed(point,spawn.zone)&&occupied.every(other=>Math.hypot(point.x-other.x,point.z-other.z)>=5)
    && (spawn.worldBoss||WORLD_BOSSES.every(boss=>Math.hypot(point.x-boss.x,point.z-boss.z)>boss.arenaRadius+5));
  if(allowed(spawn))return {...spawn};
  // Start with cardinal approaches; the sweep is deterministic and never drops a protected quest ID.
  for(let radius=4;radius<=1024;radius+=4)for(let direction=0;direction<32;direction++){
    const angle=direction*Math.PI/16,point={x:Math.round((spawn.x+Math.sin(angle)*radius)/2)*2,z:Math.round((spawn.z+Math.cos(angle)*radius)/2)*2};
    if(allowed(point))return {...spawn,...point};
  }
  throw new Error(`No accessible town-safe spawn for ${spawn.id}`);
}
export function createOverworldSpawns():OverworldSpawn[] {
  const result:OverworldSpawn[]=[];
  for(const spawn of [
    ...ZONES.flatMap(zone=>zone.enemies.map(enemy=>({...toWorld(zone.id,enemy),zone:zone.id}))),
    ...WILD_BIOMES.flatMap(biome => Array.from({length: 8}, (_, i) => ({ id: `${biome.id}-guardian-${i}`, kind: biome.enemy, zone: biome.zone, x: biome.x + Math.cos(i*Math.PI/4)*45, z: biome.z + Math.sin(i*Math.PI/4)*45 }))),
    ...WILDERNESS_SPAWNS.map(enemy=>({...enemy,roaming:true})),...WORLD_BOSSES.map(boss=>({...boss,worldBoss:true})),ROOTVAULT_GUARDIAN,
  ])result.push(relocateOverworldSpawn(spawn,result));
  return [...result, ...TRAINING_DUMMIES];
}
export const OVERWORLD_SPAWNS:readonly OverworldSpawn[]=createOverworldSpawns();
