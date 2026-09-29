// Mossvale UI · NPC windows: talk dialog, skill trainer, vendor, banker, auction house. Same glass look as windows.js.
//   Each create* renders one window from its JSON (data/*.json) and returns { el, update(patch), state, destroy() }.
//   mountUI opens them like any window: ui.open("trainer") · ui.open("vendor") · ui.open("bank") · ui.open("auction")
//   · ui.talkTo("hilda") (the NPC's greeting + options, from data/npc-talk.json).
//
// PC: list on the left, a detail panel on the right, item cards on hover (F2 pins the card and opens roll details).
// Phone (.mv-mobile): full screen, tap a row and it opens in place with its details and the action button under your thumb;
//   the bank switches between Bank / Your items with tabs; the auction house categories become a chip row.
//
// Shared options: icon(name) -> url, onClose(). Per window hooks are listed above each function.

const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmt = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
const fmtM = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 4 });
const iconOf = (opts) => opts.icon || ((n) => `icons/${n}.png`);
const RC = { common: "var(--r-common)", uncommon: "var(--r-uncommon)", rare: "var(--r-rare)", epic: "var(--r-epic)", mythic: "var(--r-mythic)", legendary: "var(--r-mythic)" };
const rc = (r) => RC[r] || "var(--ink)";
const isMob = (el) => !!el.closest(".mv-mobile");
const SVG = {
  close: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  chev: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  down: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  search: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.8"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  refresh: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5V5h-2.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  star: `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.5l1.9 4 4.3.5-3.2 3 .9 4.3L8 11.2l-3.9 2.1.9-4.3-3.2-3 4.3-.5z"/></svg>`,
  check: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  lock: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3.5" y="7" width="9" height="7" rx="1.6" stroke="currentColor" stroke-width="1.6"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" stroke-width="1.6"/></svg>`,
  sort: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5 3v10M2.5 10.5L5 13l2.5-2.5M11 13V3M8.5 5.5L11 3l2.5 2.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  glass: `<svg viewBox="0 0 64 64" aria-hidden="true"><g transform="rotate(-35 32 32)"><rect x="8" y="26" width="30" height="12" rx="3" fill="#8a6a3a"/><rect x="36" y="23" width="14" height="18" rx="3" fill="#c79a4e"/><circle cx="50" cy="32" r="8" fill="#9fd8ff" stroke="#e8c070" stroke-width="3"/><rect x="12" y="26" width="3" height="12" fill="#e8c070"/><rect x="24" y="26" width="3" height="12" fill="#e8c070"/></g><circle cx="22" cy="50" r="7" fill="#c79a4e" stroke="#8a6a3a" stroke-width="2"/></svg>`,
};
const coin = (icon, cur) => `<img class="nv-coin" alt="" src="${icon(cur === "moss" ? "coin-moss" : "coin-gold")}">`;
const money = (v, cur) => (cur === "moss" ? `${fmtM(v)} MOSS` : `${fmt(v)} gold`);
const unit = (total, qty, cur) => { const u = total / qty, exact = Math.abs(u - Math.round(u * 100) / 100) < 1e-9; return `${exact ? "" : "≈ "}${cur === "moss" ? fmtM(u) : fmt(u)} ${cur === "moss" ? "MOSS" : "gold"}`; };
function toast(el, text, kind = "") {
  const t = document.createElement("div");
  t.className = `mw-toast ${kind}`; t.textContent = text; t.setAttribute("role", "status");
  el.append(t); setTimeout(() => t.remove(), 1900);
}

// ------------------------------------------------------------------ shell with the NPC in the header
function frame(container, cls, opts, { npc, title, sub, right = "" }) {
  const icon = iconOf(opts);
  const el = document.createElement("section");
  el.className = `mw nv ${cls}`;
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", title || npc?.name || "");
  el.innerHTML = `<header class="mw-head nv-head">
      ${npc ? `<div class="nv-ava" style="--c:${npc.color || "var(--gold)"}">${npc.portrait ? `<img alt="" src="${esc(npc.portrait)}" class="pt">` : `<img alt="" src="${icon(npc.icon || "portrait")}">`}</div>` : ""}
      <div class="grow"><div class="mw-eyebrow" style="color:${npc?.color || "var(--mint)"}">${esc(sub ?? npc?.role ?? "")}</div><h2 class="mw-title">${esc(title ?? npc?.name ?? "")}</h2></div>
      <div class="nv-right">${right}</div>
      <button type="button" class="mw-close" aria-label="Close">${SVG.close}</button></header><div class="mw-main nv-main"></div>`;
  container.append(el);
  el.querySelector(".mw-close").addEventListener("click", () => (opts.onClose ? opts.onClose() : el.remove()));
  el.addEventListener("keydown", (e) => { if (e.key === "Escape" && !card.pinned) el.querySelector(".mw-close").click(); });
  return el;
}

// ------------------------------------------------------------------ item card (hover on PC, inline on phone)
//   item: { name, icon, rarity, upgrade, ilvl, type, slot, level, calling|cls, use, meta, desc, sell,
//           rolls: [{ stat, base, roll, range: [1, 9], upgrade, note }], bonuses: [[stat, value]], set: { name, have, total, bonuses: [[2, "+8% poison damage"]] },
//           stats: [[stat, value]], equipped: { name, diff: [[stat, delta]] } }
function cardHtml(it, icon, open = false, bare = false) {
  const rolls = it.rolls || [];
  const up = it.upgrade ? ` +${it.upgrade}` : "";
  const req = it.level ?? it.req;
  const cal = it.calling || it.cls;
  return `<div class="icd" style="--rc:${rc(it.rarity)}">
    ${bare ? "" : `<div class="icd-name">${esc(it.name)}${up}</div>`}
    ${it.ilvl || it.upgrade ? `<div class="icd-sub">${it.ilvl ? `Item Level ${it.ilvl}` : ""}${it.ilvl && it.upgrade ? " · " : ""}${it.upgrade ? `Upgrade +${it.upgrade}` : ""}</div>` : ""}
    ${it.slot || it.type ? `<div class="icd-row"><span>${esc(it.slot || it.type)}</span><span>${esc(it.slot && it.type && it.type !== it.slot ? it.type : it.rarity ? cap(it.rarity) : "")}</span></div>` : ""}
    ${rolls.length ? rolls.filter((r) => r.primary).map((r) => `<div class="icd-stat"><b>+${r.base + r.roll + r.upgrade} ${esc(r.stat)}</b>${r.note ? `<small>${esc(r.note)}</small>` : ""}</div>`).join("") : ""}
    ${(it.stats || []).map(([k, v]) => `<div class="icd-stat"><b>${String(v).startsWith("+") ? v : "+" + v} ${esc(k)}</b></div>`).join("")}
    ${rolls.some((r) => !r.primary) ? `<div class="icd-green">${rolls.filter((r) => !r.primary).map((r) => `<div>+${r.base + r.roll + r.upgrade} ${esc(r.stat)}</div>`).join("")}<small>Randomly rolled bonuses</small></div>` : ""}
    ${it.use ? `<div class="icd-use">${esc(it.use)}</div>` : ""}${it.meta ? `<div class="icd-meta">${esc(it.meta)}</div>` : ""}
    ${it.set ? `<div class="icd-set"><b>${esc(it.set.name)} set · ${it.set.have} / ${it.set.total} pieces equipped</b>${it.set.bonuses.map(([n, t]) => `<div class="${it.set.have >= n ? "on" : ""}">(${n}) ${esc(t)}</div>`).join("")}</div>` : ""}
    ${it.desc ? `<p class="icd-desc">${esc(it.desc)}</p>` : ""}
    ${req != null || cal ? `<div class="icd-req">${req != null ? `<div>Requires Level ${req}</div>` : ""}${cal ? `<div>Calling: ${esc(cal)}</div>` : ""}</div>` : ""}
    ${rolls.length ? `<details class="icd-rolls"${open ? " open" : ""}><summary>${SVG.chev}Roll details</summary>
      <p class="icd-meta">Level ${req ?? "?"} · ${esc(cal || "Any")}${it.upgrade ? ` · Upgrade +${it.upgrade}` : ""}<br>Ranges apply only to the random affixes selected for this item.</p>
      ${rolls.map((r) => `<div class="icd-roll"><div class="h"><b>${esc(r.stat)}</b><span>Total ${r.base + r.roll + r.upgrade}</span></div>
        <div class="g"><span>Base<b>${r.base}</b></span><span>Roll<b>${r.roll}</b>${r.range ? `<small>Range ${r.range[0]}–${r.range[1]}</small><i style="--p:${((r.roll - r.range[0]) / Math.max(1, r.range[1] - r.range[0])).toFixed(2)}"></i>` : ""}</span><span>Upgrade<b>${r.upgrade}</b></span></div></div>`).join("")}
      <p class="icd-meta">Higher rarity can raise roll potential and affix count. Level, calling, base stats, upgrades and actual rolls still matter: an epic is not always better for your build.</p>
      ${it.equipped ? `<div class="icd-cmp"><b>If equipped instead</b>${it.equipped.diff ? it.equipped.diff.map(([k, v]) => `<div class="${v >= 0 ? "up" : "dn"}">${v >= 0 ? "+" : ""}${v} ${esc(k)}</div>`).join("") : ""}<small>${esc(it.equipped.name || "")}</small></div>` : ""}
    </details>` : ""}
    ${it.sell != null ? `<div class="icd-sell">Sell Price: <b>${fmt(it.sell)}</b> ${coin(icon, "gold")} gold</div>` : ""}
    ${rolls.length && !bare ? `<div class="icd-hint">Press F2 to pin this card and open roll details.</div>` : ""}
  </div>`;
}
const hasCard = (it) => !!(it && (it.rolls || it.set));
// the item card inside a detail panel (PC) or an opened row (phone): Roll details open with a click / tap
const cardIn = (it, icon, open) => (hasCard(it) ? `<div class="nv-in">${cardHtml(it, icon, open, true)}</div>` : "");
const cap = (s) => String(s)[0].toUpperCase() + String(s).slice(1);

// one floating card for every NPC window; F2 pins it so you can open the roll details and scroll
const card = { el: null, pinned: false, target: null, item: null, icon: null };
function cardShow(target, item, icon) {
  if (card.pinned || isMob(target) || !matchMedia("(hover: hover)").matches) return;
  if (!card.el) {
    card.el = document.createElement("div"); card.el.className = "mw nv-card"; document.body.append(card.el);
    addEventListener("keydown", (e) => {
      if (e.key === "F2" && (card.item || card.pinned)) { e.preventDefault(); card.pinned = !card.pinned; card.el.classList.toggle("pinned", card.pinned); const d = card.el.querySelector(".icd-rolls"); if (d) d.open = card.pinned; if (card.pinned) card.el.focus(); else cardHide(true); }
      else if (e.key === "Escape" && card.pinned) { e.preventDefault(); e.stopPropagation(); card.pinned = false; card.el.classList.remove("pinned"); cardHide(true); }
    }, true);
    card.el.tabIndex = -1;
  }
  const win = target.closest(".mw");
  card.el.style.setProperty("--win-scale", win ? getComputedStyle(win).getPropertyValue("--win-scale") : 1);
  card.target = target; card.item = item; card.icon = icon;
  card.el.innerHTML = cardHtml(item, icon);
  const r = target.getBoundingClientRect(), c = card.el.getBoundingClientRect();
  let x = r.right + 10, y = r.top;
  if (x + c.width > innerWidth - 8) x = r.left - c.width - 10;
  if (x < 8) x = Math.max(8, Math.min(innerWidth - c.width - 8, r.left));
  y = Math.max(8, Math.min(innerHeight - c.height - 8, y));
  card.el.style.left = x + "px"; card.el.style.top = y + "px";
  card.el.classList.add("on");
}
function cardHide(force) {
  if (!card.el || (card.pinned && !force)) return;
  card.pinned = false; card.el.classList.remove("on", "pinned"); card.item = null;
}
function hoverCards(root, find, icon) {
  root.querySelectorAll("[data-card]").forEach((n) => {
    n.addEventListener("mouseenter", () => { const it = find(n.dataset.card); it && cardShow(n, it, icon); });
    n.addEventListener("mouseleave", () => cardHide());
  });
}

// ------------------------------------------------------------------ talk dialog
//   data: npc-talk.json entry { npc, text, options: [{ id, label, icon, open }] } · opts: { onSelect(option) }
export function createNpcTalk(container, data, opts = {}) {
  const icon = iconOf(opts);
  const d = structuredClone(data);
  const el = frame(container, "nt", opts, { npc: d.npc });
  const main = el.querySelector(".nv-main");
  main.innerHTML = `<p class="nt-text" aria-live="polite"></p>
    <div class="nt-opts">${d.options.map((o, i) => `<button type="button" class="nt-opt${o.open ? "" : " plain"}" data-i="${i}">${o.icon ? `<img alt="" src="${icon(o.icon)}">` : `<i class="dot"></i>`}<span>${esc(o.label)}</span>${o.open ? SVG.chev : ""}<kbd>${i + 1}</kbd></button>`).join("")}</div>`;
  // typewriter: tap / click the text to finish it at once
  const p = main.querySelector(".nt-text"); let i = 0, t = 0;
  const step = () => { p.textContent = d.text.slice(0, i += 2); if (i < d.text.length) t = setTimeout(step, 16); };
  step();
  p.addEventListener("click", () => { clearTimeout(t); p.textContent = d.text; });
  const pick = (o) => { if (opts.onSelect) opts.onSelect(o); else if (!o.open) opts.onClose ? opts.onClose() : el.remove(); };
  main.querySelectorAll(".nt-opt").forEach((b) => b.addEventListener("click", () => pick(d.options[+b.dataset.i])));
  const onKey = (e) => { const n = +e.key; if (n >= 1 && n <= d.options.length && !e.target.closest("input,textarea")) { e.preventDefault(); pick(d.options[n - 1]); } };
  addEventListener("keydown", onKey);
  setTimeout(() => main.querySelector(".nt-opt")?.focus({ preventScroll: true }), 50);
  return { el, get state() { return d; }, update() {}, destroy: () => { clearTimeout(t); removeEventListener("keydown", onKey); el.remove(); } };
}

// ------------------------------------------------------------------ skill trainer
//   data: trainer.json · opts: { onTrain(skill) -> false to refuse, onOpenSpellbook() }
export function createTrainerWindow(container, data, opts = {}) {
  const icon = iconOf(opts);
  const d = structuredClone(data);
  const status = (s) => (s.learned ? "learned" : s.level > d.playerLevel ? "locked" : s.cost > d.gold ? "poor" : "ready");
  const first = d.skills.find((s) => status(s) === "ready") || d.skills[0];
  const ui = { filter: "all", sel: first.id };
  const el = frame(container, "tr", opts, { npc: d.npc, right: `<span class="mw-chip nv-gold">${coin(icon, "gold")}<b></b></span>` });
  const main = el.querySelector(".nv-main");
  const FIL = [["all", "All"], ["ready", "Can learn"], ["locked", "Upcoming"], ["learned", "Learned"]];
  const btn = (s) => {
    const st = status(s);
    return `<button type="button" class="mw-btn ${st === "ready" ? "gold" : "ghost"} train"${st === "ready" ? "" : " disabled"}>${
      st === "learned" ? `${SVG.check} Learned` : st === "locked" ? `${SVG.lock} Requires level ${s.level}` : st === "poor" ? "Not enough gold" : `Train · ${s.cost ? money(s.cost, "gold") : "Free"}`}</button>`;
  };
  const detail = (s) => `
    <div class="tr-top"><span class="nv-art"><img alt="" src="${icon(s.icon)}"></span><div><h3>${esc(s.name)}</h3><small>${esc(d.cls)} skill</small></div></div>
    <p class="nv-desc">${esc(s.desc)}</p>
    <dl class="nv-facts"><dt>Effect</dt><dd>${esc(s.effect)}</dd><dt>Cast time</dt><dd>${esc(s.cast)}</dd><dt>Range</dt><dd>${esc(s.range)}</dd><dt>Cooldown</dt><dd>${esc(s.cooldown)}</dd></dl>
    <div class="nv-req"><span class="${s.level > d.playerLevel ? "bad" : "ok"}">Requires level ${s.level} · ${esc(d.cls)}</span><span>Cost: <b>${s.cost ? money(s.cost, "gold") : "Free"}</b></span></div>
    ${btn(s)}`;
  function render() {
    const list = d.skills.filter((s) => ui.filter === "all" || status(s) === ui.filter || (ui.filter === "ready" && status(s) === "poor"));
    const sel = d.skills.find((s) => s.id === ui.sel);
    el.querySelector(".nv-gold b").textContent = fmt(d.gold);
    const n = (f) => d.skills.filter((s) => f === "all" || status(s) === f || (f === "ready" && status(s) === "poor")).length;
    main.innerHTML = `<div class="nv-split">
      <div class="nv-col">
        <div class="mw-tabs nv-fil" role="tablist">${FIL.map(([k, t]) => `<button type="button" class="mw-tab" role="tab" data-f="${k}" aria-selected="${ui.filter === k}">${t}<span class="n">${n(k)}</span></button>`).join("")}</div>
        <div class="nv-list tr-list" role="listbox" aria-label="Skills">${list.map((s) => { const st = status(s); return `
          <div class="nv-item${s.id === ui.sel ? " on" : ""}" data-st="${st}">
            <button type="button" class="nv-row" role="option" data-id="${s.id}" aria-selected="${s.id === ui.sel}">
              <span class="nv-ico"><img alt="" src="${icon(s.icon)}">${st === "learned" ? `<i class="ok">${SVG.check}</i>` : st === "locked" ? `<i class="lk">${SVG.lock}</i>` : ""}</span>
              <span class="nv-t"><b>${esc(s.name)}</b><small>${st === "learned" ? "Learned" : `Requires level ${s.level}`}</small></span>
              <span class="nv-price">${st === "learned" ? "" : s.cost ? `${fmt(s.cost)} ${coin(icon, "gold")}` : "Free"}</span></button>
            ${s.id === ui.sel ? `<div class="nv-x">${detail(s)}</div>` : ""}</div>`; }).join("") || `<p class="nv-empty">Nothing here.</p>`}</div>
      </div>
      <aside class="mw-card nv-detail">${sel ? detail(sel) : ""}</aside></div>
      <footer class="nv-foot"><span class="mw-chip">${coin(icon, "gold")}${fmt(d.gold)} gold</span><span class="mw-muted">Level ${d.playerLevel} ${esc(d.cls)}</span><span style="flex:1"></span>
        <button type="button" class="mw-link sb"><img alt="" src="${icon("menu/spellbook")}">Open spellbook</button></footer>`;
    main.querySelectorAll(".nv-fil .mw-tab").forEach((b) => b.addEventListener("click", () => { ui.filter = b.dataset.f; render(); }));
    main.querySelectorAll(".nv-row").forEach((b) => b.addEventListener("click", () => { ui.sel = ui.sel === b.dataset.id && isMob(el) ? null : b.dataset.id; render(); if (isMob(el)) main.querySelector(".nv-item.on")?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }));
    main.querySelectorAll(".train").forEach((b) => b.addEventListener("click", () => train(sel)));
    main.querySelector(".sb").addEventListener("click", () => opts.onOpenSpellbook && opts.onOpenSpellbook());
  }
  function train(s) {
    if (!s || status(s) !== "ready") return;
    if (opts.onTrain && opts.onTrain(s) === false) return;
    d.gold -= s.cost; s.learned = true;
    toast(el, `Learned ${s.name}`);
    render();
    main.querySelectorAll(`[data-id="${s.id}"] .nv-ico`).forEach((n) => n.classList.add("pop"));
  }
  render();
  const api = { el, get state() { return d; }, update(p) { Object.assign(d, p); render(); return api; }, destroy: () => el.remove() };
  return api;
}

// ------------------------------------------------------------------ vendor (buy / sell)
//   data: vendor.json · opts: { onBuy(item) -> false to refuse, onSell(item, qty) }
const SLOTS = ["All", "Head", "Body", "Legs", "Shoes", "Back", "Ring", "Necklace", "Weapon"];
export function createVendorWindow(container, data, opts = {}) {
  const icon = iconOf(opts);
  const d = structuredClone(data);
  const ui = { tab: "buy", slot: "All", page: 0, sel: d.items[0]?.id, sellSel: d.sell[0]?.id, qty: 1, rolls: false };
  const el = frame(container, "vd", opts, { npc: d.npc, right: `<span class="mw-chip nv-gold">${coin(icon, "gold")}<b></b></span>` });
  const main = el.querySelector(".nv-main");
  const per = () => (isMob(el) ? 999 : 7);
  const canUse = (it) => it.calling === "Any" || it.calling === d.cls;
  const buyDetail = (it) => `
    <div class="tr-top"><span class="nv-art" style="--rc:${rc(it.rarity)}"><img alt="" src="${icon(it.icon)}"></span><div><h3 style="color:${rc(it.rarity)}">${esc(it.name)}</h3><small>${cap(it.rarity)}</small></div></div>
    ${hasCard(it) ? cardIn({ ...it, type: it.slot, slot: it.slot }, icon, ui.rolls) : `<p class="nv-desc">${esc(it.desc)}</p>`}
    <dl class="nv-facts"${hasCard(it) ? " hidden" : ""}><dt>Slot</dt><dd>${esc(it.slot)}</dd><dt>Required level</dt><dd class="${it.level > d.playerLevel ? "bad" : ""}">${it.level}</dd><dt>Calling</dt><dd class="${canUse(it) ? "" : "bad"}">${esc(it.calling)}</dd>
      ${it.stats.map(([k, v]) => `<dt>${esc(k)}</dt><dd class="up">${String(v).startsWith("+") ? v : "+" + v}</dd>`).join("")}</dl>
    <div class="nv-req"><span>Price</span><b>${fmt(it.price)} ${coin(icon, "gold")}</b></div>
    <button type="button" class="mw-btn gold buy"${d.gold < it.price || d.bagUsed >= d.bagMax ? " disabled" : ""}>${d.bagUsed >= d.bagMax ? "Bags full" : d.gold < it.price ? "Not enough gold" : `Buy · ${fmt(it.price)} gold`}</button>`;
  const sellDetail = (it) => `
    <div class="tr-top"><span class="nv-art"><img alt="" src="${icon(it.icon)}"></span><div><h3>${esc(it.name)}</h3><small>${it.qty} in your bags</small></div></div>
    <div class="nv-qty"><span>Amount</span><div class="step"><button type="button" data-q="-1" aria-label="Less">−</button><input type="number" inputmode="numeric" min="1" max="${it.qty}" value="${Math.min(ui.qty, it.qty)}" aria-label="Amount"><button type="button" data-q="1" aria-label="More">+</button></div><button type="button" class="mw-btn ghost all">All ${it.qty}</button></div>
    <div class="nv-req"><span>${fmt(it.price)} gold each</span><b class="tot">${fmt(it.price * Math.min(ui.qty, it.qty))} ${coin(icon, "gold")}</b></div>
    <button type="button" class="mw-btn primary sell">Sell for ${fmt(it.price * Math.min(ui.qty, it.qty))} gold</button>`;
  function render() {
    el.querySelector(".nv-gold b").textContent = fmt(d.gold);
    const buy = ui.tab === "buy";
    const all = buy ? d.items.filter((i) => ui.slot === "All" || i.slot === ui.slot) : d.sell;
    const pages = Math.max(1, Math.ceil(all.length / per())); ui.page = Math.min(ui.page, pages - 1);
    const list = all.slice(ui.page * per(), ui.page * per() + per());
    const selId = buy ? ui.sel : ui.sellSel, sel = (buy ? d.items : d.sell).find((i) => i.id === selId);
    const det = (it) => (buy ? buyDetail(it) : sellDetail(it));
    main.innerHTML = `<div class="nv-split">
      <div class="nv-col">
        <div class="nv-bar"><div class="mw-tabs" role="tablist"><button type="button" class="mw-tab" data-t="buy" aria-selected="${buy}">Buy</button><button type="button" class="mw-tab" data-t="sell" aria-selected="${!buy}">Sell<span class="n">${d.sell.length}</span></button></div>
          ${buy ? `<label class="nv-sel"><span>Filter</span><select aria-label="Filter by slot">${SLOTS.map((s) => `<option${s === ui.slot ? " selected" : ""}>${s}</option>`).join("")}</select></label>` : `<span class="mw-muted">Tap an item to sell it</span>`}</div>
        <div class="nv-list vd-list">${list.map((it) => `
          <div class="nv-item${it.id === selId ? " on" : ""}">
            <button type="button" class="nv-row" data-id="${it.id}" data-card="${it.id}" aria-pressed="${it.id === selId}">
              <span class="nv-ico" style="--rc:${rc(it.rarity)}"><img alt="" src="${icon(it.icon)}">${!buy ? `<em>${it.qty}</em>` : ""}</span>
              <span class="nv-t"><b style="color:${rc(it.rarity)}">${esc(it.name)}</b><small>${buy ? `Level ${it.level} · ${esc(it.slot)}${canUse(it) ? "" : ` · <span class="bad">${esc(it.calling)} only</span>`}` : `${it.qty} in bags · ${fmt(it.price)} gold each`}</small></span>
              <span class="nv-price">${fmt(it.price)} ${coin(icon, "gold")}</span></button>
            ${it.id === selId ? `<div class="nv-x">${det(it)}</div>` : ""}</div>`).join("") || `<p class="nv-empty">${buy ? "Nothing in this slot." : "Nothing to sell."}</p>`}</div>
        ${pages > 1 ? `<div class="nv-pager"><button type="button" class="mw-btn ghost pg" data-p="-1" aria-label="Previous page"${ui.page ? "" : " disabled"}>‹</button><span>Page ${ui.page + 1} of ${pages}</span><button type="button" class="mw-btn ghost pg" data-p="1" aria-label="Next page"${ui.page < pages - 1 ? "" : " disabled"}>›</button></div>` : ""}
      </div>
      <aside class="mw-card nv-detail">${sel ? det(sel) : `<p class="nv-empty">Pick an item.</p>`}</aside></div>
      <footer class="nv-foot"><span class="mw-chip">${coin(icon, "gold")}${fmt(d.gold)} gold</span><span style="flex:1"></span><span class="mw-muted">${d.bagUsed} / ${d.bagMax} bag slots</span></footer>`;
    main.querySelectorAll(".nv-bar .mw-tab").forEach((b) => b.addEventListener("click", () => { ui.tab = b.dataset.t; ui.page = 0; ui.qty = 1; render(); }));
    main.querySelector(".nv-sel select")?.addEventListener("change", (e) => { ui.slot = e.target.value; ui.page = 0; const f = d.items.find((i) => ui.slot === "All" || i.slot === ui.slot); ui.sel = f?.id; render(); });
    main.querySelectorAll(".nv-row").forEach((b) => b.addEventListener("click", () => { const k = buy ? "sel" : "sellSel"; ui[k] = ui[k] === b.dataset.id && isMob(el) ? null : b.dataset.id; ui.qty = 1; cardHide(true); render(); }));
    main.querySelectorAll(".pg").forEach((b) => b.addEventListener("click", () => { ui.page += +b.dataset.p; render(); }));
    main.querySelectorAll(".buy").forEach((b) => b.addEventListener("click", () => {
      if (opts.onBuy && opts.onBuy(sel) === false) return;
      d.gold -= sel.price; d.bagUsed++; toast(el, `Bought ${sel.name}`); render();
    }));
    main.querySelectorAll(".nv-qty").forEach((q) => {
      const inp = q.querySelector("input"), set = (v) => { ui.qty = Math.max(1, Math.min(sel.qty, v | 0 || 1)); render(); };
      q.querySelectorAll("[data-q]").forEach((b) => b.addEventListener("click", () => set(ui.qty + +b.dataset.q)));
      inp.addEventListener("change", () => set(+inp.value));
      q.querySelector(".all").addEventListener("click", () => set(sel.qty));
    });
    main.querySelectorAll(".sell").forEach((b) => b.addEventListener("click", () => {
      const n = Math.min(ui.qty, sel.qty);
      opts.onSell && opts.onSell(sel, n);
      d.gold += sel.price * n; sel.qty -= n; toast(el, `Sold ${n} × ${sel.name} for ${fmt(sel.price * n)} gold`);
      if (!sel.qty) { d.sell = d.sell.filter((i) => i !== sel); d.bagUsed--; ui.sellSel = d.sell[0]?.id; }
      ui.qty = 1; render();
    }));
    main.querySelectorAll(".nv-in .icd-rolls").forEach((x) => x.addEventListener("toggle", () => (ui.rolls = x.open)));
    hoverCards(main, (id) => { const it = (buy ? d.items : d.sell).find((i) => i.id === id); return it && buy ? { ...it, type: it.slot, sell: Math.max(1, Math.round(it.price / 5)) } : it && { ...it, sell: it.price }; }, icon);
  }
  render();
  const api = { el, get state() { return d; }, update(p) { Object.assign(d, p); render(); return api; }, destroy: () => { cardHide(true); el.remove(); } };
  return api;
}

// ------------------------------------------------------------------ banker (personal storage)
//   data: bank.json · opts: { onWithdraw(item, qty), onDeposit(item, qty), onOpenBags() }
export function createBankWindow(container, data, opts = {}) {
  const icon = iconOf(opts);
  const d = structuredClone(data);
  const ui = { side: "bank", sel: null, q: "", qty: 1 };
  const el = frame(container, "bk", opts, { npc: d.npc, sub: "Personal storage", title: d.npc.name,
    right: `<button type="button" class="mw-btn ghost bags"><img alt="" src="${icon("menu/bag")}">Bags</button>` });
  const main = el.querySelector(".nv-main");
  el.querySelector(".bags").addEventListener("click", () => opts.onOpenBags && opts.onOpenBags());
  const box = (side) => (side === "bank" ? d.bank : d.bag);
  const other = (side) => (side === "bank" ? "bag" : "bank");
  function grid(side) {
    const b = box(side), q = ui.q.trim().toLowerCase();
    const cells = [];
    for (let i = 0; i < b.max; i++) {
      const it = b.items[i];
      const dim = it && q && !it.name.toLowerCase().includes(q);
      cells.push(it ? `<button type="button" class="bk-slot${ui.sel && ui.sel.side === side && ui.sel.id === it.id ? " on" : ""}${dim ? " dim" : ""}" data-side="${side}" data-id="${it.id}" data-card="${side}:${it.id}" style="--rc:${rc(it.rarity)}" aria-label="${esc(it.name)}${it.qty > 1 ? ` × ${it.qty}` : ""}">
        <img alt="" src="${icon(it.icon)}">${it.qty > 1 ? `<em>${it.qty > 9999 ? Math.round(it.qty / 1000) + "k" : it.qty}</em>` : ""}</button>` : `<span class="bk-slot empty" aria-hidden="true"></span>`);
    }
    return cells.join("");
  }
  function render() {
    const s = ui.sel && box(ui.sel.side).items.find((i) => i.id === ui.sel.id);
    if (!s) ui.sel = null;
    const act = ui.sel ? (ui.sel.side === "bank" ? "Withdraw" : "Deposit") : "";
    const full = ui.sel && box(other(ui.sel.side)).items.length >= box(other(ui.sel.side)).max && !box(other(ui.sel.side)).items.some((i) => i.name === s.name);
    main.innerHTML = `
      <div class="mw-tabs bk-tabs" role="tablist"><button type="button" class="mw-tab" data-s="bank" aria-selected="${ui.side === "bank"}">Bank<span class="n">${d.bank.items.length} / ${d.bank.max}</span></button><button type="button" class="mw-tab" data-s="bag" aria-selected="${ui.side === "bag"}">Your items<span class="n">${d.bag.items.length} / ${d.bag.max}</span></button></div>
      <div class="bk-tools"><label class="nv-search">${SVG.search}<input type="search" placeholder="Search your items" value="${esc(ui.q)}" aria-label="Search"></label><button type="button" class="mw-btn ghost sort">${SVG.sort}Sort</button></div>
      <div class="bk-body">${["bank", "bag"].map((side) => `
        <section class="bk-panel${ui.side === side ? " on" : ""}" aria-label="${side === "bank" ? "Bank" : "Your items"}">
          <h3>${side === "bank" ? "Bank" : "Your items"}<span>${box(side).items.length} / ${box(side).max}</span></h3>
          <div class="bk-grid${side === "bag" ? " bag" : ""}">${grid(side)}</div></section>`).join("")}</div>
      <div class="bk-act${s ? " on" : ""}">${s ? `<span class="nv-ico" style="--rc:${rc(s.rarity)}"><img alt="" src="${icon(s.icon)}"></span><span class="nv-t"><b style="color:${rc(s.rarity)}">${esc(s.name)}</b><small>${s.qty > 1 ? `${fmt(s.qty)} in ${ui.sel.side === "bank" ? "the bank" : "your bags"}` : cap(s.rarity || "common")}</small></span>
        ${s.qty > 1 ? `<div class="step"><button type="button" data-q="-1" aria-label="Less">−</button><input type="number" inputmode="numeric" min="1" max="${s.qty}" value="${Math.min(ui.qty, s.qty)}" aria-label="Amount"><button type="button" data-q="1" aria-label="More">+</button></div>` : ""}
        <button type="button" class="mw-btn primary mv"${full ? " disabled" : ""}>${full ? (ui.sel.side === "bank" ? "Bags full" : "Bank full") : `${act}${s.qty > 1 ? ` ${Math.min(ui.qty, s.qty)}` : ""}`}</button>
        ${s.qty > 1 ? `<button type="button" class="mw-btn ghost mvall"${full ? " disabled" : ""}>${act} all</button>` : ""}`
        : `<p>Select an item to ${ui.side === "bank" || !isMob(el) ? "withdraw" : "deposit"} it${isMob(el) ? "" : ", or double-click to move it at once"}.</p><small>Items stay here safely between adventures.</small>`}</div>`;
    main.querySelectorAll(".bk-tabs .mw-tab").forEach((b) => b.addEventListener("click", () => { ui.side = b.dataset.s; ui.sel = null; render(); }));
    const inp = main.querySelector(".nv-search input");
    inp.addEventListener("input", () => { ui.q = inp.value; const p = inp.selectionStart; render(); const n = main.querySelector(".nv-search input"); n.focus(); n.setSelectionRange(p, p); });
    main.querySelector(".sort").addEventListener("click", () => { for (const b of [d.bank, d.bag]) b.items.sort((a, c) => (c.rarity ? ["common", "uncommon", "rare", "epic", "mythic"].indexOf(c.rarity) : 0) - (a.rarity ? ["common", "uncommon", "rare", "epic", "mythic"].indexOf(a.rarity) : 0) || a.name.localeCompare(c.name)); render(); });
    main.querySelectorAll(".bk-slot[data-id]").forEach((b) => {
      b.addEventListener("click", () => { const same = ui.sel && ui.sel.side === b.dataset.side && ui.sel.id === b.dataset.id; ui.sel = same ? null : { side: b.dataset.side, id: b.dataset.id }; ui.qty = 1; cardHide(true); render(); });
      b.addEventListener("dblclick", () => { ui.sel = { side: b.dataset.side, id: b.dataset.id }; move(Infinity); });
    });
    const st = main.querySelector(".bk-act .step");
    if (st) {
      const i = st.querySelector("input"), set = (v) => { ui.qty = Math.max(1, Math.min(s.qty, v | 0 || 1)); render(); };
      st.querySelectorAll("[data-q]").forEach((b) => b.addEventListener("click", () => set(ui.qty + +b.dataset.q)));
      i.addEventListener("change", () => set(+i.value));
    }
    main.querySelector(".mv")?.addEventListener("click", () => move(ui.qty));
    main.querySelector(".mvall")?.addEventListener("click", () => move(Infinity));
    hoverCards(main, (k) => { const [side, id] = k.split(":"); const it = box(side).items.find((i) => i.id === id); return it && { ...it, type: cap(it.rarity || "common") }; }, icon);
  }
  function move(n) {
    if (!ui.sel) return;
    const from = box(ui.sel.side), to = box(other(ui.sel.side));
    const it = from.items.find((i) => i.id === ui.sel.id); if (!it) return;
    const stack = to.items.find((i) => i.name === it.name && i.qty > 1 || (i.name === it.name && it.qty > 1));
    if (!stack && to.items.length >= to.max) return toast(el, ui.sel.side === "bank" ? "Your bags are full" : "The bank is full", "bad");
    const k = Math.min(n, it.qty);
    (ui.sel.side === "bank" ? opts.onWithdraw : opts.onDeposit)?.(it, k);
    if (stack) stack.qty += k; else to.items.push({ ...it, id: it.id + (to.items.some((i) => i.id === it.id) ? "-" + Date.now() : ""), qty: k });
    it.qty -= k; if (!it.qty) from.items.splice(from.items.indexOf(it), 1);
    toast(el, `${ui.sel.side === "bank" ? "Withdrew" : "Deposited"} ${k > 1 ? k + " × " : ""}${it.name}`);
    ui.sel = it.qty ? ui.sel : null; ui.qty = 1; render();
  }
  render();
  const api = { el, get state() { return d; }, update(p) { Object.assign(d, p); render(); return api; }, destroy: () => { cardHide(true); el.remove(); } };
  return api;
}

// ------------------------------------------------------------------ auction house
//   data: auction.json · opts: { onBuy(listing), onList({ item, qty, total, cur }), onCancel(listing), onExchangeList({ gold, moss }), onExchangeBuy(lot),
//                                onCollect(wallet?), onRefresh(), onOpenBags(), onSearch(q) }
//   Currencies: "gold" or "moss". The Currency filter is All currencies / Gold / MOSS.
const TABS = [["browse", "Browse", "coin-gold"], ["sell", "Sell", "bag-pack"], ["exchange", "Gold Exchange", "coin-moss"], ["purchases", "Purchases", "board-scroll"], ["mine", "My auctions", "contract-1"], ["sold", "Sold", "contract-3"]];
export function createAuctionWindow(container, data, opts = {}) {
  const icon = iconOf(opts);
  const d = structuredClone(data);
  const ui = { tab: opts.tab || "browse", cat: "all", q: "", applied: "", cur: "all", sort: ["unit", 1], sel: null, mineShow: "all", rolls: false,
    sellId: d.bag[0]?.id, sellQty: 1, sellCur: "gold", sellTotal: "", exGold: "200", exMoss: "", exSel: null, soldSel: null, lists: false, collect: false };
  const el = frame(container, "ah", opts, { title: d.title, sub: `${d.npc.name} · ${d.realm}`, npc: { ...d.npc, icon: "menu-shop" },
    right: `<span class="mw-chip nv-gold">${coin(icon, "gold")}<b class="g"></b></span><span class="mw-chip nv-moss">${coin(icon, "moss")}<b class="m"></b></span><button type="button" class="mw-btn ghost bags"><img alt="" src="${icon("menu/bag")}">Bags<kbd>B</kbd></button>` });
  // swap the eyebrow and title: the house name is the title, "Merrick Ledger · All realms" goes under it
  const hd = el.querySelector(".nv-head .grow"); hd.append(hd.querySelector(".mw-eyebrow")); hd.querySelector(".mw-eyebrow").className = "mw-sub";
  el.querySelector(".bags").addEventListener("click", () => opts.onOpenBags && opts.onOpenBags());
  const main = el.querySelector(".nv-main");
  const find = (id) => [...d.listings, ...d.mine].find((l) => l.id === id);
  const curOk = (l) => ui.cur === "all" || l.cur === ui.cur;
  const catN = (c) => d.listings.filter((l) => (c === "all" || l.cat === c) && curOk(l)).length;
  const cheapest = (name, cur) => Math.min(...d.listings.filter((l) => l.name === name && l.cur === cur && !l.mine).map((l) => l.total / l.qty));
  const fee = (cur) => d.fees[cur] ?? .05;
  function sorted(list) {
    const [k, dir] = ui.sort, v = (l) => (k === "unit" ? l.total / l.qty : k === "qty" ? l.qty : k === "total" ? l.total : k === "name" ? l.name.toLowerCase() : l.seller?.toLowerCase());
    // gold and MOSS never mix in one price sort: gold first, then MOSS
    return [...list].sort((a, b) => (ui.cur === "all" && (k === "unit" || k === "total") ? (a.cur > b.cur ? 1 : a.cur < b.cur ? -1 : 0) : 0) || (v(a) > v(b) ? dir : v(a) < v(b) ? -dir : 0));
  }
  const th = (k, t, cls = "") => `<button type="button" class="th ${cls}" data-k="${k}" aria-sort="${ui.sort[0] === k ? (ui.sort[1] > 0 ? "ascending" : "descending") : "none"}">${t}${ui.sort[0] === k ? (ui.sort[1] > 0 ? " ↑" : " ↓") : ""}</button>`;
  const emptyArt = (title, text) => `<div class="ah-empty">${SVG.glass}<h3>${title}</h3><p>${text}</p></div>`;
  const listed = (l) => `<b class="${l.cur}">${money(l.total, l.cur)}</b>`;

  // ---------- browse / my auctions detail
  function listingDetail(l, mine) {
    const own = l.mine || l.seller === "Benjooie";
    const have = l.cur === "moss" ? d.moss : d.gold;
    const f = Math.ceil(l.total * fee(l.cur) * (l.cur === "moss" ? 1000 : 1)) / (l.cur === "moss" ? 1000 : 1);
    const onList = d.shoppingList.includes(l.name);
    return `<div class="ah-d">
      <span class="nv-art big" style="--rc:${rc(l.rarity)}"><img alt="" src="${icon(l.icon)}"></span>
      <h3 style="color:${rc(l.rarity)}">${esc(l.name)}</h3>
      <small>${own ? "Your auction" : `Sold by ${esc(l.seller)}`}${l.level ? ` · Level ${l.level}${l.cls ? " · " + esc(l.cls) : ""}` : ""}</small>
      <p class="mw-muted">${fmt(l.qty)} item${l.qty > 1 ? "s" : ""} · ${unit(l.total, l.qty, l.cur)} each</p>
      ${hasCard(l) ? cardIn(l, icon, ui.rolls) : `${l.use ? `<p class="icd-use">${esc(l.use)}</p>` : ""}${l.desc ? `<p class="nv-desc">${esc(l.desc)}</p>` : ""}`}
      ${l.stats && !hasCard(l) ? `<dl class="nv-facts">${l.stats.map(([k, v]) => `<dt>${esc(k)}</dt><dd class="up">${String(v).startsWith("+") ? v : "+" + v}</dd>`).join("")}</dl>` : ""}
      ${own ? "" : `<button type="button" class="mw-btn ghost sl${onList ? " on" : ""}">${SVG.star}${onList ? "On shopping list" : "Shopping list"}</button>`}
      <div class="ah-total"><b class="${l.cur}">${money(l.total, l.cur)}</b><small>Total for ${fmt(l.qty)}</small>
        <small>Seller fee: ${money(f, l.cur)} · Seller receives: ${money(+(l.total - f).toFixed(4), l.cur)}</small></div>
      ${own ? `<button type="button" class="mw-btn danger cancel">Cancel auction</button><small class="mw-muted">Cancelled items go back to your bags.</small>`
        : `<button type="button" class="mw-btn gold buy"${have < l.total ? " disabled" : ""}>${have < l.total ? `Not enough ${l.cur === "moss" ? "MOSS" : "gold"}` : `Buy · ${money(l.total, l.cur)}`}</button>`}
    </div>`;
  }
  function rows(list, mine) {
    return list.map((l) => {
      const under = mine && l.cur && cheapest(l.name, l.cur) < l.total / l.qty;
      return `<div class="nv-item${ui.sel === l.id ? " on" : ""}">
        <button type="button" class="ah-row" data-id="${l.id}" data-card="${l.id}" aria-pressed="${ui.sel === l.id}">
          <span class="c-item"><span class="nv-ico" style="--rc:${rc(l.rarity)}"><img alt="" src="${icon(l.icon)}"></span><span class="nv-t"><b style="color:${rc(l.rarity)}">${esc(l.name)}</b>${l.level || mine ? `<small>${l.level ? `${cap(l.rarity)} · Level ${l.level}${l.cls ? " · " + esc(l.cls) : ""}` : ""}${mine ? `${l.level ? " · " : ""}${under ? '<span class="bad">Undercut</span>' : "Your auction"}` : ""}</small>` : ""}</span></span>
          <span class="c-qty"><i>Qty</i>${fmt(l.qty)}</span>
          <span class="c-unit ${l.cur}"><i>Each</i>${unit(l.total, l.qty, l.cur)}</span>
          <span class="c-total"><i>Total</i>${listed(l)}</span>
          <span class="c-seller"><i>Seller</i>${mine ? "You" : esc(l.seller)}</span></button>
        ${ui.sel === l.id ? `<div class="nv-x">${listingDetail(l, mine)}</div>` : ""}</div>`;
    }).join("");
  }
  function browse(mine) {
    const q = ui.applied.toLowerCase();
    const src = mine ? d.mine : d.listings;
    let list = src.filter((l) => (ui.cat === "all" || l.cat === ui.cat) && curOk(l) && (!q || l.name.toLowerCase().includes(q) || l.seller.toLowerCase().includes(q)));
    if (mine && ui.mineShow === "undercut") list = list.filter((l) => cheapest(l.name, l.cur) < l.total / l.qty);
    if (mine && (ui.mineShow === "gold" || ui.mineShow === "moss")) list = list.filter((l) => l.cur === ui.mineShow);
    list = sorted(list);
    const sel = ui.sel && find(ui.sel);
    const undercut = d.mine.filter((l) => cheapest(l.name, l.cur) < l.total / l.qty).length;
    return `<div class="ah-browse">
      <nav class="ah-nav" aria-label="Browse items"><h4>Browse items</h4>
        ${d.categories.map(([k, t]) => `<button type="button" class="ah-cat" data-c="${k}" aria-current="${ui.cat === k}">${t}<span>${mine ? d.mine.filter((l) => k === "all" || l.cat === k).length : catN(k)}</span></button>`).join("")}
        ${mine ? `<h4>Show</h4><select class="ah-show" aria-label="Show"><option value="all">All my auctions</option><option value="undercut">Undercut</option><option value="gold">Gold only</option><option value="moss">MOSS only</option></select>
          <p class="mw-muted">${undercut} undercut · 0 reserved</p>` : ""}
        <button type="button" class="mw-btn ghost clear">Clear filters</button>
        ${mine ? "" : `<details class="ah-lists"${ui.lists ? " open" : ""}><summary>${SVG.chev}Shopping list & recent searches</summary>
          <h5>Shopping list</h5>${d.shoppingList.length ? d.shoppingList.map((n) => `<button type="button" class="ah-q" data-q="${esc(n)}">${SVG.star}${esc(n)}</button>`).join("") : '<p class="mw-muted">Star an item to track it.</p>'}
          <h5>Recent</h5>${d.recent.map((n) => `<button type="button" class="ah-q" data-q="${esc(n)}">${SVG.search}${esc(n)}</button>`).join("")}</details>`}
      </nav>
      <div class="ah-mid">
        <form class="ah-find" role="search"><label class="grow"><span>Search items or sellers</span><span class="nv-search">${SVG.search}<input type="search" name="q" placeholder="Search the market" value="${esc(ui.q)}" autocomplete="off"></span></label>
          <button type="submit" class="mw-btn">Find</button>
          <label><span>Currency</span><select name="cur" aria-label="Currency"><option value="all"${ui.cur === "all" ? " selected" : ""}>All currencies</option><option value="gold"${ui.cur === "gold" ? " selected" : ""}>Gold</option><option value="moss"${ui.cur === "moss" ? " selected" : ""}>MOSS</option></select></label></form>
        <p class="ah-meta">${mine ? `${list.length} listing${list.length === 1 ? "" : "s"} · Your auctions` : `${fmt(ui.applied || ui.cat !== "all" || ui.cur !== "all" ? list.length : d.totalListings)} listings · <span class="live">Live market</span>`}</p>
        ${mine ? `<p class="ah-note">Linking a verified wallet automatically moves your unsold listings to it. Pending payments and proceeds already earned stay with their original wallet.</p>` : ""}
        <div class="ah-table"><div class="ah-th">${th("name", "Item", "c-item")}${th("qty", "Qty", "c-qty")}${th("unit", "Unit price", "c-unit")}${th("total", "Total price", "c-total")}${th("seller", "Seller", "c-seller")}</div>
          <div class="nv-list ah-list">${rows(list, mine) || `<p class="nv-empty">${mine ? "You have no auctions here." : "No listings match. Try another search or currency."}</p>`}</div></div>
      </div>
      <aside class="ah-side">${sel ? listingDetail(sel, mine) : emptyArt(mine ? "Your auctions" : "Find your next upgrade", mine ? "Select an auction to check its price or cancel it." : "Select an item to inspect its stats, stack size and total price.")}</aside></div>`;
  }
  // ---------- sell
  function sell() {
    const it = d.bag.find((b) => b.id === ui.sellId);
    const comp = it ? d.listings.filter((l) => l.name === it.name && l.cur === ui.sellCur) : [];
    const total = parseFloat(ui.sellTotal), qty = Math.min(ui.sellQty, it?.qty || 1);
    const f = total > 0 ? total * fee(ui.sellCur) : 0;
    const low = comp.length ? Math.min(...comp.map((l) => l.total / l.qty)) : null;
    const ok = it && total > 0 && qty > 0;
    return `<div class="ah-sell">
      <section class="ah-bag"><h4>Items in your bag</h4><div class="nv-list">${d.bag.map((b) => `<button type="button" class="ah-bi${b.id === ui.sellId ? " on" : ""}" data-id="${b.id}"><span class="nv-ico"><img alt="" src="${icon(b.icon)}"></span><span class="nv-t"><b>${esc(b.name)}</b><small>${fmt(b.qty)} available</small></span></button>`).join("")}</div></section>
      <section class="mw-card ah-form"><h4>Create an auction</h4>
        <label><span>Item from your bag</span><select class="s-item">${d.bag.map((b) => `<option value="${b.id}"${b.id === ui.sellId ? " selected" : ""}>${esc(b.name)} (${fmt(b.qty)})</option>`).join("")}</select></label>
        <div class="two"><label><span>Quantity</span><input class="s-qty" type="number" inputmode="numeric" min="1" max="${it?.qty || 1}" value="${qty}"></label>
          <label><span>Currency</span><div class="seg"><button type="button" data-c="gold" aria-pressed="${ui.sellCur === "gold"}">${coin(icon, "gold")}Gold</button><button type="button" data-c="moss" aria-pressed="${ui.sellCur === "moss"}">${coin(icon, "moss")}MOSS</button></div></label></div>
        <label><span>Total price for this stack</span><input class="s-total" type="number" inputmode="decimal" min="0" step="${ui.sellCur === "moss" ? "0.01" : "1"}" placeholder="e.g. ${ui.sellCur === "moss" ? "2.5 MOSS" : "250 gold"}" value="${esc(ui.sellTotal)}"></label>
        <div class="hint"><span>${total > 0 ? `${unit(total, qty, ui.sellCur)} each` : "Enter a total price"}</span>${low != null ? `<button type="button" class="mw-btn ghost match">Match lowest</button>` : ""}</div>
        ${total > 0 ? `<div class="ah-fee"><span>Seller fee ${(fee(ui.sellCur) * 100).toFixed(1).replace(".0", "")}%</span><b>${money(+f.toFixed(4), ui.sellCur)}</b><span>You receive</span><b class="${ui.sellCur}">${money(+(total - f).toFixed(4), ui.sellCur)}</b></div>` : ""}
        <button type="button" class="mw-btn gold create"${ok ? "" : " disabled"}>Create listing</button>
        <p class="mw-muted">Listed items leave your bag until cancelled or sold. ${ui.sellCur === "gold" ? "Gold sales burn a 5% seller fee. You can also choose MOSS." : "MOSS sales have a 2.5% fee, paid to your linked wallet."}</p></section>
      <section class="ah-comp"><h4>Current competition</h4><p class="ah-meta">${comp.length} competing listing${comp.length === 1 ? "" : "s"} · ${ui.sellCur === "moss" ? "MOSS" : "Gold"} only</p>
        <div class="ah-table"><div class="ah-th"><span class="th c-item">Item</span><span class="th c-qty">Qty</span><span class="th c-unit">Unit price</span><span class="th c-total">Total price</span><span class="th c-seller">Seller</span></div>
        <div class="nv-list">${comp.map((l) => `<div class="ah-row static"><span class="c-item"><span class="nv-ico sm"><img alt="" src="${icon(l.icon)}"></span><b>${esc(l.name)}</b></span><span class="c-qty"><i>Qty</i>${fmt(l.qty)}</span><span class="c-unit ${l.cur}"><i>Each</i>${unit(l.total, l.qty, l.cur)}</span><span class="c-total"><i>Total</i>${listed(l)}</span><span class="c-seller"><i>Seller</i>${esc(l.seller)}</span></div>`).join("") || `<p class="nv-empty">Nobody else is selling this. You set the price.</p>`}</div></div></section></div>`;
  }
  // ---------- gold exchange
  function exchange() {
    const g = parseFloat(ui.exGold) || 0, m = parseFloat(ui.exMoss) || 0, f = Math.ceil(g * d.fees.exchange);
    const lots = [...d.exchange].sort((a, b) => a.total / a.qty - b.total / b.qty);
    const sel = lots.find((l) => l.id === ui.exSel);
    const ok = g > 0 && m > 0 && g <= d.gold;
    const lotDetail = (l) => `<div class="ah-d"><span class="nv-art big"><img alt="" src="${icon("coin-gold")}"></span><h3>${fmt(l.qty)} gold</h3><small>Sold by ${esc(l.seller)}</small>
      <p class="mw-muted">${unit(l.total, l.qty, "moss")} per gold</p><div class="ah-total"><b class="moss">${money(l.total, "moss")}</b><small>You pay in MOSS from your wallet</small></div>
      <button type="button" class="mw-btn primary exbuy"${d.moss < l.total ? " disabled" : ""}>${d.moss < l.total ? "Not enough MOSS" : `Buy for ${money(l.total, "moss")}`}</button></div>`;
    return `<div class="ah-ex">
      <section class="mw-card ah-form"><h4>Sell gold for MOSS</h4><p class="mw-muted">Set a price for your whole lot. Another player must choose to buy it.</p>
        <label><span>Gold to reserve</span><input class="x-gold" type="number" inputmode="numeric" min="1" max="${d.gold}" value="${esc(ui.exGold)}"></label>
        <label><span>Total MOSS price</span><input class="x-moss" type="number" inputmode="decimal" min="0" step="0.01" placeholder="e.g. 20 MOSS" value="${esc(ui.exMoss)}"></label>
        <div class="ah-fee"><span>Gross</span><b>${fmt(g)} gold</b><span>Fee 0.5%</span><b>${fmt(f)} gold</b><span>Buyer receives</span><b>${fmt(Math.max(0, g - f))} gold</b>${m > 0 && g > 0 ? `<span>Your rate</span><b class="moss">${unit(m, g, "moss")} / gold</b>` : ""}</div>
        <button type="button" class="mw-btn gold exlist"${ok ? "" : " disabled"}>${g > d.gold ? "Not enough gold" : "Reserve gold and list"}</button>
        <p class="mw-muted">Cancellation returns all reserved gold. The 0.5% gold fee is burned only on a completed sale. Gold arrives after payment is processed. Withdraw completed MOSS proceeds with Collect MOSS.</p></section>
      <section class="ah-exlist"><p class="ah-meta">${lots.length} listings · <span class="live">Live market</span></p>
        <div class="ah-table"><div class="ah-th"><span class="th c-item">Item</span><span class="th c-qty">Qty</span><span class="th c-unit">MOSS per gold ↑</span><span class="th c-total">Total price</span><span class="th c-seller">Seller</span></div>
        <div class="nv-list">${lots.map((l) => `<div class="nv-item${l.id === ui.exSel ? " on" : ""}"><button type="button" class="ah-row" data-x="${l.id}" aria-pressed="${l.id === ui.exSel}"><span class="c-item"><span class="nv-ico sm"><img alt="" src="${icon("coin-gold")}"></span><b>Gold</b></span><span class="c-qty"><i>Qty</i>${fmt(l.qty)}</span><span class="c-unit moss"><i>Each</i>${unit(l.total, l.qty, "moss")}</span><span class="c-total"><i>Total</i><b class="moss">${money(l.total, "moss")}</b></span><span class="c-seller"><i>Seller</i>${esc(l.seller)}</span></button>
          ${l.id === ui.exSel ? `<div class="nv-x">${lotDetail(l)}</div>` : ""}</div>`).join("")}</div></div>
        <aside class="ah-side wide">${sel ? lotDetail(sel) : emptyArt("Buy gold with MOSS", "Select a lot to see the price per gold and buy it.")}</aside></section></div>`;
  }
  // ---------- purchases / sold
  function purchases() {
    return d.purchases.length ? `<div class="ah-simple"><p class="ah-meta">${d.purchases.length} listing${d.purchases.length === 1 ? "" : "s"} · Pending purchases</p><div class="nv-list">${d.purchases.map((p) => `
      <div class="ah-row static"><span class="c-item"><span class="nv-ico sm"><img alt="" src="${icon(p.icon)}"></span><span class="nv-t"><b style="color:${rc(p.rarity)}">${esc(p.name)}</b><small>${fmt(p.qty)} · from ${esc(p.seller)}</small></span></span>
        <span class="c-total"><i>Paid</i>${listed(p)}</span><span class="c-seller"><span class="mw-pill st-${p.status}">${{ pending: "Payment pending", confirmed: "Confirmed", delivered: "In your bags" }[p.status] || p.status}</span></span></div>`).join("")}</div></div>`
      : `<div class="ah-simple"><p class="ah-meta">0 listings · Pending purchases</p>${emptyArt("Pending purchases", "Anything you buy with MOSS shows here until the payment is confirmed. Gold purchases arrive in your bags at once.")}</div>`;
  }
  function soldTab() {
    const owed = d.sold.filter((s) => s.cur === "moss" && !s.collected).reduce((a, s) => a + s.total, 0);
    return `<div class="ah-simple"><p class="ah-meta">${d.sold.length} sold · ${owed ? `<b class="moss">${fmtM(owed)} MOSS</b> ready to collect` : "All proceeds collected"}</p>
      <div class="nv-list">${d.sold.map((s) => `<div class="ah-row static"><span class="c-item"><span class="nv-ico sm" style="--rc:${rc(s.rarity)}"><img alt="" src="${icon(s.icon)}"></span><span class="nv-t"><b style="color:${rc(s.rarity)}">${esc(s.name)}</b><small>${fmt(s.qty)} · to ${esc(s.buyer)} · ${esc(s.when)}</small></span></span>
        <span class="c-total"><i>Earned</i>${listed(s)}</span><span class="c-seller">${s.cur === "gold" ? `<span class="mw-pill ok">Gold sent to bags</span>` : s.collected ? `<span class="mw-pill ok">Collected</span>` : `<button type="button" class="mw-btn primary col" data-id="${s.id}">Collect</button>`}</span></div>`).join("")}</div></div>`;
  }
  function render() {
    el.querySelector(".g").textContent = fmt(d.gold); el.querySelector(".m").textContent = fmtM(d.moss);
    const cnt = { purchases: d.purchases.length, mine: d.mine.length, sold: d.sold.length };
    const prev = d.wallets.filter((w) => w.moss > 0);
    main.innerHTML = `
      <div class="ah-tabs"><div class="mw-tabs" role="tablist">${TABS.map(([k, t, ic]) => `<button type="button" class="mw-tab" role="tab" data-t="${k}" aria-selected="${ui.tab === k}"><img alt="" src="${icon(ic)}">${t}${k in cnt ? `<span class="n${k === "sold" && d.sold.some((s) => s.cur === "moss" && !s.collected) ? " hot" : ""}">${cnt[k]}</span>` : ""}</button>`).join("")}</div>
        <button type="button" class="mw-btn ghost refresh">${SVG.refresh}<span>Refresh market</span></button></div>
      ${ui.tab === "browse" ? "" : `<div class="ah-wallet"><span>${coin(icon, "moss")}Mossvale Wallet${d.walletLinked ? ' <span class="ok-dot">linked</span>' : ""}</span><span style="flex:1"></span>
        <button type="button" class="mw-btn ${d.mossToCollect ? "primary" : "ghost"} collect"${d.mossToCollect ? "" : " disabled"}>Collect ${d.mossToCollect ? fmtM(d.mossToCollect) + " " : ""}MOSS</button>
        ${d.wallets.length ? `<details class="ah-prev"${ui.collect ? " open" : ""}><summary>Previous wallets${prev.length ? ` <span class="n hot">${prev.length}</span>` : ""}${SVG.down}</summary><div>${d.wallets.map((w) => `<div><code>${esc(w.addr)}</code><span>${w.moss ? fmtM(w.moss) + " MOSS" : "Nothing to collect"}</span><button type="button" class="mw-btn ghost pw" data-a="${esc(w.addr)}"${w.moss ? "" : " disabled"}>Collect</button></div>`).join("")}</div></details>` : ""}</div>`}
      <div class="ah-body">${ui.tab === "browse" ? browse(false) : ui.tab === "mine" ? browse(true) : ui.tab === "sell" ? sell() : ui.tab === "exchange" ? exchange() : ui.tab === "purchases" ? purchases() : soldTab()}</div>`;
    wire();
  }
  function wire() {
    const $$ = (s) => main.querySelectorAll(s), $ = (s) => main.querySelector(s);
    $$(".ah-tabs .mw-tab").forEach((b) => b.addEventListener("click", () => { ui.tab = b.dataset.t; ui.sel = null; cardHide(true); render(); }));
    $(".refresh").addEventListener("click", () => { opts.onRefresh && opts.onRefresh(); toast(el, "Market refreshed"); });
    $(".collect")?.addEventListener("click", () => { opts.onCollect && opts.onCollect(); d.moss += d.mossToCollect; toast(el, `Collected ${fmtM(d.mossToCollect)} MOSS`); d.mossToCollect = 0; render(); });
    $(".ah-prev")?.addEventListener("toggle", (e) => (ui.collect = e.target.open));
    $$(".pw").forEach((b) => b.addEventListener("click", () => { const w = d.wallets.find((x) => x.addr === b.dataset.a); opts.onCollect && opts.onCollect(w); d.moss += w.moss; toast(el, `Collected ${fmtM(w.moss)} MOSS from ${w.addr}`); w.moss = 0; render(); }));
    // browse + mine
    $$(".ah-cat").forEach((b) => b.addEventListener("click", () => { ui.cat = b.dataset.c; ui.sel = null; render(); }));
    $(".ah-show")?.addEventListener("change", (e) => { ui.mineShow = e.target.value; render(); });
    if ($(".ah-show")) $(".ah-show").value = ui.mineShow;
    $(".clear")?.addEventListener("click", () => { Object.assign(ui, { cat: "all", q: "", applied: "", cur: "all", mineShow: "all", rolls: false, sel: null }); render(); });
    $(".ah-lists")?.addEventListener("toggle", (e) => (ui.lists = e.target.open));
    $$(".ah-q").forEach((b) => b.addEventListener("click", () => { ui.q = ui.applied = b.dataset.q; ui.sel = null; render(); }));
    const f = $(".ah-find");
    if (f) {
      f.addEventListener("submit", (e) => { e.preventDefault(); ui.q = ui.applied = f.q.value.trim(); if (ui.applied && !d.recent.includes(ui.applied.toLowerCase())) d.recent = [ui.applied.toLowerCase(), ...d.recent].slice(0, 5); opts.onSearch && opts.onSearch(ui.applied); ui.sel = null; render(); });
      f.q.addEventListener("input", () => { ui.q = f.q.value; if (!f.q.value && ui.applied) { ui.applied = ""; render(); main.querySelector(".ah-find input").focus(); } });
      f.cur.addEventListener("change", () => { ui.cur = f.cur.value; ui.sel = null; render(); });
    }
    $$(".ah-th .th[data-k]").forEach((b) => b.addEventListener("click", () => { const k = b.dataset.k; ui.sort = [k, ui.sort[0] === k ? -ui.sort[1] : 1]; render(); }));
    $$(".ah-row[data-id]").forEach((b) => b.addEventListener("click", () => { ui.sel = ui.sel === b.dataset.id && isMob(el) ? null : b.dataset.id; cardHide(true); render(); if (isMob(el)) main.querySelector(".nv-item.on")?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }));
    $$(".sl").forEach((b) => b.addEventListener("click", () => { const l = find(ui.sel); const i = d.shoppingList.indexOf(l.name); i >= 0 ? d.shoppingList.splice(i, 1) : d.shoppingList.push(l.name); render(); }));
    $$(".buy").forEach((b) => b.addEventListener("click", () => {
      const l = find(ui.sel); if (!l) return;
      if (opts.onBuy && opts.onBuy(l) === false) return;
      if (l.cur === "moss") { d.moss -= l.total; d.purchases.unshift({ ...l, status: "pending" }); toast(el, `${l.name}: payment sent · see Purchases`); }
      else { d.gold -= l.total; toast(el, `Bought ${l.qty > 1 ? fmt(l.qty) + " × " : ""}${l.name}`); }
      d.listings = d.listings.filter((x) => x !== l); d.totalListings--; ui.sel = null; render();
    }));
    $$(".cancel").forEach((b) => b.addEventListener("click", () => {
      const l = find(ui.sel); opts.onCancel && opts.onCancel(l);
      d.mine = d.mine.filter((x) => x !== l); d.listings = d.listings.filter((x) => x.id !== l.id); ui.sel = null; toast(el, `${l.name} returned to your bags`); render();
    }));
    hoverCards(main, (id) => find(id), icon);
    $$(".nv-in .icd-rolls").forEach((x) => x.addEventListener("toggle", () => (ui.rolls = x.open)));
    // sell
    $$(".ah-bi").forEach((b) => b.addEventListener("click", () => { ui.sellId = b.dataset.id; ui.sellQty = 1; ui.sellTotal = ""; render(); if (isMob(el)) main.querySelector(".ah-form")?.scrollIntoView({ block: "start", behavior: "smooth" }); }));
    $(".s-item")?.addEventListener("change", (e) => { ui.sellId = e.target.value; ui.sellQty = 1; ui.sellTotal = ""; render(); });
    const keep = (sel, fn) => { const n = $(sel); if (!n) return; n.addEventListener("input", () => { fn(n.value); const p = n.selectionStart; render(); const m = main.querySelector(sel); m.focus(); try { m.setSelectionRange(p, p); } catch { /* number inputs */ } }); };
    keep(".s-qty", (v) => { const it = d.bag.find((b) => b.id === ui.sellId); ui.sellQty = Math.max(1, Math.min(it.qty, parseInt(v) || 1)); });
    keep(".s-total", (v) => (ui.sellTotal = v));
    $$(".seg button").forEach((b) => b.addEventListener("click", () => { ui.sellCur = b.dataset.c; ui.sellTotal = ""; render(); }));
    $(".match")?.addEventListener("click", () => { const it = d.bag.find((b) => b.id === ui.sellId); const low = Math.min(...d.listings.filter((l) => l.name === it.name && l.cur === ui.sellCur).map((l) => l.total / l.qty)); ui.sellTotal = String(ui.sellCur === "moss" ? +(low * ui.sellQty).toFixed(4) : Math.max(1, Math.floor(low * ui.sellQty))); render(); });
    $(".create")?.addEventListener("click", () => {
      const it = d.bag.find((b) => b.id === ui.sellId), qty = Math.min(ui.sellQty, it.qty), total = parseFloat(ui.sellTotal);
      opts.onList && opts.onList({ item: it, qty, total, cur: ui.sellCur });
      const l = { id: "m" + Date.now(), name: it.name, icon: it.icon, cat: it.cat, qty, total, cur: ui.sellCur, seller: "Benjooie", rarity: it.rarity || "common", mine: true };
      d.mine.unshift(l); it.qty -= qty; if (!it.qty) { d.bag = d.bag.filter((b) => b !== it); ui.sellId = d.bag[0]?.id; }
      ui.sellQty = 1; ui.sellTotal = ""; toast(el, `Listed ${qty > 1 ? fmt(qty) + " × " : ""}${it.name} for ${money(total, l.cur)}`); render();
    });
    // exchange
    keep(".x-gold", (v) => (ui.exGold = v)); keep(".x-moss", (v) => (ui.exMoss = v));
    $(".exlist")?.addEventListener("click", () => { const g = parseFloat(ui.exGold), m = parseFloat(ui.exMoss); opts.onExchangeList && opts.onExchangeList({ gold: g, moss: m }); d.gold -= g; d.exchange.push({ id: "x" + Date.now(), qty: g, total: m, seller: "Benjooie" }); ui.exMoss = ""; toast(el, `Reserved ${fmt(g)} gold · listed for ${fmtM(m)} MOSS`); render(); });
    $$(".ah-row[data-x]").forEach((b) => b.addEventListener("click", () => { ui.exSel = ui.exSel === b.dataset.x && isMob(el) ? null : b.dataset.x; render(); }));
    $$(".exbuy").forEach((b) => b.addEventListener("click", () => { const l = d.exchange.find((x) => x.id === ui.exSel); opts.onExchangeBuy && opts.onExchangeBuy(l); d.moss -= l.total; d.purchases.unshift({ id: "p" + l.id, name: "Gold", icon: "coin-gold", qty: l.qty, total: l.total, cur: "moss", seller: l.seller, status: "pending" }); d.exchange = d.exchange.filter((x) => x !== l); ui.exSel = null; toast(el, "Payment sent · gold arrives when it is confirmed"); render(); }));
    // sold
    $$(".col").forEach((b) => b.addEventListener("click", () => { const s = d.sold.find((x) => x.id === b.dataset.id); opts.onCollect && opts.onCollect(s); s.collected = true; d.moss += s.total; toast(el, `Collected ${fmtM(s.total)} MOSS`); render(); }));
  }
  const onKey = (e) => { if (e.key.toLowerCase() === "b" && !e.target.closest("input,textarea,select") && el.isConnected) { e.preventDefault(); opts.onOpenBags && opts.onOpenBags(); } };
  addEventListener("keydown", onKey);
  render();
  const api = { el, get state() { return d; }, update(p) { Object.assign(d, p); render(); return api; }, setTab(t) { ui.tab = t; ui.sel = null; render(); return api; }, destroy: () => { cardHide(true); removeEventListener("keydown", onKey); el.remove(); } };
  return api;
}

export { cardHtml as itemCardHtml };
