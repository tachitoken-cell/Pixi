import assert from 'node:assert/strict';
import { createActionGuard } from '../src/action-guard.mjs';

const guard = createActionGuard();
for (let now = 0; now < 300000; now += 50) {
  assert(guard.message('ordinary', now), 'normal 20 Hz movement is allowed');
  if (now % 1500 === 0) { assert(guard.message('ordinary', now)); assert(guard.message('ordinary', now)); }
}
for (let i = 0; i < 130; i++) assert(guard.message('burst', 0), 'network bunching has two seconds of burst credit');
assert.equal(guard.message('burst', 0), false);
for (let i = 0; i < 65; i++) assert(guard.message('burst', 1000));
assert.equal(guard.message('burst', 1000), false, 'sustained traffic is limited to 65 per second');
assert.equal(guard.message('burst', 900), false, 'a backwards clock does not replenish credit');
assert(guard.message('separate', 1000), 'accounts do not share rate budgets');

assert.equal(guard.strike('abusive', 0).count, 1);
for (let i = 0; i < 100; i++) assert.equal(guard.strike('abusive', 100).count, 1, 'one packet burst contributes only one strike');
let result;
for (let i = 1; i < 12; i++) result = guard.strike('abusive', i * 500);
assert.deepEqual(result, { blockedUntil: 65500, count: 12, newlyBlocked: true });
assert.equal(guard.blockedUntil('abusive', 6000), 65500, 'reusing the account key after reconnect retains its cooldown');
assert.equal(guard.message('abusive', 6000), false);
assert.equal(guard.strike('abusive', 6000).newlyBlocked, false, 'blocked traffic does not repeatedly report or extend punishment');
assert.equal(guard.blockedUntil('abusive', 65500), 0);
assert(guard.message('abusive', 65500));
assert.equal(guard.strike('abusive', 65500).count, 1, 'expired strikes do not carry into a new cooldown');
for (let i = 0; i < 12; i++) assert.equal(guard.strike('occasional', i * 30000).blockedUntil, 0);
assert(guard.block('imported', 80000, 0));
assert(guard.block('imported', 70000, 0));
assert.equal(guard.blockedUntil('imported', 1000), 80000, 'older durable state cannot shorten a cooldown');
assert.equal(guard.block('expired', 1000, 1000), false);
const preauth = {};
guard.strike(preauth, 0); guard.forget(preauth);
assert.equal(guard.strike(preauth, 500).count, 1, 'closed preauth socket state can be discarded');

let evidence = null;
for (let i = 0; i <= 60; i++) {
  evidence = guard.action('regular', 'loot', i * 5000);
  if (i < 60) assert.equal(evidence, null, 'review requires both 60 intervals and five minutes');
}
assert.equal(evidence.reason, 'regular-action-timing'); assert.equal(evidence.actionType, 'loot');
assert.equal(evidence.intervals, 60); assert.equal(evidence.durationMs, 300000);
assert.equal(evidence.meanIntervalMs, 5000); assert.equal(evidence.jitterRatio, 0);
assert.equal(guard.blockedUntil('regular', 300000), 0, 'timing evidence never blocks or strikes an account');
assert.equal(guard.strike('regular', 300000).count, 1);
for (let i = 61; i <= 180; i++) assert.equal(guard.action('regular', 'loot', i * 5000), null, 'review reports are limited to one per account per hour');
for (let i = 0; i <= 150; i++) assert.equal(guard.action('too-short', 'attack', i * 1500), null);
let irregularAt = 0;
for (let i = 0; i < 150; i++) { irregularAt += [1700, 4200, 8100, 2300][i % 4]; assert.equal(guard.action('irregular', 'gather', irregularAt), null); }
for (let i = 0; i < 60; i++) assert.equal(guard.action('interrupted', 'gather', i * 5000), null);
assert.equal(guard.action('interrupted', 'gather', 295000), null, 'bunched timestamps reset evidence');
assert.equal(guard.action('interrupted', 'gather', 290000), null, 'backwards timestamps reset evidence');
assert.equal(guard.action('interrupted', 'gather', 900000), null, 'a long idle gap resets evidence');
for (let i = 1; i < 60; i++) assert.equal(guard.action('interrupted', 'gather', 900000 + i * 5000), null);

// The route signal deliberately ignores timing regularity. Its landmarks are
// accepted target changes/gathers; ordinary combat rotations are not landmarks.
const routeGuard = createActionGuard();
const route = Array.from({ length: 6 }, (_, index) => ({ type: index % 2 ? 'gather' : 'targetSelection', target: 'target-' + index }));
function routeAction(key, index, { cycle = route, area = 'forest', gap, context } = {}) {
  const clock = routeClocks.get(key) || { at: 0, seed: 17 };
  clock.seed = (Math.imul(clock.seed, 1664525) + 1013904223) >>> 0;
  clock.at += gap ?? 7000 + clock.seed % 12000;
  routeClocks.set(key, clock);
  const action = cycle[index % cycle.length];
  return routeGuard.action(key, action.type, clock.at, context === undefined ? JSON.stringify([area, action.type, action.target]) : context);
}
const routeClocks = new Map();
let routeEvidence;
for (let index = 0; index < 60; index++) {
  routeEvidence = routeAction('randomized-route', index);
  if (index < 59) assert.equal(routeEvidence, null, 'a route needs ten complete cycles');
}
assert.equal(routeEvidence.reason, 'repeated-action-sequence');
assert.equal(routeEvidence.actionType, 'farmingRoute');
assert.equal(routeEvidence.repetitions, 10); assert.equal(routeEvidence.distinctTargets, 6);
assert.deepEqual(routeEvidence.sequence, route.map(action => JSON.stringify(['forest', action.type, action.target])));
assert.equal(routeEvidence.intervals, 59);
assert(routeEvidence.durationMs >= 600000, 'route evidence requires at least ten minutes');
assert(routeEvidence.jitterRatio > .1, 'randomized delays do not hide an exact repeated route');
assert.equal(routeEvidence.endedAt - routeEvidence.startedAt, routeEvidence.durationMs);
assert.equal(routeEvidence.meanIntervalMs, routeEvidence.durationMs / routeEvidence.intervals);
assert.equal(routeGuard.blockedUntil('randomized-route', routeEvidence.endedAt), 0);
assert.equal(routeGuard.strike('randomized-route', routeEvidence.endedAt).count, 1, 'route evidence creates no strike');
for (let index = 60; index < 180; index++) assert.equal(routeAction('randomized-route', index), null, 'routes share the one-hour account review limit');
const timingStart = routeClocks.get('randomized-route').at;
for (let index = 0; index <= 60; index++) assert.equal(routeGuard.action('randomized-route', 'loot', timingStart + index * 5000), null, 'route and timing reviews share the account limit');

for (const [key, cycle] of [
  ['short-loop', route.slice(0, 4)],
  ['same-targets', route.map((action, index) => ({ ...action, target: 'target-' + index % 3 }))],
  ['gather-only', route.map(action => ({ ...action, type: 'gather' }))],
  ['target-only', route.map(action => ({ ...action, type: 'targetSelection' }))],
  ['combat-rotation', route.map(action => ({ ...action, type: 'attack' }))],
  ['long-cycle', Array.from({ length: 25 }, (_, index) => ({ type: index % 2 ? 'gather' : 'targetSelection', target: 'target-' + index }))],
]) for (let index = 0; index < 300; index++) assert.equal(routeAction(key, index, { cycle }), null, key + ' cannot provide route evidence');
for (let index = 0; index < 60; index++) assert.equal(routeAction('short-session', index, { gap: 8000 }), null, 'ten cycles without ten minutes are insufficient');
for (let index = 0; index < 119; index++) assert.equal(routeAction('changed-route', index, { cycle: index === 59 ? [{ type: 'gather', target: 'different-target' }] : route }), null, 'a changed landmark breaks the repeated sequence');
for (const [key, interruption] of [
  ['missing-context', { context: null }], ['invalid-context', { context: '{' }],
  ['oversized-context', { context: JSON.stringify(['forest', 'gather', 'x'.repeat(161)]) }],
  ['wrong-type-context', { context: JSON.stringify(['forest', 'attack', 'target-5']) }],
  ['area-change', { area: 'cave' }], ['idle-gap', { gap: 120001 }],
  ['bunched', { gap: 0 }], ['backwards', { gap: -1 }],
]) {
  for (let index = 0; index < 59; index++) assert.equal(routeAction(key, index), null);
  assert.equal(routeAction(key, 59, interruption), null, key + ' resets route continuity');
  for (let index = 60; index < 118; index++) assert.equal(routeAction(key, index), null, key + ' cannot bridge the interrupted route');
}
const longestRoute = Array.from({ length: 24 }, (_, index) => ({ type: index % 2 ? 'gather' : 'targetSelection', target: 'target-' + index }));
let longestEvidence;
for (let index = 0; index < 240; index++) {
  longestEvidence = routeAction('bounded-route', index, { cycle: longestRoute });
  if (index < 239) assert.equal(longestEvidence, null);
}
assert.equal(longestEvidence.sequence.length, 24); assert.equal(longestEvidence.intervals, 239);
assert.equal(longestEvidence.repetitions, 10, 'the longest supported cycle fits the bounded 240 observations');

const bounded = createActionGuard();
for (let i = 0; i < 20000; i++) assert.equal(bounded.action('ignored-' + i, ['move', 'ping', 'autoAttack', 'petLoot', 'unknown-' + i][i % 5], 0), null);
assert(bounded.block('kept', 7200000, 0));
for (let i = 0; i < 9999; i++) assert(bounded.message('account-' + i, 0), 'ignored action types create no account or per-type state');
assert.equal(bounded.message('overflow', 0), false, 'the account table has a hard bound');
assert.deepEqual(bounded.strike('overflow', 0), { blockedUntil: 0, count: 0, newlyBlocked: false }, 'capacity pressure is not recorded as cheating');
assert.equal(bounded.block('overflow', 60000, 0), false, 'caller must enforce durable cooldowns even if caching is full');
assert.equal(bounded.action('new-after-idle', 'loot', 3600001), null, 'action traffic also prunes expired idle state');
assert.equal(bounded.blockedUntil('kept', 3600001), 7200000, 'idle cleanup preserves active cooldowns');
assert(bounded.message('account-0', 3600001));
assert.equal(bounded.blockedUntil('kept', 7200000), 0);

console.log('PASS action guard: normal movement and bursts, flood limits, account cooldowns, review-only timing and randomized farming-route evidence, conservative exclusions, bounded state and idle cleanup.');
