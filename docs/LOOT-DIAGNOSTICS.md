# Investigating a player's loot

Join the player's realm with a verified GM account. Open **Game master**, select
their online character, choose **Start loot trace**, and apply. Let the player
farm normally. Use **Stop loot trace**, then **Download loot trace** and the JSON
download link. Downloading while the trace runs is also supported.

The selected player's summary shows whether tracing is active and the event
count. A disconnected character remains in the GM selector for stopping and
downloading its report. Starting again after a trace stops replaces its report.

Each realm holds at most five traces in memory. A trace stops after 30 minutes or
1,000 events. Starting a new player replaces the oldest stopped report when all
five slots are occupied; five active traces block another start. Download useful
reports promptly: a realm restart clears them, and account/character deletion
removes the affected report. Traces do not follow a character to another realm.

## Reading the report

- `generated`: correlate by `dropId`. The `map` object records eligibility, the
  actual 0–99 draw against the 5% threshold, whether the character was the killer,
  and whether a map was awarded. `rolls` records ordinary item and gear rolls,
  class/level/quality eligibility and randomized quality selection. `items` is
  the actual corpse content, including gold.
- `pickup_decision`: eligible items and skipped item reasons (rarity, bag space,
  ownership/level/class), or range/path/death-animation restrictions. Repeated
  identical decisions are suppressed. `pet_state` records casting, saving and
  other states that stop pet collection; it includes an interrupted corpse target
  where one exists.
- `pickup_attempt`, `pickup_saved`, `pickup_save_failed`: distinguish a generated
  drop from a committed inventory change. Saved counts come from the authoritative
  player after persistence; failures retain the corpse items for retry.
- `loot_removed`: remaining items when a corpse expires or its dungeon closes.
  `existing_loot` identifies corpses that predate the trace. `left_world` marks a
  disconnect or return to character selection. `treasure_map_saved` records an
  explicitly used map or completed map action.
- `cache_generated` and `completion_loot`: dungeon chest and completion rewards.

There is no retroactive history. A report that hits its time/event limit is
incomplete after that point. Logs contain character IDs/names and loot details,
but no account identities, tokens, wallet addresses or chat. Only authenticated
GMs can enable tracing or receive a report; ordinary snapshots and player saves
contain no trace data. Tracing observes existing random draws and never rerolls
loot. The pet's casting behavior is unchanged by this diagnostic feature.

Run `npm run check:loot-trace` to verify limits, authorization, roll equivalence,
collection/save outcomes and GM report export.
