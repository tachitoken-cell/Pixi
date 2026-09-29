import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, extname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createServer as createVite } from 'vite';

// Actual UI renderers, timer, request/response handlers and dungeon world, with explicit server-state fixtures.
const root=fileURLToPath(new URL('../',import.meta.url)),session=`dungeon-results-${process.pid}`;
const output=process.argv.find(arg=>arg.startsWith('--output='))?.slice(9)||'/tmp/mossvale-dungeon-results';
const source=readFileSync(join(root,'src/main.ts'),'utf8');
const between=(start,end)=>{const from=source.indexOf(start),to=source.indexOf(end,from);assert(from>=0&&to>from,start);return source.slice(from,to);};
const shipped=stripTypeScriptTypes(between('let dungeonBoard:','let dungeonChoice:')+between('function openDungeon(','function lootSummary('));
const actions=stripTypeScriptTypes('function dispatch(data,button){'+between(' if(data.dungeonBoardSize)',' if(data.chooseDungeon)')+'}');
const seen=new Set(),css=[];
function visit(file){
  if(seen.has(file)||!existsSync(file))return;seen.add(file);
  const text=readFileSync(file,'utf8');if(file.endsWith('.css')){css.push(file);return;}
  for(const [,specifier] of text.matchAll(/^import\s+(?:[^;]*?\s+from\s+)?['"](\.[^'"]+)['"]/gm)){
    let target=resolve(dirname(file),specifier);if(!extname(target))target+='.ts';
    if(/\.(?:ts|css)$/.test(target))visit(target);
  }
}
visit(join(root,'src/main.ts'));
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dungeon results verification</title></head><body><canvas id="world"></canvas><div id="play-ui"><div class="location"><button id="minimap-button"><span class="map-location">Rootvault<br>Moss Gate</span></button></div><dialog id="panel" class="panel"><div class="panel-heading"><div><span class="eyebrow" id="panel-eyebrow"></span><h2 id="panel-title"></h2></div><button class="close-button" id="close-panel" aria-label="Close panel">×</button></div><div id="panel-content"></div></dialog></div><script type="module">
${css.map(file=>`import ${JSON.stringify('/'+file.slice(root.length))};`).join('\n')}
import * as THREE from '/node_modules/three/build/three.module.js';
import {createDungeonWorld} from '/src/zones.ts';
import {dungeonTime,dungeonElapsed,renderDungeonResult,renderDungeonLeaderboard,revealDungeonRewards} from '/src/dungeon-results-ui.ts';
import {lootAllBlockReason,lootEntryBlockReason} from '/src/loot-ui.ts';
import {DUNGEONS,getDungeon,dungeonStages,dungeonReturn,dungeonPreparation,inDungeonPreparation,DUNGEON_EXIT} from '/src/dungeon.ts';
import {isArenaInstance} from '/src/arena.ts';
import {starterGear} from '/src/progression.ts';
import {icon} from '/src/icons.ts';
const $=id=>document.getElementById(id),panel=$('panel');
window.errors=[];addEventListener('error',event=>errors.push(event.message));addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));
let player={id:'hero',name:'Aster',characterCreated:true,rootvaultUnlocked:true,level:60,hp:100,gold:0,appearance:{className:'Mage'},inventory:{wood:0,crystal:0,herb:0,potion:0,relic:0},carriedItems:{},ownedBags:[],equippedBags:[null,null,null,null],...starterGear('Mage')};
const result={durationMs:62345,kills:111,wipes:2,partySize:2,ranked:true,xp:1000,lootId:'completion-1',items:[{id:'gear:starfall-staff',kind:'gear',itemId:'starfall-staff',quantity:1,quality:'rare'},{id:'resource:crystal',kind:'resource',itemId:'crystal',quantity:8,quality:'common'},{id:'resource:relic',kind:'resource',itemId:'relic',quantity:3,quality:'rare'}],claimed:false};
let dungeon={id:'fixture-run',kind:'rootvault',name:'Rootvault',completed:true,room:9,rooms:9,clearedStages:[],objects:[],hazards:[],encounterName:'The vault is quiet',objectives:['Collect your treasure and return through the Moss Gate.'],checkpoint:{active:true},wipes:2,kills:111,totalKills:111,startedAt:Date.now()-62345,elapsedMs:62345,result};
let dungeonChoice='rootvault',worldInstance='fixture-run',position={...dungeonReturn('rootvault')},party=null,connected=true,entryActive=false,rosterActive=false,serverOffset=0;
const sent=[],send=message=>sent.push(message),allowFeature=()=>true;
function closePanel(){panel.close();document.body.classList.remove('mobile-panel-open','menu-open');}
function openPanel(title,eyebrow,mode){panel.dataset.mode=mode;$('panel-title').textContent=title;$('panel-eyebrow').textContent=eyebrow;document.body.classList.add('menu-open');if(innerWidth<1000)document.body.classList.add('mobile-panel-open');if(!panel.open)panel.showModal();panel.scrollTop=0;}
function replacePanelContent(html){const content=$('panel-content'),scroll=content.scrollTop;content.innerHTML=html;content.scrollTop=scroll;}
${shipped}
${actions}
$('panel-content').onclick=event=>{const button=event.target.closest('button');if(button&&!button.disabled)dispatch(button.dataset,button);};
$('close-panel').onclick=closePanel;$('close-panel').innerHTML=icon('close');
const records=[{id:'fast',dungeonId:'rootvault',partySize:2,durationMs:61340,kills:111,wipes:0,completedAt:Date.now(),realmId:'eu',members:[{id:'a',name:'Aster <safe>',className:'Mage',level:60},{id:'b',name:'Willow',className:'Cleric',level:60}]},{id:'other',dungeonId:'rootvault',partySize:2,durationMs:68360,kills:111,wipes:1,completedAt:Date.now(),realmId:'us',members:[{id:'c',name:'Ash',className:'Knight',level:60},{id:'d',name:'Juniper',className:'Ranger',level:60}]}];
const respond=(entries=records,error)=>receiveDungeonLeaderboard({...sent.filter(message=>message.type==='dungeonLeaderboard').at(-1),entries,error});
const originalResult=structuredClone(result);
window.fixture={sent,respond,player,expected:()=>renderDungeonResult(result,player),close:closePanel,newRun(id){Object.assign(result,structuredClone(originalResult),{lootId:id});delete result.remainingItemIds;dungeon.result=result;dungeon.completed=true;dungeon.id=worldInstance='run-'+id;openDungeon();respond();},refresh:renderDungeonPanel,confirm(ids){result.remainingItemIds=result.items.map(item=>item.id).filter(id=>!ids.includes(id));result.claimed=!result.remainingItemIds.length;renderDungeonPanel();},emptyGear(){result.items=result.items.filter(item=>item.kind!=='gear');renderDungeonPanel();},start(){closePanel();dungeon.completed=false;delete dungeon.result;dungeon.startedAt=Date.now()-1200;dungeon.elapsedMs=1200;dungeon.kills=1;},prepare(){closePanel();dungeon.completed=false;delete dungeon.result;dungeon.startedAt=0;dungeon.elapsedMs=0;},open:openDungeon,state:()=>({dungeonBoard,dungeon})};
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,innerWidth/innerHeight,.1,200),renderer=new THREE.WebGLRenderer({canvas:$('world'),antialias:true});
scene.add(new THREE.HemisphereLight('#d2e3c2','#455249',2));const sun=new THREE.DirectionalLight('#fff0d2',2);sun.position.set(15,30,20);scene.add(sun);
const world=await createDungeonWorld(scene,'rootvault'),room=dungeonStages('rootvault')[0];world.setDungeonRoom?.(room.id);camera.position.set(room.x+14,20,room.z+24);camera.lookAt(room.x,0,room.z);renderer.outputColorSpace=THREE.SRGBColorSpace;
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();document.body.classList.toggle('mobile-controls',innerWidth<1000);document.body.classList.toggle('mobile-panel-open',innerWidth<1000&&panel.open);}
resize();addEventListener('resize',resize);renderer.setAnimationLoop(()=>{renderer.render(scene,camera);updateDungeonTimer();});openDungeon();respond();await document.fonts.ready;window.ready=true;
</script></body></html>`;
let vite;
const server=createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);}else vite.middlewares(req,res,()=>{res.statusCode=404;res.end();});});
server.listen(0,'127.0.0.1');await once(server,'listening');
vite=await createVite({root,configFile:false,appType:'custom',logLevel:'error',server:{middlewareMode:true,hmr:{server,clientPort:server.address().port}}});
const url=`http://127.0.0.1:${server.address().port}`,run=promisify(execFile);
const browser=async(...args)=>(await run('npx',['--yes','agent-browser','--session',session,...args],{cwd:root,timeout:60000,maxBuffer:2_000_000})).stdout;
const evaluate=async code=>JSON.parse(await browser('eval',`(()=>{const check=(ok,message)=>{if(!ok)throw Error(message)};${code}})()`));
const click=async selector=>{await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',inline:'nearest'});return true;`);await browser('click',selector);};
try{
  mkdirSync(output,{recursive:true});
  for(const [name,width,height] of [['desktop',1440,1000],['portrait',390,844],['landscape',844,390]]){
    if(process.argv.includes('--landscape-only')&&name!=='landscape')continue;
    await browser('set','viewport',String(width),String(height));await browser('open',url);await browser('wait','--fn','window.ready === true');await browser('wait','--fn','[...document.images].every(image=>image.complete)');await browser('snapshot','-i');
    await evaluate(`const p=document.querySelector('#panel'),c=document.querySelector('#panel-content'),r=p.getBoundingClientRect();check(r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,'panel fits viewport');check(c.scrollWidth<=c.clientWidth+1&&p.scrollWidth<=p.clientWidth+1,'no horizontal overflow');check(document.querySelectorAll('.dungeon-reward-slot').length===4,'four reward slots');check(c.textContent.includes('01:02.345'),'exact server time');check(!c.querySelector('img[src="x"]'),'names escaped');check(errors.length===0,errors.join('\\n'));return true;`);
    // Pause a real reel at a deterministic frame for the rolling-state screenshot.
    await evaluate(`fixture.newRun('capture-${name}');const animations=[...document.querySelectorAll('.dungeon-reel-track')].flatMap(track=>track.getAnimations());check(animations.length===4,'a fresh clear starts four reels');for(const animation of animations){animation.pause();animation.currentTime=600;}return true;`);
    await browser('screenshot',join(output,name+'-rolling.png'));
    await evaluate(`return (async()=>{
      fixture.player.ownedGear.push('starfall-staff');fixture.newRun('completion-${name}');
      const original=JSON.stringify(fixture.state().dungeon.result),expected=document.createElement('div');expected.innerHTML=fixture.expected();
      const finalArt=[...expected.querySelectorAll('.dungeon-reward-art')].map(art=>art.innerHTML),amounts=[...expected.querySelectorAll('.dungeon-reward-slot>strong')].map(node=>node.textContent);
      const rolling=()=>document.querySelectorAll('.dungeon-reward-slot.is-rolling').length,tracks=()=>[...document.querySelectorAll('.dungeon-reel-track')],frames=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      check(rolling()===4&&document.querySelector('.dungeon-result').getAttribute('aria-busy')==='true','new rewards announce rolling');
      check([...document.querySelectorAll('[data-dungeon-reward],[data-dungeon-claim]')].every(button=>button.disabled),'collect waits for the reveal');
      await frames();const before=getComputedStyle(tracks()[3]).transform;await new Promise(resolve=>setTimeout(resolve,120));check(getComputedStyle(tracks()[3]).transform!==before,'reels visibly move');
      const elapsed=tracks()[3].getAnimations()[0].currentTime,strip=tracks()[3].innerHTML;fixture.respond([],'Checking refresh');
      check(tracks()[3].getAnimations()[0].currentTime>=elapsed-30,'leaderboard rebuild resumes elapsed reel time');check(tracks()[3].innerHTML===strip,'refresh preserves reel symbols');
      const animations=tracks().map(track=>track.getAnimations()[0]);check(animations.every((animation,index)=>animation.effect.getTiming().duration===1700+index*450),'reels stop in a staggered order');
      await animations[0].finished;await frames();check(rolling()===3,'first reel stops while the other three keep rolling');
      await Promise.all(animations.slice(1).map(animation=>animation.finished));await frames();
      check(rolling()===0&&!document.querySelector('.dungeon-result').hasAttribute('aria-busy'),'all reels finish');
      check(JSON.stringify([...document.querySelectorAll('.dungeon-reward-art')].map(art=>art.innerHTML))===JSON.stringify(finalArt),'reels land on exact server reward art');
      check(JSON.stringify([...document.querySelectorAll('.dungeon-reward-slot>strong')].map(node=>node.textContent))===JSON.stringify(amounts),'reward labels and quantities remain authoritative');
      check(JSON.stringify(fixture.state().dungeon.result)===original,'animation never rerolls or changes rewards');
      const gear=document.querySelector('[data-dungeon-reward="gear:starfall-staff"]');check(gear.disabled&&gear.textContent==='Already owned'&&document.querySelector('[data-dungeon-claim]').disabled,'reveal preserves collection restrictions');
      fixture.player.ownedGear=fixture.player.ownedGear.filter(id=>id!=='starfall-staff');fixture.refresh();fixture.respond();fixture.close();fixture.open();fixture.respond();
      check(rolling()===0&&!document.querySelector('[data-dungeon-claim]').disabled,'refresh and reopening do not replay completed reels');return true;
    })();`);
    await browser('screenshot',join(output,name+'-results.png'));
    await click('[data-dungeon-reward="resource:crystal"]');
    assert.deepEqual(await evaluate('return fixture.sent.at(-1);'),{type:'loot',targetId:`completion-${name}`,itemId:'resource:crystal'});
    await evaluate("check(!document.querySelector('[data-dungeon-reward=\"resource:crystal\"]').disabled,'claim stays unchanged until authoritative update');fixture.confirm(['resource:crystal']);check(document.querySelector('[data-dungeon-reward=\"resource:crystal\"]').textContent==='Collected','partial collection confirmed');check(!document.querySelector('.dungeon-reward-slot.is-rolling'),'claim updates do not replay reels');return true;");
    await browser('screenshot',join(output,name+'-reward-claims.png'));
    await click('[data-dungeon-claim]');assert.deepEqual(await evaluate('return fixture.sent.at(-1);'),{type:'loot',targetId:`completion-${name}`});
    await evaluate("fixture.confirm(['gear:starfall-staff','resource:crystal','resource:relic']);check(document.querySelector('[data-dungeon-claim]').disabled,'claimed cannot replay');return true;");
    await click('[data-dungeon-board-size="4"]');await evaluate("check(fixture.state().dungeonBoard.loading,'size requests fresh records');fixture.respond([]);check(document.querySelector('.dungeon-board-message').textContent.includes('No ranked'),'empty board');return true;");
    await click('[data-dungeon-board-refresh]');await evaluate("fixture.respond([],'Records unavailable');check(document.querySelector('[role=\"alert\"]').textContent.includes('Refresh'),'error can retry');return true;");
    await click('[data-dungeon-board-refresh]');await evaluate('fixture.respond();return true;');await browser('snapshot','-i');await evaluate("document.querySelector('#panel-content').scrollTop=document.querySelector('#panel-content').scrollHeight;document.querySelector('#panel').scrollTop=document.querySelector('#panel').scrollHeight;return true;");await browser('screenshot',join(output,name+'-leaderboard.png'));
    await evaluate(`const native=window.matchMedia;try{window.matchMedia=query=>{const media=native.call(window,query);if(query==='(prefers-reduced-motion: reduce)')Object.defineProperty(media,'matches',{value:true});return media;};fixture.newRun('reduced-${name}');check(!document.querySelector('.is-rolling,.dungeon-reel-track'),'reduced motion reveals immediately');check(!document.querySelector('[data-dungeon-claim]').disabled,'reduced motion leaves collection usable');document.querySelector('[data-dungeon-claim]').click();check(fixture.sent.at(-1).type==='loot'&&fixture.sent.at(-1).targetId==='reduced-${name}','reduced motion can collect saved rewards');}finally{window.matchMedia=native;}fixture.close();fixture.open();fixture.respond();check(!document.querySelector('.is-rolling'),'reduced-motion reveal remains completed on reopening');return true;`);
    await click('#close-panel');await evaluate("fixture.prepare();return true;");await browser('wait','--fn',"document.querySelector('#dungeon-timer').textContent.includes('Ready to begin')");await evaluate("check(document.querySelector('#dungeon-timer strong').textContent==='00:00','prep timer stopped');fixture.start();return true;");await browser('wait','--fn',"document.querySelector('#dungeon-timer strong').textContent>='00:02'");
    await evaluate("const r=document.querySelector('#dungeon-timer').getBoundingClientRect(),map=document.querySelector('.location').getBoundingClientRect();check(r.width>70&&r.height>=44&&r.left>=0&&r.right<=innerWidth,'timer fits');check(r.right<=map.left||r.bottom<=map.top||r.top>=map.bottom,'timer does not cover minimap');return true;");
    await browser('screenshot',join(output,name+'-timer.png'));await click('#dungeon-timer');await evaluate("check(document.querySelector('#panel').open,'timer opens dungeon details');return true;");
    assert.equal((await browser('errors')).trim(),'','no browser exceptions');
  }
  console.log('PASS: '+(process.argv.includes('--landscape-only')?'landscape':'desktop, portrait and landscape')+' results, moving and staggered reward reels, exact server outcomes, rebuild/reopen continuity, reduced motion, fixed claims, board filtering/error/retry and visible timer. Screenshots: '+output);
}catch(error){console.error(await browser('eval','({ready:window.ready,errors:window.errors,state:window.fixture?.state()})').catch(()=>''));await browser('screenshot',join(output,'failure.png')).catch(()=>{});throw error;}finally{
  await browser('close').catch(()=>{});await vite.close();await new Promise(resolve=>server.close(resolve));
}
