# Mossvale action cursors

Generated with the built-in image generation tool. `cursor-atlas.png` retains the original transparent alpha and all twelve sprites in a 4 × 3 grid of 362px cells.

Runtime PNGs in `public/ui/cursors/` are 48 × 48 pixels, with a consistent 4,4 hotspot. Row-major filenames: default, point, attack, talk, mine, chop, harvest, loot, trade, craft, travel, grab.

Each runtime sprite is a 332px square crop, starting at cell offset x=30, y=25, resized to 48px with macOS `sips`. Only atlas extraction and size normalization were applied; no backgrounds were removed or repainted.

## Generation prompt

Use case: stylized-concept. Asset type: one production mouse cursor sprite atlas for Mossvale, a cozy voxel fantasy MMORPG with painted wood, brass, steel and emerald-green UI. Exactly 12 game mouse cursors on a precisely uniform grid of 4 columns and 3 rows, canvas ratio 4:3. Each square cell is separate with generous true transparent alpha padding and no visible background, no grid lines. All twelve cursors use a small ivory arrow pointer aimed diagonally upper-left, with its tip precisely at 12 percent of cell width and 12 percent of cell height, and an action emblem immediately southeast of it. The ivory NW pointer silhouette must remain clearly recognizable in EVERY cell. Each whole cursor fills at most 76 percent of its cell and never touches neighboring cells. Thick near-black outline with a very thin ivory outer edge; chunky voxel pixel-stepped shapes, few large color areas, simple high-contrast readable silhouettes that still work at 48x48 pixels, no fine ornament or tiny details. Consistent soft top-left lighting. Row-major order, left to right:
Row 1: 1. Plain ivory arrow cursor with warm brass rim, no emblem. 2. Ivory arrow with a small raised leather-gauntlet pointing hand (click/select). 3. Ivory arrow with a diagonal silver sword and red grip (attack). 4. Ivory arrow with a cream conversation speech bubble containing three bold dark dots (talk).
Row 2: 5. Ivory arrow with a steel pickaxe and turquoise mineral chip (mining). 6. Ivory arrow with a broad steel axe and brown wooden grip (woodcutting). 7. Ivory arrow with three fresh bright green leaves (harvesting). 8. Ivory arrow with a brown leather loot pouch and two gold coins (loot).
Row 3: 9. Ivory arrow with three clearly separated bright gold coins (merchant/trade). 10. Ivory arrow with a blocky steel hammer and small dark anvil (crafting). 11. Ivory arrow with a luminous turquoise archway (travel/activate). 12. Ivory arrow with a closed brown leather gauntlet (grab/rotate).
This is a finished cursor sprite atlas with twelve discrete well-separated transparent sprites, NOT a game screenshot or presentation. Transparent background means actual alpha, not a checkerboard. No text, labels, extra objects, watermark, scenery or panels. Make the action emblems robust and immediately distinct at small size.
