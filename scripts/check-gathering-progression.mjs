import { storeBoostMultiplier } from '../src/ingame-store.ts';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { GATHERING_NODES, GATHERING_FOOTPRINTS, WORLD_GATHERING_NODES, createGatheringNodes } from '../src/gathering-nodes.ts';
import { SKILLS, RESOURCE_TYPES, MAX_SKILL_XP, skillProgress, gatheringDuration, canGather, gatheringUnlocks, nextGatheringUnlock, gatheringXpGain, professionDifficulty, PROFESSION_RANKS } from '../src/skills.ts';
import { ZONES, CHAPTERS } from '../src/content.ts';
import { EXPEDITIONS, REGION_ORIGINS, surfaceAt, waterAt, groundHeight } from '../src/landscape.ts';
import { WORLD_COLLIDERS, WORLD_BOUNDS, canTraverse, regionAt, toWorld } from '../src/realm.ts';
import { findPath } from '../src/navigation.ts';
import { townDistance } from '../src/settlements.ts';
import { starterGear } from '../src/progression.ts';
import { newBags, bagUsage, bagCapacity } from '../src/bags.ts';
import { LOOT_ITEMS } from '../src/loot-items.ts';
import { MONSTERS } from '../src/bestiary.ts';

const tiers = Object.keys(GATHERING_FOOTPRINTS), threshold = level => 50 * (level - 1) ** 2;
for (const kind of ['crystal', 'ember-shard', 'star-fragment', 'heartroot', 'timber', 'herb']) {
  assert.equal(RESOURCE_TYPES[kind].requiredLevel, 1); assert.equal(RESOURCE_TYPES[kind].yield, 1); assert(canGather(kind, 0), 'existing quest resources remain available to beginners');
}
assert.equal(tiers.length, 9); assert.equal(new Set(GATHERING_NODES.map(node => node.id)).size, GATHERING_NODES.length);
for (const kind of tiers) {
  const item = RESOURCE_TYPES[kind], tier = [10, 25, 50].indexOf(item.requiredLevel); assert(tier >= 0);
  assert.equal(item.yield, [2, 3, 5][tier]); assert.equal(item.xp, [600, 2000, 5000][tier]);
  assert.equal(item.duration, [3000, 3600, 4200][tier]); assert.equal(item.adventureXp, [12, 16, 20][tier]);
  assert.equal(item.model, `gathering-${kind}`); assert(!canGather(kind, threshold(item.requiredLevel) - 1)); assert(canGather(kind, threshold(item.requiredLevel)));
  assert(GATHERING_NODES.filter(node => node.kind === kind).length >= 4, `${kind} has multiple actual world locations`);
  if (item.requiredLevel === 10) assert(GATHERING_NODES.some(node => node.kind === kind && Math.hypot(node.x, node.z) < 125), 'every first profession unlock is near the starting city');
}
assert(!canGather('__proto__', MAX_SKILL_XP));
for (const skill of Object.keys(SKILLS)) {
  assert.equal(nextGatheringUnlock(skill, 0).level, 10); assert.equal(nextGatheringUnlock(skill, threshold(10)).level, 25);
  assert.equal(nextGatheringUnlock(skill, threshold(25)).level, 50); assert.equal(nextGatheringUnlock(skill, threshold(50)), undefined);
  assert.equal(gatheringUnlocks(skill, 9, 50).length, 3);
}
for (const skill of Object.keys(SKILLS)) for (let level = 1; level < 99; level++) {
  const xp = threshold(level), available = Object.keys(RESOURCE_TYPES).filter(kind => RESOURCE_TYPES[kind].skill === skill && canGather(kind, xp));
  assert(available.some(kind => gatheringXpGain(kind, xp) > 0), `${skill} has useful work at level ${level}`);
  for (const kind of available) if (RESOURCE_TYPES[kind].requiredLevel < PROFESSION_RANKS.find(rank => level <= rank.maxLevel).level)
    assert.equal(gatheringXpGain(kind, xp), 0, 'earlier ranks cannot power-level advanced professions');
}
assert.equal(professionDifficulty(1, threshold(9)), 'familiar');
assert.equal(professionDifficulty(1, threshold(10)), 'mastered');
assert(gatheringXpGain('crystal', threshold(9)) < RESOURCE_TYPES.crystal.xp);
assert.equal(gatheringXpGain('sunstone-vein', MAX_SKILL_XP), 0);
const areaPaths = new Map();
for (const node of GATHERING_NODES) {
  assert.equal(regionAt(node.x, node.z), node.zone); assert(!waterAt(node.x, node.z) && canTraverse(node, node));
  const radius = GATHERING_FOOTPRINTS[node.kind] / 2;
  assert(townDistance(node) >= radius + 3, 'nodes and crowns remain outside town/building footprints');
  for (let i = 0; i < 8; i++) {
    const edge = { x: node.x + Math.sin(i * Math.PI / 4) * (radius + .5), z: node.z + Math.cos(i * Math.PI / 4) * (radius + .5) };
    assert(!waterAt(edge.x, edge.z) && canTraverse(node, edge), `${node.id} has a dry clear model footprint`);
    assert(Math.abs(groundHeight(edge.x, edge.z) - groundHeight(node.x, node.z)) <= 1.5);
  }
  const camp = EXPEDITIONS.find(camp => node.id.startsWith(`gathering-${camp.id}-`));
  const area = camp || (node.id.includes('capital-east-') ? { id: 'capital-east', x: 104, z: 8 } : node.id.includes('capital-north-') ? { id: 'capital-north', x: -8, z: -104 } : node.id.includes('sunveil-town-') ? { id: 'sunveil-town', ...REGION_ORIGINS.sunveil } : { id: 'mistwood-town', ...REGION_ORIGINS.mistwood });
  if (!areaPaths.has(area.id)) {
    const approaches = [area, ...Array.from({ length: 48 }, (_, i) => ({ x: area.x + Math.sin(i * Math.PI / 8) * (3 + Math.floor(i / 16) * 3), z: area.z + Math.cos(i * Math.PI / 8) * (3 + Math.floor(i / 16) * 3) }))];
    areaPaths.set(area.id, approaches.find(point => canTraverse(point, point) && !waterAt(point.x, point.z)));
  }
  const approach = areaPaths.get(area.id); assert(approach);
  assert(canTraverse(approach, node), `${node.id} has a direct collision-safe route from its nearby camp`);
}
for (const id of ['capital-east', 'capital-north']) {
  const target = areaPaths.get(id), path = findPath({ x: 0, z: 0 }, target, WORLD_COLLIDERS, WORLD_BOUNDS); assert(path.length);
  let previous = { x: 0, z: 0 }; for (const step of path) { assert(canTraverse(previous, step)); previous = step; }
  assert(Math.hypot(previous.x - target.x, previous.z - target.z) < .01, 'the starting city gates lead to both first-unlock resource areas');
}

const worldNodes = new Map(WORLD_GATHERING_NODES.map(node => [node.id, node]));
assert.equal(worldNodes.size, WORLD_GATHERING_NODES.length, 'every region has unique harvest IDs');
assert.deepEqual(createGatheringNodes(), WORLD_GATHERING_NODES, 'rebuilding the realm retains the same resource IDs and positions');
const starter = [
  ['crystal-0', 'crystal', -90, 10], ['crystal-1', 'crystal', -96, 20], ['crystal-2', 'crystal', -98, 32],
  ['timber-greenwood-0', 'timber', -38, 88], ['timber-greenwood-1', 'timber', -28, 90],
  ['herb-greenwood-0', 'herb', -18, 90], ['herb-greenwood-1', 'herb', -11, 94],
];
for (const [id, kind, x, z] of starter) {
  const node = worldNodes.get(id); assert.deepEqual(node, { id, kind, x, z, zone: 'greenwood' }, 'beginner supplies stay beside the starting city');
  assert(canGather(kind, 0) && Math.hypot(x, z) < 110 && !waterAt(x, z) && canTraverse(node, node));
}
assert.equal(starter.filter(([, kind]) => kind === 'crystal').length, CHAPTERS[0].objectives.find(objective => objective.id === 'grove-crystals').count);
const wild = WORLD_GATHERING_NODES.filter(node => node.id.startsWith('wild-gathering-')), patches = new Map();
for (const node of wild) {
  const surface = surfaceAt(node.x, node.z), radius = (GATHERING_FOOTPRINTS[node.kind] / 2 || (node.kind === 'timber' ? 1.25 : .8)) + .5;
  assert.equal(surface.zone, node.zone); assert(!surface.water && !surface.beach && townDistance(node) >= radius + 8);
  assert(canTraverse(node, node, WORLD_COLLIDERS, WORLD_BOUNDS, radius), `${node.id} has room for its whole model`);
  for (let i = 0; i < 8; i++) {
    const edge = { x: node.x + Math.sin(i * Math.PI / 4) * radius, z: node.z + Math.cos(i * Math.PI / 4) * radius }, ground = surfaceAt(edge.x, edge.z);
    assert(!ground.water && ground.zone === node.zone && Math.abs(ground.height - surface.height) <= 1.5 && canTraverse(node, edge), `${node.id} has a dry, level, reachable footprint`);
  }
  const id = node.id.replace(/-cluster-\d+$/, ''), patch = patches.get(id) || []; patch.push(node); patches.set(id, patch);
}
assert.deepEqual([...new Set(wild.map(node => node.zone))].sort(), ZONES.map(zone => zone.id).sort());
for (const camp of EXPEDITIONS) assert(wild.filter(node => surfaceAt(node.x, node.z).regionId === camp.id).length >= 4, `${camp.id} has resources beyond its fixed camp supplies`);
const clusters = [...patches.values()].filter(patch => patch.length > 1);
assert(clusters.length > 0 && clusters.length < patches.size / 2, 'most finds are singles with occasional resource clusters');
assert(clusters.some(patch => patch.length >= 3), 'some deposits have several harvestable nodes');
for (const patch of clusters) for (const node of patch) assert(node.kind === patch[0].kind && Math.hypot(node.x - patch[0].x, node.z - patch[0].z) <= 15, 'clusters group the same resource nearby');

const dir = mkdtempSync(join(tmpdir(), 'mossvale-gathering-tiers-')), file = join(dir, 'players.json'), realNow = Date.now, originalMonsters = structuredClone(MONSTERS), clients = [];
let clock = realNow(), game, port; Date.now = () => clock;
const key = token => createHash('sha256').update(token).digest('hex');
const beside = node => ({ x: node.x, z: node.z + 2 });
function hero(name, node, xp = 0, extra = {}) {
  const point = beside(node), resource = RESOURCE_TYPES[node.kind];
  return { id: randomUUID(), name, ...point, zone: regionAt(point.x, point.z), coordinateVersion: 2, rotation: 0,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
    characterCreated: true, ...starterGear('Ranger'), ...newBags(), talents: [], level: 1, maxHp: 100, hp: 100, gold: 0, xp: 0,
    inventory: { wood: 0, crystal: 0, herb: 0, potion: 0, relic: 0 }, skills: { mining: 0, woodcutting: 0, herbalism: 0, fishing: 0, [resource.skill]: xp },
    quest: { chapter: 0, stage: 0, kills: 0, crystals: 0, progress: Object.fromEntries(CHAPTERS[0].objectives.map(o => [o.id, 0])), completed: false, ending: null }, ...extra };
}
const selected = tiers.map(kind => GATHERING_NODES.find(node => node.kind === kind));
const copper = GATHERING_NODES.filter(node => node.kind === 'copper-vein'), sunstone = GATHERING_NODES.filter(node => node.kind === 'sunstone-vein'), flowers = GATHERING_NODES.filter(node => node.kind === 'sunblossom');
const basic = { ...toWorld('greenwood', ZONES[0].nodes.find(node => node.kind === 'crystal')), kind: 'crystal' };
const filler = Object.fromEntries(Object.keys(LOOT_ITEMS).slice(0,16).map(id => [id, 1]));
const heroes = [...selected.map((node, i) => hero(`Qualified ${i}`, node, threshold(RESOURCE_TYPES[node.kind].requiredLevel))),
  ...selected.map((node, i) => hero(`Locked ${i}`, node, threshold(RESOURCE_TYPES[node.kind].requiredLevel) - 1)),
  hero('Full bags', copper[1], threshold(10), { carriedItems: filler }),
  hero('Existing stack', copper[1], threshold(10), { carriedItems: Object.fromEntries(Object.entries(filler).slice(0, 15)), inventory: { wood: 0, crystal: 1, herb: 0, potion: 0, relic: 0 } }),
  hero('Cancelled gather', copper[2], threshold(10)), hero('Claim competitor', copper[2], threshold(10)),
  hero('Maximum skill', flowers[1], MAX_SKILL_XP - 10),
  hero('Overflow guard', sunstone[1], threshold(50), { inventory: { wood: 0, crystal: Number.MAX_SAFE_INTEGER - 1, herb: 0, potion: 0, relic: 0 } }),
  hero('Next unlock', basic, threshold(10) - 1)];
assert.equal(bagUsage(heroes[18]), bagCapacity(heroes[18])); assert.equal(bagUsage(heroes[19]), bagCapacity(heroes[19]));
const tokens = heroes.map(() => randomBytes(32).toString('base64url'));
async function until(predicate, label) { const end = realNow() + 6500; while (realNow() < end) { const value = predicate(); if (value) return value; await delay(10); } throw Error(`Timed out: ${label}`); }
async function tick(ms = 1000) { clock += ms; await delay(140); }
async function start() { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' }); port = await game.start(); }
async function connect(index) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, messages: [] }; clients.push(c);
  c.send = message => socket.send(JSON.stringify(message)); c.player = () => c.snapshot?.players.find(player => player.id === heroes[index].id);
  socket.on('message', raw => { const message = JSON.parse(raw); if (message.type === 'snapshot') c.snapshot = message; else c.messages.push(message); });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token: tokens[index], characterId: heroes[index].id }); await until(() => c.player(), 'world entry'); return c;
}
const progress = player => structuredClone({ inventory: player.inventory, skills: player.skills, xp: player.xp, level: player.level });
async function begin(c, node) { c.send({ type: 'gather', targetId: node.id }); return until(() => c.player().gathering, `start ${node.id}`); }
async function complete(c, node) { const gathering = await begin(c, node); await tick(gathering.endsAt - clock); await until(() => !c.player().gathering, 'gather completion'); }
try {
  for (const monster of Object.values(MONSTERS)) Object.assign(monster, { speed: 0, aggroRange: 0 });
  writeFileSync(file, JSON.stringify(Object.fromEntries(heroes.map((player, index) => [key(tokens[index]), { characters: [player] }]))));
  await start(); const c = []; for (let index = 0; index < heroes.length; index++) c.push(await connect(index));
  assert(c.some(client => client.snapshot.nodes.some(node => node.id.startsWith('wild-gathering-'))), 'the server actually spawns the scattered resources');
  for (const client of c) for (const { instanceId, available, respawnAt, ...node } of client.snapshot.nodes) assert.deepEqual(node, worldNodes.get(node.id), 'server snapshots agree with client resource navigation');
  for (let index = 0; index < tiers.length; index++) {
    const locked = c[index + 9], before = progress(locked.player()); locked.send({ type: 'gather', targetId: selected[index].id });
    await until(() => locked.messages.some(message => message.type === 'event' && message.text.includes('requires')), 'locked requirement response');
    assert.equal(locked.player().gathering, null); assert.deepEqual(progress(locked.player()), before); assert(locked.snapshot.nodes.find(node => node.id === selected[index].id).available);
  }
  const forged = c[0], unchanged = progress(forged.player()); forged.send({ type: 'gather', targetId: selected[0].id, xp: MAX_SKILL_XP, yield: 99 }); await tick(); assert.equal(forged.player().gathering, null); assert.deepEqual(progress(forged.player()), unchanged);
  const actions = []; for (let i = 0; i < tiers.length; i++) { const action = await begin(c[i], selected[i]); actions.push(action); assert.equal(action.endsAt - action.startedAt, gatheringDuration(selected[i].kind, heroes[i].skills[RESOURCE_TYPES[selected[i].kind].skill])); }
  await tick(Math.max(...actions.map(action => action.endsAt)) - clock - 1);
  for (let i = 0; i < tiers.length; i++) if (actions[i].endsAt > clock) assert.deepEqual(progress(c[i].player()), progress(heroes[i]), 'nothing is granted before the collection completes');
  await tick(2);
  for (let i = 0; i < tiers.length; i++) {
    const node = selected[i], resource = RESOURCE_TYPES[node.kind]; await until(() => c[i].player().inventory[resource.reward] === resource.yield, `${node.kind} exact yield`);
    assert.equal(c[i].player().skills[resource.skill], heroes[i].skills[resource.skill] + resource.xp); assert.equal(c[i].player().xp, resource.adventureXp);
    assert(c[i].messages.some(message => message.type === 'event' && message.logOnly && message.text.startsWith(`+${resource.yield} ${resource.reward}`)), 'the numeric reward stays in chat');
    assert.deepEqual(c[i].messages.filter(message => message.type === 'damage' && message.effect === 'xp').map(message => message.amount), [resource.adventureXp]);
    const before = progress(c[i].player()); c[i].send({ type: 'gather', targetId: node.id }); await delay(20); assert.deepEqual(progress(c[i].player()), before, 'replaying a harvested node cannot duplicate rewards');
  }
  const fullBefore = progress(c[18].player()); await complete(c[18], copper[1]); assert.deepEqual(progress(c[18].player()), fullBefore); assert(c[18].snapshot.nodes.find(node => node.id === copper[1].id).available, 'full bags never consume the resource');
  await complete(c[19], copper[1]); await until(() => c[19].player().inventory.crystal === 3, 'existing stack accepts the full yield without another slot');
  const cancelledBefore = progress(c[20].player()), gathering = await begin(c[20], copper[2]); c[21].send({ type: 'gather', targetId: copper[2].id }); await tick(100);
  assert.equal(c[21].player().gathering, null, 'one resource has one claimant');
  c[20].send({ type: 'move', x: c[20].player().x + .25, z: c[20].player().z, rotation: 0 }); await until(() => !c[20].player().gathering, 'movement cancels collection');
  await tick(gathering.endsAt - clock + 1); assert.deepEqual(progress(c[20].player()), cancelledBefore); assert(c[20].snapshot.nodes.find(node => node.id === copper[2].id).available);
  await begin(c[21], copper[2]); c[21].send({ type: 'cancelGather' }); await until(() => !c[21].player().gathering, 'explicit cancellation');
  await complete(c[22], flowers[1]); await until(() => c[22].player().skills.herbalism === MAX_SKILL_XP, 'profession XP cap'); assert.equal(c[22].player().inventory.herb, 5);
  assert(c[22].messages.some(message => message.type === 'event' && message.logOnly && message.text.includes('+10 Herbalism XP')), 'capped XP reports only the actual gain');
  const overflowBefore = progress(c[23].player()); await complete(c[23], sunstone[1]); assert.deepEqual(progress(c[23].player()), overflowBefore); assert(c[23].snapshot.nodes.find(node => node.id === sunstone[1].id).available, 'integer overflow cannot consume resources or corrupt saves');
  await complete(c[24], basic); await until(() => skillProgress(c[24].player().skills.mining).level === 10, 'first profession unlock');
  assert(c[24].messages.some(message => message.type === 'event' && !message.logOnly && message.text.includes('Unlocked: Copper vein')), 'level-up announces the newly available resource');
  assert(!c[0].messages.some(message => message.type === 'event' && message.text.includes('Unlocked: Copper vein')), 'unlock notices stay private');
  const starterNode = () => c[24].snapshot.nodes.find(node => node.id === basic.id);
  assert(!starterNode().available); assert.equal(starterNode().respawnAt - clock, 22000, 'starter supplies keep their short respawn');
  await tick(21999); assert(!starterNode().available, 'harvested resources stay depleted until their respawn');
  await tick(1); await until(() => starterNode().available, 'starter crystals regrow for the next beginner');

  // A save/admin change between start and completion cannot bypass the second requirement check.
  const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8'), extract = name => source.match(new RegExp(`  function ${name}\\([^]*?\\n  \\}`))[0];
  const target = { ...copper[0], available: true, instanceId: null }, subject = { player: hero('Changed skill', target, threshold(10) - 1), instanceId: null, gathering: { nodeId: target.id, endsAt: 1 } };
  const claims = new Map([[target.id, subject]]), messages = [], context = { nodes: [target], gatheringClaims: claims, storeBoostMultiplier, RESOURCE_TYPES, SKILLS, canGather, canTraverse, WORLD_COLLIDERS, WORLD_BOUNDS, DUNGEON_COLLIDERS: [], DUNGEON_BOUNDS: WORLD_BOUNDS, waterAt, distance: (a,b) => Math.hypot(a.x-b.x,a.z-b.z), event: (...args) => messages.push(args), committingAccounts: new Map(), addXp() { assert.fail('locked completion cannot award XP'); } };
  runInNewContext(`${extract('cancelGathering')}\n${extract('finishGathering')}\nthis.complete=finishGathering;`, context); context.complete(subject, 10);
  assert.equal(subject.gathering, null); assert.equal(claims.size, 0); assert(target.available); assert.equal(subject.player.inventory.crystal, 0); assert(messages[0][2].includes('requires'));
  subject.player.hp = 0; subject.player.skills.mining = threshold(10); subject.gathering = { nodeId: target.id, endsAt: 1 }; claims.set(target.id, subject);
  context.complete(subject, 10); assert.equal(subject.gathering, null); assert.equal(claims.size, 0); assert(target.available); assert.equal(subject.player.inventory.crystal, 0, 'death cancels collection without consuming the node');
  const expected = c.map(client => progress(client.player())); await game.stop(); game = null;
  const disk = JSON.parse(readFileSync(file, 'utf8')); for (let i = 0; i < heroes.length; i++) assert.deepEqual(progress(disk[key(tokens[i])].characters[0]), expected[i], 'all new profession progress and yields persist');
  await start(); const restored = await connect(22); assert.deepEqual(progress(restored.player()), expected[22]); assert.equal(restored.player().gathering, null);
  console.log(`PASS gathering progression: ${WORLD_GATHERING_NODES.length} world placements, ${wild.length} scattered nodes across ${EXPEDITIONS.length} regions, singles and clusters, intact starter supplies, four ranks and profession10/25/50 requirements, exact yields/XP/durations, starter unlock access, diminishing XP without dead ends, claims/cancellation/death, full stacks/bags, integer and XP caps, completion recheck, private unlocks and durable restart.`);
} finally { for (const client of clients) client.socket.terminate(); await game?.stop(); Date.now = realNow; for (const [kind, stats] of Object.entries(originalMonsters)) Object.assign(MONSTERS[kind], stats); rmSync(dir, { recursive: true, force: true }); }
