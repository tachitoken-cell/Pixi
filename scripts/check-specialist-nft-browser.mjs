import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {once} from 'node:events';
import {mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createServer as createVite} from 'vite';
const root=fileURLToPath(new URL('../',import.meta.url)),session=`specialists-${process.pid}`,output=process.argv.find(arg=>arg.startsWith('--output='))?.slice(9)||'/tmp/mossvale-specialists';
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Specialist exchange verification</title></head><body><script type="module">
import '/src/style.css';import '/src/art.css';import {mountSpecialistNftUI} from '/src/specialist-nft-ui.ts';
const wallet='0x1111111111111111111111111111111111111111',other='0x2222222222222222222222222222222222222222',contract='0x3333333333333333333333333333333333333333';
window.errors=[];addEventListener('error',event=>errors.push(event.message));addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));
const card={id:'specialist-card',className:'Knight',jobXp:75000,upgrade:12,broken:false,attempts:47,sealed:false,source:'quest'},player={id:'hero',level:60,raidProgress:{specialists:[card]}};
const tokens=[{tokenId:'49839143819349134819341934194319491941941949194919491491499143919439143919141',owner:wallet,card:{...card,sealed:true},active:false,character:'0x'+'0'.repeat(64),revision:3,amountWei:'0'},{tokenId:'22',owner:other,card:{...card,className:'Mage',upgrade:15,broken:true},active:false,character:'0x'+'0'.repeat(64),revision:4,amountWei:'500000000000000000000'}];
const state={configured:true,enabled:true,contract,wallet,orders:[],tokens,offset:0,total:2},sent=[];
const ui=mountSpecialistNftUI({getPlayer:()=>player,allowed:()=>true,onOpen(){},send(message){sent.push(message);if(message.type==='specialistNftOpen')queueMicrotask(()=>ui.handle({type:'specialistNftState',state}));else if(message.type==='specialistNftBuy')queueMicrotask(()=>ui.handle({type:'specialistNftTransaction',transaction:{wallet,contract,action:'buy',tokenId:message.tokenId,amountWei:message.amountWei,revision:message.revision,seller:message.seller}}));else if(message.type==='specialistNftTransfer')queueMicrotask(()=>ui.handle({type:'specialistNftTransaction',transaction:{wallet,contract,action:'transfer',tokenId:message.tokenId,recipient:message.recipient}}));}});
window.fixture={ui,sent,state};ui.open();await document.fonts.ready;window.ready=true;
</script></body></html>`;
let vite;const server=createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(html);}else vite.middlewares(req,res,()=>{res.statusCode=404;res.end();});});server.listen(0,'127.0.0.1');await once(server,'listening');vite=await createVite({root,configFile:false,appType:'custom',logLevel:'error',server:{middlewareMode:true,hmr:{server,clientPort:server.address().port}}});
const run=promisify(execFile),browser=async(...args)=>(await run('npx',['--yes','agent-browser','--session',session,...args],{cwd:root,timeout:60000,maxBuffer:2_000_000})).stdout,evaluate=async code=>JSON.parse(await browser('eval',`(()=>{const check=(ok,message)=>{if(!ok)throw Error(message)};${code}})()`));
try{mkdirSync(output,{recursive:true});for(const [name,w,h]of [['desktop',1440,1000],['portrait',390,844],['landscape',844,390]].filter(([name])=>!process.argv.includes('--portrait-only')||name==='portrait')){
 await browser('set','viewport',String(w),String(h));await browser('open',`http://127.0.0.1:${server.address().port}`);await browser('wait','--fn','window.ready===true');
 await evaluate("const panel=document.querySelector('#specialist-nft-window'),r=panel.getBoundingClientRect();check(r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1,'panel fits viewport');check(panel.scrollWidth<=panel.clientWidth+1,'long token IDs wrap');check([...panel.querySelectorAll('button')].every(button=>button.getBoundingClientRect().height>=44),'touch targets');return true;");
 await browser('screenshot',join(output,name+'-collection.png'));await evaluate("document.querySelector('[data-buy]').scrollIntoView({block:'center'});return true;");await browser('click','[data-buy]');await browser('wait','--fn',"!!document.querySelector('[data-confirm]')");
 await evaluate("check(document.querySelector('[data-review]').textContent.includes('500.0 MOSS'),'exact price review');check(document.querySelector('[data-review]').textContent.includes('5%'),'royalty visible');check(fixture.sent.at(-1).amountWei==='500000000000000000000','exact buy payload');return true;");await browser('screenshot',join(output,name+'-review.png'));await browser('click','[data-cancel]');
 await evaluate("document.querySelector('[data-recipient]').value='0x2222222222222222222222222222222222222222';document.querySelector('[data-transfer]').scrollIntoView({block:'center'});return true;");await browser('click','[data-transfer]');await browser('wait','--fn',"!!document.querySelector('[data-confirm]')");await evaluate("check(document.querySelector('[data-review]').textContent.includes('Transfer to 0x2222222222222222222222222222222222222222'),'recipient review');return true;");
 await browser('press','Escape');assert.equal(await evaluate('return fixture.ui.isOpen();'),false);assert.deepEqual(await evaluate('return errors;'),[]);assert.equal((await browser('errors')).trim(),'');
}console.log('Specialist exchange desktop/portrait/landscape fit, long IDs, touch targets, exact-price and recipient reviews passed. Screenshots: '+output);
}catch(error){await browser('screenshot',join(output,'failure.png')).catch(()=>{});throw error;}finally{await browser('close').catch(()=>{});await vite.close();await new Promise(resolve=>server.close(resolve));}
