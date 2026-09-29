import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import postcss from 'postcss';
const hook=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const { renderHotbar, renderSpellbook }=await import('../src/hotbar.ts');
const { SPELLS, defaultHotbar }=await import('../src/spells.ts');
const { starterGear }=await import('../src/progression.ts');
hook.deregister();
const art=postcss.parse(readFileSync(new URL('../src/art.css',import.meta.url),'utf8'));
const hotbar=postcss.parse(readFileSync(new URL('../src/hotbar.css',import.meta.url),'utf8'));
const declarations=selector=>{const values={};hotbar.walkRules(rule=>{if(rule.selector===selector)rule.walkDecls(declaration=>values[declaration.prop]=declaration.value);});return values;};
// Protect the concrete cascade bug: legacy mobile span rules were imposing a
// minimum text height on the independent cooldown shade as well as its label.
art.walkRules(rule=>assert(!rule.selector.split(',').some(selector=>selector.trim()==='.action > span:not(.item-art)'), 'legacy generic action text must exclude hotbar labels and overlays'));
const labels=declarations('.hotbar-slot > .hotbar-name');
assert.equal(labels['-webkit-line-clamp'],'2');assert.equal(labels.overflow,'hidden');assert.equal(labels['min-height'],'0');
const desktop=declarations('#hotbar .hotbar-slot, .hotbar-editor-slots .hotbar-slot');
const mobile=declarations('#hotbar .hotbar-slot');
assert.equal(desktop.display,'grid');assert.equal(desktop['grid-template-columns'],'minmax(0,1fr)');assert.equal(desktop['justify-content'],'normal','legacy flex-end alignment must not push the slot grid right');
for(const rule of [desktop,{...desktop,...mobile}]){
 const rows=rule['grid-template-rows'].split(' ').map(parseFloat);
 assert.equal(rows.length,2);assert(rows.every(Number.isFinite));
 assert(rows.reduce((sum,row)=>sum+row,0)+2*parseFloat(rule.padding)+parseFloat(rule.gap)+2<=parseFloat(rule.height), 'icon, two-line label, gap, padding and border fit the slot');
 assert(parseFloat(rule.height)>=44);
}
assert.equal(declarations('.hotbar-slot .hotbar-shade').position,'absolute');
assert.equal(declarations('.hotbar-slot .hotbar-shade')['min-height'],'0');
assert.equal(declarations('.hotbar-slot .hotbar-cooldown').position,'absolute');
assert.equal(declarations('.hotbar-slot .hotbar-count')['text-overflow'],'ellipsis');
const cssImports=[...readFileSync(new URL('../src/main.ts',import.meta.url),'utf8').matchAll(/import '\.\/([^']+\.css)'/g)].map(([,file])=>`<style>${readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8')}</style>`).join('');
const fixtures={};
for(const className of ['Ranger','Knight','Mage'])for(const stress of [false,true]){
 const player={id:className,name:'WWWWWWWWWWWWWWWWWWWW',level:20,talents:[],appearance:{className},inventory:{potion:stress?123456789:3},...starterGear(className)};
 const slots=defaultHotbar(className, 20),spell=SPELLS[slots[0]],original=spell.label;
 if(stress)spell.label='Unusually long ability name for an overflow check';
 try {
  const hud=renderHotbar(slots,player),book=renderSpellbook(player,slots);
  for(const [,tag,name] of hud.matchAll(/(<button\b[^>]*>).*?<span class="hotbar-name">([^<]+)<\/span>/g))assert(tag.includes(`title="${name} · Key`)&&tag.includes(name),'clamped labels retain their complete title and accessible name');
  assert.equal((hud.match(/data-hotbar-slot=/g)||[]).length,10);
  fixtures[`${className}-${stress}`]=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">${cssImports}<body><dialog open class="panel" id="panel" data-mode="spells"><header class="panel-heading"><div><span class="eyebrow">SPELLS &amp; ABILITIES</span><h2>${stress?player.name:'Your spellbook'}</h2></div><button class="close-button" aria-label="Close">×</button></header><div id="panel-content">${book}</div></dialog><div class="bottom-center"><div id="hotbar" class="actionbar">${hud}</div></div></body>`;
 }finally{spell.label=original;}
}
const serialized=JSON.stringify(fixtures).replace(/</g,'\\u003c');
const html=`<!doctype html><meta charset="utf-8"><title>Mossvale menu overflow fixture</title><style>body{margin:16px;background:#16251f;color:#eee8ce;font:14px sans-serif}header{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:12px}label{display:flex;gap:6px;align-items:center}button,select{font:inherit;min-height:36px}iframe{display:block;border:1px solid #a89965;background:#829785}#result{white-space:pre-wrap;line-height:1.5}</style><header><strong>Menu overflow QA fixture</strong><label>Viewport<select id="viewport"><option value="1280,720">1280 × 720</option><option value="390,740">390 × 740</option><option value="320,740">320 × 740</option></select></label><label>Calling<select id="calling"><option>Ranger</option><option>Knight</option><option>Mage</option></select></label><label><input type="checkbox" id="stress" checked>Long labels and large counts</label><button id="check">Check geometry</button></header><p>Uses the actual hotbar renderers and the game's stylesheet order. This is an isolated UI fixture, not gameplay.</p><pre id="result" role="status"></pre><iframe id="frame" title="Mossvale menus"></iframe><script>
const fixtures=${serialized},frame=document.querySelector('#frame'),result=document.querySelector('#result');
function load(){const [width,height]=document.querySelector('#viewport').value.split(',');frame.width=width;frame.height=height;frame.srcdoc=fixtures[document.querySelector('#calling').value+'-'+document.querySelector('#stress').checked];result.textContent='Loading styles…';}
function check(){const doc=frame.contentDocument,win=frame.contentWindow,failures=[];let checked=0;const inside=(a,b)=>a.left>=b.left-.6&&a.right<=b.right+.6&&a.top>=b.top-.6&&a.bottom<=b.bottom+.6;
for(const slot of doc.querySelectorAll('.hotbar-slot')){const box=slot.getBoundingClientRect(),label=slot.querySelector('.hotbar-name'),art=slot.querySelector('.item-art,.hotbar-empty'),name=label.getBoundingClientRect(),picture=art.getBoundingClientRect(),key=slot.querySelector('kbd').getBoundingClientRect();checked++;if(!inside(name,box)||!inside(picture,box)||!inside(key,box))failures.push(slot.title+': a label, icon or key escaped its slot');if(Math.abs((name.left+name.right)/2-(box.left+box.right)/2)>.6||Math.abs((picture.left+picture.right)/2-(box.left+box.right)/2)>.6)failures.push(slot.title+': label or icon is off-center');if(picture.bottom>name.top+.6)failures.push(slot.title+': icon and label overlap');if(box.width<43.5||box.height<43.5)failures.push(slot.title+': touch target is too small');if(win.getComputedStyle(label).webkitLineClamp!=='2')failures.push(slot.title+': two-line clamp was overridden');if(slot.querySelector('.hotbar-shade').getBoundingClientRect().height>.5)failures.push(slot.title+': empty cooldown shade has an inherited height');const count=slot.querySelector('.hotbar-count');if(count&&!inside(count.getBoundingClientRect(),box))failures.push('Potion count escaped slot');}
for(const node of doc.querySelectorAll('.panel-heading,.hotbar-editor,.spell-choice,.primary-button'))if(node.scrollWidth>node.clientWidth+1)failures.push(node.className+': horizontal content overflow');result.textContent=failures.length?'FAIL\\n'+failures.join('\\n'):'PASS · '+checked+' live slots; labels/icons/keys contained, no label overlap, two-line clamp, zero-height idle shade, menu controls fit.';}
frame.addEventListener('load',()=>frame.contentDocument.fonts.ready.then(check));document.querySelectorAll('select,input').forEach(control=>control.addEventListener('change',load));document.querySelector('#check').addEventListener('click',check);load();
</script>`;
const directory=new URL('../artifacts/',import.meta.url);mkdirSync(directory,{recursive:true});writeFileSync(new URL('menu-overflow.html',directory),html);
console.log('PASS: hotbar renderer accessibility, actual CSS cascade and slot height budgets. Browser fixture written to artifacts/menu-overflow.html; open through the dev server and use Check geometry.');
