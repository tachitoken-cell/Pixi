import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';

const main = readFileSync('src/main.ts', 'utf8'), seen = new Set(), styles = [];
function visit(file) {
  if (seen.has(file) || !existsSync(file)) return;
  seen.add(file); const source = readFileSync(file, 'utf8');
  if (file.endsWith('.css')) { styles.push(source); return; }
  for (const [, specifier] of source.matchAll(/^import\s+(?:[^;]*?\s+from\s+)?['"](\.[^'"]+)['"]/gm)) {
    let target = resolve(dirname(file), specifier); if (!extname(target)) target += '.ts';
    if (/\.(?:ts|css)$/.test(target)) visit(target);
  }
}
visit(resolve('src/main.ts'));
const imports = new Set(), css = styles.join('\n').replace(/@import\b(?:[^;"']|"[^"]*"|'[^']*')*;/g, rule => { imports.add(rule); return ''; });
const between = (start, end) => { const a = main.indexOf(start), b = main.indexOf(end, a); assert(a >= 0 && b > a, start); return main.slice(a, b); };
const runtime = stripTypeScriptTypes(`
import { createWorldMap as createLiveMap } from '/src/world-map.ts';
const createWorldMap=window.liveMap?createLiveMap:()=>({update(){},dispose(){},focusPlayer(){},zoomBy(){}});
import { icon } from '/src/icons.ts';
import { bindTouchActions } from '/src/mobile-controls.ts';
const $=id=>document.getElementById(id),panel=$('panel'),customizer=$('customizer'),canvas=$('world');
let atlas=null, mapSelection=null,mapRoute=[],rosterActive=false,upgradingBagItem=false;const atlasLabels=new Map();
const player={id:'map-qa',characterCreated:true,level:1,hp:100,instanceId:null,x:0,z:0,rotation:0};
const cancelQueuedShopSales=()=>{},disposeBagBalance=()=>{},specialistNftUI=null;
const itemMenu={close(){}},hotbar={cancel(){}},lootUI={close(){}},clearGearDrag=()=>{},disposeCharacterView=()=>{},disposeBagPreview=()=>{},disposeWalletSettings=()=>{},disposeCollectionPreview=()=>{},clearMovementKeys=()=>{},setChatExpanded=()=>{},setMobileMenus=()=>{},cancelGathering=()=>{};
${main.match(/^const floatingPanel =[^\n]+/m)[0]}
${main.match(/^function disposeAtlas\([^\n]+/m)[0]}
${between('function closePanel(){', 'function openJournal()')}
${between('for(const dialog of [panel,customizer])', "$('hotbar-customize')")}
const closeCustomizer=()=>customizer.close();
const authoredMap=undefined,atlasReturn=false,atlasTravelVisible=true,atlasTravelReady=true,worldInstance=null,usesArenaWorld=()=>false,treasureMapSearchArea=()=>null;
${main.match(/^ const atlasTravel=[^\n]+/m)[0]}
const places=[{id:'town',icon:'user',label:'Lanternreach Bank'},{id:'dungeon',icon:'boss',label:'The Rootvault · Lv 10–14'},{id:'islands',icon:'leaf',label:'The Driftwood Isles · Lv 18–22'}];
const errors=[];addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
function openMap(){
 openPanel('World atlas','FIND YOUR WAY','map');
${between(" $('panel-content').innerHTML=\u0060<div class=\"atlas-stage\"", ' try{atlas=createWorldMap')}
 $('atlas-region').textContent='GREENWOOD · Lv 1–10';$('atlas-selection').textContent='Your adventurer';$('atlas-suitability').textContent='Recommended for your level';$('atlas-description').textContent='A region of meadows, forests and lantern villages.';$('atlas-distance').textContent='0m away · Straight-line direction';
 atlas=createWorldMap($('world-map'),{onSelect:point=>{mapSelection=point;$('atlas-selection').textContent=point.label;$('atlas-distance').textContent='Waypoint set · 124m away · Straight-line direction';}});
 const select=()=>{mapSelection={x:10,z:15,label:'The Rootvault'};$('atlas-selection').textContent=mapSelection.label;$('atlas-distance').textContent='Waypoint set · 124m away · Straight-line direction';};
 document.querySelectorAll('[data-map-place]').forEach(button=>button.onclick=select);
 $('atlas-center').onclick=()=>atlas.focusPlayer();$('atlas-zoom-in').onclick=()=>atlas.zoomBy(1.25);$('atlas-zoom-out').onclick=()=>atlas.zoomBy(.8);$('atlas-travel').onclick=()=>{mapSelection=null;$('atlas-distance').textContent='Waypoint cleared';};
 atlas.update({player,players:[],selected:mapSelection,route:[]});
}
$('close-panel').onclick=closePanel;$('open-map').onclick=openMap;
let worldClicks=0;$('world-action').onclick=()=>{$('world-action').textContent='World click '+(++worldClicks);};
bindTouchActions($('play-ui'));
window.fixture={openMap,closePanel,errors,check(){const panelRect=panel.getBoundingClientRect(),stage=$('world-map').getBoundingClientRect(),details=$('atlas-selection').closest('aside').getBoundingClientRect(),failures=[];const check=(ok,message)=>{if(!ok)failures.push(message);};
 check(stage.height>=innerHeight*.45,'map uses less than 45% of viewport height: '+stage.height);
 check(stage.width>=innerWidth*.5,'map uses less than half the viewport width');
 check(stage.right<=details.left+.5||stage.bottom<=details.top+.5||details.bottom<=stage.top+.5,'navigation card covers the map');
 for(const id of ['close-panel','atlas-center','atlas-zoom-in','atlas-zoom-out','atlas-travel']){const el=$(id),r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);check(r.width>=44&&r.height>=44,id+' below 44px');check(r.left>=panelRect.left&&r.right<=panelRect.right&&r.top>=panelRect.top&&r.bottom<=panelRect.bottom,id+' outside panel');check(hit===el||el.contains(hit),id+' covered');}
 check(getComputedStyle($('atlas-travel')).position!=='static','waypoint button art escapes its control');
 const measures={width:innerWidth,height:innerHeight,mapWidth:stage.width,mapHeight:stage.height};
 worldClicks=0;for(let i=0;i<3;i++){document.querySelector('[data-map-place]')?.click();$('close-panel').click();check(!panel.open&&!document.querySelector(':modal')&&!atlas,'closing map leaves a modal or renderer');$('world-action').click();check(worldClicks===i+1,'world action failed after closing map');openMap();}
 check(!errors.length,errors.join('; '));return {failures,measures};}};
openMap();window.ready=true;
`);
const fixture = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${[...imports,css].join('\n')}</style><body class="mobile-controls"><div id="play-ui"><canvas id="world" tabindex="0"></canvas><button id="open-map" style="position:fixed;left:10px;top:10px">Open map</button><button id="world-action" style="position:fixed;left:130px;top:10px">World action</button><dialog id="panel" class="panel"><div class="panel-heading"><div><span class="eyebrow" id="panel-eyebrow"></span><h2 id="panel-title"></h2></div><button class="close-button" id="close-panel" aria-label="Close map">×</button></div><div id="panel-content"></div></dialog></div><dialog id="customizer"></dialog><script type="module">${runtime}</script>`;
const html=`<!doctype html><meta charset="utf-8"><title>Atlas layout and close checks</title><style>body{font:14px system-ui;background:#eef2ef;color:#172c23}button{font:inherit;min-height:36px}nav{display:flex;gap:8px;margin:10px 0}iframe{display:block;border:0}pre{white-space:pre-wrap;max-width:900px;max-height:140px;overflow:auto}</style><h1>Atlas layout and close checks</h1><nav><button id="run">Run all checks</button><button id="live">Render live map</button>${[[568,320],[844,390],[932,430],[390,844]].map(([w,h])=>`<button data-size="${w},${h}">${w} × ${h}</button>`).join('')}</nav><pre id="result">Choose a viewport or run all checks.</pre><iframe id="frame" title="Mobile atlas" width="844" height="390"></iframe><script>
const frame=document.querySelector('#frame'),result=document.querySelector('#result'),fixture=${JSON.stringify(fixture).replace(/</g,'\\u003c')};
async function load(w,h,live=false){frame.width=w;frame.height=h;if(!live&&frame.contentWindow?.ready){await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return;}frame.contentWindow?.fixture?.closePanel();const loaded=new Promise(r=>frame.onload=r);frame.srcdoc=fixture.replace('<script type="module">','<script>window.liveMap='+live+';<\\/script><script type="module">');await loaded;await new Promise((resolve,reject)=>{let attempts=0;const timer=setInterval(()=>{if(frame.contentWindow.ready){clearInterval(timer);resolve();}else if(++attempts>100){clearInterval(timer);reject(Error('Fixture did not load'));}},100);});await frame.contentDocument.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));}
document.querySelectorAll('[data-size]').forEach(button=>button.onclick=()=>load(...button.dataset.size.split(',').map(Number)));
document.querySelector('#live').onclick=()=>load(Number(frame.width),Number(frame.height),true);
document.querySelector('#run').onclick=async()=>{result.textContent='Running…';const results=[];try{for(const size of [[568,320],[667,375],[844,390],[932,430],[390,844],[360,640]]){await load(...size);results.push(frame.contentWindow.fixture.check());}result.textContent=JSON.stringify({pass:results.every(r=>!r.failures.length),results},null,2);}catch(e){result.textContent=e.stack;}};load(844,390);
</script>`;
mkdirSync('artifacts/mobile-hud',{recursive:true});writeFileSync('artifacts/mobile-hud/map-panel.html',html);
console.log('PASS: generated atlas fixture using real panel lifecycle and stylesheet cascade. Serve artifacts/mobile-hud/map-panel.html through Vite: Run all checks validates six viewports with a renderer stub; Render live map exercises WebGL picking and close recovery. Browser assertions have not run yet.');
