# Current-realm story chambers

These six chambers implement the Quest Bible World Chamber rows through Mossvale's existing dungeon stages, room portals, authored GLB kits, seals, chests, checkpoints and monster systems. They do not use the paused atlas or SP1 trials.

| Chamber | Level | Encounter rooms | Entrance region; x,z | Quest | Existing art |
|---|---:|---:|---|---|---|
| Greenwood Root Chamber | 7 | 5 | Pinewake; -200,100 | story-the-sealed-root | Rootvault |
| The Broken Watch | 10 | 6 | Redleaf; -630,-420 | story-the-broken-watch | Cindercrypt |
| Ashbound Hall | 14 | 7 | Emberfall Ridge; 420,-170 | story-ashbound-hall | Cindercrypt |
| Frozen Memory | 18 | 8 | Stormcrag; 260,-650 | story-memory-beneath-ice | Frosthollow |
| The Hollow Door | 24 | 8 | Shadewood; 650,370 | story-the-hollow-door | Nightroot |
| Temple of the Veiled Sun | 44 | 10 | Glass Dunes; -1190,-1300 | story-temple-of-the-veiled-sun | Emberfall |

Room counts exclude the safe arrival foyer. The Sun temple has nine main-route rooms and one optional treasure room; clearing that side room is not a prerequisite for its guardian. Every other listed room is required. Each dungeon's `completionXp` is zero because its first-clear reward belongs to the one-time quest. Server entry, reward and record restrictions use the same story-chamber definitions.

## Source mechanics

- Greenwood: two root seals are mandatory portal requirements.
- Broken Watch: three repair mechanisms are mandatory portal requirements.
- Ashbound: clear → key → ambush → lever → defense → treasure → boss. The lever explicitly requires the recovered key, and opening the treasure chest is required before the boss portal opens.
- Frozen Memory: ordered numbered rune interactions, survival, two keys, an archive keeper, the central archive, gallery and Memory Warden. Reading the archive opens the next room. The rune order is visible in the interaction labels.
- Hollow Door: lantern, two ambushes, keys and lantern protection. The six-metre ward boundary is rendered in the same position/radius consumed by authority, with an existing brazier at its centre.
- Veiled Sun: timed spike trials, two key doors, ordered sun seals, optional treasure and guardian. Spikes are not added to the other story chambers.

## Explicit implementation defaults

The source specifies room counts, levels, sequence and mechanic categories, but does not provide metric floorplans, current-realm portal coordinates, detailed enemy packs, enemy stats, exact rune order, timed wave durations, protection radius or darkness damage. These are current-realm implementation defaults, not additional authored source facts:

- Existing regional monsters and boss attacks retain their established stat and damage systems. Names distinguish the chamber guardians; no new monster models were invented.
- Isolated arenas use existing portal travel with reciprocal arrivals four metres inward. Room proportions vary; every guardian court is 64×48 metres. Existing kits preserve the Mossvale appearance.
- Defense, survival and protection take 30 seconds with two-enemy waves at 0, 10 and 20 seconds. They start on actual room entry and also require every wave enemy to die. The protection radius is six metres. Server authority resets unguarded protection progress while enemies remain and applies 10% max-health darkness damage per second outside the light during the active protection objective.
- A midpoint checkpoint uses the existing secured-prefix reset mechanism.
- Repeated dungeon loot, records and completion payouts are excluded by `storyQuestId`; rewards come from the quest. Ashbound and the optional Sun chest each grant one Ancient coin per character, recorded in the durable story treasure flags. Full bags retain a personal retry even after the shared gate opens. They never roll ordinary dungeon caches.

## Verification

`node scripts/check-story-chambers.mjs` verifies exact source room/level/quest mappings; zero duplicate completion XP; existing kit files; all required object gates and ordered-puzzle dependencies; optional treasury traversal; reciprocal four-metre portal arrivals; sealed physical rooms; enemy/object/portal/checkpoint/return reachability with all spikes treated as raised; boss hazard support; and the three timed wave definitions. It also checks each entire temple footprint is dry, separates it from buildings and other dungeon approaches, and proves five breached-wall routes plus summon-stone access with authoritative collision and pathfinding.

The later spatial audit also passed dry, continuously traversable approach corridors from Willowbrook, Copperleaf, Cinderhome, Stormrest, Shadewick and Sunveil Bazaar respectively. It uses the final actual overworld and story enemy homes and authoritative spawn levels, excludes enemies more than two levels above the chamber plus all world-boss arenas, and adds aggro range, a seven-metre roaming envelope and ten-metre approach margin (at least 28 metres total). Entry, summon stone and landing points pass the same high-level enemy exclusion. Every route sample remains in a region whose minimum level is no higher than chamber level plus two. These are automated geometry and spawn checks, not a claim of six browser playthroughs; ordinary enemies at an appropriate level remain part of wilderness travel. No chamber entrance relocation was needed.

Existing dungeon gate checks include all 13 dungeons. Legacy roster/reward/asset tests retain their seven-dungeon scope. `node scripts/check-story-chambers-server.mjs` executes the shipped entry, spawn, interaction, timed objective, combat kill, completion, leave and wipe functions. It proves party quest/level gates, exact wave deadlines, minimum duration plus all-dead completion, lantern boundary/damage/reset, ordered public availability, actual bag capacity/retry, durable one-time treasure, reward/record exclusions, and checkpoint wipe/reentry. Renderer checks additionally assert the Hollow lantern marker matches the authoritative protection radius and only appears in its occupied room.

The server check also keeps a party member's account locked during a chest interaction, proves no reward or durable flag is written during that transaction, and then proves exactly one reward on retry after the lock ends. A member with full bags sees the shared chest's `opened` gate state while their personal reward remains unclaimed.

Legacy compatibility passed the reentry, rosters, preparation, boss models, themed loot, mechanics and room-client checks. The real WebSocket portal check passed all seven existing dungeons, including spoofed, distant and locked travel rejection, actual kill unlocks, stale movement correction and backtracking. The live themed-loot check passed Plagueworks, Emberfall and Veilhaven completion, results, partial/full claims, deliberately failed-save retries, once-only XP and durable leaderboard behavior. These are local-worktree checks; they do not establish deployment or native-store release status.
