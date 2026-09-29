import assert from 'node:assert/strict';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';

const hooks = registerHooks({ resolve(specifier, context, next) { return next(context.parentURL?.includes('/src/') && /^\.\/[\w-]+$/.test(specifier) ? `${specifier}.ts` : specifier, context); } });
const { renderGear, renderItemDetails } = await import('../src/character-ui.ts');
const { renderTalents, renderShop } = await import('../src/progression-ui.ts');
const { VILLAGE_NPCS } = await import('../src/settlements.ts');
const { renderSpellbook } = await import('../src/hotbar.ts');
const { starterGear, rollGear } = await import('../src/progression.ts');
const { DEFAULT_APPEARANCE, normalizeAppearance } = await import('../src/appearance.ts');
const { defaultHotbar } = await import('../src/spells.ts');
const { renderBankContents } = await import('../src/bank-ui.ts');
hooks.deregister();

// Load the real stylesheet cascade, including CSS imported by UI modules.
const seen = new Set(), styles = [];
function visit(file) {
  if (seen.has(file) || !existsSync(file)) return;
  seen.add(file);
  const source = readFileSync(file, 'utf8');
  if (file.endsWith('.css')) { styles.push(source); return; }
  for (const [, specifier] of source.matchAll(/^import\s+(?:[^;]*?\s+from\s+)?['"](\.[^'"]+)['"]/gm)) {
    let target = resolve(dirname(file), specifier);
    if (!extname(target)) target += '.ts';
    if (/\.(?:ts|css)$/.test(target)) visit(target);
  }
}
visit(resolve('src/main.ts'));
// CSS imports must precede style rules; quoted font URLs can contain semicolons.
const styleImports = new Set();
const styleRules = styles.join('\n').replace(/@import\b(?:[^;"']|"[^"]*"|'[^']*')*;/g, rule => { styleImports.add(rule); return ''; });
const stylesheet = [...styleImports, styleRules].join('\n');
const player = { id: 'panel-qa', characterCreated: true, name: 'Landscape Adventurer', level: 20, hp: 80, maxHp: 100, gold: 1200, talents: [], inventory: { wood: 2, crystal: 3, herb: 4, potion: 3, relic: 0 }, appearance: normalizeAppearance(DEFAULT_APPEARANCE), ...starterGear('Ranger'),
  ownedBags: [{ id: 'qa-bag', kind: 'linen-pouch' }, ...[1, 2, 3].map(index => ({ id: `qa-pack-${index}`, kind: 'runewoven-holdall' }))], equippedBags: ['qa-bag', 'qa-pack-1', 'qa-pack-2', 'qa-pack-3'],
  carriedItems: { 'trail-bread': 1, 'greater-tonic': 1, 'slime-residue': 1, 'moss-fox': 1, 'treasure-map': 1, 'moss-voucher': 1 } };
const upgradeItem = rollGear('warden-longbow', 'mythic', () => .42).id;
player.ownedGear.push(upgradeItem, 'copper-ring');
const inspectIds = [upgradeItem, 'copper-ring', player.ownedGear[0], 'potion', 'wood', 'bag:qa-bag', ...Object.keys(player.carriedItems).map(id => `item:${id}`)];
const main = readFileSync('src/main.ts', 'utf8'), controls = readFileSync('src/mobile-controls.ts', 'utf8');
const extract = (source, start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert(from >= 0 && to > from, `Missing fixture source boundary: ${start}`);
  return source.slice(from, to);
};
// Nested lists and inspectors may scroll independently. Test reachable controls, not a pinned layout.
const controlRuntime = `${function controlGeometry(button, panel) {
  button.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
  // Fixed/top-layer dialogs escape the document body's clipping context.
  const parents=[];for(let node=button.parentElement;node;node=node.parentElement){parents.push(node);if(node===panel)break;}
  const visible=()=>{
    const p=panel.getBoundingClientRect(),clip={left:Math.max(0,p.left),right:Math.min(innerWidth,p.right),top:Math.max(Number.parseFloat(getComputedStyle(document.body).getPropertyValue('--mobile-vtop'))||0,p.top),bottom:Math.min(innerHeight,p.bottom)};
    for(const node of parents){const style=getComputedStyle(node),r=node.getBoundingClientRect();
      if(/auto|scroll|hidden|clip/.test(style.overflowX)){clip.left=Math.max(clip.left,r.left+node.clientLeft);clip.right=Math.min(clip.right,r.left+node.clientLeft+node.clientWidth);}
      if(/auto|scroll|hidden|clip/.test(style.overflowY)){clip.top=Math.max(clip.top,r.top+node.clientTop);clip.bottom=Math.min(clip.bottom,r.top+node.clientTop+node.clientHeight);}
    }
    for(const header of panel.querySelectorAll('header,.panel-heading'))if(!header.contains(button)&&getComputedStyle(header).position==='sticky'){
      const r=header.getBoundingClientRect(),target=button.getBoundingClientRect();
      if(r.bottom>clip.top&&r.top<clip.bottom&&r.right>target.left&&r.left<target.right)clip.top=Math.max(clip.top,r.bottom);
    }
    return clip;
  };
  for(const node of parents)if(/auto|scroll/.test(getComputedStyle(node).overflowY)&&node.scrollHeight>node.clientHeight){
    const r=button.getBoundingClientRect(),clip=visible();node.scrollTop+=r.top+r.height/2-(clip.top+clip.bottom)/2;
  }
  const r=button.getBoundingClientRect(),clip=visible(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
  return {width:r.width,height:r.height,inside:r.left>=clip.left-.5&&r.right<=clip.right+.5&&r.top>=clip.top-.5&&r.bottom<=clip.bottom+.5,hit:button===hit||button.contains(hit),rect:r.toJSON(),clip};
}};`;
const inventoryRuntime = stripTypeScriptTypes(`
import {renderGear,renderBackpack,renderItemDetails,bagItems,reconcileBagSlots} from '/src/character-ui.ts';
import {preserveItemRollDetails} from '/src/item-tooltip.ts';
import {mountCharacterView as mountLiveCharacterView} from '/src/character-view.ts';
import {loadCharacterAssets} from '/src/characters.ts';
import {deferTouchRender} from '/src/scroll-refresh.ts';
${controlRuntime}
const $=id=>document.getElementById(id), panel=$('panel'), customizer=$('customizer'), canvas=$('world');
const initialPlayer=${JSON.stringify(player)};
let player=structuredClone(initialPlayer), appearance=player.appearance, selectedBagItem=${JSON.stringify(inspectIds[0])}, upgradingBagItem=false, characterView, bagPreview;
let draggedGear='',draggedBag='',draggedItem='',draggedItemPlayer='',gearDragFinish=0,rosterActive=false;
const cancelQueuedShopSales=()=>{};
const closedBagIds=new Set(), itemMenu={update(){},close(){}},hotbar={cancel(){}},lootUI={close(){},displayPlayer:value=>value};
const localization={translate(){}},specialistNftUI={close(){}};
const sent=[],send=message=>sent.push(message);
const disposeBagPreview=()=>{bagPreview=undefined;},showBagPreview=()=>{},disposeCharacterView=()=>{characterView?.dispose();characterView=undefined;};
const mountCharacterView=(stage,player)=>window.fixtureLiveModel?mountLiveCharacterView(stage,player):{update(){},dispose(){},render(){}};
const disposeAtlas=()=>{},disposeCollectionPreview=()=>{},disposeWalletSettings=()=>{},disposeBagBalance=()=>{},watchBagBalance=()=>{},clearMovementKeys=()=>{},cancelGathering=()=>{},setChatExpanded=()=>{},setMobileMenus=()=>{},allowFeature=()=>true,acknowledgeGuide=()=>{},closeCustomizer=()=>customizer.close();
${extract(main, 'const floatingPanel =', 'const mobileOverlayOpen =')}
${main.match(/^function readLocal\([^\n]+/m)[0]}
${main.match(/^function saveLocal\([^\n]+/m)[0]}
${extract(main, "let bagLayoutPlayer=", 'const closedBagIds=')}
${extract(main, 'function clearGearDrag(){', "$('panel-content').addEventListener('drop'")}
${extract(main, 'function closePanel(){', 'function openJournal()')}
${extract(main, 'function toggleBackpack(){', 'function toggleTalents()')}
${extract(main, 'function openCharacter(){', 'let inspectedPlayerId:')}
${extract(main, 'function replacePanelContent(', "$('panel-content').addEventListener('change'")}
${extract(main, 'function selectBagItem(', "let draggedGear=''")}
$('panel-content').addEventListener('click',event=>{const button=event.target.closest('button');if(!button||button.disabled||!player?.characterCreated)return;const data=button.dataset;
${extract(main, " if('closeItem' in data){", " if(panel.dataset.mode==='arena'){")}
${extract(main, " if(data.itemUpgradeMode)", " if(data.equipBag)")}
${main.match(/^ if\('openCharacter' in data\)[^\n]+/m)[0]}
${main.match(/^ if\('closeBag' in data\)[^\n]+/m)[0]}
${extract(main, " else if(data.upgradeGear)", " else if(data.buyGear)").replace(' else if',' if')}});
$('inventory-button').onclick=toggleBackpack;$('customize-button').onclick=toggleCharacter;
${main.match(/\$\('close-panel'\)\.onclick=[^\n]+/)[0]}
${extract(main, 'for(const dialog of [panel,customizer])', "$('hotbar-customize')")}
${extract(main, 'const mobileWindows=', "$('game-menus').append(")}
${extract(controls, 'export function bindTouchActions(', '// Touch has its own pointer set').replace('export ', '')}
bindTouchActions($('play-ui'));
const outerClose=()=>panel.dataset.mode==='inventory'?panel.querySelector('[data-close-bag]'):$('close-panel');
const inspectorEmpty=()=>!selectedBagItem&&!$('bag-item-details')?.querySelector('button,[data-item-more]');
const passiveUpdate=()=>{if(panel.open)panel.dataset.mode==='gear'?renderGearPanel():renderInventory();};
const settle=async()=>{
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 // A reopen during native scroll quiet-time may intentionally defer replacing the old layout.
 const deadline=performance.now()+500;
 while(panel.open&&(inventoryLayout==='list')!==!!$('panel-content').querySelector('.bag-redesign')&&performance.now()<deadline)await new Promise(requestAnimationFrame);
};
const fixtureErrors=[];window.addEventListener('error',event=>fixtureErrors.push(event.message));window.addEventListener('unhandledrejection',event=>fixtureErrors.push(String(event.reason)));
function resetFixture(){closePanel();player=structuredClone(initialPlayer);appearance=player.appearance;selectedBagItem='';upgradingBagItem=false;bagLayoutPlayer='';bagLayout=[];closedBagIds.clear();sent.length=0;openInventory();}
function removeSelected(){
 if(selectedBagItem.startsWith('item:'))delete player.carriedItems[selectedBagItem.slice(5)];
 else if(selectedBagItem.startsWith('bag:')){const id=selectedBagItem.slice(4);player.ownedBags=player.ownedBags.filter(bag=>bag.id!==id);player.equippedBags=player.equippedBags.map(bag=>bag===id?null:bag);}
 else if(Object.hasOwn(player.inventory,selectedBagItem))player.inventory[selectedBagItem]=0;
 else {player.ownedGear=player.ownedGear.filter(id=>id!==selectedBagItem);for(const slot of Object.keys(player.equipment))if(player.equipment[slot]===selectedBagItem)player.equipment[slot]=null;}
 passiveUpdate();
}
function fixtureState(){const content=$('panel-content'),details=$('bag-item-details');return {open:panel.open,display:getComputedStyle(panel).display,mobilePanelOpen:document.body.classList.contains('mobile-panel-open'),mode:panel.dataset.mode,selected:selectedBagItem,upgrading:upgradingBagItem,panelScroll:panel.scrollTop,panelScrollHeight:panel.scrollHeight,panelClientHeight:panel.clientHeight,contentScroll:content.scrollTop,detailsHidden:details?.hidden,emptyPrompt:!!content.querySelector('.bag-empty-detail'),active:document.activeElement?.id||document.activeElement?.getAttribute('data-inspect-item'),close:outerClose()?.getBoundingClientRect().toJSON(),errors:[...fixtureErrors]};}
window.inventoryFixture={state:fixtureState,async action(action){
 if(action==='reset')resetFixture();else if(action==='backpack')toggleBackpack();else if(action==='gear')openCharacter();else if(action==='close')outerClose().click();
 else if(action==='update')passiveUpdate();else if(action==='remove')removeSelected();else if(action==='scroll')panel.scrollTop=panel.scrollHeight;
 else if(action==='upgrade')$('panel-content').querySelector('[data-item-upgrade-mode="upgrade"]')?.click();
 else if(action==='details')$('panel-content').querySelector('[data-item-upgrade-mode="details"]')?.click();
 else if(action==='focus'){$('panel-content').scrollTop=$('panel-content').scrollHeight;[...$('panel-content').querySelectorAll('button')].filter(button=>!button.disabled&&!button.closest('[hidden]')).at(-1)?.focus();}
 else if(action.startsWith('inspect:'))selectBagItem(action.slice(8));
 await settle();return fixtureState();
}};
window.verifyInventory=()=>{
 const failures=[], content=$('panel-content');
 const normal=innerHeight>=320, inside=(r,v)=>r.left>=v.left-.5&&r.right<=v.right+.5&&r.top>=v.top-.5&&r.bottom<=v.bottom+.5;
 const checkLayout=label=>{
  const bounds=panel.getBoundingClientRect(),pack=content.querySelector('.bag-windows'),workspace=content.querySelector('.bag-content-layout'),details=$('bag-item-details');
  if(!pack||!workspace||content.querySelector('.character-sheet')||!pack.getBoundingClientRect().height||getComputedStyle(pack).display==='none')failures.push(label+': standalone backpack workspace disappeared');
  if(content.scrollWidth>content.clientWidth+1)failures.push(label+': horizontal content overflow');
  if(!normal)return;
  if(panel.scrollTop||content.scrollTop||panel.scrollHeight>panel.clientHeight+1||content.scrollHeight>content.clientHeight+1)failures.push(label+': normal action needs outer scrolling');
  if(pack&&pack.clientHeight<44)failures.push(label+': backpack cannot show a full touch target');
  if(selectedBagItem){
   if(!inside(details.getBoundingClientRect(),bounds))failures.push(label+': inspector scrollport outside viewport');
   for(const button of details.querySelectorAll('button')){
    if(button.closest('details:not([open])'))continue;
    const r=button.getBoundingClientRect();if(!r.height||getComputedStyle(button).display==='none')continue;
    if(!button.disabled)button.focus({preventScroll:true});
    const geometry=controlGeometry(button,panel);
    if(!geometry.inside||!button.disabled&&!geometry.hit)failures.push(label+': inspector action unreachable '+button.textContent.trim());
    if(button.classList.contains('primary-button')&&(geometry.width<44||geometry.height<44))failures.push(label+': primary action below 44px '+button.textContent.trim());
   }
   details.scrollTop=0;
  }
 };
 resetFixture();
 for(const id of ${JSON.stringify(inspectIds)}){
  const before=content.scrollTop,grid=content.querySelector('.bag-windows');selectBagItem(id);
  if(content.querySelector('.bag-windows')!==grid)failures.push(id+': selecting an item replaces the backpack');
  if(content.scrollTop!==before)failures.push(id+': selecting an item scrolls the outer screen');
  if(content.textContent.toLowerCase().includes('back to backpack'))failures.push(id+': obsolete back navigation remains');
  checkLayout(id);passiveUpdate();checkLayout(id+' passive update');
  if(selectedBagItem!==id||$('bag-item-details').hidden)failures.push(id+': passive update loses selection');
 }
 selectBagItem(${JSON.stringify(upgradeItem)});
 const more=content.querySelector('[data-item-more]');
 if(more){
  more.open=true;more.querySelector('summary').focus({preventScroll:true});passiveUpdate();
  if(content.querySelector('[data-item-more]')!==more||!more.open)failures.push('passive update closes expanded item details');
  more.open=false;
 }
 selectBagItem('');
 const scroller=content.querySelector('.bag-windows'),frame=content.querySelector('.bag-manager'),frameBox=frame.getBoundingClientRect();
 if(scroller.scrollHeight<=scroller.clientHeight)failures.push('full bags do not exercise backpack scrolling');
 for(const fraction of [0,.5,1]){
  scroller.scrollTop=(scroller.scrollHeight-scroller.clientHeight)*fraction;
  const box=frame.getBoundingClientRect();if(Math.abs(box.top-frameBox.top)>.5||Math.abs(box.bottom-frameBox.bottom)>.5)failures.push('scrolling bags moves their frame');
 }
 const lastSlot=[...scroller.querySelectorAll('[data-storage-slot]')].at(-1),lastBox=lastSlot.getBoundingClientRect(),clip=scroller.getBoundingClientRect();
 if(normal&&!inside(lastBox,clip))failures.push('last bag slot cannot scroll into the backpack');
 scroller.scrollTop=80;const bagScroll=scroller.scrollTop;passiveUpdate();
 if(content.querySelector('.bag-windows').scrollTop!==bagScroll)failures.push('passive update resets backpack scroll');
 selectBagItem(${JSON.stringify(upgradeItem)});
 const mode=content.querySelector('[data-item-upgrade-mode="upgrade"]');
 if(!mode)failures.push('gear lacks inline Upgrade mode');else{
  const grid=content.querySelector('.bag-windows');mode.click();
  if(!upgradingBagItem||!content.querySelector('[data-upgrade-gear]'))failures.push('Upgrade does not reveal the quote and action');
  if(content.querySelector('.bag-windows')!==grid)failures.push('Upgrade mode replaces the backpack');
  checkLayout('upgrade');passiveUpdate();checkLayout('upgrade passive update');
  if(!upgradingBagItem||!content.querySelector('[data-upgrade-gear]'))failures.push('passive update exits Upgrade mode');
  if(!content.querySelector('.gear-upgrade-cost .stat-loss'))failures.push('missing materials are not highlighted');
  const submit=content.querySelector('[data-upgrade-gear]');if(submit&&!submit.disabled)failures.push('insufficient materials allow upgrade');
  content.querySelector('[data-item-upgrade-mode="details"]')?.click();
  if(upgradingBagItem)failures.push('Details does not leave Upgrade mode');
  content.querySelector('[data-item-upgrade-mode="upgrade"]')?.click();selectBagItem('potion');
  if(upgradingBagItem||content.querySelector('[data-upgrade-gear]'))failures.push('new item retains previous Upgrade mode');
 }
 selectBagItem('copper-ring');
 for(const slot of ['ring1','ring2']){
  sent.length=0;content.querySelector('[data-equip-slot="'+slot+'"]')?.click();
  if(JSON.stringify(sent)!==JSON.stringify([{type:'equipGear',itemId:'copper-ring',slot}]))failures.push(slot+': equip action loses item identity or ring destination');
 }
 selectBagItem(${JSON.stringify(upgradeItem)},true);sent.length=0;content.querySelector('[data-upgrade-gear]')?.click();
 if(sent.length)failures.push('disabled upgrade sends a request');
 player.gold=100000;for(const id of Object.keys(player.inventory))player.inventory[id]=1000;passiveUpdate();
 content.querySelector('[data-upgrade-gear]')?.click();
 if(JSON.stringify(sent)!==JSON.stringify([{type:'upgradeGear',gearId:${JSON.stringify(upgradeItem)}}]))failures.push('affordable upgrade does not send the exact rolled gear identity');
 selectBagItem('potion');
 const close=content.querySelector('[data-close-item]');
 if(close){
  close.focus({preventScroll:true});const r=close.getBoundingClientRect(),event=type=>new PointerEvent(type,{bubbles:true,pointerType:'touch',pointerId:1,button:0,clientX:r.x+r.width/2,clientY:r.y+r.height/2});
  close.dispatchEvent(event('pointerdown'));passiveUpdate();
  if(content.querySelector('[data-close-item]')!==close)failures.push('passive update replaces active detail close');
  close.dispatchEvent(event('pointerup'));
  if(!inspectorEmpty())failures.push('touch close retains selected item or actions');
  passiveUpdate();if(!inspectorEmpty()||!$('bag-item-details').classList.contains('is-empty'))failures.push('passive update reopens dismissed item or actions');
 }
 return failures;
};
window.verifyInventoryLifecycle=async()=>{
 const failures=[],content=$('panel-content');
 const reachable=label=>{const close=outerClose();if(!close){failures.push(label+': expected close control missing after render settlement');return;}const r=close.getBoundingClientRect(),p=panel.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);if(r.width<44||r.height<44||r.left<p.left||r.right>p.right||r.top<p.top||r.bottom>p.bottom||!(hit===close||close.contains(hit)))failures.push(label+': outer Close clipped or covered '+JSON.stringify(fixtureState()));};
 const dismiss=async label=>{reachable(label);const close=outerClose();if(!close)return;const r=close.getBoundingClientRect(),event=type=>new PointerEvent(type,{bubbles:true,pointerType:'touch',pointerId:7,button:0,clientX:r.x+r.width/2,clientY:r.y+r.height/2});close.dispatchEvent(event('pointerdown'));passiveUpdate();close.dispatchEvent(event('pointerup'));await settle();if(panel.open||getComputedStyle(panel).display!=='none'||document.body.classList.contains('mobile-panel-open'))failures.push(label+': outer Close failed across passive update');};
 resetFixture();selectBagItem('potion');await dismiss('selected inventory');openInventory();await settle();reachable('reopened inventory');
 if(!panel.open||!content.querySelector('.bag-windows'))failures.push('reopen lost the backpack');
 closePanel();openInventory();await settle();passiveUpdate();reachable('rapid close/reopen');if(!panel.open)failures.push('queued close event closed reopened inventory');
 for(const id of ['item:trail-bread','bag:qa-bag']){
  resetFixture();openCharacter();selectBagItem(id);removeSelected();await settle();
  if(!inspectorEmpty()||!$('bag-item-details').hidden)failures.push(id+': removed Gear selection leaves item actions');
  reachable(id+' removed');toggleBackpack();closePanel();openInventory();await settle();
  if(!inspectorEmpty()||!$('bag-item-details').classList.contains('is-empty'))failures.push(id+': removed selection survived Backpack reopen');
  await dismiss(id+' reopened');
 }
 resetFixture();openCharacter();const equipped=player.equipment.weapon;selectBagItem(equipped);passiveUpdate();
 if(selectedBagItem!==equipped||$('bag-item-details').hidden||content.querySelector('.bag-empty-detail'))failures.push('passive update cleared valid equipped Gear selection');
 await window.inventoryFixture.action('focus');reachable('focus scroll');
 await window.inventoryFixture.action('scroll');reachable('programmatic outer scroll');passiveUpdate();reachable('outer scroll after update');
 closePanel();openInventory();await settle();reachable('reopen after outer scroll');await dismiss('reopen after outer scroll');
 failures.push(...fixtureErrors.map(error=>'runtime error: '+error));resetFixture();await settle();return failures;
};
window.inventoryFixture.ready=(async()=>{
 if(window.fixtureLiveModel){
  const responsive=()=>document.body.classList.toggle('mobile-controls',innerWidth<1000);responsive();window.addEventListener('resize',responsive);
  await loadCharacterAssets();
 }
 resetFixture();await document.fonts.ready;await settle();
 if(window.fixtureLiveModel)requestAnimationFrame(function draw(now){characterView?.render(now/1000);requestAnimationFrame(draw);});
})();
`);
const shopNpcId=VILLAGE_NPCS.find(npc=>npc.role==='merchant').id;
const shopRuntime=stripTypeScriptTypes(`
import {renderShop} from '/src/progression-ui.ts';
import {itemLocked} from '/src/item-locks.ts';
import {bindTouchActions} from '/src/mobile-controls.ts';
${controlRuntime}
const $=id=>document.getElementById(id),panel=$('panel');let player=${JSON.stringify(player)},shopNpcId=${JSON.stringify(shopNpcId)},shopSelected='resource:wood',shopTab='sell',shopFilter='all',shopPage=0,shopQuantity='1',lastShopHTML='',lastMove=0,connected=true,nearby=true;
bindTouchActions($('play-ui'));
const sent=[],send=message=>sent.push(message),nearbyMerchant=()=>nearby?{id:shopNpcId}:null,closePanel=()=>panel.close(),replacePanelContent=html=>$('panel-content').innerHTML=html,worldZone='greenwood',position={x:0,z:0},rotation=0;
const merchantSales=false,toast=()=>{};
${extract(main,'type ShopSale=','function openShop(')}
${extract(main,'function renderShopPanel(){','function replacePanelContent(')}
$('panel-content').addEventListener('change',event=>{const select=event.target;
${extract(main," if(panel.dataset.mode==='shop'&&select instanceof HTMLSelectElement){","\n\n});")}
});
$('panel-content').addEventListener('click',event=>{const button=event.target.closest('button');if(!button||button.disabled)return;const data=button.dataset;
${extract(main," if(panel.dataset.mode==='shop'){"," if(data.trainingSelect")}
${main.match(/^ else if\(data\.sellResource\)[^\n]+/m)[0].replace(' else if',' if')}
});
window.verifyShop=()=>{const failures=[],content=$('panel-content'),bounds=panel.getBoundingClientRect(),inside=r=>r.left>=bounds.left&&r.right<=bounds.right&&r.top>=bounds.top&&r.bottom<=bounds.bottom;
 const check=message=>failures.push(message);
 for(const selector of ['[data-sell-resource="wood"]','#shop-quantity','#shop-filter','[data-shop-tab="sell"]','.shop-pagination button']){const el=content.querySelector(selector);if(!el){check(selector+': action missing');continue;}if(!el.disabled)el.focus({preventScroll:true});const geometry=controlGeometry(el,panel);if(geometry.height<44||geometry.width<44)check(selector+': smaller than 44px');if(!geometry.inside||!el.disabled&&!geometry.hit)check(selector+': not reachable after scrolling');}
 if(content.scrollWidth>content.clientWidth+1)check('shop details extend outside viewport');
 const quantity=$('shop-quantity');quantity.value='all';quantity.dispatchEvent(new Event('change',{bubbles:true}));content.querySelector('[data-sell-resource="wood"]').click();
 if(!sent.some(message=>message.type==='sellResource'&&message.npcId===shopNpcId&&message.resource==='wood'&&message.quantity===player.inventory.wood))check('Sell all loses item, merchant or quantity');
 const count=sent.length;connected=false;content.querySelector('[data-sell-resource="wood"]').click();connected=true;nearby=false;content.querySelector('[data-sell-resource="wood"]').click();nearby=true;if(sent.length!==count)check('disconnected or distant merchant allows sale');
 content.querySelector('[data-shop-tab="buy"]').click();if(shopTab!=='buy'||!content.querySelector('[data-shop-tab="buy"][aria-pressed="true"]'))check('Buy tab does not switch');
 const pages=Number(content.querySelector('[data-shop-page-count]').dataset.shopPageCount);
 if(pages<3)check('pagination fixture needs at least three pages');
 for(const expected of [1,2,1,0]){
  const direction=expected>shopPage?'Next page':'Previous page',selector='[aria-label="'+direction+'"]',button=content.querySelector(selector),r=button.getBoundingClientRect();
  const props={bubbles:true,cancelable:true,pointerId:2,pointerType:'touch',button:0,clientX:r.left+r.width/2,clientY:r.top+r.height/2};
  for(const type of ['pointerdown','pointerup'])button.dispatchEvent(new PointerEvent(type,props));
  // WebViews retarget their native click to the newly rendered page control.
  content.querySelector(selector).dispatchEvent(new PointerEvent('click',{...props,detail:1}));
  if(shopPage!==expected)check('one touch must reach page '+(expected+1)+', got '+(shopPage+1));
 }
 content.querySelector('[data-shop-tab="sell"]').click();shopSelected='resource:wood';renderShopPanel();return failures;
};renderShopPanel();
`);
const fixtures = [
  ['inventory', renderGear(player, upgradeItem)],
  ['gear', renderGear(player)],
  ['talents', renderTalents(player)],
  ['spells', renderSpellbook(player, defaultHotbar('Ranger', 20))],
  ['shop', renderShop(player,shopNpcId,{tab:'sell',selected:'resource:wood'})],
].map(([mode, content]) => ({ mode, selector: '#panel', close: mode==='inventory'?'[data-close-bag]':'.panel-heading .close-button', html: `<dialog open id="panel" class="panel" data-mode="${mode}"><div class="panel-heading"><div><span class="eyebrow" id="panel-eyebrow">YOUR ADVENTURE</span><h2 id="panel-title">${mode}</h2></div><button class="close-button" id="close-panel" aria-label="Close panel">×</button></div><div id="panel-content">${content}</div></dialog>` }));
const bank = { bank: { gear: [], bags: [], items: {}, resources: { wood: 10 } }, revision: 1 };
fixtures.push({ mode: 'bank', selector: '#bank-window', close: '[data-bank-close]', html: `<section id="bank-window">${renderBankContents(player, bank, { tab: 'inventory', selected: '', page: 0, quantity: 1 })}</section>` });
fixtures.push({ mode: 'bag-details', selector: '#bag-item-details', close: '.item-sheet-close', html: `<section class="item-detail" id="bag-item-details" style="position:fixed;inset:auto;margin:0;left:12px;top:calc(var(--mobile-vtop,0px) + 12px);width:calc(100vw - 24px);height:min(220px,calc(var(--mobile-vh,100dvh) - 24px));max-height:none">${renderItemDetails(player, upgradeItem, true)}</section>` });
// Use the actual Store renderer: a tall placeholder misses catalog/footer overlaps.
const storeRuntime = `
import { mountStoreUI } from '/src/store-ui.ts';
${controlRuntime}
const params=new URLSearchParams(location.search);
if(params.get('mode')==='desktop')document.body.className='';
window.__MOSSVALE_NATIVE__=params.get('mode')!=='desktop';
if(params.has('before')){const style=document.createElement('style');style.textContent='@media(min-width:521px) and (max-height:600px){body.mobile-controls #store-window .store-layout{height:300px}}';document.head.append(style);}
const player={id:'store-layout-qa',name:'Layout check',characterCreated:true,appearance:{className:'Ranger'},ownedMounts:[],ownedPets:[],storeOrders:[],storePurchases:[],storeBoosts:{},storeConsumables:{}};
const state={enabled:false,reason:'Local layout check: checkout disabled',wallet:null,owned:[],orders:[],mobile:{apple:false,google:false}};
const trigger=document.createElement('button');trigger.hidden=true;document.body.append(trigger);
const store=mountStoreUI({send:()=>queueMicrotask(()=>store.update(state)),getPlayer:()=>player,allowed:()=>true,trigger,onOpen(){}});
store.open();
const settle=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
function geometry(){const panel=document.querySelector('#store-window'),cards=[...panel.querySelectorAll('[data-store-product]')],footer=panel.querySelector('.store-footer'),layout=panel.querySelector('.store-layout');return{cardCount:cards.length,layoutHeight:layout.getBoundingClientRect().height,lastCardBottom:Math.max(...cards.map(card=>card.getBoundingClientRect().bottom)),footerTop:footer.getBoundingClientRect().top,scrollTop:panel.scrollTop,scrollHeight:panel.scrollHeight,clientHeight:panel.clientHeight,overflow:getComputedStyle(panel).overflowY};}
window.storeFixture={geometry,async category(name){document.querySelector('[data-store-category="'+name+'"]').click();await settle();return geometry();}};
window.verifyStore=async()=>{
 const failures=[],panel=document.querySelector('#store-window');
 for(const category of ['featured','mount','boost','pet','gacha']){
  await window.storeFixture.category(category);panel.scrollTop=0;
  const cards=[...panel.querySelectorAll('[data-store-product]')],footer=panel.querySelector('.store-footer');
  if(!cards.length){failures.push(category+': no real catalog cards');continue;}
  if(Math.max(...cards.map(card=>card.getBoundingClientRect().bottom))>footer.getBoundingClientRect().top+.5)failures.push(category+': cards overlap checkout footer');
  const selected=cards.at(-1);selected.click();await settle();
  if(panel.querySelector('[data-store-product="'+selected.dataset.storeProduct+'"]').getAttribute('aria-pressed')!=='true')failures.push(category+': reward selection failed');
  for(const button of panel.querySelectorAll('.store-footer button,.store-wallet button')){
   if(!button.disabled)button.focus({preventScroll:true});
   const geometry=controlGeometry(button,panel);await settle();
   if(geometry.width<44||geometry.height<44)failures.push(category+': footer control below 44px');
   if(!geometry.inside||!button.disabled&&!geometry.hit)failures.push(category+': footer control unreachable or covered');
  }
  if(panel.scrollWidth>panel.clientWidth+1)failures.push(category+': horizontal overflow');
 }
 await window.storeFixture.category('featured');panel.scrollTop=0;return failures;
};
`;
fixtures.push({mode:'store',selector:'#store-window',close:'header button',html:''});
const friendsRuntime = `
import { mountFriendsUI } from '/src/friends-ui.ts';
const trigger=document.createElement('button');trigger.hidden=true;document.body.append(trigger);
const player=${JSON.stringify(player)},players=Array.from({length:16},(_,index)=>({...player,id:'friend-'+index,name:'Adventurer '+String(index+1).padStart(2,'0'),zone:'greenwood'}));
const friends=mountFriendsUI({trigger,allowed:()=>true,send(){},onOpen(){},onWhisper(){},onInvite(){},onPartyRespond(){},onPartyChat(){},onDungeon(){}});
friends.update({type:'friends',friends:players.map(player=>({...player,className:player.appearance.className,online:true})),ignored:[],incoming:[],outgoing:[]});
friends.updateWho({player,players,party:null,invites:[],lockReason:'Complete your beginner journey to unlock parties.'});
friends.open('who');
window.friendsFixture=friends;
`;
fixtures.push({mode:'friends',selector:'#friends-window',close:'[data-friends-close]',html:''});
// Secondary windows use different headers; stress their shared viewport and sticky-close contract.
for (const name of ['achievements', 'auction', 'trade', 'gm', 'loot']) {
  const heading = name === 'achievements' ? 'achievements-heading' : `${name}-heading`;
  fixtures.push({ mode: name, selector: `#${name}-window`, close: 'header button', html: `<section id="${name}-window"><header class="${heading}"><div><h2>${name}</h2><p>Landscape panel</p></div><button aria-label="Close">×</button></header><div${name === 'auction' ? ' id="auction-body"' : ''}><div style="min-height:700px">Scrollable panel content</div><button>Last action</button></div></section>` });
}
const frameSource = (fixture, liveModel = false) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${stylesheet}</style><body class="mobile-controls mobile-panel-open"><div id="app"></div>${fixture.selector === '#panel' ? `<div id="play-ui"><canvas id="world" tabindex="0"></canvas><button id="inventory-button" hidden>Backpack</button><button id="customize-button" hidden>Character</button>${fixture.html}</div><dialog id="customizer"></dialog>` : fixture.html}${fixture.mode === 'inventory' ? `<script>window.fixtureLiveModel=${liveModel};</script><script type="module">${inventoryRuntime}</script>` : fixture.mode === 'shop' ? `<script type="module">${shopRuntime}</script>` : fixture.mode === 'store' ? `<script type="module">${storeRuntime}</script>` : fixture.mode === 'friends' ? `<script type="module">${friendsRuntime}</script>` : ''}</body>`;
const data = JSON.stringify((process.argv.includes('--shop')?fixtures.filter(f=>f.mode==='shop'):fixtures).map(f => ({ ...f, html: frameSource(f) }))).replace(/</g, '\\u003c');
const html = `<!doctype html><meta charset="utf-8"><title>Mobile panel geometry</title><pre id="result">Running…</pre><iframe id="frame" style="border:0"></iframe><script>
const fixtures=${data}.filter(f=>!new URLSearchParams(location.search).has('shop')||f.mode==='shop'), frame=document.querySelector('#frame'), failures=[], measured=[];
const inside=(a,b)=>a.left>=b.left-.5&&a.top>=b.top-.5&&a.right<=b.right+.5&&a.bottom<=b.bottom+.5;
(async()=>{
for(const [width,height,offset] of [[360,640,0],[390,844,0],[568,320,0],[667,375,0],[844,390,0],[844,210,40]])for(const f of fixtures){
 frame.width=width;frame.height=height;const loaded=new Promise(r=>frame.onload=r);frame.srcdoc=f.html;await loaded;
 const doc=frame.contentDocument, win=frame.contentWindow;
 if(win.inventoryFixture)await win.inventoryFixture.ready;
 await doc.fonts.ready;
 if(offset){doc.body.style.setProperty('--mobile-vh',(height-offset)+'px');doc.body.style.setProperty('--mobile-vtop',offset+'px');}
 const panel=doc.querySelector(f.selector),box=panel.getBoundingClientRect(),close=panel.querySelector(f.close),cb=close.getBoundingClientRect(),auctionBody=panel.querySelector('#auction-body'),content=doc.querySelector('#panel-content')||(auctionBody&&['auto','scroll'].includes(win.getComputedStyle(auctionBody).overflowY)?auctionBody:panel),label=f.mode+' '+width+'×'+height;
 const viewport={left:0,top:offset,right:width,bottom:height};
 if(!inside(box,viewport)||(!['bag-details','gear'].includes(f.mode)&&box.height<height-offset-40))failures.push(label+': panel does not fill available viewport');
 if(!inside(cb,box)||cb.width<44||cb.height<44)failures.push(label+': close button not reachable at 44px');
 if(content.clientHeight<50)failures.push(label+': content height collapsed');
 if(!['inventory','gear','shop'].includes(f.mode)&&!['auto','scroll'].includes(win.getComputedStyle(content).overflowY))failures.push(label+': content cannot scroll');
 if(f.selector==='#panel'&&f.mode!=='talents'&&content.scrollWidth>content.clientWidth+1)failures.push(label+': horizontal content overflow');
 if(f.mode==='shop'){if(typeof win.verifyShop!=='function')failures.push(label+': shop interaction check failed to load');else failures.push(...win.verifyShop().map(failure=>label+': '+failure));}
 if(f.mode==='inventory'){
  if(win.getComputedStyle(panel.querySelector('.bag-currency')).display==='none')failures.push(label+': inventory currency footer hidden');
  for(const cell of panel.querySelectorAll('.bag-slot')){const r=cell.getBoundingClientRect();if(r.width<44||r.height<44)failures.push(label+': bag cell below 44px');}
  const detail=panel.querySelector('#bag-item-details');if(detail&&!detail.hidden&&!detail.classList.contains('is-empty')){const r=detail.getBoundingClientRect();if(r.left<box.left||r.right>box.right)failures.push(label+': item details outside panel');}
  if(typeof win.verifyInventory!=='function')failures.push(label+': inventory interaction check failed to load');
  else failures.push(...win.verifyInventory().map(failure=>label+': '+failure));
  if(typeof win.verifyInventoryLifecycle!=='function')failures.push(label+': inventory lifecycle check failed to load');
  else failures.push(...(await win.verifyInventoryLifecycle()).map(failure=>label+': '+failure));
 }
 if(f.mode==='store'){
  if(typeof win.verifyStore!=='function')failures.push(label+': Store renderer failed to load');
  else failures.push(...(await win.verifyStore()).map(failure=>label+': '+failure));
 }
 if(['friends','achievements','bank','gm','loot','bag-details'].includes(f.mode)){
  const style=win.getComputedStyle(panel),before=win.getComputedStyle(panel,'::before');
  if(style.borderImageSource==='none'||!style.borderImageSlice.includes('fill'))failures.push(label+': scrollport does not paint its own filled frame');
  if(!['none','normal'].includes(before.content)&&before.position==='absolute'&&before.borderImageSource!=='none')failures.push(label+': frame scrolls away with absolute pseudo-element');
 }
 if(f.mode==='bag-details'&&panel.scrollHeight<=panel.clientHeight)failures.push(label+': item details do not exercise scrolling');
 for(const fraction of [0,.5,1]){
  content.scrollTop=(content.scrollHeight-content.clientHeight)*fraction;
  const after=panel.getBoundingClientRect();if(Math.abs(after.top-box.top)>.5||Math.abs(after.bottom-box.bottom)>.5)failures.push(label+': scrolling moves panel bounds');
  if(!inside(panel.querySelector(f.close).getBoundingClientRect(),box))failures.push(label+': close button lost at scroll fraction '+fraction);
 }
 if(f.mode==='friends'){
  for(const tab of ['who','friends']){
   win.friendsFixture.open(tab);
   if(panel.querySelectorAll('.friend-row').length!==16)failures.push(label+': '+tab+' did not render all adventurers');
   if(panel.scrollHeight<=panel.clientHeight)failures.push(label+': '+tab+' does not exercise scrolling');
   for(const fraction of [0,.5,1]){
    panel.scrollTop=(panel.scrollHeight-panel.clientHeight)*fraction;
    if(!inside(panel.querySelector(f.close).getBoundingClientRect(),box))failures.push(label+': '+tab+' close lost at scroll fraction '+fraction);
   }
   for(const button of [[...panel.querySelectorAll('.friend-row')].at(-1),...panel.querySelectorAll(tab==='who'?'[data-open-dungeon]':'.friends-add button')]){
    const rect=button.getBoundingClientRect(),header=panel.querySelector('header').getBoundingClientRect(),bottom=box.top+panel.clientTop+panel.clientHeight;
    panel.scrollTop+=rect.top+rect.height/2-(header.bottom+bottom)/2;
    const target=button.getBoundingClientRect(),hit=doc.elementFromPoint(target.x+target.width/2,target.y+target.height/2);
    const clipped=button.classList.contains('friend-row')?target.y+target.height/2 < header.bottom||target.y+target.height/2>bottom:target.top < header.bottom-.5||target.bottom>bottom+.5;
    if(clipped||!button.contains(hit))failures.push(label+': '+tab+' last row/action unreachable');
   }
  }
 }
 content.scrollTop=content.scrollHeight;
 if(!inside(panel.querySelector(f.close).getBoundingClientRect(),box))failures.push(label+': close button lost after content scroll');
 measured.push({mode:f.mode,width,height,panelHeight:box.height,contentHeight:content.clientHeight});
}
document.querySelector('#result').textContent=JSON.stringify({pass:!failures.length,failures,measured});
})().catch(error=>{document.querySelector('#result').textContent=JSON.stringify({pass:false,failures:[...failures,String(error.stack||error)],measured});});
</script>`;
mkdirSync('artifacts/mobile-hud', { recursive: true });
const fixturePath = resolve('artifacts/mobile-hud/panels.html');
writeFileSync(fixturePath, html);
const storeControls = `<details id="store-checks" open style="position:fixed;z-index:1000;left:12px;bottom:12px;max-width:calc(100vw - 24px);padding:8px;background:#edf1eb;color:#172c23;border:1px solid #172c23;font:12px system-ui"><summary>Local layout checks</summary><button id="run-store-checks" style="min-height:44px">Run Store checks</button><pre id="store-check-result" style="max-height:40vh;overflow:auto;white-space:pre-wrap"></pre></details><script>
document.querySelector('#run-store-checks').onclick=async()=>{const controls=document.querySelector('#store-checks'),result=document.querySelector('#store-check-result');controls.style.visibility='hidden';try{const failures=await window.verifyStore();result.textContent=JSON.stringify({pass:!failures.length,failures,geometry:window.storeFixture.geometry()},null,2);}catch(error){result.textContent=String(error);}finally{controls.style.visibility='visible';}};
</script>`;
writeFileSync(resolve('artifacts/mobile-hud/store.html'),frameSource(fixtures.find(f=>f.mode==='store')).replace('</body>',storeControls+'</body>'));
const interactive = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Inventory lifecycle fixture</title><style>body{margin:16px;font:14px system-ui;background:#edf1eb;color:#172c23}nav{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}button,select{min-height:36px;font:inherit}iframe{display:block;border:1px solid #172c23}pre{white-space:pre-wrap;max-width:850px}h1{font-size:20px}</style><h1>Inventory lifecycle · local fixture</h1><p>Uses the real inventory renderers and panel handlers. No game server or account connection.</p><label>Viewport <select id="viewport"><option value="1280,800">1280 × 800 desktop</option><option value="568,320">568 × 320 landscape</option><option value="844,390">844 × 390 landscape</option><option value="390,844">390 × 844 portrait</option></select></label><nav>${[['reset','Reset'],['backpack','Backpack'],['gear','Character'],['inspect:'+upgradeItem,'Inspect gear'],['upgrade','Upgrade mode'],['details','Item details'],['inspect:potion','Inspect potion'],['inspect:item:trail-bread','Inspect food'],['inspect:bag:qa-bag','Inspect bag'],['remove','Remove selected item'],['update','Passive update'],['focus','Focus last control'],['scroll','Scroll outer panel'],['close','Close panel'],['check','Run lifecycle checks']].map(([action,label])=>`<button data-action="${action}">${label}</button>`).join('')}</nav><iframe id="frame" width="1280" height="800" title="Mobile game inventory"></iframe><pre id="state">Loading real inventory modules…</pre><script>
const frame=document.querySelector('#frame'),state=document.querySelector('#state');
frame.onload=async()=>{const fixture=frame.contentWindow.inventoryFixture;if(fixture){await fixture.ready;state.textContent=JSON.stringify(fixture.state(),null,2);}else state.textContent='Fixture module failed to load. Serve this file through Vite.';};
frame.srcdoc=${JSON.stringify(frameSource(fixtures[0], true)).replace(/</g, '\\u003c')};
document.querySelector('#viewport').onchange=event=>{const [width,height]=event.target.value.split(',');frame.width=width;frame.height=height;};
document.querySelector('nav').onclick=async event=>{const action=event.target.closest('[data-action]')?.dataset.action;if(!action)return;try{state.textContent=JSON.stringify(action==='check'?{failures:await frame.contentWindow.verifyInventoryLifecycle(),state:frame.contentWindow.inventoryFixture.state()}:await frame.contentWindow.inventoryFixture.action(action),null,2);}catch(error){state.textContent=error.stack;}};
</script>`;
writeFileSync(resolve('artifacts/mobile-hud/inventory-lifecycle.html'), interactive);
writeFileSync(resolve('artifacts/mobile-hud/inventory.html'), frameSource(fixtures[0], true));
writeFileSync(resolve('artifacts/mobile-hud/friends.html'), frameSource(fixtures.find(f=>f.mode==='friends')));
writeFileSync(resolve('artifacts/mobile-hud/bag-details.html'), frameSource(fixtures.find(f=>f.mode==='bag-details')));
assert(fixtures.slice(0, 5).every(fixture => fixture.html.includes('<button')));
if(!process.argv.includes('--browser'))console.log(`PASS: rendered panel fixtures. Serve through Vite: artifacts/mobile-hud/panels.html runs ${(process.argv.includes('--shop')?1:fixtures.length) * 6} geometry cases plus real inventory lifecycle and touch/update checks; artifacts/mobile-hud/inventory-lifecycle.html is interactive; artifacts/mobile-hud/inventory.html renders the real character model for viewport screenshots. This command does not launch a browser or report browser assertions as passed.`);

// Opt in when Chrome/Playwright is available; the standard native check still generates the review fixture.
if(process.argv.includes('--browser')){
 const {createServer}=await import('vite');
 const server=await createServer({configFile:false,root:resolve('.'),esbuild:{tsconfigRaw:readFileSync('tsconfig.json','utf8')},server:{host:'127.0.0.1',port:0,hmr:false,watch:{ignored:['**/*']}}});
 let browser;
 try{
  await server.listen();
  const {chromium}=await import(process.env.MOSSVALE_PLAYWRIGHT||'playwright');
  browser=await chromium.launch({headless:true,...(process.env.MOSSVALE_CHROME?{executablePath:process.env.MOSSVALE_CHROME}:{})});
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/artifacts/mobile-hud/panels.html`);
  await page.waitForFunction(()=>document.querySelector('#result')?.textContent.startsWith('{'),null,{timeout:120000});
  const result=JSON.parse(await page.locator('#result').innerText());
  writeFileSync(resolve('artifacts/mobile-hud/panel-results.json'),JSON.stringify({...result,errors},null,2)+'\n');
  assert.deepEqual(errors,[],'generated fixtures run without uncaught browser errors');
  assert.deepEqual(result.failures,[],'mobile controls remain reachable through scrolling, focus and refresh');
  assert(result.pass);console.log(`PASS: ${result.measured.length} actual-browser mobile panel cases, standalone inventory/inspector lifecycle, 44px controls, nested scrolling, shop authority and Store selection. No screenshots taken.`);
 }finally{await browser?.close();await server.close();}
}
