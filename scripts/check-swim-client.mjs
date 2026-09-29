import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { gearSpeedMultiplier, gearById, starterGear } from '../src/progression.ts';
import { SWIM_SPEED } from '../src/landscape.ts';
import { WALK_SPEED, SPRINT_SPEED, SWIM_SPRINT_SPEED, newTravel, canSprint, mountSpeed } from '../src/travel.ts';

const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('function gmFlying(){'), source.indexOf('function updateMountView('));
let wet = true;
const context = { Date: { now: () => 10000 }, serverOffset: 2000, SWIM_SPEED, SWIM_SPRINT_SPEED, WALK_SPEED, SPRINT_SPEED, canSprint, mountSpeed, gearSpeedMultiplier, connected: true,
  keys: new Set(), jump: { grounded: true }, worldInstance: null, position: { x: 0, z: 0 },
  waterAt: () => wet, player: { ...starterGear('Ranger'), level: 50, ridingRank: 2, travel: newTravel() } };
const speed = runInNewContext(`${body}; travelSpeed`, context);
assert(Math.abs(speed() - 3.1 * 1.4) < 1e-10, 'normal swim speed increases exactly 40 percent');
context.keys.add('shift');
assert(Math.abs(speed() - 6.135862068965517) < 1e-10, 'Shift accelerates swimming');
context.player.travel.stamina = 0; assert.equal(speed(), SWIM_SPEED);
context.player.travel.stamina = 24; context.player.travel.exhausted = true; assert.equal(speed(), SWIM_SPEED);
context.player.travel.exhausted = false; assert.equal(speed(), SWIM_SPRINT_SPEED);
wet = false; assert.equal(speed(), SPRINT_SPEED, 'shore exit keeps land sprint speed');
context.keys.clear(); assert.equal(speed(), WALK_SPEED);
context.player.travel.mount = 'horse'; assert.equal(speed(), 14, 'riding remains unchanged');
wet = true; assert.equal(speed(), SWIM_SPEED, 'a stale mount snapshot cannot sprint through water');
context.player.travel.mount = null; context.keys.add('shift'); context.jump.grounded = false;
assert.equal(speed(), SPRINT_SPEED, 'jumping over water uses airborne movement');
assert(source.includes("isMoving&&keys.has('shift')&&canSprint(player?.travel)&&!player?.travel?.mount"), 'sprint input remains valid during duel slows');
context.player.duelStatus = { slowUntil: 13000, slowMultiplier: .5, stunUntil: 0 };
assert.equal(speed(), SPRINT_SPEED / 2, 'duel slow scales land and airborne sprint');
context.jump.grounded = true;assert.equal(speed(), SWIM_SPRINT_SPEED / 2, 'duel slow scales swimming too');
context.player.duelStatus.stunUntil = 13000;assert.equal(speed(), 0, 'duel stun prevents predicted movement');
context.player.duelStatus.stunUntil = 12000;context.player.duelStatus.slowUntil = 12000;
assert.equal(speed(), SWIM_SPRINT_SPEED, 'statuses expire against the server clock');
context.player.duelStatus = null;assert.equal(speed(), SWIM_SPRINT_SPEED, 'duel cleanup restores normal movement');
assert(source.includes("sprinting?swimming?'Swimming':'Sprinting'"), 'fatigue HUD distinguishes water sprint');
console.log('PASS swim client: 40% normal increase, Shift boost, fatigue fallback, shore/air/mount transitions and authoritative sprint input.');

const rolled=gearById('ranger-shoes~2~mythic~199999996b851eb8~0');context.player.equipment.shoes=rolled.id;
const gearSpeed=gearSpeedMultiplier(context.player);assert(gearSpeed>1);
assert.equal(speed(),SWIM_SPRINT_SPEED*gearSpeed,'geared swim sprint uses the same multiplier as the realm');
context.player.duelStatus={slowUntil:13000,slowMultiplier:.5,stunUntil:0};assert.equal(speed(),SWIM_SPRINT_SPEED*gearSpeed*.5,'gear and duel slow multiply without cancelling one another');
context.player.duelStatus.slowUntil=12000;assert.equal(speed(),SWIM_SPRINT_SPEED*gearSpeed,'slow expiry retains gear speed');
wet=false;assert.equal(speed(),SPRINT_SPEED*gearSpeed,'geared land sprint');context.keys.clear();assert.equal(speed(),WALK_SPEED*gearSpeed,'geared normal walking');
context.player.travel.mount='horse';assert.equal(speed(),14,'gear speed never increases riding speed');
wet=true;assert.equal(speed(),SWIM_SPEED,'stale mounted shoreline prediction stays conservative until dismount snapshot');
context.player.travel.mount=null;assert.equal(speed(),SWIM_SPEED*gearSpeed,'confirmed dismount enables geared swimming');
