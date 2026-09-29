import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { TALENTS } from '../src/progression.ts';
import { SPELLS } from '../src/spells.ts';
import { ICONS } from '../src/icons.ts';

const html = readFileSync(new URL('../public/talent-editor.html', import.meta.url), 'utf8');
const script = id => {
  const match = html.match(new RegExp(`<script\\b[^>]*\\bid=["']${id}["'][^>]*>([\\s\\S]*?)<\\/script>`));
  assert(match, `Missing ${id} script`);
  return match[1];
};
const context = vm.createContext({ crypto: webcrypto, structuredClone });
vm.runInContext(script('editor-core'), context, { timeout: 1000 });
const { validateDesign, moveTalent, addTalent, deleteTalent, changeRank, rankEffect, parseRankEffects, serializeDesign } = context.EditorCore;
const baseline = JSON.parse(script('baseline-data'));
const art = JSON.parse(script('art-data'));
assert.equal(art.files['ui/spells-redesign.png'], `data:image/png;base64,${readFileSync(new URL('../public/ui/spells-redesign.png', import.meta.url)).toString('base64')}`, 'offline talent editor embeds the current Blender artwork');
assert.deepEqual(JSON.parse(script('design-data')), baseline, 'fresh offline downloads open the current baseline');
const fresh = () => validateDesign(baseline);
const allTalents = design => design.classes.flatMap(c => c.trees.flatMap(t => t.talents));
const baselineNodes = allTalents(baseline);
assert.equal(baseline.classes.length, 4);
assert.equal(baselineNodes.length, Object.keys(TALENTS).length);
assert.deepEqual(new Set(baselineNodes.map(t => t.id)), new Set(Object.keys(TALENTS)));
for (const c of baseline.classes) {
  assert.equal(c.budget, 20);
  assert.equal(c.trees.length, 3);
  for (const tree of c.trees) {
    assert.equal(tree.talents.length, Object.values(TALENTS).filter(t => t.className === c.id && t.branch === tree.name).length);
    for (const node of tree.talents) {
      const original = TALENTS[node.id];
      assert.equal(original.className, c.id);
      assert.equal(original.branch, tree.name);
      for (const key of ['label', 'description', 'row', 'column', 'maxRank', 'requiredLevel', 'requiredBranchPoints', 'prerequisite', 'prerequisiteRank']) {
        assert.equal(node[key], original[key], `${node.id} ${key} matches the game catalog`);
      }
      assert.deepEqual(node.rankDescriptions, original.rankDescriptions || []);
      assert.equal(node.rank, 0);
      const expectedIcon = original.icon || (original.ability && SPELLS[original.ability].icon);
      if (expectedIcon) assert.equal(node.icon, expectedIcon, `${node.id} uses the current game icon`);
      const artwork = art.icons[node.icon];
      assert(artwork && art.files[artwork.file]?.startsWith('data:image/'), `${node.id} has embedded artwork`);
      if (ICONS[node.icon]) assert.deepEqual([artwork.slot, artwork.rows], ICONS[node.icon].slice(1), `${node.id} atlas position`);
    }
  }
}

const cloned = fresh();
cloned.classes[0].trees[0].talents[0].label = 'Independent draft';
assert.notEqual(baseline.classes[0].trees[0].talents[0].label, 'Independent draft', 'validation returns a detached clone');
const rankNode = cloned.classes[0].trees[0].talents[0];
changeRank(rankNode, 100);
assert.equal(rankNode.rank, rankNode.maxRank);
changeRank(rankNode, -100);
assert.equal(rankNode.rank, 0);
changeRank(rankNode, 1);
assert.equal(rankNode.rank, 1);
rankNode.description = 'Damage bonus';
rankNode.maxRank = 3;
rankNode.rankDescriptions = parseRankEffects('  5% damage  \n10% damage\n\n');
assert.equal(rankEffect(rankNode), '5% damage', 'one point selects the first rank effect');
changeRank(rankNode, 1);
assert.equal(rankEffect(rankNode), '10% damage', 'two points select the second rank effect');
assert.equal(rankEffect(rankNode, 0), 'No points placed.');
assert.equal(rankEffect(rankNode, -1), 'No points placed.');
assert.equal(rankEffect(rankNode, 3), 'Damage bonus', 'missing rank effect falls back to the description');
assert.deepEqual(Array.from(parseRankEffects('\n  10% damage\n\n  20% damage  \n\n')), ['', '10% damage', '', '20% damage'], 'blank rank slots keep their original positions');
assert.equal(rankEffect({ ...rankNode, rankDescriptions: ['', '10% damage'] }, 1), 'Damage bonus', 'blank rank effect falls back to the description');
assert.deepEqual(Array.from(parseRankEffects(' \n\n')), [], 'empty effects have no trailing rank slots');
const savedRankNode = validateDesign(JSON.parse(serializeDesign(cloned))).classes[0].trees[0].talents[0];
assert.equal(savedRankNode.rank, 2, 'export preserves allocated points');
assert.deepEqual(Array.from(savedRankNode.rankDescriptions), ['5% damage', '10% damage'], 'export preserves editable effects');
assert.equal(rankEffect(savedRankNode), '10% damage', 'import restores the effect for allocated points');

const moved = fresh(), c = moved.classes[0], tree = c.trees[0], otherTree = c.trees[1];
const second = tree.talents.find(n => n.prerequisite && tree.talents.some(d => d.prerequisite === n.id));
const first = tree.talents.find(n => n.id === second.prerequisite), firstSlot = [first.row, first.column], secondSlot = [second.row, second.column];
moveTalent(moved, c.id, first.id, tree.id, ...secondSlot);
assert.deepEqual([first.row, first.column], secondSlot);
assert.deepEqual([second.row, second.column], firstSlot, 'moving to an occupied cell swaps nodes');
const dependent = tree.talents.find(t => t.prerequisite === second.id);
assert(second.prerequisite && dependent, 'baseline supplies a dependency chain');
moveTalent(moved, c.id, second.id, otherTree.id, 7, 2);
assert(!tree.talents.some(t => t.id === second.id));
assert(otherTree.talents.some(t => t.id === second.id));
assert.deepEqual([second.row, second.column], [7, 2]);
assert.equal(second.prerequisite, null, 'moving between trees clears the moved prerequisite');
assert.equal(second.prerequisiteRank, 0);
assert.equal(dependent.prerequisite, null, 'moving between trees clears incoming prerequisites');
assert.equal(dependent.prerequisiteRank, 0);
validateDesign(moved);

const edited = fresh(), editClass = edited.classes[0], editTree = editClass.trees[0];
const occupied = new Set(editTree.talents.map(t => `${t.row},${t.column}`));
const slots = Array.from({ length: 24 }, (_, n) => [Math.floor(n / 3), n % 3]);
const freeSlot = slots.find(([row, col]) => !occupied.has(`${row},${col}`));
const added = addTalent(edited, editClass.id, editTree.id);
assert(added.id && editTree.talents.includes(added));
assert.deepEqual([added.row, added.column], freeSlot, 'new talent uses the first free cell');
assert.equal(allTalents(edited).length, baselineNodes.length + 1);
validateDesign(edited);
const victim = editTree.talents.find(t => editTree.talents.some(other => other.prerequisite === t.id));
const dependents = editTree.talents.filter(t => t.prerequisite === victim.id);
deleteTalent(edited, editClass.id, victim.id);
assert(!allTalents(edited).some(t => t.id === victim.id));
for (const node of dependents) {
  assert.equal(node.prerequisite, null);
  assert.equal(node.prerequisiteRank, 0);
}
validateDesign(edited);

const rejects = (label, mutate) => {
  const invalid = structuredClone(baseline);
  mutate(invalid, invalid.classes[0], invalid.classes[0].trees[0], invalid.classes[0].trees[0].talents[0]);
  assert.throws(() => validateDesign(invalid), label);
};
assert.throws(() => validateDesign(null));
rejects('unsupported schema', d => { d.schemaVersion = 2; });
rejects('non-array classes', d => { d.classes = {}; });
rejects('wrong label type', (_d, _c, _t, n) => { n.label = 12; });
rejects('wrong description type', (_d, _c, _t, n) => { n.description = {}; });
rejects('duplicate class IDs', d => { d.classes[1].id = d.classes[0].id; });
rejects('duplicate tree IDs', (_d, c) => { c.trees[1].id = c.trees[0].id; });
rejects('duplicate talent IDs', (_d, _c, t) => { t.talents[1].id = t.talents[0].id; });
rejects('occupied positions', (_d, _c, t) => { t.talents[1].row = t.talents[0].row; t.talents[1].column = t.talents[0].column; });
rejects('row bounds', (_d, _c, _t, n) => { n.row = 8; });
rejects('column bounds', (_d, _c, _t, n) => { n.column = -1; });
rejects('fractional position', (_d, _c, _t, n) => { n.row = 0.5; });
rejects('negative rank', (_d, _c, _t, n) => { n.rank = -1; });
rejects('rank exceeds maximum', (_d, _c, _t, n) => { n.rank = n.maxRank + 1; });
rejects('zero maximum rank', (_d, _c, _t, n) => { n.maxRank = 0; });
rejects('fractional rank', (_d, _c, _t, n) => { n.rank = 0.5; });
rejects('unknown prerequisite', (_d, _c, _t, n) => { n.prerequisite = 'missing-talent'; n.prerequisiteRank = 1; });
rejects('prerequisite cycle', (_d, _c, t) => {
  t.talents[0].prerequisite = t.talents[1].id;
  t.talents[0].prerequisiteRank = 1;
  t.talents[1].prerequisite = t.talents[0].id;
  t.talents[1].prerequisiteRank = 1;
});

const portable = fresh();
portable.classes[0].trees[0].talents[0].description = '</script><img src=x onerror=alert(1)> & talent notes';
const serialized = serializeDesign(portable);
assert(!serialized.includes('<'), 'embedded JSON cannot close its script element');
assert.deepEqual(JSON.parse(serialized), JSON.parse(JSON.stringify(portable)), 'export preserves the full design');
validateDesign(JSON.parse(serialized));
console.log(`PASS talent editor: ${baselineNodes.length} game talents, detached drafts, rank bounds/effects, move/swap/dependencies, add/delete, import validation and portable export.`);
