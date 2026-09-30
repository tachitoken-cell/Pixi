# Adventurer model pipeline

How `models/adventurer.glb` was made from the concept model (`model_1.glb`, an image-to-3D scan of the whole
reference sheet, where every figure only has one real side):

1. `decomp.mjs` (Node, glTF-Transform): remove the Draco compression.
2. `split.py` (Blender): import the sheet.
3. `fuse1.py`: cut out the front, side and back figures, turn them into one character frame, 1.50 m tall.
4. `fuse2.py`: carve one closed 360° body: inside the front figure's front surface and the back figure's back
   surface (smoothed depth maps and silhouette distance fields), marching cubes, 40k triangles.
5. `bake.py`: UV unwrap and bake the colours of each figure separately, blended by surface direction (front
   figure for front-facing areas, back figure for the back, side figures for the sides).
6. `rig.py`: centre, reduce to ~24k triangles, add the 9 joints the game animates (Body, Torso, Neck, ArmL/R,
   HandL/R, LegL/R), automatic weights, export GLB.

In the game, `src/model-character.js` drives these bones from the existing procedural animation rig, so every
animation and skill works on the model. Paths in the scripts point at the working folders used when it was built.

## v2 (current): `build_v2.py`

The first model bent badly when walking: one bone per leg and automatic weights smeared the shorts between the legs.
`build_v2.py` keeps the scanned face and hair (repainting the smeared sides of the head in the scanned hair colour)
and rebuilds the body and outfit as clean, separate parts: shirt, laced vest with back straps, belt with gold buckle
and pouches, navy shorts, fingerless gloves, fur-cuffed boots with straps. The rig has 15 bones: Body, Torso, Neck,
ArmL/R, ForeArmL/R, HandL/R, LegL/R, ShinL/R, FootL/R, and the weights are computed from the part geometry (smooth
blends only at the joints).

    python build_v2.py adventurer_rigged.blend adventurer.glb [preview_dir]

In the game the knees, ankles and elbows are driven by the `kneeL/R`, `footL/R` and `elbowL/R` pose values (walk and
run cycles in `src/character.js`, `gait()`).

## v3 (current): `build_v3.py`, from the second concept sheet

The second sheet (a new `model.glb`: front, three-quarter, side and back views plus close-ups) goes through the same
first steps (`decomp.mjs`, `fuse1.py` with the figure ranges of the new sheet, `fuse2.py`, `bake.py`). Its carved head
gives the face and hair. `build_v3.py` then fits the v2 rig and parts to the sheet's front silhouette (wide stance,
big buckled boots with leather cuffs, arms away from the body, bigger head) and bakes one 2048 texture: head texels
from the carved head, body texels from the sheet's front and back figures where the surface faces them and the colour
agrees with the part, the outfit's plain colours on the sides.

    python build_v3.py adventurer_textured.blend fuse1.blend adventurer.glb [preview_dir]
