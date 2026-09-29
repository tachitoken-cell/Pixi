import { getAddress, id, isHexString, toQuantity, TypedDataEncoder, verifyTypedData, ZeroAddress } from 'ethers';
import { MOSS_TOKEN, auctionOrderReferralValid } from './auction.ts';
import { auctionInterface, auctionOrderInterface, erc20Interface, auctionOrderTypes, auctionPriceWei } from './auction-chain.mjs';
import { storeInterface, STORE_ORDER_TYPES } from './store-chain.mjs';
import { storeProduct } from './ingame-store.ts';
import { treasureClaimValid } from './treasure-rewards.ts';
import { nftOrderValid } from './nfts.ts';
import { arenaInterface, ARENA_MATCH_TYPES, ARENA_RESULT_TYPES } from './arena-chain.mjs';

const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const address = value => { const result = getAddress(value); if (result === ZeroAddress) throw Error('A nonzero wallet address is required.'); return result; };
const uint = value => typeof value === 'string' && /^(?:0x[\da-f]+|0|[1-9]\d*)$/i.test(value) && value.length <= 80 && BigInt(value) < 2n ** 256n;

/** Only transaction fields reviewed by the game can cross the funding boundary. */
export function normalizeTurnkeyGasTransaction(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['from', 'to', 'data', 'value', 'chainId', 'approval'].includes(key))
    || input.chainId !== undefined && ![4663, '4663', '0x1237'].includes(input.chainId)
    || input.data !== undefined && (typeof input.data !== 'string' || input.data.length > 32768 || !isHexString(input.data, true))
    || input.value !== undefined && !uint(input.value)) throw Error('Invalid game-funded wallet transaction.');
  const transaction = { from: address(input.from), to: address(input.to), data: (input.data ?? '0x').toLowerCase(), value: toQuantity(BigInt(input.value ?? '0')), chainId: '0x1237' };
  if (Object.hasOwn(input, 'approval')) {
    const approval = input.approval;
    if (!approval || typeof approval !== 'object' || Array.isArray(approval)
      || Object.keys(approval).some(key => !['to', 'data', 'value'].includes(key))
      || typeof approval.data !== 'string' || !uint(approval.value) || BigInt(approval.value) !== 0n || BigInt(transaction.value) !== 0n)
      throw Error('Invalid atomic game purchase approval.');
    const normalized = normalizeTurnkeyGasTransaction({ ...approval, from: transaction.from, chainId: transaction.chainId });
    transaction.approval = { to: normalized.to, data: normalized.data, value: normalized.value };
  }
  return transaction;
}

/** Funding eligibility only; the caller must still simulate and, for withdrawals, read positive proceeds on-chain. */
export function matchTurnkeyGasIntent(input, { player, listings = [], markets = [], store, treasure, nft, arena }, now = Date.now()) {
  const transaction = normalizeTurnkeyGasTransaction(input), wallet = transaction.from;
  if (!Number.isSafeInteger(now) || now <= 0 || !player?.id) throw Error('Sign in to the active character before requesting gas.');
  const matches = expected => {
    try { return JSON.stringify(normalizeTurnkeyGasTransaction({ ...expected, from: wallet })) === JSON.stringify(transaction); }
    catch { return false; }
  };
  const exact = (saved, expected) => {
    try { return JSON.stringify(normalizeTurnkeyGasTransaction({ ...saved, from: wallet })) === JSON.stringify(normalizeTurnkeyGasTransaction({ ...expected, from: wallet })); }
    catch { return false; }
  };
  const call = (to, data, value = '0x0') => ({ to, data, value, chainId: '0x1237' });
  const approval = (contract, amount) => call(MOSS_TOKEN.address, erc20Interface.encodeFunctionData('approve', [contract, amount]));
  const enabled = (status, contract) => status?.enabled === true && status.chainId === 4663 && same(status.contract, contract);
  // Saved payouts retain their original recipient when the character links another wallet.
  for (const claim of player.treasureClaims ?? []) {
    if (claim?.status === 'pending' && !claim.transactionHash && !claim.paymentBlock && claim.characterId === player.id && same(claim.wallet, wallet)
      && treasure?.configured === true && treasure.chainId === 4663 && [treasure.contract, treasure.legacyContract].some(contract => same(contract, claim.contract))
      && treasureClaimValid(claim) && matches(claim.transaction)) return { id: `treasure:${claim.claimHash}`, transaction };
  }
  if (!same(player.auctionWallet, wallet)) throw Error('Link this wallet to the active character before requesting gas.');
  for (const wager of player.arenaWagers ?? []) {
    const order = wager.order, result = wager.result;
    if (!enabled(arena, order?.contract) || !arena.authority || !same(arena.token, MOSS_TOKEN.address)
      || order.chainId !== 4663 || !same(order.token, MOSS_TOKEN.address) || ![order.playerA, order.playerB].some(player => same(player, wallet))) continue;
    try {
      const domain = { name: 'MossvaleArena', version: '1', chainId: 4663, verifyingContract: order.contract };
      if (TypedDataEncoder.hash(domain, ARENA_MATCH_TYPES, order) !== order.termsHash
        || !same(verifyTypedData(domain, ARENA_MATCH_TYPES, order, order.signature), arena.authority)) continue;
      const fund = call(order.contract, arenaInterface.encodeFunctionData('fund', [order, order.signature]));
      const approve = approval(order.contract, order.stakeWei);
      if (!exact({ to: order.to, data: order.data, chainId: order.chainId }, fund) || !exact(order.approval, approve)) continue;
      if (!result && order.fundingDeadline * 1000 > now + 15000) {
        if (matches(approve)) return { id: `arena:${order.termsHash}:approve`, transaction };
        if (matches(fund)) return { id: `arena:${order.termsHash}:fund`, transaction };
      }
      if (result && now < order.refundAfter * 1000 && result.matchId === order.matchId && result.chainId === 4663 && same(result.contract, order.contract)
        && same(verifyTypedData(domain, ARENA_RESULT_TYPES, { matchId: order.matchId, termsHash: order.termsHash, winner: result.winner }, result.signature), arena.authority)) {
        const settle = call(order.contract, arenaInterface.encodeFunctionData('settle', [order, result.winner, result.signature]));
        if (exact({ to: result.to, data: result.data, chainId: result.chainId }, settle) && matches(settle)) return { id: `arena:${order.termsHash}:settle`, transaction };
      }
      if (now > order.fundingDeadline * 1000 && matches(call(order.contract, arenaInterface.encodeFunctionData('refund', [order]))))
        return { id: `arena:${order.termsHash}:refund`, transaction };
    } catch { /* Invalid saved terms cannot authorize a sponsored transaction. */ }
  }
  for (const listing of listings) {
    const reservation = listing?.reservation, order = reservation?.order, moss = listing?.currency === 'moss';
    if (!order || !['eth', 'moss'].includes(listing.currency) || reservation.buyerId !== player.id || listing.sellerId === player.id
      || reservation.processed || reservation.delivered || order.paymentBlock || reservation.expiresAt !== order.deadline * 1000
      || !Number.isSafeInteger(order.deadline) || reservation.expiresAt <= now + 15000 || order.chainId !== 4663
      || !markets.some(market => enabled(market, order.contract) && (moss ? same(market.token, MOSS_TOKEN.address)
        && (market.referralsEnabled === true) === (order.referralBps !== undefined) : !market.token))
      || !auctionOrderReferralValid(order)
      || !same(order.buyer, wallet) || !same(order.seller, listing.sellerWallet) || same(order.seller, wallet)
      || order.listingId !== id(listing.id) || order.priceWei !== auctionPriceWei(listing.price, listing.currency)
      || !isHexString(order.signature, 65) || (moss ? order.currency !== 'moss' || !same(order.token, MOSS_TOKEN.address)
        : order.currency !== undefined && order.currency !== 'eth' || order.token !== undefined || order.approval !== undefined)) continue;
    const abi = auctionOrderInterface(order);
    const digest = TypedDataEncoder.hash({ name: moss ? 'MossvaleTokenAuction' : 'MossvaleAuction', version: '1', chainId: 4663, verifyingContract: order.contract }, auctionOrderTypes(order), order);
    const buy = call(order.contract, abi.encodeFunctionData('buy', [order, order.signature]), moss ? '0x0' : toQuantity(BigInt(order.priceWei)));
    if (!same(order.orderHash, digest) || !exact(order.transaction, buy)) continue;
    if (moss) {
      const approve = approval(order.contract, order.priceWei);
      if (!exact(order.approval, approve)) continue;
      if (transaction.approval && matches({ ...buy, approval: { to: approve.to, data: approve.data, value: approve.value } }))
        return { id: `auction:${digest}:buy`, transaction };
      if (matches(approve)) return { id: `auction:${digest}:approve`, transaction };
    }
    if (matches(buy)) return { id: `auction:${digest}:buy`, transaction };
  }
  for (const order of player.storeOrders ?? []) {
    const product = storeProduct(order?.productId);
    if (!product || order.status !== 'quoted' || order.transactionHash || order.paymentBlock || order.characterId !== player.id
      || !same(order.wallet, wallet) || !enabled(store, order.contract) || order.chainId !== 4663 || !same(order.token, MOSS_TOKEN.address)
      || order.usdPrice !== product.usdPrice || !Number.isSafeInteger(order.expiresAt) || order.expiresAt <= now + 15000 || order.expiresAt % 1000
      || !uint(order.amountWei) || BigInt(order.amountWei) <= 0n || !isHexString(order.signature, 65)) continue;
    const signed = { orderId: id(`mossvale-store:${order.id}`), productId: id(order.productId), characterId: id(player.id), buyer: wallet,
      amountWei: order.amountWei, usdCents: String(product.usdPrice * 100), deadline: order.expiresAt / 1000 };
    const domain = { name: 'MossvaleStore', version: '1', chainId: 4663, verifyingContract: order.contract };
    const digest = TypedDataEncoder.hash(domain, STORE_ORDER_TYPES, signed);
    const buy = call(order.contract, storeInterface.encodeFunctionData('buy', [signed, order.signature])), approve = approval(order.contract, order.amountWei);
    if (!same(order.orderHash, digest) || TypedDataEncoder.hash(domain, STORE_ORDER_TYPES, order.contractOrder) !== digest
      || !exact(order.transaction, buy) || !exact(order.approval, approve)) continue;
    if (matches(approve)) return { id: `store:${digest}:approve`, transaction };
    if (matches(buy)) return { id: `store:${digest}:buy`, transaction };
  }
  for (const order of player.nftOrders ?? []) {
    if (order?.status === 'quoted' && order.expiresAt > now + 15000 && order.characterId === player.id && same(order.wallet, wallet)
      && nft?.enabled === true && nft.chainId === 4663 && [nft.petsContract, nft.legacyPetsContract].some(contract => same(contract, order.contract))
      && nftOrderValid(order) && matches(order.transaction)) return { id: `nft:${order.orderHash}`, transaction };
  }
  for (const market of markets) {
    if (market?.chainId !== 4663 || market.token && !same(market.token, MOSS_TOKEN.address)) continue;
    // Previous MOSS escrows are independently verified even when new trading is unavailable.
    const previous = same(market.token, MOSS_TOKEN.address)
      ? [...(Array.isArray(market.previousContracts) ? market.previousContracts : []), market.previousContract].filter(contract => !same(contract, market.contract)) : [];
    for (const contract of [...(market.enabled === true ? [market.contract] : []), ...previous])
      if (matches(call(contract, auctionInterface.encodeFunctionData('withdraw', [wallet]))))
        return { id: `withdraw:${contract.toLowerCase()}:${wallet.toLowerCase()}`, transaction, withdrawal: { contract: address(contract), wallet } };
  }
  throw Error('Gas is available only for a current game purchase, claim, mint or sale withdrawal. Review it in the game first.');
}
