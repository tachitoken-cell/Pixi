# MOSS treasure treasury

The Shady Merchant exchanges a looted voucher for a permanent, one-use payout to the character's verified wallet. Each goblin has a 10% voucher drop chance. Each new voucher pays $2–$10 worth of MOSS at its redemption price reference:

| Chance per voucher | USD value |
| --- | --- |
| 90% | $2–$5 |
| 10% | $6–$10 |

Before a new redemption, the linked wallet must hold at least $30 USD worth of MOSS, verified with the same trusted holdings reader used by the gold merchant. The balance is checked, never spent or burned. Failed or stale holdings checks keep the voucher and daily allowance. Saved rewards keep their original assigned USD amounts, including older $5–$30 rewards; refreshing, checking or collecting them does not require this minimum.

Each account can redeem at most one voucher per UTC calendar day across all characters and realms, resetting at 00:00 UTC. The limit is consumed only when a new voucher payout is durably saved. Refreshing its quote, collecting, checking or retrying a saved payout does not consume another daily redemption and remains available at the limit. Finding and storing vouchers and gold merchant round payouts are unchanged.

Integer cents within a range are uniform using `node:crypto.randomInt`. The mean new reward is $3.95 at the price reference. The assigned USD reward is permanent, with a $10 maximum for new vouchers. The server converts it to an exact MOSS amount using verified MOSS/RBLX pool samples and Robinhood USD pricing, and saves the quote with the claim. Integer rounding keeps the reference value within $2–$10 for new rewards. Before submitting payment, **Refresh MOSS amount** recalculates only the token amount for that same USD reward. A failed price, funding, or save check leaves the previous authorization available. Later market value and executable sale proceeds can differ.

New and refreshed payouts use the fresh Robinhood RBLX/USD **ask**, adjusted for the issuer's token multiplier, and the **highest** of the same three finalized MOSS/RBLX pool samples. This reference allows wider issuer spreads without letting a lower bid inflate treasury token payouts. The $2–$10 reward is a value at that reference, not guaranteed sale proceeds: selling at the bid can return less. Payments still use the bid and lowest sample with the 5% spread limit. The merchant wallet requirement separately uses the MOSS price displayed by Pons; see `docs/GOLD-MERCHANT.md`. Store and payout pricing retain the $10,000 minimum virtual quote liquidity measured at the **bid**, plus issuer freshness, active trading, deployment, history, and canonical-block checks. Existing saved USD claims may be refreshed without rerolling their reward; older numeric claims without an assigned USD amount keep their original MOSS authorization.

## Configure after deployment

1. Build with `node scripts/build-treasury-contract.mjs`; verify with `node scripts/check-treasury-chain.mjs` and `node scripts/check-treasury-realms.mjs`. The realms check runs actual PostgreSQL in a disposable Docker container or a unique schema on a local `TEST_DATABASE_URL`; it explicitly skips if neither is available.
2. Deploy `public/contracts/MossvaleTreasureTreasury.json` on Robinhood Chain (4663), passing the dedicated game signing authority and treasury owner addresses to its constructor, in that order. The owner is fixed at deployment and is separate from the claim-signing authority. The fixed MOSS token is `0x6742883Eef788E2424CE5a1b0d4303144AaEc0a5`.
3. Fund it by transferring MOSS to the deployed treasury address. Deployment and funding require explicit operational execution; these scripts send no transactions.
4. Set `TREASURE_TREASURY_CONTRACT`, dedicated secret `TREASURE_AUTHORITY_KEY`, and optional `TREASURE_RPC_URL` on every realm that shares the treasury. The key signs game claims only and needs no ETH. Do not reuse a funded wallet's private key. Keep it out of source, logs, and browser configuration.

The server disables redemption until it verifies finalized chain ID, exact treasury and token bytecode, signer, token identity, and funding, and uses the shared PostgreSQL progress database. Local file storage supports injected test services only. Wallets pay network gas to submit their own claim; no MOSS approval is needed.

## Persistence and funding safety

`prepareClaim({id,realmId,characterId,wallet,usdCents})` returns `{claim,capacityWei}`. Capacity is the lower of finalized and latest canonical `balance + totalPaid` snapshots. A player payout moves the same amount from balance into `totalPaid`, keeping capacity unchanged; an owner withdrawal reduces capacity, and a finalized top-up increases it. Using the lower snapshot prevents new issuance against a confirmed withdrawal while waiting for finality. All issued claim amounts must fit within capacity, enforced in one permanent shared database ledger transaction across all realms. Atomically insert the ledger record, decrement the voucher, and save the complete claim **before** returning its signature. A signature must never escape a failed commit. Every deployed treasury must use one shared issuance ledger; never issue against the same treasury from an independent database.

Claims bind realm, character, unique ID, wallet, amount, chain, and contract. They do not expire. Keep the original claim and its wallet after reconnects, canceled transactions, or wallet relinking. Never refund a voucher after issuing a signature. A user can resubmit the same saved transaction; contract storage makes it payable once. The fixed owner may call `withdraw(amountWei)` to transfer MOSS only to the owner wallet. Withdrawals do not change `totalPaid` or invalidate signed claims, but can leave outstanding claims awaiting a top-up. There is no upgrade, ownership transfer, signing-authority replacement, or claim revocation function. Anyone may replenish it with a direct MOSS transfer; the initial deposit is not a lifetime payout cap. The issuance ledger must never be pruned or deleted, even after finalized payouts or character deletion. Real treasury issuance requires shared PostgreSQL storage. File-backed local tests use injected simulated treasuries and retain character histories; shared database storage keeps a separate permanent ledger. Preserve all outstanding signed claims and migrate the full ledger if the treasury is moved.

Refreshing an unsubmitted USD claim keeps its on-chain claim ID, recipient, contract and assigned USD cents. It appends the old signed authorization to `previousQuotes`; the contract permits only one payment across all versions. The database retains one permanent reservation keyed by the original authorization and raises it to the largest amount ever signed, never releasing funds when a quote decreases. Persist both the updated reservation and complete quote history before exposing a new signature. Paid, processed or submitted claims cannot refresh, and fresh canonical checks must find no prior payment. Settlement accepts only a known, verified authorization and records `settledClaimHash` so the displayed paid MOSS amount matches the actual version used. Old signatures cannot be revoked and remain executable; the reference cap applies when quotes are created, not to the later market value of an already signed amount.

`checkClaim(claim)` recovers payout state from canonical storage even without a submitted transaction hash. `processed` is visible in the current chain; `paid` is finalized. Preserve returned block anchors in `paymentBlock`. A canonical reorg can return a processed claim to `pending`; neither that nor RPC failure restores the voucher or cancels its issuance liability. `verifyClaim(claim,transactionHash)` also checks sender, treasury, amount, claim event, and canonical receipt.

The dedicated signing key authorizes spending all treasury funds. Protect it with the same controls as the game reward backend. There is no key rotation for an existing treasury: retire new issuance and deploy a new treasury if rotation is needed, retaining the old ledger and funding for previously issued claims.

## Replacing the legacy treasury

The former owner treasury permanently limits claims to 1–1,000 whole MOSS. Deploy the new artifact to a new address, then configure `TREASURE_TREASURY_CONTRACT` for new issuance and `TREASURE_LEGACY_CONTRACT` for the old address on **all** realms. Legacy runtime identity remains pinned. Existing claims retain their original amount, contract, signature, and quote-free numeric format; the settlement router and UI use each claim's own verified treasury. A pricing outage prevents new issuance but does not prevent collecting saved claims.

Stop old issuance before moving funds. Preserve the full shared ledger and reserve at least `SUM(all legacy issued amount_wei) - finalized legacy totalPaid` in the old treasury, clamped at zero. Compute the transferable remainder against the current canonical old balance; unfinalized payouts may conservatively increase the reserve. Only the owner can withdraw the unreserved amount to their wallet before transferring it to the replacement. The new treasury retains owner withdrawals and unlimited top-ups. Never rewrite existing claims or erase ledger entries.

## Encounter defaults

Every five minutes, each occupied wilderness region gets a 2% spawn roll, with at most one living natural goblin per realm. It spawns 25–55 metres from an active player on valid wilderness terrain. Coming within 12 metres or damaging it starts a 30-second escape timer. It flees without attacking, channels a portal during the final three seconds, then vanishes without loot. Untouched goblins disappear after five minutes. These tuning values live in `src/treasure-goblin.ts`.

Verified game masters can use **Your character → Spawn treasure goblin** to create one extra goblin 25–55 metres from their own living character in overworld wilderness. Safe placement excludes towns, water, obstacles, nearby players/enemies, and world-boss arenas; instances and zeppelin travel are rejected. GM spawns use the same escape and loot rules, can coexist with a natural goblin, and neither count toward the natural limit nor reset its five-minute schedule. Each request uses the normal GM authorization and audit log.

A kill gets one 10% voucher roll, assigned to the killer through the existing corpse-loot system; party membership does not multiply it. The voucher also works with existing bag, bank, trade, and auction storage, but ordinary gold merchants cannot consume it. Veyl is beside Willowbrook’s merchant; the voucher’s bag detail offers a waypoint to him.

## Treasure-map expeditions

Ordinary overworld monster kills get one **5%** map-drop roll, awarded to the killer through personal corpse loot. Dungeons, world bosses, treasure goblins, the Rootvault gatekeeper, and map guardians do not drop maps. An unused **Weathered treasure map** stacks in bags and supports the existing bank and auction flows.

Use a map from your bags to consume one and save an expedition in your current zone. Reopen **Quests** to read the clue or track the search area. There are twelve fixed sites, two per zone. The marked circle covers a 36-metre search radius; follow the directional clue to discover disturbed earth within 16 metres. Approach and interact to uncover the guardian. Its level matches your level when the map was opened. You and your nearby party can fight it; other players cannot take over the encounter.

Defeat the guardian, then interact with the chest to receive **25 + 5 × expedition level gold**, **2 healing potions**, **1 ancient coin**, and a **1% chance of one MOSS voucher** for the map owner. Party members receive the usual nearby combat rewards; they do not multiply the chest's voucher roll. This is the same voucher redeemed with Veyl for weighted $2–$10 worth of MOSS, with the $30 wallet minimum for new redemptions.

One active expedition is saved per character. Its secret voucher roll is fixed when the map is consumed, stays on the server, and survives reconnects and restarts. Each stage is saved; the chest grants its contents and clears the expedition in one durable update. Duplicate or stale requests cannot grant another reward. If bags are full or storage fails, the unopened chest remains available to retry. Active maps cannot be auctioned because the consumed item is now saved expedition progress.

Run `npm run check:treasure-maps` for save validation, storage/UI integration, world-site geometry, and real local WebSocket lifecycle checks. The inventory icon is authored in `assets/source/treasure-map.blend`; regenerate it with `scripts/build-treasure-map-icon.py` in Blender. The chest reuses the existing Blender-authored Rootvault asset.

## Voucher reward activation

Deploy the compatibility release to every realm before enabling the $2–$10 reward table and $30 wallet minimum. Compatibility keeps current $5–$30 issuance but can validate, display, settle and refresh both policies. Do not roll back below this compatibility revision once a lower-value claim exists. Existing signed claims and quote histories retain their original assigned rewards.
