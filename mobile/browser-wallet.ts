import { AppState, Linking } from 'react-native';
import { fetch } from 'expo/fetch';
import { authCallback, nativeAuthLink, walletBrowserUrl, walletBrowsers, type AuthRequest, type WalletBrowser } from './navigation';
import { cancelled, requireActive } from './native-bridge';

export async function openWalletBrowser(request: AuthRequest, signal: AbortSignal, choose: (select: ((wallet: WalletBrowser) => void) | undefined) => void): Promise<string> {
  requireActive(signal);
  if (!request.wallet || request.expiresAt <= Date.now()) throw Error('Start a new wallet sign-in from Mossvale.');
  return new Promise((resolve, reject) => {
    let finished = false, opening = false, launched = false, polling = false;
    let token: string | undefined, pollTimer: ReturnType<typeof setTimeout> | undefined, pending: AbortController | undefined;
    const handoff = new URL(request.url).searchParams.get('redirect_uri') === nativeAuthLink;
    const finish = (error?: Error, url?: string) => {
      if (finished) return;
      finished = true; token = undefined; pending?.abort(); clearTimeout(pollTimer); clearTimeout(timer); subscription.remove(); foreground.remove(); signal.removeEventListener('abort', abort); choose(undefined);
      if (error) reject(error); else resolve(url!);
    };
    const abort = () => finish(cancelled());
    const post = async (path: 'start' | 'result', body: object): Promise<unknown> => {
      const controller = new AbortController(); pending = controller;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let rejectAbort: () => void = () => {};
      try {
        return await Promise.race([
          (async () => {
            const response = await fetch(`https://mossvale.world/wallet-oidc/mobile/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
            if (!response.ok) throw Object.assign(Error('Could not prepare wallet sign-in. Check your connection and try again.'), { expired: [400, 401, 404, 409].includes(response.status) });
            return response.json();
          })(),
          new Promise<never>((_, reject) => {
            rejectAbort = () => reject(Error('Wallet sign-in connection was interrupted. Please try again.'));
            controller.signal.addEventListener('abort', rejectAbort, { once: true });
            timeout = setTimeout(() => controller.abort(), 10000);
          }),
        ]);
      } finally {
        clearTimeout(timeout); controller.signal.removeEventListener('abort', rejectAbort);
        if (pending === controller) pending = undefined;
      }
    };
    const poll = async () => {
      if (finished || !launched || !token || polling || AppState.currentState !== 'active') return;
      polling = true; clearTimeout(pollTimer);
      try {
        const result = await post('result', { state: request.state, token }) as { callback?: unknown };
        if (finished || AppState.currentState !== 'active') return;
        if (result?.callback !== null) {
          if (typeof result?.callback !== 'string') return finish(Error('Sign-in returned an invalid response. Please try again.'));
          try { authCallback(request, result.callback); } catch { return finish(Error('Sign-in returned an invalid or expired response. Please try again.')); }
          finish(undefined, result.callback);
        }
      } catch (error) {
        if ((error as { expired?: boolean })?.expired) finish(Error('Wallet sign-in expired. Please start again.'));
        // A brief outage or background pause can retry while the request remains valid.
      }
      finally {
        polling = false;
        if (!finished && AppState.currentState === 'active') pollTimer = setTimeout(() => { void poll(); }, 2000);
      }
    };
    const foreground = AppState.addEventListener('change', state => {
      if (state === 'active') void poll();
      else { clearTimeout(pollTimer); if (polling) pending?.abort(); }
    });
    // Listen before opening another app. Foregrounding alone never cancels sign-in.
    const subscription = Linking.addEventListener('url', ({ url }) => {
      try { authCallback(request, url); } catch { return; }
      finish(undefined, url);
    });
    const timer = setTimeout(() => finish(Error('Wallet sign-in expired. Please try again.')), request.expiresAt - Date.now());
    signal.addEventListener('abort', abort, { once: true });
    const open = async (wallet: WalletBrowser) => {
      if (finished || opening) return;
      opening = true; choose(undefined);
      try {
        const selected = walletBrowsers.find(value => value.id === wallet);
        if (!selected) throw Error('Choose a supported wallet.');
        let installed: string | undefined;
        for (const scheme of wallet === 'okx' ? ['okxwallet', 'okxweb3', 'okx'] : [selected.scheme]) {
          // Rabby's Android intent filter requires the browser host and path.
          const probe = wallet === 'rabby' ? `${scheme}://go.rabby.io/mobile/` : `${scheme}://`;
          if (await Linking.canOpenURL(probe)) { installed = scheme; break; }
          if (finished) return;
        }
        if (!installed) throw Error(`Install ${selected.name} to use this wallet.`);
        if (finished) return;
        requireActive(signal);
        // Start the entire login in this browser; the broker cookie stays there.
        const url = walletBrowserUrl(wallet, request);
        if (handoff) {
          const result = await post('start', { state: request.state }) as { token?: unknown };
          if (finished) return;
          if (typeof result?.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(result.token)) throw Error('Could not prepare wallet sign-in. Please try again.');
          token = result.token;
        }
        if (finished) return;
        requireActive(signal);
        await Linking.openURL(wallet === 'okx' ? url.replace(/^okxwallet:/, installed + ':') : url);
        if (finished) return;
        launched = true;
        void poll();
      } catch (error) { finish(error instanceof Error ? error : Error('Your wallet could not open. Please try again.')); }
    };
    choose(wallet => { void open(wallet); });
  });
}
