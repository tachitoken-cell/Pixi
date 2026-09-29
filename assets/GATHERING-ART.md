# Tiered gathering artwork

Nine original resource models were authored in Blender 5.2.1 LTS for Mossvale's mining, woodcutting and herbalism progression. Their structures vary by tier: embedded copper nodules, cobalt shards and a split sunstone monolith; pale birch, layered ironwood and gnarled elderwood; violet moonpetals, crystalline frostblooms and broad golden sunblossoms.

The tree crowns use exposed voxel faces and the woodland palette from the existing giant-tree family. These are individually authored trees with narrow interaction trunks, rather than scaled or recolored copies of an existing tree. No downloaded meshes, textures or generated images are used.

- Runtime: `public/models/gathering-kit.glb`
- Editable source: `assets/source/gathering-kit.blend`
- Render: `assets/source/gathering-kit-preview.png` (1800 × 1400)
- Rebuild: `/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-gathering-assets.py -- --render`

The GLB contains **9 roots, 18 meshes, 10,304 triangles, one shared vertex-color material and no textures**, totaling **473,912 bytes**. glTF Transform 4.5 welds, quantizes normals/colors, deduplicates and prunes. Positions remain Float32; no Draco or Meshopt decoder is needed. Preserve authored transforms when cloning or instancing.

## Harvesting contract

Each named root has exactly two mesh children: `${root}-base` and `${root}-yield`. Both have identity transforms and geometry authored relative to the grounded root. Their `userData.harvestable` values are respectively `false` and `true`; `userData.part` is `base` or `yield`. Depletion hides only the yield mesh. Ore leaves stone and moss, trees leave a cut stump with growth rings and roots, and herbs leave a small root bed. Regrowth restores yield visibility; no model rebuilding is required.

Each root also exports `width`, `depth`, `height`, `profession` and `tier` metadata. Dimensions are placement envelopes in meters; Y is up, Y=0 is ground, and +Z is forward. Runtime owns node placement, interaction, collision, particles, timing and progress.

| Root | Profession / tier | Envelope width × height × depth | Visible depleted height |
| --- | --- | --- | --- |
| gathering-copper-vein | mining / 1 | 2 × 1.25 × 1.7 | 0.325 |
| gathering-cobalt-vein | mining / 2 | 2.2 × 2 × 2 | 0.325 |
| gathering-sunstone-vein | mining / 3 | 2.4 × 2.7 × 2.1 | 0.325 |
| gathering-silver-birch | woodcutting / 1 | 3 × 4.5 × 3 | 0.496 |
| gathering-ironwood | woodcutting / 2 | 4 × 6 × 4 | 0.496 |
| gathering-elderwood | woodcutting / 3 | 5 × 8 × 5 | 0.496 |
| gathering-moonpetal | herbalism / 1 | 1.5 × 0.8 × 1.5 | 0.155 |
| gathering-frostbloom | herbalism / 2 | 1.8 × 1.1 × 1.8 | 0.155 |
| gathering-sunblossom | herbalism / 3 | 2 × 1.5 × 2 | 0.155 |

The builder asserts grounded bounds and envelopes before export. Final Three.js GLTFLoader verification checks all nine names, both harvest flags, identity child transforms, dimensions, Float32 positions, shared material, independent depletion and file/triangle counts. The source retains an unmodified library scene and a separate lit gallery; gallery cameras, lights, floor and duplicates are not exported.

The final gallery render was inspected: all nine silhouettes are visible and distinct, foliage matches the stepped woodland family, ore tiers have different structures, and the three flower patches retain clear stems and petals at their smaller scale.
