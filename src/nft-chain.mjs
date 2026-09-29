import { readFileSync } from 'node:fs';
import { Interface, Wallet, TypedDataEncoder, getAddress, id, keccak256, toQuantity, ZeroAddress, ZeroHash } from 'ethers';
import { MOSS_TOKEN } from './auction.ts';
import { MOSS_TOKEN_RUNTIME_HASH, ROBINHOOD_CHAIN, erc20Interface } from './auction-chain.mjs';
import { NFT_FEE_BPS, NFT_HOUSES, NFT_PETS, NFT_MOUNTS, NFT_MINT_TYPES, NFT_BUYBACK, NFT_HOUSE_RESERVE_USD, NFT_AUCTION_DURATION_MS, nftAsset, nftOrderValid, nftAuctionTransactionValid, nftMigrationTransactionValid } from './nfts.ts';
import { readStorePrice } from './store-chain.mjs';
import { createNftRpc, getChainRpc } from './nft-rpc.mjs';

// Original immutable pets/houses deployment; its species IDs and claims remain valid.
export const LEGACY_NFT_RUNTIME_HASH = '0xa1da5810984c46ad9b417b6a75ac28104036abb3dfe65d21a154a58ddbb1295f';
const artifact = () => JSON.parse(readFileSync(new URL('../public/contracts/MossvaleNFT.json', import.meta.url), 'utf8'));
const feeArtifact = () => JSON.parse(readFileSync(new URL('../public/contracts/MossvaleBuyBurn.json', import.meta.url), 'utf8'));
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const address = value => { const result = getAddress(value); if (result === ZeroAddress) throw Error('A nonzero NFT wallet address is required.'); return result; };
const hash = value => typeof value === 'string' && /^0x[\da-f]{64}$/i.test(value);
const quantity = value => typeof value === 'string' && /^0x(?:0|[1-9a-f][\da-f]*)$/i.test(value);
const validBlock = block => hash(block?.hash) && quantity(block.number) && quantity(block.timestamp);
const tagOf = block => ({ blockHash: block.hash, requireCanonical: true });

/** Freeze the shared $100 starting reserve in MOSS when the four auctions open. */
export async function quoteHouseAuctionReserve({ rpc, block, now = Date.now(), price = readStorePrice }) {
  if (!Number.isSafeInteger(now) || now <= 0) throw Error('A valid quote time is required.');
  const observed = await price({ rpc, block, now });
  if (!observed || typeof observed.usdWei !== 'string' || !/^[1-9]\d{0,77}$/.test(observed.usdWei) || BigInt(observed.usdWei) >= 2n ** 256n
    || !Number.isSafeInteger(observed.observedAt) || now - observed.observedAt > 90000 || observed.observedAt > now + 15000) throw Error('A fresh MOSS/USD price is unavailable.');
  const usdWei = BigInt(observed.usdWei), reserve = (BigInt(NFT_HOUSE_RESERVE_USD) * 10n ** 36n + usdWei - 1n) / usdWei;
  if (reserve <= 0n || reserve >= 2n ** 256n) throw Error('The MOSS opening reserve is invalid.');
  return { reserveUsd: NFT_HOUSE_RESERVE_USD, reserveWei: reserve.toString(), price: observed };
}

/** Read verified ownership and authorize persisted claims; never broadcasts a transaction. */
export function createNftChain({ petsContract = process.env.NFT_PETS_CONTRACT || '', housesContract = process.env.NFT_HOUSES_CONTRACT || '', newPetsContract = process.env.NFT_NEW_PETS_CONTRACT || '',
  // Verified production expansion; custom deployments still choose their own collection explicitly.
  petsV2Contract = process.env.NFT_PETS_V2_CONTRACT || (same(petsContract, '0xF1bc2AB7401601993886DAF61839B874E7F10eAD') ? '0xe86B214d38bEC528393309b0eC12e3c19dfac2F6' : ''),
  mountsContract = process.env.NFT_MOUNTS_CONTRACT ?? (same(petsContract, '0xF1bc2AB7401601993886DAF61839B874E7F10eAD') ? '0xADd54eB402EC8E40CacFaF2e35ae962b225851E2' : ''),
  authorityKey = process.env.NFT_AUTHORITY_KEY || '', feeReceiver = process.env.NFT_FEE_RECEIVER || '',
  price: customPrice, rpcUrl = process.env.NFT_RPC_URL || 'https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public', rpc: customRpc } = {}) {
  const configured = !!(petsContract || housesContract || newPetsContract || petsV2Contract || mountsContract || authorityKey || feeReceiver);
  let signer, pets, houses, v2Pets, v2Abi, v2CodeHash, newPets, newPetsError, mounts, mountsAbi, mountsCodeHash, mountsError, receiver, abi, feesAbi, codeHash, feeCodeHash, configuringError, verification, lastFinalized, lastLatest;
  try {
    if (!configured) throw Error('NFT collections are not deployed and configured yet.');
    signer = new Wallet(authorityKey); pets = address(petsContract); houses = address(housesContract); receiver = address(feeReceiver);
    if (same(pets, houses) || [pets, houses].some(contract => same(contract, receiver))) throw Error('NFT contract addresses must be distinct.');
    const compiled = artifact(), feeCompiled = feeArtifact(); abi = new Interface(compiled.abi); feesAbi = new Interface(feeCompiled.abi);
    codeHash = compiled.runtimeCodeHash; feeCodeHash = feeCompiled.runtimeCodeHash;
    if (petsV2Contract) {
      v2Pets = address(petsV2Contract);
      if ([pets, houses, receiver].some(contract => same(contract, v2Pets))) throw Error('NFT contract addresses must be distinct.');
      const expanded = JSON.parse(readFileSync(new URL('../public/contracts/MossvalePets.json', import.meta.url), 'utf8'));
      v2Abi = new Interface(expanded.abi); v2CodeHash = expanded.runtimeCodeHash;
    }
  } catch (error) { configuringError = error.message; }
  if(newPetsContract)try {
    newPets = address(newPetsContract);
    if([pets,houses,receiver,v2Pets].some(contract=>same(contract,newPets)))throw Error('The new pet collection must have a distinct contract address.');
  } catch(error) {newPetsError=error.message;newPets=undefined;}
  if (mountsContract) try {
    mounts = address(mountsContract);
    if ([pets, houses, receiver, v2Pets, newPets].some(contract => same(contract, mounts))) throw Error('The mount collection must have a distinct contract address.');
    const compiled = JSON.parse(readFileSync(new URL('../public/contracts/MossvaleMounts.json', import.meta.url), 'utf8'));
    mountsAbi = new Interface(compiled.abi); mountsCodeHash = compiled.runtimeCodeHash;
  } catch (error) { mountsError = error.message; mounts = undefined; }
  const mintableMountIds = mounts ? NFT_MOUNTS.map(mount => mount.id) : [];
  const mintablePetIds = NFT_PETS.filter(pet => v2Pets || pet.assetId <= (newPets ? 16 : 8)).map(pet => pet.id);
  const rpc = customRpc ? createNftRpc(customRpc, { spacingMs: 0 }) : getChainRpc(rpcUrl);
  const ownershipReads = new Map(), auctionReads = new Map();
  function coalesce(reads, wallet, read) {
    const key = wallet?.toLowerCase() || '';
    if (!reads.has(key)) reads.set(key, Promise.resolve().then(read).finally(() => reads.delete(key)));
    return reads.get(key);
  }
  async function call(contract, name, args, block, iface = abi) {
    return iface.decodeFunctionResult(name, await rpc('eth_call', [{ to: contract, data: iface.encodeFunctionData(name, args) }, tagOf(block)]));
  }
  async function canonical(block) {
    const current = await rpc('eth_getBlockByNumber', [block.number, false]);
    if (!validBlock(current) || current.number !== block.number || !same(current.hash, block.hash)) throw Error('NFT chain changed during verification. Retry shortly.');
  }
  async function canonicalLatest(block) {
    await canonical(block);
    if (lastLatest && BigInt(block.number) < BigInt(lastLatest.number)) throw Error('NFT chain head regressed. Retry shortly.');
    lastLatest = block;
  }
  async function verifyFinalized() {
    if (configuringError) throw Error(configuringError);
    if (BigInt(await rpc('eth_chainId', [])) !== 4663n) throw Error('NFT RPC is on the wrong chain.');
    const block = await rpc('eth_getBlockByNumber', ['finalized', false]);
    if (!validBlock(block)
      || lastFinalized && (BigInt(block.number) < BigInt(lastFinalized.number) || block.number === lastFinalized.number && !same(block.hash, lastFinalized.hash)))
      throw Error('NFT chain finality is stale or inconsistent.');
    const code = await Promise.all([pets, houses, receiver, MOSS_TOKEN.address].map(contract => rpc('eth_getCode', [contract, tagOf(block)])));
    if (code.some((value, index) => index < 2 ? ![codeHash, LEGACY_NFT_RUNTIME_HASH].includes(keccak256(value)) : keccak256(value) !== [codeHash, codeHash, feeCodeHash, MOSS_TOKEN_RUNTIME_HASH][index])) throw Error('NFT deployment does not match the reviewed contracts.');
    await Promise.all([verifyCollection(pets,false,block),verifyCollection(houses,true,block)]);
    if (v2Pets) {
      // Reviewed V2 constructor permanently binds authority and royalties to this exact original collection.
      if (keccak256(await rpc('eth_getCode', [v2Pets, tagOf(block)])) !== v2CodeHash) throw Error('NFT deployment does not match the reviewed contracts.');
      if (keccak256(code[0]) !== LEGACY_NFT_RUNTIME_HASH || !same((await call(v2Pets, 'legacyCollection', [], block, v2Abi))[0], pets)) throw Error('Pet migration points to a different legacy collection.');
    }
    if (!same((await call(receiver, 'paymentToken', [], block, feesAbi))[0], MOSS_TOKEN.address)) throw Error('NFT fees must buy and burn MOSS.');
    const routerConfig = await Promise.all(['swapRouter', 'permit2', 'wrappedNative'].map(name => call(receiver, name, [], block, feesAbi)));
    if (routerConfig.some((value, index) => !same(value[0], [NFT_BUYBACK.router, NFT_BUYBACK.permit2, NFT_BUYBACK.wrappedNative][index])))
      throw Error('NFT buyback routing does not match the reviewed Robinhood deployment.');
    await canonical(block); lastFinalized = block;
    return block;
  }
  async function verifyCollection(contract,isHouse,block){
    const [authority,token,kind,recipient,name,royalty]=await Promise.all([
      ...['authority','paymentToken','houseCollection','feeReceiver','name'].map(method=>call(contract,method,[],block)),
      call(contract,'royaltyInfo',[1,10000],block),
    ]);
    if(!same(authority[0],signer.address)||!same(token[0],MOSS_TOKEN.address)||kind[0]!==isHouse
      ||!same(recipient[0],receiver)||name[0]!== (isHouse?'Mossvale Houses':'Mossvale Pets')
      ||!same(royalty[0],receiver)||royalty[1]!==500n)throw Error('NFT collection configuration does not match this realm.');
  }
  async function verifyNewPets(block){
    if(newPetsError)throw Error(newPetsError);
    if(!newPets)throw Error('The new pet NFT collection is not deployed and configured yet.');
    if(keccak256(await rpc('eth_getCode',[newPets,tagOf(block)]))!==codeHash)throw Error('The new pet NFT contract does not match the reviewed sixteen-species deployment.');
    await verifyCollection(newPets,false,block);
  }
  async function verifyMounts(block) {
    if (mountsError) throw Error(mountsError);
    if (!mounts) throw Error('The mount NFT collection is not deployed and configured yet.');
    if (keccak256(await rpc('eth_getCode', [mounts, tagOf(block)])) !== mountsCodeHash) throw Error('The mount NFT contract does not match the reviewed deployment.');
    const [authority, token, recipient, name, royalty, maxAssetId] = await Promise.all([
      ...['authority', 'paymentToken', 'feeReceiver', 'name'].map(method => call(mounts, method, [], block, mountsAbi)),
      call(mounts, 'royaltyInfo', [1, 10000], block, mountsAbi), call(mounts, 'maxAssetId', [], block, mountsAbi),
    ]);
    if (!same(authority[0], signer.address) || !same(token[0], MOSS_TOKEN.address) || !same(recipient[0], receiver)
      || name[0] !== 'Mossvale Mounts' || !same(royalty[0], receiver) || royalty[1] !== 500n
      || maxAssetId[0] < BigInt(Math.max(...NFT_MOUNTS.map(mount => mount.assetId)))) throw Error('Mount NFT collection configuration does not match this realm.');
  }
  const petContract = asset => v2Pets || (asset.assetId > 8 ? newPets : pets);
  const finalized = () => verification ??= verifyFinalized().finally(() => { verification = undefined; });
  async function latestAfter(block, now = Date.now()) {
    const latest = await rpc('eth_getBlockByNumber', ['latest', false]);
    if (!validBlock(latest) || Math.abs(Number(BigInt(latest.timestamp)) - Math.floor(now / 1000)) > 120
      || BigInt(latest.number) < BigInt(block.number) || BigInt(latest.timestamp) < BigInt(block.timestamp)
      || lastLatest && BigInt(latest.number) < BigInt(lastLatest.number)
      || latest.number === block.number && !same(latest.hash, block.hash)) throw Error('NFT chain head is stale or inconsistent.');
    return latest;
  }
  function validateOrder(order) {
    if (!nftOrderValid(order)) throw Error('NFT order does not match its original deployment.');
    if (order.kind === 'mount') {
      if (!mounts || !same(order.contract, mounts)) throw Error('NFT order does not match its original deployment.');
      return order.contractOrder;
    }
    const asset = nftAsset('pet', order.assetId);
    const original = same(order.contract, pets) && asset.assetId <= 8 && order.claimSource === undefined;
    const sixteen = same(order.contract, newPets) && asset.assetId > 8 && asset.assetId <= 16;
    if (!same(order.contract, v2Pets) && !original && !sixteen) throw Error('NFT order does not match its original deployment.');
    return order.contractOrder;
  }
  function auctionState(wallet) { return coalesce(auctionReads, wallet, async () => {
    const block = await finalized(), requestedAt = Date.now(), latest = await latestAfter(block), owner = wallet ? address(wallet) : null;
    const [opened, ends, reserve, lots, owners, balance, refund] = await Promise.all([
      ...['auctionsOpenedAt', 'auctionEndsAt', 'auctionReserveWei'].map(name => call(houses, name, [], latest)),
      Promise.all(NFT_HOUSES.map(house => call(houses, 'houseAuctions', [house.assetId], latest))),
      Promise.all(NFT_HOUSES.map(house => call(houses, 'houseOwner', [house.assetId], latest))),
      owner ? call(MOSS_TOKEN.address, 'balanceOf', [owner], latest, erc20Interface) : null,
      owner ? call(houses, 'refunds', [owner], latest) : null,
    ]);
    const startsAt = Number(opened[0]) * 1000, endsAt = Number(ends[0]) * 1000;
    if (![startsAt, endsAt].every(Number.isSafeInteger) || (startsAt ? endsAt - startsAt !== NFT_AUCTION_DURATION_MS || reserve[0] <= 0n : endsAt !== 0 || reserve[0] !== 0n)) throw Error('House auction timing or reserve is invalid.');
    await canonical(block); await canonicalLatest(latest);
    if (Date.now() - requestedAt >= 15000) throw Error('House auction state changed while being read. Refresh it before bidding.');
    return { houses: NFT_HOUSES.map((house, i) => ({ ...house, startsAt, endsAt, reserveWei: reserve[0].toString(),
      highestBidWei: lots[i][1].toString(), settled: lots[i][2], ...(lots[i][0] !== ZeroAddress ? { highestBidder: lots[i][0] } : {}),
      ...(owners[i][0] !== ZeroAddress ? { owner: owners[i][0] } : {}) })),
      walletBalanceWei: balance ? balance[0].toString() : null, refundWei: refund ? refund[0].toString() : null,
      chainTime: Number(BigInt(latest.timestamp)) * 1000, verifiedAt: requestedAt };
  }); }
  function auctionTransaction({ wallet, action, houseId, amountWei, paymentWei }) {
    const owner = address(wallet), house = nftAsset('house', houseId), chainId = '0x1237';
    const data = action === 'bid' ? abi.encodeFunctionData('bidHouse', [house?.assetId, amountWei, paymentWei])
      : action === 'settle' ? abi.encodeFunctionData('settleHouse', [house?.assetId]) : abi.encodeFunctionData('withdrawRefund');
    const result = { wallet: owner, action, ...(houseId !== undefined ? { houseId } : {}), ...(amountWei !== undefined ? { amountWei } : {}), paymentWei,
      transaction: { to: houses, data, value: '0x0', chainId },
      ...(action === 'bid' ? { approval: { to: MOSS_TOKEN.address, data: erc20Interface.encodeFunctionData('approve', [houses, paymentWei]), value: '0x0', chainId } } : {}) };
    if (!nftAuctionTransactionValid(result, { wallet: owner, contract: houses, action, houseId, amountWei, paymentWei })) throw Error('The auction transaction terms are invalid.');
    return result;
  }
  return {
    configured, mintablePetIds, mintableMountIds, network: ROBINHOOD_CHAIN,
    async status() {
      const base = { configured, chainId: 4663, petsContract: v2Pets || pets, ...(v2Pets ? { legacyPetsContract: pets } : {}), mintablePetIds, housesContract: houses, newPetsContract: newPets, newPetsEnabled: false, mountsContract: mounts, mintableMountIds, mountsEnabled: false, feeReceiver: receiver, feeBps: NFT_FEE_BPS,
        houses: NFT_HOUSES.map(house => ({ ...house, reserveWei: '0', highestBidWei: '0', startsAt: 0, endsAt: 0, settled: false })) };
      try {
        const newStatus=(async()=>{
          if(!newPets)return {newPetsEnabled:false,newPetsReason:newPetsError||'The new pet NFT collection is not deployed and configured yet.'};
          try {const block=await finalized();await verifyNewPets(block);await canonical(block);return {newPetsEnabled:true};}
          catch(error){return {newPetsEnabled:false,newPetsReason:error.message};}
        })();
        const mountStatus = (async () => {
          try { const block = await finalized(); await verifyMounts(block); await canonical(block); return { mountsEnabled: true }; }
          catch (error) { return { mountsEnabled: false, mountsReason: error.message }; }
        })();
        const [auction, extra, mountExtra] = await Promise.all([auctionState(), newStatus, mountStatus]);
        return { ...base, ...auction, ...extra, ...mountExtra, enabled: true };
      }
      catch (error) { return { ...base, enabled: false, reason: error.message }; }
    },
    auctionState,
    async prepareAuctionOpening(wallet) {
      const buyer = address(wallet), block = await finalized(), latest = await latestAfter(block);
      const [owner, opened] = await Promise.all([call(houses, 'owner', [], latest), call(houses, 'auctionsOpenedAt', [], latest)]);
      if (!same(owner[0], buyer)) throw Error('Only the house contract owner can open the auctions.');
      if (opened[0] !== 0n) throw Error('The four house auctions have already been opened.');
      const quote = await quoteHouseAuctionReserve({ rpc, block, price: customPrice });
      await canonical(block); await canonicalLatest(latest);
      return { ...quote, wallet: buyer, transaction: { to: houses, data: abi.encodeFunctionData('openAuctions', [quote.reserveWei]), value: '0x0', chainId: '0x1237' } };
    },
    async prepareAuctionTransaction({ wallet, action, houseId, amountWei }) {
      const owner = address(wallet), state = await auctionState(owner), house = state.houses.find(house => house.id === houseId);
      let paymentWei = '0';
      if (action === 'bid') {
        if (!house || !house.startsAt || state.chainTime < house.startsAt || state.chainTime >= house.endsAt || house.settled) throw Error('This house auction is not open.');
        if (typeof amountWei !== 'string' || !/^[1-9]\d{0,77}$/.test(amountWei) || BigInt(amountWei) >= 2n ** 256n
          || BigInt(amountWei) < BigInt(house.reserveWei) || BigInt(amountWei) <= BigInt(house.highestBidWei)) throw Error('Bid at least the opening reserve and more than the current highest bid.');
        paymentWei = (BigInt(amountWei) - (same(house.highestBidder, owner) ? BigInt(house.highestBidWei) : 0n)).toString();
        if (BigInt(state.walletBalanceWei) < BigInt(paymentWei)) throw Error('Your wallet does not have enough MOSS for this bid.');
      } else if (action === 'settle') {
        if (!house || !house.startsAt || state.chainTime < house.endsAt || house.settled) throw Error('This auction must finish before its deed can be settled.');
      } else if (action !== 'withdraw' || BigInt(state.refundWei) <= 0n) throw Error('There is no outbid MOSS to withdraw.');
      return auctionTransaction({ wallet: owner, action, houseId, amountWei, paymentWei });
    },
    async checkAuctionTransaction({ transactionHash, ...terms }) {
      const expected = auctionTransaction(terms);
      if (!hash(transactionHash)) throw Error('Choose a valid auction transaction.');
      const block = await finalized(), latest = await latestAfter(block);
      const [receipt, transaction] = await Promise.all([rpc('eth_getTransactionReceipt', [transactionHash]), rpc('eth_getTransactionByHash', [transactionHash])]);
      if (!receipt || !transaction) return { state: 'pending' };
      if (!same(transaction.hash, transactionHash) || !same(receipt.transactionHash, transactionHash)
        || !same(transaction.from, expected.wallet) || !same(transaction.to, houses) || !same(transaction.input, expected.transaction.data)
        || BigInt(transaction.value) !== 0n || !same(receipt.from, expected.wallet) || !same(receipt.to, houses)) throw Error('The auction receipt does not match the reviewed wallet transaction.');
      if (!hash(receipt.blockHash) || !quantity(receipt.blockNumber) || !same(transaction.blockHash, receipt.blockHash)
        || transaction.blockNumber !== receipt.blockNumber || BigInt(receipt.blockNumber) > BigInt(latest.number)) return { state: 'pending' };
      const included = await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]);
      if (!validBlock(included) || !same(included.hash, receipt.blockHash) || included.number !== receipt.blockNumber) return { state: 'pending' };
      if (!['0x0', '0x1'].includes(receipt.status)) throw Error('Auction receipt status is unavailable.');
      await canonical(included); await canonical(block); await canonicalLatest(latest);
      return { state: receipt.status === '0x1' ? 'confirmed' : 'failed' };
    },
    ownership(wallet) { return coalesce(ownershipReads, wallet, async () => {
      const owner = address(wallet), block = await finalized();
      let verifiedNew=false, mountsVerified=false;
      // Failure closes access only to the new collection; legacy holdings still verify.
      if(newPets)try{await verifyNewPets(block);verifiedNew=true;}catch{}
      if (mounts) try { await verifyMounts(block); mountsVerified = true; } catch {}
      const availablePets=NFT_PETS.filter(pet=>pet.assetId<=8||verifiedNew&&pet.assetId<=16);
      const verifiedAt = Date.now(), observed = await latestAfter(block);
      const totals = await Promise.all([pets, houses].map(contract => call(contract, 'balanceOf', [owner], observed)));
      const newBalances=verifiedNew?(await call(newPets,'petHoldings',[owner],observed))[0]:[];
      const v2Balances = v2Pets ? (await call(v2Pets, 'assetBalances', [owner, NFT_PETS.map(pet => pet.assetId)], observed, v2Abi))[0] : [];
      const v2Owned = NFT_PETS.filter((_, index) => v2Balances[index] > 0n);
      const mountBalances = mountsVerified ? (await call(mounts, 'assetBalances', [owner, NFT_MOUNTS.map(mount => mount.assetId)], observed, mountsAbi))[0] : [];
      const mountsOwned = NFT_MOUNTS.filter((_, index) => mountBalances[index] > 0n);
      const observedOwned = await Promise.all([
        Promise.all(availablePets.map(pet => pet.assetId>8 ? [newBalances[pet.assetId-9]] : totals[0][0]>0n ? call(pets,'assetBalance',[owner,pet.assetId],observed) : [0n])),
        totals[1][0] > 0n ? Promise.all(NFT_HOUSES.map(house => call(houses, 'houseOwner', [house.assetId], observed))) : NFT_HOUSES.map(() => [ZeroAddress]),
      ]);
      // Included transfers grant access immediately; a second current-head observation
      // removes rights transferred away while reading the wallet's collections.
      const latest = await latestAfter(observed);
      const currentNew=verifiedNew&&newBalances.some(value=>value>0n)?(await call(newPets,'petHoldings',[owner],latest))[0]:[];
      const v2Current = v2Owned.length ? (await call(v2Pets, 'assetBalances', [owner, v2Owned.map(pet => pet.assetId)], latest, v2Abi))[0] : [];
      const mountsCurrent = mountsOwned.length ? (await call(mounts, 'assetBalances', [owner, mountsOwned.map(mount => mount.assetId)], latest, mountsAbi))[0] : [];
      const currentOwned = await Promise.all([
        Promise.all(availablePets.map((pet, i) => observedOwned[0][i][0] > 0n ? pet.assetId>8 ? [currentNew[pet.assetId-9]??0n] : call(pets, 'assetBalance', [owner, pet.assetId], latest) : [0n])),
        Promise.all(NFT_HOUSES.map((house, i) => same(observedOwned[1][i][0], owner) ? call(houses, 'houseOwner', [house.assetId], latest) : [ZeroAddress])),
      ]);
      await canonical(block); await canonical(observed); await canonicalLatest(latest);
      if (Date.now() - verifiedAt >= 15000) throw Error('NFT ownership changed while being read. Refresh ownership.');
      return { collectionsVerified: (!newPetsContract || verifiedNew) && (!mountsContract || mountsVerified), mountsVerified, mounts: mountsOwned.filter((_, index) => mountsCurrent[index] > 0n).map(mount => mount.id), newPetsVerified:verifiedNew || !!v2Pets, pets: [...new Set([...availablePets.filter((_, i) => observedOwned[0][i][0] > 0n && currentOwned[0][i][0] > 0n), ...v2Owned.filter((_, i) => v2Current[i] > 0n)].map(pet => pet.id))],
        houses: NFT_HOUSES.filter((_, i) => same(observedOwned[1][i][0], owner) && same(currentOwned[1][i][0], owner)).map(house => house.id), verifiedAt };
    }); },
    async prepareMigration({ wallet, tokenId }) {
      if (!v2Pets) throw Error('Pet migration is not enabled on this realm.');
      if (typeof tokenId !== 'string' || !/^[1-9]\d{0,77}$/.test(tokenId) || BigInt(tokenId) >= 2n ** 256n) throw Error('Enter a valid original pet token ID.');
      const owner = address(wallet), block = await finalized(), latest = await latestAfter(block);
      const [currentOwner, asset] = await Promise.all([
        call(pets, 'ownerOf', [tokenId], latest), call(pets, 'assets', [tokenId], latest),
      ]);
      if (!same(currentOwner[0], owner)) throw Error('Your linked wallet must currently own this original NFT.');
      const pet = NFT_PETS.filter(pet => pet.assetId <= 8).find(pet => BigInt(pet.assetId) === asset[0]);
      if (!pet) throw Error('This token is not an original Mossvale pet.');
      const migration = { wallet: owner, legacyContract: pets, contract: v2Pets, tokenId, assetId: pet.id,
        approval: { to: pets, data: abi.encodeFunctionData('approve', [v2Pets, tokenId]), value: '0x0', chainId: '0x1237' },
        transaction: { to: v2Pets, data: v2Abi.encodeFunctionData('migrate', [tokenId]), value: '0x0', chainId: '0x1237' } };
      if (!nftMigrationTransactionValid(migration, { wallet: owner, legacyContract: pets, contract: v2Pets, tokenId })) throw Error('Invalid migration transaction.');
      await canonical(block); await canonicalLatest(latest);
      return migration;
    },
    async prepareOrder({ id: orderId, characterId, wallet, kind, assetId, claimSource }, now = Date.now()) {
      if (!['pet', 'mount'].includes(kind) || !nftAsset(kind, assetId)) throw Error('Choose a mintable pet or mount; house deeds use the house auctions.');
      const asset = nftAsset(kind, assetId);
      if (kind === 'pet' && (!mintablePetIds.includes(assetId) || claimSource !== undefined && (claimSource !== 'learned' || !v2Pets && asset.assetId <= 8))) throw Error('The expanded NFT collection is not deployed and configured for this pet.');
      if (kind === 'mount' && (!mintableMountIds.includes(assetId) || claimSource !== undefined && claimSource !== 'learned')) throw Error('The mount NFT collection is not deployed and configured for this mount.');
      if (asset.storeOnly && claimSource !== 'learned') throw Error('Store companions must be claimed from a learned entitlement.');
      const block = await finalized(), latest = await latestAfter(block, now), buyer = address(wallet), contract = kind === 'mount' ? mounts : petContract(asset);
      if (kind === 'mount') await verifyMounts(block);
      else if (!v2Pets && asset.assetId > 8) await verifyNewPets(block);
      const amountWei = '0', claimId = id(`mossvale-nft:${kind}:${characterId}:${orderId}`), tokenId = BigInt(claimId).toString();
      const contractOrder = { orderId: claimId, tokenId, assetId: asset.assetId, buyer, amountWei, deadline: Number(BigInt(latest.timestamp)) + 300 };
      const domain = { name: 'MossvaleNFT', version: '1', chainId: 4663, verifyingContract: contract };
      const signature = await signer.signTypedData(domain, NFT_MINT_TYPES, contractOrder), chainId = toQuantity(4663);
      const order = { id: orderId, characterId, wallet: buyer, kind, assetId, ...(claimSource ? { claimSource } : {}), tokenId, amountWei, status: 'quoted', chainId: 4663, contract,
        expiresAt: contractOrder.deadline * 1000, signature, contractOrder, orderHash: TypedDataEncoder.hash(domain, NFT_MINT_TYPES, contractOrder),
        transaction: { to: contract, data: abi.encodeFunctionData('mint', [contractOrder, signature]), value: '0x0', chainId } };
      validateOrder(order); await canonicalLatest(latest);
      return order;
    },
    async settlement(order) {
      const expected = validateOrder(order), block = await finalized();
      if (order.kind === 'mount') await verifyMounts(block);
      else if(same(order.contract,newPets))await verifyNewPets(block);
      const [claimed] = await call(order.contract, 'claimedOrders', [expected.orderId], block);
      if (claimed !== ZeroHash && !same(claimed, order.orderHash)) throw Error('NFT order has a conflicting settlement.');
      await canonical(block);
      if (same(claimed, order.orderHash)) return { state: 'minted' };
      const latest = await latestAfter(block), [included] = await call(order.contract, 'claimedOrders', [expected.orderId], latest);
      if (included !== ZeroHash && !same(included, order.orderHash)) throw Error('NFT order has a conflicting settlement.');
      const expired = BigInt(block.timestamp) > BigInt(expected.deadline);
      if (same(included, order.orderHash) && expired) throw Error('NFT mint conflicts with finalized unpaid expiry.');
      await canonical(block); await canonicalLatest(latest);
      if (same(included, order.orderHash)) return { state: 'minted' };
      // Client cancellation, wall time and missing receipts cannot release reserved loot.
      if (expired && Math.abs(Number(BigInt(block.timestamp)) - Math.floor(Date.now() / 1000)) > 1800)
        throw Error('NFT unpaid expiry finality is stale. Keep the collectible reserved.');
      return { state: expired ? 'expired' : 'pending' };
    },
  };
}
