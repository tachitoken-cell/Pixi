import * as NativeIAP from 'expo-iap';
import type { Purchase, PurchaseAndroid, PurchaseIOS } from 'expo-iap';
import { Platform } from 'react-native';

export const BILLING_PRODUCT_IDS = [
  'world.mossvale.game.store_embermane',
  'world.mossvale.game.store_cinderfang',
  'world.mossvale.game.store_ashwing',
  'world.mossvale.game.store_cinder_kit',
  'world.mossvale.game.store_profession_xp',
  'world.mossvale.game.store_combat_xp',
  'world.mossvale.game.store_damage',
  'world.mossvale.game.store_defense',
  'world.mossvale.game.store_cosmetic_box',
] as const;

export type BillingProduct = {
  productId: string; title: string; description: string;
  displayPrice: string; currency: string; price: number | null;
};
export type BillingVerification = {
  platform: 'apple' | 'google'; intentId: string; productId: string;
  transactionId?: string; purchaseToken?: string;
};
export type BillingEvent = {
  status: 'pending' | 'delivered' | 'refunded' | 'cancelled' | 'error';
  intentId?: string; productId?: string; code?: string; message?: string;
};
type BillingSDK = Pick<typeof NativeIAP, 'initConnection' | 'endConnection' | 'purchaseUpdatedListener'
  | 'purchaseErrorListener' | 'fetchProducts' | 'requestPurchase' | 'getAvailablePurchases'
  | 'getPendingTransactionsIOS' | 'finishTransaction'>;
type Options = {
  verifyPurchase: (purchase: BillingVerification) => Promise<{ delivered: true } | { refunded: true }>;
  onEvent: (event: BillingEvent) => void;
  sdk?: BillingSDK;
  platform?: string;
};

const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value);
const saleProduct = (value: unknown): value is string => typeof value === 'string'
  && (BILLING_PRODUCT_IDS as readonly string[]).includes(value);
// Retired purchases must still finish receipt recovery and refunds.
const knownProduct = (value: unknown): value is string => saleProduct(value) || value === 'world.mossvale.game.burned';
const cancelled = (error: unknown) => (error as { code?: unknown } | null)?.code === 'user-cancelled';

/** Store receipts carry their original intent; mutable screen state never supplies ownership. */
export function createNativeBilling({ verifyPurchase, onEvent, sdk = NativeIAP, platform = Platform.OS }: Options) {
  let active = false, connected = false, generation = 0, requesting = false;
  let starting: Promise<void> | undefined, ending = Promise.resolve();
  let checkout: { intentId: string; productId: string } | undefined;
  let subscriptions: { remove(): void }[] = [];
  const processing = new Map<string, Promise<void>>(), finished = new Set<string>();
  const live = (epoch: number) => active && epoch === generation;
  const emit = (event: BillingEvent, epoch = generation) => {
    if (!live(epoch)) return;
    // A detached WebView callback must not change payment finalization.
    try { onEvent(event); } catch { /* The backend remains the delivery authority. */ }
  };
  const unsubscribe = () => { for (const subscription of subscriptions) subscription.remove(); subscriptions = []; };

  async function receive(purchase: Purchase, epoch = generation): Promise<void> {
    try { await starting; } catch { return; }
    if (!live(epoch) || !connected) return;
    const productId = knownProduct(purchase.productId) ? purchase.productId : undefined;
    const apple = platform === 'ios', receipt = purchase as PurchaseIOS & PurchaseAndroid;
    const binding = apple ? receipt.appAccountToken : receipt.obfuscatedAccountIdAndroid;
    if (!productId || purchase.store !== (apple ? 'apple' : 'google') || !uuid(binding)
      || purchase.quantity !== 1 || (apple ? receipt.appBundleIdIOS && receipt.appBundleIdIOS !== 'world.mossvale.game'
        : receipt.packageNameAndroid && receipt.packageNameAndroid !== 'world.mossvale.game')) {
      emit({ status: 'error', productId, code: 'INVALID_RECEIPT', message: 'This purchase could not be linked to its original character.' }, epoch);
      return;
    }
    const identity = { intentId: binding.toLowerCase(), productId };
    if (checkout?.intentId === identity.intentId) checkout = undefined;
    if (purchase.purchaseState === 'pending') {
      emit({ status: 'pending', ...identity, code: 'PAYMENT_PENDING', message: 'Your store payment is pending.' }, epoch);
      return;
    }
    if (purchase.purchaseState !== 'purchased') {
      emit({ status: 'error', ...identity, code: 'PAYMENT_UNAVAILABLE', message: 'The store has not confirmed this purchase.' }, epoch);
      return;
    }
    const transactionId = apple ? receipt.transactionId : undefined;
    const purchaseToken = apple ? undefined : receipt.purchaseToken;
    if (apple ? typeof transactionId !== 'string' || !/^\d{1,64}$/.test(transactionId)
      : typeof purchaseToken !== 'string' || !purchaseToken.length || purchaseToken.length > 16384 || /\s/.test(purchaseToken)) {
      emit({ status: 'error', ...identity, code: 'INVALID_RECEIPT', message: 'The store did not return a valid purchase receipt.' }, epoch);
      return;
    }
    const key = `${purchase.store}:${transactionId ?? purchaseToken}`;
    if (finished.has(key)) return;
    const operationKey = `${epoch}:${key}`;
    if (processing.has(operationKey)) return processing.get(operationKey);
    const proof: BillingVerification = apple
      ? { platform: 'apple', ...identity, transactionId: transactionId! }
      : { platform: 'google', ...identity, purchaseToken: purchaseToken! };
    const operation = (async () => {
      emit({ status: 'pending', ...identity, code: 'DELIVERY_PENDING', message: 'Confirming your purchase with Mossvale…' }, epoch);
      let refunded = false;
      try {
        const result = await verifyPurchase(proof);
        refunded = 'refunded' in result && result.refunded === true;
        if (!refunded && (!('delivered' in result) || result.delivered !== true)) throw Error('Delivery not confirmed');
      } catch (error) {
        if ((error as { code?: unknown })?.code === 'PURCHASE_RECOVERY_REQUIRED') {
          emit({ status: 'error', ...identity, code: 'PURCHASE_RECOVERY_REQUIRED', message: 'Your payment is recorded and needs help with delivery. Contact Mossvale support before purchasing again.' }, epoch);
          return;
        }
        emit({ status: 'pending', ...identity, code: 'VERIFICATION_PENDING', message: 'Delivery is pending. Reconnect or restore purchases to retry.' }, epoch);
        return;
      }
      if (!live(epoch)) return; // Restore will safely reverify an already delivered receipt next time.
      try {
        // Every SKU is consumable because its reward can be bought for another character.
        await sdk.finishTransaction({ purchase, isConsumable: true });
        finished.add(key);
        emit(refunded ? { status: 'refunded', ...identity, code: 'PURCHASE_REFUNDED', message: 'This purchase was refunded or revoked.' } : { status: 'delivered', ...identity }, epoch);
      } catch {
        emit(refunded ? { status: 'refunded', ...identity, code: 'PURCHASE_REFUNDED', message: 'This purchase was refunded or revoked.' }
          : { status: 'pending', ...identity, code: 'FINALIZATION_PENDING', message: 'Your reward was delivered. Restore purchases to finish store confirmation.' }, epoch);
      }
    })();
    processing.set(operationKey, operation);
    try { await operation; } finally { if (processing.get(operationKey) === operation) processing.delete(operationKey); }
  }

  async function start(): Promise<void> {
    if (active && connected) return;
    if (active && starting) return starting.catch(() => { throw Error('The app store is unavailable. Try again shortly.'); });
    if (platform !== 'ios' && platform !== 'android') throw Error('Purchases require the Mossvale iOS or Android app.');
    active = true;
    const epoch = ++generation;
    const operation = (async () => {
      await ending;
      if (!live(epoch)) return;
      subscriptions = [];
      subscriptions.push(sdk.purchaseUpdatedListener(purchase => { void receive(purchase, epoch); }, { dedupeTransactionIOS: false }));
      subscriptions.push(sdk.purchaseErrorListener(error => {
          const identity = checkout && (!error.productId || error.productId === checkout.productId) ? checkout : undefined;
          if (identity) checkout = undefined;
          emit({ status: cancelled(error) ? 'cancelled' : 'error',
            productId: knownProduct(error.productId) ? error.productId : undefined, ...identity,
            code: cancelled(error) ? 'USER_CANCELLED' : 'PURCHASE_FAILED',
            message: cancelled(error) ? 'Purchase cancelled.' : 'The store could not complete the purchase. Try again.' }, epoch);
      }));
      if (!await sdk.initConnection()) throw Error('Store connection unavailable');
      if (live(epoch)) connected = true;
    })();
    starting = operation;
    try { await operation; }
    catch {
      if (live(epoch)) {
        emit({ status: 'error', code: 'STORE_UNAVAILABLE', message: 'The app store is unavailable. Try again shortly.' }, epoch);
        unsubscribe(); active = false; connected = false;
        await sdk.endConnection().catch(() => {});
      }
      throw Error('The app store is unavailable. Try again shortly.');
    } finally { if (starting === operation) starting = undefined; }
  }

  async function stop(): Promise<void> {
    active = false; connected = false; generation++;
    checkout = undefined;
    unsubscribe();
    ending = Promise.all([ending.catch(() => {}), Promise.resolve(starting).catch(() => {})]).then(async () => { await sdk.endConnection(); });
    try { await ending; } catch { ending = Promise.resolve(); throw Error('The store connection could not close.'); }
  }

  async function getProducts(productIds: string[]): Promise<BillingProduct[]> {
    if (!Array.isArray(productIds) || productIds.length > BILLING_PRODUCT_IDS.length || !productIds.every(saleProduct)) throw Error('Unknown store product.');
    const skus = [...new Set(productIds)];
    if (!skus.length) return [];
    await start();
    if (!active || !connected) throw Error('The store connection closed.');
    try {
      const products = await sdk.fetchProducts({ skus, type: 'in-app' });
      return (products || []).filter(product => skus.includes(product.id) && product.type === 'in-app').map(product => ({
        productId: product.id, title: product.title, description: product.description,
        displayPrice: product.displayPrice, currency: product.currency, price: product.price ?? null,
      }));
    } catch { throw Error('Store prices are unavailable. Try again shortly.'); }
  }

  async function purchase({ intentId, productId }: { intentId: string; productId: string }): Promise<void> {
    if (!uuid(intentId) || !saleProduct(productId)) throw Error('This purchase needs a valid Mossvale purchase intent.');
    if (requesting || checkout) throw Error('Finish the open store purchase first.');
    requesting = true;
    let epoch = generation;
    try {
      await start();
      epoch = generation;
      if (!active || !connected) throw Error('The store connection closed.');
      checkout = { intentId: intentId.toLowerCase(), productId };
      await sdk.requestPurchase({ type: 'in-app', request: platform === 'ios'
        ? { apple: { sku: productId, appAccountToken: intentId, quantity: 1, andDangerouslyFinishTransactionAutomatically: false } }
        : { google: { skus: [productId], obfuscatedAccountId: intentId } } });
    } catch (error) {
      if (live(epoch) && checkout?.intentId === intentId.toLowerCase()) checkout = undefined;
      emit({ status: cancelled(error) ? 'cancelled' : 'error', intentId, productId,
        code: cancelled(error) ? 'USER_CANCELLED' : 'PURCHASE_FAILED',
        message: cancelled(error) ? 'Purchase cancelled.' : 'The store could not open this purchase. Try again.' }, epoch);
      throw Error(cancelled(error) ? 'Purchase cancelled.' : 'The store could not open this purchase. Try again.');
    } finally { requesting = false; }
  }

  async function restore(): Promise<void> {
    await start();
    const epoch = generation;
    if (!live(epoch) || !connected) return;
    let purchases: Purchase[];
    try {
      purchases = platform === 'ios' ? await sdk.getPendingTransactionsIOS()
        : await sdk.getAvailablePurchases();
    } catch { throw Error('Pending purchases are unavailable. Try again shortly.'); }
    await Promise.all(purchases.map(receipt => receive(receipt, epoch)));
  }

  return { start, stop, getProducts, purchase, restore, retryPending: restore };
}
