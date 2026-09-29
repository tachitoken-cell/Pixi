import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEVM } from '@ethereumjs/evm';
import { createCustomCommon, Mainnet, Hardfork } from '@ethereumjs/common';
import { Account, bytesToHex, createAddressFromString, hexToBytes } from '@ethereumjs/util';
import { Interface, Wallet, TypedDataEncoder, ZeroAddress, ZeroHash, getAddress, id, keccak256 } from 'ethers';
import { compileNftContracts } from './build-nft-contracts.mjs';
import { NFT_MINT_TYPES } from '../src/nfts.ts';

// All execution uses a local EVM; these wallets and contracts are fixtures only.
const fixtures = `// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;
import "MossvaleMounts.sol";
contract MountReceiver { address public constant paymentToken = 0x6742883Eef788E2424CE5a1b0d4303144AaEc0a5; }
contract MountValidator { function validateTransfer(address,address,address,uint256) external pure { revert("Transfer blocked"); } }
contract MountWallet {
    MossvaleMounts public mounts;
    bool public rejecting;
    address public destination;
    bytes private pendingMint;
    constructor(address collection) { mounts = MossvaleMounts(collection); }
    function receiveMode(bool reject, address recipient) external { rejecting = reject; destination = recipient; }
    function claim(MossvaleMounts.Mint calldata order, bytes calldata signature) external {
        pendingMint = abi.encodeCall(mounts.mint, (order, signature)); mounts.mint(order, signature);
    }
    function onERC721Received(address,address,uint256 tokenId,bytes calldata) external returns (bytes4) {
        require(!rejecting, "Receiver rejected");
        require(msg.sender == address(mounts) && mounts.assetBalance(address(this), mounts.assets(tokenId)) == 1, "Incomplete state");
        (bool reentered, bytes memory error) = address(mounts).call(pendingMint);
        require(!reentered && bytes4(error) == bytes4(keccak256("ReentrancyGuardReentrantCall()")), "Mint reentered");
        if (destination != address(0)) mounts.transferFrom(address(this), destination, tokenId);
        return this.onERC721Received.selector;
    }
}`;
const compiled = compileNftContracts();
for (const [name, artifact] of Object.entries(compiled)) assert.deepEqual(artifact, JSON.parse(readFileSync(new URL(`../public/contracts/${name}.json`, import.meta.url), 'utf8')), `${name}: reproducible artifact`);
assert((compiled.MossvaleMounts.deployedBytecode.length - 2) / 2 < 24576);
const contracts = compileNftContracts({ 'CheckMount.sol': { content: fixtures } });
const interfaces = Object.fromEntries(Object.entries(contracts).map(([name, value]) => [name, new Interface(value.abi)]));
const authority = Wallet.createRandom(), buyer = Wallet.createRandom(), recipient = Wallet.createRandom();
const addr = value => createAddressFromString(typeof value === 'string' ? value : value.address);
const evm = await createEVM({ common: createCustomCommon({ chainId: 4663 }, Mainnet, { hardfork: Hardfork.Cancun }) });
for (const wallet of [authority, buyer, recipient]) await evm.stateManager.putAccount(addr(wallet), new Account(0n, 10n ** 20n));
await evm.stateManager.putCode(addr('0x6742883Eef788E2424CE5a1b0d4303144AaEc0a5'), hexToBytes(readFileSync(new URL('./fixtures/moss-token-runtime.hex', import.meta.url), 'utf8').trim()));
const block = { header: { number: 100n, timestamp: 1000n, coinbase: addr(ZeroAddress), difficulty: 0n, prevRandao: new Uint8Array(32), gasLimit: 30000000n, getBlobGasPrice: () => undefined } };
const ok = async pending => { const result = await pending; assert.equal(result.execResult.exceptionError, undefined, bytesToHex(result.execResult.returnValue)); return result; };
const fails = async (pending, reason) => assert((await pending).execResult.exceptionError, reason);
const creation = (name, args) => evm.runCall({ caller: addr(authority), data: hexToBytes(contracts[name].bytecode + interfaces[name].encodeDeploy(args).slice(2)), gasLimit: 10000000n, block });
const deploy = async (name, args = []) => { const result = await ok(creation(name, args)), address = getAddress(result.createdAddress.toString()); assert.equal(keccak256(await evm.stateManager.getCode(addr(address))), contracts[name].runtimeCodeHash); return address; };
const call = (target, abi, name, args = [], wallet = buyer) => evm.runCall({ to: addr(target), caller: addr(wallet), data: hexToBytes(abi.encodeFunctionData(name, args)), gasLimit: 5000000n, block });
const read = async (target, abi, name, args = []) => abi.decodeFunctionResult(name, bytesToHex((await ok(call(target, abi, name, args))).execResult.returnValue))[0];
const receiver = await deploy('MountReceiver'), metadata = ['https://mossvale.world/nfts/mounts/', 'https://mossvale.world/nfts/mounts/collection.json'];
for (const args of [[ZeroAddress, receiver, 3, ...metadata], [authority.address, buyer.address, 3, ...metadata], [authority.address, receiver, 0, ...metadata], [authority.address, receiver, 3, '', metadata[1]]]) await fails(creation('MossvaleMounts', args), 'invalid mount configuration rejected');
const mounts = await deploy('MossvaleMounts', [authority.address, receiver, 3, ...metadata]), abi = interfaces.MossvaleMounts;
const domain = { name: 'MossvaleNFT', version: '1', chainId: 4663, verifyingContract: mounts };
const order = (label, assetId = 1, wallet = buyer.address) => ({ orderId: id(label), tokenId: BigInt(id(label)), assetId, buyer: wallet, amountWei: 0n, deadline: 1300 });
const sign = (item, signer = authority, mintDomain = domain) => signer.signTypedData(mintDomain, NFT_MINT_TYPES, item);
const mint = async (item, signature, wallet = buyer) => call(mounts, abi, 'mint', [item, signature ?? await sign(item)], wallet);
for (let assetId = 1; assetId <= 3; assetId++) {
  const item = order(`mount-${assetId}`, assetId); await ok(mint(item));
  assert.equal(await read(mounts, abi, 'tokenURI', [item.tokenId]), `${metadata[0]}${assetId}.json`);
  assert.equal(await read(mounts, abi, 'claimedOrders', [item.orderId]), TypedDataEncoder.hash(domain, NFT_MINT_TYPES, item));
  await fails(mint(item), 'replay rejected');
}
const invalid = order('invalid');
for (const change of [{ assetId: 0 }, { assetId: 4 }, { orderId: ZeroHash }, { tokenId: 1 }, { amountWei: 1 }, { deadline: 999 }]) await fails(mint({ ...invalid, ...change }), 'invalid mount terms rejected');
await fails(mint(invalid, await sign(invalid, recipient)), 'forged signature rejected');
await fails(mint(invalid, await sign(invalid, authority, { ...domain, verifyingContract: receiver })), 'another collection signature rejected');
await fails(mint(invalid, undefined, recipient), 'wrong wallet rejected');
await fails(mint({ ...invalid, assetId: 2 }, await sign(invalid)), 'tampered asset rejected');
assert.equal(await read(mounts, abi, 'claimedOrders', [invalid.orderId]), ZeroHash);
await fails(call(mounts, abi, 'expandCatalog', [4]), 'only owner expands');
for (const next of [0, 2, 3]) await fails(call(mounts, abi, 'expandCatalog', [next], authority), 'catalog cannot shrink or reorder');
await ok(call(mounts, abi, 'expandCatalog', [4], authority));
const fourth = order('future-mount', 4); await ok(mint(fourth));
assert.equal(await read(mounts, abi, 'maxAssetId'), 4n);
await fails(call(mounts, abi, 'setMetadata', metadata), 'only owner changes metadata');
await fails(call(mounts, abi, 'setMetadata', ['', metadata[1]], authority), 'empty metadata rejected');
await ok(call(mounts, abi, 'setMetadata', ['https://metadata/', 'https://collection/'], authority));
assert.equal(await read(mounts, abi, 'tokenURI', [fourth.tokenId]), 'https://metadata/4.json');
const first = order('mount-1'); await ok(call(mounts, abi, 'transferFrom', [buyer.address, recipient.address, first.tokenId]));
assert.equal(await read(mounts, abi, 'assetBalance', [buyer.address, 1]), 0n);
assert.equal(await read(mounts, abi, 'assetBalance', [recipient.address, 1]), 1n);
assert.deepEqual(Array.from(await read(mounts, abi, 'assetBalances', [buyer.address, [0, 1, 2, 3, 4, 999]])), [0n, 0n, 1n, 1n, 1n, 0n]);
const validator = await deploy('MountValidator');
await fails(call(mounts, abi, 'setTransferValidator', [validator]), 'only owner sets validator');
await ok(call(mounts, abi, 'setTransferValidator', [validator], authority));
await fails(call(mounts, abi, 'transferFrom', [recipient.address, buyer.address, first.tokenId], recipient), 'validator honored');
assert.equal(await read(mounts, abi, 'assetBalance', [recipient.address, 1]), 1n);
await ok(call(mounts, abi, 'setTransferValidator', [ZeroAddress], authority));
const smart = await deploy('MountWallet', [mounts]), smartAbi = interfaces.MountWallet, smartOrder = order('smart', 2, smart);
await ok(call(smart, smartAbi, 'receiveMode', [true, ZeroAddress]));
await fails(call(smart, smartAbi, 'claim', [smartOrder, await sign(smartOrder)]), 'receiver failure rolls back claim');
assert.equal(await read(mounts, abi, 'claimedOrders', [smartOrder.orderId]), ZeroHash);
assert.equal(await read(mounts, abi, 'assetBalance', [smart, 2]), 0n);
await ok(call(smart, smartAbi, 'receiveMode', [false, recipient.address]));
await ok(call(smart, smartAbi, 'claim', [smartOrder, await sign(smartOrder)]));
assert.equal(await read(mounts, abi, 'ownerOf', [smartOrder.tokenId]), recipient.address, 'receiver sees complete state and cannot reenter mint');
assert.equal(await read(mounts, abi, 'assetBalance', [smart, 2]), 0n);
assert.equal(await read(mounts, abi, 'assetBalance', [recipient.address, 2]), 1n);
const royalty = abi.decodeFunctionResult('royaltyInfo', bytesToHex((await ok(call(mounts, abi, 'royaltyInfo', [first.tokenId, 10000]))).execResult.returnValue));
assert.deepEqual(Array.from(royalty), [receiver, 500n]);
for (const interfaceId of ['0x80ac58cd', '0x5b5e139f', '0x2a55205a']) assert.equal(await read(mounts, abi, 'supportsInterface', [interfaceId]), true);
console.log('Mount contracts: reproducible runtime, owner-only catalog expansion and metadata, authority-bound free mint, replay/reentry defenses, receiver rollback, transferable balances and 5% royalty passed. No transaction sent.');
