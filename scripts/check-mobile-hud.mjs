import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createGameServer } from '../server.mjs';
import { createAuctionChain } from '../src/auction-chain.mjs';
import { createStoreChain } from '../src/store-chain.mjs';
import { starterGear } from '../src/progression.ts';
import { spellsForClass } from '../src/spells.ts';
import { DEFAULT_APPEARANCE } from '../src/appearance.ts';

// This fixture uses the real server, local guest auth, and disposable saves.
// UI interactions and measurements must be performed through CUA, not a CLI browser.
// Build first, then: node scripts/check-mobile-hud.mjs --serve [2589]
// Validate CUA measurements: node scripts/check-mobile-hud.mjs --geometry report.json
export const phoneSizes = [[844, 390], [667, 375], [568, 320]];

// Copy this function into a CUA locator('body').evaluate(...) call. It only reads DOM.
export function measureMobileHud(root, state = 'gameplay') {
  const view = root.ownerDocument.defaultView;
  function rect(element, name) {
    if (!element || view.getComputedStyle(element).visibility === 'hidden') return null;
    const r = element.getBoundingClientRect();
    return r.width && r.height ? { name, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null;
  }
  const find = selector => rect(root.querySelector(selector), selector);
  const common = { state, viewport: { width: view.innerWidth, height: view.innerHeight } };
  if (state === 'gameplay') return { ...common,
    slots: [...root.querySelectorAll('#hotbar .hotbar-slot')].map((slot, i) => rect(slot, `Skill ${i + 1}`)).filter(Boolean),
    bank: find('#hotbar .hotbar-page'), joystick: find('#mobile-joystick'), attack: find('#mobile-attack'), chat: find('#chat-preview'), menu: find('#mobile-menu-button'),
    chatPreviewLines: [...root.querySelectorAll('.chat-preview-line')].filter(line => rect(line, 'message')).length,
  };
  const chat = state === 'chat';
  return { ...common, panel: find(chat ? '#chat' : '#panel'), close: find(chat ? '#chat-close' : '#close-panel'),
    ...(chat ? { input: find('#chat-input'), inputFocused: root.ownerDocument.activeElement === root.querySelector('#chat-input'),
      combatVisible: !!find('#mobile-attack') || !!find('#hotbar .hotbar-slot') } : {}),
  };
}

export function verifyGeometry(reports) {
  const fits = (r, viewport) => r && r.width > 0 && r.height > 0 && r.left >= -1 && r.top >= -1
    && r.right <= viewport.width + 1 && r.bottom <= viewport.height + 1;
  const overlaps = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
  for (const [width, height] of phoneSizes) {
    const report = reports.find(r => r.viewport.width === width && r.viewport.height === height && r.state === 'gameplay');
    assert(report, `missing gameplay report at ${width}x${height}`);
    assert.equal(report.slots.length, 4, 'four hotbar slots remain visible on the current mobile page');
    const targets = [report.bank, report.joystick, report.attack, report.chat, report.menu, ...report.slots];
    for (const target of targets) {
      assert(fits(target, report.viewport), `${width}x${height}: ${target?.name} fits viewport`);
      assert(target.width >= 44 && target.height >= 44, `${target.name} keeps a 44px touch target`);
    }
    for (const [index, target] of targets.entries()) for (const other of targets.slice(index + 1))
      assert(!overlaps(target, other), `${width}x${height}: ${target.name} overlaps ${other.name}`);
    assert(report.chat.bottom <= Math.min(report.joystick.top, report.attack.top, ...report.slots.map(r => r.top)), 'chat stays above movement and combat controls');
    assert(report.attack.width > Math.max(...report.slots.map(r => r.width)), 'Attack remains larger than a skill');
    assert(report.chatPreviewLines >= 1 && report.chatPreviewLines <= 3, 'chat shows one to three preview lines');
    for (const state of ['chat', 'character', 'bags']) {
      const panel = reports.find(r => r.viewport.width === width && r.viewport.height === height && r.state === state);
      assert(panel, `missing ${state} report at ${width}x${height}`);
      assert(fits(panel.panel, panel.viewport), `${state} panel fits ${width}x${height}`);
      assert(fits(panel.close, panel.viewport), `${state} close control stays reachable`);
      if (state === 'chat') {
        assert(fits(panel.input, panel.viewport), 'chat input fits');
        assert(panel.inputFocused, 'tapping the chat input focuses it for typing');
        assert(panel.combatVisible, 'expanded chat keeps combat controls visible');
      }
    }
  }
  console.log('PASS mobile HUD geometry: three phone sizes, four skills per page, 44px touch targets, bounded chat above controls, playable expanded chat, and reachable chat/character/bags panels.');
}

const entry = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (entry && process.argv[2] === '--geometry') {
  verifyGeometry(JSON.parse(readFileSync(process.argv[3], 'utf8')));
} else if (entry) {
  const serve = process.argv[2] === '--serve';
  assert(serve || process.argv.length === 2, 'Use --serve [port] or --geometry report.json');
  const port = serve ? Number(process.argv[3] || 2589) : 0;
  assert(Number.isInteger(port) && port >= 0 && port <= 65535);
  const index = new URL('../dist/index.html', import.meta.url);
  if (serve) assert(existsSync(index), 'Run npm run build before serving the browser fixture');
  const dataDir = mkdtempSync(join(tmpdir(), 'mossvale-mobile-hud-'));
  const token = randomBytes(32).toString('base64url');
  const learnedSpells = spellsForClass('Ranger').filter(spell => spell.requiredLevel <= 50).map(spell => spell.id);
  const hero = {
    id: randomUUID(), name: 'Touch Tester', x: 0, z: 8, coordinateVersion: 2, zone: 'greenwood', rotation: 0,
    appearance: { ...DEFAULT_APPEARANCE, className: 'Ranger' }, characterCreated: true, talents: [],
    ...starterGear('Ranger'), level: 50, hp: 688, maxHp: 688, xp: 0, gold: 1000,
    inventory: { wood: 12, crystal: 8, herb: 4, potion: 3, relic: 1 }, quest: { stage: 0, kills: 0, crystals: 0 },
    learnedSpells,
    hotbar: [...learnedSpells.slice(0, 7), 'mend'],
    hotbar2: [...learnedSpells.slice(7, 14), 'mend'], hotbarExtra: [learnedSpells[14], 'mend'], hotbar2Extra: [learnedSpells[15], 'mend'],
    onboarding: { version: 1, looted: true, bagViewed: true, gearViewed: true, completed: true },
    ridingRank: 2, ownedMounts: ['horse', 'wolf'],
  };
  writeFileSync(join(dataDir, 'players.json'), JSON.stringify({ [createHash('sha256').update(token).digest('hex')]: { characters: [hero] } }));
  // Do not inherit even optional production auth/chain connections from the caller.
  delete process.env.KEYCLOAK_ACCOUNT_ISSUER;
  const offlineChain = { contract: '', authorityKey: '', rpcUrl: '', rpc: async () => { throw Error('Fixture forbids RPC'); } };
  const game = createGameServer({ port, host: '127.0.0.1', dataDir, keycloak: null, databaseUrl: '', databaseCaBase64: '',
    realmId: 'eu', realmEuOrigin: '', realmUsOrigin: '', gameAllowedOrigins: '', walletOidc: { env: {} },
    auctionChain: createAuctionChain(offlineChain), mossAuctionChain: createAuctionChain({ ...offlineChain, currency: 'moss' }),
    storeChain: createStoreChain({ ...offlineChain, legacyContract: '' }),
  });
  const handlers = game.server.listeners('request');
  game.server.removeAllListeners('request');
  game.server.on('request', (req, res) => {
    const panelFixture = new URL('../artifacts/mobile-hud/panels.html', import.meta.url);
    if (new URL(req.url, 'http://localhost').pathname === '/__qa/panels' && existsSync(panelFixture)) {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }).end(readFileSync(panelFixture)); return;
    }
    if (new URL(req.url, 'http://localhost').pathname === '/' && existsSync(index)) {
      // Injection is confined to this loopback fixture; the production build is never changed.
      const script = `<script>window.__MOSSVALE_NATIVE__=${!new URL(req.url, 'http://localhost').searchParams.has('desktop')};localStorage.setItem('mossvale-session',${JSON.stringify(token)});</script>`;
      const html = readFileSync(index, 'utf8').replace('<head>', `<head>${script}`);
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }).end(req.method === 'HEAD' ? undefined : html);
      return;
    }
    // Avoid persistent caches or update prompts while the local build is changing.
    if (new URL(req.url, 'http://localhost').pathname === '/sw.js') { res.writeHead(404).end(); return; }
    for (const handler of handlers) handler.call(game.server, req, res);
  });
  let socket, timer, stopping = false;
  async function stop() {
    if (stopping) return; stopping = true; clearTimeout(timer); socket?.terminate();
    await game.stop(); rmSync(dataDir, { recursive: true, force: true });
  }
  try {
    const actualPort = await game.start(), origin = `http://127.0.0.1:${actualPort}`;
    const config = await (await fetch(`${origin}/api/config`)).json();
    assert.equal(config.keycloak, null); assert(config.realms.every(realm => !realm.origin), 'fixture cannot navigate to a production realm');
    const roster = await (await fetch(`${origin}/api/roster`, { headers: { 'X-Guest-Token': token } })).json();
    assert.equal(roster.characters.length, 1); assert.equal(roster.characters[0].name, hero.name);
    socket = new WebSocket(`${origin.replace('http:', 'ws:')}/socket`);
    await once(socket, 'open');
    const welcome = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(Error('Fixture join timed out')), 5000);
      socket.on('message', raw => { const message = JSON.parse(raw.toString()); if (message.type === 'welcome') resolve(message); });
    });
    socket.send(JSON.stringify({ type: 'join', token, characterId: hero.id }));
    const entered = await welcome; clearTimeout(timer);
    assert.equal(entered.player.name, hero.name); assert.equal(entered.player.hotbar.length, 8);
    assert(entered.player.hotbar.every(Boolean), 'fixture populates every skill position');
    assert.equal(entered.player.hotbar2.length,8);assert(entered.player.hotbar2.every(Boolean),'fixture populates the second bank');
    assert.equal(entered.player.hotbarExtra.length,2);assert(entered.player.hotbarExtra.every(Boolean));assert.equal(entered.player.hotbar2Extra.length,2);assert(entered.player.hotbar2Extra.every(Boolean),'fixture also populates slots9/10 in both banks');
    socket.close(); await once(socket, 'close');
    console.log('PASS disposable real-server fixture: loopback only, local guest roster, level-50 character, 20 assigned hotbar slots across two saved banks, no database/auth/RPC connections.');
    if (serve) {
      console.log(`Mobile HUD fixture: ${origin} (PID ${process.pid}). Choose Play as guest, then Enter world. Ctrl-C removes temporary saves.`);
      for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void stop().then(() => process.exit(0)); });
      timer = setTimeout(() => { void stop().then(() => process.exit(0)); }, 30 * 60 * 1000);
    } else await stop();
  } catch (error) { await stop(); throw error; }
}
