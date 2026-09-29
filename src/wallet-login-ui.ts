import { getAddress, hexlify, toUtf8Bytes } from 'ethers';

import { chooseWallet, type WalletProvider } from './wallet-provider.ts';
type Challenge={message:string;address:string;chainId:number;expiresAt:number};
type Options={transaction:string;provider?:()=>WalletProvider|undefined;request:typeof fetch;navigate:(url:string)=>void};
export function mountWalletLogin(root:HTMLElement,options:Options){
 root.innerHTML=`<span class="eyebrow">THE LANTERN ROADS ARE CALLING</span><h1 id="login-title">Sign in with wallet</h1><p>Prove you own your wallet to enter Mossvale.</p><p class="login-footnote">This signature signs you in. It costs no gas and does not transfer funds.</p><span id="wallet-address" class="wallet-address" hidden></span><p id="wallet-status" role="status" aria-live="polite">Connect your wallet to continue.</p><p id="wallet-error" class="login-error" role="alert" hidden></p><div class="login-actions"><button id="wallet-connect" type="button" class="primary-button">Connect wallet</button><button id="wallet-sign" type="button" class="primary-button" hidden>Sign in</button><button id="wallet-cancel" type="button" class="login-register">Cancel</button></div><p id="wallet-return" class="login-footnote" hidden><a href="/">Return to Mossvale</a></p><details id="wallet-message" class="wallet-message" hidden><summary>View sign-in message</summary><pre id="wallet-message-text"></pre></details>`;
 const node=<T extends HTMLElement=HTMLElement>(id:string)=>root.querySelector<T>(`#wallet-${id}`)!;
 const connect=node<HTMLButtonElement>('connect'),sign=node<HTMLButtonElement>('sign'),cancel=node<HTMLButtonElement>('cancel');
 let busy=false,cancelling=false,disposed=false,revision=0,controller:AbortController|undefined,activeAddress:string|undefined,challenge:Challenge|undefined,wallet:WalletProvider|undefined,callback:URL|undefined,configured=false;
 const validTransaction=/^[A-Za-z0-9_-]{43}$/.test(options.transaction);
 function render(){
  connect.hidden=!!challenge;sign.hidden=!challenge;connect.disabled=busy||!configured||!validTransaction;sign.disabled=busy||!challenge;cancel.disabled=cancelling||!configured||!validTransaction;
  node('address').hidden=!challenge;node('address').textContent=challenge?.address||'';node('message').hidden=!challenge;node('message-text').textContent=challenge?.message||'';
  node('return').hidden=configured&&validTransaction&&node('error').hidden;root.setAttribute('aria-busy',String(busy));
 }
 function error(text:string){node('error').textContent=text;node('error').hidden=!text;}
 function accountsChanged(accounts:unknown){if(!cancelling&&activeAddress&&(!Array.isArray(accounts)||typeof accounts[0]!=='string'||accounts[0].toLowerCase()!==activeAddress.toLowerCase())){revision++;controller?.abort();controller=undefined;busy=false;challenge=undefined;activeAddress=undefined;error('Your wallet account changed. Connect again to prepare a new sign-in message.');node('status').textContent='Connect your wallet to continue.';render();}}
 const current=(value:number)=>!disposed&&value===revision;
 async function wait<T>(work:Promise<T>,signal:AbortSignal,milliseconds:number,message:string):Promise<T>{
  if(signal.aborted){void work.catch(()=>{});throw Error('Request cancelled.');}
  let timer:ReturnType<typeof setTimeout>|undefined,abort:()=>void=()=>{};
  try{return await Promise.race([work,new Promise<never>((_,reject)=>{abort=()=>reject(Error('Request cancelled.'));signal.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>reject(Error(message)),milliseconds);})]);}
  finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
 }
 function walletRequest(provider:WalletProvider,args:{method:string;params?:unknown[]},signal:AbortSignal){
  return wait(provider.request(args),signal,args.method==='eth_accounts'?15000:90000,'Your wallet did not respond. Check your wallet, then connect again or cancel.');
 }
 async function post(path:string,body:object,signal:AbortSignal){
  return wait((async()=>{const response=await options.request(`/wallet-oidc/${path}`,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
   const result=await response.json();if(!response.ok)throw Error(typeof result.error_description==='string'?result.error_description:'Wallet sign-in could not be completed. Please try again.');return result;})(),signal,15000,'The sign-in service did not respond. Please try again or cancel.');
 }
 function redirect(value:unknown){
  const url=typeof value==='string'?new URL(value):null;
  if(!url||!callback||url.origin!==callback.origin||url.pathname!==callback.pathname||url.username||url.password||url.hash)throw Error('The sign-in service returned an invalid destination. Please start again from Mossvale.');
  options.navigate(url.href);
 }
 async function perform(action:(value:number,signal:AbortSignal)=>Promise<void>,cancelRequest=false){
  if((busy&&(!cancelRequest||cancelling))||disposed||!configured||!validTransaction)return;
  controller?.abort();const active=new AbortController(),value=++revision;controller=active;
  busy=true;cancelling=cancelRequest;error('');render();
  try{await action(value,active.signal);}catch(failure){if(current(value)){const code=(failure as {code?:unknown})?.code;error(code===4001||code==='ACTION_REJECTED'?'Request declined. You can try again or cancel.':failure instanceof Error?failure.message:'The wallet request failed. Please try again.');node('status').textContent='Connect your wallet to continue.';}}
  finally{active.abort();if(current(value)){controller=undefined;busy=false;cancelling=false;render();}}
 }
 connect.onclick=()=>void perform(async(value,signal)=>{
  activeAddress=undefined;
  wallet?.removeListener?.('accountsChanged',accountsChanged);
  const provider=options.provider?options.provider():await chooseWallet();
  if(!current(value))return;
  if(!provider)throw Error('Open Mossvale in a browser with an Ethereum wallet installed.');
  wallet=provider;provider.on?.('accountsChanged',accountsChanged);
  node('status').textContent='Waiting for your wallet…';
  const accounts=await walletRequest(provider,{method:'eth_requestAccounts'},signal);
  if(!current(value))return;
  if(!Array.isArray(accounts)||typeof accounts[0]!=='string')throw Error('Choose an account in your wallet and try again.');
  const address=getAddress(accounts[0]);activeAddress=address;
  const result=await post('challenge',{transaction:options.transaction,address},signal);
  if(!current(value))return;
  if(typeof result.message!=='string'||!result.message||result.message.length>4096||getAddress(result.address)!==address||!Number.isSafeInteger(result.chainId)||!Number.isSafeInteger(result.expiresAt))throw Error('The sign-in message was invalid. Please start again from Mossvale.');
  const stillSelected=await walletRequest(provider,{method:'eth_accounts'},signal);
  if(!current(value))return;
  if(!Array.isArray(stillSelected)||typeof stillSelected[0]!=='string'||getAddress(stillSelected[0])!==address)throw Error('Your wallet account changed. Connect again to prepare a new sign-in message.');
  challenge={message:result.message,address,chainId:result.chainId,expiresAt:result.expiresAt};node('status').textContent='Your wallet is connected. Review and sign the message to continue.';
 });
 sign.onclick=()=>void perform(async(value,signal)=>{
  if(!challenge||!wallet)return;
  const prepared=challenge,provider=wallet;challenge=undefined;
  const accounts=await walletRequest(provider,{method:'eth_accounts'},signal);
  if(!current(value))return;
  if(!Array.isArray(accounts)||typeof accounts[0]!=='string'||getAddress(accounts[0])!==prepared.address)throw Error('Your wallet account changed. Connect again to prepare a new sign-in message.');
  node('status').textContent='Approve the sign-in message in your wallet…';
  const signature=await walletRequest(provider,{method:'personal_sign',params:[hexlify(toUtf8Bytes(prepared.message)),prepared.address]},signal);
  if(!current(value))return;
  if(typeof signature!=='string'||!/^0x[0-9a-f]{130}$/i.test(signature))throw Error('The wallet returned an invalid signature. Please connect again.');
  node('status').textContent='Completing sign-in…';
  const result=await post('verify',{transaction:options.transaction,signature},signal);
  if(current(value))redirect(result.redirectUrl);
 });
 cancel.onclick=()=>void perform(async(value,signal)=>{challenge=undefined;node('status').textContent='Cancelling sign-in…';const result=await post('cancel',{transaction:options.transaction},signal);if(current(value))redirect(result.redirectUrl);},true);
 render();
 const ready=(async()=>{
  if(!validTransaction){node('status').textContent='Start a new sign-in from the game.';error('This sign-in link is missing or expired. Return to Mossvale and start wallet sign-in again.');return;}
  try{
   const response=await options.request('/api/config',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();
   const config=await response.json(),broker=config.walletBroker,realm=config.keycloak;
   if(broker?.enabled!==true||typeof broker.provider!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(broker.provider)||typeof realm?.url!=='string'||typeof realm.realm!=='string')throw Error();
   callback=new URL(`${realm.url.replace(/\/$/,'')}/realms/${encodeURIComponent(realm.realm)}/broker/${encodeURIComponent(broker.provider)}/endpoint`);
   if(!['http:','https:'].includes(callback.protocol)||callback.username||callback.password)throw Error();
   configured=true;
  }catch{if(!disposed)error('Wallet sign-in is unavailable. Return to Mossvale and try again.');}
  if(!disposed)render();
 })();
 return {ready,dispose(){disposed=true;revision++;controller?.abort();wallet?.removeListener?.('accountsChanged',accountsChanged);connect.onclick=sign.onclick=cancel.onclick=null;}};
}
