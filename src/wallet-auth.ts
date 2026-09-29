export interface WalletIdentity { issuer: string; subject: string; clientId: string }
export const walletIdentity = ({ issuer, subject, clientId }: WalletIdentity) => JSON.stringify([issuer, subject, clientId]);

/** A separate PKCE exchange proves the current game account without replacing its session. */
export function walletAuthorization(identity: WalletIdentity, nonce: string, signal?: AbortSignal, reservedPopup?: Window, silent = false): Promise<{ idToken: string; identity: string }> {
  const startedAt = Date.now() / 1000;
  let popup: Window | null = reservedPopup ?? null;
  let frame: HTMLIFrameElement | undefined;
  try {
    const issuer = new URL(identity.issuer);
    if (issuer.href !== identity.issuer || issuer.username || issuer.password || issuer.search || issuer.hash
      || (issuer.protocol !== 'https:' && !(issuer.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(issuer.hostname)))
      || !identity.subject || !identity.clientId || !/^[A-Za-z0-9_-]{16,256}$/.test(nonce)) throw Error('The wallet authorization request is invalid.');
    if (signal?.aborted) throw Error('Wallet authorization cancelled.');
    if (silent) {
      if (popup) throw Error('The wallet authorization request is invalid.');
      frame = document.createElement('iframe'); frame.hidden = true; frame.title = 'Checking your game session'; frame.referrerPolicy = 'no-referrer';
      frame.setAttribute('aria-hidden', 'true'); frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      document.body.append(frame);
    } else {
      if (typeof BroadcastChannel !== 'function') throw Error('This browser cannot return wallet authorization to the game.');
      // Reserve a normal tab for wallet side panels when game SSO requires interaction.
      popup ??= window.open('about:blank', '_blank');
      if (!popup) throw Error('The game sign-in window was blocked. Allow pop-ups and reconnect your game session.');
      popup.opener = null;
    }
  } catch (error) {
    frame?.remove();
    try { popup?.close(); } catch { /* The browser may have isolated the window. */ }
    return Promise.reject(error);
  }
  const redirectUri = `${location.origin}/${silent ? 'silent-check-sso' : 'auth-callback'}.html`, controller = new AbortController();
  let settled = false, channel: BroadcastChannel | undefined, timer: ReturnType<typeof setTimeout>;
  let receiveFrame: ((event: MessageEvent) => void) | undefined;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer); signal?.removeEventListener('abort', cancelled); channel?.close(); controller.abort();
      if (receiveFrame) window.removeEventListener('message', receiveFrame);
      frame?.removeAttribute('src'); frame?.remove();
      try { popup?.close(); } catch { /* Provider isolation can detach the window. */ }
    };
    const fail = (message: string, code?: string) => { if (!settled) { settled = true; cleanup(); reject(Object.assign(Error(message), code ? { code } : {})); } };
    const interactionRequired = () => fail('Your game session needs to be reconnected before opening the wallet.', 'WALLET_SSO_INTERACTION_REQUIRED');
    const cancelled = () => fail('Wallet authorization cancelled.');
    signal?.addEventListener('abort', cancelled, { once: true });
    timer = setTimeout(() => silent ? interactionRequired() : fail('Game sign-in timed out. Reconnect your game session to continue.'), silent ? 15000 : 120000);
    const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    async function begin(promptNone: boolean) {
      const state = `mossvale-wallet:${crypto.randomUUID()}`, verifier = encode(crypto.getRandomValues(new Uint8Array(32)));
      const challenge = encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
      if (settled) return;
      channel?.close();
      const current = silent ? undefined : channel = new BroadcastChannel(`mossvale-wallet-auth:${state}`);
      let consumed = false;
      const target = new URL(`${identity.issuer}/protocol/openid-connect/auth`);
      target.search = new URLSearchParams({ client_id: identity.clientId, redirect_uri: redirectUri, response_type: 'code', response_mode: 'fragment',
        scope: 'openid', state, nonce, code_challenge: challenge, code_challenge_method: 'S256', ...(promptNone ? { prompt: 'none' } : { prompt: 'login' }) }).toString();
      const receive = (event: { origin: string; data: Record<string, unknown> }) => {
        const data = event.data;
        if (settled || consumed || current !== channel || event.origin !== location.origin || !data || data.state !== state) return;
        if (data.type === 'mossvale:wallet-auth-ready') { current?.postMessage({ type: 'mossvale:wallet-auth-accept', state }); return; }
        if (data.type !== 'mossvale:wallet-auth-code') return;
        consumed = true; current?.postMessage({ type: 'mossvale:wallet-auth-received', state });
        if (data.issuer !== identity.issuer) { fail('Wallet authorization returned the wrong account provider.'); return; }
        if (data.error) {
          if (promptNone && ['login_required', 'interaction_required', 'consent_required', 'account_selection_required'].includes(String(data.error))) {
            if (silent) { interactionRequired(); return; }
            void begin(false).catch(() => fail('Wallet authorization could not open. Please try again.')); return;
          }
          fail('Wallet authorization was declined. Please try again.'); return;
        }
        if (typeof data.code !== 'string' || !data.code || data.code.length > 4096) { fail('Wallet authorization returned an invalid code.'); return; }
        const code = data.code;
        void (async () => {
          const response = await fetch(`${identity.issuer}/protocol/openid-connect/token`, { method: 'POST', cache: 'no-store', redirect: 'error', credentials: 'omit',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: controller.signal,
            body: new URLSearchParams({ grant_type: 'authorization_code', client_id: identity.clientId, redirect_uri: redirectUri, code, code_verifier: verifier }) });
          if (!response.ok) throw Error();
          const result = await response.json();
          if (typeof result.id_token !== 'string' || result.id_token.length > 65536) throw Error();
          const { createRemoteJWKSet, jwtVerify } = await import('jose');
          const { payload } = await jwtVerify(result.id_token, createRemoteJWKSet(new URL(`${identity.issuer}/protocol/openid-connect/certs`), { timeoutDuration: 10000 }), {
            issuer: identity.issuer, audience: identity.clientId, subject: identity.subject, algorithms: ['RS256'], requiredClaims: ['iss', 'sub', 'aud', 'exp', 'iat', 'nonce'],
          });
          if (payload.aud !== identity.clientId || payload.azp !== undefined && payload.azp !== identity.clientId || payload.nonce !== nonce
            || typeof payload.iat !== 'number' || payload.iat < startedAt - 30 || payload.iat > Date.now() / 1000 + 30) throw Error();
          if (settled) return;
          settled = true; cleanup(); resolve({ idToken: result.id_token, identity: walletIdentity(identity) });
        })().catch(() => fail('Wallet authorization did not match your current game account. Please try again.'));
      };
      if (frame) {
        receiveFrame = event => {
          if (event.origin !== location.origin || event.source !== frame!.contentWindow || typeof event.data !== 'string') return;
          let returned: URL;
          try { returned = new URL(event.data); } catch { return; }
          if (returned.origin + returned.pathname !== redirectUri || returned.username || returned.password || returned.search) return;
          const params = new URLSearchParams(returned.hash.slice(1));
          if (['state', 'code', 'error', 'iss'].some(key => params.getAll(key).length > 1)
            || Boolean(params.get('code')) === Boolean(params.get('error'))) return;
          receive({ origin: event.origin, data: { type: 'mossvale:wallet-auth-code', state: params.get('state'), issuer: params.get('iss'), code: params.get('code'), error: params.get('error') } });
        };
        window.addEventListener('message', receiveFrame); frame.src = target.href;
      } else { current!.onmessage = receive; popup!.location.replace(target.href); }
    }
    void begin(true).catch(() => fail('Wallet authorization could not open. Please try again.'));
  });
}
