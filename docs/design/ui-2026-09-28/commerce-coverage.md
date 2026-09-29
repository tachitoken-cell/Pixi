# Commerce and storage source coverage — September 29

This pass implements the September 28 public preview's composition in the actual game controllers. Mossvale's forest, wood, antique-gold frames, Marcellus headings and DM Sans body text remain. The archived preview is reference material; its demo controllers and catalogs are not executed by the game.

## Screen mapping

| Screen / source | Implemented desktop composition | Implemented phone / short landscape adaptation |
| --- | --- | --- |
| Bank — `original/npc.js:287–363`, `npc.css:113–131,315–319` | Simultaneous Bank and Your items grids; real capacity headings; search that dims nonmatches; local name sort; one selected stack and quantity / All / transfer strip. Native double-click transfers the complete allowed stack. Item protection and gear rolls remain in an expandable details section. | Bank / Your items selects one grid; six columns, independent scrolling and a reachable transfer strip. Search and sorting remain available. Both real inventories stay in the controller. |
| Auction Browse — `original/npc.js:366–560`, `npc.css:156–241,320–350` | Counted categories, search and market filters, listing table, right-hand selected-item inspector. Real unit and total prices, seller, quantity and owned/reserved state remain distinct. | Horizontal category chips, sort controls, compact listing cards and one inspector directly beneath the selected row. A second row tap collapses it. Resize moves the same inspector rather than duplicating Buy controls. |
| Auction Sell — same source | Real carried-item list, existing sell form / quantity / currency / rare-item acknowledgement, current competing-listing context. | Carried items become a horizontal strip; the selected-item form stacks beneath it. Native currency restrictions and review terms remain intact. |
| Gold Exchange — same source | Existing whole-lot listing form and actual fee/net review, results and right-side inspector. | Stacked listing form and compact rows with inline selected-lot detail. Actual minimum lot size and effective rate remain visible. |
| Purchases / My auctions — same source | Real pending reservations and seller listings use the same list/detail composition. Existing cancellation, payment recovery and current/historical escrow handling remain. | Same selected-row expansion and horizontal categories; pending states do not expose a second purchase action. |
| Sold — same source | Actual historical receipts, original currency and exact settlement terms. Proceeds remain a wallet-level action. | Receipt rows stack quantity, buyer, date and fee/net amounts into readable cards. |
| NFTs — `original/windows.js:1032–1072`, `mobile.css:149–161` | Linked-wallet summary, verified/unverified status, actual balance and refundable funds; Houses / Pets / Mounts tabs with verified owned counts; actual owned pet and mount cards; house deed grid and existing auction controls. Ownership facts remain available in an expandable section. | Stacked summary and reachable collection tabs; two-column house deeds, one-column owned companion cards; readable bid controls. Existing mint / conversion catalogs are expandable within their collection. |
| Store — `original/windows.js:992–1030`, `mobile.css:149–161` | Counted category navigation, real Gold balance, actual product grid and selected-item art / description / purchase strip. | Horizontal categories, two-column products and a selected-item strip with the purchase controls spanning the row. |
| Referrals — `original/windows.js:945–990`, `mobile.css:187–190` | Actual current/next tier summary, tier progress, payout wallet and grouped invite link / copy / refresh controls before the expandable qualification rules. | Stacked summary, compact two-column tier rows and a full-width readable invite field. Decorative tier artwork is suppressed to preserve copy and progress space. |

## Deliberate adaptations and unavailable demo data

- Server state still owns inventory, capacity, item locks, prices, proximity, balances, purchases and ownership. Search and sort change only the presentation. Bank movement waits for a private authoritative reply, and a pending transfer blocks duplicate submissions.
- The source's placeholder listings, fake item statistics, account balances, reserve prices, instant ownership updates and successful-payment toasts are not copied. The real purchase review, native checkout, cancellation, uncertain-payment recovery and settlement flows remain.
- The Store snapshot has no wallet MOSS balance field. The sidebar therefore shows real character Gold and explains that exact MOSS amounts appear in review. NFT balance/refund values use their authoritative fields; missing values remain unavailable rather than becoming zero.
- Auction proceeds are withdrawn through the existing wallet-level escrow API. A prototype's per-sale collect button cannot truthfully represent that operation. Historical receipts retain their original settlement terms instead of being recomputed using current fees.
- The actual Gold Exchange minimum remains 200 Gold; the source's sample minimum does not change the economy.
- NFT minting and learned-pet conversion are additional real game flows. They remain available within the appropriate collection, with review/status outside the tab panels so unresolved payments stay visible when changing tabs. Counts and collection cards only describe verified ownership.
- Source mint/glass colors and Outfit type were not adopted because the user explicitly retained Mossvale's visual identity. Source layouts and responsive behavior were adapted to the existing materials.

## Focused verification

Passed against the changed runtime modules:

- `npx tsc --noEmit`.
- `node scripts/check-bank-ui.mjs`: dual inventory/capacity, search focus, native double-click/full stack, duplicate suppression, locks, transfer projections, private replies and proximity guards.
- `node scripts/check-auction-ui.mjs`: existing full controller/payment suite plus compact inline inspection, snapshot retention, desktop/phone relocation, single Buy action and tap-to-collapse. Wallet RPC and payment responses are simulated; no funds are sent.
- `node scripts/check-nft-ui.mjs`: collection tabs/counts plus existing verified ownership, wallet, mint, conversion, bid, refund, settlement and recovery checks. Wallet calls are simulated.
- `node scripts/check-store-ui.mjs`: existing quotes, Gold purchases, native checkout, ownership, pending delivery and recovery checks.

The complete desktop / phone / landscape renderer gallery is owned by the final review pass and is not replaced by these controller checks. Populated Auction and verified NFT fixtures were supplied for that pass. The standalone referral browser script was not completed in this subtask: its default Playwright dependency is not installed; the final gallery uses the available bundled runtime. No physical-device claim, commit, push or deployment is made by this document.
