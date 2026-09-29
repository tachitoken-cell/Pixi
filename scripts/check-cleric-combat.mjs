import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { ZONES } from '../src/content.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { starterGear, combatStats } from '../src/progression.ts';
import { SPELLS, GLOBAL_ATTACK_MS, spellsForClass, spellDamage, spellCastTimeMs } from '../src/spells.ts';
import { combatTiming } from '../src/combat-timing.ts';
import { toWorld, regionAt, WORLD_BOUNDS, canTraverse } from '../src/realm.ts';
import { waterAt } from '../src/landscape.ts';
import { insideVillageSafeArea } from '../src/settlements.ts';
import { DUNGEON_ENTRANCE } from '../src/adventure.ts';

// Actual WebSockets and server tick loop. Frozen wall time makes millisecond boundaries reproducible.
const dir=mkdtempSync(join(tmpdir(),'mossvale-cleric-')),realNow=Date.now,slime={...MONSTERS['moss-slime']},clients=[];
let clock=realNow(),game,port;Date.now=()=>clock;
const combatBase=ZONES.find(zone=>zone.id==='greenwood').enemies.find(enemy=>enemy.id==='slime-1');
const at=(x,z)=>({x:combatBase.x+x,z:combatBase.z+z});
const enemy={id:'cleric-target',kind:'moss-slime',...at(0,4)};
assert(!insideVillageSafeArea(combatBase.x,combatBase.z)&&!insideVillageSafeArea(enemy.x,enemy.z)&&!waterAt(combatBase.x,combatBase.z)&&canTraverse(combatBase,enemy),'combat fixture stays on clear dry ground outside city and village immunity');
function hero(className='Cleric',extra={}) { const level=60,maxHp=100+(level-1)*12;return {
  id:randomUUID(),name:'Combat tester',appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className},
  coordinateVersion:2,zone:'greenwood',...at(0,0),rotation:0,hp:100,maxHp,level,xp:0,gold:0,characterCreated:true,talents:[],...starterGear(className),
  learnedSpells:spellsForClass(className).map(spell=>spell.id),inventory:{wood:0,crystal:0,potion:3,herb:0,relic:0},skills:{mining:0,woodcutting:0,herbalism:0},
  quest:{stage:0,kills:0,crystals:0},...extra}; }
async function until(fn,label) { const end=realNow()+5000;while(realNow()<end){const value=fn();if(value)return value;await delay(10);}throw Error(`Timed out: ${label}`); }
async function tick(at=clock) { clock=at;await delay(120); }
async function stop() { for(const client of clients.splice(0))client.socket.terminate();await game?.stop();game=null; }
async function connect(token) {
  const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),client={socket,messages:[],token};clients.push(client);
  client.send=message=>socket.send(JSON.stringify(message));client.player=()=>client.snapshot?.players.find(p=>p.id===client.welcome?.id);
  client.events=type=>client.messages.filter(message=>message.type===type);
  socket.on('message',raw=>{const message=JSON.parse(raw);client.messages.push(message);if(['roster','welcome','snapshot'].includes(message.type))client[message.type]=message;});
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  client.send({type:'join',token});await until(()=>client.roster,'roster');
  client.send({type:'selectCharacter',characterId:client.roster.characters[0].id});await until(()=>client.player(),'character');return client;
}
async function fixture(heroes,{aggroRange=0,damage=10}={}) {
  await stop();clock+=30000;const tokens=heroes.map(()=>randomBytes(32).toString('base64url'));
  writeFileSync(join(dir,'players.json'),JSON.stringify(Object.fromEntries(heroes.map((player,i)=>[createHash('sha256').update(tokens[i]).digest('hex'),{characters:[player]}]))));
  const previous=ZONES[0].enemies;ZONES[0].enemies=[enemy];Object.assign(MONSTERS['moss-slime'],{hp:10000,speed:0,aggroRange,damage});
  try{game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:''});}finally{ZONES[0].enemies=previous;}
  port=await game.start();return Promise.all(tokens.map(connect));
}
async function start(client,ability,targetId) {
  const count=client.events('combat').length;client.send({type:'attack',ability,...(targetId?{targetId}:{})});
  return until(()=>client.player().casting||client.events('combat')[count],`start ${ability}`);
}
async function release(client,ability,targetId) {
  await tick(clock+20000);const count=client.events('combat').length;const started=await start(client,ability,targetId);
  if(started.endsAt)await tick(started.endsAt);
  return until(()=>client.events('combat')[count],`release ${ability}`);
}
const impact=event=>{const t=event.targets[0],timing=combatTiming(event.ability,Math.hypot(t.x-event.from.x,t.z-event.from.z));return event.startedAt+(timing.delay+timing.flight)*1000;};
try {
  assert.equal(GLOBAL_ATTACK_MS,1500);
  for(const spell of Object.values(SPELLS))assert.equal(spellCastTimeMs(spell,{primaryDamage:1,specialDamage:1}),spellCastTimeMs(spell,{primaryDamage:9000,specialDamage:9000}),'gear damage never changes fixed preparation');
  {
    const [actor]=await fixture([hero('Ranger')]);const initial=actor.snapshot.enemies.find(e=>e.id===enemy.id).hp;
    const event=await start(actor,'arrow',enemy.id);assert.equal(event.type,'combat');assert.equal(event.startedAt,clock);assert.equal(event.castTimeMs,0);assert.equal(actor.player().casting,null);
    assert.equal(actor.player().globalCooldownUntil,clock+GLOBAL_ATTACK_MS);assert.equal(actor.events('damage').length,0);
    await tick(impact(event)-1);assert.equal(actor.snapshot.enemies.find(e=>e.id===enemy.id).hp,initial,'instant projectiles do not damage before contact');
    await tick(impact(event)+1);assert(actor.snapshot.enemies.find(e=>e.id===enemy.id).hp<initial);
    actor.send({type:'attack',ability:'arrow',targetId:enemy.id});await delay(40);assert.equal(actor.events('combat').length,1,'instant spam cannot bypass GCD');
  }
  {
    const geared=hero('Cleric');geared.ownedGear.push('dawnlight-mace');geared.equipment.weapon='dawnlight-mace';
    const [plain,strong]=await fixture([hero('Cleric'),geared]);assert(combatStats(strong.player()).primaryDamage>combatStats(plain.player()).primaryDamage);
    const normal=await start(plain,'smite',enemy.id),enhanced=await start(strong,'smite',enemy.id);
    assert.equal(normal.endsAt-normal.startedAt,enhanced.endsAt-enhanced.startedAt,'actual server cast time is independent of equipped damage stats');
  }
  {
    const [actor]=await fixture([hero('Ranger')]);actor.send({type:'jump'});await until(()=>actor.player().jump?.grounded===false,'jump starts');
    const released=await start(actor,'arrow',enemy.id);assert.equal(released.type,'combat','instant spells release while airborne');
  }
  {
    const [actor]=await fixture([hero('Cleric')]);const cast=await start(actor,'smite',enemy.id);assert.equal(cast.endsAt-cast.startedAt,2000);
    assert.equal(actor.player().globalCooldownUntil,cast.startedAt+GLOBAL_ATTACK_MS);assert.equal(actor.events('combat').length,0);
    actor.send({type:'cancelCast'});await until(()=>actor.player().casting===null,'explicit cancel');
    actor.send({type:'attack',ability:'smite',targetId:enemy.id});await delay(40);assert.equal(actor.player().casting,null,'cancel retains starting GCD');
    assert(!actor.player().abilityCooldowns.smite,'cancel before release does not spend spell cooldown');
    await tick(cast.startedAt+GLOBAL_ATTACK_MS);const retried=await start(actor,'smite',enemy.id);assert.equal(retried.startedAt,clock);
    await tick(retried.endsAt-1);assert.equal(actor.events('combat').length,0);await tick(retried.endsAt);assert.equal(actor.events('combat')[0].startedAt,retried.endsAt);
  }
  {
    const [caster,friend,outsider,dead,far,instanced]=await fixture([hero(),hero('Knight',{name:'Friend',...at(1,0)}),hero('Mage',{name:'Outsider',...at(-1,0)}),hero('Knight',{name:'Fallen',...at(2,0),hp:0}),hero('Knight',{name:'Distant',...at(0,41)}),hero('Knight',{name:'Dungeon',zone:'hollow',...toWorld('hollow',DUNGEON_ENTRANCE)})]);
    instanced.send({type:'dungeonEnter'});await until(()=>instanced.player().instanceId,'isolated dungeon');
    for(const targetId of [enemy.id,dead.player().id,far.player().id,instanced.player().id,'nonexistent']) {
      const before=caster.events('combat').length;caster.send({type:'attack',ability:'holy-word-serenity',targetId});await delay(40);assert.equal(caster.events('combat').length,before,'invalid friendly target is not silently healed or replaced');
    }
    const initial=friend.player().hp;await release(caster,'heal',friend.player().id);assert.equal(friend.player().hp,initial+spellDamage(SPELLS.heal,combatStats(caster.player())));
    const own=caster.player().hp;await release(caster,'holy-word-serenity');assert(caster.player().hp>own,'omitted friendly target heals self');
    assert(caster.events('damage').some(e=>e.effect==='heal'&&e.targetId===friend.player().id));
    caster.send({type:'partyInvite',targetId:friend.player().id});await until(()=>friend.snapshot.partyInvites.length,'party invitation');
    friend.send({type:'partyAccept',invitationId:friend.snapshot.partyInvites[0].id});await until(()=>caster.snapshot.party?.members.length===2,'party formed');
    const partyHeal=spellsForClass('Cleric').find(s=>s.effect==='heal'&&s.targeting==='radial'&&!s.channel);assert(partyHeal,'real party area heal catalog entry');
    const prior=[caster.player().hp,friend.player().hp,outsider.player().hp];await release(caster,partyHeal.id);
    assert(caster.player().hp>prior[0]&&friend.player().hp>prior[1]);assert.equal(outsider.player().hp,prior[2],'party healing excludes unrelated nearby players');
    assert.equal(dead.player().hp,0,'support never resurrects');
  }
  {
    const [caster]=await fixture([hero()]);const hp=caster.player().hp,power=spellDamage(SPELLS.renew,combatStats(caster.player()));
    const cast=await start(caster,'renew');assert.equal(cast.channel,true);assert.equal(caster.player().abilityCooldowns.renew,cast.startedAt+SPELLS.renew.cooldownMs);
    assert.equal(cast.endsAt-cast.startedAt,3000);await tick(cast.startedAt+999);assert.equal(caster.player().hp,hp,'channel waits for its first tick');
    await tick(cast.startedAt+1000);assert.equal(caster.player().hp,hp+power);assert.equal(caster.events('combat').length,1);
    caster.send({type:'cancelCast'});await until(()=>caster.player().casting===null,'channel cancel');await tick(cast.endsAt+1);assert.equal(caster.player().hp,hp+power,'cancel prevents remaining channel ticks');
    await tick(clock+20000);const moving=await start(caster,'renew');caster.send({type:'move',x:caster.player().x+.2,z:caster.player().z,rotation:0});await until(()=>caster.player().casting===null,'movement interrupts channel');
    const after=caster.player().hp;await tick(moving.endsAt+1);assert.equal(caster.player().hp,after,'moving channel leaves no healing ticks');
    await tick(clock+20000);const complete=await start(caster,'renew');await tick(complete.endsAt);assert.equal(caster.player().hp,after+power*3,'all three channel ticks resolve even in one delayed server frame');assert.equal(caster.player().casting,null);
    await stop();const saved=Object.values(JSON.parse(readFileSync(join(dir,'players.json'),'utf8')))[0].characters[0];assert.equal(saved.hp,after+power*3,'actual healing survives saving');assert(saved.learnedSpells.includes('renew'));
  }
  {
    const [archer]=await fixture([hero('Ranger')]);const cast=await start(archer,'rapid-fire',enemy.id),spell=SPELLS['rapid-fire'];
    await tick(cast.startedAt+spell.channel.tickMs);assert.equal(archer.events('combat').length,1);
    archer.send({type:'cancelCast'});await until(()=>archer.player().casting===null,'damage channel cancel');await tick(cast.endsAt+2000);
    assert.equal(archer.events('combat').length,1,'cancellation stops future channel projectiles');
    assert.equal(archer.events('damage').filter(e=>e.targetKind==='enemy').length,1,'only the projectile already released can finish impacting');
  }
  {
    const legacy=hero('Mage');delete legacy.learnedSpells;
    const [old,newCleric]=await fixture([legacy,hero('Cleric',{learnedSpells:['smite']})]);
    assert.deepEqual(old.player().learnedSpells.slice().sort(),['fireball','nova','frostbolt','arcane-burst','meteor'].sort(),'legacy saves retain old lessons without free new spells');
    newCleric.send({type:'attack',ability:'heal'});await delay(50);assert(!newCleric.player().casting&&newCleric.events('combat').length===0,'levels alone never grant a trainer lesson');
    assert(newCleric.events('event').some(e=>e.text.includes('class trainer')));
  }
  {
    const [friend,caster]=await fixture([hero('Knight',{...at(0,3.4)}),hero()],{aggroRange:20,damage:1});
    await until(()=>caster.snapshot.enemies.find(e=>e.id===enemy.id).targetId===friend.player().id,'monster engages injured ally');
    await start(caster,'holy-word-serenity',friend.player().id);await tick(clock+1);
    assert.equal(caster.snapshot.enemies.find(e=>e.id===enemy.id).targetId,caster.player().id,'effective healing contributes threat to an engaged monster');
  }
  {
    let border;
    for(let z=WORLD_BOUNDS.minZ+6;z<WORLD_BOUNDS.maxZ-6&&!border;z+=4)for(let x=WORLD_BOUNDS.minX+8;x<WORLD_BOUNDS.maxX-8;x+=4){
      const from={x:x-.4,z},to={x:x+.4,z};
      if(regionAt(from.x,z)!==regionAt(to.x,z)&&!waterAt(from.x,z)&&!waterAt(to.x,z)&&canTraverse(from,to)){border={from,to};break;}
    }
    assert(border,'clear close-range region seam');
    const [caster,friend]=await fixture([hero('Cleric',{...border.from,zone:regionAt(border.from.x,border.from.z)}),hero('Knight',{...border.to,zone:regionAt(border.to.x,border.to.z)})]);
    assert(Math.hypot(caster.player().x-friend.player().x,caster.player().z-friend.player().z)<1);
    caster.send({type:'attack',ability:'holy-word-serenity',targetId:friend.player().id});await delay(50);assert.equal(caster.events('combat').length,0,'support cannot cross a region boundary even at close range');
  }
  {
    const [caster]=await fixture([hero('Cleric',{...at(0,3.4),hp:600})],{aggroRange:20,damage:30});
    const attack=await until(()=>caster.snapshot.enemies.find(e=>e.id===enemy.id).attack,'enemy swing');
    await start(caster,'power-word-shield');const shield=structuredClone(caster.player().shield),hp=caster.player().hp;assert(shield.amount>0&&shield.endsAt===clock+15000);
    await tick(attack.impactAt);const absorbed=caster.events('damage').filter(e=>e.effect==='absorb');assert(absorbed.length===1&&absorbed[0].amount>0,'shield absorbs actual incoming hit');
    const taken=caster.events('damage').filter(e=>e.targetKind==='player'&&!e.effect).reduce((sum,e)=>sum+e.amount,0);assert.equal(caster.player().hp,hp-taken);
    assert.equal(caster.player().shield?.amount||0,shield.amount-absorbed[0].amount,'absorbed damage consumes authoritative capacity');
    await tick(shield.endsAt+1);assert.equal(caster.player().shield,null,'shield expires on realm time');
  }
  console.log('PASS Cleric combat: fixed casts, instant impact timing/GCD, cancellation, friendly/dead/range/instance guards, party healing, channel ticks/movement/cancel, absorb consumption/expiry, and durable healing.');
} finally { await stop();Date.now=realNow;Object.assign(MONSTERS['moss-slime'],slime);rmSync(dir,{recursive:true,force:true}); }
