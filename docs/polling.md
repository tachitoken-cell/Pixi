# Mossvale polling booths

The authored catalog is `src/polls.ts`. The first proposal is **Stake MOSS?**, open from 20 September 2026 at 19:30 UTC until 27 September 2026 at 19:30 UTC. It asks whether staking should be added; voting does not implement staking or promise any reward.

Players visit a town polling booth and explicitly choose Yes, No, or Skip for every question. Submission is final: one complete ballot per normal signed-in account, shared across characters and realms. Local development uses its existing guest account identity. A receipt appears only after the durable write. If the connection fails during submission, reopen the booth to check the recorded ballot before retrying.

Voting opens at `opensAt` (inclusive) and ends at `closesAt` (exclusive), using server time. Aggregate turnout and results remain hidden until closing. Each question passes with **at least 70% Yes among Yes + No votes**. Skip counts towards turnout but not the approval denominator. No Yes/No votes means no approval percentage and the question does not pass. The threshold compares exact counts; a rounded displayed percentage cannot change the outcome.

## Publishing a proposal

Add a `PollDefinition` to `POLLS` with a new lowercase hyphenated ID, a title, plain-text description, UTC epoch-millisecond dates (`Date.UTC(...)`), and 1–30 questions. Each question needs its own stable ID and plain-text wording. Keep closed polls in the catalog so their results remain available. An empty catalog is supported and displays an empty booth.

Review wording and dates before release. Never reuse a poll ID or edit any published poll that has received a ballot, including its wording, question IDs, or dates. The first accepted ballot saves the complete definition; reads and writes reject a conflicting catalog revision. Publish a correction as a new proposal with a new ID. Do not edit stored ballot files or rows.

Publish through the normal `main` production workflow with matching patch notes; all realms use the canonical PostgreSQL database. `mossvale_poll_ballots` has a `(poll_id, account_key)` primary key and immutable whole-ballot inserts on the existing account-owning database connection. Polls do not change player autosaves or account locks. Local development persists `polls.json` with an fsynced temporary file, atomic rename, and directory fsync; this fallback is for a single local server, not shared public realms.

Run `node scripts/check-polls.mjs`, `node scripts/check-polls-server.mjs`, and `node scripts/check-polls.mjs --postgres`. The PostgreSQL check uses a disposable loopback container by default, or a disposable schema under a loopback-only `TEST_DATABASE_URL`.

## Art and client checks

The original Blender source is `assets/source/poll-booth.blend`; the game loads `public/models/poll-booth.glb`. Rebuild with `/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build-poll-booth.py -- --render`. Run `npm run check:polls` for storage/server/placement/asset checks, and `npm run check:polls:browser` for desktop/mobile UI and real game integration. Browser checks use isolated temporary accounts and voting dates, write screenshots under `artifacts/polls`, and never submit to public realms.
