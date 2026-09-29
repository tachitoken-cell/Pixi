import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes,registerHooks} from 'node:module';
import {runInNewContext} from 'node:vm';
import {mock} from 'node:test';
import {Wallet,toUtf8String} from 'ethers';
const chooserHook=registerHooks({load(url,context,next){return url.endsWith('/src/wallet-provider.ts')?{format:'module',shortCircuit:true,source:'export const chooseWallet = () => globalThis.chooseLoginWallet();'}:next(url,context);}});
const {mountWalletLogin}=await import('../src/wallet-login-ui.ts');chooserHook.deregister();
import {hostingConfig} from '../src/hosting-client.ts';
import {realmIdValid} from '../src/hosting-realms.ts';
const walletEntry=stripTypeScriptTypes(readFileSync(new URL('../src/wallet-login.ts',import.meta.url),'utf8').replace(/^import .*;\r?$/gm,''));
const injected={request(){}};
for(const providers of [{ethereum:injected},{phantom:{ethereum:injected}},{okxwallet:injected},{trustwallet:injected},{}]){
 let provider;
 runInNewContext(walletEntry,{window:{...providers,addEventListener(){}},document:{querySelector:()=>({})},location:{search:'?transaction=synthetic'},URLSearchParams,fetch(){},createLoginScene:()=>({start(){}}),mountWalletLogin:(_root,options)=>{provider=options.provider;return{};}});
 assert.equal(provider,undefined,'real sign-in leaves wallet choice to the shared picker');
}
class Element {
 constructor(){this.nodes=new Map();this.hidden=false;this.disabled=false;this.textContent='';this.attributes={};}
 set innerHTML(html){this.html=html;for(const [,id]of html.matchAll(/id="([^"]+)"/g))this.nodes.set(`#${id}`,new Element());}
 querySelector(selector){return this.nodes.get(selector);}
 setAttribute(name,value){this.attributes[name]=value;}
}
const account=Wallet.createRandom(),second=Wallet.createRandom(),transaction='a'.repeat(43);
const callback='https://accounts.example/realms/mossvale/broker/mossvale-wallet/endpoint';
const config={keycloak:{url:'https://accounts.example',realm:'mossvale'},walletBroker:{enabled:true,provider:'mossvale-wallet',chainId:4663}};
const message=`mossvale.example wants you to sign in with your Ethereum account:\n${account.address}\n\nSign in to Mossvale.\n\nURI: https://mossvale.example\nVersion: 1\nChain ID: 4663\nNonce: 0123456789abcdef`;
async function flush(){for(let n=0;n<8;n++)await new Promise(resolve=>setImmediate(resolve));}
function fixture({tx=transaction,configuration=config,verifyUrl=callback+'?code=code&state=state',providerMissing=false,verifyError=false,picker=false}={}){
 const root=new Element(),rpc=[],posts=[],redirects=[],handlers=new Map();let selected=account.address,decline=false,holdConnect,holdAccounts,holdSign,holdChallenge,holdCancel,holdVerify;
 const provider={on:(name,fn)=>handlers.set(name,fn),removeListener:name=>handlers.delete(name),async request({method,params}){rpc.push({method,params});if(method==='eth_requestAccounts'||method==='eth_accounts'){if(method==='eth_requestAccounts'&&holdConnect)await holdConnect;if(method==='eth_accounts'&&holdAccounts)await holdAccounts;return[selected];}if(method==='personal_sign'){if(decline)throw{code:4001};assert.equal(toUtf8String(params[0]),message,'sign only the exact server-authored message');assert.equal(params[1],account.address);if(holdSign)await holdSign;return account.signMessage(message);}throw Error('Unexpected wallet operation');}};
 const request=async(url,init)=>{
  assert.equal(init.cache,'no-store');assert.equal(init.credentials,'same-origin');
  if(url==='/api/config')return{ok:true,json:async()=>configuration};
  assert.equal(init.method,'POST');assert.equal(init.headers['Content-Type'],'application/json');const body=JSON.parse(init.body);posts.push([url,body]);assert.equal(body.transaction,tx);
  if(url.endsWith('/challenge')){if(holdChallenge)await holdChallenge;return{ok:true,json:async()=>({message,address:account.address,chainId:4663,expiresAt:Date.now()+300000})};}
  if(url.endsWith('/verify')){if(holdVerify)await holdVerify;return{ok:!verifyError,json:async()=>verifyError?{error:'invalid_request',error_description:'This signature request expired. Request a new one.'}:{redirectUrl:verifyUrl}};}
  if(url.endsWith('/cancel')){if(holdCancel)await holdCancel;return{ok:true,json:async()=>({redirectUrl:callback+'?error=access_denied&state=state'})};}
  throw Error('Unexpected endpoint');
 };
 let selections=0,holdChoice;
 if(picker)globalThis.chooseLoginWallet=async()=>{selections++;if(holdChoice)await holdChoice;return provider;};
 const ui=mountWalletLogin(root,{transaction:tx,...(picker?{}:{provider:()=>providerMissing?undefined:provider}),request,navigate:url=>redirects.push(url)});
 const node=id=>root.querySelector(`#wallet-${id}`),click=id=>node(id).onclick?.();
 return{ui,root,node,click,rpc,posts,redirects,get selections(){return selections;},holdChoice(promise){holdChoice=promise;},set decline(value){decline=value;},change(address){selected=address;handlers.get('accountsChanged')?.([address]);},holdConnection(promise){holdConnect=promise;},holdAccounts(promise){holdAccounts=promise;},holdSignature(promise){holdSign=promise;},holdChallenge(promise){holdChallenge=promise;},holdCancellation(promise){holdCancel=promise;},holdVerification(promise){holdVerify=promise;}};
}
let test=fixture();await test.ui.ready;assert(!test.node('connect').disabled);assert.equal(test.rpc.length,0);test.click('connect');test.click('connect');await flush();assert.equal(test.posts.length,1,'duplicate click cannot request another challenge');assert.equal(test.node('address').textContent,account.address);assert.equal(test.node('message-text').textContent,message);test.click('sign');test.click('sign');await flush();assert.equal(test.posts.filter(([url])=>url.endsWith('verify')).length,1);assert.equal(test.redirects.length,1);assert(test.rpc.every(({method})=>['eth_requestAccounts','eth_accounts','personal_sign'].includes(method)),'never transact or switch networks');test.ui.dispose();
test=fixture();await test.ui.ready;test.click('connect');await flush();test.decline=true;test.click('sign');await flush();assert.match(test.node('error').textContent,/declined/);assert.equal(test.posts.length,1);assert(!test.node('connect').disabled,'declined signing can retry with a fresh challenge');test.decline=false;test.click('connect');await flush();test.click('sign');await flush();assert.equal(test.redirects.length,1);test.ui.dispose();
test=fixture();await test.ui.ready;test.click('connect');await flush();test.change(second.address);assert(test.node('sign').hidden);test.click('sign');await flush();assert.equal(test.posts.length,1,'account changes invalidate prepared signatures');test.ui.dispose();
test=fixture();await test.ui.ready;test.click('connect');await flush();let release;test.holdSignature(new Promise(resolve=>release=resolve));test.click('sign');await flush();test.change(second.address);release();await flush();assert.equal(test.posts.length,1,'an account change during wallet prompt cannot verify the stale signature');test.ui.dispose();
test=fixture({verifyError:true});await test.ui.ready;test.click('connect');await flush();test.click('sign');await flush();assert.equal(test.redirects.length,0);assert.match(test.node('error').textContent,/expired/);assert(!test.node('connect').disabled);test.click('connect');await flush();assert.equal(test.posts.filter(([url])=>url.endsWith('/challenge')).length,2,'failed verification always requests a fresh challenge on retry');test.ui.dispose();
test=fixture({verifyUrl:'https://malicious.example/steal'});await test.ui.ready;test.click('connect');await flush();test.click('sign');await flush();assert.equal(test.redirects.length,0);assert.match(test.node('error').textContent,/invalid destination/);test.ui.dispose();
test=fixture();await test.ui.ready;test.click('cancel');await flush();assert.deepEqual(test.posts,[['/wallet-oidc/cancel',{transaction}]]);assert.match(test.redirects[0],/error=access_denied/);assert.equal(test.rpc.length,0,'cancellation is server-authored and does not touch the wallet');test.ui.dispose();
for(const settings of [{tx:''},{configuration:{keycloak:config.keycloak}},{providerMissing:true}]){test=fixture(settings);await test.ui.ready;test.click('connect');await flush();assert.equal(test.posts.length,0);assert(!test.node('error').hidden);test.ui.dispose();}
test=fixture();await test.ui.ready;let releaseChallenge;test.holdChallenge(new Promise(resolve=>releaseChallenge=resolve));test.click('connect');await flush();test.ui.dispose();releaseChallenge();await flush();assert.equal(test.redirects.length,0);assert.equal(test.node('sign').hidden,true,'late responses do not revive a disposed page');
// A wallet may never answer. Cancel stays usable and old completions cannot clear a newer operation.
test=fixture();await test.ui.ready;let releaseConnect,releaseCancel;test.holdConnection(new Promise(resolve=>releaseConnect=resolve));test.holdCancellation(new Promise(resolve=>releaseCancel=resolve));test.click('connect');await flush();assert(!test.node('cancel').disabled);test.click('cancel');test.click('cancel');await flush();assert.deepEqual(test.posts,[['/wallet-oidc/cancel',{transaction}]]);releaseConnect();await flush();assert(test.node('cancel').disabled,'late wallet reply cannot clear the pending cancellation');assert(test.node('connect').disabled);assert.equal(test.posts.length,1,'cancelled connection cannot create a late challenge');releaseCancel();await flush();assert.equal(test.redirects.length,1);assert.match(test.redirects[0],/error=access_denied/);test.ui.dispose();
for(const pending of ['challenge','accounts','signature','verification']){
 test=fixture();await test.ui.ready;let releasePending;const work=new Promise(resolve=>releasePending=resolve);
 if(pending==='challenge')test.holdChallenge(work);if(pending==='accounts')test.holdAccounts(work);
 test.click('connect');await flush();
 if(pending==='signature'||pending==='verification'){if(pending==='signature')test.holdSignature(work);else test.holdVerification(work);test.click('sign');await flush();}
 test.click('cancel');await flush();const postCount=test.posts.length;releasePending();await flush();assert.equal(test.posts.length,postCount,`${pending} cannot dispatch another request after cancellation`);assert.equal(test.redirects.length,1,`${pending} cannot redirect after cancellation`);assert.match(test.redirects[0],/error=access_denied/);test.ui.dispose();
}
test=fixture();await test.ui.ready;test.holdConnection(new Promise(()=>{}));mock.timers.enable({apis:['setTimeout']});try{test.click('connect');mock.timers.tick(90000);await flush();assert.match(test.node('error').textContent,/wallet did not respond/);assert(!test.node('connect').disabled);assert(!test.node('cancel').disabled);assert.equal(test.posts.length,0);}finally{test.ui.dispose();mock.timers.reset();}
// Real Connect always invokes the picker and pins that provider, never window.ethereum.
globalThis.window={ethereum:{request(){assert.fail('Sign-in must not use the default injected provider');}}};
test=fixture({picker:true});await test.ui.ready;let releaseChoice;test.holdChoice(new Promise(resolve=>releaseChoice=resolve));test.click('connect');await flush();assert.equal(test.selections,1);assert.equal(test.rpc.length,0);releaseChoice();await flush();test.decline=true;test.click('sign');await flush();test.holdChoice(undefined);test.decline=false;test.click('connect');await flush();assert.equal(test.selections,2,'each Connect opens a fresh picker');test.click('sign');await flush();assert.equal(test.redirects.length,1);assert(test.rpc.some(call=>call.method==='personal_sign'));test.ui.dispose();
for(const action of ['dispose','cancel']){test=fixture({picker:true});await test.ui.ready;test.holdChoice(new Promise(resolve=>releaseChoice=resolve));test.click('connect');await flush();if(action==='dispose')test.ui.dispose();else test.click('cancel');await flush();releaseChoice();await flush();assert.equal(test.rpc.length,0,`${action} during selection prevents wallet RPC`);assert.equal(test.posts.filter(([url])=>url.endsWith('/challenge')).length,0);test.ui.dispose();}
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8'),css=readFileSync(new URL('../src/login.css',import.meta.url),'utf8'),scene=readFileSync(new URL('../src/login-scene.ts',import.meta.url),'utf8');
assert.match(main,/login-wallet'\)\.hidden=!authEnabled\|\|!walletSignInEnabled\|\|retry/);assert.match(main,/login-wallet'\)\.onclick=.*startProviderLogin\('wallet'\)/);assert.match(main,/function openCharacterSelection\(\)\{\s*loginScene.stop\(\)/);assert.match(main,/if\(entryActive\)return;/);assert(!css.includes('backdrop-filter'));assert(!css.includes('--parchment-art'));assert.match(scene,/prefers-reduced-motion/);assert.match(scene,/cancelAnimationFrame/);assert.match(scene,/creator-scene\.glb/);
const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,{hidden:false,disabled:false,textContent:'',focus(){},classList:{add(){},remove(){}}});return elements.get(id);};
let started=0,stopped=0,connected=0;
const context={Error,setActiveHostingRealm(){},embeddedLogin:undefined,providerFallback:undefined,activeProvider:undefined,supportsEmbeddedSignIn:()=>false,hostingConfig,realmIdValid,updateSelection:null,readLocal:()=>null,$:get,pauseConnection(){context.entryActive=true;},panel:{close(){}},customizer:{close(){}},document:{body:{classList:{add(){},remove(){}}},querySelectorAll:()=>['login-sign-in','login-google','login-apple','login-wallet','login-register','login-guest','login-retry','login-provider-cancel','login-provider-redirect'].map(get)},authEnabled:true,walletSignInEnabled:false,socialSignInEnabled:{google:false,apple:false},socialSignInRequiresUpdate:false,nativeUpdateLinks:()=>'<a>Store update</a>',loginScene:{start(){started++;},stop(){stopped++;}},renderRoster(){},connect(){connected++;}};
const entry=main.slice(main.indexOf('function showEntry('),main.indexOf('function showCharacterRoster('));
runInNewContext(stripTypeScriptTypes(entry)+";showEntry();",context);assert(get('login-wallet').hidden);assert(!get('login-sign-in').hidden);assert.equal(started,1);
context.socialSignInEnabled.google=true;runInNewContext('showEntry();',context);assert(!get('login-google').hidden);assert(get('login-apple').hidden);assert(!get('login-social').hidden);get('login-footnote').insertAdjacentHTML=(_position,html)=>{get('login-footnote').insertedHTML=html;};context.socialSignInRequiresUpdate=true;runInNewContext('showEntry();',context);assert.match(get('login-footnote').textContent,/Update the Mossvale app/);context.socialSignInRequiresUpdate=false;
context.walletSignInEnabled=true;runInNewContext("showEntry('<not html>');",context);assert(!get('login-wallet').hidden);assert.equal(get('login-error').textContent,'<not html>');runInNewContext('showEntry("Unavailable",true);',context);assert(get('login-wallet').hidden);assert(!get('login-retry').hidden);
runInNewContext('openCharacterSelection();',context);assert.equal(stopped,1);assert(get('login').hidden);assert.equal(connected,1);assert.equal(context.activeRealmId,hostingConfig.realmId,'login uses the configured realm when no preference is saved');
// Native cancellation restores the real entry handlers without granting authentication.
const authEvents=new Map();context.window={addEventListener:(name,fn)=>authEvents.set(name,fn)};context.accountFlowPending=false;context.entryActive=true;context.__MOSSVALE_NATIVE_AUTH__=true;
const authFlow=main.slice(main.indexOf('let accountFlowRevision='),main.indexOf('async function leaveAccount('));
runInNewContext(stripTypeScriptTypes(authFlow),context);
let releaseLogin,loginCount=0;context.loginWork=()=>{loginCount++;return new Promise(resolve=>releaseLogin=resolve);};
const pendingLogin=runInNewContext('openAccountFlow(loginWork)',context);runInNewContext('openAccountFlow(loginWork)',context);assert.equal(loginCount,1);assert(get('login-google').disabled);
authEvents.get('mossvale:auth-result')({detail:{status:'cancelled'}});assert.equal(context.accountFlowPending,false);assert(!get('login-google').disabled);assert.match(get('login-error').textContent,/cancelled/);
releaseLogin();await pendingLogin;
// Browser entry opens the provider form immediately while social actions remain available.
delete context.__MOSSVALE_NATIVE_AUTH__;context.supportsEmbeddedSignIn=()=>true;
const embeddedFlows=[];context.signInInsideGame=(frame,onReady)=>{
 assert.equal(frame,get('login-frame'));let resolve,reject;
 const flow={result:new Promise((yes,no)=>{resolve=yes;reject=no;}),cancelled:0,cancel(){this.cancelled++;}};
 embeddedFlows.push({flow,resolve,reject,onReady});return flow;
};
runInNewContext('showEntry();',context);assert.equal(embeddedFlows.length,1);assert(!get('login-embedded').hidden);assert(get('login-frame').hidden);assert(!get('login-form-status').hidden);assert(get('login-register').hidden);
assert(!get('login-google').hidden);assert(!get('login-google').disabled);assert(!get('login-wallet').disabled);assert(!get('login-sign-in').disabled);assert.equal(get('login-sign-in').textContent,'Open sign-in page');
let embedded=embeddedFlows.at(-1);embedded.onReady();assert(!get('login-frame').hidden);assert(get('login-form-status').hidden);
const beforeEmbeddedSuccess=connected;embedded.resolve(true);await flush();assert.equal(connected,beforeEmbeddedSuccess+1);assert(get('login').hidden);assert(get('login-frame').hidden);assert.equal(embedded.flow.cancelled,1);
embedded.onReady();embedded.resolve(true);await flush();assert.equal(connected,beforeEmbeddedSuccess+1,'completed sign-in opens character selection once');assert(get('login-frame').hidden,'late readiness cannot reopen a completed form');
runInNewContext('showEntry("Your account cannot join this realm.");',context);embedded=embeddedFlows.at(-1);assert.equal(connected,beforeEmbeddedSuccess+1,'entry errors only show a form, never join automatically');assert.match(get('login-error').textContent,/cannot join/);
const switching=runInNewContext('openAccountFlow(loginWork)',context);assert.equal(embedded.flow.cancelled,1);assert(get('login-frame').hidden);assert(get('login-embedded').hidden);
embedded.onReady();embedded.resolve(true);await flush();assert.equal(connected,beforeEmbeddedSuccess+1,'switching sign-in method ignores the old completion');assert(get('login-frame').hidden);releaseLogin();await switching;
runInNewContext('showEntry();',context);embedded=embeddedFlows.at(-1);runInNewContext('showEntry();',context);const newest=embeddedFlows.at(-1);
assert.equal(embedded.flow.cancelled,1);embedded.reject(Error('Old attempt failed'));await flush();assert.equal(context.embeddedLogin,newest.flow,'an old rejection cannot replace the new attempt');assert.equal(get('login-form-status').textContent,'Opening secure sign-in…');
newest.reject(Error('Use Open sign-in page to continue.'));await flush();assert.equal(context.embeddedLogin,undefined);assert(get('login-frame').hidden);assert(!get('login-form-status').hidden);assert.match(get('login-form-status').textContent,/Open sign-in page/);assert(!get('login-sign-in').hidden);assert(!get('login-sign-in').disabled);assert(!get('login-register').hidden);assert(!get('login-google').disabled);
const beforeRetry=embeddedFlows.length;runInNewContext('showEntry("Reconnect",true);',context);assert.equal(embeddedFlows.length,beforeRetry,'connection retries do not begin another authentication');assert(get('login-embedded').hidden);assert(!get('login-retry').hidden);
// Provider buttons keep the title screen alive and return through the same guarded selection path.
const providerFlows=[],redirectCalls=[];let popupFailure,redirectHold;
context.signInWithWallet=()=>{redirectCalls.push('wallet');return redirectHold||Promise.resolve();};
context.signInWithSocial=provider=>{redirectCalls.push(provider);return redirectHold||Promise.resolve();};
context.signInWithProviderInsideGame=provider=>{
 if(popupFailure)throw Error('The sign-in window was blocked.');let resolve,reject;
 const flow={result:new Promise((yes,no)=>{resolve=yes;reject=no;}),cancelled:0,cancel(){this.cancelled++;}};
 providerFlows.push({provider,flow,resolve,reject});return flow;
};
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf("$('login-sign-in').onclick="),main.indexOf("$('account-button').onclick="))),context);
context.socialSignInEnabled.apple=true;
for(const provider of ['wallet','google','apple']){
 runInNewContext('showEntry();',context);const email=embeddedFlows.at(-1),before=connected;
 get(`login-${provider}`).onclick();const flow=providerFlows.at(-1);assert.equal(flow.provider,provider);assert.equal(email.flow.cancelled,1);assert(!get('login').hidden);assert(get('login-frame').hidden);assert(get('login-sign-in').hidden);assert(get('login-register').hidden);assert(!get('login-provider-cancel').hidden);assert(get('login-provider-redirect').hidden);assert(!get('login-google').disabled);
 flow.resolve(true);await flush();assert.equal(connected,before+1);assert(get('login').hidden);assert.equal(flow.flow.cancelled,1);assert.equal(context.providerFallback,undefined);assert(get('login-provider-cancel').hidden);assert(get('login-provider-redirect').hidden);
}
runInNewContext('showEntry();',context);const beforeProviderCancel=connected;get('login-wallet').onclick();let abandoned=providerFlows.at(-1);
get('login-provider-cancel').onclick();assert.equal(abandoned.flow.cancelled,1);assert(!get('login').hidden);assert(!get('login-sign-in').hidden);assert.equal(context.providerFallback,undefined);assert(get('login-provider-cancel').hidden);abandoned.resolve(true);await flush();assert.equal(connected,beforeProviderCancel,'cancelled provider completion cannot open character selection');
get('login-wallet').onclick();abandoned=providerFlows.at(-1);get('login-google').onclick();let chosen=providerFlows.at(-1);assert.equal(abandoned.flow.cancelled,1);assert.equal(chosen.provider,'google');abandoned.reject(Error('Old popup failed'));await flush();assert.equal(context.embeddedLogin,chosen.flow);assert(get('login-provider-redirect').hidden,'an abandoned provider error cannot expose a stale fallback');
const beforeDuplicate=providerFlows.length;get('login-google').onclick();const duplicate=providerFlows.at(-1);assert.equal(providerFlows.length,beforeDuplicate,'same-provider double-click cannot open another popup');assert.equal(chosen.flow.cancelled,0);assert.equal(duplicate,chosen);assert.equal(connected,beforeProviderCancel);assert.equal(providerFlows.filter(item=>!item.flow.cancelled).length,1,'at most one provider flow stays active');
context.accountFlowPending=true;get('login-wallet').onclick();assert.equal(providerFlows.length,beforeDuplicate,'a pending redirect cannot start another provider popup');context.accountFlowPending=false;
duplicate.reject(Error('Provider sign-in failed.'));await flush();assert.equal(context.embeddedLogin,undefined);assert(!get('login-provider-redirect').hidden);assert.match(get('login-form-status').textContent,/Provider sign-in failed/);get('login-provider-redirect').onclick();await flush();assert.equal(redirectCalls.at(-1),'google','fallback keeps the selected provider');assert.equal(context.providerFallback,undefined);assert(get('login-provider-redirect').hidden);
runInNewContext('showEntry();',context);popupFailure=true;get('login-apple').onclick();popupFailure=false;assert.match(get('login-form-status').textContent,/blocked/);assert(!get('login-provider-redirect').hidden);assert(!get('login-provider-cancel').hidden);get('login-provider-cancel').onclick();assert.equal(context.providerFallback,undefined);assert(!get('login-sign-in').hidden);
// Native apps retain their existing external auth bridge and duplicate-click guard.
context.supportsEmbeddedSignIn=()=>false;context.__MOSSVALE_NATIVE_AUTH__=true;const popupCount=providerFlows.length;
for(const provider of ['wallet','google','apple']){
 runInNewContext('showEntry();',context);let releaseRedirect;redirectHold=new Promise(resolve=>releaseRedirect=resolve);const callsBefore=redirectCalls.length;
 get(`login-${provider}`).onclick();get(`login-${provider}`).onclick();assert.equal(redirectCalls.length,callsBefore+1);assert.equal(redirectCalls.at(-1),provider);assert(get('login-google').disabled);assert.equal(providerFlows.length,popupCount,'native sign-in never opens the browser popup transport');
 authEvents.get('mossvale:auth-result')({detail:{status:'cancelled'}});assert(!get('login-google').disabled);assert(!context.accountFlowPending);assert.match(get('login-error').textContent,/cancelled/);releaseRedirect();await flush();redirectHold=undefined;
}
delete context.__MOSSVALE_NATIVE_AUTH__;
const theme=readFileSync(new URL('../auth-theme/mossvale/login/theme.properties',import.meta.url),'utf8'),bootstrap=readFileSync(new URL('../auth-theme/mossvale/login/resources/js/mossvale.js',import.meta.url),'utf8');assert.match(theme,/parent=keycloak/);assert.match(bootstrap,/new URL\('\.\.\/', source.src\)/);assert(!/password|submit|loginAction/.test(bootstrap),'theme decoration cannot read credentials or replace native form submission');const themeCSS=readFileSync(new URL('../auth-theme/mossvale/login/resources/css/mossvale.css',import.meta.url),'utf8');assert.match(themeCSS,/\.kc-social-links \{[^}]*grid-template-columns:minmax\(0,1fr\)/,'native social links use the full form column');
console.log('PASS login UI: guarded wallet connection, exact personal-sign message, duplicate prevention, declined/retried signatures, account-change/disposal invalidation, configured callback validation, server cancellation, no financial RPC, live-scene lifecycle, embedded entry/readiness/success, provider popup/native routing, cancellation, safe method switching and fallback, and no parchment/blur.');
