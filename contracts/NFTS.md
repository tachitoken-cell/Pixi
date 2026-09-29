# Mossvale Pets and Mossvale Houses

Local implementation for Robinhood Chain (4663). This change does not deploy
contracts, publish OpenSea collections, configure production realms, or send any
real transaction.

## Player behavior

For the eight new drop pets, **Learn pet** and **Mint NFT** are separate choices.
Learning remains available even without the new NFT collection configured.
Minting is optional and requires that collection to be deployed and verified.

**Mossvale Pets:** an unlearned copy of an eligible pet and its free mint voucher are reserved and
saved together before the voucher reaches the player. The linked wallet reviews
and submits the claim, paying network gas. Once processed and verified, the NFT holder can
summon the species. Transferring the last NFT of a species removes the seller's
NFT access and companion; the recipient gains access after processed inclusion and wallet
verification. With V2 enabled, an owner can explicitly reserve an eligible
learned companion for conversion to an NFT; the reservation removes that unlock
until the claim is minted or safely expires, preventing duplicate character and
wallet entitlements. The review identifies whether a carried drop or eligible learned unlock
will be reserved. That selected source stays bound to the claim; changes require another review instead of silently consuming a different
entitlement.
Learned drop companions qualify. Store companions qualify only when backed by a
verified MOSS purchase, including its cosmetic-box rewards and archived purchase
records. Refundable native-store purchases remain character-bound so their
refund/revocation rules remain enforceable. Purchase history is not erased or
replayed to grant a duplicate unlock.

**Mossvale Houses:** the deed auctioneer offers all four Lanternreach cottages.
The collection owner opens their auctions once, with the same **$100 opening
reserve per house, quoted in MOSS**. The MOSS reserve remains fixed throughout
bidding. All four auctions run for exactly **four hours from the opening
transaction's execution**, independently of when the contracts were deployed.

A bid must meet the reserve and exceed the current highest bid. The contract holds
real MOSS: a new leader deposits the full bid, while the existing leader deposits
only the increase. The transaction binds that exact deposit, so displacement
while signing cannot unexpectedly increase the debit. Outbid deposits accumulate
as withdrawable refunds; they are not reused automatically. Leading bids cannot
be withdrawn.

At the deadline bidding stops. Anyone can settle an ended auction, paying network
gas. Settlement atomically **burns the entire winning MOSS bid** and mints the
unique deed directly to the winning wallet. It does not award the caller or hold
the deed in auction escrow. A smart wallet's receiver callback cannot block
finalization. No-bid lots remain unsold, and the auctions cannot be restarted.
The current NFT holder is the game's recorded owner of that house across realms.
Public interiors and furniture remain accessible; private interiors and player
decoration are separate features.

All collections specify a **5% resale royalty** to the same `MossvaleBuyBurn`
receiver. All collected royalties fund MOSS buy/burn. There is no additional 5%
charge on the primary house auction and no pet mint price.

The server polls ownership every five seconds and checks again when summoning.
Rights use holdings at the fresh current canonical head after deployment verification.
Observed outgoing transfers revoke access; verified incoming transfers grant access
without waiting for Ethereum finality. The server observes the current head and
requires its ownership read to finish within fifteen seconds. Rights expire
fifteen seconds after that current-head observation. RPC
errors preserve still-fresh ownership proof until that deadline; expired rights
stay hidden without deleting NFTs or learned pets. The selected NFT companion
returns after ownership verification recovers in the same
session. A verified transfer or linked-wallet change clears that selection;
this does not change summon persistence across reconnects.

Pet reservations and vouchers are saved atomically; retries reuse them. Verified
processed minting consumes the claim permanently. A later chain reversal does not
restore the consumed game collectible automatically; NFT access follows current ownership. A finalized unpaid expiry returns an
unlearned pet to the bags, waiting if they are full, or restores a converted
learned pet to the collection. Pending claims prevent wallet changes and
character/account deletion. Settlement also runs for offline accounts and after
realm restarts. House bids and refunds are held on chain and survive realm restarts.

## Permanent asset identifiers

Pet asset IDs 1–8 are Moss Fox, Moon Owl, Ember Drake, Crystal Tortoise, Bloom Hare,
Lantern Moth, Frost Cub, and Golden Pig. Pet token IDs derive from unique claim IDs;
metadata is shared by species. These original eight species no longer drop from
monsters. Existing learned pets, unlearned copies, claims and NFTs remain valid,
with the same asset IDs, images and ownership rules.

Pet asset IDs 9–16 append Fern Lynx, Moonveil Gryphlet, Cinder Salamander,
Amethyst Terrapin, Blossom Jackalope, Lantern Sprite, Rime Red Panda and Crown
Pangolin, in that order. IDs 17–18 are the store companions Ashwing and Cinder Kit.
Unlearned drops of the new species become NFT-eligible when the V2 pet collection
is configured. Until then they remain learnable and auctionable pet items.
Store purchases still unlock the receiving character. With V2 enabled, owners
can choose to convert learned drop pets and eligible MOSS-paid store unlocks into
transferable NFTs. Native-store unlocks remain character-bound. An unlock reserved
for conversion is restored if its unminted claim safely expires.

The original `MossvaleNFT` contract accepts only asset IDs 1–8 and cannot be
upgraded in place. The separate `MossvalePets` V2 contract accepts nonzero species
IDs authorized by a game-signed claim, so future species can append catalog IDs
and metadata without another contract replacement. The signing authority still
controls which species and claims may mint.

House asset/token IDs 1–4 identify `house-greenwood-1` through
`house-greenwood-4`, displayed as Lanternreach Cottage 1–4. Each deed has its own
trading-card image. These asset mappings cannot be reordered after deployment.

## Preparing deployment

The two initial inputs are public addresses: the **deployment/admin wallet** and
the **game signing authority**. The deployment wallet becomes both collection
owners and the initial buyback operator. The signing authority's matching secret
stays in server configuration; the setup tool never reads, creates, or accepts a
secret key. The deployment wallet needs Robinhood ETH for network gas.

Build with `npm run build:nft-contracts` and `npm run build:nft-metadata`.
Artifacts in `public/contracts/` contain ABI, bytecode, and runtime hashes. The
contracts use Solidity 0.8.36, Cancun EVM, and OpenZeppelin 5.6.1. Publish all
`public/nfts/` metadata and referenced pet/house images at their configured URLs
before opening the collections to players.

The setup CLI prints **unsigned review JSON only**. It checks chain, current code
hashes, owner, authority, collection names, metadata URI, MOSS token, exact 5%
royalty routing, and the fixed buyback infrastructure. It never broadcasts and
does not predict future contract addresses from nonces. Substitute real public
addresses for the uppercase placeholders below.

1. Prepare the shared fee receiver:

   ```sh
   npm run nft:setup -- --wallet WALLET_ADDRESS --authority AUTHORITY_ADDRESS
   ```

   Review and submit its deployment transaction through the deployment wallet.
   Read the actual `contractAddress` from the successful receipt. The constructor
   is `MossvaleBuyBurn(wallet, router, wrappedNative, permit2)`; routing uses the
   pinned Robinhood deployments. The receiver has no withdrawal method. Its owner
   chooses quotes for bounded swaps; this is a trusted price-setting role.

2. Use that deployed receiver to prepare both collections:

   ```sh
   npm run nft:setup -- --wallet WALLET_ADDRESS --authority AUTHORITY_ADDRESS --receiver RECEIVER_ADDRESS
   ```

   Review and submit each collection deployment from the same wallet. The
   constructor is `MossvaleNFT(houses, gameAuthority, royaltyReceiver, baseURI,
   collectionURI)`. `houses=false` creates **Mossvale Pets** and `true` creates
   **Mossvale Houses**. Base URIs are `https://mossvale.world/nfts/pets/` and
   `https://mossvale.world/nfts/houses/`; each collection URI appends
   `collection.json`. Names and 500-basis-point royalties are fixed by code.
   The constructor sets the owner to its actual deployment caller. There is no
   treasury or initial house purchase voucher.

3. Verify the three deployed addresses and configure all three realms:

   ```sh
   npm run nft:setup -- --wallet WALLET_ADDRESS --authority AUTHORITY_ADDRESS --receiver RECEIVER_ADDRESS --pets PETS_ADDRESS --houses HOUSES_ADDRESS
   ```

   | Variable | Value |
   | --- | --- |
   | `NFT_PETS_CONTRACT` | Deployed Mossvale Pets address |
   | `NFT_NEW_PETS_CONTRACT` | Retain only if a prior separate sixteen-species deployment was configured |
   | `NFT_PETS_V2_CONTRACT` | Optional explicit V2 address for custom deployments; the official activation pins a verified address for the original collection in source |
   | `NFT_HOUSES_CONTRACT` | Deployed Mossvale Houses address |
   | `NFT_FEE_RECEIVER` | Deployed shared MossvaleBuyBurn address |
   | `NFT_AUTHORITY_KEY` | Server-only secret matching the public `authority()` |
   | `NFT_RPC_URL` | Optional Robinhood RPC supporting finalized blocks and canonical block-hash reads |

   EU, US and Asia use identical deployments and asset mappings. Runtime and
   configuration mismatches disable NFT activity. With NFT configuration enabled,
   a mint outage cannot turn an original NFT-eligible companion into a permanent
   learned pet. With all NFT settings absent,
   original companion learning continues unchanged.

4. When the auctioneer and realms are ready, prepare the owner-only opening:

   ```sh
   npm run nft:setup -- --wallet WALLET_ADDRESS --authority AUTHORITY_ADDRESS --receiver RECEIVER_ADDRESS --houses HOUSES_ADDRESS --open-house-auctions
   ```

   This verifies that all four lots are unopened and unminted, obtains the shared
   store's fresh MOSS/USD price, rounds the $100 reserve upward to MOSS base units,
   and simulates `openAuctions(reserveWei)` without submitting it. Review the
   `opening` details and unsigned transaction, then submit from the owner wallet.
   Regenerate the quote immediately before approval if delayed: the contract fixes
   the submitted MOSS amount and has no USD oracle or quote-expiry check. The
   four-hour timer begins when this transaction executes. Confirm `AuctionsOpened`
   and the on-chain `auctionsOpenedAt`, `auctionEndsAt`, and `auctionReserveWei`.

All setup commands accept optional `--rpc URL`. Supplying already deployed
`--pets` or `--houses` verifies them and omits duplicate deployment transactions.
No private-key or broadcast option exists. Ownership transfers use two steps.

## Pet expansion and optional migration

Deployment preparation is read-only. Wallet approval deploys the V2 contract;
realm activation and an OpenSea URL change are separate steps.

Keep `NFT_PETS_CONTRACT` set to the original pet collection. First deploy the
dormant V2 support to EU, US and Asia with no V2 address activated. Older server
releases cannot safely settle or refund all expanded learned-pet claims.

After the wallet deploys V2 and its receipt, runtime, legacy address, authority
and royalty receiver are verified, activate the official collection in a second
reviewed source revision. Use the verified public V2 address as the default only
for the exact original Mossvale pet contract. Other legacy contract addresses
must not activate this default. Explicit `NFT_PETS_V2_CONTRACT` configuration
remains available for custom deployments.

Release that activation revision through `.github/workflows/production.yml`,
which gives each realm its warning and final save. The official activation needs
no Compose or environment change, manual BBA settings update, or host restart.
Keep learned-claim settlement in any rollback while those claims exist.
The legacy collection, fee receiver, authority and house contract stay configured.
Existing legacy claims continue
to settle against their original contract, and ownership checks accept both pet
collections. New claims use V2 when it is configured. A V2 verification failure
must disable its claims rather than silently minting new species on the old
contract or changing existing claims. New drop companions remain optionally learnable.

Migration is optional per token. The current holder first approves that exact
legacy token to the verified V2 address, then calls V2 `migrate(tokenId)` from the
same wallet. Migration atomically transfers the old token into permanent V2
escrow and mints one replacement with the **same token ID and species** to that
holder. If any step fails, neither change persists. There is no escrow withdrawal
or second replacement; direct legacy transfers to V2 outside this migration flow
must not be used. The old token remains on chain in escrow and is not burned.
The holder pays network gas, with no pet mint price. Players who do not migrate
keep using their legacy NFTs. Existing learned and store pets are not converted
automatically.

Prepare the unsigned V2 deployment with the original collection address,
verified authority, shared royalty receiver and existing house address:

```sh
npm run nft:setup -- --expand-pets --wallet WALLET_ADDRESS --authority AUTHORITY_ADDRESS --receiver RECEIVER_ADDRESS --pets LEGACY_PETS_ADDRESS --houses HOUSES_ADDRESS
```

The CLI verifies the existing deployments and simulates one `MossvalePets`
creation, returning the unsigned transaction and gas estimate. It does not
replace the original contracts or reopen house auctions. Review and submit the
creation through the deployment wallet, then use the actual successful receipt's
`contractAddress` to verify the result without preparing another deployment:

```sh
npm run nft:setup -- --expand-pets --wallet WALLET_ADDRESS --authority AUTHORITY_ADDRESS --receiver RECEIVER_ADDRESS --pets LEGACY_PETS_ADDRESS --houses HOUSES_ADDRESS --pets-v2 NEW_PETS_ADDRESS
```

Before activation, publish metadata IDs 17–18 alongside the existing 1–16 and
their images, then verify the deployed V2 runtime and configuration. Release the
dormant game support first; the subsequent reviewed activation revision pins
the verified public address for the original Mossvale collection and follows
the same production workflow.
Verify finalized legacy and V2
ownership, new-species minting, failed/repeated migration protection, and wallet
transfer behavior across all three realms before reporting activation complete.
Final deployment and player migration transactions require wallet approval.

### Keeping the OpenSea collection link

A new contract has a different on-chain address; its asset URLs therefore change.
OpenSea documents a support-assisted process to migrate a redeployed collection's
collection URL and applicable badging. It recommends deploying the replacement
from the same wallet as the original collection. **The existing collection URL
can only be retained if OpenSea completes that migration; this is not automatic
or guaranteed by the contract. Collection statistics cannot be migrated.**

After deployment, request the collection URL migration through OpenSea support,
providing the old and new contract addresses and the existing collection URL.
Do not promise the original URL until OpenSea has confirmed the switch. Holders'
optional token migrations and the marketplace URL migration are separate steps.
See [OpenSea's collection redeployment guidance](https://support.opensea.io/en/articles/8867032-how-do-i-redeploy-my-collection).

### Local wallet handoff

Run `node scripts/nft-deploy.mjs` and open `http://127.0.0.1:5199` in a browser
with an Ethereum wallet extension. Its default public deployer and authority
are the verified Mossvale addresses shown on the page; override them only at
startup with `--wallet PUBLIC_ADDRESS --authority PUBLIC_ADDRESS` if needed.
For the single V2 expansion, retain the existing public addresses:

```sh
node scripts/nft-deploy.mjs --expand-pets --receiver RECEIVER_ADDRESS --pets LEGACY_PETS_ADDRESS --houses HOUSES_ADDRESS
```

This mode simulates and reviews only `MossvalePets`; it preserves the existing
receiver, original Pets and Houses. Its recovery history is stored separately
from initial deployment. Once its exact creation receipt is verified, it offers
no further deployment. Optional `--rpc URL` and `--port NUMBER` select the
read-only RPC and local port.
The server binds only to loopback, reads the chain, and never signs or broadcasts.

Connect the displayed deployer wallet on Robinhood mainnet, review each exact
creation and estimated gas fee, then approve it in the wallet. Use **Refresh
verification** once its successful creation is mined; deployment does not wait
for finality. The page verifies
sender, calldata, canonical receipt, and runtime at a fresh canonical head before
offering the next stage (historical contract state is not required):
receiver, Pets, then Houses for initial setup, or just Pets V2 for expansion.
Initial auctions remain unopened; expansion does not alter existing auctions.

Browser storage records the submission before requesting a wallet transaction.
If a submission becomes uncertain, deployment stays blocked after reload. Recover
its transaction hash from wallet activity or the linked explorer and use **Verify
recovered hash**. If no hash is available, retain the saved history and have the
wallet nonce checked before retrying; do not clear storage or switch browsers to
bypass recovery. Save the three verified addresses and configure all three realms as
above. Run `node scripts/check-nft-deploy.mjs` for the focused handoff checks.

## Production expansion deployment

Robinhood Chain mainnet (4663), deployed by the original collection owner:

- Original pets: `0xF1bc2AB7401601993886DAF61839B874E7F10eAD`.
- Expandable pets: `0xe86B214d38bEC528393309b0eC12e3c19dfac2F6`.
- Creation: `0x77da93feb8b718274936a8fcb0ab5a46a39d5da9bf8c4c70017b67a92cd1c1e3`.

The game selects this expansion only for that exact original collection. It verifies
its runtime, legacy link, authority and fee configuration before enabling claims.
Custom deployments keep the explicit `NFT_PETS_V2_CONTRACT` option. The original
pets/houses configuration remains intact; both generations remain usable.

## OpenSea and resale royalty collection

ERC-2981 advertises the 5% fee; it does not make every marketplace collect it.
OpenSea's enforcement flow requires the collection's transfer validator and its
supported Seaport zone/Studio configuration. `MossvaleNFT` exposes the documented
`ICreatorToken` validator hook. Its owner must configure a verified Robinhood
validator deployment and test an actual sale before claiming enforced royalties.
The validator is unset at deployment; no verified Robinhood validator address is
supplied by this change. Configuring it can restrict unsupported transfer paths.

Verify the deployed collections in OpenSea Studio under the exact contract names,
publish metadata, configure the creator earnings receiver, and verify an actual
seller-to-buyer sale plus both players' refreshed ownership. Marketplace fees and
gas are separate from Mossvale's 5% royalty.

Sources: [OpenSea metadata](https://docs.opensea.io/docs/metadata-standards),
[collection metadata](https://docs.opensea.io/docs/contract-level-metadata),
[creator fee enforcement](https://docs.opensea.io/docs/creator-fee-enforcement),
[creator earnings setup](https://support.opensea.io/en/articles/8867026-how-do-i-set-creator-earnings-on-opensea),
[ERC-2981 payment currency](https://eips.ethereum.org/EIPS/eip-2981).

## Processing resale buy/burn

Royalties arrive in the sale currency and require a separate processing
transaction. Anyone can call `burnMoss(amount)` for MOSS already held by the
receiver. Its owner can call `buyAndBurn` for other receipts. Receipt alone does
not run a swap. Primary house auction burns happen directly in the house contract
at settlement and are not included in the receiver's `totalMossBurned` counter.

`npm run nft:buyback -- --receiver RECEIVER_ADDRESS --token ETH --amount AMOUNT`
prepares a transaction only. Supported currencies are ETH, WETH, RBLX, and MOSS,
all with 18 decimals. Optional `--operator WALLET_ADDRESS` verifies the owner;
`--rpc URL` selects the RPC. No private key or broadcast option is accepted.
Submit the reviewed transaction from the required wallet, then verify
`MossBurned`/`BoughtAndBurned`, `totalMossBurned`, and actual MOSS supply reduction.
Unprocessed balances remain in the receiver; unsupported currencies need a
reviewed supported route before processing.

ETH/WETH uses the deployed Uniswap V3 WETH/RBLX pool followed by V4 RBLX/MOSS;
RBLX uses V4 directly. The quote builder pins code and pool identity, obtains fresh
executable quotes, applies a 1% output tolerance and five-minute deadline, and
constructs the deployed router's ABI. The operator must assess fair value: market
quotes and the sampled MOSS/USD reserve price are not manipulation-resistant
oracles. The tool does not schedule recurring transactions. The receiver enforces
exact input spending, minimum new MOSS output, cleared allowances, and actual
burn/supply reduction atomically.

## Verification

Run `npm run check:nfts` and `npm run build`. NFT checks cover real local EVM
execution with actual MOSS runtime, signed pet claims, four-hour funded auctions,
exact top-ups and displacement races, refund accounting, primary burn rollback,
permissionless winner minting, unique deeds, NFT transfer entitlements, 5% royalty
routing, validator rejection, server/save/restart flows, browser payment guards,
metadata, deed assets, and staged unsigned deployment preparation.

`node scripts/check-nft-buyback.mjs --live` additionally simulates the real Robinhood
router/pools/token using RPC state overrides. These checks send no transaction and
do not publish a collection or prove a production OpenSea sale.
