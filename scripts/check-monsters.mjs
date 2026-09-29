import { WALK_SPEED } from '../src/travel.ts';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { MONSTERS, WORLD_BOSS, WORLD_BOSSES, BASIC_ATTACK, basicAttackRange, basicAttackCooldown, monsterLevel, monsterLevelScale } from '../src/bestiary.ts';
import { WILDERNESS_SPAWNS, VILLAGES } from '../src/settlements.ts';
import { ZONES } from '../src/content.ts';
import { EXPEDITIONS, waterAt, movementCost, surfaceAt } from '../src/landscape.ts';
import { canTraverse, regionAt, WORLD_COLLIDERS, WORLD_BOUNDS, OVERWORLD_SPAWNS } from '../src/realm.ts';
import { findPath } from '../src/navigation.ts';
import { combatTiming } from '../src/combat-timing.ts';
import { starterGear, combatStats } from '../src/progression.ts';
import { SPELLS, spellDamage } from '../src/spells.ts';

const newKinds = Object.keys(MONSTERS).filter(kind => MONSTERS[kind].model && MONSTERS[kind].damage > 0 && !WORLD_BOSSES.some(boss=>boss.kind===kind) && WILDERNESS_SPAWNS.some(spawn=>spawn.kind===kind));
assert.equal(newKinds.length, 10); assert.equal(Object.keys(MONSTERS).length, 32);
for (const kind of newKinds) assert(WILDERNESS_SPAWNS.filter(spawn => spawn.kind === kind).length >= 10, `${kind} has multiple real wilderness encounters`);
for (const camp of EXPEDITIONS.filter(camp=>!['sunveil','mistwood'].includes(camp.zone))) for (let i = 0; i < 3; i++) {
  const expected = camp.zone === 'hollow' ? i % 2 ? 'ice-wisp' : 'briar-sentinel' : ZONES.find(zone => zone.id === camp.zone).enemyKind;
  assert.equal(WILDERNESS_SPAWNS.find(spawn => spawn.id === `expedition-${camp.id}-enemy-${i}`).kind, expected, 'existing quest camp monster kinds remain unchanged');
}
for (let x = -24; x <= 24; x += 4) for (let z = -24; z <= 24; z += 4) if (Math.hypot(x, z) <= 24) {
  const point = { x: WORLD_BOSS.x + x, z: WORLD_BOSS.z + z };
  assert(!waterAt(point.x, point.z) && canTraverse(point, point), 'the boss arena is dry and unobstructed');
}
assert(VILLAGES.every(v => Math.hypot(v.x - WORLD_BOSS.x, v.z - WORLD_BOSS.z) > 60));
const dir = mkdtempSync(join(tmpdir(), 'mossvale-monsters-')), file = join(dir, 'players.json'), clients = [], realNow = Date.now;
let clock = realNow(), game, port; Date.now = () => clock;
function hero(name, point, level = 100, className = 'Knight') { return { id: randomUUID(), name, ...point, zone: regionAt(point.x, point.z), coordinateVersion: 2, rotation: 0, characterCreated: true,
  appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className },
  talents: [], ...starterGear(className), hp: 100 + (level - 1) * 12, maxHp: 100 + (level - 1) * 12, level, xp: 0, gold: 0,
  inventory: { wood: 0, crystal: 0, herb: 0, potion: 3, relic: 0 }, quest: { stage: 0, kills: 0, crystals: 0 } }; }
async function until(fn, label) { const end = realNow() + 5000; while (realNow() < end) { const value = fn(); if (value) return value; await delay(12); } throw Error(`Timed out: ${label}`); }
async function advance(ms = 1000) { clock += ms; await delay(115); }
async function start(players) {
  clock += 20000;
  const tokens = players.map(() => randomBytes(32).toString('base64url'));
  writeFileSync(file, JSON.stringify(Object.fromEntries(players.map((p, i) => [createHash('sha256').update(tokens[i]).digest('hex'), { characters: [p] }]))));
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' }); port = await game.start(); return tokens;
}
async function connect(token, enter = true) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, messages: [] }; clients.push(c);
  c.send = message => socket.send(JSON.stringify(message)); c.player = () => c.snapshot?.players.find(p => p.id === c.welcome?.id);
  socket.on('message', raw => { const m = JSON.parse(raw); c.messages.push(m); if (['roster', 'welcome', 'snapshot'].includes(m.type)) c[m.type] = m; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send({ type: 'join', token }); await until(() => c.roster, 'roster'); if (enter) await select(c); return c;
}
async function select(c) { c.welcome = null; c.snapshot = null; c.send({ type: 'selectCharacter', characterId: c.roster.characters[0].id }); await until(() => c.player(), 'world entry'); }
async function stop() { for (const c of clients.splice(0)) c.socket.terminate(); if (game) await game.stop(); game = null; }
async function walk(c, point) {
  const path = findPath(c.player(), point, WORLD_COLLIDERS, WORLD_BOUNDS); assert(path.length, 'walkable destination');
  for (const to of path) while (Math.hypot(c.player().x - to.x, c.player().z - to.z) > .02) {
    const p = c.player(), gap = Math.hypot(to.x - p.x, to.z - p.z), step = Math.min(2.2, gap), next = { x: p.x + (to.x - p.x) / gap * step, z: p.z + (to.z - p.z) / gap * step };
    clock += Math.ceil(movementCost(p, next) / WALK_SPEED * 1000) + 100; c.send({ type: 'move', ...next, zone: p.zone, rotation: 0 });
    await until(() => Math.hypot(c.player().x - next.x, c.player().z - next.z) < .02, 'accepted movement');
  }
}
async function cast(c, enemyId, ability = 'strike') {
  const from = c.messages.length; c.send({ type: 'attack', ability, targetId: enemyId });
  const event = await until(() => c.messages.slice(from).find(m => m.type === 'combat' && m.playerId === c.welcome.id), 'accepted player attack');
  const target = event.targets.find(t => t.id === enemyId), timing = combatTiming(ability, Math.hypot(target.x - event.from.x, target.z - event.from.z));
  return event.startedAt + (timing.delay + timing.flight) * 1000;
}
async function strike(c, enemyId, ability = 'strike') { await cast(c, enemyId, ability); await advance(700); }
const encounter = kind => OVERWORLD_SPAWNS.find(spawn => spawn.roaming && spawn.kind === kind && monsterLevel(kind,spawn.zone,surfaceAt(spawn.x,spawn.z).regionId,spawn.id)<=30 && !OVERWORLD_SPAWNS.some(other => other !== spawn && Math.hypot(other.x - spawn.x, other.z - spawn.z) < 15));
try {
  const styles = new Set();
  for (const kind of newKinds) {
    const spawn = encounter(kind); assert(spawn);
    const p = hero('Timing tester', { x: spawn.x + 1, z: spawn.z }); const [token] = await start([p]), c = await connect(token);
    const enemy = () => c.snapshot.enemies.find(e => e.id === spawn.id);
    const attack = await until(() => enemy()?.attack, `${kind} starts a normal attack`); styles.add(attack.style);
    assert.equal(enemy().name, MONSTERS[kind].name); assert.equal(enemy().maxHp, MONSTERS[kind].hp); assert.equal(enemy().worldBoss, false);
    assert.equal(enemy().level, monsterLevel(kind,spawn.zone,surfaceAt(spawn.x,spawn.z).regionId,spawn.id),'roaming monster levels follow their actual home region and stable ID');
    assert.equal(attack.basic, true, 'the first close-range attack is an uncharged basic');
    assert.equal(attack.impactAt - attack.startedAt, BASIC_ATTACK.impactMs); assert.equal(attack.endsAt - attack.impactAt, BASIC_ATTACK.recoveryMs);
    assert.equal(attack.targetId, p.id); assert.equal(c.player().hp, p.hp, 'no damage occurs when the normal swing starts');
    const at = { x: enemy().x, z: enemy().z }; await advance(BASIC_ATTACK.impactMs - 1);
    assert.equal(c.player().hp, p.hp); assert.deepEqual({ x: enemy().x, z: enemy().z }, at, 'no damage before visible contact');
    await advance(1);
    const damage = Math.round(MONSTERS[kind].damage * BASIC_ATTACK.damageScale);
    assert.equal(c.player().hp, p.hp - damage, 'damage lands once at contact');
    await advance(BASIC_ATTACK.recoveryMs); assert.equal(c.player().hp, p.hp - damage, 'recovery does not repeat damage');
    await advance(basicAttackCooldown(kind) - (Date.now() - attack.startedAt));
    const second = enemy().attack; assert(second?.basic && second.id !== attack.id, 'normal attacks repeat while in melee range');
    await advance(MONSTERS[kind].cooldownMs * 3 - (Date.now() - attack.startedAt));
    const special = enemy().attack; assert(special && !special.basic, 'occasional charged specials remain');
    assert.equal(special.impactAt - special.startedAt, MONSTERS[kind].windupMs);
    assert.equal(special.endsAt - special.impactAt, MONSTERS[kind].recoveryMs);
    await stop();
  }
  assert.deepEqual([...styles].sort(), ['bite', 'pulse', 'slam', 'spit', 'sting', 'swipe']);
  const wolf = encounter('bramble-wolf'), startPoint = { x: wolf.x + 1, z: wolf.z };
  let [token] = await start([hero('Dodging tester', startPoint)]), c = await connect(token);
  let attack = await until(() => c.snapshot.enemies.find(e => e.id === wolf.id)?.attack, 'normal swing');
  let hp = c.player().hp; clock += 125; c.send({ type: 'move', x: startPoint.x, z: startPoint.z + 1.2, zone: c.player().zone, rotation: 0 });
  await until(() => c.player().z === startPoint.z + 1.2, 'sideways movement inside melee reach'); await advance(attack.impactAt - Date.now());
  assert.equal(c.player().hp, hp - Math.round(MONSTERS['bramble-wolf'].damage * BASIC_ATTACK.damageScale), 'basics follow their target inside actual melee reach'); await stop();
  [token] = await start([hero('Evading tester', { x: wolf.x + 1.6, z: wolf.z })]); c = await connect(token);
  attack = await until(() => c.snapshot.enemies.find(e => e.id === wolf.id)?.attack, 'evadable normal swing'); hp = c.player().hp;
  c.send({ type: 'move', x: wolf.x + 2.2, z: wolf.z, zone: c.player().zone, rotation: 0 });
  await until(() => c.player().x === wolf.x + 2.2, 'leave melee reach'); await advance(BASIC_ATTACK.impactMs);
  assert.equal(c.player().hp, hp, 'leaving actual melee reach avoids the normal hit'); await stop();

  // Earlier player impacts still cancel normal swings, while later hits cannot undo contact.
  for (const ability of ['shield-bash', 'strike']) {
    [token] = await start([hero('Interrupt tester', startPoint, ability === 'shield-bash' ? SPELLS[ability].requiredLevel : 100)]); c = await connect(token);
    if (ability === 'shield-bash') assert(spellDamage(SPELLS[ability], combatStats(c.player())) < MONSTERS['bramble-wolf'].hp, 'the stun fixture must interrupt a surviving monster, not kill it');
    attack = await until(() => c.snapshot.enemies.find(e => e.id === wolf.id)?.attack, 'first normal swing');
    await advance(basicAttackCooldown('bramble-wolf') - 100); hp = c.player().hp;
    const due = await cast(c, wolf.id, ability); await advance(100);
    const pending = c.snapshot.enemies.find(e => e.id === wolf.id).attack;
    assert(pending?.basic && due < pending.impactAt, 'player impact precedes pending normal contact');
    await advance(pending.impactAt - Date.now() + 1);
    assert.equal(c.snapshot.enemies.find(e => e.id === wolf.id).alive, ability === 'shield-bash');
    assert.equal(c.snapshot.enemies.find(e => e.id === wolf.id).attack, null);
    assert.equal(c.player().hp, hp, `${ability} cancels the pending normal hit`); await stop();
  }
  [token] = await start([hero('Late lethal tester', startPoint)]); c = await connect(token);
  attack = await until(() => c.snapshot.enemies.find(e => e.id === wolf.id)?.attack, 'earlier enemy impact');
  await strike(c, wolf.id);
  assert.equal(c.snapshot.enemies.find(e => e.id === wolf.id).alive, false);
  assert.equal(c.player().hp, 1288 - Math.round(MONSTERS['bramble-wolf'].damage * BASIC_ATTACK.damageScale), 'earlier normal contact lands before a later lethal hit in the same delayed tick'); await stop();
  [token] = await start([hero('Returning tester', startPoint)]); c = await connect(token);
  attack = await until(() => c.snapshot.enemies.find(e => e.id === wolf.id)?.attack, 'attack before returning to roster');
  const rosters = c.messages.filter(m => m.type === 'roster').length;
  c.send({ type: 'leaveWorld' }); await until(() => c.messages.filter(m => m.type === 'roster').length > rosters, 'return to roster');
  await select(c); await advance(attack.impactAt - Date.now());
  assert.equal(c.player().hp, 1288, 'an old attack cannot damage a newly entered character'); await stop();

  const golem = encounter('stone-golem');
  const pair = [hero('Melee target', { x: golem.x + 1, z: golem.z }, 1), hero('Nearby bystander', { x: golem.x - 1, z: golem.z }, 1)];
  let tokens = await start(pair), primary = await connect(tokens[0]), bystander = await connect(tokens[1]);
  await until(() => primary.snapshot.enemies.find(e => e.id === golem.id)?.attack, 'single-target slam basic');
  await advance(BASIC_ATTACK.impactMs);
  const golemLevel=primary.snapshot.enemies.find(e=>e.id===golem.id).level;
  assert.equal(primary.player().hp,pair[0].hp-Math.round(Math.round(MONSTERS['stone-golem'].damage*BASIC_ATTACK.damageScale)*monsterLevelScale(golemLevel,pair[0].level)),'underleveled players take the scaled basic hit');
  assert.equal(bystander.player().hp, pair[1].hp, 'slam-style basic attacks only hit the selected target');
  await advance(basicAttackCooldown('stone-golem') - BASIC_ATTACK.impactMs - 100);
  await cast(bystander, golem.id); await advance(100); await advance(100);
  assert.equal(primary.snapshot.enemies.find(e => e.id === golem.id).targetId, bystander.welcome.id, 'higher threat changes the next target');
  hp = primary.player().hp; await advance(50);
  assert(primary.player().hp < hp); assert.equal(bystander.player().hp, pair[1].hp, 'an in-flight basic keeps its original target after threat changes'); await stop();
  [token] = await start([hero('Pursuit tester', { x: golem.x + 5, z: golem.z })]); c = await connect(token);
  const golemEnemy = () => c.snapshot.enemies.find(e => e.id === golem.id);
  for (let i = 0; i < 100 && !golemEnemy().attack?.basic; i++) await advance(200);
  assert(golemEnemy().attack?.basic && Math.hypot(golemEnemy().x - c.player().x, golemEnemy().z - c.player().z) <= basicAttackRange('stone-golem'), 'physical monsters chase all the way into normal attack reach');
  await stop();

  const bossPair = [hero('Boss melee target', { x: WORLD_BOSS.x + 2, z: WORLD_BOSS.z }), hero('Boss bystander', { x: WORLD_BOSS.x - 2, z: WORLD_BOSS.z })];
  tokens = await start(bossPair); primary = await connect(tokens[0]); bystander = await connect(tokens[1]);
  attack = await until(() => primary.snapshot.enemies.find(e => e.id === WORLD_BOSS.id)?.attack, 'boss basic swipe'); assert.equal(attack.basic, true);
  await advance(BASIC_ATTACK.impactMs); assert(primary.player().hp < bossPair[0].hp); assert.equal(bystander.player().hp, bossPair[1].hp, 'boss basics do not hit nearby bystanders'); await stop();

  // Boss participation resets between encounters; an old contributor gets no free second-run loot.
  const far = { x: WORLD_BOSS.x + 45, z: WORLD_BOSS.z }, near = { x: WORLD_BOSS.x + 2, z: WORLD_BOSS.z };
  const bossHeroes = [hero('Boss observer', far, 500), hero('Boss partner', { x: WORLD_BOSS.x - 2, z: WORLD_BOSS.z }, 300), hero('Prior contributor', near, 100)];
  const bossTokens = await start(bossHeroes), a = await connect(bossTokens[0]), prior = await connect(bossTokens[2]);
  const boss = () => a.snapshot.enemies.find(e => e.id === WORLD_BOSS.id);
  assert.equal(boss().maxHp, 4000); assert.equal(boss().worldBoss, true); assert.equal(boss().level,30);
  await strike(prior, WORLD_BOSS.id); assert(boss().hp < 4000);
  prior.send({ type: 'leaveWorld' }); await advance(9000);
  assert.equal(boss().hp, 4000); assert.deepEqual([boss().x, boss().z, boss().attack], [WORLD_BOSS.x, WORLD_BOSS.z, null], 'abandoned encounter resets home and full health');
  await walk(a, near); const b = await connect(bossTokens[1]); await select(prior);
  let first = await until(() => boss().attack, 'boss engagement');
  if (first.basic) { await advance(MONSTERS[WORLD_BOSS.kind].cooldownMs * 3); first = await until(() => boss().attack && !boss().attack.basic && boss().attack, 'boss special swipe'); }
  assert.equal(first.style, 'swipe');
  await advance(MONSTERS[WORLD_BOSS.kind].cooldownMs * 3); let second = await until(() => boss().attack?.id !== first.id && boss().attack, 'boss special slam'); assert.equal(second.basic, false); assert.equal(second.style, 'slam'); assert.equal(second.radius, 7);
  await walk(a, { x: boss().x + 1.5, z: boss().z }); await walk(b, { x: boss().x - 1.5, z: boss().z });
  await strike(a, WORLD_BOSS.id); await strike(b, WORLD_BOSS.id); assert(boss().hp <= 2000 && boss().alive, 'combat reaches enrage');
  await advance(MONSTERS[WORLD_BOSS.kind].cooldownMs * 3); const rage = await until(() => boss().attack && !boss().attack.basic && boss().attack.startedAt > second.startedAt && boss().attack, 'enraged special');
  assert.equal(rage.style, 'pulse'); assert.equal(rage.name, 'Stormcall');
  assert.equal(rage.impactAt - rage.startedAt, Math.round(WORLD_BOSS.attacks[2].windupMs * .7));
  await strike(a, WORLD_BOSS.id); if (boss().alive) await strike(b, WORLD_BOSS.id);
  assert.equal(boss().alive, false); assert.equal(boss().attack, null);
  await until(() => b.snapshot.loot.some(drop => drop.enemyId === WORLD_BOSS.id), 'partner receives personal boss loot');
  const drops = [a, b].flatMap(c => c.snapshot.loot.filter(drop => drop.enemyId === WORLD_BOSS.id));
  assert.deepEqual(drops.map(drop => drop.ownerId).sort(), [a.welcome.id, b.welcome.id].sort());
  assert(drops.every(drop => drop.gold === 240 && drop.relic === 3)); assert.equal(prior.player().gold, 0);
  const drop = drops.find(drop => drop.ownerId === a.welcome.id), before = { gold: a.player().gold, relic: a.player().inventory.relic };
  assert.equal(before.gold, 0, 'boss gold still requires personal corpse looting');
  a.send({ type: 'loot', targetId: drop.id }); a.send({ type: 'loot', targetId: drop.id });
  await until(() => a.player().gold === 240, 'manual boss loot'); assert.equal(a.player().inventory.relic, before.relic + 3);
  await advance(WORLD_BOSS.respawnMs - 1500); assert.equal(boss().alive, false, 'world boss does not respawn early');
  await advance(2000); assert.equal(boss().alive, true); assert.equal(boss().hp, 4000); assert.equal(boss().attack, null); assert.equal(boss().level,30,'world boss respawns at its original level');
  console.log('PASS: 10 populated monster species; all six styles with repeating uncharged target-only basics, exact contact timing, range, physical pursuit, stun/death/session cancellation and opposing impact order; occasional charged specials; original camp kinds; world boss alternating/enraged attacks, reset, participants-only manual loot and five-minute respawn.');
} finally { await stop(); Date.now = realNow; rmSync(dir, { recursive: true, force: true }); }
