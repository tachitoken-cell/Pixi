// Mossvale UI · mobile: touch controls and the full-screen menu sheet (used by mossvale-ui.js when mobile is on).
//
//   createTouchControls(container, { bar, icon, sets, onMove({x, y, active}), onSprint(on), onJump(), onTarget(), onAttack(),
//                                    onSkill(slotIndex, skill), attackIcon, stamina: 100 })
//     Left:  joystick (Move) + Sprint (with stamina ring) + Jump.
//     Right: big Attack, 5 skills in an arc, Target, and "Bar n / N" to page through the skills (10 slots × 2 sets = 4 bars).
//     Cooldowns come from the action bar, so desktop and mobile share one skill state.
//   createMenuSheet(container, { items: [{ id, label, icon, badge }], onSelect(id) })  → { open(), close(), toggle(), el }

const PER_BAR = 5;

export function createTouchControls(container, o) {
  const el = document.createElement("div");
  el.className = "tc";
  el.innerHTML = `
    <div class="tc-left">
      <div class="tc-row"><button type="button" class="tc-btn sprint" aria-label="Sprint"><svg class="ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18"/><circle class="v" cx="20" cy="20" r="18"/></svg>
          <span class="tc-ic">${ICONS.sprint}</span><span class="lb">Sprint</span></button>
        <button type="button" class="tc-btn jump" aria-label="Jump"><span class="tc-ic">${ICONS.jump}</span><span class="lb">Jump</span></button></div>
      <div class="tc-stick" role="application" aria-label="Move: drag"><div class="base"><i class="n">N</i></div><div class="knob"></div><span class="lb">Move</span></div>
    </div>
    <div class="tc-right">
      <button type="button" class="tc-bar" aria-label="Next skill bar"><span></span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <div class="tc-arc"></div>
      <button type="button" class="tc-btn target" aria-label="Target"><span class="tc-ic">${ICONS.target}</span><span class="lb">Target</span></button>
      <button type="button" class="tc-attack" aria-label="Attack"><img alt=""><span class="lb">Attack</span></button>
    </div>`;
  container.insertBefore(el, container.querySelector(".mv-win"));      // under the windows
  const q = (s) => el.querySelector(s);
  const bars = () => Math.max(1, Math.ceil((o.bar.state.sets.length * 10) / PER_BAR));
  let page = 0, stamina = o.stamina ?? 100, sprinting = false, raf = 0;
  q(".tc-attack img").src = o.attackIcon || "";

  // ---------------------------------------------------------- joystick
  const stick = q(".tc-stick"), knob = q(".tc-stick .knob");
  let sid = null, cx = 0, cy = 0;
  const R = () => stick.getBoundingClientRect().width * .36;
  function move(e) {
    if (e.pointerId !== sid) return;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const r = R(), d = Math.hypot(dx, dy);
    if (d > r) { dx *= r / d; dy *= r / d; }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    o.onMove && o.onMove({ x: dx / r, y: -dy / r, active: true });
  }
  function end(e) {
    if (e.pointerId !== sid) return;
    sid = null; stick.classList.remove("on");
    knob.style.transform = "translate(-50%, -50%)";
    o.onMove && o.onMove({ x: 0, y: 0, active: false });
  }
  stick.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    sid = e.pointerId; stick.setPointerCapture(sid); stick.classList.add("on");
    const b = stick.getBoundingClientRect(); cx = b.left + b.width / 2; cy = b.top + b.height / 2;
    move(e);
  });
  stick.addEventListener("pointermove", move);
  stick.addEventListener("pointerup", end); stick.addEventListener("pointercancel", end);

  // ---------------------------------------------------------- buttons
  const tap = (btn, fn) => btn.addEventListener("pointerdown", (e) => { e.preventDefault(); btn.classList.remove("hit"); void btn.offsetWidth; btn.classList.add("hit"); fn(e); });
  tap(q(".jump"), () => o.onJump && o.onJump());
  tap(q(".target"), () => o.onTarget && o.onTarget());
  tap(q(".tc-attack"), () => o.onAttack && o.onAttack());
  tap(q(".sprint"), () => { if (stamina <= 5 && !sprinting) return; sprinting = !sprinting; q(".sprint").classList.toggle("active", sprinting); o.onSprint && o.onSprint(sprinting); });
  tap(q(".tc-bar"), () => { page = (page + 1) % bars(); renderArc(); });

  function slotOf(k) { const g = page * PER_BAR + k; return { set: Math.floor(g / 10), i: g % 10 }; }
  function renderArc() {
    const arc = q(".tc-arc");
    arc.innerHTML = "";
    for (let k = 0; k < PER_BAR; k++) {
      const { set, i } = slotOf(k), sk = (o.bar.state.sets[set] || [])[i];
      const b = document.createElement("button");
      b.type = "button"; b.className = "tc-skill" + (sk ? "" : " empty"); b.dataset.k = k;
      b.innerHTML = `${sk ? `<img alt="" src="${sk.icon}">` : ""}<span class="cd" hidden></span>`;
      b.setAttribute("aria-label", sk ? sk.name : "Empty slot");
      if (sk) tap(b, () => { if (o.bar.useIn(set, i)) o.onSkill && o.onSkill(set * 10 + i, sk); });
      arc.append(b);
    }
    q(".tc-bar span").textContent = `Bar ${page + 1} / ${bars()}`;
  }
  function tick() {
    el.querySelectorAll(".tc-skill").forEach((b) => {
      const { set, i } = slotOf(+b.dataset.k), c = o.bar.cooldownOf(set, i), cd = b.querySelector(".cd");
      if (!c) { if (!cd.hidden) { cd.hidden = true; b.classList.remove("ready"); void b.offsetWidth; b.classList.add("ready"); } return; }
      cd.hidden = false; cd.style.setProperty("--p", c.frac.toFixed(3)); cd.textContent = c.left >= 1 ? Math.ceil(c.left) : c.left.toFixed(1);
    });
    // stamina: drains while sprinting and moving, refills otherwise
    stamina = Math.max(0, Math.min(100, stamina + (sprinting ? -.18 : .12)));
    if (sprinting && stamina <= 0) { sprinting = false; q(".sprint").classList.remove("active"); o.onSprint && o.onSprint(false); }
    q(".sprint .ring .v").style.strokeDashoffset = (113.1 * (1 - stamina / 100)).toFixed(1);
    q(".sprint").classList.toggle("low", stamina < 20);
    raf = requestAnimationFrame(tick);
  }
  renderArc(); tick();
  return {
    el, renderArc, get page() { return page; }, setPage(p) { page = ((p % bars()) + bars()) % bars(); renderArc(); },
    setStamina(v) { stamina = v; }, destroy() { cancelAnimationFrame(raf); el.remove(); },
  };
}

export function createMenuSheet(container, o) {
  const el = document.createElement("div");
  el.className = "ms"; el.hidden = true;
  el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Menu");
  el.innerHTML = `<div class="ms-panel"><div class="ms-head"><b>Menu</b><button type="button" class="ms-close" aria-label="Close menu">${ICONS.close}</button></div><div class="ms-grid"></div></div>`;
  container.append(el);
  const grid = el.querySelector(".ms-grid");
  grid.innerHTML = o.items.map((it) => `<button type="button" class="ms-tile" data-id="${it.id}"><img alt="" src="${it.icon}">${it.badge ? '<i class="dot"></i>' : ""}<span>${it.label}</span></button>`).join("");
  grid.querySelectorAll(".ms-tile").forEach((b) => b.addEventListener("click", () => { close(); o.onSelect && o.onSelect(b.dataset.id); }));
  el.querySelector(".ms-close").addEventListener("click", () => close());
  el.addEventListener("pointerdown", (e) => { if (e.target === el) close(); });
  function open() { el.hidden = false; requestAnimationFrame(() => el.classList.add("on")); o.onOpen && o.onOpen(); }
  function close() { if (el.hidden) return; el.classList.remove("on"); setTimeout(() => (el.hidden = true), 180); o.onClose && o.onClose(); }
  return { el, open, close, toggle: () => (el.hidden ? open() : close()), get isOpen() { return !el.hidden; } };
}

const ICONS = {
  sprint: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="14" cy="4.5" r="2"/><path d="M8 21l3-6 3 3v4"/><path d="M6 12l3-4 4 1 3 4h3"/><path d="M11 15l1-5"/><path d="M3 9h3M2 13h3"/></svg>`,
  jump: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/><path d="M5 21h14"/></svg>`,
  target: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`,
  close: `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/></svg>`,
};
export { ICONS };
