export interface NativeProduct { productId: string; displayPrice: string; title: string; description: string }
export interface NativeBillingEvent { type: 'billing'; status: 'pending' | 'delivered' | 'refunded' | 'cancelled' | 'error'; intentId?: string; productId?: string; message?: string; code?: string }
interface NativeClient {
  version: 1; platform: 'apple' | 'google';
  treasureWallet?: true;
  notifications?: true;
  request(method: string, params: Record<string, unknown>): Promise<unknown>;
  subscribe(listener: (event: NativeBillingEvent) => void): () => void;
}
type NativeWindow = Window & { __MOSSVALE_NATIVE_APP__?: { platform: 'apple' | 'google'; version: string | null; build: string | null }; __MOSSVALE_NATIVE__?: boolean; ReactNativeWebView?: { postMessage(message: string): void }; mossvaleNative?: NativeClient };
export const nativeClient = () => typeof window === 'undefined' ? undefined : (window as NativeWindow).mossvaleNative;
export const isNativeApp = () => typeof window !== 'undefined' && ((window as NativeWindow).__MOSSVALE_NATIVE__ === true || typeof (window as NativeWindow).ReactNativeWebView?.postMessage === 'function' || !!nativeClient());
let accessToken: string | null | undefined;
export function authorizeNativeBilling(token: string | null): void {
  if (!isNativeApp()) return;
  accessToken = token;
  void nativeClient()?.request('billing.authorize', { accessToken }).catch(() => {});
  if (nativeClient()?.notifications) void nativeClient()!.request('notifications.authorize', { accessToken }).catch(() => {});
}
if (typeof window !== 'undefined') window.addEventListener('mossvale-native-ready', () => { if (accessToken !== undefined) authorizeNativeBilling(accessToken); });
export function promptNativeNotifications(): void {
  if (accessToken && nativeClient()?.notifications) void nativeClient()!.request('notifications.prompt', {}).catch(() => {});
}

const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export function nativeUpdateLinks(): string {
  const platform = (window as NativeWindow).__MOSSVALE_NATIVE_APP__?.platform || nativeClient()?.platform
    || (/Android/i.test(navigator.userAgent) ? 'google' : /iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 ? 'apple' : undefined);
  return `${platform !== 'google' ? '<a class="native-update-link" href="https://apps.apple.com/app/id6811825860" target="_blank" rel="noopener noreferrer">Open Mossvale in the App Store</a>' : ''}${platform !== 'apple' ? '<a class="native-update-link" href="https://play.google.com/store/apps/details?id=world.mossvale.game" target="_blank" rel="noopener noreferrer">Open Mossvale in Google Play</a>' : ''}`;
}
export function renderUpdateGuidance(): string {
  const native = isNativeApp(), info = native ? (window as NativeWindow).__MOSSVALE_NATIVE_APP__ : undefined;
  const version = info?.version ? escape(String(info.version)) : 'unavailable', build = info?.build ? escape(String(info.build)) : 'unavailable';
  return `<h3>Updates</h3><p>Game fixes and content load from Mossvale automatically. When a new game version is ready, Mossvale reopens it when your session can safely reconnect.</p>${native ? `<p>Changes to the app itself, such as wallet sign-in, billing or support for new realms, need a separate app update.</p><p>Installed app version: <strong>${version}</strong><br>Installed app build: <strong>${build}</strong></p>${!info?.version || !info?.build ? '<p>This app does not report all its version details. Find them in your device’s app settings or TestFlight when contacting support.</p>' : ''}${nativeUpdateLinks()}<p>Installed through TestFlight? Open TestFlight to update Mossvale. Store availability depends on your testing invitation and region. If no update is available, contact <a class="adventure-link" href="mailto:support@mossvale.world">support@mossvale.world</a>.</p>` : '<p>You are playing in a web browser. You do not need an app-store update for this game.</p>'}`;
}
