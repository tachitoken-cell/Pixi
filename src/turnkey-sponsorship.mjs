import { createHash } from 'node:crypto';
import pg from 'pg';
import { FetchRequest, Interface, JsonRpcProvider, concat, isHexString, toBeHex, ZeroAddress } from 'ethers';
import { normalizeTurnkeyGasTransaction } from './turnkey-gas-intent.mjs';
import { tokenAuctionInterface, erc20Interface } from './auction-chain.mjs';
import { MOSS_TOKEN } from './auction.ts';
import { SPONSORED_DELEGATE, SPONSORED_ENTRY_POINT, SPONSORED_NATIVE_TOKEN, signedIdentity, validateSponsoredPrepared, validateSponsoredSigned } from './turnkey-sponsored-validation.mjs';

export const sponsorshipError = (status, message) => Object.assign(Error(message), { sponsorship: true, status });
const fail = (status, message) => { throw sponsorshipError(status, message); };
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const lockId = createHash('sha256').update('mossvale-fee-sponsorship:4663').digest().readBigInt64BE().toString();
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const operationEvent = new Interface(['event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)']);
const entryPoint = new Interface(['function getNonce(address sender,uint192 key) view returns(uint256)']);
const paymasterValidation = new Interface(['function validatePaymasterUserOp((address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature) userOp,bytes32 userOpHash,uint256 maxCost) returns(bytes context,uint256 validationData)']);
const budgets = { maxOperationWei: 'TURNKEY_SPONSOR_MAX_OPERATION_WEI', accountDailyWei: 'TURNKEY_SPONSOR_ACCOUNT_DAILY_WEI',
  walletDailyWei: 'TURNKEY_SPONSOR_WALLET_DAILY_WEI', globalDailyWei: 'TURNKEY_SPONSOR_GLOBAL_DAILY_WEI', maxFeePerGasWei: 'TURNKEY_SPONSOR_MAX_FEE_PER_GAS_WEI' };

export function createTurnkeySponsorshipConfig(env = process.env) {
  const names = ['ALCHEMY_WALLET_API_KEY', 'ALCHEMY_GAS_POLICY_ID', 'TURNKEY_SPONSOR_GLOBAL_DAILY_OPERATIONS', ...Object.values(budgets)];
  if (names.every(name => env[name] === undefined || env[name] === '')) return null;
  const invalid = () => Error('Fee sponsorship requires an Alchemy API key, policy ID and every explicit positive wei limit.');
  if (!/^[\w-]{8,256}$/.test(env.ALCHEMY_WALLET_API_KEY ?? '') || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(env.ALCHEMY_GAS_POLICY_ID ?? '')) throw invalid();
  const config = { apiKey: env.ALCHEMY_WALLET_API_KEY, policyId: env.ALCHEMY_GAS_POLICY_ID };
  if (!/^[1-9]\d{0,6}$/.test(env.TURNKEY_SPONSOR_GLOBAL_DAILY_OPERATIONS ?? '') || Number(env.TURNKEY_SPONSOR_GLOBAL_DAILY_OPERATIONS) > 1000000) throw invalid();
  config.globalDailyOperations = Number(env.TURNKEY_SPONSOR_GLOBAL_DAILY_OPERATIONS);
  for (const [key, name] of Object.entries(budgets)) {
    if (!/^[1-9]\d{0,77}$/.test(env[name] ?? '') || BigInt(env[name]) >= 2n ** 256n) throw invalid();
    config[key] = BigInt(env[name]);
  }
  if (config.maxOperationWei > config.accountDailyWei || config.maxOperationWei > config.walletDailyWei
    || config.accountDailyWei > config.globalDailyWei || config.walletDailyWei > config.globalDailyWei) throw invalid();
  return config;
}

function oneParameter(params) {
  if (!Array.isArray(params) || params.length !== 1) fail(400, 'Send exactly one wallet operation.');
  return params[0];
}
function noCapabilities(value) {
  if (value?.capabilities !== undefined && (!value.capabilities || typeof value.capabilities !== 'object'
    || Array.isArray(value.capabilities) || Object.keys(value.capabilities).length)) fail(400, 'Wallet sponsorship capabilities are selected by the game.');
}
function prepareTransaction(input) {
  noCapabilities(input);
  if (!input || typeof input !== 'object' || Object.keys(input).some(key => !['from', 'chainId', 'calls', 'capabilities'].includes(key))
    || !Array.isArray(input.calls) || input.calls.length < 1 || input.calls.length > 2
    || input.calls.some(call => !call || typeof call !== 'object' || Array.isArray(call) || Object.keys(call).some(key => !['to', 'data', 'value'].includes(key))))
    fail(400, 'Sponsor one exact game action at a time.');
  const transaction = normalizeTurnkeyGasTransaction({ from: input.from, chainId: input.chainId, ...input.calls.at(-1),
    ...(input.calls.length === 2 ? { approval: input.calls[0] } : {}) });
  return transaction;
}
const calls = row => [...(row.transaction.approval ? [row.transaction.approval] : []), { to: row.transaction.to, data: row.transaction.data, value: row.transaction.value }];
const details = row => ({ type: 'user-operation', data: { hash: row.user_op_hash, calls: calls(row) } });
const sentResult = row => ({ id: row.call_id, preparedCallIds: [row.call_id], details: details(row) });

async function paymasterWindow(provider, preparedInfo, block) {
  const op = preparedInfo.parts.find(part => part.type === 'user-operation-v070').data;
  // ERC-4337 v0.7 IPaymaster/Helpers define this return value. Ask the deployed contract;
  // paymasterData itself has no standard timestamp layout and must not be sliced by guesswork.
  const packed = [op.sender, op.nonce, '0x', op.callData, concat([toBeHex(op.verificationGasLimit, 16), toBeHex(op.callGasLimit, 16)]),
    op.preVerificationGas, concat([toBeHex(op.maxPriorityFeePerGas, 16), toBeHex(op.maxFeePerGas, 16)]),
    concat([op.paymaster, toBeHex(op.paymasterVerificationGasLimit, 16), toBeHex(op.paymasterPostOpGasLimit, 16), op.paymasterData]), '0x'];
  let data;
  try { data = paymasterValidation.decodeFunctionResult('validatePaymasterUserOp', await provider.call({ from: SPONSORED_ENTRY_POINT,
    to: op.paymaster, data: paymasterValidation.encodeFunctionData('validatePaymasterUserOp', [packed, preparedInfo.userOpHash, preparedInfo.costWei]), blockTag: block.number }))[1]; }
  catch { fail(503, 'The deployed paymaster could not verify a bounded sponsorship expiry.'); }
  const until = Number(data >> 160n & ((1n << 48n) - 1n)), after = Number(data >> 208n);
  if ((data & ((1n << 160n) - 1n)) !== 0n || !until || after > until) fail(503, 'The paymaster returned an invalid sponsorship authorization.');
  return { until, after };
}
export async function readSponsoredExpiry(provider, preparedInfo) {
  const block = await provider.getBlock('latest');
  if (!block || !Number.isSafeInteger(block.timestamp) || !Number.isSafeInteger(block.number)) fail(503, 'The paymaster validity block is unavailable.');
  const { until, after } = await paymasterWindow(provider, preparedInfo, block);
  if (after > block.timestamp || until < block.timestamp + 60 || until > block.timestamp + 3600
    || (await provider.getBlock(block.number))?.hash !== block.hash) fail(503, 'The paymaster returned an invalid or expired sponsorship authorization.');
  return until;
}

/** Private Wallet APIs proxy. Only exact persisted game operations can obtain or spend a sponsorship quote. */
export function createTurnkeySponsorship({ config, connection, provider: suppliedProvider, request: suppliedRequest } = {}) {
  if (!config) return { enabled: false, async start() {}, async close() {}, async sponsoredOperation() { return null; }, async rpc() { fail(503, 'Mossvale fee sponsorship is not configured.'); } };
  if (!connection?.connectionString) throw Error('Fee sponsorship requires the canonical PostgreSQL database.');
  const rpc = new FetchRequest(`https://robinhood-mainnet.g.alchemy.com/v2/${config.apiKey}`); rpc.timeout = 10000;
  const provider = suppliedProvider || new JsonRpcProvider(rpc, undefined, { cacheTimeout: -1 });
  const pool = new pg.Pool({ ...connection, max: 1, connectionTimeoutMillis: 5000 }); pool.on('error', () => {});
  const running = new Set(); let started = false, closing = false, closingTask;
  const request = suppliedRequest || (async (method, params) => {
    let result;
    try {
      const response = await fetch(`https://api.g.alchemy.com/v2/${config.apiKey}`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      if (!response.ok) throw Error();
      const text = await response.text(); if (text.length > 524288) throw Error(); result = JSON.parse(text);
    } catch { fail(503, 'The wallet provider is unavailable. Resume the saved operation before trying another payment.'); }
    if (result?.error?.code === 5730) throw Object.assign(sponsorshipError(404, 'The saved wallet operation is not yet known to the provider.'), { rpcCode: 5730 });
    if (!result || result.error || !Object.hasOwn(result, 'result')) fail(503, 'The wallet provider could not complete the saved operation.');
    return result.result;
  });
  // ponytail: one cross-realm lock fits the initial 100-operation daily cap; revisit lock granularity if throughput grows.
  async function locked(operation) {
    const client = await pool.connect(); let acquired = false, broken = false;
    try { await client.query('SELECT pg_advisory_lock($1::bigint)', [lockId]); acquired = true; return await operation(client); }
    finally { if (acquired) { try { await client.query('SELECT pg_advisory_unlock($1::bigint)', [lockId]); } catch { broken = true; } } client.release(broken); }
  }
  function info(row) { return validateSponsoredPrepared(row.prepared, row.transaction, config); }
  async function currentNonce(transaction, preparedInfo, blockTag = 'latest') {
    const nonce = BigInt(preparedInfo.parts.find(part => part.type === 'user-operation-v070').data.nonce);
    return entryPoint.decodeFunctionResult('getNonce', await provider.call({ to: SPONSORED_ENTRY_POINT,
      data: entryPoint.encodeFunctionData('getNonce', [transaction.from, nonce >> 64n]), blockTag }))[0];
  }
  const nonceAt = async (transaction, preparedInfo, blockTag) => BigInt(preparedInfo.parts.find(part => part.type === 'user-operation-v070').data.nonce) === await currentNonce(transaction, preparedInfo, blockTag);
  async function releaseExpired(client) {
    const { rows } = await client.query('SELECT * FROM mossvale_sponsored_operations WHERE settled_at IS NULL AND expired_at IS NULL AND valid_until < $1 LIMIT 100', [Math.floor(Date.now() / 1000) - 60]);
    if (!rows.length) return;
    const block = await provider.getBlock('finalized');
    if (!block || !Number.isSafeInteger(block.timestamp) || !Number.isSafeInteger(block.number)) return;
    for (const row of rows) {
      if (Number(row.valid_until) + 60 >= block.timestamp) continue;
      const checked = info(row), { until } = await paymasterWindow(provider, checked, block);
      if (until !== Number(row.valid_until)) continue;
      const unused = await nonceAt(row.transaction, checked, block.number);
      if ((await provider.getBlock(block.number))?.hash !== block.hash) fail(503, 'The sponsorship expiry block changed.');
      // Expiry prevents future spend even if past execution is unknown. Keep the full
      // proof-day budget; only an unchanged finalized nonce also proves non-execution.
      const now = Date.now();
      await client.query('UPDATE mossvale_sponsored_operations SET expired_at=$2,released_at=$3 WHERE fingerprint=$1', [row.fingerprint, now, unused ? now : null]);
    }
  }
  async function usableQuote(row) {
    const block = await provider.getBlock('latest');
    if (!block || !Number.isSafeInteger(block.timestamp) || !Number.isSafeInteger(block.number)
      || (await provider.getBlock(block.number))?.hash !== block.hash) fail(503, 'The sponsorship validity block is unavailable.');
    if (block.timestamp + 60 >= Number(row.valid_until)) fail(409, 'This sponsorship quote is expiring. Wait for its finalized expiry before reviewing this action again.');
  }
  async function current(authorize, transaction, expectedId) {
    const intent = await authorize(transaction);
    if (!intent?.id || expectedId && intent.id !== expectedId || JSON.stringify(normalizeTurnkeyGasTransaction(intent.transaction)) !== JSON.stringify(normalizeTurnkeyGasTransaction(transaction)))
      fail(409, 'The reviewed game action changed. Review it again.');
    return intent;
  }
  async function chainWallet(transaction, preparedInfo) {
    if (BigInt(await provider.send('eth_chainId', [])) !== 4663n) fail(503, 'Fee sponsorship is on the wrong chain.');
    const code = (await provider.getCode(transaction.from, 'latest')).toLowerCase(), delegated = `0xef0100${SPONSORED_DELEGATE.slice(2).toLowerCase()}`;
    if (code !== '0x' && code !== delegated) fail(422, 'This wallet uses an unsupported smart-account delegation.');
    if (BigInt(transaction.value) > await provider.getBalance(transaction.from, 'latest')) fail(422, 'Your wallet must already hold the purchase amount. Sponsorship pays network fees only.');
    if (preparedInfo) {
      if (!await nonceAt(transaction, preparedInfo)) fail(409, 'The smart wallet nonce changed. The saved operation needs review.');
      const authorization = preparedInfo.parts.find(part => part.type === 'authorization');
      if (code === '0x' && !authorization) fail(409, 'This wallet needs a reviewed delegation authorization.');
      if (authorization && BigInt(authorization.data.nonce) !== BigInt(await provider.getTransactionCount(transaction.from, 'pending')))
        fail(409, 'The wallet delegation nonce changed. The saved operation needs review.');
    }
  }
  function eventMatches(receipt, row, success) {
    return receipt?.logs?.some(log => {
      if (!same(log.address, SPONSORED_ENTRY_POINT)) return false;
      try { const event = operationEvent.parseLog(log); return same(event.args.userOpHash, row.user_op_hash) && same(event.args.sender, row.wallet)
        && same(event.args.paymaster, row.paymaster) && event.args.success === success; } catch { return false; }
    });
  }
  async function readStatus(client, row) {
    const result = await request('wallet_getCallsStatus', [row.call_id]);
    if (result?.id !== row.call_id || BigInt(result.chainId ?? 0) !== 4663n || ![100, 110, 115, 116, 200, 400, 500, 600].includes(result.status))
      fail(503, 'The wallet provider returned an unexpected operation status.');
    if (result.status === 400) fail(503, 'The provider stopped retrying this signed operation. Its saved authorization requires review before a replacement.');
    let receipts;
    if ([200, 500, 600].includes(result.status)) {
      if (result.receipts?.length !== 1 || !isHexString(result.receipts[0].transactionHash, 32)) fail(503, 'The saved operation receipt is missing.');
      const receipt = await provider.getTransactionReceipt(result.receipts[0].transactionHash);
      const block = receipt && await provider.getBlock(receipt.blockNumber);
      if (receipt?.status !== 1 || !block || block.hash !== receipt.blockHash || !eventMatches(receipt, row, result.status === 200))
        fail(503, 'The saved operation does not yet have a canonical matching receipt.');
      receipts = [{ transactionHash: receipt.hash ?? receipt.transactionHash, blockHash: receipt.blockHash, blockNumber: `0x${BigInt(receipt.blockNumber).toString(16)}`,
        gasUsed: `0x${BigInt(receipt.gasUsed).toString(16)}`, status: '0x1',
        logs: receipt.logs.map(({ address, data, topics }) => ({ address, data, topics })) }];
      if (!Number.isSafeInteger(block.timestamp) || block.timestamp <= 0) fail(503, 'The operation block timestamp is unavailable.');
      const finalized = await provider.getBlock('finalized');
      const final = finalized && Number.isSafeInteger(finalized.number) && finalized.number >= receipt.blockNumber && isHexString(finalized.hash, 32);
      if (final && (await provider.getBlock(finalized.number))?.hash !== finalized.hash
        || (await provider.getBlock(receipt.blockNumber))?.hash !== receipt.blockHash) fail(503, 'The saved operation receipt changed while checking finality.');
      // Canonical inclusion can be shown immediately, but only finalized execution may
      // stop reserving a later day's budget: a live quote could be re-included after midnight.
      await client.query('UPDATE mossvale_sponsored_operations SET transaction_hash=$2, settled_at=$3 WHERE fingerprint=$1',
        [row.fingerprint, receipts[0].transactionHash, final ? block.timestamp * 1000 : null]);
    } else {
      await client.query('UPDATE mossvale_sponsored_operations SET settled_at=NULL WHERE fingerprint=$1', [row.fingerprint]);
    }
    const safe = { id: row.call_id, chainId: '0x1237', version: '2.0.0', atomic: true, status: result.status, details: details(row), ...(receipts ? { receipts } : {}) };
    await client.query('UPDATE mossvale_sponsored_operations SET status = $2 WHERE fingerprint = $1', [row.fingerprint, JSON.stringify(safe)]);
    return safe;
  }
  async function budget(client, accountKey, wallet, cost) {
    const day = Math.floor(Date.now() / 86400000);
    const { rows: [spent] } = await client.query(`SELECT COUNT(*)::text AS count, COALESCE(SUM(cost_wei),0)::text AS global,
      COALESCE(SUM(cost_wei) FILTER (WHERE account_key=$2),0)::text AS account,
      COALESCE(SUM(cost_wei) FILTER (WHERE wallet=$3),0)::text AS wallet FROM mossvale_sponsored_operations
      WHERE day=$1 OR (settled_at IS NULL AND expired_at IS NULL) OR (settled_at >= $4 AND settled_at < $5)
        OR (expired_at >= $4 AND expired_at < $5)`, [day, accountKey, wallet, day * 86400000, (day + 1) * 86400000]);
    if (Number(spent.count) >= config.globalDailyOperations || BigInt(spent.global) + cost > config.globalDailyWei
      || BigInt(spent.account) + cost > config.accountDailyWei || BigInt(spent.wallet) + cost > config.walletDailyWei)
      fail(429, 'The daily fee sponsorship allowance has been reached.');
    return day;
  }
  async function prepare(client, accountKey, input, authorize) {
    const transaction = prepareTransaction(input), intent = await current(authorize, transaction), wallet = transaction.from.toLowerCase();
    let approval;
    if (intent.id.endsWith(':approve') && same(transaction.to, MOSS_TOKEN.address) && BigInt(transaction.value) === 0n) {
      try {
        const parsed = erc20Interface.parseTransaction({ data: transaction.data });
        if (parsed?.name === 'approve' && erc20Interface.encodeFunctionData('approve', parsed.args).toLowerCase() === transaction.data && parsed.args[1] > 0n) approval = parsed.args;
      } catch { /* Only the exact matcher-approved token allowance can repeat. */ }
    }
    await releaseExpired(client);
    const old = (await client.query('SELECT * FROM mossvale_sponsored_operations WHERE account_key = $1 AND wallet = $2 AND intent_id = $3 ORDER BY created_at DESC LIMIT 1', [accountKey, wallet, intent.id])).rows[0];
    if (old && !old.released_at) {
      const failed = [500, 600].includes(old.status?.status), repeatable = (intent.withdrawal || approval) && old.status?.status === 200;
      if (!failed && !repeatable) { await usableQuote(old); return old.prepared; }
      const status = await readStatus(client, old);
      if (!([500, 600].includes(status.status) || (intent.withdrawal || approval) && status.status === 200)) { await usableQuote(old); return old.prepared; }
      if (status.status === 200 && approval) {
        const allowance = erc20Interface.decodeFunctionResult('allowance', await provider.call({ to: MOSS_TOKEN.address,
          data: erc20Interface.encodeFunctionData('allowance', [transaction.from, approval[0]]) }))[0];
        if (allowance >= approval[1]) return old.prepared;
        const checked = info(old), previousNonce = BigInt(checked.parts.find(part => part.type === 'user-operation-v070').data.nonce);
        if (await currentNonce(transaction, checked) <= previousNonce) fail(409, 'The successful approval nonce is not yet consumed. Wait before approving again.');
      }
    }
    if (intent.withdrawal) {
      const amount = tokenAuctionInterface.decodeFunctionResult('proceeds', await provider.call({ to: intent.withdrawal.contract,
        data: tokenAuctionInterface.encodeFunctionData('proceeds', [transaction.from]) }))[0];
      if (amount <= 0n) fail(409, 'There are no auction proceeds to withdraw.');
    }
    // Reject exhausted budgets before asking the provider to issue another payable authorization.
    const day = await budget(client, accountKey, wallet, config.maxOperationWei);
    await chainWallet(transaction);
    const prepared = await request('wallet_prepareCalls', [{ from: transaction.from, chainId: '0x1237', calls: calls({ transaction }),
      capabilities: { paymasterService: { policyId: config.policyId }, eip7702Auth: { delegation: SPONSORED_DELEGATE } } }]);
    const checked = validateSponsoredPrepared(prepared, transaction, config); await chainWallet(transaction, checked);
    if (old && !old.released_at && checked.parts.find(part => part.type === 'user-operation-v070').data.nonce === info(old).parts.find(part => part.type === 'user-operation-v070').data.nonce)
      fail(409, 'The provider reused a completed operation nonce. Review is required.');
    const validUntil = await readSponsoredExpiry(provider, checked);
    const cost = checked.costWei;
    await budget(client, accountKey, wallet, cost);
    await current(authorize, transaction, intent.id);
    if (Math.floor(Date.now() / 86400000) !== day) fail(409, 'The daily allowance reset. Review the operation again.');
    // Persist the complete immutable quote before the browser can obtain its paymaster authorization.
    const publicParts = checked.parts.map((part, index) => ({ ...part, signatureRequest: (prepared.type === 'array' ? prepared.data[index] : prepared).signatureRequest,
      ...(part.type === 'user-operation-v070' ? { feePayment: { sponsored: true, tokenAddress: SPONSORED_NATIVE_TOKEN, maxAmount: `0x${cost.toString(16)}` } } : {}) }));
    const safe = publicParts.length === 1 ? publicParts[0] : { type: 'array', data: publicParts };
    await client.query(`INSERT INTO mossvale_sponsored_operations
      (fingerprint,account_key,wallet,contract,intent_id,transaction,prepared,user_op_hash,entry_point,paymaster,call_id,cost_wei,day,created_at,valid_until)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`, [checked.fingerprint, accountKey, wallet, transaction.to.toLowerCase(), intent.id,
      JSON.stringify(transaction), JSON.stringify(safe), checked.userOpHash, checked.entryPoint, checked.paymaster.toLowerCase(), checked.callId, cost.toString(), day, Date.now(), validUntil]);
    return safe;
  }
  async function submit(client, accountKey, input, authorize) {
    noCapabilities(input);
    await releaseExpired(client);
    const fingerprint = signedIdentity(input), row = (await client.query('SELECT * FROM mossvale_sponsored_operations WHERE fingerprint=$1 AND account_key=$2', [fingerprint, accountKey])).rows[0];
    if (!row) fail(403, 'This account has no matching saved wallet operation.');
    const checked = info(row); validateSponsoredSigned(input, checked, row.transaction);
    const original = input.type === 'array' ? input.data : [input];
    const parts = checked.parts.map((part, index) => ({ ...part, signature: { type: 'secp256k1', data: original[index].signature.data.toLowerCase() } }));
    const signed = parts.length === 1 ? parts[0] : { type: 'array', data: parts };
    if (row.signed && hash(row.signed) !== hash(signed)) fail(409, 'Resume the exact previously signed operation.');
    if (row.released_at) throw Object.assign(sponsorshipError(409, 'This sponsorship authorization expired unused. Review the game action again.'),
      { rpcCode: 5731, rpcData: { reason: 'expired-unused', id: row.call_id, userOpHash: row.user_op_hash, sender: row.wallet, fingerprint: row.fingerprint } });
    if (row.signed) {
      try { await readStatus(client, row); return sentResult(row); }
      catch (error) { if (error.rpcCode !== 5730) throw error; }
      if (row.expired_at) fail(409, 'This authorization expired, but its earlier execution remains unknown. Its saved status requires review.');
    } else {
      await current(authorize, row.transaction, row.intent_id); await chainWallet(row.transaction, checked);
      // Unsettled reservations also count on subsequent days; a still-valid approval can cross midnight.
      if ((await provider.getBlock('latest'))?.timestamp >= Number(row.valid_until)) fail(409, 'This sponsorship authorization expired. Review is required.');
      await client.query('UPDATE mossvale_sponsored_operations SET signed=$2, submitted_at=$3 WHERE fingerprint=$1', [fingerprint, JSON.stringify(signed), Date.now()]);
    }
    // Replays contain exactly the same signed UserOperation and nonce; never generate replacements after an uncertain response.
    const result = await request('wallet_sendPreparedCalls', [{ ...signed, capabilities: { paymasterService: { policyId: config.policyId } } }]);
    if (result?.id !== row.call_id) fail(503, 'The submitted operation has an unexpected identifier. Resume its saved status.');
    return sentResult(row);
  }
  async function execute(accountKey, method, params, authorize) {
    if (!started || closing) fail(503, 'Mossvale fee sponsorship is unavailable.');
    if (!/^[a-f0-9]{64}$/.test(accountKey)) fail(401, 'Sign in before using the wallet.');
    if (!['wallet_prepareCalls', 'wallet_sendPreparedCalls', 'wallet_getCallsStatus'].includes(method)) fail(403, 'This wallet method is not available through the game.');
    const value = oneParameter(params);
    return locked(async client => {
      if (closing) fail(503, 'Mossvale fee sponsorship is unavailable.');
      if (method === 'wallet_prepareCalls') return prepare(client, accountKey, value, authorize);
      if (method === 'wallet_sendPreparedCalls') return submit(client, accountKey, value, authorize);
      if (!isHexString(value, 64)) fail(400, 'Invalid wallet operation identifier.');
      const row = (await client.query('SELECT * FROM mossvale_sponsored_operations WHERE call_id=$1 AND account_key=$2 AND signed IS NOT NULL', [value, accountKey])).rows[0];
      if (!row) fail(403, 'This account has no submitted wallet operation with that identifier.');
      return readStatus(client, row);
    });
  }
  return {
    enabled: true,
    async start() { await locked(async client => {
      await client.query(`CREATE TABLE IF NOT EXISTS mossvale_sponsored_operations (
        fingerprint text PRIMARY KEY,account_key text NOT NULL,wallet text NOT NULL,contract text NOT NULL,intent_id text NOT NULL,
        transaction jsonb NOT NULL,prepared jsonb NOT NULL,signed jsonb,user_op_hash text NOT NULL UNIQUE,entry_point text NOT NULL,paymaster text NOT NULL,
        call_id text NOT NULL UNIQUE,cost_wei numeric(78,0) NOT NULL CHECK(cost_wei>0),day bigint NOT NULL,created_at bigint NOT NULL,
        submitted_at bigint,settled_at bigint,transaction_hash text,status jsonb,valid_until bigint NOT NULL,released_at bigint,expired_at bigint)`);
      await client.query('CREATE INDEX IF NOT EXISTS mossvale_sponsored_day ON mossvale_sponsored_operations(day)');
      await client.query('CREATE INDEX IF NOT EXISTS mossvale_sponsored_intent ON mossvale_sponsored_operations(account_key,wallet,intent_id,created_at)');
    }); started = true; },
    rpc(accountKey, method, params, authorize) { const work = execute(accountKey, method, params, authorize); running.add(work); void work.finally(() => running.delete(work)).catch(() => {}); return work; },
    async sponsoredOperation({ transactionHash, wallet, contract }) {
      if (!started || closing || !isHexString(transactionHash, 32)) return null;
      const receipt = await provider.getTransactionReceipt(transactionHash); if (!receipt) return null;
      for (const log of receipt.logs) {
        if (!same(log.address, SPONSORED_ENTRY_POINT)) continue;
        let event; try { event = operationEvent.parseLog(log); } catch { continue; }
        if (!same(event.args.sender, wallet)) continue;
        const { rows: [row] } = await pool.query('SELECT * FROM mossvale_sponsored_operations WHERE user_op_hash=$1 AND wallet=$2 AND contract=$3 AND signed IS NOT NULL', [event.args.userOpHash, wallet.toLowerCase(), contract.toLowerCase()]);
        if (row && same(event.args.paymaster, row.paymaster)) return { userOpHash: row.user_op_hash, entryPoint: row.entry_point, sender: row.wallet, paymaster: row.paymaster };
      }
      return null;
    },
    close() { closing = true; return closingTask ||= (async () => { await Promise.allSettled([...running]); await pool.end(); if (!suppliedProvider) provider.destroy(); })(); },
  };
}

export function createTurnkeySponsorshipHandler({ sponsor, authenticate, authorize, originAllowed }) {
  const requests = new Set();
  return async (req, res) => {
    let requestId = null, accountKey, timer, acquired = false;
    const reply = (status, body) => { if (!res.writableEnded) res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body)); };
    try {
      res.setHeader('Vary', 'Origin');
      if (typeof req.headers.origin !== 'string' || !originAllowed(req)) fail(403, 'Wallet operations require a trusted game origin.');
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      if (req.method === 'OPTIONS') {
        const headers = String(req.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
        if (req.headers['access-control-request-method'] !== 'POST'
          || headers.some(value => !['authorization', 'content-type'].includes(value))) fail(403, 'Invalid wallet preflight request.');
        res.writeHead(204, { 'Cache-Control': 'no-store', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' }).end(); return;
      }
      if (req.method !== 'POST') fail(405, 'Use POST for wallet operations.');
      if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json' || req.headers['content-encoding']) fail(415, 'Send an uncompressed JSON wallet request.');
      const match = /^Bearer (\S+)$/.exec(req.headers.authorization ?? ''); if (!match) fail(401, 'Sign in before using the wallet.');
      let identity; try { identity = await authenticate(match[1]); } catch { fail(401, 'Sign in before using the wallet.'); }
      accountKey = identity.recordKey;
      if (requests.has(accountKey)) fail(429, 'A wallet request is already pending for this account.'); requests.add(accountKey); acquired = true;
      const chunks = []; let bytes = 0;
      timer = setTimeout(() => req.destroy(), 10000);
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 262144) fail(413, 'The wallet request is too large.'); chunks.push(chunk); }
      clearTimeout(timer); let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(400, 'Invalid wallet JSON.'); }
      if (!body || Array.isArray(body) || body.jsonrpc !== '2.0' || Object.keys(body).some(key => !['jsonrpc', 'id', 'method', 'params'].includes(key))
        || !(typeof body.id === 'string' && body.id.length <= 100 || Number.isSafeInteger(body.id))) fail(400, 'Send one JSON-RPC wallet request.');
      requestId = body.id;
      const result = await sponsor.rpc(accountKey, body.method, body.params, transaction => authorize(identity, transaction));
      reply(200, { jsonrpc: '2.0', id: requestId, result });
    } catch (error) {
      reply(error.sponsorship ? error.status : 503, { jsonrpc: '2.0', id: requestId, error: { code: error.rpcCode ?? -32000,
        message: error.sponsorship ? error.message : 'The wallet operation could not be completed. Resume its saved status before another payment.',
        ...(error.sponsorship && error.rpcCode === 5731 ? { data: error.rpcData } : {}) } });
    } finally { clearTimeout(timer); if (acquired) requests.delete(accountKey); }
  };
}
