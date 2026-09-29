# Benji combat update — source and integration

Local worktree implementation only; no commit, push or deployment is implied by these checks. The separate atlas work remains paused. No SP1 trials or class art are included.

## Sources

- Instant Combat v12: [Benji's Sep28 03:07 message](https://discord.com/channels/@me/1548969548785385513/1553936271754264606), edited04:30, “done, all bosses reworked and new spells”. The downloaded `mossvale_instant_combat_v12.zip` is preserved under `assets/source/instant-combat/benji-2026-09-28/`. SHA256 `914b08f4970cc76bf687187184ef6b7ab0930ff376935ad153fe4fe5591891c5`,8,992,425bytes. The ZIP takes precedence over the earlier [public viewer](https://claude.ai/artifact/JWXp8ef7EyrtMQ9bRXXmr5).
- Apostle: [Benji's public viewer](https://claude.ai/artifact/3CtANMfaikwbR9jHKRuFdd). Exact JSON and inert viewer source are preserved under `assets/source/horned-apostle/benji-2026-09-28/`. Each manifest records public URLs and SHA256 hashes of original decompressed bytes.
- Archive Python/JavaScript is reference material only. The build runs the repository adapter, not scripts supplied by the artifact.

## Runtime

`node scripts/build-benji-combat-assets.mjs` reproduces three GLBs with pinned glTF Transform deduplication. IC uses the exact v12 native GLB plus eight preserved legacy shield rituals:15models,107clips,6,537,612bytes. Apostle uses all26clips for each of3forms, plus the four unchanged reward cosmetics:78clips,4,942,020bytes. Its12spell effects retain all36spawn/loop/vanish clips:1,998,972bytes.

The JSON format has one full-weight bone per vertex. `scripts/lib/benji-model.mjs` validates triangles do not cross rigid joints, partitions geometry by bone/material, applies the supplied inverse bind, preserves all animation keys and event metadata, and retains shared geometry for cloned actors. No baked substitute poses are generated. The final GLBs reproduce570 sampled authored key poses across114Apostle/effect clips within0.08mm. The supplied source contains small negative foot positions during some swaying poses; its6-second spawn deliberately starts below the floor. The game fits the entire spawn into its existing3-second opening before the first attack. The matching black-hole effect uses the same accelerated authored clock, without delaying gameplay.

The game attaches the newly supplied vertical/viewer-sized motifs through a separate basis transform: palm1.5×, feather0.37×, chain0.09× and soul0.14×; palm, claws, feather and rune-ring rotate90° aroundX. This retains the established hand/feather orientation, flat floor runes and sub-metre chain links. Native GLB data stays unchanged. The world check measures the actual rune plane and chain-instance bounds.

All24IC skills now run in the authoritative controller, with timestamped hit tests, readable floor markers, rescue actors, statuses and cleanup. Ranged Grave/Void Cantor autos launch at500ms, travel40m/s over12m, and retain a fixed, dodgeable destination. Boss taunts support the two tank-swap abilities. Wave monsters keep nearest-player targeting. Shield thresholds, eight shield objectives, schedule, brackets, five rounds, reward and persistence rules remain in place.

The demo skill-FX source includes blue stand-in players. These are archived, not spawned into live arenas. Real server player positions, damage regions and rescue objectives drive the existing game visuals. Both the source's named corpse-release events and its illustrated rescue successes are examples; an actual cage/fist/cocoon only releases when players destroy it or its deadline expires.

## Explicit decisions where the source lacks a server value

The authored TypeScript says its numbers are suggestions. Implemented values are isolated in `IC_SKILL_TUNING`:

|Value|Implementation and reason|
|---|---|
|Cocoon durability|2% boss HP, matching the supplied Bone Cage durability; source gives no Cocoon HP.|
|Successful Grave Toll|60% max-HP pool divided by3+ players per toll; explicit failed stacks remain60% alone or40% each for two.|
|Successful Brood Bomb|90% max-HP pool divided by3+ players; failed soak remains90% each plus4scarabs.|
|Void pull|3m/s, collision checked; source specifies the duration and safe radius but no pull speed.|
|Knockback|5m, collision checked; source omits a distance.|
|Gaze repeat damage|50% max HP per500ms while touching a beam; source omits repeat cadence. Beam width1.8m, length16m and start offset1.5m are copied from its FX builder.|
|Eclipse light shrink|2.8m to1.96m, exactly the source builder's final70%scale.|
|Knockdown/knockup control|2-second server stun; body displacement is not used as authority for whether actions are allowed.|

Timers stated in the rules take precedence over the short illustrative animation: Bone Cage/Cocoon8s, fist4s, tether6s, Last Rites5s. Cast recovery begins after that gameplay deadline. The existing1.25attack-cadence multiplier applies to2.5snormal/1.5sfinal recovery, not by truncating the supplied warning or rescue timer. Requiem uses the explicit2-second rule, starting at its1000ms event, rather than extending to the3067ms visual end. Per-player acid damage is capped at one20%tick/second across overlapping puddles. Odd unpaired players in Null Tether are unlinked.

## Verification

- `scripts/check-instant-combat-skills.mjs`:24skills, success/failure deadlines, exact rescue HP, swaps, repeated damage, statuses, cleanup, marker privacy.
- `scripts/check-instant-combat-runtime.mjs`:production hit resolver, actual boss taunt hooks, both caster projectiles, fixed-target dodge, instance isolation, delayed-tick follow-up ordering.
- `scripts/check-instant-combat-server.mjs`:existing registration/brackets/waves/rewards and all70%/35%shield mechanics, plus production movement/cast/charge control guards.
- `scripts/check-instant-combat-monsters.mjs`:all15models/107clips, articulated motion, runtime cue selection, source/actor isolation, bounded meshes/materials.
- `scripts/check-benji-combat-source.mjs`:final GLB fidelity to15original Apostle/effect JSONs,114clips,570key poses, authored event metadata.
- `scripts/check-horned-apostle-assets.mjs`, `scripts/check-raid-cast-cues.mjs`:Apostle rig/rewards/pets and authoritative clip clocks.
- `scripts/check-raid-world.mjs`:real animated spell assets, exact deterministic rewind, hazard geometry, safe openings, low/off quality, spawn portal, shared-buffer-safe cleanup.
- `scripts/check-benji-combat-browser.mjs`:WebGL contact sheets for15ICmodels,24boss casts,3Apostle forms and12effects; errors and capture-state checks. Evidence in `artifacts/benji-combat-2026-09-28/`.

The standalone review is `benji-combat-review.html`. It examines rendered assets, not multiplayer gameplay or deployment. The focused server checks are deterministic local fixtures and extracted production hooks; a live20-player balance test has not been performed.
