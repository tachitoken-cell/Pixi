import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer, migrateRecords, validateRecords } from '../server.mjs';
import { COMMUNITY_VERSION } from '../src/community.ts';

const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-atlas-check-')), clients = [];
const appearance = { skin:'#dca67f', hair:'#49362b', hairStyle:'swept', outfit:'#577956', accent:'#d8b36a', className:'Ranger' };
const realNow = Date.now; let offset = 0, game, port;
Date.now = () => realNow() + offset;
async function until(predicate, label) {
  const deadline = realNow() + 5000;
  while (realNow() < deadline) { const value = predicate(); if (value) return value; await delay(15); }
  throw Error(`Timed out: ${label}`);
}
async function start() {
  game = createGameServer({ port:0, host:'127.0.0.1', dataDir, keycloak:null, databaseUrl:'', walletOidc:{ env:{} } });
  port = await game.start();
}
async function connect(token, name = 'Atlas Explorer') {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, messages:[], token };
  clients.push(c);
  socket.on('message', raw => { const m=JSON.parse(raw); c.messages.push(m); if (['roster','welcome','snapshot'].includes(m.type)) c[m.type]=m; });
  await new Promise((resolve,reject) => { socket.once('open',resolve); socket.once('error',reject); });
  c.send = message => socket.send(JSON.stringify(message));
  c.player = () => c.snapshot?.players.find(p => p.id === c.welcome?.id);
  c.send({ type:'join', ...(token ? {token} : {}) });
  await until(() => c.roster, 'account roster'); c.token = c.roster.token || token;
  if (!c.messages.some(m => m.type === 'community' && m.accepted)) {
    c.send({ type:'acceptCommunityRules', version:COMMUNITY_VERSION });
    await until(() => c.messages.some(m => m.type === 'community' && m.accepted), 'community accepted');
  }
  if (!c.roster.characters.length) {
    c.send({ type:'createCharacter', name, appearance });
    await until(() => c.roster.characters.length, 'character created');
  }
  c.send({ type:'selectCharacter', characterId:c.roster.characters[0].id });
  await until(() => c.player(), 'character entered'); return c;
}
async function processed(c, message) {
  offset += 500;
  const id = c.messages.length;
  c.send(message); c.send({ type:'ping', id });
  const pong = await until(() => c.messages.find(m => m.type === 'pong' && m.id === id), `${message.type} processed`);
  await until(() => c.messages.slice(c.messages.indexOf(pong) + 1).some(m => m.type === 'snapshot'), `${message.type} fresh snapshot`);
}
async function stop() {
  for(const c of clients) if(c.socket.readyState===WebSocket.OPEN) c.socket.close();
  await Promise.all(clients.filter(c=>c.socket.readyState!==WebSocket.CLOSED).map(c=>new Promise(resolve=>c.socket.once('close',resolve))));
  if(game) { await game.stop(); game=null; }
}
try {
  await start(); let client=await connect(); const token=client.token;
  await stop();
  const savePath=join(dataDir,'players.json'), records=migrateRecords(JSON.parse(readFileSync(savePath,'utf8')));
  const [account]=Object.values(records), saved=account.characters[0];
  saved.onboarding={version:1,looted:true,bagViewed:true,gearViewed:true,completed:true};
  const expected=structuredClone(records), original=structuredClone(saved);
  // Old Atlas saves contain a separate map position; the canonical coordinates
  // are already the character's overworld return, including their facing.
  const legacyLocation={mapId:'lanternreach',x:77.5,z:52.5,rotation:1.25};
  saved.atlasLocation=legacyLocation;
  const migrated=migrateRecords(structuredClone(records)); validateRecords(migrated);
  assert.deepEqual(migrated,expected,'retiring Atlas deletes only its saved location, preserving every other character/account field');
  for(const obsolete of [null,{mapId:'removed-map',x:NaN,z:0,rotation:0}]) {
    const malformed=structuredClone(records); Object.values(malformed)[0].characters[0].atlasLocation=obsolete;
    assert.deepEqual(migrateRecords(malformed),expected,'obsolete Atlas data never replaces the validated return');
  }
  const invalidReturn=structuredClone(records); Object.values(invalidReturn)[0].characters[0].zone='invalid-zone';
  assert.throws(()=>validateRecords(migrateRecords(invalidReturn)),/Invalid player save/,'migration does not bypass overworld return validation');
  writeFileSync(savePath,JSON.stringify(records));
  const position=p=>({x:p.x,z:p.z,rotation:p.rotation,zone:p.zone,instanceId:p.instanceId});
  const expectedPosition={x:original.x,z:original.z,rotation:original.rotation,zone:original.zone,instanceId:null};
  await start(); client=await connect(token);
  assert.deepEqual(position(client.player()),expectedPosition,'legacy Atlas character resumes at their saved overworld return');
  assert.equal(client.player().atlasLocation,undefined);
  for(const message of [{type:'atlas',action:'enter'},{type:'atlas',action:'enter',mapId:'lanternreach'},{type:'atlas',action:'leave'},{type:'interact',targetId:'atlas-door:0'},
    {type:'move',x:77.5,z:52.5,rotation:0,instanceId:'atlas:lanternreach'}]) {
    await processed(client,message);
    assert.deepEqual(position(client.player()),expectedPosition,'old or forged Atlas packets cannot enter or move to an Atlas instance');
  }
  assert(client.messages.some(m=>m.type==='event'&&m.text==='Unknown action.'),'retired Atlas entry is rejected by the normal unknown-action path');
  await stop();
  const persisted=JSON.parse(readFileSync(savePath,'utf8')), standing=Object.values(persisted)[0].characters[0].standingPosition;
  // Login revalidates the Rapier floor; permit only sub-millimetre height rounding.
  assert(Math.abs(standing.y-original.standingPosition.y)<.001,'the returned character stays on the saved floor');
  Object.values(expected)[0].characters[0].standingPosition.y=standing.y;
  assert.deepEqual(persisted,expected,'the return and unrelated progress persist with only Atlas location removed');
  await start(); client=await connect(token);
  assert.deepEqual(position(client.player()),expectedPosition,'a second restart stays in the overworld');
  console.log('Retired Atlas server check passed: old entry/door/movement packets rejected, validated overworld return restored, exact unrelated data preserved, migration durable across restart.');
} finally { await stop(); Date.now=realNow; rmSync(dataDir,{recursive:true,force:true}); }
