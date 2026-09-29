import assert from 'node:assert/strict';
import { HEARTHLING_NPC, MEADGOD_QUEST_COST, MEADGOD_QUEST } from '../src/hearthling.ts';
import { getTitle, titleUnlocked, playerTitle } from '../src/titles.ts';

assert.equal(HEARTHLING_NPC.name, 'MEADGod');
assert.equal(MEADGOD_QUEST_COST, 100000);
assert.equal(MEADGOD_QUEST.title, 'Pons Lover');
const title = getTitle('pons-lover');
assert.equal(title.name, 'Pons Lover');
for (const meadGodPaid of [undefined, null, false, 1, 'true', {}]) {
  assert(!titleUnlocked({ meadGodPaid }, title));
  assert.equal(playerTitle({ meadGodPaid, title: title.id }), null);
}
assert(titleUnlocked({ meadGodPaid: true }, title));
assert.equal(playerTitle({ meadGodPaid: true, title: title.id }), 'Pons Lover');
assert.equal(playerTitle({ meadGodPaid: true, title: null }), null, 'unlock does not force a displayed title');
assert(!titleUnlocked({ hearthlingQuest: { chapter: 3 }, gold: 100000 }, title), 'gold or the old draft story do not unlock the paid title');
console.log('PASS MEADGod: exact name, 100,000 gold cost and Pons Lover title; strict paid entitlement; no automatic display.');
