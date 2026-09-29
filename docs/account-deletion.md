# Account deletion backend

The authenticated endpoint deletes the whole Mossvale account across both realms. This is separate from deleting one character. It requires PostgreSQL and Keycloak; local guest/JSON saves do not expose account deletion.

## Activation

Deploy this backend and the terminal WebSocket/client cleanup handling to **both realm writers before enabling deletion**. Older binaries do not honor the deletion fence and must not be restarted against a database with completed deletions. Preserve the fence and financial tables when restoring backups.

Configure a server-only Keycloak service client with permission to read the target realm's users, count visible users, log out sessions, and delete users. The realm's `realm-management.manage-users` role provides these user-management permissions; do not grant realm administration or impersonation. Fine-grained user-management permissions can narrow access further if the deployed Keycloak version supports the required operations. See the [Keycloak service-account guide](https://www.keycloak.org/docs/latest/server_admin/#_service_accounts) and [Admin REST API](https://www.keycloak.org/docs-api/latest/rest-api/index.html).

Environment variable names (values are secrets and do not belong in source or browser config):

- `KEYCLOAK_DELETE_CLIENT_ID`
- `KEYCLOAK_DELETE_CLIENT_SECRET`
- `KEYCLOAK_DELETE_CLIENT_REALM` (optional; defaults to the game realm)

The existing `KEYCLOAK_URL`, realm, and browser client remain the source of trusted user identity. The deletion service uses the configured Keycloak realm, while `KEYCLOAK_ACCOUNT_ISSUER` remains only the existing stable database namespace. Setting only one of client ID/secret is a startup configuration error. With neither, GET reports `available:false` and new POST requests return 503. Pending operations still block gameplay, but need a configured worker to finish.

Provisioning these credentials, account-host DNS/proxy, and Keycloak browser redirect/Web Origins is an operational step; this change does not alter any live provider or realm configuration. No real account was deleted during verification.

## API

Both methods use `Authorization: Bearer <access token>`, do not accept a client-supplied account ID, and return `Cache-Control: no-store`. Allowed game origins and `https://account.mossvale.world` can use GET/POST with Authorization and JSON through CORS. The account host can also proxy this route on the same origin.

`GET /api/account/deletion` returns:

```json
{"available":true,"status":"none","freshAuthRequired":false}
```

States are `none`, `pending`, and `complete`. Existing operations additionally contain millisecond `requestedAt`, optionally `completedAt`, and `code:"DELETION_RETRYING"` after a failed attempt. No user subject, email, account hash, or transaction details appear in this response.

`POST /api/account/deletion` accepts exactly:

```json
{"confirmation":"DELETE ACCOUNT"}
```

The access token must contain an `auth_time` within five minutes (30 seconds of future clock tolerance) and must remain unexpired at the durable request boundary. A refreshed `iat` is insufficient. Force a fresh Keycloak login (`maxAge:0`, `prompt:'login'`) before confirmation when required. Accepted requests return 202 with `status:"pending"` and `requestedAt`. Repeats are idempotent; completed repeats return 200.

Error codes are `AUTH_REQUIRED` (401), `FRESH_AUTH_REQUIRED` (401), `INVALID_CONFIRMATION` (400, 413 for oversized body, or 415 for wrong content type), `REQUEST_PENDING` (429), `ACCOUNT_PAYMENTS_PENDING` (409), and `DELETION_UNAVAILABLE` (503).

An unsettled MOSS checkout or auction payment reservation involving any account character returns 409 **before** erecting the fence. The user can still sign in and resolve it. Native pending/paid intents are archived for recovery and do not block deletion. Deletion itself does not issue refunds or cancel store transactions.

## Durability and data handling

The request locks the account's player row, observes admitted payment writes, and commits a permanent hash-based deletion fence. Both realms poll pending operations and close the account with code **4410**, drain already admitted work and the final ordinary save, then release the existing account advisory lock. Explicit shared/action writes recheck the fence under their normal row locks. Claim checks the fence before its create-if-missing insert; old signed access tokens and a server restart cannot recreate the deleted row.

A worker takes the same account advisory lock only after its realm owner releases it. It checks the precise Keycloak user, logs out sessions, deletes that user, and confirms the user is absent. Only then does a database transaction:

- Archive every native checkout into `mossvale_mobile_intents` without overwriting existing records.
- Remove the account's player row, including all characters, progress, wallet links, names, social lists, and local MOSS order history.
- Remove references to those characters from other accounts' friend, request, and ignore lists.
- Remove reports where the account is reporter/target or its character is reviewer.
- Mark the fence complete and remove its temporary provider subject.

After commit, both realms clear cached characters, relevant activity/chat receipts, transient invitations/results, and push `{type:'communityErase',playerIds:[...]}`. The client handles removal from current chat and cached social UI. The event is sent for all cached characters of the account, not only a currently selected character.

Native receipt identities and intent history survive with account hashes and character/purchase IDs. `mossvale_mobile_receipts`, `mossvale_mobile_intents`, refund/event records (`mossvale_mobile_events`), and reconciliation cursors (`mossvale_mobile_sync`) must not be cascaded away. They preserve duplicate-payment protection and late payment/refund recovery without recreating profiles. The completed deletion fence retains only account hash and status/timestamps; pending operations can also contain a generic retry code.

Provider or database failure leaves a durable pending operation and retries after ten seconds. An already absent provider user is accepted only after the admin users endpoint is confirmed reachable. A failed database purge rolls back social/profile/archive changes together. If the identity was removed before a database failure, the next attempt completes the database cleanup without needing the user to sign in again.

This implementation does not erase operator backups/log exports, external sign-in-provider accounts, public blockchain history, or completed financial replay records. No retention period or legal policy is asserted here. The account page must accurately describe these boundaries.

When Apple sign-in is enabled, deploy the Apple adapter in `Dockerfile.auth` before exposing that provider. Its Keycloak removal listener revokes the stored Apple authorization before user removal and rolls back deletion on a revocation failure, allowing the existing game deletion worker to retry. It also handles unlinking Apple. Historical missing authorization tokens require the manual provider-account instructions shown on the account page; do not claim that deleting Mossvale deletes an Apple or Google account. See [social sign-in setup](social-sign-in.md).

## Local verification

`node scripts/check-account-deletion.mjs` starts and removes its own loopback-only PostgreSQL container, uses a mock Keycloak service, and runs two real game servers. It covers signed/fresh identity and exact confirmation, CORS, cross-realm close/drain, provider retry and idempotency, old-token/restart rejection, pending-payment preflight, blocked explicit writes, admitted-write ordering, exclusive ownership, forced transactional purge rollback, profile/social/report erasure, and native financial preservation. Docker is required. No production identity, store, or database is used.
