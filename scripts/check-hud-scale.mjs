import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';

const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const start=main.indexOf('function normalizeHudScale('),end=main.indexOf('let appearance =',start);
assert(start>=0&&end>start,'HUD size helpers have an extractable startup boundary');
const helpers=stripTypeScriptTypes(main.match(/^function readLocal.*$/m)[0]+'\n'+main.match(/^function saveLocal.*$/m)[0]+'\n'+main.slice(start,end));
const key='mossvale-desktop-hud-scale';
function fixture(saved=null,{readBlocked=false,writeBlocked=false,chatSaved=null}={}){
 const storage=new Map([['mossvale-graphics','unrelated graphics preference']]);if(saved!==null)storage.set(key,saved);if(chatSaved!==null)storage.set('mossvale-desktop-chat-scale',chatSaved);
 const writes=[],toasts=[],properties=new Map(),controls=new Map(['hud-scale-setting','hud-scale-value','hud-scale-reset','chat-scale-setting','chat-scale-value','chat-scale-reset'].map(id=>[id,{value:'',textContent:''}]));
 const context={rememberChatScroll(){},restoreChatScroll(){},$:()=>({classList:{contains:()=>false}}),document:{body:{style:{setProperty:(name,value)=>properties.set(name,value)}}},localStorage:{
  getItem(name){if(readBlocked)throw Error('Storage blocked');return storage.get(name)??null;},
  setItem(name,value){if(writeBlocked)throw Error('Storage blocked');writes.push([name,value]);storage.set(name,value);},
 },toast:message=>toasts.push(message)};
 runInNewContext(helpers,context);
 const root={querySelector:selector=>controls.get(selector.slice(1))};
 context.mountHudScaleSettings(root);context.mountChatScaleSettings(root);
 return {context,storage,writes,toasts,properties,controls,input(value){controls.get('hud-scale-setting').value=value;controls.get('hud-scale-setting').oninput();},reset(){controls.get('hud-scale-reset').onclick();}};
}
const initial=fixture();
assert.equal(initial.properties.get('--hud-scale'),'0.4','new players start at forty percent');
assert.equal(initial.controls.get('hud-scale-setting').value,'40');
assert.equal(initial.controls.get('hud-scale-value').textContent,'40%');
assert.equal(initial.writes.length,0,'startup and opening Settings never write a preference');
for(const saved of ['', '  ', 'not a number', '40%', 'NaN', 'Infinity', '{}', '[]']){
 const view=fixture(saved);assert.equal(view.properties.get('--hud-scale'),'0.4',`invalid saved preference falls back: ${saved}`);assert.equal(view.writes.length,0);
}
for(const value of [null,undefined,false,true,[],{},NaN,Infinity])assert.equal(initial.context.normalizeHudScale(value),40,'unsupported values use the default');
for(const [saved,percent] of [['30',30],['75',75],['100',100],['42',40],['43',45],['57.4',55],['-20',30],['0',30],['999',100]]){
 const view=fixture(saved);assert.equal(view.properties.get('--hud-scale'),String(percent/100));assert.equal(view.controls.get('hud-scale-setting').value,String(percent));assert.equal(view.writes.length,0);
}
const markup=initial.context.renderHudScaleSettings();
assert.match(markup,/class="desktop-hud-settings"/,'CSS can hide the control on touch layouts');
assert.match(markup,/for="hud-scale-setting"[^>]*><span>Hotbar size<\/span>/,'native slider has a visible label');
assert.match(markup,/id="hud-scale-setting"[^>]*min="30"[^>]*max="100"[^>]*step="5"[^>]*aria-describedby="hud-scale-hint"/);
assert.match(markup,/<output id="hud-scale-value" for="hud-scale-setting">40%<\/output>/);
assert.match(markup,/Changes apply immediately and are saved on this device\./);
initial.input('75');
assert.equal(initial.properties.get('--hud-scale'),'0.75','input applies immediately');
assert.equal(initial.controls.get('hud-scale-value').textContent,'75%');
assert.equal(initial.storage.get(key),'75');
assert.equal(initial.storage.get('mossvale-graphics'),'unrelated graphics preference','size changes do not alter graphics preferences');
assert.deepEqual(initial.writes,[[key,'75']]);
assert.equal(fixture(initial.storage.get(key)).properties.get('--hud-scale'),'0.75','a fresh startup restores the saved choice');
initial.context.mountHudScaleSettings({querySelector:selector=>initial.controls.get(selector.slice(1))});
assert.equal(initial.controls.get('hud-scale-setting').value,'75','reopening Settings keeps the chosen value');
assert.equal(initial.writes.length,1,'reopening does not rewrite storage');
initial.reset();
assert.equal(initial.properties.get('--hud-scale'),'0.4');assert.equal(initial.storage.get(key),'40');
assert.equal(initial.controls.get('hud-scale-setting').value,'40');assert.equal(initial.controls.get('hud-scale-value').textContent,'40%');
assert.match(initial.context.renderHudScaleSettings(),/value="40"/,'Reset updates the state used by the next render');
assert.equal(fixture(initial.storage.get(key)).properties.get('--hud-scale'),'0.4','Reset persists across reload');
const blocked=fixture('75',{readBlocked:true,writeBlocked:true});
assert.equal(blocked.properties.get('--hud-scale'),'0.4','blocked storage cannot stop startup');assert.equal(blocked.toasts.length,0);
blocked.input('80');assert.equal(blocked.properties.get('--hud-scale'),'0.8');assert.equal(blocked.controls.get('hud-scale-value').textContent,'80%');
assert.equal(blocked.toasts.length,1,'storage failure uses the existing notice while applying for this session');
blocked.reset();assert.equal(blocked.properties.get('--hud-scale'),'0.4');assert.equal(blocked.controls.get('hud-scale-setting').value,'40');
assert(main.includes('${renderGraphicsSettings()}${renderHudScaleSettings()}${renderChatScaleSettings()}${performanceHud.renderSettings()}'),'size setting is rendered on the existing Graphics page');
assert(main.includes("mountHudScaleSettings($('panel-content'))"),'opening Settings mounts the live controls');
console.log('PASS HUD scale: 40% default, bounded five-percent steps, immediate slider changes, saved/reloaded preference, Reset, malformed/blocked storage, independent graphics preferences, and Settings wiring.');

const chatKey='mossvale-desktop-chat-scale',chat=fixture('65');
assert.equal(chat.properties.get('--chat-scale'),'0.8');
assert.equal(chat.controls.get('chat-scale-setting').value,'80');
assert.equal(chat.writes.length,0);
for(const value of [null,undefined,false,true,[],{},NaN,Infinity,'','  ','invalid'])assert.equal(chat.context.normalizeChatScale(value),80);
for(const [saved,percent] of [['60',60],['125',125],['83',85],['-2',60],['999',125]])assert.equal(fixture(null,{chatSaved:saved}).properties.get('--chat-scale'),String(percent/100));
assert.match(chat.context.renderChatScaleSettings(),/min="60" max="125" step="5"/);
const chatInput=chat.controls.get('chat-scale-setting');chatInput.value='95';chatInput.oninput();
assert.equal(chat.properties.get('--chat-scale'),'0.95');assert.equal(chat.controls.get('chat-scale-value').textContent,'95%');assert.equal(chat.storage.get(chatKey),'95');assert.equal(chat.storage.get(key),'65');
assert.equal(fixture('65',{chatSaved:chat.storage.get(chatKey)}).properties.get('--chat-scale'),'0.95');
chat.controls.get('chat-scale-reset').onclick();assert.equal(chat.storage.get(chatKey),'80');assert.equal(chat.properties.get('--hud-scale'),'0.65');
const unavailable=fixture(null,{readBlocked:true,writeBlocked:true});unavailable.controls.get('chat-scale-setting').value='60';unavailable.controls.get('chat-scale-setting').oninput();assert.equal(unavailable.properties.get('--chat-scale'),'0.6');assert.equal(unavailable.toasts.length,1);
assert(main.includes("mountChatScaleSettings($('panel-content'))"));
console.log('PASS independent chat size: 80% default, 60–125% bounded steps, live input, storage/reload/reset, and unchanged hotbar preference.');
