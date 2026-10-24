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
const { getDB, getConfig, setConfig, log, getOrCreateArtist } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getOrCreateAlbum, cleanupOrphanedAlbums, resolveEditedSongAlbum } = require('../services/albums');
const { dedupeLibrary, findDuplicateSong, getIgnoredFiles, ignoreFile, releaseIgnoredFiles } = require('../services/dedupe');
const { testMistralKey } = require('../services/mistral');
const { processSongLookup, triggerLibraryAutoLookup, queueSongForLookup } = require('../services/autoLookup');


const router = express.Router();

// ── Multer upload setup ───────────────────────────────────────────────────────

const AUDIO_EXTS = ['.mp3', '.m4a', '.aac', '.alac', '.mp4', '.flac', '.ogg', '.wav', '.opus'];
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

// Two music paths exist for historical reasons and must not be unified here:
// the scanner reads MUSIC_PATH first, while uploads, deletes and streaming
// (routes/stream.js) use the configured path. Changing either would move files
// away from where existing installations expect them.
function getScanPath() {
  return process.env.MUSIC_PATH || getConfig().musicPath || path.join(process.cwd(), 'music');
}
function getStoragePath() {
  return getConfig().musicPath || path.join(process.cwd(), 'music');
}
// A song file may live under either path
function findSongFile(filename) {
  for (const base of new Set([getStoragePath(), getScanPath()])) {
    const filePath = path.join(base, filename);
    if (fs.existsSync(filePath)) return filePath;
  }
  return null;
}

// Uploaded files land in the music folder before their songs are inserted.
// The background scan must not index them in the meantime.
const pendingUploads = new Set();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const musicPath = getStoragePath();
    try {
      if (!fs.existsSync(musicPath)) fs.mkdirSync(musicPath, { recursive: true });
      cb(null, musicPath);
    } catch (err) { cb(err); }
  },
  filename: (req, file, cb) => {
    const name = `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`;
    pendingUploads.add(name);
    cb(null, name);
  },
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
      albumArtist: c.albumartist || c.artist || null,
      albumArtistTag: c.albumartist || null,
      album:    c.album || null,
      year:     c.year || null,
      genre:    Array.isArray(c.genre) ? c.genre[0] : (c.genre || null),
      track:    c.track?.no || null,
      duration: Math.round(meta.format.duration || 0),
      codec:    meta.format.codec || null,
      picture:  c.picture?.length ? c.picture[0] : null,
    };
  } catch {
    return { unreadable: true, title: path.basename(filePath, path.extname(filePath)), artist: null, albumArtist: null, albumArtistTag: null, album: null, year: null, genre: null, track: null, duration: 0, codec: null, picture: null };
  }
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
    is_user_edited: fields.is_user_edited, lookup_status: fields.lookup_status,
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
  const uploadedNames = Object.values(req.files || {}).flat().map(f => f.filename);
  try {
    const db        = getDB();
    const cfg       = getConfig();
    const musicPath = process.env.MUSIC_PATH || cfg.musicPath || path.join(process.cwd(), 'music');
    const coverFile = req.files?.cover?.[0];
    const songFiles = (req.files?.files || []).filter(f => AUDIO_EXTS.includes(path.extname(f.originalname).toLowerCase()));

    if (!songFiles.length) return res.status(400).json({ error: 'No audio files uploaded' });

    const results = [];
    let skipped = 0;
    // Files of one upload with the same album title and no album artist tag
    // form one album (e.g. a compilation dropped in as a folder)
    const batchAlbums = new Map();
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

      const artistId      = getOrCreateArtist(db, artistName);
      const albumArtistId = req.body.artist ? artistId : getOrCreateArtist(db, meta.albumArtist || artistName);
      const batchKey      = (!req.body.artist && !meta.albumArtistTag && albumTitle) ? String(albumTitle).trim().toLowerCase() : null;
      const albumId       = (batchKey && batchAlbums.get(batchKey)) || getOrCreateAlbum(db, albumTitle, albumArtistId, meta);
      if (batchKey && albumId && !batchAlbums.has(batchKey)) batchAlbums.set(batchKey, albumId);
      const fileSize      = fs.statSync(filePath).size;

      // Same song already in the library: drop the uploaded copy
      const existing = findDuplicateSong(db, { title: songTitle, artist_id: artistId, album_id: albumId, duration: meta.duration, file_size: fileSize, track_number: meta.track });
      if (existing) {
        try { fs.unlinkSync(filePath); } catch {}
        pendingUploads.delete(file.filename);
        cleanupOrphanedAlbums(db);
        skipped++;
        results.push({ id: existing.id, title: existing.title, artist: artistName, album: albumTitle, skipped: true });
        continue;
      }

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

      const userProvided = !!(req.body.artist || req.body.album || req.body.title || req.body.genre);
      const songId   = uuidv4();

      insertSong(db, {
        id: songId, title: songTitle, artist_id: artistId, album_id: albumId,
        filename: file.filename, duration: meta.duration, track_number: meta.track,
        genre: genreName, year: meta.year, is_audiobook: isAudiobook,
        file_size: fileSize, cover: coverFilename, mime_type: mime,
        is_user_edited: userProvided ? 1 : 0
      });
      pendingUploads.delete(file.filename);

      // Perform lookup immediately upon uploading
      if (cfg.autoLookupEnabled !== false) {
        try {
          await processSongLookup(songId);
        } catch (e) {
          console.error(`[cumu] Direct upload lookup error for ${songId}:`, e.message);
        }
      } else {
        queueSongForLookup(songId);
      }

      const updatedSong = db.prepare('SELECT s.*, ar.name as artist_name, al.title as album_title FROM songs s LEFT JOIN artists ar ON ar.id=s.artist_id LEFT JOIN albums al ON al.id=s.album_id WHERE s.id=?').get(songId);

      results.push({
        id: songId,
        title: updatedSong?.title || songTitle,
        artist: updatedSong?.artist_name || artistName,
        album: updatedSong?.album_title || albumTitle,
        genre: updatedSong?.genre || genreName,
        year: updatedSong?.year || meta.year,
        codec: meta.codec
      });
    }

    const uploaded = results.length - skipped;
    log('info', 'admin', `Uploaded ${uploaded} songs${skipped ? `, skipped ${skipped} already in the library` : ''}`);
    res.json({ success: true, uploaded, skipped, songs: results });

  } catch (err) {
    console.error('[cumu] upload error:', err);
    res.status(500).json({ error: 'Upload processing failed: ' + (err.message || 'unknown error') });
  } finally {
    // Anything not inserted is left to the regular scan
    for (const name of uploadedNames) pendingUploads.delete(name);
  }
}

router.post('/upload', requireAdmin, handleUpload, processUpload);

// ── LIBRARY — SCAN ────────────────────────────────────────────────────────────

// Album of an already indexed song with this album title in the same folder.
// Lets compilations without album artist tag stay one album even though their
// tracks have different artists. The music root is excluded: it holds uploads
// of unrelated albums side by side.
function findAlbumInFolder(db, relativePath, albumTitle) {
  const dir = path.posix.dirname(relativePath);
  if (!albumTitle || dir === '.') return null;
  const likeDir = dir.replace(/[\\%_]/g, ch => '\\' + ch);
  const rows = db.prepare(`
    SELECT s.filename, s.album_id FROM songs s
    JOIN albums a ON a.id = s.album_id
    WHERE s.filename LIKE ? ESCAPE '\\' AND LOWER(TRIM(a.title)) = LOWER(TRIM(?))
  `).all(`${likeDir}/%`, albumTitle);
  const hit = rows.find(row => path.posix.dirname(row.filename) === dir);
  return hit ? hit.album_id : null;
}

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

// ── Scan job ──────────────────────────────────────────────────────────────────
// A scan runs entirely on the server, so closing the browser does not stop it:
//   1. new files in the music folder are indexed (tags read, song inserted),
//   2. every indexed song goes through the metadata lookup (MusicBrainz ->
//      Mistral). Songs waiting for it carry lookup_status = 'pending', so an
//      interrupted scan continues after a restart.
// The first scan of a fresh installation is started by an admin and blocks the
// web client until it is done. Later scans start on their own in the background.

const INITIAL_SCAN_THRESHOLD = 20;
// Used for time estimates until the running scan has measured its own speed
const DEFAULT_INDEX_MS  = 150;
const DEFAULT_LOOKUP_MS = 2500;
const TIMING_WINDOW     = 25;

const scan = {
  running: false,
  initial: false,
  phase: 'idle',        // 'indexing' | 'lookup' | 'idle'
  indexTotal: 0, indexDone: 0,
  lookupTotal: 0, lookupDone: 0,
  current: null,
  startedAt: null,
  newFiles: 0,          // unindexed files found by the last check
  indexTimes: [],
  lookupTimes: [],
  lastResult: null,
};

function average(times, fallback) {
  return times.length ? times.reduce((a, b) => a + b, 0) / times.length : fallback;
}
function recordTime(times, ms) {
  times.push(ms);
  if (times.length > TIMING_WINDOW) times.shift();
}

function isLookupEnabled() {
  return getConfig().autoLookupEnabled !== false;
}

function countPendingLookups(db) {
  return db.prepare("SELECT COUNT(*) AS c FROM songs WHERE lookup_status = 'pending'").get().c;
}

// A fresh installation stays in initial mode until its first scan finished.
// A library that already holds enough processed songs never enters it.
function isInitialMode(db) {
  const cfg = getConfig();
  if (cfg.initialScanDone === true) return false;
  if (cfg.initialScanStarted === true) return true;
  const processed = db.prepare("SELECT COUNT(*) AS c FROM songs WHERE lookup_status IS NOT 'pending'").get().c;
  if (processed >= INITIAL_SCAN_THRESHOLD) {
    setConfig('initialScanDone', true);
    return false;
  }
  return true;
}

function getExistingScanPath() {
  const musicPath = getScanPath();
  if (!fs.existsSync(musicPath)) {
    try { fs.mkdirSync(musicPath, { recursive: true }); } catch {}
  }
  return fs.existsSync(musicPath) ? musicPath : null;
}

function findNewFiles(db, musicPath) {
  const allAudioFiles = scanDirectoryRecursive(musicPath, musicPath);
  const known = new Set([...db.prepare('SELECT filename FROM songs').all().map(r => r.filename), ...getIgnoredFiles(db)]);
  return allAudioFiles.filter(item => !known.has(item.relativePath) && !pendingUploads.has(item.relativePath));
}

// Returns true when the file was added as a new song
async function indexFile(db, item) {
  const meta = await extractMeta(item.fullPath);
  // Indexed by an upload while the tags were being read
  if (pendingUploads.has(item.relativePath) || db.prepare('SELECT 1 FROM songs WHERE filename = ?').get(item.relativePath)) return false;

  const ext      = path.extname(item.relativePath).toLowerCase();
  const artistId = getOrCreateArtist(db, meta.artist);
  const albumId  = (!meta.albumArtistTag && findAlbumInFolder(db, item.relativePath, meta.album))
    || getOrCreateAlbum(db, meta.album, getOrCreateArtist(db, meta.albumArtist), meta);
  const fileSize = fs.statSync(item.fullPath).size;

  // Another file with the same song is already indexed: don't add it twice
  const existing = findDuplicateSong(db, { title: meta.title, artist_id: artistId, album_id: albumId, duration: meta.duration, file_size: fileSize, track_number: meta.track });
  if (existing) {
    ignoreFile(db, item.relativePath, existing.id);
    cleanupOrphanedAlbums(db);
    return false;
  }

  insertSong(db, {
    id: uuidv4(), title: meta.title, artist_id: artistId, album_id: albumId,
    filename: item.relativePath, duration: meta.duration, track_number: meta.track,
    genre: meta.genre, year: meta.year, is_audiobook: 0,
    file_size: fileSize, cover: null, mime_type: mimeForExt(ext),
    is_user_edited: 0, lookup_status: 'pending',
  });
  return true;
}

async function lookupScannedSong(db, song) {
  let status = 'error';
  try {
    if (song.is_user_edited) {
      status = 'skipped';
    } else {
      const result = await processSongLookup(song.id);
      status = result.ok ? 'matched' : 'unmatched';
    }
  } catch (err) {
    console.error(`[cumu] Scan lookup error for ${song.id}:`, err.message);
  } finally {
    // Always leave 'pending', or the lookup loop would pick the song again
    db.prepare('UPDATE songs SET lookup_status = ? WHERE id = ?').run(status, song.id);
  }
  return status;
}

// Only one scan runs at a time; overlapping calls share the running scan.
// (Two scans in parallel would both see the same new files and add them twice.)
let runningScan = null;
function runLibraryScan() {
  if (!runningScan) runningScan = scanLibrary().finally(() => { runningScan = null; });
  return runningScan;
}

async function scanLibrary() {
  const db = getDB();
  const musicPath = getExistingScanPath();

  Object.assign(scan, {
    running: true, initial: isInitialMode(db), phase: 'indexing',
    indexTotal: 0, indexDone: 0, lookupTotal: 0, lookupDone: 0,
    current: null, startedAt: Date.now(),
  });

  try {
    // Lookups that failed last time (e.g. MusicBrainz was down) are retried
    db.prepare("UPDATE songs SET lookup_status = 'pending' WHERE lookup_status = 'error'").run();

    // 1. Index new files
    const newFiles = musicPath ? findNewFiles(db, musicPath) : [];
    scan.indexTotal  = newFiles.length;
    scan.lookupTotal = isLookupEnabled() ? countPendingLookups(db) + newFiles.length : 0;
    // A scan without anything to do does not count as the first scan
    scan.initial = scan.initial && (scan.indexTotal > 0 || scan.lookupTotal > 0);
    if (scan.initial) setConfig('initialScanStarted', true);

    let added = 0;
    for (const item of newFiles) {
      scan.current = item.relativePath;
      const started = Date.now();
      try {
        if (await indexFile(db, item)) added++;
      } catch (e) {
        console.error(`[cumu] Scan error for ${item.relativePath}:`, e.message);
      }
      recordTime(scan.indexTimes, Date.now() - started);
      scan.indexDone++;
    }
    scan.newFiles = 0;
    if (added > 0) log('info', 'admin', `Library scan: ${added} new songs added`);

    // 2. Look up every song the scan indexed (including leftovers of an
    //    interrupted scan). Stops early if the lookup is switched off meanwhile.
    const counts = { matched: 0, unmatched: 0, skipped: 0, error: 0 };
    scan.phase = 'lookup';
    const nextPending = db.prepare(`
      SELECT s.id, s.title, s.is_user_edited, ar.name AS artist_name
      FROM songs s LEFT JOIN artists ar ON ar.id = s.artist_id
      WHERE s.lookup_status = 'pending' ORDER BY s.created_at LIMIT 1
    `);
    while (isLookupEnabled()) {
      const song = nextPending.get();
      if (!song) break;
      scan.lookupTotal = scan.lookupDone + countPendingLookups(db);
      scan.current = song.artist_name ? `${song.artist_name} – ${song.title}` : song.title;
      const started = Date.now();
      counts[await lookupScannedSong(db, song)]++;
      if (!song.is_user_edited) recordTime(scan.lookupTimes, Date.now() - started);
      scan.lookupDone++;
    }
    if (scan.lookupDone > 0) {
      log('info', 'metadata', `Library scan lookup: ${counts.matched} matched, ${counts.unmatched} without match, ${counts.error} failed`);
    }

    if (scan.initial) setConfig('initialScanDone', true);
    scan.lastResult = { finishedAt: Date.now(), added, ...counts };
    return { scanned: newFiles.length, added, musicPath, ...counts };
  } finally {
    Object.assign(scan, { running: false, phase: 'idle', current: null });
  }
}

// Periodic check: finds new files and starts a background scan when there is
// work. The first scan of a fresh installation waits until an admin starts it.
function checkLibrary() {
  if (runningScan) return runningScan;
  const db = getDB();
  const musicPath = getExistingScanPath();
  scan.newFiles = musicPath ? findNewFiles(db, musicPath).length : 0;
  const pending = isLookupEnabled() ? countPendingLookups(db) : 0;
  if (!scan.newFiles && !pending) return Promise.resolve(null);
  if (isInitialMode(db) && getConfig().initialScanStarted !== true) return Promise.resolve(null);
  return runLibraryScan();
}

function getScanStatus() {
  const db = getDB();
  const lookupOn  = isLookupEnabled();
  const pending   = lookupOn ? countPendingLookups(db) : 0;
  const initial   = isInitialMode(db);
  const avgIndex  = average(scan.indexTimes, DEFAULT_INDEX_MS);
  const avgLookup = average(scan.lookupTimes, DEFAULT_LOOKUP_MS);

  let doneMs = 0, remainingMs;
  if (scan.running) {
    doneMs = scan.indexDone * avgIndex + scan.lookupDone * avgLookup;
    remainingMs = (scan.indexTotal - scan.indexDone) * avgIndex
      + Math.max(0, scan.lookupTotal - scan.lookupDone) * avgLookup;
  } else {
    remainingMs = scan.newFiles * avgIndex + (lookupOn ? (scan.newFiles + pending) * avgLookup : 0);
  }
  const workWaiting = scan.newFiles > 0 || pending > 0;

  return {
    running:    scan.running,
    phase:      scan.phase,
    // The client is locked while the first scan of a fresh installation is
    // waiting to be started or running
    blocking:   scan.running ? scan.initial : (initial && workWaiting),
    needsStart: !scan.running && initial && workWaiting,
    newFiles:   scan.newFiles,
    pending,
    lookupEnabled: lookupOn,
    index:      { done: scan.indexDone, total: scan.indexTotal },
    lookup:     { done: scan.lookupDone, total: scan.lookupTotal },
    current:    scan.current,
    progress:   scan.running && doneMs + remainingMs > 0 ? doneMs / (doneMs + remainingMs) : 0,
    etaSeconds: Math.round(remainingMs / 1000),
    startedAt:  scan.startedAt,
    lastResult: scan.lastResult,
  };
}

router.get('/scan/status', requireAuth, (req, res) => {
  res.json(getScanStatus());
});

// Starts a scan in the background and returns right away; progress is read
// from GET /admin/scan/status
router.post('/scan', requireAdmin, (req, res) => {
  runLibraryScan().catch(err => console.error('[cumu] Library scan error:', err.message));
  res.json({ success: true, ...getScanStatus() });
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
    if (album !== undefined) albumId = album ? resolveEditedSongAlbum(db, song, album, artistId, { year, genre }) : null;

    db.prepare('UPDATE songs SET title=COALESCE(?,title), artist_id=?, album_id=?, genre=COALESCE(?,genre), year=COALESCE(?,year), track_number=COALESCE(?,track_number), is_audiobook=COALESCE(?,is_audiobook), is_user_edited=1 WHERE id=?')
      .run(title || null, artistId, albumId, genre || null, year || null, track_number || null, is_audiobook != null ? (is_audiobook ? 1 : 0) : null, req.params.id);
    cleanupOrphanedAlbums(db);

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
  const musicPath = getStoragePath();
  const song = db.prepare('SELECT * FROM songs WHERE id=?').get(req.params.id);
  if (!song) return res.status(404).json({ error: 'Not found' });
  try { fs.unlinkSync(path.join(musicPath, song.filename)); } catch {}
  db.prepare('DELETE FROM play_history WHERE song_id=?').run(req.params.id);
  db.prepare('DELETE FROM playlist_songs WHERE song_id=?').run(req.params.id);
  db.prepare('DELETE FROM library WHERE song_id=?').run(req.params.id);
  db.prepare('DELETE FROM songs WHERE id=?').run(req.params.id);
  releaseIgnoredFiles(db, req.params.id);
  log('info', 'admin', `Song deleted: ${req.params.id}`);
  res.json({ success: true });
});

router.delete('/albums/:id', requireAdmin, (req, res) => {
  const db = getDB();
  const musicPath = getStoragePath();
  const songs = db.prepare('SELECT * FROM songs WHERE album_id=?').all(req.params.id);
  for (const s of songs) {
    try { fs.unlinkSync(path.join(musicPath, s.filename)); } catch {}
    db.prepare('DELETE FROM play_history WHERE song_id=?').run(s.id);
    db.prepare('DELETE FROM playlist_songs WHERE song_id=?').run(s.id);
    db.prepare('DELETE FROM library WHERE song_id=?').run(s.id);
    db.prepare('DELETE FROM songs WHERE id=?').run(s.id);
    releaseIgnoredFiles(db, s.id);
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
    customPodcastFeeds:     cfg.customPodcastFeeds || [],
    autoLookupEnabled:      cfg.autoLookupEnabled !== false,
    mistralApiKey:          cfg.mistralApiKey || '',
    enableAiCorrection:     cfg.enableAiCorrection === true,
    aiModel:                cfg.aiModel || 'mistral-small-latest'
  });
});

const { validateMusicPath } = require('../utils/pathValidator');

router.put('/config', requireAdmin, (req, res) => {
  const {
    musicPath, maxStorageGb, port, host, enablePodcasts,
    enablePublicPodcasts, podcastApiSource, podcastIndexKey,
    podcastIndexSecret, customPodcastFeeds,
    autoLookupEnabled, mistralApiKey, enableAiCorrection, aiModel
  } = req.body;

  if (musicPath !== undefined) {
    const pathCheck = validateMusicPath(musicPath);
    if (!pathCheck.ok) {
      return res.status(400).json({ error: pathCheck.error });
    }
    setConfig('musicPath', pathCheck.path);
  }
  if (maxStorageGb !== undefined) setConfig('maxStorageGb', maxStorageGb);
  if (port !== undefined) setConfig('port', port);
  if (host !== undefined) setConfig('host', host);
  if (enablePodcasts !== undefined) setConfig('enablePodcasts', !!enablePodcasts);
  
  if (enablePublicPodcasts !== undefined) setConfig('enablePublicPodcasts', !!enablePublicPodcasts);
  if (podcastApiSource !== undefined) setConfig('podcastApiSource', podcastApiSource);
  if (podcastIndexKey !== undefined) setConfig('podcastIndexKey', podcastIndexKey);
  if (podcastIndexSecret !== undefined) setConfig('podcastIndexSecret', podcastIndexSecret);
  if (customPodcastFeeds !== undefined) setConfig('customPodcastFeeds', customPodcastFeeds);

  if (autoLookupEnabled !== undefined) setConfig('autoLookupEnabled', !!autoLookupEnabled);
  if (mistralApiKey !== undefined) setConfig('mistralApiKey', mistralApiKey);
  if (enableAiCorrection !== undefined) setConfig('enableAiCorrection', !!enableAiCorrection);
  if (aiModel !== undefined) setConfig('aiModel', aiModel);

  log('info', 'admin', 'Server config updated');
  res.json({ ok: true });
});

// ── AGENTS & AUTO-LOOKUP ROUTES ───────────────────────────────────────────────

router.post('/agents/test', requireAdmin, async (req, res) => {
  const { apiKey, model } = req.body;
  const keyToTest = apiKey || getConfig().mistralApiKey;
  const modelToTest = model || getConfig().aiModel || 'mistral-small-latest';

  const result = await testMistralKey(keyToTest, modelToTest);
  res.json(result);
});

router.post('/lookup/trigger', requireAdmin, async (req, res) => {
  const result = await triggerLibraryAutoLookup();
  res.json(result);
});

router.post('/songs/:id/lookup', requireAdmin, async (req, res) => {
  try {
    res.json(await processSongLookup(req.params.id));
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});


/**
 * Ask Watchtower (HTTP API, see docker-compose.yml) to pull and apply the
 * latest image right now. The call only returns once Watchtower is done, and
 * Watchtower replaces this container while updating — so a request that is
 * still open after a few seconds means the update is running.
 */
function triggerWatchtowerUpdate() {
  const base  = process.env.WATCHTOWER_URL || 'http://watchtower:8080';
  const token = process.env.WATCHTOWER_HTTP_API_TOKEN;
  const notConfigured = {
    started: false,
    message: 'Sofort-Update nicht verfügbar: Watchtower-HTTP-API ist nicht eingerichtet (siehe docker-compose.yml). Watchtower aktualisiert automatisch innerhalb von ca. 5 Minuten.',
  };
  if (!token) return Promise.resolve({ ...notConfigured, detail: 'WATCHTOWER_HTTP_API_TOKEN not set' });

  let url;
  try { url = new URL('/v1/update', base); } catch { return Promise.resolve({ ...notConfigured, detail: `invalid WATCHTOWER_URL ${base}` }); }
  const client = url.protocol === 'https:' ? require('https') : require('http');

  return new Promise(resolve => {
    let settled = false;
    const done = r => { if (!settled) { settled = true; resolve(r); } };

    const req = client.request(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }, response => {
      response.resume();
      if (response.statusCode === 200) {
        // Still alive after Watchtower finished → there was no newer image
        done({ started: false, detail: 'already up to date', message: 'Watchtower hat nach Updates gesucht: cumu ist bereits auf dem neuesten Stand.' });
      } else {
        done({ ...notConfigured, detail: `HTTP ${response.statusCode}`, message: `Watchtower hat das Update abgelehnt (HTTP ${response.statusCode}). Prüfe WATCHTOWER_HTTP_API_TOKEN.` });
      }
    });
    req.on('error', err => done({ ...notConfigured, detail: err.message }));
    setTimeout(() => done({ started: true, detail: 'update running', message: 'Update läuft: Watchtower lädt das neue Image und startet cumu gleich neu.' }), 4000);
    req.end();
  });
}

// POST /admin/update — trigger system update
router.post('/update', requireAdmin, async (req, res) => {
  const isDocker = fs.existsSync('/.dockerenv');
  const pkgVersion = require('../../package.json').version;

  let latestCommit = 'unknown';
  try {
    const http = require('https');
    const options = {
      hostname: 'api.github.com',
      path: '/repos/Wolfiku/cumu/commits/main',
      headers: { 'User-Agent': 'cumu-server' }
    };
    await new Promise((resolve) => {
      http.get(options, (response) => {
        let body = '';
        response.on('data', chunk => body += chunk);
        response.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.sha) latestCommit = data.sha.substring(0, 7);
          } catch {}
          resolve();
        });
      }).on('error', resolve).setTimeout(5000, function () { this.destroy(); });
    });
  } catch {}

  if (isDocker) {
    const result = await triggerWatchtowerUpdate();
    log(result.started ? 'info' : 'warn', 'admin', `Watchtower update: ${result.detail}`);
    return res.json({
      ok: true,
      isDocker: true,
      started: result.started,
      currentVersion: pkgVersion,
      latestCommit,
      message: result.message,
    });
  }

  // Bare metal / systemd environment
  const updateScript = '/usr/local/bin/cumu-update';
  if (fs.existsSync(updateScript)) {
    const { exec } = require('child_process');
    // The script stops this service when it applies an update; an exit with an
    // error within the first seconds means it never got that far (e.g. not root).
    const early = await new Promise(resolve => {
      exec(`${updateScript} --silent`, (err, stdout, stderr) => {
        const msg = (stderr || err?.message || '').replace(/\x1b\[[0-9;]*m/g, '').trim();
        if (err) log('error', 'admin', `Update process failed: ${msg}`);
        resolve(err ? { error: msg } : { upToDate: true });
      });
      setTimeout(() => resolve(null), 3000);
    });
    if (early?.upToDate) {
      return res.json({
        ok: true,
        isDocker: false,
        started: false,
        currentVersion: pkgVersion,
        latestCommit,
        message: 'cumu ist bereits auf dem neuesten Stand.',
      });
    }
    if (early?.error) {
      return res.json({
        ok: false,
        isDocker: false,
        started: false,
        currentVersion: pkgVersion,
        latestCommit,
        message: `Update fehlgeschlagen: ${early.error}. Führe "sudo cumu-update" auf dem Server aus.`,
      });
    }
    log('info', 'admin', 'Triggered cumu-update background process');
    return res.json({
      ok: true,
      isDocker: false,
      started: true,
      currentVersion: pkgVersion,
      latestCommit,
      message: 'Update gestartet! Der Server aktualisiert sich im Hintergrund und startet gleich neu.'
    });
  }

  res.json({
    ok: true,
    isDocker: false,
    currentVersion: pkgVersion,
    latestCommit,
    message: 'Kein Update-Skript gefunden. Bitte führe "curl -fsSL https://raw.githubusercontent.com/Wolfiku/cumu/main/scripts/install.sh | bash" aus.'
  });
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

// ── LIBRARY — ONE-TIME REPAIR OF MERGED ALBUMS ───────────────────────────────
// Older versions reused any album with a matching title, so albums of different
// artists that share a name ("Greatest Hits") could be merged into one. This
// splits them again, but only where the files prove they belong apart:
//   - songs carry different album artist tags, or
//   - songs without an album artist tag sit in different folders.
// Songs in one folder without album artist tag stay together, and a folder with
// several artists marks the whole album as a compilation that is not touched.
// Albums with unreadable files or manually edited songs are left untouched.

async function repairMergedAlbums() {
  const cfg = getConfig();
  if (cfg.mergedAlbumsRepaired === true || cfg.mergedAlbumsRepaired === 'true') return { split: 0 };

  const db = getDB();
  const mixed = db.prepare(`
    SELECT album_id FROM songs
    WHERE album_id IS NOT NULL
    GROUP BY album_id
    HAVING COUNT(DISTINCT COALESCE(artist_id, '')) > 1
  `).all();

  let split = 0;
  for (const { album_id } of mixed) {
    try {
      const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(album_id);
      if (!album) continue;
      const songs = db.prepare('SELECT id, filename, artist_id, is_user_edited FROM songs WHERE album_id = ?').all(album_id);
      if (songs.some(song => song.is_user_edited)) continue;

      const groups = new Map();
      let unreadable = false;
      for (const song of songs) {
        const filePath = findSongFile(song.filename);
        const meta = filePath ? await extractMeta(filePath) : null;
        if (!meta || meta.unreadable) { unreadable = true; break; }
        const key = meta.albumArtistTag
          ? `tag:${meta.albumArtistTag.trim().toLowerCase()}`
          : `dir:${path.posix.dirname(song.filename)}`;
        if (!groups.has(key)) groups.set(key, { tag: meta.albumArtistTag, songs: [] });
        groups.get(key).songs.push(song);
      }
      if (unreadable || groups.size < 2) continue;
      // A folder holding several artists without album artist tag is a
      // compilation (possibly split into CD1/CD2 folders): leave the album alone
      const isCompilationFolder = (group) => !group.tag && new Set(group.songs.map(song => song.artist_id || null)).size > 1;
      if ([...groups.values()].some(isCompilationFolder)) continue;

      db.transaction(() => {
        let albumKept = false;
        for (const group of groups.values()) {
          const artistId = group.tag ? getOrCreateArtist(db, group.tag) : (group.songs[0].artist_id || null);

          if (!albumKept && (artistId || null) === (album.artist_id || null)) {
            albumKept = true;
            continue;
          }
          let target = db.prepare('SELECT id FROM albums WHERE LOWER(TRIM(title)) = LOWER(TRIM(?)) AND artist_id IS ? AND id != ?')
            .get(album.title, artistId || null, album.id);
          if (!target) {
            target = { id: uuidv4() };
            db.prepare('INSERT INTO albums (id, title, artist_id, year, genre, cover, is_audiobook) VALUES (?, ?, ?, ?, ?, ?, ?)')
              .run(target.id, album.title, artistId || null, album.year, album.genre, album.cover, album.is_audiobook || 0);
          }
          const moveSong = db.prepare('UPDATE songs SET album_id = ? WHERE id = ?');
          for (const song of group.songs) moveSong.run(target.id, song.id);
        }
      })();
      split++;
    } catch (err) {
      console.error(`[cumu] Album repair skipped album ${album_id}:`, err.message);
    }
  }

  cleanupOrphanedAlbums(db);
  setConfig('mergedAlbumsRepaired', 'true');
  if (split > 0) log('info', 'admin', `Split ${split} album(s) that mixed songs of different artists`);
  return { split };
}

router.runLibraryScan = runLibraryScan;
router.checkLibrary  = checkLibrary;
router.repairMergedAlbums = repairMergedAlbums;
router.dedupeLibrary = () => {
  const result = dedupeLibrary(getDB(), findSongFile);
  if (result.albums || result.songs) {
    log('info', 'admin', `Merged ${result.albums} duplicate album(s) and ${result.songs} duplicate song(s)`);
  }
  return result;
};
router.handleUpload   = handleUpload;
router.processUpload   = processUpload;

module.exports = router;
