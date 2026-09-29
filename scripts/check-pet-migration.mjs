import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEVM } from '@ethereumjs/evm';
import { createCustomCommon, Mainnet, Hardfork } from '@ethereumjs/common';
import { Account, bytesToHex, createAddressFromString, hexToBytes } from '@ethereumjs/util';
import { Interface, Wallet, TypedDataEncoder, ZeroAddress, ZeroHash, getAddress, id, keccak256 } from 'ethers';
import { compileNftContracts } from './build-nft-contracts.mjs';

// Explicit local fixtures: the original collection is the exact deployed-contract artifact.
const fixtures = `// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;
import "MossvalePets.sol";
contract MigrationReceiver {
    address public constant paymentToken = 0x6742883Eef788E2424CE5a1b0d4303144AaEc0a5;
}
contract MigrationValidator {
    bool public allowed;
    function allow() external { allowed = true; }
    function validateTransfer(address,address,address,uint256) external view { require(allowed, "Transfer blocked"); }
}
contract MigrationWallet {
    MossvaleNFT public legacy;
    MossvalePets public pets;
    bool public rejecting;
    address public destination;
    constructor(address oldCollection, address newCollection) { legacy = MossvaleNFT(oldCollection); pets = MossvalePets(newCollection); }
    function claim(MossvaleNFT.Mint calldata order, bytes calldata signature) external { legacy.mint(order, signature); }
    function approve(uint256 tokenId) external { legacy.approve(address(pets), tokenId); }
    function migrate(uint256 tokenId) external { pets.migrate(tokenId); }
    function receiveMode(bool reject, address recipient) external { rejecting = reject; destination = recipient; }
    function onERC721Received(address,address,uint256 tokenId,bytes calldata) external returns (bytes4) {
        require(!rejecting, "Receiver rejected");
        if (msg.sender == address(pets)) {
            require(pets.assets(tokenId) == legacy.assets(tokenId), "Incomplete migrated asset");
            require(pets.assetBalance(address(this), pets.assets(tokenId)) == 1, "Incomplete migrated balance");
            (bool reentered, bytes memory error) = address(pets).call(abi.encodeCall(pets.migrate, (tokenId)));
            require(!reentered && bytes4(error) == bytes4(keccak256("ReentrancyGuardReentrantCall()")), "Migration reentered");
            if (destination != address(0)) pets.transferFrom(address(this), destination, tokenId);
        }
        return this.onERC721Received.selector;
    }
}`;
const compiled = compileNftContracts();
for (const [name, artifact] of Object.entries(compiled)) {
  assert.equal(`${JSON.stringify(artifact, null, 2)}\n`, readFileSync(new URL(`../public/contracts/${name}.json`, import.meta.url), 'utf8'), `${name}: reproducible artifact`);
}
const originalArtifact = JSON.parse(readFileSync(new URL('./fixtures/mossvale-nft-v1-artifact.json', import.meta.url), 'utf8'));
assert.equal(originalArtifact.runtimeCodeHash, '0xa1da5810984c46ad9b417b6a75ac28104036abb3dfe65d21a154a58ddbb1295f', 'fixture preserves original deployed runtime');
assert.equal(keccak256(originalArtifact.deployedBytecode), originalArtifact.runtimeCodeHash);
const originalCompiled = compileNftContracts({ 'MossvaleNFT.sol': { content: readFileSync(new URL('./fixtures/MossvaleNFT-v1.sol', import.meta.url), 'utf8') } }).MossvaleNFT;
assert.deepEqual(originalCompiled, originalArtifact, 'original fixture source reproduces its deployment artifact');
assert.notEqual(compiled.MossvaleNFT.runtimeCodeHash, originalArtifact.runtimeCodeHash, 'the current sixteen-species collection remains separate');
assert((compiled.MossvalePets.deployedBytecode.length - 2) / 2 < 24576, 'pet runtime fits EIP-170');
const contracts = compileNftContracts({ 'CheckPetMigration.sol': { content: fixtures } });
contracts.OriginalMossvaleNFT = originalArtifact;
const interfaces = Object.fromEntries(Object.entries(contracts).map(([name, value]) => [name, new Interface(value.abi)]));
const authority = Wallet.createRandom(), buyer = Wallet.createRandom(), recipient = Wallet.createRandom();
const addr = value => createAddressFromString(typeof value === 'string' ? value : value.address);
const evm = await createEVM({ common: createCustomCommon({ chainId: 4663 }, Mainnet, { hardfork: Hardfork.Cancun }) });
for (const wallet of [authority, buyer, recipient]) await evm.stateManager.putAccount(addr(wallet), new Account(0n, 10n ** 20n));
await evm.stateManager.putCode(addr('0x6742883Eef788E2424CE5a1b0d4303144AaEc0a5'), hexToBytes(readFileSync(new URL('./fixtures/moss-token-runtime.hex', import.meta.url), 'utf8').trim()));
const block = { header: { number: 100n, timestamp: 1000n, coinbase: addr(ZeroAddress), difficulty: 0n,
  prevRandao: new Uint8Array(32), gasLimit: 30000000n, getBlobGasPrice: () => undefined } };
const ok = async pending => {
  const result = await pending;
  assert.equal(result.execResult.exceptionError, undefined, bytesToHex(result.execResult.returnValue));
  return result;
};
const fails = async (pending, reason) => assert((await pending).execResult.exceptionError, reason);
const creation = (name, args) => evm.runCall({ caller: addr(authority), data: hexToBytes(contracts[name].bytecode + interfaces[name].encodeDeploy(args).slice(2)), gasLimit: 10000000n, block });
const deploy = async (name, args = []) => {
  const result = await ok(creation(name, args)), address = getAddress(result.createdAddress.toString());
  assert.equal(keccak256(await evm.stateManager.getCode(addr(address))), contracts[name].runtimeCodeHash, 'constructor storage preserves reviewed runtime');
  return address;
};
const call = (target, abi, name, args = [], wallet = buyer) => evm.runCall({ to: addr(target), caller: addr(wallet), data: hexToBytes(abi.encodeFunctionData(name, args)), gasLimit: 5000000n, block });
const read = async (target, abi, name, args = []) => abi.decodeFunctionResult(name, bytesToHex((await ok(call(target, abi, name, args))).execResult.returnValue))[0];
const feeReceiver = await deploy('MigrationReceiver'), metadata = ['https://mossvale.world/nfts/pets/', 'https://mossvale.world/nfts/pets/collection.json'];
const legacy = await deploy('OriginalMossvaleNFT', [false, authority.address, feeReceiver, ...metadata]);
const houses = await deploy('OriginalMossvaleNFT', [true, authority.address, feeReceiver, ...metadata]);
for (const args of [[houses, authority.address, feeReceiver, ...metadata], [feeReceiver, authority.address, feeReceiver, ...metadata],
  [legacy, recipient.address, feeReceiver, ...metadata], [legacy, authority.address, recipient.address, ...metadata], [legacy, authority.address, feeReceiver, '', metadata[1]]]) {
  await fails(creation('MossvalePets', args), 'incorrect legacy/runtime/authority/receiver/metadata rejected');
}
const pets = await deploy('MossvalePets', [legacy, authority.address, feeReceiver, ...metadata]);
const old = interfaces.MossvaleNFT, current = interfaces.MossvalePets;
const types = { Mint: [{ name: 'orderId', type: 'bytes32' }, { name: 'tokenId', type: 'uint256' }, { name: 'assetId', type: 'uint256' },
  { name: 'buyer', type: 'address' }, { name: 'amountWei', type: 'uint256' }, { name: 'deadline', type: 'uint64' }] };
const domain = address => ({ name: 'MossvaleNFT', version: '1', chainId: 4663, verifyingContract: address });
const order = (label, assetId = 1, wallet = buyer.address) => ({ orderId: id(label), tokenId: BigInt(id(label)), assetId, buyer: wallet, amountWei: 0n, deadline: 1300 });
const sign = (contract, order, wallet = authority) => wallet.signTypedData(domain(contract), types, order);
const mint = async (contract, item, signature, wallet = buyer) => call(contract, old, 'mint', [item, signature ?? await sign(contract, item)], wallet);
const balance = (contract, wallet, species) => read(contract, old, 'assetBalance', [wallet, species]);
const ninth = order('new-species', 9), future = order('future-species', 65536);
await fails(mint(legacy, ninth), 'original contract still rejects new species');
for (const item of [ninth, future]) {
  await ok(mint(pets, item));
  assert.equal(await balance(pets, buyer.address, item.assetId), 1n);
  assert.equal(await read(pets, current, 'tokenURI', [item.tokenId]), `${metadata[0]}${item.assetId}.json`);
}
assert.equal(await read(pets, current, 'claimedOrders', [ninth.orderId]), TypedDataEncoder.hash(domain(pets), types, ninth));
assert.deepEqual(Array.from(await read(pets, current, 'assetBalances', [buyer.address, [0, 1, 9, 65536, 999, 9]])), [0n, 0n, 1n, 1n, 0n, 1n], 'batched balances preserve input order, zeros and duplicates');
assert.deepEqual(Array.from(await read(pets, current, 'assetBalances', [buyer.address, []])), [], 'empty balance batch');
await fails(mint(pets, ninth), 'signed claim replay rejected');
const invalid = order('invalid-mint', 10);
for (const change of [{ assetId: 0 }, { orderId: ZeroHash }, { tokenId: 1 }, { amountWei: 1 }, { deadline: 999 }]) await fails(mint(pets, { ...invalid, ...change }), 'invalid signed terms rejected');
await fails(mint(pets, invalid, await sign(pets, invalid, recipient)), 'forged game authority rejected');
await fails(mint(pets, invalid, await sign(legacy, invalid)), 'legacy signature cannot mint replacement');
await fails(mint(pets, invalid, undefined, recipient), 'wrong submitting wallet rejected');
await fails(mint(pets, { ...invalid, assetId: 11 }, await sign(pets, invalid)), 'tampered species rejected');
assert.equal(await read(pets, current, 'claimedOrders', [invalid.orderId]), ZeroHash, 'failed claims remain unused');

const original = order('original-to-migrate', 8);
await ok(mint(legacy, original));
await fails(mint(pets, original), 'new mint cannot consume an existing legacy token identity');
await fails(call(pets, current, 'migrate', [original.tokenId]), 'migration requires approval');
await ok(call(legacy, old, 'setApprovalForAll', [pets, true]));
await fails(call(pets, current, 'migrate', [original.tokenId]), 'blanket approval alone cannot authorize migration');
await ok(call(legacy, old, 'approve', [pets, original.tokenId]));
await fails(call(pets, current, 'migrate', [original.tokenId], recipient), 'only actual owner can migrate');
const validator = await deploy('MigrationValidator');
await ok(call(legacy, old, 'setTransferValidator', [validator], authority));
await fails(call(pets, current, 'migrate', [original.tokenId]), 'legacy transfer validator may reject migration');
assert.equal(await read(legacy, old, 'ownerOf', [original.tokenId]), buyer.address);
assert.equal(await read(legacy, old, 'getApproved', [original.tokenId]), pets, 'failed migration keeps approval');
assert.equal(await read(pets, current, 'assets', [original.tokenId]), 0n, 'failed migration rolls back species');
assert.equal(await balance(legacy, buyer.address, 8), 1n);
assert.equal(await balance(pets, buyer.address, 8), 0n);
await ok(call(validator, interfaces.MigrationValidator, 'allow'));
await ok(call(pets, current, 'migrate', [original.tokenId]));
assert.equal(await read(legacy, old, 'ownerOf', [original.tokenId]), pets, 'legacy permanently escrowed');
assert.equal(await read(pets, current, 'ownerOf', [original.tokenId]), buyer.address);
assert.equal(await read(pets, current, 'assets', [original.tokenId]), 8n);
assert.equal(await balance(legacy, buyer.address, 8), 0n, 'original entitlement removed');
assert.equal(await balance(pets, buyer.address, 8), 1n, 'replacement entitlement granted once');
await fails(call(pets, current, 'migrate', [original.tokenId]), 'migration replay rejected');
await fails(call(legacy, old, 'transferFrom', [pets, buyer.address, original.tokenId], authority), 'even collection admin cannot retrieve escrow');
await ok(call(pets, current, 'transferFrom', [buyer.address, recipient.address, original.tokenId]));
assert.equal(await balance(pets, buyer.address, 8), 0n, 'seller loses replacement access');
assert.equal(await balance(pets, recipient.address, 8), 1n, 'recipient gains replacement access');
await fails(call(pets, current, 'setTransferValidator', [validator]), 'only collection owner sets validator');
const blocking = await deploy('MigrationValidator');
await ok(call(pets, current, 'setTransferValidator', [blocking], authority));
await fails(call(pets, current, 'transferFrom', [recipient.address, buyer.address, original.tokenId], recipient), 'replacement transfers honor validator');
assert.equal(await balance(pets, recipient.address, 8), 1n, 'validator rejection preserves rights');
await ok(call(pets, current, 'setTransferValidator', [ZeroAddress], authority));

// Delayed legacy mint colliding with an already minted replacement fails without taking the old NFT.
await ok(mint(legacy, { ...ninth, assetId: 1 }));
await ok(call(legacy, old, 'approve', [pets, ninth.tokenId]));
await fails(call(pets, current, 'migrate', [ninth.tokenId]), 'token collision cannot overwrite current NFT');
assert.equal(await read(legacy, old, 'ownerOf', [ninth.tokenId]), buyer.address);
assert.equal(await read(pets, current, 'assets', [ninth.tokenId]), 9n);

const smart = await deploy('MigrationWallet', [legacy, pets]), smartAbi = interfaces.MigrationWallet;
const smartPet = order('smart-wallet-migration', 2, smart);
await ok(call(smart, smartAbi, 'claim', [smartPet, await sign(legacy, smartPet)]));
await ok(call(smart, smartAbi, 'approve', [smartPet.tokenId]));
await ok(call(smart, smartAbi, 'receiveMode', [true, ZeroAddress]));
await fails(call(smart, smartAbi, 'migrate', [smartPet.tokenId]), 'rejecting replacement receiver rolls back the entire migration');
assert.equal(await read(legacy, old, 'ownerOf', [smartPet.tokenId]), smart);
assert.equal(await balance(legacy, smart, 2), 1n);
assert.equal(await balance(pets, smart, 2), 0n);
assert.equal(await read(pets, current, 'assets', [smartPet.tokenId]), 0n);
await ok(call(smart, smartAbi, 'receiveMode', [false, recipient.address]));
await ok(call(smart, smartAbi, 'migrate', [smartPet.tokenId]));
assert.equal(await read(legacy, old, 'ownerOf', [smartPet.tokenId]), pets);
assert.equal(await read(pets, current, 'ownerOf', [smartPet.tokenId]), recipient.address, 'callback transfer sees complete state and migration reentry is blocked');
assert.equal(await balance(pets, smart, 2), 0n);
assert.equal(await balance(pets, recipient.address, 2), 1n);
assert.deepEqual(Array.from(await read(pets, current, 'assetBalances', [buyer.address, [8, 2, 9, 65536]])), [0n, 0n, 1n, 1n], 'batched outgoing rights match transfers');
assert.deepEqual(Array.from(await read(pets, current, 'assetBalances', [recipient.address, [8, 2, 9, 65536]])), [1n, 1n, 0n, 0n], 'batched incoming rights match transfers');
const royalty = current.decodeFunctionResult('royaltyInfo', bytesToHex((await ok(call(pets, current, 'royaltyInfo', [original.tokenId, 10000]))).execResult.returnValue));
assert.deepEqual(Array.from(royalty), [feeReceiver, 500n]);
for (const interfaceId of ['0x80ac58cd', '0x5b5e139f', '0x2a55205a']) assert.equal(await read(pets, current, 'supportsInterface', [interfaceId]), true);
assert.equal(await read(pets, current, 'legacyCollection'), legacy);
assert.equal(await read(pets, current, 'houseCollection'), false);
console.log('PASS: species 9 and 65536; exact legacy runtime/config; signatures and replay; per-token owner-authorized atomic migration; token collisions, validator and receiver rollback; permanent legacy escrow; reentry, callback transfer, transferable entitlements and 5% royalties. Local EVM only; no transaction sent.');
