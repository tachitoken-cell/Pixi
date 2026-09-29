import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { DUNGEONS, STORY_DUNGEONS, LEGACY_DUNGEONS, DUNGEON_START, DUNGEON_EXIT, dungeonBounds, dungeonCheckpoint, dungeonLayout, dungeonStages, dungeonReturn, dungeonRoomPortalOpen, dungeonThemeId } from '../src/dungeon.ts';
import { DUNGEON_TEMPLE_BOUNDS as temple, DUNGEON_TEMPLE_ROUTES } from '../src/dungeon-approach-layout.ts';
import { dungeonSpikeTraps, dungeonSpikeContains } from '../src/dungeon-traps.ts';
import { dungeonHazardPattern } from '../src/dungeon-mechanics.ts';
import { canTraverse, WORLD_COLLIDERS, WORLD_BOUNDS, OVERWORLD_SPAWNS } from '../src/realm.ts';
import { surfaceAt } from '../src/landscape.ts';
import { BUILDINGS } from '../src/buildings.ts';
import { findPath } from '../src/navigation.ts';
import { MONSTERS, WORLD_BOSSES, monsterSpawnLevel } from '../src/bestiary.ts';
import { STORY_ENEMIES } from '../src/story-world-data.ts';
import { VILLAGES } from '../src/settlements.ts';
import { regionLevelRange } from '../src/region-levels.ts';

const expected = {
  'greenwood-root-chamber': [7, 5, 'story-the-sealed-root'], 'broken-watch': [10, 6, 'story-the-broken-watch'],
  'ashbound-hall': [14, 7, 'story-ashbound-hall'], 'frozen-memory': [18, 8, 'story-memory-beneath-ice'],
  'hollow-door': [24, 8, 'story-the-hollow-door'], 'veiled-sun-temple': [44, 10, 'story-temple-of-the-veiled-sun'],
};
// Verified walkable corridors from existing safe settlements. Unlike a dry footprint,
// these also catch high-level enemy homes and unsafe regions along the approach.
const approachRoutes = {
  'greenwood-root-chamber': ['village-pinewake', [[-25.5,100.5],[-52.5,102],[-156,105],[-168,115.5],[-196.5,103.5]]],
  'broken-watch': ['village-redleaf', [[-520.5,-340.5],[-526.5,-337.5],[-544.5,-337.5],[-598.5,-400.5],[-622.5,-417],[-627,-417]]],
  'ashbound-hall': ['village-cindergrove', [[60,-229.5],[70.5,-228],[241.5,-229.5],[306,-178.5],[402,-175.5],[403.5,-174],[403.5,-168],[405,-166.5],[411,-165],[417,-166.5]]],
  'frozen-memory': ['village-stormcrag', [[79.5,-589.5],[87,-595.5],[94.5,-600],[153,-606],[256.5,-646.5]]],
  'hollow-door': ['village-shadewood', [[600,319.5],[633,364.5],[634.5,373.5],[640.5,375],[646.5,373.5]]],
  'veiled-sun-temple': ['town-sunveil', [[-1039.5,-919.5],[-1042.5,-1002],[-1161,-1161],[-1164,-1227],[-1173,-1237.5],[-1180.5,-1252.5],[-1185,-1257],[-1192.5,-1276.5],[-1195.5,-1284],[-1195.5,-1288.5]]],
};
const overworldEnemies = [...OVERWORLD_SPAWNS,...STORY_ENEMIES].filter(enemy=>enemy.kind!=='training-dummy')
  .map(enemy=>({...enemy,level:enemy.level??monsterSpawnLevel(enemy,surfaceAt(enemy.x,enemy.z).regionId)}));
assert.equal(LEGACY_DUNGEONS.length, 7); assert.equal(STORY_DUNGEONS.length, 6); assert.equal(DUNGEONS.length, 13);
const inside = (p,room) => Math.abs(p.x-room.x)<room.width/2 && Math.abs(p.z-room.z)<room.depth/2;
for (const definition of STORY_DUNGEONS) {
  const {id,entrance}=definition, [level,count,questId]=expected[id], layout=dungeonLayout(id), stages=dungeonStages(id), bounds=dungeonBounds(id), traps=dungeonSpikeTraps(id);
  assert.equal(definition.minLevel,level); assert.equal(definition.maxLevel,level); assert.equal(definition.storyQuestId,questId); assert.equal(definition.completionXp,0);
  assert.equal(stages.length,count); assert.equal(layout.rooms.length,count+1,'the preparation foyer is not a combat room');
  assert(stages.every(stage=>stage.level===level)); assert.equal(stages.at(-1).id,'throne');
  assert(existsSync(new URL(`../public/models/${dungeonThemeId(id)}-kit.glb`,import.meta.url)), `${id}: existing Mossvale kit`);
  assert.equal(surfaceAt(entrance.x,entrance.z).zone,entrance.zone);
  for(let x=temple.minX;x<=temple.maxX;x+=2)for(let z=temple.minZ;z<=temple.maxZ;z+=2)
    assert(!surfaceAt(entrance.x+x,entrance.z+z).water,`${id}: entire temple footprint is dry at ${x},${z}`);
  for(const building of BUILDINGS) {
    const c=Math.abs(Math.cos(building.rotation)),s=Math.abs(Math.sin(building.rotation)),hw=(c*building.width+s*building.depth)/2,hd=(s*building.width+c*building.depth)/2;
    assert(!(building.x+hw>entrance.x+temple.minX-3 && building.x-hw<entrance.x+temple.maxX+3 && building.z+hd>entrance.z+temple.minZ-3 && building.z-hd<entrance.z+temple.maxZ+3),`${id}: clear of ${building.id}`);
  }
  for(const other of DUNGEONS.filter(other=>other!==definition))
    assert(Math.abs(entrance.x-other.entrance.x)>temple.maxX-temple.minX+6 || Math.abs(entrance.z-other.entrance.z)>temple.maxZ-temple.minZ+6,`${id}: distinct entrance footprint`);
  for(const route of DUNGEON_TEMPLE_ROUTES) {
    const points=route.map(point=>({x:entrance.x+point.x,z:entrance.z+point.z}));
    for(let i=1;i<points.length;i++) assert(canTraverse(points[i-1],points[i]),`${id}: breached-wall approach`);
    const path=findPath(points[0],entrance,WORLD_COLLIDERS,WORLD_BOUNDS);assert(path.length&&Math.hypot(path.at(-1).x-entrance.x,path.at(-1).z-entrance.z)<.01);
  }
  const landing={x:definition.summonStone.x,z:definition.summonStone.z+2}; assert(canTraverse(landing,landing));
  assert(findPath(landing,entrance,WORLD_COLLIDERS,WORLD_BOUNDS).length,`${id}: safe summon landing reaches entrance`);
  // Ordinary encounters up to two levels higher remain normal wilderness risk.
  // Stronger homes get their full aggro range, seven-metre patrol envelope and
  // ten-metre approach margin; world-boss arenas are always excluded.
  const hazards=overworldEnemies.filter(enemy=>enemy.worldBoss||enemy.level>level+2).map(enemy=>({
    x:enemy.x,z:enemy.z,r:Math.max(28,MONSTERS[enemy.kind].aggroRange+(enemy.roaming?7:0)+10,
      enemy.worldBoss?(WORLD_BOSSES.find(boss=>boss.kind===enemy.kind)?.arenaRadius??0):0),
  }));
  const [villageId,waypoints]=approachRoutes[id], village=VILLAGES.find(village=>village.id===villageId);
  assert(village,`${id}: approach begins in an existing safe settlement`);
  const approach=[village,...waypoints.map(([x,z])=>({x,z})),entrance];
  for(let i=1;i<approach.length;i++){
    const from=approach[i-1],to=approach[i];
    assert(canTraverse(from,to),`${id}: settlement approach remains physically walkable`);
    assert(canTraverse(from,to,hazards,WORLD_BOUNDS),`${id}: settlement approach avoids overlevel patrols and world bosses`);
    const steps=Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/2);
    for(let step=0;step<=steps;step++){
      const t=steps?step/steps:0,surface=surfaceAt(from.x+(to.x-from.x)*t,from.z+(to.z-from.z)*t);
      assert(!surface.water,`${id}: settlement approach stays on dry ground`);
      assert(regionLevelRange(surface.regionId,surface.zone).min<=level+2,`${id}: settlement approach avoids higher-tier regions`);
    }
  }
  for(const point of [entrance,definition.summonStone,landing])
    assert(canTraverse(point,point,hazards,WORLD_BOUNDS),`${id}: entry and summon interaction avoid overlevel patrols`);
  assert(canTraverse(DUNGEON_START,DUNGEON_START,layout.colliders,bounds)); assert(canTraverse(DUNGEON_EXIT,DUNGEON_EXIT,layout.colliders,bounds));
  const allSeals=new Set(layout.objects.filter(object=>object.kind==='seal').map(object=>object.id)), allObjects=new Set(layout.objects.map(object=>object.id));
  const cleared=new Set(), activated=new Set();
  const reachable=()=>{const seen=new Set(['preparation']);for(const room of seen)for(const portal of layout.portals)if(portal.roomId===room&&dungeonRoomPortalOpen(portal,cleared,activated))seen.add(portal.targetRoomId);return seen;};
  assert.deepEqual([...reachable()],['preparation','threshold']);
  for(const stage of stages.filter(stage=>!stage.optional)) {
    assert(reachable().has(stage.id),`${id}/${stage.id}: reached in main-route order`); cleared.add(stage.id);
    for(const object of layout.objects.filter(object=>object.stageId===stage.id&&object.kind!=='checkpoint')) {
      assert((object.requires??[]).every(required=>activated.has(required)),`${id}/${object.id}: puzzle order has no cycle`); activated.add(object.id);
    }
  }
  assert(stages.filter(stage=>stage.optional).every(stage=>reachable().has(stage.id)),`${id}: optional treasury never blocks completion`);
  for(const stage of stages)cleared.add(stage.id);
  assert.equal(reachable().size,layout.rooms.length);
  for(const portal of layout.portals) {
    const room=layout.rooms.find(room=>room.id===portal.roomId), target=layout.rooms.find(room=>room.id===portal.targetRoomId);
    assert(inside(portal,room)&&inside(portal.destination,target));assert(dungeonRoomPortalOpen(portal,cleared,activated));
    const reverse=layout.portals.find(other=>other.roomId===portal.targetRoomId&&other.targetRoomId===portal.roomId);assert(reverse);
    assert(Math.abs(Math.hypot(reverse.x-portal.destination.x,reverse.z-portal.destination.z)-4)<.001);
    assert(!canTraverse(portal,portal.destination,layout.colliders,bounds),'sealed rooms cannot be crossed on foot');
    for(const seal of portal.seals??[]) {assert(allObjects.has(seal));const missing=new Set(activated);missing.delete(seal);assert(!dungeonRoomPortalOpen(portal,cleared,missing),`${id}: cannot skip ${seal}`);}
  }
  // Keep doors, interactions and all enemies reachable even if every spike remains raised.
  const solidTraps=traps.map(t=>({...t,r:Math.hypot(t.width,t.depth)/2,halfWidth:t.width/2,halfDepth:t.depth/2}));
  const colliders=[...layout.colliders,...solidTraps];
  for(const room of layout.rooms) {
    const points=[...stages.filter(stage=>stage.id===room.id).flatMap(stage=>stage.enemies),...layout.objects.filter(object=>object.stageId===room.id),...layout.portals.filter(portal=>portal.roomId===room.id),...layout.portals.filter(portal=>portal.targetRoomId===room.id).map(portal=>portal.destination),...[dungeonCheckpoint(id),dungeonReturn(id)].filter(p=>inside(p,room))];
    for(const point of points){assert(inside(point,room));const path=findPath(room,point,colliders,bounds);assert(path.length&&Math.hypot(path.at(-1).x-point.x,path.at(-1).z-point.z)<.01,`${id}/${room.id}: reaches ${point.id??point.kind??'anchor'}`);}
    for(const other of layout.rooms.filter(other=>other!==room)) assert(Math.abs(room.x-other.x)>(room.width+other.width)/2+8||Math.abs(room.z-other.z)>(room.depth+other.depth)/2+8);
  }
  for(const stage of stages) {
    if(stage.storyObjective){const objective=stage.storyObjective;assert.equal(objective.durationMs,30000);assert.equal(objective.waves.length,3);assert(objective.waves.every(wave=>wave.length===2));assert.equal(stage.enemies.length,0);if(objective.kind==='protection')assert.equal(objective.protectRadius,6);}
    const boss=stage.enemies.find(enemy=>enemy.boss);if(boss)assert(dungeonHazardPattern(id,{...boss,dungeonBoss:true},stage),'existing boss hazards remain active');
  }
  assert(id==='veiled-sun-temple'?traps.length>=2:traps.length===0,'only the authored temple has spike trials');
  for(const trap of traps)for(const object of layout.objects)assert(!dungeonSpikeContains(trap,object,object.r+2));
  console.log(`${id}: ${count} rooms, ${allSeals.size} required objects, ${layout.portals.length} portals, dry footprint, five clear entrance routes and level-appropriate approach from ${village.name}`);
}
assert.equal(dungeonLayout('greenwood-root-chamber').objects.filter(o=>o.kind==='seal').length,2);
assert.equal(dungeonLayout('broken-watch').objects.filter(o=>o.kind==='seal').length,3);
assert(dungeonLayout('ashbound-hall').portals.find(p=>p.targetRoomId==='throne'&&p.requires.length).seals.includes('ashbound-treasure'),'Ashbound treasure room cannot be skipped');
assert.equal(dungeonStages('veiled-sun-temple').filter(stage=>stage.optional).length,1);
assert.equal(dungeonStages('frozen-memory').flatMap(stage=>stage.enemies).find(enemy=>enemy.name==='Memory Warden')?.boss,true);
console.log('PASS: six source-count quest chambers, ordered gates, optional treasury, shared art/hazards, timed wave specifications and safe current-realm entrances.');
