import { getAddress, hexlify, toUtf8Bytes, verifyMessage } from 'ethers';
import { validateNativeWalletOperation, type NativeWalletResult } from './native-wallet-operation.ts';
import { chooseWallet } from './wallet-provider.ts';
import { switchRobinhoodNetwork, walletErrorCode } from './wallet-network.ts';

type Options = { id: string; token: string; origin: string; request: typeof fetch; now?: () => number };
export function mountWalletAction(root: HTMLElement, options: Options) {
  root.innerHTML = `<span class="eyebrow">MOSS VOUCHER EXCHANGE</span><h1 id="login-title">Wallet approval</h1><p id="wallet-description">Loading your request…</p><p id="wallet-address" class="wallet-address" hidden></p><p id="wallet-fee" hidden>Robinhood Chain · ETH pays the network fee.</p><section id="wallet-message" class="wallet-message" hidden><h2>Wallet ownership message</h2><pre id="wallet-message-text"></pre></section><p id="wallet-status" role="status" aria-live="polite"></p><p id="wallet-error" class="login-error" role="alert" hidden></p><p id="wallet-transaction" hidden></p><div class="login-actions"><button id="wallet-approve" type="button" class="primary-button" disabled>Continue</button><button id="wallet-retry" type="button" class="primary-button" hidden>Retry return</button><button id="wallet-cancel" type="button" class="login-register" disabled>Cancel</button></div><p id="wallet-return" hidden><a id="wallet-return-link">Return to Mossvale</a></p><p id="wallet-manual" class="login-footnote" hidden>If the app does not open, switch back to Mossvale manually.</p>`;
  const node = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>(`#wallet-${id}`)!;
  const approve = node<HTMLButtonElement>('approve'), cancel = node<HTMLButtonElement>('cancel'), retry = node<HTMLButtonElement>('retry');
  const now = options.now || Date.now, valid = /^[a-f0-9]{64}$/.test(options.id) && /^[a-f0-9]{64}$/.test(options.token);
  const callback = options.origin === 'https://mossvale.world' ? 'https://us.mossvale.world' : 'https://mossvale.world';
  node<HTMLAnchorElement>('return-link').href = `${callback}/mobile-auth/callback${valid ? `#walletAction=${options.id}` : ''}`;
  let operation: ReturnType<typeof validateNativeWalletOperation> | undefined, expiresAt = 0, busy = false, disposed = false;
  let sent = false, result: NativeWalletResult | undefined, completed = false, completing = false, revision = 0, expiryTimer: ReturnType<typeof setTimeout> | undefined;
  const passive = new AbortController();
  function error(message: string) { if (disposed) return; node('error').textContent = message; node('error').hidden = !message; }
  function render() {
    if (disposed) return;
    approve.disabled = busy || !operation || !!result || expiresAt <= now(); approve.hidden = !!result;
    cancel.disabled = !operation || !!result || sent; cancel.hidden = !!result;
    retry.hidden = !result || completed; retry.disabled = completing;
    node('return').hidden = !completed && !!operation; node('manual').hidden = node('return').hidden;
    root.setAttribute('aria-busy', String(busy || completing));
  }
  async function post(path: string, body: object, signal?: AbortSignal) {
    const response = await options.request(`/api/native-wallet/${path}`, { method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: options.id, token: options.token, ...body }), signal,
      ...(path === 'complete' ? { keepalive: true } : {}) });
    const data = await response.json();
    if (!response.ok) throw Error(typeof data.error === 'string' ? data.error : 'Mossvale could not receive the wallet result.');
    return data;
  }
  async function complete() {
    if (!result || completing || completed) return;
    completing = true; error(''); render();
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      await post('complete', { result }, controller.signal); completed = true;
      if (!disposed) node('status').textContent = 'error' in result ? result.error.message : 'transactionHash' in result
        ? 'Payout submitted. Return to Mossvale to check payment.' : 'Approved. Return to Mossvale to continue.';
    } catch {
      error(result && 'transactionHash' in result ? 'Your transaction was submitted. Retry returning its result, or switch to Mossvale and use Check payout. Do not collect again.'
        : 'Mossvale could not receive the result. Keep this page open and retry returning it.');
    } finally { clearTimeout(timer); completing = false; render(); }
  }
  async function finish(value: NativeWalletResult) {
    if (result) return;
    result = value; revision++; busy = false; clearTimeout(expiryTimer);
    if (!disposed && 'transactionHash' in value) { node('transaction').hidden = false; node('transaction').textContent = `Transaction: ${value.transactionHash}`; }
    await complete();
  }
  function active(value: number) {
    if (disposed || value !== revision || result) throw Error('Wallet request cancelled.');
    if (expiresAt <= now()) throw Error('This request expired. Return to Mossvale and try again.');
    validateNativeWalletOperation(operation, options.origin, now());
  }
  const account = (accounts: unknown) => {
    if (!Array.isArray(accounts) || typeof accounts[0] !== 'string' || !/^0x[\da-f]{40}$/i.test(accounts[0]) || BigInt(accounts[0]) === 0n)
      throw Error('Select an Ethereum account in your wallet.');
    return getAddress(accounts[0]);
  };
  approve.onclick = async () => {
    if (busy || disposed || result || !operation) return;
    busy = true; error(''); render(); const value = revision;
    try {
      active(value); const prepared = operation, provider = await chooseWallet({ embedded: false }); active(value);
      const address = account(await provider.request({ method: 'eth_requestAccounts', params: [] })); active(value);
      if (prepared.kind === 'connect') { await finish({ address }); return; }
      const expected = getAddress(prepared.kind === 'sign' ? prepared.address : prepared.claim.wallet);
      if (address !== expected) throw Error('Select the wallet shown on this request, then try again from Mossvale.');
      if (prepared.kind === 'sign') {
        const selected = account(await provider.request({ method: 'eth_accounts', params: [] })); active(value);
        if (selected !== expected) throw Error('Your wallet account changed. Try again from Mossvale.');
        const signature = await provider.request({ method: 'personal_sign', params: [hexlify(toUtf8Bytes(prepared.message)), prepared.address] }); active(value);
        if (typeof signature !== 'string' || !/^0x[\da-f]{130}$/i.test(signature) || getAddress(verifyMessage(prepared.message, signature)) !== expected)
          throw Error('The wallet returned an invalid ownership signature.');
        await finish({ signature }); return;
      }
      const chainId = '0x1237';
      const chain = await provider.request({ method: 'eth_chainId', params: [] }); active(value);
      if (BigInt(chain) !== 4663n) { await switchRobinhoodNetwork(provider, () => active(value)); active(value); }
      const selected = account(await provider.request({ method: 'eth_accounts', params: [] })); active(value);
      const selectedChain = await provider.request({ method: 'eth_chainId', params: [] }); active(value);
      if (selected !== expected || BigInt(selectedChain) !== 4663n) throw Error('Wallet account or network changed. Try again from Mossvale.');
      sent = true; clearTimeout(expiryTimer); node('status').textContent = 'Approve collection in your wallet. Wait for its result before leaving this page.'; render();
      const transaction = prepared.claim.transaction;
      const transactionHash = await provider.request({ method: 'eth_sendTransaction', params: [{ to: transaction.to, data: transaction.data, value: '0x0', chainId, from: expected }] });
      if (typeof transactionHash !== 'string' || !/^0x[\da-f]{64}$/i.test(transactionHash) || BigInt(transactionHash) === 0n) throw Error('The wallet returned no transaction hash. Check wallet activity and the payout in Mossvale before trying again.');
      // A submitted transaction can finish after pagehide. Return its hash even when this UI is disposed.
      await finish({ transactionHash });
    } catch (failure) {
      if ((!disposed && value === revision) || sent && !result) {
        const code = walletErrorCode(failure);
        await finish({ error: { code: code === 4001 || code === 'ACTION_REJECTED' || code === 'WALLET_SELECTION_CANCELLED' ? 4001 : sent ? -32000 : 4000,
          message: code === 4001 || code === 'ACTION_REJECTED' || code === 'WALLET_SELECTION_CANCELLED' ? 'Wallet request cancelled.'
            : sent ? 'The wallet result is uncertain. Check wallet activity and use Check payout in Mossvale before trying again.'
              : (failure instanceof Error ? failure.message : 'Wallet request failed. Return to Mossvale and try again.').slice(0, 240) } });
      }
    } finally { if (value === revision) busy = false; render(); }
  };
  cancel.onclick = () => { if (!disposed && operation && !sent && !result) void finish({ error: { code: 4001, message: 'Wallet request cancelled.' } }); };
  retry.onclick = () => { if (!disposed) void complete(); };
  const ready = (async () => {
    const timer = setTimeout(() => passive.abort(), 15000);
    try {
      if (!valid) throw Error('This wallet link is invalid. Return to Mossvale and try again.');
      const data = await post('request', {}, passive.signal); if (disposed) return;
      if (!Number.isSafeInteger(data.expiresAt) || data.expiresAt <= now() || data.expiresAt > now() + 180000)
        throw Error('This request expired or is invalid. Return to Mossvale and try again.');
      operation = structuredClone(validateNativeWalletOperation(data.operation, options.origin, now())); expiresAt = data.expiresAt;
      if (operation.kind === 'connect') { node('description').textContent = 'Connect the wallet that will receive your MOSS.'; approve.textContent = 'Connect wallet'; }
      if (operation.kind === 'sign') {
        node('description').textContent = 'Confirm wallet ownership to link it to your character. This signature costs no gas and does not transfer funds.';
        node('address').hidden = false; node('address').textContent = operation.address;
        node('message').hidden = false; node('message-text').textContent = operation.message; approve.textContent = 'Sign wallet link';
      }
      if (operation.kind === 'claim') {
        node('description').textContent = `Collect ${operation.claim.amount} MOSS from your saved payout.`;
        node('address').hidden = false; node('address').textContent = `Recipient: ${operation.claim.wallet}`;
        node('fee').hidden = false; approve.textContent = 'Collect MOSS';
      }
      node('status').textContent = 'Review this request, then continue with your wallet.';
      expiryTimer = setTimeout(() => { if (!disposed && !sent && !result) void finish({ error: { code: 4000, message: 'This request expired. Return to Mossvale and try again.' } }); }, expiresAt - now());
    } catch (failure) {
      error(failure instanceof Error ? failure.message : 'The request could not be loaded. Return to Mossvale and try again.');
      if (!disposed) node('description').textContent = 'Wallet approval unavailable.';
    } finally { clearTimeout(timer); render(); }
  })();
  return { ready, dispose() { disposed = true; revision++; passive.abort(); clearTimeout(expiryTimer); approve.disabled = cancel.disabled = retry.disabled = true; } };
}
