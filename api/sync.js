// POST /api/sync — encrypted account storage on Upstash Redis (added from Vercel's Storage tab).
// The browser derives an account id + auth token from username/password and encrypts the data
// itself, so this function only ever sees opaque hex ids and ciphertext.
//   { op: 'register' | 'pull' | 'push' | 'delete', id, token, blob? }
//
// Abuse protection (all counters live in Redis, so they hold across serverless instances):
//   - per-IP request budget, per-IP + global registration budgets, and a hard cap on accounts
//   - per-account pull/push budgets
//   - wrong-password lockouts per account and per IP
//   - a size cap per account, which bounds total storage at MAX_ACCOUNTS * MAX_BLOB
import { createHash, timingSafeEqual } from 'node:crypto';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HEX64 = /^[0-9a-f]{64}$/;
const MAX_BLOB = 256_000; // chars of ciphertext (a full 30-day planner is a few tens of KB)
const MAX_ACCOUNTS = Number(process.env.SYNC_MAX_ACCOUNTS) || 1000;

const MIN = 60, HOUR = 3600;
const LIMIT = {
  ipAny:      [10 * MIN, 240], // every request from one IP (several devices behind one router fit easily)
  ipRegister: [HOUR, 5],       // new accounts per IP
  allRegister:[HOUR, 100],     // new accounts across everyone: caps a distributed flood
  ipDelete:   [HOUR, 10],
  acctPull:   [10 * MIN, 120],
  acctPush:   [10 * MIN, 120],
};
const FAIL_WINDOW = 15 * MIN, FAILS_PER_ACCOUNT = 10, FAILS_PER_IP = 30;

// Vercel may prefix the variables (e.g. PLANNER_ACC_KV_REST_API_URL), so match on the suffix.
// The read-only token is skipped; we need to write.
function redisEnv() {
  const find = (...suffixes) => {
    const k = Object.keys(process.env).find((n) => !n.endsWith('READ_ONLY_TOKEN') && suffixes.some((s) => n === s || n.endsWith(`_${s}`)));
    return k ? process.env[k] : '';
  };
  return { url: find('KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL'), token: find('KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN') };
}

async function redis(...cmd) {
  const { url, token } = redisEnv();
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || `redis ${r.status}`);
  return j.result;
}

// Fixed-window counters, checked atomically in one command. Returns [count, ttl] per key.
const COUNT_LUA = `local out = {}
for i, k in ipairs(KEYS) do
  local c = redis.call('INCR', k)
  if c == 1 then redis.call('EXPIRE', k, ARGV[i]) end
  out[#out + 1] = c
  out[#out + 1] = redis.call('TTL', k)
end
return out`;

// budgets: [[key, [windowSeconds, max]], ...]. Resolves to 0 when all pass, else seconds to wait.
async function overBudget(budgets) {
  const r = await redis('EVAL', COUNT_LUA, String(budgets.length), ...budgets.map(([k]) => k), ...budgets.map(([, [w]]) => String(w)));
  let wait = 0;
  budgets.forEach(([, [w, max]], i) => {
    if (r[i * 2] > max) wait = Math.max(wait, r[i * 2 + 1] > 0 ? r[i * 2 + 1] : w);
  });
  return wait;
}

const clientIp = (req) => {
  const h = req.headers || {};
  const raw = h['x-vercel-forwarded-for'] || h['x-real-ip'] || String(h['x-forwarded-for'] || '').split(',')[0] || 'unknown';
  return sha(`daily-plan-rl|${raw.trim()}`).slice(0, 24);
};

const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false });
  }
  const { url, token: apiToken } = redisEnv();
  if (!url || !apiToken) return res.status(503).json({ ok: false, error: 'not-configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const { op, id, token, blob } = body || {};
  if (!HEX64.test(id || '') || !HEX64.test(token || '')) return res.status(400).json({ ok: false, error: 'bad-request' });
  if (blob !== undefined && (typeof blob !== 'string' || blob.length > MAX_BLOB)) return res.status(413).json({ ok: false, error: 'too-large' });

  const key = `acct:${id}`;
  const th = sha(token);
  const ip = clientIp(req);
  const tooMany = (error, wait) => {
    res.setHeader('Retry-After', String(wait));
    return res.status(429).json({ ok: false, error, retryAfter: wait });
  };

  try {
    const budgets = [[`rl:ip:${ip}`, LIMIT.ipAny]];
    if (op === 'register') budgets.push([`rl:reg:ip:${ip}`, LIMIT.ipRegister], ['rl:reg:all', LIMIT.allRegister]);
    else if (op === 'pull') budgets.push([`rl:pull:${id}`, LIMIT.acctPull]);
    else if (op === 'push') budgets.push([`rl:push:${id}`, LIMIT.acctPush]);
    else if (op === 'delete') budgets.push([`rl:del:${ip}`, LIMIT.ipDelete]);
    else return res.status(400).json({ ok: false, error: 'bad-request' });
    const wait = await overBudget(budgets);
    if (wait) return tooMany('rate-limited', wait);

    if (op === 'register') {
      if (typeof blob !== 'string') return res.status(400).json({ ok: false, error: 'bad-request' });
      if ((Number(await redis('GET', 'stat:accounts')) || 0) >= MAX_ACCOUNTS) return res.status(503).json({ ok: false, error: 'capacity' });
      const created = await redis('HSETNX', key, 'th', th);
      if (!created) return res.status(409).json({ ok: false, error: 'exists' });
      await redis('HSET', key, 'blob', blob, 'rev', '1');
      await redis('INCR', 'stat:accounts');
      return res.status(200).json({ ok: true, rev: 1 });
    }

    const [failsAcct, failsIp] = (await redis('MGET', `fail:${id}`, `fail:ip:${ip}`)).map((v) => Number(v) || 0);
    if (failsAcct >= FAILS_PER_ACCOUNT || failsIp >= FAILS_PER_IP) return tooMany('locked', FAIL_WINDOW);

    const [stored, rev, current] = await redis('HMGET', key, 'th', 'rev', 'blob');
    if (!stored || !same(stored, th)) {
      // Unknown account and wrong password both count, so ids can't be probed for free either.
      await overBudget([[`fail:${id}`, [FAIL_WINDOW, FAILS_PER_ACCOUNT]], [`fail:ip:${ip}`, [FAIL_WINDOW, FAILS_PER_IP]]]);
      if (!stored) return res.status(404).json({ ok: false, error: 'no-account' });
      await sleep(900); // slows down guessing
      return res.status(401).json({ ok: false, error: 'wrong-password' });
    }
    if (failsAcct) await redis('DEL', `fail:${id}`);

    if (op === 'pull') return res.status(200).json({ ok: true, rev: Number(rev), blob: current });
    if (op === 'delete') {
      await redis('DEL', key);
      await redis('DECR', 'stat:accounts');
      return res.status(200).json({ ok: true });
    }
    if (typeof blob !== 'string') return res.status(400).json({ ok: false, error: 'bad-request' });
    await redis('HSET', key, 'blob', blob);
    return res.status(200).json({ ok: true, rev: await redis('HINCRBY', key, 'rev', '1') });
  } catch {
    return res.status(502).json({ ok: false, error: 'storage' });
  }
}
