// ===== Konfiguration =====
const SERVICES = [
  { id: 'beratung', name: 'Kostenlose Beratung & Hautanalyse', duration: 30, price: 'kostenlos' },
  { id: 'laser-haar', name: 'Laser-Haarentfernung', duration: 45, price: 'ab 49 €' },
  { id: 'laser-pigment', name: 'Laser Pigmentflecken', duration: 30, price: 'ab 129 €' },
  { id: 'laser-tattoo', name: 'Tattooentfernung', duration: 30, price: 'ab 99 €' },
  { id: 'gesicht', name: 'Gesichtsbehandlung', duration: 60, price: 'ab 89 €' },
  { id: 'hydrafacial', name: 'Hydrafacial', duration: 50, price: 'ab 149 €' },
  { id: 'microneedling', name: 'Microneedling', duration: 75, price: 'ab 179 €' },
];

// Öffnungszeiten: Wochentag (0 = So) -> [Start, Ende] in Stunden
const HOURS = { 1: [9, 19], 2: [9, 19], 3: [9, 19], 4: [9, 19], 5: [9, 19], 6: [10, 15] };
const SLOT_MINUTES = 30;
const MAX_MONTHS_AHEAD = 3;
const STORAGE_KEY = 'lumea-bookings';

// ===== Hilfsfunktionen =====
const $ = (s) => document.querySelector(s);
const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtDate = (d) => d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const storage = {
  get() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; } },
  set(v) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch { /* ignorieren */ } },
};

// Simuliert bereits belegte Termine (deterministisch pro Tag), damit der Kalender realistisch wirkt
function isDemoBooked(key, time) {
  let h = 0;
  for (const c of key + time) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 4 === 0;
}

function slotsFor(date) {
  const range = HOURS[date.getDay()];
  if (!range) return [];
  const key = dateKey(date);
  const now = new Date();
  const own = storage.get().filter((b) => b.date === key).map((b) => b.time);
  const out = [];
  for (let m = range[0] * 60; m < range[1] * 60; m += SLOT_MINUTES) {
    const time = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
    const slotDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(m / 60), m % 60);
    const taken = slotDate <= now || isDemoBooked(key, time) || own.includes(time);
    out.push({ time, taken });
  }
  return out;
}

// ===== Theme =====
$('#themeToggle').addEventListener('click', () => {
  const current = document.documentElement.dataset.theme
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('lumea-theme', next); } catch { /* ignorieren */ }
});

// ===== Navigation =====
const nav = $('.nav');
const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 20);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

const burger = $('#burger');
const navLinks = $('#navLinks');
burger.addEventListener('click', () => {
  const open = navLinks.classList.toggle('open');
  burger.classList.toggle('open', open);
  burger.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
});
navLinks.addEventListener('click', (e) => {
  if (e.target.tagName === 'A') { navLinks.classList.remove('open'); burger.classList.remove('open'); }
});

// ===== Scroll-Animation =====
// Inhalte bleiben immer sichtbar; nur Elemente unterhalb des Bildschirms heben sich beim Scrollen leicht an
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.remove('pending'); io.unobserve(e.target); } });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach((el) => {
  if (el.getBoundingClientRect().top > innerHeight) { el.classList.add('pending'); io.observe(el); }
});

$('#year').textContent = new Date().getFullYear();

// ===== Buchung =====
const state = { service: null, date: null, time: null, view: startOfDay(new Date()) };
state.view.setDate(1);

// Behandlungen rendern
$('#serviceList').innerHTML = SERVICES.map((s) => `
  <label class="service">
    <input type="radio" name="service" value="${s.id}">
    <span><span class="service__name">${s.name}</span><br><span class="service__meta">${s.duration} Min.</span></span>
    <span class="service__price">${s.price}</span>
  </label>`).join('');

$('#serviceList').addEventListener('change', (e) => {
  state.service = SERVICES.find((s) => s.id === e.target.value);
  updateSummary();
});

// Preis-Buttons wählen die passende Behandlung vor
document.querySelectorAll('[data-pick]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const svc = SERVICES.find((s) => s.name === btn.dataset.pick);
    const input = svc && document.querySelector(`input[name="service"][value="${svc.id}"]`);
    if (input) { input.checked = true; state.service = svc; updateSummary(); }
  });
});

function renderCalendar() {
  const today = startOfDay(new Date());
  const maxDate = new Date(today.getFullYear(), today.getMonth() + MAX_MONTHS_AHEAD, today.getDate());
  const y = state.view.getFullYear();
  const m = state.view.getMonth();

  $('#monthLabel').textContent = state.view.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  $('#prevMonth').disabled = y === today.getFullYear() && m === today.getMonth();
  $('#nextMonth').disabled = new Date(y, m + 1, 1) > maxDate;

  const offset = (new Date(y, m, 1).getDay() + 6) % 7; // Montag zuerst
  const days = new Date(y, m + 1, 0).getDate();
  let html = '<span></span>'.repeat(offset);

  for (let d = 1; d <= days; d++) {
    const date = new Date(y, m, d);
    const free = date >= today && date <= maxDate && slotsFor(date).some((s) => !s.taken);
    const cls = ['day'];
    if (+date === +today) cls.push('today');
    if (state.date && +date === +state.date) cls.push('selected');
    html += `<button type="button" class="${cls.join(' ')}" data-day="${d}" ${free ? '' : 'disabled'}
      aria-label="${fmtDate(date)}">${d}</button>`;
  }
  $('#calendarGrid').innerHTML = html;
}

function renderSlots() {
  const box = $('#slots');
  if (!state.date) { box.innerHTML = ''; $('#slotsLabel').textContent = 'Bitte zuerst ein Datum wählen.'; return; }
  const slots = slotsFor(state.date);
  $('#slotsLabel').textContent = `Freie Zeiten am ${fmtDate(state.date)}`;
  box.innerHTML = slots.map((s) => `
    <button type="button" class="slot ${state.time === s.time ? 'selected' : ''}" data-time="${s.time}" ${s.taken ? 'disabled' : ''}>${s.time}</button>
  `).join('');
}

$('#calendarGrid').addEventListener('click', (e) => {
  const btn = e.target.closest('.day');
  if (!btn || btn.disabled) return;
  state.date = new Date(state.view.getFullYear(), state.view.getMonth(), +btn.dataset.day);
  state.time = null;
  renderCalendar(); renderSlots(); updateSummary();
});

$('#slots').addEventListener('click', (e) => {
  const btn = e.target.closest('.slot');
  if (!btn || btn.disabled) return;
  state.time = btn.dataset.time;
  renderSlots(); updateSummary();
});

$('#prevMonth').addEventListener('click', () => { state.view.setMonth(state.view.getMonth() - 1); renderCalendar(); });
$('#nextMonth').addEventListener('click', () => { state.view.setMonth(state.view.getMonth() + 1); renderCalendar(); });

function updateSummary() {
  const parts = [];
  if (state.service) parts.push(state.service.name);
  if (state.date) parts.push(state.date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }));
  if (state.time) parts.push(`${state.time} Uhr`);
  $('#summary').textContent = parts.length ? parts.join(' · ') : 'Noch keine Auswahl';
}

// Nächsten freien Termin im Hero anzeigen
function showNextSlot() {
  const d = startOfDay(new Date());
  for (let i = 0; i < 30; i++, d.setDate(d.getDate() + 1)) {
    const free = slotsFor(d).find((s) => !s.taken);
    if (free) {
      const label = i === 0 ? 'Heute' : i === 1 ? 'Morgen' : d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
      $('#nextSlot').textContent = `${label}, ${free.time} Uhr`;
      return;
    }
  }
}

// Formular absenden
$('#bookingForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const err = $('#formError');
  const fields = ['name', 'email', 'phone'].map((id) => $('#' + id));
  fields.forEach((f) => f.classList.toggle('invalid', !f.checkValidity() || !f.value.trim()));

  let msg = '';
  if (!state.service) msg = 'Bitte wählen Sie eine Behandlung.';
  else if (!state.date || !state.time) msg = 'Bitte wählen Sie Datum und Uhrzeit.';
  else if (fields.some((f) => f.classList.contains('invalid'))) msg = 'Bitte füllen Sie alle Pflichtfelder korrekt aus.';
  else if (!$('#privacy').checked) msg = 'Bitte stimmen Sie der Datenverarbeitung zu.';
  err.textContent = msg;
  if (msg) return;

  const booking = {
    id: Date.now().toString(36),
    service: state.service.name,
    date: dateKey(state.date),
    time: state.time,
    name: $('#name').value.trim(),
    email: $('#email').value.trim(),
    phone: $('#phone').value.trim(),
    note: $('#note').value.trim(),
  };
  storage.set([...storage.get(), booking]);

  $('#confirmText').textContent =
    `${booking.service} am ${fmtDate(state.date)} um ${booking.time} Uhr. Eine Bestätigung wird an ${booking.email} gesendet.`;
  $('#confirmModal').showModal();

  e.target.reset();
  state.service = null; state.date = null; state.time = null;
  renderCalendar(); renderSlots(); updateSummary(); renderBookings(); showNextSlot();
});

$('#closeModal').addEventListener('click', () => $('#confirmModal').close());

// Eigene Termine anzeigen & stornieren
function renderBookings() {
  const now = new Date();
  const list = storage.get()
    .filter((b) => new Date(`${b.date}T${b.time}`) > now)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  $('#myBookings').hidden = list.length === 0;
  $('#bookingList').innerHTML = list.map((b) => {
    const d = new Date(`${b.date}T${b.time}`);
    return `<li>
      <div><strong>${b.service}</strong><small>${fmtDate(d)} · ${b.time} Uhr</small></div>
      <button type="button" class="cancel-btn" data-id="${b.id}">Stornieren</button>
    </li>`;
  }).join('');
}

$('#bookingList').addEventListener('click', (e) => {
  const btn = e.target.closest('.cancel-btn');
  if (!btn) return;
  // Zweistufige Bestätigung direkt auf der Seite
  if (!btn.classList.contains('armed')) {
    btn.classList.add('armed');
    btn.textContent = 'Wirklich stornieren?';
    setTimeout(() => { btn.classList.remove('armed'); btn.textContent = 'Stornieren'; }, 4000);
    return;
  }
  storage.set(storage.get().filter((b) => b.id !== btn.dataset.id));
  renderBookings(); renderCalendar(); renderSlots(); showNextSlot();
});

renderCalendar();
renderSlots();
renderBookings();
showNextSlot();
