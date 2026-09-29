import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEVM } from '@ethereumjs/evm';
import { createCustomCommon, Mainnet, Hardfork } from '@ethereumjs/common';
import { Account, bytesToHex, createAddressFromString, hexToBytes } from '@ethereumjs/util';
import { AbiCoder, Interface, Wallet, TypedDataEncoder, ZeroAddress, ZeroHash, id, keccak256, toBeHex } from 'ethers';
import { compileNftContracts } from './build-nft-contracts.mjs';
import { MOSS_TOKEN_RUNTIME_HASH } from '../src/auction-chain.mjs';

const fixtures = `// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;
import "MossvaleNFT.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
contract InputToken is ERC20 {
    constructor() ERC20("Input", "IN") {}
    function mint(address recipient, uint256 amount) external { _mint(recipient, amount); }
    function deposit() external payable { _mint(msg.sender, msg.value); }
}
contract TestPermit2 {
    struct Permission { uint160 amount; uint48 expiration; }
    mapping(address => mapping(address => mapping(address => Permission))) public allowance;
    function approve(address token, address spender, uint160 amount, uint48 expiration) external {
        allowance[msg.sender][token][spender] = Permission(amount, expiration);
    }
    function transferFrom(address from, address to, uint160 amount, address token) external {
        Permission storage permission = allowance[from][token][msg.sender];
        require(permission.expiration >= block.timestamp && permission.amount >= amount, "No permit");
        permission.amount -= amount;
        require(IERC20(token).transferFrom(from, to, amount), "Transfer failed");
    }
}
contract TestRouter {
    address public permit2;
    address public moss;
    constructor(address permissions, address token) { permit2 = permissions; moss = token; }
    function execute(bytes calldata, bytes[] calldata inputs, uint256 deadline) external payable {
        require(deadline >= block.timestamp);
        (address input, uint160 spent, uint256 output, address recipient) = abi.decode(inputs[0], (address,uint160,uint256,address));
        TestPermit2(permit2).transferFrom(msg.sender, address(this), spent, input);
        require(IERC20(moss).transfer(recipient, output));
    }
}
contract TestValidator {
    bool public allowed;
    function setAllowed(bool value) external { allowed = value; }
    function validateTransfer(address,address,address,uint256) external view { require(allowed, "Fee required"); }
}
contract HouseBidder {
    function bid(address nft, uint256 asset, uint256 amount, uint256 payment) external {
        IERC20(MossvaleNFT(nft).paymentToken()).approve(nft, payment);
        MossvaleNFT(nft).bidHouse(asset, amount, payment);
    }
    function transferHouse(address nft, address recipient, uint256 asset) external {
        MossvaleNFT(nft).transferFrom(address(this), recipient, asset);
    }
    function onERC721Received(address,address,uint256,bytes calldata) external pure returns(bytes4) {
        revert("Receiver deliberately rejects callbacks");
    }
}
contract ReceivingPlayer {
    MossvaleNFT public collection;
    address public recipient;
    bytes private pendingMint;
    constructor(address nft, address destination) { collection = MossvaleNFT(nft); recipient = destination; }
    function claim(MossvaleNFT.Mint calldata order, bytes calldata signature) external {
        pendingMint = abi.encodeCall(collection.mint, (order, signature));
        collection.mint(order, signature);
    }
    function onERC721Received(address,address,uint256 tokenId,bytes calldata) external returns(bytes4) {
        require(msg.sender == address(collection));
        uint256 asset = collection.assets(tokenId);
        require(asset > 0 && collection.assetBalance(address(this), asset) == 1, "Incomplete NFT state");
        (bool reentered, bytes memory error) = address(collection).call(pendingMint);
        require(!reentered && bytes4(error) == bytes4(keccak256("ReentrancyGuardReentrantCall()")), "Mint reentered");
        collection.transferFrom(address(this), recipient, tokenId);
        return this.onERC721Received.selector;
    }
}`;
const contracts = compileNftContracts({ 'CheckNFT.sol': { content: fixtures } });
const artifacts = compileNftContracts();
for (const [name, artifact] of Object.entries(artifacts)) {
  assert.deepEqual(artifact, JSON.parse(readFileSync(new URL(`../public/contracts/${name}.json`, import.meta.url), 'utf8')));
  assert((artifact.deployedBytecode.length - 2) / 2 < 24576, 'deployed bytecode fits EIP-170');
}
const runtime = readFileSync(new URL('./fixtures/moss-token-runtime.hex', import.meta.url), 'utf8').trim();
assert.equal(keccak256(runtime), MOSS_TOKEN_RUNTIME_HASH);
const moss = '0x6742883Eef788E2424CE5a1b0d4303144AaEc0a5';
const authority = Wallet.createRandom(), buyer = Wallet.createRandom(), nextOwner = Wallet.createRandom(), settler = Wallet.createRandom();
const account = value => createAddressFromString(typeof value === 'string' ? value : value.address);
const evm = await createEVM({ common: createCustomCommon({ chainId: 4663 }, Mainnet, { hardfork: Hardfork.Cancun }) });
for (const wallet of [authority, buyer, nextOwner, settler]) await evm.stateManager.putAccount(account(wallet), new Account(0n, 10n ** 20n));
await evm.stateManager.putCode(account(moss), hexToBytes(runtime));
const coder = AbiCoder.defaultAbiCoder();
const initial = 1000000n * 10n ** 18n;
await evm.stateManager.putStorage(account(moss), hexToBytes(keccak256(coder.encode(['address', 'uint256'], [buyer.address, 0]))), hexToBytes(toBeHex(initial, 32)));
await evm.stateManager.putStorage(account(moss), hexToBytes(toBeHex(2, 32)), hexToBytes(toBeHex(initial, 32)));
let timestamp = 1000;
const block = () => ({ header: { number: 100n, timestamp: BigInt(timestamp), coinbase: account(ZeroAddress), difficulty: 0n,
  prevRandao: new Uint8Array(32), gasLimit: 30000000n, getBlobGasPrice: () => undefined } });
const interfaces = Object.fromEntries(Object.entries(contracts).map(([name, value]) => [name, new Interface(value.abi)]));
const deploy = async (name, args = []) => {
  const result = await evm.runCall({ caller: account(authority), data: hexToBytes(contracts[name].bytecode + interfaces[name].encodeDeploy(args).slice(2)), gasLimit: 10000000n, block: block() });
  assert.equal(result.execResult.exceptionError, undefined, `deploy ${name}: ${bytesToHex(result.execResult.returnValue)}`);
  const address = result.createdAddress.toString();
  assert.equal(keccak256(await evm.stateManager.getCode(account(address))), contracts[name].runtimeCodeHash, `${name} runtime has no deployment-dependent immutable bytes`);
  return address;
};
const tokenAbi = new Interface(['function balanceOf(address) view returns(uint256)', 'function totalSupply() view returns(uint256)',
  'function transfer(address,uint256) returns(bool)', 'function approve(address,uint256) returns(bool)', 'function allowance(address,address) view returns(uint256)']);
const call = (target, abi, name, args = [], wallet = buyer, value = 0n) => evm.runCall({ to: account(target), caller: account(wallet),
  data: hexToBytes(abi.encodeFunctionData(name, args)), value, gasLimit: 5000000n, block: block() });
const ok = async result => {
  const value = await result;
  assert.equal(value.execResult.exceptionError, undefined, bytesToHex(value.execResult.returnValue));
  return value;
};
const fails = async (result, reason) => assert((await result).execResult.exceptionError, reason);
const read = async (target, abi, name, args = []) => abi.decodeFunctionResult(name, bytesToHex((await ok(call(target, abi, name, args))).execResult.returnValue))[0];
const input = await deploy('InputToken'), permit2 = await deploy('TestPermit2'), router = await deploy('TestRouter', [permit2, moss]);
const receiver = await deploy('MossvaleBuyBurn', [authority.address, router, input, permit2]);
for (const args of [[ZeroAddress, router, input, permit2], [authority.address, buyer.address, input, permit2], [authority.address, router, moss, permit2]]) {
  await fails(evm.runCall({ caller: account(authority), data: hexToBytes(contracts.MossvaleBuyBurn.bytecode + interfaces.MossvaleBuyBurn.encodeDeploy(args).slice(2)),
    gasLimit: 10000000n, block: block() }), 'invalid receiver deployment rejected');
}
const pets = await deploy('MossvaleNFT', [false, authority.address, receiver, 'https://mossvale.world/nfts/pets/', 'https://mossvale.world/nfts/pets.json']);
const houses = await deploy('MossvaleNFT', [true, authority.address, receiver, 'https://mossvale.world/nfts/houses/', 'https://mossvale.world/nfts/houses.json']);
const nft = interfaces.MossvaleNFT, fee = interfaces.MossvaleBuyBurn;
for (const args of [[false, ZeroAddress, receiver, 'https://metadata/', 'https://collection/'],
  [false, authority.address, buyer.address, 'https://metadata/', 'https://collection/']]) {
  await fails(evm.runCall({ caller: account(authority), data: hexToBytes(contracts.MossvaleNFT.bytecode + nft.encodeDeploy(args).slice(2)),
    gasLimit: 10000000n, block: block() }), 'invalid NFT authority or royalty receiver rejected');
}
const types = { Mint: [
  { name: 'orderId', type: 'bytes32' }, { name: 'tokenId', type: 'uint256' }, { name: 'assetId', type: 'uint256' },
  { name: 'buyer', type: 'address' }, { name: 'amountWei', type: 'uint256' }, { name: 'deadline', type: 'uint64' },
] };
const domain = contract => ({ name: 'MossvaleNFT', version: '1', chainId: 4663, verifyingContract: contract });
const makePet = (label, assetId = 1) => ({ orderId: id(label), tokenId: BigInt(id(label)), assetId, buyer: buyer.address, amountWei: 0n, deadline: 1300 });
const sign = (contract, order, wallet = authority) => wallet.signTypedData(domain(contract), types, order);
const mint = async (contract, order, signature, wallet = buyer) => call(contract, nft, 'mint', [order, signature ?? await sign(contract, order)], wallet);
const pet = makePet('looted-pet');
const signature = await sign(pets, pet);
await fails(mint(pets, pet, signature, nextOwner), 'voucher restricted to looting wallet');
await fails(mint(pets, pet, await sign(pets, pet, nextOwner)), 'only game authority issues claims');
await fails(mint(pets, pet, '0x1234'), 'malformed signatures rejected');
for (const change of [{ tokenId: 1n }, { assetId: 17 }, { amountWei: 1n }, { orderId: ZeroHash }, { buyer: nextOwner.address }, { deadline: 999 }])
  await fails(mint(pets, { ...pet, ...change }), 'invalid authorized pet voucher rejected');
for (const change of [{ assetId: 2 }, { deadline: 1200 }, { orderId: id('tampered') }])
  await fails(mint(pets, { ...pet, ...change }, signature), 'signed values cannot be changed');
await fails(mint(houses, pet, signature), 'voucher cannot be used across collections');
await ok(mint(pets, pet, signature));
assert.equal(await read(pets, nft, 'ownerOf', [pet.tokenId]), buyer.address);
assert.equal(await read(pets, nft, 'assetBalance', [buyer.address, 1]), 1n);
assert.equal(await read(pets, nft, 'tokenURI', [pet.tokenId]), 'https://mossvale.world/nfts/pets/1.json');
assert.equal(await read(pets, nft, 'claimedOrders', [pet.orderId]), TypedDataEncoder.hash(domain(pets), types, pet));
await fails(mint(pets, pet), 'mint claim cannot be replayed');
assert.equal(await read(moss, tokenAbi, 'totalSupply'), initial, 'pet loot mint is free');
for(let asset=9;asset<=16;asset++){const order=makePet('new-pet-'+asset,asset);await ok(mint(pets,order));assert.equal(await read(pets,nft,'assetBalance',[buyer.address,asset]),1n);assert.equal(await read(pets,nft,'tokenURI',[order.tokenId]),`https://mossvale.world/nfts/pets/${asset}.json`);await fails(mint(pets,order),'new pet claim cannot be replayed');}

assert.deepEqual(Array.from(await read(pets,nft,'petHoldings',[buyer.address])),Array(8).fill(1n),'expanded holdings are available in one pinned read');

// ERC721 ownership is the game authority: every transfer path moves the per-species entitlement.
await fails(call(pets, nft, 'transferFrom', [buyer.address, nextOwner.address, pet.tokenId], nextOwner), 'unauthorized transfer rejected');
await ok(call(pets, nft, 'approve', [nextOwner.address, pet.tokenId]));
await ok(call(pets, nft, 'transferFrom', [buyer.address, nextOwner.address, pet.tokenId], nextOwner));
assert.equal(await read(pets, nft, 'assetBalance', [buyer.address, 1]), 0n, 'seller loses pet access');
assert.equal(await read(pets, nft, 'assetBalance', [nextOwner.address, 1]), 1n, 'buyer gains pet access');
assert.equal(await read(pets, nft, 'getApproved', [pet.tokenId]), ZeroAddress);
const second = makePet('second-pet');
await ok(mint(pets, second));
await ok(call(pets, nft, 'setApprovalForAll', [nextOwner.address, true]));
await ok(call(pets, nft, 'safeTransferFrom(address,address,uint256)', [buyer.address, nextOwner.address, second.tokenId], nextOwner));
assert.equal(await read(pets, nft, 'assetBalance', [nextOwner.address, 1]), 2n, 'multiple NFTs of one species are counted');
await ok(call(pets, nft, 'transferFrom', [nextOwner.address, buyer.address, second.tokenId], nextOwner));
assert.equal(await read(pets, nft, 'assetBalance', [nextOwner.address, 1]), 1n, 'retaining another NFT retains the species');
await fails(call(pets, nft, 'safeTransferFrom(address,address,uint256)', [buyer.address, input, second.tokenId]), 'safe transfers require receiver support');
assert.equal(await read(pets, nft, 'assetBalance', [buyer.address, 1]), 1n, 'failed safe transfer restores entitlement');

for (const [contract, name] of [[pets, 'Mossvale Pets'], [houses, 'Mossvale Houses']]) {
  assert.equal(await read(contract, nft, 'name'), name);
  assert.equal(await read(contract, nft, 'owner'), authority.address, 'collection owner is the deployer');
  assert.equal(await read(contract, nft, 'royaltyBps'), 500n);
  const result = await ok(call(contract, nft, 'royaltyInfo', [1, 10000]));
  const [recipient, amount] = nft.decodeFunctionResult('royaltyInfo', bytesToHex(result.execResult.returnValue));
  assert.equal(recipient.toLowerCase(), receiver.toLowerCase()); assert.equal(amount, 500n, 'both royalties are 5%');
  for (const interfaceId of ['0x80ac58cd', '0x5b5e139f', '0x2a55205a']) assert.equal(await read(contract, nft, 'supportsInterface', [interfaceId]), true);
}
const validator = await deploy('TestValidator');
await fails(call(pets, nft, 'setTransferValidator', [validator]), 'only collection owner can configure enforcement');
await fails(call(pets, nft, 'setTransferValidator', [buyer.address], authority), 'validator must have code');
await ok(call(pets, nft, 'setTransferValidator', [validator], authority));
await fails(call(pets, nft, 'transferFrom', [buyer.address, nextOwner.address, second.tokenId]), 'configured validator veto applies to owner transfers');
assert.equal(await read(pets, nft, 'assetBalance', [buyer.address, 1]), 1n, 'denied transfer preserves entitlement');
await ok(call(validator, interfaces.TestValidator, 'setAllowed', [true]));
await ok(call(pets, nft, 'transferFrom', [buyer.address, nextOwner.address, second.tokenId]));
await ok(call(pets, nft, 'setTransferValidator', [ZeroAddress], authority));
const smartPlayer = await deploy('ReceivingPlayer', [pets, buyer.address]);
const callbackPet = { ...makePet('smart-wallet', 2), buyer: smartPlayer };
await ok(call(smartPlayer, interfaces.ReceivingPlayer, 'claim', [callbackPet, await sign(pets, callbackPet)]));
assert.equal(await read(pets, nft, 'ownerOf', [callbackPet.tokenId]), buyer.address);
assert.equal(await read(pets, nft, 'assetBalance', [smartPlayer, 2]), 0n, 'callback transfer sees and removes complete mint entitlement');
assert.equal(await read(pets, nft, 'assetBalance', [buyer.address, 2]), 1n);

// Four independent, fully funded lots share one owner-opened four-hour window.
const unit = 10n ** 18n, reserve = 100n * unit;
const houseVoucher = { orderId: id('house-sale'), tokenId: 1, assetId: 1, buyer: buyer.address, amountWei: reserve, deadline: 20000 };
const bid = (asset, amount, payment = amount, wallet = buyer) => call(houses, nft, 'bidHouse', [asset, amount, payment], wallet);
const auction = async asset => nft.decodeFunctionResult('houseAuctions', bytesToHex((await ok(call(houses, nft, 'houseAuctions', [asset]))).execResult.returnValue));
await fails(mint(houses, houseVoucher), 'valid authority voucher cannot bypass house auctions');
await fails(bid(1, reserve), 'deployment does not open bidding');
await fails(call(houses, nft, 'settleHouse', [1]), 'unopened auction cannot settle');
await fails(call(pets, nft, 'openAuctions', [reserve], authority), 'pet collection has no house auctions');
await fails(call(pets, nft, 'bidHouse', [1, reserve, reserve]), 'pet collection rejects bids');
await fails(call(pets, nft, 'settleHouse', [1]), 'pet collection cannot mint houses through settlement');
await fails(call(houses, nft, 'openAuctions', [reserve]), 'only the owner can open auctions');
await fails(call(houses, nft, 'openAuctions', [0], authority), 'opening reserve must be positive');
await ok(call(houses, nft, 'openAuctions', [reserve], authority));
const openedAt = timestamp, endsAt = timestamp + 4 * 60 * 60;
assert.equal(await read(houses, nft, 'auctionsOpenedAt'), BigInt(openedAt));
assert.equal(await read(houses, nft, 'auctionEndsAt'), BigInt(endsAt));
assert.equal(await read(houses, nft, 'auctionReserveWei'), reserve);
await fails(call(houses, nft, 'openAuctions', [reserve * 2n], authority), 'reserve and deadline cannot be reset');
for (const asset of [0, 5]) {
  await fails(bid(asset, reserve), 'only the four configured houses accept bids');
  await fails(call(houses, nft, 'settleHouse', [asset]), 'only the four configured houses can settle');
}
await fails(bid(1, reserve - 1n), 'first bid must meet the fixed opening reserve');
await fails(bid(1, reserve), 'balance without allowance cannot become a bid');
assert.equal((await auction(1)).highestBidder, ZeroAddress, 'failed deposit rolls back bidder state');
await ok(call(moss, tokenAbi, 'approve', [houses, initial]));
await ok(call(moss, tokenAbi, 'approve', [houses, initial], nextOwner));
await fails(bid(2, reserve, reserve, nextOwner), 'allowance without funds cannot become a bid');
assert.equal(await read(moss, tokenAbi, 'balanceOf', [houses]), 0n);
await ok(call(moss, tokenAbi, 'transfer', [nextOwner.address, reserve * 10n]));
const smartBidder = await deploy('HouseBidder');
await ok(call(moss, tokenAbi, 'transfer', [smartBidder, reserve * 10n]));
const assertEscrow = async () => {
  let liability = 0n;
  for (const asset of [1, 2, 3, 4]) {
    const lot = await auction(asset);
    if (!lot.settled) liability += lot.highestBidWei;
  }
  for (const wallet of [buyer.address, nextOwner.address, smartBidder]) liability += await read(houses, nft, 'refunds', [wallet]);
  assert.equal(await read(moss, tokenAbi, 'balanceOf', [houses]), liability, 'escrow fully backs all leading bids and refunds');
};
const buyerBeforeBids = await read(moss, tokenAbi, 'balanceOf', [buyer.address]);
await ok(bid(1, reserve));
assert.equal(await read(moss, tokenAbi, 'balanceOf', [buyer.address]), buyerBeforeBids - reserve);
assert.equal(await read(houses, nft, 'houseOwner', [1]), ZeroAddress, 'leading a live auction does not grant the deed');
await fails(call(houses, nft, 'withdrawRefund'), 'leading bid cannot be withdrawn');
await fails(call(houses, nft, 'settleHouse', [1]), 'no early finalization or mint');
await fails(bid(1, reserve), 'bids must strictly increase');
await fails(bid(1, 120n * unit), 'own leader must bind only the actual top-up payment');
await ok(bid(1, 120n * unit, 20n * unit));
assert.equal(await read(moss, tokenAbi, 'balanceOf', [buyer.address]), buyerBeforeBids - 120n * unit, 'own top-up debits only the increase');
await ok(bid(2, reserve, reserve, nextOwner));
await ok(bid(1, 130n * unit, 130n * unit, nextOwner));
assert.equal(await read(houses, nft, 'refunds', [buyer.address]), 120n * unit, 'displaced bid becomes a pull refund');
const displacedBalance = await read(moss, tokenAbi, 'balanceOf', [buyer.address]);
await fails(bid(1, 140n * unit, 20n * unit), 'a top-up signed before displacement cannot silently debit a full bid');
assert.equal(await read(moss, tokenAbi, 'balanceOf', [buyer.address]), displacedBalance);
assert.equal((await auction(1)).highestBidWei, 130n * unit);
assert.equal(await read(houses, nft, 'refunds', [buyer.address]), 120n * unit, 'failed race check preserves refunds');
await assertEscrow();
await ok(call(houses, nft, 'withdrawRefund'));
assert.equal(await read(moss, tokenAbi, 'balanceOf', [buyer.address]), displacedBalance + 120n * unit);
await fails(call(houses, nft, 'withdrawRefund'), 'same refund cannot be withdrawn twice');
await fails(call(houses, nft, 'withdrawRefund', [], nextOwner), 'a leader cannot reclaim still-leading bids on either lot');
await ok(bid(2, 110n * unit));
await ok(bid(1, 140n * unit));
assert.equal(await read(houses, nft, 'refunds', [nextOwner.address]), 230n * unit, 'refunds from multiple displaced lots accumulate');
await ok(call(houses, nft, 'withdrawRefund', [], nextOwner));
await ok(call(smartBidder, interfaces.HouseBidder, 'bid', [houses, 3, reserve, reserve]));
await assertEscrow();
await fails(mint(houses, houseVoucher), 'authority cannot mint a house during the auction');
timestamp = endsAt - 1;
await ok(bid(2, 120n * unit, 120n * unit, nextOwner));
await fails(call(houses, nft, 'settleHouse', [2]), 'settlement still rejects one second before close');
timestamp = endsAt;
await fails(bid(1, 150n * unit, 150n * unit, nextOwner), 'bidding closes at the exact four-hour deadline');
await assertEscrow();
// A failing burn must preserve both escrow and the unminted lot for a later retry.
await evm.stateManager.putCode(account(moss), await evm.stateManager.getCode(account(input)));
await fails(call(houses, nft, 'settleHouse', [1], settler), 'failed real-token burn cannot settle or mint');
await evm.stateManager.putCode(account(moss), hexToBytes(runtime));
assert.equal((await auction(1)).settled, false);
assert.equal(await read(houses, nft, 'houseOwner', [1]), ZeroAddress);
await assertEscrow();
await ok(call(houses, nft, 'settleHouse', [1], settler));
assert.equal(await read(houses, nft, 'houseOwner', [1]), buyer.address, 'permissionless finalizer awards the winner, never the caller');
assert.equal(await read(houses, nft, 'assetBalance', [buyer.address, 1]), 1n);
assert.equal(await read(houses, nft, 'tokenURI', [1]), 'https://mossvale.world/nfts/houses/1.json');
assert.equal(await read(moss, tokenAbi, 'totalSupply'), initial - 140n * unit, 'the entire winning primary MOSS bid burns');
await assertEscrow();
await fails(call(houses, nft, 'settleHouse', [1], settler), 'a house can settle and mint only once');
await ok(call(houses, nft, 'settleHouse', [2], settler));
assert.equal(await read(houses, nft, 'houseOwner', [2]), nextOwner.address);
await ok(call(houses, nft, 'settleHouse', [3], settler));
assert.equal((await read(houses, nft, 'houseOwner', [3])).toLowerCase(), smartBidder.toLowerCase(), 'rejecting ERC721 callbacks cannot block the winning smart wallet');
await ok(call(smartBidder, interfaces.HouseBidder, 'transferHouse', [houses, buyer.address, 3]));
assert.equal(await read(houses, nft, 'houseOwner', [3]), buyer.address, 'smart wallet can transfer its deed');
await ok(call(houses, nft, 'settleHouse', [4], settler));
assert.equal((await auction(4)).settled, true);
assert.equal(await read(houses, nft, 'houseOwner', [4]), ZeroAddress, 'a no-bid lot remains unsold without minting');
await fails(mint(houses, houseVoucher), 'house vouchers never bypass finalized auctions');
await fails(call(houses, nft, 'openAuctions', [reserve], authority), 'finished auctions cannot be restarted');
await assertEscrow();
assert.equal(await read(houses, nft, 'refunds', [buyer.address]), 110n * unit, 'unclaimed outbid refunds survive settlement');
await ok(call(houses, nft, 'withdrawRefund'));
await assertEscrow();
assert.equal(await read(moss, tokenAbi, 'balanceOf', [houses]), 0n, 'only winning funds burned and all displaced funds returned');
assert.equal(await read(moss, tokenAbi, 'balanceOf', [receiver]), 0n, 'no extra primary 5% payment added');
const postAuctionSupply = initial - 360n * unit;
assert.equal(await read(moss, tokenAbi, 'totalSupply'), postAuctionSupply);
await ok(call(houses, nft, 'transferFrom', [buyer.address, nextOwner.address, 1]));
assert.equal(await read(houses, nft, 'houseOwner', [1]), nextOwner.address, 'house access follows the current deed owner');
assert.equal(await read(houses, nft, 'assetBalance', [buyer.address, 1]), 0n, 'deed seller loses that house');

// Execute the real pinned MOSS token burn; router/Permit2 below are isolated deterministic settlement fixtures.
await ok(call(moss, tokenAbi, 'transfer', [receiver, 50n]));
await ok(call(receiver, fee, 'burnMoss', [50], nextOwner));
assert.equal(await read(moss, tokenAbi, 'totalSupply'), postAuctionSupply - 50n, 'MOSS receipts reduce actual totalSupply');
assert.equal(await read(receiver, fee, 'totalMossBurned'), 50n);
await fails(call(receiver, fee, 'burnMoss', [1]), 'cannot burn missing fees');
await fails(call(receiver, fee, 'burnMoss', [0]), 'cannot report zero burn');
await ok(call(moss, tokenAbi, 'transfer', [router, 10000]));
await ok(call(input, interfaces.InputToken, 'mint', [receiver, 1000]));
const route = (spent = 100, output = 200, recipient = receiver) => [coder.encode(['address', 'uint160', 'uint256', 'address'], [input, spent, output, recipient])];
const buy = (changes = {}, wallet = authority) => {
  const q = { tokenIn: input, amount: 100, min: 190, deadline: timestamp + 300, commands: '0x10', inputs: route(), ...changes };
  return call(receiver, fee, 'buyAndBurn', [q.tokenIn, q.amount, q.min, q.deadline, q.commands, q.inputs], wallet);
};
await fails(buy({}, buyer), 'public callers cannot pick slippage or consume royalty funds');
for (const changes of [{ min: 0 }, { amount: 0 }, { amount: 2n ** 160n }, { deadline: timestamp - 1 }, { deadline: timestamp + 301 }, { tokenIn: moss },
  { min: 201 }, { inputs: route(99) }, { inputs: route(101) }, { inputs: route(100, 200, buyer.address) }, { commands: '0x' }])
  await fails(buy(changes), 'bad quote, wrong spend, or missing custody reverts atomically');
assert.equal(await read(input, tokenAbi, 'balanceOf', [receiver]), 1000n);
assert.equal(await read(input, tokenAbi, 'allowance', [receiver, permit2]), 0n, 'failed execution leaves no token approval');
assert.equal(await read(moss, tokenAbi, 'totalSupply'), postAuctionSupply - 50n, 'failed swap never reports a burn');
await ok(buy());
assert.equal(await read(input, tokenAbi, 'balanceOf', [receiver]), 900n);
assert.equal(await read(input, tokenAbi, 'allowance', [receiver, permit2]), 0n);
const permission = await read(permit2, interfaces.TestPermit2, 'allowance', [receiver, input, router]);
assert.equal(permission, 0n, 'Permit2 allowance reset after execution');
assert.equal(await read(moss, tokenAbi, 'balanceOf', [receiver]), 0n, 'all purchased MOSS burned');
assert.equal(await read(moss, tokenAbi, 'totalSupply'), postAuctionSupply - 250n);
assert.equal(await read(receiver, fee, 'totalMossBurned'), 250n);
await ok(evm.runCall({ caller: account(buyer), to: account(receiver), value: 100n, gasLimit: 100000n, block: block() }));
await ok(buy({ tokenIn: ZeroAddress }));
assert.equal((await evm.stateManager.getAccount(account(receiver))).balance, 0n, 'native royalties wrap and fund a buyback');
assert.equal(await read(input, tokenAbi, 'balanceOf', [receiver]), 900n, 'native swap preserves earlier ERC20 receipts');
assert.equal(await read(moss, tokenAbi, 'totalSupply'), postAuctionSupply - 450n);
assert.equal(await read(receiver, fee, 'totalMossBurned'), 450n);
console.log('NFT contracts verified: free signed pet claims, four-hour funded house auctions, exact top-ups and race guards, pull refunds, full primary burns and permissionless winner mint, transfers and callback balances, unique deeds, both 5% royalties, validator hook, real MOSS burns, bounded authorized swaps, atomic failure and allowance cleanup. Router fixtures do not prove live liquidity or OpenSea configuration.');
