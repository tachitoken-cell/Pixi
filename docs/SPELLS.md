# Mossvale spell catalog

`src/spells.ts` is the authoritative catalog: 124 abilities across Ranger, Knight, Mage and Cleric. Each calling has one level-1 starter plus one distinct lesson at every even level from 2 through 60. Reaching the level makes training available; the class trainer must still teach the spell before it can be assigned or cast.

## Calling identities

| Calling | Main strengths | Supporting options |
| --- | --- | --- |
| Ranger | Instant arrows, deliberate long shots, poison, multi-target volleys | Slowing/stunning shots, personal recovery and bark shields; a late party-healing channel |
| Knight | Immediate blade attacks, close cleaves, ground attacks | Personal/party absorption, short control effects, recovery and stationary blade channels |
| Mage | Fixed-time bolts, explosive area damage, frost control | Arcane/fire channels, personal recovery and protective wards |
| Cleric | Direct and party healing, timed absorb shields, holy ranged damage | Reactive instant healing, stationary restoration channels, slows and stuns |

These are Mossvale mechanics and balance values. Priest role design takes inspiration from Blizzard's [Priest class guide](https://worldofwarcraft.blizzard.com/en-us/game/classes/priest) and [original game manual](https://us.media.blizzard.com/manuals/wow/wow-classic-manual-enUS.pdf), which describe healing, offensive magic, crowd control and protective spells. [Wowhead's Holy Priest ability guide](https://www.wowhead.com/guide/classes/priest/holy/abilities-talents-pve-healer) provides additional ability-family reference. No addon implementation or Blizzard artwork is included. References checked 12 September 2026.

Timing reference: [Wowhead's Flash Heal entry](https://www.wowhead.com/spell=2061/flash-heal) lists a 1.5-second cast and 1.5-second global cooldown. Mossvale uses those timings alongside instant attacks, longer casts and channels; individual cooldowns and spell effects remain game-specific balance choices.

## Casting and combat contract

- `castTimeMs` is an explicit duration from 0 to 3,000 ms. Zero means instant. Equipment and level improve power without increasing cast duration.
- `GLOBAL_ATTACK_MS` is a shared 1,500 ms cooldown starting when a valid action is accepted. The individual spell cooldown starts on release, or at the start of a channel. Cancelling a preparation/channel retains the global cooldown already spent.
- Channels last three seconds, with ticks every 500 or 1,000 ms. The first tick occurs after that interval. Movement interrupts preparation and channels; they are stationary abilities.
- Radial abilities are centered on the caster and need no selected target. Hostile radial casts and channels affect living enemies currently in range and still cast in empty space, spending normal cooldowns. Friendly radial abilities affect the caster and nearby party members. Target selection never redirects or interrupts these effects.
- `damageScale` multiplied by `damageStat` gives one application's power: damage, healing or absorption according to `effect`. Channel power is **per tick**. `spellTotalPower` includes all ticks and any poison; `spellTotalDamage` is zero for healing and shields.
- Damage spells use hostile targets. Single friendly spells can affect a living ally, with self-targeting when no explicit target is supplied. Explicit invalid targets are rejected. Friendly chain/radial effects select party members and the caster. Self abilities explicitly use `targetRelation: 'self'`.
- Shields absorb incoming damage for `shieldDurationMs`. Existing slow/stun/poison mechanics remain server-authoritative. Projectile damage continues to wait for the visible impact; channels do not apply their whole total on acceptance.

## Compatibility

All original 15 spell IDs remain valid. Their former level 5/10/15/20 requirements move earlier to 4/8/12/16. Existing primary/special commands retain their class mappings: Quick Shot/Volley, Sword Strike/Whirlwind and Fireball/Frost Nova. Cleric uses Smite/Holy Nova.

The default hotbar remains exactly eight slots. Expanding the catalog and learning abilities never overwrites saved assignments. Locked or unlearned assignments are cleared in place. New spells are placed deliberately through the spellbook.

Validation: `node scripts/check-spell-catalog.mjs` checks catalog coverage, IDs, levels, target/effect contracts, fixed timings, tick totals, icons and stable eight-slot layouts. Client, casting and WebSocket combat checks exercise presentation and authoritative behavior separately.
