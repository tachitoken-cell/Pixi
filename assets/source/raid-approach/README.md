# Raid approach source art

Benji supplied these original Blender files in the Discord conversation linked by Mossvale issues [#50](https://github.com/trappyon/mossvale/issues/50), [#51](https://github.com/trappyon/mossvale/issues/51) and [#52](https://github.com/trappyon/mossvale/issues/52). Retrieved September 25, 2026. Originals are unchanged; Blender automatic script execution was disabled while importing.

| Original | Source message | SHA-256 |
|---|---|---|
| `boss_morgrath.blend` | [Benji submission](https://discord.com/channels/@me/1548969548785385513/1552461682507382864) | `30812b2a2d07abc6b66d6c1d2750f2a713a63e5f221bfc5263957764124489c0` |
| `moss_monsters_1.blend` | [Benji submission](https://discord.com/channels/@me/1548969548785385513/1552456887990100059) | `a1aba44dc0cb64287803e0fba15526b3a75f0d123b0accfe8434f19716e4bb70` |
| `monsters_20.blend` | [Benji submission](https://discord.com/channels/@me/1548969548785385513/1552459942076878898) | `5edb6bcd69d368474cb0b2906c442fd1a71b81be17fb02ae57d7948f061dcf70` |
| `dungeon_room.blend` | [Benji submission](https://discord.com/channels/@me/1548969548785385513/1552437343573643354) | `6f0f20f7f7a089c830e324c1e588481f467a3cc29cb21d23566f20b7c1b55dad` |

The creature builder preserves the actual submitted meshes, splits disconnected islands into rigid animated body parts, and adds authored geometry and six animation clips per creature. Morgrath also has dedicated Rift and Rupture clips (152 clips total). Weapon and horn assemblies stay on their anatomical joints; all strikes use held anticipation, contact at the clip midpoint and recovery, mapped to authoritative server timing. The room builder adapts the submitted ruin/altar/crystal motifs into seven distinct void chambers. Derived editable sources are `../raid-approach-monsters.blend` and `../raid-approach-rooms.blend`; builders are `../../../scripts/build-raid-approach-monsters.py` and `../../../scripts/build-raid-approach-rooms.py`.

Visual references: existing Mossvale wild pets, legacy dungeon bosses and the detailed Horned Apostle. The approach retains chunky faceted proportions, stepped contours and readable silhouettes with obsidian, violet and cold mint accents. Runtime assets contain no source-file scripts or external textures.
