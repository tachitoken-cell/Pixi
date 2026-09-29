import type { ClientMessage, FriendEntry, IgnoreEntry, PartyInvite, PartyState, Player, ServerMessage } from './shared';
import { getZone } from './content';
import { icon } from './icons';
import { deferTouchRender } from './scroll-refresh';
import './friends.css';

type FriendsMessage = Extract<ServerMessage, { type: 'friends' }>;
type Tab = 'friends' | 'who' | 'requests' | 'ignored';
type WhoState = { player: Player; party: PartyState | null; invites: PartyInvite[]; players: Player[]; lockReason?: string; pendingInvite?: string | null };
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function mountFriendsUI(options: {
  send: (message: ClientMessage) => void;
  allowed: () => boolean;
  trigger: HTMLButtonElement;
  onOpen: () => void;
  onWhisper: (friend: FriendEntry) => void;
  onInvite: (id: string) => void;
  onPartyRespond: (type: 'partyAccept' | 'partyDecline', id: string) => void;
  onPartyChat: () => void;
  onDungeon: () => void;
}) {
  const panel = document.createElement('section');
  panel.id = 'friends-window';
  panel.hidden = true;
  panel.role = 'dialog';
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-labelledby', 'friends-title');
  panel.innerHTML = `<header class="friends-heading"><img class="friends-emblem" src="/ui/friends-emblem.png" width="64" height="64" alt="" loading="lazy" decoding="async"><div><h2 id="friends-title">Friends</h2><p id="friends-summary">Your company in Mossvale</p></div><button type="button" data-friends-close aria-label="Close friends list">${icon('close')}</button></header>
    <div class="friends-tabs" role="tablist" aria-label="Player lists"><button type="button" id="friends-tab" role="tab" data-tab="friends" aria-controls="friends-list" aria-selected="true">Friends <span>0</span></button><button type="button" id="who-tab" role="tab" data-tab="who" aria-controls="friends-list" aria-selected="false" tabindex="-1">Who <span>0</span></button><button type="button" id="requests-tab" role="tab" data-tab="requests" aria-controls="friends-list" aria-selected="false" tabindex="-1">Requests <span>0</span></button><button type="button" id="ignored-tab" role="tab" data-tab="ignored" aria-controls="friends-list" aria-selected="false" tabindex="-1">Ignore <span>0</span></button></div>
    <label class="friends-search">${icon("compass")}<input type="search" id="friends-search" aria-label="Search player lists" placeholder="Search names" maxlength="100" autocomplete="off"></label><p id="friends-selection" class="friends-selection">Select an adventurer to see their actions.</p>
    <div id="friends-list" role="tabpanel" aria-labelledby="friends-tab" tabindex="0"></div>
    <div class="friends-actions"><button type="button" data-friends-whisper>${icon('whisper')}Whisper</button><button type="button" data-friends-invite>${icon('invite')}Invite</button><button type="button" data-friends-add-player hidden>Add friend</button><button type="button" data-party-promote hidden>Make leader</button><button type="button" data-friends-remove>Remove</button></div>
    <div class="friends-actions friends-party-actions" hidden><button type="button" data-party-chat-focus>Party chat</button><button type="button" data-party-leave>Leave party</button><button type="button" data-open-dungeon>${icon('compass')}Dungeons</button></div>
    <form class="friends-add"><label for="friends-name">Send a friend request</label><div><input id="friends-name" name="name" placeholder="Enter character name" autocomplete="off" spellcheck="false" minlength="2" maxlength="20" required aria-describedby="friends-status"><button type="submit">Send request</button></div></form>
    <p id="friends-status" role="status" aria-live="polite"></p>`;
  document.body.append(panel);
  const list = panel.querySelector<HTMLElement>('#friends-list')!;
  const input = panel.querySelector<HTMLInputElement>('#friends-name')!;
  const search = panel.querySelector<HTMLInputElement>('#friends-search')!;
  const matchesSearch = (entry: {name: string}) => entry.name.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase());
  const form = panel.querySelector<HTMLFormElement>('form')!;
  const submit = form.querySelector<HTMLButtonElement>('button')!;
  const status = panel.querySelector<HTMLElement>('#friends-status')!;
  const whisper = panel.querySelector<HTMLButtonElement>('[data-friends-whisper]')!;
  const invite = panel.querySelector<HTMLButtonElement>('[data-friends-invite]')!;
  const remove = panel.querySelector<HTMLButtonElement>('[data-friends-remove]')!;
  const addPlayer = panel.querySelector<HTMLButtonElement>('[data-friends-add-player]')!;
  const promote = panel.querySelector<HTMLButtonElement>('[data-party-promote]')!;
  const partyActions = panel.querySelector<HTMLElement>('.friends-party-actions')!;
  const tabs = [...panel.querySelectorAll<HTMLButtonElement>('[data-tab]')];
  const badge = document.createElement('span');
  badge.className = 'friends-request-badge';
  badge.setAttribute('aria-hidden', 'true');
  badge.hidden = true;
  options.trigger.append(badge);
  let friends: FriendEntry[] = [], ignored: IgnoreEntry[] = [], tab: Tab = 'friends', selected = '';
  let incoming: IgnoreEntry[] = [], outgoing: IgnoreEntry[] = [];
  let loaded = false, busy: FriendsMessage['request'], timer: ReturnType<typeof setTimeout> | undefined;
  let pendingInput: string | undefined;
  let previousFocus: HTMLElement | null = null, rendered = '';
  let who: WhoState | undefined;
  const whoRows = (): FriendEntry[] => who ? [...(who.party?.members.map(member => ({ ...member, online: true })) || []), ...who.players.filter(other => other.id !== who!.player.id && !who!.party?.members.some(member => member.id === other.id)).map(other => ({ ...other, className: other.appearance.className, online: true }))] : [];
  const rows = () => tab === 'friends' ? friends : tab === 'who' ? whoRows() : tab === 'ignored' ? ignored : [];
  const selectedFriend = () => (tab === 'friends' ? friends : tab === 'who' ? whoRows() : []).find(friend => friend.id === selected);
  const selectedMember = () => who?.party?.members.find(member => member.id === selected && member.id !== who!.player.id);
  const partyNotice = () => !who ? '' : who.lockReason || (who.player.instanceId ? 'Return to the open world to invite or join a party.' : who.player.hp <= 0 ? 'Revive before inviting or joining a party.' : who.party && who.party.members.length >= 4 ? 'Your party is full · 4 / 4 adventurers.' : who.party && who.party.leaderId !== who.player.id ? 'Your party leader can invite more adventurers.' : '');
  const canInvite = () => {
    if (tab !== 'who') return !!selectedFriend()?.online;
    const other = who?.players.find(other => other.id === selected);
    return !!other && other.id !== who!.player.id && !who!.party?.members.some(member => member.id === other.id) && !other.instanceId && other.hp > 0 && !partyNotice();
  };

  function playerRows(entries: (FriendEntry | IgnoreEntry)[]) {
    return `<ul>${entries.map(entry => {
      const friend = 'online' in entry ? entry as FriendEntry : undefined;
      const member = tab === 'who' ? who?.party?.members.find(member => member.id === entry.id) : undefined;
      const other = tab === 'who' ? who?.players.find(other => other.id === entry.id) : undefined;
      const detail = friend ? `Level ${friend.level} ${friend.className}${member ? ` · ${member.id === who!.party!.leaderId ? 'Leader' : 'Party'}` : ''}` : 'Chat and invitations blocked';
      const location = friend?.online ? member?.instanceId || other?.instanceId ? 'In a dungeon' : friend.zone ? getZone(friend.zone).name : 'In the realm' : 'Offline';
      const health = member ? ` · ${member.hp} / ${member.maxHp} health` : other && other.hp <= 0 ? ' · Needs revival' : '';
      return `<li><button type="button" class="friend-row${friend?.online ? ' online' : ''}" data-friend-id="${escape(entry.id)}" aria-pressed="${entry.id === selected}"><span class="friend-portrait" aria-hidden="true">${icon(friend?.className === 'Knight' ? 'shield' : friend?.className === 'Mage' ? 'spark' : friend?.className === 'Cleric' ? 'cleric' : friend?.className === 'Ranger' ? 'bow' : 'user')}</span><span class="friend-details"><strong>${escape(entry.name)}</strong><small>${escape(detail)}</small>${friend ? `<span class="friend-presence"><i aria-hidden="true"></i>${friend.online ? 'Online · ' : ''}${escape(location + health)}</span>` : ''}</span>${entry.id === selected ? icon('check') : ''}</button></li>`;
    }).join('')}</ul>`;
  }

  function renderWho() {
    if (!who) return '<div class="friends-empty"><p>Loading adventurers…</p></div>';
    const { player, party, invites } = who;
    const entries = whoRows().filter(matchesSearch), members = entries.filter(entry => party?.members.some(member => member.id === entry.id));
    const others = entries.filter(entry => !party?.members.some(member => member.id === entry.id)).sort((a, b) => a.name.localeCompare(b.name));
    return `${invites.length ? `<h3 class="friends-request-heading">Party invitations</h3><ul>${invites.map(invite => `<li class="friend-request"><span class="friend-details"><strong>${escape(invite.inviterName)}</strong><small>Invites you to a party</small></span><div class="friend-request-actions"><button type="button" data-party-accept="${escape(invite.id)}" aria-label="Join ${escape(invite.inviterName)}’s party" ${party || player.instanceId || player.hp <= 0 || who!.lockReason || who!.pendingInvite ? 'disabled' : ''}>Join</button><button type="button" data-party-decline="${escape(invite.id)}" aria-label="Decline ${escape(invite.inviterName)}’s party invitation" ${who!.pendingInvite ? 'disabled' : ''}>Decline</button></div></li>`).join('')}</ul>` : ''}${party ? `<h3 class="friends-request-heading">Your party · ${members.length} / 4</h3>${playerRows(members)}` : '<p class="friends-who-note">Select an adventurer and invite them to start a party.</p>'}${partyNotice() ? `<p class="friends-who-note">${escape(partyNotice())}</p>` : ''}<h3 class="friends-request-heading">Adventurers · ${others.length}</h3>${others.length ? playerRows(others) : '<p class="friends-who-note">No other adventurers are here yet.</p>'}`;
  }

  function requestList(entries: IgnoreEntry[], received: boolean) {
    entries = entries.filter(matchesSearch);
    return entries.length ? `<h3 class="friends-request-heading">${received ? 'Received' : 'Sent'} · ${entries.length}</h3><ul>${[...entries].sort((a, b) => a.name.localeCompare(b.name)).map(entry => `<li class="friend-request"><span class="friend-details"><strong>${escape(entry.name)}</strong><small>${received ? 'Wants to be your friend' : 'Waiting for acceptance'}</small></span><div class="friend-request-actions">${(received ? ['accept', 'decline'] : ['cancel']).map(action => `<button type="button" data-request-id="${escape(entry.id)}" data-request-action="${action}" aria-label="${action === 'cancel' ? 'Cancel request to' : action === 'accept' ? 'Accept' : 'Decline'} ${escape(entry.name)}" ${busy ? 'disabled' : ''}>${action === 'accept' ? 'Accept' : action === 'decline' ? 'Decline' : 'Cancel'}</button>`).join('')}</div></li>`).join('')}</ul>` : '';
  }

  const listMatches = () => (tab === 'requests' ? [...incoming, ...outgoing] : rows()).some(matchesSearch);
  search.addEventListener('input', () => { selected = ''; render(); list.scrollTop = 0; });

  function render() {
    // A passive list update must not move another player's action under a held touch.
    if (deferTouchRender(panel, render)) return;
    badge.hidden = !incoming.length;
    badge.textContent = String(incoming.length);
    const pending = incoming.length ? ` · ${incoming.length} pending friend ${incoming.length === 1 ? 'request' : 'requests'}` : '';
    options.trigger.title = `Friends · O${pending}`;
    options.trigger.setAttribute('aria-label', `Open friends, Who and ignore lists, O${pending}`);
    if (panel.hidden) return;
    if (!rows().some(row => row.id === selected)) selected = '';
    const online = friends.filter(friend => friend.online).length;
    const whoCount = whoRows().filter(entry => entry.id !== who?.player.id).length;
    panel.querySelector('#friends-summary')!.textContent = tab === 'friends' ? `${online} online · ${friends.length} ${friends.length === 1 ? 'friend' : 'friends'}` : tab === 'who' ? `${whoCount} ${whoCount === 1 ? 'adventurer' : 'adventurers'} here${who?.party ? ` · Party ${who.party.members.length} / 4` : ''}` : tab === 'requests' ? `${incoming.length} received · ${outgoing.length} sent` : `${ignored.length} ${ignored.length === 1 ? 'player' : 'players'} ignored`;
    for (const button of tabs) {
      const active = button.dataset.tab === tab;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      button.querySelector('span')!.textContent = String(button.dataset.tab === 'friends' ? friends.length : button.dataset.tab === 'who' ? whoCount : button.dataset.tab === 'requests' ? incoming.length : ignored.length);
    }
    list.setAttribute('aria-labelledby', `${tab}-tab`);
    list.setAttribute('aria-busy', String(tab === 'who' ? !who : !loaded));
    const entries = [...rows()].filter(matchesSearch).sort((a, b) => Number('online' in b && b.online) - Number('online' in a && a.online) || a.name.localeCompare(b.name));
    const html = tab === 'who' ? renderWho() : !loaded ? '<div class="friends-empty"><p>Loading your lists…</p></div>' : tab === 'requests' ? incoming.length || outgoing.length ? requestList(incoming, true) + requestList(outgoing, false) : `<div class="friends-empty">${icon('invite')}<h3>No pending requests</h3><p>Send a request by name below. You become friends when the other player accepts.</p></div>` : entries.length ? tab === 'friends' ? [true, false].map(online => { const group = entries.filter(entry => 'online' in entry && entry.online === online); return group.length ? `<h3 class="friends-request-heading">${online ? 'Online' : 'Offline'} · ${group.length}</h3>${playerRows(group)}` : ''; }).join('') : playerRows(entries) : `<div class="friends-empty">${icon(tab === 'friends' ? 'invite' : 'shield')}<h3>${tab === 'friends' ? 'A little company goes a long way' : 'Your Ignore list is empty'}</h3><p>${tab === 'friends' ? 'Send a request by name below, or right-click a player and choose Add friend. They appear here after accepting.' : 'Ignore a player by name below, or from their right-click menu.'}</p></div>`;
    const emptySearch = search.value.trim() && !listMatches();
    const listHtml = emptySearch ? '<div class="friends-empty"><h3>No matching names</h3><p>Try another name or clear your search.</p></div>' : html;
    if (listHtml !== rendered) {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>('[data-friend-id]')?.dataset.friendId : undefined;
      const request = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>('[data-request-id]')?.dataset : undefined;
      const partyAction = document.activeElement instanceof HTMLElement ? ['partyAccept', 'partyDecline'].find(key => document.activeElement instanceof HTMLElement && document.activeElement.dataset[key]) : undefined;
      const partyInvitation = partyAction ? (document.activeElement as HTMLElement).dataset[partyAction] : undefined;
      rendered = listHtml;
      const scrollTop = list.scrollTop;
      list.innerHTML = listHtml;
      list.scrollTop = scrollTop;
      if (active) ([...list.querySelectorAll<HTMLButtonElement>('[data-friend-id]')].find(button => button.dataset.friendId === active) || list).focus({ preventScroll: true });
      if (request) ([...list.querySelectorAll<HTMLButtonElement>('[data-request-id]')].find(button => button.dataset.requestId === request.requestId && button.dataset.requestAction === request.requestAction && !button.disabled) || list).focus({ preventScroll: true });
      if (partyAction) ([...list.querySelectorAll<HTMLButtonElement>('button')].find(button => button.dataset[partyAction] === partyInvitation && !button.disabled) || list).focus({ preventScroll: true });
    }
    const friend = selectedFriend();
    panel.querySelector('#friends-selection')!.textContent = selected ? `Selected: ${friend?.name ?? rows().find(row => row.id === selected)?.name ?? 'adventurer'}` : 'Select an adventurer to see their actions.';
    panel.querySelector<HTMLElement>('.friends-actions')!.hidden = tab === 'requests';
    whisper.hidden = invite.hidden = tab !== 'friends' && tab !== 'who';
    whisper.disabled = !friend?.online || tab === 'who' && selected === who?.player.id;
    invite.disabled = !canInvite();
    const canManage = tab === 'who' && who?.party?.leaderId === who?.player.id && !!selectedMember();
    if (tab === 'who' && (selectedMember() || selected === who?.player.id)) invite.hidden = true;
    promote.hidden = tab !== 'who' || !canManage;
    promote.disabled = !canManage;
    remove.hidden = tab === 'who' && !canManage;
    remove.disabled = !selected || !!busy;
    remove.textContent = tab === 'ignored' ? 'Unignore' : 'Remove';
    remove.title = tab === 'who' ? 'Remove from party' : '';
    addPlayer.hidden = tab !== 'who' || selected === who?.player.id || friends.some(entry => entry.id === selected);
    addPlayer.disabled = !friend || selected === who?.player.id || !!busy || friends.some(entry => entry.id === selected) || incoming.some(entry => entry.id === selected) || outgoing.some(entry => entry.id === selected);
    partyActions.hidden = tab !== 'who';
    partyActions.querySelector<HTMLButtonElement>('[data-party-chat-focus]')!.hidden = !who?.party;
    partyActions.querySelector<HTMLButtonElement>('[data-party-leave]')!.hidden = !who?.party;
    form.hidden = tab === 'who';
    form.querySelector('label')!.textContent = tab === 'ignored' ? 'Ignore a player' : 'Send a friend request';
    submit.textContent = busy === 'add' ? 'Sending…' : busy === 'ignoreAdd' ? 'Ignoring…' : tab === 'ignored' ? 'Ignore' : 'Send request';
    submit.disabled = !!busy;
  }
  function notice(text: string, error = false) {
    status.textContent = text;
    status.classList.toggle('friends-error', error);
  }
  function close(restoreFocus = true) {
    panel.hidden = true;
    options.trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }
  function open(nextTab = tab) {
    if (!options.allowed()) return;
    if (panel.hidden) previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (nextTab !== tab) selected = '';
    tab = nextTab;
    options.onOpen();
    panel.hidden = false;
    options.trigger.setAttribute('aria-expanded', 'true');
    render();
    options.send({ type: 'friendsList' });
    (tab === 'who' ? list : input).focus({ preventScroll: true });
  }
  function mutate(message: ClientMessage, request: NonNullable<FriendsMessage['request']>) {
    if (busy || !options.allowed()) return;
    busy = request;
    pendingInput = 'name' in message ? input.value : undefined;
    notice('');
    render();
    options.send(message);
    clearTimeout(timer);
    timer = setTimeout(() => {
      busy = undefined;
      notice('No reply from the realm. Reopen this list to refresh, then try again.', true);
      render();
    }, 10000);
  }
  function switchTab(next: Tab) {
    tab = next; selected = ''; search.value = ''; notice(''); render();
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (tab === 'who') return;
    const name = input.value.trim();
    if (name.length < 2) { notice('Enter a character name with at least 2 characters.', true); input.focus(); return; }
    mutate({ type: tab === 'ignored' ? 'ignoreAdd' : 'friendAdd', name }, tab === 'ignored' ? 'ignoreAdd' : 'add');
  });
  panel.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button || button.disabled || !options.allowed()) return;
    if (button.hasAttribute('data-friends-close')) { close(); return; }
    if (button.dataset.tab) { switchTab(button.dataset.tab as Tab); return; }
    if (tab === 'who') {
      if (button.dataset.partyAccept || button.dataset.partyDecline) {
        const id = button.dataset.partyAccept || button.dataset.partyDecline!;
        if (who?.invites.some(invite => invite.id === id)) options.onPartyRespond(button.dataset.partyAccept ? 'partyAccept' : 'partyDecline', id);
        return;
      }
      if (button.hasAttribute('data-party-promote') && selectedMember() && who?.party?.leaderId === who?.player.id) { options.send({ type: 'partyPromote', targetId: selected }); return; }
      if (button.hasAttribute('data-party-leave') && who?.party) { options.send({ type: 'partyLeave' }); return; }
      if (button.hasAttribute('data-party-chat-focus') && who?.party) { close(false); options.onPartyChat(); return; }
      if (button.hasAttribute('data-open-dungeon')) { close(false); options.onDungeon(); return; }
      if (button.hasAttribute('data-friends-add-player') && selectedFriend()) { mutate({ type: 'friendAdd', targetId: selected }, 'add'); return; }
      if (button.hasAttribute('data-friends-remove') && selectedMember() && who?.party?.leaderId === who?.player.id) { options.send({ type: 'partyKick', targetId: selected }); return; }
    }
    if (button.dataset.requestId) {
      const targetId = button.dataset.requestId, action = button.dataset.requestAction;
      if (action === 'cancel' && outgoing.some(entry => entry.id === targetId)) mutate({ type: 'friendCancel', targetId }, 'cancel');
      else if ((action === 'accept' || action === 'decline') && incoming.some(entry => entry.id === targetId)) mutate({ type: 'friendRespond', targetId, accept: action === 'accept' }, action);
      return;
    }
    if (button.dataset.friendId) { selected = button.dataset.friendId; render(); return; }
    const friend = selectedFriend();
    if (button.hasAttribute('data-friends-whisper') && friend?.online) options.onWhisper(friend);
    if (button.hasAttribute('data-friends-invite') && canInvite() && friend) options.onInvite(friend.id);
    if (button.hasAttribute('data-friends-remove') && selected && tab !== 'who') mutate({ type: tab === 'friends' ? 'friendRemove' : 'ignoreRemove', targetId: selected }, tab === 'friends' ? 'remove' : 'ignoreRemove');
  });
  panel.addEventListener('pointerdown', event => { event.stopPropagation(); options.onOpen(); });
  panel.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if ((event.target as HTMLElement).getAttribute('role') === 'tab' && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const index = tabs.findIndex(button => button.dataset.tab === tab);
      switchTab(tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length].dataset.tab as Tab);
      tabs.find(button => button.dataset.tab === tab)!.focus();
    }
  });
  options.trigger.setAttribute('aria-controls', panel.id);
  options.trigger.setAttribute('aria-expanded', 'false');
  return {
    toggle() { if (panel.hidden) open(); else close(); },
    open,
    close,
    isOpen: () => !panel.hidden,
    addPlayer(id: string, ignore = false) {
      open(ignore ? 'ignored' : 'requests');
      mutate({ type: ignore ? 'ignoreAdd' : 'friendAdd', targetId: id }, ignore ? 'ignoreAdd' : 'add');
    },
    updateWho(state: WhoState) { who = state; if (tab === 'who') render(); else if (!panel.hidden) tabs.find(button => button.dataset.tab === 'who')!.querySelector('span')!.textContent = String(whoRows().filter(entry => entry.id !== who!.player.id).length); },
    update(message: FriendsMessage) {
      friends = message.friends; ignored = message.ignored; incoming = message.incoming; outgoing = message.outgoing; loaded = true;
      if (message.request === busy) {
        if (!message.error && (busy === 'add' || busy === 'ignoreAdd') && input.value === pendingInput) input.value = '';
        busy = undefined; pendingInput = undefined; clearTimeout(timer);
      }
      if (message.request === 'add' && !message.error && tab === 'friends') { tab = 'requests'; selected = ''; }
      if (message.error || message.notice) notice(message.error || message.notice!, !!message.error);
      render();
    },
    reset() {
      close(false); clearTimeout(timer); who = undefined; friends = []; ignored = []; incoming = []; outgoing = []; loaded = false; busy = undefined;
      selected = ''; tab = 'friends'; input.value = ''; search.value = ''; pendingInput = undefined; rendered = ''; notice(''); list.innerHTML = '';
      render();
    },
  };
}
