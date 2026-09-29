# Biome towns and Lanternreach furnishings

Original Mossvale voxel geometry authored in Blender 5.2.1 LTS. These assets use modeled forms and a shared vertex-color palette; no generated bitmap, external texture, downloaded model or third-party game artwork is included. The editable libraries and gallery scenes are retained in the `.blend` sources.

## Rebuild and inspect

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-frontier-biomes.py -- --render
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-city-furnishings.py -- --render
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-town-biomes.py -- --render
node scripts/check-frontier-assets.mjs
node scripts/check-building-models.mjs
node scripts/check-town-biomes.mjs
```

| Library | Runtime | Editable source | Gallery |
| --- | --- | --- | --- |
| Biome towns, foliage and Hollow entrance | `public/models/frontier-biomes.glb` | `assets/source/frontier-biomes.blend` | `assets/source/frontier-biomes-preview.png` (2000×1250) |
| Auction, bank and city gardens | `public/models/city-furnishings.glb` | `assets/source/city-furnishings.blend` | `assets/source/city-furnishings-preview.png` (1800×1200) |
| Regional landmarks and gardens | `public/models/town-biomes.glb` | `assets/source/town-biomes.blend` | `assets/source/town-biomes-preview.png` |

The frontier and civic galleries use Cycles, 32 samples, denoising, warm upper-left light and AgX color management. Gallery floors, lights and cameras are excluded from the runtime GLBs. The frontier and civic scripts run glTF Transform 4.5.0 weld, quantize, dedup and prune steps. Static positions use 16-bit quantization; normals and colors use 8-bit quantization. No Draco or Meshopt decoder is required.

## Town exteriors

Every biome has three roots: `frontier-{biome}-cottage`, `frontier-{biome}-inn`, `frontier-{biome}-market`.

| Biome | Modeled identity |
| --- | --- |
| `greenwood` | Ivory plaster, carved oak, moss roofs and timber dormers |
| `amberwild` | Warm masonry, copper-colored stepped roofs, twin chimneys and sun emblems |
| `frostmarch` | Heavy timber, blue slate walls, thick snow courses, chimney caps and hanging ice |
| `hollow` | Dark root-stone, violet roofs, twisting ridge roots and crystal finials |
| `sunveil` | Sandstone courses, crenellated terraces, stepped copper domes and turquoise lattice windows |
| `mistwood` | Carved timber, tall layered leaf roofs, bamboo trim and hanging vines |

All roots use metre units, Y-up, +Z-forward, unscaled transforms and a floor origin at Y=0. Cottages are 10×9m and inns 14×12m. House roots contain only five exterior meshes with `userData.part` values `shell-front`, `shell-back`, `shell-left`, `shell-right`, and `roof-shingles`. Replace the old exterior children while retaining the original room floor, furniture and chair targets. The capital's grand city houses retain their existing architecture.

These exteriors also dress the 85 houses inside the five regional cities. Greenwood retains its original city architecture. Authored exterior colors remain intact; the existing room materials keep their regional tint.

The central +Z doorway is 2.8m wide and 3.6m tall. Low facade geometry stays within the existing .35m-thick wall collision strips. Windows preserve the original locations. Roof overhangs start above head height; all upper facade and roof geometry belongs to the roof cutaway. Village markets use the existing 3×2m footprint.

## Animated regional landmarks

Each regional city has four `town-{zone}-{kind}` roots: `landmark`, `tree`, `planter`, and `statue`. The landmark replaces the southern fountain at local `(34,24)` within its existing 6×6m collision footprint. Gardens reuse existing tree, planter, and statue anchors and footprints; roads and service positions remain authoritative gameplay data.

| Town | Landmark and looping motion |
| --- | --- |
| Amberwild | Harvest windmill with rotating copper leaf sails |
| Frostmarch | Ice orrery with orbiting crystal rings |
| Hollow Lanternhaven | Root shrine with a floating lantern |
| Sunveil Bazaar | Copper sun windcatcher with nested spinning vanes |
| Mistwood Haven | Jungle shrine with a turning bamboo waterwheel and moving flower |

The Blender transform clips are named `town-{zone}-ambient`. One mixer animates each nearby landmark; distant towns and Effects Off pause cosmetic motion. Static gardens use the existing instanced prop renderer. The new landmarks have cached camera obstruction bounds and add no dynamic lights. Greenwood's fountains and gardens retain their original models.

## Foliage and Hollow gateway

| Root | Dimensions and collision contract |
| --- | --- |
| `frontier-sunveil-palm` | Height 12.04m, canopy about13.35×13.55m; ground trunk collision1.1×1.1m |
| `frontier-sunveil-cactus` | Height5.31m; trunk and arm footprints included in root metadata |
| `frontier-sunveil-rock` | Height2.1m; conservative4.5×3.5m solid |
| `frontier-mistwood-broadleaf` | Height17.01m, canopy about12.02×10.02m; trunk/root collision3.4×3.4m |
| `frontier-mistwood-fern` | Height1.78m, spread about5.3×5.37m; no collision |
| `frontier-mistwood-root` | Height2.06m; conservative4.4×2.8m solid |
| `frontier-hollow-gate` | 10×6m footprint,12m height; clear6×6m passage. Two piers only: local `[x,z,width,depth]` boxes `[-4,0,2,6]` and `[4,0,2,6]`. No threshold or floor obstruction. Guardian/access rules remain gameplay code. |

Each root supplies `width`, `depth` and JSON `solidFootprints` metadata. Bounds of canopies and raised decorative relief may exceed the ground collision footprint.

**Instancing:** preserve the imported position buffer and compose the mesh's authored local matrix into each instance placement matrix. Applying metre transforms directly to normalized integer position buffers truncates their coordinates and flattens the model. The integration check runs the actual runtime batch helper, verifies a full-height rotated/scaled palm and reproduces that former failure as a negative control.

## Civic furnishings

All roots are `furnishing-{name}`, ground-origin, Y-up and metre-scale. Local placement is supplied by `CITY_FURNISHINGS`; no world positions are baked into the mesh.

| Name | Ground footprint | Intended use |
| --- | --- | --- |
| `auction-reading-desk` | 4×1.2m | Open ledger, ink, books and candle at the back of the auction hall |
| `auction-bookcase` | 1.2×4m | Double-sided shelves along the auction hall walls |
| `auction-display-case` | 3×1.4m | Framed display of coins, crystal and precious metal |
| `auction-bench` | 3.2×.8m | Side seating clear of the central aisle |
| `bank-counter` | 4.4×.9m | Ledger, coins, ink and lockbox; bank-local center(0,-2.4) |
| `bank-vault` | 4×.6m | Raised lock and hinges fit within the approved depth; local center(0,-5.6) |
| `bank-crest` | Decorative, no collision | Mounted above the door at local(0,4.35,6.24) |
| `bush-planter` | 2.4×1.2m | Stone planter, bushes and berries |
| `lantern-statue` | 2.8×2.8m | Original stone lantern keeper on a mossy pedestal |
| `courtyard-tree` | 3×3m | Raised planter and compact oak; canopy overhangs above head height |

The bank reuses the enterable city inn `house-city-east-2` at(59,24), rotation−π/2. Runtime removes the old interior furniture and chairs, retains its floor and adds the bank kit. The banker remains at local(0,0). The bank crest is only a visual identifier; bank storage state and authorization belong to the server.

## Verified budgets and integration

- Biome library:25 roots,75 mesh draws,105,556 triangles,2,749,500 bytes; one palette material.
- Civic library:10 roots,10 mesh draws,5,912 triangles,229,184 bytes; one palette material.
- Real GLTFLoader checks cover all12 house variants, native decoder support, finite buffers, door clearance, wall footprints, Hollow passage, full-height instancing, shared resources and preserved Blender sources/previews.
- Runtime checks cover127 biome homes, the existing grand capital architecture, bank furniture replacement and actual civic furnishing instances. The broader building check passes156 shells and396 chair targets, including rotated doorways and directional cutaways.
- Regional checks cover the five exported clips in the actual city renderer, ground footprints, stable world anchors during animation, camera clearance, Effects Off, distance culling, and resumed playback.
