// Date helpers. Dates are always stored as Gregorian ISO strings (YYYY-MM-DD).
// Jalali (Persian) display/entry is done with the browser's built-in Intl.
import { JALALI_MONTHS } from './i18n.js';

const p2 = (n) => String(n).padStart(2, '0');
const calId = (cal) => (cal === 'jalali' ? 'persian' : 'gregory');

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const partFmt = {};
export function partsIn(iso, cal) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const id = calId(cal);
  partFmt[id] ||= new Intl.DateTimeFormat(`en-US-u-ca-${id}-nu-latn`, {
    timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric',
  });
  const out = {};
  for (const p of partFmt[id].formatToParts(dt)) {
    if (p.type === 'year' || p.type === 'month' || p.type === 'day') out[p.type] = parseInt(p.value, 10);
  }
  return out; // {year, month, day} in the chosen calendar
}

export function isoFromParts(year, month, day, cal) {
  if (cal !== 'jalali') {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const d = Math.min(day, last);
    return `${year}-${p2(month)}-${p2(d)}`;
  }
  // Jalali -> Gregorian by scanning the year's days (cheap and avoids hand-rolled maths).
  // A Jalali year runs ~Mar 21 (year+621) to ~Mar 20 (year+622).
  const start = Date.UTC(year + 621, 2, 15);
  for (let d = day; d >= 1; d--) {
    for (let i = 0; i < 375; i++) {
      const iso = new Date(start + i * 86400000).toISOString().slice(0, 10);
      const p = partsIn(iso, 'jalali');
      if (p.year === year && p.month === month && p.day === d) return iso;
    }
  }
  return todayISO();
}

export function monthNames(lang, cal) {
  if (cal === 'jalali') return JALALI_MONTHS[lang === 'fa' ? 'fa' : 'en'];
  const f = new Intl.DateTimeFormat(lang === 'fa' ? 'fa-IR-u-ca-gregory' : 'en-US', { month: 'long', timeZone: 'UTC' });
  return Array.from({ length: 12 }, (_, i) => f.format(new Date(Date.UTC(2025, i, 15))));
}

export function fmtDate(iso, lang, cal, style = 'long') {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const loc = `${lang === 'fa' ? 'fa-IR' : 'en-US'}-u-ca-${calId(cal)}`;
  const opts = style === 'short'
    ? { day: 'numeric', month: 'short' }
    : style === 'medium'
      ? { day: 'numeric', month: 'long', year: 'numeric' }
      : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  return new Intl.DateTimeFormat(loc, { ...opts, timeZone: 'UTC' }).format(dt);
}
