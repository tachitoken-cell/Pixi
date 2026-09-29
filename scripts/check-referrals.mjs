import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { createPlayerStore } from '../src/player-store.mjs';
import { migrateReferral, referralCode } from '../src/referral-store.mjs';
import { referralPlayed, referralValid, referralFeeBps, normalizeReferralCode } from '../src/referrals.ts';

const suffix = randomUUID().replaceAll('-', ''), schema = `referrals_${suffix}`, stores = [];
const key = name => createHash('sha256').update(`${schema}:${name}`).digest('hex');
const wallet = n => `0x${String(n).padStart(40, '0')}`;
const copy = value => structuredClone(value);
const account = (name, address = wallet(1)) => migrateReferral({ characters: [{ id: name, name, level: 20, gold: 100, auctionWallet: address,
  ownedPets: [], ownedMounts: [], auctions: [], auctionSales: [], friendIds: [], friendRequestIds: [], ignoreIds: [], arenaWagers: [], inventory: { wood: 1 } }] }, key(name));
const day = 86400000, at = Date.now();
const first = migrateReferral({ characters: [] }, key('first'));
assert(referralValid(first.referral)); assert(first.referral.canBind);
referralPlayed(first.referral, day * 20000 + 1, 19);
referralPlayed(first.referral, day * 20000 + 1000, 20);
assert.equal(first.referral.days.length, 1, 'Repeated activity on the same UTC date is one day.');
referralPlayed(first.referral, day * 20001 + 1, 20);
assert.equal(first.referral.days.length, 2); assert.equal(first.referral.canBind, false);
assert.deepEqual([0,1,9,10,24,25,49,50,99,100,101].map(count=>referralFeeBps(count)), [0,10,10,25,25,50,50,75,75,100,100]);
assert.deepEqual([0,1,10,25,49,50].map(count=>referralFeeBps(count,1)),[0,500,500,500,500,1000]);
assert.equal(normalizeReferralCode('  ABCDEFABCDEFABCDEFABCDEF  '), 'abcdefabcdefabcdefabcdef');
assert.equal(normalizeReferralCode('https://mossvale.world/?ref=ABCDEFABCDEFABCDEFABCDEF'), 'abcdefabcdefabcdefabcdef');
for (const value of [null, {}, 'bad-code', 'https://mossvale.world/?ref=invalid', 'javascript:abcdefabcdefabcdefabcdef', 'f'.repeat(2049)]) assert.equal(normalizeReferralCode(value), null);
assert(!account('legacy').referral.canBind, 'Existing characters cannot add retroactive referral attribution.');
let container, admin;
try {
  let connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    container = `mossvale-referrals-${suffix}`;
    execFileSync('docker', ['run','--detach','--rm','--name',container,'--env','POSTGRES_PASSWORD=isolated-test-only','--publish','127.0.0.1::5432','postgres:17-bookworm'], { stdio:'pipe' });
    connectionString = `postgresql://postgres:isolated-test-only@${execFileSync('docker',['port',container,'5432/tcp'],{encoding:'utf8'}).trim()}/postgres`;
  }
  const url = new URL(connectionString);
  assert(['localhost','127.0.0.1','[::1]'].includes(url.hostname), 'Use only disposable local PostgreSQL.');
  for (let attempt=0;;attempt++) { admin=new pg.Client({connectionString,connectionTimeoutMillis:1000}); try {await admin.connect();break;} catch(error){await admin.end();if(attempt>=100)throw error;await delay(100);} }
  await admin.query(`CREATE SCHEMA ${schema}`); url.searchParams.set('options',`-c search_path=${schema}`);
  const makeStore = () => { const store=createPlayerStore({connectionString:url.toString(), referralsEnabled:true, migrate:migrateReferral,validate:state=>assert(referralValid(state.referral))});stores.push(store);return store; };
  const eu=makeStore(),us=makeStore(); await eu.start();await us.start();
  const disabled=createPlayerStore({connectionString:url.toString(),migrate:migrateReferral,validate:state=>assert(referralValid(state.referral))});stores.push(disabled);await disabled.start();
  const legacy=account('gate-legacy');delete legacy.referral;
  await admin.query(`INSERT INTO ${schema}.mossvale_players(account_key,state)VALUES($1,$2::jsonb)`,[key('gate-legacy'),JSON.stringify(legacy)]);
  const gateState=await disabled.claim(key('gate-legacy'));assert(gateState.referral,'Disabled new realms can read the future schema in memory.');gateState.characters[0].gold++;
  await disabled.commit([{key:key('gate-legacy'),state:gateState}]);
  const rawLegacy=(await admin.query(`SELECT state FROM ${schema}.mossvale_players WHERE account_key=$1`,[key('gate-legacy')])).rows[0].state;
  assert(!Object.hasOwn(rawLegacy,'referral'),'Default-disabled writer does not introduce a field rejected by old realms.');assert.equal(rawLegacy.characters[0].gold,101);
  const durable=account('gate-existing');durable.referral.qualifiedCount=10;
  await admin.query(`INSERT INTO ${schema}.mossvale_players(account_key,state)VALUES($1,$2::jsonb)`,[key('gate-existing'),JSON.stringify(durable)]);
  const gateExisting=await disabled.claim(key('gate-existing'));gateExisting.characters[0].level++;gateExisting.referral.qualifiedCount=50;
  await disabled.commit([{key:key('gate-existing'),state:gateExisting}]);
  const rawExisting=(await admin.query(`SELECT state FROM ${schema}.mossvale_players WHERE account_key=$1`,[key('gate-existing')])).rows[0].state;
  assert.deepEqual(rawExisting.referral,durable.referral,'Disabling preserves previously durable referral metadata exactly.');assert.deepEqual(rawExisting.characters[0].ownedPets,[],'Disabled writer grants no referral rewards.');
  const doomed=account('gate-doomed');doomed.characters[0].id=randomUUID();delete doomed.referral;
  await admin.query(`INSERT INTO ${schema}.mossvale_players(account_key,state)VALUES($1,$2::jsonb)`,[key('gate-doomed'),JSON.stringify(doomed)]);
  await admin.query(`UPDATE ${schema}.mossvale_players SET state=jsonb_set(state,'{characters,0,friendIds}',$2::jsonb) WHERE account_key=$1`,[key('gate-legacy'),JSON.stringify([doomed.characters[0].id])]);
  await disabled.requestDeletion(key('gate-doomed'),'doomed-subject',()=>true);await disabled.acquireDeletion(key('gate-doomed'));await disabled.finishDeletion(key('gate-doomed'));await disabled.releaseDeletion(key('gate-doomed'));
  const afterDelete=(await admin.query(`SELECT state FROM ${schema}.mossvale_players WHERE account_key=$1`,[key('gate-legacy')])).rows[0].state;
  assert(!Object.hasOwn(afterDelete,'referral'),'Deletion friend cleanup cannot bypass the rollout gate.');assert.deepEqual(afterDelete.characters[0].friendIds,[]);
  const report={id:randomUUID(),reporterAccount:key('gate-existing'),targetAccount:key('gate-legacy'),targetId:'gate-legacy',targetName:'Legacy',reason:'Spam',details:'Fixture report',createdAt:Date.now(),status:'open'};
  await disabled.addReport(report);await disabled.reviewReport(report.id,'ban','Fixture moderation',{accountKey:key('gate-existing'),characterId:randomUUID()},()=>true);
  const reviewed=(await admin.query(`SELECT state FROM ${schema}.mossvale_players WHERE account_key=$1`,[key('gate-legacy')])).rows[0].state;
  assert(reviewed.ban);assert(!Object.hasOwn(reviewed,'referral'),'Moderation validates the migrated copy but persists only the ban.');

  // A signed reservation is a prior obligation: disabling pauses new qualification, not its frozen spend credit.
  const pausedRef=account('paused-ref',wallet(11)),pausedBuyer=account('paused-buyer',wallet(12)),pausedSeller=account('paused-seller',wallet(13));
  Object.assign(pausedBuyer.referral,{referredBy:key('paused-ref'),boundAt:at,days:[20000,20001],spentUsdCents:990});
  const pausedListing={id:randomUUID(),currency:'moss',sellerId:'paused-seller',reservation:{buyerId:'paused-buyer',referralBoundAt:at,order:{orderHash:'0x'+'2'.repeat(64),buyer:wallet(12),seller:wallet(13),referralUsdCents:10}}};pausedSeller.characters[0].auctions=[pausedListing];
  for(const [name,state] of [['paused-ref',pausedRef],['paused-buyer',pausedBuyer],['paused-seller',pausedSeller]])await admin.query(`INSERT INTO ${schema}.mossvale_players(account_key,state)VALUES($1,$2::jsonb)`,[key(name),JSON.stringify(state)]);
  await disabled.claim(key('paused-buyer'));await disabled.claim(key('paused-seller'));
  const pausedAfter=copy(pausedSeller);pausedAfter.characters[0].auctions=[];
  await disabled.commit([{key:key('paused-seller'),state:pausedAfter,expected:pausedSeller},{key:key('paused-buyer'),state:pausedBuyer,expected:pausedBuyer}],undefined,undefined,undefined,[],undefined,{buyerKey:key('paused-buyer'),sellerKey:key('paused-seller'),listingId:pausedListing.id,orderHash:pausedListing.reservation.order.orderHash});
  const pausedSaved=(await disabled.read([key('paused-buyer')]))[0].state;assert.equal(pausedSaved.referral.spentUsdCents,1000);assert.equal(pausedSaved.referral.qualified,false);
  assert.equal((await disabled.read([key('paused-ref')]))[0].state.referral.qualifiedCount,0);
  const ref=account('referrer',wallet(1));ref.referral.qualifiedCount=9;
  const seller=account('seller',wallet(2)),buyer=account('buyer',wallet(3));
  Object.assign(buyer.referral,{referredBy:key('referrer'),boundAt:at,days:[20000,20001],spentUsdCents:990});
  const listing={id:randomUUID(),currency:'moss',sellerId:'seller',reservation:{buyerId:'buyer',referralBoundAt:at,order:{orderHash:'0x'+'1'.repeat(64),buyer:wallet(3),referralUsdCents:10}}};
  seller.characters[0].auctions=[listing];
  for(const [name,state] of [['referrer',ref],['seller',seller],['buyer',buyer]])await admin.query(`INSERT INTO ${schema}.mossvale_players(account_key,state)VALUES($1,$2::jsonb)`,[key(name),JSON.stringify(state)]);
  const staleRef=await us.claim(key('referrer')),sellerBefore=await eu.claim(key('seller')),buyerBefore=await eu.claim(key('buyer'));
  const read=async(name,store=eu)=>(await store.read([key(name)]))[0].state;
  const provisional=copy(buyerBefore);provisional.characters[0].inventory.wood++;
  await eu.commit([{key:key('buyer'),state:provisional,expected:buyerBefore}]);
  assert.equal((await read('buyer')).referral.spentUsdCents,990,'Provisional inventory delivery does not count MOSS spend.');
  const sellerAfter=copy(sellerBefore);sellerAfter.characters[0].auctions=[];
  const payment={buyerKey:key('buyer'),sellerKey:key('seller'),listingId:listing.id,orderHash:listing.reservation.order.orderHash};
  await eu.commit([{key:key('seller'),state:sellerAfter,expected:sellerBefore},{key:key('buyer'),state:provisional,expected:provisional}],undefined,undefined,undefined,[],undefined,payment);
  assert.equal((await read('buyer')).referral.spentUsdCents,1000);assert((await read('buyer')).referral.qualified);
  let rewarded=await read('referrer');assert.equal(rewarded.referral.qualifiedCount,10);assert.deepEqual(rewarded.characters[0].ownedPets,['wayfinder-sprite']);
  staleRef.characters[0].gold=105;
  await us.commit([{key:key('referrer'),state:staleRef}]);
  rewarded=await read('referrer');assert.equal(rewarded.referral.qualifiedCount,10,'A different realm stale autosave cannot erase the award.');assert.equal(rewarded.characters[0].gold,105);assert.deepEqual(rewarded.characters[0].ownedPets,['wayfinder-sprite']);
  await assert.rejects(eu.commit([{key:key('seller'),state:sellerAfter,expected:sellerBefore},{key:key('buyer'),state:provisional,expected:provisional}],undefined,undefined,undefined,[],undefined,payment));
  assert.equal((await read('referrer')).referral.qualifiedCount,10,'Replayed finalized fulfillment cannot award twice.');
  const reused=account('reused',wallet(3));Object.assign(reused.referral,{referredBy:key('referrer'),boundAt:at,days:[20000,20001],spentUsdCents:1000});
  await admin.query(`INSERT INTO ${schema}.mossvale_players(account_key,state)VALUES($1,$2::jsonb)`,[key('reused'),JSON.stringify(reused)]);
  const reusedState=await us.claim(key('reused'));await us.commit([{key:key('reused'),state:reusedState}]);
  assert.equal((await read('reused')).referral.qualified,false,'One wallet cannot qualify another account in another realm.');
  const ownWallet=account('own-wallet',wallet(1));Object.assign(ownWallet.referral,{referredBy:key('referrer'),boundAt:at,days:[20000,20001],spentUsdCents:1000});
  await admin.query(`INSERT INTO ${schema}.mossvale_players(account_key,state)VALUES($1,$2::jsonb)`,[key('own-wallet'),JSON.stringify(ownWallet)]);
  await eu.claim(key('own-wallet'));await eu.commit([{key:key('own-wallet'),state:ownWallet}]);assert.equal((await read('own-wallet')).referral.qualified,false);
  // Rewards are account-bound: new characters inherit earned milestones without duplicate grants.
  await admin.query(`UPDATE ${schema}.mossvale_players SET state=jsonb_set(state,'{referral,qualifiedCount}','25'::jsonb) WHERE account_key=$1`,[key('referrer')]);
  const withAlt=await read('referrer');withAlt.characters.push({...copy(withAlt.characters[0]),id:'alt',name:'alt',ownedPets:[],ownedMounts:[]});
  await us.commit([{key:key('referrer'),state:withAlt}]);rewarded=await read('referrer');
  for(const player of rewarded.characters){assert.deepEqual(player.ownedPets,['wayfinder-sprite']);assert.deepEqual(player.ownedMounts,['wayfarer-stag']);}
  const racers=['race-eu','race-us'].map(name=>{const state=account(name,wallet(7));Object.assign(state.referral,{referredBy:key('referrer'),boundAt:at,days:[20000,20001],spentUsdCents:1000});return {name,state};});
  for(const {name,state} of racers)await admin.query(`INSERT INTO ${schema}.mossvale_players(account_key,state)VALUES($1,$2::jsonb)`,[key(name),JSON.stringify(state)]);
  await eu.claim(key(racers[0].name));await us.claim(key(racers[1].name));
  await Promise.all(racers.map(({name,state},index)=>(index?us:eu).commit([{key:key(name),state}])));
  assert.equal((await Promise.all(racers.map(({name})=>read(name)))).filter(state=>state.referral.qualified).length,1,'Simultaneous cross-realm qualification has one winner per wallet.');
  assert.equal((await read('referrer')).referral.qualifiedCount,26);
  // New referral binding is immutable and cannot be supplied after accepted activity.
  const freshKey=key('fresh'),fresh=await eu.claim(freshKey);const bound=copy(fresh);Object.assign(bound.referral,{referredBy:key('referrer'),boundAt:at,canBind:false});
  await eu.commit([{key:freshKey,state:bound,expected:fresh}]);
  const changed=copy(bound);changed.referral.referredBy=key('seller');await assert.rejects(eu.commit([{key:freshKey,state:changed,expected:bound}]));
  const self=await eu.claim(key('self'));Object.assign(self.referral,{referredBy:key('self'),boundAt:at,canBind:false});await assert.rejects(eu.commit([{key:key('self'),state:self}]));

  const retiring=account('retiring',wallet(8)),candidate=account('candidate',wallet(9));
  Object.assign(candidate.referral,{referredBy:key('retiring'),boundAt:at,days:[20000,20001],spentUsdCents:1000});
  for(const [name,state] of [['retiring',retiring],['candidate',candidate]])await admin.query(`INSERT INTO ${schema}.mossvale_players(account_key,state)VALUES($1,$2::jsonb)`,[key(name),JSON.stringify(state)]);
  await eu.claim(key('retiring'));await eu.claim(key('candidate'));
  await eu.requestDeletion(key('retiring'),'retiring-subject',()=>true);
  await eu.commit([{key:key('retiring'),state:retiring},{key:key('candidate'),state:candidate}]);
  assert.equal((await read('candidate')).referral.qualified,false,'A same-realm projected referrer cannot mask its deletion fence.');
  assert.equal((await read('retiring')).referral.qualifiedCount,0);
  const deletedRefCandidate=await eu.claim(key('deleted-ref-candidate'));
  Object.assign(deletedRefCandidate.referral,{referredBy:key('retiring'),boundAt:at,canBind:false});
  await assert.rejects(eu.commit([{key:key('deleted-ref-candidate'),state:deletedRefCandidate}]),/unavailable/);
  assert.equal((await read('fresh')).referral.code,referralCode(freshKey));
  // Extra referrer locks must not look like destroyed Gold under the production conservation barrier.
  await Promise.all(stores.map(store=>store.close()));
  await admin.query(`UPDATE ${schema}.mossvale_economy SET version=1`);
  await admin.query("SELECT set_config('mossvale.economy_supported','1',false),set_config('mossvale.economy_epoch','1',false)");
  const active=makeStore();await active.start();
  const activeBuyer=await active.claim(key('buyer'));activeBuyer.characters[0].inventory.wood++;
  await active.commit([{key:key('buyer'),state:activeBuyer}]);
  assert.equal((await read('buyer',active)).characters[0].gold,100,'An unchanged locked referrer cannot inflate the Gold baseline.');
  const productionCandidate=account('production-qualified',wallet(44));Object.assign(productionCandidate.referral,{referredBy:key('referrer'),boundAt:at,days:[20000,20001],spentUsdCents:1000});
  await admin.query(`INSERT INTO ${schema}.mossvale_players(account_key,state)VALUES($1,$2::jsonb)`,[key('production-qualified'),JSON.stringify(productionCandidate)]);
  await active.claim(key('production-qualified'));await active.commit([{key:key('production-qualified'),state:productionCandidate}]);
  assert.equal((await read('referrer',active)).referral.qualifiedCount,27,'An implicit referrer reward write preserves production Gold conservation.');
  assert.equal((await read('referrer',active)).characters[0].gold,105);
  const unaccounted=copy(activeBuyer);unaccounted.characters[0].gold++;
  await assert.rejects(active.commit([{key:key('buyer'),state:unaccounted}]),/Gold conservation/,'Referral participation never bypasses the Gold conservation barrier.');
  console.log('Referrals passed: UTC action days, new-account immutable attribution, finalized atomic spend, idempotent remote reward counts, stale autosaves, unique qualifying wallets, same-wallet exclusion, and account-wide 10/25 rewards.');
} finally {
  await Promise.all(stores.map(store=>store.close().catch(()=>{})));
  if(admin){await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(()=>{});await admin.end();}
  if(container)try{execFileSync('docker',['rm','-f',container],{stdio:'pipe'});}catch{}
}
