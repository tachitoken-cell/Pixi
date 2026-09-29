import { botEvidence, inputActivityValid } from './bot-evidence.mjs';

const RATE = 65, BURST = 130, STRIKE_WINDOW = 30000, BLOCK_MS = 60000;
const MAX_ENTRIES = 10000, IDLE_MS = 3600000;
const TIMED_ACTIONS = new Set(['attack', 'loot', 'gather', 'targetSelection']);

function repeatedRoute(state, type, now, context) {
  if (type !== 'gather' && type !== 'targetSelection') return null;
  let parts;
  try { if (typeof context === 'string' && context.length <= 160) parts = JSON.parse(context); } catch { /* Missing context cannot support a route observation. */ }
  if (!Array.isArray(parts) || parts.length !== 3 || parts.some(value => typeof value !== 'string' || !value) || parts[1] !== type) { state.route = []; return null; }
  const previous = state.route?.at(-1);
  if (!previous || previous.area !== parts[0] || now - previous.at < 100 || now - previous.at > 120000) state.route = [];
  state.route.push({ at: now, area: parts[0], target: parts[2], type, context });
  if (state.route.length > 240) state.route.shift();
  const route = state.route;
  if (route.length < 60 || now - route[0].at < 600000 || now - state.reviewAt < IDLE_MS) return null;
  // Only mixed gathering/target-selection routes qualify. Spell rotations,
  // automatic combat and pet loot are not route evidence. A manual farming
  // route can still repeat: this is review context, never a strike or verdict.
  for (let length = 6; length <= Math.min(24, Math.floor(route.length / 10)); length++) {
    const cycle = route.slice(-length), targets = new Set(cycle.map(action => action.target));
    if (targets.size < 6 || !cycle.some(action => action.type === 'gather') || !cycle.some(action => action.type === 'targetSelection')) continue;
    let repetitions = 1;
    while ((repetitions + 1) * length <= route.length) {
      const offset = route.length - (repetitions + 1) * length;
      if (!cycle.every((action, index) => route[offset + index].context === action.context)) break;
      repetitions++;
    }
    const first = route.length - repetitions * length, durationMs = now - route[first].at;
    if (repetitions < 10 || durationMs < 600000) continue;
    const intervals = repetitions * length - 1, meanIntervalMs = durationMs / intervals;
    let variance = 0;
    for (let index = first + 1; index < route.length; index++) variance += (route[index].at - route[index - 1].at - meanIntervalMs) ** 2;
    return { reason: 'repeated-action-sequence', actionType: 'farmingRoute', startedAt: route[first].at, endedAt: now,
      intervals, durationMs, meanIntervalMs, jitterRatio: Math.sqrt(variance / intervals) / meanIntervalMs,
      sequence: cycle.map(action => action.context), repetitions, distinctTargets: targets.size };
  }
  return null;
}

export function createActionGuard() {
  const entries = new Map();
  let nextPrune = 0;
  function entry(key, now) {
    if (now >= nextPrune) {
      for (const [id, state] of entries) if (now - state.seen > IDLE_MS && state.blockedUntil <= now) entries.delete(id);
      nextPrune = now + 60000;
    }
    let state = entries.get(key);
    if (!state) {
      // Capacity rejects new traffic, never evicts an active cooldown or labels a new account a cheater.
      if (entries.size >= MAX_ENTRIES) return null;
      state = { seen: now, tokenAt: now, tokens: BURST, strikes: [], lastStrike: -Infinity, blockedUntil: 0, actions: new Map(), reviewAt: -Infinity, windows: [] };
      entries.set(key, state);
    }
    state.seen = Math.max(state.seen, now);
    return state;
  }
  return {
    message(key, now = Date.now()) {
      const state = entry(key, now);
      if (!state || state.blockedUntil > now) return false;
      state.tokens = Math.min(BURST, state.tokens + Math.max(0, now - state.tokenAt) * RATE / 1000);
      state.tokenAt = Math.max(state.tokenAt, now);
      if (state.tokens < 1) return false;
      state.tokens--; return true;
    },
    strike(key, now = Date.now(), reason = 'Invalid action') {
      const state = entry(key, now);
      if (!state) return { blockedUntil: 0, count: 0, newlyBlocked: false };
      if (state.blockedUntil > now) return { blockedUntil: state.blockedUntil, count: state.strikes.length, newlyBlocked: false };
      state.strikes = state.strikes.filter(strike => now - strike.at < STRIKE_WINDOW);
      if (now - state.lastStrike >= 500) { state.lastStrike = now; state.strikes.push({ at: now, reason }); }
      const newlyBlocked = state.strikes.length >= 12;
      if (newlyBlocked) state.blockedUntil = now + BLOCK_MS;
      return { blockedUntil: state.blockedUntil > now ? state.blockedUntil : 0, count: state.strikes.length, newlyBlocked };
    },
    block(key, until, now = Date.now()) {
      if (!Number.isSafeInteger(until) || until <= now) return false;
      const state = entry(key, now);
      if (!state) return false;
      state.blockedUntil = Math.max(state.blockedUntil, until); return true;
    },
    blockedUntil(key, now = Date.now()) { const until = entries.get(key)?.blockedUntil || 0; return until > now ? until : 0; },
    forget(key) { entries.delete(key); },
    strikeSummary(key, now = Date.now()) {
      const strikes = (entries.get(key)?.strikes || []).filter(strike => now - strike.at < STRIKE_WINDOW);
      const reasons = {};
      for (const strike of strikes) reasons[strike.reason] = (reasons[strike.reason] || 0) + 1;
      return { firstAt: strikes[0]?.at, lastAt: strikes.at(-1)?.at, reasons };
    },
    activity(key, sample, now = Date.now()) {
      if (!inputActivityValid(sample)) return false;
      const state = entry(key, now);
      if (!state || state.blockedUntil > now || now - (state.windows.at(-1)?.at ?? -Infinity) < Math.max(20000, sample.durationMs - 5000)) return false;
      state.windows = state.windows.filter(window => now - window.at < 300000).slice(-9);
      state.windows.push({ at: now, sample: { ...sample } });
      return true;
    },
    evidence(key, pattern, runtime) { return botEvidence(pattern, entries.get(key)?.windows || [], runtime); },
    action(key, type, now = Date.now(), context) {
      if (!TIMED_ACTIONS.has(type)) return null;
      const state = entry(key, now);
      if (!state || state.blockedUntil > now) return null;
      const route = repeatedRoute(state, type, now, context);
      if (route) state.reviewAt = now;
      let sample = state.actions.get(type);
      const gap = sample ? now - sample.lastAt : 0;
      // Accepted manual actions only. Movement, failed requests, automatic
      // attacks and pet pickups cannot provide evidence of scripted input.
      // Timing and repeated routes support review, not a bot verdict.
      if (!sample || gap < 100 || gap > 30000 || now - sample.startedAt > 900000) {
        state.actions.set(type, { startedAt: now, lastAt: now, intervals: 0, mean: 0, m2: 0 }); return route;
      }
      sample.lastAt = now; sample.intervals++;
      const delta = gap - sample.mean;
      sample.mean += delta / sample.intervals; sample.m2 += delta * (gap - sample.mean);
      const durationMs = now - sample.startedAt;
      if (sample.intervals < 60 || durationMs < 300000 || now - state.reviewAt < IDLE_MS) return route;
      const jitterRatio = Math.sqrt(Math.max(0, sample.m2) / sample.intervals) / sample.mean;
      if (jitterRatio > .01) return route;
      state.reviewAt = now;
      return { reason: 'regular-action-timing', actionType: type, startedAt: sample.startedAt, endedAt: now,
        intervals: sample.intervals, durationMs, meanIntervalMs: sample.mean, jitterRatio };
    },
  };
}
