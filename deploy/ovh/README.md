# Regional game hosts

Normal game releases use only the [Mossvale production GitHub Actions workflow](../PRODUCTION.md).
Push or merge to `main`, or run that workflow on `main`; it handles all three
realms' countdowns, saves, backups, deployment, and verification. The host commands
below are for initial infrastructure setup and emergency recovery.

The installed release helper supports `warn` and `cancel-warning` for normal
releases. `prepare` advertises `warningVersion: 1` only when the live game also
supports held warnings. A held five-minute notice keeps the game running until
the workflow commits deployment after EU verification; the commit waits only
the remaining warning time. Older servers retain the original full countdown.
Apple configuration and economy activations use their existing separate paths.

Versioned player catalog changes use the workflow's
[coordinated three-realm stop](../PRODUCTION.md#player-catalog-changes).
The forced-command helper supports only `catalog-drain`, `catalog-status`,
`catalog-authorize` and `catalog-start` for this path. It preserves the same
warning, final-save, restart protection, backup and candidate checks. Both
regional records must contain the same exact three-realm authorization before EU
promotion, and normal `deploy` cannot resume a catalog release. Preserve those
records when retrying the same checked revision; no host command replaces the
normal production workflow.

Warning ownership is recorded under the host's global release lock before any
signal, then bound to the acknowledged notice ID and exact container start.
Retries preserve that notice; another candidate may replace an uncommitted
notice with a fresh five minutes. Cancellation never stops the game and cannot
cancel a committed or another candidate's notice. Keep `warning-owner.json`
alongside the per-image release records when investigating an interrupted run.
Fallback deployment refuses another candidate's held notice before disabling
restart protection or sending the shutdown signal.
Restart protection remains enabled until commit, and replacement still requires
the original writer's zero exit, final-save observation, verified backup, and
at least five minutes since its acknowledged warning.

This Compose stack defaults to the existing OVH North America deployment. `REALM_ID` selects the game realm and Compose project/image name (`us` by default); `REALM_HOST` selects the public hostname, with the existing `US_HOST` setting retained as a fallback. Existing US project names, volumes and lifecycle behavior stay unchanged. Use a separate physical regional host for Asia; creating another process in Europe does not reduce Asia gameplay latency.

One Node process and Caddy serve `us.mossvale.world`. Players use the same account and six-character roster in Europe and North America, choosing a region whenever they enter the world. Character progress and the auction house are shared. Chat, parties, direct player trades and world simulation stay in the selected region. An account can play in only one region at a time.

Both game processes use the **existing canonical EU PostgreSQL database**, including `mossvale_players`. A dedicated database connection owns account advisory locks; every character save uses that connection. Region switches save and release ownership before the next region reloads progress. Shared auction/social updates use transactional compare-and-set checks; remote sale proceeds are pending credits until the owning process saves them. A lost database connection permanently closes that process's store; restarting creates a fresh connection and reloads state.

The originally provisioned local PostgreSQL volume is retained under the optional `local-storage` profile. It is not selected automatically and is not the shared game's backup source. Do not replace the canonical EU database with this empty database. A later move of the canonical database needs a coordinated migration with every game writer stopped.

Run `node deploy/ovh/check.mjs` for Compose, systemd and backup failure checks; it needs Docker Compose but starts no services. `node scripts/check-player-store.mjs` and `node scripts/check-shared-realms-server.mjs` test real PostgreSQL ownership and cross-region gameplay with disposable local databases.

## Add the Asia host

The target hostname is `asia.mossvale.world`. This repository does not provision or activate it. Keep `REALM_ASIA_ORIGIN` blank on existing realms until the Asia host has passed the checks below.

1. Provision a host physically in Asia and follow steps 1–4 under **Prepare the host and shared connection** below, using these Asia values before building. Use the same `/opt/mossvale/deploy/ovh` directory and Compose files. In its private `.env`, set:

   ```dotenv
   REALM_ID=asia
   REALM_HOST=asia.mossvale.world
   REALM_EU_ORIGIN=https://mossvale.world
   REALM_US_ORIGIN=https://us.mossvale.world
   REALM_ASIA_ORIGIN=https://asia.mossvale.world
   GAME_ALLOWED_ORIGINS=https://mossvale.world
   ```

   Securely configure the same canonical database URL/trusted CA, Keycloak account issuer and enabled integrations as the running realms. Do not start or copy the optional local PostgreSQL database. The shared database and sign-in remain in Europe, so account/global operations still make that network trip; gameplay simulation and WebSockets run on the Asia host.
2. Publish the DNS-only `asia.mossvale.world` A record to this host and allow Caddy to obtain trusted HTTPS. Keep traffic direct to the Asia host; the Stockholm Tunnel is for the existing EU entrypoint. Preserve existing DNS records. Add Asia's exact origin, `/` and `/account.html` redirects and post-logout redirects to the existing Keycloak browser client before offering direct Asia sign-in; the `clients` phase of `scripts/configure-social-sso.mjs` preserves existing entries.
3. After validation and build, install the existing lifecycle unit under the Asia service name on this new host:

   ```sh
   sudo install -m 0644 mossvale-us.service /etc/systemd/system/mossvale-asia.service
   sudo systemd-analyze verify /etc/systemd/system/mossvale-asia.service
   sudo systemctl daemon-reload
   sudo systemctl enable --now mossvale-asia.service
   ```

   Keep one game process per realm. The reused unit reads this host's `.env`, so its Compose project is `mossvale-asia`; do not change `REALM_ID` on the existing US host.
4. Verify `/api/health` and `/api/config` report `realmId: "asia"` and matching public authentication. Verify trusted `wss://asia.mossvale.world/socket` from the canonical browser origin with a valid JWT, rejection of invalid JWTs and foreign origins, and character progress after an Asia game restart. Confirm mobile callback/association files are served if direct Asia mobile sign-in is enabled.
5. Build the Asia-capable release for existing realms, set `REALM_ASIA_ORIGIN=https://asia.mossvale.world` on EU and US, then perform their normal five-minute warning, successful final save, backup and replacement. Every realm must publish all configured origins so roster switching and cross-origin API/WebSocket admission work. Do not alter the canonical database or account namespace.
6. From the live roster, enter Asia with a designated test character, leave and enter EU/US, then confirm the same saved progress and rejection of overlapping account ownership. Check cross-region auction delivery exactly once and measure actual gameplay WebSocket latency from an Asia location before declaring the latency improvement verified.

For Asia emergency recovery use the procedure below with image `mossvale-asia:local`, rollback image `mossvale-asia:previous`, service `mossvale-asia.service`, and health URL `https://asia.mossvale.world/api/health`. The canonical backup script is already shared. A schema/storage-contract change still requires coordinated shutdown of every realm.

## Prepare the host and shared connection

1. Install a supported Ubuntu LTS with SSH keys and mirrored disks. Verify the IP, OS, SSH identity, storage and recovery console before changes. Install Docker Engine and Compose using [Docker's Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/).
2. Permit administrator SSH and public TCP 80/443 plus UDP 443. Only Caddy publishes container ports. PostgreSQL and game port 2567 remain private; [Docker-published ports can bypass UFW](https://docs.docker.com/engine/network/packet-filtering-firewalls/#docker-and-ufw).
3. Copy the reviewed repository to `/opt/mossvale`. Create a private `.env` only if absent:

   ```sh
   cd /opt/mossvale/deploy/ovh
   (umask 077; set -C; cat .env.example > .env)
   ```

   Use a secure editor or secret delivery process to set `DATABASE_URL` to the existing canonical EU database and `DATABASE_CA_BASE64` to its trusted PEM CA, encoded as base64. Preserve existing secret values when updating a provisioned host. Never print `.env` or rendered Compose configuration. The URL must be reachable from OVH; an EU private service hostname alone is insufficient. Arrange a private route or approved TLS endpoint and verify its certificate hostname and CA. Do not disable certificate verification to bypass a routing or hostname problem. `DATABASE_URL` is mandatory; missing configuration blocks startup.

   Recheck the public Keycloak settings against `https://mossvale.world/api/config`. Keep the same issuer, realm, browser client and any `KEYCLOAK_ACCOUNT_ISSUER` override so existing account keys stay unchanged. For crypto auctions, securely copy the same active chain IDs, RPC configuration, deployed contracts and signing authority used by EU. These credentials belong only in private environment configuration. Both regions must verify and settle the same escrow orders; do not deploy independent auction contracts. Empty crypto configuration disables that region's settlement, so configure and verify it before offering cross-region crypto delivery.

   For pet NFTs and house deeds, follow [the NFT setup guide](../../contracts/NFTS.md) and set the same `NFT_PETS_CONTRACT`, `NFT_HOUSES_CONTRACT`, `NFT_FEE_RECEIVER`, and server-only `NFT_AUTHORITY_KEY` in EU, US and Asia. `NFT_RPC_URL` is an optional Robinhood RPC override. Compose passes these only to the game process; keep them blank until both collections and their shared receiver are ready. The eight new pet NFTs (asset IDs 9–16) use an optional separate `NFT_NEW_PETS_CONTRACT`; prepare it with the guide's `--new-pets` mode and preserve all existing contract addresses and the authority key. Publish the built `public/nfts/` metadata and artwork with the game release before the first mint. Configuring the realms does not open the four-hour house auctions; that requires the separate owner transaction in the setup guide.
4. Validate and build without starting a game writer. Set `release_commit` to the full tested Git commit being packaged:

   ```sh
   docker compose config --quiet
   docker compose build --pull --build-arg MOSSVALE_REVISION="$release_commit" game
   docker compose --profile maintenance pull database-tools
   ```

   The PostgreSQL client image is version 17. Match it to the canonical server major version before backing up a newer server; an older `pg_dump` cannot dump a newer server.
5. Point the DNS-only `us.mossvale.world` A record to OVH. Add AAAA only after IPv6 routing and firewall verification. Install the lifecycle unit without starting it yet:

   ```sh
   sudo install -m 0644 mossvale-us.service /etc/systemd/system/mossvale-us.service
   sudo systemd-analyze verify /etc/systemd/system/mossvale-us.service
   sudo systemctl daemon-reload
   sudo systemctl enable mossvale-us.service
   ```

   The active oneshot unit orders Compose before Docker shutdown and daemon restarts, allowing five minutes for Caddy and the game to stop. The remote canonical database must remain available until every region's final save completes. The optional local PostgreSQL service is managed separately. [Caddy obtains TLS automatically](https://caddyserver.com/docs/automatic-https) and [proxies WebSockets](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

## Coordinated first activation

**Do not run old and new writers together.** The old game uses cached unconditional UPSERTs and does not honor account locks. A rolling upgrade from that version can overwrite shared progress.

1. Stage the shared-store revision for both regions and configure both to the same canonical database. Set EU `REALM_ID=eu`, `REALM_EU_ORIGIN=https://mossvale.world` and `REALM_US_ORIGIN=https://us.mossvale.world`; US uses `REALM_ID=us`. Preserve other EU environment values. Keep the old US local-database game stopped as well.
2. Give players the five-minute shutdown warning, prevent automatic restart of the old images, and wait for every old game process to exit successfully after its final save. Confirm no old replica remains. Keep the database online. Take and validate a canonical backup with `./backup.sh` before proceeding.
3. Start the upgraded EU game and then `sudo systemctl start mossvale-us.service`. Check both health endpoints and `/api/config`: they must report their own region and matching authentication. Do not enable the regional choice until both servers are healthy and direct authenticated WebSockets have been verified.
4. From `https://mossvale.world`, sign in using a test account and verify its existing six-slot roster. Enter EU, change progress, leave to the roster, enter North America, and confirm that same character and progress. Confirm an overlapping second login receives the account-busy response. Test a global gold listing with a seller active in the other region; proceeds and the item must arrive exactly once. Verify configured crypto delivery separately.
5. Verify trusted HTTPS and direct `wss://us.mossvale.world/socket` from the EU browser origin. A valid JWT must work; invalid JWTs and unconfigured browser origins must fail. Configured origins provide exact CORS/WebSocket admission, with JWT signature, issuer and client verification still required. Normal sign-in stays on the EU site. Direct sign-in on the US origin additionally requires that exact origin and redirect URIs registered on the existing Keycloak client.
6. Verify character progress after game-container restart and host reboot. Preserve the old local US volume until its contents and backup are reviewed; stop its unused service with `docker compose --profile local-storage stop postgres`. Never delete a volume as part of this cutover.

## Updates and rollback

Use [GitHub Actions](../PRODUCTION.md) for updates and code rollbacks on every
realm. A code rollback is a revert on `main`, followed by the normal workflow.

### Emergency host recovery

The Caddy configuration serves `public/realm-restarting.html` when an HTML entry
request fails during a restart. Deploy its read-only page mount and Caddy
configuration before stopping the game. Check this path with
`node scripts/check-restart-proxy.mjs` (requires Docker).

Use this supervised procedure only when an incident prevents the workflow from
restoring service and the user explicitly authorizes emergency recovery. Set
`release_commit` to the tested compatible source commit, build before warning
players, and save the current image as `mossvale-us:previous`. Run from
`/opt/mossvale/deploy/ovh`:

```sh
set -e
docker image tag mossvale-us:local mossvale-us:previous
docker compose build --pull --build-arg MOSSVALE_REVISION="$release_commit" game
game_container=$(docker compose ps -q game)
docker update --restart=no "$game_container" >/dev/null
docker kill --signal=USR2 "$game_container" >/dev/null
test "$(docker wait "$game_container")" = 0
./backup.sh
docker compose up -d --no-deps --wait game
curl --fail https://us.mossvale.world/api/health
```

`SIGUSR2` gives the five-minute countdown, saves and exits. Disabling automatic restart prevents the old image from reopening. Do not continue after a failed shutdown or backup. The two-minute Compose grace period handles immediate SIGTERM, separately from the countdown. Never force-kill a saving game. Keep one process per region. A schema or storage-contract change requires coordinated downtime for all regions.

Rollback only to a version that understands the shared store, pending credits and ownership locks. Never restart an old unconditional-UPSERT version against the shared database. For a compatible rollback, follow the same warning and stop procedure, retag `mossvale-us:previous` as `mossvale-us:local`, then start the game with `--no-build`. Do not restore an old database merely to undo an image update; that loses progress from every region.

## Canonical backups and restore

`./backup.sh` runs a temporary PostgreSQL client using the game's canonical database URL and trusted CA. It validates each custom-format archive before publishing it in `/var/backups/mossvale-shared` and retains at least 14 days locally. It does not dump the optional unused local database. Run one successful backup and review the archive before changing the existing backup schedule. A daily root cron entry is:

```cron
15 4 * * * /opt/mossvale/deploy/ovh/backup.sh >> /var/log/mossvale-us-backup.log 2>&1
```

Protect the log and backup directory, copy complete archives to a secured off-host destination, and configure failure notifications. Preserve earlier `/var/backups/mossvale-us` archives separately; the new script does not expire those files. Local archives and mirrored disks cannot protect against losing the host. Store a protected copy of `.env` separately. Provider backups for the canonical EU database remain necessary until a complete restore has been verified.

Restore-test only into a new scratch database. The optional local service can host it after its existing password is securely configured:

```sh
docker compose --profile local-storage up -d --wait postgres
docker compose exec -T postgres createdb -U mossvale mossvale_restore_check </dev/null
docker compose exec -T postgres pg_restore -U mossvale -d mossvale_restore_check --exit-on-error --no-owner --no-acl < /var/backups/mossvale-shared/CHOSEN.dump
docker compose exec -T postgres psql -U mossvale -d mossvale_restore_check -c 'SELECT count(*) FROM mossvale_players;' </dev/null
docker compose exec -T postgres psql -U mossvale -d mossvale_restore_check -c 'SELECT pending_credits FROM mossvale_players WHERE pending_credits <> $$ {} $$::jsonb;' </dev/null
docker compose exec -T postgres dropdb -U mossvale mossvale_restore_check </dev/null
```

The archive must include `pending_credits` as well as character states: unconsumed auction proceeds are durable money. For actual recovery, stop **all** regions after their final save, take a current backup, restore into a new canonical database and validate account rows, auction escrow and pending credits. Update every region's URL together and retain the previous database until signed-in progress is verified. Restoring while any authoritative game process runs can overwrite the recovery. Do not merge dumps from independently active regional databases.

Never use `docker compose down --volumes` on a live installation. Major PostgreSQL upgrades require tested migration and restore procedures. Docker logs use the rotating `local` driver. Apply OS and image updates with the player countdown and verify the systemd unit remains enabled and active afterward.
