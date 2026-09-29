import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { Interface, Wallet, TypedDataEncoder, ZeroAddress, ZeroHash, getAddress, keccak256, parseUnits, formatUnits, toQuantity, verifyTypedData } from 'ethers';
import { MOSS_TOKEN } from './auction.ts';
import { ROBINHOOD_CHAIN, MOSS_TOKEN_RUNTIME_HASH, erc20Interface } from './auction-chain.mjs';
import { TREASURE_CLAIM_TYPES, TREASURE_MAX_CLAIMS, TREASURE_REWARD_TIERS, treasureContractClaim, treasureClaimValid, treasureQuotes, treasureUsdAmount, goldUsdAmountWei, rollTreasureUsd as rollUsd } from './treasure-rewards.ts';
import { readStorePrice } from './store-chain.mjs';
import { getChainRpc } from './nft-rpc.mjs';
import { receiptOperationLogs } from './user-operation-receipt.mjs';
export { TREASURE_CLAIM_TYPES } from './treasure-rewards.ts';

const artifact = JSON.parse(readFileSync(new URL('../public/contracts/MossvaleTreasureTreasury.json', import.meta.url), 'utf8'));
export const treasuryInterface = new Interface(artifact.abi);
export const rollTreasureUsd = (draw = randomInt) => rollUsd(draw);
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const hash = value => typeof value === 'string' && /^0x[\da-f]{64}$/i.test(value);
const quantity = value => typeof value === 'string' && /^0x(?:0|[1-9a-f][\da-f]*)$/i.test(value);
const validBlock = block => hash(block?.hash) && quantity(block.number) && quantity(block.timestamp);
const address = value => { const result = getAddress(value); if (result === ZeroAddress) throw Error('A verified wallet is required.'); return result; };
const min = (a, b) => a < b ? a : b;

/** Server signs only. Persist the complete authorization and its voucher debit or funded gold-round
 * award atomically BEFORE exposing its signature. Never refund issued claims. */
export function createTreasureChain({ legacyContract = process.env.TREASURE_LEGACY_CONTRACT || '', ...options } = {}) {
  const current = createContractTreasureChain(options);
  if (!legacyContract) return current;
  const legacy = createContractTreasureChain({ ...options, contract: legacyContract }, '0xf70a43fc113e5ba5308a896df6f46fe058e7cfbd323f6d058d2f506f03c8bbb9');
  const settlementChain = claim => same(claim?.contract, legacyContract) ? legacy : current;
  return { ...current,
    async status(priceRequired = true) {
      const [state, old] = await Promise.all([current.status(priceRequired), legacy.status(false)]);
      return { ...state, legacyContract: old.contract, ...(old.balanceWei !== undefined ? { legacyBalanceWei: old.balanceWei } : {}) };
    },
    checkClaim: (claim, now) => settlementChain(claim).checkClaim(claim, now),
    verifyClaim: (claim, transactionHash, now) => settlementChain(claim).verifyClaim(claim, transactionHash, now),
  };
}
function createContractTreasureChain({ contract = process.env.TREASURE_TREASURY_CONTRACT || '',
  authorityKey = process.env.TREASURE_AUTHORITY_KEY || '',
  rpcUrl = process.env.TREASURE_RPC_URL || 'https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public', rpc: customRpc, price: customPrice, sponsoredOperation } = {}, runtimeCodeHash = artifact.runtimeCodeHash) {
  let contractAddress, signer, inFlight, observedFinalized, observedLatest;
  try { if (contract && authorityKey) { contractAddress = address(contract); signer = new Wallet(authorityKey); } } catch { /* disabled below */ }
  const domain = { name: 'MossvaleTreasureTreasury', version: '1', chainId: MOSS_TOKEN.chainId, verifyingContract: contractAddress };
  const rpc = customRpc || getChainRpc(rpcUrl);
  const tagFor = block => ({ blockHash: block.hash, requireCanonical: true });
  const read = async (name, args, tag) => treasuryInterface.decodeFunctionResult(name,
    await rpc('eth_call', [{ to: contractAddress, data: treasuryInterface.encodeFunctionData(name, args) }, tag]))[0];
  const balance = async tag => erc20Interface.decodeFunctionResult('balanceOf',
    await rpc('eth_call', [{ to: MOSS_TOKEN.address, data: erc20Interface.encodeFunctionData('balanceOf', [contractAddress]) }, tag]))[0];
  async function canonicalBlock(block) {
    const canonical = await rpc('eth_getBlockByNumber', [block.number, false]);
    if (!validBlock(canonical) || canonical.number !== block.number || !same(canonical.hash, block.hash))
      throw Error('The treasury chain changed during verification. Please retry.');
  }
  async function verifyFinalized() {
    if (!contractAddress || !signer) throw Error('The MOSS treasury must be deployed, funded, and configured.');
    if (BigInt(await rpc('eth_chainId', [])) !== BigInt(MOSS_TOKEN.chainId)) throw Error('Treasury RPC is on the wrong chain.');
    const block = await rpc('eth_getBlockByNumber', ['finalized', false]);
    if (!validBlock(block) || observedFinalized && (BigInt(block.number) < BigInt(observedFinalized.number)
      || block.number === observedFinalized.number && !same(block.hash, observedFinalized.hash))) throw Error('Treasury chain finality is unavailable or regressed.');
    const tag = tagFor(block);
    const [code, tokenCode, authority, paymentToken, ...metadata] = await Promise.all([
      rpc('eth_getCode', [contractAddress, tag]), rpc('eth_getCode', [MOSS_TOKEN.address, tag]),
      read('authority', [], tag), read('paymentToken', [], tag),
      ...['name', 'symbol', 'decimals'].map(name => rpc('eth_call', [{ to: MOSS_TOKEN.address, data: erc20Interface.encodeFunctionData(name) }, tag])),
    ]);
    if (keccak256(code) !== runtimeCodeHash || keccak256(tokenCode) !== MOSS_TOKEN_RUNTIME_HASH
      || !same(authority, signer.address) || !same(paymentToken, MOSS_TOKEN.address)
      || erc20Interface.decodeFunctionResult('name', metadata[0])[0] !== 'Mossvale'
      || erc20Interface.decodeFunctionResult('symbol', metadata[1])[0] !== 'MOSS'
      || erc20Interface.decodeFunctionResult('decimals', metadata[2])[0] !== 18n)
      throw Error('Treasury deployment does not match the reviewed MOSS payout contract.');
    await canonicalBlock(block);
    observedFinalized = block;
    return { block, tag };
  }
  const finalized = () => inFlight ??= verifyFinalized().finally(() => { inFlight = undefined; });
  async function latestBlock(final, now, allowStaleFinality = false) {
    const latest = await rpc('eth_getBlockByNumber', ['latest', false]), seconds = Math.floor(now / 1000);
    if (!Number.isSafeInteger(now) || !validBlock(latest) || Math.abs(Number(BigInt(latest.timestamp)) - seconds) > 120
      || !allowStaleFinality && Math.abs(Number(BigInt(final.timestamp)) - seconds) > 1800 || BigInt(latest.number) < BigInt(final.number)
      || BigInt(latest.timestamp) < BigInt(final.timestamp) || latest.number === final.number && !same(latest.hash, final.hash)
      || observedLatest && BigInt(latest.number) < BigInt(observedLatest.number)) throw Error('Treasury chain head is stale or inconsistent.');
    return latest;
  }
  function validateClaim(claim) {
    if (!signer || !treasureClaimValid(claim) || !same(claim.contract, contractAddress))
      throw Error('Invalid MOSS treasure deployment.');
    for (const quote of treasureQuotes(claim)) {
      const expected = treasureContractClaim(quote), digest = TypedDataEncoder.hash(domain, TREASURE_CLAIM_TYPES, expected);
      if (quote.amountWei !== expected.amountWei || !same(digest, quote.claimHash)
        || !same(TypedDataEncoder.hash(domain, TREASURE_CLAIM_TYPES, quote.contractClaim), digest)
        || !same(verifyTypedData(domain, TREASURE_CLAIM_TYPES, expected, quote.signature), signer.address))
        throw Error('Treasure claim identity does not match its authorization.');
    }
    return treasureContractClaim(claim);
  }
  async function readPrice(block, now) {
    const price = await (customPrice || readStorePrice)({ rpc, block, now, purpose: 'payout' });
    if (!Number.isSafeInteger(now) || now <= 0 || !price || !Number.isSafeInteger(price.observedAt) || price.observedAt <= 0
      || now - price.observedAt > 90000 || price.observedAt > now + 15000) throw Error('A fresh MOSS/USD price is unavailable.');
    return price;
  }
  async function quote(usdCents, block, now, legacy = false) {
    const price = await readPrice(block, now);
    return { amount: treasureUsdAmount(usdCents, price.usdWei, legacy), usdCents, price };
  }
  async function prepare(input, now, goldRound = false, legacy = false) {
    if (goldRound && input.contract !== undefined && !same(input.contract, contractAddress))
      throw Error('Restore this gold round’s treasury configuration before collecting its saved award.');
    if (!Number.isSafeInteger(now) || now <= 0 || goldRound && (typeof input.amountWei !== 'string'
      || !/^[1-9]\d{0,77}$/.test(input.amountWei) || BigInt(input.amountWei) >= 2n ** 256n
      || typeof input.goldRoundId !== 'string' || !input.goldRoundId || input.usdCents !== undefined || input.price !== undefined)
      || !goldRound && input.goldRoundId !== undefined) throw Error('Invalid MOSS treasury authorization.');
    const { block, tag } = await finalized(), latest = await latestBlock(block, now), latestTag = tagFor(latest);
    const reward = goldRound ? { goldRoundId: input.goldRoundId, amount: formatUnits(input.amountWei, 18) } : await quote(input.usdCents, block, now, legacy);
    const contractClaim = treasureContractClaim({ ...input, ...reward });
    const [funds, latestFunds, totalPaid, latestTotalPaid, finalPaid, latestPaid] = await Promise.all([
      balance(tag), balance(latestTag), read('totalPaid', [], tag), read('totalPaid', [], latestTag), read('paidClaims', [contractClaim.claimId], tag), read('paidClaims', [contractClaim.claimId], latestTag),
    ]);
    if (finalPaid !== ZeroHash || latestPaid !== ZeroHash) throw Error('This treasury claim has already been redeemed.');
    const capacityWei = min(funds + totalPaid, latestFunds + latestTotalPaid).toString();
    if (min(funds, latestFunds) < BigInt(contractClaim.amountWei) || BigInt(capacityWei) < BigInt(contractClaim.amountWei))
      throw Error(goldRound ? 'The MOSS treasury needs funding. Your award is saved.' : 'The MOSS treasury needs funding. Your voucher was kept.');
    await canonicalBlock(block); await canonicalBlock(latest); observedLatest = latest;
    const signature = await signer.signTypedData(domain, TREASURE_CLAIM_TYPES, contractClaim);
    const claim = { id: input.id, realmId: input.realmId, characterId: input.characterId, wallet: contractClaim.recipient, ...reward,
      amountWei: contractClaim.amountWei, createdAt: now, chainId: MOSS_TOKEN.chainId, token: MOSS_TOKEN.address,
      contract: contractAddress, status: 'pending', contractClaim, signature, claimHash: TypedDataEncoder.hash(domain, TREASURE_CLAIM_TYPES, contractClaim),
      transaction: { to: contractAddress, data: treasuryInterface.encodeFunctionData('claim', [contractClaim, signature]), value: '0x0', chainId: toQuantity(MOSS_TOKEN.chainId) } };
    // Payouts preserve balance + totalPaid; withdrawals reduce it. The permanent shared ledger
    // reserves each voucher claim’s largest signed amount and each fixed gold-round award.
    return { claim, capacityWei };
  }
  return {
    network: ROBINHOOD_CHAIN,
    configured: !!(contractAddress && signer),
    /** One close-price snapshot is shared by every winner; collecting a saved award never requotes it. */
    async quoteGoldBudget({ payoutUsdMicros = '1000000000' } = {}, now = Date.now()) {
      const { block, tag } = await finalized(), latest = await latestBlock(block, now), latestTag = tagFor(latest);
      const [price, funds, latestFunds, totalPaid, latestTotalPaid] = await Promise.all([
        readPrice(block, now), balance(tag), balance(latestTag), read('totalPaid', [], tag), read('totalPaid', [], latestTag),
      ]);
      const amountWei = goldUsdAmountWei(payoutUsdMicros, price.usdWei);
      await canonicalBlock(block); await canonicalBlock(latest); observedLatest = latest;
      return { contract: contractAddress, capacityWei: min(funds + totalPaid, latestFunds + latestTotalPaid).toString(),
        balanceWei: min(funds, latestFunds).toString(), amountWei, price: { usdWei: price.usdWei, observedAt: price.observedAt } };
    },
    async status(priceRequired = true) {
      const base = { configured: !!(contractAddress && signer), chainId: MOSS_TOKEN.chainId, token: MOSS_TOKEN.address, symbol: 'MOSS', decimals: 18, ...(contractAddress ? { contract: contractAddress } : {}) };
      try {
        const { block, tag } = await finalized(), latest = await latestBlock(block, Date.now());
        const [funds, latestFunds, totalPaid, latestTotalPaid] = await Promise.all([balance(tag), balance(tagFor(latest)), read('totalPaid', [], tag), read('totalPaid', [], tagFor(latest))]);
        await canonicalBlock(block); await canonicalBlock(latest);
        const balanceWei = min(funds, latestFunds).toString();
        const state = { ...base, capacityWei: min(funds + totalPaid, latestFunds + latestTotalPaid).toString(), balanceWei, balanceMoss: formatUnits(balanceWei, 18) };
        try {
          const minimum = priceRequired ? parseUnits((await quote(200, block, Date.now())).amount, 18) : 1n;
          return { ...state, enabled: BigInt(balanceWei) >= minimum,
            ...(BigInt(balanceWei) < minimum ? { reason: 'The MOSS treasury needs funding.' } : {}) };
        } catch (error) { return { ...state, enabled: false, reason: error.message }; }
      } catch (error) { return { ...base, enabled: false, reason: error.message }; }
    },
    prepareClaim: (input, now = Date.now()) => prepare(input, now),
    prepareGoldClaim: (input, now = Date.now()) => prepare(input, now, true),
    async refreshClaim(claim, now = Date.now()) {
      validateClaim(claim);
      if (claim.goldRoundId !== undefined || typeof claim.amount !== 'string' || claim.status !== 'pending' || claim.transactionHash || claim.paymentBlock || claim.paidAt || claim.settledClaimHash)
        throw Error('Check this payout before refreshing. Only an unsubmitted USD payout can be refreshed.');
      if (treasureQuotes(claim).length >= TREASURE_MAX_CLAIMS) throw Error('Your treasury quote history is full. Collect the saved payout.');
      const legacy = !TREASURE_REWARD_TIERS.some(tier => claim.usdCents >= tier.min && claim.usdCents <= tier.max);
      const prepared = await prepare({ id: claim.id, realmId: claim.realmId, characterId: claim.characterId, wallet: claim.wallet, usdCents: claim.usdCents }, now, false, legacy);
      if (same(prepared.claim.claimHash, claim.claimHash)) return { ...prepared, claim };
      const { previousQuotes = [], transactionHash, paymentBlock, paidAt, settledClaimHash, ...previous } = claim;
      return { ...prepared, claim: { ...prepared.claim, previousQuotes: [...previousQuotes, previous] } };
    },
    async checkClaim(claim, now = Date.now()) {
      const expected = validateClaim(claim), { block, tag } = await finalized();
      const readPaid = async at => {
        const paid = await read('paidClaims', [expected.claimId], at);
        if (paid === ZeroHash) return null;
        const quote = treasureQuotes(claim).find(quote => same(paid, quote.claimHash));
        if (!quote) throw Error('Treasure claim has a conflicting settlement.');
        return quote.claimHash;
      };
      const finalPaid = await readPaid(tag);
      if (finalPaid) {
        if (claim.paymentBlock && claim.settledClaimHash && !same(finalPaid, claim.settledClaimHash)) {
          const saved = claim.paymentBlock, canonical = await rpc('eth_getBlockByNumber', [saved.number, false]);
          if (!validBlock(canonical) || canonical.number !== saved.number) throw Error('Treasury payout block is unavailable.');
          if (same(canonical.hash, saved.hash)) throw Error('Treasury payout differs from its canonical authorization.');
        }
        await canonicalBlock(block);
        return { state: 'paid', claimHash: claim.claimHash, settledClaimHash: finalPaid, blockHash: block.hash, blockNumber: block.number };
      }
      const latest = await latestBlock(block, now, true), paid = await readPaid(tagFor(latest));
      if (!paid && Math.abs(Number(BigInt(block.timestamp)) - Math.floor(now / 1000)) > 1800) throw Error('Treasury chain head is stale or inconsistent.');
      if (paid && same(latest.hash, block.hash)) throw Error('Treasury payout differs within the same canonical block.');
      let anchor = latest, orphaned = false;
      if (claim.paymentBlock !== undefined) {
        const saved = claim.paymentBlock;
        if (!hash(saved?.hash) || !quantity(saved.number) || BigInt(saved.number) > BigInt(latest.number))
          throw Error('Treasury payout block is unavailable or ahead of the chain.');
        const canonical = await rpc('eth_getBlockByNumber', [saved.number, false]);
        if (!validBlock(canonical) || canonical.number !== saved.number) throw Error('Treasury payout block is unavailable.');
        orphaned = !same(canonical.hash, saved.hash);
        if (!orphaned) {
          if (!paid) throw Error('Treasury payout is missing from its canonical chain.');
          if (claim.settledClaimHash && !same(paid, claim.settledClaimHash)) throw Error('Treasury payout differs from its canonical authorization.');
          anchor = canonical;
        }
      }
      await canonicalBlock(block); await canonicalBlock(latest); observedLatest = latest;
      // Successful canonical inclusion settles immediately; issuance keeps finalized funding checks.
      return paid ? { state: 'paid', claimHash: claim.claimHash, settledClaimHash: paid, blockHash: anchor.hash, blockNumber: anchor.number, ...(orphaned ? { reanchored: true } : {}) }
        : { state: 'pending', claimHash: claim.claimHash, ...(orphaned ? { revoked: true } : {}) };
    },
    async verifyClaim(claim, transactionHash, now = Date.now()) {
      if (!hash(transactionHash)) throw Error('Invalid treasury transaction hash.');
      const result = await this.checkClaim(claim, now);
      if (!['paid', 'processed'].includes(result.state)) return result;
      const receipt = await rpc('eth_getTransactionReceipt', [transactionHash]);
      if (!receipt || receipt.status !== '0x1'
        || !same(receipt.transactionHash, transactionHash) || !hash(receipt.blockHash) || !quantity(receipt.blockNumber)
        || BigInt(receipt.blockNumber) > BigInt(result.blockNumber) || !Array.isArray(receipt.logs)) throw Error('Treasury receipt does not match this claim.');
      const logs = await receiptOperationLogs(receipt, { wallet: claim.wallet, contract: contractAddress, sponsoredOperation });
      const canonical = await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]);
      if (!validBlock(canonical) || !same(canonical.hash, receipt.blockHash)) throw Error('Treasury receipt is not canonical.');
      const quote = treasureQuotes(claim).find(quote => same(quote.claimHash, result.settledClaimHash)), expected = quote.contractClaim;
      const matching = logs.filter(log => {
        if (log.removed || !same(log.address, contractAddress)) return false;
        try { const event = treasuryInterface.parseLog(log); return event?.name === 'Claimed' && same(event.args.claimId, expected.claimId)
          && same(event.args.claimHash, quote.claimHash) && same(event.args.recipient, claim.wallet)
          && same(event.args.characterId, expected.characterId) && event.args.amountWei === BigInt(quote.amountWei); } catch { return false; }
      });
      if (matching.length !== 1) throw Error('Treasury receipt does not match this payout.');
      return { ...result, transactionHash };
    },
  };
}
