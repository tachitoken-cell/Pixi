# Required mobile app updates

At startup, the native app reads the existing uncached `/api/config` response before opening the game. An installed app below its platform's required version shows **Update required**, with a store button and **Check again**. It cannot continue into the game. Returning from the store checks again while this screen is open; ordinary gameplay does not trigger repeated checks or force an interruption.

The web sign-in bootstrap enforces the same policy for older installed apps when they load the updated website. Browsers are unaffected. Native apps that cannot report their installed version must update when a requirement is active for their platform. The store performs installation; Mossvale cannot silently install a binary. TestFlight players should update through TestFlight.

## Configuration

The server exposes `mobileAppUpdate`, for example:

```json
{"apple":{"minVersion":"1.0.3","minBuild":"14"},"google":{"minVersion":"1.0.3"}}
```

Edit `config/mobile-app-updates.json` to mark a release as required. The server reads this manifest from the deployed image; the same reviewed revision reaches EU, US and Asia through the normal production workflow. The initial manifest is `{}`, so all current app releases remain optional.

A build minimum requires a version minimum. Versions and builds use numeric dotted comparison (`1.10` is newer than `1.9`); a build minimum applies only when the installed version equals the minimum version. A newer version passes even if its build numbering starts again. Invalid policy values fail checks and server startup. Store destinations are fixed in the app, never supplied as arbitrary remote links.

## Release procedure

1. Publish and verify the target binary in the intended App Store, Play and testing tracks and regions. A successful build or submission is not store availability.
2. Mark only selected releases as required by raising that platform's minimum after affected players can obtain the update. Ordinary releases remain optional. Leave the other platform's floor unchanged until its required release is available.
3. Commit the manifest change with patch notes, run the checks below, and release through `.github/workflows/production.yml`. The normal five-minute warning, final save and three-realm verification still apply. This needs no host environment change or separate activation mechanism.
4. Verify startup blocking, store opening, installation, return/recheck and supported-version entry on physical Android and iOS devices. Failed update checks keep entry blocked and provide retry; a store-open failure stays on the update screen. A web release alone cannot replace the installed native binary.

The minimums can be lowered or cleared in the manifest through the same production workflow if a store release is unavailable. No minimum has been activated by this implementation.

## Checks

Run `npm run check:app-updates`, `npm --prefix mobile run check`, `npm run build` and `npm run check:wiki`. The tests cover policy validation, numeric comparison, unknown metadata, platform independence, bootstrap blocking, retry and existing authentication behavior. Physical store installation remains a separate acceptance check.
