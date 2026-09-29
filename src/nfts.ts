import { Interface, TypedDataEncoder, getAddress, id } from 'ethers';
import { PETS, type PetId } from './pets.ts';
import { MOUNTS, type MountId } from './travel.ts';
import { MOSS_TOKEN } from './auction.ts';

export const NFT_FEE_BPS = 500;
export const NFT_HOUSE_RESERVE_USD = 100;
export const NFT_AUCTION_DURATION_MS = 4 * 60 * 60 * 1000;
// Published asset numbers are permanent: append new entries, never reorder them.
export const NFT_PETS = ['moss-fox', 'moon-owl', 'ember-drake', 'crystal-tortoise', 'bloom-hare', 'lantern-moth', 'frost-cub', 'golden-pig',
  'fern-lynx', 'moonveil-gryphlet', 'cinder-salamander', 'amethyst-terrapin', 'blossom-jackalope', 'lantern-sprite', 'rime-red-panda', 'crown-pangolin', 'store-ashwing', 'store-cinder-kit',
  'bramble-badger', 'duskwind-raven', 'ember-axolotl', 'geode-hedgehog', 'clover-mouse', 'dewbell-dragonfly', 'snowcap-stoat', 'suncrest-peacock']
  .map((id, index) => ({ ...PETS.find(pet => pet.id === id)!, assetId: index + 1 }));
export const NFT_MOUNTS = MOUNTS.filter(mount => mount.nftAssetId !== null)
  .map(mount => ({ ...mount, assetId: mount.nftAssetId! })).sort((a, b) => a.assetId - b.assetId);
export const NFT_LEGACY_PETS = NFT_PETS.slice(0, 8);
export const NFT_BUYBACK = { router: '0x06AfBA43Fd06227fA663b0DAecF536f6EaA6bf99', permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3', wrappedNative: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73' } as const;
export const NFT_HOUSES = [1, 2, 3, 4].map(assetId => ({ id: `house-greenwood-${assetId}`, assetId, name: `Lanternreach Cottage ${assetId}` }));
export const nftAsset = (kind: 'pet' | 'mount' | 'house', asset: unknown) => (kind === 'pet' ? NFT_PETS : kind === 'mount' ? NFT_MOUNTS : NFT_HOUSES).find(entry => entry.id === asset);
export const nftLearnedPetConvertible = (asset: unknown) => (nftAsset('pet', asset)?.assetId ?? 0) > 8;
export const nftLearnedMountConvertible = (asset: unknown) => !!nftAsset('mount', asset);
export const NFT_MINT_TYPES = { Mint: [
  { name: 'orderId', type: 'bytes32' }, { name: 'tokenId', type: 'uint256' }, { name: 'assetId', type: 'uint256' },
  { name: 'buyer', type: 'address' }, { name: 'amountWei', type: 'uint256' }, { name: 'deadline', type: 'uint64' },
] };
export const NFT_ABI = ['function mint((bytes32 orderId,uint256 tokenId,uint256 assetId,address buyer,uint256 amountWei,uint64 deadline),bytes signature)'];
export const NFT_MIGRATION_ABI = ['function migrate(uint256 tokenId)'];
export const NFT_AUCTION_ABI = ['function bidHouse(uint256 assetId,uint256 amountWei,uint256 paymentWei)', 'function settleHouse(uint256 assetId)', 'function withdrawRefund()', 'function openAuctions(uint256 reserveWei)'];
const mintInterface = new Interface(NFT_ABI), tokenInterface = new Interface(['function approve(address spender,uint256 amount) returns (bool)']);
const auctionInterface = new Interface(NFT_AUCTION_ABI);
export interface NftTransaction { to: string; data: string; value: string; chainId: string }
export interface NftOrder {
  id: string; characterId: string; wallet: string; kind: 'pet' | 'mount' | 'house'; assetId: string; tokenId: string; amountWei: string;
  status: 'quoted' | 'minted' | 'expired'; chainId: 4663; contract: string; expiresAt: number; orderHash: string; signature: string;
  contractOrder: { orderId: string; tokenId: string; assetId: number; buyer: string; amountWei: string; deadline: number };
  transaction: NftTransaction; approval?: NftTransaction;
  claimSource?: 'learned';
}
export interface NftHouse { id: string; assetId: number; name: string; owner?: string; reserveWei: string; highestBidWei: string; highestBidder?: string; startsAt: number; endsAt: number; settled: boolean }
export interface NftStatus {
  configured: boolean; enabled: boolean; chainId: 4663; petsContract?: string; housesContract?: string; legacyPetsContract?: string; mintablePetIds?: PetId[];
  newPetsContract?: string; newPetsEnabled?: boolean; newPetsReason?: string;
  mountsContract?: string; mintableMountIds?: MountId[]; mountsEnabled?: boolean; mountsReason?: string;
  feeBps: number; feeReceiver?: string; reason?: string; houses: NftHouse[];
}
export interface NftState extends NftStatus {
  wallet: string | null; orders: NftOrder[]; ownedPets: PetId[]; ownedMounts: MountId[]; ownedHouses: string[]; ownershipVerified: boolean;
  walletBalanceWei: string | null; refundWei: string | null;
}
export interface NftAuctionTransaction {
  action: 'bid' | 'settle' | 'withdraw'; wallet: string; houseId?: string; amountWei?: string; paymentWei: string;
  transaction: NftTransaction; approval?: NftTransaction;
}
export interface NftMigration {
  wallet: string; legacyContract: string; contract: string; tokenId: string; assetId: PetId;
  approval: NftTransaction; transaction: NftTransaction;
}
const same = (a: unknown, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
const uint = (value: unknown): value is string => typeof value === 'string' && /^(?:0|[1-9]\d{0,77})$/.test(value) && BigInt(value) < 2n ** 256n;
const address = (value: unknown) => typeof value === 'string' && /^0x[\da-f]{40}$/i.test(value) && BigInt(value) !== 0n && !!getAddress(value);
const transactionMatches = (tx: NftTransaction | undefined, to: string, data: string) => tx && same(tx.to, to) && same(tx.data, data) && tx.value === '0x0' && tx.chainId === '0x1237';

/** Validate persisted authorizations and independently reconstruct browser transactions. */
export function nftOrderValid(value: unknown): value is NftOrder {
  try {
    const order = value as NftOrder;
    if (!order || !['pet', 'mount'].includes(order.kind) || !['quoted', 'minted', 'expired'].includes(order.status)
      || typeof order.id !== 'string' || !/^[\da-f-]{36}$/i.test(order.id) || typeof order.characterId !== 'string' || !/^[\da-f-]{36}$/i.test(order.characterId)
      || !address(order.wallet) || !address(order.contract) || order.chainId !== 4663 || !uint(order.amountWei) || !uint(order.tokenId)
      || !Number.isSafeInteger(order.expiresAt) || order.expiresAt <= 0 || order.expiresAt % 1000 !== 0
      || !/^0x[\da-f]{130}$/i.test(order.signature) || !/^0x[\da-f]{64}$/i.test(order.orderHash)) return false;
    const asset = nftAsset(order.kind, order.assetId);
    if (!asset || order.amountWei !== '0' || order.claimSource !== undefined && order.claimSource !== 'learned' || (asset as typeof NFT_PETS[number]).storeOnly && order.claimSource !== 'learned') return false;
    const orderId = id(`mossvale-nft:${order.kind}:${order.characterId}:${order.id}`);
    const tokenId = BigInt(orderId).toString();
    if (order.tokenId !== tokenId) return false;
    const expected = { orderId, tokenId, assetId: asset.assetId, buyer: order.wallet, amountWei: order.amountWei, deadline: order.expiresAt / 1000 };
    const domain = { name: 'MossvaleNFT', version: '1', chainId: 4663, verifyingContract: order.contract };
    const digest = TypedDataEncoder.hash(domain, NFT_MINT_TYPES, expected);
    if (!same(order.orderHash, digest) || TypedDataEncoder.hash(domain, NFT_MINT_TYPES, order.contractOrder) !== digest) return false;
    if (!transactionMatches(order.transaction, order.contract, mintInterface.encodeFunctionData('mint', [expected, order.signature]))) return false;
    return order.approval === undefined;
  } catch { return false; }
}
export function nftPlayerValid(player: { id?: string; nftOrders?: NftOrder[] }) {
  const orders = player.nftOrders ?? [];
  return Array.isArray(orders) && orders.every(order => nftOrderValid(order) && order.characterId === player.id)
    && new Set(orders.map(order => order.id)).size === orders.length
    && new Set(orders.map(order => order.contractOrder.orderId)).size === orders.length
    && new Set(orders.filter(order => order.status === 'quoted').map(order => `${order.kind}:${order.assetId}`)).size === orders.filter(order => order.status === 'quoted').length;
}

/** Wallet review binds the exact method, house, total bid and new debit. */
export function nftAuctionTransactionValid(value: NftAuctionTransaction, expected: { wallet: string; contract: string; action: NftAuctionTransaction['action']; houseId?: string; amountWei?: string; paymentWei?: string }): boolean {
  try {
    if (!value || !['bid', 'settle', 'withdraw'].includes(value.action) || value.action !== expected.action || !address(value.wallet) || !same(value.wallet, expected.wallet) || !address(expected.contract)
      || value.houseId !== expected.houseId || value.amountWei !== expected.amountWei || !uint(value.paymentWei)
      || expected.paymentWei !== undefined && value.paymentWei !== expected.paymentWei) return false;
    const house = value.action === 'withdraw' ? undefined : nftAsset('house', value.houseId);
    if (value.action !== 'withdraw' && !house) return false;
    let data;
    if (value.action === 'bid') {
      if (!uint(value.amountWei) || BigInt(value.paymentWei) <= 0n || BigInt(value.paymentWei) > BigInt(value.amountWei)) return false;
      data = auctionInterface.encodeFunctionData('bidHouse', [house!.assetId, value.amountWei, value.paymentWei]);
      if (!transactionMatches(value.approval, MOSS_TOKEN.address, tokenInterface.encodeFunctionData('approve', [expected.contract, value.paymentWei]))) return false;
    } else {
      if (value.paymentWei !== '0' || value.amountWei !== undefined || value.approval !== undefined || value.action === 'withdraw' && value.houseId !== undefined) return false;
      data = value.action === 'settle' ? auctionInterface.encodeFunctionData('settleHouse', [house!.assetId]) : auctionInterface.encodeFunctionData('withdrawRefund');
    }
    return !!transactionMatches(value.transaction, expected.contract, data);
  } catch { return false; }
}

/** Migration approves one reviewed legacy token, never an entire wallet collection. */
export function nftMigrationTransactionValid(value: NftMigration, expected: { wallet: string; legacyContract: string; contract: string; tokenId: string }): boolean {
  try {
    return !!value && address(value.wallet) && address(value.legacyContract) && address(value.contract) && !same(value.contract, value.legacyContract)
      && same(value.wallet, expected.wallet) && same(value.legacyContract, expected.legacyContract) && same(value.contract, expected.contract)
      && uint(value.tokenId) && value.tokenId !== '0' && value.tokenId === expected.tokenId && NFT_LEGACY_PETS.some(pet => pet.id === value.assetId)
      && !!transactionMatches(value.approval, expected.legacyContract, tokenInterface.encodeFunctionData('approve', [expected.contract, value.tokenId]))
      && !!transactionMatches(value.transaction, expected.contract, new Interface(NFT_MIGRATION_ABI).encodeFunctionData('migrate', [value.tokenId]));
  } catch { return false; }
}
