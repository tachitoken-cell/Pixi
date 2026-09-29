import type { ClientMessage, ServerMessage } from './shared';

type Invitation = Extract<ServerMessage, { type: 'mountInvitation' }>['invitation'];

export function mountRideInvitation(send: (message: ClientMessage) => void, now = Date.now) {
  const panel = document.createElement('section');
  panel.id = 'mount-invitation'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'false'); panel.setAttribute('aria-labelledby', 'mount-invitation-title');
  panel.innerHTML = '<h2 id="mount-invitation-title">Ride together</h2><p role="status"></p><div><button type="button" data-ride-accept>Accept ride</button><button type="button" data-ride-decline>Decline</button></div>';
  document.body.append(panel);
  let invitation: Invitation = null, timer: ReturnType<typeof setTimeout> | undefined;
  function update(value: Invitation) {
    clearTimeout(timer); invitation = value; panel.hidden = !value;
    if (!value) return;
    panel.querySelector('p')!.textContent = `${value.name} invites you to ride their Wayfarer Stag. They control movement. Use Mount to leave at any time.`;
    timer = setTimeout(() => update(null), Math.max(0, value.expiresAt - now()));
  }
  panel.querySelector('[data-ride-accept]')!.addEventListener('click', () => { if (invitation && invitation.expiresAt > now()) send({ type: 'mountAccept', playerId: invitation.playerId }); update(null); });
  panel.querySelector('[data-ride-decline]')!.addEventListener('click', () => { if (invitation) send({ type: 'mountDecline', playerId: invitation.playerId }); update(null); });
  panel.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); if (invitation) send({ type: 'mountDecline', playerId: invitation.playerId }); update(null); }
  });
  return update;
}
