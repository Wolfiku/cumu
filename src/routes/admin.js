/**
 * src/routes/admin.js
 * Comprehensive Admin API.
 * All routes require OAuth2 Bearer token with admin or creator role.
 *
 * User Management:       GET/POST/PUT/DELETE /admin/users
 * Library Management:    POST /admin/upload, PUT /admin/songs/:id, PUT /admin/albums/:id, DELETE, POST /admin/scan
 * Server Settings/Logs:  GET/PUT /admin/config, GET /admin/logs, GET /admin/stats
 * OAuth Client Mgmt:     GET/POST/DELETE /admin/oauth/clients
 */

'use strict';

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const bcrypt  = require('bcryptjs');
const mm      = require('music-metadata');
const { getDB, getConfig, setConfig, log } = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ── Multer upload setup ───────────────────────────────────────────────────────

const AUDIO_EXTS = ['.mp3', '.m4a', '.aac', '.alac', '.mp4', '.flac', '.ogg', '.wav', '.opus'];
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const cfg = getConfig();
    const musicPath = cfg.musicPath || path.join(process.cwd(), 'music');
    try {
      if (!fs.existsSync(musicPath)) fs.mkdirSync(musicPath, { recursive: true });
      cb(null, musicPath);
    } catch (err) { cb(err); }
  },
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024, files: 200, fields: 30 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (![...AUDIO_EXTS, ...IMAGE_EXTS].includes(ext)) {
      return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
    }
    cb(null, true);
  },
});

function handleUpload(req, res, next) {
  const mw = upload.fields([{ name: 'files', maxCount: 200 }, { name: 'cover', maxCount: 1 }]);
  mw(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const messages = {
        LIMIT_FILE_SIZE:       'One or more files exceed the maximum allowed size (1 GB).',
        LIMIT_FILE_COUNT:      'Too many files in a single upload (max 200).',
        LIMIT_UNEXPECTED_FILE: 'Unsupported file type.',
        LIMIT_FIELD_COUNT:     'Too many form fields.',
      };
      return res.status(400).json({ error: messages[err.code] || `Upload error: ${err.code}` });
    }
    if (err.code === 'ENOSPC') return res.status(507).json({ error: 'Server out of disk space.' });
    return res.status(500).json({ error: err.message || 'Unexpected upload error.' });
  });
}

function mimeForExt(ext) {
  const map = {
    '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
    '.alac': 'audio/x-m4a', '.mp4': 'audio/mp4', '.flac': 'audio/flac',
    '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.opus': 'audio/ogg; codecs=opus',
  };
  return map[ext] || 'audio/mpeg';
}

async function extractMeta(filePath) {
  try {
    const meta = await mm.parseFile(filePath, { duration: true });
    const c = meta.common || {};
    return {
      title:    c.title || path.basename(filePath, path.extname(filePath)),
      artist:   c.artist || c.albumartist || null,
      album:    c.album || null,
      year:     c.year || null,
      genre:    Array.isArray(c.genre) ? c.genre[0] : (c.genre || null),
      track:    c.track?.no || null,
      duration: Math.round(meta.format.duration || 0),
      codec:    meta.format.codec || null,
      picture:  c.picture?.length ? c.picture[0] : null,
    };
  } catch {
    return { title: path.basename(filePath, path.extname(filePath)), artist: null, album: null, year: null, genre: null, track: null, duration: 0, codec: null, picture: null };
  }
}

function getOrCreateArtist(db, name) {
  if (!name) return null;
  let row = db.prepare('SELECT id FROM artists WHERE name = ?').get(name);
  if (!row) { const id = uuidv4(); db.prepare('INSERT INTO artists (id, name) VALUES (?, ?)').run(id, name); row = { id }; }
  return row.id;
}

function getOrCreateAlbum(db, title, artistId, meta) {
  if (!title) return null;
  let row = db.prepare('SELECT id FROM albums WHERE title = ? AND artist_id = ?').get(title, artistId);
  if (!row) {
    const id = uuidv4();
    db.prepare('INSERT INTO albums (id, title, artist_id, year, genre) VALUES (?, ?, ?, ?, ?)').run(id, title, artistId, meta.year || null, meta.genre || null);
    row = { id };
  }
  return row.id;
}

let _songColsCache = null;
function getSongCols(db) {
  if (_songColsCache) return _songColsCache;
  _songColsCache = new Set(db.prepare('PRAGMA table_info(songs)').all().map(r => r.name));
  return _songColsCache;
}

function insertSong(db, fields) {
  const cols = getSongCols(db);
  const candidate = {
    id: fields.id, title: fields.title, artist_id: fields.artist_id, album_id: fields.album_id,
    filename: fields.filename, duration: fields.duration, track_number: fields.track_number,
    genre: fields.genre, year: fields.year, is_audiobook: fields.is_audiobook,
    file_size: fields.file_size, cover: fields.cover, mime_type: fields.mime_type,
  };
  const usable = Object.keys(candidate).filter(k => cols.has(k));
  db.prepare(`INSERT INTO songs (${usable.join(', ')}) VALUES (${usable.map(() => '?').join(', ')})`).run(...usable.map(k => candidate[k]));
}

// ── USER MANAGEMENT ───────────────────────────────────────────────────────────

router.get('/users', requireAdmin, (req, res) => {
  const db = getDB();
  const users = db.prepare('SELECT id, username, role, is_blocked, theme, created_at, updated_at FROM users ORDER BY created_at ASC').all();
  res.json(users);
});

router.post('/users', requireAdmin, async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
  const db = getDB();
  const hashed = await bcrypt.hash(password, 12);
  const id = uuidv4();
  try {
    db.prepare('INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)').run(id, username, hashed, role || 'user');
    log('info', 'admin', `User created: ${username}`);
    res.json({ id, username, role: role || 'user' });
  } catch (e) {
    res.status(400).json({ error: 'Username already taken' });
  }
});

router.put('/users/:id', requireAdmin, async (req, res) => {
  const db = getDB();
  const { role, is_blocked, password } = req.body;
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (role !== undefined) {
    db.prepare('UPDATE users SET role = ?, updated_at = unixepoch() WHERE id = ?').run(role, req.params.id);
  }
  if (is_blocked !== undefined) {
    db.prepare('UPDATE users SET is_blocked = ?, updated_at = unixepoch() WHERE id = ?').run(is_blocked ? 1 : 0, req.params.id);
    log('info', 'admin', `User ${req.params.id} ${is_blocked ? 'blocked' : 'unblocked'}`);
  }
  if (password) {
    const hashed = await bcrypt.hash(password, 12);
    db.prepare('UPDATE users SET password = ?, updated_at = unixepoch() WHERE id = ?').run(hashed, req.params.id);
  }

  const updated = db.prepare('SELECT id, username, role, is_blocked, theme, created_at, updated_at FROM users WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/users/:id', requireAdmin, (req, res) => {
  const db = getDB();
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  log('info', 'admin', `User deleted: ${req.params.id}`);
  res.json({ success: true });
});

// ── LIBRARY — UPLOAD ──────────────────────────────────────────────────────────

async function processUpload(req, res) {
  try {
    const db        = getDB();
    const cfg       = getConfig();
    const musicPath = process.env.MUSIC_PATH || cfg.musicPath || path.join(process.cwd(), 'music');
    const coverFile = req.files?.cover?.[0];
    const songFiles = (req.files?.files || []).filter(f => AUDIO_EXTS.includes(path.extname(f.originalname).toLowerCase()));

    if (!songFiles.length) return res.status(400).json({ error: 'No audio files uploaded' });

    const results = [];
    for (const file of songFiles) {
      const ext      = path.extname(file.originalname).toLowerCase();
      const filePath = file.path;
      const meta     = await extractMeta(filePath);

      const artistName  = req.body.artist      || meta.artist;
      const albumTitle  = req.body.album       || meta.album;
      const songTitle   = req.body.title       || meta.title;
      const genreName   = req.body.genre       || meta.genre;
      const isAudiobook = (req.body.isAudiobook === 'true' || req.body.isAudiobook === true) ? 1 : 0;
      const mime        = mimeForExt(ext);

      meta.genre = genreName; // override meta for getOrCreateAlbum

      const artistId = getOrCreateArtist(db, artistName);
      const albumId  = getOrCreateAlbum(db, albumTitle, artistId, meta);

      let coverFilename = null;
      if (coverFile) {
        coverFilename = coverFile.filename;
        if (albumId) db.prepare('UPDATE albums SET cover=? WHERE id=?').run(coverFilename, albumId);
      } else if (meta.picture) {
        const artExt  = meta.picture.format?.split('/')?.[1] || 'jpg';
        coverFilename = `${uuidv4()}.${artExt}`;
        fs.writeFileSync(path.join(musicPath, coverFilename), meta.picture.data);
        if (albumId) db.prepare('UPDATE albums SET cover=? WHERE id=?').run(coverFilename, albumId);
      }

      const songId   = uuidv4();
      const fileSize = fs.statSync(filePath).size;

      insertSong(db, {
        id: songId, title: songTitle, artist_id: artistId, album_id: albumId,
        filename: file.filename, duration: meta.duration, track_number: meta.track,
        genre: genreName, year: meta.year, is_audiobook: isAudiobook,
        file_size: fileSize, cover: coverFilename, mime_type: mime,
      });

      results.push({ id: songId, title: songTitle, artist: artistName, album: albumTitle, codec: meta.codec });
    }

    log('info', 'admin', `Uploaded ${results.length} songs`);
    res.json({ success: true, uploaded: results.length, songs: results });
  } catch (err) {
    console.error('[cumu] upload error:', err);
    res.status(500).json({ error: 'Upload processing failed: ' + (err.message || 'unknown error') });
  }
}

router.post('/upload', requireAdmin, handleUpload, processUpload);

// ── LIBRARY — SCAN ────────────────────────────────────────────────────────────

function scanDirectoryRecursive(dirPath, baseDir = dirPath) {
  let results = [];
  if (!fs.existsSync(dirPath)) return results;
  const list = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of list) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(scanDirectoryRecursive(fullPath, baseDir));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (AUDIO_EXTS.includes(ext)) {
        const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
        results.push({ fullPath, relativePath });
      }
    }
  }
  return results;
}

async function runLibraryScan() {
  const cfg       = getConfig();
  const musicPath = process.env.MUSIC_PATH || cfg.musicPath || path.join(process.cwd(), 'music');

  if (!fs.existsSync(musicPath)) {
    try { fs.mkdirSync(musicPath, { recursive: true }); } catch {}
  }
  if (!fs.existsSync(musicPath)) {
    return { scanned: 0, added: 0, musicPath };
  }

  const db           = getDB();
  const allAudioFiles = scanDirectoryRecursive(musicPath, musicPath);
  const known        = new Set(db.prepare('SELECT filename FROM songs').all().map(r => r.filename));
  const newFiles     = allAudioFiles.filter(item => !known.has(item.relativePath));

  let added = 0;
  for (const item of newFiles) {
    try {
      const meta     = await extractMeta(item.fullPath);
      const ext      = path.extname(item.relativePath).toLowerCase();
      const artistId = getOrCreateArtist(db, meta.artist);
      const albumId  = getOrCreateAlbum(db, meta.album, artistId, meta);
      const fileSize = fs.statSync(item.fullPath).size;
      const songId   = uuidv4();
      insertSong(db, {
        id: songId, title: meta.title, artist_id: artistId, album_id: albumId,
        filename: item.relativePath, duration: meta.duration, track_number: meta.track,
        genre: meta.genre, year: meta.year, is_audiobook: 0,
        file_size: fileSize, cover: null, mime_type: mimeForExt(ext),
      });
      added++;
    } catch (e) {
      console.error(`[cumu] Scan error for ${item.relativePath}:`, e.message);
    }
  }

  if (added > 0) {
    log('info', 'admin', `Library scan: ${added} new songs added`);
  }
  return { scanned: allAudioFiles.length, added, musicPath };
}

router.post('/scan', requireAdmin, async (req, res) => {
  try {
    const result = await runLibraryScan();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: 'Scan failed: ' + err.message });
  }
});

// ── LIBRARY — EDIT ────────────────────────────────────────────────────────────

router.put('/songs/:id', requireAdmin, (req, res) => {
  try {
    const db = getDB();
    const { title, artist, album, genre, year, track_number, is_audiobook } = req.body;
    const song = db.prepare('SELECT * FROM songs WHERE id=?').get(req.params.id);
    if (!song) return res.status(404).json({ error: 'Song not found' });

    let artistId = song.artist_id;
    if (artist !== undefined) artistId = artist ? getOrCreateArtist(db, artist) : null;
    let albumId = song.album_id;
    if (album !== undefined) albumId = album ? getOrCreateAlbum(db, album, artistId, { year, genre }) : null;

    db.prepare('UPDATE songs SET title=COALESCE(?,title), artist_id=?, album_id=?, genre=COALESCE(?,genre), year=COALESCE(?,year), track_number=COALESCE(?,track_number), is_audiobook=COALESCE(?,is_audiobook) WHERE id=?')
      .run(title || null, artistId, albumId, genre || null, year || null, track_number || null, is_audiobook != null ? (is_audiobook ? 1 : 0) : null, req.params.id);

    res.json(db.prepare('SELECT * FROM songs WHERE id=?').get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: 'Failed to save: ' + err.message });
  }
});

router.put('/albums/:id', requireAdmin, (req, res) => {
  try {
    const db = getDB();
    const { title, artist, year, genre, is_audiobook } = req.body;
    const album = db.prepare('SELECT * FROM albums WHERE id=?').get(req.params.id);
    if (!album) return res.status(404).json({ error: 'Album not found' });

    let artistId = album.artist_id;
    if (artist !== undefined) artistId = artist ? getOrCreateArtist(db, artist) : null;
    db.prepare('UPDATE albums SET title=COALESCE(?,title), artist_id=?, year=COALESCE(?,year), genre=COALESCE(?,genre) WHERE id=?')
      .run(title || null, artistId, year || null, genre || null, req.params.id);

    if (is_audiobook != null) {
      db.prepare('UPDATE songs SET is_audiobook=? WHERE album_id=?').run(is_audiobook ? 1 : 0, req.params.id);
    }
    res.json(db.prepare('SELECT * FROM albums WHERE id=?').get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: 'Failed to save: ' + err.message });
  }
});

router.delete('/songs/:id', requireAdmin, (req, res) => {
  const db = getDB();
  const cfg = getConfig();
  const musicPath = cfg.musicPath || path.join(process.cwd(), 'music');
  const song = db.prepare('SELECT * FROM songs WHERE id=?').get(req.params.id);
  if (!song) return res.status(404).json({ error: 'Not found' });
  try { fs.unlinkSync(path.join(musicPath, song.filename)); } catch {}
  db.prepare('DELETE FROM play_history WHERE song_id=?').run(req.params.id);
  db.prepare('DELETE FROM playlist_songs WHERE song_id=?').run(req.params.id);
  db.prepare('DELETE FROM library WHERE song_id=?').run(req.params.id);
  db.prepare('DELETE FROM songs WHERE id=?').run(req.params.id);
  log('info', 'admin', `Song deleted: ${req.params.id}`);
  res.json({ success: true });
});

router.delete('/albums/:id', requireAdmin, (req, res) => {
  const db = getDB();
  const cfg = getConfig();
  const musicPath = cfg.musicPath || path.join(process.cwd(), 'music');
  const songs = db.prepare('SELECT * FROM songs WHERE album_id=?').all(req.params.id);
  for (const s of songs) {
    try { fs.unlinkSync(path.join(musicPath, s.filename)); } catch {}
    db.prepare('DELETE FROM play_history WHERE song_id=?').run(s.id);
    db.prepare('DELETE FROM playlist_songs WHERE song_id=?').run(s.id);
    db.prepare('DELETE FROM library WHERE song_id=?').run(s.id);
    db.prepare('DELETE FROM songs WHERE id=?').run(s.id);
  }
  db.prepare('DELETE FROM albums WHERE id=?').run(req.params.id);
  log('info', 'admin', `Album deleted: ${req.params.id}`);
  res.json({ success: true });
});

// ── SERVER CONFIG & LOGS ──────────────────────────────────────────────────────

router.get('/config', requireAdmin, (req, res) => {
  const cfg = getConfig();
  res.json({
    port:                   cfg.port || 3000,
    host:                   cfg.host || '0.0.0.0',
    musicPath:              cfg.musicPath || '',
    maxStorageGb:           cfg.maxStorageGb || 50,
    enablePodcasts:         cfg.enablePodcasts !== false,
    enablePublicPodcasts:   cfg.enablePublicPodcasts === true,
    podcastApiSource:       cfg.podcastApiSource || 'itunes',
    podcastIndexKey:        cfg.podcastIndexKey || '',
    podcastIndexSecret:     cfg.podcastIndexSecret || '',
    customPodcastFeeds:     cfg.customPodcastFeeds || []
  });
});

router.put('/config', requireAdmin, (req, res) => {
  const {
    musicPath, maxStorageGb, port, host, enablePodcasts,
    enablePublicPodcasts, podcastApiSource, podcastIndexKey,
    podcastIndexSecret, customPodcastFeeds
  } = req.body;

  if (musicPath !== undefined) setConfig('musicPath', musicPath);
  if (maxStorageGb !== undefined) setConfig('maxStorageGb', maxStorageGb);
  if (port !== undefined) setConfig('port', port);
  if (host !== undefined) setConfig('host', host);
  if (enablePodcasts !== undefined) setConfig('enablePodcasts', !!enablePodcasts);
  
  if (enablePublicPodcasts !== undefined) setConfig('enablePublicPodcasts', !!enablePublicPodcasts);
  if (podcastApiSource !== undefined) setConfig('podcastApiSource', podcastApiSource);
  if (podcastIndexKey !== undefined) setConfig('podcastIndexKey', podcastIndexKey);
  if (podcastIndexSecret !== undefined) setConfig('podcastIndexSecret', podcastIndexSecret);
  if (customPodcastFeeds !== undefined) setConfig('customPodcastFeeds', customPodcastFeeds);

  log('info', 'admin', 'Server config updated');
  res.json({ ok: true });
});

router.get('/stats', requireAdmin, (req, res) => {
  const db = getDB();
  const cfg = getConfig();
  const songs     = db.prepare('SELECT COUNT(*) as c FROM songs').get();
  const albums    = db.prepare('SELECT COUNT(*) as c FROM albums').get();
  const artists   = db.prepare('SELECT COUNT(*) as c FROM artists').get();
  const users     = db.prepare('SELECT COUNT(*) as c FROM users').get();
  const totalSize = db.prepare('SELECT SUM(file_size) as s FROM songs').get();
  res.json({
    songs: songs.c, albums: albums.c, artists: artists.c, users: users.c,
    storageUsedBytes: totalSize.s || 0,
    maxStorageGb: cfg.maxStorageGb || 50,
  });
});

router.get('/logs', requireAdmin, (req, res) => {
  const db   = getDB();
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const rows  = db.prepare('SELECT * FROM system_logs ORDER BY timestamp DESC LIMIT ?').all(limit);
  res.json(rows);
});

// ── OAUTH CLIENT MANAGEMENT ───────────────────────────────────────────────────

router.get('/oauth/clients', requireAdmin, (req, res) => {
  const db = getDB();
  const clients = db.prepare('SELECT id, client_id, name, redirect_uris, scopes, is_active, created_at FROM oauth_clients ORDER BY created_at DESC').all();
  res.json(clients.map(c => ({
    ...c,
    redirect_uris: (() => { try { return JSON.parse(c.redirect_uris); } catch { return []; } })(),
  })));
});

router.post('/oauth/clients', requireAdmin, async (req, res) => {
  const { name, redirect_uris, scopes } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  const db = getDB();
  const clientId     = 'cumu-' + uuidv4().slice(0, 8);
  const clientSecret = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
  const secretHash   = await bcrypt.hash(clientSecret, 10);
  const id           = uuidv4();

  db.prepare(`
    INSERT INTO oauth_clients (id, client_id, client_secret_hash, name, redirect_uris, scopes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, clientId, secretHash, name, JSON.stringify(redirect_uris || []), scopes || 'read');

  log('info', 'admin', `OAuth client registered: ${name} (${clientId})`);

  // Return secret only once
  res.json({ id, clientId, clientSecret, name, redirect_uris: redirect_uris || [], scopes: scopes || 'read' });
});

router.delete('/oauth/clients/:id', requireAdmin, (req, res) => {
  const db = getDB();
  db.prepare('UPDATE oauth_clients SET is_active = 0 WHERE id = ?').run(req.params.id);
  db.prepare('UPDATE oauth_tokens SET revoked = 1 WHERE client_id = (SELECT client_id FROM oauth_clients WHERE id = ?)').run(req.params.id);
  log('info', 'admin', `OAuth client deactivated: ${req.params.id}`);
  res.json({ success: true });
});

router.runLibraryScan = runLibraryScan;
router.handleUpload   = handleUpload;
router.processUpload   = processUpload;

module.exports = router;
