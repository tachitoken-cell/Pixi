import assert from 'node:assert/strict';
import { HEARTHLING_NPC, MEADGOD_QUEST, MEADGOD_QUEST_COST } from '../src/hearthling.ts';
import { renderHearthlingQuest, renderHearthlingJournal } from '../src/hearthling-ui.ts';
import { translateText } from '../src/localization.ts';

const options = { available: true, pending: false };
const action = html => html.match(/<button\b[^>]*id="hearthling-action"[^>]*>[\s\S]*?<\/button>/)?.[0];
assert.equal(HEARTHLING_NPC.name, 'MEADGod');
assert.equal(MEADGOD_QUEST_COST, 100_000);
assert.equal(MEADGOD_QUEST.title, 'Pons Lover');
for (const gold of [0, 99999, 100_000, 250_000]) {
  const player = { gold, meadGodPaid: false }, initial = renderHearthlingQuest(player, options);
  assert.match(action(initial), /data-hearthling-action="pay"/);
  assert.match(action(initial), />Pay 100,000 gold</);
  assert.doesNotMatch(initial, /One-time quest|This is a one-time payment for your character/);
  assert.equal(/\bdisabled\b/.test(action(initial)), gold < MEADGOD_QUEST_COST);
  assert(initial.includes(`Your gold: ${gold.toLocaleString('en-US')}`));
  if (gold < MEADGOD_QUEST_COST) assert(initial.includes(`You need ${(MEADGOD_QUEST_COST - gold).toLocaleString('en-US')} more gold.`));
  assert.match(action(renderHearthlingQuest(player, { ...options, available: false })), /\bdisabled\b/);
  assert.match(action(renderHearthlingQuest(player, { ...options, pending: true })), /disabled[^>]*>Saving…/);
  assert.deepEqual(player, { gold, meadGodPaid: false }, 'pending rendering does not deduct gold or unlock the title');
  assert.doesNotMatch(initial, /data-hearthling-chapter|data-collection-tab|Accept quest|Complete quest|Quest 1 of|pet learned/);
  assert.match(renderHearthlingJournal(player), /data-open-hearthling/);
  assert.match(renderHearthlingJournal(player), /data-find-hearthling/);
}
const completed = renderHearthlingQuest({ gold: 0, meadGodPaid: true }, options);
assert.equal(action(completed), undefined, 'paid quest has no repeat payment action');
assert.match(completed, /Title unlocked/);
assert.match(completed, /data-open-titles/);
assert.match(completed, /Your displayed title stays the same/);
assert.match(renderHearthlingJournal({ meadGodPaid: true }), /Pons Lover is unlocked/);
const rejected = renderHearthlingQuest({ gold: 100_000 }, { ...options, lines: ['<script>bad()</script>'], notice: '<b>Saving failed</b>' });
assert.doesNotMatch(rejected, /<script>|<b>/);
assert.match(rejected, /&lt;b&gt;Saving failed&lt;\/b&gt;/);
assert.match(rejected, /id="hearthling-status" role="status" aria-live="polite"/);
assert.doesNotMatch(action(rejected), /\bdisabled\b/, 'a rejected payment can be retried');
for (const source of [...MEADGOD_QUEST.intro, MEADGOD_QUEST.complete, "MEADGod's quest", 'Title unlocked', 'Open Titles & Achievements', 'Find MEADGod in Willowbrook', 'You need 1 more gold.', 'Your gold: 99,999', 'Pay 100,000 gold', 'Pay 100,000 gold once to unlock the Pons Lover title.']) {
  assert.notEqual(translateText(source, 'zh-CN'), source, `MEADGod content translated: ${source}`);
  assert.equal(translateText(source, 'en'), source, 'English copy is preserved');
}
assert.equal(translateText('Pons Lover', 'zh-CN'), 'Pons Lover', 'exact title name is preserved');
assert.equal(translateText('MEADGod', 'zh-CN'), 'MEADGod', 'exact NPC name is preserved');
console.log('PASS MEADGod quest UI: exact payment, balance/shortfall, no optimistic charge/unlock, proximity/pending guards, completed title-picker action, escaped rejection text and zh-CN copy.');
