# Themed dungeons

The Plagueworks (30–35), Emberfall Foundry (40–45), and Veilhaven Monastery (50–55) each contain 24 encounters (eight main and sixteen optional), two bosses, two seals, eight guarded treasure caches, a checkpoint and a completion return. The expanded maps have at least three times their original walkable area, with exactly three times the enemies: 93 in The Plagueworks, 93 in Emberfall, and 96 in Veilhaven.

Each expanded dungeon starts with a protected arrival sanctuary. Players can prepare inside its ward before entering combat.

- `themed-dungeon-layouts.blend`: three complete playable environment scenes plus an overview. Object placement is exported from the runtime, including gates in their initial closed state.
- `{plagueworks,emberfall,veilhaven}-kit.blend`: editable architecture, furniture, landmarks and entrance decoration. Corresponding GLBs live in `public/models/`.
- `themed-monsters.blend`: thirty-six editable rigid rigs, each with idle, walk, basic attack, special attack and death clips. Each dungeon has ten regular enemy designs and two bosses. The six bosses retain distinct silhouettes and attacks. Square animal anatomy, stepped silhouettes, layered armor and clothing use the same voxel construction and muted palette as Mossvale’s existing creatures. Weapons and gripping fingers share articulated hand transforms. Export: `public/models/themed-monsters.glb`.
- The adjacent `*-preview.png`, `dungeon-layout-*.png` and `themed-dungeon-layouts-overview.png` files show the authored assets.

From the repository root, using the installed Blender executable:

```sh
Blender --background --python scripts/build-themed-dungeons.py -- --render --optimize
Blender --background --python scripts/build-themed-monsters.py -- --render --optimize
node scripts/export-dungeon-interior.mjs artifacts/themed-dungeon-layouts --themed
Blender --background --python scripts/build-dungeon-layouts.py -- --themed --input artifacts/themed-dungeon-layouts --render
npm run check:dungeons
npm run check:wiki
npm run build
```

Run Vite and open `/dungeon-preview.html?dungeon=plagueworks` (or `emberfall` / `veilhaven`) to inspect the environment, creatures, gates and hazard patterns. This inspector simulates encounter state; the game server owns actual damage, progression and rewards. Run `node scripts/check-themed-dungeons-browser.mjs http://127.0.0.1:5198` against Vite for all three visual routes. Full server progression is covered by `scripts/check-dungeon-expansion-server.mjs`.
