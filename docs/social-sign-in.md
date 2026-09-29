# Google and Apple sign-in

Google and Apple are the default sign-in choices for the shared `https://auth.mossvale.world` / `mossvale` realm, on every game region and the account page. Both providers issue the same existing Keycloak account identity used by the game, native app and account page. Reown is unrelated to this flow.

`KEYCLOAK_SOCIAL_PROVIDERS` overrides the default: use `google`, `apple`, `google,apple`, or `none` to disable both. Blank/unset selects the shared realm's defaults; custom Keycloak realms remain off until explicitly configured. Provider credentials and callbacks still belong to Keycloak. Real Google and Apple authorization pages were verified on 2026-09-19; successful token exchange and account linking require an actual provider sign-in.

## Implementation

Google uses Keycloak's built-in provider. Keycloak **26.7.3** does not ship an Apple provider, and its generic OIDC callback accepts GET while Apple's email scope requires `form_post`. `Dockerfile.auth` therefore builds a small `mossvale-apple` provider against the exact Keycloak jars. It inherits Keycloak's state, authorization-code, signature, issuer, audience, expiry and nonce verification. The extension handles Apple's POST and cancellation, requests only email, pins Apple endpoints and RS256 signatures, and requires a refresh token before creating a new Apple link. It does not trust the browser's `user` or `id_token` form fields. Sources: [Keycloak provider registry](https://github.com/keycloak/keycloak/blob/26.7.3/services/src/main/resources/META-INF/services/org.keycloak.broker.social.SocialIdentityProviderFactory), [Keycloak OAuth callback](https://github.com/keycloak/keycloak/blob/26.7.3/services/src/main/java/org/keycloak/broker/oidc/AbstractOAuth2IdentityProvider.java), [Apple authorization request](https://developer.apple.com/documentation/signinwithapplerestapi/request-an-authorization-to-the-sign-in-with-apple-server.).

The app opens the existing Keycloak authorization request in the system authentication browser, with the same S256 PKCE and `mossvale://auth/callback` return path. Apple/Google credentials and external tokens never enter the game WebView. No new native sign-in SDK is needed.

Apple's cross-site POST first returns a same-origin 303 to the inherited GET callback, carrying only code/state or cancellation. This allows the browser to send its existing `SameSite=Lax` session cookies before Keycloak verifies state and exchanges the code. The bounce uses `no-store` and `no-referrer`; it cannot choose a different origin or forward external identity tokens. Keep auth proxy query-string/access-token logging disabled as with other OAuth callbacks.

The copied `Mossvale social first login` flow requires explicit confirmation and existing-account password/configured MFA for a username/email collision. Email verification links and automatic email linking cannot prove ownership of an existing account. Realm profile and email-verification policies remain intact. For an account that already uses passwordless Google/Apple, sign in using its original method and link the second provider from Account settings; do not create a second account or automatically merge by email. Apple private relay addresses may differ from an existing email. [Keycloak first broker login and linking](https://www.keycloak.org/docs/latest/server_admin/#_identity_broker_first_login).

## Provider registrations

Use the existing realm and exact `KEYCLOAK_URL`; do not change the identity issuer or recreate users to set up SSO. The production auth host is `https://auth.mossvale.world`. The owned-host migration preserves existing users and the game account namespace. Its provider callbacks are:

- Google: `https://auth.mossvale.world/realms/mossvale/broker/google/endpoint`
- Apple: `https://auth.mossvale.world/realms/mossvale/broker/apple/endpoint`

Google: configure OAuth branding/consent and a **Web application** OAuth client, with the exact Google callback above. Keep `GOOGLE_SSO_CLIENT_ID` and `GOOGLE_SSO_CLIENT_SECRET` in the operator secret store. Request only `openid email`. The active Mossvale registration opens Google's branded authorization page; use the existing registration rather than creating a duplicate client. Use `mossvale.world` as the authorized domain, `https://mossvale.world/` as the homepage, and `https://mossvale.world/privacy.html` as the privacy URL. Register the exact owned-host callback above; do not reuse the old BBA callback. The consent-screen support address must be an eligible Google account or managed Google Group. [Google web-server OAuth setup](https://developers.google.com/identity/protocols/oauth2/web-server#creatingcred).

Apple: enable Sign in with Apple on the intended primary App ID, create/group a web **Services ID**, and register the exact Apple callback and domain. Use that Services ID as `APPLE_SSO_CLIENT_ID` and create a Sign in with Apple `.p8` key for that app group. This key is separate from an App Store Connect billing API key. Register the actual outgoing email sender with Apple's private email relay if account verification/recovery messages use it. [Apple web configuration](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/), [Apple email relay](https://developer.apple.com/help/account/capabilities/configure-private-email-relay-service/).

For any future auth-host change, use the existing identity migration procedure in [auth-theme/README.md](../auth-theme/README.md). Preserve every Keycloak user ID, provider link and `KEYCLOAK_ACCOUNT_ISSUER` database namespace. Do not independently recreate a realm or silently change the issuer.

## Runtime and preparation

Deploy the revised auth image before configuring the Apple provider. Keep these secrets only in the Keycloak runtime:

- `APPLE_SSO_TEAM_ID`: ten-character Apple developer team identifier.
- `APPLE_SSO_KEY_ID`: ten-character Sign in with Apple key identifier.
- `APPLE_SSO_PRIVATE_KEY_FILE`: read-only mounted `.p8` PKCS#8 file readable by Keycloak; alternatively `APPLE_SSO_PRIVATE_KEY` containing its PEM. Configure exactly one.

The provider generates a fresh five-minute ES256 client-secret JWT for each token exchange, refresh and revocation. It reads the key for each operation, so file replacement supports rotation without a stored six-month JWT. Keep old keys valid until all instances use the replacement. Environment-variable changes require restarting the auth service. `.p8` files are excluded from Git and Docker build contexts. [Apple client-secret format](https://developer.apple.com/documentation/signinwithapplerestapi/creating-a-client-secret).

The setup script accepts `KEYCLOAK_URL`, `KEYCLOAK_REALM`, optional `SSO_PROVIDERS=google,apple`, provider client IDs, Google's secret, and either `KC_ADMIN_TOKEN` or a service account (`KC_ADMIN_CLIENT_ID`, `KC_ADMIN_CLIENT_SECRET`, optional `KC_ADMIN_REALM`). Secret variables also accept a `_FILE` alternative. Never use shell tracing. The script does not print secrets, response bodies or tokens.

```sh
# Offline, redacted plan; no credentials or network required except URL/realm inputs.
node scripts/configure-social-sso.mjs
# Configure disabled providers and a private copy of the safe linking flow.
node scripts/configure-social-sso.mjs prepare --apply
# Add exact web/account/native redirects to existing KEYCLOAK_CLIENT_ID; preserve existing redirects.
node scripts/configure-social-sso.mjs clients --apply
# Read back prepared provider/flow security settings without changing them.
node scripts/configure-social-sso.mjs verify
# Only after runtime credentials, provider callbacks and test accounts are ready:
node scripts/configure-social-sso.mjs enable --apply
```

Every mutation needs `--apply`; the default is a plan. Preparation disables targeted providers before modifying their shared flow and refuses to modify a flow used by an enabled non-target provider. It does not alter users, password policy, built-in flows, roles or other providers. Unknown authenticators, identity/role mappers, extra provider config and unsafe account-linking drift fail closed. The `clients` phase adds only exact redirects/origins and requires S256; it preserves existing client settings. `enable` and `verify` prove configuration read-back only, not successful Apple/Google authorization or credential validity. For custom realms, publish the corresponding `KEYCLOAK_SOCIAL_PROVIDERS` game-server setting only after providers are ready (see `.env.example`).

## Account deletion and unlink

Apple refresh tokens stay in Keycloak's protected federated-identity storage. The provider does not grant `broker.read-token` to new users. Restrict identity database/backups and existing broker token-reading roles; do not expose external tokens in public clients or API responses.

The factory handles Keycloak's `UserPreRemovedEvent` and `FederatedIdentityRemovedEvent`, revoking the retained Apple refresh token before account deletion, or within the unlink transaction. It selects the user's realm explicitly, even if an administrator authenticates in `master`. A revocation failure marks the transaction for rollback and throws; the game's durable deletion worker retains its fence and retries. Apple's successful/already-revoked response is idempotent. If historical credentials are missing, deletion still proceeds and the user must manually remove Mossvale from Sign in with Apple at [Apple Account](https://account.apple.com/). Deleting a whole provider/realm or directly editing the database bypasses these per-user hooks and is not an account-deletion procedure. [Apple account-deletion guidance](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple), [token revocation](https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens), [Keycloak storage events](https://github.com/keycloak/keycloak/blob/26.7.3/model/storage-private/src/main/java/org/keycloak/storage/UserStorageManager.java).

## Verification

Run `node scripts/check-social-sso.mjs` with Docker available. It compiles the exact provider, verifies synthetic ES256 secrets and signed Apple ID tokens (including issuer/audience/expiry/signature/nonce rejection), exercises form POST/state and HTTP revocation in memory, then starts disposable Keycloak/PostgreSQL to verify actual provider registration, safe configuration, cookie-restored cancellation, account-delete rollback, unlink rollback and missing-token deletion. Cancelling at Apple returns Keycloak's normal sign-in form with its cancellation message; the player can choose another sign-in method or close the native authentication window. All test users and credentials are disposable; provider hostnames resolve to loopback inside the test server, and no live provider or account is used.

Before activation, verify real Google and Apple sign-in/new account/linking on web and installed Android/iOS, cancellation, Apple Hide My Email, existing-account roster preservation, logout, and deletion/unlink with designated disposable accounts. Confirm Apple token revocation, email delivery, callback registration and provider/domain verification. The automated checks do not complete real provider authorization or submit a store build. Public authorization-page checks confirm routing and registration, not successful credential exchange.
