# Dungeon clear rules

Implements [#53](https://github.com/trappyon/mossvale/issues/53) with the Moss Gate route prototype in [#49](https://github.com/trappyon/mossvale/issues/49).

- Preparation is untimed. The first accepted room teleport starts the server clock; deaths, wipes and rejoining an active run never reset it. Every authored combat stage, including side chambers, must be cleared. Kills count actual defeats, including repeated stages after wipes. Dreams are excluded.
- Results contain four personal slots: earned XP; one existing equipment roll (which may miss); crystals; and relics, combining the existing completion bonus and cache supplies. XP is credited once. Items roll once, can be collected individually, and use the existing saved loot transaction. Failed saves and full bags leave the reward available. Uncollected completion items last until the instance is destroyed; collect before leaving.
- Rankings are the 20 fastest runs per dungeon and opening party size. The original party must all enter before the timer starts and remain until completion. Leaving, replacing members or GM assistance excludes rankings without withholding results or rewards. Equal times sort by completion timestamp, then run ID. Public realms share PostgreSQL; the development file store is local to its realm. Only the server creates records, and run IDs deduplicate retries.
- `Mossvale_Moss_Gates_TS_Style_Maps_v2.pdf` supplies the linear, fork and hub route direction. This prototype keeps the seven established dungeons and entry requirements, varies chamber proportions, and uses one to three exits with short side-room chains. Combat exits unlock only after the entire room is clear. Its proposed timed campaigns, life limits and objective modes remain separate designs.

## Gear abundance assessment

No drop probabilities were changed. The three themed dungeons have 93, 93 and 96 enemies, including two bosses, plus eight personal caches. For a player credited on every kill and eligible for equipment, the additional ordinary-enemy roll averages 27.3, 27.3 and 28.2 gear items (30% per non-boss). Eight cache rolls average 3.2 items (40% each), the midpoint boss adds 0.55 and the full-clear roll adds 0.70: approximately 31.75, 31.75 and 32.65 additional rolled items per complete run. This excludes unrelated fixed-table loot and assumes no wipe farming. Original-dungeon fixed gear tables differ and would need separate modeling.

Moving the existing completion roll from the final boss to full clearance adds no extra roll and makes that reward require all side encounters. Gear remains class- and level-eligible through the shared loot function; its existing quality distributions, ownership exclusions and unique rolled IDs remain in force. A broader drop reduction would affect gearing, vendor income and upgrade material demand; those progression targets have not been specified. No wipe or general economy reduction is included. Instant Combat is a separate system and its retained failure loot is unchanged.

## Checks

- `node scripts/check-dungeon-records.mjs --postgres`
- `node scripts/check-themed-dungeon-loot-server.mjs`
- `node scripts/check-dungeon-expansion-server.mjs --dungeon=veilhaven`
- `node scripts/check-dungeon-room-portals.mjs`
- `npm run check:wiki` and `npm run build`
