# Benji UI — September 28, 2026

Authoritative reference: [Mossvale UI Mobile](https://claude.ai/artifact/3P1oNCYHF6wxBQLwjq1jnF), linked with `mossvale-ui-complete.zip` in [Benji's Discord message](https://discord.com/channels/@me/1548969548785385513/1554098851420438558).

The signed Discord attachment returned 403 and its browser download was blocked. The linked public preview exposed ordinary relative HTML, CSS, JavaScript, JSON, image, and audio resources. These were retrieved with normal HTTP requests from its observed frame directory, without executing the downloaded scripts:

`https://13452206-7301-4591-a70a-e154b9cea168.frame.claudeusercontent.com/_f/1790596052-61a1/`

`original/` preserves those resources; `source-sha256.json` records sizes and hashes. This is an acquisition of the linked preview, not a claim that the ZIP archive was obtained. Three inferred class portraits were unavailable; the game continues rendering real character/NPC portraits. The original demo JavaScript and demo catalogs are reference material and are not imported by the game.

## Runtime integration

The user's direction is to implement Benji's interface composition across the game, including phones, while retaining Mossvale's established woodland materials. Marcellus, DM Sans and the compact HUD face, oak/parchment/forest frames, antique gold, the original wordmark and real character portraits remain authoritative. The prototype's Outfit/mint/glass skin and simulated gameplay do not run in the client.

All 36 public exports (34 functions and two symbol aliases) across the six supplied JavaScript entry files are mapped in [review.md](review.md) to 32 actual game surfaces. Split features have separate captures, including spellbook/professions, journal/contracts/story dialogue, pets/mounts, and raid encounter/collection. Dungeon, PvP, Wallet, NPC dialogue and the mobile menu are included. The shared touch HUD is reviewed alongside the desktop HUD.

Menus invoke existing game actions. NPC proximity, tutorial gates, server prices, ownership, payment review and uncertain-transaction recovery still govern availability. The adventure cap remains 60 and normal equipment upgrades stop at +5. Current specialist activation/combat is disabled; new SP1 classes/four trials are excluded. The separate atlas work is paused. These gameplay and project boundaries are not new UI features.

Artwork is copied to `public/ui/benji-2026-09-28/`. Explicit identity mappings cover matching menu, loot and resource artwork. The archive contains 103 icon PNGs, including 21 item images and 16 menu images; it does not contain the discussed 300-item catalog. Unmatched prototype loot is not introduced as game content. Spell, talent and pet catalogs retain their separately approved artwork and definitions.

UI tap/open/close samples use the existing effects bus, respect volume/mute/background/gesture rules and fall back to the established click sound. No game sound is replaced by a UI sample.

## Review

`node scripts/build-benji-ui-review.mjs` builds the isolated review from the actual game renderers and styles. Its local fixtures expose real states without connecting to a realm, account or payment provider. The supplied demo scene is only the labelled review backdrop.

With Vite running, use `MOSSVALE_UI_URL=http://127.0.0.1:5299 node scripts/check-benji-ui-browser.mjs --full`, then `node scripts/build-benji-ui-contacts.mjs` with the same environment. Set `MOSSVALE_PLAYWRIGHT` and `MOSSVALE_CHROME` when the runtime is outside the local dependency tree. The gallery is `artifacts/benji-ui/mossvale-gallery.html` and its machine report is `artifacts/benji-ui/review-mossvale-style.json`. The complete matrix has 32 surfaces at desktop 1440×900, phone 390×844 and landscape 844×390, plus login/HUD/menu at 320×740: 99 views. The checker loads and verifies Marcellus and DM Sans before capture. Browser requests are restricted to local assets and those fonts' static hosts; realm/account/payment requests remain blocked. Screenshots are layout evidence, not proof that every network flow completed.

`scripts/check-story-game-browser.mjs` and its `--mobile` run use the built game, a disposable local realm and a seeded test character. They exercise real roster entry, quest tracking, inventory search and an authored quest object; the mobile run adds the menu and collection filters. The final desktop and phone runs passed; their current reports are `artifacts/story-game/result.json` and `result-mobile.json`. Desktop/phone browser emulation is separate from physical iOS/Android verification, which remains untested.

The refreshed capture passed all 99 views: 32 desktop, 32 phone, 32 landscape and three narrow views, with Marcellus and DM Sans loaded in every row and no reported layout/image/runtime failures. The affected HUD/Dungeon captures also passed after the final corrections. The coordinator inspected all ten final contact sheets without further material findings; the independent assigned-scope review and ten populated HUD layouts passed. Final build/wiki and the desktop/mobile built-game journeys passed. See [review.md](review.md) for the exact scope and [final-review.md](final-review.md) for independent findings and their resolution. Earlier 57/59-view galleries and the incomplete first 99-view attempt are superseded. Focused controller checks and their limitations are recorded in the linked coverage documents.

This work is local and uncommitted. No production, wiki, native store or payment deployment is asserted. See [review.md](review.md) for the final validation results and explicit source adaptations.
