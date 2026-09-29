import { icon } from './icons';
import { ARENA_INITIAL_RATING, arenaRank } from './arena';
import { arenaWagerAmount, arenaWagerSummary } from './arena-wager';
import type { Player, PartyState, ArenaQueueState, ArenaSize } from './shared';

export interface ArenaMenuOptions {
  player: Player;
  players: Player[];
  party: PartyState | null;
  queue: ArenaQueueState | null;
  wagerMoss?: string;
  native?: boolean;
  queueReason: (size: ArenaSize) => string;
  challengeReason: (other: Player, size: ArenaSize) => string;
  duelReason: (other: Player) => string;
}

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

export function renderArenaMenu(options: ArenaMenuOptions): string {
  const { player, party, queue } = options;
  const wagerDraft=options.native?'0':options.wagerMoss??'0',stake=arenaWagerAmount(wagerDraft),summary=stake!==null&&stake>0n?arenaWagerSummary(stake):null;
  const wagerReason=stake===null?'Enter a MOSS amount up to 999999 with up to 18 decimal places.':'';
  const candidates = options.players.filter(other => other.id !== player.id)
    .sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z));
  const records=([1,2,3] as const).map(size=>player.arenaRatings?.[size]);
  const bestRating=Math.max(...records.map(record=>record?.rating??ARENA_INITIAL_RATING));
  const wins=records.reduce((sum,record)=>sum+(record?.wins??0),0),losses=records.reduce((sum,record)=>sum+(record?.losses??0),0),draws=records.reduce((sum,record)=>sum+(record?.draws??0),0);
  const nextRank=[1200,1400,1600,1800,2000].find(rating=>rating>bestRating),rankStart=nextRank?nextRank-200:2000;
  return `<section class="arena-finder" aria-label="Arena finder">
    <header class="arena-overview"><div class="arena-rank-emblem" aria-hidden="true">${icon('sword')}</div><div><span class="eyebrow">YOUR HIGHEST BRACKET</span><h3>${escape(arenaRank(bestRating))}</h3><strong>${bestRating} <small>MMR</small></strong><p>${wins} wins · ${losses} losses${draws?` · ${draws} draws`:''}</p></div></header>
    <div class="arena-rank-progress"><label for="arena-rank-meter">${nextRank?`${nextRank-bestRating} MMR to ${arenaRank(nextRank)}`:'Master rank reached'}</label><progress id="arena-rank-meter" max="200" value="${nextRank?Math.max(0,bestRating-rankStart):200}"></progress></div>
    <section class="arena-finder-search" aria-labelledby="arena-finder-search-title">
      <div class="arena-finder-heading">${icon('sword')}<h3 id="arena-finder-search-title">Rated arena</h3></div>
      <div class="arena-finder-brackets">${([1, 2, 3] as const).map(size => {
        const record = player.arenaRatings?.[String(size) as '1' | '2' | '3'];
        const rating = record?.rating ?? ARENA_INITIAL_RATING, rank = arenaRank(rating), active = queue?.size === size;
        const reason = queue ? active ? '' : 'Leave your current queue to change brackets.' : options.queueReason(size);
        return `<article class="arena-finder-bracket${active ? ' is-searching' : ''}" aria-label="${size === 1 ? 'Solo' : `${size}v${size}`} arena">
          <div class="arena-finder-bracket-name"><h3>${size === 1 ? 'Solo' : `${size}v${size}`}</h3></div>
          <div class="arena-finder-rating"><strong>${rating} <span>MMR</span></strong><small>${escape(rank)}</small></div>
          <button type="button" class="primary-button" data-arena-queue="${active ? 'leave' : 'join'}" data-arena-size="${size}" aria-label="${active ? 'Leave' : 'Find'} ${size === 1 ? 'Solo 1v1' : `${size}v${size}`} ${active ? 'queue' : 'match'}" aria-describedby="arena-bracket-status-${size}" ${reason ? 'disabled' : ''}>${active ? 'Leave queue' : 'Find match'}</button>
          <small class="arena-finder-record">${record?.wins ?? 0} wins · ${record?.losses ?? 0} losses${record?.draws ? ` · ${record.draws} ${record.draws === 1 ? 'draw' : 'draws'}` : ''}</small>
          <small class="arena-finder-bracket-status" id="arena-bracket-status-${size}" role="status" aria-live="polite">${active ? `Searching · ${queue.rating} ${size === 1 ? 'MMR' : 'team MMR'}` : escape(reason)}</small>
        </article>`;
      }).join('')}</div>
    </section>
    <footer class="arena-finder-party"><button type="button" class="primary-button" data-open-party>${icon('invite')} ${party ? 'Manage party' : 'Form a party'}</button></footer>
    <section class="arena-finder-roster" aria-labelledby="arena-finder-challenge-title">
      <div class="arena-finder-section-heading"><h3 id="arena-finder-challenge-title">Unrated challenges</h3><span>${candidates.length} nearby</span></div>
      ${options.native?'':`<label class="arena-finder-wager" for="arena-wager-moss">1v1 stake per player (MOSS)<input id="arena-wager-moss" type="text" inputmode="decimal" maxlength="25" value="${escape(wagerDraft)}" aria-describedby="arena-wager-summary"></label><p id="arena-wager-summary" class="arena-finder-hint" role="status" aria-live="polite"${summary||wagerReason?'':' hidden'}>${escape(wagerReason||(summary?`${summary.stake} MOSS each · Pot ${summary.pot} · Winner ${summary.payout} · Tax ${summary.tax} (5%).`:''))}</p><button type="button" data-arena-wagers>MOSS wagers & payouts</button>`}
      <div class="arena-finder-players" tabindex="0" aria-label="Nearby players">${candidates.map((other, index) => {
        const duel = options.duelReason(other), id = escape(other.id), name = escape(other.name);
        return `<article class="arena-finder-player" aria-labelledby="arena-finder-player-${index}">
          <header><strong id="arena-finder-player-${index}" translate="no">${name}</strong><small>Level ${other.level} ${escape(other.appearance.className)}</small></header>
          <div class="arena-finder-challenges">${([1, 2, 3] as const).map(size => {
            const reason = options.challengeReason(other, size) || (size === 1 ? wagerReason : ''), reasonId = `arena-finder-reason-${index}-${size}`;
            return `<div><button type="button" class="primary-button" data-arena-challenge="${id}" data-arena-size="${size}" aria-label="Challenge ${name} to arena ${size}v${size}${size===1&&summary?` for ${summary.stake} MOSS each`: ''}" ${reason ? `disabled aria-describedby="${reasonId}"` : ''}>${size}v${size}</button>${reason ? `<small id="${reasonId}">${escape(reason)}</small>` : ''}</div>`;
          }).join('')}</div>
          <div class="arena-finder-duel"><button type="button" class="adventure-link" data-arena-duel="${id}" aria-label="Duel ${name}" ${duel ? `disabled aria-describedby="arena-finder-duel-reason-${index}"` : ''}>Duel</button>${duel ? `<small id="arena-finder-duel-reason-${index}">${escape(duel)}</small>` : ''}</div>
        </article>`;
      }).join('') || '<p class="arena-finder-empty">No nearby players.</p>'}</div>
    </section>
  </section>`;
}
