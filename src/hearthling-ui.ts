import { MEADGOD_QUEST, MEADGOD_QUEST_COST } from './hearthling.ts';
import { icon } from './icons.ts';

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
const number = (value: number) => value.toLocaleString('en-US');

export function renderHearthlingQuest(player: { gold: number; meadGodPaid?: boolean }, options: { available: boolean; pending: boolean; lines?: string[]; notice?: string }) {
  const paid = player.meadGodPaid === true, shortfall = Math.max(0, MEADGOD_QUEST_COST - player.gold);
  const lines = options.lines?.length ? options.lines : paid ? [MEADGOD_QUEST.complete] : MEADGOD_QUEST.intro;
  return `<section class="training-shell npc-talk-shell" aria-label="MEADGod's quest">
    <div class="dialogue-lines npc-talk-copy"><h3 class="npc-talk-topic">${escape(MEADGOD_QUEST.title)}</h3>
      ${paid ? '<p>Title unlocked</p>' : ''}
      ${lines.map(line => `<p>${escape(line)}</p>`).join('')}
      ${paid ? '<p>Your displayed title stays the same until you select Pons Lover in Titles &amp; Achievements.</p>' : `<p>${icon('gold')} Cost: <strong>${number(MEADGOD_QUEST_COST)} gold</strong></p><p>Your gold: ${number(player.gold)}</p>${shortfall ? `<p>You need ${number(shortfall)} more gold.</p>` : ''}<p>${icon('crown')} Reward: <strong>Pons Lover</strong></p>`}
      <p id="hearthling-status" role="status" aria-live="polite">${escape(options.notice || (!options.available && !paid ? 'Speak to MEADGod in Willowbrook to pay for this title.' : ''))}</p>
    </div><div class="npc-talk-actions">
      ${paid ? '<button type="button" class="primary-button" data-open-titles>Open Titles &amp; Achievements</button>' : `<button type="button" class="primary-button" id="hearthling-action" data-hearthling-action="pay" aria-describedby="hearthling-status" ${!options.available || options.pending || shortfall ? 'disabled' : ''}>${options.pending ? 'Saving…' : `Pay ${number(MEADGOD_QUEST_COST)} gold`}</button>`}
      <button type="button" class="primary-button" data-find-hearthling>${icon('route')} Find MEADGod in Willowbrook</button>
      <button type="button" class="primary-button npc-talk-close" data-close-hearthling>Close</button>
    </div>
  </section>`;
}

export function renderHearthlingJournal(player: { meadGodPaid?: boolean }) {
  return `<article class="adventure-entry" aria-label="MEADGod's quest"><div class="adventure-entry-heading"><img src="/ui/pets/hearthling.png" width="64" height="64" alt=""><div><h3>Pons Lover</h3><small>MEADGod · Willowbrook · ${player.meadGodPaid ? 'Complete' : 'Available'}</small></div></div><p>${player.meadGodPaid ? 'Pons Lover is unlocked. Choose it in Titles &amp; Achievements.' : `Pay ${number(MEADGOD_QUEST_COST)} gold once to unlock the Pons Lover title.`}</p><div class="adventure-actions"><button type="button" class="primary-button" data-open-hearthling>View quest</button><button type="button" class="primary-button" data-find-hearthling>${icon('route')} Find MEADGod</button></div></article>`;
}
