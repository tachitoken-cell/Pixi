# Game localization

English, Simplified Chinese (`zh-CN`) and Indonesian (`id`, Bahasa Indonesia) are
available before sign-in, at character selection and in Settings → Language.
The choice is saved as `mossvale-language` on this device. Without a saved choice, the first supported browser language
(English, Chinese or Indonesian, including `id-ID`) selects the language; other
languages default to English.
Storage failures keep the choice for the current session.

`src/localization.ts` localizes authored DOM text and accessible labels without
replacing controls, listeners, input values, game IDs or network messages.
Switching language does not reload or reconnect. English requires no mutation
observer. The localization observer ignores position/style/animation changes and
caches translated text with a bounded cache for each language.

English copy is the catalog key. `src/locales/zh-CN-ui.ts` and `src/locales/id-ui.ts`
contain interface text; the corresponding `zh-CN-game.ts` and `id-game.ts` files
contain gameplay names, descriptions and narrative. Keep Indonesian keys and
templates aligned with the Chinese catalogs when adding or changing copy.
Unknown messages retain their English source. Add a matching entry when changing
player-facing copy. Templates match a whole message and preserve `{0}` arguments
verbatim; do not recursively translate arbitrary arguments, which can be player
names. Use specific templates for known classes and other catalog values.

Player names, chat, report evidence and search history must remain as written.
Existing surfaces are excluded in `localization.ts`; mark new player-authored
elements `translate="no"`. Do not put an untranslated input/protocol value into
the catalog (for example, the deletion confirmation `I confirm`). Values used
for gameplay logic must come from state, never from localized DOM text.
Item and achievement search accepts the displayed translation and English.
Names accept Chinese Han characters through the shared client/server validator.

This catalog covers the game client. Account-provider pages, the wiki and the
statistics site are separate applications; they retain their own language.
No remote translation service receives game or player text.

Run `npm run check:localization` for catalog checks and real isolated guest
sessions in Chinese and Indonesian covering login, character selection, game
entry, inventory, settings, switching and persistence, dynamic text,
names/chat/input and phone layout.
Screenshots are written to `artifacts/localization/`. Also run `npm run build`,
`npm run check:wiki` and the relevant UI checks when updating a renderer.
