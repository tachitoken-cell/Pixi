# Mossvale

The entry screen and wallet sign-in use a live 3D woodland. Wallet sign-in uses a
signed, single-use message through Keycloak; it never submits a payment. The
custom password/registration theme and the account-preserving deployment process
are documented in [the authentication guide](auth-theme/README.md). Run
`npm run check:login` for the wallet and login checks, and `npm run build:auth-theme`
to build the theme assets. The wallet provider stays disabled until configured.

[Play Mossvale](https://mossvale.world/) · [Wiki](https://wiki.mossvale.world/) · [Source](https://github.com/trappyon/mossvale)

The [wiki publishing guide](wiki/README.md) covers its independent static build,
source-backed content and Cloudflare deployment. Run `npm run check:wiki` to build
and verify the guides.

A small multiplayer browser RPG built with Three.js. Explore a connected voxel landscape inspired by Cube World and build your character through quests, gathering, crafting and party dungeons.

- Account registration followed by a six-slot character roster. Create Ranger, Knight, Mage or Cleric adventurers with permanent names, callings and appearances.
- Real WebSocket multiplayer, world chat, and parties of up to four with private chat.
- A 1,536 × 1,536 world: four scattered towns, twelve small villages and sixteen wilderness camps, with stepped hills, elevated settlements, coastlines, rivers and islands; 13 repeatable board contracts and 41 workshop recipes.
- The Rootvault: eight encounters across a large branching temple, rune seals, personal treasure, a sanctuary checkpoint, and a boss with attacks you can dodge.
- **The Lanterns Between:** a complete nine-chapter story with two persistent endings and postgame revisits.
- Distinct enemies and gathering resources, leveling, inventory and potions; 124 class spells, plus Mend and Interact, with a saved eight-slot hotbar for each character.
- Server-authoritative movement, collision, combat, objectives, loot, crafting and party permissions.
- Journal waypoints, NPC dialogue and a zoomable 3D voxel atlas.
- Adaptive chiptune music: three variations per biome and dungeon, plus combat arrangements (42 total). Distinct cast, release and impact sounds cover all 124 spells.
- Settings save separate music and effects volumes. Run `npm run check:audio` for audio checks.
- Optional Keycloak sign-in with Authorization Code + PKCE S256.
- PostgreSQL player persistence when configured; local JSON saves otherwise.

One authoritative Node process simulates each realm. Europe, North America and Asia share character progress and the auction house through canonical PostgreSQL storage; each realm runs its own world when provisioned.

## The Lanterns Between

| Zone | Landmarks and encounters |
| --- | --- |
| Greenwood | Lanternreach capital, its grand clocktower and stone walls, woodland slimes and grove crystals |
| Amberwild | Sable's cartographer camp, autumn forest, ruined aqueduct, briar sentinels and the Amber Beacon |
| Frostmarch | Iona's observatory, a frozen lake and stone crossing, ice wisps and the Frost Beacon |
| The Hollow | Eris's refuge, luminous fungi, immense roots and the Rootbound Warden's Worldheart arena |

Restore the outer beacons, discover how Eris became the first keeper, and return to Rowan to choose whether to **rekindle the shared light** or **release the old magic**. Both endings persist with the character and leave all four zones available to revisit. See [EXPANSION.md](EXPANSION.md) for the chapter list and implementation details.

## Achievements

Open **Achievements** with **Y** or the trophy in the game menu. Each character can earn 29 achievements across Character, Combat, Quests, Exploration, Professions and Dungeons. The window shows points, recent unlocks, category progress, search and earned/in-progress filters; new unlocks appear as a trophy notification. Points are a record of accomplishment, with no gameplay bonus.

The realm records unlocks and dates from accepted gameplay and saves them with the character. Existing characters receive credit for progress still recorded in their save; historical totals that were never recorded start from the available evidence. Run `npm run check:achievements` for gameplay, persistence and UI checks.

Each achievement has its own generated fantasy icon. Ten achievements also unlock a player title; choose **Displayed title** at the bottom of the window, or **No title** to hide it. Titles appear beneath player names and on character sheets. The realm validates and saves each character's selection. **Beta Tester** is a separate account entitlement for accounts registered before 13 September 2026, Stockholm time, with a current character, plus independently verified older characters. It is available to every character on an entitled account. Run `npm run check:titles` for selection, entitlement, persistence and save-failure checks.

## Run locally

Use **Node.js 22.18 or newer**; the checks use Node's TypeScript stripping support.

```sh
npm install
npm run dev
```

Open [localhost:5173](http://localhost:5173). The development command starts Vite and the game server; its proxy expects the backend on port 2567. Open another browser profile to join as another local player.

The title screen offers Sign in and Create account when Keycloak is configured, or Continue as guest in an unconfigured local realm. Account sessions resume through Keycloak on reload and open character selection. The Account menu provides **Character selection** to switch adventurers without signing out, plus account sign-out.

For local account support, copy `.env.example` to `.env.local` and fill in `KEYCLOAK_URL`, `KEYCLOAK_REALM` and `KEYCLOAK_CLIENT_ID`; `npm run dev` reads that file for the server. Register `http://localhost:5173/*` as an allowed client redirect.

Without a database, account rosters and character progress are saved in `.data/players.json`. Guest and signed-in characters have separate identities; enabling sign-in preserves existing guest records. Keep that directory to retain local progress.

Character selection has a **Delete character** action. The popup names the adventurer and requires the exact text **I confirm**. Deletion permanently removes that character and its stored items/progress, while keeping the login account and other characters. Cancel or Escape closes an unsubmitted confirmation. Characters with auction listings or pending auction payments must resolve those first. The server verifies ownership, saves deletion before acknowledgment, and preserves an empty roster when the last character is removed. Run `npm run check:character-deletion` for confirmation, ownership, escrow, failed-save and restart checks.

## Game masters

Assign the dedicated **`gm` realm role** in Keycloak to a trusted account, then sign out and back in. Never add it to the realm's default roles. The server reads this role only from a verified access token; guests, character names and saved/browser fields cannot grant GM access. Keycloak includes realm roles in `realm_access.roles` by default ([role mapping documentation](https://www.keycloak.org/docs/latest/server_admin/#_role_scope_mappings)). Removing the role takes effect on the next token/session; an existing token remains valid until its expiry.

Game masters display a **GM** badge beside their name and in chat. Their **GM** button and player context-menu entry open a floating administration window. Select an online character, including players in other dungeon instances, then choose **Ban**, **Kick**, **Kill**, **Level up**, **Give gold** or **Spawn items**. Opening the window performs no action. Ban and kick require a reason; banning requires confirmation and blocks the entire account across reconnects and server restarts. GMs cannot ban themselves or another active GM.

**Teleport to player** moves you to the selected character; **Bring player here** moves them to you. **Return player** restores their last location before a GM relocation, and **Return myself** does the same for you. Each character has one return slot for the current session. If the original dungeon has closed, return uses its overworld exit instead.

**Invisible**, **Hide GM tag**, and **Fly** affect your own GM session. Fly with **WASD**, hold **Space** to rise and **Ctrl** to descend. Invisible GMs are excluded from ordinary players' world and party snapshots; hiding the tag leaves GM permissions intact. The server requires a live, authenticated GM session for every command and every flight movement, validates movement speed and height, and ignores saved or browser-supplied permission flags. These modes reset when you leave or reconnect.

Level grants add levels up to 60. Gold and item grants use bounded positive integers; equipment must fit the recipient's class and level, remain unique across bags/bank/auctions, and fit available bag space. Item spawning covers supplies, loot, gear and bags. Persistent changes are saved before success is reported, conflicting transactions are rejected, and the server logs administrator and target IDs with each action's outcome.

## Character progression

Register or sign in to your account, then use **Character selection** to create and choose up to six adventurers. Creating a character returns to the roster; select **Enter world** to play. Account credentials belong to the account, while every character has independent appearance, class, story, professions, talents, gear, inventory, gold and hotbar layout.

Review each character's name, calling and appearance before selecting **Create character**: those choices are permanent. Create another character to try a different calling. **C** opens the current character's sheet and equipment; **Account → Character selection** returns to the roster without signing out. Selecting a character shows its current voxel appearance and equipped gear before entering. Creation fills the screen with an original Blender-built 3D woodland scene with real lighting and shadows: appearance controls on the left, a rotatable live avatar in the center, class and ability details on the right, and the name and confirmation below. Narrow screens stack these controls without hiding them.

Existing accounts migrate into the roster with their adventurer and all progress preserved. Unfinished old character drafts become empty rosters. Reload returns to character selection; a realm outage keeps character selection visible until reconnection, then requires manual entry. The server checks character ownership and keeps characters waiting in the roster outside the shared world.

**N**, or the Skill Tree button, toggles a standalone floating skill-tree window with three connected branches for each calling, nine nodes per branch, rank counters, prerequisite arrows and locked states. You can keep moving and fighting while it is open. **K** opens Combat or Professions and remembers that category independently. Start with one talent point and earn another per adventure level. Hover or focus an icon to inspect its bonuses and requirements; click an available icon to buy one rank. Higher tiers require points in their branch and the linked prerequisite ranks. Learned ranks are permanent, and old talent choices retain their effects. The server validates every allocation and applies its bonuses to combat.

**C** opens floating character and bag windows over the playable world, with a live, rotatable character view with nine equipment slots (head, body, legs, shoes, back, necklace, two rings and weapon), combat stats and adjacent bag windows. Select an item to inspect its stats and compare it with equipped gear. Equip with the detail button, double-click a gear icon, or drag it onto its matching slot. Replaced equipment returns to the bag. Optional pieces can be unequipped; weapon and body slots always stay filled. Ring details let you choose either ring slot, and one owned ring cannot occupy both. **B** toggles the bag, with resource stacks, potion use and gold. Move, target, attack and interact with the world while character, bag or talent windows are open. UI clicks stay inside the windows; Escape closes them. Closing the character view leaves its open bag available.

Every character starts with a 16-slot backpack and four extra bag sockets. Buy Linen Pouches (8 slots), Trail Satchels (12), Wayfarer Packs (16) and Runewoven Holdalls (24) from Hilda's armor shop in Lanternreach or village merchants. A purchase equips into the first empty socket; four holdalls provide 112 total slots. Drag a spare bag to a socket or select its equip button to replace one. A shared desktop inventory frame keeps every bag section and all 112 possible slots visible without scrolling. The bag bar toggles individual sections; selecting an item opens its details beside the inventory, including a rotatable Blender model for bags. Full bags prevent item gains or smaller replacements safely; existing saves receive only the extra capacity needed to preserve their items. Spare unequipped bags can be sold back to these merchants. Run `npm run check:bags` for capacity, server, UI and asset checks.

**B → Supplies** sells weapon and body upgrades, class hats, leggings, shoes and cloaks, plus necklaces and rings. The 14 new pieces are available from level one for 20–45 gold. Buy with gold earned through encounters, quests, or selling gathered wood, crystals and herbs. Purchased gear enters your collection; equip it from **C** to gain its stats and visible voxel details. Starter gear remains available to equip. Gold, ownership, loadout and talents persist with your character. Purchases, sales, talent requirements and identity changes are validated by the server.

The wearable sets were authored in Blender: Ranger leather and feathered hood, Knight steel plate, and Mage robes and wizard hat. Boots and leggings follow each leg, shoulder armor follows the arms, rings follow the hands, and cloaks follow the cape pivot during movement, combat and swimming. Starter clothes preserve your chosen outfit colors. The 159 KB kit and 17 rendered item icons share their original source in `assets/source/gear-kit.blend`; rebuild with `blender -b --python scripts/build-gear-assets.py -- --render --optimize`. `node scripts/check-equipment.mjs` checks server authority and save migration; `node scripts/check-gear-assets.mjs` checks the real exported meshes, attachment pivots and preview framing.

## Mounts and sprinting

Visit a **riding trainer** at level 25 to learn Apprentice riding for **100 gold** (10 m/s). At level 50, Expert riding costs **500 gold** and upgrades your speed to 14 m/s. A separate **mount seller** sells the Blender-built **Briar Horse** for **75 gold** and **Moonfang Wolf** for **125 gold** after you learn to ride. Press **H** to mount or dismount; **Settings → Your mounts** opens your collection and can guide you to either NPC. Riding is outdoors on dry land. Accepted attacks and gathering, deep water, dungeons, death and character changes dismount you. Other players see your mount and rider animation.

Hold **Shift**, or hold the Sprint button on touchscreens, to run at 8.2 m/s (walking is 5.8 m/s). Stamina lasts eight seconds of continuous sprinting, then you return to walking until it recovers to 25. Stamina recovers at 18 per second after a 0.6-second pause in sprinting. The HUD shows fatigue and recovery; faster strides, a forward lean and heavier recovery breathing accompany the movement. The server validates speeds, level gates and stamina, including reconnects and repeated mount toggles.

Source mounts are in `assets/source/mounts.blend`; rebuild the model and thumbnails with `blender -b --python scripts/build-mount-assets.py`. `node scripts/check-travel.mjs` exercises the real server rules; `node scripts/check-mount-animation.mjs` checks the exported mounts, race-specific saddle alignment, reins and animation resets.

## Spells and hotbar

Each calling has **31 spells**: a level-1 primary attack and one new trainer lesson at **2, 4, 6, …, 60**. Visit the matching **Ranger, Knight, Mage or Cleric trainer**; a lesson costs its required level × 5 gold (10–300 gold). The spellbook can set a waypoint to your nearest class trainer. Rangers specialize in arrows and crowd control, Knights in melee and protection, Mages in elemental magic, and Clerics in holy damage, healing and shields. Equipment and talents improve spell power without lengthening casts. The spellbook displays power, range, cooldowns and whether an ability is instant, cast or channeled. Mend consumes a healing potion, while Interact gathers, loots or uses nearby stations. See [the spell catalog and casting rules](docs/SPELLS.md).

Open **K → Combat** to arrange the eight-slot hotbar. Drag a spell onto a slot in the spellbook's editor, or click/tap a spell and then a slot. With a spell selected, press **1–8** to assign it. Dragging an occupied slot onto another swaps them; you can also reorder the live hotbar outside menus. Select an occupied editor slot and use **Clear selected slot**, or focus a slot and press **Delete/Backspace**. **Reset** restores the class defaults. Editing does not cast spells.

Trainer windows sit beside the playfield with an NPC portrait, compact selectable lessons, level requirements and gold prices. Filter available, unavailable or learned lessons, inspect the selected details, then press **Train**. Riding trainers and mount sellers use the same layout. Movement and hotbar controls remain active; leaving interaction range closes the window. Purchases wait for server confirmation before becoming available again. Run `node scripts/check-training-ui.mjs`; `artifacts/trainer-preview.html` provides an isolated visual preview with simulated purchases.

Merchants use a compact NPC portrait window with **Buy** and **Sell** tabs, category filters, six items per page, and details beside the selected item. The footer holds your wallet and one action; choose **1** or **All** when selling a stack. Trading stays beside the live world and closes when you move out of range. Run `node scripts/check-shop-ui.mjs` or open `artifacts/vendor-preview.html` through Vite for isolated purchase and sale fixtures.

Number keys **1–8** follow your saved assignments. The default layout puts your primary attack in slot 1, Mend in slot 3 and Interact in slot 4; locked spells start as blank slots. Assign newly learned spells from the spellbook. **Space** jumps. **E** interacts with a selected resource, corpse or station within three meters; with nothing selected, it uses the closest nearby interactable without selecting it. It never starts an attack or walks you into range. Cooldown overlays show when abilities become ready. Layouts save to the active character and return on reload; switching characters loads that character's layout. Narrow screens display the hotbar in two rows.

## Open-world adventures

All regions are open from level one. The playable world measures **1,536 × 1,536 meters**, four times the area of the previous 768 × 768 world and sixty-four times the original compact map. Greenwood, Amberwild, Frostmarch and the Hollow have separate town locations spread across the landscape. Twelve small villages provide sheltered stops between the four towns, and sixteen wilderness camps contain gathering resources. There are 348 wilderness mob homes, including 300 additional encounters. Idle wildlife patrols near home and avoids villages, but engaged monsters can follow their target into a village. Overworld enemy and resource snapshots include only entities within 200 meters of each player. A shared heightfield places characters, scenery and interactions on stepped hills and ridges, with shores descending to water.

Travel continuously between settlements and wilderness using **WASD**, arrow keys or the touch movement controls. **M** opens a 3D voxel atlas with terrain, landmarks, party markers and route previews. Drag to orbit, right-drag to pan, and scroll or use the buttons to zoom. Select a location and set a waypoint, then follow its direction arrow and remaining distance while moving yourself. The arrow follows the camera orientation. A waypoint survives overworld region borders and clears within three meters of its destination; use its clear button to dismiss it sooner. Death, dungeon transitions, character selection and sign-out clear it. The nine-chapter lantern story remains optional under **J → The lantern story**.

The corner minimap is a tilted 3D cutaway of the actual nearby terrain, with stepped hills, trees, buildings, shorelines and dungeon rooms. Its compass stays fixed while the player arrow turns; party members, enemies, resources and loot remain visible. Clicking it opens the full atlas. The minimap builds only a 128-meter local window and releases it when leaving the world. Its four original Blender landmarks are in `public/models/minimap-kit.glb` (65 KB); retain or edit `assets/source/minimap-kit.blend`, or regenerate them with `scripts/build-minimap-assets.py`.

Each of the four main towns also has six distinct Blender-built NPCs: a riding trainer, a mount seller and one trainer for each class. Approach within three meters and press **E** to use their services. Lessons and purchases require the correct nearby NPC, level and gold; spell knowledge, riding rank and mount ownership save per character. Existing characters keep the abilities and riding access they had already unlocked before this update. The editable models are in `assets/source/trainer-kit.blend`, with a lineup in `assets/source/trainer-kit-preview.png` and browser export in `public/models/trainer-kit.glb`. Rebuild with `blender -b --python scripts/build-trainer-assets.py -- --render --optimize`; `check-training`, `check-training-ui`, `check-trainer-assets` and `check-trainer-placement` verify transactions, menus and assets.

Select a village resident and use **E** to talk. Merchants sell healing potions for **8 gold** and open the existing equipment shop; healers restore full health for **5 gold** when injured. Wardens offer their region’s contracts. Each village has two cottages, an inn, a produce stall, a well, two lamps, and three distinct NPCs. Village pins and names appear on the atlas.

At a quest board or village warden, accept up to three contracts, complete their objectives, then return to a board or warden in the issuing region to claim XP and gold. Contracts return after a short cooldown. **F** opens crafting and can guide you to a workshop. Recipes consume gathered materials and create potions or class equipment; equip crafted gear through **C**.

Other players have overhead nameplates showing their name, level, calling, and live health. Party members use blue nameplates, with a crown and Leader label for the leader. Nameplates follow players on land and while swimming.

Use **P** to invite another online adventurer anywhere in the open world, including across regions. A dungeon is optional; your party stays together as you explore the world. Invitations require acceptance; the leader can invite, promote or remove members, and each member can leave. Nearby living party members share kill credit and receive their own corpse loot. Incoming invitations automatically open a small window naming the inviter with Accept and Decline buttons. The world stays playable; unanswered invitations expire after 60 seconds. The party menu also keeps its invitation controls. Select **Party** in chat for private conversation.

The Rootvault entrance lies in the Hollow. Enter solo or as party leader when everyone is alive and gathered at the entrance. Explore eight encounters through overgrown halls, a frozen archive, a reliquary, and a forge. Clear the two outer wings in either order and activate both rune seals to reach the sanctuary. Attune its checkpoint to heal and preserve the first five cleared encounters after a full-party defeat. Side chests open personal treasure that must still be looted. Clear both deep wings to reach the Heartkeeper; move out of its marked circles before the strike. Defeat it, collect its relics, and return to the entrance to leave. Enemy health and damage scale to the party size when the instance opens. Leaving the party or disconnecting returns that character to the overworld; dungeon instances are temporary, while collected loot and progress persist.

Monsters leave personal loot rather than granting items immediately. Right-click a corpse or select it and press **E** within three meters to open a compact, nonmodal loot window. Click individual rows or **Loot all**; unclaimed rows stay on the corpse until its five-minute expiry. Opening or reopening it never rerolls drops. Full bags still allow gold and additions to existing stacks; **Loot all** requires room for the entire remaining drop. Collect dungeon relics before leaving. Damage and death wait for the confirmed attack impact.

All 15 monster types have individual drop tables in `src/loot-items.ts`: uncommon sellable junk, common food/potions/basic gear, and rarer equipment and treasures. Equipment rolls respect the recipient’s class, level and existing ownership. Sell new loot stacks to a nearby merchant for their listed gold value. Double-click food or a tonic in your bags (or use its detail button) to heal; food requires leaving combat, and these consumables share a ten-second cooldown. Sixteen generated icons and their original atlas/prompt are retained in `public/ui/loot/` and `assets/source/loot-icons-prompt.md`. Run `npm run check:loot` for deterministic tables, real-server collection/sale/use, capacity/persistence guards, UI behavior and icon checks.

The village kit was authored and rendered in Blender. Its editable source is `assets/source/village-kit.blend`, its preview is `assets/source/village-kit-preview.png`, and its browser asset is `public/models/village-kit.glb`. Rebuild with `Blender --background --python scripts/build-village-assets.py -- --render --optimize` using your Blender executable. The five prop types and three articulated villagers share one vertex-color material; nearby props are instanced in local batches. `check-settlements`, `check-village-assets`, `check-village-server`, and `check-village-ui` scripts cover placement, asset bounds and animation, authoritative services and roaming, and the actual menu handlers.

## Swimming

Walk into the sea or a river to swim automatically at **4.34 m/s**, 40% faster than before. Hold **Shift** to swim at approximately **6.14 m/s**, with faster strokes and the same stamina drain, exhaustion and recovery as sprinting on land. Standing still in water costs no stamina; exhausted swimmers continue at normal swim speed. Your character paddles while moving and treads water when idle. Entering the water throws a splash; swimming leaves a directional foam wake, alternating stroke droplets and fading ripples. Shallows blend into deeper blue water with animated surface highlights and breaking shore foam. Return to dry land to draw weapons or gather; enemies remain on land. The server computes water movement from the same four-meter shoreline grid used by the terrain and atlas. Reconnecting preserves your position, including while swimming. Map route previews say when a route includes swimming.

## Environmental effects

The open world has regional fireflies, pollen, falling leaves, snow and Hollow spores. Walking, sprinting, mounts and landings produce fading ground particles; swimming retains its own splashes and wakes. Tavern hearths, forges and Rootvault braziers emit animated flames, embers and smoke. Lanterns and fires have depth-tested glow and gently flickering light on nearby surfaces.

Environmental rendering uses three ambient instance buffers, three light-effect buffers, and at most six shadowless nearby point lights per world. No gameplay rules or damage depend on these effects. Run `npm run check:environment`; `artifacts/environment-effects.html` is an isolated Vite preview with actual world assets, time-of-day and effects comparisons, and movement controls.

## Day and night

Every 40 real minutes, Mossvale passes through a full 24-hour day. The existing server timestamp keeps players in sync and the cycle continues across reconnects and server restarts. Dawn and dusk blend the regional skies and fog, the sun moves across the sky, and moonlight keeps night travel readable. Stars and fireflies brighten after sunset; lanterns, hearths and braziers continue lighting their surroundings. Water reflections follow the sky and light. Rootvault lighting stays steady underground. The minimap shows realm time.

Run `npm run check:environment`. The isolated Vite preview at `artifacts/environment-effects.html` has Dawn, Noon, Dusk, Midnight, Live cycle and an hour slider; its manual time controls affect only that preview.

## Gathering and professions

The mouse cursor changes with the hovered target: swords for enemies, speech bubbles for conversation, coins for merchants, pickaxes/axes/leaves for gathering, pouches for loot, hammers for workshops, and portals for travel. Players and menu controls use a pointing hand; dragging the camera uses a closed gauntlet. Cursor artwork keeps the same click point across actions.

Right-click a nearby resource to gather, an NPC to talk, remains to loot, or a station to open it. World interactions require three meters and a clear route; a distant right-click selects the object and asks you to move closer. Right-click a player, their mount or nameplate for **Inspect, Invite, Trade and Whisper**. Left-clicking selects a target without moving or interacting; clicking empty ground clears the selection. The highlight follows your selection; click an enemy or press **Tab** to select a foe, then use your assigned hotbar attacks. **E** uses an explicitly selected non-enemy target, or the closest non-enemy interactable within three meters when nothing is selected. A distant selection never switches to another target or moves you automatically.

Open **K → Professions** for Mining, Woodcutting, and Herbalism. Each has independent, saved XP and levels 1–99. Higher levels reduce gathering time, up to 30%. The resource finder marks a waypoint to an available node; move there and press **E** to gather. Pickaxes and axes equip automatically; herbs are gathered by hand. Moving, fighting, or opening a modal menu cancels the action; floating character and bag windows remain usable while gathering. Resources regrow after 22 seconds. Skill XP and items are awarded only after the server completes the gather; one player can work a node at a time.

Existing characters retain their progress and start the new professions at level 1. Timber adds wood, herbs add wild herbs, and crystals retain their adventure XP and story credit.

## Build, serve and check

```sh
npm run check
npm run build
npm start
```

The production server serves `dist/`, the API and WebSocket connections on the same port: [localhost:2567](http://localhost:2567) by default. `/api/health` reports server health and connected player count. `npm run check` covers characters, scene geometry, UI actions, navigation, attack timing, personal loot, authentication, the optional campaign, contracts, crafting, party dungeons, persistence and rejected cheat attempts with native assertions and real WebSocket clients. `node scripts/check-hotbar.mjs` checks native drag/drop handlers, tap and keyboard assignment, cooldown display, and layout reconciliation, rejection and character isolation.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrow keys / touch movement controls | Move manually |
| Left-click a target / empty ground | Select a target / clear selection |
| Right-click | Interact with a nearby world target / open player options |
| Drag / scroll | Orbit camera / zoom |
| Shift | Sprint |
| E | Use a selected non-enemy within 3m, or the closest nearby interactable if unselected |
| 1–8 | Activate the ability assigned to that hotbar slot |
| Space | Jump |
| C | Character and equipment |
| B / J / M | Bags / quests / map and waypoints |
| F / P | Crafting / party |
| K | Combat spellbook and hotbar editor / Professions |
| N | Toggle the standalone floating Skill Tree |
| Enter | Focus chat |

Open **J → The lantern story** to mark the next objective. Quest, resource and workshop finders set waypoints. Follow the direction arrow with the movement controls, then interact or attack manually when you arrive.

## Mobile app and controls

The native Expo project is in [mobile/](mobile/README.md). It runs the same hosted game and automatically enables the mobile controls. Touch browsers also use this layout.

The left joystick controls direction and walking speed. Hold **Sprint**, tap **Jump**, and use **Mount** for travel. On the right, **Attack** toggles auto attack and the eight circular ability buttons use the character’s saved hotbar. **Target** cycles nearby foes; **Use** interacts or opens friendly player options; **Clear** stops attacks, cancels casts and clears the target. Drag the world to orbit and pinch to zoom. **Menus** keeps every existing game menu available. An internet connection is required for play.

The original Blender control frames are editable in `assets/source/mobile-controls.blend`; regenerate them with `scripts/build-mobile-controls.py` using Blender. Run `npm run check:mobile` for the input checks.

## Server configuration

Set these as server environment variables, using your shell or deployment platform. `npm run dev` loads `.env.local` for the local server; `npm start` uses its configured process environment.

| Variable | Value / behavior |
| --- | --- |
| `KEYCLOAK_URL` | Keycloak server base URL, such as `https://auth.example.com` |
| `KEYCLOAK_REALM` | Set explicitly to `mossvale` |
| `KEYCLOAK_CLIENT_ID` | Set explicitly to `mossvale-browser` |
| `DATABASE_URL` | Same canonical PostgreSQL connection for all realms; enables shared progress |
| `REALM_ID` | This server’s realm: `eu` (default), `us` or `asia` |
| `REALM_EU_ORIGIN` / `REALM_US_ORIGIN` / `REALM_ASIA_ORIGIN` | Exact HTTPS realm origins; an unconfigured remote realm is unavailable |
| `GAME_ALLOWED_ORIGINS` | Optional additional exact browser origins, separated by commas |
| `DATABASE_CA_BASE64` | Optional base64-encoded PEM CA certificate for verified database TLS |
| `PORT` | HTTP/WebSocket port; defaults to `2567` |
| `HOST` | Bind address; defaults to `0.0.0.0` |
| `DATA_DIR` | Local save directory; defaults to `.data` |

Configure all three Keycloak variables together, or omit all three for local guest sessions. Create a public OpenID Connect client with Standard Flow and PKCE S256 enabled. Register the game's exact origin and redirect URI in Keycloak; no browser client secret is needed. With Keycloak enabled, sign-in is required and the game server validates access tokens before joining the realm.

With `DATABASE_URL` set, startup creates the `mossvale_players` table if needed. PostgreSQL becomes the player store; existing local JSON records are not automatically imported. `DATABASE_CA_BASE64` supplies an explicit trusted CA and keeps certificate verification enabled.

Keep database credentials and other secrets in server environment configuration. Never put secrets in `VITE_*` variables, browser source or committed files. `/api/config` exposes only public sign-in, wallet-provider and realm connection settings.

## Server validation

The browser sends action requests; the server owns health, damage, cooldowns, XP, inventory, gold, drops, character ownership and party membership. Movement has a time-based distance budget and swept collision checks using the same geometry as the client. Combat checks range, line of sight, living targets and instance membership. Crafting and quest rewards validate station range and requirements before changing inventory. Loot is personal, distance-limited and claimed once.

WebSocket payload and message-rate limits bound abusive input. Invalid authority claims and repeated movement violations accrue strikes and can disconnect a session; corrections restore the server position. Keycloak tokens are verified and expiration is enforced. These controls reject invalid game-state changes; they do not detect every bot or legitimate-speed automation.

Old character positions migrate from region-local coordinates and the previous compact town layout into the expanded world without resetting progression. Town and camp locations move with the new layout; characters without a saved hotbar receive the defaults for their calling. If new scenery encloses a saved location, entering places the character at the nearest clear point. While inside a dungeon, persistence records the overworld entrance position and current earned progression.

## Auction house

Visit Merrick Ledger inside Lanternreach's auction hall. The Auctionator-inspired **Shopping** tab has saved searches, recent searches, item/category/currency filters and a compact price table. Compare unit prices and stack totals, then select one exact listing to buy. **Selling** shows tradable bag items beside matching market listings; **Match lowest** explicitly fills a total buyout price for your chosen quantity. Gold is priced in whole coins; ETH comparisons use exact wei and never mix currencies. With no matching seller, the price remains yours to enter. Posting below half the lowest competing unit price requires an additional acknowledgment.

**My auctions** shows your escrowed items and flags listings undercut by another seller in the same currency. Cancellation returns the full stack if your bags can receive it. Monster junk, food, tonics and treasures can now be auctioned alongside existing resources and spare gear. The window stays nonmodal and its Bags button opens the existing inventory. Wallet links and purchases retain the existing explicit signature/transaction flow and confirmed settlement; the interface never automatically buys, cancels or sends wallet transactions.

The UI uses original Blender auction artwork in `public/ui/auction/`, with editable source `assets/source/auction-ui.blend`. Run `npm run check:auction` for prices, loot-item escrow/settlement, UI controls, wallet guards and artwork checks.

## Deployment

Use the [Mossvale production GitHub Actions workflow](deploy/PRODUCTION.md) for every normal game release: push or merge to `main`, or select **Actions → Mossvale production → Run workflow → main**. It deploys EU, US, and Asia with a five-minute player countdown, final save, and live verification. Do not publish directly to `production`, start a BBA deployment, or run host deployment commands for normal releases.

[Regional host operations](deploy/ovh/README.md) covers initial setup, Docker Compose, automatic HTTPS/WebSockets, database backups, and emergency recovery. All realms use the same canonical PostgreSQL database.

Accounts use the same Keycloak sign-in and one shared six-character roster in every realm. Choose Europe, North America (US) or Asia when entering the world; characters keep their progress, achievements, titles, pets and inventory across realm changes. The auction house and seller proceeds are global. Chat, parties, direct trades and world simulation stay within the current realm. Only one realm can own an account at a time; leaving saves progress before releasing that ownership. An unprovisioned realm remains unavailable until its origin is configured on the frontend and its authenticated server is ready. Each backend verifies the same JWT issuer/client and accepts only its configured browser origins. Run `npm run check:hosting-realms` for routing, ownership, handoff and global auction checks with disposable PostgreSQL.

For local hosting or initial infrastructure setup, install build dependencies with `npm ci --include=dev` (or set `NPM_CONFIG_INCLUDE=dev`), build with `npm run build`, run `npm start`, route HTTP and WebSocket traffic to `PORT`, and keep **one game process/replica per realm**. Configure Keycloak and PostgreSQL through the platform's server environment settings. Use PostgreSQL for persistent deployed player data.

The workflow starts the countdown automatically. Players see a nonblocking shutdown alert at 5, 4, 3, 2 and 1 minutes, followed by just **10–1** in the final seconds. Gameplay continues until zero, when the normal save/shutdown runs. Late arrivals receive the remaining time; repeated requests do not reset the countdown. Client updates wait until the countdown ends.

The workflow checks main, drains and saves EU through its authenticated deployment endpoint, advances the BBA production branch, then performs the US and Asia signal/save rollouts. Keep BBA following `production` with push auto-deploy enabled; the workflow owns branch promotion. Initial activation and emergency recovery are documented separately from normal releases.

On SIGTERM/SIGINT the realm still immediately stops accepting actions, reports HTTP 503 from `/api/health`, returns players to character selection, saves admitted changes, and closes sockets with service-restart code 1012. **Enter world** and character creation stay disabled until a new authenticated roster arrives; reconnecting never automatically enters the world. Allow the process to finish its save before starting its replacement.

Production builds install a native service worker with a complete fallback of the public game shell, models, UI and public sign-in configuration. Returning browsers can reload through a temporary hosting 503; health, authentication and player data remain live and uncached. Failed cache installation retains the previous build. Cache versions include model contents, and waiting workers activate after old tabs close. This protection requires one successful load and cache installation; first visits during a hosting outage still need the origin back. Run `npm run build && npm run check:updates` to verify restart and cache behavior.

The BBA app assignments for this deployment are:

| Service | BBA app ID |
| --- | --- |
| Keycloak auth | `98173aaf-eaf1-420d-a6fc-4e6f46043216` |
| PostgreSQL data | `b6f5bebc-a61b-4a8c-a441-7fe57c31be2a` |
| Mossvale game | `00edc49e-6028-442d-9417-673a2251a662` |

Production configuration uses Keycloak sign-in and one canonical PostgreSQL database reachable from both hosts through a protected network route and certificate-verified TLS. Preserve the existing player database; do not start the second realm against a separate empty database. Stop the old server and wait for its final save before first starting the shared-storage release, because older builds do not honor account ownership locks. Verify signed-in character progress after each production deployment.

## Blender asset

The village bell tower is authored in `assets/mossvale-bell-tower.blend` and shipped as `public/models/mossvale-bell-tower.glb`. Rebuild it with Blender:

```sh
blender --background --python scripts/build-assets.py
```

On macOS, the Blender executable is typically `/Applications/Blender.app/Contents/MacOS/Blender`. The script regenerates the source and GLB, merges meshes by material, and checks the export's format and size. The shipped GLB was additionally deduplicated and pruned with glTF Transform; it needs no texture or geometry decoder.

## Generated UI artwork

The expansion includes **44 generated icons across three PNG atlases**: `abilities-v2.png` (12), `functions-v2.png` (16) and `world-v2.png` (16). [public/ui/ICONS.md](public/ui/ICONS.md) records every icon, its atlas position and the generation prompts; `src/icons.ts` supplies the runtime mapping.

The logo, oak frames and parchment panels are also original generated PNG assets in `public/ui/`; see [their prompts](assets/UI-ART.md). Frames use nine-slice scaling, while labels and controls remain accessible HTML and character customization retains its live Three.js preview.

Idle poses use 30 Blender-authored loops covering all 18 monsters, every player build, mounted riders, both mounts and eight NPC roles. Creatures breathe, glance, twitch tails or flutter wings; nearby actors use different phases. Idles ease back in after activity and yield immediately to movement, gathering, swimming, attacks and death. Reins remain attached to the rider and bridle. The shared motion-only asset is `public/models/idle-animations.glb`; its editable rigs and pose gallery are retained in `assets/source/idle-animations.blend` and `assets/source/idle-animations-preview.png`. Rebuild with `blender -b --python scripts/build-idle-animations.py -- --render`. Run `check-player-idles`, `check-monster-idles` and `check-npc-idles` to validate actual exported clips, or open `/artifacts/idle-preview.html` on the Vite dev server for the interactive gallery.

Every class has 31 spells: a starter at level 1 and a new trainer lesson at every even level through 60. Clerics heal allies, absorb incoming damage and deal holy damage; area healing affects your party. The catalog mixes instant attacks, fixed 1.5–3 second casts, and interruptible 3-second channels. Gear improves power without lengthening casts. A 1.5-second global cooldown begins when a spell starts; individual cooldowns begin at release or channel start. Movement, jumping and **Escape** cancel casts and remaining channel ticks. Projectiles and melee attacks still deal damage at visual contact. Existing learned spells and hotbar layouts are preserved. See [spell design and progression](docs/SPELLS.md).

The Cleric’s race-fitted ivory and teal vestments, sun mace, tome and icons are authored in `assets/source/cleric-kit.blend` and exported to `public/models/cleric-kit.glb`. Rebuild with Blender `--background --python scripts/build-cleric-assets.py`. Run `npm run check:cleric` for catalog, fitted gear and authoritative healing/shield/channel checks. `/artifacts/cleric-preview.html` on the Vite server is an isolated visual preview; it changes no account data.

Combat animations follow server-confirmed attacks and appear for everyone in the same world or dungeon instance. Class abilities use projectiles, radial strikes or a falling meteor according to the shared spell catalog. Their visual effects are cosmetic; damage, status effects, range and per-ability cooldowns remain server-authoritative.

The starting scene ships as `public/models/creator-scene.glb`; its editable Blender source is `assets/source/creator-scene.blend`. Rebuild it with `scripts/build-creator-scene.py` in Blender. UI frames remain generated artwork; the woodland itself is 3D geometry.

## Rootvault Blender assets

`assets/source/rootvault-kit.blend` is the editable source for the arches, rooted columns, braziers, guardian statues, hinged chests, rune seals, checkpoint, fungi and water pool in `public/models/rootvault-kit.glb`. Rebuild with Blender in background mode: `blender -b --python scripts/build-dungeon-assets.py`. The runtime batches repeated props by material and shares the same chamber and collision layout with the server and dungeon atlas.

The swimming wake, splash crown and droplets are authored in `assets/source/water-effects.blend` and shipped as the 20 KB `public/models/water-effects.glb`. Rebuild with `blender -b --python scripts/build-water-assets.py` (add `-- --render` for the preview). The renderer reuses four instanced effect batches, caps active swimmers at 64 and transient particles at 512, and releases them when leaving the overworld. Run `node scripts/check-water-effects.mjs` to check stroke/entry behavior, stable actor identity, fading trails, bounds and resource cleanup.

## Wilderness monsters and world bosses

Ten additional creatures inhabit the wilderness: Bramble wolves, Briar boars, Grove spiders, Ember beetles, Dune scorpions, Stone golems, Frost yetis, Crystal bats, Marsh toads and Void stalkers. All eighteen monster types have attack windups, contact poses and recovery. Damage follows the server's impact timestamp; leave the marked ground circle to dodge. Interrupting or killing a monster cancels its pending attack.

Once engaged, a monster keeps chasing until its target gets more than 40 meters away from the monster or another adventurer builds strictly higher threat by dealing more total damage to it. Equal threat keeps the current target. Threat clears when combat ends; dead or disconnected adventurers and characters leaving the instance are no longer targets. Terrain, solid obstacles and water still constrain monster movement.

Four open-world group bosses form a fixed level ladder. Each has a named destination on the world map and a clear arena:

| Level | Boss | Lair | Health | Special attacks |
| --- | --- | --- | --- | --- |
| 10 | Briarhorn Elder | Tidewatch `(-190, 602)` | 96,000 | Tusk Rake, Briar Quake, Briarhorn Charge |
| 20 | Rimefang Matriarch | Northglass `(397, -635)` | 185,000 | Rime Claws, Whiteout Roar, Glacier Rush |
| 30 | Stormhorn Behemoth | Elderwood `(174, 528)` | 265,000 | Thunderclaw, Thunderquake, Stormcall, Thunder Rush |
| 40 | Ashen Crown Titan | Sunveil Badlands `(-1226, -654)` | 350,000 | Magma Hammer, Cinder Eruption, Caldera Charge |

Each boss is tuned for about 20 players at its level: five existing four-person parties, each with a Knight, Ranger, Mage and Cleric. A balance check uses level-appropriate vendor gear, legal talents and learned spell rotations with 75% damage uptime. That estimates roughly 170 seconds per kill; it is a tuning estimate, not a human raid playtest. At 3½ minutes the boss enters Berserk and deals four times its current damage. World bosses are immune to stuns, preventing a small group from suppressing every attack; slows still help create space. Disengaging resets the timer. There is no player-count gate, and surviving participants receive their own rewards.

Monsters pursue faster than normal walking and keep moving through basic attacks, so straight running and circle kiting no longer avoid every melee hit. Sprinting and slows retain an escape advantage. Overworld wolves, boars, scorpions, golems, yetis, stalkers and all four bosses can charge: a fixed lane warns before the rush, the body follows that lane, and its full corridor deals damage once at the end. Sidestepping avoids it; obstacles, interrupted travel, death and leaving the encounter cancel it. Stuns also cancel ordinary monsters’ charges.

Bosses alternate quick target-only basics with marked specials. Cast bars show the attack name; roots, ice spires, lightning and molten rocks identify the four encounters. Damage occurs once at the server's impact time. Bosses enrage below half health, reset after disengagement, stay within their lair's combat boundary, and respawn five minutes after defeat. Nearby surviving combat participants each receive personal remains with gold and one, two, three or four relics respectively.

`assets/source/monster-kit.blend` contains the articulated models and authored basic, swipe, slam, pulse, charge and death clips, with contact mapped to the authoritative damage time. `public/models/monster-kit.glb` shares geometry and materials across instances and remains under 1 MB. Rebuild with `blender -b --python scripts/build-monster-assets.py -- --render --optimize`. The four-boss lineup and attack pose sheet are `assets/source/world-bosses-preview.png` and `assets/source/world-boss-attacks-preview.png`; `assets/source/monster-charges-preview.png` shows all ten charge animations.

Run `npm run check:world-bosses` for raid balance, server combat, pursuit and charge behavior, map/UI, models, effects, idles and nameplates. With Vite running, `/world-boss-preview.html` shows the actual game assets with boss selection, named attack playback, pause and timeline controls. It is a local visual preview with simulated combat and no live account changes.


## Character appearance

Character creation uses arrow selectors for six races (Human, Elf, Dwarf, Orc, Goblin and Foxfolk), Male and Female options, eight faces and twelve haircuts. Every combination is available to every class. Hair, skin, clothing and accent palettes each offer 84 colors; arrow keys also navigate the selectors and color grid. Race and gender alter appearance only. The selected identity is saved and locked when the character is created; existing characters retain their progress and appearance choices. The retired Nonbinary save value migrates to Male on load; new creation accepts only the two current options.

Twelve separately authored race bodies live in `assets/source/race-kit.blend` and ship as `public/models/race-kit.glb`. Each race has its own skull, torso, limbs and silhouette; runtime body scaling is never used. Female bodies have a shaped, clothed chest. Armor, legwear, boots, back pieces and necklaces have baked fits for each body in `gear-kit.glb`. `assets/source/race-fit.json` is the shared authoring reference for joint and clothing dimensions. Rebuild the bodies with `blender -b --python scripts/build-race-assets.py -- --render --optimize`, then the fitted equipment with `scripts/build-gear-assets.py`.

The Blender hair and face details live in `assets/source/customization-kit.blend` and ship as `public/models/customization-kit.glb` (256 KB). Rebuild with `blender -b --python scripts/build-customization-assets.py -- --render --optimize`. The runtime tints shared meshes, fits equipment to the chosen build and hides hair under helmets. Eyes blink naturally in creation, selection, equipment previews and gameplay by updating the existing eye instances without additional draw calls.

Weapon and gathering-tool handles share the actual palm position, including upgraded gear. The Ranger draw pose keeps both hands attached to the bow grip and string; the shield stays facing forward during a bash. `node scripts/check-character-grips.mjs` verifies contact, clearance and animation recovery across every character build. The original grip-fix comparison is retained in `assets/source/character-grips.blend` and `assets/source/character-grips-preview.png`; `scripts/export-character-grips.mjs` and `scripts/render-character-grips.py` reproduce the inspection.

Houses use a Blender-authored walkable cottage (10×9m) and inn (14×12m), across 55 homes and two civic buildings. Floors, entry ramps, wall and furniture collisions share coordinates with the server. Roofs and near walls cut away indoors, and the camera moves closer. Right-click a chair or press E nearby to sit; moving, jumping or Escape stands up. The 140 seats have authoritative occupancy, replicate to other players, and release on actions, damage and disconnects. Editable sources and preview are in `assets/source/house-interiors.*`; rebuild with `scripts/build-house-assets.py`. Run `check-buildings`, `check-building-models` and `check-house-server` scripts for geometry, interaction and multiplayer checks.

Lanternreach now spans 162×162 meters, almost three times its previous area. Its four gates, 17 homes, two civic buildings and nine services share 48 connected road segments; paving is checked across its full width against building and furniture collision. Twenty-four townspeople stroll on separate patrols, pause and yield near the player. Left- or right-click one to select them: their name and portrait appear in the target frame, and the highlight follows as they walk. Two Briar Horses and a Moonfang Wolf idle in the stable; riding lessons and purchases still use the existing nearby NPCs. Two fountains have pulsing jets, expanding ripples and 64 pooled droplets; the town hall pendulum swings above Rowan’s archive. Homes and inns contain wider beds, quilts, pillows, rugs, food, stocked bookcases and usable chairs. Run `npm run check:city` for road, real-model, animation and cleanup checks. The Vite `/artifacts/trainer-preview.html` scene selector offers an isolated city tour without changing any account data.

Lanternreach uses dedicated city cottage/inn variants with stone quoins, carved timberwork, planters and layered dormer roofs. Its 9.7m stone curtain walls and 17.2m gates frame a 20×16m walkable town hall with four clock faces, a bell arcade and a 31.7m spire. Rowan welcomes travelers inside, along a clear central aisle. The hall contains a council table, eight usable chairs, a keeper’s desk, a reading area, bookcases, records, rugs, banners, planters and warm lanterns; the roof and near walls cut away when you enter. Civic geometry and collision footprints share `src/city.ts`; the map uses the same placements, and nearby walls shorten the camera orbit to preserve the player view. Rebuild `assets/source/city-kit.blend` and `public/models/city-kit.glb` using `scripts/build-city-assets.py -- --render --optimize`. `check-city`, `check-city-camera` and the building checks cover dimensions, access, cutaways and camera clearance.

New characters follow Rowan’s ten-step beginner journey: meet the keeper, defeat and loot a woodland slime, inspect bags and equipment, gather crystals, finish the hunt, return for the quest reward, learn a level-2 spell, and accept a contract. The existing objective card presents one lesson at a time. Its waypoint arrow follows collision-checked routes through the city; click the card to resume guidance or set your own map waypoint. Movement stays manual. Bags, gear, professions, spells, crafting and contracts unlock through these milestones; parties and dungeons unlock when the tour is complete. The Skill Tree opens at level 5, auctions at 10, and riding at 25. Unlocks and tutorial progress are saved per character; existing characters keep their access. Run `npm run check:onboarding` for shared rules, actual client routing and isolated WebSocket/save checks.

Right-click a monster or press T with a monster selected to begin weapon auto attacks. Knights and Clerics strike within 3m; Rangers shoot within 13.5m and Mages within 15m. The server repeats the attack only with clear line of sight and checks reach again at impact. Spells take priority; gathering, sitting, riding and swimming pause auto attacks. Escape, another selection, death or leaving the world stops them. No movement is automatic. Run `npm run check:auto-attacks` for real multiplayer, input and equipped-animation checks.

### Towns and zeppelins

All six main towns share Greenwood’s 162 m footprint, detailed homes and civic buildings, four gates, paved roads, gardens and walking residents. Each town keeps its own colours.

Follow the south road to each zeppelin dock and click its blue exclamation mark (or press **E**) to discover it. The marker disappears after the unlock is saved for that character. Free direct flights are available only between discovered docks. Passengers stay attached through takeoff, turns and landing; reconnecting resumes the same flight, or arrives at the destination if it finished while offline.

Blender sources: `assets/source/towns-expanded.blend` and `assets/source/zeppelin-kit.blend`. Run `npm run check:towns` for town access, asset, route and server-flight checks.

## Thornring Colosseum

East of Lanternreach at `(176, 0)`, the colosseum has fifteen spectator terraces, four gates and four solid cover pillars. Its overworld sand ring retains open, lethal PvP. Ordinary consented **Duel** challenges elsewhere still stop at 1 HP.

Open **Arena** from the game menus or press **U** to find the southern entrance at `(176, 75)`. At the entrance, solo players can select **Find 1v1** to search for an opponent; both players accept the ready check before entering. The same menu lists nearby players for direct **1v1**, **2v2**, or ordinary **Duel** challenges. Player context menus keep these options visible and explain any unmet requirements. Ordinary duels also work at the safe entrance and spectator terraces outside the lethal sand ring.

For **2v2**, form two separate parties of exactly two and have one leader challenge the other. All fighters must be near the entrance and consent. Each accepted challenge moves only its fighters into a new private arena instance; independent matches can run simultaneously. Leaving the entrance, becoming busy, joining a party, or disconnecting cancels a solo queue search or ready check.

Teams start at opposite ends with full health and reset cooldowns, followed by a five-second countdown. Opponents can damage each other and teammates can heal each other. Knockouts stop at 1 HP; a team loses when all its members are knocked out. Leaving, disconnecting, forfeiting or changing a 2v2 roster forfeits that team. The limit is five minutes. Afterward, fighters return to their original overworld positions with their pre-match health and cooldowns; matches grant no rewards.

The editable source is `assets/source/colosseum.blend`; the runtime asset is `public/models/colosseum.glb`. Rebuild with `/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-colosseum.py -- --render`. Run `npm run check:duels`, `npm run check:colosseum`, and `npm run check:arena` for all three combat modes. The development preview `/colosseum-preview.html` shows the world colosseum; append `?instance=1` for the private arena geometry.

## Rolled gear and material upgrades

Gear drops can roll common, uncommon, rare, epic, legendary or mythic quality with attack, magic, damage, defense and movement speed bonuses. Item rolls remain identical through saves, trades, bank storage and auctions. Unmounted movement bonuses cap at 20%. Dungeon side caches and completion rewards guarantee rare-or-better gear usable by the recipient, plus crystals and relics; dungeon monsters also have stronger roll odds than open-world monsters.

Select equipment in your bags or character panel to compare the next upgrade and spend existing wood, crystals, herbs, relics and gold. Upgrades are guaranteed up to +5, preserve the roll, and replace that particular item after the cost and result are saved together. Starter gear cannot be upgraded. Run `npm run check:gear-upgrades` for the model, UI and real socket/save/bank/auction checks. See [store payments](contracts/STORE.md) for boost charges and cosmetic boxes.

Equipment also grants class attributes: Strength gives Knights +1 attack and skill power per point, Agility does the same for Rangers, and Intellect for Mages and Clerics. Stamina adds 5 maximum health per point; equipping never heals. Spirit restores 1 health per point every 5 seconds outside combat. New rolls use version 2 identities; version 1 damage, defense and speed bonuses remain unchanged. Older saves gain the catalog attributes without changing current health. Both realm runtimes must support version 2 before these items are released.

Hover or keyboard-focus items in bags, equipment, loot, merchant stock, bank, trade and auctions to read their Mossvale item sheet. Escape dismisses the preview; clicking an item in bags retains its detail and equipment actions, including on touch screens. The sheet shows real attributes, requirements, vendor value and weapon attack interval. Run `npm run check:item-stats` for attribute persistence and rendering, and `npm run check:item-hover` for isolated browser interactions (uses the agent-browser CLI through npx).
