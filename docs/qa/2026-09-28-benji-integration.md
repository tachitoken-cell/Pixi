# Benji integration — September 28, 2026

Status: local implementation in the isolated `benji-updates-sep28` worktree, based on `6e14796a3021df3d12ccfdeb84636ec2e0a16052`. Nothing from this work has been committed, pushed, merged or deployed. The original checkout and paused atlas worktree were preserved.

## User decisions

- Current realm remains level 1–60. The old level-99 and Base Job proposal is held.
- Equipment upgrades remain capped at +5. Supplied +9 art is archived, not selected at runtime.
- SP1 classes and their unlock/trials chain are excluded.
- Existing specialist activation, combat bonuses, Job XP and specialist wings are disabled. Cards, saved selection, ranks, fracture state, Job XP and NFT ownership remain intact. Claiming, upgrading, repairing and trading remain available. Apostle cosmetic wings still work.
- Keep Mossvale’s established visual identity: Marcellus/DM Sans, original wordmark, forest, parchment and gold frames. Source layouts and cohesive artwork improve the existing flows.
- Atlas work is paused. This update changes the existing realm; it does not add the proposed 39-map world.

## Implemented coverage

| Source | Integration |
|---|---|
| [Complete UI message](https://discord.com/channels/@me/1548969548785385513/1554098851420438558) and [linked public preview](https://claude.ai/artifact/3P1oNCYHF6wxBQLwjq1jnF) | Useful source layouts, matching icons and optional UI click sounds adapted to the existing real game renderers while retaining Mossvale’s original fonts, wordmark, oak/parchment/forest artwork and gold frames. Merchant/trainer list and detail share a window. NPC proximity, real balances and payment recovery remain authoritative. See `docs/design/ui-2026-09-28/README.md`. |
| Quest Bible and NPC dialogue | 82 non-SP1 one-time quests, 54 placed objects, 40 named or spatially constrained enemy homes, two personal rescue/escort encounters and six quest-gated chambers at levels 7/10/14/18/24/44. NPC offers, accept/decline dialogue, journal tracking, ordered seals/keys and one-time XP/gear/material/profession rewards are authoritative. Three wave rooms require 30 seconds; the Hollow Door lantern uses a 6 m protection circle. The required Ashbound and optional Sun chamber treasures grant one ancient coin each per character after bag-space preflight. The 20% / 5-minute Heatproof tonic parameters are implementation defaults because the source did not specify them. Existing campaign/contracts remain. Every one of the 90 source rows is accounted for in `2026-09-28-story-quest-coverage.md`. |
| [Instant Combat v12](https://discord.com/channels/@me/1548969548785385513/1553936271754264606) | All 24 new skills for eight bosses, including rescue targets, stacks, swaps, movement/action checks, telegraphs and status effects. Existing 70%/35% shield objectives retained. 107 runtime animation clips. Actual downloaded v12 ZIP is the authoritative source. |
| [Apostle reference](https://claude.ai/artifact/3CtANMfaikwbR9jHKRuFdd) / archived Apostle source | Updated three Apostle forms, 78 clips, 12 spell models and 36 effect clips. Spawn, wings, sustained channels, suit holds, clone charge, hit/run and final-enrage cues wired to encounter state. Existing pets are kept pet-sized; reward cosmetics are retained. |
| [Epic/Mythic arsenal](https://claude.ai/artifact/B5ma4eG63QHMF4PH4r4BML) | 16 active class/rarity/+0 or +5 weapon variants with independent animation. Existing item IDs, stats, ownership and drops retained. All 24 original variants are archived, including +9. |
| [Upgrade effects](https://discord.com/channels/@me/1548969548785385513/1554077379968893059) / [preview](https://claude.ai/artifact/TXJS8mxpjk4r87mFth7Eaw) | Four class motion sets retargeted onto the player's actual avatar, excluding supplied SP1 mannequins. Channel, success, unchanged and fracture visuals follow a correlated result emitted after persistence. Reduced motion, avatar replacement, cancellation and stale/duplicate outcomes handled. |
| Specialist wings +1–15 | Source archived; withheld from the active game while SP classes are disabled. |

## Source gaps and held content

This is not a claim that every discussed feature is finished.

- All 82 non-SP1 Quest Bible rows are represented in the current-realm implementation; eight SP1-linked rows remain explicitly excluded. Exact current-realm placements, source ambiguities and chosen defaults are documented in the quest coverage report.
- The 12 side-quest templates and ten chamber-room categories are examples, not twelve additional named quests or ten additional dungeons.
- Missing NPC, target-count, placement and reward details use documented current-realm conventions. This is not a claim that the source specified every implemented value; the cap stays 60 and no new Base Job curve or +9 gear tier is introduced.
- The linked UI preview contains **103 icon PNGs, including 21 item images and 16 menu images**, not the discussed 300-item catalog. Sixteen clear current resource/loot identities are mapped. Unmatched demo items, arbitrary stats and the missing catalog are not invented.
- The signed complete-UI ZIP was inaccessible; the linked public preview's source resources were acquired normally and archived with hashes. This is not a claim to have obtained that ZIP.
- Combat/death audio from design previews is not enabled; Benji's UI-only sound direction is respected.

Source acquisition URLs, hashes and originals live in `docs/design/ui-2026-09-28/` and `assets/source/*/benji-2026-09-28/` or `assets/source/benji-equipment-2026-09-28/`. Downloaded preview scripts are reference data, not imported runtime code.

## Verification

- Actual local game browser flow: valid guest roster → level-60 character → Rowan interaction → Welcome to Lanternreach → Accept → journal with Rowan 1/1. Legacy campaign dialogue remained available.
- Final built-game quest placement check used a level-4 character at the relocated Greenwood camp near Willowbrook: the authored prop appeared, normal interaction completed the objective, health remained 136/136, no uncaught browser errors occurred, and progress persisted after shutdown. Evidence: `artifacts/story-game/result.json` and `quest-object-complete.png`.
- Placement regressions cover all 54 quest objects, 40 named/scoped enemy homes, 13 dry settlement approaches and all six chamber entrances. The browser review caught the original level-4 pack in a level-24–32 area; the corrected location has a clear campfire footprint. Five additional target positions, the starter herb/fishing directions and the level-8 boar hunt were corrected. Exact adaptations and the remaining source/world level-band mismatch are documented in the quest coverage report.
- Actual local merchant flow: second seeded character → Mira → Browse supplies → Buy Marching sabatons. Gold changed from 50,000 to 49,980; item became owned and bag count changed from 3 to 4. These were disposable local fixtures, not production accounts.
- Actual collection view showed the preserved +4 card, Job XP/rank, disabled SP activation and available card management.
- Real avatar preview checked authored weapons across Knight, Ranger, Mage and Cleric and outcome visuals. Automated checks cover all 16 variants and all four classes × three outcomes, grounding, no SP1 mannequin meshes, independent animation and stale result handling.
- Heatproof checks exercise real socket/save rollback, shared cooldown, concurrent consumption, ownership/death guards and restart; actual damage code covers direct/periodic fire, expiry, shields, Guardian and execution/reflection exclusions. Story UI checks require explicit gear selection and show the actual awarded-slot receipt.
- `npm run check:story-quests` passed: catalog/rewards/encounter/renderer/tracking/chamber/Heatproof checks plus a real WebSocket journey. This includes service visits, actual kills/gathering, delivery, object distance/order/replay, first-click rescue start, damage to the protected NPC, duplicate-start prevention, disconnect/retry and durable progress. Full bags preserve rewards, and old campaign state remains unchanged.
- Existing dungeon regressions passed for all seven real WebSocket portal flows, roster/re-entry/checkpoints, preparation combat, loot/results, intentional failed-save recovery and leaderboard persistence. Story chamber authority checks separately verify all six chambers, ordered puzzles, timed waves, lantern protection, personal treasure retry during transaction locks and no repeatable dungeon rewards.
- Actual `createStoryWorld` model review rendered all 54 quest objects and both personal encounter poses with valid isolated quest states and nonempty geometry; gallery/contact sheet: `artifacts/story-world/`. The neutral floor does not stand in for real-world placement or live encounter checks.
- IC tests cover all 24 skills, rescue durability/deadlines, repeated damage, swaps, action penalties, cleanup and existing shield objectives. Source-fidelity tests compare authored animation transforms with generated runtime assets.
- The complete final Mossvale-style review covers all 24 renderers on desktop and mobile, eight landscape views and the narrow-phone login: 57 current-style captures, with five contact sheets, plus six mobile merchant cases. The earlier 15-view focused pass and the earlier 57-view package-skin run remain separate historical evidence. The gallery uses 24 actual UI renderers and fixture data; it does not replace the full-game journey. Browser emulation is not physical Android/iOS verification. Gallery files are generated under `artifacts/benji-ui/`.
- Independent visual review caught and cleared four mobile layout findings: Store title/duration overlap, the referral header crossing its frame, orphaned talent text and cramped bag filters. The final bag keeps its original three-column filters and a complete first item row visible while item details are open. Referral and Instant Combat captures use populated offline fixtures rather than loading-only states. All 57 final cases report no runtime errors, broken images or viewport overflow.
- `npm run build` passed, including TypeScript checking. After the final mobile CSS review, Vite and `scripts/build-release.mjs` passed again with 1,244 verified release assets and 220 compressed assets. `npm run check:wiki` passed with 303 articles, 13 dungeon guides and 16,469 local references. Build revision metadata names the base commit because these changes are uncommitted. Existing large-chunk size warnings remain.
- Equipment and animation fidelity checks passed: 16 arsenal variants, four classes × three upgrade outcomes, 15 combat models, 114 clips and 570 source key poses; maximum source-bound error was 0.0733 mm. The Instant Combat runtime check also passed after the fire-school metadata integration.
- No production rollout, native-store publication or mainnet change was performed.


## September 29 — composition correction (local, verified)

The user found the previous pass visually too similar. This pass follows Benji's composition in the high-use HUD, story journal, bags and NPC service windows while keeping Mossvale's original materials and lettering. It supersedes the earlier instruction in this document to preserve incumbent layouts.

- Desktop: compact portrait/health frame, centered abilities and separate 8-by-2 menu dock. Real story progress, reward and readiness appear on the tracker; disabled specialist XP is hidden. Saved 30–100% HUD sizing remains.
- Journal: counted Active/Completed filters, selectable quest index and objective sheet; phone list/back navigation. Track pins the quest, and ready Return routes to the actual turn-in NPC. Legacy campaign and Hearthling remain reachable.
- Bags: direct Backpack entry, capacity tabs, case-insensitive item search, actual grid/list views, capped desktop workspace and in-window inspector. Item identity and action precede lock help in standalone bags. Items, locks, slots and server authority are preserved.
- NPCs: counted trainer filters and a single selected detail/action block beside the desktop list or underneath its row on phones. Focus follows the selected row rather than jumping onto Buy/Train.

Verification: TypeScript and release build; wiki integrity (304 articles); bag/search/drag/nonmodal, trainer/shop, onboarding and story UI checks. A real built-game local guest test entered the realm, tracked a quest, searched bags while preserving the caret, toggled list mode, opened an initially empty inspector, interacted with the authored quest object, saw Ready to return, and set the return waypoint. Objective progress persisted; no uncaught browser errors. It uses disposable data, not production accounts.

Visual evidence: 59 actual-renderer captures (24 desktop, 24 phone, 10 landscape, 1 narrow login). No image failures, runtime errors or horizontal/viewport overflow. NPC primary hit areas are at least 44px. HUD bounds checked at widths 801/1024/1440 and sizes 30/40/100%. Before/after comparison: `artifacts/ui-layout-2026-09-29/index.html`; full gallery: `artifacts/benji-ui/mossvale-gallery.html`.

| Independent finish finding | Verdict |
| --- | --- |
| Oversized desktop bag window | Resolved — 1100×720 cap |
| Journal header pushing actions below initial viewport | Resolved — compact header and bounded objectives |
| Phone bag lock help preceding the item action | Resolved — action first in DOM |
| NPC primary hit areas | Resolved — measured 44px minimum |

Final reviewer disposition: Pass. Mobile combat HUD composition remains unchanged. Secondary windows outside these focused surfaces retain their earlier layouts; this is not a claim that every Benji composition was rebuilt.

The Impeccable detector ran once over changed UI sources: 2 warnings and 487 advisory palette/type entries. The width-animation warning was resolved by removing the progress-width transition. The selected quest's left selection accent is intentional and visually reviewed; existing varied forest shades and compact type sizes remain. No second detector run was used to imply a clean scan.

Local worktree only. No commit, push, merge or deployment. Physical phone testing remains outstanding. Atlas stays paused; level 60, equipment +5, SP1 exclusion and disabled current specialist combat remain unchanged.
