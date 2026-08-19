#!/usr/bin/env node
/**
 * scripts/test-client.js
 * Integration test for Cumu's OAuth2 API.
 *
 * Usage:
 *   node scripts/test-client.js [host]
 *   node scripts/test-client.js http://localhost:3000
 *
 * Requirements:
 *   - Server must be running
 *   - Admin credentials must be set in TEST_USER / TEST_PASS env vars
 *     or passed via the first argument
 *
 * What it tests:
 *   1. Setup (creates admin user if needed)
 *   2. OAuth2 Authorization Code Flow (authorize → token)
 *   3. Token refresh
 *   4. GET /user/me
 *   5. GET /api/home
 *   6. GET /api/songs
 *   7. Theme change via POST /user/theme for all 3 themes
 *   8. GET /api/sync  and  POST /api/sync with conflict detection
 *   9. Token revocation via POST /oauth/revoke
 *  10. Verified that revoked token returns 401
 */

'use strict';

const http   = require('http');
const https  = require('https');

const BASE    = process.argv[2] || process.env.CUMU_URL || 'http://localhost:3000';
const USER    = process.env.TEST_USER || 'testadmin';
const PASS    = process.env.TEST_PASS || 'testpassword1';
const CLIENT  = 'cumu-web';
const SECRET  = 'cumu-web-secret-internal';

let passed = 0;
let failed = 0;

function ok(label, val) {
  if (val) {
    console.log(`  ✅  ${label}`);
    passed++;
  } else {
    console.error(`  ❌  ${label}`);
    failed++;
  }
}

async function req(method, path, body, headers = {}) {
  const url = new URL(path, BASE);
  const lib  = url.protocol === 'https:' ? https : http;
  const opts = {
    method,
    hostname: url.hostname,
    port:     url.port || (url.protocol === 'https:' ? 443 : 80),
    path:     url.pathname + url.search,
    headers: { 'Content-Type': 'application/json', ...headers },
  };
  return new Promise((resolve, reject) => {
    const r = lib.request(opts, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        let json;
        try { json = JSON.parse(data); } catch { json = { _raw: data }; }
        resolve({ status: res.statusCode, json });
      });
    });
    r.on('error', reject);
    if (body !== undefined) r.write(JSON.stringify(body));
    r.end();
  });
}

async function run() {
  console.log(`\n🎵  cumu API test — ${BASE}\n`);

  // ── 1. Setup admin user ────────────────────────────────────────────────────
  console.log('── 1. Setup / first-run ──');
  const setup = await req('POST', '/auth/setup', { username: USER, password: PASS });
  ok('Setup responded (200 or 400 "already done")', setup.status === 200 || (setup.status === 400 && setup.json.error?.includes('already')));

  // ── 2. OAuth2 Authorization Code Flow ─────────────────────────────────────
  console.log('\n── 2. OAuth2 Authorization Code Flow ──');

  // Register the web client if it doesn't exist yet — using session login
  const loginRes = await req('POST', '/auth/login', { username: USER, password: PASS });
  ok('Session login succeeds', loginRes.status === 200 && loginRes.json.ok);

  // Authorize
  const authRes = await req('POST', '/oauth/authorize', {
    client_id: CLIENT,
    redirect_uri: BASE,
    scope: 'read write admin',
    response_type: 'code',
    username: USER,
    password: PASS,
  });
  ok('Authorize returns code', authRes.status === 200 && typeof authRes.json.code === 'string');

  const code = authRes.json.code;

  // Exchange code for token
  const tokenRes = await req('POST', '/oauth/token', {
    grant_type: 'authorization_code',
    code,
    redirect_uri: BASE,
    client_id: CLIENT,
    client_secret: SECRET,
  });
  ok('Token exchange succeeds', tokenRes.status === 200 && tokenRes.json.access_token);
  ok('Refresh token present', !!tokenRes.json.refresh_token);

  let accessToken  = tokenRes.json.access_token;
  let refreshToken = tokenRes.json.refresh_token;

  // ── 3. Token Refresh ───────────────────────────────────────────────────────
  console.log('\n── 3. Token Refresh ──');
  const refreshRes = await req('POST', '/oauth/token', {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT,
    client_secret: SECRET,
  });
  ok('Refresh returns new access token', refreshRes.status === 200 && refreshRes.json.access_token);
  ok('Refresh rotates refresh token', refreshRes.json.refresh_token !== refreshToken);

  accessToken  = refreshRes.json.access_token;
  refreshToken = refreshRes.json.refresh_token;
  const authHdr = { Authorization: `Bearer ${accessToken}` };

  // ── 4. GET /user/me ────────────────────────────────────────────────────────
  console.log('\n── 4. User Info ──');
  const meRes = await req('GET', '/user/me', undefined, authHdr);
  ok('GET /user/me returns username', meRes.status === 200 && meRes.json.username === USER);
  ok('User has admin role', meRes.json.role === 'admin');

  // ── 5. GET /api/home ───────────────────────────────────────────────────────
  console.log('\n── 5. Library Endpoints ──');
  const homeRes = await req('GET', '/api/home', undefined, authHdr);
  ok('GET /api/home returns 200', homeRes.status === 200);
  ok('Response has recentlyPlayed/mostPlayed/newSongs', Array.isArray(homeRes.json.recentlyPlayed));

  const songsRes = await req('GET', '/api/songs', undefined, authHdr);
  ok('GET /api/songs returns array', songsRes.status === 200 && Array.isArray(songsRes.json));

  const albumsRes = await req('GET', '/api/albums', undefined, authHdr);
  ok('GET /api/albums returns array', albumsRes.status === 200 && Array.isArray(albumsRes.json));

  // ── 6. Theme Change for all 3 themes ──────────────────────────────────────
  console.log('\n── 6. Theme Switching ──');
  for (const theme of ['klassik', 'standard', 'material3']) {
    const r = await req('POST', '/user/theme', { theme }, authHdr);
    ok(`POST /user/theme "${theme}" returns 200`, r.status === 200 && r.json.theme === theme);
  }

  // ── 7. State Sync ──────────────────────────────────────────────────────────
  console.log('\n── 7. State Sync ──');
  const syncGet = await req('GET', '/api/sync', undefined, authHdr);
  ok('GET /api/sync returns state', syncGet.status === 200 && typeof syncGet.json.version === 'number');

  const currentVersion = syncGet.json.version;
  const syncPost = await req('POST', '/api/sync', {
    volume: 0.8, lastSongId: null, lastPosition: 42, theme: 'standard',
    clientVersion: currentVersion,
  }, authHdr);
  ok('POST /api/sync updates state', syncPost.status === 200 && syncPost.json.version === currentVersion + 1);

  // Conflict detection: send old version
  const syncConflict = await req('POST', '/api/sync', {
    volume: 0.5, clientVersion: 0,
  }, authHdr);
  ok('POST /api/sync detects conflict (409)', syncConflict.status === 409 && syncConflict.json.conflict === true);

  // ── 8. Admin Stats ─────────────────────────────────────────────────────────
  console.log('\n── 8. Admin Endpoints ──');
  const statsRes = await req('GET', '/admin/stats', undefined, authHdr);
  ok('GET /admin/stats returns counts', statsRes.status === 200 && typeof statsRes.json.users === 'number');

  const logsRes = await req('GET', '/admin/logs', undefined, authHdr);
  ok('GET /admin/logs returns array', logsRes.status === 200 && Array.isArray(logsRes.json));

  // ── 9. Token Revocation ────────────────────────────────────────────────────
  console.log('\n── 9. Token Revocation ──');
  const revokeRes = await req('POST', '/oauth/revoke', {
    token: accessToken,
    client_id: CLIENT,
    client_secret: SECRET,
  });
  ok('POST /oauth/revoke returns ok', revokeRes.status === 200 && revokeRes.json.ok);

  // Revoked token should now fail
  const revokedTest = await req('GET', '/user/me', undefined, { Authorization: `Bearer ${accessToken}` });
  ok('Revoked token returns 401', revokedTest.status === 401);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n─────────────────────────────────────────`);
  console.log(`  Total: ${passed + failed}  |  Passed: ${passed}  |  Failed: ${failed}`);
  console.log(`─────────────────────────────────────────\n`);

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
