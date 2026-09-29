# Mossvale loot icon atlas

Generated with the built-in image generation tool. Original transparent atlas retained as `loot-icons-atlas.png`; final individual inventory icons are in `public/ui/loot/`.

Requested grid: four columns and four rows, in the order below. Final PNGs use the generated alpha, a rectangular crop of the corresponding cell, proportional Lanczos downsampling, and transparent square padding only. No visual retouching or background reconstruction.

Normalization: original atlas is 1254×1254 RGBA. Grid edges are `[0, 314, 627, 940, 1254]` on each axis. In the fourth column only, horizontal crop edges are `[0, 314, 611, 921, 1254]` to keep the stew steam and tonic cork together with their own item. Trim only fully transparent outer padding, proportionally downsample each crop to fit 176×176, and center on a transparent 192×192 canvas. No alpha thresholding, recoloring, redrawing, or background removal was applied.

## Generation prompt

+Use case: stylized-concept.
Asset type: production transparent inventory icon atlas for Mossvale, a cozy voxel fantasy browser MMORPG.

Create ONE square atlas with exactly SIXTEEN different isolated item icons arranged on a mathematically uniform 4-column by 4-row grid. Aim for a 2048 by 2048 transparent PNG, four equal square cells per row. Each icon is centered precisely in its own cell and occupies about 70% of that cell's width/height. Generous transparent padding must separate every icon; nothing crosses a cell boundary. No visible grid.

Shared visual style: richly rendered chunky voxel/block-built 3D fantasy items, crisp tiny square bevels, stepped contours, painterly material variation over voxel surfaces, handsome warm lantern light from upper left, clean dark edge definition and appealing tactile materials. Strong recognizable silhouettes at 40px. Same camera and rendering style across all items, mostly three-quarter front view. These should feel like detailed game inventory loot, matching carved wood, worn leather, bright brass and colored crystals.

Exact ROW-MAJOR order, left to right:
ROW ONE:
1. Slime residue: a compact irregular glistening emerald green gel glob, little blocky droplets attached. Creature loot, no face.
2. Gnarled bark: one dark chipped woody bark scrap with rugged branching woodgrain, small moss edge.
3. Chipped fang: one large curved ivory wolf fang with a visibly broken chipped tip and earthy base.
4. Cracked carapace: one rusty red-brown beetle shell fragment, armored ridges and a deep obvious crack.

ROW TWO:
5. Frost shard: one translucent pale blue icy crystal chunk with frosty voxel facets.
6. Tattered pelt: a small folded brown ragged fur hide scrap with uneven furry edges.
7. Bog gland: a small bulbous olive green organic monster gland with a knotted stem, stylized creature loot, no blood.
8. Void dust: a small stoppered glass vial holding luminous purple mote dust and a few close purple sparkles.

ROW THREE:
9. Trail bread: one golden brown rustic bread loaf, two pale scored cuts on the crust.
10. Roast meat: one roasted drumstick with caramel brown skin and a small ivory bone end.
11. Berry tart: a small golden pastry tart filled with glossy red berries.
12. Hearty stew: a carved wooden bowl of orange stew with visible vegetable chunks and one tiny warm steam curl.

ROW FOUR:
13. Prismatic pearl: one large iridescent pearl with pale pink, blue and green facets, two close tiny sparkles.
14. Ancient coin: one thick antique golden coin viewed at a slight angle, worn embossed oak-leaf emblem, no writing.
15. Stormhorn core: a glowing gold-and-blue crystalline heart-shaped core, epic magical energy contained close around it.
16. Greater tonic: one ornate corked glass potion bottle filled with ruby red healing liquid, brass trim and a pale label with no marks.

Constraints: actual transparent alpha everywhere outside the objects, no backdrop, no floor, no external cast shadows, no frames or border rectangles, no letters, no words, no numbers, no labels printed with text, no watermark. Each item alone inside its own cell. No decorations spanning cells. No duplicate items, no missing items, preserve the exact 4x4 order. Quality is represented only by the item design, never colored border boxes.
