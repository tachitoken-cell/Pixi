import { isRaidInstance, RAID_BOUNDS } from '../src/raid.ts';
import { HEARTHLING_NPC } from '../src/hearthling.ts';
import { POLL_BOOTHS } from '../src/poll-booths.ts';
import { CITY_SERVICE_NPCS } from '../src/city-services.ts';
import { bindingLabel } from '../src/keybindings.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { chooseTarget, isHostilePlayer, isHostileTarget, combatCompanionOwner } from '../src/targeting.ts';
import { toWorld, canTraverse, WORLD_COLLIDERS, WORLD_BOUNDS, DUNGEON_BOUNDS } from '../src/realm.ts';
import { buildingAt, buildingFloorHeight } from '../src/buildings.ts';
import { surfaceHeight, pickTerrain } from '../src/terrain-view.ts';
import { RESOURCE_TYPES, SKILLS, skillProgress } from '../src/skills.ts';
import { SPELLS, abilityValid, abilityUnlocked, spellCastTimeMs, legacyAbility, GLOBAL_ATTACK_MS } from '../src/spells.ts';
import { ROOTVAULT_ENTRANCE, DUNGEONS } from '../src/dungeon.ts';
import { BANKER, DEED_AUCTIONEER } from '../src/city.ts';
import { isArenaInstance, ARENA_ENTRANCE, ARENA_BOUNDS } from '../src/arena.ts';
import { playerTitle } from '../src/titles.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { ZEPPELIN_PORTS } from '../src/zeppelin.ts';
import { TRAINING_PRACTICE } from '../src/training-grounds-data.ts';
import { GOLD_MERCHANT } from '../src/gold-merchant.ts';

const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const extract=(start,end)=>{const a=main.indexOf(start),b=main.indexOf(end,a);assert(a>=0&&b>a,`actual ${start} source is present`);return stripTypeScriptTypes(main.slice(a,b));};
const geometry=new THREE.BoxGeometry(.8,2,.8),material=new THREE.MeshBasicMaterial();
const citizenMesh=new THREE.Group(),body=new THREE.Mesh(geometry,material);body.position.y=1;citizenMesh.add(body);
citizenMesh.position.set(.7,0,8);citizenMesh.updateMatrixWorld(true);
const citizen={name:'Alden Mossfield',title:'Lanternreach townsfolk',mesh:citizenMesh},citizenId='city-citizen-0';
const citizens=new Map([[citizenId,citizen]]),zoneHandle={citizens};
const camera=new THREE.PerspectiveCamera(45,1280/720,.1,100),targetRing=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial());
const hero={id:'hero',name:'Willow',hp:100,maxHp:100,level:1,appearance:{className:'Ranger'},inventory:{potion:1},x:0,z:8};
const node={id:'nearby-herbs',kind:'herb',x:2,z:8,available:true};
const sent=[],toasts=[],frames=[],portraits=[],handlers=new Map(),elements=new Map();
const element=id=>{if(!elements.has(id))elements.set(id,{hidden:true,style:{},dataset:{},setAttribute(){},toggleAttribute(){}});return elements.get(id);};
const runtime={visibleInDungeonRoom:()=>true,POLL_BOOTHS,CITY_SERVICE_NPCS,treasureMapTarget:()=>undefined,bindingLabel,heldKeyCodes:new Map(),THREE,chooseTarget,isHostilePlayer,isHostileTarget,combatCompanionOwner,toWorld,canTraverse,WORLD_BOUNDS,DUNGEON_BOUNDS,colliders:WORLD_COLLIDERS,buildingAt,buildingFloorHeight,surfaceHeight,pickTerrain,
 DUNGEONS,ZEPPELIN_PORTS,zeppelins:undefined,RESOURCE_TYPES,SKILLS,skillProgress,SPELLS,abilityValid,abilityUnlocked,spellCastTimeMs,legacyAbility,GLOBAL_ATTACK_MS,MONSTERS,BANKER,DEED_AUCTIONEER,GOLD_MERCHANT,ROOTVAULT_ENTRANCE,isRaidInstance,RAID_BOUNDS,HEARTHLING_NPC,isArenaInstance,ARENA_ENTRANCE,ARENA_BOUNDS,playerTitle,

 position:{x:0,z:8},player:hero,playerId:hero.id,appearance:hero.appearance,players:[hero],nodes:[node],enemies:[],loot:[],
 zoneHandle,worldInstance:null,worldZone:'greenwood',dungeon:null,DUNGEON_EXIT:{x:0,z:0},ZONES:[],NPCS:[],VILLAGE_NPCS:[],TRAINER_NPCS:[],BUILDING_CHAIRS:[],BUILDING_BEDS:[],WORLD_CURIOS:[],RESOURCE_SITES:[],AUCTIONEER:{id:'auctioneer',name:'Merrick',x:100,z:100},
 remote:new Map(),mountViews:new Map(),nodeMeshes:new Map(),enemyMeshes:new Map(),lootMeshes:new Map(),npcViews:new Map(),camera,raycaster:new THREE.Raycaster(),targetRing,
 innerWidth:1280,innerHeight:720,performance,serverOffset:0,connected:true,worldReady:true,rosterActive:false,entryActive:false,modalOpen:()=>false,
 autoAttackTarget:null,lastAutoAttackRequest:-Infinity,selectedId:null,hoveredId:null,pointerInWorld:true,cancelledGather:-1,cancelledCast:-1,lastPrimary:0,lastMove:0,lastTargetText:'',lastUnitFrame:0,rotation:0,keys:new Set(),
 unitPortraits:undefined,unitPortraitsFailed:false,$:element,send:message=>sent.push(message),toast:message=>toasts.push(message),tone(){},
 unitFrames:{canvases:{},update:(...data)=>frames.push(data),clear(){}},createUnitPortraits:()=>({update:data=>portraits.push(data),dispose(){}}),
 canvas:{getBoundingClientRect:()=>({left:0,top:0,width:1280,height:720}),addEventListener:(event,handler)=>handlers.set(event,handler)},pickPlayer:()=>undefined,playerMenu:{close(){}},setAutoAttack:id=>assert.equal(id,null,'citizen selection clears hostile targeting'),console,
};
runInNewContext(main.match(/^function clearMovementKeys.*$/m)[0],runtime);
for(const [start,end] of [
 ['function targetPoints(','function cancelGathering('],['function cancelGathering(',"let lastTargetText="],
 ['function updateTarget(',"$('target-action').onclick"],['function clearUnitFrames(','const raycaster ='],
 ['function setAutoAttack(','function clearCombat('],['function act(','let characterView:'],["canvas.addEventListener('contextmenu'","canvas.addEventListener('wheel'"],
])runInNewContext(extract(start,end),runtime);
const citizenPoint=()=>runtime.targetPoints().find(point=>point.id===citizenId);
assert.equal(citizenMesh.parent,null,'selection uses the off-scene rig, not an added duplicate visual');
assert.equal(citizenPoint().name,citizen.name);assert.equal(citizenPoint().kind,'npc');assert.equal(citizenPoint().x,.7);
const aim=()=>{camera.position.set(citizenMesh.position.x,4,citizenMesh.position.z+8);camera.lookAt(citizenMesh.position.x,1,citizenMesh.position.z);camera.updateMatrixWorld(true);};
aim();assert.equal(runtime.pickTarget(640,360)?.id,citizenId,'actual Three ray hits resolve the live citizen rig');
citizenMesh.position.set(1.4,0,9.3);citizenMesh.rotation.y=.6;citizenMesh.updateMatrixWorld(true);aim();
assert.equal(citizenPoint().x,1.4);assert.equal(citizenPoint().z,9.3);assert.equal(runtime.pickTarget(640,360)?.id,citizenId,'picking follows changed animated world transforms');

runtime.selectedId=citizenId;runtime.updateTarget(100);runtime.updateUnitFrames(100);
assert.equal(targetRing.position.x,1.4);assert.equal(targetRing.position.z,9.3);assert.equal(targetRing.material.color.getHexString(),'bfe8aa');
assert.equal(frames.at(-1)[1].name,citizen.name);assert.equal(frames.at(-1)[1].subtitle,citizen.title);assert.equal(frames.at(-1)[1].disposition,'friendly');
assert.equal(frames.at(-1)[1].hp,undefined,'cosmetic citizens do not invent authoritative health');assert.equal(frames.at(-1)[2],null);
assert.equal(portraits.at(-1).target.kind,'npc');assert.equal(portraits.at(-1).target.source,citizenMesh,'portrait copies the actual animated citizen model');
citizenMesh.position.set(1.6,0,9.4);citizenMesh.updateMatrixWorld(true);runtime.updateTarget(120);
assert.equal(targetRing.position.x,1.6);assert.equal(targetRing.position.z,9.4,'ring follows movement even before the next unit-frame refresh');
assert.equal(element('target-detail').textContent,citizen.title);assert.equal(element('target-action').textContent,'Selected');

citizenMesh.visible=false;
assert.equal(citizenPoint(),undefined);assert.equal(runtime.pickTarget(640,360),undefined,'hidden rigs cannot be ray-picked');
runtime.updateTarget(200);runtime.updateUnitFrames(200);assert.equal(targetRing.visible,false);assert.equal(frames.at(-1)[1],null);assert.equal(portraits.at(-1).target,undefined);
citizenMesh.visible=true;runtime.worldInstance='dungeon';
assert.equal(citizenPoint(),undefined);runtime.updateUnitFrames(300);assert.equal(frames.at(-1)[1],null,'overworld citizens cannot survive dungeon selection');
runtime.worldInstance=null;

// E skips the nearby cosmetic pedestrian and still operates the next real resource.
citizenMesh.position.set(.3,0,8);citizenMesh.updateMatrixWorld(true);runtime.selectedId=null;runtime.act('gather');
assert.deepEqual(sent.map(message=>message.type),['move','gather']);assert.equal(sent[1].targetId,node.id);assert.equal(runtime.selectedId,null);
sent.length=0;runtime.selectedId=citizenId;runtime.act('gather');assert.equal(sent.length,0,'explicit citizen interaction cannot become an unknown service or silently gather nearby');
runtime.nodes=[];runtime.selectedId=null;runtime.act('gather');assert.equal(sent.length,0,'a citizen alone is not an automatic E interaction');
aim();const event={clientX:640,clientY:360,preventDefault(){this.prevented=true;}};handlers.get('contextmenu')(event);
assert.equal(event.prevented,true);assert.equal(runtime.selectedId,citizenId,'right-click selects the citizen using its real mesh');assert.equal(sent.length,0,'right-click emits no invalid server interaction');

const practice=TRAINING_PRACTICE[0];citizens.clear();citizens.set(practice.id,{name:practice.name,title:practice.title,mesh:citizenMesh});
runtime.selectedId=practice.id;runtime.updateTarget(450);runtime.updateUnitFrames(450);
assert.equal(frames.at(-1)[1].name,practice.name);assert.equal(frames.at(-1)[1].subtitle,practice.title);assert.equal(portraits.at(-1).target.source,citizenMesh);
handlers.get('contextmenu')(event);assert.equal(runtime.selectedId,practice.id);assert.equal(sent.length,0,'practice apprentices use normal cosmetic selection without training or server interaction');
citizens.clear();runtime.updateTarget(600);runtime.updateUnitFrames(600);
assert.equal(targetRing.visible,false);assert.equal(frames.at(-1)[1],null);assert.equal(portraits.at(-1).target,undefined,'disposed citizen maps clear the selected frame and portrait');
runtime.zoneHandle=undefined;assert.doesNotThrow(()=>runtime.targetPoints());runtime.updateUnitFrames(700);assert.equal(frames.at(-1)[1],null,'worlds without ambient citizens remain compatible');

const deedMesh=citizenMesh.clone(),deedHeight=surfaceHeight(DEED_AUCTIONEER.x,DEED_AUCTIONEER.z,false);
deedMesh.position.set(DEED_AUCTIONEER.x,deedHeight,DEED_AUCTIONEER.z);deedMesh.updateMatrixWorld(true);
runtime.npcViews.set(DEED_AUCTIONEER.id,{mesh:deedMesh});
const approach=Array.from({length:32},(_,i)=>({x:DEED_AUCTIONEER.x+Math.cos(i*Math.PI/16)*1.2,z:DEED_AUCTIONEER.z+Math.sin(i*Math.PI/16)*1.2})).find(point=>canTraverse(point,DEED_AUCTIONEER));
assert(approach,'deed auctioneer has an accessible interaction approach');Object.assign(runtime.position,approach);Object.assign(hero,approach);
camera.position.set(DEED_AUCTIONEER.x,deedHeight+4,DEED_AUCTIONEER.z+8);camera.lookAt(DEED_AUCTIONEER.x,deedHeight+1,DEED_AUCTIONEER.z);camera.updateMatrixWorld(true);
assert.equal(runtime.pickTarget(640,360)?.id,DEED_AUCTIONEER.id,'house deed auctioneer is selected through its actual NPC mesh');
runtime.selectedId=DEED_AUCTIONEER.id;runtime.updateTarget(800);runtime.updateUnitFrames(800);
assert.equal(frames.at(-1)[1].name,DEED_AUCTIONEER.name);assert.equal(frames.at(-1)[1].subtitle,DEED_AUCTIONEER.title);
assert.equal(portraits.at(-1).target.source,deedMesh,'deed auctioneer portrait follows its visible NPC model');
sent.length=0;runtime.act('interact');assert.deepEqual(sent.map(message=>message.type),['move','interact']);
assert.equal(sent.at(-1).targetId,DEED_AUCTIONEER.id,'E requests the authoritative house-auction NPC service');
runtime.worldInstance='dungeon';assert(!runtime.targetPoints().some(point=>point.id===DEED_AUCTIONEER.id),'house auctioneer is never an instanced dungeon target');
runtime.worldInstance=null;
const merchantMesh=citizenMesh.clone(),merchantHeight=surfaceHeight(GOLD_MERCHANT.x,GOLD_MERCHANT.z,false);
merchantMesh.position.set(GOLD_MERCHANT.x,merchantHeight,GOLD_MERCHANT.z);merchantMesh.updateMatrixWorld(true);
runtime.npcViews.set(GOLD_MERCHANT.id,{mesh:merchantMesh});
const merchantFront={x:GOLD_MERCHANT.x+Math.sin(GOLD_MERCHANT.rotation)*1.2,z:GOLD_MERCHANT.z+Math.cos(GOLD_MERCHANT.rotation)*1.2};
assert(canTraverse(merchantFront,GOLD_MERCHANT));Object.assign(runtime.position,merchantFront);Object.assign(hero,merchantFront);
camera.position.set(GOLD_MERCHANT.x,merchantHeight+4,GOLD_MERCHANT.z+8);camera.lookAt(GOLD_MERCHANT.x,merchantHeight+1,GOLD_MERCHANT.z);camera.updateMatrixWorld(true);
assert.equal(runtime.pickTarget(640,360)?.id,GOLD_MERCHANT.id,'gold merchant can be picked through his NPC mesh');
runtime.selectedId=GOLD_MERCHANT.id;runtime.updateTarget(900);runtime.updateUnitFrames(900);
assert.equal(frames.at(-1)[1].name,GOLD_MERCHANT.name);assert.equal(frames.at(-1)[1].subtitle,GOLD_MERCHANT.title);assert.equal(portraits.at(-1).target.source,merchantMesh);
sent.length=0;runtime.act('interact');assert.deepEqual(sent.map(message=>message.type),['move','interact']);assert.equal(sent.at(-1).targetId,GOLD_MERCHANT.id);
sent.length=0;handlers.get('contextmenu')(event);assert.equal(runtime.selectedId,GOLD_MERCHANT.id);assert.equal(sent.at(-1).targetId,GOLD_MERCHANT.id,'right-click talks to the gold merchant');
runtime.worldInstance='dungeon';assert(!runtime.targetPoints().some(point=>point.id===GOLD_MERCHANT.id));runtime.updateUnitFrames(1000);assert.equal(frames.at(-1)[1],null,'gold merchant selection clears in dungeons');
runtime.worldInstance=null;
for(const [index,npc] of CITY_SERVICE_NPCS.entries()){
 const mesh=citizenMesh.clone(),floor=buildingFloorHeight(npc.x,npc.z);mesh.position.set(npc.x,floor,npc.z);mesh.updateMatrixWorld(true);runtime.npcViews.set(npc.id,{mesh});
 const front={x:npc.x+Math.sin(npc.rotation)*1.5,z:npc.z+Math.cos(npc.rotation)*1.5};assert(canTraverse(front,npc));Object.assign(runtime.position,front);Object.assign(hero,front);
 camera.position.set(npc.x,floor+4,npc.z+8);camera.lookAt(npc.x,floor+1,npc.z);camera.updateMatrixWorld(true);
 assert.equal(runtime.pickTarget(640,360)?.id,npc.id,`${npc.id}: actual NPC mesh is selectable`);
 runtime.selectedId=npc.id;runtime.updateUnitFrames(1200+index*100);assert.equal(frames.at(-1)[1].name,npc.name);assert.equal(frames.at(-1)[1].subtitle,npc.title);
 sent.length=0;runtime.act('interact');assert.equal(sent.at(-1).targetId,npc.id,`${npc.id}: interaction dispatch names the selected service`);
}
geometry.dispose();material.dispose();targetRing.geometry.dispose();targetRing.material.dispose();
console.log('PASS city targeting: actual moving mesh picks, visible/dungeon lifecycle, friendly name/title/model portraits, following target ring, right-click selection, E preserves real interactions, and house-deed NPC mesh selection/portrait/authoritative interaction.');
