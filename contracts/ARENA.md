# MOSS arena wagers

Direct, unrated 1v1 challenges can carry equal MOSS stakes. Both players accept
the amount, then each approves and funds their own stake in `MossvaleArena` on
Robinhood Chain (4663). The realm starts combat after a fresh check confirms both
deposits in the latest canonical contract state and both fighters are still
available. This is soft confirmation: combat does not wait for finality. Free
arena brackets are unchanged.

For 100 MOSS each, the winner receives 190 MOSS. The 10 MOSS tax burns 8 MOSS,
sends 1 MOSS to the configured treasury and 1 MOSS to the same fixed developer
wallet as the MOSS auction house. The tax is `pot / 20`, rounded down in wei;
indivisible split remainder burns. There is no internal MOSS balance or Gold debit.

## Settlement and recovery

- Signed terms bind both wallets, the equal stake, a unique match ID and deadlines.
  They are saved to both characters before either funding transaction is exposed.
- The current funding window is 10 minutes. Both deposits must be included by the
  funding deadline. The realm allows 150 seconds afterward to check recent chain
  state; this is not an added wait once both deposits are verified. Cancelled or
  disconnected funding invitations never start combat. Soft-confirmed funding is
  checked against current canonical contract storage; a submitted transaction or
  wallet receipt alone does not permit entry.
- Both deposits must appear in the same fresh canonical block before entry. The
  realm rechecks live matches and checks again before fixing a winning result. If a
  check confirms missing deposits or a closed escrow before the result is fixed,
  the match is cancelled with a draw/refund result. Any deposits remaining in
  escrow can be refunded. RPC errors or an uncertain read during a reorganization
  do not prove a deposit disappeared and do not change an already-played outcome.
- Forfeit or disconnect after combat entry (including countdown) loses the match.
  Draws and orderly realm shutdown sign a full refund. The realm saves one identical
  signed result to both characters before offering a payout transaction.
- A result is never replaced once fixed. If a later chain reorganization reverses
  a deposit or settlement, keep the same saved terms and result for checks and
  recovery. Winner settlement still requires both deposits in the contract; the
  timeout-refund path remains available under its original deadlines.
- Either participant can submit the saved result. The contract pays only the
  wallets in the original terms, once. The winner must claim before the displayed
  refund deadline (currently 60 minutes after creation). Gas is separate from MOSS stakes.
- A partially funded match can refund after its funding deadline. Any unsettled
  funded match can refund after `refundAfter` (currently 60 minutes after creation),
  even if the game or signing authority is unavailable. These refunds charge no tax.
  The original funding transaction contains the `Match` tuple needed to call
  `refund` directly through a compatible explorer or wallet. Anyone can submit it;
  only the original fighters receive the tokens.
- A crash before a durable outcome leaves the saved terms available for timeout
  recovery. A submitted but uncertain chain transaction must be checked before
  retrying. Deposits, payouts and refunds can appear complete after soft confirmation,
  while their saved recovery records remain. Records are removed only after
  finalized closure, or finalized expiry with no deposited funds. Pending records
  block wallet changes and account deletion.

## Configuration and release

### Deploy with a browser wallet

1. Create a separate Ethereum account in your wallet or secure key-management
   tool. Copy its public account address for the deployment form. Export that
   account's private key using the wallet's export function and save it directly
   into the private server configuration as `MOSS_ARENA_AUTHORITY_KEY`, consistently
   on all three realms. Never put the private key in this page, chat, source code,
   or a client `VITE_` setting. This authority signs match results and needs no ETH.
   Keep the key securely backed up for every realm and outstanding wager.
2. Obtain the existing public `TREASURE_TREASURY_CONTRACT` address. Both constructor
   arguments are permanent: `gameAuthority`, then `treasuryRecipient`. The token,
   developer recipient and 5% tax are fixed in the contract.
3. From the repository, run:

   ```sh
   npm run build:arena-contract
   node scripts/check-arena-deploy.mjs
   npm run dev
   ```

   Open `http://localhost:5173/arena-deploy.html` in a browser with an Ethereum
   wallet extension. If Vite reports a different port, use that port. The page
   also works at `/arena-deploy.html` after the game code is published.
4. Enter the two **public** addresses, then click **Connect deployment wallet**.
   Use a wallet holding ETH on Robinhood Chain mainnet, chain ID **4663**. This
   wallet pays deployment gas and can be different from the signing authority.
   Review the addresses, click **Deploy arena contract**, and approve that one
   contract creation in your wallet. No MOSS stake or token approval is needed.
5. Keep the transaction hash. Click **Check deployment** after it is mined. The
   page verifies the exact creation transaction, compiled runtime, signing
   authority, treasury, MOSS token, developer recipient and tax. It saves pending
   submissions before opening the wallet; a reload or ambiguous wallet error
   cannot start another deployment. Recover a missing hash from wallet activity
   and enter it in the recovery field. A reported failure must be checked before
   attempting another deployment; do not clear saved recovery state to retry.
6. Save the displayed contract address and public configuration. Follow the
   compatibility rollout below before enabling wagering. A mined deployment is
   separate from configuration, current canonical verification and activation on
   the game realms; activation does not wait for the finalized chain head.

The page sends the exact `public/contracts/MossvaleArena.json` creation bytecode,
built by Solidity **0.8.36**, optimizer enabled with **200 runs**, EVM target
**paris**, and source name `MossvaleArena.sol`. Recompiling with different settings
or source paths can change the metadata and fail the server's exact runtime check.
This contract deliberately rejects testnet and any chain other than 4663.
The [official Robinhood network settings](https://docs.robinhood.com/chain/add-network-to-wallet/)
list the mainnet RPC `https://rpc.mainnet.chain.robinhood.com`, native gas currency
ETH, and explorer `https://robinhoodchain.blockscout.com`.

The feature stays unavailable until all settings match a verified deployment:

```
MOSS_ARENA_CONTRACT=<separate MossvaleArena deployment>
MOSS_ARENA_AUTHORITY_KEY=<server-only signing key>
MOSS_ARENA_RPC_URL=<Robinhood mainnet RPC supporting canonical latest and finalized block reads>
TREASURE_TREASURY_CONTRACT=<existing treasury recipient>
```

Use the private Robinhood mainnet Alchemy URL for `MOSS_ARENA_RPC_URL`; replace
`<SERVER_ALCHEMY_API_KEY>` from the deployment page only in server secrets. The
realm verifies deployment, funding and current wager status at a **latest canonical
block hash**, with `requireCanonical: true`. It separately reads the **finalized
block hash** before removing saved recovery records. The activation preflight
checks both current escrow state and historical MOSS state through Alchemy.

Build with `npm run build:arena-contract`; validate with
`npm run check:arena-wagers`, `npm run check:arena`, and `npm run check:wiki`.
The constructor takes the signing authority address and treasury address.
The runtime, authority, fixed MOSS token, tax rate and recipients are verified
before funding is enabled. Embedded-wallet gas sponsorship permits only exact
saved stake approvals, funding calls, results and timeout refunds. iOS cannot
request MOSS wagering; browser wallet UI follows the existing native restrictions.

Deploy the game through `.github/workflows/production.yml`. First roll out the
compatible reader/writer code to every realm with MOSS arena configuration empty;
only then configure the same reviewed contract and authority on all realms. Older
writers do not preserve the new `arenaWagers` shared field. Do not roll back past
this compatibility version while any saved wager exists. Keep the original
contract and key configured until all its stakes are settled or refunded.

Use the [guarded arena activation](../deploy/PRODUCTION.md#first-moss-arena-activation)
for this configuration step. It accepts only `MOSS_ARENA_CONTRACT`,
`MOSS_ARENA_AUTHORITY_KEY` and the private Robinhood Alchemy `MOSS_ARENA_RPC_URL`,
verifies the contract's authority against the supplied key, and preserves the
existing treasury. Set `MOSSVALE_ACTIVATE_ARENA=true` only for a fresh second
workflow release after every realm runs compatible readers. Do not edit live
settings and restart the realms manually.

Creating this code or passing local tests does not deploy the contract, configure
realms, or enable wagering in production.

## Verified mainnet deployment

The arena deployed on Robinhood Chain mainnet (4663) is:

- Arena: `0x22f1b671d728a8e64f5553ed008c4f3d3a0fcdbc`
- Signing authority: `0xa72E0Da5fA5438ae8156835475BC078BD7c9dE1F`
- Treasury: `0xF44A6d7E2eca15771ad62291f621b31E9A13748a`
- Deployment transaction: `0xfdaae9894cb3e4d49f959de7e3dba79b5c4d28155cad99d564adfd6e0e7121bc`
- Runtime code hash: `0x14659e76a003cac854730e9847fd65e9d917dcb2169e0d894f675531f9aa15d5`

Activation uses the existing server authority key and private Robinhood mainnet
Alchemy RPC. The authority key and complete RPC URL remain in server secrets.
The contract takes a 5% tax from the combined pot. The guarded activation checks
the exact runtime and recipients before configuring any realm.

The compatible catalog-6 release `73fe09ff7feef21b69cf1ecc5d78afd755ca58a6`
was verified on EU, US and Asia before activation, including final saves,
configuration, asset bytes and WebSockets. Its matching wiki and statistics
published successfully in [production run 36126344492](https://github.com/trappyon/mossvale/actions/runs/36126344492).
