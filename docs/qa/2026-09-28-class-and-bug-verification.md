# Class specifications and Discord bug verification — 28 September 2026

Implementation is in the isolated `spell-talent-specs-sep28` worktree, based on `361cf1ba`. The user's original checkout is untouched. This report does not claim a production deployment, native-store release, physical-device test or live wallet transaction.

## Specification coverage

- Complete supplied spell and talent exports were compared field by field: **137 active spells, 130 talents**, six new passives, nine retired spell IDs and twenty requested new icons.
- Combat effects are implemented on the server and shared calculations; the JSON import is not merely a text/layout update. Offline workshops and imported wiki catalogues match.
- Retirement clears only validated retired lessons and their slots. Valid compatible talent allocations remain; changed unreachable prerequisites refund points. Wounded and dead v6 Iron Bulwark characters migrate with static or randomized equipment without healing or resurrection.
- Revivify uses the exported instant cast and zero cooldown. Its unspecified restoration defaults to full health; Guardian counters use basic-attack damage and Healing Light uses the existing eight-meter pulse radius. These defaults are explicit in the player guide. Revival respects group, world, line-of-sight, arena and pending-save boundaries and works after raid completion.
- Guardian's 40% reduction does not bypass explicit raid/GM executions. Counters have a shared one-second cooldown and cannot create reflection loops. Healing pulses cannot recursively pulse.

## Discord report status

The original review covered 649 unique searchable messages from September 16–28. “Fixed” below means code and regression evidence in this worktree, not deployment or confirmation from the affected player. Source links retain each original report.

| # | Report | Current result |
|---|---|---|
| 1 | [Spellbook detail card covers other skills](https://discord.com/channels/1548625623868510278/1549698419428433920/1553933569636704296) | Fixed: spell details reserve space below both skill lists. |
| 2 | [iOS character keeps running after movement input](https://discord.com/channels/1548625623868510278/1549698419428433920/1553164505528410173) | Hardened: global release, touch-end reconciliation and rotation cancel movement; physical iOS acceptance remains. |
| 3 | [No revive prompt after dying before raid completion](https://discord.com/channels/1548625623868510278/1549698419428433920/1553479173228470295) | Fixed: leaving a raid while dead restores destination revival UI. |
| 4 | [MOSS wallet Review transfer button does nothing](https://discord.com/channels/1548625623868510278/1549698419428433920/1553443124980879442) | Wallet Review flow passes mocked review/cancel/pending guards; affected wallet/amount/recipient/error needed. |
| 5 | [Legitimate players banned/locked out](https://discord.com/channels/1548625623868510278/1549698419428433920/1551999201720795251) | Review-only bot scoring and explicit, durable GM decisions pass. Original manual decision requires account evidence; no bans changed. |
| 6 | [Monsters can be trapped against trees/rocks](https://discord.com/channels/1548625623868510278/1549698419428433920/1552684550289629207) | Fixed: overworld enemies use bounded obstacle detours, retaining collision and terrain restrictions. |
| 7 | [Loading/reconnecting loops and recurring Updating Mossvale popup](https://discord.com/channels/1548625623868510278/1549698419428433920/1553776688175775825) | Updater/cache/download/native-version regression checks pass. Installed-device recurrence remains unverified. |
| 8 | [Severe lag, rubber-banding and disconnects during combat](https://discord.com/channels/1548625623868510278/1549698419428433920/1552581442016383027) | No affected live session trace: FPS, network and server delay remain unassigned. |
| 9 | [Dragging inventory/Auction House items freezes input](https://discord.com/channels/1548625623868510278/1549698419428433920/1550547449901490279) | Passed 30 native swaps, world/auction drop recovery, Escape and detached-source recovery; no current input lock reproduced. |
| 10 | [Bag/Auction House/Wallet scrolling glitches or selects wrong item](https://discord.com/channels/1548625623868510278/1549698419428433920/1553534459045748791) | Scroll-refresh and touch-input checks pass; physical-device recurrence unverified. |
| 11 | [iOS dungeon exit logs out or freezes for about 10 seconds](https://discord.com/channels/1548625623868510278/1549698419428433920/1551251127331455038) | Physical iOS dungeon-to-world timing remains unverified. |
| 12 | [Closing map after setting waypoint freezes input](https://discord.com/channels/1548625623868510278/1549698419428433920/1550146811757338657) | Map waypoint/close and next-world-click recovery pass six mobile viewports. |
| 13 | [Raid invitation panel jumps while interacting](https://discord.com/channels/1548625623868510278/1549698419428433920/1553405235777511516) | Fixed: raid refresh preserves guide/invite state, controls, focus and scrolling. |
| 14 | [Inspecting a raid player breaks panel layout](https://discord.com/channels/1548625623868510278/1549698419428433920/1553405899681435780) | Raid layouts pass three viewports; exact inspected long-gear report unverified. |
| 15 | [Summoned/NFT pets repeatedly disappear and reappear](https://discord.com/channels/1548625623868510278/1549698419428433920/1551487860539138168) | NFT access checks pass, including stale verification hiding and later restoring selection. No ownership policy changed. |
| 16 | [Audio does not return after alt-tab or other-tab playback](https://discord.com/channels/1548625623868510278/1549698419428433920/1552216688030646375) | Fixed: trusted interaction can retry a stalled audio resume. |
| 17 | [Cannot accept player-to-player trade](https://discord.com/channels/1548625623868510278/1549698419428433920/1550865487511162881) | Real multi-client trade offer/revision/atomic completion and UI checks pass. |
| 18 | [Gold Merchant Submit Offer remains disabled](https://discord.com/channels/1548625623868510278/1549698419428433920/1551163044057452607) | Merchant eligibility, freshness, wallet identity and draft checks pass; exact affected round not reproduced. |
| 19 | [Cinder Cosmetic Box has no price / says insufficient ETH](https://discord.com/channels/1548625623868510278/1549698419428433920/1551790405282963576) | Store price/review/receipt/pending recovery checks pass; exact wallet/network failure not reproduced. |
| 20 | [Specialist claim/upgrade leaves wings missing and Equip disabled](https://discord.com/channels/1548625623868510278/1549698419428433920/1553010932282822728) | Specialist upgrade/fracture/repair checks pass; exact character outcome not established. |
| 21 | [Quick Shot and auto attack land almost simultaneously](https://discord.com/channels/1548625623868510278/1549698419428433920/1552734475337736262) | No duplicate damage demonstrated; separate basic and spell impacts can overlap. No unrequested cadence change. |
| 22 | [Fortress shield has no active/remaining-shield indicator](https://discord.com/channels/1548625623868510278/1549698419428433920/1552600904283201638) | Fixed: active shields display remaining absorption and duration. |
| 23 | [Unusually sparse gear/maps/pet drops](https://discord.com/channels/1548625623868510278/1549698419428433920/1551824511874109463) | Loot table and award tests pass; player drop streaks need eligible-roll telemetry before changing rates. |
| 24 | [Loot audit information missing/broken](https://discord.com/channels/1548625623868510278/1549698419428433920/1551868545313411083) | Controlled kill→roll→pickup→save trace and failure checks pass; trace remains intentionally memory-only and bounded. |
| 25 | [MOSS holdings valued below the amount just purchased](https://discord.com/channels/1548625623868510278/1549698419428433920/1550989534051958848) | No reproduced valuation error; current eligibility value remains distinct from purchase cost. |
| 26 | [Voucher claim/redemption errors](https://discord.com/channels/1548625623868510278/1549698419428433920/1550478291008364605) | Wallet recovery checks pass; original Phantom case requires the affected wallet journey. |
| 27 | [Chat tabs/frame misaligned](https://discord.com/channels/1548625623868510278/1549698419428433920/1553749115152638075) | Chat interaction/layout checks pass; original screenshot not independently reproduced. |
| 28 | [Dungeon disconnect loses access/progress](https://discord.com/channels/1548625623868510278/1549698419428433920/1552354770381971527) | Same-realm dungeon re-entry and retained progress checks pass. |
| 29 | [Raid member/leader leaving prevents group continuation/start](https://discord.com/channels/1548625623868510278/1549698419428433920/1553415887887798325) | Raid departure/readiness/leadership checks pass. |
| 30 | [Instant spells say no foes while monsters attack](https://discord.com/channels/1548625623868510278/1549698419428433920/1552599478794588252) | Existing reachable-target fallback retained; class targeting regression checks pass. |
| 31 | [Equipment Skill Damage/passive bonuses do not alter skill damage](https://discord.com/channels/1548625623868510278/1549698419428433920/1551182842816495688) | Shared spell/stat percentage and damage checks pass. |
| 32 | [Loot save locks out combat skills](https://discord.com/channels/1548625623868510278/1549698419428433920/1551958555077255269) | Slow-save and queued-loot checks confirm combat remains available. |
| 33 | [Asia corpse-looting delay despite moderate ping](https://discord.com/channels/1548625623868510278/1549698419428433920/1551884762552205323) | 270ms database-save fixture passes queued pickup and combat; live Asia latency not measured. |
| 34 | [Mounted merchant selling causes jump/jitter](https://discord.com/channels/1548625623868510278/1549698419428433920/1551965339200524330) | Existing mounted-position preservation retained; no new recurrence demonstrated. |
| 35 | [Gold-exchange input flickers/resets during entry](https://discord.com/channels/1548625623868510278/1549698419428433920/1550870008882528349) | Existing merchant draft preservation passes. |
| 36 | [Distant Power Shot kills leave no lootable corpse](https://discord.com/channels/1548625623868510278/1549698419428433920/1549874857867481160) | Existing ranged personal-loot fix retained; controlled loot award/pickup checks pass. |
| 37 | [Elderwood contract requests monsters absent from zone](https://discord.com/channels/1548625623868510278/1549698419428433920/1549873933568712709) | Existing Woodland Slime contract correction retained; no new recurrence demonstrated. |
| 38 | [Pet stuck behind dungeon pillars](https://discord.com/channels/1548625623868510278/1549698419428433920/1551184453764653118) | Combat companion collision/targeting checks pass; cosmetic/fetching pet report needs type identification. |
| 39 | [New pet species cannot mint / claim opens no wallet approval](https://discord.com/channels/1548625623868510278/1549698419428433920/1551169415398170625) | NFT mint/verification/recovery checks pass with fake chain adapters; live contract/store status not changed. |

## Validation

Passed: `npm run check:class-rework` (including `check:september-combat`), `npm run build`, `npm run check:wiki`, spell/talent editor checks, icon validation, class-change checks, server syntax and `git diff --check`. The repository specification sources also exactly match both supplied JSON files. Wiki validation covered 292 articles; icon validation covered 137 spells, 130 talents and ten atlases. The class checks cover real WebSocket combat, talent effects, target-life cancellation and saved-player migrations. Regression fixtures exercise overworld circle/rectangle detours, movement budgets, mitigation/counter timing, pulse recursion, timed defense and revival boundaries.

The older standalone `scripts/check-spells.mjs` remains blocked by pre-existing test fixtures: its extracted XP function lacks current dependencies, and its range/cluster fixtures are relocated by current overworld spawn rules. The affected baseline function and spawn fixtures were verified unchanged from the base revision. Its stale catalog counts were updated, but this script is not reported as passing; the current class/combat suites above passed.

Client evidence: spellbook selection/assignment on desktop, portrait and landscape; raid guide/invite controls preserved across updates on three viewports; map close/reopen and next-world-click recovery across six mobile viewports; gesture cancellation, audio resume, shield/status feedback, wallet review, trade, merchant, store, scroll and updater suites. Physical iOS and the reporters' exact wallet states are still needed for device/account-specific acceptance.

Additional server evidence: review-only anti-bot scoring and explicit GM moderation; atomic multi-client trades; dungeon re-entry and raid departures; controlled loot roll/award/pickup/save tracing; NFT stale-verification recovery and transfer revocation; specialist upgrade/fracture/repair; and combat/queued loot during simulated database latency. No economic drop-rate or ownership-policy tuning was made.
