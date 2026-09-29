import { isRaidInstance, RAID_BOUNDS } from '../src/raid.ts';
import { bindingLabel } from '../src/keybindings.ts';
import { isArenaInstance, ARENA_BOUNDS } from '../src/arena.ts';
import { isInstantCombatInstance } from '../src/instant-combat.ts';
import assert from 'node:assert/strict';
import {advanceWaypointRoute} from '../src/ground-waypoint.ts';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import { getOnboardingStep, onboardingFeatureUnlocked, onboardingLockReason, newOnboarding } from '../src/onboarding.ts';
import { ZONES, NPCS, getZone } from '../src/content.ts';
import { TRAINER_NPCS } from '../src/training.ts';
import { WORLD_COLLIDERS, WORLD_BOUNDS, DUNGEON_BOUNDS, canTraverse, OVERWORLD_SPAWNS } from '../src/realm.ts';
import { findPath } from '../src/navigation.ts';
import { SPELLS } from '../src/spells.ts';
import { SKILLS } from '../src/skills.ts';
import { CITY_CLOCKTOWER } from '../src/city.ts';
import { buildingPoint } from '../src/buildings.ts';
import { DUNGEON_STAGES, dungeonBounds } from '../src/dungeon.ts';
const starterSlimes=OVERWORLD_SPAWNS.filter(enemy=>enemy.zone==='greenwood'&&enemy.kind==='moss-slime');
const starterId=[...starterSlimes].sort((a,b)=>Math.hypot(a.x,a.z-8)-Math.hypot(b.x,b.z-8))[0].id;
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const tree=ts.createSourceFile('main.ts',main,ts.ScriptTarget.Latest,true);
const functionText=name=>{const node=tree.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);assert(node,`missing actual ${name}`);return node.getText(tree);};
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const functions=['clearMovementKeys','allowFeature','acknowledgeGuide','guideDestination','followStarterGuide','updateGuideWaypoint','clearWaypoint','setWaypoint','updateWaypoint','openInventory','openCharacter','openProfessions','openSpells','openSkills','openTalents','openCrafting','openContracts','openParty','openDungeon','openCollection','openMounts','openTraining'];
const fresh=()=>({id:'new-adventurer',name:'Learner',characterCreated:true,hp:100,level:1,gold:0,appearance:{className:'Ranger'},quest:{chapter:0,stage:0,progress:{'grove-slimes':0,'grove-crystals':0},completed:false},learnedSpells:['arrow'],contracts:{active:{},completed:{}},skills:Object.fromEntries(Object.keys(SKILLS).map(id=>[id,0])),onboarding:newOnboarding()});
function runtime(){
 const ctx={watchBagBalance(){},loadDungeonLeaderboard(){},party:null,showShutdownWarning(){},stopSessionRenewal(){},bindingLabel,heldKeyCodes:new Map(),isRaidInstance,RAID_BOUNDS,isArenaInstance,ARENA_BOUNDS,isInstantCombatInstance,THREE,NPCS,TRAINER_NPCS,getZone,getOnboardingStep,onboardingFeatureUnlocked,onboardingLockReason,WORLD_BOUNDS,DUNGEON_BOUNDS,DUNGEON_STAGES,dungeonBounds,canTraverse,OVERWORLD_SPAWNS,
  player:fresh(),playerId:'new-adventurer',appearance:{className:'Ranger'},worldReady:true,connected:true,entryActive:false,rosterActive:false,worldInstance:null,dungeon:null,dungeonChoice:'rootvault',worldZone:'greenwood',position:new THREE.Vector3(0,0,8),yaw:.34,colliders:WORLD_COLLIDERS,
  enemies:starterSlimes.map(enemy=>({...enemy,instanceId:null,alive:true})),nodes:ZONES[0].nodes.map(node=>({...node,zone:'greenwood',available:true})),loot:[],serverOffset:2500,now:0,serverNow:10_000,
  groundWaypoint:{update(){}},elapsed:0,objectiveGuidance:true,advanceWaypointRoute,guideRoute:[],guideTargetId:undefined,guideKey:'',guideOwner:'',guideRetryAt:0,guideWasAlive:true,guideViewAt:-Infinity,waypoint:null,
  notices:[],sent:[],indicators:[],opened:[],rendered:[],keys:new Set(),closedBagIds:new Set(['old']),skillTab:'combat',contractZone:'greenwood',mountPanelKey:'',trainerNpcId:null,trainingSelected:'',trainingFilter:'all',trainingPending:null,lastTrainingHTML:'',
  panel:{open:false,dataset:{mode:''}},customizer:{open:false},modal:false,
 };
 ctx.Date={now:()=>ctx.serverNow};ctx.performance={now:()=>ctx.now};ctx.modalOpen=()=>ctx.modal;ctx.floatingPanel=()=>true;
 ctx.toast=text=>ctx.notices.push(text);ctx.send=message=>ctx.sent.push(message);
 ctx.waypointIndicator={update:(target,position)=>ctx.indicators.push({target:target&&{...target},position:{x:position.x,z:position.z}})};
 ctx.openPanel=(title,eyebrow,mode)=>{ctx.panel.open=true;ctx.panel.dataset.mode=mode;ctx.opened.push(mode);};ctx.closePanel=()=>{ctx.panel.open=false;};
 for(const name of ['renderInventory','renderGearPanel','renderProfessions','renderSpells','renderTalentPanel','renderCraftPanel','renderContractPanel','renderDungeonPanel','renderMounts','renderTrainingPanel'])ctx[name]=()=>ctx.rendered.push(name);
 ctx.friendsUI={open:tab=>ctx.opened.push(tab)};ctx.updateWho=()=>ctx.rendered.push('who');
 ctx.showNpcPortrait=()=>{};ctx.nearbyTrainer=id=>TRAINER_NPCS.find(n=>n.id===id);
 ctx.findPath=findPath;
 ctx.targetPoints=()=>[...NPCS,...TRAINER_NPCS,{id:'board-greenwood',x:3,z:2},...ctx.enemies.filter(e=>e.alive),...ctx.nodes.filter(n=>n.available),...ctx.loot.filter(drop=>drop.expiresAt>ctx.serverNow+ctx.serverOffset)];
 runInNewContext(compile(functions.map(functionText).join('\n')),ctx);
 return ctx;
}
const tick=ctx=>{ctx.now+=1600;ctx.updateWaypoint();};
const fallback=runtime();fallback.enemies=[];assert.equal(fallback.guideDestination('first-kill').id,starterId,'a missing nearby snapshot uses actual relocated starter homes');
const c=runtime(),start=c.position.clone();tick(c);assert.equal(c.waypoint.id,'rowan');assert.equal(c.guideTargetId,'rowan');assert(c.guideRoute.length);assert(c.position.equals(start));assert.equal(c.sent.length,0,'guidance does not send movement or completion claims');assert.equal(c.keys.size,0);
c.player.quest.stage=1;tick(c);assert.equal(c.guideTargetId,starterId);assert(c.guideRoute.length>1,'the western starter grove requires a real route around city solids');
let previous={x:c.position.x,z:c.position.z};const route=c.guideRoute.map(p=>({...p}));
for(const point of route){assert(canTraverse(previous,point,WORLD_COLLIDERS,WORLD_BOUNDS),'every guide-route leg uses authoritative collision');previous=point;}
assert(Math.hypot(previous.x-c.waypoint.x,previous.z-c.waypoint.z)<.01);
assert(canTraverse(c.position,c.indicators.at(-1).target,WORLD_COLLIDERS,WORLD_BOUNDS),'the displayed arrow initially points along a clear leg');
// Walk the suggested route manually. The controller may only move the arrow.
for(const point of route){c.position.set(point.x,0,point.z);const before=c.position.clone();tick(c);assert(c.position.equals(before));const direction=c.indicators.at(-1).target;if(direction)assert(canTraverse(c.position,direction,WORLD_COLLIDERS,WORLD_BOUNDS),'arrow stays on collision-safe legs as the player walks');}
assert.equal(c.waypoint.id,starterId,'objective marker remains until its task is complete');const arrivalCount=c.notices.filter(text=>text==='Waypoint reached.').length;tick(c);tick(c);assert.equal(c.notices.filter(text=>text==='Waypoint reached.').length,arrivalCount,'arriving does not repeatedly reset the guide/toast');
c.setWaypoint({id:'manual-map-marker',x:-10,z:90,label:'My marker'});tick(c);assert.equal(c.waypoint.id,'manual-map-marker');assert.equal(c.guideTargetId,undefined,'manual markers suspend automatic guidance for the same lesson');
c.clearWaypoint();tick(c);assert.equal(c.waypoint,null,'clearing a manual waypoint is respected');
c.followStarterGuide();assert.equal(c.guideTargetId,starterId);c.player.hp=0;tick(c);assert.equal(c.indicators.at(-1).target,null);assert(!c.guideWasAlive);c.position.set(0,0,8);c.player.hp=100;tick(c);assert.equal(c.guideTargetId,starterId);assert(c.guideWasAlive,'respawning restores the guide');
c.player.quest.progress['grove-slimes']=1;c.loot=[{id:'expired',ownerId:c.playerId,x:-80,z:0,expiresAt:c.serverNow+2000},{id:'other',ownerId:'another',x:-80,z:0,expiresAt:50000},{id:'mine',ownerId:c.playerId,x:-90,z:5,instanceId:null,expiresAt:50000}];tick(c);assert.equal(c.guideTargetId,'mine','loot guidance respects owner and server clock offset');
c.loot=[];assert.equal(c.guideDestination('loot').id,starterId,'expired/missing remains lead to another slime without trapping the lesson');
c.player.onboarding.looted=true;tick(c);assert.equal(c.waypoint,null);assert.equal(c.opened.length,0,'automatic bag lesson does not force a window open');c.followStarterGuide();assert.equal(c.opened.at(-1),'inventory','the bag lesson opens the standalone Backpack');assert.equal(c.sent.at(-1).type,'onboardingViewed');assert.equal(c.sent.at(-1).panel,'bag');assert(!c.player.onboarding.bagViewed,'opening requests acknowledgement but does not edit progress locally');
c.player.onboarding.bagViewed=true;tick(c);c.followStarterGuide();assert.equal(c.opened.at(-1),'gear');assert.equal(c.sent.at(-1).panel,'gear');c.player.onboarding.gearViewed=true;tick(c);assert.equal(c.guideTargetId,'crystal-0');
c.player.quest.progress['grove-crystals']=3;tick(c);assert.equal(c.guideTargetId,starterId);c.player.quest.progress['grove-slimes']=3;c.player.quest.stage=2;tick(c);assert.equal(c.guideTargetId,'rowan');
c.player.quest={chapter:1,stage:1,progress:{'meet-sable':0},completed:false};c.player.level=2;tick(c);assert.equal(c.guideTargetId,'trainer-greenwood-ranger-trainer');
for(const className of ['Ranger','Knight','Mage','Cleric']){c.player.appearance.className=className;const destination=c.guideDestination('train-spell');assert.equal(destination.className,className);assert(canTraverse(destination,destination,WORLD_COLLIDERS));}
c.player.appearance.className='Ranger';c.player.learnedSpells.push(Object.values(SPELLS).find(spell=>spell.className==='Ranger'&&spell.requiredLevel===2).id);tick(c);assert.equal(c.guideTargetId,'board-greenwood');c.player.onboarding.completed=true;tick(c);assert.equal(c.waypoint,null,'finishing the tour removes its waypoint');
const corner=runtime();corner.player.quest.stage=2;corner.player.quest.progress={'grove-slimes':3,'grove-crystals':3};Object.assign(corner.player.onboarding,{looted:true,bagViewed:true,gearViewed:true});
const cornerStart=buildingPoint(CITY_CLOCKTOWER,-5,-CITY_CLOCKTOWER.depth/2-3);corner.position.set(cornerStart.x,0,cornerStart.z);tick(corner);
let guardedCorner=false,previousCorner=cornerStart;
for(const point of [...corner.guideRoute]){
 const gap=Math.hypot(point.x-previousCorner.x,point.z-previousCorner.z),before={x:point.x+(previousCorner.x-point.x)*Math.min(1.7,gap)/gap,z:point.z+(previousCorner.z-point.z)*Math.min(1.7,gap)/gap};
 const next=corner.guideRoute[1];
 if(next&&canTraverse(before,point)&&!canTraverse(before,next)){
  corner.position.set(before.x,0,before.z);tick(corner);guardedCorner=true;
  assert(canTraverse(corner.position,corner.indicators.at(-1).target,WORLD_COLLIDERS,WORLD_BOUNDS),'being within the checkpoint radius of a real town hall corner cannot advance the arrow through its wall');break;
 }
 corner.position.set(point.x,0,point.z);tick(corner);previousCorner=point;
}
assert(guardedCorner,'the hall route exercises an actual obstructed corner');
const legacy=runtime();delete legacy.player.onboarding;tick(legacy);assert.equal(legacy.waypoint,null,'existing characters do not acquire an automatic tour');
const dungeon=runtime();dungeon.worldInstance='vault';tick(dungeon);assert.equal(dungeon.waypoint,null,'overworld guide does not send players across dungeon space');
const off=runtime();off.connected=false;tick(off);assert.equal(off.waypoint,null);off.connected=true;off.entryActive=true;tick(off);assert.equal(off.waypoint,null);off.entryActive=false;off.rosterActive=true;tick(off);assert.equal(off.waypoint,null);
// Run each real teardown, then restore the same character and unchanged lesson.
// Unlike clearing a manual marker, leaving the world must permit guidance to resume.
for(const teardown of ['pauseConnection','showCharacterRoster','returnToCharacters']){
 const reentry=runtime();reentry.player.quest.stage=1;tick(reentry);
 const character=reentry.player,lesson=reentry.guideKey,target=reentry.guideTargetId;
 Object.assign(reentry,{
  mountViews:new Map(),sprintSinceMove:false,realmAvailable:true,realmOutageMessage:'',updateSelection:null,characterDeletion:null,rosterCharacters:[character],selectedCharacterId:character.id,
  enteredCharacterId:character.id,creatingCharacter:false,connectionRevision:0,zoneRevision:0,setWorldLoading(){},reconnectTimer:undefined,socket:null,
  setActiveHostingRealm(){},activeRealmId:'eu',changingRealm:false,closeCharacterDeletion(){},disposeMinimap(){},clearSocialUI(){},clearCombat(){},resetInstantCombat(){},updatePartyHUD(){},clearEntityViews(){},
  cancelGathering(){},renderRoster(){},saveLocal(){},clearTimeout(){},
  document:{body:{classList:{add(){},remove(){}}}},$:()=>({focus(){}}),
 });
 reentry.panel.close=()=>{reentry.panel.open=false;};reentry.customizer.close=()=>{reentry.customizer.open=false;};
 runInNewContext(compile(functionText(teardown)),reentry);
 reentry[teardown]({type:'roster',characters:[character],maxCharacters:4});
 assert.equal(reentry.waypoint,null,`${teardown} clears the old guide marker`);
 assert.equal(reentry.guideOwner,character.id,'same-character reentry cannot rely on a changed owner');
 Object.assign(reentry,{player:character,connected:true,worldReady:true,entryActive:false,rosterActive:false});
 tick(reentry);
 assert.equal(reentry.guideKey,lesson,`${teardown} resumes the unchanged lesson`);
 assert.equal(reentry.guideTargetId,target,`${teardown} rebuilds guidance after same-character reentry`);
 assert(reentry.guideRoute.length,`${teardown} restores the collision-aware route`);
 assert(canTraverse(reentry.position,reentry.indicators.at(-1).target,WORLD_COLLIDERS,WORLD_BOUNDS));
}
const g=runtime();
const wrappers=['openInventory','openCharacter','openProfessions','openSpells','openTalents','openCrafting','openContracts','openParty','openDungeon','openMounts'];
for(const name of wrappers){g[name]();assert.equal(g.opened.length,0,`${name} rejects locked entry before rendering`);assert.equal(g.rendered.length,0);assert.equal(g.sent.length,0);}
g.openTraining('trainer-greenwood-ranger-trainer');g.openTraining('trainer-greenwood-riding-trainer');assert.equal(g.opened.length,0);
const who=runtime();Object.assign(who.player.onboarding,{looted:true,bagViewed:true,gearViewed:true,completed:true});who.panel.open=true;who.openParty();assert.deepEqual(who.opened,['who'],'the unlocked Party shortcut opens Friends Who');assert.deepEqual(who.rendered,['who'],'opening Who refreshes the live party and player list');assert(!who.panel.open,'Who closes the former modal before opening the friends window');
g.player.quest.stage=1;g.player.quest.progress['grove-slimes']=1;g.openInventory();assert.equal(g.opened.at(-1),'inventory','backpack opens its standalone inventory');assert.equal(g.sent.at(-1).panel,'bag');g.player.onboarding.bagViewed=true;g.sent=[];g.openInventory();assert.equal(g.sent.length,0,'reopening acknowledged bags does not repeat the lesson');g.now+=1600;g.updateGuideWaypoint(g.now);assert.equal(g.sent.length,0,'the Backpack does not acknowledge locked gear before looting');
g.player.onboarding.looted=true;g.now+=1600;g.openCharacter();assert.equal(g.opened.at(-1),'gear');assert.equal(g.sent.at(-1).panel,'gear');
g.player.skills.mining=1;g.openSkills();assert.equal(g.opened.at(-1),'professions','K opens newly unlocked professions while the spellbook remains locked');
g.player.quest.chapter=1;g.openTraining('trainer-greenwood-ranger-trainer');assert.equal(g.opened.at(-1),'training');g.openContracts();assert.equal(g.opened.at(-1),'contracts','training funds can be recovered through contracts');
const backpack=runtime();backpack.player.quest.stage=1;backpack.player.quest.progress['grove-slimes']=1;backpack.player.onboarding.looted=true;
backpack.openInventory();assert.equal(backpack.opened.at(-1),'inventory');assert.equal(backpack.sent.at(-1).panel,'bag');
backpack.player.onboarding.bagViewed=true;backpack.now=1600;backpack.updateGuideWaypoint(backpack.now);
assert.equal(backpack.sent.length,1,'keeping the standalone Backpack open cannot acknowledge the unseen Character lesson');
backpack.openCharacter();assert.equal(backpack.opened.at(-1),'gear');assert.equal(backpack.sent.at(-1).panel,'gear','opening Character explicitly acknowledges the equipment lesson');
const retry=runtime();retry.player.quest.stage=1;retry.player.quest.progress['grove-slimes']=1;retry.player.onboarding.looted=true;
retry.openCharacter();assert.equal(retry.sent.length,1);assert.equal(retry.sent[0].panel,'bag','opening the shared profile acknowledges backpack before gear');retry.openInventory('grid');assert.equal(retry.sent.length,1);retry.now=500;retry.updateGuideWaypoint(retry.now);assert.equal(retry.sent.length,1,'an open lesson never floods acknowledgements each frame');retry.now=1500;retry.updateGuideWaypoint(retry.now);assert.equal(retry.sent.length,2,'an unconfirmed bag view retries in the shared profile after a busy or failed save');assert.equal(retry.sent.at(-1).panel,'bag');assert(!retry.player.onboarding.bagViewed);
retry.player.onboarding.bagViewed=true;const opens=retry.opened.length;retry.now=3000;retry.updateGuideWaypoint(retry.now);assert.equal(retry.sent.at(-1).panel,'gear','the open profile proceeds to the gear acknowledgement after backpack confirmation');assert.equal(retry.opened.length,opens,'the next lesson needs no close or reopen');retry.player.onboarding.gearViewed=true;const acknowledged=retry.sent.length;retry.now=5000;retry.updateGuideWaypoint(retry.now);assert.equal(retry.sent.length,acknowledged,'confirmed lessons stop retrying');
const hotbarStart=main.indexOf('const hotbar = createHotbar('),hotbarEnd=main.indexOf('\n});',hotbarStart)+4;let hotbarOptions;
runInNewContext(compile(main.slice(hotbarStart,hotbarEnd).replace('const hotbar = ','hotbar = ')),{...g,$:()=>({}),hotbar:null,createHotbar:options=>(hotbarOptions=options),act(){},toast(){}});
assert(hotbarOptions.canEdit());g.player.quest.chapter=0;assert(!hotbarOptions.canEdit(),'hotbar editing obeys the same spellbook unlock');
console.log('PASS onboarding client: actual guide and menu wrappers, collision-aware city route without autowalk, manual override, arrival, respawn, same-character reentry through all three teardown paths, server-clock loot recovery, all lesson destinations, explicit bag/gear acknowledgements, legacy/dungeon/login behavior and hotbar gates.');
