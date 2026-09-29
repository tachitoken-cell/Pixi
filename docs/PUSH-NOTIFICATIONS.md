# Mobile push notifications

The iOS and Android Expo app offers an optional notification prompt after the first world entry and keeps the same controls in Settings → Notifications. Players can enable the suggested world events and invitations, add daily return reminders explicitly, or choose Not now. The operating-system permission request appears only after an enable action. Dismissals and category choices, including opting out, are remembered for each account on this device; switching accounts does not inherit another player's consent. Foreground gameplay keeps its existing in-game messages, while background world and invitation alerts use the Android high-importance channel with sound and vibration, subject to device settings.

## Delivery

- World events: Instant Combat registration and world-boss respawns, on the device's most recently selected realm. Ordinary world events are capped at one alert per device per five minutes. Instant Combat signup alerts bypass this cooldown so a recent boss alert cannot hide the brief registration window; the same signup event still deduplicates across server instances.
- Invitations: friend requests, party invitations, and raid invitations reach the recipient account's opted-in devices even when a device was last registered on another realm. At most one invitation alert per device per ten seconds, shared across all realms. Existing party and raid invitations still require the recipient to be online and expire after their existing deadline; push does not create offline party membership or extend invitations. World events and invitations use high provider priority for timely delivery.
- Return reminders: when separately enabled, the first alert is after 24 hours without gameplay, then at most once every 24 hours while away. Activity on any realm, including desktop gameplay or a realm with push delivery disabled, resets the absence. Each opted-in device receives its own reminder. Activity is checked again before delivery, and each reminder expires after four hours.

Tapping a notification opens or resumes the app on the player's current realm; it does not interrupt gameplay to switch realms. The player still signs in and accepts an invitation through the ordinary game UI. Expired alerts do not grant access or rewards.

## Configuration and rollout

`config/mobile-push.json` contains the reviewed nonsecret delivery switch: `{"enabled":true}`. The server reads it from the deployed image. Changing it to `{"enabled":false}` disables delivery through `.github/workflows/production.yml`; restore `true` through the same workflow when ready. No regional host-file or environment change is needed for this switch. The file must contain exactly one boolean `enabled` field; invalid configuration prevents startup.

An explicit server-process `MOBILE_PUSH_ENABLED=0` or `1` overrides the file for local tests or separately provisioned environments. Other values, including an empty value, are rejected. Regional Compose does not forward this variable, so adding it to its `.env` file alone has no effect. Production verification expects the checked-in setting and detects a conflicting runtime override.

Expo push works without a server access token unless enhanced push security is enabled for the EAS project. `EXPO_ACCESS_TOKEN` remains an optional server-only credential for that mode; never commit it or place it in the native app or public configuration. Regional Compose does not forward it either: if enhanced security is enabled, privately provisioning this credential requires a separately reviewed runtime configuration change before activation. Do not turn off existing enhanced security to avoid that preparation.

This release enables delivery after APNs and FCM credentials are configured in EAS, preserving regional host Compose files and release guards. Native building, submission, store availability and physical-device delivery verification remain separate from game deployment.

The canonical PostgreSQL `DATABASE_URL` and account authentication are required. Push uses a separate connection pool and creates `mossvale_push_devices`, `mossvale_push_receipts`, and `mossvale_push_revocations` after player storage starts. Initialization and provider failures leave gameplay running. Delivery-disabled servers still accept valid revocations so disabling delivery does not prevent logout cleanup.

Release and verification:

1. Configure APNs credentials and Android FCM v1 credentials for the existing EAS project. Build fresh iOS and Android binaries containing `expo-notifications`; a website release alone cannot add native push support.
2. Confirm whether the EAS project requires enhanced push security and provision its private server token first if needed. Then change the checked-in delivery switch to `true`, include patch notes, and deploy through `.github/workflows/production.yml`. Preserve the normal warnings, final saves, and three-realm verification. Verify `mobilePush.enabled` after activation.
3. Install the new binaries on physical devices. Verify permission denial, explicit enablement, each category toggle, foreground suppression, background delivery, tap-to-open, realm switching, logout, and account switching. Native submission, store availability and actual device delivery are separate checks; successful provider credential validation does not prove notification display.

## Storage and API

`POST /api/notifications/register` requires the normal bearer access token. The JSON body is `{token, platform, preferences, revokeSecret}`. `platform` is `ios` or `android`; `preferences` contains exactly the boolean fields `worldEvents`, `invites`, and `reminders`; `revokeSecret` is a random 64-character lowercase hexadecimal capability. Registration returns `{registered:true,preferences}`. Each account can register at most five device tokens. A device token belongs to its most recently registered account and realm.

`POST /api/notifications/unregister` accepts `{token,revokeSecret}` without an access token and returns `{registered:false}` whether or not a matching registration remains. Only SHA-256 hashes of the revocation capability and token-capability pair are stored. Native logout queues this capability for retry if offline; it does not retain an old login token. Rotating the capability on a new registration ensures a delayed old logout cannot remove the new registration. A hash-only revocation fence lasts 24 hours and rejects a delayed registration that arrives after its logout, even when no device row existed at logout time.

The server stores tokens, preferences, activity timestamps, and receipt IDs privately. The app keeps its own notification preferences and revocation capability in native secure storage. Tokens are removed after 90 days without registration refresh, on account deletion, and when Expo reports `DeviceNotRegistered`. A pending deletion fences further delivery. Receipt cleanup matches the registration capability so a late receipt cannot remove a newer registration.

## Reliability and checks

Atomic PostgreSQL claims deduplicate overlapping realm processes and preserve cooldowns and reminder state across restarts. Delivery is best effort: each event has one send attempt, and an uncertain provider response is not retried. This can miss an optional alert during an outage. Invitations and events carry expiry times and provider TTLs. The worker sends batches of at most 100 with one second between requests per realm, and checks durable Expo receipts after 15 minutes. A successful Expo ticket is not proof that a device displayed the alert.

Run `npm run check:push` and `npm --prefix mobile run check`. The PostgreSQL portion is `node scripts/check-push-notifications.mjs`. It uses an isolated local PostgreSQL schema with either `TEST_DATABASE_URL` or a disposable Docker PostgreSQL container, and a mocked Expo endpoint. It verifies real concurrent SQL deduplication, preferences, realm routing, inactivity, revocations, stale receipts, account deletion, and provider failure behavior. It does not send real notifications or prove physical-device delivery.

Provider references: [Expo setup](https://docs.expo.dev/push-notifications/push-notifications-setup/) and [Expo sending and receipts](https://docs.expo.dev/push-notifications/sending-notifications/).
