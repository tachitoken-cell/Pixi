import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { SPELLS, SPELL_EFFECT_IDS, spellUtilityLabel } from '../src/spells.ts';
import { ICONS, SEPTEMBER_28_ICONS, icon } from '../src/icons.ts';
import { TALENT_DESIGN } from '../src/talent-design.ts';
import { starterGear, TALENTS } from '../src/progression.ts';
import { makeCharacter, animateCharacter } from '../src/characters.ts';
import { DEFAULT_APPEARANCE } from '../src/appearance.ts';
const hook = registerHooks({ resolve(specifier, context, next) {
  return next(context.parentURL?.includes('/src/') && /^\.\/[\w-]+$/.test(specifier) ? `${specifier}.ts` : specifier, context);
} });
const { renderSpellbook } = await import('../src/hotbar.ts');
const { renderTraining } = await import('../src/training-ui.ts');
const { renderTalents } = await import('../src/progression-ui.ts');
const { TRAINER_NPCS } = await import('../src/training.ts');
hook.deregister();

for (const id of Object.values(SPELL_EFFECT_IDS)) {
  const spell = SPELLS[id], player = { id:'check', appearance:{ className:spell.className }, level:60, gold:10000,
    learnedSpells:[id], talents:[], inventory:{potion:0}, ...starterGear(spell.className) };
  const book = renderSpellbook(player, Array(16).fill(null));
  const training = renderTraining(player, TRAINER_NPCS.find(n => n.className === spell.className), {selected:id});
  for (const html of [book, training]) {
    assert(!/undefined|NaN/.test(html));
    assert(html.includes(spellUtilityLabel(spell)), `${id} explains utility instead of damage`);
    assert(html.includes(icon(spell.icon)), `${id} has its own icon`);
  }
  assert(!training.includes('<dt>Damage</dt>'), 'utility trainer detail never promises damage');
}
const atlas = readFileSync(new URL('../public/ui/spells-redesign.png', import.meta.url));
assert.deepEqual([atlas.readUInt32BE(16), atlas.readUInt32BE(20), atlas[25]], [1024,1024,6]);
assert.match(readFileSync(new URL('../src/art.css', import.meta.url), 'utf8'), /\.item-art\.atlas-spells-redesign\s*\{[^}]*background-size: 400% 400%;/, 'game CSS crops the four-row Blender atlas correctly');
const images = new Set();
for (const [slot, name] of ['roll','blink','lightspeed','poison-cloud','edict-of-the-dawn','titans-edict','eternal-edict','edict-of-light','bouncing-edicts','edict-of-protection','blanket-edicts','edict-of-harm','renewable-edict'].entries()) {
  assert.deepEqual(ICONS[`spell-${name}`], ['spells-redesign',slot,4]);
  const png = readFileSync(new URL(`../public/ui/spell-redesign/${name}.png`, import.meta.url));
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20), png[25]], [256,256,6], `${name} has a detailed RGBA icon`);
  images.add(createHash('sha256').update(png).digest('hex'));
}
assert.equal(images.size, 13, 'every redesigned icon has its own rendered artwork');
const requestedSpells=JSON.parse(readFileSync(new URL('../docs/source/mossvale-spell-redesign-2026-09-28.json',import.meta.url))).classes.flatMap(c=>c.spells);
const requestedTalents=TALENT_DESIGN.classes.flatMap(c=>c.trees.flatMap(tree=>tree.talents));
const noted=[...requestedSpells,...requestedTalents].filter(entry=>/new icon/i.test(entry.notes));
assert.equal(noted.length,20,'all four spell and sixteen talent icon notes are covered');
assert.deepEqual(new Set(noted.map(entry=>entry.label.toLowerCase().replace(/[^a-z0-9]+/g,'-'))),new Set(SEPTEMBER_28_ICONS));
const freshAtlas=readFileSync(new URL('../public/ui/spells-september28.png',import.meta.url));
assert.deepEqual([freshAtlas.readUInt32BE(16),freshAtlas.readUInt32BE(20),freshAtlas[25]],[1024,1280,6]);
const freshImages=new Set();
for(const [slot,name] of SEPTEMBER_28_ICONS.entries()) {
  assert.deepEqual(ICONS[`spell-${name}`],['spells-september28',slot,5]);
  const png=readFileSync(new URL(`../public/ui/spell-talents-2026-09-28/${name}.png`,import.meta.url));
  assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20),png[25]],[512,512,6]);
  freshImages.add(createHash('sha256').update(png).digest('hex'));
}
assert.equal(freshImages.size,20,'twenty distinct native Blender sculptures');
for(const entry of noted)assert.equal((SPELLS[entry.id]??TALENTS[entry.id]).icon,`spell-${entry.label.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`);
const clericTree = renderTalents({level:60, appearance:{className:'Cleric'}, talents:[], gold:0});
const edicts = Object.values(TALENTS).filter(t => t.className === 'Cleric' && ICONS[t.icon]?.[0] === 'spells-redesign');
assert.equal(edicts.length, 9);
for (const talent of edicts) {
  const entry = clericTree.match(new RegExp(`data-learn-talent="${talent.id}"[^>]*>([\\s\\S]*?)<\\/button>`))?.[1];
  assert(entry?.includes(icon(talent.icon)), `${talent.label} renders its detailed icon`);
}

// Exercise the same prediction function used by walking, swimming and mounted clients.
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const runtime = { player:{ combatTalents:{movementSpeedUntil:2000,movementSpeedMultiplier:1.5},travel:{} },
  Date:{now:()=>1000},serverOffset:0,gmFlying:()=>false,gearSpeedMultiplier:()=>1,keys:new Set(),
  jump:{grounded:true,y:0},jumpFloor:()=>0,worldInstance:null,position:{x:0,z:0},waterAt:()=>false,
  canSprint:()=>true, mountSpeed:()=>10,WALK_SPEED:6,SPRINT_SPEED:9,SWIM_SPEED:3,SWIM_SPRINT_SPEED:4 };
runInNewContext(stripTypeScriptTypes(source.match(/^function localSwimming.*$/m)[0]+'\n'+source.slice(source.indexOf('function travelSpeed()'),source.indexOf('function updateMountView('))),runtime);
assert.equal(runtime.travelSpeed(),9);
runtime.player.travel.mount='horse'; assert.equal(runtime.travelSpeed(),15);
runtime.player.travel.mount=null;runtime.waterAt=()=>true;assert.equal(runtime.travelSpeed(),4.5);
runtime.waterAt=()=>false;runtime.player.combatTalents.movementSpeedUntil=999;assert.equal(runtime.travelSpeed(),6);
runtime.player.duelStatus={stunUntil:2000};assert.equal(runtime.travelSpeed(),0);

const avatar = makeCharacter({...DEFAULT_APPEARANCE,className:'Ranger'}), rig = avatar.userData.rig;
avatar.position.set(12,0,8);
for (const progress of [.25,.5,.75]) {
  animateCharacter(avatar,1,true,{ability:SPELL_EFFECT_IDS.roll,progress,rotation:0});
  assert(Math.abs(rig.body.rotation.x-progress*Math.PI*2)<1e-8, 'Roll tumbles the character');
  assert.deepEqual(avatar.position.toArray(),[12,0,8], 'animation leaves authoritative world movement intact');
}
animateCharacter(avatar,1,true,false);assert.equal(rig.body.rotation.x,0,'normal movement resets Roll pose');
console.log('PASS class redesign client: utility spellbook/trainer text, twenty new and thirteen retained Blender icons, nine Edict talent icons, speed prediction/expiry and Roll animation.');
