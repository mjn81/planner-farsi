// Vercel Routing Middleware: runs BEFORE any file or API is served.
// Without the right cookie, every request is redirected to the login page.
// The password lives only in the SITE_PASSWORD environment variable (never in the code).
import { next } from '@vercel/functions';

const COOKIE = 'planner_auth';

// Only what the login page itself (and the installable-app icons) need.
const PUBLIC_EXACT = new Set(['/login.html', '/api/login', '/manifest.webmanifest', '/favicon.ico', '/robots.txt']);
const PUBLIC_PREFIX = ['/assets/fonts/', '/icons/'];

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function readCookie(header, name) {
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const password = process.env.SITE_PASSWORD;

  // Fail closed: if no password is configured, nobody gets in (except the login page, which explains it).
  if (!password) {
    if (path === '/login.html' || path === '/api/login') return next();
    return new Response('SITE_PASSWORD is not set in the Vercel project settings.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  if (PUBLIC_EXACT.has(path) || PUBLIC_PREFIX.some((p) => path.startsWith(p))) return next();

  const expected = await sha256Hex(`${password}|daily-plan-v1`);
  const given = readCookie(request.headers.get('cookie'), COOKIE);
  if (given && safeEqual(given, expected)) return next();

  const wantsPage = (request.headers.get('accept') || '').includes('text/html');
  if (wantsPage) {
    const dest = new URL('/login.html', url);
    if (path !== '/') dest.searchParams.set('next', path + url.search);
    return Response.redirect(dest, 302);
  }
  return new Response('Unauthorized', { status: 401, headers: { 'cache-control': 'no-store' } });
}

// Run on everything (static files, pages, API) except Vercel internals.
export const config = { matcher: ['/((?!_vercel).*)'] };
