import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { starterGear } from '../src/progression.ts';
import { COLOSSEUM } from '../src/colosseum.ts';
import { regionAt } from '../src/realm.ts';
import { storyQuestById } from '../src/story-quests.ts';
import { WORLD_INTEREST_RADIUS } from '../src/shared.ts';

// Far entities must not resolve terrain height for every viewer; the existing 3D range still decides visibility.
const serverSource = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const interestFilters = [serverSource.match(/enemies: enemies\.filter\((.*?)\)\.map\(/)[1], serverSource.match(/nodes: nodes\.filter\((.*?)\), loot:/)[1]];
for (const filter of interestFilters) for (const instanceId of [null, 'dungeon-interest', 'raid-interest']) {
  const player = { x: 120, y: 2, z: -60 }, radius = WORLD_INTEREST_RADIUS, calls = [];
  const offsets = [[0,0,0], [radius,0,0], [-radius,0,0], [0,0,radius], [radius+1e-8,0,0],
    [radius*.6,0,radius*.8], [radius*.6,radius*.8,0], [radius*.6,radius*.8+1e-8,0],
    [0,radius+1,0], [radius,radius,radius], [-radius*2,0,0], [0,0,radius*2]];
  const entities = [null, 'dungeon-interest', 'raid-interest'].flatMap(world => offsets.map(([x,y,z], index) =>
    ({ id: `${world}:${index}`, instanceId: world, x: player.x+x, y: player.y+y, z: player.z+z })));
  const distance = (a,b) => { calls.push(b); return Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z); };
  const predicate = new Function('session', 'instanceId', 'distance', 'WORLD_INTEREST_RADIUS', `return (${filter});`)({player}, instanceId, distance, radius);
  assert.deepEqual(entities.filter(predicate), entities.filter(entity => entity.instanceId === instanceId
    && (instanceId || Math.hypot(player.x-entity.x, player.y-entity.y, player.z-entity.z) <= radius)),
  'snapshot entity output preserves instance, exact range boundary and elevation exclusions');
  if (instanceId) assert.equal(calls.length, 0, 'instances retain every same-instance entity without overworld range work');
  else {
    assert(calls.length > 0, 'nearby candidates still use authoritative 3D distance');
    assert(calls.every(entity => entity.instanceId === null && Math.abs(player.x-entity.x) <= radius && Math.abs(player.z-entity.z) <= radius),
      'distant or foreign-instance entities never perform terrain-dependent distance work');
  }
}

// Actual TCP bytes for concurrent reused-dictionary, plain and independent-frame clients.
const directory = mkdtempSync(join(tmpdir(), 'mossvale-traffic-')), clients = [], samples = [];
const privateStory = storyQuestById('story-slime-at-the-gates');
const storyQuests = { active: { [privateStory.id]: privateStory.objectives.map(() => 0) }, completed: ['story-welcome-to-lanternreach'] };
const heroes = Array.from({ length: 20 }, (_, index) => ({
  id: randomUUID(), name: `Traffic ${index}`, coordinateVersion: 2,
  x: COLOSSEUM.x + index / 10, z: COLOSSEUM.z, zone: regionAt(COLOSSEUM.x, COLOSSEUM.z), rotation: 0,
  appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
  characterCreated: true, ...starterGear('Ranger'), talents: [], level: 60, xp: 0, hp: 808, maxHp: 808, gold: 40,
  inventory: { wood: 0, crystal: 0, potion: 3, herb: 0, relic: 0 }, skills: { mining: 0, woodcutting: 0, herbalism: 0 },
  quest: { stage: 0, kills: 0, crystals: 0 }, storyQuests: structuredClone(storyQuests),
}));
const tokens = heroes.map(() => randomBytes(32).toString('base64url'));
writeFileSync(join(directory, 'players.json'), JSON.stringify(Object.fromEntries(heroes.map((hero, i) =>
  [createHash('sha256').update(tokens[i]).digest('hex'), { characters: [hero] }]))));
let game, port;
async function until(predicate, label) {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) { const value = predicate(); if (value) return value; await delay(10); }
  throw Error(`Timed out: ${label}`);
}
async function connect(index, compress = true) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`, { perMessageDeflate: compress });
  const client = { socket, index, snapshots: 0, payloadBytes: 0, messages: [], serverTimes: [] }; clients.push(client);
  client.send = message => socket.send(JSON.stringify(message));
  client.player = () => client.snapshot?.players.find(player => player.id === heroes[index].id);
  socket.on('message', raw => {
    client.payloadBytes += raw.length;
    const message = JSON.parse(raw); client.messages.push(message);
    if (message.type === 'snapshot') {
      client.snapshot = message; client.snapshots++; client.serverTimes.push(message.serverTime);
      assert(message.players.some(player => player.id === heroes[index].id), 'every full snapshot contains its owner');
    }
  });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  client.send({ type: 'join', token: tokens[index], characterId: heroes[index].id });
  await until(() => client.player(), 'character enters');
  assert.deepEqual(client.messages.find(message => message.type === 'welcome').player.storyQuests, storyQuests, 'welcome retains the owner’s full story progress');
  assert.deepEqual(client.player().storyQuests, storyQuests, 'authoritative snapshots retain the owner’s story progress');
  return client;
}
async function measure(name, action = () => {}) {
  const observed = clients.slice(0, 3), fence = 1000 + samples.length;
  // Drain earlier join/combat snapshots before measuring steady traffic.
  observed.forEach(client => client.send({ type: 'ping', id: fence }));
  await until(() => observed.every(client => client.messages.some(message => message.type === 'pong' && message.id === fence)), 'prior frames delivered');
  const started = performance.now(), startedAt = Date.now(), cpu = process.cpuUsage();
  const before = observed.map(client => ({ bytes: client.socket._socket.bytesRead, payload: client.payloadBytes, snapshots: client.snapshots }));
  for (let i = 0; i < 20; i++) { action(i); await delay(100); }
  const elapsedMs = performance.now() - started, used = process.cpuUsage(cpu);
  const traffic = observed.map((client, i) => {
    const bytes = client.socket._socket.bytesRead - before[i].bytes;
    return { compressed: client.socket.extensions.includes('permessage-deflate'), wireBytes: bytes,
      payloadBytes: client.payloadBytes - before[i].payload, snapshots: client.snapshots - before[i].snapshots,
      freshSnapshots: client.serverTimes.slice(before[i].snapshots).filter(time => time >= startedAt).length,
      bytesPerSecond: Math.round(bytes * 1000 / elapsedMs) };
  });
  const sample = { name, players: clients.filter(client => client.socket.readyState === WebSocket.OPEN).length,
    elapsedMs: Math.round(elapsedMs), cpuMs: Math.round((used.user + used.system) / 1000), rssMiB: Math.round(process.memoryUsage().rss / 1048576),
    traffic, savingPercent: Math.round((1 - traffic[0].wireBytes / traffic[1].wireBytes) * 100),
    reuseSavingPercent: Math.round((1 - traffic[0].wireBytes / traffic[2].wireBytes) * 100) };
  samples.push(sample); console.log(JSON.stringify(sample));
  // An early observer's post-pong frames may arrive after the last observer's fence; rate counts use server creation time.
  assert(traffic.every(result => result.freshSnapshots >= 10), `${name}: both transports retain timely authoritative snapshots`);
  assert(traffic.every(result => result.freshSnapshots <= Math.ceil(elapsedMs / 100) + 2), `${name}: snapshot rate is not multiplied`);
}
try {
  const disabled = { status: async () => ({ configured: false, enabled: false }) };
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: directory, keycloak: null, databaseUrl: '',
    auctionChain: disabled, mossAuctionChain: disabled, storeChain: disabled, treasuryChain: disabled, nftChain: disabled });
  port = await game.start();
  const compressed = await connect(0), plain = await connect(1, false), independent = await connect(2, { serverNoContextTakeover: true }), actor = await connect(3);
  assert(!compressed.socket._extensions['permessage-deflate'].params.server_no_context_takeover, 'ordinary clients reuse their own snapshot dictionary');
  assert(independent.socket._extensions['permessage-deflate'].params.server_no_context_takeover, 'clients requesting independent frames remain supported');
  await until(() => clients.every(client => client.snapshot.players.length === 4), 'all observers see the same world');
  for (const client of clients) for (const player of client.snapshot.players) {
    if (player.id === heroes[client.index].id) assert.deepEqual(player.storyQuests, storyQuests);
    else assert(!Object.hasOwn(player, 'storyQuests'), 'peer snapshots omit private story progress/history on every transport');
  }
  await measure('idle');
  await measure('moving', i => actor.send({ type: 'move', x: COLOSSEUM.x + .2 + (i % 10) / 10, z: COLOSSEUM.z, rotation: 0 }));
  assert(actor.player().x > COLOSSEUM.x + .2, 'movement is accepted by the server');
  actor.send({ type: 'autoAttack', targetId: heroes[1].id });
  await measure('combat');
  assert(compressed.messages.some(message => message.type === 'damage' && message.targetId === heroes[1].id && message.amount > 0), 'combat damage reaches the compressed observer');
  actor.send({ type: 'autoAttack', targetId: null });
  for (let i = 4; i < heroes.length; i++) await connect(i);
  await until(() => compressed.snapshot.players.length === 20 && plain.snapshot.players.length === 20, 'populated scene is visible');
  await measure('populated');
  const prior = { id: compressed.player().id, gold: compressed.player().gold, inventory: compressed.player().inventory, storyQuests: compressed.player().storyQuests };
  compressed.socket.terminate();
  await until(() => compressed.socket.readyState === WebSocket.CLOSED, 'old transport closes');
  const resumed = await connect(0);
  assert.deepEqual({ id: resumed.player().id, gold: resumed.player().gold, inventory: resumed.player().inventory, storyQuests: resumed.player().storyQuests }, prior, 'reconnect delivers complete same-character state');
  resumed.send({ type: 'ping', id: 123 });
  await until(() => resumed.messages.some(message => message.type === 'pong' && message.id === 123), 'uncompressed control reply still arrives');
  for (const sample of samples) {
    assert(sample.traffic[0].compressed, 'browser-compatible snapshot compression is negotiated');
    assert(!sample.traffic[1].compressed, 'clients without compression remain supported');
    assert(sample.savingPercent >= 50, `${sample.name}: measured wire traffic falls by at least 50% without reducing snapshots`);
    if (sample.name !== 'populated') assert(sample.reuseSavingPercent >= 50, `${sample.name}: dictionary reuse halves the already-compressed traffic`);
  }
  console.log('PASS WebSocket traffic: idle, movement, combat, 20-player snapshots, plain-client compatibility, ping and same-character reconnect.');
} finally {
  for (const client of clients) client.socket.terminate();
  await game?.stop(); rmSync(directory, { recursive: true, force: true });
}
