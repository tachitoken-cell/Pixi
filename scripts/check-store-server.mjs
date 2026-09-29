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
import { STORE_PRODUCTS, storePlayerValid } from '../src/ingame-store.ts';
import { playerTitle } from '../src/titles.ts';
import { starterGear } from '../src/progression.ts';

// Real sockets, account ownership, signatures and disk persistence; only chain state and pricing are controlled.
const dir = mkdtempSync(join(tmpdir(), 'mossvale-store-')), file = join(dir, 'players.json'), clients = [];
const realNow = Date.now; let clock = realNow(), game, port, unavailable = false, expired = false, releasePrepare;
Date.now = () => clock;
const hash = value => createHash('sha256').update(value).digest('hex');
const tokens = [randomBytes(32).toString('base64url'), randomBytes(32).toString('base64url')], wallet = Wallet.createRandom(), contract = Wallet.createRandom().address;
const paid = new Set(), processed = new Set(), revoked = new Set(), reanchored = new Set();
const appearance = { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' };
const heroes = ['Store adventurer', 'Store rival'].map(name => ({ id: randomUUID(), name, appearance, x: 0, z: 8, zone: 'greenwood', coordinateVersion: 2, rotation: 0,
  characterCreated: true, ...starterGear('Ranger'), talents: [], level: 1, hp: 100, maxHp: 100, xp: 0, gold: 0,
  inventory: { wood: 0, crystal: 0, herb: 0, potion: 3, relic: 0 }, learnedSpells: ['arrow'], ridingRank: 0, ownedMounts: [], quest: { stage: 0, kills: 0, crystals: 0 } }));
const storeChain = {
  async status() { return { enabled: !unavailable, chainId: 4663, token: MOSS_TOKEN.address, contract, ...(unavailable ? { reason: 'Controlled RPC outage' } : {}) }; },
  async prepareOrder(input) {
    if (unavailable) throw Error('Controlled RPC outage');
    if (releasePrepare) await new Promise(resolve => { releasePrepare = resolve; });
    return { ...input, chainId: 4663, token: MOSS_TOKEN.address, contract, amountWei: '1000000000000000000', mossAmount: '1.0', quotedAt: Date.now(), expiresAt: (Math.floor(Date.now() / 1000) + 300) * 1000,
      contractOrder: { orderId: id(input.id), productId: id(input.productId), characterId: id(input.characterId), buyer: input.wallet, amountWei: '1000000000000000000', usdCents: String(input.usdPrice * 100), deadline: Math.floor(Date.now() / 1000) + 300 },
      signature: '0x' + 'aa'.repeat(65), orderHash: id(input.id), status: 'quoted',
      approval: { to: MOSS_TOKEN.address, data: '0x00', value: '0x0', chainId: '0x1237' }, transaction: { to: contract, data: '0x00', value: '0x0', chainId: '0x1237' } };
  },
  async settlement(order) {
    if (unavailable) throw Error('Controlled RPC outage');
    if (paid.has(order.id)) return { state: 'paid' };
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
  assert.deepEqual(STORE_PRODUCTS.filter(product => ['mount', 'pet', 'title'].includes(product.kind)).map(product => product.usdPrice), [40, 40, 20, 20]);
  const title = await storeChain.prepareOrder({ id: randomUUID(), characterId: heroes[0].id, wallet: wallet.address, productId: 'burned', usdPrice: 100 });
  Object.assign(heroes[0], { storeOrders: [title], auctionWallet: wallet.address });
  writeFileSync(file, JSON.stringify(Object.fromEntries(heroes.map((p, i) => [hash(tokens[i]), { characters: [p] }]))));
  await start(); let buyer = await connect(0), rival = await connect(1);
  assert.equal(buyer.state.enabled, true); assert.deepEqual(buyer.state.owned, []);
  assert.match((await rejection(rival, { type: 'storeQuote', productId: 'store-embermane' })).text, /wallet/);
  assert.match((await rejection(buyer, { type: 'storeQuote', productId: 'burned' })).text, /Choose an item/, 'retired products cannot receive new quotes, including a repeat of a historical quote');
  const challenge = await request(buyer, { type: 'storeWalletChallenge', wallet: wallet.address }, 'storeWalletChallenge');
  const signature = await wallet.signMessage(challenge.message);
  await request(buyer, { type: 'storeWalletBind', signature }); await until(() => buyer.state.wallet === wallet.address, 'wallet bound');
  await rejection(buyer, { type: 'storeWalletBind', signature });
  assert.equal(stored(0).auctionWallet, wallet.address);
  assert.equal(buyer.player().auctionWallet, undefined); assert.equal(buyer.player().storeOrders, undefined, 'private receipts never broadcast');
  await rejection(buyer, { type: 'storeQuote', productId: 'burned', usdPrice: 1 });
  await rejection(rival, { type: 'storePaymentCheck', orderId: title.id });
  await request(buyer, { type: 'storePaymentCheck', orderId: title.id, transactionHash: id('forged') });
  assert.deepEqual(stored(0).storePurchases, [], 'a hash alone never grants anything');
  await tick(360000); await request(buyer, { type: 'storePaymentCheck', orderId: title.id });
  assert.notEqual(stored(0).storeOrders[0].status, 'expired', 'wall time cannot expire potentially paid quote');
  buyer.socket.terminate(); processed.add(title.id); await tick(6000);
  await until(() => stored(0).storePurchases.includes('burned'), 'offline delivery without receipt hash');
  assert.equal(stored(0).title, 'burned'); assert(storePlayerValid(stored(0)));
  await game.stop(); await start(); buyer = await connect(0); rival = await connect(1);
  assert.equal(playerTitle(buyer.player()), 'Burned'); assert.equal(stored(0).storePurchases.length, 1);
  await rejection(buyer, { type: 'storeQuote', productId: 'burned' });
  await request(buyer, { type: 'storePaymentCheck', orderId: title.id, transactionHash: id('optional-receipt') });
  assert.equal(stored(0).storeOrders[0].status, 'processed', 'attaching a hash cannot downgrade a granted order');
  processed.delete(title.id); unavailable = true; await tick(6000);
  assert.equal(stored(0).title, 'burned', 'RPC uncertainty preserves temporary reward');
  unavailable = false; await tick(6000);
  assert.equal(stored(0).title, 'burned', 'unproven pending observation cannot revoke');
  revoked.add(title.id); await tick(6000);
  await until(() => !stored(0).storePurchases.includes('burned'), 'proven title reorg revokes');
  assert.equal(stored(0).title, null); assert.equal(stored(0).storeOrders[0].status, 'submitted');
  assert(storePlayerValid(stored(0)));
  processed.add(title.id); await tick(6000);
  await until(() => stored(0).title === 'burned', 're-included burn restores reward');
  reanchored.add(title.id); await tick(6000);
  await until(() => stored(0).storeOrders[0].paymentBlock.hash === id('replacement-block'), 're-inclusion between polls updates anchor');
  await request(buyer, { type: 'selectTitle', titleId: null }, 'titleSelected');
  paid.add(title.id); await tick(6000);
  await until(() => stored(0).storeOrders[0].status === 'delivered', 'processed title finalizes');
  assert.equal(stored(0).title, null, 'finalizing does not overwrite later title selection');
  paid.delete(title.id); processed.delete(title.id); await tick(6000);
  assert(stored(0).storePurchases.includes('burned'), 'finalized reward is permanent');
  const mount = await quote(buyer, 'store-embermane');
  assert.equal((await quote(buyer, 'store-embermane')).id, mount.id, 'repeat quote cannot authorize two burns');
  await delay(1100); mkdirSync(`${file}.tmp`); processed.add(mount.id); await tick(6000); await delay(120);
  assert(!stored(0).ownedMounts.includes('store-embermane'), 'failed save cannot expose reward');
  assert(!buyer.player().ownedMounts.includes('store-embermane'));
  rmSync(`${file}.tmp`, { recursive: true }); await tick(6000);
  await until(() => stored(0).ownedMounts.includes('store-embermane'), 'paid reward retries after failed disk write');
  assert.equal(stored(0).ridingRank, 0, 'store does not skip riding training'); assert(storePlayerValid(stored(0)));
  const pet = await quote(buyer, 'store-ashwing'); unavailable = true; processed.add(pet.id); await tick(6000);
  assert(!stored(0).ownedPets.includes('store-ashwing'), 'RPC outage fails closed');
  unavailable = false; await tick(6000); await until(() => stored(0).ownedPets.includes('store-ashwing'), 'RPC recovery delivers pet');
  await request(buyer, { type: 'summonPet', pet: 'store-ashwing' }, 'snapshot'); await until(() => buyer.player().summonedPet === 'store-ashwing', 'paid pet summon');
  processed.delete(pet.id); revoked.add(pet.id); await tick(6000);
  await until(() => !stored(0).ownedPets.includes('store-ashwing'), 'provisional pet revoked');
  await until(() => buyer.player().summonedPet === null, 'revoked pet dismissed');
  processed.add(pet.id); await tick(6000);
  await until(() => stored(0).ownedPets.includes('store-ashwing'), 'pet re-inclusion restored');
  const unpaid = await quote(buyer, 'store-cinder-kit'); await tick(360000); expired = true;
  await request(buyer, { type: 'storePaymentCheck', orderId: unpaid.id });
  await until(() => stored(0).storeOrders.find(o => o.id === unpaid.id).status === 'expired', 'finalized unpaid expiry');
  const fresh = await quote(buyer, 'store-cinder-kit'); assert.notEqual(fresh.id, unpaid.id);
  const invalid = structuredClone(stored(0)); invalid.storePurchases.push('store-cinder-kit'); assert(!storePlayerValid(invalid), 'entitlements require delivered order');
  await game.stop(); await start(); buyer = await connect(0); assert(storePlayerValid(stored(0)), 'processed mount before riding survives migration');
  await game.stop();
  const trained = JSON.parse(readFileSync(file, 'utf8'));
  Object.assign(trained[hash(tokens[0])].characters[0], { level: 25, maxHp: 388, ridingRank: 1 });
  writeFileSync(file, JSON.stringify(trained)); await start(); buyer = await connect(0);
  async function summonMount() {
    buyer.send({ type: 'mount', mount: 'store-embermane' });
    const cast = await until(() => buyer.player().casting, 'temporary mount summon');
    await tick(cast.endsAt - clock + 1);
    await until(() => buyer.player().travel.mount === 'store-embermane', 'temporary mount usable');
  }
  expired = false;
  await summonMount();
  await delay(1100); mkdirSync(`${file}.tmp`); processed.delete(mount.id); revoked.add(mount.id); await tick(6000);
  assert(stored(0).ownedMounts.includes('store-embermane'), 'failed revoke save retains durable entitlement');
  assert.equal(buyer.player().travel.mount, 'store-embermane', 'revoke cannot expose uncommitted state');
  rmSync(`${file}.tmp`, { recursive: true }); await tick(6000);
  await until(() => !stored(0).ownedMounts.includes('store-embermane'), 'revocation retries after save recovery');
  await until(() => buyer.player().travel.mount === null, 'active revoked mount dismounted');
  assert.equal(stored(0).ridingRank, 1, 'revocation preserves training');
  processed.add(mount.id); await tick(6000);
  await until(() => stored(0).ownedMounts.includes('store-embermane'), 'mount re-inclusion');
  buyer.send({ type: 'mount', mount: 'store-embermane' });
  await until(() => buyer.player().casting?.ability === 'mount', 'second provisional mount cast');
  processed.delete(mount.id);
  await request(buyer, { type: 'storePaymentCheck', orderId: mount.id });
  await until(() => !buyer.player().casting, 'revoked mount cast cancelled');
  assert.equal(buyer.player().travel.mount, null);
  processed.add(mount.id); await tick(6000);
  await until(() => stored(0).ownedMounts.includes('store-embermane'), 'cached mount setup');
  await summonMount(); buyer.send({ type: 'leaveWorld' });
  await until(() => buyer.messages.at(-1)?.type === 'roster', 'leave world while mounted');
  processed.delete(mount.id); await tick(6000);
  await until(() => !stored(0).ownedMounts.includes('store-embermane'), 'offline cached mount revoke');
  buyer.snapshot = null; buyer.send({ type: 'selectCharacter', characterId: heroes[0].id });
  await until(() => buyer.player(), 'reselect after revocation');
  assert.equal(buyer.player().travel.mount, null, 'cached activity cannot restore revoked mount');
  processed.add(mount.id); paid.add(mount.id); await tick(6000);
  await until(() => stored(0).storeOrders.find(o => o.id === mount.id).status === 'delivered', 're-included mount finality');
  assert(!stored(0).achievements.unlocked['saddle-up'], 'provisional use never unlocked permanent achievement');
  releasePrepare = true; await tick(); buyer.send({ type: 'storeQuote', productId: 'store-cinderfang' });
  await until(() => typeof releasePrepare === 'function', 'slow quote preparation');
  await game.stop(); const before = readFileSync(file, 'utf8'); releasePrepare(); await delay(150);
  assert.equal(readFileSync(file, 'utf8'), before, 'delayed quote cannot write after shutdown');
  console.log('PASS store prices, wallet proof, durable quotes, provisional grants, finality, reorg/re-inclusion, live and cached mount revocation, pet dismissal, title preservation, disk and RPC recovery, offline restart and shutdown. No real MOSS burned.');
} finally { rmSync(`${file}.tmp`, { recursive: true, force: true }); for (const c of clients) c.socket.terminate(); await game?.stop(); Date.now = realNow; rmSync(dir, { recursive: true, force: true }); }
