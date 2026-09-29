import { isNativeApp } from './native-client.ts';
import './website-tag.css';

const pixelId = 'rftxa';
const storageKey = 'mossvale-x-advertising-v1';
type Choice = 'allowed' | 'denied' | null;
type Pixel = ((...args: unknown[]) => void) & { queue: unknown[][]; version: string; exe?: (...args: unknown[]) => void };
let mounted = false, loaded = false;

function savedChoice(): Choice {
  try {
    const value = localStorage.getItem(storageKey);
    return value === 'allowed' || value === 'denied' ? value : null;
  } catch { return null; }
}

function privacySignal(): boolean {
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true || navigator.doNotTrack === '1';
}

function loadPixel() {
  // Only the public game entry is tagged; never auth, wallet, account or development pages.
  if (loaded || isNativeApp() || privacySignal() || location.protocol !== 'https:'
    || !['mossvale.world', 'www.mossvale.world', 'eu.mossvale.world', 'us.mossvale.world', 'asia.mossvale.world'].includes(location.hostname)
    || !['/', '/index.html'].includes(location.pathname)) return;
  // Do not expose sign-in responses or arbitrary query data to a third-party tag.
  if (location.hash || [...new URLSearchParams(location.search).keys()].some(key => !['twclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].includes(key))) return;
  loaded = true;
  const target = window as Window & { twq?: Pixel };
  const pixel: Pixel = Object.assign((...args: unknown[]) => {
    if (pixel.exe) pixel.exe(...args); else pixel.queue.push(args);
  }, { queue: [] as unknown[][], version: '1.1' });
  target.twq = pixel;
  // X implements these switches in https://static.ads-twitter.com/uwt.js (not in its setup docs).
  // Keep automatic form matching and extra events off; recheck them if the vendor API changes.
  for (const option of ['autoAdvancedMatching', 'autoConfig', 'dataLayerTracking', 'autoDwellTracking']) pixel('set', option, 'false', pixelId);
  pixel('config', pixelId);
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://static.ads-twitter.com/uwt.js';
  script.referrerPolicy = 'no-referrer';
  document.head.append(script);
}

export function mountWebsiteTag() {
  if (mounted || isNativeApp()) return;
  mounted = true;
  const preferences = document.getElementById('x-advertising-choices');
  let choice = savedChoice();
  const dialog = preferences ? null : document.createElement('dialog');
  const panel = dialog || document.createElement('section');
  let continueToGame = () => {};
  const decision = dialog ? new Promise<void>(resolve => { continueToGame = resolve; }) : undefined;
  panel.className = preferences ? 'x-advertising' : 'x-advertising x-advertising-dialog';
  panel.setAttribute('aria-labelledby', 'x-advertising-title');
  panel.innerHTML = '<h2 id="x-advertising-title" tabindex="-1"' + (dialog ? ' autofocus' : '') + '>Allow X advertising cookies?</h2>'
    + '<p class="x-advertising-purpose">Allow X to use your visits to show you Mossvale ads on X and help us measure which ads work.</p>'
    + '<p>X receives visit and browser information, including your IP address and cookie identifiers, and may link it to your X account.</p>'
    + '<p><strong>' + (dialog ? 'Choose once to continue. Both options let you play.' : 'Optional. You can play either way.') + '</strong></p>'
    + '<div class="x-advertising-actions"><button type="button" data-x-choice="allowed">Allow X cookies</button><button type="button" data-x-choice="denied">Decline X cookies</button></div>'
    + '<p class="x-advertising-preferences"><span>Change your choice anytime in</span> <a href="/privacy.html#advertising">Privacy and cookie choices</a>.</p>'
    + '<p class="x-advertising-status" role="status"></p>';
  const status = panel.querySelector<HTMLElement>('[role="status"]')!;
  dialog?.addEventListener('cancel', event => event.preventDefault());
  dialog?.addEventListener('keydown', event => {
    if (event.key === 'Escape') event.preventDefault();
    event.stopPropagation();
  });
  const render = () => {
    panel.hidden = !preferences && (choice !== null || privacySignal());
    if (dialog) {
      if (!panel.hidden && !dialog.open) dialog.showModal();
      else if (panel.hidden) {
        if (dialog.open) dialog.close();
        continueToGame();
      }
    }
    status.textContent = privacySignal() ? 'X advertising is off because your browser requests no tracking.' : choice === 'allowed' ? 'X advertising is allowed on this website in this browser.' : 'X advertising is off.';
    panel.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
      button.disabled = button.dataset.xChoice === 'allowed' && privacySignal();
      button.setAttribute('aria-pressed', String(button.dataset.xChoice === (privacySignal() ? 'denied' : choice)));
    });
  };
  panel.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.addEventListener('click', () => {
    choice = button.dataset.xChoice as Choice;
    try { localStorage.setItem(storageKey, choice!); } catch {
      // A storage failure must not block play or enable tracking without a saved choice.
      if (dialog) {
        choice = 'denied';
        render();
        return;
      }
      choice = savedChoice();
      status.textContent = 'Your browser could not save this choice. Allow browser storage or clear site data to change your saved preference.';
      return;
    }
    render();
    if (choice === 'allowed' && !preferences) loadPixel();
    else if (loaded) location.reload();
  }));
  // X has no unload API. Reload active tagged documents when consent is withdrawn in another tab.
  window.addEventListener('storage', event => {
    if (event.key !== storageKey && event.key !== null) return;
    choice = savedChoice();
    if (loaded && choice !== 'allowed') location.reload();
    render();
  });
  (preferences || document.body).append(panel);
  render();
  if (choice === 'allowed' && !preferences) loadPixel();
  return decision;
}

// The privacy page provides preferences without loading the advertising tag.
if (document.getElementById('x-advertising-choices')) mountWebsiteTag();
