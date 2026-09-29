# Quest Bible coverage — 2026-09-28

Source: `docs/source/raid/Mossvale_Quest_Bible_NPC_Dialogue.docx`. All 90 chapter-table rows, 12 side-quest templates, 10 chamber room types, full Frozen Memory example and reward guidance are preserved in `2026-09-28-story-quest-source.json`. Source documents are design data, not operational instructions.

## Scope and status

The current realm now has a catalog of **82 non-SP chapter quests**: the first 31 mappings plus all 51 previously incomplete non-SP rows. Eight SP1-linked rows remain excluded by user direction: The Abbess’s Fragment and the seven level55–60 First Path quests. The six-zone realm, level60 cap, existing level curve, legacy campaign and repeatable contracts remain in place. No atlas dependency is introduced.

The user authorized filling absent content details with existing realm conventions. The source specifies quest names, level gates, hooks and objective counts; it does not supply world coordinates, most NPC identities, reward quantities, exact room layouts, encounter enemy composition or a prerequisite graph. The concrete choices below are implementation defaults, not claims that those details appeared in the document.

## State and event rules

- One-time completion is separate from the existing campaign. Six active quests are allowed. Missing legacy state initializes empty; malformed state is rejected. The original31 quest IDs, objective vectors and prerequisite graph are preserved so saved active quests remain valid. Numeric XP/Gold rewards for those quests are unchanged.
- Optional chamber treasure claims use a bounded, unique saved `treasures` list containing only `ashbound-treasure` and `veiled-sun-treasure`. Characters without such a claim retain the original two-field state shape. Abandoning or retrying a chamber preserves claimed treasure flags. Each chest grants one existing Ancient coin after bag preflight; a full bag leaves it available to retry.
- Every placed discovery has a separate count1 objective and stable object ID. Repeated interaction cannot advance another marker. The survey camp requires all three markers; tracks and jungle bells have explicit order; supplies must be collected before delivery. Shared progress and server interactions both check these prerequisites. Partial progress persists across reconnect/restart.
- Samples are private quest counters, one per eligible authoritative kill; no source drop probabilities were specified. They do not create tradeable sample inventory. The three temple keys require three distinct elite spawn IDs, so farming one keeper cannot supply all keys.
- Gathering uses actual yield. Copperstep Quarry and Blueglass Cave require the actual node siteId; the starter Fen Garden lesson is scoped to the safe southern Lanternreach herb region and Glacial Supper to one existing sheltered Opal Isles node; other appropriate-resource quests retain normal profession requirements. No client-supplied progress is accepted.
- Public objectives require the correct zone/region where specified and overworld scope. The Foundry ledger specifically uses an optional Emberfall Foundry cache, not generic dungeon completion. Chamber completion credits only after all mandatory room objectives complete.
- Most source hooks are single lines; those lines remain verbatim, with outer quotation marks removed. Progress acknowledgments are factual UI text. Memory Beneath Ice retains its chapter-table hook and the full authored Iona offer/return dialogue. The chapter-table quest identity stays Memory Beneath Ice; its instance is Frozen Memory. Three Frozen Seals remains the separate prerequisite quest.

## Concrete world and encounter mapping

`src/story-world-data.ts` contains54 distinct objects,40 additional public monster homes and2 scripted encounters, all using current realm geometry and existing models. All object positions are dry and approachable in the named region, and monster homes satisfy existing town-safe collision policy. These are new placements chosen for unspecified coordinates, not relocations of supplied numeric coordinates.

- New public populations:2 level8 Briar Boars in Bracken Crown;6 level6 Briar Sentinels in Silverreach;6 level19 Mire Leeches in Moonfen;3 Bone Rats and3 Crypt Bats at level20 on Shadewood/Hollow routes;5 level21 Corpse Scarabs in Moonfen;6 level27 Carrion Hounds in Shadewood;6 level46 Jade Sentinels in Canopy Reach;3 named level43 elite Stone Golem keykeepers in Glass Dunes.
- The Lost Scout: discover the scout in Stormcrag, then defend against exactly3 waves (2 Ice Wisps;2 Ice Wisps;1 Frost Yeti), level16. The source supplies3 waves but no composition. Failure can be retried; only completed defense grants progress.
- The Wounded Caravan: find survivors in Shadewood and escort through a collision-checked route around existing props, with2 level22 ambush waves (2 Bone Rats then2 Crypt Bats). Route and wave count are defaults because the source only says a hostile stretch. The NPC is escorted; the quest does not grant completion merely for starting the encounter.
- The Old Campfire (level4) and The Fen Garden (level5) adapt two unsafe source-location references. The original Last Campfire and Slimefen garden remain unchanged in level24–32 wilderness; their starter quest targets instead use the existing Willowbrook/Pinewake approach and southern Lanternreach herb path. Source quest names, objective counts, rewards and save vectors remain unchanged. The camp hook changes “beyond the fen” to “beyond the southern trail” so its directions match the playable location. See the placement audit below.
- Under the Canopy uses3 placed survey landmarks in Canopy Reach. Orchid Isles uses4 distinct ruin inscriptions. No landmarks are silently treated as generic kill objectives.

| Chamber | Level | Authored required content | Unlock |
|---|---:|---|---|
| Greenwood Root Chamber |7|5 rooms;2 root seals|Roots With Teeth, then The Sealed Root accepted|
| The Broken Watch |10|6 rooms;3 mechanisms;guardian|The Missing Surveyor, then The Broken Watch accepted|
| Ashbound Hall |14|7 rooms:clear,key,ambush,lever,defense,treasure,boss|Runes in the Ash, then Ashbound Hall accepted|
| Frozen Memory |18|8 rooms:runes,survival,frozen keys,mini-boss,final guardian|Three Frozen Seals, then Memory Beneath Ice accepted|
| The Hollow Door |24|8 rooms:darkness,ambushes,keys,protection|Shadewood Voices, then The Hollow Door accepted|
| Temple of the Veiled Sun |44|10 rooms:traps,keydoors,optional treasure,guardian|Temple Keys, then Temple of the Veiled Sun accepted|

Chamber room layouts and encounter content reuse the current dungeon pipeline and existing archetypes. Completion XP is paid once by the quest; new chambers do not introduce a repeatable completion/chest farming reward.

## NPC and reward defaults

- Undefined Quartermaster/Miner/Dock/Cook/Hunter/Fisher/Woodworker/Foundry-survivor giver roles map to the existing regional keeper:Rowan,Sable,Iona,Eris,Samira,Talan. Healer/Herbalist roles use the region’s Cleric trainer. A Better Bowstring uses Sylva Fletch, the existing Ranger trainer. The original Town Smith mapping remains Orin Brightsteel. Named Aurelia Dawn and Neri Bloomlight keep their existing trainer identities.
- XP follows current contracts:Greenwood60,Amberwild90,Frostmarch110,Hollow150; gathering75%; Sunveil/Mistwood level×80 or gathering level×60; delivery20. The six new chamber quests use level×100 once. Existing major-dungeon quests retain their current completionXP amount.
- Gold is granted only when named in the source:base kill level×6, other quests level×4, followed by the existing contract Gold multiplier. Gold/MOSS policy and merchant pricing are unchanged.
- Exact authored3 potions from Slime at the Gates remain3. Unspecified food/consumable/Ancient Coin quantities default1 existing item; food goes into carriedItems. Ordinary materials default1–3 of existing wood/herb/crystal/relic, explicitly enumerated in the catalog. No new currency or sell-value policy is introduced.
- Unspecified bonus profession XP defaults100 for the named profession, capped by the existing profession maximum. Normal gathering XP still applies. Blueglass Samples,Copper for the Cure,Saffron Bloom,Ancient Timber default6 gathered units where the source supplies no count. Oasis Contract’s authored8 recovered pieces require8 eligible kills; no extra unauthored kill quota is added.
- Greenwood’s first-clear equipment choice is one class-compatible Uncommon weapon or armor, explicitly chosen before claim. Broken Watch rolls one Rare class-compatible weapon/armor/charm/ring. Frozen Memory grants one Rare charm/ring. All use existing gear templates at or below the quest level, preserve+5 upgrade rules, and preflight bag capacity before any reward or completion mutation.
- Unspecified epic/rare material rewards use existing relic/crystal/Prismatic Pearl supplies; no new material economy is created. Class material in A Better Bowstring maps to3 wood and ordinary adventureXP; Base Job remains deferred by the level60/current-curve decision. Lore, map clues, chamber keys and title/reputation progress are represented by persistent named quest completions and their prerequisite unlocks; they do not award unnamed new titles or reputation currencies.
- Heatproofing grants one actual heatproof-tonic item implemented by the server, with a temporary fire-resistance effect. The tonic is not mislabeled ordinary healing.

## Complete chapter inventory

|Source|Level|Quest|Runtime mapping|
|---|---:|---|---|
|1.1|1|Welcome to Lanternreach|rowan; Speak with Rowan ×1; Visit the banker ×1; Visit the auctioneer ×1; Visit a class trainer ×1|
|1.2|2|Slime at the Gates|rowan; Defeat Woodland Slimes outside Lanternreach ×6|
|1.3|2|What the Slime Left Behind|rowan; Collect Slime Residue ×5|
|1.4|3|A Bitter Remedy|trainer-greenwood-cleric-trainer; Gather Wild Herbs ×6|
|1.5|3|Wolves on Pinewake|rowan; Defeat Bramble Wolves in Pinewake Hills ×8|
|1.6|4|Webbed Supplies|rowan; Defeat Grove Spiders ×6; Recover Supply Bundles ×4|
|1.7|4|The Old Campfire|rowan; Inspect the abandoned pack at the old Greenwood camp ×1|
|1.8|5|Crystals for the Road|city-weaponsmith; Mine Grove Crystals ×5|
|1.9|5|The Fen Garden|trainer-greenwood-cleric-trainer; Gather Wild Herbs beside Lanternreach’s southern garden path ×4|
|1.10|6|Briar in the Meadow|rowan; Defeat Briar Sentinels in Silverreach Meadow ×10|
|1.11|6|Roots With Teeth|rowan; Collect Thorned Root Fragments from Briar Sentinels ×6|
|1.12|7|The Sealed Root|rowan; Clear all 5 Greenwood Root Chamber rooms and activate 2 root seals ×1|
|1.13|8|Boars of Bracken Crown|rowan; Defeat Briar Boars in Bracken Crown ×10|
|1.14|8|A Better Bowstring|trainer-greenwood-ranger-trainer; Collect Tough Sinew from wolves and boars ×5|
|1.15|9|Whispers from the Isles|rowan; Inspect marked stone 1 ×1; Inspect marked stone 2 ×1; Inspect marked stone 3 ×1|
|1.16|10|The Rootvault Calls|rowan; Complete the Rootvault ×1|
|2.1|6|A Message for Sable|rowan → sable; Deliver Rowan’s sealed note to Sable in Amberwild ×1|
|2.2|7|Redleaf Patrol|sable; Defeat enemies in Redleaf Highlands ×10|
|2.3|7|Ash in the Bark|sable; Collect scorched bark or ember samples in Cindergrove ×6|
|2.4|8|Copperstep Tools|sable; Mine crystals at Copperstep Quarry ×6|
|2.5|8|The Missing Surveyor|sable; Inspect survey marker 1 ×1; Inspect survey marker 2 ×1; Inspect survey marker 3 ×1; Locate the surveyor’s abandoned camp ×1|
|2.6|9|Beetles in the Cinders|sable; Defeat Ember Beetles in Cindergrove ×12|
|2.7|9|Heatproofing|sable; Collect Ember Shell Fragments ×8|
|2.8|10|The Broken Watch|sable; Clear 6 rooms, repair 3 mechanisms and defeat the Watch guardian ×1|
|2.9|11|Sunscar Wreckage|sable; Recover cargo crate 1 ×1; Recover cargo crate 2 ×1; Recover cargo crate 3 ×1; Recover cargo crate 4 ×1; Recover cargo crate 5 ×1|
|2.10|11|Salt and Scales|sable; Collect meat and scales from Sunscar creatures ×6|
|2.11|12|Emberfall Trail|sable; Defeat local enemies in Emberfall Ridge ×8|
|2.12|13|Runes in the Ash|sable; Collect Burnt Rune Fragments around Emberfall Ridge ×5|
|2.13|14|Ashbound Hall|sable; Clear 7 rooms: key, ambush, lever, defense, treasure and guardian ×1|
|2.14|15|Cindercrypt|sable; Complete Cindercrypt ×1|
|3.1|12|Cold Welcome|iona; Speak with Iona ×1; Visit Frostmarch’s banker ×1; Visit Frostmarch’s auctioneer ×1; Visit a Frostmarch class trainer ×1|
|3.2|13|Wisps in the Snow|iona; Defeat Ice Wisps ×10|
|3.3|13|Frozen Cores|iona; Collect Wisp Cores ×6|
|3.4|14|Northglass Hunt|iona; Defeat Frost Yetis along Northglass routes ×8|
|3.5|14|Glacial Supper|iona; Catch fish at the sheltered eastern Opal Isles shore (Fishing 25) ×4|
|3.6|15|Blueglass Samples|iona; Mine samples at Blueglass Cave ×6|
|3.7|16|Tracks Across Stormcrag|iona; Follow track marker 1 ×1; Follow track marker 2 ×1; Follow track marker 3 ×1; Follow track marker 4 ×1; Follow track marker 5 ×1|
|3.8|16|The Lost Scout|iona; Find the lost scout ×1; Defend the scout through all 3 waves ×1|
|3.9|17|Three Frozen Seals|iona; Activate ancient Frozen Seal 1 ×1; Activate ancient Frozen Seal 2 ×1; Activate ancient Frozen Seal 3 ×1|
|3.10|18|Memory Beneath Ice|iona; Clear 8 rooms, reach the central archive and defeat the Memory Warden ×1|
|3.11|19|Rimefang's Shadow|iona; Participate in defeating the Rimefang Matriarch ×1|
|3.12|20|Frosthollow|iona; Complete Frosthollow ×1|
|4.1|18|Lanterns in the Marsh|eris; Light ward lantern 1 ×1; Light ward lantern 2 ×1; Light ward lantern 3 ×1; Light ward lantern 4 ×1|
|4.2|19|Leeches in the Moonfen|eris; Defeat Mire Leeches in Moonfen Marsh ×12|
|4.3|19|Blackwater Samples|eris; Collect Tainted Water Samples from Moonfen leeches ×6|
|4.4|20|Bones That Move|eris; Defeat Bone Rats and Crypt Bats on Hollow routes ×10|
|4.5|21|Scarabs Below|eris; Defeat Corpse Scarabs ×10; Collect Scarab Carapaces ×5|
|4.6|21|Moonpetal Remedy|trainer-hollow-cleric-trainer; Gather Moonpetal or local herbs ×6|
|4.7|22|The Wounded Caravan|eris; Find the wounded caravan survivors ×1; Escort the survivors through the hostile stretch ×1|
|4.8|23|Shadewood Voices|eris; Inspect whispering tree 1 ×1; Inspect whispering tree 2 ×1; Inspect whispering tree 3 ×1; Inspect whispering tree 4 ×1|
|4.9|24|The Hollow Door|eris; Clear 8 rooms, recover keys and protect the ward light ×1|
|4.10|25|Nightroot Citadel|eris; Complete Nightroot Citadel ×1|
|4.11|26|Copper for the Cure|eris; Mine Copper or Cobalt resources for the ward device ×6|
|4.12|27|Carrion Trail|eris; Defeat Carrion Hounds on Hollow routes ×12|
|4.13|28|Void at the Shore|eris; Defeat Void Stalkers in Umbral Shores ×10|
|4.14|29|Plague Signs|eris; Collect plague samples ×6; Inspect broken mechanism 1 ×1; Inspect broken mechanism 2 ×1; Inspect broken mechanism 3 ×1|
|4.15|30|The Plagueworks|eris; Complete the Plagueworks ×1|
|5.1|30|Water Before Glory|samira; Collect supplies in Sunveil Bazaar ×1; Deliver supplies to Dunewell Oasis ×1|
|5.2|31|Scorpions at Dunewell|samira; Defeat Dune Scorpions in Dunewell Oasis ×12|
|5.3|32|Venom for Medicine|trainer-sunveil-cleric-trainer; Collect Scorpion Venom Sacs ×6|
|5.4|33|Stone in the Sand|samira; Defeat Stone Golems ×8|
|5.5|34|The Buried Markers|samira; Find buried expedition marker 1 ×1; Find buried expedition marker 2 ×1; Find buried expedition marker 3 ×1; Find buried expedition marker 4 ×1; Find buried expedition marker 5 ×1|
|5.6|35|Oasis Contract|samira; Defeat regional enemies and recover stolen supply pieces ×8|
|5.7|36|Saffron Bloom|trainer-sunveil-cleric-trainer; Gather local herbs or Sunblossom ×6|
|5.8|37|Glass Underfoot|samira; Collect Glass Shards from enemies in Glass Dunes ×6|
|5.9|38|Badlands Signal|samira; Activate signal pylon 1 ×1; Activate signal pylon 2 ×1; Activate signal pylon 3 ×1|
|5.10|40|The Ashen Crown|samira; Participate in defeating the Ashen Crown Titan ×1|
|5.11|40|Emberfall Foundry|samira; Complete Emberfall Foundry and its required seals ×1|
|5.12|41|The Paymaster's Ledger|samira; Recover the ledger from an optional Foundry cache ×1|
|5.13|42|Cooling the Crown|samira; Collect foundry components or slag samples ×8|
|5.14|43|Temple Keys|samira; Recover Temple Key 1 from its elite keeper ×1; Recover Temple Key 2 from its elite keeper ×1; Recover Temple Key 3 from its elite keeper ×1|
|5.15|44|Temple of the Veiled Sun|samira; Clear the 10-room temple, unlock the key doors and defeat its guardian ×1|
|5.16|45|The Road Into Mist|samira → talan; Deliver the recovered temple record to Talan in Mistwood Haven ×1|
|6.1|45|Under the Canopy|talan; Survey Canopy Reach landmark 1 ×1; Survey Canopy Reach landmark 2 ×1; Survey Canopy Reach landmark 3 ×1|
|6.2|46|Jade Sentinels|talan; Defeat Jade Sentinels in Canopy Reach ×10|
|6.3|47|Broken Jade|talan; Collect Sentinel Fragments ×6|
|6.4|48|Rainforest Remedies|trainer-mistwood-cleric-trainer; Gather high-tier herbs in Mistwood ×6|
|6.5|49|The Bell That Rings Alone|talan; Ring jungle bell 1 ×1; Ring jungle bell 2 ×1; Ring jungle bell 3 ×1|
|6.6|50|Veilhaven Monastery|talan; Complete Veilhaven Monastery ×1|
|6.7|51|The Abbess's Fragment|Excluded SP1 by user direction|
|6.8|52|Mistwood Basin Hunt|talan; Defeat high-level enemies in Mistwood Basin ×12|
|6.9|53|Ancient Timber|talan; Gather Elderwood or local timber ×6|
|6.10|54|Orchid Isles|talan; Search island ruin and take inscription rubbing 1 ×1; Search island ruin and take inscription rubbing 2 ×1; Search island ruin and take inscription rubbing 3 ×1; Search island ruin and take inscription rubbing 4 ×1|
|6.11|55|A Path Within|Excluded SP1 by user direction|
|6.12|55|Fragments of the First Path|Excluded SP1 by user direction|
|6.13|56|Trial of Instinct|Excluded SP1 by user direction|
|6.14|57|Proof From the Depths|Excluded SP1 by user direction|
|6.15|58|Trial of Resolve|Excluded SP1 by user direction|
|6.16|59|The Final Calling|Excluded SP1 by user direction|
|6.17|60|Trial of the First Path|Excluded SP1 by user direction|

## Other source sections

The12 side/repeatable rows are design templates, not12 specified chapter quests. Existing repeatable contracts already cover local kill, gathering, crafting and dungeon objectives. The named chapter quests now implement the requested collection, shipment, escort, defense, ordered shrine, dungeon research and optional chamber mechanics. No claim is made that each of the12 templates has a separate new repeatable contract with invented targets/rewards. Exact source templates remain preserved.

The10 chamber room-type descriptions remain preserved as design guidance. Six named non-SP chapter chambers are implemented using their specific required content; SP1 trials remain excluded.

## Level / Job document coverage

Source: `docs/source/raid/Mossvale_Level_Job_XP_Long_Term_Design.docx` (138 paragraphs, six tables; no images/tracked changes). User chose the current level60 realm, superseding this older level99 proposal for this pass. The document’s character recurrence and K brackets, monster XP penalty, dungeon XP ranges and Base Job are therefore recorded, not silently enabled.

- Proposed level99 target350–500 active hours; bracket times1–20:5–8h,21–40:20–30h,41–60:55–75h,61–80:100–130h,81–90:80–100h,91–98:70–100h,98→99:20–30h. Real XP/hour tuning is required and was not measured by the source.
- Recurrence: previous next-level requirement + new level² × K. K=40 at2–20;120 at21–40;380 at41–60;1400 at61–80;5000 at81–85;9000 at86–90;13000 at91–98;17000 at98→99. Initial requirement/seed is absent.
- Proposed penalty when player exceeds monster level:0–5→100%,6→90%,7→70%,8→50%,9→30%,10–19→10%,20+→0%. No penalty change is introduced during the cap60 decision.
- Dungeon bosses propose5–10 normal-mob XP and completion10–15% of run mob XP, with no stacking repeat bonus. No exact values or run-accounting rules are supplied.
- Base Job proposes20–25% eligible monster XP, cap50, Job20 in20–30h and Job50 in150–200h; it supplies no XP curve, exact award factor or migration. No Base Job state is invented.
- SP Job/upgrades and SP1 unlock guidance are excluded. Future events/catch-up and large one-time quest rewards are guidance, not exact specifications.


## Verification

- `node scripts/check-story-quests.mjs` passes:82quests/8exclusions, source levels/counts and hooks with the documented Campfire location adaptation, real NPC/creature/site/marker targets, ordered unique objectives, three distinct elite keys, all3 scout waves, dry/swept escort route, capacity/claim replay and malformed-save checks.
- `node scripts/check-story-quest-rewards.mjs` passes:all4 classes’ explicit weapon/armor choices, Rare accessories, class/level bounds, unchanged owner on preflight, full bags, resource overflow, duplicate-RNG/bank identity protection, real food items and profession cap.
- `node scripts/check-story-encounters.mjs` passes the actual runtime: defense/escort success, exactly three scout waves, movement before a second escort ambush, following distance, engaged attackers, NPC/player death, disconnect/reconnect ownership, travel, abandonment, deadline, forged/repeated starts and partial spawn failure cleanup.
- `node scripts/check-story-world.mjs` passes the actual renderer with the authored GLB prop kit: walking direction across snapshots, completed/distant/instanced target visibility, finite avatar transforms, shared asset preservation and release of owned geometry/materials and avatar instance buffers.
- `node scripts/check-story-tracking.mjs` passes the actual main callback with real realm catalogs: region and exact resource site, wildcard hunts, distinct elite keeper IDs, alive and unavailable target fallbacks, ordered bells, the optional Foundry cache, moving rescue snapshots and local banker/auctioneer/class trainer roles.
- Current expanded server/UI, chamber, aggregate and built-game evidence is recorded in [the integration report](2026-09-28-benji-integration.md); the coordinator records the final placement run there.

All changes remain local in the Benji updates worktree until the coordinating task reports a later release state.

## Final placement safety audit

All54 placed objects and40 new enemy homes were checked against the actual relocated `OVERWORLD_SPAWNS`, their hashed `monsterSpawnLevel`, region level ranges, the new authored enemy levels, and the existing world collision/terrain. A target must have dry, climbable, swept 2m approaches from all four cardinal directions and no world boss or creature more than2 levels above its quest inside `max(28m, aggro range + 7m roaming patrol + 10m approach margin)`. The old camp also has a clear6m footprint for its decorative campfire. Thirteen persisted approach routes from the existing Willowbrook, Whisperwell, Copperleaf and Sunhaven refuges pass the same threat, collision, dry-ground and climbability checks. Two diagonal terrain corners on the Survey3 proof route are traversed with ordinary cardinal steps; terrain is unchanged.

Only these existing quest placements moved:

| Target | Previous x,z | Final x,z | Reason |
|---|---|---|---|
| Old Campfire pack, level4 | -1007,182 | -50,120 | Original Slimefen24–32 location had a level25 roaming wolf14m away; move the quest pack to the low-level Greenwood camp beside Willowbrook. Original western curio remains intact. |
| Signal pylon1, level38 | -1340,-754 | -1340,-752 | Clear a nearby level41 patrol envelope. |
| Canopy landmark3, level45 | 512,902 | 512,906 | Clear a nearby level48 patrol envelope. |
| Jade Sentinel1, level46 | 590,806 | 608,802 | Clear a nearby level49 patrol envelope. |
| Jade Sentinel3, level46 | 590,826 | 591,832 | Clear a nearby level49 patrol envelope. |
| Jade Sentinel5, level46 | 626,818 | 626,820 | Clear a nearby level49 patrol envelope. |

Scoped targets and remaining source/current-realm differences:

- **The Fen Garden, level5:** four Wild Herbs at existing `herb-greenwood-1` beside the southern city garden path, enforced by the actual `greenwood` region. Slimefen nodes cannot grant this lesson or be selected by tracking. The distant named garden remains unchanged.
- **Boars of Bracken Crown, level8:** the sole eligible old regional boar was level12. Two existing-model Briar Boar homes at(-536,21) and(-540,14), both level8, now supply the same10-kill objective through exact `story-bracken-boar-1/2` IDs. Ordinary monsters and their levels are unchanged.
- **Glacial Supper, level14:** the current realm has only Glacial Char shoals in Frostmarch. The quest uses existing sheltered `fishing-frostmarch-11` at(-124,-692), with no stronger-than-level16 patrol in its approach envelope; dangerous Winterspire and other shoals cannot grant credit or redirect tracking. Opal Isles’ region label remains16–22. Fishing level25 is an independent existing profession requirement, explicitly disclosed in the objective and NPC dialogue. No new fish, water or profession mechanics were added.
- **Whispers from the Isles** is source level9 (not5); its region starts at10. **Sunscar Wreckage** is source level11 (not12). Their named-region targets remain unchanged after safe approach checks. **Orchid Isles** is source level54 in a region starting55, retained with checked local patrol clearance.
- **Glass Underfoot**, source level37 in Glass Dunes40–45, retains the source’s named region and existing targets. This is a documented source progression mismatch outside the newly placed low-level targets; no existing monster level or map was altered to hide it.

`node scripts/check-story-placement-safety.mjs` checks every placement, the former unsafe camp failure case, garden and fishing credit restrictions, both level8 boar homes, and the13 approach routes. `check-story-tracking.mjs` checks that dangerous nearby Slimefen/Winterspire nodes cannot redirect the corresponding starter tasks. The aggregate runs this safety check alongside current quest, server and UI checks.
