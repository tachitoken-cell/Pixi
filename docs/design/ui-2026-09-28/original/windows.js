// Mossvale windows, modern (no dependencies). Each create* function renders one window from its JSON (data/*.json).
//   const win = createCharacterWindow(container, characterJson, { icon: (name) => `/ui/icons/${name}.png`, onClose });
//   win.update(patch) · win.el · win.destroy()
// Shared option: icon(name) -> url. Default: "icons/<name>.png".

const SVG = {
  close: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  search: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.8"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  grid: `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z"/></svg>`,
  list: `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2 3h12v2H2zM2 7h12v2H2zM2 11h12v2H2z"/></svg>`,
  chev: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  left: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  right: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};
const RARITY = { common: "var(--r-common)", uncommon: "var(--r-uncommon)", rare: "var(--r-rare)", epic: "var(--r-epic)", mythic: "var(--r-mythic)" };
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmt = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 4 });
const short = (n) => (n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, "") + "k" : String(n));
const pct = (v, m) => (m > 0 ? Math.max(0, Math.min(1, v / m)) : 0);
const bar = (r, cls = "") => `<div class="mw-bar ${cls}"><i style="transform:scaleX(${r})"></i></div>`;

function shell(container, cls, opts, headHtml) {
  const el = document.createElement("section");
  el.className = `mw ${cls}`;
  el.setAttribute("role", "dialog");
  el.innerHTML = `<header class="mw-head"><div class="grow">${headHtml}</div><button type="button" class="mw-close" aria-label="Close">${SVG.close}</button></header><div class="mw-main"></div>`;
  container.append(el);
  el.querySelector(".mw-close").addEventListener("click", () => (opts.onClose ? opts.onClose() : el.remove()));
  el.addEventListener("keydown", (e) => { if (e.key === "Escape") el.querySelector(".mw-close").click(); });
  return el;
}
const iconOf = (opts) => opts.icon || ((n) => `icons/${n}.png`);

// one shared tooltip for all windows
let tipEl = null;
function tip(target, html) {
  const show = () => {
    if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "mw mw-tip"; tipEl.style.animation = "none"; document.body.append(tipEl); }
    const win = target.closest(".mw");
    tipEl.style.setProperty("--win-scale", win ? getComputedStyle(win).getPropertyValue("--win-scale") : 1);
    tipEl.innerHTML = typeof html === "function" ? html() : html;
    const r = target.getBoundingClientRect(), t = tipEl.getBoundingClientRect();
    let x = r.left + r.width / 2 - t.width / 2, y = r.top - t.height - 8;
    if (y < 6) y = r.bottom + 8;
    x = Math.max(6, Math.min(innerWidth - t.width - 6, x));
    tipEl.style.left = x + "px"; tipEl.style.top = y + "px";
    tipEl.classList.add("on");
  };
  const hide = () => tipEl && tipEl.classList.remove("on");
  target.addEventListener("mouseenter", show); target.addEventListener("focus", show);
  target.addEventListener("mouseleave", hide); target.addEventListener("blur", hide);
}
const hideTip = () => tipEl && tipEl.classList.remove("on");
function toast(el, text) {
  const t = document.createElement("div");
  t.className = "mw-toast"; t.textContent = text;
  el.append(t); setTimeout(() => t.remove(), 1900);
}

// ------------------------------------------------------------------ character & bags
//   data: character.json · opts: { icon, onClose, onUse(item), onGear(slot) }
const GEAR_L = ["head", "necklace", "body", "back"], GEAR_R = ["legs", "shoes", "ring1", "ring2"];
const GEAR_NAME = { head: "Head", necklace: "Necklace", body: "Body", back: "Back", legs: "Legs", shoes: "Shoes", ring1: "Ring 1", ring2: "Ring 2", weapon: "Weapon" };
const FILTERS = [["all", "All"], ["material", "Materials"], ["consumable", "Consumables"], ["gear", "Gear"], ["quest", "Quest"]];

export function createCharacterWindow(container, data, opts = {}) {
  const icon = iconOf(opts);
  const d = structuredClone(data);
  const ui = { bag: "all", filter: "all", q: "", view: "grid" };
  const el = shell(container, "inv", opts, `
    <div class="inv-id"><div class="cls"><img alt="" src="${icon("class-" + d.cls)}"></div><div>
      <div class="mw-title" style="margin:0">${esc(d.name)}</div>
      <div class="lv"><span class="mw-pill">Lv ${d.level} ${esc(d.className)}</span><span class="mw-muted">&lt;${esc(d.title)}&gt;</span></div></div></div>`);
  const main = el.querySelector(".mw-main");
  main.style.display = "contents";
  main.innerHTML = `
    <div style="display:grid;gap:calc(14*var(--u));align-content:start">
      <div class="mw-card doll"><div class="col l"></div><div class="stage"><img class="char" alt="${esc(d.name)}" src="${opts.character || "icons/character-benjooie.jpg"}"><div class="wslot"></div></div><div class="col r"></div></div>
      <div class="mw-card stats"></div>
    </div>
    <div class="bags">
      <div class="bag-tabs" role="tablist" aria-label="Bags"></div>
      <div class="bag-bar"><div class="cur"></div><span class="sp"></span>
        <label class="search">${SVG.search}<input type="search" placeholder="Search items" aria-label="Search items"></label>
        <div class="view" role="group" aria-label="View"><button type="button" data-v="list" aria-label="List">${SVG.list}</button><button type="button" data-v="grid" aria-label="Grid">${SVG.grid}</button></div></div>
      <div class="filters"></div>
      <div class="items"></div>
    </div>`;
  const q = (s) => el.querySelector(s);

  function gearSlot(slot) {
    const g = d.gear[slot] || {};
    const b = document.createElement("button");
    b.type = "button"; b.className = "gs";
    b.style.setProperty("--rc", RARITY[g.rarity] || RARITY.common);
    b.innerHTML = `<img alt="" src="${icon("gear-" + slot)}"><span class="lab">${GEAR_NAME[slot]}</span>`;
    b.setAttribute("aria-label", `${GEAR_NAME[slot]}: ${g.name || "empty"}`);
    tip(b, `<span class="k" style="--c:${RARITY[g.rarity]}">${esc(g.rarity || "")} · ${GEAR_NAME[slot]}</span><b>${esc(g.name || "Empty")}</b>Click to unequip`);
    b.addEventListener("click", () => opts.onGear && opts.onGear(slot));
    return b;
  }
  function renderDoll() {
    q(".doll .col.l").replaceChildren(...GEAR_L.map(gearSlot));
    q(".doll .col.r").replaceChildren(...GEAR_R.map(gearSlot));
    q(".doll .wslot").replaceChildren(gearSlot("weapon"));
    const s = d.stats, a = d.attrs;
    q(".stats").innerHTML = `
      <div class="hp"><div class="row"><span class="mw-muted">Health</span><span><b class="mw-num">${fmt(s.hp)}</b> <span class="mw-muted">/ ${fmt(s.maxHp)}</span></span></div>${bar(pct(s.hp, s.maxHp))}</div>
      <div class="grid">
        <div class="stat"><span>Attack</span><b>${fmt(s.atk)}</b></div><div class="stat"><span>Magic</span><b>${fmt(s.magic)}</b></div>
        <div class="stat"><span>Defense</span><b>${fmt(s.def)}</b></div><div class="stat"><span>Speed</span><b>+${s.speed}<small>%</small></b></div></div>
      <div class="attrs">${Object.entries(a).map(([k, v]) => `<span class="mw-chip${v ? "" : " zero"}"><span>${k.toUpperCase()}</span>${v}</span>`).join("")}</div>`;
  }
  function renderBags() {
    const used = (id) => d.items.filter((i) => i.bag === id).length;
    const total = d.bags.reduce((n, b) => n + b.size, 0), all = d.items.length;
    const tabs = [{ id: "all", name: "All bags", icon: "bag-main", size: total, n: all }, ...d.bags.slice(1).map((b) => ({ ...b, n: used(b.id) }))];
    tabs[0].name = d.bags[0].name; // the main bag tab shows every bag together (like before), bags 1-4 filter
    q(".bag-tabs").innerHTML = tabs.map((b) => `<button type="button" role="tab" class="bag-tab" data-bag="${b.id}" aria-selected="${ui.bag === b.id}">
      <img alt="" src="${icon(b.icon)}"><b>${esc(b.name)}</b><small>${b.n} / ${b.size}</small>${bar(pct(b.n, b.size), pct(b.n, b.size) > .9 ? "gold" : "")}</button>`).join("");
    q(".bag-tabs").querySelectorAll(".bag-tab").forEach((b) => b.addEventListener("click", () => { ui.bag = b.dataset.bag; renderBags(); renderItems(); }));
    q(".bag-bar .cur").innerHTML = `<span class="mw-chip" title="Gold"><img alt="" src="${icon("coin-gold")}">${fmt(d.gold)}</span><span class="mw-chip" title="Moss"><img alt="" src="${icon("coin-moss")}">${fmt(d.moss)} <span class="mw-muted">MOSS</span></span>`;
    q(".filters").innerHTML = FILTERS.map(([k, n]) => `<button type="button" class="filter" data-f="${k}" aria-pressed="${ui.filter === k}">${n}</button>`).join("") + `<span class="cap"></span>`;
    q(".filters").querySelectorAll(".filter").forEach((b) => b.addEventListener("click", () => { ui.filter = b.dataset.f; renderBags(); renderItems(); }));
    el.querySelectorAll(".view button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === ui.view)));
  }
  function renderItems() {
    hideTip();
    const inBag = d.items.filter((i) => ui.bag === "all" || i.bag === ui.bag);
    const size = ui.bag === "all" ? d.bags.reduce((n, b) => n + b.size, 0) : d.bags.find((b) => b.id === ui.bag).size;
    const match = (i) => (ui.filter === "all" || i.kind === ui.filter) && (!ui.q || i.name.toLowerCase().includes(ui.q));
    const shown = inBag.filter(match).length;
    q(".filters .cap").textContent = ui.filter === "all" && !ui.q ? `${inBag.length} / ${size} slots` : `${shown} found`;
    const box = q(".items");
    box.innerHTML = "";
    if (ui.view === "list") {
      box.className = "items list-items";
      inBag.filter(match).forEach((i) => {
        const r = document.createElement("div");
        r.className = "li"; r.style.setProperty("--rc", RARITY[i.rarity]);
        r.innerHTML = `<img alt="" src="${icon(i.icon)}"><div><b>${esc(i.name)}</b><div class="k">${esc(i.kind)} · ${esc(i.rarity)}</div></div><span class="c">${fmt(i.count)}</span><button type="button" class="mw-btn ghost">${i.kind === "consumable" ? "Use" : "Details"}</button>`;
        r.querySelector("button").addEventListener("click", () => use(i));
        box.append(r);
      });
      return;
    }
    box.className = "items grid-items";
    const list = ui.filter === "all" && !ui.q ? inBag : inBag.filter(match);
    list.forEach((i, n) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "it"; b.style.setProperty("--rc", RARITY[i.rarity]); b.style.animationDelay = `${n * 12}ms`;
      b.innerHTML = `<img alt="" src="${icon(i.icon)}">${i.count > 1 ? `<span class="c">${short(i.count)}</span>` : ""}`;
      b.setAttribute("aria-label", `${i.name}, ${i.count}`);
      tip(b, () => `<span class="k" style="--c:${RARITY[i.rarity]}">${esc(i.rarity)} · ${esc(i.kind)}</span><b>${esc(i.name)}</b>${fmt(i.count)} in bag${i.kind === "consumable" ? '<span class="g">Click to use</span>' : ""}`);
      b.addEventListener("click", () => use(i));
      box.append(b);
    });
    const empty = ui.filter === "all" && !ui.q ? size - list.length : Math.max(0, 8 - (list.length % 8 || 8));
    for (let n = 0; n < Math.min(empty, 48); n++) { const e = document.createElement("div"); e.className = "it empty"; box.append(e); }
  }
  function use(i) {
    if (opts.onUse) return opts.onUse(i);
    if (i.kind !== "consumable") return;
    i.count--; if (!i.count) d.items.splice(d.items.indexOf(i), 1);
    toast(el, `Used ${i.name}`);
    renderBags(); renderItems();
  }
  q(".search input").addEventListener("input", (e) => { ui.q = e.target.value.trim().toLowerCase(); renderItems(); });
  el.querySelectorAll(".view button").forEach((b) => b.addEventListener("click", () => { ui.view = b.dataset.v; renderBags(); renderItems(); }));
  renderDoll(); renderBags(); renderItems();
  const api = { el, get state() { return d; }, update(p) { Object.assign(d, p); renderDoll(); renderBags(); renderItems(); return api; }, destroy: () => { hideTip(); el.remove(); } };
  return api;
}

// ------------------------------------------------------------------ adventure board
//   data: board.json · opts: { icon, onClose, onClaim(c), onCancel(c), onAccept(c), onFind() }
export function createBoardWindow(container, data, opts = {}) {
  const icon = iconOf(opts);
  const d = structuredClone(data);
  const ui = { tab: "active", page: 0, confirm: null };
  const el = shell(container, "brd", opts, `<div class="mw-eyebrow">${esc(d.region)}</div><h2 class="mw-title">Adventure board</h2>`);
  const main = el.querySelector(".mw-main");
  const q = (s) => el.querySelector(s);
  main.innerHTML = `<div class="brd-top"><div class="mw-tabs" role="tablist"></div><span class="sp"></span><span class="slots"></span><button type="button" class="mw-btn gold claim-all"></button></div>
    <div class="brd-banner"><img alt="" src="${icon("board-scroll")}"><span>${esc(d.banner)}</span></div>
    <div class="brd-grid"></div>
    <div class="brd-foot"><button type="button" class="mw-btn"><img alt="" src="${icon("lantern")}">The lantern story</button><button type="button" class="mw-link find"><img alt="" src="${icon("board-scroll")}">Find Greenwood quests</button><span class="sp"></span>
      <div class="pager"><button type="button" class="prev" aria-label="Previous page">${SVG.left}</button><span></span><button type="button" class="next" aria-label="Next page">${SVG.right}</button></div></div>`;
  const of = (tab) => d.contracts.filter((c) => c.tab === tab);
  const ready = (c) => c.done >= c.goal;

  function render() {
    hideTip();
    const act = of("active"), claimable = act.filter(ready);
    const tabs = [["active", "Active", act.length, claimable.length > 0], ["notice", "Noticeboard", of("notice").length], ["completed", "Completed", of("completed").length]];
    q(".mw-tabs").innerHTML = tabs.map(([k, n, c, hot]) => `<button type="button" role="tab" class="mw-tab" data-t="${k}" aria-selected="${ui.tab === k}">${n}<span class="n${hot ? " hot" : ""}">${c}</span></button>`).join("");
    q(".mw-tabs").querySelectorAll(".mw-tab").forEach((b) => b.addEventListener("click", () => { ui.tab = b.dataset.t; ui.page = 0; render(); }));
    q(".slots").innerHTML = Array.from({ length: d.maxActive }, (_, i) => `<i class="${i < act.length ? "on" : ""}"></i>`).join("") + `&nbsp;${act.length} / ${d.maxActive} active`;
    const ca = q(".claim-all");
    ca.hidden = !(ui.tab === "active" && claimable.length > 1);
    ca.textContent = `Claim all (${claimable.length})`;
    const list = of(ui.tab), pages = Math.max(1, Math.ceil(list.length / 3));
    ui.page = Math.min(ui.page, pages - 1);
    q(".pager span").textContent = `${ui.page + 1} / ${pages}`;
    q(".pager .prev").disabled = ui.page === 0; q(".pager .next").disabled = ui.page >= pages - 1;
    const grid = q(".brd-grid");
    grid.innerHTML = "";
    const slice = list.slice(ui.page * 3, ui.page * 3 + 3);
    if (!slice.length) grid.innerHTML = `<div class="brd-empty">${ui.tab === "active" ? "No active contracts. Pick one from the noticeboard." : "Nothing here yet."}</div>`;
    slice.forEach((c, n) => grid.append(card(c, n)));
  }
  function card(c, n) {
    const r = ready(c), done = ui.tab === "completed", notice = ui.tab === "notice";
    const kc = { Patrol: "#7cc4ff", Gathering: "#5fe39a", Hunt: "#ff9f6b", Delivery: "#f3c252" }[c.kind] || "var(--mint)";
    const full = of("active").length >= d.maxActive;
    const a = document.createElement("article");
    a.className = "mw-card ct" + (r && !notice && !done ? " ready" : "");
    a.style.animationDelay = `${n * 60}ms`;
    a.innerHTML = `
      <div class="ct-head"><img alt="" src="${icon(c.thumb)}"><div><span class="mw-pill" style="--c:${kc}">${esc(c.kind)} request</span><h3>${esc(c.title)}</h3></div></div>
      ${r && !notice && !done ? `<span class="state mw-pill" style="--c:var(--gold)">✓ Ready</span>` : ""}
      <p>${esc(c.desc)}</p>
      <div class="obj"><div class="row"><span>Objective</span><b>${c.done} / ${c.goal}</b></div>${bar(pct(c.done, c.goal), r ? "gold" : "")}</div>
      <div class="rew"><span class="mw-muted" style="font-size:calc(11*var(--u));letter-spacing:.1em;text-transform:uppercase;margin-right:auto">Reward</span><span class="mw-chip xp">${c.xp} XP</span><span class="mw-chip gold">${c.gold} gold</span></div>
      <div class="act"></div>
      ${!done ? `<button type="button" class="mw-link find"><img alt="" src="${icon("board-scroll")}">Find a board or village warden</button>` : ""}`;
    const act = a.querySelector(".act");
    if (done) act.innerHTML = `<span class="mw-muted" style="font-size:calc(12.5*var(--u))">Completed · reward claimed</span>`;
    else if (notice) {
      act.innerHTML = `<button type="button" class="mw-btn primary"${full ? " disabled" : ""}>${full ? "Board full (3 / 3)" : "Accept contract"}</button>`;
      act.querySelector("button").addEventListener("click", () => { c.tab = "active"; opts.onAccept && opts.onAccept(c); toast(el, `Accepted: ${c.title}`); render(); });
    } else {
      act.innerHTML = `<button type="button" class="mw-btn ${r ? "gold" : ""}"${r ? "" : " disabled"}>${r ? "Claim reward" : "In progress"}</button><button type="button" class="mw-btn ghost danger cancel">${ui.confirm === c.id ? "Sure?" : "Cancel"}</button>`;
      act.querySelector("button").addEventListener("click", () => claim(c, a));
      act.querySelector(".cancel").addEventListener("click", () => {
        if (ui.confirm !== c.id) { ui.confirm = c.id; render(); return; }
        ui.confirm = null; c.tab = "notice"; c.done = 0; opts.onCancel && opts.onCancel(c); render();
      });
    }
    a.querySelectorAll(".find").forEach((b) => b.addEventListener("click", () => opts.onFind && opts.onFind(c)));
    return a;
  }
  function claim(c, a) {
    a && a.classList.add("out");
    opts.onClaim && opts.onClaim(c);
    toast(el, `+${c.xp} XP · +${c.gold} gold`);
    setTimeout(() => { c.tab = "completed"; render(); }, a ? 280 : 0);
  }
  q(".claim-all").addEventListener("click", () => {
    const list = of("active").filter(ready), xp = list.reduce((n, c) => n + c.xp, 0), g = list.reduce((n, c) => n + c.gold, 0);
    el.querySelectorAll(".ct.ready").forEach((x) => x.classList.add("out"));
    list.forEach((c) => opts.onClaim && opts.onClaim(c));
    toast(el, `+${xp} XP · +${g} gold`);
    setTimeout(() => { list.forEach((c) => (c.tab = "completed")); render(); }, 280);
  });
  q(".pager .prev").addEventListener("click", () => { ui.page--; render(); });
  q(".pager .next").addEventListener("click", () => { ui.page++; render(); });
  q(".brd-foot .find").addEventListener("click", () => opts.onFind && opts.onFind());
  render();
  const api = { el, get state() { return d; }, update(p) { Object.assign(d, p); render(); return api; }, destroy: () => { hideTip(); el.remove(); } };
  return api;
}

// ------------------------------------------------------------------ talents & spellbook
//   data: talents.json · opts: { icon, onClose, onLearn(node), onReset(), onSpell(spell) }
export function createTalentWindow(container, data, opts = {}) {
  const icon = iconOf(opts);
  const d = structuredClone(data);
  const ui = { tab: "talents" };
  const el = shell(container, "tt", opts, `<div class="mw-eyebrow">${esc(d.className)} · choose your path</div><h2 class="mw-title">Talents &amp; spells</h2>`);
  const main = el.querySelector(".mw-main");
  const q = (s) => el.querySelector(s);
  const nodes = () => d.paths.flatMap((p) => p.nodes);
  const spent = (p) => (p ? p.nodes : nodes()).reduce((n, x) => n + x.rank, 0);
  const left = () => d.points - spent();
  const byId = (id) => nodes().find((n) => n.id === id);
  const open = (n) => !n.req || byId(n.req).rank > 0;

  function render() {
    hideTip();
    main.innerHTML = `<div class="tt-top"><div class="mw-tabs" role="tablist">
        <button type="button" role="tab" class="mw-tab" data-t="talents" aria-selected="${ui.tab === "talents"}">Talent tree</button>
        <button type="button" role="tab" class="mw-tab" data-t="spells" aria-selected="${ui.tab === "spells"}">Spellbook<span class="n">${d.spellbook.length}</span></button></div>
      ${ui.tab === "talents" ? `<div class="pts"><b class="${left() ? "" : "zero"}">${left()}</b><span>points available<br>${spent()} spent of ${d.points}</span></div>
      <p class="rule">${esc(d.rule)}</p>
      <button type="button" class="mw-btn reset"${spent() ? "" : " disabled"}><img alt="" src="${icon("coin-gold")}">Reset · ${d.resetCost} gold</button>` : `<p class="rule">Drag a spell onto your skill bar, or click it to put it in the first empty slot.</p>`}</div>
      <div class="body"></div>`;
    main.querySelectorAll(".mw-tab").forEach((b) => b.addEventListener("click", () => { ui.tab = b.dataset.t; render(); }));
    const rs = main.querySelector(".reset");
    if (rs) rs.addEventListener("click", () => {
      if (rs.dataset.sure) { nodes().forEach((n) => (n.rank = 0)); opts.onReset && opts.onReset(); toast(el, `Talents reset · −${d.resetCost} gold`); render(); }
      else { rs.dataset.sure = 1; rs.innerHTML = `Click again to reset`; }
    });
    const body = main.querySelector(".body");
    if (ui.tab === "spells") {
      body.className = "body spells";
      d.spellbook.forEach((s, i) => {
        const c = document.createElement("div");
        c.className = "mw-card spell"; c.draggable = true; c.style.animationDelay = `${i * 30}ms`;
        c.innerHTML = `<img alt="" src="${icon(s.icon)}"><div><b>${esc(s.name)}</b><p>${esc(s.desc)}</p></div><span class="cd">${s.cd} s</span>`;
        c.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", s.name));
        c.addEventListener("click", () => { opts.onSpell && opts.onSpell(s); toast(el, `${s.name} added to your skill bar`); });
        body.append(c);
      });
      return;
    }
    body.className = "body tt-paths";
    d.paths.forEach((p) => body.append(pathCard(p)));
  }

  function pathCard(p) {
    const c = document.createElement("div");
    c.className = "mw-card path"; c.style.setProperty("--pc", p.color);
    c.innerHTML = `<div class="path-head"><img alt="" src="${icon(p.icon)}"><div><h3>${esc(p.name)}</h3><small>${esc(p.desc)}</small></div></div>
      <div class="tree"><svg class="links" aria-hidden="true"></svg></div>
      <div class="path-foot"><div class="row"><span><b>${spent(p)}</b> points in ${esc(p.name)}</span><span>${p.nodes.filter((n) => n.rank === n.max).length} / ${p.nodes.length} maxed</span></div>
      ${bar(pct(spent(p), p.nodes.reduce((n, x) => n + x.max, 0)))}</div>`;
    const tree = c.querySelector(".tree");
    const X = (col) => 18 + col * 32, Y = (row) => 9 + row * 20.5;   // % of the tree box
    const svg = c.querySelector("svg");
    let links = "";
    requestAnimationFrame(() => {
      const w = tree.clientWidth, h = tree.clientHeight, u = parseFloat(getComputedStyle(el).getPropertyValue("--win-scale")) || 1, half = 28 * u;
      for (const n of p.nodes) {
        if (!n.req) continue;
        const a = byId(n.req), on = n.rank > 0 || (a.rank > 0);
        const ax = X(a.col) / 100 * w, ay = Y(a.row) / 100 * h, bx = X(n.col) / 100 * w, by = Y(n.row) / 100 * h;
        let path, tip;
        if (a.row === n.row) { const dir = Math.sign(bx - ax); path = `M${ax + dir * half} ${ay} H${bx - dir * (half + 4)}`; tip = [bx - dir * half, by, dir, 0]; }
        else if (a.col === n.col) { path = `M${ax} ${ay + half} V${by - half - 4}`; tip = [bx, by - half, 0, 1]; }
        else { const my = ay + half + (by - half - ay - half) / 2; path = `M${ax} ${ay + half} V${my} H${bx} V${by - half - 4}`; tip = [bx, by - half, 0, 1]; }
        const [tx, ty, dx, dy] = tip, s = 5 * u;
        const tri = dx ? `${tx},${ty} ${tx - dx * s * 1.4},${ty - s} ${tx - dx * s * 1.4},${ty + s}` : `${tx},${ty} ${tx - s},${ty - s * 1.4} ${tx + s},${ty - s * 1.4}`;
        const cls = a.rank > 0 ? "on" : "";
        links += `<path class="${cls}" d="${path}"/><polygon class="${cls}" points="${tri}"/>`;
      }
      svg.innerHTML = links;
    });
    for (const n of p.nodes) {
      const b = document.createElement("button");
      b.type = "button";
      const state = n.rank === n.max ? "max" : n.rank > 0 ? "some" : open(n) && left() > 0 ? "avail" : "";
      b.className = "tn " + state;
      b.style.left = X(n.col) + "%"; b.style.top = Y(n.row) + "%";
      b.innerHTML = `<img alt="" src="${icon(n.icon)}"><span class="rk">${n.rank}/${n.max}</span>`;
      b.setAttribute("aria-label", `${n.name}, rank ${n.rank} of ${n.max}`);
      tip(b, () => `<span class="k" style="--c:${p.color}">${esc(p.name)} · rank ${n.rank} / ${n.max}</span><b>${esc(n.name)}</b>${esc(n.desc)}${
        n.rank === n.max ? '<span class="g">Maxed</span>' : !open(n) ? `<span class="g" style="color:var(--red)">Needs ${esc(byId(n.req).name)} first</span>` : left() ? '<span class="g">Click to learn · right-click to remove</span>' : '<span class="g" style="color:var(--ink-3)">No points left</span>'}`);
      b.addEventListener("click", () => {
        if (n.rank >= n.max || !open(n) || left() <= 0) { b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); return; }
        n.rank++; opts.onLearn && opts.onLearn(n); render();
        const nb = el.querySelector(`.tn[aria-label^="${CSS.escape(n.name)},"]`); nb && nb.classList.add("bump");
      });
      b.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const needed = p.nodes.some((x) => x.req === n.id && x.rank > 0);
        if (n.rank > 0 && !(n.rank === 1 && needed)) { n.rank--; render(); }
      });
      tree.append(b);
    }
    return c;
  }
  render();
  const api = { el, get state() { return d; }, update(p) { Object.assign(d, p); render(); return api; }, destroy: () => { hideTip(); el.remove(); } };
  return api;
}

// ------------------------------------------------------------------ workshop
//   data: workshop.json · opts: { icon, onClose, onCraft(recipe, qty), onFind(what) }
export function createWorkshopWindow(container, data, opts = {}) {
  const icon = iconOf(opts);
  const d = structuredClone(data);
  const open = { [d.ranks.filter((r) => r.level <= d.level).pop().name]: true };
  const qty = {};
  const el = shell(container, "ws", opts, `<div class="mw-eyebrow">Gather · craft · adventure</div><h2 class="mw-title">The workshop</h2>`);
  const main = el.querySelector(".mw-main");
  const have = (name) => (d.resources.find((r) => r.name === name) || {}).have ?? (opts.inventory ? opts.inventory(name) : 99);

  function render() {
    hideTip();
    const cur = d.ranks.filter((r) => r.level <= d.level).pop();
    main.innerHTML = `<div class="ws-body">
      <div class="mw-card ws-lvl">
        <div class="row"><span class="big">Lv ${d.level}</span><span class="mw-pill">${esc(cur.name)}</span><span class="sp"></span><small>${fmt(d.total)} crafting XP in total</small></div>
        <div style="display:grid;gap:calc(6*var(--u))"><div class="row"><small>${d.xp} / ${d.xpNext} XP to level ${d.level + 1}</small></div>${bar(pct(d.xp, d.xpNext))}</div>
        <div class="ranks">${d.ranks.map((r) => `<div class="rank ${r === cur ? "now" : r.level <= d.level ? "done" : "lock"}"><b>${esc(r.name)}</b><small>Level ${r.level}</small></div>`).join("")}</div>
        <div class="ws-tip"><span>${esc(d.tip)}</span><span><b>Next at crafting ${d.next.level}:</b> ${d.next.unlocks.map(esc).join(", ")}.</span></div>
      </div>
      <div class="mw-card ws-where"><img alt="" src="${icon("anvil")}"><span>Craft at a village workshop</span><span class="sp"></span><button type="button" class="mw-link" data-find="workshop"><img alt="" src="${icon("board-scroll")}">Find a workshop</button></div>
      <div class="ws-res">${d.resources.map((r) => `<span class="mw-chip"><img alt="" src="${icon(r.icon)}">${fmt(r.have)} <span>${esc(r.name)}</span></span>`).join("")}
        <button type="button" class="mw-link" data-find="resources" style="margin-left:auto"><img alt="" src="${icon("board-scroll")}">Find resources</button></div>
      <div class="groups" style="display:grid;gap:calc(10*var(--u))"></div></div>`;
    main.querySelectorAll("[data-find]").forEach((b) => b.addEventListener("click", () => opts.onFind && opts.onFind(b.dataset.find)));
    const groups = main.querySelector(".groups");
    for (const r of d.ranks) {
      const list = d.recipes.filter((x) => x.rank === r.name);
      const locked = r.level > d.level;
      const g = document.createElement("div");
      g.className = "mw-card grp" + (locked ? " locked" : "");
      g.dataset.open = String(!!open[r.name]);
      g.innerHTML = `<button type="button" aria-expanded="${!!open[r.name]}"><div><h3>${esc(r.name)} recipes</h3><small>Crafting ${r.level}${r === cur ? " · your current rank" : locked ? " · locked" : ""}</small></div><span class="sp"></span>
        <span class="mw-muted" style="font-size:calc(12*var(--u))">${list.length} recipe${list.length === 1 ? "" : "s"}</span>${SVG.chev}</button><div class="list"></div>`;
      g.querySelector("button").addEventListener("click", () => { open[r.name] = !open[r.name]; render(); });
      const box = g.querySelector(".list");
      list.forEach((x, i) => box.append(recipe(x, i)));
      if (!list.length) box.innerHTML = `<span class="mw-muted" style="padding:calc(4*var(--u)) calc(6*var(--u))">No recipes yet.</span>`;
      groups.append(g);
    }
  }
  function recipe(x, i) {
    const n = qty[x.name] || 1, locked = x.level > d.level;
    const missing = x.needs.some((k) => have(k.name) < k.n * n);
    const c = document.createElement("div");
    c.className = "rc" + (locked ? " locked" : ""); c.style.animationDelay = `${i * 40}ms`;
    c.innerHTML = `<img alt="" src="${icon(x.icon)}">
      <div><h4>${esc(x.name)} <span class="mw-pill" style="--c:#7cc4ff">${esc(x.type)}</span></h4><p>${esc(x.desc)}</p>
        <div class="out">${esc(x.makes)} · ${esc(x.effect)}</div>
        <div class="needs">${x.needs.map((k) => `<span class="mw-chip${have(k.name) < k.n * n ? " miss" : ""}"><img alt="" src="${icon(k.icon)}">${k.n * n} <span class="mw-muted">/ ${fmt(have(k.name))}</span></span>`).join("")}</div></div>
      <div class="side">${locked ? `<span class="mw-pill" style="--c:var(--ink-3)">Crafting ${x.level}</span>` : `<div class="qty"><button type="button" aria-label="Fewer">−</button><span>${n}</span><button type="button" aria-label="More">+</button></div>
        <button type="button" class="mw-btn primary"${missing ? " disabled" : ""}>${missing ? "Missing items" : "Craft"}</button>`}
        <small>Fee ${x.fee * n} gold · +${x.xp * n} XP</small></div>`;
    if (!locked) {
      const [m, p] = c.querySelectorAll(".qty button");
      m.addEventListener("click", () => { qty[x.name] = Math.max(1, n - 1); render(); });
      p.addEventListener("click", () => { qty[x.name] = Math.min(20, n + 1); render(); });
      const go = c.querySelector(".mw-btn.primary");
      go.addEventListener("click", () => {
        go.disabled = true; c.classList.add("crafting");
        const t0 = performance.now(), dur = 900;
        (function step(t) {
          const k = Math.min(1, (t - t0) / dur); go.style.setProperty("--p", (k * 100).toFixed(1) + "%"); go.textContent = k < 1 ? "Crafting…" : "Done";
          if (k < 1) return requestAnimationFrame(step);
          x.needs.forEach((k2) => { const r = d.resources.find((q) => q.name === k2.name); if (r) r.have -= k2.n * n; });
          d.xp += x.xp * n; d.total += x.xp * n;
          while (d.xp >= d.xpNext) { d.xp -= d.xpNext; d.level++; d.xpNext = Math.round(d.xpNext * 1.08); }
          opts.onCraft && opts.onCraft(x, n);
          toast(el, `Crafted ${x.makes}${n > 1 ? ` × ${n}` : ""} · +${x.xp * n} XP`);
          render();
        })(t0);
      });
    }
    return c;
  }
  render();
  const api = { el, get state() { return d; }, update(p) { Object.assign(d, p); render(); return api; }, destroy: () => { hideTip(); el.remove(); } };
  return api;
}

// ------------------------------------------------------------------ instant combat
//   data: instant-combat.json · opts: { icon, onClose, onRegister(), level, now: () => Date }
//   Events start every `everyHours` on the UTC hour (00:00, 02:00, …); registration opens `registerMinutesBefore` earlier.
//   Maps alternate per event; each map rotates through its four bosses.
export function createArenaWindow(container, data, opts = {}) {
  const d = structuredClone(data);
  const now = opts.now || (() => new Date());
  const level = opts.level ?? 60;
  const ui = { registered: false, remind: false };
  const el = shell(container, "ic", opts, `<div class="mw-eyebrow">${esc(d.eyebrow)}</div><h2 class="mw-title">${esc(d.name)}</h2>`);
  const main = el.querySelector(".mw-main");
  const H = d.everyHours * 3600e3, REG = d.registerMinutesBefore * 60e3;
  const pad = (n) => String(n).padStart(2, "0");
  const hm = (t) => `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
  function eventAt(t) {                       // map + boss of the event starting at time t
    const k = Math.floor(t / H), map = d.maps[k % d.maps.length];
    return { t: new Date(t), map, boss: map.bosses[Math.floor(k / d.maps.length) % map.bosses.length] };
  }
  const bracket = d.brackets.find(([a, b]) => level >= a && level <= b);

  main.innerHTML = `<div class="mw-card ic-hero"><div><div class="lab">Next event</div><div class="map"></div><div class="boss"></div></div>
      <div class="ic-clock"><div class="t mw-num"></div><small></small></div>
      <div class="ic-line"><i></i><b></b></div><div class="ic-marks"><span></span><span></span><span></span></div>
      <div class="ic-status"><span class="dot"></span><span class="ic-st"></span></div></div>
    <div class="ic-facts">
      <div class="stat"><span>Rounds</span><b>${d.rounds} × ${d.groupsPerRound}</b></div>
      <div class="stat"><span>Your arena</span><b>Lv ${bracket ? bracket.join("–") : "—"}</b></div>
      <div class="stat"><span>Players</span><b>up to ${d.maxPlayers}</b></div>
      <div class="stat"><span>Prepare</span><b>${d.prepareSeconds} s</b></div></div>
    <div class="ic-sec"><h4>Rewards</h4><div class="ic-gold">${d.goldByRound.map((g, i) => `<div class="col"><b>${g}</b><i style="height:calc(${12 + g / Math.max(...d.goldByRound) * 60}*var(--u));animation-delay:${i * 70}ms"></i>Round ${i + 1}</div>`).join("")}
      <div class="boss"><b>Boss clear</b>${fmt(d.bossXp)} XP · ${Math.round(d.bossRareChance * 100)}% chance of rare or better gear<span class="mw-muted">+ potions, tonics and materials</span></div></div></div>
    <div class="ic-sec"><h4>Rules</h4><ul class="ic-rules">${d.rules.map((r, i) => `<li><i>${i + 1}</i><span>${esc(r)}</span></li>`).join("")}</ul></div>
    <div class="ic-sec"><h4>Coming up</h4><div class="ic-rot"></div></div>
    <div class="ic-sec"><h4>Arenas by level</h4><div class="ic-brk">${d.brackets.map((b) => `<span class="mw-chip${b === bracket ? " me" : ""}">Lv ${b[0]}–${b[1]}${b === bracket ? " · you" : ""}</span>`).join("")}</div></div>
    <div class="ic-foot"><button type="button" class="mw-btn primary reg"></button><button type="button" class="mw-btn remind">🔔 Remind me</button></div>`;
  const q = (s) => el.querySelector(s);
  q(".remind").addEventListener("click", () => { ui.remind = !ui.remind; q(".remind").classList.toggle("on", ui.remind); toast(el, ui.remind ? "We'll remind you when registration opens" : "Reminder off"); });
  q(".reg").addEventListener("click", () => { ui.registered = !ui.registered; opts.onRegister && opts.onRegister(ui.registered); tick(); });

  let timer = 0;
  function tick() {
    const t = now().getTime(), start = Math.ceil(t / H) * H, prev = start - H;
    const ev = eventAt(start), open = t >= start - REG;
    const left = start - t, s = Math.floor(left / 1000);
    q(".ic-hero").classList.toggle("bone", ev.map.name === "Bone Pit");
    q(".ic-hero .map").textContent = ev.map.name;
    q(".ic-hero .boss").textContent = ev.boss;
    q(".ic-clock .t").textContent = s >= 3600 ? `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
    q(".ic-clock small").textContent = `starts ${hm(ev.t)} UTC`;
    q(".ic-line i").style.width = `${((t - prev) / H * 100).toFixed(2)}%`;
    q(".ic-line b").style.left = `${((H - REG) / H * 100).toFixed(2)}%`;
    const marks = el.querySelectorAll(".ic-marks span");
    marks[0].textContent = `${hm(new Date(prev))} last`; marks[1].textContent = `registration ${hm(new Date(start - REG))}`; marks[2].textContent = `start ${hm(ev.t)}`;
    const st = q(".ic-status");
    st.style.setProperty("--c", open ? "var(--mint)" : "var(--gold)");
    st.querySelector(".ic-st").textContent = ui.registered ? `You're registered. You enter the Lv ${bracket.join("–")} arena at ${hm(ev.t)} UTC.`
      : open ? `Registration is open. It closes at ${hm(ev.t)} UTC.` : `Registration opens at ${hm(new Date(start - REG))} UTC (in ${Math.ceil((left - REG) / 60000)} min).`;
    const reg = q(".reg");
    reg.disabled = !open || !bracket;
    reg.className = "mw-btn reg " + (ui.registered ? "" : "primary");
    reg.textContent = !bracket ? `Reach level ${d.brackets[0][0]} to join` : ui.registered ? "Registered ✓ · click to leave" : open ? "Register now" : `Registration opens at ${hm(new Date(start - REG))} UTC`;
    q(".ic-rot").innerHTML = [0, 1, 2, 3].map((i) => { const e = eventAt(start + i * H); return `<div class="r${i ? "" : " next"}"><span class="t">${hm(e.t)}</span><span>${esc(e.map.name)} · ${esc(e.boss)}</span><span class="mw-muted">${i ? "" : "next"}</span></div>`; }).join("");
  }
  tick();
  timer = setInterval(tick, 1000);
  const api = { el, get state() { return { ...d, ...ui }; }, update(p) { Object.assign(d, p); tick(); return api; }, destroy: () => { clearInterval(timer); el.remove(); } };
  return api;
}

// ------------------------------------------------------------------ spellbook (combat + professions, hotbar with 2 banks)
//   data: spellbook.json · opts: { icon, onClose, onBars(bars), onTrainer() }
//   Drag a skill onto a hotbar slot, drag slots to swap, or click a slot then a skill. × clears a slot.
const TAG = { ranged: ["#7cc4ff", "Ranged"], utility: ["#f3c252", "Utility"], healing: ["#5fe39a", "Healing"], gathering: ["#5fe39a", "Gathering"], crafting: ["#ff9f6b", "Crafting"] };
export function createSpellbookWindow(container, data, opts = {}) {
  const icon = iconOf(opts);
  const d = structuredClone(data);
  const ui = { tab: "combat", bank: 0, sel: d.combat[0].id, slot: null, q: "" };
  const el = shell(container, "sb", opts, `<div class="mw-eyebrow">${esc(d.cls)} · abilities</div><h2 class="mw-title">Spellbook</h2>`);
  const main = el.querySelector(".mw-main");
  const all = () => [...d.combat, ...d.professions];
  const byId = (id) => all().find((s) => s.id === id);
  const onBar = (id) => d.bars.some((b) => b.includes(id));
  const save = () => opts.onBars && opts.onBars(d.bars);

  function render() {
    hideTip();
    const list = d[ui.tab], learned = list.filter((s) => s.learned), locked = list.filter((s) => !s.learned);
    const sel = byId(ui.sel) || list[0];
    main.innerHTML = `<div class="sb-top"><div class="mw-tabs" role="tablist">
        <button type="button" role="tab" class="mw-tab" data-t="combat" aria-selected="${ui.tab === "combat"}"><img alt="" src="${icon("tab-combat")}">Combat<span class="n">${d.combat.filter((s) => s.learned).length}</span></button>
        <button type="button" role="tab" class="mw-tab" data-t="professions" aria-selected="${ui.tab === "professions"}"><img alt="" src="${icon("tab-professions")}">Professions<span class="n">${d.professions.filter((s) => s.learned).length}</span></button></div>
      <span class="sp"></span><label class="search">${SVG.search}<input type="search" placeholder="Search skills" aria-label="Search skills" value="${esc(ui.q)}"></label>
      <span class="mw-muted" style="font-size:calc(12.5*var(--u))">Level ${d.level} · ${learned.length} / ${list.length} learned</span></div>
      <div class="sb-body">
        <div class="mw-card sb-lib">
          <div class="row"><h3>Learned<small>drag to the hotbar</small></h3><span style="flex:1"></span><div class="legend">${[...new Set(list.map((s) => s.tag))].map((t) => `<span><i style="--tc:${TAG[t][0]}"></i>${TAG[t][1]}</span>`).join("")}</div></div>
          <div class="sb-grid learned"></div>
          ${locked.length ? `<div class="row"><h3>Not learned yet<small>${locked.length} available at your level</small></h3><span style="flex:1"></span><button type="button" class="mw-link trainer"><img alt="" src="${icon("board-scroll")}">Find class trainer</button></div><div class="sb-grid locked"></div>` : ""}
        </div>
        <div class="mw-card sb-det"></div>
      </div>
      <div class="mw-card hb">
        <div class="row"><h3>Hotbar</h3><div class="bank" role="group" aria-label="Bar">${d.bars.map((_, i) => `<button type="button" data-b="${i}" aria-pressed="${ui.bank === i}">Bar ${i + 1}</button>`).join("")}</div>
          <span class="sp"></span><button type="button" class="mw-btn ghost clear"${ui.slot == null || !d.bars[ui.bank][ui.slot] ? " disabled" : ""}>Clear slot</button><button type="button" class="mw-btn ghost danger reset">Reset bar</button></div>
        <div class="hb-slots"></div>
        <div class="hb-help">Drag skills onto a slot, drag slots to swap them, or click a slot and then a skill. Changes save to this character.</div>
      </div>`;
    const q = (s) => main.querySelector(s);
    main.querySelectorAll(".mw-tab").forEach((b) => b.addEventListener("click", () => { ui.tab = b.dataset.t; ui.sel = d[ui.tab][0].id; render(); }));
    q(".search input").addEventListener("input", (e) => { ui.q = e.target.value.trim().toLowerCase(); fill(); });
    main.querySelectorAll(".bank button").forEach((b) => b.addEventListener("click", () => { ui.bank = +b.dataset.b; ui.slot = null; render(); }));
    q(".reset").addEventListener("click", () => { d.bars[ui.bank] = Array(10).fill(null); save(); render(); });
    q(".clear").addEventListener("click", () => { if (ui.slot != null) { d.bars[ui.bank][ui.slot] = null; ui.slot = null; save(); render(); } });
    const tr = q(".trainer"); tr && tr.addEventListener("click", () => opts.onTrainer && opts.onTrainer());
    fill();
    detail(sel);
    slots();
  }
  function fill() {
    const list = d[ui.tab].filter((s) => !ui.q || s.name.toLowerCase().includes(ui.q));
    for (const [cls, learned] of [["learned", true], ["locked", false]]) {
      const box = main.querySelector(`.sb-grid.${cls}`);
      if (!box) continue;
      box.innerHTML = "";
      list.filter((s) => s.learned === learned).forEach((s, i) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "sk" + (learned ? "" : " locked"); b.style.setProperty("--tc", TAG[s.tag][0]); b.style.animationDelay = `${i * 15}ms`;
        b.setAttribute("aria-pressed", String(s.id === ui.sel)); b.setAttribute("aria-label", s.name);
        b.innerHTML = `<img alt="" src="${icon(s.icon)}"><span class="tg"></span>${learned && onBar(s.id) ? '<span class="on">ON</span>' : ""}`;
        b.draggable = learned;
        b.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/skill", s.id); e.dataTransfer.effectAllowed = "copy"; });
        b.addEventListener("click", () => {
          if (learned && ui.slot != null) { d.bars[ui.bank][ui.slot] = s.id; ui.slot = null; save(); }
          ui.sel = s.id; render();
        });
        tip(b, `<span class="k" style="--c:${TAG[s.tag][0]}">${TAG[s.tag][1]}${learned ? "" : ` · level ${s.level} · ${esc(s.where)}`}</span><b>${esc(s.name)}</b>${esc(s.stats)}`);
        box.append(b);
      });
    }
  }
  function detail(s) {
    const box = main.querySelector(".sb-det");
    if (!s) { box.innerHTML = ""; return; }
    const [c, t] = TAG[s.tag];
    box.innerHTML = `<div class="hd"><img alt="" src="${icon(s.icon)}"><div><span class="mw-pill" style="--c:${c}">${t}</span><h3>${esc(s.name)}</h3></div></div>
      <p>${esc(s.desc)}</p><div class="sk-stats">${s.stats.split(" · ").map((x) => `<span class="mw-chip">${esc(x)}</span>`).join("")}</div>
      ${s.learned ? `<button type="button" class="mw-btn primary put">${onBar(s.id) ? "On your hotbar ✓" : "Put on the hotbar"}</button><span class="hint">${ui.slot != null ? `Goes into slot ${d.keys[ui.slot]}.` : "Goes into the first empty slot of the bar you're editing."}</span>`
        : `<button type="button" class="mw-btn gold trainer2">Learn at the ${esc(s.where.toLowerCase())}</button><span class="hint">Available at level ${s.level}.</span>`}`;
    const put = box.querySelector(".put");
    put && put.addEventListener("click", () => {
      const bar = d.bars[ui.bank], i = ui.slot ?? bar.indexOf(null);
      if (i < 0) { toast(el, "This bar is full: clear a slot first"); return; }
      bar[i] = s.id; ui.slot = null; save(); toast(el, `${s.name} → slot ${d.keys[i]}`); render();
    });
    const t2 = box.querySelector(".trainer2"); t2 && t2.addEventListener("click", () => opts.onTrainer && opts.onTrainer(s));
  }
  function slots() {
    const box = main.querySelector(".hb-slots"), bar = d.bars[ui.bank];
    box.innerHTML = "";
    bar.forEach((id, i) => {
      const s = id && byId(id);
      const b = document.createElement("div");
      b.className = "hs" + (s ? "" : " empty"); b.tabIndex = 0; b.setAttribute("role", "button");
      b.setAttribute("aria-pressed", String(ui.slot === i)); b.setAttribute("aria-label", s ? `Slot ${d.keys[i]}: ${s.name}` : `Slot ${d.keys[i]}: empty`);
      if (s) b.style.setProperty("--tc", TAG[s.tag][0]);
      b.innerHTML = `<span class="key">${d.keys[i]}</span>${s ? `<img alt="" src="${icon(s.icon)}"><span class="tg"></span><button type="button" class="x" aria-label="Clear slot">×</button>` : ""}<span class="nm">${s ? esc(s.name) : "Empty"}</span>`;
      b.draggable = !!s;
      b.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/slot", String(i)); e.dataTransfer.effectAllowed = "move"; });
      b.addEventListener("dragover", (e) => { e.preventDefault(); b.classList.add("drop"); });
      b.addEventListener("dragleave", () => b.classList.remove("drop"));
      b.addEventListener("drop", (e) => {
        e.preventDefault();
        const from = e.dataTransfer.getData("text/slot"), sk = e.dataTransfer.getData("text/skill");
        if (from !== "") { const f = +from; [bar[f], bar[i]] = [bar[i], bar[f]]; }
        else if (sk) { const old = bar.indexOf(sk); if (old >= 0) bar[old] = bar[i]; bar[i] = sk; }
        save(); render();
      });
      const pick = () => { ui.slot = ui.slot === i ? null : i; if (s) ui.sel = s.id; render(); };
      b.addEventListener("click", (e) => { if (e.target.closest(".x")) return; pick(); });
      b.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } if (e.key === "Delete" && s) { bar[i] = null; save(); render(); } });
      const x = b.querySelector(".x"); x && x.addEventListener("click", () => { bar[i] = null; if (ui.slot === i) ui.slot = null; save(); render(); });
      box.append(b);
    });
  }
  render();
  const api = { el, get state() { return d; }, update(p) { Object.assign(d, p); render(); return api; }, destroy: () => { hideTip(); el.remove(); } };
  return api;
}

// ------------------------------------------------------------------ raid (encounter + collection)
//   data: raid.json · opts: { icon, onClose, onFormRaid(), onEvolve(), onStore() }
const GLYPH = {
  wings: `<svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true"><path d="M24 30c-3-8-10-14-20-16 2 6 5 10 9 12-3 0-5 1-7 3 5 1 9 1 12-1-1 3-1 6 0 9 3-2 5-5 6-7zm0 0c3-8 10-14 20-16-2 6-5 10-9 12 3 0 5 1 7 3-5 1-9 1-12-1 1 3 1 6 0 9-3-2-5-5-6-7z"/></svg>`,
  aura: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><circle cx="24" cy="24" r="8" fill="currentColor"/><circle cx="24" cy="24" r="15" stroke-dasharray="4 5"/><circle cx="24" cy="24" r="21" opacity=".5"/></svg>`,
  weapon: `<svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true"><path d="M38 6l4 4-20 20-4-4zM16 24l8 8-3 3-3-1-6 6-3-3 6-6-1-3z"/></svg>`,
};
export function createRaidWindow(container, data, opts = {}) {
  const icon = iconOf(opts);
  const d = structuredClone(data);
  const ui = { tab: "encounter", open: { guide: true } };
  const el = shell(container, "rd", opts, `<div class="mw-eyebrow">Level ${d.level} · ${d.size[0]}–${d.size[1]} adventurers</div><h2 class="mw-title">${esc(d.name)}</h2>`);
  const main = el.querySelector(".mw-main");
  const acc = (key, title, inner) => `<div class="mw-card acc" data-k="${key}" data-open="${!!ui.open[key]}"><button type="button" aria-expanded="${!!ui.open[key]}">${title}<span class="sp"></span>${SVG.chev}</button><div class="in">${inner}</div></div>`;
  function render() {
    hideTip();
    const tabs = `<div class="mw-tabs" role="tablist" style="margin-bottom:calc(14*var(--u))">
      <button type="button" role="tab" class="mw-tab" data-t="encounter" aria-selected="${ui.tab === "encounter"}">Encounter</button>
      <button type="button" role="tab" class="mw-tab" data-t="collection" aria-selected="${ui.tab === "collection"}">Raid collection<span class="n">${d.clears} clears</span></button></div>`;
    if (ui.tab === "encounter") {
      main.innerHTML = tabs + `<div class="mw-card rd-hero"><div class="boss"><img alt="" src="${icon(d.icon)}"></div><div>
          <h3>${esc(d.name)}</h3><div class="chips"><span class="mw-chip">Level ${d.level}</span><span class="mw-chip">${d.size[0]}–${d.size[1]} adventurers</span><span class="mw-chip gold">${d.clears} clears</span></div>
          <p>${esc(d.desc)}</p></div></div>
        <div class="route" aria-label="Raid route">${d.route.map((r, i) => `${i ? '<span class="ln"></span>' : ""}<div class="rt${r.boss ? " boss" : ""}${r.final ? " final" : ""}"><i></i><span>${esc(r.boss ? r.name : "Chamber " + (i + 1))}</span></div>`).join("")}</div>
        <div class="roles">${d.roles.map((r) => `<div class="stat" style="--c:${r.c}"><span>${esc(r.role)}</span><b>${esc(r.n)}</b></div>`).join("")}</div>
        <div class="rd-act"><button type="button" class="mw-btn primary form">Form a raid</button><button type="button" class="mw-btn find">Find a group</button></div>
        ${acc("guide", "Encounter guide", d.guide.map((g, i) => `<div class="guide"><i>${i + 1}</i><div><b>${esc(g.title)}</b>${esc(g.text)}</div></div>`).join(""))}`;
      main.querySelector(".form").addEventListener("click", () => { opts.onFormRaid ? opts.onFormRaid() : toast(el, "Raid formed · invite players from Friends"); });
      main.querySelector(".find").addEventListener("click", () => toast(el, "Looking for a raid group…"));
    } else {
      const p = d.pet, cores = (d.currencies.find((c) => c.name.startsWith("Evolution")) || {}).n || 0, can = cores >= p.coresNeeded && p.evolution < p.maxEvolution;
      main.innerHTML = tabs + `<div class="cur3">${d.currencies.map((c) => `<div class="stat" style="--c:${c.c}"><span>${esc(c.name)}</span><b>${c.n}</b></div>`).join("")}</div>
        <h4><span>Apostle cosmetics</span><span>${d.cosmetics.filter((c) => c.collected).length} / ${d.cosmetics.length}</span></h4>
        <div class="cos">${d.cosmetics.map((c) => `<div class="mw-card${c.collected ? "" : " no"}"><div class="cpv">${GLYPH[c.kind] || ""}</div><b>${esc(c.name)}</b>
          <span class="mw-pill" style="--c:${c.collected ? "var(--mint)" : "var(--ink-3)"}">${c.collected ? "Collected" : "Not collected"}</span><small>${esc(c.how)}</small></div>`).join("")}</div>
        <h4><span>${esc(p.name)} pet</span><span>Evolution ${p.evolution} / ${p.maxEvolution}</span></h4>
        <div class="mw-card evo"><img alt="" src="${icon(p.icon)}"><div>
          <b style="font-size:calc(16*var(--u))">Evolve your companion</b><div class="steps">${Array.from({ length: p.maxEvolution }, (_, i) => `<i class="${i < p.evolution ? "on" : ""}"></i>`).join("")}</div>
          <div class="row"><span>Next evolution: ${p.coresNeeded} Evolution Cores · you have ${cores}. ${esc(p.note)}</span></div>
          <div class="row" style="margin-top:calc(8*var(--u))">${bar(pct(cores, p.coresNeeded), "gold").replace('class="mw-bar', 'style="flex:1" class="mw-bar')}<button type="button" class="mw-btn ${can ? "primary" : ""} evolve"${can ? "" : " disabled"}>${can ? "Evolve" : `Need ${p.coresNeeded - cores} more core${p.coresNeeded - cores === 1 ? "" : "s"}`}</button></div></div></div>
        ${acc("rewards", "Raid reward chances", `<div class="rwl">${d.rewards.map((r) => `<span>${esc(r.name)}</span><span>${esc(r.chance)}</span>`).join("")}</div>`)}
        <div class="rd-act"><button type="button" class="mw-btn store">Open store</button></div>`;
      main.querySelector(".evolve").addEventListener("click", () => { p.evolution++; d.currencies.find((c) => c.name.startsWith("Evolution")).n -= p.coresNeeded; opts.onEvolve && opts.onEvolve(); toast(el, `${p.name} evolved!`); render(); });
      main.querySelector(".store").addEventListener("click", () => opts.onStore && opts.onStore());
    }
    main.querySelectorAll(".mw-tab").forEach((b) => b.addEventListener("click", () => { ui.tab = b.dataset.t; render(); }));
    main.querySelectorAll(".acc > button").forEach((b) => b.addEventListener("click", () => { const k = b.parentElement.dataset.k; ui.open[k] = !ui.open[k]; render(); }));
  }
  render();
  const api = { el, get state() { return d; }, update(p) { Object.assign(d, p); render(); return api; }, destroy: () => { hideTip(); el.remove(); } };
  return api;
}

// ------------------------------------------------------------------ arena matches (rated + unrated challenges)
//   data: pvp.json · opts: { icon, onClose, onQueue(mode, on), onChallenge(player, size, stake), onParty() }
export function createPvpWindow(container, data, opts = {}) {
  const icon = iconOf(opts);
  const d = structuredClone(data);
  const ui = { queue: null, t0: 0, stake: 0, open: {} };
  const el = shell(container, "pv", opts, `<div class="mw-eyebrow">PvP</div><h2 class="mw-title">Arena matches</h2>`);
  const main = el.querySelector(".mw-main");
  const tierOf = (m) => [...d.tiers].reverse().find((t) => m >= t.min);
  const nextTier = (m) => d.tiers.find((t) => t.min > m);
  let timer = 0;
  function render() {
    hideTip();
    const best = Math.max(...d.rated.map((r) => r.mmr)), t = tierOf(best), n = nextTier(best);
    main.innerHTML = `<div class="mw-card pv-rank"><div class="medal" style="--c:${t.c}">${esc(t.name.slice(0, 2).toUpperCase())}</div><div>
        <b>${best}</b> <span class="mw-muted">MMR · ${esc(t.name)}</span>
        <div class="row"><span>${n ? `${n.min - best} to ${esc(n.name)}` : "Top tier"}</span><span>${n ? n.min : ""}</span></div>${bar(n ? pct(best - t.min, n.min - t.min) : 1, "gold")}</div></div>
      <h4><span>Rated arena</span><span>party ${d.party} / 3</span></h4>
      <div class="modes">${d.rated.map((r) => {
        const need = r.size > d.party, q = ui.queue === r.id, g = r.wins + r.losses;
        return `<div class="mw-card mode" data-m="${r.id}"><h3>${esc(r.name)} <span class="mw-pill" style="--c:${tierOf(r.mmr).c}">${r.mmr} · ${esc(tierOf(r.mmr).name)}</span></h3>
          <button type="button" class="mw-btn ${q ? "q" : need ? "" : "primary"}"${need || (ui.queue && !q) ? " disabled" : ""}>${q ? "Searching 0:00 · Cancel" : need ? `Party of ${r.size} needed` : "Find match"}</button>
          <small>${r.wins} W · ${r.losses} L${g ? ` · ${Math.round(r.wins / g * 100)}% win rate` : " · no games yet"}</small></div>`; }).join("")}</div>
      <div class="mw-card party"><div class="dots">${[0, 1, 2].map((i) => `<i class="${i < d.party ? "on" : ""}">${i < d.party ? (i ? "+" : "You".slice(0, 1)) : ""}</i>`).join("")}</div>
        <span>${d.party === 1 ? "Solo · form a party for 2v2 and 3v3" : `Party of ${d.party}`}</span><span class="sp"></span><button type="button" class="mw-btn party-btn">${d.party < 3 ? "Invite to party" : "Leave party"}</button></div>
      <h4><span>Unrated challenges</span><span>${d.nearby.length} nearby</span></h4>
      <div class="mw-card stake"><div class="in"><label for="stk" style="font-weight:700;font-size:calc(13*var(--u))">Stake per player</label>
          <input id="stk" type="number" min="0" step="1" value="${ui.stake}" inputmode="decimal"><span class="mw-chip"><img alt="" src="${icon("coin-moss")}">MOSS</span></div>
        <div class="quick">${[0, 10, 100, 1000].map((v) => `<button type="button" data-v="${v}">${v ? fmt(v) : "Friendly (0)"}</button>`).join("")}<button type="button" data-v="max">Max</button></div>
        <div class="pay"></div></div>
      <div class="opps" style="display:grid;gap:calc(8*var(--u));margin-top:calc(8*var(--u))">${d.nearby.map((p, i) => `<div class="mw-card opp" data-i="${i}"><div class="av">${esc(p.name.slice(0, 1))}</div>
        <div><b>${esc(p.name)}</b><small>Level ${p.level} ${esc(p.cls)}</small></div>
        <div class="btns">${[1, 2, 3].map((s) => `<button type="button" class="mw-btn${s === 1 ? " primary" : ""}" data-s="${s}"${s > d.party ? " disabled" : ""}>${s}v${s}${s > d.party ? `<small>lead a party of ${s}</small>` : "<small>challenge</small>"}</button>`).join("")}</div></div>`).join("") || `<div class="mw-card" style="padding:calc(16*var(--u));color:var(--ink-3)">Nobody nearby. Stand near other adventurers to challenge them.</div>`}</div>
      ${`<div class="mw-card acc" data-open="${!!ui.open.w}" style="margin-top:calc(10*var(--u))"><button type="button" aria-expanded="${!!ui.open.w}">MOSS wagers &amp; payouts<span class="sp"></span>${SVG.chev}</button><div class="in"><ul class="ic-rules">${d.wagers.map((w, i) => `<li><i>${i + 1}</i><span>${esc(w)}</span></li>`).join("")}</ul></div></div>`}`;
    const stake = main.querySelector("#stk");
    const pay = () => {
      const v = Number(stake.value) || 0, bad = v < 0 || v > d.moss;
      main.querySelector(".pay").innerHTML = bad ? `<span class="err">You have ${fmt(d.moss)} MOSS.</span>` : v ? `Winner gets <b>${fmt(v * 2)} MOSS</b> · you risk ${fmt(v)} MOSS` : "Friendly match · no MOSS at stake";
      main.querySelectorAll(".opp .btns .mw-btn").forEach((b) => (b.disabled = bad || +b.dataset.s > d.party));
    };
    stake.addEventListener("input", () => { ui.stake = Number(stake.value) || 0; pay(); });
    main.querySelectorAll(".quick button").forEach((b) => b.addEventListener("click", () => { ui.stake = b.dataset.v === "max" ? Math.floor(d.moss) : +b.dataset.v; stake.value = ui.stake; pay(); }));
    pay();
    main.querySelectorAll(".mode .mw-btn").forEach((b) => b.addEventListener("click", () => {
      const id = b.closest(".mode").dataset.m, on = ui.queue !== id;
      ui.queue = on ? id : null; ui.t0 = performance.now(); opts.onQueue && opts.onQueue(id, on); render();
    }));
    main.querySelector(".party-btn").addEventListener("click", () => { d.party = d.party < 3 ? d.party + 1 : 1; opts.onParty && opts.onParty(d.party); render(); });
    main.querySelectorAll(".opp .btns .mw-btn").forEach((b) => b.addEventListener("click", () => {
      const p = d.nearby[+b.closest(".opp").dataset.i]; opts.onChallenge && opts.onChallenge(p, +b.dataset.s, ui.stake);
      toast(el, `Challenge sent to ${p.name} · ${b.dataset.s}v${b.dataset.s}${ui.stake ? ` · ${fmt(ui.stake)} MOSS` : ""}`);
    }));
    main.querySelector(".acc > button").addEventListener("click", () => { ui.open.w = !ui.open.w; render(); });
  }
  function tick() {
    if (!ui.queue) return;
    const b = main.querySelector(`.mode[data-m="${ui.queue}"] .mw-btn`), s = Math.floor((performance.now() - ui.t0) / 1000);
    if (b) b.textContent = `Searching ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} · Cancel`;
  }
  render();
  timer = setInterval(tick, 500);
  const api = { el, get state() { return d; }, update(p) { Object.assign(d, p); render(); return api; }, destroy: () => { clearInterval(timer); hideTip(); el.remove(); } };
  return api;
}

// ------------------------------------------------------------------ mounts & pets
//   data: collection.json · opts: { icon, onClose, onSummon(pet), onDismiss(pet), onLoot(value), preview(id) -> url }
export function createCollectionWindow(container, data, opts = {}) {
  const icon = iconOf(opts);
  const d = structuredClone(data);
  const ui = { tab: opts.tab || "pets", sel: d.pets.summoned || (d.pets.list[0] || {}).id, q: "", own: false, flip: false, open: {} };
  const el = shell(container, "pc", opts, `<div class="mw-eyebrow">Collection</div><h2 class="mw-title">Mounts &amp; pets</h2>`);
  const main = el.querySelector(".mw-main");
  function render() {
    hideTip();
    const col = d[ui.tab], list = col.list.filter((p) => (!ui.q || p.name.toLowerCase().includes(ui.q)) && (!ui.own || p.collected));
    const sel = col.list.find((p) => p.id === ui.sel) || list[0];
    main.innerHTML = `<div class="pc-top"><div class="mw-tabs" role="tablist">
        <button type="button" role="tab" class="mw-tab" data-t="pets" aria-selected="${ui.tab === "pets"}">Pets<span class="n">${d.pets.collected}</span></button>
        <button type="button" role="tab" class="mw-tab" data-t="mounts" aria-selected="${ui.tab === "mounts"}">Mounts<span class="n">${d.mounts.collected}</span></button></div>
      <span class="sp"></span><div class="cnt"><span><b>${col.collected}</b> / ${col.total} collected</span>${bar(pct(col.collected, col.total), "gold")}</div></div>
      ${ui.tab === "pets" ? `<div class="mw-card loot"><label for="loot">Pet loot</label><select id="loot">${d.lootOptions.map(([v, n]) => `<option value="${v}"${v === d.loot ? " selected" : ""}>${esc(n)}</option>`).join("")}</select><p>${esc(d.lootText)}</p></div>` : ""}
      <div class="pc-body">
        <div class="mw-card pc-list"><div class="tools"><label class="search">${SVG.search}<input type="search" placeholder="Search" aria-label="Search" value="${esc(ui.q)}"></label>
          <label class="toggle"><input type="checkbox"${ui.own ? " checked" : ""}> Collected</label></div><div class="pc-items"></div></div>
        <div class="mw-card pc-view"></div></div>
      <div class="notes-acc">${d.notes.map((n, i) => `<div class="mw-card acc" data-i="${i}" data-open="${!!ui.open[i]}"><button type="button" aria-expanded="${!!ui.open[i]}">${esc(n.title)}<span class="sp"></span>${SVG.chev}</button><div class="in"><span class="mw-muted">${esc(n.text)}</span></div></div>`).join("")}</div>`;
    main.querySelectorAll(".mw-tab").forEach((b) => b.addEventListener("click", () => { ui.tab = b.dataset.t; ui.sel = null; render(); }));
    const lo = main.querySelector("#loot"); lo && lo.addEventListener("change", () => { d.loot = lo.value; opts.onLoot && opts.onLoot(lo.value); toast(el, `Pets collect: ${lo.selectedOptions[0].text.toLowerCase()}`); });
    main.querySelector(".search input").addEventListener("input", (e) => { ui.q = e.target.value.trim().toLowerCase(); const pos = e.target.selectionStart; render(); const i = main.querySelector(".search input"); i.focus(); i.setSelectionRange(pos, pos); });
    main.querySelector(".toggle input").addEventListener("change", (e) => { ui.own = e.target.checked; render(); });
    main.querySelectorAll(".acc > button").forEach((b) => b.addEventListener("click", () => { const i = b.parentElement.dataset.i; ui.open[i] = !ui.open[i]; render(); }));
    const box = main.querySelector(".pc-items");
    list.forEach((p, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "pe" + (p.collected ? "" : " no"); b.setAttribute("aria-selected", String(sel && p.id === sel.id)); b.style.animationDelay = `${i * 20}ms`;
      const st = d.pets.summoned === p.id ? "Summoned" : p.collected ? "Collected" : "Not collected";
      b.innerHTML = `<span class="th">${p.icon ? `<img alt="" src="${icon(p.icon)}">` : "?"}</span><span><b>${esc(p.name)}</b><small>${st}</small></span><span class="dot ${d.pets.summoned === p.id ? "sum" : p.collected ? "own" : ""}"></span>`;
      b.addEventListener("click", () => { ui.sel = p.id; ui.flip = false; render(); });
      box.append(b);
    });
    if (!list.length) box.innerHTML = `<div class="pc-empty"><span>${col.list.length ? "No match." : `No ${ui.tab} yet.`}</span></div>`;
    const view = main.querySelector(".pc-view");
    if (!sel) { view.innerHTML = `<div class="pc-empty"><b>No ${ui.tab} collected yet</b><span>${ui.tab === "mounts" ? "Earn mounts from raids, the store and referral rewards. Riding training is needed to summon them." : "Pick a pet on the left."}</span></div>`; return; }
    const summoned = d.pets.summoned === sel.id, prev = (opts.preview && opts.preview(sel.id)) || (sel.id === "death-apostle" ? icon("pet-death-apostle-preview").replace(/\.png$/, ".jpg") : sel.icon ? icon(sel.icon) : "");
    view.innerHTML = `<div class="pc-stage">${prev ? `<img alt="${esc(sel.name)}" src="${prev}" class="${ui.flip ? "flip" : ""}">` : `<span class="none">No preview</span>`}
        <div class="rot"><button type="button" aria-label="Turn left">${SVG.left}</button>Turn<button type="button" aria-label="Turn right">${SVG.right}</button></div></div>
      <div class="pc-info"><h3>${esc(sel.name)} <span class="mw-pill" style="--c:${summoned ? "var(--mint)" : sel.collected ? "var(--gold)" : "var(--ink-3)"}">${summoned ? "Summoned" : sel.collected ? "Collected" : "Not collected"}</span></h3>
        <p>${esc(sel.desc)}</p><div class="src"><span>Source</span><span>${esc(sel.source)}</span>${sel.extra ? `<span>Note</span><span>${esc(sel.extra)}</span>` : ""}</div>
        <div class="act">${sel.collected ? `<button type="button" class="mw-btn ${summoned ? "" : "primary"} sum">${summoned ? "Dismiss" : "Summon"}</button>` : `<button type="button" class="mw-btn" disabled>Not collected yet</button>`}</div></div>`;
    view.querySelectorAll(".rot button").forEach((b) => b.addEventListener("click", () => { ui.flip = !ui.flip; view.querySelector(".pc-stage img")?.classList.toggle("flip", ui.flip); }));
    const sb = view.querySelector(".sum");
    sb && sb.addEventListener("click", () => {
      if (summoned) { d.pets.summoned = null; opts.onDismiss && opts.onDismiss(sel); } else { d.pets.summoned = sel.id; opts.onSummon && opts.onSummon(sel); }
      render();
    });
  }
  render();
  const api = { el, get state() { return d; }, update(p) { Object.assign(d, p); render(); return api; }, destroy: () => { hideTip(); el.remove(); } };
  return api;
}

// ------------------------------------------------------------------ achievements
//   data: achievements.json · opts: { icon, onClose, onTitle(title) }
export function createAchievementWindow(container, data, opts = {}) {
  const icon = iconOf(opts);
  const d = structuredClone(data);
  const ui = { cat: "summary", q: "", status: "all" };
  const earned = () => d.list.filter((a) => a.earned);
  const el = shell(container, "ac", opts, `<div class="ac-hd"><img alt="" src="${icon("menu/achievements")}"><div><div class="mw-eyebrow">${esc(d.name)}</div><h2 class="mw-title" style="margin-top:calc(4*var(--u))">Achievements</h2></div></div>`);
  el.querySelector(".mw-head").insertBefore(Object.assign(document.createElement("div"), { className: "ac-pts" }), el.querySelector(".mw-close"));
  const main = el.querySelector(".mw-main");
  const date = (s) => new Date(s + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  function card(a, i) {
    const iconName = a.title ? "lantern" : "menu/achievements";
    return `<div class="mw-card acv${a.earned ? "" : " no"}" style="animation-delay:${i * 25}ms"><div class="ic"><img alt="" src="${icon(iconName)}"></div>
      <div><b>${esc(a.name)}</b><p>${esc(a.desc)}</p><div class="meta">
        ${a.earned ? `<span class="ok-dot">Earned ${date(a.date)}</span>` : a.progress ? `${bar(pct(a.progress[0], a.progress[1]))}<span>${fmt(a.progress[0])} / ${fmt(a.progress[1])}</span>` : "<span>Not earned yet</span>"}
        ${a.title ? `<span class="mw-pill" style="--c:var(--gold)">Title: &lt;${esc(a.title)}&gt;</span>` : ""}</div></div>
      <div class="pts"><b>${a.pts}</b><small>pts</small></div></div>`;
  }
  function render() {
    hideTip();
    const e = earned();
    el.querySelector(".ac-pts").innerHTML = `<b>${e.reduce((n, a) => n + a.pts, 0)}</b><small>achievement points</small>`;
    const cats = d.categories.map(([k, n]) => { const l = d.list.filter((a) => a.cat === k); return { k, n, done: l.filter((a) => a.earned).length, all: l.length }; });
    main.innerHTML = `<div class="ac-body"><nav class="ac-nav" aria-label="Categories">
        <button type="button" data-c="summary" aria-current="${ui.cat === "summary"}">Summary</button>
        <button type="button" data-c="all" aria-current="${ui.cat === "all"}">All achievements<span class="sp"></span><small>${e.length}/${d.list.length}</small></button><hr>
        ${cats.map((c) => `<button type="button" data-c="${c.k}" aria-current="${ui.cat === c.k}">${esc(c.n)}<span class="sp"></span><small class="${c.done === c.all ? "done" : ""}">${c.done}/${c.all}</small></button>`).join("")}</nav>
      <div class="ac-main"><div class="tools"><label class="search">${SVG.search}<input type="search" placeholder="Search achievements" aria-label="Search achievements" value="${esc(ui.q)}"></label>
        <select aria-label="Status"><option value="all">All statuses</option><option value="earned"${ui.status === "earned" ? " selected" : ""}>Earned</option><option value="open"${ui.status === "open" ? " selected" : ""}>Not earned</option></select></div>
        <div class="content"></div></div></div>
      <div class="ac-foot"><label for="ttl" style="font-weight:600">Displayed title</label><select id="ttl" class="mw-sel">${d.titles.map((t) => `<option${t === d.title ? " selected" : ""}>${esc(t)}</option>`).join("")}</select><span class="sp"></span><small>Your title appears beneath your name.</small></div>`;
    main.querySelectorAll(".ac-nav button").forEach((b) => b.addEventListener("click", () => { ui.cat = b.dataset.c; render(); }));
    const inp = main.querySelector(".search input");
    inp.addEventListener("input", () => { ui.q = inp.value.trim().toLowerCase(); if (ui.cat === "summary" && ui.q) ui.cat = "all"; content(); });
    main.querySelector(".tools select").addEventListener("change", (ev) => { ui.status = ev.target.value; if (ui.cat === "summary") ui.cat = "all"; render(); });
    main.querySelector("#ttl").addEventListener("change", (ev) => { d.title = ev.target.value; opts.onTitle && opts.onTitle(d.title); toast(el, `Title: <${d.title}>`); });
    content();
    function content() {
      const box = main.querySelector(".content");
      if (ui.cat === "summary" && !ui.q) {
        const recent = [...e].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
        box.innerHTML = `<div class="mw-card ac-over"><div class="tot"><div class="ring" style="--p:${Math.round(e.length / d.list.length * 100)}"><b>${Math.round(e.length / d.list.length * 100)}%</b></div>
            <div><b style="font-size:calc(17*var(--u))">${e.length} of ${d.list.length} earned</b><div class="mw-muted" style="font-size:calc(12.5*var(--u))">${d.list.length - e.length} left · ${d.list.filter((a) => !a.earned).reduce((n, a) => n + a.pts, 0)} points to go</div></div></div>
          <div class="cats">${cats.map((c) => `<div class="cat" data-c="${c.k}"><div class="row"><span>${esc(c.n)}</span><b>${c.done} / ${c.all}</b></div>${bar(pct(c.done, c.all), c.done === c.all ? "gold" : "")}</div>`).join("")}</div></div>
          <h4 style="margin:calc(4*var(--u)) 0 0;font:700 calc(11*var(--u))/1 var(--font);letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)">Recent</h4>
          <div class="ac-list">${recent.map(card).join("")}</div>`;
        box.querySelectorAll(".cat").forEach((c) => c.addEventListener("click", () => { ui.cat = c.dataset.c; render(); }));
        return;
      }
      const list = d.list.filter((a) => (ui.cat === "all" || ui.cat === "summary" || a.cat === ui.cat) && (!ui.q || (a.name + a.desc).toLowerCase().includes(ui.q))
        && (ui.status === "all" || (ui.status === "earned") === a.earned)).sort((a, b) => (b.earned - a.earned) || (b.progress ? b.progress[0] / b.progress[1] : 0) - (a.progress ? a.progress[0] / a.progress[1] : 0));
      box.innerHTML = `<div class="ac-list">${list.map(card).join("") || `<div class="fr-empty">No achievements match.</div>`}</div>`;
    }
  }
  render();
  const api = { el, get state() { return d; }, update(p) { Object.assign(d, p); render(); return api; }, destroy: () => { hideTip(); el.remove(); } };
  return api;
}

// ------------------------------------------------------------------ friends
//   data: friends.json · opts: { icon, onClose, onWhisper(name), onInvite(name), onRemove(name), onRequest(name), onAccept(name), onDungeons() }
const ICO = {
  chat: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 3h10v7H7l-3 3v-3H3z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  plus: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  party: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="6" cy="5.5" r="2.3" stroke="currentColor" stroke-width="1.5"/><path d="M2 13c.5-2.3 2-3.5 4-3.5s3.5 1.2 4 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M12 5v4M10 7h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  x: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  ok: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8.5l3 3 7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};
export function createFriendsWindow(container, data, opts = {}) {
  const icon = iconOf(opts);
  const d = structuredClone(data);
  const ui = { tab: "friends", sel: null, q: "", sure: null };
  const el = shell(container, "fr", opts, `<div class="ac-hd"><img alt="" src="${icon("menu/friends")}" style="width:calc(44*var(--u));height:calc(44*var(--u))"><div><h2 class="mw-title" style="margin:0">Friends</h2><div class="mw-sub sub"></div></div></div>`);
  const main = el.querySelector(".mw-main");
  const clsIcon = (c) => icon({ Ranger: "class-ranger", Knight: "menu/character", Mage: "menu/spellbook", Cleric: "menu/talents" }[c] || "menu/profile");
  function row(p, i, kind) {
    const acts = {
      friends: [["chat", "Whisper"], ["party", "Invite to party"], ["x", ui.sure === p.name ? "Click again to remove" : "Remove"]],
      who: [["plus", "Add friend"], ["chat", "Whisper"], ["party", "Invite to party"]],
      requests: [["ok", "Accept"], ["x", "Decline"]], ignore: [["x", "Unignore"]] }[kind];
    return `<div class="fp ${p.online ? "on" : "off"}" role="option" tabindex="0" data-n="${esc(p.name)}" aria-selected="${ui.sel === p.name}" style="animation-delay:${i * 25}ms">
      <span class="av"><img alt="" src="${clsIcon(p.cls)}"></span><span><b>${esc(p.name)}</b><small>Lv ${p.level} ${esc(p.cls)} · ${p.online ? `<span class="where">${esc(p.where || "Online")}</span>` : `last seen ${esc(p.seen || "a while ago")}`}</small></span>
      <span class="acts">${acts.map(([k, t]) => `<button type="button" data-a="${k}" aria-label="${t}" title="${t}"${k === "x" && ui.sure === p.name ? ' style="color:var(--red)"' : ""}>${ICO[k]}</button>`).join("")}</span></div>`;
  }
  function render() {
    hideTip();
    const f = d.friends, on = f.filter((p) => p.online);
    el.querySelector(".sub").textContent = `${on.length} online · ${f.length} friends`;
    const tabs = [["friends", "Friends", f.length], ["who", "Who", d.who.length], ["requests", "Requests", d.requests.length], ["ignore", "Ignore", d.ignore.length]];
    const list = d[ui.tab].filter((p) => !ui.q || p.name.toLowerCase().includes(ui.q.toLowerCase()));
    let body;
    if (ui.tab === "friends") {
      const a = list.filter((p) => p.online), b = list.filter((p) => !p.online);
      body = (a.length ? `<div class="fr-grp">Online · ${a.length}</div>${a.map((p, i) => row(p, i, "friends")).join("")}` : "") + (b.length ? `<div class="fr-grp">Offline · ${b.length}</div>${b.map((p, i) => row(p, i + a.length, "friends")).join("")}` : "");
    } else body = list.map((p, i) => row(p, i, ui.tab)).join("");
    main.innerHTML = `<div class="mw-tabs" role="tablist">${tabs.map(([k, n, c]) => `<button type="button" role="tab" class="mw-tab" data-t="${k}" aria-selected="${ui.tab === k}">${n}<span class="n${k === "requests" && c ? " hot" : ""}">${c}</span></button>`).join("")}</div>
      <div class="tools"><label class="search">${SVG.search}<input type="search" placeholder="Search ${ui.tab === "who" ? "players nearby" : "names"}" aria-label="Search" value="${esc(ui.q)}"></label></div>
      <div class="fr-list" role="listbox" aria-label="${tabs.find((t) => t[0] === ui.tab)[1]}">${body || `<div class="fr-empty">${{ friends: "No friends yet. Add someone below.", who: "Nobody around.", requests: "No friend requests.", ignore: "You're not ignoring anyone." }[ui.tab]}</div>`}</div>
      ${ui.tab === "who" ? `<div class="fr-foot"><span class="hint">Hover an adventurer to whisper, invite them to a party or add them as a friend.</span>
        <button type="button" class="mw-btn gold dungeons"><img alt="" src="${icon("menu/raid")}">Dungeons</button></div>` : ""}
      <div class="fr-add"><label for="frn">Send a friend request</label><div class="row"><input id="frn" type="text" placeholder="Character name" autocomplete="off"><button type="button" class="mw-btn primary send">Send</button></div></div>`;
    main.querySelectorAll(".mw-tab").forEach((b) => b.addEventListener("click", () => { ui.tab = b.dataset.t; ui.sel = null; ui.q = ""; render(); }));
    const s = main.querySelector(".search input");
    s.addEventListener("input", () => { ui.q = s.value; const pos = s.selectionStart; render(); const n = main.querySelector(".search input"); n.focus(); n.setSelectionRange(pos, pos); });
    main.querySelectorAll(".fp").forEach((r) => {
      r.addEventListener("click", (e) => {
        const name = r.dataset.n, a = e.target.closest("button")?.dataset.a;
        if (!a) { ui.sel = ui.sel === name ? null : name; ui.sure = null; render(); return; }
        const p = d[ui.tab].find((x) => x.name === name);
        if (a === "chat") { opts.onWhisper && opts.onWhisper(name); toast(el, `Whisper to ${name}`); }
        if (a === "party") { opts.onInvite && opts.onInvite(name); toast(el, `Invited ${name} to your party`); }
        if (a === "plus") { opts.onRequest && opts.onRequest(name); toast(el, `Friend request sent to ${name}`); }
        if (a === "ok") { d.requests.splice(d.requests.indexOf(p), 1); d.friends.push(p); opts.onAccept && opts.onAccept(name); render(); }
        if (a === "x") {
          if (ui.tab === "friends" && ui.sure !== name) { ui.sure = name; render(); return; }
          d[ui.tab].splice(d[ui.tab].indexOf(p), 1); ui.sure = null; opts.onRemove && opts.onRemove(name, ui.tab); render();
        }
      });
      r.addEventListener("keydown", (e) => { if (e.key === "Enter") r.click(); });
    });
    const inp = main.querySelector("#frn"), send = () => { const n = inp.value.trim(); if (!n) return; opts.onRequest && opts.onRequest(n); toast(el, `Friend request sent to ${n}`); inp.value = ""; };
    main.querySelector(".send").addEventListener("click", send);
    const dg = main.querySelector(".dungeons"); dg && dg.addEventListener("click", () => opts.onDungeons && opts.onDungeons());
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
  }
  render();
  const api = { el, get state() { return d; }, update(p) { Object.assign(d, p); render(); return api; }, destroy: () => { hideTip(); el.remove(); } };
  return api;
}

// ------------------------------------------------------------------ referral rewards
//   data: referrals.json · opts: { icon, onClose, onCopy(link), onRefresh() }
const ART = {
  horse: `<svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true"><path d="M44 8c-3 2-4 5-4 5l-9 3c-7 3-12 9-13 16l-1 6-6 5 2 4 7-3 3-6 3 1-2 13h5l3-12 8-2 2 14h5l1-16c3-3 4-7 3-11l2-3 3 5 4-2-2-8-4-5c0-3-1-5-3-7z"/></svg>`,
  wolf: `<svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true"><path d="M14 10l6 10 8-2h8l8 2 6-10 2 16-4 6 2 10-8 12H22l-8-12 2-10-4-6z"/><circle cx="25" cy="30" r="2.5" fill="#1a0f08"/><circle cx="39" cy="30" r="2.5" fill="#1a0f08"/></svg>`,
  wing: `<svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true"><path d="M32 40c-4-12-14-20-28-22 3 8 7 13 12 16-4 0-7 2-9 4 7 2 13 1 17-2-1 5-1 9 1 13 4-3 6-6 7-9zm0 0c4-12 14-20 28-22-3 8-7 13-12 16 4 0 7 2 9 4-7 2-13 1-17-2 1 5 1 9-1 13-4-3-6-6-7-9z"/></svg>`,
  fox: `<svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true"><path d="M12 8l10 12h20l10-12 2 20-6 12-14 10-14-10-6-12z"/><circle cx="25" cy="30" r="2.5" fill="#1a0f08"/><circle cx="39" cy="30" r="2.5" fill="#1a0f08"/></svg>`,
  stag: `<svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true"><path d="M20 6l2 8-6-4 3 8 6 4 3 6-4 10 2 20h5l1-14h4l1 14h5l2-20-4-10 3-6 6-4 3-8-6 4 2-8-5 8-5 4h-8l-5-4z"/></svg>`,
  sprite: `<svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true"><circle cx="32" cy="34" r="9"/><path d="M32 30C24 16 10 14 6 20c6 2 12 8 18 12M32 30c8-14 22-16 26-10-6 2-12 8-18 12" opacity=".7"/><circle cx="32" cy="34" r="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 5"/></svg>`,
  coins: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="currentColor"><ellipse cx="26" cy="44" rx="16" ry="6"/><rect x="10" y="30" width="32" height="14"/><ellipse cx="26" cy="30" rx="16" ry="6" fill="#ffe08a"/><ellipse cx="42" cy="36" rx="14" ry="5"/><rect x="28" y="24" width="28" height="12"/><ellipse cx="42" cy="24" rx="14" ry="5" fill="#ffe08a"/></g></svg>`,
  house: `<svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true"><path d="M32 8L6 30h6v26h16V42h8v14h16V30h6z"/><rect x="18" y="34" width="7" height="7" fill="#13201a"/><rect x="39" y="34" width="7" height="7" fill="#13201a"/><path d="M44 14h6v10l-6-5z"/></svg>`,
};
export function createReferralWindow(container, data, opts = {}) {
  const icon = iconOf(opts);
  const d = structuredClone(data);
  const ui = { open: false };
  const el = shell(container, "rf", opts, `<div class="ac-hd"><img alt="" src="${icon("menu/referrals")}" style="width:calc(44*var(--u));height:calc(44*var(--u))"><div><h2 class="mw-title" style="margin:0">Referral rewards</h2><div class="mw-sub sub"></div></div></div>`);
  const main = el.querySelector(".mw-main");
  function render() {
    hideTip();
    const q = d.qualified, next = d.tiers.find((t) => t.need > q), prev = [...d.tiers].reverse().find((t) => t.need <= q);
    el.querySelector(".sub").textContent = `${q} qualified referral${q === 1 ? "" : "s"} · ${d.share.toFixed(2)}% of their purchases`;
    main.innerHTML = `<div class="rf-sum">
        <div class="mw-card"><span class="lab">Your referrals</span><b class="big">${q}</b><small>${prev ? `Tier ${d.tiers.indexOf(prev) + 1} unlocked: ${esc(prev.name)}` : "Your first referral unlocks tier 1"}</small></div>
        <div class="mw-card"><span class="lab">Next unlock</span><b style="font-size:calc(17*var(--u))">${next ? esc(next.name) : "All tiers unlocked"}</b>${next ? `${bar(pct(q, next.need), "gold")}<small>${next.need - q} more to unlock · ${q} / ${next.need}</small>` : ""}</div></div>
      <div class="tiers">${d.tiers.map((t, i) => {
        const done = q >= t.need, isNext = t === next, art = t.kind === "pet" ? "sprite" : t.kind === "mount" ? "stag" : "coins";
        const c = t.kind === "pet" ? "#8fe0b0" : t.kind === "mount" ? "#e0c290" : "var(--gold)";
        return `<div class="mw-card tier${done ? " done" : isNext ? " next" : " locked"}" style="animation-delay:${i * 50}ms"><div class="n"><b>${t.need}</b><small>referral${t.need === 1 ? "" : "s"}</small></div>
          <div class="rw" style="--c:${c}">${ART[art]}</div>
          <div><h3>${esc(t.name)} ${done ? '<span class="mw-pill">Unlocked</span>' : t.kind !== "moss" ? `<span class="mw-pill" style="--c:${c}">${t.kind === "pet" ? "Account pet" : "Mount"}</span>` : ""}</h3><p>${esc(t.desc)}</p>
            <div class="row">${bar(pct(q, t.need), done ? "" : "gold")}<span class="mw-num">${Math.min(q, t.need)} / ${t.need}</span></div></div></div>`; }).join("")}</div>
      <div class="mw-card wallet"><span>Payout wallet</span><code>${esc(d.wallet)}</code>${d.active ? '<span class="ok-dot">MOSS rewards active</span>' : ""}<span class="sp"></span><small class="mw-muted">${esc(d.payout)}</small></div>
      <div class="mw-card rf-link"><span class="lab" style="font:700 calc(10.5*var(--u))/1 var(--font);letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)">Your invite link</span>
        <div class="row"><code>${esc(d.link)}</code><button type="button" class="mw-btn primary copy">Copy link</button><button type="button" class="mw-btn refresh" aria-label="Refresh progress">↻</button></div>
        <small>Share it with friends. They count once they qualify.</small></div>
      <div class="mw-card acc" data-open="${ui.open}" style="margin-top:calc(10*var(--u))"><button type="button" aria-expanded="${ui.open}">Qualification and reward rules<span class="sp"></span>${SVG.chev}</button><div class="in"><ul class="ic-rules">${d.rules.map((r, i) => `<li><i>${i + 1}</i><span>${esc(r)}</span></li>`).join("")}</ul></div></div>`;
    main.querySelector(".copy").addEventListener("click", async () => { try { await navigator.clipboard.writeText(d.link); } catch (e) {} opts.onCopy && opts.onCopy(d.link); toast(el, "Invite link copied"); });
    main.querySelector(".refresh").addEventListener("click", () => { opts.onRefresh && opts.onRefresh(); toast(el, "Progress refreshed"); });
    main.querySelector(".acc > button").addEventListener("click", () => { ui.open = !ui.open; render(); });
  }
  render();
  const api = { el, get state() { return d; }, update(p) { Object.assign(d, p); render(); return api; }, destroy: () => { hideTip(); el.remove(); } };
  return api;
}

// ------------------------------------------------------------------ in-game store
//   data: store.json · opts: { icon, onClose, onBuy(item), onLinkWallet(), quote(item) -> Promise<number MOSS> }
export function createStoreWindow(container, data, opts = {}) {
  const icon = iconOf(opts);
  const d = structuredClone(data);
  const ui = { cat: "all", sel: d.items[0].id, busy: false };
  const el = shell(container, "st", opts, `<div class="ac-hd"><img alt="" src="${icon("menu/store")}" style="width:calc(44*var(--u));height:calc(44*var(--u))"><div><h2 class="mw-title" style="margin:0">In-game store</h2><div class="mw-sub">Boost your adventures. Collect companions.</div></div></div>`);
  const main = el.querySelector(".mw-main");
  const artOf = (it) => (ART[it.art] ? ART[it.art] : `<img alt="" src="${icon(it.art)}">`);
  const price = (it) => (it.cur === "usd" ? `<span class="price moss">$${it.price} <span>of MOSS</span></span>` : `<span class="price">${fmt(it.price)} <span>gold</span></span>`);
  function render() {
    hideTip();
    const list = d.items.filter((i) => ui.cat === "all" || i.cat === ui.cat), sel = d.items.find((i) => i.id === ui.sel) || list[0];
    main.innerHTML = `<div class="st-body"><nav class="st-nav" aria-label="Categories">${d.categories.map(([k, n, ic]) => `<button type="button" data-c="${k}" aria-current="${ui.cat === k}"><img alt="" src="${icon(ic)}">${esc(n)}<small>${k === "all" ? d.items.length : d.items.filter((i) => i.cat === k).length}</small></button>`).join("")}
        <div class="mw-card bal"><span>Your balance</span><span class="mw-chip"><img alt="" src="${icon("coin-gold")}">${fmt(d.gold)}</span><span class="mw-chip"><img alt="" src="${icon("coin-moss")}">${fmt(Math.floor(d.moss))} MOSS</span></div></nav>
      <div class="st-main"><div class="row"><h3>${ui.cat === "all" ? esc(d.collection) : esc(d.categories.find((c) => c[0] === ui.cat)[1])}</h3><small>${list.length} item${list.length === 1 ? "" : "s"}</small><span style="flex:1"></span>
        ${d.walletLinked ? '<span class="ok-dot">Wallet linked</span>' : '<button type="button" class="mw-btn ghost link">Link wallet for exact MOSS prices</button>'}</div>
        <div class="st-grid">${list.map((it, i) => `<button type="button" class="si" data-id="${it.id}" aria-pressed="${sel && it.id === sel.id}" style="--c:${it.color};animation-delay:${i * 30}ms">
          ${it.ready ? `<span class="badge mw-pill" style="--c:var(--mint)">${it.ready} ready</span>` : ""}<span class="art">${artOf(it)}</span><b>${esc(it.name)}</b><small>${esc(it.sub)}</small>${price(it)}</button>`).join("") || `<div class="st-empty">Nothing here yet. Check back soon.</div>`}</div></div></div>
      ${sel ? `<div class="mw-card st-buy" style="--c:${sel.color}"><div class="art">${artOf(sel)}</div><div><h3>${esc(sel.name)}</h3><p>${esc(sel.desc)}</p>
        <div class="req"><span class="mw-chip">For Benjooie</span>${sel.req.map((r) => `<span class="mw-chip">${esc(r)}</span>`).join("")}${sel.ready ? `<span class="mw-chip" style="color:var(--mint)">${sel.ready} ready to use</span>` : ""}</div></div>
        <div class="pay"><b class="${sel.cur === "usd" ? "moss" : ""}">${sel.cur === "usd" ? `$${sel.price} <span style="font-size:.55em;color:var(--ink-3)">of MOSS</span>` : `${fmt(sel.price)} gold`}</b>
          <button type="button" class="mw-btn ${sel.cur === "usd" ? "primary" : "gold"} buy"${ui.busy ? " disabled" : ""}>${ui.busy ? "Getting quote…" : sel.cur === "usd" ? (d.walletLinked ? "Buy with MOSS" : "Link wallet to buy") : d.gold >= sel.price ? "Buy" : "Not enough gold"}</button>
          <small>${sel.cur === "usd" ? "The exact MOSS amount is shown before you confirm." : `You have ${fmt(d.gold)} gold.`}</small></div></div>` : ""}`;
    main.querySelectorAll(".st-nav button").forEach((b) => b.addEventListener("click", () => { ui.cat = b.dataset.c; const f = d.items.find((i) => ui.cat === "all" || i.cat === ui.cat); ui.sel = f ? f.id : null; render(); }));
    main.querySelectorAll(".si").forEach((b) => b.addEventListener("click", () => { ui.sel = b.dataset.id; render(); }));
    const lk = main.querySelector(".link"); lk && lk.addEventListener("click", () => { d.walletLinked = true; opts.onLinkWallet && opts.onLinkWallet(); toast(el, "Wallet linked"); render(); });
    const buy = main.querySelector(".buy");
    buy && buy.addEventListener("click", async () => {
      if (sel.cur === "usd" && !d.walletLinked) { d.walletLinked = true; toast(el, "Wallet linked"); render(); return; }
      if (sel.cur === "gold") { if (d.gold < sel.price) return; d.gold -= sel.price; opts.onBuy && opts.onBuy(sel); toast(el, `Bought ${sel.name}`); render(); return; }
      ui.busy = true; render();
      const moss = opts.quote ? await opts.quote(sel) : await new Promise((r) => setTimeout(() => r(sel.price * 12.5), 700));
      ui.busy = false; render();
      toast(el, `${sel.name}: ${fmt(moss)} MOSS · confirm in your wallet`); opts.onBuy && opts.onBuy(sel, moss);
    });
  }
  render();
  const api = { el, get state() { return d; }, update(p) { Object.assign(d, p); render(); return api; }, destroy: () => { hideTip(); el.remove(); } };
  return api;
}

// ------------------------------------------------------------------ NFTs: pets, mounts & houses
//   data: nfts.json · opts: { icon, onClose, onLink(), onRefresh(), onBid(house, moss), deedArt(i) -> url }
export function createNftWindow(container, data, opts = {}) {
  const icon = iconOf(opts);
  const d = structuredClone(data);
  const ui = { tab: "houses", bids: {} };
  const el = shell(container, "nf", opts, `<div class="ac-hd"><img alt="" src="${icon("menu/nfts")}" style="width:calc(44*var(--u));height:calc(44*var(--u))"><div><div class="mw-eyebrow">Wallet collections</div><h2 class="mw-title" style="margin-top:calc(4*var(--u))">Pets, mounts &amp; houses</h2></div></div>`);
  const main = el.querySelector(".mw-main");
  function render() {
    hideTip();
    const a = d.auction;
    main.innerHTML = `<div class="mw-card nf-wallet"><div class="top"><span class="mw-muted">Linked wallet</span><code>${esc(d.wallet)}</code>${d.verified ? '<span class="ok-dot">Ownership verified</span>' : '<span class="mw-pill" style="--c:var(--gold)">Not verified</span>'}</div>
        <div class="btns"><button type="button" class="mw-btn link">Change wallet</button><button type="button" class="mw-btn primary refresh">Refresh ownership</button></div>
        <small>Balance ${fmt(d.moss)} MOSS · outbid funds ${fmt(d.outbid)} MOSS</small></div>
      <div class="nf-facts">${d.facts.map(([t, x]) => `<div class="mw-card"><b>${esc(t)}</b>${esc(x)}</div>`).join("")}</div>
      <div class="mw-tabs" role="tablist">${[["houses", "Houses", d.houses.length], ["pets", "Pets", d.pets.length], ["mounts", "Mounts", d.mounts.length]].map(([k, n, c]) => `<button type="button" role="tab" class="mw-tab" data-t="${k}" aria-selected="${ui.tab === k}">${n}<span class="n">${c}</span></button>`).join("")}</div>
      <div class="body"></div>`;
    const body = main.querySelector(".body");
    if (ui.tab === "houses") {
      body.innerHTML = `<div class="mw-card auc"><div><h3>${esc(a.title)} <span class="mw-pill" style="--c:${a.opened ? "var(--mint)" : "var(--gold)"}">${a.hours}-hour auction · ${a.opened ? "open" : "not opened yet"}</span></h3><p>${esc(a.text)}</p></div>
          <div class="t"><b>$${a.reserveUsd}</b><small>opening reserve per house<br>paid in MOSS</small></div>
          <div class="bal"><span>${esc(a.where)}</span><span class="sp"></span><button type="button" class="mw-btn ghost wd"${d.outbid ? "" : " disabled"}>Withdraw ${fmt(d.outbid)} MOSS</button></div></div>
        <div class="deeds">${d.houses.map((h, i) => `<div class="mw-card deed" style="animation-delay:${i * 50}ms"><div class="art">${opts.deedArt ? `<img alt="" src="${opts.deedArt(i)}">` : ART.house}<span class="no">DEED ${i + 1}</span></div>
          <div><b>${esc(h.name)}</b><small>${esc(h.state)} · ${h.bids ? `${h.bids} bids · top ${fmt(h.top)} MOSS` : "no bids yet"}</small></div>
          <div class="bid"><input type="number" min="0" placeholder="MOSS" aria-label="Your bid for ${esc(h.name)}" data-i="${i}" value="${ui.bids[i] ?? ""}"${a.opened ? "" : " disabled"}><button type="button" class="mw-btn ${a.opened ? "primary" : ""} bid-b" data-i="${i}"${a.opened ? "" : " disabled"}>${a.opened ? "Bid" : "Opens soon"}</button></div></div>`).join("")}</div>`;
      body.querySelectorAll(".deed input").forEach((i) => i.addEventListener("input", () => (ui.bids[i.dataset.i] = i.value)));
      body.querySelectorAll(".bid-b").forEach((b) => b.addEventListener("click", () => { const v = Number(ui.bids[b.dataset.i]) || 0; if (!v) return; opts.onBid && opts.onBid(d.houses[b.dataset.i], v); toast(el, `Review bid: ${fmt(v)} MOSS`); }));
    } else {
      const list = d[ui.tab];
      body.innerHTML = list.length ? `<div class="nf-own">${list.map((p) => `<div class="mw-card"><img alt="" src="${icon(p.icon)}"><div><b>${esc(p.name)}</b><small>${esc(p.note)}</small></div></div>`).join("")}</div>`
        : `<div class="mw-card pc-empty"><b>No ${ui.tab} NFTs in this wallet</b><span>Buy or receive one, then press Refresh ownership.</span></div>`;
    }
    main.querySelectorAll(".mw-tab").forEach((b) => b.addEventListener("click", () => { ui.tab = b.dataset.t; render(); }));
    main.querySelector(".refresh").addEventListener("click", () => { opts.onRefresh && opts.onRefresh(); toast(el, "Ownership refreshed"); });
    main.querySelector(".link").addEventListener("click", () => opts.onLink && opts.onLink());
  }
  render();
  const api = { el, get state() { return d; }, update(p) { Object.assign(d, p); render(); return api; }, destroy: () => { hideTip(); el.remove(); } };
  return api;
}

// ------------------------------------------------------------------ wallet (receive, send, NFTs, activity, security)
//   data: wallet.json · opts: { icon, onClose, onRefresh(), onSend({ sym, to, amount }), onRecover(), onOpenNfts(tab), nfts: { houses, pets, mounts } }
//   Amounts are strings (18 decimals); the window never rounds what you send.
export function createWalletWindow(container, data, opts = {}) {
  const icon = iconOf(opts);
  const d = structuredClone(data);
  const ui = { tab: "receive", sym: d.balances[0].sym, to: "", amount: "", review: false, open: false };
  const el = shell(container, "wl", opts, `<div class="mw-eyebrow wl-net"><span class="ok-dot">${esc(d.network)}</span></div><h2 class="mw-title">Mossvale wallet</h2>`);
  const main = el.querySelector(".mw-main");
  const short = (a) => a.slice(0, 6) + "…" + a.slice(-4);
  const bal = (s) => d.balances.find((b) => b.sym === s);
  const pretty = (a, dp = 4) => { const [i, f = ""] = String(a).split("."); return Number(i).toLocaleString("en-US") + (f && +f ? "." + f.slice(0, dp).replace(/0+$/, "") : ""); };
  const validAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(a);
  const cmp = (a, b) => { const p = (x) => { const [i, f = ""] = String(x).split("."); return BigInt(i || "0") * 10n ** 18n + BigInt((f + "0".repeat(18)).slice(0, 18) || "0"); }; return p(a) > p(b) ? 1 : p(a) < p(b) ? -1 : 0; };
  function render() {
    hideTip();
    const moss = bal("MOSS"), eth = bal("ETH");
    main.innerHTML = `<div class="wl-bal">
        <div class="mw-card"><span class="lab"><img alt="" src="${icon("coin-moss")}">MOSS</span><b>${pretty(moss.amount)}</b><span class="full" title="Exact balance">${esc(moss.amount)}</span></div>
        <div class="mw-card"><span class="lab">ETH</span><b>${pretty(eth.amount)}</b><span class="full">for network fees</span></div></div>
      <div class="mw-tabs" role="tablist">${[["receive", "Receive"], ["send", "Send"], ["nfts", "NFTs"], ["activity", "Activity"], ["security", "Security"]].map(([k, n]) => `<button type="button" role="tab" class="mw-tab" data-t="${k}" aria-selected="${ui.tab === k}">${n}</button>`).join("")}</div>
      <div class="wl-pane"></div>`;
    main.querySelectorAll(".mw-tab").forEach((b) => b.addEventListener("click", () => { ui.tab = b.dataset.t; ui.review = false; render(); }));
    const pane = main.querySelector(".wl-pane");
    if (ui.tab === "receive") {
      const a = d.address;
      pane.innerHTML = `<div class="wl-warn">⚠︎<span>${esc(d.note)}</span></div>
        <div class="mw-card wl-addr"><span class="mw-muted" style="font-size:calc(12*var(--u))">Your address</span><code><span class="hl">${esc(a.slice(0, 6))}</span>${esc(a.slice(6, -4))}<span class="hl">${esc(a.slice(-4))}</span></code>
          <div class="row"><button type="button" class="mw-btn primary copy">Copy address</button><button type="button" class="mw-btn refresh">↻ Refresh balances</button></div></div>
        <div class="mw-card acc" data-open="${ui.open}"><button type="button" aria-expanded="${ui.open}">Recover old auction proceeds<span class="sp"></span>${SVG.chev}</button>
          <div class="in"><span class="mw-muted" style="font-size:calc(12.5*var(--u))">${esc(d.recover.text)}</span><button type="button" class="mw-btn recover"${cmp(d.recover.amount, "0") > 0 ? "" : " disabled"}>Recover ${pretty(d.recover.amount)} MOSS</button></div></div>`;
      pane.querySelector(".copy").addEventListener("click", async () => { try { await navigator.clipboard.writeText(a); } catch (e) {} toast(el, "Address copied"); });
      pane.querySelector(".refresh").addEventListener("click", () => { opts.onRefresh && opts.onRefresh(); toast(el, "Balances refreshed"); });
      pane.querySelector(".acc > button").addEventListener("click", () => { ui.open = !ui.open; render(); });
      pane.querySelector(".recover").addEventListener("click", () => opts.onRecover && opts.onRecover());
    } else if (ui.tab === "send") {
      const b = bal(ui.sym), addrOk = validAddr(ui.to), self = ui.to.toLowerCase() === d.address.toLowerCase();
      const amtOk = /^\d+(\.\d{1,18})?$/.test(ui.amount) && cmp(ui.amount, "0") > 0, enough = amtOk && cmp(ui.amount, b.amount) <= 0;
      const ready = addrOk && !self && amtOk && enough;
      if (ui.review && ready) {
        pane.innerHTML = `<div class="mw-card wl-review"><span>You send</span><span class="big">${esc(ui.amount)} ${esc(ui.sym)}</span><span>To</span><span>${esc(ui.to)}</span>
            <span>Network</span><span>${esc(d.network)}</span><span>Network fee</span><span>${esc(d.fee.ETH)} (paid in ETH)</span><span>Balance after</span><span>${esc(ui.sym)} ${pretty(b.amount)} − ${esc(ui.amount)}</span></div>
          <div class="wl-warn">⚠︎<span>Transfers can't be undone. Check the address: only send to wallets on ${esc(d.network)}.</span></div>
          <div style="display:flex;gap:calc(8*var(--u))"><button type="button" class="mw-btn back">Back</button><button type="button" class="mw-btn primary confirm" style="flex:1">Confirm and send</button></div>`;
        pane.querySelector(".back").addEventListener("click", () => { ui.review = false; render(); });
        pane.querySelector(".confirm").addEventListener("click", () => { opts.onSend && opts.onSend({ sym: ui.sym, to: ui.to, amount: ui.amount }); toast(el, `Sent ${ui.amount} ${ui.sym} to ${short(ui.to)}`); ui.review = false; ui.amount = ""; render(); });
        return;
      }
      pane.innerHTML = `<div class="wl-form">
          <div class="seg2" role="group" aria-label="Asset">${d.balances.map((x) => `<button type="button" data-s="${x.sym}" aria-pressed="${x.sym === ui.sym}">${x.sym}</button>`).join("")}</div>
          <label>Recipient address<span class="in${ui.to && (!addrOk || self) ? " bad" : ""}"><input class="mono to" placeholder="0x…" value="${esc(ui.to)}" spellcheck="false" autocomplete="off"><button type="button" class="paste">Paste</button></span>
            <span class="hint${ui.to && (!addrOk || self) ? " err" : ""}">${!ui.to ? `Only addresses on ${esc(d.network)}.` : self ? "That's your own address." : addrOk ? "✓ Valid address" : "An address starts with 0x and has 40 more characters."}</span></label>
          <label>Amount<span class="in${ui.amount && (!amtOk || !enough) ? " bad" : ""}"><input class="amt" inputmode="decimal" placeholder="0.0" value="${esc(ui.amount)}"><span class="mw-muted">${esc(ui.sym)}</span><button type="button" class="max">Max</button></span>
            <span class="hint${ui.amount && (!amtOk || !enough) ? " err" : ""}">${ui.amount && !amtOk ? "Enter a number." : ui.amount && !enough ? `You have ${pretty(b.amount)} ${esc(ui.sym)}.` : `Available: ${pretty(b.amount)} ${esc(ui.sym)} · fee ${esc(d.fee.ETH)}`}</span></label>
          <button type="button" class="mw-btn primary review"${ready ? "" : " disabled"}>Review transfer</button></div>`;
      pane.querySelectorAll(".seg2 button").forEach((x) => x.addEventListener("click", () => { ui.sym = x.dataset.s; render(); }));
      const keep = (sel, key) => { const i = pane.querySelector(sel); i.addEventListener("input", () => { ui[key] = i.value.trim(); const p = i.selectionStart; render(); const n = main.querySelector(sel); n.focus(); n.setSelectionRange(p, p); }); };
      keep(".to", "to"); keep(".amt", "amount");
      pane.querySelector(".paste").addEventListener("click", async () => { try { ui.to = (await navigator.clipboard.readText()).trim(); render(); } catch (e) { toast(el, "Paste with Ctrl+V"); } });
      pane.querySelector(".max").addEventListener("click", () => { ui.amount = b.amount.replace(/\.?0+$/, "") || "0"; render(); });
      pane.querySelector(".review").addEventListener("click", () => { ui.review = true; render(); });
    } else if (ui.tab === "nfts") {
      const n = opts.nfts || { houses: 0, pets: 0, mounts: 0 };
      pane.innerHTML = `<div class="nf-facts" style="margin:0">${[["houses", "Houses"], ["pets", "Pets"], ["mounts", "Mounts"]].map(([k, t]) => `<button type="button" class="mw-card" data-k="${k}" style="cursor:pointer;border:0;color:inherit;text-align:left"><b style="font-size:calc(24*var(--u))">${n[k] || 0}</b>${t} in this wallet</button>`).join("")}</div>
        <span class="mw-muted" style="font-size:calc(12.5*var(--u))">Pets, mounts and houses follow the NFT: selling or sending one moves its rights to the new owner.</span>
        <button type="button" class="mw-btn primary open">Open pets, mounts &amp; houses</button>`;
      pane.querySelectorAll("[data-k]").forEach((x) => x.addEventListener("click", () => opts.onOpenNfts && opts.onOpenNfts(x.dataset.k)));
      pane.querySelector(".open").addEventListener("click", () => opts.onOpenNfts && opts.onOpenNfts("houses"));
    } else if (ui.tab === "activity") {
      pane.innerHTML = `<div class="wl-list">${d.activity.map((t, i) => `<div class="mw-card tx ${t.kind}" style="animation-delay:${i * 40}ms"><i>${t.kind === "in" ? "↓" : "↑"}</i><div><b>${esc(t.what)}</b><small>${esc(t.when)}${t.sample ? " · sample" : ""}</small></div><span class="amt">${esc(t.amount)}</span></div>`).join("") || '<div class="fr-empty">No activity yet.</div>'}</div>`;
    } else {
      const s = d.security;
      pane.innerHTML = `<div class="mw-card sw"><div><b>Auto-lock</b><small>Ask for your wallet password again after being away.</small></div>
          <select aria-label="Auto-lock">${[5, 15, 30, 60].map((m) => `<option value="${m}"${m === s.autoLock ? " selected" : ""}>${m} min</option>`).join("")}</select></div>
        <div class="mw-card sw"><div><b>Signed-in devices</b><small>${s.sessions.map((x) => `${esc(x.device)} · ${esc(x.where)}`).join("<br>")}</small></div><button type="button" class="mw-btn danger ghost signout">Sign out others</button></div>
        <div class="wl-warn">⚠︎<span>Mossvale staff will never ask for your recovery phrase or private key. Never type them into chat or a website.</span></div>`;
      pane.querySelector("select").addEventListener("change", (e) => { s.autoLock = +e.target.value; toast(el, `Auto-lock after ${s.autoLock} min`); });
      pane.querySelector(".signout").addEventListener("click", () => { s.sessions = s.sessions.filter((x) => x.current); toast(el, "Other devices signed out"); render(); });
    }
  }
  render();
  const api = { el, get state() { return d; }, update(p) { Object.assign(d, p); render(); return api; }, destroy: () => { hideTip(); el.remove(); } };
  return api;
}

// ------------------------------------------------------------------ dungeons (Moss Gate)
//   data: dungeons.json · opts: { icon, onClose, onFindGate(d), onFindStone(d), onParty(), party: n, playerLevel }
const GATE = `<svg viewBox="0 0 96 96" fill="none" aria-hidden="true"><path d="M18 88V42a30 30 0 0 1 60 0v46" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>
  <path d="M30 88V46a18 18 0 0 1 36 0v42" fill="currentColor" opacity=".22"/><path d="M30 88V46a18 18 0 0 1 36 0v42" stroke="currentColor" stroke-width="3"/>
  <circle cx="48" cy="58" r="7" fill="currentColor"/><path d="M12 88h72" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M24 22l-6-8M72 22l6-8M48 8V2" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>`;
export function createDungeonWindow(container, data, opts = {}) {
  const icon = iconOf(opts);
  const d = structuredClone(data);
  const lvl = opts.playerLevel ?? d.playerLevel ?? 1;
  const range = (x) => x.levels.split(/[–-]/).map(Number);
  const rec = [...d.list].reverse().find((x) => lvl >= range(x)[0]) || d.list[0];
  const ui = { sel: rec.id, party: opts.party ?? d.party[0] };
  const el = shell(container, "dg", opts, `<div class="mw-eyebrow">${esc(d.gate)} · ${d.party[0]}–${d.party[1]} adventurers</div><h2 class="mw-title">Dungeons</h2>`);
  const main = el.querySelector(".mw-main");
  function render() {
    hideTip();
    const x = d.list.find((q) => q.id === ui.sel), [a, b] = range(x), locked = lvl < a;
    main.innerHTML = `<div class="dg-body"><div class="dg-list" role="listbox" aria-label="Dungeons">${d.list.map((q, i) => { const [qa, qb] = range(q);
        return `<button type="button" role="option" class="dgi${q === rec ? " rec" : ""}${lvl > qb + 5 ? " low" : ""}" style="--c:${q.theme};animation-delay:${i * 35}ms" aria-selected="${q.id === ui.sel}" data-id="${q.id}">
          <span><b>${esc(q.name)}</b><small>${lvl < qa ? `Unlocks at level ${qa}` : q === rec ? "Recommended for you" : q.clears ? `${q.clears} clears` : "Not cleared yet"}</small></span><span class="lv">Lv ${esc(q.levels)}</span></button>`; }).join("")}</div>
      <div class="dg-det" style="--c:${x.theme}">
        <div class="mw-card dg-hero"><div><span class="mw-pill" style="--c:${x.theme}">Lv ${esc(x.levels)} · ${d.party[0]}–${d.party[1]} adventurers</span><h3>${esc(x.name)}</h3><p>${esc(x.tagline)}</p>
          <div class="chips">${locked ? `<span class="mw-chip" style="color:var(--red)">Unlocks at level ${a}</span>` : lvl > b + 5 ? `<span class="mw-chip">Below your level · no XP penalty</span>` : `<span class="mw-chip" style="color:var(--mint)">Right for your level</span>`}</div></div>
          <div class="gate">${GATE}</div></div>
        <div class="dg-tiles"><div class="stat"><span>Encounters</span><b>${x.encounters}</b></div><div class="stat"><span>Rune seals</span><b>${x.seals}</b></div>
          <div class="stat"><span>Best time</span><b>${x.best || "—"}</b></div><div class="stat"><span>Clears</span><b>${x.clears}</b></div></div>
        <h4>How it works</h4><ul class="dg-steps">${d.steps.map((t, i) => `<li><i>${i + 1}</i><span>${esc(t)}</span></li>`).join("")}<li><i>★</i><span>${esc(x.desc)}</span></li></ul>
        <h4>Rewards</h4><div class="dg-rew"><span class="mw-chip xp">+${fmt(x.xp)} XP on completion</span>${d.rewards.map((r) => `<span class="mw-chip">${esc(r)}</span>`).join("")}</div>
        <div class="mw-card dg-party"><div class="seats">${Array.from({ length: d.party[1] }, (_, i) => `<i class="${i < ui.party ? "on" : ""}">${i < ui.party ? (i ? "+" : "Y") : ""}</i>`).join("")}</div>
          <div><b style="font-size:calc(14*var(--u))">Party ${ui.party} / ${d.party[1]}</b><small>${esc(d.summon)}</small></div><button type="button" class="mw-btn party">Manage party</button></div>
        <div class="dg-act"><button type="button" class="mw-btn primary gate-b"${locked ? " disabled" : ""}>${locked ? `Reach level ${a}` : `Find the ${esc(d.gate)}`}</button><button type="button" class="mw-btn stone">Find summon stone</button></div>
      </div></div>`;
    main.querySelectorAll(".dgi").forEach((b2) => b2.addEventListener("click", () => { ui.sel = b2.dataset.id; render(); }));
    main.querySelector(".gate-b").addEventListener("click", () => { opts.onFindGate ? opts.onFindGate(x) : toast(el, `Waypoint set: ${d.gate}`); });
    main.querySelector(".stone").addEventListener("click", () => { opts.onFindStone ? opts.onFindStone(x) : toast(el, "Waypoint set: summon stone"); });
    main.querySelector(".party").addEventListener("click", () => { if (opts.onParty) opts.onParty(); else { ui.party = ui.party >= d.party[1] ? 1 : ui.party + 1; render(); } });
  }
  render();
  const api = { el, get state() { return d; }, update(p) { Object.assign(d, p); render(); return api; }, destroy: () => { hideTip(); el.remove(); } };
  return api;
}

// ------------------------------------------------------------------ options
//   data: options.json · opts: { icon, onClose, onChange(id, value, all), onOpenWallet(), onPerfCheck() -> Promise<"Low"|"Medium"|"High"|"Ultra">, values }
//   Every change applies at once and calls onChange; values = saved settings to start from.
export function createOptionsWindow(container, data, opts = {}) {
  const d = structuredClone(data);
  const pages = d.sections.flatMap((s) => s.items);
  const all = pages.flatMap((p) => p.settings || []);
  const def = Object.fromEntries(all.map((s) => [s.id, s.value]));
  const binds0 = Object.fromEntries(pages.flatMap((p) => (p.binds || []).flatMap(([, l]) => l.map(([id, , k]) => [id, k]))));
  const v = { ...def, ...(opts.values || {}) }, binds = { ...binds0, ...((opts.values || {}).binds || {}) };
  const ui = { page: "graphics", wait: null, perf: null, sure: false };
  const el = shell(container, "op", opts, `<h2 class="mw-title" style="margin:0">Options</h2>`);
  const main = el.querySelector(".mw-main");
  const fmtV = (s, x) => (s.type === "range" ? `${x}${s.unit || ""}` : x);
  function set(id, x, quiet) {
    v[id] = x;
    if (id === "preset" && d.presets[x]) Object.assign(v, d.presets[x]);
    else if (d.presets && ["renderScale", "renderDistance", "shadows", "textures", "effects", "bloom", "water"].includes(id) && v.preset !== "Auto") {
      const match = Object.entries(d.presets).find(([, p]) => Object.entries(p).every(([k, y]) => v[k] === y));
      v.preset = match ? match[0] : "Custom";
    }
    opts.onChange && opts.onChange(id, x, { ...v, binds: { ...binds } });
    if (!quiet) render();
  }
  function control(s) {
    const x = v[s.id];
    if (s.type === "toggle") return `<button type="button" class="tg" role="switch" aria-checked="${!!x}" aria-label="${esc(s.label)}" data-id="${s.id}"></button>`;
    if (s.type === "range") return `<div class="rg"><input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${x}" data-id="${s.id}" aria-label="${esc(s.label)}"><output>${fmtV(s, x)}</output></div>`;
    if (s.type === "select") return `<select data-id="${s.id}" aria-label="${esc(s.label)}">${s.options.map(([a, b]) => `<option value="${esc(a)}"${a === x ? " selected" : ""}>${esc(b)}</option>`).join("")}</select>`;
    const o = s.id === "preset" && x === "Custom" ? [...s.options, ["Custom", "Custom"]] : s.options;
    return `<div class="sg" role="group" aria-label="${esc(s.label)}">${o.map(([a, b]) => `<button type="button" data-id="${s.id}" data-v="${esc(a)}" aria-pressed="${String(a) === String(x)}">${esc(b)}</button>`).join("")}</div>`;
  }
  function render() {
    hideTip();
    const p = pages.find((q) => q.id === ui.page);
    const changed = (p.settings || []).filter((s) => v[s.id] !== def[s.id]).length + (p.binds ? Object.keys(binds).filter((k) => binds[k] !== binds0[k]).length : 0);
    const used = {}; Object.entries(binds).forEach(([k, key]) => (used[key] = (used[key] || 0) + 1));
    main.innerHTML = `<div class="op-body"><nav class="op-nav" aria-label="Options">${d.sections.map((s) => `<div class="grp">${esc(s.group)}</div>${s.items.map((q) =>
        `<button type="button" data-p="${q.id}" aria-current="${q.id === ui.page}">${esc(q.name)}${q.link ? '<span class="ext">↗</span>' : ""}</button>`).join("")}`).join("")}</nav>
      <div class="op-main"><div class="hd"><h3>${esc(p.name)}</h3><span class="sp"></span>
        ${changed ? `<button type="button" class="mw-btn ghost danger reset">${ui.sure ? "Click again to reset" : `Reset ${changed} to default`}</button>` : `<span class="mw-muted" style="font-size:calc(12*var(--u))">All defaults</span>`}</div>
        ${p.info ? `<div class="op-info"><div class="stat"><span>Version</span><b>${esc(p.info.version)}</b></div><div class="stat"><span>Channel</span><b>${esc(v.channel)}</b></div><div class="stat"><span>Status</span><b style="color:var(--mint)">Up to date</b></div></div>` : ""}
        <div class="op-list ${p.binds ? "kb" : ""}">${(p.settings || []).map((s) => `<div class="opt${v[s.id] !== def[s.id] ? " changed" : ""}"><div><b>${esc(s.label)}</b>${s.desc ? `<small>${esc(s.desc)}</small>` : ""}</div>${control(s)}</div>`).join("")}
          ${(p.binds || []).map(([g, l]) => `<h4>${esc(g)}</h4>${l.map(([id, name]) => `<div class="opt${binds[id] !== binds0[id] ? " changed" : ""}"><div><b>${esc(name)}</b></div>
            <button type="button" class="key${ui.wait === id ? " wait" : used[binds[id]] > 1 ? " clash" : ""}" data-k="${id}" title="${used[binds[id]] > 1 ? "Also used by another action" : "Click, then press a key"}">${ui.wait === id ? "Press a key…" : esc(binds[id] || "—")}</button></div>`).join("")}`).join("")}</div>
        ${p.link ? `<button type="button" class="mw-btn primary wallet">Open wallet</button>` : ""}
        ${p.action ? `<div class="mw-card perf">${ui.perf ? `<div class="row"><span>Result</span><b style="color:var(--mint)">${esc(ui.perf)}</b></div>` : ""}<button type="button" class="mw-btn perf-b"${ui.perf === "…" ? " disabled" : ""}>${ui.perf === "…" ? "Checking… keep playing" : esc(p.action)}</button></div>` : ""}
        ${p.binds ? `<div class="op-foot">Click a key, then press the new one. Esc cancels. Red means two actions share a key.</div>` : ""}
      </div></div>`;
    main.querySelectorAll(".op-nav button").forEach((b) => b.addEventListener("click", () => { ui.page = b.dataset.p; ui.sure = false; ui.wait = null; render(); }));
    main.querySelectorAll(".tg").forEach((b) => b.addEventListener("click", () => set(b.dataset.id, !v[b.dataset.id])));
    main.querySelectorAll(".sg button").forEach((b) => b.addEventListener("click", () => set(b.dataset.id, b.dataset.v)));
    main.querySelectorAll("select[data-id]").forEach((s) => s.addEventListener("change", () => set(s.dataset.id, s.value)));
    main.querySelectorAll(".rg input").forEach((r) => {
      const s = all.find((q) => q.id === r.dataset.id);
      r.addEventListener("input", () => { r.nextElementSibling.textContent = fmtV(s, +r.value); set(s.id, +r.value, true); });
      r.addEventListener("change", () => render());
    });
    const rs = main.querySelector(".reset");
    rs && rs.addEventListener("click", () => {
      if (!ui.sure) { ui.sure = true; render(); return; }
      (p.settings || []).forEach((s) => (v[s.id] = def[s.id])); if (p.binds) Object.assign(binds, binds0);
      ui.sure = false; opts.onChange && opts.onChange("reset", p.id, { ...v, binds: { ...binds } }); toast(el, `${p.name} reset to default`); render();
    });
    main.querySelectorAll(".key").forEach((b) => b.addEventListener("click", () => { ui.wait = b.dataset.k; render(); }));
    const w = main.querySelector(".wallet"); w && w.addEventListener("click", () => opts.onOpenWallet && opts.onOpenWallet());
    const pb = main.querySelector(".perf-b");
    pb && pb.addEventListener("click", async () => {
      ui.perf = "…"; render();
      const r = opts.onPerfCheck ? await opts.onPerfCheck() : await new Promise((ok) => setTimeout(() => ok("High"), 1400));
      ui.perf = `${r} runs at about 50 FPS`; set("preset", r);
    });
  }
  const onKey = (e) => {
    if (!ui.wait || !el.isConnected) return;
    e.preventDefault(); e.stopPropagation();
    if (e.key !== "Escape") { const k = e.key === " " ? "Space" : e.key.length === 1 ? e.key.toUpperCase() : e.key; binds[ui.wait] = k; opts.onChange && opts.onChange("bind:" + ui.wait, k, { ...v, binds: { ...binds } }); }
    ui.wait = null; render();
  };
  addEventListener("keydown", onKey, true);
  render();
  const api = { el, get state() { return { ...v, binds: { ...binds } }; }, update(p) { Object.assign(v, p); render(); return api; },
    destroy: () => { removeEventListener("keydown", onKey, true); hideTip(); el.remove(); } };
  return api;
}
