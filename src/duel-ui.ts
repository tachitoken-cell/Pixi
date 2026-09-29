import type { ClientMessage, PartyInvite, DuelState, ArenaInvite, ArenaState } from './shared';
import { icon } from './icons';
import { arenaWagerAmount, arenaWagerSummary } from './arena-wager';

export function mountDuelUI(send:(message:ClientMessage)=>void,onOpponent:(id:string)=>void){
  const panel=document.createElement('section');panel.id='duel-card';panel.hidden=true;
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-labelledby','duel-title');panel.setAttribute('aria-describedby','duel-message duel-note');
  panel.innerHTML=`<h2 id="duel-title">${icon('sword')}<span id="duel-title-text">Duel challenge</span></h2><p id="duel-message" role="status" aria-live="polite"></p><p id="duel-note"></p><div class="duel-actions"><button type="button" class="primary-button" data-duel-action="accept">Accept</button><button type="button" class="primary-button" data-duel-action="decline">Decline</button><button type="button" class="primary-button" data-duel-action="forfeit" hidden>Forfeit</button></div>`;
  document.body.append(panel);
  const title=panel.querySelector<HTMLElement>('#duel-title-text')!,message=panel.querySelector<HTMLElement>('#duel-message')!,note=panel.querySelector<HTMLElement>('#duel-note')!;
  const buttons=[...panel.querySelectorAll<HTMLButtonElement>('button')];
  let duel:DuelState|null=null,invite:PartyInvite|undefined,serverOffset=0;
  function render(){
    panel.hidden=!duel&&!invite;
    panel.classList.toggle('duel-active',!!duel);
    title.textContent=duel?'Duel':'Duel challenge';
    const text=duel?`Dueling ${duel.opponentName}`:invite?`${invite.inviterName} challenges you to a duel.`:'';
    if(message.textContent!==text)message.textContent=text;
    note.textContent=duel?'Ends at 1 HP':invite?'Fight until one player reaches 1 HP.':'';
    for(const button of buttons)button.hidden=(button.dataset.duelAction==='forfeit')!==!!duel;
  }
  function respond(type:'duelAccept'|'duelDecline'){
    if(!invite||duel)return;
    const current=invite;invite=undefined;render();
    if(current.expiresAt>Date.now()+serverOffset)send({type,invitationId:current.id});
  }
  panel.addEventListener('click',event=>{
    event.stopPropagation();
    const action=(event.target as HTMLElement).closest<HTMLButtonElement>('button')?.dataset.duelAction;
    if(action==='accept')respond('duelAccept');
    else if(action==='decline')respond('duelDecline');
    else if(action==='forfeit'&&duel)send({type:'duelForfeit'});
  });
  panel.addEventListener('keydown',event=>{
    event.stopPropagation();
    if(event.key==='Escape'&&invite){event.preventDefault();respond('duelDecline');}
  });
  for(const type of ['pointerdown','pointerup','dblclick'])panel.addEventListener(type,event=>event.stopPropagation());
  panel.addEventListener('contextmenu',event=>{event.preventDefault();event.stopPropagation();});
  return {
    update(next:DuelState|null,invites:PartyInvite[],now:number){
      const previous=duel?.id;duel=next;serverOffset=now-Date.now();
      invite=duel?undefined:invites.find(item=>item.expiresAt>now);render();
      if(duel&&duel.id!==previous)onOpponent(duel.opponentId);
    },
    busy(){return !!duel||!!invite&&invite.expiresAt>Date.now()+serverOffset;},
    reset(){duel=null;invite=undefined;serverOffset=0;render();},
  };
}

export function mountArenaUI(send:(message:ClientMessage)=>void,onOpponent:(id:string)=>void,getSelfId:()=>string=()=>'',openWagers?:(matchId?:string)=>void,prepareWager?:()=>boolean){
  const panel=document.createElement('section');panel.id='arena-card';panel.hidden=true;
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-labelledby','arena-title');panel.setAttribute('aria-describedby','arena-message arena-wager arena-note');
  panel.innerHTML=`<h2 id="arena-title">${icon('sword')}<span id="arena-title-text">Arena challenge</span></h2><p id="arena-message" role="status" aria-live="polite"></p><div id="arena-roster"></div><p id="arena-wager" role="status" aria-live="polite" hidden></p><p id="arena-note"></p><div class="arena-actions"><button type="button" class="primary-button" data-arena-action="accept" aria-describedby="arena-message arena-wager arena-note">Accept</button><button type="button" class="primary-button" data-arena-action="decline">Decline</button><button type="button" class="primary-button" data-arena-action="forfeit" hidden>Forfeit match</button><button type="button" class="primary-button" data-arena-action="wagers" hidden>MOSS wagers</button><button type="button" class="primary-button" data-arena-action="close" hidden>Close</button></div>`;
  document.body.append(panel);
  const title=panel.querySelector<HTMLElement>('#arena-title-text')!,message=panel.querySelector<HTMLElement>('#arena-message')!,note=panel.querySelector<HTMLElement>('#arena-note')!,roster=panel.querySelector<HTMLElement>('#arena-roster')!,wager=panel.querySelector<HTMLElement>('#arena-wager')!;
  const buttons=[...panel.querySelectorAll<HTMLButtonElement>('button')];
  let duel:ArenaState|null=null,invite:ArenaInvite|undefined,serverOffset=0,pendingAccept:string|null=null,dismissedId:string|null=null,rosterKey='';
  function render(){
    const now=Date.now()+serverOffset,selfId=getSelfId(),members=duel?.members??invite?.members??[],self=members.find(member=>member.id===selfId);
    const accepted=!!invite&&(invite.members.some(member=>member.id===selfId&&member.accepted)||pendingAccept===invite.id);
    panel.hidden=(!duel&&!invite)||!!duel&&duel.id===dismissedId;
    panel.classList.toggle('arena-active',!!duel);
    panel.dataset.phase=duel?.phase??'invitation';
    title.textContent=`${duel?.size??invite?.size??1}v${duel?.size??invite?.size??1} ${duel?.rated||invite?.queued?'rated ':''}arena`;
    const stake=arenaWagerAmount(duel?.wagerMoss??invite?.wagerMoss??'0'),summary=stake?arenaWagerSummary(stake):null;
    wager.hidden=!summary;
    wager.textContent=summary?`${summary.stake} MOSS each · Pot ${summary.pot} · Winner ${summary.payout} · Tax ${summary.tax} (5%).`:'';
    const remaining=duel?Math.max(0,Math.ceil((duel.endsAt-now)/1000)):0;
    const text=duel?.settling?'Saving wager result…':invite?.funding?'Awaiting MOSS deposits.':duel?.phase==='finished'?(duel.winnerTeam==null?'Draw':duel.winnerTeam===self?.team?'Victory':'Defeat')
      :duel?.phase==='countdown'?`Starts in ${Math.max(0,Math.ceil((duel.startsAt-now)/1000))}…`
      :duel?.phase==='active'?(duel.members.find(member=>member.id===selfId)?.eliminated?'Knocked out · watch your team':`Fight! · ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')} remaining`)
      :invite?(accepted?'Waiting for acceptance.':invite.acceptReason||(invite.queued?'Opponent found.':`${invite.inviterName} challenges you.`)):'';
    if(message.textContent!==text)message.textContent=text;
    note.textContent=duel?.phase==='finished'?`${duel.reason||''}${duel.rated&&duel.ratingChange!=null?` MMR ${duel.ratingChange>=0?'+':''}${duel.ratingChange}.`:''}`.trim():'';
    if(summary){
      const terms=duel?.phase==='finished'?(duel.winnerTeam==null?'Full stake refund.':duel.winnerTeam===self?.team?'Claim before the displayed payout deadline; afterward stakes are refundable.':''):!duel&&!invite?.funding?'Forfeit/disconnect after entry (including countdown) loses the stake. Draw: full refund.':'';
      note.textContent=[note.textContent,terms].filter(Boolean).join(' ');
    }
    note.hidden=!note.textContent;
    const nextKey=JSON.stringify([members,selfId,duel?.phase,pendingAccept]);
    if(rosterKey!==nextKey){
      rosterKey=nextKey;roster.replaceChildren();
      for(const team of [0,1] as const){
        const group=document.createElement('div');group.className='arena-team';group.dataset.team=String(team);
        const heading=document.createElement('h3');heading.textContent=self?(self.team===team?'Your team':'Opponents'):`Team ${team+1}`;group.append(heading);
        const list=document.createElement('ul');
        for(const member of members.filter(member=>member.team===team)){
          const row=document.createElement('li'),name=document.createElement('span'),state=document.createElement('small');
          name.textContent=`${member.name}${member.id===selfId?' (you)':''}`;
          state.textContent='accepted' in member?(member.accepted||member.id===selfId&&accepted?'Accepted':'Waiting'):member.eliminated?'Knocked out':`${Math.max(0,member.hp)} / ${member.maxHp} HP`;
          row.classList.toggle('is-eliminated','eliminated' in member&&member.eliminated);row.append(name,state);list.append(row);
        }
        group.append(list);roster.append(group);
      }
    }
    for(const button of buttons){
      const action=button.dataset.arenaAction;
      button.hidden=action==='accept'?!invite||accepted||!!invite.funding:action==='decline'?!invite:action==='forfeit'?!duel||duel.phase==='finished':action==='wagers'?!openWagers||!summary||(!invite?.funding&&duel?.phase!=='finished'):duel?.phase!=='finished';
      if(action==='accept'){button.disabled=!!invite?.acceptReason;button.textContent=summary?`Accept ${summary.stake} MOSS stake`:'Accept';}
      if(action==='forfeit'){button.disabled=!!duel?.settling;button.textContent=summary?`Forfeit ${summary.stake} MOSS`:'Forfeit match';}
      if(action==='wagers')button.textContent=invite?.funding?'Fund MOSS stake':duel?.winnerTeam==null?'Collect refund':duel.winnerTeam===self?.team?'Collect payout':'MOSS wager';
      if(action==='decline')button.textContent=accepted?'Cancel challenge':'Decline';
    }
  }
  function respond(type:'arenaAccept'|'arenaDecline'){
    if(!invite||duel||invite.expiresAt<=Date.now()+serverOffset)return;
    if(type==='arenaAccept'){
      if(invite.funding||invite.acceptReason||pendingAccept===invite.id||invite.members.some(member=>member.id===getSelfId()&&member.accepted))return;
      if(arenaWagerAmount(invite.wagerMoss??'0')&&prepareWager&&!prepareWager())return;
      pendingAccept=invite.id;
    }
    const invitationId=invite.id;
    if(type==='arenaDecline')invite=undefined;
    send({type,invitationId});render();
  }
  panel.addEventListener('click',event=>{
    event.stopPropagation();
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button||button.hidden||button.disabled)return;
    const action=button.dataset.arenaAction;
    if(action==='accept')respond('arenaAccept');
    else if(action==='decline')respond('arenaDecline');
    else if(action==='forfeit'&&duel&&duel.phase!=='finished'&&!duel.settling)send({type:'arenaForfeit'});
    else if(action==='wagers')openWagers?.(duel?.wagerMatchId??invite?.wagerMatchId);
    else if(action==='close'&&duel?.phase==='finished'){dismissedId=duel.id;render();}
  });
  panel.addEventListener('keydown',event=>{
    event.stopPropagation();
    if(event.key==='Escape'&&invite){event.preventDefault();respond('arenaDecline');}
    else if(event.key==='Escape'&&duel?.phase==='finished'){event.preventDefault();dismissedId=duel.id;render();}
  });
  for(const type of ['pointerdown','pointerup','dblclick'])panel.addEventListener(type,event=>event.stopPropagation());
  panel.addEventListener('contextmenu',event=>{event.preventDefault();event.stopPropagation();});
  return {
    update(next:ArenaState|null,invites:ArenaInvite[],now:number){
      const previous=duel;duel=next;serverOffset=now-Date.now();
      invite=(!duel||duel.phase==='finished')?invites.find(item=>item.expiresAt>now):undefined;
      if(invite&&duel?.phase==='finished')duel=null;
      pendingAccept=null;
      render();
      if(duel?.phase==='active'&&(duel.id!==previous?.id||previous.phase!=='active'))onOpponent(duel.opponentId);
    },
    busy(){return !!duel&&duel.phase!=='finished'||!!invite&&invite.expiresAt>Date.now()+serverOffset;},
    reset(){duel=null;invite=undefined;serverOffset=0;pendingAccept=null;dismissedId=null;render();},
  };
}
