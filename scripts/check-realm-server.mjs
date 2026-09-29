import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { MONSTERS } from '../src/bestiary.ts';
import { CHAPTERS } from '../src/content.ts';
import { starterGear } from '../src/progression.ts';
import { RESOURCE_TYPES } from '../src/skills.ts';
import { newContracts } from '../src/adventure.ts';
import { findPath } from '../src/navigation.ts';
import { toWorld, regionAt, canTraverse, WORLD_COLLIDERS, WORLD_BOUNDS } from '../src/realm.ts';
import { waterAt } from '../src/landscape.ts';
import { DUNGEON_COMPLETION_XP, DUNGEON_STAGES, DUNGEON_OBJECTS, dungeonColliders, DUNGEON_CHECKPOINT, DUNGEON_EXIT, DUNGEON_BOUNDS } from '../src/dungeon.ts';

const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-realm-')), file = join(dataDir, 'players.json');
const realNow = Date.now, clients = [];
let offset = 0, game, port;
Date.now = () => realNow() + offset;
const token = () => randomBytes(32).toString('base64url'), key = value => createHash('sha256').update(value).digest('hex');
function hero(name, zone = 'greenwood', local = { x: 3, z: 4 }, options = {}) {
  const level = options.level || 75, chapter = options.chapter || 0;
  const p = { id: randomUUID(), name, coordinateVersion: 2, zone, ...toWorld(zone, local), rotation: 0,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
    characterCreated: true, talents: [], ...starterGear('Ranger'), hp: 100 + (level - 1) * 12, maxHp: 100 + (level - 1) * 12, level, xp: 7, gold: 40,
    inventory: { wood: 40, crystal: 40, potion: 10, herb: 40, relic: 0 }, skills: { mining: 0, woodcutting: 0, herbalism: 0 }, craftingXp: 0, contracts: newContracts(),
    quest: { chapter, stage: 1, kills: 0, crystals: 0, progress: Object.fromEntries(CHAPTERS[chapter].objectives.map(o => [o.id, 0])), completed: false, ending: null }, ...options };
  delete p.chapter; return p;
}
async function until(predicate, label, timeout = 5000) {
  const end = realNow() + timeout;
  while (realNow() < end) { const result = predicate(); if (result) return result; await delay(15); }
  throw new Error(`Timed out: ${label}`);
}
async function advance(ms = 1000) { offset += ms; await delay(115); }
async function start(records) {
  if (records) writeFileSync(file, JSON.stringify(records));
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir, keycloak: null, databaseUrl: '' }); port = await game.start();
}
async function select(c, id) {
  c.welcome = null; c.snapshot = null; c.send({ type: 'selectCharacter', characterId: id });
  await until(() => c.welcome?.id === id && c.player(), 'character selected');
}
async function connect(accountToken, id) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, messages: [], snapshot: null, roster: null, welcome: null, closeCode: null }; clients.push(c);
  c.send = message => socket.send(JSON.stringify(message));
  c.player = () => c.snapshot?.players.find(p => p.id === c.welcome?.id);
  socket.on('message', raw => { const message = JSON.parse(raw); c.messages.push(message); if (message.type === 'roster') c.roster = message; if (message.type === 'welcome') c.welcome = message; if (message.type === 'snapshot') c.snapshot = message; });
  socket.on('close', code => c.closeCode = code);
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token: accountToken }); await until(() => c.roster, 'private account roster');
  if (id) await select(c, id); return c;
}
async function walk(c, goal) {
  const instance = c.player().instanceId, path = findPath(c.player(), goal, instance ? dungeonColliders(c.snapshot.dungeon.clearedStages, c.snapshot.dungeon.objects.filter(object => object.activated).map(object => object.id)) : WORLD_COLLIDERS, instance ? DUNGEON_BOUNDS : WORLD_BOUNDS);
  assert.ok(path.length, `walkable route to ${JSON.stringify(goal)}`);
  for (const point of path) while (Math.hypot(c.player().x - point.x, c.player().z - point.z) > .02) {
    const p = c.player(), gap = Math.hypot(point.x - p.x, point.z - p.z), step = Math.min(2.5, gap);
    const next = { x: p.x + (point.x - p.x) / gap * step, z: p.z + (point.z - p.z) / gap * step };
    offset += 400; c.send({ type: 'move', zone: p.zone, ...next, rotation: 0 });
    await until(() => Math.hypot(c.player().x - next.x, c.player().z - next.z) < .02, 'legal swept movement');
  }
}
async function kill(c, id) {
  while (c.snapshot.enemies.find(e => e.id === id)?.alive) {
  const count = c.messages.filter(m => m.type === 'combat' && m.playerId === c.welcome.id).length;
  c.send({ type: 'attack', skill: 'special', targetId: id });
  await until(() => c.messages.filter(m => m.type === 'combat' && m.playerId === c.welcome.id).length > count, 'accepted attack');
  await advance(4200);
  }
}
async function invite(leader, member) {
  leader.send({ type: 'partyInvite', targetId: member.welcome.id });
  const invitation = await until(() => member.snapshot.partyInvites.find(i => i.inviterId === leader.welcome.id), 'personal invitation');
  member.send({ type: 'partyAccept', invitationId: invitation.id });
  await until(() => member.snapshot.party?.members.some(m => m.id === leader.welcome.id), 'invitation accepted');
  await advance(1000);
}

try {
  let seamRoute;
  for(let z=WORLD_BOUNDS.minZ+6;z<WORLD_BOUNDS.maxZ-6&&!seamRoute;z+=4) for(let x=WORLD_BOUNDS.minX+6;x<WORLD_BOUNDS.maxX-6;x+=4){
    const from={x,z},to={x:x+4,z};
    if(regionAt(x,z)!==regionAt(to.x,to.z)&&!waterAt(x,z)&&!waterAt(to.x,to.z)&&canTraverse(from,to)){seamRoute={from,to};break;}
  }
  assert(seamRoute,'a walkable open biome boundary exists');
  const tokens = Array.from({ length: 7 }, token);
  const main = hero('Builder'), seam = { ...hero('Traveler'), ...seamRoute.from, zone:regionAt(seamRoute.from.x,seamRoute.from.z) }, delver = hero('Delver', 'hollow', { x: 0, z: -24 }, { hp: 250 }), weak = hero('Novice', 'hollow', { x: 0, z: -24 }, { level: 10, hp: 1 });
  const friend = hero('Friend', 'greenwood', { x: 0, z: 4 }), outsider = hero('Outsider', 'greenwood', { x: 0, z: 8 });
  const partner = hero('Partner', 'hollow', { x: 0, z: -24 }), solo = hero('Solo', 'hollow', { x: 0, z: -24 });
  const cheater = hero('Invalid client', 'greenwood', { x: 0, z: 8 });
  const legacy = hero('Legacy', 'amberwild', { x: 0, z: 22 }, { chapter: 1 });
  legacy.x = 0; legacy.z = 22; delete legacy.coordinateVersion; delete legacy.inventory.relic; delete legacy.craftingXp; delete legacy.contracts;
  await start(Object.fromEntries([[main, seam, delver, weak], [friend], [outsider], [partner], [solo], [cheater], [legacy]].map((characters, i) => [key(tokens[i]), { characters }])));
  const a = await connect(tokens[0], main.id), b = await connect(tokens[1], friend.id), observer = await connect(tokens[2], outsider.id);
  const migrated = await connect(tokens[6], legacy.id);
  assert.deepEqual([migrated.player().x, migrated.player().z, migrated.player().coordinateVersion], [...Object.values(toWorld('amberwild', {x:0,z:22})), 2]);
  assert.equal(migrated.player().gold, legacy.gold); assert.equal(migrated.player().xp, legacy.xp);
  assert(a.snapshot.enemies.length && a.snapshot.enemies.every(e=>Math.hypot(e.x-a.player().x,e.z-a.player().z)<=200), 'overworld snapshots contain nearby enemies');
  await select(a, seam.id); await walk(a, seamRoute.to);
  assert.equal(a.player().zone, regionAt(seamRoute.to.x,seamRoute.to.z)); assert.equal(a.player().quest.chapter, 0, 'chapter progress does not lock open exploration');
  await select(a, main.id);
  a.send({ type: 'acceptContract', contractId: 'greenwood-tonics' });
  a.send({ type: 'acceptContract', contractId: 'greenwood-herbs' });
  await until(() => Object.keys(a.player().contracts.active).length === 2, 'board contracts accepted');
  await walk(a, { x: 3, z: 3.2 });
  const correctionCount = a.messages.filter(m => m.type === 'correction').length;
  offset += 500; a.send({ type: 'move', x: 3, z: 1, rotation: 0 });
  await until(() => a.messages.filter(m => m.type === 'correction').length > correctionCount, 'swept movement blocks crossing a solid board');
  assert.equal(a.player().z, 3.2);
  await walk(a, { x: -4, z: 5.7 });
  const inventory = structuredClone(a.player().inventory);
  a.send({ type: 'craft', recipeId: 'trail-tonic' }); a.send({ type: 'craft', recipeId: 'trail-tonic' });
  await until(() => a.player().craftingXp === 12, 'one craft accepted');
  assert.equal(a.player().inventory.potion, inventory.potion + 1); assert.equal(a.player().inventory.herb, inventory.herb - 2);
  await advance(800); a.send({ type: 'craft', recipeId: 'trail-tonic' });
  await until(() => a.player().contracts.active['greenwood-tonics'] === 2, 'crafting credits board contract');
  await advance(800); a.send({ type: 'craft', recipeId: 'warden-longbow' });
  await until(() => a.player().ownedGear.includes('warden-longbow'), 'crafted gear owned');
  const afterGear = structuredClone(a.player().inventory); await advance(800); a.send({ type: 'craft', recipeId: 'warden-longbow' }); await advance();
  assert.deepEqual(a.player().inventory, afterGear, 'duplicate owned gear cannot consume materials');
  await walk(a, { x: 3, z: 4 }); const beforeGold = a.player().gold;
  a.send({ type: 'claimContract', contractId: 'greenwood-tonics' }); a.send({ type: 'claimContract', contractId: 'greenwood-tonics' });
  await until(() => a.player().gold === beforeGold + 18, 'once-only board reward');
  a.send({ type: 'acceptContract', contractId: 'greenwood-tonics' }); await advance();
  assert.ok(!Object.hasOwn(a.player().contracts.active, 'greenwood-tonics'), 'repeat contract respects cooldown');
  await walk(a, { x: 7, z: 13 }); a.send({ type: 'gather', targetId: 'herb-greenwood-0' });
  await until(() => a.player().gathering, 'gathering begins'); await advance(2500);
  assert.equal(a.player().contracts.active['greenwood-herbs'], 1); assert.equal(a.player().skills.herbalism, RESOURCE_TYPES.herb.xp);
  await invite(a, b);
  await invite(a, observer);
  const c = await connect(tokens[3], partner.id), d = await connect(tokens[4], solo.id);
  await invite(a, c); a.send({ type: 'partyInvite', targetId: d.welcome.id }); await advance();
  assert.equal(a.snapshot.party.members.length, 4); assert.equal(d.snapshot.partyInvites.length, 0, 'party capacity is four');
  b.send({ type: 'partyKick', targetId: a.welcome.id }); await advance(); assert.equal(a.snapshot.party.leaderId, a.welcome.id, 'members cannot kick their leader');
  observer.send({ type: 'partyLeave' }); c.send({ type: 'partyLeave' }); await advance();
  await walk(a, { x: 8, z: 1 }); await walk(b, { x: 9, z: 3 });
  const xpA = a.player().xp, xpB = b.player().xp, xpOut = observer.player().xp;
  await kill(a, 'slime-0');
  assert.equal(a.player().xp, xpA + MONSTERS['moss-slime'].xp); assert.equal(b.player().xp, xpB + MONSTERS['moss-slime'].xp); assert.equal(observer.player().xp, xpOut, 'nearby outsiders get no ordinary party kill credit');
  await until(() => b.snapshot.loot.some(drop => drop.enemyId === 'slime-0'), 'partner receives personal monster loot');
  const drops = [a, b].flatMap(client => client.snapshot.loot.filter(drop => drop.enemyId === 'slime-0'));
  assert.deepEqual(drops.map(drop => drop.ownerId).sort(), [a.welcome.id, b.welcome.id].sort());
  const drop = drops.find(drop => drop.ownerId === a.welcome.id), gold = a.player().gold;
  a.send({ type: 'loot', targetId: drop.id }); a.send({ type: 'loot', targetId: drop.id });
  await until(() => a.player().gold === gold + drop.gold, 'personal loot collected once');
  a.send({ type: 'partyPromote', targetId: b.welcome.id }); await until(() => b.snapshot.party.leaderId === b.welcome.id, 'leader transfers control');
  b.send({ type: 'partyPromote', targetId: a.welcome.id }); await until(() => a.snapshot.party.leaderId === a.welcome.id, 'promoted leader manages party');
  await select(a, delver.id); assert.equal(a.snapshot.party, null, 'character switching leaves the former party');
  await walk(a, toWorld('hollow', { x: 3, z: 4 })); a.send({ type: 'acceptContract', contractId: 'hollow-vault' });
  await until(() => Object.hasOwn(a.player().contracts.active, 'hollow-vault'), 'dungeon board contract accepted');
  await walk(a, toWorld('hollow', { x: 0, z: -24 }));
  await invite(a, c); c.send({ type: 'partyChat', text: 'Private route' }); await advance();
  assert(a.messages.some(m => m.kind === 'chat' && m.text.includes('[Party] Partner: Private route')));
  assert(!b.messages.some(m => m.kind === 'chat' && m.text.includes('Private route')), 'party chat does not leak');
  c.send({ type: 'dungeonEnter' }); await advance(); assert.equal(c.player().instanceId, null, 'only the party leader launches');
  a.send({ type: 'dungeonEnter' }); await until(() => a.player().instanceId && c.player().instanceId === a.player().instanceId, 'party enters one instance');
  d.send({ type: 'dungeonEnter' }); await until(() => d.player().instanceId, 'solo enters separate instance');
  assert.notEqual(a.player().instanceId, d.player().instanceId);
  assert(a.snapshot.enemies[0].maxHp > d.snapshot.enemies[0].maxHp, 'enemy health scales with the original party size');
  assert(a.snapshot.enemies.every(e => e.instanceId === a.player().instanceId)); assert.equal(a.snapshot.nodes.length, 0);
  await until(() => !b.snapshot.players.some(p => p.id === a.welcome.id), 'overworld observer sees dungeon departure');
  assert(!b.snapshot.enemies.some(e => e.instanceId), 'overworld does not receive dungeon entities');
  const casts = d.messages.filter(m => m.type === 'combat').length;
  d.send({ type: 'attack', targetId: a.snapshot.enemies[0].id }); d.send({ type: 'gather', targetId: 'herb-hollow-0' }); await advance();
  assert.equal(d.messages.filter(m => m.type === 'combat').length, casts); assert.equal(d.player().gathering, null);
  a.send({ type: 'dungeonInteract', targetId: 'garden-cache' }); a.send({ type: 'dungeonInteract', targetId: 'forged-object' }); await advance();
  assert(!a.snapshot.dungeon.objects.some(object => object.activated), 'remote or forged dungeon interactions do nothing');
  await walk(a, { x: 0, z: .5 });
  const gatePosition = { x: a.player().x, z: a.player().z }, corrections = a.messages.filter(message => message.type === 'correction').length;
  await advance(); a.send({ type: 'move', zone: 'hollow', x: 0, z: -2.5, rotation: 0 });
  await until(() => a.messages.filter(message => message.type === 'correction').length > corrections, 'closed gate rejects authoritative movement');
  assert.deepEqual({ x: a.player().x, z: a.player().z }, gatePosition, 'a closed portcullis cannot be crossed before clearing its guardians');
  assert.equal(a.snapshot.dungeon.rooms, 8);
  const xpBeforeDungeon = a.player().xp, partnerXpBeforeDungeon = c.player().xp;
  for (const stage of DUNGEON_STAGES) {
    await until(() => a.snapshot.enemies.some(e => e.id.includes(`-${stage.id}-`)), `encounter ${stage.id} opens`);
    if (stage.id === 'throne') {
      await walk(a, { x: 0, z: -97 });
      await until(() => a.snapshot.dungeon.hazards.some(hazard => hazard.endsAt > a.snapshot.serverTime), 'Heartkeeper shows an eruption warning');
      let hits = a.messages.filter(m => m.kind === 'damage' && m.text.startsWith('Root eruption')).length;
      const warning = a.snapshot.dungeon.hazards[0];
      assert.equal(warning.endsAt - warning.startedAt, 1800, 'boss gives a full dodge window');
      await walk(a, { x: 0, z: -91.5 }); await advance(1000);
      assert.equal(a.messages.filter(m => m.kind === 'damage' && m.text.startsWith('Root eruption')).length, hits, 'moving out of the marked area dodges damage');
      await walk(a, { x: 0, z: -97 }); await advance(4500);
      await until(() => a.snapshot.dungeon.hazards.some(hazard => Math.hypot(hazard.x-a.player().x, hazard.z-a.player().z) < 1), 'a new warning uses the authoritative player position');
      hits = a.messages.filter(m => m.kind === 'damage' && m.text.startsWith('Root eruption')).length;
      await advance(1900);
      assert.equal(a.messages.filter(m => m.kind === 'damage' && m.text.startsWith('Root eruption')).length, hits + 1, 'remaining inside the warning takes one authoritative hit');
    }
    for (const enemy of a.snapshot.enemies.filter(e => e.alive && e.id.includes(`-${stage.id}-`))) {
      if (!a.snapshot.enemies.find(e => e.id === enemy.id)?.alive) continue;
      await walk(a, { x: enemy.x, z: enemy.z + 2.5 }); await kill(a, enemy.id);
    }
    await until(() => a.snapshot.dungeon.clearedStages.includes(stage.id), `encounter ${stage.id} cleared`);
    for (const object of DUNGEON_OBJECTS.filter(object => object.stageId === stage.id && object.kind !== 'chest')) {
      await walk(a, { x: object.x, z: object.z + 1.5 }); a.send({ type: 'dungeonInteract', targetId: object.id });
      await until(() => a.snapshot.dungeon.objects.find(item => item.id === object.id).activated, `${object.kind} activated`);
    }
    if (stage.id === 'west-seal') {
      assert(!a.snapshot.enemies.some(e => e.id.includes('-confluence-')), 'one seal cannot open the sanctuary encounter');
      const cache = DUNGEON_OBJECTS.find(object => object.id === 'garden-cache');
      await walk(a, { x: cache.x, z: cache.z + 1.5 });
      a.send({ type: 'dungeonInteract', targetId: cache.id }); a.send({ type: 'dungeonInteract', targetId: cache.id });
      await until(() => [a, c].every(client => client.snapshot.loot.some(drop => drop.enemyId.endsWith(cache.id))), 'side chest creates personal treasure');
      const personal = [a, c].flatMap(client => client.snapshot.loot.filter(drop => drop.enemyId.endsWith(cache.id)));
      assert.equal(personal.length, 2, 'one chest drop per member despite duplicate requests');
      assert(personal.every(drop => drop.sourceObjectId === cache.id && drop.name.endsWith('contents')), 'cache loot identifies its interactive source');
      const own = personal.find(drop => drop.ownerId === a.welcome.id), other = personal.find(drop => drop.ownerId === c.welcome.id);
      a.send({ type: 'loot', targetId: other.id }); await advance(); assert.equal(a.player().inventory.relic, 0, 'another member’s cache remains private');
      a.send({ type: 'loot', targetId: own.id }); a.send({ type: 'loot', targetId: own.id });
      await until(() => a.player().inventory.relic === 1, 'side relic is manually collected once');
    }
    if (stage.id === 'confluence') {
      assert(a.snapshot.dungeon.checkpoint.active);
      assert.equal(a.player().hp, a.player().maxHp, 'sanctuary attunement heals the living expedition');
      assert.equal(c.player().hp, c.player().maxHp, 'sanctuary attunement also heals party members');
      const xpBeforeWipe = a.player().xp;
      await walk(c, { x: -31, z: -68 }); await walk(a, { x: -31, z: -68 });
      for (let i = 0; i < 150 && a.snapshot.dungeon.wipes === 0; i++) await advance(1600);
      assert.equal(a.snapshot.dungeon.wipes, 1, 'the entire party can wipe in the deeper wings');
      assert.deepEqual([a.player().x, a.player().z], [DUNGEON_CHECKPOINT.x, DUNGEON_CHECKPOINT.z], 'wipe resumes at the activated sanctuary');
      assert.equal(a.snapshot.dungeon.clearedStages.length, 5, 'checkpoint preserves the first five encounters');
      assert(a.snapshot.dungeon.objects.find(object => object.id === 'garden-cache').activated, 'opened treasure cannot reset on wipe');
      assert.equal(a.player().inventory.relic, 1); assert.equal(a.player().xp, xpBeforeWipe, 'wipe does not reset earned progress');
    }
  }
  assert(a.snapshot.dungeon.completed);
  const dungeonKillXp = DUNGEON_STAGES.flatMap(stage => stage.enemies).reduce((sum, enemy) => sum + MONSTERS[enemy.kind].xp, 0);
  assert.equal(a.player().xp, xpBeforeDungeon + dungeonKillXp + DUNGEON_COMPLETION_XP, 'full clear grants reduced kill XP plus the completion bonus');
  assert(c.player().xp >= partnerXpBeforeDungeon + DUNGEON_COMPLETION_XP, 'every instance party member earns the completion bonus');
  const completionXp = a.player().xp;
  await advance(3000);
  assert.equal(a.player().xp, completionXp, 'completed instance cannot grant XP again on later ticks');
  assert.equal(a.messages.filter(m => m.kind === 'reward' && m.text.startsWith('Rootvault cleared')).length, 1, 'completion reward is announced once');
  assert.equal(a.player().contracts.active['hollow-vault'], 1, 'clear credits the dungeon contract once');
  const relicDrop = a.snapshot.loot.find(drop => drop.ownerId === a.welcome.id && drop.relic === 2);
  assert(relicDrop); await walk(a, { x: relicDrop.x, z: relicDrop.z + 1.5 });
  a.send({ type: 'loot', targetId: relicDrop.id }); a.send({ type: 'loot', targetId: relicDrop.id });
  await until(() => a.player().inventory.relic === 3, 'completion relics collected once');
  await walk(a, DUNGEON_EXIT); a.send({ type: 'dungeonExit' });
  await until(() => a.player().instanceId === null, 'exit returns to the realm');
  assert.equal(a.player().zone, 'hollow'); assert.equal(a.player().inventory.relic, 3);
  await walk(a, toWorld('hollow', { x: -4, z: 5 })); a.send({ type: 'craft', recipeId: 'rootforged-sigil' });
  await until(() => a.player().ownedGear.includes('rootforged-charm'), 'dungeon relics forge real equipment');
  assert.equal(a.player().inventory.relic, 1); assert.equal(a.player().craftingXp, 90);
  a.send({ type: 'partyLeave' }); await advance(); await select(a, weak.id); a.send({ type: 'dungeonEnter' });
  await until(() => a.player().instanceId, 'solo novice enters'); await walk(a, { x: 0, z: 15 });
  await until(() => a.snapshot.dungeon.wipes === 1, 'a full wipe resets the run', 10000);
  assert.equal(a.snapshot.dungeon.room, 1); assert.equal(a.player().hp, a.player().maxHp); assert.equal(a.player().z, 22);
  const bad = await connect(tokens[5], cheater.id), begin = Date.now(), startZ = bad.player().z;
  for (let i = 1; i <= 25; i++) bad.send({ type: 'move', x: 0, z: startZ + i * .1, rotation: 0 });
  await until(() => bad.snapshot.serverTime > begin + 100, 'small-step flood observed');
  assert(bad.player().z - startZ <= .8 + (bad.snapshot.serverTime - begin) / 1000 * 7.8 + .15, 'packet frequency cannot multiply movement tolerance');
  for (let i = 0; i < 12 && !bad.closeCode; i++) { offset += 600; bad.send({ type: 'attack', gold: 999999 }); await delay(70); }
  await until(() => bad.closeCode === 4403, 'repeated impossible authority claims close the client');
  assert(bad.messages.some(m => m.type === 'correction')); assert.equal(bad.player().gold, cheater.gold);
  await game.stop();
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(saved[key(tokens[0])].characters.find(p => p.id === main.id).craftingXp, 64);
  const savedDelver = saved[key(tokens[0])].characters.find(p => p.id === delver.id);
  assert.equal(savedDelver.inventory.relic, 1); assert(savedDelver.ownedGear.includes('rootforged-charm')); assert.equal(savedDelver.coordinateVersion, 2);
  assert.equal(saved[key(tokens[4])].characters[0].z, toWorld('hollow', {x:0,z:-24}).z, 'disconnect/restart stores the overworld entry, not instance coordinates');
  await start(); const restored = await connect(tokens[6], legacy.id);
  assert.deepEqual([restored.player().x, restored.player().z], [...Object.values(toWorld('amberwild', {x:0,z:22}))], 'coordinate migration runs only once');
  await game.stop();
  for (const corruptPlayer of [p => p.contracts.active = { forged: 999 }, p => p.coordinateVersion = 7, p => p.zone = 'frostmarch', p => p.inventory.relic = -1]) {
    const corrupt = structuredClone(saved); corruptPlayer(corrupt[key(tokens[0])].characters[0]);
    writeFileSync(file, JSON.stringify(corrupt)); const original = readFileSync(file, 'utf8');
    assert.throws(() => createGameServer({ port: 0, dataDir, keycloak: null, databaseUrl: '' }), /Invalid/);
    assert.equal(readFileSync(file, 'utf8'), original);
  }
  console.log('PASS: global migration/travel; authoritative gathering/crafting/contracts; party consent/capacity/privacy/credit; isolated eight-encounter dungeon, rune seals, checkpoint, relics, exit/wipe; movement debt and cheat disconnect; persistent progress and corrupt-save preservation.');
} finally {
  for (const c of clients) c.socket.terminate(); await game?.stop(); Date.now = realNow; rmSync(dataDir, { recursive: true, force: true });
}
