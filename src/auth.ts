import Keycloak from 'keycloak-js';
import { configureHosting } from './hosting-client.ts';
import { authorizeNativeBilling } from './native-client.ts';
import { requireNativeAppUpdate } from './native-app-update.ts';
import { nativeAccountSession } from './native-auth.ts';
import { embeddedAccountFlow, popupAccountFlow } from './embedded-auth.ts';
import { walletAuthorization, walletIdentity, type WalletIdentity } from './wallet-auth.ts';

export type AuthState = 'account' | 'guest' | 'signed-out';
export let authEnabled = false;
export let walletSignInEnabled = false;
export type SocialProvider = 'google' | 'apple';
export const socialSignInEnabled: Record<SocialProvider, boolean> = { google: false, apple: false };
export let socialSignInRequiresUpdate = false;
const nativeAuth = () => (globalThis as typeof globalThis & { __MOSSVALE_NATIVE_AUTH__?: boolean }).__MOSSVALE_NATIVE_AUTH__ === true;
const nativeApp = () => nativeAuth() || (globalThis as typeof globalThis & { __MOSSVALE_NATIVE__?: boolean }).__MOSSVALE_NATIVE__ === true;
export const supportsEmbeddedSignIn = () => authEnabled && !nativeApp();
const signInRedirectUri = () => nativeAuth() ? 'mossvale://auth/callback' : location.origin;
let walletProvider: string | undefined;
let keycloak: Keycloak | undefined;
let initialized = false;
let sessionGeneration = 0;
let nativeSession: ReturnType<typeof nativeAccountSession>;
const sessionKey = 'mossvale-signed-in';
function hadSession(): boolean {
  for (const storage of ['localStorage', 'sessionStorage'] as const) {
    try { if (globalThis[storage].getItem(sessionKey) === '1') return true; } catch { /* Browser storage may be disabled. */ }
  }
  return false;
}
function rememberSession(active: boolean): void {
  // This preference survives closing the app; credentials stay in Keycloak's memory.
  for (const storage of ['localStorage', 'sessionStorage'] as const) {
    try { if (active) globalThis[storage].setItem(sessionKey, '1'); else globalThis[storage].removeItem(sessionKey); } catch { /* Sign-in also works without browser storage. */ }
  }
}
function resetWalletSession() {
  // The wallet UI is lazy-loaded; retain logout intent even when it has never opened on this page.
  try { globalThis.localStorage.setItem('mossvale-wallet-reset', crypto.randomUUID()); } catch { /* Wallet SDK persistence also requires browser storage. */ }
  globalThis.dispatchEvent?.(new Event('mossvale-wallet-reset'));
}
const state = (): AuthState => !authEnabled ? 'guest' : keycloak?.authenticated ? 'account' : 'signed-out';

export async function initAuth(): Promise<AuthState> {
  if (initialized) return state();
  let config;
  try {
    // Older service workers cache an allowlisted config; queries bypass that handler.
    const response = await fetch('/api/config?app-startup=1', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error();
    config = await response.json();
  } catch {
    throw new Error('Could not load sign-in settings. Check your connection and try again.');
  }
  await requireNativeAppUpdate(config?.mobileAppUpdate);
  configureHosting(config);
  if (config?.keycloak === null) {
    rememberSession(false);
    initialized = true;
    return 'guest';
  }
  const realm = config?.keycloak;
  if (!realm || !['url', 'realm', 'clientId'].every(key => typeof realm[key] === 'string' && realm[key].trim())) {
    throw new Error('The realm’s sign-in settings are incomplete. Please contact the realm administrator.');
  }
  try {
    const url = new URL(realm.url);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error();
  } catch {
    throw new Error('The realm’s sign-in address is invalid. Please contact the realm administrator.');
  }
  authEnabled = true;
  const wallet = config.walletBroker;
  walletProvider = wallet?.enabled === true && typeof wallet.provider === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(wallet.provider) ? wallet.provider : undefined;
  walletSignInEnabled = !!walletProvider;
  const oldNative = (globalThis as typeof globalThis & { __MOSSVALE_NATIVE__?: boolean }).__MOSSVALE_NATIVE__ === true && !nativeAuth();
  socialSignInRequiresUpdate = oldNative && (config.socialProviders?.google === 'google' || config.socialProviders?.apple === 'apple');
  for (const provider of ['google', 'apple'] as const) socialSignInEnabled[provider] = !oldNative && config.socialProviders?.[provider] === provider;
  keycloak = new Keycloak({ url: realm.url, realm: realm.realm, clientId: realm.clientId });
  nativeSession = nativeAccountSession(realm);
  keycloak.onAuthRefreshSuccess = () => { void nativeSession?.save(keycloak!).catch(() => {}); };
  keycloak.onAuthLogout = () => { sessionGeneration++; resetWalletSession(); rememberSession(false); authorizeNativeBilling(null); void nativeSession?.clear().catch(() => {}); };
  let restored: Awaited<ReturnType<NonNullable<typeof nativeSession>['restore']>>;
  let restoring = true;
  try {
    restored = await nativeSession?.restore();
    restoring = false;
    // Returning players check their provider session after reload or app restart; first visits keep the entry screen.
    await keycloak.init({
      // With iframe checks disabled, Keycloak forces a provider refresh before accepting restored credentials.
      ...(restored || (hadSession() ? { onLoad: 'check-sso' as const } : {})),
      ...(!nativeApp() && hadSession() ? { silentCheckSsoRedirectUri: `${location.origin}/silent-check-sso.html`, silentCheckSsoFallback: false } : {}),
      pkceMethod: 'S256',
      checkLoginIframe: false,
      flow: 'standard',
      redirectUri: signInRedirectUri(),
    });
    rememberSession(!!keycloak.authenticated);
    if (keycloak.authenticated) await nativeSession?.save(keycloak);
    initialized = true;
    authorizeNativeBilling(keycloak.authenticated ? keycloak.token || null : null);
    return state();
  } catch {
    // Bridge/storage failures and provider outages cannot revoke saved credentials.
    if (restoring || restored && keycloak.authenticated) {
      keycloak.onAuthLogout = undefined; keycloak.clearToken(); keycloak = undefined;
      authorizeNativeBilling(null);
      throw new Error('Could not restore sign-in. Check your connection and reopen the app to try again.');
    }
    clearSession();
    keycloak = undefined;
    throw new Error('Sign-in could not be completed. Please try again.');
  }
}

function accountService(): Keycloak {
  if (!initialized || !keycloak) throw new Error('Account sign-in is unavailable in this local realm.');
  return keycloak;
}

function currentWalletIdentity(): WalletIdentity {
  const client = accountService(), claims = client.tokenParsed;
  const issuer = `${client.authServerUrl?.replace(/\/+$/, '')}/realms/${encodeURIComponent(client.realm || '')}`;
  if (!authEnabled || !client.authenticated || !client.token || !client.clientId || claims?.iss !== issuer || claims.azp !== client.clientId
    || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255) throw Error('Sign in to your game account before opening its wallet.');
  return { issuer, subject: claims.sub, clientId: client.clientId };
}

export function getWalletIdentity(): string { return walletIdentity(currentWalletIdentity()); }

export function authorizeWallet(nonce: string, signal?: AbortSignal, popup?: Window): Promise<{ idToken: string; identity: string }> {
  let identity: WalletIdentity;
  try {
    if (nativeApp()) throw Error('Open the browser game to authorize its wallet.');
    identity = currentWalletIdentity();
  } catch (error) { try { popup?.close(); } catch { /* Already closed. */ } return Promise.reject(error); }
  const generation = sessionGeneration, current = keycloak;
  return walletAuthorization(identity, nonce, signal, popup, !popup).then(result => {
    if (signal?.aborted) throw Error('Wallet authorization cancelled.');
    if (generation !== sessionGeneration || current !== keycloak || getWalletIdentity() !== result.identity) throw Error('Your game account changed. Open its wallet again.');
    return result;
  });
}

export function signInInsideGame(frame: HTMLIFrameElement, onReady: () => void) {
  const current = accountService();
  if (!supportsEmbeddedSignIn()) throw new Error('Use account sign-in in the Mossvale app.');
  return adoptAccountFlow(current, embeddedAccountFlow(current, frame, onReady));
}

export function signInWithProviderInsideGame(provider: 'wallet' | SocialProvider) {
  const current = accountService();
  if (!supportsEmbeddedSignIn()) throw new Error('Use account sign-in in the Mossvale app.');
  if (!['wallet', 'google', 'apple'].includes(provider)) throw Error('Unknown sign-in method.');
  const hint = provider === 'wallet' ? walletSignInEnabled && walletProvider
    : socialSignInEnabled[provider] && provider;
  if (!hint) throw Error('This sign-in method is not available in this realm.');
  return adoptAccountFlow(current, popupAccountFlow(current, hint));
}

function adoptAccountFlow(current: Keycloak, flow: ReturnType<typeof embeddedAccountFlow>) {
  const generation = sessionGeneration;
  let cancelled = false;
  const result = flow.result.then(async credentials => {
    if (cancelled || generation !== sessionGeneration) return false;
    const next = new Keycloak({ url: current.authServerUrl!, realm: current.realm!, clientId: current.clientId! });
    // The callback already checked state/nonce/PKCE. Refresh before adopting its in-memory session.
    try { await next.init({ ...credentials, pkceMethod: 'S256', flow: 'standard', checkLoginIframe: false, redirectUri: signInRedirectUri() }); }
    catch { next.clearToken(); throw new Error('Sign-in could not finish. Please try again.'); }
    if (cancelled || generation !== sessionGeneration) { next.clearToken(); return false; }
    if (!next.authenticated || !next.token) { next.clearToken(); throw new Error('Sign-in could not finish. Please try again.'); }
    next.onAuthLogout = current.onAuthLogout;
    current.onAuthLogout = undefined;
    current.clearToken();
    sessionGeneration++;
    resetWalletSession();
    keycloak = next;
    rememberSession(true);
    authorizeNativeBilling(next.token);
    return true;
  });
  return { result, cancel() { cancelled = true; flow.cancel(); } };
}

export async function signIn(): Promise<void> {
  try { await accountService().login({ redirectUri: signInRedirectUri() }); }
  catch { throw new Error('Sign-in could not be opened. Please try again.'); }
}

export async function signInWithWallet(): Promise<void> {
  if (!walletSignInEnabled || !walletProvider) throw new Error('Wallet sign-in is not available in this realm.');
  // Older binaries retain their embedded wallet bridge and exact stored redirect.
  const browserWallet = (globalThis as typeof globalThis & { __MOSSVALE_NATIVE_WALLET_BROWSER__?: boolean }).__MOSSVALE_NATIVE_WALLET_BROWSER__ === true;
  const appLinks = (globalThis as typeof globalThis & { __MOSSVALE_NATIVE_AUTH_LINKS__?: boolean }).__MOSSVALE_NATIVE_AUTH_LINKS__ === true;
  const redirectUri = browserWallet ? appLinks ? 'https://mossvale.world/mobile-auth/callback' : signInRedirectUri() : location.origin;
  try { await accountService().login({ redirectUri, idpHint: walletProvider, prompt: 'login' }); }
  catch { throw new Error('Wallet sign-in could not be opened. Please try again.'); }
}

export async function createAccount(): Promise<void> {
  try { await accountService().register({ redirectUri: signInRedirectUri() }); }
  catch { throw new Error('Account creation could not be opened. Please try again.'); }
}

export async function signInWithSocial(provider: SocialProvider): Promise<void> {
  if ((provider !== 'google' && provider !== 'apple') || !socialSignInEnabled[provider]) throw new Error('This sign-in provider is not available in this realm.');
  try { await accountService().login({ redirectUri: signInRedirectUri(), idpHint: provider }); }
  catch { throw new Error(`${provider === 'google' ? 'Google' : 'Apple'} sign-in could not be opened. Please try again.`); }
}

export function clearSession(): void { sessionGeneration++; resetWalletSession(); rememberSession(false); keycloak?.clearToken(); authorizeNativeBilling(null); void nativeSession?.clear().catch(() => {}); }

export async function getAccessToken(forceRefresh = false): Promise<string | undefined> {
  if (!initialized) throw new Error('Sign-in is not ready. Reload the page to try again.');
  if (!authEnabled) return undefined;
  const client = keycloak;
  if (client?.authenticated) {
    const generation = sessionGeneration;
    try {
      await client.updateToken(forceRefresh ? -1 : 30);
      if (generation !== sessionGeneration) throw new Error();
      if (client.authenticated && client.token) {
        await nativeSession?.save(client);
        if (generation !== sessionGeneration) throw new Error();
        authorizeNativeBilling(client.token); return client.token;
      }
    } catch {
      if (generation !== sessionGeneration) { client.clearToken(); throw new Error('Your sign-in changed. Please try again.'); }
      // An offline refresh cannot join, but must preserve the session for a later retry.
      if (client.authenticated && client.token) throw new Error('Could not refresh your sign-in. Check your connection and try again.');
    }
  }
  clearSession();
  throw new Error('Your session has ended. Sign in again to continue your adventure.');
}

export async function refreshSessionAccessToken(forceRefresh = false): Promise<string | undefined> {
  const client = keycloak;
  if (!initialized || !authEnabled || !client?.authenticated) return;
  const generation = sessionGeneration;
  try {
    await client.updateToken(forceRefresh ? -1 : 60);
    if (generation !== sessionGeneration) { client.clearToken(); return; }
    if (client.authenticated) {
      await nativeSession?.save(client);
      if (generation !== sessionGeneration) { client.clearToken(); return; }
      authorizeNativeBilling(client.token || null); return client.token;
    }
  } catch {
    // A temporary provider failure must not discard a still-valid realm session.
  }
}

export async function signOut(): Promise<void> {
  if (!authEnabled) return;
  try {
    sessionGeneration++;
    resetWalletSession();
    rememberSession(false);
    await nativeSession?.clear();
    authorizeNativeBilling(null);
    // POST keeps the adapter’s ID-token hint out of the logout URL.
    await accountService().logout({ redirectUri: location.origin, logoutMethod: 'POST' });
    clearSession();
  } catch {
    throw new Error('Sign-out could not be completed. Please try again.');
  }
}
