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

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const cfg = getConfig();
    const musicPath = cfg.musicPath || path.join(process.cwd(), 'music');
    try {
      if (!fs.existsSync(musicPath)) fs.mkdirSync(musicPath, { recursive: true });
      cb(null, musicPath);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`)
});

const AUDIO_EXTS = ['.mp3', '.m4a', '.aac', '.alac', '.mp4', '.flac', '.ogg', '.wav', '.opus'];
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024, files: 200, fields: 30 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (![...AUDIO_EXTS, ...IMAGE_EXTS].includes(ext)) {
      return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
    }
    cb(null, true);
  }
});

function mimeForExt(ext) {
  const map = {
    '.mp3':  'audio/mpeg', '.m4a':  'audio/mp4', '.aac':  'audio/aac',
    '.alac': 'audio/x-m4a', '.mp4':  'audio/mp4', '.flac': 'audio/flac',
    '.ogg':  'audio/ogg', '.wav':  'audio/wav', '.opus': 'audio/ogg; codecs=opus',
  };
  return map[ext] || 'audio/mpeg';
}

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

let _songsColumnsCache = null;
function getSongsColumns(db) {
  if (_songsColumnsCache) return _songsColumnsCache;
  const rows = db.prepare('PRAGMA table_info(songs)').all();
  _songsColumnsCache = new Set(rows.map(r => r.name));
  return _songsColumnsCache;
}

function insertSong(db, fields) {
  const cols = getSongsColumns(db);
  const candidate = {
    id: fields.id,
    title: fields.title,
    artist_id: fields.artist_id,
    album_id: fields.album_id,
    filename: fields.filename,
    duration: fields.duration,
    track_number: fields.track_number,
    genre: fields.genre,
    year: fields.year,
    is_audiobook: fields.is_audiobook,
    file_size: fields.file_size,
    cover: fields.cover,
    mime_type: fields.mime_type,
  };
  const usableKeys = Object.keys(candidate).filter(k => cols.has(k));
  const placeholders = usableKeys.map(() => '?').join(', ');
  const values = usableKeys.map(k => candidate[k]);
  db.prepare(`INSERT INTO songs (${usableKeys.join(', ')}) VALUES (${placeholders})`).run(...values);
}

function handleUpload(req, res, next) {
  const mw = upload.fields([{ name: 'files', maxCount: 200 }, { name: 'cover', maxCount: 1 }]);
  mw(req, res, (err) => {
    if (!err) return next();
    console.error('[cumu] upload error:', err);
    if (err instanceof multer.MulterError) {
      const messages = {
        LIMIT_FILE_SIZE:       'One or more files exceed the maximum allowed size (1 GB per file).',
        LIMIT_FILE_COUNT:      'Too many files in a single upload (max 200).',
        LIMIT_UNEXPECTED_FILE: 'Unsupported file type. Allowed audio: mp3, m4a, aac, mp4, flac, ogg, wav, opus. Allowed images: jpg, jpeg, png, webp.',
        LIMIT_FIELD_COUNT:     'Too many form fields sent with the upload.',
      };
      return res.status(400).json({ error: messages[err.code] || `Upload error: ${err.code}` });
    }
    if (err.code === 'ENOSPC') return res.status(507).json({ error: 'Server is out of disk space.' });
    if (err.code === 'EACCES' || err.code === 'EPERM') return res.status(500).json({ error: 'Server does not have permission to write to the music directory.' });
    if (err.code === 'ENOENT') return res.status(500).json({ error: 'Music storage directory is missing or inaccessible.' });
    return res.status(500).json({ error: err.message || 'Unexpected upload error.' });
  });
}

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
        id: songId,
        title: songTitle,
        artist_id: artistId,
        album_id: albumId,
        filename: file.filename,
        duration: meta.duration,
        track_number: meta.track,
        genre: meta.genre,
        year: meta.year,
        is_audiobook: isAudiobook,
        file_size: fileSize,
        cover: coverFilename,
        mime_type: mime,
      });

      results.push({ id: songId, title: songTitle, artist: artistName, album: albumTitle, codec: meta.codec });
    }

    res.json({ success: true, uploaded: results.length, songs: results });
  } catch (err) {
    console.error('[cumu] upload processing error:', err);
    res.status(500).json({ error: 'Upload processing failed: ' + (err.message || 'unknown error') });
  }
});

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

    db.prepare(
      'UPDATE songs SET title=COALESCE(?,title), artist_id=?, album_id=?, genre=COALESCE(?,genre), year=COALESCE(?,year), track_number=COALESCE(?,track_number), is_audiobook=COALESCE(?,is_audiobook) WHERE id=?'
    ).run(
      title || null, artistId, albumId, genre || null, year || null, track_number || null,
      is_audiobook != null ? (is_audiobook ? 1 : 0) : null, req.params.id
    );

    res.json(db.prepare('SELECT * FROM songs WHERE id=?').get(req.params.id));
  } catch (err) {
    console.error('[cumu] song edit error:', err);
    res.status(500).json({ error: 'Failed to save song: ' + (err.message || 'unknown error') });
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
