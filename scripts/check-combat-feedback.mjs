import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { TALENTS, TALENT_VERSION, earnedTalentPoints, availableTalentPoints, canLearnTalent, talentsValid, migrateTalents, starterGear, combatStats, gearSetBonuses } from '../src/progression.ts';
import { SPELLS, spellDamage, spellPeriodicDamage, spellTargetMultiplier, spellsForClass } from '../src/spells.ts';
import { ZONES } from '../src/content.ts';
import { MONSTERS } from '../src/bestiary.ts';
import { relocateOverworldSpawn, canTraverse } from '../src/realm.ts';
import { combatTiming } from '../src/combat-timing.ts';

const build = (className, branch) => {
  const player = { level: 60, talents: [], appearance: { className }, ...starterGear(className), talentVersion: TALENT_VERSION };
  const tree = Object.values(TALENTS).filter(talent => talent.className === className && (!branch || talent.branch === branch));
  const priority = [...tree].sort((a, b) => a.requiredBranchPoints - b.requiredBranchPoints);
  for (;;) { const next = tree.find(talent => talent.row === 4 && canLearnTalent(player, talent.id)) || priority.find(talent => canLearnTalent(player, talent.id)); if (!next) break; player.talents.push(next.id); }
  return player;
};
assert.equal(earnedTalentPoints(1), 1); assert.equal(earnedTalentPoints(3), 1); assert.equal(earnedTalentPoints(4), 2); assert.equal(earnedTalentPoints(60), 20); assert.equal(earnedTalentPoints(999), 20);
for (const className of ['Mage','Ranger','Knight','Cleric']) {
  const nodes = Object.values(TALENTS).filter(talent => talent.className === className);
  assert.equal(nodes.length, { Mage:30, Ranger:31, Knight:33, Cleric:36 }[className]);
  assert(nodes.reduce((sum, talent) => sum + talent.maxRank, 0) > 40, 'twenty points cannot fill all trees');
  for (const branch of new Set(nodes.map(talent => talent.branch))) {
    const player = build(className, branch);
    assert(talentsValid(player)); assert(talentsValid({ ...player, talents: [...player.talents].reverse() }));
    assert(player.talents.some(id => TALENTS[id].row === 4), `${className} ${branch} capstone remains reachable`);
  }
  const player = build(className);
  assert.equal(player.talents.length, 20); assert.equal(availableTalentPoints(player), 0);
  assert(!talentsValid({ ...player, talents: [...player.talents, nodes.at(-1).id] }));
}
const base = combatStats({ ...build('Mage'), talents: [] });
const fire = combatStats(build('Mage','Fire')), frost = combatStats(build('Mage','Frost')), arcane = combatStats(build('Mage','Arcane'));
assert(spellDamage(SPELLS.fireball, fire) > spellDamage(SPELLS.fireball, base));
assert.equal(spellDamage(SPELLS.frostbolt, fire), spellDamage(SPELLS.frostbolt, base), 'fire talents cannot silently buff every school');
assert(spellDamage(SPELLS.frostbolt, frost) > spellDamage(SPELLS.frostbolt, base));
assert(spellDamage(SPELLS['arcane-beam'], arcane) > spellDamage(SPELLS['arcane-beam'], base));
const venom = combatStats(build('Ranger','Venom')), marks = combatStats(build('Ranger','Marksmanship'));
assert(spellPeriodicDamage(SPELLS['poison-shot'],venom) > spellPeriodicDamage(SPELLS['poison-shot'],marks));
assert(spellDamage(SPELLS['power-shot'],marks) > spellDamage(SPELLS['power-shot'],venom));
assert.equal(spellTargetMultiplier(SPELLS['ice-lance'],base,true,1),3);
assert.equal(spellTargetMultiplier(SPELLS['ice-lance'],base,false,1),1);
assert.equal(spellTargetMultiplier(SPELLS['arcane-missile'],base,false,.2),2);
for (const id of ['fireball','frostbolt','cinderbolt','smite','power-shot']) assert.equal(SPELLS[id].cooldownMs,0,`${id} has no unnecessary post-cast lockout`);
for (const id of ['arcane-missile','ice-lance','arcane-burst','nova','flamewave']) {
  const spell = SPELLS[id];
  assert(spellDamage(SPELLS.fireball,base)/2 > spellDamage(spell,base)/1.5, `${id} utility costs sustained single-target damage`);
}
const setPlayer = { ...build('Ranger'), talents: [] };
setPlayer.equipment.head = 'briarwatch-head';
assert.equal(combatStats(setPlayer).spellBonuses.poison,undefined);
setPlayer.equipment.armor = 'briarwatch-armor';
assert.equal(combatStats(setPlayer).spellBonuses.poison,8);
setPlayer.equipment.legs = 'briarwatch-legs'; setPlayer.equipment.shoes = 'briarwatch-shoes';
assert.equal(combatStats(setPlayer).spellBonuses.periodic,12);
assert.equal(gearSetBonuses('missing').length,0);

const legacyTalents = Object.values(TALENTS).filter(t => t.className === 'Mage' && t.id.startsWith('mage-')).flatMap(t => Array(t.id==='mage-frostweaving-3'?2:['mage-spellfire-3','mage-warding-3','mage-frostweaving-6'].includes(t.id)?3:t.maxRank).fill(t.id)).reverse();
const migrated = { ...build('Mage'), talentVersion: undefined, talents: legacyTalents };
assert(!talentsValid(migrated,true),'old maximum ranks differ from the current layout'); migrateTalents(migrated);
assert.deepEqual(migrated.talents,[]); assert.equal(migrated.talentVersion,TALENT_VERSION);
migrated.talents.push('mage-1'); migrateTalents(migrated); assert.deepEqual(migrated.talents,['mage-1'],'refund runs once');
const corrupt = { ...migrated, talentVersion:undefined, talents:['__proto__'] }; migrateTalents(corrupt); assert.equal(corrupt.talentVersion,undefined,'bad legacy saves remain invalid');

const dir = mkdtempSync(join(tmpdir(),'mossvale-combat-feedback-')), file=join(dir,'players.json');
const token=randomBytes(32).toString('base64url'), key=createHash('sha256').update(token).digest('hex');
const spawn=relocateOverworldSpawn({id:'feedback-target',kind:'moss-slime',zone:'greenwood',x:-90,z:5});
const point={x:spawn.x,z:spawn.z-2};assert(canTraverse(point,spawn));
const hero = { id:randomUUID(), name:'Feedback mage', ...build('Mage'), talentVersion:undefined, talents:legacyTalents,
  appearance:{skin:'#dca67f',hair:'#49362b',hairStyle:'swept',outfit:'#577956',accent:'#d8b36a',className:'Mage'},
  coordinateVersion:2, zone:'greenwood', ...point,rotation:0,hp:808,maxHp:808,xp:0,gold:123,characterCreated:true,
  learnedSpells:spellsForClass('Mage').map(spell=>spell.id),inventory:{wood:4,crystal:5,potion:3,herb:6,relic:1},
  quest:{chapter:0,stage:1,kills:0,crystals:0,progress:{'grove-slimes':0,'grove-crystals':0},completed:false,ending:null} };
writeFileSync(file,JSON.stringify({[key]:{characters:[hero]}}));
const originalEnemies=ZONES[0].enemies, monsters=structuredClone(MONSTERS), realNow=Date.now;
let clock=realNow(), game, port; const clients=[]; Date.now=()=>clock;
const until=async(fn,label)=>{const end=realNow()+5000;while(realNow()<end){const value=fn();if(value)return value;await delay(10);}throw Error(`Timed out: ${typeof label === 'function' ? label() : label}`);};
const tick=async(ms=0)=>{const frames=clients.filter(c=>c.inWorld&&c.socket.readyState===WebSocket.OPEN).map(c=>[c,c.snapshot]);clock+=ms;await until(()=>frames.every(([c,before])=>!c.inWorld||c.socket.readyState!==WebSocket.OPEN||c.snapshot!==before&&c.snapshot.serverTime===clock),'fresh combat snapshots');};
async function start(){
  ZONES[0].enemies=[spawn]; MONSTERS['moss-slime'].hp=100000;MONSTERS['moss-slime'].speed=0;
  try {game=createGameServer({port:0,host:'127.0.0.1',dataDir:dir,keycloak:null,databaseUrl:''});} finally {ZONES[0].enemies=originalEnemies;}
  for(const monster of Object.values(MONSTERS))monster.aggroRange=0;
  port=await game.start();
}
async function connect(){
  const socket=new WebSocket(`ws://127.0.0.1:${port}/socket`), c={socket,messages:[]};clients.push(c);
  c.send=m=>socket.send(JSON.stringify(m));c.player=()=>c.snapshot?.players.find(p=>p.id===c.welcome?.id);c.enemy=()=>c.snapshot.enemies.find(e=>e.id==='feedback-target');c.casts=()=>c.messages.filter(m=>m.type==='combat'&&m.playerId===c.welcome?.id);
  socket.on('message',raw=>{const m=JSON.parse(raw);c.messages.push(m);if(['snapshot','roster','welcome'].includes(m.type))c[m.type]=m;if(m.type==='snapshot')c.inWorld=true;if(m.type==='roster')c.inWorld=false;});
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  c.send({type:'join',token});await until(()=>c.roster,'roster');c.send({type:'selectCharacter',characterId:c.roster.characters[0].id});await until(()=>c.player(),'world entry');return c;
}
async function cast(c,ability){
  const count=c.casts().length;c.send({type:'attack',ability,targetId:'feedback-target'});
  await until(()=>c.player().casting||c.casts().length>count,()=>`${ability} accepted ${JSON.stringify(c.messages.filter(m=>m.type==='event').slice(-8))}`);
  if(c.player().casting)await tick(c.player().casting.endsAt-clock);
  return until(()=>c.casts()[count],`${ability} released`);
}
const impactAt=event=>{const target=event.targets[0], timing=combatTiming(event.ability,Math.hypot(target.x-event.from.x,target.z-event.from.z),0);return event.startedAt+(timing.delay+timing.flight)*1000;};
try {
  await start();let c=await connect();
  assert.equal(c.player().talentVersion,TALENT_VERSION);assert.deepEqual(c.player().talents,[]);assert.equal(c.player().gold,123);assert.deepEqual(c.player().inventory,hero.inventory);
  c.send({type:'learnTalent',talentId:'mage-1'});await until(()=>c.player().talents.length===1,'learn fire');
  c.send({type:'resetTalents'});await until(()=>!c.player().talents.length,'free respec');
  assert.equal(c.player().gold,123);assert.deepEqual(JSON.parse(readFileSync(file))[key].characters[0].talents,[],'respec saved before confirmation');
  c.send({type:'learnTalent',talentId:'mage-1'});await until(()=>c.player().talents.length===1,'learn after respec');
  const first=await cast(c,'fireball');
  assert.equal(c.player().abilityCooldowns.fireball,first.startedAt);
  assert.deepEqual(c.enemy().damageOverTime,[],'no burn before impact');
  c.send({type:'attack',ability:'fireball',targetId:'feedback-target'});await until(()=>c.player().casting,'back-to-back fireball without dead time');
  c.send({type:'resetTalents'});await tick();assert.deepEqual(c.player().talents,['mage-1'],'cannot switch build during a cast');
  await tick(impactAt(first)+1-clock);
  let dot=c.enemy().damageOverTime[0];assert.equal(dot.ability,'fireball');assert.equal(dot.sourceId,c.player().id);assert.equal(dot.expiresAt,impactAt(first)+4000);
  const before=c.enemy().hp;await tick(1000);assert(c.enemy().hp<before,'burn ticks deal real server damage');
  await tick(c.player().casting.endsAt-clock);const second=c.casts().at(-1);await tick(impactAt(second)+1-clock);
  assert.equal(c.enemy().damageOverTime.length,1,'same caster ability refreshes one effect');assert.equal(c.enemy().damageOverTime[0].expiresAt,impactAt(second)+4000);
  await tick(4100);assert.deepEqual(c.enemy().damageOverTime,[],'last tick removes timer');
  const frostCast=await cast(c,'frostbolt');await tick(impactAt(frostCast)+1-clock);
  const beforeLance=c.enemy().hp, lance=await cast(c,'ice-lance');await tick(impactAt(lance)+1-clock);
  const dealt=beforeLance-c.enemy().hp;assert(dealt>=spellDamage(SPELLS['ice-lance'],combatStats(c.player()))*3,'ice lance shatters an actually slowed enemy');
  await tick(10000);const third=await cast(c,'fireball');await tick(impactAt(third)+1-clock);assert.equal(c.enemy().damageOverTime.length,1);
  c.socket.close();await until(()=>c.socket.readyState===WebSocket.CLOSED,'disconnect');c=await connect();assert.deepEqual(c.enemy().damageOverTime,[],'logout clears periodic effects');
  assert.deepEqual(c.player().talents,['mage-1'],'reconnect retains new build');
  await game.stop();game=null;await start();c=await connect();assert.deepEqual(c.player().talents,['mage-1'],'restart never refunds again');
  console.log('PASS combat feedback: 20-point specialization, all capstones, validated one-time refund, school and set damage, hardcast tradeoffs, immediate repeat casting, live burn timers/refresh/expiry/logout, frost shatter, durable free respec and combat rejection.');
} finally {for(const c of clients)c.socket.terminate();await game?.stop();Date.now=realNow;ZONES[0].enemies=originalEnemies;Object.entries(monsters).forEach(([kind,monster])=>Object.assign(MONSTERS[kind],monster));rmSync(dir,{recursive:true,force:true});}
