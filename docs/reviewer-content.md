# Complimentary store review content

The operator command records explicit `review-access` grants, separate from signed MOSS orders and verified Apple/Google receipts. Each record grants one known permanent reward or one boost charge. It never creates a receipt or enables billing.

The bundle supplies the four currently offered permanent store rewards and one charge for each of the four boosts. Already owned permanent rewards are skipped. Re-running does not duplicate grants or refill consumed charges. Retired titles, class changes, and specialist consumables are excluded. The cosmetic box has no separate permanent entitlement: its four possible rewards are included directly. This provides content access, not a test of paid checkout or the random-box purchase flow.

The grant validator and migration must be deployed to **all three realms (EU, US, and Asia) before any explicitly authorized provisioning**. An older realm cannot validate complimentary ownership. Keep the review account signed out on all three realms (EU, US, and Asia). Use the exact account hash, character UUID, and expected character name verified from the existing review account. Do not put passwords, tokens, or database URLs on the command line or in reports.

With the shared database environment and its existing CA configuration already loaded, preview:

```sh
node scripts/provision-review-content.mjs --account-key "$REVIEW_ACCOUNT_KEY" --character-id "$REVIEW_CHARACTER_ID" --expected-name Mossreview --prepare-riding
```

Inspect the sanitized plan, then repeat with `--apply` to provision. The command claims an **existing** offline account, validates the real save, uses the standard transactional writer, checks readback, and releases the account lock even on failure. Missing, active, banned, GM-protected, mismatched, or unsettled-purchase accounts are refused. Preserve a private database backup before any production provisioning. The command does not create accounts, call identity providers, change roles, or write other characters.

`--prepare-riding` explicitly raises the character to at least level 25 and basic riding, recomputes health capacity from equipped gear, and marks its beginner onboarding complete so the character UI is accessible. It preserves current HP, XP, quests, inventory, gear, gold, and any higher progression. This is a review fixture using normal progression fields; it does not grant GM powers or every endgame unlock. Omit it to grant content without changing progression. The normal writer may also apply existing pending gold credits while saving, as on any login.

After provisioning, sign in using the store's review credentials and verify the store collection, both pets, both mount summons, and each boost's normal activation. One-time boost grants can be consumed, so record the remaining charges honestly in review instructions. Keep real device sandbox billing verification as a separate publishing prerequisite.

Run the local regression with `node scripts/check-review-content.mjs`. It uses a disposable local PostgreSQL database and real game sockets; it must never target production.
