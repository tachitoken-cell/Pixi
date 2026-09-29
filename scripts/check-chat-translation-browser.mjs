import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {stripTypeScriptTypes} from 'node:module';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createServer as createVite} from 'vite';

// Real shipped chat markup, handlers and translation controller; all translation replies are local fixtures.
const root=fileURLToPath(new URL('../',import.meta.url)),session=`chat-translation-${process.pid}`;
const source=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const between=(start,end)=>{const from=source.indexOf(start),to=source.indexOf(end,from);assert(from>=0&&to>from,start);return source.slice(from,to);};
const shipped=stripTypeScriptTypes([
 between('type ChatChannel=','const friendsUI='),
 between('function chatMessage(','\nfunction send('),
 between('function mobileChat(','\nfunction openPlayerMenu('),
 between("$('chat-toggle').onclick=",'let mapCanvas='),
].join('\n'));
const publicRoute=source.split('\n').find(line=>line.trimStart().startsWith("if(msg.kind==='chat'){"));assert(publicRoute);
const whisperRoute=stripTypeScriptTypes(between('   const incoming=msg.to.id===playerId',"\n  } else if(msg.type==='trade')"));
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Chat translation regression</title></head><body><div id="app"></div><script type="module">
import {mountUI,$} from '/src/ui.ts';import {mountChatTranslation} from '/src/chat-translation-ui.ts';import {emoteCommand,EMOTE_HELP} from '/src/emotes.ts';
import '/src/style.css';import '/src/art.css';import '/src/chat.css';import '/src/community.css';import '/src/hotbar.css';
window.errors=[];addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
mountUI();
const style=document.createElement('style');style.textContent='#app > :not(#play-ui),#play-ui > :not(#chat):not(#chat-preview):not(#game){display:none!important}body{background:#294332}';document.head.append(style);
const reports=[],canvas=$('world'),playerId='self',chatScale=80,showChatBubble=()=>{},clearChatBubbles=()=>{},deferTouchRender=()=>false,gmBadge=()=>null,communityUI={report(...args){reports.push(args);}},friendsUI={close(){}},playerMenu={close(){}},stopForSocialUI=()=>{},clearMovementKeys=()=>{},keys=new Set(),toast=()=>{};
const sent=[],send=message=>sent.push(message),readLocal=key=>localStorage.getItem(key),saveLocal=(key,value)=>localStorage.setItem(key,value);
${shipped}
const publicMessage=msg=>{${publicRoute}},whisperMessage=msg=>{${whisperRoute}};
window.fixture={
 sent,reports,controller:chatTranslation,publicMessage,whisperMessage,chatMessage,selectChatChannel,eraseCommunityMessages,
 add(id,text='Hello from the forest.',channel='world',sender='friend'){publicMessage({kind:'chat',text:'Rowan: '+text,channel,playerId:sender,messageId:id});},
 answer(text,error,request=sent.at(-1)){chatTranslation.receive({type:'chatTranslation',messageId:request.messageId,targetLanguage:request.targetLanguage,...(error?{error}:{text})});},
 reset(){chatTranslation.reset();sent.length=0;for(const channel of ['world','system','party','whisper']){$('chat-log-'+channel).replaceChildren();$('chat-tab-'+channel).dataset.unread='0';}chatPreviewMessages.length=0;chatScroll.clear();updateChatPreview();selectChatChannel('world');},
 mobile(){document.body.classList.add('mobile-controls');setChatExpanded(true);},
};
chatTranslation.configure(true);setChatExpanded(true);window.ready=true;
</script></body></html>`;
const server=createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);}else vite.middlewares(req,res,()=>{res.statusCode=404;res.end();});});
server.listen(0,'127.0.0.1');await once(server,'listening');
const vite=await createVite({root,configFile:false,appType:'custom',logLevel:'error',server:{middlewareMode:true,hmr:false,watch:null}});
const run=promisify(execFile),browser=async(...args)=>(await run('npx',['--yes','agent-browser','--session',session,...args],{cwd:root,timeout:45000,maxBuffer:1024*1024})).stdout;
const evaluate=async code=>JSON.parse(await browser('eval',`(()=>{const check=(value,message)=>{if(!value)throw Error(message)};const $=id=>document.getElementById(id),log=channel=>$('chat-log-'+channel),body=row=>row.querySelector('bdi')?.textContent;${code}})()`));
const url=`http://127.0.0.1:${server.address().port}`,output=process.env.CHAT_TRANSLATION_SCREENSHOTS||'/tmp/mossvale-chat-translation-browser';mkdirSync(output,{recursive:true});
const fit=()=>evaluate(`const chat=$('chat'),rect=chat.getBoundingClientRect();check(rect.left>=0&&rect.right<=innerWidth&&rect.top>=0&&rect.bottom<=innerHeight,'chat fits viewport');for(const selector of ['.chat-heading','.chat-translation-controls','#chat-form']){const node=chat.querySelector(selector);check(node.scrollWidth<=node.clientWidth+1,selector+' has no horizontal overflow');}check(log('world').scrollWidth<=log('world').clientWidth+1,'translated text has no horizontal overflow');check(log('world').clientHeight>=32,'chat leaves space for readable message content');const select=$('chat-language'),r=select.getBoundingClientRect();check(select===document.elementFromPoint(r.x+r.width/2,r.y+r.height/2),'language picker is visible and unobstructed');check(errors.length===0,errors.join(' | '));return {viewport:[innerWidth,innerHeight],chat:[rect.width,rect.height],historyHeight:log('world').clientHeight};`);
try{
 await browser('set','viewport','1440','900');await browser('open',url);await browser('wait','--fn','window.ready === true');await browser('snapshot','-i');
 await evaluate(`check($('chat-language').value==='','translation defaults off');fixture.add('hello');check(fixture.sent.length===0,'off makes no translation requests');return true;`);
 await browser('select','#chat-language','sv');
 await evaluate(`check(localStorage.getItem('mossvale-chat-language')==='sv','chosen language persists');check(fixture.sent.length===1&&fixture.sent[0].messageId==='hello'&&fixture.sent[0].targetLanguage==='sv','selection translates received history');check(!$('chat-translation-attribution').hidden,'Google attribution is visible');fixture.answer('Hej från skogen.');check(body(log('world').lastElementChild)==='Hej från skogen.','translation replaces message body');check($('chat-preview-messages').textContent.includes('Hej från skogen.'),'translation updates the mobile preview');return true;`);
 await browser('snapshot','-i');await browser('click','.chat-original');
 await evaluate(`check(body(log('world').lastElementChild)==='Hello from the forest.','original toggle restores unchanged original');check(document.querySelector('.chat-original').getAttribute('aria-pressed')==='true','toggle exposes original state');return true;`);
 await browser('click','.chat-original');
 await browser('click','.chat-report');await evaluate(`check(JSON.stringify(fixture.reports.at(-1))===JSON.stringify(['friend','Rowan','hello']),'original/translation toggles preserve report identity');return true;`);
 await evaluate(`check(body(log('world').lastElementChild)==='Hej från skogen.','second toggle restores translation');fixture.add('safe','Safety test');fixture.answer('Fish &amp; chips &#39;quoted&#39; &lt;img src=x onerror=window.chatXss=true&gt; <script>window.chatXss=true</script>');const row=log('world').lastElementChild;check(body(row)==="Fish & chips 'quoted' <img src=x onerror=window.chatXss=true> <script>window.chatXss=true</script>",'entities decode once to visible text');check(!row.querySelector('img,script')&&!window.chatXss,'translated markup cannot create elements or execute scripts');return true;`);
 await browser('select','#chat-language','');
 await evaluate(`check(body(log('world').lastElementChild)==='Safety test','off restores originals');check($('chat-preview-messages').textContent.includes('Safety test')&&!$('chat-preview-messages').textContent.includes('Fish & chips'),'off restores original previews');check([...document.querySelectorAll('.chat-original')].every(button=>button.hidden),'off hides original toggles');check($('chat-translation-attribution').hidden,'off hides attribution');return true;`);
 await browser('select','#chat-language','sv');await browser('reload');await browser('wait','--fn','window.ready === true');
 await evaluate(`check($('chat-language').value==='sv','preference survives page reload');fixture.add('self-public','Own message','world','self');fixture.whisperMessage({from:{id:'self',name:'Self'},to:{id:'friend',name:'Rowan'},text:'Own whisper',messageId:'self-private'});fixture.chatMessage('System notice');check(fixture.sent.length===0,'own public messages, outgoing whispers and system notices are not submitted');fixture.add('party','Bonjour','party');check(fixture.sent.at(-1).messageId==='party','party route queues translation');fixture.answer('Hej från gruppen.');check(body(log('party').lastElementChild)==='Hej från gruppen.','party messages translate');fixture.whisperMessage({from:{id:'friend',name:'Rowan'},to:{id:'self',name:'Self'},text:'Bonjour en privé',messageId:'private'});check(fixture.sent.at(-1).messageId==='private','incoming whisper route queues translation');fixture.answer('Hej privat.');check(body(log('whisper').lastElementChild)==='Hej privat.','incoming whispers translate');return true;`);
 await evaluate(`fixture.reset();fixture.controller.configure(true);fixture.add('old','Old message');fixture.add('queued','Queued message');check(fixture.sent.length===1,'requests are serialized');window.oldRequest={...fixture.sent[0]};return true;`);
 await browser('select','#chat-language','fr');
 await evaluate(`fixture.answer('Gammalt svar',undefined,oldRequest);check(body(log('world').firstElementChild)==='Old message','old-language result cannot replace current-language text');check(fixture.sent.at(-1).targetLanguage==='fr','current language resumes after previous request finishes');fixture.answer('Ancien message');check(body(log('world').firstElementChild)==='Ancien message','current language applies');check(fixture.sent.at(-1).messageId==='queued','next queued message follows');fixture.answer('Message en attente');check(body(log('world').lastElementChild)==='Message en attente','queued message uses current language');return true;`);
 await evaluate(`fixture.add('removed','Erased while pending','world','erased-player');window.removedRequest={...fixture.sent.at(-1)};fixture.eraseCommunityMessages(['erased-player']);fixture.answer('Should never return',undefined,removedRequest);check(!log('world').textContent.includes('Erased while pending')&&!log('world').textContent.includes('Should never return'),'late result never recreates erased chat');fixture.add('reset','Old session');window.resetRequest={...fixture.sent.at(-1)};fixture.reset();fixture.controller.configure(true);fixture.add('new-session','New session');fixture.answer('Old session response',undefined,resetRequest);check(body(log('world').lastElementChild)==='New session','late result from reset session is ignored');fixture.answer('Nouvelle session');check(body(log('world').lastElementChild)==='Nouvelle session','current session still translates');return true;`);
 await evaluate(`fixture.add('failure','Original after failure');fixture.add('paused','Original while paused');const count=fixture.sent.length;fixture.answer(undefined,'Translation is temporarily unavailable.');check(body(log('world').children[1])==='Original after failure','provider failure retains original');check(fixture.sent.length===count,'provider failure pauses queue');check($('chat-translation-status').textContent.startsWith('Translation is temporarily unavailable.'),'provider error is shown');fixture.add('still-paused','New original');check(fixture.sent.length===count,'new messages do not retry a failed provider');return true;`);
 await browser('select','#chat-language','');await browser('select','#chat-language','fr');
 await evaluate(`check(fixture.sent.at(-1).messageId==='failure','selecting language again resumes translation');fixture.answer('Message conservé');fixture.answer('Message en attente');fixture.answer('Nouveau message');fixture.add('switch-off','Waiting when disabled');window.offRequest={...fixture.sent.at(-1)};return true;`);
 await browser('select','#chat-language','');
 await evaluate(`const count=fixture.sent.length;fixture.answer('Must stay original',undefined,offRequest);check(body(log('world').lastElementChild)==='Waiting when disabled','late reply after Off preserves originals');check(fixture.sent.length===count,'Off never starts queued work');fixture.controller.configure(false);check($('chat-language').disabled,'unconfigured realm disables picker');check($('chat-translation-status').textContent.includes('unavailable'),'unconfigured realm explains availability');fixture.reset();fixture.controller.configure(true);return true;`);
 await browser('select','#chat-language','en');
 await evaluate(`fixture.add('expired','Old receipt');fixture.add('after-expired','New receipt');fixture.controller.receive({...fixture.sent[0],type:'chatTranslation',error:'expired',skipped:true});check(fixture.sent.at(-1).messageId==='after-expired','expired receipt is skipped and queue continues');fixture.answer('Still works');check(body(log('world').firstElementChild)==='Old receipt','expired receipt keeps original');check(body(log('world').lastElementChild)==='Still works','next receipt translates');fixture.reset();fixture.controller.configure(true);fixture.add('desktop','Hola, ¿alguien quiere explorar la mazmorra?');fixture.answer('Hello, does anyone want to explore the dungeon?');return true;`);
 await evaluate(`fixture.controller.configure(false);check(body(log('world').lastElementChild)==='Hola, ¿alguien quiere explorar la mazmorra?','unavailable provider restores original even with a cached translation');check(document.querySelector('.chat-original').hidden&&$('chat-translation-attribution').hidden,'unavailable provider hides translation controls');fixture.controller.configure(true);check(body(log('world').lastElementChild)==='Hello, does anyone want to explore the dungeon?','configured provider can restore cached translation');return true;`);
 console.log('Desktop:',await fit());await browser('screenshot',`${output}/desktop.png`);
 await browser('set','viewport','320','568');await evaluate(`fixture.mobile();fixture.reset();fixture.controller.configure(true);return true;`);
 await browser('select','#chat-language','ar');
 await evaluate(`fixture.add('mobile','Shall we gather at the entrance?');fixture.answer('هل نلتقي عند مدخل الزنزانة؟ مرحبًا بكم يا أصدقاء.');const row=log('world').lastElementChild;check(getComputedStyle(row.querySelector('bdi')).direction==='rtl','Arabic body direction is isolated from the Latin author name');check(body(row).startsWith('هل نلتقي'),'Arabic translation remains intact');return true;`);
 console.log('Mobile:',await fit());await browser('screenshot',`${output}/mobile-320-rtl.png`);
 await evaluate(`fixture.selectChatChannel('system');fixture.selectChatChannel('world');check(body(log('world').lastElementChild).startsWith('هل نلتقي'),'channel switches preserve translated text');return true;`);
 await browser('set','viewport','320','300');console.log('Mobile keyboard:',await fit());await browser('screenshot',`${output}/mobile-320-keyboard.png`);
 assert.equal((await browser('errors')).trim(),'','fixture has no browser exceptions');
 console.log(`PASS chat translation browser: real language selection/persistence, public/party/incoming whisper routing, self/system exclusion, preview updates, original/off controls and report identity, entity decoding and XSS safety, serialized queue, stale language/session/erasure replies, expired receipts, provider failure pause/retry and cached originals on disable, desktop and 320px mobile/keyboard RTL fit. Screenshots: ${output}`);
}catch(error){console.error('FAILURE',await browser('eval','({errors,requests:fixture?.sent,status:document.getElementById("chat-translation-status")?.textContent})').catch(()=>''));await browser('screenshot',`${output}/failure.png`).catch(()=>{});throw error;}finally{
 await browser('close').catch(()=>{});await vite.close();await new Promise(resolve=>server.close(resolve));
}
