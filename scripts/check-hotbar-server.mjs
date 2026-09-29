import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { DEFAULT_APPEARANCE } from '../src/appearance.ts';
import { starterGear } from '../src/progression.ts';

const dataDir=mkdtempSync(join(tmpdir(),'mossvale-hotbar-banks-')),file=join(dataDir,'players.json');
const token=randomBytes(32).toString('base64url'),key=createHash('sha256').update(token).digest('hex');
const first=['arrow',null,'mend','interact','arrow',null,null,null],second=['power-shot','mend',null,null,null,null,null,null];
const hero={id:randomUUID(),name:'Bank Tester',appearance:{...DEFAULT_APPEARANCE,className:'Ranger'},characterCreated:true,
  coordinateVersion:2,zone:'greenwood',x:0,z:8,rotation:0,level:20,hp:328,maxHp:328,xp:0,gold:10,talents:[],...starterGear('Ranger'),
  inventory:{wood:0,crystal:0,herb:0,potion:3,relic:0},quest:{stage:0,kills:0,crystals:0},
  learnedSpells:['arrow','power-shot'],hotbar:first,onboarding:{version:1,looted:true,bagViewed:true,gearViewed:true,completed:true}};
writeFileSync(file,JSON.stringify({[key]:{characters:[hero,{...hero,id:randomUUID(),name:'Other Bank Tester'}]}}));
let game,client;
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const saveSource=`slots=>${main.slice(main.indexOf('save:slots=>')+'save:slots=>'.length,main.indexOf(', notify:message=>'))}`;
function clientSave(){
  const p=client.player(),slots=[...p.hotbar,...p.hotbarExtra,...p.hotbar2,...p.hotbar2Extra],sent=[],notices=[];
  const save=runInNewContext(saveSource,{connected:true,HOTBAR_PAGE_SIZE:10,serverHotbarPageSize:client.welcome.hotbarPageSize===10?10:8,hotbar:{slots},send:message=>{sent.push(message);client.send(message);},toast:message=>notices.push(message)});
  return {slots,save,sent,notices};
}
async function until(test,label){const end=Date.now()+5000;while(Date.now()<end){const result=test();if(result)return result;await delay(10);}throw Error(`Timed out: ${label}`);}
async function start(factory=createGameServer){
  game=factory({host:'127.0.0.1',port:0,dataDir,keycloak:null,databaseUrl:'',databaseCaBase64:'',realmId:'eu',realmEuOrigin:'',realmUsOrigin:'',realmAsiaOrigin:''});
  const port=await game.start(),socket=new WebSocket(`ws://127.0.0.1:${port}/socket`),messages=[];
  client={socket,messages,send:message=>socket.send(JSON.stringify(message)),player:()=>client.snapshot?.players.find(p=>p.id===hero.id)};
  socket.on('message',raw=>{const message=JSON.parse(raw);messages.push(message);if(message.type==='snapshot')client.snapshot=message;if(message.type==='roster')client.roster=message;if(message.type==='welcome')client.welcome=message;});
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  client.send({type:'join',token});await until(()=>client.roster,'roster');
  client.send({type:'selectCharacter',characterId:hero.id});await until(()=>client.player(),'character entry');
}
async function stop(){client?.socket.terminate();await game?.stop();game=null;}
try {
  await start();assert.deepEqual(client.player().hotbar,first,'migration preserves all original slots including duplicates');assert.deepEqual(client.player().hotbar2,Array(8).fill(null));
  assert.equal(client.welcome.hotbarPageSize,10,'welcome explicitly advertises the connected server capacity');
  assert.deepEqual(client.player().hotbarExtra,[null,null]);assert.deepEqual(client.player().hotbar2Extra,[null,null],'migration adds empty tails to each bank independently');
  for(const request of [{page:2,slots:second},{page:null,slots:second},{page:'1',slots:second},{page:1,slots:[...second.slice(0,7),'fireball']},{page:1,slots:[...second.slice(0,7),'volley']},{page:1,slots:[...second.slice(0,7),'heart-of-the-wild']},{page:1,slots:second,otherSlots:Array(7).fill(null)}]){
    const count=client.messages.filter(m=>m.type==='event'&&m.text.startsWith('Hotbar:')).length;
    client.send({type:'setHotbar',...request});await until(()=>client.messages.filter(m=>m.type==='event'&&m.text.startsWith('Hotbar:')).length>count,'invalid bank rejected');
  }
  assert.deepEqual(client.player().hotbar,first);assert.deepEqual(client.player().hotbar2,Array(8).fill(null),'invalid second-bank edits never alter either bank');
  client.send({type:'setHotbar',page:1,slots:second,otherSlots:first});await until(()=>client.player().hotbar2[0]==='power-shot','second bank saved');
  const edited=[...first];edited[1]='interact';client.send({type:'setHotbar',slots:edited});await until(()=>client.player().hotbar[1]==='interact','legacy edit');assert.deepEqual(client.player().hotbar2,second);
  const firstTail=['power-shot','mend'],secondTail=['arrow','interact'];
  const modern=clientSave();assert.equal(modern.save([...edited,...firstTail,...second,...secondTail]),true);
  assert.equal(modern.sent[0].slots.length,10);assert.equal(modern.sent[0].otherSlots.length,10,'new-client callback sends both complete banks to the capable server');
  await until(()=>client.player().hotbarExtra[0]==='power-shot'&&client.player().hotbar2Extra[0]==='arrow','both ten-slot banks saved atomically');
  assert.deepEqual(client.player().hotbar,edited);assert.deepEqual(client.player().hotbar2,second,'second-bank positions never spill into first-bank slots9/10');
  for(const slots of [[...edited,null],[...edited,null,null,null],[...edited,'fireball',null],[...edited,'volley',null],[...edited,'constructor',null]]){
    const count=client.messages.filter(m=>m.type==='event'&&m.text.startsWith('Hotbar:')).length;
    client.send({type:'setHotbar',slots});await until(()=>client.messages.filter(m=>m.type==='event'&&m.text.startsWith('Hotbar:')).length>count,'invalid extension rejected');
  }
  client.send({type:'setHotbar',slots:first});await until(()=>client.player().hotbar[1]===null,'old client edits prefix after new slots exist');
  assert.deepEqual(client.player().hotbarExtra,firstTail,'an eight-slot client cannot erase slots9/10');assert.deepEqual(client.player().hotbar2Extra,secondTail);
  client.send({type:'setHotbar',slots:edited});await until(()=>client.player().hotbar[1]==='interact','restore edited prefix');
  await stop();let saved=JSON.parse(readFileSync(file))[key].characters;assert.deepEqual(saved[0].hotbar,edited);assert.deepEqual(saved[0].hotbar2,second);assert.deepEqual(saved[1].hotbar2,Array(8).fill(null),'banks belong to their character');
  assert.deepEqual(saved[0].hotbarExtra,firstTail);assert.deepEqual(saved[0].hotbar2Extra,secondTail);assert.deepEqual(saved[1].hotbarExtra,[null,null],'extra slots belong to their character');
  // Optional rolling-release proof against an actual older checkout, never a live server.
  if(process.env.HOTBAR_LEGACY_SERVER){
    const legacy=await import(pathToFileURL(process.env.HOTBAR_LEGACY_SERVER).href);await start(legacy.createGameServer);
    assert.equal(client.welcome.hotbarPageSize,undefined,'preserved tail fields do not advertise support on an old realm');
    assert.deepEqual(client.player().hotbar2,second,'older reader preserves the unknown bank');
    const older=clientSave();for(const index of [8,9,18,19]){const next=[...older.slots];next[index]=null;assert.equal(older.save(next),false);}
    assert.equal(older.sent.length,0,'new client blocks unsupported tail edits without sending rejected requests');assert(older.notices.every(message=>message.includes('still updating')));
    const prefix=[...older.slots];prefix[1]=null;prefix[11]='interact';assert.equal(older.save(prefix),true);
    assert.equal(older.sent[0].slots.length,8);assert.equal(older.sent[0].otherSlots.length,8);
    await until(()=>client.player().hotbar[1]===null&&client.player().hotbar2[1]==='interact','new client edits both prefixes on old server');
    const restore=clientSave(),restored=[...restore.slots];restored[11]='mend';assert.equal(restore.save(restored),true);await until(()=>client.player().hotbar2[1]==='mend','restore second prefix');await stop();
    saved=JSON.parse(readFileSync(file))[key].characters;assert.deepEqual(saved[0].hotbar2,second,'older final save preserves the second bank');
    assert.deepEqual(saved[0].hotbarExtra,firstTail);assert.deepEqual(saved[0].hotbar2Extra,secondTail,'older final saves preserve unknown extensions');
  }
  await start();assert.deepEqual(client.player().hotbar2,second,'restart/reconnect restores the second bank');assert.deepEqual(client.player().hotbarExtra,firstTail);assert.deepEqual(client.player().hotbar2Extra,secondTail);await stop();
  const classChangeSource=process.env.HOTBAR_LEGACY_SERVER ? new URL('./src/class-change.ts',pathToFileURL(process.env.HOTBAR_LEGACY_SERVER)) : new URL('../src/class-change.ts',import.meta.url);
  const {classChangeChanges}=await import(classChangeSource.href),changed=JSON.parse(readFileSync(file));
  const changes=classChangeChanges(changed[key].characters[0],'Mage');assert(changes);
  // Old realms retain unknown fields when applying their class-change transaction.
  const {hotbar2:_newReset,hotbarExtra:_newTail,hotbar2Extra:_newSecondTail,...legacyChanges}=changes;Object.assign(changed[key].characters[0],legacyChanges);writeFileSync(file,JSON.stringify(changed));
  await start();assert.equal(client.player().appearance.className,'Mage');assert.deepEqual(client.player().hotbar2,[null,'mend',null,null,null,null,null,null],'old-realm class change clears only unavailable second-bank spells, without rejecting the account');assert.deepEqual(client.player().hotbarExtra,[null,'mend']);assert.deepEqual(client.player().hotbar2Extra,[null,'interact'],'old-realm class changes clear foreign spells from unknown tails but retain utilities');await stop();
  const validSave=readFileSync(file,'utf8');
  for(const invalid of [Array(8).fill('constructor'),Array(7).fill(null),null]){
    const corrupt=JSON.parse(validSave);corrupt[key].characters[0].hotbar2=invalid;writeFileSync(file,JSON.stringify(corrupt));
    assert.throws(()=>createGameServer({port:0,dataDir,keycloak:null,databaseUrl:''}),/Invalid player save/,'malformed second banks cannot be silently reset');
  }
  for(const field of ['hotbarExtra','hotbar2Extra'])for(const invalid of [[],[null],[null,null,null],['constructor',null],null]){
    const corrupt=JSON.parse(validSave);corrupt[key].characters[0][field]=invalid;writeFileSync(file,JSON.stringify(corrupt));
    assert.throws(()=>createGameServer({port:0,dataDir,keycloak:null,databaseUrl:''}),/Invalid player save/,'malformed tails cannot be silently reset');
  }
  console.log('PASS hotbar server: legacy migration, two saved banks, strict bank/class/training/level validation, atomic rejection, legacy edits, per-character isolation, final save and reconnect'+(process.env.HOTBAR_LEGACY_SERVER?', actual old-reader/write compatibility.':'.'));
} finally {await stop();rmSync(dataDir,{recursive:true,force:true});}
