# Mossvale atlas source, 28 September 2026

Authoritative reference: [linked atlas artifact](https://claude.ai/artifact/XpAfNzz6CGTNviF5VPqTeQ). The catalog and each explicitly referenced map, thumbnail and model were fetched as data from its public file host. No remote JavaScript was executed by the acquisition process.

- `world.json` here is an unchanged provenance copy of the source catalog.
- `manifest.json` records every downloaded URL, byte count and SHA-256 hash.
- `audit.json` records every map, gate pair, door, boss zone and validation summary.
- `viewer-source.txt` is the authored viewer script archived as inert text, with its vendor preamble removed. It is a reference for interpreting the data, not runtime code. SHA-256: `c55b473a75d1e4cccc42345a2a69ec06df38204ffe9bdadfb363f1c7395f46da`.
- Unchanged raw files are retained under `/public/world-atlas/`: `world.json`, `maps/<id>.json`, `assets/<asset-id>.json`, and `thumbs/<map-id>.png`.
- The artifact's renderer first loads `assets/<asset-id>.json`, then falls back to `world.assets[id].file`. All primary asset paths succeeded. The catalog's legacy `export/`, `../../v19/` and `../../v8/` paths were preserved as source metadata; they need not be followed locally.

## Verified inventory

39 maps = 9 overworld maps plus 6 connected realm worlds of 5 maps each. The catalog supplies 7 region records and 15 visual styles. There are 8,675 prop placements, 70 directed map gates forming 35 reciprocal pairs, 6 realm entrance/return pairs, and one dungeon entrance without a destination. Every map is reachable from Lanternreach through those explicit connections.

There are 232 spawn zones containing 1,023 nominal creature slots, including 6 boss slots. These numbers specify placement density, not active server population, encounter balancing or spawn scheduling.

All 102 models are referenced: 249 meshes, 101,024 vertices, 363 skeleton bones and 116 animation clips. The 181 downloaded files total 9,112,062 bytes: 59,044 catalog, 1,375,393 map JSON, 419,360 thumbnails and 7,258,265 model JSON. Models contain their geometry, vertex colors, materials, skeletons and animations; they reference no additional textures, audio or binary files. Thumbnails are PNG at twice the map grid width/height: 144, 168 or 192 pixels square.

Validation checked catalog/map counts, height/surface dimensions, known surface codes, prop asset IDs, all reciprocal gates and target sides, graph reachability, mesh vertex/normal/bone-array sizes and submesh index ranges. No structural errors were found. Numeric completeness and gameplay omissions remain below.

## Raw schema and coordinate boundaries

`world.json` is `format: mossvale.world`, `version: 1`. It contains `about`, `surface_codes`, `gate_asset`, `regions`, `maps`, `styles` and `assets`. Each map catalog row includes stable id/name, region, type/style, advertised level string, a two-number atlas layout coordinate, square size, map/thumbnail file paths, placement counts, boss flag and abbreviated connections. The `atlas` coordinate is a diagram placement; it does not define a seamless world offset.

Each map is `format: mossvale.map`, `version: 1`, with these exact fields:

| Field | Shape | Meaning established by source data |
|---|---|---|
| `id`, `name`, `region`, `type`, `style`, `levels` | strings | Identity, classification and advertised level band. |
| `size` | `[width, height]` | Tile dimensions: 23 maps at 96×96, 15 at 72×72, Lanternreach at 84×84. |
| `h` | integer array of `width*height` | Raw heights in world units, ranging 0–41. The authored viewer uses `h[floor(z)*width+floor(x)]` directly, with one tile per world unit. |
| `s` | string of `width*height` | One surface code per tile. |
| `props` | `[assetId,x,y,z,rotationY,scale][]` | World-unit placement, rotation about Y in radians, and uniform scale; the viewer applies these directly. |
| `gates` | `{side,x,y,z,ry,arrive:[x,z],to,to_side,label}[]` | Directed local gate, reciprocal target gate and a local arrival point. Arrival values belong to the map containing that gate. |
| `doors` | typed records | Realm entrance or return includes asset/position/rotation, local `arrive`, `to_region`, `to`, label; entrance also has levels. Dungeon door only has asset/position/rotation and a note. |
| `spawns` | `{x,z,r,count,level:[min,max],boss?:true}[]` | Zone center/radius, nominal count, numeric level band; no species identifier or respawn rule. |
| `start` | `[x,z]` | Local start coordinate. |
| `monster_kinds` | string | Broad prose, such as “slimes, forest sprites, boars, a treant boss”. |
| `safe` | boolean | True only for Lanternreach. |

Surface codes: `g` ground, `p` path, `c` cobble, `b` bridge, `w` water, `s` shore, `f` floor, `t` second floor tone, `l` glowing lava/rune line, `W` wall, and a literal space for void. Rendering colors, fog, light, sky and particle descriptors come from the 15 style records. The map files themselves do not define walkability or damage rules; the authored viewer supplies the traversal behavior described below.

The 102 assets are `format: horned_apostle.skinned_model`, `version: 2`, nominally +Y-up/+Z-forward/right-handed/meters at 24 fps. Skeleton records carry parent, rest translation/quaternion/scale and inverse bind matrix; several root rests rotate -90° around X, so the raw mesh arrays cannot be assumed already world aligned. Mesh records contain `positions`, `normals`, vertex `colors`, per-vertex `bone` indices, `role` and submeshes with material/index lists. Animation clips contain frames/duration/loop/events and per-bone sampled translation/rotation/scale tracks. Asset metadata includes kind, footprint, height, solid flag and sometimes `collide_radius`, `light`, `surface` or named spawn-marker bones. Footprint/solid metadata alone is not an authored detailed collider mesh.

## Authored viewer semantics

The archived viewer indexes tiles by `floor(z)*width+floor(x)`, treats a space surface as absent terrain, and places terrain at the unscaled raw height. Water renders 0.35 units above that height, while the player uses the raw ground height. Player movement checks non-void, non-wall (`W`), non-water (`w`) tiles and permits height differences up to 3.2 units. It moves at 7 units/second with frame delta capped at 0.05 seconds. The viewer does not test prop collisions, lava damage, combat or server authority. Those omissions are not evidence that solid props should be passable in the game.

Automatic traversal uses a gate distance below 1.8 units or a realm-door/return distance below 2.4 units. The target arrival comes from the target map's reciprocal gate (`side === source.to_side`) or opposite-kind door. Portals re-arm only after moving more than 3 units from all gates and non-dungeon doors. A nearby door can also be activated within 6.5 units using the action button or E. Initial map entry uses an explicit arrival or `map.start`. The SP gate only plays its activation animation and a trials-system message; no trial destination is implemented by the viewer.

Static model rendering composes skeleton rest transforms before baking geometry; animated models retain the bone hierarchy. Submeshes use vertex colors and material emission. The model data's sampled animation tracks provide translation, quaternion rotation and scale at 24 fps. Monsters in this viewer are generated placeholder boxes: at most 3 or 5 per zone depending on display quality, and one per boss zone. Their visual wander behavior is not a supplied species catalog or combat implementation.

## Gameplay omissions and inconsistent advertised ranges

- No NPC entity positions, names, vendor inventories, trainer offerings, service interactions or schedules are supplied. Town market stalls, notice board, fountain and other landmark models are decorative placements, not service definitions.
- No quest IDs, objectives, dialogue, rewards, prerequisites or progression graph are supplied.
- No item definitions, loot tables, drop chances, currency/XP rewards or economy rules are supplied.
- Monster prose does not map any zone to a stable species/model ID. No health, damage, attack range/cadence, movement speed, aggro/leash, abilities, respawn interval, kill credit or boss mechanics are defined. The referenced viewer's placeholder monsters do not fill those omissions.
- Seven overworld fields have **zero spawn zones**: Greenwood Meadows, Mill Plains, Brookside Fields, Old Ruins Crossing, Frostpeak Foothills, Cindergrove Edge and Sunscar Outskirts. Blightmarsh Border alone has seven zones/35 slots; Lanternreach has none and is safe. Do not silently create spawns to make all fields look populated.
- Each final realm map has one boss zone whose numeric level ceiling is two levels above the map/region advertised ceiling: Heartwood Hollow 6–8 vs 5–6, Cinder Peak 10–12 vs 8–10, Hag's Hollow 17–19 vs 15–17, Frozen Peak 21–23 vs 19–21, Wyrm's Rest 26–28 vs 24–26, Floating Sanctum 30–32 vs 28–30. Preserve both raw values and resolve intended gameplay explicitly.
- The `sp-gate` on Mill Plains says “SP trials (v8)” but has no destination, return/arrival mapping, trial map catalog, challenge definition or progression contract. Its three animation clips (`idle`, `activate`, `enter`) are present; the missing dungeon is not.
- Level strings are descriptive; there is no explicit transition level lock, fee, quest gate, party rule or loading/re-entry policy.
- File format version 1 and model version 2 are format revisions, not application save-schema or player-migration versions. No mapping from existing Mossvale zones/positions or persisted character progress is supplied.

## All maps

| Map ID | Region | Style | Levels | Size | Props | Gates | Doors | Spawn zones / slots |
|---|---|---|---|---|---:|---:|---:|---:|
| `lanternreach` | overworld | town | — | 84×84 | 186 | 4 | 0 | 0 / 0 |
| `greenwood-meadows` | overworld | greenwood | 1-5 | 96×96 | 264 | 3 | 1 | 0 / 0 |
| `mill-plains` | overworld | greenwood | 2-6 | 96×96 | 263 | 1 | 1 | 0 / 0 |
| `brookside-fields` | overworld | greenwood | 3-7 | 96×96 | 270 | 2 | 0 | 0 / 0 |
| `old-ruins-crossing` | overworld | ruins | 20-28 | 96×96 | 188 | 3 | 1 | 0 / 0 |
| `frostpeak-foothills` | overworld | frostpeak | 12-18 | 96×96 | 333 | 2 | 1 | 0 / 0 |
| `blightmarsh-border` | overworld | blightmarsh | 9-15 | 96×96 | 290 | 3 | 1 | 7 / 35 |
| `cindergrove-edge` | overworld | cindergrove | 4-9 | 96×96 | 324 | 2 | 1 | 0 / 0 |
| `sunscar-outskirts` | overworld | sunscar | 16-24 | 96×96 | 248 | 2 | 1 | 0 / 0 |
| `hollowroot-grove` | hollowroot | greenwood | 1-2 | 96×96 | 342 | 1 | 1 | 7 / 28 |
| `rootway-tunnels-1` | hollowroot | rootway | 2-3 | 72×72 | 61 | 2 | 0 | 8 / 37 |
| `rootway-tunnels-2` | hollowroot | rootway | 3-4 | 72×72 | 61 | 2 | 0 | 8 / 39 |
| `mushroom-glade` | hollowroot | glade | 4-5 | 96×96 | 339 | 2 | 0 | 7 / 35 |
| `heartwood-hollow` | hollowroot | greenwood | 5-6 | 96×96 | 342 | 1 | 0 | 7 / 30 |
| `ember-fields` | emberdeep | cindergrove | 4-5 | 96×96 | 401 | 1 | 1 | 7 / 30 |
| `magma-mine-1` | emberdeep | magma-mine | 5-6 | 72×72 | 208 | 2 | 0 | 8 / 44 |
| `magma-mine-2` | emberdeep | magma-mine | 6-7 | 72×72 | 181 | 2 | 0 | 8 / 36 |
| `cinder-caves` | emberdeep | cinder-cave | 7-8 | 72×72 | 44 | 2 | 0 | 8 / 33 |
| `cinder-peak` | emberdeep | cindergrove | 8-10 | 96×96 | 392 | 1 | 0 | 7 / 23 |
| `rotting-fen` | rotting-maw | blightmarsh | 10-11 | 96×96 | 351 | 1 | 1 | 7 / 33 |
| `bogwater-crossing` | rotting-maw | blightmarsh | 11-12 | 96×96 | 334 | 2 | 0 | 7 / 34 |
| `sunken-crypt-1` | rotting-maw | crypt | 12-14 | 72×72 | 69 | 2 | 0 | 8 / 40 |
| `sunken-crypt-2` | rotting-maw | crypt | 14-15 | 72×72 | 65 | 2 | 0 | 8 / 35 |
| `hags-hollow` | rotting-maw | blightmarsh | 15-17 | 96×96 | 353 | 1 | 0 | 7 / 22 |
| `rimefang-slopes` | rimefang | frostpeak | 14-15 | 96×96 | 440 | 1 | 1 | 7 / 32 |
| `ice-cave-1` | rimefang | ice-cave | 15-16 | 72×72 | 44 | 2 | 0 | 8 / 40 |
| `ice-cave-2` | rimefang | ice-cave | 16-18 | 72×72 | 51 | 2 | 0 | 8 / 36 |
| `ice-cave-3` | rimefang | ice-cave | 18-19 | 72×72 | 52 | 2 | 0 | 8 / 36 |
| `frozen-peak` | rimefang | frostpeak | 19-21 | 96×96 | 418 | 1 | 0 | 7 / 23 |
| `scorched-dunes` | sun-wyrm | sunscar | 18-19 | 96×96 | 311 | 1 | 1 | 7 / 31 |
| `canyon-pass` | sun-wyrm | sunscar | 19-21 | 96×96 | 304 | 2 | 0 | 7 / 33 |
| `sun-temple-1` | sun-wyrm | temple | 21-22 | 72×72 | 101 | 2 | 0 | 8 / 31 |
| `sun-temple-2` | sun-wyrm | temple | 22-24 | 72×72 | 91 | 2 | 0 | 8 / 34 |
| `wyrms-rest` | sun-wyrm | sunscar | 24-26 | 96×96 | 311 | 1 | 0 | 7 / 32 |
| `vault-gardens` | shattered-vault | ruins | 22-23 | 96×96 | 227 | 1 | 1 | 7 / 36 |
| `rune-labyrinth-1` | shattered-vault | lab | 23-25 | 72×72 | 61 | 2 | 0 | 8 / 32 |
| `rune-labyrinth-2` | shattered-vault | lab | 25-26 | 72×72 | 66 | 2 | 0 | 8 / 32 |
| `rune-labyrinth-3` | shattered-vault | lab | 26-28 | 72×72 | 45 | 2 | 0 | 8 / 33 |
| `floating-sanctum` | shattered-vault | ruins | 28-30 | 96×96 | 244 | 1 | 0 | 7 / 28 |

## Gate pairs

Each line below is reciprocal; exact positions and arrival points remain in the corresponding map JSON.

- `lanternreach` (E) ↔ `greenwood-meadows` (W).
- `lanternreach` (N) ↔ `old-ruins-crossing` (S).
- `lanternreach` (S) ↔ `mill-plains` (N).
- `lanternreach` (W) ↔ `brookside-fields` (E).
- `greenwood-meadows` (E) ↔ `cindergrove-edge` (W).
- `greenwood-meadows` (N) ↔ `blightmarsh-border` (S).
- `brookside-fields` (N) ↔ `frostpeak-foothills` (S).
- `old-ruins-crossing` (E) ↔ `blightmarsh-border` (W).
- `old-ruins-crossing` (W) ↔ `frostpeak-foothills` (E).
- `blightmarsh-border` (E) ↔ `sunscar-outskirts` (W).
- `cindergrove-edge` (N) ↔ `sunscar-outskirts` (S).
- `hollowroot-grove` (E) ↔ `rootway-tunnels-1` (W).
- `rootway-tunnels-1` (E) ↔ `rootway-tunnels-2` (W).
- `rootway-tunnels-2` (N) ↔ `mushroom-glade` (S).
- `mushroom-glade` (E) ↔ `heartwood-hollow` (W).
- `ember-fields` (E) ↔ `magma-mine-1` (W).
- `magma-mine-1` (E) ↔ `magma-mine-2` (W).
- `magma-mine-2` (N) ↔ `cinder-caves` (S).
- `cinder-caves` (E) ↔ `cinder-peak` (W).
- `rotting-fen` (E) ↔ `bogwater-crossing` (W).
- `bogwater-crossing` (E) ↔ `sunken-crypt-1` (W).
- `sunken-crypt-1` (N) ↔ `sunken-crypt-2` (S).
- `sunken-crypt-2` (E) ↔ `hags-hollow` (W).
- `rimefang-slopes` (E) ↔ `ice-cave-1` (W).
- `ice-cave-1` (E) ↔ `ice-cave-2` (W).
- `ice-cave-2` (N) ↔ `ice-cave-3` (S).
- `ice-cave-3` (E) ↔ `frozen-peak` (W).
- `scorched-dunes` (E) ↔ `canyon-pass` (W).
- `canyon-pass` (E) ↔ `sun-temple-1` (W).
- `sun-temple-1` (N) ↔ `sun-temple-2` (S).
- `sun-temple-2` (E) ↔ `wyrms-rest` (W).
- `vault-gardens` (E) ↔ `rune-labyrinth-1` (W).
- `rune-labyrinth-1` (E) ↔ `rune-labyrinth-2` (W).
- `rune-labyrinth-2` (N) ↔ `rune-labyrinth-3` (S).
- `rune-labyrinth-3` (E) ↔ `floating-sanctum` (W).

## Realm doors

- `greenwood-meadows` ↔ `hollowroot-grove` (Hollowroot, 1-6); a return portal is present on the latter map.
- `old-ruins-crossing` ↔ `vault-gardens` (The Shattered Vault, 22-30); a return portal is present on the latter map.
- `frostpeak-foothills` ↔ `rimefang-slopes` (Rimefang, 14-21); a return portal is present on the latter map.
- `blightmarsh-border` ↔ `rotting-fen` (The Rotting Maw, 10-17); a return portal is present on the latter map.
- `cindergrove-edge` ↔ `ember-fields` (Emberdeep, 4-10); a return portal is present on the latter map.
- `sunscar-outskirts` ↔ `scorched-dunes` (Temple of the Sun Wyrm, 18-26); a return portal is present on the latter map.
- `mill-plains`: `sp-gate`, SP trials v8, destination unspecified.

## Confirmed integration choice

The user confirmed this atlas is a **separate additional world**. The current Mossvale overworld remains available and unchanged; visiting the atlas does not replace existing zones, quests, inventory, character progression or services. The game enters the atlas from town and provides a return to the existing town. A separate optional atlas location records the visit while the existing world coordinates remain the return point. The raw source does not authorize inventing missing NPC, monster, quest, loot or SP-trial gameplay.

## Local visual review

`world-atlas-review.html` is a local Vite inspection page for all 39 maps, using the game's atlas renderer, model files, collision functions and existing character model. It provides overview, arrival, walking and linked gate/door views. It has no game server, combat population, NPC services, quests or rewards.

With Vite running, use `node scripts/check-world-atlas-browser.mjs http://127.0.0.1:5199` (replace the port as needed). The browser check captures an overview and arrival view for every map, a mobile arrival view, renderer metrics and an HTML gallery under the ignored `artifacts/world-atlas/` directory. This is visual and loading evidence; server-authority, persistence and gameplay need the separate server checks. Disable Vite HMR/file watching during long capture runs if other work is generating HTML or changing shared modules.
