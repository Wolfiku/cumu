const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { getDB, getConfig } = require('../db');

const router = express.Router();

// Fallback MIME map for older rows without mime_type column
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

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// GET /stream/:songId — HTTP Range streaming with correct Content-Type
router.get('/:songId', requireAuth, (req, res) => {
  const db  = getDB();
  const cfg = getConfig();
  const song = db.prepare('SELECT * FROM songs WHERE id=?').get(req.params.songId);
  if (!song) return res.status(404).json({ error: 'Not found' });

  const musicPath = cfg.musicPath || path.join(process.cwd(), 'music');
  const filePath  = path.join(musicPath, song.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  const ext      = path.extname(song.filename).toLowerCase();
  const mimeType = song.mime_type || MIME_MAP[ext] || 'audio/mpeg';
  const stat     = fs.statSync(filePath);
  const total    = stat.size;
  const range    = req.headers.range;

  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end   = endStr ? parseInt(endStr, 10) : total - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range':  `bytes ${start}-${end}/${total}`,
      'Accept-Ranges':  'bytes',
      'Content-Length': chunkSize,
      'Content-Type':   mimeType,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': total,
      'Content-Type':   mimeType,
      'Accept-Ranges':  'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// GET /stream/cover/:filename — serve cover artwork
router.get('/cover/:filename', (req, res) => {
  const cfg = getConfig();
  const musicPath = cfg.musicPath || path.join(process.cwd(), 'music');
  const filePath  = path.join(musicPath, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
});

module.exports = router;
