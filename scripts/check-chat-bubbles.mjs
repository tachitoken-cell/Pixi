import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';

class Element {
 constructor(){this.children=[];this.hidden=false;this.style={};}
 append(node){node.parentElement=this;this.children.push(node);}
 remove(){const parent=this.parentElement;if(parent)parent.children.splice(parent.children.indexOf(this),1);this.parentElement=null;}
 set textContent(text){this.text=String(text);this.children=[];}
 get textContent(){return this.text||'';}
 set innerHTML(_value){assert.fail('player messages must never become HTML');}
}
const nodes=new Map(['label-you','label-friend','label-hidden'].map(id=>[id,new Element()]));
const timers=new Map();let now=0,nextTimer=0;
const context=vm.createContext({
 document:{getElementById:id=>nodes.get(id)||null,createElement:()=>new Element()},
 setTimeout(callback,delay){const id=++nextTimer;timers.set(id,{callback,at:now+delay});return id;},
 clearTimeout:id=>timers.delete(id)
});
const source=readFileSync(new URL('../src/chat-bubbles.ts',import.meta.url),'utf8');
vm.runInContext(stripTypeScriptTypes(source.replace(/^import '\.\/chat-bubbles\.css';\n/,'').replace(/export /g,'')),context);
const {showChatBubble:show,clearChatBubbles:clear}=context;
const own=nodes.get('label-you'),friend=nodes.get('label-friend'),hidden=nodes.get('label-hidden');
const advance=milliseconds=>{now+=milliseconds;for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);timer.callback();}};

show('self','Hello','world','self');
assert.equal(own.children[0].textContent,'Hello');assert.equal(friend.children.length,0);
assert.equal(own.children[0].ariaHidden,'true','chat already announces messages; the nameplate keeps its accessible name');
assert.equal(own.children[0].translate,false);
advance(4000);const oldExpiry=[...timers.values()][0].callback;
show('self','Replaced','world','self');
assert.equal(own.children.length,1,'one bubble per nameplate');assert.equal(own.children[0].textContent,'Replaced');assert.equal(timers.size,1);
oldExpiry();advance(1000);assert.equal(own.children.length,1,'old expiry cannot remove a replacement');
advance(3999);assert.equal(own.children.length,1);advance(1);assert.equal(own.children.length,0,'replacement gets its own five seconds');assert.equal(timers.size,0);

show('friend','<img src=x onerror=alert(1)> & hello','world','self');
assert.equal(friend.children[0].textContent,'<img src=x onerror=alert(1)> & hello');assert.equal(friend.children[0].children.length,0,'markup is literal text');
for(const channel of ['party','whisper','system',''])show('friend','Private text',channel,'self');
assert.equal(friend.children[0].textContent,'<img src=x onerror=alert(1)> & hello','non-World messages neither appear nor replace a public message');
show('missing','Not nearby','world','self');show('','No author','world','self');show('self','  ','world','self');assert.equal(timers.size,1);
show('self','😀'.repeat(200),'world','self');assert.equal(Array.from(own.children[0].textContent).length,160);assert.equal(own.children[0].textContent,'😀'.repeat(160),'the text cap does not split an emoji');

hidden.hidden=true;hidden.style.display='none';show('hidden','Still hidden','world','self');
assert.equal(hidden.children[0].parentElement,hidden,'world position and visibility belong to the nameplate');assert.equal(hidden.hidden,true);assert.equal(hidden.style.display,'none','a message never reveals a hidden player');
clear(['friend']);assert.equal(friend.children.length,0);assert.equal(own.children.length,1);assert.equal(hidden.children.length,1);assert.equal(timers.size,2,'erasing one author preserves others');
show('new-character','New character','world','new-character');assert.equal(own.children.length,1,'a reused own-player label still has only one bubble');
clear(['self']);assert.equal(own.children.length,1,'old author cleanup does not erase the new character');
clear();assert.equal(own.children.length,0);assert.equal(hidden.children.length,0);assert.equal(timers.size,0,'world/account cleanup clears every bubble and deadline');advance(5000);
console.log('PASS chat bubbles: World-only own/remote routing, safe bounded text, replacement/expiry, inherited visibility, and author/world/account cleanup.');
