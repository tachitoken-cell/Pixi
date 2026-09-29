# Turnkey embedded wallets

Turnkey adds an optional, player-controlled browser wallet. Players continue with their existing Keycloak game account, approve wallet linking and approve each transaction. Existing auction escrow, signed voucher claims and NFT permissions remain authoritative. Eligible game actions use Alchemy's onchain paymaster with Turnkey signing. The paymaster pays fees without transferring an ETH allowance to the player. Turnkey Enterprise is not required.

The integration stays disabled until its runtime configuration is supplied. Organization provisioning and Auth Proxy setup are separate from gas funding and the guarded game release; dashboard setup alone does not deploy or activate the feature.

## Billing

Turnkey PAYG or Pro supplies wallet signing; there is no plan toggle in the game. The sponsored path uses raw Turnkey signatures and Alchemy Wallet APIs. Manual player-paid transfers still use Turnkey Transaction Management. Review current [Turnkey pricing](https://www.turnkey.com/pricing) and transaction-management charges before activation.

Alchemy mainnet sponsorship requires its PAYG plan and available Gas Manager credits. Use **Onchain Paymaster**, not Bundler Sponsored Operations or ERC-20 fee payments. As verified September 24, 2026, the [Gas Manager FAQ](https://www.alchemy.com/docs/wallets/reference/gas-manager-faqs) lists a zero default mainnet credit allowance and an 8% PAYG administration fee on covered gas. Compute usage and Turnkey signatures are separate. A purchased plan does not activate realm configuration.

The same server-only `ALCHEMY_WALLET_API_KEY` routes the two default Robinhood mainnet RPC URLs through Alchemy for auction, store, voucher and NFT verification. They share one paced request queue and immutable block-hash cache. Explicit custom RPC URLs, direct statistics reads and testnets retain their configured routes. With no key, existing public routing remains; with a key, provider errors never fall back to public or weaker block reads. No private endpoint is exposed in browser configuration. Ordinary production releases verify Alchemy's current and finalized canonical state before player warnings, even after the Turnkey activation gate is disabled.

## Configuration

Leave both variables unset until the organization and managed Auth Proxy are configured:

```dotenv
TURNKEY_ORGANIZATION_ID=
TURNKEY_AUTH_PROXY_CONFIG_ID=
```

Both values must be valid UUIDs from Turnkey. A missing partner or invalid value prevents the realm from starting. With neither set, `/api/config` omits `turnkey` and embedded wallet support stays disabled. With both set, the endpoint exposes the public IDs and gas-funding availability:

```json
{
  "turnkey": {
    "organizationId": "<Turnkey organization UUID>",
    "authProxyConfigId": "<Turnkey Auth Proxy configuration UUID>",
    "gasFunding": false,
    "collections": {}
  }
}
```

`gasFunding` becomes `true` when the realm has enabled gas funding; it does not guarantee that a particular action or budget will qualify. These IDs are public. Do not put API private keys, wallet keys, session credentials or root credentials in runtime public configuration, `VITE_*` variables, repository files or client bundles.

The pinned browser dependencies include `@turnkey/core@2.12.0`, `@turnkey/iframe-stamper@2.11.1`, `@turnkey/viem@0.14.43`, `@alchemy/wallet-apis@5.2.7` and `viem@2.56.8`, alongside ethers v6. The [Core SDK setup](https://docs.turnkey.com/solutions/embedded-wallets/integration-guide/typescript/getting-started) uses the two public IDs above; no parent signing key belongs in the game client.

In the Turnkey dashboard, open **Embedded Wallets → Configuration**, enable **Auth Proxy** and **OAuth**, then save. Keep the existing OTP configuration for any previously created OTP wallets; the game now starts its own Keycloak OIDC flow. Allow these exact origins:

```text
https://mossvale.world
https://us.mossvale.world
https://asia.mossvale.world
```

For a separate development configuration, add `http://localhost:5173` and, if used, `http://127.0.0.1:5173`. Replace the default `*` origin rule; partial wildcard origins are unsupported. Enable verified account lookups: the SDK supplies the OIDC token before looking up the account. See [Auth Proxy configuration](https://docs.turnkey.com/features/authentication/auth-proxy). The wallet UI does not render a captcha widget; enabling the dashboard captcha requirement needs a matching client integration first.

Use the same parent organization and Auth Proxy configuration on all production realms. New player sub-organizations receive a `Mossvale Wallet` with a secp256k1 Ethereum account at `m/44'/60'/0'/0/0`. Wallet authentication uses a fresh Keycloak ID token tied to a device-generated Turnkey session key; linking still requires the existing ownership signature. The player controls the wallet. Alchemy receives signed operations, never the player wallet key. Its API credential stays on the server.

An unexpired wallet session is restored after a page reload or game sign-in redirect on the same origin. Leaving the page invalidates its in-memory wallet connection without removing the saved session. Explicit wallet or game sign-out clears that session; expiry requires a fresh Keycloak authorization, normally satisfied by the existing SSO session. Browser storage is origin-specific, so navigating to another realm hostname requires a fresh device session for the same wallet identity. Switching realms inside the game keeps the page origin and wallet session; wallet configuration and sponsored requests follow the selected realm. Returning to character selection or switching realms cancels open wallet reviews, while saved pending submissions remain recoverable.

Keycloak must expose its realm discovery and JWKS publicly, use RS256 ID tokens, allow the realm origin for browser token exchange, and allow the existing `/auth-callback.html` redirect URI. The wallet uses S256 PKCE, random one-use state, a nonce equal to SHA-256 of the UTF-8 Turnkey public-key hex string, and signed ID-token issuer/subject/audience/expiry checks. It verifies that the token belongs to the currently signed-in game account before completing Turnkey OAuth. Access and refresh tokens are not stored by this flow. The local session binding contains only issuer/subject/client ID plus Turnkey organization/user IDs and the public device key. See [bring your own authentication](https://docs.turnkey.com/features/authentication/bring-your-own-auth) and [Auth Proxy OAuth](https://docs.turnkey.com/features/authentication/auth-proxy).

Identity follows Keycloak issuer, subject and client ID, never email. Do not change the issuer/client ID casually: it changes wallet identity. Existing OTP wallets are not merged by email and must be accessed using their original recovery method; migrating one requires a separately authorized `createOauthProviders` link from that wallet's existing session. No player OTP wallets were created or migrated during local implementation. Keycloak OAuth acceptance and real signup/return login still need provisioned end-to-end verification.

**Options / Settings → Wallet**, immediately below Graphics, opens wallet management inline in Settings and shares the same session as the game wallet chooser. Players can view MOSS/ETH balances, copy a receiving address, transfer MOSS/ETH, view and transfer owned Mossvale NFTs, resume pending submissions, open explorer activity, disconnect or back up. NFT discovery uses Blockscout only for token IDs (at most three pages), then verifies ownership and local catalog identity on-chain; a manual collection/token-ID path remains available when discovery fails. Only the configured pet, legacy pet and house collections are supported. `/api/config` exposes those public addresses under `turnkey.collections`.

Manual transfers always use the player's ETH. Review shows the exact asset, amount or token ID, recipient and maximum fee. Ownership, balances, nonce and fees are checked again after approval under the same durable submission lock used for game payments; increased fees require a new review. Sending uses ERC721 `safeTransferFrom`, exact MOSS `transfer`, or a native ETH transfer and never requests sponsorship. The local fee guard limits manual transfers to one million gas and 100 gwei maximum fee per gas.

**Back up wallet → Reveal recovery phrase** uses Turnkey's isolated `https://export.turnkey.com` iframe. The game passes an encrypted export bundle; recovery words are shown inside that separate origin and the frame is removed on close. They must never be copied into game state, logs or server requests. See [Turnkey wallet export](https://docs.turnkey.com/features/wallets/export-wallets).

## Fee-only gas sponsorship

After player approval, the browser uses `/api/turnkey/wallet`. The client targets the selected game realm, and the authenticated endpoint accepts only prepare, submit and status operations. Cross-origin requests are allowed only from the configured game realm origins, using a bearer token without cookies. It requires the active character and linked wallet on this realm and matches the exact call to a current saved game action. The server injects its private Alchemy policy and binds the returned user operation to the approved call. The browser verifies the chain, account delegation, exact call and zero player fee before signing with its pinned Turnkey session.

The reviewed EIP-7702 delegate preserves the wallet address on Robinhood Chain (4663). Sponsorship pays execution fees without crediting player ETH. Players still supply any purchase amount. MOSS auction purchases bundle the exact token approval and the saved purchase into one atomic `executeBatch` operation, reviewed once in the Buy modal. Only that ordered pair for the same active reservation is eligible; additional calls, changed amounts, destinations or order data are rejected. The batch uses the existing purchase intent and one gas reservation. Legacy single-call journals remain recoverable in Settings → Wallet → Activity. Exact standalone MOSS approvals, current auction purchases, sale withdrawals to the linked wallet, quoted store purchases, saved voucher claims and eligible pet mints remain supported. Manual transfers, house bids, house settlement/refunds and NFT migrations are not sponsored. Failure never silently switches an approved sponsored action to player-paid gas.

Configure these private runtime values together on every realm:

| Variable | Value |
| --- | --- |
| `ALCHEMY_WALLET_API_KEY` | Dedicated Mossvale app key, server-only. Enable Robinhood Chain and Bundler. |
| `ALCHEMY_GAS_POLICY_ID` | App-linked Onchain Paymaster policy restricted to chain 4663. Keep server-only. |
| `TURNKEY_SPONSOR_MAX_OPERATION_WEI` | Positive integer worst-case fee cap per operation. |
| `TURNKEY_SPONSOR_ACCOUNT_DAILY_WEI` | Positive integer fee cap per account per UTC day. |
| `TURNKEY_SPONSOR_WALLET_DAILY_WEI` | Positive integer fee cap per wallet per UTC day. |
| `TURNKEY_SPONSOR_GLOBAL_DAILY_WEI` | Positive integer aggregate fee cap across all realms per UTC day. |
| `TURNKEY_SPONSOR_GLOBAL_DAILY_OPERATIONS` | Positive integer aggregate reservation count per UTC day; unsettled operations carry over. |
| `TURNKEY_SPONSOR_MAX_FEE_PER_GAS_WEI` | Positive integer accepted maximum gas price. |

No spending limit is chosen implicitly. Missing configuration disables sponsorship; partial or invalid configuration prevents startup. Configure Alchemy's independent USD and transaction limits as well, and fund credits only after an approved spending ceiling. Never publish the API key in frontend variables, logs, source control or public configuration.

The approved launch ceiling is $10/day and $100/month for gas, excluding provider fees. The initial Alchemy policy is capped at $0.10 per operation, $5 per wallet and $100 total lifetime. Set the shared daily reservation count to 100 per UTC day; unsettled prior-day operations also count. This conservatively reserves the policy maximum per action rather than relying on an ETH/USD estimate. The $100 policy cap does not reset automatically: review usage before renewal, and never renew past the approved monthly ceiling. Smaller actual fees do not increase the initial 100-operation daily allowance. The separate wei caps remain additional defenses.

The prepared production settings use 200000000000000 wei per operation (0.0002 ETH), 1000000000000000 wei per account and wallet per day (0.001 ETH), 5000000000000000 wei globally per day (0.005 ETH), and 200000000 wei per gas (0.2 gwei). These are additional ceilings, not ETH allowances or USD conversions. Alchemy's USD policy can reject an operation below these wei limits. The activation gate remains off until the compatibility release and live provider preflight pass.

All realms use the canonical PostgreSQL database and durable operation records. The server persists budget reservations and exact prepared/signed submissions; uncertain results are retried with the same operation, never regenerated. Finalized expiry with an unchanged operation nonce proves an expired authorization unused and permits a new review. Ambiguous expired operations retain their saved payment state, while their full budget reservation remains charged through the expiry-proof day. Preserve the sponsorship tables in backups. The browser also journals before submission and uses one cross-tab wallet lock. Auction, store and voucher receipt validation requires the authorized successful EntryPoint operation and exact game event, followed by canonical chain/finality checks. An outer bundle's success alone is insufficient.

The old `/api/turnkey/gas` endpoint is retired. No ETH-top-up signer or funding wallet is used. Existing credited funds, if any, would remain player-owned; deleting old grant history is not part of this change.

## Existing wallets and native apps

- A new embedded wallet has a new address. Existing balances, NFTs and auction proceeds do not move automatically; players retain their existing wallet and approve any transfers separately.
- Finish active wallet listings, reserved payments, store orders and NFT quotes before changing the linked wallet. Existing server checks enforce this boundary.
- Saved voucher payouts retain their original recipient and amount. Collect them using that original wallet; linking Turnkey does not redirect a claim. New vouchers still require the current linked wallet to meet the MOSS holdings requirement and the account's daily redemption limit.
- MOSS and NFTs use Robinhood Chain 4663. Paying gas does not change purchase prices, auction taxes, token approvals or NFT eligibility.
- Embedded wallet selection is disabled in the native app's `/wallet-action` handoff. Native vouchers keep their external wallet approval flow. Native MOSS auctions and NFT minting remain unavailable; this browser integration does not change their support.

## Verification and release

Using the project's required Node.js version (22.18 or newer), run `npm run check:turnkey`, `npm run build` and `npm run check:wiki`. The sponsorship check uses a disposable local PostgreSQL database and a mocked chain; it never sends real funds.

After provisioning, verify Keycloak signup and return login on each origin, wrong-account rejection, session expiry/logout, recovery export, approval/rejection and ownership linking with a test account. Verify ETH/MOSS/NFT transfers, insufficient balances, recipient review, higher-fee rejection and manual NFT lookup. Verify eligible auction approvals/buys/withdrawals, store approval/buy, saved voucher collection and pet NFT minting with real funded transactions on Robinhood Chain. Check that a denied action or cap failure sends no player transaction; that wrong-recipient and changed-calldata requests receive no sponsorship; and that reloads, lost responses, restart and simultaneous realm requests cannot create a second operation. Confirm the specific successful user operation and game receipt, then the actual inventory, proceeds, payout or NFT ownership. Local mocks and passing builds do not prove these provisioned flows.

Normal deployment remains `.github/workflows/production.yml` on `main`, including each realm's five-minute warning and final save. Configure the same public IDs on EU, US and Asia and verify the completed release and each realm's `/api/config`; public IDs or passing local tests alone do not prove activation.

The initial compatibility release `d0d1932a8cb6bb731fa4913d957b01f3f7bfdab5` ships the wallet code disabled. The subsequent compatibility revision `fa3939323b39447fffd372dee72216199c6d5993` adds active-realm routing and CORS with the gate off and the original regional Compose file. Verify that corrected revision on all three realms before adding runtime wallet settings. EU reads runtime variables from its private BBA environment. US and Asia use each host's existing `deploy/ovh/.env`; the separate activation revision adds the ten optional Compose environment entries below.

Supervised activation must pass both public IDs and the gas variables listed above through the regional game's Compose environment. Keep existing entries intact and reconcile the installed host files with the candidate's release manifest before the guarded release; preparation checks their exact hashes. The optional entries in `.env.example` document that configuration. Dashboard provisioning does not apply realm settings, purchase gas credits or trigger a deployment. The existing Dockerfile copies all `src` modules for the build and runtime, so no new HTML entry or Docker copy rule is needed.

## Guarded production activation

Activation requires two releases. First deploy this compatibility code through `.github/workflows/production.yml` with production environment variable `MOSSVALE_ACTIVATE_TURNKEY` absent or `false`, leaving Compose unchanged. Verify the release on all three realms and confirm authenticated EU `/api/deployment` contains `turnkeyHash: null`. This fingerprint covers exactly the ten activation settings; it never appears in public configuration. US/Asia preparation independently checks the installed runtime exports the same fingerprint implementation. Dashboard setup alone does not enable the game.

The second, separately reviewed activation revision adds only these entries to `services.game.environment` in `deploy/ovh/compose.yml`, preserving all existing entries:

```yaml
TURNKEY_ORGANIZATION_ID: ${TURNKEY_ORGANIZATION_ID:-}
TURNKEY_AUTH_PROXY_CONFIG_ID: ${TURNKEY_AUTH_PROXY_CONFIG_ID:-}
ALCHEMY_WALLET_API_KEY: ${ALCHEMY_WALLET_API_KEY:-}
ALCHEMY_GAS_POLICY_ID: ${ALCHEMY_GAS_POLICY_ID:-}
TURNKEY_SPONSOR_MAX_OPERATION_WEI: ${TURNKEY_SPONSOR_MAX_OPERATION_WEI:-}
TURNKEY_SPONSOR_ACCOUNT_DAILY_WEI: ${TURNKEY_SPONSOR_ACCOUNT_DAILY_WEI:-}
TURNKEY_SPONSOR_WALLET_DAILY_WEI: ${TURNKEY_SPONSOR_WALLET_DAILY_WEI:-}
TURNKEY_SPONSOR_GLOBAL_DAILY_WEI: ${TURNKEY_SPONSOR_GLOBAL_DAILY_WEI:-}
TURNKEY_SPONSOR_MAX_FEE_PER_GAS_WEI: ${TURNKEY_SPONSOR_MAX_FEE_PER_GAS_WEI:-}
TURNKEY_SPONSOR_GLOBAL_DAILY_OPERATIONS: ${TURNKEY_SPONSOR_GLOBAL_DAILY_OPERATIONS:-}
```

After verifying the compatibility release, prepare **each US and Asia host** through existing administration SSH access. Hold the existing release lock, verify the completed compatibility revision and unchanged host hashes, and preserve root-only backups. Stage and hash-check the reviewed files, compile the Python helpers without executing them, then atomically replace `release.py`, `ci-release.py`, and Compose in that order, fsyncing each replacement. Verify the installed hashes and unchanged container ID and start time.

The deployment forced command is already installed. Do not rerun `install-ci.sh`, modify SSH authorization or environment files, invoke Compose, or restart containers during preparation. The prepared file change intentionally blocks ordinary gate-off releases until the matching activation release runs; coordinate both hosts before enabling its gate. Only an explicitly gated Turnkey activation may reconcile these ten absent-to-empty placeholders, while preserving the exact old runtime fingerprint and rejecting every unrelated environment change.

Privately set Actions secret `ALCHEMY_WALLET_API_KEY`; set the other nine names above as production environment variables with the reviewed values and explicit limits. No budget has a default. Keep `TURNKEY_SPONSOR_GLOBAL_DAILY_OPERATIONS=100` with the reviewed Alchemy policy's $0.10 per-operation and $100 lifetime limits. Pin `MOSSVALE_EU_BBA_APP_ID` to the existing EU game app. The workflow prefers secret `MOSSVALE_BBA_API_TOKEN` and explicitly falls back to existing `BBA_API_TOKEN`; privately confirm that token can read and update the pinned game app before enabling the gate. Missing read access fails before player warnings; a successful read alone does not prove write scope. No app discovery or auth-app update occurs.

Enable `MOSSVALE_ACTIVATE_TURNKEY=true` only for the fresh second revision on `main`, through the normal production workflow. It first prepares both regions and checks their fingerprints. EU then gives its full five-minute warning and confirms its saved admission hold before a restricted BBA environment update recreates the compatible old code. After verifying that replacement's original revision, new instance, exact fingerprint and public configuration, EU gives a second full warning/save before promotion. US and Asia each complete their normal warning, verified backup and successful final save before the helper atomically writes the ten values to `.env` and starts the candidate. Each host retains a private `environment.before-turnkey` backup in that image's release record directory.

Before regional preparation or any player warning, the gated workflow runs `scripts/turnkey-activation-preflight.mjs`: it asks the configured provider to prepare an exact zero-amount MOSS approval for a random address on chain 4663 and independently verifies the returned sponsorship terms against the current EU auction. This probe signs nothing, submits nothing and funds no wallet; a failed preflight stops activation.

Retry the same activation revision with identical values after an interrupted rollout. An uncertain BBA settings request is observed, never blindly repeated; its pending old process must retain this release's final-save hold. Regional retries recover an interrupted environment write from its exact file hashes. Partial credentials, different budgets or identifiers, unrelated drift, failed saves and missing compatibility proofs stop activation. This path cannot rotate credentials or renew a gas policy. After completion, disable the activation gate for ordinary releases and independently verify the revision, health, wallet configuration, assets and WebSockets on EU, US and Asia.
