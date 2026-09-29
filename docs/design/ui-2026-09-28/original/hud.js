// Mossvale HUD (modern): player frame, adventure contract card, action bar, menu dock. No dependencies; include hud.css once.
//
//   const frame = createPlayerFrame(container, { name, cls, title, level, hp, maxHp, portrait, res, maxRes, resName });
//   frame.update({ hp: 900 });      // damage: bar drops, a pale trail follows 0.35 s later, the frame shakes
//   frame.update({ hp: 1238 });     // heal: the bar grows with a short glow
//   Below 25 % HP the bar turns red and the frame pulses; hp <= 0 greys the portrait.
//
//   const card = createContractCard(container, { kind, title, desc, done, goal, xp, gold });
//   card.update({ done: 3 });       // progress; done >= goal shows "Ready" in gold

const fmt = (n) => Math.round(n).toLocaleString("en-US");

export function createPlayerFrame(container, init) {
  const el = document.createElement("div");
  el.className = "pf";
  el.innerHTML = `
    <div class="pf-avatar"><div class="pf-avatar-in"><img alt=""></div><span class="pf-level"></span></div>
    <div class="pf-body">
      <div class="pf-head"><span class="pf-name"></span><span class="pf-class"></span></div>
      <div class="pf-title"></div>
      <div class="pf-hp-row"><span class="pf-hp-val"></span><span class="pf-hp-pct"></span></div>
      <div class="pf-bar pf-hp" role="meter" aria-label="Health" aria-valuemin="0"><div class="pf-trail"></div><div class="pf-fill"></div></div>
      <div class="pf-bar pf-res" role="meter" aria-valuemin="0" hidden><div class="pf-fill"></div></div>
    </div>`;
  container.append(el);
  const q = (s) => el.querySelector(s);
  const state = { name: "", cls: "ranger", title: "", level: 1, hp: 1, maxHp: 1, portrait: "", res: null, maxRes: 100, resName: "" };
  let flashTimer = 0;

  function flash(cls, ms) {
    el.classList.remove("is-hit", "is-heal");
    void el.offsetWidth;                                   // restart the animation
    el.classList.add(cls);
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => el.classList.remove(cls), ms);
  }

  function update(patch) {
    const prevHp = state.hp;
    Object.assign(state, patch);
    const s = state;
    s.hp = Math.max(0, Math.min(s.hp, s.maxHp));
    el.dataset.class = s.cls;
    q(".pf-name").textContent = s.name;
    q(".pf-class").textContent = s.cls;
    q(".pf-title").textContent = s.title || "";
    q(".pf-level").textContent = s.level;
    const img = q(".pf-avatar img");
    if (s.portrait && img.getAttribute("src") !== s.portrait) img.src = s.portrait;
    const r = s.maxHp > 0 ? s.hp / s.maxHp : 0;
    const fill = q(".pf-hp .pf-fill"), trail = q(".pf-hp .pf-trail");
    fill.style.transform = `scaleX(${r})`;
    if (s.hp < prevHp) {                                   // damage: the trail waits, then catches up
      trail.style.transition = "";
      trail.style.transform = `scaleX(${r})`;
      if ("hp" in patch) flash("is-hit", 300);
    } else {                                               // heal / set: the trail jumps with the bar
      trail.style.transition = "none";
      trail.style.transform = `scaleX(${r})`;
      if ("hp" in patch && s.hp > prevHp) flash("is-heal", 350);
    }
    q(".pf-hp-val").innerHTML = s.hp <= 0 ? "<b>Defeated</b>" : `<b>${fmt(s.hp)}</b> / ${fmt(s.maxHp)} HP`;
    q(".pf-hp-pct").textContent = `${Math.round(r * 100)}%`;
    const hpBar = q(".pf-hp");
    hpBar.setAttribute("aria-valuemax", s.maxHp);
    hpBar.setAttribute("aria-valuenow", Math.round(s.hp));
    el.classList.toggle("is-low", r > 0 && r < 0.25);
    el.classList.toggle("is-dead", s.hp <= 0);
    const res = q(".pf-res");
    res.hidden = s.res == null;
    if (s.res != null) {
      res.querySelector(".pf-fill").style.transform = `scaleX(${Math.max(0, Math.min(1, s.res / s.maxRes))})`;
      res.setAttribute("aria-label", s.resName || "Resource");
      res.setAttribute("aria-valuemax", s.maxRes);
      res.setAttribute("aria-valuenow", Math.round(s.res));
      res.title = `${s.resName} ${fmt(s.res)} / ${fmt(s.maxRes)}`;
    }
    return api;
  }

  const api = { el, update, get state() { return { ...state }; }, destroy: () => el.remove() };
  update(init || {});
  return api;
}

const LEAF = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14Z" fill="#45e08e"/><path d="M5 19 13 11" stroke="#0e1a13" stroke-width="1.8" stroke-linecap="round"/></svg>`;

export function createContractCard(container, init) {
  const el = document.createElement("div");
  el.className = "qc";
  el.innerHTML = `
    <div class="qc-head"><span class="qc-icon">${LEAF}</span><span class="qc-kind"></span><span class="qc-state"></span></div>
    <div class="qc-title"></div>
    <div class="qc-desc"></div>
    <div class="qc-progress"><div class="qc-bar" role="meter" aria-label="Progress" aria-valuemin="0"><div class="qc-fill"></div></div><span class="qc-count"></span></div>
    <div class="qc-rewards"><span class="qc-chip xp"></span><span class="qc-chip gold"></span></div>`;
  container.append(el);
  const q = (s) => el.querySelector(s);
  const state = { kind: "Adventure contract", title: "", desc: "", done: 0, goal: 1, xp: 0, gold: 0 };

  function update(patch) {
    Object.assign(state, patch);
    const s = state, done = Math.min(s.done, s.goal), complete = done >= s.goal;
    q(".qc-kind").textContent = s.kind;
    q(".qc-title").textContent = s.title;
    q(".qc-desc").textContent = s.desc;
    q(".qc-state").textContent = complete ? "Ready" : "";
    q(".qc-fill").style.transform = `scaleX(${s.goal > 0 ? done / s.goal : 0})`;
    q(".qc-count").textContent = `${done} / ${s.goal}`;
    const bar = q(".qc-bar");
    bar.setAttribute("aria-valuemax", s.goal);
    bar.setAttribute("aria-valuenow", done);
    q(".qc-chip.xp").textContent = `${fmt(s.xp)} XP`;
    q(".qc-chip.gold").textContent = `${fmt(s.gold)} gold`;
    el.classList.toggle("is-done", complete);
    return api;
  }

  const api = { el, update, get state() { return { ...state }; }, destroy: () => el.remove() };
  update(init || {});
  return api;
}

// ------------------------------------------------------------------ action bar
//   const bar = createActionBar(container, { level: 60, xp: 1, xpMax: 1, xpLabel: "MAX", job: 17, jobXp: 548, jobXpMax: 1000,
//                                            sets: [[{ icon, name, cooldown }, ... 10 slots, null = empty], [...]], set: 0,
//                                            onUse: (slot, skill) => {}, onSet: (set) => {} });
//   bar.use(0)        // slot 0 (key 1): starts its cooldown, returns false while it is still cooling down or empty
//   bar.setSet(1)     // switch to skill set 2
//   bar.update({ xp, jobXp, level, job })
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

export function createActionBar(container, init) {
  const el = document.createElement("div");
  el.className = "ab";
  el.innerHTML = `
    <div class="ab-meters">
      <div class="ab-meter xp"><span class="lab"></span><div class="track" role="meter" aria-label="Experience"><div class="fill"></div></div><span class="val"></span></div>
      <div class="ab-meter job"><span class="lab"></span><div class="track" role="meter" aria-label="Job experience"><div class="fill"></div></div><span class="val"></span></div>
    </div>
    <div class="ab-row"><div class="ab-slots" style="display:contents"></div>
      <div class="ab-sets" role="group" aria-label="Skill set"><button type="button" data-set="0">1</button><button type="button" data-set="1">2</button></div>
    </div>`;
  container.append(el);
  const q = (s) => el.querySelector(s);
  const state = { level: 1, xp: 0, xpMax: 1, xpLabel: "", job: 1, jobXp: 0, jobXpMax: 1, sets: [[], []], set: 0, onUse: null, onSet: null };
  const cds = new Map();                                  // "set:slot" -> { start, dur }
  let raf = 0;

  function meter(cls, label, v, max, text) {
    const m = q(`.ab-meter.${cls}`), r = max > 0 ? Math.max(0, Math.min(1, v / max)) : 0;
    m.querySelector(".lab").textContent = label;
    m.querySelector(".fill").style.transform = `scaleX(${r})`;
    m.querySelector(".val").textContent = text ?? `${(r * 100).toFixed(1)}%`;
    const t = m.querySelector(".track");
    t.setAttribute("aria-valuemin", 0); t.setAttribute("aria-valuemax", max); t.setAttribute("aria-valuenow", v);
  }

  function renderSlots() {
    const box = q(".ab-slots");
    box.innerHTML = "";
    const set = state.sets[state.set] || [];
    for (let i = 0; i < 10; i++) {
      const sk = set[i];
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ab-slot" + (sk ? "" : " is-empty");
      b.dataset.slot = i;
      b.innerHTML = `<span class="ab-key">${KEYS[i]}</span>${sk ? `<img alt="" src="${sk.icon}">` : ""}<span class="ab-cd" hidden></span>`;
      b.setAttribute("aria-label", sk ? `${sk.name} (${KEYS[i]})` : `Empty slot ${KEYS[i]}`);
      if (sk) b.title = `${sk.name} · ${KEYS[i]}${sk.cooldown ? ` · ${sk.cooldown} s` : ""}`;
      b.addEventListener("click", () => use(i));
      box.append(b);
    }
    el.querySelectorAll(".ab-sets button").forEach((x) => x.setAttribute("aria-pressed", String(+x.dataset.set === state.set)));
    tick();
  }

  function tick() {
    const now = performance.now();
    let active = false;
    el.querySelectorAll(".ab-slot").forEach((b) => {
      const c = cds.get(`${state.set}:${b.dataset.slot}`), cd = b.querySelector(".ab-cd");
      if (!c) { cd.hidden = true; return; }
      const left = c.dur - (now - c.start) / 1000;
      if (left <= 0) {
        cds.delete(`${state.set}:${b.dataset.slot}`); cd.hidden = true;
        b.classList.remove("is-ready"); void b.offsetWidth; b.classList.add("is-ready");
        return;
      }
      active = true;
      cd.hidden = false;
      cd.style.setProperty("--p", (left / c.dur).toFixed(4));
      cd.textContent = left >= 1 ? Math.ceil(left) : left.toFixed(1);
    });
    cancelAnimationFrame(raf);
    if (active || cds.size) raf = requestAnimationFrame(tick);
  }

  function use(i) {
    const sk = (state.sets[state.set] || [])[i], key = `${state.set}:${i}`;
    if (!sk || cds.has(key)) return false;
    const b = el.querySelector(`.ab-slot[data-slot="${i}"]`);
    b.classList.add("is-press"); setTimeout(() => b.classList.remove("is-press"), 110);
    if (sk.cooldown) cds.set(key, { start: performance.now(), dur: sk.cooldown });
    state.onUse && state.onUse(i, sk);
    tick();
    return true;
  }

  function setSet(i) {
    if (i === state.set || !state.sets[i]) return;
    state.set = i;
    renderSlots();
    state.onSet && state.onSet(i);
  }
  el.querySelectorAll(".ab-sets button").forEach((b) => b.addEventListener("click", () => setSet(+b.dataset.set)));

  function update(patch) {
    const reslot = "sets" in patch;
    Object.assign(state, patch);
    const s = state;
    meter("xp", `Lv ${s.level}`, s.xp, s.xpMax, s.xpLabel || undefined);
    meter("job", `Job ${s.job}`, s.jobXp, s.jobXpMax);
    if (reslot || !el.querySelector(".ab-slot") || "set" in patch) renderSlots();
    return api;
  }

  // remaining cooldown of a slot: { left: seconds, frac: 0..1 } or null (used by the mobile skill pad)
  const cooldownOf = (set, i) => { const c = cds.get(`${set}:${i}`); if (!c) return null; const left = c.dur - (performance.now() - c.start) / 1000; return left > 0 ? { left, frac: left / c.dur } : null; };
  const useIn = (set, i) => { if (set !== state.set) setSet(set); return use(i); };
  const api = { el, update, use, useIn, setSet, cooldownOf, get state() { return { ...state }; }, destroy: () => { cancelAnimationFrame(raf); el.remove(); } };
  update(init || {});
  return api;
}

// ------------------------------------------------------------------ menu dock
//   const dock = createMenuDock(container, { items: [{ id, label, key, icon, badge }], profile: iconUrl, collapsed: false, onSelect: (id) => {} });
//   dock.update({ items }), dock.toggle()
const CHEVRON = `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 10l4-4 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function createMenuDock(container, init) {
  const el = document.createElement("div");
  el.className = "mg";
  el.innerHTML = `<div class="mg-side"><button type="button" class="mg-toggle" aria-label="Hide menu">${CHEVRON}</button><button type="button" class="mg-profile" aria-label="Profile"><img alt=""><span class="mg-tip">Profile</span></button></div><div class="mg-grid"></div>`;
  container.append(el);
  const q = (s) => el.querySelector(s);
  const state = { items: [], profile: "", collapsed: false, onSelect: null };

  function update(patch) {
    Object.assign(state, patch);
    const g = q(".mg-grid");
    g.innerHTML = "";
    for (const it of state.items) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mg-tile";
      b.setAttribute("aria-label", it.key ? `${it.label} (${it.key})` : it.label);
      b.innerHTML = `<img alt="" src="${it.icon}">${it.key ? `<span class="mg-key">${it.key}</span>` : ""}${it.badge ? `<span class="mg-dot"></span>` : ""}<span class="mg-tip">${it.label}${it.key ? `<kbd>${it.key}</kbd>` : ""}</span>`;
      b.addEventListener("click", () => state.onSelect && state.onSelect(it.id));
      g.append(b);
    }
    g.style.setProperty("--cols", Math.max(4, Math.ceil(state.items.length / 2)));   // always 2 rows
    q(".mg-profile img").src = state.profile || "";
    el.classList.toggle("is-collapsed", !!state.collapsed);
    q(".mg-toggle").setAttribute("aria-label", state.collapsed ? "Show menu" : "Hide menu");
    q(".mg-toggle").setAttribute("aria-expanded", String(!state.collapsed));
    return api;
  }
  const toggle = () => update({ collapsed: !state.collapsed });
  q(".mg-toggle").addEventListener("click", toggle);
  q(".mg-profile").addEventListener("click", () => state.onSelect && state.onSelect("profile"));

  const api = { el, update, toggle, get state() { return { ...state }; }, destroy: () => el.remove() };
  update(init || {});
  return api;
}

// ------------------------------------------------------------------ chat
//   const chat = createChatBox(container, { messages: [{ ch: "system", text }, { ch: "party", name, text }], onSend: (ch, text) => {} });
//   chat.add({ ch: "world", name: "Benjooie", text: "hi" }), chat.update({ active: "party" })
//   Channels: world, system, party, whisper, guild (colours are CSS vars --c-<channel> on .ch).
const CH = { world: "World", system: "System", party: "Party", whisper: "Whisper", guild: "Guild" };
const DOWN = `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SEND = `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function createChatBox(container, init) {
  const el = document.createElement("div");
  el.className = "ch";
  el.innerHTML = `<div class="ch-tabs" role="tablist" aria-label="Chat channels"></div>
    <div class="ch-log" role="log" aria-live="polite"></div>
    <form class="ch-input"><span class="ch-to"></span><input type="text" maxlength="200" aria-label="Chat message"><button type="submit" class="ch-send" aria-label="Send">${SEND}</button></form>`;
  container.append(el);
  const q = (s) => el.querySelector(s);
  const state = { tabs: ["all", "world", "system", "whisper", "party"], active: "all", messages: [], unread: {}, collapsed: false,
    placeholder: "Say hello, or /emotes for commands", time: false, max: 100, onSend: null };
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const col = (ch) => `var(--c-${ch}, var(--ink-2))`;

  function line(m) {
    const d = document.createElement("div");
    d.className = `ch-msg ${m.ch}`;
    d.style.setProperty("--c", col(m.ch));
    const tag = m.ch === "whisper" && m.to ? `[To ${esc(m.to)}]` : `[${CH[m.ch] || esc(m.ch)}]`;
    d.innerHTML = `${state.time && m.t ? `<span class="t">${esc(m.t)}</span>` : ""}<span class="ch-tag">${tag}</span>${m.name ? `<span class="who">${esc(m.name)}:</span> ` : ""}<span class="txt">${esc(m.text)}</span>`;
    return d;
  }
  const shows = (m) => state.active === "all" || m.ch === state.active;

  function renderTabs() {
    const box = q(".ch-tabs");
    box.innerHTML = "";
    for (const t of state.tabs) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "ch-tab"; b.dataset.ch = t; b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(t === state.active));
      b.style.setProperty("--c", col(t));
      const n = state.unread[t] || 0;
      b.innerHTML = `${t === "all" ? "All" : CH[t] || t}${n ? `<span class="n">${n > 99 ? "99+" : n}</span>` : ""}`;
      b.addEventListener("click", () => update({ active: t }));
      box.append(b);
    }
    const h = document.createElement("button");
    h.type = "button"; h.className = "ch-hide"; h.innerHTML = DOWN;
    h.setAttribute("aria-label", state.collapsed ? "Show chat" : "Hide chat");
    h.setAttribute("aria-expanded", String(!state.collapsed));
    h.addEventListener("click", () => update({ collapsed: !state.collapsed }));
    box.append(h);
    const to = state.active === "all" || state.active === "system" ? "world" : state.active;
    q(".ch-to").textContent = `[${CH[to] || to}]`;
    q(".ch-to").style.setProperty("--c", col(to));
  }

  function renderLog() {
    const log = q(".ch-log");
    log.innerHTML = "";
    state.messages.filter(shows).forEach((m) => log.append(line(m)));
    log.scrollTop = log.scrollHeight;
  }

  function add(m) {
    state.messages.push(m);
    if (state.messages.length > state.max) state.messages.shift();
    if (shows(m) && !state.collapsed) {
      const log = q(".ch-log"), stick = log.scrollHeight - log.scrollTop - log.clientHeight < 24;
      log.append(line(m));
      while (log.children.length > state.max) log.firstChild.remove();
      if (stick) log.scrollTop = log.scrollHeight;
    } else if (m.ch !== "system") {
      state.unread[m.ch] = (state.unread[m.ch] || 0) + 1; renderTabs();
    }
    return api;
  }

  function update(patch) {
    if ("active" in patch) state.unread = { ...state.unread, [patch.active]: 0 };
    Object.assign(state, patch);
    q(".ch-input input").placeholder = state.placeholder;
    el.classList.toggle("is-collapsed", !!state.collapsed);
    renderTabs();
    renderLog();
    return api;
  }

  q(".ch-input").addEventListener("submit", (e) => {
    e.preventDefault();
    const inp = q(".ch-input input"), text = inp.value.trim();
    if (!text) return;
    const ch = state.active === "all" || state.active === "system" ? "world" : state.active;
    inp.value = "";
    state.onSend && state.onSend(ch, text);
  });
  const focus = () => q(".ch-input input").focus();

  const api = { el, update, add, focus, get state() { return { ...state, messages: [...state.messages] }; }, destroy: () => el.remove() };
  update(init || {});
  return api;
}

// ------------------------------------------------------------------ minimap (top right)
//   const mm = createMinimap(container, { zone: "Greenwood", levels: "1–6", time: "18:21", phase: "Dusk",
//     map: imageUrl | HTMLCanvasElement, mapSize: [w, h], player: { x, y, dir }, heading: 0, rotate: false, zoom: 1,
//     markers: [{ x, y, type: "quest" | "party" | "poi", label }], onOpenMap, onMarker(marker) });
//   mm.update({ player, heading, time, phase, markers, zone, levels }) every frame or tick.
//   Map units are pixels of the map image. heading = camera yaw in degrees (0 = north up). With rotate: true the map turns
//   with the camera and N moves around the ring; otherwise the map stays north-up and the player arrow turns.
const PHASE = {
  Dawn: ["#ffa3c4", "sun"], Day: ["#f3c252", "sun"], Dusk: ["#ff9a4a", "sun"], Night: ["#9fc7ff", "moon"],
};
const SUN = `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="8" r="3.4"/><g stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3"/></g></svg>`;
const MOON = `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M10.5 2.2A6 6 0 1 0 13.8 11 5 5 0 0 1 10.5 2.2z"/></svg>`;
const ARROW = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.5l6.5 15-6.5-3.6-6.5 3.6z" fill="#45e08e" stroke="#062414" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
export function createMinimap(container, init) {
  const el = document.createElement("div");
  el.className = "mm";
  el.innerHTML = `<div class="mm-zone"><span></span><i></i></div>
    <div class="mm-disc" tabindex="0" role="button" aria-label="Open map (M)"><div class="mm-world"></div><div class="mm-pins"></div><div class="mm-me">${ARROW}</div>
      <div class="mm-ring">${["N", "E", "S", "W"].map((c) => `<b class="${c === "N" ? "n" : ""}" data-c="${c}">${c}</b>`).join("")}</div></div>
    <div class="mm-zoom"><button type="button" class="in" aria-label="Zoom in">+</button><button type="button" class="out" aria-label="Zoom out">−</button></div>
    <div class="mm-foot"><span class="mm-time"></span><span class="sp"></span><button type="button" class="key" aria-label="Open map">M</button></div>`;
  container.append(el);
  const q = (s) => el.querySelector(s);
  const state = { zone: "", levels: "", time: "", phase: "Day", map: null, mapSize: [512, 512], player: { x: 0, y: 0, dir: 0 }, heading: 0, rotate: false, zoom: 1,
    minZoom: .5, maxZoom: 3, markers: [], playerLevel: null, onOpenMap: null, onMarker: null };
  let mapSrc = null;
  function setMap() {
    const w = q(".mm-world"); w.innerHTML = "";
    if (!state.map) return;
    if (typeof state.map === "string") { const i = document.createElement("img"); i.alt = ""; i.src = state.map; w.append(i); } else w.append(state.map);
    mapSrc = state.map;
  }
  function draw() {
    const disc = q(".mm-disc"), D = disc.clientWidth || 172, R = D / 2, z = state.zoom, p = state.player;
    const rot = state.rotate ? -state.heading : 0, rad = (rot * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    const world = q(".mm-world");
    world.style.width = state.mapSize[0] + "px"; world.style.height = state.mapSize[1] + "px";
    // map point (x, y) -> disc: centre + R( rotate( (x - p) * z ) )
    world.style.transform = `translate(${R}px, ${R}px) rotate(${rot}deg) scale(${z}) translate(${-p.x}px, ${-p.y}px)`;
    const toDisc = (x, y) => { const dx = (x - p.x) * z, dy = (y - p.y) * z; return [R + dx * cos - dy * sin, R + dx * sin + dy * cos]; };
    q(".mm-me").style.transform = `rotate(${(state.rotate ? p.dir - state.heading : p.dir)}deg)`;
    q(".mm-ring").querySelectorAll("b").forEach((b) => {
      const a = ({ N: 0, E: 90, S: 180, W: 270 }[b.dataset.c] + rot) * Math.PI / 180, r = R - 9;
      b.style.transform = `translate(calc(-50% + ${Math.sin(a) * r}px), calc(-50% + ${-Math.cos(a) * r}px))`;
    });
    const pins = q(".mm-pins"); pins.innerHTML = "";
    for (const m of state.markers) {
      let [x, y] = toDisc(m.x, m.y);
      const dx = x - R, dy = y - R, dist = Math.hypot(dx, dy), lim = R - 12;
      const edge = dist > lim && m.type !== "poi";
      if (dist > lim && m.type === "poi") continue;
      if (edge) { x = R + (dx / dist) * lim; y = R + (dy / dist) * lim; }
      const b = document.createElement("span");
      b.className = `mm-pin ${m.type}${edge ? " edge" : ""}`;
      b.style.left = x + "px"; b.style.top = y + "px";
      if (edge) b.style.transform = `translate(-50%, -50%) rotate(${Math.atan2(dy, dx) * 180 / Math.PI + 90}deg)`;
      if (m.type === "quest" && !edge) b.textContent = "!";
      b.title = m.label || "";
      pins.append(b);
    }
  }
  function update(patch) {
    Object.assign(state, patch);
    if (state.map !== mapSrc) setMap();
    const [c, icon] = PHASE[state.phase] || PHASE.Day;
    q(".mm-zone span").textContent = state.zone;
    const lv = q(".mm-zone i"); lv.textContent = state.levels ? `Lv ${state.levels}` : ""; lv.hidden = !state.levels;
    if (state.playerLevel != null && state.levels) { const [a, b] = state.levels.split(/[–-]/).map(Number); lv.className = state.playerLevel < a ? "red" : state.playerLevel > b + 5 ? "" : "hi"; }
    const t = q(".mm-time"); t.style.setProperty("--pc", c); t.innerHTML = `${icon === "sun" ? SUN : MOON}${state.time} · ${state.phase}`;
    q(".mm-zoom .out").disabled = state.zoom <= state.minZoom; q(".mm-zoom .in").disabled = state.zoom >= state.maxZoom;
    draw();
    return api;
  }
  const zoomBy = (f) => update({ zoom: Math.max(state.minZoom, Math.min(state.maxZoom, +(state.zoom * f).toFixed(3))) });
  q(".mm-zoom .in").addEventListener("click", () => zoomBy(1.25));
  q(".mm-zoom .out").addEventListener("click", () => zoomBy(0.8));
  q(".mm-disc").addEventListener("wheel", (e) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.12 : 0.9); }, { passive: false });
  const open = () => state.onOpenMap && state.onOpenMap();
  q(".mm-foot .key").addEventListener("click", open);
  q(".mm-disc").addEventListener("click", open);
  q(".mm-disc").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  new ResizeObserver(draw).observe(q(".mm-disc"));
  const api = { el, update, get state() { return { ...state }; }, destroy: () => el.remove() };
  update(init || {});
  return api;
}

// ------------------------------------------------------------------ target frame (who you clicked: enemy, boss, NPC or player)
//   const t = createTargetFrame(container, { kind: "enemy" | "boss" | "npc" | "player", name, level, title, cls, hp, maxHp,
//     portrait, rank: "elite" | "rare" | "boss", playerLevel, cast: { name, progress 0..1 } | null, phases: [0.7, 0.35],
//     onAction(id), onClose() });
//   t.update({ hp }); t.update({ cast: { name: "Verdict of Bones", progress: .4 } }); t.hide(); t.show({...new target});
//   Players get Whisper / Invite / Trade / Inspect, NPCs get Talk. Level colour: grey (too low) → green → gold → orange → red (too high).
const TGT_ICONS = {
  whisper: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 3h10v7H7l-3 3v-3H3z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  invite: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="6" cy="5.5" r="2.3" stroke="currentColor" stroke-width="1.5"/><path d="M2 13c.5-2.3 2-3.5 4-3.5s3.5 1.2 4 3.5M12 5v4M10 7h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  trade: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 5h9l-2.5-2.5M13 11H4l2.5 2.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  inspect: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="4" stroke="currentColor" stroke-width="1.6"/><path d="M10 10l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  talk: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 4.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7l-3 2.5V10.5h0a2 2 0 0 1-1.5-2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  close: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  skull: `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.5C4.7 1.5 2.5 3.8 2.5 6.8c0 1.8.8 3 2 3.8V13h2v-1.5h3V13h2v-2.4c1.2-.8 2-2 2-3.8 0-3-2.2-5.3-5.5-5.3zM5.8 8.8a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6zm4.4 0a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6z"/></svg>`,
};
const KIND_LABEL = { enemy: "Enemy", boss: "Boss", npc: "NPC", player: "Player" };
const ACTIONS = { player: [["whisper", "Whisper"], ["invite", "Invite to party"], ["trade", "Trade"], ["inspect", "Inspect"]], npc: [["talk", "Talk"]] };

export function createTargetFrame(container, init) {
  const el = document.createElement("div");
  el.className = "tf";
  el.setAttribute("role", "group");
  el.innerHTML = `
    <div class="tf-avatar"><img alt=""><span class="tf-glyph">${TGT_ICONS.skull}</span><span class="tf-level"></span></div>
    <div class="tf-body">
      <div class="tf-head"><span class="tf-name"></span><button type="button" class="tf-close" aria-label="Clear target">${TGT_ICONS.close}</button></div>
      <div class="tf-sub"><span class="tf-kind"></span><span class="tf-title"></span></div>
      <div class="tf-bar" role="meter" aria-label="Target health" aria-valuemin="0"><div class="pf-trail"></div><div class="pf-fill"></div><i class="tf-ph"></i><span class="tf-hp"></span></div>
      <div class="tf-cast" hidden><div class="tf-cast-fill"></div><span></span></div>
      <div class="tf-acts"></div>
    </div>`;
  container.append(el);
  const q = (s) => el.querySelector(s);
  const state = { kind: "enemy", name: "", level: 1, title: "", cls: "", hp: 1, maxHp: 1, portrait: "", rank: "", playerLevel: null, cast: null, phases: null,
    onAction: null, onClose: null, visible: true };
  q(".tf-close").addEventListener("click", () => { state.onClose ? state.onClose() : hide(); });
  function lvlColor(l, p) {
    if (p == null) return "";
    const d = l - p;
    return d <= -10 ? "grey" : d <= -3 ? "green" : d <= 2 ? "gold" : d <= 5 ? "orange" : "red";
  }
  function update(patch) {
    const prevHp = state.hp, prevName = state.name;
    Object.assign(state, patch);
    const s = state, friendly = s.kind === "npc" || s.kind === "player";
    s.hp = Math.max(0, Math.min(s.hp, s.maxHp));
    el.dataset.kind = s.kind;
    el.dataset.rank = s.rank || (s.kind === "boss" ? "boss" : "");
    if (s.cls) el.dataset.class = s.cls; else delete el.dataset.class;
    q(".tf-name").textContent = s.name;
    q(".tf-kind").textContent = s.rank ? s.rank[0].toUpperCase() + s.rank.slice(1) : (s.kind === "player" && s.cls ? s.cls : KIND_LABEL[s.kind]);
    q(".tf-title").textContent = s.title ? (s.kind === "player" ? `<${s.title}>` : s.title) : "";
    const lv = q(".tf-level");
    lv.textContent = s.level == null || s.level === "" ? "??" : s.level;
    lv.dataset.c = s.kind === "enemy" || s.kind === "boss" ? lvlColor(s.level, s.playerLevel) : "";
    const img = q(".tf-avatar img");
    img.hidden = !s.portrait; if (s.portrait && img.getAttribute("src") !== s.portrait) img.src = s.portrait;
    q(".tf-glyph").hidden = !!s.portrait;
    const noHp = s.kind === "npc" && !s.maxHp;
    q(".tf-bar").hidden = noHp;
    const r = s.maxHp > 0 ? s.hp / s.maxHp : 0, fill = q(".tf-bar .pf-fill"), trail = q(".tf-bar .pf-trail");
    const retarget = prevName !== s.name;
    fill.style.transform = `scaleX(${r})`;
    trail.style.transition = s.hp < prevHp && !retarget ? "" : "none";
    trail.style.transform = `scaleX(${r})`;
    if (s.hp < prevHp && !retarget && "hp" in patch) { el.classList.remove("is-hit"); void el.offsetWidth; el.classList.add("is-hit"); }
    q(".tf-hp").textContent = s.hp <= 0 ? "Defeated" : `${fmt(s.hp)} / ${fmt(s.maxHp)}  ·  ${r >= .995 ? 100 : (r * 100).toFixed(r < .1 ? 1 : 0)}%`;
    q(".tf-bar").setAttribute("aria-valuemax", s.maxHp); q(".tf-bar").setAttribute("aria-valuenow", Math.round(s.hp));
    q(".tf-ph").innerHTML = "";
    (s.phases || (s.kind === "boss" ? [] : [])).forEach((p) => { const m = document.createElement("b"); m.style.left = `${p * 100}%`; q(".tf-ph").append(m); });
    el.classList.toggle("is-dead", s.hp <= 0 && !noHp);
    el.classList.toggle("is-low", !friendly && r > 0 && r < .2);
    const c = q(".tf-cast");
    c.hidden = !s.cast;
    if (s.cast) { q(".tf-cast-fill").style.transform = `scaleX(${Math.max(0, Math.min(1, s.cast.progress))})`; q(".tf-cast span").textContent = s.cast.name; c.classList.toggle("danger", !!s.cast.danger); }
    const acts = ACTIONS[s.kind] || [];
    if (retarget || "kind" in patch) {
      q(".tf-acts").innerHTML = acts.map(([id, label]) => `<button type="button" data-a="${id}" aria-label="${label}" title="${label}">${TGT_ICONS[id]}${id === "talk" ? "<span>Talk</span>" : ""}</button>`).join("");
      q(".tf-acts").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => state.onAction && state.onAction(b.dataset.a, { ...state })));
      el.classList.remove("in"); void el.offsetWidth; el.classList.add("in");
    }
    q(".tf-acts").hidden = !acts.length;
    return api;
  }
  function show(p) { state.visible = true; el.hidden = false; if (p) update(p); api.onShow && api.onShow(); return api; }
  function hide() { state.visible = false; el.hidden = true; api.onHide && api.onHide(); return api; }
  const api = { el, update, show, hide, get visible() { return state.visible; }, get state() { return { ...state }; }, destroy: () => el.remove() };
  update(init || {});
  if (init && init.hidden) hide();
  return api;
}
