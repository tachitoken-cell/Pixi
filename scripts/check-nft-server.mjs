import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { Wallet, Interface, TypedDataEncoder, id } from 'ethers';
import { createGameServer } from '../server.mjs';
import { MOSS_TOKEN } from '../src/auction.ts';
import { AUCTIONEER, DEED_AUCTIONEER } from '../src/city.ts';
import { NFT_ABI, NFT_AUCTION_ABI, NFT_MINT_TYPES, NFT_HOUSES, NFT_MOUNTS, NFT_PETS, NFT_LEGACY_PETS, nftAsset, nftPlayerValid, nftAuctionTransactionValid } from '../src/nfts.ts';
import { storePlayerValid, storeNftConvertible, storeCosmeticPool, storeProduct, MOBILE_STORE_SKUS } from '../src/ingame-store.ts';
import { maxHealth, starterGear } from '../src/progression.ts';
import { LOOT_ITEMS } from '../src/loot-items.ts';
import { bagCanFit } from '../src/bags.ts';
import { playerDeletions } from '../src/player-deletions.mjs';
import { canTraverse } from '../src/realm.ts';

// Real sockets, wallet signatures and disk saves; only chain observations are controlled.
const dir = mkdtempSync(join(tmpdir(), 'mossvale-nfts-')), file = join(dir, 'players.json'), clients = [];
const realNow = Date.now; let clock = realNow(), game, port, unavailable = false, newOwnershipUnavailable = false, stale = false, holdOwnership = false;
let holdHistoricalOwnership = false, holdHistoricalAuction = false, holdAuction = false, ownershipTimestamp = null, auctionTimestamp = null;
let ownershipObservations = 0, auctionObservations = 0;
Date.now = () => clock;
const hash = value => createHash('sha256').update(value).digest('hex');
const tokens = [0, 1, 2].map(() => randomBytes(32).toString('base64url')), wallets = [Wallet.createRandom(), Wallet.createRandom(), Wallet.createRandom()];
const authority = Wallet.createRandom(), petsContract = Wallet.createRandom().address, newPetsContract = Wallet.createRandom().address, housesContract = Wallet.createRandom().address;
const mountsContract = Wallet.createRandom().address; let mountsEnabled = false, mountsVerified = true;
const petsV2Contract = Wallet.createRandom().address; let expanded = false, migrationToken;
const paid = new Set(), expired = new Set(), ownership = new Map(wallets.map(wallet => [wallet.address, { pets: [], houses: [] }]));
const auctionAbi = new Interface(NFT_AUCTION_ABI), auctionStartsAt = clock;
const auctionCalls = []; let holdBid = false, noWalletAuctionReads = 0;
const mint = new Interface(NFT_ABI), token = new Interface(['function approve(address,uint256) returns (bool)']);
const heroes = ['NFT seller', 'NFT buyer', 'NFT visitor'].map(name => ({ id: randomUUID(), name,
  appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
  x: AUCTIONEER.x - 1.5, z: AUCTIONEER.z, zone: 'greenwood', coordinateVersion: 2, rotation: 0,
  characterCreated: true, ...starterGear('Ranger'), talents: [], level: 1, hp: 100, maxHp: 100, xp: 0, gold: 0,
  inventory: { wood: 0, crystal: 0, herb: 0, potion: 3, relic: 0 }, learnedSpells: ['arrow'], ridingRank: 0, ownedMounts: [],
  ownedPets: ['moon-owl'], carriedItems: { 'moss-fox': 1, 'bloom-hare': 1, 'ember-drake': 1 }, quest: { stage: 0, kills: 0, crystals: 0 } }));
const deedNearby = Array.from({ length: 32 }, (_, i) => ({ x: DEED_AUCTIONEER.x + Math.cos(i * Math.PI / 16) * 1.2, z: DEED_AUCTIONEER.z + Math.sin(i * Math.PI / 16) * 1.2 })).find(point => canTraverse(point, DEED_AUCTIONEER));
const newPets = NFT_PETS.filter(pet => pet.assetId > 8 && pet.assetId <= 16);
assert.equal(newPets.length, 8);
assert(deedNearby); Object.assign(heroes[2], deedNearby); heroes[2].carriedItems['fern-lynx'] = 2;
heroes[2].ownedPets.push(...newPets.filter(pet => pet.id !== 'fern-lynx').map(pet => pet.id));
let newPetsEnabled = false;
const nftChain = {
  configured: true,
  async status() { return { configured: true, enabled: !unavailable, mountsContract, mountsEnabled: mountsEnabled && !unavailable, mintableMountIds: NFT_MOUNTS.map(mount => mount.id), chainId: 4663, petsContract: expanded ? petsV2Contract : petsContract, ...(expanded ? { legacyPetsContract: petsContract, mintablePetIds: NFT_PETS.map(pet => pet.id) } : {}), newPetsContract, newPetsEnabled: !unavailable && newPetsEnabled, housesContract, feeBps: 500, houses: (await this.auctionState()).houses }; },
  async auctionState(wallet) {
    if (!wallet) noWalletAuctionReads++;
    if (unavailable) throw Error('Controlled RPC outage');
    if (holdHistoricalAuction && wallet === wallets[1].address) await new Promise(resolve => { holdHistoricalAuction = resolve; });
    const observedAt = Date.now();
    if (holdAuction && wallet === wallets[1].address) await new Promise(resolve => { holdAuction = resolve; });
    if (wallet === wallets[1].address) auctionObservations++;
    return { houses: NFT_HOUSES.map(house => ({ ...house, reserveWei: '1000000000000000000000', highestBidWei: '0', startsAt: auctionStartsAt, endsAt: auctionStartsAt + 14400000, settled: false })),
      walletBalanceWei: wallet ? '5000000000000000000000' : null, refundWei: wallet ? '200000000000000000000' : null,
      verifiedAt: wallet === wallets[1].address && auctionTimestamp ? auctionTimestamp(observedAt) : observedAt };
  },
  async prepareAuctionTransaction(terms) {
    if (holdBid) await new Promise(resolve => { holdBid = resolve; });
    const { action, wallet, houseId, amountWei } = terms, house = nftAsset('house', houseId);
    if (action === 'bid' && (typeof amountWei !== 'string' || !/^[1-9]\d*$/.test(amountWei) || BigInt(amountWei) < 10n ** 21n)) throw Error('Bid at least the opening reserve.');
    const paymentWei = action === 'bid' ? amountWei : '0', data = action === 'bid' ? auctionAbi.encodeFunctionData('bidHouse', [house.assetId, amountWei, paymentWei])
      : action === 'settle' ? auctionAbi.encodeFunctionData('settleHouse', [house.assetId]) : auctionAbi.encodeFunctionData('withdrawRefund');
    const result = { ...terms, paymentWei, transaction: { to: housesContract, data, value: '0x0', chainId: '0x1237' },
      ...(action === 'bid' ? { approval: { to: MOSS_TOKEN.address, data: token.encodeFunctionData('approve', [housesContract, paymentWei]), value: '0x0', chainId: '0x1237' } } : {}) };
    assert(nftAuctionTransactionValid(result, { ...terms, contract: housesContract })); auctionCalls.push(result); return result;
  },
  async checkAuctionTransaction(terms) { auctionCalls.push(terms); return { state: 'confirmed' }; },
  async ownership(wallet) {
    if (unavailable) throw Error('Controlled RPC outage');
    if (holdHistoricalOwnership && wallet === wallets[1].address) await new Promise(resolve => { holdHistoricalOwnership = resolve; });
    const observedAt = Date.now();
    if (holdOwnership && wallet === wallets[1].address) await new Promise(resolve => { holdOwnership = resolve; });
    if (wallet === wallets[1].address) ownershipObservations++;
    return { ...(ownership.get(wallet) || { pets: [], houses: [] }), collectionsVerified: !newOwnershipUnavailable && mountsVerified, mounts: [], newPetsVerified: !newOwnershipUnavailable, mountsVerified, ...ownership.get(wallet),
      verifiedAt: wallet === wallets[1].address && ownershipTimestamp ? ownershipTimestamp(observedAt) : observedAt - (stale ? 20000 : 0) };
  },
  async prepareOrder(input) {
    if (unavailable) throw Error('Controlled RPC outage');
    const asset = nftAsset(input.kind, input.assetId), contract = input.kind === 'mount' ? mountsContract : input.kind === 'pet' ? expanded ? petsV2Contract : asset.assetId > 8 ? newPetsContract : petsContract : housesContract;
    const orderId = id(`mossvale-nft:${input.kind}:${input.characterId}:${input.id}`), tokenId = input.kind !== 'house' ? BigInt(orderId).toString() : String(asset.assetId);
    const amountWei = input.kind !== 'house' ? '0' : '100000000000000000000', expiresAt = (Math.floor(Date.now() / 1000) + 300) * 1000;
    const contractOrder = { orderId, tokenId, assetId: asset.assetId, buyer: input.wallet, amountWei, deadline: expiresAt / 1000 };
    const domain = { name: 'MossvaleNFT', version: '1', chainId: 4663, verifyingContract: contract };
    const signature = await authority.signTypedData(domain, NFT_MINT_TYPES, contractOrder);
    return { ...input, chainId: 4663, contract, tokenId, amountWei, expiresAt, contractOrder, signature,
      orderHash: TypedDataEncoder.hash(domain, NFT_MINT_TYPES, contractOrder), status: 'quoted',
      transaction: { to: contract, data: mint.encodeFunctionData('mint', [contractOrder, signature]), value: '0x0', chainId: '0x1237' },
      ...(input.kind === 'house' ? { approval: { to: MOSS_TOKEN.address, data: token.encodeFunctionData('approve', [contract, amountWei]), value: '0x0', chainId: '0x1237' } } : {}) };
  },
  async prepareMigration({ wallet, tokenId }) {
    if (wallet !== wallets[0].address || tokenId !== migrationToken) throw Error('Not the original NFT owner');
    return { wallet, legacyContract: petsContract, contract: petsV2Contract, tokenId, assetId: 'moss-fox',
      approval: { to: petsContract, data: token.encodeFunctionData('approve', [petsV2Contract, tokenId]), value: '0x0', chainId: '0x1237' },
      transaction: { to: petsV2Contract, data: new Interface(['function migrate(uint256)']).encodeFunctionData('migrate', [tokenId]), value: '0x0', chainId: '0x1237' } };
  },
  async settlement(order) {
    if (unavailable) throw Error('Controlled RPC outage');
    return { state: paid.has(order.id) ? 'minted' : expired.has(order.id) && Date.now() > order.expiresAt ? 'expired' : 'pending' };
  },
};
const stored = index => JSON.parse(readFileSync(file, 'utf8'))[hash(tokens[index])].characters[0];
async function until(fn, label) { const end = realNow() + 7000; while (realNow() < end) { const result = fn(); if (result) return result; await delay(15); } throw Error(`Timed out: ${label}`); }
async function tick(ms = 1100) {
  clock += ms;
  const active = clients.filter(client => client.inWorld && client.socket.readyState === WebSocket.OPEN);
  // Compressed snapshots can arrive after a fixed timer; assert against this clock advance.
  if (active.length) await until(() => active.every(client => client.snapshot?.serverTime >= clock), 'fresh ownership snapshots');
  else await delay(120);
}
async function start() { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '', nftChain }); port = await game.start(); }
async function connect(index) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, messages: [], index }; clients.push(c);
  c.send = message => socket.send(JSON.stringify(message)); c.player = () => c.snapshot?.players.find(p => p.id === heroes[index].id);
  socket.on('message', raw => { const m = JSON.parse(raw); c.messages.push(m); if (m.type === 'welcome') c.inWorld = true; if (m.type === 'roster') c.inWorld = false; if (m.type === 'snapshot') c.snapshot = m; if (m.type === 'nftState') c.state = m.state; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token: tokens[index], characterId: heroes[index].id }); await until(() => c.player(), 'enter world');
  await request(c, { type: 'nftOpen' }); return c;
}
async function request(c, message, type = 'nftState') { await tick(); const index = c.messages.length; c.send(message); return until(() => c.messages.slice(index).find(m => m.type === type), message.type); }
async function reject(c, message) { await tick(); const index = c.messages.length; c.send(message); return until(() => c.messages.slice(index).find(m => m.type === 'event' && m.requestType === message.type), `reject ${message.type}`); }
async function bind(c, wallet, auction = false, rejected = false) {
  const prefix = auction ? 'auction' : 'store', extra = auction ? { npcId: AUCTIONEER.id } : {};
  const challenge = await request(c, { type: `${prefix}WalletChallenge`, wallet: wallet.address, ...extra }, `${prefix}WalletChallenge`);
  const message = { type: `${prefix}WalletBind`, signature: await wallet.signMessage(challenge.message), ...extra };
  return rejected ? reject(c, message) : request(c, message, 'nftState');
}
async function quote(c, asset, source, kind = 'pet') {
  const { order } = await request(c, { type: kind === 'mount' ? 'nftClaimMount' : 'nftClaimPet', [kind]: asset, ...(source ? { source } : {}) }, 'nftQuote');
  assert.deepEqual(order, stored(c.index).nftOrders.find(item => item.id === order.id), 'escrow save precedes voucher exposure'); return order;
}
try {
  writeFileSync(file, JSON.stringify(Object.fromEntries(heroes.map((p, i) => [hash(tokens[i]), { characters: [p] }]))));
  await start(); let visitor = await connect(2);
  assert.equal(stored(2).auctionWallet, undefined, 'visitor has no linked wallet');
  assert(!visitor.messages.some(message => message.type === 'nftState' && message.message), 'opening NFTs without a wallet must not return an internal error');
  await request(visitor, { type: 'nftAuctionOpen', npcId: DEED_AUCTIONEER.id });
  await until(() => visitor.messages.some(message => message.type === 'nftState' && message.openAuction), 'unlinked wallet opens house auction');
  const readsBeforeRefresh = noWalletAuctionReads, messagesBeforeRefresh = visitor.messages.length;
  await tick(6000);
  await until(() => noWalletAuctionReads > readsBeforeRefresh, 'scheduled auction refresh without a wallet');
  await until(() => visitor.messages.slice(messagesBeforeRefresh).some(message => message.type === 'nftState' && message.state.wallet === null), 'scheduled refresh replies without a wallet');
  assert.equal(visitor.socket.readyState, WebSocket.OPEN, 'scheduled refresh keeps the server and visitor socket alive');
  assert.equal(visitor.player().nftConfigured, true);
  assert.equal(nftAsset('pet', 'fern-lynx').assetId, 9, 'new pets append published NFT asset numbers');
  await request(visitor, { type: 'learnPet', pet: 'fern-lynx' }, 'snapshot');
  await until(() => stored(2).ownedPets.includes('fern-lynx'), 'new pet can still be learned before the new collection is configured');
  assert.equal(stored(2).carriedItems['fern-lynx'], 1, 'optional learning consumes exactly one unlearned copy');
  await request(visitor, { type: 'summonPet', pet: 'fern-lynx' }, 'snapshot');
  await until(() => stored(2).summonedPet === 'fern-lynx', 'previously learned new pet remains usable before conversion');
  await bind(visitor, wallets[2]);
  await reject(visitor, { type: 'nftClaimPet', pet: 'moon-owl', source: 'learned' });
  await reject(visitor, { type: 'nftClaimPet', pet: 'store-ashwing', source: 'learned' });
  await reject(visitor, { type: 'nftClaimPet', pet: 'fern-lynx', source: 'forged' });
  newPetsEnabled = false; await tick(21000);
  assert.match((await reject(visitor, { type: 'nftClaimPet', pet: 'fern-lynx', source: 'learned' })).text, /expanded NFT|not enabled/);
  assert(stored(2).ownedPets.includes('fern-lynx'), 'unconfigured new collection cannot reserve an existing pet');
  newPetsEnabled = true; await tick(21000);
  const converting = await quote(visitor, 'fern-lynx', 'learned');
  assert.equal(converting.claimSource, 'learned'); assert.equal(converting.contract, newPetsContract);
  assert(!stored(2).ownedPets.includes('fern-lynx')); assert.equal(stored(2).summonedPet, null, 'conversion dismisses the saved learned pet');
  assert.equal(stored(2).carriedItems['fern-lynx'], 1, 'explicit conversion reserves the learned unlock, not an extra carried drop');
  assert.equal((await quote(visitor, 'fern-lynx', 'learned')).id, converting.id, 'conversion retry reuses the only reserved unlock');
  assert.match((await reject(visitor, { type: 'learnPet', pet: 'fern-lynx' })).text, /reserved/, 'a second learned copy cannot overlap a pending learned conversion');
  assert.equal(stored(2).carriedItems['fern-lynx'], 1, 'pending conversion learning rejection keeps the extra copy');
  assert.match((await reject(visitor, { type: 'summonPet', pet: 'fern-lynx' })).text, /wallet/);
  await game.stop();
  const reservedSave = JSON.parse(readFileSync(file, 'utf8')), reservedPlayer = reservedSave[hash(tokens[2])].characters[0];
  const originalBag = reservedPlayer.carriedItems;
  reservedPlayer.carriedItems = Object.fromEntries([...Object.keys(LOOT_ITEMS).filter(key => key !== 'fern-lynx').slice(0, 14).map(key => [key, 1]), ['fern-lynx', 1]]);
  assert(bagCanFit(reservedPlayer));
  assert(!bagCanFit(reservedPlayer, { carriedItems: { ...reservedPlayer.carriedItems, [Object.keys(LOOT_ITEMS).find(key => !reservedPlayer.carriedItems[key])]: 1 } }));
  writeFileSync(file, JSON.stringify(reservedSave)); await start(); visitor = await connect(2);
  assert(!visitor.player().ownedPets.includes('fern-lynx'), 'pending conversion stays reserved across a realm restart');
  assert.equal(visitor.state.orders.find(order => order.id === converting.id).claimSource, 'learned');
  unavailable = true; expired.add(converting.id); await tick(360000);
  assert(!stored(2).ownedPets.includes('fern-lynx'), 'uncertain finality never returns a reserved learned pet');
  unavailable = false; await tick(21000);
  await until(() => stored(2).ownedPets.includes('fern-lynx'), 'finalized unpaid expiry restores the learned entitlement');
  assert.equal(stored(2).carriedItems['fern-lynx'], 1, 'learned restitution does not duplicate an inventory pet');
  assert.equal(stored(2).ownedPets.filter(pet => pet === 'fern-lynx').length, 1, 'full bags do not delay or duplicate learned-pet restitution');
  await game.stop(); const restoredSave = JSON.parse(readFileSync(file, 'utf8'));
  restoredSave[hash(tokens[2])].characters[0].carriedItems = originalBag;
  writeFileSync(file, JSON.stringify(restoredSave)); await start(); visitor = await connect(2);
  await delay(1100); mkdirSync(`${file}.tmp`);
  await reject(visitor, { type: 'nftClaimPet', pet: 'fern-lynx', source: 'learned' });
  assert(stored(2).ownedPets.includes('fern-lynx'), 'failed conversion save preserves the learned pet');
  assert.equal(stored(2).nftOrders.length, 1, 'failed conversion save creates no authorization');
  rmSync(`${file}.tmp`, { recursive: true });
  for (const pet of newPets) {
    const order = await quote(visitor, pet.id, 'learned');
    assert.equal(order.contractOrder.assetId, pet.assetId); assert.equal(order.contract, newPetsContract);
    paid.add(order.id); ownership.get(wallets[2].address).pets.push(pet.id); await tick(6000);
    await until(() => stored(2).nftOrders.find(item => item.id === order.id)?.status === 'minted', `${pet.id} conversion finality`);
    assert(!stored(2).ownedPets.includes(pet.id), 'successful conversion does not retain permanent character access');
    assert.match((await reject(visitor, { type: 'nftClaimPet', pet: pet.id, source: 'learned' })).text, /not available/, 'learned pet can be converted only once');
  }
  await request(visitor, { type: 'summonPet', pet: 'fern-lynx' }, 'snapshot');
  await until(() => visitor.player().summonedPet === 'fern-lynx', 'converted new NFT summons for its verified wallet owner');
  newOwnershipUnavailable = true; await tick(6000);
  await until(() => visitor.player().summonedPet === null && !visitor.player().nftPets.includes('fern-lynx'), 'a partial new-collection outage suspends new NFT grants');
  assert.match((await reject(visitor, { type: 'summonPet', pet: 'fern-lynx' })).text, /wallet/, 'unverified new holdings cannot be summoned explicitly');
  newOwnershipUnavailable = false; await tick(6000);
  await until(() => visitor.player().summonedPet === 'fern-lynx', 'partial verification recovery restores the selected new NFT automatically');
  ownership.get(wallets[2].address).pets = []; await tick(6000);
  await until(() => visitor.player().summonedPet === null, 'transferring the converted NFT removes character access');
  ownership.get(wallets[2].address).pets = ['fern-lynx']; await tick(6000);
  assert.equal(visitor.player().summonedPet, null, 'verified ownership loss clears selection even if a new NFT later returns');
  const newDrop = await quote(visitor, 'fern-lynx');
  assert.equal(newDrop.claimSource, undefined); assert.equal(newDrop.contract, newPetsContract);
  assert.equal(stored(2).carriedItems['fern-lynx'], undefined, 'an unlearned new drop still uses the ordinary inventory escrow');
  assert.match((await reject(visitor, { type: 'learnPet', pet: 'fern-lynx' })).text, /bags/, 'reserved bag item cannot also become a learned unlock');
  paid.add(newDrop.id); await tick(6000);
  let seller = await connect(0), buyer = await connect(1);
  assert.equal(seller.state.feeBps, 500);
  assert.equal(seller.player().nftConfigured, true);
  assert.match((await reject(seller, { type: 'nftClaimPet', pet: 'moss-fox' })).text, /wallet/);
  await bind(seller, wallets[0]); await bind(buyer, wallets[1]);
  const emptyReads = ownershipObservations;
  for (let poll = 0; poll < 11; poll++) await tick(5000);
  assert.equal(ownershipObservations, emptyReads, 'fully verified empty wallets skip eleven five-second background reads');
  await tick(5000);
  assert.equal(ownershipObservations, emptyReads + 1, 'empty wallets refresh at one minute');
  await request(buyer, { type: 'nftOpen' });
  assert.equal(ownershipObservations, emptyReads + 2, 'opening collections bypasses the empty-wallet delay');
  unavailable = true; await request(buyer, { type: 'nftOpen' }); unavailable = false;
  const failedReads = ownershipObservations; await tick(5000);
  assert.equal(ownershipObservations, failedReads + 1, 'a failed forced read cancels the empty-wallet delay and retries on the next poll');
  for (const partial of ['pets', 'mounts']) {
    newOwnershipUnavailable = partial === 'pets'; mountsVerified = partial !== 'mounts';
    await request(buyer, { type: 'nftOpen' }); const partialReads = ownershipObservations;
    await tick(5000);
    assert.equal(ownershipObservations, partialReads + 1, `unverified ${partial} holdings cannot enter the empty-wallet delay`);
  }
  newOwnershipUnavailable = false; mountsVerified = true;
  await request(buyer, { type: 'nftOpen' });
  ownership.get(wallets[1].address).pets = ['moss-fox'];
  await request(buyer, { type: 'summonPet', pet: 'moss-fox' }, 'snapshot');
  await until(() => buyer.player().summonedPet === 'moss-fox', 'explicit summon discovers an incoming NFT during the empty-wallet delay');
  ownership.get(wallets[1].address).pets = []; await tick(5000);
  await until(() => buyer.player().summonedPet === null, 'positive ownership still refreshes and revokes within five seconds');
  console.log('PASS empty NFT wallets: 12 background reads reduced to one per minute, immediate open/summon, five-second positive revocation, partial/error retries.');
  await request(seller, { type: 'setItemLock', itemId: 'item:moss-fox', locked: true }, 'snapshot');
  await until(() => stored(0).lockedItems?.includes('item:moss-fox'), 'collectible lock persisted');
  const protectedItems = structuredClone(stored(0).carriedItems), protectedOrders = structuredClone(stored(0).nftOrders);
  assert.match((await reject(seller, { type: 'nftClaimPet', pet: 'moss-fox' })).text, /locked/, 'an inventory lock blocks NFT conversion before escrow or authorization');
  assert.deepEqual(stored(0).carriedItems, protectedItems); assert.deepEqual(stored(0).nftOrders, protectedOrders);
  await request(seller, { type: 'setItemLock', itemId: 'item:moss-fox', locked: false }, 'snapshot');
  await until(() => !stored(0).lockedItems.includes('item:moss-fox'), 'explicit unlock permits ordinary collectible conversion');
  await reject(seller, { type: 'nftClaimPet', pet: 'moss-fox', amountWei: '0' });
  await request(seller, { type: 'nftOpen' });
  const rapidClaimAt = seller.messages.length;
  seller.send({ type: 'nftClaimPet', pet: 'moss-fox' });
  const { order: fox } = await until(() => seller.messages.slice(rapidClaimAt).find(message => message.type === 'nftQuote'), 'claim immediately after opening collections');
  assert.deepEqual(fox, stored(0).nftOrders.find(order => order.id === fox.id), 'rapid claim is saved before its permission is returned');
  const rapidRepeatAt = seller.messages.length;
  seller.send({ type: 'nftClaimPet', pet: 'bloom-hare' });
  await until(() => seller.messages.slice(rapidRepeatAt).find(message => message.type === 'event' && message.requestType === 'nftClaimPet' && /Wait a moment/.test(message.text)), 'repeated mutations remain throttled');
  assert.equal(stored(0).carriedItems['bloom-hare'], 1);
  const rapidReadAt = seller.messages.length;
  seller.send({ type: 'nftOpen' });
  await until(() => seller.messages.slice(rapidReadAt).find(message => message.type === 'event' && message.requestType === 'nftOpen' && /Wait a moment/.test(message.text)), 'repeated reads remain throttled');
  assert.equal(stored(0).carriedItems['moss-fox'], undefined);
  assert.equal((await quote(seller, 'moss-fox')).id, fox.id, 'retries reuse escrow, never authorize another NFT');
  assert.deepEqual(stored(0).ownedPets, ['moon-owl']);
  assert.equal(seller.player().nftOrders, undefined, 'signed claims stay private');
  assert.match((await reject(seller, { type: 'learnPet', pet: 'moss-fox' })).text, /NFT/);
  await reject(seller, { type: 'auctionList', npcId: AUCTIONEER.id, item: { kind: 'item', id: 'moss-fox', quantity: 1 }, currency: 'gold', price: '5' });
  assert.equal(stored(0).auctions.length, 0);
  await reject(buyer, { type: 'nftPaymentCheck', orderId: fox.id });
  assert.match((await bind(seller, wallets[1], false, true)).text, /pending/);
  assert.match((await bind(seller, wallets[1], true, true)).text, /payments/);
  assert.equal(stored(0).auctionWallet, wallets[0].address);
  await request(seller, { type: 'leaveWorld' }, 'roster');
  assert.match((await reject(seller, { type: 'deleteCharacter', characterId: heroes[0].id, confirmation: 'I confirm' })).text, /NFT/);
  const deletion = playerDeletions({ query: async sql => ({ rows: sql.startsWith('SELECT state FROM mossvale_players WHERE') ? [{ state: { characters: [stored(0)] } }] : [] }),
    enqueue: fn => fn(), transaction: fn => fn(), owned: new Set() });
  await assert.rejects(deletion.requestDeletion(hash(tokens[0]), 'subject', () => true), error => error.code === 'ACCOUNT_PAYMENTS_PENDING');
  assert(!deletion.isDeleting(hash(tokens[0])));
  await request(seller, { type: 'selectCharacter', characterId: heroes[0].id }, 'welcome');
  await tick(360000); await request(seller, { type: 'nftPaymentCheck', orderId: fox.id });
  assert.equal(stored(0).nftOrders[0].status, 'quoted', 'wall-clock expiry never releases an uncertain payment');
  seller.socket.terminate(); paid.add(fox.id); ownership.get(wallets[0].address).pets = ['moss-fox']; await tick(6000);
  await until(() => stored(0).nftOrders[0].status === 'minted', 'offline settlement without client hash');
  assert.deepEqual(stored(0).ownedPets, ['moon-owl'], 'mint never grants permanent character entitlement');
  await game.stop(); await start(); seller = await connect(0); buyer = await connect(1);
  const returningVisitor = await connect(2);
  assert.deepEqual(returningVisitor.player().ownedPets, ['moon-owl']);
  assert.equal(returningVisitor.player().summonedPet, null, 'converted unlocks cannot reappear after restart');
  await request(seller, { type: 'summonPet', pet: 'moss-fox' }, 'snapshot');
  await until(() => seller.player().summonedPet === 'moss-fox', 'current owner summons minted pet');
  assert.equal(stored(0).summonedPet, null, 'NFT summon remains transient');
  ownership.get(wallets[0].address).pets = []; ownership.get(wallets[1].address).pets = ['moss-fox']; await tick(6000);
  await request(buyer, { type: 'nftOpen' });
  await until(() => seller.player().summonedPet === null && buyer.player().nftPets.includes('moss-fox'), 'transfer removes seller access and grants buyer access');
  await reject(seller, { type: 'summonPet', pet: 'moss-fox' });
  await request(buyer, { type: 'summonPet', pet: 'moss-fox' }, 'snapshot'); await until(() => buyer.player().summonedPet === 'moss-fox', 'buyer summons acquired pet');
  unavailable = true; await tick(6000);
  assert.equal(buyer.player().summonedPet, 'moss-fox', 'a failed refresh preserves ownership inside its existing fifteen-second verification window');
  await tick(10000); await until(() => buyer.player().summonedPet === null, 'RPC uncertainty suspends NFT pet when the original verification expires');
  unavailable = false; await tick(6000);
  await until(() => buyer.player().summonedPet === 'moss-fox', 'verified ownership recovery restores the selected NFT pet without another summon');
  unavailable = true; await tick(16000); await until(() => buyer.player().summonedPet === null, 'another outage cannot retain unverified NFT access');
  assert.equal(buyer.player().nftConfigured, true, 'RPC failure keeps the client on the NFT claim flow');
  assert.deepEqual(stored(1).ownedPets, ['moon-owl']);
  assert.match((await reject(buyer, { type: 'learnPet', pet: 'bloom-hare' })).text, /NFT/, 'outage cannot bypass NFT conversion');
  await request(buyer, { type: 'summonPet', pet: 'moon-owl' }, 'snapshot'); await until(() => buyer.player().summonedPet === 'moon-owl', 'independent learned pet survives NFT outage');
  unavailable = false; stale = true; await tick(6000); assert.deepEqual(buyer.player().nftPets, [], 'stale ownership cannot grant access');
  stale = false; await tick(6000); await until(() => buyer.player().nftPets.includes('moss-fox'), 'ownership recovers');
  await request(buyer, { type: 'summonPet', pet: 'moss-fox' }, 'snapshot'); await until(() => buyer.player().summonedPet === 'moss-fox', 'NFT resummon');
  holdHistoricalOwnership = true; holdHistoricalAuction = true; await tick(6000); buyer.send({ type: 'nftOpen' });
  await until(() => typeof holdHistoricalOwnership === 'function' && typeof holdHistoricalAuction === 'function', 'historical collection verification in flight');
  const finishHistoricalOwnership = holdHistoricalOwnership, finishHistoricalAuction = holdHistoricalAuction;
  await tick(16000);
  assert.equal(buyer.player().summonedPet, null, 'previous observation expires while historical reads continue');
  // Hold any automatic retry so it cannot mask rejection of the first fresh response.
  holdHistoricalOwnership = true; holdHistoricalAuction = true; finishHistoricalOwnership(); finishHistoricalAuction();
  await until(() => buyer.player().summonedPet === 'moss-fox' && buyer.state.walletBalanceWei === '5000000000000000000000', 'fresh live observations are accepted after slow historical verification');
  const retryHistoricalOwnership = holdHistoricalOwnership, retryHistoricalAuction = holdHistoricalAuction;
  holdHistoricalOwnership = false; holdHistoricalAuction = false;
  if (typeof retryHistoricalOwnership === 'function') retryHistoricalOwnership();
  if (typeof retryHistoricalAuction === 'function') retryHistoricalAuction();
  holdOwnership = true; holdAuction = true; await tick(6000); buyer.send({ type: 'nftOpen' });
  await until(() => typeof holdOwnership === 'function' && typeof holdAuction === 'function', 'current ownership and auction observations in flight');
  const releaseOwnership = holdOwnership, releaseAuction = holdAuction;
  await tick(16000); assert.equal(buyer.player().summonedPet, null, 'hung live observations cannot extend ownership cache indefinitely');
  holdOwnership = true; holdAuction = true; releaseOwnership(); releaseAuction(); await delay(30);
  assert.deepEqual(buyer.player().nftPets, [], 'slow ownership response cannot restart an expired cache');
  assert.equal(buyer.state.walletBalanceWei, null, 'slow current auction observation cannot restart an expired cache');
  const retryOwnership = holdOwnership, retryAuction = holdAuction;
  holdOwnership = false; holdAuction = false;
  if (typeof retryOwnership === 'function') retryOwnership();
  if (typeof retryAuction === 'function') retryAuction();
  for (const [label, timestamp] of [['fractional', at => at + .5], ['future', at => at + 1], ['stale', at => at - 15000], ['missing', () => undefined]]) {
    const previousOwnership = ownershipObservations, previousAuction = auctionObservations;
    ownershipTimestamp = timestamp; auctionTimestamp = timestamp; await tick(16000); buyer.send({ type: 'nftOpen' });
    await until(() => ownershipObservations > previousOwnership && auctionObservations > previousAuction && !buyer.player().nftPets.length && buyer.state.walletBalanceWei === null, `${label} live observation timestamps are rejected`);
    assert.equal(buyer.state.ownershipVerified, false);
  }
  ownershipTimestamp = null; auctionTimestamp = null; await tick(6000); buyer.send({ type: 'nftOpen' });
  await until(() => buyer.player().nftPets.includes('moss-fox') && buyer.state.walletBalanceWei !== null, 'valid live observations recover after rejected timestamps');
  await bind(buyer, wallets[0]); await until(() => !buyer.player().nftPets.length && buyer.player().summonedPet === null, 'wallet switch revokes former wallet entitlement');
  await bind(buyer, wallets[1], true); await until(() => buyer.player().nftPets.includes('moss-fox'), 'auction wallet bind refreshes NFT access');
  await tick(21000);
  const houseId = NFT_HOUSES[0].id;
  assert.match((await reject(seller, { type: 'nftBidHouse', npcId: DEED_AUCTIONEER.id, houseId, amountWei: '1000000000000000000001' })).text, /Bram/);
  await game.stop(); const relocated = JSON.parse(readFileSync(file, 'utf8'));
  for (const token of tokens) Object.assign(relocated[hash(token)].characters[0], deedNearby);
  writeFileSync(file, JSON.stringify(relocated)); await start(); seller = await connect(0); buyer = await connect(1);
  const opened = await request(seller, { type: 'nftAuctionOpen', npcId: DEED_AUCTIONEER.id });
  await until(() => seller.messages.some(message => message.type === 'nftState' && message.openAuction), 'NPC auction opens without an onboarding level gate');
  assert.equal(opened.state.houses.length, 4); assert.equal(opened.state.walletBalanceWei, '5000000000000000000000');
  const bidRequest = { type: 'nftBidHouse', npcId: DEED_AUCTIONEER.id, houseId, amountWei: '1000000000000000000001' };
  await reject(seller, { ...bidRequest, amountWei: '1' }); await reject(seller, { ...bidRequest, price: 1 });
  const bid = await request(seller, bidRequest, 'nftAuctionTransaction');
  assert.equal(bid.wallet, wallets[0].address); assert.equal(bid.paymentWei, bidRequest.amountWei); assert.equal(auctionAbi.parseTransaction(bid.transaction).name, 'bidHouse');
  assert(!stored(0).nftOrders.some(order => order.kind === 'house'), 'house bids never issue mint vouchers or permanent character unlocks');
  const checked = await request(seller, { type: 'nftAuctionCheck', npcId: DEED_AUCTIONEER.id, transactionHash: id('controlled-bid'), action: 'bid', houseId, amountWei: bid.amountWei, paymentWei: bid.paymentWei }, 'nftAuctionChecked');
  assert.equal(checked.state, 'confirmed'); assert.equal(auctionCalls.at(-1).wallet, wallets[0].address);
  assert.equal((await request(seller, { type: 'nftWithdrawBid', npcId: DEED_AUCTIONEER.id }, 'nftAuctionTransaction')).action, 'withdraw');
  assert.equal((await request(seller, { type: 'nftSettleHouse', npcId: DEED_AUCTIONEER.id, houseId }, 'nftAuctionTransaction')).action, 'settle');
  holdBid = true; await tick(); const beforeDelayed = seller.messages.length; seller.send(bidRequest);
  await until(() => typeof holdBid === 'function', 'pending reviewed bid');
  await request(seller, { type: 'leaveWorld' }, 'roster'); const releaseBid = holdBid; holdBid = false; releaseBid(); await tick();
  assert(!seller.messages.slice(beforeDelayed).some(message => message.type === 'nftAuctionTransaction'), 'leaving NPC world invalidates delayed bid response');
  await request(seller, { type: 'selectCharacter', characterId: heroes[0].id }, 'welcome');
  ownership.get(wallets[0].address).houses = [houseId]; await request(seller, { type: 'nftAuctionOpen', npcId: DEED_AUCTIONEER.id });
  await until(() => seller.player().nftHouses.includes(houseId), 'auction winner owns finalized deed');
  ownership.get(wallets[0].address).houses = []; ownership.get(wallets[1].address).houses = [houseId]; await tick(6000);
  await until(() => !seller.player().nftHouses.length && buyer.player().nftHouses.includes(houseId), 'deed resale follows NFT');
  await delay(1100); mkdirSync(`${file}.tmp`);
  const before = stored(0); await reject(seller, { type: 'nftClaimPet', pet: 'bloom-hare' });
  assert.equal(stored(0).carriedItems['bloom-hare'], 1); assert.deepEqual(stored(0).nftOrders, before.nftOrders, 'failed escrow save grants no voucher');
  rmSync(`${file}.tmp`, { recursive: true }); const hare = await quote(seller, 'bloom-hare');
  await tick(360000); expired.add(hare.id); unavailable = true; await tick(6000);
  assert.equal(stored(0).carriedItems['bloom-hare'], undefined, 'uncertain expiry remains escrowed');
  unavailable = false; await tick(6000); await until(() => stored(0).carriedItems['bloom-hare'] === 1, 'finalized expiry restores exactly one pet');
  await tick(6000); assert.equal(stored(0).carriedItems['bloom-hare'], 1);
  const drake = await quote(seller, 'ember-drake'); await game.stop();
  const full = JSON.parse(readFileSync(file, 'utf8')), fullPlayer = full[hash(tokens[0])].characters[0];
  fullPlayer.carriedItems = Object.fromEntries(Object.keys(LOOT_ITEMS).filter(key => key !== 'ember-drake').slice(0, 15).map(key => [key, 1]));
  assert(bagCanFit(fullPlayer)); assert(!bagCanFit(fullPlayer, { carriedItems: { ...fullPlayer.carriedItems, 'ember-drake': 1 } }));
  writeFileSync(file, JSON.stringify(full)); expired.add(drake.id); await tick(360000); await start(); seller = await connect(0); await tick(6000);
  assert.equal(stored(0).nftOrders.find(order => order.id === drake.id).status, 'quoted', 'full bags keep expired escrow recoverable');
  await game.stop(); const freed = JSON.parse(readFileSync(file, 'utf8')); delete freed[hash(tokens[0])].characters[0].carriedItems[Object.keys(fullPlayer.carriedItems)[0]];
  writeFileSync(file, JSON.stringify(freed)); await start(); seller = await connect(0); await tick(6000);
  await until(() => stored(0).carriedItems['ember-drake'] === 1, 'recovery returns reserved pet after capacity becomes available');
  assert(nftPlayerValid(stored(0)));
  // Activate the expanded collection without replacing original vouchers or house deeds.
  await game.stop(); expanded = true;
  const expandedSave = JSON.parse(readFileSync(file, 'utf8')), expandedPlayer = expandedSave[hash(tokens[0])].characters[0];
  expandedPlayer.carriedItems = { 'fern-lynx': 1, 'suncrest-peacock': 1 };
  expandedPlayer.ownedPets.push('store-ashwing', 'store-cinder-kit');
  const storeReceipt = (productId, rewardId) => {
    const orderId = randomUUID(), product = storeProduct(productId), deadline = Math.floor(clock / 1000) + 300;
    return { id: orderId, productId, characterId: expandedPlayer.id, wallet: wallets[0].address, usdPrice: product.usdPrice,
      chainId: 4663, token: MOSS_TOKEN.address, contract: housesContract, amountWei: '1000000000000000000', mossAmount: '1.0', quotedAt: clock, expiresAt: deadline * 1000,
      contractOrder: { orderId: id(orderId), productId: id(productId), characterId: id(expandedPlayer.id), buyer: wallets[0].address, amountWei: '1000000000000000000', usdCents: String(product.usdPrice * 100), deadline },
      signature: '0x' + 'aa'.repeat(65), orderHash: id(orderId), status: 'delivered',
      approval: { to: MOSS_TOKEN.address, data: '0x00', value: '0x0', chainId: '0x1237' }, transaction: { to: housesContract, data: '0x00', value: '0x0', chainId: '0x1237' },
      ...(rewardId ? { paymentBlock: { hash: id('store-finalized'), number: '0x64' }, reward: { kind: 'cosmetic', productId: rewardId, grantedAt: clock } } : {}) };
  };
  expandedPlayer.storeOrders = [storeReceipt('store-ashwing'), storeReceipt('store-cosmetic-box', 'store-cinder-kit')];
  expandedPlayer.storePurchases = ['store-ashwing', 'store-cinder-kit'];
  assert(storePlayerValid(expandedPlayer));
  assert(!storeNftConvertible({ storeOrders: [], mobileStoreOrders: [{ productId: 'store-ashwing', status: 'delivered' }] }, 'store-ashwing'), 'native receipt cannot authorize an irreversible NFT');
  assert(!storeNftConvertible({ storeOrders: [{ ...expandedPlayer.storeOrders[0], status: 'processed' }] }, 'store-ashwing'), 'provisional MOSS reward cannot leave as an NFT');
  const nativePlayer = expandedSave[hash(tokens[1])].characters[0];
  nativePlayer.ownedPets.push('store-ashwing'); nativePlayer.storePurchases = ['store-ashwing'];
  nativePlayer.mobileStoreOrders = [{ id: randomUUID(), characterId: nativePlayer.id, productId: 'store-ashwing', sku: MOBILE_STORE_SKUS['store-ashwing'], platform: 'apple',
    createdAt: clock, expiresAt: clock + 300000, status: 'delivered', purchasedAt: clock, paymentId: '1234567890', sandbox: false,
    reward: { kind: 'cosmetic', productId: 'store-ashwing', grantedAt: clock } }];
  assert(storePlayerValid(nativePlayer));
  writeFileSync(file, JSON.stringify(expandedSave)); await start(); seller = await connect(0); buyer = await connect(1);
  assert.match((await reject(buyer, { type: 'nftClaimPet', pet: 'store-ashwing', source: 'learned' })).text, /verified MOSS purchase/);
  assert(stored(1).ownedPets.includes('store-ashwing')); assert.equal(stored(1).nftOrders.length, 0, 'refundable native purchase never exposes a voucher');
  assert.equal(seller.state.petsContract, petsV2Contract); assert.equal(seller.state.legacyPetsContract, petsContract);
  assert.equal(seller.player().nftMintablePets.length, 26);
  const fern = await quote(seller, 'fern-lynx'); assert.equal(fern.contractOrder.assetId, 9); assert.equal(fern.contract, petsV2Contract);
  assert.equal(stored(0).carriedItems['fern-lynx'], undefined); assert.equal(fern.claimSource, undefined);
  paid.add(fern.id); await request(seller, { type: 'nftPaymentCheck', orderId: fern.id });
  assert(!stored(0).ownedPets.includes('fern-lynx'));
  const peacock = await quote(seller, 'suncrest-peacock');
  assert.equal(peacock.contractOrder.assetId, 26); assert.equal(peacock.contract, petsV2Contract);
  assert.equal(stored(0).carriedItems['suncrest-peacock'], undefined, 'new rotation drop is escrowed before issuing its claim');
  assert.equal((await quote(seller, 'suncrest-peacock')).id, peacock.id, 'new species retries reuse the reserved claim');
  paid.add(peacock.id); ownership.get(wallets[0].address).pets = ['suncrest-peacock'];
  await request(seller, { type: 'nftPaymentCheck', orderId: peacock.id });
  await request(seller, { type: 'summonPet', pet: 'suncrest-peacock' }, 'snapshot');
  await until(() => seller.player().summonedPet === 'suncrest-peacock', 'new species NFT grants its current owner a summon');
  assert(!stored(0).ownedPets.includes('suncrest-peacock')); assert.equal(stored(0).summonedPet, null);
  ownership.get(wallets[0].address).pets = []; ownership.get(wallets[1].address).pets = [...ownership.get(wallets[1].address).pets, 'suncrest-peacock']; await tick(6000);
  await until(() => seller.player().summonedPet === null && buyer.player().nftPets.includes('suncrest-peacock'), 'new species transfer moves summon access');
  await reject(seller, { type: 'summonPet', pet: 'suncrest-peacock' });
  await request(buyer, { type: 'summonPet', pet: 'suncrest-peacock' }, 'snapshot');
  await until(() => buyer.player().summonedPet === 'suncrest-peacock', 'new species buyer can summon');
  const learnedBefore = [...stored(0).ownedPets];
  assert.match((await reject(seller, { type: 'nftClaimPet', pet: 'moon-owl' })).text, /unclaimed/);
  assert.deepEqual(stored(0).ownedPets, learnedBefore, 'a reviewed missing bag drop never falls back to removing a learned pet');
  const owl = await quote(seller, 'moon-owl', 'learned'); assert.equal(owl.claimSource, 'learned'); assert(!stored(0).ownedPets.includes('moon-owl'));
  expired.add(owl.id); await tick(360000); await request(seller, { type: 'nftPaymentCheck', orderId: owl.id });
  assert(stored(0).ownedPets.includes('moon-owl')); assert.equal(stored(0).carriedItems['moon-owl'], undefined, 'expired learned claim restores its source, not a new tradeable copy');
  const ashwing = await quote(seller, 'store-ashwing', 'learned'); assert.equal(ashwing.claimSource, 'learned'); assert.equal(ashwing.contractOrder.assetId, 17);
  assert(!stored(0).ownedPets.includes('store-ashwing')); assert(stored(0).storePurchases.includes('store-ashwing')); assert(storePlayerValid(stored(0)));
  assert.equal((await quote(seller, 'store-ashwing', 'learned')).id, ashwing.id, 'store conversion retries reuse the same reservation');
  paid.add(ashwing.id); await request(seller, { type: 'nftPaymentCheck', orderId: ashwing.id });
  assert(!stored(0).ownedPets.includes('store-ashwing')); assert(storePlayerValid(stored(0)));
  assert(!storeCosmeticPool(stored(0)).some(product => product.id === 'store-ashwing'), 'converted store pet cannot be redrawn from its retained purchase history');
  assert.match((await reject(seller, { type: 'nftClaimPet', pet: 'store-ashwing' })).text, /verified MOSS|unclaimed|learned/);
  const kit = await quote(seller, 'store-cinder-kit', 'learned'); assert.equal(kit.contractOrder.assetId, 18);
  expired.add(kit.id); await tick(360000); await request(seller, { type: 'nftPaymentCheck', orderId: kit.id });
  assert(stored(0).ownedPets.includes('store-cinder-kit')); assert(storePlayerValid(stored(0)), 'expired box-reward conversion restores the original unlock');
  migrationToken = fox.tokenId;
  const reviewed = await request(seller, { type: 'nftMigrationReview', tokenId: migrationToken }, 'nftMigrationQuote');
  assert.equal(reviewed.migration.contract, petsV2Contract); assert.equal(reviewed.migration.legacyContract, petsContract);
  await reject(buyer, { type: 'nftMigrationReview', tokenId: migrationToken });
  await reject(seller, { type: 'nftMigrationReview', tokenId: migrationToken, wallet: wallets[1].address });
  await game.stop(); await start(); seller = await connect(0);
  assert(!stored(0).ownedPets.includes('store-ashwing')); assert(storePlayerValid(stored(0)), 'converted store entitlement survives restart without duplicate reward');
  assert.equal(stored(0).nftOrders.find(order => order.id === fox.id).contract, petsContract, 'cutover keeps old claim history pinned to original contract');
  assert.equal(stored(0).nftOrders.find(order => order.id === peacock.id).status, 'minted', 'new species settlement survives restart');
  buyer = await connect(1); assert(buyer.player().nftPets.includes('suncrest-peacock')); assert(!stored(1).ownedPets.includes('suncrest-peacock'));
  // Mount items share the durable mint escrow but use a separate collection and riding authority.
  await game.stop();
  const mountSave = JSON.parse(readFileSync(file, 'utf8')), mountSeller = mountSave[hash(tokens[0])].characters[0], mountBuyer = mountSave[hash(tokens[1])].characters[0];
  for (const p of [mountSeller, mountBuyer]) {
    Object.assign(p, { level: 25, ridingRank: 1, x: 0, z: 8, zone: 'greenwood', carriedItems: { 'verdant-revenant': 3 } });
    p.hp = p.maxHp = maxHealth(p);
  }
  mountSeller.ownedMounts = ['horse', 'wolf', 'store-embermane', 'store-cinderfang'];
  mountSeller.storeOrders.push(storeReceipt('store-embermane'), storeReceipt('store-cosmetic-box', 'store-cinderfang'));
  mountSeller.storePurchases.push('store-embermane', 'store-cinderfang');
  mountBuyer.ownedMounts = ['store-embermane']; mountBuyer.storePurchases.push('store-embermane');
  mountBuyer.mobileStoreOrders.push({ ...mountBuyer.mobileStoreOrders[0], id: randomUUID(), paymentId: '2234567890', productId: 'store-embermane', sku: MOBILE_STORE_SKUS['store-embermane'], reward: { kind: 'cosmetic', productId: 'store-embermane', grantedAt: clock } });
  assert(storePlayerValid(mountSeller)); assert(storePlayerValid(mountBuyer));
  writeFileSync(file, JSON.stringify(mountSave)); await start(); seller = await connect(0); buyer = await connect(1);
  for (const mount of ['horse', 'wolf']) assert.match((await reject(seller, { type: 'nftClaimMount', mount, source: 'learned' })).text, /mintable/);
  assert.match((await reject(seller, { type: 'nftClaimMount', mount: 'verdant-revenant' })).text, /unavailable/);
  assert.equal(stored(0).carriedItems['verdant-revenant'], 3, 'disabled mount minting cannot reserve a drop');
  await request(seller, { type: 'learnMount', mount: 'verdant-revenant' }, 'snapshot');
  await until(() => stored(0).ownedMounts.includes('verdant-revenant'), 'mount drop learns once');
  assert.equal(stored(0).carriedItems['verdant-revenant'], 2);
  assert.match((await reject(seller, { type: 'learnMount', mount: 'verdant-revenant' })).text, /already know/);
  mountsEnabled = true; await tick(21000);
  assert.match((await reject(seller, { type: 'nftClaimMount', mount: 'verdant-revenant', source: 'forged' })).text, /source/);
  assert.match((await reject(buyer, { type: 'nftClaimMount', mount: 'store-embermane', source: 'learned' })).text, /verified MOSS/);
  await delay(1100); mkdirSync(`${file}.tmp`);
  const ordersBeforeMount = stored(0).nftOrders.length;
  await reject(seller, { type: 'nftClaimMount', mount: 'verdant-revenant' });
  assert.equal(stored(0).carriedItems['verdant-revenant'], 2); assert.equal(stored(0).nftOrders.length, ordersBeforeMount);
  rmSync(`${file}.tmp`, { recursive: true });
  const mountItem = await quote(seller, 'verdant-revenant', undefined, 'mount');
  assert.equal(mountItem.contract, mountsContract); assert.equal(mountItem.contractOrder.assetId, 1); assert.equal(mountItem.amountWei, '0');
  assert.equal(stored(0).carriedItems['verdant-revenant'], 1); assert(stored(0).ownedMounts.includes('verdant-revenant'));
  assert.equal((await quote(seller, 'verdant-revenant', undefined, 'mount')).id, mountItem.id);
  await game.stop(); await start(); seller = await connect(0); buyer = await connect(1);
  assert.equal(stored(0).carriedItems['verdant-revenant'], 1, 'mount reservation survives restart');
  expired.add(mountItem.id); unavailable = true; await tick(360000);
  assert.equal(stored(0).carriedItems['verdant-revenant'], 1, 'uncertain mount expiry stays reserved');
  unavailable = false; await tick(21000); await request(seller, { type: 'nftPaymentCheck', orderId: mountItem.id });
  assert.equal(stored(0).carriedItems['verdant-revenant'], 2, 'finalized mount expiry restores exactly one item');
  const learnedMount = await quote(seller, 'verdant-revenant', 'learned', 'mount');
  assert(!stored(0).ownedMounts.includes('verdant-revenant')); assert.equal(stored(0).carriedItems['verdant-revenant'], 2);
  assert.match((await reject(seller, { type: 'learnMount', mount: 'verdant-revenant' })).text, /reserved/);
  paid.add(learnedMount.id); ownership.get(wallets[0].address).mounts = ['verdant-revenant'];
  await request(seller, { type: 'nftPaymentCheck', orderId: learnedMount.id });
  await until(() => seller.player().nftMounts.includes('verdant-revenant'), 'minted wallet can ride without permanent unlock');
  await request(seller, { type: 'mount', mount: 'verdant-revenant' }, 'snapshot'); await tick(2200);
  await until(() => seller.player().travel.mount === 'verdant-revenant', 'NFT mount cast completes');
  ownership.get(wallets[0].address).mounts = []; ownership.get(wallets[1].address).mounts = ['verdant-revenant']; await tick(6000);
  await until(() => !seller.player().travel.mount && buyer.player().nftMounts.includes('verdant-revenant'), 'transfer revokes riding and grants new wallet');
  assert(!stored(0).ownedMounts.includes('verdant-revenant')); assert(!stored(1).ownedMounts.includes('verdant-revenant'));
  await request(buyer, { type: 'mount', mount: 'verdant-revenant' }, 'snapshot');
  ownership.get(wallets[1].address).mounts = []; await request(buyer, { type: 'nftOpen' }); await tick(2200);
  assert.equal(buyer.player().travel.mount, null, 'ownership loss during preparation cancels mount cast');
  ownership.get(wallets[1].address).mounts = ['verdant-revenant']; await request(buyer, { type: 'nftOpen' });
  holdOwnership = true; await tick(); buyer.send({ type: 'mount', mount: 'verdant-revenant' });
  await until(() => typeof holdOwnership === 'function', 'mount waits for current wallet ownership');
  await tick(3100); const mountObservedAt = clock, releaseMountOwnership = holdOwnership; holdOwnership = false; releaseMountOwnership();
  await until(() => buyer.player().casting?.ability === 'mount', 'mount preparation starts after ownership read');
  assert.equal(buyer.player().casting.startedAt, mountObservedAt, 'slow ownership RPC cannot backdate the mount cast');
  await tick(1999); assert.equal(buyer.player().travel.mount, null); await tick(1);
  await until(() => buyer.player().travel.mount === 'verdant-revenant', 'buyer rides NFT mount');
  unavailable = true; await tick(16000); await until(() => buyer.player().travel.mount === null, 'stale ownership cannot retain mount speed');
  unavailable = false; await tick(21000);
  mountsVerified = false; await request(buyer, { type: 'nftOpen' }); assert.deepEqual(buyer.state.ownedMounts, [], 'unverified mount collection grants no access');
  mountsVerified = true;
  const ember = await quote(seller, 'store-embermane', 'learned', 'mount'); assert.equal(ember.contractOrder.assetId, 2);
  assert(!stored(0).ownedMounts.includes('store-embermane')); assert(storePlayerValid(stored(0)));
  paid.add(ember.id); await request(seller, { type: 'nftPaymentCheck', orderId: ember.id }); assert(storePlayerValid(stored(0)));
  assert(!storeCosmeticPool(stored(0)).some(product => product.id === 'store-embermane'));
  const cinder = await quote(seller, 'store-cinderfang', 'learned', 'mount'); assert.equal(cinder.contractOrder.assetId, 3);
  expired.add(cinder.id); await tick(360000); await request(seller, { type: 'nftPaymentCheck', orderId: cinder.id });
  assert(stored(0).ownedMounts.includes('store-cinderfang')); assert(storePlayerValid(stored(0)));
  await game.stop(); await start(); seller = await connect(0);
  assert(!stored(0).ownedMounts.includes('store-embermane')); assert(storePlayerValid(stored(0))); assert(nftPlayerValid(stored(0)));
  assert.equal(stored(0).nftMounts, undefined, 'wallet riding access never persists as an unlock');
  console.log('PASS mount vendor exclusions, optional collection, drop learning, exact escrow and restart, expiry, learned/store/native conversion, transfer/cast/stale-access revocation.');
  console.log('PASS NFT V2 all26, learned/store/native consent and recovery, migration review, restart; fresh live observations after 16s historical reads, stale 16s live observations rejected, fractional/future/missing/exact-15s timestamps rejected, eight new-pet learned conversions and drop escrow, new-collection availability, source validation, one-time conversion, full-bag learned restitution, pending/redeemed restart, unlinked-wallet explicit and scheduled auction refresh, wallet proofs, NPC auction proximity and exact bid/withdraw/settle/receipt transactions, delayed-response guards, durable escrow/retries, deletion fences, offline settlement, ownership transfer, transient summon, RPC/cache expiry, independent learned pets, save rollback and bag-capacity recovery. No live mint or burn.');
} finally {
  if (typeof holdOwnership === 'function') holdOwnership();
  if (typeof holdHistoricalOwnership === 'function') holdHistoricalOwnership();
  if (typeof holdHistoricalAuction === 'function') holdHistoricalAuction();
  if (typeof holdAuction === 'function') holdAuction();
  if (typeof holdBid === 'function') holdBid();
  rmSync(`${file}.tmp`, { recursive: true, force: true }); for (const c of clients) c.socket.terminate(); await game?.stop(); Date.now = realNow; rmSync(dir, { recursive: true, force: true });
}
