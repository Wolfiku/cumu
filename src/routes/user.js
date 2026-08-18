/**
 * src/routes/user.js
 * User settings, password change, and theme preference.
 * All routes require OAuth2 Bearer token authentication.
 */

'use strict';

const express = require('express');
const bcrypt  = require('bcryptjs');
const { getDB, getConfig } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_THEMES = ['klassik', 'coddy', 'material3'];

// GET /user/settings
router.get('/settings', requireAuth, (req, res) => {
  const db   = getDB();
  const cfg  = getConfig();
  const user = db.prepare('SELECT id, username, role, theme, is_blocked FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    username:       user.username,
    role:           user.role,
    theme:          user.theme || 'coddy',
    isBlocked:      !!user.is_blocked,
    enablePodcasts: cfg.enablePodcasts !== false,
  });
});

// GET /user/me — alias for settings (used by login flow)
router.get('/me', requireAuth, (req, res) => {
  const cfg = getConfig();
  res.json({
    userId:         req.user.id,
    username:       req.user.username,
    role:           req.user.role,
    theme:          req.user.theme || 'coddy',
    enablePodcasts: cfg.enablePodcasts !== false,
  });
});

// POST /user/change-password
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'New password and confirmation do not match.' });
  }

  const db   = getDB();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const match = await bcrypt.compare(currentPassword, user.password);
  if (!match) return res.status(401).json({ error: 'Current password is incorrect.' });

  const hashed = await bcrypt.hash(newPassword, 12);
  db.prepare('UPDATE users SET password = ?, updated_at = unixepoch() WHERE id = ?').run(hashed, req.user.id);

  res.json({ success: true, message: 'Password updated successfully.' });
});

// POST /user/theme
router.post('/theme', requireAuth, (req, res) => {
  const { theme } = req.body;
  if (!ALLOWED_THEMES.includes(theme)) {
    return res.status(400).json({
      error: `Invalid theme. Must be one of: ${ALLOWED_THEMES.join(', ')}.`,
    });
  }

  const db = getDB();
  db.prepare('UPDATE users SET theme = ?, updated_at = unixepoch() WHERE id = ?').run(theme, req.user.id);

  // Also update user_state table if it exists
  const stateExists = db.prepare('SELECT user_id FROM user_state WHERE user_id = ?').get(req.user.id);
  if (stateExists) {
    db.prepare('UPDATE user_state SET theme = ?, updated_at = unixepoch(), version = version + 1 WHERE user_id = ?').run(theme, req.user.id);
  }

  res.json({ success: true, theme });
});

module.exports = router;
