import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { RACES, GENDERS, FACES, HAIRSTYLES, DEFAULT_APPEARANCE, appearanceValid, normalizeAppearance, copyAppearance, migrateLegacyAppearance } from '../src/appearance.ts';
import { COMMUNITY_VERSION } from '../src/community.ts';
import { starterGear } from '../src/progression.ts';

assert.deepEqual([RACES.length, GENDERS.length, FACES.length, HAIRSTYLES.length], [9, 2, 8, 16]);
assert.deepEqual(GENDERS.map(option => option.id), ['male', 'female']);
for (const catalog of [RACES, GENDERS, FACES, HAIRSTYLES]) {
  assert.equal(new Set(catalog.map(option => option.id)).size, catalog.length);
  assert(catalog.every(option => option.label && option.description));
}
const { race: _race, gender: _gender, face: _face, hairHighlight: _highlight, armorColors: _dyes, ...legacyAppearance } = DEFAULT_APPEARANCE;
assert(appearanceValid(legacyAppearance)); assert.deepEqual(normalizeAppearance(legacyAppearance), DEFAULT_APPEARANCE);
assert.deepEqual(legacyAppearance, { skin: '#dca67f', hair: '#49362b', hairStyle: 'swept', outfit: '#577956', accent: '#d8b36a', className: 'Ranger' });
for (const race of RACES) for (const gender of GENDERS) for (const face of FACES) for (const hairStyle of HAIRSTYLES) {
  const look = { ...legacyAppearance, race: race.id, gender: gender.id, face: face.id, hairStyle: hairStyle.id };
  assert(appearanceValid(look)); assert.deepEqual(copyAppearance(look), { ...look, hairHighlight: look.hair, armorColors: {} });
}
for (const field of ['race', 'gender', 'face', 'hairStyle', 'className']) for (const value of [undefined, null, '', '__proto__', 1, [], {}]) {
  const invalid = { ...DEFAULT_APPEARANCE, [field]: value };
  assert.equal(appearanceValid(invalid), false, `${field} rejects supplied invalid values`);
  assert.throws(() => normalizeAppearance(invalid), /Invalid/);
}
for (const color of ['red', '#abc', '#11223344', '<script>', null]) assert.equal(appearanceValid({ ...DEFAULT_APPEARANCE, skin: color }), false);
for (const invalid of [null, [], Object.assign([], DEFAULT_APPEARANCE), Object.create(DEFAULT_APPEARANCE)]) assert.equal(appearanceValid(invalid), false);
const extra = { ...DEFAULT_APPEARANCE, gold: 999, damage: 999, unexpected: { nested: true } };
assert.deepEqual(copyAppearance(extra), DEFAULT_APPEARANCE, 'only appearance fields are copied'); assert.equal(extra.gold, 999);
const cloned=copyAppearance({...DEFAULT_APPEARANCE,armorColors:{armor:'#123456'}});cloned.armorColors.armor='#abcdef';assert.deepEqual(DEFAULT_APPEARANCE.armorColors,{});
assert.equal(copyAppearance(Object.assign(Object.create({ race: 'forged' }), legacyAppearance)).race, 'human', 'inherited values cannot bypass validation');
const retiredAppearance = { ...legacyAppearance, gender: 'nonbinary' };
assert.equal(appearanceValid(retiredAppearance), false, 'the retired choice is not valid for new creation');
assert.throws(() => copyAppearance(retiredAppearance), /Invalid/);
assert.deepEqual(migrateLegacyAppearance(retiredAppearance), { ...legacyAppearance, gender: 'male' });
assert.equal(retiredAppearance.gender, 'nonbinary', 'load migration never mutates the source object');
assert.equal(migrateLegacyAppearance(legacyAppearance), legacyAppearance, 'missing optional fields remain absent');
for (const invalid of [null, [], { ...retiredAppearance, skin: '#bad' }, { ...retiredAppearance, face: 'unknown' }, { ...retiredAppearance, gender: null }, { ...retiredAppearance, gender: 'unknown' }]) {
  assert.equal(migrateLegacyAppearance(invalid), invalid, 'legacy conversion cannot hide malformed appearance data');
  assert.equal(appearanceValid(invalid), false);
}

const retiredSerpent = { ...DEFAULT_APPEARANCE, race: 'serpent', gender: 'female', hairStyle: 'fishtail', hairHighlight: '#19e5ac', armorColors: { head: '#1a2543', armor: '#e8c125' } };
assert.equal(appearanceValid(retiredSerpent), false, 'Serpent cannot be selected for a new character');
assert.throws(() => copyAppearance(retiredSerpent), /Invalid/);
assert.deepEqual(migrateLegacyAppearance(retiredSerpent), { ...retiredSerpent, race: 'lizardfolk' }, 'retired race preserves all other options');
assert.equal(retiredSerpent.race, 'serpent', 'migration never mutates its source');
assert.deepEqual(migrateLegacyAppearance({ ...retiredSerpent, gender: 'nonbinary' }), { ...retiredSerpent, race: 'lizardfolk', gender: 'male' }, 'both supported retirements can migrate together');
const sparseSerpent = { ...legacyAppearance, race: 'serpent' };
assert.deepEqual(migrateLegacyAppearance(sparseSerpent), { ...legacyAppearance, race: 'lizardfolk' }, 'migration preserves absent optional fields');
for (const invalid of [{ ...retiredSerpent, skin: '#bad' }, { ...retiredSerpent, face: 'unknown' }, { ...retiredSerpent, armorColors: { weapon: '#ffffff' } }, { ...retiredSerpent, gender: null }]) {
  assert.equal(migrateLegacyAppearance(invalid), invalid, 'race migration cannot hide malformed appearances');
  assert.equal(appearanceValid(invalid), false);
}

const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-appearance-')), file = join(dataDir, 'players.json'), clients = [];
const legacyToken = randomBytes(32).toString('base64url'), key = token => createHash('sha256').update(token).digest('hex');
const legacyGear = starterGear('Ranger'); legacyGear.ownedGear.push('lantern-charm', 'copper-ring'); legacyGear.equipment.charm = 'lantern-charm'; legacyGear.equipment.ring1 = 'copper-ring';
const legacy = { id: randomUUID(), name: 'Legacy Keeper', appearance: legacyAppearance, coordinateVersion: 2, zone: 'greenwood', x: 0, z: 8, rotation: 0,
  characterCreated: true, talents: [], talentVersion: 2, ...legacyGear, level: 3, xp: 33, hp: 114, maxHp: 134, gold: 177,
  inventory: { wood: 18, crystal: 9, potion: 3, herb: 8, relic: 2 }, skills: { mining: 80, woodcutting: 35, herbalism: 12, fishing: 0 },
  quest: { chapter: 0, stage: 1, kills: 1, crystals: 0, progress: { 'grove-slimes': 1, 'grove-crystals': 0 }, completed: false, ending: null } };
const retiredCharacters = [
  { ...structuredClone(legacy), id: randomUUID(), name: 'Retired baseline', appearance: retiredAppearance, gold: 281, craftingXp: 64, contracts: { active: { 'greenwood-herbs': 1 }, completed: {} } },
  { ...structuredClone(legacy), id: randomUUID(), name: 'Retired custom look', appearance: { ...retiredAppearance, race: 'goblin', hairStyle: 'pixie', face: 'painted', hair: '#91ab43' }, gold: 315 },
  { ...structuredClone(legacy), id: randomUUID(), name: 'Retired Serpent', appearance: retiredSerpent, gold: 429 },
  { ...structuredClone(legacy), id: randomUUID(), name: 'Retired both', appearance: { ...retiredSerpent, gender: 'nonbinary' }, gold: 517 },
];
const migratedAppearance = p => ({ ...p.appearance, ...(p.appearance.gender === 'nonbinary' ? { gender: 'male' } : {}), ...(p.appearance.race === 'serpent' ? { race: 'lizardfolk' } : {}) });
writeFileSync(file, JSON.stringify({ [key(legacyToken)]: { characters: [legacy, ...retiredCharacters] } }));
let game, port;
async function until(fn, label) { const end = Date.now() + 4500; while (Date.now() < end) { const result = fn(); if (result) return result; await delay(15); } throw Error(`Timed out: ${label}`); }
async function start() { game = createGameServer({ port: 0, host: '127.0.0.1', dataDir, keycloak: null, databaseUrl: '' }); port = await game.start(); }
async function connect(token, characterId) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), c = { socket, messages: [] }; clients.push(c);
  socket.on('message', raw => { const m = JSON.parse(raw); c.messages.push(m); if (['roster', 'welcome', 'snapshot'].includes(m.type)) c[m.type] = m; });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  c.send = message => socket.send(JSON.stringify(message)); c.player = () => c.snapshot?.players.find(p => p.id === c.welcome?.id);
  c.send({ type: 'join', token, characterId }); await until(() => c.roster || c.player(), 'account connected'); c.send({type:'acceptCommunityRules',version:COMMUNITY_VERSION}); await until(()=>c.messages.some(message=>message.type==='community'&&message.accepted),'community accepted'); return c;
}
async function create(c, name, appearance) {
  const count = c.roster.characters.length; c.send({ type: 'createCharacter', name, appearance });
  await until(() => c.roster.characters.length === count + 1, `created appearance ${name}`).catch(error=>{throw new Error(error.message+' '+JSON.stringify(c.messages.filter(message=>message.type==='error'||message.type==='event').slice(-3)));}); return c.roster.characters.at(-1);
}
const progress = p => ({ id: p.id, name: p.name, x: p.x, z: p.z, zone: p.zone, gold: p.gold, xp: p.xp, hp: p.hp, maxHp: p.maxHp, level: p.level,
  inventory: p.inventory, skills: p.skills, quest: p.quest, equipment: p.equipment, ownedGear: p.ownedGear, talents: p.talents,
  craftingXp: p.craftingXp ?? 0, contracts: p.contracts ?? { active: {}, completed: {} } });
try {
  await start();
  const old = await connect(legacyToken);
  assert.deepEqual(old.roster.characters[0].appearance, legacyAppearance, 'legacy fields remain absent and retain their original visual defaults');
  assert.deepEqual(progress(old.roster.characters[0]), progress(legacy));
  for (const original of retiredCharacters) {
    const migrated = old.roster.characters.find(p => p.id === original.id);
    assert.deepEqual(migrated.appearance, migratedAppearance(original), 'retired gender changes only to the male baseline');
    assert.deepEqual(progress(migrated), progress(original), 'migration preserves the entire character and its progress');
  }
  const sparse = old.roster.characters.find(p => p.id === retiredCharacters[0].id);
  assert(!Object.hasOwn(sparse.appearance, 'race') && !Object.hasOwn(sparse.appearance, 'face'), 'migration preserves optional-field absences');
  old.send({ type: 'selectCharacter', characterId: sparse.id }); await until(() => old.player(), 'migrated character enters the world');
  assert.deepEqual(old.player().appearance, migratedAppearance(retiredCharacters[0]));
  const resumedLegacy = await connect(legacyToken, sparse.id);
  assert.deepEqual(progress(resumedLegacy.player()), progress(retiredCharacters[0]), 'migrated characters reconnect with their progress');
  const serpentCharacter = retiredCharacters[2], resumedSerpent = await connect(legacyToken, serpentCharacter.id);
  assert.deepEqual(resumedSerpent.player().appearance, migratedAppearance(serpentCharacter), 'migrated Serpent enters with its Lizardfolk appearance');
  assert.deepEqual(progress(resumedSerpent.player()), progress(serpentCharacter), 'race migration preserves all saved progress');
  const accounts = await Promise.all(Array.from({length:Math.ceil(HAIRSTYLES.length/6)},()=>connect())), creations = [];
  const badClient = accounts[0];
  for (const [field, value] of [['race', 'serpent'], ['race', 'dragon'], ['race', null], ['gender', 'nonbinary'], ['gender', 'unknown'], ['gender', {}], ['face', 'unknown'], ['face', []], ['hairStyle', 'unknown'], ['skin', '#bad'], ['hairHighlight', '#bad'], ['armorColors', {weapon:'#ffffff'}], ['armorColors', {armor:'red'}], ['armorColors', null]]) {
    const count = badClient.messages.length;
    badClient.send({ type: 'createCharacter', name: 'Rejected look', appearance: { ...DEFAULT_APPEARANCE, [field]: value } });
    badClient.send({ type: 'leaveWorld' });
    await until(() => badClient.messages.slice(count).some(m => m.type === 'roster'), 'private roster after rejected appearance');
    assert.equal(badClient.roster.characters.length, 0);
  }
  for (let i = 0; i < HAIRSTYLES.length; i++) {
    const c = accounts[Math.floor(i / 6)], look = { ...DEFAULT_APPEARANCE, race: RACES[i % RACES.length].id, gender: GENDERS[i % GENDERS.length].id,
      face: FACES[i % 8].id, hairStyle: HAIRSTYLES[i].id, hairHighlight:'#9c42d1', armorColors:{head:'#87c421',armor:'#1982f3',legs:'#7341a9',shoes:'#b2c8d0',back:'#8d91a3'}, className: ['Ranger', 'Knight', 'Mage'][i % 3] };
    const p = await create(c, `New Keeper ${i}`, { ...look, gold: 999, nested: { skill: 'forged' } });
    assert.deepEqual(p.appearance, look); assert.deepEqual(p.equipment, starterGear(look.className).equipment);
    assert.equal(p.gold, 0); assert.equal(c.welcome, undefined, 'creation stays in the private roster');
    creations.push({ token: c.roster.token, id: p.id, look });
  }
  const defaults = await connect(), defaultCharacter = await create(defaults, 'Legacy request', legacyAppearance);
  assert.deepEqual(defaultCharacter.appearance, DEFAULT_APPEARANCE, 'legacy creation requests receive explicit defaults');
  const c = accounts[0], chosen = creations[5];
  c.send({ type: 'selectCharacter', characterId: chosen.id }); await until(() => c.player(), 'character selected');
  c.send({ type: 'appearance', name: 'Renamed', appearance: DEFAULT_APPEARANCE });
  c.send({ type: 'createCharacter', name: 'Replacement', appearance: DEFAULT_APPEARANCE });
  await delay(150);
  assert.deepEqual(c.player().appearance, chosen.look); assert.equal(c.player().name, 'New Keeper 5', 'identity remains locked');
  const reconnected = await connect(chosen.token, chosen.id); assert.deepEqual(reconnected.player().appearance, chosen.look, 'network reconnect retains all selections');
  await game.stop(); game = null;
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual(saved[key(legacyToken)].characters[0].appearance, legacyAppearance);
  assert.deepEqual(progress(saved[key(legacyToken)].characters[0]), progress(legacy));
  for (const original of retiredCharacters) {
    const persisted = saved[key(legacyToken)].characters.find(p => p.id === original.id);
    assert.deepEqual(persisted.appearance, migratedAppearance(original)); assert.deepEqual(progress(persisted), progress(original));
  }
  await start();
  for (const account of accounts) {
    const restored = await connect(account.roster.token);
    for (const p of restored.roster.characters) assert.deepEqual(p.appearance, creations.find(created => created.id === p.id).look, 'every saved selection survives restart');
  }
  const restartedLegacy = await connect(legacyToken);
  assert.deepEqual(restartedLegacy.roster.characters[0].appearance, legacyAppearance);
  for (const original of retiredCharacters) {
    const restored = restartedLegacy.roster.characters.find(p => p.id === original.id);
    assert.deepEqual(restored.appearance, migratedAppearance(original)); assert.deepEqual(progress(restored), progress(original), 'a second load never resets migrated progress');
  }
  await game.stop(); game = null;
  const invalidDir = join(dataDir, 'invalid'); mkdirSync(invalidDir); const invalidFile = join(invalidDir, 'players.json');
  for (const [field, value] of [['race', null], ['race', 'dragon'], ['gender', []], ['gender', null], ['gender', 'unknown'], ['face', 'unknown'], ['hairStyle', 'unknown'], ['skin', '#bad'], ['hairHighlight', '#bad'], ['armorColors', {weapon:'#ffffff'}], ['armorColors', {armor:'red'}], ['armorColors', null]]) {
    const corrupt = structuredClone(saved); corrupt[key(legacyToken)].characters[1].appearance.gender = 'nonbinary'; corrupt[key(legacyToken)].characters[1].appearance.race = 'serpent'; corrupt[key(legacyToken)].characters[1].appearance[field] = value;
    const bytes = JSON.stringify(corrupt); writeFileSync(invalidFile, bytes);
    assert.throws(() => createGameServer({ port: 0, dataDir: invalidDir, keycloak: null, databaseUrl: '' }), /Invalid player save/);
    assert.equal(readFileSync(invalidFile, 'utf8'), bytes, 'invalid supplied appearance data is rejected without overwriting progress');
  }
  console.log('PASS: nine races, two genders, eight faces, sixteen hairstyles, highlights and independently saved armor dyes; strict new-creation rejection of retired options; safe load-only migration preserving optional absences, custom looks and all progress; real WS immutable identity, reconnect/restart, safe copying and corrupt-save preservation.');
} finally { for (const c of clients) c.socket.terminate(); await game?.stop(); rmSync(dataDir, { recursive: true, force: true }); }
