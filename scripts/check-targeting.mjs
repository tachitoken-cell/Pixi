import {isInstantCombatInstance} from '../src/instant-combat.ts';
import {instantCombatMap} from '../src/instant-combat-maps.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { combatStats } from '../src/progression.ts';
import { isRaidInstance, RAID_BOUNDS } from '../src/raid.ts';
import { HEARTHLING_NPC } from '../src/hearthling.ts';
import { POLL_BOOTHS } from '../src/poll-booths.ts';
import { CITY_SERVICE_NPCS } from '../src/city-services.ts';
import { AUTO_ATTACKS } from '../src/auto-attacks.ts';
import { gameKey, bindingLabel } from '../src/keybindings.ts';
import {isArenaInstance,ARENA_BOUNDS,ARENA_ENTRANCE} from '../src/arena.ts';
import { isHostilePlayer,isHostileTarget,combatCompanionOwner, canSupportPlayer } from '../src/targeting.ts';
import { BUILDING_CHAIRS, BUILDING_BEDS, buildingAt } from '../src/buildings.ts';
import { TRAINER_NPCS } from '../src/training.ts';
import { AUCTIONEER, DEED_AUCTIONEER, BANKER } from '../src/city.ts';
import { GOLD_MERCHANT } from '../src/gold-merchant.ts';
import { WORLD_CURIOS, RESOURCE_SITES } from '../src/world-features.ts';
import { ZEPPELIN_PORTS } from '../src/zeppelin.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { chooseTarget } from '../src/targeting.ts';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeResource, showResource, setResourceTreeAssets, loadGatheringAssets } from '../src/resources.ts';
import { RESOURCE_TYPES } from '../src/skills.ts';
import { ZONES } from '../src/content.ts';
import { VILLAGES, VILLAGE_NPCS } from '../src/settlements.ts';
import { DEATH_ANIMATION_MS } from '../src/shared.ts';
import { toWorld, WORLD_COLLIDERS, WORLD_BOUNDS, DUNGEON_BOUNDS, canTraverse } from '../src/realm.ts';
import { DUNGEON_EXIT, DUNGEON_STAGES, DUNGEONS, DUNGEON_RETURN, ROOTVAULT_GUARDIAN, getDungeon, dungeonBounds, dungeonColliders } from '../src/dungeon.ts';
import { tameableKind, combatCompanionStats } from '../src/combat-companions.ts';
import { SPELLS, abilityValid, abilityUnlocked, spellCastTimeMs, legacyAbility, GLOBAL_ATTACK_MS } from '../src/spells.ts';
import { surfaceHeight, pickTerrain } from '../src/terrain-view.ts';
import { onboardingFeatureUnlocked, onboardingLockReason } from '../src/onboarding.ts';
const hook = registerHooks({ resolve(specifier, context, next) { return next(context.parentURL?.includes('/src/') && /^\.\/[\w-]+$/.test(specifier) ? `${specifier}.ts` : specifier, context); } });
const { castLabel } = await import('../src/casting.ts'); hook.deregister();

const origin = { x: 0, z: 0 };
const nearby = { id: 'nearby', x: 1, z: 0, kind: 'node', name: 'Herbs', label: 'Harvest herbs', height: 1 };
const selected = { ...nearby, id: 'selected', x: 3, z: 4 };
const points = [selected, nearby];
assert.equal(chooseTarget(points, null, origin), nearby, 'unselected interaction chooses the nearest target');
assert.deepEqual(points, [selected, nearby], 'selection does not reorder caller state');
assert.equal(chooseTarget(points, selected.id, origin), selected, 'explicit selection wins over a closer target');
assert.equal(chooseTarget(points, selected.id, origin, 5), selected, 'interaction range includes its boundary');
assert.equal(chooseTarget(points, selected.id, origin, 4.99), undefined, 'out-of-range selection never silently falls back');
assert.equal(chooseTarget(points, 'depleted', origin), undefined, 'missing selection never silently falls back');
assert.equal(chooseTarget(points, null, origin, .99), undefined, 'nearest targeting obeys range');
assert.equal(chooseTarget([], null, origin), undefined);
const healer=VILLAGE_NPCS.find(npc=>npc.id==='village-pinewake-healer');

// Exercise the actual input path: its ordering matters before a gather snapshot arrives.
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const catalog = {storyWorld:undefined,instantCombat:null,isInstantCombatInstance,instantCombatMap,usesArenaWorld:id=>isArenaInstance(id)||isInstantCombatInstance(id),MONSTERS,visibleInDungeonRoom:()=>true,enemyMeshes:new Map(),POLL_BOOTHS,CITY_SERVICE_NPCS,isHostilePlayer,isHostileTarget,combatCompanionOwner,isRaidInstance,RAID_BOUNDS,HEARTHLING_NPC,isArenaInstance,ARENA_BOUNDS,ARENA_ENTRANCE, zoneHandle:undefined, treasureMapTarget:()=>undefined, BUILDING_CHAIRS,BUILDING_BEDS,buildingAt,WORLD_CURIOS,RESOURCE_SITES,position:origin,player:{},players:[],AUCTIONEER,DEED_AUCTIONEER,BANKER,GOLD_MERCHANT,ZEPPELIN_PORTS,DUNGEONS,DUNGEON_RETURN,THREE, DEATH_ANIMATION_MS, serverOffset:0, ZONES, VILLAGE_NPCS, TRAINER_NPCS, toWorld, RESOURCE_TYPES, DUNGEON_EXIT, dungeon: null, worldInstance: null, nodes: [], enemies: [], loot: [], lootMeshes: new Map() };
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function deathProgress('),main.indexOf('function syncEntities('))),catalog);
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function targetPoints('), main.indexOf('function cancelGathering('))), catalog);
for (const zone of ZONES) {
  for (const [kind, local] of [['board', { x: 3, z: 2 }], ['workshop', { x: -4, z: 3 }], ['npc', zone.npc]]) {
    const point = catalog.targetPoints().find(p => p.id === (kind === 'npc' ? zone.npc.id : `${kind}-${zone.id}`));
    assert(point, `${zone.id} exposes its ${kind} target`);
    assert.deepEqual({ x: point.x, z: point.z }, { x: toWorld(zone.id, local).x, z: toWorld(zone.id, local).z }, 'static content is translated to the same global space as live entities');
  }
}
for(const resident of [...VILLAGE_NPCS,...TRAINER_NPCS]){
 const target=catalog.targetPoints().find(point=>point.id===resident.id);
 assert(target&&target.kind==='npc');assert.equal(target.name,resident.name);assert.equal(target.zone,resident.zone);
 assert.deepEqual({x:target.x,z:target.z},{x:resident.x,z:resident.z},'all village residents and trainers expose their actual shared target coordinates');
}
const stationWaypoints=[];
const stationRuntime={VILLAGE_NPCS,toWorld,canTraverse,colliders:WORLD_COLLIDERS,worldInstance:null,worldZone:'greenwood',position:{x:0,z:0},
 targetPoints:()=>catalog.targetPoints(),toast(){},closePanel(){},setWaypoint:point=>stationWaypoints.push(point)};
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function nearStation('),main.indexOf('function openContracts('))),stationRuntime);
for(const warden of VILLAGE_NPCS.filter(resident=>resident.role==='warden')){
 stationRuntime.position={x:warden.x,z:warden.z};stationRuntime.worldZone=warden.zone;
 assert(stationRuntime.nearStation('board',warden.zone),'a nearby warden is a real local quest service');
 assert(!stationRuntime.nearStation('workshop',warden.zone),'wardens cannot be used as arbitrary crafting stations');
 stationRuntime.findStation('board',warden.zone);assert.equal(stationWaypoints.at(-1).id,warden.id,'Find quests marks the nearby village warden over the distant main-town board');
}
stationRuntime.worldInstance='rootvault-test';assert(!stationRuntime.nearStation('board'),'dungeons cannot reach overworld service NPCs');
const villageRequests=[];
const serviceRuntime={position:{x:VILLAGE_NPCS[0].x,z:VILLAGE_NPCS[0].z},worldZone:VILLAGE_NPCS[0].zone,rotation:0,lastMove:0,performance,send:message=>villageRequests.push(message)};
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function requestVillageService('),main.indexOf('function openDialogue('))),serviceRuntime);
serviceRuntime.requestVillageService(VILLAGE_NPCS[0].id,'trade');
assert.deepEqual(villageRequests.map(message=>message.type),['move','npcService'],'the final position reaches the server before requesting a village service');
assert.equal(villageRequests[1].npcId,VILLAGE_NPCS[0].id);assert.equal(villageRequests[1].service,'trade');

const entrance = catalog.targetPoints().find(p => p.id === 'dungeon-entrance');
assert.deepEqual({ x: entrance.x, z: entrance.z, zone: entrance.zone }, DUNGEONS.find(dungeon=>dungeon.id==='rootvault').entrance);
catalog.worldInstance = 'rootvault-a';
assert.deepEqual(Array.from(catalog.targetPoints(), p => p.id), ['dungeon-exit'], 'an instance cannot target overworld stations or NPCs');
catalog.players=[{id:'ally',hp:100,x:42,z:0,instanceId:catalog.worldInstance},{id:'dead',hp:0,x:0,z:0,instanceId:catalog.worldInstance},{id:'invisible',hp:100,x:0,z:0,instanceId:catalog.worldInstance,gm:{invisible:true}},{id:'elsewhere',hp:100,x:0,z:0,instanceId:'other'},{id:'far',hp:100,x:42.01,z:0,instanceId:catalog.worldInstance}];
assert.deepEqual(Array.from(catalog.targetPoints().filter(point=>point.kind==='player'),point=>point.id),['ally'],'living visible allies at the 42m boundary remain selectable; dead, invisible, out-of-instance and distant players do not');
catalog.enemies=[{id:'enemy',name:'Slime',kind:'moss-slime',hp:100,alive:true,x:42,z:0,instanceId:catalog.worldInstance},{id:'dead-enemy',name:'Slime',kind:'moss-slime',hp:0,alive:false,x:0,z:0,instanceId:catalog.worldInstance}];
assert.deepEqual(Array.from(catalog.targetPoints().filter(point=>point.kind==='enemy'),point=>point.id),['enemy']);
catalog.enemies[0].x=42.01;assert(!catalog.targetPoints().some(point=>point.id==='enemy'),'moving out of range invalidates an enemy');
catalog.players=[];catalog.enemies=[];
const start = main.indexOf('function cancelGathering('), end = main.indexOf("let lastTargetText=", start);
assert(start >= 0 && end > start);
const hovered = { ...nearby, id: 'hovered', x: 2 };
const sent = [];
const hiddenRoot = new THREE.Group(), visibleRoot = new THREE.Group(), hiddenTool = new THREE.Group();
hiddenTool.visible = false;
const hiddenPiece = new THREE.Object3D(), visiblePiece = new THREE.Object3D();
hiddenRoot.add(hiddenTool); hiddenTool.add(hiddenPiece); visibleRoot.add(visiblePiece);
const runtime = {storyWorld:undefined,dungeonBounds,instantCombat:null,isInstantCombatInstance,instantCombatMap,usesArenaWorld:id=>isArenaInstance(id)||isInstantCombatInstance(id),isRaidInstance,RAID_BOUNDS,HEARTHLING_NPC,remote:new Map(),mountViews:new Map(),canvas:{getBoundingClientRect:()=>({left:0,top:0,width:1280,height:720})},players:[],bindingLabel,heldKeyCodes:new Map(),isHostilePlayer,isHostileTarget,combatCompanionOwner,isArenaInstance,ARENA_BOUNDS,ARENA_ENTRANCE,canSupportPlayer,DUNGEONS,
  zoneHandle:undefined,  BUILDING_CHAIRS,buildingAt,THREE, chooseTarget, canTraverse, colliders:WORLD_COLLIDERS, WORLD_BOUNDS, DUNGEON_BOUNDS, performance, innerWidth: 1280, innerHeight: 720,
  selectedId: null, hoveredId: hovered.id, position: { x: 0, z: 0 }, player: {}, connected: true,
  cancelledGather: 0, gatherRequested: true, nodes: [], keys: new Set(['w']),
  worldZone: 'greenwood', worldInstance: null, dungeon: null, rotation: 0, lastMove: 0, camera: {}, ground: {},
  pickTerrain: ray => ray.intersectPlane({}, new THREE.Vector3()),
  targetPoints: () => [nearby, hovered],
  nodeMeshes: new Map([[nearby.id, hiddenRoot], [hovered.id, visibleRoot]]), enemyMeshes: new Map(), lootMeshes: new Map(), npcViews: new Map(),
  raycaster: { setFromCamera() {}, intersectObjects: () => [{ object: hiddenPiece, distance: 2 }, { object: visiblePiece, distance: 3 }], ray: { origin: new THREE.Vector3(0,10,0), intersectPlane: () => null } },
  send: message => { sent.push(message); if(message.type==='gather')runtime.gatherRequested=true; }, toast() {}, tone() {},act:()=>assert.fail('E never starts an attack'),setWaypoint:()=>assert.fail('E never assigns a waypoint'),
};
runInNewContext(stripTypeScriptTypes(main.match(/^function currentWorldBounds.*$/m)[0]),runtime);
runInNewContext(main.match(/^function clearMovementKeys.*$/m)[0],runtime);
runInNewContext(stripTypeScriptTypes(main.slice(start, end)), runtime);
runtime.cancelGathering();
assert.equal(sent.pop().type, 'cancelGather', 'cancel reaches the server before any gather-start snapshot');
runtime.player.gathering = { startedAt: 123 };
runtime.cancelGathering();
assert.equal(runtime.cancelledGather, 123, 'confirmed gathering animation stops immediately on cancel');
sent.length = 0; runtime.player.gathering = null;
runtime.interactNearby();
assert.equal(runtime.selectedId, null, 'E acts without automatically selecting a nearby or hovered resource');
assert.equal(sent.map(message => message.type).join(','), 'move,gather', 'final movement reaches the server before gathering begins');
assert.equal(sent[1].targetId, nearby.id,'without an explicit selection E uses the closest resource, never hover priority');
assert.equal(runtime.keys.size, 0);assert.deepEqual(runtime.position,origin,'interacting never changes position');
assert(runtime.lastMove > 0, 'movement flush updates the periodic movement timestamp');
runtime.player.gathering = { startedAt: 124 };
runtime.interactNearby();
assert.equal(sent.length, 2, 'confirmed gathering cannot restart on repeated input');
assert.equal(runtime.pickTarget(100, 100).id, hovered.id, 'raycast ignores a hidden tool before accepting visible geometry');
runtime.player.gathering=null;runtime.selectedId=hovered.id;sent.length=0;runtime.interactNearby();
assert.equal(sent[1].targetId,hovered.id,'an explicit selection wins over the nearest interaction');assert.equal(runtime.selectedId,hovered.id);
runtime.selectedId='missing';sent.length=0;runtime.interactNearby();assert.equal(sent.length,0,'missing explicit selection never falls back to a different target');
runtime.selectedId=null;runtime.targetPoints=()=>[{...nearby,id:'foe',kind:'enemy',x:.2},{...nearby,x:3.01}];
runtime.interactNearby();assert.equal(sent.length,0,'E ignores nearby enemies and resources beyond three meters');
runtime.selectedId='foe';runtime.interactNearby();assert.equal(sent.length,0,'E does not attack an explicitly selected monster');
runtime.targetPoints=()=>[{...nearby,x:3}];runtime.selectedId=null;runtime.interactNearby();assert.equal(sent[1].targetId,nearby.id,'three-meter interaction boundary is inclusive');

// The actual Three.js ray/heightfield boundary must occlude hidden target geometry.
const buried = new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());
const hill = { x: 138, z: -276 }, height = surfaceHeight(hill.x,hill.z);
buried.position.set(hill.x,height-3,hill.z);buried.updateMatrixWorld(true);
const terrainCamera = new THREE.PerspectiveCamera(45,1280/720,.1,100);
terrainCamera.position.set(hill.x,height+20,hill.z+8);terrainCamera.lookAt(buried.position);terrainCamera.updateMatrixWorld(true);
const terrainRuntime = {storyWorld:undefined,canvas:runtime.canvas,isHostileTarget,players:[],player:undefined,zoneHandle:undefined, THREE, innerWidth:1280, innerHeight:720, camera:terrainCamera, raycaster:new THREE.Raycaster(), pickTerrain,
  worldInstance:null, targetPoints:()=>[{...nearby,id:'buried',...hill}], chooseTarget,
  nodeMeshes:new Map([['buried',buried]]),enemyMeshes:new Map(),lootMeshes:new Map(),npcViews:new Map() };
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function pickTarget('),main.indexOf('let lastTargetText='))),terrainRuntime);
assert.equal(terrainRuntime.pickTarget(640,360),undefined,'a hillside hides target geometry behind its visible surface');
buried.position.y=height+1;buried.updateMatrixWorld(true);terrainCamera.lookAt(buried.position);terrainCamera.updateMatrixWorld(true);
assert.equal(terrainRuntime.pickTarget(640,360)?.id,'buried','visible target geometry in front of the terrain remains pickable');
buried.geometry.dispose();buried.material.dispose();

// Pick the actual board voxels above ground, where the old terrain fallback misses.
const zonesSource=readFileSync(new URL('../src/zones.ts',import.meta.url),'utf8');
const boardGeometry=new THREE.BoxGeometry(1,1,1),boardMaterial=new THREE.MeshBasicMaterial(),boards=new Map(),boardPanels=[],boardEvents=new Map();
const boardRuntime={...runtime,...terrainRuntime,zoneHandle:{boards},players:[],player:{hp:100},worldReady:true,modalOpen:()=>false,
  pickPlayer:()=>undefined,playerMenu:{close(){}},setAutoAttack:()=>{},openContracts:zone=>boardPanels.push(zone),
  canvas:{...runtime.canvas,addEventListener:(name,handler)=>boardEvents.set(name,handler)},act:action=>{assert.equal(action,'interact');boardRuntime.interactNearby();}};
runInNewContext(stripTypeScriptTypes(main.slice(start,end)),boardRuntime);
const boardRightStart=main.indexOf("canvas.addEventListener('contextmenu',");
runInNewContext(stripTypeScriptTypes(main.slice(boardRightStart,main.indexOf("canvas.addEventListener('wheel'",boardRightStart))),boardRuntime);
const boardBodyStart=zonesSource.indexOf("} else if (solid.kind === 'board') {")+"} else if (solid.kind === 'board') {".length;
const boardBody=zonesSource.slice(boardBodyStart,zonesSource.indexOf("} else if (solid.kind === 'workshop') {",boardBodyStart));
const boardPress=()=>boardEvents.get('contextmenu')({clientX:640,clientY:360,preventDefault(){}});
for(const zone of ZONES){
 const point={...toWorld(zone.id,{x:3,z:2}),id:`board-${zone.id}`,kind:'board',name:'Quest board',height:3.1},group=new THREE.Group();
 const floor=surfaceHeight(point.x,point.z);group.position.set(point.x-3,floor,point.z-2);
 const currentVoxels=[],build={THREE,zone,group,boards,currentVoxels,geometry:boardGeometry,stoneMaterial:boardMaterial,x:3,z:2,box:(...voxel)=>currentVoxels.push([...voxel,0]),glow(){}};
 runInNewContext(stripTypeScriptTypes(zonesSource.slice(zonesSource.indexOf('function staticBatch('),zonesSource.indexOf('interface LandscapeChunk'))),build);
 runInNewContext(stripTypeScriptTypes(boardBody),build);group.updateMatrixWorld(true);
 assert.equal(currentVoxels.length,0,'pickable board voxels are moved out of the terrain batch, never duplicated');
 const mesh=boards.get(point.id);assert.equal(mesh.parent,group,'selection uses the rendered board batch');
 boardRuntime.targetPoints=()=>[point];boardRuntime.position={x:point.x,z:point.z+2};
 for(const [dx,dz] of [[0,8],[4,8],[0,-8],[-4,-8]]){
  terrainCamera.position.set(point.x+dx,floor+4,point.z+dz);terrainCamera.lookAt(point.x,floor+1.48,point.z);terrainCamera.updateMatrixWorld(true);
  assert.equal(boardRuntime.pickTarget(640,360)?.id,point.id,`${zone.id}: the visible board face is clickable from either side`);
  const terrain=pickTerrain(boardRuntime.raycaster.ray,false);assert(terrain&&Math.hypot(terrain.x-point.x,terrain.z-point.z)>2,'this board-face click misses the old ground footprint');
  const count=boardPanels.length;boardPress();assert.equal(boardPanels.length,count+1);assert.equal(boardPanels.at(-1),zone.id,'right-click opens the clicked region through the normal interaction guard');
 }
 const count=boardPanels.length;boardRuntime.position={x:point.x,z:point.z+3.01};boardPress();assert.equal(boardPanels.length,count,'remote clicks cannot open quests');
 boardRuntime.position={x:point.x,z:point.z+2};boardRuntime.colliders=[{x:point.x,z:point.z+1,r:.2}];boardPress();assert.equal(boardPanels.length,count,'board clicks cannot interact through an obstacle');boardRuntime.colliders=WORLD_COLLIDERS;
 mesh.visible=false;assert.equal(boardRuntime.pickTarget(640,360),undefined,'hidden board geometry is ignored');mesh.dispose();boards.clear();
}
boardGeometry.dispose();boardMaterial.dispose();

const corpse = { ...nearby, id: 'corpse', kind: 'loot', label: 'Loot Woodland slime' };
const corpseDrop = { id:corpse.id, gold:7, relic:0, items:[], ownerId:'tester' }, openedLoot=[];
runtime.loot=[corpseDrop];runtime.lootUI={open:drop=>openedLoot.push(drop)};
runtime.targetPoints = () => [corpse]; runtime.selectedId = corpse.id; runtime.hoveredId = null;
runtime.lootMeshes.set(corpse.id, { mesh: visibleRoot });
assert.equal(runtime.pickTarget(100, 100).id, corpse.id, 'fallen monster geometry is clickable');
sent.length = 0;
runtime.interactNearby();
assert.deepEqual(sent.map(message => message.type), ['cancelGather', 'move'], 'opening loot flushes the current manual position and cancels gathering without collecting rewards');
assert.equal(openedLoot.length,1);assert.equal(openedLoot[0],corpseDrop,'interaction opens the exact server-provided corpse contents for review');
assert(!sent.some(message=>message.type==='loot'),'E and right-click interaction never auto-claim corpse items');
corpse.x = 8; sent.length = 0;
runtime.interactNearby();
assert.equal(sent.length, 0, 'a distant corpse sends no action and cannot start automatic movement');assert.deepEqual(runtime.position,origin);
assert.equal(openedLoot.length,1,'distant interaction cannot reopen a loot window');
runtime.position={x:-27.25,z:105.5};runtime.targetPoints=()=>[{...healer,kind:'npc'}];runtime.selectedId=healer.id;
assert(Math.hypot(runtime.position.x-healer.x,runtime.position.z-healer.z)<=3&&!runtime.clearInteraction(runtime.position,healer),'the healer fixture is nearby but blocked by the well');
runtime.interactNearby();
assert.equal(sent.length,0,'a nearby NPC behind the well requires the player to move around it');assert.deepEqual(runtime.position,{x:-27.25,z:105.5});
runtime.position=origin;

const opened = [];
runtime.openContracts = zone => opened.push(['board', zone]);
runtime.openCrafting = () => opened.push(['workshop']);
runtime.openDungeon = () => opened.push(['dungeon']);
runtime.raycaster.intersectObjects = () => [];
for (const kind of ['board', 'workshop', 'dungeon']) {
  const point = { ...nearby, id: `${kind}-greenwood`, kind };
  runtime.targetPoints = () => [nearby, point]; runtime.selectedId = point.id;
  runtime.raycaster.ray.intersectPlane = (_plane, hit) => hit.set(point.x, 0, point.z);
  assert.equal(runtime.pickTarget(100, 100)?.id, point.id, `${kind} can be selected through its ground footprint without a resource mesh`);
  sent.length = 0;
  runtime.interactNearby();
  assert.deepEqual(opened.at(-1), kind === 'board' ? ['board', 'greenwood'] : [kind]);
  assert.equal(sent.length, 0, `${kind} opens its panel without a gather or loot request`);
  point.x = 9;
  const count = opened.length;
  runtime.interactNearby();
  assert.equal(opened.length, count, `distant ${kind} does not open or start movement`);assert.deepEqual(runtime.position,origin);
  runtime.raycaster.ray.intersectPlane = (_plane, hit) => hit.set(point.x + 3, 0, point.z);
  assert.equal(runtime.pickTarget(100, 100), undefined, 'station selection does not snap outside its footprint');
}

const rune = { ...nearby, id: 'verdant-seal', kind: 'dungeon' };
runtime.targetPoints = () => [rune]; runtime.selectedId = rune.id;
runtime.dungeon = { objects: [{ ...rune, available: false, activated: false }] };
sent.length = 0; runtime.interactNearby();
assert.equal(sent.length, 0, 'locked runes cannot send an activation');
runtime.dungeon.objects[0].available = true;
runtime.interactNearby();
assert.equal(sent.map(message => message.type).join(','), 'move,dungeonInteract');
assert.equal(sent[1].targetId, rune.id, 'interaction sends only the selected object identity');
runtime.dungeon.objects[0].activated = true;
sent.length = 0; runtime.interactNearby();
assert.equal(sent.length, 0, 'spent dungeon objects cannot be activated again');

const attackSent = [], foe = { ...nearby, id: 'shore-foe', kind: 'enemy', x: 2 }, ally={id:'ally',hp:100,instanceId:null,x:2,z:0};
const foeEnemy = { ...foe, kind:'moss-slime', alive:true, hp:100, level:1 }, autoAttackStops=[];
const attackRuntime = {instantCombat:null,isInstantCombatInstance,instantCombatMap,usesArenaWorld:id=>isArenaInstance(id)||isInstantCombatInstance(id),isHostilePlayer,isHostileTarget,combatCompanionOwner,isRaidInstance,RAID_BOUNDS,HEARTHLING_NPC,isArenaInstance,ARENA_BOUNDS,ARENA_ENTRANCE, canSupportPlayer, tameableKind, combatCompanionStats, ROOTVAULT_GUARDIAN,
  combatStats, canTraverse, dungeonBounds, WORLD_BOUNDS, colliders:[],
  setAutoAttack:target=>autoAttackStops.push(target), modalOpen: () => false, connected: true, worldReady: true,
  player: { hp: 100, level: 20, get appearance(){return attackRuntime.appearance;}, talents:[], equipment:{}, learnedSpells:Object.keys(SPELLS), combatCompanion:{hp:100,level:1,x:2,z:0} }, worldInstance: null,
  jump:{grounded:true,y:0},jumpFloor:()=>0,isMoving:false,players:[ally],cancelledCast:-1,
  waterAt: () => false, position: origin, performance, lastPrimary: -10000, serverOffset: 0,
  SPELLS, castLabel, abilityValid, abilityUnlocked, spellCastTimeMs, legacyAbility, GLOBAL_ATTACK_MS, hotbar: { predictCast() {} },
  selectedId: foe.id, hoveredId: null, targetPoints: () => [foe], chooseTarget, enemies: [foeEnemy], appearance: { className: 'Mage' },
  standUp() {},cancelGathering() {}, worldZone: 'greenwood', send: message => attackSent.push(message), toast() {},
  document: { querySelector: () => ({ classList: { add() {}, remove() {} } }) }, setTimeout() {},
};
const swimmingFunction = main.match(/^function currentWorldBounds.*$/m)[0]+'\n'+main.match(/^function localSwimming.*$/m)[0];
runInNewContext(stripTypeScriptTypes(swimmingFunction + '\n' + main.slice(main.indexOf('function act('), main.indexOf('function closePanel('))), attackRuntime);
attackRuntime.act('attack');
assert.equal(attackSent.map(message => message.type).join(','), 'move,attack', 'the shore position reaches the server before drawing a weapon');
attackSent.length = 0; attackRuntime.player.casting = { ability:'mount', mount:'horse', startedAt:1000, endsAt:3000 }; const castToasts = []; attackRuntime.toast = message => castToasts.push(message);
attackRuntime.act('attack'); assert.equal(attackSent.length, 0); assert.equal(castToasts.at(-1), `Already casting ${castLabel(attackRuntime.player.casting)}.`, 'mount preparation safely blocks overlapping spells'); attackRuntime.player.casting = null;
attackRuntime.waterAt = () => true; attackSent.length = 0;
attackRuntime.act('special');
assert.equal(attackSent.length, 0, 'swimming keeps weapons stowed without starting an attack');
attackRuntime.jump.y=1;attackRuntime.lastPrimary=-10000;attackRuntime.act('attack');
assert.equal(attackSent.map(message=>message.type).join(','),'move,attack','standing above water permits an attack');
attackRuntime.jump.y=0;
attackRuntime.waterAt = () => false;
for (const spell of Object.values(SPELLS)) {
  attackRuntime.appearance.className = spell.className; attackRuntime.lastPrimary = -10000;
  attackRuntime.player.level=spell.requiredLevel;attackRuntime.player.talents=spell.requiredTalent?[spell.requiredTalent]:[];attackRuntime.selectedId=spell.targetRelation==='hostile'?foe.id:spell.targetRelation==='friendly'?ally.id:null;
  attackRuntime.player.abilityCooldowns = {}; foe.x = foeEnemy.x = ally.x = attackRuntime.player.combatCompanion.x = spell.range; attackSent.length = 0;
  attackRuntime.act(spell.id);
  assert.equal(attackSent[1]?.ability, spell.id, `${spell.label} dispatches its actual ability ID at its catalog range`);
  assert.equal(attackSent[1]?.targetId, spell.targeting==='radial'?undefined:spell.targetRelation==='hostile'?foe.id:spell.targetRelation==='friendly'?ally.id:undefined);
  if(spell.targetRelation==='hostile'&&spell.targeting!=='radial')assert(attackSent[0].rotation > 1.5 && attackSent[0].rotation < 1.6, 'the final movement faces the intended enemy before casting');
  attackRuntime.lastPrimary = -10000; attackSent.length = 0; foe.x = foeEnemy.x = ally.x = attackRuntime.player.combatCompanion.x = spell.range + .01;
  if(spell.targetRelation!=='self'&&spell.targeting!=='radial'){attackRuntime.act(spell.id); assert.equal(attackSent.length, 0, 'catalog range cannot be bypassed by a new ability');}
  foe.x = foeEnemy.x = ally.x = attackRuntime.player.combatCompanion.x = 1; attackRuntime.player.abilityCooldowns[spell.id] = Date.now() + 10000;
  attackRuntime.act(spell.id); assert.equal(attackSent.length, 0, 'authoritative per-ability cooldowns block another cast');
  attackRuntime.player.abilityCooldowns = {}; attackRuntime.player.level = spell.requiredLevel - 1; attackRuntime.lastPrimary = -10000;
  attackRuntime.act(spell.id); assert.equal(attackSent.length, 0, `${spell.label} cannot bypass its unlock level through the named action path`);
  assert.equal(attackRuntime.lastPrimary, -10000, 'a locked spell does not consume the global attack timer');
  attackRuntime.player.level = spell.requiredLevel;
  attackRuntime.act(spell.id); assert.equal(attackSent[1]?.ability, spell.id, `${spell.label} is immediately castable at its unlock level`);
  attackRuntime.player.level = 20; attackSent.length = 0;
}
// Beastmaster abilities add creature and companion requirements to the shared dispatch guards.
attackRuntime.appearance.className='Ranger';attackRuntime.player.level=20;
attackRuntime.player.talents=[SPELLS['tame-beast'].requiredTalent];attackRuntime.player.abilityCooldowns={};
for(const [label,changes] of [
  ['dead creature',{alive:false}],['world boss',{worldBoss:true}],['dungeon boss',{dungeonBoss:true}],
  ['Rootvault guardian',{id:ROOTVAULT_GUARDIAN.id}],['boss species without a flag',{kind:'briarhorn-elder'}],
  ['dungeon boss species without a flag',{kind:'broodmother-vex'}],['training dummy',{kind:'training-dummy'}],
  ['unknown species',{kind:'missing-creature'}],['higher-level creature',{level:21}],
]){
  const enemy={...foeEnemy,...changes};attackRuntime.enemies=[enemy];attackRuntime.selectedId=enemy.id;
  attackRuntime.targetPoints=()=>[{...foe,id:enemy.id}];attackRuntime.lastPrimary=-10000;attackSent.length=0;autoAttackStops.length=0;
  attackRuntime.act('tame-beast');
  assert.equal(attackSent.length,0,`Tame Beast cannot dispatch against a ${label}`);
  assert.equal(attackRuntime.lastPrimary,-10000,'ineligible taming does not consume the global cooldown');
  assert.equal(autoAttackStops.length,0,'ineligible taming does not cancel the current auto attack');
}
attackRuntime.enemies=[foeEnemy];attackRuntime.targetPoints=()=>[foe];attackRuntime.selectedId=foe.id;
attackRuntime.lastPrimary=-10000;attackSent.length=0;autoAttackStops.length=0;
attackRuntime.act('tame-beast');assert.equal(attackSent[1]?.ability,'tame-beast');
assert.equal(attackSent[1]?.targetId,foe.id);assert.deepEqual(autoAttackStops,[null],'valid taming calls off auto attacks before starting the cast');
attackRuntime.player.talents=[SPELLS['combined-assault'].requiredTalent];
for(const companion of [null,{hp:0,level:1,x:foe.x,z:0}]){
  attackRuntime.player.combatCompanion=companion;attackRuntime.lastPrimary=-10000;attackSent.length=0;
  attackRuntime.act('combined-assault');assert.equal(attackSent.length,0,'Combined Assault requires a living companion');
  assert.equal(attackRuntime.lastPrimary,-10000,'invalid companion state does not consume the global cooldown');
}
attackRuntime.player.combatCompanion={hp:100,level:1,x:foe.x+12,z:0};attackRuntime.lastPrimary=-10000;attackSent.length=0;
attackRuntime.act('combined-assault');assert.equal(attackSent.length,0,'Combined Assault cannot command a companion outside melee range');
attackRuntime.player.combatCompanion.x=foe.x+2;attackRuntime.lastPrimary=-10000;
attackRuntime.act('combined-assault');assert.equal(attackSent[1]?.ability,'combined-assault','Combined Assault accepts a companion already in melee range');
attackRuntime.appearance.className='Ranger';attackRuntime.player.level=37;attackRuntime.player.talents=[SPELLS.twinshot.requiredTalent];
attackRuntime.player.abilityCooldowns={};attackRuntime.player.combatTalents={heat:0,heatUntil:0,twinshotReadyUntil:Date.now()+10000};
attackRuntime.lastPrimary=-10000;attackRuntime.isMoving=true;attackSent.length=0;
attackRuntime.act('twinshot');assert.equal(attackSent[1]?.ability,'twinshot','an instant Twinshot proc is usable while moving');
attackRuntime.player.combatTalents.twinshotReadyUntil=0;attackRuntime.lastPrimary=-10000;attackSent.length=0;
attackRuntime.act('twinshot');assert.equal(attackSent.length,0,'an expired proc restores the stand-still requirement');
attackRuntime.isMoving=false;delete attackRuntime.player.combatTalents;
attackRuntime.appearance.className='Knight';attackRuntime.player.level=60;attackRuntime.player.talents=[SPELLS['powerful-throw'].requiredTalent];attackRuntime.isMoving=true;attackRuntime.lastPrimary=-10000;attackSent.length=0;
assert.equal(attackRuntime.act('powerful-throw'),true,'a held shield cast can begin while moving');assert.equal(attackSent[1]?.ability,'powerful-throw');attackRuntime.isMoving=false;
for(const selected of [null,'friendly-npc',foe.id]){
 attackRuntime.targetPoints=()=>[foe,{...foe,id:'friendly-npc',kind:'npc'}];attackRuntime.selectedId=selected;attackRuntime.hoveredId=foe.id;attackRuntime.lastPrimary=-10000;attackSent.length=0;
 attackRuntime.act('taunt');assert.equal(attackSent[1]?.ability,'taunt');assert.equal(attackSent[1]?.targetId,selected===foe.id?foe.id:undefined,'Taunt leaves automatic ally-attacker acquisition to the server when no hostile is explicitly selected');
}
attackSent.length=0;
for (const className of ['Ranger','Knight','Mage','Cleric']) {
  attackRuntime.appearance.className=className;const special=legacyAbility(className,true);attackRuntime.player.level=SPELLS[special].requiredLevel-1;
  attackRuntime.player.abilityCooldowns={};attackRuntime.lastPrimary=-10000;attackRuntime.act('special');assert.equal(attackSent.length,0,'legacy specials obey the same level requirement');
}
attackRuntime.player.level=20;
attackRuntime.appearance.className = 'Mage'; attackRuntime.player.abilityCooldowns = {}; attackRuntime.act('shield-bash');
assert.equal(attackSent.length, 0, 'a hotbar cannot cast another class’s ability');
for (const kind of ['player','npc']) {
  const friendly={...nearby,id:`friendly-${kind}`,kind};
  attackRuntime.targetPoints=()=>[friendly,foe];attackRuntime.selectedId=friendly.id;attackRuntime.hoveredId=foe.id;attackRuntime.lastPrimary=-10000;
  attackSent.length=0;attackRuntime.act('attack');
  assert.equal(attackSent.length,0,`an explicitly selected ${kind} cannot silently redirect an offensive spell to a nearby enemy`);
  assert.equal(attackRuntime.selectedId,friendly.id);assert.equal(attackRuntime.lastPrimary,-10000,'invalid friendly targets do not consume a cooldown');
  Object.assign(attackRuntime.player,{hp:50,maxHp:100,inventory:{potion:1}});attackRuntime.tone=()=>{};
  attackRuntime.act('heal');assert.equal(attackSent[0]?.type,'heal','friendly target selection still permits healing potions');
}
attackRuntime.selectedId=null;attackRuntime.hoveredId=null;attackRuntime.lastPrimary=-10000;attackSent.length=0;
attackRuntime.act('attack');assert.equal(attackSent[1]?.targetId,foe.id,'without an explicit friendly selection, the nearest hostile fallback still works');

// A selected foe behind a real level-50 dungeon pillar cannot lock out nearby attackers.
const stuck={...foe,id:'stuck',x:-8,z:-62}, attacker={...foe,id:'attacker',x:-6,z:-54};
const dungeonAttack={...attackRuntime,position:{x:-8,z:-54},worldInstance:'veilhaven-test',dungeon:{kind:'veilhaven'},
  player:{...attackRuntime.player,get appearance(){return dungeonAttack.appearance;},id:'self',instanceId:'veilhaven-test',level:60},players:[],colliders:dungeonColliders([],[],'veilhaven'),
  targetPoints:()=>[stuck,attacker],enemies:[{...foeEnemy,...stuck,kind:'moss-slime'}],hoveredId:null};
runInNewContext(stripTypeScriptTypes(swimmingFunction+'\n'+main.slice(main.indexOf('function act('),main.indexOf('let characterView:'))),dungeonAttack);
const dungeonCast=(ability='fireball')=>{dungeonAttack.selectedId=stuck.id;dungeonAttack.lastPrimary=-10000;attackSent.length=0;dungeonAttack.act(ability);};
assert(!canTraverse(dungeonAttack.position,stuck,dungeonAttack.colliders,dungeonBounds('veilhaven')),'fixture places selected foe behind the pillar');
assert(canTraverse(dungeonAttack.position,attacker,dungeonAttack.colliders,dungeonBounds('veilhaven')),'nearby attacker is reachable');
for(const className of ['Ranger','Knight','Mage','Cleric'])for(const z of [-62,-90]){
 dungeonAttack.appearance={className};stuck.z=z;dungeonCast(legacyAbility(className));
 assert.equal(attackSent[1]?.targetId,attacker.id,'blocked or distant selected foe falls back to a reachable monster');
 assert.equal(dungeonAttack.selectedId,attacker.id,'the target frame follows the spell target');
}
dungeonAttack.appearance={className:'Mage'};
stuck.x=-5;stuck.z=-54;dungeonCast();assert.equal(attackSent[1]?.targetId,stuck.id,'an attackable selection wins over a closer monster');
stuck.x=-8;stuck.z=-60;attacker.x=0;dungeonAttack.selectedId=null;dungeonAttack.lastPrimary=-10000;attackSent.length=0;
dungeonAttack.act('fireball');assert.equal(attackSent[1]?.targetId,attacker.id,'automatic spell targeting skips a nearer monster behind cover');attacker.x=-6;
stuck.x=-8;stuck.z=-62;dungeonAttack.targetPoints=()=>[stuck];dungeonCast();
assert.equal(attackSent.length,0,'a pillar still blocks spells when no reachable foe exists');assert.equal(dungeonAttack.lastPrimary,-10000);
dungeonAttack.targetPoints=()=>[stuck,attacker];dungeonAttack.appearance={className:'Ranger'};
dungeonAttack.player.talents=[SPELLS['tame-beast'].requiredTalent];dungeonCast('tame-beast');
assert.equal(attackSent.length,0,'taming never silently switches to a different creature');
dungeonAttack.appearance={className:'Mage'};dungeonAttack.player.pvp=true;
for(const kind of ['player','companion']){
 stuck.kind=kind;stuck.id=kind==='player'?'opponent':'companion:opponent';
 dungeonAttack.players=[{id:'opponent',hp:100,pvp:true,instanceId:dungeonAttack.worldInstance,combatCompanion:{hp:100,x:stuck.x,z:stuck.z}}];
 dungeonCast();assert.equal(attackSent.length,0,'an explicit PvP target never redirects to a nearby monster');
}

// Both Instant Combat arenas extend north of the default dungeon's spell-targeting bounds.
for(const mapId of ['bone-pit','void-rift']){
 const map=instantCombatMap(mapId),position={x:-9.5,z:31.8},target={...foe,id:'instant-combat-foe',kind:'enemy',x:-8.5,z:31.8};
 assert(canTraverse(position,target,map.colliders,map.bounds),'the arena fixture has a clear spell path');
 assert(!canTraverse(position,target,map.colliders,dungeonBounds()),'the same path lies outside the default dungeon bounds');
 const arenaAttack={...attackRuntime,position,dungeon:null,worldInstance:'instant-combat-test',instantCombat:{run:{mapId}},colliders:map.colliders,
  player:{...attackRuntime.player,get appearance(){return arenaAttack.appearance;},hp:100,level:60,abilityCooldowns:{}},players:[],appearance:{className:'Mage'},
  targetPoints:()=>[target],selectedId:target.id,hoveredId:null,lastPrimary:-10000};
 runInNewContext(stripTypeScriptTypes(swimmingFunction+'\n'+main.slice(main.indexOf('function act('),main.indexOf('let characterView:'))),arenaAttack);
 attackSent.length=0;arenaAttack.act('fireball');
 assert.equal(attackSent[1]?.targetId,target.id,`${mapId} spells reach foes within the authored arena bounds`);
}

// Every caster-centered area spell works without consulting or changing selection.
attackRuntime.enemies=[];attackRuntime.players=[{...ally,hp:0,x:500}];
attackRuntime.targetPoints=()=>{throw Error('Radial spells must not look for a target');};
for(const spell of Object.values(SPELLS).filter(spell=>spell.targeting==='radial'))for(const selected of [null,'missing',ally.id,foe.id]){
  attackRuntime.appearance.className=spell.className;attackRuntime.player.level=60;attackRuntime.player.talents=spell.requiredTalent?[spell.requiredTalent]:[];
  attackRuntime.player.abilityCooldowns={};attackRuntime.lastPrimary=-10000;
  attackRuntime.selectedId=selected;attackRuntime.rotation=.37;attackSent.length=0;
  attackRuntime.act(spell.id);
  assert.equal(attackSent.map(message=>message.type).join(','),'move,attack',`${spell.label} casts in empty space`);
  assert.equal(attackSent[1].ability,spell.id);assert.equal(attackSent[1].targetId,undefined);
  assert.equal(attackSent[0].rotation,.37,'area spells keep the player facing');
  assert.equal(attackRuntime.selectedId,selected,'area spells preserve the current selection');
  attackRuntime.act(spell.id);assert.equal(attackSent.length,2,'target-free casts still obey the global cooldown');
}

// Run the real target HUD updater: unchanged target identity and health must not
// prevent a level change from repainting its text or relative danger color.
const targetElements = new Map();
const targetElement = id => {
  if (!targetElements.has(id)) targetElements.set(id, {textContent:'',hidden:false,dataset:{},style:{},attributes:{},setAttribute(key,value){this.attributes[key]=value;},toggleAttribute(key,on){if(on)this.attributes[key]='';else delete this.attributes[key];}});
  return targetElements.get(id);
};
let uiPoint={id:'level-target',kind:'enemy',name:'Bramble wolf',label:'Attack Bramble wolf',x:1,z:0,height:2};
const uiEnemy={id:uiPoint.id,level:7,hp:80,maxHp:100,worldBoss:false};
const targetUI={loot:[],players:[],bindingLabel,isHostilePlayer,isHostileTarget,combatCompanionOwner,isRaidInstance,RAID_BOUNDS,HEARTHLING_NPC,isArenaInstance,ARENA_BOUNDS,ARENA_ENTRANCE,zoneHandle:undefined,THREE,$:targetElement,player:{hp:100,level:10,skills:{}},connected:true,worldReady:true,modalOpen:()=>false,cancelledGather:0,
  pointerInWorld:false,dragging:false,lastHover:0,lastTargetText:'',hoveredId:null,selectedId:uiPoint.id,position:origin,targetPoints:()=>[uiPoint],chooseTarget,
  nodes:[],enemies:[uiEnemy],dungeon:null,worldInstance:null,RESOURCE_TYPES,canvas:{style:{}},surfaceHeight:()=>0,
  targetRing:new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial()),monsterAttackNames:{pulse:'Thunder Pulse'},
};
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function monsterDanger('),main.indexOf('function playerNameplate('))),targetUI);
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function updateTarget('),main.indexOf("$('target-action').onclick"))),targetUI);
for(const [level,danger] of [[7,'easy'],[8,'equal'],[12,'equal'],[13,'tough'],[14,'tough'],[15,'dangerous']]){
  uiEnemy.level=level;targetUI.updateTarget(100);
  assert.equal(targetElement('target-name').textContent,uiPoint.name);
  assert.equal(targetElement('target-hud').dataset.danger,danger,`enemy/player level gap ${level-10} has the intended danger band`);
  assert(targetElement('target-detail').textContent.includes(`Level ${level} · 80 / 100 health`));
  assert.equal(targetElement('target-detail').textContent.includes('Dangerous'),danger==='dangerous','overleveled targets have a word warning as well as color');
}
targetUI.player.level=13;targetUI.updateTarget(100);
assert.equal(targetElement('target-hud').dataset.danger,'equal');assert(!targetElement('target-detail').textContent.includes('Dangerous'),'leveling up refreshes the same target without waiting for health changes');
targetUI.player.level=20;Object.assign(uiEnemy,{level:30,hp:1500,maxHp:4000,worldBoss:true,attack:{id:'boss-pulse',style:'pulse'}});uiPoint={...uiPoint,name:'Stormhorn Behemoth'};targetUI.updateTarget(100);
for(const text of ['Level 30','World boss','1500 / 4000 health','Dangerous','Enraged','Thunder Pulse'])assert(targetElement('target-detail').textContent.includes(text),`boss target detail preserves ${text}`);
uiPoint={...uiPoint,id:'quest-board',kind:'board',name:'Quest board'};targetUI.selectedId=uiPoint.id;targetUI.enemies=[];targetUI.updateTarget(100);
assert.equal(targetElement('target-detail').textContent,'Quests and rewards');assert.equal(targetElement('target-hud').dataset.danger,undefined,'non-enemy targets restore their original colors');
targetUI.selectedId=null;targetUI.hoveredId=uiPoint.id;targetUI.updateTarget(200);
assert.equal(targetUI.targetRing.visible,false,'hovering a nearby object never shows the selection ring');assert.equal(targetElement('target-hud').hidden,true);assert.equal(targetUI.selectedId,null);
targetUI.hoveredId=null;targetUI.updateTarget(300);assert.equal(targetUI.targetRing.visible,false,'standing next to an object never selects it');
targetUI.player.gathering={nodeId:uiPoint.id,startedAt:1,endsAt:Date.now()+1000};targetUI.serverOffset=0;targetUI.updateTarget(400);
assert.equal(targetUI.targetRing.visible,true,'an active gathering action keeps its own ring without assigning a selection');assert.equal(targetUI.selectedId,null);
targetUI.cancelledGather=1;targetUI.updateTarget(500);assert.equal(targetUI.targetRing.visible,false,'canceling gathering removes its transient ring');
targetUI.selectedId=uiPoint.id;targetUI.player.hp=0;targetUI.updateTarget(600);assert.equal(targetUI.selectedId,null,'death clears the current selection');targetUI.player.hp=100;
targetUI.selectedId='missing';targetUI.updateTarget(700);assert.equal(targetUI.selectedId,null,'unavailable targets clear without choosing a nearby replacement');
const dungeonPanels=[];const dungeonUI={isInstantCombatInstance,loadDungeonLeaderboard(){},party:null,player:{},worldInstance:null,isRaidInstance,RAID_BOUNDS,HEARTHLING_NPC,isArenaInstance,dungeon:null,dungeonChoice:'rootvault',getDungeon,onboardingFeatureUnlocked,onboardingLockReason,toast(){},DUNGEON_STAGES,openPanel:(...args)=>dungeonPanels.push(args),renderDungeonPanel(){}};
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function allowFeature('),main.indexOf('function acknowledgeGuide('))),dungeonUI);
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function openDungeon('),main.indexOf('function renderDungeonPanel('))),dungeonUI);dungeonUI.openDungeon();
assert(dungeonPanels[0][1].includes(`LEVELS ${DUNGEON_STAGES[0].level}–${DUNGEON_STAGES.at(-1).level}`));assert(dungeonPanels[0][1].includes('1–4 ADVENTURERS'));
console.log('PASS: target levels, all danger boundaries, level-up refresh, non-color danger warning, boss health/enrage/casts, neutral target reset, and dungeon level-range copy.');

const disappearing = { bindingLabel, performance:{now:()=>0},
  worldInstance:null, position:origin, mountViews:new Map(), playerId:"local", disposeMount(){},
  loot: [], players: [], enemies: [], nodes: [], lootMeshes: new Map(), remote: new Map(), enemyMeshes: new Map(), nodeMeshes: new Map(),
  selectedId: 'expired-corpse', hoveredId: 'expired-corpse', waypoint:{x:50,z:60,label:'Explore',instanceId:null},
  targetPoints: () => [nearby],
};
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function syncEntities('), main.indexOf('let autoAttackTarget:'))), disappearing);
disappearing.syncEntities();
assert.equal(disappearing.selectedId, null); assert.equal(disappearing.hoveredId, null);
assert.deepEqual(disappearing.waypoint,{x:50,z:60,label:'Explore',instanceId:null},'expired loot clears its selection without canceling independent map guidance');
disappearing.selectedId=nearby.id;disappearing.syncEntities();assert.equal(disappearing.selectedId,nearby.id,'a still-available explicit selection is retained');
disappearing.targetPoints=()=>[];disappearing.syncEntities();assert.equal(disappearing.selectedId,null,'an absent target clears without choosing another object');

const lootMesh = new THREE.Group();
const lootLabel = { classList: { add() {} }, remove() {} };
const killed = { ...disappearing, deathProgress:catalog.deathProgress, THREE, surfaceHeight, selectedId: 'defeated-enemy', hoveredId: null,
  loot: [{ id: 'new-remains', enemyId: 'defeated-enemy', kind: 'moss-slime', name: 'Woodland slime', x: 0, z: 0, gold: 8, relic: 0 }],
  lootMeshes: new Map(), scene: { add() {} }, removeRig() {}, makeLootRemains: () => lootMesh, label: () => lootLabel,
  targetPoints: () => [{ ...nearby, id: 'new-remains', kind: 'loot' }],
};
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function syncEntities('), main.indexOf('let autoAttackTarget:'))), killed);
killed.syncEntities();
assert.equal(killed.selectedId, null, 'a selected kill clears without automatically selecting remains');
killed.selectedId='new-remains';
killed.targetPoints = () => [{ ...nearby, id: 'defeated-enemy', kind: 'enemy' }, { ...nearby, id: 'new-remains', kind: 'loot' }];
killed.syncEntities();
assert.equal(killed.selectedId, 'new-remains', 'a respawned enemy does not steal the selected corpse');
killed.selectedId = 'garden-cache'; killed.loot[0].sourceObjectId = 'garden-cache'; killed.loot[0].id = 'cache-contents';
killed.targetPoints = () => [{ ...nearby, id: 'garden-cache', kind: 'dungeon' }, { ...nearby, id: 'cache-contents', kind: 'loot' }];
killed.syncEntities();
assert.equal(killed.selectedId, 'cache-contents', 'opening a chest selects its personal treasure for the next manual loot action');

// Right-click uses the same guarded action and interaction code as E, with an explicit clicked target.
let rightClick, clicked=nearby, clickedPlayer, menuClosed=0;
const menuOpened=[];
Object.assign(runtime,{AUTO_ATTACKS,jump:{y:0,grounded:true},jumpFloor:()=>0,waterAt:()=>false,player:{hp:100,appearance:{className:'Ranger'}},worldReady:true,modalOpen:()=>false,appearance:{className:'Ranger'},abilityValid,
  autoAttackTarget:null,lastAutoAttackRequest:-Infinity,enemies:[],
  pickPlayer:()=>clickedPlayer,pickTarget:()=>clicked,openPlayerMenu:(...args)=>menuOpened.push(args),playerMenu:{close:()=>menuClosed++},
  canvas:{addEventListener:(type,handler)=>{assert.equal(type,'contextmenu');rightClick=handler;}},pointerInWorld:true});
runInNewContext(stripTypeScriptTypes(swimmingFunction+'\n'+main.slice(main.indexOf('function act('),main.indexOf('let characterView:'))),runtime);
const autoAttackFunctions=main.slice(main.indexOf('function setAutoAttack('),main.indexOf('function clearCombat('));
runInNewContext(stripTypeScriptTypes(autoAttackFunctions),runtime);
const rightStart=main.indexOf("canvas.addEventListener('contextmenu',");
runInNewContext(stripTypeScriptTypes(main.slice(rightStart,main.indexOf("canvas.addEventListener('wheel'",rightStart))),runtime);
const right=()=>{const event={clientX:100,clientY:120,preventDefault(){this.prevented=true;}};rightClick(event);assert(event.prevented);};
for(const kind of ['node','loot','npc','beacon','board','workshop','dungeon']){
  clicked={...nearby,id:`${kind}-greenwood`,kind};runtime.targetPoints=()=>[nearby,clicked];runtime.selectedId=nearby.id;runtime.hoveredId=nearby.id;
  if(kind==='loot')runtime.loot=[{...corpseDrop,id:clicked.id}];
  runtime.position=origin;runtime.dungeon=null;sent.length=0;const panels=opened.length,lootPanels=openedLoot.length;right();
  assert.equal(runtime.selectedId,clicked.id,'right-click targets the clicked object, not a previous selection');assert.equal(runtime.hoveredId,null);
  const action={node:'gather',npc:'interact',beacon:'interact'}[kind];
  if(action){assert.equal(sent.at(-1)?.type,action);assert.equal(sent.at(-1)?.targetId,clicked.id);assert.equal(sent.at(-2)?.type,'move');}
  else if(kind==='loot'){assert.equal(openedLoot.length,lootPanels+1);assert.equal(openedLoot.at(-1),runtime.loot[0]);assert.deepEqual(sent.map(message=>message.type),['cancelGather','move'],'right-click opens loot without automatic collection');}
  else assert.equal(opened.length,panels+1,`${kind} opens its existing window`);
  assert.deepEqual(runtime.position,origin,'right-click never walks the player');
  clicked.x=3.01;sent.length=0;const before=opened.length,beforeLoot=openedLoot.length;right();assert.equal(sent.length,0);assert.equal(opened.length,before,'distant right-click cannot open a station or fall back to a nearby resource');assert.equal(openedLoot.length,beforeLoot,'distant right-click cannot open a loot window');
}
clicked={...nearby,id:'clicked-monster',kind:'enemy',alive:true,hp:100,instanceId:null};runtime.enemies=[clicked];runtime.targetPoints=()=>[clicked];sent.length=0;right();
assert.equal(runtime.selectedId,clicked.id);assert.equal(sent.length,1);assert.equal(sent[0].type,'autoAttack');assert.equal(sent[0].targetId,clicked.id,'right-click starts basic attacks on the clicked monster without casting or walking');
runtime.setAutoAttack(null);sent.length=0;
clicked=undefined;runtime.targetPoints=()=>[nearby];runtime.selectedId=nearby.id;right();assert.equal(sent.length,0,'empty ground never interacts with the selected or nearest object');
clicked={...healer,kind:'npc'};runtime.targetPoints=()=>[clicked];runtime.position={x:-27.25,z:105.5};right();assert.equal(sent.length,0,'blocked right-click preserves the same route guard as E');
runtime.position=origin;clicked={...nearby,id:'boundary',x:3};runtime.targetPoints=()=>[clicked];right();assert.equal(sent.at(-1)?.targetId,clicked.id,'right-click includes the exact 3m boundary');
clickedPlayer={id:'other-player'};sent.length=0;const previousSelection=runtime.selectedId;right();
assert.equal(menuOpened.at(-1)?.[0],clickedPlayer);assert.deepEqual(menuOpened.at(-1)?.slice(1),[100,120]);assert.equal(sent.length,0,'player right-click opens options without dispatching a world interaction');assert.equal(runtime.selectedId,previousSelection);
clickedPlayer=undefined;assert(menuClosed>0);
for(const [field,value] of [['connected',false],['worldReady',false],['modalOpen',()=>true]]){
 const saved=runtime[field];runtime[field]=value;const menus=menuClosed;right();assert.equal(menuClosed,menus);assert.equal(sent.length,0,`${field} guards right-click`);runtime[field]=saved;
}
runtime.player.hp=0;right();assert.equal(sent.length,0,'dead players cannot interact through right-click');runtime.player.hp=100;

// Exercise the shipped pointer and keyboard handlers, followed by the actual movement branch.
let pointerUp, keyDown, pickedPoint=nearby, pickedPlayer;
const inputs={specialistNftUI:undefined,worldLoading:false,gameKey,bindingLabel,heldKeyCodes:new Map(),isHostilePlayer,isHostileTarget,combatCompanionOwner,isRaidInstance,RAID_BOUNDS,HEARTHLING_NPC,isArenaInstance,ARENA_BOUNDS,ARENA_ENTRANCE,dragging:true,dragDistance:0,modalOpen:()=>false,connected:true,selectedId:null,hoveredId:null,
  position:{x:0,z:0},waypoint:{x:100,z:50,instanceId:null},keys:new Set(),
  canvas:{addEventListener:(event,callback)=>{assert.equal(event,'pointerup');pointerUp=callback;}},pickTarget:()=>pickedPoint,pickPlayer:()=>pickedPlayer,
  send:()=>assert.fail('clicking or selecting cannot dispatch gameplay'),act:()=>assert.fail('clicking cannot interact or attack')};
const pointerStart=main.indexOf("canvas.addEventListener('pointerup',");
runInNewContext(stripTypeScriptTypes(main.slice(pointerStart,main.indexOf("canvas.addEventListener('pointercancel'",pointerStart))),inputs);
const pointerEvent={clientX:100,clientY:100};pointerUp(pointerEvent);
assert.equal(inputs.selectedId,nearby.id);assert.deepEqual(inputs.position,origin);assert.equal(inputs.keys.size,0);
inputs.dragging=true;pickedPlayer={id:'friend'};pointerUp(pointerEvent);assert.equal(inputs.selectedId,'friend','left-click selects the player in front of other targets');pickedPlayer=undefined;
inputs.dragging=true;pickedPoint=undefined;pointerUp(pointerEvent);assert.equal(inputs.selectedId,null,'empty ground clears selection without walking');
inputs.dragging=true;inputs.dragDistance=7;inputs.selectedId=nearby.id;pointerUp(pointerEvent);assert.equal(inputs.selectedId,nearby.id,'orbit gestures preserve the selection');
class Element {};
let cancelled=0,keyboardAction;
Object.assign(inputs,{player:{},HTMLElement:Element,HTMLInputElement:class extends Element{},HTMLSelectElement:class extends Element{},HTMLTextAreaElement:class extends Element{},HTMLButtonElement:class extends Element{},
  gmFlying:()=>false,nftUI:{isOpen:()=>false},storeUI:{isOpen:()=>false},achievementsUI:{isOpen:()=>false},friendsUI:{isOpen:()=>false}, pollUI: { isOpen: () => false },gmUI:{isOpen:()=>false},bankUI:{isOpen:()=>false},
  autoAttackTarget:null,lastAutoAttackRequest:-Infinity,performance,
  window:{addEventListener:(event,callback)=>{assert.equal(event,'keydown');keyDown=callback;}},panel:{open:false,contains:()=>false},
  cancelGathering:()=>cancelled++,act:action=>keyboardAction=action,hotbar:{activateSlot(){}},lootUI:{isOpen:()=>false,close(){}},floatingPanel:()=>false});
const keyStart=main.indexOf("window.addEventListener('keydown',");
runInNewContext(stripTypeScriptTypes(autoAttackFunctions),inputs);
runInNewContext(stripTypeScriptTypes(main.slice(keyStart,main.indexOf('const canUseMobile=',keyStart))),inputs);
const keyEvent=key=>({key,target:null,repeat:false,preventDefault(){}});
keyDown(keyEvent('w'));assert(inputs.keys.has('w'));assert.equal(cancelled,1,'manual movement cancels gathering');
assert.equal(inputs.selectedId,nearby.id,'moving does not silently replace the selected object');
keyDown(keyEvent('e'));assert.equal(keyboardAction,'gather','E dispatches the manual nearby-interaction path');
const marked=inputs.waypoint;keyDown(keyEvent('Escape'));assert.equal(inputs.selectedId,null);assert.equal(inputs.waypoint,marked,'Escape clears selection while preserving independently set guidance');
const motion={instantCombat:null,instantCombatHUD:{update(){}},renderInstantCombatMenu(){},updateDungeonTimer(){},pollUI:{refresh(){}},auctionUI:{refresh(){}},storeUI:{refresh(){}},updateStoreBoostHud(){},bankUI:{refresh(){}},updateZeppelinTravel(){},gmFlying:()=>false,rosterActive:false,entryActive:false,standUp(){},updateCastingBar(){},cancelledCast:0,cancelCasting(){},position:{x:0,z:0},keys:new Set(),waypoint:marked,selectedId:nearby.id,
  performanceHud:{frame(){}},customizer:{open:false},atlas:null,document:{hidden:false},socket:null,WebSocket:{OPEN:1},nftUI:{refresh(){}},treasureUI:{refresh(){}},goldMerchantUI:{refresh(){}},
  mobileWindows:[],updateAutoGraphics:()=>false,applyGraphics(){},autoGraphicsStatus:()=>'',lastGraphicsStatus:'',
  requestAnimationFrame(){},hotbar:{updateCooldowns(){}},serverOffset:0,previous:0,elapsed:0,panel:{open:false},
  connected:true,worldReady:true,updateDungeonRoomView(){},modalOpen:()=>false,player:{hp:100},yaw:0,travelSpeed:()=>7,freeAt:()=>true,SPRINT_SPEED:10,
  jump:{y:0,grounded:true},climbStopRequested:false,syncCollisionState(){},rotation:0,isMoving:false,sprintSinceMove:false};
const frameStart=main.indexOf('function frame('),movementEnd=main.indexOf(' localAvatar.visible=',frameStart);
runInNewContext(main.slice(main.indexOf('function releaseClimb('),main.indexOf('function tryJump(')),motion);
runInNewContext(stripTypeScriptTypes(main.slice(frameStart,movementEnd)+'\n}'),motion);
for(let now=50;now<=1000;now+=50)motion.frame(now);
assert.deepEqual(motion.position,origin,'selected objects and distant waypoints cannot move an idle player');assert.equal(motion.isMoving,false);
motion.keys.add('w');motion.frame(1050);assert.equal(motion.position.x,0);assert(Math.abs(motion.position.z+.35)<1e-8,'held movement keys drive actual frame movement');
motion.keys.clear();const stopped={...motion.position};motion.frame(1100);assert.deepEqual(motion.position,stopped,'releasing manual input stops movement while guidance remains');
assert.equal(motion.waypoint,marked);assert(!/\b(?:walkTo|walkPath|approachTarget|reachableApproach|pendingInteraction)\b/.test(main),'retired automatic movement state and entry points stay absent');
motion.keys.add('w');let arenaFrame=1100;
for(const [phase,state,allowed] of [['countdown',{pvp:false,arenaPhase:'countdown',arenaMatchId:'match-1'},false],['knocked out',{pvp:false,arenaPhase:'active',arenaMatchId:'match-1',arenaEliminated:true,hp:1},false],['active',{pvp:false,arenaPhase:'active',arenaMatchId:'match-1'},true],['safe',{pvp:false,arenaMatchId:null},true]]){
 motion.player={hp:100,...state};motion.position={...origin};motion.isMoving=true;motion.frame(arenaFrame+=50);
 assert.equal(motion.isMoving,allowed,`${phase} controls local movement prediction`);assert(Math.abs(motion.position.z-(allowed?-.35:0))<1e-8,`${phase} permits only movement the server accepts`);
}
motion.keys.clear();motion.position={...origin};motion.touchMove={x:.5,y:0};motion.keys.add('touch-move');motion.frame(arenaFrame+=50);
const halfStep=motion.position.x;motion.keys.clear();motion.frame(arenaFrame+=50);
assert(Math.abs(halfStep-.175)<1e-8&&motion.position.x===halfStep&&motion.position.z===0&&!motion.isMoving,'half joystick displacement produces half-speed movement, and clearing input stops it');

assert.throws(() => makeResource('timber'), /Load the gathering kit/);
// Exercise the retained legacy tree fallback separately from the authored gathering kit.
const timberModel = RESOURCE_TYPES.timber.model; delete RESOURCE_TYPES.timber.model;
assert.throws(() => makeResource('timber'), /Load WoodlandOak/);
assert.throws(() => setResourceTreeAssets(new THREE.Group()), /Missing single-mesh/);
const treeBytes = readFileSync(new URL('../public/models/giant-trees.glb', import.meta.url));
const treeAsset = await new GLTFLoader().parseAsync(treeBytes.buffer.slice(treeBytes.byteOffset, treeBytes.byteOffset + treeBytes.byteLength), '');
const sourceTree = treeAsset.scene.getObjectByName('WoodlandOak'); assert(sourceTree?.isMesh);
const templates = [], cloneGeometry = sourceTree.geometry.clone.bind(sourceTree.geometry), cloneMaterial = sourceTree.material.clone.bind(sourceTree.material);
sourceTree.geometry.clone = () => { const copy = cloneGeometry(); templates.push(copy); return copy; };
sourceTree.material.clone = () => { const copy = cloneMaterial(); templates.push(copy); return copy; };
setResourceTreeAssets(treeAsset.scene);
const firstTree = makeResource('timber'), secondTree = makeResource('timber');
const firstCrown = firstTree.getObjectByName('WoodlandOak'), secondCrown = secondTree.getObjectByName('WoodlandOak');
assert.equal(firstTree.children.length, 2, 'timber uses one authored tree above its stump');
assert(Math.abs(new THREE.Box3().setFromObject(firstCrown).max.y - 3.1) < .005, 'authored timber preserves its gameplay height');
assert.equal(firstCrown.geometry.getAttribute('position').count, sourceTree.geometry.getAttribute('position').count, 'timber keeps the authored tree detail');
assert.notEqual(firstCrown.geometry, secondCrown.geometry); assert.notEqual(firstCrown.material, secondCrown.material);
assert.notEqual(firstCrown.geometry, sourceTree.geometry); assert.notEqual(firstCrown.material, sourceTree.material);
const disposed = new Set();
for (const resource of [...templates, sourceTree.geometry, sourceTree.material, ...firstTree.children.flatMap(mesh => [mesh.geometry, mesh.material]), ...secondTree.children.flatMap(mesh => [mesh.geometry, mesh.material])]) resource.addEventListener('dispose', () => disposed.add(resource));
const disposeNode = {};
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function removeNode('), main.indexOf('function replaceAvatar('))), Object.assign(disposeNode, { THREE }));
disposeNode.removeNode(firstTree);
for (const mesh of firstTree.children) assert(disposed.has(mesh.geometry) && disposed.has(mesh.material), 'the actual node cleanup releases only its own assets');
assert(!disposed.has(secondCrown.geometry) && !disposed.has(secondCrown.material));
assert(!disposed.has(sourceTree.geometry) && !disposed.has(sourceTree.material));
setResourceTreeAssets(treeAsset.scene);
assert(templates.slice(0, 2).every(resource => disposed.has(resource)), 'reloading tree assets releases the old owned template');
assert(!disposed.has(secondCrown.geometry) && !disposed.has(secondCrown.material), 'template replacement preserves active nodes');
showResource(secondTree, false); assert(secondTree.children.every(mesh => !mesh.visible), 'harvesting hides the tree and its stump');
showResource(secondTree, true); assert(secondTree.children.every(mesh => mesh.visible));
disposeNode.removeNode(secondTree);
RESOURCE_TYPES.timber.model = timberModel;

const gatheringBytes=readFileSync(new URL('../public/models/gathering-kit.glb',import.meta.url)),gatheringAsset=await new GLTFLoader().parseAsync(gatheringBytes.buffer.slice(gatheringBytes.byteOffset,gatheringBytes.byteOffset+gatheringBytes.byteLength),'');
const feedbackBytes=readFileSync(new URL('../public/models/world-feedback-kit.glb',import.meta.url)),feedbackAsset=await new GLTFLoader().parseAsync(feedbackBytes.buffer.slice(feedbackBytes.byteOffset,feedbackBytes.byteOffset+feedbackBytes.byteLength),'');
const originalLoad=GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync=async url=>{if(url==='/models/world-feedback-kit.glb')return feedbackAsset;assert.equal(url,'/models/gathering-kit.glb');return gatheringAsset;};
try{await loadGatheringAssets();}finally{GLTFLoader.prototype.loadAsync=originalLoad;}
for (const kind of Object.keys(RESOURCE_TYPES)) {
  const group = makeResource(kind);
  const parts = [...group.children];
  const geometry = new Set(parts.map(mesh => mesh.geometry));
  const materials = new Set(parts.map(mesh => mesh.material));
  // Fishing water has its own non-solid mesh alongside the authored support.
  assert.equal(geometry.size, RESOURCE_TYPES[kind].skill === 'fishing' ? 6 : kind === 'timber' || RESOURCE_TYPES[kind].model ? 2 : 1, `${kind} keeps node-owned geometry`);
  assert(parts.some(mesh => mesh.userData.harvestable) && parts.some(mesh => !mesh.userData.harvestable), `${kind} has both harvestable pieces and a base`);
  for (const available of [false, true, false, true]) {
    showResource(group, available);
    assert.deepEqual(group.children, parts, `${kind} reuses its geometry during depletion and regrowth`);
    for (const mesh of parts) assert.equal(mesh.visible, available, `${kind} disappears completely and returns on respawn`);
    group.updateMatrixWorld(true);
    group.traverse(node => assert(node.matrixWorld.elements.every(Number.isFinite), `${kind} keeps finite geometry`));
  }
  geometry.forEach(resource => resource.dispose());
  materials.forEach(resource => resource.dispose());
}
console.log('PASS: global station targets, dungeon isolation, manual selection, E and right-click interaction, player dropdown dispatch, waypoint shortcuts, explicit loot selection through respawn/expiry, movement-before-gather, hidden geometry, Blender timber, complete harvest disappearance, resource regrowth and isolated node/template disposal.');
