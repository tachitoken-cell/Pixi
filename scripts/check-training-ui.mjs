import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { registerHooks } from 'node:module';
const hook=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const {renderTraining}=await import('../src/training-ui.ts');
const {TRAINER_NPCS,RIDING_LESSONS,MOUNT_PRICES,spellTrainingCost}=await import('../src/training.ts');
const {SPELLS,defaultHotbar,spellsForClass}=await import('../src/spells.ts');
const {starterGear}=await import('../src/progression.ts');
const {renderSpellbook,createHotbarState,placeHotbar}=await import('../src/hotbar.ts');
hook.deregister();
const player={id:'student',level:25,gold:1000,appearance:{className:'Ranger'},ridingRank:0,ownedMounts:[],learnedSpells:['arrow'],hotbar:defaultHotbar('Ranger',25,['arrow']),inventory:{potion:0},talents:[],...starterGear('Ranger')};
const trainer=role=>TRAINER_NPCS.find(n=>n.zone==='greenwood'&&n.role===role);
const button=(html,attribute,value)=>{const found=[...html.matchAll(/<button\b[^>]*>/g)].map(m=>m[0]).find(tag=>tag.includes(`data-${attribute}="${value}"`));assert(found,`${attribute} ${value} exists`);return found;};
const disabled=tag=>/\sdisabled(?:\s|>|=)/.test(tag);
const buttons=html=>[...html.matchAll(/<button\b[^>]*>/g)].map(match=>match[0]);
const rows=html=>buttons(html).filter(tag=>tag.includes('data-training-select='));
const rowIds=html=>rows(html).map(tag=>tag.match(/data-training-select="([^"]+)"/)[1]).sort();
const actions=html=>buttons(html).filter(tag=>/data-(?:learn-spell|learn-riding|buy-mount)=/.test(tag));
function render(student,teacher,selected,options={}){
  const before=JSON.stringify([student,teacher]);
  const html=renderTraining(student,teacher,{selected,...options});
  assert.equal(JSON.stringify([student,teacher]),before,'browsing training never mutates gold, learned abilities or NPC data');
  const choices=rows(html);
  assert(choices.every(tag=>!disabled(tag)&&/aria-pressed="(?:true|false)"/.test(tag)),'locked and learned rows remain selectable with explicit selection state');
  assert(choices.every(tag=>!actions(tag).length),'selecting a list row cannot send a training or purchase action');
  assert.equal(choices.filter(tag=>tag.includes('aria-pressed="true"')).length,choices.length?1:0,'exactly one visible row is selected');
  assert.equal(actions(html).length,choices.length?1:0,'only the selected lesson has an actionable button');
  assert.equal((html.match(/<aside class="training-detail"/g)||[]).length,choices.length?1:0,'desktop and mobile share one selected detail panel');
  if(choices.length)assert.match(html,/<button\b[^>]*data-training-select="[^"]+"[^>]*aria-pressed="true"[^>]*>[\s\S]*?<\/button><aside class="training-detail"/,'the single details node follows the selected row for mobile reading order');
  const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(new Set(ids).size,ids.length,'responsive layouts must not duplicate filter or action IDs');
  return html;
}
for(const lesson of RIDING_LESSONS){
  const role=trainer('riding-trainer'),ready={...player,level:lesson.level,ridingRank:lesson.rank-1,gold:lesson.cost};
  assert(!disabled(button(render(ready,role,`riding-${lesson.rank}`),'learn-riding',lesson.rank)));
  for(const locked of [{...ready,level:lesson.level-1},{...ready,gold:lesson.cost-1},{...ready,ridingRank:lesson.rank}])assert(disabled(button(render(locked,role,`riding-${lesson.rank}`),'learn-riding',lesson.rank)));
  assert(disabled(button(render(ready,role,`riding-${lesson.rank}`,{pending:true}),'learn-riding',lesson.rank)),'pending riding purchase cannot be sent again');
}
assert(disabled(button(render({...player,level:50},trainer('riding-trainer'),'riding-2'),'learn-riding',2)),'expert lessons require apprentice rank');
for(const mount of ['horse','wolf']){
  const ready={...player,ridingRank:1,gold:MOUNT_PRICES[mount]},seller=trainer('mount-seller');
  assert(!disabled(button(render(ready,seller,`mount-${mount}`),'buy-mount',mount)));
  for(const locked of [{...ready,ridingRank:0},{...ready,level:24},{...ready,gold:ready.gold-1},{...ready,ownedMounts:[mount]}])assert(disabled(button(render(locked,seller,`mount-${mount}`),'buy-mount',mount)));
  assert(disabled(button(render(ready,seller,`mount-${mount}`,{pending:true}),'buy-mount',mount)),'pending mount purchase cannot be sent again');
}
for(const className of ['Ranger','Knight','Mage','Cleric']){
  const teacher=TRAINER_NPCS.find(n=>n.className===className),student={...player,appearance:{className},learnedSpells:[]};
  for(const spell of Object.values(SPELLS).filter(s=>s.className===className&&!s.requiredTalent)){
    const ready={...student,level:spell.requiredLevel,gold:spellTrainingCost(spell.id)};
    assert(!disabled(button(render(ready,teacher,spell.id),'learn-spell',spell.id)));
    assert(button(render(ready,teacher,spell.id),'training-select',spell.id).includes('aria-pressed="true"'));
    assert(disabled(button(render({...ready,learnedSpells:[spell.id]},teacher,spell.id),'learn-spell',spell.id)));
    assert(disabled(button(render(ready,teacher,spell.id,{pending:true}),'learn-spell',spell.id)),'pending lessons stay disabled across rendering');
    if(spell.requiredLevel>1){
      assert(disabled(button(render({...ready,level:spell.requiredLevel-1},teacher,spell.id),'learn-spell',spell.id)));
      assert(disabled(button(render({...ready,gold:ready.gold-1},teacher,spell.id),'learn-spell',spell.id)));
    }
  }
}
const student={...player,level:10,gold:25},teacher=trainer('ranger-trainer');
const rangerIds=Object.values(SPELLS).filter(spell=>spell.className==='Ranger'&&!spell.requiredTalent).map(spell=>spell.id);
for(const [filter,expected] of Object.entries({all:rangerIds,available:['hamstring-shot','power-shot'],unavailable:rangerIds.filter(id=>!['arrow','hamstring-shot','power-shot'].includes(id)),learned:['arrow']})){
  const html=render(student,teacher,'arrow',{filter});
  assert.deepEqual(rowIds(html),expected.sort(),`${filter} separates learned, level-locked and unaffordable spells`);
  const counts=Object.fromEntries([...html.matchAll(/data-training-filter="([^"]+)"[^>]*>[^<]*<span>(\d+)<\/span>/g)].map(match=>[match[1],Number(match[2])]));
  assert.deepEqual(counts,{all:rangerIds.length,available:2,unavailable:rangerIds.length-3,learned:1},'filter counts show the full catalog even when a different filter is selected');
  assert(button(html,'training-filter',filter).includes('aria-pressed="true"'),'the active counted filter remains selected');
  for(const action of actions(html))assert(expected.some(id=>action.includes(`data-learn-spell="${id}"`)),'hidden selection cannot leave a stale footer action');
}
const unknown=render(student,teacher,'not-a-lesson');assert(button(unknown,'training-select','hamstring-shot').includes('aria-pressed="true"'),'invalid selection falls back to the first available lesson');
const locked=render(student,teacher,'volley');assert(button(locked,'training-select','volley').includes('aria-pressed="true"'));assert(disabled(button(locked,'learn-spell','volley')),'selected unavailable lessons show requirements without permitting training');
const rider={...player,level:50,ridingRank:1,gold:499};
assert.deepEqual(rowIds(render(rider,trainer('riding-trainer'),'riding-2',{filter:'unavailable'})),['riding-2']);
assert.deepEqual(rowIds(render(rider,trainer('riding-trainer'),'riding-1',{filter:'learned'})),['riding-1']);
assert.deepEqual(rowIds(render({...rider,gold:500},trainer('riding-trainer'),'riding-2',{filter:'available'})),['riding-2']);
const owner={...player,ridingRank:1,ownedMounts:['horse'],gold:100};
assert.deepEqual(rowIds(render(owner,trainer('mount-seller'),'mount-horse',{filter:'learned'})),['mount-horse']);
assert.deepEqual(rowIds(render(owner,trainer('mount-seller'),'mount-wolf',{filter:'unavailable'})),['mount-wolf']);
for(const [p,npc,selected] of [[{...player,learnedSpells:Object.keys(SPELLS).filter(id=>SPELLS[id].className==='Ranger')},teacher,'volley'],[rider,trainer('riding-trainer'),'riding-2'],[owner,trainer('mount-seller'),'mount-wolf']]){
  const empty=render(p,npc,selected,{filter:'available'});
  assert.equal(rows(empty).length,0);assert.equal(actions(empty).length,0,'empty filters expose no stale training command');
  assert([...empty.matchAll(/(<button\b[^>]*>)([\s\S]*?)<\/button>/g)].some(match=>disabled(match[1])&&/Train|Buy mount/.test(match[2])),'empty filters retain a disabled footer action');
}
const wrong=render(player,trainer('mage-trainer'),'fireball',{filter:'available'});assert(!wrong.includes('data-learn-spell'));assert(wrong.includes('data-find-trainer="class"'));
assert(!render({...player,ridingRank:1},trainer('mount-seller')).includes('verdant-revenant'),'rare dungeon mounts never appear at a mount seller');
const html=renderSpellbook(player,player.hotbar);assert(html.includes(`1 / ${spellsForClass('Ranger',true).length} learned`)&&html.includes('Visit your class trainer to learn'));
assert(disabled(button(html,'book-ability','volley')),'eligible but unlearned spells cannot be dragged or assigned');
const saves=[],state=createHotbarState(slots=>{saves.push(slots);return true;});state.sync(player);
assert.equal(state.set(placeHotbar(state.slots,7,'volley')),false);assert.equal(saves.length,0);
state.sync({...player,learnedSpells:['arrow','volley']});assert(state.set(placeHotbar(state.slots,7,'volley')),'training acknowledgement permits assignment');
state.sync({...player,id:'different',learnedSpells:['arrow']});assert(!state.slots.includes('volley'),'switching characters cannot retain another character’s learned spell');
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const pendingHandler=main.slice(main.indexOf("if(trainingPending&&msg.kind==='info'"),main.indexOf("if(msg.kind==='info'&&msg.requestType?.startsWith('store'))"));
for(const [pending,requestType,expected] of [['volley','move','volley'],['volley','learnSpell',null],['riding-1','move','riding-1'],['riding-1','learnRiding',null],['mount-horse','buyMount',null]]){
  const context={trainingPending:pending,msg:{kind:'info',text:'Saving your changes…',requestType}};
  runInNewContext(pendingHandler,context);assert.equal(context.trainingPending,expected,'only a matching purchase rejection clears pending training');
}
console.log('PASS training UI: one selected inline detail/action, unique IDs, counted filters, inspectable locked rows, all classes and prerequisites, pending/empty states, no browsing mutations, wrong-class guidance, and hotbar gating before/after training.');
