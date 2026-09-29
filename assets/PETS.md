# Rare companions

Pets drop as unlearned items in each credited player's corpse loot. Collect them into your bags, then list them at the Auction House or use **Learn pet**. Learning consumes one copy permanently for that character. Additional copies remain tradable. The **Pets** collection (V) summons or dismisses one cosmetic follower; selecting another replaces it.

| Pet | Enemy | Chance per credited kill |
| --- | --- | --- |
| Moss Fox | Bramble Wolf | 0.1% (1 in 1,000) |
| Moon Owl | Briar Sentinel | 0.1% (1 in 1,000) |
| Ember Drake | Ember Beetle | 0.1% (1 in 1,000) |
| Crystal Tortoise | Stone Golem | 0.1% (1 in 1,000) |
| Bloom Hare | Woodland Slime | 0.1% (1 in 1,000) |
| Lantern Moth | Grove Spider | 0.1% (1 in 1,000) |
| Frost Cub | Frost Yeti | 0.1% (1 in 1,000) |
| Golden Pig | Level 40 Ashen Crown Titan world boss | 0.01% (1 in 10,000) |

The Golden Pig requires the actual level 40 overworld boss death. Opening corpses never rerolls loot, and dungeon treasure caches cannot roll pets. Unlearned pets use normal bag capacity, bank storage and auction escrow. They cannot be sold to NPC vendors. Learned pets provide no combat stats and persist across reconnects; followers hide while their owner is dead or aboard a zeppelin.

Editable models: `assets/source/pets.blend`. Runtime kit: `public/models/pets.glb`. Icons: `public/ui/pets/`. Contact sheet: `assets/source/pets-preview.png`.

Rebuild with `/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-pet-assets.py -- --render`. Open `/pet-preview.html` with Vite for the interactive model gallery.

Run `npm run check:pets` and `npm run build` to verify gameplay, auction/learning UI, models and production compilation.
