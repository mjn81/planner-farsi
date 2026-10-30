import { STR } from './i18n.js';
import * as Sync from './sync.js';
import { todayISO, addDays, partsIn, isoFromParts, monthNames, fmtDate } from './dates.js';

const KEY = 'daily-plan-30:v1';
const DAYS = 30;
const THEMES = [['green', '#23513f'], ['sage', '#7a8467'], ['lime', '#d2d26b'], ['tan', '#a69373'], ['peach', '#f5dec8']];
const HOURS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 1];

/* ---------------------------------------------------------------- state */
const newDay = () => ({
  u: 0, status: '', mood: 0, bed: '', wake: '', focus: '', hours: '', water: 0, workout: '',
  meals: '', title: '', sched: {}, summary: '',
  subjects: [0, 1, 2, 3].map(() => ({ title: '', items: Array.from({ length: 6 }, () => ({ t: '', d: false })) })),
});

function defaults() {
  const fa = (navigator.language || '').toLowerCase().startsWith('fa');
  return { v: 1, lang: fa ? 'fa' : 'en', cal: fa ? 'jalali' : 'gregorian', theme: 'green', epoch: 0, mu: {}, title: '', from: todayISO(), summary: '', days: {} };
}

function normalize(raw) {
  const s = { ...defaults(), ...(raw && typeof raw === 'object' ? raw : {}) };
  if (!['en', 'fa'].includes(s.lang)) s.lang = 'en';
  if (!['gregorian', 'jalali'].includes(s.cal)) s.cal = 'gregorian';
  if (!THEMES.some(([k]) => k === s.theme)) s.theme = 'green';
  if (typeof s.epoch !== 'number') s.epoch = 0;
  if (!s.mu || typeof s.mu !== 'object') s.mu = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.from)) s.from = todayISO();
  if (typeof s.days !== 'object' || !s.days) s.days = {};
  for (const k of Object.keys(s.days)) {
    const n = Number(k);
    if (!(n >= 1 && n <= DAYS)) { delete s.days[k]; continue; }
    const base = newDay();
    const d = { ...base, ...s.days[k] };
    d.subjects = base.subjects.map((b, i) => {
      const src = (s.days[k].subjects || [])[i] || {};
      return { title: String(src.title || ''), items: b.items.map((it, j) => ({ ...it, ...((src.items || [])[j] || {}) })) };
    });
    d.sched = d.sched && typeof d.sched === 'object' ? d.sched : {};
    s.days[k] = d;
  }
  return s;
}

let state;
try { state = normalize(JSON.parse(localStorage.getItem(KEY))); } catch { state = normalize(null); }

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full/blocked */ } }, 250);
  scheduleSync(6000);
}
window.addEventListener('pagehide', () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} });
try { navigator.storage?.persist?.(); } catch {}

const now = () => Date.now();
const touchDay = (n) => { getDay(n).u = now(); };
const touchField = (f) => { state.mu[f] = now(); };
const getDay = (n) => (state.days[n] ||= newDay());
const t = (k, vars) => {
  let s = STR[state.lang][k];
  if (vars) for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, b);
  return s;
};
const fa = () => state.lang === 'fa';
const num = (n) => (fa() ? Number(n).toLocaleString('fa-IR', { useGrouping: false }) : String(n));
const pad2 = (n) => {
  const s = String(n).padStart(2, '0');
  return fa() ? s.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]) : s;
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateOf = (n) => addDays(state.from, n - 1);

/* ---------------------------------------------------------------- icons */
const ICON = {
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  dots: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg>',
  chev: '<svg class="flip" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chevL: '<svg class="flip" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 17.9 8.6 4.7 4.7 0 0 1 17.5 18z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  cross: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
};

const MOUTH = {
  1: 'M9 21 Q14 15.5 19 21',
  2: 'M10 20 Q14 17.5 18 20',
  3: 'M10 19 H18',
  4: 'M9 17 Q14 22 19 17',
  5: 'M8 16 Q14 25 20 16 Z',
};
function face(v, on = true, size = 30) {
  const eyes = v === 5
    ? '<path d="M8.5 11.5 Q10.2 8.8 12 11.5 M16 11.5 Q17.8 8.8 19.5 11.5" fill="none"/>'
    : '<circle cx="10" cy="11" r="1.5" class="f"/><circle cx="18" cy="11" r="1.5" class="f"/>';
  const mouth = `<path d="${MOUTH[v] || MOUTH[3]}" fill="${v === 5 ? 'currentColor' : 'none'}"/>`;
  return `<svg class="face ${on ? 'on' : ''}" width="${size}" height="${size}" viewBox="0 0 28 28" aria-hidden="true"><circle class="bg" cx="14" cy="14" r="12.5"/><g class="ft">${eyes}${mouth}</g></svg>`;
}
const glass = (on) =>
  `<svg class="glass ${on ? 'on' : ''}" viewBox="0 0 20 26" aria-hidden="true"><path d="M3 3h14l-1.8 19.2a2 2 0 0 1-2 1.8H6.8a2 2 0 0 1-2-1.8z"/></svg>`;

/* ---------------------------------------------------------------- views */
function navHTML(view, dayN) {
  const opts = Array.from({ length: DAYS }, (_, i) => i + 1)
    .map((n) => `<option value="${n}" ${n === dayN ? 'selected' : ''}>${esc(t('dayN', { n: num(n) }))}</option>`).join('');
  return `<header class="topbar" data-noprint>
    <a class="tb ${view === 'cover' ? 'cur' : ''}" href="#/" aria-label="${esc(t('navCover'))}" title="${esc(t('navCover'))}">${ICON.home}</a>
    <a class="tb ${view === 'cal' ? 'cur' : ''}" href="#/calendar" aria-label="${esc(t('navCalendar'))}" title="${esc(t('navCalendar'))}">${ICON.cal}</a>
    <label class="daysel ${view === 'day' ? 'cur' : ''}"><span class="sr">${esc(t('navDay'))}</span>
      <select id="daySelect" aria-label="${esc(t('navDay'))}"><option value="" ${dayN ? '' : 'selected'} disabled>${esc(t('navDay'))}…</option>${opts}</select></label>
    <span class="sp"></span>
    <button class="tb sync" data-act="sync" data-state="${syncState}" aria-label="${esc(t('syncState')[syncState])}" title="${esc(t('syncState')[syncState])}">${ICON.cloud}</button>
    <button class="tb txt" data-act="lang" aria-label="${esc(t('language'))}">${fa() ? 'EN' : 'فارسی'}</button>
    <button class="tb" data-act="menu" aria-label="${esc(t('menu'))}" aria-haspopup="true">${ICON.dots}</button>
  </header>`;
}

function coverHTML() {
  const done = Object.values(state.days).filter((d) => d.status === 'done').length;
  const dots = Array.from({ length: DAYS }, (_, i) => {
    const n = i + 1;
    const d = state.days[n];
    return `<a class="dot ${d?.status === 'done' ? 'done' : ''} ${d?.status === 'miss' ? 'miss' : ''}" href="#/day/${n}" aria-label="${esc(t('dayN', { n: num(n) }))}"><span>${num(n)}</span></a>`;
  }).join('');
  return `<section class="paper cover">
    <div class="swatches" role="group" aria-label="${esc(t('theme'))}">${THEMES.map(([k, c]) => `<button style="background:${c}" data-act="theme" data-v="${k}" aria-pressed="${state.theme === k}" aria-label="${esc(t('themes')[k])}" title="${esc(t('themes')[k])}"></button>`).join('')}</div>
    <div class="cover-text">
      <p class="kicker">${esc(t('coverKicker'))}</p>
      <h1 class="big"><span>${esc(t('coverLine1'))}</span><span>${esc(t('coverLine2'))}</span></h1>
    </div>
    <div class="cover-side">
      <div class="dots">${dots}</div>
      <p class="prog">${esc(t('progress', { n: num(done) }))}</p>
      <a class="btn" href="#/calendar">${esc(t('openCalendar'))} ${ICON.chev}</a>
    </div>
  </section>`;
}

function dateSelectsHTML() {
  const p = partsIn(state.from, state.cal);
  const names = monthNames(state.lang, state.cal);
  const cy = partsIn(todayISO(), state.cal).year;
  const y0 = Math.min(cy - 1, p.year), y1 = Math.max(cy + 2, p.year);
  const days = Array.from({ length: 31 }, (_, i) => i + 1).map((d) => `<option value="${d}" ${d === p.day ? 'selected' : ''}>${num(d)}</option>`).join('');
  const months = names.map((m, i) => `<option value="${i + 1}" ${i + 1 === p.month ? 'selected' : ''}>${esc(m)}</option>`).join('');
  let years = '';
  for (let y = y0; y <= y1; y++) years += `<option value="${y}" ${y === p.year ? 'selected' : ''}>${num(y)}</option>`;
  return `<span class="dsel" data-dsel>
    <select data-part="day" aria-label="${esc(t('day'))}">${days}</select>
    <select data-part="month" aria-label="${esc(t('month'))}">${months}</select>
    <select data-part="year" aria-label="${esc(t('year'))}">${years}</select></span>`;
}

function calHTML() {
  const cells = Array.from({ length: DAYS }, (_, i) => {
    const n = i + 1;
    const d = getDay(n);
    const st = d.status;
    const stLabel = st === 'done' ? t('statusDone') : st === 'miss' ? t('statusMiss') : t('statusNone');
    return `<div class="cell ${st}">
      <div class="chead"><a class="num" href="#/day/${n}" aria-label="${esc(t('dayN', { n: num(n) }))}">${pad2(n)}</a><span class="cdate">${esc(fmtDate(dateOf(n), state.lang, state.cal, 'short'))}</span></div>
      <input class="ctime" type="time" data-bind="days.${n}.bed" value="${esc(d.bed)}" aria-label="${esc(t('bed'))} — ${esc(t('dayN', { n: num(n) }))}">
      <div class="cbtns">
        <button class="stat ${st}" data-act="status" data-n="${n}" aria-label="${esc(stLabel)}" title="${esc(stLabel)}">${st === 'done' ? ICON.check : st === 'miss' ? ICON.cross : ''}</button>
        <button class="facebtn" data-act="moodpick" data-n="${n}" aria-label="${esc(t('mood'))}">${d.mood ? face(d.mood, true, 32) : face(3, false, 32)}</button>
      </div>
    </div>`;
  }).join('');
  const to = addDays(state.from, DAYS - 1);
  return `<section class="paper cal">
    <div class="cal-top">
      <h2 class="title">${esc(t('calTitle'))}</h2>
      <div class="range">
        <div class="rf"><span class="lab">${esc(t('from'))}</span>${dateSelectsHTML()}</div>
        <div class="rf"><span class="lab">${esc(t('to'))}</span><span class="to">${esc(fmtDate(to, state.lang, state.cal, 'medium'))}</span></div>
      </div>
    </div>
    <div class="banner"><input class="hand" data-bind="title" value="${esc(state.title)}" placeholder="${esc(t('challengePlaceholder'))}" aria-label="${esc(t('challengePlaceholder'))}"></div>
    <div class="cal-grid">${cells}
      <div class="cell summary"><span class="lab">${esc(t('summary'))}</span><textarea class="hand lined" data-bind="summary" aria-label="${esc(t('summary'))}">${esc(state.summary)}</textarea></div>
    </div>
    <p class="quote">${esc(t('quote'))}</p>
  </section>`;
}

function sleepText(bed, wake) {
  if (!bed || !wake) return '';
  const [bh, bm] = bed.split(':').map(Number), [wh, wm] = wake.split(':').map(Number);
  const diff = (wh * 60 + wm - (bh * 60 + bm) + 1440) % 1440;
  const h = Math.floor(diff / 60), m = diff % 60;
  return fa() ? `${num(h)} ساعت${m ? ` و ${num(m)} دقیقه` : ''}` : `${h}h${m ? ` ${m}m` : ''}`;
}

function dayHTML(n) {
  const d = getDay(n);
  const B = (p) => `data-bind="days.${n}.${p}"`;
  const sched = HOURS.map((h) => {
    const k = String(h).padStart(2, '0');
    return `<div class="hr"><span class="hl">${pad2(h)}</span><input class="hand" ${B(`sched.${k}`)} value="${esc(d.sched[k] || '')}" aria-label="${pad2(h)}"></div>`;
  }).join('');
  const subjects = d.subjects.map((s, i) => {
    const rows = s.items.map((it, j) => `<div class="task"><input type="checkbox" ${B(`subjects.${i}.items.${j}.d`)} ${it.d ? 'checked' : ''} aria-label="${esc(t('taskPlaceholder'))}"><input class="hand ${it.d ? 'dn' : ''}" ${B(`subjects.${i}.items.${j}.t`)} value="${esc(it.t)}"></div>`).join('');
    return `<div class="card subj"><div class="bar sage"><span class="bl">${esc(t('subject', { n: num(i + 1) }))}</span><input class="hand" ${B(`subjects.${i}.title`)} value="${esc(s.title)}" placeholder="${esc(t('subjectPlaceholder'))}" aria-label="${esc(t('subject', { n: num(i + 1) }))}"></div><div class="tasks">${rows}</div></div>`;
  }).join('');
  const moods = [1, 2, 3, 4, 5].map((v) => `<button class="mood ${d.mood === v ? 'sel' : ''}" data-act="mood" data-n="${n}" data-v="${v}" aria-label="${esc(t('moods')[v - 1])}" aria-pressed="${d.mood === v}">${face(v, d.mood === v, 28)}</button>`).join('');
  const glasses = Array.from({ length: 8 }, (_, i) => `<button class="gl" data-act="water" data-n="${n}" data-v="${i + 1}" aria-label="${esc(t('water'))} ${num(i + 1)}" aria-pressed="${d.water > i}">${glass(d.water > i)}</button>`).join('');
  const st = d.status;
  const stLabel = st === 'done' ? t('statusDone') : st === 'miss' ? t('statusMiss') : t('statusNone');

  return `<section class="paper day" data-day="${n}">
    <div class="day-top">
      <button class="nb" data-act="go" data-n="${Math.max(1, n - 1)}" ${n === 1 ? 'disabled' : ''} aria-label="${esc(t('prev'))}">${ICON.chevL}</button>
      <h2 class="title">${esc(t('dayN', { n: num(n) }))}</h2>
      <button class="nb" data-act="go" data-n="${Math.min(DAYS, n + 1)}" ${n === DAYS ? 'disabled' : ''} aria-label="${esc(t('next'))}">${ICON.chev}</button>
      <div class="banner grow"><input class="hand" ${B('title')} value="${esc(d.title)}" placeholder="${esc(t('dayTitlePlaceholder'))}" aria-label="${esc(t('dayTitlePlaceholder'))}"></div>
      <button class="stat big ${st}" data-act="status" data-n="${n}" aria-label="${esc(stLabel)}" title="${esc(stLabel)}">${st === 'done' ? ICON.check : st === 'miss' ? ICON.cross : ''}</button>
    </div>
    <div class="day-grid">
      <div class="col left">
        <div class="card"><div class="bar lime"><span class="bl">${esc(t('aboutToday'))}</span></div>
          <div class="fld"><label>${esc(t('date'))}</label><span class="val">${esc(fmtDate(dateOf(n), state.lang, state.cal, 'long'))}</span></div>
          <div class="fld"><label for="f-focus">${esc(t('focus'))}</label><input id="f-focus" class="hand" ${B('focus')} value="${esc(d.focus)}"></div>
          <div class="fld"><label for="f-hours">${esc(t('hours'))}</label><input id="f-hours" class="hand" ${B('hours')} value="${esc(d.hours)}"></div>
        </div>
        <div class="card"><div class="bar lime"><span class="bl">${esc(t('health'))}</span></div>
          <div class="fld two"><div><label for="f-wake">${esc(t('wake'))}</label><input id="f-wake" type="time" class="hand" ${B('wake')} value="${esc(d.wake)}"></div>
            <div><label for="f-bed">${esc(t('bed'))}</label><input id="f-bed" type="time" class="hand" ${B('bed')} value="${esc(d.bed)}"></div></div>
          <div class="fld"><label>${esc(t('sleep'))}</label><span class="val hand" id="sleepOut">${esc(sleepText(d.bed, d.wake))}</span></div>
          <div class="fld"><label>${esc(t('mood'))}</label><div class="moods">${moods}</div></div>
          <div class="fld"><label>${esc(t('water'))}</label><div class="glasses">${glasses}</div></div>
          <div class="fld"><label for="f-work">${esc(t('workout'))}</label><input id="f-work" class="hand" ${B('workout')} value="${esc(d.workout)}"></div>
        </div>
        <div class="card"><div class="bar lime"><span class="bl">${esc(t('meals'))}</span></div>
          <textarea class="hand lined meals" ${B('meals')} placeholder="${esc(t('mealsPlaceholder'))}" aria-label="${esc(t('meals'))}">${esc(d.meals)}</textarea></div>
      </div>
      <div class="col mid">
        <div class="card sched"><div class="bar sage"><span class="bl">${esc(t('schedule'))}</span></div><div class="hours">${sched}</div></div>
      </div>
      <div class="col right">
        <div class="subjects">${subjects}</div>
        <div class="card sum"><div class="bar dark"><span class="bl">${esc(t('dailySummary'))}</span></div>
          <textarea class="hand lined" ${B('summary')} placeholder="${esc(t('summaryPlaceholder'))}" aria-label="${esc(t('dailySummary'))}">${esc(d.summary)}</textarea></div>
      </div>
    </div>
  </section>`;
}

/* --------------------------------------------------------------- render */
const app = document.getElementById('app');
let current = { view: 'cover', n: 0 };

function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const m = h.match(/^day\/(\d+)/);
  if (m && +m[1] >= 1 && +m[1] <= DAYS) return { view: 'day', n: +m[1] };
  if (h.startsWith('calendar')) return { view: 'cal', n: 0 };
  return { view: 'cover', n: 0 };
}

function applyTheme() {
  const root = document.documentElement;
  root.dataset.theme = state.theme;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim());
}

function render(keepScroll = false) {
  const y = window.scrollY;
  closePop();
  current = route();
  const root = document.documentElement;
  root.lang = state.lang;
  root.dir = fa() ? 'rtl' : 'ltr';
  applyTheme();
  document.title = `${t('appName')} · ${t('coverKicker')}`;
  const body = current.view === 'day' ? dayHTML(current.n) : current.view === 'cal' ? calHTML() : coverHTML();
  app.innerHTML = `${navHTML(current.view, current.n)}<main class="view-${current.view}">${body}</main><footer class="credit">${esc(t('madeBy'))} <a href="https://github.com/mjn81" target="_blank" rel="noopener noreferrer">mjn</a></footer><div id="toast" role="status" aria-live="polite"></div>`;
  window.scrollTo(0, keepScroll ? y : 0);
}
window.addEventListener('hashchange', () => render());

/* ------------------------------------------------------------ utilities */
function setPath(path, val) {
  const parts = path.split('.');
  let o = state;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (o === state.days && !o[k]) o[k] = newDay();
    o = o[k];
  }
  o[parts[parts.length - 1]] = val;
  if (parts[0] === 'days') touchDay(parts[1]); else if (parts[0] === 'title' || parts[0] === 'summary') touchField(parts[0]);
  save();
}

let toastT;
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 2200);
}

let pop = null;
function closePop() { pop?.remove(); pop = null; }
function openPop(anchor, html, cls = '') {
  closePop();
  pop = document.createElement('div');
  pop.className = `pop ${cls}`;
  pop.innerHTML = html;
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let left = fa() ? r.right - pw : r.left;
  left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
  let top = r.bottom + 6;
  if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  pop.dir = fa() ? 'rtl' : 'ltr';
  return pop;
}

let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });

function menuHTML() {
  return `<div class="pgroup"><div class="plabel">${esc(t('theme'))}</div><div class="themes">${THEMES.map(([k, c]) => `<button style="background:${c}" data-act="theme" data-v="${k}" aria-pressed="${state.theme === k}" aria-label="${esc(t('themes')[k])}" title="${esc(t('themes')[k])}"></button>`).join('')}</div></div>
    <div class="pgroup"><div class="plabel">${esc(t('calendarSystem'))}</div>
      <label class="radio"><input type="radio" name="cal" value="gregorian" ${state.cal === 'gregorian' ? 'checked' : ''}> ${esc(t('gregorian'))}</label>
      <label class="radio"><input type="radio" name="cal" value="jalali" ${state.cal === 'jalali' ? 'checked' : ''}> ${esc(t('jalali'))}</label></div>
    <button class="pi" data-act="sync">${esc(t('syncMenu'))}</button>
    <button class="pi" data-act="export">${esc(t('exportBackup'))}</button>
    <button class="pi" data-act="import">${esc(t('importBackup'))}</button>
    <button class="pi" data-act="print">${esc(t('print'))}</button>
    ${deferredInstall ? `<button class="pi" data-act="install">${esc(t('install'))}</button>` : ''}
    <button class="pi danger" data-act="reset">${esc(t('reset'))}</button>
    <p class="pnote">${esc(t('stored'))}</p>`;
}

/* --------------------------------------------------------------- events */
app.addEventListener('input', (e) => {
  const el = e.target;
  const path = el.dataset?.bind;
  if (!path || el.type === 'checkbox') return;
  setPath(path, el.value);
  if (/^days\.\d+\.(bed|wake)$/.test(path)) {
    const d = getDay(current.n);
    const out = document.getElementById('sleepOut');
    if (out) out.textContent = sleepText(d.bed, d.wake);
  }
});

app.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'daySelect') { if (el.value) location.hash = `#/day/${el.value}`; return; }
  if (el.dataset?.bind && el.type === 'checkbox') {
    setPath(el.dataset.bind, el.checked);
    el.closest('.task')?.querySelector('input.hand')?.classList.toggle('dn', el.checked);
    return;
  }
  const dsel = el.closest('[data-dsel]');
  if (dsel) {
    const g = (p) => +dsel.querySelector(`[data-part=${p}]`).value;
    state.from = isoFromParts(g('year'), g('month'), g('day'), state.cal);
    touchField('from');
    save();
    render(true);
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.name === 'cal' && pop?.contains(el)) {
    state.cal = el.value;
    save();
    render(true);
  }
  if (el.id === 'importFile') importFile(el.files[0]);
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (pop && !pop.contains(e.target) && !btn) closePop();
  if (!btn) return;
  const act = btn.dataset.act;
  const n = +btn.dataset.n;
  switch (act) {
    case 'go': location.hash = `#/day/${n}`; break;
    case 'lang':
      state.lang = fa() ? 'en' : 'fa';
      state.cal = fa() ? 'jalali' : 'gregorian';
      save(); render(true); break;
    case 'status': {
      const d = getDay(n);
      d.status = d.status === '' ? 'done' : d.status === 'done' ? 'miss' : '';
      touchDay(n); save(); render(true); break;
    }
    case 'mood': { const d = getDay(n); const v = +btn.dataset.v; d.mood = d.mood === v ? 0 : v; touchDay(n); save(); render(true); break; }
    case 'water': { const d = getDay(n); const v = +btn.dataset.v; d.water = d.water === v ? v - 1 : v; touchDay(n); save(); render(true); break; }
    case 'moodpick': {
      e.stopPropagation();
      const html = [1, 2, 3, 4, 5].map((v) => `<button class="mood" data-act="setmood" data-n="${n}" data-v="${v}" aria-label="${esc(t('moods')[v - 1])}">${face(v, getDay(n).mood === v, 34)}</button>`).join('')
        + `<button class="pi tiny" data-act="setmood" data-n="${n}" data-v="0">${esc(t('clear'))}</button>`;
      openPop(btn, html, 'moodpop');
      break;
    }
    case 'setmood': getDay(n).mood = +btn.dataset.v; touchDay(n); save(); render(true); break;
    case 'menu': {
      if (pop?.classList.contains('menu')) { closePop(); break; }
      e.stopPropagation();
      openPop(btn, menuHTML(), 'menu');
      break;
    }
    case 'theme': state.theme = btn.dataset.v; touchField('theme'); save(); render(true); break;
    case 'sync': closePop(); openModal(); break;
    case 'closemodal': closeModal(); break;
    case 'syncmode': draft.mode = draft.mode === 'create' ? 'signin' : 'create'; draft.msg = null; redrawModal(); break;
    case 'syncnow': draft.msg = null; runSync().then(() => { draft.msg = syncState === 'error' ? { text: errText(lastSyncError), ok: false } : { text: t('synced'), ok: true }; redrawModal(); }); break;
    case 'signout': Sync.account.clear(); acc = null; setSyncState('off'); closeModal(); toast(t('signedOut')); break;
    case 'deletecloud':
      if (confirm(t('confirmDeleteCloud'))) Sync.deleteRemote(acc).then(() => { Sync.account.clear(); acc = null; setSyncState('off'); closeModal(); toast(t('cloudDeleted')); }).catch((err) => { draft.msg = { text: errText(err.code), ok: false }; redrawModal(); });
      break;
    case 'export': exportData(); closePop(); break;
    case 'import': { closePop(); let f = document.getElementById('importFile'); if (!f) { f = document.createElement('input'); f.type = 'file'; f.accept = 'application/json,.json'; f.id = 'importFile'; f.hidden = true; document.body.appendChild(f); } f.value = ''; f.click(); break; }
    case 'print': closePop(); setTimeout(() => window.print(), 50); break;
    case 'install': closePop(); deferredInstall?.prompt(); deferredInstall = null; break;
    case 'reset':
      closePop();
      if (confirm(t('confirmReset'))) { state = normalize({ lang: state.lang, cal: state.cal, theme: state.theme, epoch: now() }); try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} render(true); toast(t('erased')); scheduleSync(0); }
      break;
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closePop(); closeModal(); } });
document.addEventListener('click', (e) => { if (modal && e.target === modal) closeModal(); });

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `daily-plan-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  toast(t('exported'));
}

async function importFile(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data !== 'object' || typeof data.days !== 'object') throw new Error('shape');
    if (!confirm(t('confirmImport'))) return;
    state = normalize(data);
    state.epoch = now();
    localStorage.setItem(KEY, JSON.stringify(state));
    render(true);
    toast(t('imported'));
    scheduleSync(0);
  } catch { toast(t('importFail')); }
}


/* ----------------------------------------------------------------- sync */
let acc = Sync.account.load();
let syncState = acc ? 'ok' : 'off';
let lastSyncError = '';
let syncTimer, syncing = false, syncAgain = false, dirty = 0, staleView = false, blockedUntil = 0, lastRun = 0;

function setSyncState(s) {
  syncState = s;
  const b = document.querySelector('.tb.sync');
  if (b) { b.dataset.state = s; b.title = b.ariaLabel = t('syncState')[s]; }
}

function scheduleSync(delay = 0) {
  if (!acc) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(runSync, Math.max(delay, blockedUntil - Date.now()));
}
/* Passive triggers (focus, reconnect, timer) are throttled so idle tabs never hammer the server. */
function kick() { if (Date.now() - lastRun > 20000) scheduleSync(0); }

const typing = () => app.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);

function applyMerged(merged) {
  const next = normalize(Sync.merge(state, merged));
  if (Sync.canon(next) === Sync.canon(state)) return;
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  applyTheme(); // never wait for the typing guard: the theme is not part of any field being edited
  if (typing()) staleView = true; else render(true);
}
document.addEventListener('focusout', () => setTimeout(() => { if (staleView && !typing()) { staleView = false; render(true); } }, 0));

async function runSync() {
  if (!acc) return;
  if (syncing) { syncAgain = true; return; }
  if (!navigator.onLine) { setSyncState('offline'); return; }
  syncing = true;
  lastRun = Date.now();
  setSyncState('syncing');
  const v = dirty;
  try {
    const { merged, rev } = await Sync.sync(acc, state);
    applyMerged(merged);
    acc.rev = rev; acc.last = Date.now(); Sync.account.save(acc);
    if (dirty !== v) syncAgain = true;
    setSyncState('ok');
  } catch (e) {
    lastSyncError = e.code || 'server';
    if (e.status === 429) blockedUntil = Date.now() + (e.retryAfter || 60) * 1000;
    setSyncState(e.code === 'offline' ? 'offline' : 'error');
  } finally {
    syncing = false;
    if (syncAgain) { syncAgain = false; scheduleSync(500); }
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
window.addEventListener('online', () => kick());
window.addEventListener('offline', () => acc && setSyncState('offline'));
setInterval(() => { if (!document.hidden) kick(); }, 120000);

const ERR = { 'no-account': 'errNoAccount', 'wrong-password': 'errWrong', exists: 'errExists', locked: 'errLocked', 'rate-limited': 'errRate', capacity: 'errCapacity', 'too-large': 'errTooLarge', 'not-configured': 'errNotConfigured', unavailable: 'errUnavailable', offline: 'errOffline', decrypt: 'errDecrypt' };
const errText = (code) => t(ERR[code] || 'errServer');

/* sync dialog */
let modal = null;
const draft = { mode: 'signin', user: '', msg: null };

function sheetHTML() {
  const msg = draft.msg ? `<p class="msg ${draft.msg.ok ? 'ok' : ''}" role="alert">${esc(draft.msg.text)}</p>` : '<p class="msg"></p>';
  const close = `<button type="button" class="sbtn ghost" data-act="closemodal">${esc(t('close'))}</button>`;
  if (acc) {
    const last = acc.last ? new Date(acc.last).toLocaleString(state.lang === 'fa' ? 'fa-IR' : undefined) : t('never');
    const err = syncState === 'error' && !draft.msg ? `<p class="msg" role="alert">${esc(errText(lastSyncError))}</p>` : msg;
    return `<h2 id="sheetTitle">${esc(t('syncTitle'))}</h2>
      <p>${esc(t('signedInAs'))} <span class="who">${esc(acc.user)}</span><br>${esc(t('lastSync'))}: ${esc(last)}</p>${err}
      <div class="row"><button class="sbtn" data-act="syncnow">${esc(t('syncNow'))}</button><button class="sbtn ghost" data-act="signout">${esc(t('signOut'))}</button><button class="sbtn danger" data-act="deletecloud">${esc(t('deleteCloud'))}</button>${close}</div>`;
  }
  const create = draft.mode === 'create';
  return `<h2 id="sheetTitle">${esc(t('syncTitle'))}</h2><p>${esc(t('syncIntro'))}</p>
    <form id="syncForm">
      <div><label for="s-user">${esc(t('username'))}</label><input id="s-user" name="user" autocomplete="username" autocapitalize="off" spellcheck="false" required value="${esc(draft.user)}"></div>
      <div><label for="s-pw">${esc(t('password'))}</label><input id="s-pw" name="pw" type="password" autocomplete="${create ? 'new-password' : 'current-password'}" required></div>
      ${create ? `<div><label for="s-pw2">${esc(t('password2'))}</label><input id="s-pw2" name="pw2" type="password" autocomplete="new-password" required></div><p>${esc(t('pwWarn'))}</p>` : ''}
      ${msg}
      <div class="row"><button class="sbtn" type="submit">${esc(create ? t('createAccount') : t('signIn'))}</button>${close}</div>
      <button type="button" class="link" data-act="syncmode">${esc(create ? t('haveAccount') : t('needAccount'))}</button>
    </form>`;
}

function openModal() {
  closeModal();
  draft.msg = null;
  modal = document.createElement('div');
  modal.className = 'modal';
  modal.dir = fa() ? 'rtl' : 'ltr';
  modal.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">${sheetHTML()}</div>`;
  document.body.appendChild(modal);
  modal.querySelector('input')?.focus();
}
function redrawModal() {
  if (!modal) return;
  modal.firstElementChild.innerHTML = sheetHTML();
  modal.querySelector('input')?.focus();
}
function closeModal() { modal?.remove(); modal = null; }

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'syncForm') return;
  e.preventDefault();
  const f = new FormData(e.target);
  const user = String(f.get('user')).trim(), pw = String(f.get('pw'));
  draft.user = user;
  const fail = (text) => { draft.msg = { text, ok: false }; redrawModal(); };
  if (!user) return fail(t('errUser'));
  if (pw.length < 8) return fail(t('errPwShort'));
  if (draft.mode === 'create' && pw !== String(f.get('pw2'))) return fail(t('errPwMatch'));
  e.target.querySelectorAll('button,input').forEach((el) => { el.disabled = true; });
  e.target.querySelector('.msg').textContent = t('working');
  try {
    const a = await Sync.derive(user, pw);
    if (draft.mode === 'create') await Sync.register(a, state); else await Sync.probe(a);
    acc = { ...a, last: 0, rev: 0 };
    Sync.account.save(acc);
    draft.msg = null;
    await runSync();
    draft.msg = syncState === 'error' ? { text: errText(lastSyncError), ok: false } : { text: t('synced'), ok: true };
    redrawModal();
  } catch (err) { fail(errText(err.code)); }
});

/* swipe between days (follows reading direction) */
let sx = 0, sy = 0;
app.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
app.addEventListener('touchend', (e) => {
  if (current.view !== 'day') return;
  if (e.target.closest('input, textarea, select')) return;
  const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
  if (Math.abs(dx) < 90 || Math.abs(dy) > 45) return;
  const forward = fa() ? dx > 0 : dx < 0;
  const n = current.n + (forward ? 1 : -1);
  if (n >= 1 && n <= DAYS) location.hash = `#/day/${n}`;
}, { passive: true });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

render();
scheduleSync(0);
