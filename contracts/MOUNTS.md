# Mossvale Mounts

Mount NFTs use the separate `MossvaleMounts` ERC-721 collection on Robinhood Chain mainnet (4663). The existing pet and house contracts are unchanged. Minting exchanges one unlearned mount item or one learned eligible mount for a transferable NFT at zero MOSS cost; the wallet pays network gas. Store mounts require a verified MOSS purchase; refundable native purchases cannot become NFTs. Ownership is checked at a fresh canonical latest head before granting riding access. Successful processed mints do not wait for Ethereum finality.

Permanent asset IDs live in `MOUNTS.nftAssetId` in `src/travel.ts`:

| Asset ID | Mount |
| --- | --- |
| 1 | Verdant Revenant |
| 2 | Embermane |
| 3 | Cinderfang |

Briar Horse (`horse`) and Moonfang Wolf (`wolf`) have no NFT asset ID. They remain vendor unlocks and cannot be claimed as NFTs. Published IDs must never change or be reused.

## Production collection

Robinhood Chain (4663) deployment: `0xADd54eB402EC8E40CacFaF2e35ae962b225851E2`, created by transaction `0xc65d402fa42741b98632d6546a40f72cab3709d7d01dd4f7be42bf1a6b30bc66` in block `0x429b631`. Verify finality and configuration before releasing the activation.

The production default applies only to the original pets collection `0xF1bc2AB7401601993886DAF61839B874E7F10eAD`. Custom deployments must configure their own mount address. An explicit `mountsContract` option or `NFT_MOUNTS_CONTRACT` overrides the default; an empty string disables mount minting. The realm still checks finalized runtime, authority, token, royalty receiver and catalog capacity before enabling claims.

## Prepare the separate collection

The artifact is `public/contracts/MossvaleMounts.json`. Rebuild with `npm run build:nft-contracts`; its reviewed runtime hash is `0xfcbaf6262d1a033ca4ef38a15668f4893ef52e6cc2cb0f48323142fde26dc3c7`. The constructor is:

```solidity
constructor(address gameAuthority, address royaltyReceiver, uint256 initialMaxAssetId,
    string baseURI, string collectionURI)
```

Use the current public authority and receiver addresses. `initialMaxAssetId` is 3. Metadata defaults to `https://mossvale.world/nfts/mounts/` and `https://mossvale.world/nfts/mounts/collection.json`. The deploying wallet becomes the collection owner; authority, payment token and 5% royalty receiver remain fixed. The receiver is the existing verified MOSS buy/burn contract.

Prepare an unsigned creation and simulate its runtime and gas using public addresses only:

```sh
npm run nft:setup -- --mounts --wallet WALLET_ADDRESS --authority AUTHORITY_ADDRESS --receiver RECEIVER_ADDRESS --pets LEGACY_PETS_ADDRESS --houses HOUSES_ADDRESS --pets-v2 EXPANDED_PETS_ADDRESS
```

This command never signs or broadcasts. Review `transactions[0].transaction` in the owner's wallet when deployment is authorized, then retain the receipt and its `contractAddress`. Re-run with `--mounts-contract MOUNTS_ADDRESS` to verify runtime, owner, authority, royalties, metadata and catalog capacity without preparing another deployment. Preserve `--new-pets-contract` as well if that intermediate collection is configured. The mount mode cannot create or reopen pet/house collections or auctions.

## Activate safely

Old realms reject saved mount items and `kind: "mount"` NFT orders in the shared player database. Before enabling drops or `NFT_MOUNTS_CONTRACT`, every realm must run the new catalog and order readers. Ship compatibility with mount drops and new claims dormant, verify the complete release on EU/US/Asia, then enable generation and the separately verified collection. A rolling deployment of active mount writers alongside old readers is unsafe. The compatibility release rejects GM grants of carried mount items while preserving existing permanent mount unlocks. This activation removes that guard and must run only after every realm has the new readers.

The prepared Git history separates compatibility ("Prepare mount items and separate expandable NFT collection") from drop activation ("Activate collectible mount drops after reader rollout") and the production collection binding. Release compatibility by itself and verify every realm before pushing either activation commit.

Use `.github/workflows/production.yml` on `main`, including player warnings and final saves. Preserve `NFT_PETS_CONTRACT`, `NFT_PETS_V2_CONTRACT`, `NFT_NEW_PETS_CONTRACT` when present, `NFT_HOUSES_CONTRACT`, `NFT_FEE_RECEIVER`, authority secrets, `TALENT_VERSION` and other unrelated settings. With the production binding, leaving `NFT_MOUNTS_CONTRACT` unset selects the verified production collection; setting it explicitly to an empty string disables new mount claims while retaining pet and house operation. Once mount items or orders exist, rollback must retain their readers and claim recovery.

## Add more mounts

Append a new permanent `nftAssetId` in the mount catalog, add its art/drop configuration and metadata, and run the mount/item/NFT checks. Publish metadata before activating its drops. From the collection owner's wallet, call `expandCatalog(nextMaxAssetId)` with the new highest ID; capacity can only increase. Verify that expansion is finalized before enabling claims. Existing IDs, NFT ownership and mint receipts remain valid. Use owner-only `setMetadata(baseURI, collectionURI)` only when relocating the complete metadata collection.

Local checks:

```sh
node scripts/check-mount-contracts.mjs
node scripts/check-nft-chain.mjs
node scripts/check-nft-setup.mjs
```
