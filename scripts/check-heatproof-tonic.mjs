import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import vm from 'node:vm';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { starterGear, maxHealth } from '../src/progression.ts';
import { SPELLS } from '../src/spells.ts';
import { HEATPROOF_DURATION_MS, HEATPROOF_DAMAGE_MULTIPLIER, LOOT_ITEMS } from '../src/loot-items.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { INSTANT_COMBAT_RANGED_AUTO } from '../src/instant-combat-skills.ts';

// Exercise the real damage pipeline, including the scheduled periodic-hit path.
const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const extract=name=>{const start=source.indexOf(`  function ${name}(`);assert(start>=0);const end=source.indexOf('\n  function ',start+1);return source.slice(start,end);};
const victim={id:'victim',hp:1000,maxHp:1000,heatproofUntil:10000,x:0,z:0}, attacker={id:'attacker',hp:1000,x:0,z:0};
const recipient={player:victim}, session={player:attacker,lifeStartedAt:1,socket:{readyState:1}};
const ctx=vm.createContext({sessions:new Map([['victim',recipient],['attacker',session]]),HEATPROOF_DAMAGE_MULTIPLIER,SPELLS,WebSocket:{OPEN:1},
  pendingHits:[],broadcast:()=>{},arenaMode:()=>false,triggerEdicts:()=>{},knightDamageTaken:()=>{},worldPvp:()=>false,
  expireBurning:()=>false,resolveEdictTimer:()=>false,resolveKnightTimer:()=>false,advanceKnightCharge:()=>{},hostileTargetValid:()=>true,
  combatTargetLife:()=>1,activeCompanion:()=>undefined,applyTalentHit:(_hit,damage)=>damage,storeBoostMultiplier:()=>1,combatDefense:()=>0,
  applyHarmEdict:()=>{},stand:()=>{},event:()=>{},dirty:()=>{},duelMember:()=>undefined,combatTalentState:()=>({heat:0}),chilledTarget:()=>false,spellTargetMultiplier:()=>1,
});
vm.runInContext(extract('applyDamage')+extract('scheduleDot')+extract('resolveHits'),ctx);
const damage=(school,at=1000,{execution=false,reflected=false}={})=>{victim.hp=1000;recipient.shield=null;ctx.applyDamage(victim,'player',100,undefined,at,session,reflected,false,execution,school);return 1000-victim.hp;};
assert.equal(damage('fire'),80);for(const school of ['physical','frost','poison','holy',undefined])assert.equal(damage(school),100);
assert.equal(damage('fire',10000),100,'expires at the exact saved deadline');assert.equal(damage('fire',10001),100);
assert.equal(damage('fire',1000,{execution:true}),100,'execution bypasses consumable resistance');assert.equal(damage('fire',1000,{reflected:true}),100,'reflected damage is not reduced twice');
recipient.shield={amount:50,endsAt:10000};victim.hp=1000;ctx.applyDamage(victim,'player',100,undefined,1000,session,false,false,false,'fire');assert.equal(victim.hp,970,'resistance applies before absorption');recipient.shield=null;
recipient.combatTalents={guardian:{until:10000}};assert.equal(damage('fire'),48,'guardian and resistance combine once');recipient.combatTalents=undefined;
for(const [ability,expected] of [['fireball',16],['combustion',16],['frostbolt',20]]){
 assert(SPELLS[ability],ability);victim.hp=1000;ctx.pendingHits=[];
 const hit={session,enemy:victim,life:1,playerLife:1,ability,damage:100,dueAt:1000,stats:{},basic:false};
 ctx.pendingHits.push(hit);ctx.resolveHits(1000);assert.equal(1000-victim.hp,expected,ability+' direct hit');
 victim.hp=1000;ctx.scheduleDot(hit,100,2,2000,1000);ctx.resolveHits(2000);assert.equal(1000-victim.hp,expected,ability+' periodic hit preserves the spell school');
 ctx.resolveHits(3000);assert.equal(1000-victim.hp,expected*2);
}
assert.equal(MONSTERS['ember-beetle'].attackSchool,'fire');assert.equal(MONSTERS['cinder-hound'].attackSchool,undefined,'bite remains physical');assert.equal(INSTANT_COMBAT_RANGED_AUTO['grave-cantor'].damageSchool,'fire');assert.equal(INSTANT_COMBAT_RANGED_AUTO['void-cantor'].damageSchool,undefined);

// Real socket/account/save transaction: no realm or wallet calls.
const dir=mkdtempSync(join(tmpdir(),'mossvale-heatproof-')),file=join(dir,'players.json'),token=randomBytes(32).toString('base64url'),key=createHash('sha256').update(token).digest('hex');
const hero={id:randomUUID(),name:'Heatproof tester',appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className:'Ranger'},
 coordinateVersion:2,zone:'greenwood',x:0,z:8,rotation:0,level:20,xp:0,gold:0,characterCreated:true,talents:[],...starterGear('Ranger'),
 inventory:{wood:0,crystal:0,herb:0,potion:0,relic:0},carriedItems:{'heatproof-tonic':5,'greater-tonic':2},quest:{stage:0,kills:0,crystals:0}};
hero.hp=hero.maxHp=maxHealth(hero);writeFileSync(file,JSON.stringify({[key]:{characters:[hero]}}));
let game,client;const realNow=Date.now;let clock=realNow();Date.now=()=>clock;
const stored=()=>JSON.parse(readFileSync(file,'utf8'))[key].characters[0];
async function until(fn,label){const end=realNow()+7000;while(realNow()<end){const result=fn();if(result)return result;await delay(15);}throw Error('Timed out: '+label+' '+JSON.stringify(client?.messages.filter(m=>m.type!=='snapshot').slice(-6)));}
async function start(){game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:''});const port=await game.start();const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`);client={socket,messages:[],send:m=>socket.send(JSON.stringify(m)),player:()=>client.snapshot?.players.find(p=>p.id===hero.id)};socket.on('message',raw=>{const m=JSON.parse(raw);client.messages.push(m);if(m.type==='snapshot')client.snapshot=m;});await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});client.send({type:'join',token,characterId:hero.id});await until(()=>client.player(),'join');}
async function stop(){client?.socket.terminate();await game?.stop();game=undefined;}
async function request(message){clock+=1000;const from=client.messages.length;client.send(message);return until(()=>client.messages.slice(from).find(m=>m.type==='event'),'item response');}
const use={type:'useItem',itemId:'heatproof-tonic'};
try{
 await start();assert.equal(client.player().heatproofUntil,undefined,'legacy saves remain valid');
 mkdirSync(file+'.tmp');const fail=await request(use);assert.match(fail.text,/could not be saved/);assert.equal(client.player().carriedItems['heatproof-tonic'],5);assert.equal(client.player().heatproofUntil,undefined);assert.equal(stored().carriedItems['heatproof-tonic'],5);rmSync(file+'.tmp',{recursive:true});
 const hp=client.player().hp;await request(use);await until(()=>client.player().heatproofUntil,'buff snapshot');const deadline=clock+HEATPROOF_DURATION_MS;
 assert.equal(client.player().heatproofUntil,deadline);assert.equal(stored().heatproofUntil,deadline);assert.equal(stored().carriedItems['heatproof-tonic'],4);assert.equal(client.player().hp,hp,'tonic does not heal');
 assert.match((await request(use)).text,/cooldown/);assert.equal(stored().carriedItems['heatproof-tonic'],4);
 clock+=10000;client.send(use);client.send(use);await until(()=>client.player().carriedItems['heatproof-tonic']===3,'concurrent use');await delay(100);assert.equal(stored().carriedItems['heatproof-tonic'],3,'only one concurrent request consumes');assert.equal(stored().heatproofUntil,clock+HEATPROOF_DURATION_MS,'refresh does not stack');
 await stop();await start();assert.equal(client.player().heatproofUntil,stored().heatproofUntil,'buff survives strict save reload');
 clock=stored().heatproofUntil;assert.equal(damage('fire',10000),100,'expired effect is inactive');await stop();
 const records=JSON.parse(readFileSync(file));records[key].characters[0].hp=0;writeFileSync(file,JSON.stringify(records));await start();const count=client.player().carriedItems['heatproof-tonic'];assert.match((await request(use)).text,/Return to the village/);assert.equal(client.player().carriedItems['heatproof-tonic'],count,'dead player cannot consume');await stop();
 const dead=JSON.parse(readFileSync(file));dead[key].characters[0].hp=dead[key].characters[0].maxHp;delete dead[key].characters[0].carriedItems['heatproof-tonic'];writeFileSync(file,JSON.stringify(dead));await start();assert.match((await request(use)).text,/no longer in your bags/);assert.equal(client.player().carriedItems['heatproof-tonic'],undefined);
 console.log('PASS: Heatproof full-health use, atomic failed-save rollback, cooldown/concurrent use, nonstacking refresh/reload, ownership/death guards; actual damage pipeline direct+DoT fire only, exact expiry, execution/reflection, shields and Guardian.');
}finally{await stop();Date.now=realNow;rmSync(dir,{recursive:true,force:true});}
