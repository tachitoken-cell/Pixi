# Mossvale Cloudflare routing

`mossvale.world` and `www.mossvale.world` use the dedicated `mossvale` Cloudflare
Tunnel in Daniel's account. Game traffic no longer invokes `mossvale-edge` or
uses the Workers daily request allowance. See [TUNNEL.md](TUNNEL.md) for the
host setup, verification, and rollback procedure.

The Tunnel reaches a loopback Caddy proxy on `stockholm01`, which forwards to
the existing BBA game ingress. HTTP and www redirect to the HTTPS apex;
WebSockets, request bodies, Origin, cookies, and cache headers pass through.

Namecheap nameservers: `haley.ns.cloudflare.com`, `joaquin.ns.cloudflare.com`.
Keep the BBA custom-domain setting empty: that path requires direct origin routing.
The apex and www are proxied CNAME records pointing to the Tunnel. Preserve
the five Namecheap MX records, SPF, US realm, and separate asset-only wiki.
No cache-everything rules are needed.

Run `node scripts/check-restart-proxy.mjs --tunnel` for the native proxy checks.
Failed or stalled HTML entry requests receive the shared
`public/realm-restarting.html` page. API, wallet, asset, and WebSocket requests
continue to use the origin response. `worker.mjs` and `check.mjs` remain for
rollback; `wrangler.jsonc` deliberately has no routes or public Worker URLs.
Verify public DNS, HTTPS `/api/health`, `/socket`, and account sign-in after changes.
The existing Keycloak browser client allows the apex for login/logout and CORS;
wallet `APP_ORIGIN` and its Keycloak identity-provider endpoints must agree on
the canonical origin. Changing the Keycloak issuer is a separate account migration.
