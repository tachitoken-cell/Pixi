# Account management deployment preparation

Local implementation; no account service or DNS route is enabled by committing these files.

The Vite build emits `account.html`, `support.html`, and `privacy.html`. The account page uses the existing Keycloak browser client with PKCE. It keeps tokens in memory, requires fresh sign-in and the exact phrase `DELETE ACCOUNT`, and checks the server's deletion status after an interrupted request.

`https://mossvale.world/privacy.html` is a public, static document: reading it never requires sign-in, cookies or JavaScript. Publish the built page and its stylesheet before using the URL in store listings. A missing HTML document returns 404 instead of the game's login screen; a successful game-shell response is not proof that the policy is published. Support is public too; only account operations require authentication.

## Routing and sign-in

1. Deploy the combined application build and backend to both realms using the normal saved-state rollout. Preserve the current game revision and unrelated changes.
2. The backend explicitly trusts `https://account.mossvale.world`. Preserve existing realm origins and `GAME_ALLOWED_ORIGINS` settings.
3. Add these exact valid redirect URIs to the existing `mossvale-browser` Keycloak client, retaining its existing redirects:
   - `https://account.mossvale.world/`
   - `https://account.mossvale.world/account.html`
   - `https://mossvale.world/account.html`
   - `https://us.mossvale.world/account.html`
4. Add the exact account origin to that client's web origins and permit the same exact post-logout redirects. Do not add wildcards or change client authentication flows. Confirm fresh sign-in includes `auth_time`, and test the existing email/password recovery configuration.
5. Validate and reload the revised `cloudflare/Caddyfile`. It rewrites the account hostname's root to `/account.html`, preserving OAuth query parameters before forwarding the BBA Host.
6. Add `account.mossvale.world` to the existing Mossvale Tunnel, service `http://127.0.0.1:8087`, preserving the incoming Host, with its proxied DNS record. Keep the retired Worker routes empty. Preserve the website verification TXT and mail records.

The app opens `/account.html` on its current game origin. The public account subdomain is a separate browser surface and gets no native payment/wallet bridge authority.

Updated mobile apps use the system browser for account sign-in, registration and fresh authentication, returning through the exact `mossvale://auth/callback` URI. The account console opens in the system browser too. Configure that callback on the existing public Keycloak client; the adapter keeps its original S256 verifier and account subject. Older app builds keep their existing password redirect and show update guidance for Google/Apple. See [social sign-in setup](social-sign-in.md).

## Account deletion configuration

Configure `KEYCLOAK_DELETE_CLIENT_ID` and `KEYCLOAK_DELETE_CLIENT_SECRET` on both realm servers, using a dedicated server-only client authorized for user lookup, session logout and deletion in the Mossvale realm. `KEYCLOAK_DELETE_CLIENT_REALM` defaults to that realm. Do not grant global administrator access or put these credentials in mobile/web build variables.

Without the service credentials, `GET /api/account/deletion` reports `available:false`; the page explains the limitation and cannot request deletion. Configuration alone is not proof that the permissions work.

Deletion first writes a durable account fence, then disconnects and drains both realm writers. The worker verifies removal from Keycloak before atomically purging account/game/social/report records. Provider or database failures retain the fence and retry. Purchase intents and receipts remain for late-payment/refund verification and replay protection; the provider subject is removed after completion. Pending MOSS store payments and Auction House reservations must resolve before a request can be accepted. No refund or blockchain transaction is initiated by deletion.

## Release checks

Run `npm run check:account` for the built documents, page logic, deletion, HTTP, auth and chat checks. Docker is required for the disposable deletion database. The Tunnel proxy check is separate.

- `node --experimental-transform-types scripts/check-account-pages.mjs`
- `node scripts/check-account-deletion.mjs`
- `node scripts/check-client-auth.mjs` and `node scripts/check-chat-ui.mjs`
- `node scripts/check-restart-proxy.mjs --tunnel`
- `npm run build`

After configuration, use a designated disposable test account to verify sign-in, password recovery, account settings and complete deletion across EU/US. Never use an existing player's account for a test. Verify public HTTPS pages, callback URLs, no-referrer/no-store account responses, origin restrictions and sign-in through the installed app before supplying the account URL to either store.

Account callbacks use the explicit `/account.html` path so legacy game workers cannot substitute a cached game shell at the root. The account hostname retires any old game worker and deletes only Mossvale public-shell caches; new game update workers are not registered there.
