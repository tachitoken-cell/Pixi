import { id } from 'ethers';
import { createGoldRound, upsertGoldRoundBid, settleGoldRound } from './gold-rounds.ts';
import { goldEvent } from './gold-ledger.mjs';
import { insertGoldEvents } from './gold-migration.mjs';
import { TREASURE_MAX_CLAIMS, goldUsdAmountWei, treasureQuotes } from './treasure-rewards.ts';

const fail = message => { throw Object.assign(Error(message), { code: 'PLAYER_STORE_CONFLICT' }); };
const reserveId = round => id(`mossvale-gold-round:${round.id}`);
const activeAward = bid => !bid.claimed && BigInt(bid.payoutWei || '0') > 0n;
function freshPrice(price) {
  if (!price || !Number.isSafeInteger(price.observedAt) || price.observedAt <= 0 || Date.now() - price.observedAt > 90000
    || price.observedAt > Date.now() + 15000) fail('A fresh MOSS/USD price is required. Gold remains reserved until settlement can finish.');
  if (typeof price.usdWei !== 'string' || !/^[1-9]\d{0,77}$/.test(price.usdWei) || BigInt(price.usdWei) >= 2n ** 256n) fail('Invalid MOSS/USD price.');
  return { usdWei: price.usdWei, observedAt: price.observedAt };
}
const budgetMicros = round => (BigInt(round.budgetUsdCents) * 10000n).toString();
function fundingFor(round, funding) {
  const price = round.closingPrice || freshPrice(funding?.price), amountWei = goldUsdAmountWei(budgetMicros(round), price.usdWei);
  if (funding?.contract?.toLowerCase() !== round.contract.toLowerCase() || !round.closingPrice && funding.amountWei !== amountWei
    || !/^(?:0|[1-9]\d{0,77})$/.test(funding.capacityWei || '') || BigInt(funding.capacityWei) >= 2n ** 256n
    || !/^(?:0|[1-9]\d{0,77})$/.test(funding.balanceWei || '') || BigInt(funding.balanceWei) >= 2n ** 256n) fail('Invalid gold round funding quote.');
  return { price, amountWei };
}

/** Uses the player's permanent connection and transaction, so escrow and offers commit together. */
export function goldRoundStore({ query, enqueue, transaction, lockId, owned }) {
  // ponytail: one JSON offer book per round; split bids into rows if measured lock contention grows.
  const read = async roundId => (await query('SELECT state FROM mossvale_gold_rounds WHERE id=$1', [roundId])).rows[0]?.state;
  const write = round => query('UPDATE mossvale_gold_rounds SET state=$2::jsonb WHERE id=$1', [round.id, JSON.stringify(round)]);
  const treasuryLock = round => query('SELECT pg_advisory_xact_lock($1::bigint)', [lockId('treasury:' + round.contract.toLowerCase())]);
  async function locked(roundId) {
    const round = (await query('SELECT state FROM mossvale_gold_rounds WHERE id=$1 FOR UPDATE', [roundId])).rows[0]?.state;
    if (!round) fail('This gold round is unavailable.');
    return round;
  }
  async function guardClaimCapacity(key, player, extra = 0) {
    const rounds = (await query("SELECT state FROM mossvale_gold_rounds WHERE state->'bids' ? $1", [key])).rows;
    const reserved = rounds.filter(({ state }) => {
      const bid = state.bids[key];
      return bid.characterId === player.id && (state.status === 'open' || activeAward(bid));
    }).length;
    const authorizations = (player.treasureClaims || []).reduce((count, claim) => count + treasureQuotes(claim).length, 0);
    if (authorizations + reserved + extra > TREASURE_MAX_CLAIMS)
      fail('Your treasury history has no room for another payout. Finish your reserved gold round first or contact support.');
  }
  // Call only under the shared treasury lock, in the caller's transaction. Closing and settled reserves never reprice.
  async function revalueOpenRounds(contract, price) {
    const rounds = (await query("SELECT state FROM mossvale_gold_rounds WHERE state->>'status'='open' AND NOT (state ? 'closingPrice') AND lower(state->>'contract')=$1", [contract.toLowerCase()])).rows;
    if (!rounds.length) return;
    freshPrice(price);
    for (const { state } of rounds) await query('UPDATE mossvale_treasure_claims SET amount_wei=$2 WHERE claim_hash=$1',
      [reserveId(state), goldUsdAmountWei(budgetMicros(state), price.usdWei)]);
  }
  return {
    guardClaimCapacity, revalueOpenRounds,
    async initialize() {
      await query('CREATE TABLE IF NOT EXISTS mossvale_gold_rounds (id text PRIMARY KEY, state jsonb NOT NULL)');
    },
    goldRounds: accountKey => enqueue(async () => (await query(`SELECT state FROM mossvale_gold_rounds
      WHERE state->>'status'='open' OR ($1::text IS NOT NULL AND state->'bids' ? $1) ORDER BY (state->>'startsAt')::bigint DESC`, [accountKey || null])).rows.map(row => row.state)),
    openGoldRound: (terms, funding) => enqueue(() => transaction(async () => {
      const round = createGoldRound(terms);
      await query('SELECT pg_advisory_xact_lock($1::bigint)', [lockId('gold-round-opening')]);
      if ((await query("SELECT id FROM mossvale_gold_rounds WHERE state->>'status'='open'")).rows.length) fail('Finish the existing gold round first.');
      if (await read(round.id)) fail('This gold round already exists.');
      await treasuryLock(round);
      const { amountWei } = fundingFor(round, funding);
      const used = (await query('SELECT COALESCE(SUM(amount_wei),0)::text AS total FROM mossvale_treasure_claims WHERE contract=$1', [round.contract.toLowerCase()])).rows[0].total;
      if (BigInt(used) + BigInt(amountWei) > BigInt(funding.capacityWei) || BigInt(amountWei) > BigInt(funding.balanceWei)) fail('The treasury cannot cover this dollar budget and its existing payouts.');
      await query('INSERT INTO mossvale_treasure_claims(claim_hash,contract,amount_wei) VALUES($1,$2,$3)', [reserveId(round), round.contract.toLowerCase(), amountWei]);
      await query('INSERT INTO mossvale_gold_rounds(id,state) VALUES($1,$2::jsonb)', [round.id, JSON.stringify(round)]);
      return round;
    })),
    async guardDeletion(key, characterId) {
      const rounds = (await query("SELECT state FROM mossvale_gold_rounds WHERE state->'bids' ? $1", [key])).rows;
      if (rounds.some(({ state }) => {
        const bid = state.bids[key];
        return (!characterId || bid.characterId === characterId) && (state.status === 'open' || activeAward(bid));
      })) fail('Cancel your gold offer or collect your round payout before deleting this character or account.');
    },
    async apply(action, entries, projected, additions, reservation) {
      const entry = entries.find(entry => entry.key === action.accountKey), row = projected.find(row => row.account_key === action.accountKey);
      const before = entry?.expected?.characters.find(player => player.id === action.characterId);
      const after = row?.state.characters.find(player => player.id === action.characterId);
      if (!before || !after || !owned.has(action.accountKey)) fail('Only the active character can change its gold offer.');
      const round = await locked(action.roundId), old = round.bids[action.accountKey];
      if (old && old.characterId !== action.characterId) fail('Use the character that placed this account’s offer.');
      if (action.kind === 'claim') {
        const claim = additions[0]?.claim;
        if (round.status !== 'settled' || !old || !activeAward(old) || additions.length !== 1 || !reservation
          || claim?.goldRoundId !== round.id || claim.characterId !== old.characterId || claim.wallet.toLowerCase() !== old.wallet.toLowerCase()
          || claim.realmId !== old.realmId || claim.contract.toLowerCase() !== round.contract.toLowerCase() || claim.amountWei !== old.payoutWei
          || before.gold !== after.gold - (row.credits[after.id] || 0)) fail('The payout does not match the saved gold award.');
        await treasuryLock(round);
        const remaining = (await query('SELECT amount_wei::text AS amount FROM mossvale_treasure_claims WHERE claim_hash=$1 FOR UPDATE', [reserveId(round)])).rows[0]?.amount;
        if (!remaining || BigInt(remaining) < BigInt(old.payoutWei)) fail('The gold award reservation is unavailable.');
        if (remaining === old.payoutWei) await query('DELETE FROM mossvale_treasure_claims WHERE claim_hash=$1', [reserveId(round)]);
        else await query('UPDATE mossvale_treasure_claims SET amount_wei=amount_wei-$2 WHERE claim_hash=$1', [reserveId(round), old.payoutWei]);
        old.claimed = true; old.claimId = claim.id;
        await write(round);
        return 0n;
      }
      if (!['offer', 'cancel'].includes(action.kind) || reservation || additions.length) fail('Invalid gold offer action.');
      if (round.status !== 'open' || Date.now() < round.startsAt || Date.now() >= round.endsAt) fail('This gold round has closed.');
      const gold = action.kind === 'cancel' ? 0 : action.gold;
      if (!Number.isSafeInteger(gold) || gold < 0 || action.kind === 'cancel' && !old) fail('No saved offer to cancel.');
      if (before.gold - (after.gold - (row.credits[after.id] || 0)) !== gold - (old?.gold || 0)) fail('The gold escrow does not match this offer.');
      if (action.kind === 'cancel') { delete round.bids[action.accountKey]; await write(round); }
      else {
        await guardClaimCapacity(action.accountKey, after, old ? 0 : 1);
        if (before.auctionWallet?.toLowerCase() !== action.wallet?.toLowerCase() || after.auctionWallet?.toLowerCase() !== action.wallet?.toLowerCase()) fail('Your linked wallet changed.');
        const next = upsertGoldRoundBid(round, action.accountKey, { characterId: after.id, wallet: action.wallet, realmId: action.realmId, gold, priceCentsPer1000: action.priceCentsPer1000 }, Date.now());
        await write(next);
      }
      return BigInt(gold) - BigInt(old?.gold || 0);
    },
    settleGoldRounds: funding => enqueue(async () => {
      const due = (await query("SELECT state FROM mossvale_gold_rounds WHERE state->>'status'='open' AND (state->>'endsAt')::bigint <= $1 AND id=$2", [Date.now(), funding?.roundId || ''])).rows;
      let count = 0;
      for (const candidate of due) {
        // Persist the first verified closing price even if funding needs a later top-up.
        // This transaction changes no player gold; funding retries cannot reprice winners.
        await transaction(async () => {
          const round = await locked(candidate.state.id);
          if (round.status !== 'open' || round.closingPrice) return;
          await treasuryLock(round);
          const { price, amountWei } = fundingFor(round, funding);
          round.closingPrice = price;
          await query('UPDATE mossvale_treasure_claims SET amount_wei=$2 WHERE claim_hash=$1', [reserveId(round), amountWei]);
          await write(round);
        });
        await transaction(async () => {
        // All writers acquire player rows before the round, in the same order as commit().
        const keys = Object.keys(candidate.state.bids).sort();
        const rows = (await query('SELECT account_key,state,pending_credits FROM mossvale_players WHERE account_key=ANY($1::text[]) ORDER BY account_key FOR UPDATE', [keys])).rows;
        const round = await locked(candidate.state.id);
        if (round.status !== 'open') return;
        if (Object.keys(round.bids).some(key => !keys.includes(key))) return; // A just-committed offer is picked up on the next tick.
        const settled = settleGoldRound(round, Date.now()), events = [];
        await treasuryLock(round);
        const { price, amountWei } = fundingFor(round, funding);
        const used = (await query('SELECT COALESCE(SUM(amount_wei),0)::text AS total FROM mossvale_treasure_claims WHERE contract=$1', [round.contract.toLowerCase()])).rows[0].total;
        settled.settlementPrice = price; settled.budgetWei = amountWei;
        for (const bid of Object.values(settled.bids)) bid.payoutWei = bid.filledGold ? goldUsdAmountWei(bid.payoutUsdMicros, price.usdWei) : '0';
        const spent = Object.values(settled.bids).reduce((sum, bid) => sum + BigInt(bid.payoutWei), 0n);
        if (BigInt(used) - BigInt(amountWei) + spent > BigInt(funding.capacityWei) || spent > BigInt(funding.balanceWei))
          fail('The treasury needs more MOSS for the winning dollar offers. Gold stays reserved until it is funded.');
        for (const [key, bid] of Object.entries(settled.bids)) {
          const row = rows.find(row => row.account_key === key), player = row?.state.characters.find(player => player.id === bid.characterId);
          if (!player) fail('A gold offer owner is missing; settlement needs recovery.');
          const refund = bid.gold - bid.filledGold, pending = row.pending_credits, credits = (pending[bid.characterId] || 0) + refund;
          if (!Number.isSafeInteger(credits)) fail('A gold refund exceeds the supported balance.');
          if (refund) {
            pending[bid.characterId] = credits;
            await query('UPDATE mossvale_players SET pending_credits=$2::jsonb WHERE account_key=$1', [key, JSON.stringify(pending)]);
            await query("SELECT pg_notify('mossvale_players_changed',$1)", [key]);
          }
          bid.refunded = true;
          if (bid.filledGold) events.push(goldEvent(bid.characterId, 'merchant:buyback', -bid.filledGold));
        }
        if (spent) await query('UPDATE mossvale_treasure_claims SET amount_wei=$2 WHERE claim_hash=$1', [reserveId(round), spent.toString()]);
        else await query('DELETE FROM mossvale_treasure_claims WHERE claim_hash=$1', [reserveId(round)]);
        await insertGoldEvents(query, events);
        await write(settled); count++;
        });
      }
      return count;
    }),
  };
}
