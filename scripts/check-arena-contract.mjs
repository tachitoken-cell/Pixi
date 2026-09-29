import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import solc from 'solc';
import { createEVM } from '@ethereumjs/evm';
import { createCustomCommon, Mainnet, Hardfork } from '@ethereumjs/common';
import { Account, bytesToHex, createAddressFromString, hexToBytes } from '@ethereumjs/util';
import { AbiCoder, Interface, Wallet, TypedDataEncoder, ZeroAddress, ZeroHash, id, keccak256, toBeHex, getCreateAddress } from 'ethers';
import { compileArenaContract } from './build-arena-contract.mjs';
import { MOSS_TOKEN, MOSS_AUCTION_DEV_TEAM } from '../src/auction.ts';
import { MOSS_TOKEN_RUNTIME_HASH } from '../src/auction-chain.mjs';

// Real contract bytecode, local EVM only: no RPC, funded keys or broadcasts.
const artifact = compileArenaContract(), abi = new Interface(artifact.abi), coder = AbiCoder.defaultAbiCoder();
assert.deepEqual(artifact, JSON.parse(readFileSync(new URL('../public/contracts/MossvaleArena.json', import.meta.url), 'utf8')));
const runtime = readFileSync(new URL('./fixtures/moss-token-runtime.hex', import.meta.url), 'utf8').trim();
assert.equal(keccak256(runtime), MOSS_TOKEN_RUNTIME_HASH);
const types = { Match: [
  { name: 'matchId', type: 'bytes32' }, { name: 'playerA', type: 'address' }, { name: 'playerB', type: 'address' },
  { name: 'stakeWei', type: 'uint256' }, { name: 'fundingDeadline', type: 'uint64' }, { name: 'refundAfter', type: 'uint64' },
] };
const resultTypes = { Result: [{ name: 'matchId', type: 'bytes32' }, { name: 'termsHash', type: 'bytes32' }, { name: 'winner', type: 'address' }] };
const authority = Wallet.createRandom(), a = Wallet.createRandom(), b = Wallet.createRandom(), other = Wallet.createRandom(), treasury = Wallet.createRandom();
const address = value => createAddressFromString(typeof value === 'string' ? value : value.address);
const initial = 1000n * 10n ** 18n, stake = 10n ** 18n;
let timestamp = 1000, nextMatch = 0;
const block = () => ({ header: { number: 100n, timestamp: BigInt(timestamp), coinbase: address(ZeroAddress),
  difficulty: 0n, prevRandao: new Uint8Array(32), gasLimit: 30000000n, getBlobGasPrice: () => undefined } });
const mockSource = `pragma solidity 0.8.36;
contract MockMoss {
  mapping(address => uint256) public balanceOf;
  mapping(address => mapping(address => uint256)) public allowance;
  uint256 public totalSupply;
  uint256 public inboundMode; uint256 public outboundMode; uint256 public burnMode;
  address public failedRecipient; address public attack; bytes public attackData; bool public attackBurn;
  function mint(address to,uint256 amount) external { balanceOf[to]+=amount; totalSupply+=amount; }
  function setModes(uint256 incoming,uint256 outgoing,uint256 burning) external { inboundMode=incoming; outboundMode=outgoing; burnMode=burning; }
  function setFailedRecipient(address to) external { failedRecipient=to; }
  function setAttack(address to,bytes calldata data,bool burning) external { attack=to; attackData=data; attackBurn=burning; }
  function approve(address spender,uint256 amount) external returns(bool) { allowance[msg.sender][spender]=amount; return true; }
  function transferFrom(address from,address to,uint256 amount) external returns(bool) {
    allowance[from][msg.sender]-=amount; return move(from,to,amount,inboundMode);
  }
  function transfer(address to,uint256 amount) external returns(bool) { return to!=failedRecipient && move(msg.sender,to,amount,outboundMode); }
  function move(address from,address to,uint256 amount,uint256 mode) private returns(bool) {
    if(mode==3)return false;
    balanceOf[from]-=amount+(mode==2?1:0); balanceOf[to]+=amount-(mode==1?1:0);
    if(!attackBurn) reenter(); return true;
  }
  function burn(uint256 amount) external {
    require(burnMode!=3,"Burn failed");
    if(burnMode!=1)balanceOf[msg.sender]-=amount;
    if(burnMode!=2)totalSupply-=amount+(burnMode==4?1:0);
    if(attackBurn)reenter();
  }
  function reenter() private {
    if(attack==address(0))return;
    address target=attack; attack=address(0);
    (bool ok,bytes memory reason)=target.call(attackData);
    require(!ok && keccak256(reason)==keccak256(abi.encodeWithSignature("Error(string)","Reentrant call")),"Reentry not blocked");
  }
}`;
const compiled = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: { 'MockMoss.sol': { content: mockSource } },
  settings: { evmVersion: 'paris', outputSelection: { '*': { '*': ['abi', 'evm.deployedBytecode.object'] } } } })));
assert.equal((compiled.errors || []).filter(error => error.severity === 'error').length, 0);
const mock = compiled.contracts['MockMoss.sol'].MockMoss, tokenAbi = new Interface(mock.abi);
async function setup(code = runtime, chainId = 4663) {
  const evm = await createEVM({ common: createCustomCommon({ chainId }, Mainnet, { hardfork: Hardfork.Cancun }) });
  for (const wallet of [authority, a, b, other, treasury]) await evm.stateManager.putAccount(address(wallet), new Account(0n, 10n ** 20n));
  if (code) await evm.stateManager.putCode(address(MOSS_TOKEN.address), hexToBytes(code));
  const deploy = (signer = authority.address, recipient = treasury.address) => evm.runCall({ caller: address(authority),
    data: hexToBytes(artifact.bytecode + coder.encode(['address', 'address'], [signer, recipient]).slice(2)), gasLimit: 6000000n, block: block() });
  const token = (name, args = [], caller = other) => evm.runCall({ caller: address(caller), to: address(MOSS_TOKEN.address),
    data: hexToBytes(tokenAbi.encodeFunctionData(name, args)), gasLimit: 1500000n, block: block() });
  const result = await deploy();
  if (result.execResult.exceptionError) return { evm, deploy, result };
  const contract = result.createdAddress.toString(), domain = { name: 'MossvaleArena', version: '1', chainId: 4663, verifyingContract: contract };
  const call = (name, args = [], caller = other, value = 0n) => evm.runCall({ caller: address(caller), to: address(contract),
    data: hexToBytes(abi.encodeFunctionData(name, args)), value, gasLimit: 2000000n, block: block() });
  const read = async (name, args = []) => {
    const value = await call(name, args); assert.equal(value.execResult.exceptionError, undefined, `${name} reads`);
    return abi.decodeFunctionResult(name, bytesToHex(value.execResult.returnValue));
  };
  const tokenRead = async (name, args = []) => {
    const value = await token(name, args); assert.equal(value.execResult.exceptionError, undefined, `${name} reads`);
    return tokenAbi.decodeFunctionResult(name, bytesToHex(value.execResult.returnValue))[0];
  };
  if (code === runtime) {
    for (const wallet of [a, b]) await evm.stateManager.putStorage(address(MOSS_TOKEN.address),
      hexToBytes(keccak256(coder.encode(['address', 'uint256'], [wallet.address, 0]))), hexToBytes(toBeHex(initial, 32)));
    await evm.stateManager.putStorage(address(MOSS_TOKEN.address), hexToBytes(toBeHex(2, 32)), hexToBytes(toBeHex(initial * 2n, 32)));
  } else for (const wallet of [a, b]) assert.equal((await token('mint', [wallet.address, initial])).execResult.exceptionError, undefined);
  const terms = (changes = {}) => ({ matchId: id(`arena-${++nextMatch}`), playerA: a.address, playerB: b.address, stakeWei: stake,
    fundingDeadline: 1300, refundAfter: 2000, ...changes });
  const sign = (terms, signer = authority, changedDomain = {}) => signer.signTypedData({ ...domain, ...changedDomain }, types, terms);
  const outcome = (terms, winner, signer = authority, changes = {}, changedDomain = {}) => signer.signTypedData({ ...domain, ...changedDomain }, resultTypes,
    { matchId: terms.matchId, termsHash: TypedDataEncoder.hash(domain, types, terms), winner, ...changes });
  const fund = async (terms, caller = a) => {
    assert.equal((await token('approve', [contract, terms.stakeWei], caller)).execResult.exceptionError, undefined);
    return call('fund', [terms, await sign(terms)], caller);
  };
  const balances = async () => Promise.all([a.address, b.address, contract, treasury.address, MOSS_AUCTION_DEV_TEAM]
    .map(wallet => tokenRead('balanceOf', [wallet])).concat(tokenRead('totalSupply')));
  return { evm, result, deploy, contract, domain, call, read, token, tokenRead, terms, sign, outcome, fund, balances };
}
const succeeds = (result, label) => assert.equal(result.execResult.exceptionError, undefined, label);
const fails = (result, label) => assert.ok(result.execResult.exceptionError, label);
const real = await setup(); succeeds(real.result, 'real MOSS deployment');
fails(await real.deploy(ZeroAddress), 'zero authority'); fails(await real.deploy(authority.address, ZeroAddress), 'zero treasury');
const self = getCreateAddress({ from: authority.address, nonce: (await real.evm.stateManager.getAccount(address(authority))).nonce });
fails(await real.deploy(authority.address, self), 'self treasury');
fails((await setup(runtime, 46630)).result, 'wrong chain'); fails((await setup('')).result, 'missing token');
for (const [field, expected] of [['authority', authority.address], ['treasury', treasury.address], ['devTeam', MOSS_AUCTION_DEV_TEAM], ['paymentToken', MOSS_TOKEN.address], ['TAX_BPS', 500n]])
  assert.equal((await real.read(field))[0], expected);
assert.equal(bytesToHex(await real.evm.stateManager.getCode(address(real.contract))), artifact.deployedBytecode);

const terms = real.terms(), signature = await real.sign(terms), digest = TypedDataEncoder.hash(real.domain, types, terms);
assert.equal((await real.read('matchHash', [terms]))[0], digest);
const rejectedFund = async (value = terms, sig = signature, caller = a, eth = 0n) => {
  const before = await real.balances(), state = [...await real.read('matches', [value.matchId])];
  fails(await real.call('fund', [value, sig], caller, eth), 'invalid fund rejects');
  assert.deepEqual(await real.balances(), before, 'fund rejection preserves all balances and supply');
  assert.deepEqual([...await real.read('matches', [value.matchId])], state, 'fund rejection preserves match');
};
await rejectedFund();
succeeds(await real.token('approve', [real.contract, stake], a));
await rejectedFund(terms, signature, other); await rejectedFund(terms, signature, a, 1n);
for (const changes of [{ stakeWei: stake + 1n }, { playerA: other.address }, { playerB: other.address }, { fundingDeadline: 1301 }, { refundAfter: 2001 }, { matchId: id('altered') }])
  await rejectedFund({ ...terms, ...changes });
for (const changes of [{ matchId: ZeroHash }, { playerB: a.address }, { playerA: ZeroAddress }, { playerB: ZeroAddress }, { playerB: real.contract },
  { stakeWei: 0n }, { stakeWei: 1n << 255n }, { fundingDeadline: 0 }, { fundingDeadline: 2000 }, { refundAfter: 1299 }]) {
  const invalid = { ...terms, ...changes }; await rejectedFund(invalid, await real.sign(invalid));
}
await rejectedFund(terms, await real.sign(terms, other));
for (const domain of [{ name: 'MossvaleTokenAuction' }, { version: '2' }, { chainId: 46630 }, { verifyingContract: other.address }])
  await rejectedFund(terms, await real.sign(terms, authority, domain));
await rejectedFund(terms, '0x1234');
const order = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
const highSignature = signature.slice(0, 66) + toBeHex(order - BigInt('0x' + signature.slice(66, 130)), 32).slice(2)
  + (signature.slice(130) === '1b' ? '1c' : '1b');
await rejectedFund(terms, highSignature);
await rejectedFund(terms, signature.slice(0, 130) + '00');
timestamp = 1301; await rejectedFund(); timestamp = 1000;
succeeds(await real.call('fund', [terms, signature], a), 'first real stake');
assert.deepEqual([...await real.read('matches', [terms.matchId])], [digest, 1n, false]);
await rejectedFund();
const replacement = { ...terms, stakeWei: stake / 2n }; await rejectedFund(replacement, await real.sign(replacement));
fails(await real.call('settle', [terms, a.address, await real.outcome(terms, a.address)]), 'winner needs both stakes');
fails(await real.call('refund', [terms]), 'early refund rejected');
succeeds(await real.fund(terms, b), 'second real stake');
assert.deepEqual([...await real.read('matches', [terms.matchId])], [digest, 3n, false]);
const rejectedResult = async (winner, sig) => {
  const before = await real.balances(); fails(await real.call('settle', [terms, winner, sig]), 'invalid outcome rejected');
  assert.deepEqual(await real.balances(), before); assert.equal((await real.read('matches', [terms.matchId]))[2], false);
};
await rejectedResult(other.address, await real.outcome(terms, other.address));
await rejectedResult(a.address, await real.outcome(terms, b.address));
await rejectedResult(a.address, await real.outcome(terms, a.address, other));
await rejectedResult(a.address, await real.outcome(terms, a.address, authority, { termsHash: ZeroHash }));
await rejectedResult(a.address, await real.outcome(terms, a.address, authority, { matchId: id('other-match') }));
await rejectedResult(a.address, await real.outcome(terms, a.address, authority, {}, { chainId: 46630 }));
await rejectedResult(a.address, signature);
await rejectedResult(a.address, '0x');
timestamp = 1301; fails(await real.call('refund', [terms]), 'fully funded match waits for result deadline'); timestamp = 1000;
const outcome = await real.outcome(terms, a.address);
timestamp = 2000; await rejectedResult(a.address, outcome); timestamp = 1999;
const result = await real.call('settle', [terms, a.address, outcome], other); succeeds(result, 'anyone can submit signed winner');
const tax = stake * 2n / 20n, share = tax / 10n, burned = tax - share * 2n;
assert.deepEqual(await real.balances(), [initial + stake - tax, initial - stake, 0n, share, share, initial * 2n - burned]);
assert.equal((await real.read('matches', [terms.matchId]))[2], true);
const event = result.execResult.logs.map(([contract, topics, data]) => ({ address: bytesToHex(contract), topics: topics.map(bytesToHex), data: bytesToHex(data) }))
  .filter(log => log.address.toLowerCase() === real.contract.toLowerCase()).map(log => abi.parseLog(log)).find(log => log.name === 'Settled');
assert.equal(event.args.winner, a.address); assert.equal(event.args.payout, stake * 2n - tax); assert.equal(event.args.burned, burned);
fails(await real.call('settle', [terms, a.address, outcome]), 'outcome replay rejected');
fails(await real.call('settle', [terms, b.address, await real.outcome(terms, b.address)]), 'conflicting signed outcome rejected');
timestamp = 2100; fails(await real.call('refund', [terms]), 'paid match cannot refund');
timestamp = 1000; fails(await real.fund(terms), 'paid match cannot fund again');
assert.deepEqual(await real.balances(), [initial + stake - tax, initial - stake, 0n, share, share, initial * 2n - burned]);

for (const funded of [0, 1, 2, 3]) {
  const draw = real.terms(), before = await real.balances();
  if (funded & 1) succeeds(await real.fund(draw, a));
  if (funded & 2) succeeds(await real.fund(draw, b));
  succeeds(await real.call('settle', [draw, ZeroAddress, await real.outcome(draw, ZeroAddress)]), 'signed draw/cancel refunds each funded side');
  assert.deepEqual(await real.balances(), before, 'draw restores balances without tax');
  fails(await real.fund(draw), 'canceled terms cannot receive a late deposit');
  fails(await real.call('settle', [draw, ZeroAddress, await real.outcome(draw, ZeroAddress)]), 'draw replay rejected');
}
for (const funded of [1, 2, 3]) {
  const abandoned = real.terms(), before = await real.balances();
  if (funded & 1) succeeds(await real.fund(abandoned, a));
  if (funded & 2) succeeds(await real.fund(abandoned, b));
  timestamp = funded === 3 ? 1999 : 1300;
  fails(await real.call('refund', [abandoned]), 'refund boundary is not early');
  timestamp++;
  succeeds(await real.call('refund', [abandoned], other), 'permissionless timeout refunds');
  assert.deepEqual(await real.balances(), before, 'timeout preserves complete stakes and supply');
  fails(await real.call('refund', [abandoned]), 'timeout replay rejected');
  fails(await real.call('settle', [abandoned, a.address, await real.outcome(abandoned, a.address)]), 'timed-out match cannot settle');
  timestamp = 1000; fails(await real.fund(abandoned), 'refund cannot be reopened');
}
timestamp = 2100; fails(await real.call('refund', [real.terms()]), 'unsigned unknown match cannot be closed'); timestamp = 1000;
for (const tinyStake of [1n, 9n, 10n, 109n]) {
  const tiny = real.terms({ stakeWei: tinyStake }), before = await real.balances(), tax = tinyStake * 2n / 20n, share = tax / 10n;
  succeeds(await real.fund(tiny, a)); succeeds(await real.fund(tiny, b));
  succeeds(await real.call('settle', [tiny, b.address, await real.outcome(tiny, b.address)]));
  assert.deepEqual(await real.balances(), [before[0] - tinyStake, before[1] + tinyStake - tax, 0n,
    before[3] + share, before[4] + share, before[5] - tax + 2n * share], 'wei rounding gives tax remainder to burn');
}

const evil = await setup(`0x${mock.evm.deployedBytecode.object}`), escrow = evil.terms();
for (const mode of [1, 2, 3]) {
  succeeds(await evil.token('setModes', [mode, 0, 0]));
  const before = await evil.balances(); fails(await evil.fund(escrow), 'fee/extra debit/false token deposit rejected');
  assert.deepEqual(await evil.balances(), before); assert.equal((await evil.read('matches', [escrow.matchId]))[0], ZeroHash);
}
succeeds(await evil.token('setModes', [0, 0, 0]));
const reentry = abi.encodeFunctionData('refund', [escrow]);
succeeds(await evil.token('setAttack', [evil.contract, reentry, false]));
succeeds(await evil.fund(escrow), 'deposit blocks nested refund'); succeeds(await evil.fund(escrow, b));
const evilOutcome = await evil.outcome(escrow, a.address), deposited = await evil.balances();
const rejectedSettlement = async () => {
  fails(await evil.call('settle', [escrow, a.address, evilOutcome]), 'invalid token settlement rejected');
  assert.deepEqual(await evil.balances(), deposited, 'all tax, payout and token supply changes roll back');
  assert.equal((await evil.read('matches', [escrow.matchId]))[2], false, 'rollback keeps escrow recoverable');
};
for (const mode of [1, 2, 3, 4]) { succeeds(await evil.token('setModes', [0, 0, mode])); await rejectedSettlement(); }
for (const mode of [1, 2, 3]) { succeeds(await evil.token('setModes', [0, mode, 0])); await rejectedSettlement(); }
succeeds(await evil.token('setModes', [0, 0, 0]));
for (const recipient of [treasury.address, MOSS_AUCTION_DEV_TEAM, a.address]) {
  succeeds(await evil.token('setFailedRecipient', [recipient])); await rejectedSettlement();
}
succeeds(await evil.token('setFailedRecipient', [ZeroAddress]));
succeeds(await evil.token('setAttack', [evil.contract, abi.encodeFunctionData('settle', [escrow, a.address, evilOutcome]), true]));
succeeds(await evil.call('settle', [escrow, a.address, evilOutcome]), 'burn blocks nested settlement');

const cancel = evil.terms(); succeeds(await evil.fund(cancel, a)); succeeds(await evil.fund(cancel, b));
const refundBefore = await evil.balances();
succeeds(await evil.token('setFailedRecipient', [b.address])); timestamp = 2000;
fails(await evil.call('refund', [cancel]), 'second refund transfer failure rolls back first');
assert.deepEqual(await evil.balances(), refundBefore); assert.equal((await evil.read('matches', [cancel.matchId]))[2], false);
succeeds(await evil.token('setFailedRecipient', [ZeroAddress]));
succeeds(await evil.token('setAttack', [evil.contract, abi.encodeFunctionData('refund', [cancel]), false]));
succeeds(await evil.call('refund', [cancel]), 'refund transfer blocks reentrancy');
assert.equal((await evil.read('matches', [cancel.matchId]))[2], true);
assert.equal((await evil.balances())[2], 0n);
console.log('MOSS arena contract: actual MOSS funding/tax/payout, authorization, replay, deadline refunds, exact amounts and adversarial token rollback/reentrancy passed.');
