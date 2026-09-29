import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { CHAPTERS } from '../src/content.ts';
import { GEAR, starterGear } from '../src/progression.ts';
import { defaultHotbar } from '../src/spells.ts';
import { newContracts } from '../src/adventure.ts';
import { canTraverse, regionAt } from '../src/realm.ts';
import { VILLAGE_NPCS } from '../src/settlements.ts';

// These accounts, the server, and the deliberately blocked save path are all isolated.
const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-player-social-'));
const file = join(dataDir, 'players.json'), temporaryFile = `${file}.tmp`, clients = [], realNow = Date.now;
let game, port, offset = 0;
Date.now = () => realNow() + offset;
const key = token => createHash('sha256').update(token).digest('hex');
const economy = p => structuredClone({ gold: p.gold, inventory: p.inventory, ownedGear: p.ownedGear, equipment: p.equipment });
const blankOffer = () => ({ gold: 0, items: {}, gear: [] });
const merchant=VILLAGE_NPCS.find(npc=>npc.id==='village-pinewake-merchant');
function hero(name, x, className, level, gold) {
  const maxHp = 100 + (level - 1) * 12;
  const at={x:merchant.x-x,z:merchant.z-2};
  return { id: randomUUID(), name, ...at, zone: regionAt(at.x,at.z), coordinateVersion: 2, rotation: 0,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className },
    characterCreated: true, talents: [], ...starterGear(className), hotbar: defaultHotbar(className),
    hp: maxHp, maxHp, level, xp: 0, gold, inventory: { wood: 20, crystal: 12, herb: 8, potion: 3, relic: 2 },
    skills: { mining: 0, woodcutting: 0, herbalism: 0 }, craftingXp: 0, contracts: newContracts(),
    quest: { chapter: 0, stage: 0, kills: 0, crystals: 0, progress: Object.fromEntries(CHAPTERS[0].objectives.map(o => [o.id, 0])), completed: false, ending: null } };
}
async function until(predicate, label) {
  const end = realNow() + 5000;
  while (realNow() < end) { const value = predicate(); if (value) return value; await delay(12); }
  throw Error(`Timed out: ${label}`);
}
async function advance(ms = 1100) { offset += ms; await delay(115); }
async function start() { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir, keycloak: null, databaseUrl: '' }); port = await game.start(); }
async function connect(token, id) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), client = { socket, id, messages: [], trade: null };
  clients.push(client);
  client.send = message => socket.send(JSON.stringify(message));
  client.player = () => client.snapshot?.players.find(p => p.id === id);
  socket.on('message', raw => {
    const message = JSON.parse(raw); client.messages.push(message);
    if (['roster', 'welcome', 'snapshot'].includes(message.type)) client[message.type] = message;
    if (message.type === 'trade') client.trade = message.trade;
    if (message.type === 'roster') { client.snapshot = undefined; client.welcome = undefined; }
  });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  client.send({ type: 'join', token }); await until(() => client.roster, 'private roster');
  if (!client.messages.some(m => m.type === 'community' && m.accepted)) { client.send({ type: 'acceptCommunityRules', version: 1 }); await until(() => client.messages.some(m => m.type === 'community' && m.accepted), 'accepted community rules'); }
  client.send({ type: 'selectCharacter', characterId: id }); await until(() => client.player(), 'selected character');
  return client;
}
async function rejected(client, message, label = message.type) {
  await advance(message.type === 'tradeRequest' ? 1100 : 700); // Error notices and invitation requests have separate flood limits.
  const count = client.messages.length;
  client.send(message);
  await until(() => client.messages.slice(count).some(m => m.type === 'event' && m.kind === 'info' || m.type === 'trade' && m.reason), `rejected ${label}`);
}
async function invite(a, b) {
  await advance();
  a.send({ type: 'tradeRequest', targetId: b.id });
  await until(() => a.trade?.status === 'invited' && b.trade?.id === a.trade.id, 'private trade invitation');
  assert.equal(a.trade.inviterId, a.id);
  assert.deepEqual(a.trade.participants.map(p => p.id), [a.id, b.id]);
  assert(a.trade.expiresAt > Date.now() && a.trade.expiresAt <= Date.now() + 30000);
  return a.trade.id;
}
async function open(a, b) {
  const id = await invite(a, b);
  b.send({ type: 'tradeRespond', tradeId: id, accept: true });
  await until(() => a.trade?.status === 'open' && b.trade?.status === 'open', 'recipient consent opens trade');
  assert(a.trade.expiresAt > Date.now() && a.trade.expiresAt <= Date.now() + 120000);
  return id;
}
async function cancel(a, b) {
  if (!a.trade) return;
  a.send({ type: 'tradeCancel', tradeId: a.trade.id });
  await until(() => a.trade === null && b.trade === null, 'both participants see cancellation');
}
async function offer(a, b, value) {
  await advance(300);
  const revision = a.trade.revision;
  a.send({ type: 'tradeOffer', tradeId: a.trade.id, offer: value });
  await until(() => a.trade?.revision > revision && b.trade?.revision === a.trade.revision, 'private offer revision');
  assert(a.trade.participants.every(p => !p.accepted), 'editing an offer clears all approvals');
  return a.trade.revision;
}
async function accept(a, b) {
  a.send({ type: 'tradeAccept', tradeId: a.trade.id, revision: a.trade.revision });
  await until(() => a.trade?.participants.find(p => p.id === a.id)?.accepted && b.trade?.participants.find(p => p.id === a.id)?.accepted, 'first explicit approval');
}
async function walk(client, x) {
  x=merchant.x-x;
  while (Math.abs(client.player().x - x) > .001) {
    const p = client.player(), to = { x: p.x + Math.sign(x - p.x) * Math.min(2, Math.abs(x - p.x)), z: p.z };
    assert(canTraverse(p, to), 'test movement follows clear authoritative terrain');
    await advance(500); client.send({ type: 'move', ...to, rotation: 0 });
    await until(() => Math.abs(client.player().x - to.x) < .001, 'legal movement');
  }
}
function savedEconomies(heroes, tokens) {
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  return heroes.map((p, i) => economy(saved[key(tokens[i])].characters.find(c => c.id === p.id)));
}
function totals(players) {
  const result = { gold: 0n, items: {}, gear: {} };
  for (const p of players) {
    result.gold += BigInt(p.gold);
    for (const [id, count] of Object.entries(p.inventory)) result.items[id] = (result.items[id] || 0n) + BigInt(count);
    for (const id of p.ownedGear) result.gear[id] = (result.gear[id] || 0) + 1;
  }
  return result;
}

try {
  const heroes = [hero('Social Ranger A', 0, 'Ranger', 75, 1000), hero('Social Ranger B', 2, 'Ranger', 1, 200), hero('Social Mage C', 4, 'Mage', 75, Number.MAX_SAFE_INTEGER - 2)];
  heroes[0].ownedGear.push('ranger-head', 'ranger-back', 'warden-longbow', 'copper-ring', 'lantern-charm', 'rootforged-charm');
  heroes[0].equipment.ring1 = 'copper-ring';
  heroes[1].ownedGear.push('star-ring', 'lantern-charm');
  heroes[2].inventory.wood = Number.MAX_SAFE_INTEGER - 1;
  for (const p of heroes) assert(canTraverse(p, p), 'fixture starts outside all solid geometry');
  const tokens = heroes.map(() => randomBytes(32).toString('base64url'));
  writeFileSync(file, JSON.stringify(Object.fromEntries(heroes.map((p, i) => [key(tokens[i]), { characters: [p] }]))));
  await start();
  let [a, b, c] = await Promise.all(tokens.map((token, i) => connect(token, heroes[i].id)));
  const initial = [a, b, c].map(client => economy(client.player()));

  a.send({ type: 'whisper', targetId: b.id, text: '  <Hello>\n\u0000 friend  ' });
  const whisper = await until(() => b.messages.find(m => m.type === 'whisper'), 'private sanitized whisper');
  await until(() => a.messages.some(m => m.type === 'whisper'), 'sender sees their whisper');
  assert.match(whisper.messageId, /^[a-f0-9-]{36}$/);
  assert.deepEqual(whisper, { type: 'whisper', messageId: whisper.messageId, from: { id: a.id, name: heroes[0].name, role: 'player' }, to: { id: b.id, name: heroes[1].name, role: 'player' }, text: 'Hello friend' });
  assert(!c.messages.some(m => m.type === 'whisper'), 'a third client receives no whisper');
  await advance(800);
  const beforeBurst = b.messages.filter(m => m.type === 'whisper').length;
  a.send({ type: 'whisper', targetId: b.id, text: 'x'.repeat(200) });
  a.send({ type: 'whisper', targetId: b.id, text: 'blocked burst' });
  await until(() => b.messages.filter(m => m.type === 'whisper').length > beforeBurst, 'bounded whisper');
  await delay(100);
  const burst = b.messages.filter(m => m.type === 'whisper').slice(beforeBurst);
  assert.equal(burst.length, 1, 'whisper flood limit'); assert.equal(burst[0].text.length, 160);
  for (const message of [
    { type: 'whisper', targetId: 'missing', text: 'unknown' },
    { type: 'whisper', targetId: b.id, text: 'x'.repeat(501) },
    { type: 'whisper', targetId: b.id, text: {} },
    { type: 'whisper', targetId: b.id, text: 'spoof', from: { id: c.id } },
  ]) await rejected(a, message, 'invalid whisper');
  await advance(800); a.send({ type: 'whisper', targetId: b.id, text: '<\n>' }); await delay(100);
  assert.equal(b.messages.filter(m => m.type === 'whisper').length, beforeBurst + 1);
  assert(!c.messages.some(m => m.type === 'whisper'));

  let id = await invite(a, b);
  const invitation = structuredClone(a.trade);
  await rejected(a, { type: 'tradeRespond', tradeId: id, accept: true }, 'inviter cannot consent for recipient');
  for (const message of [
    { type: 'tradeRespond', tradeId: id, accept: true },
    { type: 'tradeOffer', tradeId: id, offer: blankOffer() },
    { type: 'tradeAccept', tradeId: id, revision: a.trade.revision },
    { type: 'tradeCancel', tradeId: id },
  ]) await rejected(c, message, 'outsider trade action');
  assert.deepEqual(a.trade, invitation, 'outsider cannot mutate an invitation');
  assert(!c.messages.some(m => m.type === 'trade' && m.trade?.id === id), 'trade state is private');
  await rejected(a, { type: 'tradeOffer', tradeId: id, offer: { ...blankOffer(), gold: 1 } }, 'no offers before consent');
  b.send({ type: 'tradeRespond', tradeId: id, accept: false });
  await until(() => a.trade === null && b.trade === null, 'decline clears invitation');
  assert.deepEqual([a, b, c].map(client => economy(client.player())), initial, 'declining does not move assets');
  for (const targetId of [a.id, 'missing']) await rejected(a, { type: 'tradeRequest', targetId }, 'self or unknown trade');
  await invite(a, b); await advance(30001); await until(() => a.trade === null && b.trade === null, 'invitation expires');
  await open(a, b); await advance(120001); await until(() => a.trade === null && b.trade === null, 'open trade expires');
  await open(a, b); await walk(b, 10); await until(() => a.trade === null && b.trade === null, 'walking beyond trade range cancels both views');
  await rejected(a, { type: 'tradeRequest', targetId: b.id }, 'out of range trade'); await walk(b, 2);
  await open(a, b);
  b.roster = undefined; b.send({ type: 'leaveWorld' });
  await until(() => b.roster && a.trade === null, 'leaving world cancels trade');
  b.send({ type: 'selectCharacter', characterId: b.id }); await until(() => b.player(), 'return from roster');
  assert.equal(b.trade, null);
  await open(a, b); b.socket.terminate();
  await until(() => a.trade === null, 'disconnect cancels peer trade');
  b = await connect(tokens[1], heroes[1].id); assert.equal(b.trade, null, 'reconnect does not revive a trade');

  id = await open(a, b);
  const invalidOffers = [
    { ...blankOffer(), gold: -1 }, { ...blankOffer(), gold: .5 }, { ...blankOffer(), gold: NaN },
    { ...blankOffer(), gold: Number.MAX_SAFE_INTEGER + 1 }, { ...blankOffer(), gold: a.player().gold + 1 },
    { ...blankOffer(), items: { wood: -1 } }, { ...blankOffer(), items: { crystal: .25 } },
    { ...blankOffer(), items: { herb: null } }, { ...blankOffer(), items: { relic: Number.MAX_SAFE_INTEGER + 1 } },
    { ...blankOffer(), items: { wood: a.player().inventory.wood + 1 } }, { ...blankOffer(), items: { diamonds: 1 } },
    { ...blankOffer(), items: [] }, { ...blankOffer(), gear: ['unknown'] }, { ...blankOffer(), gear: ['ranger-shoes'] },
    { ...blankOffer(), gear: ['ranger-head', 'ranger-head'] }, { ...blankOffer(), gear: ['ranger-bow'] },
    { ...blankOffer(), gear: ['ranger-tunic'] }, { ...blankOffer(), gear: ['copper-ring'] },
    { ...blankOffer(), gear: ['lantern-charm'] }, { ...blankOffer(), gear: ['warden-longbow'] },
    { ...blankOffer(), extra: true }, { ...blankOffer(), gear: {} },
  ];
  const frozen = structuredClone(a.trade), balances = [a, b].map(client => economy(client.player()));
  for (const value of invalidOffers) {
    await rejected(a, { type: 'tradeOffer', tradeId: id, offer: value }, `invalid offer ${JSON.stringify(value)}`);
    assert.deepEqual(a.trade, frozen, 'invalid offer cannot change revision or accepted values');
    assert.deepEqual([a, b].map(client => economy(client.player())), balances, 'invalid offer cannot move assets');
  }
  await rejected(a, { type: 'tradeOffer', tradeId: id, offer: blankOffer(), revision: 123 }, 'unexpected message keys');
  for (const revision of [-1, .5, null, Number.MAX_SAFE_INTEGER + 1, frozen.revision + 1])
    await rejected(a, { type: 'tradeAccept', tradeId: id, revision }, 'invalid acceptance revision');
  assert.deepEqual(a.trade, frozen);
  await cancel(a, b);
  id = await open(a, c);
  await rejected(a, { type: 'tradeOffer', tradeId: id, offer: { ...blankOffer(), gear: ['ranger-head'] } }, 'recipient class incompatibility');
  await cancel(a, c);

  // A crafted item is not a starter item merely because its shop price is zero.
  id = await open(a, c);
  await offer(a, c, { gold: 0, items: { wood: 0 }, gear: ['rootforged-charm'] });
  await accept(a, c); c.send({ type: 'tradeAccept', tradeId: id, revision: c.trade.revision });
  await until(() => a.trade === null && c.trade === null && c.player().ownedGear.includes('rootforged-charm'), 'eligible crafted gear transfers');
  assert(!a.player().ownedGear.includes('rootforged-charm'));

  // Authoritative receive-side overflow must reject without changing either wallet.
  for (const value of [{ ...blankOffer(), gold: 3 }, { ...blankOffer(), items: { wood: 2 } }]) {
    id = await open(a, c);
    const prior = [a, c].map(client => economy(client.player())), count = a.messages.length;
    await advance(300); a.send({ type: 'tradeOffer', tradeId: id, offer: value }); await delay(125);
    if (a.trade?.participants.find(p => p.id === a.id).offer.gold === value.gold && Object.entries(value.items).every(([item, quantity]) => a.trade.participants.find(p => p.id === a.id).offer.items[item] === quantity)) {
      const revision = a.trade.revision;
      a.send({ type: 'tradeAccept', tradeId: id, revision });
      await until(() => a.trade === null || a.trade.revision > revision, 'overflow invalidates approval');
      assert(!a.trade || a.trade.participants.every(p => !p.accepted));
    } else assert(a.messages.slice(count).some(m => m.type === 'event' && m.kind === 'info' || m.type === 'trade' && m.reason), 'overflow is rejected at offer or settlement');
    assert.deepEqual([a, c].map(client => economy(client.player())), prior, 'no receive-side integer overflow');
    await cancel(a, c);
  }

  // An offer does not reserve funds: normal gameplay can change what is available.
  id = await open(a, b);
  await offer(a, b, { ...blankOffer(), gold: a.player().gold }); await accept(b, a);
  a.send({ type: 'buyGear', itemId: 'ranger-shoes', npcId:merchant.id });
  await until(() => a.player().ownedGear.includes('ranger-shoes'), 'ordinary purchase after offering funds');
  const afterPurchase = [a, b].map(client => economy(client.player()));
  const purchaseRevision = a.trade?.revision;
  if (a.trade) a.send({ type: 'tradeAccept', tradeId: id, revision: purchaseRevision });
  await until(() => a.trade === null || a.trade.revision > purchaseRevision && a.trade.participants.every(p => !p.accepted), 'changed funds invalidate approval');
  assert.deepEqual([a, b].map(client => economy(client.player())), afterPurchase);
  await cancel(a, b);

  id = await open(a, b); await offer(a, b, { ...blankOffer(), gear: ['ranger-back'] }); await accept(b, a);
  a.send({ type: 'equipGear', itemId: 'ranger-back', slot: 'back' });
  await until(() => a.player().equipment.back === 'ranger-back', 'gear equipped after offer');
  const afterEquip = [a, b].map(client => economy(client.player()));
  const equippedRevision = a.trade?.revision;
  if (a.trade) a.send({ type: 'tradeAccept', tradeId: id, revision: equippedRevision });
  await until(() => a.trade === null || a.trade.revision > equippedRevision && a.trade.participants.every(p => !p.accepted), 'newly equipped gear invalidates approval');
  assert.deepEqual([a, b].map(client => economy(client.player())), afterEquip);
  await cancel(a, b);

  // A failed atomic write may never produce a success acknowledgement or partial transfer.
  id = await open(a, b); await offer(a, b, { gold: 7, items: { herb: 2 }, gear: ['ranger-head'] }); await accept(a, b);
  await delay(1100); // Drain unrelated scheduled saves before installing the local failure fixture.
  const diskBeforeFailure = readFileSync(file, 'utf8'), beforeFailure = [a, b, c].map(client => economy(client.player()));
  mkdirSync(temporaryFile);
  try {
    b.send({ type: 'tradeAccept', tradeId: id, revision: b.trade.revision });
    await until(() => a.trade === null && b.trade === null, 'failed storage cancels trade');
    await delay(125);
    assert.deepEqual([a, b, c].map(client => economy(client.player())), beforeFailure, 'failed save leaves live balances untouched');
    assert.equal(readFileSync(file, 'utf8'), diskBeforeFailure, 'failed save leaves durable records untouched');
  } finally { rmSync(temporaryFile, { recursive: true, force: true }); }

  id = await open(a, b);
  const beforeExchange = [a, b, c].map(client => economy(client.player())), combined = totals(beforeExchange);
  let revision = await offer(a, b, { gold: 17, items: { wood: 4, crystal: 2, herb: 1, potion: 1, relic: 1 }, gear: ['ranger-head'] });
  a.send({ type: 'tradeOffer', tradeId: id, offer: { gold: 18, items: {}, gear: [] } });
  await delay(100); assert.equal(a.trade.revision, revision, 'offer flood limit prevents a second immediate revision');
  await offer(b, a, { gold: 5, items: { herb: 2 }, gear: ['star-ring'] });
  await rejected(a, { type: 'tradeAccept', tradeId: id, revision }, 'stale approval');
  await accept(a, b); revision = a.trade.revision;
  assert.deepEqual([a, b, c].map(client => economy(client.player())), beforeExchange, 'one approval moves no assets');
  await offer(b, a, { gold: 6, items: { herb: 3 }, gear: ['star-ring'] });
  await rejected(a, { type: 'tradeAccept', tradeId: id, revision }, 'offer edit invalidates old approval');
  assert(a.trade.participants.every(p => !p.accepted));
  await accept(a, b); revision = a.trade.revision;
  b.send({ type: 'tradeAccept', tradeId: id, revision });
  await until(() => a.trade === null && b.trade === null, 'both current approvals settle trade');
  const expected = structuredClone(beforeExchange);
  expected[0].gold += 6 - 17; expected[1].gold += 17 - 6;
  for (const [item, count] of Object.entries({ wood: 4, crystal: 2, herb: 1, potion: 1, relic: 1 })) { expected[0].inventory[item] -= count; expected[1].inventory[item] += count; }
  expected[0].inventory.herb += 3; expected[1].inventory.herb -= 3;
  expected[0].ownedGear = expected[0].ownedGear.filter(item => item !== 'ranger-head').concat('star-ring');
  expected[1].ownedGear = expected[1].ownedGear.filter(item => item !== 'star-ring').concat('ranger-head');
  assert.deepEqual(savedEconomies(heroes, tokens), expected, 'acknowledgement follows durable save of both accounts');
  await until(() => a.player().ownedGear.includes('star-ring') && b.player().ownedGear.includes('ranger-head'), 'settled snapshots');
  assert.deepEqual([a, b, c].map(client => economy(client.player())), expected);
  assert.deepEqual(totals(expected), combined, 'gold, every resource, and gear are conserved exactly');
  assert(!c.messages.some(m => m.type === 'trade' && m.trade?.participants.some(p => p.id === b.id)), 'outsider never receives another pair’s offer');
  for (const client of [a, b]) client.send({ type: 'tradeAccept', tradeId: id, revision });
  a.send({ type: 'tradeOffer', tradeId: id, offer: { gold: 17, items: { wood: 4 }, gear: ['ranger-head'] } });
  await delay(150); assert.deepEqual([a, b, c].map(client => economy(client.player())), expected, 'duplicate accepted revision cannot repeat a transfer');
  assert.equal(a.socket.readyState, WebSocket.OPEN); assert.equal(b.socket.readyState, WebSocket.OPEN); assert.equal(c.socket.readyState, WebSocket.OPEN);
  await game.stop(); game = undefined; await start();
  [a, b, c] = await Promise.all(tokens.map((token, i) => connect(token, heroes[i].id)));
  assert.deepEqual([a, b, c].map(client => economy(client.player())), expected, 'restart preserves exact settled balances, ownership and worn equipment');
  assert([a, b, c].every(client => client.trade === null && !client.messages.some(m => m.type === 'whisper')), 'private ephemeral messages and trades are not replayed after restart');
  assert.equal(expected[0].gold, 1000 - GEAR['ranger-shoes'].price + 6 - 17);
  console.log('PASS: real three-client private whispers and consent trades; sanitization/rate limits; participant authority, range/expiry/leave/disconnect cleanup; strict offers and gear eligibility; revision invalidation; changed funds/overflow; atomic failure, conservation, replay protection and durable restart.');
} finally {
  rmSync(temporaryFile, { recursive: true, force: true });
  for (const client of clients) client.socket.terminate();
  if (game) await game.stop();
  Date.now = realNow; rmSync(dataDir, { recursive: true, force: true });
}
