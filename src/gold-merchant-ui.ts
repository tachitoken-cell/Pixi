import { GOLD_MERCHANT, GOLD_MERCHANT_REQUIREMENTS, type GoldMerchantState } from './gold-merchant';
import type { ClientMessage, Player, ServerMessage } from './shared';
import { chooseWallet, type WalletProvider } from './wallet-provider';
import { mountTreasureUI } from './treasure-ui';
import { TREASURE_MAX_CLAIMS } from './treasure-rewards';
import { isNativeApp, nativeClient, nativeUpdateLinks } from './native-client';

const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const addressMatches = (a?: string | null, b?: string | null) => !!a && !!b && /^0x[\da-f]{40}$/i.test(a) && a.toLowerCase() === b.toLowerCase();
const dollarsMicros = (micros: bigint) => `$${(micros/1000000n).toLocaleString('en-US')}.${(micros%1000000n).toString().padStart(6,'0').replace(/0{1,4}$/,'')}`;
const dollars = (cents: bigint) => `$${(cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${(cents % 100n).toString().padStart(2, '0')}`;
const moss = (amount: bigint | string) => {
  const wei = BigInt(amount);
  const fraction = (wei % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '');
  return `${(wei / 10n ** 18n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction ? `.${fraction}` : ''}`;
};

/** One merchant counter for escrowed gold offers and the existing treasury payout flow. */
export function mountGoldMerchantUI(options: { send: (message: ClientMessage) => void; getPlayer: () => Player | null | undefined;
  show: () => void; close: () => void; active: () => boolean; content: () => HTMLElement; nearby: () => boolean; now: () => number }) {
  let state: GoldMerchantState | null = null, owner = '', epoch = 0, busy = false, walletBusy = false, linking = '', message = '', lastHTML = '';
  let focusAction: string | undefined, linkExpiresAt = 0;
  let selectedProvider: WalletProvider | undefined;
  let draftGold='', draftPrice='', draftRound='', dirty=false, saving=false, lastRoundCheck=0;
  let lastRequirementsMet=false;
  let collector: ReturnType<typeof mountTreasureUI> | undefined;
  const availableGold = () => (options.getPlayer()?.gold||0)+(state?.offer?.status==='open'?state.offer.gold:0);
  const claimRoom = () => (state?.treasuryAuthorizationCount ?? 0) < TREASURE_MAX_CLAIMS;
  function offerValues() {
    const gold=/^[1-9]\d*$/.test(draftGold)?Number(draftGold):NaN;
    const price=/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(draftPrice)?Math.round(Number(draftPrice)*100):NaN;
    return {gold,price,valid:Number.isSafeInteger(gold)&&gold<=availableGold()&&Number.isSafeInteger(price)&&price>=1&&price<=(state?.round?.maxPriceCentsPer1000||0)};
  }
  const current = () => options.active() && options.getPlayer()?.id === owner;
  const valid = (operation: number) => current() && operation === epoch && options.nearby();
  const nativeWallet = () => {
    const client = nativeClient();
    if (!client?.treasureWallet) throw Error('Update the Mossvale app to link your wallet.');
    return client;
  };
  function render() {
    if (!current()) return;
    const player = options.getPlayer()!, level = player.level, wallet = state?.wallet || null;
    const fresh = typeof state?.checkedAt === 'number' && state.checkedAt <= options.now() && options.now() - state.checkedAt < 60_000;
    const cents = fresh && typeof state?.valueUsdCents === 'string' && /^\d{1,156}$/.test(state.valueUsdCents) ? BigInt(state.valueUsdCents) : null;
    const balance = fresh && addressMatches(wallet, wallet) && typeof state?.balanceWei === 'string' && /^\d{1,78}$/.test(state.balanceWei) && BigInt(state.balanceWei) < 2n ** 256n ? BigInt(state.balanceWei) : null;
    const holdings = !wallet ? 'Link your wallet to check your holdings.' : balance !== null
      ? `Confirmed balance: ${moss(balance)} MOSS. ${cents !== null ? `Merchant qualifying value: ${dollars(cents)} USD` : 'USD value is temporarily unavailable.'}`
      : cents !== null ? `Merchant qualifying value: ${dollars(cents)} USD` : state?.checkedAt ? 'Check again to refresh the merchant value.' : 'Merchant value has not been verified.';
    const levelMet = level >= GOLD_MERCHANT_REQUIREMENTS.level;
    const holding = !wallet ? 'unmet' : cents === null ? 'unverified' : cents >= BigInt(GOLD_MERCHANT_REQUIREMENTS.usdCents) ? 'met' : 'unmet';
    const needsUpdate = isNativeApp() && !nativeClient()?.treasureWallet;
    const blocked = busy || walletBusy || !!collector?.isBusy() || !options.nearby();
    const status = message || (!options.nearby() ? 'Return to the gold merchant to check your requirements.' : busy ? 'Checking requirements…' : state?.reason || '');
    const round=state?.round, offer=state?.offer, values=offerValues();
    const quote=values.valid?BigInt(values.gold)*BigInt(values.price):0n;
    const quoteUsd=dollarsMicros(quote*10n);
    const freshPrice=typeof round?.priceCheckedAt==='number'&&round.priceCheckedAt<=options.now()&&options.now()-round.priceCheckedAt<90000;
    const settledMoss=round?.status==='settled'&&typeof round.budgetWei==='string'&&/^[1-9]\d{0,77}$/.test(round.budgetWei)?moss(round.budgetWei):null;
    const closingMoss=round?.status==='open'&&round.endsAt<=options.now()&&typeof round.closingMossWei==='string'&&/^[1-9]\d{0,77}$/.test(round.closingMossWei)?moss(round.closingMossWei):null;
    const estimatedMoss=freshPrice&&typeof round?.estimatedMossWei==='string'&&/^[1-9]\d{0,77}$/.test(round.estimatedMossWei)?moss(round.estimatedMossWei):null;
    const open=!!round&&round.status==='open'&&round.startsAt<=options.now()&&round.endsAt>options.now();
    const minutes=round?Math.max(0,Math.ceil((round.endsAt-options.now())/60_000)):0;
    const countdown=minutes>=60?`${Math.floor(minutes/60)}h ${minutes%60}m`:`${minutes}m`;
    const awards=(state?.awards||[]).filter(award=>!award.claimId);
    const html = `<section class="training-shell npc-talk-shell gold-merchant-shell" aria-label="Gold merchant">
      ${round?`<div class="gold-merchant-round-heading"><h3 class="gold-merchant-subtitle">Gold buying round</h3><strong>${round.status==='settled'?'Round ended':open?`${countdown} left`:round.startsAt>options.now()?'Opening soon':'Settling round…'}</strong></div>
      <p class="gold-merchant-budget"><strong>${dollars(BigInt(round.budgetUsdCents))} USD budget</strong><span>${round.status==='settled'?settledMoss?`${settledMoss} MOSS at settlement`:'Settlement MOSS amount unavailable.':closingMoss?`${closingMoss} MOSS locked at closing`:estimatedMoss?`About ${estimatedMoss} MOSS at the latest price`:'Refresh for an estimated MOSS amount.'}</span></p>
      <p class="gold-merchant-note">${round.status==='settled'?'MOSS payouts are fixed at this round’s closing price.':closingMoss?'The closing MOSS amount is locked while the merchant finishes this round.':'The buying budget stays fixed in USD. All winners convert to MOSS at one price when the round ends.'}</p>
      ${round.status==='settled'?`<p class="gold-merchant-note">${(round.totalGold||0).toLocaleString('en-US')} gold purchased this round.</p>`:''}`:`<div class="npc-talk-copy"><p>${escape(GOLD_MERCHANT.dialogue[0])}</p></div>`}
      ${open?`<form class="gold-merchant-offer" aria-label="Your gold offer">
        <div class="gold-merchant-offer-heading"><h3 class="gold-merchant-subtitle">${offer?.status==='open'?'Update your offer':'Your offer'}</h3><span>${availableGold().toLocaleString('en-US')} gold available</span></div>
        <div class="gold-merchant-fields"><label for="gold-merchant-gold">Gold to sell<input id="gold-merchant-gold" data-gold-field="gold" inputmode="numeric" autocomplete="off" pattern="[1-9][0-9]*" required value="${escape(draftGold)}" ${blocked?'disabled':''}></label>
        <label for="gold-merchant-price">USD per 1,000 gold<input id="gold-merchant-price" data-gold-field="price" inputmode="decimal" autocomplete="off" required value="${escape(draftPrice)}" ${blocked?'disabled':''}></label></div>
        <p class="gold-merchant-note">Ask $0.01–${dollars(BigInt(round.maxPriceCentsPer1000))} per 1,000 gold. Lowest prices sell first; winners receive their own asking price. An offer may fill partly.</p>
        <p class="gold-merchant-review" role="status">${values.valid?`If all ${values.gold.toLocaleString('en-US')} gold sells: <strong>${quoteUsd} USD</strong>, converted to MOSS when the round ends.`:draftGold||draftPrice?'Enter a whole gold amount you own and a price within the range.':'Choose how much gold to sell and your asking price.'}</p>
        <p class="gold-merchant-note">Offered gold is held until the round ends. Update or cancel before the deadline. Unsold gold is returned.</p>
        ${offer?.status==='open'?`<p class="gold-merchant-saved"><strong>Saved:</strong> ${offer.gold.toLocaleString('en-US')} gold at ${dollars(BigInt(offer.priceCentsPer1000))} / 1,000 gold<br>Recipient ${escape(offer.wallet.slice(0,6))}…${escape(offer.wallet.slice(-4))}</p>`:''}
        <div class="npc-talk-actions gold-merchant-offer-actions"><button class="primary-button" type="submit" data-gold-merchant="offer" ${blocked||!levelMet||holding!=='met'||!values.valid?'disabled':''}>${saving?'Saving…':offer?.status==='open'?'Update offer':'Submit offer'}</button>${offer?.status==='open'?`<button class="primary-button" type="button" data-gold-merchant="cancel" ${blocked?'disabled':''}>Cancel offer</button>`:''}</div>
      </form>`:''}
      ${awards.map(award=>`<div class="gold-merchant-result"><h3 class="gold-merchant-subtitle">Your round result</h3><p><strong>${(award.filledGold||0).toLocaleString('en-US')} / ${award.gold.toLocaleString('en-US')} gold sold</strong>${award.filledGold?` at ${dollars(BigInt(award.priceCentsPer1000))} per 1,000 gold`:''}. ${(award.gold-(award.filledGold||0)).toLocaleString('en-US')} unsold gold returned.</p>${award.filledGold&&award.payoutUsdMicros?`<p>${award.payoutWei?`<strong>${moss(award.payoutWei)} MOSS</strong> (${dollarsMicros(BigInt(award.payoutUsdMicros))} USD at settlement)`:`<strong>${dollarsMicros(BigInt(award.payoutUsdMicros))} USD</strong> · Finalizing MOSS payout…`} for ${escape(award.wallet.slice(0,6))}…${escape(award.wallet.slice(-4))}</p><button class="primary-button" type="button" data-gold-merchant="claim" data-round="${escape(award.roundId)}" ${blocked||!award.payoutWei||!claimRoom()?'disabled':''}>Claim MOSS payout</button>`:''}</div>`).join('')}
      ${awards.some(award=>award.filledGold)&&!claimRoom()?'<p class="gold-merchant-note">Your treasury payout history is full. Contact support to collect this saved award.</p>':''}
      <div data-gold-merchant-payouts></div>
      <details class="gold-merchant-eligibility" ${!levelMet||holding!=='met'?'open':''}><summary>Requirements${levelMet&&holding==='met'?' met':''}</summary>
      <ul class="gold-merchant-requirements">
        <li data-requirement="level" data-status="${levelMet ? 'met' : 'unmet'}"><div><strong>Reach level ${GOLD_MERCHANT_REQUIREMENTS.level}</strong><span>${level} / ${GOLD_MERCHANT_REQUIREMENTS.level}</span></div><b>${levelMet ? 'Met' : 'Not met'}</b></li>
        <li data-requirement="holding" data-status="${holding}"><div><strong>Hold at least $25 worth of MOSS</strong><span>${holdings}</span></div><b>${holding === 'met' ? 'Met' : holding === 'unmet' ? 'Not met' : 'Not verified'}</b></li>
      </ul><p class="gold-merchant-note">These MOSS holdings stay in your wallet. The merchant uses the MOSS price displayed by Pons for this requirement. Recent transfers count after final confirmation.</p></details>
      <p class="gold-merchant-wallet">${wallet ? `Linked wallet <strong>${escape(wallet.slice(0, 6))}…${escape(wallet.slice(-4))}</strong>` : 'No wallet linked.'}</p>
      ${needsUpdate ? `<p class="gold-merchant-note">Update the Mossvale app to link your wallet.</p>${nativeUpdateLinks()}` : ''}
      <p class="gold-merchant-status" role="status" aria-live="polite" tabindex="-1">${escape(status)}</p>
      <div class="npc-talk-actions gold-merchant-account-actions"><button class="primary-button" type="button" data-gold-merchant="link" ${blocked || needsUpdate ? 'disabled' : ''}>${walletBusy ? 'Confirm in wallet…' : wallet ? 'Change wallet' : 'Link wallet'}</button>
        <button class="primary-button" type="button" data-gold-merchant="check" ${(busy || walletBusy) && !linkExpiresAt || collector?.isBusy() || !options.nearby() ? 'disabled' : ''}>${linkExpiresAt ? 'Cancel link &amp; refresh' : busy ? 'Checking…' : 'Refresh'}</button>
        <button class="primary-button npc-talk-close" type="button" data-gold-merchant="close">Close</button></div></section>`;
    if (html === lastHTML) return;
    const content = options.content(), focused = typeof document === 'undefined' ? null : document.activeElement;
    const hadFocus = !!focused && content.contains(focused), action = hadFocus ? (focused as HTMLElement).dataset.goldMerchant || focusAction : undefined;
    const field=hadFocus?(focused as HTMLElement).dataset.goldField:undefined, selection=field?(focused as HTMLInputElement).selectionStart:null;
    const payouts=content.querySelector<HTMLElement>('[data-gold-merchant-payouts]');
    const expanded=lastRequirementsMet===(levelMet&&holding==='met')&&content.querySelector<HTMLDetailsElement>('.gold-merchant-eligibility')?.open;
    lastRequirementsMet=levelMet&&holding==='met';
    if (hadFocus) focusAction = action;
    const scroll = content.scrollTop;
    content.innerHTML = html; lastHTML = html; content.scrollTop = scroll;
    if(payouts)content.querySelector('[data-gold-merchant-payouts]')?.replaceWith(payouts);
    if(expanded)content.querySelector<HTMLDetailsElement>('.gold-merchant-eligibility')!.open=true;
    const input=field?content.querySelector<HTMLInputElement>(`[data-gold-field="${field}"]`):null;
    if(input){input.focus({preventScroll:true});if(selection!==null)input.setSelectionRange(selection,selection);return;}
    if(focused&&payouts?.contains(focused)){(focused as HTMLElement).focus({preventScroll:true});return;}
    if (hadFocus) (action && content.querySelector<HTMLElement>(`[data-gold-merchant="${action}"]:not(:disabled)`) || content.querySelector<HTMLElement>('.gold-merchant-status'))?.focus({ preventScroll: true });
  }
  function reject(text: string) {
    epoch++; saving=false; collector?.reject(''); busy = false; walletBusy = false; linking = ''; linkExpiresAt = 0; message = text;
    if (state) state = { ...state, balanceWei: undefined, valueUsdCents: undefined, checkedAt: undefined };
    render();
  }
  function check() {
    if (!current() || collector?.isBusy() || !options.nearby()) return;
    if (linkExpiresAt) reject('');
    if (busy || walletBusy) return;
    busy = true; message = '';
    if (state) state = { ...state, balanceWei: undefined, valueUsdCents: undefined, checkedAt: undefined };
    render(); options.send({ type: 'goldMerchantCheck' });
  }
  async function connect() {
    if (!current() || busy || walletBusy || collector?.isBusy() || !options.nearby()) return;
    const operation = epoch; busy = walletBusy = true; linkExpiresAt = options.now() + 300_000; message = 'Choose a wallet to prove ownership. Linking does not spend MOSS.'; render();
    try {
      let accounts: string[];
      if (isNativeApp()) accounts = [(await nativeWallet().request('treasure.connect', {}) as { address: string }).address];
      else {
        const provider = await chooseWallet(); if (!valid(operation)) return;
        selectedProvider = provider;
        accounts = await provider.request({ method: 'eth_requestAccounts', params: [] }) as string[];
      }
      if (!valid(operation)) return;
      if (!addressMatches(accounts?.[0], accounts?.[0]) || /^0x0{40}$/i.test(accounts[0])) throw Error('Select a valid wallet to link.');
      linking = accounts[0]; linkExpiresAt = options.now() + 300_000; message = 'Sign the wallet ownership message. Linking does not spend MOSS.';
      options.send({ type: 'storeWalletChallenge', wallet: linking });
    } catch (error) { if (valid(operation)) reject(error instanceof Error ? error.message : 'Wallet connection declined.'); }
    finally { if (operation === epoch) { walletBusy = false; if (!linking) busy = false; render(); } }
  }
  async function walletChallenge(challenge: Extract<ServerMessage, { type: 'storeWalletChallenge' }>) {
    if (walletBusy || !valid(epoch) || !addressMatches(challenge.address, linking)) return;
    if (!Number.isFinite(challenge.expiresAt) || challenge.expiresAt <= options.now()) { reject('The wallet link expired. Link your wallet again.'); return; }
    linkExpiresAt = challenge.expiresAt;
    const operation = epoch, requested = linking; walletBusy = true; render();
    try {
      const { hexlify, toUtf8Bytes } = await import('ethers'); if (!valid(operation)) return;
      let signature: string;
      if (isNativeApp()) signature = (await nativeWallet().request('treasure.sign', { address: challenge.address, message: challenge.message, expiresAt: challenge.expiresAt }) as { signature: string }).signature;
      else {
        const provider = selectedProvider; if (!provider) throw Error('Choose your wallet again.');
        const accounts = await provider.request({ method: 'eth_accounts', params: [] }) as string[];
        if (!valid(operation)) return;
        if (!addressMatches(accounts[0], challenge.address)) throw Error('Your wallet account changed. Select the wallet you are linking.');
        signature = await provider.request({ method: 'personal_sign', params: [hexlify(toUtf8Bytes(challenge.message)), challenge.address] }) as string;
      }
      if (valid(operation) && linking === requested && challenge.expiresAt > options.now()) options.send({ type: 'storeWalletBind', signature });
      else if (valid(operation)) reject('The wallet link expired. Link your wallet again.');
    } catch (error) { if (valid(operation)) reject(error instanceof Error ? error.message : 'Wallet link declined.'); }
    finally { if (operation === epoch) { walletBusy = false; render(); } }
  }
  function submitOffer() {
    const values=offerValues(), round=state?.round;
    if(!current()||busy||walletBusy||collector?.isBusy()||!options.nearby()||!round||round.status!=='open'||round.startsAt>options.now()||round.endsAt<=options.now()||!values.valid
      ||!state?.wallet||options.getPlayer()!.level<GOLD_MERCHANT_REQUIREMENTS.level||!state.checkedAt||state.checkedAt>options.now()||options.now()-state.checkedAt>=60000
      ||!/^\d{1,156}$/.test(state.valueUsdCents||'')||BigInt(state.valueUsdCents!)<BigInt(GOLD_MERCHANT_REQUIREMENTS.usdCents))return;
    busy=saving=true;message='Saving your offer…';render();
    options.send({type:'goldMerchantOffer',roundId:round.id,gold:values.gold,priceCentsPer1000:values.price});
  }
  options.content().addEventListener('input',event=>{
    const input=event.target as HTMLInputElement;
    if(!current()||!input.dataset.goldField)return;
    if(input.dataset.goldField==='gold')draftGold=input.value;else draftPrice=input.value;
    dirty=true;render();
  });
  options.content().addEventListener('submit',event=>{if((event.target as HTMLElement).classList.contains('gold-merchant-offer')){event.preventDefault();submitOffer();}});
  options.content().addEventListener('click', event => {
    const button=(event.target as HTMLElement | null)?.closest<HTMLElement>('[data-gold-merchant]');
    const action = button?.dataset.goldMerchant;
    if (!action || !current()) return;
    if (action === 'close') { reset(); options.close(); }
    else if (action === 'link') void connect();
    else if (action === 'check') check();
    else if(!busy&&!walletBusy&&!collector?.isBusy()&&options.nearby()&&(action==='cancel'||action==='claim')) {
      if(action==='claim'&&!claimRoom())return;
      const roundId=action==='claim'?button?.dataset.round:state?.round?.id;if(!roundId)return;
      busy=true;message=action==='cancel'?'Returning your offered gold…':'Saving your MOSS payout…';render();
      options.send({type:action==='cancel'?'goldMerchantCancel':'goldMerchantClaim',roundId});
    }
  });
  function reset() { collector?.reset();draftGold=draftPrice=draftRound='';lastRoundCheck=0;dirty=saving=false;epoch++; state = null; owner = ''; busy = walletBusy = false; linking = message = lastHTML = ''; selectedProvider = undefined; focusAction = undefined; linkExpiresAt = 0; }
  return {
    open() { reset(); owner = options.getPlayer()?.id || ''; options.show(); render();
      if(!collector){const payoutContent=options.content().querySelector<HTMLElement>('[data-gold-merchant-payouts]');if(payoutContent)collector=mountTreasureUI({...options,content:()=>options.content().querySelector<HTMLElement>('[data-gold-merchant-payouts]')!,eventTarget:options.content(),blocked:()=>busy||walletBusy,show:()=>{},mode:'gold-merchant'});}
      collector?.open();check(); },
    update(next: GoldMerchantState) { if (!current() || next.characterId !== owner) return; state = next;
      if(draftRound!==next.round?.id||saving||!dirty){draftRound=next.round?.id||'';draftGold=next.offer?.status==='open'?String(next.offer.gold):'';draftPrice=next.offer?.status==='open'?(next.offer.priceCentsPer1000/100).toFixed(2):'';dirty=false;}
      saving=false;if (!linking) busy = false; message = ''; render();
      collector?.update({configured:!!next.treasury,enabled:!!next.treasury,wallet:next.wallet,claims:next.claims||[],vouchers:0,contract:next.treasury?.contract,balanceWei:next.treasury?.balanceWei,
        legacyContract:next.treasury?.legacyContract,legacyBalanceWei:next.treasury?.legacyBalanceWei}); },
    walletLinked(wallet?: string | null) { if (!valid(epoch) || !linking || !addressMatches(wallet, linking)) return; state = { characterId: owner, level: options.getPlayer()!.level, wallet: linking }; linking = ''; linkExpiresAt = 0; busy = walletBusy = false; message = ''; check(); },
    walletChallenge, isLinking: () => current() && !!linking, reject,
    refresh() {
      if (current() && (busy || collector?.isBusy()) && !options.nearby()) reject('Return to the gold merchant and check your requirements again.');
      else if (current() && linkExpiresAt && linkExpiresAt <= options.now()) reject('The wallet link expired. Link your wallet again.');
      else {
        render();
        if(current()&&!busy&&!walletBusy&&!collector?.isBusy()&&options.nearby()&&state?.round?.status==='open'&&state.round.endsAt<=options.now()&&options.now()-lastRoundCheck>=6000){lastRoundCheck=options.now();check();}
        collector?.refresh();
      }
    },
    reset,
  };
}
