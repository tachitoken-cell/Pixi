import { Alert, AppState, Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { NativeError, fields, randomDocumentId, requireActive, trustedGamePage, type NativeRequest } from './native-bridge';

type Preferences = { worldEvents: boolean; invites: boolean; reminders: boolean };
type Registration = { token: string; revokeSecret: string; origin: string };
type Saved = { account?: string; preferences: Preferences; registration?: Registration; pending: Registration[]; choices: Record<string, Preferences>; prompted: string[] };
type Authorization = { account: string; token: string; origin: string };
const key = 'mossvale.notifications';
const storageOptions = { keychainService: 'world.mossvale.game.notifications', keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const off = (): Preferences => ({ worldEvents: false, invites: false, reminders: false });
const enabled = (preferences: Preferences) => Object.values(preferences).some(Boolean);
const tokenPattern = /^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{1,200}\]$/;

async function pushToken(projectId: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Notifications.getExpoPushTokenAsync({ projectId }),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new NativeError(4000, 'This device could not register for notifications. Please try again.')), 15000); }),
    ]);
  } finally { clearTimeout(timer); }
}

// The game already presents live events and invitations while it is open.
Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false }) });

function preferences(value: unknown): Preferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new NativeError(-32602, 'Invalid notification preferences.');
  fields(value as Record<string, unknown>, ['worldEvents', 'invites', 'reminders']);
  if (Object.values(value).some(item => typeof item !== 'boolean')) throw new NativeError(-32602, 'Invalid notification preferences.');
  return { ...value } as Preferences;
}

function account(token: unknown): string {
  if (typeof token !== 'string' || token.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new NativeError(4100, 'Sign in to manage notifications.');
  try {
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')));
    if (typeof claims.sub !== 'string' || !claims.sub || typeof claims.iss !== 'string' || !claims.iss) throw Error();
    // Only separates this device's preferences; the server verifies the bearer token.
    return JSON.stringify([claims.iss, claims.sub]);
  } catch { throw new NativeError(4100, 'Sign in to manage notifications.'); }
}

export function createNativeNotifications(options: { request: typeof fetch; configuredUrl: string; development: boolean }) {
  let saved: Saved | undefined, authorization: Authorization | undefined, generation = 0;
  let registered = false, pending: Promise<unknown> = Promise.resolve();
  let listeners: { remove(): void }[] = [];
  const serialize = <T,>(run: () => Promise<T>): Promise<T> => {
    const task = pending.then(run); pending = task.catch(() => {}); return task;
  };
  const validRegistration = (value: Registration) => value && tokenPattern.test(value.token) && /^[a-f0-9]{64}$/.test(value.revokeSecret)
    && trustedGamePage(value.origin + '/', options.configuredUrl, options.development)?.origin === value.origin;
  async function load() {
    if (saved) return saved;
    const raw = await SecureStore.getItemAsync(key, storageOptions);
    if (raw) {
      try {
        const value = JSON.parse(raw) as Saved;
        if (value.account !== undefined && typeof value.account !== 'string' || !Array.isArray(value.pending) || value.pending.some(item => !validRegistration(item)) || value.registration && !validRegistration(value.registration)) throw Error();
        value.choices ||= value.account ? { [value.account]: preferences(value.preferences) } : {};
        value.prompted ||= [];
        if (!value.choices || typeof value.choices !== 'object' || Array.isArray(value.choices) || !Array.isArray(value.prompted) || value.prompted.some(item => typeof item !== 'string')) throw Error();
        for (const choice of Object.values(value.choices)) preferences(choice);
        saved = { ...value, preferences: preferences(value.preferences) }; return saved;
      } catch { /* Invalid local state cannot grant notification consent. */ }
    }
    saved = { preferences: off(), pending: [], choices: {}, prompted: [] }; return saved;
  }
  async function persist() { await SecureStore.setItemAsync(key, JSON.stringify(saved), storageOptions); }
  async function request(origin: string, path: string, body: unknown, token?: string) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const response = await options.request(origin + '/api/notifications/' + path, {
            method: 'POST', redirect: 'error', signal: controller.signal,
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
          });
          const result: unknown = await response.json();
          if (!response.ok || !result || typeof result !== 'object') throw new NativeError(4000, response.status === 503 ? 'Notifications are not available on this realm yet.' : 'Notification settings could not sync. Please try again.');
          return result as { registered?: boolean };
        })(),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new NativeError(4000, 'Notification settings could not sync. Check your connection and try again.')); }, 15000); }),
      ]);
    } finally { clearTimeout(timer); }
  }
  async function revoke() {
    const state = await load();
    if (!state.registration) return;
    state.pending.push(state.registration); delete state.registration; registered = false;
    // Save the revocation capability before trying the network; never retain an old access token.
    await persist();
  }
  async function flushRevocations() {
    const state = await load();
    for (const registration of [...state.pending]) {
      try {
        const result = await request(registration.origin, 'unregister', { token: registration.token, revokeSecret: registration.revokeSecret });
        if (result.registered !== false) throw Error();
        state.pending.splice(state.pending.indexOf(registration), 1); await persist();
      } catch { break; }
    }
  }
  async function status(permission?: Notifications.NotificationPermissionsStatus) {
    const state = await load(), access = permission || await Notifications.getPermissionsAsync();
    return { permission: access.status, canAskAgain: access.canAskAgain, registered: registered && access.granted, pendingRemoval: state.pending.length > 0,
      hasChosen: !!authorization && Object.hasOwn(state.choices, authorization.account),
      preferences: { ...(authorization?.account === state.account ? state.preferences : off()) } };
  }
  async function sync(expected = generation) {
    const auth = authorization, state = await load();
    await flushRevocations();
    if (expected !== generation || !auth || authorization?.account !== auth.account) return status();
    if (state.account !== auth.account) {
      await revoke(); state.account = auth.account; state.preferences = { ...(state.choices[auth.account] || off()) }; await persist(); await flushRevocations();
    }
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted || !enabled(state.preferences)) { await revoke(); await flushRevocations(); return status(permission); }
    const projectId = Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) throw new NativeError(4000, 'Install the latest Mossvale app to enable notifications.');
    const token = (await pushToken(projectId)).data;
    if (expected !== generation || authorization?.account !== auth.account) return status(permission);
    if (!tokenPattern.test(token)) throw new NativeError(4000, 'This device could not register for notifications.');
    if (state.registration && (state.registration.token !== token || state.registration.origin !== auth.origin)) { await revoke(); await flushRevocations(); }
    // Persist first so a timed-out registration can always be revoked on logout.
    state.registration ||= { token, origin: auth.origin, revokeSecret: randomDocumentId() + randomDocumentId() };
    await persist();
    if (expected !== generation || authorization?.account !== auth.account) return status(permission);
    registered = false;
    const result = await request(auth.origin, 'register', { token, revokeSecret: state.registration.revokeSecret, platform: Platform.OS, preferences: state.preferences }, auth.token);
    if (result.registered !== true) throw new NativeError(4000, 'Notification settings could not sync. Please try again.');
    if (expected === generation && authorization?.account === auth.account) registered = true;
    return status(permission);
  }
  async function signOut() {
    authorization = undefined; generation++; registered = false;
    const task = serialize(async () => {
      const state = await load(); await revoke(); delete state.account; state.preferences = off(); await persist();
      return status();
    });
    // Logout only waits for durable local removal. Connectivity cannot delay clearing sign-in.
    void task.then(() => serialize(flushRevocations)).catch(() => {});
    return task;
  }
  async function execute({ method, params, signal, url }: NativeRequest): Promise<unknown> {
    requireActive(signal);
    if (method === 'notifications.authorize') {
      fields(params, ['accessToken']);
      if (params.accessToken === null) return signOut();
      const next = { account: account(params.accessToken), token: params.accessToken as string, origin: url.origin };
      if (authorization?.account !== next.account || authorization.origin !== next.origin) { generation++; registered = false; }
      authorization = next;
      const expected = generation;
      return serialize(() => sync(expected));
    }
    if (method === 'notifications.settings') { fields(params, []); await Linking.openSettings(); return { opened: true }; }
    if (method === 'notifications.prompt') {
      fields(params, []);
      const auth = authorization, expected = generation;
      return serialize(async () => {
        const state = await load();
        if (!auth || signal.aborted || expected !== generation || Object.hasOwn(state.choices, auth.account) || state.prompted.includes(auth.account)) return { shown: false };
        const permission = await Notifications.getPermissionsAsync();
        if (signal.aborted || expected !== generation || permission.status === 'denied' || AppState.currentState !== 'active') return { shown: false };
        state.prompted.push(auth.account); await persist();
        if (signal.aborted || expected !== generation) return { shown: false };
        const enable = (reminders: boolean) => {
          if (expected !== generation || authorization?.account !== auth.account) return;
          void execute({ method: 'notifications.configure', params: { preferences: { worldEvents: true, invites: true, reminders } }, signal, url })
            .catch(error => { if (expected === generation) Alert.alert('Notifications', error instanceof Error ? error.message : 'Open Settings → Notifications to try again.'); });
        };
        Alert.alert('Stay in the adventure', 'Get world event alerts and invitations while Mossvale is closed. You can also add a daily reminder after 24 hours away. Change any alert in Settings → Notifications.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Enable events & invites', onPress: () => enable(false) },
          { text: 'Add daily reminders too', onPress: () => enable(true) },
        ], { cancelable: true });
        return { shown: true };
      });
    }
    if (method === 'notifications.status') {
      fields(params, []);
      return serialize(async () => {
        const permission = await Notifications.getPermissionsAsync();
        if (!permission.granted) await revoke();
        await flushRevocations();
        return status(permission);
      });
    }
    if (method !== 'notifications.configure') throw new NativeError(4200, 'This native action is unavailable in the app.');
    fields(params, ['preferences']);
    const desired = preferences(params.preferences), expected = generation, auth = authorization;
    if (!auth) throw new NativeError(4100, 'Sign in to manage notifications.');
    return serialize(async () => {
      requireActive(signal);
      if (expected !== generation || authorization?.account !== auth.account) throw new NativeError(4100, 'Sign in to manage notifications.');
      const state = await load();
      let permission = await Notifications.getPermissionsAsync();
      if (enabled(desired) && !permission.granted) {
        if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('mossvale', { name: 'Mossvale', importance: Notifications.AndroidImportance.HIGH, sound: 'default', enableVibrate: true });
        if (permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
      }
      requireActive(signal);
      if (expected !== generation || authorization?.account !== auth.account) throw new NativeError(4100, 'Sign in to manage notifications.');
      if (enabled(desired) && !permission.granted) return status(permission);
      if (Platform.OS === 'android' && enabled(desired)) await Notifications.setNotificationChannelAsync('mossvale', { name: 'Mossvale', importance: Notifications.AndroidImportance.HIGH, sound: 'default', enableVibrate: true });
      if (state.account !== auth.account) await revoke();
      state.account = auth.account; state.preferences = desired; state.choices[auth.account] = { ...desired }; await persist();
      return sync(expected);
    });
  }
  function start() {
    if (listeners.length) return;
    const refresh = () => { void serialize(() => sync()).catch(() => {}); };
    listeners = [AppState.addEventListener('change', state => { if (state === 'active') refresh(); }), Notifications.addPushTokenListener(refresh)];
    // Tapping a notification simply resumes the game. Notification data never navigates or accepts invitations.
    refresh();
  }
  function pause() { authorization = undefined; generation++; registered = false; }
  return { execute, signOut, start, pause, stop() { pause(); for (const listener of listeners) listener.remove(); listeners = []; } };
}
