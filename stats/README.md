# Mossvale statistics

The public dashboard at **https://stats.mossvale.world/** runs on the independent
`mossvale-stats` Cloudflare Worker. It serves static assets, proxies the
game's public aggregate statistics endpoint, and reads public treasury contract state. The Worker needs no database,
Keycloak, wallet, or player credentials.

## Build and verify

```sh
npm run check:stats
npx wrangler@4.131.1 deploy --dry-run --config stats/wrangler.jsonc
```

`check:stats` builds the dashboard and checks the statistics implementation.
Player history starts when collection is enabled; earlier hours are unavailable.
Seven-day and longer concurrency charts use the available complete three-realm
samples even when an hour is partial. Long all-time buckets weight hourly averages
by sample count. Dashed chart segments and the inspection readout mark partial
coverage; buckets without any readings stay null. No stored samples, peaks or
hourly unique-account totals are interpolated.
Registration counts come from the existing server-only Keycloak service client
described in [account deletion setup](../docs/account-deletion.md). The client
must be able to count every user in the Mossvale realm. A missing or unavailable
identity service must remain visible as unavailable, rather than showing the
number of saved game profiles as registered users.

MOSS spent is the gross total of finalized `Purchased` events from the MOSS
Auction House settlement contract. It includes seller proceeds and excludes
gold trades, ETH trades, store purchases, and house-deed auctions. The current
contract, `0xD4806C0a34d274c029a38D7126D8a23a1d79c4dc`, was created at Robinhood
Chain block **61,382,153** on September 12, 2026. Its creation transaction is
[`0x2c53…7fc1`](https://robinhoodchain.blockscout.com/tx/0x2c53b4cb1c44ba3fedfbfcee244369932c14b9c0c84e96f89ec04b1d48617fc1).

Voucher payouts sum the finalized `totalPaid` counters from the current and
two older treasury contracts listed in `stats/treasury.mjs`. Owner withdrawals
do not change those counters. The vault balance is the MOSS `balanceOf` the
active treasury at the latest canonical block, including funds reserved for
issued vouchers. Contract identity, token and chain are checked before figures
are displayed. Reads share a short cache; unavailable or stale figures are
labelled and never replaced with zero.

## Publish

Game releases and collector changes go through `.github/workflows/production.yml`
on `main`. The workflow checks statistics before deployment, preserves each
realm's five-minute player warning and final save, and publishes stats only
after EU, US, and Asia have been verified at the expected revision.

The stats job uses `MOSSVALE_STATS_CLOUDFLARE_API_TOKEN` when configured and
otherwise uses `MOSSVALE_WIKI_CLOUDFLARE_API_TOKEN`. The selected token must be
authorized to publish `mossvale-stats` and its custom domain in the account in
`stats/wrangler.jsonc`. Local Wrangler authentication does not configure CI.
Custom-domain deployment creates the DNS record and certificate. Do not use
`cloudflare/wrangler.jsonc`; that is the retired game proxy configuration.

If only the stats job fails, fix the reported problem and rerun only that job.
Publishing stats cannot restart a game realm. Dashboard-only changes can be
published independently after checks, from their committed source revision.
Merge those changes into `main` before publishing independently; the next game
release republishes stats from `main` and overwrites any branch-only changes.
Wait for any active production run to finish publishing stats first. Record the
verified full game revision in `GAME_REVISION`, then run:

```sh
npm run check:stats
node wiki/verify-live.mjs "$GAME_REVISION" --realms-only
npx wrangler@4.131.1 deploy --dry-run --config stats/wrangler.jsonc
npx wrangler@4.131.1 deploy --config stats/wrangler.jsonc
node stats/verify-live.mjs "$(git rev-parse HEAD)" "$GAME_REVISION"
```

The live check accepts a separate game revision for dashboard-only releases;
the production workflow defaults both revisions to the same commit. It verifies the expected revision on every realm, dashboard assets,
the public statistics response, and unknown-route handling. Also inspect the
dashboard in desktop and narrow mobile viewports after publishing.

## Gold economy

The game’s public statistics payload includes `economy.supply` and `economy.windows`
for 1, 7 and 30 days. Gold totals are decimal strings to preserve exact aggregate
values. Supply includes character wallets, pending credits and exchange escrow.
Reason-tagged events commit with their player mutations; ordinary flows exclude
`admin:` grants and the `reset` migration. The sink/source ratio is null when no
gold was created in the window. Missing tables or unavailable reads report
`status: unavailable`, never a fabricated zero. The public endpoint exposes no
account or character identifiers.

## Player countries

`countries` reports unique accounts observed in the world in the trailing 24 hours,
7 days, or 30 days. The chart range selects this window; **All time** uses **30 days**
for countries. Each account is counted once across characters and realms and is
assigned its latest observed connection country, including Unknown. This is network
location, not nationality, language or realm selection. VPNs can affect it.
`trackingSince`, `since`, `until`, `total`, `known`, and `unknown` make the observed
window and country coverage explicit; missing historical activity is never invented.
Counts measure observed play, not registrations. Collector or realm downtime can
undercount activity; known-country coverage does not measure collection uptime.

The existing independent analytics pool stores only an HMAC account token, a country
code (or null) and last activity time. Its hourly cleanup removes tokens after 31
inactive days. Accepted account-deletion requests remove country records on the
next successful analytics refresh (normally within 15 seconds). The collector checks
the existing durable deletion fence, retries cleanup after outages, and rejects late
observations for deleted accounts. Account deletion never waits for analytics;
historical hourly aggregate activity remains. No raw IPs are logged or stored by this collector, and no external
geolocation requests are sent. Lookup uses the IPv4/IPv6 database bundled with the
pinned `geoip-country` dependency. This product includes GeoLite2 data created by
[MaxMind](https://www.maxmind.com/), distributed under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Update the pinned npm
package and lockfile to refresh the bundled data, then rerun checks and use the normal
release workflow; do not modify installed data at runtime.

### Required host preparation before release

US and Asia use DNS-only direct HTTPS. Stage the revised `deploy/ovh/Caddyfile`
on both hosts while preserving their existing Compose files and private environment.
Caddy overwrites `X-Mossvale-Client-IP` with its actual socket peer. The game trusts
the private Docker service `caddy` by default only for the existing `us` and `asia`
realm IDs; an explicit `STATS_COUNTRY_PROXY` overrides this default. Only a connection
from that service’s exact Docker DNS address may use the sanitized header.
Keep port 2567 private. Arbitrary forwarded-for and Cloudflare headers are ignored.
The production helper deliberately refuses a host-file digest mismatch, so complete
this configuration preparation before the normal warning/final-save release workflow.
Install the checked `deploy/ovh/release.py` into the existing root-owned
`/usr/local/lib/mossvale-release/release.py` on both hosts, retaining a private backup
and preserving the forced-command gateway and credentials. The workflow uses this
installed helper; it does not upload updated helper source. After verifying the old
game's five-minute warning and successful final save, the helper reloads the existing
Caddy container before starting its replacement. A failed reload leaves the game
stopped for a safe retry; preparation and completed-release retries never reload it.

EU uses Cloudflare Tunnel -> loopback Caddy -> BBA ingress. A private ingress address
alone does not authenticate Cloudflare headers. The game derives a dedicated country
key from its **existing** `MOSSVALE_DEPLOY_TOKEN` using
`HMAC-SHA256(hex-decoded deployment token, "mossvale:country:v1")`. This existing EU
credential is required by the normal production workflow (see
[deployment bootstrap](../deploy/PRODUCTION.md)). No BBA environment change or extra
game restart is required. An explicit `STATS_COUNTRY_SECRET` remains an override if
already configured; otherwise the derived key is used. Only the country key goes to
the edge, never the deployment credential. If that credential rotates, refresh the
edge's derived key too; a mismatch safely produces Unknown.

Stage the revised `cloudflare/Caddyfile` and `cloudflare/mossvale-proxy.service`.
Securely provision root-only `/etc/mossvale-edge/country.env` with
`STATS_COUNTRY_SECRET=<derived country key>`. For first-time provisioning, run this
on the edge host as root in a trusted administrative context where the existing
`MOSSVALE_DEPLOY_TOKEN` has been supplied privately through the existing secret
manager. It writes only the derived country key with mode 0600, prints neither
credential, and refuses to overwrite an existing file:

```sh
node --input-type=module <<'NODE'
import { createHmac } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const token = process.env.MOSSVALE_DEPLOY_TOKEN;
if (!/^[a-f0-9]{64}$/i.test(token || '')) throw Error('Existing deployment credential is required.');
const countryKey = createHmac('sha256', Buffer.from(token, 'hex')).update('mossvale:country:v1').digest('hex');
writeFileSync('/etc/mossvale-edge/country.env', `STATS_COUNTRY_SECRET=${countryKey}\n`, { mode: 0o600, flag: 'wx' });
NODE
```

The `/etc/mossvale-edge` directory must remain root-owned and private as in the
existing tunnel setup. If the EU game already has an explicit country override,
securely provision that country key instead. Never put either credential in source
control, command arguments, public configuration, logs or client code. The service
reads the environment file; Caddy replaces the country and authentication headers.
Enable Cloudflare IP geolocation and preserve the loopback-only dedicated tunnel
listener. Apply the prepared proxy during the realm’s workflow-controlled drained interval
if reloading would interrupt live WebSockets; deploy the game only through
production.yml. Until this preparation is complete, EU country data remains Unknown.
Neither a forged `CF-IPCountry` nor a direct BBA request can claim a trusted country.

Validate with `node scripts/check-player-country.mjs`,
`node scripts/check-restart-proxy.mjs`,
`node scripts/check-restart-proxy.mjs --tunnel`, and `npm run check:stats`.
After release, enter the world through each realm and inspect `/api/stats` country
coverage; a successful HTTP response alone does not verify country attribution.
