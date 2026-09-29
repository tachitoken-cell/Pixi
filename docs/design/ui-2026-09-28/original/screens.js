// Mossvale UI · screens: loading screen and sign-in screen (phone, tablet and desktop).
//
//   const load = createLoadingScreen(document.body, {
//     logo: "/ui/screens/logo.png",                                          // default: screens/logo.png (the Mossvale logo)
//     title: "Opening the new version...", subtitle: "Your adventure will be back in a moment.",
//     progress: 0,                                                           // 0..1, or null for an endless shimmer
//     tips: ["Contracts reset at dawn.", …], version: "v0.18",
//   });
//   load.setProgress(.4, "Loading Greenwood…"); load.setText("Signing you in...", "One moment."); await load.done(); // fills to 100% and fades
//
//   const login = createLoginScreen(document.body, {
//     background: "/ui/screens/login-forest.jpg", logo: "/ui/screens/logo.png",
//     languages: ["English", "Deutsch", …], language: "English",
//     onSignIn: async (method, { login, email, password }) => { … },       // method: password | google | apple | wallet
//     onRegister: () => {}, onForgot: (login) => {}, onLanguage: (lang) => {},
//     signInUrl: "https://…",                                                // optional "Open sign-in page" link
//     links: [["Your account", "/account"], ["Support", "/support"], ["Privacy", "/privacy"]],
//   });
//   login.setError("Wrong password"); login.setBusy(true); login.destroy();

const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const G = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"/></svg>`;
const APPLE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.4 12.6c0-2.7 2.2-4 2.3-4.1-1.3-1.9-3.3-2.1-4-2.1-1.7-.2-3.3 1-4.2 1-.9 0-2.2-1-3.6-.9A5.4 5.4 0 0 0 2.4 9.3c-2 3.4-.5 8.4 1.4 11.1.9 1.3 2 2.8 3.4 2.8 1.4-.1 1.9-.9 3.5-.9 1.7 0 2.1.9 3.6.9s2.4-1.4 3.3-2.7a11 11 0 0 0 1.5-3.1c0-.1-2.8-1.1-2.7-4.8zM13.7 4.6c.7-.9 1.3-2.2 1.1-3.4-1.1.1-2.4.7-3.1 1.6-.7.8-1.3 2.1-1.1 3.3 1.2.1 2.4-.6 3.1-1.5z"/></svg>`;
const WALLET = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 7l11-3v3"/><circle cx="16" cy="13.5" r="1.4" fill="currentColor"/></svg>`;
const EYE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.6 8.5 2 12 2 12s3.6 7 10 7c1.8 0 3.4-.5 4.8-1.3"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`;
const EXT = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3h4v4M13 3L7.5 8.5M11 9.5V13H3V5h3.5"/></svg>`;
const LEAF = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M27 4C14 4 6 10 6 20c0 2.5.8 4.6 2 6 3-8 8-12 14-14-5 3-9 7-11 14 1 .3 2 .4 3 .4C24 26.4 28 17 27 4z" fill="#6fd46a"/><path d="M11 26.4C13 19 17 15 22 12" fill="none" stroke="#2f7a3a" stroke-width="1.6" stroke-linecap="round"/></svg>`;

const LOGO = new URL("./screens/logo.png", import.meta.url).href;      // the Mossvale logo (logo: false → text wordmark)
const logoHtml = (o, cls) => (o.logo === false ? `<span class="ls-word ${cls}">${LEAF}MOSSVALE</span>` : `<img class="${cls}" alt="Mossvale" src="${esc(o.logo || LOGO)}">`);

// ------------------------------------------------------------------ loading screen
const TIPS = [
  "Adventure contracts refresh at dawn. Hand them in at any board or warden.",
  "Press Tab (or Bar on your phone) to swap between your two skill bars.",
  "Pets and mounts level up with you. Visit them in the Collection.",
  "Party up with friends for bonus contract rewards.",
  "Instant Combat: queue from anywhere and jump straight into a fight.",
];
export function createLoadingScreen(container, o = {}) {
  const el = document.createElement("div");
  el.className = "ld";
  el.setAttribute("role", "progressbar"); el.setAttribute("aria-valuemin", "0"); el.setAttribute("aria-valuemax", "100");
  if (o.background) el.style.setProperty("--bg", `url("${o.background}")`);
  el.innerHTML = `
    <div class="ld-motes" aria-hidden="true">${Array.from({ length: 18 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${6 + (i * 7) % 9}s;--t:-${(i * 13) % 11}s;--z:${.5 + ((i * 5) % 7) / 7}"></i>`).join("")}</div>
    <div class="ld-mid">
      <div class="ld-logo">${logoHtml(o, "")}</div>
      <p class="ld-title"></p>
      <p class="ld-sub"></p>
      <div class="ld-bar"><div class="ld-fill"></div></div>
      <p class="ld-pct"></p>
    </div>
    <p class="ld-tip"><b>Tip</b><span></span></p>
    ${o.version ? `<p class="ld-ver">${esc(o.version)}</p>` : ""}`;
  container.append(el);
  const q = (s) => el.querySelector(s);
  const tips = o.tips === false ? [] : o.tips || TIPS;
  let tipI = Math.floor(Math.random() * Math.max(1, tips.length)), timer = 0, shown = 0, target = 0, raf = 0;
  function setText(title, sub) {
    if (title != null) q(".ld-title").textContent = title;
    if (sub != null) q(".ld-sub").textContent = sub;
  }
  function tip() { if (!tips.length) return (q(".ld-tip").hidden = true); const t = q(".ld-tip span"); t.classList.remove("in"); void t.offsetWidth; t.textContent = tips[tipI++ % tips.length]; t.classList.add("in"); }
  function draw() {                                        // eases the bar toward the real value so jumps look smooth
    shown += (target - shown) * .12; if (Math.abs(target - shown) < .001) shown = target;
    q(".ld-fill").style.transform = `scaleX(${shown})`;
    q(".ld-pct").textContent = `${Math.round(shown * 100)}%`;
    el.setAttribute("aria-valuenow", Math.round(shown * 100));
    raf = shown !== target ? requestAnimationFrame(draw) : 0;
  }
  function setProgress(p, label) {
    const endless = p == null;
    el.classList.toggle("is-endless", endless);
    if (label != null) setText(null, label);
    if (endless) return;
    target = Math.max(0, Math.min(1, p));
    if (!raf) raf = requestAnimationFrame(draw);
  }
  setText(o.title ?? "Opening the new version...", o.subtitle ?? "Your adventure will be back in a moment.");
  setProgress(o.progress === undefined ? null : o.progress);
  tip(); if (tips.length > 1) timer = setInterval(tip, o.tipEvery || 6000);
  function destroy(fade = true) { clearInterval(timer); cancelAnimationFrame(raf); if (!fade) return el.remove(); el.classList.add("out"); setTimeout(() => el.remove(), 450); }
  return {
    el, setProgress, setText, destroy,
    done: () => new Promise((r) => { setProgress(1); setTimeout(() => { destroy(); setTimeout(r, 200); }, 450); }),
  };
}

// ------------------------------------------------------------------ sign-in screen
export function createLoginScreen(container, o = {}) {
  const el = document.createElement("div");
  el.className = "ls";
  if (o.background) el.style.setProperty("--bg", `url("${o.background}")`);
  const langs = o.languages || ["English", "Deutsch", "Français", "Español", "Português", "中文", "日本語", "한국어"];
  const links = o.links === false ? [] : o.links || [["Your account", "#"], ["Support", "#"], ["Privacy", "#"]];
  el.innerHTML = `
    <div class="ls-top">
      <div class="ls-logo">${logoHtml(o, "")}</div>
      <label class="ls-lang"><span>Language</span><select aria-label="Language">${langs.map((l) => `<option${l === (o.language || "English") ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
    </div>
    <div class="ls-card" aria-live="polite">
      <div class="ls-hello"><h1>Welcome to Mossvale</h1><p>Sign in and pick up your adventure.</p></div>
      <div class="ls-social">
        <div class="ls-pair">
          <button type="button" class="ls-btn google" data-m="google">${G}<span>Google</span></button>
          <button type="button" class="ls-btn apple" data-m="apple">${APPLE}<span>Apple</span></button>
        </div>
        <button type="button" class="ls-btn wallet" data-m="wallet">${WALLET}<span>Sign in with wallet</span></button>
      </div>
      <div class="ls-or"><span>or</span></div>
      <form class="ls-form" novalidate>
        <label><span>Username or email</span><input name="login" autocomplete="username" autocapitalize="off" spellcheck="false" required></label>
        <label><span>Password</span><span class="ls-pw"><input type="password" name="password" autocomplete="current-password" required>
          <button type="button" class="ls-eye" aria-label="Show password" aria-pressed="false">${EYE}</button></span></label>
        <div class="ls-row"><button type="button" class="ls-link forgot">Forgot password?</button></div>
        <p class="ls-err" hidden></p>
        <button type="submit" class="ls-btn gold"><span>Sign In</span></button>
        <p class="ls-new">New user? <button type="button" class="ls-link create">Register</button></p>
        ${o.signInUrl ? `<a class="ls-ext" href="${esc(o.signInUrl)}" target="_blank" rel="noopener">${EXT}<span>Open sign-in page</span></a>` : ""}
      </form>
      <p class="ls-small">Already play? Use your usual sign-in to keep your characters.</p>
    </div>
    <div class="ls-foot">
      <p>One account. A world of little adventures.</p>
      ${links.length ? `<nav>${links.map(([t, h]) => `<a href="${esc(h)}" target="_blank" rel="noopener">${esc(t)}</a>`).join("")}</nav>` : ""}
    </div>`;
  container.append(el);
  const q = (s) => el.querySelector(s);
  const form = q(".ls-form");
  let busy = false;
  function setBusy(b) {
    busy = b; el.classList.toggle("is-busy", b);
    el.querySelectorAll(".ls-btn").forEach((x) => (x.disabled = b));
  }
  function setError(msg) { const e = q(".ls-err"); e.textContent = msg || ""; e.hidden = !msg; if (msg) setBusy(false); }
  async function go(method, extra = {}) {
    if (busy) return;
    setError(""); setBusy(true);
    try { o.onSignIn && (await o.onSignIn(method, extra)); } catch (e) { setError(e.message || "Sign-in failed. Please try again."); }
    setBusy(false);
  }
  el.querySelectorAll(".ls-btn[data-m]").forEach((b) => b.addEventListener("click", () => go(b.dataset.m)));
  q(".ls-eye").addEventListener("click", (e) => {
    const b = e.currentTarget, show = form.password.type === "password";
    form.password.type = show ? "text" : "password";
    b.innerHTML = show ? EYE_OFF : EYE; b.setAttribute("aria-pressed", show); b.setAttribute("aria-label", show ? "Hide password" : "Show password");
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const login = form.login.value.trim(), password = form.password.value;
    if (!login) { form.login.focus(); return setError("Enter your username or email."); }
    if (!password) { form.password.focus(); return setError("Enter your password."); }
    go("password", { login, email: login.includes("@") ? login : undefined, password });
  });
  q(".forgot").addEventListener("click", () => { o.onForgot ? o.onForgot(form.login.value.trim()) : setError("We sent you a link to reset your password."); });
  q(".create").addEventListener("click", () => (o.onRegister || o.onCreate || (() => {}))());
  q(".ls-lang select").addEventListener("change", (e) => o.onLanguage && o.onLanguage(e.target.value));
  return {
    el, setError, setBusy,
    destroy(fade = true) { if (!fade) return el.remove(); el.classList.add("out"); setTimeout(() => el.remove(), 400); },
  };
}
