import { randomUUID } from 'node:crypto';

const integer = n => Number.isSafeInteger(n) && n >= 0;
const uuid = s => typeof s === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s);
export function goldEventValid(event) {
  return !!event && uuid(event.id) && uuid(event.characterId) && integer(event.at) && event.at > 0
    && typeof event.reason === 'string' && /^[a-z][a-z0-9:_-]{0,63}$/.test(event.reason)
    && ['created', 'burned', 'transferred'].every(key => integer(event[key]));
}
export function goldEvent(characterId, reason, delta = 0, amounts) {
  if (!Number.isSafeInteger(delta)) throw Error('Invalid gold movement.');
  const transfer = /^(transfer|escrow):/.test(reason || '');
  const event = { id: randomUUID(), at: Date.now(), characterId, reason,
    created: transfer ? 0 : Math.max(0, delta), burned: transfer ? 0 : Math.max(0, -delta), transferred: reason?.startsWith('escrow:') ? Math.abs(delta) : 0, ...amounts };
  if (!goldEventValid(event)) throw Error('Invalid gold accounting event.');
  return event;
}

/** Reserved gold and pending delivery still belong to the game economy. */
export function goldSupply(account, pending = {}) {
  let total = 0n;
  const ids = new Set(account.characters.map(player => player.id));
  for (const [id, amount] of Object.entries(pending)) {
    if (!ids.has(id) || !integer(amount)) throw Error('Invalid pending gold.');
    total += BigInt(amount);
  }
  for (const player of account.characters) {
    if (!integer(player.gold)) throw Error('Invalid character gold.');
    total += BigInt(player.gold);
    for (const listing of player.auctions || []) if (listing.item.kind === 'gold') {
      if (!integer(listing.item.quantity)) throw Error('Invalid gold escrow.');
      total += BigInt(listing.item.quantity);
    }
  }
  return total;
}
