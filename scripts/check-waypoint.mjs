import { CHAT_LANGUAGES } from '../src/chat-languages.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createWaypointIndicator } from '../src/waypoint.ts';
import { languagePicker } from '../src/localization.ts';

const elements = new Map();
for (const id of ['arrow', 'name', 'distance', 'clear']) {
  const element = { writes: 0, style: {}, title: '', value: '' };
  Object.defineProperty(element, 'textContent', { get() { return this.value; }, set(value) { this.value = value; this.writes++; } });
  Object.defineProperty(element, 'innerHTML', { set() { throw Error('Waypoint text must never be interpreted as HTML'); } });
  elements.set(`#waypoint-${id}`, element);
}
const root = { hidden: false, querySelector: selector => { assert(elements.has(selector)); return elements.get(selector); } };
let cleared = 0;
const indicator = createWaypointIndicator(root, () => cleared++);
const arrow = elements.get('#waypoint-arrow'), name = elements.get('#waypoint-name'), distance = elements.get('#waypoint-distance');
assert(root.hidden, 'the indicator starts hidden');
indicator.update(null, { x: 0, z: 0 }, 0); assert(root.hidden);
const player = { x: 27, z: -19 };
for (const [dx, dz, yaw, expected] of [
  [0, -10, 0, 0], [10, 0, 0, Math.PI / 2], [0, 10, 0, Math.PI], [-10, 0, 0, -Math.PI / 2],
  [-10, 0, Math.PI / 2, 0], [0, -10, Math.PI / 2, Math.PI / 2],
  [0, 10, Math.PI, 0], [10, 0, -Math.PI / 2, 0],
]) {
  indicator.update({ x: player.x + dx, z: player.z + dz, label: 'Pinewake' }, player, yaw);
  const angle = Number(arrow.style.transform.match(/^rotate\((.+)rad\)$/)?.[1]);
  assert(Math.abs(Math.sin(angle) - Math.sin(expected)) < 1e-10 && Math.abs(Math.cos(angle) - Math.cos(expected)) < 1e-10,
    `correct relative direction for target (${dx}, ${dz}) at camera yaw ${yaw}`);
  assert(!root.hidden); assert.equal(name.textContent, 'Pinewake'); assert.equal(distance.textContent, '10 m');
}
indicator.update({ x: 3, z: 4 }, { x: 0, z: 0 }, 0);
assert.equal(distance.textContent, '5 m', 'distance is the straight-line hypotenuse'); assert.equal(name.textContent, 'Waypoint');
indicator.update({ x: 0, z: 14.49, label: ' ' }, { x: 0, z: 0 }, 0); assert.equal(distance.textContent, '14 m');
indicator.update({ x: 1200, z: 1600 }, { x: 0, z: 0 }, 0); assert.equal(distance.textContent, '2000 m');
indicator.update(player, player, 2); assert.equal(distance.textContent, '0 m'); assert.equal(arrow.style.transform, 'rotate(0rad)');
const hostileLabel = '<img src=x onerror=alert(1)> & "a waypoint"';
const destination = { x: 3, z: 4, label: hostileLabel };
indicator.update(destination, { x: 0, z: 0 }, 0);
assert.equal(name.textContent, hostileLabel); assert.equal(name.title, hostileLabel, 'full labels remain safe plain text');
const before = [name.writes, distance.writes];
indicator.update(destination, { x: 0, z: 0 }, 0);
assert.deepEqual([name.writes, distance.writes], before, 'per-frame updates do not rewrite unchanged text');
elements.get('#waypoint-clear').onclick(); assert(root.hidden); assert.equal(cleared, 1);
indicator.update(null, player, 0); assert(root.hidden); assert.equal(cleared, 1, 'rendering null never invokes the clear action');
indicator.update(destination, { x: 0, z: 0 }, 0); assert(!root.hidden, 'the same destination can be selected again after clearing');

const ui = readFileSync(new URL('../src/ui.ts', import.meta.url), 'utf8'), app = { innerHTML: '', insertAdjacentHTML() {},addEventListener(){} };
runInNewContext(stripTypeScriptTypes(ui.slice(ui.indexOf('const creatorColorParts =')).replace(/^export /gm, '')) + ';mountUI();', {
  $: () => app, icon: () => '', rosterShell: () => '', languagePicker, CHAT_LANGUAGES, document: { querySelectorAll: () => [] },
});
assert.match(app.innerHTML, /<section id="waypoint-hud"[^>]* hidden>/);
assert.match(app.innerHTML, /id="waypoint-clear"[^>]*aria-label="Clear waypoint"/);
assert(app.innerHTML.indexOf('id="waypoint-hud"') > app.innerHTML.indexOf('id="play-ui"') && app.innerHTML.indexOf('id="waypoint-hud"') < app.innerHTML.indexOf('id="customizer"'));
const css = readFileSync(new URL('../src/waypoint.css', import.meta.url), 'utf8');
assert.match(css, /#waypoint-hud\[hidden\]\s*\{\s*display:none;/);
assert.match(css, /#waypoint-hud\s*\{[^}]*pointer-events:none;/);
assert.match(css, /#waypoint-clear\s*\{[^}]*pointer-events:auto;/);
assert.match(css, /#waypoint-name\s*\{[^}]*text-overflow:ellipsis;/);
console.log('PASS: waypoint cardinals and camera rotation, translated coordinates, straight-line meters, clear/reselect, safe labels, cached text and initially hidden click-through HUD.');
