// POST /api/login  { "password": "..." }  ->  sets a long-lived HttpOnly cookie when correct.
import { createHash, timingSafeEqual } from 'node:crypto';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false });
  }

  const secret = process.env.SITE_PASSWORD;
  if (!secret) return res.status(503).json({ ok: false, error: 'not-configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const given = typeof body?.password === 'string' ? body.password : '';

  // Compare hashes (equal length) in constant time.
  const a = Buffer.from(sha(given));
  const b = Buffer.from(sha(secret));
  const ok = a.length === b.length && timingSafeEqual(a, b);

  if (!ok) {
    await sleep(900); // slows down guessing
    return res.status(401).json({ ok: false });
  }

  const token = sha(`${secret}|daily-plan-v1`);
  res.setHeader('Set-Cookie', `planner_auth=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`);
  return res.status(200).json({ ok: true });
}
