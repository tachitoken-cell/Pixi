import Keycloak from 'keycloak-js';

function waitForReply(channel: BroadcastChannel, type: string, state: string, timeout = 5000) {
  return new Promise<boolean>(resolve => {
    const finish = (received: boolean) => { clearTimeout(timer); channel.onmessage = null; resolve(received); };
    const timer = setTimeout(() => finish(false), timeout);
    channel.onmessage = event => { if (event.origin === location.origin && event.data?.type === type && event.data.state === state) finish(true); };
  });
}

async function completeSignIn() {
  const status = document.getElementById('auth-status')!;
  // The adapter removes the callback fragment after checking its stored state, nonce and PKCE.
  const state = new URLSearchParams(location.hash.slice(1)).get('state') || '';
  if (state.startsWith('mossvale-wallet:')) { await completeWalletAuthorization(status, state); return; }
  let parent: Window | undefined, channel: BroadcastChannel | undefined;
  try {
    if (window.parent !== window) {
      if (window.parent.location.origin !== location.origin) throw Error();
      parent = window.parent;
    } else {
      if (!state || state.length > 2048 || typeof BroadcastChannel !== 'function') throw Error();
      channel = new BroadcastChannel(`mossvale-auth:${state}`);
      status.textContent = 'Return to your game tab to finish signing in.';
      const accepted = waitForReply(channel, 'mossvale:auth-accept', state, 10 * 60_000);
      channel.postMessage({ type: 'mossvale:auth-ready', state });
      if (!await accepted) throw Error();
      status.textContent = 'Finishing your sign-in…';
    }
  } catch {
    channel?.close();
    status.textContent = 'Return to Mossvale to sign in.';
    return;
  }
  let result: { type: string; state: string; token?: string; refreshToken?: string; idToken?: string };
  try {
    if (!state || state.length > 2048) throw Error();
    const response = await fetch('/api/config', { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw Error();
    const realm = (await response.json())?.keycloak;
    if (!realm || !['url', 'realm', 'clientId'].every(key => typeof realm[key] === 'string' && realm[key].trim() && realm[key].length <= 2048)) throw Error();
    const url = new URL(realm.url);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw Error();
    const keycloak = new Keycloak({ url: realm.url, realm: realm.realm, clientId: realm.clientId });
    await keycloak.init({ pkceMethod: 'S256', flow: 'standard', checkLoginIframe: false, redirectUri: location.origin + '/auth-callback.html' });
    if (!keycloak.authenticated || !keycloak.token || !keycloak.refreshToken || !keycloak.idToken) throw Error();
    result = { type: 'mossvale:embedded-auth-complete', token: keycloak.token, refreshToken: keycloak.refreshToken, idToken: keycloak.idToken, state };
    status.textContent = 'Signed in. Returning to your adventure…';
  } catch {
    status.textContent = 'Sign-in could not finish. Return to Mossvale to try again.';
    result = { type: 'mossvale:embedded-auth-error', state };
  }
  if (parent) parent.postMessage(result, location.origin);
  else if (channel) {
    try {
      const received = waitForReply(channel, 'mossvale:auth-received', state);
      channel.postMessage(result);
      if (await received) window.close();
      else status.textContent = 'Return to Mossvale to check your sign-in.';
    } catch { status.textContent = 'Return to Mossvale to check your sign-in.'; }
    finally { channel.close(); }
  }
}

async function completeWalletAuthorization(status: HTMLElement, state: string) {
  let channel: BroadcastChannel | undefined;
  try {
    const params = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, '', location.pathname);
    if (window.parent !== window || !/^mossvale-wallet:[\da-f-]{36}$/i.test(state) || typeof BroadcastChannel !== 'function'
      || ['state', 'code', 'error', 'iss'].some(key => params.getAll(key).length > 1)
      || (Boolean(params.get('code')) === Boolean(params.get('error')))) throw Error();
    channel = new BroadcastChannel(`mossvale-wallet-auth:${state}`);
    status.textContent = 'Return to your game tab to authorize its wallet.';
    const accepted = waitForReply(channel, 'mossvale:wallet-auth-accept', state, 120000);
    channel.postMessage({ type: 'mossvale:wallet-auth-ready', state });
    if (!await accepted) throw Error();
    const received = waitForReply(channel, 'mossvale:wallet-auth-received', state);
    // Only the one-use code crosses the channel; its verifier stays in the game tab.
    channel.postMessage({ type: 'mossvale:wallet-auth-code', state, issuer: params.get('iss'), code: params.get('code'), error: params.get('error') });
    if (!await received) throw Error();
    status.textContent = 'Finishing wallet authorization in your game tab…';
  } catch { status.textContent = 'Wallet authorization could not finish. Return to Mossvale to try again.'; }
  finally { channel?.close(); }
}

void completeSignIn();
