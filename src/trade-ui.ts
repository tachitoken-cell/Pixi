import type { ClientMessage, Player, TradeOffer, TradeState } from './shared';
import { gearById, gearIdValid, starterGear } from './progression';
import { gearArt, gearBonuses } from './character-ui';
import { gearLootQuality } from './loot-items';
import { itemLocked } from './item-locks';
import { icon } from './icons';

const resources = {
  wood: { label: 'Wood', icon: 'wood' },
  crystal: { label: 'Lantern fragments', icon: 'crystal' },
  potion: { label: 'Healing potions', icon: 'potion' },
  herb: { label: 'Wild herbs', icon: 'leaf' },
  relic: { label: 'Rootvault relics', icon: 'heartroot' },
} as const;
type Resource = keyof typeof resources;
const resourceIds = Object.keys(resources) as Resource[];
const starterIds = new Set(['Ranger', 'Knight', 'Mage', 'Cleric'].flatMap(name => starterGear(name as Player['appearance']['className']).ownedGear));
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const number = (value: number) => value.toLocaleString('en-US');
const sameOffer = (a: TradeOffer, b: TradeOffer) => a.gold === b.gold && resourceIds.every(id => (a.items[id] || 0) === (b.items[id] || 0)) && [...a.gear].sort().join('\n') === [...b.gear].sort().join('\n');
const hasOffer = (offer: TradeOffer) => offer.gold > 0 || offer.gear.length > 0 || resourceIds.some(id => (offer.items[id] || 0) > 0);
const tradableGear = (player: Player) => player.ownedGear.filter(id => gearIdValid(id) && !itemLocked(player,id) && !starterIds.has(id) && !Object.values(player.equipment).includes(id));

/** A floating, server-confirmed trade window. Opening it never pauses the world. */
export function mountTradeUI(options: { send: (message: ClientMessage) => void; getPlayer: () => Player | undefined; onOpen: () => void }) {
  const panel = document.createElement('section');
  panel.id = 'trade-window';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-labelledby', 'trade-title');
  panel.hidden = true;
  document.body.append(panel);
  const resultNotice = document.createElement('div');
  resultNotice.id = 'trade-notice'; resultNotice.className = 'toast';
  resultNotice.setAttribute('role', 'status'); resultNotice.setAttribute('aria-live', 'polite'); resultNotice.hidden = true;
  document.body.append(resultNotice);
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  let trade: TradeState | null = null;
  let pendingOffer: TradeOffer | null = null;
  let pendingAccept = false;
  let pendingResponse = false;
  let edited = false;
  let review = false;
  let notice = '';
  let gearKey = '';
  let dismissedId: string | null = null;
  let previousFocus: HTMLElement | null = null;
  let disposed = false;
  const query = <T extends HTMLElement = HTMLElement>(selector: string) => panel.querySelector<T>(selector)!;
  const ownParticipant = () => trade?.participants.find(person => person.id === options.getPlayer()?.id);
  const otherParticipant = () => trade?.participants.find(person => person.id !== options.getPlayer()?.id);
  const setText = (selector: string, text: string) => { const node = query(selector); if (node && node.textContent !== text) node.textContent = text; };
  const quantity = (name: string) => Number(query<HTMLInputElement>(`[name="${name}"]`).value.trim() || 0);
  const readOffer = (): TradeOffer => ({
    gold: quantity('gold'),
    items: Object.fromEntries(resourceIds.map(id => [id, quantity(id)]).filter(([, value]) => value !== 0)),
    gear: [...panel.querySelectorAll<HTMLInputElement>('[data-trade-gear]')].filter(input => input.checked).map(input => input.dataset.tradeGear!),
  });
  const validation = (offer: TradeOffer) => {
    const player = options.getPlayer();
    if (!player || player.hp <= 0) return 'You must be alive to trade.';
    if (![offer.gold, ...Object.values(offer.items)].every(value => Number.isSafeInteger(value) && value >= 0)) return 'Use whole quantities of zero or more.';
    if (resourceIds.some(id => (offer.items[id] || 0) > 0 && itemLocked(player,id))) return 'Unlock protected supplies in your bags before trading them.';
    if (offer.gold > player.gold) return 'You do not have that much gold.';
    for (const id of resourceIds) if ((offer.items[id] || 0) > player.inventory[id]) return `Not enough ${resources[id].label.toLowerCase()} in your bag.`;
    const available = tradableGear(player);
    if (offer.gear.some(id => !available.includes(id))) return 'Offered equipment must still be unequipped in your bag.';
    return '';
  };
  function renderGearChoices(selected: string[] = readOffer().gear) {
    const player = options.getPlayer();
    if (!player) return;
    const available = tradableGear(player), nextKey = available.join('\n');
    if (nextKey === gearKey) return;
    gearKey = nextKey;
    const focusedId = (document.activeElement as HTMLElement | null)?.dataset.tradeGear;
    query('#trade-gear').innerHTML = available.length ? available.map(id => { const gear=gearById(id)!;return `<label class="trade-gear-choice quality-${gearLootQuality(gear)}" data-item-tooltip="${escape(id)}"><input type="checkbox" data-trade-gear="${escape(id)}" data-item-tooltip="${escape(id)}" ${selected.includes(id) ? 'checked' : ''}>${gearArt(gear)}<span>${escape(gear.label)}<small>Level ${gear.requiredLevel}${gear.className ? ` · ${gear.className}` : ''} · ${gearLootQuality(gear)}<br>${gearBonuses(gear.stats)}</small></span></label>`;}).join('') : '<p class="trade-note">No spare equipment in your bag.</p>';
    if (focusedId) [...panel.querySelectorAll<HTMLInputElement>('[data-trade-gear]')].find(input => input.dataset.tradeGear === focusedId)?.focus();
  }
  function fillOffer(offer: TradeOffer) {
    const gold = query<HTMLInputElement>('[name="gold"]');
    if (gold.value !== String(offer.gold)) gold.value = String(offer.gold);
    for (const id of resourceIds) { const field = query<HTMLInputElement>(`[name="${id}"]`), value = String(offer.items[id] || 0); if (field.value !== value) field.value = value; }
    for (const input of panel.querySelectorAll<HTMLInputElement>('[data-trade-gear]')) input.checked = offer.gear.includes(input.dataset.tradeGear!);
  }
  function renderOther(offer: TradeOffer) {
    const rows = [`<li tabindex="0" data-item-tooltip="gold">${icon('gold')}<span>Gold</span><strong>${number(offer.gold)}</strong></li>`];
    for (const id of resourceIds) if (offer.items[id]) rows.push(`<li tabindex="0" data-item-tooltip="${id}">${icon(resources[id].icon)}<span>${resources[id].label}</span><strong>${number(offer.items[id]!)}</strong></li>`);
    for (const id of offer.gear) {const gear=gearById(id);if(gear)rows.push(`<li class="quality-${gearLootQuality(gear)}" tabindex="0" data-item-tooltip="${escape(id)}">${gearArt(gear)}<span>${escape(gear.label)}<small>Level ${gear.requiredLevel}${gear.className ? ` · ${gear.className}` : ''} · ${gearLootQuality(gear)}<br>${gearBonuses(gear.stats)}</small></span><strong>1</strong></li>`);}
    query('#trade-other-offer').innerHTML = rows.join('');
    setText('#trade-other-empty', !offer.gold && !offer.gear.length && !resourceIds.some(id => offer.items[id]) ? 'Nothing offered yet.' : '');
  }
  function refreshControls() {
    if (!trade || panel.hidden) return;
    if (trade.status === 'invited') {
      query<HTMLButtonElement>('[data-trade-action="respond"]').disabled = pendingResponse;
      setText('#trade-status', notice || (pendingResponse ? 'Waiting for the trade to open…' : ''));
      return;
    }
    const player = options.getPlayer(), own = ownParticipant();
    if (!player || !own) return;
    for (const id of ['gold', ...resourceIds]) {
      const balance = id === 'gold' ? player.gold : player.inventory[id as Resource];
      const input = query<HTMLInputElement>(`[name="${id}"]`);
      input.max = String(balance);
      input.disabled = !!pendingOffer || pendingAccept || own.accepted;
      setText(`[data-trade-balance="${id}"]`, `${number(balance)} available`);
    }
    for (const input of panel.querySelectorAll<HTMLInputElement>('[data-trade-gear]')) input.disabled = !!pendingOffer || pendingAccept || own.accepted;
    const offer = readOffer(), dirty = edited || !sameOffer(offer, own.offer), error = validation(offer);
    const empty = !trade.participants.some(person => hasOffer(person.offer));
    const publishButton = query<HTMLButtonElement>('[data-trade-action="publish"]');
    publishButton.hidden = own.accepted;
    publishButton.disabled = !dirty || !!error || !!pendingOffer || pendingAccept || own.accepted;
    const reviseButton = query<HTMLButtonElement>('[data-trade-action="revise"]');
    reviseButton.hidden = !own.accepted;
    reviseButton.disabled = !!pendingOffer || pendingAccept || !!otherParticipant()?.accepted;
    const accept = query<HTMLButtonElement>('[data-trade-action="accept"]');
    accept.disabled = empty || dirty || !!error || !!pendingOffer || pendingAccept || own.accepted;
    accept.textContent = own.accepted ? 'Accepted · waiting' : pendingAccept ? 'Confirming acceptance…' : 'Accept trade';
    setText('#trade-own-approved', own.accepted ? 'You accepted this offer' : 'You have not accepted');
    setText('#trade-other-approved', otherParticipant()?.accepted ? 'Trade partner accepted' : 'Waiting for their acceptance');
    setText('#trade-status', notice || error || (pendingOffer ? 'Publishing your offer…' : dirty ? 'Unpublished changes. Update your offer before accepting.' : empty ? 'Add gold, supplies or equipment before accepting.' : review ? 'Offers changed. Review both sides before accepting.' : 'Review both offers. The exchange happens after you both accept.'));
    panel.dataset.review = String(review || dirty);
  }
  function paint() {
    if (!trade) return;
    const invited = trade.status === 'invited', incoming = trade.inviterId !== options.getPlayer()?.id;
    panel.innerHTML = `<header class="trade-heading">${icon('trade')}<div><h2 id="trade-title" tabindex="-1">Player trade</h2><p id="trade-partner"></p></div><button type="button" data-trade-action="cancel" aria-label="Cancel trade and close">${icon('close')}</button></header>${invited ? `<div class="trade-invitation"><p id="trade-invitation-text"></p><button type="button" class="primary-button" data-trade-action="respond" ${incoming ? '' : 'hidden'}>Accept invitation</button><button type="button" class="trade-cancel" data-trade-action="${incoming ? 'decline' : 'cancel'}">${incoming ? 'Decline' : 'Cancel invitation'}</button></div>` : `<div class="trade-columns"><section class="trade-own" aria-labelledby="trade-own-title"><h3 id="trade-own-title">Your offer</h3><form id="trade-offer-form" novalidate>${['gold', ...resourceIds].map(id => `<label class="trade-quantity" data-item-tooltip="${id}">${icon(id === 'gold' ? 'gold' : resources[id as Resource].icon)}<span>${id === 'gold' ? 'Gold' : resources[id as Resource].label}<small data-trade-balance="${id}"></small></span><input type="number" inputmode="numeric" min="0" step="1" name="${id}" data-item-tooltip="${id}" value="0" aria-label="${id === 'gold' ? 'Gold' : resources[id as Resource].label} to offer"></label>`).join('')}<details class="trade-equipment"><summary>Equipment from your bag</summary><p class="trade-note">Unequipped gear only. Your partner must be able to equip it.</p><div id="trade-gear"></div></details><button type="submit" class="primary-button" data-trade-action="publish">Update offer</button><button type="button" class="primary-button" data-trade-action="revise" hidden>Change offer</button></form><p class="trade-approval" id="trade-own-approved"></p></section><section class="trade-theirs" aria-labelledby="trade-other-title"><h3 id="trade-other-title"></h3><ul id="trade-other-offer"></ul><p class="trade-note" id="trade-other-empty"></p><p class="trade-approval" id="trade-other-approved"></p></section></div><div class="trade-review"><footer class="trade-actions"><button type="button" class="primary-button" data-trade-action="accept" disabled>Accept trade</button><button type="button" class="trade-cancel" data-trade-action="cancel">Cancel trade</button></footer>`}<p id="trade-status" role="status" aria-live="polite"></p>${invited ? '' : '</div>'}`;
    setText('#trade-partner', otherParticipant()?.name || 'Adventurer');
    if (invited) setText('#trade-invitation-text', incoming ? `${otherParticipant()?.name || 'An adventurer'} would like to trade with you.` : `Waiting for ${otherParticipant()?.name || 'your partner'} to accept your invitation.`);
    else {
      setText('#trade-other-title', `${otherParticipant()?.name || 'Their'} offer`);
      gearKey = '\0';
      renderGearChoices(ownParticipant()!.offer.gear);
      fillOffer(ownParticipant()!.offer);
      renderOther(otherParticipant()!.offer);
    }
    refreshControls();
  }
  function showResult(reason: string) {
    clearTimeout(noticeTimer);
    resultNotice.textContent = reason; resultNotice.hidden = false;
    noticeTimer = setTimeout(() => { resultNotice.hidden = true; }, 5500);
  }
  function hide() {
    panel.hidden = true;
    trade = null;
    pendingOffer = null;
    pendingAccept = pendingResponse = edited = review = false;
    if (panel.contains(document.activeElement)) previousFocus?.isConnected && previousFocus.focus();
  }
  function close() {
    if (trade) { dismissedId = trade.id; options.send({ type: 'tradeCancel', tradeId: trade.id }); }
    hide();
  }
  function publish() {
    if (!trade || trade.status !== 'open' || pendingOffer) return;
    const offer = readOffer(), error = validation(offer), own = ownParticipant();
    if (!own || own.accepted || pendingAccept) return;
    if (error) { notice = error; refreshControls(); return; }
    if (sameOffer(offer, own.offer) && !edited) return;
    pendingOffer = offer;
    notice = '';
    pendingAccept = false;
    refreshControls();
    options.send({ type: 'tradeOffer', tradeId: trade.id, offer });
  }
  function click(event: MouseEvent) {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-trade-action]');
    if (!button || button.disabled || !trade) return;
    const action = button.dataset.tradeAction;
    if (action === 'cancel') close();
    else if (action === 'decline') { options.send({ type: 'tradeRespond', tradeId: trade.id, accept: false }); dismissedId = trade.id; hide(); }
    else if (action === 'respond' && trade.status === 'invited') {
      pendingResponse = true; notice = ''; refreshControls();
      options.send({ type: 'tradeRespond', tradeId: trade.id, accept: true });
    } else if (action === 'revise' && trade.status === 'open' && ownParticipant()?.accepted && !otherParticipant()?.accepted && !pendingOffer) {
      // Revoke approval on the server before allowing any local terms to change.
      pendingOffer = ownParticipant()!.offer; notice = ''; refreshControls();
      options.send({ type: 'tradeOffer', tradeId: trade.id, offer: pendingOffer });
    } else if (action === 'accept' && trade.status === 'open') {
      // Recheck the current character and quantities at the moment of acceptance.
      const own = ownParticipant(), offer = readOffer(), error = validation(offer);
      if (!own || !trade.participants.some(person => hasOffer(person.offer)) || error || edited || pendingOffer || pendingAccept || own.accepted || !sameOffer(offer, own.offer)) { notice = error; refreshControls(); return; }
      pendingAccept = true; notice = ''; refreshControls();
      options.send({ type: 'tradeAccept', tradeId: trade.id, revision: trade.revision });
    }
  }
  function input() { if (trade?.status === 'open') { edited = true; notice = ''; refreshControls(); } }
  function submit(event: Event) { event.preventDefault(); publish(); }
  function key(event: KeyboardEvent) { if (event.key === 'Escape') { event.preventDefault(); close(); } event.stopPropagation(); }
  const stop = (event: Event) => event.stopPropagation();
  panel.addEventListener('click', click);
  panel.addEventListener('input', input);
  panel.addEventListener('change', input);
  panel.addEventListener('submit', submit);
  panel.addEventListener('keydown', key);
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'wheel', 'keyup', 'dragstart', 'dragover', 'drop']) panel.addEventListener(type, stop);
  return {
    update(next: TradeState | null, reason?: string) {
      if (disposed) return;
      if (!next) { dismissedId = null; hide(); if (reason) showResult(reason); return; }
      if (next.id === dismissedId) return;
      const player = options.getPlayer();
      if (!player || !next.participants.some(person => person.id === player.id) || next.participants.length !== 2) { hide(); return; }
      const fresh = !trade || trade.id !== next.id || trade.status !== next.status;
      if (!fresh && next.revision < trade!.revision) return;
      const changed = !fresh && next.revision !== trade!.revision;
      const own = next.participants.find(person => person.id === player.id)!;
      if (fresh) {
        if (panel.hidden) previousFocus = document.activeElement as HTMLElement | null;
        resultNotice.hidden = true; clearTimeout(noticeTimer);
        pendingOffer = null; pendingAccept = pendingResponse = edited = review = false;
      } else if (pendingOffer && sameOffer(pendingOffer, own.offer) && changed) {
        pendingOffer = null; edited = false;
      } else if (reason) pendingOffer = null;
      if (changed) { review = true; pendingAccept = false; }
      if (own.accepted || reason) pendingAccept = false;
      if (reason) pendingResponse = false;
      notice = reason || '';
      trade = next;
      panel.hidden = false;
      if (fresh) { paint(); options.onOpen(); query('#trade-title').focus(); }
      else if (next.status === 'open') {
        renderGearChoices();
        if (!edited && !pendingOffer) fillOffer(own.offer);
        renderOther(otherParticipant()!.offer);
        refreshControls();
      } else refreshControls();
    },
    refresh() {
      if (disposed || !trade || panel.hidden) return;
      if (!ownParticipant()) { close(); return; }
      if (trade.status === 'open') renderGearChoices();
      refreshControls();
    },
    close,
    dispose() {
      if (disposed) return;
      close(); disposed = true;
      panel.removeEventListener('click', click); panel.removeEventListener('input', input); panel.removeEventListener('change', input);
      panel.removeEventListener('submit', submit); panel.removeEventListener('keydown', key);
      for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'wheel', 'keyup', 'dragstart', 'dragover', 'drop']) panel.removeEventListener(type, stop);
      panel.remove(); clearTimeout(noticeTimer); resultNotice.remove();
    },
  };
}
