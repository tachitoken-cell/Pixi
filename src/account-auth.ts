import Keycloak from 'keycloak-js';

export type AccountDeletionStatus = { status: 'none' | 'pending' | 'complete'; available: boolean; freshAuthRequired: boolean; requestedAt?: number; completedAt?: number };
export class AccountPageError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}
const sessionKey = 'mossvale-account-signed-in';
function remember(active: boolean) {
  for (const storage of ['localStorage', 'sessionStorage'] as const) {
    try { if (active) globalThis[storage].setItem(sessionKey, '1'); else globalThis[storage].removeItem(sessionKey); } catch { /* Tokens remain in memory. */ }
  }
}
function hadSession() {
  for (const storage of ['localStorage', 'sessionStorage'] as const) {
    try { if (globalThis[storage].getItem(sessionKey) === '1') return true; } catch { /* Browser storage may be disabled. */ }
  }
  return false;
}
export function accountRedirectUri() {
  // Fixed callbacks never copy untrusted query parameters or OAuth fragments.
  return location.origin + '/account.html';
}

export async function createAccountSession() {
  let config;
  try {
    const response = await fetch('/api/config', { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw Error();
    config = await response.json();
  } catch { throw new AccountPageError('CONFIG_UNAVAILABLE', 'Account services could not be reached. Check your connection and try again.'); }
  const realm = config?.keycloak;
  if (!realm || !['url', 'realm', 'clientId'].every(key => typeof realm[key] === 'string' && realm[key].trim() && realm[key].length <= 2048))
    throw new AccountPageError('CONFIG_INVALID', 'Account sign-in is not configured on this server.');
  try {
    const url = new URL(realm.url);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw Error();
  } catch { throw new AccountPageError('CONFIG_INVALID', 'The account service address is invalid.'); }
  const keycloak = new Keycloak({ url: realm.url, realm: realm.realm, clientId: realm.clientId });
  const pageRedirectUri = accountRedirectUri();
  const nativeAuth = (globalThis as typeof globalThis & { __MOSSVALE_NATIVE_AUTH__?: boolean }).__MOSSVALE_NATIVE_AUTH__ === true;
  const oldNative = (globalThis as typeof globalThis & { __MOSSVALE_NATIVE__?: boolean }).__MOSSVALE_NATIVE__ === true && !nativeAuth;
  const redirectUri = nativeAuth ? 'mossvale://auth/callback' : pageRedirectUri;
  const socialSignInRequiresUpdate = oldNative && (config.socialProviders?.google === 'google' || config.socialProviders?.apple === 'apple');
  const socialProviders = { google: !oldNative && config.socialProviders?.google === 'google', apple: !oldNative && config.socialProviders?.apple === 'apple' };
  try {
    await keycloak.init({ ...(hadSession() ? { onLoad: 'check-sso' as const } : {}),
      ...(!nativeAuth && !oldNative && hadSession() ? { silentCheckSsoRedirectUri: location.origin + '/silent-check-sso.html', silentCheckSsoFallback: false } : {}),
      pkceMethod: 'S256', flow: 'standard', checkLoginIframe: false, redirectUri });
    remember(!!keycloak.authenticated);
  } catch {
    remember(false); keycloak.clearToken();
    throw new AccountPageError('SIGN_IN_FAILED', 'Sign-in could not finish. Try again or contact Mossvale support.');
  }
  async function token() {
    if (keycloak.authenticated) {
      try { await keycloak.updateToken(30); if (keycloak.authenticated && keycloak.token) return keycloak.token; } catch { /* Fail closed. */ }
    }
    remember(false); keycloak.clearToken();
    throw new AccountPageError('SESSION_EXPIRED', 'Your session has ended. Sign in again to continue.');
  }
  async function deletion(method: 'GET' | 'POST', confirmation?: string): Promise<AccountDeletionStatus> {
    if (method === 'POST' && confirmation !== 'DELETE ACCOUNT') throw new AccountPageError('CONFIRMATION_REQUIRED', 'Type DELETE ACCOUNT exactly to confirm.');
    const accessToken = await token();
    let response;
    try {
      response = await fetch('/api/account/deletion', { method, cache: 'no-store', redirect: 'error',
        headers: { Authorization: `Bearer ${accessToken}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
        ...(method === 'POST' ? { body: JSON.stringify({ confirmation }) } : {}), signal: AbortSignal.timeout(15000) });
    } catch { throw new AccountPageError('STATUS_UNKNOWN', method === 'POST'
      ? 'The response was interrupted. Check deletion status before trying again; your request may have been received.'
      : 'Deletion status could not be reached. Check your connection and try again.'); }
    let value;
    try { value = await response.json(); } catch { throw new AccountPageError('STATUS_UNKNOWN', 'The account service returned an unexpected response. Check deletion status or contact support.'); }
    if (!response.ok) {
      const code = typeof value?.code === 'string' ? value.code : '';
      if (code === 'ACCOUNT_PAYMENTS_PENDING') throw new AccountPageError(code, 'A MOSS payment or auction reservation is still settling. Return to the game to resolve it, then request deletion again. Your account has not been scheduled for deletion.');
      if (code === 'FRESH_AUTH_REQUIRED' || code === 'ACCOUNT_FRESH_AUTH_REQUIRED') throw new AccountPageError('FRESH_AUTH_REQUIRED', 'Please verify your sign-in again before confirming deletion.');
      if (response.status === 401) throw new AccountPageError('SESSION_EXPIRED', 'Your session has ended. Sign in again to check your account.');
      throw new AccountPageError('STATUS_UNKNOWN', 'Account deletion is temporarily unavailable. Check deletion status or contact support.');
    }
    if (!(method === 'POST' ? ['pending', 'complete'] : ['none', 'pending', 'complete']).includes(value?.status)) throw new AccountPageError('STATUS_UNKNOWN', 'The deletion status was not recognized. Contact support before trying again.');
    return { status: value.status, available: value.available === true, freshAuthRequired: value.freshAuthRequired !== false,
      ...(Number.isSafeInteger(value.requestedAt) && value.requestedAt > 0 ? { requestedAt: value.requestedAt } : {}),
      ...(Number.isSafeInteger(value.completedAt) && value.completedAt > 0 ? { completedAt: value.completedAt } : {}) };
  }
  return {
    socialProviders,
    socialSignInRequiresUpdate,
    signedIn: () => !!keycloak.authenticated,
    profile() {
      const claims = keycloak.tokenParsed || {};
      return { name: typeof claims.preferred_username === 'string' ? claims.preferred_username : typeof claims.name === 'string' ? claims.name : 'Mossvale adventurer',
        email: typeof claims.email === 'string' ? claims.email : '', emailVerified: claims.email_verified === true,
        expiresAt: typeof claims.exp === 'number' && Number.isFinite(claims.exp) ? claims.exp * 1000 : undefined };
    },
    recentAuthentication() { const at = keycloak.tokenParsed?.auth_time; return typeof at === 'number' && at * 1000 <= Date.now() + 5000 && at * 1000 >= Date.now() - 300000; },
    signIn: () => keycloak.login({ redirectUri }),
    async signInWithSocial(provider: 'google' | 'apple') {
      if ((provider !== 'google' && provider !== 'apple') || !socialProviders[provider]) throw new AccountPageError('PROVIDER_UNAVAILABLE', 'This sign-in provider is not available.');
      try { await keycloak.login({ redirectUri, idpHint: provider }); }
      catch { throw new AccountPageError('SIGN_IN_FAILED', `${provider === 'google' ? 'Google' : 'Apple'} sign-in could not be opened. Please try again.`); }
    },
    createAccount: () => keycloak.register({ redirectUri }),
    reauthenticate: () => keycloak.login({ redirectUri, prompt: 'login', maxAge: 0 }),
    changePassword: () => keycloak.login({ redirectUri, action: 'UPDATE_PASSWORD' }),
    manageAccount: () => location.assign(keycloak.createAccountUrl({ redirectUri: pageRedirectUri })),
    async signOut() { remember(false); await keycloak.logout({ redirectUri: pageRedirectUri, logoutMethod: 'POST' }); keycloak.clearToken(); },
    deletionStatus: () => deletion('GET'),
    requestDeletion: (confirmation: string) => deletion('POST', confirmation),
  };
}
