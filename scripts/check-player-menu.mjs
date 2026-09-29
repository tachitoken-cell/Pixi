import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { chooseTarget, isHostileTarget } from '../src/targeting.ts';
const hook=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const {renderGear}=await import('../src/character-ui.ts');
const {mountPlayerMenu}=await import('../src/player-menu.ts');
const {starterGear}=await import('../src/progression.ts');
hook.deregister();
const hero={id:'friend',name:'<img onerror="bad">',level:4,hp:136,maxHp:136,appearance:{className:'Ranger'},talents:[],...starterGear('Ranger'),gold:100,inventory:{wood:3,potion:1}};
const inspection=renderGear(hero,'',true);
assert(inspection.includes('&lt;img')&&!inspection.includes('<img onerror'));
assert(inspection.includes('paper-doll-stage')&&inspection.includes('Equipped items'));
assert.equal((inspection.match(/class="paper-doll-slot"/g)||[]).length,9);
assert(!/data-(?:gear-slot|inspect-item|equip-gear|unequip-gear|use-potion)|draggable="true"|bag-currency|backpack-window/.test(inspection),'inspection cannot mutate equipment or reveal bags');
assert(renderGear(hero).includes('data-gear-slot="weapon"'),'own equipment stays editable');
class Element {
 constructor(){this.listeners={};this.hidden=false;this.style={};this.dataset={};this.attributes={};this.isConnected=true;this.children=[];}
 set innerHTML(value){this.html=value;this.strong=new Element();this.small=new Element();this.buttons=[...value.matchAll(/data-player-action="([^"]+)"/g)].map(([,action])=>{const button=new Element();button.dataset.playerAction=action;button.parent=this;button.icon=new Element();button.label=new Element();button.icon.className='icon item-art';button.label.className='player-menu-label';button.append(button.icon);button.append(button.label);button.span=button.icon;button['.player-menu-label']=button.label;return button;});}
 querySelector(selector){return this[selector]||this.children.map(child=>child.querySelector(selector)).find(Boolean);} querySelectorAll(){return this.buttons;}
 setAttribute(name,value){this.attributes[name]=String(value);} getAttribute(name){return this.attributes[name]??null;}
 append(node){node.parent=this;this.children.push(node);if(node.parent===this&&this.parent?.label===this)this.parent.small=node;} contains(node){return node===this||node.parent===this;}
 closest(){return this.dataset.playerAction?this:null;}
 addEventListener(type,handler){this.listeners[type]=handler;}
 getBoundingClientRect(){return {width:218,height:230};} focus(){document.activeElement=this;}
 fire(type,properties={}){const event={target:this,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...properties};this.listeners[type]?.(event);return event;}
}
globalThis.HTMLElement=Element;
globalThis.document={body:new Element(),activeElement:new Element(),createElement:()=>new Element(),addEventListener(type,handler){this[type]=handler;}};
globalThis.window=new Element();globalThis.innerWidth=360;globalThis.innerHeight=480;
let canManage=false,canDuel=true,challengeReason='';const challengeSizes=new Set([1,2,3]),calls=[],controller=mountPlayerMenu((...args)=>calls.push(args),()=>canManage,(player,size)=>challengeReason||player.id===hero.id&&challengeSizes.has(size),()=>canDuel),menu=document.body.children[0],prior=document.activeElement;
controller.open(hero,355,479);assert.equal(menu.strong.textContent,hero.name);assert.equal(menu.style.left,'134px');assert.equal(menu.style.top,'242px');assert.equal(document.activeElement,menu.buttons[0]);
menu.fire('keydown',{key:'ArrowUp'});assert.equal(document.activeElement,menu.buttons.find(button=>button.dataset.playerAction==='arena3'));
menu.fire('keydown',{key:'Home'});assert.equal(document.activeElement,menu.buttons[0]);
menu.fire('keydown',{key:'End'});assert.equal(document.activeElement,menu.buttons.find(button=>button.dataset.playerAction==='arena3'));
menu.fire('keydown',{key:'Escape'});assert(menu.hidden);assert.equal(document.activeElement,prior);
for(const button of menu.buttons.filter(button=>!button.hidden)){controller.open(hero,0,0);menu.fire('click',{target:button});assert.deepEqual(calls.at(-1),[button.dataset.playerAction,hero.id]);assert(menu.hidden);}
assert(menu.buttons.find(button=>button.dataset.playerAction==='gm').hidden,'ordinary players never receive GM controls');
controller.open(hero,0,0);const priorCalls=calls.length;menu.fire('click',{target:menu.buttons.find(button=>button.dataset.playerAction==='gm')});assert.equal(calls.length,priorCalls,'a hidden GM action cannot bypass current role');
canManage=true;controller.open(hero,0,0);assert(!menu.buttons.find(button=>button.dataset.playerAction==='gm').hidden);menu.fire('keydown',{key:'End'});assert.equal(document.activeElement,menu.buttons.find(button=>button.dataset.playerAction==='gm'));menu.fire('click',{target:menu.buttons.find(button=>button.dataset.playerAction==='gm')});assert.deepEqual(calls.at(-1),['gm',hero.id]);
controller.open(hero,0,0);canManage=false;controller.update([hero]);assert(menu.buttons.find(button=>button.dataset.playerAction==='gm').hidden,'live role loss removes the GM action');menu.fire('click',{target:menu.buttons.find(button=>button.dataset.playerAction==='gm')});assert.equal(calls.length,priorCalls+1);
const challenge1=menu.buttons.find(button=>button.dataset.playerAction==='arena1'),challenge2=menu.buttons.find(button=>button.dataset.playerAction==='arena2'),challenge3=menu.buttons.find(button=>button.dataset.playerAction==='arena3');
assert(menu.html.includes('Arena 1v1')&&menu.html.includes('Arena 2v2')&&menu.html.includes('Arena 3v3'),'all match sizes have explicit labels');
assert.match(menu.html,/class="icon item-art[^"]*"[^>]*><\/span><span class="player-menu-label">Arena 2v2/,'actual icon markup precedes a distinct label span');
for(const button of [challenge1,challenge2,challenge3]){assert.equal(button.small.parent,button.label,'disabled explanation belongs to text label, never the icon sprite');assert.equal(button.icon.children.length,0,'icon atlas stays empty to avoid clipping the reason');}
challengeSizes.clear();controller.open(hero,0,0);assert(!challenge1.hidden&&!challenge2.hidden,'arena options remain discoverable outside the entrance');assert.equal(challenge1.getAttribute('aria-disabled'),'true');assert.equal(challenge2.getAttribute('aria-disabled'),'true');assert.match(challenge1.small.textContent,/current activity/);assert(!menu.buttons.find(button=>button.dataset.playerAction==='duel').hidden,'ordinary Duel remains available independently of arena entry');
const beforeChallenge=calls.length;for(const button of [challenge1,challenge2,challenge3])menu.fire('click',{target:button});assert.equal(calls.length,beforeChallenge,'disabled challenge controls cannot be invoked');assert(!menu.hidden,'an unavailable action leaves its explanation visible');
menu.fire('keydown',{key:'End'});assert.equal(document.activeElement,challenge3,'keyboard users can focus disabled choices to read their explanation');
challengeSizes.add(1);controller.update([hero]);assert.equal(challenge1.getAttribute('aria-disabled'),'false');assert.equal(challenge2.getAttribute('aria-disabled'),'true','solo arena players can challenge only 1v1');assert(challenge1.small.hidden,'available actions remove the old reason');
challengeSizes.add(2);controller.update([hero]);assert.equal(challenge2.getAttribute('aria-disabled'),'false','an eligible two-player party gains 2v2');
challengeSizes.clear();menu.fire('click',{target:challenge2});assert.equal(calls.length,beforeChallenge,'eligibility is rechecked at click time before the next snapshot');
controller.update([hero]);assert(!challenge1.hidden&&!challenge2.hidden);assert.equal(challenge1.getAttribute('aria-disabled'),'true','leaving the arena disables challenges without making them disappear');
challengeReason='Move <8m> closer & wait.';controller.update([hero]);assert.equal(challenge1.small.textContent,challengeReason,'eligibility reasons use safe textContent');assert(!menu.html.includes(challengeReason));challengeReason='';
canDuel='Move within 8 metres to duel.';controller.update([hero]);const duel=menu.buttons.find(button=>button.dataset.playerAction==='duel');assert(!duel.hidden);assert.equal(duel.getAttribute('aria-disabled'),'true');assert.equal(duel.small.textContent,canDuel);menu.fire('click',{target:duel});assert.equal(calls.length,beforeChallenge,'legacy duel eligibility also rechecks before dispatch');canDuel=true;controller.update([hero]);assert.equal(duel.getAttribute('aria-disabled'),'false');assert(duel.small.hidden);
controller.open(hero,20,30);controller.update([]);assert(menu.hidden,'departed target is dismissed');
controller.open(hero,20,30);document.pointerdown({target:prior});assert(menu.hidden,'outside click dismisses menu');
controller.open(hero,20,30);assert(menu.fire('keydown',{key:'w'}).stopped,'menu keys never reach movement');
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const camera=new THREE.PerspectiveCamera(50,1,.1,100);camera.position.set(0,0,10);camera.lookAt(0,0,0);camera.updateMatrixWorld();
const rig=new THREE.Group(),box=new THREE.Mesh(new THREE.BoxGeometry(2,2,2));rig.add(box);rig.updateMatrixWorld();
let terrain;
const context={THREE,canvas:{getBoundingClientRect:()=>({left:0,top:0,width:400,height:400})},camera,raycaster:new THREE.Raycaster(),remote:new Map([['friend',{mesh:rig}]]),mountViews:new Map(),combatCompanions:new Map(),players:[hero],worldInstance:null,pickTerrain:()=>terrain};
Object.assign(context,{chooseTarget,isHostileTarget,player:{id:'self',hp:100},enemyMeshes:new Map(),zoneHandle:undefined,
 targetPoints:()=>[...context.players.map(player=>({id:player.id,kind:'player',x:0,z:0})),...Array.from(context.combatCompanions,([id])=>({id:`companion:${id}`,kind:'companion',x:0,z:4})),...Array.from(context.enemyMeshes,([id])=>({id,kind:'enemy',x:0,z:0}))]});
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function pickTarget('),main.indexOf('let lastTargetText='))),context);
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function pickPlayer('),main.indexOf("$('labels').addEventListener('contextmenu'"))),context);
assert.equal(context.pickPlayer(200,200),hero);box.visible=false;assert.equal(context.pickPlayer(200,200),undefined);box.visible=true;rig.visible=false;assert.equal(context.pickPlayer(200,200),undefined);rig.visible=true;assert.equal(context.pickPlayer(2,2),undefined);
terrain=new THREE.Vector3(0,0,5);assert.equal(context.pickPlayer(200,200),undefined,'terrain in front of a player prevents picking through hills');
terrain=new THREE.Vector3(0,0,.5);assert.equal(context.pickPlayer(200,200),hero,'terrain behind a player does not block picking');
terrain=undefined;
const petRig=new THREE.Group();petRig.add(new THREE.Mesh(new THREE.BoxGeometry(2,2,2)));petRig.position.z=4;petRig.updateMatrixWorld();context.combatCompanions.set('friend',petRig);
assert.equal(context.pickPlayer(200,200),undefined,'a companion in front of its owner receives the world click instead of selecting the owner behind it');
context.combatCompanions.clear();
const bossRig=new THREE.Group(),bossMesh=new THREE.Mesh(new THREE.BoxGeometry(2,2,2));bossRig.add(bossMesh);bossRig.position.z=-1;bossRig.updateMatrixWorld();context.enemyMeshes.set('boss',{mesh:bossRig});
assert.equal(context.pickPlayer(200,200),undefined,'overlapping friendly players do not steal boss clicks');
assert.equal(context.pickTarget(200,200)?.id,'boss','the shared picker prioritizes the overlapping hostile boss');
bossRig.visible=false;assert.equal(context.pickPlayer(200,200),hero,'hidden boss geometry cannot take the player click');
context.enemyMeshes.clear();bossMesh.geometry.dispose();
// Mounts are independent scene roots; a ray through the horse body misses the elevated rider.
rig.position.y=3;rig.updateMatrixWorld();
const horse=new THREE.Group(),horseBody=new THREE.Mesh(new THREE.BoxGeometry(2,2,3)),mountParent=new THREE.Group();
horse.add(horseBody);mountParent.add(horse);mountParent.updateMatrixWorld();context.mountViews.set('friend',{id:'horse',mesh:horse});
assert.equal(context.pickPlayer(200,200),hero,'the mounted body resolves to its rider');
horseBody.visible=false;assert.equal(context.pickPlayer(200,200),undefined,'hidden mount parts cannot be picked');horseBody.visible=true;
horse.visible=false;assert.equal(context.pickPlayer(200,200),undefined,'hidden mount roots cannot be picked');horse.visible=true;
mountParent.visible=false;assert.equal(context.pickPlayer(200,200),undefined,'hidden mount ancestors cannot be picked');mountParent.visible=true;
terrain=new THREE.Vector3(0,0,5);assert.equal(context.pickPlayer(200,200),undefined,'terrain also occludes mounted bodies');terrain=undefined;
context.mountViews.delete('friend');
for(const id of ['self','departed']){
 context.players.push({...hero,id});context.mountViews.set(id,{id:'horse',mesh:horse});
 assert.equal(context.pickPlayer(200,200),undefined,'local and non-remote mounts never resolve to a player menu');
 context.mountViews.delete(id);context.players.pop();
}
horseBody.geometry.dispose();box.geometry.dispose();
const sent=[],input={value:'Hello privately',blur(){}},form={};
const chat={$:id=>id==='chat-form'?form:input,send:message=>sent.push(message),chatChannel:'whisper',chatDrafts:{whisper:''},whisperTarget:{id:'friend'},toast(){},canvas:{focus(){}},mobileChat:()=>false,emoteCommand:()=>undefined};
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf("$<HTMLFormElement>('chat-form').onsubmit="),main.indexOf("\nfor(const tab of document.querySelectorAll<HTMLButtonElement>('[data-chat-channel]')"))),chat);
form.onsubmit({preventDefault(){}});assert.deepEqual(JSON.parse(JSON.stringify(sent[0])),{type:'whisper',targetId:'friend',text:'Hello privately'});
chat.whisperTarget=null;input.value='Never public';form.onsubmit({preventDefault(){}});assert.equal(sent.length,1,'missing private recipient never falls back to public chat');
console.log('PASS: player menu safe labels, gated 1v1/2v2 challenges with live and click-time validation, keyboard, clamped placement, stale/outside dismissal, character/mount picking, hidden/local mount exclusion, terrain occlusion, read-only nine-slot inspection and private chat routing.');
