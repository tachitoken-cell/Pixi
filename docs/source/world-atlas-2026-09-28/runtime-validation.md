# Atlas collision and route validation

The original viewer tests terrain tiles and permits height steps up to 3.2 world units. It does not test solid props. The game uses the same authored coordinates and terrain heights, with authoritative collision shared between client and server.

`scripts/build-world-atlas-data.mjs` generates the typed runtime map catalog from the preserved source files. Solid props use the supplied, transformed skeleton/rest geometry, clipped to a character body band 0.1–1.8 metres above each terrain tile’s world floor and conservatively rasterized into 0.25-metre cells. Consecutive cells merge into rectangles. Decorative visual effects and emissive meshes do not obstruct movement. Trees with explicit source trunk radii use those radii and their authored scale; their overhead canopies do not obstruct paths. Water, wall and void tiles merge into exact tile rectangles. Client and server share the resulting collision and maximum terrain step of 3.2.

Six solid prop placements obstructed arrivals or travel when collision was enabled. These explicit runtime corrections preserve every asset, all terrain, gate/door locations, arrival coordinates and source export files. Rendering and collision use the same corrected runtime placement. The complete original and replacement tuples, with reasons, are recorded in `runtime-corrections.json` and asserted against the source before generation.

| Map | Prop | Original `(x,z)` | Runtime `(x,z)` | Reason |
|---|---|---|---|---|
| Magma Mine 1 | Ember ore | `(64.6,29.5)` | `(65.1,28)` | Clear start and east gate arrival. |
| Sunken Crypt 1 | Tomb | `(42.5,6.5)` | `(40,6.5)` | Clear start and north gate arrival. |
| Sunken Crypt 1 | Tomb | `(6.5,30.5)` | `(6.5,28)` | Clear west gate arrival. |
| Sunken Crypt 2 | Tomb | `(66.5,42.5)` | `(68,40)` | Clear start and east gate arrival. |
| Sunken Crypt 2 | Tomb | `(42.5,66.5)` | `(40,68)` | Clear south gate arrival. |
| Rune Labyrinth 1 | Bookshelf | `(5.6,49.5)` | `(5.6,48.5)` | Leave body clearance past the adjacent tank; both gates were otherwise in separate components. |

`node scripts/check-world-atlas.mjs` verifies 39 maps, six five-map realms, raw catalog parity plus only these documented corrections, known instance IDs, strict persisted positions, exact merged tile footprints, generated geometry parity, 70 reciprocal gate arrivals and 12 reciprocal realm-door arrivals. A half-metre navigation graph checks that each map start reaches every usable exit and every local arrival. The game A* is tested using the same atlas traversal predicate and half-metre grid. Swept collision and steep-cliff cases verify movement cannot tunnel through obstacles or skip intermediate terrain steps. Jump tests preserve the old-world defaults and physical airborne collision while supporting authored atlas stairs.

The Mill Plains trial gate has no authored destination and remains non-traversable. These validations do not supply missing quests, NPC services, monster definitions or trial content.

## Integration evidence

`npm run check:world-atlas` also validates conversion of all 102 models and 116 animation clips, terrain and map rendering, camera clearance at all 39 starts, foreground prop occlusion, animated doors, and resource disposal. Its local WebSocket check covers guarded entry, shared and isolated maps, parties, jumping, forged travel requests, reciprocal gates and realm doors, stationary portal protection, restart persistence, the original-world return position, and unchanged character progress. The production workflow runs this check with its shared-progress suite.

A local browser journey used the actual game: guest character roster, town entry into the atlas, movement through Greenwood Meadows, reconnecting there, walking back through its Lanternreach gate, and the map's Return to town action. The original Greenwood town, NPCs, character health and onboarding were present after returning. The only browser error observed was an installed wallet extension's duplicate `ethereum` injection; no game error was recorded. The separate 39-map inspection gallery is under `artifacts/world-atlas/index.html`; it verifies visual/loading behavior, not populated combat encounters. No production rollout was performed.

## Consolidated movement integration

Atlas maps retain their validated authored heightfield and ground-level prop collision through explicit atlas movement helpers. They never select Rootvault collision geometry. The existing world and combat instances retain the solid-body jump controller, the 1.5m grounded overworld-terrain step and the global collision cache budget. Climbing remains disabled. Atlas rendering retains its separate bounded decoded-model cache.
