import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { Interface, id, parseUnits } from 'ethers';

let shownDialogs = 0;
class Element extends EventTarget {
  constructor(tagName) { super(); this.tagName = tagName; this.children = []; this.attributes = {}; this.value = ''; }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); if (this.tagName === 'select' && !this.value) this.value = node.value; } }
  replaceChildren(...nodes) { for (const child of this.children) child.parentElement = undefined; this.children = []; this.append(...nodes); }
  remove() { this.parentElement?.children.splice(this.parentElement.children.indexOf(this), 1); this.parentElement = undefined; }
  get isConnected() { return this === document.body || !!this.parentElement?.isConnected; }
  focus() { document.activeElement = this; }
  showModal() { this.open = true; shownDialogs++; }
  close() { this.open = false; }
  click() { if (!this.disabled) return this.onclick?.(new Event('click')); }
}
globalThis.HTMLElement = Element;
globalThis.document = Object.assign(new EventTarget(), { createElement: tag => new Element(tag), body: new Element('body'), hidden: false });
globalThis.window = new EventTarget();
globalThis.location = { origin: 'https://mossvale.world' };
const stored = new Map();
globalThis.localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) };
globalThis.fetch = async (url, options) => {
  assert.equal(url, 'https://rpc.mainnet.chain.robinhood.com');
  const method = JSON.parse(options.body).method;
  assert(['eth_call','eth_chainId','eth_getBalance'].includes(method), 'lifecycle checks permit mocked balance reads only');
  return { ok: true, json: async () => ({ id: 1, result: method === 'eth_chainId' ? '0x1237' : method === 'eth_getBalance' ? '0x0' : `0x${'0'.repeat(64)}` }) };
};

const address = `0x${'11'.repeat(20)}`, config = { organizationId: 'parent', authProxyConfigId: 'proxy' };
const sessions = [], lifecycle = [];
let credentials = true, signatures = 0, gameIdentity = 'game-account', paidRequests = 0, submitted = 0, acknowledged = 0;
let authAttempts = 0, authFailure, authWait;
const authRequests = [];
let prepareWait, revalidateWait, submissionWait;
const transfers = [], feeChecks = [];
const exportFrames = [];
let exportInitializations = 0, walletExports = 0, exportWait, exportInitWait, exportAddress = address, exportInjected = true;
const keyExports = [], keyInjections = [];
globalThis.__turnkeyIframeStamper = class {
  constructor(options) { assert.equal(options.iframeUrl, 'https://export.turnkey.com'); this.clears = 0; this.iframe = new Element('iframe'); options.iframeContainer.append(this.iframe); exportFrames.push(this); }
  clear() { this.clears++; }
  async init() { exportInitializations++; if (exportInitWait) await exportInitWait; return 'iframe-public-key'; }
  async injectKeyExportBundle(...args) { keyInjections.push(args); return exportInjected; }
  async injectWalletExportBundle() { assert.fail('Seed phrase export must never be used'); }
};
const transferHash = `0x${'aa'.repeat(32)}`, recipient = `0x${'22'.repeat(20)}`;
const paidFees = { funded: false, chainId: 4663, nonce: '0x1', gasLimit: '0x5208', maxFeePerGas: '0x7', maxPriorityFeePerGas: '0x0' };
let balanceWait, balanceFailure, balanceWei = '0';
const balanceReads = [];
globalThis.__turnkeyManagement = {
  readBalances: async wallet => { balanceReads.push(wallet); if (balanceWait) await balanceWait; if (balanceFailure) throw balanceFailure; return { address: wallet, mossWei: balanceWei, ethWei: '0' }; },
  readOwnedNfts: async () => ({ items: [], truncated: false }),
  prepareTransfer: async input => {
    transfers.push(input); if (prepareWait) await prepareWait;
    return { input, transaction: { from: input.from, to: input.to, data: '0x', value: '1', chainId: 4663 }, fees: paidFees, maxFeeWei: '147000' };
  },
  revalidateTransfer: async prepared => { feeChecks.push(prepared); if (revalidateWait) await revalidateWait; return paidFees; },
};
globalThis.__turnkeyTestCreateSession = async actual => {
  assert.equal(actual.organizationId, config.organizationId);
  assert(['proxy', 'proxy-next'].includes(actual.authProxyConfigId));
  const id = sessions.length + 1;
  const session = {
    closed: false, logouts: 0, disposals: 0,
    accounts: async () => { lifecycle.push(`accounts:${id}`); return !session.closed && credentials ? [{ address, walletId: 'wallet' }] : []; },
    assertIdentity: async identity => { assert.equal(identity, 'game-account'); if (session.closed) throw Error('Disconnected'); if (!credentials) throw Object.assign(Error('Session expired'), { code: 'WALLET_SESSION_EXPIRED' }); },
    pending: null,
    configureSponsorRpc: callback => { assert.equal(typeof callback, 'function'); session.walletRpc = callback; },
    pendingTransaction: () => session.pending,
    authenticateWithGame: async (getToken, identity) => {
      authAttempts++; assert.equal(identity, 'game-account');
      await getToken('nonce-bound-to-wallet-key');
      if (session.closed) throw Error('Disconnected');
      credentials = true;
    },
    sendTransaction: async () => assert.fail('Manual transfers must not request game-funded sending'),
    sendPaidTransaction: async (transaction, quoteFees) => {
      paidRequests++;
      const fees = await quoteFees();
      assert.deepEqual(fees, paidFees); assert.equal(fees.funded, false);
      assert.deepEqual(transaction, feeChecks.at(-1).transaction, 'the exact reviewed transfer reaches the paid sender');
      submitted++; session.pending = { hash: transferHash, transaction };
      if (submissionWait) await submissionWait;
      return transferHash;
    },
    acknowledgeTransaction: async hash => { assert.equal(hash, transferHash); acknowledged++; session.pending = null; },
    logout: async () => { lifecycle.push(`logout:${id}`); session.logouts++; session.closed = true; credentials = false; },
    dispose: () => { lifecycle.push(`dispose:${id}`); session.disposals++; session.closed = true; },
    signMessage: async () => { signatures++; throw Error('A cancelled approval must never sign'); },
    exportWalletAccount: async (...args) => {
      walletExports++; keyExports.push(args); if (exportWait) await exportWait;
      return { bundle: 'encrypted-account-key-fixture', organizationId: 'player-organization', address: exportAddress };
    },
  };
  lifecycle.push(`create:${id}`); sessions.push(session); return session;
};
const walletModule = new URL('../src/turnkey-wallet.ts', import.meta.url).href;
const managementModule = new URL('../src/turnkey-management.ts', import.meta.url).href;
const iframeModule = import.meta.resolve('@turnkey/iframe-stamper');
const authModule = new URL('../src/auth.ts', import.meta.url).href;
const recoveryModule = new URL('../src/auction-recovery.ts', import.meta.url).href;
let recoveryMounts = 0, recoveryDisposals = 0;
globalThis.__turnkeyRecovery = (container, signal) => {
  assert(!signal.aborted); recoveryMounts++;
  const link = document.createElement('button'); link.textContent = 'Recover old auction proceeds'; container.append(link);
  return () => { recoveryDisposals++; container.replaceChildren(); };
};
globalThis.__turnkeyTestAuth = { getWalletIdentity: () => gameIdentity, getAccessToken: async () => 'game-account-token', authorizeWallet: async (...args) => {
  authRequests.push(args); if (authWait) await authWait; if (authFailure) throw authFailure;
  return { idToken: 'nonce-bound-fixture-token', identity: gameIdentity };
} };
const hook = registerHooks({ resolve(specifier, context, next) {
  return next(context.parentURL?.includes('/src/') && /^\.\/[\w-]+$/.test(specifier) ? `${specifier}.ts` : specifier, context);
}, load(url, context, next) {
  if (url === authModule) return { format: 'module', shortCircuit: true, source: 'export const getAccessToken=()=>globalThis.__turnkeyTestAuth.getAccessToken();export const getWalletIdentity=()=>globalThis.__turnkeyTestAuth.getWalletIdentity();export const authorizeWallet=(...a)=>globalThis.__turnkeyTestAuth.authorizeWallet(...a);' };
  if (url === walletModule) return { format: 'module', shortCircuit: true, source: 'export const createTurnkeySession = globalThis.__turnkeyTestCreateSession;' };
  if (url === managementModule) return { format: 'module', shortCircuit: true, source: 'export const {readBalances,readOwnedNfts,prepareTransfer,revalidateTransfer}=globalThis.__turnkeyManagement;' };
  if (url === iframeModule) return { format: 'module', shortCircuit: true, source: 'export const IframeStamper = globalThis.__turnkeyIframeStamper; export const KeyFormat = { Hexadecimal: "HEXADECIMAL" };' };
  if (url === recoveryModule) return { format: 'module', shortCircuit: true, source: 'export const mountAuctionRecovery = globalThis.__turnkeyRecovery;' };
  return next(url, context);
} });
const { openTurnkeyWallet: openWallet, approveTurnkeyRequest, watchTurnkeyMossBalance } = await import('../src/turnkey-ui.ts');
const { MOSS_TOKEN } = await import('../src/auction.ts');
const { configureHosting, setActiveHostingRealm, activeRealmTarget } = await import('../src/hosting-client.ts');
const { createHostingConfig } = await import('../src/hosting-realms.ts');
const authentication = { getWalletIdentity: () => gameIdentity, authorizeWallet: (...args) => globalThis.__turnkeyTestAuth.authorizeWallet(...args) };
const openTurnkeyWallet = config => openWallet(config, undefined, { authentication });
const tick = () => new Promise(resolve => setImmediate(resolve));
const nodes = (root = document.body) => [root, ...root.children.flatMap(node => nodes(node))];
const click = text => { const button = nodes().find(node => node.tagName === 'button' && node.textContent === text); assert(button, `Missing ${text} button`); button.click(); };
const cancelled = promise => assert.rejects(promise, error => error.code === 4001);
const clean = () => assert.equal(document.body.children.length, 0, 'cancelled dialogs leave no DOM behind');
const resetKey = 'mossvale-wallet-reset';
function storageEvent(key, storageArea = localStorage) {
  const event = new Event('storage');
  Object.assign(event, { key, storageArea, newValue: 'other-tab-reset' });
  window.dispatchEvent(event);
}

// Concise auction reviews bind the catalog item and exact amount to the transaction being approved.
const auctionABI = new Interface([
  'function buy((bytes32 listingId,address buyer,address seller,uint256 priceWei,uint64 deadline),bytes)',
  'function approve(address,uint256)',
  'function claim((bytes32 claimId,bytes32 characterId,address recipient,uint256 amountWei),bytes)',
  'function mint((bytes32 orderId,uint256 tokenId,uint256 assetId,address buyer,uint256 amountWei,uint64 deadline),bytes)',
]);
const auctionPurchase = { item: { kind: 'item', id: 'brook-trout', quantity: 3 }, listingId: '10000000-0000-4000-8000-000000000001', contract: `0x${'33'.repeat(20)}`, price: '12.500000000000000001' };
const auctionOrder = { listingId: id(auctionPurchase.listingId), buyer: address, seller: recipient, priceWei: parseUnits(auctionPurchase.price, 18), deadline: Math.floor(Date.now() / 1000) + 300 };
const buyData = order => auctionABI.encodeFunctionData('buy', [order, '0x1234']);
const purchaseTransaction = { from: address, to: auctionPurchase.contract, data: buyData(auctionOrder), value: '0', chainId: 4663 };
const allowanceTransaction = { ...purchaseTransaction, to: MOSS_TOKEN.address, data: auctionABI.encodeFunctionData('approve', [auctionPurchase.contract, auctionOrder.priceWei]) };
const reviewTexts = () => nodes().map(node => node.textContent ?? '').filter(Boolean);
function concisePurchase() {
  assert(reviewTexts().includes('3 × Brook trout'), 'review shows the catalog label and stack quantity');
  assert(reviewTexts().includes('12.500000000000000001 MOSS'), 'review preserves the exact 18-decimal price');
  assert(nodes().some(node => node.innerHTML?.includes('/ui/loot/brook-trout.png')), 'review shows the actual item artwork');
  assert(!reviewTexts().some(text => /From:|Contract:|gas|Transaction data/.test(text)), 'auction review omits technical wallet details');
  assert(!nodes().some(node => node.tagName === 'details' || node.tagName === 'pre'));
}
let auctionReview = approveTurnkeyRequest({ transaction: purchaseTransaction, auctionPurchase }), auctionCancelled = cancelled(auctionReview);
concisePurchase(); assert(reviewTexts().includes('Buy item')); click('Cancel'); await auctionCancelled; clean();
auctionReview = approveTurnkeyRequest({ transaction: allowanceTransaction, auctionPurchase });
concisePurchase(); assert(reviewTexts().includes('Approve MOSS purchase')); click('Approve MOSS'); await auctionReview; clean();

const batchPurchase = { ...purchaseTransaction, approval: { to: allowanceTransaction.to, data: allowanceTransaction.data, value: '0' } };
const beforeBatchDialogs = shownDialogs;
auctionReview = approveTurnkeyRequest({ transaction: batchPurchase, auctionPurchase });
concisePurchase(); assert(reviewTexts().includes('Buy item')); assert(!reviewTexts().includes('Approve MOSS purchase'));
click('Buy'); await auctionReview; assert.equal(shownDialogs, beforeBatchDialogs + 1, 'atomic approve and buy needs only one purchase confirmation'); clean();
for (const approval of [
  { ...batchPurchase.approval, to: recipient }, { ...batchPurchase.approval, value: '1' }, { ...batchPurchase.approval, chainId: 4663 },
  { ...batchPurchase.approval, data: auctionABI.encodeFunctionData('approve', [recipient, auctionOrder.priceWei]) },
  { ...batchPurchase.approval, data: auctionABI.encodeFunctionData('approve', [auctionPurchase.contract, auctionOrder.priceWei + 1n]) },
  { ...batchPurchase.approval, data: batchPurchase.approval.data + '00' },
]) {
  const before = shownDialogs;
  await assert.rejects(approveTurnkeyRequest({ transaction: { ...batchPurchase, approval }, auctionPurchase }));
  assert.equal(shownDialogs, before, 'mismatched batch approvals cannot be hidden inside the concise purchase review'); clean();
}
await assert.rejects(approveTurnkeyRequest({ transaction: batchPurchase }), /exact auction review/);
// Referral tuples retain the atomic review and disclose only the burn-share allocation.
const referralAuctionABI=new Interface(['function buy((bytes32 listingId,address buyer,address seller,uint256 priceWei,uint64 deadline,address referrer,uint16 referralBps),bytes)']);
const referrer=`0x${'44'.repeat(20)}`;
const referralBuyData=changes=>referralAuctionABI.encodeFunctionData('buy',[{...auctionOrder,referrer,referralBps:500,...changes},'0x1234']);
for(const referralBps of [0,10,25,50,75,100,500,1000]){
  const before=shownDialogs;
  auctionReview=approveTurnkeyRequest({transaction:{...batchPurchase,data:referralBuyData({referralBps,referrer:referralBps?referrer:'0x'+'0'.repeat(40)})},auctionPurchase});
  concisePurchase();assert(reviewTexts().includes('Buy item'));assert(!reviewTexts().includes('Approve MOSS purchase'));
  if(referralBps)assert(reviewTexts().includes(`Referral reward: ${({10:'0.0125',25:'0.03125',50:'0.0625',75:'0.09375',100:'0.125',500:'0.025',1000:'0.05'})[referralBps]} MOSS (${referralBps/100}% of the ${referralBps<=100?'purchase price':'burn share'}) to ${referrer}. Your price stays the same.`),'review derives exact reward from the signed calldata');
  else assert(!reviewTexts().some(text=>text.includes('Referral reward:')),'zero-referral orders do not invent a reward');
  click('Buy');await auctionReview;assert.equal(shownDialogs,before+1,'referral purchase uses one atomic confirmation');clean();
}
for(const changes of [{referralBps:501},{referrer:address},{referrer:recipient},{referrer:auctionPurchase.contract},{referrer:'0x'+'0'.repeat(40)},{referralBps:0}]){
  const before=shownDialogs;
  await assert.rejects(approveTurnkeyRequest({transaction:{...batchPurchase,data:referralBuyData(changes)},auctionPurchase}));
  assert.equal(shownDialogs,before,'invalid referral terms reject before wallet confirmation');clean();
}
for(const change of [{data:referralBuyData({})+'00'},{approval:{...batchPurchase.approval,data:auctionABI.encodeFunctionData('approve',[auctionPurchase.contract,auctionOrder.priceWei+1n])}}]){
  const before=shownDialogs;
  await assert.rejects(approveTurnkeyRequest({transaction:{...batchPurchase,data:referralBuyData({}),...change},auctionPurchase}));
  assert.equal(shownDialogs,before,'referral orders keep exact calldata and exact approval validation');clean();
}


for (const [label, transaction, purchase] of [
  ['wrong context price', purchaseTransaction, { ...auctionPurchase, price: '12.5' }],
  ['wrong listing', { ...purchaseTransaction, data: buyData({ ...auctionOrder, listingId: id('another-listing') }) }, auctionPurchase],
  ['wrong buyer', { ...purchaseTransaction, data: buyData({ ...auctionOrder, buyer: recipient }) }, auctionPurchase],
  ['wrong amount', { ...purchaseTransaction, data: buyData({ ...auctionOrder, priceWei: auctionOrder.priceWei + 1n }) }, auctionPurchase],
  ['wrong target', { ...purchaseTransaction, to: recipient }, auctionPurchase],
  ['wrong spender', { ...allowanceTransaction, data: auctionABI.encodeFunctionData('approve', [recipient, auctionOrder.priceWei]) }, auctionPurchase],
  ['excess allowance', { ...allowanceTransaction, data: auctionABI.encodeFunctionData('approve', [auctionPurchase.contract, auctionOrder.priceWei + 1n]) }, auctionPurchase],
  ['nonzero value', { ...purchaseTransaction, value: '1' }, auctionPurchase],
  ['wrong chain', { ...purchaseTransaction, chainId: 1 }, auctionPurchase],
  ['trailing buy data', { ...purchaseTransaction, data: purchaseTransaction.data + '00' }, auctionPurchase],
  ['trailing approval data', { ...allowanceTransaction, data: allowanceTransaction.data + '00' }, auctionPurchase],
]) {
  const before = shownDialogs;
  await assert.rejects(approveTurnkeyRequest({ transaction, auctionPurchase: purchase }), undefined, label);
  assert.equal(shownDialogs, before, `${label} must reject before opening a dialog`); clean();
}
auctionReview = approveTurnkeyRequest({ transaction: purchaseTransaction, auctionPurchase: { ...auctionPurchase, item: { kind: 'gold', id: 'gold', quantity: 1000 } } });
assert(reviewTexts().includes('995 Gold'), 'gold lot displays the quantity actually delivered after its fee');
assert(!reviewTexts().includes('1,000 Gold')); click('Buy'); await auctionReview; clean();

// Other wallet actions retain their full message and transaction review.
let genericReview = approveTurnkeyRequest({ message: '0x6869' });
assert(nodes().some(node => node.tagName === 'pre' && node.textContent === 'hi')); click('Sign message'); await genericReview; clean();
genericReview = approveTurnkeyRequest({ transaction: { ...purchaseTransaction, data: auctionABI.encodeFunctionData('mint', [{ orderId: id('mint'), tokenId: 1, assetId: 1, buyer: address, amountWei: parseUnits('2.5', 18), deadline: auctionOrder.deadline }, '0x1234']) } });
const mintCancelled = cancelled(genericReview);
assert(reviewTexts().includes('Mint your NFT')); assert(reviewTexts().includes('Mint price: 2.5 MOSS'));
assert(reviewTexts().includes(`From: ${address}`)); assert(reviewTexts().includes(`Contract: ${purchaseTransaction.to}`)); assert(reviewTexts().includes('Transaction data'));
click('Cancel'); await mintCancelled; clean();

// Voucher rewards preserve every decimal; compact pet mints use only the configured collection's catalog.
const collections = { petsContract: `0x${'44'.repeat(20)}`, legacyPetsContract: `0x${'55'.repeat(20)}`, housesContract: `0x${'66'.repeat(20)}` };
const claimOrder = { claimId: id('voucher'), characterId: id('character'), recipient: address, amountWei: parseUnits('7.123456789012345678', 18) };
const claimData = order => auctionABI.encodeFunctionData('claim', [order, '0x1234']);
const claimTransaction = { ...purchaseTransaction, data: claimData(claimOrder) };
const petOrder = { orderId: id('pet-mint'), tokenId: 123, assetId: 2, buyer: address, amountWei: 0, deadline: auctionOrder.deadline };
const petData = order => auctionABI.encodeFunctionData('mint', [order, '0x1234']);
const petTransaction = { ...purchaseTransaction, to: collections.petsContract, data: petData(petOrder) };
function compactReward() {
  assert(!reviewTexts().some(text => /From:|Contract:|gas|Transaction data|Token ID/i.test(text)), 'compact reward omits technical transaction details');
  assert(!nodes().some(node => node.tagName === 'details' || node.tagName === 'pre'));
}
for (const [amount, action] of [['7.123456789012345678', 'Cancel'], ['10', 'Claim']]) {
  const pending = approveTurnkeyRequest({ transaction: { ...claimTransaction, data: claimData({ ...claimOrder, amountWei: parseUnits(amount, 18) }) } });
  const result = action === 'Cancel' ? cancelled(pending) : pending;
  assert(reviewTexts().includes('You will receive')); assert(reviewTexts().includes(`${amount} MOSS`), 'voucher amount is exact without a redundant .0');
  compactReward(); click(action); await result; clean();
}
for (const [contract, assetId, name, petId, action] of [
  [collections.petsContract, 2, 'Moon Owl', 'moon-owl', 'Cancel'],
  [collections.legacyPetsContract, 2, 'Moon Owl', 'moon-owl', 'Mint'],
  [collections.petsContract, 9, 'Fern Lynx', 'fern-lynx', 'Mint'],
]) {
  const pending = approveTurnkeyRequest({ transaction: { ...petTransaction, to: contract, data: petData({ ...petOrder, assetId }) } }, collections);
  const result = action === 'Cancel' ? cancelled(pending) : pending;
  assert(reviewTexts().includes('Mint pet')); assert(reviewTexts().includes(name));
  assert(nodes().some(node => node.src === `/ui/pets/${petId}.png` || node.innerHTML?.includes(`/ui/pets/${petId}.png`)), 'mint shows the actual pet artwork');
  assert(!reviewTexts().some(text => /MOSS|123/.test(text)), 'free pet mint does not show price or token number');
  compactReward(); click(action); await result; clean();
}
for (const [label, transaction, configured = collections] of [
  ['other voucher recipient', { ...claimTransaction, data: claimData({ ...claimOrder, recipient }) }],
  ['zero voucher amount', { ...claimTransaction, data: claimData({ ...claimOrder, amountWei: 0 }) }],
  ['voucher sends ETH', { ...claimTransaction, value: '1' }],
  ['voucher wrong chain', { ...claimTransaction, chainId: 1 }],
  ['voucher trailing calldata', { ...claimTransaction, data: claimTransaction.data + '00' }],
  ['other mint recipient', { ...petTransaction, data: petData({ ...petOrder, buyer: recipient }) }],
  ['paid pet mint', { ...petTransaction, data: petData({ ...petOrder, amountWei: 1 }) }],
  ['mint sends ETH', { ...petTransaction, value: '1' }],
  ['mint wrong chain', { ...petTransaction, chainId: 1 }],
  ['mint trailing calldata', { ...petTransaction, data: petTransaction.data + '00' }],
  ['unknown pet', { ...petTransaction, data: petData({ ...petOrder, assetId: 999 }) }],
  ['expanded pet on legacy collection', { ...petTransaction, to: collections.legacyPetsContract, data: petData({ ...petOrder, assetId: 9 }) }],
  ['unconfigured collection', petTransaction, {}],
  ['house collection', { ...petTransaction, to: collections.housesContract }],
]) {
  const pending = approveTurnkeyRequest({ transaction }, configured), result = cancelled(pending);
  assert(reviewTexts().includes('Review wallet request'), `${label} retains the full review`);
  assert(reviewTexts().includes(`Contract: ${transaction.to}`)); assert(reviewTexts().includes('Transaction data'));
  assert(!reviewTexts().includes('You will receive') && !reviewTexts().includes('Mint pet'), `${label} must not show a compact reward`);
  click('Cancel'); await result; clean();
}

// A sign-out before this lazy module loads must clear the previous user's SDK session first.
localStorage.setItem(resetKey, 'old-reset');
let selection = openTurnkeyWallet(config), rejected = cancelled(selection);
await tick();
assert.deepEqual(lifecycle, ['create:1', 'logout:1', 'create:2', 'accounts:2']);
assert.equal(localStorage.getItem(resetKey), null);
assert.equal(authAttempts, 1, 'the old credentials are discarded before fresh game SSO opens the wallet');
assert(nodes().some(node => node.textContent === 'Copy address'));
assert(!nodes().some(node => node.textContent === 'Continue with game account'), 'an active game account has no second wallet login gate');
click('Cancel'); await rejected; clean();

// A storage reset from another tab clears a loaded session and cancels both chooser and approval.
credentials = true;
selection = openTurnkeyWallet(config); await tick(); click('Use this wallet');
const provider = await selection;
selection = openTurnkeyWallet(config); rejected = cancelled(selection);
const approval = provider.request({ method: 'personal_sign', params: ['0x6869', address] }), approvalRejected = cancelled(approval);
await tick();
assert.equal(document.body.children.length, 2);
storageEvent('unrelated'); storageEvent(resetKey, {});
assert.equal(document.body.children.length, 2, 'unrelated storage events cannot disconnect a wallet');
localStorage.setItem(resetKey, 'other-tab-reset'); storageEvent(resetKey);
await Promise.all([rejected, approvalRejected]); await tick(); clean();
assert.equal(sessions[1].logouts, 1); assert.equal(sessions[1].disposals, 0);
assert.equal(credentials, false); assert.equal(signatures, 0);

// Navigation invalidates this page while preserving the established session for reload.
localStorage.removeItem(resetKey); credentials = true;
selection = openTurnkeyWallet(config); await tick(); click('Use this wallet');
const reloadedProvider = await selection, navigationSession = sessions.at(-1);
selection = openTurnkeyWallet(config); rejected = cancelled(selection);
const navigatingApproval = cancelled(reloadedProvider.request({ method: 'personal_sign', params: ['0x6869', address] }));
await tick(); window.dispatchEvent(new Event('pagehide'));
await Promise.all([rejected, navigatingApproval]); await tick(); clean();
assert.equal(navigationSession.disposals, 1); assert.equal(navigationSession.logouts, 0);
assert.equal(credentials, true); assert.equal(signatures, 0);
selection = openTurnkeyWallet(config); rejected = cancelled(selection); await tick();
assert.notEqual(sessions.at(-1), navigationSession, 'reload creates a fresh facade');
assert(nodes().some(node => node.textContent === 'Use this wallet'), 'reload restores the preserved account');
click('Security'); click('Disconnect wallet'); await rejected; await tick(); clean();
assert(localStorage.getItem(resetKey), 'explicit wallet sign-out persists a reset for other tabs and lazy loads');
assert.equal(sessions.at(-1).logouts, 1); assert.equal(credentials, false);
localStorage.removeItem(resetKey); credentials = true;
selection = openTurnkeyWallet(config); rejected = cancelled(selection); await tick();
const write = localStorage.setItem; localStorage.setItem = () => { throw Error('Storage unavailable'); };
click('Security'); click('Disconnect wallet'); await rejected; await tick(); clean(); localStorage.setItem = write;
assert.equal(sessions.at(-1).logouts, 1, 'unavailable browser storage cannot prevent this page from signing out');
assert.equal(credentials, false);

// Successful authentication must open Receive even though the sign-in itself was busy.
localStorage.removeItem(resetKey);
selection = openTurnkeyWallet(config); rejected = cancelled(selection); await tick();
assert(nodes().some(node => node.textContent === 'Copy address'), 'successful sign-in renders Receive rather than an empty busy page');
assert(!nodes().some(node => node.tagName === 'select'), 'the linked wallet opens without an account selector');
assert(nodes().some(node => node.tagName === 'pre' && node.textContent === address), 'Receive still shows the linked wallet address');
click('Cancel'); await rejected; clean();

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const findButton = (text, root = document.body) => { const node = nodes(root).find(node => node.tagName === 'button' && node.textContent === text); assert(node, `Missing ${text}`); return node; };
function submitTransfer() {
  click('Send');
  const form = nodes().find(node => node.tagName === 'form'); assert(form);
  for (const field of nodes(form).filter(node => node.tagName === 'input')) field.value = field.parentElement.textContent === 'Amount' ? '1.25' : recipient;
  const work = form.onsubmit(new Event('submit', { cancelable: true }));
  return { form, work };
}
function checkBusy(form) {
  click('Receive'); click('Activity'); click('Use this wallet');
  assert(form.isConnected, 'a busy transfer cannot navigate away or close through Use this wallet');
  assert.equal(findButton('Send').attributes['aria-current'], 'page');
}

// Review cancellation performs no send or fee revalidation, and preparation cannot be navigated away.
const preparing = deferred(); prepareWait = preparing.promise;
selection = openTurnkeyWallet(config); rejected = cancelled(selection); await tick();
let transfer = submitTransfer(); await tick(); checkBusy(transfer.form);
assert.equal(document.body.children.length, 1); assert.equal(paidRequests, 0);
preparing.resolve(); await tick(); prepareWait = undefined;
assert.equal(document.body.children.length, 2);
assert.deepEqual(transfers.at(-1), { from: address, to: recipient, asset: 'moss', amount: '1.25' });
const reviewDialog = document.body.children.at(-1);
assert(nodes(reviewDialog).some(node => node.textContent === 'Recipient: ' + recipient));
assert(nodes(reviewDialog).some(node => node.textContent?.startsWith('Maximum network fee:')));
findButton('Cancel', reviewDialog).click(); await transfer.work;
assert.equal(paidRequests, 0); assert.equal(submitted, 0); assert.equal(feeChecks.length, 0);
assert(nodes().some(node => node.textContent === 'Transfer cancelled. Nothing was submitted.'));
click('Cancel'); await rejected; clean();

// Confirmation uses player-paid fees, revalidates once and cannot submit twice or navigate mid-send.
const revalidating = deferred(), sending = deferred(); revalidateWait = revalidating.promise; submissionWait = sending.promise;
selection = openTurnkeyWallet(config); rejected = cancelled(selection); await tick();
transfer = submitTransfer(); await tick();
const confirm = findButton('Confirm transfer'); confirm.click(); confirm.click(); await tick();
assert.equal(paidRequests, 1); assert.equal(feeChecks.length, 1); assert.equal(submitted, 0); checkBusy(transfer.form);
revalidating.resolve(); await tick(); assert.equal(submitted, 1); checkBusy(transfer.form);
sending.resolve(); await transfer.work; revalidateWait = submissionWait = undefined;
assert.equal(submitted, 1); assert.equal(acknowledged, 1); assert.equal(sessions.at(-1).pending, null);
assert(nodes().some(node => node.textContent === 'Transfer included on-chain.'));
click('Cancel'); await rejected; clean();

// A changed identity after broadcast is uncertain/included, never a promise that nothing was sent.
const included = deferred(); submissionWait = included.promise;
selection = openTurnkeyWallet(config); rejected = cancelled(selection); await tick();
transfer = submitTransfer(); await tick(); click('Confirm transfer'); await tick();
assert.equal(submitted, 2); const lastSession = sessions.at(-1);
gameIdentity = 'different-game-account'; included.resolve(); await transfer.work; submissionWait = undefined;
assert.equal(acknowledged, 1, 'a post-submission identity change preserves the pending transaction journal');
assert.equal(lastSession.pending.hash, transferHash);
assert(nodes().some(node => node.textContent === 'Transfer interrupted. Check Activity before trying again.'));
assert(!nodes().some(node => node.textContent?.includes('Nothing was submitted.')));
gameIdentity = 'game-account'; click('Cancel'); await rejected; clean();

async function mountInline() {
  const container = document.createElement('div'), controller = new AbortController(); document.body.append(container);
  const result = openWallet(config, undefined, { authentication, manage: true, container, signal: controller.signal });
  const rejected = cancelled(result); await tick();
  assert.equal(container.children[0]?.tagName, 'section', 'Wallet Settings mounts a section inside its host');
  assert(!nodes().some(node => node.tagName === 'dialog'), 'inline management must not create a dialog');
  const visible = node => !node.hidden && (!node.parentElement || visible(node.parentElement));
  assert(!nodes(container).some(node => visible(node) && node.tagName === 'button' && ['Done', 'Use this wallet'].includes(node.textContent)), 'the settings host owns closing the wallet');
  return { container, controller, rejected };
}
function removeInlineHost(container) {
  assert.equal(container.children.length, 0, 'closing Wallet Settings removes its mounted content');
  container.remove(); clean();
}

// Inline review cancellation leaves the settings view open and never reaches the sender.
let inline = await mountInline();
const inlineRequests = paidRequests, inlineSubmitted = submitted, inlineFeeChecks = feeChecks.length;
transfer = submitTransfer(); await tick();
assert(!nodes().some(node => node.tagName === 'dialog'), 'inline transaction review stays in Wallet Settings');
assert(nodes(inline.container).some(node => node.textContent === 'Recipient: ' + recipient));
findButton('Cancel', inline.container).click(); await transfer.work;
assert.equal(paidRequests, inlineRequests); assert.equal(submitted, inlineSubmitted); assert.equal(feeChecks.length, inlineFeeChecks);
assert(inline.container.children.length > 0, 'cancelling a review keeps the wallet settings mounted');
inline.controller.abort(); await inline.rejected; await tick(); removeInlineHost(inline.container);

// Backup stays inline, clears its iframe on navigation and returns to Security with Done.
inline = await mountInline();
click('Security'); await findButton('Back up wallet', inline.container).click();
const backupSection = nodes(inline.container).find(node => node.textContent === 'Back up your wallet')?.parentElement;
assert.equal(backupSection?.tagName, 'section');
assert(!nodes().some(node => node.tagName === 'dialog'), 'inline backup must not open a modal');
assert.equal(exportFrames.length, 1);
click('Receive');
assert.equal(exportFrames[0].clears, 1, 'changing the wallet subsection clears the backup iframe');
assert.equal(backupSection.isConnected, false);
click('Security'); await findButton('Back up wallet', inline.container).click();
const secondBackup = nodes(inline.container).find(node => node.textContent === 'Back up your wallet')?.parentElement;
findButton('Done', secondBackup).click();
assert.equal(exportFrames[1].clears, 1, 'Done clears the backup iframe');
assert.equal(findButton('Security', inline.container).attributes['aria-current'], 'page');
assert(findButton('Back up wallet', inline.container)); assert(findButton('Disconnect wallet', inline.container));
assert.equal(exportInitializations, 0); assert.equal(walletExports, 0, 'opening backup never reveals or exports recovery material');
inline.controller.abort(); await inline.rejected; await tick(); removeInlineHost(inline.container);

// Only an explicit reveal exports the fixed primary account, encrypted directly into Turnkey's frame.
inline = await mountInline();
async function openBackup() { click('Security'); await findButton('Back up wallet', inline.container).click(); return exportFrames.at(-1); }
let frame = await openBackup();
await findButton('Reveal private key', inline.container).click();
assert.deepEqual(keyExports, [[address, 'iframe-public-key']]);
assert.deepEqual(keyInjections, [['encrypted-account-key-fixture', 'player-organization', 'HEXADECIMAL', address]]);
assert.equal(frame.iframe.title, 'Wallet private key');
assert(nodes(inline.container).some(node => node.textContent === 'Store the private key somewhere private before closing.'));
assert(!nodes(inline.container).some(node => /encrypted-account-key-fixture|recovery phrase/i.test(node.textContent ?? '')), 'the host page never renders export material or offers a seed phrase');

// A mismatched address or rejected iframe injection cannot report a completed backup.
for (const invalid of ['address', 'injection']) {
  frame = await openBackup();
  exportAddress = invalid === 'address' ? recipient : address; exportInjected = invalid !== 'injection';
  const previousInjections = keyInjections.length;
  await findButton('Reveal private key', inline.container).click();
  assert(nodes(inline.container).some(node => node.textContent === 'Private key export could not be completed. Close this backup and try again.'));
  assert.equal(frame.clears, 1);
  if (invalid === 'address') assert.equal(keyInjections.length, previousInjections, 'another account cannot reach the export frame');
}
exportAddress = address; exportInjected = true;

// Closing during iframe initialization prevents the account export request entirely.
frame = await openBackup();
const initGate = deferred(); exportInitWait = initGate.promise;
const exportsBeforeCancel = walletExports;
let revealing = findButton('Reveal private key', inline.container).click(); await tick();
click('Receive'); initGate.resolve(); await revealing; exportInitWait = undefined;
assert.equal(walletExports, exportsBeforeCancel); assert.equal(frame.clears, 1);

// A game-account change after the encrypted response arrives prevents injection.
frame = await openBackup();
const exportGate = deferred(); exportWait = exportGate.promise;
const injectionsBeforeCancel = keyInjections.length;
revealing = findButton('Reveal private key', inline.container).click(); await tick();
gameIdentity = 'another-account'; exportGate.resolve(); await revealing; exportWait = undefined; gameIdentity = 'game-account';
assert.equal(keyInjections.length, injectionsBeforeCancel); assert.equal(frame.clears, 1);

// Closing the settings host discards a late response and clears the frame.
frame = await openBackup();
const lateExport = deferred(); exportWait = lateExport.promise;
revealing = findButton('Reveal private key', inline.container).click(); await tick();
inline.controller.abort(); lateExport.resolve(); await Promise.all([inline.rejected, revealing]); exportWait = undefined;
assert.equal(keyInjections.length, injectionsBeforeCancel); assert.equal(frame.clears, 1);
await tick(); removeInlineHost(inline.container);

// Closing the host cancels an outstanding inline review; even its detached confirm cannot submit.
inline = await mountInline();
const inlineSession = sessions.at(-1), inlineLogouts = inlineSession.logouts;
transfer = submitTransfer(); await tick();
const detachedConfirm = findButton('Confirm transfer', inline.container);
assert(!nodes().some(node => node.tagName === 'dialog'));
inline.controller.abort(); await Promise.all([inline.rejected, transfer.work]); await tick();
removeInlineHost(inline.container); detachedConfirm.click(); await tick();
assert.equal(paidRequests, inlineRequests); assert.equal(submitted, inlineSubmitted); assert.equal(feeChecks.length, inlineFeeChecks);
assert.equal(inlineSession.logouts, inlineLogouts + 1, 'aborting a busy settings view still disconnects its wallet');
// Realm routing uses trusted hosting destinations and invalidates the entire old wallet context.
configureHosting(createHostingConfig('eu', '', 'https://us.mossvale.world', 'https://asia.mossvale.world'));
credentials = true;
const rpcReads = [], configReads = [];
let tokenWait, rpcWait;
globalThis.__turnkeyTestAuth.getAccessToken = async () => { if (tokenWait) await tokenWait; return `${gameIdentity}-token`; };
globalThis.fetch = async (url, options) => {
  assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
  if (url.endsWith('/api/config')) {
    configReads.push(url); return { ok: true, json: async () => ({ turnkey: config }) };
  }
  assert.equal(options.headers.Authorization, 'Bearer game-account-token');
  const request = JSON.parse(options.body); assert.equal(request.id, 1); assert.equal(request.jsonrpc, '2.0');
  assert(['wallet_prepareCalls', 'wallet_sendPreparedCalls', 'wallet_getCallsStatus'].includes(request.method));
  rpcReads.push({ url, request, signal: options.signal });
  if (rpcWait) await rpcWait;
  return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: { id: 'saved-operation' } }) };
};
async function chooseEmbedded() {
  credentials = true;
  const selection = openTurnkeyWallet(config); await tick(); click('Use this wallet');
  return { provider: await selection, session: sessions.at(-1) };
}
let routed = await chooseEmbedded();
for (const method of ['wallet_prepareCalls', 'wallet_sendPreparedCalls', 'wallet_getCallsStatus']) {
  await routed.session.walletRpc({ method, params: [{ id: 'saved-operation' }] });
  assert.equal(rpcReads.at(-1).url, 'https://mossvale.world/api/turnkey/wallet');
}
const oldRpc = routed.session.walletRpc, oldSession = routed.session;
const realmApproval = cancelled(routed.provider.request({ method: 'personal_sign', params: ['0x6869', address] }));
await tick(); assert(document.body.children.length);
setActiveHostingRealm(undefined); await realmApproval; await tick(); clean();
assert.equal(oldSession.disposals, 1); assert.equal(oldSession.logouts, 0); assert.equal(credentials, true);
assert.throws(() => activeRealmTarget('/api/turnkey/wallet'), /Finish connecting/);
await cancelled(oldRpc({ method: 'wallet_prepareCalls', params: [] }));
setActiveHostingRealm('us'); routed = await chooseEmbedded();
assert.notEqual(routed.session, oldSession, 'the new realm restores a fresh facade without signing out');
// Existing signed requests and their status route through the new realm's shared operation ledger.
for (const method of ['wallet_sendPreparedCalls', 'wallet_getCallsStatus']) {
  await routed.session.walletRpc({ method, params: [{ id: 'saved-operation' }] });
  assert.equal(rpcReads.at(-1).url, 'https://us.mossvale.world/api/turnkey/wallet');
  assert.deepEqual(rpcReads.at(-1).request.params, [{ id: 'saved-operation' }]);
}
const { mountTurnkeyManagement } = await import('../src/turnkey-ui.ts');
const host = document.createElement('div'); document.body.append(host);
const disposeManagement = mountTurnkeyManagement(host); await tick();
assert.equal(configReads.at(-1), 'https://us.mossvale.world/api/config');
assert(findButton('Recover old auction proceeds', host)); assert.equal(recoveryMounts, 1);
disposeManagement(); await tick(); host.remove(); clean();
assert.equal(recoveryDisposals, 1);
const workingFetch = fetch, unavailableHost = document.createElement('div'); document.body.append(unavailableHost);
globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
const disposeUnavailable = mountTurnkeyManagement(unavailableHost); await tick();
assert(findButton('Recover old auction proceeds', unavailableHost), 'external old proceeds remain recoverable when embedded wallet configuration/auth cannot open');
assert(nodes(unavailableHost).some(node => node.textContent === 'Mossvale Wallet is not enabled on this realm yet.'));
disposeUnavailable(); unavailableHost.remove(); globalThis.fetch = workingFetch; clean();
await routed.session.walletRpc({ method: 'wallet_getCallsStatus', params: [{ id: 'saved-operation' }] });
assert.equal(rpcReads.at(-1).url, 'https://us.mossvale.world/api/turnkey/wallet', 'closing idle Settings cannot disable the selected provider shared session');
// Refresh cannot send a token after changing realm, account, or signing out.
for (const change of ['realm', 'account', 'logout']) {
  routed = await chooseEmbedded();
  const held = deferred(); tokenWait = held.promise;
  const before = rpcReads.length;
  const pending = cancelled(routed.session.walletRpc({ method: 'wallet_prepareCalls', params: [] }));
  await tick();
  if (change === 'realm') setActiveHostingRealm('asia');
  else if (change === 'account') gameIdentity = 'other-account';
  else window.dispatchEvent(new Event('mossvale-wallet-reset'));
  held.resolve(); await pending; tokenWait = undefined; await tick();
  assert.equal(rpcReads.length, before, `${change} during refresh must not send a bearer token`);
  gameIdentity = 'game-account';
}
// A sent request remains recoverable, but its late response cannot continue the old realm's operation.
routed = await chooseEmbedded();
const heldResponse = deferred(); rpcWait = heldResponse.promise;
const late = cancelled(routed.session.walletRpc({ method: 'wallet_sendPreparedCalls', params: [{ id: 'saved-operation' }] }));
await tick(); const sentRequest = rpcReads.at(-1);
setActiveHostingRealm('eu'); assert(sentRequest.signal.aborted); heldResponse.resolve(); await late; rpcWait = undefined; await tick();
routed = await chooseEmbedded();
await routed.session.walletRpc({ method: 'wallet_getCallsStatus', params: [{ id: 'saved-operation' }] });
assert.equal(rpcReads.at(-1).url, 'https://mossvale.world/api/turnkey/wallet');
assert.throws(() => activeRealmTarget('https://evil.example'), /Unsupported/);
assert.throws(() => setActiveHostingRealm('https://evil.example'), /not open/);
assert.throws(() => configureHosting(createHostingConfig('eu', '', 'http://evil.example')), /HTTPS/);
configureHosting(createHostingConfig('eu')); assert.throws(() => setActiveHostingRealm('asia'), /not open/);
await tick(); clean();
// A newly selected realm configuration may replace the cached proxy session during loading.
routed = await chooseEmbedded();
const changedConfig = openTurnkeyWallet({ ...config, authProxyConfigId: 'proxy-next' });
await tick(); click('Use this wallet');
await changedConfig;
await sessions.at(-1).walletRpc({ method: 'wallet_getCallsStatus', params: [{ id: 'saved-operation' }] });
assert.equal(rpcReads.at(-1).url, 'https://mossvale.world/api/turnkey/wallet', 'the new session adopts its current generation after replacing a different configuration');
window.dispatchEvent(new Event('pagehide')); await tick(); clean();
// Auction connection reuses game SSO without a second login or account-selection gate.
localStorage.removeItem(resetKey); credentials = false;
let beforeAuth = authAttempts;
const previousSubmissions = submitted, previousDialogs = shownDialogs;
const directProvider = await openWallet(config, undefined, { authentication, connect: true });
assert.equal(authAttempts, beforeAuth + 1); clean();
assert.equal(shownDialogs, previousDialogs, 'successful direct connection never flashes a wallet management dialog');
assert.equal(authRequests.at(-1)[0], 'nonce-bound-to-wallet-key'); assert.equal(authRequests.at(-1)[2], undefined, 'automatic SSO never reserves a popup');
assert.deepEqual(await directProvider.request({ method: 'eth_requestAccounts' }), [address]);
assert.equal(signatures, 0); assert.equal(submitted, previousSubmissions, 'opening a wallet cannot submit a financial action');
const directProof = cancelled(directProvider.request({ method: 'personal_sign', params: ['0x6869', address] }));
await tick(); assert(nodes().some(node => node.textContent === 'Review wallet request')); click('Cancel'); await directProof; clean();
assert.equal(signatures, 0, 'direct auction connection retains explicit proof approval');

// Only ordinary expiry renews an already selected provider, never a replaced account/session.
credentials = false; beforeAuth = authAttempts;
assert.deepEqual(await directProvider.request({ method: 'eth_requestAccounts' }), [address]);
assert.equal(authAttempts, beforeAuth + 1); clean();
const currentSession = sessions.at(-1), originalAssert = currentSession.assertIdentity;
currentSession.assertIdentity = async () => { throw Error('The active wallet session changed in another tab.'); };
beforeAuth = authAttempts;
await assert.rejects(directProvider.request({ method: 'eth_requestAccounts' }), /changed in another tab/);
await assert.rejects(directProvider.request({ method: 'eth_sendTransaction', params: [{ from: address, to: recipient, data: '0x', value: '0', chainId: '0x1237' }] }), error => /changed in another tab/.test(error.message) && error.transactionNotSubmitted === true, 'a guard rejection before provider handoff is definitely unsubmitted');
assert.equal(authAttempts, beforeAuth); currentSession.assertIdentity = originalAssert;

// Genuine SSO interaction is the only reason to show a game-session reconnect control.
credentials = false; authFailure = Object.assign(Error('Your game session needs to be reconnected.'), { code: 'WALLET_SSO_INTERACTION_REQUIRED' });
selection = openWallet(config, undefined, { authentication, connect: true });
await tick(); assert(findButton('Reconnect game session')); assert(!nodes().some(node => node.textContent === 'Continue with game account'));
let popupCount = 0;
const popup = { opener: null, close() {} }; window.open = (...args) => {
  assert.deepEqual(args, ['about:blank', '_blank'], 'game-session reconnect must reserve a normal tab for wallet extension side panels');
  popupCount++; return popup;
};
authFailure = undefined; click('Reconnect game session'); await selection; clean();
assert.equal(popupCount, 1); assert.equal(authRequests.at(-1)[2], popup);

// The returned auction provider keeps its caller lifetime after its hidden opener closes.
const auctionLifetime = new AbortController();
const scopedProvider = await openWallet(config, undefined, { authentication, connect: true, signal: auctionLifetime.signal });
const scopedRpc = sessions.at(-1).walletRpc;
const scopedProof = cancelled(scopedProvider.request({ method: 'personal_sign', params: ['0x6869', address] }));
await tick(); assert(nodes().some(node => node.textContent === 'Review wallet request'));
auctionLifetime.abort(); await scopedProof; clean();
await cancelled(scopedProvider.request({ method: 'eth_requestAccounts' }));
await scopedRpc({ method: 'wallet_getCallsStatus', params: [{ id: 'saved-operation' }] });
assert.deepEqual(await directProvider.request({ method: 'eth_requestAccounts' }), [address], 'closing auction provider A leaves an independent selected provider B usable');
assert.equal(signatures, 0); assert.equal(submitted, previousSubmissions);
const renewalLifetime = new AbortController();
const renewalProvider = await openWallet(config, undefined, { authentication, connect: true, signal: renewalLifetime.signal });
credentials = false; const heldRenewal = deferred(); authWait = heldRenewal.promise;
const renewing = assert.rejects(renewalProvider.request({ method: 'eth_sendTransaction', params: [{ from: address, to: recipient, data: '0x', value: '0', chainId: '0x1237' }] }), error => error.code === 4001 && error.transactionNotSubmitted === true, 'cancelled renewal cannot reach the transaction provider');
await tick(); renewalLifetime.abort(); assert.equal(authRequests.at(-1)[1].aborted, true);
heldRenewal.resolve(); await renewing; authWait = undefined;
assert.equal(credentials, false, 'a cancelled renewal cannot adopt a late proof'); assert.equal(signatures, 0); clean();

// Cancelling an in-flight silent exchange cannot restore credentials or return a provider.
credentials = false; const heldAuth = deferred(); authWait = heldAuth.promise;
const opening = new AbortController();
selection = openWallet(config, undefined, { authentication, connect: true, signal: opening.signal }); rejected = cancelled(selection);
await tick(); const cancelledSession = sessions.at(-1); opening.abort(); await rejected; await tick();
assert.equal(authRequests.at(-1)[1].aborted, true);
heldAuth.resolve(); await tick(); authWait = undefined;
assert(cancelledSession.closed); assert.equal(credentials, false); clean();

// Bag reads reuse the singleton and primary account without opening or signing anything.
window.dispatchEvent(new Event('pagehide')); await tick(); localStorage.removeItem(resetKey);
configureHosting(createHostingConfig('eu', 'https://mossvale.world', 'https://us.mossvale.world'));
let bagConfigReads = 0;
globalThis.fetch = async (url, options) => {
  assert.equal(url, 'https://mossvale.world/api/config'); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
  bagConfigReads++; return { ok: true, json: async () => ({ turnkey: config }) };
};
const timers = new Map(), nativeSetTimeout = globalThis.setTimeout, nativeClearTimeout = globalThis.clearTimeout, nativeNow = Date.now;
let clock = nativeNow(), timerId = 0;
globalThis.setTimeout = (callback, delay) => { assert(delay > 0 && delay <= 30000); const id = ++timerId; timers.set(id, { callback, delay }); return id; };
globalThis.clearTimeout = id => timers.delete(id);
Date.now = () => clock;
const nextBalanceRead = async () => { assert.equal(timers.size, 1, 'only one bounded balance refresh is scheduled'); const [id, timer] = timers.entries().next().value; timers.delete(id); clock += timer.delay; timer.callback(); await tick(); };
try {
  const values = [], bag = new AbortController(), dialogsBefore = shownDialogs, signsBefore = signatures, sendsBefore = submitted, authBefore = authAttempts;
  balanceWei = '1234560000000000000000';
  watchTurnkeyMossBalance(value => values.push(value), bag.signal); await tick();
  assert.deepEqual(values, ['1234.56']); assert.equal(balanceReads.at(-1), address);
  assert.equal(authAttempts, authBefore + 1, 'a missing session uses existing silent SSO once');
  assert.equal(shownDialogs, dialogsBefore); assert.equal(signatures, signsBefore); assert.equal(submitted, sendsBefore); clean();
  const sharedSession = sessions.at(-1), readsBefore = balanceReads.length;
  balanceWei = '0'; await nextBalanceRead(); assert.equal(values.at(-1), '0.0', 'a verified empty wallet really displays zero');
  assert.equal(bagConfigReads, 1); assert.equal(authAttempts, authBefore + 1); assert.equal(sessions.at(-1), sharedSession);
  assert.equal(balanceReads.length, readsBefore + 1);
  balanceFailure = Error('RPC unavailable'); await nextBalanceRead(); assert.equal(values.at(-1), null, 'RPC failure never becomes zero'); balanceFailure = undefined;
  document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); assert.equal(timers.size, 0, 'hidden pages stop polling');
  document.hidden = false; document.dispatchEvent(new Event('visibilitychange')); assert.equal(timers.size, 1, 'visibility does not bypass the thirty-second interval');
  const heldBalance = deferred(); balanceWait = heldBalance.promise; await nextBalanceRead();
  document.dispatchEvent(new Event('visibilitychange')); assert.equal(timers.size, 0, 'in-flight reads never overlap');
  bag.abort(); assert.equal(values.at(-1), null); const closedCount = values.length;
  heldBalance.resolve(); await tick(); balanceWait = undefined;
  assert.equal(values.length, closedCount, 'closing bags discards an in-flight response'); assert.equal(timers.size, 0);

  const reopened = new AbortController(), reopenedValues = [], reusedAuth = authAttempts;
  watchTurnkeyMossBalance(value => reopenedValues.push(value), reopened.signal); await tick();
  assert.equal(reopenedValues.at(-1), '0.0'); assert.equal(authAttempts, reusedAuth); assert.equal(sessions.at(-1), sharedSession, 'reopening bags uses the same wallet session');
  const restoredAccounts = sharedSession.accounts;
  sharedSession.accounts = async () => [{ address: recipient, walletId: 'renewed-primary' }]; credentials = false;
  await nextBalanceRead(); assert.equal(authAttempts, reusedAuth + 1);
  assert.equal(balanceReads.at(-1), recipient, 'an expired restored session rechecks its primary account after silent renewal');
  sharedSession.accounts = restoredAccounts;
  const identityRead = deferred(); balanceWait = identityRead.promise; await nextBalanceRead();
  gameIdentity = 'other-account'; identityRead.resolve(); await tick(); balanceWait = undefined;
  assert.equal(reopenedValues.at(-1), null); assert.equal(timers.size, 0, 'account changes terminate the old read loop');
  gameIdentity = 'game-account'; reopened.abort();

  const realmBag = new AbortController(), realmValues = [], heldRealm = deferred(); balanceWait = heldRealm.promise;
  watchTurnkeyMossBalance(value => realmValues.push(value), realmBag.signal); await tick();
  setActiveHostingRealm('us'); const realmCount = realmValues.length;
  heldRealm.resolve(); await tick(); balanceWait = undefined;
  assert.equal(realmValues.at(-1), null); assert.equal(realmValues.length, realmCount); assert.equal(timers.size, 0, 'realm handoff stops bag reads'); realmBag.abort();
  setActiveHostingRealm('eu'); await tick();

  const resetBag = new AbortController(), resetValues = [];
  watchTurnkeyMossBalance(value => resetValues.push(value), resetBag.signal); await tick();
  window.dispatchEvent(new Event('mossvale-wallet-reset')); await tick();
  assert.equal(resetValues.at(-1), null); assert.equal(timers.size, 0, 'game logout clears the displayed balance and scheduled reads'); resetBag.abort();
  credentials = false; authFailure = Object.assign(Error('Reconnect required'), { code: 'WALLET_SSO_INTERACTION_REQUIRED' });
  const noPromptBag = new AbortController(), unavailableValues = [], failedAuthBefore = authAttempts;
  watchTurnkeyMossBalance(value => unavailableValues.push(value), noPromptBag.signal); await tick();
  assert.equal(unavailableValues.at(-1), null); assert.equal(shownDialogs, dialogsBefore);
  await nextBalanceRead(); assert.equal(authAttempts, failedAuthBefore + 1, 'a failed silent sign-in is not retried on every balance tick');
  noPromptBag.abort(); authFailure = undefined; assert.equal(timers.size, 0); clean();
} finally {
  globalThis.setTimeout = nativeSetTimeout; globalThis.clearTimeout = nativeClearTimeout; Date.now = nativeNow;
}

// Arena review preserves the current wallet lifecycle while explaining the exact calldata.
const arenaArtifact = (await import('../public/contracts/MossvaleArena.json', { with: { type: 'json' } })).default;
const arenaCalls = new Interface(arenaArtifact.abi);
const arenaTerms = { matchId: id('wallet-review'), playerA: address, playerB: recipient, stakeWei: parseUnits('100', 18), fundingDeadline: 1800000300, refundAfter: 1800001800 };
const arenaDestination = `0x${'33'.repeat(20)}`;
const reviewText = () => nodes().map(node => node.textContent || '').join('\n');
for (const [method, args, expected] of [
  ['fund', [arenaTerms, '0x'], 'Fund 100.0 MOSS for this 1v1 stake.'],
  ['settle', [arenaTerms, recipient, '0x'], `Pay 190.0 MOSS to winner ${recipient}.`],
  ['settle', [arenaTerms, `0x${'00'.repeat(20)}`, '0x'], 'Return all funded stakes without tax.'],
  ['refund', [arenaTerms], 'Return all funded stakes without tax.'],
]) {
  const transaction = { from: address, to: arenaDestination, data: arenaCalls.encodeFunctionData(method, args), value: '0x0', chainId: 4663 };
  const pending = approveTurnkeyRequest({ transaction }, {}, undefined, arenaDestination);
  assert(reviewText().includes(expected), JSON.stringify({expected, actual:reviewText()}));
  assert(reviewText().includes('Combined pot 200.0 MOSS; winner 190.0 MOSS after 10.0 MOSS tax (5%).'));
  assert(reviewText().includes(`Opponent wallet: ${recipient}.`));
  assert(reviewText().includes(`Contract: ${arenaDestination}`), 'exact destination remains visible');
  assert(reviewText().includes('If both stakes are not funded by then, full refunds become available.'));
  click('Cancel'); await cancelled(pending); clean();
}
const fundData = arenaCalls.encodeFunctionData('fund', [arenaTerms, '0x']);
for (const change of [{ to: recipient }, { from: arenaDestination }, { chainId: 1 }, { value: '0x1' }, { data: `${fundData}00` }]) {
  const pending = approveTurnkeyRequest({ transaction: { from: address, to: arenaDestination, data: fundData, value: '0x0', chainId: 4663, ...change } }, {}, undefined, arenaDestination);
  assert(!reviewText().includes('Fund 100.0 MOSS for this 1v1 stake.'), 'unrecognized inputs keep the full generic review');
  assert(reviewText().includes('Transaction data'));
  click('Cancel'); await cancelled(pending); clean();
}

for (const contract of [undefined, '', 'not-an-address', `0x${'00'.repeat(20)}`]) {
  const pending = approveTurnkeyRequest({ transaction: { from: address, to: arenaDestination, data: fundData, value: '0x0', chainId: 4663 } }, {}, undefined, contract);
  assert(!reviewText().includes('Fund 100.0 MOSS for this 1v1 stake.'), 'missing or invalid trusted arena configuration keeps the generic review');
  click('Cancel'); await cancelled(pending); clean();
}
for (const terms of [
  { ...arenaTerms, stakeWei: 0n }, { ...arenaTerms, stakeWei: 1n << 255n },
  { ...arenaTerms, fundingDeadline: 0 }, { ...arenaTerms, refundAfter: arenaTerms.fundingDeadline },
  { ...arenaTerms, refundAfter: 8640000000001n }, { ...arenaTerms, matchId: `0x${'00'.repeat(32)}` },
  { ...arenaTerms, playerB: address }, { ...arenaTerms, playerB: `0x${'00'.repeat(20)}` }, { ...arenaTerms, playerB: arenaDestination },
]) {
  const pending = approveTurnkeyRequest({ transaction: { from: address, to: arenaDestination, data: arenaCalls.encodeFunctionData('fund', [terms, '0x']), value: '0x0', chainId: 4663 } }, {}, undefined, arenaDestination);
  assert(reviewText().includes('Review wallet request'), 'invalid stake, date or participant terms retain the generic review');
  click('Cancel'); await cancelled(pending); clean();
}
{
  const pending = approveTurnkeyRequest({ transaction: { from: address, to: arenaDestination, data: arenaCalls.encodeFunctionData('settle', [arenaTerms, arenaDestination, '0x']), value: '0x0', chainId: 4663 } }, {}, undefined, arenaDestination);
  assert(reviewText().includes('Review wallet request'), 'an unrelated winner receives no arena payout assurance');
  click('Cancel'); await cancelled(pending); clean();
}
const { createArenaChain } = await import('../src/arena-chain.mjs');
assert.equal(createArenaChain({ contract: '', authorityKey: '', treasury: '' }).contract, undefined, 'unconfigured arenas expose no trusted destination');
assert.equal(createArenaChain({ contract: arenaDestination, treasury: recipient, authorityKey: `0x${'01'.repeat(32)}` }).contract, arenaDestination, 'the existing config returns only the configured public arena address');
console.log('PASS arena wallet review: exact terms, configured destination, participant/stake/date/winner bounds and generic fallback; no transaction sent.');

hook.deregister();
console.log('Turnkey UI checks passed: exact concise auction reviews, tampered purchase rejection, net gold, exact voucher rewards, configured pet mints and guarded full-review fallbacks, generic message/mint review, lazy reset, cross-tab logout, approval cancellation, navigation disposal, reload, explicit sign-out, authenticated Receive, transfer review/cancel, busy navigation guards, paid fee revalidation, post-submission identity changes, inline settings cancellation, backup cleanup, trusted active-realm RPC/config routing, handoff disposal, pending recovery, auth-refresh races and bounded primary-wallet bag balances with silent-only SSO, unknown/zero separation and stale-response guards.');
