export const PASSENGER_MOUNT = 'wayfarer-stag';
export const MOUNT_INVITE_MS = 30_000;
export const MOUNT_BOARD_DISTANCE = 6;

/** Connections and travel links are transient; only the driver supplies movement. */
export function createMountPassengers({ sessions, ready, valid, prepare, send, correct, changed = () => {}, now = Date.now }) {
  const invitations = new Map();
  const alive = s => s && sessions.get(s.player.id) === s && s.player.hp > 0 && !s.instanceId && !s.zeppelin;
  const clearInvite = id => { if (invitations.delete(id)) { const target = sessions.get(id); if (target) send(target, { type: 'mountInvitation', invitation: null }); } };
  const clearInvites = id => { clearInvite(id); for (const [target, invite] of invitations) if (invite.playerId === id) clearInvite(target); };
  const pairReady = (driver, passenger) => alive(driver) && alive(passenger) && driver !== passenger
    && driver.travel.mount === PASSENGER_MOUNT && !driver.travel.driverId && !driver.travel.passengerId
    && !passenger.travel.mount && !passenger.travel.driverId && !passenger.travel.passengerId
    && driver.player.zone === passenger.player.zone
    && Math.hypot(driver.player.x - passenger.player.x, driver.player.z - passenger.player.z) <= MOUNT_BOARD_DISTANCE
    && ready(driver) && ready(passenger);
  function follow(driver, passenger) {
    Object.assign(passenger.player, { x: driver.player.x, z: driver.player.z, rotation: driver.player.rotation, zone: driver.player.zone });
    Object.assign(passenger.jump, driver.jump);
    passenger.moveBudget = 0; passenger.lastMove = now(); passenger.travel.sprinting = false;
  }
  function detach(driver, passenger) {
    if (driver?.travel.passengerId === passenger?.player.id) { delete driver.travel.passengerId; changed(driver); }
    if (passenger?.travel.driverId) {
      delete passenger.travel.driverId; passenger.travel.mount = null; passenger.travel.sprinting = false;
      passenger.moveBudget = 0; passenger.lastMove = now(); correct(passenger); changed(passenger);
    }
  }
  function leave(session) {
    clearInvites(session.player.id);
    if (session.travel.driverId) detach(sessions.get(session.travel.driverId), session);
    if (session.travel.passengerId) {
      const passenger = sessions.get(session.travel.passengerId);
      if (passenger?.travel.driverId === session.player.id) detach(session, passenger);
      else { delete session.travel.passengerId; changed(session); }
    }
  }
  return {
    invite(driver, playerId) {
      const passenger = sessions.get(playerId);
      if (!pairReady(driver, passenger)) return 'Mount your Wayfarer Stag and choose an unmounted adventurer within 6 metres. Both riders must be outdoors and out of combat.';
      if (invitations.has(playerId)) return 'That adventurer already has a pending ride invitation.';
      clearInvites(driver.player.id);
      const invitation = { playerId: driver.player.id, name: driver.player.name, expiresAt: now() + MOUNT_INVITE_MS };
      invitations.set(playerId, invitation); send(passenger, { type: 'mountInvitation', invitation }); return null;
    },
    accept(passenger, playerId) {
      const invitation = invitations.get(passenger.player.id), driver = sessions.get(playerId);
      if (!invitation || invitation.playerId !== playerId || invitation.expiresAt <= now()) { clearInvite(passenger.player.id); return 'This ride invitation has expired.'; }
      clearInvite(passenger.player.id);
      if (!pairReady(driver, passenger)) return 'The ride is no longer available. Stay nearby, outdoors and out of combat.';
      prepare(driver); prepare(passenger); clearInvites(driver.player.id); clearInvites(passenger.player.id);
      driver.travel.passengerId = passenger.player.id;
      passenger.travel.driverId = driver.player.id; passenger.travel.mount = driver.travel.mount;
      follow(driver, passenger); correct(passenger); changed(driver); changed(passenger); return null;
    },
    decline(passenger, playerId) { if (invitations.get(passenger.player.id)?.playerId === playerId) clearInvite(passenger.player.id); },
    leave,
    sync() {
      for (const [id, invite] of invitations) if (invite.expiresAt <= now() || !sessions.has(invite.playerId) || !sessions.has(id)) clearInvite(id);
      for (const driver of sessions.values()) {
        if (!driver.travel.passengerId) continue;
        const passenger = sessions.get(driver.travel.passengerId);
        if (!alive(driver) || !alive(passenger) || driver.travel.mount !== PASSENGER_MOUNT || driver.travel.driverId
            || passenger.travel.driverId !== driver.player.id || passenger.travel.mount !== PASSENGER_MOUNT
            || !valid(driver) || !valid(passenger)) { leave(driver); continue; }
        follow(driver, passenger);
      }
      for (const passenger of sessions.values()) if (passenger.travel.driverId && sessions.get(passenger.travel.driverId)?.travel.passengerId !== passenger.player.id) leave(passenger);
    },
  };
}
