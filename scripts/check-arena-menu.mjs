import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const hook=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const {renderArenaMenu}=await import('../src/arena-menu.ts');const {arenaWagerAmount}=await import('../src/arena-wager.ts');hook.deregister();
const player={id:'self',name:'Self',x:0,z:0,characterCreated:true};
const near={id:'near',name:'Near',x:2,z:0,level:30,appearance:{className:'Knight'}};
const far={...near,id:'far',name:'Far',x:40};
const options={player,players:[far,player,near],party:null,queue:null,queueReason:size=>size===1?'':`Form a party of exactly ${size}.`,challengeReason:(_p,size)=>size>1?`Lead a party of ${size}.`:'',duelReason:()=>''};
const button=(html,attribute,value)=>html.match(new RegExp(`<button[^>]*${attribute}="${value}"[^>]*>[^<]*`))?.[0];
let html=renderArenaMenu(options);
assert.equal((html.match(/class="arena-finder-bracket"/g)||[]).length,3,'all rated brackets appear together');
assert(!button(html,'data-arena-queue','join').includes('disabled'));
assert.match(html,/Solo/);assert.match(html,/2v2/);assert.match(html,/3v3/);assert.match(html,/1000 <span>MMR/);assert.match(html,/Bronze/);
assert(html.indexOf('data-arena-challenge="near"')<html.indexOf('data-arena-challenge="far"'),'nearby opponents appear first');
assert(!html.includes('data-arena-challenge="self"'),'self is never an opponent');
for(const size of [2,3])assert.match(html,new RegExp(`data-arena-size="${size}"[^>]*disabled[^>]*>${size}v${size}`));
assert(!button(html,'data-arena-duel','near').includes('disabled'),'ordinary Duel stays available');
assert.match(html,/Unrated challenges/);
assert(!html.includes('Win matches to climb'));assert(!html.includes('arena-finder-rules'));assert(!html.includes('Fight here'));
assert.match(html, /id="arena-wager-summary"[^>]*hidden/, 'free challenges do not add helper text');
assert(!html.includes('data-arena-entrance'),'queueing has no arena entrance action');
html=renderArenaMenu({...options,player:{...player,arenaRatings:{'1':{rating:1450,wins:12,losses:4,draws:2},'3':{rating:1820,wins:30,losses:10,draws:0}}}});
assert.match(html,/1450 <span>MMR/);assert.match(html,/Gold/);assert.match(html,/12 wins · 4 losses · 2 draws/);assert.match(html,/Diamond/);
html=renderArenaMenu({...options,players:[player],queue:{joinedAt:1,size:3,rating:1350},queueReason:()=> 'State changed.'});
assert(!button(html,'data-arena-queue','leave').includes('disabled'),'leaving queue remains available despite eligibility changes');
assert.match(html,/Searching · 1350 team MMR/);assert.match(html,/No nearby players/);assert.match(html,/id="arena-bracket-status-3" role="status" aria-live="polite"/);
assert(button(html,'data-arena-queue','join').includes('disabled'),'a pending queue prevents joining another bracket');
assert.match(html,/Form a party/);
for(const party of [{leaderId:player.id,members:[player,near]},{leaderId:near.id,members:[player,near]},{leaderId:player.id,members:[player,near,far]}])assert.match(renderArenaMenu({...options,party}),/Manage party/);
const unsafe=`<img src=x onerror="alert(1)">&'`;
html=renderArenaMenu({...options,players:[player,{...near,id:unsafe,name:unsafe,appearance:{className:unsafe}}],queueReason:()=>unsafe,challengeReason:()=>unsafe,duelReason:()=>unsafe});
assert(!html.includes(unsafe));assert(!html.includes('<img'));assert.match(html,/&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;&amp;&#39;/,'all labels, data attributes and reasons are escaped');

html=renderArenaMenu({...options,wagerMoss:'100'});assert.match(html,/1v1 stake per player \(MOSS\)/);assert.match(html,/100.0 MOSS each · Pot 200.0 · Winner 190.0 · Tax 10.0/);assert.match(html,/MOSS wagers & payouts/);
assert.match(renderArenaMenu({...options,wagerMoss:'0.000000000000000001'}),/Pot 0.000000000000000002 · Winner 0.000000000000000002 · Tax 0.0/,'tax floors to the smallest MOSS unit');
for(const wagerMoss of ['-1','1e3','NaN','1000000','1.1234567890123456789']){
 html=renderArenaMenu({...options,wagerMoss,challengeReason:()=>''});assert(button(html,'data-arena-challenge','near').includes('disabled'));assert.match(html,/data-arena-size="2"[^>]*>2v2/);assert(!button(html,'data-arena-duel','near').includes('disabled'));
}
html=renderArenaMenu({...options,wagerMoss:'100',native:true});assert(!html.includes('id="arena-wager-moss"'));assert(!html.includes('data-arena-wagers'));assert(!button(html,'data-arena-challenge','near').includes('MOSS'));

// Exercise the real main event handler, including state revalidation after render.
const source=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8'),ui=readFileSync(new URL('../src/ui.ts',import.meta.url),'utf8');
const tree=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const functionText=name=>tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(tree);
const listener=(owner,event)=>tree.statements.find(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(tree)===`${owner}.addEventListener`&&n.expression.arguments[0]?.text===event).getText(tree);
const sent=[],notices=[],actions=[],handlers={};let reason='',busy=false,rendered='',wagerInput=null,walletConnections=0;
class Input{hasAttribute(){return false;}constructor(value){this.id='arena-wager-moss';this.value=value;}replaceWith(input){wagerInput=input;}focus(){ctx.document.activeElement=this;}}
const ctx={player,players:options.players,party:null,arenaQueue:null,worldInstance:null,connected:true,entryActive:false,rosterActive:false,
 panel:{open:false,dataset:{mode:'arena'}},lastArenaMenu:'',arenaWagerMoss:'0',arenaWagerAmount,isNativeApp:()=>false,HTMLInputElement:Input,document:{activeElement:null},arenaWagerUI:{open(){},walletReady:()=>true,connect(){walletConnections++;}},ARENA_ENTRANCE:{x:0,z:0},ARENA_ENTRY_RADIUS:12,
 arenaQueueReason:()=>reason,arenaChallengeReason:options.challengeReason,duelChallengeReason:options.duelReason,renderArenaMenu,
 send:m=>sent.push(m),toast:m=>notices.push(m),playerAction:(...args)=>actions.push(args),raidAction:()=>null,raidProgressionAction:()=>null,raid:null,
 stopForSocialUI(){},playerMenu:{close(){}},duelUI:{busy:()=>false},arenaUI:{busy:()=>busy},closePanel(){ctx.panel.open=false;},
 openPanel(_title,_detail,mode){ctx.panel.open=true;ctx.panel.dataset.mode=mode;},replacePanelContent(value){rendered=value;wagerInput=new Input(value.match(/id="arena-wager-moss"[^>]*value="([^"]*)"/)[1]);},
 $:id=>({querySelector:()=>wagerInput,addEventListener:(event,fn)=>handlers[`${id}:${event}`]=fn})};
const execute=code=>runInNewContext(stripTypeScriptTypes(code),ctx);
execute(functionText('renderArenaPanel'));execute(functionText('openArena'));execute(listener("$('panel-content')",'click'));execute(listener("$('panel-content')",'input'));
const click=(dataset,disabled=false)=>{const element={dataset,disabled};handlers['panel-content:click']({target:{closest:()=>element}});return element;};
ctx.openArena();assert(ctx.panel.open);assert.match(rendered,/Rated arena/);
ctx.player={...player,pvp:true,casting:{ability:'strike'},jump:{grounded:false}};ctx.autoAttackTarget='enemy';ctx.panel.open=false;ctx.openArena();assert(ctx.panel.open,'combat, casting and jumping do not block opening the finder');ctx.player=player;
reason='Leave your party to find a solo 1v1 match.';click({arenaQueue:'join',arenaSize:'1'});assert.equal(sent.length,0);assert.equal(notices.at(-1),reason,'stale enabled queue controls revalidate before dispatch');
reason='';const joined=click({arenaQueue:'join',arenaSize:'1'});assert.deepEqual(JSON.parse(JSON.stringify(sent.at(-1))),{type:'arenaQueueJoin',size:1});assert(joined.disabled);assert.equal(ctx.lastArenaMenu,'','pending disable invalidates the render cache');
rendered='';ctx.renderArenaPanel();assert.match(rendered,/data-arena-queue="join"/,'unchanged authoritative snapshot rerenders after rejection, permitting a retry');assert(!button(rendered,'data-arena-queue','join').includes('disabled'));
ctx.arenaQueue={joinedAt:2,size:1,rating:1000};ctx.renderArenaPanel();assert.match(rendered,/data-arena-queue="leave"/);
reason='No longer eligible.';click({arenaQueue:'leave'});assert.equal(sent.at(-1).type,'arenaQueueLeave','leave does not get trapped behind eligibility');
for(const size of [1,2,3]){click({arenaChallenge:'near',arenaSize:String(size)});}
click({arenaDuel:'near'});assert.deepEqual(actions,[['arena1','near','0'],['arena2','near','0'],['arena3','near','0'],['duel','near','0']]);
click({arenaChallenge:'near',arenaSize:'1'},true);assert.equal(actions.length,4,'disabled native controls cannot dispatch');
reason='';ctx.arenaQueue=null;
for(const size of [2,3]){click({arenaQueue:'join',arenaSize:String(size)});assert.deepEqual(JSON.parse(JSON.stringify(sent.at(-1))),{type:'arenaQueueJoin',size});}

assert.match(rendered,/YOUR HIGHEST BRACKET/);
assert.match(renderArenaMenu({...options,player:{...player,arenaRatings:{1:{rating:1450,wins:12,losses:4,draws:2},3:{rating:1820,wins:30,losses:10,draws:0}}}}),/180 MMR to Master/);
assert.match(renderArenaMenu({...options,player:{...player,arenaRatings:{1:{rating:2100,wins:1,losses:0,draws:0}}}}),/Master rank reached/);
const originalInput=wagerInput;originalInput.value='100';originalInput.focus();handlers['panel-content:input']({target:originalInput});
assert.equal(ctx.arenaWagerMoss,'100');assert.equal(wagerInput,originalInput);assert.equal(ctx.document.activeElement,originalInput);assert.match(rendered,/Winner 190.0/);
ctx.players=[player,near];ctx.renderArenaPanel();assert.equal(wagerInput,originalInput);assert.equal(wagerInput.value,'100');assert.equal(ctx.document.activeElement,originalInput,'roster refresh retains native input and focus');
click({arenaChallenge:'near',arenaSize:'1'});assert.deepEqual(actions.at(-1),['arena1','near','100']);
execute(functionText('playerAction'));ctx.playerAction('arena1','near','100');assert.deepEqual(JSON.parse(JSON.stringify(sent.at(-1))),{type:'arenaRequest',targetId:'near',size:1,wagerMoss:'100'});
const gated=sent.length;ctx.arenaWagerUI.walletReady=()=>false;ctx.playerAction('arena1','near','100');assert.equal(sent.length,gated,'MOSS challenge waits for the integrated wallet');assert.equal(walletConnections,1);ctx.arenaWagerUI.walletReady=()=>true;
const before=sent.length;ctx.playerAction('arena1','near','1e3');ctx.playerAction('arena1','near','-1');assert.equal(sent.length,before);
ctx.playerAction('arena1','near');assert.deepEqual(JSON.parse(JSON.stringify(sent.at(-1))),{type:'arenaRequest',targetId:'near',size:1});
ctx.arenaChallengeReason=()=>'';for(const size of [2,3]){ctx.playerAction(`arena${size}`,'near','100');assert.deepEqual(JSON.parse(JSON.stringify(sent.at(-1))),{type:'arenaRequest',targetId:'near',size});}
ctx.playerAction('duel','near','100');assert.deepEqual(JSON.parse(JSON.stringify(sent.at(-1))),{type:'duelRequest',targetId:'near'});
ctx.isNativeApp=()=>true;ctx.playerAction('arena1','near','100');assert.deepEqual(JSON.parse(JSON.stringify(sent.at(-1))),{type:'arenaRequest',targetId:'near',size:1});ctx.isNativeApp=()=>false;
let snapshotPanel;
function visit(node){if(ts.isIfStatement(node)&&node.expression.getText(tree)==="panel.open&&panel.dataset.mode==='arena'"&&node.thenStatement.getText(tree).includes('arenaUI.busy()'))snapshotPanel=node.getText(tree);ts.forEachChild(node,visit);}visit(tree);
assert(snapshotPanel,'actual snapshot handler must reconcile finder visibility with consent state');
assert.match(source,/if\(arena&&arena.phase!=='finished'\)arenaWagerUI.close\(\)/,'entering a funded match closes the wallet panel');
assert.match(source,/const arenaWagerUI=mountArenaWagerUI\(\{send,getPlayer:[^\n]+!player.arenaMatchId&&\(!arena\|\|arena.phase==='finished'\)/,'late funding responses cannot reopen the wallet panel during combat');
ctx.panel.open=true;busy=false;execute(snapshotPanel);assert(ctx.panel.open,'queue wait keeps finder open');busy=true;execute(snapshotPanel);assert(!ctx.panel.open,'incoming ready check closes the blocking modal so Accept is reachable');
assert.match(ui,/<button id="arena-button"[^>]*data-binding-title="u"[^>]*>[\s\S]*?<span>Arena<\/span><kbd data-binding-key="u">U<\/kbd><\/button>/,'persistent Arena button has visible text and discoverable shortcut');
assert.match(source,/\$\('arena-button'\)\.onclick=openArena/);assert.match(listener('window','keydown'),/if\(key==='u'\)\{e.preventDefault\(\);openArena\(\);\}/);
assert.match(functionText('openSettings'),/Both teams return to where they entered afterward/);
const floating=tree.statements.filter(ts.isVariableStatement).flatMap(n=>n.declarationList.declarations).find(n=>n.name.getText(tree)==='floatingPanel');
assert(floating);execute(`var floatingPanel=${floating.initializer.getText(tree)};`);
assert(ctx.floatingPanel('arena'),'Arena uses the same floating-panel behavior as the merchant window');
assert(ctx.floatingPanel('shop'));assert(!ctx.floatingPanel('death'),'adding Arena does not weaken required modal flows');
console.log('PASS Arena finder: three rated brackets and records, concise money/status copy, queue wait/leave/retry, ordinary Duel, all match sizes and reasons, escaping, live dispatch guards, global shortcut and ready-check modal handoff.');
