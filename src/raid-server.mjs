import { randomUUID } from 'node:crypto';
import { APOSTLE_RAID, RAID_START, RAID_SUITS, RAID_SUIT_ZONES, raidHazardContains } from './raid.ts';
import { RAID_APPROACH_MONSTERS, RAID_APPROACH_ROOMS, RAID_APPROACH_EXIT, RAID_APPROACH_GATE_RANGE, RAID_APPROACH_TOTAL_ROOMS, raidApproachRoomName } from './raid-approach.ts';

const fighting = run => !['forming', 'wiped', 'completed'].includes(run.phase);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const roles = ['tank', 'healer', 'damage'];
const fields = { raidCreate:['type'], raidStart:['type'], raidLeave:['type'], raidAdvance:['type'], raidInvite:['type','targetId'], raidKick:['type','targetId'], raidCoLeader:['type','targetId'],
  raidRespond:['type','invitationId','accept'], raidReady:['type','ready','role'] };

/** Private raids reuse the realm's combat actors; all scheduling and roster decisions stay server-side. */
export function createRaidController(ctx) {
  const runs = new Map(), membership = new Map(), instances = new Map(), invitations = new Map();
  const bySession = session => membership.get(session?.player.id);
  const byInstance = id => instances.get(id);
  const plane = (run, id) => id === run.shadowId ? 'shadow' : 'arena';
  const members = run => [...run.members.values()];
  const present = run => members(run).map(member => ctx.sessions.get(member.id)).filter(session => session && ctx.live(session) && byInstance(session.instanceId) === run);
  const manages = (run, id) => run.leaderId === id || run.coLeaderId === id;
  function chooseLeader(run) {
    const online = present(run);
    if (!online.some(session => session.player.id === run.leaderId))
      run.leaderId = online.find(session => session.player.id === run.coLeaderId)?.player.id || online[0]?.player.id || (run.members.has(run.leaderId) ? run.leaderId : members(run)[0]?.id);
    if (run.coLeaderId === run.leaderId || !run.members.has(run.coLeaderId)) run.coLeaderId = null;
  }
  const alive = (run, layer) => present(run).filter(session => session.player.hp > 0 && (!layer || plane(run, session.instanceId) === layer));
  const actor = (run, kind) => ctx.enemies.find(enemy => enemy.raidId === run.id && enemy.raidKind === kind && enemy.alive);
  const roomActors = run => ctx.enemies.filter(enemy=>enemy.raidId===run.id&&enemy.alive&&['approach','morgrath'].includes(enemy.raidKind));
  const tell = (run, message) => { run.objective = message; for (const session of present(run)) ctx.event(session, message); };
  const removeActors = (run, kinds) => {
    for (let index = ctx.enemies.length - 1; index >= 0; index--) {
      const enemy = ctx.enemies[index];
      if (enemy.raidId !== run.id || kinds && !kinds.includes(enemy.raidKind)) continue;
      ctx.cancelEnemy(enemy); ctx.enemies.splice(index, 1);
    }
  };
  function move(session, run, layer, point, reason) {
    ctx.cancel(session); session.instanceId = layer === 'shadow' ? run.shadowId : run.arenaId;
    Object.assign(session.player, point, { zone:'hollow', rotation:Math.PI });
    const member = run.members.get(session.player.id); member.plane = layer; member.point = { x:point.x, z:point.z };
    ctx.correct(session, reason);
  }
  function addMember(run, session) {
    const p = session.player;
    const member = { id:p.id, recordKey:session.recordKey, name:p.name, className:p.appearance.className, level:p.level, role:p.appearance.className === 'Cleric' ? 'healer' : p.appearance.className === 'Knight' ? 'tank' : 'damage', ready:false,
      plane:'arena', marks:0, hp:p.hp, maxHp:p.maxHp, point:{...RAID_START}, returnPosition:{standingPosition:p.standingPosition,x:p.x,z:p.z,rotation:p.rotation,zone:p.zone} };
    run.members.set(p.id, member); membership.set(p.id, run); session.returnPosition = {...member.returnPosition};
    move(session, run, 'arena', { x:(run.members.size % 5 - 2) * 2.4, z:25 - Math.floor((run.members.size - 1) / 5) * 2.4 }, 'Entered the Apostle raid lobby.');
  }
  function spawn(run, raidKind, point, hp, name, layer = 'arena', index = 0) {
    const enemy = { id:`${run.runId}-${raidKind}-${index}-${randomUUID()}`, raidId:run.id, raidKind, raidIndex:index, raidRoom:run.roomIndex,
      raidVisual:raidKind === 'boss' ? 'apostle' : raidKind, ...(raidKind==='boss'?{model:'horned-apostle'}:raidKind==='clone'?{model:'apostle-clone'}:{}), level:60, kind:'root-warden', name, dungeonBoss:true,
      zone:'hollow', instanceId:layer === 'shadow' ? run.shadowId : run.arenaId, ...point, homeX:point.x, homeZ:point.z,
      hp:Math.round(hp), maxHp:Math.round(hp), damageScale:.4, alive:true, diedAt:0, respawnAt:Infinity, lastAttack:0,
      rotation:0, attack:null, participants:new Set(), threat:new Map(), target:null };
    ctx.enemies.push(enemy); return enemy;
  }
  function hazard(run, kind, point, r, warning, damage, extra = {}) {
    const now = extra.now ?? run.now;
    const entry = { id:randomUUID(), kind, label:kind, plane:'arena', shape:'circle', x:point.x, z:point.z, r,
      startedAt:now, impactAt:now + warning, endsAt:now + warning + 600, damage, mark:true, ...extra };
    delete entry.now; run.hazards.push(entry); return entry;
  }
  function kill(session, message, at) {
    ctx.damage(session, session.player.hp + (session.shield?.amount || 0), at, true);
    ctx.event(session, message);
  }
  function hit(run, session, fraction, mark, at, source) {
    if (session.player.hp <= 0 || !ctx.live(session)) return;
    ctx.damage(session, Math.max(1, Math.round(session.player.maxHp * fraction)), at, false, source);
    const member = run.members.get(session.player.id);
    if (mark && session.player.hp > 0 && ++member.marks >= APOSTLE_RAID.markLimit) kill(session, 'Five Death Marks: Death’s Presence claims you.', at);
  }
  function clearMechanics(run) {
    run.hazards = []; run.chains = []; run.sun = null; run.harvest = null; run.clone = null; run.seals = [];
    removeActors(run, ['crystal','clone','shield','guardian']);
    for (const member of members(run)) delete member.suit;
  }
  function wipe(run, reason, now) {
    if (!fighting(run)) return;
    run.phase = 'wiped'; run.phaseEndsAt = 0; run.enrageEndsAt = 0; run.wipes++;
    run.roomIndex=run.checkpoint;run.roomCleared=false;
    clearMechanics(run); removeActors(run); run.boss = null;
    for (const member of members(run)) { member.marks = 0; member.ready = false; member.hp = member.maxHp; member.plane = 'arena'; member.point = {...RAID_START}; }
    for (const session of present(run)) {
      session.player.hp = session.player.maxHp; session.player.diedAt = 0;
      move(session, run, 'arena', RAID_START, 'The raid resets. Ready up for another attempt.');
    }
    tell(run, reason); ctx.dirty(); run.touchedAt = now;
  }
  function leave(session, force = false) {
    const id = typeof session === 'string' ? session : session.player.id, run = membership.get(id);
    if (!run) return false;
    session = ctx.sessions.get(id);
    if (fighting(run) && !run.roomCleared && !force) { if (session) ctx.event(session, 'Leave after this chamber clears or the attempt ends.'); return true; }
    const member = run.members.get(id);
    if (run.phase === 'completed' && !member.result?.saved && !force) { if (session) ctx.event(session, 'Your rewards are saving. Remain in the raid until they are confirmed.'); return true; }
    membership.delete(id); run.members.delete(id);
    if (session) {
      ctx.cancel(session); session.instanceId = null; session.returnPosition = null; Object.assign(session.player, member.returnPosition);
      ctx.correct(session, 'Returned from the Apostle raid.');
    }
    if (!run.members.size) { removeActors(run); runs.delete(run.id); instances.delete(run.arenaId); instances.delete(run.shadowId); }
    else chooseLeader(run);
    ctx.dirty(); return true;
  }
  function detach(session) {
    const run = bySession(session); if (!run) return false;
    const member = run.members.get(session.player.id);
    member.hp = session.player.hp; member.maxHp = session.player.maxHp; member.point = {x:session.player.x,z:session.player.z};
    member.offlineAt = Date.now(); member.ready = false; ctx.cancel(session);
    session.instanceId = null; session.returnPosition = null; Object.assign(session.player, member.returnPosition);
    chooseLeader(run); ctx.dirty();
    return true;
  }
  function reattach(session) {
    const run = bySession(session); if (!run) return;
    const member = run.members.get(session.player.id);
    session.returnPosition = {...member.returnPosition}; session.player.hp = Math.min(member.hp, session.player.maxHp);
    if (!session.player.hp) session.player.diedAt ||= Date.now();
    else session.player.diedAt = 0;
    delete member.offlineAt; move(session, run, member.plane, member.point, 'Rejoined your Apostle raid.');
    chooseLeader(run);
  }
  function start(run, now) {
    const team = present(run), ready = team.filter(session => session.player.hp > 0 && session.player.level >= APOSTLE_RAID.level && run.members.get(session.player.id).ready);
    const required = run.lockedSize ? Math.min(APOSTLE_RAID.minPlayers, team.length) : APOSTLE_RAID.minPlayers;
    if (!ready.length || ready.length < required) return run.lockedSize
      ? `Ready ${required} online adventurers to retry this checkpoint. Offline members do not block the raid.`
      : 'Ready at least 10 living level-60 adventurers to enter. Extra members do not all need to be ready.';
    if (team.some(session => ctx.busy(session))) return 'Wait for the raid’s pending actions before starting.';
    if (!run.lockedSize) {
      for (const member of members(run)) if (!team.some(session => session.player.id === member.id)) leave(member.id);
      run.lockedSize = team.length; run.runId = randomUUID(); run.startedAt = now; run.checkpoint = 0;
    }
    beginRoom(run,run.checkpoint,now,false);
    return null;
  }
  function beginRoom(run,index,now,rally=true) {
    clearMechanics(run);removeActors(run);run.now=now;run.lastTick=now;run.roomIndex=index;run.roomCleared=false;
    run.boss=null;run.phaseEndsAt=0;run.enrageEndsAt=0;run.morgrathSummoned=false;run.bossSpawnedAt=0;run.wingsAt=0;
    for(const member of members(run)){
      member.marks=0;delete member.result;
      if(rally){member.hp=member.maxHp;member.plane='arena';member.point={...RAID_START};}
    }
    for(const [i,session] of present(run).entries()){
      if(rally){session.player.hp=session.player.maxHp;session.player.diedAt=0;}
      move(session,run,'arena',{x:(i%5-2)*2.4,z:25-Math.floor(i/5)*2.4},`Entered ${raidApproachRoomName(index)}.`);
    }
    if(index<RAID_APPROACH_ROOMS.length){
      run.phase='approach';
      RAID_APPROACH_ROOMS[index].monsters.forEach((model,i)=>spawnApproach(run,model,{x:(i%2?1:-1)*12,z:i<2?1:-14},now,i));
      tell(run,`${raidApproachRoomName(index)} · Defeat all four creatures to open the north gate.`);
      return;
    }
    if(index===6){
      run.phase='morgrath';run.boss=spawn(run,'morgrath',{x:0,z:-8},24000*run.lockedSize,'Morgrath');
      Object.assign(run.boss,{model:'morgrath',raidNextSpecial:now+4500,raidNextBasic:now+2500,raidAttackIndex:0});
      tell(run,'Morgrath · Turn his sword away, dodge the rifts, and shelter inside the rupture.');
      return;
    }
    run.phase = 'sermon'; run.phaseEndsAt = 0; run.enrageEndsAt = 0; run.thresholds = new Set(); run.guardiansKilled = 0;
    run.nextClaw = now + 3000; run.claws = 0; run.nextAbility = now + 7000; run.abilityIndex = 0; run.lastTick = now;
    run.boss = spawn(run, 'boss', {x:0,z:0}, 40_000 * run.lockedSize, 'The Horned Apostle');
    run.bossSpawnedAt = now;
    tell(run, 'The Sermon · Face Black Claw away, spread Stars and Palms, and break Soul Chains.');
  }
  function spawnApproach(run,model,point,now,index) {
    const definition=RAID_APPROACH_MONSTERS.find(monster=>monster.model===model);
    const enemy=spawn(run,'approach',point,definition.hpPerPlayer*run.lockedSize,definition.name,'arena',index);
    Object.assign(enemy,{model,raidNextSpecial:now+3500+index*700,raidNextBasic:now+2000,raidAttackIndex:0});
    return enemy;
  }
  function clearRoom(run,now) {
    if(run.roomCleared||roomActors(run).length)return;
    run.roomCleared=true;run.checkpoint=run.roomIndex+1;run.hazards=[];
    const team=present(run);
    for(const member of members(run))if(member.hp<=0&&!team.some(session=>session.player.id===member.id))member.hp=Math.ceil(member.maxHp*.5);
    for(const session of team)if(session.player.hp<=0){session.player.hp=Math.ceil(session.player.maxHp*.5);session.player.diedAt=0;ctx.correct(session,'The cleared chamber restores fallen adventurers.',false);}
    tell(run,`${raidApproachRoomName(run.roomIndex)} cleared · The leader can rally everyone through the north gate.`);ctx.dirty();
  }
  function advance(session,run,now) {
    if(run.leaderId!==session.player.id)return 'Only the raid leader can rally the raid through the gate.';
    if(!['approach','morgrath'].includes(run.phase)||!run.roomCleared||roomActors(run).length)return 'Defeat every creature in this chamber before advancing.';
    if(!ctx.live(session)||session.player.hp<=0||session.instanceId!==run.arenaId||distance(session.player,RAID_APPROACH_EXIT)>RAID_APPROACH_GATE_RANGE)return 'Reach the north gate to rally the raid into the next chamber.';
    if(present(run).some(member=>ctx.busy(member)))return 'Wait for the raid’s pending actions before advancing.';
    beginRoom(run,run.roomIndex+1,now);return null;
  }
  function handle(session, message, now) {
    if (!Object.hasOwn(fields, message.type)) return false;
    if ((Object.keys(message).length !== fields[message.type].length && !(message.type === 'raidReady' && Object.keys(message).length === 2)) || Object.keys(message).some(key => !fields[message.type].includes(key))) {
      ctx.event(session, 'Invalid raid action.'); return true;
    }
    let run = bySession(session);
    const fail = text => { ctx.event(session, text); return true; };
    if (message.type === 'raidCreate') {
      if (run || !ctx.eligible(session)) return fail('Stand safely in the overworld at level 60, outside combat, travel and other activities.');
      const id = randomUUID(); run = { id, arenaId:`raid-${id}-arena`, shadowId:`raid-${id}-shadow`, leaderId:session.player.id, coLeaderId:null, members:new Map(),
        phase:'forming', lockedSize:0, startedAt:0, roomIndex:0, checkpoint:0, roomCleared:false, phaseEndsAt:0, enrageEndsAt:0, wipes:0, hazards:[], chains:[], seals:[], guardiansKilled:0, touchedAt:now,
        objective:'Invite up to 20 level-60 adventurers. The leader can start once 10 are ready; no role selection is required.' };
      runs.set(id, run); instances.set(run.arenaId, run); instances.set(run.shadowId, run); addMember(run, session); return true;
    }
    if (message.type === 'raidRespond') {
      if (typeof message.invitationId !== 'string' || typeof message.accept !== 'boolean') return fail('Choose an available raid invitation.');
      const invite = invitations.get(message.invitationId);
      if (!invite || invite.targetId !== session.player.id || invite.expiresAt <= now) return fail('That raid invitation has expired.');
      invitations.delete(invite.id); if (!message.accept) return true;
      const offered = runs.get(invite.raidId);
      if (run || !offered || offered.lockedSize || fighting(offered) || offered.phase === 'completed' || offered.leaderId !== invite.leaderId || !manages(offered, invite.inviterId)
        || offered.members.size >= APOSTLE_RAID.maxPlayers || !ctx.eligible(session)) return fail('That raid is no longer available, or you are not ready to enter.');
      addMember(offered, session); return true;
    }
    if (!run) return fail('Create or join an Apostle raid first.');
    run.touchedAt = now;
    if (message.type === 'raidLeave') { leave(session); return true; }
    if (message.type === 'raidAdvance') { const reason=advance(session,run,now);if(reason)return fail(reason);return true; }
    if (message.type === 'raidCoLeader') {
      if (run.leaderId !== session.player.id) return fail('Only the raid leader can appoint a co-leader.');
      if (message.targetId !== null && (typeof message.targetId !== 'string' || !run.members.has(message.targetId) || message.targetId === run.leaderId)) return fail('Choose another member of your raid.');
      for (const [id, invite] of invitations) if (invite.raidId === run.id && invite.inviterId === run.coLeaderId) invitations.delete(id);
      run.coLeaderId = message.targetId; ctx.dirty(); return true;
    }
    if (run.phase === 'completed' || fighting(run) && !run.roomCleared) return fail('Manage the roster after this chamber clears or the attempt ends.');
    if (message.type === 'raidReady') {
      if (!['forming','wiped'].includes(run.phase) || typeof message.ready !== 'boolean' || message.role !== undefined && !roles.includes(message.role)) return fail('Choose a ready state before starting.');
      run.members.get(session.player.id).ready = message.ready; return true;
    }
    if (message.type === 'raidStart') {
      if (run.leaderId !== session.player.id) return fail('Only the raid leader can start.');
      if (!['forming','wiped'].includes(run.phase)) return fail('Use the north gate to continue this raid.');
      const reason = start(run, now); if (reason) return fail(reason); return true;
    }
    if (!manages(run, session.player.id)) return fail('Only the raid leader or co-leader can invite or remove members.');
    if (message.type === 'raidKick') {
      if (typeof message.targetId !== 'string' || !run.members.has(message.targetId) || message.targetId === session.player.id || message.targetId === run.leaderId) return fail('Choose another member of your raid, excluding the leader.');
      leave(message.targetId); return true;
    }
    if(run.lockedSize)return fail('New members can join the next raid. This raid keeps its starting difficulty.');
    const target = typeof message.targetId === 'string' && ctx.sessions.get(message.targetId);
    if (!target || target === session || bySession(target) || !ctx.canInvite(session, target) || !ctx.eligible(target) || run.members.size >= APOSTLE_RAID.maxPlayers)
      return fail('Invite an available level-60 adventurer while the raid has room.');
    if (now - (session.lastRaidInvite || 0) < 1000) return true;
    session.lastRaidInvite = now;
    for (const [id, invite] of invitations) if (invite.raidId === run.id && invite.targetId === target.player.id) invitations.delete(id);
    const id = randomUUID(); invitations.set(id, {id,raidId:run.id,leaderId:run.leaderId,inviterId:session.player.id,leaderName:session.player.name,targetId:target.player.id,expiresAt:now+60_000});
    ctx.onInvite?.(target, invitations.get(id));
    ctx.event(target, `${session.player.name} invited you to the Horned Apostle raid.`); return true;
  }
  function cleanse(run) { for (const member of members(run)) member.marks = 0; }
  function castApproach(run,enemy,target,kind,shape,point,radius,warning,damage,now,extra={}) {
    const entry=hazard(run,kind,point,radius,warning,damage,{now,shape,mark:false,sourceId:enemy.id,rotation:enemy.rotation,...extra});
    enemy.attack={id:entry.id,style:shape==='cone'?'swipe':shape==='line'?'spit':shape==='ring'?'pulse':'slam',name:kind,
      startedAt:now,impactAt:entry.impactAt,endsAt:entry.endsAt,x:point.x,z:point.z,rotation:enemy.rotation,radius,targetId:target.player.id};
    return entry;
  }
  function tickApproach(run,now,dt) {
    if(run.roomCleared)return;
    if(run.phase==='morgrath'&&run.boss.alive&&!run.morgrathSummoned&&run.boss.hp<=run.boss.maxHp*.5){
      run.morgrathSummoned=true;
      for(let i=0;i<2;i++)spawnApproach(run,'raid-grave-knight',{x:i?13:-13,z:-14},now,4+i);
      tell(run,'Morgrath summons two Grave Knights · Defeat his guard and break the throne.');
    }
    const team=alive(run,'arena');
    for(const enemy of roomActors(run)){
      if(enemy.attack?.endsAt<=now)enemy.attack=null;
      const target=ctx.target(enemy,team,now)||team.find(session=>run.members.get(session.player.id).role==='tank')||team[0];
      if(!target)continue;enemy.target=target;
      if(enemy.attack)continue;
      const boss=enemy.raidKind==='morgrath',definition=boss?null:RAID_APPROACH_MONSTERS.find(monster=>monster.model===enemy.model);
      const d=distance(enemy,target.player),ranged=definition&&['line','volley'].includes(definition.archetype),range=ranged?11:3.2;
      enemy.rotation=Math.atan2(target.player.x-enemy.x,target.player.z-enemy.z);
      if(d>range){
        const speed=(boss?2.6:ranged?2.8:3.6)*(enemy.slowUntil>now?enemy.slowMultiplier??1:1),step=Math.min(d-range,speed*dt);
        enemy.x=Math.max(-32,Math.min(32,enemy.x+(target.player.x-enemy.x)/d*step));
        enemy.z=Math.max(-32,Math.min(32,enemy.z+(target.player.z-enemy.z)/d*step));
      }
      if(now>=enemy.raidNextSpecial){
        const kind=boss?['Morgrath Cleave','Morgrath Rift','Morgrath Rupture'][enemy.raidAttackIndex++%3]:definition.ability;
        const archetype=boss?['cleave','line','ring'][(enemy.raidAttackIndex-1)%3]:definition.archetype;
        if(archetype==='cleave')castApproach(run,enemy,target,kind,'cone',enemy,boss?18:10,boss?2200:1700,boss?.5:.27,now,{angle:boss?Math.PI*.7:Math.PI*.55});
        if(archetype==='line')castApproach(run,enemy,target,kind,'line',{x:enemy.x+Math.sin(enemy.rotation)*14,z:enemy.z+Math.cos(enemy.rotation)*14},1,boss?2600:2000,boss?.42:.24,now,{width:boss?7:4,length:28});
        if(archetype==='ring')castApproach(run,enemy,target,kind,'ring',enemy,boss?100:18,boss?3000:2300,boss?.55:.28,now,{innerR:boss?7:4});
        if(archetype==='burst')castApproach(run,enemy,target,kind,'circle',enemy,8,2100,.25,now);
        if(archetype==='leap')castApproach(run,enemy,target,kind,'circle',target.player,5.5,2300,.28,now,{leap:true});
        if(archetype==='volley')for(const chosen of choose(team,Math.min(3,Math.ceil(run.lockedSize/5))))castApproach(run,enemy,chosen,kind,'circle',chosen.player,3.2,2200,.22,now);
        enemy.raidNextSpecial=now+(boss?6500:10500);enemy.raidNextBasic=now+3000;
      }else if(d<=range+.5&&now>=enemy.raidNextBasic){
        const entry=castApproach(run,enemy,target,`${enemy.name} Strike`,'circle',target.player,2.2,900,boss?.14:.075,now);
        enemy.attack.basic=true;entry.basic=true;enemy.raidNextBasic=now+(boss?2600:3400);
      }
    }
  }
  function stars(run, targets, now) {
    for (const session of targets) hazard(run, 'Death Star', session.player, 3.4, 2000, .45, {now});
  }
  function choose(team, count) {
    return team.map(session => ({session,order:ctx.random()})).sort((a,b)=>a.order-b.order).slice(0,count).map(entry=>entry.session);
  }
  function ability(run, now) {
    const team = alive(run, 'arena'), boss = run.boss;
    if (!team.length) return;
    const late = run.phase === 'incarnate', winged = run.thresholds.has(70);
    const cycle = winged ? ['stars','palm','hands','chains','wings','sun','harvest','clone'] : ['stars','palm','hands','chains','sun'];
    const kind = cycle[run.abilityIndex++ % cycle.length];
    if (kind === 'stars') stars(run, choose(team, late ? Math.ceil(team.length*.6) : Math.ceil(team.length*.3)), now);
    if (kind === 'palm') for (const session of choose(team, Math.min(4, Math.ceil(run.lockedSize / 5)))) hazard(run, 'Death Palm', session.player, late ? 7.5 : 6, 3500, .6, {now,targetId:session.player.id,follow:true});
    if (kind === 'hands') {
      const turn = ctx.random()*Math.PI*2, gap = (late ? 10 : 28)*Math.PI/180, width = (Math.PI*2-gap)/4;
      for (let i=0;i<4;i++) hazard(run,'Four Hands of Judgment',boss,50,3000,.65,{now,shape:'cone',rotation:turn+gap/2+width*(i+.5),angle:width});
    }
    if (kind === 'chains') {
      const available = [...team];
      for (const role of ['tank','healer']) {
        const source = choose(available.filter(session=>run.members.get(session.player.id).role===role),1)[0] || available[0];
        if (!source) break;
        available.splice(available.indexOf(source),1);
        const target = choose(available.filter(session=>run.members.get(session.player.id).role==='damage'),1)[0] || available[0];
        if (!target) break;
        available.splice(available.indexOf(target),1);
        run.chains.push({id:randomUUID(),firstId:source.player.id,secondId:target.player.id,breakDistance:12,endsAt:now+9000,nextAt:now+2500});
      }
      tell(run,'Soul Chains · Linked adventurers must separate by 12 meters.');
    }
    if (kind === 'wings') for (const x of [-18,0,18]) hazard(run,'Shadow Wings',{x,z:0},5,2800,.5,{now,shape:'line',width:late?10:7,length:64,rotation:0});
    if (kind === 'sun') {
      run.sun = {endsAt:now+20_000};
      for (let i=0;i<4;i++) spawn(run,'crystal',{x:Math.sin(i*Math.PI/2)*18,z:Math.cos(i*Math.PI/2)*18},500*run.lockedSize,'Shadow Crystal','arena',i);
      hazard(run,'Black Sun',{x:0,z:0},29,20_000,0,{now}); tell(run,'Black Sun · Destroy all four Shadow Crystals within 20 seconds to cleanse Death Marks.');
    }
    if (kind === 'harvest') {
      run.harvest = {startsAt:now+2500,endsAt:now+8500,lastAt:now+2500};
      hazard(run,'Soul Harvest',boss,50,2500,0,{now,endsAt:now+8500}); tell(run,'Soul Harvest · Run away. More Death Marks strengthen the pull; touching the Apostle kills.');
    }
    if (kind === 'clone') {
      const real = Math.floor(ctx.random()*4), spots = [{x:-11,z:-11},{x:11,z:-11},{x:11,z:11},{x:-11,z:11}];
      ctx.cancelEnemy(boss); Object.assign(boss,spots[real]); boss.raidVisual='apostle-real';
      for(let i=0;i<4;i++)if(i!==real)spawn(run,'clone',spots[i],boss.maxHp,'Death Clone · violet eyes','arena',i);
      run.clone={endsAt:now+12_000,damageNeeded:boss.maxHp*.02,nextStar:now+3000};
      hazard(run,'Death Clone',{x:0,z:0},50,12_000,.8,{now}); tell(run,'Death Clone · Burst the crimson-eyed Apostle with the gold halo gem to stop Judgment. Violet-eyed copies are false.');
    }
  }
  function suits(run, now) {
    clearMechanics(run); run.phase='suits'; run.phaseEndsAt=now+APOSTLE_RAID.suitsMs;
    choose(alive(run),run.lockedSize).forEach((session,index)=>run.members.get(session.player.id).suit=RAID_SUITS[index%4]);
    ctx.cancelEnemy(run.boss); tell(run,'Judgment of the Four Suits · Reach your matching symbol within 10 seconds. Survivors lose all Death Marks.');
  }
  function deathRealm(run, now) {
    clearMechanics(run); run.phase='death-realm'; run.phaseEndsAt=now+APOSTLE_RAID.realmMs; run.guardiansKilled=0;
    ctx.cancelEnemy(run.boss);
    const groups=[[],[]];
    for(const role of roles)alive(run).filter(session=>run.members.get(session.player.id).role===role).forEach((session,index)=>groups[role==='healer'?index%2:role==='tank'?(index+1)%2:groups[0].length<=groups[1].length?0:1].push(session));
    groups[1].forEach((session,index)=>move(session,run,'shadow',{x:(index%5-2)*3,z:23-Math.floor(index/5)*3},'Entered the Shadow Realm.'));
    for(let i=0;i<3;i++){
      spawn(run,'guardian',{x:(i-1)*16,z:-10},2400*run.lockedSize,`Soul Guardian ${i+1}`,'shadow',i);
      spawn(run,'shield',{x:(i-1)*17,z:-12},500*run.lockedSize,`Soul Shield ${i+1}`,'arena',i);
    }
    run.seals=[[-6,-1],[6,-1],[-6,11],[6,11]].map(([x,z])=>({x,z,r:3,charge:0,active:false}));
    run.nextSeal=now+1000;
    tell(run,'Death Realm · 60 seconds TOTAL. Arena: break three Soul Shields and charge four seals for six seconds. Shadow: defeat all three unshielded Guardians.');
  }
  function award(run, member, now, shutdown = false) {
    if(member.result?.saved||!shutdown&&now<(member.retryAt||0))return Promise.resolve();
    if(member.saving)return member.saving;
    // Fixed before any async save: failed writes and offline account claims must never reroll rewards.
    member.rewardPlan ||= ctx.rollRewards();
    member.saving=(async()=>{
      try {
        const result=await ctx.award(member.id,member.recordKey,run.runId,member.rewardPlan,shutdown);
        member.result={runId:run.runId,durationMs:run.durationMs,partySize:run.lockedSize,rewards:result.rewards,saved:result.saved};
        member.retryAt=now+5000;
      }catch(error){member.retryAt=now+5000;ctx.error(error);}
      finally{member.saving=null;}
    })();
    return member.saving;
  }
  function complete(run,now) {
    if(!fighting(run))return;
    run.phase='completed';run.durationMs=now-run.startedAt;run.phaseEndsAt=run.enrageEndsAt=0;
    clearMechanics(run);removeActors(run);run.boss=null;
    for(const member of members(run))member.result={runId:run.runId,durationMs:run.durationMs,partySize:run.lockedSize,rewards:[],saved:false};
    for(const session of present(run))move(session,run,'arena',RAID_START,'The Horned Apostle falls.');
    tell(run,'Death defied · Your personal raid rewards are being saved.');ctx.dirty();
  }
  function damageAllowed(enemy, amount, at) {
    const run=byInstance(enemy.instanceId);if(!run||enemy.raidId!==run.id)return amount;
    if(!fighting(run)||enemy.raidRoom!==run.roomIndex)return 0;
    if(['approach','morgrath'].includes(run.phase)){
      if(!enemy.alive||enemy.hp<=0||run.roomCleared)return 0;
      if(enemy.raidKind==='morgrath'&&!run.morgrathSummoned)return Math.max(0,Math.min(amount,enemy.hp-Math.floor(enemy.maxHp*.5)));
      return amount;
    }
    if(run.enrageEndsAt&&at>=run.enrageEndsAt||run.phase==='death-realm'&&at>=run.phaseEndsAt||run.sun&&at>=run.sun.endsAt&&actor(run,'crystal')){wipe(run,'DEATH DESCENDS · The raid ran out of time.',at);return 0;}
    if(enemy.raidKind==='clone')return 0;
    if(enemy.raidKind==='guardian'&&ctx.enemies.some(other=>other.raidId===run.id&&other.raidKind==='shield'&&other.raidIndex===enemy.raidIndex&&other.alive))return 0;
    if(enemy!==run.boss)return amount;
    if(run.phase==='suits'||run.phase==='death-realm')return 0;
    const next=[70,50,40,15].find(value=>!run.thresholds.has(value));
    const allowed=Math.max(0,Math.min(amount,enemy.hp-(next===undefined?0:Math.floor(enemy.maxHp*next/100))));
    if(run.clone)run.clone.damageNeeded-=allowed;
    return allowed;
  }
  function enemyKilled(enemy,now) {
    const run=byInstance(enemy.instanceId);if(!run||!enemy.raidId)return false;
    if(enemy.raidRoom!==run.roomIndex)return true;
    if(['approach','morgrath'].includes(enemy.raidKind)){
      ctx.cancelEnemy(enemy);run.hazards=run.hazards.filter(entry=>entry.sourceId!==enemy.id);clearRoom(run,now);return true;
    }
    if(enemy.raidKind==='guardian')run.guardiansKilled++;
    if(enemy===run.boss)complete(run,now);
    return true;
  }
  function resolve(run, now) {
    if(!fighting(run))return;
    if(run.enrageEndsAt&&now>=run.enrageEndsAt)return wipe(run,'DEATH DESCENDS · The 90-second Death Counter expired.',now);
    if(run.phase==='death-realm'&&now>=run.phaseEndsAt)return wipe(run,'Death Realm failed · Three Guardians and four sacrifice seals must be completed within 60 seconds.',now);
    for(const entry of run.hazards){
      if(entry.resolved||entry.impactAt>now||!entry.damage)continue;
      const source=entry.sourceId?ctx.enemies.find(enemy=>enemy.id===entry.sourceId):run.boss;
      if(entry.sourceId&&(!source?.alive||source.hp<=0)){entry.resolved=true;entry.endsAt=0;continue;}
      entry.resolved=true;
      if(entry.leap&&source)Object.assign(source,{x:entry.x,z:entry.z});
      for(const session of alive(run,entry.plane))if(raidHazardContains(entry,session.player))hit(run,session,entry.damage,entry.mark,entry.impactAt,source);
    }
    run.hazards=run.hazards.filter(entry=>entry.endsAt>now);
    if(run.sun&&now>=run.sun.endsAt){
      if(actor(run,'crystal'))return wipe(run,'Black Sun consumed the raid. Destroy all four Shadow Crystals before it finishes growing.',now);
      run.sun=null;
    }
    if(run.clone&&now>=run.clone.endsAt){removeActors(run,['clone']);run.clone=null;run.boss.raidVisual='apostle';Object.assign(run.boss,{x:0,z:0});}
    if(run.phase==='suits'&&now>=run.phaseEndsAt){
      for(const session of alive(run)){
        const member=run.members.get(session.player.id),zone=RAID_SUIT_ZONES.find(zone=>zone.suit===member.suit);
        if(!zone||distance(session.player,zone)>zone.r)kill(session,'Judgment: your suit did not match the circle.',run.phaseEndsAt);else member.marks=0;
      }
      for(const member of members(run))delete member.suit;
      run.phase='wings';run.phaseEndsAt=0;run.nextAbility=now+5000;run.nextClaw=now+3000;
      tell(run,'Judgment passed · Surviving adventurers are cleansed.');
    }
  }
  function tick(now) {
    for(const [id,invite]of invitations)if(invite.expiresAt<=now||!runs.has(invite.raidId))invitations.delete(id);
    for(const run of runs.values()){
      run.now=now;resolve(run,now);
      if(run.phase==='completed'){
        for(const member of members(run))void award(run,member,now);
        if(!present(run).length&&members(run).every(member=>member.result?.saved)){for(const member of members(run))membership.delete(member.id);runs.delete(run.id);instances.delete(run.arenaId);instances.delete(run.shadowId);}
        continue;
      }
      if(!fighting(run)){
        const expired=!present(run).length&&members(run).every(member=>member.offlineAt&&now-member.offlineAt>300_000);
        for(const member of members(run))if(expired||!run.lockedSize&&member.offlineAt&&now-member.offlineAt>300_000){membership.delete(member.id);run.members.delete(member.id);}
        if(!run.members.size){removeActors(run);runs.delete(run.id);instances.delete(run.arenaId);instances.delete(run.shadowId);}
        else chooseLeader(run);
        continue;
      }
      if(!alive(run).length){wipe(run,'The raid has fallen. Ready up to retry.',now);continue;}
      const boss=run.boss,dt=Math.min(.25,Math.max(0,(now-run.lastTick)/1000));run.lastTick=now;
      if(run.phase==='approach'||run.phase==='morgrath'){tickApproach(run,now,dt);continue;}
      if(run.phase==='death-realm'){
        if(now>=run.nextSeal){run.nextSeal=now+1000;
          for(const seal of run.seals){if(seal.active)continue;const occupants=alive(run,'arena').filter(session=>distance(session.player,seal)<=seal.r);
            if(!occupants.length)continue;seal.charge=Math.min(6,seal.charge+1);seal.active=seal.charge===6;
            for(const session of occupants)hit(run,session,.09,false,now,boss);
          }
        }
        if(run.guardiansKilled===3&&run.seals.every(seal=>seal.active)){
          clearMechanics(run);cleanse(run);
          for(const member of members(run)){member.plane='arena';member.point={...RAID_START};}
          for(const session of present(run))move(session,run,'arena',RAID_START,'The Shadow Realm collapses. Death Marks cleansed.');
          run.phase='wings';run.phaseEndsAt=0;run.nextAbility=now+5000;run.nextClaw=now+3000;tell(run,'Death Realm conquered · All three Guardians and four sacrifice seals are complete.');
        }
        continue;
      }
      if(run.phase==='suits')continue;
      const threshold=[70,50,40,15].find(value=>!run.thresholds.has(value)&&boss.hp<=Math.floor(boss.maxHp*value/100));
      if(threshold!==undefined){run.thresholds.add(threshold);
        if(threshold===50){suits(run,now);continue;}
        if(threshold===40){deathRealm(run,now);continue;}
        if(threshold===70){run.phase='wings';run.wingsAt=now;run.abilityIndex=4;tell(run,'Wings Unfold · Dodge sweeping lanes, resist Soul Harvest, and identify the real Death Clone.');}
        if(threshold===15){clearMechanics(run);run.phase='incarnate';boss.model='apostle-incarnate';run.enrageEndsAt=now+APOSTLE_RAID.enrageMs;run.nextAbility=now+2000;tell(run,'Death Incarnate · 90 seconds until DEATH DESCENDS. Attacks accelerate and safe slices shrink.');}
      }
      if(run.sun&&!actor(run,'crystal')){run.sun=null;run.hazards=run.hazards.filter(entry=>entry.kind!=='Black Sun');cleanse(run);tell(run,'Black Sun shattered · All Death Marks cleansed.');}
      if(run.clone){
        if(run.clone.damageNeeded<=0){run.clone=null;removeActors(run,['clone']);run.hazards=run.hazards.filter(entry=>entry.kind!=='Death Clone');boss.raidVisual='apostle';Object.assign(boss,{x:0,z:0});tell(run,'The true Apostle’s Judgment was interrupted.');}
        else if(now>=run.clone.nextStar){run.clone.nextStar=now+3000;stars(run,choose(alive(run,'arena'),3),now);}
      }
      if(run.harvest){
        if(now>=run.harvest.endsAt)run.harvest=null;
        else if(now>=run.harvest.startsAt)for(const session of alive(run,'arena')){
          const p=session.player,d=distance(p,boss),speed=2+run.members.get(p.id).marks*1.15;
          if(d<=3){kill(session,'Soul Harvest pulled you into the Apostle.',now);continue;}
          const step=Math.min(d,speed*dt);p.x+=(boss.x-p.x)/d*step;p.z+=(boss.z-p.z)/d*step;
          if(now-run.harvest.lastAt>=200)ctx.correct(session,'Soul Harvest',false);
        }
        if(run.harvest&&now-run.harvest.lastAt>=200)run.harvest.lastAt=now;
      }
      for(const chain of run.chains){
        const a=ctx.sessions.get(chain.firstId),b=ctx.sessions.get(chain.secondId);
        if(!ctx.live(a)||!ctx.live(b)||a.player.hp<=0||b.player.hp<=0||distance(a.player,b.player)>=chain.breakDistance){chain.endsAt=0;continue;}
        if(now>=chain.nextAt&&now<chain.endsAt){hit(run,a,.15,true,chain.nextAt,boss);hit(run,b,.15,true,chain.nextAt,boss);chain.nextAt+=2500;}
      }
      run.chains=run.chains.filter(chain=>chain.endsAt>now);
      for(const entry of run.hazards)if(entry.follow&&now<entry.impactAt-1000){const session=ctx.sessions.get(entry.targetId);if(session?.instanceId===run.arenaId){entry.x=session.player.x;entry.z=session.player.z;}}
      if(now>=run.nextClaw&&!run.clone){
        const team=alive(run,'arena'),tank=team.find(session=>run.members.get(session.player.id).role==='tank');
        const target=ctx.target(boss,team,now)||tank||team[0];
        if(target){boss.rotation=Math.atan2(target.player.x-boss.x,target.player.z-boss.z);boss.target=target;run.claws++;
          if(run.claws%3===0)hazard(run,'Black Claw',boss,19,1500,.5,{now,shape:'cone',angle:Math.PI*.42,rotation:boss.rotation});
          else hazard(run,'Black Claw',target.player,2.7,1000,.3,{now,mark:false});
        }
        run.nextClaw=now+(run.phase==='incarnate'?2300:3600);
      }
      if(now>=run.nextAbility&&!run.sun&&!run.clone&&!run.harvest){ability(run,now);run.nextAbility=now+(run.phase==='incarnate'?5500:9500);}
    }
  }
  function publicState(session) {
    const run=bySession(session);if(!run)return null;
    const member=run.members.get(session.player.id),layer=plane(run,session.instanceId),boss=run.boss;
    return {id:run.id,leaderId:run.leaderId,coLeaderId:run.coLeaderId,phase:run.phase,plane:layer,
      ...(!run.lockedSize&&manages(run,session.player.id)&&['forming','wiped'].includes(run.phase)?{candidates:[...ctx.sessions.values()].filter(other=>!bySession(other)&&ctx.eligible(other)&&ctx.canInvite(session,other)).map(other=>({id:other.player.id,name:other.player.name,className:other.player.appearance.className,level:other.player.level}))}:{}),lockedSize:run.lockedSize,startedAt:run.startedAt,phaseEndsAt:run.phaseEndsAt,
      approach:{roomIndex:run.roomIndex,roomName:raidApproachRoomName(run.roomIndex),remaining:run.roomIndex<7?roomActors(run).length:boss?.alive?1:0,cleared:!!run.roomCleared||run.phase==='completed',exit:{...RAID_APPROACH_EXIT},totalRooms:RAID_APPROACH_TOTAL_ROOMS},
      enrageEndsAt:run.enrageEndsAt,bossSpawnedAt:run.bossSpawnedAt,wingsAt:run.wingsAt,wipes:run.wipes,bossId:boss?.id||null,bossHp:boss?.hp||0,bossMaxHp:boss?.maxHp||0,objective:run.objective,
      members:members(run).map(entry=>{const active=ctx.sessions.get(entry.id),online=!!active&&!!ctx.live(active)&&byInstance(active.instanceId)===run;
        return {id:entry.id,name:entry.name,className:entry.className,level:entry.level,role:entry.role,ready:entry.ready,online,hp:online?active.player.hp:entry.hp,
          maxHp:online?active.player.maxHp:entry.maxHp,marks:entry.marks,plane:entry.plane,...(entry.suit?{suit:entry.suit}:{})};}),
      hazards:run.hazards.filter(entry=>entry.plane===layer).map(({damage,mark,follow,resolved,leap,basic,...entry})=>entry),
      chains:run.chains.map(({nextAt,...chain})=>chain),guardiansKilled:run.guardiansKilled,
      crystalsRemaining:ctx.enemies.filter(enemy=>enemy.raidId===run.id&&enemy.raidKind==='crystal'&&enemy.alive).length,seals:run.seals.map(seal=>({...seal})),
      ...(member.result?{result:{...member.result,rewards:member.result.rewards.map(reward=>({...reward}))}}:{})};
  }
  async function flush() {
    const completed=[...runs.values()].filter(run=>run.phase==='completed');
    await Promise.allSettled(completed.flatMap(run=>members(run).map(member=>member.saving).filter(Boolean)));
    await Promise.all(completed.flatMap(run=>members(run).map(member=>award(run,member,Date.now(),true))));
    if(completed.some(run=>members(run).some(member=>!member.result?.saved)))throw Error('Completed raid rewards could not be saved before shutdown.');
  }
  return {handle,byInstance,bySession,publicState,leave,detach,reattach,tick,enemyKilled,damageAllowed,flush,
    fighting:session=>!!bySession(session)&&fighting(bySession(session)),
    combatActive:id=>{const run=byInstance(id);return !run||fighting(run)&&run.phase!=='suits';},
    allies:(a,b)=>!!bySession(a)&&bySession(a)===bySession(b),
    publicInvites:session=>[...invitations.values()].filter(invite=>invite.targetId===session.player.id&&invite.expiresAt>Date.now()).map(({id,raidId,leaderName,expiresAt})=>({id,raidId,leaderName,expiresAt})),
    impacts:now=>[...runs.values()].flatMap(run=>fighting(run)?[...run.hazards.filter(entry=>!entry.resolved&&entry.impactAt<=now&&entry.damage).map(entry=>entry.impactAt),
      ...[run.phaseEndsAt,run.enrageEndsAt,run.sun?.endsAt].filter(at=>at&&at<=now)]:[]),
    resolve:now=>{for(const run of runs.values())resolve(run,now);},
  };
}
