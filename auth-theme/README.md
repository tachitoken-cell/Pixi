# Mossvale authentication image and migration

`Dockerfile.auth` builds Keycloak **26.7.3** with the editable Mossvale theme and
local 3D login assets. Its final stage contains Keycloak, the theme, the Apple sign-in adapter and a CA entrypoint;
it does not copy game data, realm exports, database backups, environment files, or
credentials. Database access, hostname, and wallet secrets are runtime settings.

Google uses Keycloak's built-in provider. Apple uses the adapter in `auth-provider/` for its POST callback and authorization revocation. Apple signing keys are runtime secrets, never image contents. See [social sign-in setup](../docs/social-sign-in.md) before enabling either provider.

The login forms provider sends ordinary account-switch conflicts through Keycloak's
built-in logout and restart. This ends only the conflicting browser session and
preserves the original sign-in request; the user may need to authenticate again.
Reauthentication and account-linking checks keep their original behavior. Run
`node scripts/check-social-sso.mjs` for the isolated Keycloak regression.

The game embeds the inherited Keycloak email/password, registration, recovery and
MFA forms. Credentials stay on the authentication origin; the game uses the
standard authorization-code flow with S256 PKCE. The security-headers provider
allows framing only for `mossvale-browser` in the `mossvale` realm when its exact
registered `/auth-callback.html` points at the EU, US or Asia game origin. It
preserves the realm's other CSP directives and all other security headers. Normal
login, native callbacks, other clients and admin pages retain their framing
protection. Loopback framing requires both a local Keycloak and an explicitly
registered loopback callback. The theme receives its parent origin from the
validated authentication session and sends only readiness/height messages there.

Google, Apple and wallet approval open in a normal browser tab while the
game remains in place. Popup windows cannot host wallet side panels in Brave.
They use the same callback and PKCE flow. A one-attempt
BroadcastChannel pairs the callback with its original game tab and acknowledges
delivery before closing; tokens are never persisted. This also works when a
provider's window isolation removes `window.opener`. Cancel discards late
results, and blocked windows offer an explicit same-tab fallback. Native apps
keep their system sign-in. Provider and wallet broker redirect registrations
remain unchanged; only the browser client's existing game callback is used.

Before releasing the game login change, deploy this auth image through the
workflow below and apply the `clients` phase of
`node scripts/configure-social-sso.mjs clients --apply` with the existing protected admin
credentials (see [social sign-in setup](../docs/social-sign-in.md)). That phase
preserves existing client settings and adds exact `/auth-callback.html` redirects
for all three game origins plus `/silent-check-sso.html` for those origins and
`account.mossvale.world`. The game release alone does not update Keycloak's image
or redirect registration. `node scripts/check-social-sso.mjs` checks the compiled
provider against disposable PostgreSQL/Keycloak, including registration,
recovery, MFA and rejected frame origins, without contacting production accounts.

## Publish and deploy the image

Manually run **Build and deploy Mossvale auth**, selecting the reviewed commit's
branch. It builds `linux/amd64` and pushes
`ghcr.io/trappyon/mossvale-auth:sha-<full-commit-SHA>` using only the job's temporary
`GITHUB_TOKEN` (`contents: read`, `packages: write`). It has no push/PR trigger.
The official actions are pinned to release commit SHAs.

Select **Deploy the image to production after building** to release through the
BBA API. The repository secret `BBA_API_TOKEN` must contain a BBA token with only
`apps:read` and `apps:write`; create it in BBA **API access**, keep it out of source
and logs, and renew it before expiry. BBA currently applies these scopes to all
apps owned by the token's user. The release script targets only the existing
Mossvale auth app, preserves its configuration, pauses it, changes the immutable
image with a concurrency check, resumes it and verifies discovery/signing keys.
Production releases are serialized. The workflow saves `auth-release.json` with
the previous image and outcome. No server login or database edit is needed.

To release an already-published image or roll back, run the workflow with
**Deploy** selected and **existing_image** set to the previous digest from the
release proof. If startup failed, first **Stop** the app in BBA and wait for
**Stopped**; the command can replace that stopped image and resume it. It does
not overwrite failed or active operations. The same command is available locally:

```sh
node scripts/deploy-auth.mjs ghcr.io/trappyon/mossvale-auth@sha256:<digest>
```

Supply `BBA_API_TOKEN` through the process environment. The script requires a
healthy or stopped, idle app before replacing its image and fails rather than
overriding another operation. Stopped recovery verifies public sign-in endpoints
after restart; it cannot compare signing keys against an offline predecessor.
Run `node scripts/check-auth-deploy.mjs` to check the release
and failure paths without a production token.

Use the workflow's **digest** reference (`ghcr.io/trappyon/mossvale-auth@sha256:…`)
for the BBA custom container. SHA-named tags identify the source, but GHCR tags can
still be replaced by a rerun; the digest is the immutable artifact. There is no
`latest` tag. If BBA requires anonymous pulls, explicitly make this theme-only GHCR
package public and verify an unauthenticated pull before cutover. Publishing or
changing package visibility does not migrate accounts or switch the game.

References: [manual workflows](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow),
[GHCR publishing](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images),
[Keycloak container builds](https://www.keycloak.org/server/containers).

## Preserve the existing accounts

The managed BBA Keycloak uses PostgreSQL 17 in its private `keycloak-db` sidecar,
with durable storage and a loopback-only database listener. A platform operator
must provide authorized access to that exact workload. Do not open the database
port or change its NetworkPolicy to obtain a backup. Admin REST user lists and
Admin Console partial exports **do not preserve password credentials**.

1. Provision a separate, empty PostgreSQL 17 database for the custom image. Keep
   the old authentication app and PVC. Record the current realm URL, image, theme,
   client configuration, and game configuration in private migration records.
2. For the final copy, prevent new logins, registration, and account/admin writes
   to the old Keycloak. Do not run two independent writable copies after the
   snapshot. Keep the PostgreSQL sidecar running for the dump; stopping the whole
   BBA app stops that sidecar too. Use only the agreed operator maintenance method.
3. Capture a consistent full database backup. The following commands require
   explicitly supplied `MIGRATION_CONTEXT`, `AUTH_NAMESPACE`, and `AUTH_POD`;
   they intentionally do not discover or select production automatically.

   ```sh
   set -eu
   umask 077
   AUTH_BACKUP_DIR="$(mktemp -d)"
   kubectl --context "$MIGRATION_CONTEXT" --namespace "$AUTH_NAMESPACE" \
     exec "$AUTH_POD" -c keycloak-db -- sh -ec \
     'PGPASSWORD="$POSTGRES_PASSWORD" exec pg_dump --username="$POSTGRES_USER" --dbname=keycloak --format=custom --no-owner --no-privileges' \
     > "$AUTH_BACKUP_DIR/keycloak.dump"
   test -s "$AUTH_BACKUP_DIR/keycloak.dump"
   pg_restore --list "$AUTH_BACKUP_DIR/keycloak.dump" > "$AUTH_BACKUP_DIR/contents.txt"
   ```

   The archive contains password hashes, client secrets, and signing keys. Keep it
   mode 600, outside this repository and build context. Do not print, upload to CI,
   or commit it. Check the dump command's exit status before using the archive.
4. Restore into the **empty new database**, with its connection and credentials
   supplied through a private libpq service `mossvale-auth-new` and password file.
   This does not drop or overwrite an existing destination schema.

   ```sh
   pg_restore --exit-on-error --single-transaction --no-owner --no-privileges \
     --dbname='service=mossvale-auth-new' "$AUTH_BACKUP_DIR/keycloak.dump"
   ```

5. Before changing realm settings or signing in, compare private, sorted query
   results from source and restored database. Require equality of realm/client
   IDs, user IDs, credential associations/types, role mappings, federated links,
   and component IDs. Also compare `credential_data` and `secret_data` privately
   (never log their contents), and verify signing-key components were restored.
   Useful identity queries are:

   ```sql
   SELECT id, name FROM realm ORDER BY id;
   SELECT id, realm_id, client_id FROM client ORDER BY id;
   SELECT id, realm_id, username, enabled FROM user_entity ORDER BY id;
   SELECT id, user_id, type FROM credential ORDER BY id;
   SELECT user_id, role_id FROM user_role_mapping ORDER BY user_id, role_id;
   SELECT identity_provider, user_id, federated_user_id
     FROM federated_identity ORDER BY identity_provider, user_id;
   SELECT id, realm_id, provider_id, provider_type FROM component ORDER BY id;
   ```

6. Start the custom container against the restored database with `KC_DB=postgres`,
   its private `KC_DB_URL`/username/password, `KC_HOSTNAME` set to its public HTTPS
   origin, and the required trusted-proxy settings (`KC_HTTP_ENABLED=true` and
   `KC_PROXY_HEADERS=xforwarded` for the existing BBA TLS termination). It must be
   reachable only through that trusted proxy. Set realm `mossvale`'s login theme
   to `mossvale`. Preserve the existing realm ID, user IDs, clients, password/email
   policies, verified emails, and roles. Do not recreate users or import a partial
   realm on top of this database. Confirm a known account's existing password,
   configured MFA, and realm `gm` role still work before cutover.

For certificate-verified PostgreSQL TLS, set `MOSSVALE_DB_CA_BASE64` to the base64
encoding of the database's public CA/certificate supplied by the platform and use:

```text
KC_DB_URL=jdbc:postgresql://<private-database-host>:5432/keycloak?sslmode=verify-full&sslrootcert=/tmp/mossvale-db-ca.pem
```

The image entrypoint writes that certificate at runtime with mode 600, rejects
invalid base64 before starting, then executes the stock Keycloak command. It does
not print the certificate or environment. Without this optional variable, the
stock command is unchanged. The database certificate must cover the exact private
hostname. `sslmode=require` alone does not verify the server identity. Run
`node scripts/check-auth-entrypoint.mjs [local-image]` with Docker and a local
Keycloak 26.7.3 image to check decoding, file permissions, failures and command
forwarding (the default image is `quay.io/keycloak/keycloak:26.7.3`).

## Point the game at the new issuer

Set game `KEYCLOAK_URL` to the new authentication **base URL**, retain
`KEYCLOAK_REALM=mossvale` and `KEYCLOAK_CLIENT_ID=mossvale-browser`, and set:

```text
KEYCLOAK_ACCOUNT_ISSUER=https://98173aaf-eaf1-420d-a6fc-4e6f46043216.bba.tools/realms/mossvale
```

`KEYCLOAK_ACCOUNT_ISSUER` retains the old account-key namespace
`SHA256(oldIssuer + "\n" + verifiedSub)`. It is **not** another accepted JWT issuer.
JWT signature, issuer, audience/client, GM-role checks, and disabled-account checks
must use the new Keycloak. This requires the restored user IDs to be identical.
Verify existing character rosters, banks, bans, and GM permissions before allowing
new account writes. Do not change game database records to compensate for a bad
identity migration.

Configure the wallet broker using environment-only admin credentials and the
new exact callback `${KEYCLOAK_URL}/realms/mossvale/broker/mossvale-wallet/endpoint`:

```sh
node scripts/configure-wallet-broker.mjs profile
node scripts/configure-wallet-broker.mjs prepare
# Deploy the game broker with its static signing key and confidential client.
node scripts/configure-wallet-broker.mjs enable
node scripts/configure-wallet-broker.mjs verify
```

`prepare` leaves the provider disabled. `enable` checks its HTTPS discovery,
public signing keys, and client-secret acceptance first. First/last names become
optional and admin-visible only; stored values and other profile policy remain.
Email-based automatic linking is disabled. Existing-account collisions require
confirmation and password/configured two-factor reauthentication. Wallets carry
no email or role claims. Test repeated wallet login and explicit linking to an
existing account, with unchanged canonical Keycloak subject and game roster.

## Rollback

Keep the original app, PVC, and final backup. Before enabling new writes, rollback
is to stop the new authentication service and restore the saved game auth settings
pointing to the original service. After any new registration, password/role
change, or wallet link, the old database is stale: first reconcile or restore the
new authoritative database through the operator's verified backup process. Never
silently switch to a stale identity copy or delete the old service as cleanup.

The local QA fixture uses synthetic accounts and a Docker-only backchannel URL
override. That override must not be copied to production; the setup verifier
intentionally rejects endpoint drift. See [Keycloak export limitations](https://www.keycloak.org/server/importExport)
and [PostgreSQL backup/restore](https://www.postgresql.org/docs/17/backup-dump.html).
