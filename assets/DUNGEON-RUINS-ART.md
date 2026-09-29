# Ancient temple approaches

Editable source: `assets/source/dungeon-portals.blend`. The four `Ruins - …` scenes show the open temple sites; the asset-library scene holds the exported geometry. `src/dungeon-approach-layout.ts` supplies the same metre-scale bounds, walls, pillars and routes to Blender, terrain, rendering, navigation and the server.

Each complex spans roughly 66 by 68 metres, about four times the original temple footprint. The central procession passes through two outer courtyards and offset cloister arches into the rear sanctuary. Two broken front entrances and breaches on both sides provide four alternative routes that reconnect inside. Wide gaps exist in both the meshes and authoritative collision; the remaining masonry slopes down toward the collapsed ends. Side chapels, column stumps and fallen capitals spread the ruins into the surrounding biome. The portal remains screened from the main entrance at eye height, but players can discover it through the side wings too.

The third-person camera stops before temple masonry throughout the enlarged site. The Rootvault guardian occupies its intended inner-court position; only that exact curated spawn bypasses the general town buffer, retaining dry-ground, biome, collision and other-spawn clearance checks.

- Rootvault: muted violet-grey stone fitting the Hollow ground, pale weathered carvings, moss, roots and ferns.
- Cindercrypt: worn ochre masonry and dry grasses matching Amberwild.
- Frosthollow: pale blue granite, snow on exposed courses and hanging ice.
- Nightroot: dark plum stone, aged pale carvings and deep-green overgrowth.

Ground remains visible through the ruined courtyards, and broken paving follows all five routes. The shared terrain clearing and scenery exclusion cover the enlarged footprint, with climbable terraces around its edges. Existing portal, summon-stone and dungeon encounter coordinates are retained. Gallery paving/ground/light objects are excluded from the runtime GLB.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-dungeon-portals.py -- --render-ruins
npm run build
npm run check:dungeons
node scripts/check-dungeon-assets.mjs
node scripts/check-world-expansion.mjs
node scripts/check-rootvault-guardian.mjs
```

Runtime GLB: 3,117,672 bytes; 131,784 authored triangles across ten roots; vertex colors, no textures or external mesh decoder. Packing reuses the existing glTF Transform 4.5.0 pipeline. Ground-level solid vertices fit the shared wall/pillar footprints; soft foliage is separate. Checks verify all five routes with player-volume clearance, full dry/level footprints, hidden portal, camera clearance in the inner and outer courts, summons and real server dungeon progression.

Open `/dungeon-preview.html?dungeon=rootvault&view=entrance` on the local Vite server. Drag to inspect the layout, or use WASD to walk through the temple; the camera follows once walking begins. The preview uses the actual biome heightfield, nearby scenery and gameplay collision. Encounter state is simulated locally. Keyboard-driven walks through both broken front entrances reached the sanctuary, and crossing the portal loaded the existing monster encounters. The `dungeon-ruins-*-ingame.png` images show the current temples in their biomes; `dungeon-temple-sanctum-ingame.png` captures the portal reveal after the western route.
