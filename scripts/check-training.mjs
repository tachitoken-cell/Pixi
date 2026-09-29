import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import pg from 'pg';
import { playerDatabaseFixture } from './fixture-player-database.mjs';
import { createGameServer } from '../server.mjs';
import { TRAINER_NPCS, RIDING_LESSONS, MOUNT_PRICES, spellTrainingCost } from '../src/training.ts';
import { SPELLS, spellsForClass, legacyAbility, abilityUnlocked, hotbarValid, defaultHotbar, availableHotbar } from '../src/spells.ts';
import { MOUNTS, mountSpeed, WALK_SPEED } from '../src/travel.ts';
import { starterGear } from '../src/progression.ts';
import { toWorld, regionAt, canTraverse, OVERWORLD_SPAWNS, WORLD_COLLIDERS, WORLD_BOUNDS } from '../src/realm.ts';
import { VILLAGE_NPCS } from '../src/settlements.ts';
import { findPath } from '../src/navigation.ts';
import { combatTiming } from '../src/combat-timing.ts';
import { waterAt, movementCost } from '../src/landscape.ts';
import { ZONES } from '../src/content.ts';
import { DUNGEON_ENTRANCE } from '../src/adventure.ts';
import { COMMUNITY_VERSION } from '../src/community.ts';

const dir=mkdtempSync(join(tmpdir(),'mossvale-training-')),file=join(dir,'players.json'),clients=[],realNow=Date.now,realClient=pg.Client;
let clock=realNow(),game,port,releasePendingWrite;Date.now=()=>clock;
const key=token=>createHash('sha256').update(token).digest('hex');
const primary=className=>[legacyAbility(className)];
const npc=(role,zone='greenwood')=>TRAINER_NPCS.find(npc=>npc.role===role&&npc.zone===zone);
const mage=npc('mage-trainer'),riding=npc('riding-trainer'),seller=npc('mount-seller');
const castTarget = OVERWORLD_SPAWNS.find(enemy=>enemy.id==='slime-0');
const castPoint = Array.from({length:32},(_,i)=>({x:castTarget.x+Math.cos(i*Math.PI/16)*7.25,z:castTarget.z+Math.sin(i*Math.PI/16)*7.25}))
  .find(point=>!waterAt(point.x,point.z)&&canTraverse(point,castTarget));
assert(castPoint,'the current starting-zone enemy has a dry, visible casting approach');
function beside(npc,distance=2){
  const point=Array.from({length:32},(_,i)=>({x:npc.x+Math.sin(i*Math.PI/16)*distance,z:npc.z+Math.cos(i*Math.PI/16)*distance}))
    .find(point=>!waterAt(point.x,point.z)&&canTraverse(point,point)&&canTraverse(point,npc));
  assert(point,`${npc.id} has a dry, reachable approach`);return point;
}
let blocked;
for(const merchant of VILLAGE_NPCS.filter(npc=>npc.role==='merchant')){
  for(let i=0;i<256;i++){
    const point={x:merchant.x+Math.sin(i*Math.PI/128)*2.95,z:merchant.z+Math.cos(i*Math.PI/128)*2.95};
    if(!waterAt(point.x,point.z)&&regionAt(point.x,point.z)===merchant.zone&&canTraverse(point,point)&&!canTraverse(point,merchant)){blocked={npc:merchant,point};break;}
  }
  if(blocked)break;
}
assert(blocked,'actual town scenery provides an obstructed point within 3m');
function hero(name,className='Mage',point=beside(mage),extra={}){
  const level=extra.level??60,maxHp=100+(level-1)*12;
  return {id:randomUUID(),name,appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className},
    ...point,zone:regionAt(point.x,point.z),coordinateVersion:2,rotation:0,characterCreated:true,talents:[],...starterGear(className),
    level,maxHp,hp:maxHp,xp:0,gold:20000,learnedSpells:primary(className),ridingRank:0,ownedMounts:[],hotbar:defaultHotbar(className,level,primary(className)),
    inventory:{wood:0,crystal:0,herb:0,potion:3,relic:0},quest:{stage:0,kills:0,crystals:0},...extra};
}
const progress=p=>structuredClone({gold:p.gold,learnedSpells:p.learnedSpells,ridingRank:p.ridingRank,ownedMounts:p.ownedMounts,hotbar:p.hotbar});
async function until(fn,label){const end=realNow()+5000;while(realNow()<end){const result=fn();if(result)return result;await delay(10);}throw Error(`Timed out: ${label}`);}
async function tick(ms=1000){clock=Math.ceil(clock+ms);await delay(120);}
async function start(records){if(records)writeFileSync(file,JSON.stringify(records));game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:''});port=await game.start();}
async function stop(){await game?.stop();game=null;}
async function connect(token,characterId,enter=true){
  const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),c={socket,messages:[]};clients.push(c);
  c.send=message=>socket.send(JSON.stringify(message));c.player=()=>c.snapshot?.players.find(p=>p.id===c.welcome?.id);
  socket.on('message',raw=>{const m=JSON.parse(raw);if(m.type!=='snapshot')c.messages.push(m);if(['snapshot','roster','welcome'].includes(m.type))c[m.type]=m;});
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});c.send({type:'join',token});await until(()=>c.roster,'roster');
  if(enter){c.send({type:'selectCharacter',characterId:characterId||c.roster.characters[0].id});await until(()=>c.player(),'world entry');}return c;
}
async function unchanged(c,requests,label){const before=progress(c.player());for(const request of requests)c.send(request);await tick();assert.deepEqual(progress(c.player()),before,label);}
async function summon(c){c.send({type:'mount',mount:'horse'});const cast=await until(()=>c.player().casting?.ability==='mount'&&c.player().casting,'owned mount preparation');await tick(cast.endsAt-clock);assert.equal(c.player().travel.mount,'horse');}
async function move(c,to){
  const path=findPath(c.player(),to,WORLD_COLLIDERS,WORLD_BOUNDS);assert(path.length,'walkable route');
  for(const point of path)while(Math.hypot(c.player().x-point.x,c.player().z-point.z)>.001){const p=c.player(),gap=Math.hypot(point.x-p.x,point.z-p.z),step=Math.min(2,gap),next={x:p.x+(point.x-p.x)*step/gap,z:p.z+(point.z-p.z)*step/gap};
    assert(canTraverse(p,next));clock+=Math.ceil(movementCost(p,next)/WALK_SPEED*1000)+100;c.send({type:'move',...next,rotation:0});await until(()=>Math.hypot(c.player().x-next.x,c.player().z-next.z)<.001,'manual movement');}
}
const learn=(npcId,ability='frostbolt')=>({type:'learnSpell',npcId,ability});
const ride=(npcId,rank=1)=>({type:'learnRiding',npcId,rank});
const buy=(npcId,mount='horse')=>({type:'buyMount',npcId,mount});

try{
  assert.deepEqual(RIDING_LESSONS.map(({rank,level,cost})=>[rank,level,cost]),[[1,25,100],[2,50,500]]);
  assert.deepEqual(MOUNT_PRICES,{horse:75,wolf:125});assert.equal(TRAINER_NPCS.length,ZONES.length*6);
  for(const className of ['Ranger','Knight','Mage','Cleric']){
    const initial=primary(className);assert(!abilityUnlocked(initial[0],className,50,[]));assert(abilityUnlocked(initial[0],className,1,initial));
    assert(!hotbarValid(defaultHotbar(className,50),className,50,initial));
    assert.deepEqual(availableHotbar(defaultHotbar(className,50),className,50,[]),[null,null,'mend','interact',null,null,null,null,null,null]);
    assert.equal(spellTrainingCost(initial[0]),0);
    for(const spell of spellsForClass(className).filter(spell=>spell.requiredLevel>1))assert.equal(spellTrainingCost(spell.id),spell.requiredLevel*5);
  }
  assert.deepEqual([mountSpeed(24,1),mountSpeed(25,0),mountSpeed(25,1),mountSpeed(50,1),mountSpeed(50,2)],[0,0,10,10,14]);
  const townHeroes=TRAINER_NPCS.map((trainer,i)=>hero(`Town pupil ${i}`,trainer.className||'Mage',beside(trainer),{ridingRank:trainer.role==='mount-seller'?1:0}));
  for(const p of townHeroes)assert(canTraverse(p,p)&&!waterAt(p.x,p.z),'training pupils stand on dry, unblocked ground');
  const extra=[
    hero('Low mage','Mage',beside(mage),{level:SPELLS.frostbolt.requiredLevel-1}),hero('Poor mage','Mage',beside(mage),{gold:spellTrainingCost('frostbolt')-1}),
    hero('Low rider','Mage',beside(riding),{level:24}),hero('Poor rider','Mage',beside(riding),{level:25,gold:99}),
    hero('Poor mount buyer','Mage',beside(seller),{level:25,ridingRank:1,gold:74}),hero('Untrained buyer','Mage',beside(seller),{level:25}),
    hero('Distant pupil','Mage',beside(mage,4.01)),hero('Fallen pupil','Mage',beside(mage),{hp:0}),
    hero('Swimming pupil','Mage',{x:WORLD_BOUNDS.minX+4,z:0}),hero('Dungeon pupil','Mage',toWorld('hollow',DUNGEON_ENTRANCE),{rootvaultUnlocked:true}),
    hero('Wrong calling','Mage',beside(npc('ranger-trainer'))),hero('Failed spell save'),hero('Failed riding save','Mage',beside(riding)),
    hero('Failed mount save','Mage',beside(seller),{ridingRank:1}),hero('Free primary','Mage',beside(mage),{learnedSpells:[],hotbar:defaultHotbar('Mage',50,[])}),
    hero('Obstructed pupil','Mage',blocked.point),hero('Untrained caster','Mage',castPoint,{level:20}),
  ];
  const heroes=[...townHeroes,...extra],tokens=heroes.map(()=>randomBytes(32).toString('base64url')),newToken=randomBytes(32).toString('base64url');
  const legacy=[1,25,50].map(level=>{const p=hero(`Legacy ${level}`,'Ranger',beside(npc('ranger-trainer')),{level});delete p.learnedSpells;delete p.ridingRank;delete p.ownedMounts;p.hotbar=defaultHotbar('Ranger',level);return p;});
  const legacyToken=randomBytes(32).toString('base64url'),records=Object.fromEntries(heroes.map((p,i)=>[key(tokens[i]),{characters:[p]}]));
  records[key(tokens[0])].characters.push(hero('Second character','Ranger',beside(riding)));
  records[key(newToken)]={characters:[]};records[key(legacyToken)]={characters:legacy};await start(records);
  let pupils=await Promise.all(tokens.map(token=>connect(token)));
  const legacyClient=await connect(legacyToken,undefined,false);
  for(const p of legacyClient.roster.characters){assert.deepEqual(p.learnedSpells,spellsForClass('Ranger').filter(spell=>({arrow:1,volley:20,'power-shot':5,multishot:15,'poison-shot':10})[spell.id]<=p.level).map(spell=>spell.id));assert.equal(p.ridingRank,p.level>=50?2:p.level>=25?1:0);assert.deepEqual(p.ownedMounts,p.level>=25?MOUNTS.filter(mount=>!mount.storeOnly&&!mount.dropOnly&&!('referralOnly' in mount)).map(mount=>mount.id):[]);}
  const fresh=await connect(newToken,undefined,false);fresh.send(learn(mage.id));await tick();assert.equal(fresh.roster.characters.length,0,'roster-only requests cannot learn skills');
  fresh.send({type:'acceptCommunityRules',version:COMMUNITY_VERSION});
  await until(()=>fresh.messages.some(message=>message.type==='community'&&message.accepted),'community rules accepted');
  fresh.send({type:'createCharacter',name:'Brand New',appearance:heroes[0].appearance,learnedSpells:Object.keys(SPELLS),ridingRank:2,ownedMounts:['horse','wolf']});
  await until(()=>fresh.roster.characters.length===1,'created character');const created=fresh.roster.characters[0];assert.deepEqual(created.learnedSpells,primary(created.appearance.className));assert.equal(created.ridingRank,0);assert.deepEqual(created.ownedMounts,[]);
  const mainMage=pupils[TRAINER_NPCS.indexOf(mage)],at=i=>pupils[townHeroes.length+i];
  const untrained=at(16),nearTarget=untrained.snapshot.enemies.find(enemy=>enemy.id==='slime-0');
  assert(nearTarget?.alive&&Math.hypot(untrained.player().x-nearTarget.x,untrained.player().z-nearTarget.z)<SPELLS.nova.range&&canTraverse(untrained.player(),nearTarget),'unlearned cast target is alive, visible and within named and legacy ranges');
  const targetHp=nearTarget.hp;
  untrained.send({type:'attack',ability:'frostbolt',targetId:nearTarget.id});untrained.send({type:'attack',skill:'special'});await tick();
  assert(!untrained.messages.some(message=>message.type==='combat'&&message.playerId===untrained.player().id));assert.deepEqual(untrained.player().abilityCooldowns,{});assert.equal(untrained.snapshot.enemies.find(enemy=>enemy.id===nearTarget.id).hp,targetHp,'unlearned in-range attacks cause no damage');untrained.socket.close();
  // Relocate one catalog NPC only inside this isolated test to exercise real scenery LOS independently of distance.
  const originalTrainer={x:mage.x,z:mage.z,zone:mage.zone};
  Object.assign(mage,{x:blocked.npc.x,z:blocked.npc.z,zone:blocked.npc.zone});
  try{await unchanged(at(15),[learn(mage.id)],'a real obstruction inside 3m blocks training');}finally{Object.assign(mage,originalTrainer);}

  await unchanged(mainMage,[learn(undefined),learn('__proto__'),learn({id:mage.id}),learn(riding.id),learn(npc('mage-trainer','amberwild').id),learn(mage.id,'arrow'),learn(mage.id,'constructor'),{...learn(mage.id),cost:0},{...learn(mage.id),level:99},{type:'learnSpell',npcId:mage.id}], 'missing, fake, remote, wrong-role/class, unknown spell and forged request fields reject');
  mainMage.send({type:'attack',ability:'frostbolt',targetId:'slime-1'});mainMage.send({type:'attack',skill:'special'});mainMage.send({type:'setHotbar',slots:defaultHotbar('Mage',50)});await tick();
  assert(!mainMage.messages.some(message=>message.type==='combat'&&message.playerId===mainMage.player().id));assert.deepEqual(mainMage.player().abilityCooldowns,{});assert.deepEqual(mainMage.player().hotbar,defaultHotbar('Mage',50,['fireball']));
  for(const i of [0,1,6,7,8,10])await unchanged(at(i),[learn(mage.id)],`${extra[i].name} cannot learn a spell`);
  for(const i of [2,3])await unchanged(at(i),[ride(riding.id)],`${extra[i].name} cannot learn riding`);
  for(const i of [4,5])await unchanged(at(i),[buy(seller.id)],`${extra[i].name} cannot buy a mount`);
  await unchanged(pupils[0],[ride(riding.id,2),ride(riding.id,0),ride(riding.id,'1'),{...ride(riding.id),gold:0}], 'riding requires the prior rank and exact server-owned fields');
  await unchanged(pupils[1],[buy(seller.id,'verdant-revenant'),buy(seller.id,'dragon'),buy(seller.id,'constructor'),{...buy(seller.id),speed:99}], 'mount purchases reject unknown mounts and chosen speeds');
  at(9).send({type:'dungeonEnter'});await until(()=>at(9).player().instanceId,'dungeon entry');await unchanged(at(9),[learn(mage.id),ride(riding.id),buy(seller.id)],'dungeon players cannot reach overworld training');
  for(let i=0;i<TRAINER_NPCS.length;i++){
    const trainer=TRAINER_NPCS[i],c=pupils[i],before=progress(c.player());clock+=1000;c.send({type:'interact',targetId:trainer.id});await until(()=>c.messages.some(message=>message.type==='dialogue'&&message.npcId===trainer.id),`${trainer.id} dialogue`);
    let cost=0;
    if(trainer.className){for(const spell of spellsForClass(trainer.className).filter(spell=>spell.requiredLevel>1)){const message=learn(trainer.id,spell.id);c.send(message);c.send(message);await until(()=>c.player().learnedSpells.includes(spell.id),`${spell.id} trained`);cost+=spellTrainingCost(spell.id);}assert.deepEqual(c.player().hotbar,before.hotbar,'training does not overwrite chosen hotbar slots');
      clock+=1000;c.send({type:'setHotbar',slots:defaultHotbar(trainer.className,50,c.player().learnedSpells)});await until(()=>c.player().hotbar[1]!==null,'trained spells can be assigned');
    }else if(trainer.role==='riding-trainer'){for(const lesson of RIDING_LESSONS){c.send(ride(trainer.id,lesson.rank));c.send(ride(trainer.id,lesson.rank));await until(()=>c.player().ridingRank===lesson.rank,lesson.label);cost+=lesson.cost;}}
    else {for(const mount of MOUNTS.filter(mount=>!mount.storeOnly&&!mount.dropOnly&&!('referralOnly' in mount))){c.send(buy(trainer.id,mount.id));c.send(buy(trainer.id,mount.id));await until(()=>c.player().ownedMounts.includes(mount.id),`${mount.id} purchased`);cost+=MOUNT_PRICES[mount.id];}await summon(c);assert.equal(mountSpeed(c.player().level,c.player().ridingRank),10,'level 50 without expert training keeps apprentice speed');}
    assert.equal(c.player().gold,before.gold-cost,'duplicate transactions charge once');
  }
  await move(pupils[0],beside(seller));pupils[0].send(buy(seller.id));await until(()=>pupils[0].player().ownedMounts.includes('horse'),'trained rider buys mount');await summon(pupils[0]);assert.equal(mountSpeed(pupils[0].player().level,pupils[0].player().ridingRank),14);
  await unchanged(at(5),[{type:'mount',mount:'horse'}], 'untrained players cannot summon a mount');assert.equal(at(5).player().travel.mount,null);
  at(14).send(learn(mage.id,'fireball'));await until(()=>at(14).player().learnedSpells.includes('fireball'),'free primary training');assert.equal(at(14).player().gold,extra[14].gold);
  // Block only the isolated save file. Unlocks and their gold charge must either both persist or neither apply.
  const failures=[{c:at(11),message:learn(mage.id),field:'learnedSpells',value:'frostbolt'},{c:at(12),message:ride(riding.id),field:'ridingRank',value:1},{c:at(13),message:buy(seller.id),field:'ownedMounts',value:'horse'}];
  mkdirSync(`${file}.tmp`);const previousError=console.error;console.error=()=>{};
  try{for(const {c,message} of failures){const before=progress(c.player()),count=c.messages.length;c.send(message);await until(()=>c.messages.slice(count).some(message=>message.type==='event'&&message.text.includes('could not be saved')),'failed persistence response');await tick();assert.deepEqual(progress(c.player()),before,'failed persistence never grants training or charges gold');}}
  finally{console.error=previousError;rmSync(`${file}.tmp`,{recursive:true,force:true});}
  for(const {c,message,field,value} of failures){c.send(message);await until(()=>Array.isArray(c.player()[field])?c.player()[field].includes(value):c.player()[field]===value,'retry after persistence recovery');}
  await move(mainMage,castPoint);
  const target=mainMage.snapshot.enemies.find(enemy=>enemy.alive&&Math.hypot(enemy.x-mainMage.player().x,enemy.z-mainMage.player().z)<=SPELLS.frostbolt.range&&canTraverse(mainMage.player(),enemy));assert(target,'trained caster has a visible target');
  const beforeCast=mainMage.messages.length,beforeHp=target.hp;mainMage.send({type:'attack',ability:'frostbolt',targetId:target.id});
  const preparation=await until(()=>mainMage.player().casting,'trained Frostbolt preparation');clock=preparation.endsAt;await tick(0);
  const cast=await until(()=>mainMage.messages.slice(beforeCast).find(message=>message.type==='combat'&&message.playerId===mainMage.player().id),'trained Frostbolt accepted');
  const timing=combatTiming(cast.ability,Math.hypot(cast.targets[0].x-cast.from.x,cast.targets[0].z-cast.from.z)),impact=cast.startedAt+(timing.delay+timing.flight)*1000;
  clock=impact-1;await tick(0);assert.equal(mainMage.snapshot.enemies.find(enemy=>enemy.id===target.id).hp,beforeHp,'learned spell still waits for its impact');
  clock=impact+1;await tick(0);assert(mainMage.snapshot.enemies.find(enemy=>enemy.id===target.id).hp<beforeHp,'trained spell deals authoritative damage');
  const saved=pupils.map(c=>progress(c.player()));await stop();const disk=JSON.parse(readFileSync(file,'utf8'));
  for(let i=0;i<heroes.length;i++)assert.deepEqual(progress(disk[key(tokens[i])].characters[0]),saved[i],'gold and training are durably saved together');
  assert.deepEqual(disk[key(tokens[0])].characters[1].learnedSpells,['arrow']);assert.equal(disk[key(tokens[0])].characters[1].ridingRank,0);assert.deepEqual(disk[key(tokens[0])].characters[1].ownedMounts,[],'another character never inherits training or mounts');
  await start();pupils=await Promise.all(tokens.slice(0,TRAINER_NPCS.length).map(token=>connect(token)));for(let i=0;i<TRAINER_NPCS.length;i++)assert.deepEqual(progress(pupils[i].player()),saved[i],'training survives server restart');await stop();
  const good=JSON.parse(readFileSync(file,'utf8')),invalid=[{learnedSpells:null},{learnedSpells:['fireball','fireball']},{learnedSpells:['arrow']},{learnedSpells:['constructor']},{ridingRank:null},{ridingRank:3},{ridingRank:'1'},{ownedMounts:null},{ownedMounts:['dragon']},{ownedMounts:['horse','horse']},{ridingRank:0,ownedMounts:['horse']},{learnedSpells:['meteor'],level:1,hp:100,maxHp:100,hotbar:Array(8).fill(null)},{ridingRank:2,level:25,hp:388,maxHp:388}];
  for(const fields of invalid){const corrupt=structuredClone(good);Object.assign(corrupt[key(tokens[4])].characters[0],fields);writeFileSync(file,JSON.stringify(corrupt));assert.throws(()=>createGameServer({port:0,dataDir:dir,keycloak:null,databaseUrl:''}),/Invalid player save/,'present invalid training fields fail closed');}
  // Hold only one isolated database acknowledgment while the real socket keeps receiving requests.
  const pendingHero=hero('Busy reply pupil'),pendingToken=randomBytes(32).toString('base64url');
  const merchant=VILLAGE_NPCS.find(npc=>npc.id==='city-armorer'),shopperToken=randomBytes(32).toString('base64url');
  const shopperHero=hero('Mounted shopper','Mage',beside(merchant),{ridingRank:1,ownedMounts:['horse'],carriedItems:{'slime-residue':2}});
  const databaseRecords={[key(pendingToken)]:{characters:[pendingHero]},[key(shopperToken)]:{characters:[shopperHero]}};let holdNext=false;
  pg.Client=playerDatabaseFixture(databaseRecords,{beforeWrite:async()=>{
    if(holdNext){holdNext=false;await new Promise(resolve=>releasePendingWrite=resolve);releasePendingWrite=undefined;}
  }});
  game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:'postgres://fixture:fixture@127.0.0.1/fixture'});port=await game.start();
  const pendingClient=await connect(pendingToken),beforeBusy=progress(pendingClient.player());
  holdNext=true;pendingClient.send(learn(mage.id));await until(()=>releasePendingWrite,'training persistence acknowledgment held');
  const busyStart=pendingClient.messages.length;
  const heartbeat={type:'move',x:pendingHero.x,z:pendingHero.z,rotation:0};
  for(const request of [heartbeat,learn(mage.id,'nova'),ride(riding.id),buy(seller.id),heartbeat])pendingClient.send(request);
  const busy=()=>pendingClient.messages.slice(busyStart).filter(message=>message.type==='event'&&message.text.startsWith('Saving your changes'));
  await until(()=>busy().length>=3,'each explicit busy request kind receives a causal response');
  assert.deepEqual(busy().map(message=>message.requestType),['learnSpell','learnRiding','buyMount'],'movement is silent while explicit training rejections retain their request type');
  assert.equal(busy().filter(message=>!message.logOnly).length,1,'one visible saving notice per pending transaction');
  assert.deepEqual(progress(pendingClient.player()),beforeBusy,'busy rejections cannot grant another unlock or charge gold while saving');
  pendingClient.send({type:'ping',id:1});await until(()=>pendingClient.messages.some(m=>m.type==='pong'&&m.id===1),'idle heartbeats processed');
  assert.equal(pendingClient.messages.slice(busyStart).filter(m=>m.type==='correction').length,0,'stationary grounded heartbeats do not reset the player or camera during a save');
  for(const changed of [{x:heartbeat.x+.1},{z:heartbeat.z+.1},{rotation:1},{y:pendingClient.player().jump.y+1}])pendingClient.send({...heartbeat,...changed});
  await until(()=>pendingClient.messages.slice(busyStart).filter(m=>m.type==='correction').length===4,'real position, facing and altitude changes still corrected during a save');
  assert(pendingClient.messages.slice(busyStart).filter(m=>m.type==='correction').every(m=>m.x===heartbeat.x&&m.z===heartbeat.z&&m.rotation===heartbeat.rotation&&m.jump.y===pendingClient.player().jump.y));
  releasePendingWrite();await until(()=>pendingClient.player().learnedSpells.includes('frostbolt'),'held training completes');
  assert.equal(pendingClient.player().gold,beforeBusy.gold-spellTrainingCost('frostbolt'));
  assert(!pendingClient.player().learnedSpells.includes('nova'));assert.equal(pendingClient.player().ridingRank,0);assert.deepEqual(pendingClient.player().ownedMounts,[]);
  const shopper=await connect(shopperToken);await summon(shopper);
  const saleGold=shopper.player().gold,saleStart=shopper.messages.length;
  holdNext=true;shopper.send({type:'sellItem',npcId:merchant.id,itemId:'slime-residue',quantity:1});await until(()=>releasePendingWrite,'mounted merchant sale save held');
  const stationary={type:'move',x:shopper.player().x,z:shopper.player().z,rotation:shopper.player().rotation};
  for(let i=0;i<5;i++)shopper.send(stationary);
  shopper.send({type:'ping',id:2});await until(()=>shopper.messages.some(m=>m.type==='pong'&&m.id===2),'mounted sale heartbeats processed');
  assert.equal(shopper.messages.slice(saleStart).filter(m=>m.type==='correction').length,0,'selling while mounted never causes idle movement corrections');
  assert.equal(shopper.player().travel.mount,'horse');assert.equal(shopper.player().gold,saleGold);assert.equal(shopper.player().carriedItems['slime-residue'],2,'sale remains atomic while held');
  releasePendingWrite();await until(()=>shopper.player().carriedItems['slime-residue']===1,'mounted sale completes');
  assert.equal(shopper.player().travel.mount,'horse');assert(shopper.player().gold>saleGold);
  await stop();assert.equal(databaseRecords[key(pendingToken)].characters[0].learnedSpells.filter(id=>id==='frostbolt').length,1,'only the original training request persists');
  console.log(`PASS training: all ${TRAINER_NPCS.length} NPCs and ${ZONES.length*Object.values(SPELLS).filter(spell=>spell.requiredLevel>1).length} paid class lessons, riding prerequisites and both mounts, exact-field/class/level/gold/range/LOS/life/dungeon guards, in-range unlearned casts/hotbars rejected and learned spell impact verified, duplicate protection, free primary, creation defaults, legacy grandfathering, atomic save failures/retries, character isolation, durable restart, strict save validation, and causal busy responses during pending persistence.`);
}finally{releasePendingWrite?.();for(const c of clients)c.socket.terminate();await game?.stop();Date.now=realNow;pg.Client=realClient;rmSync(dir,{recursive:true,force:true});}
