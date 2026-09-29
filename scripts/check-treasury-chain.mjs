import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEVM } from '@ethereumjs/evm';
import { createCustomCommon, Mainnet, Hardfork } from '@ethereumjs/common';
import { Account, bytesToHex, createAddressFromString, hexToBytes } from '@ethereumjs/util';
import { AbiCoder, Interface, Wallet, TypedDataEncoder, ZeroAddress, ZeroHash, id, keccak256, toBeHex, toQuantity, parseUnits, formatUnits, toUtf8Bytes } from 'ethers';
import { compileTreasuryContract } from './build-treasury-contract.mjs';
import { createTreasureChain, rollTreasureUsd, treasuryInterface as abi, TREASURE_CLAIM_TYPES } from '../src/treasury-chain.mjs';
import { treasureClaimValid, treasureContractClaim, treasurePlayerValid, treasureQuotes, TREASURE_MAX_CLAIMS, goldUsdAmountWei, TREASURE_REWARD_TIERS } from '../src/treasure-rewards.ts';
import { MOSS_TOKEN } from '../src/auction.ts';
import { MOSS_TOKEN_RUNTIME_HASH, erc20Interface } from '../src/auction-chain.mjs';
import { validateNativeWalletOperation } from '../src/native-wallet-operation.ts';

const artifact = compileTreasuryContract();
assert.deepEqual(artifact, JSON.parse(readFileSync(new URL('../public/contracts/MossvaleTreasureTreasury.json', import.meta.url), 'utf8')));
assert((artifact.deployedBytecode.length - 2) / 2 < 24576);
assert.equal(keccak256(toUtf8Bytes(JSON.stringify(artifact.abi))), '0x2bb20b432b10d8106f7f1749ed4bd00dca66d0ac5cc7e4463df5d412febe6fdd', 'owner-treasury ABI is unchanged');
const runtime = readFileSync(new URL('./fixtures/moss-token-runtime.hex', import.meta.url), 'utf8').trim();
assert.equal(keccak256(runtime), MOSS_TOKEN_RUNTIME_HASH);
// Pinned pre-USD owner treasury runtime from release09940; self-contained for shallow CI checkouts.
const legacyRuntime = "0x608060405234801561000f575f5ffd5b5060043610610085575f3560e01c8063bf7e214f11610058578063bf7e214f1461010a578063dce292a71461011c578063e7b0f6661461012f578063fc04f14814610138575f5ffd5b80632e1a7d4d146100895780633013ce291461009e5780636b82cdfd146100d65780638da5cb5b146100f7575b5f5ffd5b61009c610097366004610e23565b610157565b005b6100b9736742883eef788e2424ce5a1b0d4303144aaec0a581565b6040516001600160a01b0390911681526020015b60405180910390f35b6100e96100e4366004610e50565b610486565b6040519081526020016100cd565b6001546100b9906001600160a01b031681565b5f546100b9906001600160a01b031681565b61009c61012a366004610e71565b6105f5565b6100e960025481565b6100e9610146366004610e23565b60036020525f908152604090205481565b61015f610b49565b6001546001600160a01b031633146101ab5760405162461bcd60e51b815260206004820152600a60248201526927b7363c9037bbb732b960b11b60448201526064015b60405180910390fd5b5f81116101e95760405162461bcd60e51b815260206004820152600c60248201526b15dc9bdb99c8185b5bdd5b9d60a21b60448201526064016101a2565b6040516370a0823160e01b8152306004820152736742883eef788e2424ce5a1b0d4303144aaec0a5905f9082906370a0823190602401602060405180830381865afa15801561023a573d5f5f3e3d5ffd5b505050506040513d601f19601f8201168201806040525081019061025e9190610ef0565b6001546040516370a0823160e01b81526001600160a01b0391821660048201529192505f91908416906370a0823190602401602060405180830381865afa1580156102ab573d5f5f3e3d5ffd5b505050506040513d601f19601f820116820180604052508101906102cf9190610ef0565b6001549091506102ec906001600160a01b03858116911686610b64565b6102f68483610f1b565b6040516370a0823160e01b81523060048201526001600160a01b038516906370a0823190602401602060405180830381865afa158015610338573d5f5f3e3d5ffd5b505050506040513d601f19601f8201168201806040525081019061035c9190610ef0565b1480156103dc575061036e8482610f2e565b6001546040516370a0823160e01b81526001600160a01b039182166004820152908516906370a0823190602401602060405180830381865afa1580156103b6573d5f5f3e3d5ffd5b505050506040513d601f19601f820116820180604052508101906103da9190610ef0565b145b6104285760405162461bcd60e51b815260206004820152601760248201527f57726f6e67207769746864726177616c20616d6f756e7400000000000000000060448201526064016101a2565b6001546040518581526001600160a01b03909116907f7084f5476618d8e60b11ef0d7d3f06914655adb8793e28ff7f018d4c76d505d59060200160405180910390a250505061048360015f516020610f9b5f395f51905f5255565b50565b604080517f8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f60208201527ff94866b258cd535c1248fc7a6fa651fc800ee67b5aebab66ac93afdbd52ce8f5918101919091527fc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc660608201524660808201523060a08201525f90819060c0016040516020818303038152906040528051906020012090505f7f332c8ca1d3fc56d15055de437bd5eedf8fa35ebfc4c6a4e4ce09ecd35e2cf946845f013585602001358660400160208101906105679190610f41565b6040805160208101959095528401929092526060838101919091526001600160a01b03909116608083015285013560a082015260c00160408051601f1981840301815290829052805160209182012061190160f01b91830191909152602282018490526042820181905291506062016040516020818303038152906040528051906020012092505050919050565b6105fd610b49565b82351580159061061a575082355f90815260036020526040902054155b61065e5760405162461bcd60e51b815260206004820152601560248201527410db185a5b481c185a59081bdc881a5b9d985b1a59605a1b60448201526064016101a2565b60208301351580159061068957505f61067d6060850160408601610f41565b6001600160a01b031614155b80156106b557506106a06060840160408501610f41565b6001600160a01b0316336001600160a01b0316145b6106f35760405162461bcd60e51b815260206004820152600f60248201526e15dc9bdb99c81c9958da5c1a595b9d608a1b60448201526064016101a2565b670de0b6b3a764000083606001351015801561071c5750683635c9adc5dea00000836060013511155b801561073b5750610739670de0b6b3a76400006060850135610f67565b155b6107765760405162461bcd60e51b815260206004820152600c60248201526b15dc9bdb99c8185b5bdd5b9d60a21b60448201526064016101a2565b5f61078084610486565b5f54604080516020601f87018190048102820181019092528581529293506001600160a01b03909116916107d09184919087908790819084018382808284375f92019190915250610b9992505050565b6001600160a01b03161461081b5760405162461bcd60e51b8152602060048201526012602482015271556e617574686f72697a656420636c61696d60701b60448201526064016101a2565b83355f9081526003602052604081208290556002805460608701359290610843908490610f2e565b90915550506040516370a0823160e01b8152306004820152736742883eef788e2424ce5a1b0d4303144aaec0a5905f9082906370a0823190602401602060405180830381865afa158015610899573d5f5f3e3d5ffd5b505050506040513d601f19601f820116820180604052508101906108bd9190610ef0565b90505f6001600160a01b0383166370a082316108df60608a0160408b01610f41565b6040516001600160e01b031960e084901b1681526001600160a01b039091166004820152602401602060405180830381865afa158015610921573d5f5f3e3d5ffd5b505050506040513d601f19601f820116820180604052508101906109459190610ef0565b905061096f61095a6060890160408a01610f41565b6001600160a01b0385169060608a0135610b64565b61097d606088013583610f1b565b6040516370a0823160e01b81523060048201526001600160a01b038516906370a0823190602401602060405180830381865afa1580156109bf573d5f5f3e3d5ffd5b505050506040513d601f19601f820116820180604052508101906109e39190610ef0565b148015610a8057506109f9606088013582610f2e565b6001600160a01b0384166370a08231610a1860608b0160408c01610f41565b6040516001600160e01b031960e084901b1681526001600160a01b039091166004820152602401602060405180830381865afa158015610a5a573d5f5f3e3d5ffd5b505050506040513d601f19601f82011682018060405250810190610a7e9190610ef0565b145b610ac25760405162461bcd60e51b815260206004820152601360248201527215dc9bdb99c81c185e5bdd5d08185b5bdd5b9d606a1b60448201526064016101a2565b610ad26060880160408901610f41565b6001600160a01b031684885f01357fd9b5a9b8aef4f58535e0054e6238e8aea399a49b5d2042c7dd3e07fa201556d28a602001358b60600135604051610b22929190918252602082015260400190565b60405180910390a450505050610b4460015f516020610f9b5f395f51905f5255565b505050565b610b51610bc3565b60025f516020610f9b5f395f51905f5255565b610b718383836001610bf4565b610b4457604051635274afe760e01b81526001600160a01b03841660048201526024016101a2565b5f5f5f5f610ba78686610c56565b925092509250610bb78282610c9f565b50909150505b92915050565b5f516020610f9b5f395f51905f5254600203610bf257604051633ee5aeb560e01b815260040160405180910390fd5b565b60405163a9059cbb60e01b5f8181526001600160a01b038616600452602485905291602083604481808b5af1925060015f51148316610c4a578383151615610c3e573d5f823e3d81fd5b5f873b113d1516831692505b60405250949350505050565b5f5f5f8351604103610c8d576020840151604085015160608601515f1a610c7f88828585610d5b565b955095509550505050610c98565b505081515f91506002905b9250925092565b5f826003811115610cb257610cb2610f86565b03610cbb575050565b6001826003811115610ccf57610ccf610f86565b03610ced5760405163f645eedf60e01b815260040160405180910390fd5b6002826003811115610d0157610d01610f86565b03610d225760405163fce698f760e01b8152600481018290526024016101a2565b6003826003811115610d3657610d36610f86565b03610d57576040516335e2f38360e21b8152600481018290526024016101a2565b5050565b5f80807f7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0841115610d9457505f91506003905082610e19565b604080515f808252602082018084528a905260ff891692820192909252606081018790526080810186905260019060a0016020604051602081039080840390855afa158015610de5573d5f5f3e3d5ffd5b5050604051601f1901519150506001600160a01b038116610e1057505f925060019150829050610e19565b92505f91508190505b9450945094915050565b5f60208284031215610e33575f5ffd5b5035919050565b5f60808284031215610e4a575f5ffd5b50919050565b5f60808284031215610e60575f5ffd5b610e6a8383610e3a565b9392505050565b5f5f5f60a08486031215610e83575f5ffd5b610e8d8585610e3a565b9250608084013567ffffffffffffffff811115610ea8575f5ffd5b8401601f81018613610eb8575f5ffd5b803567ffffffffffffffff811115610ece575f5ffd5b866020828401011115610edf575f5ffd5b939660209190910195509293505050565b5f60208284031215610f00575f5ffd5b5051919050565b634e487b7160e01b5f52601160045260245ffd5b81810381811115610bbd57610bbd610f07565b80820180821115610bbd57610bbd610f07565b5f60208284031215610f51575f5ffd5b81356001600160a01b0381168114610e6a575f5ffd5b5f82610f8157634e487b7160e01b5f52601260045260245ffd5b500690565b634e487b7160e01b5f52602160045260245ffdfe9b779b17422d0df92223018b32b4d1fa46e071723d6817e2486d003becc55f00a26469706673582212203794b44525db7a500eb45a9b00b7d78b8ab3a7773dd6e5ad83950263beb9f2d464736f6c63430008240033";
assert.equal(keccak256(legacyRuntime), '0xf70a43fc113e5ba5308a896df6f46fe058e7cfbd323f6d058d2f506f03c8bbb9');
const legacyContract = '0x1111000000000000000000000000000000001111';
const authority = Wallet.createRandom(), buyer = Wallet.createRandom(), other = Wallet.createRandom();
const account = value => createAddressFromString(typeof value === 'string' ? value : value.address);
const evm = await createEVM({ common: createCustomCommon({ chainId: 4663 }, Mainnet, { hardfork: Hardfork.Cancun }) });
for (const wallet of [authority, buyer, other]) await evm.stateManager.putAccount(account(wallet), new Account(0n, 10n ** 20n));
await evm.stateManager.putCode(account(MOSS_TOKEN.address), hexToBytes(runtime));
const coder = AbiCoder.defaultAbiCoder(), initial = parseUnits('10000', 18);
await evm.stateManager.putStorage(account(MOSS_TOKEN.address), hexToBytes(keccak256(coder.encode(['address', 'uint256'], [authority.address, 0]))), hexToBytes(toBeHex(initial, 32)));
await evm.stateManager.putStorage(account(MOSS_TOKEN.address), hexToBytes(toBeHex(2, 32)), hexToBytes(toBeHex(initial, 32)));
const block = { header: { number: 100n, timestamp: 1000n, coinbase: account(ZeroAddress), difficulty: 0n,
  prevRandao: new Uint8Array(32), gasLimit: 30000000n, getBlobGasPrice: () => undefined } };
const deploy = () => evm.runCall({ caller: account(authority), data: hexToBytes(artifact.bytecode + abi.encodeDeploy([authority.address, other.address]).slice(2)), gasLimit: 10000000n, block });
const deployed = await deploy(); assert.equal(deployed.execResult.exceptionError, undefined);
assert((await evm.runCall({ caller: account(authority), data: hexToBytes(artifact.bytecode + abi.encodeDeploy([ZeroAddress, other.address]).slice(2)),
  gasLimit: 10000000n, block })).execResult.exceptionError, 'missing authority rejected at deployment');
assert((await evm.runCall({ caller: account(authority), data: hexToBytes(artifact.bytecode + abi.encodeDeploy([authority.address, ZeroAddress]).slice(2)),
  gasLimit: 10000000n, block })).execResult.exceptionError, 'missing owner rejected at deployment');
const contract = deployed.createdAddress.toString(), second = (await deploy()).createdAddress.toString();
assert.equal(keccak256(await evm.stateManager.getCode(account(contract))), artifact.runtimeCodeHash);
const tokenAbi = new Interface(['function balanceOf(address) view returns(uint256)', 'function totalSupply() view returns(uint256)', 'function transfer(address,uint256) returns(bool)']);
const call = (target, iface, name, args = [], wallet = buyer, value = 0n) => evm.runCall({ to: account(target), caller: account(wallet),
  data: hexToBytes(iface.encodeFunctionData(name, args)), value, gasLimit: 5000000n, block });
const read = async (target, iface, name, args = []) => {
  const result = await call(target, iface, name, args); assert.equal(result.execResult.exceptionError, undefined);
  return iface.decodeFunctionResult(name, bytesToHex(result.execResult.returnValue))[0];
};
assert.equal((await call(MOSS_TOKEN.address, tokenAbi, 'transfer', [contract, initial], authority)).execResult.exceptionError, undefined);
const domain = { name: 'MossvaleTreasureTreasury', version: '1', chainId: 4663, verifyingContract: contract };
const order = { claimId: id('claim'), characterId: id('character'), recipient: buyer.address, amountWei: parseUnits('1', 18) };
const sign = (reward, signer = authority, d = domain) => signer.signTypedData(d, TREASURE_CLAIM_TYPES, reward);
const signature = await sign(order);
const payout = (reward = order, sig = signature, wallet = buyer, eth = 0n) => call(contract, abi, 'claim', [reward, sig], wallet, eth);
for (const change of [{ recipient: other.address }, { characterId: id('stolen-character') }, { claimId: id('other-claim') }, { amountWei: parseUnits('2', 18) }])
  assert((await payout({ ...order, ...change })).execResult.exceptionError, 'signed fields are bound');
assert((await payout(order, signature, other)).execResult.exceptionError, 'only linked recipient can redeem');
assert((await payout(order, await sign(order, other))).execResult.exceptionError, 'wrong signer rejected');
assert((await payout(order, '0x')).execResult.exceptionError, 'malformed signature rejected');
assert((await payout(order, await sign(order, authority, { ...domain, chainId: 46630 }))).execResult.exceptionError, 'other chain signature rejected');
assert((await call(second, abi, 'claim', [order, signature])).execResult.exceptionError, 'other treasury cannot replay signature');
for (const change of [{ claimId: ZeroHash }, { characterId: ZeroHash }, { recipient: ZeroAddress }, { amountWei: 0n }]) {
  const invalid = { ...order, ...change };
  assert((await payout(invalid, await sign(invalid))).execResult.exceptionError, 'invalid signed terms rejected');
}
assert((await payout(order, signature, buyer, 1n)).execResult.exceptionError, 'ETH rejected');
const result = await payout(); assert.equal(result.execResult.exceptionError, undefined, 'real MOSS payout succeeds');
assert.equal(await read(MOSS_TOKEN.address, tokenAbi, 'balanceOf', [buyer.address]), order.amountWei);
assert.equal(await read(MOSS_TOKEN.address, tokenAbi, 'balanceOf', [contract]), initial - order.amountWei);
assert.equal(await read(MOSS_TOKEN.address, tokenAbi, 'totalSupply'), initial, 'treasury pays existing funds without mint or burn');
assert.equal(await read(contract, abi, 'totalPaid'), order.amountWei);
assert.equal(await read(contract, abi, 'paidClaims', [order.claimId]), TypedDataEncoder.hash(domain, TREASURE_CLAIM_TYPES, order));
assert((await payout()).execResult.exceptionError, 'replay rejected');
const requotedPaid = { ...order, amountWei: order.amountWei * 2n };
assert((await payout(requotedPaid, await sign(requotedPaid))).execResult.exceptionError, 'a freshly signed amount cannot repay the same onchain claim ID');
const jackpot = { ...order, claimId: id('jackpot'), amountWei: initial };
assert((await payout(jackpot, await sign(jackpot))).execResult.exceptionError, 'underfunded payout reverts atomically');
assert.equal(await read(contract, abi, 'paidClaims', [jackpot.claimId]), ZeroHash);
assert.equal(await read(contract, abi, 'totalPaid'), order.amountWei, 'failed transfer never alters issuance capacity');
await call(MOSS_TOKEN.address, tokenAbi, 'transfer', [contract, order.amountWei]);
assert.equal((await payout(jackpot, await sign(jackpot))).execResult.exceptionError, undefined, 'same claim retries after funding');
assert.equal(await read(MOSS_TOKEN.address, tokenAbi, 'balanceOf', [buyer.address]), initial);
assert.equal(await read(contract, abi, 'totalPaid'), initial + order.amountWei);
assert.equal(await read(MOSS_TOKEN.address, tokenAbi, 'balanceOf', [contract]), 0n);
assert.equal(await read(contract, abi, 'owner'), other.address, 'owner is the explicit constructor wallet, not deployer or claim authority');
assert.equal(abi.fragments.some(fragment => /upgrade|setAuthority|setOwner|transferOwnership|pause/i.test(fragment.name || '')), false, 'owner and signing authority have no replacement or claim revocation path');
const reserve = parseUnits('100', 18), outstanding = { ...order, claimId: id('withdrawal-pending'), amountWei: parseUnits('7', 18) };
const outstandingSignature = await sign(outstanding), totalPaidBeforeWithdrawal = await read(contract, abi, 'totalPaid');
assert.equal((await call(MOSS_TOKEN.address, tokenAbi, 'transfer', [contract, reserve], buyer)).execResult.exceptionError, undefined);
for (const unauthorized of [authority, buyer]) assert((await call(contract, abi, 'withdraw', [1n], unauthorized)).execResult.exceptionError, 'only owner can withdraw, including rejecting signing authority');
assert((await call(contract, abi, 'withdraw', [0n], other)).execResult.exceptionError, 'zero withdrawal rejected');
assert((await call(contract, abi, 'withdraw', [reserve + 1n], other)).execResult.exceptionError, 'overdraw rejected');
assert((await call(contract, abi, 'withdraw', [1n], other, 1n)).execResult.exceptionError, 'withdrawal rejects ETH');
assert.equal(await read(MOSS_TOKEN.address, tokenAbi, 'balanceOf', [contract]), reserve, 'rejected withdrawals preserve treasury balance');
assert.equal(await read(MOSS_TOKEN.address, tokenAbi, 'balanceOf', [other.address]), 0n, 'rejected withdrawals pay nobody');
const withdrawal = await call(contract, abi, 'withdraw', [reserve], other);
assert.equal(withdrawal.execResult.exceptionError, undefined, 'owner can withdraw the full MOSS balance');
const withdrawalLog = withdrawal.execResult.logs.find(log => bytesToHex(log[0]).toLowerCase() === contract.toLowerCase());
const withdrawn = abi.parseLog({ topics: withdrawalLog[1].map(bytesToHex), data: bytesToHex(withdrawalLog[2]) });
assert.equal(withdrawn.name, 'Withdrawn'); assert.equal(withdrawn.args.owner, other.address); assert.equal(withdrawn.args.amountWei, reserve);
assert.equal(await read(MOSS_TOKEN.address, tokenAbi, 'balanceOf', [other.address]), reserve, 'withdrawals pay only the fixed owner');
assert.equal(await read(MOSS_TOKEN.address, tokenAbi, 'balanceOf', [contract]), 0n);
assert.equal(await read(contract, abi, 'totalPaid'), totalPaidBeforeWithdrawal, 'withdrawal never counts as a player payout');
assert.equal(await read(contract, abi, 'paidClaims', [order.claimId]), TypedDataEncoder.hash(domain, TREASURE_CLAIM_TYPES, order), 'withdrawal preserves paid claim history');
assert((await payout(outstanding, outstandingSignature)).execResult.exceptionError, 'owner withdrawal can leave outstanding claims awaiting funding');
assert.equal(await read(contract, abi, 'paidClaims', [outstanding.claimId]), ZeroHash, 'underfunded claim is not consumed');
assert.equal((await call(MOSS_TOKEN.address, tokenAbi, 'transfer', [contract, reserve], other)).execResult.exceptionError, undefined, 'owner may top up after withdrawal');
assert.equal((await payout(outstanding, outstandingSignature)).execResult.exceptionError, undefined, 'the same outstanding signature pays after a top-up');
assert.equal(await read(contract, abi, 'totalPaid'), totalPaidBeforeWithdrawal + outstanding.amountWei);
assert.equal(await read(MOSS_TOKEN.address, tokenAbi, 'balanceOf', [contract]), reserve - outstanding.amountWei);
assert.equal(await read(MOSS_TOKEN.address, tokenAbi, 'totalSupply'), initial, 'withdrawals and top-ups do not mint or burn MOSS');
// Positive base units, fractions and payouts above the former1,000MOSS cap are valid.
assert.equal((await call(MOSS_TOKEN.address, tokenAbi, 'transfer', [contract, parseUnits('5000',18)], buyer)).execResult.exceptionError, undefined);
for (const amountWei of [1n, parseUnits('0.5',18), parseUnits('1000.5',18), parseUnits('3000',18)]) {
  const reward={...order,claimId:id('positive-amount:'+amountWei),amountWei}, authorization=await sign(reward);
  const beforeTreasury=await read(MOSS_TOKEN.address,tokenAbi,'balanceOf',[contract]);
  const beforeRecipient=await read(MOSS_TOKEN.address,tokenAbi,'balanceOf',[buyer.address]);
  const beforePaid=await read(contract,abi,'totalPaid');
  assert((await payout({...reward,amountWei:amountWei+1n},authorization)).execResult.exceptionError,'fractional and large amounts remain signature-bound');
  const paid=await payout(reward,authorization);assert.equal(paid.execResult.exceptionError,undefined,'any funded positive token amount can be paid');
  assert.equal(await read(MOSS_TOKEN.address,tokenAbi,'balanceOf',[contract]),beforeTreasury-amountWei);
  assert.equal(await read(MOSS_TOKEN.address,tokenAbi,'balanceOf',[buyer.address]),beforeRecipient+amountWei);
  assert.equal(await read(contract,abi,'totalPaid'),beforePaid+amountWei);
  assert.equal(await read(contract,abi,'paidClaims',[reward.claimId]),TypedDataEncoder.hash(domain,TREASURE_CLAIM_TYPES,reward));
  assert((await payout(reward,authorization)).execResult.exceptionError,'fractional and large payouts remain one-use');
}
assert.equal(await read(MOSS_TOKEN.address,tokenAbi,'totalSupply'),initial,'all payout sizes transfer existing MOSS');
for (const [chain, withToken] of [[1, true], [4663, false]]) {
  const isolated = await createEVM({ common: createCustomCommon({ chainId: chain }, Mainnet, { hardfork: Hardfork.Cancun }) });
  await isolated.stateManager.putAccount(account(authority), new Account(0n, 10n ** 20n));
  if (withToken) await isolated.stateManager.putCode(account(MOSS_TOKEN.address), hexToBytes(runtime));
  assert((await isolated.runCall({ caller: account(authority), data: hexToBytes(artifact.bytecode + abi.encodeDeploy([authority.address, other.address]).slice(2)),
    gasLimit: 10000000n, block })).execResult.exceptionError, 'wrong chain or missing token prevents deployment');
}

const now = Math.floor(Date.now() / 1000) * 1000, seconds = now / 1000, txHash = id('transaction');
let tokenCode, contractCode, chainId, receipt, unavailable, changeAfterRead, funds, totalPaid, latestFunds, latestTotalPaid, finalHead, latestHead, canonical, payments, service, priceValue, priceFailure, priceReads, legacyCode, legacyFunds, legacyTotalPaid, legacyPayments;
const makeBlock = (number, time, label = `block-${number}`) => ({ number: toQuantity(number), timestamp: toQuantity(time), hash: id(label) });
const rpc = async (method, params) => {
  if (method === unavailable) throw Error('RPC unavailable');
  if (method === 'eth_chainId') return chainId;
  if (method === 'eth_getBlockByNumber') return params[0] === 'finalized' ? finalHead : params[0] === 'latest' ? latestHead : canonical.get(params[0]);
  if (method === 'eth_getCode') return params[0].toLowerCase() === MOSS_TOKEN.address.toLowerCase() ? tokenCode : params[0].toLowerCase() === legacyContract.toLowerCase() ? legacyCode : contractCode;
  if (method === 'eth_getTransactionReceipt') return receipt;
  if (method === 'eth_call') {
    assert.equal(params[1].requireCanonical, true, 'all storage reads pin canonical block hashes');
    const iface = params[0].to.toLowerCase() === MOSS_TOKEN.address.toLowerCase() ? erc20Interface : abi;
    const call = iface.parseTransaction(params[0]);
    const legacy = (call.name==='balanceOf' ? call.args[0] : params[0].to).toLowerCase() === legacyContract.toLowerCase();
    const values = { name: 'Mossvale', symbol: 'MOSS', decimals: 18, authority: authority.address, paymentToken: MOSS_TOKEN.address,
      paidClaims: (legacy ? legacyPayments : payments).get(params[1].blockHash) ?? ZeroHash,
      balanceOf: legacy ? legacyFunds : params[1].blockHash === latestHead.hash ? latestFunds ?? funds : funds,
      totalPaid: legacy ? legacyTotalPaid : params[1].blockHash === latestHead.hash ? latestTotalPaid ?? totalPaid : totalPaid };
    if (call.name === 'paidClaims' && params[1].blockHash === latestHead.hash && changeAfterRead)
      canonical.set(latestHead.number, { ...latestHead, hash: id('changed-during-read') });
    return iface.encodeFunctionResult(call.name, [values[call.name]]);
  }
  throw Error(`Unexpected RPC ${method}`);
};
const price = async value => { assert.equal(value.purpose, 'payout', 'treasury quotes request payout pricing'); priceReads.push(value); if(priceFailure) throw Error('Price unavailable'); return priceValue; };
const reset = () => {
  tokenCode = runtime; contractCode = artifact.deployedBytecode; chainId = '0x1237'; receipt = undefined;
  funds = initial; totalPaid = 0n; latestFunds = latestTotalPaid = undefined; unavailable = undefined; changeAfterRead = false;
  finalHead = makeBlock(100, seconds - 100); latestHead = makeBlock(110, seconds);
  canonical = new Map([finalHead, makeBlock(109, seconds - 1), latestHead].map(value => [value.number, value])); payments = new Map();
  priceValue={usdWei:parseUnits('1',18).toString(),observedAt:now};priceFailure=false;priceReads=[];
  legacyCode=legacyRuntime;legacyFunds=initial;legacyTotalPaid=0n;legacyPayments=new Map();
  service = createTreasureChain({ contract, authorityKey: authority.privateKey, rpc, price });
};
const input = { id: 'unique-claim', realmId: 'eu', characterId: 'character-id', wallet: buyer.address, usdCents: 800 };
reset();
for (const options of [{ contract: '', authorityKey: '' }, { contract, authorityKey: '' },
  { contract: '', authorityKey: authority.privateKey }, { contract, authorityKey: 'invalid' }]) {
  const disabled = createTreasureChain({ ...options, legacyContract: '', rpc });
  assert.equal(disabled.configured, false, 'missing or invalid treasury configuration disables background settlement');
  assert.equal((await disabled.status()).configured, false);
  assert.equal((await disabled.status()).enabled, false);
}
assert.equal(service.configured, true, 'configured treasury keeps background settlement enabled');
assert.equal((await service.status()).capacityWei, initial.toString());
const { claim, capacityWei } = await service.prepareClaim(input, now);
assert.equal(capacityWei, initial.toString()); assert.equal(claim.amountWei, parseUnits('8', 18).toString());
assert.equal(claim.amount,'8.0');assert.equal(claim.usdCents,800);assert.deepEqual(claim.price,priceValue);
assert.equal(priceReads.at(-1).block.hash,finalHead.hash);assert.equal(priceReads.at(-1).now,now);assert.equal(typeof priceReads.at(-1).rpc,'function');
assert(treasureClaimValid(claim)); assert(treasurePlayerValid({ id: input.characterId, treasureClaims: [claim] }));
assert(!treasurePlayerValid({ id: 'other', treasureClaims: [claim] }));
assert(!treasurePlayerValid({ id: input.characterId, treasureClaims: [claim, claim] }));
assert.deepEqual((await service.prepareClaim(input, now)).claim, claim, 'same durable terms regenerate identical signature and transaction');
assert.notEqual((await service.prepareClaim({ ...input, realmId: 'us' }, now)).claim.claimHash, claim.claimHash);
assert.notEqual((await service.prepareClaim({ ...input, characterId: 'other' }, now)).claim.claimHash, claim.claimHash);
for (const change of [{ usdCents: 0 }, { usdCents: 199 }, { usdCents: 501 }, { usdCents: 599 }, { usdCents: 1001 }, { usdCents: 3001 }, { usdCents: 500.5 }, { wallet: ZeroAddress }, { realmId: '' }, { id: '' }])
  await assert.rejects(service.prepareClaim({ ...input, ...change }, now));
for (const change of [{ amount: '9.0' }, { amount: '8.00' }, { usdCents: 801 }, { price: {...claim.price,usdWei:parseUnits('2',18).toString()} }, { realmId: 'us' }, { characterId: 'other' }, { wallet: other.address }, { amountWei: '9' },
  { transaction: { ...claim.transaction, to: other.address } }, { transaction: { ...claim.transaction, data: '0x1234' } }]) {
  assert(!treasureClaimValid({ ...claim, ...change }), 'tampered persisted or browser claim rejected');
  await assert.rejects(service.checkClaim({ ...claim, ...change }, now));
}
assert.equal((await service.checkClaim(claim, now)).state, 'pending');
assert.equal((await service.verifyClaim(claim, txHash, now)).state, 'pending', 'transaction hash is not proof of payout');
payments.set(latestHead.hash, claim.claimHash);
const processed = await service.checkClaim(claim, now);
assert.equal(processed.state, 'paid', 'canonical processed payout settles immediately without a tx hash');
const anchored = { ...claim, status: 'processed', paymentBlock: { hash: processed.blockHash, number: processed.blockNumber } };
const event = abi.encodeEventLog(abi.getEvent('Claimed'), [claim.contractClaim.claimId, claim.claimHash, buyer.address, claim.contractClaim.characterId, claim.amountWei]);
receipt = { status: '0x1', to: contract, from: buyer.address, transactionHash: txHash, blockNumber: latestHead.number,
  blockHash: latestHead.hash, logs: [{ address: contract, ...event }] };
assert.equal((await service.verifyClaim(anchored, txHash, now)).state, 'paid');
{
  const direct = receipt, entryPoint = '0x0000000071727De22E5E9d8BAf0edAc6f37da032', userOpHash = id('treasury-user-operation');
  const entryAbi = new Interface(['event BeforeExecution()', 'event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)']);
  const before = { address: entryPoint, ...entryAbi.encodeEventLog(entryAbi.getEvent('BeforeExecution'), []) };
  const end = opHash => ({ address: entryPoint, ...entryAbi.encodeEventLog(entryAbi.getEvent('UserOperationEvent'), [opHash, buyer.address, other.address, 1, true, 1000, 100]) });
  const wrap = entries => { receipt = { ...direct, from: other.address, to: entryPoint, logs: entries.map((log, index) => ({ ...log,
    logIndex: toQuantity(index), transactionHash: txHash, blockHash: direct.blockHash, blockNumber: direct.blockNumber })) }; };
  const sponsored = createTreasureChain({ contract, authorityKey: authority.privateKey, rpc, sponsoredOperation: async query => {
    assert.deepEqual({ ...query, contract: query.contract.toLowerCase() }, { transactionHash: txHash, wallet: buyer.address, contract: contract.toLowerCase() });
    return { userOpHash, entryPoint, sender: buyer.address, paymaster: other.address };
  } });
  wrap([before, ...direct.logs, end(userOpHash)]);
  assert.equal((await sponsored.verifyClaim(anchored, txHash, now)).state, 'paid');
  wrap([before, ...direct.logs, end(id('different-operation')), end(userOpHash)]);
  await assert.rejects(sponsored.verifyClaim(anchored, txHash, now), /receipt/, 'another operation cannot supply the voucher payout event');
  receipt = direct;
}
const goodReceipt = receipt;
for (const change of [{ status: '0x0' }, { from: other.address }, { to: other.address }, { transactionHash: id('wrong') }, { logs: [] }, { blockHash: id('orphan') }]) {
  receipt = { ...goodReceipt, ...change }; await assert.rejects(service.verifyClaim(anchored, txHash, now));
}
receipt = goodReceipt;
finalHead = latestHead;
assert.equal((await service.checkClaim(anchored, now)).state, 'paid');
funds -= BigInt(claim.amountWei); totalPaid += BigInt(claim.amountWei);
assert.equal((await service.status()).capacityWei, initial.toString(), 'balance + paid capacity is unchanged after payout');
await assert.rejects(service.prepareClaim(input, now), /already been redeemed/);
finalHead = makeBlock(99, seconds - 110); canonical.set(finalHead.number, finalHead);
await assert.rejects(service.checkClaim(claim, now), /regressed/);

reset(); payments.set(latestHead.hash, claim.claimHash);
const anchor = { ...claim, status: 'processed', paymentBlock: { hash: latestHead.hash, number: latestHead.number } };
await service.checkClaim(anchor, now);
payments.clear();
await assert.rejects(service.checkClaim(anchor, now), /missing from its canonical chain/);
latestHead = makeBlock(111, seconds + 1); canonical.set(latestHead.number, latestHead);
canonical.set(anchor.paymentBlock.number, makeBlock(110, seconds, 'replacement'));
assert.deepEqual(await service.checkClaim(anchor, now + 1000), { state: 'pending', claimHash: claim.claimHash, revoked: true }, 'only canonical orphan evidence makes the saved payout pending again');
payments.set(latestHead.hash, claim.claimHash);
assert.equal((await service.checkClaim(anchor, now + 1000)).reanchored, true);

latestHead = makeBlock(112, seconds + 1901); canonical.set(latestHead.number, latestHead);
payments.set(latestHead.hash, claim.claimHash);
assert.equal((await service.checkClaim(claim, now + 1901000)).state, 'paid', 'fresh canonical payout settles while finality lags over 30 minutes');
payments.clear();
await assert.rejects(service.checkClaim(claim, now + 1901000), /stale or inconsistent/, 'stale finality cannot mark a saved claim unpaid');
await assert.rejects(service.prepareClaim(input, now + 1901000), /stale or inconsistent/, 'new issuance retains fresh finalized funding checks');

for (const mutation of [() => { chainId = '0x1'; }, () => { contractCode = '0x00'; }, () => { tokenCode = '0x00'; },
  () => { unavailable = 'eth_call'; }, () => { latestHead.timestamp = toQuantity(seconds - 130); },
  () => { finalHead.timestamp = toQuantity(seconds - 1900); }]) {
  reset(); mutation(); assert.equal((await service.status()).enabled, false); await assert.rejects(service.prepareClaim(input, now));
}
reset(); changeAfterRead = true;
await assert.rejects(service.prepareClaim(input, now), /changed during verification/);
reset(); funds = 0n;
assert.equal((await service.status()).enabled, false); await assert.rejects(service.prepareClaim(input, now), /funding/);
reset(); latestFunds = parseUnits('1', 18);
assert.equal((await service.status()).capacityWei, latestFunds.toString(), 'a confirmed owner withdrawal lowers capacity before finality catches up');
await assert.rejects(service.prepareClaim(input, now), /funding/);
assert.equal((await service.checkClaim(claim, now)).state, 'pending', 'underfunding does not invalidate an existing signature');
latestFunds = funds;
assert.equal((await service.prepareClaim(input, now)).claim.signature, claim.signature, 'top-up retains the exact existing authorization');
reset(); funds = parseUnits('1', 18); latestFunds = initial;
assert.equal((await service.status()).capacityWei, funds.toString(), 'unfinalized top-ups do not increase issuance capacity');
await assert.rejects(service.prepareClaim(input, now), /funding/);
reset(); latestFunds = initial - parseUnits('8', 18); latestTotalPaid = parseUnits('8', 18);
assert.equal((await service.prepareClaim(input, now)).capacityWei, initial.toString(), 'latest payouts preserve total issuance capacity');
reset(); funds = latestFunds = 0n; totalPaid = initial;
await assert.rejects(service.prepareClaim(input, now), /funding/, 'previously paid totals cannot fund a new claim with an empty treasury');
reset(); payments.set(latestHead.hash, id('conflicting'));
await assert.rejects(service.checkClaim(claim, now), /conflicting settlement/);

// Refresh changes the MOSS amount at the same assigned USD value and preserves all prior authorizations.
reset(); priceValue.usdWei = parseUnits('2', 18).toString();
const original = structuredClone(claim), refreshed = (await service.refreshClaim(claim, now + 1000)).claim;
assert.equal(refreshed.usdCents, claim.usdCents); assert.equal(refreshed.amount, '4.0');
assert.equal(refreshed.contractClaim.claimId, claim.contractClaim.claimId); assert.notEqual(refreshed.claimHash, claim.claimHash);
assert.deepEqual(refreshed.previousQuotes, [claim]); assert.deepEqual(claim, original); assert(treasureClaimValid(refreshed));
assert.deepEqual(treasureQuotes(refreshed), [claim, refreshed]);
assert.equal((await service.refreshClaim(refreshed, now + 2000)).claim, refreshed, 'unchanged amount returns the original quote without growing history');
priceValue = { ...priceValue, usdWei: parseUnits('1', 18).toString() };
const oscillated = (await service.refreshClaim(refreshed, now + 3000)).claim;
assert.equal(oscillated.claimHash, claim.claimHash); assert(treasureClaimValid(oscillated), 'price oscillation can reuse an earlier digest');
assert.deepEqual(oscillated.previousQuotes, [claim, { ...refreshed, previousQuotes: undefined }].map(({ previousQuotes, ...quote }) => quote));
const clearedMetadata = { ...refreshed, transactionHash: undefined, paymentBlock: undefined, paidAt: undefined, settledClaimHash: undefined };
const refreshedAfterRollback = (await service.refreshClaim(clearedMetadata, now + 3000)).claim;
assert(treasureClaimValid(refreshedAfterRollback), 'runtime metadata cleared by a reorg is stripped from the historical snapshot');
assert(!Object.hasOwn(refreshedAfterRollback.previousQuotes.at(-1), 'settledClaimHash'));
const manyQuotes = { ...refreshed, previousQuotes: Array.from({ length: TREASURE_MAX_CLAIMS - 1 }, () => claim) };
assert(treasurePlayerValid({ id: input.characterId, treasureClaims: [manyQuotes] }));
assert(!treasurePlayerValid({ id: input.characterId, treasureClaims: [{ ...manyQuotes, previousQuotes: [...manyQuotes.previousQuotes, claim] }] }), 'duplicate digests still count toward the storage limit');
const siblingClaim = (await service.prepareClaim({ ...input, id: 'another-claim' }, now)).claim;
assert(!treasurePlayerValid({ id: input.characterId, treasureClaims: [manyQuotes, siblingClaim] }), 'quote limit applies across every payout of the character');
for (const previousQuotes of [null, [{ ...claim, previousQuotes: [] }], [{ ...claim, wallet: other.address }], [{ ...claim, usdCents: 900 }]])
  assert(!treasureClaimValid({ ...refreshed, previousQuotes }), 'invalid, nested or altered-identity history is rejected');
const wrongHistorySigner = await other.signTypedData(domain, TREASURE_CLAIM_TYPES, claim.contractClaim);
await assert.rejects(service.checkClaim({ ...refreshed, previousQuotes: [{ ...claim, signature: wrongHistorySigner,
  transaction: { ...claim.transaction, data: abi.encodeFunctionData('claim', [claim.contractClaim, wrongHistorySigner]) } }] }, now), /authorization/);
for (const mutation of [{ transactionHash: txHash }, { status: 'processed', paymentBlock: { hash: latestHead.hash, number: latestHead.number } }, { settledClaimHash: claim.claimHash }])
  await assert.rejects(service.refreshClaim({ ...refreshed, ...mutation }, now));
priceFailure = true;
await assert.rejects(service.refreshClaim(refreshed, now), /Price unavailable/);
assert.equal((await service.checkClaim(refreshed, now)).state, 'pending', 'pricing outage leaves refreshed and previous quotes valid');
payments.set(latestHead.hash, claim.claimHash);
const oldPaid = await service.checkClaim(refreshed, now);
assert.equal(oldPaid.claimHash, refreshed.claimHash); assert.equal(oldPaid.settledClaimHash, claim.claimHash);
const refreshAnchor = { ...refreshed, status: 'processed', settledClaimHash: claim.claimHash, paymentBlock: { hash: latestHead.hash, number: latestHead.number } };
assert(treasureClaimValid(refreshAnchor)); assert(!treasureClaimValid({ ...refreshAnchor, settledClaimHash: id('unknown-quote') }));
receipt = { status: '0x1', to: contract, from: buyer.address, transactionHash: txHash, blockNumber: latestHead.number, blockHash: latestHead.hash, logs: [{ address: contract, ...event }] };
assert.equal((await service.verifyClaim(refreshAnchor, txHash, now)).settledClaimHash, claim.claimHash, 'receipt verifies the old signed amount, not the refreshed amount');
payments.set(latestHead.hash, refreshed.claimHash);
await assert.rejects(service.checkClaim(refreshAnchor, now), /canonical authorization/, 'a non-orphaned settlement cannot change signed amounts');
payments.clear(); latestHead = makeBlock(111, seconds + 1); canonical.set(latestHead.number, latestHead);
canonical.set(refreshAnchor.paymentBlock.number, makeBlock(110, seconds, 'quote-reorg'));
assert.deepEqual(await service.checkClaim(refreshAnchor, now + 1000), { state: 'pending', claimHash: refreshed.claimHash, revoked: true });
payments.set(latestHead.hash, refreshed.claimHash);
const newPaid = await service.checkClaim(refreshAnchor, now + 1000);
assert.equal(newPaid.settledClaimHash, refreshed.claimHash); assert.equal(newPaid.reanchored, true, 'after reorg either known authorization may settle');
const refreshedEvent = abi.encodeEventLog(abi.getEvent('Claimed'), [refreshed.contractClaim.claimId, refreshed.claimHash, buyer.address, refreshed.contractClaim.characterId, refreshed.amountWei]);
receipt = { ...receipt, blockNumber: latestHead.number, blockHash: latestHead.hash, logs: [{ address: contract, ...refreshedEvent }] };
assert.equal((await service.verifyClaim(refreshed, txHash, now + 1000)).settledClaimHash, refreshed.claimHash);
priceFailure = false; await assert.rejects(service.refreshClaim(refreshed, now + 1000), /already been redeemed/);
finalHead = latestHead; assert.equal((await service.checkClaim(refreshAnchor, now + 1000)).state, 'paid', 'finalized replacement authorization supersedes an orphaned historical payment');
canonical.set(refreshAnchor.paymentBlock.number, { ...canonical.get(refreshAnchor.paymentBlock.number), hash: refreshAnchor.paymentBlock.hash });
await assert.rejects(service.checkClaim(refreshAnchor, now + 1000), /canonical authorization/, 'finalized storage cannot contradict a still-canonical saved authorization');

// Dollar conversion uses canonical token strings and never crosses the quoted $2/$10 bounds.
for (const [usdCents,quotedPrice,wanted] of [[200,'3','666666666666666667'],[1000,'7','1428571428571428571'],[200,'0.001',parseUnits('2000',18).toString()]]) {
  reset();priceValue.usdWei=parseUnits(quotedPrice,18).toString();
  const {claim:quoted}=await service.prepareClaim({...input,usdCents},now);
  assert.equal(quoted.amountWei,wanted);assert.equal(quoted.amount,formatUnits(wanted,18));assert(treasureClaimValid(quoted));
  const usdNumerator=BigInt(quoted.amountWei)*BigInt(priceValue.usdWei);
  assert(usdNumerator>=200n*10n**34n && usdNumerator<=1000n*10n**34n,'quoted payout stays within dollar bounds');
}
for (const invalid of [null,{}, {usdWei:'0',observedAt:now},{usdWei:'-1',observedAt:now},{usdWei:'1.0',observedAt:now},
  {usdWei:(2n**256n).toString(),observedAt:now},{usdWei:parseUnits('1',18).toString(),observedAt:0},
  {usdWei:parseUnits('1',18).toString(),observedAt:now-90001},{usdWei:parseUnits('1',18).toString(),observedAt:now+15001},
  {usdWei:parseUnits('1',18).toString(),observedAt:now+0.5}]) {
  reset();priceValue=invalid;await assert.rejects(service.prepareClaim(input,now),undefined,'invalid or stale pricing cannot authorize a payout');
}
reset();priceFailure=true;await assert.rejects(service.prepareClaim(input,now),/Price unavailable/);
reset();priceValue.usdWei=(2n**256n-1n).toString();await assert.rejects(service.prepareClaim(input,now),/amount|price/i,'no payable base unit fits these dollar bounds');

// Price failure disables new vouchers without invalidating already saved current claims.
reset();priceFailure=true;
const unavailablePrice=await service.status();assert.equal(unavailablePrice.enabled,false);assert.equal(unavailablePrice.balanceWei,initial.toString());
const pricingReadsBeforeSettlement=priceReads.length;
assert.equal((await service.checkClaim(claim,now)).state,'pending');
payments.set(latestHead.hash,claim.claimHash);
receipt={status:'0x1',to:contract,from:buyer.address,transactionHash:txHash,blockNumber:latestHead.number,blockHash:latestHead.hash,logs:[{address:contract,...event}]};
assert.equal((await service.verifyClaim(claim,txHash,now)).state,'paid','saved current claims collect without a new price');
finalHead=latestHead;assert.equal((await service.checkClaim(claim,now)).state,'paid');
assert.equal(priceReads.length,pricingReadsBeforeSettlement,'settlement never requotes a saved claim');

// Previously signed $5–$30 rewards remain collectible and refresh without rerolling.
reset();
for (const usdCents of [200, 499, 500, 501, 599, 1000, 3000]) {
  const amount = formatUnits(BigInt(usdCents) * 10n ** 16n, 18);
  const contractClaim = treasureContractClaim({ ...input, amount });
  const signature = await authority.signTypedData(domain, TREASURE_CLAIM_TYPES, contractClaim);
  const saved = { ...claim, amount, usdCents, amountWei: contractClaim.amountWei, contractClaim, signature,
    claimHash: TypedDataEncoder.hash(domain, TREASURE_CLAIM_TYPES, contractClaim),
    transaction: { ...claim.transaction, data: abi.encodeFunctionData('claim', [contractClaim, signature]) } };
  assert(treasureClaimValid(saved));
  assert.equal((await service.checkClaim(saved, now)).state, 'pending');
  priceValue.usdWei = parseUnits('2', 18).toString();
  const refreshed = (await service.refreshClaim(saved, now)).claim;
  assert.equal(refreshed.usdCents, usdCents); assert.deepEqual(refreshed.previousQuotes, [saved]);
  assert(treasureClaimValid(refreshed));
  priceValue.usdWei = parseUnits('1', 18).toString();
}
assert.deepEqual(TREASURE_REWARD_TIERS, [{ weight: 9000, min: 200, max: 500 }, { weight: 1000, min: 600, max: 1000 }]);
reset(); funds = latestFunds = parseUnits('2', 18);
assert.equal((await service.status()).enabled, true, 'two dollars of funding admits the smallest new voucher');

// Gold rounds pay immutable MOSS awards even when voucher pricing is unavailable.
reset(); priceFailure = true;
const goldInput = { id: 'gold-award', realmId: 'eu', characterId: input.characterId, wallet: buyer.address,
  goldRoundId: 'gold-round-1', amountWei: '1' };
assert.equal((await service.status(false)).enabled, true);
assert.equal(priceReads.length, 0, 'fixed round funding does not require the voucher price oracle');
let goldClaim;
for (const amountWei of ['1', parseUnits('3000.5', 18).toString()]) {
  const prepared = await service.prepareGoldClaim({ ...goldInput, amountWei }, now);
  goldClaim = prepared.claim;
  assert.equal(prepared.capacityWei, initial.toString());
  assert.equal(goldClaim.amountWei, amountWei); assert.equal(goldClaim.amount, formatUnits(amountWei, 18));
  assert.equal(goldClaim.goldRoundId, goldInput.goldRoundId);
  assert.equal(goldClaim.usdCents, undefined); assert.equal(goldClaim.price, undefined);
  assert(treasureClaimValid(goldClaim));
  assert.equal(validateNativeWalletOperation({ kind: 'claim', claim: goldClaim }, 'https://mossvale.world', now).claim, goldClaim);
  assert.deepEqual((await service.prepareGoldClaim({ ...goldInput, amountWei }, now)).claim, goldClaim, 'retry preserves signed fixed terms');
  assert.equal((await service.checkClaim(goldClaim, now)).state, 'pending');
  await assert.rejects(service.refreshClaim(goldClaim, now), /unsubmitted USD payout/, 'fixed gold awards never enter voucher repricing');
}
assert.equal(priceReads.length, 0, 'gold issuance and settlement never reprice a funded award');
assert.notEqual((await service.prepareGoldClaim({ ...goldInput, goldRoundId: 'gold-round-2' }, now)).claim.contractClaim.claimId,
  goldClaim.contractClaim.claimId, 'round identity is signed through the claim ID');
for (const change of [{ amountWei: '0' }, { amountWei: '01' }, { amountWei: '-1' }, { amountWei: 1 }, { amountWei: '1.0' },
  { amountWei: (2n ** 256n).toString() }, { goldRoundId: undefined }, { goldRoundId: '' }, { goldRoundId: 'x'.repeat(129) },
  { wallet: ZeroAddress }, { realmId: '' }, { id: '' }, { usdCents: 800 }, { price: priceValue }, { contract: other.address }])
  await assert.rejects(service.prepareGoldClaim({ ...goldInput, ...change }, now), undefined, 'invalid fixed award cannot be signed');
for (const change of [{ goldRoundId: undefined }, { goldRoundId: '' }, { goldRoundId: 'gold-round-2' }, { amount: 3000 },
  { amount: '3000.50' }, { amountWei: '1' }, { usdCents: 800 }, { price: priceValue }, { wallet: other.address },
  { previousQuotes: [] }, { previousQuotes: [goldClaim] }, { previousQuotes: [claim] },
  { transaction: { ...goldClaim.transaction, data: '0x1234' } }]) {
  const tampered = { ...goldClaim, ...change };
  assert(!treasureClaimValid(tampered), 'gold source, amount, wallet and transaction remain bound to the award');
  await assert.rejects(service.checkClaim(tampered, now));
  assert.throws(() => validateNativeWalletOperation({ kind: 'claim', claim: tampered }, 'https://mossvale.world', now));
}
assert(!treasureClaimValid({ ...claim, goldRoundId: goldInput.goldRoundId }), 'voucher authorizations cannot be relabeled as gold awards');
await assert.rejects(service.prepareClaim({ ...input, goldRoundId: goldInput.goldRoundId }, now), /Invalid/);
await assert.rejects(service.prepareClaim(input, now), /Price unavailable/, 'voucher pricing still fails closed');
payments.set(latestHead.hash, goldClaim.claimHash);
assert.equal((await service.checkClaim(goldClaim, now)).state, 'paid');
finalHead = latestHead;
assert.equal((await service.checkClaim(goldClaim, now)).state, 'paid');
await assert.rejects(service.prepareGoldClaim(goldInput, now), /already been redeemed/);
reset(); latestFunds = 0n;
await assert.rejects(service.prepareGoldClaim(goldInput, now), /funding/, 'confirmed withdrawals block fixed award issuance');
reset(); funds = 0n; latestFunds = initial;
await assert.rejects(service.prepareGoldClaim(goldInput, now), /funding/, 'unfinalized top-ups cannot fund fixed awards');
reset(); changeAfterRead = true;
await assert.rejects(service.prepareGoldClaim(goldInput, now), /changed during verification/);

// The $1,000 budget converts once at close, using the current price rather than its opening value.
reset();
const openingQuote = await service.quoteGoldBudget({}, now);
assert.deepEqual(openingQuote, { contract: claim.contract, capacityWei: initial.toString(), balanceWei: initial.toString(),
  amountWei: parseUnits('1000', 18).toString(), price: { usdWei: parseUnits('1', 18).toString(), observedAt: now } });
assert.equal(priceReads.length, 1, 'one quote reads exactly one shared price snapshot');
assert.equal(priceReads[0].block.hash, finalHead.hash);
priceValue.usdWei = parseUnits('2', 18).toString();
const closingQuote = await service.quoteGoldBudget({ payoutUsdMicros: '1000000000' }, now);
assert.equal(closingQuote.amountWei, parseUnits('500', 18).toString(), 'a doubled price halves the MOSS locked at close');
const lockedAward = goldUsdAmountWei('400000000', closingQuote.price.usdWei);
assert.equal(lockedAward, parseUnits('200', 18).toString());
assert.equal(BigInt(lockedAward) + BigInt(goldUsdAmountWei('600000000', closingQuote.price.usdWei)), BigInt(closingQuote.amountWei));
priceValue.usdWei = parseUnits('0.5', 18).toString();
assert.equal((await service.quoteGoldBudget({}, now)).amountWei, parseUnits('2000', 18).toString(), 'falling price increases MOSS needed for the same dollars');
const readsBeforeLockedClaim = priceReads.length;
priceFailure = true;
const lockedClaim = (await service.prepareGoldClaim({ ...goldInput, amountWei: lockedAward }, now)).claim;
assert.equal(lockedClaim.amountWei, lockedAward); assert.equal(priceReads.length, readsBeforeLockedClaim, 'later collection preserves the round-close amount through price changes and outages');
assert.equal(goldUsdAmountWei('1', parseUnits('3', 18).toString()), '333333333333', 'sub-cent awards round down, never above their USD cost');
for (const invalid of [undefined, null, 1, '', '0', '-1', '01', '1.0', (2n ** 256n).toString()]) {
  assert.throws(() => goldUsdAmountWei(invalid, parseUnits('1', 18).toString()), /Invalid/);
  assert.throws(() => goldUsdAmountWei('1000000000', invalid), /Invalid/);
}
assert.throws(() => goldUsdAmountWei('1', (10n ** 30n + 1n).toString()), /positive MOSS/, 'zero-wei awards cannot consume gold');
assert.throws(() => goldUsdAmountWei((2n ** 256n - 1n).toString(), '1'), /positive MOSS/, 'conversion overflow is rejected');
for (const invalid of [null, {}, { usdWei: '0', observedAt: now }, { usdWei: '1.0', observedAt: now },
  { usdWei: parseUnits('1', 18).toString(), observedAt: now - 90001 }, { usdWei: parseUnits('1', 18).toString(), observedAt: now + 15001 }]) {
  reset(); priceValue = invalid; await assert.rejects(service.quoteGoldBudget({}, now));
}
reset(); latestFunds = parseUnits('100', 18); latestTotalPaid = parseUnits('50', 18);
const withdrawnQuote = await service.quoteGoldBudget({}, now);
assert.equal(withdrawnQuote.balanceWei, latestFunds.toString());
assert.equal(withdrawnQuote.capacityWei, (latestFunds + latestTotalPaid).toString(), 'quote includes confirmed withdrawals for shared liability checks');
reset(); funds = parseUnits('100', 18); latestFunds = initial;
assert.equal((await service.quoteGoldBudget({}, now)).capacityWei, funds.toString(), 'an unfinalized top-up cannot back round settlement');
reset(); priceFailure = true; await assert.rejects(service.quoteGoldBudget({}, now), /Price unavailable/);
reset(); tokenCode = '0x00'; await assert.rejects(service.quoteGoldBudget({}, now), /deployment/);
reset(); service = createTreasureChain({ contract, authorityKey: authority.privateKey, rpc, price: async value => {
  const result = await price(value); canonical.set(latestHead.number, { ...latestHead, hash: id('gold-quote-reorg') }); return result;
} });
await assert.rejects(service.quoteGoldBudget({}, now), /changed during verification/, 'a reorg during pricing invalidates the whole funding quote');

// Legacy authorizations retain numeric amounts, signatures and their original treasury.
reset();service=createTreasureChain({contract,legacyContract,authorityKey:authority.privateKey,rpc,price});
assert.equal(service.configured, true, 'legacy routing retains the current treasury configuration');
priceFailure = true;
assert.equal((await service.status(false)).enabled, true, 'legacy routing preserves price-free fixed round funding checks');
assert.equal(priceReads.length, 0);
priceFailure = false;
const legacyDomain={...domain,verifyingContract:legacyContract};
const legacyTerms={...claim.contractClaim,amountWei:parseUnits('1000',18).toString()};
const legacySignature=await authority.signTypedData(legacyDomain,TREASURE_CLAIM_TYPES,legacyTerms);
const legacyClaim={id:input.id,realmId:input.realmId,characterId:input.characterId,wallet:buyer.address,amount:1000,amountWei:legacyTerms.amountWei,createdAt:now,
  chainId:4663,token:MOSS_TOKEN.address,contract:legacyContract,status:'pending',contractClaim:legacyTerms,signature:legacySignature,
  claimHash:TypedDataEncoder.hash(legacyDomain,TREASURE_CLAIM_TYPES,legacyTerms),transaction:{to:legacyContract,data:abi.encodeFunctionData('claim',[legacyTerms,legacySignature]),value:'0x0',chainId:'0x1237'}};
assert(treasureClaimValid(legacyClaim),'persisted numeric legacy claim remains valid');
await assert.rejects(service.refreshClaim(legacyClaim,now), /deployment|unsubmitted/, 'numeric legacy authorizations are not repriced');
assert(BigInt(legacyClaim.amountWei)*BigInt(priceValue.usdWei)>3000n*10n**34n,'legacy authorization exceeds the new $30 reference cap');
const savedLegacyClaim=structuredClone(legacyClaim);
assert.equal((await service.prepareClaim(input,now)).claim.contract.toLowerCase(),contract.toLowerCase(),'new issuance always uses the current treasury');
priceFailure=true;funds=0n;
assert.equal((await service.checkClaim(legacyClaim,now)).state,'pending','current funding/pricing failure does not block legacy settlement');
assert.equal((await service.status()).legacyBalanceWei,legacyFunds.toString(),'pending legacy payout has its own funding status');
const legacySettlementPriceReads=priceReads.length;
legacyPayments.set(latestHead.hash,legacyClaim.claimHash);
const legacyEvent=abi.encodeEventLog(abi.getEvent('Claimed'),[legacyTerms.claimId,legacyClaim.claimHash,buyer.address,legacyTerms.characterId,legacyClaim.amountWei]);
receipt={status:'0x1',to:legacyContract,from:buyer.address,transactionHash:txHash,blockNumber:latestHead.number,blockHash:latestHead.hash,logs:[{address:legacyContract,...legacyEvent}]};
assert.equal((await service.verifyClaim(legacyClaim,txHash,now)).state,'paid','legacy transaction verification routes to its original contract');
finalHead=latestHead;assert.equal((await service.checkClaim(legacyClaim,now)).state,'paid','legacy finality/history survives the new treasury');
assert.equal(priceReads.length,legacySettlementPriceReads,'legacy payout above $30 settles without a new price');
assert.deepEqual(legacyClaim,savedLegacyClaim,'legacy amount, signature and transaction remain unchanged');
legacyCode=artifact.deployedBytecode;await assert.rejects(service.checkClaim(legacyClaim,now),/deployment|contract/i,'legacy runtime remains independently pinned');

let cumulative = 0;
assert.equal(TREASURE_REWARD_TIERS.reduce((sum, tier) => sum + tier.weight, 0), 10000);
for (const tier of TREASURE_REWARD_TIERS) {
  for (const boundary of [cumulative, cumulative + tier.weight - 1]) {
    assert.equal(rollTreasureUsd((min, max) => max === 10000 ? boundary : min), tier.min);
    assert.equal(rollTreasureUsd((min, max) => max === 10000 ? boundary : max - 1), tier.max);
  }
  cumulative += tier.weight;
}
assert.throws(() => rollTreasureUsd(() => 10000), /Invalid/);
assert.throws(() => rollTreasureUsd((min, max) => max === 10000 ? 0 : -1), /Invalid/);
console.log('Treasure treasury: actual MOSS payouts, fixed gold-round awards and native validation, voucher USD bounds, owner withdrawals and top-ups, legacy routing, replay/wallet/domain safety, exact capacity, durable claim validation, processed/finalized recovery, reorgs, and disabled configuration passed.');
