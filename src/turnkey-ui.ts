import { activeRealmTarget } from './hosting-client.ts';
import { formatEther, formatUnits, getAddress, id, Interface, parseUnits, toUtf8String } from 'ethers';
import { MOSS_TOKEN, auctionOrderReferralValid, auctionMossTax, auctionAssetValid, auctionEthPrice, auctionGoldFee, auctionItemLabel } from './auction.ts';
import { gearArt, lootItemArt } from './character-ui.ts';
import { gearById } from './progression.ts';
import { itemResources } from './item-tooltip.ts';
import { icon } from './icons.ts';
import { NFT_PETS, NFT_LEGACY_PETS } from './nfts.ts';
import arenaArtifact from '../public/contracts/MossvaleArena.json' with { type: 'json' };
import { arenaWagerSummary } from './arena-wager';
import { createTurnkeyProvider, walletCancelled } from './turnkey-provider.ts';
import { createTurnkeySession, type TurnkeyAccount, type TurnkeyTransaction, type TurnkeyWalletConfig, type TurnkeyWalletSession } from './turnkey-wallet.ts';
import type { AuctionPurchaseReview, WalletProvider } from './wallet-provider.ts';
import { readBalances, readOwnedNfts, prepareTransfer, revalidateTransfer, type CollectionContracts, type OwnedNft } from './turnkey-management.ts';

let sessionPromise: Promise<TurnkeyWalletSession> | undefined, sessionKey = '', clearing = Promise.resolve(), dialogNumber = 0, walletEpoch = 0;
let sessionRealm: AbortSignal | undefined;
function disconnectWallet() {
  sessionRealm?.removeEventListener('abort', disposeWallet); sessionRealm = undefined;
  walletEpoch++;
  const previous = sessionPromise; sessionPromise = undefined; sessionKey = '';
  clearing = clearing.then(async () => { await previous?.then(session => session.logout()).catch(() => {}); });
}
window.addEventListener('mossvale-wallet-reset', disconnectWallet);
window.addEventListener('storage', event => {
  if (event.storageArea === localStorage && event.key === 'mossvale-wallet-reset' && event.newValue) window.dispatchEvent(new Event('mossvale-wallet-reset'));
});
function disposeWallet() {
  sessionRealm?.removeEventListener('abort', disposeWallet); sessionRealm = undefined;
  walletEpoch++;
  const previous = sessionPromise; sessionPromise = undefined; sessionKey = '';
  clearing = clearing.then(async () => { await previous?.then(session => session.dispose()).catch(() => {}); });
}
window.addEventListener('pagehide', disposeWallet);
async function walletSession(config: TurnkeyWalletConfig) {
  const key = `${config.organizationId}:${config.authProxyConfigId}`;
  if (sessionPromise && sessionKey !== key) disconnectWallet();
  const epoch = walletEpoch;
  await clearing;
  if (epoch !== walletEpoch) throw walletCancelled();
  if (!sessionPromise) {
    sessionKey = key;
    sessionRealm = activeRealmTarget('/api/turnkey/wallet').signal;
    sessionRealm.addEventListener('abort', disposeWallet, { once: true });
    sessionPromise = (async () => {
      const reset = localStorage.getItem('mossvale-wallet-reset'), session = await createTurnkeySession(config);
      if (!reset) return session;
      await session.logout();
      if (epoch !== walletEpoch) throw walletCancelled();
      if (localStorage.getItem('mossvale-wallet-reset') === reset) localStorage.removeItem('mossvale-wallet-reset');
      return createTurnkeySession(config);
    })();
  }
  const pending = sessionPromise;
  try { const session = await pending; if (epoch !== walletEpoch) throw walletCancelled(); return session; }
  catch (error) { if (sessionPromise === pending) sessionPromise = undefined; throw error; }
}

function walletView(title: string, container?: HTMLElement, parentSignal?: AbortSignal, deferred = false) {
  const previousFocus = document.activeElement, root = document.createElement(container ? 'section' : 'dialog');
  root.className = `wallet-picker turnkey-wallet${container ? ' turnkey-inline' : ''}`; root.setAttribute('aria-labelledby', `turnkey-wallet-title-${++dialogNumber}`);
  const heading = document.createElement(container ? 'h3' : 'h2'); heading.id = `turnkey-wallet-title-${dialogNumber}`; heading.textContent = title; heading.tabIndex = -1;
  const body = document.createElement('div'), status = document.createElement('p'), actions = document.createElement('div');
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); actions.className = 'wallet-picker-actions';
  const cancel = button('Cancel', actions); root.append(heading, body, status, actions); (container ?? document.body).append(root);
  const controller = new AbortController();
  let shown = false;
  function show() {
    if (controller.signal.aborted || container || shown) return;
    shown = true; (root as HTMLDialogElement).showModal(); heading.focus();
  }
  function close() {
    if (controller.signal.aborted) return;
    controller.abort(); if (shown) (root as HTMLDialogElement).close(); root.remove();
    parentSignal?.removeEventListener('abort', cancelled);
    window.removeEventListener('mossvale-wallet-reset', cancelled); window.removeEventListener('pagehide', cancelled);
    if (shown && previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
  }
  let onCancel = () => {};
  const cancelled = () => { onCancel(); close(); };
  cancel.onclick = cancelled;
  root.addEventListener('cancel', event => { event.preventDefault(); cancelled(); });
  root.addEventListener('keydown', event => event.stopPropagation());
  window.addEventListener('mossvale-wallet-reset', cancelled); window.addEventListener('pagehide', cancelled);
  parentSignal?.addEventListener('abort', cancelled, { once: true });
  if (parentSignal?.aborted) cancelled();
  else if (!deferred) show();
  return { root, heading, body, status, actions, cancel, close, show, signal: controller.signal, cancelWith: (fn: () => void) => { onCancel = fn; if (controller.signal.aborted) fn(); } };
}
function button(text: string, parent: HTMLElement) {
  const node = document.createElement('button'); node.type = 'button'; node.textContent = text; parent.append(node); return node;
}
function paragraph(text: string, parent: HTMLElement) { const node = document.createElement('p'); node.textContent = text; parent.append(node); return node; }
function input(label: string, type: string, parent: HTMLElement) {
  const wrapper = document.createElement('label'), field = document.createElement('input');
  wrapper.textContent = label; field.type = type; field.required = true; wrapper.append(field); parent.append(wrapper); return field;
}
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Wallet request failed. Please try again.';
const token = new Interface(['function balanceOf(address) view returns(uint256)', 'function approve(address,uint256) returns(bool)']);
const calls = new Interface([
  'function buy((bytes32 listingId,address buyer,address seller,uint256 priceWei,uint64 deadline),bytes)',
  'function buy((bytes32 listingId,address buyer,address seller,uint256 priceWei,uint64 deadline,address referrer,uint16 referralBps),bytes)',
  'function buy((bytes32 orderId,bytes32 productId,bytes32 characterId,address buyer,uint256 amountWei,uint256 usdCents,uint64 deadline),bytes)',
  'function withdraw(address recipient)', 'function claim((bytes32 claimId,bytes32 characterId,address recipient,uint256 amountWei),bytes)',
  'function mint((bytes32 orderId,uint256 tokenId,uint256 assetId,address buyer,uint256 amountWei,uint64 deadline),bytes)',
  'function bidHouse(uint256 assetId,uint256 amountWei,uint256 paymentWei)', 'function withdrawRefund()', 'function settleHouse(uint256 assetId)', 'function migrate(uint256 tokenId)',
]);

export function approveTurnkeyRequest(request: { message: string } | { transaction: TurnkeyTransaction; auctionPurchase?: AuctionPurchaseReview }, collections: CollectionContracts = {}, signal?: AbortSignal, arenaContract?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const purchase = 'transaction' in request ? request.auctionPurchase : undefined;
    let auctionAction: 'approve' | 'buy' | undefined, referralNote = '';
    let arenaCall: ReturnType<Interface['parseTransaction']> = null;
    if ('transaction' in request && arenaContract) {
      const arena = new Interface(arenaArtifact.abi), transaction = request.transaction;
      try {
        const call = arena.parseTransaction({ data: transaction.data ?? '0x' }), terms = call?.args[0];
        const trusted = getAddress(arenaContract), zero = '0x0000000000000000000000000000000000000000';
        if (call && ['fund', 'settle', 'refund'].includes(call.name) && getAddress(transaction.to) === trusted && trusted !== zero
          && BigInt(transaction.chainId ?? 0) === 4663n && BigInt(transaction.value ?? 0) === 0n
          && terms.matchId !== `0x${'00'.repeat(32)}` && terms.stakeWei > 0n && terms.stakeWei < (1n << 255n)
          && terms.fundingDeadline > 0n && terms.refundAfter > terms.fundingDeadline && terms.refundAfter <= 8640000000000n
          && getAddress(terms.playerA) !== getAddress(terms.playerB)
          && [terms.playerA, terms.playerB].every(address => ![zero, trusted].includes(getAddress(address)))
          && [terms.playerA, terms.playerB].some(address => getAddress(address) === getAddress(transaction.from))
          && (call.name !== 'settle' || [zero, terms.playerA, terms.playerB].some(address => getAddress(address) === getAddress(call.args[1])))
          && (transaction.data ?? '0x').toLowerCase() === arena.encodeFunctionData(call.fragment, call.args).toLowerCase()) arenaCall = call;
      } catch { /* Unknown destinations and malformed terms retain the complete generic review. */ }
    }
    let payout: string | undefined, pet: typeof NFT_PETS[number] | undefined;
    if (purchase && 'transaction' in request) {
      const transaction = request.transaction, data = transaction.data ?? '0x';
      if (!auctionAssetValid(purchase.item) || !auctionEthPrice(purchase.price)
        || typeof purchase.listingId !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(purchase.listingId)
        || BigInt(transaction.chainId ?? 0) !== BigInt(MOSS_TOKEN.chainId) || BigInt(transaction.value ?? 0) !== 0n) throw Error('Auction purchase details changed. Review the listing again.');
      const amount = parseUnits(purchase.price, MOSS_TOKEN.decimals), contract = getAddress(purchase.contract), target = getAddress(transaction.to);
      if (target === getAddress(MOSS_TOKEN.address) && data.toLowerCase() === token.encodeFunctionData('approve', [contract, amount]).toLowerCase()) auctionAction = 'approve';
      else {
        const call = calls.parseTransaction({ data });
        if (target === contract && call?.name === 'buy' && call.args[0].listingId === id(purchase.listingId)
          && getAddress(call.args[0].buyer) === getAddress(transaction.from) && call.args[0].priceWei === amount
          && data.toLowerCase() === calls.encodeFunctionData(call.fragment, call.args).toLowerCase()) {
          const order = call.args[0], referralBps = order.referralBps === undefined ? undefined : Number(order.referralBps) as 0 | 10 | 25 | 50 | 75 | 100 | 500 | 1000;
          if (!auctionOrderReferralValid({ currency: 'moss', buyer: order.buyer, seller: order.seller, contract, referrer: order.referrer, referralBps })) throw Error('Invalid auction referral terms.');
          auctionAction = 'buy';
          if (referralBps) referralNote = `Referral reward: ${auctionMossTax(purchase.price, referralBps)!.referral} MOSS (${referralBps / 100}% of the ${referralBps <= 100 ? 'purchase price' : 'burn share'}) to ${order.referrer}. Your price stays the same.`;
        }
      }
      if (!auctionAction) throw Error('The wallet transaction does not match this auction purchase.');
      if (transaction.approval !== undefined) {
        const approval = transaction.approval;
        if (auctionAction !== 'buy' || !approval || typeof approval !== 'object' || Array.isArray(approval)
          || Object.keys(approval).length !== 3 || Object.keys(approval).some(key => !['to', 'data', 'value'].includes(key))
          || getAddress(approval.to) !== getAddress(MOSS_TOKEN.address) || BigInt(approval.value) !== 0n
          || approval.data.toLowerCase() !== token.encodeFunctionData('approve', [contract, amount]).toLowerCase()) throw Error('The approval does not match this auction purchase.');
      }
    }
    if (!purchase && 'transaction' in request && request.transaction.approval !== undefined) throw Error('Purchase approvals require an exact auction review.');
    if (!purchase && 'transaction' in request) {
      const transaction = request.transaction, data = transaction.data ?? '0x';
      try {
        const call = calls.parseTransaction({ data });
        if (call && BigInt(transaction.chainId ?? 0) === BigInt(MOSS_TOKEN.chainId) && BigInt(transaction.value ?? 0) === 0n
          && data.toLowerCase() === calls.encodeFunctionData(call.fragment, call.args).toLowerCase()) {
          if (call.name === 'claim' && getAddress(call.args[0].recipient) === getAddress(transaction.from) && call.args[0].amountWei > 0n) {
            payout = formatUnits(call.args[0].amountWei, MOSS_TOKEN.decimals).replace(/\.0$/, '');
          } else if (call.name === 'mint' && getAddress(call.args[0].buyer) === getAddress(transaction.from) && call.args[0].amountWei === 0n
            && [collections.petsContract, collections.legacyPetsContract].some(contract => contract && getAddress(contract) === getAddress(transaction.to))) {
            const catalog = collections.legacyPetsContract?.toLowerCase() === transaction.to.toLowerCase() ? NFT_LEGACY_PETS : NFT_PETS;
            pet = catalog.find(pet => BigInt(pet.assetId) === call.args[0].assetId);
          }
        }
      } catch { /* Unrecognized transactions retain their complete review. */ }
    }
    const ui = walletView(auctionAction === 'approve' ? 'Approve MOSS purchase' : auctionAction === 'buy' ? 'Buy item' : payout ? 'You will receive' : pet ? 'Mint pet' : arenaCall?.name==='fund'?'Fund MOSS arena stake':arenaCall?'Settle MOSS arena wager':'Review wallet request', undefined, signal); ui.cancelWith(() => reject(walletCancelled()));
    if (purchase && auctionAction) {
      const item = purchase.item, row = document.createElement('div'), artwork = document.createElement('div'), description = document.createElement('div');
      row.className = 'turnkey-purchase'; artwork.className = 'turnkey-purchase-art'; artwork.setAttribute('aria-hidden', 'true');
      artwork.innerHTML = item.kind === 'gear' ? gearArt(gearById(item.id)!) : item.kind === 'item' ? lootItemArt(item.id) : icon(item.kind === 'gold' ? 'gold' : itemResources[item.id as keyof typeof itemResources].icon);
      const quantity = item.kind === 'gold' ? item.quantity - auctionGoldFee(item.quantity) : item.quantity;
      const name = document.createElement('strong'); name.textContent = `${quantity > 1 ? `${quantity.toLocaleString('en-US')}${item.kind === 'gold' ? ' ' : ' × '}` : ''}${auctionItemLabel(item)}`;
      description.append(name);
      const price = paragraph(`${formatUnits(parseUnits(purchase.price, MOSS_TOKEN.decimals), MOSS_TOKEN.decimals).replace(/\.0$/, '')} MOSS`, description); price.className = 'turnkey-purchase-price';
      row.append(artwork, description); ui.body.append(row);
      if (referralNote) paragraph(referralNote, ui.body);
    } else if (payout) {
      paragraph(`${payout} MOSS`, ui.body).className = 'turnkey-payout';
    } else if (pet) {
      const row = document.createElement('div'), artwork = document.createElement('div'), image = document.createElement('img'), name = document.createElement('strong');
      row.className = 'turnkey-purchase'; artwork.className = 'turnkey-purchase-art';
      image.src = pet.icon; image.alt = ''; image.className = 'loot-item-art'; image.width = image.height = 64;
      name.textContent = pet.name; artwork.append(image); row.append(artwork, name); ui.body.append(row);
    } else if ('message' in request) {
      paragraph('Review the complete message before signing. Only approve requests you started.', ui.body);
      const message = document.createElement('pre'); message.tabIndex = 0;
      try { message.textContent = toUtf8String(request.message); } catch { message.textContent = request.message; }
      ui.body.append(message);
    } else {
      const transaction = request.transaction;
      let call;
      if(arenaCall){
        const terms=arenaCall.args[0],summary=arenaWagerSummary(terms.stakeWei);
        paragraph(arenaCall.name==='fund'?`Fund ${summary.stake} MOSS for this 1v1 stake.`:arenaCall.name==='refund'||/^0x0{40}$/i.test(arenaCall.args[1]??'')?'Return all funded stakes without tax.':`Pay ${summary.payout} MOSS to winner ${arenaCall.args[1]}.`,ui.body);
        paragraph(`Each player stakes ${summary.stake} MOSS. Combined pot ${summary.pot} MOSS; winner ${summary.payout} MOSS after ${summary.tax} MOSS tax (5%).`,ui.body);
        paragraph(`Opponent wallet: ${getAddress(terms.playerA)===getAddress(transaction.from)?terms.playerB:terms.playerA}.`,ui.body);
        paragraph(`Fund by ${new Date(Number(terms.fundingDeadline)*1000).toLocaleString()}. If both stakes are not funded by then, full refunds become available. Unsettled matches can be refunded after ${new Date(Number(terms.refundAfter)*1000).toLocaleString()}.`,ui.body);
      }
      try { call = token.parseTransaction({ data: transaction.data ?? '0x' }); } catch { /* Other game contract. */ }
      if (arenaCall) { /* The stake, outcome and deadlines are reviewed above. */ }
      else if (call?.name === 'approve' && transaction.to.toLowerCase() === MOSS_TOKEN.address.toLowerCase()) {
        paragraph(`Approve ${formatUnits(call.args[1], MOSS_TOKEN.decimals)} MOSS for the game purchase.`, ui.body);
        paragraph(`Spender: ${call.args[0]}`, ui.body);
      } else {
        try { call = calls.parseTransaction({ data: transaction.data ?? '0x' }); } catch { /* Display the complete call for other supported game actions. */ }
        const names: Record<string, string> = { buy: 'Pay for auction purchase', withdraw: 'Withdraw auction proceeds', claim: 'Collect saved voucher payout', mint: 'Mint your NFT', bidHouse: 'Fund house bid', withdrawRefund: 'Withdraw house refund', settleHouse: 'Settle house auction', migrate: 'Migrate pet NFT' };
        paragraph(call?.name === 'buy' && call.args[0].amountWei !== undefined ? 'Burn MOSS for store purchase' : names[call?.name ?? ''] ?? 'Approve game transaction', ui.body);
        if (call?.name === 'buy') paragraph(`${formatUnits(call.args[0].priceWei ?? call.args[0].amountWei, 18)} ${BigInt(transaction.value ?? 0) ? 'ETH' : 'MOSS'}`, ui.body);
        if (call?.name === 'mint') paragraph(`Mint price: ${formatUnits(call.args[0].amountWei, 18)} MOSS`, ui.body);
        if (call?.name === 'claim') paragraph(`Receive ${formatUnits(call.args[0].amountWei, 18)} MOSS`, ui.body);
      }
      paragraph(`From: ${transaction.from}`, ui.body); paragraph(`Contract: ${transaction.to}`, ui.body);
      if (BigInt(transaction.value ?? 0)) paragraph(`Send: ${formatEther(transaction.value!)} ETH`, ui.body);
      paragraph('Mossvale covers eligible network fees within its limits. Your purchase amount comes from this wallet.', ui.body);
      const details = document.createElement('details'), summary = document.createElement('summary'), data = document.createElement('pre');
      summary.textContent = 'Transaction data'; data.tabIndex = 0; data.textContent = transaction.data ?? '0x'; details.append(summary, data); ui.body.append(details);
    }
    const approve = button(auctionAction === 'approve' ? 'Approve MOSS' : auctionAction === 'buy' ? 'Buy' : payout ? 'Claim' : pet ? 'Mint' : 'message' in request ? 'Sign message' : 'Approve transaction', ui.actions);
    approve.className = 'wallet-primary';
    approve.onclick = () => { ui.close(); resolve(); };
  });
}

async function walletRpc(request: { method: string; params: unknown[] }, target: ReturnType<typeof activeRealmTarget>, guard: () => Promise<void>): Promise<unknown> {
  await guard();
  const { getAccessToken } = await import('./auth.ts');
  const token = await getAccessToken();
  await guard();
  if (!token) throw Error('Sign in to your Mossvale account to use sponsored transactions.');
  const response = await fetch(target.url, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, ...request }), cache: 'no-store', credentials: 'omit', redirect: 'error',
    signal: AbortSignal.any([target.signal, AbortSignal.timeout(60000)]),
  });
  const result = await response.json();
  await guard();
  if (!response.ok || result.error || result.jsonrpc !== '2.0' || result.id !== 1 || !Object.hasOwn(result, 'result')) {
    const error = Error(typeof result.error?.message === 'string' ? result.error.message : 'Sponsored transaction status is unavailable. Check Activity before trying again.');
    if (result.jsonrpc === '2.0' && result.id === 1 && result.error?.code === 5731) {
      Object.assign(error, { code: 5731, data: result.error.data });
    }
    throw error;
  }
  return result.result;
}

async function exportWallet(session: TurnkeyWalletSession, account: TurnkeyAccount, container: HTMLElement | undefined, signal: AbortSignal, guard: () => Promise<void>, onDone?: () => void) {
  const ui = walletView('Back up your wallet', container, signal);
  const address = account.address;
  paragraph('This backs up the private key for your Mossvale wallet address. Anyone with this key can spend its funds and transfer its NFTs. Keep it private. Mossvale support will never ask for it.', ui.body);
  const reveal = button('Reveal private key', ui.body), exportContainer = document.createElement('div'); ui.body.append(exportContainer);
  ui.cancel.textContent = 'Done';
  ui.cancel.onclick = () => { ui.close(); onDone?.(); };
  const { IframeStamper, KeyFormat } = await import('@turnkey/iframe-stamper');
  if (ui.signal.aborted) return;
  const frame = new IframeStamper({ iframeUrl: 'https://export.turnkey.com', iframeElementId: 'turnkey-wallet-export', iframeContainer: exportContainer });
  ui.signal.addEventListener('abort', () => frame.clear(), { once: true });
  reveal.onclick = async () => {
    reveal.disabled = true; ui.status.textContent = 'Opening secure wallet export…';
    try {
      await guard(); if (ui.signal.aborted) return;
      const targetPublicKey = await frame.init(); if (ui.signal.aborted) return;
      frame.iframe.title = 'Wallet private key';
      await guard(); if (ui.signal.aborted) return;
      const result = await session.exportWalletAccount(address, targetPublicKey); if (ui.signal.aborted) return;
      await guard(); if (ui.signal.aborted) return;
      if (result.address !== address || !await frame.injectKeyExportBundle(result.bundle, result.organizationId, KeyFormat.Hexadecimal, result.address)) throw Error('Private key export was not displayed.');
      await guard(); if (ui.signal.aborted) return;
      ui.status.textContent = 'Store the private key somewhere private before closing.';
    } catch { frame.clear(); if (!ui.signal.aborted) ui.status.textContent = 'Private key export could not be completed. Close this backup and try again.'; }
  };
}

type WalletConfig = TurnkeyWalletConfig & { gasFunding?: boolean; collections?: CollectionContracts; arenaContract?: string };
type GameAuthentication = Pick<typeof import('./auth.ts'), 'getWalletIdentity' | 'authorizeWallet'>;
/** Read the same primary wallet used by auctions; never open a wallet or approval dialog. */
export function watchTurnkeyMossBalance(onBalance: (amount: string | null) => void, signal: AbortSignal) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined, stopped = false, busy = false, lastRead = 0;
  let session: TurnkeyWalletSession | undefined, auth: GameAuthentication | undefined, identity = '', epoch = walletEpoch, account: TurnkeyAccount | undefined;
  let attemptedAuthentication = false;
  const target = activeRealmTarget('/api/config');
  const lifetime = AbortSignal.any([signal, target.signal, controller.signal]);
  function stop() {
    if (stopped) return;
    stopped = true; controller.abort(); clearTimeout(timer);
    lifetime.removeEventListener('abort', stop); document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('mossvale-wallet-reset', stop); window.removeEventListener('pagehide', stop);
    onBalance(null);
  }
  function context() {
    if (lifetime.aborted || epoch !== walletEpoch || auth && auth.getWalletIdentity() !== identity) throw walletCancelled();
  }
  async function refresh() {
    if (stopped || busy || document.hidden) return;
    busy = true; lastRead = Date.now();
    try {
      if (!session) {
        auth = await import('./auth.ts'); identity = auth.getWalletIdentity(); context();
        const response = await fetch(target.url, { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.any([lifetime, AbortSignal.timeout(10000)]) });
        if (!response.ok) throw Error('Wallet configuration is unavailable.');
        const config = (await response.json()).turnkey; context();
        if (!config) { stop(); return; }
        session = await walletSession(config); lifetime.throwIfAborted();
        // A configuration change may intentionally replace the singleton while it loads.
        epoch = walletEpoch; context();
      }
      context();
      try { await session.assertIdentity(identity); }
      catch (error) {
        context();
        if (attemptedAuthentication || !['WALLET_SESSION_EXPIRED', 'WALLET_IDENTITY_REQUIRED'].includes((error as { code?: string }).code ?? '')) throw error;
        attemptedAuthentication = true;
        await session.authenticateWithGame(nonce => {
          context();
          return auth!.authorizeWallet(nonce, lifetime).then(result => { context(); return result; });
        }, identity);
        context(); await session.assertIdentity(identity); account = undefined;
      }
      context();
      if (!account) [account] = await session.accounts();
      context();
      if (!account) throw Error('Wallet account is unavailable.');
      const balance = await readBalances(account.address);
      await session.assertIdentity(identity); context();
      onBalance(formatUnits(balance.mossWei, 18));
    } catch {
      try { context(); } catch { stop(); }
      if (!stopped) onBalance(null);
    } finally {
      busy = false;
      if (!stopped && !document.hidden) timer = setTimeout(refresh, 30000);
    }
  }
  function visibility() {
    clearTimeout(timer);
    if (!stopped && !document.hidden && !busy) {
      const delay = Math.max(0, 30000 - (Date.now() - lastRead));
      if (delay) timer = setTimeout(refresh, delay); else void refresh();
    }
  }
  lifetime.addEventListener('abort', stop, { once: true });
  window.addEventListener('mossvale-wallet-reset', stop); window.addEventListener('pagehide', stop);
  document.addEventListener('visibilitychange', visibility);
  if (lifetime.aborted) stop(); else void refresh();
  return stop;
}
const explorer = 'https://robinhoodchain.blockscout.com';
function explorerLink(label: string, path: string, parent: HTMLElement) {
  const link = document.createElement('a'); link.textContent = label; link.href = explorer + path;
  link.target = '_blank'; link.rel = 'noopener noreferrer'; link.className = 'turnkey-explorer'; parent.append(link); return link;
}

/** Settings and the wallet chooser share account, session and recovery controls. */
export function mountTurnkeyManagement(container: HTMLElement) {
  const controller = new AbortController();
  const walletHost = document.createElement('div'), recoveryHost = document.createElement('div');
  let disposeRecovery: (() => void) | undefined;
  container.replaceChildren(walletHost, recoveryHost); paragraph('Loading wallet settings…', walletHost);
  void import('./auction-recovery.ts').then(recovery => {
    if (!controller.signal.aborted) disposeRecovery = recovery.mountAuctionRecovery(recoveryHost, controller.signal);
  }).catch(() => { if (!controller.signal.aborted) paragraph('Old auction proceeds recovery could not load. Reopen Wallet to retry.', recoveryHost); });
  void (async () => {
    const target = activeRealmTarget('/api/config');
    const response = await fetch(target.url, { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.any([controller.signal, target.signal, AbortSignal.timeout(10000)]) });
    if (!response.ok) throw Error('Wallet settings could not load. Try again.');
    const config = (await response.json()).turnkey;
    if (controller.signal.aborted || target.signal.aborted) return;
    if (!config) throw Error('Mossvale Wallet is not enabled on this realm yet.');
    walletHost.replaceChildren();
    await openTurnkeyWallet(config, walletSession, { manage: true, container: walletHost, signal: controller.signal });
  })().catch(error => {
    if (!controller.signal.aborted) { walletHost.replaceChildren(); paragraph((error as { code?: number }).code === 4001 ? 'Wallet disconnected. Reopen Wallet to connect again.' : errorMessage(error), walletHost); }
  });
  return () => { controller.abort(); disposeRecovery?.(); container.replaceChildren(); };
}

export async function openTurnkeyWallet(config: WalletConfig, loadSession = walletSession, options: { manage?: boolean; connect?: boolean; authentication?: GameAuthentication; container?: HTMLElement; signal?: AbortSignal } = {}): Promise<WalletProvider> {
  if (options.signal?.aborted) throw walletCancelled();
  const target = activeRealmTarget('/api/turnkey/wallet');
  const providerLifetime = AbortSignal.any([target.signal, ...(options.signal ? [options.signal] : [])]);
  const ui = walletView('Mossvale wallet', options.container, providerLifetime, options.connect && !options.manage);
  if (options.manage) ui.cancel.textContent = 'Done';
  if (options.container) ui.actions.hidden = true;
  return new Promise((resolve, reject) => {
    let session: TurnkeyWalletSession | undefined, auth: GameAuthentication, identity = '', busy = false, epoch = walletEpoch;
    const collections = config.collections ?? {};
    ui.cancelWith(() => { if (busy && !target.signal.aborted) disconnectWallet(); reject(walletCancelled()); });
    // The session and selected provider outlive this view, but never its realm or account context.
    const checkContext = () => {
      if (target.signal.aborted || epoch !== walletEpoch || auth.getWalletIdentity() !== identity) throw walletCancelled();
    };
    const sameAccount = async () => {
      checkContext();
      await session!.assertIdentity(identity);
      checkContext();
    };
    const guard = async () => {
      if (ui.signal.aborted) throw walletCancelled();
      await sameAccount();
      if (ui.signal.aborted) throw walletCancelled();
    };
    const providerGuard = async () => {
      if (providerLifetime.aborted) throw walletCancelled();
      await sameAccount();
      if (providerLifetime.aborted) throw walletCancelled();
    };
    let authentication: Promise<void> | undefined;
    const authenticate = (signal: AbortSignal, popup?: Window) => {
      if (signal.aborted) throw walletCancelled();
      checkContext();
      return authentication ??= session!.authenticateWithGame(nonce => {
        checkContext();
        return auth.authorizeWallet(nonce, signal, popup).then(result => {
          if (signal.aborted) throw walletCancelled(); checkContext(); return result;
        });
      }, identity).then(async () => { if (signal.aborted) throw walletCancelled(); await sameAccount(); }).finally(() => { authentication = undefined; });
    };
    async function showAccounts() {
      await guard();
      const [account] = await session!.accounts(); if (ui.signal.aborted) return;
      if (!account) throw Error('Your game wallet could not be opened. Try again.');
      const selectAccount = async () => {
        await guard();
        const provider = createTurnkeyProvider(session!, account.address, {
          approve: async request => { await providerGuard(); await approveTurnkeyRequest(request, config.collections, providerLifetime, config.arenaContract); await providerGuard(); },
          walletRpc: request => walletRpc(request, { ...target, signal: providerLifetime }, providerGuard),
        });
        ui.close();
        resolve({ ...provider, async request(request) {
          const input = request.method === 'eth_sendTransaction' && request.auctionPurchase !== undefined
            ? { ...request, auctionPurchase: structuredClone(request.auctionPurchase) } : request;
          try {
            try { await providerGuard(); }
            catch (error) {
              // Only ordinary expiry can silently renew an already selected wallet.
              if ((error as { code?: string }).code !== 'WALLET_SESSION_EXPIRED') throw error;
              await authenticate(providerLifetime);
            }
            await providerGuard();
          } catch (error) {
            if (request.method === 'eth_sendTransaction') throw Object.assign(error instanceof Error ? error : Error('Wallet connection failed before submission.'), { transactionNotSubmitted: true });
            throw error;
          }
          return provider.request(input);
        } });
      };
      if (options.connect && !options.manage) { await selectAccount(); return; }
      ui.body.replaceChildren(); ui.status.textContent = '';
      const network = paragraph('Robinhood Chain', ui.body); network.className = 'turnkey-network';
      const balances = document.createElement('div'); balances.className = 'turnkey-balances'; ui.body.append(balances);
      const mossAsset=document.createElement('section'),ethAsset=document.createElement('section');balances.append(mossAsset,ethAsset);
      paragraph('MOSS',mossAsset).className='turnkey-asset-label';paragraph('ETH · Network fees',ethAsset).className='turnkey-asset-label';
      const mossBalance = paragraph('Loading balance…', mossAsset), ethBalance = paragraph('Loading balance…', ethAsset);
      mossBalance.className=ethBalance.className='turnkey-asset-amount';
      const showBalance = async () => {
        try {
          const balance = await readBalances(account.address);
          if (!ui.signal.aborted) {
            mossBalance.textContent = `${formatUnits(balance.mossWei, 18)} MOSS`; ethBalance.textContent = `${formatEther(balance.ethWei)} ETH`;
          }
        } catch { if (!ui.signal.aborted) { mossBalance.textContent = 'Balance unavailable'; ethBalance.textContent = 'Refresh to retry'; } }
      };
      const nav = document.createElement('nav'); nav.className = 'turnkey-tabs'; nav.setAttribute('aria-label', 'Wallet sections'); ui.body.append(nav);
      const page = document.createElement('div'); page.className = 'turnkey-page'; ui.body.append(page);
      let pageEpoch = 0, pageController = new AbortController();
      ui.signal.addEventListener('abort', () => pageController.abort(), { once: true });
      function section(name: string, render: () => void) {
        const tab = button(name, nav);
        tab.onclick = () => { if (busy) return; pageEpoch++; pageController.abort(); pageController = new AbortController(); for (const child of Array.from(nav.children)) child.removeAttribute('aria-current'); tab.setAttribute('aria-current', 'page'); page.replaceChildren(); ui.status.textContent = ''; render(); };
        return tab;
      }
      const receive = section('Receive', () => {
        paragraph('Send only MOSS or ETH on Robinhood Chain to this address. Funds and saved payouts in other wallets stay there.', page);
        const address = document.createElement('pre'); address.textContent = account.address; page.append(address);
        const copy = button('Copy address', page); copy.onclick = () => void navigator.clipboard.writeText(account.address).then(() => { if (!ui.signal.aborted) ui.status.textContent = 'Address copied. Use Robinhood Chain only.'; }).catch(() => { if (!ui.signal.aborted) ui.status.textContent = 'Could not copy. Select and copy the address above.'; });
      });
      section('Send', () => showSend());
      section('NFTs', () => {
        paragraph('Pet access and house ownership follow the NFT when you transfer it.', page);
        const list = document.createElement('div'); page.append(list);
        const collectionEntries = Object.entries(collections).filter(([, value]) => !!value);
        if (!collectionEntries.length) { paragraph('NFT collections are not configured on this realm.', list); return; }
        const loading = paragraph('Loading owned NFTs…', list), epoch = pageEpoch;
        void readOwnedNfts(account.address, collections).then(result => {
          if (ui.signal.aborted || epoch !== pageEpoch) return;
          list.replaceChildren();
          if (!result.items.length) paragraph('No indexed Mossvale NFTs found. Recently received tokens can take time to appear.', list);
          for (const nft of result.items) {
            const row = document.createElement('div'); row.className = 'turnkey-nft';
            paragraph(`${nft.name}${nft.legacy ? ' (legacy)' : ''} · #${nft.tokenId}`, row);
            const transfer = button('Transfer', row); transfer.onclick = () => { if (busy) return; pageEpoch++; page.replaceChildren(); showSend(nft); }; list.append(row);
          }
          if (result.truncated) paragraph('Some NFTs are not shown. Use their token ID below or view your full collection in the explorer.', list);
        }).catch(() => { if (!ui.signal.aborted && epoch === pageEpoch) loading.textContent = 'NFT lookup is unavailable. You can still transfer by token ID; ownership is checked on-chain.'; });
        const manual = button('Transfer by token ID', page); manual.onclick = () => { if (busy) return; pageEpoch++; page.replaceChildren(); showSend('manual'); };
        explorerLink('View collection in explorer', `/address/${account.address}?tab=nft`, page);
      });
      section('Activity', () => {
        paragraph('View confirmed transfers and game payments in the chain explorer.', page);
        explorerLink('Open wallet activity', `/address/${account.address}`, page);
        if (session!.pendingTransaction()) {
          paragraph('A transaction needs confirmation. Check it before starting another payment.', page);
          const check = button('Check pending transaction', page);
          check.onclick = async () => {
            check.disabled = true; ui.status.textContent = 'Checking the existing transaction…';
            try {
              await guard(); const hash = await session!.resumeTransaction(); await guard(); await session!.acknowledgeTransaction(hash);
              if (!ui.signal.aborted) { ui.status.textContent = 'Transaction included. Return to the game to check delivery or payout.'; explorerLink('View transaction', `/tx/${hash}`, page); check.remove(); void showBalance(); }
            } catch (error) { if (!ui.signal.aborted) ui.status.textContent = errorMessage(error); }
            finally { check.disabled = false; }
          };
        } else paragraph('No pending wallet submissions on this device.', page);
      });
      const security = section('Security', () => {
        paragraph('Your game account opens this wallet. Every payment and transfer still needs your approval.', page);
        const backup = button('Back up wallet', page); backup.onclick = async () => {
          const signal = pageController.signal; backup.disabled = true;
          try {
            await guard(); if (signal.aborted) return;
            if (options.container) page.replaceChildren();
            await exportWallet(session!, account, options.container ? page : undefined, signal, guard, options.container ? () => security.click() : undefined);
          } catch (error) { if (!ui.signal.aborted && !signal.aborted) ui.status.textContent = errorMessage(error); }
          finally { backup.disabled = false; }
        };
        const logout = button('Disconnect wallet', page); logout.onclick = () => {
          try { localStorage.setItem('mossvale-wallet-reset', crypto.randomUUID()); } catch { /* Invalidate this page even if storage is unavailable. */ }
          window.dispatchEvent(new Event('mossvale-wallet-reset'));
        };
      });
      function showSend(nft?: OwnedNft | 'manual') {
        paragraph('Transfers use your ETH for the network fee. Mossvale does not fund wallet transfers.', page);
        const form = document.createElement('form'); page.append(form);
        let asset: HTMLSelectElement | undefined, amount: HTMLInputElement | undefined, collection: HTMLSelectElement | undefined, tokenId: HTMLInputElement | undefined;
        if (!nft) {
          const wrapper = document.createElement('label'); wrapper.textContent = 'Asset'; asset = document.createElement('select'); wrapper.append(asset); form.append(wrapper);
          for (const name of ['MOSS', 'ETH']) { const option = document.createElement('option'); option.value = name.toLowerCase(); option.textContent = name; asset.append(option); }
          amount = input('Amount', 'text', form); amount.inputMode = 'decimal'; amount.maxLength = 80; amount.autocomplete = 'off';
        } else if (nft === 'manual') {
          const wrapper = document.createElement('label'); wrapper.textContent = 'Collection'; collection = document.createElement('select'); wrapper.append(collection); form.append(wrapper);
          for (const [key, address] of Object.entries(collections)) if (address) { const option = document.createElement('option'); option.value = address; option.textContent = key === 'housesContract' ? 'Mossvale houses' : key === 'legacyPetsContract' ? 'Legacy Mossvale pets' : 'Mossvale pets'; collection.append(option); }
          tokenId = input('Token ID', 'text', form); tokenId.inputMode = 'numeric'; tokenId.maxLength = 78;
        } else paragraph(`${nft.name} · Token #${nft.tokenId}`, form);
        const recipient = input('Recipient address', 'text', form); recipient.placeholder = '0x…'; recipient.maxLength = 42; recipient.autocomplete = 'off'; recipient.spellcheck = false;
        const review = button('Review transfer', form); review.type = 'submit';
        form.onsubmit = async event => {
          event.preventDefault(); if (busy) return;
          const transferEpoch = pageEpoch; let submitting = false;
          busy = true; review.disabled = true; ui.status.textContent = 'Checking balance, ownership and network fee…';
          try {
            await guard();
            const from = account.address, to = recipient.value.trim();
            const transfer = nft ? { from, to, asset: 'nft' as const, contract: nft === 'manual' ? collection!.value : nft.contract, tokenId: nft === 'manual' ? tokenId!.value.trim() : nft.tokenId }
              : { from, to, asset: asset!.value as 'moss' | 'eth', amount: amount!.value.trim() };
            const prepared = await prepareTransfer(transfer, collections); await guard();
            if (transferEpoch !== pageEpoch) throw walletCancelled();
            const confirmation = walletView('Review transfer', options.container ? page : undefined);
            ui.status.textContent = '';
            if (options.container) { form.hidden = true; confirmation.heading.focus(); confirmation.signal.addEventListener('abort', () => { form.hidden = false; if (!ui.signal.aborted) review.focus(); }, { once: true }); }
            paragraph(prepared.nft ? `${prepared.nft.name} · Token #${prepared.nft.tokenId}` : `${transfer.asset !== 'nft' ? transfer.amount : ''} ${transfer.asset.toUpperCase()}`, confirmation.body);
            paragraph(`From: ${from}`, confirmation.body); paragraph(`Recipient: ${to}`, confirmation.body);
            if (prepared.nft) { paragraph(`Collection: ${prepared.nft.contract}`, confirmation.body); paragraph('Pet access or house ownership will move to the recipient.', confirmation.body); }
            paragraph(`Maximum network fee: ${formatEther(prepared.maxFeeWei)} ETH`, confirmation.body);
            paragraph('Robinhood Chain · Paid from your wallet. Review the full recipient address before sending.', confirmation.body);
            const send = button('Confirm transfer', confirmation.actions);
            send.className = 'wallet-primary';
            await new Promise<void>((confirmed, cancelled) => {
              const abort = () => { confirmation.close(); cancelled(walletCancelled()); };
              ui.signal.addEventListener('abort', abort, { once: true });
              confirmation.cancelWith(() => { ui.signal.removeEventListener('abort', abort); cancelled(walletCancelled()); });
              send.onclick = () => { ui.signal.removeEventListener('abort', abort); confirmation.close(); confirmed(); };
            });
            await guard(); ui.status.textContent = 'Submitting your approved transfer…';
            submitting = true;
            const hash = await session!.sendPaidTransaction(prepared.transaction, async () => { await guard(); const fees = await revalidateTransfer(prepared, collections); await guard(); return fees; });
            await guard(); await session!.acknowledgeTransaction(hash);
            ui.status.textContent = 'Transfer included on-chain.'; explorerLink('View transfer', `/tx/${hash}`, page); form.remove(); void showBalance();
          } catch (error) { if (!ui.signal.aborted) ui.status.textContent = (error as { code?: number }).code === 4001 ? submitting ? 'Transfer interrupted. Check Activity before trying again.' : 'Transfer cancelled. Nothing was submitted.' : errorMessage(error); }
          finally { busy = false; review.disabled = false; }
        };
      }
      receive.click(); void showBalance();
      const refresh = button('Refresh balances', ui.body); refresh.onclick = () => void showBalance();
      if (config.gasFunding === false) paragraph('Game-funded payments are not enabled on this realm. Wallet transfers remain available when you have ETH for fees.', ui.body);
      if (!options.manage) {
        const use = button('Use this wallet', ui.body); use.onclick = async () => {
          if (busy) return;
          try { await selectAccount(); } catch (error) { ui.status.textContent = errorMessage(error); }
        };
        use.className = 'wallet-primary';
      }
    }
    async function openGameWallet(popup?: Window) {
      if (busy) { popup?.close(); return; }
      busy = true; ui.body.replaceChildren(); ui.status.textContent = 'Opening your wallet with your game session…';
      try {
        await authenticate(ui.signal, popup);
        await guard(); busy = false; await showAccounts();
      } catch (error) {
        if (ui.signal.aborted) return;
        ui.show();
        const interactive = (error as { code?: string }).code === 'WALLET_SSO_INTERACTION_REQUIRED';
        ui.status.textContent = errorMessage(error);
        const retry = button(interactive ? 'Reconnect game session' : 'Retry wallet', ui.body);
        retry.className = 'wallet-primary';
        retry.onclick = () => {
          if (busy) return;
          let reserved: Window | undefined;
          if (interactive) {
            reserved = window.open('about:blank', '_blank') ?? undefined;
            if (!reserved) { ui.status.textContent = 'Allow pop-ups for game sign-in, then reconnect your game session.'; return; }
            reserved.opener = null;
          }
          void openGameWallet(reserved);
        };
      } finally { popup?.close(); busy = false; }
    }
    ui.status.textContent = 'Opening wallet…';
    void (async () => {
      auth = options.authentication ?? await import('./auth.ts'); if (ui.signal.aborted) return; identity = auth.getWalletIdentity();
      session = await loadSession(config); if (ui.signal.aborted) return;
      epoch = walletEpoch;
      session.configureSponsorRpc(request => walletRpc(request, target, sameAccount));
      try { await session.assertIdentity(identity); }
      catch (error) {
        if (!['WALLET_SESSION_EXPIRED', 'WALLET_IDENTITY_REQUIRED'].includes((error as { code?: string }).code ?? '')) throw error;
        if (!ui.signal.aborted) await openGameWallet(); return;
      }
      await showAccounts();
    })().catch(error => { if (!ui.signal.aborted) { ui.show(); ui.status.textContent = errorMessage(error); } });
  });
}
