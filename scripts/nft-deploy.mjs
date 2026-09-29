import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { JsonRpcProvider, getAddress, getCreateAddress, keccak256, toQuantity, ZeroAddress } from 'ethers';
import { prepareNftSetup } from './nft-setup.mjs';

const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const hashPattern = /^0x[\da-f]{64}$/i;

export async function verifyNftCreation(provider, hash, reviewed) {
  if (!hashPattern.test(hash)) throw Error('Enter the full deployment transaction hash from the explorer.');
  if (BigInt(await provider.send('eth_chainId', [])) !== 4663n) throw Error('Wrong RPC chain.');
  const receipt = await provider.send('eth_getTransactionReceipt', [hash]);
  if (!receipt) throw Error('Transaction receipt is pending or unavailable. Do not submit another deployment.');
  const tx = await provider.send('eth_getTransactionByHash', [hash]);
  const expected = reviewed.transaction;
  if (!tx || !same(tx.hash, hash) || !same(receipt.transactionHash, hash) || receipt.status !== '0x1'
      || tx.to !== null || receipt.to !== null || !same(tx.from, expected.from) || !same(receipt.from, expected.from)
      || !same(tx.input, expected.data) || BigInt(tx.value) !== 0n || BigInt(tx.chainId) !== 4663n
      || !same(tx.blockHash, receipt.blockHash) || tx.blockNumber !== receipt.blockNumber
      || !hashPattern.test(receipt.blockHash) || !/^0x[\da-f]+$/i.test(receipt.blockNumber))
    throw Error('Receipt is not the successful, exact reviewed creation from the deployment wallet. Do not retry automatically.');
  const contract = getAddress(receipt.contractAddress);
  if (contract === ZeroAddress || !same(contract, getCreateAddress({ from: expected.from, nonce: BigInt(tx.nonce) })))
    throw Error('Creation address does not match the sender and transaction nonce.');
  const head = await provider.send('eth_getBlockByNumber', ['latest', false]);
  if (!hashPattern.test(head?.hash || '') || !/^0x[\da-f]+$/i.test(head?.number || '')
      || !/^0x[\da-f]+$/i.test(head?.timestamp || '') || BigInt(head.number) < BigInt(receipt.blockNumber)
      || Math.abs(Number(BigInt(head.timestamp)) * 1000 - Date.now()) > 120000)
    throw Error('A fresh chain head at or after the deployment block is required. Refresh verification.');
  // Current state avoids requiring archive RPC data for an older creation block.
  const runtime = await provider.send('eth_getCode', [contract, { blockHash: head.hash, requireCanonical: true }]);
  if (keccak256(runtime) !== reviewed.runtimeCodeHash) throw Error('Created runtime differs from the reviewed contract.');
  const [canonical, currentHead] = await Promise.all([
    provider.send('eth_getBlockByNumber', [receipt.blockNumber, false]),
    provider.send('eth_getBlockByNumber', [head.number, false]),
  ]);
  if (!same(canonical?.hash, receipt.blockHash) || canonical.number !== receipt.blockNumber
      || !same(currentHead?.hash, head.hash) || currentHead.number !== head.number)
    throw Error('Deployment or verification block changed. Keep its hash and refresh verification.');
  return contract;
}

export async function prepareNftDeployment(provider, config, hashes = {}) {
  const stages = config.expandPets ? ['petsV2'] : ['receiver', 'pets', 'houses'];
  if (!hashes || Array.isArray(hashes) || typeof hashes !== 'object' || Object.keys(hashes).some(key => !stages.includes(key)))
    throw Error('Invalid deployment history.');
  const addresses = config.expandPets ? { receiver: config.receiver, pets: config.pets, houses: config.houses } : {};
  for (const stage of stages) {
    const review = await prepareNftSetup(provider, { ...config, ...addresses });
    const deployment = review.transactions[0];
    if (!hashes[stage]) {
      if (stages.slice(stages.indexOf(stage) + 1).some(next => hashes[next])) throw Error('Recover the earlier deployment hash first.');
      const transaction = { ...deployment.transaction };
      const estimate = BigInt(await provider.send('eth_estimateGas', [transaction]));
      const gasPrice = BigInt(await provider.send('eth_gasPrice', []));
      if (estimate <= 0n || gasPrice <= 0n) throw Error('A usable deployment gas estimate is required.');
      transaction.gas = toQuantity((estimate * 120n + 99n) / 100n);
      const balance = await provider.send('eth_getBalance', [config.wallet, 'latest']);
      return { ...review, transactions: undefined, addresses, stage, deployment: { ...deployment, transaction },
        gas: { estimatedUnits: estimate.toString(), gasLimit: BigInt(transaction.gas).toString(), priceWei: gasPrice.toString(),
          estimatedFeeWei: (estimate * gasPrice).toString(), balanceWei: BigInt(balance).toString() }, reviewedAt: Date.now() };
    }
    addresses[stage] = await verifyNftCreation(provider, hashes[stage], deployment);
  }
  const review = await prepareNftSetup(provider, { ...config, ...addresses });
  return { ...review, addresses, stage: null, reviewedAt: Date.now() };
}

// Persist before asking the wallet: a reload or ambiguous provider error must never enable a duplicate send.
export async function sendNftDeployment(ethereum, state, stage, transaction, persist) {
  if (state.attempt || state.hashes[stage]) throw Error('Recover or verify the existing submission before continuing.');
  const accounts = await ethereum.request({ method: 'eth_accounts' });
  if (accounts[0]?.toLowerCase() !== transaction.from.toLowerCase()
      || BigInt(await ethereum.request({ method: 'eth_chainId' })) !== 4663n)
    throw Error('Select the reviewed deployment wallet on Robinhood Chain mainnet (4663).');
  state.attempt = { stage, transaction, startedAt: Date.now() }; persist(state);
  let hash;
  try { hash = await ethereum.request({ method: 'eth_sendTransaction', params: [transaction] }); }
  catch (error) {
    if (error.code === 4001) { state.attempt = null; persist(state); }
    throw error;
  }
  if (!/^0x[\da-f]{64}$/i.test(hash)) throw Error('Wallet returned no usable hash. Recover it from wallet activity or the explorer.');
  state.attempt.hash = hash; state.hashes[stage] = hash; persist(state);
  return hash;
}

function client(config, sendNftDeployment) {
  const $ = id => document.getElementById(id), key = `mossvale-nft-deployment:4663:${config.wallet.toLowerCase()}:${config.authority.toLowerCase()}${config.expandPets ? `:pets-v2:${config.pets.toLowerCase()}` : ''}`;
  const names = { receiver: 'MOSS buy/burn receiver', pets: 'Mossvale Pets', houses: 'Mossvale Houses', petsV2: 'expandable Mossvale Pets' };
  let review, busy = false;
  const load = () => JSON.parse(localStorage.getItem(key) || '{"hashes":{},"attempt":null}');
  const save = state => { localStorage.setItem(key, JSON.stringify(state)); if (localStorage.getItem(key) !== JSON.stringify(state)) throw Error('Browser recovery storage is unavailable.'); };
  const eth = wei => { const value = BigInt(wei); return `${value / 10n ** 18n}.${(value % 10n ** 18n).toString().padStart(18, '0')}`; };
  const status = text => { $('status').textContent = text; };
  async function api(state) {
    const response = await fetch('/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hashes: state.hashes }) });
    const result = await response.json(); if (!response.ok) throw Error(result.error); return result;
  }
  function controls() {
    const state = load();
    $('deploy').disabled = busy || !review?.stage || !!state.attempt || !!state.hashes[review.stage];
    $('deploy').textContent = review?.stage ? `Deploy ${names[review.stage]}` : review ? 'Deployment complete' : 'Review deployment first';
    $('recovery').hidden = !state.attempt;
    $('saved').textContent = JSON.stringify(state, null, 2);
    for (const id of ['connect', 'refresh', 'recover']) $(id).disabled = busy;
  }
  async function refresh() {
    review = null;
    const state = load();
    const result = await api(state);
    if (state.attempt && result.addresses[state.attempt.stage]) { state.attempt = null; save(state); }
    review = result;
    $('review').textContent = JSON.stringify(result, null, 2);
    $('terms').textContent = result.stage
      ? `Next: ${names[result.stage]}. Network: Robinhood mainnet (4663). ETH sent to contract: 0. Estimated network fee: ${eth(result.gas.estimatedFeeWei)} ETH at the current gas price; gas limit: ${result.gas.gasLimit}. Wallet balance: ${eth(result.gas.balanceWei)} ETH. Your wallet shows the final network fee.`
      : config.expandPets ? 'Expanded Pets and the existing contracts are verified. Save these addresses for all three realms. Existing house auctions are unchanged.'
      : 'All three contracts are verified. Save these addresses for all three realms. House auctions remain unopened.';
    if (!state.attempt) status(result.stage ? 'Review the transaction below, then approve deployment in your wallet.' : 'Contract deployment complete. Realm activation and OpenSea setup are the next steps.');
  }
  async function run(work) {
    if (busy) return; busy = true; controls();
    try { await work(); } catch (error) { status(error.message); }
    finally { busy = false; controls(); }
  }
  $('connect').onclick = () => run(async () => {
    if (!window.ethereum) throw Error('Open this local page in a browser with an Ethereum wallet extension.');
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (accounts[0]?.toLowerCase() !== config.wallet.toLowerCase()) throw Error(`Select deployment wallet ${config.wallet}.`);
    if (BigInt(await window.ethereum.request({ method: 'eth_chainId' })) !== 4663n)
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x1237' }] });
    if (BigInt(await window.ethereum.request({ method: 'eth_chainId' })) !== 4663n) throw Error('Select Robinhood Chain mainnet (4663).');
    await refresh();
  });
  $('refresh').onclick = () => run(refresh);
  $('deploy').onclick = () => run(async () => {
    if (!window.ethereum || !navigator.locks) throw Error('Use an Ethereum wallet browser that supports Web Locks.');
    await navigator.locks.request(key, { ifAvailable: true }, async lock => {
      if (!lock) throw Error('Another tab is handling this deployment.');
      const state = load(), previous = review;
      if (state.attempt) throw Error('Recover or verify the previous submission first.');
      const fresh = await api(state);
      if (!fresh.stage || previous?.stage !== fresh.stage || previous.deployment.transaction.data !== fresh.deployment.transaction.data)
        throw Error('Deployment stage changed. Refresh and review again.');
      if (BigInt(fresh.gas.balanceWei) < BigInt(fresh.deployment.transaction.gas) * BigInt(fresh.gas.priceWei))
        throw Error('The deployment wallet needs more Robinhood ETH for the estimated gas limit.');
      status('Review the contract creation and network fee in your wallet.');
      const hash = await sendNftDeployment(window.ethereum, state, fresh.stage, fresh.deployment.transaction, save);
      status(`Submitted ${hash}. Keep this page and use Refresh verification once the transaction is mined. Do not deploy again.`);
      await refresh();
    });
  });
  $('recover').onclick = () => run(async () => {
    if (!navigator.locks) throw Error('This browser cannot lock deployment recovery.');
    await navigator.locks.request(key, { ifAvailable: true }, async lock => {
      if (!lock) throw Error('Another tab is handling this deployment.');
      const state = load(), hash = $('hash').value.trim();
      if (!state.attempt || !/^0x[\da-f]{64}$/i.test(hash)) throw Error('Enter the full transaction hash for the saved pending stage.');
      state.attempt.hash = hash; state.hashes[state.attempt.stage] = hash; save(state);
      await refresh();
    });
  });
  window.addEventListener('storage', () => { review = null; controls(); status('Deployment history changed in another tab. Refresh verification.'); });
  try { save(load()); controls(); void run(refresh); } catch (error) { status(error.message); $('deploy').disabled = true; }
}

export function nftDeployPage(config, nonce) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mossvale NFT deployment</title>
<style nonce="${nonce}">body{max-width:850px;margin:40px auto;padding:0 20px;background:#13251d;color:#f1ecd9;font:16px/1.5 system-ui}h1{color:#ead299}button,input{font:inherit;padding:12px;border-radius:4px;border:1px solid #9aa991}button{margin:8px 8px 8px 0;cursor:pointer}button:disabled{opacity:.5;cursor:default}input{width:90%;max-width:700px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#09180f;padding:16px}a{color:#ead299}:focus-visible{outline:3px solid #e9bf53;outline-offset:3px}#status{padding:14px;background:#263e2e}</style>
<h1>Mossvale NFT deployment</h1><p>${config.expandPets ? 'Deploy one expandable Mossvale Pets collection with all 18 current species and future species support. Existing NFTs remain usable; holders can optionally migrate individual tokens. The original collections and shared royalty receiver remain configured.' : 'Deploy the shared MOSS buy/burn receiver, Mossvale Pets, then Mossvale Houses.'} Each step requires your wallet approval and pays network gas. Both collections specify 5% resale royalties. This page does not open auctions or configure fee enforcement.</p>
<p>Deployer/admin: <strong>${config.wallet}</strong><br>Game authority: <strong>${config.authority}</strong></p>
<button id="connect">Connect deployment wallet</button><button id="refresh">Refresh verification</button><button id="deploy" disabled>Review deployment first</button>
<p id="status" role="status" aria-live="polite">Loading verified deployment review…</p><p id="terms"></p>
<section id="recovery" hidden><h2>Pending submission</h2><p>A wallet request was started. Reloading cannot start another. Find its hash in wallet activity or <a href="https://robinhoodchain.blockscout.com/address/${config.wallet}" target="_blank" rel="noopener noreferrer">the deployer’s explorer history</a>, then verify it here. If no hash is available, keep this state and have the nonce checked before retrying. Do not clear browser storage or use another browser to retry.</p><label for="hash">Deployment transaction hash</label><br><input id="hash" autocomplete="off" spellcheck="false"><button id="recover">Verify recovered hash</button></section>
<details><summary>Exact unsigned transaction and configuration</summary><pre id="review"></pre></details><details><summary>Saved deployment history — retain a copy</summary><pre id="saved"></pre></details>
<script nonce="${nonce}">(${client.toString()})(${JSON.stringify(config)}, ${sendNftDeployment.toString()});</script></html>`;
}

export function createNftDeploymentServer(provider, config) {
  config = { wallet: getAddress(config.wallet), authority: getAddress(config.authority), ...(config.expandPets ? {
    expandPets: true, receiver: getAddress(config.receiver), pets: getAddress(config.pets), houses: getAddress(config.houses),
  } : {}) };
  if (config.wallet === ZeroAddress || config.authority === ZeroAddress) throw Error('Public addresses must be nonzero.');
  const nonce = randomBytes(24).toString('base64');
  const server = createServer(async (req, res) => {
    const port = server.address().port, origin = `http://127.0.0.1:${port}`;
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`);
    if (req.headers.host !== `127.0.0.1:${port}` || req.headers.origin && req.headers.origin !== origin) { res.writeHead(403).end(); return; }
    if (req.method === 'GET' && req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(nftDeployPage(config, nonce)); return; }
    if (req.method !== 'POST' || req.url !== '/review' || req.headers.origin !== origin || req.headers['content-type'] !== 'application/json') { res.writeHead(403).end(); return; }
    try {
      let body = ''; for await (const part of req) { body += part; if (body.length > 1024) throw Error('Deployment history is too large.'); }
      const parsed = JSON.parse(body);
      if (Object.keys(parsed).length !== 1 || !Object.hasOwn(parsed, 'hashes')) throw Error('Supply only deployment hashes.');
      const review = await prepareNftDeployment(provider, config, parsed.hashes);
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(review));
    } catch (error) { res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: error.message })); }
  });
  return server;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const { values } = parseArgs({ options: {
    wallet: { type: 'string', default: '0x3F62aF0F73db2A0BA8b18082569995e9c20E7D7f' },
    authority: { type: 'string', default: '0xa72E0Da5fA5438ae8156835475BC078BD7c9dE1F' },
    'expand-pets': { type: 'boolean' }, receiver: { type: 'string' }, pets: { type: 'string' }, houses: { type: 'string' },
    rpc: { type: 'string', default: process.env.NFT_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com' }, port: { type: 'string', default: '5199' },
  } });
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Use a local port from 1024 to 65535.');
  if (values['expand-pets'] ? !values.receiver || !values.pets || !values.houses : values.receiver || values.pets || values.houses)
    throw Error('Supply --expand-pets with all three existing --receiver, --pets and --houses addresses.');
  const provider = new JsonRpcProvider(values.rpc), server = createNftDeploymentServer(provider, { ...values, expandPets: values['expand-pets'] });
  server.listen(port, '127.0.0.1', () => console.log(`Wallet deployment review: http://127.0.0.1:${port} (no server signing or broadcasting)`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); provider.destroy(); });
}
