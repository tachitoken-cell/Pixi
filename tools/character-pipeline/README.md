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
