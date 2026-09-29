import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { FetchRequest, Interface, JsonRpcProvider, ZeroAddress, getAddress } from 'ethers';
import { createTurnkeySponsorshipConfig, readSponsoredExpiry } from '../src/turnkey-sponsorship.mjs';
import { SPONSORED_DELEGATE, SPONSORED_ENTRY_POINT, validateSponsoredPrepared } from '../src/turnkey-sponsored-validation.mjs';

const token = new Interface(['function approve(address,uint256) returns (bool)', 'function decimals() view returns (uint8)']);
const settlement = new Interface(['function paymentToken() view returns (address)']);
const delegate = new Interface(['function entryPoint() view returns (address)']);

/** Prepare-only compatibility check. No keys, signatures, wallet creation or transaction submission. */
export async function turnkeyActivationPreflight({ env = process.env, fetcher = fetch, provider: suppliedProvider, chainOnly = false } = {}) {
  let phase = 'configuration', provider;
  try {
    const config = createTurnkeySponsorshipConfig(env);
    if (!config) throw Error();
    async function json(url, options = {}) {
      const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(15000), ...options });
      if (!response.ok) throw Error();
      const text = await response.text();
      if (text.length > 524288) throw Error();
      return JSON.parse(text);
    }
    phase = 'public auction configuration';
    const health = await json('https://mossvale.world/api/health'), auction = health?.mossAuction;
    if (health.ok !== true || health.realmId !== 'eu' || auction?.enabled !== true || auction.chainId !== 4663
      || auction.symbol !== 'MOSS' || auction.testnet !== false) throw Error();
    const target = getAddress(auction.token), spender = getAddress(auction.contract);
    if (target === ZeroAddress || spender === ZeroAddress || target === spender) throw Error();
    // Random address only: there is deliberately no corresponding signing key in this process.
    const from = getAddress(`0x${randomBytes(20).toString('hex')}`);
    const transaction = { from, to: target, data: token.encodeFunctionData('approve', [spender, 0n]), value: '0x0', chainId: '0x1237' };
    phase = 'chain and delegate';
    const request = new FetchRequest(`https://robinhood-mainnet.g.alchemy.com/v2/${config.apiKey}`); request.timeout = 10000;
    provider = suppliedProvider ?? new JsonRpcProvider(request, 4663, { staticNetwork: true, cacheTimeout: -1 });
    if (BigInt(await provider.send('eth_chainId', [])) !== 4663n || await provider.getCode(from) !== '0x'
      || await provider.getTransactionCount(from) !== 0 || await provider.getCode(SPONSORED_DELEGATE) === '0x'
      || await provider.getCode(SPONSORED_ENTRY_POINT) === '0x') throw Error();
    const [entryPoint] = delegate.decodeFunctionResult('entryPoint', await provider.call({ to: SPONSORED_DELEGATE, data: delegate.encodeFunctionData('entryPoint') }));
    if (entryPoint.toLowerCase() !== SPONSORED_ENTRY_POINT.toLowerCase()) throw Error();
    phase = 'canonical chain reads';
    const heads = await Promise.all(['latest', 'finalized'].map(tag => provider.send('eth_getBlockByNumber', [tag, false])));
    const validHeader = block => /^0x[\da-f]{64}$/i.test(block?.hash || '')
      && [block?.number, block?.timestamp].every(value => typeof value === 'string' && /^0x(?:0|[1-9a-f][\da-f]*)$/i.test(value));
    if (!heads.every(validHeader) || BigInt(heads[1].number) > BigInt(heads[0].number)
      || BigInt(heads[1].timestamp) > BigInt(heads[0].timestamp)) throw Error();
    for (const block of heads) {
      const tag = { blockHash: block.hash, requireCanonical: true };
      const [auctionCode, tokenCode, paymentToken, decimals] = await Promise.all([
        provider.send('eth_getCode', [spender, tag]), provider.send('eth_getCode', [target, tag]),
        provider.send('eth_call', [{ to: spender, data: settlement.encodeFunctionData('paymentToken') }, tag]),
        provider.send('eth_call', [{ to: target, data: token.encodeFunctionData('decimals') }, tag]),
      ]);
      if (![auctionCode, tokenCode].every(code => typeof code === 'string' && /^0x(?:[\da-f]{2})+$/i.test(code))
        || getAddress(settlement.decodeFunctionResult('paymentToken', paymentToken)[0]) !== target
        || token.decodeFunctionResult('decimals', decimals)[0] !== 18n) throw Error();
      const canonical = await provider.send('eth_getBlockByNumber', [block.number, false]);
      if (!validHeader(canonical) || canonical.number !== block.number || canonical.timestamp !== block.timestamp
        || canonical.hash.toLowerCase() !== block.hash.toLowerCase()) throw Error();
    }
    if (chainOnly) return true;
    phase = 'sponsored zero-approval preparation';
    const response = await json(`https://api.g.alchemy.com/v2/${config.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'wallet_prepareCalls', params: [{ from, chainId: '0x1237',
        calls: [{ to: target, data: transaction.data, value: '0x0' }],
        capabilities: { paymasterService: { policyId: config.policyId }, eip7702Auth: { delegation: SPONSORED_DELEGATE } } }] }) });
    if (response?.jsonrpc !== '2.0' || response.id !== 1 || response.error || !response.result) throw Error();
    phase = 'prepared authorization validation';
    const checked = validateSponsoredPrepared(response.result, transaction, config);
    const authorization = checked.parts.find(part => part.type === 'authorization');
    if (!authorization || BigInt(authorization.data.nonce) !== 0n) throw Error();
    phase = 'finite paymaster expiry';
    await readSponsoredExpiry(provider, checked);
    return true;
  } catch {
    // Never expose upstream error messages: they can contain credential-bearing URLs or request data.
    throw Error(`Turnkey activation preflight failed at ${phase}. No transaction was signed or sent.`);
  } finally {
    if (!suppliedProvider) { try { provider?.destroy(); } catch {} }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const chainOnly = process.argv.includes('--chain-only');
    await turnkeyActivationPreflight({ chainOnly });
    console.log(chainOnly
      ? 'Chain verification preflight passed: canonical latest/finalized state and delegate verified. No sponsorship was prepared and no transaction was signed or sent.'
      : 'Turnkey activation preflight passed: canonical latest/finalized state, prepare-only sponsorship, delegate and finite expiry verified. No transaction was signed or sent.');
  } catch (error) {
    console.error(error.message); process.exitCode = 1;
  }
}
