import { isRaidInstance, RAID_BOUNDS } from '../src/raid.ts';
import { isInstantCombatInstance } from '../src/instant-combat.ts';
import { instantCombatMap } from '../src/instant-combat-maps.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
const hook=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const {DUNGEONS,DUNGEON_EXIT,dungeonLayout,dungeonStages,dungeonBounds,dungeonColliders,dungeonReturn,dungeonRoomPortalOpen}=await import('../src/dungeon.ts');
const {buildWorldMapScene,updateDungeonPortalMap}=await import('../src/world-map.ts');
const {isArenaInstance}=await import('../src/arena.ts');
const {findPath}=await import('../src/navigation.ts');
const {dungeonRoomAt}=await import('../src/dungeon-room-visibility.ts');
hook.deregister();
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const segment=(from,to)=>stripTypeScriptTypes(main.slice(main.indexOf(from),main.indexOf(to,main.indexOf(from))));
for(const {id} of DUNGEONS){
 const layout=dungeonLayout(id),portal=layout.portals.find(portal=>portal.requires.length),state={kind:id,objects:[],clearedStages:[],completed:false};
 assert(portal,`${id}: gated room portal exists`);
 const sent=[],stopped=[],messages=[],selectedRooms=[],position={x:portal.x,z:portal.z};
 const runtime={currentWorldBounds:()=>dungeonBounds(state.kind),isInstantCombatInstance,instantCombatMap,instantCombat:null,usesArenaWorld:id=>isArenaInstance(id)||isInstantCombatInstance(id),isRaidInstance,RAID_BOUNDS,isArenaInstance,DUNGEON_EXIT,dungeonReturn,dungeonLayout,dungeonRoomPortalOpen,dungeonBounds,findPath,dungeonRoomAt,
  worldInstance:'run',dungeon:state,worldZone:'hollow',player:{hp:100},connected:true,worldReady:true,position,rotation:0,lastMove:0,
  players:[],nodes:[],enemies:[],loot:[],zoneHandle:{setDungeonRoom:room=>selectedRooms.push(room)},worldDungeonKind:id,currentDungeonRoom:undefined,selectedId:portal.id,hoveredId:portal.id,performance:{now:()=>1},
  clearCombat(){},treasureEffects:{clear(){}},dungeonAttackCues:new Map([['stale',{}]]),targetRing:{visible:true},$:()=>({dataset:{}}),
  standUp(){},clearInteraction:()=>true,clearMovementKeys:()=>stopped.push('movement'),clearWaypoint:()=>stopped.push('waypoint'),setAutoAttack:()=>stopped.push('attack'),cancelCasting:()=>stopped.push('cast'),cancelGathering:()=>stopped.push('gather'),
  send:message=>sent.push(message),toast:message=>messages.push(message),nearbyInteraction:()=>runtime.targetPoints().find(point=>point.id===portal.id),
  waypoint:null,guideRoute:[],guideTargetId:null,colliders:dungeonColliders([],[],id),updateWaypoint(){}};
 runInNewContext(segment('function visibleInDungeonRoom(','async function switchZone(')+segment('function targetPoints(','function cancelGathering(')+segment('function interactNearby(','function pickTarget(')+segment('function setWaypoint(','function updateWaypoint('),runtime);
 runtime.updateDungeonRoomView();
 assert.deepEqual(selectedRooms,[portal.roomId]);assert.equal(runtime.dungeonAttackCues.size,0);assert.equal(runtime.targetRing.visible,false);
 runtime.selectedId=runtime.hoveredId=portal.id;
 assert(runtime.targetPoints().every(point=>dungeonRoomAt(layout.rooms,point)?.id===portal.roomId),'only occupied-room entities and portals can be selected');
 runtime.updateDungeonRoomView();assert.equal(selectedRooms.length,1,'walking within one room does not reset effects or rebuild the world');
 assert.match(runtime.nearbyInteraction().label,/Sealed/);
 runtime.interactNearby();assert.equal(sent.length,0,'locked portals do not dispatch travel');assert.match(messages.at(-1),/unlock/);
 const back=layout.portals.find(link=>link.roomId===portal.roomId&&link.targetRoomId==='preparation');
 assert(back,'the opening chamber has a return portal');
 position.x=back.x;position.z=back.z;runtime.nearbyInteraction=()=>runtime.targetPoints().find(point=>point.id===back.id);
 assert.match(runtime.nearbyInteraction().label,/Sealed/,'the return portal seals immediately on room entry');
 runtime.interactNearby();assert.equal(sent.length,0,'the client cannot dispatch a retreat before clearing the room');
 position.x=portal.x;position.z=portal.z;runtime.nearbyInteraction=()=>runtime.targetPoints().find(point=>point.id===portal.id);
 state.clearedStages=dungeonStages(id).map(stage=>stage.id);state.objects=layout.objects.map(object=>({...object,activated:true}));
 assert.match(runtime.targetPoints().find(point=>point.id===back.id).label,/Next room/,'the return portal reopens after the room is cleared');
 assert.match(runtime.nearbyInteraction().label,/Next room/);
 position.x=portal.x+3.01;runtime.interactNearby();assert.equal(sent.length,0,'portal use requires three-metre proximity');
 position.x=portal.x;runtime.clearInteraction=()=>false;runtime.interactNearby();assert.equal(sent.length,0,'portal use requires a clear approach');runtime.clearInteraction=()=>true;
 runtime.interactNearby();assert.deepEqual(JSON.parse(JSON.stringify(sent)),[{type:'move',zone:'hollow',x:portal.x,z:portal.z,rotation:0},{type:'dungeonInteract',targetId:portal.id}]);
 assert.deepEqual(stopped,['movement','waypoint','attack','cast','gather']);assert.equal(runtime.selectedId,null);assert.deepEqual(position,{x:portal.x,z:portal.z},'travel waits for server correction');
 state.clearedStages=[];state.objects=[];state.dream={kind:'pleasant'};assert.match(runtime.nearbyInteraction().label,/Next room/);runtime.interactNearby();assert.equal(sent.at(-1).type,'dungeonInteract','dream room links remain open');delete state.dream;
 const foyer=layout.rooms.find(room=>room.id==='preparation'),last=layout.rooms.find(room=>room.id==='throne');position.x=foyer.x;position.z=foyer.z;
 runtime.updateDungeonRoomView();assert.equal(selectedRooms.at(-1),foyer.id,'an authoritative destination changes the room immediately');
 assert(runtime.targetPoints().every(point=>dungeonRoomAt(layout.rooms,point)?.id===foyer.id),'backtracking hides departure-room interaction targets');
 assert(runtime.setWaypoint({...last,label:last.name}));const first=layout.portals.find(portal=>portal.id===runtime.waypoint.id);assert.equal(first?.roomId,foyer.id,'distant chamber guidance selects a portal in the current room');
 assert(runtime.guideRoute.length&&Math.hypot(runtime.guideRoute.at(-1).x-first.x,runtime.guideRoute.at(-1).z-first.z)<.1,'walking route reaches the current room portal');
 const atlas=buildWorldMapScene(true,undefined,id);
 try{
  assert.equal(atlas.markers.filter(marker=>marker.userData.kind==='portal').length,layout.portals.length);
  assert(atlas.group.getObjectByName('atlas-room-portal-connections').isLineSegments,'atlas explains teleport links without inventing walkable corridors');
  const pin=atlas.markers.find(marker=>marker.name===portal.id),label=atlas.labels.find(label=>label.point.id===portal.id);
  updateDungeonPortalMap(atlas,state);assert.match(label.text,/^Sealed/);assert.equal(pin.children[0].material.color.getHexString(),'9290aa');
  assert.match(atlas.labels.find(label=>label.point.id===back.id).text,/^Sealed/,'the atlas marks uncleared-room retreat portals sealed');
  state.dream={kind:'pleasant'};updateDungeonPortalMap(atlas,state);assert.match(label.text,/^Portal/);assert.equal(pin.children[0].material.color.getHexString(),'70c8ff');delete state.dream;
  state.clearedStages=dungeonStages(id).map(stage=>stage.id);state.objects=layout.objects.map(object=>({...object,activated:true}));updateDungeonPortalMap(atlas,state);assert.match(label.text,/^Portal/);
 }finally{atlas.dispose();}
}
console.log('PASS: seven dungeons expose only current-room targets; room corrections clear old effects, E/tap guards range and obstacles and awaits server travel; dream links, backtracking, waypoint routing and shared map portal states.');
