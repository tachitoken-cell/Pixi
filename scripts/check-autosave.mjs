import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const timers = new Map(), writes = [], records = { account: { characters: [{ id: 'hero', x: 0, gold: 0 }] } };
let now = 0, timerId = 0, calls = 0;
const context = {
  records, pendingGoldEvents: new Map(), closing: false, persistenceFailed: false, flush: Promise.resolve(), lastSaved: new Map(), sharedChanges: new Map(), sessions: new Map(),
  savedCharacters: () => new Map(records.account.characters.map(player => [player.id, player])), applyStoredRow() {},
  database: {
    owns: () => true,
    commit: async entries => {
      const write = { entries: structuredClone(entries) }; writes.push(write);
      await new Promise(resolve => { write.finish = resolve; });
      return entries.map(({ key, state }) => ({ account_key: key, state }));
    },
  },
  setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, at: now + delay }); return id; },
  clearTimeout: id => timers.delete(id), console, structuredClone,
  countSave: () => { calls++; },
};
runInNewContext(source.match(/  let saveTimer[^;]*;/)[0]
  + between('  function stagedPlayerChanges(', '  function releaseAccount(')
  + between('  function dirty()', '  function sendAchievements(')
  + `const originalSave = save; save = (...args) => { countSave(); return originalSave(...args); };
     api = { dirty, save, stop: () => { closing = true; clearTimeout(saveTimer); } };`, context);
const { api } = context, drain = () => new Promise(setImmediate);
async function advance(ms) {
  const end = now + ms;
  for (;;) {
    const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
    if (!next) break;
    const [id, timer] = next; now = timer.at; timers.delete(id); timer.callback(); await drain();
  }
  now = end; await drain();
}
const player = records.account.characters[0];
api.dirty(); await advance(1000);
assert.equal(writes.length, 1);
for (let movement = 1; movement <= 30; movement++) { player.x = movement; api.dirty(); await advance(1000); }
assert.equal(calls, 1, 'continuous movement must not queue autosaves behind an unfinished database write');
assert.equal(writes[0].entries[0].state.characters[0].x, 0, 'the held write cannot contain later movement');

// Explicit transactions keep their own promise and callback, even during autosave.
let applied = false;
const explicit = api.save(new Map(), () => { applied = true; });
assert.equal(calls, 2); assert.equal(applied, false);
writes[0].finish(); await drain();
assert.equal(writes.length, 2); assert.equal(applied, false);
player.x = 31; api.dirty(); await advance(1000);
assert.equal(calls, 3, 'all intervening dirty updates require only one follow-up autosave');
writes[1].finish(); await explicit; await drain();
assert.equal(applied, true); assert.equal(writes.length, 3);
assert.equal(writes[2].entries[0].state.characters[0].x, 31, 'the follow-up persists changes after the first snapshot');
writes[2].finish(); await drain();
assert.equal(timers.size, 0);

// Shutdown still performs its final explicit save and suppresses background retries.
player.x = 40; api.dirty(); await advance(1000);
player.x = 41; api.dirty(); api.stop();
const finalSave = api.save(); writes[3].finish(); await drain();
assert.equal(writes.length, 5); assert.equal(writes[4].entries[0].state.characters[0].x, 41);
writes[4].finish(); await finalSave; await advance(30000);
assert.equal(calls, 5); assert.equal(timers.size, 0);
console.log('PASS autosave: slow writes coalesce continuous movement, one follow-up captures later changes, explicit transactions retain callbacks, and shutdown persists final progress without rescheduling.');
