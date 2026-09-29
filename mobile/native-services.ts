import { BILLING_PRODUCT_IDS, createNativeBilling, type BillingEvent, type BillingVerification } from './billing';
import { NativeError, fields, requireActive, type NativeRequest } from './native-bridge';
import { createAuthSessionService } from './auth-session';

export function createNativeServices(options: { request: typeof fetch; onEvent: (event: BillingEvent) => void; configuredAuth?: () => { issuer: string; clientId: string } | undefined }) {
  const auth = createAuthSessionService({ configuredAuth: options.configuredAuth || (() => undefined) });
  let authorization: { token: string; origin: string } | undefined;
  let epoch = 0;
  let closing = Promise.resolve();
  const requests = new Set<AbortController>();
  function clear() {
    authorization = undefined; epoch++;
    for (const request of requests) request.abort(); requests.clear();
    closing = billing.stop().catch(() => {});
  }
  function authorize(value: unknown, origin: string) {
    if (value === null) { clear(); return; }
    if (typeof value !== 'string' || value.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) throw new NativeError(4100, 'Sign in to use the store.');
    if (authorization?.token === value && authorization.origin === origin) return;
    if (authorization && (authorization.token !== value || authorization.origin !== origin)) clear();
    authorization = { token: value, origin };
  }
  async function verifyPurchase(purchase: BillingVerification): Promise<{ delivered: true } | { refunded: true }> {
    const auth = authorization, generation = epoch;
    if (!auth) throw new NativeError(4100, 'Sign in to finish delivering your purchase.');
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000);
    requests.add(controller);
    try {
      const response = await options.request(auth.origin + '/api/mobile-purchases/verify', {
        method: 'POST', redirect: 'error', signal: controller.signal, headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(purchase),
      });
      const result: unknown = await response.json();
      if (controller.signal.aborted || epoch !== generation || !authorization || authorization.origin !== auth.origin) throw new NativeError(4000, 'Delivery is pending. Restore purchases to check again.');
      if (!response.ok) {
        if (response.status === 409 && result && typeof result === 'object'
            && (result as { code?: unknown }).code === 'PURCHASE_REFUNDED'
            && (result as { refunded?: unknown }).refunded === true && (result as { delivered?: unknown }).delivered === false) return { refunded: true };
        if (result && typeof result === 'object' && (result as { code?: unknown }).code === 'PURCHASE_RECOVERY_REQUIRED') throw Object.assign(Error('This paid purchase needs support to restore its original reward.'), { code: 'PURCHASE_RECOVERY_REQUIRED' });
        throw new NativeError(4000, 'Delivery is pending. Sign in and restore purchases to check again.');
      }
      if (!result || typeof result !== 'object' || (result as { delivered?: unknown }).delivered !== true) throw new NativeError(4000, 'Delivery is pending. Restore purchases to check again.');
      return { delivered: true };
    } finally { clearTimeout(timeout); requests.delete(controller); }
  }
  async function publishEvent(event: BillingEvent) {
    const auth = authorization, generation = epoch;
    if (!auth) return;
    if (event.status === 'cancelled' && event.intentId) {
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
      requests.add(controller);
      try {
        // Dismissal releases the checkout reservation; the durable intent still accepts late payment.
        const response = await options.request(auth.origin + '/api/mobile-purchases/abandon', {
          method: 'POST', redirect: 'error', signal: controller.signal,
          headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ intentId: event.intentId }),
        });
        if (!response.ok) throw Error('Checkout dismissal was not confirmed.');
      } catch { event = { ...event, message: 'Checkout closed. Restore purchases to check for any pending payment.' }; }
      finally { clearTimeout(timeout); requests.delete(controller); }
    }
    if (epoch === generation && authorization === auth) {
      try { options.onEvent(event); } catch { /* UI errors cannot change durable payment state. */ }
    }
  }
  const billing = createNativeBilling({ verifyPurchase, onEvent: event => { void publishEvent(event); } });
  async function execute({ method, params, signal, url }: NativeRequest): Promise<unknown> {
    requireActive(signal);
    switch (method) {
      case 'auth.restore': case 'auth.save': case 'auth.clear':
        return auth.execute({ method, params, signal, url });
      case 'billing.authorize':
        fields(params, ['accessToken']); authorize(params.accessToken, url.origin);
        if (params.accessToken !== null) { await billing.start(); requireActive(signal); await billing.retryPending(); }
        return { authorized: params.accessToken !== null };
      case 'billing.products': {
        fields(params, ['productIds']);
        if (!Array.isArray(params.productIds) || params.productIds.length > BILLING_PRODUCT_IDS.length || params.productIds.some(id => typeof id !== 'string' || !(BILLING_PRODUCT_IDS as readonly string[]).includes(id))) throw new NativeError(-32602, 'Unknown store products.');
        await billing.start(); requireActive(signal); return { products: await billing.getProducts(params.productIds as string[]) };
      }
      case 'billing.purchase': {
        try {
          fields(params, ['intentId', 'productId', 'accessToken']);
          if (typeof params.intentId !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(params.intentId) || typeof params.productId !== 'string' || !(BILLING_PRODUCT_IDS as readonly string[]).includes(params.productId)) throw new NativeError(-32602, 'Invalid store purchase.');
          if (params.accessToken === null) throw new NativeError(4100, 'Sign in to use the store.');
          authorize(params.accessToken, url.origin); await billing.start(); requireActive(signal);
        } catch (cause) {
          throw new NativeError(4201, cause instanceof NativeError ? cause.message : 'Checkout could not open. Please try again.');
        }
        // Once dispatched, an error may be uncertain: preserve its pending purchase until reconciliation.
        await billing.purchase({ intentId: params.intentId as string, productId: params.productId as string }); return { pending: true };
      }
      case 'billing.restore':
        fields(params, ['accessToken']);
        if (params.accessToken === null) throw new NativeError(4100, 'Sign in to restore purchases.');
        authorize(params.accessToken, url.origin); await billing.start(); requireActive(signal); await billing.restore(); return { checked: true };
    }
  }
  return { execute, clear, accessToken(origin: string) {
    if (!authorization || authorization.origin !== origin) throw new NativeError(4100, 'Sign in to connect your voucher wallet.');
    return authorization.token;
  }, stop: async () => { clear(); await closing; } };
}
