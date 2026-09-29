import { getAddress, getBytes, hashMessage, isHexString, keccak256, sha256, Signature, toUtf8Bytes, verifyMessage } from 'ethers';
import type { TurnkeyClient } from '@turnkey/core';
import type { createSponsoredWallet, SponsoredRecord, SponsoredWalletRpc } from './turnkey-sponsored.ts';
export type { SponsoredWalletRpc } from './turnkey-sponsored.ts';

export type TurnkeyWalletConfig = { organizationId: string; authProxyConfigId: string };
export type TurnkeyOtpChallenge = { otpId: string; otpEncryptionTargetBundle: string };
export type TurnkeyAccount = { address: string; walletId: string };
export type TurnkeyApproval = { to: string; data: string; value: string };
export type TurnkeyTransaction = { from: string; to: string; data?: string; value?: string; chainId?: string | number; approval?: TurnkeyApproval };
export type PaidTransactionFees = {
  funded: false; chainId: 4663; nonce: string; gasLimit: string; maxFeePerGas: string; maxPriorityFeePerGas: string;
};
export type TurnkeyPendingTransaction = {
  organizationId: string; fingerprint: string; submittedAt: number;
  transaction: { from: string; to: string; data: string; value: string; approval?: TurnkeyApproval };
  nonce?: string; statusId?: string; hash?: string; sponsored?: SponsoredRecord;
};
type Client = Pick<TurnkeyClient, 'init' | 'initOtp' | 'completeOtp' | 'createApiKeyPair' | 'deleteApiKeyPair' | 'completeOauth' | 'getSession' | 'getActiveSessionKey' | 'clearSession' | 'overrideApiKeyStamper' | 'fetchWallets' | 'exportWalletAccount' | 'ethSendTransaction'> & {
  httpClient: Pick<TurnkeyClient['httpClient'], 'signRawPayload' | 'getNonces' | 'getSendTransactionStatus'>;
};
type Dependencies = {
  client?: Client; storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  lock?: <T>(name: string, action: () => Promise<T>) => Promise<T>;
  sponsoredWallet?: typeof createSponsoredWallet;
};

const ethereumWallet = {
  walletName: 'Mossvale Wallet',
  walletAccounts: [{ curve: 'CURVE_SECP256K1', pathFormat: 'PATH_FORMAT_BIP32', path: "m/44'/60'/0'/0/0", addressFormat: 'ADDRESS_FORMAT_ETHEREUM' }] as const,
};

/** Auth keys stay in Turnkey's browser SDK; each transaction has reviewed fees. */
export async function createTurnkeySession(config: TurnkeyWalletConfig, dependencies: Dependencies = {}) {
  const client = dependencies.client ?? new (await import('@turnkey/core')).TurnkeyClient(config);
  const storage = dependencies.storage ?? localStorage;
  const journalKey = `mossvale.turnkey.pending.${config.organizationId}`;
  const identityKey = `mossvale.turnkey.identity.${config.organizationId}`;
  const lock = dependencies.lock ?? (async <T>(name: string, action: () => Promise<T>) => {
    if (!navigator.locks) throw Error('This browser cannot safely coordinate wallet transactions. Please update your browser.');
    return navigator.locks.request(name, action);
  });
  let closed = false, authGeneration = 0, authenticating = false;
  let sponsorRpc: SponsoredWalletRpc | undefined;
  type Session = NonNullable<Awaited<ReturnType<Client['getSession']>>>;
  let pinned: Session | undefined, pinnedSessionKey: string | undefined;
  await client.init();

  function active(generation = authGeneration) { if (closed || generation !== authGeneration) throw Error('This wallet has been disconnected. Connect it again to continue.'); }
  function sameSession(left: Session | undefined, right: Session | undefined) {
    return !!left && !!right && left.organizationId === right.organizationId && left.userId === right.userId
      && left.publicKey === right.publicKey && left.token === right.token;
  }
  function changedSession() { return Error('The active wallet session changed in another tab. Connect your wallet again.'); }
  async function clearSession(expected = pinned, sessionKey = pinnedSessionKey) {
    sessionKey ??= await client.getActiveSessionKey();
    const storedSession = sessionKey ? await client.getSession({ sessionKey }) : undefined;
    expected ??= storedSession;
    let binding;
    try { binding = JSON.parse(storage.getItem(identityKey) ?? 'null'); } catch { /* Invalid bindings cannot authorize a session. */ }
    if (!binding || expected && (binding.publicKey ? binding.publicKey === expected.publicKey
      : binding.organizationId === expected.organizationId && binding.userId === expected.userId)) storage.removeItem(identityKey);
    // Each new login has its own slot: cancelling it cannot clear another tab's credentials.
    if (sessionKey && sameSession(expected, storedSession)) await client.clearSession({ sessionKey });
    else if (expected?.publicKey) await client.deleteApiKeyPair({ publicKey: expected.publicKey }).catch(() => {});
  }
  async function pinSession(current: Session, sessionKey: string | undefined, generation: number) {
    active(generation);
    if (!current.organizationId || !current.userId || !current.publicKey || !current.token) throw Error('The wallet returned an invalid game account session.');
    if (!(current.expiry * 1000 > Date.now())) throw Error('Your wallet session has expired. Sign in again to continue.');
    if (pinned && !sameSession(pinned, current)) throw changedSession();
    pinned = { ...current }; pinnedSessionKey = sessionKey;
    // The SDK otherwise reads the mutable active key again when it stamps a request.
    await client.overrideApiKeyStamper({ temporaryPublicKey: current.publicKey });
    active(generation);
    if (!sameSession(current, await client.getSession())) throw changedSession();
    active(generation);
  }
  async function session() {
    const generation = authGeneration;
    active();
    if (authenticating) throw Error('Finish the current wallet sign-in first.');
    const sessionKey = await client.getActiveSessionKey();
    const current = sessionKey ? await client.getSession({ sessionKey }) : undefined;
    active(generation);
    if (pinned && current && !sameSession(pinned, current)) throw changedSession();
    if (!current || current.expiry * 1000 <= Date.now()) return undefined;
    if (!pinned) await pinSession(current, sessionKey, generation);
    return current;
  }
  async function requireSession() {
    const current = await session();
    if (!current) throw Object.assign(Error('Your wallet session has expired. Reconnect your game session to continue.'), { code: 'WALLET_SESSION_EXPIRED' });
    return current;
  }
  async function accounts(): Promise<TurnkeyAccount[]> {
    const generation = authGeneration;
    const current = await session();
    if (!current) return [];
    const wallets = await client.fetchWallets({ organizationId: current.organizationId, userId: current.userId });
    await requireSession();
    active(generation);
    return wallets.flatMap(wallet => wallet.accounts
      .filter(account => account.addressFormat === 'ADDRESS_FORMAT_ETHEREUM')
      .map(account => ({ address: getAddress(account.address), walletId: wallet.walletId })));
  }
  async function ownAddress(address: string) {
    const normalized = getAddress(address);
    if (!(await accounts()).some(account => account.address === normalized)) throw Error('This address does not belong to the connected wallet.');
    return normalized;
  }
  function approvalCall(value: TurnkeyApproval): TurnkeyApproval {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 3
      || Object.keys(value).some(key => !['to', 'data', 'value'].includes(key))
      || typeof value.to !== 'string' || typeof value.data !== 'string' || typeof value.value !== 'string'
      || !isHexString(value.data, true) || value.data.length > 65538 || BigInt(value.value) !== 0n) throw Error('Invalid purchase approval.');
    return { to: getAddress(value.to), data: value.data, value: '0' };
  }
  const pendingConflict = () => Object.assign(Error('Check the pending transaction in Settings → Wallet → Activity before starting another payment.'), { code: 'WALLET_PENDING_TRANSACTION' });
  function pendingTransaction(): TurnkeyPendingTransaction | null {
    const raw = storage.getItem(journalKey);
    if (!raw) return null;
    try {
      const pending = JSON.parse(raw) as TurnkeyPendingTransaction;
      if (typeof pending.organizationId !== 'string' || !pending.organizationId || !isHexString(pending.fingerprint, 32)
        || !pending.transaction || !Number.isFinite(pending.submittedAt)
        || pending.hash !== undefined && !isHexString(pending.hash, 32)
        || pending.sponsored !== undefined && (!pending.sponsored || typeof pending.sponsored !== 'object' || !pending.sponsored.prepared || !pending.sponsored.signed)
        || pending.statusId !== undefined && (typeof pending.statusId !== 'string' || !pending.statusId)
        || pending.nonce !== undefined && (typeof pending.nonce !== 'string' || !/^\d+$/.test(pending.nonce))) throw Error();
      const { from, to, data, value, approval } = pending.transaction;
      if (approval !== undefined && (!pending.sponsored || value !== '0' || JSON.stringify(approvalCall(approval)) !== JSON.stringify(approval))) throw Error();
      if (getAddress(from) !== from || getAddress(to) !== to || !isHexString(data, true)
        || typeof value !== 'string' || !/^\d+$/.test(value) || BigInt(value) >= 2n ** 256n
        || keccak256(toUtf8Bytes(JSON.stringify({ from, to, data, value, ...(approval ? { approval } : {}) }))) !== pending.fingerprint) throw Error();
      return pending;
    } catch { throw Error('The saved wallet transaction cannot be read. Check its on-chain status before trying again.'); }
  }
  function save(pending: TurnkeyPendingTransaction) { storage.setItem(journalKey, JSON.stringify(pending)); }
  function sponsoredFailure(error: unknown): never {
    if (error instanceof Error && 'confirmedSponsoredFailure' in error && error.confirmedSponsoredFailure === true) storage.removeItem(journalKey);
    throw error;
  }
  async function resume(pending: TurnkeyPendingTransaction, requestRpc = sponsorRpc): Promise<string> {
    const generation = authGeneration;
    const current = await requireSession();
    active(generation);
    if (pending.organizationId !== current.organizationId) throw Error('Sign in to the wallet that submitted the pending transaction first.');
    if (pending.hash) return pending.hash;
    if (pending.sponsored) {
      const wallet = await sponsoredWallet(pending.transaction.from, requestRpc);
      const hash = await wallet.resume(pending.transaction, pending.sponsored).catch(sponsoredFailure);
      await requireSession(); active(generation); save({ ...pending, hash }); return hash;
    }
    if (!pending.statusId) throw Error('The previous submission has an unknown status. Check wallet activity before submitting again; it has not been resent.');
    const deadline = Date.now() + 60_000;
    do {
      await requireSession();
      const result = await client.httpClient.getSendTransactionStatus({ organizationId: current.organizationId, sendTransactionStatusId: pending.statusId });
      await requireSession();
      active(generation);
      if (result.txStatus === 'FAILED' || result.txStatus === 'INCLUDED' && result.error) {
        storage.removeItem(journalKey);
        throw Error(result.error?.message || 'The wallet transaction failed.');
      }
      if (result.txStatus === 'INCLUDED') {
        const hash = result.eth?.txHash;
        if (!hash || !isHexString(hash, 32)) throw Error('Turnkey included the transaction but returned no valid transaction hash. Check wallet activity.');
        save({ ...pending, hash });
        return hash;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    } while (Date.now() < deadline);
    throw Error('Your wallet transaction is still pending. Retry to check its status; it will not be sent again.');
  }

  async function sendPaid(input: TurnkeyTransaction, quoteFees?: () => Promise<PaidTransactionFees>): Promise<string> {
    if (input.approval !== undefined) throw Error('Manual transfers cannot include a purchase approval.');
    return lock(journalKey, async () => {
      const generation = authGeneration, current = await requireSession();
      if (input.chainId !== undefined && BigInt(input.chainId) !== 4663n) throw Error('Mossvale Wallet only supports Robinhood Chain.');
      const transaction = { from: await ownAddress(input.from), to: getAddress(input.to), data: input.data ?? '0x', value: BigInt(input.value ?? '0').toString() };
      if (!isHexString(transaction.data, true) || BigInt(transaction.value) < 0n || BigInt(transaction.value) >= 2n ** 256n) throw Error('Invalid wallet transaction.');
      active(generation);
      const fingerprint = keccak256(toUtf8Bytes(JSON.stringify(transaction)));
      const existing = pendingTransaction();
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw pendingConflict();
        return resume(existing);
      }
      if (!quoteFees) throw Error('Review the network fees before sending this transaction.');
      const funding = await quoteFees();
      active(generation);
      await requireSession();
      if (!funding || funding.funded !== false || funding.chainId !== 4663
        || ![funding.nonce, funding.gasLimit, funding.maxFeePerGas, funding.maxPriorityFeePerGas].every(value => typeof value === 'string' && /^0x(?:0|[1-9a-f][\da-f]*)$/i.test(value))) throw Error('The wallet returned an invalid transaction fee quote.');
      const gasLimit = BigInt(funding.gasLimit), maxFeePerGas = BigInt(funding.maxFeePerGas), maxPriorityFeePerGas = BigInt(funding.maxPriorityFeePerGas);
      if (BigInt(funding.nonce) >= 2n ** 64n || gasLimit <= 0n || gasLimit >= 2n ** 64n || maxFeePerGas <= 0n || maxFeePerGas >= 2n ** 256n
        || maxPriorityFeePerGas > maxFeePerGas || gasLimit * maxFeePerGas >= 2n ** 256n) throw Error('The wallet returned invalid transaction fees.');
      const { nonce: currentNonce } = await client.httpClient.getNonces({ organizationId: current.organizationId, address: transaction.from, caip2: 'eip155:4663', nonce: true });
      if (!currentNonce || !/^\d+$/.test(currentNonce)) throw Error('Could not confirm the wallet transaction nonce. Try again.');
      const nonce = BigInt(funding.nonce).toString();
      if (BigInt(currentNonce).toString() !== nonce) throw Error('Your wallet activity changed after fee review. Review the transaction again before sending.');
      const pending: TurnkeyPendingTransaction = { organizationId: current.organizationId, fingerprint, submittedAt: Date.now(), transaction, nonce };
      await requireSession();
      active(generation);
      // Journal before submission: a lost response must never result in a second payment.
      save(pending);
      const statusId = await client.ethSendTransaction({ organizationId: current.organizationId, transaction: {
        ...transaction, caip2: 'eip155:4663', sponsor: false, nonce,
        gasLimit: gasLimit.toString(), maxFeePerGas: maxFeePerGas.toString(), maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
      } });
      pending.statusId = statusId;
      save(pending);
      return resume(pending);
    });
  }

  async function sponsoredWallet(address: string, requestRpc = sponsorRpc) {
    const generation = authGeneration, current = await requireSession();
    if (!requestRpc) throw Error('Fee sponsorship is not available. No transaction was submitted.');
    const create = dependencies.sponsoredWallet ?? (await import('./turnkey-sponsored.ts')).createSponsoredWallet;
    return create({ httpClient: client.httpClient as TurnkeyClient['httpClient'], organizationId: current.organizationId, address,
      rpc: requestRpc, guard: async () => { await requireSession(); active(generation); } });
  }
  async function sendSponsored(input: TurnkeyTransaction, requestRpc = sponsorRpc): Promise<string> {
    input = structuredClone(input);
    return lock(journalKey, async () => {
      const generation = authGeneration, current = await requireSession();
      if (input.chainId !== undefined && BigInt(input.chainId) !== 4663n) throw Error('Mossvale Wallet only supports Robinhood Chain.');
      const transaction = { from: await ownAddress(input.from), to: getAddress(input.to), data: input.data ?? '0x', value: BigInt(input.value ?? '0').toString(),
        ...(input.approval !== undefined ? { approval: approvalCall(input.approval) } : {}) };
      if (!isHexString(transaction.data, true) || transaction.data.length > 65538 || BigInt(transaction.value) < 0n || BigInt(transaction.value) >= 2n ** 256n) throw Error('Invalid wallet transaction.');
      if (transaction.approval && transaction.value !== '0') throw Error('Purchase batches cannot transfer native currency.');
      active(generation);
      const fingerprint = keccak256(toUtf8Bytes(JSON.stringify(transaction))), existing = pendingTransaction();
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw pendingConflict();
        return resume(existing, requestRpc);
      }
      let submissionStarted = false;
      try {
        const wallet = await sponsoredWallet(transaction.from, requestRpc);
        const pending: TurnkeyPendingTransaction = { organizationId: current.organizationId, fingerprint, submittedAt: Date.now(), transaction };
        const hash = await wallet.send(transaction, sponsored => {
          // Latch before writing the signed operation: every later failure is uncertain.
          submissionStarted = true; active(generation); save({ ...pending, sponsored });
        });
        await requireSession(); active(generation);
        const journal = pendingTransaction();
        if (!journal?.sponsored || journal.fingerprint !== fingerprint || !isHexString(hash, 32)) throw Error('The sponsored operation could not be confirmed. Check wallet activity.');
        save({ ...journal, hash }); return hash;
      } catch (error) {
        if (!submissionStarted) throw Object.assign(new Error(error instanceof Error ? error.message : 'The payment could not be prepared. Try again.'), { transactionNotSubmitted: true });
        return sponsoredFailure(error);
      }
    });
  }

  return {
    accounts,
    async assertIdentity(identity: string) {
      const generation = authGeneration;
      const current = await requireSession();
      active(generation);
      let binding;
      try { binding = JSON.parse(storage.getItem(identityKey) ?? 'null'); } catch { /* Invalid bindings cannot authorize a restored wallet. */ }
      if (!identity || binding?.identity !== identity || binding?.organizationId !== current.organizationId
        || !current.userId || binding?.userId !== current.userId || binding?.publicKey !== current.publicKey) {
        authGeneration++;
        await clearSession();
        throw Object.assign(Error('This wallet is not authenticated for the current game account. Reconnect your game session.'), { code: 'WALLET_IDENTITY_REQUIRED' });
      }
    },
    async authenticateWithGame(getToken: (nonce: string) => Promise<{ idToken: string; identity: string }>, expectedIdentity: string) {
      active();
      if (!expectedIdentity) throw Error('Sign in to your game account before opening the wallet.');
      if (authenticating) throw Error('Finish the current wallet sign-in first.');
      authenticating = true;
      const generation = ++authGeneration;
      const sessionKey = `${identityKey}.session.${crypto.randomUUID()}`;
      pinned = undefined; pinnedSessionKey = undefined;
      let publicKey: string | undefined, submitted = false;
      try {
        publicKey = await client.createApiKeyPair();
        active(generation);
        const token = await getToken(sha256(toUtf8Bytes(publicKey)).slice(2));
        active(generation);
        if (!token || token.identity !== expectedIdentity || typeof token.idToken !== 'string' || !token.idToken) throw Error('Your game account changed during wallet sign-in. Try again.');
        submitted = true;
        const result = await client.completeOauth({
          oidcToken: token.idToken, publicKey, sessionKey, providerName: 'Mossvale', expirationSeconds: '900',
          createSubOrgParams: { customWallet: { ...ethereumWallet, walletAccounts: [...ethereumWallet.walletAccounts] } },
        });
        active(generation);
        const current = await client.getSession();
        active(generation);
        if (!result?.sessionToken || !current || current.token !== result.sessionToken || current.publicKey !== publicKey) throw changedSession();
        await pinSession(current, sessionKey, generation);
        storage.setItem(identityKey, JSON.stringify({ identity: expectedIdentity, organizationId: current.organizationId, userId: current.userId, publicKey }));
      } catch (error) {
        // A late SDK response can store credentials after logout or navigation.
        if (submitted) await clearSession(await client.getSession({ sessionKey }), sessionKey);
        if (publicKey) await client.deleteApiKeyPair({ publicKey }).catch(() => {});
        throw error;
      } finally { authenticating = false; }
    },
    async sendCode(email: string): Promise<TurnkeyOtpChallenge> {
      active();
      return client.initOtp({ otpType: 'OTP_TYPE_EMAIL' as Parameters<Client['initOtp']>[0]['otpType'], contact: email.trim() });
    },
    async verifyCode(challenge: TurnkeyOtpChallenge, code: string, email: string) {
      active();
      if (authenticating) throw Error('Finish the current wallet sign-in first.');
      authenticating = true;
      const generation = ++authGeneration;
      const sessionKey = `${identityKey}.session.${crypto.randomUUID()}`;
      pinned = undefined; pinnedSessionKey = undefined;
      try {
        const result = await client.completeOtp({
          ...challenge, sessionKey, otpCode: code.trim(), contact: email.trim(), otpType: 'OTP_TYPE_EMAIL' as Parameters<Client['initOtp']>[0]['otpType'],
          createSubOrgParams: { customWallet: { ...ethereumWallet, walletAccounts: [...ethereumWallet.walletAccounts] } },
        });
        active(generation);
        const current = await client.getSession();
        if (!result?.sessionToken || !current || current.token !== result.sessionToken) throw changedSession();
        await pinSession(current, sessionKey, generation);
        storage.removeItem(identityKey);
      } catch (error) {
        await clearSession(await client.getSession({ sessionKey }), sessionKey);
        throw error;
      } finally { authenticating = false; }
    },
    async signMessage(hex: string, address: string) {
      const generation = authGeneration;
      const current = await requireSession();
      const signWith = await ownAddress(address);
      if (!isHexString(hex)) throw Error('The wallet message must be hex-encoded bytes.');
      const message = getBytes(hex);
      await requireSession();
      active(generation);
      const signature = await client.httpClient.signRawPayload({
        organizationId: current.organizationId, signWith, payload: hashMessage(message),
        encoding: 'PAYLOAD_ENCODING_HEXADECIMAL', hashFunction: 'HASH_FUNCTION_NO_OP',
      });
      await requireSession();
      active(generation);
      const serialized = Signature.from({ r: `0x${signature.r}`, s: `0x${signature.s}`, v: Number(signature.v) + 27 }).serialized;
      if (getAddress(verifyMessage(message, serialized)) !== signWith) throw Error('The wallet signature did not match the requested account.');
      return serialized;
    },
    configureSponsorRpc(rpc: SponsoredWalletRpc) { active(); sponsorRpc = rpc; },
    sendTransaction: sendSponsored,
    sendPaidTransaction: sendPaid,
    pendingTransaction,
    async resumeTransaction() {
      return lock(journalKey, async () => {
        const pending = pendingTransaction();
        if (!pending) throw Error('There is no pending wallet transaction.');
        return resume(pending);
      });
    },
    async acknowledgeTransaction(hash: string) {
      return lock(journalKey, async () => {
        const pending = pendingTransaction();
        if (pending?.hash === hash) storage.removeItem(journalKey);
      });
    },
    async exportWalletAccount(address: string, targetPublicKey: string) {
      const generation = authGeneration;
      const normalized = getAddress(address);
      const current = await requireSession();
      if ((await accounts())[0]?.address !== normalized) throw Error('Only the primary wallet account can be backed up.');
      await requireSession();
      active(generation);
      const bundle = await client.exportWalletAccount({ organizationId: current.organizationId, address: normalized, targetPublicKey });
      await requireSession();
      active(generation);
      return { bundle, organizationId: current.organizationId, address: normalized };
    },
    dispose() { closed = true; authGeneration++; },
    async logout() {
      closed = true; authGeneration++;
      await clearSession();
    },
  };
}

export type TurnkeyWalletSession = Awaited<ReturnType<typeof createTurnkeySession>>;
