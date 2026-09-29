import assert from 'node:assert/strict';
import { createStoryEncounters } from '../src/story-encounters.mjs';
import { STORY_ENCOUNTERS, STORY_OBJECTS } from '../src/story-world-data.ts';
import { storyQuestById, storyQuestProgress, storyQuestReady, storyQuestsValid } from '../src/story-quests.ts';
const stateFor=id=>{const completed=[];function add(current){for(const prerequisite of storyQuestById(current).requires??[])if(!completed.includes(prerequisite)){add(prerequisite);completed.push(prerequisite);}}add(id);return {active:{[id]:storyQuestById(id).objectives.map(()=>0)},completed};};
function fixture(id='story-defend-scout'){
 const definition=STORY_ENCOUNTERS.find(e=>e.id===id),object=STORY_OBJECTS.find(o=>o.id===definition.objectId);
 const state=stateFor(definition.questId),session={alive:true,player:{id:'hero',zone:definition.zone,x:object.x,z:object.z,hp:100,storyQuests:state}};
 const all=[],messages=[],events=[],control={blocked:false,failAt:0,undefinedAt:0};
 const controller=createStoryEncounters({live:s=>s.alive,canMove:()=>!control.blocked,tell:(_s,m)=>messages.push(m),
  spawn:spec=>{if(control.failAt===all.length+1)throw Error('Fixture spawn failure');if(control.undefinedAt===all.length+1)return;const enemy={...spec,alive:true,hp:100,target:null,rotation:0};all.push(enemy);return enemy;},
  remove:enemy=>{enemy.alive=false;enemy.hp=0;enemy.removed=true;},progress:(s,event)=>{events.push(event);assert(storyQuestProgress(s.player.storyQuests,event),'only verified complete encounter can progress');}});
 const discover=()=>storyQuestProgress(state,{kind:'interact',target:object.id,scope:'overworld',zone:object.zone});
 const start=()=>{discover();return controller.start(session,object,1000);};
 const kill=()=>all.forEach(e=>{e.alive=false;e.hp=0;});
 return {controller,definition,object,session,state,all,messages,events,control,discover,start,kill};
}
{
 const f=fixture();assert(!f.controller.start(f.session,f.object,1000),'find objective must be credited before starting defense');assert(f.start());assert.equal(f.all.length,2);
 assert(f.controller.start(f.session,f.object,1100),'replayed start acknowledges active encounter');assert.equal(f.all.length,2,'replay cannot spawn duplicate waves');
 for(let wave=1;wave<=3;wave++){assert.equal(f.controller.publicState(f.session).wave,wave);f.kill();f.controller.tick(1000+wave*1000);}
 assert.equal(f.events.length,1);assert(storyQuestReady(f.state,f.definition.questId));assert.equal(f.controller.publicState(f.session),null);assert(f.all.every(e=>e.removed),'all corpses and enemies removed');
 assert(!f.controller.start(f.session,f.object,6000),'completed defense cannot repeat');f.controller.tick(7000);assert.equal(f.events.length,1);
}
{
 const f=fixture('story-escort-caravan');assert(f.start());const start={x:f.object.x,z:f.object.z};f.kill();f.controller.tick(1200);
 let view=f.controller.publicState(f.session);assert.equal(view.wave,1,'escort does not immediately ambush again at its duplicated starting waypoint');assert.equal(view.phase,'moving');
 const movingFrom={x:view.x,z:view.z};f.session.player.x=view.x+12;f.controller.tick(1400);view=f.controller.publicState(f.session);assert.equal(view.x,movingFrom.x,'escort waits if player stops following');
 let now=1400,sawSecond=false;
 for(let i=0;i<1500&&f.controller.publicState(f.session);i++){
  view=f.controller.publicState(f.session);Object.assign(f.session.player,{x:view.x,z:view.z});
  if(view.wave===2){sawSecond=true;assert(Math.hypot(view.x-start.x,view.z-start.z)>.1,'second ambush occurs after escort movement');f.kill();}
  now+=200;f.controller.tick(now);
 }
 assert(sawSecond);assert.equal(f.events.length,1);assert(storyQuestReady(f.state,f.definition.questId));assert(f.all.every(e=>e.removed));
}
for(const [name,mutate]of Object.entries({
 death:f=>{f.session.player.hp=0;},disconnect:f=>{f.session.alive=false;},instance:f=>{f.session.instanceId='dungeon:test';},
 zone:f=>{f.session.player.zone='greenwood';},zeppelin:f=>{f.session.zeppelin={};},leaving:f=>{f.session.player.x+=31;},
 abandon:f=>{delete f.state.active[f.definition.questId];},
})){
 const f=fixture();assert(f.start());mutate(f);f.controller.tick(1200);assert.equal(f.controller.publicState(f.session),null,name+' cleans the run');assert(f.all.every(e=>e.removed),name+' removes enemies');assert.equal(f.events.length,0,name+' gives no completion');
}
{
 const f=fixture();assert(f.start());f.controller.tick(301000);assert.equal(f.controller.publicState(f.session),null,'exact five-minute deadline expires');assert.equal(f.events.length,0);
}
{
 const f=fixture();assert(f.start());for(const enemy of f.all){enemy.x=f.object.x;enemy.z=f.object.z;enemy.target=f.session.player.id;}
 f.controller.tick(2000);assert.equal(f.controller.publicState(f.session).hp,100,'attackers engaged by player do not also damage NPC');
 for(const enemy of f.all)enemy.target=null;for(let now=3000;now<=12000&&f.controller.publicState(f.session);now+=1000)f.controller.tick(now);
 assert.equal(f.controller.publicState(f.session),null);assert.equal(f.events.length,0,'NPC death cannot complete defense');assert(f.all.every(e=>e.removed));assert(f.start(),'failed defense can restart from saved discovery');f.controller.clear(f.session);
}
for(const mode of ['failAt','undefinedAt']){
 const f=fixture();f.control[mode]=2;assert.equal(f.start(),false,'partial spawn failure returns failure');assert.equal(f.controller.publicState(f.session),null);assert(f.all.every(e=>e.removed),'partially spawned enemies removed');assert.equal(f.events.length,0);assert.equal(f.messages.length,1,'no misleading started message after failure');f.control[mode]=0;assert(f.start(),'spawn failure leaves attempt retriable');f.controller.clear(f.session);
}
{
 const f=fixture();f.discover();f.session.player.x+=100;assert(!f.controller.start(f.session,{...f.object,x:f.session.player.x},1000),'forged object coordinates cannot bypass canonical proximity');assert.equal(f.all.length,0);
 f.session.player.x=f.object.x;f.control.blocked=true;assert(!f.controller.start(f.session,f.object,1000),'blocked approach rejected');f.control.blocked=false;assert(f.start());
 const replacement={...f.session,player:structuredClone(f.session.player)};assert.equal(f.controller.publicState(replacement),null,'reconnect does not inherit stale attempt');assert(f.controller.start(replacement,f.object,1500));assert(f.all.slice(0,2).every(e=>e.removed),'reconnect retires previous runtime enemies');f.controller.clear(f.session);assert(f.controller.publicState(replacement),'old disconnect cannot clear new session');f.controller.clear(replacement);
}
{
 const f=fixture('story-escort-caravan');assert(f.start());f.kill();f.control.blocked=true;f.controller.tick(1200);assert.equal(f.controller.publicState(f.session),null,'blocked escort route fails safely');assert.equal(f.events.length,0);
}
assert(storyQuestsValid({active:{},completed:[],treasures:['ashbound-treasure']}));
for(const treasures of [[],['bogus'],['ashbound-treasure','ashbound-treasure'],['ashbound-treasure','veiled-sun-treasure','ashbound-treasure']])assert(!storyQuestsValid({active:{},completed:[],treasures}),'treasure claims are bounded canonical IDs');
console.log('PASS: actual story defense/escort completion, start-order/duplicate/forged guards, movement and waiting, NPC damage/death, death/disconnect/travel/abandon/deadline cleanup, restart ownership, blocked paths and partial spawn failure; bounded durable treasure flags.');
