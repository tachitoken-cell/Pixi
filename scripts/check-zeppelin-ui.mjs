import { bindingLabel } from '../src/keybindings.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { ZEPPELIN_PORTS, zeppelinPort, createZeppelinFlight } from '../src/zeppelin.ts';

const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const code=stripTypeScriptTypes(
  main.slice(main.indexOf('function label('),main.indexOf('function monsterDanger('))+'\n'+
  main.slice(main.indexOf('function canUseZeppelinDock('),main.indexOf('function updateZeppelinTravel(')));
class Element {
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.hidden=false;this.disabled=false;this.textContent='';}
  append(...children){this.children.push(...children);}
  prepend(child){this.children.unshift(child);}
  querySelector(selector){return this.children.find(child=>selector==='small'?child.tagName==='SMALL':child.dataset.zeppelinDiscover);}
}
function app(ports=[]){
  const content=new Element(),labels=new Element(),sent=[],toasts=[],panel={open:false,dataset:{}};
  let buttons=[],html='';
  Object.defineProperty(content,'innerHTML',{get:()=>html,set:value=>{
    html=value;
    buttons=[...value.matchAll(/<button\b([^>]*)>/g)].map(([,attributes])=>{
      const button=new Element('button');button.dataset.zeppelinTo=attributes.match(/data-zeppelin-to="([^"]+)"/)[1];
      button.disabled=/\bdisabled\b/.test(attributes);return button;
    });
  }});
  const port=zeppelinPort('greenwood');
  const state={bindingLabel,player:{id:'traveller',hp:100,zeppelinPorts:[...ports]},position:{x:port.x,z:port.z},jump:{grounded:true},
    connected:true,worldReady:true,worldInstance:null,worldZone:'greenwood',rotation:0,lastMove:0,gm:false,
    ZEPPELIN_PORTS,zeppelinPort,createZeppelinFlight,zoneMarkers:[],panel,heldKeyCodes:new Map(),keys:new Set(['w']),
    document:{createElement:tag=>new Element(tag),querySelectorAll:()=>buttons},
    $:id=>id==='labels'?labels:content,gmFlying:()=>state.gm,
    openPanel:(_title,_subtitle,mode)=>{panel.open=true;panel.dataset.mode=mode;},closePanel:()=>{panel.open=false;},
    send:message=>sent.push(JSON.parse(JSON.stringify(message))),toast:message=>toasts.push(message),
    performance:{now:()=>100},clearWaypoint:()=>{state.waypointCleared=true;},canvas:{focus:()=>{state.focused=true;}}};
  runInNewContext(main.match(/^function clearMovementKeys.*$/m)[0],state);
  runInNewContext(code,state);
  const marker=state.zeppelinMarker('greenwood');state.zoneMarkers.push({el:marker,id:'zeppelin-greenwood',x:port.x,z:port.z});
  return {state,marker,check:marker.querySelector('[data-zeppelin-discover]'),sent,toasts,content,
    button:id=>buttons.find(button=>button.dataset.zeppelinTo===id)};
}
const view=app(),event={stopPropagation(){this.stopped=true;}};
assert.equal(view.check.tagName,'BUTTON');assert.equal(view.check.type,'button');
assert.equal(view.check.textContent,'!');assert.match(view.check.className,/\bnpc-quest\b/);assert.match(view.check.ariaLabel,/Discover Lanternreach sky dock/);
assert.equal(view.marker.ariaHidden,'false');assert(!view.check.hidden&&!view.check.disabled);
const before=JSON.stringify(view.state.player);
view.check.onclick(event);
assert(event.stopped);
assert.deepEqual(view.sent.map(message=>message.type),['move','zeppelinDiscover']);
assert.equal(view.sent[1].port,'greenwood');
assert.equal(JSON.stringify(view.state.player),before,'clicking never grants progress or alters the character optimistically');
assert(!view.check.hidden,'the blue exclamation mark remains until the server confirms discovery');
for(const port of ZEPPELIN_PORTS.filter(port=>port.id!=='greenwood'))assert(view.button(port.id).disabled);
assert.match(view.content.innerHTML,/Discovering this dock/);
view.state.updateZeppelinDiscovery();
assert.equal(view.sent.length,2,'unconfirmed snapshots never resubmit discovery automatically');
assert(!view.check.hidden,'a rejected or delayed discovery leaves the marker available');

view.state.player={...view.state.player,zeppelinPorts:['greenwood']};
view.state.updateZeppelinDiscovery();
assert(view.check.hidden,'only a confirmed discovery removes the exclamation mark');
assert.match(view.content.innerHTML,/Choose a discovered city/);
assert.match(view.content.innerHTML,/Visit to unlock/);
assert(view.button('amberwild').disabled);
view.state.player={...view.state.player,zeppelinPorts:['greenwood','amberwild']};
view.state.updateZeppelinDiscovery();
assert(!view.button('amberwild').disabled&&view.button('frostmarch').disabled,'a fresh snapshot refreshes the open destination list');
view.button('frostmarch').disabled=false;
view.button('frostmarch').onclick();
assert.equal(view.sent.length,2,'a forced click still cannot board an undiscovered destination');
view.button('amberwild').onclick();
assert.deepEqual(view.sent.slice(-2).map(message=>message.type),['move','zeppelinBoard']);
assert.deepEqual(view.sent.at(-1),{type:'zeppelinBoard',from:'greenwood',to:'amberwild'});
assert(!view.state.panel.open&&view.state.focused&&!view.state.waypointCleared,'boarding requests retain waypoints even if the server later rejects the flight');
assert(!view.state.player.zeppelin,'boarding waits for the authoritative flight snapshot');

for(const change of [state=>state.position.x+=8.01,state=>state.jump.grounded=false,state=>state.player.hp=0,
  state=>state.player.zeppelin={from:'greenwood',to:'amberwild'},state=>state.worldInstance='dungeon',
  state=>state.gm=true,state=>state.connected=false,state=>state.worldReady=false]){
  const invalid=app(['greenwood','amberwild']);change(invalid.state);invalid.state.updateZeppelinDiscovery();
  assert(invalid.check.disabled);invalid.state.openZeppelin('greenwood');assert.equal(invalid.sent.length,0);
}
const edge=app();edge.state.position.x+=8;edge.state.openZeppelin('greenwood');
assert.equal(edge.sent.at(-1).type,'zeppelinDiscover','the eight-metre interaction boundary is inclusive');
const resumed=app(['greenwood','amberwild']);resumed.state.updateZeppelinDiscovery();
assert(resumed.check.hidden,'reloaded character discovery persists in its server-supplied state');
resumed.state.player={id:'another-character',hp:100,zeppelinPorts:[]};resumed.state.updateZeppelinDiscovery();
assert(!resumed.check.hidden,'another character never inherits discovered docks');
resumed.state.openZeppelin('greenwood');assert(resumed.button('amberwild').disabled);
const legacy=app();delete legacy.state.player.zeppelinPorts;legacy.state.updateZeppelinDiscovery();
assert(!legacy.check.hidden,'characters without the optional field start undiscovered');

const css=readFileSync(new URL('../src/zeppelin.css',import.meta.url),'utf8');
assert.match(css,/\.zeppelin-discover\{[^}]*pointer-events:auto[^}]*width:44px[^}]*height:44px/);
assert.match(css,/\.world-label \.npc-quest\.zeppelin-discover\{[^}]*border:0;[^}]*background:transparent;[^}]*color:#69b8ff;[^}]*Georgia/,'the blue marker uses quest styling without a circular badge');
assert.match(css,/\.zeppelin-discover:focus-visible\{/);
assert.match(css,/\.zeppelin-discover\[hidden\]\{display:none\}/);
assert.match(main,/el:zeppelinMarker\(port.id\)/);
assert.match(main,/updateZeppelinDiscovery\(\);/,'rendering applies the most recent authoritative discovery snapshot');
console.log('PASS zeppelin UI: accessible blue quest exclamation marks, physical discovery guards, server-confirmed claims, locked destinations, live menu refresh, guarded boarding and per-character reload/switch state.');
