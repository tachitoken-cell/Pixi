// Trusted Chromium touch input; set CHROME_BIN when Chrome is installed elsewhere.
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {spawn} from 'node:child_process';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';
import WebSocket from 'ws';
const dir=mkdtempSync(join(tmpdir(),'moss-touch-'));
const child=spawn(process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-sandbox','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{stdio:['ignore','ignore','pipe']});
let endpoint='';child.on('error',error=>{console.error(error.message);process.exitCode=1;});child.stderr.on('data',bytes=>{const match=bytes.toString().match(/DevTools listening on (ws:\/\/\S+)/);if(match)endpoint=match[1];});
try{
for(let i=0;i<100&&!endpoint;i++)await delay(50);
assert(endpoint,'Chrome did not start; set CHROME_BIN to its executable.');
const version=await fetch('http://'+new URL(endpoint).host+'/json/list').then(r=>r.json());
const ws=new WebSocket(version.find(row=>row.type==="page").webSocketDebuggerUrl);await new Promise(r=>ws.on('open',r));let next=0;const waiting=new Map();ws.on('message',raw=>{const v=JSON.parse(raw);if(v.id){waiting.get(v.id)?.(v);waiting.delete(v.id);}});
const send=async(method,params={})=>new Promise((res,rej)=>{const id=++next;waiting.set(id,v=>v.error?rej(v.error):res(v.result));ws.send(JSON.stringify({id,method,params}));});
const js=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true})).result.value;
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
const source=stripTypeScriptTypes(readFileSync(new URL('../src/mobile-controls.ts',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../src/scroll-refresh.ts',import.meta.url),'utf8')).replaceAll('export ','');
await send('Page.navigate',{url:'data:text/html,'+encodeURIComponent('<meta name="viewport" content="width=device-width, initial-scale=1"><style>html{touch-action:manipulation}body{margin:0;overflow:hidden}#scroll{width:350px;height:420px;overflow:auto;background:#ccc}button{display:block;height:60px;width:330px}</style><div id="play-ui"><div id="scroll">'+Array.from({length:30},(_,i)=>'<button>Item '+i+'</button>').join('')+'</div></div><script>window.clicks=[];document.addEventListener("click",e=>clicks.push(e.target.textContent));'+source+';bindTouchActions(document.querySelector("#play-ui"));deferTouchRender(document.querySelector("#play-ui"),()=>{});window.mode="baseline";window.paints=0;window.refresh=()=>{const root=document.getElementById("play-ui");if(mode==="fixed"&&deferTouchRender(root,refresh))return;const top=document.getElementById("scroll").scrollTop;root.innerHTML=root.innerHTML;document.getElementById("scroll").scrollTop=top;paints++};</script>')});await delay(200);
const results=[];
for(const variant of ['baseline','fixed']){
 await js('document.getElementById("scroll").scrollTop=0;mode='+JSON.stringify(variant)+';paints=0');await delay(150);
 const scrolled=()=>js('document.getElementById("scroll").scrollTop');
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:150,y:330}]});
 for(let i=1;i<=14;i++){await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:150,y:330-i*15}]});if(i%3===0)await js('refresh()');await delay(16);}
 await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(1000);results.push({variant,scrollTop:await scrolled(),clicks:await js('clicks'),paints:await js('paints')});
}
assert(results[0].scrollTop<100,'baseline must reproduce an interrupted swipe');
assert(results[1].scrollTop>150,'native swipe survives passive redraws');
assert.equal(results[1].paints,1,'pending redraws coalesce after momentum');
assert.deepEqual(results[1].clicks,[],'scrolling cannot select a row');
await js('mode="fixed";paints=0;document.getElementById("scroll").scrollTop=0');await delay(150);
await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:150,y:330}]});
await js('mode="baseline";refresh();mode="fixed"');
await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(150);
assert.equal(await js('refresh();paints'),2,'removing the touched element without a delivered touchend cannot freeze refreshes');
console.log('Native touch scrolling passed:',JSON.stringify(results));
ws.close();
}finally{child.kill('SIGTERM');await delay(200);rmSync(dir,{recursive:true,force:true});}
