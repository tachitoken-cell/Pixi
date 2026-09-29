import assert from 'node:assert/strict';
import { getAddress, keccak256 } from 'ethers';
import { createArenaChain } from '../src/arena-chain.mjs';
import { MOSS_TOKEN } from '../src/auction.ts';
import { MOSS_TOKEN_RUNTIME_HASH, erc20Interface } from '../src/auction-chain.mjs';
import { getChainRpc } from '../src/nft-rpc.mjs';

/** Read-only: prove the exact escrow/key/treasury and historical-state RPC before any player warning. */
export async function arenaActivationPreflight({ activation, fetcher = fetch, rpc: suppliedRpc } = {}) {
  let phase = 'realm treasuries';
  try {
    const response = await fetcher('https://mossvale.world/api/health', { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'Cache-Control': 'no-cache' } });
    assert(response.ok);
    const health = await response.json();
    assert(health.ok === true && health.realmId === 'eu' && health.mossAuction?.enabled === true && health.mossAuction.chainId === 4663);
    const treasury = getAddress(health.mossAuction.treasury);
    phase = 'canonical escrow, authority and tax';
    const { settings } = activation;
    const rpc = suppliedRpc || getChainRpc(settings.MOSS_ARENA_RPC_URL);
    const chain = createArenaChain({ contract: settings.MOSS_ARENA_CONTRACT, authorityKey: settings.MOSS_ARENA_AUTHORITY_KEY, treasury, rpc });
    const status = await chain.status();
    assert(status.enabled && status.authority === activation.authority && status.taxBps === 500);
    phase = 'finalized token history';
    // The newly deployed arena may not exist at finality yet. Historical MOSS reads
    // prove the RPC capability without delaying soft-confirmed arena activation.
    const block = await rpc('eth_getBlockByNumber', ['finalized', false]);
    const valid = value => /^0x[\da-f]{64}$/i.test(value?.hash || '') && [value?.number, value?.timestamp].every(item => typeof item === 'string' && /^0x(?:0|[1-9a-f][\da-f]*)$/i.test(item));
    assert(valid(block) && Math.abs(Number(BigInt(block.timestamp)) - Math.floor(Date.now() / 1000)) <= 1800);
    const tag = { blockHash: block.hash, requireCanonical: true };
    const [code, decimals] = await Promise.all([
      rpc('eth_getCode', [MOSS_TOKEN.address, tag]),
      rpc('eth_call', [{ to: MOSS_TOKEN.address, data: erc20Interface.encodeFunctionData('decimals') }, tag]),
    ]);
    assert.equal(keccak256(code), MOSS_TOKEN_RUNTIME_HASH);
    assert.equal(erc20Interface.decodeFunctionResult('decimals', decimals)[0], 18n);
    const canonical = await rpc('eth_getBlockByNumber', [block.number, false]);
    assert(valid(canonical) && canonical.hash === block.hash && canonical.number === block.number && canonical.timestamp === block.timestamp);
    return { contract: status.contract, authority: status.authority, treasury, chainId: 4663, taxBps: 500 };
  } catch {
    // RPC errors may contain the credential-bearing Alchemy URL or signing input.
    throw Error(`Arena activation preflight failed at ${phase}. No transaction was signed or sent.`);
  }
}
