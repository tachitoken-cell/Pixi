import { BrowserProvider, Interface, formatUnits, getAddress, ZeroAddress } from 'ethers';
import { getWalletIdentity } from './auth.ts';
import { activeRealmTarget } from './hosting-client.ts';
import { chooseWallet, type WalletProvider } from './wallet-provider.ts';
import { switchRobinhoodNetwork, walletErrorCode } from './wallet-network.ts';
import { isNativeApp } from './native-client.ts';
import { MOSS_TOKEN } from './auction.ts';

const abi = new Interface(['function proceeds(address) view returns(uint256)', 'function withdraw(address recipient)']);
type Target = { address: string; label: string };
const address = (value: unknown) => {
  if (typeof value !== 'string') throw Error('Auction recovery is unavailable.');
  const result = getAddress(value);
  if (result === ZeroAddress) throw Error('Auction recovery is unavailable.');
  return result;
};
function contracts(health: any): Target[] {
  const market = health?.mossAuction;
  if (health?.ok !== true || market?.chainId !== 4663 || market.decimals !== MOSS_TOKEN.decimals || address(market.token) !== MOSS_TOKEN.address)
    throw Error('Verified auction contracts are unavailable. Try again later.');
  const current = market.contract ? address(market.contract) : undefined;
  if (market.previousContracts !== undefined && !Array.isArray(market.previousContracts)) throw Error('Auction recovery is unavailable.');
  const previous = [...new Set<string>([...(market.previousContracts || []), ...(market.previousContract ? [market.previousContract] : [])].map(address))];
  if (previous.includes(current || '')) throw Error('Auction recovery is unavailable.');
  // Health exposes independently verified previous MOSS escrow even while new trading is disabled.
  // It does not expose a verified legacy ETH contract; never invent a recovery destination.
  return [...(market.enabled === true && current ? [{ address: current, label: 'MOSS proceeds' }] : []),
    ...previous.map(value => ({ address: value, label: previous.length === 1 ? 'Previous MOSS proceeds' : `Previous MOSS proceeds · ${value.slice(0, 6)}…${value.slice(-4)}` }))];
}

/** External wallets are used only to recover their own existing escrow, never to change game linkage. */
export function mountAuctionRecovery(container: HTMLElement, signal: AbortSignal): () => void {
  if (isNativeApp()) return () => {};
  const root = document.createElement('details'), summary = document.createElement('summary');
  const description = document.createElement('p'), connect = document.createElement('button');
  const balances = document.createElement('div'), status = document.createElement('p');
  root.className = 'auction-recovery'; balances.className = 'wallet-picker-actions';
  summary.textContent = 'Recover old auction proceeds';
  description.textContent = 'If you sold items using an external wallet, connect that old wallet to recover its existing MOSS proceeds. Funds return to that same wallet. This does not change your linked game wallet. Your old wallet pays the ETH network fee.';
  connect.type = 'button'; connect.textContent = 'Connect old wallet';
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  root.append(summary, description, connect, balances, status); container.append(root);
  const controller = new AbortController();
  let provider: WalletProvider | undefined, browser: BrowserProvider | undefined, wallet = '', identity = '', busy = false;
  let realm: ReturnType<typeof activeRealmTarget> | undefined;
  const buttons = () => [...balances.querySelectorAll<HTMLButtonElement>('button')];
  function detach() {
    provider?.removeListener?.('accountsChanged', accountChanged); provider?.removeListener?.('chainChanged', chainChanged);
    provider = undefined; browser?.destroy(); browser = undefined;
  }
  function stop(message: string) {
    if (controller.signal.aborted) return;
    controller.abort(); connect.disabled = true; buttons().forEach(button => { button.disabled = true; });
    detach(); status.textContent = message;
  }
  const accountChanged = () => stop('Wallet account changed. Reopen Wallet settings to recover proceeds.');
  const chainChanged = () => stop('Wallet network changed. Reopen Wallet settings on Robinhood Chain.');
  const realmChanged = () => stop('Your realm changed. Reopen Wallet settings.');
  const reset = () => stop('Your game session changed. Reopen Wallet settings.');
  function dispose() {
    stop(''); signal.removeEventListener('abort', dispose); realm?.signal.removeEventListener('abort', realmChanged);
    window.removeEventListener('mossvale-wallet-reset', reset); window.removeEventListener('pagehide', dispose); root.remove();
  }
  function guard() {
    if (signal.aborted || controller.signal.aborted || realm?.signal.aborted || !root.isConnected) throw Error('Recovery closed.');
    if (getWalletIdentity() !== identity) { reset(); throw Error('Game account changed.'); }
  }
  async function verifiedTargets() {
    guard();
    const response = await fetch(new URL('/api/health', realm!.url), { cache: 'no-store', credentials: 'omit', redirect: 'error',
      signal: AbortSignal.any([signal, controller.signal, realm!.signal, AbortSignal.timeout(10000)]) });
    guard(); if (!response.ok) throw Error('Verified auction contracts are unavailable. Try again later.');
    const health = await response.json(); guard(); return contracts(health);
  }
  async function checkedWallet() {
    guard(); const accounts = await browser!.send('eth_accounts', []); guard();
    if (!Array.isArray(accounts) || !accounts.length || address(accounts[0]) !== wallet) throw Error('Select the same old wallet before withdrawing.');
    const chain = await browser!.send('eth_chainId', []); guard();
    if (BigInt(chain) !== 4663n) throw Error('Wallet network changed. Connect your old wallet again to choose a wallet app.');
  }
  async function proceeds(target: Target) {
    guard(); const result = await browser!.call({ to: target.address, data: abi.encodeFunctionData('proceeds', [wallet]) });
    guard(); return BigInt(abi.decodeFunctionResult('proceeds', result)[0]);
  }
  async function withdraw(target: Target, reviewedAmount: bigint) {
    if (busy || controller.signal.aborted) return;
    busy = true; connect.disabled = true; buttons().forEach(button => { button.disabled = true; });
    let requested = false, submitted = false;
    try {
      await checkedWallet();
      const targets = await verifiedTargets();
      if (!targets.some(candidate => candidate.address === target.address && candidate.label === target.label)) throw Error('The verified settlement changed. Reconnect to review proceeds again.');
      if (await proceeds(target) !== reviewedAmount) throw Error('Your proceeds changed. Reconnect to review the current amount.');
      await checkedWallet(); guard();
      status.textContent = `Confirm withdrawal of ${formatUnits(reviewedAmount, 18)} MOSS to ${wallet} in your old wallet.`;
      requested = true;
      const hash = await provider!.request({ method: 'eth_sendTransaction', params: [{ from: wallet, to: target.address,
        data: abi.encodeFunctionData('withdraw', [wallet]), value: '0x0', chainId: '0x1237' }] });
      submitted = true; guard();
      if (typeof hash !== 'string' || !/^0x[\da-f]{64}$/i.test(hash)) throw Error('The wallet returned an invalid transaction reference.');
      status.textContent = 'Withdrawal submitted. Waiting for confirmation…';
      const receipt = await browser!.waitForTransaction(hash, 1, 120000); guard();
      if (receipt?.status !== 1) throw Error('The withdrawal was not confirmed successfully.');
      balances.replaceChildren(); status.textContent = `${formatUnits(reviewedAmount, 18)} MOSS withdrawn to your old wallet.`;
    } catch (error) {
      if (!controller.signal.aborted && !signal.aborted) status.textContent = submitted || requested
        ? 'Check your old wallet for the withdrawal result before trying again.'
        : error instanceof Error ? error.message : 'Recovery could not complete. Reconnect to try again.';
    } finally { busy = false; if (!controller.signal.aborted && !signal.aborted) connect.disabled = false; }
  }
  connect.onclick = () => {
    if (busy || controller.signal.aborted) return;
    busy = true; connect.disabled = true; balances.replaceChildren(); status.textContent = 'Connect the wallet that received your original auction sales.';
    void (async () => {
      identity = getWalletIdentity(); realm?.signal.removeEventListener('abort', realmChanged);
      realm = activeRealmTarget('/api/config'); realm.signal.addEventListener('abort', realmChanged, { once: true }); guard(); detach();
      let description = 'Choose the wallet app holding your original auction address. It must support Robinhood Chain.';
      while (true) {
        const selected = await chooseWallet({ embedded: false, signal: AbortSignal.any([signal, controller.signal, realm.signal]), description }); guard();
        if (selected.mossvaleWallet) throw Error('Choose your original external wallet for this recovery.');
        provider = selected;
        const accounts = await provider.request({ method: 'eth_requestAccounts', params: [] }); guard();
        if (!Array.isArray(accounts) || !accounts.length) throw Error('Your old wallet did not provide an account.');
        wallet = address(accounts[0]);
        try {
          const chain = await provider.request({ method: 'eth_chainId', params: [] }); guard();
          if (BigInt(chain) !== 4663n) {
            await switchRobinhoodNetwork(provider, guard); guard();
            const switched = await provider.request({ method: 'eth_chainId', params: [] }); guard();
            if (BigInt(switched) !== 4663n) throw Error('Wallet did not switch networks.');
          }
        } catch (error) {
          guard(); const code = walletErrorCode(error);
          if (code === 4001 || code === 'ACTION_REJECTED') throw error;
          detach();
          description = 'This wallet could not use Robinhood Chain. Choose another wallet app with your original auction address. Your proceeds stay in that old wallet’s escrow.';
          status.textContent = description;
          continue;
        }
        browser = new BrowserProvider(provider, 'any'); await checkedWallet(); break;
      }
      provider.on?.('accountsChanged', accountChanged); provider.on?.('chainChanged', chainChanged);
      const targets = await verifiedTargets(), amounts = await Promise.all(targets.map(proceeds));
      await checkedWallet(); guard();
      targets.forEach((target, index) => {
        if (amounts[index] <= 0n) return;
        const button = document.createElement('button'); button.type = 'button';
        button.textContent = `Withdraw ${formatUnits(amounts[index], 18)} ${target.label}`;
        button.onclick = () => void withdraw(target, amounts[index]); balances.append(button);
      });
      status.textContent = amounts.some(amount => amount > 0n) ? `Proceeds return to ${wallet}. Your game wallet remains unchanged.` : 'No existing MOSS proceeds were found for this wallet.';
    })().catch(error => { if (!controller.signal.aborted && !signal.aborted) status.textContent = error instanceof Error ? error.message : 'Old wallet could not connect.'; })
      .finally(() => { busy = false; if (!controller.signal.aborted && !signal.aborted) connect.disabled = false; });
  };
  window.addEventListener('mossvale-wallet-reset', reset); window.addEventListener('pagehide', dispose);
  signal.addEventListener('abort', dispose, { once: true }); if (signal.aborted) dispose();
  return dispose;
}
