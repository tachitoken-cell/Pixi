import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { Wallet, ZeroHash, id, verifyTypedData } from 'ethers';
import { createGameServer } from '../server.mjs';
import { createAuctionChain, auctionInterface, legacyTokenAuctionInterface, erc20Interface, AUCTION_ORDER_TYPES } from '../src/auction-chain.mjs';
import { CHAPTERS } from '../src/content.ts';
import { GEAR, starterGear } from '../src/progression.ts';
import { bagCapacity, bagUsage } from '../src/bags.ts';
import { defaultHotbar } from '../src/spells.ts';
import { newContracts } from '../src/adventure.ts';
import { canTraverse, regionAt } from '../src/realm.ts';
import { MOSS_TOKEN, MOSS_AUCTION_DEV_TEAM, auctionListingsValid } from '../src/auction.ts';
import { AUCTIONEER } from '../src/city.ts';

const goldExchange = process.argv.includes('--gold');
const migration = process.argv.includes('--migration');
const currency = process.argv.includes('--moss') || goldExchange || migration ? 'moss' : 'eth', symbol = currency.toUpperCase();
const abi = currency === 'moss' ? legacyTokenAuctionInterface : auctionInterface;
const domainName = currency === 'moss' ? 'MossvaleTokenAuction' : 'MossvaleAuction';
// Real WebSockets, persistence, wallet signatures and order encoding. Chain snapshots alone are controlled.
const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-crypto-auction-')), file = join(dataDir, 'players.json'), clients = [];
const realNow = Date.now; let offset = 0, game, port, finalizedTime = Math.floor(realNow() / 1000), rpcUnavailable = false;
Date.now = () => realNow() + offset;
const authority = Wallet.createRandom(), wallets = [Wallet.createRandom(), Wallet.createRandom(), Wallet.createRandom()], contract = Wallet.createRandom().address, treasury = Wallet.createRandom().address;
const artifact = JSON.parse(readFileSync(new URL(`../public/contracts/${currency === 'moss' ? 'MossvaleTokenAuctionLegacy' : 'MossvaleAuction'}.json`, import.meta.url), 'utf8')), payments = new Map(), latestPayments = new Map(), canonicalBlocks = new Map();
const initialTime = finalizedTime;
const transactionReceipts = new Map();
function block(time) {
  const number = `0x${(65536 + time - initialTime).toString(16)}`;
  if (!canonicalBlocks.has(number)) canonicalBlocks.set(number, { hash: id(`block-${time}`), number, timestamp: `0x${time.toString(16)}` });
  return canonicalBlocks.get(number);
}
const paymentKey = order => migration ? `${order.contract.toLowerCase()}:${order.listingId}` : order.listingId;
function pay(order, finalized = true) { latestPayments.set(paymentKey(order), order.orderHash); if (finalized) payments.set(paymentKey(order), order.orderHash); }
function orphan(order) {
  const head = block(Math.floor(Date.now() / 1000));
  canonicalBlocks.set(head.number, { ...head, hash: id(`replacement-${head.hash}`) });
  latestPayments.delete(paymentKey(order));
}
const rpc = async (method, params) => {
  if (rpcUnavailable) throw Error('Controlled RPC outage');
  if (method === 'eth_chainId') return '0x1237';
  if (method === 'eth_getTransactionReceipt') return transactionReceipts.get(params[0]) || null;
  if (method === 'eth_getCode') return params[0].toLowerCase() === MOSS_TOKEN.address.toLowerCase() ? readFileSync(new URL('./fixtures/moss-token-runtime.hex', import.meta.url), 'utf8').trim()
    : migration && params[0].toLowerCase() === contract.toLowerCase() ? readFileSync(new URL('./fixtures/moss-auction-legacy-runtime.hex', import.meta.url), 'utf8').trim() : artifact.deployedBytecode;
  if (method === 'eth_getBlockByNumber') return params[0] === 'latest' ? block(Math.floor(Date.now() / 1000)) : params[0] === 'finalized' ? block(finalizedTime) : canonicalBlocks.get(params[0]) || null;
  if (method === 'eth_call' && params[0].to.toLowerCase() === MOSS_TOKEN.address.toLowerCase()) {
    const call = erc20Interface.parseTransaction({ data: params[0].data });
    return erc20Interface.encodeFunctionResult(call.name, [({ name: 'Mossvale', symbol: 'MOSS', decimals: 18, balanceOf: 10n ** 24n })[call.name]]);
  }
  if (method === 'eth_call') { const call = abi.parseTransaction({ data: params[0].data });
    const identity = { paymentToken: MOSS_TOKEN.address, authority: authority.address, treasury, TAX_BPS: 500, devTeam: MOSS_AUCTION_DEV_TEAM };
    return abi.encodeFunctionResult(call.name, [call.name in identity ? identity[call.name] : (params[1].blockHash === block(finalizedTime).hash ? payments : latestPayments).get(paymentKey({ contract: params[0].to, listingId: call.args[0] })) || ZeroHash]); }
  throw Error(`Unexpected RPC ${method}`);
};
const chain = createAuctionChain({ currency, contract, treasury, authorityKey: authority.privateKey, chainId: 4663, rpc });
let activeChain = chain;
const nearNpc = npc => Array.from({ length: 32 }, (_, index) => ({ x: npc.x + Math.cos(index * Math.PI / 16) * 1.2, z: npc.z + Math.sin(index * Math.PI / 16) * 1.2 })).find(point => canTraverse(point, npc));
const near = nearNpc(AUCTIONEER);
assert(near);
function hero(name) { const level = 75, maxHp = 100 + (level - 1) * 12; return {
  id: randomUUID(), name, ...near, zone: regionAt(near.x, near.z), coordinateVersion: 2, rotation: 0,
  appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
  characterCreated: true, talents: [], ...starterGear('Ranger'), hotbar: defaultHotbar('Ranger'), hp: maxHp, maxHp, level, xp: 0, gold: 1000,
  inventory: { wood: 30, crystal: 20, herb: 15, potion: 3, relic: 5 }, skills: { mining: 0, woodcutting: 0, herbalism: 0 }, craftingXp: 0, contracts: newContracts(),
  quest: { chapter: 0, stage: 0, kills: 0, crystals: 0, progress: Object.fromEntries(CHAPTERS[0].objectives.map(objective => [objective.id, 0])), completed: false, ending: null },
}; }
const heroes = [`${symbol} Seller`, `${symbol} Buyer`, `${symbol} Rival`].map(hero), tokens = heroes.map(() => randomBytes(32).toString('base64url'));
heroes[0].ownedGear.push('warden-longbow', 'briarwatch-weapon', 'ranger-mantle');
heroes[0].carriedItems = { 'greater-tonic': 2 };
heroes[1].ownedGear.push('ranger-head'); heroes[1].equipment.head = 'ranger-head';
for (const item of Object.values(GEAR)) if (bagUsage(heroes[1]) < 15 && item.id !== 'warden-longbow'
    && (!item.className || item.className === 'Ranger') && !heroes[1].ownedGear.includes(item.id)) heroes[1].ownedGear.push(item.id);
assert.equal(bagUsage(heroes[1]), 15, 'buyer has exactly one free slot before reserving another item');
const hash = value => createHash('sha256').update(value).digest('hex');
const stored = index => JSON.parse(readFileSync(file, 'utf8'))[hash(tokens[index])].characters[0];
async function until(predicate, label) { const end = realNow() + 12000; while (realNow() < end) { const result = predicate(); if (result) return result; await delay(20); } throw Error(`Timed out: ${label}`); }
async function advance(ms = 1000) { offset += ms; await delay(60); }
async function start() { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir, keycloak: null, databaseUrl: '', economyVersion: currency === 'moss' ? 1 : 0, goldExchangeEnabled: goldExchange, ...(currency === 'moss' ? { mossAuctionChain: activeChain } : { auctionChain: activeChain }) }); port = await game.start(); }
async function connect(index, openAuction = true) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), client = { socket, index, messages: [] }; clients.push(client);
  client.send = message => socket.send(JSON.stringify(message));
  client.player = () => client.snapshot?.players.find(player => player.id === heroes[index].id);
  socket.on('message', raw => { const message = JSON.parse(raw); client.messages.push(message); if (['snapshot', 'auction', 'auctionWalletChallenge', 'auctionPayment', 'trade'].includes(message.type)) client[message.type] = message; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  client.send({ type: 'join', token: tokens[index], characterId: heroes[index].id }); await until(() => client.player(), 'character present');
  if (openAuction) { client.send(request('auctionOpen')); await until(() => client.auction, 'auction open'); } return client;
}
const request = (type, extra = {}) => ({ type, npcId: AUCTIONEER.id, ...extra });
async function reject(client, message) { await advance(); const count = client.messages.length; client.send(message); const reply = await until(() => client.messages.slice(count).find(message => message.type === 'event' && message.kind === 'info'), `reject ${message.type}`); if (message.type.startsWith('auction')) assert.equal(reply.requestType, message.type, 'auction failures identify the rejected request'); else assert.match(reply.text, /awaiting payment verification/, 'item operation is rejected by provisional protection'); return reply; }
async function bind(client, wallet = wallets[client.index], { store = false, rejected = false, rejection = /pending|payments/ } = {}) {
  const prefix = store ? 'store' : 'auction', message = (type, extra) => store ? { type, ...extra } : request(type, extra);
  await advance(); const count = client.messages.length; client.send(message(`${prefix}WalletChallenge`, { wallet: wallet.address }));
  const challenge = await until(() => client.messages.slice(count).find(message => message.type === `${prefix}WalletChallenge`), 'wallet ownership challenge');
  assert.match(challenge.message, new RegExp(heroes[client.index].id));
  const signature = await wallet.signMessage(challenge.message), beforeBind = client.messages.length;
  client.send(message(`${prefix}WalletBind`, { signature }));
  const reply = await until(() => client.messages.slice(beforeBind).find(message => message.type === 'event' && message.kind === 'info' && (message.requestType === `${prefix}WalletBind` || !store && message.requestType === 'auction')
    || (store ? message.type === 'storeState' && message.state.wallet === wallet.address : message.type === 'auction' && message.wallet === wallet.address)), 'verified wallet persisted or rejected');
  if (rejected) { assert.equal(reply.type, 'event', 'rejected wallet changes cannot commit'); assert.match(reply.text, rejection); }
  else { assert.notEqual(reply.type, 'event', reply.text); assert.equal(stored(client.index).auctionWallet, wallet.address); }
  return signature;
}
async function list(client, resource = 'wood', quantity = 5) {
  await advance(); const before = new Set(client.auction.mine.map(listing => listing.id));
  client.send(request('auctionList', { item: typeof resource === 'string' ? { kind: 'resource', id: resource, quantity } : resource, currency, price: '0.01' }));
  return until(() => client.auction.mine.find(listing => !before.has(listing.id)), `${symbol} listing persisted`);
}
async function reserve(client, listing, expectedContract = contract) {
  await advance(); const count = client.messages.length; client.send(request('auctionBuy', { listingId: listing.id }));
  const message = await until(() => client.messages.slice(count).find(message => message.type === 'auctionPayment'), 'durable wallet payment order');
  const durable = stored(heroes.findIndex(player => player.id === listing.sellerId)).auctions.find(item => item.id === listing.id).reservation;
  assert.deepEqual(message.order, durable.order, 'wallet transaction is released only after reservation is saved');
  assert.equal(durable.buyerId, heroes[client.index].id);
  assert.equal(message.order.contract, expectedContract);
  assert.equal(verifyTypedData({ name: domainName, version: '1', chainId: 4663, verifyingContract: expectedContract }, AUCTION_ORDER_TYPES, message.order, message.order.signature), authority.address);
  await until(() => client.player().pendingAuctionPurchases?.some(row => row.id === listing.id), 'durable reservation appears in the buyer pending purchases');
  assert.deepEqual(client.player().pendingAuctionPurchases.filter(row => row.id === listing.id), [{ id: listing.id, item: listing.item, currency: listing.currency, price: listing.price, expiresAt: durable.expiresAt }], 'pending projection contains no order, wallet or signature');
  assert(client.snapshot.players.every(player => player.id === heroes[client.index].id || !Object.hasOwn(player, 'pendingAuctionPurchases')), 'other players never expose pending purchase details');
  assert.equal(stored(client.index).pendingAuctionPurchases, undefined, 'pending projection is reconstructed rather than saved as inventory');
  return message.order;
}
try {
  writeFileSync(file, JSON.stringify(Object.fromEntries(heroes.map((player, index) => [hash(tokens[index]), { characters: [player] }]))));
  await start(); let [seller, buyer, rival] = await Promise.all(heroes.map((_, index) => connect(index)));
  assert.equal((currency === 'moss' ? seller.auction.crypto.moss : seller.auction.crypto).enabled, true);
  if (currency === 'moss' && !migration) {
    assert.equal(seller.auction.crypto.moss.taxBps, 500, 'the server advertises the verified 5% MOSS tax');
    assert.equal(seller.auction.crypto.moss.treasury, treasury, 'the treasury share targets the configured treasury');
    assert.equal(seller.auction.crypto.moss.devTeam, MOSS_AUCTION_DEV_TEAM, 'the dev share targets the fixed dev team wallet');
    assert.equal(seller.auction.crypto.enabled, false, 'MOSS is enabled independently of native ETH');
    assert.equal(seller.auction.economyVersion, 1, 'MOSS item trades remain available in the current gold economy');
    assert.equal(seller.auction.goldExchangeEnabled, goldExchange, 'MOSS item trades do not require the Gold Exchange');
    const health = await fetch(`http://127.0.0.1:${port}/api/health`).then(response => response.json());
    assert.deepEqual(health.mossAuction, seller.auction.crypto.moss, 'public health reports the same verified MOSS readiness as the auction');
  }
  if (migration) {
    assert.equal(seller.auction.crypto.moss.taxBps, 0);
    await Promise.all([bind(seller), bind(buyer), bind(rival)]);
    const existing = await list(seller, 'wood', 1), finishing = await list(seller, 'crystal', 2), expiring = await list(seller, 'herb', 3);
    const expiringSaved = structuredClone(stored(0).auctions.find(row => row.id === expiring.id));
    const finishingOrder = await reserve(buyer, finishing), expiringOrder = await reserve(rival, expiring);
    const existingSaved = structuredClone(stored(0).auctions.find(row => row.id === existing.id));
    const replacementContract = Wallet.createRandom().address;
    const replacement = createAuctionChain({ currency, contract: replacementContract, treasury, authorityKey: authority.privateKey, chainId: 4663, rpc });
    const settlementChain = order => order.contract.toLowerCase() === contract.toLowerCase() ? chain : replacement;
    activeChain = { ...replacement,
      async status() { const [current, previous] = await Promise.all([replacement.status(), chain.status()]); return { ...current, ...(previous.enabled ? { previousContract: contract } : {}) }; },
      settlement: (order, now) => settlementChain(order).settlement(order, now),
      verifyPayment: (order, transactionHash, now) => settlementChain(order).verifyPayment(order, transactionHash, now),
    };
    await game.stop(); await start(); [seller, buyer, rival] = await Promise.all(heroes.map((_, index) => connect(index)));
    assert.equal(seller.auction.crypto.moss.contract, replacementContract); assert.equal(seller.auction.crypto.moss.previousContract, contract);
    assert.deepEqual(stored(0).auctions.find(row => row.id === existing.id), existingSaved, 'existing unreserved listing survives cutover unchanged');
    const currentOrder = await reserve(buyer, existing, replacementContract);
    assert.equal(erc20Interface.decodeFunctionData('approve', currentOrder.approval.data)[0], replacementContract, 'existing listing gets a new-contract approval without relisting');
    const beforeResume = buyer.messages.length;
    assert.match((await reject(buyer, request('auctionBuy', { listingId: finishing.id }))).text, /unavailable for this order/);
    assert(!buyer.messages.slice(beforeResume).some(message => message.type === 'auctionPayment'), 'old unpaid signature is not reissued after cutover');
    await reject(seller, request('auctionCancel', { listingId: expiring.id }));
    await reject(buyer, request('auctionBuy', { listingId: expiring.id }));
    assert.deepEqual(stored(0).auctions.find(row => row.id === finishing.id).reservation.order, finishingOrder);
    assert.deepEqual(stored(0).auctions.find(row => row.id === expiring.id).reservation.order, expiringOrder, 'old signed order remains exact while payable');
    pay(finishingOrder); pay(currentOrder); await advance(6000);
    await until(() => !stored(0).auctions.some(row => [finishing.id, existing.id].includes(row.id)), 'paid old and current listings both settle');
    assert.equal(stored(1).inventory.crystal, 22); assert.equal(stored(1).inventory.wood, 31);
    await advance((expiringOrder.deadline + 1) * 1000 - Date.now() + 1000);
    assert.deepEqual(stored(0).auctions.find(row => row.id === expiring.id).reservation.order, expiringOrder, 'wall-clock expiry alone cannot migrate a payable signature');
    finalizedTime = expiringOrder.deadline + 1; await advance(6000);
    await until(() => !stored(0).auctions.find(row => row.id === expiring.id).reservation, 'canonical finalized unpaid expiry releases the original reservation');
    const released = stored(0).auctions.find(row => row.id === expiring.id);
    assert.deepEqual(released, expiringSaved, 'same listing and escrow survive finalized expiry');
    const requoted = await reserve(rival, released, replacementContract);
    assert.equal(requoted.listingId, expiringOrder.listingId); assert.notEqual(requoted.orderHash, expiringOrder.orderHash, 'same listing receives a new domain-bound quote only after old expiry');
    pay(requoted); await advance(6000); await until(() => !stored(0).auctions.length, 'migrated listing settles once');
    assert.equal(stored(2).inventory.herb, 18); assert.equal(stored(0).inventory.herb, 12);
    assert.equal((await chain.settlement(expiringOrder)).state, 'expired', 'payment to the new contract never revives the expired original authorization');
    await game.stop(); await start(); [seller, buyer, rival] = await Promise.all(heroes.map((_, index) => connect(index)));
    assert.equal(stored(2).inventory.herb, 18); assert.equal(stored(0).auctionSales.length, 3, 'restart cannot duplicate any pre-cutover or migrated sale');
    console.log('MOSS listing migration: unchanged existing listing quotes current contract, original signed orders stay locked and settle at original contract or finalized expiry, same listing re-quotes only after expiry, and restart preserves exactly-once delivery. No tokens sent.');
  } else if (goldExchange) {
    await Promise.all([bind(seller), bind(buyer), bind(rival)]);
    const gold = quantity => ({ kind: 'gold', id: 'gold', quantity });
    const supply = () => heroes.reduce((sum, _, index) => sum + stored(index).gold + stored(index).auctions.filter(row => row.item.kind === 'gold').reduce((sum, row) => sum + row.item.quantity, 0), 0);
    const initialSupply = supply();
    for (const item of [gold(199), gold(1000000001), gold(200.5), {...gold(200),id:'wood'}, {...gold(200),extra:true}]) await reject(seller, request('auctionList', { item, currency, price: '1' }));
    for (const unsupported of ['gold', 'eth']) await reject(seller, request('auctionList', { item:gold(200), currency:unsupported, price:'1' }));
    await reject(seller, request('auctionList', { item:{kind:'resource',id:'wood',quantity:1},currency:'eth',price:'1' }));
    let cancelled=await list(seller,gold(201));
    assert.equal(cancelled.goldFee,2);assert.equal(stored(0).gold,799);assert.equal(supply(),initialSupply,'listing only transfers gold into escrow');
    seller.send(request('auctionCancel',{listingId:cancelled.id}));await until(()=>stored(0).gold===1000,'cancellation returns all gold');
    assert.equal(supply(),initialSupply);
    const listing=await list(seller,gold(201)),order=await reserve(buyer,listing);
    await reject(seller,request('auctionList',{item:gold(800),currency,price:'1'}));
    await reject(rival,request('auctionBuy',{listingId:listing.id}));await reject(seller,request('auctionCancel',{listingId:listing.id}));
    await game.stop();
    const legacyGoldSave=JSON.parse(readFileSync(file,'utf8')),legacyGoldReservation=legacyGoldSave[hash(tokens[0])].characters[0].auctions.find(row=>row.id===listing.id).reservation;
    const legacyGoldBlock=block(Math.floor(Date.now()/1000));
    legacyGoldReservation.processed=true;legacyGoldReservation.order.paymentBlock={hash:legacyGoldBlock.hash,number:legacyGoldBlock.number};
    writeFileSync(file,JSON.stringify(legacyGoldSave));rpcUnavailable=true;
    await start();[seller,buyer,rival]=await Promise.all(heroes.map((_,index)=>connect(index)));
    assert.equal(buyer.player().pendingAuctionPurchases[0]?.id,listing.id,'legacy processed gold remains a pending preview until credited');
    assert.equal(buyer.player().gold,1000,'legacy processed gold is not credited by its preview');
    rpcUnavailable=false;pay(order,false);await advance(6000);
    await until(()=>!stored(0).auctions.some(row=>row.id===listing.id),'processed gold settles without finality');
    await until(()=>buyer.player().pendingAuctionPurchases.length===0,'credited legacy gold removes its pending preview');
    assert.equal(stored(1).gold,1199,'processed payment grants spendable gold');assert.equal(supply(),initialSupply-2);
    assert.equal(stored(0).auctionSales[0].goldFee,2);assert(auctionListingsValid(stored(0)));
    assert.equal(payments.has(paymentKey(order)),false,'no finalized payment was used');
    await reject(buyer,request('auctionBuy',{listingId:listing.id}));
    rpcUnavailable=true;await advance(6000);assert.equal(stored(1).gold,1199);rpcUnavailable=false;
    orphan(order);await advance(6000);assert.equal(stored(1).gold,1199,'completed processed sales accept later chain reversal risk');
    pay(order,false);await advance(6000);assert.equal(stored(1).gold,1199,'reinclusion never repeats a credit');
    await game.stop();await start();[seller,buyer,rival]=await Promise.all(heroes.map((_,index)=>connect(index)));
    assert.equal(stored(1).gold,1199,'restart never repeats a credit');
    const failed=await list(seller,gold(200)),failedOrder=await reserve(buyer,failed);mkdirSync(`${file}.tmp`);pay(failedOrder);await advance(6000);await delay(150);
    assert(stored(0).auctions.some(row=>row.id===failed.id),'failed durable write retains escrow');assert.equal(stored(1).gold,1199);
    rmSync(`${file}.tmp`,{recursive:true});await advance(6000);await until(()=>!stored(0).auctions.some(row=>row.id===failed.id),'paid escrow recovers after storage failure');assert.equal(stored(1).gold,1398);
    const beforeItems=supply(),count=seller.auction.mine.length;
    seller.send(request('auctionList',{item:{kind:'resource',id:'wood',quantity:1},currency:'gold',price:'21'}));
    const itemListing=await until(()=>seller.auction.mine.find(row=>row.currency==='gold'),'new item listing');assert.equal(itemListing.goldFee,2);
    const beforeSeller=stored(0).gold,beforeBuyer=stored(1).gold;buyer.send(request('auctionBuy',{listingId:itemListing.id}));
    await until(()=>!stored(0).auctions.some(row=>row.id===itemListing.id),'gold item sale');assert.equal(stored(0).gold,beforeSeller+19);assert.equal(stored(1).gold,beforeBuyer-21);assert.equal(supply(),beforeItems-2);
    const expiring=await list(seller,gold(200)),unpaid=await reserve(rival,expiring);finalizedTime=unpaid.deadline+1;await advance(360000);
    await until(()=>!stored(0).auctions.find(row=>row.id===expiring.id)?.reservation,'finalized unpaid expiry releases reservation');
    seller.send(request('auctionCancel',{listingId:expiring.id}));await until(()=>!stored(0).auctions.length,'expired lot returns intact');
    console.log('Gold Exchange: bounds/currencies, escrow/refund conservation, double spending, buyer contention, processed spendable gold, no repeat wallet payment, RPC/reorg/reinclusion idempotency, immediate delivery, restart idempotency, save failure/recovery, exact 0.5% exchange and 5% item fees, and finalized unpaid expiry passed.');
  } else {
  await reject(seller, request('auctionList', { item: { kind: 'resource', id: 'wood', quantity: 1 }, currency, price: '0.01' }));
  assert.equal(stored(0).inventory.wood, 30, 'unlinked wallet cannot escrow a crypto listing');
  const signed = await bind(seller); await reject(seller, request('auctionWalletBind', { signature: signed }));
  await Promise.all([bind(buyer), bind(rival)]);
  assert.equal(seller.player().auctionWallet, undefined, 'wallet not broadcast in world snapshots');
  const replacementWallet = Wallet.createRandom(), listedWithA = await list(seller, 'relic', 1), originalListing = structuredClone(stored(0).auctions[0]);
  await advance(); seller.send(request('auctionList', { item: { kind: 'resource', id: 'potion', quantity: 1 }, currency: 'gold', price: '1' }));
  const goldListing = await until(() => stored(0).auctions.find(row => row.currency === 'gold'), 'gold listing for migration isolation');
  await reject(seller, request('auctionWalletBind', { signature: '0x00' }));
  assert.deepEqual(stored(0).auctions, [originalListing, goldListing], 'invalid ownership proof cannot change listing recipients');
  await delay(1200); mkdirSync(`${file}.tmp`);
  try { await bind(seller, replacementWallet, { rejected: true, rejection: /could not be saved/ }); }
  finally { rmSync(`${file}.tmp`, { recursive: true }); }
  assert.equal(stored(0).auctionWallet, wallets[0].address, 'a failed wallet migration leaves the old wallet');
  assert.deepEqual(stored(0).auctions, [originalListing, goldListing], 'a failed save leaves every listing untouched');
  await bind(seller, replacementWallet);
  assert.deepEqual(stored(0).auctions.find(row => row.id === listedWithA.id), { ...originalListing, sellerWallet: replacementWallet.address }, 'wallet migration changes only the unreserved crypto payout address');
  assert.deepEqual(stored(0).auctions.find(row => row.id === goldListing.id), goldListing, 'gold listings are not migrated');
  const listedWithB = await list(seller, 'relic', 1);
  assert.equal(stored(0).auctions.find(row => row.id === listedWithB.id).sellerWallet, replacementWallet.address, 'new listings use the newly verified wallet');
  await bind(seller, wallets[0], { store: true });
  assert.deepEqual(stored(0).auctions.find(row => row.id === listedWithA.id), originalListing, 'store and NFT linking migrate existing listings to the proven wallet');
  assert.equal(stored(0).auctions.find(row => row.id === listedWithB.id).sellerWallet, wallets[0].address);
  await bind(seller, replacementWallet);
  const rivalListing = await list(rival, 'relic', 1), ownPurchase = await reserve(seller, rivalListing);
  assert.equal(ownPurchase.buyer, replacementWallet.address, 'owning ordinary listings does not block buying from the new wallet');
  for (const store of [false, true]) {
    await bind(seller, wallets[0], { store, rejected: true });
    await bind(rival, replacementWallet, { store, rejected: true });
  }
  assert.equal(stored(0).auctionWallet, replacementWallet.address, 'buyer reservation keeps its verified wallet');
  assert.equal(stored(2).auctionWallet, wallets[2].address, 'reserved seller keeps its verified wallet');
  const migratedOrder = await reserve(buyer, listedWithA), signedSellerListing = structuredClone(stored(0).auctions.find(row => row.id === listedWithA.id));
  assert.equal(migratedOrder.seller, replacementWallet.address, 'a purchase of a migrated listing signs its new recipient');
  const rivalStaleListing = await list(rival, 'relic', 1), signedRivalListing = structuredClone(stored(2).auctions.find(row => row.id === rivalListing.id));
  await game.stop();
  const caseSave = JSON.parse(readFileSync(file, 'utf8'));
  for (const [index, stale] of [[0, listedWithB], [2, rivalStaleListing]]) {
    const character = caseSave[hash(tokens[index])].characters[0];
    character.auctionWallet = character.auctionWallet.toLowerCase();
    character.auctions.find(row => row.id === stale.id).sellerWallet = wallets[0].address;
  }
  writeFileSync(file, JSON.stringify(caseSave));
  await start(); [seller, buyer, rival] = await Promise.all(heroes.map((_, index) => connect(index)));
  await bind(seller, replacementWallet);
  await bind(rival, wallets[2], { store: true });
  assert.equal(stored(0).auctions.find(row => row.id === listedWithB.id).sellerWallet, replacementWallet.address, 'same-wallet auction reproof migrates a stale unreserved recipient');
  assert.equal(stored(2).auctions.find(row => row.id === rivalStaleListing.id).sellerWallet, wallets[2].address, 'same-wallet store reproof migrates a stale unreserved recipient');
  assert.deepEqual(stored(0).auctions.find(row => row.id === listedWithA.id), signedSellerListing, 'auction reproof leaves signed seller terms byte-for-byte unchanged');
  assert.deepEqual(stored(2).auctions.find(row => row.id === rivalListing.id), signedRivalListing, 'store reproof leaves signed seller terms byte-for-byte unchanged');
  finalizedTime = Math.max(ownPurchase.deadline, migratedOrder.deadline) + 1; await advance(360000); await advance(6000);
  await until(() => [stored(0), stored(2)].every(player => player.auctions.every(row => !row.reservation)), 'unpaid purchases expire by finalized chain time');
  for (const [client, row] of [[seller, listedWithA], [seller, listedWithB], [seller, goldListing], [rival, rivalListing], [rival, rivalStaleListing]]) {
    await advance(); client.send(request('auctionCancel', { listingId: row.id }));
    await until(() => !stored(client.index).auctions.some(listing => listing.id === row.id), 'wallet regression escrow cleanup');
  }
  assert.equal(stored(0).inventory.relic, 5); assert.equal(stored(0).inventory.potion, 3); assert.equal(stored(2).inventory.relic, 5);
  await bind(seller);
  const listing = await list(seller), order = await reserve(buyer, listing);
  assert.equal(listing.goldFee, undefined, 'crypto item listings never charge a gold sale fee');
  assert.equal(stored(0).inventory.wood, 25); assert.equal(stored(1).inventory.wood, 30); assert.equal(order.priceWei, '10000000000000000');
  assert.equal(buyer.player().inventory.wood, 30, 'pending purchase never increases spendable inventory');
  if (currency === 'moss') {
    assert.equal(order.token, MOSS_TOKEN.address); assert.equal(order.transaction.value, '0x0');
    assert.equal(erc20Interface.decodeFunctionData('approve', order.approval.data)[1].toString(), order.priceWei);
    const malformed = structuredClone(stored(0)); malformed.auctions[0].reservation.order.token = 123;
    assert.equal(auctionListingsValid(malformed), false, 'malformed token rejects without throwing');
  }
  assert.equal(order.buyer, wallets[1].address); assert.equal(order.seller, wallets[0].address);
  assert(!seller.auction.listings[0].reservation.order, 'payment signature is private to the reserved buyer');
  await reject(rival, request('auctionBuy', { listingId: listing.id }));
  await reject(seller, request('auctionCancel', { listingId: listing.id }));
  const replay = await reserve(buyer, listing); assert.equal(replay.orderHash, order.orderHash, 'reopen returns the same order');
  await game.stop(); await start(); [seller, buyer, rival] = await Promise.all(heroes.map((_, index) => connect(index)));
  assert.equal(buyer.player().pendingAuctionPurchases[0]?.id, listing.id, 'reconnect reconstructs pending purchases before reopening checkout');
  assert.equal((await reserve(buyer, listing)).orderHash, order.orderHash, 'restart preserves and resumes the exact signed reservation');
  buyer.socket.terminate(); await delay(60);
  pay(order, false); await advance(6000);
  await until(() => !stored(0).auctions.some(item => item.id === listing.id), 'processed payment completes an offline delivery before finality');
  assert.equal(stored(1).inventory.wood, 35);
  assert.equal(payments.has(paymentKey(order)), false, 'the payment has not reached finalized state');
  assert.equal(auctionListingsValid(stored(0)), true);
  assert.equal(stored(0).auctionSales.length, 1, 'processed payment completes the sale immediately');
  buyer = await connect(1);
  assert.deepEqual(buyer.player().pendingAuctionPurchases, [], 'confirmed delivery removes the pending preview on reconnect');
  assert(buyer.snapshot.players.every(player => !Object.hasOwn(player, 'auctionSales')), 'crypto sale history stays private in world snapshots');
  const resale = await list(buyer, 'wood', 35);
  assert.equal(stored(1).inventory.wood, 0, 'all purchased materials can be resold before chain finality');
  buyer.send(request('auctionCancel', { listingId: resale.id }));
  await until(() => stored(1).inventory.wood === 35, 'resale cancellation returns the exact stack');
  rpcUnavailable = true; await advance(6000); await delay(150);
  assert.equal(stored(1).inventory.wood, 35, 'RPC outage cannot duplicate or erase completed delivery');
  rpcUnavailable = false; orphan(order); await advance(6000);
  assert.equal(stored(1).inventory.wood, 35, 'completed processed delivery accepts later chain reversal risk');
  pay(order, false); await advance(6000);
  assert.equal(stored(1).inventory.wood, 35, 'reinclusion does not grant a second delivery');
  assert.equal(stored(0).gold, 1000); assert.equal(stored(1).gold, 1000);
  const firstSale = stored(0).auctionSales[0];
  assert.deepEqual(firstSale, { id: listing.id, item: listing.item, currency, price: listing.price, buyerName: heroes[1].name, soldAt: firstSale.soldAt });
  assert(Number.isSafeInteger(firstSale.soldAt) && firstSale.soldAt >= listing.createdAt && firstSale.soldAt <= Date.now());
  await until(() => seller.auction.sold[0]?.id === listing.id, 'processed payment updates the Sold tab');
  assert.deepEqual(seller.auction.sold, [firstSale], 'processed payment enters the seller Sold tab once');
  assert.deepEqual(stored(1).auctionSales, [], 'buying does not create seller history');
  await game.stop(); await start(); [seller, buyer, rival] = await Promise.all(heroes.map((_, index) => connect(index)));
  assert.equal(stored(1).inventory.wood, 35, 'restart never delivers a payment twice');
  await advance(6000);
  assert.deepEqual(stored(0).auctionSales, [firstSale], 'restart and repeated settlement do not duplicate finalized history');
  assert.deepEqual(seller.auction.sold, [firstSale]); assert.deepEqual(buyer.auction.sold, []);
  const expiring = await list(seller, 'crystal', 2), unpaid = await reserve(buyer, expiring);
  await advance(360000);
  assert(buyer.player().pendingAuctionPurchases.some(row => row.id === expiring.id), 'wall-clock expiry alone does not remove the unpaid preview');
  finalizedTime = unpaid.deadline + 1;
  await advance(6000); await until(() => !stored(0).auctions[0].reservation, 'finalized unpaid expiry releases reservation');
  await until(() => !buyer.player().pendingAuctionPurchases.some(row => row.id === expiring.id), 'confirmed unpaid expiry removes the pending preview');
  seller.send(request('auctionCancel', { listingId: expiring.id })); await until(() => stored(0).auctions.length === 0, 'cancel returns finalized-unpaid escrow');
  assert.equal(stored(0).inventory.crystal, 20); assert.equal(stored(1).inventory.crystal, 20);
  assert.deepEqual(stored(0).auctionSales, [firstSale], 'unpaid expiry and cancellation do not produce a sale');
  const retryListing = await list(seller, 'herb', 3), retryOrder = await reserve(buyer, retryListing);
  await delay(1200); mkdirSync(`${file}.tmp`); pay(retryOrder);
  await advance(6000); await delay(600);
  assert(stored(0).auctions[0].reservation, 'failed save keeps the paid item in escrow'); assert.equal(stored(1).inventory.herb, 15);
  assert(buyer.player().pendingAuctionPurchases.some(row => row.id === retryListing.id), 'failed delivery save preserves the pending preview without granting inventory');
  assert.deepEqual(stored(0).auctionSales, [firstSale], 'failed finalized delivery cannot commit history alone');
  rmSync(`${file}.tmp`, { recursive: true });
  await advance(6000); await until(() => stored(0).auctions.length === 0, 'payment settlement retries after storage recovers');
  assert.equal(stored(1).inventory.herb, 18); assert.equal(stored(0).inventory.herb, 12);
  await until(() => !buyer.player().pendingAuctionPurchases.some(row => row.id === retryListing.id), 'successful delivery retry removes exactly its pending preview');
  assert.deepEqual(stored(0).auctionSales.map(sale => sale.id), [retryListing.id, listing.id], 'successful settlement retry writes one sale');
  const outage = await list(seller, 'relic', 1), outageOrder = await reserve(buyer, outage);
  rpcUnavailable = true; await advance(360000); await delay(300);
  assert(stored(0).auctions[0].reservation, 'RPC outage never releases a signed order');
  rpcUnavailable = false; finalizedTime = outageOrder.deadline + 1; await advance(6000);
  await until(() => !stored(0).auctions[0].reservation, 'reservation resolves after finality recovers');
  const capacityListing = await list(seller, { kind: 'gear', id: 'warden-longbow', quantity: 1 });
  const capacityOrder = await reserve(buyer, capacityListing), balances = [stored(0).gold, stored(1).gold];
  buyer.send({ type: 'unequipGear', slot: 'head' });
  await until(() => stored(1).equipment.head === null, 'buyer fills the last slot after signing the payment order');
  assert.equal(bagUsage(stored(1)), bagCapacity(stored(1)));
  pay(capacityOrder, false); await advance(6000);
  await until(() => buyer.auction.reason?.includes('Payment confirmed. Make room'), 'processed payment reports full bags');
  assert(!stored(0).auctions.find(listing => listing.id === capacityListing.id).reservation.delivered, 'full bags do not record an undelivered provisional grant');
  assert(!stored(1).ownedGear.includes('warden-longbow'));
  pay(capacityOrder); finalizedTime = Math.floor(Date.now() / 1000);
  await advance(6000);
  await until(() => buyer.auction.reason?.includes('Payment confirmed. Make room'), 'finalized payment reports full bags');
  assert(stored(0).auctions.find(listing => listing.id === capacityListing.id)?.reservation, 'paid item remains in durable escrow while bags are full');
  assert(!stored(0).ownedGear.includes('warden-longbow') && !stored(1).ownedGear.includes('warden-longbow'), 'neither seller nor full buyer receives the reserved item prematurely');
  const checkStart = buyer.messages.length;
  buyer.send(request('auctionPaymentCheck', { listingId: capacityListing.id }));
  await until(() => buyer.messages.slice(checkStart).some(message => message.type === 'auction'), 'explicit paid-item status check');
  await delay(150);
  assert.match(buyer.auction.reason, /Payment confirmed\. Make room/, 'explicit status cannot overwrite the full-bag reason with pending finality');
  await game.stop(); await start(); [seller, buyer, rival] = await Promise.all(heroes.map((_, index) => connect(index)));
  assert.equal(stored(0).auctions.find(listing => listing.id === capacityListing.id)?.reservation.order.orderHash, capacityOrder.orderHash, 'restart preserves a paid order blocked by full bags');
  buyer.send({ type: 'equipGear', itemId: 'ranger-head' });
  await until(() => buyer.player().equipment.head === 'ranger-head', 'buyer frees space by re-equipping headgear');
  await advance(6000);
  await until(() => !stored(0).auctions.some(listing => listing.id === capacityListing.id), 'paid delivery retries when space becomes available');
  assert.equal(stored(1).ownedGear.filter(item => item === 'warden-longbow').length, 1);
  assert.equal(bagUsage(stored(1)), bagCapacity(stored(1)), 'delivery fills exactly the newly available slot');
  assert.deepEqual([stored(0).gold, stored(1).gold], balances, 'crypto item delivery never moves in-game gold');
  await reject(buyer, request('auctionPaymentCheck', { listingId: capacityListing.id }));
  await game.stop(); await start(); [seller, buyer, rival] = await Promise.all(heroes.map((_, index) => connect(index)));
  assert.equal(stored(1).ownedGear.filter(item => item === 'warden-longbow').length, 1, 'replay and restart cannot deliver the paid item twice');
  const equipmentSales = [];
  for (const itemId of ['briarwatch-weapon', 'ranger-mantle']) {
    const gearListing = await list(seller, { kind: 'gear', id: itemId, quantity: 1 }), gearOrder = await reserve(rival, gearListing);
    pay(gearOrder, false); await advance(6000);
    await until(() => !stored(0).auctions.some(row => row.id === gearListing.id), 'processed equipment completes before finality');
    equipmentSales.unshift(gearListing.id);
    rival.send({ type: 'equipGear', itemId });
    const slot = GEAR[itemId].slot;
    await until(() => stored(2).equipment[slot] === itemId, 'processed equipment can be equipped');
    orphan(gearOrder); await advance(6000);
    assert.equal(stored(2).equipment[slot], itemId, 'completed sale does not roll back usable gear after a chain reversal');
    pay(gearOrder, false); await advance(6000);
    assert.equal(stored(2).ownedGear.filter(id => id === itemId).length, 1, 'reinclusion does not duplicate gear');
    await game.stop(); await start(); [seller, buyer, rival] = await Promise.all(heroes.map((_, index) => connect(index)));
    assert.equal(stored(2).equipment[slot], itemId, 'processed equipment survives strict save validation');
  }
  const tonicListing = await list(seller, { kind: 'item', id: 'greater-tonic', quantity: 1 }), tonicOrder = await reserve(rival, tonicListing);
  pay(tonicOrder, false); await advance(6000);
  await until(() => !stored(0).auctions.some(row => row.id === tonicListing.id), 'processed consumable completes immediately');
  assert.equal(stored(2).carriedItems['greater-tonic'], 1);
  await game.stop(); const save = JSON.parse(readFileSync(file, 'utf8'));
  save[hash(tokens[2])].characters[0].hp = 1;
  writeFileSync(file, JSON.stringify(save));
  await start(); [seller, buyer, rival] = await Promise.all(heroes.map((_, index) => connect(index)));
  rival.send({ type: 'useItem', itemId: 'greater-tonic' });
  await until(() => !stored(2).carriedItems['greater-tonic'], 'processed consumable can be used before finality');
  assert(rival.player().hp > 1, 'processed consumption heals');
  assert.deepEqual(stored(0).auctionSales.map(sale => sale.id), [tonicListing.id, ...equipmentSales, capacityListing.id, retryListing.id, listing.id], 'completed crypto sales remain newest first');
  const legacyListing = await list(seller, 'wood', 1), legacyOrder = await reserve(buyer, legacyListing);
  await game.stop();
  const legacySave = JSON.parse(readFileSync(file, 'utf8')), anchor = block(Math.floor(Date.now() / 1000));
  const legacyReservation = legacySave[hash(tokens[0])].characters[0].auctions.find(row => row.id === legacyListing.id).reservation;
  legacyReservation.delivered = true; legacyReservation.order.paymentBlock = { hash: anchor.hash, number: anchor.number };
  legacySave[hash(tokens[1])].characters[0].inventory.wood += 1;
  writeFileSync(file, JSON.stringify(legacySave)); pay(legacyOrder, false);
  await start(); [seller, buyer, rival] = await Promise.all(heroes.map((_, index) => connect(index)));
  await advance(6000); await until(() => !stored(0).auctions.some(row => row.id === legacyListing.id), 'saved provisional delivery completes on current canonical payment');
  assert.equal(stored(1).inventory.wood, 36, 'upgrading an old processed save never delivers its item twice');
  assert.equal(stored(0).auctionSales.filter(row => row.id === legacyListing.id).length, 1);
  for (const heldHash of [false, true]) {
    const racingListing = await list(seller, 'wood', 1), racingOrder = await reserve(buyer, racingListing), beforeRacingWood = stored(1).inventory.wood;
    const originalSettlement = chain.settlement, originalVerification = chain.verifyPayment, racingHash = id(`wallet-success-during-auction-${heldHash ? 'hash-check' : 'poll'}`);
    let releasePoll, releaseVerification, polling = false, verifications = 0;
    chain.settlement = async (...args) => {
      const result = await originalSettlement.apply(chain, args);
      if (args[0].listingId === racingOrder.listingId && !polling) { polling = true; await new Promise(resolve => { releasePoll = resolve; }); }
      return result;
    };
    chain.verifyPayment = async (...args) => {
      verifications++; assert.equal(args[1], racingHash);
      if (polling) await new Promise(resolve => { releaseVerification = resolve; });
      return originalVerification.apply(chain, args);
    };
    try {
      if (heldHash) buyer.send(request('auctionPaymentCheck', { listingId: racingListing.id, transactionHash: racingHash }));
      else await advance(6000);
      await until(() => polling, 'existing verification holds an unpaid result');
      pay(racingOrder, false);
      const included = block(Math.floor(Date.now() / 1000));
      transactionReceipts.set(racingHash, { status: '0x1', from: racingOrder.buyer, to: racingOrder.contract, transactionHash: racingHash,
        blockNumber: included.number, blockHash: included.hash, logs: [{ address: racingOrder.contract,
          ...abi.encodeEventLog(abi.getEvent('Purchased'), [racingOrder.listingId, racingOrder.orderHash, racingOrder.buyer, racingOrder.seller, BigInt(racingOrder.priceWei)]) }] });
      const beforeCheck = buyer.messages.length;
      buyer.send(request('auctionPaymentCheck', { listingId: racingListing.id, transactionHash: racingHash }));
      await until(() => buyer.messages.slice(beforeCheck).some(message => message.type === 'auction'), 'wallet success reaches the held settlement');
      const expectedVerifications = heldHash ? 2 : 1;
      releasePoll(); await until(() => verifications === expectedVerifications, 'wallet success schedules verification immediately after the old check');
      buyer.send(request('auctionPaymentCheck', { listingId: racingListing.id, transactionHash: racingHash }));
      await delay(60); assert.equal(verifications, expectedVerifications, 'duplicate hashes do not create concurrent verification');
      releaseVerification();
      await until(() => !stored(0).auctions.some(row => row.id === racingListing.id), 'queued success delivers without another five-second poll');
      await until(() => !buyer.player().pendingAuctionPurchases.some(row => row.id === racingListing.id), 'racing success replaces the pending preview');
      assert.equal(stored(1).inventory.wood, beforeRacingWood + 1);
      await advance(6000); assert.equal(verifications, expectedVerifications, 'success recheck is bounded and cannot form a polling loop');
    } finally { releasePoll?.(); releaseVerification?.(); chain.settlement = originalSettlement; chain.verifyPayment = originalVerification; }
  }
  const slow = await list(seller, 'wood', 1), prepareOrder = chain.prepareOrder;
  let release, preparing = false;
  chain.prepareOrder = async input => { preparing = true; await new Promise(resolve => { release = resolve; }); return prepareOrder.call(chain, input); };
  buyer.send(request('auctionBuy', { listingId: slow.id })); await until(() => preparing, 'purchase awaits chain signing');
  const duringSigning = buyer.messages.length; buyer.send({ type: 'cancelGather' });
  await delay(100);
  assert(!buyer.player().pendingAuctionPurchases.some(row=>row.id===slow.id),'unsigned and unsaved purchase is not projected as pending');
  assert(!buyer.messages.slice(duringSigning).some(message => message.type === 'event' && message.text.startsWith('Saving your changes')), 'incidental cancellation is silent during order signing');
  buyer.send({ type: 'equipGear', itemId: 'ranger-head' });
  const notice = await until(() => buyer.messages.slice(duringSigning).find(message => message.type === 'event' && message.text.startsWith('Saving your changes')), 'explicit action while order signing is pending');
  assert.equal(notice.requestType, 'equipGear', 'busy replies never impersonate an auction rejection');
  await game.stop(); const stoppedState = readFileSync(file, 'utf8'); release(); await delay(250);
  assert.equal(readFileSync(file, 'utf8'), stoppedState, 'delayed order signing cannot write after shutdown');
  assert(!stored(0).auctions.find(listing => listing.id === slow.id).reservation, 'unexposed order does not become a persisted reservation after shutdown');
  chain.prepareOrder = prepareOrder;
  console.log(`Configured ${symbol} auction server: real wallet proof, atomic verified-wallet listing migration with unchanged signed orders, reserved-payment wallet locks, signed durable escrow, buyer contention, processed completion/restart/outage/reorg/reinclusion idempotency, immediate resale/consumption, equipment retention, finalized expiry, offline delivery, paid full-bag escrow/status/retry, restart idempotency, storage failure, durable private processed Sold history and RPC recovery passed. Chain finality was simulated; no tokens or ETH sent.`);
  }
} finally {
  rmSync(`${file}.tmp`, { recursive: true, force: true });
  for (const client of clients) client.socket.terminate(); if (game) await game.stop(); Date.now = realNow; rmSync(dataDir, { recursive: true, force: true });
}
