import assert from 'node:assert/strict';
import { MONSTERS, WORLD_BOSSES, THEMED_DUNGEON_ROSTERS } from '../src/bestiary.ts';
import { DUNGEONS, dungeonStages } from '../src/dungeon.ts';
import { combatCompanionStats, tameableKind, tameableCreature, tamedCompanionValid } from '../src/combat-companions.ts';

const creature = (kind = 'bramble-wolf', overrides = {}) => ({ kind, level:10, hp:100, alive:true, ...overrides });
const bossKinds = new Set([...WORLD_BOSSES.map(boss => boss.kind), ...Object.values(THEMED_DUNGEON_ROSTERS).flatMap(roster => roster.slice(-2))]);
for (const kind of Object.keys(MONSTERS)) assert.equal(tameableKind(kind), kind !== 'training-dummy' && !bossKinds.has(kind), `${kind}: eligible appearance`);
for (const kind of [null, undefined, '', '__proto__', 'constructor', 'toString', {}, [], 1]) assert.equal(tameableKind(kind), false);
assert(tameableKind('root-warden'), 'ordinary root wardens remain tameable; encounter boss flags reject the boss');
for (const roster of Object.values(THEMED_DUNGEON_ROSTERS)) {
  for (const kind of roster.slice(0,-2)) assert(tameableCreature(creature(kind),10), `${kind}: ordinary themed creature is eligible`);
  for (const kind of roster.slice(-2)) assert(!tameableCreature(creature(kind),60), `${kind}: themed boss is never eligible`);
}
for (const boss of WORLD_BOSSES) assert(!tameableCreature(creature(boss.kind,{worldBoss:true,level:boss.level}),60), `${boss.kind}: world boss cannot be tamed`);
let dungeonBosses = 0;
for (const dungeon of DUNGEONS) for (const stage of dungeonStages(dungeon.id)) for (const [index, enemy] of stage.enemies.entries()) {
  if (enemy.boss || stage.id === 'throne' && index === 0) {
    dungeonBosses++;
    assert(!tameableCreature(creature(enemy.kind,{level:stage.level,dungeonBoss:true}),60), `${dungeon.id}/${stage.id}/${enemy.kind}: seeded boss is ineligible`);
  }
}
assert(dungeonBosses >= DUNGEONS.length, 'every dungeon final boss was checked');
for (const flags of [{worldBoss:true},{dungeonBoss:true},{alive:false},{hp:0},{hp:-1}]) assert(!tameableCreature(creature('bramble-wolf',flags),60));
assert(tameableCreature(creature('bramble-wolf'),10)); assert(tameableCreature(creature('bramble-wolf'),11));
assert(!tameableCreature(creature('bramble-wolf'),9));
for (const level of [0,-1,1.5,NaN,Infinity,'10']) assert(!tameableCreature(creature('bramble-wolf',{level}),60));
for (const level of [1,10,30,60]) {
  const stats = combatCompanionStats(level), pet = {kind:'bramble-wolf',level,hp:stats.maxHp};
  assert(Object.values(stats).every(value=>Number.isSafeInteger(value) && value >= 0));
  assert.equal(stats.maxHp,100+(level-1)*12); assert.equal(stats.damage,Math.round((6+level*1.8)*.5));
  assert.equal(stats.range,2); assert.equal(stats.cooldownMs,2000);
  for (const state of [pet,{...pet,hp:0},{...pet,dismissed:true},{...pet,dismissed:false}]) assert(tamedCompanionValid(state));
  assert(!tamedCompanionValid({...pet,hp:stats.maxHp+1}), 'elite health cannot enter companion saves');
}
assert(tamedCompanionValid(null));
const pet = Object.freeze({kind:'root-warden',level:10,hp:100}); assert(tamedCompanionValid(pet));
for (const bad of [undefined,[],{},true,'pet', {...pet,kind:'training-dummy'}, ...[...bossKinds].map(kind=>({...pet,kind})),
  ...[0,61,-1,1.5,Infinity,NaN,'10'].map(level=>({...pet,level})),
  ...[-1,1.5,Infinity,NaN,'10'].map(hp=>({...pet,hp})),
  ...[null,'false',0,1].map(dismissed=>({...pet,dismissed})),
  {...pet,maxHp:999999},{...pet,damage:999999},{...pet,targetId:'player'},{...pet,worldBoss:true}]) assert.equal(tamedCompanionValid(bad),false);
assert.deepEqual(pet,{kind:'root-warden',level:10,hp:100},'validation does not mutate saved data');
console.log(`PASS: companion stats and save validation, all ${Object.keys(MONSTERS).length} creature kinds, ${WORLD_BOSSES.length} world bosses and ${dungeonBosses} seeded dungeon bosses, level/alive gates and ordinary root wardens.`);
