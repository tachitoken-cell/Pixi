# Free Tunnel migration

Live replacement for the request-limited `mossvale-edge` Worker (2026-09-13):

`mossvale.world` / `www.mossvale.world` → Cloudflare Tunnel →
`stockholm01` loopback Caddy `127.0.0.1:8087` → `192.168.0.148:80`
with BBA Host `00edc49e-6028-442d-9417-673a2251a662.bba.tools`.

The dedicated `mossvale` Tunnel is `d6e2d9a2-1b7e-43f1-a0d2-4a1dceb8ca91`
in Daniel's account `03328a697c28f28b1e4dea4e15b54471`.
It publishes only the game HTTP service;
no private-network routes, SSH, router ports, or paid plan are needed.
The existing BBA connector and game deployment stay in place. Keep the BBA
custom-domain field empty and retain the existing Keycloak issuer and APP_ORIGIN.

## Host preparation

Install the official Caddy release binary as `/opt/mossvale-edge/caddy`, copy
`cloudflare/Caddyfile` to `/opt/mossvale-edge/Caddyfile`, and copy the shared
`public/realm-restarting.html` to `/srv/mossvale/realm-restarting.html`.
The proxy check uses Caddy 2.11.4 (`node scripts/check-restart-proxy.mjs --tunnel`).
The host already has cloudflared 2026.3.0 with token-file support.

Install the two unit files in `/etc/systemd/system/`, validate the Caddy config
and units, and start only `mossvale-proxy` initially. Confirm local health,
HTTP/www redirects, WebSocket traffic, and dynamic no-store responses.

After creating the dedicated Tunnel, store its token privately in
`/etc/mossvale-edge/tunnel-token` (root-owned, mode 0600; directory 0700).
Never place the token in Git, a command argument, shell history, or chat.
The unit passes it with systemd's private `LoadCredential` mechanism.
Start and enable `mossvale-tunnel`; its readiness endpoint is
`http://127.0.0.1:2027/ready`.
The unit selects `/dev/null` as its local config so it cannot inherit another
connector's `/etc/cloudflared/config.yml`; routes come from this Tunnel's dashboard.

## Cutover

1. Publish `tunnel-check.mossvale.world` to `http://127.0.0.1:8087` and verify
   strict HTTPS, game HTML/assets, API responses, and WebSocket ping/pong with
   the canonical `Origin: https://mossvale.world`.
   Preserve the incoming Host in the Tunnel configuration; Caddy needs it for
   the www redirect and sets the BBA Host only on the upstream request.
2. Record the existing Worker custom-domain/DNS settings. Detach `www` first
   and publish it through the same Tunnel, verifying its exact 308 redirect.
3. Detach the apex Worker custom domain and publish the apex through the
   Tunnel. Verify HTTPS health/config, unauthenticated roster 401, foreign
   Origin rejection, wallet discovery/POST/preflight, and WSS ping/pong.
   Verify account sign-in in the browser before declaring migration complete.
4. Remove the temporary test hostname. Retire the Worker routes in
   `wrangler.jsonc` so a later deployment cannot silently restore the quota.
   Preserve wiki, US realm, MX/SPF, and all unrelated DNS records.

Rollback: remove the affected Tunnel hostname/DNS record and reattach that
hostname as a `mossvale-edge` Worker custom domain. The original Worker code
and restart page remain available. This restores the old path and its quota.

The Caddy proxy retains navigation-only restart recovery and redirects while
passing APIs, wallet requests, cookies, Origin, and WebSockets to the game.

## Verification (2026-09-13)

Both host services are enabled and active; the connector reports four ready
connections. Apex and www use proxied Tunnel CNAMEs, and `mossvale-edge` has
no custom domains or public Worker URLs. The temporary route and DNS record
were removed after cutover.

Live checks passed for game HTML, health/config, account sign-in through to
the character roster, wallet routing, CORS/Origin enforcement, and actual WSS
ping/pong. HTTP and www redirects preserve encoded paths and queries. Wiki
and US health remain available. No character entered a realm during verification.
The existing Docker proxy checks passed for both Tunnel and US configurations,
including simulated restart failures; no production outage was injected.
