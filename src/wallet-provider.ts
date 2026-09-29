import { activeRealmTarget } from './hosting-client.ts';
import type { AuctionAsset } from './auction.ts';

export type AuctionPurchaseReview = { item: AuctionAsset; listingId: string; contract: string; price: string };

export type WalletProvider = {
  mossvaleWallet?: boolean;
  request: (args: { method: string; params?: unknown[]; auctionPurchase?: AuctionPurchaseReview }) => Promise<any>;
  on?: (event: string, callback: (value: unknown) => void) => void;
  removeListener?: (event: string, callback: (value: unknown) => void) => void;
};

/** Auctions always use the game-account wallet, never a browser extension. */
export async function openMossvaleWallet(signal?: AbortSignal): Promise<WalletProvider> {
  const target = activeRealmTarget('/api/config');
  const lifetime = AbortSignal.any([target.signal, ...(signal ? [signal] : [])]);
  const response = await fetch(target.url, { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.any([lifetime, AbortSignal.timeout(5000)]) });
  if (!response.ok) throw Error('Mossvale Wallet settings could not load. Try again.');
  const config = (await response.json()).turnkey;
  if (!config || !['organizationId', 'authProxyConfigId'].every(key => typeof config[key] === 'string' && /^[\da-f-]{36}$/i.test(config[key])))
    throw Error('Mossvale Wallet is unavailable on this realm.');
  lifetime.throwIfAborted();
  const { openTurnkeyWallet } = await import('./turnkey-ui.ts');
  lifetime.throwIfAborted();
  return openTurnkeyWallet(config, undefined, { connect: true, signal: lifetime });
}

/** Arena wagers use the same realm-aware game-account wallet as auctions. */
export const connectMossvaleWallet = openMossvaleWallet;

const announcedProviders = new Map<WalletProvider, string>(), observers = new Set<() => void>();
let listening = false;
function listenForWallets() {
  if (listening) return; listening = true;
  // EIP-6963 announcements stay available for the lifetime of this page.
  window.addEventListener('eip6963:announceProvider', (event: Event) => {
    const detail = (event as CustomEvent<{ info?: { name?: unknown }; provider?: WalletProvider }>).detail;
    if (!detail?.provider || typeof detail.provider.request !== 'function' || typeof detail.info?.name !== 'string' || !detail.info.name.trim()) return;
    announcedProviders.set(detail.provider, detail.info.name.trim().slice(0, 80));
    for (const observer of observers) observer();
  });
}

/** Choosing an app never opens a wallet request or reuses a browser preference. */
export function chooseWallet(options: { embedded?: boolean; signal?: AbortSignal; description?: string } = {}): Promise<WalletProvider> {
  if (options.signal?.aborted) return Promise.reject(options.signal.reason);
  return new Promise((resolve, reject) => {
    const previousFocus = document.activeElement;
    const dialog = document.createElement('dialog'), heading = document.createElement('h2'), description = document.createElement('p');
    const list = document.createElement('div'), empty = document.createElement('p'), actions = document.createElement('div');
    const refresh = document.createElement('button'), cancel = document.createElement('button');
    dialog.className = 'wallet-picker'; dialog.setAttribute('aria-labelledby', 'wallet-picker-title'); dialog.setAttribute('aria-describedby', 'wallet-picker-description');
    heading.id = 'wallet-picker-title'; heading.tabIndex = -1; heading.textContent = 'Choose your wallet';
    description.id = 'wallet-picker-description'; description.textContent = options.description ?? 'Select the wallet app you want to use for this connection.';
    list.className = 'wallet-picker-list';
    empty.className = 'wallet-picker-empty'; empty.setAttribute('role', 'status'); empty.textContent = 'No wallet apps found. Enable your wallet extension, then refresh the list.';
    actions.className = 'wallet-picker-actions'; refresh.type = cancel.type = 'button'; refresh.textContent = 'Refresh wallets'; cancel.textContent = 'Cancel';
    actions.append(refresh, cancel); dialog.append(heading, description, list, empty, actions);
    const providers = new Map<WalletProvider, HTMLButtonElement>();
    let settled = false, defaultFallback: WalletProvider | undefined;
    const configuration = new AbortController();
    function finish(provider?: WalletProvider, failure?: unknown) {
      if (settled) return; settled = true;
      configuration.abort();
      options.signal?.removeEventListener('abort', aborted);
      observers.delete(updateAnnouncements);
      dialog.removeEventListener('close', closed); dialog.removeEventListener('cancel', cancelled); dialog.removeEventListener('keydown', keyboard);
      if (dialog.open) dialog.close(); dialog.remove();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
      if (provider) resolve(provider);
      else reject(failure || Object.assign(Error('Wallet selection cancelled.'), { code: 'WALLET_SELECTION_CANCELLED' }));
    }
    function add(name: unknown, candidate: unknown, announced = false) {
      if (!candidate || typeof (candidate as WalletProvider).request !== 'function') return;
      const provider = candidate as WalletProvider;
      const label = typeof name === 'string' && name.trim() ? name.trim().slice(0, 80) : 'Browser wallet';
      const existing = providers.get(provider);
      if (existing) { if (announced) existing.textContent = label; return; }
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
      button.addEventListener('click', () => finish(provider)); providers.set(provider, button); list.append(button); empty.hidden = true;
    }
    function updateAnnouncements() {
      if (announcedProviders.size && defaultFallback && !announcedProviders.has(defaultFallback)) {
        const button = providers.get(defaultFallback), focused = document.activeElement === button;
        button?.remove(); providers.delete(defaultFallback); defaultFallback = undefined;
        if (focused) heading.focus();
      }
      for (const [provider, name] of announcedProviders) add(name, provider, true);
      empty.hidden = providers.size > 0;
    }
    function discover() {
      window.dispatchEvent(new Event('eip6963:requestProvider'));
      updateAnnouncements();
      const wallets = window as Window & { ethereum?: WalletProvider & { providers?: unknown[] }; phantom?: { ethereum?: WalletProvider }; okxwallet?: WalletProvider; trustwallet?: WalletProvider };
      const legacy = Array.isArray(wallets.ethereum?.providers) ? wallets.ethereum.providers : [];
      if ([wallets.phantom?.ethereum, wallets.okxwallet, wallets.trustwallet, ...legacy].includes(defaultFallback)) defaultFallback = undefined;
      add('Phantom', wallets.phantom?.ethereum); add('OKX Wallet', wallets.okxwallet); add('Trust Wallet', wallets.trustwallet);
      for (const [index, candidate] of legacy.entries()) {
        const wallet = candidate as Record<string, unknown> | undefined;
        const name = wallet?.isPhantom ? 'Phantom' : wallet?.isRabby ? 'Rabby' : wallet?.isCoinbaseWallet ? 'Coinbase Wallet' : wallet?.isOkxWallet ? 'OKX Wallet'
          : wallet?.isTrust ? 'Trust Wallet' : wallet?.isBraveWallet ? 'Brave Wallet' : wallet?.isMetaMask ? 'MetaMask' : `Browser wallet${legacy.length > 1 ? ` ${index + 1}` : ''}`;
        add(name, candidate);
      }
      if (!legacy.length && !announcedProviders.size && wallets.ethereum && !providers.has(wallets.ethereum)) {
        defaultFallback = wallets.ethereum;
        add((wallets.ethereum as WalletProvider & { isMetaMask?: boolean }).isMetaMask ? 'MetaMask' : 'Browser wallet', wallets.ethereum);
      }
    }
    const closed = () => finish();
    const aborted = () => finish(undefined, options.signal?.reason);
    const cancelled = (event: Event) => { event.preventDefault(); finish(); };
    const keyboard = (event: KeyboardEvent) => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); finish(); } };
    dialog.addEventListener('close', closed); dialog.addEventListener('cancel', cancelled); dialog.addEventListener('keydown', keyboard);
    refresh.addEventListener('click', discover); cancel.addEventListener('click', closed);
    options.signal?.addEventListener('abort', aborted, { once: true });
    listenForWallets(); observers.add(updateAnnouncements);
    document.body.append(dialog);
    try { discover(); dialog.showModal(); heading.focus(); }
    catch (error) { finish(undefined, error); }
    if (options.embedded !== false) {
      void Promise.resolve().then(async () => {
        const target = activeRealmTarget('/api/config');
        const response = await fetch(target.url, { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.any([configuration.signal, target.signal, AbortSignal.timeout(5000)]) });
        if (!response.ok) return;
        const config = (await response.json()).turnkey;
        if (settled || target.signal.aborted || !config || !['organizationId', 'authProxyConfigId'].every(key => typeof config[key] === 'string' && /^[\da-f-]{36}$/i.test(config[key]))) return;
        let connection: Promise<WalletProvider> | undefined;
        add('Mossvale wallet · game account', {
          mossvaleWallet: true,
          request(args: Parameters<WalletProvider['request']>[0]) {
            if (target.signal.aborted) return Promise.reject(Error('Your realm changed. Choose your wallet again.'));
            connection ??= import('./turnkey-ui.ts').then(module => {
              if (target.signal.aborted) throw Error('Your realm changed. Choose your wallet again.');
              return module.openTurnkeyWallet(config);
            }).catch(error => { connection = undefined; throw error; });
            return connection.then(provider => provider.request(args));
          },
        });
      }).catch(() => { /* External wallets remain usable when optional settings cannot load. */ });
    }
  });
}
