import { MOSS_TOKEN } from './auction';
import { TREASURE_ABI, treasureClaimValid, treasureQuotes, type TreasureClaim, type TreasureState } from './treasure-rewards';
import type { ClientMessage, Player, ServerMessage } from './shared';
import { chooseWallet, type WalletProvider } from './wallet-provider';
import { switchRobinhoodNetwork, walletErrorCode } from './wallet-network';
import { isNativeApp, nativeClient, nativeUpdateLinks } from './native-client';

const escape = (text: string) => text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const short = (wallet: string) => `${wallet.slice(0,6)}…${wallet.slice(-4)}`;
const sameAddress = (a?:string,b?:string) => !!a&&!!b&&/^0x[\da-f]{40}$/i.test(a)&&a.toLowerCase()===b.toLowerCase();
const moss = (amount:number|string) => {
  const text=String(amount);
  if(!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(text))return 'Unverified amount';
  const [whole,fraction]=text.split('.'), decimals=fraction?.replace(/0+$/,'');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')}${decimals?`.${decimals}`:''}`;
};
const amountHTML = (amount:number|string) => escape(moss(amount)).replaceAll(',',',<wbr>').replace('.', '.<wbr>');
const usd = (claim:TreasureClaim) => {
  const cents=claim.usdCents;
  return typeof cents==='number'&&Number.isSafeInteger(cents)&&cents>=200&&cents<=3000?`$${(cents/100).toFixed(2)} USD`:null;
};
export function mountTreasureUI(options: { send:(message:ClientMessage)=>void; getPlayer:()=>Player|null|undefined;
  show:()=>void; active:()=>boolean; content:()=>HTMLElement; nearby:()=>boolean; now:()=>number; mode?:'gold-merchant'; eventTarget?:HTMLElement; blocked?:()=>boolean }) {
  const merchant=options.mode==='gold-merchant';
  const counter=merchant?'the gold merchant':'Veyl';
  const returnMessage=merchant?'Return to the gold merchant to check a payout.':'Return to Veyl to redeem or check a payout.';
  let state:TreasureState|null=null, message='', busy=false, walletBusy=false, linking='', owner='', lastHTML='', checkedAt=0, checkedClaim='', epoch=0, focusAction:string|undefined;
  const submitted = new Map<string,string>();
  const uncertain = new Map<string,number>();
  const current = () => options.active() && options.getPlayer()?.id === owner;
  const awaitingPayment = (claim:TreasureClaim) => !!claim.transactionHash||treasureQuotes(claim).some(quote=>submitted.has(quote.claimHash)||(uncertain.get(quote.claimHash)||0)>options.now());
  const dailyLimited = () => (state?.nextRedemptionAt||0)>options.now();
  let selectedProvider: WalletProvider | undefined;
  async function wallet(force=false) {
    if (force||!selectedProvider) selectedProvider=await chooseWallet();
    return selectedProvider;
  }
  function nativeWallet() {
    const client=nativeClient();
    if(!client?.treasureWallet)throw Error('Update the Mossvale app to link your wallet and collect MOSS vouchers.');
    return client;
  }
  const balanceFor = (claim:TreasureClaim) => sameAddress(claim.contract,state?.contract)?state?.balanceWei
    :sameAddress(claim.contract,state?.legacyContract)?state?.legacyBalanceWei:undefined;
  const funded = (claim:TreasureClaim) => {
    const balance=balanceFor(claim);
    return typeof balance==='string'&&/^\d+$/.test(balance)&&/^[1-9]\d*$/.test(claim.amountWei)&&BigInt(balance)>=BigInt(claim.amountWei);
  };
  const unavailable = (claim:TreasureClaim) => {
    const balance=balanceFor(claim);
    return typeof balance!=='string'||!/^\d+$/.test(balance)
      ? 'This payout’s treasury is unavailable. Check payout to refresh.' : 'The treasury needs more MOSS for this payout. Check again after funding.';
  };
  function render() {
    if (!current()) return;
    const needsUpdate=isNativeApp()&&!nativeClient()?.treasureWallet, blocked=busy||walletBusy||options.blocked?.();
    const pending=state?.claims.find(claim=>claim.status==='pending'), paid=state?.claims.filter(claim=>claim.status!=='pending').slice(-5).reverse()||[];
    const payout=pending?`<div class="treasure-payout"><h3>${amountHTML(pending.amount)} MOSS</h3><p>${awaitingPayment(pending)?'Checking your saved payout for payment.':!funded(pending)?`Your payout is saved. ${escape(unavailable(pending))}`:'Your payout is saved. Collect it now or return later.'}</p><p>${pending.goldRoundId?'This MOSS amount was fixed when the round ended. Its dollar value can change afterward.':usd(pending)?`Assigned reward: <strong>${usd(pending)}</strong>. This USD amount stays fixed. Refresh MOSS amount before collecting to use a fresh ask-side quote. An actual sale may return less, and its dollar value can change.`:'This older payout has no assigned USD reward. Its signed MOSS amount stays collectible without a new price quote.'}</p><p>Recipient: ${escape(short(pending.wallet))}</p><div class="treasure-actions"><button type="button" class="primary-button" data-treasure="collect" ${blocked||needsUpdate||!funded(pending)||awaitingPayment(pending)?'disabled':''}>Collect MOSS</button>${!merchant&&!pending.goldRoundId&&usd(pending)&&typeof pending.amount==='string'?`<button type="button" class="primary-button" data-treasure="refresh" ${blocked||awaitingPayment(pending)||!options.nearby()?'disabled':''}>Refresh MOSS amount</button>`:''}<button type="button" class="primary-button" data-treasure="check" ${blocked?'disabled':''}>Check payout</button></div></div>`:'';
    const html=`<section class="treasure-counter" aria-label="MOSS voucher exchange">
      <div class="treasure-intro"><img src="/ui/loot/moss-voucher.png" width="88" height="88" alt="Sealed MOSS voucher"><div><h3>A little business, quietly.</h3><p>Found a sealed voucher on a goblin or a treasure hunt? I’ll turn it into MOSS for your wallet.</p></div></div>
      <p class="treasure-wallet">${state?.wallet?`Linked wallet <strong>${escape(short(state.wallet))}</strong>`:'Link your wallet to receive MOSS.'} <button class="primary-button" type="button" data-treasure="link" ${blocked||needsUpdate?'disabled':''}>${state?.wallet?'Change wallet':'Link wallet'}</button></p>
      <p>Collecting MOSS uses Robinhood Chain and requires ETH on that network for the fee. A saved payout must be collected with the recipient address shown below.</p>
      <p>Redeem at most one MOSS voucher per account per day, across all characters and realms. Resets at 00:00 UTC. Saved payouts can still be refreshed, collected or checked after reaching the daily limit.</p>
      <p>Your linked wallet must hold at least $30 USD worth of MOSS on Robinhood Chain to redeem a new voucher. This balance is checked, never spent or burned. Saved payouts keep their assigned rewards and can still be refreshed, collected or checked without this minimum.</p>
      ${needsUpdate?`<p>Update the Mossvale app to link your wallet and collect MOSS vouchers. Your vouchers and saved payouts stay available.</p>${nativeUpdateLinks()}`:isNativeApp()?'<p>Your wallet opens to approve linking and collection, then returns you to Mossvale. Signing in alone does not link a payout wallet.</p>':''}
      ${pending&&treasureQuotes(pending).some(quote=>(uncertain.get(quote.claimHash)||0)>options.now())?'<p role="status">Your wallet request may still be open. Check wallet activity before collecting again. Mossvale is checking for payment.</p>':''}
      ${pending?payout
      :`<p><strong>${state?.vouchers??0} sealed voucher${state?.vouchers===1?'':'s'}</strong> in your bags</p><button type="button" class="primary-button" data-treasure="redeem" ${blocked||needsUpdate||dailyLimited()||!state?.enabled||!state.wallet||!state.vouchers||!options.nearby()?'disabled':''}>Redeem 1 voucher</button><p>Receive a $2–$10 USD reference reward, with a maximum of $10 assigned per new voucher. The USD amount stays fixed; you can refresh the MOSS amount before collecting. An actual sale may return less, and the dollar value can change. Small rewards are more common. The voucher is consumed after your payout is saved.</p>`}
      <p class="treasure-status" role="status" tabindex="-1" aria-live="polite">${escape(message||(!options.nearby()?returnMessage:dailyLimited()?'Daily limit reached. Your account can redeem another voucher after 00:00 UTC.':state&&!state.enabled&&!pending?state.reason||'The treasury is awaiting funding. Your voucher stays in your bags.':!state?'Checking the treasury…':''))}</p>
      <details><summary>Payout chances</summary><ul><li>90%: $2.00–$5.00 USD</li><li>10%: $6.00–$10.00 USD</li></ul><p>Each cent amount within a range is equally likely. Your assigned USD reward stays fixed. Refresh MOSS amount uses a fresh ask-side quote without consuming another voucher or opening your wallet. Submitted payouts cannot be refreshed. An actual sale may return less, and the dollar value can change later. Saved signed payouts remain collectible without a new price quote. Goblins have a separate 10% chance to drop a voucher. Collecting requires a wallet transaction; ETH pays the network fee.</p></details>
      ${paid.length?`<h3>Recent payouts</h3><ul>${paid.map(claim=>`<li>${amountHTML((treasureQuotes(claim).find(quote=>quote.claimHash===claim.settledClaimHash)??claim).amount)} MOSS · paid to ${escape(short(claim.wallet))}${usd(claim)?` · ${usd(claim)} assigned reward`:''}</li>`).join('')}</ul>`:''}
    </section>`;
    const output=merchant?`<section class="treasure-counter gold-merchant-collector" aria-label="Gold round MOSS payout">${pending&&treasureQuotes(pending).some(quote=>(uncertain.get(quote.claimHash)||0)>options.now())?'<p>Your wallet request may still be open. Check wallet activity before collecting again. Mossvale is checking for payment.</p>':''}${payout}<p class="treasure-status" role="status" tabindex="-1" aria-live="polite">${escape(message)}</p>${paid.length?`<p>${paid.map(claim=>`${amountHTML((treasureQuotes(claim).find(quote=>quote.claimHash===claim.settledClaimHash)??claim).amount)} MOSS · ${claim.status==='processed'?'confirming':'paid'} to ${escape(short(claim.wallet))}`).join('<br>')}</p>`:''}${pending?'<p>Collect on Robinhood Chain with the saved recipient wallet. ETH pays the network fee.</p>':''}${needsUpdate&&pending?`<p>Update the Mossvale app to collect your saved MOSS payout.</p>${nativeUpdateLinks()}`:''}</section>`:html;
    if (output!==lastHTML) {
      const content=options.content(), focused=typeof document==='undefined'?null:document.activeElement;
      const hadFocus=!!focused&&content.contains(focused), focusSummary=hadFocus&&focused?.tagName==='SUMMARY', expanded=content.querySelector('details')?.open;
      if(hadFocus)focusAction=(focused as HTMLElement).dataset.treasure||focusAction;
      content.innerHTML=output;lastHTML=output;
      if(expanded)content.querySelector('details')!.open=true;
      if(hadFocus){
        const next=focusAction&&Array.from(content.querySelectorAll<HTMLButtonElement>('[data-treasure]')).find(button=>button.dataset.treasure===focusAction&&!button.disabled);
        ((focusSummary?content.querySelector<HTMLElement>('summary'):null)||next||(!busy&&focusAction==='redeem'?content.querySelector<HTMLElement>('[data-treasure="collect"]'):null)||content.querySelector<HTMLElement>('.treasure-status'))?.focus({preventScroll:true});
      }
    }
  }
  function reject(text:string) {busy=false;linking='';message=text;render();}
  async function connect() {
    busy=true;walletBusy=true;render();const character=owner, operation=epoch;
    try {
      let accounts:string[];
      if(isNativeApp()) accounts=[(await nativeWallet().request('treasure.connect',{}) as {address:string}).address];
      else {
        const provider=await wallet(true);
        if (!current()||owner!==character||operation!==epoch) return;
        accounts=await provider.request({method:'eth_requestAccounts',params:[]}) as string[];
      }
      if (!current()||owner!==character||operation!==epoch) return;
      if (!sameAddress(accounts?.[0],accounts?.[0])) throw Error('Select a wallet to link.');
      linking=accounts[0];options.send({type:'storeWalletChallenge',wallet:linking});
    } catch(error) {if(current()&&operation===epoch)reject(error instanceof Error?error.message:'Wallet connection declined.');}
    finally {walletBusy=false;if(current()&&operation===epoch)render();}
  }
  async function walletChallenge(challenge:Extract<ServerMessage,{type:'storeWalletChallenge'}>) {
    if (walletBusy||!current()||!linking||challenge.address.toLowerCase()!==linking.toLowerCase()||challenge.expiresAt<=options.now())return;
    const character=owner, operation=epoch;walletBusy=true;
    try {
      const {hexlify,toUtf8Bytes}=await import('ethers');
      if (!current()||owner!==character||operation!==epoch) return;
      let signature:string;
      if(isNativeApp()) {
        signature=(await nativeWallet().request('treasure.sign',{address:challenge.address,message:challenge.message,expiresAt:challenge.expiresAt}) as {signature:string}).signature;
      } else {
        const provider=await wallet();
        if (!current()||owner!==character||operation!==epoch) return;
        const accounts=await provider.request({method:'eth_accounts',params:[]}) as string[];
        if (!current()||owner!==character||operation!==epoch) return;
        if (!sameAddress(accounts[0],challenge.address)) throw Error('Your wallet account changed. Select the wallet you are linking.');
        signature=await provider.request({method:'personal_sign',params:[hexlify(toUtf8Bytes(challenge.message)),challenge.address]}) as string;
      }
      if(current()&&owner===character&&operation===epoch&&challenge.expiresAt>options.now())options.send({type:'storeWalletBind',signature});
    } catch(error) {if(current()&&operation===epoch)reject(error instanceof Error?error.message:'Wallet link declined.');}
    finally {walletBusy=false;if(current()&&operation===epoch)render();}
  }
  async function collect(claim:TreasureClaim) {
    busy=true;walletBusy=true;render();const character=owner, operation=epoch;let sending=false;
    try {
      const {Interface,getAddress}=await import('ethers');
      if(!treasureClaimValid(claim)||claim.characterId!==character||(!sameAddress(claim.contract,state?.contract)&&!sameAddress(claim.contract,state?.legacyContract))
        ||claim.chainId!==MOSS_TOKEN.chainId||getAddress(claim.token)!==getAddress(MOSS_TOKEN.address))throw Error(`The payout could not be verified. Reopen ${counter}’s counter.`);
      if(!funded(claim))throw Error(`${unavailable(claim)} Your saved claim stays available.`);
      if(!current()||owner!==character||operation!==epoch)return;
      if(!state?.claims.some(saved=>saved.id===claim.id&&saved.claimHash===claim.claimHash&&saved.status==='pending'&&!awaitingPayment(saved)))throw Error('This payout changed. Check its status before collecting again.');
      let hash:string;
      if(isNativeApp()) {
        const walletClaim={...claim};delete walletClaim.previousQuotes;delete walletClaim.settledClaimHash;
        hash=(await nativeWallet().request('treasure.collect',{claim:walletClaim}) as {transactionHash:string}).transactionHash;
      } else {
        const provider=await wallet(true);
        if(!current()||owner!==character||operation!==epoch)return;
        const accounts=await provider.request({method:'eth_requestAccounts',params:[]}) as string[];
        if(!current()||owner!==character||operation!==epoch)return;
        if(getAddress(accounts[0])!==getAddress(claim.wallet))throw Error('Select the wallet shown on this saved payout.');
        const chainId=`0x${MOSS_TOKEN.chainId.toString(16)}`;
        if(BigInt(await provider.request({method:'eth_chainId',params:[]}) as string)!==BigInt(MOSS_TOKEN.chainId))await switchRobinhoodNetwork(provider,()=>{
          if(!current()||owner!==character||operation!==epoch)throw Error('Reopen your saved payout before collecting.');
        });
        if(!current()||owner!==character||operation!==epoch)return;
        const selected=await provider.request({method:'eth_accounts',params:[]}) as string[];
        if(getAddress(selected[0])!==getAddress(claim.wallet)||BigInt(await provider.request({method:'eth_chainId',params:[]}) as string)!==BigInt(MOSS_TOKEN.chainId))throw Error('Wallet account or network changed. Review the payout again.');
        if(!current()||owner!==character||operation!==epoch)return;
        if(!state?.claims.some(saved=>saved.id===claim.id&&saved.claimHash===claim.claimHash&&saved.status==='pending'&&!awaitingPayment(saved)))throw Error('This payout changed. Check its status before collecting again.');
        if(!funded(claim))throw Error(`${unavailable(claim)} Your saved claim stays available.`);
        const transaction={to:claim.contract,from:claim.wallet,data:new Interface(TREASURE_ABI).encodeFunctionData('claim',[claim.contractClaim,claim.signature]),value:'0x0',chainId};
        sending=true;
        hash=await provider.request({method:'eth_sendTransaction',params:[transaction]}) as string;
      }
      if(!/^0x[\da-f]{64}$/i.test(hash))throw Error('The wallet returned no transaction hash. Check your wallet activity.');
      // The wallet may finish after the counter closes or the selected character changes.
      submitted.set(claim.claimHash,hash);
      uncertain.delete(claim.claimHash);
      if(options.getPlayer()?.id===character&&options.nearby())options.send({type:merchant?'goldMerchantSubmitted':'treasureSubmitted',claimId:claim.id,transactionHash:hash});
      if(current()&&owner===character&&operation===epoch)message='Payout submitted. Checking for payment.';
    } catch(error) {
      const code=walletErrorCode(error), detail=(error as {message?:unknown})?.message;
      const unknown=isNativeApp()?code===-32000:sending&&code!==4001&&code!=='ACTION_REJECTED';
      if(current()&&operation===epoch)message=`${typeof detail==='string'&&detail?detail:'Payout declined. Your saved claim is still available.'}${unknown?' Checking your saved payout. Check wallet activity before collecting again.':''}`;
      if(unknown)uncertain.set(claim.claimHash,options.now()+600000);
      if((unknown||isNativeApp())&&options.getPlayer()?.id===character&&options.nearby())options.send({type:merchant?'goldMerchantPayoutCheck':'treasureCheck',claimId:claim.id});
    }
    finally {walletBusy=false;if(operation===epoch){busy=false;render();}}
  }
  (options.eventTarget||options.content()).addEventListener('click',event=>{
    const action=(event.target as Element).closest<HTMLButtonElement>('[data-treasure]')?.dataset.treasure;
    if(!action||busy||walletBusy||options.blocked?.()||!current())return;
    if(isNativeApp()&&!nativeClient()?.treasureWallet&&['link','redeem','collect'].includes(action)){reject('Update the Mossvale app to link your wallet and collect MOSS vouchers.');return;}
    if(action==='link'){void connect();return;}
    const pending=state?.claims.find(claim=>claim.status==='pending');
    if(action==='collect'&&pending){if(!awaitingPayment(pending))void collect(structuredClone(pending));return;}
    if(action==='refresh'&&(merchant||pending?.goldRoundId||!pending||!usd(pending)||typeof pending.amount!=='string'||awaitingPayment(pending)))return;
    if(!options.nearby()){reject(returnMessage);return;}
    if(action==='redeem'&&dailyLimited()){message='';render();return;}
    busy=true;message='Checking with the treasury…';render();
    if(action==='refresh'&&pending)options.send({type:'treasureRefresh',claimId:pending.id});
    else if(action==='check'&&pending)options.send({type:merchant?'goldMerchantPayoutCheck':'treasureCheck',claimId:pending.id});
    else if(action==='redeem')options.send({type:'treasureRedeem'});
  });
  return {
    open(){epoch++;focusAction=undefined;owner=options.getPlayer()?.id||'';state=null;message='';busy=false;linking='';lastHTML='';checkedAt=0;checkedClaim='';options.show();render();if(!merchant)options.send({type:'treasureOpen'});},
    update(value:TreasureState,text?:string){if(!current())return;state=value;busy=false;message=text||'';
      for(const claim of value.claims)for(const quote of treasureQuotes(claim)){
        if(claim.status!=='pending'||claim.transactionHash===submitted.get(quote.claimHash))submitted.delete(quote.claimHash);
        if(claim.status!=='pending'||claim.transactionHash)uncertain.delete(quote.claimHash);
      }
      render();},
    walletLinked(){if(!current()||!linking)return;linking='';busy=false;options.send({type:'treasureOpen'});},
    walletChallenge,isLinking:()=>!!linking&&current(),isBusy:()=>busy||walletBusy,reject,
    refresh(){
      if(!current())return;
      for(const [hash,expiresAt] of uncertain)if(expiresAt<=options.now())uncertain.delete(hash);
      render();
      if(!busy&&!walletBusy&&!options.blocked?.()&&options.nearby()&&options.now()-checkedAt>6000){
        // Keep recovering every included/submitted claim, including at the daily limit.
        const checks=state?.claims.filter(claim=>claim.status==='processed'||claim.status==='pending'&&awaitingPayment(claim))||[];
        const claim=checks[(checks.findIndex(claim=>claim.id===checkedClaim)+1)%checks.length];
        if(claim){if(merchant)busy=true;checkedAt=options.now();checkedClaim=claim.id;const transactionHash=treasureQuotes(claim).map(quote=>submitted.get(quote.claimHash)).find(Boolean);
          options.send(transactionHash?{type:merchant?'goldMerchantSubmitted':'treasureSubmitted',claimId:claim.id,transactionHash}:{type:merchant?'goldMerchantPayoutCheck':'treasureCheck',claimId:claim.id});}
        else if(state&&(state.claims.some(claim=>claim.status==='pending'&&!funded(claim))||!state.enabled&&state.vouchers>0)){if(merchant)busy=true;checkedAt=options.now();options.send({type:merchant?'goldMerchantCheck':'treasureOpen'});}
      }
    },
    reset(){epoch++;focusAction=undefined;state=null;owner='';message='';busy=false;linking='';lastHTML='';},
  };
}
