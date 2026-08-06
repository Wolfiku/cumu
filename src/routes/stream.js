/**
 * src/routes/stream.js
 * Audio streaming and secure file download with OAuth2 authentication.
 *
 * GET /stream/:songId            – HTTP Range streaming (seek-capable)
 * GET /stream/:songId/download   – Secure download with rights check
 * GET /stream/cover/:filename    – Album art serving
 */

'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { getDB, getConfig } = require('../db');
const { requireAuth }      = require('../middleware/auth');

const router = express.Router();

const MIME_MAP = {
  '.mp3':  'audio/mpeg',
  '.m4a':  'audio/mp4',
  '.aac':  'audio/aac',
  '.alac': 'audio/x-m4a',
  '.mp4':  'audio/mp4',
  '.flac': 'audio/flac',
  '.ogg':  'audio/ogg',
  '.wav':  'audio/wav',
  '.opus': 'audio/ogg; codecs=opus',
};

function getMusicPath() {
  const cfg = getConfig();
  return cfg.musicPath || path.join(process.cwd(), 'music');
}

function resolveSong(songId) {
  const db = getDB();
  return db.prepare('SELECT * FROM songs WHERE id = ?').get(songId);
}

function resolveFilePath(song) {
  const musicPath = getMusicPath();
  return path.join(musicPath, song.filename);
}

function getMimeType(song) {
  const ext = path.extname(song.filename).toLowerCase();
  return song.mime_type || MIME_MAP[ext] || 'audio/mpeg';
}

// ── GET /stream/cover/:filename ───────────────────────────────────────────────
// Public (no auth required) so embedded <img> tags work without token headers
router.get('/cover/:filename', (req, res) => {
  const musicPath = getMusicPath();
  // Prevent path traversal
  const safe = path.basename(req.params.filename);
  const filePath = path.join(musicPath, safe);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
});

// ── GET /stream/:songId ───────────────────────────────────────────────────────
// HTTP Range request streaming with OAuth Bearer token support.
// Token can also be passed as query param ?token= for <audio src="..."> usage.
router.get('/:songId', requireAuth, (req, res) => {
  const song = resolveSong(req.params.songId);
  if (!song) return res.status(404).json({ error: 'Song not found' });

  const filePath = resolveFilePath(song);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });

  const mimeType = getMimeType(song);
  const stat     = fs.statSync(filePath);
  const total    = stat.size;
  const range    = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end   = parts[1] ? parseInt(parts[1], 10) : total - 1;

    if (start >= total || end >= total || start > end) {
      return res.status(416).set('Content-Range', `bytes */${total}`).end();
    }

    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Range':  `bytes ${start}-${end}/${total}`,
      'Accept-Ranges':  'bytes',
      'Content-Length': chunkSize,
      'Content-Type':   mimeType,
      'Cache-Control':  'no-store',
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': total,
      'Content-Type':   mimeType,
      'Accept-Ranges':  'bytes',
      'Cache-Control':  'no-store',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// ── GET /stream/:songId/download ──────────────────────────────────────────────
// Secure download endpoint with rights check.
// Blocked users and users without 'write' scope cannot download.
router.get('/:songId/download', requireAuth, (req, res) => {
  // Rights check: user must not be blocked, scope must include 'read'
  if (req.user.is_blocked) {
    return res.status(403).json({ error: 'Account blocked — download not permitted' });
  }

  const song = resolveSong(req.params.songId);
  if (!song) return res.status(404).json({ error: 'Song not found' });

  const filePath = resolveFilePath(song);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });

  const ext      = path.extname(song.filename).toLowerCase();
  const mimeType = getMimeType(song);

  // Build a clean filename for download
  const safeTitle  = (song.title || 'audio').replace(/[^a-zA-Z0-9\-_ ]/g, '_');
  const filename   = `${safeTitle}${ext}`;

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', fs.statSync(filePath).size);
  res.setHeader('Cache-Control', 'no-store');

  fs.createReadStream(filePath).pipe(res);
});

module.exports = router;
