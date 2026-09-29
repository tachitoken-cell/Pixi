import { readFileSync } from 'node:fs';
import { Interface, Wallet, TypedDataEncoder, ZeroAddress, ZeroHash, getAddress, id, keccak256, parseUnits, formatUnits, toQuantity, toBeHex } from 'ethers';
import { MOSS_TOKEN } from './auction.ts';
import { storeProduct, storeProductForSale } from './ingame-store.ts';
import { ROBINHOOD_CHAIN, MOSS_TOKEN_RUNTIME_HASH, erc20Interface } from './auction-chain.mjs';
import { getChainRpc } from './nft-rpc.mjs';
import { receiptOperationLogs } from './user-operation-receipt.mjs';
import { readPonsMossPrice } from './pons-price.mjs';

const artifact = JSON.parse(readFileSync(new URL('../public/contracts/MossvaleStore.json', import.meta.url), 'utf8'));
const STORE_V2_RUNTIME_HASH = '0xd9fc5437e90b8a851e39a19ccdee768fb7643e985966e0d580c07286f378aae8';
// Activate only after every realm runs the class-aware save schema. Public deployment addresses;
// the existing v2 configuration remains its settlement route, with no host/environment change.
const STORE_CONTRACT_REPLACEMENTS = new Map([
  ['0x4d35c8be28fde974921a851627ad785ce2939cda', '0x745c8f5db2Ea7A4B1512437Bfd8654C3BF53B5b4'],
]);
export const storeInterface = new Interface(artifact.abi);
export const STORE_ORDER_TYPES = { Order: [
  { name: 'orderId', type: 'bytes32' }, { name: 'productId', type: 'bytes32' }, { name: 'characterId', type: 'bytes32' },
  { name: 'buyer', type: 'address' }, { name: 'amountWei', type: 'uint256' }, { name: 'usdCents', type: 'uint256' }, { name: 'deadline', type: 'uint64' },
] };
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const hash = value => typeof value === 'string' && /^0x[\da-f]{64}$/i.test(value);
const quantity = value => typeof value === 'string' && /^0x(?:0|[1-9a-f][\da-f]*)$/i.test(value);
const validBlock = block => hash(block?.hash) && quantity(block.number) && quantity(block.timestamp);
const address = value => { const result = getAddress(value); if (result === ZeroAddress) throw Error('A verified wallet is required.'); return result; };
const RBLX = '0xF0C4BF4C582cb3836e98394b1d4e7B7281101bE8';
const POOL_MANAGER = '0x8366a39CC670B4001A1121B8F6A443A643e40951';
const POOL_MANAGER_HASH = '0xbd3881180b547f5fe817545743cfb4343e96b1bc6640dcd70c106b0066e95626';
export const STORE_PRICE_POOL = '0xc08c208a8bf53008da38fad200c3d8033f234418a6e895720a17a73090935c83';
// Canonical MOSS/RBLX V4 pool: fee 0, tick spacing 200, Pons hook 0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044.
// Slot derivation follows github.com/Uniswap/v4-core/blob/main/src/libraries/StateLibrary.sol.
const POOL_SLOT = '0x4c1db621d60556dea81ca6cc052a7c2911e04482ad764da56a6eb525ff27efea';
const SCALE = 10n ** 18n, Q96 = 2n ** 96n;
const robinhoodApi = 'https://api.robinhood.com/rhj';

/** Payments/holdings use the issuer bid and lowest finalized sample; payouts use ask and highest.
 * This is a conservative sampled market price, not a manipulation-proof oracle or an exact TWAP. */
export async function readStorePrice({ rpc, block, now = Date.now(), purpose = 'payment', fetchJson = async url => {
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw Error('Robinhood USD pricing is unavailable.');
  return response.json();
} }) {
  const [prices, assets, managerCode, ...older] = await Promise.all([
    fetchJson(`${robinhoodApi}/prices/RBLX`), fetchJson(`${robinhoodApi}/assets`),
    rpc('eth_getCode', [POOL_MANAGER, { blockHash: block.hash, requireCanonical: true }]),
    ...[1500n, 3000n].map(offset => rpc('eth_getBlockByNumber', [toQuantity(BigInt(block.number) - offset), false])),
  ]);
  const deployed = value => value?.tokenSymbol === 'RBLX' && value.deployments?.some(deployment => deployment.chainId === 4663 && same(deployment.contractAddress, RBLX));
  const quote = prices?.quotes?.find(deployed), asset = assets?.assets?.find(deployed);
  const generatedAt = Date.parse(quote?.generatedAt);
  if (!quote || !asset || quote.currency !== 'USD' || quote.isTradingHalt !== false || asset.status !== 'ASSET_STATUS_ACTIVE'
    || !Number.isFinite(generatedAt) || now - generatedAt > 90000 || generatedAt - now > 15000)
    throw Error('A fresh Robinhood RBLX/USD quote is unavailable.');
  const decimal = value => { if (typeof value !== 'string' || !/^\d+(?:\.\d{1,18})?$/.test(value)) throw Error('Invalid USD pricing data.'); return parseUnits(value, 18); };
  const bid = decimal(quote.bid), ask = decimal(quote.ask), multiplier = decimal(asset.currentMultiplier);
  if (bid <= 0n || ask < bid || multiplier <= 0n || keccak256(managerCode) !== POOL_MANAGER_HASH)
    throw Error('The USD market or pool deployment is invalid.');
  const payout = purpose === 'payout';
  // A wider ask cannot increase bid-based holdings or the token amount paid at the ask.
  if (purpose !== 'holdings' && !payout && ask > bid * 105n / 100n) throw Error('The RBLX/USD spread is too wide for payment pricing.');
  // Issuer REST prices are per share; corporate actions change the shares represented by one token.
  // Source: docs.robinhood.com/chain/stock-token-apis/.
  const bidUsdWei = bid * multiplier / SCALE, rblxUsdWei = payout ? ask * multiplier / SCALE : bidUsdWei, blocks = [block, ...older];
  const seconds = value => Number(BigInt(value?.timestamp ?? '0x0'));
  const window = seconds(block) - seconds(older[1]);
  if (Math.abs(Math.floor(now / 1000) - seconds(block)) > 1800 || window < 240 || window > 900
    || seconds(older[0]) >= seconds(block) || seconds(older[0]) <= seconds(older[1]) || blocks.some(value => !hash(value?.hash)))
    throw Error('Recent finalized MOSS price history is unavailable.');
  const samples = await Promise.all(blocks.map(async value => {
    const tag = { blockHash: value.hash, requireCanonical: true };
    const [slot, liquiditySlot] = await Promise.all([POOL_SLOT, toBeHex(BigInt(POOL_SLOT) + 3n, 32)].map(key => rpc('eth_getStorageAt', [POOL_MANAGER, key, tag])));
    const sqrtPrice = BigInt(slot) & ((1n << 160n) - 1n), liquidity = BigInt(liquiditySlot) & ((1n << 128n) - 1n);
    const price = sqrtPrice * sqrtPrice * rblxUsdWei / (Q96 * Q96);
    // ponytail: three samples and virtual reserves cannot prove executable depth or prevent sustained manipulation;
    // use an independent oracle if this cosmetic market grows.
    if (price <= 0n || liquidity * sqrtPrice / Q96 * bidUsdWei / SCALE < 10000n * SCALE)
      throw Error('MOSS needs at least $10,000 of virtual quote liquidity for store pricing.');
    return price;
  }));
  await Promise.all(blocks.map(async value => {
    const canonical = await rpc('eth_getBlockByNumber', [value.number, false]);
    if (!validBlock(canonical) || canonical.number !== value.number || !same(canonical.hash, value.hash))
      throw Error('MOSS price history changed during verification. Please retry.');
  }));
  const selected = samples.reduce((a, b) => (payout ? a > b : a < b) ? a : b);
  return { usdWei: selected.toString(), observedAt: now, source: payout ? 'Highest finalized MOSS/RBLX V4 sample and Robinhood RBLX/USD ask' : 'Finalized MOSS/RBLX V4 samples and Robinhood RBLX/USD bid',
    sourceUrl: `${robinhoodApi}/prices/RBLX`, poolId: STORE_PRICE_POOL, sampledBlocks: blocks.map(value => value.hash),
    sampleWindowSeconds: window, issuerGeneratedAt: quote.generatedAt, rblxUsdWei: rblxUsdWei.toString() };
}

/** Read-only qualification: finalized MOSS still held at the current head; no payment contract or signer. */
export async function readMossHoldings(wallet, { rpc = getChainRpc(process.env.STORE_RPC_URL || process.env.MOSS_AUCTION_RPC_URL || 'https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public'), price = readPonsMossPrice, now = Date.now() } = {}) {
  const owner = address(wallet);
  if (!Number.isSafeInteger(now) || now <= 0) throw Error('A valid holdings check time is required.');
  const [chain, finalized, latest] = await Promise.all([
    rpc('eth_chainId', []), rpc('eth_getBlockByNumber', ['finalized', false]), rpc('eth_getBlockByNumber', ['latest', false]),
  ]);
  if (BigInt(chain) !== BigInt(MOSS_TOKEN.chainId)) throw Error('MOSS holdings RPC is on the wrong chain.');
  if (!validBlock(finalized) || !validBlock(latest) || Math.abs(Number(BigInt(finalized.timestamp)) - Math.floor(now / 1000)) > 1800
    || Math.abs(Number(BigInt(latest.timestamp)) - Math.floor(now / 1000)) > 120 || BigInt(latest.number) < BigInt(finalized.number)
    || BigInt(latest.timestamp) < BigInt(finalized.timestamp) || latest.number === finalized.number && !same(latest.hash, finalized.hash))
    throw Error('MOSS holdings chain head is stale or inconsistent.');
  const [observed, ...balances] = await Promise.all([
    Promise.resolve().then(() => price({ rpc, block: finalized, now, purpose: 'holdings' })).catch(() => null),
    ...[finalized, latest].map(async block => {
    const tag = { blockHash: block.hash, requireCanonical: true };
    const [code, balance] = await Promise.all([rpc('eth_getCode', [MOSS_TOKEN.address, tag]),
      rpc('eth_call', [{ to: MOSS_TOKEN.address, data: erc20Interface.encodeFunctionData('balanceOf', [owner]) }, tag])]);
    if (keccak256(code) !== MOSS_TOKEN_RUNTIME_HASH) throw Error('MOSS holdings token does not match the reviewed deployment.');
    return erc20Interface.decodeFunctionResult('balanceOf', balance)[0];
  })]);
  const priced = observed && typeof observed.usdWei === 'string' && /^[1-9]\d{0,77}$/.test(observed.usdWei) && BigInt(observed.usdWei) < 2n ** 256n
    && Number.isSafeInteger(observed.observedAt) && now - observed.observedAt <= 90000 && observed.observedAt <= now + 15000;
  await Promise.all([finalized, latest].map(async block => {
    const current = await rpc('eth_getBlockByNumber', [block.number, false]);
    if (!validBlock(current) || current.number !== block.number || !same(current.hash, block.hash)) throw Error('MOSS holdings changed during verification. Please retry.');
  }));
  const balance = balances[0] < balances[1] ? balances[0] : balances[1];
  return { balanceWei: balance.toString(), ...(priced ? { valueUsdCents: (balance * BigInt(observed.usdWei) * 100n / (SCALE * SCALE)).toString() } : {}), checkedAt: now };
}

/** Verifies processed/finalized store payments and signs orders. Never broadcasts or holds gas keys. */
export function createStoreChain({ contract = process.env.STORE_CONTRACT || '', legacyContract = process.env.STORE_LEGACY_CONTRACT || '', previousContract = process.env.STORE_PREVIOUS_CONTRACT || '', ...options } = {}) {
  const replacement = typeof contract === 'string' && STORE_CONTRACT_REPLACEMENTS.get(contract.toLowerCase());
  const currentOptions = { ...options, contract: replacement || contract };
  const current = createContractStoreChain(currentOptions);
  // A code-only rollout can retain v2 configuration without stranding its orders.
  const currentSettlement = replacement ? current : createContractStoreChain(currentOptions, [artifact.runtimeCodeHash, STORE_V2_RUNTIME_HASH]);
  // Old contracts only settle their own saved orders; all new quotes use current.
  const previous = [
    [legacyContract, '0x587388814dcc259118f76955800fcd4190eecbabfcc00a6eff6ff92dce78a489'],
    [previousContract, STORE_V2_RUNTIME_HASH],
    ...(replacement ? [[contract, STORE_V2_RUNTIME_HASH]] : []),
  ].filter(([contract]) => contract).map(([contract, runtime]) => [contract, createContractStoreChain({ ...options, contract }, [runtime])]);
  const settlementChain = order => previous.find(([contract]) => same(order?.contract, contract))?.[1] ?? currentSettlement;
  return { ...current,
    settlement: (order, now) => settlementChain(order).settlement(order, now),
    verifyPayment: (order, transactionHash, now) => settlementChain(order).verifyPayment(order, transactionHash, now),
  };
}
function createContractStoreChain({ contract = process.env.STORE_CONTRACT || '', authorityKey = process.env.STORE_AUTHORITY_KEY || process.env.MOSS_AUCTION_AUTHORITY_KEY || process.env.AUCTION_AUTHORITY_KEY || '',
  rpcUrl = process.env.STORE_RPC_URL || process.env.MOSS_AUCTION_RPC_URL || 'https://robinhood-mainnet-rpc.blockreq.com/v1/rpc/public', rpc: customRpc, price: customPrice, sponsoredOperation } = {}, runtimeCodeHashes = [artifact.runtimeCodeHash]) {
  let contractAddress, signer, inFlight, observedFinalized, observedLatest;
  try { if (contract && authorityKey) { contractAddress = address(contract); signer = new Wallet(authorityKey); } } catch { /* status reports invalid configuration */ }
  const domain = { name: 'MossvaleStore', version: '1', chainId: MOSS_TOKEN.chainId, verifyingContract: contractAddress };
  const rpc = customRpc || getChainRpc(rpcUrl);
  async function verifyFinalized() {
    if (!contractAddress || !signer) throw Error('The store burn contract must be deployed and configured.');
    if (BigInt(await rpc('eth_chainId', [])) !== 4663n) throw Error('Store RPC is on the wrong chain.');
    const block = await rpc('eth_getBlockByNumber', ['finalized', false]);
    if (!hash(block?.hash) || !block.number || !block.timestamp) throw Error('Store chain finality is unavailable.');
    const tag = { blockHash: block.hash, requireCanonical: true };
    const [code, tokenCode, authority, paymentToken, ...metadata] = await Promise.all([
      rpc('eth_getCode', [contractAddress, tag]), rpc('eth_getCode', [MOSS_TOKEN.address, tag]),
      ...['authority', 'paymentToken'].map(name => rpc('eth_call', [{ to: contractAddress, data: storeInterface.encodeFunctionData(name) }, tag])),
      ...['name', 'symbol', 'decimals'].map(name => rpc('eth_call', [{ to: MOSS_TOKEN.address, data: erc20Interface.encodeFunctionData(name) }, tag])),
    ]);
    if (!runtimeCodeHashes.includes(keccak256(code)) || keccak256(tokenCode) !== MOSS_TOKEN_RUNTIME_HASH
      || !same(storeInterface.decodeFunctionResult('authority', authority)[0], signer.address)
      || !same(storeInterface.decodeFunctionResult('paymentToken', paymentToken)[0], MOSS_TOKEN.address)
      || erc20Interface.decodeFunctionResult('name', metadata[0])[0] !== 'Mossvale'
      || erc20Interface.decodeFunctionResult('symbol', metadata[1])[0] !== 'MOSS'
      || erc20Interface.decodeFunctionResult('decimals', metadata[2])[0] !== 18n) throw Error('Store deployment does not match the reviewed MOSS burn contract.');
    await canonicalBlock(block);
    return { block, tag };
  }
  const finalized = () => inFlight ??= verifyFinalized().finally(() => { inFlight = undefined; });
  async function pricing(block, now) {
    const price = await (customPrice ?? readStorePrice)({ rpc, block, now });
    if (!price || typeof price.usdWei !== 'string' || !/^[1-9]\d*$/.test(price.usdWei)
      || !Number.isSafeInteger(price.observedAt) || now - price.observedAt > 90000 || price.observedAt > now + 15000)
      throw Error('A fresh MOSS/USD price is unavailable.');
    await canonicalBlock(block);
    return price;
  }
  function validateOrder(order) {
    if (!order || order.chainId !== 4663 || !same(order.contract, contractAddress) || !same(order.token, MOSS_TOKEN.address)
      || typeof order.id !== 'string' || !order.id || typeof order.productId !== 'string' || !order.productId
      || typeof order.characterId !== 'string' || !order.characterId || !storeProduct(order.productId) || storeProduct(order.productId).usdPrice !== order.usdPrice
      || typeof order.amountWei !== 'string' || !/^[1-9]\d*$/.test(order.amountWei) || !Number.isSafeInteger(order.expiresAt)
      || order.expiresAt % 1000 !== 0) throw Error('Invalid store order.');
    const expected = { orderId: id(`mossvale-store:${order.id}`), productId: id(order.productId), characterId: id(order.characterId), buyer: address(order.wallet),
      amountWei: order.amountWei, usdCents: String(order.usdPrice * 100), deadline: order.expiresAt / 1000 };
    const digest = TypedDataEncoder.hash(domain, STORE_ORDER_TYPES, expected);
    if (!same(digest, order.orderHash) || TypedDataEncoder.hash(domain, STORE_ORDER_TYPES, order.contractOrder) !== digest) throw Error('Store order identity does not match its authorization.');
    return expected;
  }
  async function canonicalBlock(block) {
    const canonical = await rpc('eth_getBlockByNumber', [block.number, false]);
    if (!validBlock(canonical) || canonical.number !== block.number || !same(canonical.hash, block.hash))
      throw Error('Store chain changed while verifying payment. Please retry.');
  }
  return {
    network: ROBINHOOD_CHAIN,
    async status() {
      const base = { chainId: 4663, token: MOSS_TOKEN.address, symbol: 'MOSS', decimals: 18, ...(contractAddress ? { contract: contractAddress } : {}) };
      try { const { block } = await finalized(); await pricing(block, Date.now()); return { ...base, enabled: true }; }
      catch (error) { return { ...base, enabled: false, reason: error.message }; }
    },
    async prepareOrder({ id: orderId, characterId, wallet, productId, usdPrice }, now = Date.now()) {
      const product = storeProductForSale(productId);
      if (!product || product.usdPrice !== usdPrice || [orderId, characterId, productId].some(value => typeof value !== 'string' || !value || value.length > 128)) throw Error('Invalid store product.');
      const { block } = await finalized(), latest = await rpc('eth_getBlockByNumber', ['latest', false]);
      const seconds = Number(BigInt(latest?.timestamp ?? '0x0'));
      if (Math.abs(seconds - Math.floor(now / 1000)) > 120) throw Error('Store chain clock is stale.');
      const price = await pricing(block, now), priceWei = BigInt(price.usdWei);
      const amountWei = ((BigInt(usdPrice) * SCALE * SCALE + priceWei - 1n) / priceWei).toString();
      const contractOrder = { orderId: id(`mossvale-store:${orderId}`), productId: id(productId), characterId: id(characterId), buyer: address(wallet), amountWei, usdCents: String(usdPrice * 100), deadline: seconds + 300 };
      const signature = await signer.signTypedData(domain, STORE_ORDER_TYPES, contractOrder), chainId = toQuantity(4663);
      const order = { id: orderId, characterId, wallet: contractOrder.buyer, productId, usdPrice, amountWei, mossAmount: formatUnits(amountWei, 18),
        quotedAt: now, expiresAt: contractOrder.deadline * 1000, chainId: 4663, token: MOSS_TOKEN.address, contract: contractAddress, status: 'quoted',
        contractOrder, signature, orderHash: TypedDataEncoder.hash(domain, STORE_ORDER_TYPES, contractOrder), price,
        approval: { to: MOSS_TOKEN.address, data: erc20Interface.encodeFunctionData('approve', [contractAddress, amountWei]), value: '0x0', chainId },
        transaction: { to: contractAddress, data: storeInterface.encodeFunctionData('buy', [contractOrder, signature]), value: '0x0', chainId } };
      validateOrder(order);
      return order;
    },
    async settlement(order, now = Date.now()) {
      const expected = validateOrder(order), { block, tag } = await finalized();
      if (!validBlock(block) || !Number.isSafeInteger(now) || observedFinalized && (BigInt(block.number) < BigInt(observedFinalized.number)
        || block.number === observedFinalized.number && !same(block.hash, observedFinalized.hash))) throw Error('Store chain finality regressed.');
      const readPayment = async blockTag => {
        const paid = storeInterface.decodeFunctionResult('paidOrders', await rpc('eth_call', [{ to: contractAddress, data: storeInterface.encodeFunctionData('paidOrders', [expected.orderId]) }, blockTag]))[0];
        if (paid !== ZeroHash && !same(paid, order.orderHash)) throw Error('Store order has a conflicting settlement.');
        return same(paid, order.orderHash);
      };
      const finalPaid = await readPayment(tag);
      await canonicalBlock(block);
      observedFinalized = block;
      if (finalPaid) return { state: 'paid', orderHash: order.orderHash, blockHash: block.hash, blockNumber: block.number };

      const latest = await rpc('eth_getBlockByNumber', ['latest', false]), seconds = Math.floor(now / 1000);
      if (!validBlock(latest) || Math.abs(Number(BigInt(latest.timestamp)) - seconds) > 120
        || BigInt(latest.number) < BigInt(block.number)
        || BigInt(latest.timestamp) < BigInt(block.timestamp) || latest.number === block.number && !same(latest.hash, block.hash)
        || observedLatest && BigInt(latest.number) < BigInt(observedLatest.number)) throw Error('Store chain head is stale or inconsistent.');
      const latestPaid = await readPayment({ blockHash: latest.hash, requireCanonical: true });
      if (!latestPaid && Math.abs(Number(BigInt(block.timestamp)) - seconds) > 1800) throw Error('Store chain head is stale or inconsistent.');
      const expired = BigInt(block.timestamp) > BigInt(expected.deadline);
      if (latestPaid && same(latest.hash, block.hash)) throw Error('Store payment differs within the same canonical block.');
      if (latestPaid && expired) throw Error('Store payment conflicts with finalized expiry.');
      let anchor = latest, orphaned = false;
      if (order.paymentBlock !== undefined) {
        const saved = order.paymentBlock;
        if (!hash(saved?.hash) || !quantity(saved.number) || BigInt(saved.number) > BigInt(latest.number))
          throw Error('Store payment block is unavailable or ahead of the chain.');
        const canonical = await rpc('eth_getBlockByNumber', [saved.number, false]);
        if (!validBlock(canonical) || canonical.number !== saved.number) throw Error('Store payment block is unavailable.');
        orphaned = !same(canonical.hash, saved.hash);
        if (!orphaned) {
          if (!latestPaid) throw Error('Store payment is missing from its canonical chain.');
          anchor = canonical;
        }
      }
      // A missing receipt/hash or an RPC error is never reorg evidence. Only an orphaned
      // durable payment anchor plus fresh, canonical unpaid state may revoke a reward.
      await canonicalBlock(latest);
      observedLatest = latest;
      // Successful canonical inclusion settles immediately; unpaid expiry still requires finality.
      return latestPaid
        ? { state: 'paid', orderHash: order.orderHash, blockHash: anchor.hash, blockNumber: anchor.number, ...(orphaned ? { reanchored: true } : {}) }
        : { state: expired ? 'expired' : 'pending', orderHash: order.orderHash, ...(orphaned ? { revoked: true } : {}) };
    },
    async verifyPayment(order, transactionHash, now = Date.now()) {
      if (!hash(transactionHash)) throw Error('Invalid store transaction hash.');
      const result = await this.settlement(order, now);
      if (result.state !== 'paid' && result.state !== 'processed') return result;
      const receipt = await rpc('eth_getTransactionReceipt', [transactionHash]);
      if (!receipt || receipt.status !== '0x1'
        || !same(receipt.transactionHash, transactionHash) || !hash(receipt.blockHash) || !quantity(receipt.blockNumber)
        || BigInt(receipt.blockNumber) > BigInt(result.blockNumber)) throw Error('Store receipt does not match this order.');
      const logs = await receiptOperationLogs(receipt, { wallet: order.wallet, contract: contractAddress, sponsoredOperation });
      const canonical = await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]);
      if (!same(canonical?.hash, receipt.blockHash)) throw Error('Store receipt is not canonical.');
      const expected = order.contractOrder;
      const matching = logs.filter(log => {
        if (log.removed || !same(log.address, contractAddress)) return false;
        try { const event = storeInterface.parseLog(log); return event?.name === 'Purchased' && same(event.args.orderId, expected.orderId)
          && same(event.args.orderHash, order.orderHash) && same(event.args.buyer, order.wallet)
          && same(event.args.productId, expected.productId) && same(event.args.characterId, expected.characterId)
          && event.args.amountWei === BigInt(order.amountWei) && event.args.usdCents === BigInt(expected.usdCents); } catch { return false; }
      });
      if (matching.length !== 1) throw Error('Store receipt does not match this reward.');
      return { ...result, transactionHash };
    },
  };
}
