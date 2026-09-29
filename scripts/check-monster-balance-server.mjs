import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { BASIC_ATTACK, MONSTERS, monsterSpawnLevel, monsterStatsAtLevel } from '../src/bestiary.ts';
import { DUNGEONS, dungeonStages, getDungeon } from '../src/dungeon.ts';
import { dungeonBossVisual } from '../src/dungeon-boss-models.ts';
import { surfaceAt } from '../src/landscape.ts';
import { combatStats, maxHealth, starterGear } from '../src/progression.ts';
import { canTraverse, createOverworldSpawns } from '../src/realm.ts';

const spawns = createOverworldSpawns();
const targets = [8, 20, 30, 60].map(level => {
  const spawn = spawns.find(spawn => !spawn.worldBoss && !['training-dummy', 'treasure-goblin'].includes(spawn.kind)
    && monsterSpawnLevel(spawn, surfaceAt(spawn.x, spawn.z).regionId) === level
    && canTraverse(spawn, { x: spawn.x + 1, z: spawn.z })
    && !spawns.some(other => other !== spawn && Math.hypot(other.x - spawn.x, other.z - spawn.z) < 18));
  assert(spawn, `isolated real level ${level} spawn`);
  return { ...spawn, level };
});
const realNow = Date.now, dir = mkdtempSync(join(tmpdir(), 'mossvale-monster-balance-')), clients = [];
let clock = realNow(), game;
Date.now = () => clock;
async function until(fn, label) {
  const end = realNow() + 6000;
  while (realNow() < end) { const value = fn(); if (value) return value; await delay(10); }
  throw Error(`Timed out: ${label}`);
}
try {
  const tokens = targets.map(() => randomBytes(32).toString('base64url'));
  const players = targets.map((target, index) => {
    const player = { id: randomUUID(), name: `Balance tester ${index}`, coordinateVersion: 2, characterCreated: true,
      x: target.x + 1, z: target.z, zone: surfaceAt(target.x + 1, target.z).zone, rotation: 0,
      appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' },
      ...starterGear('Ranger'), level: target.level, talents: [], xp: 0, gold: 0,
      inventory: { wood: 0, crystal: 0, herb: 0, potion: 0, relic: 0 }, quest: { stage: 0, kills: 0, crystals: 0 } };
    return { ...player, hp: maxHealth(player), maxHp: maxHealth(player) };
  });
  writeFileSync(join(dir, 'players.json'), JSON.stringify(Object.fromEntries(players.map((player, index) =>
    [createHash('sha256').update(tokens[index]).digest('hex'), { characters: [player] }]))));
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir, keycloak: null, databaseUrl: '' });
  const port = await game.start();
  for (const [index, target] of targets.entries()) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), client = { socket }; clients.push(client);
    socket.on('message', raw => { const message = JSON.parse(raw); if (message.type === 'snapshot') client.snapshot = message; });
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    socket.send(JSON.stringify({ type: 'join', token: tokens[index], characterId: players[index].id }));
    const player = () => client.snapshot?.players.find(player => player.id === players[index].id);
    const enemy = () => client.snapshot?.enemies.find(enemy => enemy.id === target.id);
    await until(() => player() && enemy()?.attack?.basic, `level ${target.level} basic warning`);
    assert.equal(enemy().level, target.level);
    assert.equal(enemy().maxHp, monsterStatsAtLevel(target.kind, target.level).hp, 'real spawns use shared level-scaled health');
    const attack = enemy().attack, hp = player().hp;
    const expected = Math.max(1, Math.round(monsterStatsAtLevel(target.kind, target.level).damage * BASIC_ATTACK.damageScale) - combatStats(player()).defense);
    clock = attack.impactAt;
    await until(() => player().hp < hp, 'basic hit');
    assert.equal(player().hp, hp - expected, 'real basic hits use shared scaled damage');
    console.log(`PASS level ${target.level} ${target.kind}: ${enemy().maxHp} HP, ${expected} basic damage`);
    socket.close(); await until(() => socket.readyState === WebSocket.CLOSED, 'disconnect');
  }
  const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  const constructor = source.slice(source.indexOf('  function spawnDungeonEnemy('), source.indexOf('  function advanceStoryChamber('));
  for (const dungeon of DUNGEONS) for (const stage of dungeonStages(dungeon.id)) for (const partySize of [1, 4]) {
    const enemies = [], spawn = runInNewContext(`${constructor}\nspawnDungeonStages`, { dungeonStages, dungeonBossVisual, getDungeon, monsterStatsAtLevel, enemyStats: MONSTERS, enemies });
    spawn({ id: 'balance', kind: dungeon.id, partySize, wipes: 0, spawned: new Set(), cleared: new Set(dungeonStages(dungeon.id).map(room => room.id).filter(id => id !== stage.id)), activated: new Set(['verdant-seal', 'glacial-seal']) });
    assert.equal(enemies.length, stage.enemies.length, 'every unlocked room spawns');
    for (const enemy of enemies) assert.equal(enemy.maxHp, Math.round(monsterStatsAtLevel(enemy.kind, enemy.level).hp * (1 + (partySize - 1) * .6) * (enemy.dungeonBoss ? 1.8 : 1)), 'dungeon health uses the same level curve once, plus party and boss multipliers');
  }
  console.log('PASS server monster scaling: actual overworld snapshots and hits at levels 8/20/30/60, plus all dungeon rooms in solo and four-player parties.');
} finally {
  for (const client of clients) client.socket.terminate();
  await game?.stop(); Date.now = realNow; rmSync(dir, { recursive: true, force: true });
}
