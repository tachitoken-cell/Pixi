import { isInstantCombatInstance } from '../src/instant-combat.ts';
import { instantCombatMap } from '../src/instant-combat-maps.ts';
import {arenaWagerAmount} from '../src/arena-wager.ts';
import {wildBiomeAt} from '../src/world-features.ts';
import { gameKey, bindingLabel } from '../src/keybindings.ts';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {COLOSSEUM,isInColosseum,inColosseumClearing} from '../src/colosseum.ts';
import {ARENA_ENTRANCE,ARENA_ENTRY_RADIUS,ARENA_BOUNDS,ARENA_COLLIDERS,isArenaInstance,isInArena} from '../src/arena.ts';
import {isHostilePlayer,isHostileTarget,combatCompanionOwner,canSupportPlayer,chooseTarget} from '../src/targeting.ts';
import {SPELLS,abilityValid,abilityUnlocked,spellCastTimeMs,legacyAbility,GLOBAL_ATTACK_MS} from '../src/spells.ts';
import {combatStats,starterGear} from '../src/progression.ts';

import {canTraverse,WORLD_COLLIDERS,WORLD_BOUNDS,DUNGEON_BOUNDS} from '../src/realm.ts';
import {getDungeon,dungeonBounds} from '../src/dungeon.ts';
import {isRaidInstance,RAID_BOUNDS} from '../src/raid.ts';
import {newJump,startJump,moveJump,jumpFloor} from '../src/jumping.ts';

const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const tree=ts.createSourceFile('main.ts',main,ts.ScriptTarget.Latest,true);
const functionText=name=>tree.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name).getText(tree);
const listener=(owner,event)=>tree.statements.find(node=>ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)
 &&node.expression.expression.getText(tree)===`${owner}.addEventListener`&&node.expression.arguments[0]?.text===event).getText(tree);
const hero={id:'hero',name:'Hero',pvp:false,arenaPhase:'active',arenaMatchId:'match-1',arenaTeam:0,hp:100,maxHp:100,level:60,instanceId:'arena-match-1',x:0,z:0,appearance:{className:'Knight'},talents:[],...starterGear('Knight'),learnedSpells:Object.keys(SPELLS),inventory:{potion:1}};
const rival={...hero,id:'rival',name:'Rival',arenaTeam:1,x:2},outsider={...hero,id:'outside',pvp:false,arenaPhase:null,arenaMatchId:null,arenaTeam:null,instanceId:null,x:1},corpse={...rival,id:'corpse',hp:0,x:.5};
const teammate={...hero,id:'teammate',name:'Teammate',x:.8},otherMatch={...rival,id:'other-match',arenaMatchId:'match-2',instanceId:'arena-match-2',x:.6},knockedOut={...rival,id:'knocked-out',hp:1,arenaEliminated:true,x:.4};
assert(isHostilePlayer(hero,rival),'living opponents in the same active arena match are hostile');
assert(!isHostilePlayer(hero,hero),'self cannot become an attack target');
for(const other of [outsider,corpse,teammate,otherMatch,knockedOut,{...rival,arenaPhase:'countdown'},{...rival,arenaMatchId:null},{...rival,arenaTeam:undefined},{...rival,instanceId:'dungeon'},{...rival,gm:{flying:true}},undefined])assert(!isHostilePlayer(hero,other));
assert(!isHostilePlayer({...hero,arenaPhase:'countdown'},rival),'safe-side attacker cannot target inside');
assert(!isHostilePlayer({...hero,hp:0},rival));
assert(!isHostilePlayer({...hero,arenaEliminated:true},rival),'a knocked-out player is no longer hostile');
assert(isHostilePlayer({...hero,role:'gm'},rival),'normal game masters can participate');
assert(!isHostilePlayer({...hero,pvp:false,arenaMatchId:null,duelOpponentId:outsider.id},outsider),'legacy opponent IDs cannot authorize combat across instance boundaries');
assert(canSupportPlayer(hero,hero));assert(canSupportPlayer(hero,teammate),'live teammates can support each other');
for(const other of [rival,outsider,otherMatch,knockedOut,{...teammate,arenaEliminated:true},{...teammate,arenaPhase:'countdown'}])assert(!canSupportPlayer(hero,other),'support stays within a living active team');
assert(!canSupportPlayer({...hero,arenaEliminated:true},teammate),'knocked-out players cannot support their teammates');
assert(canSupportPlayer(outsider,{...outsider,id:'world-ally'}),'ordinary world support remains available');
assert(!canSupportPlayer(outsider,teammate),'spectators cannot support match participants');

const sent=[],notices=[],menus=[],handlers={},elements=new Map();
class Element {closest(){return null;}}
const ctx={isInstantCombatInstance,instantCombatMap,instantCombat:null,dungeonBounds,dungeon:null,usesArenaWorld:id=>isArenaInstance(id)||isInstantCombatInstance(id),isRaidInstance,RAID_BOUNDS,worldLoading:false,arenaWagerAmount,isNativeApp:()=>false,gameKey,bindingLabel,heldKeyCodes:new Map(),isArenaInstance,ARENA_BOUNDS,canTraverse,colliders:WORLD_COLLIDERS,WORLD_BOUNDS,getDungeon,ZEPPELIN_PORTS:[],isHostilePlayer,isHostileTarget,combatCompanionOwner,canSupportPlayer,chooseTarget,SPELLS,abilityValid,abilityUnlocked,spellCastTimeMs,combatStats,legacyAbility,GLOBAL_ATTACK_MS,
 player:hero,playerId:hero.id,players:[hero,rival,outsider,corpse,teammate,otherMatch,knockedOut],party:{members:[{id:hero.id},{id:rival.id}]},enemies:[],appearance:hero.appearance,
 selectedId:null,hoveredId:null,autoAttackTarget:null,lastAutoAttackRequest:-Infinity,position:{x:0,z:0},rotation:0,worldZone:'greenwood',worldInstance:'arena-match-1',
 connected:true,worldReady:true,rosterActive:false,entryActive:false,pointerInWorld:true,lastPrimary:-Infinity,lastMove:0,serverOffset:0,cancelledCast:-1,
 jump:{grounded:true},isMoving:false,performance:{now:()=>10000},Date,keys:new Set(),panel:{open:false,contains:()=>false},
 modalOpen:()=>false,gmFlying:()=>false,waterAt:()=>false,jumpFloor,currentCollisionScene:()=>undefined,standUp(){},cancelGathering(){},
 toast:text=>notices.push(text),send:message=>sent.push(message),openPlayerMenu:other=>menus.push(other.id),playerMenu:{close(){}},
 pickPlayer:()=>ctx.picked,pickTarget:()=>undefined,
 hotbar:{sync(){},predictCast(){},activateSlot(){}},
 HTMLElement:Element,HTMLInputElement:class extends Element{},HTMLSelectElement:class extends Element{},HTMLTextAreaElement:class extends Element{},HTMLButtonElement:class extends Element{},
 $:id=>{if(!elements.has(id))elements.set(id,{hidden:true,style:{},dataset:{},addEventListener:(event,handler)=>handlers[`${id}:${event}`]=handler});return elements.get(id)},
 canvas:{focus(){},addEventListener:(event,handler)=>handlers[`canvas:${event}`]=handler},window:{addEventListener:(event,handler)=>handlers[`window:${event}`]=handler}};
ctx.targetPoints=()=>ctx.players.map(p=>({...p,kind:'player'}));
const execute=code=>runInNewContext(stripTypeScriptTypes(code),ctx);
for(const name of ['currentWorldBounds','clearMovementKeys','localSwimming','selectNextFoe','setAutoAttack','autoAttackSelectionValid','reconcileAutoAttack','act'])execute(functionText(name));
for(const [owner,event] of [['canvas','contextmenu'],['window','keydown'],["$('labels')",'contextmenu'],["$('labels')",'keydown']])execute(listener(owner,event));
const event={key:'Tab',target:null,repeat:false,clientX:10,clientY:20,preventDefault(){},stopPropagation(){}};
const attack=()=>sent.filter(m=>m.type==='attack').at(-1);
const reset=()=>{sent.length=0;notices.length=0;ctx.lastPrimary=-Infinity;ctx.autoAttackTarget=null;ctx.lastAutoAttackRequest=-Infinity;};
handlers['window:keydown'](event);assert.equal(ctx.selectedId,rival.id,'Tab selects only opponents in this active match, even if another target is nearer');
ctx.picked=rival;handlers['canvas:contextmenu'](event);assert.equal(sent.at(-1).targetId,rival.id);assert.equal(sent.at(-1).type,'autoAttack');assert.equal(menus.length,0,'right-click attacks without a consent menu');
rival.arenaPhase='countdown';ctx.reconcileAutoAttack();assert.equal(sent.at(-1).targetId,null,'an inactive opponent immediately cancels auto attack');
ctx.picked=rival;handlers['canvas:contextmenu'](event);assert.equal(menus.at(-1),rival.id,'outside players regain social right-click');
rival.arenaPhase='active';reset();ctx.selectedId=rival.id;ctx.act('strike');assert.equal(attack()?.targetId,rival.id,'targeted abilities use the same hostile predicate');
for(const other of [outsider,teammate,otherMatch,knockedOut]){reset();ctx.selectedId=other.id;ctx.act('strike');assert.equal(sent.length,0,'explicit nonhostile selection cannot attack or retarget someone else');}
reset();ctx.selectedId=null;ctx.act('strike');assert.equal(attack()?.targetId,rival.id,'nearest hostile fallback includes arena players');
reset();ctx.appearance={className:'Cleric'};ctx.selectedId=rival.id;ctx.act('flash-heal');assert.equal(attack()?.targetId,undefined,'a hostile selection never receives support');assert(attack(),'healing defaults to self inside');
reset();ctx.selectedId=outsider.id;ctx.act('flash-heal');assert.equal(sent.length,0,'arena players cannot support safe-side players');
reset();ctx.selectedId=teammate.id;ctx.act('flash-heal');assert.equal(attack()?.targetId,teammate.id,'2v2 teammates can heal each other');
for(const other of [otherMatch,{...teammate,arenaEliminated:true}]){const original=ctx.players;ctx.players=[other];reset();ctx.selectedId=other.id;ctx.act('flash-heal');assert.equal(sent.length,0,'other matches and knocked-out teammates cannot receive support');ctx.players=original;}
hero.arenaPhase=null;hero.arenaMatchId=null;hero.instanceId=null;reset();ctx.selectedId=rival.id;ctx.act('flash-heal');assert.equal(sent.length,0,'outside players cannot support arena participants');
hero.arenaPhase='active';hero.arenaMatchId='match-1';hero.instanceId='arena-match-1';ctx.appearance=hero.appearance;
for(const changes of [{arenaPhase:'countdown'},{arenaEliminated:true}]){
 Object.assign(hero,changes);for(const [spell,className] of [['strike','Knight'],['flash-heal','Cleric']]){reset();ctx.appearance={className};ctx.selectedId=spell==='strike'?rival.id:teammate.id;ctx.act(spell);assert.equal(sent.length,0,'countdown and local knockout block both damage and support abilities');}
 hero.arenaPhase='active';hero.arenaEliminated=false;ctx.appearance=hero.appearance;
}
for(const type of ['contextmenu','keydown']){reset();const plate={dataset:{playerId:rival.id},getBoundingClientRect:()=>({left:5,bottom:10})};handlers[`labels:${type}`]({...event,key:'Enter',target:{closest:()=>plate}});assert.equal(sent.at(-1)?.targetId,rival.id,`${type} on a hostile nameplate starts combat`);}

// Arena HUD remains separate from the lethal overworld ring.
Object.assign(ctx,{document:{body:{classList:{contains:()=>false}}},wildBiomeAt,COLOSSEUM,ARENA_ENTRANCE,ARENA_ENTRY_RADIUS,isInColosseum,inColosseumClearing,isArenaInstance,isRaidInstance:()=>false,raid:null,dungeon:null,VILLAGES:[],EXPEDITIONS:[],lastLocationRegion:'greenwood',surfaceAt:()=>({zone:'greenwood',regionId:'greenwood'}),getZone:()=>({name:'Greenwood'}),regionLevelLabel:()=>'Lv 1–5'});
execute(functionText('updateLocation'));
ctx.arena={size:2};ctx.position={x:0,z:0};ctx.worldInstance='arena-match-1';
for(const [state,title,detail] of [[{arenaPhase:'countdown',arenaEliminated:false},/GET READY/,/countdown/],[{arenaPhase:'active',arenaEliminated:false},/FIGHT/,/Opponents only.*1 HP/],[{arenaPhase:'active',arenaEliminated:true},/KNOCKED OUT/,/Watch your team/]]){Object.assign(hero,state);ctx.updateLocation();assert(!elements.get('pvp-state').hidden);assert.equal(elements.get('pvp-state').dataset.active,'false','private matches never set world PvP');assert.match(elements.get('pvp-title').textContent,title);assert.match(elements.get('pvp-detail').textContent,detail);assert.match(elements.get('zone-location').textContent,/2v2.*Private match[\s\S]*Thornring Arena/);}
ctx.worldInstance=null;ctx.position={...ARENA_ENTRANCE};Object.assign(hero,{arenaPhase:null,arenaMatchId:null,instanceId:null,arenaEliminated:false});ctx.updateLocation();assert.match(elements.get('pvp-title').textContent,/ARENA MATCHES.*ENTRANCE/);assert.match(elements.get('pvp-detail').textContent,/Open Arena \(U\).*Solo, 2v2 or 3v3.*anywhere/);

// Challenge eligibility and dispatch use the actual main client functions.
let busy=false;const challenger={...hero,pvp:false,arenaPhase:null,arenaMatchId:null,arenaEliminated:false,instanceId:null,zone:ARENA_ENTRANCE.zone,x:ARENA_ENTRANCE.x,z:ARENA_ENTRANCE.z},challenged={...challenger,id:'challenged'},partner={...challenger,id:'partner'};
Object.assign(ctx,{player:challenger,playerId:challenger.id,players:[challenger,challenged,partner],party:null,arenaUI:{busy:()=>busy},duelUI:{busy:()=>false},worldInstance:null});
for(const name of ['fighterUnavailable','challengeUnavailable','duelChallengeReason','arenaEntryReason','arenaChallengeReason','arenaQueueReason','playerAction'])execute(functionText(name));
assert.equal(ctx.duelChallengeReason(challenged),'','ordinary Duel is available at the safe arena entrance');
assert(!ctx.arenaChallengeReason(challenged,1));assert(!!ctx.arenaChallengeReason(challenged,2),'solo players cannot send 2v2');
assert(!!ctx.arenaChallengeReason(challenger,1),'self challenges are excluded');
for(const changes of [{hp:0},{hp:1},{casting:{ability:'heal'}},{jump:{grounded:false}},{duelOpponentId:'busy-duel'},{pvp:true},{instanceId:'vault'},{zeppelin:{}},{arenaMatchId:'busy'},{gm:{flying:true}},{gm:{invisible:true}}])for(const side of ['self','other']){
 const original=ctx.player;ctx.player=side==='self'?{...challenger,...changes}:challenger;
 assert(!!ctx.arenaChallengeReason(side==='other'?{...challenged,...changes}:challenged,1),`${side} must be living, visible and available to enter an arena`);ctx.player=original;
}
busy=true;assert(!!ctx.arenaChallengeReason(challenged,1),'a pending challenge blocks a second invitation');busy=false;
for(const field of ['connected','entryActive','rosterActive']){const original=ctx[field];ctx[field]=field==='connected'?false:true;assert(!!ctx.arenaChallengeReason(challenged,1));ctx[field]=original;}
ctx.party={leaderId:challenger.id,members:[challenger,partner]};assert(!ctx.arenaChallengeReason(challenged,2),'exactly two party members enable a leader challenge');assert(!!ctx.arenaChallengeReason(partner,2),'a party cannot challenge itself');
ctx.party.leaderId=partner.id;assert(!!ctx.arenaChallengeReason(challenged,2),'only the party leader can propose 2v2');ctx.party.leaderId=challenger.id;
ctx.party.members.push({...partner,id:'third'});assert(!!ctx.arenaChallengeReason(challenged,2),'three-member parties cannot silently drop a teammate');ctx.party.members.pop();
ctx.players=[challenger,challenged];assert.equal(ctx.arenaChallengeReason(challenged,2),'','teammates may be outside the local snapshot; server validates availability');ctx.players.push({...partner,x:0,z:0});assert.equal(ctx.arenaChallengeReason(challenged,2),'','teammates can be away from the entrance');ctx.players=[challenger,challenged,partner];
assert.match(ctx.arenaQueueReason(),/Leave your party/,'solo queue never silently drops a teammate');ctx.party=null;assert.equal(ctx.arenaQueueReason(),'');busy=true;assert.match(ctx.arenaQueueReason(),/current challenge/);busy=false;ctx.party={leaderId:challenger.id,members:[challenger,partner]};
ctx.party=null;
for(const changes of [{x:0,z:0},{casting:{ability:'heal'}},{jump:{grounded:false}},{pvp:true},{instanceId:'vault'},{zeppelin:{}},{seated:{chairId:'chair'}}]){
 ctx.player={...challenger,...changes};assert.equal(ctx.arenaQueueReason(),'','queueing remains available across locations, combat activities and jumping');
}
ctx.waterAt=()=>true;assert.equal(ctx.arenaQueueReason(),'','swimming never prevents queueing');ctx.waterAt=()=>false;
for(const changes of [{hp:0},{hp:1},{duelOpponentId:'duel'},{arenaMatchId:'match'},{gm:{flying:true}},{gm:{invisible:true}}]){ctx.player={...challenger,...changes};assert(ctx.arenaQueueReason(),'queue still requires a living, available fighter');}
ctx.player=challenger;ctx.party={leaderId:challenger.id,members:[challenger,partner]};
assert.equal(ctx.arenaQueueReason(2),'');assert.match(ctx.arenaQueueReason(3),/exactly 3/);
ctx.party.leaderId=partner.id;assert.match(ctx.arenaQueueReason(2),/party leader/);ctx.party.leaderId=challenger.id;
ctx.party.members.push({...partner,id:'third'});assert.equal(ctx.arenaQueueReason(3),'');assert.match(ctx.arenaQueueReason(2),/exactly 2/);
for(const [action,size] of [['arena1',1],['arena2',2],['arena3',3]]){ctx.party.members=Array.from({length:size},(_,i)=>i?{...partner,id:`partner-${i}`}:challenger);reset();ctx.playerAction(action,challenged.id);assert.deepEqual(JSON.parse(JSON.stringify(sent)),[{type:'arenaRequest',targetId:challenged.id,size}]);}
ctx.player={...challenger,x:0,z:0};for(const [action,size] of [['arena1',1],['arena2',2],['arena3',3]]){ctx.party.members=Array.from({length:size},(_,i)=>i?{...partner,id:`partner-${i}`}:ctx.player);reset();ctx.playerAction(action,challenged.id);assert.equal(sent.length,1,'direct action dispatch no longer requires arena presence');}
ctx.player={...challenger,x:COLOSSEUM.x,z:COLOSSEUM.z};assert.match(ctx.duelChallengeReason(challenged),/lethal sand ring/,'ordinary duel is disabled only inside the lethal ring');
ctx.player={...challenger,x:20,z:100};ctx.players=[ctx.player,{...challenged,x:28,z:100}];assert(!ctx.duelChallengeReason(ctx.players[1]),'ordinary duel works away from arena at exact8m');ctx.players[1].x+=.01;assert(!!ctx.duelChallengeReason(ctx.players[1]),'ordinary duel retains8m range');ctx.players[1].x=22;reset();ctx.playerAction('duel',challenged.id);assert.deepEqual(JSON.parse(JSON.stringify(sent)),[{type:'duelRequest',targetId:challenged.id}],'ordinary duel dispatch never becomes an arena request');
Object.assign(ctx,{startJump,cancelCasting(){},gameAudio:{play(){}},jumpRequestedAt:-Infinity,position:{x:COLOSSEUM.x,z:COLOSSEUM.z}});execute(functionText('tryJump'));
for(const [phase,state,allowed] of [['countdown',{pvp:false,arenaPhase:'countdown',arenaMatchId:'match-1'},false],['knocked out',{pvp:false,arenaPhase:'active',arenaMatchId:'match-1',arenaEliminated:true,hp:1},false],['active',{pvp:false,arenaPhase:'active',arenaMatchId:'match-1'},true],['safe',{pvp:false,arenaPhase:null,arenaMatchId:null},true]]){
 ctx.player={...challenger,...state};ctx.jump=newJump(ctx.position.x,ctx.position.z);reset();ctx.tryJump();assert.equal(!ctx.jump.grounded,allowed,`${phase} controls local jump prediction`);assert.equal(sent.some(message=>message.type==='jump'),allowed,`${phase} controls jump requests`);
}
ctx.arenaQueue={joinedAt:1};ctx.jump=newJump(ctx.position.x,ctx.position.z);reset();ctx.tryJump();assert(!ctx.jump.grounded);assert.equal(ctx.arenaQueue.joinedAt,1);assert(!sent.some(message=>message.type==='arenaQueueLeave'),'jumping never requests queue cancellation');
console.log('PASS private arena client: instance-scoped hostility/support, countdown and knockout guards, all match sizes and consent gates, normal input paths, and movement resume.');
