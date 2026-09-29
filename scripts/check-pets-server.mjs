import { COMMUNITY_VERSION } from '../src/community.ts';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { PETS, isPetId, petById } from '../src/pets.ts';
import { LOOT_ITEMS, rollMonsterLoot } from '../src/loot-items.ts';
import { MONSTERS, WORLD_BOSSES } from '../src/bestiary.ts';
import { starterGear, GEAR } from '../src/progression.ts';
import { bagUsage, newBags } from '../src/bags.ts';
import { canTraverse, regionAt, OVERWORLD_SPAWNS } from '../src/realm.ts';
import { AUCTIONEER } from '../src/city.ts';
import { newBank, bankWithdraw } from '../src/bank.ts';
import { DEATH_ANIMATION_MS } from '../src/shared.ts';

const retiredIds = ['fern-lynx', 'moonveil-gryphlet', 'cinder-salamander', 'amethyst-terrapin', 'blossom-jackalope', 'lantern-sprite', 'rime-red-panda', 'crown-pangolin', 'moss-fox', 'moon-owl', 'ember-drake', 'crystal-tortoise', 'bloom-hare', 'lantern-moth', 'frost-cub', 'golden-pig'];
const dropSources = { 'bramble-badger': 'bramble-wolf', 'duskwind-raven': 'briar-sentinel', 'ember-axolotl': 'ember-beetle', 'geode-hedgehog': 'stone-golem', 'clover-mouse': 'moss-slime', 'dewbell-dragonfly': 'grove-spider', 'snowcap-stoat': 'frost-yeti', 'suncrest-peacock': 'ashen-crown-titan' };
const retiredCopies = Object.fromEntries(retiredIds.map(id => [id, 1]));
const dir = mkdtempSync(join(tmpdir(), 'mossvale-pets-')), file = join(dir, 'players.json'), clients = [];
const realNow = Date.now, realRandom = Math.random;
let clock = realNow(), game, port;
Date.now = () => clock;
const hash = token => createHash('sha256').update(token).digest('hex');
const titan = WORLD_BOSSES.find(boss => boss.kind === 'ashen-crown-titan');
const slimeSpawn = OVERWORLD_SPAWNS.find(spawn => spawn.kind === 'moss-slime');
const appearance = { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' };
const nearAuction = Array.from({ length: 32 }, (_, i) => ({ x: AUCTIONEER.x + Math.cos(i * Math.PI / 16) * 1.2, z: AUCTIONEER.z + Math.sin(i * Math.PI / 16) * 1.2 })).find(p => canTraverse(p, AUCTIONEER));
assert(nearAuction);
function hero(name, extra = {}) {
  return { id: randomUUID(), name, appearance, x: titan.x, z: titan.z + 2, zone: titan.zone, coordinateVersion: 2, rotation: 0,
    characterCreated: true, ...starterGear('Ranger'), ...newBags(), talents: [], level: 75, hp: 988, maxHp: 988, xp: 0, gold: 1000,
    inventory: { wood: 0, crystal: 0, herb: 0, potion: 0, relic: 0 }, learnedSpells: ['arrow'], ridingRank: 0, ownedMounts: [],
    quest: { stage: 0, kills: 0, crystals: 0 }, ...extra };
}
const heroes = {
  keeper: hero('Retired Pet Keeper', { ...nearAuction, zone: regionAt(nearAuction.x, nearAuction.z), ownedPets: retiredIds, summonedPet: 'golden-pig' }),
  legacy: hero('Retired Pet Trader', { ...nearAuction, zone: regionAt(nearAuction.x, nearAuction.z), carriedItems: retiredCopies, bank: { ...newBank(), items: retiredCopies } }),
  owner: hero('Pet Collector', { carriedItems: { 'bloom-hare': 1 } }), observer: hero('Pet Buyer', { x: titan.x + 1 }),
  full: hero('Full Backpack', { x: titan.x - 1, carriedItems: {} }),
  slime: hero('Hare Collector', { x: slimeSpawn.x, z: slimeSpawn.z + 2, zone: slimeSpawn.zone }),
  seller: hero('Pet Trader', { ...nearAuction, zone: regionAt(nearAuction.x, nearAuction.z), carriedItems: { 'moon-owl': 2, 'ember-drake': 1 }, ownedPets: ['moss-fox'], summonedPet: 'moss-fox' }),
};
for (const gear of Object.values(GEAR)) if (bagUsage(heroes.full) < 16 && gear.requiredLevel <= heroes.full.level && (!gear.className || gear.className === 'Ranger') && !heroes.full.ownedGear.includes(gear.id)) heroes.full.ownedGear.push(gear.id);
assert.equal(bagUsage(heroes.full), 16);
const sibling = hero('Another Collector');
const tokens = Object.fromEntries(Object.keys(heroes).map(key => [key, randomBytes(32).toString('base64url')]));
const assets = p => structuredClone({ ownedPets: p.ownedPets, summonedPet: p.summonedPet, carriedItems: p.carriedItems, gold: p.gold });
const readSave = () => JSON.parse(readFileSync(file, 'utf8'));
const stored = key => readSave()[hash(tokens[key])].characters[0];
async function until(fn, label) { const end = realNow() + 6000; while (realNow() < end) { const value = fn(); if (value) return value; await delay(10); } throw Error(`Timed out: ${label}`); }
async function tick(ms = 700) { clock += ms; await delay(120); }
async function start() {
  const titanHp = MONSTERS[titan.kind].hp, slimeHp = MONSTERS['moss-slime'].hp;
  MONSTERS[titan.kind].hp = 300; MONSTERS['moss-slime'].hp = 1;
  const disabledChain = { status: async () => ({ enabled: false, reason: 'Wallet payments disabled in local pet check.' }) };
  try { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '', auctionChain: disabledChain, mossAuctionChain: disabledChain }); }
  finally { MONSTERS[titan.kind].hp = titanHp; MONSTERS['moss-slime'].hp = slimeHp; }
  port = await game.start();
}
async function connect(key, characterId = heroes[key].id) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, messages: [], characterId }; clients.push(c);
  c.send = message => socket.send(JSON.stringify(message)); c.player = () => c.snapshot?.players.find(p => p.id === c.characterId);
  c.drop = id => c.snapshot?.loot.find(drop => drop.id === id);
  socket.on('message', raw => { const message = JSON.parse(raw); c.messages.push(message); if (['snapshot', 'roster', 'auction'].includes(message.type)) c[message.type] = message; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token: tokens[key], characterId }); await until(() => c.player(), `${key} enters world`); return c;
}
async function reject(c, message, label) {
  await tick(); const before = assets(c.player()), index = c.messages.length; c.send(message);
  const result = await until(() => c.messages.slice(index).find(m => m.type === 'event' && m.kind === 'info'), label);
  await delay(120); assert.deepEqual(assets(c.player()), before, `${label}: ownership and summon unchanged`); return result;
}
async function learn(c, pet) { c.send({ type: 'learnPet', pet }); await until(() => c.player().ownedPets.includes(pet), `${pet} learned`); }
async function summon(c, pet) { c.send({ type: 'summonPet', pet }); await until(() => c.player().summonedPet === pet, `${pet} summon saved`); }
async function kill(c, targetId, extraParticipant) {
  await tick(2000); const index = c.messages.length;
  c.send({ type: 'attack', ability: 'arrow', targetId });
  if (extraParticipant) extraParticipant.send({ type: 'attack', ability: 'arrow', targetId });
  await until(() => c.messages.slice(index).some(m => m.type === 'combat' && m.playerId === c.characterId && m.targets.some(target => target.id === targetId)), 'real ranged attack accepted');
  if (extraParticipant) await until(() => c.messages.slice(index).some(m => m.type === 'combat' && m.playerId === extraParticipant.characterId), 'second participant accepted');
  Math.random = () => 0;
  try { await tick(600); return await until(() => c.snapshot.loot.find(d => d.enemyId === targetId && d.ownerId === c.characterId), 'real personal corpse'); }
  finally { Math.random = realRandom; }
}
async function collect(c, dropId, pet) {
  c.send({ type: 'loot', targetId: dropId, itemId: `item:${pet}` });
  await until(() => !c.drop(dropId)?.items.some(row => row.itemId === pet), `${pet} corpse row durably collected`);
}
const auctionRequest = (type, extra = {}) => ({ type, npcId: AUCTIONEER.id, ...extra });
async function browse(c) { c.send(auctionRequest('auctionOpen')); await until(() => c.auction, 'auction opened'); }
async function list(c, pet, quantity = 1) {
  const ids = new Set(c.auction.mine.map(listing => listing.id));
  const remaining = (c.player().carriedItems[pet] ?? 0) - quantity;
  c.send(auctionRequest('auctionList', { item: { kind: 'item', id: pet, quantity }, currency: 'gold', price: '25' }));
  const listing = await until(() => c.auction.mine.find(listing => !ids.has(listing.id)), 'pet escrow committed');
  // The auction update arrives before the separate authoritative inventory snapshot.
  await until(() => (c.player().carriedItems[pet] ?? 0) === remaining, 'pet escrow inventory snapshot');
  return listing;
}
async function stop() { for (const c of clients) c.socket.terminate(); await game?.stop(); game = undefined; }
try {
  assert.equal(PETS.filter(pet => !pet.storeOnly && !('referralOnly' in pet)).length, 25);
  assert.deepEqual(PETS.filter(pet => pet.retired).map(pet => pet.id), retiredIds);
  assert.deepEqual(Object.fromEntries(PETS.filter(pet => pet.dropChance > 0).map(pet => [pet.id, pet.source])), dropSources); assert.equal(new Set(PETS.map(pet => pet.id)).size, PETS.length);
  for (const pet of PETS.filter(pet => pet.storeOnly)) {
    assert.equal(pet.source, null); assert.equal(pet.dropChance, 0); assert.equal(LOOT_ITEMS[pet.id], undefined, 'paid companions are not loot, auction items or GM items');
    for (const kind of Object.keys(MONSTERS)) assert(!rollMonsterLoot(kind, 75, heroes.owner, () => 0, { worldBoss: true, instanceId: null }).some(row => row.itemId === pet.id));
  }
  assert.equal(petById('death-apostle').source,null);assert.equal(petById('death-apostle').dropChance,0);
  for(const kind of Object.keys(MONSTERS))assert(!rollMonsterLoot(kind,60,heroes.owner,()=>0,{worldBoss:true,instanceId:null}).some(row=>row.itemId==='death-apostle'),'raid pet is not ordinary monster loot');
  assert.equal(isPetId('__proto__'), false); assert.equal(petById({}), undefined);
  const ordinarySource = { worldBoss: false, instanceId: null }, worldBossSource = { worldBoss: true, instanceId: null };
  for (const id of retiredIds) {
    const pet = petById(id);
    assert(isPetId(id)); assert(pet.retired); assert.equal(pet.source, null); assert.equal(pet.dropChance, 0);
    assert.equal(LOOT_ITEMS[id].category, 'pet', 'retired copies remain accepted inventory, bank and auction items');
  }
  for (const kind of Object.keys(MONSTERS)) for (const source of [undefined, ordinarySource, worldBossSource, { worldBoss: true, instanceId: 'dungeon' }]) {
    const rows = rollMonsterLoot(kind, 40, heroes.owner, () => 0, source);
    assert(!rows.some(row => retiredIds.includes(row.itemId)), `${kind}: no retired companions in any drop path`);
  }
  for (const source of [ordinarySource, worldBossSource, { worldBoss: false, instanceId: 'dungeon' }]) {
    for (const kind of Object.keys(MONSTERS)) for (const level of [1, 9]) {
      const rows = rollMonsterLoot(kind, level, heroes.owner, () => 0, source);
      assert(!rows.some(row => isPetId(row.itemId)), `${kind} level ${level}: monsters below level 10 never drop pets`);
    }
    for (const level of [1, 9, 10, 75]) {
      const rows = rollMonsterLoot('moss-slime', level, heroes.owner, () => 0, source);
      assert(!rows.some(row => isPetId(row.itemId)), `slime level ${level}: slimes never drop pets`);
      assert(rows.some(row => row.itemId === 'slime-residue'), 'slimes still drop ordinary loot');
    }
  }
  for (const pet of PETS.filter(pet => pet.dropChance > 0 && pet.source !== 'moss-slime')) {
    const source = pet.id === 'suncrest-peacock' ? worldBossSource : ordinarySource, level = pet.id === 'suncrest-peacock' ? 40 : 10;
    const rows = value => rollMonsterLoot(pet.source, level, heroes.owner, () => value, source).filter(row => row.itemId === pet.id);
    assert.deepEqual(rows(0).map(row => [row.kind, row.itemId, row.quantity]), [['item', pet.id, 1]]);
    assert.equal(rows(pet.dropChance - Number.EPSILON).length, 1, `${pet.id}: just below the threshold drops`);
    assert.equal(rows(pet.dropChance).length, 0, `${pet.id}: exact threshold misses`);
    assert.equal(rows(.9999).length, 0);
    assert.equal(pet.dropChance, .00025, `${pet.id}: 0.025% per eligible kill`);
    assert.equal(LOOT_ITEMS[pet.id].category, 'pet'); assert.equal(LOOT_ITEMS[pet.id].sellPrice, 0);
    assert(rollMonsterLoot(pet.source, level, { ...heroes.owner, ownedPets: [pet.id] }, () => 0, source).some(row => row.itemId === pet.id), 'learned pets still drop as auctionable duplicates');
    assert(!rollMonsterLoot(pet.source, level, heroes.owner, () => 0).some(row => row.itemId === pet.id), 'cache rolls without a killed enemy do not award pets');
    if (pet.source !== 'ashen-crown-titan') assert(rollMonsterLoot(pet.source, 10, { ...heroes.owner, level: 1 }, () => 0, { worldBoss: false, instanceId: 'dungeon' }).some(row => row.itemId === pet.id), 'level 10 dungeon sources remain eligible regardless of player level');
  }
  for (const [kind, level, source] of [['ashen-crown-titan', 40, ordinarySource], ['ashen-crown-titan', 39, worldBossSource], ['ashen-crown-titan', 41, worldBossSource], ['ashen-crown-titan', 40, { worldBoss: true, instanceId: 'dungeon' }], ['stormhorn-behemoth', 40, worldBossSource]]) {
    assert(!rollMonsterLoot(kind, level, heroes.owner, () => 0, source).some(row => row.itemId === 'suncrest-peacock'), 'Suncrest Peacock is exclusive to the actual level 40 world boss');
  }
  writeFileSync(file, JSON.stringify(Object.fromEntries(Object.entries(heroes).map(([key, p]) => [hash(tokens[key]), { characters: key === 'owner' ? [p, sibling] : [p] }]))));
  await start(); let owner = await connect('owner'), observer = await connect('observer'), full = await connect('full'), seller = await connect('seller'), slime = await connect('slime');
  assert.deepEqual(owner.player().ownedPets, []); assert.equal(owner.player().summonedPet, null, 'legacy migration defaults to no learned/summoned pets');
  for (const pet of PETS.filter(pet => pet.storeOnly)) {
    await reject(owner, { type: 'learnPet', pet: pet.id }, 'paid pet cannot be learned without a burn');
    await reject(owner, { type: 'summonPet', pet: pet.id }, 'unowned paid pet cannot be summoned');
  }
  let keeper = await connect('keeper'), legacy = await connect('legacy');
  assert.deepEqual(keeper.player().ownedPets, retiredIds); assert.equal(keeper.player().summonedPet, 'golden-pig', 'pre-existing summon survives retirement');
  assert.deepEqual(legacy.player().carriedItems, retiredCopies, 'all sixteen carried legacy copies survive loading');
  assert.deepEqual(stored('legacy').bank.items, retiredCopies, 'all sixteen banked legacy copies survive loading');
  await browse(legacy);
  for (const id of retiredIds) await list(legacy, id);
  assert.deepEqual(legacy.player().carriedItems, {}, 'legacy items can enter auction escrow');
  const legacyEscrow = structuredClone(stored('legacy').auctions);
  const bossId = WORLD_BOSSES.find(boss => boss.kind === 'ashen-crown-titan').id;
  assert.deepEqual([owner.snapshot.enemies.find(e => e.id === bossId).level, owner.snapshot.enemies.find(e => e.id === bossId).worldBoss], [40, true]);
  const peacockDrop = await kill(owner, bossId, full);
  assert(peacockDrop.items.some(row => row.itemId === 'suncrest-peacock')); assert.deepEqual(owner.player().ownedPets, []); assert.equal(owner.player().carriedItems['suncrest-peacock'], undefined, 'death awards a corpse row, not collection ownership');
  const fullDrop = await until(() => full.snapshot.loot.find(drop => drop.enemyId === bossId && drop.ownerId === full.characterId), 'second credited player has own corpse');
  await reject(owner, { type: 'loot', targetId: peacockDrop.id, itemId: 'item:suncrest-peacock' }, 'death animation gate');
  await tick(DEATH_ANIMATION_MS);
  await reject(observer, { type: 'loot', targetId: peacockDrop.id, itemId: 'item:suncrest-peacock' }, 'foreign corpse is rejected');
  await reject(full, { type: 'loot', targetId: fullDrop.id, itemId: 'item:suncrest-peacock' }, 'unlearned pet requires bag space');
  await delay(1200); mkdirSync(`${file}.tmp`);
  await reject(owner, { type: 'loot', targetId: peacockDrop.id, itemId: 'item:suncrest-peacock' }, 'failed pickup save retains corpse');
  assert(owner.drop(peacockDrop.id).items.some(row => row.itemId === 'suncrest-peacock')); assert.equal(stored('owner').carriedItems['suncrest-peacock'], undefined);
  rmSync(`${file}.tmp`, { recursive: true }); await collect(owner, peacockDrop.id, 'suncrest-peacock');
  assert.equal(owner.player().carriedItems['suncrest-peacock'], 1); assert.deepEqual(owner.player().ownedPets, []);
  await reject(owner, { type: 'loot', targetId: peacockDrop.id, itemId: 'item:suncrest-peacock' }, 'pickup cannot be replayed');
  const slimeDrop = await kill(slime, slimeSpawn.id); assert(!slimeDrop.items.some(row => isPetId(row.itemId)), 'real slime kills never award pets');
  await tick(DEATH_ANIMATION_MS); await collect(slime, slimeDrop.id, 'slime-residue');
  assert.equal(slime.player().carriedItems['slime-residue'], 1);
  for (const message of [{ type: 'summonPet', pet: 'suncrest-peacock' }, { type: 'summonPet' }, { type: 'summonPet', pet: ['suncrest-peacock'] }, { type: 'summonPet', pet: '__proto__' }, { type: 'summonPet', pet: null, extra: true }, { type: 'learnPet', pet: null }, { type: 'learnPet', pet: 'moss-fox' }, { type: 'learnPet', pet: 'suncrest-peacock', quantity: 0 }, { type: 'learnPet', pet: 'suncrest-peacock', ownedPets: ['suncrest-peacock'] }]) await reject(owner, message, 'forged, unlearned or missing pet rejected');
  await reject(owner, { type: 'useItem', itemId: 'suncrest-peacock' }, 'ordinary consume does not learn pets');
  await reject(owner, { type: 'sellItem', npcId: 'city-armorer', itemId: 'suncrest-peacock', quantity: 1 }, 'pets cannot be destroyed by NPC sale');
  await delay(1200); mkdirSync(`${file}.tmp`);
  await reject(owner, { type: 'learnPet', pet: 'suncrest-peacock' }, 'failed learn save keeps item and collection');
  assert.equal(stored('owner').carriedItems['suncrest-peacock'], 1); assert.deepEqual(stored('owner').ownedPets, []);
  rmSync(`${file}.tmp`, { recursive: true }); await learn(owner, 'suncrest-peacock');
  assert.equal(owner.player().carriedItems['suncrest-peacock'], undefined); assert.equal(owner.player().summonedPet, null, 'learning does not silently replace a summoned companion');
  await learn(owner, 'bloom-hare'); await summon(owner, 'suncrest-peacock');
  await until(() => observer.snapshot.players.some(p => p.id === owner.characterId && p.summonedPet === 'suncrest-peacock'), 'nearby player sees authoritative summon');
  await summon(owner, 'bloom-hare'); assert.equal(owner.player().summonedPet, 'bloom-hare', 'summon replaces the sole active pet');
  await delay(1200); mkdirSync(`${file}.tmp`);
  await reject(owner, { type: 'summonPet', pet: 'suncrest-peacock' }, 'failed summon save keeps active pet');
  rmSync(`${file}.tmp`, { recursive: true }); await summon(owner, null); await summon(owner, 'suncrest-peacock');
  const durable = assets(owner.player()); await stop();
  const positioned = readSave(); Object.assign(positioned[hash(tokens.observer)].characters[0], nearAuction, { zone: regionAt(nearAuction.x, nearAuction.z) }); writeFileSync(file, JSON.stringify(positioned));
  await start(); owner = await connect('owner'); observer = await connect('observer'); seller = await connect('seller');
  assert.deepEqual(assets(owner.player()), durable, 'items, collection and active summon survive restart');
  keeper = await connect('keeper'); legacy = await connect('legacy');
  assert.deepEqual(keeper.player().ownedPets, retiredIds); assert.equal(keeper.player().summonedPet, 'golden-pig', 'legacy owned and active pets survive a save and restart');
  assert.deepEqual(stored('legacy').auctions, legacyEscrow, 'all sixteen legacy auction copies survive a save and restart');
  assert.deepEqual(stored('legacy').bank.items, retiredCopies, 'all sixteen legacy bank copies survive a save and restart');
  await browse(legacy);
  for (const id of retiredIds) {
    legacy.send(auctionRequest('auctionCancel', { listingId: legacyEscrow.find(listing => listing.item.id === id).id }));
    await until(() => legacy.player().carriedItems[id] === 1, `${id}: retired auction copy returned`);
    await learn(legacy, id); await summon(legacy, id);
    const withdrawal = bankWithdraw(stored('legacy'), { kind: 'item', id, quantity: 1 });
    assert(withdrawal && withdrawal.carriedItems[id] === 1 && !withdrawal.bank.items[id], `${id}: banked legacy copies remain withdrawable`);
    assert.deepEqual(withdrawal.ownedPets, legacy.player().ownedPets, 'withdrawal keeps the learned collection');
  }
  assert.deepEqual(legacy.player().ownedPets, retiredIds);
  await browse(seller); await browse(observer);
  const owl = await list(seller, 'moon-owl', 2); assert.equal(seller.player().carriedItems['moon-owl'], undefined);
  await reject(seller, { type: 'learnPet', pet: 'moon-owl' }, 'escrowed pet cannot also be learned');
  seller.send(auctionRequest('auctionCancel', { listingId: owl.id })); await until(() => seller.player().carriedItems['moon-owl'] === 2, 'cancel returns unlearned pet stack');
  await learn(seller, 'moon-owl'); assert.equal(seller.player().carriedItems['moon-owl'], 1, 'learn consumes exactly one item');
  await reject(seller, { type: 'learnPet', pet: 'moon-owl' }, 'repeat learn retains tradable duplicate');
  const duplicate = await list(seller, 'moon-owl'); assert.equal(seller.player().carriedItems['moon-owl'], undefined, 'learned collection is separate from duplicate escrow');
  observer.send(auctionRequest('auctionBuy', { listingId: duplicate.id })); await until(() => observer.player().carriedItems['moon-owl'] === 1, 'buyer receives unlearned pet');
  assert.equal(stored('seller').gold, 1025); assert.equal(stored('observer').gold, 975); assert(!observer.player().ownedPets.includes('moon-owl'));
  await learn(observer, 'moon-owl'); await summon(observer, 'moon-owl');
  assert(seller.player().ownedPets.includes('moon-owl'), 'selling a duplicate keeps learned collection');
  await reject(seller, auctionRequest('auctionList', { item: { kind: 'item', id: 'moon-owl', quantity: 1 }, currency: 'gold', price: '25' }), 'learned collection cannot be auctioned as another item');
  seller.send({ type: 'learnPet', pet: 'ember-drake' });
  seller.send(auctionRequest('auctionList', { item: { kind: 'item', id: 'ember-drake', quantity: 1 }, currency: 'gold', price: '25' }));
  await until(() => seller.player().ownedPets.includes('ember-drake'), 'learning wins overlapping item actions');
  await tick(); assert.equal(seller.player().carriedItems['ember-drake'], undefined);
  assert(!stored('seller').auctions.some(listing => listing.item.id === 'ember-drake'), 'one copy cannot both be learned and escrowed by overlapping requests');
  owner.characterId = sibling.id; owner.send({ type: 'selectCharacter', characterId: sibling.id }); await until(() => owner.player(), 'switch character');
  assert.deepEqual(owner.player().ownedPets, []); assert.equal(owner.player().summonedPet, null, 'pets belong to one character');
  owner.send({ type: 'leaveWorld' }); await until(() => owner.roster, 'return to roster');
  owner.send({ type: 'acceptCommunityRules', version: COMMUNITY_VERSION });
  await until(() => owner.messages.some(m => m.type === 'community' && m.accepted), 'accepted rules before new pet keeper');
  owner.send({ type: 'createCharacter', name: 'New Pet Keeper', appearance, ownedPets: ['suncrest-peacock'], summonedPet: 'suncrest-peacock', carriedItems: { 'suncrest-peacock': 99 } });
  await until(() => owner.roster.characters.some(p => p.name === 'New Pet Keeper'), 'new character created');
  const created = owner.roster.characters.find(p => p.name === 'New Pet Keeper'); assert.deepEqual(created.ownedPets, []); assert.equal(created.summonedPet, null); assert.deepEqual(created.carriedItems, {});
  await stop(); await start(); observer = await connect('observer'); assert.deepEqual(observer.player().ownedPets, ['moon-owl']); assert.equal(observer.player().summonedPet, 'moon-owl'); await stop();
  const valid = readSave();
  for (const bad of [{ ownedPets: null }, { ownedPets: ['invented'] }, { ownedPets: ['suncrest-peacock', 'suncrest-peacock'] }, { summonedPet: 'moss-fox' }, { summonedPet: ['suncrest-peacock', 'bloom-hare'] }, { summonedPet: false }, { carriedItems: { 'suncrest-peacock': -1 } }]) {
    const records = structuredClone(valid); Object.assign(records[hash(tokens.owner)].characters[0], bad); writeFileSync(file, JSON.stringify(records));
    assert.throws(() => createGameServer({ port: 0, dataDir: dir, keycloak: null, databaseUrl: '' }), /Invalid player save/, 'malformed present saves fail closed');
  }
  console.log('PASS: 7 eligible pet drop boundaries; slimes and sub-level-10 monsters excluded; retired pets absent from all monster/cache contexts; all 16 retired owned, active, carried, banked and auctioned pets preserved; exact level40 Suncrest Peacock exclusivity, corpse ownership/death gate/bag capacity/save rollback; tradable pickups; atomic learn/summon; auction escrow/cancel/buy/duplicate handling and overlapping requests; strict forged/save rejection; public snapshots, single summon and character isolation.');
} finally { rmSync(`${file}.tmp`, { recursive: true, force: true }); await stop(); Date.now = realNow; Math.random = realRandom; rmSync(dir, { recursive: true, force: true }); }
