# Mossvale training grounds

Original geometry authored in Blender 5.2.1 LTS for the four class practice areas. Oak, leather, straw, stone, brass and class-colored heraldry use one shared vertex-color material. No downloaded geometry, textures, image generation, external lights or physics meshes are included.

- Runtime library: `public/models/training-grounds.glb`
- Editable source: `assets/source/training-grounds.blend`
- Rebuild: `/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-training-grounds.py -- --render`
- Four inspected 1200 × 900 renders: `assets/source/training-grounds-{knight,ranger,mage,cleric}.png`

The source contains the original identity-positioned library and four separately lit review scenes. Gallery floors, cameras, lights and duplicated review props are never exported. glTF Transform 4.5 welds, quantizes normals and colors, deduplicates and prunes the GLB. Positions remain Float32 so animation pivots retain their exact authored locations; no decoder dependencies are required beyond standard `KHR_mesh_quantization` support.

## Runtime contract

All roots have Y = 0 ground origins, meter units and +Z forward. All use `training-` prefixes. Child matrices must be retained when batching or cloning. The GLB has 11 roots, 13 meshes, 4,824 triangles, one material, no textures and 231,872 bytes.

| Root suffix | Actual width × height × depth (m) | Children |
| --- | --- | --- |
| dummy | 1.580 × 2.400 × 1.000 | `training-dummy-base`, `training-dummy-strike` |
| archery-target | 2.500 × 2.500 × 0.940 | `training-archery-target-body` |
| arcane-target | 1.940 × 2.670 × 1.940 | `training-arcane-target-base`, `training-arcane-target-crystal` |
| healing-shrine | 2.400 × 2.580 × 1.400 | `training-healing-shrine-body` |
| weapon-rack | 2.580 × 2.110 × 1.000 | `training-weapon-rack-body` |
| arrow-rack | 2.180 × 1.636 × 1.000 | `training-arrow-rack-body` |
| lectern | 1.300 × 1.701 × 1.100 | `training-lectern-body` |
| class-banner-knight | 1.180 × 3.170 × 0.670 | `training-class-banner-knight-body` |
| class-banner-ranger | 1.180 × 3.170 × 0.670 | `training-class-banner-ranger-body` |
| class-banner-mage | 1.180 × 3.170 × 0.670 | `training-class-banner-mage-body` |
| class-banner-cleric | 1.180 × 3.170 × 0.670 | `training-class-banner-cleric-body` |

The dummy strike pivot is `(0, 1.2, 0)` and the crystal pivot is `(0, 1.92, 0)`. Animate those children only: a gentle ±0.1 radian local Z recoil for the dummy, or ±0.07m Y float plus local Y rotation for the crystal. The plinth and dummy stand remain stationary. These amplitudes are visual recommendations; runtime owns playback.

Root `userData.aimPoint` values are local coordinates: dummy `(0, 1.55, 0.27)`, archery `(0, 1.58, 0.39)`, arcane `(0, 1.92, 0)`, shrine `(0, 1.90, 0)`. Width/depth/height metadata provides the requested placement envelope. Runtime owns actual colliders, interaction ranges, class trainer positions and effects.

Validation used Three.js GLTFLoader on the final optimized asset: all 11 names, geometry bounds, +Z-facing target, exact animation pivot positions, stationary base geometry during child motion, Float32 positions, aim metadata, material reuse, triangle and draw counts. All four class renders were inspected for recognizable silhouettes, correctly oriented targets and readable heraldry.
