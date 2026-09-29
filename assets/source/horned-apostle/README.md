# Horned Apostle supplied art

The unchanged `horned_apostle.blend` and PNG references were downloaded from BlocBoyBenji's Discord design messages on 2026-09-24:

- Boss mesh and clean/hero/card references: https://discord.com/channels/@me/1548969548785385513/1552464777131859990
- Labeled mechanic sheets: https://discord.com/channels/@me/1548969548785385513/1552467113342533744

`horned-apostle-rigged.blend` is the detailed editable source. The original silhouette, four arms, torn wings, ridged horns, halo, chest core and Death Stars remain. Its void palette uses obsidian armor, violet fissures, cyan/lilac runes and cold metal. Added Blender geometry includes overlapping shoulder plates with etched cyan cuts, carved ribs and collar armor, a chest reliquary, segmented bracers and knuckles, skull brows/teeth, horn tracery, inscribed robe panels, inset wing sails, luminous veins and stitches, and separated eclipse fragments around the halo. These details also appear on the pets and wearable rewards. Connected mesh islands are grouped into ten rigid animation pivots; no source scripts are executed. The floor and camera are excluded from the runtime character pack.

Build and inspect:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --disable-autoexec --python scripts/build-horned-apostle.py -- --render
node scripts/check-horned-apostle-assets.mjs
node scripts/check-raid-cast-cues.mjs
/Applications/Blender.app/Contents/MacOS/Blender --background --disable-autoexec --python scripts/build-raid-props.py -- --render
node scripts/check-raid-props.mjs
```

The exporter creates `public/models/horned-apostle.glb`: three character variants with 18 clips each, plus shared reward attachment roots. Every variant retains idle, walk, basic attack, special attack, cast and death, and adds distinct Black Claw, Death Stars, Death Palm, Four Hands, Soul Chains, Shadow Wings, Black Sun, Soul Harvest, Death Clones, Suits Judgment, Death Realm and Incarnate motions. It uses a vertex color palette and glTF Transform resample/dedup/prune; no textures or decoder are required. Feet are at Y=0, front is +Z, dimensions are metres. The boss is 6.745 m tall; the detailed variants use 12,243–12,515 triangles and 20–22 draws each. The shared pack is 2.04 MB. Source hashes are embedded in GLB extras.

Named spell clips put contact at their midpoint. `src/raid-visuals.ts` derives the active clip and progress from authoritative hazard/phase timestamps, and the existing monster mixer maps contact to the server impact time. Long rituals hold their pose, removed hazards cancel their cue, and paused preview snapshots produce the same pose repeatedly. These are visual adapters and do not change combat ranges, damage or deadlines.

The true Apostle retains red eyes and one small gold halo gem so the existing clone mechanic remains identifiable; false clones have violet eyes and no gold gem. Everything around that deliberate identifier uses the void palette. Incarnation gains dark amethyst skin, violet horn ridges and brighter cyan incisions, and uses an enlarged eclipsed Black Sun behind its head. `apostle-runtime-variants.png` is a Blender contact sheet of these actual runtime rigs; supplied PNG references retain their original concept colors.

`../raid-props.blend` and `../raid-props-preview.png` contain the four matching encounter relics exported to `public/models/raid-props.glb`: a fractured crystal altar with suspended shards, a cyan Soul Shield with engraved segments, a violet-fissured obsidian column and a dark Black Sun with etched cracks and eclipse fragments. The 703 KB pack uses three shared vertex palettes, three draws per prop and 1,810–6,432 triangles per prop. Names, floor/center pivots and dimensions retain their gameplay contracts; there are no texture downloads. The asset checks reject green and warm-metal palettes and enforce the existing geometry budgets.

Attachment roots have local origins for a character's back (`apostle-wings`), head (`apostle-crown`), body (`apostle-aura`) and weapon tip (`apostle-weapon`). `src/raid-model.ts` creates them with shared geometry/materials and reuses the monster animation controller for four growing Death Apostle pet stages.
