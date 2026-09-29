import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Interface, Wallet, id, parseEther, toQuantity, TypedDataEncoder } from 'ethers';
import { matchTurnkeyGasIntent, normalizeTurnkeyGasTransaction } from '../src/turnkey-gas-intent.mjs';
import { MOSS_TOKEN } from '../src/auction.ts';
import { auctionInterface, auctionOrderInterface, erc20Interface, auctionOrderTypes } from '../src/auction-chain.mjs';
import { storeInterface, STORE_ORDER_TYPES } from '../src/store-chain.mjs';
import { TREASURE_ABI, TREASURE_CLAIM_TYPES, treasureContractClaim } from '../src/treasure-rewards.ts';
import { NFT_ABI, NFT_MINT_TYPES } from '../src/nfts.ts';
import { arenaInterface, ARENA_MATCH_TYPES, ARENA_RESULT_TYPES } from '../src/arena-chain.mjs';

const authority = Wallet.createRandom(), wallet = Wallet.createRandom().address, other = Wallet.createRandom().address;
const [ethContract, mossContract, storeContract, treasuryContract, nftContract] = Array.from({ length: 5 }, () => Wallet.createRandom().address);
const now = 1_000_000, deadline = now / 1000 + 300;
const tx = (to, data, value = '0x0') => ({ to, data, value, chainId: '0x1237' });
const approve = (to, amount) => tx(MOSS_TOKEN.address, erc20Interface.encodeFunctionData('approve', [to, amount]));
const batch = (buy, approval) => ({ ...buy, approval: { to: approval.to, data: approval.data, value: approval.value } });
const player = { id: randomUUID(), auctionWallet: wallet, storeOrders: [], treasureClaims: [], nftOrders: [] };
const state = { player, listings: [], markets: [
  { enabled: true, chainId: 4663, contract: ethContract },
  { enabled: true, chainId: 4663, contract: mossContract, token: MOSS_TOKEN.address },
], store: { enabled: true, chainId: 4663, contract: storeContract },
  treasure: { configured: true, enabled: true, chainId: 4663, contract: treasuryContract },
  nft: { enabled: true, chainId: 4663, petsContract: nftContract } };
const request = transaction => ({ from: wallet, ...transaction });
const match = transaction => matchTurnkeyGasIntent(request(transaction), state, now);
const rejects = transaction => assert.throws(() => match(transaction));
assert.deepEqual(normalizeTurnkeyGasTransaction({ from: wallet, to: other, value: '0', chainId: 4663 }), { from: wallet, to: other, data: '0x', value: '0x0', chainId: '0x1237' });
for (const change of [{ from: other }, { to: '0x' + '0'.repeat(40) }, { chainId: 46630 }, { value: '-1' }, { value: '1e3' }, { value: Number.MAX_SAFE_INTEGER }, { value: '0x' + 'f'.repeat(66) }, { data: '0x1' }, { gasPrice: '0x1' }, { authorizationList: [] }]) rejects({ ...tx(other, '0x'), ...change });

for (const variant of ['eth', 'moss', 'referral', 'referral-volume']) {
  const currency = variant.startsWith('referral') ? 'moss' : variant;
  state.markets[1].referralsEnabled = variant.startsWith('referral');
  const moss = currency === 'moss', contract = moss ? mossContract : ethContract;
  const listing = { id: randomUUID(), sellerId: randomUUID(), currency, price: '2', sellerWallet: other };
  const order = { listingId: id(listing.id), buyer: wallet, seller: other, priceWei: parseEther(listing.price).toString(), deadline,
    chainId: 4663, contract, ...(moss ? { currency: 'moss', token: MOSS_TOKEN.address } : {}),
    ...(variant.startsWith('referral') ? { referrer: Wallet.createRandom().address, referralBps: variant === 'referral-volume' ? 50 : 500, referralUsdCents: 1000 } : {}) };
  const domain = { name: moss ? 'MossvaleTokenAuction' : 'MossvaleAuction', version: '1', chainId: 4663, verifyingContract: contract };
  order.signature = await authority.signTypedData(domain, auctionOrderTypes(order), order);
  order.orderHash = TypedDataEncoder.hash(domain, auctionOrderTypes(order), order);
  order.transaction = tx(contract, auctionOrderInterface(order).encodeFunctionData('buy', [order, order.signature]), moss ? '0x0' : toQuantity(BigInt(order.priceWei)));
  if (moss) order.approval = approve(contract, order.priceWei);
  listing.reservation = { buyerId: player.id, expiresAt: deadline * 1000, order }; state.listings = [listing];
  assert.equal(match(order.transaction).id, `auction:${order.orderHash}:buy`);
  if (variant.startsWith('referral')) {
    for (const change of [{ referrer: wallet }, { referralBps: 1000 }, { referralBps: 1 }, { referralUsdCents: -1 }]) {
      listing.reservation.order = { ...order, ...change }; rejects(order.transaction); rejects(order.approval);
    }
    listing.reservation.order = order;
    state.markets[1].referralsEnabled = false; rejects(order.transaction); state.markets[1].referralsEnabled = true;
    if (variant === 'referral') {
      const market = state.markets[1];
      state.markets[1] = { ...market, contract: Wallet.createRandom().address, feeVersion: 2, previousContracts: [contract] };
      for (const transaction of [order.transaction, order.approval, batch(order.transaction, order.approval)])
        assert.throws(() => match(transaction), /current game/, 'valid saved legacy orders cannot authorize a new buy or approval after market migration');
      state.markets[1] = market;
    }
  }

  for (const change of [{ to: other }, { value: '0x1' }, { data: order.transaction.data + '00' }, { from: other }]) rejects({ ...order.transaction, ...change });
  for (const change of [{ buyerId: randomUUID() }, { processed: true }, { delivered: true }, { expiresAt: now }]) {
    const original = listing.reservation; listing.reservation = { ...original, ...change }; rejects(order.transaction); listing.reservation = original;
  }
  assert.throws(() => matchTurnkeyGasIntent(request(order.transaction), state, deadline * 1000 - 15000), /current game/, 'funding leaves time for topup confirmation');
  if (moss) {
    assert.equal(match(order.approval).id, `auction:${order.orderHash}:approve`);
    const purchase = batch(order.transaction, order.approval);
    assert.equal(match(purchase).id, match(order.transaction).id, 'atomic approval and buy reserve the same intent as a legacy single buy');
    assert.deepEqual(match(purchase).transaction.approval, purchase.approval);
    for (const change of [{ to: other }, { value: '0x1' }, { data: order.transaction.data + '00' }, { from: other }]) rejects({ ...purchase, ...change });
    for (const approval of [null, undefined, [], {}, { ...purchase.approval, from: wallet }, { ...purchase.approval, chainId: 4663 },
      { ...purchase.approval, to: other }, { ...purchase.approval, to: '0x' + '0'.repeat(40) }, { ...purchase.approval, value: '0x1' },
      { ...purchase.approval, value: undefined }, { ...purchase.approval, data: undefined }, { ...purchase.approval, data: purchase.approval.data + '00' },
      batch(order.transaction, approve(other, order.priceWei)).approval,
      batch(order.transaction, approve(contract, BigInt(order.priceWei) + 1n)).approval,
      batch(order.transaction, approve(contract, 2n ** 256n - 1n)).approval]) rejects({ ...purchase, approval });
    rejects(batch(order.approval, order.transaction));
    rejects({ ...purchase, calls: [purchase.approval, order.transaction] });
    for (const change of [{ buyerId: randomUUID() }, { processed: true }, { delivered: true }, { expiresAt: now }]) {
      const saved = listing.reservation; listing.reservation = { ...saved, ...change }; rejects(purchase); listing.reservation = saved;
    }
    assert.throws(() => matchTurnkeyGasIntent(request(purchase), state, deadline * 1000 - 15000), /current game/);
    const savedTransaction = order.transaction; order.transaction = { ...savedTransaction, data: savedTransaction.data + '00' }; rejects(purchase); order.transaction = savedTransaction;
    rejects(approve(contract, 2n ** 256n - 1n)); rejects(approve(other, order.priceWei)); rejects(approve(contract, BigInt(order.priceWei) + 1n));
    const original = order.approval; order.approval = approve(contract, 2n ** 256n - 1n); rejects(order.approval); rejects(order.transaction); order.approval = original;
  } else rejects(batch(order.transaction, approve(contract, order.priceWei)));
}
state.listings = [];
const storeOrder = { id: randomUUID(), characterId: player.id, wallet, productId: 'store-ashwing', amountWei: '200', usdPrice: 20,
  expiresAt: deadline * 1000, status: 'quoted', contract: storeContract, chainId: 4663, token: MOSS_TOKEN.address };
storeOrder.contractOrder = { orderId: id(`mossvale-store:${storeOrder.id}`), productId: id(storeOrder.productId), characterId: id(player.id), buyer: wallet, amountWei: '200', usdCents: '2000', deadline };
const storeDomain = { name: 'MossvaleStore', version: '1', chainId: 4663, verifyingContract: storeContract };
storeOrder.orderHash = TypedDataEncoder.hash(storeDomain, STORE_ORDER_TYPES, storeOrder.contractOrder);
storeOrder.signature = await authority.signTypedData(storeDomain, STORE_ORDER_TYPES, storeOrder.contractOrder);
storeOrder.transaction = tx(storeContract, storeInterface.encodeFunctionData('buy', [storeOrder.contractOrder, storeOrder.signature]));
storeOrder.approval = approve(storeContract, storeOrder.amountWei); player.storeOrders = [storeOrder];
assert.equal(match(storeOrder.transaction).id, `store:${storeOrder.orderHash}:buy`);
assert.equal(match(storeOrder.approval).id, `store:${storeOrder.orderHash}:approve`);
rejects(batch(storeOrder.transaction, storeOrder.approval));
rejects(approve(storeContract, '201')); rejects(approve(other, '200'));
for (const change of [{ status: 'submitted' }, { status: 'delivered' }, { transactionHash: id('paid') }, { paymentBlock: {} }, { characterId: randomUUID() }, { wallet: other }, { amountWei: '201' }, { expiresAt: now }, { orderHash: id('tampered') }]) {
  player.storeOrders = [{ ...storeOrder, ...change }]; rejects(storeOrder.transaction); rejects(storeOrder.approval);
}
player.storeOrders = [];
const claim = { id: randomUUID(), realmId: 'eu', characterId: player.id, wallet, amount: 5, createdAt: now - 1000,
  chainId: 4663, token: MOSS_TOKEN.address, contract: treasuryContract, status: 'pending' };
claim.contractClaim = treasureContractClaim(claim); claim.amountWei = claim.contractClaim.amountWei;
const claimDomain = { name: 'MossvaleTreasureTreasury', version: '1', chainId: 4663, verifyingContract: treasuryContract };
claim.claimHash = TypedDataEncoder.hash(claimDomain, TREASURE_CLAIM_TYPES, claim.contractClaim);
claim.signature = await authority.signTypedData(claimDomain, TREASURE_CLAIM_TYPES, claim.contractClaim);
claim.transaction = tx(treasuryContract, new Interface(TREASURE_ABI).encodeFunctionData('claim', [claim.contractClaim, claim.signature])); player.treasureClaims = [claim];
assert.equal(match(claim.transaction).id, `treasure:${claim.claimHash}`);
rejects(batch(claim.transaction, approve(treasuryContract, '1')));
player.auctionWallet = other;
assert.equal(match(claim.transaction).id, `treasure:${claim.claimHash}`, 'saved claims fund the original recipient after relinking');
assert.throws(() => matchTurnkeyGasIntent({ ...request(claim.transaction), from: other }, state, now), /current game/, 'new linked wallet cannot redirect the saved payout');
player.auctionWallet = undefined;
assert.equal(match(claim.transaction).id, `treasure:${claim.claimHash}`, 'unlinking cannot strand the saved recipient');
player.auctionWallet = wallet;
state.treasure.enabled = false; assert.equal(match(claim.transaction).id, `treasure:${claim.claimHash}`, 'saved claims keep their original authorization when new claims are disabled');
for (const change of [{ status: 'paid' }, { status: 'processed' }, { transactionHash: id('submitted') }, { paymentBlock: {} }, { characterId: randomUUID() }, { wallet: other }, { amountWei: '1' }, { contract: other }]) {
  player.treasureClaims = [{ ...claim, ...change }]; rejects(claim.transaction);
}
player.treasureClaims = [];
const mint = { id: randomUUID(), characterId: player.id, wallet, kind: 'pet', assetId: 'moss-fox', amountWei: '0', status: 'quoted', chainId: 4663, contract: nftContract, expiresAt: deadline * 1000 };
const mintId = id(`mossvale-nft:pet:${player.id}:${mint.id}`); mint.tokenId = BigInt(mintId).toString();
mint.contractOrder = { orderId: mintId, tokenId: mint.tokenId, assetId: 1, buyer: wallet, amountWei: '0', deadline };
const mintDomain = { name: 'MossvaleNFT', version: '1', chainId: 4663, verifyingContract: nftContract };
mint.orderHash = TypedDataEncoder.hash(mintDomain, NFT_MINT_TYPES, mint.contractOrder);
mint.signature = await authority.signTypedData(mintDomain, NFT_MINT_TYPES, mint.contractOrder);
mint.transaction = tx(nftContract, new Interface(NFT_ABI).encodeFunctionData('mint', [mint.contractOrder, mint.signature])); player.nftOrders = [mint];
assert.equal(match(mint.transaction).id, `nft:${mint.orderHash}`);
rejects(batch(mint.transaction, approve(nftContract, '1')));
for (const change of [{ status: 'minted' }, { characterId: randomUUID() }, { wallet: other }, { expiresAt: now }, { tokenId: '1' }, { contract: other }]) {
  player.nftOrders = [{ ...mint, ...change }]; rejects(mint.transaction);
}
player.nftOrders = [];
for (const contract of [ethContract, mossContract]) {
  const withdrawal = tx(contract, auctionInterface.encodeFunctionData('withdraw', [wallet]));
  assert.deepEqual(match(withdrawal).withdrawal, { contract, wallet }, 'caller must verify positive on-chain proceeds before funding');
  rejects(batch(withdrawal, approve(contract, '1')));
  rejects(tx(contract, auctionInterface.encodeFunctionData('withdraw', [other]))); rejects({ ...withdrawal, value: '0x1' });
}
rejects(tx(other, auctionInterface.encodeFunctionData('withdraw', [wallet])));
rejects(tx(MOSS_TOKEN.address, new Interface(['function transfer(address,uint256)']).encodeFunctionData('transfer', [other, 1])));
rejects(tx(nftContract, new Interface(['function setApprovalForAll(address,bool)']).encodeFunctionData('setApprovalForAll', [other, true])));
state.markets[0].enabled = false; rejects(tx(ethContract, auctionInterface.encodeFunctionData('withdraw', [wallet])));
const previous = [Wallet.createRandom().address, Wallet.createRandom().address], mossMarket = state.markets[1];
mossMarket.previousContracts = previous; mossMarket.previousContract = previous[0]; mossMarket.enabled = false;
for (const contract of previous) {
  const withdrawal = tx(contract, auctionInterface.encodeFunctionData('withdraw', [wallet]));
  assert.deepEqual(match(withdrawal).withdrawal, { contract, wallet }, 'verified old proceeds remain collectable while new trading is disabled');
  rejects(tx(contract, auctionInterface.encodeFunctionData('withdraw', [other])));
  rejects({ ...withdrawal, value: '0x1' }); rejects(batch(withdrawal, approve(contract, '1')));
  rejects(approve(contract, '1'));
  for (const change of [{ chainId: 46630 }, { token: other }, { token: undefined }, { previousContracts: [], previousContract: undefined }]) {
    state.markets[1] = { ...mossMarket, ...change }; rejects(withdrawal);
  }
  state.markets[1] = mossMarket;
}
rejects(tx(mossContract, auctionInterface.encodeFunctionData('withdraw', [wallet])));
mossMarket.previousContracts = [mossContract]; delete mossMarket.previousContract;
rejects(tx(mossContract, auctionInterface.encodeFunctionData('withdraw', [wallet])));
delete mossMarket.previousContracts; mossMarket.enabled = true;
const arenaContract = Wallet.createRandom().address, arenaDomain = { name: 'MossvaleArena', version: '1', chainId: 4663, verifyingContract: arenaContract };
const terms = { matchId: id('arena gas'), playerA: wallet, playerB: other, stakeWei: parseEther('100').toString(), fundingDeadline: deadline, refundAfter: deadline + 3000 };
const signature = await authority.signTypedData(arenaDomain, ARENA_MATCH_TYPES, terms), termsHash = TypedDataEncoder.hash(arenaDomain, ARENA_MATCH_TYPES, terms);
const fund = tx(arenaContract, arenaInterface.encodeFunctionData('fund', [terms, signature]));
const arenaOrder = { ...terms, signature, termsHash, token: MOSS_TOKEN.address, chainId: 4663, contract: arenaContract, to: arenaContract, data: fund.data, approval: approve(arenaContract, terms.stakeWei) };
const wager = { order: arenaOrder }; player.arenaWagers = [wager];
state.arena = { enabled: true, chainId: 4663, contract: arenaContract, token: MOSS_TOKEN.address, authority: authority.address };
assert.equal(match(fund).id, `arena:${termsHash}:fund`);
assert.equal(match(arenaOrder.approval).id, `arena:${termsHash}:approve`);
for (const changed of [approve(arenaContract, BigInt(terms.stakeWei) + 1n), { ...fund, from: other }, { ...fund, value: '1' }, { ...fund, data: fund.data + '00' }]) rejects(changed);
const resultSignature = await authority.signTypedData(arenaDomain, ARENA_RESULT_TYPES, { matchId: terms.matchId, termsHash, winner: wallet });
const settle = tx(arenaContract, arenaInterface.encodeFunctionData('settle', [terms, wallet, resultSignature]));
wager.result = { winner: wallet, signature: resultSignature, matchId: terms.matchId, contract: arenaContract, chainId: 4663, to: arenaContract, data: settle.data };
rejects(fund); rejects(arenaOrder.approval);
assert.equal(match(settle).id, `arena:${termsHash}:settle`);
wager.result.winner = other; rejects(settle); wager.result.winner = wallet;
const refund = tx(arenaContract, arenaInterface.encodeFunctionData('refund', [terms]));
rejects(refund);
assert.equal(matchTurnkeyGasIntent(request(refund), state, (deadline + 1) * 1000).id, `arena:${termsHash}:refund`);
assert.throws(() => matchTurnkeyGasIntent(request(settle), state, terms.refundAfter * 1000));
state.arena.enabled = false; rejects(settle); state.arena.enabled = true;
player.arenaWagers = []; rejects(settle);
console.log('Turnkey gas intents passed: exact persisted auction/store/treasury/mint calls, bounded approvals, ownership, expiry, no already-submitted funding, strict fields and self-only withdrawal descriptors. No chain requests.');
