import type { Player } from './shared';
import { icon } from './icons';

const actions = { inspect: ['Inspect', 'inspect'], invite: ['Invite', 'invite'], ride: ['Invite to ride', 'travel'], trade: ['Trade', 'trade'], whisper: ['Whisper', 'whisper'], friend: ['Add friend', 'invite'], ignore: ['Ignore', 'shield'], report: ['Report', 'shield'], duel: ['Duel', 'sword'], arena1: ['Arena 1v1', 'sword'], arena2: ['Arena 2v2', 'sword'], arena3: ['Arena 3v3', 'sword'], gm: ['Game master', 'crown'] } as const;
export type PlayerAction = keyof typeof actions;

export function mountPlayerMenu(onAction: (action: PlayerAction, playerId: string) => void, canManage: () => boolean = () => false, canChallenge: (player: Player, size: 1 | 2 | 3) => boolean | string = () => false, canDuel: (player: Player) => boolean | string = () => true, canRide: (player: Player) => boolean | string = () => false) {
  const menu = document.createElement('div');
  menu.id = 'player-menu';
  menu.role = 'menu';
  menu.ariaLabel = 'Player options';
  menu.hidden = true;
  menu.innerHTML = `<header><strong></strong><small></small></header>${Object.entries(actions).map(([action, [label, art]]) => `<button type="button" role="menuitem" data-player-action="${action}">${icon(art)}<span class="player-menu-label">${label}</span></button>`).join('')}`;
  document.body.append(menu);
  let targetId: string | null = null;
  let target: Player | undefined;
  let previousFocus: HTMLElement | null = null;
  const buttons = [...menu.querySelectorAll<HTMLButtonElement>('button')];
  function close(restoreFocus = false) {
    menu.hidden = true;
    targetId = null;
    target = undefined;
    if (restoreFocus && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }
  menu.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-player-action]');
    if (!button || button.hidden || !targetId || button.dataset.playerAction==='gm'&&!canManage()) return;
    refreshActions();
    if(button.getAttribute('aria-disabled')==='true')return;
    const id = targetId;
    close(true);
    onAction(button.dataset.playerAction as PlayerAction, id);
  });
  menu.addEventListener('pointerdown', event => event.stopPropagation());
  menu.addEventListener('contextmenu', event => event.preventDefault());
  menu.addEventListener('keydown', event => {
    event.stopPropagation();
    const visible=buttons.filter(button=>!button.hidden);
    const index = visible.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    else if (event.key === 'Tab') close();
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      visible[event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + visible.length) % visible.length].focus();
    }
  });
  document.addEventListener('pointerdown', event => { if (!menu.contains(event.target as Node)) close(); });
  window.addEventListener('resize', () => close());
  window.addEventListener('blur', () => close());
  function refreshActions() {
    for(const button of buttons) {
      const action=button.dataset.playerAction;
      if(action==='gm')button.hidden=!canManage();
      else if(action==='ride'){
        const result=target?canRide(target):false;
        button.hidden=result===false;button.setAttribute('aria-disabled',String(result!==true));
        button.title=typeof result==='string'?result:'';
      }
      else if(action==='duel'||action==='arena1'||action==='arena2'||action==='arena3'){
        const result=target?(action==='duel'?canDuel(target):canChallenge(target,action==='arena3'?3:action==='arena2'?2:1)):false;
        const reason=result===true?'':typeof result==='string'?result:action==='duel'?'Move within 8 metres in the open world.':'Finish your current activity before challenging.';
        button.hidden=false;button.setAttribute('aria-disabled',String(!!reason));
        let note=button.querySelector('small');
        if(!note){note=document.createElement('small');button.querySelector('.player-menu-label')!.append(note);}
        note.textContent=reason;note.hidden=!reason;
      }
    }
  }
  return {
    open(player: Player, x: number, y: number) {
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      targetId = player.id;
      target = player;
      refreshActions();
      menu.querySelector('strong')!.textContent = player.name;
      menu.querySelector('small')!.textContent = `Level ${player.level} ${player.appearance.className}`;
      menu.hidden = false;
      const bounds = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(8, Math.min(x, innerWidth - bounds.width - 8))}px`;
      menu.style.top = `${Math.max(8, Math.min(y, innerHeight - bounds.height - 8))}px`;
      buttons[0].focus({ preventScroll: true });
    },
    update(players: Player[]) { target=players.find(player=>player.id===targetId);refreshActions();if(targetId&&!target)close(true); },
    close,
  };
}
