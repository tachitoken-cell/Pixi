import { readFileSync } from 'node:fs';
import { Interface, Wallet, TypedDataEncoder, ZeroAddress, ZeroHash, getAddress, keccak256, verifyTypedData } from 'ethers';
import { MOSS_TOKEN, MOSS_AUCTION_DEV_TEAM } from './auction.ts';
import { ROBINHOOD_CHAIN, MOSS_TOKEN_RUNTIME_HASH, erc20Interface } from './auction-chain.mjs';
import { getChainRpc } from './nft-rpc.mjs';

const artifact = JSON.parse(readFileSync(new URL('../public/contracts/MossvaleArena.json', import.meta.url), 'utf8'));
export const arenaInterface = new Interface(artifact.abi);
import { ARENA_MATCH_TYPES, ARENA_RESULT_TYPES } from './arena-wager.ts';
export { ARENA_MATCH_TYPES, ARENA_RESULT_TYPES };
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const hash = value => typeof value === 'string' && /^0x[\da-f]{64}$/i.test(value);
const quantity = value => typeof value === 'string' && /^0x(?:0|[1-9a-f][\da-f]*)$/i.test(value);
const validBlock = block => hash(block?.hash) && quantity(block.number) && quantity(block.timestamp);
const address = value => { const result = getAddress(value); if (result === ZeroAddress) throw Error('A verified wallet is required.'); return result; };
function matchTerms(input) {
  if (!input || !hash(input.matchId) || same(input.matchId, ZeroHash)
    || typeof input.stakeWei !== 'string' || !/^[1-9]\d{0,77}$/.test(input.stakeWei) || BigInt(input.stakeWei) > ((1n << 256n) - 1n) / 2n
    || !Number.isSafeInteger(input.fundingDeadline) || input.fundingDeadline <= 0
    || !Number.isSafeInteger(input.refundAfter) || input.refundAfter <= input.fundingDeadline) throw Error('Invalid MOSS arena terms.');
  const playerA = address(input.playerA), playerB = address(input.playerB);
  if (same(playerA, playerB)) throw Error('Choose two different arena wallets.');
  return { matchId: input.matchId, playerA, playerB, stakeWei: input.stakeWei, fundingDeadline: input.fundingDeadline, refundAfter: input.refundAfter };
}

/** Authorization only: the caller persists every signed match/result before exposing it.
 * Players fund and settle from their own wallets; this service never sends transactions. */
export function createArenaChain({ contract = process.env.MOSS_ARENA_CONTRACT || '', authorityKey = process.env.MOSS_ARENA_AUTHORITY_KEY || '',
  treasury = process.env.TREASURE_TREASURY_CONTRACT || '', rpcUrl = process.env.MOSS_ARENA_RPC_URL || 'https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public',
  chainId = MOSS_TOKEN.chainId, rpc: customRpc } = {}) {
  let contractAddress, treasuryAddress, signer, observedFinalized;
  const inFlight = new Map();
  try {
    if (chainId !== MOSS_TOKEN.chainId) throw Error('Wrong chain.');
    if (contract && authorityKey && treasury) {
      contractAddress = address(contract); treasuryAddress = address(treasury); signer = new Wallet(authorityKey);
      if (same(treasuryAddress, contractAddress)) throw Error('Invalid treasury.');
    }
  } catch { contractAddress = treasuryAddress = signer = undefined; }
  const domain = { name: 'MossvaleArena', version: '1', chainId: MOSS_TOKEN.chainId, verifyingContract: contractAddress };
  const rpc = customRpc || getChainRpc(rpcUrl), tagFor = block => ({ blockHash: block.hash, requireCanonical: true });
  const read = async (name, args, tag) => arenaInterface.decodeFunctionResult(name,
    await rpc('eth_call', [{ to: contractAddress, data: arenaInterface.encodeFunctionData(name, args) }, tag]));
  async function canonicalBlock(block) {
    const canonical = await rpc('eth_getBlockByNumber', [block.number, false]);
    if (!validBlock(canonical) || canonical.number !== block.number || canonical.timestamp !== block.timestamp || !same(canonical.hash, block.hash))
      throw Error('Arena chain changed during verification. Please retry.');
  }
  async function verifyHead(finalized) {
    if (!contractAddress || !signer || !treasuryAddress) throw Error('MOSS arena wagers need their settlement contract and authority configured.');
    if (BigInt(await rpc('eth_chainId', [])) !== BigInt(MOSS_TOKEN.chainId)) throw Error('Arena RPC is on the wrong chain.');
    const block = await rpc('eth_getBlockByNumber', [finalized ? 'finalized' : 'latest', false]), seconds = Math.floor(Date.now() / 1000);
    if (!validBlock(block) || BigInt(block.timestamp) > BigInt(seconds + 120) || BigInt(block.timestamp) < BigInt(seconds - (finalized ? 1800 : 120))
      || finalized && observedFinalized && (BigInt(block.number) < BigInt(observedFinalized.number)
        || block.number === observedFinalized.number && !same(block.hash, observedFinalized.hash))) throw Error('Arena chain head is unavailable, stale or inconsistent.');
    const tag = tagFor(block);
    const [code, tokenCode, authority, paymentToken, recipient, developer, rate, ...metadata] = await Promise.all([
      rpc('eth_getCode', [contractAddress, tag]), rpc('eth_getCode', [MOSS_TOKEN.address, tag]),
      ...['authority', 'paymentToken', 'treasury', 'devTeam', 'TAX_BPS'].map(name => read(name, [], tag).then(value => value[0])),
      ...['name', 'symbol', 'decimals'].map(name => rpc('eth_call', [{ to: MOSS_TOKEN.address, data: erc20Interface.encodeFunctionData(name) }, tag])),
    ]);
    if (keccak256(code) !== artifact.runtimeCodeHash || keccak256(tokenCode) !== MOSS_TOKEN_RUNTIME_HASH
      || !same(authority, signer.address) || !same(paymentToken, MOSS_TOKEN.address)
      || !same(recipient, treasuryAddress) || !same(developer, MOSS_AUCTION_DEV_TEAM) || rate !== 500n
      || erc20Interface.decodeFunctionResult('name', metadata[0])[0] !== 'Mossvale'
      || erc20Interface.decodeFunctionResult('symbol', metadata[1])[0] !== MOSS_TOKEN.symbol
      || erc20Interface.decodeFunctionResult('decimals', metadata[2])[0] !== BigInt(MOSS_TOKEN.decimals))
      throw Error('Arena deployment does not match the reviewed MOSS wager contract and 5% tax.');
    await canonicalBlock(block); if (finalized) observedFinalized = block;
    return { block: { number: block.number, hash: block.hash, timestamp: block.timestamp }, tag };
  }
  function verifiedHead(finalized = false) {
    if (!inFlight.has(finalized)) inFlight.set(finalized, verifyHead(finalized).finally(() => inFlight.delete(finalized)));
    return inFlight.get(finalized);
  }
  function validateOrder(order) {
    const terms = matchTerms(order);
    if (!signer || !contractAddress || !treasuryAddress || order.chainId !== MOSS_TOKEN.chainId
      || !same(order.contract, contractAddress) || !same(order.token, MOSS_TOKEN.address)) throw Error('Invalid MOSS arena deployment.');
    if (same(terms.playerA, contractAddress) || same(terms.playerB, contractAddress)) throw Error('The arena escrow cannot be a fighter wallet.');
    const termsHash = TypedDataEncoder.hash(domain, ARENA_MATCH_TYPES, terms);
    if (!same(order.termsHash, termsHash) || !same(verifyTypedData(domain, ARENA_MATCH_TYPES, terms, order.signature), signer.address))
      throw Error('Arena terms do not match their authorization.');
    if (!same(order.to, contractAddress) || order.data !== arenaInterface.encodeFunctionData('fund', [terms, order.signature])
      || !same(order.approval?.to, MOSS_TOKEN.address)
      || order.approval?.data !== erc20Interface.encodeFunctionData('approve', [contractAddress, terms.stakeWei]))
      throw Error('Arena funding transaction does not match its terms.');
    return terms;
  }
  return {
    network: ROBINHOOD_CHAIN,
    contract: contractAddress,
    async status() {
      const base = { configured: !!(contractAddress && signer && treasuryAddress), chainId: MOSS_TOKEN.chainId,
        token: MOSS_TOKEN.address, symbol: MOSS_TOKEN.symbol, decimals: MOSS_TOKEN.decimals, ...(contractAddress ? { contract: contractAddress } : {}) };
      try {
        await verifiedHead();
        return { ...base, enabled: true, authority: signer.address, taxBps: 500, treasury: treasuryAddress, devTeam: MOSS_AUCTION_DEV_TEAM };
      } catch (error) { return { ...base, enabled: false, reason: error.message }; }
    },
    async prepareMatch(input) {
      const terms = matchTerms(input);
      if (same(terms.playerA, contractAddress) || same(terms.playerB, contractAddress)) throw Error('The arena escrow cannot be a fighter wallet.');
      const { block, tag } = await verifiedHead();
      if (terms.fundingDeadline <= Math.floor(Date.now() / 1000) || BigInt(terms.fundingDeadline) <= BigInt(block.timestamp))
        throw Error('The arena funding deadline has expired.');
      const state = await read('matches', [terms.matchId], tag);
      if (state[0] !== ZeroHash || state[1] !== 0n || state[2]) throw Error('This arena match already has a funding record.');
      await canonicalBlock(block);
      const signature = await signer.signTypedData(domain, ARENA_MATCH_TYPES, terms);
      return { ...terms, termsHash: TypedDataEncoder.hash(domain, ARENA_MATCH_TYPES, terms), signature,
        chainId: MOSS_TOKEN.chainId, contract: contractAddress, token: MOSS_TOKEN.address,
        to: contractAddress, data: arenaInterface.encodeFunctionData('fund', [terms, signature]),
        approval: { to: MOSS_TOKEN.address, data: erc20Interface.encodeFunctionData('approve', [contractAddress, terms.stakeWei]) } };
    },
    async verifyMatch(order, { finalized = false } = {}) {
      const terms = validateOrder(order), { block, tag } = await verifiedHead(finalized);
      const [termsHash, funded, closed] = await read('matches', [terms.matchId], tag);
      if (funded > 3n || termsHash === ZeroHash && (funded !== 0n || closed)
        || termsHash !== ZeroHash && (!same(termsHash, order.termsHash) || funded === 0n && !closed)) throw Error('Arena funding does not match the signed match.');
      await canonicalBlock(block);
      return { funded: Number(funded), closed, block };
    },
    async prepareResult(order, winner) {
      const terms = validateOrder(order), recipient = getAddress(winner);
      if (recipient !== ZeroAddress && !same(recipient, terms.playerA) && !same(recipient, terms.playerB)) throw Error('The arena winner must be one of its fighters.');
      const signature = await signer.signTypedData(domain, ARENA_RESULT_TYPES, { matchId: terms.matchId, termsHash: order.termsHash, winner: recipient });
      return { winner: recipient, signature, to: contractAddress, data: arenaInterface.encodeFunctionData('settle', [terms, recipient, signature]),
        chainId: MOSS_TOKEN.chainId, contract: contractAddress, matchId: terms.matchId };
    },
    refund(order) {
      const terms = validateOrder(order);
      return { to: contractAddress, data: arenaInterface.encodeFunctionData('refund', [terms]), chainId: MOSS_TOKEN.chainId,
        contract: contractAddress, matchId: terms.matchId };
    },
  };
}
