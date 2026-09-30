# Voxel Quest

A browser-only voxel / anime chibi character in the style of the concept sheet (NosTale-like).
No build step, no model files: every character is built in code from boxes and 4-sided pyramids
(`src/character.js`) and animated procedurally.

## Run

Browsers block ES modules from `file://`, so serve the folder:

```
cd game
python3 -m http.server 8000     # or: npx serve
```

Then open http://localhost:8000.

## What's in it

- **Classes:** every player starts as the **Adventurer**. At Adventurer **Job Lv. 20**, Class Master Oren in
  Mossvale lets you pick one of three classes: **Knight**, **Ranger** or **Mage**. The choice is final and the
  Job Level resets to 1 for the new class. Main (XP) level goes up to 70.
  The class skill lists are placeholders (a basic attack and one special each) until they are designed.
  Each class has its own hair, outfit, colours, weapon and stats (`src/classes.js`). The Warrior design is kept
  in the code but is not playable right now.
- **Look:** low-poly chibi style matching the concept sheet: flat-shaded faceted parts with small chamfered
  edges, a big boxy head, simple tall dark eyes (they blink), a large mass of faceted hair, chunky gloves and boots.
- **Pet:** a dachshund companion (`src/pet.js`) stands next to the hero on the character screens and trots after
  you in the world, with a wagging tail, floppy ears and a red collar.
- **Animations:** idle (with blinking), walk, run, attack, skill, wave, victory, sit, hit.
  Attacks and skills are class-specific: greatsword slash / whirlwind, sword thrust / shield guard,
  bow shot / arrow volley, magic bolt / nova.
- **Modes:** Play (the open world), Character (single model, orbit with the mouse), Class paths (line-up like the concept sheet).
- **Options:** weapon on/off, turntable, pixel mode (low-res render for a pixel-art look), wireframe.

## Graphics

Everything in the world is real voxel art built in code:

- **Voxel engine** (`src/voxel.js`): models are built in a colour grid and meshed so only visible faces are drawn,
  with baked ambient occlusion in every corner and per-voxel colour variation (the MagicaVoxel look).
- **Props** (`src/props.js`): round oaks, pines, palms, bushes, mossy rocks, timber-frame cottages with tiled roofs
  and flower boxes, the fountain, market stall, lanterns, fences, barrels, crates, stone portal arches, clouds.
  4 voxels per world unit; each model is built once and merged into a few meshes per map.
- **Terrain** (`src/world.js`): height-mapped voxel ground with hills, terraces and mountain walls around every map,
  dirt paths, cobblestone plaza, sand, a pond and the sea, plus thousands of grass tufts and flowers.
- **Sky**: gradient sky dome, drifting voxel clouds, sun shadows that follow the hero.
- **Look (NosTale style)**: warm, bright, soft lighting with gentle fog, soft round shadows under characters and
  monsters, softer corner shading, a warm vignette. Trees and houses between the camera and the hero turn
  see-through.
- **Camera**: the default **Classic** view is a fixed high diagonal like NosTale (Q / E turn it in 90° steps).
  Press **V** (or the View button on phones) for the free 360° orbit; it tilts up over trees and hills.

## Sound and music

All audio is synthesized in the browser (`src/audio.js`, Web Audio API): no sound files, and all music is original.

- **Soundtrack:** one cozy track per map, looping.
  - **Mossvale Village:** a bouncy town theme in the style of NosTale's village music. A recorder melody with a clarinet
    harmony, pizzicato "oom-pah" strings, glockenspiel, soft strings and a tambourine.
  - **Clover Fields:** bright ocarina over plucked arpeggios. **Whisperwood:** slow, mysterious flute, harp and pads.
    **Pebble Coast:** breezy ocarina and marimba.
  - Tracks cross-fade when you walk through a gate.
- **Sound effects:** footsteps that change with the ground (grass, dirt path, cobblestone, sand), sword swings,
  hits, crits, misses, slingshot twang, Energy Bolt, shouts and buffs, dash, getting hurt, monster pops,
  level-up and job-level fanfares, portals, picking up stones, resting, villager chatter.
- The **♪** and **SFX** buttons in the top bar turn music and sound effects on or off (remembered in the browser).
- Browsers only start audio after you click, tap or press a key. On iPhone the ring/silent switch also mutes web audio.

## Open world

The game opens straight into the world as the Adventurer. Maps are linked by glowing stone gates at
their edges, NosTale style: walk into a gate and you load into the next map. Monsters wander, some
attack on sight, and they respawn after they die.

| Map | Level | Monsters | Gates |
|---|---|---|---|
| Mossvale Village | safe zone | training dummy | east → Clover Fields, north → Whisperwood |
| Clover Fields | Lv. 1-3 | Jelly, Hopper | west → Mossvale, east → Pebble Coast |
| Whisperwood | Lv. 4-6 | Shroomling, Grey Wolf (aggressive) | south → Mossvale |
| Pebble Coast | Lv. 4-6 | Rock Crab (aggressive), Tide Jelly | west → Clover Fields |

- **Hero:** level, HP, MP and XP. Kills give XP and Job XP. Level-ups raise HP, MP and attack.
- **Critical hits:** each class has a crit chance and crit damage (Adventurer 8% / 150%, Knight 6% / 140%,
  Ranger 15% / 180%, Mage 8% / 160%; crit damage also rises 1% per main level). Shown in the hero panel.
- **Combat:** click or tap a monster to attack it. Skills use the selected target, or the nearest monster, and walk into range first.
- **Resting:** sit (X) to heal quickly. If you die you return to Mossvale.
- **HUD:** player frame, target frame, a minimap with portals, monsters and NPCs, and the map name when you arrive.
- **Villagers** in Mossvale talk when you click them.

Add a map by adding an entry to `src/maps.js` and a portal pointing to it; monster types live in `src/monsters.js`.
This is single-player for now. Other players (the MMO part) need a game server, which is a later step.

## Phones and tablets (iOS and Android)

The game runs in mobile Safari and Chrome.

- **Touch controls** in Play: a joystick on the left (push it a little to walk, fully to run; the Sprint button toggles sprinting),
  tap the skill buttons on the right, Wave / Cheer / Sit buttons, tap the ground to walk there,
  drag with one finger to turn the camera,
  pinch with two fingers to zoom.
- **Landscape first:** playing with the phone upright shows a "Turn your phone" prompt. On Android its button goes full screen
  and locks landscape; iPhone browsers can't do that, so you rotate the phone. "Keep playing vertical" switches to a
  compact portrait HUD instead. The home-screen app opens in landscape.
- **Layout** adapts to portrait and landscape and keeps clear of the notch and home bar.
- **Performance:** lower resolution and smaller shadows on touch devices.
- **Home screen:** `manifest.webmanifest` and the icons in `icons/` let you add it to the home screen
  (iOS: Share → Add to Home Screen; Android: menu → Install app / Add to Home screen). It then opens
  full screen without the browser bar. This needs the game hosted on a web address; a phone can't open
  a folder from your computer.

## Adventurer skills

You start with **auto-attack only**: click a monster (or press Space) and the hero keeps swinging until it falls.
The hotbar starts with just two actions: **1 Sit** (rest to heal fast) and **2 Catch** (see Companions).
Other skills unlock by **Job level** (`src/skills.js`), but you must **learn them from Skill Master Kael** on the
Mossvale plaza. His window (or **K** anywhere) lets you put skills on slots 1–0: pick a skill, then click a slot;
click a filled slot to clear it. You earn Job XP from kills (and from hitting the dummy); the
"Unlock all" button in the HUD jumps to Job Lv. 20 for testing.

| Job Lv. | Skill | What it does |
|---|---|---|
| 1 | Swing | basic melee attack = auto-attack (Space / click a monster) |
| 2 | Shooting Slingshot | ranged shot, uses 1 stone |
| 4 | Strong Hit | heavy melee blow, 1.8x damage |
| 6 | Target Shooting | aimed slingshot shot, never misses, uses 1 stone |
| 8 | Energy Bolt | magic projectile (elemental damage) |
| 10 | Spinning Hit | spin attack that hits everything around you |
| 12 | Shout of Combat | self buff: attack +30% for 20 s |
| 15 | Beat Up | three-hit melee combo |
| 17 | Shout of Morale | self buff: defence +30%, hit chance +15% for 20 s |
| 19 | Charging Attack | rush to the enemy (up to 10 m) and strike |

## Tutorial and Training Grounds

The first time you play, **Guide Nora** walks you through the basics: walk to the Training Grounds, defeat 3
monsters with auto-attack, catch a companion, sit, and visit Kael. Every step has a **Skip tutorial** button, and
talking to Nora (plaza, next to the statue) replays it. Finishing gives 2 Saat and 100 gold.

The **Training Grounds** are the fenced pen north-west of the plaza (the town hall moved to the north-west corner of
town). Training Jellies and Hoppers (Lv. 1) live there. They never leave the pen, fight back even though the town is
a safe zone, and return 6 seconds after they fall: an easy place for your first levels.

## Companions (Catch)

Hit a monster until its HP is **below 50%**, then use **Catch** (slot 2, 5 MP, range 6, 4 s cooldown). Weaker and
lower-level monsters are easier to catch; if it breaks free, try again. Bosses and the dummy can't be caught.
Your first catch follows you right away: it attacks your target (auto-attack or any monster that is fighting you),
gets the XP of every kill and levels up (up to Lv. 70). You can keep up to 10; manage them in the Miniland menu
(**L → NosMates**): take one along, leave it at home, or release it. They are saved with your Miniland.

Stones for the slingshot (40 max) are refilled by walking over a grey stone pile (Mossvale, Clover Fields, Pebble Coast).

## Controls (Play)

| Key | Action |
|---|---|
| WASD / arrows, or click the ground | move |
| Hold Shift | sprint |
| V | switch Classic view ↔ free 360° view |
| Q / E | turn the camera (90° steps in Classic) |
| Drag (mouse or one finger) | turn the camera in 360° view |
| Mouse wheel / pinch | zoom |
| Click / tap a monster, or Space | auto-attack it |
| 1 / 2 | Sit / Catch |
| 3–0 | skills you set up (K opens the skill window) |
| Click a villager | talk |
| F / R / X | wave / cheer / sit |

## Files

| File | Contents |
|---|---|
| `index.html`, `style.css` | page and UI (desktop and mobile layouts) |
| `manifest.webmanifest`, `icons/` | home-screen app info and icons for iOS and Android |
| `src/classes.js` | class colours, hair style, outfit, weapon, stats |
| `src/skills.js` | Adventurer skill list, job levels, cooldowns |
| `src/tutorial.js` | Guide Nora's skippable tutorial |
| `src/companions.js` | caught monster companions (follow, fight, level up) |
| `src/character.js` | builds the voxel model, rig and all animations |
| `src/audio.js` | synthesized sound effects and the per-map soundtrack |
| `src/pet.js` | the dachshund companion model and animation |
| `src/effects.js` | slash arcs, arrows, magic bolts, particle bursts |
| `src/maps.js` | the maps, their portals, monster spawns |
| `src/voxel.js` | voxel grid and mesher (face culling, ambient occlusion, vertex colours) |
| `src/props.js` | voxel prop models (trees, houses, rocks, fountain, gates...) |
| `src/world.js` | builds a map: voxel terrain, props, grass, water, sky, portals, NPCs, monsters, minimap |
| `src/monsters.js` | monster types, voxel models, AI (wander, chase, attack, leash, respawn) |
| `src/main.js` | scene, camera, UI, modes, controls, combat, travel between maps |
| `vendor/` | three.js r160 and its OrbitControls / BufferGeometryUtils / RoundedBoxGeometry (bundled so it works offline) |

## Dungeons

| Dungeon | Entrance | Level | Monsters | Boss |
|---|---|---|---|---|
| Mossy Cavern | Whisperwood, east gate | 6-9 | Cave Slime, Stone Crab | Cavern King Slime |
| Sunken Grotto | Pebble Coast, south gate | 7-10 | Deep Jelly, Tide Crab | Grotto Crab Queen |
| Old Crypt | Clover Fields, south gate | 9-12 | Crypt Shroom, Ghost Wolf | Lich Shroom |
| Frost Hollow | Whisperwood, north gate | 11-14 | Frost Jelly, Snow Wolf | Alpha Frost Wolf |

Each boss waits at the far end of its dungeon; defeating it clears the dungeon and gives 3 Saat.
Bosses return after 90 seconds.

## Towns and villages

- **Mossvale** (168 × 168): cross streets from the four gates, a ring road and side streets lined with
  houses; market street east of the plaza (Mimi, Malcolm, Gerta), town hall, inn, smithy and chapel
  around the plaza, a farm with a windmill (north-east) and a park (south-east). About 20 NPCs; some walk around.
- **Brookhollow** (west gate of Mossvale): farming village with fields, hay and a big windmill.
- **Pinecrest** (west gate of the Whisperwood): lumber village with log cabins, a sawmill and log piles.
- **Saltmere** (north gate of Pebble Coast): fishing village with piers and boats by the sea.

Towns are generated from their definition in `src/maps.js` (`town`: streets, reserved districts, fixed
houses, props, farms, parks, NPCs); houses are placed along the streets automatically.

## Miniland (like NosTale)

Your home plot. Enter through the gate south of Mossvale, or ring a **Bell of Sweet Home** from the
Miniland menu (your position is saved; the Miniland exit brings you back). Bells: Malcolm, Mossvale market.

- **Menu (L or the Miniland button)**, everywhere: status, visitors and capacity, Production points, gold,
  welcome message; tabs for Objects, Minigames, Warehouse, Bag and NosMates.
- **Zones**: the stone **Terrace** (warehouses, carpets, pots, tea table, lantern), the **Garden**
  (residences, kennel, flower beds, well, windmill, statue, bench, gnome, signpost) and the dirt
  **Production area** (minigames only). Installing in the wrong zone is refused.
- **Install / Delete mode** only while the Miniland is **Locked**: pick an object in the tray, a ghost shows
  where it goes (green = allowed), click to place, **R** rotates.
- **Objects** are bought from Mimi Mentor (Mossvale market): residences set your visitor capacity
  (Tent 5, Cabin 10, Villa 20), warehouses store materials (7 to 35 slots).
- **Minigames**, each with Easy / Medium / Good tiers:
  Quarry (↑ mines, ← → squash caterpillars, a wrong swing freezes you), Sawmill (↑ ↓ at the mark,
  combos up to ×10), Fish Pond (four rods; golden fish need an arrow combo; devils cost a life) and
  Shooting Range (← → shoot, ↓ reloads, the golden rooster gives unlimited ammo).
  The score gives a reward level 1-5 of that game's materials (e.g. Stone / Iron Ore / Crystal).
  A reward costs 100 Production points (2000 a day; Production Coupons add 500) and durability
  (repair with gold). Upgrade a minigame with its materials and gold for better rewards.
- **Materials** go to your bag (20 slots) and warehouse; Gerta buys them for gold.
- **Dachshund**: leave him at home and he naps by his kennel.
- First visit: a Canvas Tent, a Tiny Chest, a Dog Kennel and a Quarry as housewarming gifts.
- Your Miniland, gold and materials are saved in the browser.

## Saat (revive)

When the hero falls, the death screen offers **Use 5 Saat**: revive on the spot with 50% HP and 50% MP
(2.5 seconds of protection to get up), or **Return to Mossvale Village**. After a Saat revive, Saat has a
5-minute cooldown; the HUD shows your Saat and the cooldown. You start with 5 Saat; monsters drop one
now and then (12%), bosses drop 3.

## Start the game

1. Install **Node.js 22 LTS** from https://nodejs.org (once).
2. Double-click **`START-GAME.bat`** (Windows) or **`start-game.command`** (macOS; on Linux run `./start-game.command`).
3. Your browser opens http://localhost:8080. Keep the window open while you play; closing it stops the game.

`server.mjs` is a tiny web server with no dependencies: it downloads nothing, only serves the files in this
folder, and only accepts connections from your own computer.

