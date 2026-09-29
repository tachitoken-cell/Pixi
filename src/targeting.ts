import type { Player } from './shared';
import { isArenaInstance } from './arena.ts';
import { isInColosseum } from './colosseum.ts';

export function isHostilePlayer(self: Player | undefined, other: Player | undefined): boolean {
  if (!self || !other || self.id === other.id || self.hp <= 0 || other.hp <= 0
    || self.gm?.invisible || self.gm?.flying || other.gm?.invisible || other.gm?.flying
    || (self.instanceId ?? null) !== (other.instanceId ?? null)) return false;
  if (isArenaInstance(self.instanceId) || self.arenaMatchId || other.arenaMatchId) {
    return self.arenaPhase === 'active' && other.arenaPhase === 'active' && !self.arenaEliminated && !other.arenaEliminated
      && !!self.arenaMatchId && self.arenaMatchId === other.arenaMatchId
      && (self.arenaTeam === 0 || self.arenaTeam === 1) && other.arenaTeam === 1 - self.arenaTeam;
  }
  return self.duelOpponentId === other.id || !!self.pvp && !!other.pvp;
}

export function combatCompanionOwner(players: readonly Player[], targetId: string | null | undefined): Player | undefined {
  if (!targetId?.startsWith('companion:')) return;
  return players.find(owner => owner.id === targetId.slice(10) && owner.hp > 0 && !owner.zeppelin
    && !owner.travel?.mount && !owner.gm?.invisible && !owner.gm?.flying && (owner.combatCompanion?.hp ?? 0) > 0);
}

export function isHostileTarget(self: Player | undefined, target: Pick<TargetInfo, 'id' | 'kind'> | undefined, players: readonly Player[]): boolean {
  if (!target) return false;
  if (target.kind === 'companion') {
    const owner = combatCompanionOwner(players, target.id);
    return !!owner && isHostilePlayer(self, owner)
      && (!!owner.instanceId || !owner.pvp || isInColosseum(owner.combatCompanion!));
  }
  return target.kind === 'enemy' || isHostilePlayer(self, target.kind === 'player' ? players.find(other => other.id === target.id) : undefined);
}

export function canSupportPlayer(self: Player | undefined, other: Player | undefined): boolean {
  if (!self || !other || self.hp <= 0 || other.hp <= 0 || self.arenaEliminated || other.arenaEliminated
    || (self.instanceId ?? null) !== (other.instanceId ?? null)) return false;
  if (isArenaInstance(self.instanceId) || self.arenaMatchId || other.arenaMatchId) {
    return self.arenaPhase === 'active' && other.arenaPhase === 'active' && !!self.arenaMatchId && self.arenaMatchId === other.arenaMatchId
      && (self.arenaTeam === 0 || self.arenaTeam === 1) && self.arenaTeam === other.arenaTeam;
  }
  return self.id === other.id || !self.pvp && !other.pvp && !self.duelOpponentId && !other.duelOpponentId;
}

export interface TargetInfo {
  id: string;
  kind: 'bed' | 'landmark' | 'treasure-map' | 'arena' | 'zeppelin' | 'chair' | 'player' | 'companion' | 'enemy' | 'loot' | 'node' | 'npc' | 'gate' | 'beacon' | 'board' | 'poll' | 'workshop' | 'dungeon';
  x: number;
  z: number;
  name: string;
  label: string;
  height: number;
}

// An explicit selection never silently switches to a different nearby target.
export function chooseTarget(points: TargetInfo[], selectedId: string | null, position: { x: number; z: number }, range = Infinity): TargetInfo | undefined {
  if (selectedId) return points.find(p => p.id === selectedId && Math.hypot(p.x - position.x, p.z - position.z) <= range);
  return points.filter(p => Math.hypot(p.x - position.x, p.z - position.z) <= range)
    .sort((a, b) => Math.hypot(a.x - position.x, a.z - position.z) - Math.hypot(b.x - position.x, b.z - position.z))[0];
}
