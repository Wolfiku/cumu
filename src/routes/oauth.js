/**
 * src/routes/oauth.js
 * OAuth2 Authorization Code Flow endpoints.
 *
 * POST /oauth/token       – Exchange auth code or refresh token for access token
 * GET  /oauth/authorize   – Render authorization page (or auto-grant for trusted web client)
 * POST /oauth/authorize   – User grants/denies authorization
 * POST /oauth/revoke      – Revoke access or refresh token
 * GET  /oauth/clients     – List OAuth clients (admin only, for admin-UI convenience)
 */

'use strict';

const express = require('express');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDB, log } = require('../db');

const router = express.Router();

const ACCESS_TOKEN_TTL  = 60 * 60;          // 1 hour
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60; // 30 days
const CODE_TTL          = 5 * 60;            // 5 minutes

function now() { return Math.floor(Date.now() / 1000); }

function generateToken() {
  return crypto.randomBytes(40).toString('hex');
}

/** Look up a client by client_id and verify client_secret */
function verifyClient(db, clientId, clientSecret) {
  const client = db.prepare('SELECT * FROM oauth_clients WHERE client_id = ? AND is_active = 1').get(clientId);
  if (!client) return null;
  if (!bcrypt.compareSync(clientSecret, client.client_secret_hash)) return null;
  return client;
}

// ── POST /oauth/token ────────────────────────────────────────────────────────
router.post('/token', (req, res) => {
  const db = getDB();
  const { grant_type, code, redirect_uri, refresh_token, client_id, client_secret } = req.body;

  if (!client_id || !client_secret) {
    return res.status(400).json({ error: 'invalid_client', error_description: 'client_id and client_secret required' });
  }

  const client = verifyClient(db, client_id, client_secret);
  if (!client) return res.status(401).json({ error: 'invalid_client', error_description: 'Invalid client credentials' });

  // ── Authorization Code Grant ─────────────────────────────────────────────
  if (grant_type === 'authorization_code') {
    if (!code) return res.status(400).json({ error: 'invalid_request', error_description: 'code required' });

    const row = db.prepare('SELECT * FROM oauth_codes WHERE code = ? AND client_id = ? AND used = 0').get(code, client_id);
    if (!row) return res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid or expired authorization code' });
    if (row.expires_at < now()) {
      db.prepare('DELETE FROM oauth_codes WHERE code = ?').run(code);
      return res.status(400).json({ error: 'invalid_grant', error_description: 'Authorization code expired' });
    }
    if (redirect_uri && row.redirect_uri !== redirect_uri) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
    }

    // Mark code used
    db.prepare('UPDATE oauth_codes SET used = 1 WHERE code = ?').run(code);

    const accessToken  = generateToken();
    const refreshToken = generateToken();
    const n = now();

    db.prepare(`
      INSERT INTO oauth_tokens (access_token, refresh_token, client_id, user_id, scope, access_expires_at, refresh_expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(accessToken, refreshToken, client_id, row.user_id, row.scope, n + ACCESS_TOKEN_TTL, n + REFRESH_TOKEN_TTL);

    log('info', 'oauth', `Token issued for user ${row.user_id} via auth code`);

    return res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL,
      refresh_token: refreshToken,
      scope: row.scope,
    });
  }

  // ── Refresh Token Grant ──────────────────────────────────────────────────
  if (grant_type === 'refresh_token') {
    if (!refresh_token) return res.status(400).json({ error: 'invalid_request', error_description: 'refresh_token required' });

    const row = db.prepare('SELECT * FROM oauth_tokens WHERE refresh_token = ? AND client_id = ? AND revoked = 0').get(refresh_token, client_id);
    if (!row) return res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid refresh token' });
    if (row.refresh_expires_at < now()) {
      db.prepare('UPDATE oauth_tokens SET revoked = 1 WHERE refresh_token = ?').run(refresh_token);
      return res.status(400).json({ error: 'invalid_grant', error_description: 'Refresh token expired' });
    }

    // Rotate: revoke old, issue new pair
    db.prepare('UPDATE oauth_tokens SET revoked = 1 WHERE refresh_token = ?').run(refresh_token);

    const newAccess  = generateToken();
    const newRefresh = generateToken();
    const n = now();

    db.prepare(`
      INSERT INTO oauth_tokens (access_token, refresh_token, client_id, user_id, scope, access_expires_at, refresh_expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(newAccess, newRefresh, client_id, row.user_id, row.scope, n + ACCESS_TOKEN_TTL, n + REFRESH_TOKEN_TTL);

    log('info', 'oauth', `Token refreshed for user ${row.user_id}`);

    return res.json({
      access_token: newAccess,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL,
      refresh_token: newRefresh,
      scope: row.scope,
    });
  }

  return res.status(400).json({ error: 'unsupported_grant_type' });
});

// ── GET /oauth/authorize ─────────────────────────────────────────────────────
// For the web client, the SPA performs a headless authorization using session credentials.
router.post('/authorize', (req, res) => {
  const db = getDB();
  const { client_id, redirect_uri, scope = 'read write', response_type, username, password } = req.body;

  if (response_type !== 'code') {
    return res.status(400).json({ error: 'unsupported_response_type' });
  }
  if (!client_id) return res.status(400).json({ error: 'invalid_request', error_description: 'client_id required' });

  const client = db.prepare('SELECT * FROM oauth_clients WHERE client_id = ? AND is_active = 1').get(client_id);
  if (!client) return res.status(400).json({ error: 'invalid_client' });

  // Validate redirect URI
  const allowedUris = (() => { try { return JSON.parse(client.redirect_uris); } catch { return []; } })();
  // 'BUILTIN' is a wildcard for the internal web client — accepts any origin
  const isBuiltin = allowedUris.includes('BUILTIN');
  if (redirect_uri && !isBuiltin && !allowedUris.includes(redirect_uri)) {
    return res.status(400).json({ error: 'invalid_request', error_description: 'Redirect URI not allowed' });
  }

  // Authenticate user (for headless/programmatic authorization by the web client or test clients)
  if (!username || !password) {
    return res.status(400).json({ error: 'invalid_request', error_description: 'username and password required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'access_denied', error_description: 'Invalid credentials' });
  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'access_denied', error_description: 'Invalid credentials' });
  }
  if (user.is_blocked) return res.status(403).json({ error: 'access_denied', error_description: 'User is blocked' });

  // Limit scope to what client is allowed
  const clientScopes = client.scopes.split(' ');
  const requestedScopes = scope.split(' ').filter(s => clientScopes.includes(s));
  const grantedScope = requestedScopes.join(' ') || 'read';

  const code = generateToken();
  const finalRedirectUri = redirect_uri || (allowedUris[0] || '');

  db.prepare(`
    INSERT INTO oauth_codes (code, client_id, user_id, redirect_uri, scope, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(code, client_id, user.id, finalRedirectUri, grantedScope, now() + CODE_TTL);

  log('info', 'oauth', `Auth code issued for user ${user.id}`);

  res.json({ code, redirect_uri: finalRedirectUri, scope: grantedScope });
});

// ── POST /oauth/revoke ───────────────────────────────────────────────────────
router.post('/revoke', (req, res) => {
  const db = getDB();
  const { token, client_id, client_secret } = req.body;
  if (!token) return res.status(400).json({ error: 'invalid_request' });

  if (client_id && client_secret) {
    const client = verifyClient(db, client_id, client_secret);
    if (!client) return res.status(401).json({ error: 'invalid_client' });
  }

  // Try as access token
  db.prepare('UPDATE oauth_tokens SET revoked = 1 WHERE access_token = ?').run(token);
  // Try as refresh token
  db.prepare('UPDATE oauth_tokens SET revoked = 1 WHERE refresh_token = ?').run(token);

  res.json({ ok: true });
});

module.exports = router;
