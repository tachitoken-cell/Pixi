# Gold merchant rounds

The merchant runs a reverse auction with a **fixed $1,000 USD budget** and a **four-hour deadline**. Players submit one editable offer per account: how much gold to sell and their asking price per 1,000 gold. During bidding, the estimated MOSS requirement moves with MOSS/USD. **At closing, the first fresh, verified MOSS/USD price locks every winning dollar payout into MOSS; funding delays and later claims cannot change that conversion.**

For example, $1,000 requires 50,000 MOSS at $0.02/MOSS, or 100,000 MOSS at $0.01/MOSS. A price change during bidding changes the MOSS needed, not the dollar budget or which gold offers win. Claiming later never reprices the saved settlement.

Start with a provisional **maximum ask of $1 per 1,000 gold**. Competition establishes the actual accepted rates below that ceiling. The budget funds one round, not an automatic payment every four hours. A smaller funded pilot can test participation before any repeating schedule.

## Why this ceiling

The $1 per 1,000 gold ceiling is a provisional treasury spending policy, **not a measured fair market price or a guaranteed redemption rate**. Competitive offers determine what the merchant actually pays, below that ceiling. Unsold offers receive their gold back and unused MOSS remains in the treasury.

A read-only snapshot of [the public statistics API](https://stats.mossvale.world/api/stats) at **2026-09-19 18:22:38 UTC** showed:

| Measure | Gold |
| --- | ---: |
| Total held, pending and auction escrow | 1,652,783 |
| Held by administrative accounts, including their pending/escrow gold | 218,749 |
| Remaining non-administrative supply | 1,434,034 |
| Created in the last 24 hours, excluding explicit administrative grants | 1,431,140 |
| Burned in the last 24 hours, excluding resets/admin operations | 409,154 |
| Net issuance in the last 24 hours | +1,021,986 |

Existing sinks absorbed **28.58%** of recorded issuance. Monsters created 808,638 gold and gear resale created 304,426; gear upgrades burned 332,215. The calculation excludes `admin:*` event reasons, not every ordinary gameplay reward received by an administrator. Gold tracking started on **2026-09-18 12:43:13 UTC**, so the displayed seven- and thirty-day windows did not yet contain that much history. These numbers are a recent snapshot and must be refreshed before setting later rounds' budgets.

At the pilot ceiling, spending the entire $1,000 budget would remove one million gold: roughly one day's observed net issuance and 70% of the snapshot's non-administrative supply. Lower asks buy more gold per dollar, so the pool may remain partly unspent if eligible players offer less gold. These figures support a bounded experiment; they cannot establish players' willingness to sell. The public dashboard also has no completed Gold Exchange price tape from which to infer a defensible market rate.

For subsequent rounds, review actual accepted volume, weighted average paid price, the last accepted ask, unfilled gold, bidder concentration and the updated issuance/sink figures. Decide the next finite budget from treasury funding and observed participation. A four-hour bid window does not itself justify six funded rounds per day.

## Wallet requirement pricing

Only the merchant's $25 wallet requirement uses the MOSS/USD estimate displayed on the [Pons MOSS page](https://www.ponsfamily.com/launchpad/0x6742883Eef788E2424CE5a1b0d4303144AaEc0a5). The server multiplies Pons's MOSS/RBLX price by its RBLX/USD reference, validates the canonical token, quote asset and pool metadata, and requests an uncached response. Missing, malformed or old responses leave the dollar requirement unverified; there is no alternate-price fallback. Wallet ownership, token runtime, canonical chain checks and the minimum of finalized/current token balances still apply.

Pons embeds these numbers in its page and does not expose an underlying quote timestamp. HTTP Date/Age bound response age, not market-data age; this is the Pons displayed estimate, not a manipulation-resistant oracle or guaranteed sale proceeds. A page format change can temporarily disable qualification until the reader is updated. Round settlement, vouchers, store payments and house reserves retain their existing price references.

## Pricing and settlement

All bid allocation uses exact USD micro-units (one million per dollar):

```text
budgetUsdMicros = budgetUsdCents * 10,000
unitUsdMicros = priceCentsPer1000 * 10
payoutUsdMicros = acceptedGold * unitUsdMicros
payoutMossWei = floor(payoutUsdMicros * 10^30 / closingPriceUsdWei)
```

Each payout is rounded down by less than one MOSS wei, keeping total payment inside the dollar budget. A nonzero dollar award that converts to zero token wei is rejected before any gold burns. Financial multiplication/division uses integers.

1. At the deadline, close the offer book and sort by lowest asking price, then earliest offer sequence. Every edit resets tie priority.
2. Accept each offer at its own asking price until the USD budget is exhausted. The last affordable offer can fill partly.
3. Persist the first fresh, verified MOSS/USD closing quote and its treasury reserve. A funding shortfall cannot roll this price back or replace it on a later retry.
4. Verify funding for all accepted offers alongside existing treasury obligations. Atomically save the fixed MOSS awards, burn accepted gold, and return all unbought gold through pending credits. A funding failure keeps escrow and the closed offer book intact for a retry at the saved price; no player receives a partial settlement.
5. Players claim the exact MOSS amounts saved at settlement using their offer's wallet. Wallet relinking and subsequent price changes cannot redirect or reprice an award.

For example, 800,000 gold offered at $0.50 per 1,000 consumes $400. Another 1,000,000 gold offered at $1 per 1,000 fills for 600,000 gold and consumes the remaining $600; its other 400,000 gold returns. The merchant buys 1,400,000 gold. At a closing price of $0.02/MOSS, these awards are 20,000 and 30,000 MOSS. These are illustrative offers, not observed trades.

This is a multiple-price reverse auction: successful sellers receive their own offer price. [TreasuryDirect describes this general pricing convention](https://www.treasurydirect.gov/help-center/faqs/buyback-faqs/).

## Treasury accounting and pricing

An open round reserves its dollar budget, expressed in MOSS at a fresh quote for funding checks. New voucher issuance revalues all open-round reserves under the same shared treasury lock before spending capacity. Reserves with a saved closing price, settled awards and already signed claims retain their fixed MOSS amounts. Preparing a winner's claim transfers its exact amount from the settled reserve into the permanent claim ledger without exposing a gap.

If MOSS falls, the treasury may need more tokens to fund the same dollars. An unavailable price delays the closing conversion. The first verified quote after the deadline is saved permanently, even if funding is insufficient. Offers cannot change after their deadline and escrow remains saved until funding recovers. Funding retries use that saved quote without needing a working price feed. Only actual accepted dollar offers need funding at settlement; an unspent portion of the $1,000 budget is released. The operator must top up a shortfall. The five-second settlement worker uses the first verified closing quote, rather than a historical price at the exact deadline; a server or pricing outage can delay this first observation.

Pricing uses the same `readStorePrice({ purpose: 'payout' })` policy as existing treasury vouchers: the highest of three finalized MOSS/RBLX samples and the fresh Robinhood RBLX/USD ask. Virtual quote liquidity is still checked using the issuer bid; canonical block, freshness, token and contract checks remain required. This payout policy handles a wide issuer spread separately from store payment pricing. The USD budget is a payout reference, not guaranteed executable sale proceeds. Three discrete samples are not a manipulation-resistant oracle or a full TWAP. [Uniswap explains the distinction](https://blog.uniswap.org/uniswap-v3-oracles). Local checks do not create a live round or send tokens.

Do not withdraw reserved funds, change the authority or replace the treasury while its rounds, unsigned awards or unpaid claims remain outstanding. The existing contract allows owner withdrawals, which can underfund obligations. An award tied to a different configured treasury stays saved and requires restoring that configuration; it is never silently redirected.

Gold locked in offers remains part of public supply until accepted gold burns. Escrow moves and returned gold are transfers, not new issuance. Existing Gold Exchange remains player-to-player; merchant purchases remove accepted gold from circulation. Pending gold credits apply on the character's next save or merchant refresh. Full payout history reserves a claim slot before accepting an offer, so gold cannot sell without room for its claim.

## Opening a funded round

Rounds start manually. Depositing MOSS into the treasury never opens a round, starts its four-hour clock or creates a repeating schedule.

Use the shared database and existing treasury environment: `DATABASE_URL`, optional `DATABASE_CA_BASE64`, `TREASURE_TREASURY_CONTRACT`, `TREASURE_AUTHORITY_KEY`, and `TREASURE_RPC_URL`. The treasury must already hold enough MOSS at the current price, after existing obligations. No new on-chain auction contract is needed.

```sh
npm run gold:round -- --id merchant-2026-09-19 --usd 1000 --hours 4 --max-usd-per-1000 1
# Add --open to reserve funding and open this one round.
```

The operator script is included in the production image and can run with its existing treasury/database environment. The default previews the dollar budget and current estimated MOSS requirement. `--open` atomically checks all liabilities, reserves funding and refuses duplicate IDs or another open round. It does not transfer or buy MOSS. Round terms stay immutable; any realm can settle the round after the deadline, including after a restart.

Run `npm run check:gold-rounds` for allocation, isolated PostgreSQL concurrency, real WebSocket gameplay, UI and chain checks. Database checks use a disposable local `TEST_DATABASE_URL` or Docker and never the production `DATABASE_URL`. See `docs/TREASURE-TREASURY.md` for the existing treasury deployment and wallet claim procedure.
