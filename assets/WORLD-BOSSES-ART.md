# World boss models and attacks

Editable source: `assets/source/monster-kit.blend`, opening on the four-boss lineup. The adjacent `World bosses - attack poses` scene contains evaluated windup, primary contact, swipe, pulse and direct-attack poses. Export: `public/models/monster-kit.glb`.

| Model | Level | Height | Detail |
| --- | --- | --- | --- |
| Briarhorn Elder | 10 | 4.00 m | Branching antlers, mossy bark plates, mushrooms, curled tusks and leaf beard |
| Rimefang Matriarch | 20 | 5.63 m | Crystal shoulder fans, layered pelt, glacier crown, fangs and icicle beard |
| Stormhorn Behemoth | 30 | 6.49 m | Thunder-carved plates, faceted horns, layered brow, reinforced legs and tail spines |
| Ashen Crown Titan | 40 | 7.11 m | Basalt crown, magma seams, moving furnace core, vented hammer gauntlets and plated joints |

Each boss has `attack`, `swipe`, `cast`, `charge`, `auto` and `death` clips. Primary, swipe and cast clips last 1 second with contact at 0.5 seconds; the runtime maps `pulse` to `cast`. Direct attacks last 0.4 seconds with immediate forward movement and contact at 0.2 seconds. Special attacks have anticipation, contact, follow-through and full recovery. Deaths collapse for 1.4 seconds and hold the grounded corpse pose. All rigs use metres, Y-up, +Z-front and fixed ground origins.

Charges are also authored for bramble wolves, briar boars, dune scorpions, stone golems, frost yetis and void stalkers. Their clips crouch, brace for the rush and recover without translating the local body in X/Z. The server owns world movement; `chargeProgress` maps dash start to clip phase 0.25 and dash impact to 0.5. The `Monster charges - anchored authored poses` Blender scene and `monster-charges-preview.png` show all ten species at crouch, rush, contact and recovery.

The complete monster GLB contains 14 roots, 62 clips, 14,232 triangles, one shared vertex-color material, no textures, and 930,100 bytes. Bosses use 7–8 rigid meshes each. Existing ten ordinary imported models and their 32 attack/death clips preserve exported vertex positions, pivots and animation keys. All 52 previous clips are also unchanged by the charge addition. Separate 9–10 second authored boss idle loops live in `public/models/idle-animations.glb` and `assets/source/idle-animations.blend`.

Rebuild with installed Blender:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-monster-assets.py -- --render --optimize --bosses-only
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-idle-animations.py -- --optimize
node scripts/check-monster-models.mjs
node scripts/check-monster-idles.mjs
node scripts/check-death-animations.mjs
```
