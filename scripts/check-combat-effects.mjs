import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { createCombatEffects } from '../src/combat-effects.ts';
import { graphics } from '../src/graphics-settings.ts';
import { makeCharacter, animateCharacter, setCharacterRaces, setCharacterCustomization, setCharacterGear } from '../src/characters.ts';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GEAR, starterGear, equipmentSlotFor, combatStats } from '../src/progression.ts';
import { combatTiming, RADIAL_SWEEPS, shieldThrowHops } from '../src/combat-timing.ts';
import { SPELLS, spellsForClass, legacyAbility } from '../src/spells.ts';
import { RACES, GENDERS, DEFAULT_APPEARANCE } from '../src/appearance.ts';

graphics.effects = 'high'; // Verify authored particle counts independently of the device's Auto default.
const scene = new THREE.Scene(), other = new THREE.Group();
scene.add(other);
const liveTargets = new Map(), resolvedTargets = [];
const effects = createCombatEffects(scene, id => { resolvedTargets.push(id); return liveTargets.get(id); });
const event = ability => ({ ability, from: { x: 0, z: 0 }, targets: [{ id: 'slime', x: 0, z: 8 }], rotation: 0 });
const batch = () => scene.getObjectByName('combat-effects');
function pieces() {
  const result = [], matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), quaternion = new THREE.Quaternion();
  for (let i = 0; i < batch().count; i++) {
    batch().getMatrixAt(i, matrix);
    assert(matrix.elements.every(Number.isFinite), 'all projectile/impact transforms stay finite');
    matrix.decompose(position, quaternion, scale);
    result.push({ position: position.clone(), scale: scale.clone() });
  }
  return result;
}

effects.play(event('arrow'), 10);
effects.update(10.05);
assert.equal(batch().count, 0, 'the bow has a brief draw before release');
effects.update(10.19);
const near = pieces();
assert.equal(near.length, 5, 'a basic arrow is one five-voxel projectile');
const arrowTiming = combatTiming('arrow', 8);
effects.update(10 + arrowTiming.delay + arrowTiming.flight / 2);
const mid = pieces()[0].position;
assert(mid.z > near[0].position.z && mid.z < 8, 'the arrow travels from the attacker toward the accepted target');
assert(mid.y > 1.20, 'the ordinary shot follows a shallow arc');
const arrowMesh = batch();
effects.update(10 + arrowTiming.delay + arrowTiming.flight + 0.1);
assert.equal(pieces().length, 7, 'an arrow produces one small impact');
assert(pieces().every(part => part.position.distanceTo(new THREE.Vector3(0, .75, 8)) < 0.6));
effects.update(12);
assert.equal(batch().count, 0); assert.equal(batch().visible, false);
assert.equal(batch(), arrowMesh, 'finished effects reuse the same instance buffer');

effects.play(event('volley'), 20);
effects.update(20.50);
const shafts = pieces().filter(part => Math.abs(part.scale.z - .9) < .00001 && Math.abs(part.scale.x - .065) < .00001);
assert.equal(shafts.length, 5, 'Volley launches five actual arrows');
assert(shafts.every(part => part.position.y > 2), 'Volley arrows have visibly higher arcing trajectories');
assert.equal(new Set(shafts.map(part => part.position.toArray().join(','))).size, 5, 'the five arrows remain spatially distinct');
effects.update(23);

const fire = event('fireball');
effects.play(fire, 30);
fire.targets[0].z = -80; // Effects snapshot server events; later state changes must not redirect a projectile.
effects.update(30.50);
assert(pieces().length >= 20, 'fireball has a voxel core, orbiting flame and a continuous trail');
assert(pieces().every(part => part.position.z > 0));
const fireTiming = combatTiming('fireball', 8);
effects.update(30 + fireTiming.delay + fireTiming.flight + 0.1);
assert.equal(pieces().length, 25, 'fireball blossoms into a larger, separate impact');
assert(pieces().every(part => Math.abs(part.position.z - 8) < 1.3), 'the fireball impact stays at its original target');
effects.update(33);

// New spellbook sprite names must preserve every authored projectile and impact.
const legacyProjectileArt = { fireball: ['fireball', '#f57932'], cinderbolt: ['ember', '#f57932'], 'explosive-arrow': ['ember', '#f57932'], 'ice-lance': ['frost', '#d4f4ff'], 'deep-freeze': ['frost', '#d4f4ff'], 'hamstring-shot': ['frost', '#d4f4ff'], 'poison-shot': ['poison-shot', '#d8ad6d'], smite: ['cleric-smite', '#fff4be'] };
for (const spell of Object.values(SPELLS).filter(spell => spell.effect === 'damage' && spell.visual !== 'radial')) {
  const oldIcon = spell.icon, timing = combatTiming(spell.id, 8);
  const render = () => {
    effects.play(event(spell.id), 0);
    const frames = [timing.delay + timing.flight / 2, timing.delay + timing.flight + .1].map(at => {
      effects.update(at); pieces();
      return { matrices: [...batch().instanceMatrix.array.slice(0, batch().count * 16)], colors: [...batch().instanceColor.array.slice(0, batch().count * 3)] };
    });
    effects.clear(); return frames;
  };
  try {
    const legacy = legacyProjectileArt[spell.id];
    spell.icon = legacy?.[0] || oldIcon;
    const original = render();
    if (legacy) assert.deepEqual(original[0].colors.slice(0, 3), [...new Float32Array(new THREE.Color(legacy[1]).toArray())], `${spell.id} preserves its authored projectile palette`);
    spell.icon = `spell-${spell.id}`;
    assert.deepEqual(render(), original, `${spell.id} sprite art cannot change world geometry or colors`);
  } finally { spell.icon = oldIcon; effects.clear(); }
}

effects.play({ ...event('arrow'), targets: [], rotation: Math.PI / 2 }, 40);
effects.update(40.45);
assert(pieces()[0].position.x > 3 && Math.abs(pieces()[0].position.z) < .001, 'untargeted shots use character facing');
effects.update(43);
for (const ability of ['nova', 'strike', 'whirlwind']) {
  effects.play(event(ability), 50);
  effects.update(50.30);
  const first = pieces();
  assert(first.length > 10, `${ability} has a readable voxel sweep`);
  if (ability === 'nova') {
    effects.update(50.62);
    assert(pieces()[0].position.length() > first[0].position.length() + 1, 'nova expands outward across the ground');
  }
  effects.update(53);
  assert.equal(batch().count, 0);
}

effects.play({ ...event('arrow'), from: { x: NaN, z: 0 } }, 60);
effects.play(event('arrow'), Infinity);
effects.update(60.5);
assert.equal(batch().count, 0, 'invalid coordinates or timestamps do not enter the effect list');
for (let i = 0; i < 100; i++) effects.play({ ...event('fireball'), from: { x: i, z: 0 } }, 70);
effects.update(70.50);
assert.equal(scene.children.length, 2, 'all simultaneous effects use one draw group');
assert(pieces().length <= 16 * 24, 'an event flood retains at most sixteen fireballs');
assert.equal(batch().instanceMatrix.count, 1536, 'GPU capacity is fixed');
assert.deepEqual(new THREE.Raycaster(new THREE.Vector3(0, 20, 0), new THREE.Vector3(0, -1, 0)).intersectObject(batch()), [], 'VFX cannot intercept gameplay picking');
const disposable = [batch(), batch().geometry, batch().material];
const disposed = new Map(disposable.map(resource => [resource, 0]));
for (const resource of disposable) resource.addEventListener('dispose', () => disposed.set(resource, disposed.get(resource) + 1));
effects.clear(); effects.clear();
assert.deepEqual(scene.children, [other], 'clearing combat preserves unrelated scene objects');
assert([...disposed.values()].every(count => count === 1), 'the instance buffer, geometry and material each release once');
effects.play(event('arrow'), 80); effects.update(80.40);
assert.notEqual(batch(), disposable[0], 'a cleared renderer can be reused after changing zones');
assert.equal(pieces().length, 5); effects.clear();

// Exercise the actual rendered transforms immediately before and at authoritative hit time.
const closeTo = (actual, expected, label) => assert(actual.distanceTo(new THREE.Vector3(...expected)) < .002, label);
for (const ability of ['arrow', 'volley', 'fireball']) for (const distance of [1, 8, 30]) {
  effects.play({ ...event(ability), targets: [{ id: 'timed-target', x: 0, z: distance }] }, 100);
  const timing = combatTiming(ability, distance);
  effects.update(100 + timing.delay + timing.flight - .000001);
  const before = pieces();
  closeTo(before[0].position, [0, .75, distance], `${ability} reaches the target exactly at the shared hit time`);
  assert(Math.abs(before[0].scale.z - (ability === 'fireball' ? .48 : .90)) < .00001, 'the projectile persists until impact');
  effects.update(100 + timing.delay + timing.flight + .00000001);
  const hit = pieces();
  closeTo(hit[0].position, [0, .75, distance], `${ability} impact starts on its accepted target`);
  assert(Math.abs(hit[0].scale.x - (ability === 'fireball' ? .23 : .11)) < .00001, 'the projectile changes to its impact at shared time');
  effects.clear();
}
for (const spell of Object.values(SPELLS).filter(spell => spell.visual === 'radial' && spell.effect === 'damage' && !['shatter','venom-detonation'].includes(spell.id))) {
 const ability = spell.id, sweep = RADIAL_SWEEPS[ability];
 for (const distance of [(sweep.radius + sweep.reach) / 2, spell.range]) {
  const timing = combatTiming(ability, distance);
  effects.play(event(ability), 110);
  effects.update(110 + sweep.delay - .000001);
  assert.equal(batch().count, 0, `${ability} uses the shared cast windup`);
  effects.update(110 + timing.delay + timing.flight - .03);
  const before = pieces()[0].position;
  assert(Math.hypot(before.x, before.z) < distance, `${ability} has not reached the target before damage time`);
  effects.update(110 + timing.delay + timing.flight);
  const hit = pieces()[0].position;
  assert(Math.abs(Math.hypot(hit.x, hit.z) - distance) < .00001, `${ability} visible radius meets the target at authoritative impact`);
  effects.update(110 + sweep.delay + sweep.duration + .00001);
  assert.equal(batch().count, 0, `${ability} lifespan uses the shared sweep duration`);
  effects.clear();
 }
}

for (const ability of ['shatter','venom-detonation']) {
  assert.deepEqual(combatTiming(ability,8),{delay:0,flight:0});
  effects.play(event(ability),110); effects.update(110);
  assert(pieces().length>0,`${ability} impacts immediately`);
  assert(pieces().every(part=>Math.abs(part.position.z-8)<.001),`${ability} explodes at affected enemies`);
  effects.update(110.5);assert.equal(batch().count,0,`${ability} bursts clean up`);effects.clear();
}

const crowdedVolley = { ...event('volley'), targets: Array.from({ length: 8 }, (_, i) => ({ id: `volley-${i}`, x: Math.sin(i * .13) * 8, z: Math.cos(i * .13) * 8 })) };
const isShaft = part => Math.abs(part.scale.z - .9) < .00001 && Math.abs(part.scale.x - .065) < .00001;
effects.play(crowdedVolley, 120);
effects.update(120.58);
assert.equal(pieces().filter(isShaft).length, 8, 'Volley represents every accepted target, including targets after the fifth');
effects.clear();
for (let index = 0; index < crowdedVolley.targets.length; index++) {
  const target = crowdedVolley.targets[index], timing = combatTiming('volley', Math.hypot(target.x, target.z), index);
  effects.play(crowdedVolley, 120);
  effects.update(120 + timing.delay + timing.flight - .000001);
  assert(pieces().filter(isShaft).some(part => part.position.distanceTo(new THREE.Vector3(target.x, .75, target.z)) < .002), 'each target has an arriving arrow at its original, unspread distance time');
  effects.update(120 + timing.delay + timing.flight + .00000001);
  assert(pieces().filter(part => part.position.distanceTo(new THREE.Vector3(target.x, .75, target.z)) < .00001).length >= 7, 'each first arrow bursts at the corresponding server target/index impact');
  effects.clear();
}

const movingEvent = event('fireball'), frozenEvent = JSON.stringify(movingEvent);
Object.freeze(movingEvent.from); Object.freeze(movingEvent.targets[0]); Object.freeze(movingEvent.targets); Object.freeze(movingEvent);
liveTargets.set('slime', { x: 2, y: 1.8, z: 7 });
effects.play(movingEvent, 130);
const verifyHoming = (at, target) => {
  effects.update(at);
  const progress = (at - 130 - fireTiming.delay) / fireTiming.flight;
  closeTo(pieces()[0].position, [target.x * progress, 1.6 + (target.y - 1.6) * progress + 4 * .12 * progress * (1 - progress), .55 + (target.z - .55) * progress], 'the live projectile follows the rendered target position and hit height');
};
verifyHoming(130.46, liveTargets.get('slime'));
liveTargets.delete('slime');
verifyHoming(130.50, { x: 2, y: 1.8, z: 7 });
liveTargets.set('slime', { x: NaN, y: Infinity, z: 2 });
verifyHoming(130.54, { x: 2, y: 1.8, z: 7 });
liveTargets.set('slime', { x: 3, y: .55, z: 6 });
const impactAt = 130 + fireTiming.delay + fireTiming.flight;
effects.update(impactAt + .00000001);
closeTo(pieces().at(-1).position, [3, .55, 6], 'the impact locks onto the last rendered enemy position');
const lookupsAtImpact = resolvedTargets.length;
liveTargets.set('slime', { x: -8, y: 3, z: -4 });
effects.update(impactAt + .12);
closeTo(pieces().at(-1).position, [3, .55, 6], 'the burst remains fixed after the target moves or respawns');
assert.equal(resolvedTargets.length, lookupsAtImpact, 'completed impacts stop querying live targets');
assert.equal(JSON.stringify(movingEvent), frozenEvent, 'homing never mutates a received combat event');
effects.clear(); liveTargets.clear();

// The optional attachment resolver changes only the frozen launch point, never hit time.
const origin = new THREE.Vector3(), originCalls = [];
let originValid = true;
const attached = createCombatEffects(scene, undefined, undefined, (id, ability, out) => {
  originCalls.push([id, ability]); out.copy(origin); return originValid;
});
for (const ability of ['arrow', 'power-shot', 'poison-shot', 'fireball', 'frostbolt']) {
  originCalls.length = 0; origin.set(3, 4, -2);
  const cast = { ...event(ability), playerId: 'caster' }, before = JSON.stringify(cast), timing = combatTiming(ability, 8);
  attached.play(cast, 0); attached.update(timing.delay - .000001);
  assert.equal(originCalls.length, 0, 'the origin waits until the weapon/hand is posed at release');
  attached.update(timing.delay);
  closeTo(pieces()[0].position, [3, 4, -2], `${ability} starts at the actual attachment instead of a fixed character height`);
  assert.deepEqual(originCalls, [['caster', ability]]);
  origin.set(100, 80, -90); attached.update(timing.delay + timing.flight / 2);
  closeTo(pieces()[0].position, [1.5, (4 + .75) / 2 + (['fireball', 'frostbolt'].includes(ability) ? .12 : .25), 3], 'moving the caster cannot pull an airborne shot along');
  attached.update(timing.delay + timing.flight + .00000001);
  closeTo(pieces()[0].position, [0, .75, 8], 'the moved launch origin retains the original server impact timestamp');
  assert.equal(originCalls.length, 1, 'a projectile samples its attachment only once');
  assert.equal(JSON.stringify(cast), before); attached.clear();
}
for (const valid of [false, true]) {
  originCalls.length = 0; originValid = valid; origin.set(NaN, Infinity, 4);
  attached.play({ ...event('arrow'), playerId: 'unavailable' }, 0); attached.update(arrowTiming.delay);
  closeTo(pieces()[0].position, [0, 1.4, .55], 'a missing or invalid avatar attachment keeps the valid event fallback');
  assert.equal(originCalls.length, 1); attached.clear();
}
originValid = true; originCalls.length = 0; origin.set(0, 3, 0);
attached.play({ ...event('volley'), playerId: 'caster' }, 0);
for (let index = 0; index < 5; index++) {
  attached.update(combatTiming('volley', 8, index).delay + .00000001);
  assert.equal(originCalls.length, index + 1, 'each staggered arrow samples its own release exactly once');
}
attached.clear(); originCalls.length = 0;
const shieldTargets = [{id:'first',x:0,z:15},{id:'second',x:3,z:15},{id:'third',x:3,z:18}];
const hops = shieldThrowHops({x:0,z:0},shieldTargets);
assert.deepEqual(shieldThrowHops({x:0,z:0},[]),[]);
assert.deepEqual(hops[0],{from:{x:0,z:0},delay:.18,flight:.9});
for(let i=1;i<hops.length;i++) {
  assert.equal(hops[i].delay,hops[i-1].delay+hops[i-1].flight,'shield waits for the previous target impact');
  assert.equal(hops[i].flight,.2); assert.deepEqual(hops[i].from,{x:shieldTargets[i-1].x,z:shieldTargets[i-1].z});
}
origin.set(0,1.4,0);
attached.play({ability:'powerful-throw',playerId:'caster',from:{x:0,z:0},targets:shieldTargets},0);
attached.update(hops[0].delay+.01); assert.equal(originCalls.length,1);
origin.set(100,80,-90);
attached.update(hops[1].delay); assert.equal(originCalls.length,1,'bounces never return to the caster attachment');
closeTo(pieces().find(part=>Math.abs(part.scale.z-.9)<.00001).position,[0,.75,15],'second hop begins at first impact');
attached.update(hops[1].delay+hops[1].flight/2);
closeTo(pieces().find(part=>Math.abs(part.scale.z-.9)<.00001).position,[1.5,1,15],'one shield travels between targets');
attached.update(hops[2].delay); assert.equal(originCalls.length,1);
closeTo(pieces().find(part=>Math.abs(part.scale.z-.9)<.00001).position,[3,.75,15],'third hop starts at second impact');
attached.clear(); originCalls.length = 0;
attached.play({ ...event('arrow'), playerId: 'caster' }, 0);
attached.update(arrowTiming.delay + arrowTiming.flight + .00000001);
assert.equal(originCalls.length, 0, 'a delayed cast received after impact does not invent a new launch'); attached.clear();
for (const ability of ['meteor', 'nova', 'strike']) {
  const timing = combatTiming(ability, 8); attached.play({ ...event(ability), playerId: 'caster' }, 0);
  attached.update(timing.delay + .01); assert.equal(originCalls.length, 0, 'sky meteors and ground sweeps do not originate in a hand'); attached.clear();
}

// Exercise the shipped main attachment lookup against the actual authored race bodies.
for (const [name, setter] of [['race-kit', setCharacterRaces], ['customization-kit', setCharacterCustomization], ['gear-kit', setCharacterGear]]) {
  const bytes = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
  setter((await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene);
}
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const displayedRanges={SPELLS};
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('const classSpells ='),main.indexOf('const zoneIcons:')))+';globalThis.classes=classSpells;',displayedRanges);
for(const className of ['Ranger','Knight','Mage','Cleric']){
  const primary=SPELLS[legacyAbility(className)],stats=combatStats({level:1,appearance:{className},talents:[],equipment:{}});
  assert.equal(stats.range,primary.range,'combat stats report the actual primary attack range');
  assert.equal(displayedRanges.classes[className].range,primary.range,'character creation shows the same attack range as gameplay');
  assert.equal(stats.primaryDamage,{Ranger:16,Knight:24,Mage:20,Cleric:18}[className],'greater reach does not silently change base damage');
}
const context = { THREE, SPELLS, combatTiming, combatAnimations: new Map(), playerId: 'local', player:undefined, players:[], connected:true, worldReady:true, cancelledCast:0, localAvatar: null, remote: new Map(), releaseMatrix: new THREE.Matrix4() };
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function projectileOrigin('), main.indexOf('const combatEffects ='))), context);
runInNewContext(stripTypeScriptTypes(main.slice(main.indexOf('function combatPose('), main.indexOf('function act('))), context);
const worldOrigin = new THREE.Vector3(), expectedOrigin = new THREE.Vector3(), partMatrix = new THREE.Matrix4();
for (const race of RACES) for (const gender of GENDERS) for (const className of ['Ranger', 'Mage']) {
  const starter = starterGear(className).equipment, upgrade = Object.values(GEAR).find(item => item.slot === 'weapon' && item.className === className && item.price > 0);
  for (const equipment of [starter, { ...starter, weapon: upgrade.id }]) {
    const character = makeCharacter({ ...DEFAULT_APPEARANCE, className, race: race.id, gender: gender.id }, equipment);
    character.position.set(7, 12, -9); character.rotation.y = .83;
    const id = gender.id === 'male' ? 'local' : 'remote';
    context.localAvatar = id === 'local' ? character : null; context.remote.set('remote', { mesh: character });
    for (const spell of spellsForClass(className).filter(spell => spell.visual === 'projectile' && spell.effect === 'damage')) {
      const delay = combatTiming(spell.id, 8).delay * 1000, release = className === 'Ranger' ? .26 : .30;
      context.combatAnimations.set(id, { ability: spell.id, started: 1000, rotation: .83 });
      const castPose = context.combatPose(id, 1000 + delay);
      assert(Math.abs(castPose.progress - release) < 1e-12, `${spell.id} reaches its actual release pose at shared launch time`);
      assert(context.combatPose(id, 1000 + delay - .01).progress < release);
      assert(context.combatPose(id, 1000 + delay + .01).progress > release);
      context.combatAnimations.get(id).prepared = true;
      assert.equal(context.combatPose(id, 1000).progress, release, 'completed casts hold the prepared pose until the shared projectile launch');
      assert(context.combatPose(id, 1000 + delay + .01).progress > release, 'prepared casts recover after the same launch boundary');
      animateCharacter(character, 1, false, castPose);
      assert.equal(context.projectileOrigin(id, spell.id, worldOrigin), true);
      const rig = character.userData.rig;
      if (className === 'Ranger') {
        rig.bow.batch.getMatrixAt(rig.bow.parts['nocked-arrow-0'], partMatrix);
        expectedOrigin.setFromMatrixPosition(partMatrix); rig.bow.batch.localToWorld(expectedOrigin);
      } else rig.leftHand.getWorldPosition(expectedOrigin);
      assert(worldOrigin.distanceTo(expectedOrigin) < 1e-6, `${race.id}/${gender.id}/${spell.id} emits from its rendered ${className === 'Ranger' ? 'nocked arrow' : 'free palm'}, including weapon scale`);
      assert(worldOrigin.y > character.position.y + .8 && worldOrigin.y < character.position.y + 3, 'the origin respects the race body proportions and elevated ground');
      assert.equal(context.combatPose(id, 4000), false, 'normal attack recovery still expires');
    }
  }
}
assert.equal(context.projectileOrigin('missing', 'arrow', worldOrigin), false, 'unloaded remote avatars use the event fallback');
console.log('PASS: one-time local/remote weapon and hand release origins, all race/gender and weapon scales, exact release poses, unchanged arrival times and late-event/fallback handling.');

const appearance = { skin: '#eeb58b', hair: '#62452f', hairStyle: 'swept', outfit: '#548d68', accent: '#e5b961' };
function pose(character) {
  const result = [];
  character.traverse(node => result.push([node.position.toArray(), node.rotation.toArray(), node.scale.toArray(), node.visible, node.isInstancedMesh ? [...node.instanceMatrix.array] : []]));
  return result;
}
for (const [className, abilities] of ['Ranger','Mage','Knight'].map(name=>[name,spellsForClass(name).map(s=>s.id)])) {
  const upgraded = { ...starterGear(className).equipment };
  for (const item of Object.values(GEAR)) if (item.price > 0 && (!item.className || item.className === className)) upgraded[equipmentSlotFor(upgraded, item.id)] = item.id;
  for (const equipment of [undefined, upgraded]) {
    const character = makeCharacter({ ...appearance, className }, equipment);
    character.position.set(3, 2, -8); character.rotation.y = .9;
    animateCharacter(character, 3, false);
    const rest = pose(character), objects = [];
    character.traverse(object => objects.push(object));
    for (const ability of abilities) {
      let first;
      for (const progress of [0, .12, .24, .38, .60, .85, 1, NaN]) {
        animateCharacter(character, 3, false, { ability, progress });
        character.updateMatrixWorld(true);
        const current = [];
        character.traverse(object => { current.push(object); assert(object.matrixWorld.elements.every(Number.isFinite)); });
        assert.deepEqual(current, objects, 'attacks never allocate rig objects');
        assert.deepEqual(character.position.toArray(), [3, 2, -8]); assert.equal(character.rotation.y, .9);
        if (progress === .12) first = pose(character);
        if (progress === .60) assert.notDeepEqual(pose(character), first, `${ability} has a timed action/recovery pose`);
        if (className === 'Ranger' && !SPELLS[ability].movementDistance && progress === .24) {
          const bow = character.userData.rig.bow, matrix = new THREE.Matrix4();
          bow.batch.getMatrixAt(bow.parts['string-top'], matrix);
          assert(matrix.elements[14] < -.20, 'the string physically draws backward');
          bow.batch.getMatrixAt(bow.parts['nocked-arrow-0'], matrix);
          assert(matrix.elements[10] > .8, 'the drawn bow visibly holds a nocked arrow');
        }
        if (className === 'Ranger' && !SPELLS[ability].movementDistance && progress === .38) {
          const bow = character.userData.rig.bow, matrix = new THREE.Matrix4();
          bow.batch.getMatrixAt(bow.parts['nocked-arrow-0'], matrix);
          assert.equal(matrix.elements[10], 0, 'release removes the nocked arrow');
        }
      }
      for (const gathering of ['mining', 'woodcutting', 'herbalism']) {
        animateCharacter(character, 3, false, { ability, progress: .24 }, gathering);
        assert(character.userData.rig.classGear.every(gear => !gear.visible), 'gathering overrides attack gear');
        animateCharacter(character, 3, false);
        assert.deepEqual(pose(character), rest, 'gather/attack cancellation restores every pivot and bow instance');
      }
      animateCharacter(character, 3, false, { ability, progress: 1 });
      assert.deepEqual(pose(character), rest, 'a completed attack restores the exact rest pose');
    }
  }
}
console.log('PASS: expanded cast rigs and radial impacts at full spell range, shared primary range displays, every Volley target, moving-target homing and locked bursts, fire trails, finite capped buffers, reusable disposal, class casts/bow draw and gather/attack restoration.');

// All newly added projectiles and waves remain attached to elevated terrain.
const raisedScene = new THREE.Scene(), height = (x,z) => 20 + x*.08 + z*.04;
const raised = createCombatEffects(raisedScene, undefined, height), matrix = new THREE.Matrix4(), location = new THREE.Vector3();
for (const spell of Object.values(SPELLS)) {
  const distance = spell.range;
  const timing = combatTiming(spell.id, distance);
  raised.play({ability:spell.id,from:{x:0,z:0},targets:[{id:'raised',x:0,z:distance}],rotation:0}, 0);
  raised.update(spell.effect === 'damage' ? Math.max(0,timing.delay + timing.flight - .000001) : .1);
  const mesh=raisedScene.getObjectByName('combat-effects'); assert(mesh.count>0, `${spell.id} renders by its impact`);
  mesh.getMatrixAt(0,matrix); location.setFromMatrixPosition(matrix);
  if(spell.visual!=='radial' && spell.effect==='damage') closeTo(location,[0,height(0,distance)+.75,distance],`${spell.id} meets its elevated target at the shared impact time`);
  for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);location.setFromMatrixPosition(matrix);assert(matrix.elements.every(Number.isFinite));assert(location.y>=height(location.x,location.z)-.15,`${spell.id} stays above its local ground`);}
  raised.update(8);assert.equal(mesh.count,0);raised.clear();assert.equal(raisedScene.children.length,0);
}
console.log(`PASS: all ${Object.keys(SPELLS).length} spell visuals, sequential shield bounces, elevated projectile endpoints, terrain-following waves, and expired effect cleanup.`);
