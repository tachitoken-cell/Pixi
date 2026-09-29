# Mossvale deed cottages and merchants

Editable Blender source: `source/deed-cottages-merchants.blend`. Runtime: `../public/models/deed-cottages-merchants.glb` (2.9 MB). Render: `source/deed-cottages-merchants-preview.png`.

Four cottage variants use the corresponding trading card at `/nfts/houses/1.png` through `4.png`: oak and moss, pale timber and blossoms, autumn foliage, and deeper woodland green. Each has flowering ivy, planters, warm lanterns and a carved porch crest numbered with one to four marks. The existing walkable shell, furniture, two chair targets and open 2.8 m doorway are preserved.

The exported roots `deed-house-greenwood-1` through `deed-house-greenwood-4` replace those four real game houses in `createBuildingModels`. They use metres, Y up, +Z front, and the original 10 × 9 m footprint. Directional `shell-*` and `roof-*` parts (including multi-material groups) follow the normal interior cutaway.

`merchant-deed-auctioneer` is Bram Oakledger, with a green coat and sealed deed scroll. `merchant-auctioneer` is Merrick, with a brown coat and gavel. Both reuse the existing body, head and two-arm idle rig; the scroll follows Bram's arm. Bram stands in the Lanternreach auction hall at x31, z-25.

Rebuild from the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-deed-assets.py -- --optimize --render
node scripts/check-deed-assets.mjs
```

The script reuses `house-interiors.blend` and `city-kit.blend`, writes the editable library and showcase scenes, and exports only the six game roots. Optimization preserves positions and all authored part names; it quantizes normals/colors and removes duplicate data. The check loads the actual GLB through the game's model builders and verifies selection, open door rays, chair alignment, cutaways, NPC animation transforms and collision-free auction-hall access.
