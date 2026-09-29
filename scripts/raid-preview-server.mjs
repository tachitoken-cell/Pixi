/** Local, ephemeral mechanic playground. Never imports the game server or account/payment services. */
import { createServer as httpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { registerHooks } from 'node:module';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createVite } from 'vite';

const hook=registerHooks({resolve(specifier,context,next){return next(context.parentURL?.includes('/src/')&&/^\.\/[\w-]+$/.test(specifier)?`${specifier}.ts`:specifier,context);}});
const [{createRaidController},{RAID_BOUNDS,RAID_SUIT_ZONES,raidHazardContains},{rollRaidRewards,raidRewardChanges,newRaidProgress},{starterGear},{newBags},{DEFAULT_APPEARANCE},{SPELLS}]=await Promise.all([
 import('../src/raid-server.mjs'),import('../src/raid.ts'),import('../src/raid-progression.ts'),import('../src/progression.ts'),import('../src/bags.ts'),import('../src/appearance.ts'),import('../src/spells.ts')]);
const {RAID_APPROACH_ROOMS,RAID_APPROACH_EXIT}=await import('../src/raid-approach.ts');
hook.deregister();

export const PREVIEW_MECHANICS=[
 ['full-route','Full raid · all eight rooms','Clear six monster chambers, defeat Morgrath, then face the Apostle. Regroup at each cleared north gate and rally the party onward.'],
 ['lobby','Raid lobby','Twenty ephemeral adventurers: two tanks, four healers, fourteen damage roles. Play starts the pull.'],
 ...RAID_APPROACH_ROOMS.map((room,index)=>[`chamber-${index+1}`,`Chamber ${index+1} · ${room.name}`,'Clear the monster pack, heal and regroup, then approach the north gate to rally onward.']),
 ['morgrath','Morgrath · complete encounter','Defeat Morgrath and the reinforcements he summons at half health. The cleared gate leads to the Apostle.'],
 ['morgrath-cleave','Morgrath · Cleave','Step outside Morgrath’s frontal cone before the cleave lands.'],
 ['morgrath-rift','Morgrath · Rift','Move sideways out of Morgrath’s marked lane.'],
 ['morgrath-rupture','Morgrath · Rupture','Avoid the marked ring before Morgrath ruptures the floor.'],
 ['sermon','Live opening rotation','Watch the real opening schedule. Move to dodge and attack with Quick Shot. Bots assist; your practice damage is boosted.'],
 ['black-claw','Black Claw','Every third Claw becomes a frontal cone and adds a Death Mark. Face it away from the raid.'],
 ['death-marks','Five Death Marks','You begin with four Marks. Take the third Claw to see the fifth execute; turn Practice off to observe death.'],
 ['stars','Death Stars','Marks explode at their locked ground positions after two seconds. Move out of the circles.'],
 ['palms','Death Palms','Palms follow their marked players, then lock one second before impact. Spread before the lock.'],
 ['four-hands','Four Hands of Judgment','Four hands strike around the Apostle. Reach the cyan safe opening before they land.'],
 ['chains','Soul Chains','Tank/healer and damage partners are linked. Separate by twelve meters to break each chain.'],
 ['wings','Shadow Wings','Three lanes sweep the room. Step sideways beyond the lane boundaries.'],
 ['black-sun','Black Sun and crystals','Destroy all four Shadow Crystals within twenty seconds. Success cleanses all Death Marks.'],
 ['harvest','Soul Harvest','Three starting Marks strengthen the real pull. Run away; touching the Apostle executes you.'],
 ['clones','Death Clones','Find crimson eyes and the gold halo gem. Deal two percent of boss health to the real copy within twelve seconds.'],
 ['suits','Judgment of the Four Suits','Find your assigned symbol and reach its matching circle within ten seconds. Success cleanses Marks.'],
 ['death-realm','Death Realm · arena','Break three Soul Shields; four sacrifice seals each need six seconds of occupancy. Bots cover three seals and the other realm.'],
 ['death-realm-shadow','Death Realm · shadow','Guardians are immune until the matching arena Soul Shield falls. Defeat all three before the shared sixty-second deadline.'],
 ['incarnate','Death Incarnate','The final form uses faster attacks, ten-degree safe slices and a ninety-second absolute enrage.'],
 ['wipe','Wipe and reset','A real all-player defeat resets the encounter, restores health, removes combat actors and clears ready states.'],
 ['completion','Completion and all rewards','The real completion and reward code shows all nine rewards with a deterministic showcase roll. Nothing is saved or purchased.'],
].map(([id,label,hint])=>({id,label,hint}));
const clamp=(value,lo,hi)=>Math.min(hi,Math.max(lo,value));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const fields={select:['type','id'],move:['type','x','z'],attack:['type','targetId'],heal:['type'],pause:['type','paused'],practice:['type','enabled'],restart:['type'],plane:['type','plane'],advance:['type']};

export function createRaidPreview(){
 let now=Date.now(),controller,sessions,enemies,hero,team,mechanicId='full-route',paused=true,practice=true,events=[],target=null,attackReady=0,healReady=0,loadedAt=now,lastAssist=0,lastProtected=0;
 const note=text=>{if(events.at(-1)!==text)events.push(text);events=events.slice(-12);};
 const run=()=>controller.bySession(hero);
 const live=s=>!!s?.online;
 function publicPlayer(session){return {...session.player,instanceId:session.instanceId,raidProgress:structuredClone(session.player.raidProgress)};}
 function spawnPlayer(index){
  const className=index===0?'Ranger':index===1?'Knight':index<6?'Cleric':index%2?'Mage':'Ranger';
  return {online:true,recordKey:`preview-${index}`,instanceId:null,player:{id:index?`bot-${index}`:'hero',name:index?`${index<2?'Tank':index<6?'Healer':'Raider'} ${index}`:'You',
   appearance:{...DEFAULT_APPEARANCE,className,race:index%4===0?'elf':'human',outfit:index<6?'#507265':'#665782'},coordinateVersion:2,zone:'hollow',x:0,z:25,rotation:Math.PI,
   hp:1000,maxHp:1000,level:60,xp:0,gold:0,characterCreated:true,...starterGear(className),...newBags(),talents:[],ownedPets:[],ownedMounts:[],ridingRank:0,
   hotbar:['arrow'],learnedSpells:['arrow'],summonedPet:null,petLootMinQuality:'uncommon',abilityCooldowns:{},inventory:{wood:0,crystal:0,potion:0,herb:0,relic:0},carriedItems:{},
   craftingXp:0,contracts:{active:{},completed:{}},skills:{mining:0,woodcutting:0,herbalism:0,fishing:0},gathering:null,quest:{chapter:0,kills:0,crystals:0,completed:false},raidProgress:newRaidProgress()}};
 }
 function damage(enemy,amount){
  if(!enemy?.alive)return 0;const dealt=controller.damageAllowed(enemy,amount,now);enemy.hp=Math.max(0,enemy.hp-dealt);
  if(enemy.hp===0){enemy.alive=false;enemy.diedAt=now;controller.enemyKilled(enemy,now);}return dealt;
 }
 function fresh(){
  sessions=new Map();enemies=[];team=Array.from({length:20},(_,i)=>spawnPlayer(i));hero=team[0];team.forEach(s=>sessions.set(s.player.id,s));
  const localSessions=sessions;
  controller=createRaidController({sessions,enemies,random:()=>.37,live,dirty:()=>{},error:e=>note(e.message),busy:()=>false,canInvite:()=>true,
   eligible:s=>live(s)&&!s.instanceId&&s.player.hp>0,cancel:()=>{},cancelEnemy:e=>{e.attack=null;e.threat.clear();},correct:()=>{},
   event:(s,text)=>{if(s===hero)note(text);},target:(_enemy,group)=>group.find(s=>s.player.id==='hero')||group[0],
   damage:(s,amount,_at,execute)=>{
    const wouldDie=s.player.hp-amount<=0;s.player.hp=Math.max(s===hero&&practice?1:0,s.player.hp-amount);
    if(s===hero&&wouldDie&&practice&&now-lastProtected>1000){lastProtected=now;note(`Practice prevented ${execute?'execution':'death'}; disable Practice to observe lethal damage.`);}
    if(!s.player.hp)s.player.diedAt=now;
   },rollRewards:()=>rollRaidRewards(()=>0),
   award:async(id,_key,runId,plan)=>{const player=localSessions.get(id).player;Object.assign(player,raidRewardChanges(player,runId,plan));return {rewards:player.raidProgress.lastCompletion.rewards,saved:true};},
  });
  controller.handle(hero,{type:'raidCreate'},now);
  for(const bot of team.slice(1)){
   hero.lastRaidInvite=0;controller.handle(hero,{type:'raidInvite',targetId:bot.player.id},now);
   controller.handle(bot,{type:'raidRespond',invitationId:controller.publicInvites(bot)[0].id,accept:true},now);
  }
  team.forEach((s,i)=>controller.handle(s,{type:'raidReady',ready:true,role:i<2?'tank':i<6?'healer':'damage'},now));
  target=null;attackReady=healReady=0;lastAssist=now;lastProtected=0;
 }
 function layout(){
  team.forEach((s,i)=>Object.assign(s.player,{x:i?Math.sin(i/19*Math.PI*2)*18:0,z:i?Math.cos(i/19*Math.PI*2)*18:14,hp:1000,diedAt:0}));
 }
 function quiet(){run().nextClaw=run().nextAbility=now+86400000;run().hazards=[];run().chains=[];}
 function step(milliseconds){now+=milliseconds;controller.tick(now);}
 function threshold(){damage(run().boss,Number.MAX_SAFE_INTEGER);step(1);}
 function reachRoom(index){
  while(controller.publicState(hero).approach.roomIndex<index){
   for(let pass=0;!controller.publicState(hero).approach.cleared;pass++){
    if(pass>12)throw Error('Preview could not clear the approach through the real controller.');
    for(const enemy of [...enemies].filter(e=>e.alive&&e.instanceId===hero.instanceId))damage(enemy,Number.MAX_SAFE_INTEGER);
    step(1);
   }
   Object.assign(hero.player,RAID_APPROACH_EXIT);controller.handle(hero,{type:'raidAdvance'},now);
  }
 }
 function finishSuits(){
  for(const s of team){const zone=RAID_SUIT_ZONES.find(z=>z.suit===run().members.get(s.player.id).suit);Object.assign(s.player,{x:zone.x,z:zone.z});}
  step(10000);
 }
 function realm(){threshold();threshold();finishSuits();threshold();}
 function finishRealm(){
  for(const enemy of enemies.filter(e=>e.raidKind==='shield'))damage(enemy,Number.MAX_SAFE_INTEGER);
  for(const enemy of enemies.filter(e=>e.raidKind==='guardian'))damage(enemy,Number.MAX_SAFE_INTEGER);
  const arena=team.filter(s=>s.instanceId===run().arenaId);run().seals.forEach((seal,i)=>Object.assign(arena[i].player,{x:seal.x,z:seal.z}));
  for(let i=0;i<6;i++)step(1000);
 }
 function switchPlane(plane){
  if(run().phase!=='death-realm')return note('Plane inspection is available during Death Realm.');
  hero.instanceId=plane==='shadow'?run().shadowId:run().arenaId;Object.assign(run().members.get('hero'),{plane});
  Object.assign(hero.player,{x:0,z:15});target=null;
 }
 async function select(id){
  if(!PREVIEW_MECHANICS.some(m=>m.id===id))return note('Choose an available mechanic.');
  mechanicId=id;paused=true;events=[];now=Date.now();fresh();
  if(id==='lobby'){loadedAt=now;note('Local preview only. Play starts the twenty-player raid.');return;}
  controller.handle(hero,{type:'raidStart'},now);
  const room=id==='full-route'?0:id.startsWith('chamber-')?Number(id.slice(8))-1:id.startsWith('morgrath')?6:7;
  reachRoom(room);layout();
  if(room<7){
   const attackIndex={'morgrath-cleave':0,'morgrath-rift':1,'morgrath-rupture':2}[id];
   if(attackIndex!==undefined){run().boss.raidAttackIndex=attackIndex;run().boss.raidNextSpecial=now;step(1);run().boss.raidNextSpecial=now+86400000;}
   loadedAt=lastAssist=now;note(PREVIEW_MECHANICS.find(m=>m.id===id).hint);note('Paused for inspection. Move into position, then Play.');return;
  }
  quiet();
  if(['wings','black-sun','harvest','clones'].includes(id)){threshold();quiet();}
  if(id==='suits'){threshold();threshold();layout();}
  else if(['death-realm','death-realm-shadow','incarnate','completion'].includes(id)){
   realm();layout();
   if(id.startsWith('death-realm'))switchPlane(id==='death-realm'?'arena':'shadow');
   else{finishRealm();threshold();layout();if(id==='completion'){run().startedAt=now-420000;damage(run().boss,Number.MAX_SAFE_INTEGER);controller.tick(now);await controller.flush();}}
  }else if(id==='wipe'){team.forEach(s=>s.player.hp=0);step(1);}
  else if(id==='sermon'){run().nextClaw=now+3000;run().nextAbility=now+7000;}
  else if(id==='black-claw'||id==='death-marks'){
   run().claws=2;run().nextClaw=now;if(id==='death-marks')run().members.get('hero').marks=4;step(1);run().nextClaw=now+86400000;
  }else{
   const index={stars:0,palms:1,'four-hands':2,chains:3,wings:4,'black-sun':5,harvest:6,clones:7}[id];
   if(index!==undefined){
    if(id==='chains'){Object.assign(team[6].player,{x:3,z:14});Object.assign(team[7].player,{x:team[2].player.x+3,z:team[2].player.z});}
    if(id==='black-sun'||id==='harvest')for(const m of run().members.values())m.marks=3;
    run().abilityIndex=index;run().nextAbility=now;step(1);run().nextAbility=now+86400000;
   }
  }
  loadedAt=now;lastAssist=now;note(PREVIEW_MECHANICS.find(m=>m.id===id).hint);note('Paused for inspection. Move into position, then Play.');
 }
 function moveToward(player,point,dt,speed=7){
  const d=distance(player,point);if(d<.001)return;
  const step=Math.min(d,speed*dt);player.rotation=Math.atan2(point.x-player.x,point.z-player.z);player.x+=(point.x-player.x)/d*step;player.z+=(point.z-player.z)/d*step;
 }
 function assistants(dt){
  const current=run(),age=now-loadedAt,cleared=controller.publicState(hero).approach?.cleared;
  for(const bot of team.slice(1)){
   if(bot.player.hp<=0)continue;
   const member=current.members.get(bot.player.id);
   if(current.phase==='suits'){
    const zone=RAID_SUIT_ZONES.find(z=>z.suit===member.suit);if(zone)moveToward(bot.player,zone,dt);
   }else if(current.phase==='death-realm'&&bot.instanceId===current.arenaId){
    const arenaBots=team.slice(1).filter(s=>s.instanceId===current.arenaId),index=arenaBots.indexOf(bot);
    if(index<3||hero.instanceId===current.shadowId&&index===3)moveToward(bot.player,current.seals[index],dt);
   }else if(cleared){
    moveToward(bot.player,{x:(team.indexOf(bot)%5-2)*1.7,z:-22+Math.floor(team.indexOf(bot)/5)*1.5},dt);
   }else if(age>1500&&current.chains.length){
    const chain=current.chains.find(c=>c.firstId===bot.player.id||c.secondId===bot.player.id);
    if(chain){const partner=sessions.get(chain.firstId===bot.player.id?chain.secondId:chain.firstId);const dx=bot.player.x-partner.player.x,dz=bot.player.z-partner.player.z,d=Math.hypot(dx,dz)||1;moveToward(bot.player,{x:clamp(bot.player.x+dx/d*5,-32,32),z:clamp(bot.player.z+dz/d*5,-32,32)},dt);}
   }else if(current.hazards.some(h=>h.impactAt>now&&raidHazardContains(h,bot.player))){
    for(let i=0;i<16;i++){const point={x:bot.player.x+Math.sin(i*Math.PI/8)*6,z:bot.player.z+Math.cos(i*Math.PI/8)*6};if(Math.abs(point.x)<32&&Math.abs(point.z)<32&&!current.hazards.some(h=>h.impactAt>now&&raidHazardContains(h,point))){moveToward(bot.player,point,dt);break;}}
   }
  }
  if(now-lastAssist<1000)return;lastAssist=now;
  for(const bot of team.slice(1))if(bot.player.hp>0)bot.player.hp=Math.min(bot.player.maxHp,bot.player.hp+50);
  if(current.phase==='approach'||current.phase==='morgrath'){
   const enemy=enemies.find(e=>e.alive&&e.instanceId===hero.instanceId);
   if(enemy&&age>3000)damage(enemy,Math.min(enemy.maxHp*.06,2500));
   if(controller.publicState(hero).approach?.cleared)for(const member of team)if(member.player.hp>0)member.player.hp=Math.min(member.player.maxHp,member.player.hp+100);
  }
  if(current.phase==='death-realm'&&age>8000){
   const opposite=hero.instanceId===current.arenaId?'guardian':'shield';
   for(const enemy of enemies.filter(e=>e.alive&&e.raidKind===opposite))damage(enemy,opposite==='guardian'?5000:2500);
  }
 }
 function advance(milliseconds){
  const dt=clamp(milliseconds,0,250)/1000;if(target&&hero.player.hp>0)moveToward(hero.player,target,dt);
  if(paused)return;now+=dt*1000;assistants(dt);controller.tick(now);
 }
 function snapshot(){
  const raid=controller.publicState(hero);
  return {type:'previewState',now,raid,self:publicPlayer(hero),players:team.filter(s=>s.instanceId===hero.instanceId).map(publicPlayer),
   enemies:enemies.filter(e=>e.instanceId===hero.instanceId).map(e=>({id:e.id,kind:e.kind,name:e.name,level:e.level,zone:e.zone,instanceId:e.instanceId,x:e.x,z:e.z,rotation:e.rotation||0,hp:e.hp,maxHp:e.maxHp,alive:e.alive,diedAt:e.diedAt,
    model:e.model,raidVisual:e.raidVisual,raidShielded:e.raidKind==='guardian'&&enemies.some(s=>s.alive&&s.raidKind==='shield'&&s.raidIndex===e.raidIndex),dungeonBoss:e.dungeonBoss,targetId:e.target?.player.id||null,attack:null})),
   mechanicId,paused,practice,events:[...events],mechanics:PREVIEW_MECHANICS,attackRange:SPELLS.arrow.range,attackReadyAt:attackReady,healReadyAt:healReady,
   previewOnly:true,assistance:'Bots dodge, assist chamber fights, heal between rooms, solve suits, occupy other seals and assist the opposite realm. Your Quick Shot damage is boosted to 12,000; normal range and cooldown apply.'};
 }
 async function command(message){
  if(!message||typeof message!=='object'||Array.isArray(message)||!Object.hasOwn(fields,message.type)||Object.keys(message).length!==fields[message.type].length||Object.keys(message).some(k=>!fields[message.type].includes(k)))return note('Invalid preview command.');
  if(message.type==='select')return select(message.id);
  if(message.type==='restart')return select(mechanicId);
  if(message.type==='advance'){controller.handle(hero,{type:'raidAdvance'},now);target=null;lastAssist=loadedAt=now;return;}
  if(message.type==='practice'){if(typeof message.enabled==='boolean')practice=message.enabled;return;}
  if(message.type==='pause'){
   if(typeof message.paused!=='boolean')return;
   if(!message.paused&&run().phase==='forming'){await select('full-route');}paused=message.paused;return;
  }
  if(message.type==='move'){
   if(!Number.isFinite(message.x)||!Number.isFinite(message.z))return;
   target={x:clamp(message.x,RAID_BOUNDS.minX,RAID_BOUNDS.maxX),z:clamp(message.z,RAID_BOUNDS.minZ,RAID_BOUNDS.maxZ)};return;
  }
  if(message.type==='plane'){if(['arena','shadow'].includes(message.plane))switchPlane(message.plane);return;}
  if(message.type==='heal'){
   if(paused)return note('Press Play before healing.');if(hero.player.hp<=0)return note('Restart this mechanic to return after defeat.');if(now<healReady)return;
   healReady=now+5000;hero.player.hp=Math.min(hero.player.maxHp,hero.player.hp+400);note('Preview heal restored up to 400 health.');return;
  }
  if(message.type==='attack'){
   if(paused)return note('Press Play before attacking.');if(hero.player.hp<=0)return note('Restart this mechanic to return after defeat.');if(now<attackReady)return;
   const enemy=enemies.find(e=>e.id===message.targetId&&e.alive&&e.instanceId===hero.instanceId);if(!enemy)return note('Choose a living enemy in your realm.');
   if(distance(hero.player,enemy)>SPELLS.arrow.range)return note(`Move within Quick Shot range (${SPELLS.arrow.range}m).`);
   attackReady=now+SPELLS.arrow.cooldownMs;hero.player.rotation=Math.atan2(enemy.x-hero.player.x,enemy.z-hero.player.z);
   const dealt=damage(enemy,12000);note(dealt?`Quick Shot: ${dealt.toLocaleString()} preview damage to ${enemy.name}.`:enemy.raidKind==='clone'?'False clone: find the crimson eyes and gold halo gem.':'Shielded: complete the encounter objective first.');controller.tick(now);
  }
 }
 fresh();controller.handle(hero,{type:'raidStart'},now);layout();loadedAt=now;note('Local preview only. Play begins the full eight-room route.');
 return {select,command,advance,snapshot};
}

export async function startRaidPreviewServer({port=Number(process.env.RAID_PREVIEW_PORT||5183)}={}){
 if(!Number.isInteger(port)||port<0||port>65535)throw Error('Choose a valid RAID_PREVIEW_PORT.');
 const root=resolve(fileURLToPath(new URL('..',import.meta.url)));let vite;
 const server=httpServer((request,response)=>{
  if(request.url==='/'){response.writeHead(302,{Location:'/raid-preview.html'}).end();return;}
  if(request.url==='/preview-health'){response.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({localOnly:true,ephemeral:true}));return;}
  vite.middlewares(request,response,()=>response.writeHead(404).end());
 });
 vite=await createVite({root,configFile:false,envFile:false,envDir:false,envPrefix:[],appType:'mpa',logLevel:'error',
  plugins:[{name:'raid-preview-no-hmr-client',transformIndexHtml:{order:'post',handler:html=>html.replace(/<script\b[^>]*\bsrc=["']\/@vite\/client["'][^>]*>\s*<\/script>/g,'')}}],
  server:{middlewareMode:true,hmr:false,ws:false,watch:null,cors:false,fs:{strict:true,allow:[root],deny:['**/.env*','**/.git/**','**/data/**','**/players.json*','**/*.pem']}}});
 const wss=new WebSocketServer({noServer:true,maxPayload:2048});
 server.on('upgrade',(request,socket,head)=>{
  const origin=request.headers.origin,address=server.address(),allowed=!origin||origin===`http://127.0.0.1:${address.port}`||origin===`http://localhost:${address.port}`;
  if(request.url!=='/raid-preview-ws'||!allowed){socket.destroy();return;}
  wss.handleUpgrade(request,socket,head,ws=>wss.emit('connection',ws));
 });
 wss.on('connection',socket=>{
  const preview=createRaidPreview();let queue=Promise.resolve(),last=performance.now(),window=last,count=0;
  const send=()=>{if(socket.readyState===WebSocket.OPEN&&socket.bufferedAmount<1_000_000)socket.send(JSON.stringify(preview.snapshot()));};send();
  const timer=setInterval(()=>{const time=performance.now();preview.advance(time-last);last=time;send();},100);
  socket.on('message',raw=>{
   if(performance.now()-window>1000){window=performance.now();count=0;}if(++count>80)return;
   queue=queue.then(async()=>{try{await preview.command(JSON.parse(raw.toString()));send();}catch(error){socket.send(JSON.stringify({type:'previewError',message:error.message}));}});
  });
  socket.on('close',()=>clearInterval(timer));socket.on('error',()=>{});
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return {port:server.address().port,async close(){for(const socket of wss.clients)socket.terminate();await new Promise(resolve=>wss.close(resolve));await vite.close();await new Promise(resolve=>server.close(resolve));}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const preview=await startRaidPreviewServer();console.log(`Raid preview: http://127.0.0.1:${preview.port}/raid-preview.html · local only, ephemeral, no accounts or payments`);
 let closing=false;const stop=()=>{if(closing)return;closing=true;void preview.close().then(()=>process.exit(0));};process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
