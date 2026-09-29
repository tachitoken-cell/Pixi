import { nativeClient } from './native-client.ts';

type Tokens = { token: string; refreshToken: string; idToken?: string };
type Realm = { url: string; realm: string; clientId: string };

export function nativeAccountSession(realm: Realm) {
  if ((globalThis as typeof globalThis & { __MOSSVALE_NATIVE_SESSION__?: boolean }).__MOSSVALE_NATIVE_SESSION__ !== true) return;
  const binding = { issuer: `${realm.url.replace(/\/$/, '')}/realms/${encodeURIComponent(realm.realm)}`, clientId: realm.clientId };
  let stopped = false, lastSaved = '', pending = Promise.resolve<unknown>(undefined);
  let saving: Promise<void> | undefined;
  let clearing: Promise<void> | undefined;
  async function client() {
    if (nativeClient()) return nativeClient()!;
    await new Promise<void>((resolve, reject) => {
      const ready = () => { clearTimeout(timer); window.removeEventListener('mossvale-native-ready', ready); resolve(); };
      // Older native builds install the bridge at load end; allow their full
      // 30-second document deadline rather than failing while assets still load.
      const timer = setTimeout(() => { window.removeEventListener('mossvale-native-ready', ready); reject(Error('Secure sign-in is not ready. Reopen the app to try again.')); }, 30000);
      window.addEventListener('mossvale-native-ready', ready);
      if (nativeClient()) ready();
    });
    const result = nativeClient();
    if (!result) throw Error('Secure sign-in is not ready. Reopen the app to try again.');
    return result;
  }
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation, operation); pending = result.catch(() => {}); return result;
  }
  return {
    restore: () => enqueue(async () => {
      const result = await (await client()).request('auth.restore', binding);
      if (result === null) return undefined;
      if (!result || typeof result !== 'object' || typeof (result as Tokens).token !== 'string' || typeof (result as Tokens).refreshToken !== 'string' || ((result as Tokens).idToken !== undefined && typeof (result as Tokens).idToken !== 'string')) throw Error('Secure sign-in could not be restored. Sign in again.');
      return result as Tokens;
    }),
    save(tokens: { token?: string; refreshToken?: string; idToken?: string }) {
      if (stopped || !tokens.token || !tokens.refreshToken) return Promise.resolve();
      const snapshot = { token: tokens.token, refreshToken: tokens.refreshToken, ...(tokens.idToken ? { idToken: tokens.idToken } : {}) };
      const signature = JSON.stringify(snapshot);
      if (signature === lastSaved) return saving!;
      lastSaved = signature;
      return saving = enqueue(async () => {
        if (stopped) return;
        try { await (await client()).request('auth.save', { ...binding, ...snapshot }); }
        catch (error) { if (lastSaved === signature) lastSaved = ''; throw error; }
      });
    },
    clear() {
      if (clearing) return clearing;
      stopped = true; lastSaved = '';
      clearing = enqueue(async () => { await (await client()).request('auth.clear', {}); });
      void clearing.catch(() => { clearing = undefined; });
      return clearing;
    },
  };
}
