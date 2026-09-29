import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { abilityValid } from '../src/spells.ts';
import { isHostilePlayer, isHostileTarget, chooseTarget } from '../src/targeting.ts';

const source = stripTypeScriptTypes(readFileSync(new URL('../src/mobile-controls.ts', import.meta.url), 'utf8')).replace(/^export /gm, '');
class Target {
  events = new Map(); captures = []; styles = new Map(); matches = false; focused = false; children = [];
  classes = new Set();
  classList = { toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name), add: name => this.classes.add(name), remove: name => this.classes.delete(name) };
  style = { setProperty: (name, value) => this.styles.set(name, value) };
  addEventListener(type, listener, options) { const rows = this.events.get(type) || []; rows.push({ listener, options }); this.events.set(type, rows); }
  append(child) { this.children.push(child); }
  setPointerCapture(id) { this.captures.push(id); }
  focus() { this.focused = true; }
  isConnected = true; disabled = false; excluded = false; hidden = false; control = true; gameplay = false; clicks = 0;
  closest(selector) { return selector === 'button, summary' ? this.control ? this : null : selector === '#mobile-actions, #hotbar, #mobile-tools, #mobile-move' ? this.gameplay ? this : null : selector === '[hidden], [inert]' ? this.hidden ? this : null : this.excluded ? this : null; }
  click() { this.clicks++; }
  contains(target) { return target === this; }
  dispatchEvent(event) { assert.equal(event.type, 'click'); assert(event.bubbles && event.cancelable); this.click(); }
  getBoundingClientRect() { return { left: 100, top: 40, right: 300, bottom: 240, width: 200, height: 200 }; }
  fire(type, properties = {}) {
    const event = { pointerId: 1, pointerType: 'touch', button: 0, clientX: 200, clientY: 140, timeStamp: 0,
      prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...properties };
    for (const { listener } of this.events.get(type) || []) { listener(event); if (event.stopped) break; }
    return event;
  }
}
function fixture(now = () => performance.now()) {
  const window = new Target(); window.innerWidth=844; window.innerHeight=390; window.visualViewport=new Target(); Object.assign(window.visualViewport,{width:844,height:390,offsetTop:0,offsetLeft:0,scale:1}); const document = new Target(), navigator = {}, media = new Map(), timers = [], meta = { content: 'width=device-width, initial-scale=1.0, viewport-fit=cover' }; document.body = new Target();
  document.createElement = () => new Target(); document.querySelector = () => meta;
  const api = runInNewContext(`${source}\n({initControlMode, bindJoystick, bindTouchCamera, bindTouchActions})`, { window, document, navigator, Element: Target, performance: { now },
    setTimeout: callback => timers.push(callback),
    MouseEvent: class { constructor(type, options) { Object.assign(this, {type}, options); } },
    matchMedia: query => { if (!media.has(query)) media.set(query, new Target()); return media.get(query); } });
  return { ...api, window, document, navigator, media, timers, meta };
}
const mode = fixture(); mode.initControlMode();
assert.equal(mode.document.body.styles.get('--mobile-vh'),'390px');
mode.window.visualViewport.height=180; mode.window.visualViewport.offsetTop=12; mode.window.visualViewport.fire('resize');
assert.equal(mode.document.body.styles.get('--mobile-vh'),'180px','keyboard height tracks actual visible viewport');
assert.equal(mode.document.body.styles.get('--mobile-vtop'),'12px');
const resetZoom = mode.document.body.children[0], viewportContent = mode.meta.content;
assert(resetZoom.hidden, 'normal-scale keyboard resize never offers or forces a zoom reset');
mode.window.visualViewport.scale=2; mode.window.visualViewport.fire('resize');
assert(!resetZoom.hidden, 'magnification offers a user-controlled recovery');
assert.equal(mode.document.body.styles.get('--mobile-inverse-scale'),'0.5', 'recovery stays at readable physical size');
assert.equal(mode.meta.content,viewportContent,'magnification is never reset automatically');
resetZoom.onclick(); assert(resetZoom.disabled); assert.match(mode.meta.content,/maximum-scale=1/);
resetZoom.onclick(); assert.equal(mode.timers.length,1,'repeated activation cannot retain the temporary scale limit');
mode.timers.shift()(); assert.equal(mode.meta.content,viewportContent,'recovery restores the exact accessible viewport policy'); assert(!resetZoom.disabled);
mode.window.visualViewport.scale=1; mode.window.visualViewport.fire('resize'); assert(resetZoom.hidden);
const layoutSource = stripTypeScriptTypes(readFileSync(new URL('../src/mobile-layout.ts', import.meta.url), 'utf8'));
const editorControl = new Target(), gameControl = new Target();
const layoutBoundaryContext = { draft: {}, overlay: { contains: target => target === editorControl }, document: { getElementById: id => id === 'mobile-reset-zoom' ? resetZoom : null } };
const layoutBoundary = runInNewContext(layoutSource.match(/^  const stopOutside = .*$/m)[0] + ';stopOutside', layoutBoundaryContext);
for (const type of ['pointerdown', 'pointerup', 'click', 'touchend']) {
  for (const [target, blocked] of [[resetZoom, false], [editorControl, false], [gameControl, true]]) {
    const event = { type, target, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
    layoutBoundary(event);
    assert.equal(event.prevented, blocked, 'layout editing keeps zoom recovery and editor controls reachable while blocking gameplay');
    assert.equal(event.stopped, blocked);
  }
}
const mobile = () => mode.document.body.classes.has('mobile-controls');
assert(!mobile(), 'desktop browser keeps keyboard controls');
for (const query of ['(display-mode: standalone)', '(pointer: coarse), (max-width: 800px)']) {
  const media = mode.media.get(query);
  media.matches = true; media.fire('change'); assert(mobile(), `${query} enables touch controls`);
  media.matches = false; media.fire('change'); assert(!mobile(), 'resizing or leaving standalone recalculates the current mode');
}
mode.navigator.standalone = true; mode.window.fire('pageshow'); assert(mobile(), 'iOS home-screen launch enables controls');
mode.navigator.standalone = false; mode.window.fire('pageshow'); assert(!mobile());
mode.window.ReactNativeWebView = {}; mode.window.fire('pageshow'); assert(mobile(), 'native WebView bridge enables controls without device sniffing');
delete mode.window.ReactNativeWebView; mode.window.fire('pageshow'); assert(!mobile());
mode.window.__MOSSVALE_NATIVE__ = true; mode.window.fire('pageshow'); assert(mobile(), 'Expo injection enables controls');
delete mode.window.__MOSSVALE_NATIVE__; mode.window.fire('pageshow'); assert(!mobile());

function joystick() {
  const f = fixture(), button = new Target(), keys = new Set(['w', 'shift']); let allowed = true, starts = 0;
  const movement = f.bindJoystick(button, keys, () => allowed, () => starts++);
  return { ...f, button, keys, movement, block: () => { allowed = false; }, get starts() { return starts; } };
}
const stick = joystick();
stick.button.fire('pointerdown', { button: 2 }); assert.equal(stick.button.captures.length, 0);
assert(stick.button.fire('pointerdown').prevented); assert.deepEqual(stick.button.captures, [1]);
assert.equal(stick.movement.x, 0); assert(!stick.keys.has('touch-move')); assert.equal(stick.starts, 0);
stick.button.fire('pointermove', { clientX: 204 }); assert.equal(stick.movement.x, 0, 'small motion stays inside the deadzone');
stick.button.fire('pointermove', { clientX: 230 }); assert.equal(stick.movement.x, .5, 'half-radius displacement gives analog input');
assert(stick.keys.has('touch-move')); assert.equal(stick.starts, 1); assert.equal(stick.button.styles.get('--stick-x'), '30px');
stick.button.fire('pointermove', { clientX: 800, clientY: 740 });
assert(Math.abs(Math.hypot(stick.movement.x, stick.movement.y) - 1) < 1e-12, 'diagonal movement clamps to unit length');
const held = { ...stick.movement };
for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) stick.button.fire(type, { pointerId: 2, clientX: 1 });
assert.equal(stick.movement.x, held.x); assert.equal(stick.movement.y, held.y); assert.deepEqual(stick.button.captures, [1], 'another finger never steals the joystick');
stick.button.fire('pointermove'); assert(!stick.keys.has('touch-move'), 'returning to centre releases movement');
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur', 'pagehide', 'mobile-ui-open', 'visibilitychange']) {
  const f = joystick(); f.button.fire('pointerdown', { clientX: 250 });
  (['blur','pagehide','mobile-ui-open'].includes(type) ? f.window : type === 'visibilitychange' ? f.document : f.button).fire(type);
  assert.equal(f.movement.x, 0); assert.equal(f.movement.y, 0); assert.deepEqual([...f.keys], ['w', 'shift'], `${type} releases only joystick input`);
  assert(!f.button.classes.has('is-held')); assert.equal(f.button.styles.get('--stick-x'), '0px'); assert.equal(f.button.styles.get('--stick-y'), '0px');
  f.button.fire('pointermove', { clientX: 250 }); assert.equal(f.movement.x, 0, 'cancelled gesture cannot restart without a fresh press');
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'orientationchange', 'touchend', 'touchcancel']) {
  const f = joystick(); f.button.fire('pointerdown', { clientX: 250 });
  f.window.fire('pointerup', { pointerId: 2 });
  f.window.fire('touchend', { touches: [{ target: f.button }] });
  assert(f.keys.has('touch-move'), 'another finger ending does not stop the joystick');
  f.window.fire(type, { touches: [] });
  assert.equal(f.movement.x, 0, `${type} outside the captured control releases movement`);
  assert(!f.keys.has('touch-move'));
  f.button.fire('pointermove', { clientX: 250 }); assert.equal(f.movement.x, 0);
}
const blocked = joystick(); blocked.block(); blocked.button.fire('pointerdown', { clientX: 250 }); assert.equal(blocked.starts, 0); assert.equal(blocked.button.captures.length, 0);
const interrupted = joystick(); interrupted.button.fire('pointerdown', { clientX: 250 }); interrupted.block(); interrupted.button.fire('pointermove', { clientX: 250 });
assert.equal(interrupted.movement.x, 0); assert(!interrupted.keys.has('touch-move'), 'opening a modal stops the active gesture');

// Mobile browsers may dispatch only pointer events for the second thumb.
const touchActions = fixture(), actionRoot = new Target(), actionStick = new Target(), actionKeys = new Set();
touchActions.bindTouchActions(actionRoot);
assert(actionRoot.events.get('pointerdown')[0].options, 'delegation captures controls that stop propagation');
const actionMove = touchActions.bindJoystick(actionStick, actionKeys, () => true, () => {});
actionStick.fire('pointerdown', { pointerId: 1, clientX: 250 });
assert.equal(actionRoot.events.get('touchend')[0].options.passive, false, 'native touch defaults must be cancellable');
const gameplayButton = new Target(); gameplayButton.matches = () => false;
for (let i = 0; i < 20; i++) {
  const props = { target: gameplayButton, pointerId: 2, isPrimary: false };
  actionRoot.fire('pointerdown', props); actionRoot.fire('pointerup', props);
  assert(actionRoot.fire('touchend', { changedTouches: [{ target: gameplayButton, clientX: 200, clientY: 140 }] }).prevented, 'rapid gameplay taps cancel native double-tap zoom');
  assert.equal(gameplayButton.clicks, i + 1, 'touch default cancellation leaves exactly one action per completed tap');
  assert(actionRoot.fire('click', { ...props, detail: 1 }).stopped, 'compatibility clicks remain suppressed');
  assert(actionMove.x > 0 && actionKeys.has('touch-move'), 'cancelling the action touch keeps the other movement finger active');
}
const readingTarget = new Target(); readingTarget.control = false;
for (const target of [readingTarget, null]) {
  assert(!actionRoot.fire('touchend', { changedTouches: [{ target }] }).prevented, 'reading, form and non-control touches retain browser defaults');
}
for (const name of ['attack', 'potion', 'jump', 'sprint', 'target', 'menu', 'chat', 'backpack', 'panel back', 'panel close', 'details summary']) {
  const button = new Target(); button.matches = () => button.disabled; const props = { target: button, pointerId: 2, isPrimary: false };
  actionRoot.fire('pointerdown', props); assert.equal(button.clicks, 0, 'pressing alone does not activate');
  actionRoot.fire('pointerup', props); assert.equal(button.clicks, 1, `${name} activates without a browser click`);
  assert(actionRoot.fire('touchend', { changedTouches: [{ target: button, clientX: 200, clientY: 140 }] }).prevented, `${name} cancels native tap zoom outside the gameplay containers too`);
  assert(actionMove.x > 0 && actionKeys.has('touch-move'), 'secondary tap does not release joystick');
  assert(actionRoot.fire('click', { ...props, detail: 1 }).stopped, 'a browser-generated touch click cannot activate twice');
  assert(!actionRoot.fire('click', { ...props, detail: 0 }).stopped, 'keyboard and programmatic clicks retain native activation');
  assert(!actionRoot.fire('click', { ...props, pointerType: 'mouse', detail: 1 }).stopped, 'mouse input remains independent');
}
// Pagination replaces the tapped node before the browser delivers its native click.
let tapTime = 1000, merchantPage = 1;
const pagerRoot = new Target(), pagerTouch = fixture(() => tapTime);
const pagerButton = () => { const button = new Target(); button.matches = () => false; return button; };
let nextPage = pagerButton();
const advancePage = () => { nextPage.isConnected = false; nextPage = pagerButton(); nextPage.click = advancePage; merchantPage++; };
nextPage.click = advancePage; pagerTouch.bindTouchActions(pagerRoot);
const tapPage = () => { const props = { target: nextPage }; pagerRoot.fire('pointerdown', props); pagerRoot.fire('pointerup', props); };
tapPage(); assert.equal(merchantPage, 2);
for (const pointerType of ['touch', undefined]) assert(pagerRoot.fire('click', { target: nextPage, pointerType, detail: 1 }).stopped, 'rerendered next-page button suppresses the native follow-up');
assert(pagerRoot.fire('click', { target: readingTarget, detail: 1 }).stopped, 'a revealed backdrop cannot receive the completed tap again');
assert(!pagerRoot.fire('click', { target: nextPage, clientX: 250, detail: 1 }).stopped, 'a different tap location is unaffected');
assert(!pagerRoot.fire('click', { target: nextPage, pointerType: 'mouse', detail: 1 }).stopped);
assert(!pagerRoot.fire('click', { target: nextPage, pointerType: 'pen', detail: 1 }).stopped);
assert(!pagerRoot.fire('click', { target: nextPage, detail: 0 }).stopped);
pagerRoot.fire('pointerdown', { target: readingTarget }); pagerRoot.fire('pointerup', { target: readingTarget });
assert(!pagerRoot.fire('click', { target: readingTarget, detail: 1 }).stopped, 'a fresh tap on a revealed native link or form control is allowed');
tapPage(); assert.equal(merchantPage, 3, 'a second intentional tap advances immediately');
tapTime += 801;
assert(!pagerRoot.fire('click', { target: nextPage, detail: 1 }).stopped, 'suppression expires');
const channelButton = new Target(), channelLine = new Target(); let channelClick;
channelButton.matches = () => false; channelButton.contains = target => target === channelLine;
channelLine.closest = () => channelButton; channelLine.dispatchEvent = event => { channelClick = event; };
actionRoot.fire('pointerdown', {target: channelLine, pointerId: 4});
actionRoot.fire('pointerup', {target: channelLine, pointerId: 4, shiftKey: true, clientX: 204});
assert(channelClick?.shiftKey && channelClick.clientX === 204, 'delegated channel targets and modifier keys survive the touch click');
for (const reason of ['scrolled', 'shifted', 'pointercancel', 'lostpointercapture', 'blur', 'pagehide', 'mobile-ui-open', 'visibilitychange', 'moved', 'released-outside', 'removed', 'disabled', 'hidden']) {
  const button = new Target(); button.matches = () => button.disabled; const props = { target: button, pointerId: 3 };
  button.matches = () => button.disabled;
  actionRoot.fire('pointerdown', props);
  if (reason === 'scrolled') actionRoot.fire('scroll', { target: button });
  else if (reason === 'shifted') button.getBoundingClientRect = () => ({ left: 100, top: 30, right: 300, bottom: 230 });
  else if (reason === 'moved') actionRoot.fire('pointermove', { ...props, clientX: 225 });
  else if (reason === 'removed') button.isConnected = false;
  else if (reason === 'disabled') button.disabled = true;
  else if (reason === 'hidden') button.hidden = true;
  else if (reason !== 'released-outside') (['blur', 'pagehide', 'mobile-ui-open'].includes(reason) ? touchActions.window : reason === 'visibilitychange' ? touchActions.document : actionRoot).fire(reason, props);
  actionRoot.fire('pointerup', { ...props, ...(reason === 'released-outside' ? { clientX: 301 } : {}) });
  assert.equal(button.clicks, 0, `${reason} cancels the touch action`);
  assert(!actionRoot.fire('touchend', { changedTouches: [{ target: button, clientX: 200, clientY: 140 }] }).prevented, `${reason} preserves the native scroll ending`);
}
for (const properties of [{ pointerType: 'mouse' }, { pointerType: 'pen' }, { button: 2 }, { excluded: true }, { excluded: true, gameplay: true }, { disabled: true }]) {
  const button = new Target(); button.excluded = properties.excluded; button.gameplay = properties.gameplay; button.disabled = properties.disabled; button.matches = () => !!button.disabled;
  const props = { target: button, ...properties };
  actionRoot.fire('pointerdown', props); actionRoot.fire('pointerup', props);
  assert.equal(button.clicks, 0, 'other input types, held controls, and disabled controls keep their own handlers');
  if (button.excluded) assert.equal(actionRoot.fire('touchend', { changedTouches: [{ target: button, clientX: 200, clientY: 140 }] }).prevented, !!button.gameplay, 'held gameplay controls retain native zoom prevention; other held controls keep their own defaults');
}

if (process.argv.includes('--touch-actions')) {
  console.log('Touch actions passed: completed taps once, swipe/scroll/layout-shift cancellation, native scroll endings, keyboard/mouse and held joystick.');
  process.exit(0);
}

function camera() {
  const f = fixture(), canvas = new Target(), orbits = [], zooms = [], selections = []; let enabled = true, jumps = 0;
  f.bindTouchCamera(canvas, { enabled: () => enabled, orbit: (x, y) => orbits.push([x, y]), zoom: ratio => zooms.push(ratio), select: (x, y) => selections.push([x, y]), jump: () => jumps++ });
  return { ...f, canvas, orbits, zooms, selections, get jumps() { return jumps; }, block: () => { enabled = false; }, allow: () => { enabled = true; } };
}
const tap = camera();
assert(!tap.canvas.fire('pointerdown', { pointerType: 'mouse' }).stopped); assert.equal(tap.canvas.captures.length, 0, 'mouse stays with its existing handlers');
assert(tap.canvas.fire('pointerdown').stopped); assert(tap.canvas.focused); tap.canvas.fire('pointerup');
assert.deepEqual(tap.selections, [[200, 140]], 'one tap selects once');
assert(tap.canvas.events.get('pointerdown')[0].options.capture, 'touch intercepts the existing mouse handlers first');
const orbit = camera(); orbit.canvas.fire('pointerdown'); orbit.canvas.fire('pointermove', { clientX: 205 }); orbit.canvas.fire('pointermove'); orbit.canvas.fire('pointerup');
assert.deepEqual(orbit.orbits, [[5, 0], [-5, 0]]); assert.equal(orbit.selections.length, 0, 'cumulative travel distinguishes an orbit returning to its start from a tap');
const pinch = camera(); pinch.canvas.fire('pointerdown', { clientX: 100 }); pinch.canvas.fire('pointerdown', { pointerId: 2, clientX: 200 });
pinch.canvas.fire('pointermove', { pointerId: 2, clientX: 300 }); assert.deepEqual(pinch.zooms, [.5]); assert.equal(pinch.orbits.length, 0);
pinch.canvas.fire('pointerup', { pointerId: 2, clientX: 300 }); pinch.canvas.fire('pointerup', { clientX: 100 });
assert.equal(pinch.selections.length, 0, 'releasing the remaining finger after pinch cannot select a target');
pinch.canvas.fire('pointerdown'); pinch.canvas.fire('pointerup'); assert.equal(pinch.selections.length, 1, 'next independent tap works after pinch');
for (const type of ['pointercancel', 'lostpointercapture', 'blur', 'pagehide', 'mobile-ui-open', 'visibilitychange']) {
  const f = camera(); f.canvas.fire('pointerdown');
  (['blur','pagehide','mobile-ui-open'].includes(type) ? f.window : type === 'visibilitychange' ? f.document : f.canvas).fire(type);
  f.canvas.fire('pointermove', { clientX: 240 }); f.canvas.fire('pointerup');
  assert.equal(f.selections.length, 0, `${type} cannot turn into selection`); assert.equal(f.orbits.length, 0);
}
const modal = camera(); modal.block(); modal.canvas.fire('pointerdown'); modal.allow(); modal.canvas.fire('pointerup'); assert.equal(modal.selections.length, 0, 'a modal blocks new camera input');
modal.canvas.fire('pointerdown'); modal.block(); modal.canvas.fire('pointermove', { clientX: 240 }); modal.allow(); modal.canvas.fire('pointerup');
assert.equal(modal.selections.length, 0); assert.equal(modal.orbits.length, 0, 'opening a modal discards an in-progress camera gesture');
function touchTap(f, time, properties = {}, duration = 40) {
  f.canvas.fire('pointerdown', { timeStamp: time, ...properties });
  f.canvas.fire('pointerup', { timeStamp: time + duration, ...properties });
  f.canvas.fire('lostpointercapture', { timeStamp: time + duration, ...properties });
}
const running = camera(), runStick = new Target(), runKeys = new Set();
const runMove = running.bindJoystick(runStick, runKeys, () => true, () => {});
runStick.fire('pointerdown', { pointerId: 1, clientX: 250 });
touchTap(running, 0, { pointerId: 2, isPrimary: false }); touchTap(running, 160, { pointerId: 3, isPrimary: false, clientX: 215 });
assert.equal(running.jumps, 1, 'secondary-finger double tap jumps despite normal capture release');
assert.equal(running.selections.length, 1, 'single-tap selection stays immediate; the second tap jumps');
assert(runKeys.has('touch-move')); assert(runMove.x > 0, 'double tap preserves held analog movement');
touchTap(running, 240); assert.equal(running.jumps, 1, 'a completed pair is consumed, so a third tap cannot jump twice');
for (const [time, properties, duration] of [[341, {}, 40], [160, { clientX: 260 }, 40], [80, {}, 350], [160, { pointerType: 'mouse' }, 40]]) {
  const f = camera(); touchTap(f, 0); touchTap(f, time, properties, duration); assert.equal(f.jumps, 0, 'slow, distant, held or mouse input cannot complete a double tap');
}
const longPress = camera(); touchTap(longPress, 0, {}, 400); touchTap(longPress, 440); assert.equal(longPress.jumps, 0, 'a long press cannot begin a double tap');
for (const type of ['orbit', 'pinch', 'pointercancel', 'lostpointercapture', 'blur', 'pagehide', 'mobile-ui-open', 'visibilitychange', 'disabled']) {
  const f = camera(); touchTap(f, 0); f.canvas.fire('pointerdown', { timeStamp: 60 });
  if (type === 'orbit') f.canvas.fire('pointermove', { clientX: 240 });
  else if (type === 'pinch') { f.canvas.fire('pointerdown', { pointerId: 2 }); f.canvas.fire('pointerup', { pointerId: 2 }); }
  else if (type === 'disabled') { f.block(); f.canvas.fire('pointermove'); f.allow(); }
  else (['blur', 'pagehide', 'mobile-ui-open'].includes(type) ? f.window : type === 'visibilitychange' ? f.document : f.canvas).fire(type);
  f.canvas.fire('pointerup', { timeStamp: 100 }); touchTap(f, 160);
  assert.equal(f.jumps, 0, `${type} discards the pending double tap`);
}
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const dragButton = new Target(), dragMessages = [];
const dragRuntime = { ...fixture(), keys: new Set(), canUseMobile: () => true, $: () => dragButton,
  player: { gathering: null }, connected: true, cancelledGather: 0, gatherRequested: false, hoveredId: 'node',
  WebSocket: { OPEN: 1 }, socket: { readyState: 1, send: raw => dragMessages.push(JSON.parse(raw)) }, toast() {} };
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function send('), main.indexOf('function saveUpdateSelection('))
  + main.slice(main.indexOf('function cancelGathering('), main.indexOf('function cancelCasting('))
  + main.match(/^const touchMove=bindJoystick.*$/m)[0]), dragRuntime);
dragButton.fire('pointerdown', { clientX: 250 });
const drag = () => { for (let i = 0; i < 240 * 30; i++) dragButton.fire('pointermove', { clientX: 250 + i % 10 }); };
drag(); assert.equal(dragMessages.length, 0, 'rapid joystick updates without gathering send no cancellation messages');
assert(dragRuntime.keys.has('touch-move')); assert.equal(dragRuntime.hoveredId, null, 'movement and hover clearing still work');
dragRuntime.player.gathering = { startedAt: 1000 };
drag(); assert.deepEqual(dragMessages.map(message => message.type), ['cancelGather'], 'an active gather is cancelled exactly once throughout a long drag');
assert.equal(dragRuntime.cancelledGather, 1000, 'gathering feedback stops immediately');
dragRuntime.player = { gathering: { startedAt: 1000 } };
drag(); assert.equal(dragMessages.length, 1, 'delayed snapshots of the same gather do not resend cancellation');
dragRuntime.player.gathering = { startedAt: 2000 };
drag(); assert.equal(dragMessages.length, 2, 'a new gather can be cancelled while the joystick remains held');
dragRuntime.player.gathering = null; drag(); assert.equal(dragMessages.length, 2);
dragRuntime.send({ type: 'gather', targetId: 'node' });
assert(dragRuntime.gatherRequested, 'a sent gathering request can be cancelled before its snapshot arrives');
dragRuntime.cancelGathering(); dragRuntime.cancelGathering(); drag();
assert.deepEqual(dragMessages.slice(2).map(message => message.type), ['gather', 'cancelGather'], 'immediate Clear/Escape and subsequent dragging cancel a pending gather only once');
assert(!dragRuntime.gatherRequested);
dragRuntime.connected = false; dragRuntime.player.gathering = { startedAt: 3000 };
drag(); assert.equal(dragMessages.length, 4, 'disconnected input sends nothing');
dragRuntime.send({ type: 'gather', targetId: 'node' }); assert(!dragRuntime.gatherRequested, 'unsent gathering creates no pending cancellation');
dragButton.fire('pointerup'); assert(!dragRuntime.keys.has('touch-move'));
const overlayClasses=new Set();
const openDialogs=new Set();
const overlayRuntime={specialistNftUI:undefined,worldLoading:false,editingMobileLayout:false,document:{querySelector:selector=>selector.split(',').some(part=>openDialogs.has(part.trim()))?{}:null,body:{classList:{contains:name=>overlayClasses.has(name)},matches:selectors=>selectors.split(', ').some(name=>overlayClasses.has(name.slice(1)))}},panel:{open:false},customizer:{open:false},entryActive:false,rosterActive:false,player:{characterCreated:true},floatingPanel:()=>true};
const blockedByOverlay=runInNewContext(main.match(/^const (?:mobileOverlayOpen|modalOpen) = .*$/gm).join('\n')+';modalOpen',overlayRuntime);
assert.equal(blockedByOverlay(),false);
overlayRuntime.editingMobileLayout=true;assert.equal(blockedByOverlay(),true,'HUD editing pauses all mobile/gameplay actions through the shared gate');overlayRuntime.editingMobileLayout=false;
const pickerMessages=[];
const pickerMovement={...overlayRuntime,updateDungeonRoomView(){},syncCollisionState(){},jump:{grounded:true},climbStopRequested:false,send:message=>pickerMessages.push(message),modalOpen:blockedByOverlay,player:{characterCreated:true,hp:100},connected:true,worldReady:true,keys:new Set(['w']),position:{x:0,z:0},yaw:0,dt:.05,isMoving:true,rotation:0,standUp(){},gmFlying:()=>false,travelSpeed:()=>4,freeAt:()=>true,cancelCasting(){}};
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function releaseClimb('),main.indexOf('function tryJump('))),pickerMovement);
const frameMovement='const flightNow=0,cancelledCast=0;'+main.slice(main.indexOf(' const charging='),main.indexOf(' localAvatar.visible='));
for(const selector of ['.wallet-picker[open]','.x-advertising-dialog[open]']){
 pickerMovement.position.x=pickerMovement.position.z=0;pickerMovement.isMoving=true;
 openDialogs.add(selector);runInNewContext(`{${frameMovement}}`,pickerMovement);
 assert.deepEqual(pickerMovement.position,{x:0,z:0});assert(!pickerMovement.isMoving,`${selector} pauses actual frame movement even when W was already held`);
 openDialogs.delete(selector);runInNewContext(`{${frameMovement}}`,pickerMovement);
 assert(pickerMovement.position.z<0&&pickerMovement.isMoving,`closing ${selector} restores the ordinary desktop movement gate`);
}
pickerMovement.jump.climb={rotation:0};openDialogs.add('.wallet-picker[open]');
for(let frame=0;frame<3;frame++)runInNewContext(`{${frameMovement}}`,pickerMovement);
assert.equal(pickerMovement.climbStopRequested,true,'opening a modal releases an active climb');
assert.deepEqual(pickerMessages.map(message=>message.type),['climbStop'],'held movement behind a modal sends only one authoritative climb cancellation');
assert(!pickerMovement.isMoving,'the climbing pose pauses while its cancellation awaits a snapshot');
delete pickerMovement.jump.climb;openDialogs.delete('.wallet-picker[open]');
let closed=0,toggled=0;const closeButton={};
runInNewContext(main.match(/\$\('close-panel'\)\.onclick=[^;]+;/)[0],{...overlayRuntime,$:()=>closeButton,closePanel:()=>closed++,toggleCharacter:()=>toggled++});
overlayRuntime.panel.dataset={mode:'gear'};closeButton.onclick();assert.equal(toggled,1);
overlayClasses.add('mobile-controls');closeButton.onclick();assert.equal(closed,1,'mobile Close returns directly to gameplay');overlayClasses.clear();
for(const name of ['chat-expanded','mobile-panel-open','mobile-menu-open']){
 overlayClasses.add('mobile-controls');overlayClasses.add(name);assert.equal(blockedByOverlay(),name!=='chat-expanded',name==='chat-expanded'?'inline chat leaves the gameplay gate open':`${name} blocks the shared gameplay gate`);
 overlayClasses.delete('mobile-controls');assert.equal(blockedByOverlay(),false,'desktop floating UI keeps existing movement');overlayClasses.delete(name);
}
overlayClasses.add('mobile-controls');overlayRuntime.panel.open=true;assert.equal(blockedByOverlay(),true,'mobile panels block before observer notification');overlayRuntime.panel.open=false;
const nftWindow={hidden:true},observedWindows=[];let refreshWindows,overlayResets=0;
overlayRuntime.document.body.classList.toggle=(name,on)=>on?overlayClasses.add(name):overlayClasses.delete(name);
overlayRuntime.document.querySelectorAll=selector=>selector.split(',').includes('#nft-window')?[nftWindow]:[];
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('const mobileWindows='),main.indexOf("$('game-menus').append"))),{
 ...overlayRuntime,$:()=>overlayRuntime.customizer,setChatExpanded(){},setMobileMenus(){},
 CustomEvent:class{constructor(type){this.type=type;}},window:{dispatchEvent:event=>{if(event.type==='mobile-ui-open')overlayResets++;}},
 MutationObserver:class{constructor(callback){refreshWindows=callback;}observe(element){observedWindows.push(element);}},
});
assert(observedWindows.includes(nftWindow),'NFT collections and deed auctions participate in the shared mobile overlay observer');
nftWindow.hidden=false;refreshWindows();assert(blockedByOverlay(),'an open NFT window blocks shared movement and action guards');assert.equal(overlayResets,1);
refreshWindows();assert.equal(overlayResets,1,'passive NFT refreshes do not repeatedly clear input');
nftWindow.hidden=true;refreshWindows();assert(!blockedByOverlay(),'closing the NFT window restores mobile gameplay');
const actionsSource = stripTypeScriptTypes(main.slice(main.indexOf('function act('), main.indexOf('let characterView:'))
  + main.slice(main.indexOf('function selectNextFoe('), main.indexOf('function setDesktopMenus(')) + main.match(/^\$\('mobile-sprint'\)\.onclick=.*$/m)[0]);
function actions() {
  const buttons = new Map(), calls = [], dispatched = [];
  const runtime = { abilityValid, isHostilePlayer,isHostileTarget, chooseTarget, player: { hp: 100 }, players: [], appearance: { className: 'Ranger' }, connected: true, worldReady: true, modal: false,
    position: { x: 0, z: 0 }, keys: new Set(), selectedId: null, hoveredId: 'hover', pointerInWorld: true, autoAttackTarget: null,
    points: [{ id: 'far', kind: 'enemy', x: 8, z: 0 }, { id: 'npc', kind: 'npc', x: 1, z: 0 }, { id: 'near', kind: 'enemy', x: 2, z: 0 }, { id: 'distant', kind: 'enemy', x: 30, z: 0 }],
    $: id => { if (!buttons.has(id)) buttons.set(id, new Target()); return buttons.get(id); }, bindJoystick: () => ({ x: 0, y: 0 }), bindTouchActions: fixture().bindTouchActions,
    setMobileMenus: () => {}, setAutoAttack: id => { calls.push(['attack', id]); runtime.autoAttackTarget = id; }, cancelCasting: () => calls.push(['cast-cancel']),
    cancelGathering: () => calls.push(['gather-cancel']), interactNearby: () => calls.push(['use']), toggleMount: () => calls.push(['mount']), toast: text => calls.push(['toast', text]),
  };
  runtime.modalOpen = () => runtime.modal; runtime.targetPoints = () => runtime.points;
  runInNewContext(actionsSource, runtime);
  const act = runtime.act; runtime.act = type => { dispatched.push(type); act(type); };
  return { runtime, calls, dispatched, click: name => buttons.get(`mobile-${name}`).onclick() };
}
const buttons = actions();
for (const id of ['near', 'far', 'near']) { buttons.click('target'); assert.equal(buttons.runtime.selectedId, id, 'Target cycles nearby foes by distance'); }
assert.equal(buttons.runtime.hoveredId, null); assert.equal(buttons.runtime.pointerInWorld, false);
buttons.runtime.selectedId = null; buttons.click('attack'); assert.deepEqual(buttons.calls.pop(), ['attack', 'near'], 'Attack chooses a foe when none is selected');
buttons.click('attack'); assert.deepEqual(buttons.calls.pop(), ['attack', null], 'Attack toggles off');
buttons.runtime.selectedId = 'far'; buttons.click('attack'); assert.deepEqual(buttons.calls.pop(), ['attack', 'near'], 'Attack acquires the closest foe even when a farther foe was selected');
for (const selectedId of ['npc', 'old-remains']) { buttons.click('attack'); buttons.calls.pop(); buttons.runtime.selectedId = selectedId; buttons.click('attack'); assert.deepEqual(buttons.calls.pop(), ['attack', 'near'], 'Attack replaces a friendly or stale selection with the closest foe'); }
buttons.click('interact'); assert.deepEqual(buttons.dispatched, ['interact']); assert.deepEqual(buttons.calls.pop(), ['use']);
buttons.click('sprint'); assert(buttons.runtime.keys.has('shift'),'Sprint toggles on with one tap'); buttons.click('sprint'); assert(!buttons.runtime.keys.has('shift'),'Sprint toggles off');
buttons.click('mount'); assert.deepEqual(buttons.calls.pop(), ['mount']);
buttons.click('clear'); assert.deepEqual(buttons.calls, [['attack', null], ['cast-cancel'], ['gather-cancel']]);
assert.equal(buttons.runtime.selectedId, null); assert.equal(buttons.runtime.hoveredId, null);
buttons.calls.length = 0; buttons.runtime.points = []; buttons.click('attack'); assert.equal(buttons.calls[0]?.[0], 'toast', 'empty nearby targets do not start an attack');
for (const guard of ['modal', 'disconnected', 'not-ready', 'dead', 'zeppelin']) {
  const f = actions(); f.runtime.selectedId = f.runtime.autoAttackTarget = 'far';
  if (guard === 'modal') f.runtime.modal = true;
  if (guard === 'disconnected') f.runtime.connected = false;
  if (guard === 'not-ready') f.runtime.worldReady = false;
  if (guard === 'dead') f.runtime.player.hp = 0;
  if (guard === 'zeppelin') f.runtime.player.zeppelin = {};
  for (const button of ['target', 'attack', 'interact', 'clear', 'mount', 'sprint']) f.click(button);
  assert.deepEqual(f.calls, [], `${guard} blocks mobile gameplay actions, including the actual shared Use dispatcher`);
  assert.equal(f.runtime.selectedId, 'far'); assert.equal(f.runtime.autoAttackTarget, 'far');
}
console.log('PASS mobile controls: analog joystick, independent second-thumb actions, duplicate suppression, touch cancellation, delegated targets/modifiers, double-tap jump, camera gestures, and shared action guards.');
