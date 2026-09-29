import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createBenjiModel, exportBenjiGlb } from './lib/benji-model.mjs';

const root = new URL('../', import.meta.url);
const source = kind => new URL(`assets/source/${kind}/benji-2026-09-28/`, root);
const readJson = async (kind, name) => JSON.parse(gunzipSync(await fs.readFile(new URL(`${name}.json.gz`, source(kind)))));
const load = async bytes => new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const save = async (name, scene, animations) => {
  for (const clip of animations) clip.optimize();
  const exported = new THREE.Scene(); exported.name = scene.name; exported.userData = scene.userData;
  exported.add(...scene.children.slice());
  const bytes = await exportBenjiGlb(exported, animations);
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'benji-glb-'));
  try {
    const input = path.join(temp, 'source.glb'), output = new URL(`public/models/${name}.glb`, root);
    await fs.writeFile(input, bytes);
    execFileSync('npx', ['--yes', '@gltf-transform/cli@4.5.0', 'dedup', input, output.pathname], { stdio: 'inherit' });
    console.log(`${name}: ${animations.length} clips, ${(await fs.stat(output)).size} bytes`);
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
};

// Use Benji's actual v12 GLB; retain the eight current shield ritual clips because
// the source explicitly leaves the 70%/35% mechanics in place.
const bytes = execFileSync('python3', ['-c', 'import zipfile,sys;sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read("v12/export/instant-combat-monsters.glb"))',
  new URL('mossvale_instant_combat_v12.zip', source('instant-combat')).pathname], { maxBuffer: 16 * 1024 * 1024 });
const ic = await load(bytes);
const legacy = await readJson('instant-combat', 'legacy-shield-clips');
ic.animations.push(...legacy.map(clip => THREE.AnimationClip.parse(clip)));
for (const model of ic.scene.children) {
  const data = await readJson('instant-combat', model.name);
  model.userData.authoredAnimations = Object.fromEntries(Object.entries(data.animations).map(([name, { tracks, ...metadata }]) => [name, metadata]));
}
await save('instant-combat-monsters', ic.scene, ic.animations);

const scene = new THREE.Group(), animations = [];
const aliases = { upperarm_UR: 'right-arm', upperarm_UL: 'left-arm', upperarm_LR: 'right-lower-arm', upperarm_LL: 'left-lower-arm',
  wing_upper_R: 'right-wing', wing_upper_L: 'left-wing', wing_lower_R: 'right-lower-wing', wing_lower_L: 'left-lower-wing' };
for (const name of ['horned-apostle', 'apostle-clone', 'apostle-incarnate']) {
  const built = createBenjiModel(await readJson('horned-apostle', name), { name, boneName: bone => `${name}-${aliases[bone.name] || bone.name}` });
  const stars = new THREE.Group(); stars.name = `${name}-stars`;
  const orbit = built.bones.filter(bone => bone.userData.sourceName.startsWith('star_'));
  orbit[0].parent.add(stars); for (const bone of orbit) stars.add(bone);
  scene.add(built.scene); animations.push(...built.animations);
}
const rewards = await load(await fs.readFile(new URL('preserved-rewards.glb', source('horned-apostle'))));
scene.add(...rewards.scene.children.slice());
await save('horned-apostle', scene, animations);

const spellScene = new THREE.Group(), spellAnimations = [];
for (const suffix of ['claws','star','palm','chain','feather','eclipse','soul','vortex','black-hole','rune-ring','rift','portal-crown']) {
  const built = createBenjiModel(await readJson('horned-apostle', `spell-${suffix}`), { name: `apostle-spell-${suffix}` });
  spellScene.add(built.scene); spellAnimations.push(...built.animations);
}
await save('apostle-spells', spellScene, spellAnimations);
