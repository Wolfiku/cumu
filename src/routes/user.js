// src/routes/user.js
// Handles user-facing settings: password change, theme preference

const express = require('express');
const bcrypt  = require('bcryptjs');
const { getDB } = require('../db');

const router = express.Router();

// Auth guard middleware
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// GET /user/settings — return current user settings
router.get('/settings', requireAuth, (req, res) => {
  const db   = getDB();
  const user = db.prepare('SELECT id, username, role, theme FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ username: user.username, role: user.role, theme: user.theme || 'codec' });
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
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const match = await bcrypt.compare(currentPassword, user.password);
  if (!match) return res.status(401).json({ error: 'Current password is incorrect.' });

  const hashed = await bcrypt.hash(newPassword, 12);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, req.session.userId);

  res.json({ success: true, message: 'Password updated successfully.' });
});

// POST /user/theme — update theme preference
router.post('/theme', requireAuth, (req, res) => {
  const { theme } = req.body;
  const allowed = ['codec', 'standard'];
  if (!allowed.includes(theme)) {
    return res.status(400).json({ error: 'Invalid theme. Must be "codec" or "standard".' });
  }

  const db = getDB();
  db.prepare('UPDATE users SET theme = ? WHERE id = ?').run(theme, req.session.userId);

  res.json({ success: true, theme });
});

module.exports = router;
