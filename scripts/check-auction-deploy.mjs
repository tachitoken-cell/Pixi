import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { AbiCoder, ZeroAddress } from 'ethers';

const html = readFileSync(new URL('../public/auction-deploy.html', import.meta.url), 'utf8');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const artifacts = Object.fromEntries(['MossvaleAuction', 'MossvaleTokenAuction'].map(name => [name,
  JSON.parse(readFileSync(new URL(`../public/contracts/${name}.json`, import.meta.url), 'utf8'))]));
const [wallet, authority, treasury, deployed] = [1, 2, 3, 4].map(value => `0x${String(value).padStart(40, '0')}`);
const coder = AbiCoder.defaultAbiCoder();
assert.deepEqual(artifacts.MossvaleTokenAuction.abi.find(entry => entry.type === 'constructor').inputs.map(input => input.type), ['address', 'address']);
assert(artifacts.MossvaleTokenAuction.abi.some(entry => entry.type === 'function' && entry.name === 'devTeam' && entry.inputs.length === 0 && entry.outputs[0]?.type === 'address'), 'compiled contract exposes its fixed dev recipient');
assert.match(html, /id="dev-team"[^>]*>0x6D96b833C760774175Cc6E2c4F7424122EA3798f<\/a>/);
assert.match(html, /1.25% of the purchase price goes to the treasury, 1.25% to the dev team, and 2.5% to burning/);
assert.match(html, /100 MOSS sale pays the seller 95 MOSS, burns 2.5 MOSS, and sends 1\.25 MOSS each/);
assert.match(html, /0.10%, 0.25%, 0.50%, 0.75% and 1.00% of the purchase price/);
assert.match(html, /Existing contracts and pending purchases keep their original terms/);
assert.deepEqual(artifacts.MossvaleTokenAuction.abi.find(entry=>entry.name==='buy').inputs[0].components.slice(-2).map(input=>[input.name,input.type]),[['referrer','address'],['referralBps','uint16']]);
assert.match(html, /Burning reduces the token’s total supply/);

function page(currency = 'moss') {
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id,
    { value: '', disabled: false, hidden: false, textContent: '', append() {} }]));
  const get = id => elements.get(id), calls = [];
  get('currency').value = currency; get('network').value = '4663';
  const artifact = artifacts[currency === 'moss' ? 'MossvaleTokenAuction' : 'MossvaleAuction'];
  runInNewContext(script, {
    URLSearchParams, location: { search: `?authority=${authority}&treasury=${treasury}` },
    document: { getElementById: get, createElement: () => ({}) },
    fetch: async url => {
      assert.equal(url, `/contracts/${artifact.contractName}.json`);
      return { ok: true, json: async () => artifact };
    },
    window: { ethereum: { async request({ method, params }) {
      calls.push({ method, params });
      if (method === 'wallet_switchEthereumChain') return null;
      if (method === 'eth_chainId') return '0x1237';
      if (['eth_requestAccounts', 'eth_accounts'].includes(method)) return [wallet];
      if (method === 'eth_estimateGas') return '0x100000';
      if (method === 'eth_sendTransaction') return `0x${'a'.repeat(64)}`;
      if (method === 'eth_getTransactionReceipt') return { status: '0x1', contractAddress: deployed };
      if (method === 'eth_getCode') return artifact.deployedBytecode;
      throw Error(`Unexpected wallet method ${method}`);
    } } },
  });
  return { get, calls, artifact };
}

for (const currency of ['moss', 'eth']) {
  const { get, calls, artifact } = page(currency), moss = currency === 'moss';
  assert.equal(get('treasury-settings').hidden, !moss);
  assert.equal(get('treasury').required, moss);
  assert.equal(get('authority').value, authority); assert.equal(get('treasury').value, treasury);
  if (!moss) get('treasury').value = ''; // Legacy native settlement needs only the authority.
  await get('connect').onclick(); await get('deploy').onclick();
  const transaction = calls.find(call => call.method === 'eth_sendTransaction')?.params[0];
  assert(transaction, get('status').textContent);
  assert.equal(transaction.data, artifact.bytecode + coder.encode(moss ? ['address', 'address'] : ['address'], moss ? [authority, treasury] : [authority]).slice(2));
  assert.equal(transaction.value, '0x0'); assert.equal(transaction.chainId, '0x1237');
  assert.equal(get('result').hidden, false);
  assert.equal(get('result').textContent.includes(`TREASURE_TREASURY_CONTRACT=${treasury}`), moss);
  assert.match(get('status').textContent, /production workflow/);
  assert.equal(get('treasury').disabled, false);
}

for (const value of ['', ZeroAddress, '0x1234', `0x${'a'.repeat(64)}`]) {
  const { get, calls } = page();
  await get('connect').onclick(); get('treasury').value = value; await get('deploy').onclick();
  assert.match(get('status').textContent, /valid, nonzero existing Mossvale treasury/);
  assert(!calls.some(call => ['eth_estimateGas', 'eth_sendTransaction'].includes(call.method)), 'invalid treasury must fail before any wallet deployment request');
  assert.equal(get('treasury').disabled, false);
}
console.log('Auction setup: exact MOSS/ETH constructors, required nonzero treasury, fixed dev recipient, 50/25/25 fee and five-tier referral disclosure, settings and production workflow guidance passed. Wallet calls simulated; no broadcast.');
