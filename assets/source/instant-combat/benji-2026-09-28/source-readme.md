# Instant Combat: animated monsters and boss skills

Source: your `Mossvale-Instant-Combat-Bosses` ZIP (`instant-combat-monsters.blend`, a copy is in `source/`).

## Why they looked static

Your build script (`build-instant-combat-monsters.py`, `animate()`) keys every part only every 3 frames, and the numbers are tiny:

- **idle:** legs swing 0.016 rad (about 1 degree), body bobs 0.5 % of its height
- **auto / attack:** only arms and head move; legs, tail and orbit stay still
- **walk:** legs swing, but there is no lift, no weight shift and no gait pattern (all legs on one side move together)

So in the game they mostly stood still.

## What is new

**All 15 models get new base clips** (8 bosses, 4 wave creatures, 3 objectives). The names, lengths and hit frames are
the same as before, so `monster-models.ts` plays them without any code change:

| Clip | Frames (30 fps) | What it does now |
|---|---|---|
| `<model>-idle` | 60, loop | breathing, weight shift, looking around, legs and tail twitch, orbit rings turn, casters hover |
| `<model>-walk` | 36, loop | real gaits: bipeds step with arm swing and body bob; beasts trot (diagonal pairs); insects walk in alternating tripods |
| `<model>-auto` | 30, hit on 15 | wind-up, fast strike, recoil (bipeds swing, insects and beasts bite, casters flick) |
| `<model>-attack` | 48, hit on 24 | big wind-up, trembling hold, heavy hit, settle with overshoot |
| `<model>-death` | 60 | recoil, stagger, collapse to the floor (beasts roll over, insects curl their legs, objectives crumble) |

Built from key poses with easing, overlap (the head, arms, tail and rings follow the body a few frames later) and a
life layer. Every frame is keyed and ground-corrected, so feet never go through the floor.

## Grave Cantor and Void Cantor

- **All attacks come from the scepter.** Their `left-arm` part is really half of the chest, so it now only sways a little.
  `auto` and `attack` swing the scepter (right arm): it tilts back to wind up, then swings forward. The Grave Cantor's 3
  skills also use the scepter: raised for Silent Requiem, pointed at each target for Dirge Marks, held up for Last Rites.
- **Ranged auto attack for both.** `auto` charges a bolt on the scepter tip and launches it on frame 15 (the same hit
  frame as before); it flies 12 m in 0.3 s. Void Cantor: violet Void Bolt, Grave Cantor: orange Grave Fire. The viewer
  shows the bolt (`<cantor>-auto-fx.json`); in the game your projectile effect (`monster-effects.ts`) draws it, so the
  cantors need a ranged attack style on the server. Data: `INSTANT_COMBAT_RANGED_AUTO` in `game/instant-combat-skills.ts`.
- The Void Cantor's small robe crystal (`halo`) no longer spins around a far pivot; it stays on the robe.

**Each boss gets 3 skills with a rule.** Follow the rule or it really hurts. New clips: `<boss>-skill-<slug>`.

| Boss | Skill | Rule | If you break it |
|---|---|---|---|
| Ossuary Tyrant | Verdict of Bones | Get BEHIND the Tyrant. The whole front half (14 m) is crushed when the tablet lands. | 85% max HP + knocked down 2 s |
| | Bone Cage | Two players are caged. Everyone else must break both cages (each has HP) within 8 s. | The player inside dies |
| | Grave Toll | Stack in the gold circle. Each of the 3 tolls is split between everyone inside. | Alone: 3 × 60% max HP |
| Marrow Colossus | Earthsplitter | Stand between the 4 fissure lines, then move again: the second slam is turned 45°. | 60% + bleeding 5%/s for 6 s |
| | Marrow Quake | Run CLOSE to the Colossus (inside 8 m) before it lands. Everything outside is hit. | 70% + knocked up 2 s |
| | Crushing Grip | It grabs its target. Hit the glowing pink fist for 5% of its HP within 4 s. | The grabbed player dies |
| Grave Cantor | Silent Requiem | While the red halo burns (2 s), STOP: no moving, no attacking, no casting. | 50% + silenced 5 s |
| | Dirge Marks | 3 players get a note. Marked players run APART: each note explodes 6 m wide. | +60% per overlap (2 overlaps kill) |
| | Last Rites | 3 grave runes appear. Stand on ALL 3 at the same time to break the 5 s channel. | 90% to everyone |
| Carrion Queen | Acid Rain | Acid lands where you stand, 3 times. Keep moving, drop the puddles at the edge (they stay 20 s). | 20% per second in acid |
| | Brood Bomb | An egg flies at the farthest player. At least 3 players must stand in the gold circle. | 90% to everyone inside + 4 scarabs hatch |
| | Venom Stacks | Each bite adds Venom to the tank. At 4 stacks the second tank must taunt. | 5 stacks: 50% to everyone within 8 m, the tank dies |
| Rift Sovereign | Void Collapse | Everyone is pulled to the centre for 3 s. Run OUTWARD and reach the gold ring (10 m). | 90% + silenced 4 s |
| | Polarity Decree | Gold or violet mark on every player. Stand in the half with YOUR colour. | 80% + stunned 3 s |
| | Rift Lances | 3 lances at the marked players. Step sideways; never stand behind a marked player (they pierce). | 65% per lance |
| Nullweaver | Null Tether | Players are linked in pairs. Stay within 5 m of your partner for 6 s. | 70% to both + silenced 4 s |
| | Cocoon | A player is wrapped. Break the cocoon within 8 s. | The player dies, the boss heals 5% |
| | Web Snare | Half the floor becomes web tiles. When it pulses, stand on a CLEAR tile. | Rooted 4 s + 40% |
| Umbral Behemoth | Umbral Stampede | It charges through the marked player and back. Marked player at the edge, everyone else out of the lane. | 90% + knocked away |
| | Tail Sweep | Only the FRONT is safe; the tail sweeps 240° around back and sides. | 75% + knocked back |
| | Devour | Devour digests the tank for 6 s. The second tank must take the boss before the next bite. | Second bite on the same player kills |
| Eclipse Oracle | Total Eclipse | The eye closes, the arena goes dark. Stand in a light circle before it opens (they shrink). | 80% + blinded 4 s |
| | Prophecy | 4 quadrants numbered 1-4 blast in order. Wait in 4, then step into each quadrant right after it blasts. | 70% per blast |
| | Sweeping Gaze | 4 beams turn clockwise a quarter circle. Walk WITH the gap between two beams. | 50% per tick |

Your existing 70% / 35% phase mechanics (anchors, stomps, notes, brood, rifts, webs, charge, gaze) are not changed.
These skills are for the fight between those phases.

## Files

| File | Contents |
|---|---|
| `export/instant-combat-monsters.glb` | **Drop-in replacement** for `public/models/instant-combat-monsters.glb`: same 15 roots, part names and 2 materials, the 75 improved clips + 24 skill clips (99 in total) |
| `blend/instant-combat-monsters-animated.blend` | your models with the new actions as NLA tracks (same setup as before) + the collection `Skill FX` with the telegraphs and player dummies of every skill |
| `export/<model>.json` | every model with all its clips (format v2, Y-up); boss files also carry `skill-<slug>` clips with rule, penalty and events |
| `export/<boss>-skill-<slug>-fx.json` | telegraphs and player dummies of one skill; play with the boss clip `skill-<slug>` |
| `export/<cantor>-auto-fx.json` | the ranged bolt of the Grave / Void Cantor auto attack |
| `export/index.json` | all models, clips and skills |
| `game/instant-combat-skills.ts` | skill data for your game: clip name, cast time, event times (ms), rule, penalty, numbers |
| `viewer/index.html` | viewer: every creature and clip; skills show telegraphs, the rule card and players who follow or break the rule |

## In your game

- **Base clips:** just replace the GLB. `setInstantCombatAssets` finds the same `<model>-idle/walk/auto/attack/death` names.
  Hit frames are unchanged: `auto` on frame 15 of 30, `attack` on frame 24 of 48 (`enemyAttackPhase` = 0.5).
- **Skills:** the clips are in the GLB as `<boss>-skill-<slug>`. To use them, pass them to the mixer like `attack`
  (e.g. add them to the library entry in `setAuthoredDungeonAssets`) and start the clip when the server casts the
  skill. `game/instant-combat-skills.ts` has the cast length and the event times, e.g. the Tyrant's slam lands 1933 ms
  after the cast starts.
- **The server rules** (who is safe, who takes the penalty) are not in your ZIP's server code yet. I only built the
  animations, the telegraph design and the data. The rules fit your existing hazard types (half circle = `cleave`,
  ring / donut, lanes = `cross`, soak and order runes like `soak` / `ordered`).
- The Umbral Behemoth's Stampede and the Marrow Colossus's Quake move the body away and back inside the clip. They end
  where they started, so the boss position on the server does not change.

Export check (`--verify`): all models and fx files OK (≤ 0.27 mm). The GLB exporter check: 99 clips, 15 roots, 2 materials.

## Regenerate

```sh
python3 scripts/instant_combat/ic_kit.py v12/source/instant-combat-monsters.blend v12/blend/instant-combat-monsters-animated.blend
python3 scripts/instant_combat/export_ic_json.py v12/blend/instant-combat-monsters-animated.blend v12/export --verify
python3 scripts/instant_combat/export_ic_glb.py v12/blend/instant-combat-monsters-animated.blend v12/export/instant-combat-monsters.glb
```

- `scripts/instant_combat/ic_motion.py`: the motion engine (gaits, overlap, life layer, ground correction)
- `scripts/instant_combat/ic_kit.py`: base clip key poses per body type (`base_keys`)
- `scripts/instant_combat/ic_skills.py`: the 24 skills (boss key poses, telegraphs, dummies, rule text)
