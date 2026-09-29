# Chat translation

Players can choose a target language in chat. Translation is optional and off
until a Google Cloud Translation Basic (v2) API key is configured on the realm.
Original messages stay available, including when translation fails. Only player
chat is translated: World, Party and whispers. Selecting a language sends the
message text to Google. No player name, account or wallet metadata is appended.
Personal information typed into the message itself is part of that text.

## Enabling after billing approval

1. Use a Google Cloud project with Cloud Translation API enabled and billing
   configured. Restrict its API key to Cloud Translation and the realm server
   egress IP addresses. Keep the key server-side; never add a `VITE_` variable.
2. Set a **project-wide daily character quota** in Google Cloud before adding the
   key. For an initial low-volume setup, use at most **16,000 characters/day**
   shared by all realms and all other translation consumers of that project.
   This is 496,000 characters over 31 days, but pricing, other usage and Google's
   quota enforcement still apply; it is not a guarantee of a zero bill.
   Billing alerts alone do not stop requests.
3. Set `GOOGLE_TRANSLATE_API_KEY` through the existing realm secret configuration.
   Regional Docker Compose passes it through from the host environment file;
   configure the same project for EU, US and Asia. The key must not be committed.
4. Keep `CHAT_TRANSLATION_DAILY_CHARACTERS=5000` initially. This optional guard is
   **per realm, in memory**, resetting at UTC midnight and on every server
   restart. It complements the provider quota; it is not a durable billing cap.
   Setting it to `0` disables translation even with a key present.
5. Release through `.github/workflows/production.yml` on `main`, following the
   normal player-warning/final-save process. Verify translation separately in
   all three realms. No service has been activated by adding this integration.

[Google pricing](https://cloud.google.com/translate/pricing),
[quota configuration](https://docs.cloud.google.com/translate/quotas), and
[API key security](https://docs.cloud.google.com/docs/authentication/api-keys-use).

## Boundaries and verification

The authenticated WebSocket accepts only `{type: 'translateChat', messageId,
targetLanguage}`. The realm resolves the original text from the player's last
120 delivered chat receipts. A guessed ID cannot expose another player's
whispers or party chat, and clients cannot submit arbitrary text for translation.
Translation never changes original chat or moderation evidence.

Each account is limited to 120 translation requests/minute and four outstanding
requests, across characters and reconnects on the same process. Each realm
allows eight simultaneous Google requests. Requests time out after eight seconds;
errors retain the original message. The 2,000-entry, 15-minute memory cache and
inflight deduplication share successful translations by original text and target
language, after checking the requesting player's own receipt. Input characters
are reserved before requests, including failed requests that may have been billed.
Each distinct target language can incur a separate charge.

Run `npm run check:chat`. The server check uses real local WebSockets and stubbed
Google responses; it never uses real translation credentials or makes Google
requests. It covers receipt authorization, whisper isolation, strict request
validation, late responses after leaving the world, account limits, provider
request shape, Unicode character accounting, failure handling, caching and
concurrent request deduplication.

The chat displays an unmodified Google attribution badge from
[Google's official badge pack](https://docs.cloud.google.com/static/translate/images/google-translate-attribution.zip)
(`png/white-short.png`, saved as `public/ui/google-translate-attribution.png`).
The in-game selector identifies Google, and the privacy page links the provider's
data-use information and translation disclaimer.

Run `node scripts/check-chat-translation-browser.mjs` for desktop/mobile UI checks
with simulated provider replies and screenshots. These tests do not contact Google.
