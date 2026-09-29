import { randomUUID } from 'node:crypto';

// A fresh reply demonstrates protocol participation, never browser attestation.
// Keep this on the connection, so another socket cannot answer its challenges.
export function createClientChecks(userAgent = '') {
  const declaredScript = /^(?:node(?:\.js)?|undici|python(?:-requests|-urllib)?|aiohttp|curl|wget|go-http-client)(?:[\s/]|$)/i.test(userAgent.slice(0, 256));
  let pending, lastIssued = -Infinity;
  let checks = [];
  function prune(now) { checks = checks.filter(check => now - check.at <= 900000).slice(-6); }
  return {
    action(now) {
      prune(now);
      if (pending && now - pending.at >= 120000) pending = undefined;
      if (pending || now - lastIssued < 60000) return;
      pending = { nonce: randomUUID(), at: now, answered: false, mismatched: false, webdriver: false };
      lastIssued = now; checks.push(pending); checks = checks.slice(-6);
      return pending.nonce;
    },
    reply(message, now) {
      if (!message || Object.keys(message).length !== 3 || message.type !== 'clientCheck'
          || typeof message.nonce !== 'string' || message.nonce.length > 128 || typeof message.webdriver !== 'boolean') return false;
      if (!pending || now < pending.at || now - pending.at >= 120000) return false;
      if (message.nonce !== pending.nonce) {
        // A delayed/duplicate reply to our previous probe is harmless.
        if (!checks.some(check => check.nonce === message.nonce)) pending.mismatched = true;
        return false;
      }
      pending.answered = true; pending.webdriver = message.webdriver; pending = undefined;
      return true;
    },
    summary(startedAt, endedAt) {
      const recent = checks.filter(check => check.at >= startedAt && check.at <= endedAt);
      return { declaredScript, issued: recent.length, answered: recent.filter(check => check.answered).length,
        unanswered: recent.filter(check => !check.answered && endedAt - check.at >= 120000).length,
        mismatched: recent.filter(check => check.mismatched).length, automation: recent.filter(check => check.answered && check.webdriver).length };
    },
  };
}

const COUNTS = ['clicks', 'keys', 'drags', 'touchClicks', 'syntheticClicks', 'clickIntervals', 'sameCellClicks', 'resizes'];
const FIELDS = ['version', 'durationMs', 'viewportWidth', 'viewportHeight', ...COUNTS, 'clickMeanMs', 'clickJitter'];

export function inputActivityValid(sample) {
  return !!sample && typeof sample === 'object' && !Array.isArray(sample)
    && Object.keys(sample).length === FIELDS.length && FIELDS.every(key => Object.hasOwn(sample, key))
    && sample.version === 1 && Number.isFinite(sample.durationMs) && sample.durationMs >= 10000 && sample.durationMs <= 60000
    && ['viewportWidth', 'viewportHeight'].every(key => Number.isInteger(sample[key]) && sample[key] >= 100 && sample[key] <= 20000 && sample[key] % 100 === 0)
    && COUNTS.every(key => Number.isSafeInteger(sample[key]) && sample[key] >= 0 && sample[key] <= 10000)
    && sample.touchClicks <= sample.clicks && sample.drags <= sample.clicks && sample.sameCellClicks <= sample.clicks
    && sample.clickIntervals <= Math.max(0, sample.clicks - 1)
    && Number.isFinite(sample.clickMeanMs) && sample.clickMeanMs >= 0 && sample.clickMeanMs <= 60000
    && Number.isFinite(sample.clickJitter) && sample.clickJitter >= 0 && sample.clickJitter <= 100;
}

export function botEvidence(pattern, windows = [], runtime) {
  const route = pattern.reason === 'repeated-action-sequence';
  const signals = [route ? { id: 'repeated-farming-route', source: 'server', points: 60,
    summary: `${pattern.repetitions} exact repetitions of a ${pattern.sequence.length}-step mixed gathering/target-selection route across ${pattern.distinctTargets} targets over ${Math.round(pattern.durationMs / 1000)} seconds. Timing may vary. Normal farming routes can also repeat.` }
    : { id: 'regular-accepted-actions', source: 'server', points: 60,
      summary: `${pattern.intervals} accepted ${pattern.actionType} intervals over ${Math.round(pattern.durationMs / 1000)} seconds; mean ${Math.round(pattern.meanIntervalMs)} ms, timing variation ${(pattern.jitterRatio * 100).toFixed(2)}%.` }];
  if (runtime?.declaredScript) signals.push({ id: 'declared-script-client', source: 'client', points: 10,
    summary: 'The connection identified its HTTP client as a scripting library. This header can be changed or forged; the original header is not stored.' });
  if (runtime?.automation >= 3) signals.push({ id: 'browser-automation', source: 'client', points: 15,
    summary: `${runtime.automation} fresh runtime replies reported browser automation control (webdriver). Legitimate automated testing can do this too.` });
  const recent = windows.filter(window => window.at >= pattern.startedAt && window.at <= pattern.endedAt);
  let client;
  if (recent.length) {
    client = { windows: recent.length, durationMs: recent.reduce((sum, window) => sum + window.sample.durationMs, 0),
      viewportWidths: [...new Set(recent.map(window => window.sample.viewportWidth))],
      viewportHeights: [...new Set(recent.map(window => window.sample.viewportHeight))] };
    for (const key of COUNTS) client[key] = recent.reduce((sum, window) => sum + window.sample[key], 0);
    const clicks = recent.reduce((sum, { sample }) => sum + sample.clickIntervals, 0);
    client.clickMeanMs = clicks ? recent.reduce((sum, { sample }) => sum + sample.clickMeanMs * sample.clickIntervals, 0) / clicks : 0;
    // Include variation between windows; averaging their CVs would hide a
    // person alternating between slow and fast clicking.
    const variance = clicks ? recent.reduce((sum, { sample }) => sum + sample.clickIntervals
      * ((sample.clickMeanMs * sample.clickJitter) ** 2 + (sample.clickMeanMs - client.clickMeanMs) ** 2), 0) / clicks : 0;
    client.clickJitter = client.clickMeanMs ? Math.sqrt(variance) / client.clickMeanMs : 0;
    if (client.windows >= 5 && client.durationMs >= 150000 && clicks >= 60 && client.clickJitter <= .02) {
      signals.push({ id: 'regular-browser-clicks', source: 'client', points: 10,
        summary: `Browser reports ${clicks} click intervals with ${(client.clickJitter * 100).toFixed(2)}% timing variation. This is untrusted supporting context.` });
      if (!client.resizes && client.sameCellClicks >= client.clicks * .95) signals.push({ id: 'repeated-click-area', source: 'client', points: 5,
        summary: 'The regular clicks also concentrate in one coarse screen area per window. Repeated use of a normal game control can do this too.' });
    }
    if (client.windows >= 5 && client.durationMs >= 150000 && client.syntheticClicks >= 60) signals.push({ id: 'synthetic-click-events', source: 'client', points: 10,
      summary: `Browser reports ${client.syntheticClicks} script-generated click events. Extensions and assistive software can also generate these events.` });
  }
  return { version: 1, score: Math.min(100, signals.reduce((sum, signal) => sum + signal.points, 0)), threshold: 60, signals,
    server: { startedAt: pattern.startedAt, endedAt: pattern.endedAt, actionType: pattern.actionType, intervals: pattern.intervals, durationMs: pattern.durationMs,
      meanIntervalMs: pattern.meanIntervalMs, jitterRatio: pattern.jitterRatio,
      ...(route ? { sequence: pattern.sequence, repetitions: pattern.repetitions, distinctTargets: pattern.distinctTargets } : {}) }, ...(client ? { client } : {}), ...(runtime ? { runtime } : {}),
    limitations: ['This is a review priority score, not a probability or proof of botting.',
      'Browser telemetry can be modified or omitted. Missing telemetry, window size, no drags, keyboard-only and touch play do not add points.',
      'Runtime replies and browser headers can be emulated by scripts. Unanswered or mismatched checks are inconclusive, including older clients, loading and suspended tabs; they add no points.',
      'Automatic attacks, pet pickups, rejected actions and movement corrections are excluded. Client target selections are separate deliberate actions.',
      'A game master must corroborate the evidence and record a reason before banning.'] };
}

export function botEvidenceDescription(evidence) {
  const client = evidence.client;
  return [`Bot-risk review: ${evidence.score}/100; review threshold ${evidence.threshold}. No automatic ban.`,
    `Observed window: ${new Date(evidence.server.startedAt).toISOString()} to ${new Date(evidence.server.endedAt).toISOString()}.`,
    ...evidence.signals.map(signal => `${signal.source}: +${signal.points} — ${signal.summary}`),
    ...(evidence.runtime ? [`Recent retained runtime checks on this connection: ${evidence.runtime.issued} issued, ${evidence.runtime.answered} answered, ${evidence.runtime.unanswered} unanswered after two minutes. Fresh replies do not prove a human or a browser.`] : []),
    ...(evidence.server.sequence ? [`Repeated server-observed route: ${JSON.stringify(evidence.server.sequence)}`] : []),
    client ? `Browser-reported context: ${client.windows} windows over ${Math.round(client.durationMs / 1000)} seconds; viewport buckets ${client.viewportWidths.join('/')} × ${client.viewportHeights.join('/')} px; ${client.clicks} clicks, ${client.keys} key presses, ${client.drags} drags, ${client.touchClicks} touch presses, ${client.resizes} resizes. No raw coordinates or typed content collected.` : 'Browser interaction context: unavailable; no score adjustment.',
    ...evidence.limitations].join('\n');
}
