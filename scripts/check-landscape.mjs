import assert from 'node:assert/strict';
import { WORLD_BOUNDS, CORE_BOUNDS, LEGACY_WORLD_BOUNDS, REGION_ORIGINS, TOWN_HEIGHTS, groundHeight, legacyRegionAt, migrateWorldPositionV2, TERRAIN_STEP, TERRAIN_MAX_STEP, EXPEDITIONS, EXPEDITION_ENEMY_OFFSETS, EXPEDITION_NODE_OFFSETS, surfaceAt, waterAt, movementCost } from '../src/landscape.ts';
import { ZONES } from '../src/content.ts';
import { WORLD_COLLIDERS, canTraverse, regionAt, toWorld } from '../src/realm.ts';
import { findPath } from '../src/navigation.ts';
const area = b => (b.maxX-b.minX)*(b.maxZ-b.minZ);
assert.equal(area(WORLD_BOUNDS)/area(CORE_BOUNDS),64);
let land=0,water=0, highest=0, elevated=0, mountains=0, valleys=0;
for(let x=WORLD_BOUNDS.minX+2;x<WORLD_BOUNDS.maxX;x+=TERRAIN_STEP)for(let z=WORLD_BOUNDS.minZ+2;z<WORLD_BOUNDS.maxZ;z+=TERRAIN_STEP){const s=surfaceAt(x,z);assert.equal(waterAt(x,z),s.water);assert.equal(regionAt(x,z),s.zone);s.water?water++:land++;assert.equal(groundHeight(x,z),s.height);if(!s.water){highest=Math.max(highest,s.height);if(s.height>8)elevated++;if(s.height>60)mountains++;if(s.height<10)valleys++;for(const[dx,dz]of[[4,0],[0,4]]){const n=surfaceAt(x+dx,z+dz);if(!n.water)assert(Math.abs(n.height-s.height)<=TERRAIN_MAX_STEP,'every adjacent land tile is an ordinary climbable terrace');}if(s.beach)assert.equal(s.height,0,'beaches meet the water without cliffs');}}
assert(land*TERRAIN_STEP**2>area(CORE_BOUNDS)*5,'new dry land alone exceeds five original worlds');
assert(water>land*.25,'seas and rivers are a substantial playable part of the world');
for(const zone of ZONES)for(const local of [zone.spawn,zone.npc,...zone.nodes,...zone.enemies]){const p=toWorld(zone.id,local);assert(!waterAt(p.x,p.z));assert.equal(regionAt(p.x,p.z),zone.id,'existing content coordinates and biomes are preserved');}
for(const region of EXPEDITIONS){
 for(const offset of [{x:0,z:0},...EXPEDITION_ENEMY_OFFSETS,...EXPEDITION_NODE_OFFSETS]){const p={x:region.x+offset.x,z:region.z+offset.z};assert(!waterAt(p.x,p.z));assert(canTraverse(p,p),'camps and actual gameplay spawns are dry and clear');}
 const path=findPath({x:0,z:8},region,WORLD_COLLIDERS);assert(path.length,`${region.id} can be reached from the original town`);let from={x:0,z:8};for(const p of path){assert(canTraverse(from,p));from=p;}assert(Math.hypot(from.x-region.x,from.z-region.z)<.01);
}
assert(highest>=70 && highest<=145 && elevated>20000 && mountains>500 && valleys>20000,'the actual playable landscape has mountains over70m and extensive low valleys');
assert.equal(area(WORLD_BOUNDS)/area(LEGACY_WORLD_BOUNDS),4,'the last playable world area is quadrupled');
for(const [zone,origin] of Object.entries(REGION_ORIGINS))for(let x=-46;x<48;x+=4)for(let z=-46;z<48;z+=4)assert.equal(groundHeight(origin.x+x,origin.z+z),TOWN_HEIGHTS[zone],'entire town footprint remains exactly level');
for(const[zone,old]of Object.entries({greenwood:{x:0,z:0},amberwild:{x:0,z:-96},frostmarch:{x:96,z:-96},hollow:{x:96,z:0}})){
 const saved={x:old.x+7,z:old.z-12,zone},migrated=migrateWorldPositionV2(saved);
 assert.deepEqual(migrated,{x:REGION_ORIGINS[zone].x+7,z:REGION_ORIGINS[zone].z-12,zone});assert.deepEqual(saved,{x:old.x+7,z:old.z-12,zone},'save migration never mutates its input');
}
for(const point of [{x:NaN,z:0,zone:'greenwood'},{x:Infinity,z:0,zone:'greenwood'},{x:-337,z:0,zone:'greenwood'},{x:0,z:0,zone:'hollow'}])assert.throws(()=>migrateWorldPositionV2(point),'invalid old coordinates or ownership are not legitimised');
assert.equal(legacyRegionAt(432,336),'hollow');
const brute=[...WORLD_COLLIDERS];let seed=748133;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(let i=0;i<700;i++){const a={x:WORLD_BOUNDS.minX+random()*(WORLD_BOUNDS.maxX-WORLD_BOUNDS.minX),z:WORLD_BOUNDS.minZ+random()*(WORLD_BOUNDS.maxX-WORLD_BOUNDS.minX)},b=i%3?{x:a.x+random()*12-6,z:a.z+random()*12-6}:{x:WORLD_BOUNDS.minX+random()*(WORLD_BOUNDS.maxX-WORLD_BOUNDS.minX),z:WORLD_BOUNDS.minZ+random()*(WORLD_BOUNDS.maxX-WORLD_BOUNDS.minX)};assert.equal(canTraverse(a,b),canTraverse(a,b,brute),'indexed collision matches the full swept test, including long diagonals');}
assert.equal(movementCost({x:0,z:0},{x:0,z:2}),2);
const wet={x:-710,z:-806};assert(waterAt(wet.x,wet.z));assert(Math.abs(movementCost(wet,{x:wet.x+2,z:wet.z})-4.6)<1e-9);
assert.equal(movementCost(wet,wet),0);assert.equal(movementCost(wet,{x:NaN,z:0}),Infinity);
console.log(`PASS: 64× original playable area, ${Math.round(land*16/area(CORE_BOUNDS)*10)/10}× dry land, ${water} water cells, preserved towns, 16 reachable camps, exact shore queries, weighted movement and indexed collision parity.`);
