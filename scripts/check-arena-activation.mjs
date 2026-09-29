import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Wallet, getAddress, id, toQuantity, ZeroAddress } from 'ethers';
import { arenaActivation, arenaActivationPhase, arenaAppBefore, arenaAppAfter, ARENA_KEYS } from './arena-activation.mjs';
import { arenaActivationPreflight } from './arena-activation-preflight.mjs';
import { arenaConfigurationHash } from '../src/deployment-control.mjs';
import { arenaInterface } from '../src/arena-chain.mjs';
import { erc20Interface } from '../src/auction-chain.mjs';
import { MOSS_TOKEN, MOSS_AUCTION_DEV_TEAM } from '../src/auction.ts';

const authority = new Wallet('0x' + '17'.repeat(32));
const contract = getAddress('0x' + '23'.repeat(20)), treasury = getAddress('0x' + '45'.repeat(20));
const env = { MOSSVALE_ACTIVATE_ARENA: 'true', MOSS_ARENA_CONTRACT: contract, MOSS_ARENA_AUTHORITY_KEY: authority.privateKey,
  MOSS_ARENA_RPC_URL: 'https://robinhood-mainnet.g.alchemy.com/v2/private-offline-test-key',
  MOSSVALE_EU_BBA_APP_ID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', BBA_API_TOKEN: 'private-bba-offline-test-key' };
assert.equal(arenaActivation({}), null);
assert.equal(arenaActivation({ ...env, MOSSVALE_ACTIVATE_ARENA: 'false' }), null);
const activation = arenaActivation(env);
assert.equal(activation.authority, authority.address);
assert.equal(activation.hash, arenaConfigurationHash(env));
assert.equal(arenaConfigurationHash({}), null);
assert.equal(arenaConfigurationHash(Object.fromEntries(Object.entries(env).reverse())), activation.hash);
for (const name of ARENA_KEYS) {
  assert.notEqual(arenaConfigurationHash({ ...env, [name]: 'different' }), activation.hash);
  assert.throws(() => arenaActivation({ ...env, [name]: undefined }));
}
for (const changes of [{ MOSS_ARENA_CONTRACT: ZeroAddress }, { MOSS_ARENA_AUTHORITY_KEY: '0x' + '0'.repeat(64) },
  { MOSS_ARENA_AUTHORITY_KEY: '0x' + 'f'.repeat(64) }, { MOSS_ARENA_RPC_URL: 'http://localhost:1234' },
  { MOSS_ARENA_RPC_URL: env.MOSS_ARENA_RPC_URL + '?secret=${OTHER}' }, { MOSSVALE_ACTIVATE_ARENA: 'yes' }, { BBA_API_TOKEN: '' }])
  assert.throws(() => arenaActivation({ ...env, ...changes }), error => !String(error).includes(authority.privateKey) && !String(error).includes(env.MOSS_ARENA_RPC_URL));

const app = { id: activation.appId, sourceType: 'github-nodejs', replicas: 1, githubRepositoryOwner: 'trappyon', githubRepositoryName: 'mossvale',
  githubBranch: 'production', autoDeployPush: true, autoDeployPullRequest: false, lastError: null, status: 'ready', settingsPending: false,
  environmentVariableNames: ['DATABASE_URL', 'MOSSVALE_DEPLOY_TOKEN'], updatedAt: 'before' };
const before = arenaAppBefore(app, app.id), configured = { ...app, updatedAt: 'after', environmentVariableNames: [...app.environmentVariableNames, ...ARENA_KEYS] };
arenaAppAfter(configured, app.id, before);
for (const changes of [{ replicas: 2 }, { environmentVariableNames: ARENA_KEYS }, { id: 'other-app' }])
  assert.throws(() => arenaAppAfter({ ...configured, ...changes }, app.id, before));
const target = 'b'.repeat(40), previous = { revision: 'a'.repeat(40), instanceId: 'old', state: 'idle', arenaHash: null };
assert.throws(() => arenaActivationPhase({ ...previous, arenaHash: undefined }, app, activation, target));
const { arenaHash, ...preCompatibility } = previous;
assert.throws(() => arenaActivationPhase(preCompatibility, app, activation, target), /compatibility/);
assert.equal(arenaActivationPhase(previous, app, activation, target), 'initial');
const drained = { ...previous, state: 'drained', targetRevision: target, finalSave: true, admissionHeld: true };
assert.equal(arenaActivationPhase(drained, { ...configured, settingsPending: true }, activation, target), 'pending');
for (const changes of [{ state: 'idle' }, { targetRevision: 'c'.repeat(40) }, { finalSave: false }, { admissionHeld: false }])
  assert.throws(() => arenaActivationPhase({ ...drained, ...changes }, configured, activation, target), /saved EU drain/);
assert.equal(arenaActivationPhase({ ...previous, arenaHash: activation.hash }, configured, activation, target), 'configured');
assert.throws(() => arenaActivationPhase({ ...previous, arenaHash: '0'.repeat(64) }, configured, activation, target), /rotate/);
assert.throws(() => arenaActivationPhase(previous, { ...app, environmentVariableNames: [ARENA_KEYS[0]] }, activation, target), /Partial/);

const artifact = JSON.parse(readFileSync(new URL('../public/contracts/MossvaleArena.json', import.meta.url)));
const tokenCode = readFileSync(new URL('./fixtures/moss-token-runtime.hex', import.meta.url), 'utf8').trim();
const seconds = Math.floor(Date.now() / 1000), latest = { number: '0x10000', hash: id('latest'), timestamp: toQuantity(seconds) };
const finalized = { number: '0xf000', hash: id('finalized'), timestamp: toQuantity(seconds - 600) };
let fault = '', calls = [];
const fetcher = async () => ({ ok: fault !== 'health', json: async () => ({ ok: true, realmId: 'eu', mossAuction: { enabled: true, chainId: 4663, treasury } }) });
const rpc = async (method, params) => {
  calls.push([method, params]);
  assert(['eth_chainId', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call'].includes(method), 'Preflight never signs or broadcasts');
  if (fault === 'rpc') throw Error(env.MOSS_ARENA_RPC_URL);
  if (method === 'eth_chainId') return fault === 'chain' ? '0x1' : '0x1237';
  if (method === 'eth_getBlockByNumber') {
    const block = ['finalized', finalized.number].includes(params[0]) ? finalized : latest;
    return fault === 'stale' ? { ...block, timestamp: '0x1' } : fault === 'reorg' && params[0] === block.number ? { ...block, hash: id('reorg') } : block;
  }
  const isToken = params[0]?.to?.toLowerCase() === MOSS_TOKEN.address.toLowerCase() || params[0]?.toLowerCase?.() === MOSS_TOKEN.address.toLowerCase();
  const head = params[1].blockHash === latest.hash ? latest : finalized;
  assert.deepEqual(params[1], { blockHash: head.hash, requireCanonical: true });
  assert(isToken || head === latest, 'A new escrow need not exist before the finalized block');
  if (fault === 'history' && head === finalized) throw Error('historical state unavailable');
  if (method === 'eth_getCode') return fault === 'runtime' ? '0x1234' : isToken ? tokenCode : artifact.deployedBytecode;
  const abi = isToken ? erc20Interface : arenaInterface, name = abi.parseTransaction(params[0]).name;
  const values = { authority: fault === 'authority' ? treasury : authority.address, paymentToken: MOSS_TOKEN.address,
    treasury: fault === 'treasury' ? contract : treasury, devTeam: MOSS_AUCTION_DEV_TEAM, TAX_BPS: fault === 'tax' ? 499n : 500n,
    name: 'Mossvale', symbol: 'MOSS', decimals: 18n };
  return abi.encodeFunctionResult(name, [values[name]]);
};
assert.deepEqual(await arenaActivationPreflight({ activation, fetcher, rpc }), { contract, authority: authority.address, treasury, chainId: 4663, taxBps: 500 });
for (fault of ['health', 'rpc', 'chain', 'stale', 'reorg', 'history', 'runtime', 'authority', 'treasury', 'tax'])
  await assert.rejects(arenaActivationPreflight({ activation, fetcher, rpc }), error => /Arena activation preflight failed/.test(error.message)
    && !error.message.includes(env.MOSS_ARENA_RPC_URL) && !error.message.includes(authority.privateKey));
const workflow = readFileSync(new URL('../.github/workflows/production.yml', import.meta.url), 'utf8');
for (const name of ['MOSSVALE_ACTIVATE_ARENA', ...ARENA_KEYS]) assert(workflow.includes(name));
assert(workflow.includes('secrets.MOSS_ARENA_AUTHORITY_KEY') && workflow.includes('secrets.MOSS_ARENA_RPC_URL'));
console.log('PASS arena activation: exact settings/fingerprints, gate-off and immutable configuration, pinned app and uncertain-PATCH reconciliation, canonical escrow/tax/authority/treasury, finalized token history, and redacted failures. No broadcasts.');
