import assert from 'node:assert/strict';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const hook = registerHooks({
  resolve(specifier, context, next) { return next(context.parentURL?.includes('/src/') && /^\.\/[\w-]+$/.test(specifier) ? `${specifier}.ts` : specifier, context); },
  load(url, context, next) { return url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context); },
});
const { mountCommunityUI } = await import('../src/community-ui.ts');
hook.deregister();
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.dataset = {}; this.value = ''; this.checked = false; this.open = false; this.disabled = false; }
  set innerHTML(_) { throw Error('Community content must use safe text nodes.'); }
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return this.text || this.children.map(child => child.textContent).join(''); }
  get firstElementChild() { return this.children[0]; }
  get scrollHeight() { return this.children.length * 20; }
  getBoundingClientRect() { const top = this.parent ? this.parent.children.indexOf(this) * 20 - (this.parent.scrollTop || 0) : 0; return { top, bottom: top + (this.clientHeight || 20) }; }
  contains(node) { for (let current = node; current; current = current.parent) if (current === this) return true; return false; }
  setAttribute(key, value) { this.attributes[key] = value; }
  append(...nodes) { for (let node of nodes) { if (typeof node === 'string') node = Object.assign(new Element('#text'), { textContent: node }); node.parent = this; this.children.push(node); } }
  replaceChildren() { this.children = []; }
  remove() { this.parent.children = this.parent.children.filter(node => node !== this); }
  querySelectorAll(selector) { return this.children.flatMap(node => [...((selector === '[role="status"]' ? node.attributes.role === 'status' : node.tagName === selector) ? [node] : []), ...node.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0]; }
  addEventListener() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
  reportValidity() { return this.querySelectorAll('input').every(node => !node.required || (node.type === 'checkbox' ? node.checked : node.value.length)); }
}
globalThis.document = { body: new Element('body'), createElement: tag => new Element(tag), createTextNode: text => Object.assign(new Element('#text'), { textContent: text }) };
const sent = []; let stopped = 0;
const ui = mountCommunityUI(message => sent.push(message), () => stopped++), dialog = document.body.children[0];
const button = text => dialog.querySelectorAll('button').find(node => node.textContent === text);
const submit = () => dialog.querySelector('form').onsubmit({ preventDefault() {} });
ui.updateRules(false); assert(ui.isOpen()); assert.equal(stopped, 1); assert.equal(dialog.querySelectorAll('li').length, 3);
submit(); assert.equal(sent.length, 0, 'rules need explicit checkbox agreement');
dialog.querySelector('input').checked = true; submit(); submit(); assert.deepEqual(sent, [{ type: 'acceptCommunityRules', version: 1 }]);
button('Close').onclick(); ui.rules(); assert(!ui.isOpen(), 'reopening cannot duplicate an outstanding request');
ui.updateRules(true); assert(!ui.isOpen()); ui.rules(); assert(button('Rules accepted').disabled); ui.close();
ui.report('target', '<img onerror=alert(1)>', 'message'); assert.equal(dialog.querySelector('h2').textContent, 'Report <img onerror=alert(1)>');
dialog.querySelector('select').value = 'Harassment or threats'; dialog.querySelector('textarea').value = '  <script>evidence</script>  ';
submit(); assert.deepEqual(sent.at(-1), { type: 'playerReport', targetId: 'target', messageId: 'message', reason: 'Harassment or threats', details: '<script>evidence</script>' });
const pending = sent.length; ui.report('different', 'Other'); submit(); assert.equal(sent.length, pending);
ui.result(false, 'Try again.'); assert(dialog.querySelector('form')); assert(!button('Send report').disabled);
dialog.querySelector('textarea').value = 'Please review.'; submit(); ui.result(true, 'Report saved.'); assert(!dialog.querySelector('form')); assert.equal(dialog.querySelector('[role="status"]').textContent, 'Report saved.');
ui.inbox(); assert.deepEqual(sent.at(-1), { type: 'reportsList' }); ui.updateReports([{ id: 'report', targetId: 'target', targetName: '<script>Player</script>', reason: 'Harassment or threats', details: '<img>Claim', evidence: { text: '<script>Chat</script>', channel: 'world', at: 1 }, createdAt: 1, status: 'open' }]);
assert.equal(dialog.querySelector('blockquote').textContent, '[world] <script>Chat</script>');
const initial = sent.length; button('Ban account').onclick(); assert.equal(sent.length, initial, 'review needs a reason');
dialog.querySelector('form').querySelector('input').value = 'Reviewed repeated harassment.'; button('Ban account').onclick(); assert.equal(sent.length, initial, 'account ban needs explicit confirmation');
dialog.querySelector('form').querySelectorAll('input')[1].checked = true; button('Ban account').onclick(); button('Dismiss').onclick(); assert.equal(sent.length, initial + 1);
assert.deepEqual(sent.at(-1), { type: 'reviewReport', reportId: 'report', decision: 'ban', reason: 'Reviewed repeated harassment.' });
ui.result(false, 'Protected account.'); button('Dismiss').onclick(); assert.equal(sent.at(-1).decision, 'dismiss');
ui.result(true, 'Reviewed.'); ui.updateReports([]);
const history = dialog.querySelector('input'); history.checked = true; history.onchange(); assert.deepEqual(sent.at(-1), { type: 'reportsList', reviewed: true });
const securityEvidence = { version: 1, score: 68, threshold: 60, signals: [{ id: 'timing', source: 'server', points: 60, summary: 'Regular accepted actions <script>.' }, { id: 'clicks', source: 'client', points: 8, summary: 'Repeated click intervals.' }], server: { actionType: 'gather', startedAt: 1000, endedAt: 301000, intervals: 60, durationMs: 300000, meanIntervalMs: 5000, jitterRatio: .005 }, client: { windows: 5, durationMs: 300000, viewportWidths: [384], viewportHeights: [768], clicks: 70, keys: 0, drags: 2, touchClicks: 70, syntheticClicks: 0, clickIntervals: 60, clickMeanMs: 5000, clickJitter: .006, sameCellClicks: 60, resizes: 0 }, limitations: ['Browser reports can be modified. Timing does not prove botting.'] };
securityEvidence.runtime = { issued: 5, answered: 3, unanswered: 1, mismatched: 0, automation: 3, declaredScript: false };
Object.assign(securityEvidence.server, { sequence: ['gather <node>', 'targetSelection <enemy>'], repetitions: 10, distinctTargets: 6 });
ui.updateReports([{ id: 'guard', source: 'guard', realmId: 'asia', targetId: 'target', targetName: 'Player', reason: 'Possible scripted input', details: 'Later description', createdAt: 1, status: 'banned', securityEvidence: { ...securityEvidence, score: 2 }, decisionEvidence: { score: 68, securityEvidence, details: 'Observed repeated accepted actions.', reason: 'Possible scripted input', decision: 'ban', resolution: 'GM confirmed a repeated scripted route.', reviewerId: 'gm-id', reviewedAt: 2 } }]);
assert(dialog.textContent.includes('Bot suspicion score: 68/100'), 'history renders the immutable decision snapshot');
assert(dialog.textContent.includes('Client reported · unverified'));
assert(dialog.textContent.includes('3 of 5 fresh checks answered'));
assert(dialog.textContent.includes('1 unanswered (inconclusive)'));
assert(dialog.textContent.includes('10 repetitions · 6 targets · gather <node> → targetSelection <enemy>'));
assert(dialog.textContent.includes('Server evidence: Observed repeated accepted actions.'));
assert(dialog.textContent.includes('Regular accepted actions <script>.'), 'untrusted evidence remains safe text');
assert(dialog.textContent.includes('Widths: 384 px'));
assert(dialog.textContent.includes('Observation period'));
assert(dialog.textContent.includes(new Date(301000).toLocaleString()));
assert(dialog.textContent.includes('Why this account was banned'));
assert(dialog.textContent.includes('GM confirmed a repeated scripted route.'));
assert.equal(dialog.querySelectorAll('form').length, 0, 'closed reports cannot be reviewed again');
ui.close(); ui.updateReports([]); assert(!ui.isOpen(), 'late inbox response does not reopen a closed dialog');
ui.report('target', 'Player'); assert(ui.isOpen(), 'disconnect cleanup releases a pending request');
ui.close();
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8'), nodes = new Map(), preview = [];
const $ = id => { if (!nodes.has(id)) nodes.set(id, Object.assign(new Element('div'), { classList: { contains: () => false }, scrollTop: 0, clientHeight: 100, dataset: {} })); return nodes.get(id); };
const context = vm.createContext({ document, $, gmBadge: () => null, playerId: 'self', communityUI: ui, chatChannel: 'world', chatScroll: new Map(), chatScale: 100, mobileChat: () => false, chatPreviewMessages: preview, updateChatPreview() {}, updateChatUnread() {}, connected: true, players: [{ id: 'target', name: 'Player' }] });
const extract = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
vm.runInContext(stripTypeScriptTypes(extract('function currentChatScale(', 'function updateChatPreview(') + extract('function chatMessage(', '\nfunction send(')), context);
vm.runInContext("chatMessage('Original message','Player',undefined,undefined,'world',{targetId:'target',name:'Player',messageId:'server-message'});chatMessage('Own message','Me',undefined,undefined,'world',{targetId:'self',name:'Me'});", context);
const chatRows = $('chat-log-world').children; assert.equal(preview[0].name, 'Player', 'the persistent chat preview retains the speaker'); assert.equal(preview[0].text, 'Original message', 'Report does not pollute the persistent chat preview'); assert.equal(chatRows[1].querySelectorAll('button').length, 0, 'own messages omit Report');
chatRows[0].querySelector('button').onclick(); dialog.querySelector('select').value = 'Scam or spam'; submit(); assert.equal(sent.at(-1).messageId, 'server-message'); assert.equal(sent.at(-1).targetId, 'target'); ui.result(true, 'Saved.'); ui.close();
vm.runInContext(stripTypeScriptTypes(extract('function playerAction(', '\nfunction ')), context);
vm.runInContext("playerAction('report','target')", context); assert(ui.isOpen()); assert.equal(dialog.querySelector('h2').textContent, 'Report Player');
console.log('PASS community UI: explicit acceptance, safe text, actual chat/menu routing, unpolluted chat preview, evidence-bound report payload, retry/pending guards, required review reason, confirmed account ban, dismissal and disconnect cleanup.');
