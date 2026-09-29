import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import pg from 'pg';
import { WebSocket } from 'ws';
import { Wallet, ZeroHash, id } from 'ethers';
import { createGameServer } from '../server.mjs';
import { COMMUNITY_VERSION } from '../src/community.ts';
import { createAuctionChain, auctionInterface, tokenAuctionInterface, erc20Interface } from '../src/auction-chain.mjs';
import { MOSS_TOKEN, MOSS_AUCTION_DEV_TEAM } from '../src/auction.ts';
import { initializeEconomy } from '../src/gold-migration.mjs';
import { AUCTIONEER } from '../src/city.ts';
import { CHAPTERS } from '../src/content.ts';
import { newContracts } from '../src/adventure.ts';
import { starterGear, TALENT_VERSION } from '../src/progression.ts';
import { canTraverse, regionAt } from '../src/realm.ts';
import { defaultHotbar } from '../src/spells.ts';
import { newAchievements } from '../src/achievements.ts';

// Real PostgreSQL, three game servers, verified JWTs and WebSockets. Only chain
// finality is simulated. TEST_DATABASE_URL uses a private disposable schema;
// without it, this check starts and removes its own loopback-only PG container.
const goldExchange = process.argv.includes('--gold');
const run = promisify(execFile), clients = [], games = [];
const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-shared-realms-'));
const schema = `shared_realms_${randomUUID().replaceAll('-', '')}`;
const appearance = { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' };
const near = Array.from({ length: 32 }, (_, i) => ({ x: AUCTIONEER.x + Math.cos(i * Math.PI / 16) * 1.2, z: AUCTIONEER.z + Math.sin(i * Math.PI / 16) * 1.2 })).find(point => canTraverse(point, AUCTIONEER));
assert(near, 'auctioneer has a reachable approach');
const authority = Wallet.createRandom(), contract = Wallet.createRandom().address, treasury = Wallet.createRandom().address;
const wallets = Array.from({ length: 4 }, () => Wallet.createRandom());
const artifact = JSON.parse(readFileSync(new URL(`../public/contracts/${goldExchange?'MossvaleTokenAuction':'MossvaleAuction'}.json`, import.meta.url), 'utf8'));
const payments = new Map(), finalizedPayments = new Map();
const block = (number, label) => ({ hash: id(label), number, timestamp: `0x${Math.floor(Date.now() / 1000).toString(16)}` });
let finalizedBlock = block('0x64', 'finalized'), latestBlock = block('0x65', 'processed'), container, admin, databaseUrl, keycloak, issuer;
const emit = pg.Client.prototype.emit;
let pauseAuctionNotifications = false;
pg.Client.prototype.emit = function (event, notification, ...args) {
  // Delay invalidation delivery to reproduce a realm whose seller cache predates the buyer's grant.
  if (pauseAuctionNotifications && event === 'notification' && notification.channel === 'mossvale_players_changed' && notification.payload === accountKey(1)) return false;
  return emit.call(this, event, notification, ...args);
};
const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(publicKey), kid: 'shared-realm-check', use: 'sig', alg: 'RS256' };
const identityServer = createServer((_req, res) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ keys: [jwk] })));
const disabledChain = { status: async () => ({ enabled: false, reason: 'Local test.' }) };
const accountKey = index => createHash('sha256').update(`${issuer}\nshared-realm-${index}`).digest('hex');

function hero(name, index) {
  const level = 59, maxHp = 100 + (level - 1) * 12;
  return { id: randomUUID(), name, realmId: 'eu', ...near, zone: regionAt(near.x, near.z), coordinateVersion: 2, rotation: 0,
    appearance: { ...appearance }, characterCreated: true, talents: [], ...starterGear('Ranger'), hotbar: defaultHotbar('Ranger'), hotbar2: ['mend','arrow',null,null,null,null,null,null],
    hp: maxHp, maxHp, level, xp: 123, gold: 1000, auctionWallet: wallets[index].address,
    inventory: { wood: 30, crystal: 20, herb: 15, potion: 3, relic: 5 }, skills: { mining: 7, woodcutting: 8, herbalism: 9, fishing: 12345 }, craftingXp: 20, contracts: newContracts(),
    quest: { chapter: 0, stage: 0, kills: 0, crystals: 0, progress: Object.fromEntries(CHAPTERS[0].objectives.map(objective => [objective.id, 0])), completed: false, ending: null } };
}
const heroes = ['Shared Traveler', 'Shared Seller', 'Shared Buyer', 'Shared Rival'].map(hero);
Object.assign(heroes[0], { appearance: { ...appearance, race: 'catfolk', gender: 'female', face: 'freckles', hairStyle: 'twin-buns', hairHighlight: '#b1c2d3', armorColors: { armor: '#123456', back: '#654321' } },
  talentVersion: TALENT_VERSION, dreamRestReadyAt: Date.now() + 600000, carriedItems: { 'brook-trout': 2, 'dream-petal': 1 },
  title: 'beta-tester', ownedPets: ['moss-fox'], summonedPet: 'moss-fox',
  achievements: { ...newAchievements(heroes[0]), kills: 12, unlocked: { 'first-victory': 1700000000000 } } });
const feedbackProgress = player => ({ appearance: player.appearance, skills: player.skills, talentVersion: player.talentVersion, dreamRestReadyAt: player.dreamRestReadyAt, carriedItems: player.carriedItems });
const sharedProgress = player => ({ ...feedbackProgress(player), hotbar2: player.hotbar2, title: player.title, betaTester: player.betaTester, ownedPets: player.ownedPets, summonedPet: player.summonedPet, achievements: player.achievements });
async function until(predicate, label, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await predicate(); if (value) return value; await delay(25); }
  throw Error(`Timed out: ${label}`);
}
async function provisionDatabase() {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    container = `mossvale-shared-realms-${randomUUID().slice(0, 8)}`;
    const password = randomUUID();
    await run('docker', ['run', '--rm', '-d', '--name', container, '-e', `POSTGRES_PASSWORD=${password}`, '-p', '127.0.0.1::5432', 'postgres:17']);
    const { stdout } = await run('docker', ['port', container, '5432/tcp']);
    const port = stdout.trim().match(/^127\.0\.0\.1:(\d+)$/)?.[1];
    assert(port, 'PostgreSQL is published only on loopback');
    url = `postgresql://postgres:${password}@127.0.0.1:${port}/postgres`;
  }
  await until(async () => {
    const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 1000 });
    try { await client.connect(); admin = client; return true; } catch { await client.end(); return false; }
  }, 'disposable PostgreSQL ready', 30000);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const scoped = new URL(url);
  scoped.searchParams.set('options', `-c search_path=${schema}`);
  scoped.searchParams.set('application_name', schema);
  databaseUrl = scoped.toString();
  await admin.query(`CREATE TABLE ${schema}.mossvale_players (account_key text PRIMARY KEY, state jsonb NOT NULL)`);
  for (const [index, player] of heroes.entries()) await admin.query(`INSERT INTO ${schema}.mossvale_players (account_key, state) VALUES ($1, $2)`, [accountKey(index), { characters: [player], ...(index === 0 ? { betaTester: true } : {}) }]);
}
function auctionChain() {
  const abi=goldExchange?tokenAuctionInterface:auctionInterface;
  return createAuctionChain({ ...(goldExchange?{currency:'moss'}:{}), contract, treasury, authorityKey: authority.privateKey, chainId: 4663, rpc: async (method, params) => {
    if (method === 'eth_chainId') return '0x1237';
    if (method === 'eth_getCode') return params[0].toLowerCase()===MOSS_TOKEN.address.toLowerCase()?readFileSync(new URL('./fixtures/moss-token-runtime.hex',import.meta.url),'utf8').trim():artifact.deployedBytecode;
    if (method === 'eth_getBlockByNumber') return params[0] === 'finalized' || params[0] === finalizedBlock.number ? finalizedBlock : latestBlock;
    if (method === 'eth_call' && params[0].to.toLowerCase()===MOSS_TOKEN.address.toLowerCase()) { const call=erc20Interface.parseTransaction({data:params[0].data});return erc20Interface.encodeFunctionResult(call.name,[({name:'Mossvale',symbol:'MOSS',decimals:18,balanceOf:10n**24n})[call.name]]); }
    if (method === 'eth_call') {
      const call = abi.parseTransaction({ data: params[0].data });
      const identity={authority:authority.address,paymentToken:MOSS_TOKEN.address,treasury,TAX_BPS:500,devTeam:MOSS_AUCTION_DEV_TEAM};
      if(Object.hasOwn(identity,call.name))return abi.encodeFunctionResult(call.name,[identity[call.name]]);
      assert.equal(call.name,'paidOrders','fixture supports only reviewed auction calls');
      return abi.encodeFunctionResult('paidOrders', [(params[1].blockHash === finalizedBlock.hash ? finalizedPayments : payments).get(call.args[0]) || ZeroHash]);
    }
    throw Error(`Unexpected test RPC ${method}`);
  } });
}
async function start(realmId) {
  const chain = auctionChain(), status = await chain.status();
  assert.equal(status.enabled,true,`auction fixture must be ready before persistence checks: ${status.reason}`);
  if(goldExchange){assert.equal(status.taxBps,500);assert.equal(status.treasury,treasury);assert.equal(status.devTeam,MOSS_AUCTION_DEV_TEAM);}
  const game = createGameServer({ realmId, databaseUrl, databaseCaBase64: '', port: 0, host: '127.0.0.1', dataDir: join(dataDir, realmId), keycloak, keycloakAccountIssuer: issuer,
    walletOidc: { env: {} }, auctionChain: goldExchange?disabledChain:chain, mossAuctionChain: goldExchange?chain:disabledChain,
    realmEuOrigin: 'https://eu.example', realmUsOrigin: 'https://us.example', realmAsiaOrigin: 'https://asia.example', gameAllowedOrigins: 'https://game.example' });
  games.push(game);
  const port = await game.start(); return { game, chain, realmId, origin: `http://127.0.0.1:${port}` };
}
async function token(index) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ iss: issuer, sub: `shared-realm-${index}`, azp: keycloak.clientId, typ: 'Bearer', iat: now, exp: now + 600 })
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).sign(privateKey);
}
async function connect(server, index, select = true) {
  const socket = new WebSocket(`${server.origin.replace('http:', 'ws:')}/socket`, { origin: 'https://game.example' });
  const client = { socket, server, index, id: heroes[index].id, messages: [], closed: null };
  clients.push(client);
  socket.on('message', raw => { const message = JSON.parse(raw); client.messages.push(message); if (['roster', 'welcome', 'snapshot', 'auction'].includes(message.type)) client[message.type] = message; if (message.type === 'trade') client.trade = message.trade; });
  socket.on('close', code => { client.closed = code; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  client.send = message => socket.send(JSON.stringify(message));
  client.player = () => client.snapshot?.players.find(player => player.id === client.id);
  client.send({ type: 'join', accessToken: await token(index), realmId: server.realmId, ...(select ? { characterId: client.id } : {}) });
  await until(() => client.closed !== null || (select ? client.player() : client.roster), 'verified realm login');
  if (!client.closed) {
    client.send({ type: 'acceptCommunityRules', version: COMMUNITY_VERSION });
    await until(() => client.messages.some(message => message.type === 'community' && message.accepted), 'community rules accepted');
  }
  return client;
}
async function leave(client) {
  const count = client.messages.length;
  client.send({ type: 'leaveRealm' });
  await until(() => client.messages.slice(count).some(message => message.type === 'realmLeft'), 'durable realm release acknowledged');
}
async function roster(server, index) {
  const response = await fetch(`${server.origin}/api/roster`, { headers: { Authorization: `Bearer ${await token(index)}`, Origin: 'https://game.example' } });
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store'); return response.json();
}
async function stored(index) {
  const { rows } = await admin.query(`SELECT state FROM ${schema}.mossvale_players WHERE account_key = $1`, [accountKey(index)]);
  return rows[0].state.characters.find(player => player.id === heroes[index].id);
}
const request = (type, extra = {}) => ({ type, npcId: AUCTIONEER.id, ...extra });
async function openAuction(client) {
  const count = client.messages.length; client.send(request('auctionOpen'));
  return until(() => client.messages.slice(count).find(message => message.type === 'auction'), 'fresh global auction browse');
}
async function list(client, resource, quantity, price = '25', currency = 'gold') {
  const before = new Set((await openAuction(client)).mine.map(listing => listing.id));
  client.send(request('auctionList', { item: resource==='gold'?{kind:'gold',id:'gold',quantity}:{ kind: 'resource', id: resource, quantity }, currency, price }));
  return until(() => client.auction?.mine.find(listing => !before.has(listing.id)), 'durable listing');
}
async function touchAndCheckGold(client, amount) {
  const slots = [...client.player().hotbar]; slots[7] = slots[7] === null ? slots[0] : null;
  client.send({ type: 'setHotbar', slots });
  await until(() => client.player()?.gold === amount, 'owning realm applies seller proceeds exactly once');
}

try {
  await new Promise(resolve => identityServer.listen(0, '127.0.0.1', resolve));
  keycloak = { url: `http://127.0.0.1:${identityServer.address().port}`, realm: 'mossvale', clientId: 'mossvale-browser' };
  issuer = `${keycloak.url}/realms/${keycloak.realm}`;
  await provisionDatabase();
  if(goldExchange){await admin.query(`SET search_path=${schema}`);await initializeEconomy((sql,values)=>admin.query(sql,values));await admin.query('UPDATE mossvale_economy SET version=1,exchange_enabled=true');}
  let eu = await start('eu'), us = await start('us'), asia = await start('asia');
  assert.equal((await fetch(`${eu.origin}/api/roster`)).status, 401);
  assert.equal((await fetch(`${us.origin}/api/roster`, { headers: { Authorization: 'Bearer invalid' } })).status, 401);
  assert.equal((await fetch(`${asia.origin}/api/roster`, { headers: { Authorization: 'Bearer invalid' } })).status, 401);

  if(goldExchange){
    let seller=await connect(eu,1),buyer=await connect(us,2),rival=await connect(asia,3);
    const total=async()=>{const {rows}=await admin.query(`SELECT state,pending_credits FROM ${schema}.mossvale_players`);return rows.reduce((sum,row)=>sum+row.state.characters.reduce((sum,p)=>sum+p.gold+(row.pending_credits[p.id]||0)+(p.auctions||[]).filter(a=>a.item.kind==='gold').reduce((sum,a)=>sum+a.item.quantity,0),0),0);};
    const initial=await total();
    const listing=await list(seller,'gold',201,'2.5','moss');assert.equal(listing.goldFee,2);assert.equal(await total(),initial);
    await Promise.all([openAuction(buyer),openAuction(rival)]);
    buyer.send(request('auctionBuy',{listingId:listing.id}));rival.send(request('auctionBuy',{listingId:listing.id}));
    const reserved=await until(async()=>(await stored(1)).auctions.find(row=>row.id===listing.id)?.reservation,'one concurrent realm reserves lot');
    const winner=reserved.buyerId===buyer.id?buyer:rival,winnerIndex=winner.index,loser=winner===buyer?rival:buyer;
    await until(()=>loser.messages.some(message=>message.type==='event'&&message.kind==='info'&&/reserved|seller|sav|transaction/i.test(message.text)),'other realm rejects purchase');
    const order=reserved.order;
    await until(()=>winner.player().pendingAuctionPurchases?.some(row=>row.id===listing.id),'winning realm projects its durable pending purchase');
    assert.deepEqual(winner.player().pendingAuctionPurchases,[{id:listing.id,item:listing.item,currency:listing.currency,price:listing.price,expiresAt:reserved.expiresAt}]);
    assert.equal(loser.player().pendingAuctionPurchases?.length,0,'another buyer never sees the winner pending purchase');
    assert.equal((await stored(winnerIndex)).pendingAuctionPurchases,undefined,'pending purchase is not persisted as player inventory');
    assert.equal((await stored(winnerIndex)).gold,1000);assert.equal(await total(),initial);
    await leave(winner);payments.set(order.listingId,order.orderHash);
    await until(async()=>!(await stored(1)).auctions.some(row=>row.id===listing.id),'latest payment lets all realms race to settle the offline buyer');
    assert.equal(finalizedPayments.size,0,'gold delivery does not wait for a finalized payment');
    const offline=(await admin.query(`SELECT state,pending_credits FROM ${schema}.mossvale_players WHERE account_key=$1`,[accountKey(winnerIndex)])).rows[0];
    assert.equal(offline.state.characters[0].gold,1000);assert.equal(offline.pending_credits[winner.id],199,'offline delivery is an atomic pending credit');assert.equal(await total(),initial-2);
    assert.equal((await stored(1)).auctionSales.filter(sale=>sale.id===listing.id).length,1,'latest-only payment completes shared Sold history once');
    const events=(await admin.query(`SELECT * FROM ${schema}.mossvale_gold_events WHERE reason='exchange:fee'`)).rows;assert.equal(events.length,1,'concurrent settlement burns once');assert.equal(Number(events[0].burned),2);assert.equal(Number(events[0].transferred),199);
    await eu.game.stop();await us.game.stop();await asia.game.stop();eu=await start('eu');us=await start('us');asia=await start('asia');
    seller=await connect(eu,1);buyer=await connect(us,2);rival=await connect(asia,3);const recipient=winnerIndex===2?buyer:rival;
    assert.deepEqual(recipient.player().pendingAuctionPurchases,[],'settled payment leaves no pending preview after restart');
    assert.equal(recipient.player().gold,1199,'restart/handoff collects pending gold once');assert.equal(await total(),initial-2);
    await touchAndCheckGold(recipient,1199);assert.equal(Number((await admin.query(`SELECT COUNT(*) AS count FROM ${schema}.mossvale_gold_events WHERE reason='exchange:fee'`)).rows[0].count),1);
    const item=await list(seller,'wood',1,'21','gold');assert.equal(item.goldFee,2);buyer.send(request('auctionBuy',{listingId:item.id}));await until(async()=>!(await stored(1)).auctions.some(row=>row.id===item.id),'cross realm gold item sale');
    await touchAndCheckGold(seller,818);assert.equal(await total(),initial-4);
    const itemEvents=(await admin.query(`SELECT * FROM ${schema}.mossvale_gold_events WHERE reason='auction:fee'`)).rows;assert.equal(itemEvents.length,1);assert.equal(Number(itemEvents[0].burned),2);assert.equal(Number(itemEvents[0].transferred),19);
    const spending=await list(seller,'herb',1,'1001','gold'),beforeSpend=recipient.player().gold;
    recipient.send(request('auctionBuy',{listingId:spending.id}));
    await until(()=>recipient.player().gold===beforeSpend-1001&&recipient.player().inventory.herb===16,'newly received gold is spendable before finality');
    await touchAndCheckGold(seller,1768);assert.equal(await total(),initial-55);
    const spentEvents=(await admin.query(`SELECT * FROM ${schema}.mossvale_gold_events WHERE reason='auction:fee' ORDER BY burned`)).rows;
    assert.equal(spentEvents.length,2);assert.equal(Number(spentEvents[1].burned),51);assert.equal(Number(spentEvents[1].transferred),950);
    recipient.send(request('auctionPaymentCheck',{listingId:listing.id}));await openAuction(recipient);
    assert.equal(recipient.player().gold,beforeSpend-1001);assert.equal(await total(),initial-55);
    assert.equal(finalizedPayments.size,0);assert.equal((await stored(1)).auctionSales.filter(sale=>sale.id===listing.id).length,1);
    assert.equal(Number((await admin.query(`SELECT COUNT(*) AS count FROM ${schema}.mossvale_gold_events WHERE reason='exchange:fee'`)).rows[0].count),1,'rechecking completed payment cannot duplicate credits or fees');
    console.log('Gold Exchange real PostgreSQL EU/US/Asia: competing reservations, immediate latest-only offline settlement, atomic pending credits + fee ledger, immediate spending, supply conservation, completed-sale replay, restart/handoff idempotency and gold item seller fees passed.');
  }else{
  let traveler = await connect(eu, 0);
  const travelerProgress = structuredClone(sharedProgress(traveler.player()));
  assert.equal(travelerProgress.betaTester, true);
  assert.equal(travelerProgress.title, 'beta-tester');
  assert.equal(travelerProgress.achievements.unlocked['first-victory'], 1700000000000);
  for (const server of [us, asia]) assert.equal((await connect(server, 0)).closed, 4407, 'an account cannot play in multiple regions');
  assert.equal(traveler.socket.readyState, WebSocket.OPEN, 'rejected remote login leaves the owner connected');
  for (const server of [eu, us, asia]) {
    const result = await roster(server, 0);
    assert.equal(result.maxCharacters, 6); assert.deepEqual(result.characters.map(player => player.id), [heroes[0].id]);
  }
  const travelListing = await list(traveler, 'wood', 5);
  await until(() => traveler.player()?.inventory.wood === 25, 'committed escrow reflected in the live snapshot');
  for (const destination of [us, asia]) {
    await leave(traveler);
    traveler = await connect(destination, 0);
    assert.equal(traveler.player().inventory.wood, 25, 'realm change retains the latest committed inventory');
    assert.deepEqual(sharedProgress(traveler.player()), travelerProgress, 'achievements, titles, pets, fishing, cosmetics and dream progress survive shared handoff');
    assert.equal(traveler.player().xp, 123); assert.deepEqual(traveler.player().skills, heroes[0].skills);
    assert((await openAuction(traveler)).mine.some(listing => listing.id === travelListing.id), 'the same character owns its listing in every region');
    for (const other of [eu, us, asia].filter(server => server !== destination)) assert.equal((await connect(other, 0)).closed, 4407, 'the selected region exclusively owns the shared account');
    assert.equal(traveler.socket.readyState, WebSocket.OPEN);
  }
  traveler.send(request('auctionCancel', { listingId: travelListing.id }));
  await until(() => traveler.player()?.inventory.wood === 30, 'cancel shared escrow after realm change');
  await leave(traveler);
  traveler = await connect(asia, 0, false);
  for (let index = 1; index <= 5; index++) {
    traveler.send({ type: 'createCharacter', realmId: 'asia', name: `Shared Alt ${index}`, appearance });
    await until(() => traveler.roster?.characters.length === index + 1, 'shared roster slot created');
  }
  const beforeSeventh = traveler.messages.length;
  traveler.send({ type: 'createCharacter', realmId: 'asia', name: 'Shared Seventh', appearance });
  await until(() => traveler.messages.slice(beforeSeventh).some(message => message.type === 'event' && message.kind === 'info'), 'seventh character rejected');
  await leave(traveler);
  assert.equal((await roster(eu, 0)).characters.length, 6, 'six slots total across all regions');
  assert((await roster(eu, 0)).characters.every(player => player.betaTester && player.title === 'beta-tester'), 'durable creation preserves the account title entitlement');
  assert.deepEqual((await roster(eu, 0)).characters.map(player => player.id), (await roster(us, 0)).characters.map(player => player.id));
  assert.deepEqual((await roster(eu, 0)).characters.map(player => player.id), (await roster(asia, 0)).characters.map(player => player.id));

  traveler = await connect(asia, 0);
  let seller = await connect(us, 1), buyer = await connect(eu, 2), rival = await connect(us, 3);
  for (const observer of [traveler, seller, buyer, rival]) for (const remote of [traveler, seller, buyer, rival].filter(client => client.server !== observer.server)) {
    assert(!observer.snapshot.players.some(player => player.id === remote.id), 'shared accounts and global auctions do not merge the three simulation worlds');
  }
  const first = await list(seller, 'wood', 5);
  assert((await openAuction(buyer)).listings.some(listing => listing.id === first.id), 'EU sees active US seller listings');
  // Pause the real owning save after PostgreSQL has locked a pending credit.
  // An already-open ordinary trade can then queue an absolute balance behind
  // that save, reproducing credit loss unless the queued action is rebased.
  await admin.query(`CREATE FUNCTION ${schema}.pause_credit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF OLD.account_key = '${accountKey(1)}' AND OLD.pending_credits ? '${seller.id}' AND NOT NEW.pending_credits ? '${seller.id}' THEN PERFORM pg_sleep(2); END IF;
    RETURN NEW;
  END $$`);
  await admin.query(`CREATE TRIGGER pause_credit BEFORE UPDATE ON ${schema}.mossvale_players FOR EACH ROW EXECUTE FUNCTION ${schema}.pause_credit()`);
  seller.send({ type: 'tradeRequest', targetId: rival.id });
  await until(() => seller.trade?.status === 'invited' && rival.trade?.id === seller.trade.id, 'local trade invited before remote sale');
  rival.send({ type: 'tradeRespond', tradeId: seller.trade.id, accept: true });
  await until(() => seller.trade?.status === 'open' && rival.trade?.status === 'open', 'local trade consent');
  seller.send({ type: 'tradeOffer', tradeId: seller.trade.id, offer: { gold: 7, items: {}, gear: [] } });
  await until(() => seller.trade?.participants.find(player => player.id === seller.id)?.offer.gold === 7 && rival.trade?.revision === seller.trade.revision, 'seven gold offered');
  seller.send({ type: 'tradeAccept', tradeId: seller.trade.id, revision: seller.trade.revision });
  await until(() => seller.trade?.participants.find(player => player.id === seller.id)?.accepted, 'first trade approval');
  buyer.send(request('auctionBuy', { listingId: first.id }));
  await until(async () => (await admin.query("SELECT 1 FROM pg_stat_activity WHERE application_name = $1 AND wait_event = 'PgSleep'", [schema])).rowCount, 'pending-credit autosave suspended inside PostgreSQL');
  assert.equal(seller.player().gold, 1000, 'credit is still unacknowledged while the trade computes its balances');
  rival.send({ type: 'tradeAccept', tradeId: rival.trade.id, revision: rival.trade.revision });
  await until(() => rival.trade?.participants.every(player => player.accepted), 'trade queues behind the pending-credit save');
  await until(() => buyer.player()?.inventory.wood === 35 && buyer.player().gold === 975, 'cross-region gold purchase');
  await until(() => seller.trade === null && rival.trade === null, 'queued trade completes');
  await admin.query(`DROP TRIGGER pause_credit ON ${schema}.mossvale_players`);
  await admin.query(`DROP FUNCTION ${schema}.pause_credit()`);
  assert.equal(seller.socket.readyState, WebSocket.OPEN);
  await touchAndCheckGold(seller, 1018);
  assert.equal(rival.player().gold, 1007, 'queued trade transfers seven gold and preserves all twenty-five pending proceeds');
  assert.equal(seller.player().inventory.wood, 25, 'remote sale does not restore escrowed inventory');
  const firstSale = (await stored(1)).auctionSales[0];
  assert.deepEqual(firstSale, { id: first.id, item: first.item, currency: 'gold', price: first.price, buyerName: heroes[2].name, soldAt: firstSale.soldAt });
  assert(Number.isSafeInteger(firstSale.soldAt) && firstSale.soldAt >= first.createdAt && firstSale.soldAt <= Date.now());
  assert.deepEqual((await openAuction(seller)).sold, [firstSale], 'owning realm receives history from a remote sale despite its queued local save');
  assert.deepEqual((await stored(2)).auctionSales, []);
  assert.deepEqual((await openAuction(buyer)).sold, [], 'buyer cannot browse the other account’s sale history');

  const contested = await list(seller, 'crystal', 2, '40');
  await Promise.all([openAuction(buyer), openAuction(rival)]);
  buyer.send(request('auctionBuy', { listingId: contested.id })); rival.send(request('auctionBuy', { listingId: contested.id }));
  await until(() => [buyer, rival].some(client => client.player()?.inventory.crystal === 22), 'one cross-region buyer wins');
  await until(async () => !(await stored(1)).auctions.some(listing => listing.id === contested.id), 'contested listing consumed');
  await touchAndCheckGold(seller, 1058);
  assert.equal(buyer.player().inventory.crystal + rival.player().inventory.crystal, 42, 'contended listing delivers one item stack');
  assert.equal(buyer.player().gold + rival.player().gold, 1942, 'contended purchase debits exactly once');
  assert.deepEqual((await stored(1)).auctionSales.map(sale => sale.id), [contested.id, first.id], 'cross-realm contention records one sale per listing');
  const third = await list(seller, 'herb', 3, '17');
  await leave(seller);
  await openAuction(buyer); buyer.send(request('auctionBuy', { listingId: third.id }));
  await until(() => buyer.player()?.inventory.herb === 18, 'offline seller listing remains global');
  const goldSales = (await stored(1)).auctionSales;
  assert.deepEqual(goldSales.map(sale => sale.id), [third.id, contested.id, first.id], 'offline seller history is persisted in the same shared transaction as the gold sale');
  assert.equal(goldSales[0].buyerName, heroes[2].name); assert.equal(goldSales[0].price, '17');
  seller = await connect(us, 1);
  await until(() => seller.player()?.gold === 1075, 'pending seller proceeds survive relogin');
  assert.equal(seller.player().inventory.herb, 12);
  assert.deepEqual((await openAuction(seller)).sold, goldSales, 'offline history is visible after login on another server instance');
  for (const client of [seller, buyer, rival]) assert(client.snapshot.players.every(player => !Object.hasOwn(player, 'auctionSales')), 'private seller history never enters a realm world snapshot');

  const cryptoListing = await list(seller, 'relic', 2, '0.01', 'eth');
  await openAuction(buyer);
  const prepareOrder = eu.chain.prepareOrder;
  let signing = false, releaseSigning;
  eu.chain.prepareOrder = async input => { signing = true; await new Promise(resolve => { releaseSigning = resolve; }); return prepareOrder.call(eu.chain, input); };
  const beforeOrder = buyer.messages.length; buyer.send(request('auctionBuy', { listingId: cryptoListing.id }));
  await until(() => signing, 'purchase admitted before changing realms');
  const leaving = leave(buyer);
  try {
    for (const destination of [us, asia]) assert.equal((await connect(destination, 2)).closed, 4407, 'handoff retains ownership while an admitted purchase is signing');
    assert(!buyer.messages.slice(beforeOrder).some(message => message.type === 'realmLeft'), 'realm release cannot precede its pending transaction');
  } finally { releaseSigning(); eu.chain.prepareOrder = prepareOrder; }
  await leaving;
  const order = (await stored(1)).auctions.find(listing => listing.id === cryptoListing.id)?.reservation.order;
  assert(order, 'handoff acknowledges only after its admitted reservation is durable');
  const exposed = buyer.messages.slice(beforeOrder).find(message => message.type === 'auctionPayment');
  if (exposed) assert.deepEqual(exposed.order, order, 'exposed order matches the durable reservation');
  buyer = await connect(asia, 2);
  await until(() => buyer.player().pendingAuctionPurchases?.some(row => row.id === cryptoListing.id), 'realm handoff reconstructs the pending purchase');
  assert.deepEqual(buyer.player().pendingAuctionPurchases, [{ id: cryptoListing.id, item: cryptoListing.item, currency: cryptoListing.currency, price: cryptoListing.price, expiresAt: order.deadline * 1000 }]);
  assert.equal(buyer.player().inventory.relic, 5, 'realm handoff does not grant pending inventory');
  await leave(buyer);
  payments.set(order.listingId, order.orderHash);
  await delay(5300);
  assert.equal((await stored(2)).inventory.relic, 5, 'a realm never writes an offline buyer inventory');
  assert.equal((await stored(1)).auctions.find(listing => listing.id === cryptoListing.id)?.reservation.order.orderHash, order.orderHash, 'paid item stays in durable escrow until its buyer claims an account');
  pauseAuctionNotifications = true;
  buyer = await connect(asia, 2);
  await openAuction(buyer); buyer.send(request('auctionPaymentCheck', { listingId: cryptoListing.id }));
  await until(() => buyer.player()?.inventory.relic === 7, 'Asia delivers successful inclusion before finality');
  assert.deepEqual(buyer.player().pendingAuctionPurchases, [], 'confirmed cross-realm delivery removes pending preview');
  assert(!(await stored(1)).auctions.some(listing => listing.id === cryptoListing.id), 'seller escrow and buyer grant complete in the same shared transaction');
  assert.equal(finalizedPayments.size, 0, 'no finalized payment exists during completion');
  assert.equal(seller.player().gold, 1075, 'crypto proceeds remain in the contract, not in-game gold');
  const sold = (await stored(1)).auctionSales, cryptoSale = sold[0];
  assert.deepEqual(cryptoSale, { id: cryptoListing.id, item: cryptoListing.item, currency: 'eth', price: cryptoListing.price, buyerName: heroes[2].name, soldAt: cryptoSale.soldAt });
  assert.deepEqual(sold.slice(1), goldSales, 'latest inclusion adds one crypto sale while preserving shared gold history');
  assert.deepEqual((await openAuction(buyer)).sold, []);

  await leave(buyer); buyer = await connect(eu, 2);
  assert.equal(buyer.player().inventory.relic, 7, 'completed inventory survives realm handoff');
  buyer.send({ type: 'dropItem', itemId: 'relic', quantity: 6 });
  await until(() => buyer.player()?.inventory.relic === 1, 'new owner can consume purchased quantity despite delayed seller-cache notifications');
  assert.equal((await stored(2)).inventory.relic, 1, 'consumption of original and purchased items is durable before finality');
  pauseAuctionNotifications = false;
  const resale = await list(buyer, 'relic', 1, '3');
  const rivalGold = rival.player().gold, buyerGold = buyer.player().gold;
  await openAuction(rival); rival.send(request('auctionBuy', { listingId: resale.id }));
  await until(() => rival.player()?.inventory.relic === 6 && rival.player().gold === rivalGold - 3, 'remaining purchased item transfers to another realm before finality');
  await touchAndCheckGold(buyer, buyerGold + 3);
  const buyerSales = (await stored(2)).auctionSales;
  assert.equal(buyerSales.length, 1); assert.equal(buyerSales[0].id, resale.id);
  assert.equal(finalizedPayments.size, 0); assert.equal((await stored(2)).inventory.relic, 0);
  assert.deepEqual((await openAuction(seller)).sold, sold, 'seller realm refreshes completed history from the buyer realm');

  await leave(buyer);
  payments.delete(order.listingId); latestBlock = block('0x65', 'orphaned-payment-replacement');
  await delay(5300);
  assert.equal((await stored(2)).inventory.relic, 0, 'later chain changes cannot recreate already consumed or transferred items');
  assert.equal((await stored(3)).inventory.relic, 6, 'completed transfer remains with its new owner');
  assert.deepEqual((await stored(1)).auctionSales, sold, 'accepted post-completion chain reversal does not reopen escrow or rewrite Sold history');
  buyer = await connect(asia, 2);
  await openAuction(buyer); buyer.send(request('auctionPaymentCheck', { listingId: cryptoListing.id }));
  await openAuction(buyer);
  assert.equal(buyer.player().inventory.relic, 0); assert.deepEqual(buyer.auction.sold, buyerSales, 'only the buyer’s own resale appears in its history');
  payments.set(order.listingId, order.orderHash); latestBlock = block('0x66', 'payment-reincluded');
  finalizedPayments.set(order.listingId, order.orderHash); finalizedBlock = latestBlock;
  buyer.send(request('auctionPaymentCheck', { listingId: cryptoListing.id }));
  await openAuction(buyer);
  assert.equal((await stored(2)).inventory.relic, 0, 're-inclusion and finality cannot grant completed items a second time');
  assert.equal((await stored(3)).inventory.relic, 6);
  assert.deepEqual((await stored(1)).auctionSales, sold, 'repeated checks cannot duplicate the completed sale');

  // Recreate a persisted grant from the previous processed-delivery policy, then hand it to a new owner.
  latestBlock = block('0x67', 'legacy-saved-payment');
  const legacyListing = await list(seller, 'relic', 1, '0.02', 'eth');
  await openAuction(buyer); buyer.send(request('auctionBuy', { listingId: legacyListing.id }));
  const legacyReservation = await until(async () => (await stored(1)).auctions.find(listing => listing.id === legacyListing.id)?.reservation, 'legacy migration fixture has a real durable signed order');
  const expectedBuyer = { gold: buyer.player().gold, inventory: { ...buyer.player().inventory, relic: 1 } };
  const expectedRival = { gold: rival.player().gold, inventory: { ...rival.player().inventory } };
  await eu.game.stop(); await us.game.stop(); await asia.game.stop();
  const legacyStates = (await admin.query(`SELECT account_key,state FROM ${schema}.mossvale_players WHERE account_key=ANY($1)`, [[accountKey(1), accountKey(2)]])).rows;
  for (const row of legacyStates) {
    const player = row.state.characters.find(player => player.id === heroes[row.account_key === accountKey(1) ? 1 : 2].id);
    if (row.account_key === accountKey(1)) {
      const listing = player.auctions.find(listing => listing.id === legacyListing.id);
      assert.deepEqual(listing.reservation, legacyReservation);
      listing.reservation.delivered = true;
      listing.reservation.order.paymentBlock = { hash: latestBlock.hash, number: latestBlock.number };
    } else { assert.equal(player.inventory.relic, 0); player.inventory.relic = 1; }
  }
  await admin.query('BEGIN');
  try {
    for (const row of legacyStates) await admin.query(`UPDATE ${schema}.mossvale_players SET state=$2 WHERE account_key=$1`, [row.account_key, row.state]);
    await admin.query('COMMIT');
  } catch (error) { await admin.query('ROLLBACK'); throw error; }
  payments.set(legacyReservation.order.listingId, legacyReservation.order.orderHash);
  assert(!finalizedPayments.has(legacyReservation.order.listingId));
  eu = await start('eu'); us = await start('us'); asia = await start('asia');
  seller = await connect(eu, 1); buyer = await connect(asia, 2); rival = await connect(us, 3);
  await until(async () => !(await stored(1)).auctions.some(listing => listing.id === legacyListing.id), 'handoff upgrades the saved processed grant to completed without waiting for finality');
  assert.equal(seller.player().gold, 1075, 'restart cannot credit a seller twice');
  assert.deepEqual({ gold: buyer.player().gold, inventory: buyer.player().inventory }, expectedBuyer, 'restart preserves consumed/transferred items and upgrades the old grant without a duplicate');
  assert.deepEqual({ gold: rival.player().gold, inventory: rival.player().inventory }, expectedRival);
  const completedSold = (await stored(1)).auctionSales;
  assert.equal(completedSold[0].id, legacyListing.id); assert.deepEqual(completedSold.slice(1), sold);
  assert.equal((await openAuction(seller)).mine.length, 0);
  assert.deepEqual(seller.auction.sold, completedSold, 'all completed history survives three-realm restart and seller handoff');
  buyer.send(request('auctionPaymentCheck', { listingId: legacyListing.id })); await openAuction(buyer);
  assert.equal((await stored(2)).inventory.relic, 1); assert.deepEqual((await stored(1)).auctionSales, completedSold, 'legacy upgrade remains exactly once under replay');
  for (const client of [seller, buyer, rival]) assert(client.snapshot.players.every(player => !Object.hasOwn(player, 'auctionSales')));
  for (const server of [eu, us, asia]) {
    const finalRoster = await roster(server, 0);
    assert.equal(finalRoster.characters.length, 6);
    assert.deepEqual(sharedProgress(finalRoster.characters.find(player => player.id === heroes[0].id)), travelerProgress, 'new progression features remain intact after all regions restart');
  }
  assert.deepEqual(feedbackProgress(await stored(0)), feedbackProgress(heroes[0]), 'nonzero fishing XP, new race/hair/colors, dream cooldown and rewards remain in PostgreSQL after handoff and restart');
  for (const suffix of ['us', 'asia']) assert.equal((await admin.query(`SELECT to_regclass($1) AS isolated`, [`${schema}.mossvale_players_${suffix}`])).rows[0].isolated, null, 'all regions use one canonical player table');
  console.log('Shared realms: authenticated global roster, six total slots, achievements/title/pet/fishing/cosmetic/dream persistence, exclusive account ownership, three separate worlds, transaction-safe EU/US/Asia handoff, active/offline global gold sales, buyer contention, pending-credit/queued-trade race, immediate crypto completion, consumption/transfer before finality, post-completion chain-change/replay idempotency, legacy processed grant upgrade, private completed Sold history, and restart persistence passed. PostgreSQL and game servers were local; chain state was simulated.');
  }
} finally {
  pg.Client.prototype.emit = emit;
  for (const client of clients) client.socket.terminate();
  for (const game of games) await game.stop().catch(() => {});
  await new Promise(resolve => identityServer.close(resolve));
  if (admin) { try { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); } finally { await admin.end(); } }
  if (container) await run('docker', ['rm', '-f', container]).catch(() => {});
  rmSync(dataDir, { recursive: true, force: true });
}
