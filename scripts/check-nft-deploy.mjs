import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { Interface, ContractFactory, getCreateAddress, id, toQuantity } from 'ethers';
import { createNftDeploymentServer, prepareNftDeployment, sendNftDeployment, verifyNftCreation } from './nft-deploy.mjs';
import { NFT_BUYBACK_ADDRESSES as a } from './nft-buyback.mjs';

const config = { wallet: '0x3F62aF0F73db2A0BA8b18082569995e9c20E7D7f', authority: '0xa72E0Da5fA5438ae8156835475BC078BD7c9dE1F' };
const artifacts = Object.fromEntries(['MossvaleBuyBurn', 'MossvaleNFT', 'MossvalePets'].map(name => [name, JSON.parse(readFileSync(new URL(`../public/contracts/${name}.json`, import.meta.url)))]));
const legacyRuntime = readFileSync(new URL('./fixtures/mossvale-nft-v1-runtime.hex', import.meta.url), 'utf8').trim();
const infrastructure = JSON.parse(readFileSync(new URL('./fixtures/nft-setup-infrastructure-runtime.json', import.meta.url)));
const block = { number: '0x10000', hash: id('canonical deployment'), timestamp: toQuantity(Math.floor(Date.now() / 1000)) };
const head = { ...block, number: '0x10100', hash: id('current verification head') };
const addresses = Object.fromEntries(['receiver', 'pets', 'houses'].map((stage, nonce) => [stage, getCreateAddress({ from: config.wallet, nonce })]));
const hashes = Object.fromEntries(['receiver', 'pets', 'houses'].map(stage => [stage, id(`deployment ${stage}`)]));
const petsV2 = getCreateAddress({ from: config.wallet, nonce: 3 }), expansionHash = id('expandable pets deployment');
const creations = {};
for (const [nonce, stage] of ['receiver', 'pets', 'houses', 'petsV2'].entries()) {
  const artifact = stage === 'receiver' ? artifacts.MossvaleBuyBurn : stage === 'petsV2' ? artifacts.MossvalePets : artifacts.MossvaleNFT;
  const hash = stage === 'petsV2' ? expansionHash : hashes[stage], target = stage === 'petsV2' ? petsV2 : addresses[stage], kind = stage === 'houses' ? 'houses' : 'pets';
  const args = stage === 'receiver' ? [config.wallet, a.router, a.weth, a.permit2]
    : [stage === 'petsV2' ? addresses.pets : stage === 'houses', config.authority, addresses.receiver, `https://mossvale.world/nfts/${kind}/`, `https://mossvale.world/nfts/${kind}/collection.json`];
  const transaction = { from: config.wallet, ...(await new ContractFactory(artifact.abi, artifact.bytecode).getDeployTransaction(...args)), value: '0x0', chainId: '0x1237' };
  creations[hash] = { stage, reviewed: { transaction, runtimeCodeHash: artifact.runtimeCodeHash },
    tx: { hash, from: config.wallet, to: null, input: transaction.data, nonce: toQuantity(nonce), value: '0x0', chainId: '0x1237', blockHash: block.hash, blockNumber: block.number },
    receipt: { transactionHash: hash, from: config.wallet, to: null, status: '0x1', contractAddress: target, blockHash: block.hash, blockNumber: block.number } };
}
let change = {}, calls = [], expansionMode = false;
const provider = { async send(method, params) {
  calls.push(method);
  if (method === 'eth_chainId') return change.chain || '0x1237';
  if (method === 'eth_getTransactionReceipt') return change.pending ? null : { ...creations[params[0]].receipt, ...change.receipt };
  if (method === 'eth_getTransactionByHash') return { ...creations[params[0]].tx, ...change.tx };
  if (method === 'eth_getBlockByNumber') {
    assert.notEqual(params[0], 'finalized', 'mined deployments must progress even when finalized RPC is unavailable');
    if (params[0] === 'latest') return { ...head, ...change.head };
    if (params[0] === head.number) return { ...head, ...(change.headReorg ? { hash: id('head fork') } : {}) };
    assert.equal(params[0], block.number);
    return { ...block, ...(change.reorg ? { hash: id('fork') } : {}) };
  }
  if (method === 'eth_estimateGas') return '0x186a0';
  if (method === 'eth_gasPrice') return '0x3b9aca00';
  if (method === 'eth_getBalance') return '0xde0b6b3a7640000';
  if (method === 'eth_getCode') {
    assert.deepEqual(params[1], { blockHash: head.hash, requireCanonical: true }, 'historical contract state is unavailable; verify current canonical state');
    if (change.runtime) return '0x';
    if (params[0] === a.moss) return readFileSync(new URL('./fixtures/moss-token-runtime.hex', import.meta.url), 'utf8').trim();
    const routing = Object.entries(a).find(([, address]) => address === params[0])?.[0];
    if (infrastructure[routing]) return infrastructure[routing];
    if (params[0] === petsV2) return artifacts.MossvalePets.deployedBytecode;
    if (expansionMode && params[0] === addresses.pets) return legacyRuntime;
    return params[0] === addresses.receiver ? artifacts.MossvaleBuyBurn.deployedBytecode : artifacts.MossvaleNFT.deployedBytecode;
  }
  if (method === 'eth_call') {
    if (!params[0].to) { assert.equal(params[0].data, creations[expansionHash].tx.input); return artifacts.MossvalePets.deployedBytecode; }
    const receiver = params[0].to === addresses.receiver, abi = new Interface((receiver ? artifacts.MossvaleBuyBurn : params[0].to === petsV2 ? artifacts.MossvalePets : artifacts.MossvaleNFT).abi);
    const name = abi.parseTransaction(params[0]).name, kind = params[0].to === addresses.houses ? 'houses' : 'pets';
    const values = { owner: [config.wallet], authority: [config.authority], paymentToken: [a.moss], swapRouter: [a.router], wrappedNative: [a.weth], permit2: [a.permit2],
      feeReceiver: [addresses.receiver], houseCollection: [kind === 'houses'], name: [kind === 'houses' ? 'Mossvale Houses' : 'Mossvale Pets'],
      royaltyInfo: [addresses.receiver, 500n], contractURI: [`https://mossvale.world/nfts/${kind}/collection.json`], legacyCollection: [addresses.pets] };
    return abi.encodeFunctionResult(name, values[name]);
  }
  throw Error(`Unexpected RPC ${method}`);
} };

for (const stage of ['receiver', 'pets', 'houses']) assert.equal(await verifyNftCreation(provider, hashes[stage], creations[hashes[stage]].reviewed), addresses[stage]);
const reviewed = creations[hashes.receiver].reviewed;
for (const mutation of [{ chain: '0x1' }, { pending: true }, { reorg: true }, { headReorg: true }, { runtime: true },
  { head: { number: '0xffff' } }, { head: { timestamp: toQuantity(Math.floor(Date.now() / 1000) - 121) } },
  { head: { hash: '0x' } }, { head: { number: 'invalid' } },
  { receipt: { status: '0x0' } }, { receipt: { transactionHash: hashes.pets } }, { receipt: { to: addresses.pets } }, { receipt: { contractAddress: addresses.pets } },
  { receipt: { from: config.authority } }, { tx: { hash: hashes.pets } }, { tx: { from: config.authority } }, { tx: { input: '0x1234' } },
  { tx: { to: addresses.receiver } }, { tx: { value: '0x1' } }, { tx: { chainId: '0x1' } }, { tx: { blockHash: hashes.pets } }, { tx: { nonce: '0x1' } }]) {
  change = mutation; await assert.rejects(verifyNftCreation(provider, hashes.receiver, reviewed), JSON.stringify(mutation));
}
change = {};
for (const [history, stage] of [[{}, 'receiver'], [{ receiver: hashes.receiver }, 'pets'], [{ receiver: hashes.receiver, pets: hashes.pets }, 'houses'], [hashes, null]]) {
  const review = await prepareNftDeployment(provider, config, history);
  assert.equal(review.stage, stage);
  if (stage) { assert.equal(review.deployment.transaction.data, creations[hashes[stage]].tx.input); assert.equal(review.gas.gasLimit, '120000'); }
  else assert.deepEqual(review.addresses, addresses);
}
for (const history of [{ pets: hashes.pets }, { receiver: hashes.receiver, houses: hashes.houses }, { unknown: hashes.receiver }])
  await assert.rejects(prepareNftDeployment(provider, config, history));
const expansionConfig = { ...config, ...addresses, expandPets: true };
expansionMode = true;
const expansionReview = await prepareNftDeployment(provider, expansionConfig);
assert.equal(expansionReview.stage, 'petsV2');
assert.equal(expansionReview.deployment.transaction.data, creations[expansionHash].tx.input, 'one exact V2 constructor');
assert.deepEqual(expansionReview.addresses, addresses, 'original addresses are retained');
const expanded = await prepareNftDeployment(provider, expansionConfig, { petsV2: expansionHash });
assert.equal(expanded.stage, null); assert.deepEqual(expanded.addresses, { ...addresses, petsV2 });
assert.equal(expanded.transactions.length, 0, 'verified V2 history never prepares another deployment');
for (const history of [{ receiver: hashes.receiver }, { petsV2: hashes.pets }])
  await assert.rejects(prepareNftDeployment(provider, expansionConfig, history), 'wrong history or different creation rejected');
expansionMode = false;
assert(calls.every(method => !method.includes('sendTransaction') && !method.includes('sign')), 'server only reads the chain');

let saved, sends = 0, walletChange = {};
const wallet = { async request({ method }) {
  if (method === 'eth_accounts') return [walletChange.account || config.wallet];
  if (method === 'eth_chainId') return walletChange.chain || '0x1237';
  assert.equal(method, 'eth_sendTransaction');
  assert(saved?.attempt && !saved.attempt.hash, 'submission is persisted before wallet request'); sends++;
  if (walletChange.error) throw walletChange.error;
  return walletChange.hash || hashes.receiver;
} };
const persist = state => { saved = structuredClone(state); };
const state = { hashes: {}, attempt: null };
await sendNftDeployment(wallet, state, 'receiver', reviewed.transaction, persist);
assert.equal(saved.hashes.receiver, hashes.receiver); assert.equal(sends, 1);
await assert.rejects(sendNftDeployment(wallet, structuredClone(saved), 'receiver', reviewed.transaction, persist));
assert.equal(sends, 1, 'reload cannot repeat a known submission');
for (const wrong of [{ account: config.authority }, { chain: '0x1' }]) {
  walletChange = wrong; await assert.rejects(sendNftDeployment(wallet, { hashes: {} }, 'receiver', reviewed.transaction, persist));
  assert.equal(sends, 1);
}
walletChange = { error: Error('provider disconnected') };
await assert.rejects(sendNftDeployment(wallet, { hashes: {} }, 'receiver', reviewed.transaction, persist));
assert(saved.attempt && !saved.attempt.hash);
await assert.rejects(sendNftDeployment(wallet, structuredClone(saved), 'receiver', reviewed.transaction, persist));
assert.equal(sends, 2, 'unknown submission remains blocked after reload');
walletChange = { error: Object.assign(Error('Rejected'), { code: 4001 }) };
await assert.rejects(sendNftDeployment(wallet, { hashes: {} }, 'receiver', reviewed.transaction, persist));
assert.equal(saved.attempt, null, 'explicit wallet rejection permits a new review');
walletChange = {};
const before = sends;
await assert.rejects(sendNftDeployment(wallet, { hashes: {} }, 'receiver', reviewed.transaction, () => { throw Error('storage unavailable'); }));
assert.equal(sends, before, 'no durable recovery storage means no wallet request');

const server = createNftDeploymentServer(provider, config);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const origin = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(origin);
  assert.equal(page.status, 200); assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const html = await page.text(); assert(html.includes(config.wallet)); assert(!html.includes('openAuctions'));
  const post = (headers, body = { hashes: {} }) => fetch(`${origin}/review`, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal((await post({ Origin: 'https://evil.example', 'Content-Type': 'application/json' })).status, 403);
  assert.equal((await post({ 'Content-Type': 'application/json' })).status, 403);
  assert.equal((await post({ Origin: origin, 'Content-Type': 'text/plain' })).status, 403);
  const reboundStatus = await new Promise((resolve, reject) => {
    request(origin, { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject).end();
  });
  assert.equal(reboundStatus, 403);
  assert.equal((await post({ Origin: origin, 'Content-Type': 'application/json' }, { hashes: {}, wallet: config.authority })).status, 400);
  const response = await post({ Origin: origin, 'Content-Type': 'application/json' });
  assert.equal(response.status, 200); assert.equal((await response.json()).stage, 'receiver');
} finally { await new Promise(resolve => server.close(resolve)); }
expansionMode = true;
const expansionServer = createNftDeploymentServer(provider, expansionConfig);
await new Promise(resolve => expansionServer.listen(0, '127.0.0.1', resolve));
try {
  const origin = `http://127.0.0.1:${expansionServer.address().port}`, html = await (await fetch(origin)).text();
  assert.match(html, /one expandable Mossvale Pets/); assert.match(html, /:pets-v2:/);
  const review = await fetch(`${origin}/review`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ hashes: {} }) });
  assert.equal(review.status, 200); assert.equal((await review.json()).stage, 'petsV2', 'server preserves expansion configuration');
} finally { await new Promise(resolve => expansionServer.close(resolve)); }
console.log('NFT wallet handoff passed: exact single V2 expansion, original three-stage deployment, canonical receipts and runtime, gas review, persisted unknown-send guards, wallet/account checks, local origin restriction, and read-only server RPC.');
