import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createChatTranslation } from '../src/chat-translation.mjs';
import { createGameServer } from '../server.mjs';
import { COMMUNITY_VERSION } from '../src/community.ts';
import { DEFAULT_APPEARANCE } from '../src/appearance.ts';

let clock = Date.UTC(2026, 0, 1), calls = [];
const response = (text, source = 'en') => ({ ok: true, json: async () => ({ data: { translations: [{ translatedText: text, detectedSourceLanguage: source }] } }) });
const translation = createChatTranslation({ apiKey: 'test-only', dailyCharacterLimit: 20, now: () => clock, request: async (url, options) => {
  calls.push({ url, options }); return response('Hej &#39;vän&#39;');
} });
assert.equal(createChatTranslation({ apiKey: '' }).enabled, false);
await assert.rejects(createChatTranslation({ apiKey: '' }).translate('Hello', 'sv'), /not enabled/);
await assert.rejects(translation.translate('Hello', '__proto__'), /supported language/);
await assert.rejects(translation.translate('x'.repeat(161), 'sv'), /recent chat/);
assert.deepEqual(await Promise.all([translation.translate('Hello', 'sv'), translation.translate('Hello', 'sv')]), ['Hej &#39;vän&#39;', 'Hej &#39;vän&#39;']);
assert.equal(calls.length, 1, 'concurrent identical requests share a provider request');
assert.equal(await translation.translate('Hello', 'sv'), 'Hej &#39;vän&#39;'); assert.equal(calls.length, 1, 'cache avoids billing');
assert.equal(calls[0].url, 'https://translation.googleapis.com/language/translate/v2');
assert.equal(calls[0].options.headers['x-goog-api-key'], 'test-only');
assert.deepEqual(JSON.parse(calls[0].options.body), { q: 'Hello', target: 'sv', format: 'text', model: 'nmt' });
assert(calls[0].options.signal instanceof AbortSignal); assert.equal(calls[0].options.redirect, 'error');
assert.equal(await translation.translate('Same', 'en'), 'Hej &#39;vän&#39;', 'all results retain provider encoding for consistent client decoding');
await assert.rejects(translation.translate('This exceeds the cap', 'sv'), /daily translation limit/);
clock += 86400_000; await translation.translate('Hello', 'sv'); assert.equal(calls.length, 3, 'daily guard resets and expired cache refreshes');
let failures = 0;
const failing = createChatTranslation({ apiKey: 'test', dailyCharacterLimit: 8, request: () => { failures++; throw Error('secret provider details'); } });
for (let i = 0; i < 2; i++) await assert.rejects(failing.translate('Oops', 'sv'), /temporarily unavailable/);
assert.equal(failures, 2, 'failed promises are evicted');
await assert.rejects(failing.translate('Oops', 'sv'), /daily translation limit/, 'failed calls keep reserved usage');
const malformed = createChatTranslation({ apiKey: 'test', request: async () => response('') });
await assert.rejects(malformed.translate('Hello', 'sv'), /temporarily unavailable/);
// Separate resolver collection makes the exact global concurrency ceiling observable.
const releases = [], limited = createChatTranslation({ apiKey: 'test', request: () => new Promise(resolve => releases.push(() => resolve(response('Hej')))) });
const pending = Array.from({ length: 8 }, (_, i) => limited.translate(`Message ${i}`, 'sv'));
await assert.rejects(limited.translate('Ninth', 'sv'), /busy/);
releases.forEach(resolve => resolve()); await Promise.all(pending);
const unicode = createChatTranslation({ apiKey: 'test', dailyCharacterLimit: 1, request: async () => response('Smile') });
assert.equal(await unicode.translate('😀', 'sv'), 'Smile', 'billing counts Unicode codepoints');
await assert.rejects(unicode.translate('a', 'sv'), /daily translation limit/);

const directory = mkdtempSync(join(tmpdir(), 'mossvale-chat-translation-')), clients = [], realNow = Date.now;
let game, port, elapsed = 0, providerCalls = [], hold;
Date.now = () => realNow() + elapsed;
const until = async (fn, label) => { for (let i = 0; i < 300; i++) { const value = fn(); if (value) return value; await delay(10); } throw Error(`Timed out: ${label}`); };
async function connect() {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/socket`), client = { socket, messages: [] }; clients.push(client);
  client.send = message => socket.send(JSON.stringify(message)); socket.on('message', raw => client.messages.push(JSON.parse(raw)));
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); }); return client;
}
async function request(client, message, type = 'chatTranslation') {
  const start = client.messages.length; client.send(message); return until(() => client.messages.slice(start).find(item => item.type === type), message.type);
}
async function enter(name) {
  const client = await connect(); await request(client, { type: 'join' }, 'roster');
  await request(client, { type: 'acceptCommunityRules', version: COMMUNITY_VERSION }, 'community');
  const roster = await request(client, { type: 'createCharacter', name, appearance: DEFAULT_APPEARANCE }, 'roster');
  client.welcome = await request(client, { type: 'selectCharacter', characterId: roster.characters[0].id }, 'welcome');
  client.id = client.welcome.id; return client;
}
const translate = (client, messageId, extra = {}) => request(client, { type: 'translateChat', messageId, targetLanguage: 'sv', ...extra });
try {
  game = createGameServer({ port: 0, host: '127.0.0.1', dataDir: directory, keycloak: null, databaseUrl: '', chatTranslation: { enabled: true, translate: async (text, language) => {
    providerCalls.push([text, language]); if (['Delayed', 'Eviction'].includes(text)) await new Promise(resolve => { hold = resolve; }); return `Swedish: ${text}`;
  } } });
  port = await game.start();
  const anonymous = await connect();
  assert.match((await request(anonymous, { type: 'translateChat', messageId: randomUUID(), targetLanguage: 'sv' }, 'event')).text, /Sign in/);
  const alice = await enter('Alice'), bob = await enter('Bob'), eve = await enter('Eve');
  assert.equal(alice.welcome.chatTranslation, true);
  alice.send({ type: 'chat', text: 'Hello realm' });
  const world = await until(() => bob.messages.find(item => item.kind === 'chat'), 'world message');
  assert.equal((await translate(bob, world.messageId)).text, 'Swedish: Hello realm');
  assert.deepEqual(providerCalls.at(-1), ['Hello realm', 'sv'], 'server supplies original text without author prefix');
  const beforeInvalid = providerCalls.length;
  assert.match((await translate(bob, randomUUID())).error, /no longer available/);
  assert.match((await translate(bob, world.messageId, { text: 'Arbitrary text' })).error, /recent chat/);
  assert.match((await translate(bob, world.messageId, { targetLanguage: '__proto__' })).error, /supported language/);
  assert.equal(providerCalls.length, beforeInvalid, 'invalid requests never reach provider');
  elapsed += 1000; alice.send({ type: 'whisper', targetId: bob.id, text: 'Private hello' });
  const whisper = await until(() => bob.messages.find(item => item.type === 'whisper'), 'private message');
  assert.equal((await translate(bob, whisper.messageId)).text, 'Swedish: Private hello');
  const beforePrivate = providerCalls.length;
  assert.match((await translate(eve, whisper.messageId)).error, /no longer available/);
  assert.equal(providerCalls.length, beforePrivate, 'another player cannot translate private messages');
  elapsed += 1000; alice.send({ type: 'chat', text: 'Eviction' });
  const evicted = await until(() => bob.messages.find(item => item.content === 'Eviction'), 'eviction message');
  bob.send({ type: 'translateChat', messageId: evicted.messageId, targetLanguage: 'sv' }); await until(() => hold, 'pending eviction translation');
  let retained;
  for (let i = 0; i < 120; i++) {
    elapsed += 1000; alice.send({ type: 'chat', text: `Fill ${i}` });
    retained = await until(() => bob.messages.find(item => item.content === `Fill ${i}`), 'receipt retention');
  }
  hold(); hold = null;
  const evictionResult = await until(() => bob.messages.find(item => item.type === 'chatTranslation' && item.messageId === evicted.messageId), 'evicted receipt response');
  assert.equal(evictionResult.skipped, true); assert.equal(evictionResult.text, undefined, 'receipt evicted during translation is skipped without leaking text');
  assert.equal((await translate(bob, evicted.messageId)).skipped, true, 'expired receipts explicitly let the client continue');
  elapsed += 1000; alice.send({ type: 'chat', text: 'Delayed' });
  const delayed = await until(() => bob.messages.find(item => item.content === 'Delayed'), 'delayed message');
  bob.send({ type: 'translateChat', messageId: delayed.messageId, targetLanguage: 'sv' });
  await until(() => hold, 'pending provider call'); await request(bob, { type: 'leaveWorld' }, 'roster');
  hold(); await delay(30); assert(!bob.messages.some(item => item.type === 'chatTranslation' && item.messageId === delayed.messageId), 'late result cannot enter a different character session');
  elapsed += 61_000;
  for (let i = 0; i < 120; i++) { if (i % 30 === 0) elapsed += 1000; assert.equal((await translate(alice, retained.messageId)).error, undefined); }
  assert.match((await translate(alice, retained.messageId)).error, /Wait a moment/);
  // Leaving/reentering the character must not reset the account's allowance.
  await request(alice, { type: 'leaveWorld' }, 'roster'); await request(alice, { type: 'selectCharacter', characterId: alice.id }, 'welcome');
  assert.match((await translate(alice, retained.messageId)).error, /Wait a moment/);
  console.log('PASS chat translation: provider contract, cache/deduplication, bounded concurrency, Unicode daily guard, failure reservation, strict authenticated receipt access, whisper isolation, receipt eviction, stale-session suppression and account rate limit.');
} finally {
  for (const client of clients) client.socket.terminate(); await game?.stop(); Date.now = realNow; rmSync(directory, { recursive: true, force: true });
}
