import type Keycloak from 'keycloak-js';

export type EmbeddedCredentials = { token: string; refreshToken: string; idToken: string };

/** Providers approve in a separate tab; the game never leaves its current page. */
export function popupAccountFlow(client: Keycloak, provider: string) {
  if (typeof BroadcastChannel === 'undefined') throw Error('This browser cannot return sign-in to the game. Use Continue in this tab.');
  // Open during the click. Normal tabs support wallet side panels; Brave popups can crash.
  let popup: Window | null;
  try { popup = window.open('about:blank', '_blank'); } catch { popup = null; }
  if (!popup) throw Error('The sign-in window was blocked. Allow pop-ups or use Continue in this tab.');
  popup.opener = null;
  let settled = false, channel: BroadcastChannel | undefined, timeout: ReturnType<typeof setTimeout>;
  let rejectFlow: (error: Error) => void;
  const cleanup = () => { clearTimeout(timeout); channel?.close(); try { popup.close(); } catch { /* Provider isolation can detach the window. */ } };
  const fail = (message = 'Sign-in could not finish. Try again or use Continue in this tab.') => {
    if (settled) return;
    settled = true; cleanup(); rejectFlow(Error(message));
  };
  const result = new Promise<EmbeddedCredentials>((resolve, reject) => {
    rejectFlow = reject;
    timeout = setTimeout(() => fail('Sign-in timed out. Please try again.'), 10 * 60 * 1000);
    void client.createLoginUrl({ redirectUri: `${location.origin}/auth-callback.html`, idpHint: provider, prompt: 'login' }).then(url => {
      if (settled) return;
      const target = new URL(url), state = target.searchParams.get('state');
      if (!state || state.length > 2048 || target.username || target.password || target.hash || target.origin !== new URL(client.authServerUrl!).origin) { fail(); return; }
      // BroadcastChannel survives provider COOP isolation without storing any credentials.
      channel = new BroadcastChannel(`mossvale-auth:${state}`);
      channel.onmessage = event => {
        const data = event.data;
        if (settled || event.origin !== location.origin || !data || typeof data !== 'object' || data.state !== state) return;
        if (data.type === 'mossvale:auth-ready') { channel!.postMessage({ type: 'mossvale:auth-accept', state }); return; }
        if (data.type === 'mossvale:embedded-auth-error') { channel!.postMessage({ type: 'mossvale:auth-received', state }); fail(); return; }
        if (data.type !== 'mossvale:embedded-auth-complete'
          || !['token', 'refreshToken', 'idToken'].every(key => typeof data[key] === 'string' && data[key].length > 0 && data[key].length < 65536)) return;
        channel!.postMessage({ type: 'mossvale:auth-received', state });
        settled = true; cleanup(); resolve({ token: data.token, refreshToken: data.refreshToken, idToken: data.idToken });
      };
      popup.location.replace(url);
    }).catch(() => fail());
  });
  // Do not poll .closed: providers can sever the opener while their approval window is still open.
  return { result, cancel: () => fail('Sign-in cancelled.') };
}

/** Keep Keycloak's browser flow (including recovery and MFA) inside the title screen. */
export function embeddedAccountFlow(client: Keycloak, frame: HTMLIFrameElement, onReady: () => void) {
  let settled = false;
  let expectedState = '';
  let rejectFlow: (error: Error) => void;
  let timeout: ReturnType<typeof setTimeout>;
  const cleanup = () => { window.removeEventListener('message', receive); clearTimeout(timeout); frame.removeAttribute('src'); };
  const fail = () => {
    if (settled) return;
    settled = true; cleanup();
    rejectFlow(new Error('The sign-in form could not open here. Use Open sign-in page to continue.'));
  };
  let receive: (event: MessageEvent) => void;
  const result = new Promise<EmbeddedCredentials>((resolve, reject) => {
    rejectFlow = reject;
    receive = event => {
      if (settled || event.source !== frame.contentWindow || !event.data || typeof event.data !== 'object') return;
      const data = event.data;
      if (event.origin === new URL(client.authServerUrl!).origin && data.type === 'mossvale:auth-frame' && data.ready === true && data.layout === 'compact-v1') {
        clearTimeout(timeout);
        if (Number.isFinite(data.height)) frame.style.height = `${Math.min(1100, Math.max(240, Math.ceil(data.height)))}px`;
        onReady();
      }
      if (event.origin !== location.origin || !expectedState || data.state !== expectedState) return;
      if (data.type === 'mossvale:embedded-auth-error') { fail(); return; }
      if (data.type !== 'mossvale:embedded-auth-complete'
        || !['token', 'refreshToken', 'idToken'].every(key => typeof data[key] === 'string' && data[key].length > 0 && data[key].length < 65536)) return;
      settled = true; cleanup();
      resolve({ token: data.token, refreshToken: data.refreshToken, idToken: data.idToken });
    };
    window.addEventListener('message', receive);
    timeout = setTimeout(fail, 15000);
    // Silent restoration runs at startup. An entry-screen error must never auto-rejoin a banned/deleted session.
    void client.createLoginUrl({ redirectUri: `${location.origin}/auth-callback.html`, prompt: 'login' }).then(url => {
      if (settled) return;
      const target = new URL(url);
      expectedState = target.searchParams.get('state') || '';
      if (!expectedState || target.origin !== new URL(client.authServerUrl!).origin) { fail(); return; }
      frame.src = url;
    }).catch(fail);
  });
  return { result, cancel: fail };
}
