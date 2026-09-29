import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { AbiCoder, Interface, ZeroAddress, getAddress, id, keccak256, toQuantity } from 'ethers';
import { prepareNftSetup, NFT_METADATA_BASE } from './nft-setup.mjs';
import { LEGACY_NFT_RUNTIME_HASH } from '../src/nft-chain.mjs';
import { NFT_BUYBACK_ADDRESSES as a, NFT_BUYBACK_DEPLOYMENTS } from './nft-buyback.mjs';

const nftArtifact = JSON.parse(readFileSync(new URL('../public/contracts/MossvaleNFT.json', import.meta.url), 'utf8'));
const petArtifact = JSON.parse(readFileSync(new URL('../public/contracts/MossvalePets.json', import.meta.url), 'utf8'));
const mountArtifact = JSON.parse(readFileSync(new URL('../public/contracts/MossvaleMounts.json', import.meta.url), 'utf8'));
const mountAbi = new Interface(mountArtifact.abi), mounts = getAddress('0x0000000000000000000000000000000000000009');
const expanded = new Interface(petArtifact.abi), petsV2 = getAddress('0x0000000000000000000000000000000000000008');
const feeArtifact = JSON.parse(readFileSync(new URL('../public/contracts/MossvaleBuyBurn.json', import.meta.url), 'utf8'));
const infrastructure = JSON.parse(readFileSync(new URL('./fixtures/nft-setup-infrastructure-runtime.json', import.meta.url), 'utf8'));
for (const [name, code] of Object.entries(infrastructure)) assert.equal(keccak256(code), NFT_BUYBACK_DEPLOYMENTS.contracts[name].codeHash);
const nft = new Interface(nftArtifact.abi), fees = new Interface(feeArtifact.abi), coder = AbiCoder.defaultAbiCoder();
const legacyRuntime = readFileSync(new URL('./fixtures/mossvale-nft-v1-runtime.hex', import.meta.url), 'utf8').trim();
assert.equal(keccak256(legacyRuntime), LEGACY_NFT_RUNTIME_HASH, 'legacy verification uses the pinned deployed runtime');
assert.notEqual(nftArtifact.runtimeCodeHash, LEGACY_NFT_RUNTIME_HASH, 'new pet deployment uses the expanded contract');
const [wallet, authority, receiver, pets, houses, outsider, newPets] = [1, 2, 3, 4, 5, 6, 7].map(value => getAddress(`0x${String(value).padStart(40, '0')}`));
const now = 1800000000000;
const latest = { number: '0x10000', hash: id('setup-head'), timestamp: toQuantity(now / 1000) };
const finalized = { number: '0xf000', hash: id('setup-finalized'), timestamp: toQuantity(now / 1000 - 300) };
const codes = new Map([[mounts, mountArtifact.deployedBytecode], [petsV2, petArtifact.deployedBytecode], [receiver, feeArtifact.deployedBytecode], [pets, legacyRuntime], [houses, legacyRuntime], [newPets, nftArtifact.deployedBytecode],
  [a.moss, readFileSync(new URL('./fixtures/moss-token-runtime.hex', import.meta.url), 'utf8').trim()],
  ...Object.entries(infrastructure).map(([name, code]) => [a[name], code])].map(([key, value]) => [key.toLowerCase(), value]));
let change = {};
const calls = [];
const provider = { async send(method, params) {
  calls.push(method);
  if (method === 'eth_chainId') return change.chain || '0x1237';
  if (method === 'eth_getBlockByNumber') {
    const value = params[0] === 'finalized' || params[0] === finalized.number ? finalized : latest;
    return { ...value, ...(change.stale && params[0] === 'latest' ? { timestamp: toQuantity(now / 1000 - 121) } : {}),
      ...(change.staleFinalized && params[0] === 'finalized' ? { timestamp: toQuantity(now / 1000 - 1801) } : {}),
      ...(change.reorg && params[0].startsWith('0x') ? { hash: id('changed-block') } : {}) };
  }
  if (method === 'eth_getCode') {
    assert.deepEqual(params[1], { blockHash: latest.hash, requireCanonical: true });
    if (change.legacyNewCode && params[0].toLowerCase() === newPets.toLowerCase()) return legacyRuntime;
    return params[0].toLowerCase() === change.badCode?.toLowerCase() ? '0x' : codes.get(params[0].toLowerCase()) || '0x';
  }
  if (method === 'eth_call') {
    assert.deepEqual(params[1], { blockHash: latest.hash, requireCanonical: true });
    if (!params[0].to) {
      const creatingMount = params[0].data.startsWith(mountArtifact.bytecode);
      assert(creatingMount || params[0].data.startsWith(petArtifact.bytecode), 'only reviewed creation is simulated');
      assert.equal(params[0].from, wallet); assert.equal(params[0].value, '0x0');
      if (change.creationFailed) throw Error('Creation simulation reverted');
      return change.simRuntime || (creatingMount ? mountArtifact.deployedBytecode : petArtifact.deployedBytecode);
    }
    const target = getAddress(params[0].to), abi = target === receiver ? fees : target === petsV2 ? expanded : target === mounts ? mountAbi : nft, parsed = abi.parseTransaction(params[0]);
    const isHouse = target === houses, kind = isHouse ? 'houses' : target === mounts ? 'mounts' : 'pets';
    const mutation = change.onlyNew && target !== newPets ? {} : change;
    const values = { owner: [(target === receiver ? mutation.receiverOwner : mutation.collectionOwner) || wallet],
      authority: [mutation.authority || authority], paymentToken: [mutation.token || a.moss],
      swapRouter: [mutation.router || a.router], wrappedNative: [a.weth], permit2: [a.permit2],
      houseCollection: [mutation.wrongKind ? !isHouse : isHouse], feeReceiver: [mutation.feeReceiver || receiver],
      name: [mutation.name || (isHouse ? 'Mossvale Houses' : target === mounts ? 'Mossvale Mounts' : 'Mossvale Pets')],
      royaltyInfo: [mutation.royaltyReceiver || receiver, mutation.royaltyBps ?? 500n],
      contractURI: [mutation.uri || `${NFT_METADATA_BASE}${kind}/collection.json`],
      auctionsOpenedAt: [mutation.opened ?? 0n], auctionEndsAt: [0n], auctionReserveWei: [0n],
      houseAuctions: mutation.lot || [ZeroAddress, 0n, false], houseOwner: [mutation.houseOwner || ZeroAddress], openAuctions: [], legacyCollection: [pets], maxAssetId: [3n] };
    if (target === petsV2) Object.assign(values, change.badV2);
    if (target === mounts) Object.assign(values, change.badMount);
    if (parsed.name === 'openAuctions') assert.equal(params[0].from, wallet, 'simulation uses the reviewed owner wallet');
    assert(values[parsed.name], `Unexpected call ${parsed.name}`);
    return abi.encodeFunctionResult(parsed.name, values[parsed.name]);
  }
  if (method === 'eth_estimateGas') {
    assert(params[0].data.startsWith(petArtifact.bytecode) || params[0].data.startsWith(mountArtifact.bytecode)); assert.equal(params[0].from, wallet); assert.equal(params[1], latest.number);
    return change.gas ?? '0x4c4b40';
  }
  throw Error(`Setup must not call ${method}`);
} };
const quoteOptions = { now, price: async ({ block }) => {
  assert.deepEqual(block, finalized);
  return { usdWei: '300000000000000000', observedAt: now - (change.stalePrice ? 90001 : 0), source: 'Deterministic test price' };
} };
const prepare = values => prepareNftSetup(provider, { wallet, authority, ...values }, quoteOptions);
const decodeConstructor = (review, artifact) => {
  assert(review.transaction.data.startsWith(artifact.bytecode));
  return coder.decode(artifact.abi.find(value => value.type === 'constructor').inputs, `0x${review.transaction.data.slice(artifact.bytecode.length)}`).toArray();
};
const first = await prepare({});
assert.equal(first.broadcast, false); assert.equal(first.transactions.length, 1);
assert.deepEqual(decodeConstructor(first.transactions[0], feeArtifact), [wallet, a.router, a.weth, a.permit2]);
assert.equal(first.transactions[0].transaction.from, wallet); assert.equal(first.transactions[0].transaction.chainId, '0x1237');
assert.equal(first.transactions[0].transaction.to, undefined, 'deployment uses no predicted receiver address');
assert.equal(first.transactions[0].transaction.value, '0x0');
const second = await prepare({ receiver });
assert.equal(second.transactions.length, 2);
for (const [index, kind] of ['pets', 'houses'].entries()) {
  assert.deepEqual(decodeConstructor(second.transactions[index], nftArtifact),
    [index === 1, authority, receiver, `${NFT_METADATA_BASE}${kind}/`, `${NFT_METADATA_BASE}${kind}/collection.json`]);
  assert.equal(second.transactions[index].transaction.from, wallet, 'collection owner becomes this deployment sender');
}
const complete = await prepare({ receiver, pets, houses });
assert.equal(complete.transactions.length, 0, 'verified supplied deployments do not produce duplicates');
assert.deepEqual(complete.verified, { receiver, pets, houses });
for (const contract of [pets, houses]) codes.set(contract.toLowerCase(), nftArtifact.deployedBytecode);
assert.deepEqual((await prepare({ receiver, pets, houses })).verified, complete.verified, 'original setup also accepts reviewed current deployments');
for (const contract of [pets, houses]) codes.set(contract.toLowerCase(), legacyRuntime);
const expansion = await prepare({ receiver, pets, houses, deployNewPets: true });
assert.equal(expansion.broadcast, false); assert.equal(expansion.mode, 'new-pets'); assert.equal(expansion.transactions.length, 1);
assert.deepEqual(expansion.assetIds, [9, 10, 11, 12, 13, 14, 15, 16]);
assert.deepEqual(expansion.verified, { receiver, pets, houses });
assert.deepEqual(expansion.configuration, { NFT_PETS_CONTRACT: pets, NFT_HOUSES_CONTRACT: houses, NFT_FEE_RECEIVER: receiver });
assert.deepEqual(decodeConstructor(expansion.transactions[0], nftArtifact), [false, authority, receiver, `${NFT_METADATA_BASE}pets/`, `${NFT_METADATA_BASE}pets/collection.json`]);
assert.equal(expansion.transactions[0].runtimeCodeHash, nftArtifact.runtimeCodeHash);
assert.equal(expansion.transactions[0].transaction.to, undefined, 'new collection address comes only from the eventual receipt');
assert.match(expansion.nextStep, /--new-pets-contract/);
const expansionReady = await prepare({ receiver, pets, houses, deployNewPets: true, newPets });
assert.equal(expansionReady.transactions.length, 0, 'verified new collection is never deployed twice');
assert.deepEqual(expansionReady.verified, { receiver, pets, houses, newPets });
assert.deepEqual(expansionReady.configuration, { ...expansion.configuration, NFT_NEW_PETS_CONTRACT: newPets });
change = { opened: 1n, lot: [wallet, 1n, true], houseOwner: wallet };
assert.equal((await prepare({ receiver, pets, houses, deployNewPets: true })).transactions.length, 1, 'new pets do not reopen or alter existing house auctions');
change = {};
const opening = await prepare({ receiver, houses, openHouseAuctions: true });
assert.equal(opening.transactions.length, 1, 'opening does not deploy an omitted pet collection');
const openTx = opening.transactions[0].transaction;
assert.equal(openTx.to, houses); assert.equal(openTx.from, wallet);
assert.equal(nft.parseTransaction(openTx).name, 'openAuctions');
assert.equal(nft.decodeFunctionData('openAuctions', openTx.data)[0], 333333333333333333334n, '$100 MOSS reserve rounds up');
assert.equal(opening.opening.reserveUsd, 100); assert.equal(opening.opening.durationSeconds, 14400);
assert.deepEqual(opening.opening.houseIds, [1, 2, 3, 4]);
assert.match(opening.opening.starts, /transaction executes/);
assert.match(opening.opening.quoteReview, /does not enforce.*quote expiry/);

for (const values of [{ wallet: ZeroAddress }, { authority: '0x1234' }, { authority: `0x${'a'.repeat(64)}` },
  { houses }, { openHouseAuctions: true }, { receiver, pets: receiver }, { receiver: wallet },
  { receiver, pets, houses, newPets }, { deployNewPets: true }, { receiver, deployNewPets: true },
  { receiver, pets, deployNewPets: true }, { receiver, houses, deployNewPets: true },
  { receiver, pets, houses, deployNewPets: true, openHouseAuctions: true },
  ...[receiver, pets, houses, wallet, authority].map(value => ({ receiver, pets, houses, deployNewPets: true, newPets: value }))]) await assert.rejects(prepare(values));
for (const mutation of [{ chain: '0x1' }, { stale: true }, { reorg: true }, { badCode: a.router }, { badCode: a.moss },
  { badCode: receiver }, { badCode: houses }, { receiverOwner: outsider }, { collectionOwner: outsider }, { authority: outsider },
  { token: outsider }, { router: outsider }, { wrongKind: true }, { feeReceiver: outsider }, { royaltyReceiver: outsider },
  { royaltyBps: 499n }, { name: 'Wrong collection' }, { uri: 'https://wrong/collection.json' }]) {
  change = mutation; await assert.rejects(prepare({ receiver, pets, houses }), JSON.stringify(mutation, (_, value) => typeof value === 'bigint' ? String(value) : value));
}
for (const mutation of [{ opened: 1n }, { lot: [wallet, 1n, false] }, { lot: [ZeroAddress, 0n, true] }, { houseOwner: wallet },
  { staleFinalized: true }, { stalePrice: true }]) {
  change = mutation; await assert.rejects(prepare({ receiver, houses, openHouseAuctions: true }));
}
change = {};
for (const mutation of [{ legacyNewCode: true }, { badCode: newPets }, { collectionOwner: outsider }, { authority: outsider },
  { token: outsider }, { wrongKind: true }, { feeReceiver: outsider }, { royaltyReceiver: outsider }, { royaltyBps: 0n },
  { name: 'Wrong collection' }, { uri: 'https://wrong/collection.json' }]) {
  change = { onlyNew: true, ...mutation }; await assert.rejects(prepare({ receiver, pets, houses, deployNewPets: true, newPets }));
}
change = {};
{
const expansion = await prepare({ receiver, pets, houses, expandPets: true });
assert.equal(expansion.broadcast, false); assert.equal(expansion.transactions.length, 1, 'expansion deploys only the new pet contract');
const petDeploy = expansion.transactions[0];
assert.equal(petDeploy.contract, 'MossvalePets'); assert.equal(petDeploy.runtimeCodeHash, petArtifact.runtimeCodeHash);
assert.deepEqual(decodeConstructor(petDeploy, petArtifact), [pets, authority, receiver, `${NFT_METADATA_BASE}pets/`, `${NFT_METADATA_BASE}pets/collection.json`]);
assert.equal(petDeploy.transaction.from, wallet); assert.equal(petDeploy.transaction.to, undefined);
assert.equal(petDeploy.estimatedGasUnits, '5000000'); assert.equal(BigInt(petDeploy.transaction.gas), 6000000n);
assert.deepEqual(expansion.verified, { receiver, pets, houses }, 'all original deployments are verified and retained');
const verifiedExpansion = await prepare({ receiver, pets, houses, expandPets: true, petsV2 });
assert.deepEqual(verifiedExpansion.verified, { receiver, pets, houses, petsV2 });
assert.equal(verifiedExpansion.transactions.length, 0, 'verified pet upgrade never produces duplicate deployment');

codes.set(pets.toLowerCase(), nftArtifact.deployedBytecode);
await assert.rejects(prepare({ receiver, pets, houses, expandPets: true }), /runtime differs/, 'V2 migration pins the original eight-species collection');
codes.set(pets.toLowerCase(), legacyRuntime);
const retainedSixteen = await prepare({ receiver, pets, houses, expandPets: true, petsV2, newPets });
assert.equal(retainedSixteen.transactions.length, 0);
assert.equal(retainedSixteen.configuration.NFT_NEW_PETS_CONTRACT, newPets);
assert.equal(retainedSixteen.configuration.NFT_PETS_V2_CONTRACT, petsV2);
for (const values of [{ expandPets: true }, { receiver, pets, expandPets: true }, { receiver, houses, expandPets: true },
  { receiver, pets, houses, expandPets: true, openHouseAuctions: true }, { receiver, pets, houses, expandPets: true, deployNewPets: true },
  { receiver, pets, houses, petsV2 }, { receiver, pets, houses, expandPets: true, petsV2: pets }]) await assert.rejects(prepare(values));
for (const mutation of [{ creationFailed: true }, { simRuntime: '0x' }, { gas: '0x0' }, { badCode: pets }, { badCode: houses }, { reorg: true }]) {
  change = mutation; await assert.rejects(prepare({ receiver, pets, houses, expandPets: true }));
}
for (const mutation of [{ badCode: petsV2 }, ...[
  { owner: [outsider] }, { authority: [outsider] }, { paymentToken: [outsider] }, { houseCollection: [true] }, { feeReceiver: [outsider] },
  { name: ['Wrong pets'] }, { royaltyInfo: [receiver, 499n] }, { contractURI: ['https://wrong/'] }, { legacyCollection: [houses] },
].map(badV2 => ({ badV2 }))]) {
  change = mutation; await assert.rejects(prepare({ receiver, pets, houses, expandPets: true, petsV2 }));
}
change = {};
}
{
const mountConfig = { receiver, pets, houses, petsV2, deployMounts: true };
const review = await prepare(mountConfig);
assert.equal(review.broadcast, false); assert.equal(review.mode, 'mounts'); assert.equal(review.transactions.length, 1);
const deployment = review.transactions[0];
assert.equal(deployment.contract, 'MossvaleMounts'); assert.equal(deployment.runtimeCodeHash, mountArtifact.runtimeCodeHash);
assert.deepEqual(decodeConstructor(deployment, mountArtifact), [authority, receiver, 3n, `${NFT_METADATA_BASE}mounts/`, `${NFT_METADATA_BASE}mounts/collection.json`]);
assert.equal(deployment.transaction.from, wallet); assert.equal(deployment.transaction.value, '0x0');
assert.equal(deployment.estimatedGasUnits, '5000000'); assert.equal(BigInt(deployment.transaction.gas), 6000000n);
assert.equal(review.configuration.NFT_PETS_V2_CONTRACT, petsV2);
assert.deepEqual(review.assetIds, [1, 2, 3]); assert.match(review.nextStep, /--mounts-contract/);
const verifiedMounts = await prepare({ ...mountConfig, mounts });
assert.deepEqual(verifiedMounts.verified, { receiver, pets, houses, petsV2, mounts });
assert.equal(verifiedMounts.transactions.length, 0, 'verified mount collection is never redeployed');
assert.equal(verifiedMounts.configuration.NFT_MOUNTS_CONTRACT, mounts);
assert.equal(verifiedMounts.configuration.NFT_PETS_V2_CONTRACT, petsV2);
assert.match(verifiedMounts.nextStep, /every realm before setting NFT_MOUNTS_CONTRACT/);
for (const value of [{ deployMounts: true }, { ...mountConfig, receiver: undefined }, { ...mountConfig, pets: undefined }, { ...mountConfig, houses: undefined },
  { ...mountConfig, deployNewPets: true }, { ...mountConfig, expandPets: true }, { ...mountConfig, openHouseAuctions: true },
  { receiver, pets, houses, mounts }, ...[wallet, authority, receiver, pets, houses, petsV2].map(mounts => ({ ...mountConfig, mounts }))]) await assert.rejects(prepare(value));
for (const mutation of [{ creationFailed: true }, { simRuntime: '0x' }, { gas: '0x0' }, { reorg: true }]) {
  change = mutation; await assert.rejects(prepare(mountConfig));
}
for (const mutation of [{ badCode: mounts }, ...[
  { owner: [outsider] }, { authority: [outsider] }, { paymentToken: [outsider] }, { feeReceiver: [outsider] },
  { name: ['Wrong mounts'] }, { royaltyInfo: [receiver, 499n] }, { contractURI: ['https://wrong/'] }, { maxAssetId: [2n] },
].map(badMount => ({ badMount }))]) {
  change = mutation; await assert.rejects(prepare({ ...mountConfig, mounts }));
}
change = {};
}
for (const forbidden of ['--broadcast', '--private-key']) {
  const result = spawnSync(process.execPath, ['scripts/nft-setup.mjs', forbidden], { encoding: 'utf8', cwd: new URL('..', import.meta.url) });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Unknown option/);
}
assert(calls.every(method => ['eth_chainId', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call', 'eth_estimateGas'].includes(method)), 'only read-only RPC methods used');
console.log('NFT setup verified: staged exact constructors, legacy/current collection compatibility, new-pets-only deployment with preserved addresses, strict new runtime, public addresses only, fixed chain/owner/authority/royalty routing, fresh $100 reserve, unopened four-hour lots, read-only simulation, and no broadcast option.');
