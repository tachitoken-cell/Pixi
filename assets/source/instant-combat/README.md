# Instant Combat map and creature sources

The original files are preserved byte for byte in `original/`:

- `mossvale_bone_pit_arena.blend` — [supplied Bone Pit message](https://discord.com/channels/@me/1548969548785385513/1552673376420634665)
- `mossvale_void_rift_arena.blend` — [supplied Void Rift message](https://discord.com/channels/@me/1548969548785385513/1552676459745648650)

Rebuild with Blender from the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 4 --disable-autoexec --python scripts/build-instant-combat-maps.py -- --render
```

The script retains the supplied meshes, palette, landmarks, bevel widths and scale. Bevels use one chamfer facet at game scale, avoiding the original curved subdivisions. Walkable tile and ritual-platform tops are lowered to the game's flat Y=0 plane; their inlays remain slightly above it. The original copies are never saved over. Derived `.blend` scenes are editable and include a framed preview camera. Runtime exports are `public/models/instant-combat-{bone-pit,void-rift}.glb`.

The 34m playable circle remains inside the authored perimeter. Ground-level rocks, skeletons, braziers and obelisk bases generate shared client/server collision footprints. Overhead rib arches and decorative floor cracks do not become ground obstacles. A closed perimeter follows the circular boundary. Placement uses the shared footprints to keep entry points, waves, boss anchors and charge runes on reachable floor.

`map-audit.json` records original SHA-256 hashes, export sizes, geometry/material counts and collision counts. `node scripts/check-instant-combat-assets.mjs` verifies source identity, exports, complete traversal paths, objective separation and floor inlays.

## Original creatures

`instant-combat-monsters.blend` contains four wave creatures, eight rotating bosses and three ritual objectives. These are new meshes with the game's stepped voxel contours, framed square eyes and rigid animated parts. The geometry follows the modeling conventions in `build-autumn-pet-assets.py`; the Bone Pit and Void Rift supply the two palettes. The existing Morgrath and Bramble Badger assets were used as visual references, not copied into the exported creatures.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --threads 4 --disable-autoexec --python scripts/build-instant-combat-monsters.py -- --render
node scripts/check-instant-combat-monsters.mjs
```

The GLB contains 15 origin-centered roots and 104 clips: `idle`, `walk`, `auto`, `attack` and `death` for each model, plus 29 named attacks and rituals across the eight bosses. Each boss has its own basic strike, ability windups, contact poses and recovery; casts use the same authoritative impact mapping as the Apostle. The server's current shield mechanic drives each sustained ritual and immediately releases it when the mechanic ends. Objectives retain their original five clips. It uses two shared vertex-color materials and no external textures. Runtime coordinates are metres, +Y up and +Z forward. `monster-audit.json` records dimensions, mesh counts, clip durations and sampled grounding. The editable scene saves a spaced inspection layout; its per-part NLA tracks are muted in the rest pose.

Add `--render-attacks` to the Blender build command to produce `boss-attack-contact-sheet.png`: windup, impact, ritual and recovery sampled from each boss's actual NLA tracks. `src/instant-combat-visuals.ts` maps live attacks and shield mechanics to these named clips; the monster asset check verifies distinct motion, grounding, exact runtime contact poses, interruption and actor isolation.

`monster-contact-sheet.png` shows the complete roster; each boss also has a separate preview. `--render --candidate` writes a separate Tyrant/Sovereign style comparison beside the actual existing reference models without changing the runtime export.
