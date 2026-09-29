# Mossvale Wiki

Public, static game guide at **https://wiki.mossvale.world/**. The independent
`mossvale-wiki` Cloudflare Worker serves the built files; it does not run or restart
the game server and does not require player sign-in.

## Build and check

From the repository root, with Node 22.18+ and `npm ci` already completed:

```sh
npm run check:wiki
python3 -m http.server 4178 --bind 127.0.0.1 --directory wiki-dist
```

The check builds all pages, then checks local links, fragments, assets, catalog
coverage, search index, sitemap and page metadata, after type-checking the guides. Open http://127.0.0.1:4178/.

## Patch notes and keeping guides current

Add concise, player-facing entries to `patch-notes.json` in the same change as the
gameplay update. Describe what players can now do or what was fixed; omit commit
logs, internal implementation details and unshipped promises. Keep newest entries
first, use a UTC date (`YYYY-MM-DD`) and a stable entry ID, and preserve existing history.
Review affected guide prose in `data.ts` against the actual behavior, including
eligibility, costs, limits and failure cases. A patch note does not update prose.

CI requires a patch-note change when a pull request or main push changes `src/`,
`server.mjs`, or public models, UI, audio, textures, NFTs or contract assets. It
compares the PR merge-base/head or push before/head with fetched Git history. Wiki and
deployment-only edits do not require gameplay notes. To run the guard locally:

```sh
node wiki/check-sync.mjs --self-check
node wiki/check-sync.mjs origin/main HEAD
```

`data.ts` contains the guides and imports the game's monster, dungeon, class,
spell, region, item, recipe, achievement and title catalogs. Rebuild after updating game data.
`patch-notes.json` contains the release history. Keep
existing IDs and entries intact when adding updates; they back permanent article
URLs, the patch-notes index, homepage update link and search results.
Recheck prose against `server.mjs` when changing mechanics; prose is curated,
not automatically inferred. Every generated page records its source revision
in the `mossvale-source-revision` meta tag.

Build and publish from the same release checkout as the game, after integrating
both game and wiki changes. An older wiki worktree can contain outdated game
catalogs even when its article prose is current. Recipe checks cover carried
ingredients and all output kinds; profession tables distinguish base XP from
difficulty-adjusted XP.

`build.mjs` renders real HTML pages, copies only referenced game artwork and
builds the local search index. Articles work without JavaScript. Search and the
small-screen chapter toggle are enhanced by `client.js`. The self-hosted
Marcellus font uses the license in `assets/OFL.txt`.

## Publish

After a successful production rollout, `.github/workflows/production.yml` builds
and publishes the wiki from the exact checked game revision. It confirms EU, US
and Asia still run that revision before publishing and verifies the public wiki
afterward. Superseded or incomplete game rollouts cannot publish the wiki.

**One-time setup:** add the GitHub Actions repository secret
`MOSSVALE_WIKI_CLOUDFLARE_API_TOKEN` containing a Cloudflare API token authorized
to publish the `mossvale-wiki` Worker and its custom domain in the account listed
in `wiki/wrangler.jsonc`. Local Wrangler login does not configure this secret.
Until the secret is installed, the wiki job fails with an explicit setup message;
the preceding game rollout is already complete.

If wiki publication fails, rerun only the failed wiki job after fixing the cause.
This job has no game deployment steps and cannot restart any realm. For a
wiki-only correction, use a checkout matching the live game's revision, apply
the wiki correction, authenticate Wrangler to Daniel's Cloudflare account, then run:

```sh
npm run check:wiki
node wiki/verify-live.mjs "$(git rev-parse HEAD)" --realms-only
npx wrangler@4.131.1 deploy --dry-run --config wiki/wrangler.jsonc
npx wrangler@4.131.1 deploy --config wiki/wrangler.jsonc
node wiki/verify-live.mjs "$(git rev-parse HEAD)"
```

The custom-domain configuration creates the wiki DNS record and certificate.
For a committed wiki-only correction, set `GAME_REVISION` to the verified live
game revision when running `verify-live.mjs`; its argument is the wiki source
revision. This verifies both independently without restarting the game.

Do not deploy `cloudflare/wrangler.jsonc` to publish wiki changes: that config
belongs to the live game proxy. Verify the public homepage, article routes,
search, sitemap and an unknown path returning HTTP 404 after publishing.

## Monster images

`node wiki/render-monsters.mjs` regenerates the transparent reference portraits for the complete bestiary
from the game’s `makeEnemy` models, including training dummies and treasure goblins.
It loads the authored monster, training-dummy and treasure-goblin GLBs. To add one
new portrait, run `node wiki/render-monsters.mjs treasure-goblin --serve` and open
the printed URL. Without `--serve`, the script uses the agent-browser CLI. It
validates that every image is distinct and uncropped.
The published wiki serves PNGs and does not load Three.js.
