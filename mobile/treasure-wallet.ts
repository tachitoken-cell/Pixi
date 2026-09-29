import { AppState, Linking } from 'react-native';
import { fetch } from 'expo/fetch';
import { walletBrowsers, walletPageUrl, type WalletBrowser } from './navigation';
import { NativeError, cancelled, fields, requireActive, trustedGamePage, type NativeRequest } from './native-bridge';

type Kind = 'connect' | 'sign' | 'claim';
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const hex = (value: unknown, length: number) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`, 'i').test(value);
const address = (value: unknown) => typeof value === 'string' && /^0x[\da-f]{40}$/i.test(value) && !/^0x0{40}$/i.test(value);
const interrupted = () => new NativeError(-32000, 'Wallet action interrupted. Check your payout and wallet activity before trying again.');

export function createTreasureWallet(options: {
  blocked: () => boolean;
  authorization: (origin: string) => string;
  choose: (select: ((wallet: WalletBrowser) => void) | undefined) => void;
  pending: (value: { controller: AbortController; kind: Kind } | undefined) => void;
}) {
  let selected: WalletBrowser | undefined, current: AbortController | undefined;
  async function execute({ method, params, signal, url }: NativeRequest): Promise<unknown> {
    requireActive(signal);
    if (current || options.blocked()) throw new NativeError(-32002, 'Finish the current wallet action or sign-in first.');
    if (!trustedGamePage(url.href, url.origin, false)) throw new NativeError(4100, 'Open your voucher from Mossvale.');
    const kind = method === 'treasure.connect' ? 'connect' : method === 'treasure.sign' ? 'sign' : method === 'treasure.collect' ? 'claim' : undefined;
    if (!kind) throw new NativeError(4200, 'This wallet action is unavailable.');
    fields(params, kind === 'connect' ? [] : kind === 'sign' ? ['address', 'message', 'expiresAt'] : ['claim']);
    if (kind === 'sign' && (!address(params.address) || typeof params.message !== 'string' || params.message.length > 4096 || !Number.isSafeInteger(params.expiresAt)
        || Number(params.expiresAt) <= Date.now() || Number(params.expiresAt) > Date.now() + 300000)
        || kind === 'claim' && (!record(params.claim) || JSON.stringify(params.claim).length > 24000)) throw new NativeError(-32602, 'Invalid voucher wallet action.');
    const controller = new AbortController(); current = controller;
    const abort = () => controller.abort(); signal.addEventListener('abort', abort, { once: true });
    options.pending({ controller, kind });
    try {
      return await new Promise((resolve, reject) => {
        let finished = false, opening = false, launched = false, polling = false;
        let id: string | undefined, readToken: string | undefined, walletToken: string | undefined;
        let expiresAt = Math.min(Date.now() + 170000, kind === 'sign' ? Number(params.expiresAt) : Infinity);
        let request: AbortController | undefined, pollTimer: ReturnType<typeof setTimeout> | undefined;
        const finish = (error?: Error, result?: unknown) => {
          if (finished) return;
          finished = true; id = readToken = walletToken = undefined; request?.abort(); clearTimeout(timer); clearTimeout(pollTimer);
          subscription.remove(); foreground.remove(); controller.signal.removeEventListener('abort', cancel); options.choose(undefined);
          if (error) reject(error); else resolve(result);
        };
        const cancel = () => finish(kind === 'claim' && launched ? interrupted() : cancelled());
        const post = async (path: 'start' | 'result', body: object): Promise<unknown> => {
          const pending = new AbortController(); request = pending;
          let timeout: ReturnType<typeof setTimeout> | undefined, rejectAbort: () => void = () => {};
          try {
            return await Promise.race([
              (async () => {
                const response = await fetch(`${url.origin}/api/native-wallet/${path}`, { method: 'POST', redirect: 'error',
                  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(path === 'start' ? { Authorization: `Bearer ${options.authorization(url.origin)}` } : {}) }, body: JSON.stringify(body), signal: pending.signal });
                if (!response.ok) throw Object.assign(new NativeError(response.status === 401 ? 4100 : 4000, response.status === 401 ? 'Sign in to Mossvale again before linking or collecting.' : 'The wallet action is unavailable or expired. Check your payout before trying again.'), { expired: [400, 401, 403, 404, 409, 410].includes(response.status) });
                return response.json();
              })(),
              new Promise<never>((_, reject) => {
                rejectAbort = () => reject(interrupted()); pending.signal.addEventListener('abort', rejectAbort, { once: true });
                timeout = setTimeout(() => pending.abort(), 10000);
              }),
            ]);
          } finally { clearTimeout(timeout); pending.signal.removeEventListener('abort', rejectAbort); if (request === pending) request = undefined; }
        };
        const poll = async () => {
          if (finished || !launched || !id || !readToken || polling || AppState.currentState !== 'active') return;
          if (Date.now() >= expiresAt) { finish(interrupted()); return; }
          polling = true; clearTimeout(pollTimer);
          try {
            const response = await post('result', { id, token: readToken });
            if (finished || AppState.currentState !== 'active') return;
            if (!record(response) || Object.keys(response).length !== 1 || !Object.hasOwn(response, 'result')) { finish(interrupted()); return; }
            const result = response.result;
            if (result === null) return;
            if (!record(result) || Object.keys(result).length !== 1) { finish(interrupted()); return; }
            if (record(result.error) && Number.isSafeInteger(result.error.code) && typeof result.error.message === 'string' && result.error.message.length <= 500) {
              finish(new NativeError(Number(result.error.code), result.error.message)); return;
            }
            const valid = kind === 'connect' ? address(result.address) : kind === 'sign' ? typeof result.signature === 'string' && /^0x[\da-f]{130}$/i.test(result.signature)
              : typeof result.transactionHash === 'string' && /^0x[\da-f]{64}$/i.test(result.transactionHash);
            if (!valid) { finish(interrupted()); return; }
            finish(undefined, result);
          } catch (error) { if ((error as { expired?: boolean })?.expired) finish(kind === 'claim' && launched ? interrupted() : error as Error); }
          finally { polling = false; if (!finished && AppState.currentState === 'active') pollTimer = setTimeout(() => { void poll(); }, 2000); }
        };
        const foreground = AppState.addEventListener('change', state => {
          if (state === 'active') void poll(); else { clearTimeout(pollTimer); request?.abort(); }
        });
        // A return link only wakes secret polling; it never supplies a trusted result.
        const subscription = Linking.addEventListener('url', ({ url: value }) => {
          try {
            const callback = new URL(value), fragment = new URLSearchParams(callback.hash.slice(1));
            if (trustedGamePage(callback.origin + '/', url.origin, false) && callback.pathname === '/mobile-auth/callback' && !callback.search && !callback.username && !callback.password
                && [...fragment.keys()].length === 1 && fragment.get('walletAction') === id) void poll();
          } catch { /* Unrelated or malformed links cannot complete a wallet action. */ }
        });
        const timer = setTimeout(() => finish(interrupted()), expiresAt - Date.now());
        controller.signal.addEventListener('abort', cancel, { once: true });
        const open = async (wallet: WalletBrowser) => {
          if (finished || opening) return;
          opening = true; options.choose(undefined);
          try {
            const choice = walletBrowsers.find(value => value.id === wallet);
            if (!choice) throw new NativeError(-32602, 'Choose a supported wallet.');
            let installed: string | undefined;
            for (const scheme of wallet === 'okx' ? ['okxwallet', 'okxweb3', 'okx'] : [choice.scheme]) {
              if (await Linking.canOpenURL(wallet === 'rabby' ? `${scheme}://go.rabby.io/mobile/` : `${scheme}://`)) { installed = scheme; break; }
              if (finished) return;
            }
            if (finished) return;
            if (!installed) throw new NativeError(4200, `Install ${choice.name} to use this wallet.`);
            const response = await post('start', { operation: { kind, ...params } });
            if (finished) return;
            if (!record(response) || Object.keys(response).length !== 4 || !hex(response.id, 64) || !hex(response.readToken, 64) || !hex(response.walletToken, 64)
                || !Number.isSafeInteger(response.expiresAt) || Number(response.expiresAt) <= Date.now() || Number(response.expiresAt) > Date.now() + 180000) throw interrupted();
            id = response.id as string; readToken = response.readToken as string; walletToken = response.walletToken as string;
            expiresAt = Math.min(expiresAt, Number(response.expiresAt));
            const page = `${url.origin}/wallet-action.html#${new URLSearchParams({ id, token: walletToken })}`;
            const link = walletPageUrl(wallet, page, url.origin);
            selected = wallet; launched = true; // A rejected open can still have reached the wallet.
            await Linking.openURL(wallet === 'okx' ? link.replace(/^okxwallet:/, installed + ':') : link);
            if (!finished) void poll();
          } catch (error) { finish(error instanceof NativeError ? error : kind === 'claim' && launched ? interrupted() : new NativeError(4000, 'Your wallet could not open. Please try again.')); }
        };
        if (kind === 'connect' || !selected) options.choose(wallet => { void open(wallet); });
        else void open(selected);
      });
    } finally {
      signal.removeEventListener('abort', abort);
      if (current === controller) { current = undefined; options.pending(undefined); }
    }
  }
  return { execute, busy: () => !!current, clear() { selected = undefined; current?.abort(); } };
}
