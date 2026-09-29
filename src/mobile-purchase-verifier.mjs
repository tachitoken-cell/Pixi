import { createHash, createPrivateKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SignJWT, createRemoteJWKSet, jwtVerify } from 'jose';
import { AppStoreServerAPIClient, Environment, SignedDataVerifier } from '@apple/app-store-server-library';

export const MOBILE_APP_ID = 'world.mossvale.game';
const uuid = value => typeof value === 'string' && /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value);
const failure = (message, status = 400) => Object.assign(Error(message), { status });
const receiptId = token => createHash('sha256').update(token).digest('hex');

// Only store-authenticated data reaches this function, never decoded client JSON.
export function validateMobileReceipt(data, expected, platform, sandboxAllowed = false, now = Date.now(), acceptRevoked = false) {
  const apple = platform === 'apple';
  if (!uuid(expected.intentId) || !['apple', 'google'].includes(platform)) throw failure('Invalid mobile purchase.');
  const line = !apple && data.productLineItem?.length === 1 ? data.productLineItem[0] : undefined;
  const productId = apple ? data.productId : line?.productId;
  const intentId = apple ? data.appAccountToken : data.obfuscatedExternalAccountId;
  const purchasedAt = apple ? data.purchaseDate : Date.parse(data.purchaseCompletionTime);
  const sandbox = apple ? data.environment === Environment.SANDBOX : Object.hasOwn(data, 'testPurchaseContext');
  if (intentId?.toLowerCase() !== expected.intentId.toLowerCase() || productId !== expected.productId
      || !Number.isSafeInteger(purchasedAt) || purchasedAt < expected.createdAt - 30000 || purchasedAt > now + 30000
      || sandbox && !sandboxAllowed) throw failure('This purchase does not match the account and checkout.');
  if (apple) {
    if (data.bundleId !== MOBILE_APP_ID || data.transactionId !== expected.transactionId || data.type !== 'Consumable'
        || data.inAppOwnershipType !== 'PURCHASED' || data.quantity !== 1
        || ![Environment.PRODUCTION, Environment.SANDBOX].includes(data.environment)) throw failure('Invalid App Store purchase.');
    if (data.revocationDate !== undefined && (!acceptRevoked || !Number.isSafeInteger(data.revocationDate) || data.revocationDate < purchasedAt)) throw failure('This App Store purchase was refunded or revoked.', 409);
  } else {
    if (data.purchaseStateContext?.purchaseState !== 'PURCHASED' && !(acceptRevoked && data.purchaseStateContext?.purchaseState === 'CANCELLED' && line?.productOfferDetails?.refundableQuantity === 0)) throw failure('This Google Play purchase is pending or cancelled.', 409);
    if (line?.productOfferDetails?.quantity !== 1 || line.productOfferDetails.refundableQuantity !== 1 && !(acceptRevoked && line.productOfferDetails.refundableQuantity === 0)) throw failure('Invalid or refunded Google Play purchase.');
  }
  return { platform, productId, intentId: expected.intentId, purchasedAt,
    paymentId: apple ? data.transactionId : receiptId(expected.purchaseToken), sandbox,
    ...(apple ? data.revocationDate === undefined ? {} : { refunded: true, revokedAt: data.revocationDate } : line.productOfferDetails.refundableQuantity === 0 ? { refunded: true, revokedAt: now } : {}) };
}

export function createMobilePurchaseVerifier({ env = process.env, request = fetch, appleStores, googlePushKeys } = {}) {
  const sandboxAccounts = new Set((env.MOBILE_PURCHASE_SANDBOX_ACCOUNTS || '').split(',').map(value => value.trim()).filter(Boolean));
  if ([...sandboxAccounts].some(value => !/^[\da-f]{64}$/.test(value))) throw Error('Invalid mobile purchase sandbox accounts.');
  let apple, google, googleAccess, refreshingGoogle;
  if (env.APPLE_IAP_PRIVATE_KEY || env.APPLE_IAP_KEY_ID || env.APPLE_IAP_ISSUER_ID) {
    if (!env.APPLE_IAP_PRIVATE_KEY || !/^[A-Z0-9]{10}$/.test(env.APPLE_IAP_KEY_ID || '') || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(env.APPLE_IAP_ISSUER_ID || '')) throw Error('App Store purchase verification is incompletely configured.');
    try {
      const key = createPrivateKey(env.APPLE_IAP_PRIVATE_KEY);
      if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw Error();
    } catch { throw Error('Invalid App Store purchase signing key configuration.'); }
    const roots = ['AppleIncRootCertificate.cer', 'AppleRootCA-G2.cer', 'AppleRootCA-G3.cer']
      .map(name => readFileSync(new URL(`../config/apple-pki/${name}`, import.meta.url)));
    apple = new Map([Environment.PRODUCTION, Environment.SANDBOX].map(environment => [environment, {
      client: new AppStoreServerAPIClient(env.APPLE_IAP_PRIVATE_KEY, env.APPLE_IAP_KEY_ID, env.APPLE_IAP_ISSUER_ID, MOBILE_APP_ID, environment),
      verifier: new SignedDataVerifier(roots, true, environment, MOBILE_APP_ID, 6811825860),
    }]));
  }
  if (env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) {
    try {
      const value = JSON.parse(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);
      if (value.type !== 'service_account' || !/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(value.client_email)) throw Error();
      const key = createPrivateKey(value.private_key);
      if (key.asymmetricKeyType !== 'rsa') throw Error();
      google = { email: value.client_email, key };
    } catch { throw Error('Invalid Google Play purchase service account configuration.'); }
  }
  if (appleStores) apple = appleStores; // Injectable official-client boundary for offline verification tests.
  const googleKeys = googlePushKeys || createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
  async function json(url, options) {
    const response = await request(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw failure('The store could not verify this payment. Please retry.', response.status === 404 || response.status === 410 ? 404 : 503);
    const body = await response.text();
    if (body.length > 65536) throw failure('Invalid store verification response.', 503);
    try { return JSON.parse(body); } catch { throw failure('Invalid store verification response.', 503); }
  }
  async function googleToken() {
    if (googleAccess?.expiresAt > Date.now() + 60000) return googleAccess.token;
    if (refreshingGoogle) return refreshingGoogle;
    refreshingGoogle = (async () => {
      const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/androidpublisher' })
        .setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuer(google.email)
        .setAudience('https://oauth2.googleapis.com/token').setIssuedAt().setExpirationTime('5m').sign(google.key);
      const result = await json('https://oauth2.googleapis.com/token', { method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString() });
      if (typeof result.access_token !== 'string' || !result.access_token || result.token_type?.toLowerCase() !== 'bearer'
          || !Number.isFinite(result.expires_in) || result.expires_in <= 0) throw failure('Google Play authentication is unavailable.', 503);
      googleAccess = { token: result.access_token, expiresAt: Date.now() + Math.min(result.expires_in, 3600) * 1000 };
      return googleAccess.token;
    })().finally(() => { refreshingGoogle = undefined; });
    return refreshingGoogle;
  }
  const googlePurchase = async token => json(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${MOBILE_APP_ID}/purchases/productsv2/tokens/${encodeURIComponent(token)}`, { headers: { Authorization: `Bearer ${await googleToken()}` } });
  return {
    status: () => ({ apple: !!apple, google: !!google }),
    sandboxAllowed: accountKey => sandboxAccounts.has(accountKey),
    refundStatus: () => ({ apple: !!apple, google: !!google && !!env.GOOGLE_RTDN_AUDIENCE && !!env.GOOGLE_RTDN_EMAIL && !!env.GOOGLE_RTDN_SUBSCRIPTION }),
    async notification(platform, body, authorization) {
      if (platform === 'apple') {
        if (!apple || typeof body?.signedPayload !== 'string' || body.signedPayload.length > 60000) throw failure('Invalid Apple notification.', 400);
        let notice, store;
        for (const environment of [Environment.PRODUCTION, Environment.SANDBOX]) {
          try { store = apple.get(environment); notice = await store.verifier.verifyAndDecodeNotification(body.signedPayload); break; } catch { /* Try the other cryptographically checked environment. */ }
        }
        if (!notice || notice.version !== '2.0' || typeof notice.notificationUUID !== 'string' || notice.notificationUUID.length > 100
            || !Number.isSafeInteger(notice.signedDate) || notice.signedDate > Date.now() + 300000) throw failure('Invalid Apple notification.', 400);
        const eventId = 'apple:' + notice.notificationUUID;
        if (notice.notificationType === 'TEST') return { eventId, kind: 'ignored', platform, at: notice.signedDate };
        if (!notice.data?.signedTransactionInfo) return { eventId, kind: 'ignored', platform, at: notice.signedDate };
        const data = await store.verifier.verifyAndDecodeTransaction(notice.data.signedTransactionInfo);
        const expected = { intentId: data.appAccountToken?.toLowerCase(), productId: data.productId, transactionId: data.transactionId, createdAt: 0 };
        const receipt = validateMobileReceipt(data, expected, 'apple', true, Date.now(), true);
        // REFUND_REVERSED needs an audited recovery decision; an old notification
        // must never automatically reinstate an already revoked entitlement.
        const kind = receipt.refunded ? 'refund' : ['REFUND_REVERSED', 'CONSUMPTION_REQUEST'].includes(notice.notificationType) ? 'review' : notice.notificationType === 'ONE_TIME_CHARGE' ? 'payment' : 'ignored';
        if (['REFUND', 'REVOKE'].includes(notice.notificationType) && !receipt.refunded) throw failure('Apple revocation lacks verified revocation data.');
        return { ...receipt, eventId, kind, at: receipt.revokedAt || notice.signedDate };
      }
      if (platform !== 'google' || !google || !env.GOOGLE_RTDN_AUDIENCE || !env.GOOGLE_RTDN_EMAIL || !env.GOOGLE_RTDN_SUBSCRIPTION) throw failure('Google notifications are not configured.', 503);
      if (typeof authorization !== 'string' || !/^Bearer [\w.-]+$/.test(authorization) || authorization.length > 8192) throw failure('Invalid Google notification authorization.', 401);
      let claims;
      try { ({ payload: claims } = await jwtVerify(authorization.slice(7), googleKeys, { algorithms: ['RS256'], issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: env.GOOGLE_RTDN_AUDIENCE, maxTokenAge: '1h', clockTolerance: 30, requiredClaims: ['exp', 'iat', 'email', 'email_verified'] })); }
      catch { throw failure('Invalid Google notification authorization.', 401); }
      if (claims.email !== env.GOOGLE_RTDN_EMAIL || claims.email_verified !== true) throw failure('Invalid Google notification identity.', 401);
      if (body?.subscription !== env.GOOGLE_RTDN_SUBSCRIPTION || !/^\d{1,100}$/.test(body?.message?.messageId || '')
          || typeof body?.message?.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.message.data) || body.message.data.length > 50000) throw failure('Invalid Google notification envelope.');
      let data; try { data = JSON.parse(Buffer.from(body.message.data, 'base64').toString('utf8')); } catch { throw failure('Invalid Google notification data.'); }
      if (data.packageName !== MOBILE_APP_ID || !/^\d{1,16}$/.test(data.eventTimeMillis || '') || Number(data.eventTimeMillis) > Date.now() + 300000) throw failure('Invalid Google notification app/time.');
      const eventId = 'google:' + body.message.messageId, at = Number(data.eventTimeMillis);
      if (data.testNotification) return { eventId, platform, kind: 'ignored', at };
      if (data.pendingRefundReviewNotification) {
        const intentId = data.pendingRefundReviewNotification.obfuscatedAccountId?.toLowerCase();
        return { eventId, platform, kind: 'review', at, ...(uuid(intentId) ? { intentId } : {}) };
      }
      const notice = data.oneTimeProductNotification || data.voidedPurchaseNotification;
      if (!notice || data.voidedPurchaseNotification && notice.productType !== 2) return { eventId, platform, kind: 'ignored', at };
      if (typeof notice.purchaseToken !== 'string' || !/^[\x21-\x7e]{1,4096}$/.test(notice.purchaseToken)) throw failure('Invalid Google purchase token.');
      // Always refresh state for ordinary RTDN. A signed full-void notification
      // also remains authoritative if an old consumed purchase is no longer queryable.
      let purchase;
      try { purchase = await googlePurchase(notice.purchaseToken); }
      catch (error) { if (error.status !== 404 || !data.voidedPurchaseNotification || notice.refundType !== 1) throw error; }
      if (purchase) {
        const expected = { intentId: purchase.obfuscatedExternalAccountId?.toLowerCase(), productId: purchase.productLineItem?.[0]?.productId, purchaseToken: notice.purchaseToken, createdAt: 0 };
        if (notice.sku !== undefined && notice.sku !== expected.productId) throw failure('Google notification product mismatch.');
        if (purchase.purchaseStateContext?.purchaseState === 'CANCELLED' && !purchase.purchaseCompletionTime) return { eventId, platform, kind: 'ignored', at };
        const receipt = validateMobileReceipt(purchase, expected, 'google', true, Date.now(), true);
        return { ...receipt, eventId, kind: data.voidedPurchaseNotification && notice.refundType === 1 || receipt.refunded ? 'refund' : 'payment', at };
      }
      return { eventId, platform, paymentId: receiptId(notice.purchaseToken), kind: 'refund', at };
    },
    async voidedPage({ start, end, token }) {
      if (!google) throw failure('Google purchases are not configured.', 503);
      const params = new URLSearchParams({ startTime: String(start), endTime: String(end), type: '0', includeQuantityBasedPartialRefund: 'true', maxResults: '100' });
      if (token) params.set('token', token);
      const response = await json(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${MOBILE_APP_ID}/purchases/voidedpurchases?${params}`, { headers: { Authorization: `Bearer ${await googleToken()}` } });
      const rows = response.voidedPurchases || [];
      if (!Array.isArray(rows) || rows.length > 1000) throw failure('Invalid voided purchase page.', 503);
      const events = rows.map(row => {
        if (typeof row.purchaseToken !== 'string' || !/^[\x21-\x7e]{1,4096}$/.test(row.purchaseToken) || !/^\d{1,16}$/.test(row.voidedTimeMillis || '')
            || row.voidedQuantity !== undefined && row.voidedQuantity !== 1) throw failure('Invalid voided purchase.', 503);
        const paymentId = receiptId(row.purchaseToken), at = Number(row.voidedTimeMillis);
        return { eventId: `google-void:${paymentId}:${at}`, platform: 'google', paymentId, kind: 'refund', at };
      });
      const nextToken = response.tokenPagination?.nextPageToken;
      if (nextToken !== undefined && (typeof nextToken !== 'string' || nextToken.length > 4096)) throw failure('Invalid voided pagination.', 503);
      return { events, nextToken: nextToken || null };
    },
    async verify(input, intent, accountKey) {
      if (!input || input.intentId !== intent.id || input.productId !== intent.sku || input.platform !== intent.platform) throw failure('This purchase does not match its checkout.');
      const expected = { ...input, createdAt: intent.createdAt }, sandboxAllowed = sandboxAccounts.has(accountKey);
      if (input.platform === 'apple') {
        if (!apple) throw failure('App Store checkout is not configured yet.', 503);
        if (!/^\d{1,40}$/.test(input.transactionId || '')) throw failure('Invalid App Store transaction.');
        let environment = Environment.PRODUCTION, response;
        try { response = await apple.get(environment).client.getTransactionInfo(input.transactionId); }
        catch (error) {
          // Apple can return 401 from production APIs before the app's first production release.
          if (!sandboxAllowed || error.httpStatusCode !== 401 && error.apiError !== 4040010) throw failure('The App Store could not verify this payment. Please retry.', 503);
          environment = Environment.SANDBOX;
          response = await apple.get(environment).client.getTransactionInfo(input.transactionId);
        }
        const data = await apple.get(environment).verifier.verifyAndDecodeTransaction(response.signedTransactionInfo);
        return validateMobileReceipt(data, expected, 'apple', sandboxAllowed, Date.now(), true);
      }
      if (input.platform !== 'google') throw failure('Invalid mobile store.');
      if (!google) throw failure('Google Play checkout is not configured yet.', 503);
      if (typeof input.purchaseToken !== 'string' || !/^[\x21-\x7e]{1,4096}$/.test(input.purchaseToken)) throw failure('Invalid Google Play purchase token.');
      const data = await json(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${MOBILE_APP_ID}/purchases/productsv2/tokens/${encodeURIComponent(input.purchaseToken)}`,
        { headers: { Authorization: `Bearer ${await googleToken()}` } });
      return validateMobileReceipt(data, expected, 'google', sandboxAllowed, Date.now(), true);
    },
  };
}
