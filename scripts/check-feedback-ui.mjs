import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { chooseTarget, isHostilePlayer, isHostileTarget } from '../src/targeting.ts';
import * as THREE from 'three';
import { createGroundWaypoint, advanceWaypointRoute, WAYPOINT_CHECKPOINT_RADIUS } from '../src/ground-waypoint.ts';
import { spellOutOfRange, damageOverTimeLabels } from '../src/combat-feedback.ts';
import { SPELLS } from '../src/spells.ts';

for (const spell of Object.values(SPELLS)) {
  assert(!spellOutOfRange(spell, null), `${spell.id}: no target is not a range failure`);
  assert(!spellOutOfRange(spell, {distance:spell.range,hostile:spell.targetRelation==='hostile'}));
  const needsTarget=spell.targeting!=='radial'&&spell.targetRelation!=='self';
  assert.equal(spellOutOfRange(spell,{distance:spell.range+.01,hostile:spell.targetRelation==='hostile'}),needsTarget,spell.id);
  assert(!spellOutOfRange(spell,{distance:1000,hostile:spell.targetRelation!=='hostile'}));
}
// Execute the actual app callback so hover and PvP fallback cannot diverge from the hotbar wiring.
const callback=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8').match(/rangeTarget:\(\)=>\{([\s\S]*?)\n \},/)[1];
const rangeContext={selectedId:null,hoveredId:null,position:{x:0,z:0},worldInstance:null,player:{id:'me',hp:100,pvp:true},players:[{id:'opponent',hp:100,pvp:true,x:20,z:0},{id:'ally',hp:100,pvp:false,x:25,z:0}],chooseTarget,isHostilePlayer,isHostileTarget};
const points=[{id:'near',kind:'enemy',x:4,z:0},{id:'far',kind:'enemy',x:30,z:0},{id:'npc',kind:'npc',x:2,z:0}];
rangeContext.targetPoints=()=>[...points,...rangeContext.players.map(p=>({...p,kind:'player'}))];
const currentRange=runInNewContext(`()=>{${callback}}`,rangeContext);
assert.equal(currentRange().distance,4,'nearest enemy fallback');
rangeContext.hoveredId='far';assert.equal(currentRange().distance,30,'hovered enemy takes priority over the nearest foe');
rangeContext.hoveredId='opponent';assert.equal(currentRange().distance,20,'hovered hostile player uses their own range');
rangeContext.selectedId='near';assert.equal(currentRange().distance,4,'explicit target takes priority over hover');
rangeContext.selectedId='ally';assert.equal(currentRange().distance,25);assert.equal(currentRange().hostile,false,'selected friendly target remains available for support range');
rangeContext.selectedId='npc';assert.equal(currentRange(),null,'NPC selection does not color hostile abilities using an unrelated foe');
rangeContext.selectedId=null;rangeContext.hoveredId=null;points.splice(0,2);assert.equal(currentRange().distance,20,'nearest hostile player is the fallback when no enemy is present');
rangeContext.players[0].hp=0;assert.equal(currentRange(),null,'dead PvP targets never become the fallback');
points.push({id:'near',kind:'enemy',x:4,z:0});rangeContext.selectedId='opponent';assert.equal(currentRange(),null,'a selected defeated player does not silently choose another foe');

const dots=[{ability:'poison-shot',sourceId:'me',expiresAt:4000},{ability:'viper-strike',sourceId:'other',expiresAt:8000},{ability:'fireball',sourceId:'me',expiresAt:1000}];
assert.equal(damageOverTimeLabels(dots,'me',1500),'Venom Arrow 3s');
assert.equal(damageOverTimeLabels(dots,'me',4000),'');
assert.equal(damageOverTimeLabels(undefined,'me',1500),'');

assert.equal(WAYPOINT_CHECKPOINT_RADIUS,5);
let route=[{x:4,z:0},{x:12,z:0}];
assert.deepEqual(advanceWaypointRoute(route,{x:0,z:0},()=>false),{x:4,z:0},'corners stay until the next segment is clear');
assert.deepEqual(advanceWaypointRoute(route,{x:0,z:0},()=>true),{x:12,z:0},'five-meter checkpoint advances early');
const checkpoint={x:0,z:0}, nextCheckpoint={x:20,z:0};
for(const [player,clear,expected] of [
  [{x:8,z:6},true,nextCheckpoint], // Missed the checkpoint, already progressing along its outgoing leg.
  [{x:-8,z:6},true,checkpoint],
  [{x:0,z:6},true,checkpoint],
  [{x:8,z:6},false,checkpoint],
]) assert.equal(advanceWaypointRoute([checkpoint,nextCheckpoint],player,()=>clear),expected,'passed checkpoints advance only toward a clear next leg');
route=[checkpoint,nextCheckpoint,{x:40,z:0}];
assert.equal(advanceWaypointRoute(route,{x:30,z:8},()=>true),route.at(-1),'one update catches up across several missed points');
assert.equal(route.length,1);
const finalPoint=route[0];
assert.equal(advanceWaypointRoute(route,{x:50,z:8},()=>true),finalPoint,'the final objective is never discarded');
assert.equal(route.length,1);
assert.equal(advanceWaypointRoute([],checkpoint,()=>true),undefined);
assert.deepEqual(advanceWaypointRoute([{x:10,z:10},{x:-10,z:-10}],{x:10,z:0},()=>true),{x:-10,z:-10},'progress works on diagonal legs heading west and south');
const scene=new THREE.Scene(), height=(x,z)=>x*.15+z*.1;
const guide=createGroundWaypoint(scene,height);
assert(!guide.group.visible);
for(const destination of [{x:18,z:0},{x:-18,z:0},{x:0,z:18},{x:0,z:-18}]){
  guide.update({...destination,height:3},undefined,{x:0,z:0},0);
  assert(guide.group.visible);
  for(const arrow of guide.group.children.slice(0,3)){
    assert(arrow.visible);
    const vertices=arrow.geometry.getAttribute('position');
    for(let i=0;i<vertices.count;i++)assert(Math.abs(vertices.getY(i)-height(vertices.getX(i),vertices.getZ(i))-.14)<1e-6,'all vertices follow terrain');
  }
  const marker=guide.group.children[3];assert(marker.visible);
  assert(Math.abs(marker.position.y-height(destination.x,destination.z)-3.9)<1e-8,'marker hovers over target height');
}
guide.update({x:100,z:0},{x:0,z:20},{x:0,z:0},0);
assert(!guide.group.children[3].visible,'distant objectives do not add floating clutter');
const first=guide.group.children[0].geometry.getAttribute('position');
assert(first.getZ(0)>1&&Math.abs(first.getX(0))<1,'ground arrows follow the next route segment');
guide.update(null,undefined,{x:0,z:0},0);assert(!guide.group.visible);
guide.dispose();assert.equal(scene.children.length,0);
console.log('PASS: every spell range boundary, source-specific DOT expiry, safe checkpoint advancement, ground arrow direction/terrain alignment and objective marker visibility.');
