# Horned Apostle implementation

Local implementation of [#43](https://github.com/trappyon/mossvale/issues/43) and its raid tickets #44–48, with the room and creature sources from #50–52. The user's resolved scope is level 60, 10–20 players, all nine rewards, cosmetic equipment, pet evolution, specialist upgrades, MOSS protection/repair/cases and transferable specialist NFTs. The character cap remains 60. Source documents are preserved in `docs/source/raid/`; original art and derived asset provenance are in `assets/source/horned-apostle/README.md`.

## Local interactive preview

Run `npm run preview:raid`, then open `http://127.0.0.1:5183/raid-preview.html`. This separate local preview runs the real raid controller against an ephemeral simulated party. It does not load production credentials, accounts, payments or saved player data. The preview entry is excluded from the production build.

Choose a mechanic, press Play, and use click-to-move or WASD to practice. Select an enemy and use Attack (Space); use Heal to restore your preview character. Restart replays the selected mechanic. Pause freezes the encounter clock, and practice mode protects your character while you inspect. The Death Realm view can switch between both planes. Rewards are preview-only.

`node scripts/check-raid-preview-server.mjs` checks the isolated controller and WebSocket flow. With the preview running, `node scripts/check-raid-preview-browser.mjs` checks all 29 scenarios, movement, realm switching, reward reels, cosmetics and responsive layouts.

## Encounter

The Raid menu creates a dedicated lobby. The leader invites eligible online characters; every member chooses Tank, Healer or Damage and readies. Start requires 10–20 living level-60 members, at least one tank and two healers. The starting roster, roles and health scale lock for the whole run, including checkpoint retries. Ordinary four-player parties retain their limit.

The server owns phases, targeting, Marks, hazards, chains, shields, kills, timing and loot. Main and Shadow planes have different private instance IDs. Normal combat, enemy threat, ability targeting, healing and companion movement use those instances. Cross-plane attacks and healing cannot reach another plane. Reconnect restores position, plane, Marks and health from the running encounter. Fallen players recover when their current approach chamber clears, or wait for victory or a wipe during the Apostle; leaving cannot evade an active pull.

## Approach and Morgrath

Six four-creature chambers use all 24 submitted creatures: Void Garden, Umbral Kennels, Hollow Hive, Silent Ossuary, Black Forge and Fallen Citadel. `src/raid-approach.ts` pairs their distinct models and special attacks with the six rooms. The seventh room is Morgrath's Court, followed by the existing Apostle encounter. Each north gate stays locked until every room actor is dead. The leader must stand within eight meters of `(0, -27)` and select Continue. Advancing cancels outstanding attacks, heals/rallies the original group and enters the next room. Offline fallen members receive the same clear revival when reconnecting.

Morgrath starts with 24,000 HP per starting player. His 2.2-second Cleave hits an 18-meter frontal cone, 2.6-second Rift hits a 7-by-28-meter lane, and 3-second Rupture hits the room outside a seven-meter refuge around him. Damage is capped at half health until two Grave Knights spawn. Both the boss and his guards must fall to open the final gate. Creature specials cover six families: cleaves, lanes, bursts, annuli, leaps and targeted volleys. Lead-in strikes use the raid's existing percentage-of-max-health damage model (7.5% for creatures, 14% for Morgrath before active mitigation), with no Death Marks or early loot. These are initial local balance values, not playtest-approved tuning.

The submitted Blender originals are preserved under `assets/source/raid-approach/original/`, with hashes and Discord provenance in `assets/source/raid-approach/README.md`. `scripts/build-raid-approach-monsters.py` derives 25 detailed voxel/faceted creatures and six clips per model (idle, walk, auto, attack, cast, death) into `assets/source/raid-approach-monsters.blend` and `public/models/raid-approach-monsters.glb`. Per-instance mixers share immutable geometry/materials and sample the authoritative clock. Species-specific reliefs, plated limbs, layered bark, wing veins, chitin and luminous runes follow the existing Mossvale pets and bosses while retaining the void palette.

`scripts/build-raid-approach-rooms.py` authors seven rooms into `assets/source/raid-approach-rooms.blend` and the matching runtime GLB. Each root has floor/decor groups, shared palettes and a bounded draw budget. The ±34-meter floor stays clear, with all raised architecture outside it except two north-gate posts that leave the central twelve-meter passage open. The existing combat bounds, empty collider set, target rings and range rules remain in use. Runtime visibility selects one chamber at a time. Source-linked creature spells reuse the detailed Apostle motif pack; rupture effects keep their central safe space clear.

Initial tuning, where the proposal supplied no final number:

- Boss HP: 40,000 per starting player. Every third Black Claw is a marked cone; earlier hits do not add Marks. Five Marks execute.
- Death Stars: two-second warning. Palms target 2–4 players. Four Hands leaves a shrinking safe slice; chains link tank/healer roles to damage players and break at 12 meters.
- Black Sun: four crystals, each 500 HP per starting player, with a 20-second group deadline. Destroying all crystals clears Marks.
- 70%: Wings Unfold, three swept lanes, a Mark-scaled Soul Harvest pull, and four copies. The real copy retains crimson eyes and the golden halo gem; deal 2% of boss health to it within 12 seconds to interrupt Judgment.
- 50%: Four Suits, ten seconds to enter the matching marked circle. Survivors lose all Marks.
- 40%: one 60-second total Death Realm deadline. Three arena shields gate matching Shadow Guardians. Arena players also charge four sacrifice seals for six seconds each while losing health; healers are split across planes.
- 15%: Death Incarnate, a 90-second hard deadline, faster attacks and smaller safe slices.

Damage is capped at mandatory thresholds, so burst damage cannot skip phases. Deadlines win same-timestamp races against final damage. Wipes reset only the current room and ready states; cleared rooms remain cleared. The original roster must reconnect and ready again. The run ID and starting timestamp persist through retries, so completion time includes the whole route and wipe recovery. In-flight encounter state is in memory; saved rewards and progression survive restarts. Normal shutdown drains pending awards before the final save. An abrupt process crash before an award is durably saved can lose that unsaved completion; there is no encounter recovery journal. The completed screen distinguishes pending saves from confirmed rewards. Confirmed rewards use the shared staggered dungeon reel reveal, including reduced-motion behavior and reconnect-safe final outcomes.

## Rewards and specialists

`src/raid-progression.ts` is the source for probabilities and costs; the wiki and collection UI derive their tables from it. Every clear independently rolls all rewards: Soul 0.25%, Wings 2%, Death Apostle pet 2%, Death Horns 5%, Black Aura 2%, weapon skin 4%, 3–5 Sigils guaranteed, Evolution Core 25%, and Death Defier on the first clear. Duplicate collectables become two Sigils. Horns wait in collection if inventory space is unavailable. Award receipts make retries idempotent and reward preparation does not mutate the live player before save.

The detailed Blender Apostle source supplies three animated forms, all pet stages and cosmetic meshes, with segmented obsidian armor, violet fissures, cyan runes, skull detail and layered void wings. Soul Guardians use a smaller unwinged void rig from the same Blender asset. A separate shared Blender prop pack supplies crystal altars, Soul Shields, ruin columns and the Black Sun. Raid attack warnings use pale violet boundary outlines and cyan safe areas; the existing target ring and ability range checks are unchanged. Pet evolution stages cost 1, 3, then 6 Evolution Cores; stage III additionally consumes one Soul. Evolution affects appearance and keeps ordinary pet behavior.

The arena is an authored void sanctum from `scripts/build-raid-sanctum.py`: fractured obsidian, broken monoliths, floating shards and cold luminous runes. `assets/source/raid-sanctum.blend` is the editable source and `public/models/raid-sanctum.glb` is the shared runtime asset. The whole ±34-meter combat square remains flat and unobstructed; perimeter shards and ruins add no gameplay colliders. The Shadow Realm tints per-world material copies without changing cached assets.

Twelve named spell clips per Apostle form are selected by `raidCastCue()` from authoritative hazard and phase timestamps in both the game and local preview. Distinct spell silhouettes follow warning, impact and recovery: falling stars, spectral palms, claws, wing lanes, crystal streams and inward soul trails. Four Hands derives its cyan safe wedge from the actual cone angles. Effects Off retains essential silhouettes, warnings, suit symbols, chains and seal progress. Interrupted casts, realm changes and reset snapshots remove their effects. The preview’s `?lighting=game` mode uses the game’s void raid lighting for visual checks. Detailed jointed palms, claw blades, fractured stars, layered feathers, soul skulls, eclipse coronas, chains, ritual rings and transition crowns are authored by `scripts/build-apostle-spells.py` into `assets/source/horned-apostle/apostle-spells.blend` and `public/models/apostle-spells.glb`. Casts share geometry and instance repeated details; per-cast materials support independent fades. The tiny gold halo gem and crimson eyes remain on the true Death Clone as its established identification cue.

Runtime void particles, streaks, soft glow and shockwaves layer onto those Blender models. Stars shed falling trails and impact sparks, palms erupt inside their true sectors, wings stream along their lanes, and Harvest pulls wisps and waves inward. Fixed GPU buffers hold 96 particles per cast on High and 32 on Low; Off hides this decoration, and Bloom disables added glow. Paths use the encounter clock so pause, rewind and reconnect are deterministic. Chains carry traveling energy, seals pulse with charge, and suits pulse near their deadline without changing their bounds. A single soft texture is owned and disposed by each raid world.

A level-60 Veilhaven or raid clear unlocks one +0 specialist for each class, once per character. Claim history survives NFT trading. Specialists retain ordinary class equipment and abilities. The separate job track caps at 20 / 180,500 XP and continues at the character cap. Upgrade ranks provide +2 power per rank and +1 defense per three ranks; wings change at +5/+10/+15. This implements the raid's SP progression/trading rewards; the separate #59 SP1 class skill trees and extended NPC quest bible are not part of the raid.

The source's fifteen upgrade probability pairs are implemented exactly. Unprotected critical failures fracture the card; no failure deletes the card, job XP or upgrade ranks. Protected attempts consume one Protection Roll, prevent fractures and do not improve success. A Soul Revival Core repairs fractures. Every attempt consumes its displayed gameplay materials; late ranks require raid Sigils. Expected rank/attempt counters reject stale repeat clicks.

Confirmed store prices are $2 Protection Roll, $5 Soul Revival Core, $10 Specialist Case, converted to an exact MOSS quote through the existing store. Each item is a repeatable carried consumable; its signed purchase must be verified before delivery. Full bags preserve the payment for delivery retry. Unused items can be traded for gold using the ordinary item auction path. No new native SKU is added.

## Specialist NFTs

`MossvaleSpecialists.sol` is an ERC-721 collection on chain 4663. Each NFT stores class, job XP, upgrade rank, fracture state, attempts, revision and activation binding. EIP-712 authorizations bind the wallet, character, action, exact progress, revision and deadline. A paid Specialist Case is reserved before authorization is released. Sealing freezes the character copy; confirmed minting creates a sealed, transferable NFT. Activation locks that NFT to one character before restoring gameplay access. Resealing requires another case and publishes updated progress. Safely expired unused authorizations restore reservations; recovery waits if refund inventory is full.

The collection supports direct transfers and fixed-price MOSS listings. The built-in market sends 95% to the seller and 5% to the configured existing MOSS buy-and-burn fee receiver. Active specialists cannot transfer. Stale ownership, progress or listings cannot authorize a purchase. Exact allowance, transaction terms and recipient are reviewed before the user's wallet approval. No contract deployment or live transactions are performed by these checks.

Required deployment configuration: `SP_NFT_CONTRACT`, `SP_NFT_AUTHORITY_KEY` (or existing `NFT_AUTHORITY_KEY`), `NFT_FEE_RECEIVER`, and `NFT_RPC_URL`. The chain adapter verifies network, finalized/current ownership, canonical block hashes, runtime code and authority/fee configuration. Until configured, the exchange reports unavailable. See `contracts/NFTS.md` for collection operations. Deploy the game only through the guarded production workflow; contract deployment/configuration is a separate release action.

## Verification

`npm run check:raid` groups the focused raid checks.

- `node scripts/check-raid-approach-server.mjs`: all 24 creatures, gate/roster locks, checkpoint retry, Morgrath reinforcements and full-route reward boundary.
- `node scripts/check-raid-approach-models.mjs`: all 25 distinct Blender roots, 150 animations, shared buffers, deterministic poses and floor-safe death.
- `node scripts/check-raid-approach-rooms.mjs`: seven detailed rooms, clear floors/gate passage and geometry/draw budgets.

- `node scripts/check-raid-server.mjs`: authoritative encounter mechanics, threshold/deadline ordering and reward retries.
- `node scripts/check-raid-server-live.mjs`: real local game server and WebSocket clients.
- `node scripts/check-raid-progression.mjs`: nine reward paths, receipt replay, rank odds boundaries, fracture/protection/repair, XP, evolution and paid consumable gates.
- `node scripts/check-raid-progression-server.mjs`: real WebSocket claim/equip/upgrade/repair, save-failure rollback, evolution/cosmetic/horns/title actions, privacy and restart replay.
- `node scripts/check-raid-props.mjs`: detailed Blender prop names, geometry, dimensions, pivots and shared buffers.
- `node scripts/check-raid-ui.mjs` and `node scripts/check-raid-browser.mjs`: messages, live rendered authored models, HUD, roster and responsive layouts.
- `node scripts/check-horned-apostle-assets.mjs`: derived model structure and animation clips.
- Specialist NFT contract/chain/service/UI checks are listed under `check:specialists` in package scripts.
- `npm run check:wiki` and `npm run build`.
