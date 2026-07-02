const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const mm      = require('music-metadata');
const { getDB, getConfig } = require('../db');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  if (!['admin', 'creator'].includes(req.session.role)) return res.status(403).json({ error: 'Forbidden' });
  next();
}

// ── multer storage ───────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const cfg = getConfig();
    const musicPath = cfg.musicPath || path.join(process.cwd(), 'music');
    try {
      if (!fs.existsSync(musicPath)) fs.mkdirSync(musicPath, { recursive: true });
      cb(null, musicPath);
    } catch (err) {
      // Requirement #7: surface filesystem errors (permissions, missing disk,
      // read-only mount) instead of letting multer fail silently and drop
      // the connection, which the browser reports as "network error".
      cb(err);
    }
  },
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`)
});

// Allowed audio formats: MP3, AAC, ALAC (.m4a/.aac), FLAC, OGG, WAV + images
const AUDIO_EXTS  = ['.mp3', '.m4a', '.aac', '.alac', '.mp4', '.flac', '.ogg', '.wav', '.opus'];
const IMAGE_EXTS  = ['.jpg', '.jpeg', '.png', '.webp'];

// Requirement #7: explicit, generous per-file limit + a sane field-count
// limit. The previous config only capped fileSize but had no fields/parts
// limit, and had no error handler wired in at all — any multer error
// (LIMIT_FILE_SIZE, LIMIT_UNEXPECTED_FILE, corrupted multipart stream, or a
// client disconnect mid-upload) propagated as an uncaught exception, which
// Express turned into a connection reset. The browser then reports this as
// a generic "network error" with no useful message.
const upload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1 GB per file (raised from 500MB to avoid false positives on large lossless files)
    files: 200,
    fields: 30,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (![...AUDIO_EXTS, ...IMAGE_EXTS].includes(ext)) {
      // Reject with an explicit error (rather than cb(null, false), which
      // silently drops the file and can leave req.files inconsistent)
      return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
    }
    cb(null, true);
  }
});

// ── MIME type helper ─────────────────────────────────────────────────────────
function mimeForExt(ext) {
  const map = {
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
  return map[ext] || 'audio/mpeg';
}

// ── metadata extraction (music-metadata handles MP3, AAC, ALAC, FLAC …) ─────
async function extractMeta(filePath) {
  try {
    const meta   = await mm.parseFile(filePath, { duration: true });
    const common = meta.common || {};
    return {
      title:    common.title   || path.basename(filePath, path.extname(filePath)),
      artist:   common.artist  || common.albumartist || null,
      album:    common.album   || null,
      year:     common.year    || null,
      genre:    Array.isArray(common.genre) ? common.genre[0] : (common.genre || null),
      track:    common.track?.no || null,
      duration: Math.round(meta.format.duration || 0),
      codec:    meta.format.codec || null,
      picture:  common.picture?.length ? common.picture[0] : null
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

// ── Requirement #7: dedicated multer error wrapper ───────────────────────────
// Wraps the upload middleware so any error thrown during multipart parsing
// (bad boundary, oversized file, disk write failure, aborted stream, etc.)
// is caught and turned into a structured JSON response with a helpful
// message, rather than an unhandled exception that Express/Node closes the
// socket for — which is exactly what previously surfaced in the browser as
// "upload failed (network error)" with no further detail.
function handleUpload(req, res, next) {
  const mw = upload.fields([{ name: 'files', maxCount: 200 }, { name: 'cover', maxCount: 1 }]);
  mw(req, res, (err) => {
    if (!err) return next();

    console.error('[cumu] upload error:', err);

    if (err instanceof multer.MulterError) {
      const messages = {
        LIMIT_FILE_SIZE:      'One or more files exceed the maximum allowed size (1 GB per file).',
        LIMIT_FILE_COUNT:     'Too many files in a single upload (max 200).',
        LIMIT_UNEXPECTED_FILE:'Unsupported file type. Allowed audio: mp3, m4a, aac, mp4, flac, ogg, wav, opus. Allowed images: jpg, jpeg, png, webp.',
        LIMIT_FIELD_COUNT:    'Too many form fields sent with the upload.',
      };
      return res.status(400).json({ error: messages[err.code] || `Upload error: ${err.code}` });
    }

    // Filesystem / disk errors surfaced from storage.destination()
    if (err.code === 'ENOSPC') return res.status(507).json({ error: 'Server is out of disk space.' });
    if (err.code === 'EACCES' || err.code === 'EPERM') return res.status(500).json({ error: 'Server does not have permission to write to the music directory.' });
    if (err.code === 'ENOENT') return res.status(500).json({ error: 'Music storage directory is missing or inaccessible.' });

    return res.status(500).json({ error: err.message || 'Unexpected upload error.' });
  });
}

// ── POST /admin/upload ───────────────────────────────────────────────────────
router.post('/upload', requireAdmin, handleUpload, async (req, res) => {
  try {
    const db        = getDB();
    const cfg       = getConfig();
    const musicPath = cfg.musicPath || path.join(process.cwd(), 'music');
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
      const isAudiobook = (req.body.isAudiobook === 'true' || req.body.isAudiobook === true) ? 1 : 0;
      const mime        = mimeForExt(ext);

      const artistId = getOrCreateArtist(db, artistName);
      const albumId  = getOrCreateAlbum(db, albumTitle, artistId, meta);

      // Cover artwork
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

      // Persist song (mime_type column lets stream.js serve the correct Content-Type)
      const songId   = uuidv4();
      const fileSize = fs.statSync(filePath).size;
      db.prepare(
        'INSERT INTO songs (id, title, artist_id, album_id, filename, duration, track_number, genre, year, is_audiobook, file_size, cover, mime_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(songId, songTitle, artistId, albumId, file.filename, meta.duration, meta.track, meta.genre, meta.year, isAudiobook, fileSize, coverFilename, mime);

      results.push({ id: songId, title: songTitle, artist: artistName, album: albumTitle, codec: meta.codec });
    }

    res.json({ success: true, uploaded: results.length, songs: results });
  } catch (err) {
    // Requirement #7: catch-all so an error mid-processing (e.g. a corrupt
    // file that crashes metadata parsing outside the try/catch in
    // extractMeta, or a DB write failure) never results in a dropped
    // connection / unhandled rejection.
    console.error('[cumu] upload processing error:', err);
    res.status(500).json({ error: 'Upload processing failed: ' + (err.message || 'unknown error') });
  }
});

// ── PUT /admin/songs/:id (Requirement #3: fully editable, incl. artist/album) ─
router.put('/songs/:id', requireAdmin, (req, res) => {
  try {
    const db = getDB();
    const { title, artist, album, genre, year, track_number, is_audiobook } = req.body;

    const song = db.prepare('SELECT * FROM songs WHERE id=?').get(req.params.id);
    if (!song) return res.status(404).json({ error: 'Song not found' });

    let artistId = song.artist_id;
    if (artist !== undefined) {
      artistId = artist ? getOrCreateArtist(db, artist) : null;
    }

    let albumId = song.album_id;
    if (album !== undefined) {
      albumId = album ? getOrCreateAlbum(db, album, artistId, { year, genre }) : null;
    }

    db.prepare(
      'UPDATE songs SET title=COALESCE(?,title), artist_id=?, album_id=?, genre=COALESCE(?,genre), year=COALESCE(?,year), track_number=COALESCE(?,track_number), is_audiobook=COALESCE(?,is_audiobook) WHERE id=?'
    ).run(
      title || null,
      artistId,
      albumId,
      genre || null,
      year || null,
      track_number || null,
      is_audiobook != null ? (is_audiobook ? 1 : 0) : null,
      req.params.id
    );

    res.json(db.prepare('SELECT * FROM songs WHERE id=?').get(req.params.id));
  } catch (err) {
    console.error('[cumu] song edit error:', err);
    res.status(500).json({ error: 'Failed to save song: ' + (err.message || 'unknown error') });
  }
});

// ── PUT /admin/albums/:id (new — Requirement #3: album edit page) ────────────
router.put('/albums/:id', requireAdmin, (req, res) => {
  try {
    const db = getDB();
    const { title, artist, year, genre, is_audiobook } = req.body;

    const album = db.prepare('SELECT * FROM albums WHERE id=?').get(req.params.id);
    if (!album) return res.status(404).json({ error: 'Album not found' });

    let artistId = album.artist_id;
    if (artist !== undefined) {
      artistId = artist ? getOrCreateArtist(db, artist) : null;
    }

    db.prepare(
      'UPDATE albums SET title=COALESCE(?,title), artist_id=?, year=COALESCE(?,year), genre=COALESCE(?,genre) WHERE id=?'
    ).run(title || null, artistId, year || null, genre || null, req.params.id);

    if (is_audiobook != null) {
      db.prepare('UPDATE songs SET is_audiobook=? WHERE album_id=?').run(is_audiobook ? 1 : 0, req.params.id);
    }

    res.json(db.prepare('SELECT * FROM albums WHERE id=?').get(req.params.id));
  } catch (err) {
    console.error('[cumu] album edit error:', err);
    res.status(500).json({ error: 'Failed to save album: ' + (err.message || 'unknown error') });
  }
});

// ── DELETE /admin/songs/:id ──────────────────────────────────────────────────
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
  res.json({ success: true });
});

// ── DELETE /admin/albums/:id ─────────────────────────────────────────────────
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
  res.json({ success: true });
});

module.exports = router;
