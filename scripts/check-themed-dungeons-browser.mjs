// Start Vite, then: node scripts/check-themed-dungeons-browser.mjs http://127.0.0.1:5198
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dungeonStages, dungeonBounds } from '../src/dungeon.ts';
import { THEMED_DUNGEON_ROSTERS } from '../src/bestiary.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('../artifacts/themed-dungeons/', import.meta.url));
const run = promisify(execFile), session = `themed-dungeons-${process.pid}`;
const browser = async (...args) => (await run('npx', ['--no-install', 'agent-browser', '--session', session, ...args], {cwd: root, timeout: 45000, maxBuffer: 2_000_000})).stdout;
const evaluate = async source => JSON.parse(await browser('eval', `(()=>{const check=(ok,message)=>{if(!ok)throw Error(message)};${source}})()`));
const base = process.argv[2] ?? 'http://127.0.0.1:5198', report = [];
await mkdir(output, {recursive: true});
try {
  await browser('set', 'viewport', '1440', '1000');
  for (const id of ['plagueworks', 'emberfall', 'veilhaven']) {
    await browser('open', `${base}/dungeon-preview.html?dungeon=${id}`);
    await browser('wait', '--fn', "document.body.dataset.ready === 'true'");
    await browser('snapshot', '-i');
    await evaluate(`check(dungeonPreview.state.kind===${JSON.stringify(id)},'correct live dungeon');check(document.querySelector('#dungeon').options.length===7,'all seven destinations');return dungeonPreview.selfCheck();`);
    await evaluate(`const {position:p,layout}=dungeonPreview,a=layout.preparation;check(a&&p.x>=a.minX&&p.x<=a.maxX&&p.z>=a.minZ&&p.z<=a.maxZ,'arrive inside protected foyer');check(document.querySelector('#status').textContent.includes('Arrival sanctuary'),'arrival protection is explained');return true;`);
    await browser('screenshot', `${output}${id}-entry.png`);
    await evaluate(`const models=dungeonPreview.scene.children.filter(node=>node.userData.enemyRig?.imported);for(const kind of ${JSON.stringify(THEMED_DUNGEON_ROSTERS[id])})check(models.some(node=>node.name===kind&&node.getObjectByName(kind+'-body')),'imported model appears in dungeon: '+kind);check(new Set(models.map(node=>node.name)).size===12,'12 distinct models per dungeon');return true;`);
    const stages=dungeonStages(id),deferred=stages.filter(stage=>stage.optional).at(-1);
    assert(deferred, "expanded dungeon has optional exploration");
    const route=[...stages.filter(stage=>stage!==deferred),deferred];
    for (const {id:stage,optional} of route) {
      await evaluate(`dungeonPreview.inspect(${JSON.stringify(stage)});check(!document.querySelector('#clear').disabled,'encounter reachable: ${stage}');return true;`);
      if(optional&&stage===stages.find(stage=>stage.optional)?.id) await browser('screenshot', `${output}${id}-exploration.png`);
      if (stage==='confluence'||stage==='throne') {
        await browser('screenshot', `${output}${id}-${stage}.png`);
        await evaluate(`document.querySelector('#mechanic').click();check(dungeonPreview.state.hazards.length>0,'boss telegraph starts immediately');return true;`);
        await browser('screenshot', `${output}${id}-${stage}-attack.png`);
      }
      await browser('click', '#clear');
      await evaluate(`dungeonPreview.activateSeals();check(dungeonPreview.state.clearedStages.includes(${JSON.stringify(stage)}),'encounter clears');check(dungeonPreview.state.completed===${stage===deferred.id},'every room must be cleared before completion');return true;`);
    }
    await evaluate(`dungeonPreview.inspect('throne');return true;`);
    const result = await evaluate(`check(dungeonPreview.scene.getObjectByName('Dungeon: completion return').visible,'return portal opens');check(dungeonPreview.state.clearedStages.length===${stages.length},'all encounters clear');return {id:dungeonPreview.state.kind,completed:true,encounters:${stages.length},enemies:${stages.reduce((sum,stage)=>sum+stage.enemies.length,0)},enemyTypes:${THEMED_DUNGEON_ROSTERS[id].length},bounds:${JSON.stringify(dungeonBounds(id))},render:dungeonPreview.rendererInfo};`);
    await browser('click', '#overview');
    await evaluate(`const {bounds:b,camera}=dungeonPreview;for(const x of [b.minX,b.maxX])for(const z of [b.minZ,b.maxZ]){const p=camera.position.clone().set(x,0,z).project(camera);check(Math.abs(p.x)<1&&Math.abs(p.y)<1,'expanded overview is fully in frame');}return true;`);
    await browser('screenshot', `${output}${id}-layout.png`);
    const errors = (await browser('errors')).trim();
    assert.equal(errors, '', `${id}: browser errors: ${errors}`);
    report.push(result);
  }
  await writeFile(`${output}browser-report.json`, JSON.stringify(report, null, 2)+'\n');
  console.log('PASS: three browser interiors, 36 distinct imported models, six visible boss encounters and attack demonstrations, all expanded main and optional encounters, seals, final returns, seven-dungeon selector; no browser errors. Screenshots: '+output);
} finally { await browser('close').catch(()=>{}); }
