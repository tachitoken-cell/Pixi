# Fair-play review

Movement remains server-authoritative. Excess displacement, including delayed
packets beyond the movement credit cap, is corrected without a cheating strike.
Malformed commands, forged progression and sustained request floods still use
the account safety cooldown. Its report includes the counted reasons and times,
not just the last rejection. It is not a ban.

The bot-risk score prioritizes GM review; it does not automatically ban players.
The existing Reports panel has an option to include reviewed reports. Banning
from a report records the moderator's reason, identity and time together with a
copy of the evidence used for that decision. Later observations cannot rewrite
the reviewed evidence. Existing direct GM commands remain separate from this
report-review flow.

## Evidence

- Server timing uses accepted manual casts, successful manual loot requests,
  gathering starts and changed autoattack target selections. It excludes
  automatic attack ticks, pet pickups, failed requests and movement corrections.
- At least 60 intervals over five minutes, with timing variation at most 1%,
  produces a 60-point review signal. Repeated selection of the same live target
  does not count as another selection. Reports are limited to one per account
  per hour in the realm process.
- A second server signal detects an exact mixed farming route repeated at least
  ten times over ten minutes, across at least six distinct resource/enemy targets.
  It uses accepted gathering starts and changed target selections, not click
  timing, so random delays alone do not bypass it. Routes contain 6–24 steps;
  at most 240 observations are held per account. Changing area, invalid context,
  bunched packets or a gap over two minutes resets continuity. Ordinary short
  loops and spell rotations are excluded. Real players can also repeat routes:
  this produces a 60-point review signal, never an automatic penalty.
- During accepted manual gameplay the server issues a fresh, one-use runtime
  check, at most once per minute. It belongs to that connection, expires after
  two minutes and cannot be answered by another socket or replayed. The current
  client responds after two active, visible, focused animation callbacks with
  only the nonce and the browser's `webdriver` automation flag. At most six
  recent checks are retained per connection. Repeated automation flags add 15
  supporting points. Unanswered or mismatched replies add no points. An explicit
  scripting-library HTTP client header adds 10; the raw header is not retained.
  Scores are capped at 100. These indicators accompany server behavioral
  evidence; they do not create reports alone. The report stores aggregate check
  results and the observed route, never the challenge nonces.
- The browser sends a small aggregate after 30 seconds of active, focused play.
  Dimensions are rounded to 100-pixel buckets. It reports counts and aggregate
  timing, never typed text, key values, raw coordinates or DOM targets. Up to
  ten recent windows are kept in bounded server memory; relevant summaries are
  retained with a flagged report.
- After at least five windows and 150 seconds, 60 highly regular browser click
  intervals can add 10 points. Concentration of those regular clicks in one
  coarse screen area adds 5; at least 60 synthetic clicks adds 10. These fields
  are explicitly labeled untrusted. They cannot create a report without the
  server signal and cannot ban or disconnect anyone.
- Window dimensions, missing telemetry, no clicks/drags, keyboard-only play and
  touch play add no points. No CAPTCHA, external fingerprinting service or new
  account/host configuration is required.

There is no trusted browser attestation in this protocol. A script can emulate
the runtime reply, lie about `webdriver` and spoof browser headers. A correct
reply does not lower the behavioral score or establish innocence. Missing/late
replies are inconclusive and add no points, including for old clients, background
tabs, loading screens and native WebViews. No JavaScript puzzle, CAPTCHA,
fingerprint or third-party challenge service is used.

The score is not a probability. Macros, extensions, accessibility software and
repeated use of normal controls can resemble automation. Sophisticated bots can
vary timing or forge/omit browser summaries. GMs should corroborate the report
with observed behavior and account context before recording a ban reason.

Run `npm run check:guards`, `node scripts/check-community-ui.mjs`,
`node scripts/check-travel.mjs`, `npm run build` and `npm run check:wiki`.
