import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { ContractFactory, Interface, JsonRpcProvider, ZeroAddress, formatUnits, getAddress, keccak256, toQuantity } from 'ethers';
import { LEGACY_NFT_RUNTIME_HASH, quoteHouseAuctionReserve } from '../src/nft-chain.mjs';
import { NFT_MOUNTS } from '../src/nfts.ts';
import { NFT_BUYBACK_ADDRESSES as routing, NFT_BUYBACK_DEPLOYMENTS } from './nft-buyback.mjs';

export const NFT_METADATA_BASE = 'https://mossvale.world/nfts/';
const artifacts = Object.fromEntries(['MossvaleNFT', 'MossvaleBuyBurn', 'MossvalePets', 'MossvaleMounts'].map(name => [name,
  JSON.parse(readFileSync(new URL(`../public/contracts/${name}.json`, import.meta.url), 'utf8'))]));
const nft = new Interface(artifacts.MossvaleNFT.abi), fees = new Interface(artifacts.MossvaleBuyBurn.abi), expanded = new Interface(artifacts.MossvalePets.abi), mountAbi = new Interface(artifacts.MossvaleMounts.abi);
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const address = value => {
  if (typeof value !== 'string' || !/^0x[\da-f]{40}$/i.test(value)) throw Error('Supply a public 20-byte wallet or contract address.');
  const result = getAddress(value);
  if (result === ZeroAddress) throw Error('Addresses must be nonzero.');
  return result;
};
const validBlock = value => /^0x[\da-f]{64}$/i.test(value?.hash || '')
  && /^0x(?:0|[1-9a-f][\da-f]*)$/i.test(value?.number || '') && /^0x(?:0|[1-9a-f][\da-f]*)$/i.test(value?.timestamp || '');

/** Staged, unsigned deployment or auction-opening transactions. This function never signs or sends. */
export async function prepareNftSetup(provider, { wallet, authority, receiver, pets, houses, newPets, deployNewPets = false, openHouseAuctions = false, expandPets = false, petsV2, deployMounts = false, mounts }, { now = Date.now(), price } = {}) {
  wallet = address(wallet); authority = address(authority);
  receiver = receiver ? address(receiver) : undefined;
  pets = pets ? address(pets) : undefined; houses = houses ? address(houses) : undefined; newPets = newPets ? address(newPets) : undefined;
  petsV2 = petsV2 ? address(petsV2) : undefined; mounts = mounts ? address(mounts) : undefined;
  const existing = [receiver, pets, houses, newPets, petsV2, mounts].filter(Boolean);
  if (new Set(existing.map(value => value.toLowerCase())).size !== existing.length || existing.some(value => same(value, wallet) || same(value, authority)))
    throw Error('Receiver and collection addresses must be distinct from each other and the public wallets.');
  if ((pets || houses) && !receiver) throw Error('Supply the already deployed receiver; future addresses are never predicted.');
  if (newPets && !deployNewPets && !expandPets && !deployMounts) throw Error('Use --new-pets when verifying --new-pets-contract.');
  if (deployNewPets && (!receiver || !pets || !houses)) throw Error('New pet setup requires the existing --receiver, --pets and --houses addresses.');
  if (deployNewPets && openHouseAuctions) throw Error('New pet setup cannot open or alter the existing house auctions.');
  if (openHouseAuctions && (!houses || !receiver)) throw Error('Opening requires deployed --houses and --receiver addresses.');
  if (expandPets && (!receiver || !pets || !houses || openHouseAuctions || deployNewPets)) throw Error('Pet expansion requires existing receiver, pets and houses and cannot reopen auctions or redeploy the sixteen-species collection.');
  if (deployMounts && (!receiver || !pets || !houses || openHouseAuctions || deployNewPets || expandPets)) throw Error('Mount setup requires existing receiver, pets and houses and cannot alter other collections or auctions.');
  if (mounts && !deployMounts) throw Error('Use --mounts when verifying --mounts-contract.');
  if (petsV2 && !expandPets && !deployMounts) throw Error('Use --expand-pets when verifying --pets-v2.');
  if (BigInt(await provider.send('eth_chainId', [])) !== 4663n) throw Error('NFT setup requires Robinhood mainnet (4663).');
  const block = await provider.send('eth_getBlockByNumber', ['latest', false]);
  if (!validBlock(block) || Math.abs(Number(BigInt(block.timestamp)) * 1000 - now) > 120000) throw Error('A fresh canonical chain head is required.');
  const tag = { blockHash: block.hash, requireCanonical: true };
  const call = async (to, abi, name, args = []) => abi.decodeFunctionResult(name,
    await provider.send('eth_call', [{ to, data: abi.encodeFunctionData(name, args) }, tag]));
  const canonical = async saved => {
    const current = await provider.send('eth_getBlockByNumber', [saved.number, false]);
    if (!validBlock(current) || current.number !== saved.number || !same(current.hash, saved.hash)) throw Error('The verified block changed; prepare setup again.');
  };
  const code = async (name, contract, expected) => {
    if (![expected].flat().includes(keccak256(await provider.send('eth_getCode', [contract, tag])))) throw Error(`The ${name} runtime differs from the reviewed deployment.`);
  };
  await Promise.all(['moss', 'router', 'weth', 'permit2'].map(name => {
    const entry = NFT_BUYBACK_DEPLOYMENTS.contracts[name];
    return code(name, entry.address, entry.codeHash);
  }));
  const transactions = [], verified = {};
  const deploy = async (contract, args) => {
    const artifact = artifacts[contract];
    const request = await new ContractFactory(artifact.abi, artifact.bytecode).getDeployTransaction(...args);
    transactions.push({ action: 'deploy', contract, constructorArguments: args, runtimeCodeHash: artifact.runtimeCodeHash,
      transaction: { from: wallet, data: request.data, value: '0x0', chainId: toQuantity(4663) } });
  };
  if (!receiver) {
    await deploy('MossvaleBuyBurn', [wallet, routing.router, routing.weth, routing.permit2]);
  } else {
    await code('royalty receiver', receiver, artifacts.MossvaleBuyBurn.runtimeCodeHash);
    const values = await Promise.all(['owner', 'paymentToken', 'swapRouter', 'wrappedNative', 'permit2'].map(name => call(receiver, fees, name)));
    if (values.some((value, index) => !same(value[0], [wallet, routing.moss, routing.router, routing.weth, routing.permit2][index])))
      throw Error('Receiver owner, MOSS token, or buyback routing does not match this setup.');
    verified.receiver = receiver;
    for (const [kind, contract] of [['pets', pets], ['houses', houses], ...(deployNewPets || newPets ? [['newPets', newPets]] : []), ...(expandPets || petsV2 ? [['petsV2', petsV2]] : []), ...(deployMounts ? [['mounts', mounts]] : [])]) {
      const isHouse = kind === 'houses', isExpanded = kind === 'petsV2', isMount = kind === 'mounts', baseURI = `${NFT_METADATA_BASE}${isHouse ? 'houses' : isMount ? 'mounts' : 'pets'}/`, collectionURI = `${baseURI}collection.json`;
      const contractName = isExpanded ? 'MossvalePets' : isMount ? 'MossvaleMounts' : 'MossvaleNFT';
      if (!contract) {
        if (!openHouseAuctions) await deploy(contractName, isMount ? [authority, receiver, Math.max(...NFT_MOUNTS.map(mount => mount.assetId)), baseURI, collectionURI] : [isExpanded ? pets : isHouse, authority, receiver, baseURI, collectionURI]);
        if (isExpanded || isMount) {
          const review = transactions.at(-1), transaction = review.transaction;
          const runtime = await provider.send('eth_call', [transaction, tag]);
          if (keccak256(runtime) !== artifacts[contractName].runtimeCodeHash) throw Error('Collection deployment simulation returned an unexpected runtime.');
          const estimatedUnits = BigInt(await provider.send('eth_estimateGas', [transaction, block.number]));
          if (estimatedUnits <= 0n) throw Error('A positive collection deployment gas estimate is required.');
          transaction.gas = toQuantity((estimatedUnits * 120n + 99n) / 100n);
          review.estimatedGasUnits = estimatedUnits.toString();
        }
        continue;
      }
      await code(kind, contract, isExpanded ? artifacts.MossvalePets.runtimeCodeHash : isMount ? artifacts.MossvaleMounts.runtimeCodeHash : kind === 'newPets' ? artifacts.MossvaleNFT.runtimeCodeHash : (expandPets || petsV2) && kind === 'pets' ? LEGACY_NFT_RUNTIME_HASH : [artifacts.MossvaleNFT.runtimeCodeHash, LEGACY_NFT_RUNTIME_HASH]);
      const [owner, signer, token, houseCollection, recipient, name, royalty, uri] = await Promise.all([
        ...['owner', 'authority', 'paymentToken', 'houseCollection', 'feeReceiver', 'name'].map(method => call(contract, nft, method)),
        call(contract, nft, 'royaltyInfo', [1, 10000]), call(contract, nft, 'contractURI'),
      ]);
      if (!same(owner[0], wallet) || !same(signer[0], authority) || !same(token[0], routing.moss) || houseCollection[0] !== isHouse
        || !same(recipient[0], receiver) || name[0] !== (isHouse ? 'Mossvale Houses' : isMount ? 'Mossvale Mounts' : 'Mossvale Pets')
        || !same(royalty[0], receiver) || royalty[1] !== 500n || uri[0] !== collectionURI)
        throw Error(`The ${kind} owner, authority, collection kind, metadata, or 5% royalty configuration is incorrect.`);
      if (isExpanded && !same((await call(contract, expanded, 'legacyCollection'))[0], pets)) throw Error('The expanded pet contract does not pin this original pet collection.');
      if (isMount && (await call(contract, mountAbi, 'maxAssetId'))[0] < BigInt(Math.max(...NFT_MOUNTS.map(mount => mount.assetId)))) throw Error('The mount collection catalog does not cover the published mount IDs.');
      verified[kind] = contract;
    }
  }
  let opening;
  if (openHouseAuctions) {
    const [opened, ends, reserve, lots, owners] = await Promise.all([
      ...['auctionsOpenedAt', 'auctionEndsAt', 'auctionReserveWei'].map(name => call(houses, nft, name)),
      Promise.all([1, 2, 3, 4].map(asset => call(houses, nft, 'houseAuctions', [asset]))),
      Promise.all([1, 2, 3, 4].map(asset => call(houses, nft, 'houseOwner', [asset]))),
    ]);
    if ([opened[0], ends[0], reserve[0]].some(value => value !== 0n)
      || lots.some(lot => lot[0] !== ZeroAddress || lot[1] !== 0n || lot[2]) || owners.some(owner => owner[0] !== ZeroAddress))
      throw Error('The four house auctions must be unopened and unminted. Auctions can only open once.');
    const finalized = await provider.send('eth_getBlockByNumber', ['finalized', false]);
    if (!validBlock(finalized) || Math.abs(Number(BigInt(finalized.timestamp)) * 1000 - now) > 1800000
      || BigInt(finalized.number) > BigInt(block.number) || BigInt(finalized.timestamp) > BigInt(block.timestamp))
      throw Error('A fresh finalized block is required for the $100 MOSS reserve.');
    const quote = await quoteHouseAuctionReserve({ rpc: (method, params) => provider.send(method, params), block: finalized, now, ...(price ? { price } : {}) });
    const transaction = { from: wallet, to: houses, data: nft.encodeFunctionData('openAuctions', [quote.reserveWei]), value: '0x0', chainId: toQuantity(4663) };
    await provider.send('eth_call', [transaction, tag]);
    await canonical(finalized);
    transactions.push({ action: 'open-house-auctions', transaction });
    opening = { ...quote, reserveMoss: formatUnits(quote.reserveWei, 18), houseIds: [1, 2, 3, 4], durationSeconds: 14400,
      starts: 'When the opening transaction executes on chain; all four auctions end exactly four hours later.',
      quoteReview: 'Regenerate this quote immediately before wallet approval if delayed. The contract fixes the submitted MOSS reserve and does not enforce a USD price or quote expiry.',
      winningBid: 'The complete winning MOSS bid is burned when anyone settles each ended auction; the deed mints directly to its winner.' };
  }
  await canonical(block);
  return { broadcast: false, chainId: 4663, wallet, authority, verified, blockNumber: block.number, blockHash: block.hash,
    transactions, ...(opening ? { opening } : {}),
    ...(deployNewPets ? { mode: 'new-pets', assetIds: [9, 10, 11, 12, 13, 14, 15, 16],
      configuration: { NFT_PETS_CONTRACT: pets, NFT_HOUSES_CONTRACT: houses, NFT_FEE_RECEIVER: receiver, ...(newPets ? { NFT_NEW_PETS_CONTRACT: newPets } : {}) } } : {}),
    ...(expandPets ? { mode: 'expanded-pets', configuration: { NFT_PETS_CONTRACT: pets, NFT_HOUSES_CONTRACT: houses, NFT_FEE_RECEIVER: receiver, ...(newPets ? { NFT_NEW_PETS_CONTRACT: newPets } : {}), ...(petsV2 ? { NFT_PETS_V2_CONTRACT: petsV2 } : {}) } } : {}),
    ...(deployMounts ? { mode: 'mounts', assetIds: NFT_MOUNTS.map(mount => mount.assetId), configuration: { NFT_PETS_CONTRACT: pets, NFT_HOUSES_CONTRACT: houses, NFT_FEE_RECEIVER: receiver, ...(newPets ? { NFT_NEW_PETS_CONTRACT: newPets } : {}), ...(petsV2 ? { NFT_PETS_V2_CONTRACT: petsV2 } : {}), ...(mounts ? { NFT_MOUNTS_CONTRACT: mounts } : {}) } } : {}),
    nextStep: deployMounts ? mounts
      ? 'Mounts verified. Publish mount metadata and deploy dormant mount reader support to every realm before setting NFT_MOUNTS_CONTRACT; old realms reject saved mount items and NFT orders. Preserve all existing NFT and talent settings.'
      : 'Review this simulated mount-only deployment in your wallet. Retain its receipt, then rerun --mounts with its contractAddress as --mounts-contract. Existing pets, houses, receiver and expanded pet activation remain unchanged.'
      : expandPets ? petsV2
      ? 'Expanded pets verified. Retain original contracts, pending claims and any sixteen-species collection, publish all metadata, deploy dormant support to all realms before activation, then request the collection URL migration through OpenSea support.'
      : 'Review this simulated pet-only deployment in your wallet. Retain its receipt, then rerun --expand-pets with its contractAddress as --pets-v2. Existing pets, houses and receiver remain deployed.'
      : deployNewPets ? newPets ? 'Publish metadata for pet asset IDs 9–16, then add NFT_NEW_PETS_CONTRACT to every realm using this verified configuration. Preserve the original pet, house, receiver and authority settings.'
      : 'Review and deploy only this new pet collection from the existing owner wallet, then rerun --new-pets with its receipt contractAddress as --new-pets-contract. Keep --pets, --houses and --receiver unchanged.'
      : !receiver ? 'Review and deploy the receiver from this wallet, then rerun with its receipt contractAddress as --receiver.'
      : transactions.some(value => value.action === 'deploy') ? 'Review and deploy each missing collection from this wallet, then rerun with their receipt contractAddress values as --pets and --houses.'
        : openHouseAuctions ? 'Review the fresh reserve and approve this opening transaction from the collection owner wallet.'
          : 'Publish metadata, configure all three realms with these verified contracts and the matching server authority, then prepare the opening transaction when ready.' };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const { values } = parseArgs({ options: { wallet: { type: 'string' }, authority: { type: 'string' }, receiver: { type: 'string' },
    pets: { type: 'string' }, houses: { type: 'string' }, 'open-house-auctions': { type: 'boolean' },
    'expand-pets': { type: 'boolean' }, 'pets-v2': { type: 'string' },
    mounts: { type: 'boolean' }, 'mounts-contract': { type: 'string' },
    'new-pets': { type: 'boolean' }, 'new-pets-contract': { type: 'string' },
    rpc: { type: 'string', default: process.env.NFT_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com' } } });
  if (!values.wallet || !values.authority) throw Error('Usage: npm run nft:setup -- --wallet 0x... --authority 0x... [--receiver 0x...] [--pets 0x...] [--houses 0x...] [--open-house-auctions | --new-pets [--new-pets-contract 0x...] | --expand-pets [--pets-v2 0x...] | --mounts [--mounts-contract 0x...] [--pets-v2 0x...]]');
  const provider = new JsonRpcProvider(values.rpc);
  try {
    const review = await prepareNftSetup(provider, { ...values, openHouseAuctions: values['open-house-auctions'], deployNewPets: values['new-pets'], newPets: values['new-pets-contract'], expandPets: values['expand-pets'], petsV2: values['pets-v2'], deployMounts: values.mounts, mounts: values['mounts-contract'] });
    console.log(JSON.stringify(review, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2));
  } finally { provider.destroy(); }
}
