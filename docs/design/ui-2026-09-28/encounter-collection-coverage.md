# Encounter and collection composition — September 29, 2026

This maps the supplied reference components to the local implementation. Source JavaScript and JSON are design reference data, not runtime code. The original Mossvale Marcellus/DM Sans fonts, wood frames, forest/gold palette, raid palette and existing companion/cosmetic art remain in use. No demo balances, ownership, matchmaking, role quotas, notifications or encounter tuning were imported.

Sources: `original/windows.js` (`createArenaWindow`, `createRaidWindow`, `createCollectionWindow`, `createDungeonWindow`), their `original/data/{instant-combat,raid,collection,dungeons}.json` catalogs, `original/windows.css`, and `original/mobile.css`. `npc.js` contains no replacement encounter/companion surface; its NPC-only interaction examples do not authorize remote services.

## Instant Combat

Runtime: `src/instant-combat-ui.ts`, `src/instant-combat.css`. The reference calls this `createArenaWindow`; this is the cooperative Instant Combat event, not rated PvP.

| Reference component | Implementation and data contract |
| --- | --- |
| Event hero, map and boss | Implemented with the existing Bone Pit/Void Rift scene art and scheduled `instantCombatEncounter`, or the actual current run's map/boss. |
| Large countdown and UTC start | Implemented from server `startsAt`; current runs instead show the round or authoritative phase countdown. Hours display when needed. |
| Previous/registration/start timeline and markers | Implemented from `intervalMs`, `registrationOpensAt`, `startsAt`; clamped progress and accessible time description. Hidden during the current encounter, where phase status takes precedence. |
| Registration status | Actual registered state/count and opening time. Registration still uses the existing register/unregister messages and level/connection gates. |
| Rounds × groups, arena bracket, players, preparation tiles | Implemented from the authoritative constants and current run. No source sample player count is used. |
| Five gold bars, boss XP/gear chance and material note | Implemented with `instantCombatWaveReward` for the actual level bracket and the player's economy version. These describe personal pickups, not monster rewards. |
| Numbered rules | Implemented with current entry, cooperation, pursuit, death/reentry and pickup rules. Preparation/break/return timings come from current constants. |
| Next four events | Implemented from the server's next start plus the real interval and map/boss rotation; UTC labels and machine-readable full timestamps. |
| Level-bracket chips | Implemented from the actual bracket catalog; the character's or run's bracket is highlighted. |
| Register footer | Implemented using existing action attributes. An active run has the existing Leave/Return action instead. |
| Reminder toggle | Unavailable: the reference only toggles a local demo variable and toast. The game has no persisted event-reminder delivery contract. No misleading reminder control is shown. The existing actual registration invitation remains. |
| Mobile composition | Two-column facts, five compact reward bars with the boss reward below, wrapping timeline labels, readable scheduled rows, 44px primary actions. |

The existing in-game HUD, invitation Join/Decline handlers, darkness/control effects, boss objective and death/return behavior remain intact.

## Horned Apostle raid

Runtime: `src/raid-ui.ts`, `src/raid-progression-ui.ts`, `src/raid.css`; the existing `main.ts` menu owns the Encounter/Raid Collection tabs and Store/NFT entry controls.

| Reference component | Implementation and data contract |
| --- | --- |
| Encounter/collection tabs | Existing real menu retained. Both renderers now have the reference's internal composition. |
| Boss hero, title, level/size/clear chips | Implemented with existing Apostle art, `APOSTLE_RAID` limits and the character's actual clear count. |
| Six chambers → Morgrath → Apostle route | Implemented from `RAID_APPROACH_ROOMS`, with authored room names. Active runs highlight the actual room; earlier rooms are marked cleared. |
| Tank/healer/damage role tiles | Adapted to advisory responsibilities. The game does not enforce demo role quotas; the actual ready-count launch rules remain unchanged. |
| Form Raid | Existing create action and level/alive/open-world restrictions preserved. |
| Find a Group | Unavailable: source handler only displays a toast. No matchmaking service exists. Real raid invitations, lobby roster and online candidate invitations remain the grouping flow. |
| Numbered encounter guide accordion | Implemented with the current real approach, Marks, clones, suits, Death Realm and final-counter mechanics; open by default before forming. |
| In-progress lobby/encounter | Existing ready/start, co-leader, kick, invite, tactics, safe room advance, wipe retry and saved-result guards preserved. These authoritative states extend the source demo. |
| Three currency tiles | Implemented from actual raid Sigils, Apostle's Souls and Evolution Cores. |
| Cosmetics count, art, collected status and cards | Implemented from `RAID_COSMETICS`, actual ownership/equipment and real per-clear chances. Existing Equip/Unequip actions remain. |
| Pet preview and three evolution steps | Implemented using existing Death Apostle art and persisted evolution. |
| Evolution cost/progress/action | Actual costs 1/3/6 cores; final stage also requires one Soul. The progress bar and button agree with the existing eligibility/material gates. No local demo mutation occurs. |
| Reward-chance accordion | Implemented as label/chance rows from `RAID_REWARD_TABLE`, preserving independent rolls, duplicate conversion and first-clear title explanation. |
| Store entry | Existing main-owned Store action retained; no new purchase path. |
| Specialist management | Existing preserved-card management remains below the collection. SP activation is disabled, as authorized; no new SP1 mechanic or art was added. |
| Mobile composition | Route wraps to four columns; cosmetic cards become art/detail rows; pet evolution uses compact art with readable detail; role/currency tiles stack at narrow-phone widths; actions and guide controls retain 44px targets. |

## Pets and mounts

Runtime: `src/pet-ui.ts`, `src/pet-ui.css`; `main.ts` owns local filter state, event delegation, focus/selection preservation and the existing live preview lifecycle.

| Reference component | Implementation and data contract |
| --- | --- |
| Pets/Mounts tabs and collected counts | Implemented from each real catalog and learned plus current-wallet ownership. Duplicate IDs and unknown/retired catalog IDs outside the catalog cannot inflate counts. Existing supported retired pets remain in the catalog and count normally. |
| Active collection total and progress bar | Implemented with the true catalog denominator. Unlearned carried items do not count as collected. |
| Pet loot preference and explanation | Existing authoritative rarity selector and collection/path/capacity rules retained, including when a search has no matches. |
| Search | Implemented as case-insensitive, trimmed name search with escaped input and a result count. No server mutation. |
| Collected-only filter | Implemented from actual learned/wallet access; excludes unlearned bag items. |
| Selectable list and ownership/status | Implemented with current Summoned/Riding/Learned/Wallet/In backpack states. Filtered-out selection cannot retain an unrelated action. |
| Preview and rotation | Existing actual 3D preview, image fallback, drag/keyboard rotation and accessible rotation buttons retained. The demo's mirrored image is not substituted for the actual model. |
| Name, ownership, description and source | Existing catalog descriptions, drop sources/chances, referral milestones and verified ownership states retained. |
| Summon/Dismiss | Existing server-gated pet action and mount riding, level/training/outdoors/2-second cast rules retained. |
| Extra live actions | Existing Learn, NFT review/conversion, preferred mount, trainer directions, riding partner and combat companion behavior preserved. These replace the source's demo-only local ownership toggles. |
| Notes accordions | Existing trading/NFT ownership explanations and separate combat-companion disclosure retained; source demo text cannot override real ownership or payment behavior. |
| Empty result | Explicit no-match message and still-usable search/filter controls. No stale preview or ownership action. |
| Mobile composition | List/filter column stacks above a full-width preview and detail. The list is a bounded 190px scroll region so all catalog entries remain accessible without pushing the selected companion far below the viewport; this deliberately adapts the source's unbounded mobile list. Search uses 16px text and controls use 44px targets. |

## Dungeon boundary

`createDungeonWindow` is owned by the root task because its actual renderer is inline `main.ts::renderDungeonPanel`. Its source list/detail, level/recommendation states, facts, numbered instructions, rewards, party and gate/stone controls are tracked in the root coverage and final gallery. This file does not claim that work passed on behalf of the root task.

## Verification and release status

Local focused checks passed after these changes: `check-instant-combat-ui.mjs`, `check-raid-ui.mjs`, `check-raid-progression.mjs`, and `check-pet-client.mjs`. Added cases cover real bracket/economy rewards, four UTC rotations, route state, true collection counts, wallet ownership, filtered selection, escaped search, empty-state actions and final pet evolution's Soul requirement. Existing authority, SP-disable and payment/ownership checks remain in place. TypeScript compilation also passed during implementation.

The root task owns the final desktop/mobile gallery, populated Raid Collection capture, shared event wiring and built-game review. Those final screenshots are pending at this handoff. These changes are local only; no commit, merge, deployment or physical-device verification is claimed here.
