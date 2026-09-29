# Mossvale UI artwork

Generated with the built-in image generation tool. Original PNG alpha is preserved. Runtime assets live in `public/ui/`; the icon sheet is rendered directly as a CSS atlas and the frames use nine-slice borders.

## wordmark

Use case: logo-brand. Create a finished transparent PNG game logo asset for a cozy voxel fantasy MMORPG called MOSSVALE. Exact text: MOSSVALE, spelled M O S S V A L E, single line. Handcrafted chunky carved ivory stone letters, warm golden bevels, dark oak dimensional edges, tiny emerald moss tufts and two delicate fern fronds around the first and last letters, a small voxel sun crystal tucked near the M. The lettering is wide and easy to read at 220 pixels wide. Premium indie game title artwork, charming Cube World-inspired voxel craft, painted game UI illustration, not generic typography. Wide 3:1 composition, logo centered with modest 5 percent clear padding, actual fully transparent background. No subtitle, no extra text, no scene, no rectangle, no white or checkered backdrop.

## icons

Use case: stylized-concept. Production game UI ITEM ATLAS for Mossvale, a charming Cube World-inspired voxel fantasy RPG. Exactly 8 separate illustrated voxel items arranged in an exact uniform grid of 4 columns and 2 rows, landscape 2:1 canvas. Each cell is square, each single item centered at the exact center of its cell and uses about 66 percent of its cell with generous transparent padding; nothing crosses cells. Row 1 left to right: 1 steel sword with brown grip and golden crossguard, 2 curved oak bow with green wrapping, 3 oak magic staff crowned by luminous turquoise crystal, 4 cluster of turquoise blue sun crystals. Row 2 left to right: 5 round ruby-red healing potion with cork and gold neck ring, 6 warm brown leather adventurer backpack with rolled cream blanket, 7 closed green leather quest journal with a golden leaf emblem, 8 antique brass compass with ivory face and red needle. Chunky stepped voxel silhouettes, warm painterly material detailing, crisp defined edges, consistent three-quarter view, gentle lighting from upper left, tiny ambient contact shading ONLY on the objects. Beautiful tactile hand-painted game icons, strong silhouettes readable at 36px. Actual transparent alpha background throughout. No text, no labels, no grids, no frames, no checkerboard, no decorations between items, only these 8 icons.

## frame

Use case: stylized-concept. Create a production 9-slice GUI panel texture for Mossvale, a cozy voxel fantasy RPG inspired by Cube World. Square 1024x1024 front-facing orthographic game UI artwork. A restrained carved dark walnut wood frame with chunky squared corners, subtle pale brass inlay along its inner edge, tiny emerald moss tufts and a couple of small fern leaves at the extreme outer corners. Frame border occupies exactly the outer 100 pixels on all four sides and stays straight, so it can be sliced into 9 pieces and stretched. Entire central square from x=110 to914 and y=110 to914 is flat, very dark desaturated forest-green leather with fine subtle material grain and no decoration. No writing or icons anywhere. Professional hand-painted game UI, tactile dimensional edges and warm soft highlights, clean readable silhouette; modest detail that stays readable scaled down. Thin transparent outer margin 8 pixels, actual alpha outside the panel only. The central leather is solid dark green suitable for cream text. No photographic table, no perspective tilt, no background scenery, no extra panels.

## parchment

Use case: stylized-concept. Production 9-slice UI parchment panel for Mossvale, a cozy voxel fantasy RPG. Square 1024x1024 front-facing orthographic texture. Warm pale cream parchment center with very subtle fibers and age marks only near edges. Border is a slender stepped carved oak rim with small brass pins at corners and restrained tiny olive-green fern details at the four corners. Outer border occupies the outer 90 pixels on all sides, straight and consistent for 9-slice scaling. Center from110 to914 is very light even parchment, uncluttered and plain, for readable dark-green HTML interface text. Charming handcrafted premium indie game interface artwork, Cube World voxel craft inspiration, painted material detail, crisp square corners. Actual transparent alpha outside the frame only with8px margin. No text, no symbols in center, no objects, no scenery, no tilted perspective, no photo.

## Player and target frames

Original Blender-authored oak, moss, brass and forest-leather artwork, rendered from geometry with transparent film. Source: `assets/source/unit-frames.blend`; visual preview: `assets/source/unit-frames-preview.png`. Rebuild with Blender's `--background --python scripts/build-unit-frame-assets.py`.

`public/ui/unit-portrait-ring.png` is 256×256 with a centered transparent opening; keep portraits within its 170px safe diameter. `public/ui/unit-panel.png` is 768×240 with text inside x44–724, y42–198. Names, levels, health and casts remain accessible HTML. Portraits render the existing game character/NPC/monster models through one shared 144px Three.js surface, capped at 15 FPS.

## Auction house

The auction crest and Shopping, Selling and My auctions icons are modeled and rendered in Blender with transparent film. They use Mossvale's oak, brass and moss palette; labels and prices remain accessible HTML. Runtime images are `public/ui/auction/{crest,shopping,selling,auctions}.png` (384px crest, 96px tabs). Edit `assets/source/auction-ui.blend` or rebuild with Blender `--background --python scripts/build-auction-ui-assets.py`. The build validates transparent margins and unclipped silhouettes; `scripts/check-auction-art.mjs` checks the shipped PNGs and source.

## Merchant wallet

`public/ui/merchant-emblem.png` is an original 256×256 transparent Blender render of a leather purse, moss-green leaf badge and brass coins, displayed at 30px beside the vendor wallet. Editable geometry is retained in `assets/source/merchant-emblem.blend`; rebuild with Blender `--background --python scripts/build-merchant-emblem.py`. The builder checks alpha, clear margins and image dimensions. Vendor frames reuse the existing oak, parchment and NPC portrait artwork; names, prices and controls remain HTML.


## Cleric

Nine transparent 128px class and spell-family icons live in `public/ui/cleric/`, with six matching equipment thumbnails in `public/ui/gear/cleric-*.png`. The sun mace, sacred tome, radiance and wards use ivory, teal and brass. All are original Blender renders; the editable kit and icon scenes are retained in `assets/source/cleric-kit.blend` and rebuilt by `scripts/build-cleric-assets.py`. The class and talent UI retains these family illustrations; individual spells use the complete atlases below.

## Complete spell artwork

The September 25 class redesign adds thirteen original Blender-rendered icons in `public/ui/spells-redesign.png`: a 1024×1024 RGBA atlas with four columns, four rows, thirteen occupied 256px cells and three transparent cells. Individual 256px icons live in `public/ui/spell-redesign/`; the 512px Cycles source renders and editable, keyframed sculpture library live in `assets/source/spell-redesign/`. These replace the preliminary `spells-redesign.svg` render; that SVG is retained only as the earlier source.

Slot order is Roll, Blink, Lighspeed, Poison Cloud, Edict of the Dawn, Titan's Edict, Eternal Edict, Edict of Light, Bouncing Edicts, Edict of Protection, Blanket Edicts, Edict of Harm, Renewable Edict. Sculptures use carved ivory, jade enamel, leather, bronze, faceted crystals and separate feathers or spell fragments. The six passive Edicts receive runtime artwork overrides while their supplied design export remains unchanged.

Rebuild with `/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-spell-redesign.py -- --render`. Blender authors and renders the geometry, downsamples the individual images, and packs the atlas. The builder uses the established glTF Transform CLI for deduplication, pruning and quantization of normals/colors. `-- --pack` repacks the retained source renders without rebuilding geometry. Validate with `node scripts/check-icons.mjs --redesign-only`, `node scripts/check-class-redesign-client.mjs` and `node scripts/check-spell-effect-details.mjs`.

`public/models/spell-redesign.glb` contains seven spell roots and 33 independently animated parts (26,952 triangles; approximately 1.19 MB). The runtime uses shared instanced geometry and authoritative combat phase timing; the `.blend` retains a 60-frame motion study for each active design. Low effects omit secondary particles, Off retains essential cues, and no additional per-cast animation mixer or textures are required.

The original 124 spells have distinct illustrations, generated with the built-in image generation tool (gpt-image-2) on 2026-09-12. Each class uses one direct CSS atlas with four columns and eight rows: 31 populated cells in the order below, then one transparent cell. Runtime assets are `public/ui/spells-{ranger,knight,mage,cleric}.png`. Original generated PNGs, including their alpha and provenance metadata, are retained unchanged as `assets/source/spells-*-generated.png`. Native canvas size is 887×1774, with a 1:2 aspect ratio and equal square cells. No labels or controls are baked into the artwork.

The `spell-${id}` icon namespace protects existing navigation and talent icons, particularly the generic `arrow`. Authored slot mappings are explicit in `src/icons.ts`; changing a spell level cannot move its illustration. `scripts/check-icons.mjs` validates catalog coverage, unique slots, PNG alpha, populated cells, CSS coordinates, and actual spellbook/hotbar markup.

### Ranger atlas

Source: `assets/source/spells-ranger-generated.png`; runtime: `public/ui/spells-ranger.png`.

| Row | Column 1 | Column 2 | Column 3 | Column 4 |
| --- | --- | --- | --- | --- |
| 1 | arrow | hamstring-shot | power-shot | trail-mending |
| 2 | poison-shot | concussive-shot | multishot | barkskin |
| 3 | volley | frost-arrow | ricochet-shot | hunters-reprieve |
| 4 | piercing-shot | thornburst | serpent-fan | rapid-fire |
| 5 | explosive-arrow | silken-guard | tranquilizing-shot | wild-renewal |
| 6 | razor-flurry | viper-strike | forest-ward | hail-of-arrows |
| 7 | binding-arrow | eagles-eye | frostfall-volley | survival-instinct |
| 8 | starfall-arrow | relentless-volley | heart-of-the-wild | Transparent |

Exact generation prompt:

```text
Use case: stylized-concept. Production spell icon ATLAS for Mossvale, an original charming voxel fantasy MMORPG. A single transparent PNG spritesheet exactly 1024 pixels wide by 2048 pixels tall (aspect 1:2). EXACTLY FOUR COLUMNS AND EIGHT ROWS of equal 256-by-256 square cells. 31 individual icons and one deliberately empty bottom-right cell. This is a CSS sprite atlas: item centers MUST fall on exact centers of the uniform 4x8 grid, not a contact sheet with uneven spacing. Every isolated illustration fits within the central 72 percent of its own cell, with fully transparent empty padding. Each spell has ONE distinct readable illustrated symbol, not a framed scene. No cell can contain two alternative icons. Consistent chunky stepped voxel silhouettes, hand-painted tactile oak/leather/metal/crystal surfaces, crisp faceted edges, gentle upper-left lighting, high contrast and simple bold compositions readable at 36 pixels. Rich premium fantasy game inventory art. Actual transparent alpha background; no background color, no checkerboard, no gridlines, no frames, no writing, no letters, no numbers, no captions. Local magic spark trails may surround their own object but must stay within its cell. Do not render any of the descriptive labels below. Follow the exact row order.
CLASS RANGER: forest green, oak brown, silver arrowheads, ivory feathers, with accents appropriate to frost, venom and fire. Distinguish similar arrow spells by silhouette and effect, never mere recoloring.
Row 1 left to right: Quick Shot — single oak arrow flying diagonally with green fletching; Hamstring Shot — low hooked arrow caught in a loop of slowing vine; Power Shot — heavy broadhead arrow bursting through a bright gold impact ring; Trail Mending — ivory bandage wrap tied around a sprig of healing herbs.
Row 2: Venom Arrow — green dripping poisonous arrowhead; Concussive Shot — blunt arrowhead hitting a silver shield with a sharp stun star; Multishot — three arrows fanning upward; Barkskin — curved protective bark armor around a glowing green core.
Row 3: Volley — five arrows falling vertically in a tight shower; Frost Arrow — single long cyan icicle arrow with snow crystals; Ricochet Shot — an arrow following a sharp zigzag bouncing path; Hunter's Reprieve — restorative green hand cradling a small heart and leaf.
Row 4: Piercing Shot — needle-thin silver arrow punching through layered armor plates; Thornburst — radial explosive wheel of sharp woody thorns; Serpent Fan — three snake-shaped green venom arrows fanning apart; Rapid Fire — a bow launching a horizontal sequence of six arrows.
Row 5: Explosive Arrow — broadhead arrow with fiery orange exploding tip; Silken Guard — luminous ivory silk cocoon shield with green threads; Tranquilizing Shot — small silver sleep dart tipped with purple flower and floating crescent; Wild Renewal — three fresh leaves spiraling around a green healing droplet.
Row 6: Razor Flurry — seven short razor-edged arrows in a broad close fan; Viper Strike — fanged emerald snake coiled around one toxic arrow; Forest Ward — sturdy oak shield embossed with a radiant tree; Hail of Arrows — three layered descending volleys inside a swirling cloud.
Row 7: Binding Arrow — arrow pinning crossed golden binding ropes; Eagle's Eye — eagle head and piercing amber eye aligned along a distant arrow; Frostfall Volley — icy arrows raining from a jagged pale blue cloud; Survival Instinct — snarling wolf face sheltered within a green protective ward.
Row 8: Starfall Arrow — oversized silver arrow wrapped in a falling violet-gold star; Relentless Volley — three horizontal lanes of fast repeating arrows leaving green speed streaks; Heart of the Wild — radiant emerald heart grown from leaves surrounded by three healing wisps; FINAL CELL COMPLETELY EMPTY TRANSPARENT.
```

### Knight atlas

Source: `assets/source/spells-knight-generated.png`; runtime: `public/ui/spells-knight.png`.

| Row | Column 1 | Column 2 | Column 3 | Column 4 |
| --- | --- | --- | --- | --- |
| 1 | strike | crippling-strike | cleave | second-wind |
| 2 | shield-bash | iron-guard | whirlwind | heavy-slash |
| 3 | shockwave | shield-toss | rallying-cry | concussive-blow |
| 4 | steel-bulwark | groundbreaker | crushing-sweep | bladestorm |
| 5 | quick-recovery | shattering-throw | earthshaker | guardian-oath |
| 6 | relentless-strike | defiant-stand | chainbreaker | fortress |
| 7 | thunderclap | colossus-strike | stalwart-company | siegebreaker |
| 8 | unyielding-blows | battle-renewal | last-bastion | Transparent |

Exact generation prompt:

```text
Use case: stylized-concept. Production spell icon ATLAS for Mossvale, an original charming voxel fantasy MMORPG. A single transparent PNG spritesheet exactly 1024 pixels wide by 2048 pixels tall (aspect 1:2). EXACTLY FOUR COLUMNS AND EIGHT ROWS of equal 256-by-256 square cells. 31 individual icons and one deliberately empty bottom-right cell. This is a CSS sprite atlas: item centers MUST fall on exact centers of the uniform 4x8 grid, not a contact sheet with uneven spacing. Every isolated illustration fits within the central 72 percent of its own cell, with fully transparent empty padding. Each spell has ONE distinct readable illustrated symbol, not a framed scene. No cell can contain two alternative icons. Consistent chunky stepped voxel silhouettes, hand-painted tactile oak/leather/metal/crystal surfaces, crisp faceted edges, gentle upper-left lighting, high contrast and simple bold compositions readable at 36 pixels. Rich premium fantasy game inventory art. Actual transparent alpha background; no background color, no checkerboard, no gridlines, no frames, no writing, no letters, no numbers, no captions. Local magic spark trails may surround their own object but must stay within its cell. Do not render any of the descriptive labels below. Follow the exact row order.
CLASS KNIGHT: brushed silver steel, warm brass, oak, russet and teal cloth; impact sparks golden, defensive auras pale blue, healing auras restrained green. Every illustration needs a distinct silhouette.
Row 1 left to right: Sword Strike — single steel sword with sharp golden slash; Crippling Strike — low slashing sword hooking a red ribbon around a greave; Cleave — broad blade sweeping across three silver sparks; Second Wind — ivory-green healing breath spiraling around a knight helmet.
Row 2: Shield Bash — steel shield colliding with bright brass impact star; Iron Guard — compact riveted iron shield crossed by a sword; Whirlwind — a sword tracing a full circular gold whirlwind; Heavy Slash — massive downward broad blade with a weighty red-orange crescent.
Row 3: Shockwave — hammer hitting earth with two expanding golden rings; Shield Toss — tilted airborne round shield leaving curved flight streak; Rallying Cry — brass battle horn with green healing rays; Concussive Blow — steel gauntlet gripping a hilt striking a white stun star.
Row 4: Steel Bulwark — tall layered steel tower shield with blue defensive glow; Groundbreaker — sword sunk into cracked brown earth with jagged amber fissures; Crushing Sweep — heavy sword sweeping through four angular stone chips; Bladestorm — six spinning blades forming a metallic cyclone.
Row 5: Quick Recovery — mailed hand catching a small green healing spark; Shattering Throw — heavy thrown silver sword splitting a stone fragment; Earthshaker — large warhammer over erupting blocks and a stun ring; Guardian's Oath — gauntlet held over a small ally shield, protective blue ribbons.
Row 6: Relentless Strike — sword driving forward through a red impact streak; Defiant Stand — upright helmet and planted sword inside three green healing arcs; Chainbreaker — cleaving blade breaking a thick steel chain; Fortress — compact stone bastion enveloped in a bright blue protective dome.
Row 7: Thunderclap — two armored gauntlets meeting with a radial blue lightning blast; Colossus Strike — enormous golden-edged greatsword above crushed masonry; Stalwart Company — three overlapping small shields joined by a blue protective arc; Siegebreaker — hurled spiked steel weight smashing a wall fragment with orange splash sparks.
Row 8: Unyielding Blows — two crossed swords with six sequential sharp impact sparks; Battle Renewal — worn knight helm cradled by powerful green healing flame; Last Bastion — crowned shield sheltering three glowing companion lights; FINAL CELL COMPLETELY EMPTY TRANSPARENT.
```

### Mage atlas

Source: `assets/source/spells-mage-generated.png`; runtime: `public/ui/spells-mage.png`.

| Row | Column 1 | Column 2 | Column 3 | Column 4 |
| --- | --- | --- | --- | --- |
| 1 | fireball | arcane-missile | frostbolt | flame-barrier |
| 2 | nova | ice-lance | arcane-burst | cinderbolt |
| 3 | meteor | arcane-restoration | frozen-orb | spellward |
| 4 | pyroblast | arcane-barrage | deep-freeze | arcane-beam |
| 5 | ice-barrier | flamewave | blizzard | ley-renewal |
| 6 | glacial-spike | comet-shower | prismatic-guard | chain-lightning |
| 7 | flash-freeze | inferno-beam | blinkward | starfire |
| 8 | winterstorm | arcane-tempest | aegis-of-the-archmage | Transparent |

Exact generation prompt:

```text
Use case: stylized-concept. Production spell icon ATLAS for Mossvale, an original charming voxel fantasy MMORPG. A single transparent PNG spritesheet exactly 1024 pixels wide by 2048 pixels tall (aspect 1:2). EXACTLY FOUR COLUMNS AND EIGHT ROWS of equal 256-by-256 square cells. 31 individual icons and one deliberately empty bottom-right cell. This is a CSS sprite atlas: item centers MUST fall on exact centers of the uniform 4x8 grid, not a contact sheet with uneven spacing. Every isolated illustration fits within the central 72 percent of its own cell, with fully transparent empty padding. Each spell has ONE distinct readable illustrated symbol, not a framed scene. No cell can contain two alternative icons. Consistent chunky stepped voxel silhouettes, hand-painted tactile oak/leather/metal/crystal surfaces, crisp faceted edges, gentle upper-left lighting, high contrast and simple bold compositions readable at 36 pixels. Rich premium fantasy game inventory art. Actual transparent alpha background; no background color, no checkerboard, no gridlines, no frames, no writing, no letters, no numbers, no captions. Local magic spark trails may surround their own object but must stay within its cell. Do not render any of the descriptive labels below. Follow the exact row order.
CLASS MAGE: faceted cyan ice, violet arcane crystal, blazing orange fire, brass staff details. Distinct spell silhouettes, not repeated recolors. Original Mossvale hand-painted chunky voxel style.
Row 1 left to right: Fireball — compact orange fireball with trailing flame; Arcane Missile — narrow lilac dart with small purple spark trail; Frostbolt — angular blue ice projectile with short frost wake; Flame Barrier — upright shield made of curling orange flames.
Row 2: Frost Nova — broad expanding circular ring of jagged ice; Ice Lance — long thin cyan ice javelin; Arcane Burst — star-shaped explosive violet magic pulse; Cinderbolt — dense red ember coal with short golden sparks.
Row 3: Meteor — heavy burning stone descending diagonally; Arcane Restoration — violet healing hand cradling a luminous white heart; Frozen Orb — round icy sphere containing a snowflake and trailing frost; Spellward — violet protective shield wrapped around a small friendly light.
Row 4: Pyroblast — enormous fierce orange fireball with a molten core and curling flames; Arcane Barrage — four violet darts fanning apart; Deep Freeze — a target silhouette fully entombed in a blue ice block; Arcane Beam — long continuous lilac ray passing through three bright crystals.
Row 5: Ice Barrier — thick layered ice shield with snowy upper rim; Flamewave — low circular rolling wall of flame; Blizzard — blue-gray cloud raining snow and ice; Ley Renewal — purple ley lines winding around three ascending healing droplets.
Row 6: Glacial Spike — massive crystalline icicle with jagged frozen base; Comet Shower — three silver-blue comets falling diagonally together; Prismatic Guard — rainbow crystal dome sheltering three small lights; Chain Lightning — bright branching blue bolt linking several silver sparks.
Row 7: Flash Freeze — instantaneous white-blue starburst inside a compact ring of ice; Inferno Beam — focused horizontal roaring fire ray; Blinkward — small violet figure protected within a folded angular blue-violet shield, no teleport path; Starfire — golden star enclosed in a long violet celestial projectile trail.
Row 8: Winterstorm — jagged crown of ice around a wide swirling frost explosion; Arcane Tempest — six violet magic arcs revolving in a purple cyclone; Aegis of the Archmage — grand gold-trimmed violet shield crowned by a large arcane gemstone; FINAL CELL COMPLETELY EMPTY TRANSPARENT.
```

### Cleric atlas

Source: `assets/source/spells-cleric-generated.png`; runtime: `public/ui/spells-cleric.png`.

| Row | Column 1 | Column 2 | Column 3 | Column 4 |
| --- | --- | --- | --- | --- |
| 1 | smite | heal | holy-nova | flash-heal |
| 2 | power-word-shield | renew | searing-light | binding-light |
| 3 | prayer-of-healing | holy-fire | penance | holy-word-serenity |
| 4 | divine-aegis | chains-of-light | circle-of-healing | divine-hymn |
| 5 | radiant-burst | guardian-light | greater-heal | sacred-flame |
| 6 | prayer-of-mending | holy-word-chastise | sanctuary | judgment |
| 7 | salvation | holy-lance | seraphic-barrier | cleansing-radiance |
| 8 | light-of-dawn | wrath-of-heaven | guardian-of-the-dawn | Transparent |

Exact generation prompt:

```text
Use case: stylized-concept. Production spell icon ATLAS for Mossvale, an original charming voxel fantasy MMORPG. A single transparent PNG spritesheet exactly 1024 pixels wide by 2048 pixels tall (aspect 1:2). EXACTLY FOUR COLUMNS AND EIGHT ROWS of equal 256-by-256 square cells. 31 individual icons and one deliberately empty bottom-right cell. This is a CSS sprite atlas: item centers MUST fall on exact centers of the uniform 4x8 grid, not a contact sheet with uneven spacing. Every isolated illustration fits within the central 72 percent of its own cell, with fully transparent empty padding. Each spell has ONE distinct readable illustrated symbol, not a framed scene. No cell can contain two alternative icons. Consistent chunky stepped voxel silhouettes, hand-painted tactile oak/leather/metal/crystal surfaces, crisp faceted edges, gentle upper-left lighting, high contrast and simple bold compositions readable at 36 pixels. Rich premium fantasy game inventory art. Actual transparent alpha background; no background color, no checkerboard, no gridlines, no frames, no writing, no letters, no numbers, no captions. Local magic spark trails may surround their own object but must stay within its cell. Do not render any of the descriptive labels below. Follow the exact row order.
CLASS CLERIC: ivory, warm gold/brass, teal sacred cloth, pale golden holy light. Healing art warm green-ivory, shielding teal/gold, judgment brightgold. Original Mossvale sun/tome/wing/holy-emblem iconography; absolutely no written words or letters in the illustration. Different silhouettes for every spell.
Row 1 left to right: Smite — bright golden holy bolt with a sun-shaped tip; Heal — open ivory hand cradling a large warm healing heart; Holy Nova — golden radiant ring expanding from a small sun; Flash Heal — small luminous heart with a short white lightning-shaped healing spark.
Row 2: Power Word Shield — compact teal and gold protective shield with ivory sun emblem; Renew — three ascending green-ivory healing droplets in a spiral; Searing Light — narrow brilliant golden light dart; Binding Light — golden ray wrapped in a slowing loop of luminous chain.
Row 3: Prayer of Healing — open teal prayer book radiating healing light toward three small hearts; Holy Fire — ivory sun burning in concentrated golden flame; Penance — three gold judgment bolts descending in sequence; Holy Word Serenity — tranquil large ivory heart held within a warm sun halo.
Row 4: Divine Aegis — tall ornate gold shield with substantial teal magical barrier; Chains of Light — two crossed luminous chains ending in a bright stun star; Circle of Healing — three small green-ivory hearts joined in a circular healing wreath; Divine Hymn — three radiant healing waves rising from an open ivory prayer book, no musical notation.
Row 5: Radiant Burst — golden projectile detonating in a wide sharp starburst; Guardian Light — small protected cleric helmet between folded golden wings; Greater Heal — two cupped hands holding an enormous radiant ivory-gold heart; Sacred Flame — three successive tall golden flames around a bright sun core.
Row 6: Prayer of Mending — three linked hearts connected by flowing green-gold healing threads; Holy Word Chastise — small gold gavel of light striking a bright stun star; Sanctuary — teal protective dome sheltering three ivory silhouettes; Judgment — heavy golden sun disk descending on one focused point.
Row 7: Salvation — glorious sun above a group of three healed hearts and upward rays; Holy Lance — long sharp ivory spear made of sacred sunlight; Seraphic Barrier — three linked protective shields beneath a pair of outstretched golden wings; Cleansing Radiance — explosive ring of golden rays with a slowing teal light ribbon, offensive burst.
Row 8: Light of Dawn — low rising golden sun casting healing rays toward three tiny green hearts; Wrath of Heaven — massive blazing golden judgment column descending from a radiant cloud; Guardian of the Dawn — grand winged gold shield with large sunrise emblem sheltering one heart; FINAL CELL COMPLETELY EMPTY TRANSPARENT.
```


## Quest board notices

Six original Blender renders support the woodland quest board. Rebuild with `/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-quest-board-ui.py`. The complete editable scene library, cameras, lighting and procedural parchment material are retained in `assets/source/quest-board-ui.blend`. No AI-generated bitmap, external texture, lettering, quest description or reward amount is baked into these assets.

| Runtime image | Size | Composition and integration |
| --- | --- | --- |
| `public/ui/quest-board/crest.png` | 320×320 RGBA | Original brass lantern and sunburst over oak and teal enamel, with geometric moss and leaves; transparent outside. |
| `public/ui/quest-board/notice.png` | 512×800 RGBA | Modeled ivory parchment with rolled top and ragged edges; quiet text-safe rectangle x58–454, y88–720; transparent outside. |
| `public/ui/quest-board/hunt.png` | 640×320 RGBA | Sunlit winding woodland path with original stepped Moss Slimes; opaque full-bleed landscape. |
| `public/ui/quest-board/gather.png` | 640×320 RGBA | Cut oak timber, medicinal herbs, berries and mushrooms beneath woodland trees; opaque full-bleed landscape. |
| `public/ui/quest-board/craft.png` | 640×320 RGBA | Warm timber workshop, workbench, tools, anvil and glowing hearth; opaque full-bleed landscape. |
| `public/ui/quest-board/dungeon.png` | 640×320 RGBA | Rootvault stone architecture, treasure chest, lanterns, roots and luminous crystals; opaque full-bleed landscape. |

The forest and dungeon compositions reuse our authored `public/models/giant-trees.glb` and `public/models/rootvault-kit.glb` geometry, copied into the editable scene library without changing the gameplay assets. Other props and the crest/paper are authored directly by the builder. All six images render in Blender 5.2.1 LTS using Cycles, warm upper-left area lighting, AgX color management and transparent film where appropriate. The builder validates actual exported dimensions, alpha and opaque landscape coverage after rendering. Quest labels, progress, currency and buttons remain accessible HTML.

## Referral companions

The Wayfinder Sprite and Wayfarer Stag are authored in Blender with stepped silhouettes, layered surface details and shared vertex-color palettes. Each retains an editable scene, game GLB, transparent collection portrait and lit presentation render.

| Reward | Builder | Editable source | Runtime model / portrait |
| --- | --- | --- | --- |
| Wayfinder Sprite | `scripts/build-wayfinder-sprite.py` | `assets/source/wayfinder-sprite.blend` | `public/models/wayfinder-sprite.glb` / `public/ui/pets/wayfinder-sprite.png` |
| Wayfarer Stag | `scripts/build-wayfarer-stag.py` | `assets/source/wayfarer-stag.blend` | `public/models/wayfarer-stag.glb` / `public/ui/mount-wayfarer-stag.png` |

Run either builder with Blender `--background --python <builder> -- --render` to rebuild its model, source and portraits. Preview renders are `assets/source/<reward-id>-preview.png`. Exports face +Z with Y up and grounded origins. Pet head, tail and wings use the existing named animation joints. The stag retains articulated head, tail and four two-part legs; saddle metadata is `(seatY: 1.97, seatZ: 0.50)` for the driver and `(passengerSeatY: 1.97, passengerSeatZ: -0.82)` for the passenger. Both rewards share three materials per model, and instances share geometry while retaining independent poses.

`node scripts/check-referral-rewards.mjs` validates the authored assets and both rider seats. `node scripts/check-mount-animation.mjs` covers every race, gender and class. `node scripts/check-referral-models-browser.mjs` renders the actual client models in WebGL, including both riders and rear/jump views, into `artifacts/referrals/`; use `MOSSVALE_PLAYWRIGHT` and `MOSSVALE_CHROME` to point to an existing browser runtime when needed. `node scripts/render-referral-rewards.mjs --riders` also renders the game’s assembled rider pose through Blender.

## Friends and requests

The Friends, Who, Requests and Ignore window reuses the carved-oak frame, forest leather, cream Marcellus heading and brass accents. Who uses the same selectable player rows for party members and other adventurers, with invitations and party controls in the Friends window. P and the party HUD open Who. Friends are mutual after explicit acceptance; the Requests tab provides Accept, Decline and Cancel controls. The menu badge counts incoming requests. All labels and controls remain accessible HTML. `public/ui/friends-emblem.png` is a transparent 512×512 Blender render shared by the heading and menu button. Edit `assets/source/friends-emblem.blend` or rebuild with Blender `--background --python scripts/build-friends-emblem.py`; the builder checks dimensions, alpha and clear margins.

## Achievements

`public/ui/achievement-emblem.png` and the 29 `public/ui/achievements/<achievement-id>.png` icons are generated painted fantasy illustrations, with original PNG transparency. They use antique gold, forest green, weathered steel, wood and restrained jewel colors. The distinct symbols cover growth, combat, quests, travel, professions and four dungeon crests. Generation prompts are retained in `assets/source/achievement-icon-prompts.json`. Names, points and titles remain accessible HTML. The image set replaces the earlier Blender artwork and builders.
