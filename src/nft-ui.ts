import { Interface, formatUnits, parseUnits } from 'ethers';
import { DEED_AUCTIONEER } from './city.ts';
import type { ClientMessage, Player, ServerMessage } from './shared.ts';
import { MOSS_TOKEN } from './auction.ts';
import { NFT_ABI, NFT_MIGRATION_ABI, NFT_AUCTION_ABI, NFT_HOUSES, NFT_PETS, NFT_MOUNTS, NFT_LEGACY_PETS, nftAuctionTransactionValid, nftMigrationTransactionValid, nftOrderValid, nftAsset, nftLearnedPetConvertible, nftLearnedMountConvertible, type NftOrder, type NftState, type NftAuctionTransaction, type NftMigration } from './nfts.ts';
import { isPetId, type PetId } from './pets.ts';
import type { MountId } from './travel.ts';
import { isNativeApp } from './native-client.ts';
import { chooseWallet, type WalletProvider } from './wallet-provider.ts';

const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const tokenABI = ['function balanceOf(address) view returns(uint256)', 'function allowance(address,address) view returns(uint256)', 'function approve(address,uint256) returns(bool)'];
const legacyABI = new Interface(['function ownerOf(uint256) view returns(address)', 'function assets(uint256) view returns(uint256)', 'function getApproved(uint256) view returns(address)', 'function approve(address,uint256)']);
const moss = (amount: string) => formatUnits(amount, MOSS_TOKEN.decimals);
const shortWallet = (wallet: string) => `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
const canceledMintMessage = 'Mint canceled in your wallet. Your pet drop remains reserved until the mint permission expires and the network confirms it was not minted. It then returns automatically. Leave a free bag slot for the return.';
const canceledLearnedMintMessage = 'Mint canceled in your wallet. Your learned pet remains reserved until the mint permission expires and the network confirms it was not minted. It then returns automatically to your collection.';
const canceledMessage = (order: NftOrder) => (order.claimSource === 'learned' ? canceledLearnedMintMessage : canceledMintMessage).replaceAll('pet', order.kind === 'mount' ? 'mount' : 'pet');
type AuctionTerms = { characterId: string; wallet: string; contract: string; action: NftAuctionTransaction['action']; houseId?: string; amountWei?: string; paymentWei: string; refundWei: string };
type AuctionAttempt = { terms: AuctionTerms; response: NftAuctionTransaction; hash: string };
type Terms = { kind: 'pet' | 'mount' | 'house'; assetId: string; characterId: string; wallet: string; contract: string; amountWei: string; claimSource?: 'learned' };

type MigrationTerms = { characterId: string; wallet: string; contract: string; legacyContract: string; tokenId: string };

/** Construct only the reviewed mint and exact MOSS allowance; never forward arbitrary server transaction fields. */
export async function validateNftPayment(order: NftOrder, terms: Terms, now = Date.now()) {
  const { Interface, getAddress } = await import('ethers');
  if (!nftOrderValid(order) || order.kind !== terms.kind || order.assetId !== terms.assetId || order.characterId !== terms.characterId
    || getAddress(order.wallet) !== getAddress(terms.wallet) || getAddress(order.contract) !== getAddress(terms.contract)
    || order.amountWei !== terms.amountWei || order.claimSource !== terms.claimSource || order.status !== 'quoted' || order.expiresAt <= now) throw Error('The NFT quote changed or expired. Review it again.');
  const transaction = { to: terms.contract, data: new Interface(NFT_ABI).encodeFunctionData('mint', [order.contractOrder, order.signature]), value: '0x0', chainId: `0x${MOSS_TOKEN.chainId.toString(16)}` };
  const approval = BigInt(terms.amountWei) ? { to: MOSS_TOKEN.address, data: new Interface(tokenABI).encodeFunctionData('approve', [terms.contract, terms.amountWei]), value: '0x0', chainId: transaction.chainId } : undefined;
  return { ...transaction, approval };
}

export function validateNftAuctionPayment(response: NftAuctionTransaction, terms: AuctionTerms) {
  if (!nftAuctionTransactionValid(response, terms)) throw Error('The auction transaction changed. Review the exact bid and MOSS deposit again.');
  const abi = new Interface(NFT_AUCTION_ABI), asset = nftAsset('house', terms.houseId);
  const data = terms.action === 'bid' ? abi.encodeFunctionData('bidHouse', [asset!.assetId, terms.amountWei, terms.paymentWei])
    : terms.action === 'settle' ? abi.encodeFunctionData('settleHouse', [asset!.assetId]) : abi.encodeFunctionData('withdrawRefund');
  return { to: terms.contract, data, value: '0x0', chainId: '0x1237', ...(terms.action === 'bid' ? { approval: { to: MOSS_TOKEN.address, data: new Interface(tokenABI).encodeFunctionData('approve', [terms.contract, terms.paymentWei]), value: '0x0', chainId: '0x1237' } } : {}) };
}

export function validateNftMigration(migration: NftMigration, terms: MigrationTerms) {
  if (!nftMigrationTransactionValid(migration, terms)) throw Error('The migration changed. Review the original token, wallet and destination collection again.');
  return { to: terms.contract, data: new Interface(NFT_MIGRATION_ABI).encodeFunctionData('migrate', [terms.tokenId]), value: '0x0', chainId: '0x1237',
    approval: { to: terms.legacyContract, data: legacyABI.encodeFunctionData('approve', [terms.contract, terms.tokenId]), value: '0x0', chainId: '0x1237' } };
}

export function mountNftUI(options: { send: (message: ClientMessage) => void; getPlayer: () => Player | undefined; allowed: () => boolean; onOpen: () => void; trigger: HTMLButtonElement; now?: () => number; auctionNearby?: () => boolean }) {
  const now = options.now || Date.now, panel = document.createElement('section');
  panel.id = 'nft-window'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'false'); panel.setAttribute('aria-labelledby', 'nft-title');
  panel.innerHTML = `<header><div><h2 id="nft-title">Pets, mounts &amp; houses</h2></div><button type="button" data-nft-close aria-label="Close NFT collections">×</button></header>
    <div class="nft-scroll"><section class="nft-wallet" aria-label="Linked wallet"><span data-nft-wallet>Loading wallet…</span><div class="nft-wallet-actions"><button type="button" data-nft-connect>Link wallet</button><button type="button" data-nft-refresh>Refresh ownership</button></div><small data-nft-wallet-balance></small></section>
    <details class="nft-about"><summary>Ownership and royalties</summary><p>Pet and mount access and house ownership follow the NFT. Selling or transferring it passes those rights to the new wallet owner.</p><p class="nft-fee">These collections carry a 5% resale royalty for MOSS buyback and burn. Royalties collected in MOSS are burned directly. Marketplace enforcement depends on the supported sale route.</p></details>
    <p id="nft-status" role="status" aria-live="polite" tabindex="-1"></p><div data-nft-review></div><div data-nft-orders></div>
    <nav class="nft-tabs" aria-label="NFT collections"><button type="button" data-nft-tab="houses" aria-pressed="true">Houses <span data-nft-count="houses">—</span></button><button type="button" data-nft-tab="pets" aria-pressed="false">Pets <span data-nft-count="pets">—</span></button><button type="button" data-nft-tab="mounts" aria-pressed="false">Mounts <span data-nft-count="mounts">—</span></button></nav>
    <section data-nft-panel="houses"><h3 id="nft-house-title" tabindex="-1">Mossvale Houses</h3><p>Four deeds are auctioned for four hours from opening, with a $100 opening reserve per house paid in MOSS. The highest funded bid wins, and the full winning bid is burned.</p>
    <p class="nft-auction-clock" data-nft-auction-clock role="timer"></p><p data-nft-auction-location>Visit the deed auctioneer to bid, settle an auction or withdraw outbid funds.</p>
    <div data-nft-auction-review></div><div class="nft-refund"><span data-nft-refund></span><button type="button" data-nft-withdraw>Review withdrawal</button><button type="button" data-nft-auction-check hidden>Check transaction</button><button type="button" data-nft-auction-recover hidden>Recover pending transaction</button></div>
    <div class="nft-review" data-nft-auction-recovery hidden><h3>Check your wallet activity</h3><p>If the transaction was canceled, replaced or has no receipt, you can clear this local pending record. Clearing does not cancel the transaction: it may still execute and spend MOSS. Any new auction action needs a separate review.</p><button type="button" data-nft-auction-clear>Clear record and allow a new review</button></div>
    <div class="nft-houses" data-nft-houses>${NFT_HOUSES.map(house => `<article data-nft-lot="${house.id}"><img class="nft-house-card" data-nft-house-art src="/nfts/houses/${house.assetId}.png" alt="${escape(house.name)} NFT deed card" width="600" height="900" loading="lazy" decoding="async"><h4>${escape(house.name)}</h4><p data-lot-status>Loading auction…</p><p data-lot-reserve></p><p data-lot-highest></p><p data-lot-locked></p><div class="nft-lot-actions"><label for="nft-bid-${house.assetId}">Your bid (MOSS)</label><input id="nft-bid-${house.assetId}" data-nft-bid-input type="text" inputmode="decimal" autocomplete="off" placeholder="MOSS amount"><button type="button" data-nft-bid="${house.id}">Review bid</button><button type="button" data-nft-settle="${house.id}">Review settlement</button></div></article>`).join('')}</div>
    </section><section data-nft-panel="pets" hidden><h3>Mossvale Pets</h3><div class="nft-owned" data-nft-owned="pets"></div><details class="nft-mint-catalog" data-nft-mint-catalog="pets"><summary>Mint or convert a pet</summary><p>Claim an unlearned drop or convert a learned pet into an NFT. The drop or character unlock is reserved for the claim; pet access then follows the NFT wallet owner.</p>
    <div data-nft-migration hidden><h3>Move an original pet NFT</h3><p>Migration is optional. Find the original NFT's token ID in your wallet or its OpenSea Details, then review it here. You keep the same pet species in the new collection.</p><div class="nft-lot-actions"><label for="nft-legacy-token">Original pet token ID</label><input id="nft-legacy-token" data-nft-legacy-token type="text" inputmode="numeric" autocomplete="off"><button type="button" data-nft-migration-request>Review migration</button></div><div data-nft-migration-review></div></div>
    <div class="nft-pets" data-nft-pets></div></details></section><section data-nft-panel="mounts" hidden><h3>Mossvale Mounts</h3><div class="nft-owned" data-nft-owned="mounts"></div><details class="nft-mint-catalog" data-nft-mint-catalog="mounts"><summary>Mint or convert a mount</summary><p>Learn a dropped mount for your character or mint it as an NFT in this separate collection. Eligible learned mounts can be converted. The two mount-seller mounts cannot be minted.</p><div class="nft-pets" data-nft-mounts></div></details></section></div>`;
  document.body.append(panel); options.trigger.setAttribute('aria-controls', panel.id); options.trigger.setAttribute('aria-expanded', 'false');
  const query = <T extends HTMLElement = HTMLElement>(selector: string) => panel.querySelector<T>(selector)!;
  let collectionTab:'houses'|'pets'|'mounts'='houses';
  function selectCollection(tab:typeof collectionTab){collectionTab=tab;for(const node of panel.querySelectorAll<HTMLElement>('[data-nft-panel]'))node.hidden=node.dataset.nftPanel!==tab;for(const button of panel.querySelectorAll<HTMLButtonElement>('[data-nft-tab]'))button.setAttribute('aria-pressed',String(button.dataset.nftTab===tab));}
  let selectedProvider: WalletProvider | undefined;
  let state: NftState | null = null, owner = '', session = 0, busy = false, walletBusy = false, linking = '', waitingBind = false, statusPinned = false;
  let awaiting: Terms | null = null, review: { order?: NftOrder; terms: Terms } | null = null, previousFocus: HTMLElement | null = null, lastPoll = 0, requestAt = 0, canceledOrderId = '';
  let requestedClaim: {kind: 'pet' | 'mount'; assetId: string} | null = null;
  let migrationAwaiting: MigrationTerms | null = null, migrationReview: { terms: MigrationTerms; migration: NftMigration } | null = null, recoveringMigration = false;
  let auctionAwaiting: AuctionTerms | null = null, auctionReview: { terms: AuctionTerms; response: NftAuctionTransaction } | null = null, auctionSecond = 0, auctionReviewHTML = '', recoveringAuction: AuctionAttempt | null = null;
  const auctionAttempts = new Map<string, AuctionAttempt>(), observedBids = new Set<string>();
  const attempts = new Map<string, string>(), key = (order: NftOrder) => `mossvale-nft:${order.characterId}:${order.id}`;
  const attempted = (order: NftOrder) => { try { return attempts.get(key(order)) || window.localStorage.getItem(key(order)); } catch { return attempts.get(key(order)); } };
  const remember = (order: NftOrder, value: string) => { window.localStorage.setItem(key(order), value); attempts.set(key(order), value); };
  const current = () => ({ session, characterId: options.getPlayer()?.id });
  const active = (operation: ReturnType<typeof current>) => operation.session === session && operation.characterId === options.getPlayer()?.id && options.allowed() && !panel.hidden;
  const say = (text: string, pinned = true) => { statusPinned = pinned; query('#nft-status').textContent = text; };
  const request = (message: ClientMessage) => { busy = true; requestAt = now(); options.send(message); };
  const usable = () => !!state?.enabled && state.feeBps === 500 && !!state.wallet && !isNativeApp();
  const petContract = (assetId: string, order?: NftOrder) => {
    const number = nftAsset('pet', assetId)?.assetId ?? 0;
    if (order && (number <= 8 && state?.legacyPetsContract?.toLowerCase() === order.contract.toLowerCase() || number > 8 && number <= 16 && state?.newPetsContract?.toLowerCase() === order.contract.toLowerCase())) return order.contract;
    return state?.legacyPetsContract || number <= 8 ? state?.petsContract : state?.newPetsContract;
  };
  const contractFor = (kind: Terms['kind'], assetId: string, order?: NftOrder) => kind === 'mount' ? state?.mountsContract : petContract(assetId, order);
  const mintable = (assetId: string, kind: Terms['kind'] = 'pet') => {
    if (kind === 'mount') return !!state?.mountsEnabled && !!nftAsset('mount', assetId) && !!state.mintableMountIds?.some(id => id === assetId);
    const number = nftAsset('pet', assetId)?.assetId ?? 0;
    const available = number > 0 && (number <= 8 || !!state?.legacyPetsContract || number <= 16 && !!state?.newPetsEnabled);
    return available && (state?.mintablePetIds ? state.mintablePetIds.some(id => id === assetId) : number <= 8 || !state?.legacyPetsContract && number <= 16 && !!state?.newPetsEnabled);
  };
  const learnedClaim = (assetId: string, kind: Terms['kind'] = 'pet') => kind === 'mount' ? nftLearnedMountConvertible(assetId) && options.getPlayer()?.ownedMounts?.includes(assetId as MountId) : (nftLearnedPetConvertible(assetId) || !!state?.legacyPetsContract) && options.getPlayer()?.ownedPets?.includes(assetId as PetId);
  const pending = (kind: Terms['kind'], assetId: string) => state?.orders.some(order => order.kind === kind && order.assetId === assetId && order.status === 'quoted');
  function reveal(selector: string) { const node = query(selector),section=node.closest<HTMLElement>('[data-nft-panel]'),tab=section?.dataset.nftPanel;if(tab==='houses'||tab==='pets'||tab==='mounts')selectCollection(tab);const disclosure=node.closest<HTMLDetailsElement>('details');if(disclosure)disclosure.open=true;node.focus({ preventScroll: true }); node.scrollIntoView?.({ block: 'start' }); }
  function reject(text: string, show = false) { busy = false; linking = ''; waitingBind = false; awaiting = null; auctionAwaiting = null; migrationAwaiting = null; requestedClaim = null; say(text); render(); if (show) reveal('#nft-status'); }
  function close() { if (panel.hidden) return; panel.hidden = true; session++; busy = false; linking = ''; waitingBind = false; awaiting = null; review = null; auctionAwaiting = null; auctionReview = null; migrationAwaiting = null; migrationReview = null; recoveringMigration = false; recoveringAuction = null; requestedClaim = null; options.trigger.setAttribute('aria-expanded', 'false'); previousFocus?.isConnected && previousFocus.focus({ preventScroll: true }); }
  async function wallet(force = false): Promise<WalletProvider> {
    if (isNativeApp()) throw Error('NFT claims and purchases are available in the browser version of Mossvale.');
    if (force || !selectedProvider) selectedProvider = await chooseWallet();
    return selectedProvider;
  }
  async function checkWallet(provider: WalletProvider, address: string, guard: () => void, chain = false) {
    let accounts: string[] = await provider.request({ method: 'eth_accounts', params: [] }); guard();
    if (!accounts.length) { accounts = await provider.request({ method: 'eth_requestAccounts', params: [] }); guard(); }
    if (accounts[0]?.toLowerCase() !== address.toLowerCase()) throw Error('Your wallet account changed. Select the linked wallet and review again.');
    if (chain) { const chainId = await provider.request({ method: 'eth_chainId', params: [] }); guard(); if (BigInt(chainId) !== BigInt(MOSS_TOKEN.chainId)) throw Error('Select Robinhood Chain in your wallet and try again.'); }
  }
  async function connect() {
    if (busy || walletBusy || !options.allowed()) return;
    const operation = current(); walletBusy = true; render();
    try {
      const provider = await wallet(true); if (!active(operation)) return;
      const accounts: string[] = await provider.request({ method: 'eth_requestAccounts', params: [] }); if (!active(operation)) return;
      if (!accounts[0]) throw Error('Select a wallet and try again.');
      linking = accounts[0]; review = null; auctionReview = null; migrationReview = null; request({ type: 'storeWalletChallenge', wallet: linking }); say('Sign the wallet ownership message. Linking does not spend MOSS.');
    } catch (error) { if (active(operation)) reject(error instanceof Error ? error.message : 'Wallet connection failed.', true); }
    finally { walletBusy = false; if (active(operation)) render(); }
  }
  async function walletChallenge(challenge: Extract<ServerMessage, { type: 'storeWalletChallenge' }>) {
    if (!linking || walletBusy || panel.hidden || challenge.address.toLowerCase() !== linking.toLowerCase() || challenge.expiresAt <= now()) return;
    const operation = current(), address = linking;
    const guard = () => { if (!active(operation) || linking !== address || challenge.expiresAt <= now()) throw Error('The wallet link changed or expired. Link it again.'); };
    walletBusy = true; render();
    try {
      const provider = await wallet(); guard(); await checkWallet(provider, address, guard);
      const { hexlify, toUtf8Bytes } = await import('ethers'); guard();
      const signature = await provider.request({ method: 'personal_sign', params: [hexlify(toUtf8Bytes(challenge.message)), address] }); guard();
      await checkWallet(provider, address, guard); linking = ''; waitingBind = true; request({ type: 'storeWalletBind', signature });
    } catch (error) { if (active(operation)) reject(error instanceof Error ? error.message : 'Wallet linking was declined.', true); }
    finally { walletBusy = false; if (active(operation)) render(); }
  }
  async function termsFor(kind: Terms['kind'], assetId: string, order?: NftOrder): Promise<Terms> {
    if (kind === 'house' || !usable() || !nftAsset(kind, assetId)) throw Error('Claim a pet or mount here; house deeds are sold by auction.');
    if (!mintable(assetId, kind)) throw Error((kind === 'mount' ? state?.mountsReason : state?.newPetsReason) || `NFT minting for this ${kind} is not enabled on this realm yet.`);
    const contract = contractFor(kind, assetId, order);
    if (!contract) throw Error(`This ${kind} NFT collection is not configured on this realm yet.`);
    const claimSource = order ? order.claimSource : learnedClaim(assetId, kind) ? 'learned' : undefined;
    if (kind === 'mount' && NFT_MOUNTS.find(mount => mount.id === assetId)?.storeOnly && claimSource !== 'learned') throw Error('Store mount NFTs require conversion of an eligible learned mount.');
    return { kind, assetId, characterId: options.getPlayer()!.id, wallet: state!.wallet!, contract, amountWei: '0', ...(claimSource ? { claimSource } : {}) };
  }
  async function reviewClaim(kind: Terms['kind'], assetId: string) {
    if (busy || walletBusy || !options.allowed() || pending(kind, assetId)) return;
    const operation = current(); busy = true; render();
    try {
      const terms = await termsFor(kind, assetId); if (!active(operation)) return;
      review = { terms }; auctionReview = null; migrationReview = null; canceledOrderId = ''; busy = false;
      say(terms.claimSource === 'learned' ? `Review the ${kind} and wallet. Mint NFT reserves your learned ${kind}; after minting, its access follows the NFT owner.` : `Review the ${kind} and wallet. Your drop is reserved only when you choose Mint NFT.`); render(); reveal('[data-nft-review-heading]');
    } catch (error) { if (active(operation)) reject(error instanceof Error ? error.message : 'Could not prepare this NFT.', true); }
  }
  async function quote(order: NftOrder, submit = true) {
    const operation = current(), terms = awaiting; if (!terms || order.kind !== terms.kind || order.assetId !== terms.assetId) return;
    try {
      await validateNftPayment(order, terms, now()); if (!active(operation) || awaiting !== terms) return;
      awaiting = null;
      if (state?.wallet?.toLowerCase() !== terms.wallet.toLowerCase() || !usable()
        || !mintable(terms.assetId, terms.kind)) throw Error('Your linked wallet or NFT availability changed. Refresh ownership.');
      if (attempted(order)) throw Error('A wallet action already started. Check mint status before continuing.');
      if (state) state.orders = [...state.orders.filter(existing => existing.id !== order.id), structuredClone(order)];
      review = { order: structuredClone(order), terms }; busy = false; render();
      if (submit) await mint();
      else { canceledOrderId = ''; say('Review the exact asset and amount, then choose Mint NFT.'); reveal('[data-nft-review-heading]'); }
    } catch (error) { if (active(operation)) reject(error instanceof Error ? error.message : 'The NFT quote could not be verified.', true); }
  }
  async function resume(order: NftOrder) {
    if (busy || walletBusy) return; const operation = current(); busy = true;
    try { const terms = await termsFor(order.kind, order.assetId, order); if (!active(operation)) return; awaiting = terms; await quote(order, false); }
    catch (error) { if (active(operation)) reject(error instanceof Error ? error.message : 'Refresh ownership before reviewing this mint.', true); }
  }
  async function mint() {
    if (busy || walletBusy || !review || !usable() || !options.allowed() || review.order && attempted(review.order)) return;
    const operation = current(), reviewed = structuredClone(review), { order, terms } = reviewed;
    const guard = () => {
      if (!active(operation) || !usable() || review?.terms.kind !== terms.kind || review?.terms.assetId !== terms.assetId || review?.order?.id !== order?.id || state?.wallet?.toLowerCase() !== terms.wallet.toLowerCase()
        || contractFor(terms.kind, terms.assetId, order) !== terms.contract
        || !mintable(terms.assetId, terms.kind)
        || order && (order.expiresAt <= now() || state.orders.find(item => item.id === order.id)?.status !== 'quoted')) throw Error('The wallet, character or mint permission changed. Review the NFT again.');
    };
    canceledOrderId = ''; walletBusy = true; render(); let walletStarted = false, submitted = false;
    try {
      const provider = await wallet(); guard(); await checkWallet(provider, terms.wallet, guard);
      if (BigInt(await provider.request({ method: 'eth_chainId', params: [] })) !== BigInt(MOSS_TOKEN.chainId)) {
        guard(); say('Switch to Robinhood Chain in your wallet to continue minting.');
        const chainId = `0x${MOSS_TOKEN.chainId.toString(16)}`;
        try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] }); }
        catch (error) {
          if ((error as { code?: number } | null)?.code !== 4902) throw error;
          guard(); await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId, chainName: 'Robinhood Chain', rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'], blockExplorerUrls: ['https://robinhoodchain.blockscout.com'], nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 } }] });
          guard(); await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
        }
      }
      await checkWallet(provider, terms.wallet, guard, true);
      if (!order) {
        awaiting = terms; const source = terms.claimSource ? { source: terms.claimSource } : {}; request(terms.kind === 'mount' ? { type: 'nftClaimMount', mount: terms.assetId as MountId, ...source } : { type: 'nftClaimPet', pet: terms.assetId as PetId, ...source }); say(terms.claimSource ? `Reserving your learned ${terms.kind} and preparing wallet confirmation…` : `Reserving one ${terms.kind} drop and preparing wallet confirmation…`); return;
      }
      const { approval, ...transaction } = await validateNftPayment(order, terms, now()); guard();
      if (approval || order.amountWei !== '0' || !['pet', 'mount'].includes(order.kind)) throw Error('Only free pet or mount claims can use this mint action.');
      await checkWallet(provider, terms.wallet, guard, true); remember(order, 'wallet-pending'); walletStarted = true;
      say('Confirm minting the NFT in your wallet. ETH pays the network fee.');
      const hash = await provider.request({ method: 'eth_sendTransaction', params: [{ ...transaction, from: terms.wallet }] });
      if (typeof hash !== 'string' || !/^0x[\da-f]{64}$/i.test(hash)) throw Error('Check your wallet activity: no mint receipt was returned.');
      submitted = true;
      attempts.set(key(order), hash); try { remember(order, hash); } catch { /* The in-memory attempt still prevents duplicate wallet actions. */ }
      if (options.allowed() && options.getPlayer()?.id === order.characterId) options.send({ type: 'nftPaymentCheck', orderId: order.id });
      if (active(operation)) { review = null; say('Mint submitted. Checking chain ownership before granting access.'); }
    } catch (error) {
      const canceled = !!order && walletStarted && !submitted && (error as { code?: number } | null)?.code === 4001;
      if (canceled) {
        canceledOrderId = order.id; attempts.delete(key(order)); try { window.localStorage.removeItem(key(order)); } catch { /* Explicit rejection submitted no mint. */ }
        if (options.allowed() && options.getPlayer()?.id === order.characterId) options.send({ type: 'nftPaymentCheck', orderId: order.id });
      }
      if (active(operation)) reject(canceled ? canceledMessage(order) : error instanceof Error ? error.message : 'Wallet action interrupted. Check mint status and wallet activity.', true);
    } finally { walletBusy = false; if (active(operation)) render(); }
  }
  const migrationKey = (terms: MigrationTerms) => `mossvale-pet-migration:${terms.legacyContract.toLowerCase()}:${terms.contract.toLowerCase()}:${terms.wallet.toLowerCase()}:${terms.tokenId}`;
  const migrationAttempt = (terms: MigrationTerms) => { const key = migrationKey(terms); try { return attempts.get(key) || window.localStorage.getItem(key); } catch { return attempts.get(key); } };
  function forgetMigration(terms: MigrationTerms) { const key = migrationKey(terms); attempts.delete(key); try { window.localStorage.removeItem(key); } catch { /* The receipt or explicit recovery clears the local action only. */ } }
  function migrationTermsCurrent(terms: MigrationTerms) {
    return options.allowed() && usable() && options.getPlayer()?.id === terms.characterId && state?.wallet?.toLowerCase() === terms.wallet.toLowerCase()
      && state?.petsContract?.toLowerCase() === terms.contract.toLowerCase() && state?.legacyPetsContract?.toLowerCase() === terms.legacyContract.toLowerCase();
  }
  function reviewMigration() {
    if (busy || walletBusy || !options.allowed() || !usable() || !state?.legacyPetsContract || !state.petsContract) return;
    const tokenId = query<HTMLInputElement>('[data-nft-legacy-token]').value.trim();
    if (!/^[1-9]\d{0,77}$/.test(tokenId) || BigInt(tokenId) >= 2n ** 256n) { reject('Enter the original NFT token ID as a whole number.', true); return; }
    migrationAwaiting = { characterId: options.getPlayer()!.id, wallet: state.wallet!, legacyContract: state.legacyPetsContract, contract: state.petsContract, tokenId };
    migrationReview = null; recoveringMigration = false; review = null; auctionReview = null; canceledOrderId = '';
    request({ type: 'nftMigrationReview', tokenId }); say('Checking your ownership of the original pet NFT…'); render();
  }
  function migrationQuote(migration: NftMigration) {
    const terms = migrationAwaiting; if (!terms || panel.hidden) return; migrationAwaiting = null;
    try {
      if (!migrationTermsCurrent(terms)) throw Error('The collection, wallet or character changed. Review migration again.');
      validateNftMigration(migration, terms); migrationReview = { terms, migration: structuredClone(migration) }; busy = false;
      say('Review the permanent migration. Your wallet opens only after you confirm below.'); render(); reveal('[data-nft-migration-heading]');
    } catch (error) { reject(error instanceof Error ? error.message : 'The migration could not be verified.', true); }
  }
  async function confirmMigration() {
    if (busy || walletBusy || !migrationReview || !migrationTermsCurrent(migrationReview.terms) || migrationAttempt(migrationReview.terms)) return;
    const selected = migrationReview, operation = current(), { terms, migration } = structuredClone(selected);
    const guard = () => { if (!active(operation) || migrationReview !== selected || !migrationTermsCurrent(terms)) throw Error('The collection, wallet or character changed. Review migration again.'); };
    let started = false, submitted = false; walletBusy = true; render();
    try {
      const { approval, ...transaction } = validateNftMigration(migration, terms), provider = await wallet(); guard(); await checkWallet(provider, terms.wallet, guard, true);
      const read = async (name: 'ownerOf' | 'assets' | 'getApproved') => { const result = await provider.request({ method: 'eth_call', params: [{ to: terms.legacyContract, data: legacyABI.encodeFunctionData(name, [terms.tokenId]) }, 'latest'] }); guard(); return legacyABI.decodeFunctionResult(name, result)[0]; };
      const checkOwner = async () => {
        if ((await read('ownerOf') as string).toLowerCase() !== terms.wallet.toLowerCase() || await read('assets') !== BigInt(nftAsset('pet', migration.assetId)!.assetId)) throw Error('The original NFT owner or species changed. Refresh and review migration again.');
      };
      const destination = new Interface(['function legacyCollection() view returns(address)']);
      const legacy = await provider.request({ method: 'eth_call', params: [{ to: terms.contract, data: destination.encodeFunctionData('legacyCollection') }, 'latest'] }); guard();
      if ((destination.decodeFunctionResult('legacyCollection', legacy)[0] as string).toLowerCase() !== terms.legacyContract.toLowerCase()) throw Error('The destination does not accept this original collection.');
      await checkOwner();
      if ((await read('getApproved') as string).toLowerCase() !== terms.contract.toLowerCase()) {
        await checkWallet(provider, terms.wallet, guard, true);
        await provider.request({ method: 'eth_call', params: [{ ...approval, from: terms.wallet }, 'latest'] }); guard();
        await checkWallet(provider, terms.wallet, guard, true);
        say('Approve only this original pet NFT for migration in your wallet. The migration needs a separate confirmation.');
        const hash = await provider.request({ method: 'eth_sendTransaction', params: [{ ...approval, from: terms.wallet }] }); guard();
        if (typeof hash !== 'string' || !/^0x[\da-f]{64}$/i.test(hash)) throw Error('Check wallet activity: the token approval receipt was not returned.');
        let receipt;
        while (!receipt) { receipt = await provider.request({ method: 'eth_getTransactionReceipt', params: [hash] }); guard(); if (!receipt) { await new Promise(resolve => setTimeout(resolve, 2000)); guard(); } }
        if (BigInt(receipt.status) !== 1n) throw Error('The token approval failed. Review migration again.');
      }
      await checkWallet(provider, terms.wallet, guard, true); await checkOwner();
      await provider.request({ method: 'eth_call', params: [{ ...transaction, from: terms.wallet }, 'latest'] }); guard();
      await checkWallet(provider, terms.wallet, guard, true);
      window.localStorage.setItem(migrationKey(terms), 'wallet-pending'); attempts.set(migrationKey(terms), 'wallet-pending'); started = true;
      say('Confirm the permanent migration: the original NFT is locked and a same-species replacement goes to your wallet.');
      const hash = await provider.request({ method: 'eth_sendTransaction', params: [{ ...transaction, from: terms.wallet }] });
      if (typeof hash !== 'string' || !/^0x[\da-f]{64}$/i.test(hash)) throw Error('No migration receipt was returned. Check wallet activity before continuing.');
      submitted = true; attempts.set(migrationKey(terms), hash); try { window.localStorage.setItem(migrationKey(terms), hash); } catch { /* Preserve a known hash in memory. */ }
      if (active(operation)) { say('Migration submitted. Use Check migration to confirm its receipt and refresh ownership.'); options.send({ type: 'nftOpen' }); }
    } catch (error) {
      if (started && !submitted && (error as { code?: number } | null)?.code === 4001) forgetMigration(terms);
      if (active(operation)) reject(error instanceof Error ? error.message : 'Migration interrupted. Check wallet activity.', true);
    } finally { walletBusy = false; if (active(operation)) render(); }
  }
  async function checkMigration() {
    if (busy || walletBusy || !migrationReview || !migrationTermsCurrent(migrationReview.terms)) return;
    const selected = migrationReview, { terms } = selected, hash = migrationAttempt(terms), operation = current();
    if (!hash) return;
    if (hash === 'wallet-pending') { say('The wallet did not return a transaction hash. Check wallet activity, then recover the local record if needed.'); return; }
    const guard = () => { if (!active(operation) || migrationReview !== selected || !migrationTermsCurrent(terms)) throw Error('The wallet or migration review changed.'); };
    walletBusy = true; render();
    try {
      const provider = await wallet(); guard(); await checkWallet(provider, terms.wallet, guard, true);
      const receipt = await provider.request({ method: 'eth_getTransactionReceipt', params: [hash] }); guard();
      if (!receipt) { say('Migration is still pending. Check wallet activity before recovering a canceled or replaced transaction.'); return; }
      if (!/^0x[01]$/.test(receipt.status) || receipt.transactionHash?.toLowerCase() !== hash.toLowerCase() || receipt.to?.toLowerCase() !== terms.contract.toLowerCase() || receipt.from?.toLowerCase() !== terms.wallet.toLowerCase()) throw Error('The migration receipt could not be verified. Check wallet activity before continuing.');
      forgetMigration(terms); migrationReview = null; recoveringMigration = false;
      say(BigInt(receipt.status) === 1n ? 'Migration transaction confirmed. Waiting for verified pet ownership.' : 'Migration failed. Your original token was not migrated by this transaction. Refresh and review again.');
      options.send({ type: 'nftOpen' });
    } catch (error) { if (active(operation)) reject(error instanceof Error ? error.message : 'Could not check the migration receipt.', true); }
    finally { walletBusy = false; if (active(operation)) render(); }
  }
  const auctionKey = (wallet: string, contract: string) => `mossvale-house-auction:${contract.toLowerCase()}:${wallet.toLowerCase()}`;
  function pendingAuction() {
    if (!state?.wallet || !state.housesContract) return;
    const key = auctionKey(state.wallet, state.housesContract);
    if (auctionAttempts.has(key)) return auctionAttempts.get(key);
    try {
      const saved = JSON.parse(window.localStorage.getItem(key) || 'null') as AuctionAttempt | null;
      if (saved && saved.terms.wallet.toLowerCase() === state.wallet.toLowerCase() && saved.terms.contract.toLowerCase() === state.housesContract.toLowerCase()
        && (saved.hash === 'wallet-pending' || /^0x[\da-f]{64}$/i.test(saved.hash)) && nftAuctionTransactionValid(saved.response, saved.terms)) { auctionAttempts.set(key, saved); return saved; }
    } catch { /* Malformed browser storage never authorizes a transaction. */ }
  }
  function rememberAuction(attempt: AuctionAttempt) {
    const key = auctionKey(attempt.terms.wallet, attempt.terms.contract);
    window.localStorage.setItem(key, JSON.stringify(attempt)); auctionAttempts.set(key, attempt);
  }
  function forgetAuction(attempt: AuctionAttempt) {
    const key = auctionKey(attempt.terms.wallet, attempt.terms.contract); auctionAttempts.delete(key);
    try { window.localStorage.removeItem(key); } catch { /* Final chain state is authoritative. */ }
  }
  function auctionTerms(action: AuctionTerms['action'], houseId?: string, amountWei?: string): AuctionTerms {
    if (!options.allowed() || !options.auctionNearby?.() || !usable() || !state?.housesContract) throw Error('Visit the deed auctioneer with your linked wallet to use the auction.');
    const house = state.houses.find(house => house.id === houseId), refundWei = state.refundWei || '0';
    let paymentWei = '0';
    if (action === 'withdraw') { if (BigInt(refundWei) <= 0n) throw Error('Your wallet has no outbid funds available to withdraw.'); }
    else if (!house || !house.startsAt || house.settled) throw Error('This house auction is not available.');
    else if (action === 'settle') { if (now() < house.endsAt) throw Error('The auction must finish before the winning bid can be settled.'); }
    else {
      if (now() < house.startsAt || now() >= house.endsAt) throw Error('Bidding is closed for this house.');
      if (!amountWei || !/^[1-9]\d{0,77}$/.test(amountWei) || BigInt(amountWei) >= 2n ** 256n || BigInt(amountWei) < BigInt(house.reserveWei) || BigInt(amountWei) <= BigInt(house.highestBidWei)) throw Error('Your bid must meet the opening reserve and exceed the highest bid.');
      paymentWei = (BigInt(amountWei) - (house.highestBidder?.toLowerCase() === state.wallet!.toLowerCase() ? BigInt(house.highestBidWei) : 0n)).toString();
      if (state.walletBalanceWei === null || BigInt(state.walletBalanceWei) < BigInt(paymentWei)) throw Error('Your linked wallet needs enough MOSS for the deposit. Outbid funds must be withdrawn before reusing them.');
    }
    return { action, houseId, amountWei, paymentWei, refundWei, characterId: options.getPlayer()!.id, wallet: state.wallet!, contract: state.housesContract };
  }
  function auctionTermsCurrent(terms: AuctionTerms) {
    try {
      const next = auctionTerms(terms.action, terms.houseId, terms.amountWei);
      return next.characterId === terms.characterId && next.wallet.toLowerCase() === terms.wallet.toLowerCase() && next.contract.toLowerCase() === terms.contract.toLowerCase()
        && next.paymentWei === terms.paymentWei && (terms.action !== 'withdraw' || next.refundWei === terms.refundWei);
    } catch { return false; }
  }
  function requestAuction(action: AuctionTerms['action'], houseId?: string, amount?: string) {
    if (busy || walletBusy || pendingAuction()) return;
    canceledOrderId = '';
    try {
      if (action === 'bid' && !/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(amount || '')) throw Error('Enter a MOSS bid with no more than 18 decimal places.');
      auctionAwaiting = auctionTerms(action, houseId, action === 'bid' ? parseUnits(amount!, 18).toString() : undefined); auctionReview = null; review = null; migrationReview = null;
      request(action === 'bid' ? { type: 'nftBidHouse', npcId: DEED_AUCTIONEER.id, houseId: houseId!, amountWei: auctionAwaiting.amountWei! }
        : action === 'settle' ? { type: 'nftSettleHouse', npcId: DEED_AUCTIONEER.id, houseId: houseId! } : { type: 'nftWithdrawBid', npcId: DEED_AUCTIONEER.id });
      say('Preparing the exact auction transaction for review…'); render();
    } catch (error) { reject(error instanceof Error ? error.message : 'This auction action is unavailable.', true); }
  }
  function auctionTransaction(response: NftAuctionTransaction) {
    const terms = auctionAwaiting; if (!terms) return; auctionAwaiting = null;
    try {
      if (!auctionTermsCurrent(terms) || pendingAuction()) throw Error('The auction or wallet changed. Review the auction again.');
      validateNftAuctionPayment(response, terms); auctionReview = { terms, response: structuredClone(response) }; busy = false;
      say('Review the auction transaction. Your wallet opens only after confirmation.'); render(); reveal('[data-nft-auction-review-heading]');
    } catch (error) { reject(error instanceof Error ? error.message : 'The auction transaction could not be verified.', true); }
  }
  async function confirmAuction() {
    if (busy || walletBusy || !auctionReview || pendingAuction()) return;
    const selected = auctionReview, operation = current(), { terms, response } = structuredClone(selected);
    const guard = () => { if (!active(operation) || auctionReview !== selected || !auctionTermsCurrent(terms)) throw Error('The auction, wallet or character changed. Review again before continuing.'); };
    let attempt: AuctionAttempt | null = null; walletBusy = true; render();
    try {
      const { approval, ...transaction } = validateNftAuctionPayment(response, terms); guard();
      const provider = await wallet(); guard(); await checkWallet(provider, terms.wallet, guard, true);
      if (approval) {
        const abi = new Interface(tokenABI);
        const read = async (name: 'balanceOf' | 'allowance') => { const value = await provider.request({ method: 'eth_call', params: [{ to: MOSS_TOKEN.address, data: abi.encodeFunctionData(name, name === 'balanceOf' ? [terms.wallet] : [terms.wallet, terms.contract]) }, 'latest'] }); guard(); return abi.decodeFunctionResult(name, value)[0] as bigint; };
        if (await read('balanceOf') < BigInt(terms.paymentWei)) throw Error('Your wallet no longer has enough MOSS for this deposit.');
        if (await read('allowance') < BigInt(terms.paymentWei)) {
          await checkWallet(provider, terms.wallet, guard, true); say(`Approve exactly ${moss(terms.paymentWei)} MOSS for the auction deposit.`);
          const hash = await provider.request({ method: 'eth_sendTransaction', params: [{ ...approval, from: terms.wallet }] }); guard();
          if (typeof hash !== 'string' || !/^0x[\da-f]{64}$/i.test(hash)) throw Error('Check wallet activity: the approval receipt was not returned.');
          let receipt;
          while (!receipt) { receipt = await provider.request({ method: 'eth_getTransactionReceipt', params: [hash] }); guard(); if (!receipt) { await new Promise(resolve => setTimeout(resolve, 2000)); guard(); } }
          if (BigInt(receipt.status) !== 1n) throw Error('The MOSS approval failed. Review the bid again.');
        }
        await checkWallet(provider, terms.wallet, guard, true);
        if (await read('balanceOf') < BigInt(terms.paymentWei) || await read('allowance') < BigInt(terms.paymentWei)) throw Error('Your MOSS balance or allowance changed. Review the auction again.');
      }
      await checkWallet(provider, terms.wallet, guard, true);
      attempt = { terms, response, hash: 'wallet-pending' }; rememberAuction(attempt);
      say(terms.action === 'bid' ? `Confirm depositing ${moss(terms.paymentWei)} MOSS for a total bid of ${moss(terms.amountWei!)} MOSS.` : terms.action === 'settle' ? 'Confirm settling this auction and burning the full winning bid.' : 'Confirm withdrawing your outbid MOSS to the linked wallet.');
      const hash = await provider.request({ method: 'eth_sendTransaction', params: [{ ...transaction, from: terms.wallet }] });
      if (typeof hash !== 'string' || !/^0x[\da-f]{64}$/i.test(hash)) throw Error('No transaction hash was returned. Check wallet activity before continuing.');
      attempt.hash = hash; auctionAttempts.set(auctionKey(terms.wallet, terms.contract), attempt); try { rememberAuction(attempt); } catch { /* Keep the receipt in memory if storage becomes unavailable. */ }
      if (active(operation)) { auctionReview = null; say('Transaction sent. Checking confirmation before another auction action.'); checkAuction(attempt); }
    } catch (error) {
      if (attempt && (error as { code?: number }).code === 4001) forgetAuction(attempt);
      if (active(operation)) reject(error instanceof Error ? error.message : 'Wallet action interrupted. Check the pending transaction.', true);
    } finally { walletBusy = false; if (active(operation)) render(); }
  }
  function checkAuction(attempt = pendingAuction()) {
    if (!attempt || !options.allowed() || !options.auctionNearby?.() || attempt.terms.wallet.toLowerCase() !== state?.wallet?.toLowerCase() || attempt.terms.contract.toLowerCase() !== state?.housesContract?.toLowerCase()) return;
    if (attempt.hash === 'wallet-pending') { request({ type: 'nftOpen' }); say('The wallet did not return a receipt. Check wallet activity, then use pending transaction recovery if needed.'); }
    else {
      const { action, houseId, amountWei, paymentWei } = attempt.terms;
      request({ type: 'nftAuctionCheck', npcId: DEED_AUCTIONEER.id, transactionHash: attempt.hash, action, ...(houseId ? { houseId } : {}), ...(amountWei ? { amountWei } : {}), paymentWei });
    }
  }
  function auctionChecked(result: { transactionHash: string; state: 'pending' | 'confirmed' | 'failed' }) {
    const attempt = pendingAuction(); if (!attempt || attempt.hash !== result.transactionHash || !options.allowed()) return;
    busy = false;
    if (result.state !== 'pending') { forgetAuction(attempt); auctionReview = null; say(result.state === 'confirmed' ? 'Auction transaction confirmed. Ownership and balances follow the chain.' : 'The transaction failed. Refresh and review a new auction action.'); options.send({ type: 'nftOpen' }); }
    else say('The transaction is still pending. If you canceled or replaced it, check wallet activity before using pending transaction recovery.');
    render();
  }
  function renderAuction() {
    const near = !!options.auctionNearby?.(), pending = pendingAuction(), blocked = busy || walletBusy || !!pending || !usable() || !near;
    query('[data-nft-auction-location]').textContent = near ? 'Bids deposit MOSS into escrow. Outbid funds can be withdrawn; leading bids stay locked until settlement.' : 'Visit the deed auctioneer to bid, settle an auction or withdraw outbid funds.';
    const refund = state?.refundWei;
    query('[data-nft-refund]').textContent = `Wallet: ${state?.walletBalanceWei != null ? `${moss(state.walletBalanceWei)} MOSS` : 'balance unavailable'} · Outbid funds: ${refund != null ? `${moss(refund)} MOSS` : 'unavailable'}`;
    query<HTMLButtonElement>('[data-nft-withdraw]').disabled = blocked || refund == null || BigInt(refund) <= 0n;
    const check = query<HTMLButtonElement>('[data-nft-auction-check]'); check.hidden = !pending; check.disabled = busy || walletBusy || !near;
    const recover = query<HTMLButtonElement>('[data-nft-auction-recover]'); recover.hidden = !pending; recover.disabled = busy || walletBusy || !near;
    query('[data-nft-auction-recovery]').hidden = !pending || pending !== recoveringAuction;
    query<HTMLButtonElement>('[data-nft-auction-clear]').disabled = busy || walletBusy || !near || !pending || pending !== recoveringAuction;
    const lots = panel.querySelectorAll<HTMLElement>('[data-nft-lot]');
    lots.forEach(node => {
      const house = state?.houses.find(house => house.id === node.dataset.nftLot), ended = !!house?.endsAt && now() >= house.endsAt, leading = !!house?.highestBidder && house.highestBidder.toLowerCase() === state?.wallet?.toLowerCase();
      const bidKey = state?.wallet && state.housesContract && house ? `${auctionKey(state.wallet, state.housesContract)}:${house.id}` : '';
      if (leading && bidKey) observedBids.add(bidKey);
      const outbid = !leading && !!house?.highestBidder && observedBids.has(bidKey);
      node.querySelector<HTMLElement>('[data-lot-status]')!.textContent = !house?.startsAt ? 'Auction not opened' : house.settled ? house.owner ? `Deed owner: ${shortWallet(house.owner)}` : 'Auction settled · no bids' : ended ? leading ? 'Auction ended · your wallet won' : outbid ? 'Auction ended · you were outbid' : 'Auction ended · awaiting settlement' : leading ? 'Your wallet is leading' : outbid ? 'You have been outbid · funds are withdrawable' : house.highestBidder ? 'Another wallet is leading' : 'Open for bids';
      node.querySelector<HTMLElement>('[data-lot-reserve]')!.textContent = house?.startsAt ? `Opening reserve: ${moss(house.reserveWei)} MOSS ($100 at opening)` : '$100 opening reserve · paid in MOSS';
      node.querySelector<HTMLElement>('[data-lot-highest]')!.textContent = house?.highestBidder ? `Highest bid: ${moss(house.highestBidWei)} MOSS · ${shortWallet(house.highestBidder)}` : 'No bids yet';
      node.querySelector<HTMLElement>('[data-lot-locked]')!.textContent = leading && !house?.settled ? `Your locked bid: ${moss(house!.highestBidWei)} MOSS` : '';
      node.querySelector<HTMLInputElement>('[data-nft-bid-input]')!.disabled = blocked || !house?.startsAt || ended || house.settled || now() < house.startsAt;
      node.querySelector<HTMLButtonElement>('[data-nft-bid]')!.disabled = blocked || !house?.startsAt || ended || house.settled || now() < house.startsAt;
      node.querySelector<HTMLButtonElement>('[data-nft-settle]')!.disabled = blocked || !ended || !!house?.settled;
    });
    const first = state?.houses.find(house => house.startsAt), remaining = first ? Math.max(0, Math.ceil((first.endsAt - now()) / 1000)) : 0;
    query('[data-nft-auction-clock]').textContent = !first ? 'Four-hour auction · not opened yet' : remaining ? `Bidding closes in ${Math.floor(remaining / 3600)}h ${Math.floor(remaining % 3600 / 60)}m ${remaining % 60}s` : 'Bidding closed · four-hour auction ended';
    if (walletBusy) { query<HTMLButtonElement>('[data-nft-auction-confirm]') && (query<HTMLButtonElement>('[data-nft-auction-confirm]').disabled = true); return; }
    const terms = auctionReview?.terms;
    const html = terms ? `<article class="nft-review"><h3 data-nft-auction-review-heading tabindex="-1">${terms.action === 'bid' ? 'Review house bid' : terms.action === 'settle' ? 'Settle house auction' : 'Withdraw outbid funds'}</h3><p>${terms.houseId ? escape(nftAsset('house', terms.houseId)!.name) : 'Mossvale Houses'}</p><p>${terms.action === 'bid' ? `Total bid: <strong>${moss(terms.amountWei!)} MOSS</strong><br>Deposit now: <strong>${moss(terms.paymentWei)} MOSS</strong><br>The full winning bid is burned at settlement. Outbid deposits can be withdrawn.` : terms.action === 'settle' ? 'The winning wallet receives the deed. Its full winning bid is burned; you pay only network gas to settle.' : `<strong>${moss(terms.refundWei)} MOSS</strong> returns to your linked wallet. Leading bids stay locked.`}</p><p>Wallet: ${escape(terms.wallet)}<br>Contract: ${escape(terms.contract)}<br>Network gas is paid in ETH.</p><button type="button" data-nft-auction-confirm>${terms.action === 'bid' ? 'Confirm bid deposit' : terms.action === 'settle' ? 'Confirm settlement' : 'Confirm withdrawal'}</button></article>` : '';
    if (auctionReviewHTML !== html) { query('[data-nft-auction-review]').innerHTML = html; auctionReviewHTML = html; }
    if (terms) query<HTMLButtonElement>('[data-nft-auction-confirm]').disabled = blocked || !auctionTermsCurrent(terms);
  }
  function render() {
    if (panel.hidden) return;
    query('[data-nft-wallet]').textContent = state?.wallet ? `Linked: ${shortWallet(state.wallet)} · ${state.ownershipVerified ? 'Ownership verified' : 'Ownership not verified'}` : 'Link your wallet to claim or buy an NFT.';
    query('[data-nft-wallet]').setAttribute('title',state?.wallet||'No wallet linked');
    query('[data-nft-wallet-balance]').textContent=`Balance: ${state?.walletBalanceWei!=null?moss(state.walletBalanceWei)+' MOSS':'unavailable'} · Outbid funds: ${state?.refundWei!=null?moss(state.refundWei)+' MOSS':'unavailable'}`;
    for(const kind of ['houses','pets','mounts'] as const){const count=state?.ownershipVerified?(kind==='houses'?state.ownedHouses.length:kind==='pets'?state.ownedPets.length:state.ownedMounts?.length||0):null;query(`[data-nft-count="${kind}"]`).textContent=count===null?'Not verified':`${count} owned`;}
    query('[data-nft-connect]').textContent=state?.wallet?'Change wallet':'Link wallet';
    for(const button of panel.querySelectorAll<HTMLButtonElement>('[data-nft-tab]'))button.disabled=walletBusy;
    selectCollection(collectionTab);
    query<HTMLButtonElement>('[data-nft-connect]').disabled = busy || walletBusy || isNativeApp();
    query<HTMLButtonElement>('[data-nft-refresh]').disabled = busy || walletBusy;
    query('[data-nft-migration]').hidden = !state?.legacyPetsContract;
    query<HTMLInputElement>('[data-nft-legacy-token]').disabled = busy || walletBusy || !usable();
    query<HTMLButtonElement>('[data-nft-migration-request]').disabled = busy || walletBusy || !usable();
    renderAuction();
    // Keep wallet-operation controls mounted across passive ownership updates.
    if (walletBusy) { panel.querySelectorAll<HTMLButtonElement>('[data-nft-claim],[data-nft-claim-mount],[data-nft-buy],[data-nft-resume],[data-nft-check],[data-nft-mint],[data-nft-migration-confirm],[data-nft-migration-check],[data-nft-migration-recover],[data-nft-migration-clear]').forEach(button => { button.disabled = true; }); return; }
    const disabled = busy || !usable(), hero = options.getPlayer();
    const html = (selector: string, value: string) => { const node = query(selector); if (node.innerHTML !== value) node.innerHTML = value; };
    for(const [section,kind] of [['pets','pet'],['mounts','mount']] as const){const owned=state?.ownershipVerified?(kind==='pet'?state.ownedPets:state.ownedMounts||[]):null;html(`[data-nft-owned="${section}"]`,owned===null?'<p class="nft-collection-empty">Refresh ownership to verify this wallet’s collection.</p>':owned.length?owned.map(id=>{const asset=nftAsset(kind,id);return asset?`<article>${'icon' in asset&&typeof asset.icon==='string'?`<img src="${escape(asset.icon)}" alt="" width="64" height="64">`:''}<div><h4>${escape(asset.name)}</h4><p>Owned by your verified wallet</p></div></article>`:'';}).join(''):`<p class="nft-collection-empty">No ${section} NFTs in this wallet. Buy or receive one, then refresh ownership.</p>`);}
    const reservations = (state?.orders || []).filter(order => order.status === 'quoted');
    html('[data-nft-pets]', NFT_PETS.map(pet => {
      const count = hero?.carriedItems?.[pet.id] || 0, learned = learnedClaim(pet.id), reserved = reservations.filter(order => order.kind === 'pet' && order.assetId === pet.id).length;
      return `<article><img src="${pet.icon}" width="76" height="76" alt=""><div><h4>${pet.name}</h4><p>${count} unlearned drop${count === 1 ? '' : 's'}${reserved ? ` · ${reserved} reserved for NFT minting` : ''}${learned ? ' · Character unlock available to convert' : ''}</p>${pet.storeOnly ? '<p>Store conversion requires a verified MOSS purchase.</p>' : ''}${!mintable(pet.id) ? '<p>Not yet enabled in this collection.</p>' : ''}${state?.ownedPets.includes(pet.id) && state.ownershipVerified ? '<p>Your wallet owns this pet</p>' : ''}<button type="button" data-nft-claim="${pet.id}" ${disabled || !mintable(pet.id) || !(pet.storeOnly ? learned : count || learned) || reserved ? 'disabled' : ''}>${learned ? 'Convert unlock' : 'Claim NFT'} · review</button></div></article>`;
    }).join(''));
    html('[data-nft-mounts]', NFT_MOUNTS.map(mount => {
      const count = hero?.carriedItems?.[mount.id] || 0, learned = learnedClaim(mount.id, 'mount'), reserved = reservations.filter(order => order.kind === 'mount' && order.assetId === mount.id).length;
      return `<article><img src="${mount.icon}" width="76" height="76" alt=""><div><h4>${mount.name}</h4><p>${count} unlearned drop${count === 1 ? '' : 's'}${reserved ? ` · ${reserved} reserved for NFT minting` : ''}${learned ? ' · Character unlock available to convert' : ''}</p>${mount.storeOnly ? '<p>Store conversion requires a verified MOSS purchase.</p>' : ''}${!mintable(mount.id, 'mount') ? `<p>${escape(state?.mountsReason || 'Not yet enabled in this collection.')}</p>` : ''}${state?.ownedMounts?.includes(mount.id) && state.ownershipVerified ? '<p>Your wallet owns this mount</p>' : ''}<button type="button" data-nft-claim-mount="${mount.id}" ${disabled || !mintable(mount.id, 'mount') || !(mount.storeOnly ? learned : count || learned) || reserved ? 'disabled' : ''}>${learned ? 'Convert unlock' : 'Mint NFT'} · review</button></div></article>`;
    }).join(''));
    html('[data-nft-orders]', reservations.map(order => `<p class="nft-order">${escape(nftAsset(order.kind, order.assetId)?.name || order.assetId)} · ${attempted(order) ? 'Wallet action started · ' : ''}${order.expiresAt <= now() ? order.claimSource === 'learned' ? 'Mint permission expired · waiting for network confirmation' : 'Mint permission expired · waiting for network confirmation or bag space' : `Mint permission expires in ${Math.ceil((order.expiresAt - now()) / 60_000)} min`} <button type="button" data-nft-check="${escape(order.id)}" ${busy ? 'disabled' : ''}>Check mint status</button>${!attempted(order) && order.expiresAt > now() ? ` <button type="button" data-nft-resume="${escape(order.id)}" ${disabled ? 'disabled' : ''}>Review mint</button>` : ''}</p>`).join('') + (reservations.length ? '<p>Unminted drops and learned pets or mounts return automatically after expiry is confirmed. A full bag can delay the return of a drop.</p>' : ''));
    const selected = review?.terms, order = review?.order, amount = selected ? `${BigInt(selected.amountWei) / 10n ** 18n}${BigInt(selected.amountWei) % 10n ** 18n ? `.${(BigInt(selected.amountWei) % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '')}` : ''}` : '';
    const reviewedKind = selected?.kind === 'mount' ? 'mount' : 'pet';
    html('[data-nft-review]', selected ? `<article class="nft-review"><h3 data-nft-review-heading tabindex="-1">${escape(nftAsset(selected.kind, selected.assetId)!.name)}</h3><p>${selected.claimSource === 'learned' ? order ? `Your learned ${reviewedKind} is reserved for this mint.` : `Mint NFT reserves your learned ${reviewedKind} and removes its character unlock. Confirm in your wallet to replace it with NFT ownership. If the unused mint permission expires, the learned ${reviewedKind} returns to your collection.` : order ? `One ${reviewedKind} drop is reserved for this mint.` : `Your ${reviewedKind} drop stays in your bag until you choose Mint NFT. It is then reserved while you confirm in your wallet.`} <strong>${amount} MOSS</strong> + network gas.</p><p>Recipient: ${escape(selected.wallet)}<br>Collection: ${selected.kind === 'mount' ? 'Mossvale Mounts' : selected.kind === 'pet' ? 'Mossvale Pets' : 'Mossvale Houses'}<br>Contract: ${escape(selected.contract)}</p><p>5% resale royalty funds MOSS buyback and burn. Access follows the NFT owner.</p><button type="button" data-nft-mint ${disabled || order && (attempted(order) || order.expiresAt <= now()) ? 'disabled' : ''}>Mint NFT${selected.kind === 'house' ? ` · ${amount} MOSS` : ` · claim ${reviewedKind}`}</button></article>` : '');
      const migration = migrationReview?.migration, migrationTerms = migrationReview?.terms, attempt = migrationTerms && migrationAttempt(migrationTerms);
    html('[data-nft-migration-review]', migration && migrationTerms ? `<article class="nft-review"><h3 data-nft-migration-heading tabindex="-1">Migrate ${escape(nftAsset('pet', migration.assetId)!.name)}</h3><p><strong>Permanent migration:</strong> the original NFT is locked forever in the new collection contract. Your wallet receives one replacement NFT of the same species. This cannot be undone.</p><p>Token ID: ${escape(migration.tokenId)}<br>Wallet: ${escape(migration.wallet)}<br>Original contract: ${escape(migration.legacyContract)}<br>New contract: ${escape(migration.contract)}</p><p>0 MOSS. ETH pays network gas. Two wallet confirmations: approve only this token, then migrate. An existing token approval skips the first confirmation.</p>${attempt ? `<p>A migration wallet action has started. Check its status before continuing.</p><button type="button" data-nft-migration-check ${disabled ? 'disabled' : ''}>Check migration</button><button type="button" data-nft-migration-recover ${disabled ? 'disabled' : ''}>Recover pending transaction</button>${recoveringMigration ? '<p>Check wallet activity first. Clearing this local record does not cancel the transaction: it may still migrate your NFT. Review again before another wallet action.</p><button type="button" data-nft-migration-clear>Clear local record</button>' : ''}` : `<button type="button" data-nft-migration-confirm ${disabled || !migrationTermsCurrent(migrationTerms) ? 'disabled' : ''}>Approve token and migrate permanently</button>`}</article>` : '');
  }
  function open(assetId?: PetId | MountId, kind: 'pet' | 'mount' = 'pet') {
    if (!options.allowed()) return; if (!panel.hidden && !assetId) { close(); return; }
    if (walletBusy || !panel.hidden && busy) return;
    selectCollection(assetId?kind==='mount'?'mounts':'pets':'houses');
    requestedClaim = assetId ? { kind, assetId } : null; review = null; auctionReview = null; migrationReview = null; recoveringMigration = false;
    if (owner !== options.getPlayer()!.id) state = null;
    owner = options.getPlayer()!.id; previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    options.onOpen(); panel.hidden = false; options.trigger.setAttribute('aria-expanded', 'true'); say('Loading wallet collections…', false); request({ type: 'nftOpen' }); render(); query('[data-nft-close]').focus({ preventScroll: true });
  }
  function openAuction(fetch = true) {
    if (!options.allowed() || fetch && !options.auctionNearby?.()) return;
    if (panel.hidden) {
      if (owner !== options.getPlayer()!.id) state = null;
      owner = options.getPlayer()!.id; previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      options.onOpen(); panel.hidden = false; options.trigger.setAttribute('aria-expanded', 'true');
    }
    selectCollection('houses');say('Loading the house auctions…', false);
    if (fetch) request({ type: 'nftAuctionOpen', npcId: DEED_AUCTIONEER.id });
    render(); query('#nft-house-title').focus({ preventScroll: true }); query('#nft-house-title').scrollIntoView?.({ block: 'start' });
  }
  function update(next: NftState, message?: string) {
    if (!options.allowed() || owner !== options.getPlayer()?.id) return; state = next; busy = !!awaiting || !!auctionAwaiting || !!migrationAwaiting || !!linking || waitingBind;
    if (migrationReview && !migrationTermsCurrent(migrationReview.terms)) migrationReview = null;
    if (auctionReview && !auctionTermsCurrent(auctionReview.terms)) auctionReview = null;
    if (review && (!usable() || next.wallet?.toLowerCase() !== review.terms.wallet.toLowerCase()
      || !mintable(review.terms.assetId, review.terms.kind) || contractFor(review.terms.kind, review.terms.assetId, review.order) !== review.terms.contract
      || review.order && next.orders.find(order => order.id === review!.order!.id)?.status !== 'quoted')) review = null;
    for (const order of next.orders) if (order.status !== 'quoted') { attempts.delete(key(order)); try { window.localStorage.removeItem(key(order)); } catch { /* Chain settlement is authoritative. */ } }
    if (canceledOrderId && next.orders.some(order => order.id === canceledOrderId && order.status === 'quoted')) say(canceledMessage(next.orders.find(order => order.id === canceledOrderId)!));
    else {
      if (canceledOrderId) { canceledOrderId = ''; statusPinned = false; }
      if (message || !statusPinned) say(message || (isNativeApp() ? 'Open Mossvale in your browser to claim or buy NFTs.' : next.reason || (next.enabled ? 'NFT access follows the verified wallet owner. Refresh to check a recent transfer.' : 'NFT minting is not enabled on this realm.')), !!message);
    }
    render();
    if (requestedClaim && !panel.hidden && !busy) {
      const { kind, assetId } = requestedClaim; requestedClaim = null;
      if (!usable()) { reject(isNativeApp() ? 'Open Mossvale in your browser to claim NFTs.' : next.reason || (!next.wallet ? `Link your wallet above to review this ${kind} mint.` : 'NFT minting is not available on this realm.'), true); return; }
      const reserved = next.orders.find(order => order.kind === kind && order.assetId === assetId && order.status === 'quoted');
      if (reserved) {
        if (!attempted(reserved) && reserved.expiresAt > now()) void resume(reserved);
        else { say(reserved.claimSource === 'learned' ? `This learned ${kind} is already reserved. Check mint status below; it returns to your collection after confirmed unpaid expiry.` : `This ${kind} drop is already reserved. Check mint status below; an unused drop returns after confirmed expiry when there is bag space.`); reveal('#nft-status'); }
      } else if (options.getPlayer()?.carriedItems?.[assetId] || learnedClaim(assetId, kind)) void reviewClaim(kind, assetId);
      else reject(`You need an unlearned drop, or an eligible learned ${kind}, to mint its NFT.`, true);
    }
  }
  panel.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button || button.disabled) return;
    const data = button.dataset;
    if(data.nftTab==='houses'||data.nftTab==='pets'||data.nftTab==='mounts'){if(!walletBusy){selectCollection(data.nftTab);button.focus({preventScroll:true});}return;}
    if ('nftClose' in data) close(); else if ('nftConnect' in data) void connect(); else if ('nftRefresh' in data) { say('Refreshing ownership…', false); request({ type: 'nftOpen' }); render(); }
    else if ('nftWithdraw' in data) requestAuction('withdraw');
    else if ('nftMigrationRequest' in data) reviewMigration();
    else if ('nftMigrationConfirm' in data) void confirmMigration();
    else if ('nftMigrationCheck' in data) void checkMigration();
    else if ('nftMigrationRecover' in data) { recoveringMigration = true; render(); query('[data-nft-migration-clear]').focus({ preventScroll: true }); }
    else if ('nftMigrationClear' in data && recoveringMigration && migrationReview && !busy && !walletBusy && migrationTermsCurrent(migrationReview.terms)) { forgetMigration(migrationReview.terms); migrationReview = null; recoveringMigration = false; say('Local pending record cleared. The original transaction may still migrate your NFT. Review the token again before continuing.'); options.send({ type: 'nftOpen' }); render(); }
    else if ('nftAuctionConfirm' in data) void confirmAuction();
    else if ('nftAuctionCheck' in data) { checkAuction(); render(); }
    else if ('nftAuctionRecover' in data) { recoveringAuction = pendingAuction() || null; render(); query('[data-nft-auction-clear]').focus({ preventScroll: true }); }
    else if ('nftAuctionClear' in data && recoveringAuction && pendingAuction() === recoveringAuction && !busy && !walletBusy && options.allowed() && options.auctionNearby?.()) { forgetAuction(recoveringAuction); recoveringAuction = null; auctionReview = null; say('Local pending record cleared. The original transaction may still execute. Review a new action against the current auction.'); options.send({ type: 'nftOpen' }); render(); }
    else if (data.nftBid) requestAuction('bid', data.nftBid, button.closest('[data-nft-lot]')?.querySelector<HTMLInputElement>('[data-nft-bid-input]')?.value);
    else if (data.nftSettle) requestAuction('settle', data.nftSettle);
    else if ('nftMint' in data) void mint(); else if (data.nftClaim && isPetId(data.nftClaim)) void reviewClaim('pet', data.nftClaim);
    else if (data.nftClaimMount && nftAsset('mount', data.nftClaimMount)) void reviewClaim('mount', data.nftClaimMount);
    else if (data.nftCheck) { request({ type: 'nftPaymentCheck', orderId: data.nftCheck }); say('Checking the mint on-chain…'); render(); }
    else if (data.nftResume) { const order = state?.orders.find(order => order.id === data.nftResume); if (order) void resume(order); }
  });
  panel.addEventListener('pointerdown', () => options.onOpen());
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); close(); } event.stopPropagation(); });
  return { open, openMount: (mount: MountId) => open(mount, 'mount'), openAuction, close, update, quote, migrationQuote, auctionTransaction, auctionChecked, walletChallenge, isOpen: () => !panel.hidden, isLinking: () => !!linking || waitingBind,
    reject(text: string, requestType?: string) { if (!panel.hidden && (requestType?.startsWith('nft') || (linking || waitingBind) && requestType?.startsWith('store'))) reject(text, busy || walletBusy); },
    walletLinked() { if (waitingBind && !panel.hidden) { waitingBind = false; request({ type: 'nftOpen' }); } },
    reset() { close(); state = null; owner = ''; },
    refresh() {
      if (panel.hidden) return; if (!options.allowed() || owner !== options.getPlayer()?.id) { close(); return; }
      if (busy && !walletBusy && now() - requestAt > 20_000) reject('The realm did not respond. Refresh ownership to recover this claim.');
      if (review?.order && review.order.expiresAt <= now() && !walletBusy) { review = null; render(); }
      const second = Math.floor(now() / 1000); if (second !== auctionSecond) { auctionSecond = second; renderAuction(); }
      // The realm pushes ownership every five seconds. Only pending receipts need client polling.
      if (!busy && !walletBusy && now() - lastPoll >= 5000 && pendingAuction() && options.auctionNearby?.()) { lastPoll = now(); checkAuction(); }
    },
  };
}
