import { isRaidInstance, RAID_BOUNDS } from '../src/raid.ts';
import { HEARTHLING_NPC } from '../src/hearthling.ts';
import { POLL_BOOTHS } from '../src/poll-booths.ts';
import { CITY_SERVICE_NPCS } from '../src/city-services.ts';
import { isArenaInstance, ARENA_ENTRANCE } from '../src/arena.ts';
import { isHostilePlayer, isHostileTarget, combatCompanionOwner } from '../src/targeting.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import postcss from 'postcss';
import { ZONES } from '../src/content.ts';
import { VILLAGE_NPCS } from '../src/settlements.ts';
import { TRAINER_NPCS } from '../src/training.ts';
import { RESOURCE_TYPES } from '../src/skills.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { toWorld } from '../src/realm.ts';
import { DUNGEONS, DUNGEON_EXIT } from '../src/dungeon.ts';
import { BUILDING_CHAIRS, BUILDING_BEDS, buildingAt } from '../src/buildings.ts';
import { AUCTIONEER, DEED_AUCTIONEER, BANKER } from '../src/city.ts';
import { GOLD_MERCHANT } from '../src/gold-merchant.ts';
import { WORLD_CURIOS, RESOURCE_SITES } from '../src/world-features.ts';
import { ZEPPELIN_PORTS } from '../src/zeppelin.ts';

const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const css=postcss.parse(readFileSync(new URL('../src/cursors.css',import.meta.url),'utf8'));
const states=['default','point','attack','talk','mine','chop','harvest','loot','trade','craft','travel','grab'];
const variables=new Map();css.walkDecls(declaration=>{if(declaration.prop.startsWith('--cursor-'))variables.set(declaration.prop,declaration.value);});
assert.equal(variables.size,states.length);
for(const state of states){
 assert.match(variables.get(`--cursor-${state}`),new RegExp(`url\\(['"]?/ui/cursors/${state}\\.png['"]?\\) 4 4, \\w+`),'all native cursors retain a stable hotspot and fallback');
 const png=readFileSync(new URL(`../public/ui/cursors/${state}.png`,import.meta.url));
 assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.equal(png.readUInt32BE(16),48);assert.equal(png.readUInt32BE(20),48);assert.equal(png[25],6,'cursor assets retain RGBA transparency');
}
const rules=[];css.walkRules(rule=>rules.push(rule));
const pointing=rules.find(rule=>rule.nodes.some(node=>node.prop==='cursor'&&node.value==='var(--cursor-point)'));
assert(pointing);
for(const exclusion of [':not(:disabled)',':not([aria-disabled="true"])',':not([draggable="true"])',':not(.is-locked)'])assert(pointing.selector.includes(exclusion));
assert(pointing.selector.includes('[role="button"]'),'player nameplates receive the options pointer');
assert(rules.some(rule=>rule.selector.includes('textarea')&&rule.selector.includes('[contenteditable="true"]')&&rule.nodes.some(node=>node.prop==='cursor'&&node.value==='text')));
assert(rules.some(rule=>rule.selector.includes('button:disabled')&&rule.nodes.some(node=>node.prop==='cursor'&&node.value==='not-allowed')));
assert(rules.some(rule=>rule.selector.startsWith('[draggable="true"]')&&rule.nodes.some(node=>node.prop==='cursor'&&node.value==='grab')),'native draggable controls retain native drag feedback');
assert(main.includes("import './cursors.css'"));
assert(main.indexOf("import './cursors.css'")>main.indexOf("import './player-menu.css'"),'custom nameplate cursor wins the old context-menu cursor');
assert(main.includes('updateWorldCursor(now);updateTarget(now);'),'cursor routing runs from the actual frame');

// Execute shipped target eligibility and cursor routing; ray hits and the DOM are the only boundaries mocked.
let pickedId,playerHit,worldPicks=0,playerPicks=0,modal=false,time=1000;
const handlers=new Map(),windowHandlers=new Map(),documentHandlers=new Map();
const canvas={style:{},addEventListener:(name,handler)=>handlers.set(name,handler),setPointerCapture(){},focus(){}};
const runtime={visibleInDungeonRoom:()=>true,enemyMeshes:new Map(),POLL_BOOTHS,CITY_SERVICE_NPCS,GOLD_MERCHANT,DEED_AUCTIONEER,BANKER,BUILDING_BEDS,WORLD_CURIOS,RESOURCE_SITES,ZEPPELIN_PORTS,DUNGEONS,treasureMapTarget:()=>undefined,performanceHud:{reset(){}},isRaidInstance,RAID_BOUNDS,HEARTHLING_NPC,isArenaInstance,ARENA_ENTRANCE,heldKeyCodes:new Map(),isHostilePlayer,isHostileTarget,combatCompanionOwner,zoneHandle:undefined,THREE,ZONES,VILLAGE_NPCS,TRAINER_NPCS,RESOURCE_TYPES,MONSTERS,toWorld,DUNGEON_EXIT,canvas,BUILDING_CHAIRS,buildingAt,AUCTIONEER,players:[],position:{x:0,z:0},
 connected:true,worldReady:true,player:{hp:100},modalOpen:()=>modal,pointerInWorld:true,dragging:false,lastHover:0,
 hoveredId:null,selectedId:'unchanged-selection',hoverPointer:new THREE.Vector2(120,80),worldInstance:null,dungeon:null,
 nodes:Object.keys(RESOURCE_TYPES).map((kind,index)=>({id:`resource-${kind}`,kind,x:index,z:0,available:true})),
 enemies:[{id:'alive-monster',kind:'moss-slime',name:'Slime',x:0,z:0,hp:100,alive:true},{id:'dead-monster',kind:'moss-slime',name:'Dead slime',x:0,z:0,hp:0,alive:false}],
 loot:[{id:'remains',name:'Slime',x:0,z:0,diedAt:0},{id:'collapsing',name:'Falling slime',x:0,z:0,diedAt:1}],lootMeshes:new Map(),deathProgress:()=>0,
 pickPlayer:(x,y)=>{assert.equal(x,120);assert.equal(y,80);playerPicks++;return playerHit;},
 pickTarget:()=>{worldPicks++;return runtime.targetPoints().find(point=>point.id===pickedId);},
 window:{addEventListener:(name,handler)=>windowHandlers.set(name,handler)},document:{addEventListener:(name,handler)=>documentHandlers.set(name,handler)},keys:new Set(['w']),hotbar:{cancel(){}},
};
const execute=source=>runInNewContext(stripTypeScriptTypes(source),runtime);
execute(main.match(/^function clearMovementKeys.*$/m)[0]);
execute(main.slice(main.indexOf('function targetPoints('),main.indexOf('function cancelGathering(')));
execute(main.slice(main.indexOf('function updateWorldCursor('),main.indexOf('function updateTarget(')));
function hover(id,state){pickedId=id;time+=81;runtime.updateWorldCursor(time);assert.equal(canvas.style.cursor,`var(--cursor-${state})`,`${id||'ground'} cursor`);assert.equal(runtime.selectedId,'unchanged-selection','hover never selects or interacts');}
hover(undefined,'default');hover('alive-monster','attack');hover('dead-monster','default');hover('remains','loot');hover('collapsing','default');
for(const [kind,state] of Object.entries({crystal:'mine','ember-shard':'mine','star-fragment':'mine',heartroot:'chop',timber:'chop',herb:'harvest'}))hover(`resource-${kind}`,state);
runtime.nodes[0].available=false;hover(runtime.nodes[0].id,'default');runtime.nodes[0].available=true;
for(const npc of [...VILLAGE_NPCS,...TRAINER_NPCS])hover(npc.id,npc.role==='merchant'||npc.role==='mount-seller'?'trade':'talk');
hover(AUCTIONEER.id,'trade');
for(const zone of ZONES){hover(zone.npc.id,'talk');hover(`board-${zone.id}`,'talk');hover(`workshop-${zone.id}`,'craft');if(zone.beacon)hover(zone.beacon.id,'travel');}
hover('dungeon-entrance','travel');
runtime.worldInstance='rootvault';runtime.dungeon={objects:[{id:'chest',kind:'chest',available:true,activated:false,x:0,z:0,label:'Treasure'},{id:'seal',kind:'seal',available:true,activated:false,x:0,z:0,label:'Rune'},{id:'checkpoint',kind:'checkpoint',available:true,activated:false,x:0,z:0,label:'Sanctuary'}]};
hover('dungeon-exit','travel');hover('chest','loot');hover('seal','point');hover('checkpoint','point');
runtime.dungeon.objects[1].available=false;hover('seal','default');runtime.dungeon.objects[2].activated=true;hover('checkpoint','default');
runtime.dungeon.objects[0].activated=true;hover('chest','default');
runtime.worldInstance=null;runtime.dungeon=null;
playerHit={id:'mounted-friend'};const beforePlayer=worldPicks;hover('alive-monster','point');
assert.equal(worldPicks,beforePlayer,'player/mount options take precedence over world targets exactly as right-click does');assert.equal(runtime.hoveredId,null);playerHit=undefined;
hover('alive-monster','attack');const beforeThrottle=[worldPicks,playerPicks];pickedId='resource-herb';runtime.updateWorldCursor(time+40);
assert.deepEqual([worldPicks,playerPicks],beforeThrottle,'hover raycasts remain limited to the existing 80ms cadence');
runtime.dragging=true;runtime.updateWorldCursor(time+41);assert.equal(canvas.style.cursor,'var(--cursor-grab)');assert.deepEqual([worldPicks,playerPicks],beforeThrottle,'orbiting never performs hover raycasts');
runtime.dragging=false;runtime.updateWorldCursor(time+42);assert.equal(canvas.style.cursor,'var(--cursor-harvest)','releasing a drag clears its cursor immediately');
time+=42;
for(const flag of ['connected','worldReady','pointerInWorld']){
 hover('alive-monster','attack');runtime[flag]=false;const calls=[worldPicks,playerPicks];runtime.updateWorldCursor(time+1);
 assert.equal(canvas.style.cursor,'var(--cursor-default)');assert.equal(runtime.hoveredId,null);assert.deepEqual([worldPicks,playerPicks],calls);runtime[flag]=true;
}
for(const unavailable of ['dead','missing','modal']){
 hover('alive-monster','attack');if(unavailable==='modal')modal=true;else runtime.player=unavailable==='dead'?{hp:0}:undefined;
 runtime.updateWorldCursor(time+1);assert.equal(canvas.style.cursor,'var(--cursor-default)');assert.equal(runtime.hoveredId,null);
 modal=false;runtime.player={hp:100};
}
for(const prefix of ["canvas.addEventListener('pointerleave'","canvas.addEventListener('pointercancel'","window.addEventListener('blur'","document.addEventListener('visibilitychange'"]){
 const line=main.split('\n').find(line=>line.startsWith(prefix));assert(line);execute(line);
}
for(const event of [()=>handlers.get('pointerleave')(),()=>handlers.get('pointercancel')(),()=>windowHandlers.get('blur')(),()=>documentHandlers.get('visibilitychange')()]){
 runtime.pointerInWorld=true;hover('resource-timber','chop');event();
 assert.equal(canvas.style.cursor,'var(--cursor-default)');assert.equal(runtime.hoveredId,null);assert.equal(runtime.pointerInWorld,false,'leaving for UI, cancelling capture or blurring clears stale contextual feedback');
}
console.log('PASS: 12 native RGBA cursors/hotspots, UI text/disabled/drag exclusions, actual live-target and NPC/resource routing, mounted-player precedence, 80ms hover throttle, drag release, death/modal/disconnection and pointer-leave cleanup.');
