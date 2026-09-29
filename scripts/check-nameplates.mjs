import { playerTitle } from '../src/titles.ts';
import { isHostilePlayer } from '../src/targeting.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { MONSTERS, WORLD_BOSSES } from '../src/bestiary.ts';
import { MAX_LEVEL } from '../src/progression.ts';

class Element {
 constructor(tag='div'){this.tag=tag;this.children=[];this.style={};this.dataset={};this.textContent='';this.title='';this.classes=new Set();this.classList={add:(name)=>this.classes.add(name),toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name)};}
 append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
 before(node){node.parent=this.parent;this.parent.children.splice(this.parent.children.indexOf(this),0,node);}
 querySelector(selector){const parts=selector.split(' ');let found;const visit=node=>{for(const child of node.children){if(child.tag===parts[0]||child.className===parts[0].slice(1)){found=parts.length>1?child.querySelector(parts.slice(1).join(' ')):child;if(found)return;}visit(child);if(found)return;}};visit(this);return found;}
 insertAdjacentHTML(_,html){for(const match of html.matchAll(/<span class="([^"]+)"[^>]*>(.*?)<\/span>/g)){const span=new Element('span');span.className=match[1];for(const child of match[2].matchAll(/<(i|b)>/g))span.append(new Element(child[1]));this.append(span);}}
 remove(){this.removed=true;if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
}
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8'),labels=new Element();
const runtime={MONSTERS,isHostilePlayer,playerTitle,player:{id:'self',hp:100,pvp:false},document:{createElement:tag=>new Element(tag)},$:()=>labels,party:null};
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function arenaPlayerLabel('),main.indexOf('function updateLocation('))),runtime);
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function label('),main.indexOf('function toast('))),runtime);
const friend={id:'friend',name:'WWWWWWWWWWWWWWWWWWWW',appearance:{className:'Mage'},level:7,hp:63,maxHp:100};
const plate=runtime.playerNameplate(friend);
assert.equal(plate.ariaHidden,'false');assert.equal(plate.tabIndex,0);assert.equal(plate.role,'button');assert.equal(plate.ariaHasPopup,'menu');assert.equal(labels.children.length,1);assert(plate.classes.has('player-nameplate'));assert.equal(plate.dataset.playerId,'friend');
assert.equal(plate.querySelector('strong').textContent,friend.name);assert.equal(plate.querySelector('small').textContent,'Level 7 Mage');
assert.equal(plate.querySelector('.player-nameplate-health i').style.width,'63%');assert(plate.title.includes('63 / 100 health'));
runtime.party={leaderId:'friend',members:[{id:'friend'}]};runtime.updatePlayerNameplate(plate,friend);
assert(plate.classes.has('is-party'));assert(plate.querySelector('small').textContent.includes('Leader'));
runtime.party.leaderId='you';runtime.updatePlayerNameplate(plate,friend);assert(plate.querySelector('small').textContent.endsWith('Party'));
runtime.player={id:'self',hp:100,pvp:true};friend.pvp=true;runtime.updatePlayerNameplate(plate,friend);assert(plate.classes.has('is-duel'));assert.equal(plate.ariaHasPopup,'false');assert.match(plate.querySelector('small').textContent,/PvP/,'party nameplates clearly show arena hostility');
friend.pvp=false;runtime.updatePlayerNameplate(plate,friend);assert(!plate.classes.has('is-duel'));assert.match(plate.querySelector('small').textContent,/Party/);
runtime.party=null;friend.hp=-3;runtime.updatePlayerNameplate(plate,friend);
assert(!plate.classes.has('is-party'));assert(plate.classes.has('is-defeated'));assert.equal(plate.querySelector('.player-nameplate-health i').style.width,'0%');
friend.hp=200;runtime.updatePlayerNameplate(plate,friend);assert.equal(plate.querySelector('.player-nameplate-health i').style.width,'100%');
friend.maxHp=0;runtime.updatePlayerNameplate(plate,friend);assert.equal(plate.querySelector('.player-nameplate-health i').style.width,'0%');
friend.name='<img onerror=alert(1)>';runtime.updatePlayerNameplate(plate,friend);assert.equal(plate.querySelector('strong').textContent,friend.name,'player names only enter textContent');

friend.title='beta-tester'; friend.betaTester=true; runtime.updatePlayerNameplate(plate,friend);
assert.equal(plate.querySelector('.player-title').textContent,'<Beta Tester>'); assert.equal(plate.querySelector('strong').textContent,friend.name,'titles stay separate from character names');
assert(plate.title.includes('<Beta Tester>'));
friend.betaTester=false; runtime.updatePlayerNameplate(plate,friend); assert(!plate.querySelector('.player-title'),'unearned title never renders');
friend.title='trail-warden'; friend.achievements={unlocked:{'trail-warden':1}}; runtime.updatePlayerNameplate(plate,friend); assert.equal(plate.querySelector('.player-title').textContent,'<Trail Warden>');
friend.title=null; runtime.updatePlayerNameplate(plate,friend); assert(!plate.querySelector('.player-title'),'clearing the title removes it from nameplates');

const camera=new THREE.PerspectiveCamera(50,16/9,.1,200);camera.position.set(0,7,20);camera.lookAt(0,2,0);camera.updateMatrixWorld();
const projection={visibleInDungeonRoom:()=>true,THREE,labelPosition:new THREE.Vector3(),position:{x:0,z:0},camera,surfaceHeight:()=>0,worldInstance:null,innerWidth:1280,innerHeight:720};
const placement=main.slice(main.indexOf('function placeLabel('),main.indexOf('let previous=',main.indexOf('function placeLabel(')));
runInNewContext(stripTypeScriptTypes(placement),projection);
projection.placeLabel(plate,0,3.3,0,64);assert.equal(plate.style.visibility,'visible');assert(parseFloat(plate.style.top)>0&&parseFloat(plate.style.top)<720);
projection.placeLabel(plate,0,3.3,80,64);assert.equal(plate.style.visibility,'hidden','distant or behind-camera labels are hidden');
assert(main.includes('label:playerNameplate(p)')&&main.includes('updatePlayerNameplate(entry.label,p)'));
assert(main.includes('entry.label.remove()')&&main.includes('remote.clear()'),'existing instance/roster cleanup owns the plates');
console.log('PASS: remote nameplates, safe names, live health, class/level, party/leader/defeated states, bounded fills, projection distance and lifecycle wiring.');

// Exercise live monster label creation/update with the same optional subtitle helper.
Object.assign(runtime,{player:{level:1},enemies:Object.entries(MONSTERS).map(([kind,stats])=>({id:kind,kind,level:stats.level,hp:stats.hp,maxHp:stats.hp,alive:true,x:0,z:0,worldBoss:WORLD_BOSSES.some(boss=>boss.kind===kind)})),enemyMeshes:new Map(),enemyNames:Object.fromEntries(Object.entries(MONSTERS).map(([kind,s])=>[kind,s.name])),makeEnemy:()=>new THREE.Group(),surfaceHeight:()=>0,scene:new THREE.Scene()});
const enemyLoop=main.slice(main.indexOf(' for(const e of enemies){if(!enemyMeshes.has'),main.indexOf(' for(const [id,mesh] of nodeMeshes',main.indexOf('function syncEntities(')));
runInNewContext(stripTypeScriptTypes(enemyLoop),runtime);
assert.equal(runtime.enemyMeshes.size,Object.keys(MONSTERS).length);
for(const e of runtime.enemies){const plate=runtime.enemyMeshes.get(e.id).label;assert.equal(plate.querySelector('strong').textContent,MONSTERS[e.kind].name);assert.equal(plate.querySelector('.enemy-health i').style.width,'100%');if(e.kind==='training-dummy')assert.equal(plate.querySelector('small').textContent,`${e.hp.toLocaleString()} / ${e.maxHp.toLocaleString()} HP`);else{if(e.worldBoss)assert(plate.querySelector('small').textContent.includes(`${e.hp} / ${e.maxHp}`));else assert.equal(plate.querySelector('small').textContent,`Lv ${e.level}`);assert(plate.querySelector('small').textContent.startsWith(`Lv ${e.level}`));}assert.equal(plate.dataset.danger,runtime.monsterDanger(e.level,1));}
runtime.enemies.find(enemy=>enemy.kind==='stormhorn-behemoth').hp=1000;runInNewContext(stripTypeScriptTypes(enemyLoop),runtime);assert(runtime.enemyMeshes.get('stormhorn-behemoth').label.querySelector('small').textContent.includes('ENRAGED'));
const berserk=runtime.enemies.find(enemy=>enemy.kind==='stormhorn-behemoth');berserk.hp=berserk.maxHp;berserk.berserk=true;runInNewContext(stripTypeScriptTypes(enemyLoop),runtime);assert(runtime.enemyMeshes.get(berserk.id).label.querySelector('small').textContent.includes('BERSERK'),'timed berserk is visible even above half health');
runtime.player.level=MAX_LEVEL;runInNewContext(stripTypeScriptTypes(enemyLoop),runtime);
for(const view of runtime.enemyMeshes.values())assert.equal(view.label.dataset.danger,'easy','level-ups refresh relative danger without recreating labels');
console.log('PASS: all monster levels and four world bosses, relative danger refreshed on player level-up, boss health and enrage refresh.');
