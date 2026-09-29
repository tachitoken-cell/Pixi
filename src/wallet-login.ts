import './style.css';
import './art.css';
import './login.css';
import './wallet-provider.css';
import { createLoginScene } from './login-scene';
import { mountWalletLogin } from './wallet-login-ui';
const scenery=createLoginScene(document.querySelector<HTMLCanvasElement>('#login-scene')!);
const ui=mountWalletLogin(document.querySelector<HTMLElement>('#wallet-content')!,{
 transaction:new URLSearchParams(location.search).get('transaction')||'',
 request:(...args)=>fetch(...args),navigate:url=>location.assign(url),
});
scenery.start();
window.addEventListener('pagehide',event=>{if(event.persisted)scenery.stop();else{ui.dispose();scenery.dispose();}});
window.addEventListener('pageshow',()=>scenery.start());
