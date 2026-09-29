// Real browser fixture only: no test ballots reach a game server or the production catalog.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url)), output = `${root}artifacts/polls/`, session = `poll-ui-${process.pid}`;
const run = promisify(execFile);
const browser = async (...args) => (await run('npx', ['--no-install', 'agent-browser', '--session', session, ...args], { cwd: root, timeout: 45000, maxBuffer: 2_000_000 })).stdout;
const evaluate = async source => JSON.parse(await browser('eval', `(()=>{const check=(ok,message)=>{if(!ok)throw Error(message)};${source}})()`));
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mossvale poll UI check</title></head><body><p id="fixture-label">LOCAL UI FIXTURE — ballots and results below are test data</p><script type="module">
import '/src/style.css'; import '/src/art.css'; import '/src/poll.css';
import {mountPollUI} from '/src/poll-ui.ts'; import {POLLS} from '/src/polls.ts';
const poll=structuredClone(POLLS[0]); window.now=poll.opensAt+60000; window.player={hp:100}; window.nearby=true; window.sent=[];
window.poll={...poll,status:'open'}; window.view=(extra={})=>({boothId:'fixture-booth',polls:[structuredClone(window.poll)],serverTime:window.now,...extra});
window.ui=mountPollUI({send:message=>sent.push(message),getPlayer:()=>player,nearby:()=>nearby});
ui.update(view({open:true})); document.body.dataset.ready='true';
</script><style>body{background:#243a2a}#fixture-label{position:fixed;left:25px;bottom:5px;color:#ecdfbc;font:11px sans-serif;letter-spacing:0}</style></body></html>`;
const server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 0 }, plugins: [{ name: 'poll-ui-check', configureServer(server) { server.middlewares.use('/__poll-ui-check', (_request, response) => { response.setHeader('Content-Type', 'text/html'); response.end(html); }); } }] });
await mkdir(output, { recursive: true });
try {
  await server.listen();
  const url = `http://127.0.0.1:${server.httpServer.address().port}/__poll-ui-check`;
  await browser('set', 'viewport', '1280', '900');
  await browser('open', url); await browser('wait', '--fn', "document.body.dataset.ready === 'true'"); await browser('snapshot', '-i');
  await evaluate(`check(ui.isOpen(),'explicit response opens panel');check(document.querySelector('#poll-window').getAttribute('aria-modal')==='false','nonmodal panel');check(document.querySelector('#poll-review').disabled,'every answer required');check(!document.querySelector('.poll-result'),'open votes hidden');check(document.querySelector('#poll-ballot-title').textContent==='Stake MOSS?','real proposal title');return true;`);
  await browser('screenshot', `${output}poll-desktop.png`);
  await browser('check', '#poll-answer-0-yes');
  await evaluate(`const radio=document.querySelector('#poll-answer-0-yes');radio.focus();ui.refresh();check(document.activeElement===radio,'passive refresh preserves DOM and focus');check(!document.querySelector('#poll-review').disabled,'complete draft permits review');return true;`);
  await browser('click', '#poll-review');
  await evaluate(`check(sent.length===0,'review never submits');check(document.querySelector('#poll-submit'),'review offers explicit submit');check(!document.querySelector('input[type=radio]'),'review choices read only');return true;`);
  await browser('screenshot', `${output}poll-review.png`);
  await browser('click', '#poll-submit');
  await evaluate(`check(sent.length===1&&sent[0].type==='pollVote'&&sent[0].answers['add-staking']==='yes','exact ballot request');check(!document.querySelector('.poll-receipt'),'no optimistic receipt');check(document.querySelector('#poll-submit').disabled,'duplicate submission blocked');ui.reject('Saving failed. Please retry.');check(!document.querySelector('#poll-submit').disabled,'rejection permits retry');check(document.querySelector('#poll-status').textContent.includes('Saving failed'),'rejection visible');return true;`);
  await browser('click', '#poll-submit');
  await evaluate(`check(sent.length===2,'retry dispatched');poll.ballot={answers:{'add-staking':'yes'},submittedAt:now};ui.update(view({submittedPollId:poll.id}));check(document.querySelector('.poll-receipt'),'server receipt displayed');check(!document.querySelector('#poll-submit'),'saved ballot cannot repeat');check(!document.querySelector('.poll-result'),'receipt does not reveal open counts');return true;`);
  await browser('screenshot', `${output}poll-receipt.png`);
  await evaluate(`now=poll.closesAt+1;poll.status='closed';poll.results={ballots:20,questions:{'add-staking':{yes:7,no:3,skip:10,approval:70,passed:true}}};ui.update(view());check(document.querySelector('.poll-passed').textContent==='Passed','70 percent passes');check(document.querySelector('.poll-result-verdict').textContent.includes('70.0%'),'skip-excluded percentage');check(document.querySelector('.poll-result-counts').textContent.includes('Skipped10'),'skip count displayed');check(document.querySelector('.poll-answer').textContent.includes('Yes'),'receipt answer retained in results');return true;`);
  await browser('screenshot', `${output}poll-results.png`);
  await evaluate(`ui.close();ui.update(view({submittedPollId:poll.id}));check(!ui.isOpen(),'late vote response cannot reopen');ui.update(view({open:true,polls:[]}));check(document.querySelector('.poll-empty').textContent.includes('No polls posted yet'),'honest empty catalog');return true;`);
  await browser('screenshot', `${output}poll-empty.png`);
  await evaluate(`delete poll.ballot;delete poll.results;poll.status='open';now=poll.opensAt+60000;poll.questions.push({id:'second-fixture',text:'A second question for keyboard and draft testing?'});ui.update(view());return true;`);
  await browser('check', '#poll-answer-0-no');
  await browser('check', '#poll-answer-1-skip');
  await evaluate(`check(!document.querySelector('#poll-review').disabled,'multi-question explicit skip completes ballot');const upcoming={...poll,id:'upcoming-fixture',title:'Upcoming fixture',opensAt:now+60000,closesAt:now+120000,status:'upcoming'};ui.update(view({polls:[poll,upcoming]}));document.querySelector('[data-poll-select="upcoming-fixture"]').click();check(!document.querySelector('input[type=radio]'),'upcoming preview cannot vote');document.querySelector('[data-poll-select="'+poll.id+'"]').click();check(document.querySelector('#poll-answer-0-no').checked&&document.querySelector('#poll-answer-1-skip').checked,'switching polls preserves draft');return true;`);
  await browser('set', 'viewport', '390', '844');
  await browser('screenshot', `${output}poll-mobile.png`);
  await evaluate(`const panel=document.querySelector('#poll-window'),box=panel.getBoundingClientRect();check(box.left>=0&&box.right<=innerWidth&&box.bottom<=innerHeight,'mobile panel fits viewport');check(panel.scrollWidth<=panel.clientWidth,'no horizontal panel overflow');return true;`);
  await browser('set', 'viewport', '320', '568');
  await evaluate(`const panel=document.querySelector('#poll-window');check(panel.scrollWidth<=panel.clientWidth,'320px panel avoids horizontal overflow');check(document.querySelector('.poll-body').scrollHeight>document.querySelector('.poll-body').clientHeight,'small mobile ballot scrolls');document.querySelector('#poll-close').focus();return true;`);
  await browser('press', 'Escape');
  await evaluate(`check(!ui.isOpen(),'Escape closes');ui.update(view({open:true}));nearby=false;ui.refresh();check(!ui.isOpen(),'walking away closes');nearby=true;ui.update(view({open:true}));player.hp=0;ui.refresh();check(!ui.isOpen(),'death closes');player.hp=100;now=poll.closesAt-100;ui.update(view({open:true}));const realNow=Date.now;try{Date.now=()=>realNow()+200;ui.refresh();check(!document.querySelector('#poll-review'),'elapsed deadline disables voting without a new server response');}finally{Date.now=realNow;}ui.dispose();check(!document.querySelector('#poll-window'),'dispose removes panel');return true;`);
  assert.equal((await browser('errors')).trim(), '', 'browser errors');
  console.log(`PASS poll UI: native answers, review/submit, durable receipts, retry, hidden open results, closed results, draft/focus preservation, empty/upcoming/expired states, mobile overflow, Escape/proximity/death. Screenshots: ${output}`);
} finally {
  await browser('close').catch(() => {});
  await server.close();
}
