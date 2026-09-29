import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { CHAPTERS } from '../src/content.ts';
import { COMMUNITY_VERSION } from '../src/community.ts';
import { starterGear } from '../src/progression.ts';
import { defaultHotbar } from '../src/spells.ts';
import { newContracts } from '../src/adventure.ts';
import { toWorld, regionAt, canTraverse, WORLD_BOUNDS, OVERWORLD_SPAWNS } from '../src/realm.ts';
import { waterAt } from '../src/landscape.ts';

const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-party-')), clients = [], realNow = Date.now;
let game, port, offset = 0;
Date.now = () => realNow() + offset;
const key = token => createHash('sha256').update(token).digest('hex');
function hero(name, point, className = 'Ranger') {
  return { id: randomUUID(), name, ...point, zone: regionAt(point.x, point.z), coordinateVersion: 2, rotation: 0,
    appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className },
    characterCreated: true, talents: [], ...starterGear(className), hotbar: defaultHotbar(className),
    hp: 808, maxHp: 808, level: 60, xp: 0, gold: 0, inventory: { wood: 0, crystal: 0, herb: 0, potion: 3, relic: 0 },
    skills: { mining: 0, woodcutting: 0, herbalism: 0 }, craftingXp: 0, contracts: newContracts(),
    quest: { chapter: 0, stage: 0, kills: 0, crystals: 0, progress: Object.fromEntries(CHAPTERS[0].objectives.map(o => [o.id, 0])), completed: false, ending: null } };
}
async function until(predicate, label) {
  const end = realNow() + 5000;
  while (realNow() < end) { const result = predicate(); if (result) return result; await delay(12); }
  throw Error(`Timed out: ${label}`);
}
async function advance(ms = 1100) { offset += ms; await delay(125); }
async function connect(token, id) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), client = { socket, messages: [] }; clients.push(client);
  client.send = message => socket.send(JSON.stringify(message));
  client.player = () => client.snapshot?.players.find(player => player.id === id);
  socket.on('message', raw => { const message = JSON.parse(raw); client.messages.push(message); if (['roster', 'welcome', 'snapshot'].includes(message.type)) client[message.type] = message; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  client.send({ type: 'join', token }); await until(() => client.roster, 'private roster');
  client.send({ type: 'acceptCommunityRules', version: COMMUNITY_VERSION });
  await until(() => client.messages.some(message=>message.type==='community' && message.accepted), 'accepted community rules');
  client.send({ type: 'selectCharacter', characterId: id }); await until(() => client.player(), 'world presence');
  return client;
}
async function invite(leader, target) {
  await advance(); leader.send({ type: 'partyInvite', targetId: target.welcome.id });
  return until(() => target.snapshot.partyInvites.find(invite => invite.inviterId === leader.welcome.id), 'personal invitation');
}
async function rejected(client, message) {
  await advance(700); // Rejection notices are deliberately throttled by the server.
  const count = client.messages.length; client.send(message);
  await until(() => client.messages.slice(count).some(m => m.type === 'event' && m.kind === 'info'), `rejection of ${message.type}`);
}

try {
  let seam;
  for (let z = WORLD_BOUNDS.minZ + 6; z < WORLD_BOUNDS.maxZ - 6 && !seam; z += 4)
    for (let x = WORLD_BOUNDS.minX + 6; x < WORLD_BOUNDS.maxX - 6; x += 4) {
      const from = { x, z }, to = { x: x + 4, z };
      if (regionAt(from.x, z) !== regionAt(to.x, z) && !waterAt(from.x, z) && !waterAt(to.x, z) && canTraverse(from, to)) { seam = { from, to }; break; }
    }
  assert(seam, 'a dry, clear biome boundary exists');
  const leaderZone = regionAt(seam.from.x, seam.from.z) === 'greenwood' ? 'amberwild' : 'greenwood';
  const slime = OVERWORLD_SPAWNS.find(enemy => enemy.kind === 'moss-slime' && canTraverse(enemy,{x:enemy.x,z:enemy.z+14}) && Array.from({length:8},(_,i)=>({x:enemy.x,z:enemy.z+i*2})).every(point=>!waterAt(point.x,point.z)) && OVERWORLD_SPAWNS.every(other=>other.id===enemy.id||Math.hypot(other.x-enemy.x,other.z-(enemy.z+14))>16));
  assert(slime, 'a current slime spawn has a clear approach outside initial aggro');
  const heroes = [hero('Openworld Captain', toWorld(leaderZone, { x: 0, z: 22 })), hero('Wandering Mage', seam.from, 'Mage'), hero('Uninvited Knight', toWorld('frostmarch', { x: 0, z: 22 }), 'Knight'),
    { ...hero('Wounded Wanderer', { x: slime.x, z: slime.z+14 }), hp: 1 }];
  const tokens = heroes.map(() => randomBytes(32).toString('base64url'));
  writeFileSync(join(dataDir, 'players.json'), JSON.stringify(Object.fromEntries(heroes.map((p, i) => [key(tokens[i]), { characters: [p] }]))));
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir, keycloak: null, databaseUrl: '' }); port = await game.start();
  const [a, b, outsider] = await Promise.all(tokens.slice(0, 3).map((token, i) => connect(token, heroes[i].id)));
  assert.notEqual(a.player().zone, b.player().zone, 'invite spans different overworld biomes');
  assert(Math.hypot(a.player().x - b.player().x, a.player().z - b.player().z) > 200, 'invite works outside entity interest range');
  let invitation = await invite(a, b);
  assert.equal(b.snapshot.party, null, 'an invitation never silently joins the target');
  assert.equal(outsider.snapshot.partyInvites.length, 0, 'invitation remains private');
  await rejected(outsider, { type: 'partyAccept', invitationId: invitation.id });
  b.send({ type: 'partyDecline', invitationId: invitation.id });
  await until(() => !b.snapshot.partyInvites.length, 'invitation declined'); assert.equal(b.snapshot.party, null);
  invitation = await invite(a, b);
  b.send({ type: 'partyAccept', invitationId: invitation.id });
  await until(() => a.snapshot.party?.members.length === 2 && b.snapshot.party?.members.length === 2, 'cross-biome party accepted');
  const partyId = a.snapshot.party.id;
  assert.equal(a.snapshot.party.leaderId, a.welcome.id);
  for (const client of [a, b]) {
    assert.equal(client.snapshot.party.id, partyId);
    assert.deepEqual(client.snapshot.party.members.map(m => m.id), heroes.slice(0, 2).map(p => p.id));
    for (const member of client.snapshot.party.members) {
      const p = heroes.find(p => p.id === member.id);
      assert.equal(member.name, p.name); assert.equal(member.className, p.appearance.className);
      assert.equal(member.level, p.level); assert.equal(member.maxHp, p.maxHp); assert(member.hp > 0 && member.hp <= member.maxHp);
      assert.equal(member.zone, p.zone); assert.equal(member.instanceId, null);
    }
  }
  for (const x of [seam.from.x + 2, seam.to.x]) {
    await advance(500); b.send({ type: 'move', x, z: seam.to.z, zone: b.player().zone, rotation: 0 });
    await until(() => Math.abs(b.player().x - x) < .01, 'legal movement across the biome boundary');
  }
  await until(() => b.player().zone === regionAt(seam.to.x, seam.to.z) && a.snapshot.party.members.find(m => m.id === b.welcome.id).zone === b.player().zone, 'party HUD follows a biome crossing');
  assert.equal(b.snapshot.party.id, partyId, 'walking between biomes preserves the party');
  await rejected(b, { type: 'partyInvite', targetId: outsider.welcome.id });
  await rejected(b, { type: 'partyKick', targetId: a.welcome.id });
  await rejected(b, { type: 'partyPromote', targetId: a.welcome.id });
  assert.equal(a.snapshot.party.leaderId, a.welcome.id); assert.equal(outsider.snapshot.party, null);
  b.send({ type: 'partyChat', text: 'Across the open world' });
  await until(() => a.messages.some(m => m.kind === 'chat' && m.text.includes('Across the open world')), 'private party chat crosses biomes');
  assert(!outsider.messages.some(m => m.kind === 'chat' && m.text.includes('Across the open world')));
  a.send({ type: 'partyPromote', targetId: b.welcome.id });
  await until(() => b.snapshot.party.leaderId === b.welcome.id, 'leader transfers control outside a dungeon');
  a.send({ type: 'leaveWorld' });
  await until(() => b.snapshot.party.members.length === 1, 'leaving the world removes former membership');
  b.send({ type: 'partyLeave' }); await until(() => b.snapshot.party === null, 'last member disbands the party');
  // Receive an invitation alive, then die to an actual nearby slime before answering it.
  const wounded = await connect(tokens[3], heroes[3].id);
  invitation = await invite(b, wounded); assert.equal(wounded.player().hp, 1);
  for (const distance of [12, 10, 8, 6, 4, 2, 0]) {
    if (!wounded.player().hp) break;
    const point = { x: slime.x, z: slime.z + distance };
    assert(canTraverse(wounded.player(), point) && !waterAt(point.x, point.z), 'the wounded adventurer approaches a slime along clear ground');
    await advance(500); wounded.send({ type: 'move', ...point, zone: wounded.player().zone, rotation: 0 });
    await until(() => !wounded.player().hp || Math.abs(wounded.player().z - point.z) < .01, 'approach the slime');
  }
  await until(() => wounded.player().hp === 0, 'slime kills the invited adventurer');
  const diedAt = wounded.player().diedAt;
  assert(diedAt > 0 && wounded.messages.some(message => message.kind === 'damage'), 'death was caused by authoritative combat');
  const beforeDeadAccept=wounded.snapshot.serverTime;
  wounded.send({ type: 'partyAccept', invitationId: invitation.id });await advance(700);
  await until(()=>wounded.snapshot.serverTime>beforeDeadAccept,'snapshot after dead acceptance attempt');
  assert.equal(wounded.snapshot.party, null, 'dead adventurers still cannot accept invitations');
  assert(wounded.snapshot.partyInvites.some(invite => invite.id === invitation.id), 'blocked acceptance leaves the invitation available to decline');
  wounded.send({ type: 'partyDecline', invitationId: invitation.id });
  await until(() => !wounded.snapshot.partyInvites.length, 'dead adventurer declines the invitation');
  assert.equal(wounded.player().hp, 0); assert.equal(wounded.player().diedAt, diedAt);
  assert.equal(wounded.snapshot.party, null); assert.equal(b.snapshot.party.members.length, 1, 'declining never adds party membership');
  console.log('PASS: private consent-based open-world parties across distant biomes; real movement retains membership; complete party HUD data; leader-only management; private chat; leave-world/disband cleanup; received-then-dead invitation decline with acceptance still blocked.');
} finally {
  for (const client of clients) client.socket.terminate();
  if (game) await game.stop();
  Date.now = realNow; rmSync(dataDir, { recursive: true, force: true });
}
