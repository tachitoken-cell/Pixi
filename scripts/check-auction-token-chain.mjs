import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import solc from 'solc';
import { createEVM } from '@ethereumjs/evm';
import { createCustomCommon, Mainnet, Hardfork } from '@ethereumjs/common';
import { Account, bytesToHex, createAddressFromString, hexToBytes } from '@ethereumjs/util';
import { AbiCoder, Interface, Wallet, TypedDataEncoder, ZeroAddress, ZeroHash, getCreateAddress, id, keccak256, toBeHex } from 'ethers';
import { compileAuctionContract } from './build-auction-contract.mjs';
import { MOSS_TOKEN, MOSS_AUCTION_DEV_TEAM } from '../src/auction.ts';
import { createAuctionChain, isProductionMossAuctionContract, tokenAuctionInterface as abi, erc20Interface, MOSS_AUCTION_ORDER_TYPES as AUCTION_ORDER_TYPES, auctionOrderTypes, legacyTokenAuctionInterface, MOSS_TOKEN_RUNTIME_HASH } from '../src/auction-chain.mjs';

// Execute the shipped settlement locally against controllable ERC20 behavior. No broadcasts or funded keys.
const artifact = compileAuctionContract('MossvaleTokenAuction');
assert.deepEqual(artifact, JSON.parse(readFileSync(new URL('../public/contracts/MossvaleTokenAuction.json', import.meta.url), 'utf8')));
const mockSource = `pragma solidity 0.8.36;
contract MockMoss {
  mapping(address => uint256) public balanceOf;
  mapping(address => mapping(address => uint256)) public allowance;
  uint256 public totalSupply;
  uint256 public mode;
  uint256 public outboundMode;
  uint256 public burnMode;
  address public failedRecipient;
  address public attack;
  bool public attackBurn;
  function mint(address to, uint256 amount) external { balanceOf[to] += amount; totalSupply += amount; }
  function setMode(uint256 value) external { mode = value; }
  function setOutboundMode(uint256 value) external { outboundMode = value; }
  function setBurnMode(uint256 value) external { burnMode = value; }
  function setFailedRecipient(address target) external { failedRecipient = target; }
  function setAttack(address target, bool onBurn) external { attack = target; attackBurn = onBurn; }
  function burn(uint256 amount) external {
    require(burnMode != 3, "Burn failed");
    if (burnMode != 1) balanceOf[msg.sender] -= amount;
    if (burnMode != 2) totalSupply -= amount + (burnMode == 4 ? 1 : 0);
    if (attackBurn) reenter(address(0));
  }
  function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; return true; }
  function transferFrom(address from, address to, uint256 amount) external returns (bool) {
    require(allowance[from][msg.sender] >= amount, "No allowance");
    allowance[from][msg.sender] -= amount;
    return move(from, to, amount, mode);
  }
  function transfer(address to, uint256 amount) external returns (bool) { return to != failedRecipient && move(msg.sender, to, amount, outboundMode); }
  function move(address from, address to, uint256 amount, uint256 behavior) internal returns (bool) {
    if (behavior == 3) return false;
    balanceOf[from] -= amount + (behavior == 2 ? 1 : 0);
    balanceOf[to] += amount - (behavior == 1 ? 1 : 0);
    if (!attackBurn && to != attack) reenter(to);
    return true;
  }
  function reenter(address to) internal {
    if (attack != address(0)) {
      address target = attack; attack = address(0);
      (bool ok, bytes memory reason) = target.call(abi.encodeWithSignature("withdraw(address)", to));
      require(!ok && keccak256(reason) == keccak256(abi.encodeWithSignature("Error(string)", "Reentrant call")), "Reentry not blocked");
    }
  }
}`;
const compiled = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: { 'MockMoss.sol': { content: mockSource } },
  settings: { evmVersion: 'paris', outputSelection: { '*': { '*': ['abi', 'evm.deployedBytecode.object'] } } } })));
assert.equal((compiled.errors || []).filter(error => error.severity === 'error').length, 0);
const mock = compiled.contracts['MockMoss.sol'].MockMoss, tokenAbi = new Interface(mock.abi);
const authority = Wallet.createRandom(), buyer = Wallet.createRandom(), seller = Wallet.createRandom(), other = Wallet.createRandom(), treasury = Wallet.createRandom();
const account = wallet => createAddressFromString(wallet.address), tokenAddress = createAddressFromString(MOSS_TOKEN.address);
const evm = await createEVM({ common: createCustomCommon({ chainId: 4663 }, Mainnet, { hardfork: Hardfork.Paris }) });
for (const wallet of [authority, buyer, seller, other, treasury]) await evm.stateManager.putAccount(account(wallet), new Account(0n, 10n ** 20n));
await evm.stateManager.putCode(tokenAddress, hexToBytes(`0x${mock.evm.deployedBytecode.object}`));
let timestamp = 1000;
const block = () => ({ header: { number: 100n, timestamp: BigInt(timestamp), coinbase: createAddressFromString(ZeroAddress),
  difficulty: 0n, prevRandao: new Uint8Array(32), gasLimit: 30000000n, getBlobGasPrice: () => undefined } });
const deploy = (targetEvm, signer = authority.address, recipient = treasury.address) => targetEvm.runCall({ caller: account(authority),
  data: hexToBytes(artifact.bytecode + AbiCoder.defaultAbiCoder().encode(['address', 'address'], [signer, recipient]).slice(2)), gasLimit: 3000000n, block: block() });
assert.ok((await deploy(evm, ZeroAddress)).execResult.exceptionError, 'zero signing authority rejected');
assert.ok((await deploy(evm, authority.address, ZeroAddress)).execResult.exceptionError, 'zero treasury rejected');
const selfTreasury = getCreateAddress({ from: authority.address, nonce: (await evm.stateManager.getAccount(account(authority))).nonce });
assert.ok((await deploy(evm, authority.address, selfTreasury)).execResult.exceptionError, 'auction cannot be its own treasury');
const wrongChain = await createEVM({ common: createCustomCommon({ chainId: 46630 }, Mainnet, { hardfork: Hardfork.Paris }) });
await wrongChain.stateManager.putCode(tokenAddress, hexToBytes(`0x${mock.evm.deployedBytecode.object}`));
assert.ok((await deploy(wrongChain)).execResult.exceptionError, 'constructor rejects testnet');
const noToken = await createEVM({ common: createCustomCommon({ chainId: 4663 }, Mainnet, { hardfork: Hardfork.Paris }) });
assert.ok((await deploy(noToken)).execResult.exceptionError, 'constructor requires deployed MOSS code');
const deployed = await deploy(evm);
assert.equal(deployed.execResult.exceptionError, undefined, 'contract deploys on mainnet with token code present');
const contract = deployed.createdAddress, contractAddress = contract.toString();
assert.equal(bytesToHex(await evm.stateManager.getCode(contract)), artifact.deployedBytecode);
async function call(wallet, name, args = [], value = 0n, isStatic = false) {
  return evm.runCall({ caller: account(wallet), to: contract, data: hexToBytes(abi.encodeFunctionData(name, args)), value, gasLimit: 1000000n, block: block(), isStatic });
}
async function read(name, args) { const result = await call(other, name, args, 0n, true); assert.equal(result.execResult.exceptionError, undefined); return abi.decodeFunctionResult(name, bytesToHex(result.execResult.returnValue))[0]; }
async function tokenCall(wallet, name, args, isStatic = false) {
  const result = await evm.runCall({ caller: account(wallet), to: tokenAddress, data: hexToBytes(tokenAbi.encodeFunctionData(name, args)), gasLimit: 1000000n, block: block(), isStatic });
  assert.equal(result.execResult.exceptionError, undefined, `token ${name} succeeds`);
  const decoded = tokenAbi.decodeFunctionResult(name, bytesToHex(result.execResult.returnValue));
  return decoded.length ? decoded[0] : undefined;
}
assert.equal(await read('paymentToken'), MOSS_TOKEN.address);
assert.equal(await read('treasury'), treasury.address);
assert.equal(await read('devTeam'), MOSS_AUCTION_DEV_TEAM);
assert.equal(await read('TAX_BPS'), 500n);
const domain = { name: 'MossvaleTokenAuction', version: '1', chainId: 4663, verifyingContract: contractAddress };
const order = { listingId: id('moss-offline-listing'), buyer: buyer.address, seller: seller.address, priceWei: '1000000000000000000', deadline: 1300,
  chainId: 4663, contract: contractAddress, currency: 'moss', token: MOSS_TOKEN.address, referrer: ZeroAddress, referralBps: 0 };
const amount = BigInt(order.priceWei), tax = amount / 20n, net = amount - tax, initialBalance = amount * 10n;
const share = tax / 4n, burned = tax - 2n * share;
const signature = await authority.signTypedData(domain, AUCTION_ORDER_TYPES, order);
await tokenCall(other, 'mint', [buyer.address, initialBalance]);
const rejected = async (wallet = buyer, change = {}, sig = signature, value = 0n) => {
  const before = await tokenCall(other, 'balanceOf', [buyer.address], true);
  assert.ok((await call(wallet, 'buy', [{ ...order, ...change }, sig], value)).execResult.exceptionError, 'invalid payment rejected');
  assert.equal(await read('paidOrders', [order.listingId]), ZeroHash);
  assert.equal(await read('proceeds', [seller.address]), 0n);
  assert.equal(await tokenCall(other, 'balanceOf', [buyer.address], true), before, 'rejected transfer preserves buyer funds');
  assert.equal(await tokenCall(other, 'balanceOf', [contractAddress], true), 0n, 'rejected tax transfer preserves escrow');
  assert.equal(await tokenCall(other, 'balanceOf', [treasury.address], true), 0n, 'rejected tax transfer preserves treasury');
  assert.equal(await tokenCall(other, 'balanceOf', [MOSS_AUCTION_DEV_TEAM], true), 0n, 'rejected tax transfer preserves dev wallet');
  assert.equal(await tokenCall(other, 'totalSupply', [], true), initialBalance, 'rejected burn or recipient transfer restores total supply');
};
await rejected(); // No allowance.
await tokenCall(buyer, 'approve', [contractAddress, amount - 1n]); await rejected();
await tokenCall(buyer, 'approve', [contractAddress, amount]);
await rejected(other);
await rejected(buyer, {}, signature, amount); // Native ETH is never accepted.
await rejected(buyer, { priceWei: (amount - 1n).toString() });
await rejected(buyer, { seller: other.address });
await rejected(buyer, {}, await other.signTypedData(domain, AUCTION_ORDER_TYPES, order));
await rejected(buyer, {}, await authority.signTypedData({ ...domain, name: 'MossvaleAuction' }, AUCTION_ORDER_TYPES, order));
await rejected(buyer, {}, await authority.signTypedData({ ...domain, chainId: 46630 }, AUCTION_ORDER_TYPES, order));
await rejected(buyer, {}, '0x1234');
for (const terms of [{ referrer: buyer.address, referralBps: 500 }, { referrer: seller.address, referralBps: 500 }, { referrer: contractAddress, referralBps: 500 }, { referrer: ZeroAddress, referralBps: 500 }, { referrer: other.address, referralBps: 0 }, { referrer: other.address, referralBps: 1 }])
  await rejected(buyer, terms, await authority.signTypedData(domain, AUCTION_ORDER_TYPES, { ...order, ...terms }));
timestamp = 1301; await rejected(); timestamp = 1000;
for (const mode of [1, 2, 3]) {
  await tokenCall(other, 'setMode', [mode]); await rejected();
  assert.equal(await tokenCall(other, 'allowance', [buyer.address, contractAddress], true), amount, 'failed transfer rolls allowance back');
}
await tokenCall(other, 'setMode', [0]);
for (const mode of [1, 2, 3, 4]) {
  await tokenCall(other, 'setBurnMode', [mode]); await rejected();
  assert.equal(await tokenCall(other, 'allowance', [buyer.address, contractAddress], true), amount, 'failed or dishonest burn rolls buyer approval back');
}
await tokenCall(other, 'setBurnMode', [0]);
for (const mode of [1, 2, 3]) {
  await tokenCall(other, 'setOutboundMode', [mode]); await rejected();
  assert.equal(await tokenCall(other, 'allowance', [buyer.address, contractAddress], true), amount, 'failed treasury payment rolls buyer approval back');
}
await tokenCall(other, 'setOutboundMode', [0]);
for (const recipient of [treasury.address, MOSS_AUCTION_DEV_TEAM]) {
  await tokenCall(other, 'setFailedRecipient', [recipient]); await rejected();
  assert.equal(await tokenCall(other, 'allowance', [buyer.address, contractAddress], true), amount, 'either recipient failure restores approval, supply and both payouts');
}
await tokenCall(other, 'setFailedRecipient', [ZeroAddress]);
await tokenCall(other, 'setAttack', [contractAddress, true]);
const purchase = await call(buyer, 'buy', [order, signature]);
assert.equal(purchase.execResult.exceptionError, undefined, 'exact MOSS payment succeeds and burn callback reentry is rejected');
const digest = TypedDataEncoder.hash(domain, AUCTION_ORDER_TYPES, order);
assert.equal(await read('paidOrders', [order.listingId]), digest);
assert.equal(await read('proceeds', [seller.address]), net);
assert.equal(await tokenCall(other, 'balanceOf', [buyer.address], true), initialBalance - amount);
assert.equal(await tokenCall(other, 'balanceOf', [contractAddress], true), net);
assert.equal(await tokenCall(other, 'balanceOf', [treasury.address], true), share, '10% of tax immediately reaches treasury');
assert.equal(await tokenCall(other, 'balanceOf', [MOSS_AUCTION_DEV_TEAM], true), share, '10% of tax immediately reaches dev wallet');
assert.equal(await tokenCall(other, 'totalSupply', [], true), initialBalance - burned, '80% of tax actually reduces token supply');
const taxEvent = purchase.execResult.logs.map(([, topics, data]) => abi.parseLog({ topics: topics.map(bytesToHex), data: bytesToHex(data) })).find(event => event.name === 'TaxPaid');
assert.equal(taxEvent.args.listingId, order.listingId); assert.equal(taxEvent.args.treasury, treasury.address); assert.equal(taxEvent.args.devTeam, MOSS_AUCTION_DEV_TEAM);
assert.equal(taxEvent.args.burned, burned); assert.equal(taxEvent.args.treasuryAmount, share); assert.equal(taxEvent.args.devAmount, share);
assert.equal(await tokenCall(other, 'allowance', [buyer.address, contractAddress], true), 0n, 'exact approval fully consumed');
assert.ok((await call(buyer, 'buy', [order, signature])).execResult.exceptionError, 'replay rejected');
assert.ok((await call(other, 'withdraw', [other.address])).execResult.exceptionError, 'unrelated wallet cannot withdraw');
assert.ok((await call(seller, 'withdraw', [ZeroAddress])).execResult.exceptionError);
for (const mode of [1, 2, 3]) {
  await tokenCall(other, 'setOutboundMode', [mode]);
  assert.ok((await call(seller, 'withdraw', [other.address])).execResult.exceptionError, 'non-exact/failed withdrawal rejected');
  assert.equal(await read('proceeds', [seller.address]), net, 'failed withdrawal preserves net seller proceeds');
  assert.equal(await tokenCall(other, 'balanceOf', [contractAddress], true), net);
  assert.equal(await tokenCall(other, 'balanceOf', [treasury.address], true), share);
  assert.equal(await tokenCall(other, 'balanceOf', [other.address], true), 0n);
}
await tokenCall(other, 'setOutboundMode', [0]);
await tokenCall(other, 'setAttack', [contractAddress, false]);
assert.equal((await call(seller, 'withdraw', [other.address])).execResult.exceptionError, undefined);
assert.equal(await tokenCall(other, 'balanceOf', [other.address], true), net);
assert.equal(await read('proceeds', [seller.address]), 0n);
assert.ok((await call(seller, 'withdraw', [other.address])).execResult.exceptionError, 'withdrawal cannot replay');
let dustNet = 0n, dustShare = 0n, dustBurned = 0n;
await tokenCall(other, 'setAttack', [contractAddress, false]);
for (const price of [1n, 19n, 20n, 21n, 39n, 40n, 199n, 200n, 219n, 220n]) {
  const dust = { ...order, listingId: id(`dust-${price}`), priceWei: price.toString() };
  await tokenCall(buyer, 'approve', [contractAddress, price]);
  const signed = await authority.signTypedData(domain, AUCTION_ORDER_TYPES, dust);
  assert.equal((await call(buyer, 'buy', [dust, signed])).execResult.exceptionError, undefined, 'dust purchases round tax down');
  const fee = price / 20n, part = fee / 4n;
  dustShare += part; dustBurned += fee - 2n * part; dustNet += price - fee;
  assert.equal(await read('proceeds', [seller.address]), dustNet);
  assert.equal(await tokenCall(other, 'balanceOf', [contractAddress], true), dustNet);
  assert.equal(await tokenCall(other, 'balanceOf', [treasury.address], true), share + dustShare);
  assert.equal(await tokenCall(other, 'balanceOf', [MOSS_AUCTION_DEV_TEAM], true), share + dustShare);
  assert.equal(await tokenCall(other, 'totalSupply', [], true), initialBalance - burned - dustBurned, 'tax remainders burn instead of being left in escrow');
}
assert.equal((await call(seller, 'withdraw', [other.address])).execResult.exceptionError, undefined);
assert.equal(await tokenCall(other, 'balanceOf', [other.address], true), net + dustNet);
assert.equal(await tokenCall(other, 'balanceOf', [contractAddress], true), 0n, 'withdrawals leave no stranded tax');

// Referral rewards are an exact diversion from the burn portion, using the same protected withdrawal.
for (const [referralBps,price] of [10,25,50,75,100].map(rate=>[rate,amount]).concat([[75,13333n],[75,2n**255n]])) {
  if(price>amount) await tokenCall(other,'mint',[buyer.address,price]);
  const referred = {...order,listingId:id(`referral-${referralBps}-${price}`),priceWei:price.toString(),referrer:other.address,referralBps};
  const reward = price * BigInt(referralBps) / 10000n, fee=price/20n, recipientShare=fee/4n, expectedBurn=fee-2n*recipientShare, sellerNet=price-fee;
  const before = { supply:await tokenCall(other,'totalSupply',[],true), treasury:await tokenCall(other,'balanceOf',[treasury.address],true), dev:await tokenCall(other,'balanceOf',[MOSS_AUCTION_DEV_TEAM],true), referrer:await tokenCall(other,'balanceOf',[other.address],true) };
  await tokenCall(buyer,'approve',[contractAddress,price]);
  const signed = await authority.signTypedData(domain,AUCTION_ORDER_TYPES,referred);
  for (const change of [{referrer:treasury.address},{referralBps:referralBps===50?100:50}])
    assert.ok((await call(buyer,'buy',[{...referred,...change},signed])).execResult.exceptionError,'referrer and rate are signed');
  const result = await call(buyer,'buy',[referred,signed]);
  assert.equal(result.execResult.exceptionError,undefined);
  assert.equal(await read('proceeds',[seller.address]),sellerNet,'seller always receives 95%');
  assert.equal(await read('proceeds',[other.address]),reward);
  assert.equal(await tokenCall(other,'balanceOf',[contractAddress],true),sellerNet+reward,'escrow exactly covers seller and referral liabilities');
  assert.equal(await tokenCall(other,'totalSupply',[],true),before.supply-expectedBurn+reward);
  assert.equal(await tokenCall(other,'balanceOf',[treasury.address],true),before.treasury+recipientShare);
  assert.equal(await tokenCall(other,'balanceOf',[MOSS_AUCTION_DEV_TEAM],true),before.dev+recipientShare);
  const rewardEvent=result.execResult.logs.map(([,topics,data])=>abi.parseLog({topics:topics.map(bytesToHex),data:bytesToHex(data)})).find(event=>event.name==='ReferralPaid');
  assert.equal(rewardEvent.args.referrer,other.address);assert.equal(rewardEvent.args.amount,reward);assert.equal(rewardEvent.args.referralBps,BigInt(referralBps));
  assert.ok((await call(buyer,'buy',[referred,signed])).execResult.exceptionError,'reward cannot replay');
  await tokenCall(other,'setOutboundMode',[1]);
  assert.ok((await call(other,'withdraw',[other.address])).execResult.exceptionError);
  assert.equal(await read('proceeds',[other.address]),reward,'failed withdrawal retains referral proceeds');
  await tokenCall(other,'setOutboundMode',[0]);
  assert.equal((await call(other,'withdraw',[other.address])).execResult.exceptionError,undefined);
  assert.equal(await tokenCall(other,'balanceOf',[other.address],true),before.referrer+reward);
  assert.equal((await call(seller,'withdraw',[seller.address])).execResult.exceptionError,undefined);
  assert.equal(await tokenCall(other,'balanceOf',[contractAddress],true),0n,'all referral and seller proceeds are withdrawable');
  assert.ok((await call(other,'withdraw',[other.address])).execResult.exceptionError,'referral withdrawal cannot replay');
}

// Execute the actual pinned MOSS runtime as well as the adversarial mock, entirely inside a fresh EVM.
const realTokenCode = readFileSync(new URL('./fixtures/moss-token-runtime.hex', import.meta.url), 'utf8').trim();
assert.equal(keccak256(realTokenCode), MOSS_TOKEN_RUNTIME_HASH);
const actualEvm = await createEVM({ common: createCustomCommon({ chainId: 4663 }, Mainnet, { hardfork: Hardfork.Cancun }) });
for (const wallet of [authority, buyer, seller, other, treasury]) await actualEvm.stateManager.putAccount(account(wallet), new Account(0n, 10n ** 20n));
await actualEvm.stateManager.putCode(tokenAddress, hexToBytes(realTokenCode));
const coder = AbiCoder.defaultAbiCoder();
await actualEvm.stateManager.putStorage(tokenAddress, hexToBytes(keccak256(coder.encode(['address', 'uint256'], [buyer.address, 0]))), hexToBytes(toBeHex(initialBalance, 32)));
await actualEvm.stateManager.putStorage(tokenAddress, hexToBytes(toBeHex(2, 32)), hexToBytes(toBeHex(initialBalance, 32)));
const actualDeployment = await deploy(actualEvm);
assert.equal(actualDeployment.execResult.exceptionError, undefined);
const actualContract = actualDeployment.createdAddress;
const actualCall = (target, iface, method, args = [], wallet = buyer) => actualEvm.runCall({ caller: account(wallet), to: target,
  data: hexToBytes(iface.encodeFunctionData(method, args)), gasLimit: 1000000n, block: block() });
const actualRead = async (target, iface, method, args = []) => {
  const result = await actualCall(target, iface, method, args); assert.equal(result.execResult.exceptionError, undefined);
  return iface.decodeFunctionResult(method, bytesToHex(result.execResult.returnValue))[0];
};
const actualOrder = { ...order, contract: actualContract.toString() };
const actualSignature = await authority.signTypedData({ ...domain, verifyingContract: actualOrder.contract }, AUCTION_ORDER_TYPES, actualOrder);
assert.equal((await actualCall(tokenAddress, tokenAbi, 'approve', [actualOrder.contract, amount])).execResult.exceptionError, undefined);
assert.equal((await actualCall(actualContract, abi, 'buy', [actualOrder, actualSignature])).execResult.exceptionError, undefined, 'actual pinned MOSS supports auction escrow burn and split transfers');
assert.equal(await actualRead(tokenAddress, tokenAbi, 'totalSupply'), initialBalance - burned, 'actual MOSS supply falls by exactly 80% of the tax');
for (const [recipient, expected] of [[buyer.address, initialBalance - amount], [actualOrder.contract, net], [treasury.address, share], [MOSS_AUCTION_DEV_TEAM, share]])
  assert.equal(await actualRead(tokenAddress, tokenAbi, 'balanceOf', [recipient]), expected, 'actual MOSS pays exact buyer, seller escrow, treasury and fixed dev amounts');
assert.equal(await actualRead(tokenAddress, tokenAbi, 'allowance', [buyer.address, actualOrder.contract]), 0n);
assert.equal(await actualRead(actualContract, abi, 'proceeds', [seller.address]), net);
assert.ok((await actualCall(actualContract, abi, 'buy', [actualOrder, actualSignature])).execResult.exceptionError);
assert.equal(await actualRead(tokenAddress, tokenAbi, 'totalSupply'), initialBalance - burned, 'replay burns no additional supply');
assert.equal((await actualCall(actualContract, abi, 'withdraw', [seller.address], seller)).execResult.exceptionError, undefined);
assert.equal(await actualRead(tokenAddress, tokenAbi, 'balanceOf', [seller.address]), net);
assert.equal(await actualRead(tokenAddress, tokenAbi, 'balanceOf', [actualOrder.contract]), 0n);
assert.equal(await actualRead(tokenAddress, tokenAbi, 'totalSupply'), initialBalance - burned, 'seller withdrawal does not burn or charge twice');

const transactionHash = id('moss-offline-transaction'), blockHash = id('moss-offline-finalized-block');
let chain = '0x1237', finalizedTime = 1000, code = artifact.deployedBytecode, tokenCode = realTokenCode;
let finalizedPaid = ZeroHash, canonicalHash = blockHash, token = MOSS_TOKEN.address, decimals = 18, symbol = 'MOSS', name = 'Mossvale', signerAddress = authority.address, treasuryAddress = treasury.address, taxBps = 500n, devTeamAddress = MOSS_AUCTION_DEV_TEAM;
let latestHash = id('moss-offline-latest-block'), latestPaid = ZeroHash, latestTime;
let mossBalance = 0n, balanceReads = 0;
const receipt = { status: '0x1', from: buyer.address, to: contractAddress, transactionHash, blockNumber: '0x64', blockHash,
  logs: purchase.execResult.logs.map(([address, topics, data]) => ({ address: bytesToHex(address), topics: topics.map(bytesToHex), data: bytesToHex(data) })) };
const rpc = async (method, params) => {
  if (method === 'eth_chainId') return chain;
  if (method === 'eth_getBlockByNumber') return ['latest', '0x65'].includes(params[0])
    ? { hash: latestHash, number: '0x65', timestamp: `0x${(latestTime ?? finalizedTime).toString(16)}` }
    : { hash: params[0] === '0x64' ? canonicalHash : blockHash, number: '0x64', timestamp: `0x${finalizedTime.toString(16)}` };
  if (method === 'eth_getTransactionReceipt') return receipt;
  const latestRead = params[1]?.blockHash === latestHash;
  assert.deepEqual(params[1], { blockHash: latestRead ? latestHash : blockHash, requireCanonical: true }, 'all code/storage/token reads pinned to a canonical block hash');
  if (method === 'eth_getCode') return params[0].toLowerCase() === MOSS_TOKEN.address.toLowerCase() ? tokenCode : code;
  if (method === 'eth_call') {
    if (params[0].to.toLowerCase() === MOSS_TOKEN.address.toLowerCase()) {
      const parsed = erc20Interface.parseTransaction({ data: params[0].data });
      if (parsed.name === 'balanceOf') {
        assert(latestRead, 'new MOSS reservations check the current canonical balance');
        assert.equal(parsed.args[0], buyer.address, 'the linked buyer must fund the reservation');
        balanceReads++;
      }
      return erc20Interface.encodeFunctionResult(parsed.name, [{ name, symbol, decimals, balanceOf: mossBalance }[parsed.name]]);
    }
    const parsed = abi.parseTransaction({ data: params[0].data });
    if (latestRead) assert.equal(parsed.name, 'paidOrders', 'deployment identity still comes from finalized state');
    return abi.encodeFunctionResult(parsed.name, [{ paidOrders: latestRead ? latestPaid : finalizedPaid, paymentToken: token, authority: signerAddress, treasury: treasuryAddress, TAX_BPS: taxBps, devTeam: devTeamAddress }[parsed.name]]);
  }
  throw Error(`Unexpected RPC method ${method}`);
};
const settlement = createAuctionChain({ currency: 'moss', treasury: treasury.address, contract: contractAddress, authorityKey: authority.privateKey, chainId: 4663, rpc });
const status = await settlement.status();
assert.equal(status.enabled, true); assert.equal(status.symbol, 'MOSS'); assert.equal(status.token, MOSS_TOKEN.address); assert.equal(status.decimals, 18);
assert.equal(status.taxBps, 500); assert.equal(status.treasury, treasury.address);
assert.equal(status.devTeam, MOSS_AUCTION_DEV_TEAM); assert.equal(status.referralsEnabled, true); assert.equal(status.feeVersion,2);
for (const configuredTreasury of ['', ZeroAddress, other.address, contractAddress]) {
  const invalid = createAuctionChain({ currency: 'moss', treasury: configuredTreasury, contract: contractAddress, authorityKey: authority.privateKey, chainId: 4663, rpc });
  assert.equal((await invalid.status()).enabled, false, 'missing or incorrect treasury disables new payments');
  await assert.rejects(invalid.prepareOrder({ listingId: 'invalid-treasury', buyer: buyer.address, seller: seller.address, priceWei: '123' }, 1000000));
}
treasuryAddress = other.address; assert.equal((await settlement.status()).enabled, false); treasuryAddress = treasury.address;
taxBps = 501n; assert.equal((await settlement.status()).enabled, false); taxBps = 500n;
devTeamAddress = other.address; assert.equal((await settlement.status()).enabled, false); devTeamAddress = MOSS_AUCTION_DEV_TEAM;
const legacyCode = readFileSync(new URL('./fixtures/moss-auction-legacy-runtime.hex', import.meta.url), 'utf8').trim();
assert.equal(keccak256(legacyCode), '0xb8fa84e82d4be93c716a06377c19705acbae3e5de38531144f3647d403bd7ca1');
code = legacyCode;
const legacy = createAuctionChain({ currency: 'moss', treasury: '', contract: contractAddress, authorityKey: authority.privateKey, chainId: 4663, rpc });
const legacyStatus = await legacy.status();
assert.equal(legacyStatus.enabled, true); assert.equal(legacyStatus.taxBps, 0); assert.equal(legacyStatus.treasury, undefined);
assert.equal(legacyStatus.devTeam, undefined); assert.equal(legacyStatus.referralsEnabled, false);
const legacyOrder = { ...order }; delete legacyOrder.referrer; delete legacyOrder.referralBps;
const legacyDigest = TypedDataEncoder.hash(domain, auctionOrderTypes(legacyOrder), legacyOrder);
assert.equal((await legacy.settlement(legacyOrder, finalizedTime * 1000)).state, 'pending', 'legacy reservations remain verifiable during migration');
const currentLogs = receipt.logs;
receipt.logs = [{address:contractAddress,...legacyTokenAuctionInterface.encodeEventLog(legacyTokenAuctionInterface.getEvent('Purchased'),[order.listingId,legacyDigest,buyer.address,seller.address,amount])}];
finalizedPaid = legacyDigest;
assert.equal((await legacy.verifyPayment(legacyOrder, transactionHash, finalizedTime * 1000)).state, 'paid', 'old gross-price receipt remains valid');
receipt.logs = currentLogs;
await assert.rejects(legacy.prepareOrder({ listingId:'unsupported-reward', buyer:buyer.address, seller:seller.address, priceWei:'123', referrer:other.address, referralBps:500 },1000000),/updated MOSS/);
code = JSON.parse(readFileSync(new URL('../public/contracts/MossvaleTokenAuctionLegacy.json', import.meta.url), 'utf8')).deployedBytecode;
const previousStatus = await settlement.status();
assert.equal(previousStatus.enabled,true);assert.equal(previousStatus.taxBps,500);assert.equal(previousStatus.referralsEnabled,false);
assert.equal((await settlement.settlement(legacyOrder,finalizedTime*1000)).state,'paid','previous taxed deployment retains its signed orders');
await assert.rejects(settlement.settlement(order,finalizedTime*1000),/version/);
// The previous referral runtime still verifies its original rewards and frozen orders.
code = JSON.parse(readFileSync(new URL('../public/contracts/MossvaleTokenAuctionReferralLegacy.json', import.meta.url), 'utf8')).deployedBytecode;
const oldReferralStatus=await settlement.status();assert(oldReferralStatus.enabled);assert(oldReferralStatus.referralsEnabled);assert.equal(oldReferralStatus.feeVersion,undefined);
mossBalance=123n;
const oldPrepared=await settlement.prepareOrder({listingId:'old-referral-purchase',buyer:buyer.address,seller:seller.address,priceWei:'123',referrer:other.address,referralBps:500},1000000);assert.equal(oldPrepared.referralBps,500,'legacy referral deployments continue preparing their original rates');
const oldReferralOrder={...order,referrer:other.address,referralBps:500};
finalizedPaid=TypedDataEncoder.hash(domain,AUCTION_ORDER_TYPES,oldReferralOrder);
assert.equal((await settlement.settlement(oldReferralOrder,finalizedTime*1000)).state,'paid','legacy referral escrow remains settleable');
await assert.rejects(settlement.prepareOrder({listingId:'new-rate-old-runtime',buyer:buyer.address,seller:seller.address,priceWei:'123',referrer:other.address,referralBps:50},1000000),/updated MOSS/);
finalizedPaid = ZeroHash; code = artifact.deployedBytecode;
await assert.rejects(settlement.settlement(oldReferralOrder,finalizedTime*1000),/version/);
await assert.rejects(settlement.prepareOrder({listingId:'old-rate-new-runtime',buyer:buyer.address,seller:seller.address,priceWei:'123',referrer:other.address,referralBps:500},1000000),/updated MOSS/);
mossBalance=0n;balanceReads=0;
let concurrentCalls = 0, failVerification = false;
const concurrent = createAuctionChain({ currency: 'moss', treasury: treasury.address, contract: contractAddress, authorityKey: authority.privateKey, chainId: 4663,
  rpc: async (method, params) => { concurrentCalls++; if (failVerification) throw Error('RPC temporarily unavailable'); return rpc(method, params); } });
const concurrentResults = await Promise.all([concurrent.status(), ...Array.from({ length: 4 }, (_, i) => concurrent.settlement({ ...order, listingId: id(`concurrent-${i}`) }, finalizedTime * 1000))]);
assert.equal(concurrentResults[0].enabled, true); assert(concurrentResults.slice(1).every(result => result.state === 'pending'));
assert.equal(concurrentCalls, 37, 'four concurrent orders and readiness share thirteen identity reads; each order reads finalized/latest payments and rechecks both canonical blocks');
await concurrent.status(); assert.equal(concurrentCalls, 50, 'a completed verification is not cached across polls');
failVerification = true;
const failed = await Promise.allSettled([concurrent.settlement(order, finalizedTime * 1000), concurrent.settlement(order, finalizedTime * 1000)]);
assert(failed.every(result => result.status === 'rejected')); assert.equal(concurrentCalls, 51, 'concurrent verification failure is shared and keeps orders locked');
failVerification = false;
assert.equal((await concurrent.status()).enabled, true); assert.equal(concurrentCalls, 64, 'failed verification clears so the next poll can recover');
const originalFetch = globalThis.fetch, configuredRpc = process.env.MOSS_AUCTION_RPC_URL;
try {
  delete process.env.MOSS_AUCTION_RPC_URL;
  const archiveRpc = 'https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public';
  const headersRpc = 'https://rpc.mainnet.chain.robinhood.com', checkedChains = new Set();
  globalThis.fetch = async (url, options) => {
    const { method, params } = JSON.parse(options.body);
    if (method === 'eth_chainId') {
      assert([archiveRpc, headersRpc].includes(url), 'chain identity is checked only on the configured state/header providers');
      checkedChains.add(url);
    } else assert.equal(url, ['eth_getBlockByNumber', 'eth_getBlockByHash'].includes(method) ? headersRpc : archiveRpc,
      'default MOSS transport uses official canonical headers and finalized historical state on the archive provider');
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: await rpc(method, params) }));
  };
  const production = createAuctionChain({ currency: 'moss', treasury: treasury.address, contract: contractAddress, authorityKey: authority.privateKey, chainId: 4663 });
  assert.equal((await production.status()).enabled, true);
  assert.deepEqual(checkedChains, new Set([archiveRpc, headersRpc]), 'both providers must pass chain identity verification');
  canonicalHash = id('cached-finalized-reorg');
  assert.equal((await production.status()).enabled, false, 'cached immutable identity cannot bypass a fresh canonical block check');
  canonicalHash = blockHash;
  await production.settlement(order, finalizedTime * 1000); // Warm the exact paidOrders block-hash read.
  let canonicalReads = 0;
  globalThis.fetch = async (_url, options) => {
    const { method, params } = JSON.parse(options.body);
    if (method === 'eth_getBlockByNumber' && params[0] === '0x64' && ++canonicalReads === 2) canonicalHash = id('reorg-after-cached-paid-read');
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: await rpc(method, params) }));
  };
  await assert.rejects(production.settlement(order, finalizedTime * 1000), /changed during verification/, 'cached unpaid state cannot unlock escrow when its block becomes orphaned after identity verification');
  canonicalHash = blockHash;
  for (const httpStatus of [503, 429]) {
    globalThis.fetch = async () => new Response('', { status: httpStatus });
    const unavailable = await createAuctionChain({ currency: 'moss', treasury: treasury.address, contract: contractAddress, authorityKey: authority.privateKey, chainId: 4663 }).status();
    assert.equal(unavailable.enabled, false);
    assert.equal(unavailable.reason, httpStatus === 429 ? 'Chain verification is rate limited. Please wait a few seconds and refresh.'
      : `Chain verification is unavailable (RPC HTTP ${httpStatus}).`, 'shared transport exposes a safe status/cooldown reason without credentials or response bodies');
  }
} finally {
  globalThis.fetch = originalFetch;
  if (configuredRpc === undefined) delete process.env.MOSS_AUCTION_RPC_URL; else process.env.MOSS_AUCTION_RPC_URL = configuredRpc;
}
assert.equal((await createAuctionChain({ currency: 'moss', contract: '', authorityKey: '' }).status()).enabled, false);
assert.equal((await createAuctionChain({ currency: 'moss', treasury: treasury.address, contract: contractAddress, authorityKey: authority.privateKey, chainId: 46630, rpc }).status()).enabled, false, 'MOSS mainnet only');
chain = '0x1'; assert.equal((await settlement.status()).enabled, false); chain = '0x1237';
code = '0x6000'; assert.equal((await settlement.status()).enabled, false); code = artifact.deployedBytecode;
tokenCode = '0x'; assert.equal((await settlement.status()).enabled, false); tokenCode = realTokenCode;
token = other.address; assert.equal((await settlement.status()).enabled, false); token = MOSS_TOKEN.address;
decimals = 6; assert.equal((await settlement.status()).enabled, false); decimals = 18;
symbol = 'FAKE'; assert.equal((await settlement.status()).enabled, false); symbol = 'MOSS';
name = 'Fake'; assert.equal((await settlement.status()).enabled, false); name = 'Mossvale';
signerAddress = other.address;
const mismatchedAuthority = await settlement.status();
assert.equal(mismatchedAuthority.enabled, false); assert.equal(mismatchedAuthority.contract.toLowerCase(), contractAddress);
assert(mismatchedAuthority.reason.includes(authority.address) && mismatchedAuthority.reason.includes(other.address), 'authority failures identify both public addresses');
assert(!JSON.stringify(mismatchedAuthority).includes(authority.privateKey), 'readiness never exposes the signing key');
signerAddress = authority.address;
assert.equal((await settlement.settlement(order, finalizedTime * 1000)).state, 'pending');
latestPaid = digest;
const processed = await settlement.settlement(order, finalizedTime * 1000);
assert.equal(processed.state, 'paid', 'MOSS payment settles immediately before finality without a submitted transaction hash');
latestTime = finalizedTime + 1901;
assert.equal((await settlement.settlement(order, latestTime * 1000)).state, 'paid', 'fresh MOSS payment settles while finality lags over 30 minutes');
latestPaid = ZeroHash;
await assert.rejects(settlement.settlement(order, latestTime * 1000), /stale or inconsistent/, 'stale finality cannot release unpaid MOSS escrow');
latestTime = undefined; latestPaid = digest;
const saved = { ...order, paymentBlock: { hash: processed.blockHash, number: processed.blockNumber } };
receipt.blockHash = latestHash; receipt.blockNumber = '0x65';
assert.equal((await settlement.verifyPayment(saved, transactionHash, finalizedTime * 1000)).state, 'paid');
const processedLogs = receipt.logs;
receipt.logs = [{ address: contractAddress, ...abi.encodeEventLog(abi.getEvent('Purchased'), [order.listingId, digest, buyer.address, seller.address, 1n]) }];
await assert.rejects(settlement.verifyPayment(saved, transactionHash, finalizedTime * 1000), /receipt/, 'processed MOSS receipts validate the exact amount'); receipt.logs = processedLogs;
latestPaid = ZeroHash;
await assert.rejects(settlement.settlement(saved, finalizedTime * 1000), /canonical chain/, 'temporary missing MOSS state cannot revoke a canonical delivery');
latestHash = id('moss-orphaned-payment-head');
const revoked = await settlement.settlement(saved, finalizedTime * 1000);
assert.equal(revoked.state, 'pending'); assert.equal(revoked.revoked, true, 'orphaned processed MOSS payment is reverted');
latestPaid = digest;
const reanchored = await settlement.settlement(saved, finalizedTime * 1000);
assert.equal(reanchored.state, 'paid'); assert.equal(reanchored.reanchored, true); assert.equal(reanchored.blockHash, latestHash);
latestPaid = ZeroHash; receipt.blockHash = blockHash; receipt.blockNumber = '0x64';
for (const change of [{ currency: 'eth' }, { token: other.address }, { chainId: 46630 }, { contract: other.address }])
  await assert.rejects(settlement.settlement({ ...order, ...change }, finalizedTime * 1000), 'currency, token, network and deployment changes keep escrow locked');
const native = createAuctionChain({ contract: contractAddress, authorityKey: authority.privateKey, chainId: 4663, rpc });
await assert.rejects(native.settlement(order, finalizedTime * 1000), /currency/, 'ETH adapter rejects MOSS orders before chain reads');
finalizedTime = 1300; assert.equal((await settlement.settlement(order, finalizedTime * 1000)).state, 'pending');
finalizedTime = 1301; assert.equal((await settlement.settlement(order, finalizedTime * 1000)).state, 'expired');
finalizedPaid = id('other-order'); await assert.rejects(settlement.settlement(order, finalizedTime * 1000), /different order/);
finalizedPaid = digest; assert.equal((await settlement.verifyPayment(order, transactionHash, finalizedTime * 1000)).state, 'paid', 'finalized earlier payment wins after expiry');
for (const [field, wrong] of [['status', '0x0'], ['from', other.address], ['to', other.address], ['transactionHash', id('other-tx')], ['blockNumber', '0x65']]) {
  const old = receipt[field]; receipt[field] = wrong; await assert.rejects(settlement.verifyPayment(order, transactionHash, finalizedTime * 1000)); receipt[field] = old;
}
canonicalHash = id('reorg'); await assert.rejects(settlement.verifyPayment(order, transactionHash, finalizedTime * 1000)); canonicalHash = blockHash;
const logs = receipt.logs;
receipt.logs = logs.map(log => ({ ...log, removed: true })); await assert.rejects(settlement.verifyPayment(order, transactionHash, finalizedTime * 1000));
receipt.logs = [...logs, ...logs]; await assert.rejects(settlement.verifyPayment(order, transactionHash, finalizedTime * 1000));
receipt.logs = [{ address: contractAddress, ...abi.encodeEventLog(abi.getEvent('Purchased'), [order.listingId, digest, buyer.address, seller.address, 1n]) }];
await assert.rejects(settlement.verifyPayment(order, transactionHash, finalizedTime * 1000), 'wrong event payment amount rejected'); receipt.logs = logs;
{
  const direct = structuredClone(receipt), entryPoint = '0x0000000071727De22E5E9d8BAf0edAc6f37da032', userOpHash = id('auction-user-operation');
  const entryAbi = new Interface(['event BeforeExecution()', 'event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)']);
  const before = { address: entryPoint, ...entryAbi.encodeEventLog(entryAbi.getEvent('BeforeExecution'), []) };
  const end = opHash => ({ address: entryPoint, ...entryAbi.encodeEventLog(entryAbi.getEvent('UserOperationEvent'), [opHash, buyer.address, other.address, 1, true, 1000, 100]) });
  const wrap = entries => Object.assign(receipt, direct, { from: other.address, to: entryPoint, logs: entries.map((log, index) => ({ ...log,
    logIndex: `0x${index.toString(16)}`, transactionHash, blockHash: direct.blockHash, blockNumber: direct.blockNumber })) });
  let reorgAtLookup = false;
  const sponsored = createAuctionChain({ currency: 'moss', treasury: treasury.address, contract: contractAddress, authorityKey: authority.privateKey, chainId: 4663, rpc,
    sponsoredOperation: async query => {
      assert.deepEqual({ ...query, contract: query.contract.toLowerCase() }, { transactionHash, wallet: buyer.address, contract: contractAddress.toLowerCase() });
      if (reorgAtLookup) canonicalHash = id('changed-during-operation-lookup');
      return { userOpHash, entryPoint, sender: buyer.address, paymaster: other.address };
    } });
  wrap([before, ...direct.logs, end(userOpHash)]);
  await assert.rejects(settlement.verifyPayment(order, transactionHash, finalizedTime * 1000), /receipt/, 'sponsored receipts require configured durable authorization');
  assert.equal((await sponsored.verifyPayment(order, transactionHash, finalizedTime * 1000)).state, 'paid');
  wrap([before, ...direct.logs, end(id('different-operation')), end(userOpHash)]);
  await assert.rejects(sponsored.verifyPayment(order, transactionHash, finalizedTime * 1000), /receipt/, 'another operation cannot supply the auction purchase event');
  wrap([before, ...direct.logs, end(userOpHash)]); reorgAtLookup = true;
  await assert.rejects(sponsored.verifyPayment(order, transactionHash, finalizedTime * 1000), /canonical/, 'receipt canonicality is rechecked after the async authorization lookup');
  canonicalHash = blockHash; Object.assign(receipt, direct);
}
await assert.rejects(settlement.settlement({ ...order, priceWei: '2' }, finalizedTime * 1000));
finalizedTime = 1000;
assert.equal(balanceReads, 0, 'settlement and old-order recovery never require remaining buyer funds');
mossBalance = 122n;
await assert.rejects(settlement.prepareOrder({ listingId: 'moss-underfunded', buyer: buyer.address, seller: seller.address, priceWei: '123' }, 1000000), /Not enough MOSS/, 'insufficient MOSS cannot receive a signed reservation');
mossBalance = 123n;
const prepared = await settlement.prepareOrder({ listingId: 'moss-new-order', buyer: buyer.address, seller: seller.address, priceWei: '123' }, 1000000);
assert.equal(balanceReads, 2, 'exact-price MOSS balance is sufficient to reserve');
assert.equal(prepared.referralBps,0);assert.equal(prepared.referrer,ZeroAddress);
const referredPrepared=await settlement.prepareOrder({listingId:'referred-purchase',buyer:buyer.address,seller:seller.address,priceWei:'123',referrer:other.address,referralBps:50,referralUsdCents:1000},1000000);
assert.equal(referredPrepared.referralUsdCents,1000);assert.equal(referredPrepared.referralBps,50);
assert.equal(abi.parseTransaction({data:referredPrepared.transaction.data}).args.order.referrer,other.address);
for(const change of [{referrer:buyer.address,referralBps:500},{referrer:other.address,referralBps:1},{referralUsdCents:-1},{referralUsdCents:0.1}])
  await assert.rejects(settlement.prepareOrder({listingId:'invalid-referral',buyer:buyer.address,seller:seller.address,priceWei:'123',...change},1000000));

latestPaid = referredPrepared.orderHash; finalizedPaid = ZeroHash;
assert.equal((await settlement.settlement(referredPrepared, 1000000)).state, 'processed', 'referral spending waits for finality');
finalizedPaid = referredPrepared.orderHash;
assert.equal((await settlement.settlement(referredPrepared, 1000000)).state, 'paid', 'finalized referral spending settles');
latestPaid = ZeroHash; finalizedPaid = ZeroHash;

assert.equal(prepared.currency, 'moss'); assert.equal(prepared.token, MOSS_TOKEN.address);
assert.equal(prepared.transaction.value, '0x0'); assert.equal(prepared.approval.value, '0x0');
assert.equal(prepared.approval.to, MOSS_TOKEN.address); assert.equal(prepared.transaction.chainId, '0x1237');
const approve = erc20Interface.parseTransaction({ data: prepared.approval.data });
assert.equal(approve.name, 'approve'); assert.equal(approve.args[0].toLowerCase(), contractAddress.toLowerCase()); assert.equal(approve.args[1], 123n);
assert.equal(abi.parseTransaction({ data: prepared.transaction.data }).name, 'buy');
await assert.rejects(settlement.prepareOrder({ listingId: 'clock', buyer: buyer.address, seller: seller.address, priceWei: '123' }, 2000000));

// A public, exact-address activation preserves both prior order versions and escrow addresses.
const productionOriginal = '0xd4806c0a34d274c029a38d7126d8a23a1d79c4dc';
const productionTaxed = '0xd5508efea45f8e0a4594b8a763504bdf31bbf82f';
const productionReferralLegacy = '0xb13ab13df2d0ab0f740cf11d882680501150c652';
const productionCurrent = '0x930f178ca4818a2ae2e97b96f3574f22e509a520';
const productionPrevious = [productionReferralLegacy, productionTaxed, productionOriginal];
const taxedArtifact = JSON.parse(readFileSync(new URL('../public/contracts/MossvaleTokenAuctionLegacy.json', import.meta.url), 'utf8'));
const legacyReferralArtifact = JSON.parse(readFileSync(new URL('../public/contracts/MossvaleTokenAuctionReferralLegacy.json', import.meta.url), 'utf8'));
const runtimes = new Map([[productionCurrent, artifact.deployedBytecode], [productionReferralLegacy, legacyReferralArtifact.deployedBytecode], [productionTaxed, taxedArtifact.deployedBytecode], [productionOriginal, legacyCode]]);
const previousPaid = new Map(), previousLatestPaid = new Map(), unavailable = new Set();
const activationFinal = { hash: id('activation-final'), number: '0x64', timestamp: '0x3e8' };
const activationLatest = { hash: id('activation-latest'), number: '0x65', timestamp: '0x3e8' };
let previousReceipt;
const historyTargets = [];
const activationRpc = async (method, params) => {
  if (method === 'eth_chainId') return '0x1237';
  if (method === 'eth_getBlockByNumber') return ['latest', '0x65'].includes(params[0]) ? activationLatest : activationFinal;
  if (method === 'eth_getTransactionReceipt') return previousReceipt;
  if (method === 'eth_getLogs') { historyTargets.push(params[0].address.toLowerCase()); return []; }
  const target = (method === 'eth_getCode' ? params[0] : params[0].to).toLowerCase();
  const isToken = target === MOSS_TOKEN.address.toLowerCase();
  if (unavailable.has(target)) throw Error('Deployment unavailable');
  if (method === 'eth_getCode') return isToken ? realTokenCode : runtimes.get(target) || '0x';
  assert.equal(method, 'eth_call');
  const iface = isToken ? erc20Interface : abi, parsed = iface.parseTransaction(params[0]);
  if (target === productionOriginal) assert(['paidOrders', 'authority', 'paymentToken'].includes(parsed.name), 'original verification never asks for tax getters');
  return iface.encodeFunctionResult(parsed.name, [{ name: 'Mossvale', symbol: 'MOSS', decimals: 18, balanceOf: 123n, authority: authority.address,
    paymentToken: MOSS_TOKEN.address, treasury: treasury.address, TAX_BPS: 500n, devTeam: MOSS_AUCTION_DEV_TEAM,
    paidOrders: (params[1].blockHash === activationLatest.hash ? previousLatestPaid : previousPaid).get(target) || ZeroHash }[parsed.name]]);
};
const activationOptions = { currency: 'moss', authorityKey: authority.privateKey, treasury: treasury.address, chainId: 4663, rpc: activationRpc };
const activated = createAuctionChain({ ...activationOptions, contract: productionOriginal.toUpperCase().replace('0X', '0x') });
const activatedStatus = await activated.status();
assert.equal(activatedStatus.enabled, true); assert.equal(activatedStatus.contract.toLowerCase(), productionCurrent);
assert.equal(activatedStatus.taxBps, 500); assert.equal(activatedStatus.referralsEnabled, true); assert.equal(activatedStatus.feeVersion, 2, 'New purchases disclose the activated fee policy.');
for (const referralBps of [10, 25, 50, 75, 100]) {
  const quote = await activated.prepareOrder({ listingId: `active-referral-${referralBps}`, buyer: buyer.address, seller: seller.address, priceWei: '123', referrer: other.address, referralBps }, 1000000);
  assert.equal(quote.referralBps, referralBps); assert.equal(quote.contract.toLowerCase(), productionCurrent);
}
for (const referralBps of [500, 1000])
  await assert.rejects(activated.prepareOrder({ listingId: `legacy-rate-not-active-${referralBps}`, buyer: buyer.address, seller: seller.address, priceWei: '123', referrer: other.address, referralBps }, 1000000), /updated MOSS/);
assert.equal(activatedStatus.previousContract.toLowerCase(), productionReferralLegacy, 'singular compatibility alias identifies the newest verified previous contract');
assert.deepEqual(activatedStatus.previousContracts.map(value => value.toLowerCase()), productionPrevious);
for (const configured of [productionCurrent, ...productionPrevious]) {
  assert(isProductionMossAuctionContract(configured.toUpperCase().replace('0X', '0x')));
  const route = createAuctionChain({ ...activationOptions, contract: configured });
  assert.deepEqual(await route.status(), activatedStatus, 'every public configured address activates the new policy while retaining all four exact routes');
  const quote = await route.prepareOrder({ listingId: 'activated-order', buyer: buyer.address, seller: seller.address, priceWei: '123' }, 1000000);
  assert.equal(quote.contract.toLowerCase(), productionCurrent); assert.equal(quote.referralBps, 0); assert.equal(quote.referrer, ZeroAddress);
  assert.equal(abi.parseTransaction({ data: quote.transaction.data }).name, 'buy');
  assert.equal(quote.transaction.to, quote.contract);
  assert.equal(erc20Interface.decodeFunctionData('approve', quote.approval.data)[0], quote.contract, 'new approvals use only the referral deployment');
}
const explicitCurrent = createAuctionChain({ ...activationOptions, contract: productionCurrent });
for (const prior of productionPrevious) {
  const previousOrder = { ...(prior === productionReferralLegacy ? { ...order, referrer: other.address, referralBps: 500 } : legacyOrder), contract: prior };
  const previousDigest = TypedDataEncoder.hash({ ...domain, verifyingContract: prior }, auctionOrderTypes(previousOrder), previousOrder);
  previousReceipt = { ...receipt, to: prior, blockHash: activationFinal.hash, blockNumber: activationFinal.number,
    logs: [{ address: prior, ...abi.encodeEventLog(abi.getEvent('Purchased'), [previousOrder.listingId, previousDigest, buyer.address, seller.address, amount]) }] };
  assert.equal((await activated.settlement(previousOrder, 1000000)).state, 'pending');
  previousLatestPaid.set(prior, previousDigest);
  const anchored = { ...previousOrder, paymentBlock: { hash: activationLatest.hash, number: activationLatest.number } };
  assert.equal((await activated.settlement(anchored, 1000000)).state, 'paid', 'each previous processed payment retains ordinary settlement');
  previousPaid.set(prior, previousDigest);
  assert.equal((await explicitCurrent.settlement(anchored, 1000000)).state, 'paid', 'direct current configuration cannot strand another deployment order');
  assert.equal((await activated.verifyPayment(anchored, transactionHash, 1000000)).state, 'paid', 'each original receipt uses its original contract and signing domain');
  await assert.rejects(activated.verifyPayment({ ...anchored, contract: other.address }, transactionHash, 1000000));
  await assert.rejects(activated.settlement({ ...previousOrder, contract: productionCurrent }, 1000000), /original settlement version/, 'old terms cannot be moved to the referral contract');
  for (const wrongRuntime of ['0x6000', legacyCode, taxedArtifact.deployedBytecode, legacyReferralArtifact.deployedBytecode]) {
    runtimes.set(productionCurrent, wrongRuntime);
    const status = await activated.status();
    assert.equal(status.enabled, false, 'referral address never falls back to a different runtime');
    assert.deepEqual(status.previousContracts.map(value => value.toLowerCase()), productionPrevious);
    assert.deepEqual(await explicitCurrent.status(), status);
    await assert.rejects(activated.prepareOrder({ listingId: 'wrong-runtime', buyer: buyer.address, seller: seller.address, priceWei: '123' }, 1000000));
    assert.equal((await activated.verifyPayment(anchored, transactionHash, 1000000)).state, 'paid');
  }
  runtimes.set(productionCurrent, artifact.deployedBytecode); unavailable.add(productionCurrent);
  assert.deepEqual((await activated.status()).previousContracts.map(value => value.toLowerCase()), productionPrevious);
  assert.equal((await activated.settlement(anchored, 1000000)).state, 'paid', 'active deployment outage cannot strand another deployment payment');
  unavailable.delete(productionCurrent);
  const expectedRuntime = runtimes.get(prior);
  for (const wrongRuntime of ['0x6000', legacyCode, taxedArtifact.deployedBytecode, legacyReferralArtifact.deployedBytecode, artifact.deployedBytecode].filter(value => value !== expectedRuntime)) {
    runtimes.set(prior, wrongRuntime);
    const status = await activated.status(), remaining = productionPrevious.filter(value => value !== prior);
    assert.equal(status.enabled, true, 'one previous failure does not disable current trading');
    assert.deepEqual(status.previousContracts.map(value => value.toLowerCase()), remaining, 'only independently verified old escrow is exposed');
    assert.equal(status.previousContract.toLowerCase(), remaining[0]);
    await assert.rejects(activated.settlement(anchored, 1000000), /reviewed settlement/);
  }
  runtimes.set(prior, expectedRuntime);
  previousPaid.delete(prior); previousLatestPaid.delete(prior);
  activationFinal.timestamp = '0x515'; activationLatest.timestamp = '0x515';
  assert.equal((await activated.settlement(previousOrder, 1301000)).state, 'expired', 'each old unpaid order expires only at finalized time');
  activationFinal.timestamp = '0x3e8'; activationLatest.timestamp = '0x3e8';
}
// Frozen referral terms must settle on their original address after the new policy activates.
for (const [target, rates] of [[productionReferralLegacy, [0, 500, 1000]], [productionCurrent, [0, 10, 25, 50, 75, 100]]]) {
  for (const referralBps of rates) {
    const frozen = { ...order, listingId: id(`frozen-${target}-${referralBps}`), contract: target,
      referrer: referralBps ? other.address : ZeroAddress, referralBps, referralUsdCents: 100 };
    const frozenDigest = TypedDataEncoder.hash({ ...domain, verifyingContract: target }, auctionOrderTypes(frozen), frozen);
    assert.equal((await activated.settlement(frozen, 1000000)).state, 'pending');
    previousLatestPaid.set(target, frozenDigest);
    const anchored = { ...frozen, paymentBlock: { hash: activationLatest.hash, number: activationLatest.number } };
    assert.equal((await activated.settlement(anchored, 1000000)).state, 'processed', 'frozen referral spend waits for finality on its original deployment');
    previousPaid.set(target, frozenDigest);
    previousReceipt = { ...receipt, to: target, blockHash: activationFinal.hash, blockNumber: activationFinal.number,
      logs: [{ address: target, ...abi.encodeEventLog(abi.getEvent('Purchased'), [frozen.listingId, frozenDigest, buyer.address, seller.address, amount]) }] };
    assert.equal((await activated.verifyPayment(anchored, transactionHash, 1000000)).state, 'paid', `${target} retains its ${referralBps} bps frozen receipt`);
    for (const unknown of [other.address, undefined])
      await assert.rejects(activated.settlement({ ...frozen, contract: unknown }, 1000000), /original auction deployment.*escrow must stay locked/, 'unknown saved contracts cannot fall back to the active deployment');
    previousPaid.delete(target); previousLatestPaid.delete(target);
    activationFinal.timestamp = '0x515'; activationLatest.timestamp = '0x515';
    assert.equal((await activated.settlement(frozen, 1301000)).state, 'expired', 'unpaid frozen orders expire only after finalized time');
    activationFinal.timestamp = '0x3e8'; activationLatest.timestamp = '0x3e8';
  }
  const incompatibleRate = target === productionReferralLegacy ? 50 : 500;
  await assert.rejects(activated.settlement({ ...order, contract: target, referrer: other.address, referralBps: incompatibleRate }, 1000000), /original settlement version/, 'each referral deployment rejects the other fee policy');
}
const missingTreasury = createAuctionChain({ ...activationOptions, contract: productionCurrent, treasury: '' });
const missingStatus = await missingTreasury.status();
assert.equal(missingStatus.enabled, false); assert.deepEqual(missingStatus.previousContracts.map(value => value.toLowerCase()), [productionOriginal], 'untaxed recovery remains independently usable without treasury configuration');
for (const contract of [productionCurrent, ...productionPrevious])
  assert.equal((await activated.purchaseHistory(0, 1000, contract)).contract, contract);
assert.deepEqual(historyTargets, [productionCurrent, ...productionPrevious], 'stats can index all four identities, including late prior payments');
assert.equal((await activated.purchaseHistory()).fromBlock, 73835683, 'default history starts at the activated deployment creation block');
assert.equal((await activated.purchaseHistory(undefined, undefined, productionReferralLegacy)).fromBlock, 73341457, 'b13 history remains available from its original creation block');
assert.equal((await activated.purchaseHistory(undefined, undefined, productionTaxed)).fromBlock, 69839008);
assert.equal((await activated.purchaseHistory(undefined, undefined, productionOriginal)).fromBlock, 61382153);
await assert.rejects(activated.purchaseHistory(0, 1000, other.address), /configured settlement/);
for (const prior of productionPrevious) unavailable.add(prior);
assert.equal((await activated.status()).previousContract, undefined); assert.equal((await activated.status()).previousContracts, undefined);
unavailable.clear();
const customAddress = other.address;
runtimes.set(customAddress.toLowerCase(), artifact.deployedBytecode);
const custom = createAuctionChain({ ...activationOptions, contract: customAddress });
const customStatus = await custom.status();
assert.equal(customStatus.contract, customAddress); assert.equal(customStatus.previousContract, undefined, 'custom deployments never inherit production routing');
await assert.rejects(custom.purchaseHistory(0, 1000, productionOriginal), /configured settlement/);
for (const value of [customAddress, '', undefined, null]) assert.equal(isProductionMossAuctionContract(value), false);
const emptyStatus = await createAuctionChain({ ...activationOptions, contract: '' }).status();
assert.equal(emptyStatus.enabled, false); assert.equal(emptyStatus.contract, undefined); assert.equal(emptyStatus.previousContract, undefined, 'empty configuration never activates production addresses');
console.log('MOSS auction: activated 50/25/25 fee split, five volume tiers, legacy burn-share rewards, atomic rollback, canonical settlement and four-contract recovery routing passed. No transaction broadcast.');
