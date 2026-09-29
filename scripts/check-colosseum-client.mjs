import { isRaidInstance, RAID_BOUNDS } from '../src/raid.ts';
import { isInstantCombatInstance } from '../src/instant-combat.ts';
import { instantCombatMap } from '../src/instant-combat-maps.ts';
import { gameKey, bindingLabel } from '../src/keybindings.ts';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {COLOSSEUM,COLOSSEUM_ENTRANCE,isInColosseum,inColosseumClearing} from '../src/colosseum.ts';
import {isArenaInstance,ARENA_BOUNDS,ARENA_ENTRANCE,ARENA_ENTRY_RADIUS} from '../src/arena.ts';
import {isHostilePlayer,isHostileTarget,combatCompanionOwner,canSupportPlayer,chooseTarget} from '../src/targeting.ts';
import {SPELLS,abilityValid,abilityUnlocked,spellCastTimeMs,legacyAbility,GLOBAL_ATTACK_MS} from '../src/spells.ts';
import {combatStats,starterGear} from '../src/progression.ts';

import {canTraverse,WORLD_COLLIDERS,WORLD_BOUNDS,DUNGEON_BOUNDS} from '../src/realm.ts';
import {getDungeon,inDungeonPreparation,dungeonBounds} from '../src/dungeon.ts';
import {newJump,moveJump,jumpFloor} from '../src/jumping.ts';
import {collisionRouteAllowed} from '../src/collision-context.ts';
import {wildBiomeAt} from '../src/world-features.ts';

const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const tree=ts.createSourceFile('main.ts',main,ts.ScriptTarget.Latest,true);
const functionText=name=>tree.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name).getText(tree);
const listener=(owner,event)=>tree.statements.find(node=>ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)
 &&node.expression.expression.getText(tree)===`${owner}.addEventListener`&&node.expression.arguments[0]?.text===event).getText(tree);
const hero={id:'hero',name:'Hero',pvp:true,hp:100,maxHp:100,level:60,instanceId:null,x:0,z:0,appearance:{className:'Knight'},talents:[],...starterGear('Knight'),learnedSpells:Object.keys(SPELLS),inventory:{potion:1}};
const rival={...hero,id:'rival',name:'Rival',x:2},outsider={...hero,id:'outside',pvp:false,x:1},corpse={...hero,id:'corpse',hp:0,x:.5};
assert(isHostilePlayer(hero,rival),'two living arena players are hostile without duel consent');
assert(!isHostilePlayer(hero,hero),'self cannot become an attack target');
for(const other of [outsider,corpse,{...rival,instanceId:'dungeon'},{...rival,gm:{flying:true}},undefined])assert(!isHostilePlayer(hero,other));
assert(!isHostilePlayer({...hero,pvp:false},rival),'safe-side attacker cannot target inside');
assert(!isHostilePlayer({...hero,hp:0},rival));
assert(isHostilePlayer({...hero,role:'gm'},rival),'normal game masters can participate');
assert(isHostilePlayer({...hero,pvp:false,duelOpponentId:outsider.id},outsider),'consensual outside duels remain hostile');

const sent=[],notices=[],menus=[],handlers={},elements=new Map();
class Element {closest(){return null;}}
const ctx={currentWorldBounds:()=>WORLD_BOUNDS,combatStats,isInstantCombatInstance,instantCombatMap,instantCombat:null,worldLoading:false,gameKey,bindingLabel,heldKeyCodes:new Map(),isRaidInstance,RAID_BOUNDS,isArenaInstance,ARENA_BOUNDS,ARENA_ENTRANCE,ARENA_ENTRY_RADIUS,getDungeon,ZEPPELIN_PORTS:[],isHostilePlayer,isHostileTarget,combatCompanionOwner,canSupportPlayer,chooseTarget,SPELLS,abilityValid,abilityUnlocked,spellCastTimeMs,legacyAbility,GLOBAL_ATTACK_MS,
 canTraverse,WORLD_BOUNDS,dungeonBounds,colliders:[],dungeon:null,
 player:hero,playerId:hero.id,players:[hero,rival,outsider,corpse],party:{members:[{id:hero.id},{id:rival.id}]},enemies:[],appearance:hero.appearance,
 selectedId:null,hoveredId:null,autoAttackTarget:null,lastAutoAttackRequest:-Infinity,position:{x:0,z:0},rotation:0,worldZone:'greenwood',worldInstance:null,
 connected:true,worldReady:true,rosterActive:false,entryActive:false,pointerInWorld:true,lastPrimary:-Infinity,lastMove:0,serverOffset:0,cancelledCast:-1,
 jump:{grounded:true},isMoving:false,performance:{now:()=>10000},Date,keys:new Set(),panel:{open:false,contains:()=>false},
 modalOpen:()=>false,gmFlying:()=>false,waterAt:()=>false,jumpFloor,collisionRouteAllowed,currentCollisionScene:()=>undefined,standUp(){},cancelGathering(){},
 toast:text=>notices.push(text),send:message=>sent.push(message),openPlayerMenu:other=>menus.push(other.id),playerMenu:{close(){}},
 pickPlayer:()=>ctx.picked,pickTarget:()=>undefined,
 hotbar:{sync(){},predictCast(){},activateSlot(){}},
 HTMLElement:Element,HTMLInputElement:class extends Element{},HTMLSelectElement:class extends Element{},HTMLTextAreaElement:class extends Element{},HTMLButtonElement:class extends Element{},
 $:id=>{if(!elements.has(id))elements.set(id,{hidden:true,style:{},dataset:{},addEventListener:(event,handler)=>handlers[`${id}:${event}`]=handler});return elements.get(id)},
 canvas:{focus(){},addEventListener:(event,handler)=>handlers[`canvas:${event}`]=handler},window:{addEventListener:(event,handler)=>handlers[`window:${event}`]=handler}};
ctx.targetPoints=()=>ctx.players.map(p=>({...p,kind:'player'}));
const execute=code=>runInNewContext(stripTypeScriptTypes(code),ctx);
for(const name of ['clearMovementKeys','localSwimming','playerRouteAllowed','selectNextFoe','setAutoAttack','autoAttackSelectionValid','reconcileAutoAttack','act'])execute(functionText(name));
for(const [owner,event] of [['canvas','contextmenu'],['window','keydown'],["$('labels')",'contextmenu'],["$('labels')",'keydown']])execute(listener(owner,event));
const event={key:'Tab',target:null,repeat:false,clientX:10,clientY:20,preventDefault(){},stopPropagation(){}};
const attack=()=>sent.filter(m=>m.type==='attack').at(-1);
const reset=()=>{sent.length=0;notices.length=0;ctx.lastPrimary=-Infinity;ctx.autoAttackTarget=null;ctx.lastAutoAttackRequest=-Infinity;};
handlers['window:keydown'](event);assert.equal(ctx.selectedId,rival.id,'Tab includes party rivals and skips outsiders and corpses');
ctx.picked=rival;handlers['canvas:contextmenu'](event);assert.equal(sent.at(-1).targetId,rival.id);assert.equal(sent.at(-1).type,'autoAttack');assert.equal(menus.length,0,'right-click attacks without a consent menu');
rival.pvp=false;ctx.reconcileAutoAttack();assert.equal(sent.at(-1).targetId,null,'crossing either boundary cancels auto attack');
ctx.picked=rival;handlers['canvas:contextmenu'](event);assert.equal(menus.at(-1),rival.id,'outside players regain social right-click');
rival.pvp=true;reset();ctx.selectedId=rival.id;ctx.act('strike');assert.equal(attack()?.targetId,rival.id,'targeted abilities use the same hostile predicate');
reset();ctx.colliders=[{x:1,z:0,r:.25}];ctx.act('strike');assert.equal(sent.length,0,'a hostile target behind cover cannot receive a targeted ability');assert.equal(notices.at(-1),'Move closer to a foe.');ctx.colliders=[];
reset();ctx.selectedId=outsider.id;ctx.act('strike');assert.equal(sent.length,0,'explicit safe-side selection cannot attack or retarget someone else');
reset();ctx.selectedId=null;ctx.act('strike');assert.equal(attack()?.targetId,rival.id,'nearest hostile fallback includes arena players');
reset();ctx.appearance={className:'Cleric'};ctx.selectedId=rival.id;ctx.act('flash-heal');assert.equal(attack()?.targetId,undefined,'a hostile selection never receives support');assert(attack(),'healing defaults to self inside');
reset();ctx.selectedId=outsider.id;ctx.act('flash-heal');assert.equal(sent.length,0,'arena players cannot support safe-side players');
hero.pvp=false;reset();ctx.selectedId=rival.id;ctx.act('flash-heal');assert.equal(sent.length,0,'outside players cannot support arena participants');
hero.pvp=true;ctx.appearance=hero.appearance;
for(const type of ['contextmenu','keydown']){reset();const plate={dataset:{playerId:rival.id},getBoundingClientRect:()=>({left:5,bottom:10})};handlers[`labels:${type}`]({...event,key:'Enter',target:{closest:()=>plate}});assert.equal(sent.at(-1)?.targetId,rival.id,`${type} on a hostile nameplate starts combat`);}

// Exercise the actual location/HUD renderer across approach and authoritative membership changes.
Object.assign(ctx,{wildBiomeAt,COLOSSEUM,inColosseumClearing,dungeon:null,VILLAGES:[],EXPEDITIONS:[],lastLocationRegion:'greenwood',surfaceAt:()=>({zone:'greenwood',regionId:'greenwood'}),getZone:()=>({name:'Greenwood'}),regionLevelLabel:()=>'Lv 1–5'});
ctx.inDungeonPreparation=inDungeonPreparation;execute(functionText('updateLocation'));
ctx.position={x:0,z:0};hero.pvp=false;ctx.updateLocation();assert(elements.get('pvp-state').hidden);
ctx.position={x:COLOSSEUM.x,z:COLOSSEUM.z-COLOSSEUM.outerRadius};ctx.updateLocation();assert(!elements.get('pvp-state').hidden);assert.equal(elements.get('pvp-state').dataset.active,'false');assert.match(elements.get('pvp-detail').textContent,/sand ring.*lethal/i);
for(const pvp of [true,true,false,false,true]){hero.pvp=pvp;ctx.updateLocation();assert.equal(elements.get('pvp-state').dataset.active,String(pvp));if(pvp){assert.match(elements.get('pvp-title').textContent,/LETHAL/);assert.match(elements.get('pvp-detail').textContent,/Everyone is hostile.*Death & respawn apply/);assert.match(elements.get('zone-location').textContent,/Thornring Colosseum/);}}
hero.pvp=false;ctx.worldInstance='dungeon';ctx.DUNGEON_STAGES=[{level:10}];ctx.lastLocationRegion='dungeon';ctx.updateLocation();assert(elements.get('pvp-state').hidden,'dungeon coordinates cannot show the approach warning');
// The shipped movement guard reaches the top seats through the main gate without entering combat.
Object.assign(ctx,{canTraverse,colliders:WORLD_COLLIDERS,WORLD_BOUNDS,DUNGEON_BOUNDS,moveJump,worldInstance:null,position:{...COLOSSEUM_ENTRANCE},jump:newJump(COLOSSEUM_ENTRANCE.x,COLOSSEUM_ENTRANCE.z)});
ctx.lastSentMove=null;execute(functionText('freeAt'));
for(const end of [{x:COLOSSEUM.x,z:COLOSSEUM.z+45.1},{x:COLOSSEUM.x+9,z:COLOSSEUM.z+45.1},{x:COLOSSEUM.x+43.4,z:COLOSSEUM.z+43.6}]){
 const start={...ctx.position},steps=Math.ceil(Math.hypot(end.x-start.x,end.z-start.z)/.2);
 for(let i=1;i<=steps;i++){
  const next={x:start.x+(end.x-start.x)*i/steps,z:start.z+(end.z-start.z)*i/steps};
  assert(ctx.freeAt(next.x,ctx.position.z),'actual X movement permits the safe spectator route');ctx.position.x=next.x;
  assert(ctx.freeAt(ctx.position.x,next.z),'actual Z movement permits the safe spectator route');ctx.position.z=next.z;
  assert(!isInColosseum(ctx.position),'spectators reach the seats without crossing PvP');
  assert(ctx.jump.grounded);assert.equal(ctx.jump.y,jumpFloor(ctx.position.x,ctx.position.z));
 }
}
assert(ctx.jump.y>10,'walkable path reaches the highest seating row');
const ui=readFileSync(new URL('../src/ui.ts',import.meta.url),'utf8');
assert.match(ui,/<div id="pvp-state" role="status" hidden><strong id="pvp-title">SPECTATOR AREA · SAFE/);
assert.match(ui,/sand ring has lethal world PvP/);assert.match(ui,/Private matches start at the arena entrance/);
console.log('PASS colosseum client: arena and duel hostility, party rivals, both boundaries, death, GM observers, Tab/right-click/keyboard targeting, abilities, support restrictions, safe spectator route to the top seats, approach warning and authoritative PvP HUD.');
