// POST /api/sync — encrypted account storage on Upstash Redis (added from Vercel's Storage tab).
// The browser derives an account id + auth token from username/password and encrypts the data
// itself, so this function only ever sees opaque hex ids and ciphertext.
//   { op: 'register' | 'pull' | 'push' | 'delete', id, token, blob? }
import { createHash, timingSafeEqual } from 'node:crypto';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HEX64 = /^[0-9a-f]{64}$/;
const MAX_BLOB = 700_000; // chars; stays well under Upstash's request size limit
const MAX_FAILS = 10;     // wrong-password attempts per account per 15 minutes

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

  try {
    if (op === 'register') {
      if (typeof blob !== 'string') return res.status(400).json({ ok: false, error: 'bad-request' });
      const created = await redis('HSETNX', key, 'th', th);
      if (!created) return res.status(409).json({ ok: false, error: 'exists' });
      await redis('HSET', key, 'blob', blob, 'rev', '1');
      return res.status(200).json({ ok: true, rev: 1 });
    }
    if (!['pull', 'push', 'delete'].includes(op)) return res.status(400).json({ ok: false, error: 'bad-request' });

    const fails = Number(await redis('GET', `fail:${id}`)) || 0;
    if (fails >= MAX_FAILS) return res.status(429).json({ ok: false, error: 'locked' });

    const [stored, rev, current] = await redis('HMGET', key, 'th', 'rev', 'blob');
    if (!stored) return res.status(404).json({ ok: false, error: 'no-account' });
    if (!same(stored, th)) {
      if ((await redis('INCR', `fail:${id}`)) === 1) await redis('EXPIRE', `fail:${id}`, '900');
      await sleep(900); // slows down guessing
      return res.status(401).json({ ok: false, error: 'wrong-password' });
    }
    if (fails) await redis('DEL', `fail:${id}`);

    if (op === 'pull') return res.status(200).json({ ok: true, rev: Number(rev), blob: current });
    if (op === 'delete') { await redis('DEL', key); return res.status(200).json({ ok: true }); }
    if (typeof blob !== 'string') return res.status(400).json({ ok: false, error: 'bad-request' });
    await redis('HSET', key, 'blob', blob);
    return res.status(200).json({ ok: true, rev: await redis('HINCRBY', key, 'rev', '1') });
  } catch {
    return res.status(502).json({ ok: false, error: 'storage' });
  }
}
