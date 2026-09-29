import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Interface, Wallet, id, keccak256, toQuantity, ZeroAddress, ZeroHash } from 'ethers';
import { createNftChain, quoteHouseAuctionReserve, LEGACY_NFT_RUNTIME_HASH } from '../src/nft-chain.mjs';
import { createNftRpc } from '../src/nft-rpc.mjs';
import { nftOrderValid, nftPlayerValid, nftAuctionTransactionValid, nftMigrationTransactionValid, NFT_LEGACY_PETS, NFT_PETS, NFT_MOUNTS, nftLearnedMountConvertible, NFT_BUYBACK, NFT_HOUSES, NFT_AUCTION_DURATION_MS } from '../src/nfts.ts';
import { MOSS_TOKEN } from '../src/auction.ts';
import { erc20Interface } from '../src/auction-chain.mjs';
const artifact = JSON.parse(readFileSync(new URL('../public/contracts/MossvaleNFT.json', import.meta.url), 'utf8'));
const petsArtifact = JSON.parse(readFileSync(new URL('../public/contracts/MossvalePets.json', import.meta.url), 'utf8'));
const mountsArtifact = JSON.parse(readFileSync(new URL('../public/contracts/MossvaleMounts.json', import.meta.url), 'utf8'));
const mountsAbi = new Interface(mountsArtifact.abi), mountsContract = Wallet.createRandom().address;
let badMountAuthority = false, badMountFee = false, mountMaxAssetId = 3n;
const petsAbi = new Interface(petsArtifact.abi), petsV2Contract = Wallet.createRandom().address;
let badCodeAt, badLegacy = false;
const tokenOwners = new Map(), tokenAssets = new Map(), petBalanceCalls = [];
const feeArtifact = JSON.parse(readFileSync(new URL('../public/contracts/MossvaleBuyBurn.json', import.meta.url), 'utf8'));
const runtime = readFileSync(new URL('./fixtures/moss-token-runtime.hex', import.meta.url), 'utf8').trim();
const legacyRuntime=readFileSync(new URL('./fixtures/mossvale-nft-v1-runtime.hex',import.meta.url),'utf8').trim();
assert.equal(keccak256(legacyRuntime),LEGACY_NFT_RUNTIME_HASH);
const newPetsContract=Wallet.createRandom().address;
let legacyDeployment=false,badNewCode=false;
const newHoldings=new Map(),newMinted=new Map();
const abi = new Interface(artifact.abi), feeAbi = new Interface(feeArtifact.abi);
const authority = Wallet.createRandom(), buyer = Wallet.createRandom(), recipient = Wallet.createRandom();
const petsContract = Wallet.createRandom().address, housesContract = Wallet.createRandom().address, feeReceiver = Wallet.createRandom().address, treasury = Wallet.createRandom().address;
// Production activation is bound to the verified original address; explicit/custom setups stay isolated.
const productionDefaults = { petsContract: '0xF1bc2AB7401601993886DAF61839B874E7F10eAD', housesContract, feeReceiver, authorityKey: authority.privateKey };
assert.equal(createNftChain(productionDefaults).mintablePetIds.length, 26);
assert.equal(createNftChain({ ...productionDefaults, petsV2Contract: '' }).mintablePetIds.length, 8);
assert.equal(createNftChain({ ...productionDefaults, petsContract }).mintablePetIds.length, 8);
const mountEnvironment = process.env.NFT_MOUNTS_CONTRACT;
const selectedMountContract = async overrides => (await createNftChain({ ...productionDefaults, rpc: async () => { throw Error('Configuration-only fixture'); }, ...overrides }).status()).mountsContract;
try {
  delete process.env.NFT_MOUNTS_CONTRACT;
  assert.equal(await selectedMountContract({}), '0xADd54eB402EC8E40CacFaF2e35ae962b225851E2');
  assert.deepEqual(createNftChain(productionDefaults).mintableMountIds, NFT_MOUNTS.map(mount => mount.id));
  assert.equal(await selectedMountContract({ mountsContract }), mountsContract, 'explicit collection overrides production default');
  assert.equal(await selectedMountContract({ mountsContract: '' }), undefined, 'explicit empty collection disables mounts');
  assert.equal(await selectedMountContract({ petsContract }), undefined, 'custom deployments never inherit production mounts');
  process.env.NFT_MOUNTS_CONTRACT = '';
  assert.equal(await selectedMountContract({}), undefined, 'empty environment disables production mounts');
  process.env.NFT_MOUNTS_CONTRACT = mountsContract;
  assert.equal(await selectedMountContract({}), mountsContract, 'environment collection overrides production default');
} finally {
  if (mountEnvironment === undefined) delete process.env.NFT_MOUNTS_CONTRACT;
  else process.env.NFT_MOUNTS_CONTRACT = mountEnvironment;
}
const realNow = Date.now; let now = 1000000; Date.now = () => now;
let badCode = false, badFee = false, badAuthority = false, outage = false, reorg = false, chainId = '0x1237';
let finalized, latest, canonical, minted, holdings, openedAt = 0n, reserveWei = 0n, rpcCalls = 0;
const ownershipCalls = [];
let usdWei = '100000000000000000';
const lots = new Map(), balances = new Map([[buyer.address, 10n ** 25n]]), refunds = new Map(), transactions = new Map(), receipts = new Map();
const block = (number, seconds) => ({ number: toQuantity(number), timestamp: toQuantity(seconds), hash: id(`block-${number}-${seconds}`) });
const holdKey = (hash, owner, assetId, contract = petsContract) => `${hash}:${contract === petsV2Contract ? 'v2:' : contract === mountsContract ? 'mount:' : ''}${owner.toLowerCase()}:${assetId}`;
const mintKey = (hash, orderId, contract = petsContract) => `${hash}:${contract === petsV2Contract ? 'v2:' : contract === mountsContract ? 'mount:' : ''}${orderId}`;
const tokenKey = (hash, tokenId) => `${hash}:${tokenId}`;
function reset() {
  finalized = block(100, 900); latest = block(110, 1000); canonical = new Map([finalized, latest].map(value => [value.number, value]));
  minted = new Map(); holdings = new Map(); tokenOwners.clear(); tokenAssets.clear();
}
// On-chain changes create a new block; data at an existing block hash is immutable.
function advance() {
  for (const [name, previous] of [['finalized', finalized], ['latest', latest]]) {
    const next = block(BigInt(previous.number) + 1n, BigInt(previous.timestamp));
    for (const values of [holdings, minted,newHoldings,newMinted,tokenOwners,tokenAssets]) for (const [key, value] of [...values]) if (key.startsWith(previous.hash + ':')) values.set(next.hash + key.slice(previous.hash.length), value);
    canonical.set(next.number, next);
    if (name === 'finalized') finalized = next; else latest = next;
  }
}
const rpc = async (method, params) => {
  rpcCalls++;
  if (outage) throw Error('Controlled RPC outage');
  if (method === 'eth_chainId') return chainId;
  if (method === 'eth_getBlockByNumber') return params[0] === 'finalized' ? finalized : params[0] === 'latest' ? latest
    : reorg ? { ...canonical.get(params[0]), hash: id('replacement') } : canonical.get(params[0]);
  if (method === 'eth_getCode') {
    assert(params[1].requireCanonical);
    if(params[0]===badCodeAt)return '0x6000';
    if(params[0]===mountsContract)return mountsArtifact.deployedBytecode;
    if(params[0]===petsV2Contract)return petsArtifact.deployedBytecode;
    if(params[0]===newPetsContract)return badNewCode?'0x6000':artifact.deployedBytecode;
    if(legacyDeployment&&[petsContract,housesContract].includes(params[0]))return legacyRuntime;
    return badCode ? '0x6000' : params[0] === MOSS_TOKEN.address ? runtime : params[0] === feeReceiver ? feeArtifact.deployedBytecode : artifact.deployedBytecode;
  }
  if (method === 'eth_getTransactionByHash') return transactions.get(params[0]) || null;
  if (method === 'eth_getTransactionReceipt') return receipts.get(params[0]) || null;
  if (method === 'eth_call') {
    const [{ to, data }, tag] = params; assert(tag.requireCanonical, 'every NFT state read pins a canonical block hash');
    const iface = to === feeReceiver ? feeAbi : to === MOSS_TOKEN.address ? erc20Interface : to === petsV2Contract ? petsAbi : to === mountsContract ? mountsAbi : abi, call = iface.parseTransaction({ data }), args = Array.from(call.args);
    if(to===newPetsContract){
      if(call.name==='petHoldings')return abi.encodeFunctionResult(call.name,[Array.from({length:8},(_,i)=>newHoldings.get(holdKey(tag.blockHash,args[0],i+9))||0n)]);
      if(call.name==='balanceOf')return abi.encodeFunctionResult(call.name,[[...newHoldings].reduce((n,[key,v])=>n+(key.startsWith(`${tag.blockHash}:${String(args[0]).toLowerCase()}:`)?v:0n),0n)]);
      if(call.name==='assetBalance')return abi.encodeFunctionResult(call.name,[newHoldings.get(holdKey(tag.blockHash,args[0],args[1]))||0n]);
      if(call.name==='claimedOrders')return abi.encodeFunctionResult(call.name,[newMinted.get(`${tag.blockHash}:${args[0]}`)||ZeroHash]);
    }
    if (['balanceOf', 'assetBalance', 'houseOwner'].includes(call.name) && to !== MOSS_TOKEN.address) ownershipCalls.push(call.name);
    if (call.name === 'assetBalances' && to === petsV2Contract) { petBalanceCalls.push({ hash: tag.blockHash, assets: Array.from(args[1], Number) }); }
    const values = {
      maxAssetId: [mountMaxAssetId],
      authority: [badAuthority || to === mountsContract && badMountAuthority ? recipient.address : authority.address], paymentToken: [MOSS_TOKEN.address], houseCollection: [to === housesContract],
      feeReceiver: [feeReceiver], name: [to === housesContract ? 'Mossvale Houses' : to === mountsContract ? 'Mossvale Mounts' : 'Mossvale Pets'], royaltyInfo: [feeReceiver, badFee || to === mountsContract && badMountFee ? 499n : 500n], owner: [treasury], auctionsOpenedAt: [openedAt], auctionEndsAt: [openedAt ? openedAt + 14400n : 0n], auctionReserveWei: [reserveWei],
      houseAuctions: lots.get(Number(args[0])) || [ZeroAddress, 0n, false], refunds: [refunds.get(args[0]) || 0n],
      balanceOf: [to === MOSS_TOKEN.address ? balances.get(args[0]) || 0n : [...holdings].reduce((total, [key, value]) => total + ([petsContract, petsV2Contract].includes(to)
        ? key.startsWith(holdKey(tag.blockHash, String(args[0]), '', to)) ? value : 0n
        : key.startsWith(`${tag.blockHash}:house:`) && value === args[0] ? 1n : 0n), 0n)],
      houseOwner: [holdings.get(`${tag.blockHash}:house:${args[0]}`) || ZeroAddress],
      assetBalance: [holdings.get(holdKey(tag.blockHash, String(args[0] ?? ZeroAddress), args[1], to)) || 0n],
      assetBalances: [Array.isArray(args[1]) ? Array.from(args[1], asset => holdings.get(holdKey(tag.blockHash, String(args[0]), asset, to)) || 0n) : []],
      legacyCollection: [badLegacy ? housesContract : petsContract],
      ownerOf: [tokenOwners.get(tokenKey(tag.blockHash, args[0])) || ZeroAddress],
      assets: [tokenAssets.get(tokenKey(tag.blockHash, args[0])) || 0n],
      claimedOrders: [minted.get(mintKey(tag.blockHash, args[0], to)) || ZeroHash],
      swapRouter: [NFT_BUYBACK.router], permit2: [NFT_BUYBACK.permit2], wrappedNative: [NFT_BUYBACK.wrappedNative],
    };
    assert(call.name in values, `Unexpected method ${call.name}`); return iface.encodeFunctionResult(call.name, values[call.name]);
  }
  throw Error(`Unexpected RPC ${method}`);
};
const options = { petsContract, housesContract, authorityKey: authority.privateKey, feeReceiver, rpc, price: async () => ({ usdWei, observedAt: now }) };
try {
  reset();
  assert.deepEqual(NFT_MOUNTS.map(({ id, assetId }) => [id, assetId]), [['verdant-revenant', 1], ['store-embermane', 2], ['store-cinderfang', 3]]);
  for (const mount of ['horse', 'wolf', 'unknown']) assert.equal(nftLearnedMountConvertible(mount), false);
  for (const mount of NFT_MOUNTS) assert.equal(nftLearnedMountConvertible(mount.id), true);
  const mountCharacter = randomUUID(), mountChain = createNftChain({ ...options, mountsContract });
  const mountTerms = { id: randomUUID(), characterId: mountCharacter, wallet: buyer.address, kind: 'mount', assetId: 'verdant-revenant' };
  const absentMounts = await createNftChain(options).status();
  assert.equal(absentMounts.enabled, true); assert.equal(absentMounts.mountsEnabled, false);
  assert.deepEqual((await createNftChain(options).ownership(buyer.address)).mounts, []);
  assert.equal((await createNftChain(options).ownership(buyer.address)).collectionsVerified, true, 'absent optional collections allow a fully verified empty wallet');
  assert.equal((await mountChain.status()).mountsEnabled, true);
  assert.deepEqual(mountChain.mintableMountIds, NFT_MOUNTS.map(mount => mount.id));
  for (const assetId of ['horse', 'wolf', 'unknown']) await assert.rejects(mountChain.prepareOrder({ ...mountTerms, assetId }));
  await assert.rejects(createNftChain(options).prepareOrder(mountTerms));
  for (const flag of [value => { badMountAuthority = value; }, value => { badMountFee = value; }, value => { badCodeAt = value ? mountsContract : undefined; }, value => { mountMaxAssetId = value ? 2n : 3n; }]) {
    flag(true); advance(); const status = await mountChain.status();
    assert.equal(status.enabled, true); assert.equal(status.mountsEnabled, false);
    assert.equal((await mountChain.ownership(buyer.address)).mountsVerified, false);
    assert.equal((await mountChain.ownership(buyer.address)).collectionsVerified, false, 'failed mount verification cannot confirm an empty wallet');
    await assert.rejects(mountChain.prepareOrder(mountTerms)); flag(false); advance();
  }
  const mountOrder = await mountChain.prepareOrder(mountTerms);
  assert(nftOrderValid(mountOrder)); assert.equal(mountOrder.contract, mountsContract); assert.equal(mountOrder.amountWei, '0');
  assert(nftPlayerValid({ id: mountCharacter, nftOrders: [mountOrder] }));
  for (const change of [{ kind: 'pet' }, { assetId: 'horse' }, { claimSource: 'other' }, { contract: petsContract }, { amountWei: '1' }]) {
    assert(!nftOrderValid({ ...mountOrder, ...change })); await assert.rejects(mountChain.settlement({ ...mountOrder, ...change }));
  }
  await assert.rejects(mountChain.prepareOrder({ ...mountTerms, assetId: 'store-embermane' }));
  const learnedMount = await mountChain.prepareOrder({ ...mountTerms, id: randomUUID(), assetId: 'store-embermane', claimSource: 'learned' });
  assert(nftOrderValid(learnedMount)); assert(!nftOrderValid({ ...learnedMount, claimSource: undefined }));
  assert.equal((await mountChain.settlement(mountOrder)).state, 'pending');
  minted.set(mintKey(latest.hash, mountOrder.contractOrder.orderId, mountsContract), mountOrder.orderHash); advance();
  assert.equal((await mountChain.settlement(mountOrder)).state, 'minted', 'canonical included mount mint settles without waiting for finality');
  minted.set(mintKey(finalized.hash, mountOrder.contractOrder.orderId, mountsContract), mountOrder.orderHash); advance();
  assert.equal((await mountChain.settlement(mountOrder)).state, 'minted', 'mount settlement recovers without a receipt');
  for (const b of [finalized, latest]) holdings.set(holdKey(b.hash, buyer.address, 1, mountsContract), 1n);
  advance(); assert.deepEqual((await mountChain.ownership(buyer.address)).mounts, ['verdant-revenant']);
  holdings.set(holdKey(latest.hash, buyer.address, 1, mountsContract), 0n);
  holdings.set(holdKey(latest.hash, recipient.address, 1, mountsContract), 1n); advance();
  assert.deepEqual((await mountChain.ownership(buyer.address)).mounts, [], 'mount sender loses rights at current head');
  assert.deepEqual((await mountChain.ownership(recipient.address)).mounts, ['verdant-revenant'], 'mount receiver gains rights at current inclusion');
  holdings.set(holdKey(finalized.hash, recipient.address, 1, mountsContract), 1n); advance();
  assert.deepEqual((await mountChain.ownership(recipient.address)).mounts, ['verdant-revenant']);
  reorg = true; await assert.rejects(mountChain.ownership(recipient.address)); reorg = false;
  console.log('Mount chain: separate reviewed collection, no vendor mounts, store entitlement claims, independent disablement, included settlements and transferable ownership passed.');
  reset();
  for (const b of [finalized, latest]) {
    holdings.set(holdKey(b.hash, buyer.address, 1), 1n);
    holdings.set(holdKey(b.hash, recipient.address, 3), 1n);
  }
  let limited = false;
  const pacedRpc = createNftRpc((method, params) => limited ? Promise.reject(Object.assign(Error('Controlled429'), { status: 429 })) : rpc(method, params),
    { spacingMs: 200, now: () => now, wait: async ms => { now += ms; } });
  const loaded = createNftChain({ ...options, rpc: pacedRpc });
  const loadStart = now, loadCalls = rpcCalls;
  const combined = await Promise.all([loaded.status(), loaded.ownership(buyer.address), loaded.ownership(recipient.address), loaded.auctionState(buyer.address), loaded.auctionState(recipient.address)]);
  assert.equal(combined[0].enabled, true, combined[0].reason);
  assert(combined.slice(1).every(value => now - value.verifiedAt < 15000), 'two wallets plus auction/status fit the unchanged ownership freshness window');
  const coldDuration = now - loadStart, coldCalls = rpcCalls - loadCalls;
  limited = true; await assert.rejects(loaded.ownership(buyer.address));
  const limitedCalls = rpcCalls; await assert.rejects(loaded.ownership(recipient.address)); assert.equal(rpcCalls, limitedCalls);
  now += 15001; limited = false;
  const recovered = await loaded.ownership(buyer.address); assert.deepEqual(recovered.pets, ['moss-fox']); assert(now - recovered.verifiedAt < 15000);
  console.log(`NFT combined cold read: two wallets, status and auctions, ${coldCalls} paced RPCs in ${coldDuration}ms; real429 cooldown recovered without extending ownership age.`);
  now = 1000000;
  reset(); const chain = createNftChain(options), characterId = randomUUID();
  assert.equal((await createNftChain().status()).enabled, false);
  assert.equal((await createNftChain({ petsContract }).status()).configured, true, 'partial config cannot restore permanent pet learning');
  const status = await chain.status(); assert.equal(status.enabled, true, status.reason);
  const beforeShared = rpcCalls;
  await Promise.all(Array.from({ length: 12 }, () => chain.ownership(buyer.address)));
  assert(rpcCalls - beforeShared <= 30, 'same-wallet concurrent ownership refreshes share a single fresh read and cached deployment verification');
  ownershipCalls.length = 0;
  assert.deepEqual((await chain.ownership(recipient.address)).pets, []);
  assert.deepEqual(ownershipCalls, ['balanceOf', 'balanceOf'], 'empty collections require two totals, not every pet species and house');
  for (const set of [value => { badCode = value; }, value => { badFee = value; }, value => { badAuthority = value; }]) {
    set(true); advance(); assert.equal((await chain.status()).enabled, false); set(false); advance();
  }
  chainId = '0x1'; assert.equal((await chain.status()).enabled, false); chainId = '0x1237';
  const pet = await chain.prepareOrder({ id: randomUUID(), characterId, wallet: buyer.address, kind: 'pet', assetId: 'moss-fox' }, now);
  assert(nftOrderValid(pet)); assert(nftPlayerValid({ id: characterId, nftOrders: [pet] }));
  assert.equal(pet.amountWei, '0'); assert.equal(pet.approval, undefined); assert.equal(pet.expiresAt, 1300000);
  assert(!nftPlayerValid({ id: characterId, nftOrders: [pet, pet] }));
  for (const change of [{ wallet: recipient.address }, { amountWei: '1' }, { assetId: 'golden-pig' }, { tokenId: '1' }, { characterId: randomUUID() },
    { expiresAt: pet.expiresAt + 1000 }, { transaction: { ...pet.transaction, to: housesContract } }]) {
    assert(!nftOrderValid({ ...pet, ...change })); await assert.rejects(chain.settlement({ ...pet, ...change }));
  }
  assert.equal((await chain.settlement(pet)).state, 'pending');
  minted.set(`${latest.hash}:${pet.contractOrder.orderId}`, pet.orderHash); advance();
  assert.equal((await chain.settlement(pet)).state, 'minted', 'canonical included mint settles without a client transaction hash');
  assert.equal((await chain.settlement(pet)).state, 'minted', 'repeat checks recover the same included mint');
  const includedHead = latest;
  latest = canonical.get(toQuantity(BigInt(includedHead.number) - 1n));
  await assert.rejects(chain.settlement(pet), /head/, 'an older latest head cannot confirm or release an included claim');
  await assert.rejects(chain.ownership(buyer.address), /head/, 'ownership rejects a regressed latest head');
  latest = { ...includedHead, timestamp: toQuantity(Math.floor(now / 1000) - 121) };
  await assert.rejects(chain.settlement(pet), /head/, 'stale inclusion does not settle a claim');
  latest = includedHead;
  const orphanedHead = createNftChain({ ...options, rpc: async (method, params) => method === 'eth_getBlockByNumber' && params[0] === latest.number
    ? { ...latest, hash: id('orphaned-latest') } : rpc(method, params) });
  await assert.rejects(orphanedHead.settlement(pet), /changed during verification/, 'a success observed in a removed latest block is rejected');
  minted.set(`${latest.hash}:${pet.contractOrder.orderId}`, id('conflicting-current-claim')); advance();
  await assert.rejects(chain.settlement(pet), /conflicting/, 'a different included authorization cannot settle this mint');
  minted.delete(`${latest.hash}:${pet.contractOrder.orderId}`); advance();
  assert.equal((await chain.settlement(pet)).state, 'pending', 'a removed mint does not release escrow before finalized unpaid expiry');
  minted.set(`${latest.hash}:${pet.contractOrder.orderId}`, pet.orderHash); advance();
  assert.equal((await chain.settlement(pet)).state, 'minted', 're-inclusion recovers the exact same signed mint');
  const lagSaved = { now, finalized, latest };
  try {
    now = 4000000; latest = block(400, 4000); canonical.set(latest.number, latest);
    minted.set(`${latest.hash}:${pet.contractOrder.orderId}`, pet.orderHash); holdings.set(holdKey(latest.hash, buyer.address, 1), 1n);
    const lagging = createNftChain(options);
    assert.equal((await lagging.settlement(pet)).state, 'minted', 'a fresh included mint succeeds when finalized bootstrap is over30 minutes behind');
    assert.deepEqual((await lagging.ownership(buyer.address)).pets, ['moss-fox'], 'fresh ownership does not wait for delayed finality');
    finalized = block(200, 1400); canonical.set(finalized.number, finalized);
    minted.delete(`${latest.hash}:${pet.contractOrder.orderId}`); advance();
    await assert.rejects(lagging.settlement(pet), /unpaid expiry finality is stale/, 'old finalized expiry cannot release a missing mint');
  } finally { ({ now, finalized, latest } = lagSaved); }
  minted.set(`${finalized.hash}:${pet.contractOrder.orderId}`, pet.orderHash);
  advance();
  assert.equal((await chain.settlement(pet)).state, 'minted', 'finalized state recovers mint without client tx hash');
  holdings.set(holdKey(finalized.hash, buyer.address, 1), 1n); holdings.set(holdKey(latest.hash, buyer.address, 1), 1n);
  advance();
  assert.deepEqual((await chain.ownership(buyer.address)).pets, ['moss-fox']);
  holdings.delete(holdKey(latest.hash, buyer.address, 1)); holdings.set(holdKey(latest.hash, recipient.address, 1), 1n);
  advance();
  assert.deepEqual((await chain.ownership(buyer.address)).pets, [], 'current transfer removes seller rights');
  assert.deepEqual((await chain.ownership(recipient.address)).pets, ['moss-fox'], 'recipient rights follow the included transfer');
  let regressingReads = 0;
  const regressionDuringRead = createNftChain({ ...options, rpc: async (method, params) => method === 'eth_getBlockByNumber' && params[0] === 'latest' && ++regressingReads === 2
    ? canonical.get(toQuantity(BigInt(latest.number) - 1n)) : rpc(method, params) });
  await assert.rejects(regressionDuringRead.ownership(recipient.address), /head/, 'the second ownership observation cannot regress behind the first');
  let currentReads = 0;
  const transferDuringRead = createNftChain({ ...options, rpc: async (method, params) => {
    if (method === 'eth_getBlockByNumber' && params[0] === 'latest' && ++currentReads === 2) {
      holdings.delete(holdKey(latest.hash, recipient.address, 1)); holdings.set(holdKey(latest.hash, buyer.address, 1), 1n); advance();
    }
    return rpc(method, params);
  } });
  assert.deepEqual((await transferDuringRead.ownership(recipient.address)).pets, [], 'the second current-head read removes an NFT transferred during verification');
  holdings.delete(holdKey(latest.hash, buyer.address, 1)); holdings.set(holdKey(latest.hash, recipient.address, 1), 1n); advance();
  holdings.delete(holdKey(finalized.hash, buyer.address, 1)); holdings.set(holdKey(finalized.hash, recipient.address, 1), 1n);
  advance();
  assert.deepEqual((await chain.ownership(recipient.address)).pets, ['moss-fox']);
  await assert.rejects(chain.prepareOrder({ id: randomUUID(), characterId, wallet: buyer.address, kind: 'house', assetId: 'house-greenwood-1' }), /auctions/);
  const opening = await chain.prepareAuctionOpening(treasury);
  assert.equal(opening.reserveUsd, 100); assert.equal(opening.reserveWei, '1000000000000000000000');
  assert.equal(abi.parseTransaction(opening.transaction).name, 'openAuctions');
  usdWei = '200000000000000000'; const secondOpening = await chain.prepareAuctionOpening(treasury);
  assert.equal(secondOpening.reserveWei, '500000000000000000000'); assert.equal(opening.reserveWei, '1000000000000000000000', 'earlier reserve preview remains immutable');
  await assert.rejects(chain.prepareAuctionOpening(buyer.address), /owner/);
  for (const invalid of [{ usdWei: '0', observedAt: now }, { usdWei: '-1', observedAt: now }, { usdWei, observedAt: now - 90001 }, { usdWei, observedAt: now + 15001 }])
    await assert.rejects(quoteHouseAuctionReserve({ rpc, block: finalized, price: async () => invalid }));
  const fractional = await quoteHouseAuctionReserve({ rpc, block: finalized, price: async () => ({ usdWei: '3000000000000000000', observedAt: now }) });
  assert.equal(fractional.reserveWei, '33333333333333333334', '$100 reserve rounds up exactly');
  openedAt = 900n; reserveWei = BigInt(opening.reserveWei);
  advance();
  await assert.rejects(chain.prepareAuctionOpening(treasury), /already/);
  const auction = await chain.auctionState(buyer.address);
  assert.equal(auction.houses.length, 4); assert(auction.houses.every(house => house.endsAt - house.startsAt === NFT_AUCTION_DURATION_MS && house.reserveWei === opening.reserveWei));
  assert.equal(auction.walletBalanceWei, balances.get(buyer.address).toString());
  const terms = { wallet: buyer.address, action: 'bid', houseId: NFT_HOUSES[0].id, amountWei: (reserveWei + 1n).toString() };
  const bid = await chain.prepareAuctionTransaction(terms);
  assert(nftAuctionTransactionValid(bid, { ...terms, contract: housesContract })); assert.equal(bid.paymentWei, terms.amountWei);
  assert.deepEqual(Array.from(abi.parseTransaction(bid.transaction).args), [1n, BigInt(terms.amountWei), BigInt(terms.amountWei)]);
  assert(!nftAuctionTransactionValid({ ...bid, paymentWei: '1' }, { ...terms, contract: housesContract }));
  assert(!nftAuctionTransactionValid({ ...bid, transaction: { ...bid.transaction, to: petsContract } }, { ...terms, contract: housesContract }));
  balances.set(buyer.address, 1n); advance(); await assert.rejects(chain.prepareAuctionTransaction(terms), /enough MOSS/); balances.set(buyer.address, 10n ** 25n); advance();
  await assert.rejects(chain.prepareAuctionTransaction({ ...terms, amountWei: (reserveWei - 1n).toString() }), /reserve/);
  lots.set(1, [buyer.address, BigInt(terms.amountWei), false]);
  advance();
  await assert.rejects(chain.prepareAuctionTransaction(terms), /highest/);
  const increased = await chain.prepareAuctionTransaction({ ...terms, amountWei: (BigInt(terms.amountWei) + 17n).toString() }); assert.equal(increased.paymentWei, '17', 'leader tops up only the reviewed delta');
  lots.set(1, [recipient.address, BigInt(terms.amountWei), false]);
  advance();
  const displaced = await chain.prepareAuctionTransaction({ ...terms, amountWei: (BigInt(terms.amountWei) + 17n).toString() }); assert.equal(displaced.paymentWei, displaced.amountWei, 'new leader requires the full bid, not a stale delta');
  refunds.set(buyer.address, 50n);
  advance();
  const withdrawal = await chain.prepareAuctionTransaction({ wallet: buyer.address, action: 'withdraw' }); assert.equal(withdrawal.paymentWei, '0'); assert.equal(withdrawal.approval, undefined);
  refunds.delete(buyer.address); advance(); await assert.rejects(chain.prepareAuctionTransaction({ wallet: buyer.address, action: 'withdraw' }), /no outbid/);
  await assert.rejects(chain.prepareAuctionTransaction({ wallet: buyer.address, action: 'settle', houseId: terms.houseId }), /finish/);
  const txHash = id('bid-transaction'), receiptTerms = { ...terms, paymentWei: bid.paymentWei, transactionHash: txHash };
  assert.equal((await chain.checkAuctionTransaction(receiptTerms)).state, 'pending');
  transactions.set(txHash, { hash: txHash, to: housesContract, from: buyer.address, input: bid.transaction.data, value: '0x0', blockHash: finalized.hash, blockNumber: finalized.number });
  receipts.set(txHash, { transactionHash: txHash, to: housesContract, from: buyer.address, blockHash: finalized.hash, blockNumber: finalized.number, status: '0x1' });
  assert.equal((await chain.checkAuctionTransaction(receiptTerms)).state, 'confirmed');
  for (const value of [transactions.get(txHash), receipts.get(txHash)]) Object.assign(value, { blockHash: latest.hash, blockNumber: latest.number });
  assert.equal((await chain.checkAuctionTransaction(receiptTerms)).state, 'confirmed', 'canonical included auction receipt completes recovery without finality');
  receipts.get(txHash).status = '0x0'; assert.equal((await chain.checkAuctionTransaction(receiptTerms)).state, 'failed', 'included failure is never reported as a successful auction action'); receipts.get(txHash).status = '0x1';
  for (const value of [transactions.get(txHash), receipts.get(txHash)]) Object.assign(value, { blockHash: id('removed-receipt'), blockNumber: latest.number });
  assert.equal((await chain.checkAuctionTransaction(receiptTerms)).state, 'pending', 'a receipt from a removed block cannot confirm a house action');
  for (const value of [transactions.get(txHash), receipts.get(txHash)]) Object.assign(value, { blockHash: id('future-receipt'), blockNumber: toQuantity(BigInt(latest.number) + 1n) });
  assert.equal((await chain.checkAuctionTransaction(receiptTerms)).state, 'pending', 'a receipt ahead of the current head is not confirmed');
  for (const value of [transactions.get(txHash), receipts.get(txHash)]) Object.assign(value, { blockHash: finalized.hash, blockNumber: finalized.number });
  reorg = true; await assert.rejects(chain.checkAuctionTransaction(receiptTerms)); reorg = false;
  receipts.get(txHash).status = '0x0'; assert.equal((await chain.checkAuctionTransaction(receiptTerms)).state, 'failed'); receipts.get(txHash).status = '0x1';
  await assert.rejects(chain.checkAuctionTransaction({ ...receiptTerms, amountWei: '1' }));
  await assert.rejects(chain.checkAuctionTransaction({ ...receiptTerms, wallet: recipient.address }), /reviewed/);
  holdings.set(`${latest.hash}:house:1`, recipient.address);
  advance();
  assert.deepEqual((await chain.ownership(recipient.address)).houses, ['house-greenwood-1'], 'a house deed included at the current head grants access before finality');
  outage = true; await assert.rejects(chain.ownership(buyer.address)); await assert.rejects(chain.settlement(pet)); outage = false;
  reorg = true; await assert.rejects(chain.settlement(pet)); await assert.rejects(chain.ownership(recipient.address)); reorg = false;
  minted.clear(); now = 1350000; latest = block(499, 1350); canonical.set(latest.number, latest);
  assert.equal((await chain.settlement(pet)).state, 'pending', 'latest-chain and wall-clock expiry cannot return unpaid NFT escrow');
  finalized = block(500, 1301); latest = block(510, 1350); canonical.set(finalized.number, finalized); canonical.set(latest.number, latest);
  assert.equal((await chain.settlement(pet)).state, 'expired');
  minted.set(`${latest.hash}:${pet.contractOrder.orderId}`, pet.orderHash); advance();
  await assert.rejects(chain.settlement(pet), /conflicts with finalized unpaid expiry/, 'inconsistent provider state cannot bypass finalized expiry');
  minted.delete(`${latest.hash}:${pet.contractOrder.orderId}`);
  minted.set(`${finalized.hash}:${pet.contractOrder.orderId}`, pet.orderHash);
  advance();
  assert.equal((await chain.settlement(pet)).state, 'minted', 'earlier finalized mint beats expiry');
  minted.set(`${finalized.hash}:${pet.contractOrder.orderId}`, id('conflicting-claim'));
  advance();
  await assert.rejects(chain.settlement(pet), /conflicting/);
  now = 15400000; finalized = block(600, 15400); latest = block(610, 15400); canonical.set(finalized.number, finalized); canonical.set(latest.number, latest);
  const settlement = await chain.prepareAuctionTransaction({ wallet: buyer.address, action: 'settle', houseId: terms.houseId });
  assert.equal(abi.parseTransaction(settlement.transaction).name, 'settleHouse');
  await assert.rejects(chain.prepareAuctionTransaction(terms), /not open/);
  lots.set(1, [recipient.address, reserveWei + 1n, true]); advance(); await assert.rejects(chain.prepareAuctionTransaction({ wallet: buyer.address, action: 'settle', houseId: terms.houseId }), /finish/);
  finalized = block(90, 800); canonical.set(finalized.number, finalized);
  await assert.rejects(chain.ownership(recipient.address), /finality/);
  now=1000000;reset();openedAt=0n;reserveWei=0n;lots.clear();refunds.clear();legacyDeployment=true;
  const legacy=createNftChain(options), migration=createNftChain({...options,newPetsContract});
  assert.equal((await legacy.status()).enabled,true,'original immutable collections remain enabled after the runtime build changes');
  assert.equal((await legacy.status()).newPetsEnabled,false);
  const legacyPending=await legacy.prepareOrder({id:randomUUID(),characterId,wallet:buyer.address,kind:'pet',assetId:'moss-fox'},now);
  assert.equal((await migration.settlement(legacyPending)).state,'pending','existing claims keep their original contract and settlement');
  assert.equal((await migration.status()).newPetsEnabled,true);
  for(const asset of NFT_PETS.filter(pet=>pet.assetId>8&&pet.assetId<=16)){
    await assert.rejects(legacy.prepareOrder({id:randomUUID(),characterId,wallet:buyer.address,kind:'pet',assetId:asset.id},now),/not deployed/);
    const claim=await migration.prepareOrder({id:randomUUID(),characterId,wallet:buyer.address,kind:'pet',assetId:asset.id},now);
    assert.equal(claim.contract,newPetsContract);assert.equal(claim.contractOrder.assetId,asset.assetId);assert(nftOrderValid(claim));
    assert.equal((await migration.settlement(claim)).state,'pending');
    newMinted.set(`${finalized.hash}:${claim.contractOrder.orderId}`,claim.orderHash);advance();
    assert.equal((await migration.settlement(claim)).state,'minted');
    await assert.rejects(legacy.settlement(claim),/original deployment/);
  }
  for(const b of [finalized,latest]){holdings.set(holdKey(b.hash,buyer.address,1),1n);newHoldings.set(holdKey(b.hash,buyer.address,9),1n);}
  advance();assert.deepEqual((await migration.ownership(buyer.address)).pets,['moss-fox','fern-lynx'],'old and new collection ownership combine');
  newHoldings.delete(holdKey(latest.hash,buyer.address,9));newHoldings.set(holdKey(latest.hash,recipient.address,9),1n);
  advance();assert.deepEqual((await migration.ownership(buyer.address)).pets,['moss-fox'],'selling new NFT removes access immediately');
  assert.deepEqual((await migration.ownership(recipient.address)).pets,['fern-lynx'],'new-collection buyer gains rights on inclusion');
  newHoldings.set(holdKey(finalized.hash,recipient.address,9),1n);
  advance();assert.deepEqual((await migration.ownership(recipient.address)).pets,['fern-lynx']);
  for(const b of [finalized,latest]){for(let asset=1;asset<=8;asset++)holdings.set(holdKey(b.hash,buyer.address,asset),1n);for(let asset=9;asset<=16;asset++)newHoldings.set(holdKey(b.hash,buyer.address,asset),1n);for(let house=1;house<=4;house++)holdings.set(`${b.hash}:house:${house}`,buyer.address);}
  advance();
  // Real request latency and pacing exercise contention without moving the freshness deadline.
  const clockBase=now, realStart=realNow(); let bootstrapDelay=0; Date.now=()=>clockBase+bootstrapDelay+realNow()-realStart;
  const pacedNew=createNftRpc(async(method,params)=>{if(method==='eth_getBlockByNumber'&&params[0]==='finalized'&&!bootstrapDelay)bootstrapDelay=16000;await delay(250);return rpc(method,params);},{spacingMs:200,now:Date.now});
  const expanded=createNftChain({...options,newPetsContract,rpc:pacedNew}),expandedStart=Date.now(),expandedCalls=rpcCalls,completed=[];
  const record=async(label,work)=>{const value=await work,age=Date.now()-value.verifiedAt;completed.push({label,age});assert(age<15000,`${label} finishes within15s of its current-head observation`);return value;};
  const newRead=await Promise.all([expanded.status(),record('complete collection',expanded.ownership(buyer.address)),
    record('second new-pet holder',expanded.ownership(recipient.address)),record('first auction',expanded.auctionState(buyer.address)),record('second auction',expanded.auctionState(recipient.address))]);
  const elapsed=Date.now()-expandedStart;now=Date.now();Date.now=()=>now;
  assert(elapsed>=16000,'delayed historical bootstrap does not consume the current-ownership freshness window');
  assert(newRead[0].newPetsEnabled);assert.deepEqual(newRead[1].pets,NFT_PETS.filter(pet=>pet.assetId<=16).map(pet=>pet.id));assert.equal(newRead[1].houses.length,4);assert.deepEqual(newRead[2].pets,['fern-lynx']);
  console.log(`Expanded NFT cold read: ${rpcCalls-expandedCalls} RPCs in ${elapsed}ms with250ms network delay; completion ages ${JSON.stringify(completed)}.`);
  const stalledCurrent=createNftChain({...options,newPetsContract,rpc:async(method,params)=>{
    const result=await rpc(method,params);if(method==='eth_getBlockByNumber'&&params[0]==='latest')now+=15000;return result;
  }});
  await assert.rejects(stalledCurrent.ownership(buyer.address),/ownership changed while being read/,'a genuinely stale current ownership observation is rejected');
  await assert.rejects(stalledCurrent.auctionState(buyer.address),/auction state changed while being read/,'a genuinely stale current auction observation is rejected');
  badNewCode=true;advance();const degraded=await migration.status();assert(degraded.enabled&&!degraded.newPetsEnabled,'new deployment failure cannot disable legacy collections');
  assert.deepEqual((await migration.ownership(buyer.address)).pets,NFT_PETS.filter(pet=>pet.assetId<=8).map(pet=>pet.id));
  assert.deepEqual((await migration.ownership(recipient.address)).pets,[],'unverified new contract fails closed');
  badNewCode=false;
  const collision=await createNftChain({...options,newPetsContract:petsContract}).status();assert(collision.enabled&&!collision.newPetsEnabled);assert.match(collision.newPetsReason,/distinct/);
  {
  reset(); now = 1000000; legacyDeployment = true; openedAt = 0n; reserveWei = 0n; lots.clear();
  const legacy = createNftChain(options), expanded = createNftChain({ ...options, petsV2Contract });
  for (const invalid of [{ newPetsContract: 'invalid' }, { mountsContract: 'invalid' }])
    assert.equal((await createNftChain({ ...options, petsV2Contract, ...invalid }).ownership(buyer.address)).collectionsVerified, false, 'invalid configured optional collections cannot masquerade as absent');
  badNewCode = true;
  const partialV2 = await createNftChain({ ...options, petsV2Contract, newPetsContract }).ownership(buyer.address);
  assert.equal(partialV2.newPetsVerified, true, 'V2 access still works when the old expansion fails');
  assert.equal(partialV2.collectionsVerified, false, 'V2 verification cannot hide failed legacy expansion holdings from empty-wallet polling');
  badNewCode = false;
  const legacyStatus = await legacy.status(), expandedStatus = await expanded.status();
  assert.equal(legacyStatus.enabled, true, legacyStatus.reason);
  assert.deepEqual(legacyStatus.mintablePetIds, NFT_LEGACY_PETS.map(pet => pet.id));
  assert.equal(legacyStatus.legacyPetsContract, undefined);
  assert.equal(expandedStatus.enabled, true, expandedStatus.reason);
  assert.equal(expandedStatus.petsContract, petsV2Contract);
  assert.equal(expandedStatus.legacyPetsContract, petsContract);
  assert.equal(expandedStatus.housesContract, housesContract);
  assert.deepEqual(expandedStatus.mintablePetIds, NFT_PETS.map(pet => pet.id));
  assert.equal(expandedStatus.mintablePetIds.length, 26);
  for (const contract of [petsV2Contract, petsContract, housesContract]) {
    badCodeAt = contract; advance();
    const invalid = await expanded.status(); assert.equal(invalid.enabled, false); assert.match(invalid.reason, /reviewed contracts/);
    badCodeAt = undefined; advance();
  }
  badLegacy = true; advance();
  const wrongLegacy = await expanded.status(); assert.equal(wrongLegacy.enabled, false); assert.match(wrongLegacy.reason, /different legacy/);
  badLegacy = false; advance();
  assert.equal((await createNftChain({ ...options, petsV2Contract: petsContract }).status()).enabled, false, 'replacement and legacy addresses cannot be the same');
  const claimTerms = { characterId, wallet: buyer.address, kind: 'pet' };
  const oldClaim = await legacy.prepareOrder({ ...claimTerms, id: randomUUID(), assetId: 'moss-fox' }, now);
  assert.equal(oldClaim.contract, petsContract);
  await assert.rejects(legacy.prepareOrder({ ...claimTerms, id: randomUUID(), assetId: 'fern-lynx' }, now), /expanded/);
  await assert.rejects(legacy.prepareOrder({ ...claimTerms, id: randomUUID(), assetId: 'moss-fox', claimSource: 'learned' }, now), /expanded/);
  const newClaim = await expanded.prepareOrder({ ...claimTerms, id: randomUUID(), assetId: 'suncrest-peacock' }, now);
  assert.equal(newClaim.contract, petsV2Contract); assert.equal(newClaim.contractOrder.assetId, 26); assert(nftOrderValid(newClaim));
  for (const pet of NFT_PETS) {
    const learnedClaim = await expanded.prepareOrder({ ...claimTerms, id: randomUUID(), assetId: pet.id, claimSource: 'learned' }, now);
    assert(nftOrderValid(learnedClaim), `${pet.id} supports learned conversion`);
    assert.equal(learnedClaim.contractOrder.assetId, pet.assetId);
    assert.equal(learnedClaim.claimSource, 'learned'); assert.equal(learnedClaim.contract, petsV2Contract);
    assert(!nftOrderValid({ ...learnedClaim, claimSource: 'forged' }));
    if (pet.storeOnly) assert(!nftOrderValid({ ...learnedClaim, claimSource: undefined }), 'store claims require their reserved learned entitlement');
    if (pet.assetId >= 19) {
      await assert.rejects(legacy.prepareOrder({ ...claimTerms, id: randomUUID(), assetId: pet.id }, now), /expanded/);
      const dropClaim = await expanded.prepareOrder({ ...claimTerms, id: randomUUID(), assetId: pet.id }, now);
      assert(nftOrderValid(dropClaim)); assert.equal(dropClaim.contractOrder.assetId, pet.assetId); assert.equal(dropClaim.claimSource, undefined);
    }
  }
  await assert.rejects(expanded.prepareOrder({ ...claimTerms, id: randomUUID(), assetId: 'store-cinder-kit' }, now));
  await assert.rejects(expanded.prepareOrder({ ...claimTerms, id: randomUUID(), assetId: 'fern-lynx', claimSource: 'forged' }, now), /expanded/);
  await assert.rejects(expanded.settlement({ ...oldClaim, claimSource: 'learned' }), /original deployment/);
  await assert.rejects(expanded.settlement({ ...newClaim, claimSource: 'forged' }), /original deployment/);
  minted.set(mintKey(finalized.hash, oldClaim.contractOrder.orderId, petsV2Contract), oldClaim.orderHash);
  advance(); assert.equal((await expanded.settlement(oldClaim)).state, 'pending', 'cutover still reads legacy claims from their original contract');
  minted.set(mintKey(latest.hash, oldClaim.contractOrder.orderId), oldClaim.orderHash);
  advance(); assert.equal((await expanded.settlement(oldClaim)).state, 'minted', 'included legacy claim settles through the original contract after cutover');
  minted.set(mintKey(finalized.hash, oldClaim.contractOrder.orderId), oldClaim.orderHash);
  advance(); assert.equal((await expanded.settlement(oldClaim)).state, 'minted', 'legacy claim settles after V2 activation');
  minted.set(mintKey(finalized.hash, newClaim.contractOrder.orderId), newClaim.orderHash);
  advance(); assert.equal((await expanded.settlement(newClaim)).state, 'pending', 'V2 claims cannot settle from legacy contract state');
  minted.set(mintKey(finalized.hash, newClaim.contractOrder.orderId, petsV2Contract), newClaim.orderHash);
  advance(); assert.equal((await expanded.settlement(newClaim)).state, 'minted');
  const tokenId = oldClaim.tokenId;
  for (const b of [finalized, latest]) { tokenOwners.set(tokenKey(b.hash, tokenId), buyer.address); tokenAssets.set(tokenKey(b.hash, tokenId), 1n); }
  advance();
  await assert.rejects(legacy.prepareMigration({ wallet: buyer.address, tokenId }), /not enabled/);
  const migration = await expanded.prepareMigration({ wallet: buyer.address, tokenId });
  const migrationTerms = { wallet: buyer.address, tokenId, legacyContract: petsContract, contract: petsV2Contract };
  assert(nftMigrationTransactionValid(migration, migrationTerms)); assert.equal(migration.assetId, 'moss-fox');
  assert.equal(abi.parseTransaction(migration.approval).name, 'approve');
  assert.deepEqual(Array.from(abi.parseTransaction(migration.approval).args), [petsV2Contract, BigInt(tokenId)]);
  assert.equal(petsAbi.parseTransaction(migration.transaction).name, 'migrate');
  assert.deepEqual(Array.from(petsAbi.parseTransaction(migration.transaction).args), [BigInt(tokenId)]);
  for (const changed of [
    { wallet: recipient.address }, { tokenId: '1' }, { assetId: 'fern-lynx' }, { legacyContract: housesContract }, { contract: petsContract },
    { approval: { ...migration.approval, data: abi.encodeFunctionData('setApprovalForAll', [petsV2Contract, true]) } },
    { transaction: { ...migration.transaction, value: '0x1' } }, { transaction: { ...migration.transaction, chainId: '0x1' } },
  ]) assert(!nftMigrationTransactionValid({ ...migration, ...changed }, migrationTerms), 'migration review rejects changed wallet, token, contract or approval scope');
  for (const invalidToken of ['0', '-1', '01', '1.5', (2n ** 256n).toString()]) await assert.rejects(expanded.prepareMigration({ wallet: buyer.address, tokenId: invalidToken }), /valid original/);
  tokenOwners.set(tokenKey(latest.hash, tokenId), recipient.address); advance();
  await assert.rejects(expanded.prepareMigration({ wallet: buyer.address, tokenId }), /currently own/);
  assert(nftMigrationTransactionValid(await expanded.prepareMigration({ wallet: recipient.address, tokenId }), { ...migrationTerms, wallet: recipient.address }), 'a newly included owner can migrate without finality');
  tokenOwners.set(tokenKey(finalized.hash, tokenId), recipient.address); advance();
  assert(nftMigrationTransactionValid(await expanded.prepareMigration({ wallet: recipient.address, tokenId }), { ...migrationTerms, wallet: recipient.address }));
  tokenAssets.set(tokenKey(latest.hash, tokenId), 9n); advance();
  await assert.rejects(expanded.prepareMigration({ wallet: recipient.address, tokenId }), /not an original/);
  for (const b of [finalized, latest]) {
    for (const assetId of [1, 3, 9]) holdings.set(holdKey(b.hash, buyer.address, assetId), 1n);
    for (const assetId of [1, 9, 18, ...NFT_PETS.slice(18).map(pet => pet.assetId)]) holdings.set(holdKey(b.hash, buyer.address, assetId, petsV2Contract), 1n);
    holdings.set(`${b.hash}:house:1`, buyer.address);
  }
  advance();
  petBalanceCalls.length = 0;
  const combinedOwnership = await expanded.ownership(buyer.address);
  assert.deepEqual(combinedOwnership.pets.slice().sort(), ['moss-fox', 'ember-drake', 'fern-lynx', 'store-cinder-kit', ...NFT_PETS.slice(18).map(pet => pet.id)].sort(), 'ownership unions both collections and deduplicates a species');
  assert.deepEqual(petBalanceCalls, [{ hash: latest.hash, assets: NFT_PETS.map(pet => pet.assetId) }, { hash: latest.hash, assets: [1, 9, 18, ...NFT_PETS.slice(18).map(pet => pet.assetId)] }], 'V2 uses current balances and rechecks only owned species');
  assert.deepEqual(combinedOwnership.houses, ['house-greenwood-1']);
  assert.equal(combinedOwnership.newPetsVerified, true, 'V2 ownership authorizes expanded species even without a sixteen-species collection');
  assert.deepEqual((await legacy.ownership(buyer.address)).pets, ['moss-fox', 'ember-drake'], 'the original collection never grants expanded species');
  holdings.delete(holdKey(latest.hash, buyer.address, 26, petsV2Contract));
  holdings.set(holdKey(latest.hash, recipient.address, 26, petsV2Contract), 1n);
  holdings.delete(holdKey(latest.hash, buyer.address, 18, petsV2Contract));
  holdings.set(holdKey(latest.hash, recipient.address, 18, petsV2Contract), 1n);
  advance();
  assert(!(await expanded.ownership(buyer.address)).pets.includes('store-cinder-kit'), 'latest V2 transfer revokes the old holder');
  assert.deepEqual((await expanded.ownership(recipient.address)).pets, ['store-cinder-kit', 'suncrest-peacock'], 'new V2 holder gains rights on inclusion');
  holdings.set(holdKey(finalized.hash, recipient.address, 18, petsV2Contract), 1n);
  holdings.delete(holdKey(finalized.hash, buyer.address, 18, petsV2Contract)); advance();
  assert.deepEqual((await expanded.ownership(recipient.address)).pets, ['store-cinder-kit', 'suncrest-peacock']);
  holdings.delete(holdKey(latest.hash, buyer.address, 3)); holdings.set(holdKey(latest.hash, buyer.address, 3, petsV2Contract), 1n); advance();
  assert((await expanded.ownership(buyer.address)).pets.includes('ember-drake'), 'included V2 migration keeps the species available without finality');
  holdings.delete(holdKey(finalized.hash, buyer.address, 3)); holdings.set(holdKey(finalized.hash, buyer.address, 3, petsV2Contract), 1n); advance();
  assert((await expanded.ownership(buyer.address)).pets.includes('ember-drake'), 'finalized migrated NFT restores its species');
  const allCollections = createNftChain({ ...options, newPetsContract, petsV2Contract });
  const sixteenClaim = await createNftChain({ ...options, newPetsContract }).prepareOrder({ ...claimTerms, id: randomUUID(), assetId: 'moonveil-gryphlet', claimSource: 'learned' }, now);
  assert.equal(sixteenClaim.contract, newPetsContract); assert.equal(sixteenClaim.claimSource, 'learned');
  assert.equal((await allCollections.settlement(sixteenClaim)).state, 'pending', 'sixteen-species learned claims survive V2 cutover');
  newMinted.set(`${finalized.hash}:${sixteenClaim.contractOrder.orderId}`, sixteenClaim.orderHash);
  for (const b of [finalized, latest]) newHoldings.set(holdKey(b.hash, buyer.address, 10), 1n);
  advance();
  assert.equal((await allCollections.settlement(sixteenClaim)).state, 'minted');
  const retainedOwnership = await allCollections.ownership(buyer.address);
  for (const petId of ['moss-fox', 'moonveil-gryphlet', 'fern-lynx', 'ember-drake']) assert(retainedOwnership.pets.includes(petId), `${petId} survives three-collection cutover`);
  reorg = true; await assert.rejects(expanded.prepareMigration({ wallet: recipient.address, tokenId })); await assert.rejects(expanded.ownership(buyer.address)); reorg = false;
  outage = true; await assert.rejects(expanded.ownership(buyer.address)); outage = false;
  const expandedPaced = createNftChain({ ...options, petsV2Contract, rpc: createNftRpc(rpc, { spacingMs: 200, now: () => now, wait: async ms => { now += ms; } }) }), expandedStart = now, expandedCalls = rpcCalls;
  const expandedCold = await Promise.allSettled([expandedPaced.status(), expandedPaced.ownership(buyer.address), expandedPaced.ownership(recipient.address), expandedPaced.auctionState(buyer.address), expandedPaced.auctionState(recipient.address)]);
  console.log(`NFT V2 combined cold read: ${rpcCalls - expandedCalls} paced RPCs in ${now - expandedStart}ms.`);
  assert(expandedCold.every(value => value.status === 'fulfilled'), expandedCold.filter(value => value.status === 'rejected').map(value => value.reason.message).join('; '));
  assert.equal(expandedCold[0].value.enabled, true, expandedCold[0].value.reason);
  assert(expandedCold.slice(1).every(value => now - value.value.verifiedAt < 15000), 'V2 ownership must fit the unchanged freshness window');
  console.log('NFT V2: all 26 species, learned sources, independent deployment hashes, legacy claim settlement, exact-token migration review and dual-collection current ownership passed.');
  }
  console.log('NFT chain: verified deployments, exact fees/vouchers, $100 opening reserve, four-hour bids/debit caps/funds/refunds/receipt checks, unique houses, current-owner pet/deed transfers, included recovery and finalized unpaid expiry, reorg/outage/expiry guards passed. No transaction sent.');
} finally { Date.now = realNow; }
