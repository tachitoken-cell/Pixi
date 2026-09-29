import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { Wallet, Interface, TypedDataEncoder } from 'ethers';
import { createNativeWalletHandoff } from '../src/native-wallet-handoff.mjs';
import { validateNativeWalletOperation, nativeWalletResultValid } from '../src/native-wallet-operation.ts';
import { treasureContractClaim, TREASURE_ABI, TREASURE_CLAIM_TYPES } from '../src/treasure-rewards.ts';
import { MOSS_TOKEN } from '../src/auction.ts';
import { createGameServer } from '../server.mjs';

const origin = 'https://mossvale.world', wallet = Wallet.createRandom(), authority = Wallet.createRandom(), contract = Wallet.createRandom().address;
let now = Date.now();
const expiresAt = now + 300000;
const sign = { kind: 'sign', address: wallet.address, expiresAt,
  message: `Mossvale wallet\nOrigin: ${origin}\nCharacter: store:hero\nWallet: ${wallet.address}\nNonce: ${randomUUID()}\nExpires: ${new Date(expiresAt).toISOString()}\nThis links your wallet for the ingame store and auction trading. It does not authorize a payment.` };
assert.deepEqual(validateNativeWalletOperation(sign, origin, now), sign);
for (const invalid of [{ ...sign, message: 'Sign a payment authorization' }, { ...sign, address: authority.address }, { ...sign, expiresAt: now }, { ...sign, extra: true }, { kind: 'transaction', to: contract }, { kind: 'connect', request: 'eth_sendTransaction' }])
  assert.throws(() => validateNativeWalletOperation(invalid, origin, now));
assert.throws(() => validateNativeWalletOperation(sign, 'https://us.mossvale.world', now));
const signature = await wallet.signMessage(sign.message);
assert(nativeWalletResultValid(sign, { signature }));
assert(!nativeWalletResultValid(sign, { signature: await authority.signMessage(sign.message) }));
assert(!nativeWalletResultValid(sign, { signature, address: wallet.address }));

const claim = { id: 'claim', realmId: 'eu', characterId: 'hero', wallet: wallet.address, amount: 7, createdAt: now, chainId: 4663, token: MOSS_TOKEN.address, contract, status: 'pending' };
claim.contractClaim = treasureContractClaim(claim); claim.amountWei = claim.contractClaim.amountWei;
const domain = { name: 'MossvaleTreasureTreasury', version: '1', chainId: 4663, verifyingContract: contract };
claim.signature = await authority.signTypedData(domain, TREASURE_CLAIM_TYPES, claim.contractClaim);
claim.claimHash = TypedDataEncoder.hash(domain, TREASURE_CLAIM_TYPES, claim.contractClaim);
claim.transaction = { to: contract, data: new Interface(TREASURE_ABI).encodeFunctionData('claim', [claim.contractClaim, claim.signature]), value: '0x0', chainId: '0x1237' };
assert.equal(validateNativeWalletOperation({ kind: 'claim', claim }, origin, now).claim, claim);
for (const invalid of [{ ...claim, wallet: authority.address }, { ...claim, amount: 1000 }, { ...claim, transaction: { ...claim.transaction, value: '0x1' } }, { ...claim, chainId: 1 }])
  assert.throws(() => validateNativeWalletOperation({ kind: 'claim', claim: invalid }, origin, now));

let allowed = true;
const handoff = createNativeWalletHandoff({ originAllowed: value => value === origin, claimAllowed: async value => allowed && value.contract === contract,
  authenticate: async req => { if (!/^Bearer player-\d+$/.test(req.headers.authorization || '')) throw Error('Invalid account'); return req.headers.authorization; }, now: () => now });
const server = createServer((req, res) => { void handoff.handle(req, res, origin); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const endpoint = `http://127.0.0.1:${server.address().port}/api/native-wallet/`;
async function post(path, body, headers = {}) {
  const response = await fetch(endpoint + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(path === 'start' ? { Authorization: 'Bearer player-1' } : {}), ...headers }, body: JSON.stringify(body) });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return { status: response.status, ...await response.json() };
}
try {
  assert.equal((await post('start', { operation: { kind: 'connect' } }, { Authorization: '' })).status, 401, 'only signed-in accounts can create approvals');
  const packet = await post('start', { operation: { kind: 'connect' } }); assert.equal(packet.status, 200);
  for (const key of ['id', 'walletToken', 'readToken']) assert.match(packet[key], /^[a-f0-9]{64}$/);
  assert.notEqual(packet.walletToken, packet.readToken);
  assert.equal(packet.expiresAt, now + 180000);
  assert.equal((await post('request', { id: packet.id, token: packet.readToken })).status, 404, 'read secret cannot approve');
  assert.equal((await post('result', { id: packet.id, token: packet.walletToken })).status, 404, 'wallet secret cannot retrieve');
  assert.equal((await post('request', { id: packet.id, token: packet.walletToken }, { Origin: 'https://evil.invalid' })).status, 403);
  assert.equal((await post('request', { id: packet.id, token: packet.walletToken }, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await post('request', { id: packet.id, token: packet.walletToken }, { Origin: origin })).operation.kind, 'connect');
  assert.equal((await post('request', { id: packet.id, token: packet.walletToken })).status, 409, 'duplicate pages cannot open another approval');
  assert.equal((await post('result', { id: packet.id, token: packet.readToken })).result, null);
  const result = { address: wallet.address }, complete = { id: packet.id, token: packet.walletToken, result };
  assert.equal((await post('complete', { ...complete, result: { transactionHash: '0x' + '1'.repeat(64) } })).status, 400);
  assert.equal((await post('complete', complete)).status, 200);
  assert.equal((await post('complete', complete)).status, 200, 'lost completion response can retry without another approval');
  assert.equal((await post('complete', { ...complete, result: { address: authority.address } })).status, 409, 'result immutable');
  for (let i = 0; i < 70; i++) assert.deepEqual((await post('result', { id: packet.id, token: packet.readToken })).result, result, 'poll retries never lose the result or share attempt quota');
  const signing = await post('start', { operation: sign });
  await post('request', { id: signing.id, token: signing.walletToken });
  assert.equal((await post('complete', { id: signing.id, token: signing.walletToken, result: { signature: await authority.signMessage(sign.message) } })).status, 400);
  assert.equal((await post('complete', { id: signing.id, token: signing.walletToken, result: { signature } })).status, 200);
  allowed = false; assert.equal((await post('start', { operation: { kind: 'claim', claim } })).status, 400, 'unconfigured treasury cannot receive transactions');
  allowed = true;
  const payout = await post('start', { operation: { kind: 'claim', claim } });
  await post('request', { id: payout.id, token: payout.walletToken });
  now += 180001;
  assert.equal((await post('request', { id: payout.id, token: payout.walletToken })).status, 410, 'expired approval cannot start a transaction');
  assert.equal((await post('result', { id: packet.id, token: packet.readToken })).status, 404, 'expired connection forgotten');
  const receipt = { transactionHash: '0x' + '7'.repeat(64) };
  assert.equal((await post('complete', { id: payout.id, token: payout.walletToken, result: receipt })).status, 200, 'a wallet prompt can return a late receipt after the approval start deadline');
  assert.deepEqual((await post('result', { id: payout.id, token: payout.readToken })).result, receipt);
  now += 600000;
  assert.equal((await post('result', { id: payout.id, token: payout.readToken })).status, 404, 'receipt retention bounded');
  assert.equal((await post('start', { operation: { kind: 'connect' }, accessToken: 'unexpected' })).status, 400);
  assert.equal((await post('start', { operation: { kind: 'connect' }, junk: 'x'.repeat(17000) })).status, 413);
  for (let i = 0; i < 60; i++) await post('start', { operation: { kind: 'connect' } });
  assert.equal((await post('start', { operation: { kind: 'connect' } })).status, 429);
  assert.equal((await post('start', { operation: { kind: 'connect' } }, { Authorization: 'Bearer player-2' })).status, 200, 'players behind the same proxy do not share the start quota');
  handoff.close(); assert.equal((await post('start', { operation: { kind: 'connect' } })).status, 503);
} finally { handoff.close(); await new Promise(resolve => server.close(resolve)); }

// Exercise the actual HTTP route behind the EU proxy's rewritten Host, with real JWT verification.
const { privateKey, publicKey } = await generateKeyPair('RS256'), jwk = { ...await exportJWK(publicKey), kid: 'native-wallet-check' };
const identity = createServer((req, res) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ keys: [jwk] })));
await new Promise(resolve => identity.listen(0, '127.0.0.1', resolve));
const issuerBase = `http://127.0.0.1:${identity.address().port}`, issuer = `${issuerBase}/realms/check`;
const accessToken = await new SignJWT({ azp: 'game', typ: 'Bearer' }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setSubject('native-player').setIssuer(issuer).setIssuedAt().setExpirationTime('5m').sign(privateKey);
const directory = await mkdtemp(join(tmpdir(), 'native-wallet-route-'));
const disabled = { status: async () => ({ enabled: false }) };
const game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: directory, databaseUrl: '', realmEuOrigin: origin,
  keycloak: { url: issuerBase, realm: 'check', clientId: 'game' }, auctionChain: disabled, mossAuctionChain: disabled, storeChain: disabled,
  treasuryChain: { status: async () => ({ configured: true, enabled: true, contract }) } });
try {
  const port = await game.start();
  const post = (path, body, headers = {}) => fetch(`http://127.0.0.1:${port}/api/native-wallet/${path}`, { method: 'POST', headers: { Host: '00edc49e-6028-442d-9417-673a2251a662.bba.tools', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.equal((await post('start', { operation: { kind: 'connect' } })).status, 401);
  const response = await post('start', { operation: { kind: 'claim', claim } }, { Authorization: `Bearer ${accessToken}` });
  assert.equal(response.status, 200); const packet = await response.json();
  const browser = await post('request', { id: packet.id, token: packet.walletToken }, { Origin: origin });
  assert.equal(browser.status, 200); assert.deepEqual((await browser.json()).operation, { kind: 'claim', claim });
  assert.equal((await post('result', { id: packet.id, token: packet.readToken }, { Origin: 'https://us.mossvale.world' })).status, 403, 'a different realm cannot consume this handoff');
} finally { await game.stop(); await new Promise(resolve => identity.close(resolve)); await rm(directory, { recursive: true, force: true }); }
console.log('PASS native voucher handoff: narrow signed operations, separate secrets, exact origin, immutable recoverable results, single approval, size/rate/expiry bounds, late receipt recovery and shutdown. No real wallet or transaction used.');
