# Mossvale gathering and crafting

The familiar profession loop is adapted from [World of Warcraft's gathering and crafting professions](https://worldofwarcraft.blizzard.com/en-us/news/23826545): find resources, practice a trade, unlock better recipes, and return to a workshop. All models are original Mossvale Blender geometry with the existing faceted woodland palette.

| Rank | Profession level | Mining | Woodcutting | Herbalism |
| --- | --- | --- | --- | --- |
| Apprentice | 1–9 | Grove crystal | Timber tree | Wild herbs |
| Journeyman | 10–24 | Copper vein | Silver birch | Moonpetal |
| Expert | 25–49 | Cobalt vein | Ironwood | Frostbloom |
| Artisan | 50–99 | Sunstone vein | Elderwood | Sunblossom |

Gathering and crafting use the existing saved XP fields. No character reset or inventory migration is required. Challenging work gives full XP, practiced work 60%, familiar work 25%; the previous rank gives no skill XP once the next rank opens. Materials remain useful. Every level below 99 has a repeatable way forward.

Crafting shares one workshop skill across alchemy, smithing and woodworking. Each rank has a repeatable remedies recipe; woodland remedies begin the route, then moonpetal, frostbloom and sunblossom batches produce greater tonics restoring 100 HP. Bark and frost-shard monster drops can be refined into existing wood and crystal stacks. Weapon and armor recipes add useful milestones at adventure levels 12, 25 and 50 for all four classes. Original recipes remain available at their original adventure levels.

The journal shows current rank, next unlock, the best practice recipe, actual XP, ingredient have/need counts, missing-material routes, item stats and visible lock reasons. Gathering routes favor the richest unlocked resource. All town workshops support all disciplines; their visual specialty varies by region.

## Art

- `scripts/build-gathering-assets.py` builds 12 resource models and 3 workshop models with Blender 5.2.
- `assets/source/gathering-kit.blend` is editable; `public/models/gathering-kit.glb` is the runtime kit.
- Every resource has persistent base/stump geometry and separate harvestable geometry. Harvest and regrowth reuse the game's authoritative availability state.
- Station detail includes anvil, tongs, bellows, hearth masonry, copper still, condenser, glassware, mortar, saw, chisels, vise and timber end grain.
- The kit uses 27 merged parts and 49,136 triangles total. Each resource uses 2 mesh parts; each station uses 1. Shared source assets survive individual node disposal.
- `public/ui/gathering/` holds 12 transparent Blender renders used in the journal.

## Review locally

Run `npm run dev`, then open `/professions-preview.html`. The preview uses the shipped models, profession rules and journal renderers with explicitly labeled sample data. It has collection selection, close views, harvest/regrowth comparison and sample rank controls. It never writes character progress.

Run `npm run check:professions` and `npm run build`. Checks cover unlock boundaries and reachability, gather interruption and persistence, crafting outputs and equipment use, input validation, duplicate escrow, full bags, resource placement, model budgets and ownership, journal lock states and material routes. Browser evidence is in `assets/qa/professions/`.

Verified locally with `npm run check:professions`, `node scripts/check-navigation.mjs`, `npx tsc --noEmit` and `npm run build`. The final desktop/mobile preview and Blender gallery passed an independent visual review. The older standalone `check-skills` and `check-realm-server` scripts still have stale world-position fixtures; this is not a claim that the entire repository suite passes.

The changes are also applied to the local main checkout, preserving its existing dungeon and branding edits. A task snapshot is saved on `codex/professions`; production has not been deployed.
