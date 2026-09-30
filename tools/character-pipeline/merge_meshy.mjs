// Merge the Meshy exports (same mesh + skeleton, one clip each) into one GLB with all clips and a small texture.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, textureCompress, resample } from '@gltf-transform/functions';
import sharp from 'sharp';
const U = '/root/.claude/uploads/6314dd0f-8b9f-5adc-b8c1-f139914c32d7/';
const FILES = { Walk: '9fe459bc-Meshy_AI_Mossvale_Adventurer_C_biped_Animation_Walking_withSkin.glb', Idle: '6cf40212-Meshy_AI_Mossvale_Adventurer_C_biped_Animation_Alert_withSkin.glb',
  Run: '0f1d608b-Meshy_AI_Mossvale_Adventurer_C_biped_Animation_Running_withSkin.glb', Attack: '0d4bb42c-Meshy_AI_Mossvale_Adventurer_C_biped_Animation_Attack_withSkin.glb',
  Tired: '36e86fc3-Meshy_AI_Mossvale_Adventurer_C_biped_Animation_Elderly_Shaky_Walk_withSkin.glb' };
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(U + FILES.Walk);
const root = doc.getRoot(), buf = root.listBuffers()[0];
root.listAnimations()[0].setName('Walk');
const byName = new Map(root.listNodes().map((n) => [n.getName(), n]));
for (const [name, file] of Object.entries(FILES)) {
  if (name === 'Walk') continue;
  const src = await io.read(U + file);
  for (const a of src.getRoot().listAnimations()) {
    const anim = doc.createAnimation(name);
    for (const ch of a.listChannels()) {
      const tn = byName.get(ch.getTargetNode().getName());
      if (!tn) continue;
      const s = ch.getSampler();
      const inp = doc.createAccessor().setType(s.getInput().getType()).setArray(s.getInput().getArray().slice()).setBuffer(buf);
      const out = doc.createAccessor().setType(s.getOutput().getType()).setArray(s.getOutput().getArray().slice()).setBuffer(buf);
      const smp = doc.createAnimationSampler().setInput(inp).setOutput(out).setInterpolation(s.getInterpolation());
      anim.addSampler(smp).addChannel(doc.createAnimationChannel().setTargetNode(tn).setTargetPath(ch.getTargetPath()).setSampler(smp));
    }
  }
}
// only the colour texture matters under toon shading
for (const m of root.listMaterials()) { m.setNormalTexture(null); m.setMetallicRoughnessTexture(null); m.setMetallicFactor(0); m.setRoughnessFactor(0.9); }
await doc.transform(prune(), dedup(), resample(), textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [1024, 1024], quality: 88 }));
for (const a of root.listAnimations()) {
  let t = 0; for (const s of a.listSamplers()) t = Math.max(t, s.getInput().getMax([])[0]);
  const hips = a.listChannels().find((c) => c.getTargetNode().getName() === 'mixamorig:Hips' && c.getTargetPath() === 'translation');
  let info = '';
  if (hips) { const o = hips.getSampler().getOutput(); const n = o.getCount(), v = [], w = []; o.getElement(0, v); o.getElement(n - 1, w); info = `hips start ${v.map((x) => x.toFixed(2))} end ${w.map((x) => x.toFixed(2))}`; }
  console.log(a.getName(), a.listChannels().length, 'ch', t.toFixed(2), 's', info);
}
await io.write(process.argv[2], doc);
