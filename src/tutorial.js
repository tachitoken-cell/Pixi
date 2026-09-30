// Tutorial by Guide Nora: starts the first time you play (skippable at any step), and can be
// replayed by talking to her. Each step shows a hint panel; a golden arrow marks where to go.
import * as THREE from 'three';

const KEY = 'voxelquest-tutorial';
const GROUNDS = [-35, -35, -13, -13];          // Training Grounds in Mossvale (see maps.js)
const KAEL = [10, 3];
const GROUND_C = [-24, -24];                    // middle of the Training Grounds                            // Skill Master Kael at the plaza

const STEPS = [
  { id: 'intro', title: 'Welcome, Adventurer!', text: 'I am Nora, the guide of Mossvale. Every hero starts as an Adventurer. Let me show you the basics — it only takes a minute. You can skip at any time.', button: 'Show me' },
  { id: 'move', title: 'Walk to the Training Grounds', text: 'Walk (WASD or click the ground) to the fenced Training Grounds north-west of the plaza. Follow the golden arrow.', target: GROUND_C },
  { id: 'attack', title: 'Auto-attack', text: 'Click a Training Jelly or Hopper. Your hero keeps attacking on his own until it falls. Defeat 3 monsters.', need: 3, event: 'kill', target: GROUND_C },
  { id: 'catch', title: 'Catch a companion', text: 'Hit a monster until its HP bar is below half, then press 2 to throw a Catch Orb. Caught monsters fight at your side and level up with you.', event: 'catch', target: GROUND_C },
  { id: 'sit', title: 'Rest', text: 'Nice catch! Press 1 (Sit) to rest: sitting recovers HP and MP quickly.', event: 'sit' },
  { id: 'skills', title: 'Learn skills', text: 'Skill Master Kael at the plaza teaches new skills as your Job Level rises. Talk to him and put skills on your bar. (K opens your skills anywhere.)', event: 'skills', target: KAEL },
  { id: 'done', title: 'You are ready!', text: 'That is everything. Explore the fields, visit the villages, try the dungeons and build your Miniland (L). A gift for the road: 2 Saat and 100 gold.', button: 'Finish' },
];

export function createTutorial({ $, audio, toast, fx, player, getMapId, reward }) {
  const panel = $('#tut');
  let step = -1, count = 0;
  let status = null;
  try { status = localStorage.getItem(KEY); } catch { /* no storage */ }
  const setStatus = (s) => { status = s; try { localStorage.setItem(KEY, s); } catch { /* not saved */ } };

  // golden arrow over the next place to go
  const arrow = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.4, 4), new THREE.MeshBasicMaterial({ color: 0xffd24a }));
  cone.rotation.x = Math.PI;
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.9, 24), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  arrow.add(cone, ring);
  arrow.visible = false;

  function show() {
    const s = STEPS[step];
    panel.hidden = false;
    panel.innerHTML = `<small>Guide Nora · ${step + 1} / ${STEPS.length}</small><b>${s.title}</b><p>${s.text}</p>
      ${s.need ? `<div class="tut-count">${count} / ${s.need}</div>` : ''}
      <div class="tut-buttons">${s.button ? `<button class="primary" id="tut-next">${s.button}</button>` : ''}${step < STEPS.length - 1 ? '<button id="tut-skip">Skip tutorial</button>' : ''}</div>`;
    $('#tut-next') && ($('#tut-next').onclick = next);
    $('#tut-skip') && ($('#tut-skip').onclick = skip);
  }
  function go(i) {
    step = i; count = 0;
    if (step >= STEPS.length) return finish();
    audio.sfx('talk');
    show();
  }
  function next() { if (STEPS[step]?.id === 'done') return finish(); go(step + 1); }
  function finish() {
    if (status !== 'done') { reward(); setStatus('done'); }
    toast('Tutorial complete! +2 Saat, +100 gold', 4000);
    stop();
  }
  function skip() { setStatus('skipped'); toast('Tutorial skipped. Talk to Guide Nora at the plaza to replay it.', 4000); stop(); }
  function stop() { step = -1; panel.hidden = true; arrow.visible = false; }

  return {
    arrow,
    get active() { return step >= 0; },
    // first launch: start automatically unless done or skipped before
    autostart() { if (!status) setTimeout(() => go(0), 1500); },
    replay() { go(0); },
    event(name) {
      const s = STEPS[step];
      if (!s || s.event !== name) return;
      if (s.need && ++count < s.need) { audio.sfx('click'); return show(); }
      audio.sfx('jobUp');
      fx?.();
      go(step + 1);
    },
    update(t) {
      const s = STEPS[step];
      const [x0, z0, x1, z1] = GROUNDS;
      const inGrounds = getMapId() === 'village' && player.pos.x > x0 && player.pos.x < x1 && player.pos.z > z0 && player.pos.z < z1;
      if (s?.id === 'move' && inGrounds) { audio.sfx('jobUp'); go(step + 1); }
      const tgt = STEPS[step]?.target;
      // the arrow points the way; once you stand in the Training Grounds it is not needed there
      arrow.visible = !!tgt && getMapId() === 'village' && !(tgt === GROUND_C && inGrounds) && Math.hypot(player.pos.x - tgt[0], player.pos.z - tgt[1]) > 4;
      if (arrow.visible) {
        arrow.position.set(tgt[0], 5 + Math.sin(t * 3) * 0.5, tgt[1]);
        cone.rotation.y = t * 2;
        ring.position.y = -4.8 - Math.sin(t * 3) * 0.5;
      }
    },
  };
}
