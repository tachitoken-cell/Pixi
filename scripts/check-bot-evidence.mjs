import assert from 'node:assert/strict';
import { botEvidence, botEvidenceDescription, inputActivityValid, createClientChecks } from '../src/bot-evidence.mjs';
import { createActionGuard } from '../src/action-guard.mjs';

const pattern = { actionType: 'gather', intervals: 60, durationMs: 300000, meanIntervalMs: 5000, jitterRatio: 0, startedAt: 0, endedAt: 300000 };
const sample = { version: 1, durationMs: 30000, viewportWidth: 800, viewportHeight: 600, clicks: 80, keys: 0,
  drags: 0, touchClicks: 0, syntheticClicks: 0, clickIntervals: 79, clickMeanMs: 350, clickJitter: .001, sameCellClicks: 80, resizes: 0 };
assert(inputActivityValid(sample));
for (const patch of [{ durationMs: 1 }, { viewportWidth: -100 }, { viewportHeight: 601 }, { clicks: 10001 }, { drags: 81 },
  { clickIntervals: 80 }, { clickJitter: Infinity }, { keys: NaN }, { rawKeys: 'private' }, { touchClicks: -1 }]) assert(!inputActivityValid({ ...sample, ...patch }));
const noClient = botEvidence(pattern);
assert.equal(noClient.score, 60); assert.equal(noClient.client, undefined);
const windows = Array.from({ length: 10 }, (_, i) => ({ at: (i + 1) * 30000, sample }));
const regular = botEvidence(pattern, windows);
assert.equal(regular.score, 75); assert(regular.signals.some(signal => signal.source === 'server'));
assert.match(botEvidenceDescription(regular), /No automatic ban/);
const keyboard = botEvidence(pattern, windows.map(window => ({ ...window, sample: { ...sample, clicks: 0, keys: 80, clickIntervals: 0, clickMeanMs: 0, clickJitter: 0, sameCellClicks: 0 } })));
assert.equal(keyboard.score, noClient.score, 'keyboard-only input and no drags add no suspicion');
const absentInput = botEvidence(pattern, windows.map(window => ({ ...window, sample: { ...sample, clicks: 0, keys: 0, clickIntervals: 0, clickMeanMs: 0, clickJitter: 0, sameCellClicks: 0 } })));
assert.equal(absentInput.score, noClient.score, 'idle input alone adds no suspicion');
const varied = botEvidence(pattern, windows.map((window, i) => ({ ...window, sample: { ...sample, clickMeanMs: i % 2 ? 100 : 900 } })));
assert.equal(varied.score, 60, 'regular short windows at different speeds are not regular overall');
assert.equal(botEvidence(pattern, windows.map(window => ({ ...window, at: window.at + 600000 }))).score, 60, 'unrelated time windows cannot corroborate this pattern');
const guard = createActionGuard();
assert(guard.activity('one', sample, 30000));
assert(!guard.activity('one', sample, 30001), 'client cannot flood evidence windows');
assert(!guard.activity('one', sample, 20000), 'backwards timestamps add no sample');
for (let i = 2; i <= 20; i++) assert(guard.activity('one', sample, i * 30000));
assert.equal(guard.evidence('one', { ...pattern, startedAt: 300000, endedAt: 600000 }).client.windows, 10);
assert.equal(guard.evidence('other', pattern).client, undefined, 'account context stays isolated');
guard.strike('violation', 1000, 'Forged gold'); guard.strike('violation', 1600, 'Invalid input'); guard.strike('violation', 1700, 'Same burst');
assert.deepEqual(guard.strikeSummary('violation', 2000), { firstAt: 1000, lastAt: 1600, reasons: { 'Forged gold': 1, 'Invalid input': 1 } });
{
  const browser = createClientChecks('Mozilla/5.0'), other = createClientChecks(), script = createClientChecks('Python-requests/2.32');
  const first = browser.action(0), foreign = other.action(0);
  assert(first && foreign && first !== foreign);
  assert.equal(browser.action(1), undefined, 'pending challenges are not replaced by gameplay bursts');
  assert.equal(browser.reply({ type: 'clientCheck', nonce: first, webdriver: true, rawDevice: 'private' }, 1), false);
  assert.equal(browser.reply({ type: 'clientCheck', nonce: foreign, webdriver: true }, 2), false, 'another connection cannot supply a valid reply');
  assert(browser.reply({ type: 'clientCheck', nonce: first, webdriver: false }, 3));
  assert.equal(browser.reply({ type: 'clientCheck', nonce: first, webdriver: true }, 4), false, 'a consumed nonce cannot add automation evidence');
  for (const time of [60000, 120000, 180000]) {
    const nonce = browser.action(time);
    assert.equal(browser.reply({ type: 'clientCheck', nonce: first, webdriver: true }, time + 1), false, 'delayed duplicate replies are ignored');
    assert(browser.reply({ type: 'clientCheck', nonce, webdriver: true }, time + 2));
  }
  const summary = browser.summary(0, 300000);
  assert.deepEqual(summary, { declaredScript: false, issued: 4, answered: 4, unanswered: 0, mismatched: 1, automation: 3 });
  assert.equal(botEvidence(pattern, [], summary).score, 75, 'repeated automation claims support server-observed behavior');
  assert.equal(botEvidence(pattern, [], script.summary(0, 300000)).score, 70, 'explicit scripting-library header is untrusted supporting context');
  assert.equal(botEvidence(pattern, [], other.summary(0, 300000)).score, 60, 'an unanswered check adds no points');
  assert.equal(other.reply({ type: 'clientCheck', nonce: foreign, webdriver: true }, 120000), false, 'expired checks cannot change the score');
  for (let time = 360000; time <= 960000; time += 60000) {
    const nonce = browser.action(time); assert(browser.reply({ type: 'clientCheck', nonce, webdriver: false }, time + 1));
  }
  assert.equal(browser.summary(0, 1000000).issued, 6, 'per-connection runtime evidence remains bounded');
  assert.equal(browser.summary(950000, 1000000).issued, 1, 'runtime context is scoped to the behavior window');
  const report = botEvidence(pattern, [], { ...summary, mismatched: 3, declaredScript: true });
  assert.equal(report.score, 85, 'mismatched runtime replies are recorded but never scored');
  assert(!JSON.stringify(report).includes(first), 'nonce credentials are not copied into reports');
}
console.log('PASS bot evidence: bounded untrusted summaries, account/time isolation, neutral device/input context, pooled timing variation and counted violation details.');
