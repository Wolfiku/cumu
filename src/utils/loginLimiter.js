/**
 * src/utils/loginLimiter.js
 * Brute-force protection for password and admin code checks.
 *
 * Failed attempts are counted in memory, per account + IP and per IP:
 *  - account + IP: after 5 failures the pair is locked, starting at 1 minute
 *    and doubling with every further failure (max. 15 minutes). Keyed by IP
 *    too, so an attacker cannot lock a real user out of their own devices.
 *  - IP alone: after 20 failures within 15 minutes the IP is blocked for the
 *    rest of that window, whichever account it tries.
 * A successful login clears the account + IP counter. Counters reset on
 * server restart, which is fine for slowing down guessing.
 *
 * Behind a reverse proxy, set TRUST_PROXY (see server.js); otherwise every
 * request seems to come from the proxy and shares one IP counter.
 */

'use strict';

const { log } = require('../db');

const WINDOW_MS        = 15 * 60 * 1000;
const PAIR_MAX_FAILS   = 5;
const PAIR_BASE_LOCK   = 60 * 1000;
const PAIR_MAX_LOCK    = 15 * 60 * 1000;
const IP_MAX_FAILS     = 20;
const MAX_ENTRIES      = 10000;

// key -> { fails, first, lockedUntil }
const entries = new Map();

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function pairKey(scope, account, ip) {
  return `${scope}|${String(account || '').trim().toLowerCase()}|${ip}`;
}

function ipKey(ip) { return `ip|${ip}`; }

function getEntry(key, now) {
  const e = entries.get(key);
  if (!e) return null;
  // Forget entries whose window and lock have both run out
  if (now - e.first > WINDOW_MS && e.lockedUntil <= now) {
    entries.delete(key);
    return null;
  }
  return e;
}

/**
 * Returns null when the attempt may go ahead, or { retryAfter } (seconds)
 * when this account + IP or this IP is currently locked.
 */
function check(req, scope, account) {
  const now = Date.now();
  const ip  = clientIp(req);
  let until = 0;
  for (const key of [pairKey(scope, account, ip), ipKey(ip)]) {
    const e = getEntry(key, now);
    if (e && e.lockedUntil > now) until = Math.max(until, e.lockedUntil);
  }
  return until ? { retryAfter: Math.ceil((until - now) / 1000) } : null;
}

function bump(key, now, maxFails, lockFor) {
  let e = getEntry(key, now);
  if (!e) {
    if (entries.size >= MAX_ENTRIES) prune(now, true);
    e = { fails: 0, first: now, lockedUntil: 0 };
    entries.set(key, e);
  }
  e.fails++;
  if (e.fails >= maxFails) {
    e.lockedUntil = now + lockFor(e.fails - maxFails);
    return true;
  }
  return false;
}

/** Record a failed attempt (wrong password, wrong admin code, unknown user). */
function fail(req, scope, account) {
  const now = Date.now();
  const ip  = clientIp(req);
  const pairLocked = bump(pairKey(scope, account, ip), now, PAIR_MAX_FAILS,
    extra => Math.min(PAIR_BASE_LOCK * 2 ** extra, PAIR_MAX_LOCK));
  const ipEntry = entries.get(ipKey(ip));
  const ipLocked = bump(ipKey(ip), now, IP_MAX_FAILS,
    () => Math.max(WINDOW_MS - (now - (ipEntry ? ipEntry.first : now)), PAIR_BASE_LOCK));
  if (pairLocked || ipLocked) {
    log('warn', 'auth', `Login locked after repeated failures (${scope}, account "${String(account || '-').slice(0, 64)}", IP ${ip})`);
  }
}

/** Clear the account + IP counter after a successful login. */
function succeed(req, scope, account) {
  entries.delete(pairKey(scope, account, clientIp(req)));
}

function prune(now = Date.now(), force = false) {
  for (const [key, e] of entries) {
    if (now - e.first > WINDOW_MS && e.lockedUntil <= now) entries.delete(key);
  }
  // Still full (e.g. a flood from many IPs): drop the oldest entries
  if (force && entries.size >= MAX_ENTRIES) {
    const drop = entries.size - MAX_ENTRIES + 1000;
    let i = 0;
    for (const key of entries.keys()) { if (i++ >= drop) break; entries.delete(key); }
  }
}

setInterval(prune, 5 * 60 * 1000).unref();

function message(retryAfter) {
  const mins = Math.ceil(retryAfter / 60);
  return mins <= 1
    ? 'Too many failed attempts. Please try again in a minute.'
    : `Too many failed attempts. Please try again in ${mins} minutes.`;
}

/** Sends the 429 response for a lock returned by check(). */
function reject(res, lock, style = 'plain') {
  res.set('Retry-After', String(lock.retryAfter));
  if (style === 'oauth') {
    return res.status(429).json({ error: 'too_many_attempts', error_description: message(lock.retryAfter), retry_after: lock.retryAfter });
  }
  return res.status(429).json({ error: message(lock.retryAfter), code: 'too_many_attempts', retry_after: lock.retryAfter });
}

function _reset() { entries.clear(); }

module.exports = { check, fail, succeed, reject, _reset };
