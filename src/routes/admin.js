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
    if (!fs.existsSync(musicPath)) fs.mkdirSync(musicPath, { recursive: true });
    cb(null, musicPath);
  },
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`)
});

// Allowed audio formats: MP3, AAC, ALAC (.m4a/.aac), FLAC, OGG, WAV + images
const AUDIO_EXTS  = ['.mp3', '.m4a', '.aac', '.alac', '.mp4', '.flac', '.ogg', '.wav', '.opus'];
const IMAGE_EXTS  = ['.jpg', '.jpeg', '.png', '.webp'];

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },  // 500 MB per file
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, [...AUDIO_EXTS, ...IMAGE_EXTS].includes(ext));
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

// ── POST /admin/upload ───────────────────────────────────────────────────────
router.post('/upload', requireAdmin,
  upload.fields([{ name: 'files', maxCount: 200 }, { name: 'cover', maxCount: 1 }]),
  async (req, res) => {
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
  }
);

// ── PUT /admin/songs/:id ─────────────────────────────────────────────────────
router.put('/songs/:id', requireAdmin, (req, res) => {
  const db = getDB();
  const { title, genre, year, track_number, is_audiobook } = req.body;
  db.prepare('UPDATE songs SET title=COALESCE(?,title), genre=COALESCE(?,genre), year=COALESCE(?,year), track_number=COALESCE(?,track_number), is_audiobook=COALESCE(?,is_audiobook) WHERE id=?')
    .run(title||null, genre||null, year||null, track_number||null, is_audiobook != null ? (is_audiobook?1:0) : null, req.params.id);
  res.json(getDB().prepare('SELECT * FROM songs WHERE id=?').get(req.params.id));
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
