# The Lanterns Between

Mossvale's implemented expansion follows a complete nine-chapter story across four playable, revisitable zones. Desktop and 320px browser playtests cover the generated artwork, campaign dialogue, final choice and postgame persistence.

## The journey

Eris, the first keeper, bound herself beneath the Worldheart to hold back the darkness. She trusted the villages above to share the burden through their lanterns. When her promise was forgotten, she was left carrying it alone. The player restores the outer beacons, learns what happened to her, and returns home to choose how Mossvale will face its future.

| Chapter | Title | Zone |
| --- | --- | --- |
| 1 | A Light in the Leaves | Greenwood |
| 2 | The Cartographer's Fire | Amberwild |
| 3 | What the Fire Remembers | Amberwild |
| 4 | A City Answers | Amberwild |
| 5 | The Astronomer's Silence | Frostmarch |
| 6 | Stars Beneath the Snow | Frostmarch |
| 7 | The Promise We Forgot | Frostmarch |
| 8 | The Heart That Held the Dark | The Hollow |
| 9 | The Lanterns Between | Greenwood |

The final choice offers two persistent endings:

- **Rekindle — share the light:** every village takes a turn keeping the lantern network. The player becomes the Keeper of the Shared Flame.
- **Release — welcome the dawn:** the old magic is allowed to rest, and communities keep their own lights. The player becomes the Friend of the First Dawn.

Both choices conclude the story, preserve the selected epilogue and title, and allow postgame visits to all four zones. Beacon visuals reflect the saved campaign state; the release ending leaves the old beacons extinguished.

## Four distinct places

- **Greenwood:** Rowan's sheltered village, cottages, bell tower, river and bridge, moss slimes and grove crystals.
- **Amberwild:** Sable's cartographer camp, golden autumn woods, a broken aqueduct, briar sentinels, ember shards and the Amber Beacon.
- **Frostmarch:** Iona's ruined observatory, snowy pines, a frozen lake with a stone crossing, ice wisps, star fragments and the Frost Beacon.
- **The Hollow:** Eris's refuge, violet root caverns, giant luminous mushrooms, heartroots and an open Worldheart arena for the Rootbound Warden.

Each zone has its own scenery and atmosphere. Geometry is instanced, traversal remains on level ground, and switching zones disposes the old scenery without disposing player or renderer resources.

## Progression and controls

The server owns chapter progression, objective credit, rewards, gate unlocks, boss defeat and the final choice. Campaign state persists with player saves. Travel remains gated by story progress; returning through already unlocked roads stays available.

The journal shows the active chapter, objective progress, rewards and chapter history. Press **J** and use **Follow the next objective** to navigate toward the next relevant interaction, resource, encounter or waygate. Press **K** for the class spellbook. NPC dialogue, beacon interactions, the zone map and the ending presentation all use the current campaign state.

## Generated artwork

The expansion uses **44 generated illustrated icons** in three PNG atlases: 12 ability icons, 16 function icons and 16 world icons. The files are `public/ui/abilities-v2.png`, `public/ui/functions-v2.png` and `public/ui/world-v2.png`.

[public/ui/ICONS.md](public/ui/ICONS.md) is the prompt and atlas-position manifest; `src/icons.ts` maps the artwork to live controls. Generated wood and parchment frames surround accessible HTML rather than replacing text or form controls with images.

## Verification and scope

`npm run check` runs character, navigation, zone, icon, server, authentication and campaign checks. Coverage includes real GLB loading, target reachability, shared-resource disposal, beacon states, progression and save behavior. Browser checks use isolated local characters to inspect all four zones, spellbook and map artwork, guided travel, Warden combat and the final choice. A completed ending survives a server restart. The travel regression also rejects stale movement packets from the previous zone. For a deployment, verify sign-in and saved progress against the live service separately.

The game remains one authoritative Node process serving one small realm. This expansion does not add distributed world ownership or MMO-scale infrastructure.
