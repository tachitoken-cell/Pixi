import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { TALENTS, TALENT_VERSION, migrateTalents, starterGear, talentRank, branchTalentPoints, availableTalentPoints, canLearnTalent, talentsValid, combatStats } from '../src/progression.ts';
import { SPELLS, TALENT_EFFECT_IDS, abilityUnlocked } from '../src/spells.ts';

const classes = ['Ranger', 'Knight', 'Mage', 'Cleric'], all = Object.values(TALENTS);
assert.equal(all.length, 130);
for (const className of classes) {
  const nodes = all.filter(talent => talent.className === className), branches = [...new Set(nodes.map(talent => talent.branch))];
  assert.equal(nodes.length, className === 'Ranger' ? 31 : className === 'Knight' ? 33 : className === 'Cleric' ? 36 : 30); assert.equal(branches.length, 3);
  for (const branch of branches) {
    const tree = nodes.filter(talent => talent.branch === branch);
    assert.equal(tree.length, branch === 'Beastmaster' ? 11 : className === 'Knight' ? 11 : className === 'Cleric' ? 12 : 10); assert.deepEqual([...new Set(tree.map(talent => talent.row))].sort(), [0, 1, 2, 3, 4]);
    assert.equal(new Set(tree.map(talent => `${talent.row},${talent.column}`)).size, tree.length);
    for (const talent of tree) {
      assert([1, 2, 3].includes(talent.maxRank)); assert([0, 1, 2].includes(talent.column));
      assert((talent.ability || talent.rankDescriptions?.length || Object.values(TALENT_EFFECT_IDS).includes(talent.id) || Object.values({ ...talent.stats, ...talent.spellBonuses }).length) && Object.values({ ...talent.stats, ...talent.spellBonuses }).every(value => Number.isInteger(value) && value > 0));
      if (talent.prerequisite) {
        const prior = TALENTS[talent.prerequisite];
        assert.equal(prior.branch, branch); assert.equal(prior.className, className); assert(prior.row < talent.row || prior.row === talent.row && prior.column !== talent.column);
        assert(talent.prerequisiteRank >= 1 && talent.prerequisiteRank <= prior.maxRank);
      } else assert.equal(talent.prerequisiteRank, 0);
    }
    const build = { level: 100, talents: [], appearance: { className }, ...starterGear(className) };
    const priority = [...tree].sort((a, b) => a.requiredBranchPoints - b.requiredBranchPoints);
    while (true) { const next = tree.find(talent => talent.row === 4 && canLearnTalent(build, talent.id)) || priority.find(talent => canLearnTalent(build, talent.id)); if (!next) break; build.talents.push(next.id); }
    assert.equal(build.talents.length, Math.min(20, tree.reduce((sum, talent) => sum + talent.maxRank, 0)), `${className} ${branch} reaches its point budget`);
    assert(tree.some(talent => talent.row === 4 && build.talents.includes(talent.id)), `${className} ${branch} reaches a capstone`);
    for (const capstone of tree.filter(talent => talent.row === 4)) {
      const selected = { ...build, talents: [] };
      function buy(node, rank = node.maxRank) {
        if (node.prerequisite) buy(TALENTS[node.prerequisite], node.prerequisiteRank);
        while (talentRank(selected, node.id) < rank) {
          const next = canLearnTalent(selected, node.id) ? node : priority.find(t => canLearnTalent(selected, t.id));
          assert(next, `${capstone.label} remains reachable`); selected.talents.push(next.id);
        }
      }
      buy(capstone); assert(talentsValid(selected));
    }
    assert(talentsValid(build)); assert(talentsValid({ ...build, talents: [...build.talents].reverse() }), 'saved allocation is order-independent');
    assert.equal(branchTalentPoints(build, branch), build.talents.length);
    const base = combatStats({ ...build, talents: [] }), totals = { primaryDamage: 0, specialDamage: 0, defense: 0 };
    for (const id of build.talents) for (const stat of Object.keys(totals)) totals[stat] += TALENTS[id].stats[stat] || 0;
    for (const stat of Object.keys(totals)) assert.equal(combatStats(build)[stat], base[stat] + totals[stat], 'every purchased rank affects real combat stats');
    assert.equal(talentsValid({ ...build, talents: [...build.talents, tree[0].id] }), false, 'over-cap saves reject');
  }
  for (const branch of [0, 1]) {
    const ids = [1, 2, 3].map(index => `${className.toLowerCase()}-${branch * 3 + index}`);
    const old = { level: 7, talents: [], appearance: { className } };
    old.talents = ids;
    migrateTalents(old); assert.deepEqual(old.talents, [], 'valid previous allocations receive a free rebuild'); assert.equal(old.talentVersion, TALENT_VERSION);
  }
}
for (const [ability, signature, augment] of [
  ['powerful-throw', TALENT_EFFECT_IDS.wideSwing, TALENT_EFFECT_IDS.fineCuts],
  ['adamant-guardian', TALENT_EFFECT_IDS.guard, TALENT_EFFECT_IDS.holdTheLine],
  ['lord-of-battle', TALENT_EFFECT_IDS.courageousCall, TALENT_EFFECT_IDS.intoTheFray],
]) {
  const spell = SPELLS[ability], player = { level:37, appearance:{className:'Knight'}, talents:[] };
  while (!canLearnTalent(player, signature)) { const node = all.find(t => t.className === 'Knight' && t.branch === TALENTS[signature].branch && canLearnTalent(player, t.id)); assert(node); player.talents.push(node.id); }
  for (const id of [signature, augment, augment]) { assert(canLearnTalent(player,id)); player.talents.push(id); }
  const branch = all.filter(talent => talent.branch === TALENTS[signature].branch && talent.id !== spell.requiredTalent);
  while (player.talents.length < 12) { const node = branch.find(talent => canLearnTalent(player,talent.id)); assert(node); player.talents.push(node.id); }
  assert(!abilityUnlocked(ability,'Knight',37,[ability],player.talents),'trainer purchase cannot forge Knight capstones');
  assert(canLearnTalent(player,spell.requiredTalent)); player.talents.push(spell.requiredTalent);
  assert(abilityUnlocked(ability,'Knight',37,[],player.talents)); assert(talentsValid(player));
}
const retained = { level:60, appearance:{className:'Knight'}, talents:['knight-1','knight-2'], talentVersion:4 };
migrateTalents(retained); assert.deepEqual(retained.talents,['knight-1','knight-2']); assert.equal(retained.talentVersion,TALENT_VERSION);
const refund = { level:60, appearance:{className:'Knight'}, talentVersion:4, talents:['knight-1','knight-2','knight-3',...Array(3).fill('knight-vanguard-1'),...Array(3).fill('knight-vanguard-3'),...Array(2).fill('knight-vanguard-5'),'knight-vanguard-2','knight-vanguard-6'] };
assert(!talentsValid(refund)); migrateTalents(refund); assert.deepEqual(refund.talents,[]); assert.equal(refund.talentVersion,TALENT_VERSION);
for (const talents of [['knight-vanguard-6'],['mage-1'],['unknown'],null]) {
  const corrupt = {...retained,talentVersion:4,talents}, before = structuredClone(corrupt);
  migrateTalents(corrupt); assert.deepEqual(corrupt,before,'malformed version 4 builds are rejected, never silently refunded');
}
const foundation = { level: 40, appearance: { className: 'Ranger' }, talents: ['ranger-1', 'ranger-2', 'ranger-3', ...Array(3).fill('ranger-marksmanship-1'), 'ranger-marksmanship-2', ...Array(2).fill('ranger-marksmanship-3')] };
assert(talentsValid(foundation), 'nine reachable points satisfy the signature and its two-rank augment');
assert.equal(talentsValid({ ...foundation, talents: [...foundation.talents, 'ranger-marksmanship-6'] }), false,
  'a capstone cannot count itself toward its branch gate or bypass its prerequisite');

const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-talents-')), file = join(dataDir, 'players.json'), clients = [];
const tokens = classes.slice(0,3).map(() => randomBytes(32).toString('base64url')), hash = token => createHash('sha256').update(token).digest('hex');
// Legacy single-player records intentionally have no hotbar/gear/coordinate schema fields.
const records = Object.fromEntries(classes.slice(0,3).map((className, index) => {
  const level = index ? 20 : 6;
  return [hash(tokens[index]), { id: randomUUID(), name: `Legacy ${className}`, appearance: { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className },
    x: 0, z: 22, zone: 'greenwood', rotation: 0, hp: 100 + (level - 1) * 12, maxHp: 100 + (level - 1) * 12, level, xp: 7, gold: 17,
    talents: [3, 2, 1].map(rank => `${className.toLowerCase()}-${rank}`), inventory: { wood: 7, crystal: 3, herb: 2, potion: 3 },
    quest: { stage: 0, kills: 0, crystals: 0 } }];
}));
let game, port;
async function until(predicate, label) { const end = Date.now() + 5000; while (Date.now() < end) { const result = predicate(); if (result) return result; await delay(15); } throw Error(`Timed out: ${label}`); }
async function start() { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir, keycloak: null, databaseUrl: '' }); port = await game.start(); }
async function connect(token) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), client = { socket, messages: [] }; clients.push(client);
  client.send = message => socket.send(JSON.stringify(message)); client.player = () => client.snapshot?.players.find(p => p.id === client.welcome?.id);
  socket.on('message', raw => { const message = JSON.parse(raw); client.messages.push(message); if (['roster', 'snapshot', 'welcome'].includes(message.type)) client[message.type] = message; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  client.send({ type: 'join', token }); await until(() => client.roster, 'migrated roster');
  client.send({ type: 'selectCharacter', characterId: client.roster.characters[0].id }); await until(() => client.player(), 'world entry'); return client;
}
async function buy(client, id, rank) { client.send({ type: 'learnTalent', talentId: id }); await until(() => talentRank(client.player(), id) === rank, `${id} rank ${rank}`); }
try {
  writeFileSync(file, JSON.stringify(records)); await start();
  const [ranger, knight, mage] = await Promise.all(tokens.map(connect));
  for (const [index, client] of [ranger, knight, mage].entries()) {
    assert.deepEqual(client.player().talents, [], 'migration refunds every valid old talent allocation');
    assert.equal(client.player().gold, 17); assert.equal(client.player().xp, 7);
  }
  // Queued rank requests cannot spend more than the reduced earned budget.
  for (let i = 0; i < 8; i++) ranger.send({ type: 'learnTalent', talentId: 'ranger-marksmanship-1' });
  await until(() => ranger.player().talents.length === 2, 'rank purchases reach cap'); await delay(140);
  assert.equal(talentRank(ranger.player(), 'ranger-marksmanship-1'), 2); assert.equal(availableTalentPoints(ranger.player()), 0);
  ranger.send({ type: 'learnTalent', talentId: 'ranger-4' }); await delay(140); assert.equal(ranger.player().talents.length, 2);
  const knightBefore = [...knight.player().talents];
  for (const id of ['knight-sentinel-2', 'knight-vanguard-6', 'mage-4', '__proto__', {}, null]) knight.send({ type: 'learnTalent', talentId: id });
  await delay(140); assert.deepEqual(knight.player().talents, knightBefore, 'branch, prerequisite rank, class and malformed-ID rejection');
  await buy(knight, 'knight-sentinel-1', 1); await buy(knight, 'knight-sentinel-1', 2);
  knight.send({ type: 'learnTalent', talentId: 'knight-sentinel-2' }); await delay(140);
  assert.equal(talentRank(knight.player(), 'knight-sentinel-2'), 0, 'two prerequisite ranks still require three branch points');
  await buy(knight, 'knight-sentinel-1', 3); await buy(knight, 'knight-sentinel-2', 1);
  knight.send({ type: 'learnTalent', talentId: 'knight-sentinel-1' }); await delay(140);
  assert.equal(talentRank(knight.player(), 'knight-sentinel-1'), 3, 'rank cap holds with unspent points remaining');
  for (let rank = 1; rank <= 2; rank++) await buy(mage, 'mage-frostweaving-1', rank);
  mage.send({ type: 'learnTalent', talentId: 'mage-frostweaving-2' }); await delay(140);
  assert.equal(talentRank(mage.player(), 'mage-frostweaving-2'), 0, 'deepening a path requires the exact prior rank');
  await buy(mage, 'mage-frostweaving-1', 3); await buy(mage, 'mage-frostweaving-2', 1);
  const allocation = [ranger, knight, mage].map(client => structuredClone(client.player().talents));
  const reconnected = await connect(tokens[0]); assert.deepEqual(reconnected.player().talents, allocation[0], 'account reconnect keeps all ranks');
  await game.stop(); game = null;
  const saved = readFileSync(file, 'utf8');
  for (const [index, token] of tokens.entries()) assert.deepEqual(JSON.parse(saved)[hash(token)].characters[0].talents, allocation[index]);
  await start();
  for (const [index, token] of tokens.entries()) assert.deepEqual((await connect(token)).player().talents, allocation[index], 'restart keeps migrated choices and added ranks');
  const invalidDir = join(dataDir, 'invalid'); mkdirSync(invalidDir);
  const corruptions = [p => p.talents.push('ranger-marksmanship-1'), p => p.talents = ['ranger-2'], p => p.talents = ['mage-1'], p => p.talents = ['ranger-1', 'ranger-1'], p => p.talents = ['ranger-marksmanship-2'], p => p.talents = ['ranger-marksmanship-6'], p => p.talents = ['unknown'], p => p.talents = null];
  for (const corrupt of corruptions) {
    const record = JSON.parse(saved); corrupt(record[hash(tokens[0])].characters[0]);
    const text = JSON.stringify(record), path = join(invalidDir, 'players.json'); writeFileSync(path, text);
    assert.throws(() => createGameServer({ port: 0, dataDir: invalidDir, keycloak: null, databaseUrl: '' }), /Invalid player save/);
    assert.equal(readFileSync(path, 'utf8'), text, 'invalid ranks never cause saved progress to reset');
  }
  console.log('PASS: 130 talents across four classes; reachable Knight specializations/capstones; valid current builds retained and invalidated old builds refunded; authoritative point/rank/prerequisite/branch caps; real WebSocket requests, reconnect/restart and corrupt-save rejection.');
} finally {
  for (const client of clients) client.socket.terminate();
  await game?.stop(); rmSync(dataDir, { recursive: true, force: true });
}
