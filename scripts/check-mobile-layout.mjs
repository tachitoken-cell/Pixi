import assert from 'node:assert/strict';
import { readMobileLayout, fitMobileGroup, mobileGroupsOverlap } from '../src/mobile-layout.ts';

for (const raw of [null, '', '{broken', 'null', '[]', '{"portrait":null}', '{"portrait":{"joystick":{"x":999,"y":0}}}', '{"landscape":{"combat":{"x":"0.5","y":0}}}']) {
  assert.deepEqual(readMobileLayout(raw), { portrait: {}, landscape: {} }, 'unusable storage restores authored defaults');
}
const original = { portrait: { joystick: { x: 0, y: 1 }, movement: { x: 1, y: .5 } }, landscape: { combat: { x: .8, y: 1 } } };
assert.deepEqual(readMobileLayout(JSON.stringify(original)), original, 'device storage round-trip keeps independent orientations and opposite-thumb positions');
assert.deepEqual(readMobileLayout('{"portrait":{"joystick":{"x":0,"y":1},"movement":{"x":-1,"y":0}}}').portrait, { joystick: original.portrait.joystick }, 'one damaged group cannot hide the valid joystick');

for (const [width, height] of [[390, 844], [844, 390], [568, 320], [744, 1133], [1133, 744]]) {
  const portrait = width < height, scale = width >= 700 && height >= 600 ? 1.25 : 1;
  const safe = { left: 24, top: portrait ? 180 : 80, width: width - 48, height: height - (portrait ? 180 : 80) - 12 };
  for (const [w, h] of [[88, 88], [92, 44], [228, portrait && width <= 560 ? 280 : 228]]) {
    const rect = { left: 0, top: 0, width: w * scale, height: h * scale };
    for (const point of [{ x: -900, y: -900 }, { x: 99999, y: 99999 }, { x: width / 2, y: height / 2 }]) {
      const placed = fitMobileGroup(point, rect, safe);
      assert(placed.x >= safe.left && placed.y >= safe.top);
      assert(placed.x + rect.width <= safe.left + safe.width);
      assert(placed.y + rect.height <= safe.top + safe.height, `${width}x${height}: the combat ring and second-page button fit the safe area`);
    }
  }
}
assert(mobileGroupsOverlap([{ left: 0, top: 0, width: 88, height: 88 }, { left: 10, top: 20, width: 92, height: 44 }]), 'overlapping controls cannot be saved');
assert(!mobileGroupsOverlap([{ left: 0, top: 0, width: 88, height: 88 }, { left: 100, top: 0, width: 92, height: 44 }]), 'separate thumb groups remain usable');
assert(!mobileGroupsOverlap([{ left: 0, top: 0, width: 88, height: 88 }, { left: 88, top: 0, width: 92, height: 44 }]), 'touching bounds are allowed');
console.log('PASS: damaged storage recovery, separate orientation persistence, phone/tablet safe-area containment including the second hotbar page, and overlapping-layout rejection.');
