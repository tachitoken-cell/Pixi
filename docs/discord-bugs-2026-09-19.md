# Discord bug review — 19 September 2026

Sources: [general](https://discord.com/channels/1548625623868510278/1548625627903557702), [bugs](https://discord.com/channels/1548625623868510278/1549698419428433920), and [beta-testers](https://discord.com/channels/1548625623868510278/1548972118061092904). Reviewed channel messages and the mobile atlas attachment; this is a deduplicated triage, not an export of private conversations.

| Report | Finding and disposition |
| --- | --- |
| Inventory/auction stops accepting clicks after dragging (17–18 September) | Existing local fix `51b2529` preserves the dragged DOM node and recovers an interrupted drag on the next input. Included in this release. |
| Mobile atlas hidden behind “Your adventurer” (18 September) | Reproduced layout defect: desktop detail card and excessive reserved footer height consume the map on landscape phones. Fixed; six portrait/landscape viewports keep the map and 44-pixel controls reachable. |
| Closing the atlas after setting a waypoint stops clicks (17 September) | No separate failure reproduced after drag recovery. Actual WebGL waypoint selection, close and subsequent world input passed; 18 open/close/waypoint cycles passed across six mobile sizes. |
| Mobile merchant/auction buttons require awkward scrolling (17 September) | Fixed off-screen merchant quantity controls and a hidden landscape Sell footer. Six browser viewport cases passed real Sell-all, quantity, Buy/Sell tab, disconnected and out-of-range handler checks; auction drag recovery is included. |
| SEA loot and inventory delay (17–19 September) | Remote durable writes perform avoidable round trips for deletion fences and gold accounting. Fixed: ordinary saves use two rather than three database requests, and gold loot uses two rather than four. A delayed-database regression verifies that rewards are acknowledged only after COMMIT. |
| Phantom voucher collection says “unexpected error” (18 September) | Reproduced missing-network and ambiguous submission recovery gaps. Fixed; six portrait/landscape viewports keep the map and 44-pixel controls reachable. Exact player-specific failure remains unverified: no wallet address, transaction hash, or fuller error was available. Phantom supports Robinhood Chain; it must not be described as unsupported. |
| Trapped beside colosseum outer wall (16 September) | Reproduced eight corner gaps dropping players below the stands. Extended terrace support through the wall footprint; all 54,945 sampled walkable positions can reach an exit. Server regression covers movement and reconnecting from affected corners. |
| Character models repeatedly fail to load on PC (16–17 September) | Reproduced outdated service-worker model fallback failing current asset validation. Failed download or validation now retries once with the current build URL; persistent failures still expose Retry. Real model tests cover stale, failed, concurrent and recovered loads. The reporter’s exact browser state was unavailable. |
| Elderwood contract asks for absent boars (16 September) | Already fixed: level-24+ Woodland Slimes; retain existing progress. |
| Distant Power Shot kills leave no loot (16–17 September) | Already fixed. Server regression passed killer rewards, nearby party sharing, ownership/range checks, and corpse persistence after respawn. |
| Pet NFT claim does not open wallet / stuck finality (16 September) | Existing claim review, selected-provider retention, cancellation/expiry recovery. NFT UI and server regressions passed without a live transaction. |
| Auction proceeds missing after canceled withdrawal (18 September) | Existing `a8c203a` reads contract proceeds and only reports success after a successful receipt. Cancellation/retry and contract checks passed. |
| Mobile reconnect/sign-in repeatedly stalls (15–17 September) | Existing durable native-session restore and canceled-join fixes. Native-session and realm-restart checks passed. Later beta report confirmed the 17 September fix. |
| Mobile backpack traps item inspection (15–16 September) | Existing unified profile keeps the backpack available. Existing mobile panel checks and browser inventory review pass. |
| iOS Settings flashes closed (16 September) | Reporter later confirmed fixed; existing backdrop/panel handling retained. |
| Small tablet buttons / hidden stamina / run toggle (15 September) | Existing larger tablet controls and separate stamina display; mobile input checks passed. |
| Reward/system chat spam and Android drop confirmation (17 September) | Existing quiet reward history and in-game item actions retained. |
| Pets not loaded (15 September) | Follow-up says the player did not own a pet; no confirmed loading defect. |
| Reduced gold / harder solo dungeons / items sold for gold | Existing economy and difficulty behavior. Do not undo intentional changes as bug fixes. |

The fixes were first isolated against deployed `0148cfc`. During validation, the separately authorized feature release advanced `main` to `4328156` and deployed its authentication prerequisite. This batch is being integrated with that release, retaining all existing feature commits and the inventory fix. One coordinated production workflow will deploy the combined revision; unrelated work remains preserved.

Deployment is not complete until the production workflow and direct EU/US/Asia release, configuration, asset, WebSocket, browser-entry, and matching wiki checks pass. Unverified reports must remain explicit rather than being counted as fixed.

## Validation

Focused regressions passed for drag recovery, map guidance and controls, wallet submission/recovery, colosseum geometry and server movement, real character model loading, durable player-store ownership, deletion races, gold accounting and cross-realm persistence. The delayed-database run measured 931 ms for saved gold loot with 270 ms added to each query, and confirmed no premature reward or corpse removal. Build, performance, deployment/final-save guards and wiki checks passed. Mobile atlas browser checks covered six viewport sizes and actual WebGL waypoint, close and subsequent world input. Merchant browser checks passed six viewport cases including a reduced-height keyboard layout, with real sale handlers and visible 44-pixel controls.

The original Phantom error is **unverified**, not evidence of an additional confirmed defect: the reporter supplied no address, transaction hash or fuller error, and the user has no further detail. Wallet fixes cover reproduced failure paths; no player transaction was sent during testing.
