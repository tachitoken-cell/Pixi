import type { PlayerRole } from './shared';
/** A separate text node keeps character names unchanged for lookups and social actions. */
export function gmBadge(role?:PlayerRole){
  if(role!=='gm')return null;
  const badge=document.createElement('span');badge.className='gm-badge';badge.textContent='GM';badge.title='Game master';return badge;
}
export function updateGmNameplate(host:HTMLElement,role?:PlayerRole){
  const previous=host.querySelector<HTMLElement>('.gm-badge');
  if(role==='gm'){if(!previous){const badge=gmBadge(role)!;host.querySelector('strong')?.insertAdjacentElement('afterend',badge);}host.dataset.gm='true';}
  else{previous?.remove();delete host.dataset.gm;}
}
