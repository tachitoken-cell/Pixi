import * as SecureStore from 'expo-secure-store';
import { NativeError, fields, requireActive, type NativeRequest } from './native-bridge';

type Binding = { issuer: string; clientId: string };
type Tokens = { token: string; refreshToken: string; idToken?: string };
const key = 'mossvale.auth.session';
const storageOptions = { keychainService: 'world.mossvale.game.auth', keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const jwt = (value: unknown): value is string => typeof value === 'string' && value.length <= 16384 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
function tokens(value: Record<string, unknown>): Tokens {
  if (!jwt(value.token) || !jwt(value.refreshToken) || (value.idToken !== undefined && !jwt(value.idToken))) throw new NativeError(-32602, 'Invalid saved sign-in.');
  return { token: value.token, refreshToken: value.refreshToken, ...(value.idToken === undefined ? {} : { idToken: value.idToken }) };
}

export function createAuthSessionService(options: { configuredAuth: () => Binding | undefined }) {
  // All realms use the same account. One serialized record prevents old rotations reviving a logout.
  let pending: Promise<unknown> = Promise.resolve();
  function binding(value: Record<string, unknown>): Binding {
    const configured = options.configuredAuth();
    if (!configured || value.issuer !== configured.issuer || value.clientId !== configured.clientId) throw new NativeError(4100, 'Sign-in settings have changed. Please sign in again.');
    return { issuer: configured.issuer, clientId: configured.clientId };
  }
  async function execute({ method, params, signal }: NativeRequest): Promise<unknown> {
    requireActive(signal);
    let saved: (Binding & Tokens) | undefined;
    if (method === 'auth.clear') fields(params, []);
    else if (method === 'auth.restore') { fields(params, ['issuer', 'clientId']); binding(params); }
    else if (method === 'auth.save') { fields(params, ['issuer', 'clientId', 'token', 'refreshToken'], ['idToken']); saved = { ...binding(params), ...tokens(params) }; }
    else throw new NativeError(4200, 'This native action is unavailable in the app.');
    const task = pending.then(async () => {
      // Accepted writes finish across reloads: losing a rotated token would strand wallet sign-in.
      // Queue order ensures a later logout or successful sign-in always wins.
      if (method === 'auth.clear') { await SecureStore.deleteItemAsync(key, storageOptions); return { cleared: true }; }
      if (method === 'auth.save') {
        await SecureStore.setItemAsync(key, JSON.stringify(saved), storageOptions);
        return { saved: true };
      }
      requireActive(signal);
      const configured = binding(params);
      const stored = await SecureStore.getItemAsync(key, storageOptions);
      requireActive(signal); binding(params);
      if (stored === null) return null;
      try {
        const value: unknown = JSON.parse(stored);
        if (!record(value)) throw Error();
        fields(value, ['issuer', 'clientId', 'token', 'refreshToken'], ['idToken']);
        if (value.issuer !== configured.issuer || value.clientId !== configured.clientId) return null;
        return tokens(value);
      } catch {
        await SecureStore.deleteItemAsync(key, storageOptions);
        return null;
      }
    }).catch(cause => {
      if (cause instanceof NativeError) throw cause;
      throw new NativeError(4000, 'Saved sign-in could not be updated. Please try again.');
    });
    pending = task.catch(() => {});
    return task;
  }
  return { execute };
}
