# Native purchase activation — not submitted

The billing backend, native bridge and offline checks are implemented. The inspected iOS 1.0.2 build 15 (EAS build `d200b1bb-d85c-4e6c-80db-e080056b4b81`, source `2965d350f1a25dc36ef2db9bb536b2fbc8a75d22`) includes StoreKit, ExpoIap and the purchase/verification/finish/refund bridge. A replacement binary is not required merely to include billing. This is not proof of active products, store approval or a real device purchase. As of September 18, 2026, the nine Apple products are not submitted and live realm verifiers remain disabled.

Apple/Google products use the immutable `MOBILE_STORE_SKUS` mapping in `src/ingame-store.ts`. Every SKU is consumable because rewards belong to a character and the same account can purchase for another character. Native MOSS checkout is disabled; browser MOSS burns retain their existing contract validation and finality behavior.

Auction House mobile payment and MOSS payout work is deferred. This release checklist covers only the existing fixed-price game store. Wallet linking is coordinated separately and is not a dependency of Apple/Google checkout.

## Prepared catalog

[The product draft](mobile-purchase-catalog.json) contains the nine active immutable IDs, character entitlements, English descriptions and the existing reference prices. Its short Apple descriptions fit the [45-character field](https://developer.apple.com/help/app-store-connect/reference/in-app-purchases-and-subscriptions/in-app-purchase-information/). Prices remain drafts; do not silently replace them with nearby store tiers or treat this file as an activated catalog.

| Products | Existing USD reference price each |
| --- | ---: |
| Embermane, Cinderfang | 40 |
| Ashwing, Cinder Kit | 20 |
| Profession XP, XP, damage and defense boosts | 2 |
| Cinder Cosmetic Box | 5 |

The Burned title is retired from sale. Keep its immutable SKU for receipt recovery and refunds; do not activate or offer it as a new purchase. Existing owners retain their title.

Use consumable in-app purchases on Apple and consumable one-time products on Google. Use a single ordinary buy option for each Google product; this client does not select rentals, preorders, subscriptions or promotional offers. Disable multi-quantity purchases. The cosmetic box discloses its current equal odds before checkout; a fully owned pool cannot be purchased.

## Implemented flow

1. Authenticated `POST /api/mobile-purchases/intents` creates an account/character/platform/SKU-bound UUID in durable character history. The response is issued only after save. A pending checkout can be reused for 15 minutes; expiration permits another checkout but never invalidates a later legitimate receipt.
2. The native purchase request binds that UUID as Apple `appAccountToken` or Google `obfuscatedAccountId`. Replayed receipt events use the receipt's own binding, never the current purchase request.
3. Authenticated `POST /api/mobile-purchases/verify` calls the official store API. Apple signed data is verified with the official Apple library/root certificates. Google uses the fixed Android Publisher product-purchase-v2 API with server-held service-account credentials. App, product, intent binding, quantity, purchase time and current purchased/unrefunded status must match. Sandbox/test receipts require the verified account hash allowlist.
4. Existing account ownership locks and the queued PostgreSQL transaction atomically persist reward/history and `mossvale_mobile_receipts`. Unique `(platform,payment_id)` and `intent_id` constraints prevent duplicate grant across realms. Separate intent history and sanitized notification records survive character deletion. Google tokens are retained only as SHA-256 identities in stored history; raw tokens, authorization and signed API credentials are not returned in events or logs.
5. Exact `{delivered:true}` allows native `finishTransaction(...isConsumable:true)`. A durably confirmed refund returns HTTP 409 with `{delivered:false,refunded:true,code:"PURCHASE_REFUNDED"}` so the native bridge can finish that terminal transaction without granting anything. Other verification/save failures leave the receipt unfinished. A paid duplicate or cosmetic conflict is durably `payment-confirmed` with `PURCHASE_RECOVERY_REQUIRED`; it is not finished, discarded, or represented as unpaid.

`/api/config.mobilePurchases` and `StoreState.mobile` report configured verifier availability only, independently of MOSS burn availability. This is not a production-readiness flag. `StoreState.mobileOrders` exposes the current character's status/reward without receipt identities or tokens. Native history is omitted from world-player broadcasts.

## External configuration not supplied

- Wallet sign-in uses the installed MetaMask, Phantom, OKX Wallet or Trust Wallet app browser and the existing checked OIDC callback. It requires no WalletConnect/Reown project or paid hosted relay; users need one of those wallet apps installed.
- Apple in-app-purchase API key, key ID and issuer ID (`APPLE_IAP_PRIVATE_KEY`, `APPLE_IAP_KEY_ID`, `APPLE_IAP_ISSUER_ID`), and real consumable catalog/availability/prices for App Store app 6811825860.
- Google Play service-account authorization (`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`) for package `world.mossvale.game`, and real one-time consumable catalog/availability/prices.
- Optional test-account hash allowlist (`MOBILE_PURCHASE_SANDBOX_ACCOUNTS`), never arbitrary client account names.

The native store stays unavailable without configured verifiers, canonical shared PostgreSQL and Keycloak authentication. Do not put server credentials in Expo public environment variables or source archives.

## Refund and interrupted-checkout implementation

- `POST /api/mobile-purchases/apple-notifications` verifies the outer Server Notifications V2 JWS and nested transaction JWS with the official Apple verifier. App/environment, intent, product, ownership and quantity are checked. Only signed revocation data can revoke Apple rewards. [Apple notifications](https://developer.apple.com/documentation/appstoreservernotifications).
- `POST /api/mobile-purchases/google-notifications` verifies Google's RS256 push identity: signature, issuer, expiry, audience, verified service-account email and exact Pub/Sub subscription. Ordinary one-time RTDN refreshes the fixed ProductPurchaseV2 endpoint. An authenticated full-void notification remains a refund proof if the consumed purchase has aged out of the query API. Configure the topic so only the expected Google Play publisher can publish; push authentication alone does not limit a topic's publishers. [Authenticated push](https://cloud.google.com/pubsub/docs/authenticate-push-subscriptions), [RTDN reference](https://developer.android.com/google/play/billing/rtdn-reference).
- Before returning HTTP 204, both endpoints store a sanitized, deduplicated event in `mossvale_mobile_events`. No receipt token/JWS/Bearer is stored. The owning realm applies it through the existing account lock and atomic reward/receipt commit. Refund tombstones also prevent late or racing verification from granting a refunded purchase. Events survive failed saves and restart; receiving on the other realm does not bypass the owner.
- A bounded worker polls Google Voided Purchases in pages, stores every event and its next cursor atomically, and overlaps completed windows by one hour. All three realms may perform the read, but only one compare-and-set advances shared state. A gap beyond Google's 30-day history remains recorded in `mossvale_mobile_sync.state.historyGap` for manual audit. [Voided Purchases](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.voidedpurchases/list).
- Native boost activation records its exact scheduled interval. Refunds remove the unused charge or remaining duration, preserving other stacked boosts. The audit retains already consumed milliseconds; past XP, combat outcomes and other gameplay are not rolled back. A refunded cosmetic/box removes only its recorded cosmetic, title or companion. An unattributable legacy boost is held for support review rather than guessing which benefit to remove.
- Authenticated `POST /api/mobile-purchases/abandon` with `{intentId}` marks only the caller's pending checkout `abandoned`, releasing its reservation. It does **not** assert nonpayment. Later authentic payment is still accepted. Expired/abandoned unpaid intents no longer prevent character deletion; their checkout bindings remain in `mossvale_mobile_intents`. Verified late payments for retired characters are durably recorded for support, never silently discarded or used to recreate a character.
- Re-verifying an exact `payment-confirmed` receipt retries delivery if its original reward conflict has cleared. A still-duplicate cosmetic remains an explicit paid obligation; no substitute reward or refund is invented. Official refunds resolve that order terminally. Apple `REFUND_REVERSED`/`CONSUMPTION_REQUEST` and Google pending refund review events are retained as `support-review-required`, with no automatic financial response or regrant.

## Required configuration and release verification

- Register the two HTTPS notification URLs with their respective providers. Google additionally requires server-only configuration `GOOGLE_RTDN_AUDIENCE`, `GOOGLE_RTDN_EMAIL`, and `GOOGLE_RTDN_SUBSCRIPTION` matching the authenticated push subscription. Restrict Pub/Sub publishing permissions to the billing publisher. Existing Apple and Google API credentials remain required; none are provisioned by this code.
- Establish an operator workflow for `support-review-required`, `retired-payment-support-required`, unresolved `payment-confirmed` orders, unattributed historical boosts and any recorded reconciliation history gap. Refund requests, payout changes and provider review responses remain manual authorized actions. No arbitrary support grant or money-moving endpoint is exposed.
- The account-deletion implementation is coordinated separately; it must preserve all four `mossvale_mobile_*` tables and reject account recreation while cleanup is pending. Retention policy and support/privacy wording still require owner review.
- Test actual sandbox purchases, pending/cancelled/refunded states, provider notification delivery, restore after process death and physical Android/iOS wallet return in verified signed native builds. Injected SDK/API tests and local JS export do not establish that live credentials, catalogs, signing or device flows work. Native handling of the abandonment/terminal-refund contracts must be included in those builds.

## Local verification

- `npm run check:mobile-purchases`: strict receipt examples plus real disposable loopback PostgreSQL, local signed JWTs/HTTP and two game servers. Covers rollback, simultaneous receipt delivery, restart replay, account/SKU mismatch, global uniqueness, reservations, abandon/late payment, pre-delivery refunds, duplicate two-realm notifications, exact reversal, and retired-character receipt retention. No external store calls or real purchases.
- `node scripts/check-store-server.mjs` and `node scripts/check-store-consumables-server.mjs`: existing MOSS burn/finality/reorg and consumable behavior.
- `node scripts/check-auth.mjs` and `node scripts/check-wallet-oidc.mjs`: authentication and broker regressions.
- In `mobile/`, `npm run check`: billing, bridge, direct wallet browser handoff, navigation/recovery and TypeScript checks with injected native APIs.
- In `mobile/`, `npx expo export --platform all --output-dir /tmp/mossvale-native-billing-export`: local Android/iOS Hermes bundle export. This is not a native binary build or upload.

## Activation order

1. Review the catalog prices and storefront availability under bundle/package `world.mossvale.game`. Complete the activation and device checks below before submitting the product drafts. For Apple use app `6811825860` and an In-App Purchase key. For Google grant the billing service account access to this app, including purchase/financial reads and order management required by the provider API. Keep the JSON and `.p8` key server-side. [Apple API keys](https://developer.apple.com/documentation/appstoreserverapi/creating-api-keys-to-authorize-api-requests), [Google API setup](https://developers.google.com/android-publisher/getting_started).
2. Configure the Apple production and sandbox Server Notifications V2 URL as `https://mossvale.world/api/mobile-purchases/apple-notifications`. Configure Google RTDN topic/subscription to push to `https://mossvale.world/api/mobile-purchases/google-notifications`, using authenticated push. Set `GOOGLE_RTDN_AUDIENCE` to the exact configured audience, `GOOGLE_RTDN_EMAIL` to the push service-account email, and `GOOGLE_RTDN_SUBSCRIPTION` to its full `projects/.../subscriptions/...` name. Restrict topic publishing to `google-play-developer-notifications@system.gserviceaccount.com` and include one-time product and voided-purchase events in [notification settings](https://developer.android.com/google/play/billing/getting-ready#configure-rtdn). EU, US and Asia share the durable inbox, so one provider subscription per store is sufficient.
3. Supply identical verifier credentials and sandbox allowlist to all three realms (EU, US and Asia). Preserve their canonical shared PostgreSQL and Keycloak configuration. `MOBILE_PURCHASE_SANDBOX_ACCOUNTS` contains the existing 64-character account keys of designated test/review accounts, never emails or unverified client IDs. Apple review also uses sandbox transactions, so the supplied reviewer account needs this allowlist entry. Do not enable sandbox for every account. Apple production APIs can return HTTP 401 before the first production release ([Apple staff explanation](https://developer.apple.com/forums/thread/806452)); only allowlisted accounts may then retry sandbox, just as for Apple's transaction-not-found response. A successful retry still requires the signed receipt to match the app, product, transaction and saved purchase intent.
4. Validate configuration before rollout with the command below. Then follow the normal warned realm deployment. Confirm `/api/config` on EU, US and Asia advertises the intended store and all three servers can use their configured provider credentials. Credential syntax alone does not prove provider permissions or product availability.
5. Use a verified signed native build with billing included; iOS 1.0.2 build 15 has those modules. Use real iPhone/Android installs with Apple's sandbox/TestFlight and Google license testers. Keep real payment methods disabled during test runs. [Apple sandbox](https://developer.apple.com/documentation/storekit/testing-in-app-purchases-with-sandbox), [Google billing tests](https://developer.android.com/google/play/billing/test).
6. Run the device checklist below, save evidence without tokens or credentials, and review the final app/IAP drafts. The owner has authorized submitting all nine active Apple products. Supply their required genuine in-app review screenshots and functioning review-account checkout, then submit them with the app version. Keep Burned excluded. App Store/Play submission and release remain separate from build creation and testing.

Apple server activation must follow the [two-release production workflow procedure](../deploy/PRODUCTION.md#first-apple-purchase-activation): first deploy compatibility with the activation gate off, then configure the four secrets and activate on a fresh revision. Do not edit live BBA settings or regional `.env` files outside that workflow to bypass the final-save guards.

Load a private server environment through the existing deployment secret mechanism, or a restricted local env file, then run this read-only syntax check. It never contacts a store or prints credential values; a malformed Apple key now fails here instead of after a customer pays.

```sh
node --env-file=/absolute/private/server.env --input-type=module -e 'import { createMobilePurchaseVerifier } from "./src/mobile-purchase-verifier.mjs"; const verifier = createMobilePurchaseVerifier(); console.log({ configured: verifier.status(), notificationsConfigured: verifier.refundStatus() });'
```

## Signed-device acceptance checklist

| Scenario | Required result |
| --- | --- |
| Catalog | All nine active SKUs load localized store prices; missing prices cannot start checkout. |
| Purchase a boost and a cosmetic | Store confirms payment; original account/character receives exactly one reward; transaction finishes only after durable delivery. |
| Repeat receipt / restore across EU, US and Asia | No duplicate reward. Original character binding remains intact. |
| Cancel or slow/pending payment | No reward before payment. Cancellation releases the reservation; a later legitimate payment can still deliver. |
| Kill the app or disconnect after payment | Reopen, sign in and restore; paid transaction recovers once, without purchasing again. |
| Switch character/account/realm during checkout | Original account/character retains ownership; the current screen never redirects the reward. |
| Refund unused and activated boosts / cosmetic | Signed notification is durably recorded; remaining attributable benefit is removed once; past gameplay is preserved. |
| Notification test and retry | Provider test delivery receives 204, durable event exists, repeated delivery stays deduplicated. |
| Conflict or retired character | Paid obligation stays visible for support; no silent loss, substitute grant or recreated character. |
| Account deletion | Public/in-app flow works; unpaid expired checkout does not block it; financial records survive deletion. |

## Support queue

The release operator checks pending notifications, paid delivery conflicts and refund history gaps during testing and before release. These aggregate queries are read-only and intentionally omit player and payment identifiers:

```sql
SELECT platform, status, count(*) FROM mossvale_mobile_receipts GROUP BY platform, status;
SELECT platform, outcome, count(*), min(at) AS oldest_event_ms
  FROM mossvale_mobile_events WHERE applied_at IS NULL OR outcome IN
  ('support-review-required', 'retired-payment-support-required', 'unmatched-receipt-retained')
  GROUP BY platform, outcome;
SELECT name, state->'historyGap' AS history_gap FROM mossvale_mobile_sync WHERE state ? 'historyGap';
```

Use the authenticated player's checkout ID and character to locate a case privately. Restore first for transient delivery failures. For `payment-confirmed` or retired-character obligations, verify the provider order and recorded original entitlement; use the store's authorized refund process if delivery cannot be completed. Never delete a receipt, manually mark it delivered, grant an invented replacement or request the player's purchase token/password. `CONSUMPTION_REQUEST`, refund reversals and reconciliation history gaps require provider/support review; this code does not send financial responses automatically. Assign an operator and confirm support inbox delivery before opening paid purchases.
