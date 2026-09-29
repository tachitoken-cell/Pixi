import { bagUsage, bagCapacity } from '../src/bags.ts';
import { LOOT_ITEMS } from '../src/loot-items.ts';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { Wallet, id } from 'ethers';
import { createGameServer } from '../server.mjs';
import { MOSS_TOKEN } from '../src/auction.ts';
import { STORE_PRODUCTS, storePlayerValid, storeRepeatable, storeBoostMultiplier } from '../src/ingame-store.ts';
import { playerTitle } from '../src/titles.ts';
import { starterGear } from '../src/progression.ts';
import { spellsForClass } from '../src/spells.ts';

// Real sockets, account ownership, signatures and disk persistence; only chain state and pricing are controlled.
const dir = mkdtempSync(join(tmpdir(), 'mossvale-store-consumables-')), file = join(dir, 'players.json'), clients = [];
const realNow = Date.now; let clock = realNow(), game, port, unavailable = false, expired = false, releasePrepare, prepareCalls = 0;
Date.now = () => clock;
const hash = value => createHash('sha256').update(value).digest('hex');
const tokens = [randomBytes(32).toString('base64url'), randomBytes(32).toString('base64url')], wallet = Wallet.createRandom(), contract = Wallet.createRandom().address;
// Legacy processed fixtures retain migration/reorg coverage; current canonical inclusion returns paid.
const paid = new Set(), latestPaid = new Set(), processed = new Set(), revoked = new Set(), reanchored = new Set();
const appearance = { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' };
const heroes = ['Store adventurer', 'Store rival'].map(name => ({ id: randomUUID(), name, appearance, x: 0, z: 8, zone: 'greenwood', coordinateVersion: 2, rotation: 0,
  characterCreated: true, ...starterGear('Ranger'), talents: [], level: 10, hp: 100, maxHp: 208, xp: 35, gold: 500,
  inventory: { wood: 0, crystal: 0, herb: 0, potion: 3, relic: 0 }, learnedSpells: spellsForClass('Ranger').filter(spell => spell.requiredLevel <= 10).map(spell => spell.id), ridingRank: 0, ownedMounts: [], quest: { stage: 0, kills: 0, crystals: 0 } }));
const storeChain = {
  async status() { return { enabled: !unavailable, chainId: 4663, token: MOSS_TOKEN.address, contract, ...(unavailable ? { reason: 'Controlled RPC outage' } : {}) }; },
  async prepareOrder(input) {
    prepareCalls++;
    if (unavailable) throw Error('Controlled RPC outage');
    if (releasePrepare) await new Promise(resolve => { releasePrepare = resolve; });
    return { ...input, chainId: 4663, token: MOSS_TOKEN.address, contract, amountWei: '1000000000000000000', mossAmount: '1.0', quotedAt: Date.now(), expiresAt: (Math.floor(Date.now() / 1000) + 300) * 1000,
      contractOrder: { orderId: id(input.id), productId: id(input.productId), characterId: id(input.characterId), buyer: input.wallet, amountWei: '1000000000000000000', usdCents: String(input.usdPrice * 100), deadline: Math.floor(Date.now() / 1000) + 300 },
      signature: '0x' + 'aa'.repeat(65), orderHash: id(input.id), status: 'quoted',
      approval: { to: MOSS_TOKEN.address, data: '0x00', value: '0x0', chainId: '0x1237' }, transaction: { to: contract, data: '0x00', value: '0x0', chainId: '0x1237' } };
  },
  async settlement(order) {
    if (unavailable) throw Error('Controlled RPC outage');
    if (latestPaid.has(order.id)) return { state: 'paid', blockHash: id('included-block'), blockNumber: '0x64' };
    if (paid.has(order.id)) return { state: 'paid', blockHash: id('final-block'), blockNumber: '0x65' };
    if (processed.has(order.id)) return { state: 'processed', blockHash: id(reanchored.has(order.id) ? 'replacement-block' : 'included-block'), blockNumber: '0x64', reanchored: reanchored.has(order.id) };
    return { state: expired && Date.now() > order.expiresAt ? 'expired' : 'pending', revoked: revoked.has(order.id) };
  },
};
const stored = index => JSON.parse(readFileSync(file, 'utf8'))[hash(tokens[index])].characters[0];
async function until(fn, label) { const end = realNow() + 8000; while (realNow() < end) { const result = fn(); if (result) return result; await delay(15); } throw Error(`Timed out: ${label}`); }
async function tick(ms = 1100) { clock += ms; await delay(80); }
async function start() { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '', storeChain }); port = await game.start(); }
async function connect(index) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, messages: [] }; clients.push(c);
  c.send = message => socket.send(JSON.stringify(message)); c.player = () => c.snapshot?.players.find(p => p.id === heroes[index].id);
  socket.on('message', raw => { const m = JSON.parse(raw); c.messages.push(m); if (m.type === 'snapshot') c.snapshot = m; if (m.type === 'storeState') c.state = m.state; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token: tokens[index], characterId: heroes[index].id }); await until(() => c.player(), 'enter world');
  c.send({ type: 'storeOpen' }); await until(() => c.state, 'open store anywhere'); return c;
}
async function request(c, message, type = 'storeState') { await tick(); const index = c.messages.length; c.send(message); return until(() => c.messages.slice(index).find(m => m.type === type), message.type); }
async function rejection(c, message) { await tick(); const index = c.messages.length; c.send(message); return until(() => c.messages.slice(index).find(m => m.type === 'event' && m.requestType === message.type), `reject ${message.type}`); }
async function quote(c, productId) { const { order } = await request(c, { type: 'storeQuote', productId }, 'storeQuote'); assert.deepEqual(order, stored(0).storeOrders.find(item => item.id === order.id), 'save precedes wallet exposure'); return order; }
try {
  writeFileSync(file, JSON.stringify(Object.fromEntries(heroes.map((p, i) => [hash(tokens[i]), { characters: [p] }]))));
  await start(); let buyer = await connect(0), rival = await connect(1);
  const challenge = await request(buyer, { type: 'storeWalletChallenge', wallet: wallet.address }, 'storeWalletChallenge');
  await request(buyer, { type: 'storeWalletBind', signature: await wallet.signMessage(challenge.message) });
  const beforeClass = stored(0), classOrder = await quote(buyer, 'store-class-change');
  assert.equal(classOrder.usdPrice, 50); assert.equal(classOrder.contractOrder.usdCents, '5000');
  const change = (order, className) => ({ type: 'storeChangeClass', orderId: order.id, className });
  await rejection(buyer, change(classOrder, 'Mage'));
  assert.equal(stored(0).appearance.className, 'Ranger', 'an unpaid/cancelled quote cannot change class');
  processed.add(classOrder.id); await request(buyer, { type: 'storePaymentCheck', orderId: classOrder.id });
  assert.equal(stored(0).storeOrders.find(o => o.id === classOrder.id).reward.kind, 'class-change', 'processed is sufficient for class changes');
  await rejection(rival, change(classOrder, 'Mage'));
  await rejection(buyer, change(classOrder, 'Ranger'));
  await rejection(buyer, change(classOrder, 'Unknown'));
  processed.delete(classOrder.id); revoked.add(classOrder.id);
  await request(buyer, { type: 'storePaymentCheck', orderId: classOrder.id });
  assert.equal(stored(0).storeOrders.find(o => o.id === classOrder.id).reward, undefined, 'unused reorged credit is revoked');
  await rejection(buyer, change(classOrder, 'Mage'));
  processed.add(classOrder.id); await request(buyer, { type: 'storePaymentCheck', orderId: classOrder.id });
  await delay(1100); mkdirSync(`${file}.tmp`);
  await request(buyer, change(classOrder, 'Mage'));
  assert.equal(stored(0).appearance.className, 'Ranger', 'failed write cannot change class');
  assert.equal(stored(0).storeOrders.find(o => o.id === classOrder.id).reward.redeemedAt, undefined, 'failed write preserves credit');
  rmSync(`${file}.tmp`, { recursive: true });
  await request(buyer, change(classOrder, 'Mage'));
  const changed = stored(0), used = changed.storeOrders.find(o => o.id === classOrder.id).reward;
  assert.equal(changed.appearance.className, 'Mage'); assert.equal(used.className, 'Mage'); assert(used.redeemedAt);
  assert.deepEqual(changed.learnedSpells, ['fireball']); assert.deepEqual(changed.talents, []);
  assert.deepEqual(changed.equipment, starterGear('Mage').equipment);
  for (const gear of beforeClass.ownedGear) assert(changed.ownedGear.includes(gear) || changed.bank.gear.includes(gear), 'old gear retained');
  for (const field of ['level', 'xp', 'gold', 'quest', 'contracts', 'skills', 'craftingXp', 'inventory', 'onboarding', 'ridingRank', 'ownedMounts']) assert.deepEqual(changed[field], beforeClass[field], `${field} preserved`);
  assert(changed.hp <= beforeClass.hp, 'class change cannot heal'); assert(storePlayerValid(changed));
  await rejection(buyer, change(classOrder, 'Knight'));
  processed.delete(classOrder.id);
  await request(buyer, { type: 'storePaymentCheck', orderId: classOrder.id });
  assert.deepEqual(stored(0).storeOrders.find(o => o.id === classOrder.id).reward, used, 'used receipt survives a reorg without rewinding player progress');
  assert(storePlayerValid(stored(0)));
  processed.add(classOrder.id); await request(buyer, { type: 'storePaymentCheck', orderId: classOrder.id });
  const offlineClass = await quote(buyer, 'store-class-change');
  assert.notEqual(offlineClass.id, classOrder.id, 'a used processed receipt does not block a new paid swap');
  assert(storePlayerValid(stored(0)), 'used processed receipts may coexist with a new quote');
  paid.add(classOrder.id); await request(buyer, { type: 'storePaymentCheck', orderId: classOrder.id });
  assert.deepEqual(stored(0).storeOrders.find(o => o.id === classOrder.id).reward, used, 'reprocessing and finality never duplicate a used credit');
  buyer.socket.terminate(); processed.add(offlineClass.id); await tick(6000);
  await until(() => stored(0).storeOrders.find(o => o.id === offlineClass.id).reward, 'offline processed class credit');
  await game.stop(); await start(); buyer = await connect(0); rival = await connect(1);
  assert.equal(stored(0).appearance.className, 'Mage', 'class and off-class gear survive strict save reload');
  await rejection(buyer, change(classOrder, 'Ranger'));
  await request(buyer, change(offlineClass, 'Ranger'));
  assert.deepEqual(stored(0).learnedSpells, ['arrow'], 'switching back also resets previous training');
  assert.equal(new Set(stored(0).ownedGear).size, stored(0).ownedGear.length, 'returning reuses existing starter gear');
  assert(storePlayerValid(stored(0)));
  processed.delete(offlineClass.id); revoked.add(offlineClass.id); expired = true; await tick(400000);
  await request(buyer, { type: 'storePaymentCheck', orderId: offlineClass.id });
  assert.equal(stored(0).storeOrders.find(o => o.id === offlineClass.id).status, 'expired');
  await quote(buyer, 'store-class-change');
  assert(stored(0).storeOrders.find(o => o.id === offlineClass.id)?.reward.redeemedAt, 'new quotes preserve consumed receipts even after reorg expiry');
  assert(storePlayerValid(stored(0)));
  const boostProducts = STORE_PRODUCTS.filter(product => product.kind === 'boost');
  for (const product of boostProducts) {
    const order = await quote(buyer, product.id);
    assert.equal((await quote(buyer, product.id)).id, order.id, 'a pending repeatable has only one payable quote');
    processed.add(order.id); await request(buyer, { type: 'storePaymentCheck', orderId: order.id });
    assert.equal(stored(0).storeOrders.find(o => o.id === order.id).status, 'processed');
    assert.equal(stored(0).storeConsumables[product.boostId] || 0, 0, 'provisional burns cannot grant consumable power');
    await rejection(buyer, { type: 'storeActivateBoost', boostId: product.boostId });
    processed.delete(order.id); revoked.add(order.id);
    await request(buyer, { type: 'storePaymentCheck', orderId: order.id });
    assert.equal(stored(0).storeConsumables[product.boostId] || 0, 0, 'reorg never consumed a charge');
    paid.add(order.id); await request(buyer, { type: 'storePaymentCheck', orderId: order.id });
    assert.equal(stored(0).storeConsumables[product.boostId], 1);
    assert(stored(0).storeOrders.find(o => o.id === order.id).reward);
    await request(buyer, { type: 'storePaymentCheck', orderId: order.id });
    assert.equal(stored(0).storeConsumables[product.boostId], 1, 'replayed final receipt cannot duplicate charge');
    await rejection(rival, { type: 'storeActivateBoost', boostId: product.boostId });
    await request(buyer, { type: 'storeActivateBoost', boostId: product.boostId });
    assert.equal(stored(0).storeConsumables[product.boostId], 0);
    assert.equal(stored(0).storeBoosts[product.boostId], clock + 3600000);
    assert.equal(storeBoostMultiplier(stored(0), product.boostId, clock), product.boostId.endsWith('xp') ? 1.5 : 1.2);
    await rejection(buyer, { type: 'storeActivateBoost', boostId: product.boostId });
  }
  const firstExpiry = stored(0).storeBoosts.damage;
  const repeat = await quote(buyer, 'store-damage'); latestPaid.add(repeat.id);
  await request(buyer, { type: 'storePaymentCheck', orderId: repeat.id });
  assert(!paid.has(repeat.id) && !processed.has(repeat.id), 'this purchase has only the current canonical inclusion result');
  assert.equal(stored(0).storeOrders.find(order => order.id === repeat.id).status, 'delivered', 'repeatable rewards settle immediately before finality');
  assert.equal(stored(0).storeConsumables.damage, 1, 'current inclusion grants a usable charge without a provisional stage');
  await request(buyer, { type: 'storePaymentCheck', orderId: repeat.id });
  assert.equal(stored(0).storeConsumables.damage, 1, 'replaying an included payment cannot duplicate its charge');
  await delay(1100); mkdirSync(`${file}.tmp`);
  await request(buyer, { type: 'storeActivateBoost', boostId: 'damage' });
  assert.equal(stored(0).storeConsumables.damage, 1, 'failed activation write preserves paid charge');
  assert.equal(stored(0).storeBoosts.damage, firstExpiry);
  rmSync(`${file}.tmp`, { recursive: true });
  await request(buyer, { type: 'storeActivateBoost', boostId: 'damage' });
  assert.equal(stored(0).storeBoosts.damage, firstExpiry + 3600000, 'repeat charge extends time without stacking power');
  assert.equal(storeBoostMultiplier(stored(0), 'damage', clock), 1.2);
  assert.equal(stored(0).storeOrders.filter(o => o.productId === 'store-damage').length, 2, 'final receipts remain immutable');
  const offline = await quote(buyer, 'store-profession-xp'); buyer.socket.terminate(); paid.add(offline.id); await tick(6000);
  await until(() => stored(0).storeConsumables['profession-xp'] === 1, 'offline charge delivery');
  const expiration = stored(0).storeBoosts['profession-xp'];
  await game.stop(); await start(); buyer = await connect(0);
  assert.equal(stored(0).storeBoosts['profession-xp'], expiration, 'reconnect cannot reset the timer');
  assert.equal(stored(0).storeConsumables['profession-xp'], 1, 'unactivated offline charge survives restart');
  for (let i = 0; i < 4; i++) {
    const box = await quote(buyer, 'store-cosmetic-box');
    const nextCosmetic = STORE_PRODUCTS.find(p => (p.kind === 'pet' || p.kind === 'mount') && !stored(0).storePurchases.includes(p.id));
    assert.match((await rejection(buyer, { type: 'storeQuote', productId: nextCosmetic.id })).text, /pending cosmetic/);
    processed.add(box.id); await request(buyer, { type: 'storePaymentCheck', orderId: box.id });
    assert.equal(stored(0).storePurchases.length, i, 'legacy processed gacha waits for a revalidated paid result');
    paid.add(box.id); await request(buyer, { type: 'storePaymentCheck', orderId: box.id });
    const result = stored(0).storeOrders.find(o => o.id === box.id).reward;
    assert.equal(result.kind, 'cosmetic'); assert(stored(0).storePurchases.includes(result.productId));
    assert.equal(stored(0).storePurchases.length, i + 1, 'every box awards one unowned cosmetic');
    await request(buyer, { type: 'storePaymentCheck', orderId: box.id });
    assert.deepEqual(stored(0).storeOrders.find(o => o.id === box.id).reward, result, 'repeated check cannot reroll cosmetic');
    assert(storePlayerValid(stored(0)));
  }
  assert.match((await rejection(buyer, { type: 'storeQuote', productId: 'store-cosmetic-box' })).text, /every cosmetic/);
  await tick(3 * 3600000);
  for (const product of boostProducts) assert.equal(storeBoostMultiplier(stored(0), product.boostId, clock), 1, 'boost expires during offline wall time');
  await game.stop(); await start(); buyer = await connect(0);
  assert(storePlayerValid(stored(0)), 'boosts and gacha entitlements survive full reload');
  assert.equal(stored(0).storePurchases.length, 4);
  // Specialist purchases retain canonical payment receipts when inventory fills between quote and delivery.
  const specialistProduct = STORE_PRODUCTS.find(product=>product.id==='store-sp-protection-roll');
  const fillerIds = Object.keys(LOOT_ITEMS).filter(id=>!id.startsWith('sp-'));
  async function resizeSpecialistBags(full) {
    await game.stop();
    const records=JSON.parse(readFileSync(file,'utf8')),p=records[hash(tokens[0])].characters[0];
    p.ownedBags=[];p.equippedBags=[null,null,null,null];p.carriedItems={};p.inventory={wood:0,crystal:0,herb:0,potion:0,relic:0};
    const target=bagCapacity(p)-(full?0:1);
    for(const id of fillerIds){if(bagUsage(p)>=target)break;p.carriedItems[id]=1;}
    assert.equal(bagUsage(p),target);
    writeFileSync(file,JSON.stringify(records));await start();buyer=await connect(0);
  }
  await resizeSpecialistBags(true);
  const callsBefore=prepareCalls;
  await rejection(buyer,{type:'storeQuote',productId:specialistProduct.id});
  assert.equal(prepareCalls,callsBefore,'full bags rejected before requesting a payable SP quote');
  assert(!stored(0).storeOrders.some(order=>order.productId===specialistProduct.id));
  await resizeSpecialistBags(false);
  const specialistOrder=await quote(buyer,specialistProduct.id);
  await resizeSpecialistBags(true);
  latestPaid.add(specialistOrder.id);await request(buyer,{type:'storePaymentCheck',orderId:specialistOrder.id});
  assert.equal(stored(0).carriedItems[specialistProduct.itemId]||0,0,'canonical inclusion preserves a paid item while bags are full');
  await request(buyer,{type:'storePaymentCheck',orderId:specialistOrder.id});
  assert.equal(stored(0).carriedItems[specialistProduct.itemId]||0,0);
  assert.notEqual(stored(0).storeOrders.find(order=>order.id===specialistOrder.id).status,'delivered','full bags keep paid receipt pending');
  await resizeSpecialistBags(false);
  await request(buyer,{type:'storePaymentCheck',orderId:specialistOrder.id});
  assert.equal(stored(0).carriedItems[specialistProduct.itemId],1,'saved paid receipt delivers after room is available');
  assert.equal(stored(0).storeOrders.find(order=>order.id===specialistOrder.id).status,'delivered');
  await request(buyer,{type:'storePaymentCheck',orderId:specialistOrder.id});
  assert.equal(stored(0).carriedItems[specialistProduct.itemId],1,'SP delivery cannot replay');
  await game.stop();await start();buyer=await connect(0);
  assert.equal(stored(0).carriedItems[specialistProduct.itemId],1,'paid SP item and receipt survive reload');
  assert(storePlayerValid(stored(0)));
  console.log('PASS canonical-inclusion consumables and specialist items, class changes/boosts/gacha, exact-once full-bag retry/reload, progress retention, reorg/replay/save-failure recovery. No real MOSS burned.');
} finally { rmSync(`${file}.tmp`, { recursive: true, force: true }); for (const c of clients) c.socket.terminate(); await game?.stop(); Date.now = realNow; rmSync(dir, { recursive: true, force: true }); }
