import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { WebSocket } from 'ws';
import pg from 'pg';
import { createGameServer } from '../server.mjs';
import { createAuctionChain } from '../src/auction-chain.mjs';
import { createStoreChain } from '../src/store-chain.mjs';
import { COMMUNITY_VERSION } from '../src/community.ts';
import { createAccountDeletionProvider } from '../src/account-deletion-provider.mjs';
import { createPlayerStore } from '../src/player-store.mjs';
import { playerDeletions } from '../src/player-deletions.mjs';
import { createPublicStats } from '../src/public-stats.mjs';
import { createHash } from 'node:crypto';
import { validateMobileReceipt } from '../src/mobile-purchase-verifier.mjs';

// Check the notification refresh through the real store and PostgreSQL protocol.
async function checkDeletionRefresh() {
  const keys = Array.from({ length: 40 }, (_, index) => index.toString(16).padStart(64, '0'));
  const store = createPlayerStore({ connectionString: dbUrl }); stores.push(store); await store.start();
  await admin.query(`INSERT INTO ${schema}.mossvale_players(account_key,state) SELECT key,'{"characters":[]}'::jsonb FROM unnest($1::text[]) key`, [keys.filter(key => key !== keys[1])]);
  await admin.query(`INSERT INTO ${schema}.mossvale_account_deletions(account_key,status,requested_at,completed_at) VALUES($1,'pending',100,NULL),($2,'complete',100,200)`, keys.slice(0,2));
  let checks = 0; const query = pg.Client.prototype.query, loaded = new Map(), removed = [];
  pg.Client.prototype.query = function(...args) { checks++; return query.apply(this,args); };
  try {
    const context = createContext({ database: store,
      closing: false, sharedChanges: new Map(keys.map(key => [key, 1])), flush: Promise.resolve(), records: {}, committingAccounts: new Map(),
      migrateRecords: value => value, validateRecords() {}, applyStoredRow: row => loaded.set(row.account_key,row.state), clearDeletedAccount: key => removed.push(key) });
    const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
    runInContext(source.slice(source.indexOf('  let refreshingRecords'), source.indexOf('  function stagedPlayerChanges(')), context);
    await context.refreshRecords(true);
    assert.equal(checks, 1, 'forty changed accounts share one SQL round trip for fences and rows');
    assert.equal(loaded.size,39); assert.deepEqual(removed,[keys[1]],'missing player rows are cleared without losing their deletion fence');
    assert(store.isDeleting(keys[0]) && store.isDeleting(keys[1]), 'pending and completed deletions remain fenced');
    assert(keys.slice(2).every(key => !store.isDeleting(key)), 'unrelated accounts remain available');
    await context.refreshRecords(true); assert.equal(checks, 1, 'an unchanged refresh sends no queries');
    assert.deepEqual(await store.read([],true),[]); await assert.rejects(store.read(["'; DROP TABLE mossvale_players; --"],true),/Invalid player read keys/);
    assert.equal(checks,1,'empty and invalid refresh keys never reach SQL');
    assert.equal((await store.read(undefined,true)).length,39);assert.equal(checks,2,'full refresh also batches fences and rows');
    assert.deepEqual(await store.deletionStatus(keys[0]), { status: 'pending', requestedAt: 100 });
    assert.deepEqual(await store.deletionStatus(keys[1]), { status: 'complete', requestedAt: 100, completedAt: 200 });
    assert.deepEqual(await store.deletionStatus(keys[2]), { status: 'none' });
    await admin.query(`DELETE FROM ${schema}.mossvale_account_deletions WHERE account_key=ANY($1::text[])`,[keys]);
    await store.read(keys,true);
    assert(store.isDeleting(keys[0]) && store.isDeleting(keys[1]), 'later refreshes never remove an existing deletion fence');
    console.log('PASS deletion refresh: forty accounts use one SQL round trip; pending/completed/missing-row fences, full/empty reads and key validation remain intact.');
  } finally { pg.Client.prototype.query=query; await store.close(); }
  await admin.query(`DELETE FROM ${schema}.mossvale_players WHERE account_key=ANY($1::text[])`,[keys]);
}

const suffix = randomUUID().replaceAll('-', ''), schema = `deletion_${suffix}`, directory = mkdtempSync(join(tmpdir(), 'mossvale-community-'));
const clients = [], games = [], stores = [];
let container, admin, dbUrl, issuer, identity, privacyStats, clock = 0, providerFails = false;
const identityUsers = new Set(), removedUsers = [], providerCalls = [], nativeReceipts = new Map(), nativeEvents = new Map();
const keyFor = sub => createHash('sha256').update(`${issuer}\n${sub}`).digest('hex');
const realNow = Date.now; Date.now = () => realNow() + clock;
const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(publicKey), kid: 'community-fixture', use: 'sig', alg: 'RS256' };
const appearance = { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' };
const until = async (fn, label) => { for (let i = 0; i < 400; i++) { const value = await fn(); if (value) return value; await delay(15); } throw Error(`Timed out: ${label}`); };
async function connect(realm, sub, gm = false, authAge = 0) {
  const accessToken = await new SignJWT({ auth_time: Math.floor(Date.now()/1000)-authAge, iss: issuer, sub, azp: 'mossvale-browser', typ: 'Bearer', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600, ...(gm ? { realm_access: { roles: ['gm'] } } : {}) }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).sign(privateKey);
  const socket = new WebSocket(`ws://127.0.0.1:${realm.port}/socket`), c = { socket, accessToken, messages: [], closed: null };
  clients.push(c); c.send = message => socket.send(JSON.stringify(['join','createCharacter','selectCharacter'].includes(message.type)?{...message,realmId:realm.realmId}:message));
  socket.on('message', raw => { const m = JSON.parse(raw); c.messages.push(m); if (m.type === 'roster') c.roster=m; if (m.type==='welcome') c.player=m.player; }); socket.on('close', code => c.closed=code);
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);}); c.send({type:'join',accessToken}); await until(()=>c.roster||c.closed,'join'); return c;
}
async function request(c, message, type = 'reportResult') { const start=c.messages.length; c.send(message); return until(()=>c.messages.slice(start).find(m=>m.type===type),message.type); }
async function make(realm, sub, gm = false) {
  identityUsers.add(sub);const c=await connect(realm,sub,gm); await request(c,{type:'acceptCommunityRules',version:COMMUNITY_VERSION},'community');
  if(!c.roster.characters.length) await request(c,{type:'createCharacter',name:sub,appearance},'roster');
  c.send({type:'selectCharacter',characterId:c.roster.characters[0].id});await until(()=>c.player,'character');return c;
}
const report = (c,target,messageId) => request(c,{type:'playerReport',targetId:target.player.id,reason:'Harassment or threats',details:'Please review this behavior.\nQuoted text: <example>',...(messageId?{messageId}:{})});
// Provider signatures are covered by check-mobile-refunds; this adapter exposes
// only preverified local fixture events, while using the real receipt validator.
const mobilePurchaseVerifier = {
  status: () => ({ apple: true, google: false }),
  async verify(input, intent) {
    const data = nativeReceipts.get(input.transactionId);assert(data, 'only local receipt fixtures are accepted');
    return validateMobileReceipt(data, { ...input, createdAt: intent.createdAt }, 'apple', false, Date.now(), true);
  },
  async notification(platform, body, authorization) {
    assert.equal(platform, 'apple');assert.equal(authorization, 'Bearer local-notification-fixture');assert(nativeEvents.has(body.eventId));
    return structuredClone(nativeEvents.get(body.eventId));
  },
};
const nativeRequest = async (realm, client, route, body) => {
  const response = await fetch(`http://127.0.0.1:${realm.port}/api/mobile-purchases/${route}`, {method:'POST',headers:{Authorization:`Bearer ${client.accessToken}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
};
async function checkout(realm, client, productId) {
  const response=await nativeRequest(realm,client,'intents',{characterId:client.player.id,productId,platform:'apple'});
  assert.equal(response.status,200,JSON.stringify(response));return response.body;
}
function nativeProof(intent) {
  const transactionId=String(7000000000+nativeReceipts.size);
  nativeReceipts.set(transactionId,{bundleId:'world.mossvale.game',transactionId,type:'Consumable',quantity:1,inAppOwnershipType:'PURCHASED',environment:'Production',appAccountToken:intent.intentId,productId:intent.productId,purchaseDate:Date.now()});
  return {platform:'apple',intentId:intent.intentId,productId:intent.productId,transactionId};
}
async function notifyNative(realm, proof, kind) {
  const data=nativeReceipts.get(proof.transactionId);if(kind==='refund')data.revocationDate=Date.now();
  const receipt=validateMobileReceipt(data,proof,'apple',false,Date.now(),true),eventId=`deletion-${kind}-${proof.transactionId}`;
  nativeEvents.set(eventId,{...receipt,eventId,kind,at:Date.now()});
  const response=await fetch(`http://127.0.0.1:${realm.port}/api/mobile-purchases/apple-notifications`,{method:'POST',headers:{Authorization:'Bearer local-notification-fixture','Content-Type':'application/json'},body:JSON.stringify({eventId})});
  assert.equal(response.status,204,'provider event is acknowledged only after durable storage');return eventId;
}
try {
  container=`mossvale-community-${suffix}`;
  execFileSync('docker',['run','--detach','--rm','--name',container,'--env','POSTGRES_PASSWORD=isolated-test-only','--publish','127.0.0.1::5432','postgres:17-bookworm'],{stdio:'pipe'});
  const address=execFileSync('docker',['port',container,'5432/tcp'],{encoding:'utf8'}).trim();
  const url=new URL(`postgresql://postgres:isolated-test-only@${address}/postgres`);
  for(let i=0;;i++){admin=new pg.Client({connectionString:url.href});try{await admin.connect();break;}catch(e){await admin.end();if(i>100)throw e;await delay(100);}}
  await admin.query(`CREATE SCHEMA ${schema}`);url.searchParams.set('options',`-c search_path=${schema}`);dbUrl=url.href;
  await checkDeletionRefresh();
  identity=createServer(async(req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/realms/mossvale/protocol/openid-connect/certs'){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({keys:[jwk]}));return;}
    if(path==='/realms/mossvale/protocol/openid-connect/token'){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({access_token:'local-admin-token',expires_in:300}));return;}
    providerCalls.push([req.method,path]);
    if(providerFails){res.writeHead(503).end();return;}
    if(req.headers.authorization!=='Bearer local-admin-token'){res.writeHead(401).end();return;}
    if(path==='/admin/realms/mossvale/users/count'){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(identityUsers.size));return;}
    const match=path.match(/^\/admin\/realms\/mossvale\/users\/([^/]+)(\/logout)?$/),sub=match&&decodeURIComponent(match[1]);
    if(!match||!identityUsers.has(sub)){res.writeHead(404).end();return;}
    if(req.method==='POST'&&match[2]){res.writeHead(204).end();return;}
    if(req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({id:sub}));return;}
    if(req.method==='DELETE'){identityUsers.delete(sub);removedUsers.push(sub);res.writeHead(204).end();return;}
    res.writeHead(405).end();
  });
  await new Promise(resolve=>identity.listen(0,'127.0.0.1',resolve));issuer=`http://127.0.0.1:${identity.address().port}/realms/mossvale`;
  for(const realmId of ['eu','us']) {
    const noRpc=()=>{throw Error('A local moderation test must not call a chain.');};
    const game=createGameServer({port:0,host:'127.0.0.1',dataDir:join(directory,realmId),databaseUrl:dbUrl,databaseCaBase64:'',realmId,realmEuOrigin:'',realmUsOrigin:'',gameAllowedOrigins:'',keycloakAccountIssuer:issuer,keycloak:{url:issuer.replace('/realms/mossvale',''),realm:'mossvale',clientId:'mossvale-browser'},accountDeletionProvider:createAccountDeletionProvider({keycloak:{url:issuer.replace('/realms/mossvale',''),realm:'mossvale'},env:{KEYCLOAK_DELETE_CLIENT_ID:'deletion-fixture',KEYCLOAK_DELETE_CLIENT_SECRET:'isolated-test-only'}}),mobilePurchaseVerifier,walletOidc:{env:{}},auctionChain:createAuctionChain({contract:'',authorityKey:'',rpc:noRpc}),mossAuctionChain:createAuctionChain({currency:'moss',contract:'',authorityKey:'',rpc:noRpc}),storeChain:createStoreChain({contract:'',authorityKey:'',legacyContract:'',rpc:noRpc})});
    games.push({game,realmId,port:await game.start()});
  }
  const [eu,us]=games, departing=await make(us,'Departing'), observer=await make(eu,'Observer'), reporter=await make(us,'Reporter');
  const api=async(realm,c,method='GET',body,extra={})=>{const response=await fetch(`http://127.0.0.1:${realm.port}/api/account/deletion`,{method,headers:{Authorization:`Bearer ${c.accessToken}`,...(body?{'Content-Type':'application/json'}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,body:await response.json()};};
  assert.deepEqual((await api(eu,departing)).body,{available:true,status:'none',freshAuthRequired:false});
  assert.equal((await api(eu,{accessToken:'forged'})).status,401);
  assert.equal((await api(eu,departing,'POST',{confirmation:'DELETE ACCOUNT',accountKey:keyFor('Observer')})).status,400);
  assert.equal((await api(eu,departing,'POST',{confirmation:'I confirm'})).status,400);
  const stale=await connect(eu,'Stale',false,301);assert.equal((await api(eu,stale,'POST',{confirmation:'DELETE ACCOUNT'})).body.code,'FRESH_AUTH_REQUIRED');
  const cors=await fetch(`http://127.0.0.1:${eu.port}/api/account/deletion`,{method:'OPTIONS',headers:{Origin:'https://account.mossvale.world','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'Authorization, Content-Type'}});assert.equal(cors.status,204);
  assert.equal((await fetch(`http://127.0.0.1:${eu.port}/api/account/deletion`,{headers:{Origin:'https://evil.example'}})).status,403);
  const start=reporter.messages.length;departing.send({type:'chat',text:'A message to remove.'});const chat=await until(()=>reporter.messages.slice(start).find(m=>m.kind==='chat'),'chat');
  assert.equal((await report(reporter,departing,chat.messageId)).success,true);
  // Prepare real durable checkouts and one granted charge. Two other checkouts
  // are paid later: one through the provider inbox, one via the old signed JWT.
  const key=keyFor('Departing'),otherKey=keyFor('Observer');
  const paidProof=nativeProof(await checkout(us,departing,'store-damage'));
  assert.equal((await nativeRequest(us,departing,'verify',paidProof)).status,200);
  const lateCheckout=await checkout(us,departing,'store-defense'),lateProof=nativeProof(lateCheckout),intentId=lateCheckout.intentId;
  const queuedProof=nativeProof(await checkout(us,departing,'store-combat-xp'));
  const healthyProof=nativeProof(await checkout(eu,observer,'store-damage'));
  assert.equal((await nativeRequest(eu,observer,'verify',healthyProof)).status,200);
  departing.socket.close();await until(()=>departing.closed,'offline before seed');await delay(200);
  const saved=(await admin.query(`SELECT state FROM ${schema}.mossvale_players WHERE account_key=$1`,[key])).rows[0].state;
  const p=saved.characters[0],order=p.mobileStoreOrders.find(order=>order.id===intentId);assert(order);
  assert.equal(p.storeConsumables.damage,1,'account deletion includes a granted native reward');
  await admin.query(`UPDATE ${schema}.mossvale_players SET state=jsonb_set(state,'{characters,0,friendIds}',$2::jsonb) WHERE account_key=$1`,[otherKey,JSON.stringify([p.id])]);
  const resumed=await make(us,'Departing');providerFails=true;
  const statsSalt=(await admin.query(`SELECT value->>'salt' AS salt FROM ${schema}.mossvale_stats_meta WHERE name='tracking'`)).rows[0].salt;
  const countryToken=createHmac('sha256',statsSalt).update(`country:${key}`).digest('hex');
  await until(async()=>(await admin.query(`SELECT 1 FROM ${schema}.mossvale_stats_countries WHERE token=$1`,[countryToken])).rows.length,'real session country record');
  await admin.query(`CREATE FUNCTION ${schema}.fail_country_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture country cleanup failure'; END; $$;
    CREATE TRIGGER country_cleanup_failure BEFORE DELETE ON ${schema}.mossvale_stats_countries FOR EACH ROW EXECUTE FUNCTION ${schema}.fail_country_cleanup()`);
  privacyStats=createPublicStats({connectionString:dbUrl,realmId:'asia',accounts:()=>[],automatic:false});
  const accepted=await api(eu,resumed,'POST',{confirmation:'DELETE ACCOUNT'});assert.equal(accepted.status,202);assert.equal(accepted.body.status,'pending');
  await assert.rejects(privacyStats.pulse(),{code:'P0001'});
  await until(()=>resumed.closed===4410,'remote realm session closed');
  const fenced=await connect(us,'Departing');assert.equal(fenced.closed,4410,'stale JWT cannot enter while pending');
  await until(()=>providerCalls.length,'provider attempted');assert(identityUsers.has('Departing'));assert.equal((await api(eu,resumed)).body.status,'pending');
  assert.equal((await admin.query(`SELECT count(*) FROM ${schema}.mossvale_players WHERE account_key=$1`,[key])).rows[0].count,'1','provider failure retains game data for retry');
  assert.equal((await api(eu,resumed,'POST',{confirmation:'DELETE ACCOUNT'})).status,202,'repeat request is idempotent');
  const queuedEvent=await notifyNative(eu,queuedProof,'payment');
  const healthyEvent=await notifyNative(eu,healthyProof,'refund');
  await until(async()=>!!(await admin.query(`SELECT applied_at FROM ${schema}.mossvale_mobile_events WHERE event_id=$1`,[healthyEvent])).rows[0]?.applied_at,'healthy refund proceeds behind pending deletion');
  assert.equal((await admin.query(`SELECT status FROM ${schema}.mossvale_mobile_receipts WHERE payment_id=$1`,[healthyProof.transactionId])).rows[0].status,'refunded');
  assert.equal((await admin.query(`SELECT applied_at FROM ${schema}.mossvale_mobile_events WHERE event_id=$1`,[queuedEvent])).rows[0].applied_at,null,'fenced account event stays pending for post-purge recovery');
  assert.equal((await api(eu,resumed)).body.status,'pending','provider outage still holds the first account pending');
  providerFails=false;clock+=11000;
  for(let i=0;i<400;i++){if((await api(eu,resumed)).body.status==='complete')break;await delay(15);if(i===399)throw Error('Deletion did not complete');}
  assert(!identityUsers.has('Departing'));assert.deepEqual(removedUsers,['Departing']);
  const idempotentProvider=createAccountDeletionProvider({keycloak:{url:issuer.replace('/realms/mossvale',''),realm:'mossvale'},env:{KEYCLOAK_DELETE_CLIENT_ID:'deletion-fixture',KEYCLOAK_DELETE_CLIENT_SECRET:'isolated-test-only'}});
  await idempotentProvider.deleteUser('Departing');assert.deepEqual(removedUsers,['Departing'],'a retried provider operation confirms an already absent user');
  assert.equal((await admin.query(`SELECT count(*) FROM ${schema}.mossvale_players WHERE account_key=$1`,[key])).rows[0].count,'0');
  const retained=(await admin.query(`SELECT subject,status FROM ${schema}.mossvale_account_deletions WHERE account_key=$1`,[key])).rows[0];assert.deepEqual(retained,{subject:null,status:'complete'});
  await assert.rejects(privacyStats.pulse(),{code:'P0001'});
  assert.equal((await admin.query(`SELECT count(*) FROM ${schema}.mossvale_stats_countries WHERE token=$1`,[countryToken])).rows[0].count,'1','account deletion completes while country cleanup is failing');
  await admin.query(`DROP TRIGGER country_cleanup_failure ON ${schema}.mossvale_stats_countries`);
  await privacyStats.pulse();
  assert.equal((await admin.query(`SELECT count(*) FROM ${schema}.mossvale_stats_countries WHERE token=$1`,[countryToken])).rows[0].count,'0','country cleanup recovers from the durable completed fence');
  assert.equal((await admin.query(`SELECT count(*) FROM ${schema}.mossvale_reports`)).rows[0].count,'0');
  assert.equal((await admin.query(`SELECT count(*) FROM ${schema}.mossvale_mobile_receipts WHERE payment_id=$1`,[paidProof.transactionId])).rows[0].count,'1');
  assert.equal((await admin.query(`SELECT order_data FROM ${schema}.mossvale_mobile_intents WHERE intent_id=$1`,[intentId])).rows[0].order_data.id,intentId);
  assert.deepEqual((await admin.query(`SELECT state FROM ${schema}.mossvale_players WHERE account_key=$1`,[otherKey])).rows[0].state.characters[0].friendIds,[]);
  await until(()=>reporter.messages.some(m=>m.type==='communityErase'&&m.playerIds.includes(p.id)),'remote erase event');
  const rejected=await connect(eu,'Departing');assert.equal(rejected.closed,4410);
  const reopened=createPlayerStore({connectionString:dbUrl});await reopened.start();await assert.rejects(reopened.claim(key),e=>e.code==='ACCOUNT_DELETING');await reopened.close();
  assert.equal((await api(eu,resumed,'POST',{confirmation:'DELETE ACCOUNT'})).body.status,'complete');
  await until(async()=>(await admin.query(`SELECT status FROM ${schema}.mossvale_mobile_receipts WHERE payment_id=$1`,[queuedProof.transactionId])).rows[0]?.status==='payment-confirmed','queued payment archives after full-account purge');
  assert.equal((await nativeRequest(eu,resumed,'verify',lateProof)).body.code,'PURCHASE_RECOVERY_REQUIRED','still-valid JWT can record a late payment only as an archived obligation');
  assert.equal((await nativeRequest(us,resumed,'verify',lateProof)).body.code,'PURCHASE_RECOVERY_REQUIRED','replay from other realm does not grant or duplicate receipt');
  assert.equal((await admin.query(`SELECT count(*) FROM ${schema}.mossvale_mobile_receipts WHERE intent_id=$1`,[intentId])).rows[0].count,'1');
  assert.equal((await admin.query(`SELECT status FROM ${schema}.mossvale_mobile_receipts WHERE intent_id=$1`,[intentId])).rows[0].status,'payment-confirmed');
  assert.equal((await nativeRequest(eu,resumed,'intents',{characterId:p.id,productId:'store-defense',platform:'apple'})).status,403,'deleted identity cannot create another checkout');
  assert.equal((await nativeRequest(eu,resumed,'abandon',{intentId})).status,403,'deleted identity cannot mutate the original checkout');
  await notifyNative(eu,lateProof,'refund');
  await until(async()=>(await admin.query(`SELECT status FROM ${schema}.mossvale_mobile_receipts WHERE intent_id=$1`,[intentId])).rows[0]?.status==='refunded','refund updates deleted account financial history');
  assert.equal((await nativeRequest(us,resumed,'verify',lateProof)).body.code,'PURCHASE_REFUNDED');
  const finalArchive=(await admin.query(`SELECT order_data FROM ${schema}.mossvale_mobile_intents WHERE intent_id=$1`,[intentId])).rows[0].order_data;
  assert.equal(finalArchive.status,'refunded');assert.equal(finalArchive.reward,undefined,'late deleted-account receipt never grants a reward');
  assert.equal((await admin.query(`SELECT count(*) FROM ${schema}.mossvale_players WHERE account_key=$1`,[key])).rows[0].count,'0','neither late payment nor refund recreates the whole account');
  assert.equal((await admin.query(`SELECT state FROM ${schema}.mossvale_players WHERE account_key=$1`,[otherKey])).rows[0].state.characters[0].storeConsumables.damage,0,'healthy account refund reverses its one charge exactly once');
  for(const c of clients)c.socket.terminate();
  for(const {game} of games)await game.stop();games.length=0;
  const owner=createPlayerStore({connectionString:dbUrl}),worker=createPlayerStore({connectionString:dbUrl});stores.push(owner,worker);await owner.start();await worker.start();
  const queuedKey=keyFor('Queued'),peerKey=keyFor('Peer'),pendingIntent=randomUUID();
  const state={characters:[{id:'00000000-0000-4000-8000-000000000001',gold:10,level:1,auctions:[],friendIds:[],friendRequestIds:[],ignoreIds:[],mobileStoreOrders:[{...order,id:pendingIntent,characterId:'00000000-0000-4000-8000-000000000001'}]}]};
  const peer={characters:[{id:'00000000-0000-4000-8000-000000000002',gold:10,level:1,auctions:[],friendIds:['00000000-0000-4000-8000-000000000001'],friendRequestIds:[],ignoreIds:[]}]};
  await owner.claim(queuedKey);await worker.claim(peerKey);await owner.commit([{key:queuedKey,state}]);await worker.commit([{key:peerKey,state:peer}]);await worker.release(peerKey);
  // Reject unresolved payments before fencing, so the account can still resolve
  // them. Include a reservation stored on another account's character.
  const pending={...state,characters:[{...state.characters[0],storeOrders:[{status:'processed'}]}]};
  await owner.commit([{key:queuedKey,state:pending}]);
  await assert.rejects(worker.requestDeletion(queuedKey,'Queued',()=>true),e=>e.code==='ACCOUNT_PAYMENTS_PENDING');assert.equal((await worker.deletionStatus(queuedKey)).status,'none');assert(!worker.isDeleting(queuedKey));
  await owner.commit([{key:queuedKey,state}]);
  const wagerState=structuredClone(state);wagerState.characters[0].arenaWagers=[{order:{matchId:'fixture-pending-arena',stakeWei:'100000000000000000000'},opponentId:peer.characters[0].id}];
  await owner.commit([{key:queuedKey,state:wagerState,expected:state}]);
  await assert.rejects(worker.requestDeletion(queuedKey,'Queued',()=>true),e=>e.code==='ACCOUNT_PAYMENTS_PENDING'&&/arena wagers/.test(e.message),'pending arena escrow prevents deletion before erecting a fence');
  assert.equal((await worker.deletionStatus(queuedKey)).status,'none');assert(!worker.isDeleting(queuedKey));
  assert.deepEqual((await worker.read([queuedKey]))[0].state.characters[0].arenaWagers,wagerState.characters[0].arenaWagers,'refused deletion preserves the terms needed to recover funds');
  await owner.commit([{key:queuedKey,state,expected:wagerState}]);
  await worker.claim(peerKey);const reserved=structuredClone(peer);reserved.characters[0].auctions=[{sellerId:'00000000-0000-4000-8000-000000000002',reservation:{buyerId:'00000000-0000-4000-8000-000000000001'}}];await worker.commit([{key:peerKey,state:reserved,expected:peer}]);
  await assert.rejects(worker.requestDeletion(queuedKey,'Queued',()=>true),e=>e.code==='ACCOUNT_PAYMENTS_PENDING');assert.equal((await worker.deletionStatus(queuedKey)).status,'none');
  await worker.commit([{key:peerKey,state:peer,expected:reserved}]);await worker.release(peerKey);
  await assert.rejects(worker.requestDeletion(queuedKey,'Queued',()=>false),e=>e.code==='FRESH_AUTH_REQUIRED');assert(!worker.isDeleting(queuedKey));
  // Hold an admitted transaction at its real SQL boundary. Deletion must wait
  // for that write, then stop explicit mutations without dropping final saves.
  let unblock,started;const gate=new Promise(resolve=>unblock=resolve),entered=new Promise(resolve=>started=resolve);
  const admittedState=structuredClone(state);admittedState.characters[0].level=2;
  const admitted=owner.commit([{key:queuedKey,state:admittedState,expected:state}],async()=>{started();await gate;});await entered;
  let acceptedQueued=false;const queued=worker.requestDeletion(queuedKey,'Queued',()=>true).then(value=>{acceptedQueued=true;return value;});
  await delay(60);assert(!acceptedQueued,'deletion waits for admitted row-lock holder');unblock();await admitted;assert.equal((await queued).status,'pending');
  assert.equal((await worker.read([queuedKey]))[0].state.characters[0].level,2);assert.equal(await worker.acquireDeletion(queuedKey),null,'remote owner lock prevents premature purge');
  await assert.rejects(owner.commit([{key:queuedKey,state:admittedState,expected:admittedState}]),e=>e.code==='ACCOUNT_DELETING');
  const finalSave=structuredClone(admittedState);finalSave.characters[0].level=3;await owner.commit([{key:queuedKey,state:finalSave}]);await owner.release(queuedKey);
  assert(await worker.acquireDeletion(queuedKey));
  await admin.query(`CREATE FUNCTION ${schema}.fail_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture deletion failure' USING ERRCODE='23514'; END; $$`);
  await admin.query(`CREATE TRIGGER deletion_failure BEFORE DELETE ON ${schema}.mossvale_players FOR EACH ROW EXECUTE FUNCTION ${schema}.fail_delete()`);
  const beforeArchive=(await admin.query(`SELECT order_data FROM ${schema}.mossvale_mobile_intents WHERE intent_id=$1`,[pendingIntent])).rows[0]?.order_data;
  await assert.rejects(worker.finishDeletion(queuedKey),e=>e.code==='23514');
  assert.equal((await worker.deletionStatus(queuedKey)).status,'pending');assert.equal((await worker.read([queuedKey]))[0].state.characters[0].level,3);
  assert.deepEqual((await worker.read([peerKey]))[0].state.characters[0].friendIds,['00000000-0000-4000-8000-000000000001'],'failed purge rolls back social erasure');
  assert.deepEqual((await admin.query(`SELECT order_data FROM ${schema}.mossvale_mobile_intents WHERE intent_id=$1`,[pendingIntent])).rows[0]?.order_data,beforeArchive,'failed purge preserves the previously archived financial history');
  await admin.query(`DROP TRIGGER deletion_failure ON ${schema}.mossvale_players`);await worker.finishDeletion(queuedKey);await worker.releaseDeletion(queuedKey);
  assert.deepEqual(await worker.read([queuedKey]),[]);assert.deepEqual((await worker.read([peerKey]))[0].state.characters[0].friendIds,[]);await assert.rejects(owner.claim(queuedKey),e=>e.code==='ACCOUNT_DELETING');
  assert.deepEqual(await worker.read([queuedKey]),[],'a rejected claim cannot recreate a purged account');
  console.log('PASS account deletion: fresh signed identity/exact confirmation/CORS, two-realm drain, provider retry, profile/social/report purge, financial preservation, stale-token/restart fence, pending-payment/arena-escrow preflight, admitted-write ordering, exclusive lock and transactional purge rollback, deleted-account late payment/refund archive and healthy-event progress behind pending deletion.');

} finally {
  for(const c of clients)c.socket.terminate();
  for(const {game} of games)await game.stop();
  await privacyStats?.stop();
  for(const store of stores)await store.close();
  if(identity)await new Promise(resolve=>identity.close(resolve));
  if(admin){await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(()=>{});await admin.end();}
  if(container)try{execFileSync('docker',['rm','-f',container],{stdio:'pipe'});}catch{}
  Date.now=realNow;rmSync(directory,{recursive:true,force:true});
}
