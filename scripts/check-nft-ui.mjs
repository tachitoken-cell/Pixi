import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { Wallet, Interface, TypedDataEncoder, id, parseEther, MaxUint256 } from 'ethers';
import { registerHooks } from 'node:module';
const chooserHook = registerHooks({ load(url, context, next) { return url.endsWith('/src/wallet-provider.ts') ? { format: 'module', shortCircuit: true, source: 'export const chooseWallet = () => globalThis.chooseNftWallet();' } : next(url, context); } });
const { mountNftUI, validateNftPayment, validateNftAuctionPayment, validateNftMigration } = await import('../src/nft-ui.ts');
chooserHook.deregister();
import { NFT_ABI, NFT_AUCTION_ABI, NFT_MIGRATION_ABI, NFT_MINT_TYPES, NFT_HOUSES, NFT_PETS, NFT_MOUNTS, NFT_LEGACY_PETS, nftAsset } from '../src/nfts.ts';
import { MOSS_TOKEN } from '../src/auction.ts';
import { renderPetCollection } from '../src/pet-ui.ts';

const buyer = Wallet.createRandom(), authority = Wallet.createRandom(), contract = Wallet.createRandom().address, newContract = Wallet.createRandom().address;
const mountContract = Wallet.createRandom().address;
const now = Math.floor(Date.now() / 1000) * 1000, characterId = '10000000-0000-4000-8000-000000000010';
const tokenABI = new Interface(['function balanceOf(address) view returns(uint256)', 'function allowance(address,address) view returns(uint256)', 'function approve(address,uint256) returns(bool)']);
let number = 0;
async function mintOrder(kind = 'pet', assetId = 'moss-fox', claimSource) {
  const collection = kind === 'mount' ? mountContract : nftAsset(kind, assetId)?.assetId > 8 ? newContract : contract;
  const order = { id: `10000000-0000-4000-8000-${String(++number).padStart(12, '0')}`, characterId, wallet: buyer.address, contract: collection, kind, assetId, amountWei: kind !== 'house' ? '0' : parseEther('12.123456789012345678').toString(), chainId: 4663, status: 'quoted', expiresAt: now + 300_000 };
  const orderId = id(`mossvale-nft:${kind}:${characterId}:${order.id}`), asset = nftAsset(kind, assetId);
  order.tokenId = kind !== 'house' ? BigInt(orderId).toString() : String(asset.assetId);
  order.contractOrder = { orderId, tokenId: order.tokenId, assetId: asset.assetId, buyer: buyer.address, amountWei: order.amountWei, deadline: order.expiresAt / 1000 };
  const domain = { name: 'MossvaleNFT', version: '1', chainId: 4663, verifyingContract: collection };
  order.orderHash = TypedDataEncoder.hash(domain, NFT_MINT_TYPES, order.contractOrder);
  order.signature = await authority.signTypedData(domain, NFT_MINT_TYPES, order.contractOrder);
  order.transaction = { to: collection, data: new Interface(NFT_ABI).encodeFunctionData('mint', [order.contractOrder, order.signature]), value: '0x0', chainId: '0x1237' };
  if (kind === 'house') order.approval = { ...order.transaction, to: MOSS_TOKEN.address, data: tokenABI.encodeFunctionData('approve', [contract, order.amountWei]) };
  return { ...order, ...(claimSource ? { claimSource } : {}) };
}
const terms = order => ({ kind: order.kind, assetId: order.assetId, characterId, wallet: buyer.address, contract: order.contract, amountWei: order.amountWei, ...(order.claimSource ? { claimSource: order.claimSource } : {}) });
const pet = await mintOrder();
assert.equal((await validateNftPayment(pet, terms(pet), now)).approval, undefined, 'free pet claim cannot request a MOSS approval');
for (const change of [{ kind: 'house' }, { assetId: 'moon-owl' }, { characterId: authority.address }, { wallet: authority.address }, { contract: authority.address }, { amountWei: '1' }, { chainId: 1 }, { status: 'minted' }, { status: 'expired' }, { expiresAt: now }, { tokenId: '1' }, { signature: '0x00' }, { orderHash: id('wrong') }, { contractOrder: { ...pet.contractOrder, buyer: authority.address } }, { transaction: { ...pet.transaction, to: authority.address } }, { transaction: { ...pet.transaction, value: '0x1' } }, { transaction: { ...pet.transaction, data: '0x1234' } }, { approval: { to: MOSS_TOKEN.address, data: '0x', value: '0x0', chainId: '0x1237' } }]) await assert.rejects(validateNftPayment({ ...pet, ...change }, terms(pet), now));
const clean = await validateNftPayment({ ...pet, transaction: { ...pet.transaction, from: authority.address, gasPrice: '0xffff' } }, terms(pet), now);
assert.deepEqual(Object.keys(clean).sort(), ['approval', 'chainId', 'data', 'to', 'value'], 'only independently reviewed transaction fields reach the wallet');
assert.deepEqual(NFT_LEGACY_PETS.map(pet => [pet.id, pet.assetId]), ['moss-fox', 'moon-owl', 'ember-drake', 'crystal-tortoise', 'bloom-hare', 'lantern-moth', 'frost-cub', 'golden-pig'].map((id, index) => [id, index + 1]));
assert.equal(NFT_PETS.length, 26); assert.equal(nftAsset('pet', 'store-cinder-kit').assetId, 18);
assert.deepEqual(NFT_PETS.slice(8, 18).map(pet => [pet.id, pet.assetId]), ['fern-lynx', 'moonveil-gryphlet', 'cinder-salamander', 'amethyst-terrapin', 'blossom-jackalope', 'lantern-sprite', 'rime-red-panda', 'crown-pangolin', 'store-ashwing', 'store-cinder-kit'].map((id, index) => [id, index + 9]), 'retirement never renumbers published NFTs');
assert.deepEqual(NFT_PETS.slice(18).map(pet => [pet.id, pet.assetId]), ['bramble-badger', 'duskwind-raven', 'ember-axolotl', 'geode-hedgehog', 'clover-mouse', 'dewbell-dragonfly', 'snowcap-stoat', 'suncrest-peacock'].map((id, index) => [id, index + 19]), 'new species append after every published pet');
const storeMint = await mintOrder('pet', 'store-ashwing', 'learned');
await validateNftPayment(storeMint, terms(storeMint), now);
await assert.rejects(validateNftPayment({ ...storeMint, claimSource: undefined }, terms(storeMint), now));
await assert.rejects(validateNftPayment(storeMint, { ...terms(storeMint), claimSource: undefined }, now), 'source must match the reviewed character-unlock conversion');
const newPetMint = await mintOrder('pet', 'fern-lynx'); await validateNftPayment(newPetMint, terms(newPetMint), now);
for (const pet of NFT_PETS.slice(18)) {
  const claim = await mintOrder('pet', pet.id);
  const transaction = await validateNftPayment(claim, terms(claim), now);
  assert.equal(new Interface(NFT_ABI).decodeFunctionData('mint', transaction.data)[0].assetId, BigInt(pet.assetId));
}
const legacyContract = Wallet.createRandom().address, legacyABI = new Interface(['function approve(address,uint256)', 'function ownerOf(uint256) view returns(address)', 'function assets(uint256) view returns(uint256)', 'function getApproved(uint256) view returns(address)']);
const migrationABI = new Interface(NFT_MIGRATION_ABI), destinationABI = new Interface(['function legacyCollection() view returns(address)']);
const migration = { wallet: buyer.address, legacyContract, contract, tokenId: '123', assetId: 'moss-fox',
  approval: { to: legacyContract, data: legacyABI.encodeFunctionData('approve', [contract, 123]), value: '0x0', chainId: '0x1237' },
  transaction: { to: contract, data: migrationABI.encodeFunctionData('migrate', [123]), value: '0x0', chainId: '0x1237' } };
const migrationTerms = { characterId, wallet: buyer.address, legacyContract, contract, tokenId: '123' };
assert.equal(legacyABI.decodeFunctionData('approve', validateNftMigration(migration, migrationTerms).approval.data)[1], 123n);
for (const change of [{ wallet: authority.address }, { legacyContract: contract }, { contract: authority.address }, { tokenId: '124' }, { tokenId: '0' }, { assetId: 'fern-lynx' }, { approval: undefined }, { approval: { ...migration.approval, data: new Interface(['function setApprovalForAll(address,bool)']).encodeFunctionData('setApprovalForAll', [contract, true]) } }, { transaction: { ...migration.transaction, value: '0x1' } }, { transaction: { ...migration.transaction, chainId: '0x1' } }, { transaction: { ...migration.transaction, data: migrationABI.encodeFunctionData('migrate', [124]) } }]) assert.throws(() => validateNftMigration({ ...migration, ...change }, migrationTerms));
assert.deepEqual(Object.keys(validateNftMigration({ ...migration, transaction: { ...migration.transaction, from: authority.address, gasPrice: '0xffff' } }, migrationTerms)).sort(), ['approval', 'chainId', 'data', 'to', 'value']);
const hero = { id: characterId, hp: 100, ownedPets: [], carriedItems: { 'moss-fox': 1 }, nftPets: ['moon-owl'] };
assert.match(renderPetCollection(hero, true, now, 'moon-owl'), /data-summon-pet="moon-owl"[^>]*>Summon/);
assert.match(renderPetCollection({ ...hero, nftPets: [] }, true, now, 'moon-owl'), /data-learn-pet="moon-owl"[^>]*disabled/, 'transferred NFT no longer grants a summon control');
assert.match(renderPetCollection({ ...hero, ownedPets: ['moon-owl'], nftPets: [] }, true, now, 'moon-owl'), /data-summon-pet="moon-owl"[^>]*>Summon/, 'independently learned pet survives NFT transfer');
assert.match(renderPetCollection(hero, true, now, 'moss-fox'), /data-claim-nft-pet="moss-fox"/);
const configuredPets = renderPetCollection({ ...hero, nftConfigured: true }, true, now, 'moss-fox');
assert(!configuredPets.includes('data-learn-pet="moss-fox"'), 'configured NFT mode never offers forbidden permanent learning');
assert.match(configuredPets, /data-claim-nft-pet="moss-fox"[^>]*>Claim NFT · review/);
assert(!configuredPets.includes('Learn a drop pet to summon it.'), 'NFT instructions follow configured mode even during an RPC outage');
assert.match(renderPetCollection({ ...hero, nftConfigured: false }, true, now, 'moss-fox'), /data-learn-pet="moss-fox"[^>]*>Learn pet/);
assert.match(renderPetCollection({ ...hero, nftConfigured: true }, false, now, 'moss-fox'), /data-claim-nft-pet="moss-fox"[^>]*disabled>/);


const bidAmount = parseEther('12.123456789012345678').toString();
function auctionResponse(action = 'bid', extra = {}) {
  const response = { action, wallet: buyer.address, paymentWei: action === 'bid' ? bidAmount : '0', ...(action !== 'withdraw' ? { houseId: NFT_HOUSES[0].id } : {}), ...(action === 'bid' ? { amountWei: bidAmount } : {}), ...extra };
  const abi = new Interface(NFT_AUCTION_ABI), asset = nftAsset('house', response.houseId);
  response.transaction = { to: contract, data: action === 'bid' ? abi.encodeFunctionData('bidHouse', [asset.assetId, response.amountWei, response.paymentWei]) : action === 'settle' ? abi.encodeFunctionData('settleHouse', [asset.assetId]) : abi.encodeFunctionData('withdrawRefund'), value: '0x0', chainId: '0x1237' };
  if (action === 'bid') response.approval = { ...response.transaction, to: MOSS_TOKEN.address, data: tokenABI.encodeFunctionData('approve', [contract, response.paymentWei]) };
  return response;
}
const auctionTerms = response => ({ characterId, wallet: buyer.address, contract, action: response.action, houseId: response.houseId, amountWei: response.amountWei, paymentWei: response.paymentWei, refundWei: '0' });
const bid = auctionResponse(), topup = auctionResponse('bid', { paymentWei: (BigInt(bidAmount) - parseEther('10')).toString() });
const topupPayment = validateNftAuctionPayment(topup, auctionTerms(topup));
assert.equal(tokenABI.decodeFunctionData('approve', topupPayment.approval.data)[1], BigInt(topup.paymentWei), 'approve only the extra MOSS for an own-leading-bid increase');
assert.equal(new Interface(NFT_AUCTION_ABI).decodeFunctionData('bidHouse', topupPayment.data)[2], BigInt(topup.paymentWei), 'contract call binds the exact debit against an outbid race');
for (const change of [{ action: 'withdraw' }, { houseId: NFT_HOUSES[1].id }, { wallet: authority.address }, { amountWei: '1' }, { paymentWei: '1' }, { transaction: { ...bid.transaction, to: authority.address } }, { transaction: { ...bid.transaction, value: '0x1' } }, { transaction: { ...bid.transaction, chainId: '0x1' } }, { approval: undefined }, { approval: { ...bid.approval, data: tokenABI.encodeFunctionData('approve', [contract, MaxUint256]) } }]) assert.throws(() => validateNftAuctionPayment({ ...bid, ...change }, auctionTerms(bid)));
for (const action of ['withdraw', 'settle']) { const response = auctionResponse(action); assert.equal(validateNftAuctionPayment(response, auctionTerms(response)).approval, undefined); assert.throws(() => validateNftAuctionPayment({ ...response, approval: bid.approval }, auctionTerms(response))); }
assert.deepEqual(Object.keys(validateNftAuctionPayment({ ...bid, transaction: { ...bid.transaction, from: authority.address, gasPrice: '0xffff' } }, auctionTerms(bid))).sort(), ['approval', 'chainId', 'data', 'to', 'value']);

class Element {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = {}; this.events = {}; }
  set disabled(value) { if (this._disabled !== value) for (let node = this.parentElement; node; node = node.parentElement) node.changed = true; this._disabled = value; }
  get disabled() { return this._disabled; }
  setAttribute(name, value) { this.attributes[name] = String(value); if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value); if (['id', 'disabled', 'hidden'].includes(name)) this[name] = name === 'id' ? value : true; }
  append(child) { child.parentElement = this; this.children.push(child); }
  addEventListener(name, fn) { (this.events[name] ||= []).push(fn); }
  focus() { document.activeElement = this; }
  scrollIntoView(options) { this.scrollOptions = options; }
  get isConnected() { return this === document.body || !!this.parentElement?.isConnected; }
  matches(selector) { return selector === 'button' ? this.tagName === 'button' : selector[0] === '#' ? this.id === selector.slice(1) : selector[0] === '[' && (()=>{const match=selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);return !!match&&Object.hasOwn(this.attributes,match[1])&&(match[2]===undefined||this.attributes[match[1]]===match[2]);})(); }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector); }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(selector.split(',').some(item => child.matches(item)) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0]; }
  set innerHTML(html) {
    this.html = html; this.children = []; this.changed = false; const stack = [this];
    for (const [, close, tag, attrs] of html.matchAll(/<(\/?)([\w-]+)([^>]*)>/g)) {
      if (close) { if (stack.length > 1) stack.pop(); continue; }
      const node = new Element(tag);
      for (const [, name, value] of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) node.setAttribute(name, value || '');
      stack.at(-1).append(node); if (!['img', 'br', 'input'].includes(tag)) stack.push(node);
    }
  }
  get innerHTML() { return (this.html || '') + (this.changed ? '<!-- DOM changed -->' : ''); }
}
globalThis.HTMLElement = Element;
globalThis.document = { body: new Element('body'), createElement: tag => new Element(tag), activeElement: null };
const calls = [], sent = [], storage = new Map(); let currentPlayer = hero, account = buyer.address, chain = '0x1237', allowance = 0n, balance = parseEther('100'), approvedAmount = 0n, afterRead, afterApproval, holdMint, onSend, onSwitch, clock = now, near = false;
let selections = 0, holdChoice, accountRequestError, walletAuthorized = true, rpcOverride;
globalThis.chooseNftWallet = async () => { selections++; if (holdChoice) await holdChoice; return chosenProvider; };
globalThis.window = { localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }, ethereum: { async request({ method, params }) {
  calls.push({ method, params });
  if (rpcOverride) { const result = await rpcOverride(method, params); if (result !== undefined) return result; }
  if (method === 'eth_accounts') return walletAuthorized ? [account] : [];
  if (method === 'eth_requestAccounts') { if (accountRequestError) throw accountRequestError; walletAuthorized = true, rpcOverride; return [account]; }
  if (method === 'personal_sign') return buyer.signMessage('Link Mossvale wallet');
  if (method === 'eth_chainId') return chain;
  if (method === 'wallet_switchEthereumChain') { if (await onSwitch?.() !== false) chain = params[0].chainId; return null; }
  if (method === 'wallet_addEthereumChain') return null;
  if (method === 'eth_call') { const result = params[0].data.startsWith(tokenABI.getFunction('balanceOf').selector) ? tokenABI.encodeFunctionResult('balanceOf', [balance]) : tokenABI.encodeFunctionResult('allowance', [allowance]); afterRead?.(); afterRead = null; return result; }
  if (method === 'eth_sendTransaction') { if (params[0].to === MOSS_TOKEN.address) { approvedAmount = tokenABI.decodeFunctionData('approve', params[0].data)[1]; return id('approval'); } if (holdMint) await holdMint(); return id('mint'); }
  if (method === 'eth_getTransactionReceipt') { allowance = approvedAmount; afterApproval?.(); afterApproval = null; return { status: '0x1' }; }
  throw Error(`Unexpected RPC: ${method}`);
} } };
const chosenProvider = window.ethereum;
window.ethereum = { request() { assert.fail('Default injected wallet must never receive NFT requests'); } };
const ui = mountNftUI({ send: message => { sent.push(message); onSend?.(message); }, getPlayer: () => currentPlayer, allowed: () => true, trigger: new Element('button'), onOpen() {}, now: () => clock, auctionNearby: () => near });
const panel = document.body.querySelector('#nft-window'), query = selector => panel.querySelector(selector), click = selector => { const target = query(selector); assert(target, selector); if (!target.disabled) for (const fn of panel.events.click) fn({ target }); };
const state = (orders = [], extra = {}) => ({ configured: true, enabled: true, chainId: 4663, petsContract: contract, housesContract: contract, feeBps: 500, houses: NFT_HOUSES.map(house => ({ ...house, reserveWei: parseEther('10').toString(), highestBidWei: '0', startsAt: now - 1000, endsAt: now - 1000 + 4 * 60 * 60 * 1000, settled: false })), wallet: buyer.address, walletBalanceWei: parseEther('100').toString(), refundWei: '0', orders, ownedPets: ['moon-owl'], ownedHouses: [], ownershipVerified: true, ...extra });
async function until(test, label) { for (let i = 0; i < 200; i++) { if (test()) return; await delay(5); } throw Error(`Timed out: ${label} (${query('#nft-status').textContent})`); }
const sends = () => calls.filter(call => call.method === 'eth_sendTransaction');
ui.update(state()); assert(panel.hidden, 'unsolicited state never opens a wallet or the panel'); ui.open(); ui.update(state());
assert.equal(calls.length, 0, 'browsing collections cannot open a wallet');
click('[data-nft-tab="pets"]');assert.equal(query('[data-nft-panel="pets"]').hidden,false);assert.equal(query('[data-nft-panel="houses"]').hidden,true);assert.equal(query('[data-nft-count="pets"]').textContent,'1 owned');assert.equal(calls.length,0,'changing collection tabs cannot open a wallet or mint');click('[data-nft-tab="houses"]');
assert.deepEqual(panel.querySelectorAll('[data-nft-claim]').map(button => button.dataset.nftClaim), NFT_PETS.map(pet => pet.id), 'all eighteen published pet species expose NFT claims');
assert.equal(panel.querySelectorAll('[data-nft-house-art]').length, NFT_HOUSES.length, 'every deed listing shows its trading card');
for (const house of NFT_HOUSES) assert(panel.querySelectorAll('[data-nft-house-art]').some(image => image.attributes.src === `/nfts/houses/${house.assetId}.png`), 'house art follows the permanent asset number');
assert.equal(panel.querySelectorAll('[data-nft-bid]').filter(button => !button.disabled).length, 0, 'global NFT view cannot bid away from the auctioneer');
assert.match(query('[data-lot-reserve]').textContent, /100 at opening/); assert.match(query('[data-nft-auction-clock]').textContent, /3h 59m 59s/);
const passiveRequests = sent.length; clock += 5000; ui.refresh(); clock -= 5000;
assert.equal(sent.length, passiveRequests, 'passive UI refresh relies on realm ownership pushes instead of duplicating RPC polling');
// Every Link click chooses anew; a dismissed session cannot request accounts after selection.
let releaseChoice; holdChoice = new Promise(resolve => { releaseChoice = resolve; });
click('[data-nft-connect]'); assert.equal(selections, 1); assert.equal(calls.length, 0, 'no accounts before explicit selection');
ui.close(); releaseChoice(); await delay(10); holdChoice = null;
assert.equal(calls.length, 0, 'closed NFT session never opens the selected wallet');
ui.open(); ui.update(state());
for (const expected of [2, 3]) {
 click('[data-nft-connect]'); await until(() => sent.at(-1)?.type === 'storeWalletChallenge', 'wallet link challenge');
 assert.equal(selections, expected, 'Link wallet always opens a fresh picker');
 await ui.walletChallenge({type:'storeWalletChallenge', address:buyer.address, message:'Link Mossvale wallet', expiresAt:clock+60000});
 assert.equal(sent.at(-1).type, 'storeWalletBind'); assert.equal(selections, expected, 'challenge signing reuses the selected provider');
 ui.walletLinked(); ui.update(state());
}
const linkedCalls = calls.length;
click('[data-nft-claim]'); await until(() => query('[data-nft-review-heading]'), 'local pet review');
assert(!sent.some(message => message.type === 'nftClaimPet'), 'local review does not reserve a pet drop');
assert.equal(document.activeElement, query('[data-nft-review-heading]')); assert.deepEqual(query('[data-nft-review-heading]').scrollOptions, { block: 'start' }, 'explicit pet review brings its terms into view');
assert.equal(calls.length, linkedCalls, 'quote review requires another explicit click before minting');
const beforePermission = sends().length;
walletAuthorized = false; accountRequestError = Object.assign(Error('Account permission declined.'), { code: 4001 });
click('[data-nft-mint]'); await until(() => query('#nft-status').textContent?.includes('Account permission declined'), 'declined account permission');
assert.equal(sends().length, beforePermission, 'declining access to the chosen wallet never submits a mint');
accountRequestError = null; account = authority.address;
click('[data-nft-mint]'); await until(() => query('#nft-status').textContent?.includes('account changed'), 'wrong account after granting access');
assert.equal(sends().length, beforePermission, 'granting access to an account other than the linked wallet never submits a mint');
account = buyer.address; walletAuthorized = false; const permissionCalls = calls.length;
click('[data-nft-mint]'); await until(() => sent.at(-1)?.type === 'nftClaimPet', 'explicit mint requests a reservation');
assert.deepEqual(calls.slice(permissionCalls, permissionCalls + 2).map(call => call.method), ['eth_accounts', 'eth_requestAccounts'], 'a selected wallet without prior permission connects before checking the exact linked account and chain');
let finish; holdMint = () => new Promise(resolve => { finish = resolve; }); const heldQuote = ui.quote(pet); await until(() => !!finish, 'wallet opened');
assert.equal(selections, 3, 'the reservation and mint reuse the explicitly chosen provider');
const heldButton = query('[data-nft-mint]'); ui.update(state([pet])); assert.equal(query('[data-nft-mint]'), heldButton, 'wallet operation node survives passive state updates');
ui.close(); currentPlayer = { ...hero, id: '10000000-0000-4000-8000-000000000020' }; finish(); await heldQuote;
assert(storage.has(`mossvale-nft:${characterId}:${pet.id}`), 'submitted mint remains recorded for its original character'); assert.notEqual(sent.at(-1)?.type, 'nftPaymentCheck', 'another character never receives the first character payment check');
holdMint = null; currentPlayer = hero; ui.open(); ui.update(state([pet])); assert(query('[data-nft-check]')); assert(!query('[data-nft-resume]'), 'uncertain or submitted mint cannot be sent twice');
const before = sends().length; click('[data-nft-check]'); assert.equal(sends().length, before, 'checking delivery never spends tokens'); ui.update(state([pet]));

near = true; ui.openAuction(false); ui.update(state());
const input = query('[data-nft-bid-input]'); input.value = '12.123456789012345678';
const competing = state(); competing.houses[0].highestBidWei = parseEther('11').toString(); competing.houses[0].highestBidder = authority.address;
input.value = 'invalid'; click('[data-nft-bid]'); assert.equal(document.activeElement, query('#nft-status')); assert.deepEqual(query('#nft-status').scrollOptions, { block: 'start' }, 'invalid bids reveal the error above the cards');
input.value = '12.123456789012345678'; ui.update({ ...competing, walletBalanceWei: '0' }); click('[data-nft-bid]'); assert.match(query('#nft-status').textContent, /enough MOSS/); assert.equal(document.activeElement, query('#nft-status'));
const fundsError = query('#nft-status').textContent; ui.update(competing); clock += 5000; ui.refresh(); ui.update(competing);
assert.equal(query('#nft-status').textContent, fundsError, 'explicit insufficient-funds feedback survives immediate and five-second passive refreshes');
click('[data-nft-refresh]'); ui.update(competing); assert.match(query('#nft-status').textContent, /NFT access follows/, 'a deliberate refresh resets the explicit status');
input.focus(); ui.update(competing); assert.equal(query('[data-nft-bid-input]'), input, 'live auction state preserves the input node'); assert.equal(document.activeElement, input, 'passive auction updates never reveal status or steal focus'); assert.equal(input.value, '12.123456789012345678', 'live bids do not overwrite a typed amount');
click('[data-nft-bid]'); assert.equal(sent.at(-1).type, 'nftBidHouse'); assert.equal(sent.at(-1).amountWei, bidAmount); ui.auctionTransaction(bid);
assert.equal(document.activeElement, query('[data-nft-auction-review-heading]')); assert.deepEqual(query('[data-nft-auction-review-heading]').scrollOptions, { block: 'start' }, 'explicit bid review brings its terms above the cards into view');
assert.match(query('[data-nft-auction-review]').innerHTML, /12\.123456789012345678 MOSS/, 'review uses exact total and deposit amounts');
const reviewButton = query('[data-nft-auction-confirm]'); reviewButton.focus(); ui.update(competing); ui.update(competing);
assert.equal(query('[data-nft-auction-confirm]'), reviewButton, 'passive updates preserve the focused review confirmation');
assert.equal(document.activeElement, reviewButton);
assert.equal(sends().length, before, 'review never opens the wallet');
afterApproval = () => { account = authority.address; }; click('[data-nft-auction-confirm]'); await until(() => query('#nft-status').textContent?.includes('account changed'), 'account change after approval');
assert.equal(sends().length, before + 1, 'account change after approval prevents the auction bid');
account = buyer.address; ui.update(competing); afterRead = () => { currentPlayer = { ...hero, id: 'other-character' }; }; click('[data-nft-auction-confirm]'); await until(() => currentPlayer.id === 'other-character', 'character switch during balance read'); await delay(10); assert.equal(sends().length, before + 1);
ui.reset(); currentPlayer = hero; ui.openAuction(false); ui.update(competing); input.value = 'unused old node'; query('[data-nft-bid-input]').value = '12.123456789012345678'; click('[data-nft-bid]'); ui.auctionTransaction(bid);
allowance = 0n; afterApproval = () => { balance = 0n; }; click('[data-nft-auction-confirm]'); await until(() => query('#nft-status').textContent?.includes('balance or allowance changed'), 'balance recheck after approval'); assert.equal(sends().length, before + 2, 'approval does not bypass a depleted balance');
balance = parseEther('100'); ui.update(competing); near = false; ui.refresh(); click('[data-nft-auction-confirm]'); await delay(10); assert.equal(sends().length, before + 2, 'walking away prevents a reviewed bid');
near = true; ui.update(competing); click('[data-nft-bid]'); ui.auctionTransaction(bid);
let releaseBid; holdMint = () => new Promise(resolve => { releaseBid = resolve; }); click('[data-nft-auction-confirm]'); await until(() => !!releaseBid, 'auction wallet opened');
const heldAuctionButton = query('[data-nft-auction-confirm]'); ui.update(competing); assert.equal(query('[data-nft-auction-confirm]'), heldAuctionButton, 'wallet confirmation node survives passive auction refresh');
ui.close(); currentPlayer = { ...hero, id: 'another-character' }; releaseBid(); await delay(10); assert([...storage.keys()].some(key => key.startsWith('mossvale-house-auction:')), 'auction attempt survives close and character switching');
holdMint = null; currentPlayer = hero; ui.openAuction(false); ui.update(competing); const spent = sends().length; click('[data-nft-auction-check]'); assert.equal(sent.at(-1).type, 'nftAuctionCheck'); assert.equal(sends().length, spent, 'transaction recovery does not repeat a deposit');
ui.auctionChecked({ transactionHash: id('mint'), state: 'pending' }); assert(query('[data-nft-bid]').disabled);
const pendingEntry = [...storage.entries()].find(([key]) => key.startsWith('mossvale-house-auction:'));
click('[data-nft-auction-recover]'); assert(!query('[data-nft-auction-recovery]').hidden); assert.match(panel.innerHTML, /Clearing does not cancel the transaction/);
click('[data-nft-auction-clear]'); assert(!query('[data-nft-bid]').disabled, 'a canceled or replaced hash cannot permanently lock auction actions'); assert.equal(sends().length, spent, 'explicit pending recovery never submits another transaction');
ui.auctionChecked({ transactionHash: id('mint'), state: 'confirmed' });
storage.set(pendingEntry[0], JSON.stringify({ ...JSON.parse(pendingEntry[1]), hash: 'wallet-pending' })); ui.close(); ui.openAuction(false); ui.update(competing);
assert(query('[data-nft-bid]').disabled, 'a missing wallet receipt stays blocked after reopening until explicit recovery');
click('[data-nft-auction-check]'); assert.equal(sent.at(-1).type, 'nftOpen', 'missing-receipt refresh does not reopen or scroll the NPC panel'); ui.update(competing);
click('[data-nft-auction-recover]'); click('[data-nft-auction-clear]'); assert(!query('[data-nft-bid]').disabled); assert.equal(sends().length, spent);
const leading = state(); leading.houses[0].highestBidWei = parseEther('10').toString(); leading.houses[0].highestBidder = buyer.address;
ui.update(leading); assert.match(query('[data-lot-status]').textContent, /leading/); assert.match(query('[data-lot-locked]').textContent, /10\.0 MOSS/);
query('[data-nft-bid-input]').value = '12.123456789012345678'; click('[data-nft-bid]'); ui.auctionTransaction(topup); assert.match(query('[data-nft-auction-review]').innerHTML, /Deposit now: <strong>2\.123456789012345678 MOSS/);
const displaced = state(); displaced.houses[0].highestBidWei = parseEther('11').toString(); displaced.houses[0].highestBidder = authority.address; ui.update(displaced); assert(!query('[data-nft-auction-confirm]'), 'being outbid invalidates a reviewed delta deposit'); assert.match(query('[data-lot-status]').textContent, /You have been outbid/);
const refunded = state([], { refundWei: parseEther('10').toString() }); ui.update(refunded); click('[data-nft-withdraw]'); assert.equal(sent.at(-1).type, 'nftWithdrawBid'); ui.auctionTransaction(auctionResponse('withdraw')); click('[data-nft-auction-confirm]'); await until(() => sent.at(-1)?.type === 'nftAuctionCheck', 'withdrawal receipt');
assert.equal(new Interface(NFT_AUCTION_ABI).parseTransaction(sends().at(-1).params[0]).name, 'withdrawRefund'); ui.auctionChecked({ transactionHash: id('mint'), state: 'confirmed' });
clock = leading.houses[0].endsAt; ui.update(leading); assert(query('[data-nft-bid]').disabled, 'bids close at the exact four-hour boundary'); assert.match(query('[data-nft-auction-clock]').textContent, /closed/); click('[data-nft-settle]'); assert.equal(sent.at(-1).type, 'nftSettleHouse'); ui.auctionTransaction(auctionResponse('settle')); click('[data-nft-auction-confirm]'); await until(() => sent.at(-1)?.type === 'nftAuctionCheck', 'settlement receipt');
assert.equal(new Interface(NFT_AUCTION_ABI).parseTransaction(sends().at(-1).params[0]).name, 'settleHouse'); ui.auctionChecked({ transactionHash: id('mint'), state: 'confirmed' });
const settled = state(); settled.houses[0].settled = true; settled.houses[0].owner = buyer.address; ui.update(settled); assert.match(query('[data-lot-status]').textContent, /Deed owner/); assert(query('[data-nft-settle]').disabled);
ui.reset(); ui.open(); ui.update(state([], { enabled: false, reason: 'NFT minting is not enabled on this realm.' }));
assert.equal(panel.querySelectorAll('[data-nft-claim]').filter(button => !button.disabled).length, 0); assert.equal(panel.querySelectorAll('[data-nft-bid]').filter(button => !button.disabled).length, 0);
ui.open(); ui.open(); clock += 21_000; ui.refresh(); assert.match(query('#nft-status').textContent, /did not respond/, 'timed out server request can recover');
assert.equal(selections, 3, 'mint, approvals, bids, refunds and settlement reuse the explicitly selected wallet');

clock = now; currentPlayer = hero; ui.reset(); ui.open(); ui.update(state());
const claims = () => sent.filter(message => message.type === 'nftClaimPet').length;
const claimsBeforeReview = claims(), callsBeforeReview = calls.length;
click('[data-nft-claim]'); await until(() => query('[data-nft-review-heading]'), 'cancelable local review'); ui.update(state()); ui.refresh(); ui.close();
assert.equal(claims(), claimsBeforeReview, 'closing the initial review leaves the pet unreserved');
assert.equal(calls.length, callsBeforeReview, 'closing the initial review makes no wallet calls');
ui.open(); ui.update(state()); click('[data-nft-claim]'); await until(() => query('[data-nft-mint]'), 'review with a changed wallet account');
account = authority.address; click('[data-nft-mint]'); await until(() => query('#nft-status').textContent.includes('account changed'), 'wallet preflight failure');
assert.equal(claims(), claimsBeforeReview, 'a mismatched wallet account is rejected before reserving a drop'); account = buyer.address; ui.close();

const late = await mintOrder(); ui.open(); ui.update(state()); click('[data-nft-claim]'); await until(() => query('[data-nft-mint]'), 'review before delayed reservation');
click('[data-nft-mint]'); await until(() => claims() === claimsBeforeReview + 1, 'reservation request in flight');
const beforeLateQuote = calls.length; const delayedQuote = ui.quote(late); ui.close(); await delayedQuote;
assert.equal(calls.length, beforeLateQuote, 'closing while the reservation is being validated prevents wallet activation');
currentPlayer = { ...hero, carriedItems: {} }; ui.open(); ui.update(state([late]));
assert.match(query('[data-nft-pets]').innerHTML, /0 unlearned drops · 1 reserved for NFT minting/, 'reopening exposes the reserved pet even with an empty bag');
assert.match(query('[data-nft-orders]').innerHTML, /full bag can delay the return/);
const beforeResume = calls.length; click('[data-nft-resume]'); await until(() => query('[data-nft-mint]'), 'explicit reservation review');
assert.equal(calls.length, beforeResume, 'resuming a reservation still requires an explicit Mint click');
ui.reset();

// A raw injected-provider rejection proves no mint was submitted, but the signed
// permission remains valid. Only server-confirmed expiry may return the drop.
const canceled = await mintOrder(); currentPlayer = hero; ui.open(); ui.update(state());
click('[data-nft-claim]'); await until(() => query('[data-nft-mint]'), 'review before wallet cancellation');
const claimsBeforeCancel = claims(); click('[data-nft-mint]'); await until(() => claims() === claimsBeforeCancel + 1, 'claim before wallet cancellation');
holdMint = () => { throw Object.assign(Error('User rejected the request.'), { code: 4001 }); };
currentPlayer = { ...hero, carriedItems: {} };
onSend = message => { if (message.type === 'nftPaymentCheck') ui.update(state([canceled]), 'This mint is still pending on-chain.'); };
await ui.quote(canceled); holdMint = null; onSend = null;
const cancellation = query('#nft-status').textContent;
assert.match(cancellation, /Mint canceled in your wallet/); assert.match(cancellation, /network confirms it was not minted/); assert.match(cancellation, /free bag slot/);
assert.equal(sent.at(-1).type, 'nftPaymentCheck'); assert.equal(sent.at(-1).orderId, canceled.id, 'wallet rejection immediately requests authoritative recovery status');
assert(!storage.has(`mossvale-nft:${characterId}:${canceled.id}`), 'explicit rejection clears only the local wallet-attempt marker');
assert.match(query('[data-nft-pets]').innerHTML, /0 unlearned drops · 1 reserved for NFT minting/);
ui.update(state([canceled]), 'This mint is still pending on-chain.'); assert.equal(query('#nft-status').textContent, cancellation, 'the immediate server response cannot obscure cancellation and return guidance');
const canceledSends = sends().length; ui.close(); ui.open(); ui.update(state([canceled]));
assert.equal(query('#nft-status').textContent, cancellation, 'reopening retains cancellation guidance for the same pending reservation');
near = true; query('[data-nft-bid-input]').value = '12.123456789012345678'; click('[data-nft-bid]'); ui.auctionTransaction(bid);
const auctionReviewStatus = query('#nft-status').textContent; ui.update(state([canceled]));
assert.equal(query('#nft-status').textContent, auctionReviewStatus, 'starting an unrelated auction review replaces the old cancellation status');
clock = canceled.expiresAt + 5000; ui.update(state([canceled])); ui.refresh();
assert.match(query('[data-nft-orders]').innerHTML, /Mint permission expired · waiting for network confirmation or bag space/);
assert.match(query('[data-nft-pets]').innerHTML, /0 unlearned drops · 1 reserved for NFT minting/, 'local expiry alone must not pretend the drop has returned');
assert(!query('[data-nft-resume]'), 'an expired mint permission cannot open another wallet action');
currentPlayer = hero; ui.update(state([{ ...canceled, status: 'expired' }]), 'The unused pet drop was returned.');
assert.match(query('[data-nft-pets]').innerHTML, /1 unlearned drop/); assert(!query('[data-nft-pets]').innerHTML.includes('reserved for NFT minting'));
assert.equal(query('#nft-status').textContent, 'The unused pet drop was returned.', 'confirmed return replaces the old cancellation message');
assert.equal(sends().length, canceledSends, 'updates, expiry and reopening never resubmit a mint');

clock = now; const retry = await mintOrder(); ui.reset(); ui.open(); ui.update(state());
click('[data-nft-claim]'); await until(() => query('[data-nft-mint]'), 'review before canceled mint retry'); const claimsBeforeRetry = claims();
click('[data-nft-mint]'); await until(() => claims() === claimsBeforeRetry + 1, 'claim before retry');
holdMint = () => { throw Object.assign(Error('User rejected the request.'), { code: 4001 }); }; await ui.quote(retry);
let finishRetry; holdMint = () => new Promise(resolve => { finishRetry = resolve; }); click('[data-nft-mint]'); await until(() => finishRetry, 'explicit retry opens wallet');
ui.update(state([retry])); assert(!query('#nft-status').textContent.includes('Mint canceled'), 'the earlier cancellation cannot overwrite a new explicit wallet attempt');
finishRetry(); await until(() => query('#nft-status').textContent.startsWith('Mint submitted'), 'retry submitted'); holdMint = null;
ui.update(state([retry])); assert.match(query('#nft-status').textContent, /^Mint submitted/, 'successful retry keeps its submission status across passive updates');
assert.equal(claims(), claimsBeforeRetry + 1, 'explicit retry reuses its permission instead of reserving another drop');

clock = now; const submitted = await mintOrder(); ui.reset(); ui.open(); ui.update(state());
click('[data-nft-claim]'); await until(() => query('[data-nft-mint]'), 'review before submitted mint'); const claimsBeforeSubmit = claims();
click('[data-nft-mint]'); await until(() => claims() === claimsBeforeSubmit + 1, 'claim before submitted mint');
onSend = message => { if (message.type === 'nftPaymentCheck') throw Object.assign(Error('Status request failed.'), { code: 4001 }); };
await ui.quote(submitted); onSend = null;
assert.equal(storage.get(`mossvale-nft:${characterId}:${submitted.id}`), id('mint'), 'a post-submission error never clears a known transaction hash');
assert(!query('#nft-status').textContent.includes('Mint canceled in your wallet'));
ui.update(state([submitted])); assert(!query('[data-nft-resume]'), 'a submitted mint remains protected from duplicate transactions');
ui.reset(); currentPlayer = hero; clock = now;
const externalClaims = claims(), externalCalls = calls.length;
ui.open('moss-fox'); assert.equal(sent.at(-1).type, 'nftOpen'); ui.update(state());
await until(() => query('[data-nft-review-heading]'), 'pet menu opens the selected pet review');
assert.match(query('[data-nft-review]').innerHTML, /Moss Fox/);
assert.equal(document.activeElement, query('[data-nft-review-heading]'));
assert.equal(claims(), externalClaims); assert.equal(calls.length, externalCalls, 'external Claim opens a review, never a wallet or reservation');
ui.close(); ui.open('moss-fox'); ui.close(); ui.update(state()); await delay(10);
assert(panel.hidden); assert.equal(calls.length, externalCalls, 'closing before the collection state arrives cancels the selected-pet intent');
ui.open(); ui.update(state()); assert(!query('[data-nft-mint]'), 'the canceled external intent cannot revive on a later open'); ui.close();
ui.open('moss-fox'); ui.update(state([], { wallet: null })); assert.match(query('#nft-status').textContent, /Link your wallet/); ui.close();
ui.open('moss-fox'); currentPlayer = { ...hero, carriedItems: {} }; ui.update(state([late]));
await until(() => query('[data-nft-mint]'), 'external entry resumes an existing reservation without needing a second drop');
assert.equal(calls.length, externalCalls); assert.equal(claims(), externalClaims); ui.close();

currentPlayer = hero; ui.open('moss-fox'); ui.update(state()); await until(() => query('[data-nft-mint]'), 'review before network setup');
chain = '0x1'; let releaseSwitch; onSwitch = () => new Promise(resolve => { releaseSwitch = resolve; });
click('[data-nft-mint]'); await until(() => releaseSwitch, 'request Robinhood Chain before reserving');
assert.equal(claims(), externalClaims, 'waiting for network approval leaves the drop untouched');
ui.close(); releaseSwitch(); onSwitch = null; await delay(20);
assert.equal(claims(), externalClaims, 'closing during network setup cannot reserve a pet later');

ui.open('moss-fox'); ui.update(state()); await until(() => query('[data-nft-mint]'), 'review before declined network change');
chain = '0x1'; onSwitch = () => { throw Object.assign(Error('Network change declined.'), { code: 4001 }); };
click('[data-nft-mint]'); await until(() => query('#nft-status').textContent.includes('declined'), 'network change rejection');
assert.equal(claims(), externalClaims, 'declining the network switch cannot reserve a pet');
onSwitch = () => false; click('[data-nft-mint]'); await until(() => query('#nft-status').textContent.includes('Select Robinhood'), 'wallet that stays on a different chain');
assert.equal(claims(), externalClaims, 'a successful RPC without an actual network change cannot authorize a mint');
let switches = 0; onSwitch = () => { if (++switches === 1) throw Object.assign(Error('Unknown chain.'), { code: 4902 }); };
const networkCalls = calls.length; click('[data-nft-mint]'); await until(() => claims() === externalClaims + 1, 'new Robinhood Chain added and selected');
assert.equal(chain, '0x1237'); assert.equal(switches, 2);
const addition = calls.slice(networkCalls).find(call => call.method === 'wallet_addEthereumChain');
assert.equal(addition.params[0].chainId, '0x1237'); assert.deepEqual(addition.params[0].rpcUrls, ['https://rpc.mainnet.chain.robinhood.com']);
onSwitch = null; ui.close();

const expandedState = orders => state(orders, { newPetsContract: newContract, newPetsEnabled: true });
for (const expandedPet of NFT_PETS.filter(pet => pet.assetId > 8 && pet.assetId <= 16)) {
  clock = now; currentPlayer = { ...hero, ownedPets: [expandedPet.id], carriedItems: {} }; ui.reset();
  const claimsBefore = claims(), sendsBefore = sends().length;
  ui.open(expandedPet.id); ui.update(expandedState([]));
  await until(() => query('[data-nft-mint]'), `${expandedPet.id} learned conversion review`);
  assert.match(query('[data-nft-review]').innerHTML, /removes its character unlock/);
  assert(query('[data-nft-review]').innerHTML.includes(newContract));
  assert.equal(claims(), claimsBefore, 'review leaves the learned unlock untouched');
  const order = await mintOrder('pet', expandedPet.id, 'learned');
  await assert.rejects(validateNftPayment(order, { ...terms(order), claimSource: undefined }, now), /quote changed/, 'the quote cannot silently exchange a learned pet instead of a bag item');
  await assert.rejects(validateNftPayment({ ...order, claimSource: undefined }, terms(order), now), /quote changed/);
  click('[data-nft-mint]'); await until(() => claims() === claimsBefore + 1, 'explicit conversion reservation');
  assert.deepEqual(sent.at(-1), { type: 'nftClaimPet', pet: expandedPet.id, source: 'learned' });
  currentPlayer = { ...hero, ownedPets: [], carriedItems: {} };
  await ui.quote(order);
  assert.equal(sends().length, sendsBefore + 1, 'each new pet opens exactly one standard wallet transaction');
  const transaction = sends().at(-1).params[0];
  assert.equal(transaction.to, newContract);
  assert.equal(new Interface(NFT_ABI).decodeFunctionData('mint', transaction.data)[0].assetId, BigInt(expandedPet.assetId));
  assert.equal(sent.at(-1).type, 'nftPaymentCheck');
  ui.update(expandedState([order])); ui.close(); ui.open(expandedPet.id); ui.update(expandedState([order]));
  assert(!query('[data-nft-resume]'), 'submitted learned conversion cannot open a second wallet action');
  assert.equal(sends().length, sendsBefore + 1); ui.close();
}
currentPlayer = { ...hero, ownedPets: ['fern-lynx'], carriedItems: {} }; ui.reset(); ui.open('fern-lynx');
ui.update(state([], { newPetsContract: newContract, newPetsEnabled: false, mintablePetIds: NFT_PETS.filter(pet => pet.assetId <= 16).map(pet => pet.id), newPetsReason: 'New pet collection awaits deployment.' }));
await until(() => query('#nft-status').textContent.includes('awaits deployment'), 'specific new collection setup status');
assert(!query('[data-nft-mint]')); ui.close();

const conversion = await mintOrder('pet', 'fern-lynx', 'learned'); ui.reset(); ui.open('fern-lynx'); ui.update(expandedState([]));
await until(() => query('[data-nft-mint]'), 'cancelable learned conversion');
click('[data-nft-mint]'); await until(() => sent.at(-1)?.source === 'learned', 'learned conversion reserved');
currentPlayer = { ...hero, ownedPets: [], carriedItems: {} };
holdMint = () => { throw Object.assign(Error('User rejected the request.'), { code: 4001 }); };
await ui.quote(conversion); holdMint = null;
assert.match(query('#nft-status').textContent, /returns automatically to your collection/);
assert.doesNotMatch(query('#nft-status').textContent, /bag slot/);
ui.close(); ui.open('fern-lynx'); ui.update(expandedState([conversion]));
await until(() => query('[data-nft-mint]'), 'resume uses persisted learned source after entitlement was removed');
assert.match(query('[data-nft-review]').innerHTML, /learned pet is reserved/);
ui.close();
clock = now; currentPlayer = { ...hero, carriedItems: { 'fern-lynx': 1, 'suncrest-peacock': 1 }, ownedPets: ['store-ashwing'] };
ui.reset(); ui.open(); ui.update(state());
const claimFor = pet => panel.querySelectorAll('[data-nft-claim]').find(button => button.dataset.nftClaim === pet);
assert(claimFor('suncrest-peacock').disabled); assert(claimFor('fern-lynx').disabled, 'legacy status never enables unsupported species'); assert(claimFor('store-ashwing').disabled);
const expanded = () => state([], { legacyPetsContract: legacyContract, mintablePetIds: NFT_PETS.map(pet => pet.id) });
ui.update(expanded()); assert(!claimFor('suncrest-peacock').disabled); assert(!claimFor('fern-lynx').disabled); assert(!claimFor('store-ashwing').disabled);
ui.open('store-ashwing'); ui.update(expanded()); await until(() => query('[data-nft-mint]'), 'store unlock review');
assert.match(query('[data-nft-review]').innerHTML, /removes its character unlock/); assert.match(query('[data-nft-review]').innerHTML, /unused mint permission expires/);
click('[data-nft-mint]'); await until(() => sent.at(-1)?.type === 'nftClaimPet', 'learned conversion request');
assert.deepEqual(sent.at(-1), { type: 'nftClaimPet', pet: 'store-ashwing', source: 'learned' }, 'reserve exactly the reviewed character-unlock source');
ui.close(); ui.open(); ui.update(expanded());
query('[data-nft-legacy-token]').value = '-1'; const requestsBeforeInvalid = sent.length; click('[data-nft-migration-request]');
assert.equal(sent.length, requestsBeforeInvalid, 'invalid IDs cannot reach the server');
query('[data-nft-legacy-token]').value = '123'; const walletBeforeMigrationReview = calls.length;
click('[data-nft-migration-request]'); assert.deepEqual(sent.at(-1), { type: 'nftMigrationReview', tokenId: '123' });
ui.migrationQuote(migration); assert.equal(calls.length, walletBeforeMigrationReview, 'migration review never opens a wallet');
assert.match(query('[data-nft-migration-review]').innerHTML, /locked forever/);
let legacyApproved = false, migrationMode = '', migrationSends = 0, approvalSends = 0, migrationOwner = buyer.address, badMigrationReceipt = false;
rpcOverride = async (method, params) => {
  if (method === 'eth_getTransactionReceipt' && params[0] === id('migration')) return { status: '0x1', transactionHash: id('migration'), to: badMigrationReceipt ? authority.address : contract, from: buyer.address };
  if (method === 'eth_call' && params[0].to === legacyContract) {
    const call = legacyABI.parseTransaction(params[0]);
    if (call.name === 'ownerOf') return legacyABI.encodeFunctionResult('ownerOf', [migrationOwner]);
    if (call.name === 'assets') return legacyABI.encodeFunctionResult('assets', [1]);
    if (call.name === 'getApproved') return legacyABI.encodeFunctionResult('getApproved', [legacyApproved ? contract : authority.address]);
    return '0x';
  }
  if (method === 'eth_call' && params[0].to === contract) return params[0].data === destinationABI.encodeFunctionData('legacyCollection') ? destinationABI.encodeFunctionResult('legacyCollection', [legacyContract]) : '0x';
  if (method === 'eth_sendTransaction' && params[0].to === legacyContract) {
    approvalSends++; assert.equal(legacyABI.decodeFunctionData('approve', params[0].data)[1], 123n);
    if (migrationMode === 'cancel-approval') throw Object.assign(Error('Approval canceled.'), { code: 4001 });
    legacyApproved = true; return id('legacy approval');
  }
  if (method === 'eth_sendTransaction' && params[0].to === contract) {
    migrationSends++; assert.equal(migrationABI.decodeFunctionData('migrate', params[0].data)[0], 123n);
    if (migrationMode === 'cancel-migration') throw Object.assign(Error('Migration canceled.'), { code: 4001 });
    return migrationMode === 'missing-hash' ? null : id('migration');
  }
};
account = authority.address; click('[data-nft-migration-confirm]'); await until(() => query('#nft-status').textContent.includes('account changed'), 'migration account guard');
assert.equal(approvalSends, 0); account = buyer.address;
migrationOwner = authority.address; click('[data-nft-migration-confirm]'); await until(() => query('#nft-status').textContent.includes('owner or species changed'), 'live legacy ownership guard');
assert.equal(approvalSends, 0); migrationOwner = buyer.address;
migrationMode = 'cancel-approval'; click('[data-nft-migration-confirm]'); await until(() => query('#nft-status').textContent.includes('Approval canceled'), 'token approval cancellation');
assert.equal(migrationSends, 0, 'canceling token approval never migrates the token');
migrationMode = 'cancel-migration'; click('[data-nft-migration-confirm]'); await until(() => query('#nft-status').textContent.includes('Migration canceled'), 'migration cancellation');
assert.equal(migrationSends, 1); assert(!query('[data-nft-migration-check]'), 'explicit rejection clears only the local attempt');
migrationMode = ''; const approvalBeforeRetry = approvalSends;
click('[data-nft-migration-confirm]'); await until(() => query('[data-nft-migration-check]'), 'migration submission');
assert.equal(approvalSends, approvalBeforeRetry, 'retry reuses an existing token approval');
assert.equal(migrationSends, 2);
const migrationRequest = calls.findLastIndex(call => call.method === 'eth_sendTransaction' && call.params[0].data === migration.transaction.data);
assert(calls.slice(0, migrationRequest).some(call => call.method === 'eth_call' && call.params[0].data === migration.transaction.data && call.params[0].from === buyer.address), 'the exact migration is simulated before wallet submission');
badMigrationReceipt = true; click('[data-nft-migration-check]'); await until(() => query('#nft-status').textContent.includes('receipt could not be verified'), 'receipt contract guard');
assert(query('[data-nft-migration-check]'), 'a malformed receipt must keep the pending transaction'); badMigrationReceipt = false;
click('[data-nft-migration-check]'); await until(() => query('#nft-status').textContent.includes('Migration transaction confirmed'), 'migration receipt');
assert.equal(sent.at(-1).type, 'nftOpen'); assert(!query('[data-nft-migration-confirm]'));
ui.update(expanded()); click('[data-nft-migration-request]'); ui.migrationQuote(migration);
migrationMode = 'missing-hash'; click('[data-nft-migration-confirm]'); await until(() => query('[data-nft-migration-check]'), 'unknown wallet result');
ui.close(); ui.open(); ui.update(expanded()); query('[data-nft-legacy-token]').value = '123'; click('[data-nft-migration-request]'); ui.migrationQuote(migration);
assert(!query('[data-nft-migration-confirm]'), 'reopening cannot silently resubmit an unknown migration');
click('[data-nft-migration-recover]'); assert.match(query('[data-nft-migration-review]').innerHTML, /does not cancel/);
click('[data-nft-migration-clear]'); assert(!query('[data-nft-migration-confirm]'), 'recovery requires a fresh server review');
const migrationAfterRecovery = migrationSends;
ui.update(expanded()); click('[data-nft-migration-request]'); ui.close(); ui.migrationQuote(migration);
assert.equal(migrationSends, migrationAfterRecovery, 'a quote arriving after close never activates a wallet');
rpcOverride = null;
// Existing quotes keep their original collection and persisted source after V2 is enabled.
clock = now; currentPlayer = hero; ui.reset();
const v2State = orders => state(orders, { petsContract: authority.address, legacyPetsContract: contract, newPetsContract: newContract, newPetsEnabled: true, mintablePetIds: NFT_PETS.map(pet => pet.id) });
for (const oldOrder of [await mintOrder(), await mintOrder('pet', 'fern-lynx', 'learned')]) {
  ui.open(oldOrder.assetId); ui.update(v2State([oldOrder]));
  await until(() => query('[data-nft-mint]'), 'old collection permission remains reviewable after V2');
  assert(query('[data-nft-review]').innerHTML.includes(oldOrder.contract));
  const sendsBefore = sends().length;
  click('[data-nft-mint]'); await until(() => sends().length > sendsBefore, 'resume exact original collection');
  assert.equal(sends().at(-1).params[0].to, oldOrder.contract);
  await until(() => query('#nft-status').textContent.startsWith('Mint submitted'), 'old permission submitted');
  ui.close();
}
console.log('PASS: 26 stable pet IDs, collection capability gates, learned conversion review, guarded token-only migration and recovery, wallet selection, canceled mint return, guarded MOSS bids, refunds and settlement.');

// Mount claims use their own collection and keep the same wallet and reservation guarantees.
const mountState = (orders=[], extra={}) => state(orders,{mountsContract:mountContract,mountsEnabled:true,mintableMountIds:NFT_MOUNTS.map(m=>m.id),ownedMounts:['verdant-revenant'],...extra});
clock=now; account=buyer.address; chain='0x1237'; ui.reset();
currentPlayer={...hero,ownedMounts:[],carriedItems:{'verdant-revenant':2}};
ui.openMount('verdant-revenant'); const mountCalls=calls.length; ui.update(mountState());
await until(()=>query('[data-nft-mint]'),'mount review');
assert.equal(calls.length,mountCalls,'mount review never opens a wallet');
assert.match(query('[data-nft-review]').innerHTML,/Mossvale Mounts/);
assert(query('[data-nft-review]').innerHTML.includes(mountContract));
assert.match(query('[data-nft-review]').innerHTML,/mount drop stays in your bag/);
assert.deepEqual(panel.querySelectorAll('[data-nft-claim-mount]').map(b=>b.dataset.nftClaimMount),NFT_MOUNTS.map(m=>m.id));
assert(!panel.querySelectorAll('[data-nft-claim-mount]').some(b=>['horse','wolf'].includes(b.dataset.nftClaimMount)));
const mountOrder=await mintOrder('mount','verdant-revenant');
assert.equal((await validateNftPayment(mountOrder,terms(mountOrder),now)).approval,undefined);
for(const change of [{kind:'pet'},{contract},{claimSource:'learned'},{amountWei:'1'},{approval:{to:MOSS_TOKEN.address,data:'0x',value:'0x0',chainId:'0x1237'}}])await assert.rejects(validateNftPayment({...mountOrder,...change},terms(mountOrder),now));
click('[data-nft-mint]');await until(()=>sent.at(-1)?.type==='nftClaimMount','mount reservation request');
assert.deepEqual(sent.at(-1),{type:'nftClaimMount',mount:'verdant-revenant'});
const beforeMountSend=sends().length; await ui.quote(mountOrder);
assert.equal(sends().length,beforeMountSend+1);assert.equal(sends().at(-1).params[0].to,mountContract);
assert.equal(new Interface(NFT_ABI).decodeFunctionData('mint',sends().at(-1).params[0].data)[0].assetId,1n);
ui.close();ui.openMount('verdant-revenant');ui.update(mountState([mountOrder]));
assert(!query('[data-nft-resume]'),'a submitted mount mint cannot be repeated');ui.close();
for(const id of ['verdant-revenant','store-embermane','store-cinderfang']){
 currentPlayer={...hero,ownedMounts:[id],carriedItems:{}};ui.reset();ui.openMount(id);ui.update(mountState());
 await until(()=>query('[data-nft-mint]'),`${id} learned conversion`);
 assert.match(query('[data-nft-review]').innerHTML,/learned mount and removes its character unlock/);
 click('[data-nft-mint]');await until(()=>sent.at(-1)?.type==='nftClaimMount'&&sent.at(-1)?.mount===id,'mount unlock reservation');
 assert.deepEqual(sent.at(-1),{type:'nftClaimMount',mount:id,source:'learned'});
 const order=await mintOrder('mount',id,'learned');currentPlayer={...hero,ownedMounts:[],carriedItems:{}};
 holdMint=()=>{throw Object.assign(Error('Canceled'),{code:4001});};await ui.quote(order);holdMint=null;
 assert.match(query('#nft-status').textContent,/learned mount remains reserved.*returns automatically to your collection/);
 assert.doesNotMatch(query('#nft-status').textContent,/bag slot|learned pet/);
 ui.close();ui.openMount(id);ui.update(mountState([order]));await until(()=>query('[data-nft-mint]'),'reserved learned mount review');
 assert.match(query('[data-nft-review]').innerHTML,/learned mount is reserved/);ui.close();
}
currentPlayer={...hero,ownedMounts:[],carriedItems:{'verdant-revenant':1}};ui.reset();ui.openMount('verdant-revenant');ui.update(mountState([],{mountsEnabled:false,mountsReason:'Mount collection awaits activation.'}));
await until(()=>query('#nft-status').textContent.includes('awaits activation'),'mount capability failure');assert(!query('[data-nft-mint]'));ui.close();
ui.openMount('verdant-revenant');ui.update(mountState());await until(()=>query('[data-nft-mint]'),'mount contract change review');
const beforeChangedContract=sends().length;ui.update(mountState([],{mountsContract:contract}));assert(!query('[data-nft-mint]'));assert.equal(sends().length,beforeChangedContract);ui.close();
console.log('PASS mount NFT UI: separate collection, source-bound free claims, wallet rights, store conversion, vendor exclusion, cancellation recovery and contract/capability changes.');

currentPlayer={...hero,ownedMounts:[],carriedItems:{'store-embermane':1}};ui.reset();ui.openMount('store-embermane');const storeItemCalls=calls.length;ui.update(mountState());
await until(()=>query('#nft-status').textContent.includes('eligible learned mount'),'store bag source rejected before wallet');assert(!query('[data-nft-mint]'));assert.equal(calls.length,storeItemCalls);ui.close();
