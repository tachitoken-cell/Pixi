export type GraphicsSettings = {
  resolution: .5 | .75 | 1;
  renderDistance: 120 | 240 | 420;
  shadows: 'off' | 'low' | 'high';
  textures: 'low' | 'medium' | 'high';
  effects: 'off' | 'low' | 'high';
  bloom: boolean;
  reflections: boolean;
};

export const GRAPHICS_PRESETS = {
  low: { resolution: .5, renderDistance: 120, shadows: 'off', textures: 'low', effects: 'off', bloom: false, reflections: false },
  medium: { resolution: .75, renderDistance: 240, shadows: 'low', textures: 'medium', effects: 'low', bloom: true, reflections: true },
  high: { resolution: 1, renderDistance: 420, shadows: 'high', textures: 'high', effects: 'high', bloom: true, reflections: true },
} satisfies Record<string, GraphicsSettings>;

const fields = {
  resolution: { label: 'Render scale', hint: '3D resolution; menus stay sharp.', options: [[.5, '50%'], [.75, '75%'], [1, '100%']] },
  renderDistance: { label: 'Render distance', hint: 'How far the world is drawn.', options: [[120, '120 m'], [240, '240 m'], [420, '420 m']] },
  shadows: { label: 'Shadows', hint: 'Off saves work on lighting and shadows.', options: [['off', 'Off'], ['low', 'Low'], ['high', 'High']] },
  textures: { label: 'Texture quality', hint: 'Shoreline and glow detail. Voxel models stay the same.', options: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] },
  effects: { label: 'Effects', hint: 'Ambient and cosmetic combat particles. Combat cues stay visible.', options: [['off', 'Off'], ['low', 'Low'], ['high', 'High']] },
  bloom: { label: 'Bloom / glow', hint: 'Spell radiance and lantern halos.', options: [[false, 'Off'], [true, 'On']] },
  reflections: { label: 'Water reflections', hint: 'Sky and sun highlights on water.', options: [[false, 'Off'], [true, 'On']] },
} as const;
const keys = Object.keys(fields) as (keyof GraphicsSettings)[];
const storageKey = 'mossvale-graphics';
type Preset = keyof typeof GRAPHICS_PRESETS;
const presetOrder: Preset[] = ['low', 'medium', 'high'];

export function normalizeGraphicsSettings(value: unknown, fallback: GraphicsSettings = GRAPHICS_PRESETS.high): GraphicsSettings {
  const data = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const settings = { ...fallback };
  for (const key of keys) {
    if (Object.hasOwn(data, key) && fields[key].options.some(([option]) => option === data[key])) Object.assign(settings, { [key]: data[key] });
  }
  return settings;
}

function recommendedPreset(): Preset {
  const device = typeof navigator === 'undefined' ? undefined : navigator as Navigator & { deviceMemory?: number };
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
    || device?.hardwareConcurrency && device.hardwareConcurrency <= 4
    || device?.deviceMemory && device.deviceMemory <= 4 ? 'low' : 'medium';
}

let autoPreset: Preset | undefined = recommendedPreset();
let checking: 'queued' | 'testing' | undefined = 'queued', reduced = false;
function loadGraphicsSettings(): GraphicsSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (saved?.mode === 'auto' && presetOrder.includes(saved.preset)) {
      if (saved.checked === true) { autoPreset = saved.preset; checking = undefined; }
    } else if (saved && keys.every(key => Object.hasOwn(saved, key) && fields[key].options.some(([option]) => option === saved[key]))) {
      autoPreset = undefined;
      return normalizeGraphicsSettings(saved);
    }
  } catch { /* Blocked or damaged storage must not stop the game. */ }
  return { ...GRAPHICS_PRESETS[autoPreset!] };
}

export const graphics = loadGraphicsSettings();
let lastFrame: number | undefined, warmup = 2500, sampleTime = 0, sampleFrames = 0, largestFrame = 0, slowWindows = 0, stalledFrames = 0;

function resetMeasurement(milliseconds = 2500) {
  lastFrame = undefined; warmup = milliseconds; sampleTime = sampleFrames = largestFrame = slowWindows = stalledFrames = 0;
}

function saveGraphics(): boolean {
  try {
    localStorage.setItem(storageKey, JSON.stringify(autoPreset ? { mode: 'auto', preset: autoPreset, checked: !checking } : graphics));
    return true;
  } catch { return false; }
}

export function autoGraphicsStatus(): string {
  if (!autoPreset) return '';
  const name = autoPreset[0].toUpperCase() + autoPreset.slice(1);
  if (checking === 'queued') return 'Performance check queued. Close Settings and enter the world to begin.';
  if (checking === 'testing') return `Checking ${name} graphics… Keep playing for a few seconds.`;
  return reduced ? `Auto lowered graphics to ${name} to keep play smooth.` : `Performance check complete. Auto selected ${name} graphics.`;
}

/** Briefly test the real world at each quality level, independently of the FPS/ping display. */
export function updateAutoGraphics(now: number, active: boolean): boolean {
  if (!autoPreset || !active || !Number.isFinite(now)) { resetMeasurement(); return false; }
  if (lastFrame === undefined) { lastFrame = now; return false; }
  const delta = now - lastFrame;
  lastFrame = now;
  if (delta <= 0) { resetMeasurement(); lastFrame = now; return false; }
  if (delta > 1000 && !stalledFrames) {
    resetMeasurement(); lastFrame = now; stalledFrames = 1; return false;
  }
  const prolongedStall = delta > 1000;
  if (warmup > 0 && !prolongedStall) { warmup -= delta; return false; }
  if (checking === 'queued') {
    saveGraphics(); // A reload during the test must restart rather than trust an unfinished tier.
    checking = 'testing'; autoPreset = 'high';
    Object.assign(graphics, GRAPHICS_PRESETS.high);
    resetMeasurement(1000);
    return true;
  }
  sampleTime += delta; sampleFrames++; largestFrame = Math.max(largestFrame, delta);
  if (sampleFrames < 2 && !prolongedStall) return false;
  // Ignore one isolated loading/GC stall; repeated slow frames still determine the result.
  const average = prolongedStall ? Infinity : (sampleTime - largestFrame) / (sampleFrames - 1);
  const current = presetOrder.indexOf(autoPreset);
  if (checking === 'testing') {
    const struggling = prolongedStall || current > 0 && sampleTime >= 1000 && sampleFrames >= 8 && average > 50;
    if (sampleTime < 3000 && !struggling) return false;
    if (average <= 20 || current === 0) {
      checking = undefined;
      saveGraphics(); resetMeasurement(1000);
      return false;
    }
  } else {
    if (sampleTime < 2000 && !prolongedStall) return false;
    slowWindows = prolongedStall ? 2 : average > 25 ? slowWindows + 1 : 0;
    if (average <= 25) stalledFrames = 0;
    sampleTime = sampleFrames = largestFrame = 0;
    if (slowWindows < 2 || current === 0) return false;
    reduced = true;
  }
  autoPreset = presetOrder[current - 1];
  Object.assign(graphics, GRAPHICS_PRESETS[autoPreset]);
  if (!checking) saveGraphics();
  resetMeasurement(1000);
  return true;
}

function currentPreset(): string {
  return Object.entries(GRAPHICS_PRESETS).find(([, preset]) => keys.every(key => preset[key] === graphics[key]))?.[0] ?? 'custom';
}

export function renderGraphicsSettings(): string {
  const preset = autoPreset ? 'auto' : currentPreset();
  return `<section class="graphics-settings" aria-labelledby="graphics-heading">
    <div class="settings-page-heading"><h3 id="graphics-heading">Graphics</h3><button id="graphics-defaults" type="button" title="Restore recommended graphics settings for this device">Defaults</button></div>
    <label class="settings-row graphics-row" for="graphics-preset"><span>Preset<small>Auto runs a short check to find the highest quality at around 50 FPS.</small></span><select id="graphics-preset">${[['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['custom', 'Custom']].map(([value, label]) => `<option value="${value}"${preset === value ? ' selected' : ''}${value === 'custom' ? ' disabled' : ''}>${label}</option>`).join('')}</select></label>
    ${keys.map(key => {
      const field = fields[key];
      return `<label class="settings-row graphics-row" for="graphics-${key}"><span>${field.label}<small id="graphics-${key}-hint">${field.hint}</small></span><select id="graphics-${key}" data-graphics-key="${key}" aria-describedby="graphics-${key}-hint">${field.options.map(([value, label]) => `<option value="${value}"${graphics[key] === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label>`;
    }).join('')}
    <button id="graphics-check" class="primary-button" type="button">${autoPreset && !checking ? 'Check again' : 'Run performance check'}</button>
    <p id="graphics-status" role="status" aria-live="polite">${autoGraphicsStatus() || 'Changes apply immediately and are saved on this device.'}</p>
  </section>`;
}

export function mountGraphicsSettings(root: HTMLElement, onChange: () => void): void {
  const preset = root.querySelector<HTMLSelectElement>('#graphics-preset')!;
  const controls = root.querySelectorAll<HTMLSelectElement>('[data-graphics-key]');
  const status = root.querySelector<HTMLElement>('#graphics-status')!;
  const tabs = root.querySelectorAll<HTMLButtonElement>('[data-settings-tab]');
  const pages = root.querySelectorAll<HTMLElement>('[data-settings-page]');
  for (const tab of tabs) tab.addEventListener('click', () => {
    for (const page of pages) page.hidden = page.dataset.settingsPage !== tab.dataset.settingsTab;
    for (const button of tabs) {
      if (button === tab) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
  });
  const apply = () => {
    resetMeasurement();
    onChange();
    status.textContent = saveGraphics()
      ? autoGraphicsStatus() || 'Graphics settings saved on this device.'
      : `${autoGraphicsStatus()} Applied for this session. Browser storage is unavailable.`.trim();
  };
  const usePreset = (name: Preset | 'auto') => {
    autoPreset = name === 'auto' ? recommendedPreset() : undefined;
    checking = name === 'auto' ? 'queued' : undefined; reduced = false;
    Object.assign(graphics, GRAPHICS_PRESETS[autoPreset ?? name as Preset]);
    preset.value = name;
    for (const control of controls) control.value = String(graphics[control.dataset.graphicsKey as keyof GraphicsSettings]);
    apply();
  };
  root.querySelector<HTMLButtonElement>('#graphics-defaults')!.addEventListener('click', () => usePreset('auto'));
  root.querySelector<HTMLButtonElement>('#graphics-check')!.addEventListener('click', () => usePreset('auto'));
  preset.addEventListener('change', () => {
    if (preset.value === 'auto' || Object.hasOwn(GRAPHICS_PRESETS, preset.value)) usePreset(preset.value as Preset | 'auto');
  });
  for (const control of controls) control.addEventListener('change', () => {
    const key = control.dataset.graphicsKey as keyof GraphicsSettings;
    const option = fields[key].options.find(([value]) => String(value) === control.value);
    if (!option) return;
    autoPreset = undefined; checking = undefined;
    Object.assign(graphics, { [key]: option[0] });
    preset.value = 'custom';
    apply();
  });
}
