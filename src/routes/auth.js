/**
 * src/routes/auth.js
 * Session-based login for the web client (legacy auth).
 * OAuth2 authorization is handled separately in src/routes/oauth.js.
 */

'use strict';

const express = require('express');
const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDB, getConfig, setConfig } = require('../db');

const router = express.Router();

// POST /auth/login — session login (web client convenience)
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const db   = getDB();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  if (user.is_blocked) return res.status(403).json({ error: 'Account is blocked' });

  req.session.userId   = user.id;
  req.session.username = user.username;
  req.session.role     = user.role;

  req.session.save(err => {
    if (err) return res.status(500).json({ error: 'Session error' });
    res.json({ ok: true, username: user.username, role: user.role, theme: user.theme || 'coddy' });
  });
});

// GET /auth/me
router.get('/me', (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not logged in' });
  const db = getDB();
  const user = db.prepare('SELECT id, username, role, theme FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  res.json({ userId: user.id, username: user.username, role: user.role, theme: user.theme || 'coddy' });
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// POST /auth/setup — initial server setup (creates admin user)
router.post('/setup', async (req, res) => {
  if (getConfig().setupDone) return res.status(400).json({ error: 'Setup already done' });
  const { username, password, musicDir } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const hash = await bcrypt.hash(password, 12);
  const db   = getDB();
  const id   = uuidv4();
  db.prepare('INSERT OR IGNORE INTO users (id, username, password, role) VALUES (?, ?, ?, ?)').run(id, username, hash, 'admin');
  if (musicDir) setConfig('musicPath', musicDir);
  setConfig('setupDone', 'true');

  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  req.session.userId   = user.id;
  req.session.username = username;
  req.session.role     = 'admin';
  req.session.save(() => res.json({ ok: true }));
});

module.exports = router;
