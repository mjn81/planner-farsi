// Account sync: key derivation, encryption, merge, and the /api/sync client.
// The password never leaves the device. From it we derive (PBKDF2 -> HKDF) an account id,
// an auth token and an AES-GCM key; the server stores only ciphertext.
const ACCOUNT_KEY = 'daily-plan-30:sync';
const FIELDS = ['title', 'summary', 'from', 'theme']; // synced top-level fields (language/calendar stay per-device)
const enc = new TextEncoder();
const dec = new TextDecoder();

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => Uint8Array.from(s.match(/../g), (h) => parseInt(h, 16));
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const account = {
  load() { try { return JSON.parse(localStorage.getItem(ACCOUNT_KEY)); } catch { return null; } },
  save(a) { try { localStorage.setItem(ACCOUNT_KEY, JSON.stringify(a)); } catch {} },
  clear() { try { localStorage.removeItem(ACCOUNT_KEY); } catch {} },
};

export async function derive(username, password) {
  const user = username.trim().toLowerCase().normalize('NFKC');
  const base = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const master = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', iterations: 600000, salt: enc.encode(`daily-plan-sync|${user}`) }, base, 256);
  const hk = await crypto.subtle.importKey('raw', master, 'HKDF', false, ['deriveBits']);
  const sub = (label) => crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: enc.encode(label) }, hk, 256);
  const [token, key] = await Promise.all([sub('auth'), sub('enc')]);
  const id = hex(await crypto.subtle.digest('SHA-256', enc.encode(`daily-plan-id|${user}`)));
  return { user: user, id, token: hex(token), key: hex(key) };
}

async function aesKey(keyHex) {
  return crypto.subtle.importKey('raw', unhex(keyHex), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function seal(keyHex, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(keyHex), enc.encode(JSON.stringify(obj))));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv); out.set(ct, 12);
  return `v1.${b64(out)}`;
}

async function open(keyHex, blob) {
  if (!blob || !blob.startsWith('v1.')) throw new Error('format');
  const raw = unb64(blob.slice(3));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, await aesKey(keyHex), raw.slice(12));
  return JSON.parse(dec.decode(pt));
}

/* Order-insensitive serialisation, so "same content" comparisons don't depend on key order. */
export function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

/* Merge two states: newest edit wins per day and per top-level field.
   A higher `epoch` (set by "erase all" / "import backup") replaces the other side entirely. */
export function merge(a, b) {
  const ea = a.epoch || 0, eb = b.epoch || 0;
  if (ea !== eb) {
    const [win, lose] = ea > eb ? [a, b] : [b, a];
    return { ...lose, ...pick(win), epoch: Math.max(ea, eb) };
  }
  const out = { ...a, days: {}, mu: { ...(a.mu || {}) } };
  for (const f of FIELDS) {
    if (((b.mu || {})[f] || 0) > ((a.mu || {})[f] || 0)) { out[f] = b[f]; out.mu[f] = b.mu[f]; }
  }
  for (const n of new Set([...Object.keys(a.days || {}), ...Object.keys(b.days || {})])) {
    const x = a.days?.[n], y = b.days?.[n];
    out.days[n] = !y || (x && (x.u || 0) >= (y.u || 0)) ? x : y;
  }
  return out;
}
const pick = (s) => ({ days: s.days, mu: s.mu || {}, ...Object.fromEntries(FIELDS.map((f) => [f, s[f]])) });

/* Content that gets uploaded (language and calendar system stay per device). */
const shared = (s) => ({ v: s.v, epoch: s.epoch || 0, mu: s.mu || {}, days: s.days, ...Object.fromEntries(FIELDS.map((f) => [f, s[f]])) });

export class SyncError extends Error {
  constructor(code, status, retryAfter) { super(code); this.code = code; this.status = status; this.retryAfter = retryAfter; }
}

async function call(acc, op, extra = {}) {
  let r;
  try {
    r = await fetch('/api/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op, id: acc.id, token: acc.token, ...extra }),
    });
  } catch { throw new SyncError('offline', 0); }
  let j = {};
  try { j = await r.json(); } catch {}
  if (!r.ok) {
    const code = j.error || (r.status === 404 ? 'unavailable' : 'server');
    throw new SyncError(code, r.status, Number(j.retryAfter) || Number(r.headers.get('Retry-After')) || 0);
  }
  return j;
}

/* Create the account on the server with the current local data. */
export async function register(acc, state) {
  const j = await call(acc, 'register', { blob: await seal(acc.key, shared(state)) });
  return j.rev;
}

/* Pull -> merge -> push if the merge produced something the server doesn't have.
   Returns the merged state (shared fields only) and the server revision. */
export async function sync(acc, state) {
  const j = await call(acc, 'pull');
  let remote;
  try { remote = await open(acc.key, j.blob); } catch { throw new SyncError('decrypt', 0); }
  const merged = merge(state, remote);
  let rev = j.rev;
  if (canon(shared(merged)) !== canon(shared(remote))) {
    rev = (await call(acc, 'push', { blob: await seal(acc.key, shared(merged)) })).rev;
  }
  return { merged, rev };
}

export async function deleteRemote(acc) { await call(acc, 'delete'); }

/* Check credentials without touching data (used by "Sign in"). */
export async function probe(acc) { await call(acc, 'pull'); }
