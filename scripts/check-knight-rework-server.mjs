import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { starterGear, combatStats, maxHealth, canLearnTalent, talentsValid, TALENTS, TALENT_VERSION } from '../src/progression.ts';
import { SPELLS, TALENT_EFFECT_IDS as IDS, spellsForClass } from '../src/spells.ts';
import { COLOSSEUM } from '../src/colosseum.ts';
import { OVERWORLD_SPAWNS, canTraverse } from '../src/realm.ts';
import { waterAt } from '../src/landscape.ts';
import { monsterLevel } from '../src/bestiary.ts';
import { autoAttackTiming, autoAttackDamage } from '../src/auto-attacks.ts';

// Exercise actual public combat and movement messages against isolated characters and real world geometry.
const dir=mkdtempSync(join(tmpdir(),'mossvale-knight-rework-')),clients=[],realNow=Date.now,realRandom=Math.random;
let clock=realNow(),game,port;Date.now=()=>clock;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),point=(x=0,z=0)=>({x:COLOSSEUM.x+x,z:COLOSSEUM.z+z,zone:COLOSSEUM.zone});
async function until(fn,label){const end=realNow()+5000;while(realNow()<end){const value=fn();if(value)return value;await delay(10);}throw Error(`Timed out: ${label}`);}
async function tick(ms=1000){
  const before=clients.map(client=>[client,client.snapshot]);clock+=ms;
  // A timer finishing does not guarantee the realm's updated position has reached every WebSocket client.
  await until(()=>before.every(([client,snapshot])=>client.snapshot!==snapshot&&client.snapshot?.serverTime===clock),`realm snapshots at ${clock}`);
}
async function stop(){for(const c of clients.splice(0))c.socket.terminate();await game?.stop();game=null;}
function hero(name,where=point(),talents=[]){return {id:randomUUID(),name,appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className:'Knight'},
  coordinateVersion:2,...where,rotation:0,level:60,hp:808,maxHp:808,xp:0,gold:0,characterCreated:true,talents,talentVersion:TALENT_VERSION,...starterGear('Knight'),
  learnedSpells:spellsForClass('Knight').map(s=>s.id),inventory:{wood:0,crystal:0,herb:0,potion:0,relic:0},quest:{stage:0,kills:0,crystals:0}};}
function build(...wanted){const p=hero('Legal build');function buy(id,count){const t=TALENTS[id];assert(t,`authored talent ${id} exists`);if(t.prerequisite)buy(t.prerequisite,t.prerequisiteRank);while(p.talents.filter(x=>x===id).length<count){
  if(canLearnTalent(p,id)){p.talents.push(id);continue;}
  const available=Object.values(TALENTS).find(x=>x.className==='Knight'&&x.branch===t.branch&&canLearnTalent(p,x.id));assert(available,`reachable ${id}`);p.talents.push(available.id);
}}for(const id of wanted)buy(id,TALENTS[id].maxRank);assert(talentsValid(p),'integration fixture uses a legal build');return p.talents;}
async function connect(p,token){const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),c={socket,messages:[],id:p.id};clients.push(c);c.send=m=>socket.send(JSON.stringify(m));c.player=()=>c.snapshot?.players.find(x=>x.id===p.id);
  socket.on('message',raw=>{const m=JSON.parse(raw);c.messages.push(m);if(m.type==='snapshot')c.snapshot=m;});await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  c.send({type:'join',token,characterId:p.id});await until(()=>c.player(),'world entry');return c;}
async function fixture(talents=[],positions=[point(),point(2),point(2,1),point(2,-1)],level=60){await stop();clock+=30000;const heroes=positions.map((p,i)=>{const value={...hero(`Rework Fighter ${i}`,p,i===0?talents:[]),level,learnedSpells:spellsForClass('Knight').filter(s=>s.requiredLevel<=level).map(s=>s.id)};value.hp=value.maxHp=maxHealth(value);return value;}),tokens=heroes.map(()=>randomBytes(32).toString('base64url'));
  writeFileSync(join(dir,'players.json'),JSON.stringify(Object.fromEntries(heroes.map((p,i)=>[createHash('sha256').update(tokens[i]).digest('hex'),{characters:[p]}]))));
  game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:''});port=await game.start();const result=[];for(let i=0;i<heroes.length;i++)result.push(await connect(heroes[i],tokens[i]));Math.random=()=>.99;return result;}
const damage=(c,id)=>c.messages.filter(m=>m.type==='damage'&&m.targetId===id&&!m.effect);
async function cast(c,ability,targetId){await tick(Math.max(0,(c.player().globalCooldownUntil||0)-clock,(c.player().abilityCooldowns[ability]||0)-clock)+1);const start=c.messages.length;
  c.send({type:'attack',ability,...(targetId?{targetId}:{})});const accepted=await until(()=>c.player().casting||c.messages.slice(start).find(m=>m.type==='combat'&&m.playerId===c.id&&m.ability===ability),`${ability} accepted`);
  if(accepted.endsAt)await tick(Math.max(0,accepted.endsAt-clock));const event=await until(()=>c.messages.slice(start).find(m=>m.type==='combat'&&m.playerId===c.id&&m.ability===ability),`${ability} released`);
  // Combat feedback can arrive before the next snapshot carries the released spell's effects.
  const released=c.messages.indexOf(event);await until(()=>c.messages.slice(released+1).some(m=>m.type==='snapshot'),`${ability} release snapshot`);return event;}
async function basic(c,targetId){const start=c.messages.length;c.send({type:'autoAttack',targetId});await until(()=>c.messages.slice(start).some(m=>m.type==='combat'&&m.playerId===c.id&&m.basic),'basic release');await tick(700);c.send({type:'autoAttack',targetId:null});await until(()=>!c.player().autoAttack,'basic stopped');}
async function party(a,b){a.send({type:'partyInvite',targetId:b.id});const invite=await until(()=>b.snapshot.partyInvites.find(i=>i.inviterId===a.id),'party invitation');b.send({type:'partyAccept',invitationId:invite.id});await until(()=>a.snapshot.party?.members.length===2,'party joined');}
async function walk(c,target){for(let step=0;dist(c.player(),target)>.1;step++){assert(step<40,'bounded pickup walk');await tick(500);const p=c.player(),length=dist(p,target),fraction=Math.min(1,2/length),next={x:p.x+(target.x-p.x)*fraction,z:p.z+(target.z-p.z)*fraction};assert(canTraverse(p,next),'pickup approach is unobstructed');c.send({type:'move',...next,rotation:0});await until(()=>dist(c.player(),next)<.05,'legal movement');}}
const foe=()=>OVERWORLD_SPAWNS.find(e=>e.kind==='void-stalker'&&monsterLevel(e.kind,e.zone,e.zone,e.id)>40&&[2,6].every(z=>canTraverse({x:e.x,z:e.z+z},e)&&!waterAt(e.x,e.z+z)));
const near=(spawn,z)=>({x:spawn.x,z:spawn.z+z,zone:spawn.zone});
try{
  {
    await stop();const talents=build(IDS.ironBulwark),tokens=Array.from({length:4},()=>randomBytes(32).toString('base64url'));
    const old=Array.from({length:4},(_,index)=>{
      const p=hero(`Legacy Bulwark ${index}`,point(index),[...talents]);p.talentVersion=6;
      const ring=index<2?'star-ring':'star-ring~2~common~-~5';p.ownedGear.push(ring);p.equipment.ring1=ring;
      p.maxHp=maxHealth({...p,talents:[]});p.hp=index%2?0:123;return p;
    });
    const saved=()=>JSON.parse(readFileSync(join(dir,'players.json'),'utf8'));
    writeFileSync(join(dir,'players.json'),JSON.stringify(Object.fromEntries(old.map((p,index)=>[createHash('sha256').update(tokens[index]).digest('hex'),{characters:[p]}]))));
    for(let restart=0;restart<2;restart++){
      game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:''});port=await game.start();
      for(let index=0;index<old.length;index++){
        const c=await connect(old[index],tokens[index]);assert.equal(c.player().talentVersion,TALENT_VERSION);
        assert.deepEqual(c.player().talents,talents);assert.equal(c.player().maxHp,maxHealth(old[index]),'v6 Iron Bulwark updates health with static or randomized gear');
        assert.equal(c.player().hp,old[index].hp,'migration never heals or revives');
      }
      await stop();for(let index=0;index<old.length;index++){
        const p=saved()[createHash('sha256').update(tokens[index]).digest('hex')].characters[0];
        assert.equal(p.talentVersion,TALENT_VERSION);assert.equal(p.maxHp,maxHealth(old[index]));assert.equal(p.hp,old[index].hp,'migrated health is durable across restart');
      }
    }
  }
  {
    const [knight,a,b,c]=await fixture(build(IDS.wideSwing,IDS.fineCuts));await basic(knight,a.id);
    const hits=[a,b,c].map(p=>damage(knight,p.id));assert(hits.every(h=>h.length===1),'Fine Cuts cleaves three nearby targets once');assert(hits[1][0].amount>hits[0][0].amount,'rank two increases secondary cleave damage');
  }
  {
    const [knight,target]=await fixture([], [point(),point(12)]),before={...knight.player()};
    const request=knight.messages.length;knight.send({type:'attack',ability:'charge',targetId:target.id});await until(()=>knight.player().casting?.ability==='charge','Charge begins server movement');
    assert(dist(knight.player(),before)<1,'Charge does not teleport on acceptance');await tick(200);assert(dist(knight.player(),before)>1&&dist(knight.player(),target.player())>2,'Charge advances over time');await tick(500);
    assert(dist(knight.player(),target.player())<=3,'Charge reaches melee');assert(knight.messages.slice(request).some(m=>m.type==='combat'&&m.ability==='charge'),'Charge releases on arrival');await tick(700);assert(damage(knight,target.id).length,'Charge deals damage');
  }
  {
    const [knight,target]=await fixture(build(IDS.guard,IDS.holdTheLine),[point(),point(2)]);await cast(knight,'guard');const untilAt=knight.player().combatTalents.guardUntil;
    assert(untilAt>clock&&knight.player().shield.amount>0,'Guard grants absorb and reflect duration');const hp=knight.player().hp;await basic(target,knight.id);
    assert.equal(knight.player().hp,hp,'Guard absorbs the hit');assert(damage(target,target.id).length,'Guard reflects damage back to attacker');assert(knight.player().combatTalents.guardUntil===untilAt,'reflection is independent of consumed shield amount');
    await tick(8001);assert(!(knight.player().combatTalents.guardUntil>clock),'Guard reflection expires');
  }
  {
    const [knight,a,b,c]=await fixture(build(IDS.adamantGuardian));await cast(knight,'adamant-guardian');
    const expires=knight.player().combatTalents.guardianUntil;
    assert(expires>clock,'Guardian is active');assert.equal(knight.player().shield?.amount||0,0,'Guardian grants mitigation rather than its retired absorb shield');
    const counters=()=>knight.messages.filter(m=>m.type==='combat'&&m.ability==='adamant-guardian'&&m.effectPhase==='impact');
    const incoming=source=>Math.max(1,Math.round((autoAttackDamage('Knight',combatStats(source.player()))-Math.round(combatStats(knight.player()).defense))*.2));
    const hp=knight.player().hp,targetHp=a.player().hp;await basic(a,knight.id);
    assert.equal(hp-knight.player().hp,Math.max(1,Math.round(incoming(a)*.6)),'Guardian reduces the post-defense incoming hit by 40%');
    assert(a.player().hp<targetHp,'Guardian immediately counter-attacks the attacker');assert.equal(counters().length,1);
    await basic(b,knight.id);assert.equal(counters().length,1,'a second hit inside one second cannot trigger another counter');
    await basic(c,knight.id);assert.equal(counters().length,2,'a later hit triggers a new counter after the one-second cooldown');
    const timing=autoAttackTiming('Knight',dist(knight.player(),a.player())),contact=(timing.delay+timing.flight)*1000;
    await tick(expires-clock-contact-1);const from=a.messages.length;a.send({type:'autoAttack',targetId:knight.id});
    const late=await until(()=>a.messages.slice(from).find(m=>m.type==='combat'&&m.basic&&m.playerId===a.id),'late Guardian hit accepted');
    assert.equal(late.startedAt+contact,expires-1);
    await tick(expires+10-clock);a.send({type:'autoAttack',targetId:null});await until(()=>!a.player().autoAttack,'late auto stopped');
    const last=damage(knight,knight.id).at(-1);assert.equal(last.amount,Math.max(1,Math.round(incoming(a)*.6)),'delayed tick still mitigates a hit due just before expiry');
    assert.equal(counters().length,3,'late hit counters once without an expiry burst');
    const counts=[a,b,c].map(target=>damage(knight,target.id).length);await tick(1000);
    assert.deepEqual([a,b,c].map(target=>damage(knight,target.id).length),counts,'expiry causes no accumulated damage discharge');
    assert(!(knight.player().combatTalents.guardianUntil>clock));await basic(b,knight.id);
    assert.equal(damage(knight,knight.id).at(-1).amount,incoming(b),'full incoming damage resumes after expiry');assert.equal(counters().length,3,'expired Guardian cannot counter');
  }
  {
    const enemy=foe();assert(enemy,'clear real overworld opponent');const [knight,ally]=await fixture(build(IDS.courageousCall,IDS.intoTheFray),[near(enemy,6),near(enemy,2)]);await party(knight,ally);await basic(ally,enemy.id);const normal=damage(ally,enemy.id).at(-1).amount;
    await cast(knight,'courageous-call');await until(()=>ally.player().combatTalents.courageousCallUntil>clock,'Call buffs the nearby ally');assert(knight.player().combatTalents.courageousCallUntil>clock,'Call buffs its caster too');
    await tick(1700);await basic(ally,enemy.id);assert(damage(ally,enemy.id).at(-1).amount>=Math.floor(normal*1.2),'Call increases allied damage by twenty percent');
  }
  {
    const enemy=foe();assert(enemy);const [knight,ally]=await fixture(build(IDS.lordOfBattle),[near(enemy,6),near(enemy,2)]);await party(knight,ally);const target=()=>knight.snapshot.enemies.find(e=>e.id===enemy.id),before=target().hp;
    await cast(knight,'lord-of-battle');const markedAt=ally.messages.length;await tick(700);assert.equal(target().hp,before,'marking itself causes no direct damage');await basic(ally,enemy.id);
    assert(damage(ally,enemy.id).length>=2,'the first allied hit consumes the enemy mark for bonus damage');
    // The caster's bonus damage takes aggro; explicitly direct the next hit to the marked ally.
    await until(()=>target().targetId===knight.id,'mark damage draws caster aggro');await cast(ally,'taunt',enemy.id);await tick(700);
    await until(()=>target().targetId===ally.id,'Taunt directs the enemy to the marked ally');
    for(let i=0;i<6&&!ally.messages.some(m=>m.type==='damage'&&m.targetId===ally.id&&m.effect==='heal');i++)await tick(1000);
    const feedback=ally.messages.slice(markedAt),hit=feedback.findIndex(m=>m.type==='damage'&&m.targetId===ally.id&&!m.effect),heal=feedback.findIndex(m=>m.type==='damage'&&m.targetId===ally.id&&m.effect==='heal');
    assert(hit>=0,'the marked ally receives an enemy hit');assert(heal>hit,'a hit on a marked ally starts periodic healing');
  }
  {
    const [knight,target]=await fixture(build(IDS.powerfulThrow),[point(),point(7)]);const start=clock;await cast(knight,'powerful-throw',target.id);assert(clock-start>=2000,'first throw requires the full charge');await tick(1800);
    const shield=knight.player().combatTalents.thrownShield;assert(shield&&shield.expiresAt>clock,'released shield can be recovered');await walk(knight,shield);await tick(200);
    assert(knight.player().combatTalents.powerfulThrowReady,'walking over the shield primes a shorter next throw');
    await tick(Math.max(0,knight.player().abilityCooldowns['powerful-throw']-clock)+1);const next=clock;await cast(knight,'powerful-throw',target.id);assert(clock-next<1200,'recovery shortens the next charge even after waiting for its cooldown');
  }
  {
    const spawn=OVERWORLD_SPAWNS.find(e=>e.kind==='moss-slime'&&[2,4,6].every(z=>canTraverse({x:e.x,z:e.z+z},e)&&!waterAt(e.x,e.z+z)));assert(spawn,'actual overworld slime has a clear approach');
    const [knight,ally]=await fixture([],[{x:spawn.x,z:spawn.z+6,zone:spawn.zone},{x:spawn.x,z:spawn.z+2,zone:spawn.zone}],1);await party(knight,ally);
    const enemy=()=>knight.snapshot.enemies.find(e=>e.id===spawn.id);await until(()=>enemy(),'real overworld enemy visible');await basic(ally,spawn.id);await tick(300);
    const start=knight.messages.length;knight.send({type:'attack',ability:'taunt'});await until(()=>knight.messages.slice(start).some(m=>m.type==='combat'&&m.ability==='taunt'&&m.targets.some(t=>t.id===spawn.id)),'Taunt automatically chooses an enemy attacking an ally');await tick(1200);
    assert(enemy().targetId===knight.id||enemy().attack?.targetId===knight.id,'Taunt redirects the enemy to the Knight');
  }
  console.log('PASS: real WebSocket Knight cleave, Charge movement, Guard reflection, Guardian mitigation/counter cooldown/expiry, party Call, battle marks, shield pickup and Taunt fallback.');
}finally{await stop();Date.now=realNow;Math.random=realRandom;rmSync(dir,{recursive:true,force:true});}
