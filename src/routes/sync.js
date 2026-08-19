/**
 * src/routes/sync.js
 * Cross-client Settings & Playback State Synchronization.
 *
 * GET  /api/sync        – Fetch latest user state
 * POST /api/sync        – Update user state (with version/timestamp conflict resolution)
 */

'use strict';

const express = require('express');
const { getDB } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/sync — fetch latest user state
router.get('/', requireAuth, (req, res) => {
  const db = getDB();
  const userId = req.user.id;

  let state = db.prepare('SELECT * FROM user_state WHERE user_id = ?').get(userId);

  if (!state) {
    // Initialize state on first access
    db.prepare(`
      INSERT INTO user_state (user_id, volume, last_song_id, last_position, theme, extra_settings, version, updated_at)
      VALUES (?, 1.0, NULL, 0, 'standard', '{}', 0, unixepoch())
    `).run(userId);
    state = db.prepare('SELECT * FROM user_state WHERE user_id = ?').get(userId);
  }

  let extra = {};
  try { extra = JSON.parse(state.extra_settings); } catch {}

  res.json({
    userId: state.user_id,
    volume: state.volume,
    lastSongId: state.last_song_id,
    lastPosition: state.last_position,
    theme: 'standard',
    extraSettings: extra,
    version: state.version,
    updatedAt: state.updated_at,
  });
});

// POST /api/sync — update user state
// Body: { volume?, lastSongId?, lastPosition?, theme?, extraSettings?, clientVersion }
// If clientVersion < server version → return 409 with server state.
// If clientVersion >= server version → update and increment version.
router.post('/', requireAuth, (req, res) => {
  const db = getDB();
  const userId = req.user.id;
  const {
    volume,
    lastSongId,
    lastPosition,
    theme,
    extraSettings,
    clientVersion,
  } = req.body;

  // Ensure state row exists
  const existing = db.prepare('SELECT * FROM user_state WHERE user_id = ?').get(userId);
  if (!existing) {
    db.prepare(`
      INSERT INTO user_state (user_id, volume, last_song_id, last_position, theme, extra_settings, version, updated_at)
      VALUES (?, 1.0, NULL, 0, 'standard', '{}', 0, unixepoch())
    `).run(userId);
  }

  const current = db.prepare('SELECT * FROM user_state WHERE user_id = ?').get(userId);

  // Conflict detection: if client version is behind server version → return conflict
  if (clientVersion !== undefined && clientVersion < current.version) {
    let extra = {};
    try { extra = JSON.parse(current.extra_settings); } catch {}
    return res.status(409).json({
      conflict: true,
      serverState: {
        userId: current.user_id,
        volume: current.volume,
        lastSongId: current.last_song_id,
        lastPosition: current.last_position,
        theme: 'standard',
        extraSettings: extra,
        version: current.version,
        updatedAt: current.updated_at,
      },
    });
  }

  // Build update
  const newVolume      = volume      !== undefined ? volume      : current.volume;
  const newLastSong    = lastSongId  !== undefined ? lastSongId  : current.last_song_id;
  const newLastPos     = lastPosition !== undefined ? lastPosition : current.last_position;
  const newTheme       = 'standard';
  const newExtra       = extraSettings !== undefined ? JSON.stringify(extraSettings) : current.extra_settings;
  const newVersion     = current.version + 1;

  db.prepare(`
    UPDATE user_state
    SET volume = ?, last_song_id = ?, last_position = ?, theme = ?,
        extra_settings = ?, version = ?, updated_at = unixepoch()
    WHERE user_id = ?
  `).run(newVolume, newLastSong, newLastPos, newTheme, newExtra, newVersion, userId);

  // Also sync theme to users table for quick access
  if (theme !== undefined) {
    db.prepare('UPDATE users SET theme = ?, updated_at = unixepoch() WHERE id = ?').run(newTheme, userId);
  }

  let extra = {};
  try { extra = JSON.parse(newExtra); } catch {}

  res.json({
    ok: true,
    version: newVersion,
    updatedAt: Math.floor(Date.now() / 1000),
    state: {
      volume: newVolume,
      lastSongId: newLastSong,
      lastPosition: newLastPos,
      theme: newTheme,
      extraSettings: extra,
    },
  });
});

module.exports = router;
