# Goldroad Company caravan

Original Mossvale traveling gold merchant model, authored in Blender. Placed outside Lanternreach’s south gate in Greenwood.

- Editable source: `assets/source/gold-merchant-caravan.blend`
- Portable model: `public/models/gold-merchant-caravan.glb`
- Preview: `assets/gold-merchant/caravan.png`
- Rear locks and vault detail: `assets/gold-merchant/rear-security.png`
- Merchant close-up: `assets/gold-merchant/merchant-detail.png`
- Corrected crossbow grip: `assets/gold-merchant/crossbow-grip-detail.png`
- In-game conversation: `assets/gold-merchant/greenwood-dialogue.png`
- Requirements: `assets/gold-merchant/requirements-desktop.png`
- Requirements met: `assets/gold-merchant/requirements-met.png`
- Mobile requirements: `assets/gold-merchant/requirements-mobile.png`

Requirements screenshots use isolated level 29/30 test characters and simulated wallet holdings; they are not live wallet-balance evidence.

One merchant in a forest-green coat and feathered hat, with ledger, keys, coin purse and oxblood cape. Three escorts carry a sword and shield, a halberd, and a crossbow. The secured oak carriage has iron bands, barred windows, twin rear padlocks, four spoked wheels, lanterns, a roof strongbox, and a driving bench. Two harnessed horses reuse the authored Mossvale Hearthland Courser geometry, with chestnut and gray coat variants.

Sword, halberd and crossbow fingers fit around the actual handles with 2 mm clearance. The crossbow follows the trigger arm; its support hand reaches the stock, without duplicate lowered hands. The fresh-import geometry check covers the four grips and their parenting.

The GLB contains only the assembled caravan, with independent actor, limb, wheel, door and horse joints. No textures, lights or studio floor are required. Blender uses metres, Z up and -Y forward; glTF exports Y up and +Z forward. The saved Blender file includes studio lighting and a hero camera. The game reuses the merchant’s normal NPC idle animation; the guards, horses and carriage remain parked.

The caravan is anchored at world (18, 89), with the merchant at (14.95, 89). Right-click him or approach and interact to hear exactly: “I'm waiting for a new shipment of MOSS.” His panel checks level 30 and at least $25 USD worth of MOSS in a verified linked wallet, with Link wallet and Check requirements actions. Holdings use the existing MOSS/USD price source and the lower of finalized and latest canonical balances; unavailable or expired results remain unverified. Linking and checking spend no tokens. The shipment is still pending and he offers no goods yet. The carriage and horses have shared client/server collision footprints; the gate road and sky-dock approach remain clear.

Rebuild from the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-gold-merchant.py -- --render
python3 scripts/check-gold-merchant.py
node scripts/check-gold-merchant-world.mjs
node scripts/check-gold-merchant-holdings.mjs
node scripts/check-gold-merchant-ui.mjs
```

`validation.json` records a fresh GLB import and structural checks. The world check loads the real model and tests placement, collisions, disposal and nearby/range/obstructed dialogue against an isolated server. In-game browser verification confirmed the exact dialogue and portrait. Build, wiki, city-road, minimap, targeting and dialogue checks passed. The existing weapon-grip fix is retained and its 674,178-pose check passes. The unrelated city-life check still has an outdated asset-loader mock (it accepts only mounts although city life also loads store-collection).
