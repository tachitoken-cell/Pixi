type Metric = 'fps' | 'ping';
const storageKey = 'mossvale-performance';

export function createPerformanceHud(root: HTMLElement, sendPing: (id: number) => void) {
  const settings = { fps: false, ping: false };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    for (const key of ['fps', 'ping'] as const) settings[key] = saved?.[key] === true;
  } catch { /* Optional diagnostics must work when storage is blocked. */ }
  root.innerHTML = '<span data-metric="fps" title="Frames per second"><span class="metric-label">FPS</span><b>—</b></span><span data-metric="ping" title="Ping: round-trip time to the game server"><span class="metric-label">Ping</span><b>—</b></span>';
  const rows = { fps: root.querySelector<HTMLElement>('[data-metric="fps"]')!, ping: root.querySelector<HTMLElement>('[data-metric="ping"]')! };
  const values = { fps: rows.fps.querySelector('b')!, ping: rows.ping.querySelector('b')! };
  const displayed: Record<Metric, string> = { fps: '—', ping: '—' };
  let active = false, start: number | undefined, frames = 0, sequence = 0, nextPing = 0;
  let pending: { id: number; sent: number } | undefined;
  function write(key: Metric, text: string) { if (displayed[key] !== text) { displayed[key] = text; values[key].textContent = text; } }
  function visibility() {
    root.hidden = !active || !settings.fps && !settings.ping;
    rows.fps.hidden = !settings.fps; rows.ping.hidden = !settings.ping;
  }
  function reset() {
    start = undefined; frames = 0; pending = undefined; nextPing = 0;
    write('fps', '—'); write('ping', '—');
  }
  visibility();
  return {
    reset,
    frame(now: number, visible: boolean, online: boolean) {
      if (active !== visible) { active = visible; reset(); visibility(); }
      if (!active || !settings.fps && !settings.ping) return;
      if (settings.fps) {
        if (start === undefined) { start = now; frames = 0; }
        else {
          frames++;
          if (now - start >= 1000) { write('fps', String(Math.round(frames * 1000 / (now - start)))); start = now; frames = 0; }
        }
      }
      if (!settings.ping) return;
      if (!online) { pending = undefined; nextPing = 0; write('ping', 'Offline'); return; }
      if (pending && now - pending.sent >= 5000) { pending = undefined; nextPing = now + 3000; write('ping', '—'); }
      if (!pending && now >= nextPing) {
        if (displayed.ping === 'Offline') write('ping', '—');
        // The animation timestamp can precede this callback; measure from dispatch.
        pending = { id: ++sequence, sent: performance.now() }; nextPing = now + 3000;
        sendPing(pending.id);
      }
    },
    pong(id: number, now: number) {
      if (!pending || id !== pending.id || now < pending.sent || now - pending.sent >= 5000) return;
      write('ping', `${Math.round(now - pending.sent)} ms`); pending = undefined;
    },
    renderSettings() {
      return `<section class="performance-settings" aria-labelledby="performance-heading"><h3 id="performance-heading">Performance indicators</h3>${(['fps', 'ping'] as const).map(key => `<label class="settings-row graphics-row" for="show-${key}"><span>Show ${key === 'fps' ? 'FPS' : 'ping'}<small id="show-${key}-hint">${key === 'fps' ? 'Frames per second while playing.' : 'Game-server round-trip time in milliseconds.'}</small></span><input id="show-${key}" data-performance-key="${key}" type="checkbox" aria-describedby="show-${key}-hint"${settings[key] ? ' checked' : ''}></label>`).join('')}<p id="performance-status" role="status">Choices are saved on this device.</p></section>`;
    },
    mountSettings(panel: HTMLElement) {
      for (const input of panel.querySelectorAll<HTMLInputElement>('[data-performance-key]')) input.addEventListener('change', () => {
        const key = input.dataset.performanceKey as Metric;
        settings[key] = input.checked;
        if (key === 'fps') { start = undefined; frames = 0; write('fps', '—'); }
        else { pending = undefined; nextPing = 0; write('ping', '—'); }
        visibility();
        const status = panel.querySelector<HTMLElement>('#performance-status')!;
        try { localStorage.setItem(storageKey, JSON.stringify(settings)); status.textContent = 'Performance indicators saved on this device.'; }
        catch { status.textContent = 'Applied for this session. Browser storage is unavailable.'; }
      });
    },
  };
}
