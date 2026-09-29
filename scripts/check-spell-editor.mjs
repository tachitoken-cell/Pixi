import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { SPELLS } from '../src/spells.ts';
import { ICONS } from '../src/icons.ts';

const html = readFileSync(new URL('../public/spell-editor.html', import.meta.url), 'utf8');
const script = id => {
  const match = html.match(new RegExp(`<script\\b[^>]*\\bid=["']${id}["'][^>]*>([\\s\\S]*?)<\\/script>`));
  assert(match, `Missing ${id} script`);
  return match[1];
};
const context = vm.createContext({ crypto: webcrypto, structuredClone });
vm.runInContext(script('editor-core'), context, { timeout: 1000 });
const { validateDesign, serializeDesign, createSpell, applySpellForm, EXTRA_FIELDS } = context.SpellEditorCore;
const baseline = JSON.parse(script('baseline-data'));
const art = JSON.parse(script('art-data'));
assert.equal(art.files['ui/spells-redesign.png'], `data:image/png;base64,${readFileSync(new URL('../public/ui/spells-redesign.png', import.meta.url)).toString('base64')}`, 'offline spell editor embeds the current Blender artwork');
const plain = value => JSON.parse(JSON.stringify(value));
const fresh = () => validateDesign(baseline);
const allSpells = design => design.classes.flatMap(c => c.spells);
const baselineSpells = allSpells(baseline);
assert.equal(baseline.schemaVersion, 1);
assert.equal(baseline.workshop, 'spells');
for (const key of ['sourceRevision', 'documentId', 'title']) assert(baseline[key]?.length, `${key} is populated`);
assert.deepEqual(JSON.parse(script('design-data')), baseline, 'fresh offline downloads open the current catalog');
assert.equal(baseline.classes.length, 4);
assert.deepEqual(new Set(baseline.classes.map(c => c.id)), new Set(['Ranger', 'Knight', 'Mage', 'Cleric']));
assert.equal(baselineSpells.length, Object.keys(SPELLS).length);
assert.deepEqual(new Set(baselineSpells.map(s => s.id)), new Set(Object.keys(SPELLS)));
for (const c of baseline.classes) {
  assert.equal(c.name, c.id);
  assert.equal(c.spells.length, Object.values(SPELLS).filter(s => s.className === c.id).length);
  for (const spell of c.spells) {
    assert.equal(spell.className, c.id);
    assert.deepEqual(spell, { ...SPELLS[spell.id], notes: '' }, `${spell.id} preserves every catalog field`);
    const artwork = art.icons[spell.icon];
    assert(artwork && art.files[artwork.file]?.startsWith('data:image/'), `${spell.id} has embedded artwork`);
    assert.deepEqual([artwork.slot, artwork.rows], ICONS[spell.icon].slice(1), `${spell.id} atlas position`);
  }
}
assert.deepEqual(plain(fresh()), baseline, 'validation preserves the entire baseline');
const percent = n => Math.round(n * 1000000) / 10000;
const seconds = n => Math.round(n) / 1000;
for (const spell of baselineSpells) {
  const values = {};
  for (const key of ['label', 'description', 'notes', 'requiredLevel', 'icon', 'color', 'school', 'effect', 'targetRelation', 'targeting', 'damageStat', 'visual', 'range', 'radius', 'maxTargets', 'requiredTalent']) values[key] = String(spell[key] ?? '');
  for(const [key,[,factor]] of Object.entries(EXTRA_FIELDS))values[key]=spell[key]===undefined?'':String(spell[key]/factor);
  values.damageScale = String(percent(spell.damageScale));
  for (const key of ['cooldownMs', 'castTimeMs', 'shieldDurationMs']) values[key] = spell[key] === undefined ? '' : String(seconds(spell[key]));
  for (const key of ['shatterScale', 'executeScale']) values[key] = spell[key] === undefined ? '' : String(percent(spell[key]));
  values.channelDuration = spell.channel ? String(seconds(spell.channel.durationMs)) : '';
  values.channelTick = spell.channel ? String(seconds(spell.channel.tickMs)) : '1';
  values.statusKind = spell.status?.kind || '';
  values.statusDuration = spell.status ? String(seconds(spell.status.durationMs)) : '4';
  values.statusMultiplier = spell.status?.multiplier === undefined ? '35' : String(percent(1 - spell.status.multiplier));
  values.statusTicks = String(spell.status?.ticks ?? 3);
  values.statusTickScale = String(percent(spell.status?.tickScale ?? 0.35));
  assert.deepEqual(plain(applySpellForm(spell, values)), spell, `${spell.id} survives opening and applying its form unchanged`);
}
const detached = fresh();
detached.classes[0].spells[0].label = 'Independent draft';
const slow = allSpells(detached).find(s => s.status?.kind === 'slow');
slow.status.durationMs = 9999;
assert.notEqual(baseline.classes[0].spells[0].label, 'Independent draft');
assert.notEqual(baselineSpells.find(s => s.id === slow.id).status.durationMs, 9999, 'nested effects are detached');
const untrusted = structuredClone(baseline);
untrusted.unrecognized = true;
untrusted.classes[0].unrecognized = true;
untrusted.classes[0].spells[0].unrecognized = true;
assert.deepEqual(plain(validateDesign(untrusted)), baseline, 'imports retain only supported design fields');

const rejects = (label, mutate) => {
  const invalid = structuredClone(baseline);
  mutate(invalid, invalid.classes[0], invalid.classes[0].spells[0]);
  assert.throws(() => validateDesign(invalid), label);
};
assert.throws(() => validateDesign(null), 'null import');
rejects('unsupported schema', d => { d.schemaVersion = 2; });
rejects('talent workshop import', d => { d.workshop = 'talents'; });
for (const key of ['sourceRevision', 'documentId', 'title']) rejects(`${key} must be text`, d => { d[key] = {}; });
rejects('non-array classes', d => { d.classes = {}; });
rejects('duplicate classes', d => { d.classes[1].id = d.classes[0].id; });
rejects('unknown class', (_d, c) => { c.id = 'Bard'; });
rejects('non-array spells', (_d, c) => { c.spells = {}; });
rejects('duplicate spell IDs', (_d, c) => { c.spells[1].id = c.spells[0].id; });
rejects('duplicate spell IDs across classes', d => { d.classes[1].spells[0].id = d.classes[0].spells[0].id; });
rejects('wrong class membership', (d, _c, s) => { s.className = d.classes[1].id; });
for (const key of ['id', 'label', 'description', 'notes', 'icon', 'color', 'requiredTalent']) {
  rejects(`${key} must be text`, (_d, _c, s) => { s[key] = {}; });
}
for (const key of ['requiredLevel', 'damageScale', 'range', 'cooldownMs', 'castTimeMs', 'radius', 'maxTargets', 'shieldDurationMs', 'shatterScale', 'executeScale', ...Object.keys(EXTRA_FIELDS)]) {
  for (const value of [-1, NaN, Infinity, '1', null]) {
    rejects(`${key} rejects ${String(value)}`, (_d, _c, s) => { s[key] = value; });
  }
}
rejects('invalid cleanse flag',(_d,_c,s)=>{s.clearMovementImpairments='true';});
rejects('excess movement multiplier',(_d,_c,s)=>{s.castMoveMultiplier=1.01;});
rejects('fractional mark ticks',(_d,_c,s)=>{s.markHealTicks=1.5;});
rejects('fractional level', (_d, _c, s) => { s.requiredLevel = 1.5; });
rejects('fractional target count', (_d, _c, s) => { s.maxTargets = 1.5; });
for (const key of ['school', 'effect', 'targetRelation', 'targeting', 'damageStat', 'visual']) {
  rejects(`unknown ${key}`, (_d, _c, s) => { s[key] = 'invalid'; });
}
for (const channel of [[], null, { durationMs: 3000, tickMs: 0 }, { durationMs: -1, tickMs: 500 }, { durationMs: 500, tickMs: 1000 }, { durationMs: 3000, tickMs: '500' }]) {
  rejects('invalid channel', (_d, _c, s) => { s.channel = channel; });
}
for (const status of [[], null, { kind: 'invalid', durationMs: 1000 }, { kind: 'stun', durationMs: -1 }, { kind: 'slow', durationMs: 1000, multiplier: 1.1 }, { kind: 'slow', durationMs: 1000, multiplier: -0.1 }, { kind: 'burn', durationMs: 1000, ticks: 0, tickScale: 0.2 }, { kind: 'poison', durationMs: 1000, ticks: 1.5, tickScale: 0.2 }, { kind: 'burn', durationMs: 1000, ticks: 2, tickScale: '0.2' }]) {
  rejects('invalid status', (_d, _c, s) => { s.status = status; });
}
const talentHtml = readFileSync(new URL('../public/talent-editor.html', import.meta.url), 'utf8');
const talentDesign = JSON.parse(talentHtml.match(/<script\b[^>]*\bid=["']baseline-data["'][^>]*>([\s\S]*?)<\/script>/)[1]);
assert.throws(() => validateDesign(talentDesign), 'reject actual talent-workshop JSON');

const custom = createSpell('Mage');
assert.match(custom.id, /^custom-[0-9a-f-]{36}$/i);
assert.equal(custom.className, 'Mage');
assert.equal(custom.notes, '');
assert.notEqual(createSpell('Mage').id, custom.id, 'new spells have distinct IDs');
const design = fresh(), mage = design.classes.find(c => c.id === 'Mage');
mage.spells.push(custom);
validateDesign(design);
const fields = {
  label: 'Winter study', description: 'A test spell.', notes: 'Try this in the next balance pass.',
  requiredLevel: '12', icon: 'spell-frostbolt', color: '#83e4ff', school: 'frost', effect: 'damage',
  targetRelation: 'hostile', targeting: 'splash', damageStat: 'specialDamage', damageScale: '125',
  range: '18.5', cooldownMs: '8.25', castTimeMs: '1.5', radius: '3.5', maxTargets: '4',
  shieldDurationMs: '10.5', requiredTalent: 'mage-warding-6', channelDuration: '3', channelTick: '0.5',
  statusKind: 'slow', statusDuration: '4.5', statusMultiplier: '35', statusTicks: '', statusTickScale: '',
  shatterScale: '250', executeScale: '175',
};
const edited = applySpellForm(custom, fields);
assert.equal(edited.id, custom.id);
assert.equal(edited.className, custom.className);
assert.equal(edited.visual, custom.visual, 'form edits preserve the spell visual');
for (const key of ['label', 'description', 'notes', 'icon', 'color', 'school', 'effect', 'targetRelation', 'targeting', 'damageStat', 'requiredTalent']) assert.equal(edited[key], fields[key]);
for (const [key, value] of Object.entries({ requiredLevel: 12, damageScale: 1.25, range: 18.5, cooldownMs: 8250, castTimeMs: 1500, radius: 3.5, maxTargets: 4, shieldDurationMs: 10500, shatterScale: 2.5, executeScale: 1.75 })) assert.equal(edited[key], value, `${key} converts form units`);
assert.deepEqual(plain(edited.channel), { durationMs: 3000, tickMs: 500 });
assert.deepEqual(plain(edited.status), { kind: 'slow', durationMs: 4500, multiplier: 0.65 }, 'slow percentage represents movement reduction');
const periodic = applySpellForm(edited, { ...fields, statusKind: 'burn', statusTicks: '6', statusTickScale: '12.5' });
assert.deepEqual(plain(periodic.status), { kind: 'burn', durationMs: 4500, ticks: 6, tickScale: 0.125 }, 'changing status removes stale slow fields');
const cleared = applySpellForm(periodic, { ...fields, radius: '', maxTargets: '', shieldDurationMs: '', requiredTalent: '', shatterScale: '', executeScale: '', channelDuration: '', statusKind: '' });
for (const key of ['radius', 'maxTargets', 'shieldDurationMs', 'requiredTalent', 'shatterScale', 'executeScale', 'channel', 'status']) assert(!Object.hasOwn(cleared, key), `${key} is removed when cleared`);
for (const spell of [periodic, cleared]) {
  mage.spells[mage.spells.length - 1] = spell;
  const restored = validateDesign(JSON.parse(serializeDesign(design)));
  assert.deepEqual(plain(restored), plain(design), 'custom spells, edited fields and cleared effects survive export/import');
}

const portable = fresh();
portable.classes[0].spells[0].notes = '</script><img src=x onerror=alert(1)> & spell notes';
const serialized = serializeDesign(portable);
assert(!serialized.includes('<'), 'embedded JSON cannot close its script element');
assert.deepEqual(JSON.parse(serialized), plain(portable), 'export preserves markup as literal text');
validateDesign(JSON.parse(serialized));
console.log(`PASS spell editor: ${baselineSpells.length} exact catalog spells, embedded icons, detached drafts, strict imports, form units/effects, custom spells and portable export.`);
