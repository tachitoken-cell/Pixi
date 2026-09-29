import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { WebSocket } from 'ws';
import pg from 'pg';
import { createGameServer } from '../server.mjs';
import { createAuctionChain } from '../src/auction-chain.mjs';
import { createStoreChain } from '../src/store-chain.mjs';
import { COMMUNITY_VERSION, objectionableText } from '../src/community.ts';

const suffix = randomUUID().replaceAll('-', ''), schema = `community_${suffix}`, directory = mkdtempSync(join(tmpdir(), 'mossvale-community-'));
const clients = [], games = [];
let container, admin, dbUrl, issuer, identity, clock = 0;
const realNow = Date.now; Date.now = () => realNow() + clock;
const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(publicKey), kid: 'community-fixture', use: 'sig', alg: 'RS256' };
const appearance = { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' };
const until = async (fn, label) => { for (let i = 0; i < 400; i++) { const value = fn(); if (value) return value; await delay(15); } throw Error(`Timed out: ${label}`); };
async function connect(realm, sub, gm = false) {
  const accessToken = await new SignJWT({ iss: issuer, sub, azp: 'mossvale-browser', typ: 'Bearer', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600, ...(gm ? { realm_access: { roles: ['gm'] } } : {}) }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).sign(privateKey);
  const socket = new WebSocket(`ws://127.0.0.1:${realm.port}/socket`), c = { socket, messages: [], closed: null };
  clients.push(c); c.send = message => socket.send(JSON.stringify(['join','createCharacter','selectCharacter'].includes(message.type)?{...message,realmId:realm.realmId}:message));
  socket.on('message', raw => { const m = JSON.parse(raw); c.messages.push(m); if (m.type === 'roster') c.roster=m; if (m.type==='welcome') c.player=m.player; }); socket.on('close', code => c.closed=code);
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);}); c.send({type:'join',accessToken}); await until(()=>c.roster||c.closed,'join'); return c;
}
async function request(c, message, type = 'reportResult') { const start=c.messages.length; c.send(message); return until(()=>c.messages.slice(start).find(m=>m.type===type),message.type); }
async function make(realm, sub, gm = false) {
  const c=await connect(realm,sub,gm); await request(c,{type:'acceptCommunityRules',version:COMMUNITY_VERSION},'community');
  if(!c.roster.characters.length) await request(c,{type:'createCharacter',name:sub,appearance},'roster');
  c.send({type:'selectCharacter',characterId:c.roster.characters[0].id});await until(()=>c.player,'character');return c;
}
const report = (c,target,messageId) => request(c,{type:'playerReport',targetId:target.player.id,reason:'Harassment or threats',details:'Please review this behavior.\nQuoted text: <example>',...(messageId?{messageId}:{})});
const review = (gm,id,decision='ban')=>request(gm,{type:'reviewReport',reportId:id,decision,reason:'Reviewed violation of community rules.'});
try {
  assert(objectionableText('fuck you'));assert(objectionableText('k1ll yourself'));assert(!objectionableText('Meet near the class trainer.'));
  container=`mossvale-community-${suffix}`;
  execFileSync('docker',['run','--detach','--rm','--name',container,'--env','POSTGRES_PASSWORD=isolated-test-only','--publish','127.0.0.1::5432','postgres:17-bookworm'],{stdio:'pipe'});
  const address=execFileSync('docker',['port',container,'5432/tcp'],{encoding:'utf8'}).trim();
  const url=new URL(`postgresql://postgres:isolated-test-only@${address}/postgres`);
  for(let i=0;;i++){admin=new pg.Client({connectionString:url.href});try{await admin.connect();break;}catch(e){await admin.end();if(i>100)throw e;await delay(100);}}
  await admin.query(`CREATE SCHEMA ${schema}`);url.searchParams.set('options',`-c search_path=${schema}`);dbUrl=url.href;
  identity=createServer((req,res)=>{if(req.url!=='/realms/mossvale/protocol/openid-connect/certs'){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({keys:[jwk]}));});
  await new Promise(resolve=>identity.listen(0,'127.0.0.1',resolve));issuer=`http://127.0.0.1:${identity.address().port}/realms/mossvale`;
  for(const realmId of ['eu','us']) {
    const noRpc=()=>{throw Error('A local moderation test must not call a chain.');};
    const game=createGameServer({port:0,host:'127.0.0.1',dataDir:join(directory,realmId),databaseUrl:dbUrl,databaseCaBase64:'',realmId,realmEuOrigin:'',realmUsOrigin:'',gameAllowedOrigins:'',keycloakAccountIssuer:issuer,keycloak:{url:issuer.replace('/realms/mossvale',''),realm:'mossvale',clientId:'mossvale-browser'},walletOidc:{env:{}},auctionChain:createAuctionChain({contract:'',authorityKey:'',rpc:noRpc}),mossAuctionChain:createAuctionChain({currency:'moss',contract:'',authorityKey:'',rpc:noRpc}),storeChain:createStoreChain({contract:'',authorityKey:'',legacyContract:'',rpc:noRpc})});
    games.push({game,realmId,port:await game.start()});
  }
  const [eu,us]=games, gm=await make(eu,'Steward',true), sender=await make(us,'Reporter'), offender=await make(us,'Offender');
  const fresh=await connect(eu,'Newcomer');
  const denied=await request(fresh,{type:'createCharacter',name:'Unaccepted',appearance},'event');assert.match(denied.text,/community rules/);
  await request(fresh,{type:'acceptCommunityRules',version:COMMUNITY_VERSION},'community');clock+=1000;
  const badName=await request(fresh,{type:'createCharacter',name:'fuck',appearance},'event');assert.match(badName.text,/name.*community rules/);
  const noInbox=await request(sender,{type:'reportsList'});assert.equal(noInbox.success,false);
  const start=sender.messages.length;offender.send({type:'chat',text:'A message for review.'});
  const chat=await until(()=>sender.messages.slice(start).find(m=>m.kind==='chat'&&m.playerId===offender.player.id),'world chat');assert(chat.messageId);
  const forged=await report(sender,offender,randomUUID());assert.equal(forged.success,false);
  assert.equal((await report(sender,offender,chat.messageId)).success,true);
  assert.equal((await report(sender,offender,chat.messageId)).success,false,'durable rate limit');
  let list=await request(gm,{type:'reportsList'},'reports');assert.equal(list.reports.length,1);assert.equal(list.reports[0].evidence.text,'A message for review.');assert.equal(list.reports[0].details,'Please review this behavior.\nQuoted text: <example>');assert(!JSON.stringify(list).includes('targetAccount'));
  const id=list.reports[0].id;offender.socket.close();await until(()=>offender.closed,'offline offender');await delay(150);
  await admin.query(`ALTER TABLE ${schema}.mossvale_reports ADD CONSTRAINT review_failure CHECK (report->>'status' <> 'banned')`);
  assert.equal((await review(gm,id)).success,false,'failed report resolution rolls back the ban');
  const rollback=await admin.query(`SELECT p.state FROM ${schema}.mossvale_players p JOIN ${schema}.mossvale_reports r ON p.account_key=r.report->>'targetAccount' WHERE r.id=$1`,[id]);assert.equal(rollback.rows[0].state.ban,undefined);
  await admin.query(`ALTER TABLE ${schema}.mossvale_reports DROP CONSTRAINT review_failure`);
  assert.equal((await review(gm,id)).success,true,'offline account ban');
  const banned=await connect(us,'Offender');assert.equal(banned.closed,4409);
  assert.equal((await review(gm,id)).success,false,'review is single-use');
  clock+=61000;
  const active=await make(us,'ActiveOffender');assert.equal((await report(sender,active)).success,true);
  list=await request(gm,{type:'reportsList'},'reports');assert.equal((await review(gm,list.reports[0].id)).success,true);
  await until(()=>active.closed===4409,'cross-realm active account disconnected');
  await delay(1100);const again=await connect(us,'ActiveOffender');assert.equal(again.closed,4409,'owning autosave cannot undo remote ban');
  clock+=61000;
  const protectedGm=await make(us,'OtherSteward',true);assert.equal((await report(sender,protectedGm)).success,true);
  list=await request(gm,{type:'reportsList'},'reports');protectedGm.socket.close();await until(()=>protectedGm.closed,'offline GM');
  assert.equal((await review(gm,list.reports[0].id)).success,false,'offline verified GM protected');
  assert.equal((await review(gm,list.reports[0].id,'dismiss')).success,true);
  const rows=await admin.query(`SELECT report FROM ${schema}.mossvale_reports`);assert.equal(rows.rows.length,3);assert.equal(rows.rows.filter(row=>row.report.status==='banned').length,2);
  const leaked=sender.messages.slice(start).filter(m=>m.type==='reports');assert.equal(leaked.length,0);
  const recipient=await make(us,'Recipient');
  for(const type of ['chat','partyChat','whisper']) { clock+=1000;const chatStart=sender.messages.length,received=recipient.messages.length;sender.send({type,text:'fuck you',...(type==='whisper'?{targetId:recipient.player.id}:{})});const filtered=await until(()=>sender.messages.slice(chatStart).find(m=>m.kind==='info'),'filtered '+type);assert.match(filtered.text,/community rules/);assert(!recipient.messages.slice(received).some(m=>m.kind==='chat'||m.type==='whisper')); }
  console.log('PASS community server: explicit rules, new-name/all-chat filtering, authenticated evidence, durable rate limit and inbox, atomic rollback, offline ban, cross-realm disconnect, stale-autosave protection, repeated-review rejection, offline GM protection.');
} finally {
  for(const c of clients)c.socket.terminate();
  for(const {game} of games)await game.stop();
  if(identity)await new Promise(resolve=>identity.close(resolve));
  if(admin){await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(()=>{});await admin.end();}
  if(container)try{execFileSync('docker',['rm','-f',container],{stdio:'pipe'});}catch{}
  Date.now=realNow;rmSync(directory,{recursive:true,force:true});
}
