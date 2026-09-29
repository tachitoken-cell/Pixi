import { canTraverse, regionAt, WORLD_BOUNDS, toWorld, OVERWORLD_SPAWNS, overworldSpawnAllowed } from '../src/realm.ts';
import { ROOTVAULT_ENTRANCE, ROOTVAULT_GUARDIAN } from '../src/dungeon.ts';
import { waterAt } from '../src/landscape.ts';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { CHAPTERS, ZONES } from '../src/content.ts';
import { starterGear, combatStats } from '../src/progression.ts';
import { combatTiming } from '../src/combat-timing.ts';
import { DEATH_ANIMATION_MS } from '../src/shared.ts';
import { MONSTERS, BASIC_ATTACK, monsterLevelScale } from '../src/bestiary.ts';
import { SPELLS, spellCastTimeMs, spellsForClass, GLOBAL_ATTACK_MS, spellDamage } from '../src/spells.ts';

const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-combat-events-'));
const appearance = { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' };
const clients = [], realNow = Date.now;
const combatBase = OVERWORLD_SPAWNS.find(enemy=>enemy.id==='slime-1');
const field = (x,z)=>({x:combatBase.x+x-12,z:combatBase.z+z+1});
assert(canTraverse(field(12,-1),field(12,3)) && !waterAt(field(12,-1).x,field(12,-1).z), 'combat fixture uses clear ground beyond the capital walls');
const clearSpawns=()=>[{id:'slime-0',kind:'moss-slime',...field(12,3)},{id:'slime-1',kind:'moss-slime',...field(15,4)},{id:'slime-2',kind:'moss-slime',...field(7,4)},...ZONES[0].enemies.filter(enemy=>!['slime-0','slime-1','slime-2'].includes(enemy.id))];
let game, port;
async function until(predicate, label) {
  const end = realNow() + 5000;
  while (realNow() < end) { const result = predicate(); if (result) return result; await delay(20); }
  throw new Error(`Timed out: ${label}`);
}
async function connect(token, enter = true) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`);
  const c = { socket, messages: [], roster: null, welcome: null, snapshot: null }; clients.push(c);
  socket.on('message', raw => {
    const m = JSON.parse(raw.toString()); c.messages.push(m);
    if (m.type === 'roster') c.roster = m;
    if (m.type === 'welcome') c.welcome = m;
    if (m.type === 'snapshot') c.snapshot = m;
  });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send = m => socket.send(JSON.stringify(m));
  c.send({ type: 'join', token });
  await until(() => c.roster, 'roster');
  if (enter) {
    c.send({ type: 'selectCharacter', characterId: c.roster.characters[0].id });
    await until(() => c.welcome && c.snapshot, 'entered');
  }
  c.player = () => c.snapshot.players.find(p => p.id === c.welcome.id);
  c.casts = () => c.messages.filter(m => m.type === 'combat');
  return c;
}
async function preparation(client, ability) {
  if(!SPELLS[ability].castTimeMs){const event=await until(()=>client.casts().findLast(event=>event.ability===ability&&event.playerId===client.welcome.id),`${ability} instant release`);return {ability,startedAt:event.startedAt,endsAt:event.startedAt,rotation:event.rotation};}
  const casting = await until(() => client.player().casting, `${ability} preparation`);
  assert.equal(casting.ability, ability);
  assert.equal(casting.endsAt - casting.startedAt, spellCastTimeMs(SPELLS[ability], combatStats(client.player())), 'cast duration uses explicit spell timing');
  assert(!client.casts().some(event => event.playerId === client.welcome.id && event.startedAt >= casting.startedAt), 'no release event exists during preparation');
  return casting;
}
function impactTimes(cast) {
  return cast.targets.map((target, index) => {
    const timing = combatTiming(cast.ability, Math.hypot(target.x - cast.from.x, target.z - cast.from.z), index);
    return cast.startedAt + (timing.delay + timing.flight) * 1000;
  });
}
function assertDelayed(client, cast, before, playerBefore) {
  assert.ok(Number.isFinite(cast.startedAt));
  const times = impactTimes(cast);
  for (let index = 0; index < cast.targets.length; index++) {
    const id = cast.targets[index].id, old = before.find(e => e.id === id);
    const snapshots = client.messages.filter(m => m.type === 'snapshot' && m.serverTime >= cast.startedAt && m.serverTime < times[index]);
    assert.ok(snapshots.length, `${cast.ability} has a visible wind-up before damage`);
    for (const snapshot of snapshots) {
      const enemy = snapshot.enemies.find(e => e.id === id);
      assert.equal(enemy.hp, old.hp, `${cast.ability} HP cannot change before impact`);
      assert.equal(enemy.alive, true, `${cast.ability} cannot kill before impact`);
    }
  }
  for (const snapshot of client.messages.filter(m => m.type === 'snapshot' && m.serverTime >= cast.startedAt && m.serverTime < Math.min(...times))) {
    const p = snapshot.players.find(p => p.id === client.welcome.id);
    assert.deepEqual([p.gold, p.xp, p.quest.kills], [playerBefore.gold, playerBefore.xp, playerBefore.quest.kills], 'no rewards before impact');
  }
}
async function fixture(overrides, enemyStart, enemyZone = 'greenwood', enemyHp = 44) {
  const tokens = overrides.map(() => randomBytes(32).toString('base64url'));
  const records = Object.fromEntries(overrides.map((override, index) => {
    const level = override.level || 1, className = override.className || 'Mage';
    const player = { id: randomUUID(), name: `Timing ${index}`, appearance: { ...appearance, className }, characterCreated: true, talents: [], ...starterGear(className),
      zone: 'greenwood', x: 10, z: 1, rotation: 0, hp: 100 + (level - 1) * 12, maxHp: 100 + (level - 1) * 12, level, xp: 0, gold: 0,
      inventory: { wood: 0, crystal: 0, potion: 3, herb: 0 }, skills: { mining: 0, woodcutting: 0, herbalism: 0 },
      quest: { chapter: 0, stage: 1, kills: 0, crystals: 0, progress: { 'grove-slimes': 0, 'grove-crystals': 0 }, completed: false, ending: null }, ...override };
    delete player.className;
    if(!override.coordinateVersion)Object.assign(player,player.zone==='greenwood'?field(override.x??12,override.z??-1):toWorld(player.zone,{x:override.x??0,z:override.z??-24}));
    player.coordinateVersion=2;player.zone=regionAt(player.x,player.z);player.learnedSpells=spellsForClass(className).filter(spell=>spell.requiredLevel<=level).map(spell=>spell.id);
    return [createHash('sha256').update(tokens[index]).digest('hex'), { characters: [player] }];
  }));
  writeFileSync(join(dataDir, 'players.json'), JSON.stringify(records));
  // Isolated fixtures place a normal slime beside a seam or dungeon entrance.
  const zone = ZONES.find(zone => zone.id === enemyZone), original = zone.enemies;
  if (enemyStart) zone.enemies = [{ ...ZONES[0].enemies[0], ...enemyStart }, ...original.filter(enemy => enemy.id !== 'slime-0')];
  else zone.enemies=clearSpawns();
  const originalHp = MONSTERS['moss-slime'].hp; MONSTERS['moss-slime'].hp = enemyHp;
  try { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir, keycloak: null, databaseUrl: '' }); }
  finally { zone.enemies = original; MONSTERS['moss-slime'].hp = originalHp; }
  port = await game.start();
  return tokens;
}

try {
  for (const [className, abilities] of Object.entries({ Ranger: ['arrow', 'volley'], Mage: ['fireball', 'nova'], Knight: ['strike', 'whirlwind'] })) {
    const level = SPELLS[abilities[1]].requiredLevel, maxHp = 100 + (level - 1) * 12;
    const stats = combatStats({ level, appearance: { className }, talents: [], equipment: starterGear(className).equipment });
    const targetHp = spellDamage(SPELLS[abilities[0]],stats) + Math.ceil(spellDamage(SPELLS[abilities[1]],stats)*.75);
    assert(targetHp > spellDamage(SPELLS[abilities[1]],stats), 'special alone leaves untouched targets alive');
    const tokens = Array.from({ length: 4 }, () => randomBytes(32).toString('base64url'));
    const records = Object.fromEntries(tokens.map((token, index) => {
      const zone = index === 2 ? 'amberwild' : 'greenwood', chapter = index === 2 ? 1 : 0;
      const player = { id: randomUUID(), name: `Cast ${index}`, appearance: { ...appearance, className }, characterCreated: true, talents: [], ...starterGear(className),
        zone, coordinateVersion:2, ...(index===2?toWorld(zone,{x:0,z:22}):field(index===0?12:0,index===0?-1:22)), learnedSpells:spellsForClass(className).filter(spell=>spell.requiredLevel<=level).map(spell=>spell.id), rotation: 0.8, hp: maxHp, maxHp, level, xp: 0, gold: 0,
        inventory: { wood: 0, crystal: 0, potion: 3, herb: 0 }, skills: { mining: 0, woodcutting: 0, herbalism: 0 },
        quest: { chapter, stage: 1, kills: 0, crystals: 0, progress: Object.fromEntries(CHAPTERS[chapter].objectives.map(o => [o.id, 0])), completed: false, ending: null } };
      return [createHash('sha256').update(token).digest('hex'), { characters: [player] }];
    }));
    writeFileSync(join(dataDir, 'players.json'), JSON.stringify(records));
    // A special alone leaves these fixtures alive; primary plus special is still lethal.
    const oldTargetHp = MONSTERS['moss-slime'].hp;
    MONSTERS['moss-slime'].hp = targetHp;
    const oldSpawns=ZONES[0].enemies;ZONES[0].enemies=clearSpawns();
    try { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir, keycloak: null, databaseUrl: '' }); }
    finally { MONSTERS['moss-slime'].hp = oldTargetHp;ZONES[0].enemies=oldSpawns; }
    port = await game.start();
    const actor = await connect(tokens[0]), peer = await connect(tokens[1]), elsewhere = await connect(tokens[2]), roster = await connect(tokens[3], false);
    const distant = actor.snapshot.enemies.find(enemy => enemy.alive && Math.hypot(enemy.x - actor.player().x, enemy.z - actor.player().z) > SPELLS[abilities[0]].range + 5);
    assert(distant, 'fixture includes a target beyond the increased attack range');
    for (const targetId of ['missing', distant.id, 'briar-sentinel-0', { forged: true }]) actor.send({ type: 'attack', targetId });
    actor.send({ type: 'attack', skill: 'forged' });
    actor.send({ type: 'combat', playerId: peer.welcome.id, ability: 'fireball', targets: [{ id: 'slime-0', x: 999, z: 999 }] });
    roster.send({ type: 'attack', targetId: 'slime-0' });
    elsewhere.send({ type: 'attack', targetId: 'slime-0' });
    await delay(160);
    assert.equal(actor.casts().length, 0, 'invalid, distant, wrong-zone and forged casts do not broadcast');
    assert.equal(peer.casts().length, 0);
    const damage = spellDamage(SPELLS[abilities[0]],combatStats(actor.player())), primaryBefore = structuredClone(actor.snapshot.enemies), primaryPlayer = structuredClone(actor.player());
    actor.send({ type: 'attack', targetId: 'slime-0', playerId: peer.welcome.id, zone: 'amberwild', from: { x: 999, z: 999 }, rotation: 999, targets: [{ id: 'forged', x: 999, z: 999 }] });
    actor.send({ type: 'attack', targetId: 'slime-0' });
    actor.send({ type: 'attack', skill: 'special' });
    const primaryPreparation = await preparation(actor, abilities[0]);
    await until(() => actor.casts().length === 1 && peer.casts().length === 1, 'one accepted primary cast replicated');
    const primary = actor.casts()[0]; assert.equal(primary.startedAt, primaryPreparation.endsAt);
    assert.equal(primary.ability, abilities[0]);
    assert.equal(primary.playerId, actor.welcome.id);
    assert.equal(primary.zone, 'greenwood');
    assert.deepEqual(primary.from, field(12,-1));
    assert.equal(primary.rotation, primaryPreparation.rotation, 'client-supplied rotation cannot replace the authoritative cast facing');
    const initialTarget = primaryBefore.find(enemy => enemy.id === 'slime-0');
    assert(Math.abs(primary.rotation - Math.atan2(initialTarget.x - primaryPlayer.x, initialTarget.z - primaryPlayer.z)) < .15, 'the cast faces its actual target');
    assert.deepEqual(primary.targets.map(t => t.id), ['slime-0']);
    assert.ok(Math.hypot(primary.targets[0].x - field(12,-1).x, primary.targets[0].z - field(12,-1).z) <= combatStats(actor.player()).range);
    assert.deepEqual(peer.casts()[0], primary, 'same-zone peers receive the authoritative event unchanged');
    await until(() => actor.snapshot.enemies.find(e => e.id === 'slime-0').hp === targetHp - damage, 'primary damage unchanged');
    assertDelayed(actor, primary, primaryBefore, primaryPlayer);
    await delay(Math.max(620,primaryPreparation.startedAt+GLOBAL_ATTACK_MS+20-Date.now()));
    assert.equal(actor.casts().length, 1, 'cooldown rejections produce no animation');
    const before = structuredClone(actor.snapshot.enemies), specialPlayer = structuredClone(actor.player());
    actor.send({ type: 'attack', skill: 'special', targets: [{ id: 'forged', x: 999, z: 999 }] });
    actor.send({ type: 'attack', skill: 'special' });
    const specialPreparation = await preparation(actor, abilities[1]);
    await until(() => actor.casts().length === 2 && peer.casts().length === 2, 'one accepted special cast replicated');
    const special = actor.casts()[1]; assert.equal(special.startedAt, specialPreparation.endsAt);
    assert.equal(special.ability, abilities[1]);
    assert.ok(special.targets.length >= 2, 'area attacks include every impacted target');
    assert.deepEqual(special.from, field(12,-1));
    assert.ok(special.targets.every(t => Number.isFinite(t.x) && Number.isFinite(t.z) && Math.hypot(t.x - field(12,-1).x, t.z - field(12,-1).z) <= SPELLS[special.ability].range));
    await until(() => special.targets.every(t => actor.snapshot.enemies.find(e => e.id === t.id).hp < before.find(e => e.id === t.id).hp), 'special damage applied');
    assertDelayed(actor, special, before, specialPlayer);
    const affected = actor.snapshot.enemies.filter(e => e.hp < (before.find(old => old.id === e.id)?.hp ?? e.maxHp)).map(e => e.id).sort();
    assert.deepEqual(special.targets.map(t => t.id).sort(), affected, 'event targets exactly match damaged enemies');
    const defeated = actor.snapshot.enemies.find(e => e.id === 'slime-0');
    const impact = special.targets.find(t => t.id === defeated.id);
    assert.equal(defeated.alive, false);
    assert.ok(impact && Number.isFinite(impact.x) && Number.isFinite(impact.z), 'lethal target retains cast coordinates while it moves during flight');
    assert.equal(actor.player().gold, 0, 'kills leave gold for manual pickup');
    const drops = actor.snapshot.loot.filter(drop => drop.ownerId === actor.welcome.id);
    assert.equal(drops.length, 1); assert.equal(drops[0].gold, 8);
    assert.equal(actor.player().xp, 7); assert.equal(actor.player().quest.kills, 1);
    await delay(150);
    assert.equal(actor.casts().length, 2);
    assert.equal(peer.casts().length, 2);
    assert.equal(elsewhere.casts().length, 2, 'other connected regions receive the same overworld cast');
    assert.equal(roster.casts().length, 0, 'roster-only connections do not receive the cast');
    await game.stop();
  }
  for (const action of ['leaveWorld', 'disconnect', 'takeover', 'dungeonEnter', 'death']) {
    const dungeon = action === 'dungeonEnter';
    let deathClock = realNow(); if (action === 'death') Date.now = () => deathClock;
    const overrides = dungeon ? { coordinateVersion: 2, ...ROOTVAULT_ENTRANCE, level: 10, rootvaultUnlocked: true, quest: { chapter: 7, stage: 1, kills: 0, crystals: 0, progress: Object.fromEntries(CHAPTERS[7].objectives.map(o => [o.id, 0])), completed: false, ending: null } }
      : action === 'death' ? { className: 'Ranger', x:12, z:2.5, level: SPELLS['power-shot'].requiredLevel, hp: Math.round(MONSTERS['moss-slime'].damage * BASIC_ATTACK.damageScale) + 1 } : {};
    const targetId = dungeon ? ROOTVAULT_GUARDIAN.id : 'slime-0';
    const tokens = await fixture([dungeon ? { ...overrides, z: ROOTVAULT_ENTRANCE.z + 3 } : { x: 0, z: 22 }, overrides]);
    const observer = await connect(tokens[0]), actor = await connect(tokens[1]);
    const targetHp = actor.snapshot.enemies.find(enemy => enemy.id === targetId).hp;
    if (action === 'death') {
      const firstAttack = await until(() => actor.snapshot.enemies.find(e => e.id === targetId).attack, 'first enemy swing');
      deathClock = firstAttack.impactAt;
      await until(() => actor.player().hp === 1, 'first enemy hit leaves caster alive');
    }
    actor.send({ type: 'attack', targetId, ...(action === 'death' ? { ability: 'power-shot' } : {}) });
    const casting = await preparation(actor, action === 'death' ? 'power-shot' : 'fireball');
    if (action === 'death') deathClock = casting.endsAt;
    const cast = await until(() => actor.casts()[0], `${action} accepted cast`);
    assert.equal(cast.startedAt, casting.endsAt);
    if (action === 'disconnect') actor.socket.close();
    else if (action === 'takeover') await connect(tokens[1]);
    else if (action === 'dungeonEnter') {
      actor.send({ type: 'dungeonEnter' });
      await until(() => actor.player()?.instanceId, 'caster leaves the overworld for a dungeon instance');
    } else if (action === 'death') {
      const attack = await until(() => { const attack = actor.snapshot.enemies.find(enemy => enemy.id === targetId).attack; return attack?.impactAt > cast.startedAt && attack; }, 'next melee contact precedes released projectile');
      assert(attack.impactAt < Math.min(...impactTimes(cast))); deathClock = attack.impactAt;
      await until(() => actor.player().hp === 0, 'caster dies before impact');
      deathClock = actor.player().diedAt + DEATH_ANIMATION_MS;
      actor.send({ type: 'respawn' });
      await until(() => actor.player().hp === actor.player().maxHp, 'respawn does not revive the cancelled cast');
    } else actor.send({ type: 'leaveWorld' });
    await delay(Math.max(0, Math.max(...impactTimes(cast)) + 180 - Date.now()));
    const enemy = observer.snapshot.enemies.find(e => e.id === targetId);
    assert.equal(enemy.hp, targetHp, `${action} cancels the pending hit`);
    assert.ok(!observer.messages.some(m => m.type === 'damage' && m.targetId === targetId), `${action} produces no delayed damage event`);
    await game.stop(); Date.now = realNow;
  }
  {
    let border;
    for(let z=WORLD_BOUNDS.minZ+6;z<WORLD_BOUNDS.maxZ-6&&!border;z+=4)for(let x=WORLD_BOUNDS.minX+8;x<WORLD_BOUNDS.maxX-8;x+=4){
      const from={x:x-.4,z},to={x:x+.4,z},enemy={x:x-1.9,z};
      if(regionAt(enemy.x,z)==='greenwood'&&overworldSpawnAllowed({...enemy,zone:'greenwood'})&&regionAt(from.x,z)!==regionAt(to.x,z)&&!waterAt(from.x,z)&&!waterAt(to.x,z)&&!waterAt(enemy.x,z)&&canTraverse(from,to)&&canTraverse(from,enemy)){border={from,to,enemy};break;}
    }
    assert(border,'clear biome seam for in-flight projectile');
    const tokens = await fixture([{ coordinateVersion:2, x:border.from.x-10,z:border.from.z,zone:regionAt(border.from.x-10,border.from.z) }, { coordinateVersion: 2, ...border.from, zone:regionAt(border.from.x,border.from.z) }], border.enemy);
    const observer = await connect(tokens[0]), actor = await connect(tokens[1]);
    const enemyBefore = observer.snapshot.enemies.find(e => e.id === 'slime-0');
    const expectedHp = enemyBefore.hp - Math.max(1, Math.round(spellDamage(SPELLS.fireball,combatStats(actor.player())) / monsterLevelScale(enemyBefore.level, actor.player().level)));
    actor.send({ type: 'attack', targetId: 'slime-0' });
    await until(() => actor.casts().length === 1, 'cast accepted beside an open region border');
    await delay(50);
    actor.send({ type: 'move', zone: actor.player().zone, ...border.to, rotation: Math.PI });
    await until(() => actor.player().zone === regionAt(border.to.x,border.to.z), 'caster walks across the biome seam');
    await until(() => observer.snapshot.enemies.find(e => e.id === 'slime-0').hp === expectedHp, 'crossing a region does not cancel an in-world projectile');
    assert.equal(observer.snapshot.enemies.find(e => e.id === 'slime-0').level, enemyBefore.level, 'crossing the border does not change the target level');
    assert.equal(observer.casts().length, 1);
    await game.stop();
  }
  {
    const [token] = await fixture([{ className: 'Ranger', level: 4, x: 0, z: 3 }], undefined, 'greenwood', 120);
    const actor = await connect(token);
    const victim=actor.snapshot.enemies.find(e=>e.id==='slime-0'),scale=monsterLevelScale(victim.level,actor.player().level),firstDamage=Math.max(1,Math.round(spellDamage(SPELLS.arrow,combatStats(actor.player()))/scale)),secondDamage=Math.max(1,Math.round(spellDamage(SPELLS.arrow,combatStats({...actor.player(),talents:['ranger-1']}))/scale));
    assert(secondDamage>firstDamage, 'fixture makes the new direct-spell talent affect the next arrow');
    actor.send({ type: 'attack', targetId: 'slime-0' });
    const first = await until(() => actor.casts()[0], 'first long-range shot');
    actor.send({ type: 'learnTalent', talentId: 'ranger-1' });
    await until(() => actor.player().talents.includes('ranger-1'), 'talent learned while arrow is in flight');
    await delay(Math.max(0, first.startedAt + 555 - Date.now()));
    actor.send({ type: 'attack', targetId: 'slime-0' });
    await delay(40);assert.equal(actor.casts().length,1,'GCD rejects another instant shot while the first projectile is still flying');
    assert.equal(actor.snapshot.enemies.find(e => e.id === 'slime-0').hp,victim.hp,'rejected attacks cannot prematurely resolve the first projectile');
    await until(()=>actor.snapshot.enemies.find(e=>e.id==='slime-0').hp===victim.hp-firstDamage,'first arrow keeps its captured damage');
    await delay(Math.max(0,first.startedAt+GLOBAL_ATTACK_MS+20-Date.now()));
    actor.send({type:'attack',targetId:'slime-0'});
    await until(()=>actor.casts().length===2,'next instant releases after global cooldown');
    await until(() => actor.snapshot.enemies.find(e => e.id === 'slime-0').hp === victim.hp-firstDamage-secondDamage, 'both queued hits land with their original damage');
    assert.equal(actor.messages.filter(m => m.kind === 'combat' && m.text.includes(`for ${firstDamage}.`)).length, 1, 'learning a talent does not alter a launched shot');
    assert.equal(actor.messages.filter(m => m.kind === 'combat' && m.text.includes(`for ${secondDamage}.`)).length, 1);
    await game.stop();
  }
  {
    const tokens = await fixture([{ level: 10 }, { level: 10 }]);
    const first = await connect(tokens[0]), second = await connect(tokens[1]);
    first.send({ type: 'attack', targetId: 'slime-0' }); second.send({ type: 'attack', targetId: 'slime-0' });
    await until(() => first.casts().length === 2, 'competing lethal casts accepted');
    await until(() => !first.snapshot.enemies.find(e => e.id === 'slime-0').alive, 'one competing hit kills the target');
    await delay(250);
    const players = first.snapshot.players;
    assert.equal(players.reduce((sum, p) => sum + p.gold, 0), 0, 'competing kills never auto-collect gold');
    const drops = [first, second].flatMap(client => client.snapshot.loot);
    assert.equal(drops.length, 1, 'competing hits leave exactly one personal gold drop');
    assert.equal(drops[0].gold, 8);
    assert.equal(drops[0].ownerId, players.find(p => p.xp === 7).id, 'loot belongs to the player credited for the kill');
    assert.equal(players.reduce((sum, p) => sum + p.xp, 0), 7);
    assert.equal(players.reduce((sum, p) => sum + p.quest.kills, 0), 1);
    assert.equal(first.messages.filter(m => m.kind === 'combat').length, 1, 'the consumed dead-target hit cannot apply twice');
    await game.stop();
  }
  console.log('PASS: six authoritative delayed abilities; no early damage/death/rewards; exact damage and area targets; cross-region replication; cooldown and forged-input rejection; logout, takeover, dungeon-entry, death/respawn cancellation; global cooldown during an earlier projectile and frozen damage; competing kills rewarded once.');
} finally {
  for (const c of clients) c.socket.terminate();
  await game?.stop(); Date.now = realNow;
  rmSync(dataDir, { recursive: true, force: true });
}
