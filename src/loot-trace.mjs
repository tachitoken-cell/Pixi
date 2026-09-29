const TRACE_DURATION_MS = 30 * 60 * 1000;
const MAX_EVENTS = 1000;
const MAX_TRACES = 5;

export function createLootTrace({ realmId, now = Date.now }) {
  // ponytail: memory-only; persist reports if investigations must survive restarts. Export before replacing stopped traces.
  const traces = new Map();

  function finish(trace, reason, at) {
    if (trace.stoppedAt !== null) return;
    trace.stoppedAt = at;
    trace.stoppedReason = reason;
    if (trace.events.length < MAX_EVENTS) trace.events.push({ at, type: 'stopped', reason });
  }

  function get(playerId) {
    const trace = traces.get(playerId);
    if (trace && trace.stoppedAt === null && now() >= trace.expiresAt) finish(trace, 'expired', trace.expiresAt);
    return trace;
  }

  return {
    start(player, actorId) {
      if (!player || typeof player.id !== 'string' || !player.id.trim()) throw new Error('A player character ID is required.');
      if (typeof actorId !== 'string' || !actorId.trim()) throw new Error('A GM character ID is required.');
      const existing = get(player.id);
      if (existing && existing.stoppedAt === null) return structuredClone(existing);
      if (!existing && traces.size >= MAX_TRACES) {
        const oldestStopped = [...traces.keys()].map(get).find(trace => trace.stoppedAt !== null);
        if (!oldestStopped) throw new Error('Five loot traces are already active. Stop one before tracing another player.');
        traces.delete(oldestStopped.player.id);
      }
      const at = now();
      const trace = {
        version: 1,
        realmId,
        player: { id: player.id, name: player.name, level: player.level, className: player.appearance?.className },
        startedAt: at,
        expiresAt: at + TRACE_DURATION_MS,
        stoppedAt: null,
        stoppedReason: null,
        events: [{ at, type: 'started', actorId }],
      };
      traces.delete(player.id);
      traces.set(player.id, trace);
      return structuredClone(trace);
    },
    stop(playerId, reason = 'manual') {
      const trace = get(playerId);
      if (!trace) return null;
      finish(trace, reason, now());
      return structuredClone(trace);
    },
    write(playerId, type, details = {}) {
      const trace = get(playerId);
      if (!trace || trace.stoppedAt !== null) return false;
      const at = now();
      trace.events.push({ ...structuredClone(details), at, type });
      if (trace.events.length >= MAX_EVENTS) finish(trace, 'event_limit', at);
      return true;
    },
    active(playerId) {
      const trace = get(playerId);
      return !!trace && trace.stoppedAt === null;
    },
    report(playerId) {
      const trace = get(playerId);
      return trace ? structuredClone(trace) : null;
    },
    clear(playerId) {
      return traces.delete(playerId);
    },
    summaries() {
      return [...traces.keys()].map(playerId => {
        const trace = get(playerId);
        return {
          player: { ...trace.player },
          active: trace.stoppedAt === null,
          startedAt: trace.startedAt,
          expiresAt: trace.expiresAt,
          eventCount: trace.events.length,
          stoppedReason: trace.stoppedReason,
        };
      });
    },
  };
}
