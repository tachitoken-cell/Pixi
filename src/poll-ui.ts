import type { ClientMessage, Player } from './shared';
import { POLL_APPROVAL_PERCENT, pollStatus as status, type PollAnswer, type PollBoothView, type PollView } from './polls';
import { icon } from './icons';

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const choices: PollAnswer[] = ['yes', 'no', 'skip'];
const answerLabel = (answer: PollAnswer) => ({ yes: 'Yes', no: 'No', skip: 'Skip' })[answer];
const date = (value: number) => new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
const stamp = (value: number) => `<time datetime="${new Date(value).toISOString()}">${escape(date(value))}</time>`;
const complete = (poll: PollView, answers: Record<string, PollAnswer>) => poll.questions.every(question => choices.includes(answers[question.id]));

export interface PollUIState {
  selected: string;
  answers: Record<string, PollAnswer>;
  review?: boolean;
  busy?: boolean;
  notice?: string;
  now: number;
}

function renderResults(poll: PollView): string {
  if (!poll.results) return '<p class="poll-message">Voting has ended. Refresh to see the final results.</p>';
  return `<p class="poll-result-summary">${poll.results.ballots.toLocaleString()} ballots cast. A question passes with ${POLL_APPROVAL_PERCENT}% Yes votes. Skips are excluded.</p>${poll.questions.map((question, index) => {
    const result = poll.results!.questions[question.id];
    if (!result) return '';
    const counted = result.yes + result.no, approval = result.approval;
    return `<section class="poll-result" aria-labelledby="poll-result-${index}"><h4 id="poll-result-${index}"><span>${index + 1}.</span> ${escape(question.text)}</h4>${question.description ? `<p>${escape(question.description)}</p>` : ''}${poll.ballot?.answers[question.id] ? `<p class="poll-answer">Your vote: <strong>${answerLabel(poll.ballot.answers[question.id])}</strong></p>` : ''}<div class="poll-result-verdict"><strong class="${counted && result.passed ? 'poll-passed' : 'poll-failed'}">${counted ? result.passed ? 'Passed' : 'Did not pass' : 'No deciding votes'}</strong><span>${approval === null ? 'No Yes or No votes' : `${approval.toFixed(1)}% Yes`}</span></div><div class="poll-result-bar" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, approval ?? 0))}%"></span></div><dl class="poll-result-counts"><div><dt>Yes</dt><dd>${result.yes.toLocaleString()}</dd></div><div><dt>No</dt><dd>${result.no.toLocaleString()}</dd></div><div><dt>Skipped</dt><dd>${result.skip.toLocaleString()}</dd></div></dl></section>`;
  }).join('')}`;
}

export function renderPollContents(view: PollBoothView, state: PollUIState): string {
  const poll = view.polls.find(row => row.id === state.selected), pollStatus = poll && status(poll, state.now);
  const answered = poll?.questions.filter(question => choices.includes(state.answers[question.id])).length ?? 0;
  const list = (['open', 'upcoming', 'closed'] as const).map(group => {
    const rows = view.polls.filter(row => status(row, state.now) === group).sort((a, b) => group === 'closed' ? b.closesAt - a.closesAt : a.opensAt - b.opensAt);
    return rows.length ? `<div class="poll-list-group"><h3>${{ open: 'Open for voting', upcoming: 'Coming soon', closed: 'Past polls' }[group]}</h3>${rows.map(row => `<button type="button" id="poll-select-${escape(row.id)}" data-poll-select="${escape(row.id)}" aria-pressed="${row.id === state.selected}" ${state.busy ? 'disabled' : ''}><strong>${escape(row.title)}</strong><span>${group === 'upcoming' ? 'Opens' : group === 'closed' ? 'Closed' : 'Closes'} ${stamp(group === 'upcoming' ? row.opensAt : row.closesAt)}</span>${row.ballot ? '<small>Ballot recorded</small>' : ''}</button>`).join('')}</div>` : '';
  }).join('');
  let content = '<div class="poll-empty"><span class="poll-seal" aria-hidden="true">' + icon('book') + '</span><h3>No polls posted yet</h3><p>When a community poll opens, read the proposals and cast your ballot here.</p><p>You can return to any town polling booth to check for new polls and read past results.</p></div>';
  if (poll) {
    const receipt = poll.ballot ? `<div class="poll-receipt" role="status">${icon('check')}<div><strong>Your ballot is recorded</strong><p>Submitted ${stamp(poll.ballot.submittedAt)}. Your vote is shared across all realms.</p></div></div>` : '';
    const ballot = `<div class="poll-questions">${poll.questions.map((question, index) => {
      const answer = poll.ballot?.answers[question.id] ?? state.answers[question.id];
      const readOnly = !!poll.ballot || state.review || pollStatus !== 'open';
      return `<fieldset class="poll-question" ${state.busy ? 'disabled' : ''}><legend><span>${index + 1}.</span> ${escape(question.text)}</legend>${question.description ? `<p>${escape(question.description)}</p>` : ''}${readOnly ? answer ? `<p class="poll-answer">${poll.ballot ? 'Your vote' : 'Your choice'}: <strong>${answerLabel(answer)}</strong></p>` : '' : `<div class="poll-choices">${choices.map(choice => `<label><input type="radio" id="poll-answer-${index}-${choice}" name="poll-question-${index}" data-poll-question="${escape(question.id)}" value="${choice}" ${answer === choice ? 'checked' : ''}><span>${answerLabel(choice)}</span></label>`).join('')}</div>`}</fieldset>`;
    }).join('')}</div>`;
    const actions = pollStatus === 'open' && !poll.ballot ? `<div class="poll-actions">${state.review ? `<div><strong>Review your ballot</strong><p>These choices are final once submitted.</p></div><button type="button" id="poll-edit" data-poll-edit ${state.busy ? 'disabled' : ''}>Edit choices</button><button type="button" id="poll-submit" class="poll-primary" data-poll-submit ${state.busy ? 'disabled' : ''}>${state.busy ? 'Recording ballot…' : 'Submit ballot'}</button>` : `<p id="poll-progress">${answered} of ${poll.questions.length} answered. Choose Skip for any question you wish to leave out.</p><button type="button" id="poll-review" class="poll-primary" data-poll-review ${!complete(poll, state.answers) || state.busy ? 'disabled' : ''}>Review ballot</button>`}</div>` : '';
    content = `<article class="poll-ballot"><header class="poll-ballot-heading"><span class="poll-state poll-state-${pollStatus}">${{ open: 'Voting open', upcoming: 'Opens soon', closed: 'Voting closed' }[pollStatus!]}</span><h3 id="poll-ballot-title" tabindex="-1">${escape(poll.title)}</h3><p class="poll-dates">${stamp(poll.opensAt)} <span aria-hidden="true">–</span> ${stamp(poll.closesAt)}</p><p class="poll-description">${escape(poll.description)}</p></header>${receipt}${pollStatus === 'closed' ? renderResults(poll) : ballot}${pollStatus === 'upcoming' ? `<p class="poll-message">Voting opens ${stamp(poll.opensAt)}. You can read the questions now.</p>` : ''}${pollStatus === 'open' ? '<p class="poll-private">Results stay hidden until voting closes.</p>' : ''}${actions}</article>`;
  }
  return `<header class="poll-heading">${icon('book')}<div><h2 id="poll-title">Community Polls</h2><p>Have your say in Mossvale’s future.</p></div><button type="button" id="poll-refresh" data-poll-refresh ${state.busy ? 'disabled' : ''}>Refresh</button><button type="button" id="poll-close" data-poll-close aria-label="Close community polls">${icon('close')}</button></header><div class="poll-body">${list ? `<nav class="poll-list" aria-label="Community polls">${list}</nav>` : ''}<div class="poll-content" data-poll-scroll>${content}</div></div><footer class="poll-footer"><p>One ballot per account. Votes are final. Questions pass at ${POLL_APPROVAL_PERCENT}% Yes, excluding skips.</p><p>Passing a poll does not make a feature available immediately.</p><p id="poll-status" role="status" aria-live="polite">${escape(state.notice || '')}</p></footer>`;
}

/** Ballots become receipts only after the server confirms their durable save. */
export function mountPollUI(options: { send: (message: ClientMessage) => void; getPlayer: () => Player | undefined; nearby: (boothId?: string) => boolean; onOpen?: () => void }) {
  const panel = document.createElement('section');
  panel.id = 'poll-window'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'false'); panel.setAttribute('aria-labelledby', 'poll-title');
  document.body.append(panel);
  let view: PollBoothView | undefined, selected = '', drafts: Record<string, Record<string, PollAnswer>> = {}, review = false, busy = false, notice = '', rendered = '', receivedAt = 0, nextChange = Infinity;
  let returnFocus: HTMLElement | null = null;
  const now = () => (view?.serverTime ?? Date.now()) + Date.now() - receivedAt;
  const allowed = (boothId = view?.boothId) => { const player = options.getPlayer(); return !!player && player.hp > 0 && options.nearby(boothId); };
  const current = () => view?.polls.find(poll => poll.id === selected);
  const answers = () => drafts[selected] ?? {};
  function close() {
    const restore = panel.contains(document.activeElement);
    panel.hidden = true; view = undefined; selected = ''; drafts = {}; review = false; busy = false; rendered = ''; panel.innerHTML = '';
    if (restore && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  }
  function render(focusId?: string) {
    if (!view || panel.hidden) return;
    if (!allowed()) { close(); return; }
    const time = now();
    nextChange = Math.min(Infinity, ...view.polls.flatMap(poll => [poll.opensAt, poll.closesAt]).filter(deadline => deadline > time));
    const html = renderPollContents(view, { selected, answers: answers(), review, busy, notice, now: time });
    if (html === rendered) return;
    const active = document.activeElement;
    const focused = focusId ?? (active instanceof HTMLElement && panel.contains(active) ? active.id : '');
    const scroll = panel.querySelector<HTMLElement>('[data-poll-scroll]')?.scrollTop ?? 0;
    const listScroll = panel.querySelector<HTMLElement>('.poll-list')?.scrollTop ?? 0;
    const bodyScroll = panel.querySelector<HTMLElement>('.poll-body')?.scrollTop ?? 0;
    rendered = html; panel.innerHTML = html;
    const content = panel.querySelector<HTMLElement>('[data-poll-scroll]'), list = panel.querySelector<HTMLElement>('.poll-list'), body = panel.querySelector<HTMLElement>('.poll-body');
    if (content) content.scrollTop = scroll;
    if (list) list.scrollTop = listScroll;
    if (body) body.scrollTop = bodyScroll;
    if (focused) [...panel.querySelectorAll<HTMLElement>('[id]')].find(element => element.id === focused)?.focus({ preventScroll: true });
  }
  function update(next: PollBoothView) {
    if (!allowed(next.boothId)) { close(); return; }
    if (panel.hidden && !next.open) return;
    const opening = panel.hidden;
    if (opening) {
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      options.onOpen?.(); panel.hidden = false; review = false; drafts = {};
    }
    view = next; receivedAt = Date.now(); busy = false; notice = next.reason || (next.submittedPollId ? 'Your ballot has been saved.' : '');
    if (!view.polls.some(poll => poll.id === selected)) {
      selected = view.polls.find(poll => poll.status === 'open' && !poll.ballot)?.id ?? view.polls.find(poll => poll.status === 'open')?.id ?? view.polls.find(poll => poll.status === 'upcoming')?.id ?? view.polls[0]?.id ?? '';
      review = false;
    }
    if (next.submittedPollId) { delete drafts[next.submittedPollId]; review = false; }
    render(opening ? 'poll-close' : undefined);
  }
  function requestRefresh() {
    if (!view || busy || !allowed()) return;
    busy = true; notice = 'Checking for the latest polls…'; render();
    options.send({ type: 'pollOpen', boothId: view.boothId });
  }
  panel.addEventListener('click', event => {
    event.stopPropagation();
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    if ('pollClose' in button.dataset) { close(); return; }
    if ('pollRefresh' in button.dataset) { requestRefresh(); return; }
    if (busy || !allowed()) return;
    if (button.dataset.pollSelect) {
      selected = button.dataset.pollSelect; review = false; notice = ''; render();
      const content = panel.querySelector<HTMLElement>('[data-poll-scroll]'); if (content) content.scrollTop = 0;
      return;
    }
    const poll = current();
    if (!poll || poll.ballot || status(poll, now()) !== 'open') return;
    if ('pollEdit' in button.dataset) { review = false; render('poll-answer-0-yes'); return; }
    if (!complete(poll, answers())) return;
    if ('pollReview' in button.dataset) { review = true; render('poll-submit'); return; }
    if ('pollSubmit' in button.dataset && review && view) {
      busy = true; notice = 'Saving your ballot…'; render();
      options.send({ type: 'pollVote', boothId: view.boothId, pollId: poll.id, answers: { ...answers() } });
    }
  });
  panel.addEventListener('change', event => {
    const input = event.target as HTMLInputElement, poll = current();
    if (!poll || busy || review || poll.ballot || status(poll, now()) !== 'open' || !allowed()) return;
    if (input.dataset.pollQuestion && poll.questions.some(question => question.id === input.dataset.pollQuestion) && choices.includes(input.value as PollAnswer)) {
      (drafts[selected] ??= {})[input.dataset.pollQuestion] = input.value as PollAnswer;
      notice = ''; render();
    }
  });
  panel.addEventListener('pointerdown', event => event.stopPropagation());
  panel.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); });
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    else if (['Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) event.stopPropagation();
  });
  // The game calls refresh every frame; ballot markup changes only at a poll deadline.
  function refresh() { if (!panel.hidden) { if (!allowed()) close(); else if (now() >= nextChange) render(); } }
  return { update, refresh, close, isOpen: () => !panel.hidden, reject(message: string) { if (panel.hidden) return; busy = false; notice = message; render(); }, dispose() { close(); panel.remove(); } };
}
