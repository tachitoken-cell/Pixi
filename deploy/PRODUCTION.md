# Automatic production rollout

`.github/workflows/production.yml` checks same-repository pull requests and main pushes. Once
bootstrapped, checks and a private, immutable GHCR image build run concurrently
on main. After both succeed, the workflow deploys **EU, US, and Asia**. Each realm
gives at least five minutes of warning and saves players before replacement. Push
or merge to **main** to deploy; **Actions → Mossvale production → Run workflow → main**
also starts a release. Production runs never cancel an earlier final save.

This workflow is the sole normal release route for game changes. Do not push
directly to `production`, deploy from BBA, or invoke host release commands for a
normal update. Roll back code by reverting it on `main` and letting the same
workflow run. Host access remains available for initial setup and emergency
recovery; this operating rule does not remove administrator access.

The pipeline:

On `main`, a production-environment readiness job checks enabled Turnkey activation
before the test batches and image build. It reads the pinned EU/BBA state and prepares
an unsigned provider request; it cannot configure or deploy anything. A disabled
gate skips checkout and provider access. Pending settings fail promptly for inspection.
The rollout repeats its checks before player warnings, so passing early does not waive
later validation. Pull-request checks continue without production-environment access.

1. Builds and checks client performance, deployment, NFT, MOSS store, treasury and auction payments,
   shared progress, mobile payments, and restart paths in eleven named suites
   grouped into two balanced batches on two self-hosted workers. Each batch installs
   and builds once, then runs its suites sequentially with a tracked-file guard after
   each suite. One successful batch uploads the release manifest. The stable `checks`
   job succeeds only when both batches and every suite passed. The image builds
   concurrently, but deployment waits for both the complete checks gate and image. A newer main commit supersedes an
   older run before draining. Transient deployment-status reads have bounded
   retries; mutation requests are not automatically replayed.
2. Pulls and verifies the same candidate on **both US and Asia before any realm
   starts its countdown**, preserving each host's live `.env` and Compose
   settings. An exact immutable image digest already present locally skips another
   pull, while all candidate checks still run. A missing image gets at most two
   ten-minute pull attempts, with a five-second pause only after a timeout;
   authentication and validation failures do not retry. The scoped SSH gateway
   still authenticates to the registry for each phase. The existing backup tool saves a validated canonical EU database
   archive on the separate hosts. Database and wallet credentials stay there.
3. Starts held five-minute warnings on US and Asia when both installed helpers
   and live games support them. Players can keep playing after the notice expires
   until deployment commits. Authenticates to EU's `/api/deployment`, gives its
   five-minute player warning, and waits for the exact old process to finish its
   final save and close its database connection. The drained process remains alive until BBA replaces
   it; it cannot start accepting players again.
4. Advances `production` to the checked main tree plus `release-revision.txt`.
   BBA removes `.git` from builds, so this one generated marker preserves the
   tested main revision. The production commit has both checked main and prior
   production as parents; promotion never force-pushes over a competing update.
5. Verifies EU's release manifest, asset hashes, configuration, health and
   WebSocket admission. Then US and Asia commit their warnings, wait any remaining
   time, save, exit zero, reload their existing Caddy proxy configuration, and start
   the already verified image. Proxy reload failures leave the saved game stopped
   for a safe workflow retry; preparation never reloads active connections. The same public
   checks verify both realms. A failed warning or EU deployment cancels owned,
   uncommitted regional notices and leaves those games running. Older helpers,
   older games and Apple activation retain the original sequential warnings;
   economy activation retains its separate all-writer barrier. A player catalog
   version change uses the coordinated stop described below.
6. Rebuilds and publishes the independent wiki from the same checked revision,
   then verifies its public patch notes and revision against all three realms.
   Gameplay changes require curated `wiki/patch-notes.json` updates in CI;
   imported catalog pages rebuild automatically, while guide prose needs review.
7. Publishes the independent `mossvale-stats` Worker at `stats.mossvale.world`
   after all three realms pass verification. It serves the dashboard and proxies
   the public aggregate statistics API; it has no player or database credentials.

The GitHub run retains `production-verification`; private host phase records and
backups live under `/var/lib/mossvale/releases`. HTTP 200 alone is not success:
all three realms must be available with the expected release and assets. Each
successful phase is recorded even if the other host fails.

The chat translation compatibility release adds only an empty
`GOOGLE_TRANSLATE_API_KEY` and the existing `5000` daily-character default.
Before its first rollout, install the reviewed regional `release.py` and Compose
file with protected backups, preserving ownership, permissions, `.env`, and every
running container. Existing translation settings must remain exact; this does
not activate translation. The normal workflow still owns the warning, final
save, backup, and replacement.

## Player catalog changes

The release manifest records the independent `PLAYER_CATALOG_VERSION` from
`scripts/build-release.mjs`. Version 10 adds story quest inventory items, including
the Heatproof tonic, that older realms reject as unknown carried items. It also
keeps new story progress and Atlas travel state on compatible writers. All three
old writers must stop before the new quest rewards become available. Version 9 updates the spell and talent catalogs and
migrates saved talents from version 6 to 7. Older realms reject version-7 talent
records and new spell IDs such as Revivify, so every old writer must stop before
the new migration runs. Version 8 added persistent item locks; older realms preserve
that saved field but do not enforce it. Version 7 added new pet IDs and the Common
pet-loot setting while preserving version-6 talent builds.
The deployed manifests before this field was introduced are version 4. A version
increase automatically selects a coordinated release: EU, US and Asia each give
their normal five-minute warning and complete their final save before **any**
candidate writer starts. EU keeps admission closed; US and Asia exit zero with
restart disabled. This creates a brief interval when all three realms are closed.
Releases with the same catalog version retain the normal rolling sequence.

Both regional helpers persist the identical three-realm authorization before EU
promotion. It binds the checked revision, immutable image, target catalog version,
old writer identities and final-save holds. The helpers recheck their candidate,
configuration, backup and stopped writer before accepting the authorization.
EU then starts and passes public verification before US and Asia start. The usual
release, health, configuration, asset and WebSocket checks still cover all realms.

Retry an interrupted run at the same checked revision. A partial drain is retained
even if a newer main commit appears. Once EU has started, both saved regional
authorizations must still agree; missing or changed proofs stop the retry. Normal
host deployment cannot bypass this barrier, and catalog downgrades are rejected.
Keep the per-image records and backups intact. Catalog, Gold, Apple, Turnkey and arena activation
must use separate releases.

Before the first versioned release, update only the existing root-owned
`/usr/local/lib/mossvale-release/release.py` and `ci-release.py` files on both
regional hosts, preserving their directory permissions, executable permissions
and protected copies of the previous files. This helper installation does not
replace, stop or restart a game. The production workflow remains the deployment
route; its forced-command gateway gains only the scoped catalog actions.

Future persisted catalog changes, including pet or spell IDs that old servers
cannot read, require an explicit compatibility review and coordinated catalog
version increase. Adding an ID alone does not trigger this barrier. Do not revert
to a release that cannot read the current shared player records.

## First MOSS arena activation

Arena wagers use two normal workflow releases. First deploy all compatible player
readers with `MOSSVALE_ACTIVATE_ARENA` unset or `false` and all three arena runtime
settings empty. This release's talent/catalog version 6 selects the existing
all-writer barrier, covering talent migration, raid/specialist progress, arena
ratings and saved wager records. Verify all three realms before activation;
never resume a version-5 writer against version-6 player records.

Prepare the reviewed `release.py` and `ci-release.py` on US and Asia, preserving
their root ownership, permissions and protected previous copies. Prepare the
reviewed Compose file while leaving `.env` unchanged. The helper admits only the
three absent **empty** arena placeholders during compatibility; it still rejects
other environment or host-file drift. This preparation does not restart a game.
The compatibility process exposes `arenaHash: null` only through authenticated
`/api/deployment`; an older process refuses activation.

For a fresh second main revision, set repository variable
`MOSSVALE_ACTIVATE_ARENA=true`, variable `MOSS_ARENA_CONTRACT` to the reviewed
deployment, and private Actions secrets `MOSS_ARENA_AUTHORITY_KEY` and
`MOSS_ARENA_RPC_URL`. The RPC must be the private Robinhood mainnet Alchemy URL
`https://robinhood-mainnet.g.alchemy.com/v2/<API_KEY>`. Preserve the existing
`MOSSVALE_EU_BBA_APP_ID` and `MOSSVALE_BBA_API_TOKEN` (or existing `BBA_API_TOKEN`
fallback); the app identity stays pinned to the single-replica game on `production`.
Never paste the signing key or credential-bearing RPC URL into chat, source or logs.

Before player warnings, the workflow derives the authority from the key and
verifies the exact compiled arena runtime, chain 4663, MOSS token, fixed dev
recipient, existing treasury and 5% tax at a fresh canonical latest block. It
also verifies finalized MOSS history on the same RPC; the new arena deployment
need not already exist at the finalized head. Both regional candidates must
prove their installed arena compatibility and the same existing treasury.

After both regional preparations and backups, EU completes its five-minute
warning, final save and admission hold. Only then does the workflow PATCH exactly
the three arena settings. BBA immediately recreates the compatible old code;
verify the same revision, new process identity, exact private configuration
fingerprint and unchanged public configuration. That replacement receives a
second five-minute warning and final save before normal promotion. US and Asia
apply only those three `.env` settings atomically after their own final saves,
retaining private `environment.before-arena` backups and exact target hashes.

An uncertain BBA PATCH is reconciled through environment names and the exact
runtime fingerprint, never repeated blindly. Retry the same revision, image and
settings while preserving phase records. Partial settings, contract/key/RPC
rotation, a different treasury or unrelated configuration changes fail closed.
Disable the gate only after the same revision is verified on all three realms,
including assets, configuration, health, WebSockets and matching wiki. This path
does not deploy a contract or activate specialist NFT minting.

## Self-hosted Actions workers

All seven production jobs and both manual auth-image jobs use the repository-scoped
labels `[self-hosted, linux, x64, mossvale-ci]`. Two registered workers cap the
total number of jobs executing at once, including image builds and wiki/stats
publishing; the two-batch matrix also has `max-parallel: 2`. Jobs queue when all
workers are occupied. There is no GitHub-hosted fallback.

Each batch checks out, installs dependencies, and builds once. Only the batch
containing `store-release` fetches full history for patch-note comparisons against
the push base or pull-request merge base. The eleven suites keep separate named
steps and 15-minute timeouts; each batch has a 30-minute timeout. Suites run
sequentially per worker and continue after another suite fails, while that failure
still blocks the aggregate gate and deployment. A failed build or cancellation
prevents suite execution. Each test still owns its temporary servers/databases.
Retrying failed jobs reruns the failed batch; a successful batch is retained.

This removes nine repeated checkouts, dependency installations, and builds without
skipping tests or persisting workspaces between jobs. The initial grouping uses
838/840 seconds of suite time measured in run `35992263812`; compare actual batch
times after future changes before rebalancing.

Each worker runs in its own Ubuntu virtual machine with two virtual CPUs, 8 GiB
RAM, a 40 GiB disk, and its own checkout and Docker daemon. Provision the two
dedicated Proxmox VMs on `stockholm01` after checking available capacity. Together
they require four virtual CPUs, 16 GiB RAM, and 80 GiB disk space. Their disks must
use the dedicated `mossvale-ci` SSD storage, separate from the game's
`pve`/`local-lvm` physical disk. **The move of VMs 104 and 105 completed on
24 September 2026:** both main disks, guest filesystems, Docker and runner
services were verified, and both GitHub runners returned online. The tiny
cloud-init CD-ROM volumes remain on `local-lvm`. Original main disks are retained
for rollback. Validation under real CI load and player experience remains a
separate check.
See [runner storage and I/O limits](runner/README.md#dedicated-runner-ssd) for
the exact device, protected configuration backups and bounded move procedure.
Keep each runner's 20 MiB/s / 1,000 IOPS disk limits and existing CPU limits;
separate VM disks alone did not prevent shared-SSD contention. This storage
change does not alter workflow routing, tests or game release guards.

The guests need Git, Python 3,
OpenSSH, Node.js (installed by `setup-node`), and working Docker/Buildx. Integration
checks create temporary PostgreSQL containers with ports published to the VM's
`127.0.0.1`. VM images contain no production Docker socket, host disk mounts, or
game host credentials. Deployment jobs receive their existing scoped Actions
secrets at runtime and remove the temporary deployment key files afterward.

Keep this repository private and its **Run workflows from fork pull requests**
setting disabled. The batch job additionally rejects fork pull requests; the
aggregate `checks` status refuses skipped checks. A workflow-file guard cannot
replace the repository setting because a fork can propose changes to that file.
Review external contributions before moving them onto a trusted repository branch
for the full checks. Auth image builds remain manual, with deployment controlled
by the existing dispatch input and production concurrency lock.

Execution uses the locally hosted workers and does not consume GitHub-hosted
runner minutes. GitHub still stores workflow artifacts and caches; storage usage
remains subject to the account's allowances and charges. Retention stays at 14 days
for release manifests and 30 days for deployment evidence. See
[GitHub Actions billing](https://docs.github.com/en/actions/concepts/billing-and-usage).

Keep workers online before switching workflows to these labels, and verify a full
two-batch run covering all eleven suites plus the normal release evidence after
migration. Register each VM only to `trappyon/mossvale` with the `mossvale-ci` label; never copy a personal
GitHub token or production environment into the VM image or cloud-init data.
Migration does not change the five-minute warning, final-save, backup, or
three-realm verification sequence.

## Auction Sold history upgrade

Deploy `fix/auction-history-compat` through the normal main workflow and verify
all three realms before merging `fix/auction-recovery-sales`. The compatibility
commit fixes wallet retries and teaches every realm to preserve and hide the new
private history field; the second release starts recording and displaying sales.
Do not push both releases together: a newer main revision can supersede the first
run. Older realms can otherwise overwrite history or include it in player snapshots.

## Referral program activation

This section records the initial burn-share referral rollout. The subsequent five-tier replacement follows the staged procedure at the end of this document.

Release referral schema compatibility with the program disabled, and verify EU,
US and Asia before shipping activation. Older releases reject the new private
account fields; enabling them during the first sequential rollout would break
realms still running older code. The compatibility release preserves existing
referral data but adds no new referral fields to old account rows and records no
new gameplay progress or referral quotes.

The activation release pins referral settlement
`0xb13ab13df2d0ab0f740cf11d882680501150c652` in `src/auction-chain.mjs`.
Configuring that address or either known prior MOSS auction address routes new
reservations to it. Both previous contracts remain independently verified routes
for their original signed payments and withdrawals; an outstanding order is
never re-signed against the new contract. See the exact addresses and validation
requirements in [`contracts/README.md`](../contracts/README.md).

When `REFERRALS_ENABLED` is absent, the activation release enables the program
only for this known configured production route. An explicit
`REFERRALS_ENABLED=0` pauses new referral activity. Existing production auction
settings select the pinned route, so this activation requires no environment or
host Compose changes. Before pushing activation, verify the new contract's
finalized runtime, token, signing authority, treasury and dev recipient, and
finish verifying the compatibility release on all three realms.

Deploy activation only through `.github/workflows/production.yml` on `main`,
preserving each realm's player warning and final save. Do not restart hosts or
game containers manually. After the workflow completes, read `/api/health` on
EU, US and Asia and verify `referrals.programEnabled` and
`mossAuction.referralsEnabled` are true, `mossAuction.contract` is the referral
address, and `mossAuction.previousContracts` contains both verified prior
addresses. These public booleans expose no account data and require no new game
sign-in. Complete the usual release, health, configuration, asset and WebSocket
checks. Confirm the published wiki
matches that revision. Invite binding, qualification and new rewards remain
unavailable on a realm while its program gate is off; the panel says so.

Once activated, rollbacks must retain referral schema support. Turning the gate
off pauses new referral activity, preserves existing account data, and still
honors previously signed settlement terms and their frozen spending credit.
Qualification and collection rewards resume when enabled. Never start a
pre-referral reader or writer against the shared database after activation.

## Gold economy activation

Gold has a separate database economy version. The compatibility release supports
version 1 but keeps version 0 prices, rewards and auctions until the coordinated
migration commits. Deploy it normally and verify all three realms before activation.
The wiki receives the verified database version from the deployment job, so its
catalogs retain old prices during compatibility and publish the new prices at activation.

Before activation, install the reviewed `release.py` and `ci-release.py` using the
existing `install-ci.sh` and each host's existing deployment public key. This is
helper preparation only: preserve host configuration, environment, credentials,
player data and running containers. The forced command permits only the enumerated
economy phases on the exact staged immutable image. Run `npm run check:gold` and
`npm run check:deployment` before installing it.

Activate on a **fresh main revision after the compatibility release** with
`MOSSVALE_ACTIVATE_GOLD_ECONOMY=true` or the workflow dispatch input
`activate_gold_economy`. A dispatch against the already running revision refuses
before warning players. Keep Apple activation disabled for this release.

The workflow stages both Docker realms, checks all three compatibility capabilities,
and arms database maintenance. Existing permanent writer connections may finish the
five-minute warning and final save; new connections cannot claim accounts or write.
EU closes gameplay, timers, sockets and its permanent database writer; only its
irreversibly drained management HTTP process remains for BBA replacement. US and
Asia exit zero with their Docker restart policies held at `no`. The workflow rechecks
every exact process identity and final-save proof, then takes and validates a fresh
post-save database backup. A failure leaves maintenance held and never enables trading.

One transaction combines all character balances and pending proceeds per account,
protects up to 100 existing gold, burns `floor(9 * max(total - 100, 0) / 10)`, and
allocates retained gold proportionally with roster-order largest-remainder ties.
Administrative accounts use the same formula. It consumes included pending credits,
records exact per-account and aggregate evidence and reset burn events, advances
the economy version to 1, and leaves exchange creation disabled. The database
trigger rejects writers whose permanent connection started under the old epoch,
including cached compatibility processes. No item, listing or payment data is reset.

The workflow starts the compatible revision, verifies revision, health, configuration,
assets and WebSockets on all realms, then enables exchange creation in the shared
database. It waits for every realm to observe that gate before reporting completion.
The public statistics show 24-hour, 7-day and 30-day ordinary issuance and burns,
with administrative grants and the reset shown separately. Prices never auto-adjust.

Rerun the same workflow revision after an interrupted activation. Phase records and
immutable migration evidence resume replacement without applying another burn.
Do not change the target revision while the barrier is held. After success, unset
the activation variable. Rollbacks must retain economy-version support and migrated
balances; never restore a pre-reset database or start a pre-compatibility writer.
Retain the private backup and release evidence; the workflow report exposes only
aggregate reset totals, backup hashes and public verification.

## One-time activation

These steps are for a new installation. Do not repeat them on an activated deployment.

Keep repository variable `MOSSVALE_PRODUCTION_ENABLED` unset until all steps are
verified. Checks run while the deployment jobs remain disabled.

- Create a separate dedicated Ed25519 key for each Docker host. Install each
  **public** key on its host with
  `sudo ./deploy/ovh/install-ci.sh /path/to/deployment-key.pub`. The forced
  command permits only preparing or deploying `ghcr.io/trappyon/mossvale-game` by
  immutable digest. It provides no shell, forwarding, or upload access. Preserve
  the existing administrator keys. Store the credentials as GitHub Actions secrets:

  | Realm | Host | Private key secret | Verified host-key secret |
  | --- | --- | --- | --- |
  | US | `51.222.245.146` | `MOSSVALE_US_DEPLOY_KEY` | `MOSSVALE_US_KNOWN_HOSTS` |
  | Asia | `15.235.180.181` | `MOSSVALE_ASIA_DEPLOY_KEY` | `MOSSVALE_ASIA_KNOWN_HOSTS` |

  The host helper derives and verifies its realm from the existing Compose
  configuration. The key cannot choose a different realm or change its settings.
- Generate a separate 32-byte random hexadecimal `MOSSVALE_DEPLOY_TOKEN`. Set the
  same value in the GitHub Actions secret and, during the second EU step below,
  EU's private BBA environment. It only authorizes deployment status and draining;
  it is not a player, database, or wallet credential. US and Asia do not need
  this HTTP credential.
- Keep **main unchanged** while BBA still follows it. Publish the checked bootstrap
  revision on its review branch and create `production` from that tree with its
  `release-revision.txt` marker. Give the existing five-minute warning, prove the
  old EU process saved and exited zero while its supervisor cannot restart it,
  then retire that pod. Make a **branch-only** native BBA settings update to
  **production**, with push auto-deploy on and pull-request auto-deploy off.
  Preserve the environment. BBA builds the bootstrap release; its deployment
  endpoint stays disabled until the token is installed.
- Verify that release, then perform a second supervised five-minute warning and
  final-save check. Keep desired replicas at one with the exited process's
  supervisor held, and make an **environment-only** native BBA settings update
  adding `MOSSVALE_DEPLOY_TOKEN`. BBA's Recreate rollout replaces that stopped
  process with the same bootstrap code and the token. Do not combine the branch
  and environment changes after scaling to zero: the native environment update
  waits for a ready replica before it can dispatch the queued build. These two
  supervised retirements are needed only for bootstrap. Merge main after BBA
  follows production; leaving it on main bypasses CI and the final-save gate.
- Install the bootstrap release on EU and check its authenticated deployment
  status reports the bootstrap revision, a new instance, and `idle`. Verify both
  Docker hosts' forced-command access and private GHCR pull access. Keep the GitHub production
  environment free of required human approvals if fully automatic deploys are
  desired.
- Set `MOSSVALE_PRODUCTION_ENABLED=true`. Run the workflow once on main and verify
  its live EU, US, and Asia evidence before considering automation activated.
- Add repository Actions secret `MOSSVALE_WIKI_CLOUDFLARE_API_TOKEN` with access
  to publish the `mossvale-wiki` Worker and its custom domain in the wiki's
  Cloudflare account. This is separate from local Wrangler login and game
  deployment credentials. See [wiki publishing](../wiki/README.md#publish).
- Statistics publishing reuses that Cloudflare token when it can publish the
  `mossvale-stats` Worker and its custom domain. Otherwise set the separate
  `MOSSVALE_STATS_CLOUDFLARE_API_TOKEN` secret with those permissions. The stats
  job prefers the separate token. See [statistics publishing](../stats/README.md).

Use the repository's existing secret-management tools; never put the key or token
in a commit, command argument, log, public artifact or issue. Registry access uses
the job's short-lived package-read token and an automatically removed private
Docker configuration on each host.

## Store contract replacement for class changes

The $50 class-change credit requires the store contract that accepts `5000`
USD cents. Building the game does not deploy that contract. Deploy and verify
the compiled `MossvaleStore` separately. The first, compatibility-only rollout
(PR 39) goes through the normal workflow with no Compose or environment changes. Keep `STORE_CONTRACT`
on the existing boost/box contract (v2), and preserve `STORE_LEGACY_CONTRACT`
for the original contract (v1). Settlement accepts the configured current
address only with the exact v2 or new runtime; existing explicit legacy routes
remain pinned to their own runtime. New quotes and store availability require
the new runtime, so new purchases stay disabled on upgraded realms while old
orders continue settling. No `STORE_PREVIOUS_CONTRACT` setting is needed for
this first rollout.

Verify the compatible release on EU, US, and Asia before merging the activation
release. Older realms cannot validate the new class-change saved orders.
Activation is a second normal production-workflow rollout with unchanged host
files and environment. `src/store-chain.mjs` maps only the known configured v2
address `0x4d35c8Be28Fde974921a851627Ad785Ce2939cda` to the deployed v3 address
`0x745c8f5db2Ea7A4B1512437Bfd8654C3BF53B5b4` for new quotes and store status.
Confirm the v3 deployment transaction
`0xe87f0b06375cf21fc13d3900480b9372aad1a5351802deed5b1381098df83cd4`
is finalized and its runtime, signing authority and MOSS token match the
reviewed artifact before activation. Mined deployment alone is insufficient.

Saved v2 orders still use their original address and exact runtime; the explicit
v1 route and signing authority remain unchanged. Empty and other custom contract
settings are not remapped. During the activation rollout, a still-compatible
realm may defer settlement of a new v3 payment until that realm upgrades; its
save schema already accepts the order. Do not roll back to pre-compatibility
code or remove a settlement route while orders on that contract remain unresolved.
Verify store status reports v3, old pending-order recovery, and the release,
health, configuration, assets and WebSockets on all three realms before
reporting the class-change purchase live. No settings update or manual realm
restart is part of either game rollout.

## First Apple purchase activation

Apple activation uses this same production workflow. It is limited to
`APPLE_IAP_PRIVATE_KEY`, `APPLE_IAP_KEY_ID`, `APPLE_IAP_ISSUER_ID`, and
`MOBILE_PURCHASE_SANDBOX_ACCOUNTS`; it cannot edit database, identity, wallet,
Google, host, or other runtime settings. It does not create Apple keys, submit
products, or prove a real device purchase.

1. Deploy the activation-compatible code with repository variable
   `MOSSVALE_ACTIVATE_APPLE_IAP` unset or `false`. Verify EU's authenticated
   `/api/deployment` contains `appleIapHash: null`. This SHA-256 fingerprint
   is computed from an ordered JSON array of exactly the four settings; it is
   never exposed in `/api/config`. An older EU binary blocks activation.
2. As supervised preparation, install the reviewed root-owned `release.py` and
   `ci-release.py` on US and Asia using `install-ci.sh` and their existing
   dedicated deployment public keys. This only updates the forced command; do
   not restart a game or change `.env` during preparation. The SSH request may
   carry exactly those four Apple settings; it still accepts no shell or
   general configuration edits.
3. Privately configure Actions secrets with those four exact names. The key must
   be a valid P-256 PKCS8 key. The sandbox list must contain 1–20 exact existing
   account hashes, including the App Review account. Configure
   `MOSSVALE_BBA_API_TOKEN` with `apps:read` and `apps:write`, and pin repository
   variable `MOSSVALE_EU_BBA_APP_ID` to the existing EU app UUID. The app must be a
   single-replica GitHub Node app following `trappyon/mossvale`'s `production`
   branch, with push deployments on and PR deployments off. Verify this identity
   before installing the token; no app is discovered or created automatically.
4. Coordinate the release hold with other game work. Set
   `MOSSVALE_ACTIVATE_APPLE_IAP=true`, then push a **fresh main revision** through
   the workflow. All secrets and helpers must be ready before that push. Initial
   activation requires all realms' Apple flags to be false and no Apple settings
   names on BBA. Existing credentials are never rotated by this path.
5. The workflow verifies both Docker candidates, credentials, and backups first.
   It drains EU with the full five-minute warning and confirmed final save, then
   makes an environment-only BBA PATCH. BBA replaces the old code immediately;
   the workflow verifies the same revision, new process identity, unchanged
   assets/configuration except the Apple flag, and exact settings fingerprint.
   That new process receives a **second five-minute warning and final-save
   check** before normal production-branch promotion.
6. US and Asia receive their usual warnings and successful shutdown checks.
   Only then does each helper atomically update `.env`, retaining a private
   `environment.before-apple-iap` beside its release record. Original and target
   configuration/environment hashes are checked, including on interrupted
   retries. Other host files and infrastructure must remain exact. Final public
   verification permits only `mobilePurchases.apple` to change. Disable the
   activation gate after all three realms, assets, WebSockets, and wiki pass.

If an environment PATCH response is lost, rerun the same main revision with the
same activation secrets and gate. The workflow polls BBA and trusts only the
authenticated runtime fingerprint matching all four requested values; it never
blindly repeats the PATCH. A different fingerprint, partial BBA settings, failed
settings operation, or unavailable compatibility endpoint stops the rollout for
private inspection. The same payload resumes Docker hosts already prepared or
partially completed; changing/removing it mid-release fails closed. Do not clear
settings or restore the database to retry. Retained old image/environment files
are recovery evidence, not permission to restart an old writer or discard paid
receipts. Code rollbacks still use the normal workflow and retain active payment
credentials and shared financial state.

After deployment, complete the [signed-device checklist](../docs/mobile-purchases.md#signed-device-acceptance-checklist).
Configured Apple flags prove server configuration only; catalog approval,
sandbox payment/recovery/refund checks and App Review remain separate.

## Failure and recovery

If only the wiki job fails, the verified game rollout remains complete. Correct
the wiki problem or missing Cloudflare secret and rerun only that failed job;
wiki publication cannot restart the game. Its live-revision guard blocks an old
job from replacing the wiki after a newer game release.

The same rule applies to the independent stats job: fix its Cloudflare access or
publication failure and rerun only that job. Stats publication cannot restart
the game. The realm revision guard prevents a superseded job from publishing.

Rerun the same main revision after reviewing its failed phase. A newer push does
not prevent this recovery when EU already started or completed that revision.
Unstarted obsolete runs are skipped. Repeated EU drain
requests keep the original deadline. A changed process, competing target, failed
save, changed host configuration, or failed backup blocks promotion. Interrupted
Docker deployment resumes from its saved evidence without inferring a successful
save. An uncertain production-branch promotion is recovered without queueing a
second identical build.

If EU's build fails, US and Asia stay on their old images; inspect BBA's native
build and rollback status. If a Docker host fails after EU succeeds, inspect that
host's private release record before retrying. The other host may have completed;
the same revision's retry preserves that result. Restore service with a reviewed compatible image; never
restore an older shared database simply to undo a code deployment.

Automatic releases must preserve compatibility between adjacent game versions.
Storage-contract/schema changes, host Compose/Caddy changes, runtime base-image
upgrades, and deployment-helper changes require supervised preparation before
the game release runs through GitHub Actions. If an incident prevents that route
from restoring service, use the [emergency host procedure](ovh/README.md#emergency-host-recovery)
only with the user's explicit authorization for emergency recovery.
The host helper deliberately refuses host-file or runtime-environment drift.
NFT minting, auction opening, and other wallet transactions remain separate from
application deployment.

Local checks: `npm run check:performance`, `npm run check:deployment`,
`npm run check:updates`, and `npm run build`. An image built for initial setup or
emergency recovery must pass the exact checked revision:
`docker build --build-arg MOSSVALE_REVISION="$(git rev-parse HEAD)" -f deploy/ovh/Dockerfile .`


### Five-tier referral deployment rollout

The five-tier contract `0x930f178ca4818a2ae2e97b96f3574f22e509a520` uses the reviewed `MossvaleTokenAuction.json` artifact, creation block `73835683` and the existing authority/treasury. Its server status is `feeVersion: 2`. The total seller fee stays 5%: treasury and dev team each receive 1.25% of trade volume, with 2.5% for burning before referral rewards. Counts 1/10/25/50/100 award 0.10%/0.25%/0.50%/0.75%/1.00% of purchase volume, reducing only burning.

Follow [staged contract activation](../contracts/README.md#five-tier-deployment-and-staged-activation). First deploy compatibility revision `904d8944de21fc7ac0be5f5f022a773370d3ed59` and verify every realm recognizes all four contracts while the previous referral contract remains active. Require finalized on-chain creation/runtime/identity proof. Then deploy the separate revision that moves the five-tier contract first in the registry. Preserve all three older entries, original signed orders and withdrawal addresses.

The existing `MOSS_AUCTION_CONTRACT` setting already selects this recognized registry; keep realm environment files and signing keys unchanged. Both stages use `production.yml`, player warnings, final saves and live verification. After activation require the new address and `feeVersion: 2` on every realm, the three previous recovery targets, preserved configuration and matching wiki/statistics. Rollbacks must retain the four-contract compatibility revision or newer; never restore a writer that cannot recognize new saved orders.
