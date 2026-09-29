import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes, registerHooks } from 'node:module';
import { runInNewContext } from 'node:vm';
import { instantCombatSchedule, isInstantCombatInstance, INSTANT_COMBAT_CREATURES } from '../src/instant-combat.ts';
import { instantCombatStatus, renderInstantCombatPanel, mountInstantCombatHUD } from '../src/instant-combat-ui.ts';
import { isArenaInstance } from '../src/arena.ts';

const now=Date.UTC(2026,8,27,13,55), player={characterCreated:true,level:16,hp:100,economyVersion:1};
const state={...instantCombatSchedule(now),registered:false,bracketId:'16-30',registeredCount:21,run:null};
assert.match(instantCombatStatus(state,now),/Closes in 5:00/);
assert.match(renderInstantCombatPanel(state,player,now),/data-instant-combat="register" >Register/);
assert.match(renderInstantCombatPanel(state,player,now),/21 registered in your level bracket/);
assert.match(renderInstantCombatPanel(state,player,now),/Levels 16–30/);
assert.match(renderInstantCombatPanel(state,player,now),/Gold by round: 5 \/ 10 \/ 15 \/ 25 \/ 45/);
assert.match(renderInstantCombatPanel(state,player,now),/600 XP and a 20% chance/);
assert.match(renderInstantCombatPanel(state,player,now),/within 20 seconds \(30 after the boss\)/);
assert.match(renderInstantCombatPanel(state,player,now),/Monsters drop no loot or XP/);
assert.match(renderInstantCombatPanel({...state,registrationOpen:false},player,now),/data-instant-combat="register" disabled/);
assert.match(renderInstantCombatPanel({...state,registered:true},player,now),/data-instant-combat="unregister" >Cancel/);
for (const level of [15, 61]) {
  const html = renderInstantCombatPanel(state,{...player,level},now);
  assert.match(html,/Available at levels 16–60/); assert.match(html,/data-instant-combat="register" disabled/);
  assert(!html.includes('Levels 1–15'));
}
assert.match(renderInstantCombatPanel(state,player,now,false),/Reconnect/);
const run={id:'instant-combat-test',mapId:'bone-pit',bossModel:'ossuary-tyrant',boss:null,mechanic:null,hazards:[],runes:[],objective:'Prepare together.',bracketId:'16-30',minLevel:16,maxLevel:30,phase:'preparing',round:0,totalRounds:5,phaseEndsAt:now+90000,members:20,enemiesRemaining:0};
assert.match(instantCombatStatus({...state,run},now),/Round 1 in 1:30/);
assert.match(instantCombatStatus({...state,run:{...run,phase:'fighting',round:3,subwave:2,totalSubwaves:3,enemiesRemaining:7}},now),/Round 3 \/ 5 · Group 2 \/ 3 · 7 enemies/);
assert.match(renderInstantCombatPanel({...state,run},player,now),/data-instant-combat="leave"/);
assert.match(renderInstantCombatPanel({...state,run:{...run,phase:'completed'}},player,now),/Return to the world/);
const boss={id:'boss',name:'Ossuary Tyrant',hp:700,maxHp:1000,phase:'mechanic',shielded:true,endsAt:now+45000};
const encounter={...state,run:{...run,round:5,phase:'fighting',boss,mechanic:{kind:'anchors',label:'Bone Chains',progress:1,goal:3,nextAt:0},objective:'Destroy every chain.'}};
assert.match(instantCombatStatus(encounter,now),/Bone Chains · 1\/3 · 0:45/);assert.match(renderInstantCombatPanel(encounter,player,now),/Boss shielded/);
assert.match(instantCombatStatus({...encounter,run:{...encounter.run,mechanic:{kind:'stomps',label:'Shatter Stomp',progress:1,goal:3,nextAt:now+3000}}},now),/Shatter Stomp · 1\/3 · 0:03/);
assert.match(instantCombatStatus({...encounter,run:{...encounter.run,boss:{...boss,shielded:false}}},now),/Ossuary Tyrant · 70% HP/);
for(const [mapId,roster] of Object.entries(INSTANT_COMBAT_CREATURES))for(const selected of roster.bosses){const html=renderInstantCombatPanel({...state,run:{...run,mapId,bossModel:selected.model}},player,now);assert(html.includes(selected.name));assert(html.includes(selected.instruction),'each boss has its own advance instructions');}

// Exercise the actual invitation handlers and server-confirmed registration state.
class Element {
  hidden=false; disabled=false; textContent=''; children=[]; selectors=new Map(); attributes={}; dataset={}; firstElementChild={textContent:''};
  popoverOpen=false; parentElement=null; style={};
  append(child){child.parentElement=this;this.children.push(child);}
  matches(selector){assert.equal(selector,':popover-open');return this.popoverOpen;}
  showPopover(){this.popoverOpen=true;}
  hidePopover(){this.popoverOpen=false;}
  querySelector(selector){if(!this.selectors.has(selector))this.selectors.set(selector,new Element());return this.selectors.get(selector);}
  setAttribute(name,value){this.attributes[name]=value;}
  toggleAttribute(name,value){this.attributes[name]=value;}
}
let activeModal=null;
globalThis.document={createElement:()=>new Element(),activeElement:null,querySelector:selector=>{assert.equal(selector,'dialog:modal');return activeModal;}};
const host=new Element();let joins=0,details=0;
const hud=mountInstantCombatHUD(host,()=>details++,()=>joins++), [darkness,summary,notice]=host.children;
const join=notice.querySelector('[data-response="join"]'),decline=notice.querySelector('[data-response="decline"]'),adventurer={...player,id:'a'};
hud.update(state,now,true,adventurer);assert(!notice.hidden&&summary.hidden);assert.equal(join.textContent,'Join Event');
summary.onclick();assert.equal(details,1);
assert.equal(notice.attributes.popover,'manual');assert(notice.popoverOpen,'signup invitation enters the top layer');
activeModal=new Element();hud.update(state,now,true,adventurer);
assert.equal(notice.parentElement,activeModal,'the invite joins an open modal so Join and Decline are not inert');assert(notice.popoverOpen);
const focusedModal=new Element();document.activeElement={closest:()=>focusedModal};hud.update(state,now,true,adventurer);
assert.equal(notice.parentElement,focusedModal,'the focused modal takes priority over an older modal');
activeModal=null;document.activeElement=null;hud.update(state,now,true,adventurer);
assert.equal(notice.parentElement,host,'closing the modal restores the invitation to the game without dismissing it');assert(notice.popoverOpen);

decline.onclick();assert(notice.hidden&&summary.hidden&&!notice.popoverOpen);assert.equal(joins,0,'declining never registers or teleports');
hud.update({...state},now+1000,true,adventurer);assert(notice.hidden,'decline lasts for this event across snapshots');
const next={...state,startsAt:state.startsAt+7200000};
hud.update(next,now+7200000,true,adventurer);assert(!notice.hidden,'next event offers a fresh choice');
join.onclick();join.onclick();assert.equal(joins,1,'double click sends one join request');assert(join.disabled&&decline.disabled);assert.equal(join.textContent,'Joining…');
hud.update({...next,registered:true},now+7200100,true,adventurer);assert(notice.hidden&&!notice.popoverOpen&&!summary.hidden,'only server confirmation shows registered');
hud.update(state,now,true,{...adventurer,id:'b'});assert(!notice.hidden,'another character can make its own choice');
hud.update(state,now,true,adventurer);assert(notice.hidden,'returning to a character remembers its decline for this event');
hud.update(state,now,true,{...adventurer,id:'b'});
join.onclick();hud.update(state,now+5001,true,{...adventurer,id:'b'});assert(!join.disabled,'an unanswered request permits retry');
hud.update(state,state.startsAt,true,adventurer);assert(notice.hidden&&summary.hidden,'stale signup state cannot show a join after its deadline');
join.onclick();assert.equal(joins,2,'expired invitation cannot dispatch');
for (const level of [15, 61]) { hud.update(state,now,true,{...adventurer,id:'ineligible',level});assert(notice.hidden&&summary.hidden,'invitation and signup HUD respect level eligibility'); }
hud.update(state,now,true,{...adventurer,id:'eligible',level:16});assert(!notice.hidden,'level 16 receives the invitation');
hud.update({...state,run},now,true,adventurer);assert(notice.hidden&&!summary.hidden,'active runs keep the combat HUD');
hud.update({...state,run:{...run,control:{stunUntil:now+2000,rootUntil:0,silenceUntil:0,blindUntil:now+1000,darkUntil:0}}},now,true,adventurer);
assert(!darkness.hidden);assert.equal(darkness.style.opacity,'.96');assert.match(summary.querySelector('.instant-combat-control').textContent,/Stunned 2s.*Blinded 1s/);
hud.update(null,now,false);assert(notice.hidden&&!notice.popoverOpen&&summary.hidden,'disconnect removes the invitation');
assert(darkness.hidden,'disconnect also removes boss darkness');
delete globalThis.document;

// Run the actual panel dispatch so a stale enabled button cannot join a closed event.
const source=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const lootStart=source.indexOf(' for(const drop of loot){\n  if(lootMeshes.has(drop.id))continue;'),lootEnd=source.indexOf(' for(const [id,entry] of lootMeshes)',lootStart);
assert(lootStart>=0&&lootEnd>lootStart);
const renderedLoot=[],labels=[];
const lootView={loot:[],lootMeshes:new Map(),surfaceHeight:()=>0,deathProgress:()=>1,bindingLabel:()=> 'E',scene:{add(){}},
  makeLootRemains:(kind,treasure)=>{const mesh={position:{set(x,y,z){Object.assign(this,{x,y,z});}},rotation:{}};renderedLoot.push({kind,treasure,mesh});return mesh;},
  label:(...args)=>{labels.push(args);return {classList:{add(){}}};},THREE:{Box3:class{setFromObject(){return {max:{y:1}};}}}};
runInNewContext(stripTypeScriptTypes(`function render(){${source.slice(lootStart,lootEnd)}}`),lootView);
for(const extra of [{},{sourceObjectId:'chest'},{instantCombatRound:1}]){
  const drop={id:JSON.stringify(extra),kind:'briar-sentinel',name:'Wave rewards',x:0,z:0,gold:5,relic:0,instanceId:run.id,...extra};
  lootView.loot=[drop];lootView.render();
  assert.equal(renderedLoot.at(-1).treasure,!!extra.sourceObjectId||!!extra.instantCombatRound,'personal rewards use the treasure marker without a defeated monster');
  assert.equal(labels.at(-1)[1],extra.sourceObjectId||extra.instantCombatRound?drop.name:`${drop.name} remains`);
  assert.equal(renderedLoot.at(-1).mesh.position.y,extra.sourceObjectId ? .9 : 0,'wave pickups sit on the ground');
}
const transition={isInstantCombatInstance,instantCombat:null,worldReady:true,worldInstance:null};
const zoneStart=source.indexOf('async function switchZone('),zoneGuardEnd=source.indexOf(' let revision:number|undefined;',zoneStart);
assert(zoneStart >= 0 && zoneGuardEnd > zoneStart, 'switchZone keeps the event metadata guard before the transition');
runInNewContext(stripTypeScriptTypes(source.slice(zoneStart,zoneGuardEnd)+`return 'ready';}`),transition);
assert.equal(await transition.switchZone('hollow','instant-combat-void'),undefined,'correction waits for assigned map metadata');assert(!transition.worldReady);
transition.instantCombat={run:{id:'instant-combat-void',mapId:'void-rift'}};
assert.equal(await transition.switchZone('hollow','instant-combat-void'),'ready','matching snapshot allows correct map creation');
assert.equal(await transition.switchZone('greenwood',null),'ready','normal returns do not wait for event metadata');
const start=source.indexOf(" if(panel.dataset.mode==='instant-combat'&&data.instantCombat)");
const end=source.indexOf(' if(data.raidSelect)',start), sent=[];
const context={panel:{dataset:{mode:'instant-combat'}},connected:true,instantCombat:state,lastInstantCombatPanel:'',send:message=>sent.push(message)};
runInNewContext(stripTypeScriptTypes(`function dispatch(data,button={}){${source.slice(start,end)}}`),context);
context.dispatch({instantCombat:'register'});assert.equal(sent.pop().type,'instantCombatRegister');
context.instantCombat={...state,registrationOpen:false};context.dispatch({instantCombat:'register'});assert.equal(sent.length,0);
context.instantCombat={...state,registered:true};context.dispatch({instantCombat:'unregister'});assert.equal(sent.pop().type,'instantCombatUnregister');
context.instantCombat={...state,run};context.dispatch({instantCombat:'leave'});assert.equal(sent.pop().type,'instantCombatLeave');
context.connected=false;context.dispatch({instantCombat:'leave'});assert.equal(sent.length,0);

const hooks=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const {buildWorldMapScene}=await import('../src/world-map.ts');
const {canSupportPlayer,isHostilePlayer}=await import('../src/targeting.ts');hooks.deregister();
const arena=buildWorldMapScene(false,undefined,undefined,true,undefined,false,'bone-pit');
assert.equal(arena.dungeonName,'The Bone Pit');assert.equal(arena.roomOutlines.size,0);assert.equal(arena.markers.length,0,'cooperative maps have no opposing team markers');arena.dispose();
assert(isInstantCombatInstance(run.id));assert(!isArenaInstance(run.id));
const self={...player,id:'a',instanceId:run.id,pvp:false},ally={...self,id:'b'};
assert(canSupportPlayer(self,ally));assert(!isHostilePlayer(self,ally));
console.log('PASS Instant Combat UI: registration, UTC countdowns, bracket copy, join/cancel/leave dispatch, late join guard, cooperative arena map and ally targeting.');

const eventPanel = renderInstantCombatPanel(state,player,now);
assert.equal([...eventPanel.matchAll(/<time datetime=/g)].length,4,'upcoming list covers four real rotations');
assert.match(eventPanel,/class="ic-event-timeline"[^>]*aria-label="Previous event 12:00 UTC\. Registration 13:55 UTC\. Start 14:00 UTC/);
assert.match(eventPanel,/class="ic-event-brackets"/);
assert.match(eventPanel,/class="is-current">Levels 16–30 · you/);
assert.equal([...eventPanel.matchAll(/<span>Round \d<\/span>/g)].length,5);
assert.doesNotMatch(eventPanel,/Remind me|data-instant-combat="remind"/,'no unsupported reminder control');
assert.match(renderInstantCombatPanel(state,{...player,level:46},now),/Gold by round: 15 \/ 30 \/ 45 \/ 75 \/ 135/,'reward bars use the actual level bracket');
assert.match(renderInstantCombatPanel(state,{...player,economyVersion:0},now),/Gold by round: 10 \/ 20 \/ 30 \/ 50 \/ 90/,'reward display preserves the legacy economy');
console.log('PASS Instant Combat source composition: schedule timeline, four UTC rotations, five true reward bars, bracket highlighting and no fake reminder.');
