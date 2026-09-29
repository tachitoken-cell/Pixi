# Skills, crafting and social composition — September 29, 2026

This is the component-by-component mapping for `original/windows.js` (`createTalentWindow`, `createWorkshopWindow`, `createSpellbookWindow`, `createAchievementWindow`, `createFriendsWindow`), `original/windows.css`, and the corresponding responsive rules in `original/mobile.css`. `original/mobile.js` supplies the touch/menu composition; the coordinator owns that shared HUD and menu implementation. Reference data and demo handlers are design examples, not authoritative game data.

The implementation retains Mossvale's Marcellus/DM Sans fonts, forest/parchment/gold colors, existing wood and ornate frames, authored spell/talent icons, achievement illustrations, and class portraits. No sample balances, ownership, skill unlocks or social state were imported. These changes are local; this document does not claim deployment or a physical-device test.

## Spellbook

Runtime: `src/hotbar.ts`, spellbook-scoped rules in `src/hotbar.css`. The existing main-owned Combat/Professions navigation remains the entry surface.

| Reference part | Implemented or adapted behavior |
| --- | --- |
| Combat/Professions tabs | Existing actual skill/profession menu retained. Gathering professions use the live profession guide rather than pretending passive gathering is a hotbar spell. |
| Search and learned count | Implemented with case-insensitive name/description search, actual class-level learned count, and a no-match state. |
| Learned and locked icon grids | Implemented using every current class spell, including talent-granted skills, plus Mend/Interact utilities. Locked primary controls remain disabled; separate labeled Inspect controls expose their requirements. |
| On-bar badge and selected skill | Implemented from the actual pending/confirmed hotbar layout. Selecting a skill highlights its tile and updates a persistent inspector. |
| Inspector description/stats/requirements | Actual gear/passive-adjusted values, cast/channel timing, range and cooldown; proc-dependent timing refreshes only text so the focused action is retained. |
| Put on the hotbar | Uses the first empty slot of the current page, existing uniqueness/swap logic, edit lock, validation and save callback. Full-page feedback leaves the layout intact. Existing select-then-slot and drag/drop remain available. |
| Locked skill trainer action | Routes through the existing class-trainer action. It never learns remotely or bypasses level/talent prerequisites. |
| Type tag legend | Adapted to actual skill descriptions and metadata. The live catalog does not define the demo's uniform attack/defense/utility tag taxonomy, so no invented tag system or colors are presented. |
| Two ten-slot desktop banks, swap, clear and reset | Existing live controls and keyboard support retained. Reset restores the character's starter layout, preserving the current game meaning rather than changing it to the demo's clear-current-bank action. |
| Mobile skill pages | Five slots per page, four pages covering all 20 saved slots. Desktop still has two ten-slot banks. The coordinator owns the separate five-skill arc and mobile menu CSS. |
| Responsive detail | Desktop library/detail columns; phone library and readable inspector stack. Search and inspector actions are at least 44px high, icon labels can wrap, and no horizontal overflow is needed in portrait or landscape. A short-landscape header variant preserves an action-height scroll area when a keyboard reduces the available viewport. |

## Talents

Runtime: `src/progression-ui.ts`, `src/talents.css`. Main imports the stylesheet and calls `mountTalentBranches(panelContent)` beside the existing hover mount.

| Reference part | Implemented or adapted behavior |
| --- | --- |
| Talent/spell navigation | Existing main-owned skills/talents entry controls retained rather than introducing a second stateful spell renderer inside the talent tree. |
| Available/spent point summary and rule | Implemented from the actual level-60 progression and saved allocations; existing reset cost and eligibility remain visible. |
| Three branch cards, header art and description | All actual class branches appear together on desktop with the existing themed icons. |
| Dependency links, ranks and state | Existing real prerequisites, required branch points, rank caps, disabled states, current/next-rank details and keyboard/hover tooltips retained. |
| Branch footer and progress | Actual spent points, maxed-node count and progress toward the branch's total authored ranks. |
| Learning/reset | Existing server messages, Gold cost and combat restrictions remain authoritative. The source's locally mutated ranks and demo success toasts are not copied. |
| Right-click rank removal | Unavailable: the live protocol supports full paid reset, not individual rank refunds. No unusable or misleading control is shown. |
| Demo reset confirmation | Adapted to the existing explicit paid Reset action and server response, preserving the established reset flow. |
| Mobile branch navigation | Three native radio tabs show one full-width branch at a time. Selection survives authoritative rerenders and resets when the character/class changes. Changing tabs cannot spend points. |
| Motion | No new animated node movement; reduced-motion rules suppress decorative transitions. |

## Workshop

Runtime: `src/adventure-ui.ts::renderCrafting`, crafting-only rules in `src/adventure.css`.

| Reference part | Implemented or adapted behavior |
| --- | --- |
| Workshop hero and profession outline | Added a distinct workshop heading and a desktop progression sidebar beside the working recipe column. |
| Rank/XP progress, rank ladder, practice and next unlock | Actual profession XP, four live ranks (Apprentice/Journeyman/Expert/Artisan), recommended practice, next recipe unlock and maximum crafting level 99. This independent profession cap does not change the adventure cap of 60. |
| Workshop status and resource directions | Existing proximity status, Find workshop, Find gathering resources and per-missing-material routes retained. |
| Materials and recipe accordions | Actual inventory counts and native expandable rank sections, including inspectable locked recipes. Mobile stacks these sections with accessible summaries. |
| Recipe art, discipline, output stats and requirements | Existing class-filtered catalog, authored gear/item art, output count/stats, ingredient have/need values, missing-material sources, real Gold fees, bag-capacity checks and XP difficulty retained. |
| Quantity stepper | Adapted to **one authoritative batch per click**, explicitly stated in the header. The existing `craft` protocol accepts a recipe ID, not a batch quantity; a fake local quantity or a burst of unconfirmed requests would misstate the actual transaction. |
| Craft success animation | Uses the existing server-result feedback. The source timer that immediately consumes mock materials and locally grants an output is not reproduced. No success is shown before the server result. |
| Mobile layout | Progression, materials, outlined ranks and recipe details stack; costs and primary actions remain readable and wrap within the phone width. |

## Friends

Runtime: `src/friends-ui.ts`, `src/friends.css`.

| Reference part | Implemented or adapted behavior |
| --- | --- |
| Portrait header, online summary and counted tabs | Existing real Friends/Who/Requests/Ignore lists and counts retained in a compact centered company ledger. |
| Search | Added case-insensitive search across the current list; query changes preserve the input, clear stale action selection, produce an explicit no-match state and send no request. |
| Online/offline groups | Added grouped, name-sorted friend rows using actual presence. |
| Compact selectable rows and class/location | Existing escaped names, class portraits, level and online location retained; selected row gets a gold edge and explicit action summary. Offline exact last-seen timestamps are unavailable in the live payload, so none are fabricated. |
| Whisper/invite/remove/ignore | Existing selected-row action shelf retains live eligibility and authority. It adapts the demo's hover-only row actions into touch/keyboard-accessible controls. The existing explicit Remove action is retained; the demo's local two-click deletion is not substituted for server state. |
| Who, party and dungeons | Actual party invite/respond/promote/kick/leave and dungeon entry callbacks remain, including level/onboarding/instance locks. No mock party success. |
| Requests and send form | Existing incoming Accept/Decline and outgoing Cancel remain; separate name-entry form preserves its draft through snapshots and waits for server confirmation. |
| Mobile composition | Horizontal counted tabs, a dedicated search row, scrollable compact rows and wrapping 44px actions; short landscape can scroll the complete window. Existing touch-held control retention remains. |

## Achievements

Runtime: `src/achievements-ui.ts`, `src/achievements.css`.

| Reference part | Implemented or adapted behavior |
| --- | --- |
| Illustrated header, character and points | Existing real artwork, earned total and points retained. |
| Category navigation and completion counts | Existing actual categories retained; mobile turns the sidebar into a horizontal category rail. |
| Search and earned/in-progress status | Existing live filters and explicit empty state retained. Non-summary results now sort earned first, then fractional objective progress as the source specifies. |
| Overall completion ring | Added actual percentage, earned/total count, remaining achievement count and remaining points. |
| Category overview and recent results | Existing accessible category buttons/progress retained; recent list now shows the latest four earned achievements. New characters still see useful first milestones. |
| Earned dates, objective progress, points and title reward | Existing actual achievement definitions and saved timestamps retained; no sample rewards. |
| Displayed title | Existing server-confirmed selection, unlock/account entitlement checks and pending/rejection behavior retained. The source's immediate local title mutation is not copied. |
| Mobile composition | Horizontal category rail, single-column achievement cards, compact completion ring, full-width search/status controls and wrapping title footer. |
| Unlock animation | Existing authoritative achievement notification is retained; reduced-motion behavior remains. |

## Verification and boundaries

Passed locally: `node scripts/check-hotbar.mjs`, `node scripts/check-adventure-ui.mjs`, `node scripts/check-friends-ui.mjs`, `node scripts/check-achievements-ui.mjs`, and TypeScript compilation. `scripts/check-skills-social-ui.mjs` executes the actual modules in Chrome: spell search/locked inspection/equip/edit locking/timing, all 20 mobile slots, talent branch selection and snapshot retention, crafting proximity/rank gates, portrait/landscape horizontal bounds, plus the coordinator's actual collection search/filter callback with focus/caret restoration through no-results and results. It does not take screenshots or claim visual approval.

`check-progression-ui.mjs` now passes for all four classes at the current level-60 cap. Its fixtures use the supplied catalog’s actual branch-point prerequisites; no gameplay gate was loosened.

The coordinator owns the final combined desktop/mobile gallery, shared menu/HUD controls, built-game authority and final release report. Mobile panel geometry is checked separately by `check-mobile-panels.mjs` plus its generated browser fixture; its current result is recorded in the final combined verification, not inferred from the HTML-generation command.

`node scripts/check-mobile-panels.mjs --browser` now passes all 84 cases with zero failures or browser errors. The fixture checks the current standalone backpack, empty selection and absent item actions after dismissal and refresh, actual close controls, nested scrolling, focus and 44px touch targets. The short-landscape inventory correction keeps the filter rows compact and lets item actions wrap at usable widths. All five Store categories are scroll-reachable, including the 844×210 keyboard viewport with a 40px offset. `npm run check:mobile` also passes; its fixture-generation step is distinct from the actual browser run. Evidence: `artifacts/mobile-hud/panel-results.json`.