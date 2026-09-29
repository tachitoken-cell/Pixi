import {isInstantCombatInstance} from '../src/instant-combat.ts';
import {instantCombatMap} from '../src/instant-combat-maps.ts';
import { isRaidInstance, RAID_BOUNDS } from '../src/raid.ts';
import { gameKey, bindingLabel } from '../src/keybindings.ts';
import { isHostilePlayer, isHostileTarget, combatCompanionOwner, chooseTarget } from '../src/targeting.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import * as basics from '../src/auto-attacks.ts';
import { SPELLS } from '../src/spells.ts';
import { combatTiming } from '../src/combat-timing.ts';
import { findPath } from '../src/navigation.ts';
import { canTraverse } from '../src/realm.ts';
import { COLOSSEUM } from '../src/colosseum.ts';

const source=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const tree=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const functionText=name=>{
 const node=tree.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
 assert(node,`missing actual ${name}`);return node.getText(tree);
};
const listenerText=(owner,event)=>{
 const node=tree.statements.find(node=>{
  if(!ts.isExpressionStatement(node)||!ts.isCallExpression(node.expression))return false;
  const call=node.expression,method=call.expression;
  return ts.isPropertyAccessExpression(method)&&method.expression.getText(tree)===owner&&method.name.text==='addEventListener'&&ts.isStringLiteral(call.arguments[0])&&call.arguments[0].text===event;
 });
 assert(node,`missing actual ${owner} ${event} handler`);return node.getText(tree);
};
const execute=(text,ctx)=>runInNewContext(ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,ctx);
class Element {closest(){return null;}}
function fixture(){
 const player={id:'local',hp:100,level:10,appearance:{className:'Ranger'},autoAttack:null,casting:null,globalCooldownUntil:90_000,abilityCooldowns:{arrow:90_000}};
 const enemy=(id,x=2)=>({id,x,z:0,hp:100,alive:true,instanceId:null,kind:'moss-slime',zone:'greenwood'});
 const bounds={minX:-30,maxX:60,minZ:-30,maxZ:30};
 const ctx={currentWorldBounds:()=>bounds,isInstantCombatInstance,instantCombatMap,instantCombat:null,specialistNftUI:undefined,worldLoading:false,gameKey,bindingLabel,heldKeyCodes:new Map(),isHostilePlayer,isHostileTarget,combatCompanionOwner,chooseTarget,...basics,THREE,SPELLS,combatTiming,findPath,canTraverse,colliders:[],dungeon:null,dungeonBounds:()=>bounds,WORLD_BOUNDS:bounds,DUNGEON_BOUNDS:bounds,ARENA_BOUNDS:bounds,isRaidInstance,RAID_BOUNDS,isArenaInstance:()=>false,document:{hidden:false},meleeApproach:undefined,player,playerId:player.id,players:[],appearance:player.appearance,
  enemies:[enemy('foe-one'),enemy('foe-two',4)],position:new THREE.Vector3(),rotation:0,worldZone:'greenwood',worldInstance:null,worldDungeonKind:null,
  connected:true,worldReady:true,updateDungeonRoomView(){},entryActive:false,rosterActive:false,selectedId:null,hoveredId:null,autoAttackTarget:null,
  now:10_000,serverOffset:2000,lastMove:0,lastPrimary:10_000,lastAutoAttackRequest:-Infinity,cancelledCast:0,standingChairId:null,dragging:true,dragDistance:0,pointerInWorld:true,
  notices:[],sent:[],played:[],menus:[],actions:[],handlers:{},keys:new Set(),combatAnimations:new Map(),
  modal:false,wet:false,lootOpen:false,gatherCancels:0,castCancels:0,stood:0,closedPanels:0,floor:0,jump:{y:0,grounded:true,velocity:0,sequence:0},climbStopRequested:false,
  panel:{open:false,dataset:{mode:''},contains:()=>false},
  HTMLElement:Element,HTMLInputElement:class extends Element{},HTMLSelectElement:class extends Element{},HTMLTextAreaElement:class extends Element{},HTMLButtonElement:class extends Element{},
 };
 ctx.Date={now:()=>ctx.now};ctx.performance={now:()=>ctx.now};ctx.modalOpen=()=>ctx.modal;
 ctx.waterAt=()=>ctx.wet;ctx.toast=text=>ctx.notices.push(text);ctx.send=message=>ctx.sent.push(message);
 ctx.jumpFloor=()=>ctx.floor;ctx.releaseClimb=()=>{};ctx.syncCollisionState=()=>{};ctx.updateDungeonRoomView=()=>{};
 ctx.standUp=()=>ctx.stood++;ctx.cancelGathering=()=>ctx.gatherCancels++;
 ctx.cancelCasting=()=>{ctx.castCancels++;ctx.cancelledCast=ctx.player?.casting?.startedAt||0;};
 ctx.targetPoints=()=>[...ctx.enemies.filter(e=>e.alive&&e.hp>0&&(e.instanceId??null)===ctx.worldInstance).map(e=>({...e,kind:'enemy'})),...ctx.players.map(p=>({...p,kind:'player'})),...ctx.players.filter(p=>p.combatCompanion?.hp>0).map(p=>({...p.combatCompanion,id:`companion:${p.id}`,kind:'companion'}))];
 ctx.pickTarget=()=>ctx.clicked;ctx.pickPlayer=()=>ctx.clickedPlayer;
 ctx.openPlayerMenu=(other,x,y)=>{ctx.menus.push({other,x,y});ctx.selectedId=other.id;};
 ctx.playerMenu={close(){}};ctx.act=action=>ctx.actions.push(action);
 ctx.floatingPanel=()=>true;ctx.closePanel=()=>{ctx.closedPanels++;ctx.panel.open=false;};
 ctx.nftUI={isOpen:()=>false,close(){}};ctx.storeUI={isOpen:()=>false,close(){}};ctx.achievementsUI={isOpen:()=>false};ctx.friendsUI={isOpen:()=>false};ctx.pollUI={isOpen:()=>false};ctx.gmUI={isOpen:()=>false,close(){}};ctx.bankUI={isOpen:()=>false,close(){}};
 ctx.lootUI={isOpen:()=>ctx.lootOpen,close:()=>{ctx.lootOpen=false;}};
 ctx.hotbar={predictCast:()=>assert.fail('basic attacks must not predict a spell cast/GCD'),activateSlot(){}};
 ctx.combatEffects={play:(...args)=>ctx.played.push(args),clear(){}};ctx.monsterEffects={clear(){}};ctx.damageNumbers={clear(){}};ctx.sounds=[];ctx.updateAudioScene=()=>{};ctx.gameAudio={play:sound=>ctx.sounds.push(sound),reset(){},setScene(){}};
 for(const owner of ['canvas','window'])ctx[owner]={focus(){},addEventListener:(event,handler)=>{ctx.handlers[`${owner}:${event}`]=handler;}};
 execute(['clearMovementKeys','gmFlying','beginMeleeApproach','meleeApproachInput','setAutoAttack','autoAttackSelectionValid','reconcileAutoAttack','rejectAutoAttack','clearCombat','playCombat','combatPose','selectNextFoe','toggleAutoAttack'].map(functionText).join('\n'),ctx);
 ctx.travelSpeed=()=>5;ctx.freeAt=(x,z)=>canTraverse(ctx.position,{x,z},ctx.colliders,bounds);
 const frameStart=source.indexOf(' const charging='),frameEnd=source.indexOf(' if(isMoving&&',frameStart);
 assert(frameStart>=0&&frameEnd>frameStart);
 execute('function moveFrame(dt,now){const flightNow=Date.now()+serverOffset;'+source.slice(frameStart,frameEnd)+'}',ctx);
 for(const [owner,event] of [['canvas','pointerup'],['canvas','contextmenu'],['window','keydown']])execute(listenerText(owner,event),ctx);
 return ctx;
}
const requests=ctx=>ctx.sent.filter(message=>message.type==='autoAttack');
const target=ctx=>requests(ctx).at(-1)?.targetId;
const key=(ctx,value,extra={})=>ctx.handlers['window:keydown']({key:value,target:null,repeat:false,preventDefault(){},...extra});
const right=(ctx,point)=>{ctx.clicked=point;ctx.handlers['canvas:contextmenu']({clientX:120,clientY:80,preventDefault(){}});};
const left=(ctx,point)=>{ctx.clicked=point;ctx.dragging=true;ctx.dragDistance=0;ctx.handlers['canvas:pointerup']({clientX:120,clientY:80});};
const point=(ctx,index=0)=>({...ctx.enemies[index],kind:'enemy'});

// One explicit ranged start authorizes server cadence without movement or repeated attack requests.
const start=fixture(),origin=start.position.clone();right(start,point(start));
assert.equal(target(start),'foe-one');assert.equal(start.selectedId,'foe-one');assert.equal(start.autoAttackTarget,'foe-one');
assert.equal(start.actions.length,0,'right-clicking a foe does not invoke an ability or interaction');
assert.equal(start.player.casting,null);assert.equal(start.player.globalCooldownUntil,90_000,'starting during GCD never changes spell readiness');
assert.deepEqual(start.player.abilityCooldowns,{arrow:90_000});assert.equal(start.lastPrimary,10_000);
const started=requests(start).length;right(start,point(start));
for(let frame=0;frame<120;frame++)start.reconcileAutoAttack();
assert.equal(requests(start).length,started,'repeated click/reconciliation never floods start requests');
assert(start.position.equals(origin));assert.equal(start.keys.size,0);assert(!start.sent.some(m=>m.type==='move'||m.type==='attack'),'basic attack selection does not walk or cast');
start.now+=500;right(start,point(start));assert.equal(requests(start).length,started,'a pending request is not retried within the first second');
start.now+=600;start.reconcileAutoAttack();assert.equal(requests(start).length,started,'an unacknowledged start is never retried automatically');
right(start,point(start));assert.equal(requests(start).length,started+1,'explicit right-click can retry a rejected or unacknowledged start after one second');
start.player.autoAttack={targetId:'foe-one',nextAttackAt:start.now+2000};start.now+=10_000;
right(start,point(start));assert.equal(requests(start).length,started+1,'a server-confirmed active target never needs a duplicate start');
right(start,point(start,1));assert.equal(target(start),'foe-two');assert.equal(start.autoAttackTarget,'foe-two','right-clicking a new enemy retargets');
left(start,point(start,0));start.reconcileAutoAttack();assert.equal(target(start),null);assert.equal(start.autoAttackTarget,null,'left-selecting another target stops instead of retargeting combat');
const stopped=requests(start).length;for(let frame=0;frame<60;frame++)start.reconcileAutoAttack();assert.equal(requests(start).length,stopped,'waiting for the stop snapshot never sends a stop every frame');

// A save rejection must undo optimistic intent, without authorizing an automatic retry.
const rejectedEvent=source.match(/^   if\(msg.kind==='info'.*rejectAutoAttack\(\);$/m)?.[0];assert(rejectedEvent,'the actual event handler must reconcile rejected starts');
const saving=(ctx,message={kind:'info',requestType:'autoAttack',text:'Saving your changes…'})=>{ctx.msg=message;execute(rejectedEvent,ctx);};
for(const className of Object.keys(basics.AUTO_ATTACKS)){
 const c=fixture();c.player.appearance.className=className;right(c,point(c));c.keys.add('w');
 const count=requests(c).length,selected=c.selectedId;
 saving(c);assert.equal(c.autoAttackTarget,null,`${className}: rejected start is no longer shown as active`);
 assert.equal(c.selectedId,selected,'rejection preserves the selected target');assert(c.keys.has('w'),'manual movement is preserved');
 assert(!c.keys.has('attack-approach'));assert.equal(c.meleeApproach,undefined,'a rejected melee start cannot keep walking toward its target');
 c.now+=60_000;for(let frame=0;frame<120;frame++)c.reconcileAutoAttack();assert.equal(requests(c).length,count,'rejection never retries on its own');
 c.hotbar.activateSlot=index=>c.actions.push(index);key(c,'1');assert.equal(c.actions.at(-1),0,`${className}: hotbar input remains usable`);
 assert.equal(c.player.casting,null);assert.equal(c.player.globalCooldownUntil,90_000,'rejection never fabricates spell readiness');
 right(c,point(c));assert.equal(requests(c).length,count+1,'an explicit start still works after the rejected save');
 saving(c);right(c,point(c));assert.equal(requests(c).length,count+2,'a known rejection removes the one-second pending-request suppression');
 c.player.autoAttack={targetId:'foe-one',nextAttackAt:c.now+2000};c.setAutoAttack(null);const beforeReject=requests(c).length;
 saving(c);assert.equal(c.autoAttackTarget,'foe-one','a rejected stop restores the authoritative active target');
 for(let frame=0;frame<120;frame++)c.reconcileAutoAttack();assert.equal(requests(c).length,beforeReject,'restoring confirmed intent sends no requests');
}
for(const message of [{kind:'info',requestType:'attack',text:'Saving your changes…'},{kind:'chat',requestType:'autoAttack',text:'Saving your changes…'},{kind:'info',requestType:'autoAttack',text:'Other event'}]){
 const c=fixture();right(c,point(c));saving(c,message);assert.equal(c.autoAttackTarget,'foe-one','unrelated events never cancel attack intent');
}
for(const failure of ['retarget','dead-target','missing-target']){
 const c=fixture();right(c,point(c));c.player.autoAttack={targetId:'foe-one',nextAttackAt:c.now+2000};
 if(failure==='retarget')right(c,point(c,1));
 if(failure==='dead-target')c.enemies[0].alive=false;
 if(failure==='missing-target')c.enemies.shift();
 const before=requests(c).length,selected=c.selectedId;saving(c);
 assert.equal(c.autoAttackTarget,null,`${failure}: invalid confirmed target does not restore rejected local intent`);
 assert.equal(c.selectedId,selected,'rejection never changes the selected target');assert.equal(c.player.autoAttack.targetId,'foe-one','authoritative snapshots remain untouched');
 for(let frame=0;frame<120;frame++){
  const count=requests(c).length;c.reconcileAutoAttack();if(requests(c).length!==count)saving(c);
 }
 assert.equal(requests(c).length,before,`${failure}: rejection and reconciliation never create a stop/reject loop`);
}

const distant=fixture();distant.enemies[0].x=40;right(distant,point(distant));assert.equal(target(distant),'foe-one','explicit distant targets may wait for manual movement into weapon range');
for(let frame=0;frame<30;frame++)distant.reconcileAutoAttack();assert(distant.position.equals(new THREE.Vector3()));assert(!distant.sent.some(m=>m.type==='move'));
const empty=fixture();empty.selectedId='foe-one';empty.hoveredId='foe-two';right(empty,undefined);assert.equal(requests(empty).length,0,'empty ground does not start on a selected or nearby foe');
empty.selectedId=null;key(empty,'t');assert.equal(target(empty),'foe-one','T acquires the closest foe without a selection');
key(empty,'t');assert.equal(target(empty),null,'T toggles off without acquiring another foe');
empty.selectedId='foe-two';key(empty,'t');assert.equal(target(empty),'foe-one','the attack button acquires the closest foe even with another hostile selected');key(empty,'t');
for(const className of Object.keys(basics.AUTO_ATTACKS))for(const selectedId of [null,'old-remains','friend']){
 const c=fixture();c.player.appearance.className=className;c.selectedId=selectedId;c.players=[{id:'friend',hp:100,x:.5,z:0}];
 c.enemies.reverse();key(c,'t');assert.equal(target(c),'foe-one',`${className} acquires the closest hostile when selection is ${selectedId}`);
}
for(const failure of ['missing','dead','zero-hp','other-instance','distant']){
 const c=fixture();c.selectedId=null;
 if(failure==='missing')c.enemies.shift();if(failure==='dead')c.enemies[0].alive=false;if(failure==='zero-hp')c.enemies[0].hp=0;if(failure==='other-instance')c.enemies[0].instanceId='another-vault';if(failure==='distant')c.enemies[0].x=30;
 key(c,'t');assert.equal(target(c),'foe-two',`closest acquisition skips ${failure} enemies`);
}
const noFoe=fixture();noFoe.enemies.forEach(enemy=>enemy.x=30);key(noFoe,'t');assert.equal(requests(noFoe).length,0,'automatic acquisition stays within the nearby target radius');
assert(noFoe.notices.includes('No nearby foe.'));
const nearestPvp=fixture();nearestPvp.player.pvp=true;nearestPvp.players=[{id:'hostile',hp:100,pvp:true,x:1,z:0}];key(nearestPvp,'t');assert.equal(target(nearestPvp),'hostile','nearest acquisition respects PvP hostility');

for(const failure of ['missing','dead','other-instance','player-dead','selection-cleared']){
 const c=fixture();right(c,point(c));
 if(failure==='missing')c.enemies=[];
 if(failure==='dead')c.enemies[0].alive=false;
 if(failure==='other-instance')c.enemies[0].instanceId='another-vault';
 if(failure==='player-dead')c.player.hp=0;
 if(failure==='selection-cleared')c.selectedId=null;
 c.reconcileAutoAttack();assert.equal(target(c),null,`${failure} stops the selected auto attack`);
 assert.equal(c.autoAttackTarget,null);assert(!requests(c).some(m=>m.targetId==='foe-two'),'invalid targets never fall back to the nearest foe');
}
for(const failure of ['missing','dead','other-instance']){
 const c=fixture();if(failure==='missing')c.enemies.shift();if(failure==='dead')c.enemies[0].alive=false;if(failure==='other-instance')c.enemies[0].instanceId='another-vault';
 c.setAutoAttack('foe-one');assert(!requests(c).some(m=>m.targetId==='foe-one'),`a ${failure} target cannot start combat`);
}
for(const [field,value] of [['connected',false],['worldReady',false],['modal',true]]){
 const c=fixture();c[field]=value;right(c,point(c));assert(!requests(c).some(m=>m.targetId),`${field} blocks starting combat`);
}
const dead=fixture();dead.player.hp=0;right(dead,point(dead));assert.equal(requests(dead).length,0);
const swimming=fixture();swimming.wet=true;right(swimming,point(swimming));assert.equal(target(swimming),'foe-one','arming while swimming leaves pause/resume timing to the authoritative server');

const duel=fixture(),opponent={id:'duelist',hp:100,instanceId:'arena-match-1',x:2,z:0,pvp:false,arenaPhase:'active',arenaMatchId:'match-1',arenaTeam:1};
duel.worldInstance='arena-match-1';duel.players.push(opponent);duel.clickedPlayer=opponent;Object.assign(duel.player,{pvp:false,arenaPhase:'active',instanceId:'arena-match-1',arenaMatchId:'match-1',arenaTeam:0});
right(duel,undefined);assert.equal(target(duel),opponent.id,'right-clicking an accepted opponent starts PvP auto attack');
assert.equal(duel.menus.length,0,'duel right-click attacks without opening the social menu');
for(let frame=0;frame<10;frame++)duel.reconcileAutoAttack();
assert.equal(requests(duel).length,1,'duel auto attacks use the server cadence');
duel.player.arenaPhase=null;duel.player.arenaMatchId=null;duel.reconcileAutoAttack();assert.equal(target(duel),null,'a finished duel immediately stops client auto attack');
duel.setAutoAttack(opponent.id);assert.equal(target(duel),null,'the former opponent is friendly after the duel');
for(const [name,change] of [['countdown',{arenaPhase:'countdown'}],['another match',{arenaMatchId:'match-2'}],['teammate',{arenaTeam:0}],['knocked out',{arenaEliminated:true}],['missing team',{arenaTeam:undefined}]]){
 const c=fixture(),other={...opponent,...change};Object.assign(c.player,{pvp:false,arenaPhase:'active',instanceId:'arena-match-1',arenaMatchId:'match-1',arenaTeam:0});c.worldInstance='arena-match-1';c.players=[other];c.clickedPlayer=other;
 right(c,undefined);assert(!requests(c).some(m=>m.targetId===other.id),`${name} never starts a hostile auto attack`);assert.equal(c.menus.at(-1)?.other.id,other.id,`${name} preserves social right-click`);
}
const eliminated=fixture();Object.assign(eliminated.player,{pvp:false,arenaPhase:'active',instanceId:'arena-match-1',arenaMatchId:'match-1',arenaTeam:0});eliminated.worldInstance='arena-match-1';eliminated.players=[opponent];eliminated.clickedPlayer=opponent;
right(eliminated,undefined);eliminated.player.arenaEliminated=true;eliminated.reconcileAutoAttack();assert.equal(target(eliminated),null,'a local knockout immediately cancels combat');

for(const mode of ['duel','world-pvp']){const c=fixture(),other={id:'legacy-opponent',hp:100,instanceId:null,x:2,z:0};c.players=[other];c.clickedPlayer=other;if(mode==='duel')c.player.duelOpponentId=other.id;else c.player.pvp=other.pvp=true;right(c,undefined);assert.equal(target(c),other.id,`${mode} still starts automatic combat outside private arenas`);if(mode==='duel')c.player.duelOpponentId=null;else other.pvp=false;c.reconcileAutoAttack();assert.equal(target(c),null,`${mode} still stops on its original combat boundary`);}

const social=fixture();right(social,point(social));social.clickedPlayer={id:'friend',hp:100};right(social,point(social));social.reconcileAutoAttack();
assert.equal(social.menus.at(-1).other.id,'friend');assert.equal(target(social),null,'social player selection stops the hostile attack');assert(!requests(social).some(m=>m.targetId==='friend'));assert.equal(social.actions.length,0);
const tab=fixture();right(tab,point(tab));key(tab,'Tab');tab.reconcileAutoAttack();assert.equal(tab.selectedId,'foe-two');assert.equal(target(tab),null,'Tab changes target without starting another attack');
for(const state of ['normal','casting','seated','loot','panel','training','modal']){
 const c=fixture();right(c,point(c));
 if(state==='casting')c.player.casting={ability:'fireball',startedAt:9000,endsAt:12000};
 if(state==='seated')c.player.seated={chairId:'chair'};
 if(state==='loot')c.lootOpen=true;
 if(state==='panel'||state==='training'){c.panel.open=true;c.panel.dataset.mode=state==='training'?'training':'gear';}
 if(state==='modal')c.modal=true;
 key(c,'Escape');assert.equal(target(c),null,`Escape stops auto attack even while ${state}`);assert.equal(c.autoAttackTarget,null);
}
const typing=fixture();right(typing,point(typing));key(typing,'t',{target:new typing.HTMLInputElement()});assert.equal(typing.autoAttackTarget,'foe-one','typing does not trigger combat shortcuts');
typing.clearCombat();assert.equal(typing.autoAttackTarget,null,'disconnect/instance teardown forgets local automatic combat');

// Companion targeting follows the owner's PvP consent and never pursues a player automatically.
const petFight=fixture(),petOwner={id:'pet-owner',hp:100,pvp:true,instanceId:null,combatCompanion:{kind:'bramble-wolf',level:10,hp:100,maxHp:100,x:COLOSSEUM.x+12,z:0}};
petFight.position.x=COLOSSEUM.x;for(const enemy of petFight.enemies)enemy.x+=COLOSSEUM.x;
petFight.players=[petOwner];petFight.player.pvp=true;petFight.player.appearance.className='Knight';
const petPoint=petFight.targetPoints().find(point=>point.kind==='companion');
left(petFight,petPoint);assert.equal(petFight.selectedId,'companion:pet-owner');assert.equal(requests(petFight).length,0,'selecting a pet does not attack');
right(petFight,petPoint);assert.equal(target(petFight),'companion:pet-owner');assert(!petFight.keys.has('attack-approach'),'attacking a hostile pet never pulls its attacker into melee');
petFight.reconcileAutoAttack();assert.equal(requests(petFight).length,1,'a living hostile companion remains selected');
petFight.selectedId='foe-two';petFight.selectNextFoe();assert.equal(petFight.selectedId,petPoint.id,'Tab and mobile target cycling include hostile companions');
petOwner.pvp=false;petFight.reconcileAutoAttack();assert.equal(target(petFight),null,'a pet becomes safe when its owner leaves PvP');
petOwner.pvp=true;petFight.setAutoAttack(petPoint.id);petOwner.combatCompanion.hp=0;petFight.reconcileAutoAttack();assert.equal(target(petFight),null,'a defeated companion cancels automatic attacks');
petOwner.combatCompanion.hp=100;petOwner.instanceId='elsewhere';petFight.setAutoAttack(petPoint.id);assert.equal(target(petFight),null,'pets in another instance cannot be attacked');

// Intentional PvE melee approach uses the real frame movement and collision path.
const advance=c=>{c.now+=50;c.moveFrame(.05,c.now);};
for(const className of ['Knight','Cleric']){
 const c=fixture();c.player.appearance.className=className;c.enemies[0].x=12;c.yaw=0;
 c.colliders=[{x:6,z:0,r:0,halfWidth:1,halfDepth:2}];
 left(c,point(c));advance(c);assert.equal(c.position.x,0,'selection alone never starts approach');
 right(c,point(c));assert(c.keys.has('attack-approach'));
 for(let i=0;i<240;i++){const before=c.position.clone();advance(c);assert(canTraverse(before,c.position,c.colliders,c.WORLD_BOUNDS),'approach follows collision-safe movement');}
 assert(Math.hypot(c.enemies[0].x-c.position.x,c.enemies[0].z-c.position.z)<=basics.AUTO_ATTACKS[className].range,'approach reaches melee range around the obstacle');
 const arrived=c.position.clone();advance(c);assert(c.position.equals(arrived),'approach stops inside range');
 assert.equal(requests(c).length,1,'approach never floods attack requests or changes attack cadence');
 c.enemies[0].x+=4;advance(c);assert(!c.position.equals(arrived),'the same moving target remains approachable');
 key(c,'w');assert(!c.keys.has('attack-approach'),'manual keyboard movement immediately cancels approach');
 c.keys.clear();const manuallyStopped=c.position.clone();advance(c);assert(c.position.equals(manuallyStopped),'approach does not resume after manual movement ends');
 c.player.autoAttack={targetId:'foe-one'};right(c,point(c));assert(c.keys.has('attack-approach'),'a new explicit attack can resume approach without duplicating the server attack');
 c.clearMovementKeys();assert.equal(c.meleeApproachInput(c.now),undefined,'existing touch/menu/blur/correction input reset also cancels approach');
}
for(const stop of ['target-change','target-dead','player-dead','disconnect','instance-change','hidden','Escape','stop','manual-touch','class-change']){
 const c=fixture();c.yaw=0;c.player.appearance.className='Knight';c.enemies[0].x=12;right(c,point(c));
 if(stop==='target-change')c.selectedId='foe-two';if(stop==='target-dead')c.enemies[0].alive=false;
 if(stop==='player-dead')c.player.hp=0;if(stop==='disconnect')c.connected=false;if(stop==='instance-change')c.worldInstance='other';
 if(stop==='hidden')c.document.hidden=true;if(stop==='Escape')key(c,'Escape');if(stop==='stop')c.setAutoAttack(null);
 if(stop==='manual-touch')c.clearMovementKeys();if(stop==='class-change')c.player.appearance.className='Mage';
 assert.equal(c.meleeApproachInput(c.now),undefined,`${stop} cancels approach`);assert(!c.keys.has('attack-approach'));
}
const blocked=fixture();blocked.player.appearance.className='Knight';blocked.enemies[0].x=12;blocked.colliders=[{x:6,z:0,r:0,halfWidth:1,halfDepth:35}];
right(blocked,point(blocked));assert(!blocked.keys.has('attack-approach'));assert(blocked.notices.some(text=>/No clear route/.test(text)));assert(!requests(blocked).some(m=>m.targetId),'unreachable attack does not leave combat armed');
for(const instanceId of [null,'dungeon-test']){
 const elevated=fixture();elevated.worldInstance=instanceId;elevated.enemies[0].instanceId=instanceId;elevated.player.appearance.className='Knight';elevated.enemies[0].x=12;
 elevated.floor=20;elevated.jump.y=21;elevated.position.y=21;elevated.colliders=[{x:0,z:0,r:2}];
 right(elevated,point(elevated));assert.equal(target(elevated),'foe-one','an elevated Knight can arm an attack even inside a ground collider footprint');
 assert(!elevated.keys.has('attack-approach'));assert.equal(elevated.notices.length,0);
 const origin=elevated.position.clone();for(let i=0;i<10;i++)advance(elevated);
 assert(elevated.position.equals(origin),'elevated auto attacks never walk the player toward an edge');
 assert.equal(requests(elevated).length,1,'the server owns elevated attack timing and reach');
}
const climbDuringApproach=fixture();climbDuringApproach.player.appearance.className='Knight';climbDuringApproach.enemies[0].x=12;
right(climbDuringApproach,point(climbDuringApproach));assert(climbDuringApproach.keys.has('attack-approach'));
climbDuringApproach.jump.y=1;const supported=climbDuringApproach.position.clone();advance(climbDuringApproach);
assert(!climbDuringApproach.keys.has('attack-approach'));assert(climbDuringApproach.position.equals(supported),'gaining elevation cancels an existing ground route before movement');
assert.equal(climbDuringApproach.autoAttackTarget,'foe-one','cancelling approach leaves the server-authoritative attack armed');
climbDuringApproach.jump.y=0;advance(climbDuringApproach);assert(!climbDuringApproach.keys.has('attack-approach'),'landing does not silently resume the old route');
const stalled=fixture();stalled.player.appearance.className='Knight';stalled.enemies[0].x=12;right(stalled,point(stalled));stalled.now+=1600;
assert.equal(stalled.meleeApproachInput(stalled.now),undefined);assert.equal(target(stalled),null,'a terrain-blocked approach stops instead of walking forever');
const casting=fixture();casting.player.appearance.className='Knight';casting.enemies[0].x=12;right(casting,point(casting));casting.player.casting={startedAt:1};casting.now+=2000;
assert.equal(casting.meleeApproachInput(casting.now),undefined,'approach waits for an active spell');casting.player.casting=null;assert(casting.meleeApproachInput(casting.now),'approach resumes after the spell without a false stall');
const mounted=fixture();mounted.player.appearance.className='Knight';mounted.enemies[0].x=12;mounted.player.travel={mount:'horse'};
right(mounted,point(mounted));const mountedStart=mounted.position.clone();mounted.now+=2000;mounted.moveFrame(.05,mounted.now);
assert(mounted.position.equals(mountedStart),'approach waits for authoritative dismount instead of sending mounted-speed movement');
mounted.player.travel.mount=null;advance(mounted);assert(!mounted.position.equals(mountedStart),'approach resumes after dismount without falsely timing out');
const meleePvp=fixture();meleePvp.player.appearance.className='Knight';meleePvp.player.pvp=true;meleePvp.players=[{id:'hostile-player',hp:100,pvp:true,instanceId:null,x:12,z:0}];meleePvp.setAutoAttack('hostile-player');
assert(!meleePvp.keys.has('attack-approach'),'PvP never gains automatic pursuit');

// Basic releases reuse class visuals but remain independent of spell preparation and readiness.
for(const [className,definition] of Object.entries(basics.AUTO_ATTACKS)){
 const c=fixture();c.appearance.className=className;
 const event={type:'combat',playerId:c.playerId,ability:definition.ability,basic:true,startedAt:c.now+c.serverOffset,castTimeMs:0,from:{x:0,z:0},rotation:0,targets:[{id:'foe-one',x:2,z:0}]};
 const cooldown=c.player.globalCooldownUntil,abilityCooldowns=JSON.stringify(c.player.abilityCooldowns),inputTime=c.lastPrimary;
 c.playCombat(event);
 assert.deepEqual(c.sounds,[{Ranger:'bow',Knight:'melee',Mage:'magic',Cleric:'magic'}[className]],`${className} basic attacks play their weapon sound`);
 assert.equal(c.played.length,1);assert.equal(c.played[0][0].basic,true,'effect adapter receives the explicit basic flag');
 assert.equal(c.player.casting,null,`${className} basic release creates no cast bar`);
 assert.equal(c.player.globalCooldownUntil,cooldown);assert.equal(JSON.stringify(c.player.abilityCooldowns),abilityCooldowns);assert.equal(c.lastPrimary,inputTime);
 const startedAt=c.now;
 for(const progress of [0,.2,.5,.9]){
  c.now=startedAt+basics.AUTO_ATTACK_ANIMATION_MS*progress;
  const pose=c.combatPose(c.playerId,c.now);
  assert.equal(pose.ability,definition.ability);assert.equal(pose.basic,true);assert.equal(pose.rotation,Math.PI/2);
  assert(Math.abs(pose.progress-progress)<1e-8,`${className} animates the weapon action without spell windup`);
 }
 c.now=startedAt+basics.AUTO_ATTACK_ANIMATION_MS;assert.equal(c.combatPose(c.playerId,c.now),false,'the basic recovery pose ends on its authored duration');
 c.player.casting={ability:definition.ability,startedAt:1000,endsAt:2000,rotation:0};const staleCast=c.player.casting;
 c.playCombat({...event,startedAt:c.now+c.serverOffset});assert.equal(c.player.casting,staleCast,'a basic event must not erase authoritative spell casting state');
}

console.log('PASS auto-attack client: explicit melee approach through real collision-safe frame movement, moving targets and cancellation, elevated manual approach, unreachable/stalled routes, no ranged/PvP pursuit, server-owned attack cadence, selection and Escape stop, and all four basic release/recovery poses.');
