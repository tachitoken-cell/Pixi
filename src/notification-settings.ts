import { isNativeApp, nativeClient, nativeUpdateLinks } from './native-client';

type Preferences = { worldEvents: boolean; invites: boolean; reminders: boolean };
type NotificationStatus = { permission: 'undetermined' | 'granted' | 'denied'; canAskAgain: boolean; registered: boolean; hasChosen?: boolean; pendingRemoval?: boolean; preferences: Preferences };
const choices = [
  ['worldEvents', 'World events', 'Instant Combat signup and returning world bosses on your realm.'],
  ['invites', 'Invites', 'Friend requests, party invites and raid invites.'],
  ['reminders', 'Come back to Mossvale', 'A daily reminder starting after 24 hours away. Playing again resets it.'],
] as const;

export function mountNotificationSettings(host: HTMLElement): void {
  const section = document.createElement('section');
  section.className = 'notification-settings';
  host.replaceChildren(section);
  if (!isNativeApp()) {
    section.innerHTML = '<h3>Notifications</h3><p>Push notifications are available in the Mossvale mobile app. Open Settings → Notifications in the app to choose your alerts.</p>';
    return;
  }
  const client = nativeClient();
  if (!client?.notifications) {
    section.innerHTML = `<h3>Notifications</h3><p>Update the Mossvale app to use push notifications. If you use TestFlight, update through TestFlight.</p>${nativeUpdateLinks()}`;
    return;
  }
  section.innerHTML = `<h3>Notifications</h3><p>Choose which alerts this device can receive while you are away. Notifications are optional.</p><form>${choices.map(([key, label, hint]) => `<label class="settings-row graphics-row" for="notify-${key}"><span>${label}<small id="notify-${key}-hint">${hint}</small></span><input id="notify-${key}" type="checkbox" aria-describedby="notify-${key}-hint" disabled></label>`).join('')}<p role="status" aria-live="polite">Checking notification settings…</p><button type="submit" class="primary-button" disabled>Save notification choices</button></form><button type="button" class="primary-button" data-notification-settings hidden>Open device settings</button><button type="button" class="primary-button" data-notification-refresh>Refresh status</button>`;
  const status = section.querySelector<HTMLElement>('[role="status"]')!;
  const form = section.querySelector('form')!;
  const save = form.querySelector('button')!;
  const settings = section.querySelector<HTMLButtonElement>('[data-notification-settings]')!;
  const refresh = section.querySelector<HTMLButtonElement>('[data-notification-refresh]')!;
  const inputs = choices.map(([key]) => section.querySelector<HTMLInputElement>(`#notify-${key}`)!);
  let loaded = false, busy = false;
  async function request(method: string, params: Record<string, unknown> = {}) {
    if (busy) return;
    busy = true;
    for (const control of [...inputs, save, settings, refresh]) control.disabled = true;
    status.textContent = method === 'notifications.configure' ? 'Saving notification choices…' : 'Checking notification settings…';
    try {
      const result = await client!.request(method, params) as NotificationStatus;
      if (!section.isConnected) return;
      loaded = true;
      choices.forEach(([key], index) => { inputs[index].checked = result.hasChosen === false ? key !== 'reminders' : result.preferences[key]; });
      settings.hidden = result.permission !== 'denied';
      status.textContent = result.pendingRemoval ? 'Your choices are saved on this device. Waiting for a connection to stop previous alerts; they may still arrive until then.'
        : result.permission === 'denied' ? 'Notifications are blocked. Allow them in device settings, then save your choices again.'
        : result.hasChosen === false ? 'World events and invites are selected for you. Save to enable them; daily reminders are optional.'
        : !Object.values(result.preferences).some(Boolean) ? 'All notifications are off on this device.'
        : result.registered ? 'Your notification choices are saved on this device.'
        : 'Notifications are not connected yet. Save your choices to try again.';
    } catch (error) {
      if (section.isConnected) status.textContent = `${error instanceof Error ? error.message : 'Notification settings are unavailable.'} Try again.`;
    } finally {
      busy = false;
      for (const control of [...inputs, save]) control.disabled = !loaded;
      settings.disabled = refresh.disabled = false;
    }
  }
  form.onsubmit = event => {
    event.preventDefault();
    if (loaded) void request('notifications.configure', { preferences: Object.fromEntries(choices.map(([key], index) => [key, inputs[index].checked])) });
  };
  settings.onclick = () => { void client.request('notifications.settings', {}).catch(() => { status.textContent = 'Open your device settings and allow notifications for Mossvale.'; }); };
  refresh.onclick = () => { void request('notifications.status'); };
  void request('notifications.status');
}
