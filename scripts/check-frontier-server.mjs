import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID,randomBytes,createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { ZONES } from '../src/content.ts';
import { MONSTERS,WORLD_BOSS,monsterSpawnLevel } from '../src/bestiary.ts';
import { VILLAGES,WILDERNESS_SPAWNS,TOWN_BOUNDS,townDistance } from '../src/settlements.ts';
import { createOverworldSpawns,overworldSpawnAllowed,canTraverse,toWorld,regionAt } from '../src/realm.ts';
import { surfaceAt,EXPEDITIONS,EXPEDITION_NODE_OFFSETS } from '../src/landscape.ts';
import { CONTRACTS,BOARD_POSITION,newContracts } from '../src/adventure.ts';
import { MAX_LEVEL, starterGear } from '../src/progression.ts';
import { defaultHotbar } from '../src/spells.ts';
import { TRAINING_DUMMIES } from '../src/training-dummies.ts';

const dir=mkdtempSync(join(tmpdir(),'mossvale-frontier-')),file=join(dir,'players.json'),realNow=Date.now;
const originals=structuredClone(MONSTERS),originalCore=ZONES[0].enemies,originalWild={...WILDERNESS_SPAWNS[0]},originalBoss={...WORLD_BOSS},townCount=TOWN_BOUNDS.length;
const clients=[];let game,port,clock=realNow();Date.now=()=>clock;
const key=token=>createHash('sha256').update(token).digest('hex');
async function until(fn,label){const end=realNow()+6000;while(realNow()<end){const result=fn();if(result)return result;await delay(12);}throw Error(`Timed out: ${label}`);}
async function tick(ms){clock+=ms;await delay(140);}
async function stop(){for(const c of clients.splice(0))c.socket.terminate();await game?.stop();game=null;}
async function start(){game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:''});port=await game.start();}
function hero(name,point,level=60){return {
 id:randomUUID(),name,...point,zone:regionAt(point.x,point.z),coordinateVersion:2,rotation:0,level,maxHp:100+(level-1)*12,hp:100+(level-1)*12,xp:0,gold:500,
 appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className:'Knight'},characterCreated:true,talents:[],...starterGear('Knight'),learnedSpells:['strike'],hotbar:defaultHotbar('Knight'),
 inventory:{wood:0,crystal:0,herb:0,relic:0,potion:0},skills:{mining:0,woodcutting:0,herbalism:0},contracts:newContracts(),quest:{stage:0,kills:0,crystals:0}
};}
function writeHeroes(heroes,tokens){writeFileSync(file,JSON.stringify(Object.fromEntries(heroes.map((p,i)=>[key(tokens[i]),{characters:[p]}]))));}
async function connect(token){
 const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),c={socket,messages:[],token};clients.push(c);c.send=m=>socket.send(JSON.stringify(m));c.player=()=>c.snapshot?.players.find(p=>p.id===c.welcome?.id);
 c.enemy=id=>c.snapshot?.enemies.find(e=>e.id===id);
 socket.on('message',raw=>{const m=JSON.parse(raw);c.messages.push(m);if(['snapshot','roster','welcome'].includes(m.type))c[m.type]=m;});
 await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});c.send({type:'join',token});await until(()=>c.roster,'roster');c.send({type:'selectCharacter',characterId:c.roster.characters[0].id});await until(()=>c.player(),'world entry');return c;
}
function beside(point){
 for(const [x,z] of [[0,-2],[0,2],[-2,0],[2,0]]){const p={x:point.x+x,z:point.z+z};if(canTraverse(p,point)&&!surfaceAt(p.x,p.z).water)return p;}
 throw Error(`No approach beside ${point.id}`);
}
async function kill(c,id){
 const index=c.messages.length;c.send({type:'autoAttack',targetId:id});const hit=await until(()=>c.messages.slice(index).find(m=>m.type==='combat'&&m.basic),'automatic strike released');
 await tick(Math.max(0,hit.startedAt+301-clock));await until(()=>c.enemy(id)?.alive===false,'actual monster kill');
}
async function moveSaved(token,point){
 // Reposition only this isolated fixture between runs; preserve all server-earned progression.
 await stop();const saved=JSON.parse(readFileSync(file,'utf8')),p=saved[key(token)].characters[0];Object.assign(p,point,{zone:regionAt(point.x,point.z)});writeFileSync(file,JSON.stringify(saved));await tick(3000);await start();return connect(token);
}
try {
 for(const stats of Object.values(MONSTERS))Object.assign(stats,{hp:1,speed:0,aggroRange:0});
 // Force every source to propose a home in town. Initial generation must relocate, never omit it.
 ZONES[0].enemies=[{id:'protected-story',kind:'moss-slime',x:0,z:0}];Object.assign(WILDERNESS_SPAWNS[0],{x:0,z:0,zone:'greenwood'});Object.assign(WORLD_BOSS,{x:0,z:0});
 const forcedIds=['protected-story',WILDERNESS_SPAWNS[0].id,WORLD_BOSS.id],homes=createOverworldSpawns().filter(s=>forcedIds.includes(s.id));assert.equal(homes.length,3);
 const tokens=homes.map(()=>randomBytes(32).toString('base64url'));writeHeroes(homes.map((home,i)=>hero(`Spawn inspector ${i}`,beside(home))),tokens);await start();
 for(const [i,home] of homes.entries()){
  const c=await connect(tokens[i]),enemy=await until(()=>c.enemy(home.id),'protected source present in actual snapshot');
  assert.equal(enemy.x,home.x);assert.equal(enemy.z,home.z);assert(townDistance(enemy)>=100&&overworldSpawnAllowed(enemy,enemy.zone));
 }
 const storyClient=clients[homes.findIndex(h=>h.id==='protected-story')],before=storyClient.enemy('protected-story');await kill(storyClient,before.id);
 // A newly protected footprint at the former home proves respawns revalidate the rule.
 TOWN_BOUNDS.push({id:'fixture-new-town',name:'Fixture only',zone:before.zone,minX:before.x-15,maxX:before.x+15,minZ:before.z-15,maxZ:before.z+15});
 await tick(15000);const respawn=await until(()=>storyClient.enemy(before.id)?.alive&&storyClient.enemy(before.id),'safe respawn');
 assert(townDistance(respawn)>=100&&overworldSpawnAllowed(respawn,respawn.zone));assert(Math.hypot(respawn.x-before.x,respawn.z-before.z)>=115,'respawn cannot reuse a newly protected home');
 const earnedXp=storyClient.player().xp;await stop();await start();const restarted=await connect(storyClient.token);assert.equal(restarted.player().xp,earnedXp,'spawn changes preserve earned progress across restart');
 assert(restarted.snapshot.enemies.every(e=>townDistance(e)>=100||TRAINING_DUMMIES.some(dummy=>dummy.id===e.id&&dummy.kind===e.kind&&dummy.x===e.x&&dummy.z===e.z)),'restart applies town exclusion except exact authored training targets');await stop();
 TOWN_BOUNDS.splice(townCount);ZONES[0].enemies=originalCore;Object.assign(WILDERNESS_SPAWNS[0],originalWild);Object.assign(WORLD_BOSS,originalBoss);

 const board=toWorld('sunveil',{x:BOARD_POSITION.x,z:BOARD_POSITION.z+2}),patrol=CONTRACTS.find(c=>c.id==='dune-wells-patrol'),supplies=CONTRACTS.find(c=>c.id==='dune-wells-supplies');
 const highToken=randomBytes(32).toString('base64url'),lowToken=randomBytes(32).toString('base64url');writeHeroes([hero('Frontier adventurer',board),hero('Early visitor',board,29)],[highToken,lowToken]);await start();
 let high=await connect(highToken);const low=await connect(lowToken);
 low.send({type:'acceptContract',contractId:patrol.id});await until(()=>low.messages.some(m=>m.type==='event'&&m.text.includes('higher level')),'server rejects below-level contract');assert.equal(low.player().contracts.active[patrol.id],undefined);
 for(const contract of [patrol,supplies]){high.send({type:'acceptContract',contractId:contract.id});await until(()=>high.player().contracts.active[contract.id]===0,'server accepts eligible regional job');}
 const target=createOverworldSpawns().find(s=>s.kind===patrol.target&&surfaceAt(s.x,s.z).regionId===patrol.targetRegion&&monsterSpawnLevel(s,patrol.targetRegion)>=patrol.targetLevel);assert(target);
 high=await moveSaved(highToken,beside(target));
 for(let i=0;i<patrol.count;i++){await kill(high,target.id);assert.equal(high.player().contracts.active[patrol.id],i+1,'only real eligible kills advance the patrol');if(i+1<patrol.count)await tick(15000);}
 const wrong=EXPEDITIONS.find(c=>c.id==='saffron-mesa'),camp=EXPEDITIONS.find(c=>c.id===supplies.targetRegion),offset=EXPEDITION_NODE_OFFSETS[2];
 for(const [area,expected] of [[wrong,0],[camp,supplies.count]]){
  const node={id:`expedition-${area.id}-node-2`,x:area.x+offset.x,z:area.z+offset.z};high=await moveSaved(highToken,beside(node));
  for(let i=0;i<(expected||1);i++){
   high.send({type:'gather',targetId:node.id});const gather=await until(()=>high.player().gathering,'real resource gathering');await tick(gather.endsAt-clock+1);await until(()=>high.player().gathering===null,'resource collected');
   assert.equal(high.player().contracts.active[supplies.id],expected?i+1:0,'matching resource from the wrong region cannot advance a frontier job');if(i+1<expected)await tick(23000);
  }
 }
 high=await moveSaved(highToken,board);const gold=high.player().gold;
 for(const contract of [patrol,supplies]){high.send({type:'claimContract',contractId:contract.id});await until(()=>high.player().contracts.completed[contract.id]>clock,'claim records reward cooldown');}
 assert.equal(high.player().gold,gold+patrol.reward.gold+supplies.reward.gold);assert.equal(high.player().level,MAX_LEVEL);assert.equal(high.player().xp,0,'level-60 quest rewards retain the XP cap');
 const paid=high.player().gold;high.send({type:'claimContract',contractId:patrol.id});high.send({type:'acceptContract',contractId:patrol.id});await tick(1000);assert.equal(high.player().gold,paid);assert.equal(high.player().contracts.active[patrol.id],undefined,'replayed claims and premature repeats do not pay');
 await tick(patrol.cooldownMs);high.send({type:'acceptContract',contractId:patrol.id});await until(()=>high.player().contracts.active[patrol.id]===0,'frontier job repeats after its cooldown');
 await stop();await start();high=await connect(highToken);assert.equal(high.player().contracts.active[patrol.id],0);assert.equal(high.player().gold,paid,'paid rewards and a repeat survive restart');
 assert.deepEqual(VILLAGES.filter(v=>v.size==='town').map(v=>v.id).sort(),['town-amberwild','town-frostmarch','town-hollow','town-mistwood','town-sunveil']);
 console.log('PASS frontier server: all spawn sources relocate beyond100m from town boundaries, respawns/restarts revalidate, progression survives, authoritative level-gated contracts advance only from actual eligible regional kills/gathers, rewards/cooldowns/replays persist.');
} finally {
 await stop();Date.now=realNow;ZONES[0].enemies=originalCore;Object.assign(WILDERNESS_SPAWNS[0],originalWild);Object.assign(WORLD_BOSS,originalBoss);TOWN_BOUNDS.splice(townCount);
 for(const [kind,stats] of Object.entries(originals))Object.assign(MONSTERS[kind],stats);rmSync(dir,{recursive:true,force:true});
}
