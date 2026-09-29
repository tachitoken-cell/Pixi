import { readFileSync } from 'node:fs';
import { getChainRpc } from './nft-rpc.mjs';
import { receiptOperationLogs } from './user-operation-receipt.mjs';
import { randomUUID } from 'node:crypto';
import { Interface, Wallet, TypedDataEncoder, getAddress, id, keccak256, parseEther, toQuantity, verifyMessage, ZeroAddress, ZeroHash } from 'ethers';
import { MOSS_TOKEN, MOSS_AUCTION_DEV_TEAM, auctionOrderTypes, auctionOrderReferralValid } from './auction.ts';
export { AUCTION_ORDER_TYPES, MOSS_AUCTION_ORDER_TYPES, auctionOrderTypes } from './auction.ts';

export const ROBINHOOD_CHAIN = { chainId: 4663, name: 'Robinhood Chain', symbol: 'ETH', decimals: 18,
  rpcUrl: 'https://rpc.mainnet.chain.robinhood.com', explorerUrl: 'https://robinhoodchain.blockscout.com' };
const artifact = JSON.parse(readFileSync(new URL('../public/contracts/MossvaleAuction.json', import.meta.url), 'utf8'));
const tokenArtifact = JSON.parse(readFileSync(new URL('../public/contracts/MossvaleTokenAuction.json', import.meta.url), 'utf8'));
const legacyReferralArtifact = JSON.parse(readFileSync(new URL('../public/contracts/MossvaleTokenAuctionReferralLegacy.json', import.meta.url), 'utf8'));
const legacyTokenArtifact = JSON.parse(readFileSync(new URL('../public/contracts/MossvaleTokenAuctionLegacy.json', import.meta.url), 'utf8'));
export const auctionInterface = new Interface(artifact.abi);
export const tokenAuctionInterface = new Interface(tokenArtifact.abi);
export const legacyTokenAuctionInterface = new Interface(legacyTokenArtifact.abi);
export const auctionOrderInterface = order => order.currency === 'moss'
  ? order.referralBps === undefined ? legacyTokenAuctionInterface : tokenAuctionInterface : auctionInterface;
export const erc20Interface = new Interface(['function name() view returns (string)', 'function symbol() view returns (string)',
  'function decimals() view returns (uint8)', 'function approve(address spender,uint256 amount) returns (bool)',
  'function allowance(address owner,address spender) view returns (uint256)', 'function balanceOf(address owner) view returns (uint256)']);
// Robinhood mainnet MOSS runtime, independently read and reviewed before enabling payments.
export const MOSS_TOKEN_RUNTIME_HASH = '0x41881f8aa07050b6e0432355047d8c4fa6ea3648afbe5b6945ce96502b4c1542';
// Keep existing untaxed deployments usable until their reservations have settled.
const LEGACY_MOSS_AUCTION_RUNTIME_HASH = '0xb8fa84e82d4be93c716a06377c19705acbae3e5de38531144f3647d403bd7ca1';
// The first deployment authorizes new purchases; all routes retain settlement and proceeds recovery.
const MOSS_AUCTION_DEPLOYMENTS = [
  { contract: '0x930f178ca4818a2ae2e97b96f3574f22e509a520', runtimeCodeHash: tokenArtifact.runtimeCodeHash, fromBlock: 73835683 },
  { contract: '0xb13ab13df2d0ab0f740cf11d882680501150c652', runtimeCodeHash: legacyReferralArtifact.runtimeCodeHash, fromBlock: 73341457 },
  { contract: '0xd5508EfEa45f8e0A4594B8A763504bDF31BBf82F', runtimeCodeHash: legacyTokenArtifact.runtimeCodeHash, fromBlock: 69839008 },
  { contract: '0xd4806c0a34d274c029a38d7126d8a23a1d79c4dc', runtimeCodeHash: LEGACY_MOSS_AUCTION_RUNTIME_HASH, fromBlock: 61382153 },
];
const address = value => { const result = getAddress(value); if (result === ZeroAddress) throw Error('Wallet address is required.'); return result; };
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
export const isProductionMossAuctionContract = contract => MOSS_AUCTION_DEPLOYMENTS.some(deployment => same(contract, deployment.contract));
const hash = value => typeof value === 'string' && /^0x[\da-f]{64}$/i.test(value);
const quantity = value => typeof value === 'string' && /^0x(?:0|[1-9a-f][\da-f]*)$/i.test(value);
const validBlock = block => hash(block?.hash) && quantity(block.number) && quantity(block.timestamp);

export function auctionPriceWei(value, currency = 'eth') {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,5})(?:\.\d{1,18})?$/.test(value)) throw Error(`Enter ${currency === 'moss' ? 'a MOSS' : 'an ETH'} price with up to 18 decimal places.`);
  const result = parseEther(value);
  if (result <= 0n) throw Error('Price must be greater than zero.');
  return result.toString();
}

/** No broadcasts or gas keys: signs purchase authorizations and verifies processed/finalized payments. */
export function createAuctionChain({ currency = 'eth', contract, ...options } = {}) {
  contract ??= (currency === 'moss' ? process.env.MOSS_AUCTION_CONTRACT : process.env.AUCTION_CONTRACT) || '';
  if (currency !== 'moss' || !isProductionMossAuctionContract(contract)) return createContractAuctionChain({ ...options, currency, contract });
  const chains = MOSS_AUCTION_DEPLOYMENTS.map(deployment => createContractAuctionChain({ ...options, currency, contract: deployment.contract }, [deployment.runtimeCodeHash]));
  const [current] = chains, currentContract = MOSS_AUCTION_DEPLOYMENTS[0].contract;
  const settlementChain = contract => chains[MOSS_AUCTION_DEPLOYMENTS.findIndex(deployment => same(contract, deployment.contract))] || current;
  return { ...current,
    async status() {
      const [status, ...prior] = await Promise.all(chains.map(chain => chain.status()));
      const previousContracts = prior.filter(previous => previous.enabled).map(previous => previous.contract);
      return { ...status, ...(previousContracts.length ? { previousContract: previousContracts[0], previousContracts } : {}) };
    },
    settlement: (order, now) => settlementChain(order?.contract).settlement(order, now),
    verifyPayment: (order, transactionHash, now) => settlementChain(order?.contract).verifyPayment(order, transactionHash, now),
    async purchaseHistory(fromBlock, blockCount, historyContract = currentContract) {
      return settlementChain(historyContract).purchaseHistory(fromBlock, blockCount, historyContract);
    },
  };
}

function createContractAuctionChain({ currency = 'eth', contract, authorityKey,
  treasury = process.env.TREASURE_TREASURY_CONTRACT || '', rpcUrl, chainId, rpc: customRpc, sponsoredOperation } = {}, runtimeCodeHashes) {
  const moss = currency === 'moss', symbol = moss ? MOSS_TOKEN.symbol : 'ETH';
  const settlementArtifact = moss ? tokenArtifact : artifact, abi = moss ? tokenAuctionInterface : auctionInterface;
  contract ??= (moss ? process.env.MOSS_AUCTION_CONTRACT : process.env.AUCTION_CONTRACT) || '';
  authorityKey ??= (moss ? process.env.MOSS_AUCTION_AUTHORITY_KEY || process.env.AUCTION_AUTHORITY_KEY : process.env.AUCTION_AUTHORITY_KEY) || '';
  rpcUrl ??= (moss ? process.env.MOSS_AUCTION_RPC_URL : process.env.AUCTION_RPC_URL)
    || (moss ? 'https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public' : ROBINHOOD_CHAIN.rpcUrl);
  chainId ??= Number((moss ? process.env.MOSS_AUCTION_CHAIN_ID : process.env.AUCTION_CHAIN_ID) || ROBINHOOD_CHAIN.chainId);
  const challenges = new Map();
  let signer, contractAddress, finalizedVerification, observedFinalized, observedLatest, reason = `${symbol} trading needs the auction settlement contract to be deployed and configured.`;
  const network = chainId === 46630 ? { ...ROBINHOOD_CHAIN, chainId, name: 'Robinhood Chain Testnet', rpcUrl: 'https://rpc.testnet.chain.robinhood.com', explorerUrl: 'https://explorer.testnet.chain.robinhood.com' } : ROBINHOOD_CHAIN;
  try {
    if (!['eth', 'moss'].includes(currency) || !(moss ? chainId === MOSS_TOKEN.chainId : [4663, 46630].includes(chainId))) throw Error('Unsupported auction chain.');
    if (contract && authorityKey) { contractAddress = address(contract); signer = new Wallet(authorityKey); }
  } catch { reason = 'The auction settlement configuration is invalid.'; }
  const domain = { name: settlementArtifact.contractName, version: '1', chainId, verifyingContract: contractAddress };
  const rpc = customRpc || getChainRpc(rpcUrl);
  const historyRpc = customRpc || getChainRpc(ROBINHOOD_CHAIN.rpcUrl);
  async function canonicalBlock(block) {
    const canonical = await rpc('eth_getBlockByNumber', [block.number, false]);
    if (!validBlock(block) || !validBlock(canonical) || canonical.number !== block.number || !same(canonical.hash, block.hash))
      throw Error('Auction chain changed during verification. Please retry.');
  }
  function finalized() {
    // Concurrent listing polls share verification only while it is running; the next poll reads fresh state.
    return finalizedVerification ??= verifyFinalized().finally(() => { finalizedVerification = undefined; });
  }
  async function verifyFinalized() {
    if (!signer || !contractAddress) throw Error(reason);
    if (BigInt(await rpc('eth_chainId', [])) !== BigInt(chainId)) throw Error('Auction RPC is on the wrong chain.');
    const block = await rpc('eth_getBlockByNumber', ['finalized', false]);
    if (!validBlock(block)) throw Error('Auction chain finality is unavailable.');
    const tag = { blockHash: block.hash, requireCanonical: true };
    const code = await rpc('eth_getCode', [contractAddress, tag]);
    const codeHash = keccak256(code), legacy = moss && codeHash === LEGACY_MOSS_AUCTION_RUNTIME_HASH;
    if (!(runtimeCodeHashes || [settlementArtifact.runtimeCodeHash, ...(moss ? [legacyTokenArtifact.runtimeCodeHash, legacyReferralArtifact.runtimeCodeHash, LEGACY_MOSS_AUCTION_RUNTIME_HASH] : [])]).includes(codeHash))
      throw Error('Auction contract does not match the reviewed settlement code.');
    const value = await rpc('eth_call', [{ to: contractAddress, data: abi.encodeFunctionData('authority') }, tag]);
    const expectedAuthority = abi.decodeFunctionResult('authority', value)[0];
    if (!same(expectedAuthority, signer.address)) throw Error(`Auction signing authority ${signer.address} does not match the deployed contract authority ${expectedAuthority}.`);
    let tax;
    if (moss) {
      const [paymentToken, tokenCode, ...metadata] = await Promise.all([
        rpc('eth_call', [{ to: contractAddress, data: abi.encodeFunctionData('paymentToken') }, tag]),
        rpc('eth_getCode', [MOSS_TOKEN.address, tag]),
        ...['name', 'symbol', 'decimals'].map(name => rpc('eth_call', [{ to: MOSS_TOKEN.address, data: erc20Interface.encodeFunctionData(name) }, tag])),
      ]);
      if (!same(abi.decodeFunctionResult('paymentToken', paymentToken)[0], MOSS_TOKEN.address)
        || keccak256(tokenCode) !== MOSS_TOKEN_RUNTIME_HASH
        || erc20Interface.decodeFunctionResult('name', metadata[0])[0] !== 'Mossvale'
        || erc20Interface.decodeFunctionResult('symbol', metadata[1])[0] !== MOSS_TOKEN.symbol
        || Number(erc20Interface.decodeFunctionResult('decimals', metadata[2])[0]) !== MOSS_TOKEN.decimals)
        throw Error('Auction payment token does not match the reviewed MOSS token.');
      tax = { taxBps: 0 };
      if (!legacy) {
        if (!treasury) throw Error('Configure the existing MOSS treasury before enabling taxed auctions.');
        const expectedTreasury = address(treasury);
        const [recipient, rate, developer] = await Promise.all(['treasury', 'TAX_BPS', 'devTeam'].map(name =>
          rpc('eth_call', [{ to: contractAddress, data: abi.encodeFunctionData(name) }, tag])
            .then(value => abi.decodeFunctionResult(name, value)[0])));
        if (!same(recipient, expectedTreasury) || same(recipient, contractAddress) || rate !== 500n || !same(developer, MOSS_AUCTION_DEV_TEAM))
          throw Error('Auction tax does not match the reviewed 5% burn, treasury and dev team split.');
        tax = { taxBps: 500, treasury: expectedTreasury, devTeam: MOSS_AUCTION_DEV_TEAM };
      }
    }
    await canonicalBlock(block);
    return { block, tag, ...tax, referralsEnabled: moss && [tokenArtifact.runtimeCodeHash, legacyReferralArtifact.runtimeCodeHash].includes(codeHash), ...(moss && codeHash === tokenArtifact.runtimeCodeHash ? { feeVersion: 2 } : {}) };
  }
  function validateOrder(order) {
    if (moss ? order?.currency !== 'moss' || !same(order.token, MOSS_TOKEN.address)
      : (order?.currency !== undefined && order.currency !== 'eth') || order?.token !== undefined || order?.approval !== undefined)
      throw Error('Auction order currency does not match this settlement contract.');
    if (!order || !/^0x[0-9a-f]{64}$/i.test(order.listingId) || order.listingId === ZeroHash || !/^\d+$/.test(order.priceWei) || BigInt(order.priceWei) <= 0n
      || !Number.isSafeInteger(order.deadline) || order.deadline <= 0 || same(address(order.buyer), address(order.seller))) throw Error('Invalid auction order.');
    if (!auctionOrderReferralValid(order)) throw Error('Invalid auction referral terms.');
    // Only persisted server-authored orders may be passed to settlement/verification.
    const expected = TypedDataEncoder.hash(domain, auctionOrderTypes(order), order);
    return expected;
  }
  return {
    network,
    async purchaseHistory(fromBlock, blockCount = 10000000, historyContract = contractAddress) {
      if (!same(historyContract, contractAddress)) throw Error('Auction history requires a configured settlement contract.');
      // Verified creation receipt; unknown deployments scan from genesis, never omit earlier payments.
      fromBlock ??= MOSS_AUCTION_DEPLOYMENTS.find(deployment => same(contractAddress, deployment.contract))?.fromBlock ?? 0;
      if (!moss || !Number.isSafeInteger(fromBlock) || fromBlock < 0 || !Number.isSafeInteger(blockCount) || blockCount < 1 || blockCount > 100000000) throw Error('Invalid auction history range.');
      const { block } = await finalized(), head = Number(BigInt(block.number));
      const end = Math.min(head, fromBlock + blockCount - 1);
      const logs = fromBlock > head ? [] : await historyRpc('eth_getLogs', [{ address: contractAddress,
        fromBlock: toQuantity(fromBlock), toBlock: toQuantity(end), topics: [abi.getEvent('Purchased').topicHash] }]);
      if (!Array.isArray(logs)) throw Error('Invalid auction history.');
      const purchases = logs.map(log => {
        if (log.removed || !same(log.address, contractAddress) || !/^0x[\da-f]{64}$/i.test(log.transactionHash || '')
            || !/^0x[\da-f]+$/i.test(log.logIndex || '') || !/^0x[\da-f]+$/i.test(log.blockNumber || '')
            || BigInt(log.blockNumber) < BigInt(fromBlock) || BigInt(log.blockNumber) > BigInt(end)) throw Error('Invalid auction purchase log.');
        const event = abi.parseLog(log);
        if (event?.name !== 'Purchased' || event.args.priceWei <= 0n) throw Error('Invalid auction purchase event.');
        return { id: `${log.transactionHash.toLowerCase()}:${BigInt(log.logIndex)}`, amountWei: event.args.priceWei.toString() };
      });
      const historicalHead = await historyRpc('eth_getBlockByNumber', [block.number, false]);
      if (!same(historicalHead?.hash, block.hash)) throw Error('Auction history is on a different chain.');
      await canonicalBlock(block);
      return { contract: contractAddress.toLowerCase(), chainId, purchases, fromBlock, nextBlock: Math.max(fromBlock, end + 1), finalizedBlock: head, complete: end === head || fromBlock > head };
    },
    async status() {
      try { const verified = await finalized(); return { enabled: true, chainId, contract: contractAddress, symbol, testnet: chainId === 46630,
        ...(moss ? { token: MOSS_TOKEN.address, decimals: MOSS_TOKEN.decimals, taxBps: verified.taxBps, referralsEnabled: verified.referralsEnabled, ...(verified.feeVersion ? { feeVersion: verified.feeVersion } : {}), ...(verified.treasury ? { treasury: verified.treasury, devTeam: verified.devTeam } : {}) } : {}) }; }
      catch (error) { return { enabled: false, chainId, ...(contractAddress ? { contract: contractAddress } : {}), reason: error.message, ...(moss ? { symbol, token: MOSS_TOKEN.address, decimals: MOSS_TOKEN.decimals } : {}) }; }
    },
    challenge(playerId, wallet, origin, now = Date.now()) {
      const walletAddress = address(wallet), gameOrigin = new URL(origin).origin, expiresAt = now + 5 * 60000;
      for (const [key, value] of challenges) if (value.expiresAt <= now) challenges.delete(key);
      const message = `Mossvale wallet\nOrigin: ${gameOrigin}\nCharacter: ${playerId}\nWallet: ${walletAddress}\nNonce: ${randomUUID()}\nExpires: ${new Date(expiresAt).toISOString()}\nThis links your wallet for the ingame store and auction trading. It does not authorize a payment.`;
      challenges.set(playerId, { wallet: walletAddress, origin: gameOrigin, expiresAt, message });
      return { message, expiresAt, address: walletAddress };
    },
    verifyWallet(playerId, signature, origin, now = Date.now()) {
      const challenge = challenges.get(playerId);
      challenges.delete(playerId);
      if (!challenge || challenge.expiresAt <= now || challenge.origin !== new URL(origin).origin || !same(verifyMessage(challenge.message, signature), challenge.wallet)) throw Error('Wallet confirmation is invalid or expired.');
      return challenge.wallet;
    },
    async prepareOrder({ listingId, buyer, seller, priceWei, referrer = ZeroAddress, referralBps = 0, referralUsdCents }, now = Date.now()) {
      // Caller must hold a durable listing reservation and verified account/wallet bindings.
      const verified = await finalized();
      if (referralBps !== 0 && (!verified.referralsEnabled || !(verified.feeVersion === 2 ? [10, 25, 50, 75, 100] : [500, 1000]).includes(referralBps))) throw Error('Referral rewards require the updated MOSS auction settlement contract.');
      if (!same(referrer, ZeroAddress) && referralBps === 0) throw Error('Invalid auction referral terms.');
      const latest = await rpc('eth_getBlockByNumber', ['latest', false]);
      const chainNow = Number(BigInt(latest.timestamp));
      if (!Number.isSafeInteger(chainNow) || Math.abs(chainNow - Math.floor(now / 1000)) > 120) throw Error('Auction chain clock is stale.');
      if (typeof listingId !== 'string' || !listingId.length || listingId.length > 128) throw Error('Invalid listing.');
      const order = { listingId: id(listingId), buyer: address(buyer), seller: address(seller), priceWei: String(priceWei), deadline: chainNow + 300,
        ...(moss ? { currency: 'moss', token: MOSS_TOKEN.address,
          ...(verified.referralsEnabled ? { referrer: getAddress(referrer), referralBps } : {}),
          ...(referralUsdCents !== undefined ? { referralUsdCents } : {}) } : {}), contract: contractAddress };
      const orderHash = validateOrder(order);
      if (moss) {
        const balance = erc20Interface.decodeFunctionResult('balanceOf', await rpc('eth_call', [{ to: MOSS_TOKEN.address,
          data: erc20Interface.encodeFunctionData('balanceOf', [order.buyer]) }, { blockHash: latest.hash, requireCanonical: true }]))[0];
        await canonicalBlock(latest);
        if (balance < BigInt(order.priceWei)) throw Error('Not enough MOSS in your linked wallet.');
      }
      const signature = await signer.signTypedData(domain, auctionOrderTypes(order), order);
      return { ...order, signature, orderHash, chainId, contract: contractAddress,
        ...(moss ? { approval: { to: MOSS_TOKEN.address, data: erc20Interface.encodeFunctionData('approve', [contractAddress, order.priceWei]), value: '0x0', chainId: toQuantity(chainId) } } : {}),
        transaction: { to: contractAddress, data: auctionOrderInterface(order).encodeFunctionData('buy', [order, signature]), value: moss ? '0x0' : toQuantity(BigInt(order.priceWei)), chainId: toQuantity(chainId) } };
    },
    async settlement(order, now = Date.now()) {
      if (order.chainId !== chainId || !same(order.contract, contractAddress)) throw Error('The original auction deployment is required; escrow must stay locked.');
      const orderHash = validateOrder(order), { block, tag, referralsEnabled, feeVersion } = await finalized();
      if (moss && (referralsEnabled !== (order.referralBps !== undefined) || order.referralBps && !(feeVersion === 2 ? [10, 25, 50, 75, 100] : [500, 1000]).includes(order.referralBps))) throw Error('Auction order does not match the original settlement version; escrow must stay locked.');
      const readPayment = async blockTag => {
        const value = await rpc('eth_call', [{ to: contractAddress, data: abi.encodeFunctionData('paidOrders', [order.listingId]) }, blockTag]);
        const paid = abi.decodeFunctionResult('paidOrders', value)[0];
        if (paid !== ZeroHash && !same(paid, orderHash)) throw Error('Listing was paid against a different order; escrow must stay locked.');
        return same(paid, orderHash);
      };
      const finalPaid = await readPayment(tag);
      await canonicalBlock(block);
      if (!Number.isSafeInteger(now) || observedFinalized && (BigInt(block.number) < BigInt(observedFinalized.number)
        || block.number === observedFinalized.number && !same(block.hash, observedFinalized.hash))) throw Error('Auction chain finality regressed.');
      observedFinalized = block;
      if (finalPaid) return { state: 'paid', orderHash, blockHash: block.hash, blockNumber: block.number };

      const latest = await rpc('eth_getBlockByNumber', ['latest', false]), seconds = Math.floor(now / 1000);
      if (!validBlock(latest) || Math.abs(Number(BigInt(latest.timestamp)) - seconds) > 120
        || BigInt(latest.number) < BigInt(block.number)
        || BigInt(latest.timestamp) < BigInt(block.timestamp) || latest.number === block.number && !same(latest.hash, block.hash)) throw Error('Auction chain head is stale or inconsistent.');
      const latestPaid = await readPayment({ blockHash: latest.hash, requireCanonical: true });
      if (!latestPaid && Math.abs(Number(BigInt(block.timestamp)) - seconds) > 1800) throw Error('Auction chain head is stale or inconsistent.');
      // Finalized time alone expires an order; a latest-head deadline cannot release seller escrow.
      const expired = BigInt(block.timestamp) > BigInt(order.deadline);
      if (latestPaid && same(latest.hash, block.hash)) throw Error('Auction payment differs within the same canonical block.');
      if (latestPaid && expired) throw Error('Auction payment conflicts with finalized expiry.');
      let anchor = latest, orphaned = false;
      if (order.paymentBlock !== undefined) {
        const saved = order.paymentBlock;
        if (!hash(saved?.hash) || !quantity(saved.number) || BigInt(saved.number) > BigInt(latest.number))
          throw Error('Auction payment block is unavailable or ahead of the chain.');
        const canonical = await rpc('eth_getBlockByNumber', [saved.number, false]);
        if (!validBlock(canonical) || canonical.number !== saved.number) throw Error('Auction payment block is unavailable.');
        orphaned = !same(canonical.hash, saved.hash);
        if (!orphaned) {
          if (!latestPaid) throw Error('Auction payment is missing from its canonical chain.');
          anchor = canonical;
        }
      }
      // Only an orphaned durable payment block plus fresh canonical unpaid state can revoke a delivery.
      // RPC errors, missing receipts and temporary finality delays preserve provisional items.
      await Promise.all([canonicalBlock(block), canonicalBlock(latest)]);
      // Other listings can finish a newer observation while this one's RPC reads are in flight.
      if (BigInt(latest.number) < BigInt(observedFinalized.number)
        || observedLatest && BigInt(latest.number) < BigInt(observedLatest.number)) throw Error('Auction chain head is stale or inconsistent.');
      observedLatest = latest;
      // Referral spending is credited only at finality; ordinary purchases retain immediate settlement.
      // Unpaid expiry always requires finality.
      return latestPaid
        ? { state: order.referralUsdCents === undefined ? 'paid' : 'processed', orderHash, blockHash: anchor.hash, blockNumber: anchor.number, ...(orphaned ? { reanchored: true } : {}) }
        : { state: expired ? 'expired' : 'pending', orderHash, ...(orphaned ? { revoked: true } : {}) };
    },
    async verifyPayment(order, transactionHash, now = Date.now()) {
      if (!/^0x[0-9a-f]{64}$/i.test(transactionHash)) throw Error('Invalid transaction hash.');
      const [result, receipt] = await Promise.all([this.settlement(order, now), rpc('eth_getTransactionReceipt', [transactionHash])]);
      if (result.state !== 'paid' && result.state !== 'processed') return result;
      if (!receipt || receipt.status !== '0x1'
        || !same(receipt.transactionHash, transactionHash) || !hash(receipt.blockHash) || !quantity(receipt.blockNumber)
        || BigInt(receipt.blockNumber) > BigInt(result.blockNumber)) throw Error('Payment receipt does not match this order.');
      const logs = await receiptOperationLogs(receipt, { wallet: order.buyer, contract: contractAddress,
        sponsoredOperation: chainId === 4663 ? sponsoredOperation : undefined });
      const canonical = await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]);
      if (!same(canonical?.hash, receipt.blockHash)) throw Error('Payment receipt is not canonical.');
      const matching = logs.filter(log => {
        if (log.removed || !same(log.address, contractAddress)) return false;
        try { const event = abi.parseLog(log); return event?.name === 'Purchased' && event.args.listingId === order.listingId
          && event.args.orderHash === result.orderHash && same(event.args.buyer, order.buyer) && same(event.args.seller, order.seller) && event.args.priceWei === BigInt(order.priceWei); }
        catch { return false; }
      });
      if (matching.length !== 1) throw Error('Payment receipt does not match this order.');
      return { ...result, transactionHash };
    },
  };
}
