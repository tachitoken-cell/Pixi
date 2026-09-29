import { goldStorePrice } from './gold-economy';
import { CHARACTER_CLASSES, type CharacterClass, type ClientMessage, type Player, type ServerMessage } from './shared';
import { BOOST_PRODUCTS, STORE_PRODUCTS, MOBILE_STORE_SKUS, mobileIntentIdValid, storeCosmeticPool, storeProduct, storeRepeatable, type StoreBoostId, type StoreOrder, type StoreState } from './ingame-store';
import { MOSS_TOKEN } from './auction';
import { icon } from './icons';
import { getAccessToken } from './auth';
import { isNativeApp, nativeClient, type NativeProduct, type NativeBillingEvent } from './native-client';
import { chooseWallet, type WalletProvider } from './wallet-provider';

const escape = (text: string) => text.replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[c]!);
const shortWallet = (wallet: string) => `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
const tokenABI = ['function balanceOf(address) view returns(uint256)', 'function allowance(address,address) view returns(uint256)', 'function approve(address,uint256) returns(bool)'];
const storeABI = ['function buy((bytes32 orderId,bytes32 productId,bytes32 characterId,address buyer,uint256 amountWei,uint256 usdCents,uint64 deadline) order,bytes signature)'];
const attemptKey = (characterId: string, orderId: string) => `mossvale-store:${characterId}:${orderId}`;
const boostTime = (endsAt: number, now = Date.now()) => { const seconds = Math.max(0, Math.ceil((endsAt - now) / 1000)); return seconds ? `${Math.floor(seconds / 3600) ? `${Math.floor(seconds / 3600)}h ` : ''}${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s` : 'Expired'; };
const productKind = (product: typeof STORE_PRODUCTS[number]) => product.kind === 'mount' ? 'Mount' : product.kind === 'pet' ? 'Companion pet' : product.kind === 'boost' ? '1 hour · consumable' : product.kind === 'class-change' ? 'One class change' : product.kind === 'sp-item' ? 'Specialist consumable · tradable' : 'Random cosmetic';
export function renderStoreBoosts(player: Pick<Player, 'storeBoosts'>, now = Date.now()): string {
  return BOOST_PRODUCTS.filter(product => (player.storeBoosts?.[product.boostId] || 0) > now).map(product =>
    `<span class="store-hud-boost" title="${escape(product.name)} · ${product.boostId.includes('xp') ? '+50%' : '+20%'}"><span class="sr-only">${escape(product.name)}</span>${icon(product.icon)}<small>${boostTime(player.storeBoosts![product.boostId]!, now)}</small></span>`).join('');
}
type ReviewedTerms = { productId: string; characterId: string; wallet: string; contract: string };

export async function validateStorePayment(order: StoreOrder, terms: ReviewedTerms, now = Date.now()) {
  const { Interface, TypedDataEncoder, getAddress, id, parseUnits, ZeroAddress } = await import('ethers');
  const product = STORE_PRODUCTS.find(product => product.id === terms.productId);
  const equal = (a: string, b: string) => getAddress(a) === getAddress(b);
  if (!product || order.productId !== product.id || order.characterId !== terms.characterId || !equal(order.wallet, terms.wallet)
    || order.usdPrice !== product.usdPrice || order.chainId !== MOSS_TOKEN.chainId || !equal(order.token, MOSS_TOKEN.address)
    || !equal(order.contract, terms.contract) || getAddress(order.contract) === ZeroAddress || !/^0x[\da-f]{130}$/i.test(order.signature)
    || order.status !== 'quoted' || order.reward !== undefined || order.transactionHash || order.paymentBlock !== undefined || !Number.isSafeInteger(order.quotedAt) || order.quotedAt > now + 30_000
    || !Number.isSafeInteger(order.expiresAt) || order.expiresAt <= now || order.expiresAt <= order.quotedAt
    || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(order.id)
    || !/^[1-9]\d*$/.test(order.amountWei) || parseUnits(order.mossAmount, MOSS_TOKEN.decimals) !== BigInt(order.amountWei)) {
    throw Error('The quote changed or expired. Review a fresh MOSS quote before burning.');
  }
  const contractOrder = { orderId: id(`mossvale-store:${order.id}`), productId: id(order.productId), characterId: id(order.characterId), buyer: order.wallet, amountWei: order.amountWei, usdCents: order.usdPrice * 100, deadline: Math.floor(order.expiresAt / 1000) };
  const types = { Order: [{ name: 'orderId', type: 'bytes32' }, { name: 'productId', type: 'bytes32' }, { name: 'characterId', type: 'bytes32' }, { name: 'buyer', type: 'address' }, { name: 'amountWei', type: 'uint256' }, { name: 'usdCents', type: 'uint256' }, { name: 'deadline', type: 'uint64' }] };
  if (order.orderHash !== TypedDataEncoder.hash({ name: 'MossvaleStore', version: '1', chainId: MOSS_TOKEN.chainId, verifyingContract: terms.contract }, types, contractOrder)) throw Error('The signed order does not match this character and reward.');
  const data = new Interface(storeABI).encodeFunctionData('buy', [contractOrder, order.signature]);
  const transaction = order.transaction;
  if (!equal(transaction.to, terms.contract) || transaction.data.toLowerCase() !== data.toLowerCase()
    || BigInt(transaction.value) !== 0n || BigInt(transaction.chainId) !== BigInt(MOSS_TOKEN.chainId)) {
    throw Error('The wallet transaction does not match this MOSS burn. Request a fresh quote.');
  }
  const approvalData = new Interface(tokenABI).encodeFunctionData('approve', [terms.contract, order.amountWei]);
  if (!order.approval || !equal(order.approval.to, MOSS_TOKEN.address) || order.approval.data.toLowerCase() !== approvalData.toLowerCase()
    || BigInt(order.approval.value) !== 0n || BigInt(order.approval.chainId) !== BigInt(MOSS_TOKEN.chainId)) throw Error('The wallet approval does not match the exact MOSS amount.');
  return { to: terms.contract, data, value: '0x0', chainId: `0x${MOSS_TOKEN.chainId.toString(16)}`, approval: { to: MOSS_TOKEN.address, data: approvalData, value: '0x0', chainId: `0x${MOSS_TOKEN.chainId.toString(16)}` } };
}

/** A character-bound burn is reviewed before a separate, explicit wallet action. */
export function mountStoreUI(options: { send: (message: ClientMessage) => void; getPlayer: () => Player | undefined; allowed: () => boolean; onOpen: () => void; trigger: HTMLButtonElement; now?: () => number }) {
  const now = options.now || Date.now;
  const panel = document.createElement('section');
  panel.id = 'store-window'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'false'); panel.setAttribute('aria-labelledby', 'store-title');
  document.body.append(panel);
  options.trigger.setAttribute('aria-controls', panel.id); options.trigger.setAttribute('aria-expanded', 'false');
  let state: StoreState | null = null, category = 'featured', selected: string = STORE_PRODUCTS[0].id;
  let review: StoreOrder | null = null, awaitingQuote: ReviewedTerms | null = null, busy = false, walletBusy = false, session = 0;
  let displayedGold = '', linking = '', message = '', owner = '', previousFocus: HTMLElement | null = null, clockSecond = 0;
  let selectedProvider: WalletProvider | undefined;
  let classChoice: CharacterClass | '' = '', classReview: { orderId: string; characterId: string; fromClass: CharacterClass; className: CharacterClass } | null = null;
  let classPending: { orderId: string; characterId: string } | null = null;
  const attempted = new Map<string, string>();
  const nativeProducts = new Map<string, NativeProduct>();
  let nativePending: { intentId: string; productId: string; characterId: string } | null = null;
  let nativeUnsubscribe: (() => void) | undefined;
  let nativeBusy = false, nativeEvents = 0;
  const nativeResolved = new Set<string>(), nativeRecoveries = new Set<string>();
  const goldPrice = (productId: string) => goldStorePrice(productId, options.getPlayer()?.economyVersion === 1);
  const nativeSku = (productId: string) => MOBILE_STORE_SKUS[productId];
  const catalog = () => STORE_PRODUCTS.filter(product => !isNativeApp() || !!goldPrice(product.id) || !!nativeSku(product.id));
  const classCredits = () => (state?.orders || options.getPlayer()?.storeOrders || []).filter(order => order.characterId === options.getPlayer()?.id && order.productId === 'store-class-change' && ['processed', 'delivered'].includes(order.status) && order.reward?.kind === 'class-change' && order.reward.redeemedAt === undefined && order.reward.className === undefined);
  const query = <T extends HTMLElement = HTMLElement>(selector: string) => panel.querySelector<T>(selector)!;
  const current = () => ({ session, characterId: options.getPlayer()?.id });
  const active = (operation: ReturnType<typeof current>) => operation.session === session && operation.characterId === options.getPlayer()?.id && !panel.hidden && options.allowed();
  const savedNativePending = () => state?.mobileOrders?.find(order => order.status === 'payment-confirmed'
    || order.status === 'pending' && !nativeResolved.has(order.id) && order.expiresAt > now());
  const nativeBlocked = () => !!nativePending || !!savedNativePending();
  const nativeRecovery = () => !!state?.mobileOrders?.some(order => order.status === 'payment-confirmed' || order.status === 'pending' && nativeRecoveries.has(order.id))
    || nativePending?.characterId === owner && nativeRecoveries.has(nativePending.intentId);
  const nativePendingMessage = () => nativeRecovery()
    ? 'Your payment is recorded. Restore purchases to retry delivery, or contact support@mossvale.world. Do not buy it again.'
    : 'A purchase is pending for its original character. Restore purchases to check delivery before buying again.';
  function attempt(order: StoreOrder) { try { return attempted.get(attemptKey(order.characterId, order.id)) || window.localStorage.getItem(attemptKey(order.characterId, order.id)); } catch { return attempted.get(attemptKey(order.characterId, order.id)); } }
  const pendingOrder = (productId: string) => state?.orders.find(order => order.productId === productId
    && !(order.reward?.kind === 'class-change' && order.reward.redeemedAt !== undefined)
    && !['delivered', 'expired'].includes(order.status) && (order.status === 'processed' || order.status === 'submitted' || order.transactionHash || attempt(order)));
  const collection = () => storeCosmeticPool({ ownedMounts: options.getPlayer()?.ownedMounts || [], ownedPets: options.getPlayer()?.ownedPets || [], storePurchases: state?.owned || [] });
  function unavailable(productId: string) {
    const product = storeProduct(productId)!;
    if (product.kind === 'class-change' && classCredits().length) return 'Use your ready class change credit before buying another.';
    if (!storeRepeatable(product) && state?.owned.includes(productId)) return 'This character already owns that reward.';
    if (product.kind === 'gacha' && !collection().length) return 'Cinder collection complete. Every box reward is already owned.';
    const conflict = state?.orders.some(order => !['delivered', 'expired'].includes(order.status) && order.productId !== productId
      && (product.kind === 'gacha' ? ['mount', 'pet'].includes(storeProduct(order.productId)?.kind || '')
        : ['mount', 'pet'].includes(product.kind) && storeProduct(order.productId)?.kind === 'gacha'));
    return conflict ? 'Finish the pending cosmetic purchase before changing the box reward pool.' : '';
  }
  function activate(boostId: StoreBoostId) {
    if (busy || walletBusy || !options.allowed() || !((state?.consumables || options.getPlayer()?.storeConsumables)?.[boostId])) return;
    busy = true; say('Activating your boost…'); render(); options.send({ type: 'storeActivateBoost', boostId });
  }
  function reviewClassChange() {
    const player = options.getPlayer(), credit = classCredits()[0];
    if (busy || walletBusy || classPending || !options.allowed() || !player || !credit && (!goldPrice('store-class-change') || player.gold < goldPrice('store-class-change')) || !classChoice || classChoice === player.appearance.className) return;
    classReview = { orderId: credit?.id || 'gold', characterId: player.id, fromClass: player.appearance.className, className: classChoice };
    render(); query('[data-store-class-apply]')?.focus({ preventScroll: true });
  }
  function applyClassChange() {
    const player = options.getPlayer(), chosen = classReview;
    if (busy || walletBusy || classPending || !options.allowed() || !player || !chosen || selected !== 'store-class-change' || chosen.characterId !== player.id || chosen.fromClass !== player.appearance.className || chosen.className === player.appearance.className || !(chosen.orderId === 'gold' ? goldPrice('store-class-change') > 0 && player.gold >= goldPrice('store-class-change') : classCredits().some(order => order.id === chosen.orderId))) return;
    classPending = { orderId: chosen.orderId, characterId: player.id }; classReview = null;
    say(`Changing to ${chosen.className}…`); render();
    options.send(chosen.orderId === 'gold' ? { type: 'storeBuyClass', className: chosen.className } : { type: 'storeChangeClass', orderId: chosen.orderId, className: chosen.className });
  }
  function remember(order: StoreOrder, value: string) {
    window.localStorage.setItem(attemptKey(order.characterId, order.id), value);
    attempted.set(attemptKey(order.characterId, order.id), value);
  }
  function say(text: string) { message = text; const node = query('#store-status'); if (node) node.textContent = message; }
  function reject(text: string) { busy = false; classPending = null; classReview = null; awaitingQuote = null; linking = ''; say(text); render(); }
  function close() {
    panel.hidden = true; session++; busy = false; linking = ''; awaitingQuote = null; review = null; classReview = null;
    options.trigger.setAttribute('aria-expanded', 'false');
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }
  async function wallet(force=false) {
    if (isNativeApp()) throw Error('Use the app store checkout for mobile purchases.');
    if (force || !selectedProvider) selectedProvider = await chooseWallet();
    return selectedProvider;
  }
  async function checkWallet(provider: Awaited<ReturnType<typeof wallet>>, address: string, chain = false) {
    let accounts: string[] = await provider.request({ method: 'eth_accounts', params: [] });
    if (!accounts.length) accounts = await provider.request({ method: 'eth_requestAccounts', params: [] });
    if (accounts[0]?.toLowerCase() !== address.toLowerCase()) throw Error('Your wallet account changed. Select the linked wallet and review your purchase again.');
    if (chain && BigInt(await provider.request({ method: 'eth_chainId', params: [] })) !== BigInt(MOSS_TOKEN.chainId)) throw Error('Select Robinhood Chain in your wallet and try again.');
  }
  async function connectWallet() {
    if (busy || walletBusy || !options.allowed()) return;
    const operation = current(); walletBusy = true; render();
    try {
      const provider = await wallet(true); if (!active(operation)) return;
      const accounts: string[] = await provider.request({ method: 'eth_requestAccounts', params: [] });
      if (!active(operation)) return;
      if (!accounts[0]) throw Error('No wallet was selected. Connect your wallet again.');
      linking = accounts[0]; busy = true; review = null;
      options.send({ type: 'storeWalletChallenge', wallet: linking }); say('Sign the wallet link to prove ownership. Linking does not burn MOSS.');
    } catch (error) { if (active(operation)) reject(error instanceof Error ? error.message : 'Wallet connection was declined. Try again.'); }
    finally { walletBusy = false; if (active(operation)) render(); }
  }
  async function walletChallenge(challenge: Extract<ServerMessage, { type: 'storeWalletChallenge' }>) {
    if (!linking || walletBusy || panel.hidden || !options.allowed() || challenge.address.toLowerCase() !== linking.toLowerCase() || challenge.expiresAt <= now()) return;
    const operation = current(); walletBusy = true;
    try {
      const provider = await wallet(); if (!active(operation)) return;
      await checkWallet(provider, linking); if (!active(operation)) return;
      const { hexlify, toUtf8Bytes } = await import('ethers'); if (!active(operation)) return;
      const signature = await provider.request({ method: 'personal_sign', params: [hexlify(toUtf8Bytes(challenge.message)), challenge.address] });
      if (active(operation) && challenge.expiresAt > now()) { linking = ''; options.send({ type: 'storeWalletBind', signature }); }
      else if (active(operation)) reject('The wallet link expired. Connect your wallet again.');
    } catch (error) { if (active(operation)) reject(error instanceof Error ? error.message : 'Wallet link was declined. Try again.'); }
    finally { walletBusy = false; if (active(operation)) render(); }
  }
  function requestQuote() {
    if (isNativeApp()) return;
    if (busy || walletBusy || classPending || !state?.enabled || !state.wallet || !state.contract || unavailable(selected) || pendingOrder(selected) || !options.allowed()) return;
    awaitingQuote = { productId: selected, characterId: options.getPlayer()!.id, wallet: state.wallet, contract: state.contract };
    review = null; busy = true; say('Getting the current MOSS price…'); render(); options.send({ type: 'storeQuote', productId: selected });
  }
  async function quote(order: StoreOrder) {
    const terms = awaitingQuote, operation = current();
    if (!terms || order.productId !== terms.productId || panel.hidden) return;
    awaitingQuote = null;
    try {
      await validateStorePayment(order, terms, now()); if (!active(operation)) return;
      if (unavailable(order.productId) || pendingOrder(order.productId)) throw Error('This reward already has a burn in progress. Check delivery before another burn.');
      if (attempt(order)) throw Error('A wallet action already started for this order. Check delivery before starting another burn.');
      if (state) state = { ...state, orders: [...state.orders.filter(existing => existing.id !== order.id && !(existing.productId === order.productId && existing.status === 'expired')), structuredClone(order)] };
      review = structuredClone(order); busy = false; say('Review the exact MOSS amount below. Your wallet opens only when you choose Burn.'); render();
      query('[data-store-burn]')?.focus({ preventScroll: true });
    } catch (error) { if (active(operation)) reject(error instanceof Error ? error.message : 'This quote could not be verified. Try again.'); }
  }
  async function burn() {
    if (busy || walletBusy || !review || !state?.enabled || !state.wallet || pendingOrder(review.productId) || !options.allowed()) return;
    const order = structuredClone(review), operation = current(), address = state.wallet, contract = state.contract!;
    if (attempt(order)) return;
    walletBusy = true; render(); let submitted = false;
    function stillReviewed() {
      if (!active(operation) || review?.id !== order.id || JSON.stringify(review) !== JSON.stringify(order) || selected !== order.productId
        || state?.wallet?.toLowerCase() !== address.toLowerCase() || state.contract !== contract || !state.enabled || unavailable(order.productId) || pendingOrder(order.productId) || order.expiresAt <= now()) throw Error('The purchase or quote changed. Review it again before burning.');
    }
    try {
      const { approval, ...transaction } = await validateStorePayment(order, { productId: selected, characterId: operation.characterId!, wallet: address, contract }, now()); stillReviewed();
      const provider = await wallet(); stillReviewed();
      if (BigInt(await provider.request({ method: 'eth_chainId', params: [] })) !== BigInt(MOSS_TOKEN.chainId)) {
        stillReviewed();
        try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: transaction.chainId }] }); }
        catch (error) {
          if ((error as { code?: number }).code !== 4902) throw error;
          stillReviewed(); await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: transaction.chainId, chainName: 'Robinhood Chain', rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'], blockExplorerUrls: ['https://robinhoodchain.blockscout.com'], nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 } }] });
          stillReviewed(); await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: transaction.chainId }] });
        }
      }
      stillReviewed(); await checkWallet(provider, address, true); stillReviewed();
      const { Interface } = await import('ethers'), abi = new Interface(tokenABI);
      const readToken = async (name: 'balanceOf' | 'allowance') => abi.decodeFunctionResult(name, await provider.request({ method: 'eth_call', params: [{ to: MOSS_TOKEN.address, data: abi.encodeFunctionData(name, name === 'balanceOf' ? [address] : [address, contract]) }, 'latest'] }))[0] as bigint;
      if (await readToken('balanceOf') < BigInt(order.amountWei)) throw Error('Your linked wallet does not have enough MOSS for this reward.');
      if (await readToken('allowance') < BigInt(order.amountWei)) {
        stillReviewed(); await checkWallet(provider, address, true); stillReviewed();
        say(`Approve exactly ${order.mossAmount} MOSS, then confirm the burn. ETH pays both network fees.`);
        const approvalHash = await provider.request({ method: 'eth_sendTransaction', params: [{ ...approval, from: address }] });
        if (typeof approvalHash !== 'string' || !/^0x[\da-f]{64}$/i.test(approvalHash)) throw Error('Your wallet did not return an approval receipt. Check wallet activity and try again.');
        say('Approval sent. Waiting for confirmation before the burn…');
        let receipt;
        while (!receipt) {
          stillReviewed(); receipt = await provider.request({ method: 'eth_getTransactionReceipt', params: [approvalHash] });
          if (!receipt) await new Promise(resolve => setTimeout(resolve, 2000));
        }
        if (BigInt(receipt.status) !== 1n) throw Error('The MOSS approval failed. Review the quote to try again.');
        stillReviewed(); await checkWallet(provider, address, true); stillReviewed();
        if (await readToken('balanceOf') < BigInt(order.amountWei) || await readToken('allowance') < BigInt(order.amountWei)) throw Error('Your MOSS balance or approval changed. Review the purchase again.');
      }
      stillReviewed(); await checkWallet(provider, address, true); stillReviewed();
      // Save before opening the wallet: uncertain wallet errors must not offer a second burn.
      remember(order, 'wallet-pending');
      say(`Confirm burning ${order.mossAmount} MOSS in your wallet. ETH pays the network fee.`);
      const hash = await provider.request({ method: 'eth_sendTransaction', params: [{ ...transaction, from: address }] });
      if (typeof hash !== 'string' || !/^0x[\da-f]{64}$/i.test(hash)) throw Error('The wallet did not return a transaction hash. Check your wallet activity before continuing.');
      submitted = true;
      // Persist the hash even if the window closed or character changed while the wallet was open.
      attempted.set(attemptKey(order.characterId, order.id), hash);
      try { remember(order, hash); } catch { /* The in-memory receipt still allows a status check. */ }
      if (options.allowed() && options.getPlayer()?.id === order.characterId) options.send({ type: 'storePaymentCheck', orderId: order.id, transactionHash: hash });
      if (active(operation)) { review = null; say('Burn sent. Checking chain confirmation; your reward will arrive after confirmation.'); }
    } catch (error) {
      const value = error as { code?: number | string; message?: string; error?: { code?: number | string }; info?: { error?: { code?: number | string } } };
      const declined = [value.code, value.error?.code, value.info?.error?.code].some(code => code === 4001 || code === '4001' || code === 'ACTION_REJECTED');
      if (declined && !submitted) { attempted.delete(attemptKey(order.characterId, order.id)); try { window.localStorage.removeItem(attemptKey(order.characterId, order.id)); } catch { /* The rejected wallet action did not send a burn. */ } }
      if (active(operation)) reject(value.message || 'The wallet action could not finish. Check delivery and your wallet activity.');
    } finally { walletBusy = false; if (active(operation)) render(); }
  }
  function check(order: StoreOrder) {
    if (busy || walletBusy || !options.allowed()) return;
    const stored = attempt(order), transactionHash = stored?.startsWith('0x') ? stored : order.transactionHash;
    busy = true; say(order.productId === 'store-class-change' ? 'Checking your payment and class change credit…' : order.status === 'processed' ? 'Checking your burn and reward delivery…' : 'Checking the burn and reward delivery…'); render();
    options.send({ type: 'storePaymentCheck', orderId: order.id, ...(transactionHash ? { transactionHash } : {}) });
  }
  async function loadNativeProducts() {
    const client = nativeClient(), operation = current();
    if (!client) { if (isNativeApp() && !panel.hidden) say('Connecting to the app store…'); return; }
    try {
      const result = await client.request('billing.products', { productIds: STORE_PRODUCTS.map(product => nativeSku(product.id)).filter(Boolean) }) as { products?: NativeProduct[] };
      if (!Array.isArray(result.products)) throw Error('The store did not return its products.');
      if (!active(operation)) return;
      nativeProducts.clear();
      for (const product of result.products) if (STORE_PRODUCTS.some(item => nativeSku(item.id) === product.productId) && typeof product.displayPrice === 'string') nativeProducts.set(product.productId, product);
      if (!nativeProducts.size) say('Purchases are not available in this store yet.');
    } catch (error) { if (active(operation)) say(error instanceof Error ? error.message : 'The app store is unavailable.'); }
    finally { if (active(operation)) render(); }
  }
  async function buyNative() {
    const client = nativeClient(), operation = current(), productId = selected;
    if (!client || !nativeSku(productId) || busy || walletBusy || nativeBusy || nativeBlocked() || !state?.mobile?.[client.platform] || !options.allowed() || unavailable(productId) || !nativeProducts.has(nativeSku(productId))) return;
    nativeBusy = true; render(); say('Preparing checkout…');
    let intentId: string | undefined, dispatched = false, accessToken: string | undefined, abandon = false;
    try {
      accessToken = await getAccessToken();
      if (!accessToken || !active(operation)) throw Error('Sign in again before buying.');
      const response = await fetch('/api/mobile-purchases/intents', { method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, characterId: operation.characterId, platform: client.platform }), signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      if (!response.ok) throw Error(typeof result.error === 'string' ? result.error : 'Checkout is unavailable.');
      if (!mobileIntentIdValid(result.intentId) || result.productId !== nativeSku(productId)) throw Error('The checkout does not match this item.');
      intentId = result.intentId;
      if (!active(operation)) { abandon = true; nativeResolved.add(result.intentId); return; }
      if (selected !== productId || !state?.mobile?.[client.platform] || unavailable(productId)
        || state.mobileOrders?.some(order => order.id !== result.intentId && (order.status === 'payment-confirmed' || order.status === 'pending' && !nativeResolved.has(order.id) && order.expiresAt > now()))) throw Error('The reward or your selection changed. Review it again before buying.');
      nativePending = { intentId: result.intentId, productId, characterId: operation.characterId! };
      dispatched = true;
      await client.request('billing.purchase', { intentId: result.intentId, productId: result.productId, accessToken });
      if (active(operation) && nativePending?.intentId === result.intentId) say('Confirm the purchase in your app store.');
    } catch (error) {
      // 4201 is emitted only before the native store purchase call starts.
      if (!dispatched && intentId) { abandon = true; nativeResolved.add(intentId); }
      if ((error as { code?: number }).code === 4201 && nativePending && nativePending.intentId === intentId) { abandon = true; nativeResolved.add(nativePending.intentId); nativePending = null; }
      if (active(operation)) say(error instanceof Error ? error.message : 'Checkout could not open.');
    } finally {
      if (abandon && intentId && accessToken) {
        try {
          const response = await fetch('/api/mobile-purchases/abandon', { method: 'POST', redirect: 'error',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ intentId }), signal: AbortSignal.timeout(15000) });
          if (!response.ok) throw Error('Checkout could not be dismissed.');
        } catch { if (active(operation)) say('Checkout did not open. Restore purchases to check any pending payment.'); }
      }
      nativeBusy = false; render();
    }
  }
  async function restoreNative() {
    const client = nativeClient(), operation = current();
    if (!client || busy || nativeBusy || !options.allowed()) return;
    const eventsBefore = nativeEvents;
    nativeBusy = true; say('Checking unfinished purchases…'); render();
    try {
      const accessToken = await getAccessToken();
      if (!accessToken || !active(operation)) throw Error('Sign in again to restore purchases.');
      await client.request('billing.restore', { accessToken });
      if (active(operation)) { options.send({ type: 'storeOpen' }); if (nativeEvents === eventsBefore) say('Restore check requested. Confirmed rewards are saved to their original character.'); }
    } catch (error) { if (active(operation)) say(error instanceof Error ? error.message : 'Purchases could not be checked.'); }
    finally { nativeBusy = false; render(); }
  }
  function nativeBillingEvent(event: NativeBillingEvent) {
    if (event.type !== 'billing') return;
    nativeEvents++;
    const pending = nativePending;
    const matches = !!pending && (event.intentId === pending.intentId || !event.intentId && event.productId === nativeSku(pending.productId));
    const intentId = event.intentId || (matches ? pending!.intentId : undefined);
    if (intentId && ['delivered', 'refunded', 'cancelled'].includes(event.status)) { nativeResolved.add(intentId); nativeRecoveries.delete(intentId); if (matches) nativePending = null; }
    if (intentId && event.code === 'PURCHASE_RECOVERY_REQUIRED') nativeRecoveries.add(intentId);
    if (options.allowed() && owner === options.getPlayer()?.id && (!pending || pending.characterId === owner)) {
      if (event.status === 'delivered') { busy = true; options.send({ type: 'storeOpen' }); say('Purchase delivered to its original character.'); }
      else if (event.message) say(event.message);
      if (event.status === 'refunded' || event.status === 'cancelled') options.send({ type: 'storeOpen' });
      if (event.code === 'PURCHASE_RECOVERY_REQUIRED') options.send({ type: 'storeOpen' });
      if (nativeRecovery()) say(nativePendingMessage());
    } else if (matches && ['delivered', 'refunded', 'cancelled'].includes(event.status) && options.allowed() && owner === options.getPlayer()?.id) {
      say(event.status === 'delivered' ? 'Purchase delivered to its original character.' : event.status === 'refunded' ? 'This purchase was refunded or revoked.' : 'Purchase cancelled.');
    }
    render();
  }
  function subscribeNative() {
    nativeUnsubscribe?.(); nativeUnsubscribe = nativeClient()?.subscribe(nativeBillingEvent);
    if (!panel.hidden) void loadNativeProducts();
  }
  if (isNativeApp()) { window.addEventListener('mossvale-native-ready', subscribeNative); subscribeNative(); }
  function render() {
    if (panel.hidden) return;
    const availableProducts = catalog();
    if (!availableProducts.some(product => product.id === selected)) { selected = availableProducts[0].id; category = 'featured'; classReview = null; }
    const product = availableProducts.find(product => product.id === selected)!, player = options.getPlayer();
    const credits = classCredits(), cost = goldPrice(product.id);
    displayedGold = `${player?.economyVersion}:${player?.gold}`;
    if (classChoice === player?.appearance?.className) { classChoice = ''; classReview = null; }
    if (classReview && (classReview.characterId !== player?.id || classReview.fromClass !== player.appearance.className || !(classReview.orderId === 'gold' ? cost > 0 : credits.some(order => order.id === classReview!.orderId)))) classReview = null;
    const owned = !storeRepeatable(product) && state?.owned.includes(selected), pending = pendingOrder(selected), provisional = pending?.status === 'processed' && !storeRepeatable(product);
    const unavailableReason = unavailable(selected), pool = collection();
    const boosts = state?.boosts || player?.storeBoosts || {}, consumables = state?.consumables || player?.storeConsumables || {};
    const boost = product.kind === 'boost' ? product : null, charges = boost ? consumables[boost.boostId] || 0 : 0;
    const activeBoosts = BOOST_PRODUCTS.filter(item => (boosts[item.boostId] || 0) > now());
    const latestReward = [...(state?.orders || []).map(order => ({ ...order, createdAt: order.quotedAt })), ...(state?.mobileOrders || [])].filter(order => order.productId === selected && order.status === 'delivered').sort((a, b) => (b.reward?.grantedAt || b.createdAt) - (a.reward?.grantedAt || a.createdAt))[0]?.reward;
    const boxReward = latestReward?.kind === 'cosmetic' ? storeProduct(latestReward.productId) : null;
    const reviewing = review?.productId === selected && !pending && !owned ? review : null;
    const expired = !!reviewing && reviewing.expiresAt <= now();
    const focus = document.activeElement instanceof HTMLElement && panel.contains(document.activeElement) ? document.activeElement.getAttribute('data-store-focus') : null;
    const products = availableProducts.filter(product => category === 'featured' || product.kind === category);
    const native = isNativeApp(), client = nativeClient(), nativeProduct = nativeProducts.get(nativeSku(selected));
    const blocked = busy || walletBusy || !!classPending || native && (nativeBusy || nativeBlocked());
    const nativeReady = !!client && !!state?.mobile?.[client.platform] && !!nativeProduct;
    const price = (item: typeof STORE_PRODUCTS[number]) => goldPrice(item.id) ? `${goldPrice(item.id).toLocaleString('en-US')} gold` : native ? escape(nativeProducts.get(nativeSku(item.id))?.displayPrice || 'Unavailable') : `$${item.usdPrice} <small>of MOSS</small>`;
    const nativeCheckout = owned ? `<span class="store-delivered">${icon('check')} Owned</span>` : unavailableReason ? `<strong>Unavailable</strong><small>${escape(unavailableReason)}</small>`
      : `<strong class="store-amount">${price(product)}</strong><button type="button" data-store-native-buy data-store-focus="native-buy" ${blocked || !nativeReady ? 'disabled' : ''}>${nativeRecovery() ? 'Contact support' : nativeBlocked() ? 'Delivery pending' : nativeBusy ? 'Opening checkout…' : 'Buy for this character'}</button><small>Confirm the price in ${client?.platform === 'apple' ? 'the App Store' : 'Google Play'}. No MOSS is burned.</small>`;
    panel.innerHTML = `<header class="store-heading"><span class="store-seal" aria-hidden="true">${icon('ember')}</span><div><h2 id="store-title">Ingame store</h2><p>Boost your adventures. Collect companions.</p></div><button type="button" data-store-close data-store-focus="close" aria-label="Close ingame store">${icon('close')}</button></header>
      <div class="store-layout"><aside class="store-sidebar"><nav aria-label="Store categories">${[['featured','All items','spark'],['boost','Boosts','potion'],['gacha','Boxes','dice'],['mount','Mounts','travel'],['pet','Pets','leaf'],...(!native?[['sp-item','Specialists','crystal']]:[]),...(!native || goldPrice('store-class-change') ? [['class-change','Class','book']] : [])].map(([id,name,art]) => `<button type="button" data-store-category="${id}" data-store-focus="category-${id}" aria-pressed="${category === id}" ${walletBusy || classPending ? 'disabled' : ''}>${icon(art)}<span>${name}</span><small class="store-category-count">${id==='featured'?availableProducts.length:availableProducts.filter(item=>item.kind===id).length}</small></button>`).join('')}</nav><div class="store-balance"><strong>Your balance</strong><span>${icon('gold')}${(player?.gold||0).toLocaleString('en-US')} gold</span><small>${native?'App-store prices appear before confirmation.':'Exact MOSS prices appear at review.'}</small></div><div class="store-sidebar-note">${icon('ember')}<strong>Leave your mark</strong><p>${player?.economyVersion === 1 ? 'Spend gold on boosts and class changes. Premium cosmetics belong to this character.' : native ? 'Pay through your app store. Your reward belongs to this character.' : 'MOSS is permanently burned. Your reward belongs to this character.'}</p></div></aside>
      <div class="store-main"><div class="store-collection-heading"><h3>${category === 'featured' ? 'The Cinder Collection' : category === 'mount' ? 'Special mounts' : category === 'pet' ? 'Special pets' : category === 'boost' ? 'Adventure boosts' : category === 'gacha' ? 'Cosmetic boxes' : category === 'sp-item' ? 'Specialist supplies' : 'Change your class'}</h3><span>${products.length} ${products.length === 1 ? 'reward' : 'rewards'}</span></div>
      ${activeBoosts.length ? `<div class="store-active-boosts" aria-label="Active boosts">${activeBoosts.map(item => `<span>${icon(item.icon)}<span>${escape(item.name)} <strong data-store-boost-timer="${item.boostId}">${boostTime(boosts[item.boostId]!, now())}</strong></span></span>`).join('')}</div>` : ''}
      <div class="store-products">${products.map(item => `<button type="button" class="store-product${storeRepeatable(item) ? ' store-consumable-product' : ''}" data-store-product="${item.id}" data-store-focus="product-${item.id}" aria-pressed="${selected === item.id}" ${walletBusy || classPending ? 'disabled' : ''}>${item.kind === 'class-change' && credits.length ? `<span class="store-owned">${credits.length} ready</span>` : state?.owned.includes(item.id) ? `<span class="store-owned">${icon('check')} ${state.orders.some(order => order.productId === item.id && order.status === 'processed') ? 'Temporary' : 'Owned'}</span>` : item.kind === 'boost' && consumables[item.boostId] ? `<span class="store-owned">${consumables[item.boostId]} ready</span>` : ''}<span class="store-product-art">${item.icon.startsWith('/') ? `<img src="${escape(item.icon)}" alt="" draggable="false" decoding="async">` : icon(item.icon)}</span><strong>${escape(item.name)}</strong><span class="store-kind">${productKind(item)}</span><span class="store-price">${price(item)}</span></button>`).join('')}</div>
      ${cost && !pending ? `<div class="store-wallet"><span>Gameplay services use your character’s gold.</span>${native ? `<button type="button" data-store-native-restore data-store-focus="native-restore" ${busy || nativeBusy ? 'disabled' : ''}>Restore purchases</button>` : ''}</div>` : native ? `<div class="store-wallet"><span>Rewards are saved to the character selected at checkout.</span><button type="button" data-store-native-restore data-store-focus="native-restore" ${busy || nativeBusy ? 'disabled' : ''}>Restore purchases</button></div>` : `<div class="store-wallet"><span>${state?.wallet ? `Linked wallet <strong>${escape(shortWallet(state.wallet))}</strong>` : 'Link your wallet to see the exact MOSS amount.'}</span><button type="button" data-store-wallet data-store-focus="wallet" ${blocked || !state?.enabled ? 'disabled' : ''}>${state?.wallet ? 'Change wallet' : 'Link wallet'}</button></div>`}</div></div>
      <footer class="store-footer"><div class="store-selected-art" aria-hidden="true">${product.icon.startsWith('/')?`<img src="${escape(product.icon)}" alt="" draggable="false">`:icon(product.icon)}</div><div class="store-detail"><h3>${escape(product.name)}</h3><p>${escape(cost && product.kind === 'class-change' ? `Spend ${cost.toLocaleString('en-US')} gold for one class change. Keep your level, progress and items. Training and talents reset; your previous gear stays in your inventory or bank.` : native && product.kind === 'gacha' ? product.description.replace('Opens after the burn is processed.', 'Opens after payment is confirmed.') : product.description)}</p><small>${owned ? provisional ? 'In your collection · checking payment' : 'In your collection' : `For ${escape(player?.name || 'this character')} · ${product.kind === 'mount' ? 'Riding training required' : product.kind === 'pet' ? 'Cosmetic companion' : product.kind === 'boost' ? 'Same boost adds time, not power' : product.kind === 'class-change' ? cost ? 'Choose and confirm your new class below' : 'Choose your new class after payment is verified' : 'Character-bound collection'}`}</small>
      ${boost ? `<div class="store-activation"><span><strong>${charges} ready</strong>${(boosts[boost.boostId] || 0) > now() ? ` · Active <strong data-store-boost-timer="${boost.boostId}">${boostTime(boosts[boost.boostId]!, now())}</strong>` : ' · Activate when ready'}</span><button type="button" data-store-activate="${boost.boostId}" data-store-focus="activate" ${blocked || !charges ? 'disabled' : ''}>${(boosts[boost.boostId] || 0) > now() ? 'Add 1 hour' : 'Activate 1 hour'}</button></div>` : ''}
      ${(!native || cost) && product.kind === 'class-change' ? `<section class="store-class-change" aria-label="Use class change"><strong>${credits.length} class change${credits.length === 1 ? '' : 's'} ready</strong><p>${credits.length ? 'Your paid credit stays here until used. Using it needs no wallet transaction.' : cost ? `Choose a different class, then review the ${cost.toLocaleString('en-US')} gold cost.` : 'After payment is verified, choose a different class and confirm here.'}</p>${credits.length || cost ? classReview ? `<p class="store-class-warning">Change ${escape(player?.name || 'this character')} from <strong>${classReview.fromClass}</strong> to <strong>${classReview.className}</strong>? This ${classReview.orderId === 'gold' ? `spends ${cost.toLocaleString('en-US')} gold` : 'uses one credit'} and resets your trained abilities and talent choices.</p><div class="store-class-actions"><button type="button" data-store-class-cancel data-store-focus="class-cancel" ${blocked ? 'disabled' : ''}>Back</button><button type="button" data-store-class-apply data-store-focus="class-apply" ${blocked ? 'disabled' : ''}>Confirm ${classReview.className} class change</button></div>` : `<div class="store-class-options" role="group" aria-label="New class">${CHARACTER_CLASSES.map(className => `<button type="button" data-store-class="${className}" data-store-focus="class-${className}" aria-pressed="${classChoice === className}" ${blocked || player?.appearance?.className === className ? 'disabled' : ''}>${className}${player?.appearance?.className === className ? ' · Current' : ''}</button>`).join('')}</div><button type="button" data-store-class-review data-store-focus="class-review" ${blocked || !classChoice || !credits.length && (player?.gold || 0) < cost ? 'disabled' : ''}>${classPending ? 'Changing class…' : 'Review class change'}</button>` : ''}</section>` : ''}
      ${product.kind === 'gacha' ? `<details class="store-odds" open><summary>Possible rewards · ${pool.length ? `1 in ${pool.length} each` : 'collection complete'}</summary><ul>${pool.map(item => `<li>${escape(item.name)} · 1/${pool.length}${item.kind === 'mount' ? ' · riding required' : ''}</li>`).join('')}</ul><p>Owned rewards are removed from the pool. Every remaining reward has the same chance.</p></details>${boxReward ? `<p class="store-box-result">Last box: <strong>${escape(boxReward.name)}</strong> added to your collection.</p>` : ''}` : ''}</div><div class="store-purchase">${cost && !pending ? `<strong class="store-amount">${cost.toLocaleString('en-US')} gold</strong><small>You have ${(player?.gold || 0).toLocaleString('en-US')} gold.</small>${product.kind === 'boost' ? `<button type="button" data-store-gold-buy data-store-focus="gold-buy" ${blocked || (player?.gold || 0) < cost ? 'disabled' : ''}>Buy 1 hour · ${cost} gold</button><small>Delivered as a charge. Activate when ready.</small>` : `<small>${credits.length ? 'Your existing paid credit is used first, at no gold cost.' : 'Select a class and review the change.'}</small>`}` : native ? nativeCheckout : product.kind === 'class-change' && credits.length ? `<strong>${credits.length} paid credit${credits.length === 1 ? '' : 's'} ready</strong><small>Select your new class to use a credit. No additional MOSS burn.</small>` : provisional ? `<strong>Temporary reward</strong><button type="button" data-store-check="${pending.id}" data-store-focus="check" ${blocked ? 'disabled' : ''}>${blocked ? 'Checking…' : 'Check delivery'}</button><small>Checking this saved payment before completing delivery.</small>` : owned ? `<span class="store-delivered">${icon('check')} Owned</span>` : pending ? `<strong>${product.kind === 'class-change' ? 'Checking payment' : pending.status === 'processed' ? 'Checking payment' : 'Delivery pending'}</strong><button type="button" data-store-check="${pending.id}" data-store-focus="check" ${blocked ? 'disabled' : ''}>${blocked ? 'Checking…' : 'Check delivery'}</button><small>${product.kind === 'class-change' ? 'Available after payment is verified.' : storeRepeatable(product) ? 'Available after the burn is processed.' : 'Check your wallet activity before another burn.'}</small>` : unavailableReason && !owned ? `<strong>${product.kind === 'gacha' && !pool.length ? 'Collection complete' : 'Purchase pending'}</strong><small>${escape(unavailableReason)}</small>` : reviewing ? `<strong class="store-amount">${escape(reviewing.mossAmount)} MOSS</strong><small>$${reviewing.usdPrice} USD · <span id="store-expiry">${expired ? 'Quote expired' : `${Math.max(0, Math.ceil((reviewing.expiresAt - now()) / 1000))}s left`}</span> · ETH gas extra</small><button type="button" ${expired ? 'data-store-quote' : 'data-store-burn'} data-store-focus="${expired ? 'quote' : 'burn'}" ${blocked ? 'disabled' : ''}>${walletBusy ? 'Confirm in wallet…' : expired ? 'Refresh MOSS quote' : `Burn ${escape(reviewing.mossAmount)} MOSS`}</button><small>This burn is permanent.</small>` : `<strong class="store-amount">$${product.usdPrice} <span>of MOSS</span></strong><button type="button" data-store-quote data-store-focus="quote" ${blocked || !state?.enabled || !state.wallet ? 'disabled' : ''}>${busy ? 'Getting quote…' : 'Review MOSS burn'}</button><small>Exact amount shown before confirmation.</small>`}</div></footer>
      <p id="store-status" role="status" aria-live="polite">${escape(message || (native ? nativeReady ? 'Select a reward, then confirm checkout in your app store.' : 'App store purchases are not available yet.' : state?.reason || 'Select a reward, then review its MOSS burn.'))}</p>${native && nativeRecovery() ? '<a href="mailto:support@mossvale.world">Contact purchase support</a>' : ''}`;
    query('[data-store-close]').onclick = close;
    query('[data-store-wallet]')?.addEventListener('click', () => void connectWallet());
    query('[data-store-native-buy]')?.addEventListener('click', () => void buyNative());
    query('[data-store-native-restore]')?.addEventListener('click', () => void restoreNative());
    query('[data-store-quote]')?.addEventListener('click', requestQuote);
    query('[data-store-gold-buy]')?.addEventListener('click', () => {
      if (busy || walletBusy || classPending || selected !== product.id || product.kind !== 'boost' || !goldPrice(product.id) || !options.allowed() || (options.getPlayer()?.gold || 0) < cost) return;
      busy = true; say(`Buying ${product.name} for ${cost} gold…`); render(); options.send({ type: 'storeBuyBoost', boostId: product.boostId });
    });
    query('[data-store-burn]')?.addEventListener('click', () => void burn());
    query('[data-store-class-review]')?.addEventListener('click', reviewClassChange);
    query('[data-store-class-apply]')?.addEventListener('click', applyClassChange);
    query('[data-store-class-cancel]')?.addEventListener('click', () => { classReview = null; render(); });
    panel.querySelectorAll<HTMLButtonElement>('[data-store-class]').forEach(button => button.onclick = () => {
      const choice = button.dataset.storeClass as CharacterClass;
      if (blocked || !CHARACTER_CLASSES.includes(choice) || choice === options.getPlayer()?.appearance.className) return;
      classChoice = choice; classReview = null; render();
    });
    const activateButton = query<HTMLButtonElement>('[data-store-activate]'); if (activateButton && boost) activateButton.onclick = () => activate(boost.boostId);
    const checkButton = query<HTMLButtonElement>('[data-store-check]'); if (checkButton && pending) checkButton.onclick = () => check(pending);
    panel.querySelectorAll<HTMLButtonElement>('[data-store-category]').forEach(button => button.onclick = () => {
      if (walletBusy || classPending) return; classReview = null; category = button.dataset.storeCategory!;
      if (category !== 'featured' && product.kind !== category) { selected = availableProducts.find(item => item.kind === category)!.id; review = null; awaitingQuote = null; busy = false; }
      render();
    });
    panel.querySelectorAll<HTMLButtonElement>('[data-store-product]').forEach(button => button.onclick = () => {
      if (walletBusy || classPending) return; classReview = null; selected = button.dataset.storeProduct!; review = null; awaitingQuote = null; busy = false; render();
    });
    if (focus) query(`[data-store-focus="${focus}"]`)?.focus({ preventScroll: true });
  }
  function open() {
    if (!options.allowed()) return;
    if (!panel.hidden) { close(); return; }
    const characterId = options.getPlayer()!.id;
    if (owner !== characterId) { state = null; owner = characterId; selected = STORE_PRODUCTS[0].id; category = 'featured'; classChoice = ''; classReview = null; classPending = null; }
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    options.onOpen(); panel.hidden = false; busy = true; review = null; message = 'Loading the store…'; render();
    options.trigger.setAttribute('aria-expanded', 'true'); query('[data-store-close]').focus({ preventScroll: true });
    options.send({ type: 'storeOpen' });
    if (isNativeApp()) void loadNativeProducts();
  }
  function update(next: StoreState, status?: string) {
    if (!options.allowed() || owner !== options.getPlayer()?.id) return;
    const previousOrder = state?.orders.slice().reverse().find(order => order.productId === selected), nextOrder = next.orders.slice().reverse().find(order => order.productId === selected);
    const revoked = state?.owned.includes(selected) && !next.owned.includes(selected);
    const previousNativeIntent = nativePending?.characterId === owner ? nativePending.intentId : savedNativePending()?.id;
    state = next;
    if (classPending && (classPending.characterId !== owner || classPending.orderId !== 'gold' && !classCredits().some(order => order.id === classPending!.orderId))) { classPending = null; classReview = null; classChoice = ''; }
    for (const order of next.mobileOrders || []) if (['delivered', 'refunded', 'abandoned'].includes(order.status)) {
      nativeResolved.add(order.id); nativeRecoveries.delete(order.id);
      if (nativePending?.characterId === owner && nativePending.intentId === order.id) nativePending = null;
    }
    if (awaitingQuote && (next.wallet?.toLowerCase() !== awaitingQuote.wallet.toLowerCase() || unavailable(awaitingQuote.productId) || pendingOrder(awaitingQuote.productId) || !next.enabled)) awaitingQuote = null;
    busy = !!awaitingQuote || !!linking;
    if (classPending?.orderId === 'gold' && status) classPending = null;
    if (review && (next.wallet?.toLowerCase() !== review.wallet.toLowerCase() || unavailable(review.productId) || pendingOrder(review.productId) || !next.enabled)) review = null;
    for (const order of next.orders) {
      if (order.status === 'delivered' || order.status === 'expired') { attempted.delete(attemptKey(order.characterId, order.id)); try { window.localStorage.removeItem(attemptKey(order.characterId, order.id)); } catch { /* Settlement is authoritative even when local storage is unavailable. */ } }
    }
    if (isNativeApp()) {
      if (nativeRecovery()) message = nativePendingMessage();
      else if (status) message = status;
      else if (previousNativeIntent && next.mobileOrders?.some(order => order.id === previousNativeIntent && order.status === 'delivered')) message = 'Purchase delivered to its original character.';
      else if (previousNativeIntent && next.mobileOrders?.some(order => order.id === previousNativeIntent && order.status === 'refunded')) message = 'This purchase was refunded or revoked.';
      else if (previousNativeIntent && next.mobileOrders?.some(order => order.id === previousNativeIntent && order.status === 'abandoned')) message = 'Checkout closed. Restore purchases to check for a delayed payment.';
      else if (message === 'Loading the store…') message = nativeBlocked() ? nativePendingMessage() : options.getPlayer()?.economyVersion === 1 ? 'Choose a reward. Boosts and class changes use gold.' : 'Select a reward, then confirm checkout in your app store.';
    } else if (status || next.reason) message = status || next.reason!;
    else if (revoked) message = 'The temporary reward was removed because its burn is no longer confirmed.';
    else if (selected === 'store-class-change' && classCredits().length) message = classPending ? 'Changing your class…' : 'Payment verified. Your class change credit is ready to use.';
    else if (nextOrder?.reward?.kind === 'class-change' && nextOrder.reward.redeemedAt !== undefined) message = `Class change complete. You are now a ${nextOrder.reward.className}.`;
    else if (nextOrder?.productId === 'store-class-change' && ['submitted', 'processed'].includes(nextOrder.status)) message = 'Your class change payment is being checked. The credit is not available yet.';
    else if (nextOrder?.status === 'processed') message = storeRepeatable(storeProduct(nextOrder.productId)!) ? 'Your burn is included. Checking reward delivery.' : 'Your saved reward is awaiting payment verification.';
    else if (previousOrder?.status !== 'delivered' && nextOrder?.status === 'delivered') message = nextOrder.reward?.kind === 'boost' ? 'Burn processed. Your boost is ready to activate.' : 'Burn processed. Your reward is permanently in your collection.';
    else if (message === 'Loading the store…' || message.startsWith('Sign the wallet link')) message = options.getPlayer()?.economyVersion === 1 ? 'Choose a reward. Boosts and class changes use gold.' : next.wallet ? 'Wallet linked. Choose a reward to review its MOSS burn.' : 'Select a reward, then link your wallet.';
    render();
  }
  panel.addEventListener('pointerdown', () => options.onOpen());
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); close(); } event.stopPropagation(); });
  panel.addEventListener('contextmenu', event => event.preventDefault());
  return { open, close, update, quote, walletChallenge, isOpen: () => !panel.hidden,
    reset() { close(); state = null; owner = ''; classPending = null; classChoice = ''; },
    reject(text: string, requestType?: string) { if (requestType?.startsWith('store') && (!panel.hidden || requestType === 'storeChangeClass')) reject(text); },
    refresh() {
      if (panel.hidden) return; if (!options.allowed() || owner !== options.getPlayer()?.id) { close(); return; }
      if (displayedGold !== `${options.getPlayer()?.economyVersion}:${options.getPlayer()?.gold}`) render();
      const second = Math.floor(now() / 1000);
      if (second !== clockSecond) {
        clockSecond = second;
        panel.querySelectorAll<HTMLElement>('[data-store-boost-timer]').forEach(node => { node.textContent = boostTime((state?.boosts || options.getPlayer()?.storeBoosts)?.[node.dataset.storeBoostTimer as StoreBoostId] || 0, now()); });
        if (!review) return;
        if (review.expiresAt <= now()) { if (query('[data-store-burn]')) render(); }
        else { const expiry = query('#store-expiry'); if (expiry) expiry.textContent = `${Math.ceil((review.expiresAt - now()) / 1000)}s left`; }
      }
    },
  };
}
