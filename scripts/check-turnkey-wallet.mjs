import assert from 'node:assert/strict';
import { Wallet, getBytes, hashMessage, hexlify, toUtf8Bytes, verifyMessage } from 'ethers';
import { createTurnkeySession } from '../src/turnkey-wallet.ts';

const wallet = Wallet.createRandom(), recipient = Wallet.createRandom().address;
const config = { organizationId: 'parent', authProxyConfigId: 'proxy' };
const stored = new Map();
let lockDepth = 0;
const identityKey = 'mossvale.turnkey.identity.parent';
let failBindingWrite = false;
const storage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => { if (failBindingWrite && key === identityKey) throw Error('Storage unavailable'); stored.set(key, value); }, removeItem: key => { if (key.startsWith('mossvale.turnkey.pending.')) assert(lockDepth > 0, 'journal removal must hold the transaction lock'); stored.delete(key); } };
const publicKey = '0394e549c71fa99dd5cf752fba623090be314949b74e4cdf7ca72031dd638e281a';
const authenticatedSession = () => ({ organizationId: 'player', userId: 'turnkey-user', publicKey, token: 'session-token', expiry: Math.floor(Date.now() / 1000) + 900 });
let sends = 0, funding = 0, session = authenticatedSession(), failure = false, signingPayload, oauthCalls = 0, deletedKeys = 0, exports = 0;
let activeSessionKey = 'default', stamperKey;
const sessions = new Map();
function storeSession(sessionKey, next = authenticatedSession()) {
  if (session && activeSessionKey) sessions.set(activeSessionKey, session);
  sessions.set(sessionKey, next); activeSessionKey = sessionKey; session = next;
  return { sessionToken: next.token };
}
let status = { txStatus: 'INCLUDED', eth: { txHash: `0x${'12'.repeat(32)}` } };
const client = {
  init: async () => {}, getSession: async params => !params?.sessionKey || params.sessionKey === activeSessionKey ? session : sessions.get(params.sessionKey),
  getActiveSessionKey: async () => session ? activeSessionKey ??= 'default' : undefined,
  clearSession: async ({ sessionKey }) => { sessions.delete(sessionKey); if (sessionKey === activeSessionKey) { session = undefined; activeSessionKey = undefined; } },
  overrideApiKeyStamper: async ({ temporaryPublicKey }) => { stamperKey = temporaryPublicKey; },
  initOtp: async params => { assert.equal(params.otpType, 'OTP_TYPE_EMAIL'); return { otpId: 'otp', otpEncryptionTargetBundle: 'encrypted-target' }; },
  completeOtp: async params => { assert.equal(params.otpEncryptionTargetBundle, 'encrypted-target'); assert.equal(params.createSubOrgParams.customWallet.walletAccounts[0].addressFormat, 'ADDRESS_FORMAT_ETHEREUM'); return storeSession(params.sessionKey); },
  createApiKeyPair: async () => publicKey,
  deleteApiKeyPair: async params => { assert.equal(params.publicKey, publicKey); deletedKeys++; },
  completeOauth: async params => {
    oauthCalls++; assert.equal(params.publicKey, publicKey); assert.equal(params.oidcToken, 'keycloak-id-token');
    assert.equal(params.providerName, 'Mossvale'); assert.equal(params.expirationSeconds, '900');
    assert.deepEqual(params.createSubOrgParams.customWallet, { walletName: 'Mossvale Wallet', walletAccounts: [{ curve: 'CURVE_SECP256K1', pathFormat: 'PATH_FORMAT_BIP32', path: "m/44'/60'/0'/0/0", addressFormat: 'ADDRESS_FORMAT_ETHEREUM' }] });
    return storeSession(params.sessionKey);
  },
  fetchWallets: async params => { assert.equal(params.organizationId, 'player'); assert.equal(params.userId, 'turnkey-user'); return [{ walletId: 'wallet', accounts: [{ address: wallet.address, addressFormat: 'ADDRESS_FORMAT_ETHEREUM' }] }]; },
  ethSendTransaction: async ({ transaction }) => {
    sends++; assert.equal(transaction.sponsor, false); assert.equal(transaction.caip2, 'eip155:4663'); assert.equal(transaction.nonce, '0');
    assert.equal(transaction.gasLimit, '21000'); assert.equal(transaction.maxFeePerGas, '1000000000'); assert.equal(transaction.maxPriorityFeePerGas, '0');
    assert(stored.has('mossvale.turnkey.pending.parent'), 'submission is recorded before the network mutation');
    if (failure) throw Error('Lost response');
    return 'status-id';
  },
  exportWalletAccount: async params => {
    exports++;
    assert.deepEqual(params, { address: wallet.address, targetPublicKey: 'iframe-public-key', organizationId: 'player' });
    return 'encrypted-account-key';
  },
  httpClient: {
    getNonces: async () => ({ nonce: '0' }),
    getSendTransactionStatus: async () => status,
    signRawPayload: async params => {
      signingPayload = params; const signature = wallet.signingKey.sign(params.payload);
      return { r: signature.r.slice(2), s: signature.s.slice(2), v: String(signature.yParity) };
    },
  },
};
const create = () => createTurnkeySession(config, { client, storage, lock: async (_name, action) => { lockDepth++; try { return await action(); } finally { lockDepth--; } } });
const fees = { funded: false, chainId: 4663, nonce: '0x0', gasLimit: '0x5208', maxFeePerGas: '0x3b9aca00', maxPriorityFeePerGas: '0x0' };
const quoteFees = async () => { funding++; return fees; };
const connection = await create();
const challenge = await connection.sendCode(' user@example.com ');
await connection.verifyCode(challenge, '123456', 'user@example.com');
assert.equal((await connection.accounts())[0].address, wallet.address);
const message = hexlify(toUtf8Bytes('Mossvale wallet ownership'));
assert.equal(verifyMessage(getBytes(message), await connection.signMessage(message, wallet.address)), wallet.address);
assert.equal(signingPayload.payload, hashMessage(getBytes(message)), 'ownership proof uses EIP-191 over decoded bytes');
assert.equal(signingPayload.hashFunction, 'HASH_FUNCTION_NO_OP');
assert.deepEqual(await connection.exportWalletAccount(wallet.address.toLowerCase(), 'iframe-public-key'), { bundle: 'encrypted-account-key', organizationId: 'player', address: wallet.address });
assert.equal(connection.exportWallet, undefined, 'the facade does not expose wallet seed export');
await assert.rejects(connection.exportWalletAccount(recipient, 'iframe-public-key'), /Only the primary wallet account/);
const primaryWallets = client.fetchWallets;
client.fetchWallets = async params => [{ walletId: 'wallet', accounts: [
  ...(await primaryWallets(params))[0].accounts,
  { address: recipient, addressFormat: 'ADDRESS_FORMAT_ETHEREUM' },
] }];
await assert.rejects(connection.exportWalletAccount(recipient, 'iframe-public-key'), /Only the primary wallet account/);
assert.equal(exports, 1, 'even an owned secondary account cannot be exported');
client.fetchWallets = primaryWallets;
const exportAccount = client.exportWalletAccount;
client.exportWalletAccount = async params => { const bundle = await exportAccount(params); session = { ...session, expiry: 0 }; return bundle; };
await assert.rejects(connection.exportWalletAccount(wallet.address, 'iframe-public-key'), /expired/);
session = authenticatedSession(); client.exportWalletAccount = exportAccount;
const transaction = { from: wallet.address, to: recipient, data: '0x', value: '0x0', chainId: '0x1237' };
await assert.rejects(connection.sendPaidTransaction({ ...transaction, chainId: 1 }), /only supports Robinhood/);
await assert.rejects(connection.sendPaidTransaction({ ...transaction, from: recipient }), /does not belong/);
assert.equal(sends, 0);
await assert.rejects(connection.sendPaidTransaction(transaction), /Review the network fees/);
for (const response of [undefined, {}, { ...fees, funded: true }, { ...fees, chainId: 1 }, { ...fees, nonce: undefined }, { ...fees, gasLimit: '21000' }, { ...fees, gasLimit: '0x00' }, { ...fees, gasLimit: '0x0' }, { ...fees, gasLimit: '0x10000000000000000' }, { ...fees, maxFeePerGas: '0x0' }, { ...fees, maxPriorityFeePerGas: '0x3b9aca01' }]) {
  await assert.rejects(connection.sendPaidTransaction(transaction, async () => response), /invalid transaction (fee quote|fees)/);
  assert.equal(sends, 0, 'missing or malformed fee envelope never submits a transaction');
  assert.equal(connection.pendingTransaction(), null);
}
await assert.rejects(connection.sendPaidTransaction(transaction, async () => ({ ...fees, nonce: '0x1' })), /wallet activity changed/);
assert.equal(sends, 0, 'nonce drift cannot move a reviewed action to another nonce');
assert.equal(connection.pendingTransaction(), null);
const hash = await connection.sendPaidTransaction(transaction, quoteFees);
assert.equal(sends, 1);
assert.equal(await (await create()).sendPaidTransaction(transaction), hash, 'reload resumes the completed submission');
assert.equal(sends, 1, 'matching retry never submits twice');
assert.equal(funding, 1, 'matching retry does not quote fees twice');
await assert.rejects(connection.sendPaidTransaction({ ...transaction, value: '1' }), error => error.code === 'WALLET_PENDING_TRANSACTION');
await connection.acknowledgeTransaction(`0x${'34'.repeat(32)}`); assert(connection.pendingTransaction());
await connection.acknowledgeTransaction(hash); assert.equal(connection.pendingTransaction(), null);
failure = true;
await assert.rejects(connection.sendPaidTransaction(transaction, quoteFees), /Lost response/);
assert.equal(sends, 2);
await assert.rejects((await create()).sendPaidTransaction(transaction), /unknown status/);
assert.equal(sends, 2, 'lost submission response never falls back or resends');
stored.clear(); failure = false;
status = { txStatus: 'INCLUDED', eth: { txHash: hash }, error: { message: 'Contract reverted' } };
await assert.rejects(connection.sendPaidTransaction(transaction, quoteFees), /Contract reverted/);
assert.equal(connection.pendingTransaction(), null, 'an included revert is a terminal failure');
session.expiry = 0;
assert.deepEqual(await connection.accounts(), []);
await assert.rejects(connection.signMessage(message, wallet.address), error => error.code === 'WALLET_SESSION_EXPIRED' && /session has expired/.test(error.message));
session.expiry = Math.floor(Date.now() / 1000) + 900;
connection.dispose();
assert(session, 'disposing the old page preserves an established wallet session');
await assert.rejects(connection.signMessage(message, wallet.address), /disconnected/);
await assert.rejects(connection.sendCode('user@example.com'), /disconnected/);
const restoredConnection = await create();
assert.equal((await restoredConnection.accounts())[0].address, wallet.address, 'reload restores the unexpired session');
await restoredConnection.logout();
assert.equal(session, undefined, 'explicit logout clears the persisted session');
await assert.rejects(restoredConnection.signMessage(message, wallet.address), /disconnected/);
const authConnection = await create();
let completeAuth;
client.completeOtp = params => new Promise(resolve => { completeAuth = () => resolve(storeSession(params.sessionKey)); });
const login = authConnection.verifyCode(challenge, '123456', 'user@example.com');
await authConnection.logout();
completeAuth();
await assert.rejects(login, /disconnected/);
assert.equal(session, undefined, 'an authentication response arriving after logout must not restore the session');

const gameIdentity = 'https://auth.example/realms/mossvale|game-user';
const getToken = async nonce => {
  assert.equal(nonce, '1663bba492a323085b13895634a3618792c4ec6896f3c34ef3c26396df22ef82', 'OIDC nonce hashes UTF-8 public-key text, not decoded key bytes');
  return { idToken: 'keycloak-id-token', identity: gameIdentity };
};
const gameConnection = await create();
await assert.rejects(gameConnection.authenticateWithGame(async () => ({ idToken: 'keycloak-id-token', identity: 'other-user' }), gameIdentity), /game account changed/);
assert.equal(oauthCalls, 0); assert.equal(deletedKeys, 1); assert.equal(stored.get(identityKey), undefined);
await gameConnection.authenticateWithGame(getToken, gameIdentity);
assert.deepEqual(JSON.parse(stored.get(identityKey)), { identity: gameIdentity, organizationId: 'player', userId: 'turnkey-user', publicKey });
assert.equal(stamperKey, publicKey, 'SDK signing stays pinned to the authenticated key');
await gameConnection.assertIdentity(gameIdentity);
await (await create()).assertIdentity(gameIdentity);
gameConnection.dispose();
assert(stored.has(identityKey), 'navigation preserves the established identity binding');
await assert.rejects(gameConnection.assertIdentity(gameIdentity), /disconnected/);
for (const binding of [null, '{broken', { identity: 'other-user', organizationId: 'player', userId: 'turnkey-user' }, { identity: gameIdentity, organizationId: 'other-org', userId: 'turnkey-user' }, { identity: gameIdentity, organizationId: 'player', userId: 'other-user' }]) {
  session = authenticatedSession();
  const boundConnection = await create();
  if (binding === null) stored.delete(identityKey); else stored.set(identityKey, typeof binding === 'string' ? binding : JSON.stringify(binding));
  await assert.rejects(boundConnection.assertIdentity(gameIdentity), /not authenticated for the current game account/);
  assert.equal(session, undefined, 'restored sessions cannot cross game identity, Turnkey organization or user');
  if (!binding || typeof binding === 'string' || binding.organizationId === 'player' && binding.userId === 'turnkey-user') assert.equal(stored.get(identityKey), undefined);
}
const boundConnection = await create();
await boundConnection.authenticateWithGame(getToken, gameIdentity);
await boundConnection.assertIdentity(gameIdentity);
failBindingWrite = true;
await assert.rejects(boundConnection.authenticateWithGame(getToken, gameIdentity), /Storage unavailable/);
failBindingWrite = false;
assert.equal(session, undefined); assert.equal(stored.get(identityKey), undefined, 'an unpersisted identity cannot leave an authenticated session');

const originalOauth = client.completeOauth;
for (const finishWith of ['logout', 'dispose']) {
  const closingConnection = await create();
  let completeOauth;
  client.completeOauth = params => new Promise(resolve => { completeOauth = () => resolve(storeSession(params.sessionKey)); });
  const completing = closingConnection.authenticateWithGame(getToken, gameIdentity);
  const rejected = assert.rejects(completing, /disconnected/);
  await new Promise(resolve => setImmediate(resolve));
  assert(completeOauth);
  await closingConnection[finishWith](); completeOauth(); await rejected;
  assert.equal(session, undefined, `OAuth completion after ${finishWith} cannot restore credentials`);
  assert.equal(stored.get(identityKey), undefined);
}
client.completeOauth = originalOauth;

// Another tab can replace the active session after this login stores its result.
const otherPublicKey = `02${'ab'.repeat(32)}`;
const otherBinding = { identity: 'other-game-user', organizationId: 'other-player', userId: 'other-turnkey-user', publicKey: otherPublicKey };
const otherSession = () => ({ ...authenticatedSession(), ...otherBinding, token: 'other-session-token' });
for (const replacement of [otherSession(), { ...authenticatedSession(), token: 'wrong-returned-token' }, { ...authenticatedSession(), publicKey: otherPublicKey }]) {
  let ownSessionKey;
  client.completeOauth = async params => {
    ownSessionKey = params.sessionKey;
    const result = await originalOauth(params);
    storeSession('other-tab', replacement);
    stored.set(identityKey, JSON.stringify(otherBinding));
    return result;
  };
  const racedConnection = await create();
  await assert.rejects(racedConnection.authenticateWithGame(getToken, gameIdentity), /session changed in another tab/);
  assert.equal(sessions.has(ownSessionKey), false, 'failed login clears only its own SDK session slot');
  assert.equal(session, replacement, 'failed login leaves the replacement session intact');
  assert.deepEqual(JSON.parse(stored.get(identityKey)), otherBinding, 'failed login cannot overwrite or erase another identity binding');
}
client.completeOauth = originalOauth;

for (const replacement of [otherSession(), { ...authenticatedSession(), token: 'refreshed-token' }, { ...authenticatedSession(), publicKey: otherPublicKey }]) {
  const pinnedConnection = await create();
  await pinnedConnection.authenticateWithGame(getToken, gameIdentity);
  storeSession('other-tab', replacement);
  stored.set(identityKey, JSON.stringify(otherBinding));
  let quoteCalled = false;
  for (const action of [() => pinnedConnection.assertIdentity(gameIdentity), () => pinnedConnection.accounts(),
    () => pinnedConnection.signMessage(message, wallet.address), () => pinnedConnection.exportWalletAccount(wallet.address, 'iframe-public-key'),
    () => pinnedConnection.sendPaidTransaction(transaction, async () => { quoteCalled = true; return fees; })]) {
    await assert.rejects(action(), /session changed in another tab/);
  }
  assert.equal(quoteCalled, false, 'a replaced session cannot initiate fee review');
  await pinnedConnection.logout();
  assert.equal(session, replacement, 'an old facade logs out only its pinned session');
  assert.deepEqual(JSON.parse(stored.get(identityKey)), otherBinding);
}

// The SDK must not consult the shared active key a second time while stamping.
const stampingConnection = await create();
await stampingConnection.authenticateWithGame(getToken, gameIdentity);
const originalSignRawPayload = client.httpClient.signRawPayload;
client.httpClient.signRawPayload = async params => {
  storeSession('other-tab', otherSession());
  assert.equal(stamperKey, publicKey, 'request stamp remains bound to the approved session during an active-session switch');
  assert.equal(params.organizationId, 'player');
  return originalSignRawPayload(params);
};
await assert.rejects(stampingConnection.signMessage(message, wallet.address), /session changed in another tab/);
client.httpClient.signRawPayload = originalSignRawPayload;

const waitingConnection = await create();
let finishToken;
const waiting = waitingConnection.authenticateWithGame(() => new Promise(resolve => { finishToken = resolve; }), gameIdentity);
const waitingRejected = assert.rejects(waiting, /disconnected/);
await new Promise(resolve => setImmediate(resolve));
const callsBeforeCancel = oauthCalls;
waitingConnection.dispose(); finishToken({ idToken: 'keycloak-id-token', identity: gameIdentity }); await waitingRejected;
assert.equal(oauthCalls, callsBeforeCancel, 'cancelled game sign-in cannot call Turnkey authentication');

const paidConnection = await create();
await paidConnection.authenticateWithGame(getToken, gameIdentity);
const paidFees = { ...fees, funded: false }, sendsBeforePaid = sends, fundingBeforePaid = funding;
let finishFees;
const interruptedSend = paidConnection.sendPaidTransaction(transaction, () => new Promise(resolve => { finishFees = resolve; }));
const interruptedSendRejected = assert.rejects(interruptedSend, /disconnected/);
await new Promise(resolve => setImmediate(resolve));
await assert.rejects(paidConnection.assertIdentity('other-account'), /not authenticated/);
finishFees(paidFees); await interruptedSendRejected;
assert.equal(sends, sendsBeforePaid, 'an account reset invalidates an in-flight fee review before sending');
await paidConnection.authenticateWithGame(getToken, gameIdentity);
let quotes = 0;
for (const quote of [{ ...fees, funded: true }, { ...paidFees, gasLimit: '0x0' }, { ...paidFees, maxPriorityFeePerGas: '0x3b9aca01' }]) {
  await assert.rejects(paidConnection.sendPaidTransaction(transaction, async () => quote), /invalid transaction (fee quote|fees)/);
}
await assert.rejects(paidConnection.sendPaidTransaction(transaction, async () => ({ ...paidFees, nonce: '0x1' })), /wallet activity changed/);
assert.equal(sends, sendsBeforePaid, 'manual sends reject sponsored mode, bad fees and nonce drift');
status = { txStatus: 'INCLUDED', eth: { txHash: hash } };
assert.equal(await paidConnection.sendPaidTransaction(transaction, async () => { quotes++; return paidFees; }), hash);
assert.equal(sends, sendsBeforePaid + 1); assert.equal(funding, fundingBeforePaid, 'manual sends never request game gas funding');
assert.equal(await (await create()).sendPaidTransaction(transaction, async () => { quotes++; return paidFees; }), hash);
assert.equal(sends, sendsBeforePaid + 1); assert.equal(quotes, 1, 'manual retry resumes the shared journal without another quote or payment');
await paidConnection.acknowledgeTransaction(hash);
failure = true;
await assert.rejects(paidConnection.sendPaidTransaction(transaction, async () => paidFees), /Lost response/);
await assert.rejects(paidConnection.sendPaidTransaction(transaction, async () => paidFees), /unknown status/);
assert.equal(sends, sendsBeforePaid + 2, 'unknown manual submission is never sent twice');
await paidConnection.logout(); assert.equal(stored.get(identityKey), undefined);
// Sponsored actions use their own signed-operation journal and never call the paid transport.
stored.clear(); failure = false;
const sentPaid = sends;
let sponsoredSends = 0, sponsoredResumes = 0, sponsoredFailure = false, confirmedFailure = false, sponsoredPreparationError, sponsoredResumeError;
const sponsoredRpcs = [];
const sponsoredFactory = async ({ guard, rpc }) => { sponsoredRpcs.push(rpc); return ({
  async send(_transaction, record) { await guard(); if (sponsoredPreparationError) throw sponsoredPreparationError; sponsoredSends++; record({ prepared: { reviewed: true }, signed: { exact: 'operation' } }); if (sponsoredFailure) throw Error('Lost sponsored response'); return hash; },
  async resume(_transaction, record) { await guard(); assert.deepEqual(record.signed, { exact: 'operation' }); sponsoredResumes++; if (sponsoredResumeError) throw sponsoredResumeError; if (confirmedFailure) throw Object.assign(Error('Confirmed revert'), { confirmedSponsoredFailure: true }); return hash; },
}); };
const createSponsored = () => createTurnkeySession(config, { client, storage, sponsoredWallet: sponsoredFactory,
  lock: async (_key, action) => { lockDepth++; try { return await action(); } finally { lockDepth--; } } });
let sponsorSession = await createSponsored();
await sponsorSession.authenticateWithGame(getToken, gameIdentity);
await assert.rejects(sponsorSession.sendTransaction(transaction), error => error.transactionNotSubmitted === true && /Fee sponsorship is not available/.test(error.message));
sponsorSession.configureSponsorRpc(async () => { throw Error('Fake factory handles RPC'); });
sponsoredPreparationError = Error('The daily sponsorship limit has been reached.');
await assert.rejects(sponsorSession.sendTransaction(transaction), error => error.transactionNotSubmitted === true && error.message === sponsoredPreparationError.message);
assert.equal(sponsoredPreparationError.transactionNotSubmitted, undefined, 'classification does not mutate a reusable upstream error');
assert.equal(sponsoredSends, 0); assert.equal(sponsorSession.pendingTransaction(), null, 'preparation rejection creates no signed journal or submission');
sponsoredPreparationError = undefined;
const saveSponsored = storage.setItem;
storage.setItem = (key, value) => { if (key.startsWith('mossvale.turnkey.pending.')) throw Error('Journal unavailable'); return saveSponsored(key, value); };
await assert.rejects(sponsorSession.sendTransaction(transaction), error => !error.transactionNotSubmitted && /Journal unavailable/.test(error.message), 'the conservative latch precedes even a failed journal write');
storage.setItem = saveSponsored; sponsoredSends = 0;

assert.equal(await sponsorSession.sendTransaction(transaction), hash); assert.equal(sponsoredSends, 1);
await assert.rejects(sponsorSession.sendTransaction({ ...transaction, data: '0x1234' }), error => error.code === 'WALLET_PENDING_TRANSACTION');
await sponsorSession.acknowledgeTransaction(hash);
sponsoredFailure = true;
await assert.rejects(sponsorSession.sendTransaction(transaction), error => !error.transactionNotSubmitted && /Lost sponsored response/.test(error.message));
assert(sponsorSession.pendingTransaction().sponsored, 'uncertain sponsored sends keep the signed operation');
sponsorSession.dispose(); sponsorSession = await createSponsored();
sponsorSession.configureSponsorRpc(async () => {});
assert.equal(await sponsorSession.resumeTransaction(), hash); assert.equal(sponsoredSends, 2); assert.equal(sponsoredResumes, 1);
await sponsorSession.acknowledgeTransaction(hash);
await assert.rejects(sponsorSession.sendTransaction(transaction), error => !error.transactionNotSubmitted && /Lost sponsored response/.test(error.message));
confirmedFailure = true;
await assert.rejects(sponsorSession.resumeTransaction(), /Confirmed revert/);
assert.equal(sponsorSession.pendingTransaction(), null, 'canonical failed UserOps release their local pending record');
sponsoredFailure = false; confirmedFailure = false;
const callerRpc = async () => {}, recoveryRpc = async () => {};
sponsorSession.configureSponsorRpc(recoveryRpc);
await sponsorSession.sendTransaction(transaction, callerRpc);
assert.equal(sponsoredRpcs.at(-1), callerRpc, 'each sponsored action carries its own caller-bound transport');
await sponsorSession.acknowledgeTransaction(hash);
await sponsorSession.sendTransaction(transaction);
assert.equal(sponsoredRpcs.at(-1), recoveryRpc, 'a caller transport never overwrites shared management recovery');
await sponsorSession.acknowledgeTransaction(hash);
// The complete atomic purchase is pinned in the journal, including its approval.
const batchTransaction = { ...transaction, value: '0', approval: { to: transaction.to, data: '0x1234', value: '0' } };
sponsoredFailure = true;
await assert.rejects(sponsorSession.sendTransaction(batchTransaction), /Lost sponsored response/);
const pendingBatch = sponsorSession.pendingTransaction(), batchSends = sponsoredSends;
assert.deepEqual(pendingBatch.transaction.approval, batchTransaction.approval);
const batchJournalKey = 'mossvale.turnkey.pending.parent', batchJournal = stored.get(batchJournalKey);
for (const change of [approval => { approval.data = '0x5678'; }, approval => { approval.from = wallet.address; }]) {
  const changed = JSON.parse(batchJournal); change(changed.transaction.approval); stored.set(batchJournalKey, JSON.stringify(changed));
  assert.throws(() => sponsorSession.pendingTransaction(), /cannot be read/, 'tampered approval cannot become a recoverable purchase');
}
stored.set(batchJournalKey, batchJournal);

for (const approval of [{ ...batchTransaction.approval, data: '0x5678' }, { ...batchTransaction.approval, to: wallet.address }]) {
  await assert.rejects(sponsorSession.sendTransaction({ ...batchTransaction, approval }), error => error.code === 'WALLET_PENDING_TRANSACTION');
}
await assert.rejects(sponsorSession.sendPaidTransaction(batchTransaction, async () => assert.fail('No paid batch quote')), /Manual transfers/);
assert.equal(sponsoredSends, batchSends, 'changed or paid batches cannot submit over the saved operation');
sponsoredFailure = false;
assert.equal(await sponsorSession.resumeTransaction(), hash); await sponsorSession.acknowledgeTransaction(hash);
for (const invalid of [
  { ...batchTransaction, value: '1' },
  ...[{ ...batchTransaction.approval, value: '1' }, { ...batchTransaction.approval, from: wallet.address }, { ...batchTransaction.approval, data: '0x1' }].map(approval => ({ ...batchTransaction, approval })),
]) await assert.rejects(sponsorSession.sendTransaction(invalid), /approval|native currency/);
// Legacy single approval journals are preserved until explicit exact-operation recovery.
sponsoredFailure = true;
await assert.rejects(sponsorSession.sendTransaction(transaction), error => !error.transactionNotSubmitted && /Lost sponsored response/.test(error.message));
const legacyPending = sponsorSession.pendingTransaction();
const legacySends = sponsoredSends;
sponsoredResumeError = Error('The sponsorship status is unavailable.');
await assert.rejects(sponsorSession.sendTransaction(transaction), error => error === sponsoredResumeError && !error.transactionNotSubmitted, 'a saved operation failure cannot become a fresh-operation rejection');
assert.equal(sponsoredSends, legacySends); assert.deepEqual(sponsorSession.pendingTransaction(), legacyPending);
sponsoredResumeError = undefined;

await assert.rejects(sponsorSession.sendTransaction(batchTransaction), error => error.code === 'WALLET_PENDING_TRANSACTION' && !error.transactionNotSubmitted);
assert.deepEqual(sponsorSession.pendingTransaction(), legacyPending);
sponsoredFailure = false; await sponsorSession.resumeTransaction(); await sponsorSession.acknowledgeTransaction(hash);
await sponsorSession.sendTransaction(batchTransaction); await sponsorSession.acknowledgeTransaction(hash);
await sponsorSession.logout();
await assert.rejects(sponsorSession.sendTransaction(transaction), /disconnected/);
assert.equal(sends, sentPaid, 'sponsored sends never fall back to paid Turnkey Transaction Management');
console.log('Turnkey wallet checks passed: game identity binding, nonce-bound OAuth, cancelled login cleanup, EIP-191 proof, paid fee validation, shared payment recovery, expiry and logout.');
