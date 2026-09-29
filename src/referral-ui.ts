import type { ClientMessage } from './shared';
import { icon } from './icons';
import { REFERRAL_TIERS, referralFeeBps, normalizeReferralCode, type ReferralState } from './referrals';

const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function renderReferrals(state: ReferralState | null, origin: string) {
  if (!state) return '<div class="referrals"><header class="referral-header"><h2>Referral Rewards</h2></header><p role="status">Loading your referrals…</p></div>';
  const link = new URL('/', origin); link.searchParams.set('ref', state.code);
  const tiers = state.feeVersion !== 2 ? REFERRAL_TIERS.filter(tier => tier.count < 100).map(tier => ({ count: tier.count, bps: referralFeeBps(tier.count, 1) })) : REFERRAL_TIERS;
  const basis = state.feeVersion !== 2 ? 'burn share' : 'purchase price';
  const progress = state.progress, next = tiers.find(tier => state.qualifiedCount < tier.count);
  const currentTier = tiers.filter(tier => state.qualifiedCount >= tier.count).length;
  const percentage = (bps: number) => `${(bps / 100).toFixed(2)}%`;
  return `<div class="referrals">
    <header class="referral-header"><h2>Referral Rewards</h2><p class="referral-heading-summary"><strong>${state.qualifiedCount}</strong> qualified referrals · ${percentage(state.feeShareBps)} of their ${basis}</p></header>
    <div class="referral-summary"><div class="referral-count"><span class="referral-label">Current referrals</span><div>${icon('invite')}<strong>${state.qualifiedCount}</strong><p>qualified<br>referrals</p></div><small>${currentTier ? `Tier ${currentTier} · ${percentage(state.feeShareBps)} of their ${basis}` : 'Your first referral unlocks Tier 1'}</small></div><div class="referral-next"><span class="referral-label">${next ? 'Next unlock' : 'Highest tier unlocked'}</span><div><span class="referral-next-badge" data-count="${next?.count ?? tiers[tiers.length - 1].count}">${next?.count ?? tiers[tiers.length - 1].count}</span><p><strong>${next ? percentage(next.bps) : percentage(state.feeShareBps)} reward</strong><span>${next ? `${next.count - state.qualifiedCount} more to unlock` : 'All milestones reached'}</span></p></div><progress max="${next?.count ?? tiers[tiers.length - 1].count}" value="${Math.min(next?.count ?? tiers[tiers.length - 1].count, state.qualifiedCount)}" aria-label="Progress to ${next ? 'Tier ' + (currentTier + 1) : 'highest referral tier'}"></progress></div></div>
    <ol class="referral-rewards" aria-label="Referral reward tiers">
      ${tiers.map(({count, bps}, index) => {
        const image = count === 10 ? '/ui/pets/wayfinder-sprite.png' : count === 25 ? '/ui/mount-wayfarer-stag.png' : '';
        const name = count === 10 ? 'Wayfinder Sprite' : count === 25 ? 'Wayfarer Stag' : `${percentage(bps)} MOSS reward`;
        const description = count === 10 ? `An exclusive account pet, plus ${percentage(bps)} of their ${basis}.` : count === 25 ? `A mount with a second seat for a friend, plus ${percentage(bps)} of their ${basis}.` : `Earn ${percentage(bps)} of ${state.feeVersion !== 2 ? 'the burn share on ' : ''}your qualified referrals’ future MOSS purchases.`;
        return `<li class="${state.qualifiedCount >= count ? 'is-unlocked' : ''}"><span class="referral-milestone" data-count="${count}"><b>${count}</b><small>${count === 1 ? 'referral' : 'referrals'}</small></span><span class="referral-reward-art" aria-hidden="true">${image ? `<img src="${image}" alt="" width="76" height="76">` : icon('gold')}</span><div class="referral-reward-copy"><h3>${name}</h3><p>${description}</p><div class="referral-tier-progress"><span class="referral-lock" aria-hidden="true">${state.qualifiedCount >= count ? '✓' : '🔒'}</span><progress max="${count}" value="${Math.min(count, state.qualifiedCount)}" aria-label="Tier ${index + 1}: ${Math.min(count, state.qualifiedCount)} of ${count} qualified referrals"></progress><span class="referral-unlock">${state.qualifiedCount >= count ? 'Unlocked' : `${count - state.qualifiedCount} more to unlock`}</span><small>${Math.min(count, state.qualifiedCount)} / ${count}</small></div></div></li>`;
      }).join('')}
    </ol>
    <div class="referral-wallet">${icon('menu-wallet')}<div><h3>Payout wallet</h3><p>${state.payoutWallet ? `<span>${escape(state.payoutWallet)}</span><br>Collect rewards with “Withdraw MOSS proceeds” at the Auction House.` : 'Link your wallet at the Auction House to receive MOSS referral rewards.'}</p></div></div>
    ${state.programEnabled && !state.referralsEnabled ? '<p class="referral-notice" role="status">These MOSS reward rates are not active on this realm yet. Your progress is saved; check back after activation.</p>' : ''}

    <p class="referral-availability">${state.referralsEnabled ? 'MOSS rewards active' : 'MOSS rewards awaiting activation'}</p>
    <section class="referral-invite" aria-label="Invite friends">
    ${state.programEnabled ? `<label class="referral-link" for="referral-link">Your invite link<input id="referral-link" type="url" readonly value="${escape(link.href)}"></label>` : '<p class="referral-notice" role="status">The referral program is not available on this realm yet. Qualification tracking and new rewards are paused.</p>'}
    <div class="referral-actions">${state.programEnabled ? '<button type="button" data-referral-copy>Copy invite link</button>' : ''}<button type="button" data-referral-refresh>Refresh progress</button></div>
    </section>
    <details class="referral-details"><summary>Qualification and reward rules</summary><p>Each new account must reach level 20, play on two separate UTC dates, and spend at least $10 worth of MOSS at the Auction House. One referral per new account. No self-referrals or shared-wallet referrals. Purchases count once they are finalized, at the MOSS/USD price recorded for that purchase. Only purchases after joining through a referral count. Spending before qualification can meet the $10 requirement; fee rewards start on later purchases after qualification.</p><p>${state.feeVersion !== 2 ? 'This settlement deducts a 5% total fee: 80% of that fee goes to burning before referral rewards, 10% to the treasury and 10% to the developer. Your reward is a percentage of the burn share.' : 'This settlement keeps a 5% total fee: 1.25% of the purchase price each goes to the treasury and developer, and 2.5% goes to burning before referral rewards. Your tier reward reduces that burn amount.'} Buyers pay the listed price; sellers receive 95%. Earlier purchases keep their original terms. Pet and mount rewards stay with your account. Riding training is required to drive the stag.</p></details>
    ${state.referredBy ? `<section class="referral-progress"><h3>Your qualification</h3><dl><div><dt>Level</dt><dd>${progress.level} / 20</dd></div><div><dt>Days played</dt><dd>${progress.daysPlayed} / 2</dd></div><div><dt>Finalized purchases</dt><dd>$${(progress.spentUsdCents / 100).toFixed(2)} / $10.00</dd></div></dl><p>${!state.programEnabled ? 'Your saved qualification progress is preserved.' : progress.qualified ? 'Qualified — your inviter can now earn rewards from your future Auction House purchases.' : 'Complete all three requirements to qualify.'}</p></section>` : state.programEnabled && state.canBind ? '<form id="referral-bind"><label for="referral-code">Invited by a friend?<input id="referral-code" name="code" autocomplete="off" spellcheck="false" maxlength="2048" required placeholder="Paste their code or invite link"></label><button type="submit">Use referral code</button><p>Choose your inviter before you start playing. This cannot be changed.</p></form>' : ''}
    <p id="referral-status" role="status" aria-live="polite">${escape(state.error || '')}</p>
  </div>`;
}

export function mountReferralUI(options: { send: (message: ClientMessage) => void; content: () => HTMLElement; active: () => boolean; show: () => void; origin?: string }) {
  let state: ReferralState | null = null, pending = false, codeDraft = '', rulesOpen = false;
  const say = (text: string) => { const node = options.content().querySelector('#referral-status'); if (node) node.textContent = text; };
  function render() {
    if (!options.active()) return;
    const root = options.content(), active = root.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
    const focusSelector = active?.id ? `#${CSS.escape(active.id)}` : active?.matches('[data-referral-copy]') ? '[data-referral-copy]' : active?.matches('[data-referral-refresh]') ? '[data-referral-refresh]' : active?.matches('#referral-bind button') ? '#referral-bind button' : active?.matches('summary') ? '.referral-details summary' : null;
    const draft = root.querySelector<HTMLInputElement>('#referral-code'); if (draft) codeDraft = draft.value;
    const details = root.querySelector<HTMLDetailsElement>('.referral-details'); if (details) rulesOpen = details.open;
    root.innerHTML = renderReferrals(state, options.origin || location.origin);
    const nextDraft = root.querySelector<HTMLInputElement>('#referral-code'); if (nextDraft) { nextDraft.value = codeDraft; nextDraft.addEventListener('input', () => { codeDraft = nextDraft.value; }); }
    const nextDetails = root.querySelector<HTMLDetailsElement>('.referral-details'); if (nextDetails) nextDetails.open = rulesOpen;
    if (focusSelector) root.querySelector<HTMLElement>(focusSelector)?.focus({ preventScroll: true });
    root.querySelector<HTMLButtonElement>('[data-referral-refresh]')?.addEventListener('click', refresh);
    root.querySelector<HTMLButtonElement>('[data-referral-copy]')?.addEventListener('click', async () => {
      const input = root.querySelector<HTMLInputElement>('#referral-link')!;
      try { await navigator.clipboard.writeText(input.value); say('Invite link copied.'); }
      catch { input.focus(); input.select(); say('Select and copy your invite link.'); }
    });
    root.querySelector<HTMLFormElement>('#referral-bind')?.addEventListener('submit', event => {
      event.preventDefault(); if (pending) return;
      const code = normalizeReferralCode(root.querySelector<HTMLInputElement>('#referral-code')!.value);
      if (!code) { say('Enter a valid referral code or invite link.'); return; }
      pending = true; root.querySelector<HTMLButtonElement>('#referral-bind button')!.disabled = true;
      say('Saving your inviter…'); options.send({ type: 'referralBind', code });
    });
  }
  function refresh() { if (pending) return; pending = true; say('Refreshing…'); options.send({ type: 'referralOpen' }); }
  return {
    open() { options.show(); const heading = options.content().closest('#panel')?.querySelector('h2'); if (heading) heading.textContent = 'Referral Rewards'; render(); refresh(); },
    update(value: ReferralState) { state = value; pending = false; render(); },
    reset() { state = null; pending = false; codeDraft = ''; rulesOpen = false; const root = options.content(); if (root.querySelector('.referrals')) root.replaceChildren(); },
  };
}
