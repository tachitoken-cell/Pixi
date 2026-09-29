import { parseAppUpdatePolicy, requiredAppUpdate, type AppPlatform } from '../mobile/app-update.ts';
import { isNativeApp, nativeClient, nativeUpdateLinks } from './native-client.ts';

/** Older store binaries load this gate with the current web game before restoring an account. */
export async function requireNativeAppUpdate(value: unknown): Promise<void> {
  if (!isNativeApp()) return;
  const policy = parseAppUpdatePolicy(value);
  if (!policy.apple && !policy.google) return;
  const info = (window as Window & { __MOSSVALE_NATIVE_APP__?: { platform?: AppPlatform; version?: string | null; build?: string | null } }).__MOSSVALE_NATIVE_APP__;
  const reported = info?.platform || nativeClient()?.platform;
  const platform = reported === 'apple' || reported === 'google' ? reported
    : /Android/i.test(navigator.userAgent) ? 'google'
    : /iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 ? 'apple' : undefined;
  if (platform && !requiredAppUpdate(policy, { platform, version: info?.version ?? undefined, build: info?.build ?? undefined })) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'native-app-update'; dialog.className = 'panel';
  dialog.setAttribute('aria-labelledby', 'native-app-update-title');
  dialog.setAttribute('aria-describedby', 'native-app-update-description');
  dialog.setAttribute('closedby', 'none');
  dialog.innerHTML = `<h2 id="native-app-update-title">Update Mossvale to continue</h2>
    <p id="native-app-update-description">Install the required Mossvale app update, then reopen the game.</p>
    ${nativeUpdateLinks()}<button type="button" class="primary-button">Check again</button>
    <p>Using TestFlight? Open TestFlight to update Mossvale. If no update is available, contact <a href="mailto:support@mossvale.world">support@mossvale.world</a>.</p>`;
  dialog.addEventListener('cancel', event => event.preventDefault());
  dialog.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); } });
  dialog.querySelector('button')!.onclick = () => location.reload();
  document.body.append(dialog); dialog.showModal();
  // Keep authentication pending: neither a guest path nor a later asset error can admit this binary.
  await new Promise<void>(() => {});
}
