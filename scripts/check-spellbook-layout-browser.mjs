import assert from 'node:assert/strict';
import {HOTBAR_SIZE,HOTBAR_PAGE_SIZE} from '../src/spells.ts';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createServer as createVite } from 'vite';

// Actual spellbook, hotbar controller and stylesheet cascade; no live account or realm.
const root=fileURLToPath(new URL('../',import.meta.url)),session=`spellbook-layout-${process.pid}`;
const output=process.argv.find(arg=>arg.startsWith('--output='))?.slice(9)||'/tmp/mossvale-spellbook-layout';
const seen=new Set(),css=[];
function visit(file){
 if(seen.has(file)||!existsSync(file))return;seen.add(file);
 const source=readFileSync(file,'utf8');if(file.endsWith('.css')){css.push(file);return;}
 for(const [,specifier] of source.matchAll(/^import\s+(?:[^;]*?\s+from\s+)?['"](\.[^'"]+)['"]/gm)){
  let target=resolve(dirname(file),specifier);if(!extname(target))target+='.ts';
  if(/\.(?:ts|css)$/.test(target))visit(target);
 }
}
visit(join(root,'src/main.ts'));
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Spellbook layout verification</title></head><body><div id="app"></div><div id="play-ui"><div id="hotbar" hidden></div><dialog id="panel" class="panel" data-mode="spells"><div class="panel-heading"><div><span class="eyebrow">RANGER · ABILITIES</span><h2>Your spellbook</h2></div><button class="close-button" aria-label="Close spellbook">×</button></div><div id="panel-content"></div></dialog></div><script type="module">
${css.map(file=>`import ${JSON.stringify('/'+file.slice(root.length))};`).join('\n')}
import {renderSpellbook,createHotbar} from '/src/hotbar.ts';
import {skillTabs} from '/src/skills-ui.ts';
import {starterGear} from '/src/progression.ts';
import {defaultHotbar} from '/src/spells.ts';
import {normalizeAppearance,DEFAULT_APPEARANCE} from '/src/appearance.ts';
import {bindTouchActions} from '/src/mobile-controls.ts';
const panel=document.getElementById('panel'),book=document.getElementById('panel-content'),hud=document.getElementById('hotbar');
window.errors=[];addEventListener('error',event=>errors.push(event.message));addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));
const player={id:'spellbook-layout-check',name:'Adventurer',level:25,hp:100,maxHp:100,talents:[],abilityCooldowns:{},inventory:{potion:12},appearance:normalizeAppearance({...DEFAULT_APPEARANCE,className:'Ranger'}),hotbar:defaultHotbar('Ranger',25),hotbar2:Array(8).fill(null),...starterGear('Ranger')};
const saved=[],controller=createHotbar({hud,book,canEdit:()=>true,cast(){throw Error('editing must not cast')},save:slots=>{saved.push(slots);return true},notify(){}});
const responsive=()=>{document.body.classList.toggle('mobile-controls',innerWidth<1000);document.body.classList.toggle('mobile-panel-open',innerWidth<1000);controller.refresh()};
book.innerHTML=skillTabs('combat')+renderSpellbook(player,[...player.hotbar,...player.hotbar2]);controller.sync(player);responsive();addEventListener('resize',responsive);bindTouchActions(document.getElementById('play-ui'));
panel.querySelector('.close-button').onclick=()=>panel.close();panel.showModal();await document.fonts.ready;
window.fixture={controller,player,saved};await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));window.ready=true;
</script></body></html>`;
let vite;
const server=createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);}else vite.middlewares(req,res,()=>{res.statusCode=404;res.end()});});
server.listen(0,'127.0.0.1');await once(server,'listening');
vite=await createVite({root,configFile:false,appType:'custom',logLevel:'error',server:{middlewareMode:true,watch:null,hmr:{server,clientPort:server.address().port}}});
const run=promisify(execFile),url=`http://127.0.0.1:${server.address().port}`;
const browser=async(...args)=>(await run('npx',['--yes','agent-browser','--session',session,...args],{cwd:root,timeout:60000,maxBuffer:2_000_000})).stdout;
const evaluate=async code=>JSON.parse(await browser('eval',`(()=>{const check=(ok,message)=>{if(!ok)throw Error(message)};${code}})()`));
try{
 if(process.argv.includes('--serve')){console.log('Spellbook fixture: '+url);await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve)});}
 else{
  mkdirSync(output,{recursive:true});
  for(const [name,width,height] of [['desktop',1440,1000],['portrait',390,844],['landscape',844,390]]){
   await browser('set','viewport',String(width),String(height));await browser('open',url);await browser('wait','--fn','window.ready === true');await browser('wait','--fn','[...document.images].every(image=>image.complete)');
   await evaluate(`const panel=document.querySelector('#panel'),content=document.querySelector('#panel-content'),r=panel.getBoundingClientRect();check(r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,'panel fits viewport');check(document.documentElement.scrollWidth<=innerWidth+1&&content.scrollWidth<=content.clientWidth+1,'no horizontal overflow');check(document.querySelector('.spell-available .is-locked[disabled]'),'unlearned skills remain gated');check(document.querySelectorAll('.spell-learned .spell-choice:not(:disabled)').length>2,'learned skills and utilities remain available');check(document.querySelectorAll('.hotbar-editor [data-hotbar-slot]').length===(innerWidth<1000?4:${HOTBAR_PAGE_SIZE}),'responsive hotbar page size');check(getComputedStyle(panel).borderImageSource.includes('panel-frame.svg'),'established Mossvale forest frame is loaded');return true;`);
   await evaluate(`const copy=[...document.querySelectorAll('.spell-copy')].find(node=>getComputedStyle(node).display!=='none').getBoundingClientRect();for(const list of document.querySelectorAll('.spell-list'))check(copy.top>=list.getBoundingClientRect().bottom-1,'spell details reserve space below every skill grid');return true;`);
   await browser('click','[data-book-ability="power-shot"]');
   await evaluate(`const choice=document.querySelector('[data-book-ability="power-shot"]'),copy=choice.querySelector('.spell-copy');check(choice.getAttribute('aria-pressed')==='true','skill selection works');check(getComputedStyle(copy).display==='block'&&copy.textContent.includes('range'),'selected skill details remain visible');check([...document.querySelectorAll('.spell-copy')].filter(node=>getComputedStyle(node).display!=='none').length===1,'one selected detail at a time');return true;`);
   await browser('screenshot',join(output,name+'-skills.png'));
   await browser('click','.hotbar-editor [data-hotbar-slot="3"]');
   await evaluate(`check(fixture.controller.slots[3]==='power-shot','click assigns selected spell');check(fixture.saved.at(-1).length===${HOTBAR_SIZE},'all saved slots survive');return true;`);
   const pages=width<1000?HOTBAR_SIZE/4:2;
   for(let index=1;index<=pages;index++){
    await browser('click','.hotbar-editor [data-hotbar-page]');
    await evaluate(`check(fixture.controller.page===${index%pages},'every responsive hotbar page is reachable');return true;`);
   }
   await browser('focus','[data-book-ability="mend"]');await browser('press','Enter');await browser('press','2');
   await evaluate(`check(fixture.controller.slots[1]==='mend','keyboard assignment works');document.querySelector('.hotbar-editor').scrollIntoView({block:'end'});return true;`);
   await browser('screenshot',join(output,name+'-hotbar.png'));
   await evaluate(`const slot=document.querySelector('.hotbar-editor [data-hotbar-slot]'),r=slot.getBoundingClientRect();check(r.width>=44&&r.height>=44,'assignment targets remain touch sized');check(errors.length===0,errors.join('\\n'));return true;`);
   await browser('click','.panel-heading .close-button');await evaluate(`check(!document.querySelector('#panel').open,'close remains reachable');return true;`);
   assert.equal((await browser('errors')).trim(),'','no browser exceptions');console.log('PASS '+name+': skill grid, details, all saved slots, paging, keyboard, frame and overflow');
  }
 }
}finally{await browser('close').catch(()=>{});await vite.close();await new Promise(resolve=>server.close(resolve));}
