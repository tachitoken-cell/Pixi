import { isRaidInstance, RAID_BOUNDS } from '../src/raid.ts';
import { HEARTHLING_NPC } from '../src/hearthling.ts';
import { POLL_BOOTHS } from '../src/poll-booths.ts';
import { CITY_SERVICE_NPCS } from '../src/city-services.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { WORLD_CURIOS, RESOURCE_SITES } from '../src/world-features.ts';
import { BUILDINGS, BUILDING_CHAIRS, BUILDING_BEDS, buildingAt } from '../src/buildings.ts';
import { GOLD_MERCHANT } from '../src/gold-merchant.ts';
import { isInstantCombatInstance } from '../src/instant-combat.ts';

const source=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const extract=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);return stripTypeScriptTypes(source.slice(a,b));};
let lookups=0;
const context={visibleInDungeonRoom:()=>true,POLL_BOOTHS,CITY_SERVICE_NPCS,BUILDING_CHAIRS,BUILDING_BEDS,WORLD_CURIOS,RESOURCE_SITES,GOLD_MERCHANT,buildingAt:(x,z)=>{lookups++;return buildingAt(x,z);},position:{x:0,z:8},player:{hp:100},
 worldInstance:null,storyWorld:undefined,isRaidInstance,RAID_BOUNDS,HEARTHLING_NPC,isArenaInstance:id=>id?.startsWith('arena:'),usesArenaWorld:id=>id?.startsWith('arena:')||isInstantCombatInstance(id),dungeon:null,DUNGEON_EXIT:{x:0,z:0},DUNGEONS:[],
 ZONES:[],VILLAGE_NPCS:[],TRAINER_NPCS:[],AUCTIONEER:{},DEED_AUCTIONEER:{},BANKER:{},ARENA_ENTRANCE:{},ZEPPELIN_PORTS:[],
 treasureMapTarget:()=>undefined,zoneHandle:{citizens:new Map()},players:[],nodes:[],enemies:[],loot:[]};
runInNewContext(extract('function targetPoints(','function cancelGathering('),context);
for(const position of [{x:0,z:8},{x:9999,z:9999},...BUILDINGS]){
 context.position=position;lookups=0;
 const points=context.targetPoints(),chairs=points.filter(p=>p.kind==='chair');
 assert.deepEqual(Array.from(points.filter(p=>p.kind==='bed'),p=>p.id),BUILDING_BEDS.filter(b=>b.buildingId===buildingAt(position.x,position.z)?.id).map(b=>b.id));
 const expected=BUILDING_CHAIRS.filter(c=>c.buildingId===buildingAt(position.x,position.z)?.id);
 assert.deepEqual(Array.from(chairs,p=>p.id),expected.map(c=>c.id));
 assert.equal(lookups,1,'one current-building lookup shared by all chair and bed targets');
 if(chairs.length){context.player.seated={chairId:chairs[0].id};assert.equal(context.targetPoints().find(p=>p.id===chairs[0].id).label,'Stand up');delete context.player.seated;}
}
for(const id of ['dungeon:test','arena:test','instant-combat-test']){context.worldInstance=id;lookups=0;assert(context.targetPoints().every(p=>p.kind!=='chair'&&p.kind!=='bed'));assert.equal(lookups,0);}
let lists=0;
const target={connected:true,worldReady:true,modalOpen:()=>false,player:{hp:100},loot:[],cancelledGather:-1,selectedId:null,position:{x:0,z:0},
 targetPoints:()=>{lists++;return [];},chooseTarget:()=>undefined,targetRing:{visible:true},$:()=>({hidden:false})};
runInNewContext(extract('function updateTarget(',"$('target-action').onclick"),target);
target.updateTarget(1);assert.equal(lists,0,'no target list when no target is selected');
target.selectedId='a';target.updateTarget(2);assert.equal(lists,1);
target.selectedId=null;target.player.gathering={nodeId:'herb',startedAt:3};target.updateTarget(3);assert.equal(lists,2,'gathering still targets the node');

let heights=0;
const camera=new THREE.PerspectiveCamera(52,1280/720,.1,500);camera.position.set(0,10,20);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
const labels={visibleInDungeonRoom:()=>true,THREE,labelPosition:new THREE.Vector3(),surfaceHeight:()=>{heights++;return 0;},camera,position:{x:0,z:0},worldInstance:null,innerWidth:1280,innerHeight:720};
runInNewContext(extract('function placeLabel(','let previous=performance.now()'),labels);
const element={style:{}};
labels.placeLabel(element,0,2,0);assert.equal(element.style.visibility,'visible');assert.equal(heights,1);
const projection=new THREE.Vector3(0,2,0).project(camera);assert.equal(element.style.left,`${(projection.x*.5+.5)*1280}px`);assert.equal(element.style.top,`${(-projection.y*.5+.5)*720}px`);
labels.placeLabel(element,42,2,0);labels.placeLabel(element,1000,2,0);assert.equal(element.style.visibility,'hidden');assert.equal(heights,1,'out-of-range labels skip terrain and projection work');
labels.placeLabel(element,0,2,0);assert.equal(element.style.visibility,'visible');assert.equal(heights,2,'returning labels become visible immediately');
console.log('PASS: all building chair and bed targets preserved with one lookup; idle targeting and distant labels skip unnecessary work.');
