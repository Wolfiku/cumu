/**
 * src/middleware/auth.js
 * OAuth2 Bearer Token authentication middleware.
 * Verifies tokens against the oauth_tokens table.
 * Supports both Authorization header and ?token= query param.
 */

'use strict';

const { getDB } = require('../db');

/**
 * Resolve a Bearer token from the request.
 * Priority: Authorization header > query param > body param.
 */
function extractToken(req) {
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  if (req.query.token) return req.query.token;
  if (req.body && req.body.access_token) return req.body.access_token;
  return null;
}

/**
 * requireAuth(req, res, next)
 * Middleware that validates an OAuth2 Bearer access token.
 * On success: attaches req.user and req.oauthScope.
 * On failure: returns 401 JSON.
 */
function requireAuth(req, res, next) {
  // Legacy session support: if session userId is set (web client after login), also accept.
  if (req.session && req.session.userId) {
    const db = getDB();
    const user = db.prepare('SELECT id, username, role, is_blocked, theme FROM users WHERE id = ?').get(req.session.userId);
    if (!user || user.is_blocked) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'User blocked or not found' });
    }
    req.user = user;
    req.oauthScope = 'read write admin'; // session = full access
    return next();
  }

  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Bearer token required' });

  const db = getDB();
  const now = Math.floor(Date.now() / 1000);

  const row = db.prepare(`
    SELECT t.user_id, t.scope, t.access_expires_at, t.revoked,
           u.id, u.username, u.role, u.is_blocked, u.theme
    FROM oauth_tokens t
    JOIN users u ON u.id = t.user_id
    WHERE t.access_token = ?
  `).get(token);

  if (!row)               return res.status(401).json({ error: 'Invalid access token' });
  if (row.revoked)        return res.status(401).json({ error: 'Token has been revoked' });
  if (row.access_expires_at < now) return res.status(401).json({ error: 'Access token expired' });
  if (row.is_blocked)     return res.status(403).json({ error: 'User account is blocked' });

  req.user = {
    id: row.user_id,
    username: row.username,
    role: row.role,
    is_blocked: row.is_blocked,
    theme: row.theme,
  };
  req.oauthScope = row.scope;
  next();
}

/**
 * requireAdmin(req, res, next)
 * Extends requireAuth — additionally checks that user has 'admin' role.
 */
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user) return; // requireAuth already responded
    if (!['admin', 'creator'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

/**
 * requireScope(scope)
 * Factory returning middleware that checks the token has the required scope.
 */
function requireScope(scope) {
  return (req, res, next) => {
    if (!req.oauthScope || !req.oauthScope.split(' ').includes(scope)) {
      return res.status(403).json({ error: `Scope '${scope}' required` });
    }
    next();
  };
}

module.exports = { requireAuth, requireAdmin, requireScope, extractToken };
