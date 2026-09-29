import assert from 'node:assert/strict';
import { Interface, Wallet, parseEther, toQuantity, ZeroAddress } from 'ethers';
import { readBalances, readOwnedNfts, prepareTransfer, revalidateTransfer } from '../src/turnkey-management.ts';
import { MOSS_TOKEN } from '../src/auction.ts';

const owner = Wallet.createRandom().address, recipient = Wallet.createRandom().address, pets = Wallet.createRandom().address, houses = Wallet.createRandom().address, foreign = Wallet.createRandom().address;
const config = { petsContract: pets, housesContract: houses };
const abi = new Interface(['function balanceOf(address) view returns(uint256)', 'function transfer(address,uint256) returns(bool)',
  'function ownerOf(uint256) view returns(address)', 'function assets(uint256) view returns(uint256)', 'function safeTransferFrom(address,address,uint256)']);
let eth = parseEther('2'), moss = parseEther('100'), chain = 4663n, base = 100n, tip = 2n, nonce = 3n, gas = 21000n, nftOwner = owner;
const requests = [];
const rpc = async (method, params = []) => {
  requests.push({ method, params: structuredClone(params) });
  if (method === 'eth_chainId') return toQuantity(chain);
  if (method === 'eth_getBalance') { assert.equal(params[0], owner); return toQuantity(eth); }
  if (method === 'eth_getBlockByNumber') return { baseFeePerGas: toQuantity(base) };
  if (method === 'eth_maxPriorityFeePerGas') return toQuantity(tip);
  if (method === 'eth_getTransactionCount') return toQuantity(nonce);
  if (method === 'eth_estimateGas') { assert.equal(params.length, 2, 'manual transfers never override ETH balance'); return toQuantity(gas); }
  assert.equal(method, 'eth_call', 'management never broadcasts or requests sponsored gas');
  const call = abi.parseTransaction(params[0]);
  if (call.name === 'balanceOf') { assert.equal(params[0].to, MOSS_TOKEN.address); assert.equal(call.args[0], owner); return abi.encodeFunctionResult(call.name, [moss]); }
  assert([pets, houses].includes(params[0].to));
  return abi.encodeFunctionResult(call.name, [call.name === 'ownerOf' ? nftOwner : 1n]);
};
const dependencies = { rpc };
assert.deepEqual(await readBalances(owner, dependencies), { address: owner, ethWei: eth.toString(), mossWei: moss.toString() });
const sendEth = { asset: 'eth', from: owner, to: recipient, amount: '1.000000000000000001' };
const prepared = await prepareTransfer(sendEth, config, dependencies);
assert.deepEqual(prepared.transaction, { from: owner, to: recipient, data: '0x', value: '1000000000000000001', chainId: 4663 });
assert.deepEqual(prepared.fees, { funded: false, chainId: 4663, nonce: '0x3', gasLimit: toQuantity(25200), maxFeePerGas: toQuantity(202), maxPriorityFeePerGas: '0x2' });
assert.equal(prepared.maxFeeWei, String(25200n * 202n));
assert.deepEqual(await revalidateTransfer(prepared, config, dependencies), prepared.fees);
for (const amount of ['0', '-1', '1e3', '.1', '1.0000000000000000001', ' 1', '+1', '9'.repeat(78)])
  await assert.rejects(prepareTransfer({ ...sendEth, amount }, config, dependencies));
for (const to of [ZeroAddress, owner, 'invalid']) await assert.rejects(prepareTransfer({ ...sendEth, to }, config, dependencies));
const sendMoss = { ...sendEth, asset: 'moss', amount: '12.500000000000000001' };
const tokenTransfer = await prepareTransfer(sendMoss, config, dependencies);
assert.equal(tokenTransfer.transaction.to, MOSS_TOKEN.address); assert.equal(tokenTransfer.transaction.value, '0');
assert.deepEqual([...abi.decodeFunctionData('transfer', tokenTransfer.transaction.data)], [recipient, parseEther(sendMoss.amount)]);
moss = 1n; await assert.rejects(prepareTransfer(sendMoss, config, dependencies), /enough MOSS/); moss = parseEther('100');
eth = 1n; await assert.rejects(prepareTransfer(sendEth, config, dependencies), /enough ETH/);
await assert.rejects(prepareTransfer(sendMoss, config, dependencies), /Add ETH/); eth = parseEther('2');
// A funded MOSS balance cannot pay ETH fees; the RPC may reject estimation before returning a gas limit.
eth = 0n;
const estimatesBefore = requests.filter(({ method }) => method === 'eth_estimateGas').length;
await assert.rejects(prepareTransfer(sendMoss, config, dependencies), /Add ETH on Robinhood Chain.*network fee/);
assert.equal(requests.filter(({ method }) => method === 'eth_estimateGas').length, estimatesBefore, 'zero ETH fails before estimation');
eth = 1n;
for (const message of ['insufficient funds for transfer', 'insufficient funds for gas * price + value: balance 1']) {
  await assert.rejects(prepareTransfer(sendMoss, config, { rpc: async (method, params) => {
    if (method === 'eth_estimateGas') throw Object.assign(Error(message), { code: -32000 });
    return rpc(method, params);
  } }), /Add ETH on Robinhood Chain.*network fee/);
}
const reverted = Error('execution reverted: transfer blocked');
await assert.rejects(prepareTransfer(sendMoss, config, { rpc: async (method, params) => {
  if (method === 'eth_estimateGas') throw reverted;
  return rpc(method, params);
} }), error => error === reverted, 'other estimation errors remain intact');
eth = parseEther('2');
const nftInput = { asset: 'nft', from: owner, to: recipient, contract: pets, tokenId: '42' };
const petTransfer = await prepareTransfer(nftInput, config, dependencies);
assert.equal(petTransfer.nft.name, 'Moss Fox'); assert.equal(petTransfer.nft.tokenId, '42');
assert.deepEqual([...abi.decodeFunctionData('safeTransferFrom', petTransfer.transaction.data)], [owner, recipient, 42n]);
await assert.rejects(prepareTransfer({ ...nftInput, contract: foreign }, config, dependencies), /configured/);
await assert.rejects(prepareTransfer({ ...nftInput, tokenId: '0' }, config, dependencies), /token ID/);
nftOwner = recipient; await assert.rejects(prepareTransfer(nftInput, config, dependencies), /no longer owns/);
await assert.rejects(revalidateTransfer(petTransfer, config, dependencies), /no longer owns/); nftOwner = owner;
base = 101n; await assert.rejects(revalidateTransfer(prepared, config, dependencies), /changed/);
base = 90n; assert.deepEqual(await revalidateTransfer(prepared, config, dependencies), prepared.fees, 'lower fees never mutate the reviewed envelope');
eth = BigInt(prepared.transaction.value) + BigInt(prepared.maxFeeWei) - 1n;
await assert.rejects(revalidateTransfer(prepared, config, dependencies), /balance or reviewed fee changed/); eth = parseEther('2'); base = 100n;
nonce++; await assert.rejects(revalidateTransfer(prepared, config, dependencies), /changed/); nonce--;
gas = 1000000n; await assert.rejects(prepareTransfer(sendMoss, config, dependencies), /gas limit/); gas = 21000n;
base = 100000000000n; await assert.rejects(prepareTransfer(sendMoss, config, dependencies), /outside/); base = 100n;
chain = 1n; await assert.rejects(prepareTransfer(sendMoss, config, dependencies), /Robinhood Chain/); chain = 4663n;

let pages = 0;
const indexed = { fetch: async url => {
  pages++; assert.equal(url.origin, 'https://robinhoodchain.blockscout.com'); assert.equal(url.searchParams.get('type'), 'ERC-721');
  return { ok: true, json: async () => ({ items: [
    { id: '42', token: { address: pets }, metadata: { name: '<script>unsafe</script>' }, image_url: 'https://foreign.example/tracker' },
    { id: '99', token: { address: foreign } }, { id: '42', token: { address: pets } },
  ], next_page_params: null }) };
}, rpc };
const owned = await readOwnedNfts(owner, config, indexed);
assert.equal(pages, 1); assert.equal(owned.items.length, 1); assert.equal(owned.items[0].name, 'Moss Fox');
assert.deepEqual(Object.keys(owned.items[0]).sort(), ['assetId', 'contract', 'kind', 'legacy', 'name', 'tokenId']);
nftOwner = recipient; const stale = await readOwnedNfts(owner, config, indexed); assert.equal(stale.items.length, 0); assert.equal(stale.truncated, true); nftOwner = owner;
pages = 0;
const bounded = await readOwnedNfts(owner, config, { rpc, fetch: async () => { pages++; return { ok: true, json: async () => ({ items: [], next_page_params: { token_contract_address_hash: pets, token_id: '42', token_type: 'ERC-721' } }) }; } });
assert.equal(pages, 3); assert.equal(bounded.truncated, true);
await assert.rejects(readOwnedNfts(owner, config, { rpc, fetch: async () => ({ ok: false }) }), /unavailable/);
assert.equal((await prepareTransfer(nftInput, config, dependencies)).nft.tokenId, '42', 'manual NFT transfer remains available without an index');
assert(!requests.some(({ method }) => method === 'eth_sendTransaction'));
console.log('Turnkey management passed: exact player-paid ETH/MOSS/NFT sends, on-chain ownership, bounded untrusted discovery, sufficient balances, reviewed fee and nonce rechecks; no funds sent.');
