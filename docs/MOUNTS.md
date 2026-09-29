# Mount items and NFTs

`src/travel.ts` owns mount identities, descriptions, icons, rarity, source and dungeon drop conditions. `LOOT_ITEMS` derives from non-store mintable mounts; the mount NFT catalog and metadata include all mintable entries. Mount NFT access uses the separate **Mossvale Mounts** collection; it never uses the pet contract.

| Mount | Permanent NFT asset ID | Source |
| --- | --- | --- |
| Verdant Revenant | 1 | Veiled Abbess, Veilhaven, throne stage, dungeon boss, 1 in 10,000 |
| Embermane | 2 | Existing store purchase / Cinder Cosmetic Box |
| Cinderfang | 3 | Existing store purchase / Cinder Cosmetic Box |
| Briar Horse / Moonfang Wolf | None | Gold vendor; character unlock only |

The dungeon roll returns a personal loot item. Learning consumes one carried copy. Existing owners can still receive additional items for trading, auctioning or minting. Mount items have no NPC sell price, like pet drops. Living kill-credit and nearby-party eligibility remain server rules; caches and dungeon completion add no mount rolls. Full bags leave an item on its corpse until collected or expired.

Minting reserves either one carried item or an explicitly selected learned unlock. Store conversion requires finalized MOSS purchase entitlement; refundable native-store rewards stay character-bound. A verified NFT holder can ride with the same level and riding training as a learned owner. Converted store rewards stay counted as received for cosmetic-box eligibility. Existing learned dungeon mounts remain convertible when minting is enabled.

## Add another mount

1. Append an entry to `MOUNTS`. Give mintable mounts a new, unused positive `nftAssetId`; never change or reuse an issued ID. Keep `nftAssetId: null` for nonmintable vendor mounts. Include `description`, an existing public `icon`, `quality: 'epic'`, and the existing `storeOnly` / `dropOnly` flags.
2. For a dungeon drop, set `source` to its boss kind, `dungeonDrop` to `{ dungeon, boss, stageId, oneIn }`, and `dropChance` to `1 / oneIn`. The shared roll helper checks these catalog conditions; ownership does not suppress the roll. The helper returns at most one mount per eligible kill, so give each mount its own encounter if it must have an independent award. For a store mount, use `source: null`, `dropChance: 0`, `dungeonDrop: null`, and add the product to the existing store catalog. Adding metadata never gives a store mount a monster source.
3. Add its riding model and animation in the existing mount asset pipeline (`src/mounts.ts`) and validate its collection preview and rider placement. A catalog entry creates no artwork or rig automatically.
4. Run `node scripts/build-nft-metadata.mjs`. Commit the new `public/nfts/mounts/<assetId>.json` and referenced icon. The collection metadata and existing token metadata remain at stable URLs.
5. Expand the separate mount contract's enabled range with its owner's `expandCatalog(highestNewAssetId)` call, then rerun NFT setup validation against that existing contract. Keep existing collection and asset IDs unchanged. Publish and verify metadata before enabling minting; do not point mount settings at the pet contract. Deploy catalog readers to every realm before enabling a new carried mount item in the shared player database.
6. Add source/behavior coverage to `scripts/check-dungeon-mount.mjs`, review wiki prose, and add player-facing patch notes. Run that check, `node scripts/check-mount-drops-server.mjs`, `npm run check:mounts`, `npm run check:nft-contracts`, `npm run check:wiki`, and `npm run build`. Check new source eligibility and trading/minting with the server integration checks before release.

Contract deployment and collection activation are separate from local code and metadata generation. Follow `deploy/PRODUCTION.md` for game releases.
