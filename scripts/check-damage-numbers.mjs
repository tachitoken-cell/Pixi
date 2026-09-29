import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { PerspectiveCamera } from 'three';
import { createDamageNumbers } from '../src/damage-numbers.ts';

const children = [], motion = { matches: false };
const oldDocument = globalThis.document, oldMatchMedia = globalThis.matchMedia;
globalThis.matchMedia = () => motion;
globalThis.document = { createElement: () => ({ style: {}, dataset: {}, remove() { children.splice(children.indexOf(this), 1); } }) };
try {
 const camera = new PerspectiveCamera(50, 16 / 9, .1, 250);
 camera.position.set(0, 7, 20); camera.lookAt(0, 2, 0);
 const anchors = new Map([['slime', { x: 0, y: 2, z: 0 }], ['hero', { x: 1, y: 3.6, z: 0 }]]);
 const numbers = createDamageNumbers({ append: el => children.push(el) }, camera, event => anchors.get(event.targetId));
 const hit = { type: 'damage', targetId: 'slime', targetKind: 'enemy', amount: 17, x: 0, z: 0 };
 numbers.play(hit, 0); numbers.update(0, { x: 0, y: 0, z: 0 }, 1280, 720);
 const first = children[0], startTop = parseFloat(first.style.top);
 assert.equal(first.textContent, '17'); assert.equal(first.style.visibility, 'visible');
 assert.equal(first.ariaHidden, 'true'); assert.equal(first.dataset.targetId, 'slime');
 assert.equal(first.className, 'damage-number damage-number-enemy');
 numbers.play(hit, 0); numbers.update(0, { x: 0, z: 0 }, 1280, 720);
 assert.notEqual(first.style.left, children[1].style.left, 'simultaneous hits remain separate and readable');
 numbers.update(500, { x: 0, z: 0 }, 1280, 720);
 assert(parseFloat(first.style.top) < startTop, 'numbers rise above the damaged object');
 anchors.get('slime').x = 3; numbers.update(500, { x: 0, z: 0 }, 1280, 720);
 assert(parseFloat(first.style.left) > 640, 'numbers follow moving targets');
 const lastLeft = first.style.left; anchors.delete('slime');
 numbers.update(1050, { x: 0, z: 0 }, 1280, 720);
 assert.equal(first.style.left, lastLeft, 'killing blows survive removal of the target mesh');
 assert(+first.style.opacity > 0 && +first.style.opacity < 1, 'numbers fade out');
 numbers.update(1250, { x: 0, z: 0 }, 1280, 720); assert.equal(children.length, 0);
 numbers.play({ ...hit, targetId: 'hero', targetKind: 'player', amount: 6 }, 0);
 assert.equal(children[0].className, 'damage-number damage-number-player');
 anchors.get('hero').z = 80; numbers.update(0, { x: 0, z: 0 }, 1280, 720);
 assert.equal(children[0].style.visibility, 'hidden', 'behind-camera targets are hidden');
 anchors.get('hero').z = -180; numbers.update(0, { x: 0, z: 0 }, 1280, 720);
 assert.equal(children[0].style.visibility, 'hidden', 'distant combat does not clutter the screen');
 anchors.get('hero').z = 0; motion.matches = true;
 numbers.update(0, { x: 0, z: 0 }, 1280, 720); const reducedTop = children[0].style.top;
 numbers.update(800, { x: 0, z: 0 }, 1280, 720);
 assert.equal(children[0].style.top, reducedTop); assert(children[0].style.transform.endsWith('scale(1)'));
 numbers.clear(); assert.equal(children.length, 0);
 for(const [effect,text] of [['xp','+12 XP'],['heal','+12'],['absorb','12 absorbed']]) {
  numbers.play({...hit,targetId:'hero',targetKind:'player',effect,amount:12},0);
  assert.equal(children[0].textContent,text);assert(children[0].className.includes(`damage-number-${effect}`));numbers.clear();
 }
 numbers.play({...hit,targetId:'hero',targetKind:'player',amount:0,effect:'immune'},0);
 assert.equal(children[0].textContent,'Immune','zero-damage stun immunity uses the overhead damage display');numbers.clear();
 for (const amount of [0, -5, NaN, Infinity]) numbers.play({ ...hit, targetId: 'hero', amount }, 0);
 numbers.play(hit, 0); assert.equal(children.length, 0, 'invalid damage and unseen targets are ignored');
 for (let i = 0; i < 100; i++) numbers.play({ ...hit, targetId: 'hero' }, i);
 assert.equal(children.length, 64, 'large battles have a bounded number of DOM labels');
 numbers.clear(); assert.equal(children.length, 0, 'zone/disconnect cleanup removes every number');
 // Exercise the actual message branch: loot stays readable in chat without covering the world.
 const main=ts.createSourceFile('main.ts',readFileSync(new URL('../src/main.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
 let notices,damageBranch;
 const visit=node=>{if(ts.isIfStatement(node)){const expression=node.expression.getText(main);if(expression==="msg.kind==='chat'")notices=node.elseStatement;if(expression==="msg.type==='damage'")damageBranch=node.thenStatement;}ts.forEachChild(node,visit);};visit(main);assert(notices);assert(damageBranch);
 const audio=[],displayed=[];
 const messageContext={performance:{now:()=>0},updateAudioScene(){},visibleInDungeonRoom:()=>true,playMonsterHit(){},enemyMeshes:new Map(),elapsed:0,rosterActive:false,entryActive:false,player:{},worldReady:true,playerId:'hero',position:{x:0,z:0},damageNumbers:{play:message=>displayed.push(message)},gameAudio:{play:(...args)=>audio.push(args)}};
 const damage=message=>runInNewContext(damageBranch.getText(main),{...messageContext,msg:{type:'damage',targetId:'hero',targetKind:'player',amount:12,x:0,z:0,...message}});
 for(const [effect,sound] of [[undefined,'hurt'],['heal','heal'],['absorb','magic']]){damage({effect});assert.equal(audio.at(-1)[0],sound);}
 damage({targetId:'slime',targetKind:'enemy'});assert.deepEqual(audio.at(-1),['hit',.45]);
 const before=audio.length;
 for(const message of [{effect:'xp'},{amount:0},{targetId:'slime',x:30},{targetId:'ally',effect:'heal'},{amount:0,effect:'immune'}])damage(message);
 assert.equal(audio.length,before,'XP, empty damage, distant hits and remote healing do not play damage sounds');
 assert.equal(displayed.length,9,'sound filtering preserves every existing damage-number event');
 for(const logOnly of [true,false]){
  const popups=[],chat=[];
  runInNewContext(notices.getText(main),{msg:{kind:'reward',text:'+11 gold · Chipped fang looted',logOnly},toast:text=>popups.push(text),chatMessage:text=>chat.push(text),rosterActive:false,gameAudio:{play:()=>{}}});
  assert.equal(popups.length,logOnly?0:1);assert.deepEqual(chat,['+11 gold · Chipped fang looted']);
 }
 const css=readFileSync(new URL('../src/targets.css',import.meta.url),'utf8');
 assert.match(css,/\.damage-number-xp\s*\{[^}]*color:#75bfff/);assert.match(css,/\.damage-number-heal\s*\{[^}]*color:#95efac/);
 console.log('PASS: blue XP and green effective-heal labels, log-only loot summaries, damage values, moving targets, killing blows, stacking, projection, fade, reduced motion and bounded cleanup.');
} finally { globalThis.document = oldDocument; globalThis.matchMedia = oldMatchMedia; }
