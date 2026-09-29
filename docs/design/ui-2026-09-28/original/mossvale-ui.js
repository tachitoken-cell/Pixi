// Mossvale UI — one file to put the whole HUD and every window into the game.
//
//   import { mountUI } from "./ui/mossvale-ui.js";            // also add ui/mossvale-ui.css, hud.css, windows.css (see README)
//   const ui = await mountUI({ base: "/ui/", player: { name: "Benjooie", cls: "ranger", level: 60, hp: 1238, maxHp: 1238 } });
//   ui.hud.frame.update({ hp: 900 });                            // every component keeps its own update()
//   ui.open("bags");                                             // or press the menu icon / hotkey
//
// Scaling: the UI is designed for 1920 × 1080. It is scaled by ONE number, min(width / 1920, height / 1080),
// so it never stretches: on 2560 × 1440 it is 1.33×, on 1366 × 768 it is 0.71×, on ultrawide it keeps
// its size and just sits in the corners. Windows shrink further if they would not fit the screen.
// Players can change the size with ui.setUserScale(0.8 … 1.4) (the Options › Controls › HUD size slider does this).
//
// Mobile (phones, tablets): mobile: "auto" (default) turns it on for touch screens and small screens. Then the HUD gets
// touch controls (joystick, Sprint, Jump, Attack, 5 skills per bar, Target, bar switch), a Menu button that opens a
// full-screen icon sheet, a compact contract + chat, and every window opens full screen and scrolls. Scale comes from a
// 1000 × 470 design (a 844 × 390 phone ≈ 0.83), also by one number, so nothing stretches. mobile: true / false forces it.
// Sounds: sounds: true (default) plays sfx/*.wav on skills, attack and menus (class from player.cls).

import * as HUD from "./hud.js";
import * as WIN from "./windows.js";
import * as NPC from "./npc.js";
import { createTouchControls, createMenuSheet, ICONS } from "./mobile.js";

const BASE_W = 1920, BASE_H = 1080, MOB_W = 1000, MOB_H = 470;
// mobile menu sheet: [window, label, icon file, extra options]
const MOBILE_MENU = [
  ["bags", "Bags", "menu/bag"], ["board", "Quests", "menu/journal"], ["bags", "Character", "menu/character"], ["spellbook", "Skills", "menu/spellbook"],
  ["talents", "Talents", "menu/talents"], ["workshop", "Craft", "menu/workshop"], ["instantCombat", "Instant Combat", "menu/instant-combat"], ["raid", "Raid", "menu/raid"],
  ["arena", "Arena", "menu-arena"], ["pets", "Pets", "menu/pets"], ["achievements", "Achievements", "menu/achievements"], ["friends", "Friends", "menu/friends"],
  ["referrals", "Referrals", "menu/referrals"], ["wallet", "Account", "menu/profile"], ["store", "Store", "menu/store"], ["nfts", "NFTs", "menu/nfts"],
  ["options", "Settings", "menu/settings"], ["pets", "Mount", "menu-portal", { tab: "mounts" }],
];
const CLASS_SFX = {                     // what the attack / skill buttons sound like per class
  ranger: { attack: ["ranger_bow_release_1", "ranger_bow_release_2", "ranger_bow_release_3"], skill: ["ranger_volley", "ranger_bow_release_2", "ranger_arrow_whoosh"] },
  mage: { attack: ["mage_arcane_zap"], skill: ["mage_fireball_cast", "mage_frost_cast", "mage_spell_charge"] },
  knight: { attack: ["knight_sword_swing_1", "knight_sword_swing_2", "knight_sword_swing_3"], skill: ["knight_sword_swing_heavy", "knight_ground_slam"] },
  cleric: { attack: ["mage_arcane_zap"], skill: ["cleric_heal_cast", "cleric_holy_light", "cleric_buff"] },
};
const WINDOWS = {                       // name -> [create function, data file]
  bags: [WIN.createCharacterWindow, "character"], board: [WIN.createBoardWindow, "board"], talents: [WIN.createTalentWindow, "talents"],
  spellbook: [WIN.createSpellbookWindow, "spellbook"], workshop: [WIN.createWorkshopWindow, "workshop"], instantCombat: [WIN.createArenaWindow, "instant-combat"],
  raid: [WIN.createRaidWindow, "raid"], arena: [WIN.createPvpWindow, "pvp"], pets: [WIN.createCollectionWindow, "collection"],
  achievements: [WIN.createAchievementWindow, "achievements"], friends: [WIN.createFriendsWindow, "friends"], referrals: [WIN.createReferralWindow, "referrals"],
  store: [WIN.createStoreWindow, "store"], nfts: [WIN.createNftWindow, "nfts"], wallet: [WIN.createWalletWindow, "wallet"],
  dungeons: [WIN.createDungeonWindow, "dungeons"], options: [WIN.createOptionsWindow, "options"],
  // NPC windows (npc.js): open them from a Talk option, or straight away with ui.open("auction") etc.
  npcTalk: [NPC.createNpcTalk, null], trainer: [NPC.createTrainerWindow, "trainer"], vendor: [NPC.createVendorWindow, "vendor"],
  bank: [NPC.createBankWindow, "bank"], auction: [NPC.createAuctionWindow, "auction"],
};
// menu icon id -> window name, label, hotkey, icon file (icons/menu/<file>.png)
const MENU = [
  ["bags", "Bag", "B", "bag"], ["board", "Journal", "J", "journal"], ["bags", "Character", "C", "character"], ["spellbook", "Spellbook", "K", "spellbook"],
  ["talents", "Talents", "N", "talents"], ["workshop", "Workshop", "F", "workshop"], ["instantCombat", "Instant Combat", "", "instant-combat"], ["raid", "Raid", "", "raid"],
  ["arena", "Arena matches", "", null], ["pets", "Mounts & pets", "V", "pets"], ["achievements", "Achievements", "Y", "achievements"], ["friends", "Friends", "O", "friends"],
  ["referrals", "Referrals", "", "referrals"], ["store", "Store", "", "store"], ["wallet", "Wallet", "L", "nfts"], ["options", "Options", "", "settings"],
];

export async function mountUI(o = {}) {
  const base = (o.base ?? "./").replace(/\/?$/, "/");
  const icon = o.icon || ((n) => `${base}icons/${n}.png`);
  const root = document.createElement("div");
  root.className = "mv-ui";
  root.innerHTML = `<div class="mv-tl"></div><div class="mv-tr"></div><div class="mv-tc"></div><div class="mv-bl"></div><div class="mv-bc"></div><div class="mv-br"></div><div class="mv-win"></div>`;
  (o.root || document.body).append(root);
  const slot = (c) => root.querySelector(".mv-" + c);
  const dataCache = {};
  const load = async (file) => (dataCache[file] ??= fetch(`${base}data/${file}.json`).then((r) => r.json()));
  let userScale = o.userScale ?? 1, scale = 1, win = null, winName = null;
  const isTouch = () => matchMedia("(pointer: coarse)").matches || (innerWidth <= 950 && innerHeight <= 540) || innerWidth <= 600;
  let mobile = o.mobile === true || (o.mobile !== false && isTouch());
  let tc = null, sheet = null, side = null;

  // ------------------------------------------------------------ sound (Web Audio, loaded on first use)
  const sfx = (() => {
    if (o.sounds === false) return { play() {}, unlock() {} };
    let ctx = null, gain = null; const buf = {};
    const unlock = () => { if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); gain = ctx.createGain(); gain.gain.value = o.volume ?? .7; gain.connect(ctx.destination); } if (ctx.state === "suspended") ctx.resume(); };
    addEventListener("pointerdown", unlock, { once: true, capture: true });
    addEventListener("keydown", unlock, { once: true, capture: true });
    async function play(name) {
      if (!ctx) return;
      const n = Array.isArray(name) ? name[Math.floor(Math.random() * name.length)] : name;
      try {
        buf[n] ??= fetch(`${base}sfx/${n}.wav`).then((r) => r.arrayBuffer()).then((a) => ctx.decodeAudioData(a));
        const b = await buf[n], src = ctx.createBufferSource(); src.buffer = b; src.connect(gain); src.start();
      } catch (e) { /* missing sound: ignore */ }
    }
    return { play, unlock, setVolume: (v) => gain && (gain.gain.value = v) };
  })();
  const clsKey = (c) => ({ ranger: "ranger", archer: "ranger", mage: "mage", wizard: "mage", knight: "knight", warrior: "knight", cleric: "cleric", priest: "cleric" })[String(c).toLowerCase()] || "ranger";

  // ------------------------------------------------------------ HUD
  const p = { name: "Adventurer", cls: "ranger", title: "", level: 1, hp: 100, maxHp: 100, portrait: icon("portrait"), ...(o.player || {}) };
  const hud = {};
  hud.frame = HUD.createPlayerFrame(slot("tl"), p);
  hud.minimap = HUD.createMinimap(slot("tr"), { zone: "Greenwood", levels: "1–6", time: "12:00", phase: "Day", map: `${base}maps/greenwood.svg`, mapSize: [600, 600],
    zoom: .62, minZoom: .35, player: { x: 300, y: 318, dir: 0 }, playerLevel: p.level, onOpenMap: o.onOpenMap, ...(o.minimap || {}) });
  hud.contract = o.contract === null ? null : HUD.createContractCard(slot("tr"), { title: "Keep the trails clear", desc: "Return to a Greenwood board or warden", done: 0, goal: 4, xp: 60, gold: 18, ...(o.contract || {}) });
  hud.chat = HUD.createChatBox(slot("bl"), { onSend: (ch, text) => (o.onChat ? o.onChat(ch, text) : hud.chat.add({ ch, name: p.name, text })), ...(o.chat || {}) });
  hud.bar = HUD.createActionBar(slot("bc"), { level: p.level, xp: 0, xpMax: 1, job: 1, jobXp: 0, jobXpMax: 1, sets: [[], []], ...(o.bar || {}) });
  // target frame: whoever you clicked (enemy, boss, NPC, player). Desktop: top centre. Mobile: takes the contract's place.
  hud.target = HUD.createTargetFrame(slot("tc"), { hidden: true, playerLevel: p.level,
    onAction: (id, t) => { sfx.play("ui_tap"); o.onTargetAction && o.onTargetAction(id, t); },
    onClose: () => { clearTarget(); o.onTargetClear && o.onTargetClear(); } });
  hud.target.onShow = () => { if (mobile && hud.contract) hud.contract.el.hidden = true; };
  hud.target.onHide = () => { if (hud.contract) hud.contract.el.hidden = false; };
  function setTarget(t) {
    if (!t) return clearTarget();
    const same = hud.target.visible && hud.target.state.name === t.name;
    const fresh = { title: "", cls: "", portrait: "", rank: "", cast: null, phases: null, level: null, maxHp: 0, hp: t.maxHp ?? 0 };   // new target: nothing carries over
    hud.target.show({ ...(same ? {} : fresh), playerLevel: p.level, ...t });
    return hud.target;
  }
  function clearTarget() { hud.target.hide(); }
  hud.contract && hud.contract.el.addEventListener("click", () => mobile && hud.contract.el.classList.toggle("is-open"));
  hud.menu = HUD.createMenuDock(slot("br"), {
    profile: icon("menu/profile"),
    items: MENU.map(([id, label, key, file]) => ({ id, label, key, icon: file ? icon("menu/" + file) : icon("menu-arena") })),
    onSelect: (id) => (id === "profile" ? open("bags") : open(id)),
  });

  // ------------------------------------------------------------ mobile layer
  function setMobile(on) {
    mobile = on;
    root.classList.toggle("mv-mobile", on);
    if (on && !tc) {
      // compact HUD: contract + chat go under the player frame, menu + map buttons next to the minimap
      if (hud.contract) slot("tl").append(hud.contract.el);
      slot("tl").append(hud.target.el, hud.chat.el);
      if (hud.target.visible && hud.contract) hud.contract.el.hidden = true;
      hud.chat.el.classList.add("is-mini");
      hud.chat.el.addEventListener("click", chatOpen);
      side = document.createElement("div");
      side.className = "mv-side";
      side.innerHTML = `<button type="button" class="mv-round" data-a="menu" aria-label="Menu">${ICONS.menu}<span>Menu</span></button>
        <button type="button" class="mv-round" data-a="bags" aria-label="Bags"><img alt="" src="${icon("menu/bag")}"><span>Bags</span></button>
        <button type="button" class="mv-round" data-a="chat" aria-label="Chat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg><span>Chat</span></button>`;
      slot("tr").prepend(side);
      side.addEventListener("click", (e) => {
        const a = e.target.closest("button")?.dataset.a; if (!a) return;
        sfx.play("ui_tap");
        if (a === "menu") sheet.toggle(); else if (a === "chat") chatOpen(e); else open(a);
      });
      sheet = createMenuSheet(root, {
        items: [...MOBILE_MENU.map(([id, label, file], i) => ({ id: String(i), label, icon: icon(file), badge: id === "friends" })),
                ...(o.menuExtra || []).map((x, i) => ({ id: "x" + i, label: x.label, icon: icon(x.icon), badge: false }))],
        onSelect: (i) => { if (i[0] === "x") return o.menuExtra[+i.slice(1)].onSelect(); const [id, , , extra] = MOBILE_MENU[+i]; open(id, extra || {}); },
        onOpen: () => sfx.play("ui_open"),
      });
      const k = clsKey(p.cls), S = CLASS_SFX[k];
      tc = createTouchControls(root, {
        bar: hud.bar, attackIcon: o.attackIcon || icon({ ranger: "spell-quick-shot", mage: "spell-starfall", knight: "gear-weapon", cleric: "skill-forest-ward" }[k]),
        onMove: o.onMove, onSprint: o.onSprint, onJump: () => { sfx.play("ui_tap"); o.onJump && o.onJump(); },
        onTarget: () => { sfx.play("ui_tap"); o.onTarget && o.onTarget(); },
        onAttack: () => { sfx.play(S.attack); o.onAttack && o.onAttack(); },
        onSkill: (idx, sk) => { sfx.play(S.skill); o.onSkill && o.onSkill(idx, sk); },
      });
    }
    if (!on && tc) {
      tc.destroy(); tc = null; sheet.el.remove(); sheet = null; side.remove(); side = null;
      hud.chat.el.classList.remove("is-mini"); hud.chat.el.removeEventListener("click", chatOpen);
      slot("bl").append(hud.chat.el); if (hud.contract) { slot("tr").append(hud.contract.el); hud.contract.el.hidden = false; }
      slot("tc").append(hud.target.el);
    }
    fit();
  }
  let chatBack = null;
  function chatOpen(e) {
    if (!hud.chat.el.classList.contains("is-mini")) return;
    e && e.stopPropagation();
    hud.chat.update({ collapsed: false });
    hud.chat.el.classList.remove("is-mini");
    hud.chat.focus();
    chatBack = (ev) => { if (!hud.chat.el.contains(ev.target)) chatMini(); };
    setTimeout(() => chatBack && addEventListener("pointerdown", chatBack, true));
  }
  function chatMini() {
    hud.chat.el.classList.add("is-mini");
    if (chatBack) { removeEventListener("pointerdown", chatBack, true); chatBack = null; }
    document.activeElement && hud.chat.el.contains(document.activeElement) && document.activeElement.blur();
  }
  // phone: the arrow closes the open chat back to its 2-line mini view (desktop keeps collapse / expand)
  hud.chat.el.addEventListener("click", (e) => {
    if (!mobile || !e.target.closest(".ch-hide") || hud.chat.el.classList.contains("is-mini")) return;
    e.stopPropagation(); e.preventDefault(); chatMini();
  }, true);

  // ------------------------------------------------------------ scaling (no stretching, always on screen)
  function fit() {
    const w = innerWidth, h = innerHeight;
    scale = mobile ? Math.max(.62, Math.min(1.25, Math.min(w / MOB_W, h / MOB_H))) * userScale
                   : Math.max(o.minScale ?? .5, Math.min(w / BASE_W, h / BASE_H)) * userScale;
    root.style.setProperty("--s", scale.toFixed(4));
    for (const c of Object.values(hud)) c && c.el.style.setProperty("--hud-scale", scale.toFixed(4));
    // narrow screens (portrait phones, small windows): lift the skill bar above the chat + menu row
    const bottomRow = (330 + 540 + 360 + 80) * scale;
    root.classList.toggle("is-narrow", !mobile && w < bottomRow);
    fitWindow();
  }
  function fitWindow() {
    if (!win) return;
    if (mobile) {                                      // full screen: readable size, content scrolls instead of shrinking
      win.el.style.setProperty("--win-scale", (Math.min(1, Math.max(.8, Math.min(innerWidth, innerHeight * 2.2) / 1000)) * Math.min(userScale, 1.2)).toFixed(4));
      return;
    }
    win.el.style.setProperty("--win-scale", 1);
    const s = Math.min(scale, (innerWidth - 24) / win.el.offsetWidth, (innerHeight - 24) / win.el.offsetHeight);
    win.el.style.setProperty("--win-scale", Math.max(.3, s).toFixed(4));
  }
  addEventListener("resize", fit);
  new ResizeObserver(fitWindow).observe(slot("win"));

  // ------------------------------------------------------------ windows
  async function open(name, extra = {}) {
    if (winName === name) return close();
    const def = WINDOWS[name];
    if (!def) return console.warn("mossvale-ui: unknown window", name);
    close();
    const data = extra.data || (await load(def[1]));
    const common = { icon, onClose: close, ...(o.windows?.[name] || {}), ...extra };
    if (name === "bags") common.character ??= `${base}icons/character-benjooie.jpg`;
    if (name === "friends") common.onDungeons ??= () => open("dungeons");
    if (name === "wallet") common.onOpenNfts ??= () => open("nfts");
    if (name === "trainer") common.onOpenSpellbook ??= () => open("spellbook");
    if (name === "bank" || name === "auction") common.onOpenBags ??= () => open("bags");
    if (name === "npcTalk") common.onSelect ??= (opt) => (opt.open ? open(opt.open) : close());
    if (name === "options") {
      common.onOpenWallet ??= () => open("wallet");
      const user = common.onChange;
      common.onChange = (id, v, all) => { if (id === "hudScale") setUserScale(v / 100); user && user(id, v, all); };
    }
    winName = name;
    win = def[0](slot("win"), data, common);
    slot("win").classList.add("is-open"); root.classList.add("has-win");
    sfx.play("ui_open");
    fitWindow();
    return win;
  }
  function close() {
    if (!win) return;
    win.destroy(); win = null; winName = null;
    slot("win").classList.remove("is-open"); root.classList.remove("has-win");
    sfx.play("ui_close");
  }
  slot("win").addEventListener("pointerdown", (e) => { if (e.target === slot("win")) close(); });

  // ------------------------------------------------------------ keys (skills 1-0, Tab, window hotkeys, Esc, Enter)
  const keyMap = Object.fromEntries(MENU.filter((m) => m[2]).map(([id, , key]) => [key.toLowerCase(), id]));
  function onKey(e) {
    if (o.keys === false || e.target.closest?.("input, textarea, select, [contenteditable]")) return;
    const k = e.key.toLowerCase();
    if (k === "escape" && win) { e.preventDefault(); close(); return; }
    if (k === "escape" && hud.target.visible) { e.preventDefault(); hud.target.el.querySelector(".tf-close").click(); return; }
    if (k === "enter") { e.preventDefault(); hud.chat.focus(); return; }
    if (win) return;                                   // skills and hotkeys only while no window is open
    const i = "1234567890".indexOf(k);
    if (i >= 0) { hud.bar.use(i); return; }
    if (k === "tab") { e.preventDefault(); hud.bar.setSet(1 - hud.bar.state.set); return; }
    if (k === "m" && o.onOpenMap) { o.onOpenMap(); return; }
    if (keyMap[k]) open(keyMap[k]);
  }
  addEventListener("keydown", onKey);

  // talk to an NPC by id (data/npc-talk.json) or with your own { npc, text, options }
  async function talkTo(who) {
    const data = typeof who === "string" ? (await load("npc-talk")).npcs[who] : who;
    if (!data) return console.warn("mossvale-ui: no talk data for", who);
    if (winName === "npcTalk") close();
    return open("npcTalk", { data });
  }
  function setUserScale(v) { userScale = Math.max(.6, Math.min(1.6, v)); fit(); }
  hud.bar.update({ onUse: (i, sk) => { if (!mobile) { sfx.play(CLASS_SFX[clsKey(p.cls)].skill); o.onSkill && o.onSkill(hud.bar.state.set * 10 + i, sk); } } });
  setMobile(mobile);

  return {
    hud, open, close, talkTo, setUserScale, setMobile, setTarget, clearTarget, root, sfx,
    get target() { return hud.target.visible ? hud.target.state : null; },
    get mobile() { return mobile; }, get touch() { return tc; }, get menuSheet() { return sheet; },
    get scale() { return scale; }, get window() { return win; }, get windowName() { return winName; },
    destroy() { close(); tc && tc.destroy(); removeEventListener("resize", fit); removeEventListener("keydown", onKey); root.remove(); },
  };
}
