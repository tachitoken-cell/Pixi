import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import {WORLD_BOUNDS} from '../src/landscape.ts';
import {DUNGEON_BOUNDS,dungeonBounds,dungeonStages,dungeonLayout} from '../src/dungeon.ts';
import {ARENA_BOUNDS,isArenaInstance} from '../src/arena.ts';
import {RAID_BOUNDS,isRaidInstance} from '../src/raid.ts';
import {isInstantCombatInstance} from '../src/instant-combat.ts';
import {instantCombatMap} from '../src/instant-combat-maps.ts';
import {advanceWaypointRoute} from '../src/ground-waypoint.ts';

const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const mapSource=readFileSync(new URL('../src/world-map.ts',import.meta.url),'utf8');
let picks=0;
const gesture={pointers:new Set(),down:undefined,disposed:false,contextLost:false,
  canvas:{getBoundingClientRect:()=>({left:0,top:0,width:800,height:400})},pointer:{set(){}},camera:{},
  atlas:{markers:[]},raycaster:{setFromCamera(){},intersectObjects:()=>[{object:{visible:true,userData:{mapPoint:{x:20,z:0}}}}]},
  options:{onSelect:()=>picks++}};
runInNewContext(stripTypeScriptTypes(mapSource.slice(mapSource.indexOf('  function pointerDown('),mapSource.indexOf('  function lost('))),gesture);
const tap={button:0,pointerId:1,clientX:300,clientY:200};
gesture.pointerDown(tap);gesture.pointerUp(tap);assert.equal(picks,1,'one tap selects one destination');
gesture.pointerDown(tap);gesture.pointerMove({...tap,clientX:340});gesture.pointerUp(tap);
gesture.pointerDown(tap);gesture.pointerDown({...tap,pointerId:2});gesture.pointerUp(tap);gesture.pointerUp({...tap,pointerId:2});
gesture.pointerDown({...tap,button:2});gesture.pointerUp(tap);
gesture.pointerDown(tap);gesture.pointerCancel(tap);gesture.pointerUp(tap);
assert.equal(picks,1,'drag, pinch, pan and cancelled taps cannot replace the waypoint');
// The actual map controls provide direction, with no movement or queued interaction.
const guidanceUpdates=[],guidanceToasts=[],guidanceFields=new Map();
const guidance={isInstantCombatInstance,instantCombatMap,instantCombat:null,usesArenaWorld:id=>isArenaInstance(id)||isInstantCombatInstance(id),isRaidInstance,RAID_BOUNDS,isArenaInstance,ARENA_BOUNDS,player:{hp:100},connected:true,worldReady:true,rosterActive:false,entryActive:false,modalOpen:()=>false,
  guideRoute:[],guideTargetId:undefined,objectiveGuidance:true,elapsed:0,colliders:[],advanceWaypointRoute,canTraverse:()=>true,findPath:(_start,end)=>[end],targetPoints:()=>[],groundWaypoint:{update(){}},updateGuideWaypoint(){},performance:{now:()=>0},
  position:{x:0,z:0},yaw:0,worldInstance:null,waypoint:null,WORLD_BOUNDS,DUNGEON_BOUNDS,dungeonBounds,dungeonLayout,dungeon:null,mapSelection:null,mapRoute:[],
  waypointIndicator:{update:(...args)=>guidanceUpdates.push(args)},toast:message=>guidanceToasts.push(message),
  send:()=>assert.fail('map guidance cannot send gameplay actions'),interactNearby:()=>assert.fail('arriving cannot interact'),
  renderMapDetails(){},$:id=>{if(!guidanceFields.has(id))guidanceFields.set(id,{textContent:'',disabled:false});return guidanceFields.get(id);},
  atlas:{dispose(){}},atlasLabels:new Map()};
runInNewContext(main.match(/^function currentWorldBounds.*$/m)[0],guidance);
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function clearWaypoint('),main.indexOf('function targetPoints('))),guidance);
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function disposeAtlas('),main.indexOf('function renderMapDetails('))),guidance);
const destination={x:10,z:0,id:'quest-board',name:'Quest board'};
assert.equal(guidance.setWaypoint(destination),true);assert.deepEqual(destination,{x:10,z:0,id:'quest-board',name:'Quest board'},'setting guidance leaves shared content immutable');
assert.equal(guidance.waypoint.label,'Quest board');assert.equal(guidance.waypoint.instanceId,null);assert.deepEqual(guidance.position,{x:0,z:0});
const existing=guidance.waypoint;
guidance.guideRoute=[{x:-20,z:6},{x:8,z:0},destination];guidance.updateWaypoint();
assert.equal(guidanceUpdates.at(-1)[0].x,8,'the live guidance controller skips a missed checkpoint behind the player');
assert.deepEqual(guidance.position,{x:0,z:0},'catching up the route never moves the character');guidance.guideRoute=[destination];
guidance.objectiveGuidance=false;guidance.updateWaypoint();assert.equal(guidanceUpdates.at(-1)[0],null,'guidance can be hidden without discarding its destination');assert.equal(guidance.waypoint,existing);guidance.objectiveGuidance=true;
guidance.targetPoints=()=>[{...destination,height:3}];guidance.position.x=9;guidance.updateWaypoint();assert.equal(guidance.waypoint,existing,'markers over a real quest object persist within interaction range');guidance.targetPoints=()=>[];guidance.position.x=0;
for(const point of [{x:NaN,z:0},{x:0,z:Infinity},{x:WORLD_BOUNDS.minX-1,z:0},{x:WORLD_BOUNDS.maxX+1,z:0},{x:0,z:WORLD_BOUNDS.minZ-1},{x:0,z:WORLD_BOUNDS.maxZ+1}]){
  assert.equal(guidance.setWaypoint(point),false);assert.equal(guidance.waypoint,existing,'invalid coordinates preserve the existing marker');
}
guidance.selectMapPoint({x:3,z:4,label:'Another place'},false);
assert.deepEqual(Array.from(guidance.mapRoute,point=>({...point})),[{x:10,z:0}],'the map draws the active waypoint, never an auto-walk path');
assert.equal(guidanceFields.get('atlas-distance').textContent,'Waypoint set · 5m away · Straight-line direction');assert.equal(guidance.waypoint,existing,'initializing the map does not replace active guidance');
assert.equal(guidanceFields.get('atlas-travel').disabled,false);guidance.player.hp=0;guidance.selectMapPoint(destination);assert.equal(guidance.waypoint,existing,'dead characters cannot replace guidance through the map');
assert.equal(guidance.setWaypoint({x:20,z:0}),false,'dead characters cannot set guidance');guidance.player.hp=100;
guidance.disposeAtlas();assert.equal(guidance.waypoint,existing,'closing the atlas preserves same-instance guidance');assert.equal(guidance.mapSelection,null);assert.equal(guidance.mapRoute.length,0);
guidance.modalOpen=()=>true;guidance.updateWaypoint();assert.equal(guidanceUpdates.at(-1)[0],null,'blocking menus hide the indicator without erasing the waypoint');assert.equal(guidance.waypoint,existing);
guidance.modalOpen=()=>false;guidance.position.x=6.99;guidance.updateWaypoint();assert.equal(guidance.waypoint,existing,'guidance persists just outside the three-meter arrival boundary');
guidance.player.zeppelin={from:'greenwood',to:'amberwild'};guidance.position.x=10;guidance.updateWaypoint();
assert.equal(guidance.waypoint,existing,'flying over a waypoint does not complete it');assert.equal(guidanceUpdates.at(-1)[0],null,'flight suspends the ground direction indicator');
delete guidance.player.zeppelin;
guidance.position.x=7;guidance.updateWaypoint();assert.equal(guidance.waypoint,null,'arrival within three meters clears the marker');assert.equal(guidance.position.x,7,'arrival neither snaps position nor continues movement');assert.equal(guidanceToasts.at(-1),'Waypoint reached.');
guidance.position={x:0,z:0};guidance.setWaypoint(destination);guidance.guideTargetId=destination.id;guidance.position.x=9;guidance.updateWaypoint();assert(guidance.waypoint,'objective marker stays at the target until the objective completes');guidance.position={x:0,z:0};guidance.worldInstance='vault-a';guidance.updateWaypoint();assert.equal(guidance.waypoint,null,'entering a different instance discards stale coordinates');
assert.equal(guidance.setWaypoint({x:DUNGEON_BOUNDS.maxX+1,z:0}),false,'dungeon guidance uses dungeon bounds');
assert.equal(guidance.setWaypoint({x:10,z:0,label:'Rune seal'}),true);assert.equal(guidance.waypoint.instanceId,'vault-a');
guidance.updateWaypoint();assert.equal(guidance.waypoint.label,'Rune seal');guidance.worldInstance='vault-b';guidance.updateWaypoint();assert.equal(guidance.waypoint,null,'different dungeons cannot share waypoint coordinates');
guidance.dungeon={kind:'veilhaven'};guidance.worldInstance='expanded';const farRoom=dungeonStages('veilhaven').find(room=>room.id==='throne');assert(farRoom,'the final chamber has a map destination');assert.equal(guidance.setWaypoint(farRoom),true,'expanded rooms accept real map guidance');assert.equal(guidance.setWaypoint({x:dungeonBounds('veilhaven').maxX+1,z:0}),false);guidance.dungeon=null;guidance.worldInstance=null;guidance.setWaypoint(destination);guidance.clearWaypoint();assert.equal(guidance.waypoint,null);assert.equal(guidanceUpdates.at(-1)[0],null,'manual clear immediately hides the indicator');
const travelStart=main.indexOf(" $('atlas-travel').onclick="),travelEnd=main.indexOf('\n',travelStart);
runInNewContext(stripTypeScriptTypes(main.slice(travelStart,travelEnd)),guidance);
guidance.selectMapPoint({x:20,z:0,label:'Chosen marker'});
assert.equal(guidance.waypoint.label,'Chosen marker','one deliberate selection immediately places the waypoint');assert.deepEqual(guidance.position,{x:0,z:0});
assert.equal(guidance.mapSelection.label,'Chosen marker','place details remain available after placement');
guidance.selectMapPoint({x:NaN,z:0});assert.equal(guidance.waypoint.label,'Chosen marker','invalid clicks preserve the chosen marker');
guidanceFields.get('atlas-travel').onclick();assert.equal(guidance.waypoint,null);assert.equal(guidanceFields.get('atlas-travel').disabled,true,'clear is available directly in the map');
assert.equal(guidance.mapRoute.length,0,'clearing a waypoint also removes its route from the atlas');
const initializeMap=main.match(/^ selectMapPoint\(waypoint\?.*;atlas.resize\(\);renderAtlas\(\);$/m)[0];
Object.assign(guidance,{worldZone:'greenwood',isArenaInstance:()=>false,atlas:{resize(){}},renderAtlas(){}});
runInNewContext(stripTypeScriptTypes(initializeMap),guidance);assert.equal(guidance.waypoint,null,'opening an empty map does not place a waypoint at the player');
console.log('PASS: direct map placement, gesture filtering, world/dungeon bounds, flight and menu persistence, explicit clearing and ground arrival without automatic movement.');
