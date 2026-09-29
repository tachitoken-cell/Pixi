import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STORY_OBJECTS, STORY_ENEMIES } from '../src/story-world-data.ts';
import { STORY_QUESTS, storyQuestProgress } from '../src/story-quests.ts';
import { OVERWORLD_SPAWNS, WORLD_COLLIDERS, canTraverse, overworldSpawnAllowed } from '../src/realm.ts';
import { surfaceAt, groundHeight } from '../src/landscape.ts';
import { MONSTERS, monsterSpawnLevel } from '../src/bestiary.ts';
import { regionLevelRange } from '../src/region-levels.ts';
import { WORLD_GATHERING_NODES } from '../src/gathering-nodes.ts';
const mobs = [...OVERWORLD_SPAWNS, ...STORY_ENEMIES].map(enemy => ({ ...enemy,
  level: enemy.level ?? monsterSpawnLevel(enemy, surfaceAt(enemy.x, enemy.z).regionId) }));
const radius = enemy => Math.max(28, MONSTERS[enemy.kind].aggroRange + (enemy.roaming ? 7 : 0) + 10);
const hazards = level => mobs.filter(enemy => enemy.kind !== 'training-dummy' && (enemy.level > level + 2 || enemy.worldBoss));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function safePoint(point, level) {
  const surface = surfaceAt(point.x, point.z);
  assert(!surface.water && surface.zone === point.zone && canTraverse(point, point), `${point.id}: reachable dry ground`);
  assert(regionLevelRange(surface.regionId, surface.zone).min <= level + 1, `${point.id}: region must suit the required quest level`);
  for (const enemy of hazards(level)) assert(distance(point, enemy) >= radius(enemy), `${point.id}: level${level} objective overlaps ${enemy.id} level${enemy.level} patrol`);
}
function drySegment(a, b, colliders = WORLD_COLLIDERS) {
  assert(canTraverse(a, b, colliders), 'walkable swept segment');
  const steps = Math.max(1, Math.ceil(distance(a, b))), points = Array.from({length: steps + 1}, (_, i) => ({x:a.x+(b.x-a.x)*i/steps,z:a.z+(b.z-a.z)*i/steps}));
  for (let i = 0; i < points.length; i++) {
    const point=points[i]; assert(!surfaceAt(point.x,point.z).water, 'approach stays dry');
    if(i)assert(Math.abs(groundHeight(point.x,point.z)-groundHeight(points[i-1].x,points[i-1].z))<=1.5,'approach stays climbable');
  }
}
for (const object of STORY_OBJECTS) {
  const level = STORY_QUESTS.find(quest => quest.id === object.questId).requiredLevel;
  safePoint(object, level);
  for(const step of object.id === 'story-abandoned-pack' ? [2,6] : [2]) for(const [dx,dz] of [[step,0],[-step,0],[0,step],[0,-step]]) drySegment(object,{x:object.x+dx,z:object.z+dz});
}
for (const enemy of STORY_ENEMIES) {
  safePoint(enemy, enemy.level); assert(overworldSpawnAllowed(enemy,enemy.zone), `${enemy.id}: ordinary town-safe spawn`);
  for(const [dx,dz] of [[2,0],[-2,0],[0,2],[0,-2]])drySegment(enemy,{x:enemy.x+dx,z:enemy.z+dz});
}
// These assertions intentionally fail for the former Level4 pack beside a Level25 roaming wolf.
const oldPack={id:'former-pack',zone:'greenwood',x:-1007,z:182};
assert(regionLevelRange(surfaceAt(oldPack.x,oldPack.z).regionId,'greenwood').min>4+1);
assert(hazards(4).some(enemy=>distance(oldPack,enemy)<radius(enemy)));
const pack=STORY_OBJECTS.find(object=>object.id==='story-abandoned-pack');
assert(distance(pack,{x:-26,z:100})<40,'early camp is near the existing Willowbrook refuge');
// The source Fen Garden is adapted to a real starter node, not the Level24–32 Slimefen site.
const garden=STORY_QUESTS.find(quest=>quest.id==='story-the-fen-garden'),objective=garden.objectives[0];
assert.equal(garden.requiredLevel,5);assert.equal(objective.count,4);assert.equal(objective.regionId,'greenwood');assert.equal(objective.siteId,undefined);
const nodes=WORLD_GATHERING_NODES.filter(node=>objective.targets.includes(node.kind)&&node.zone===objective.zone&&surfaceAt(node.x,node.z).regionId===objective.regionId);
assert(nodes.length>0);for(const node of nodes)safePoint(node,5);
const progress={active:{[garden.id]:[0]},completed:[]};
assert(!storyQuestProgress(progress,{kind:'gather',target:'herb',scope:'overworld',zone:'greenwood',regionId:'slimefen',siteId:'slimefen-garden'}),'dangerous named garden does not satisfy the starter lesson');
assert(storyQuestProgress(progress,{kind:'gather',target:'herb',scope:'overworld',zone:'greenwood',regionId:'greenwood',amount:4}));
const supper=STORY_QUESTS.find(quest=>quest.id==='story-glacial-supper'),fishObjective=supper.objectives[0];
assert.equal(supper.requiredLevel,14);assert.equal(fishObjective.count,4);
assert.deepEqual(fishObjective.spawnIds,['fishing-frostmarch-11']);
const fishNode=WORLD_GATHERING_NODES.find(node=>node.id===fishObjective.spawnIds[0]);assert(fishNode);
assert(!surfaceAt(fishNode.x,fishNode.z).water && canTraverse(fishNode,fishNode),'fishing interaction point remains on the actual dry shore');
for(const enemy of hazards(14))assert(distance(fishNode,enemy)>=radius(enemy),'Opal fishing shore avoids higher-level patrols');
const fishProgress={active:{[supper.id]:[0]},completed:[]},fishEvent={kind:'gather',target:fishNode.kind,scope:'overworld',zone:'frostmarch',regionId:'opal-isles',amount:4};
assert(!storyQuestProgress(fishProgress,{...fishEvent,spawnId:'fishing-frostmarch-7'}),'wrong/dangerous fishing node cannot grant quest progress');
assert(storyQuestProgress(fishProgress,{...fishEvent,spawnId:fishNode.id}),'only the real sheltered node grants fishing credit');
assert(supper.dialogue.intro.some(line=>line.includes('Fishing level 25')),'existing profession requirement is disclosed');
const boars=STORY_QUESTS.find(quest=>quest.id==='story-boars-of-bracken-crown');assert.equal(boars.objectives[0].count,10);
assert.deepEqual(boars.objectives[0].spawnIds,['story-bracken-boar-1','story-bracken-boar-2']);
for(const id of boars.objectives[0].spawnIds){const spawn=STORY_ENEMIES.find(enemy=>enemy.id===id);assert(spawn?.kind==='briar-boar'&&spawn.level===8);safePoint(spawn,8);}
for(const route of JSON.parse(readFileSync(new URL('../docs/qa/2026-09-28-story-placement-routes.json',import.meta.url)))) {
  const object=STORY_OBJECTS.find(object=>object.id===route.id);assert(object,'route identifies a real current quest object');
  assert.deepEqual(route.path.at(-1),{x:object.x,z:object.z},'stored approach ends at the actual target');
  const colliders=[...WORLD_COLLIDERS,...hazards(route.level).map(enemy=>({...enemy,r:radius(enemy)}))];
  for(let i=1;i<route.path.length;i++)drySegment(route.path[i-1],route.path[i],colliders);
}
console.log(`PASS: all ${STORY_OBJECTS.length} quest objects and ${STORY_ENEMIES.length} new homes fit quest levels, avoid strong roaming/aggro envelopes and have dry cardinal approaches; starter camp footprint, safe garden credit and 13 settlement routes.`);
