import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const notes = 'wiki/patch-notes.json';

function checkPatchNotes(files) {
  const gameplay = files.some(path => /^(src\/|server\.mjs$|public\/(models|ui|audio|textures|nfts|contracts)\/)/.test(path));
  assert(!gameplay || files.includes(notes), `Gameplay changed: update ${notes} with player-facing notes and review affected wiki prose.`);
}

if (process.argv[2] === '--self-check') {
  for (const file of ['src/content.ts', 'src/style.css', 'server.mjs', 'public/models/new.glb', 'public/ui/icon.png', 'public/audio/cast.ogg', 'public/textures/grass.png', 'public/nfts/pets/1.json', 'public/contracts/MossvaleNFT.json']) {
    assert.throws(() => checkPatchNotes([file]), /Gameplay changed/);
    checkPatchNotes([file, notes]);
  }
  checkPatchNotes(['wiki/data.ts', '.github/workflows/production.yml', 'deploy/PRODUCTION.md']);
  checkPatchNotes([]);
  console.log('PASS wiki sync: gameplay requires patch notes; wiki and deployment changes do not.');
} else {
  const [base, head = 'HEAD'] = process.argv.slice(2);
  assert(base, 'Usage: node wiki/check-sync.mjs <base> [head]');
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trimEnd();
  // New branches have an all-zero before SHA; compare their entire tree.
  let before = /^0+$/.test(base) ? git(['hash-object', '-t', 'tree', '--stdin']) : git(['rev-parse', '--verify', `${base}^{commit}`]);
  const after = git(['rev-parse', '--verify', `${head}^{commit}`]);
  if (process.env.GITHUB_EVENT_NAME === 'pull_request') before = git(['merge-base', before, after]);
  const files = git(['diff', '--name-only', '--no-renames', '-z', before, after, '--']).split('\0').filter(Boolean);
  checkPatchNotes(files);
  console.log('PASS wiki sync: changed gameplay has patch notes.');
}
