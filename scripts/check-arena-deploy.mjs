import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { AbiCoder, Interface, ZeroAddress, id } from 'ethers';

const html = readFileSync(new URL('../public/arena-deploy.html', import.meta.url), 'utf8');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const artifact = JSON.parse(readFileSync(new URL('../public/contracts/MossvaleArena.json', import.meta.url), 'utf8'));
const abi = new Interface(artifact.abi), coder = AbiCoder.defaultAbiCoder();
const [wallet, authority, treasury, deployed] = [1, 2, 3, 4].map(value => `0x${String(value).padStart(40, '0')}`);
const token = '0x6742883Eef788E2424CE5a1b0d4303144AaEc0a5', developer = '0x6D96b833C760774175Cc6E2c4F7424122EA3798f';
const transactionHash = id('arena creation'), blockHash = id('arena creation block'), storageKey = 'mossvale-arena-deployment:4663';
const creation = artifact.bytecode + coder.encode(['address', 'address'], [authority, treasury]).slice(2);
assert.deepEqual(artifact.abi.find(entry => entry.type === 'constructor').inputs.map(input => input.type), ['address', 'address']);
assert.match(html, /At 100 MOSS each, the winner receives 190 MOSS/);
assert.match(html, /80% burns, 10% goes to the treasury and 10% goes to the fixed developer wallet/);

function page(change = {}, storage = new Map()) {
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([, name]) => [name,
    { value: '', disabled: false, hidden: false, textContent: '' }]));
  const get = name => elements.get(name), calls = [];
  get('result').hidden = true;
  const getState = () => JSON.parse(storage.get(storageKey) || 'null');
  runInNewContext(script, {
    document: { getElementById: get },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => { if (change.storageFailure) throw Error('storage unavailable'); storage.set(key, value); } },
    navigator: { locks: change.noLocks ? undefined : { request: async (key, options, callback) => { assert.equal(key, storageKey); assert.equal(options.ifAvailable, true); await callback(change.lockBusy ? null : {}); } } },
    fetch: async url => { assert.equal(url, '/contracts/MossvaleArena.json'); return { ok: true, json: async () => ({ ...artifact, ...change.artifact }) }; },
    window: { addEventListener() {}, ethereum: { async request({ method, params }) {
      calls.push({ method, params });
      if (method === 'eth_chainId') return change.chain || '0x1237';
      if (method === 'wallet_switchEthereumChain') return null;
      if (['eth_requestAccounts', 'eth_accounts'].includes(method)) return [method === 'eth_accounts' ? change.account || wallet : wallet];
      if (method === 'eth_estimateGas') return '0x100000';
      if (method === 'eth_sendTransaction') {
        assert(getState()?.transaction && !getState().hash, 'persist intent before wallet request');
        if (change.sendError) throw change.sendError;
        return change.sendHash || transactionHash;
      }
      if (method === 'eth_getTransactionReceipt') return change.pending ? null : {
        transactionHash, status: '0x1', contractAddress: deployed, from: wallet, to: null, blockHash, blockNumber: '0x100', ...change.receipt,
      };
      if (method === 'eth_getTransactionByHash') return { hash: transactionHash, from: wallet, to: null, input: creation, value: '0x0', chainId: '0x1237', blockHash, blockNumber: '0x100', ...change.tx };
      if (method === 'eth_getBlockByNumber') return { hash: change.reorg ? id('fork') : blockHash, number: '0x100' };
      if (method === 'eth_getCode') {
        if (params[0] === token) return change.missingToken ? '0x' : '0x1234';
        if (params[0] === treasury) return change.missingTreasury ? '0x' : '0x1234';
        assert.equal(params[0], deployed);
        return change.runtime || artifact.deployedBytecode;
      }
      if (method === 'eth_call') {
        if (params[0].to === token) {
          const [name] = ['name', 'symbol', 'decimals'].filter(name => id(`${name}()`).slice(0, 10) === params[0].data);
          return coder.encode([name === 'decimals' ? 'uint8' : 'string'], [change.metadata?.[name] ?? { name: 'Mossvale', symbol: 'MOSS', decimals: 18 }[name]]);
        }
        assert.equal(params[0].to, deployed);
        const { name } = abi.parseTransaction(params[0]);
        return abi.encodeFunctionResult(name, [change.getters?.[name] ?? { authority, treasury, paymentToken: token, devTeam: developer, TAX_BPS: 500 }[name]]);
      }
      throw Error(`Unexpected wallet method: ${method}`);
    } } },
  });
  return { get, calls, storage, getState,
    async deploy() { await get('connect').onclick(); get('authority').value = authority; get('treasury').value = treasury; await get('deploy').onclick(); },
  };
}

const success = page(); await success.deploy();
const sent = success.calls.find(call => call.method === 'eth_sendTransaction')?.params[0];
assert(sent, success.get('status').textContent); assert.equal(sent.data, creation); assert.equal(sent.value, '0x0'); assert.equal(sent.chainId, '0x1237');
assert.equal(BigInt(sent.gas), (0x100000n * 120n + 99n) / 100n);
assert(success.get('deploy').disabled); assert.equal(success.getState().hash, transactionHash);
await success.get('verify').onclick(); assert.equal(success.get('result').hidden, false, success.get('status').textContent);
assert.match(success.get('result').textContent, /MOSS_ARENA_CONTRACT=/); assert.match(success.get('status').textContent, /production workflow/);
await success.get('deploy').onclick(); assert.equal(success.calls.filter(call => call.method === 'eth_sendTransaction').length, 1);

const reloaded = page({}, success.storage); assert(reloaded.get('deploy').disabled); assert.equal(reloaded.get('hash').value, transactionHash);
await reloaded.get('verify').onclick(); assert.equal(reloaded.get('result').hidden, false); assert(!reloaded.calls.some(call => call.method === 'eth_sendTransaction'));
for (const invalid of ['', ZeroAddress, '0x1234', `0x${'a'.repeat(64)}`]) {
  for (const field of ['authority', 'treasury']) {
    const test = page(); await test.get('connect').onclick(); test.get('authority').value = authority; test.get('treasury').value = treasury; test.get(field).value = invalid; await test.get('deploy').onclick();
    assert(!test.calls.some(call => ['eth_estimateGas', 'eth_sendTransaction'].includes(call.method)), `${field}: ${invalid}`);
  }
}
for (const change of [{ chain: '0x1' }, { account: treasury }, { missingToken: true }, { missingTreasury: true }, { metadata: { symbol: 'FAKE' } },
  { metadata: { name: 'Wrong' } }, { metadata: { decimals: 6 } }, { artifact: { contractName: 'MossvaleStore' } }, { storageFailure: true }, { noLocks: true }, { lockBusy: true }]) {
  const test = page(change); await test.deploy(); assert(!test.calls.some(call => call.method === 'eth_sendTransaction'), JSON.stringify(change));
}
for (const change of [{ pending: true }, { runtime: '0x1234' }, { reorg: true }, { getters: { authority: treasury } }, { getters: { treasury: wallet } },
  { getters: { paymentToken: treasury } }, { getters: { devTeam: wallet } }, { getters: { TAX_BPS: 0 } }, { tx: { input: '0x1234' } }, { tx: { from: treasury } },
  { tx: { to: treasury } }, { tx: { value: '0x1' } }, { tx: { chainId: '0x1' } }, { tx: { blockHash: id('other') } },
  { receipt: { status: '0x0' } }, { receipt: { from: treasury } }, { receipt: { to: treasury } }, { receipt: { transactionHash: id('other') } }]) {
  const test = page(change); await test.deploy(); await test.get('verify').onclick();
  assert(test.get('result').hidden, JSON.stringify(change)); assert(test.get('deploy').disabled, 'uncertain/invalid verification cannot enable a duplicate creation');
}
const unknown = page({ sendError: Error('provider disconnected') }); await unknown.deploy(); assert(unknown.getState()?.transaction); assert(!unknown.getState().hash);
const recover = page({}, unknown.storage); await recover.get('connect').onclick(); await recover.get('deploy').onclick(); assert(!recover.calls.some(call => call.method === 'eth_sendTransaction'));
recover.get('hash').value = transactionHash; await recover.get('verify').onclick(); assert.equal(recover.get('result').hidden, false, recover.get('status').textContent);
const rejected = page({ sendError: Object.assign(Error('Rejected'), { code: 4001 }) }); await rejected.deploy(); assert.equal(rejected.getState(), null); assert.equal(rejected.get('deploy').disabled, false);
const noHash = page({ sendHash: 'invalid' }); await noHash.deploy(); assert(noHash.getState()?.transaction); assert(noHash.get('deploy').disabled);
console.log('Arena deployment page passed: exact constructor artifact, wallet/chain and token checks, mined creation/runtime/authority/treasury/tax verification, and persistent pending/reload/unknown-send recovery. Wallet simulated; no broadcast.');
