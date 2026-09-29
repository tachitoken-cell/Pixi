import { parseAppUpdatePolicy, requiredAppUpdate, type AppPlatform } from './app-update.ts';

export function validateGameUrl(value: string, development = false): string {
  const url = new URL(value);
  if (url.username || url.password || (url.protocol !== 'https:' && !(development && url.protocol === 'http:'))) {
    throw Error('Mossvale requires an HTTPS address; Expo Go development also supports HTTP.');
  }
  return url.href;
}

export async function loadGame(value: string, development: boolean, request: typeof fetch, signal: AbortSignal, installed?: { platform: AppPlatform; version?: string | null; build?: string | null }) {
  const url = validateGameUrl(value, development);
  let response: Response;
  try {
    response = await request(new URL('/api/config', url).href, { signal, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (signal.aborted) throw error;
    throw Error('Could not reach Mossvale. Check your connection; the app will retry automatically.');
  }
  if (!response.ok) throw Error(`Mossvale is temporarily unavailable (HTTP ${response.status}). Reconnecting automatically…`);
  try {
    const config: unknown = await response.json();
    const policy = parseAppUpdatePolicy((config as { mobileAppUpdate?: unknown } | null)?.mobileAppUpdate);
    return { url, origins: trustedOrigins(url, config, development), auth: authSettings(config, development), update: installed ? requiredAppUpdate(policy, installed) : undefined };
  } catch (error) {
    if (signal.aborted) throw error;
    throw Error('Mossvale’s sign-in settings are temporarily unavailable. Reconnecting automatically…');
  }
}

export function trustedOrigins(gameUrl: string, config: unknown, development = false): Set<string> {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw Error('Invalid realm settings.');
  const settings = config as { keycloak?: { url?: unknown } | null; realms?: { origin?: unknown }[] };
  const origins = new Set([new URL(gameUrl).origin, 'https://account.mossvale.world']);
  if (settings.keycloak !== null) {
    if (typeof settings.keycloak?.url !== 'string') throw Error('Invalid sign-in address.');
    origins.add(new URL(validateGameUrl(settings.keycloak.url, development)).origin);
  }
  if (settings.realms !== undefined) {
    if (!Array.isArray(settings.realms)) throw Error('Invalid realms.');
    for (const realm of settings.realms) {
      if (realm?.origin === '' || realm?.origin === null) continue;
      if (typeof realm?.origin !== 'string') throw Error('Invalid realm address.');
      origins.add(new URL(validateGameUrl(realm.origin, development)).origin);
    }
  }
  return origins;
}

export function navigationAction(value: string, origins: Set<string>): 'internal' | 'external' | 'blocked' {
  if (value === 'about:blank') return 'internal';
  try {
    const url = new URL(value);
    if (url.username || url.password) return 'blocked';
    if (['https:', 'http:'].includes(url.protocol) && origins.has(url.origin)) return 'internal';
    if (['https:', 'mailto:', 'tel:'].includes(url.protocol)) return 'external';
  } catch { /* Malformed or executable addresses stay out of the WebView. */ }
  return 'blocked';
}

export const nativeAuthRedirect = 'mossvale://auth/callback';
export const nativeAuthLink = 'https://mossvale.world/mobile-auth/callback';
export type AuthSettings = { issuer: string; clientId: string; walletProvider?: string };
export type AuthRequest = { url: string; resumeUrl: string; state: string; issuer: string; silent: boolean; wallet: boolean; expiresAt: number };

export function authSettings(config: unknown, development = false): AuthSettings | undefined {
  const keycloak = (config as { keycloak?: { url?: unknown; realm?: unknown; clientId?: unknown } | null })?.keycloak;
  if (keycloak === null) return;
  if (!keycloak || typeof keycloak.url !== 'string' || typeof keycloak.realm !== 'string' || !/^[A-Za-z0-9_.-]{1,128}$/.test(keycloak.realm) || typeof keycloak.clientId !== 'string' || !keycloak.clientId.trim() || keycloak.clientId.length > 256) throw Error('Invalid sign-in settings.');
  const base = new URL(validateGameUrl(keycloak.url, development));
  if (base.search || base.hash) throw Error('Invalid sign-in address.');
  const wallet = (config as { walletBroker?: { enabled?: unknown; provider?: unknown } }).walletBroker;
  const walletProvider = wallet?.enabled === true && typeof wallet.provider === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(wallet.provider) ? wallet.provider : undefined;
  return { issuer: `${base.href.replace(/\/$/, '')}/realms/${encodeURIComponent(keycloak.realm)}`, clientId: keycloak.clientId, walletProvider };
}

export function isAuthNavigation(value: string, settings?: AuthSettings) {
  if (!settings) return false;
  try {
    const url = new URL(value);
    return ['auth', 'registrations'].some(action => `${url.origin}${url.pathname}` === `${settings.issuer}/protocol/openid-connect/${action}`);
  } catch { return false; }
}

export function isAccountNavigation(value: string, settings?: AuthSettings) {
  if (!settings) return false;
  try {
    const url = new URL(value);
    return !url.username && !url.password && `${url.origin}${url.pathname.replace(/\/$/, '')}` === `${settings.issuer}/account`;
  } catch { return false; }
}

export function startAuthRequest(value: string, page: string, settings: AuthSettings, configuredUrl: string, development = false, now = Date.now()): AuthRequest {
  const url = new URL(value), source = new URL(page);
  const origins = new Set(['https://mossvale.world', 'https://us.mossvale.world', 'https://asia.mossvale.world', 'https://account.mossvale.world']);
  if (development) origins.add(new URL(configuredUrl).origin);
  const params = url.searchParams;
  const hint = params.get('kc_idp_hint'), wallet = !!settings.walletProvider && hint === settings.walletProvider;
  const allowed = new Set(['client_id', 'redirect_uri', 'state', 'response_mode', 'response_type', 'scope', 'nonce', 'prompt', 'max_age', 'login_hint', 'kc_idp_hint', 'kc_action', 'ui_locales', 'claims', 'acr_values', 'code_challenge', 'code_challenge_method']);
  if (!origins.has(source.origin) || !['/', '/index.html', '/account.html'].includes(source.pathname) || source.username || source.password || !isAuthNavigation(value, settings) || url.username || url.password || url.hash || value.length > 8192 ||
      [...params.keys()].some(key => !allowed.has(key) || params.getAll(key).length !== 1) || params.get('client_id') !== settings.clientId || (params.get('redirect_uri') !== nativeAuthRedirect && (!wallet || params.get('redirect_uri') !== nativeAuthLink)) ||
      (hint && !wallet && hint !== 'google' && hint !== 'apple') || (wallet && (url.protocol !== 'https:' || source.hostname === 'account.mossvale.world' || !['/', '/index.html'].includes(source.pathname) || !url.pathname.endsWith('/protocol/openid-connect/auth'))) ||
      params.get('response_type') !== 'code' || params.get('response_mode') !== 'fragment' || params.get('code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(params.get('code_challenge') || '') ||
      !/^[A-Za-z0-9_-]{20,256}$/.test(params.get('state') || '') || !/^[A-Za-z0-9_-]{20,256}$/.test(params.get('nonce') || '') || !params.get('scope')?.split(' ').includes('openid')) throw Error('Start sign-in from Mossvale.');
  // The WebView retains Keycloak's verifier, nonce and exact redirect URI. Only a code returns.
  source.search = ''; source.hash = '';
  return { url: url.href, resumeUrl: source.href, state: params.get('state')!, issuer: settings.issuer, silent: params.get('prompt') === 'none', wallet, expiresAt: now + 10 * 60 * 1000 };
}

export const walletBrowsers = [
  { id: 'metamask', name: 'MetaMask', scheme: 'metamask' },
  { id: 'phantom', name: 'Phantom', scheme: 'phantom' },
  { id: 'okx', name: 'OKX Wallet', scheme: 'okxwallet' },
  { id: 'trust', name: 'Trust Wallet', scheme: 'trust' },
  { id: 'rabby', name: 'Rabby Wallet', scheme: 'rabbygo' },
] as const;
export type WalletBrowser = typeof walletBrowsers[number]['id'];

export function walletBrowserUrl(wallet: WalletBrowser, request: AuthRequest): string {
  const url = new URL(request.url);
  if (!request.wallet || url.protocol !== 'https:' || url.username || url.password || url.hash || `${url.origin}${url.pathname}` !== `${request.issuer}/protocol/openid-connect/auth` || ![nativeAuthRedirect, nativeAuthLink].includes(url.searchParams.get('redirect_uri') || '') || url.searchParams.get('state') !== request.state) throw Error('Start wallet sign-in from Mossvale.');
  // Start authorization inside the wallet so the broker cookie stays in that browser.
  return walletPageUrl(wallet, url.href, new URL(request.resumeUrl).origin);
}

export function walletPageUrl(wallet: WalletBrowser, value: string, ref: string): string {
  const url = new URL(value), source = new URL(ref);
  if (url.protocol !== 'https:' || source.protocol !== 'https:' || url.username || url.password || source.username || source.password) throw Error('Wallet pages require HTTPS.');
  if (wallet === 'metamask') return `https://link.metamask.io/dapp/${url.href.slice('https://'.length)}`;
  if (wallet === 'phantom') return `https://phantom.app/ul/browse/${encodeURIComponent(url.href)}?ref=${encodeURIComponent(source.origin)}`;
  if (wallet === 'okx') return `okxwallet://wallet/dapp/url?dappUrl=${encodeURIComponent(url.href)}`;
  if (wallet === 'trust') return `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url.href)}`;
  if (wallet === 'rabby') return `rabbygo://go.rabby.io/mobile/?_cmd=open-dapp&dapp=${encodeURIComponent(url.href)}`;
  throw Error('Choose a supported wallet.');
}

export function authCallback(request: AuthRequest, value: string, now = Date.now()): string {
  const url = new URL(value), params = new URLSearchParams(url.hash.slice(1));
  const redirect = new URL(request.url).searchParams.get('redirect_uri');
  const expectedCallback = redirect === nativeAuthLink
    ? [nativeAuthLink, 'https://us.mossvale.world/mobile-auth/callback', 'https://asia.mossvale.world/mobile-auth/callback'].includes(url.origin + url.pathname)
    : redirect === nativeAuthRedirect && url.protocol === 'mossvale:' && url.host === 'auth' && url.pathname === '/callback';
  const allowed = new Set(['code', 'state', 'session_state', 'iss', 'kc_action_status', 'kc_action', 'error', 'error_description', 'error_uri']);
  if (now >= request.expiresAt || !expectedCallback || url.username || url.password || url.search || value.length > 8192 ||
      [...params.keys()].some(key => !allowed.has(key) || params.getAll(key).length !== 1) || params.get('state') !== request.state ||
      (!!params.get('code') === !!params.get('error')) || (params.has('iss') && params.get('iss') !== request.issuer)) throw Error('Sign-in returned an invalid or expired response.');
  // Error details are shown with fixed app copy; never forward provider links or bearer tokens.
  params.delete('error_description'); params.delete('error_uri');
  const resume = new URL(request.resumeUrl); resume.hash = params.toString();
  return resume.href;
}
