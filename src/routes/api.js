/**
 * src/routes/api.js
 * Core music library API — all routes require OAuth2 Bearer auth.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB, getConfig } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { fetchPodcastSearchResults } = require('./podcasts');

const router = express.Router();

// ── Genre Central Config ───────────────────────────────────────────────────
router.get('/genres/config', requireAuth, (req, res) => {
  try {
    const genresPath = path.join(__dirname, '../../data/genres.json');
    if (fs.existsSync(genresPath)) {
      const data = fs.readFileSync(genresPath, 'utf8');
      return res.json(JSON.parse(data));
    }
    res.json({});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── Home / Recommendations ─────────────────────────────────────────────────
router.get('/home', requireAuth, (req, res) => {
  const db = getDB();
  const userId = req.user.id;

  const recentlyPlayed = db.prepare(`
    SELECT s.*, al.title as album_title, al.cover, ar.name as artist_name
    FROM play_history ph
    JOIN songs s ON s.id = ph.song_id
    LEFT JOIN albums al ON al.id = s.album_id
    LEFT JOIN artists ar ON ar.id = s.artist_id
    WHERE ph.user_id = ?
    GROUP BY s.id
    ORDER BY MAX(ph.played_at) DESC LIMIT 10
  `).all(userId);

  const mostPlayed = db.prepare(`
    SELECT s.*, al.title as album_title, al.cover, ar.name as artist_name
    FROM songs s
    LEFT JOIN albums al ON al.id = s.album_id
    LEFT JOIN artists ar ON ar.id = s.artist_id
    ORDER BY s.play_count DESC LIMIT 10
  `).all();

  const newSongs = db.prepare(`
    SELECT s.*, al.title as album_title, al.cover, ar.name as artist_name
    FROM songs s
    LEFT JOIN albums al ON al.id = s.album_id
    LEFT JOIN artists ar ON ar.id = s.artist_id
    ORDER BY s.created_at DESC LIMIT 10
  `).all();

  res.json({ recentlyPlayed, mostPlayed, newSongs });
});
// ── Genre Stats ────────────────────────────────────────────────────────────
router.get('/genres/stats', requireAuth, (req, res) => {
  const db = getDB();
  const userId = req.user.id;

  const topGenresRaw = db.prepare(`
    SELECT genre, COUNT(*) as count 
    FROM songs 
    WHERE genre IS NOT NULL AND genre != '' 
    GROUP BY genre 
    ORDER BY count DESC 
    LIMIT 3
  `).all();

  // Enrich each genre with the top artist name
  const topGenres = topGenresRaw.map(g => {
    const topArtistRow = db.prepare(`
      SELECT ar.name, COUNT(*) as cnt
      FROM songs s
      LEFT JOIN artists ar ON ar.id = s.artist_id
      WHERE LOWER(TRIM(s.genre)) = LOWER(?) AND ar.name IS NOT NULL AND ar.name != ''
      GROUP BY ar.name
      ORDER BY cnt DESC
      LIMIT 1
    `).get(g.genre);
    return { ...g, topArtist: topArtistRow ? topArtistRow.name : null };
  });

  const mostPlayed = db.prepare(`
    SELECT s.genre, COUNT(*) as count
    FROM play_history ph
    JOIN songs s ON s.id = ph.song_id
    WHERE ph.user_id = ? AND s.genre IS NOT NULL AND s.genre != ''
    GROUP BY s.genre
    ORDER BY count DESC
    LIMIT 1
  `).get(userId);

  res.json({ topGenres, mostPlayedGenre: mostPlayed ? mostPlayed.genre : null });
});

// ── Genre Details ───────────────────────────────────────────────────────────
router.get('/genres/detail/:genre', requireAuth, (req, res) => {
  const db = getDB();
  const rawGenre = req.params.genre;
  if (!rawGenre) return res.status(400).json({ error: 'Genre is required' });

  const norm = rawGenre.trim();
  const likeNorm = `%${norm}%`;

  const songs = db.prepare(`
    SELECT s.*, al.title as album_title, al.cover, ar.name as artist_name
    FROM songs s
    LEFT JOIN albums al ON al.id = s.album_id
    LEFT JOIN artists ar ON ar.id = s.artist_id
    WHERE LOWER(TRIM(s.genre)) = LOWER(?) OR s.genre LIKE ?
    ORDER BY s.play_count DESC, s.created_at DESC
  `).all(norm, likeNorm);

  const topSongs = songs.slice(0, 5);

  const featuredArtists = db.prepare(`
    SELECT DISTINCT ar.*
    FROM artists ar
    JOIN songs s ON s.artist_id = ar.id
    WHERE LOWER(TRIM(s.genre)) = LOWER(?) OR s.genre LIKE ?
    ORDER BY ar.name ASC
  `).all(norm, likeNorm);

  const albums = db.prepare(`
    SELECT DISTINCT al.*, ar.name as artist_name
    FROM albums al
    JOIN songs s ON s.album_id = al.id
    LEFT JOIN artists ar ON ar.id = al.artist_id
    WHERE LOWER(TRIM(s.genre)) = LOWER(?) OR s.genre LIKE ?
    ORDER BY al.title ASC
  `).all(norm, likeNorm);

  res.json({
    genre: rawGenre,
    topSongs,
    featuredArtists,
    albums,
    songs
  });
});


// ── Search ─────────────────────────────────────────────────────────────────
router.get('/search', requireAuth, async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ songs: [], albums: [], artists: [], playlists: [], podcasts: [] });
  const db = getDB();
  const like = `%${q}%`;
  const userId = req.user.id;

  const songs     = db.prepare(`SELECT s.*, al.title as album_title, al.cover, ar.name as artist_name FROM songs s LEFT JOIN albums al ON al.id=s.album_id LEFT JOIN artists ar ON ar.id=s.artist_id WHERE s.title LIKE ? OR ar.name LIKE ? OR al.title LIKE ? LIMIT 20`).all(like, like, like);
  const albums    = db.prepare(`SELECT al.*, ar.name as artist_name FROM albums al LEFT JOIN artists ar ON ar.id=al.artist_id WHERE al.title LIKE ? OR ar.name LIKE ? LIMIT 10`).all(like, like);
  const artists   = db.prepare(`SELECT * FROM artists WHERE name LIKE ? LIMIT 10`).all(like);
  const rawPlaylists = db.prepare(`SELECT * FROM playlists WHERE user_id=? AND name LIKE ? LIMIT 10`).all(userId, like);
  const playlists = rawPlaylists.map(pl => {
    const pSongs = db.prepare(`
      SELECT s.*, al.title as album_title, al.cover, ar.name as artist_name
      FROM playlist_songs ps
      JOIN songs s ON s.id=ps.song_id
      LEFT JOIN albums al ON al.id=s.album_id
      LEFT JOIN artists ar ON ar.id=s.artist_id
      WHERE ps.playlist_id=?
      ORDER BY ps.position ASC
    `).all(pl.id);
    const is_generated = (pl.is_generated === 1 || (pl.description && pl.description.includes('[dynamic:'))) ? 1 : 0;
    return { ...pl, is_generated, songs: pSongs };
  });

  let podcasts = [];
  const userState = db.prepare('SELECT extra_settings FROM user_state WHERE user_id = ?').get(userId);
  let podcastSearchEnabled = true;
  if (userState && userState.extra_settings) {
    try {
      const extra = JSON.parse(userState.extra_settings);
      if (extra.podcastSearchEnabled !== undefined) {
        podcastSearchEnabled = !!extra.podcastSearchEnabled;
      }
    } catch (e) {}
  }

  if (podcastSearchEnabled) {
    podcasts = await fetchPodcastSearchResults(q);
  }

  res.json({ songs, albums, artists, playlists, podcasts });
});

// ── Songs ──────────────────────────────────────────────────────────────────
router.get('/songs', requireAuth, (req, res) => {
  const db = getDB();
  const songs = db.prepare(`SELECT s.*, al.title as album_title, al.cover, ar.name as artist_name FROM songs s LEFT JOIN albums al ON al.id=s.album_id LEFT JOIN artists ar ON ar.id=s.artist_id ORDER BY s.created_at DESC`).all();
  res.json(songs);
});

router.get('/songs/:id', requireAuth, (req, res) => {
  const db = getDB();
  const song = db.prepare(`SELECT s.*, al.title as album_title, al.cover, ar.name as artist_name FROM songs s LEFT JOIN albums al ON al.id=s.album_id LEFT JOIN artists ar ON ar.id=s.artist_id WHERE s.id=?`).get(req.params.id);
  if (!song) return res.status(404).json({ error: 'Not found' });
  res.json(song);
});

router.post('/songs/:id/play', requireAuth, (req, res) => {
  const db = getDB();
  db.prepare('INSERT INTO play_history (user_id, song_id) VALUES (?, ?)').run(req.user.id, req.params.id);
  db.prepare('UPDATE songs SET play_count = play_count + 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

function getOrCreateArtist(db, name) {
  if (!name) return null;
  let row = db.prepare('SELECT id FROM artists WHERE name = ?').get(name);
  if (!row) {
    const id = uuidv4();
    db.prepare('INSERT INTO artists (id, name) VALUES (?, ?)').run(id, name);
    row = { id };
  }
  return row.id;
}

function getOrCreateAlbum(db, title, artistId, meta) {
  if (!title) return null;
  let row = db.prepare('SELECT id FROM albums WHERE title = ? AND artist_id = ?').get(title, artistId);
  if (!row) {
    const id = uuidv4();
    db.prepare('INSERT INTO albums (id, title, artist_id, year, genre) VALUES (?, ?, ?, ?, ?)').run(id, title, artistId, meta?.year || null, meta?.genre || null);
    row = { id };
  }
  return row.id;
}

const handleSongUpdate = (req, res) => {
  try {
    const db = getDB();
    const { title, artist, album, genre, year, track_number, is_audiobook } = req.body;
    const song = db.prepare('SELECT * FROM songs WHERE id=?').get(req.params.id);
    if (!song) return res.status(404).json({ error: 'Song not found' });

    let artistId = song.artist_id;
    if (artist !== undefined) artistId = artist ? getOrCreateArtist(db, artist) : null;
    let albumId = song.album_id;
    if (album !== undefined) albumId = album ? getOrCreateAlbum(db, album, artistId, { year, genre }) : null;

    db.prepare(`
      UPDATE songs 
      SET title=COALESCE(?,title), 
          artist_id=?, 
          album_id=?, 
          genre=COALESCE(?,genre), 
          year=COALESCE(?,year), 
          track_number=COALESCE(?,track_number), 
          is_audiobook=COALESCE(?,is_audiobook) 
      WHERE id=?
    `).run(
      title || null, 
      artistId, 
      albumId, 
      genre || null, 
      year || null, 
      track_number || null, 
      is_audiobook != null ? (is_audiobook ? 1 : 0) : null, 
      req.params.id
    );

    const updated = db.prepare(`
      SELECT s.*, al.title as album_title, al.cover, ar.name as artist_name 
      FROM songs s 
      LEFT JOIN albums al ON al.id=s.album_id 
      LEFT JOIN artists ar ON ar.id=s.artist_id 
      WHERE s.id=?
    `).get(req.params.id);

    res.json({ success: true, song: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update song: ' + err.message });
  }
};

router.put('/songs/:id', requireAuth, handleSongUpdate);
router.post('/songs/:id/edit', requireAuth, handleSongUpdate);

// ── Albums ─────────────────────────────────────────────────────────────────
router.get('/albums', requireAuth, (req, res) => {
  const db = getDB();
  const albums = db.prepare(`
    SELECT al.*, ar.name as artist_name, (SELECT COUNT(*) FROM songs s WHERE s.album_id = al.id) as song_count
    FROM albums al
    LEFT JOIN artists ar ON ar.id=al.artist_id
    ORDER BY al.created_at DESC
  `).all();
  res.json(albums);
});

router.get('/albums/:id', requireAuth, (req, res) => {
  const db = getDB();
  const album = db.prepare(`SELECT al.*, ar.name as artist_name FROM albums al LEFT JOIN artists ar ON ar.id=al.artist_id WHERE al.id=?`).get(req.params.id);
  if (!album) return res.status(404).json({ error: 'Not found' });
  const songs = db.prepare(`SELECT s.*, ar.name as artist_name FROM songs s LEFT JOIN artists ar ON ar.id=s.artist_id WHERE s.album_id=? ORDER BY s.track_number ASC`).all(req.params.id);
  res.json({ ...album, songs });
});

router.put('/albums/:id', requireAuth, (req, res) => {
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
    const updated = db.prepare('SELECT al.*, ar.name as artist_name FROM albums al LEFT JOIN artists ar ON ar.id=al.artist_id WHERE al.id=?').get(req.params.id);
    res.json({ success: true, album: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save album: ' + err.message });
  }
});

// ── Artists ────────────────────────────────────────────────────────────────
router.get('/artists', requireAuth, (req, res) => {
  const db = getDB();
  const artists = db.prepare(`SELECT ar.*, COUNT(DISTINCT s.id) as song_count, COUNT(DISTINCT al.id) as album_count FROM artists ar LEFT JOIN songs s ON s.artist_id=ar.id LEFT JOIN albums al ON al.artist_id=ar.id GROUP BY ar.id ORDER BY ar.name`).all();
  res.json(artists);
});

router.get('/artists/:id', requireAuth, (req, res) => {
  const db = getDB();
  const artist = db.prepare(`SELECT * FROM artists WHERE id=?`).get(req.params.id);
  if (!artist) return res.status(404).json({ error: 'Not found' });
  const albums = db.prepare(`SELECT * FROM albums WHERE artist_id=? ORDER BY year DESC`).all(req.params.id);
  const songs  = db.prepare(`SELECT s.*, al.title as album_title, al.cover FROM songs s LEFT JOIN albums al ON al.id=s.album_id WHERE s.artist_id=? ORDER BY s.created_at DESC`).all(req.params.id);
  res.json({ ...artist, albums, songs });
});

// ── Playlists ──────────────────────────────────────────────────────────────
router.get('/playlists', requireAuth, (req, res) => {
  const db = getDB();
  const rawPlaylists = db.prepare(`SELECT * FROM playlists WHERE user_id=? ORDER BY created_at DESC`).all(req.user.id);
  const playlists = rawPlaylists.map(pl => {
    const is_generated = (pl.is_generated === 1 || (pl.description && pl.description.includes('[dynamic:'))) ? 1 : 0;
    const songs = db.prepare(`
      SELECT s.*, al.title as album_title, al.cover, ar.name as artist_name
      FROM playlist_songs ps
      JOIN songs s ON s.id=ps.song_id
      LEFT JOIN albums al ON al.id=s.album_id
      LEFT JOIN artists ar ON ar.id=s.artist_id
      WHERE ps.playlist_id=?
      ORDER BY ps.position ASC
    `).all(pl.id);
    return { ...pl, is_generated, songs };
  });
  res.json(playlists);
});

router.post('/playlists', requireAuth, (req, res) => {
  const db = getDB();
  const { name, description, is_generated } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = uuidv4();
  const isGen = (is_generated === 1 || is_generated === true || (description && description.includes('[dynamic:'))) ? 1 : 0;
  db.prepare('INSERT INTO playlists (id, name, user_id, description, is_generated) VALUES (?, ?, ?, ?, ?)').run(id, name, req.user.id, description || '', isGen);
  res.json({ id, name, description, is_generated: isGen });
});

router.get('/playlists/:id', requireAuth, (req, res) => {
  const db = getDB();
  const playlist = db.prepare(`
    SELECT p.*, u.username as owner_username 
    FROM playlists p 
    LEFT JOIN users u ON u.id = p.user_id 
    WHERE p.id=?
  `).get(req.params.id);
  if (!playlist) return res.status(404).json({ error: 'Not found' });
  const is_generated = (playlist.is_generated === 1 || (playlist.description && playlist.description.includes('[dynamic:'))) ? 1 : 0;
  const songs = db.prepare(`SELECT s.*, al.title as album_title, al.cover, ar.name as artist_name FROM playlist_songs ps JOIN songs s ON s.id=ps.song_id LEFT JOIN albums al ON al.id=s.album_id LEFT JOIN artists ar ON ar.id=s.artist_id WHERE ps.playlist_id=? ORDER BY ps.position ASC`).all(req.params.id);
  res.json({ ...playlist, is_generated, songs });
});

router.post('/playlists/:id/songs', requireAuth, (req, res) => {
  const db = getDB();
  const targetPl = db.prepare('SELECT is_generated, description FROM playlists WHERE id=?').get(req.params.id);
  if (targetPl && (targetPl.is_generated === 1 || (targetPl.description && targetPl.description.includes('[dynamic:')))) {
    if (!req.body.isSystemSync) {
      return res.status(403).json({ error: 'Cumu-erstellte Playlisten können nicht bearbeitet werden' });
    }
  }
  const { songId } = req.body;
  const maxPos = db.prepare('SELECT MAX(position) as mp FROM playlist_songs WHERE playlist_id=?').get(req.params.id);
  const pos = (maxPos?.mp || 0) + 1;
  try {
    db.prepare('INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)').run(req.params.id, songId, pos);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/playlists/:id/sync-songs', requireAuth, (req, res) => {
  const db = getDB();
  const targetPl = db.prepare('SELECT is_generated, description FROM playlists WHERE id=?').get(req.params.id);
  if (targetPl && (targetPl.is_generated === 1 || (targetPl.description && targetPl.description.includes('[dynamic:')))) {
    if (!req.body.isSystemSync) {
      return res.status(403).json({ error: 'Cumu-erstellte Playlisten können nicht bearbeitet werden' });
    }
  }
  const { songIds } = req.body;
  if (!Array.isArray(songIds)) return res.status(400).json({ error: 'songIds must be an array' });
  db.prepare('DELETE FROM playlist_songs WHERE playlist_id=?').run(req.params.id);
  const stmt = db.prepare('INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)');
  const insertMany = db.transaction((ids) => {
    ids.forEach((sid, idx) => {
      stmt.run(req.params.id, sid, idx + 1);
    });
  });
  insertMany(songIds);
  res.json({ success: true, count: songIds.length });
});

router.delete('/playlists/:id/songs/:songId', requireAuth, (req, res) => {
  const db = getDB();
  const targetPl = db.prepare('SELECT is_generated, description FROM playlists WHERE id=?').get(req.params.id);
  if (targetPl && (targetPl.is_generated === 1 || (targetPl.description && targetPl.description.includes('[dynamic:')))) {
    return res.status(403).json({ error: 'Cumu-erstellte Playlisten können nicht bearbeitet werden' });
  }
  db.prepare('DELETE FROM playlist_songs WHERE playlist_id=? AND song_id=?').run(req.params.id, req.params.songId);
  res.json({ success: true });
});

router.delete('/playlists/:id', requireAuth, (req, res) => {
  const db = getDB();
  db.prepare('DELETE FROM playlist_songs WHERE playlist_id=?').run(req.params.id);
  db.prepare('DELETE FROM playlists WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// ── Library ────────────────────────────────────────────────────────────────
router.get('/library', requireAuth, (req, res) => {
  const db = getDB();
  const userId = req.user.id;
  const songs     = db.prepare(`SELECT s.*, al.title as album_title, al.cover, ar.name as artist_name FROM library l JOIN songs s ON s.id=l.song_id LEFT JOIN albums al ON al.id=s.album_id LEFT JOIN artists ar ON ar.id=s.artist_id WHERE l.user_id=? AND l.song_id IS NOT NULL`).all(userId);
  const albums    = db.prepare(`SELECT al.*, ar.name as artist_name FROM library l JOIN albums al ON al.id=l.album_id LEFT JOIN artists ar ON ar.id=al.artist_id WHERE l.user_id=? AND l.album_id IS NOT NULL`).all(userId);
  const rawPlaylists = db.prepare(`SELECT * FROM playlists WHERE user_id=?`).all(userId);
  const playlists = rawPlaylists.map(pl => {
    const is_generated = (pl.is_generated === 1 || (pl.description && pl.description.includes('[dynamic:'))) ? 1 : 0;
    const plSongs = db.prepare(`
      SELECT s.*, al.title as album_title, al.cover, ar.name as artist_name
      FROM playlist_songs ps
      JOIN songs s ON s.id=ps.song_id
      LEFT JOIN albums al ON al.id=s.album_id
      LEFT JOIN artists ar ON ar.id=s.artist_id
      WHERE ps.playlist_id=?
      ORDER BY ps.position ASC
    `).all(pl.id);
    return { ...pl, is_generated, songs: plSongs };
  });
  res.json({ songs, albums, playlists });
});

router.post('/library/song', requireAuth, (req, res) => {
  const db = getDB();
  const { songId } = req.body;
  try {
    db.prepare('INSERT OR IGNORE INTO library (user_id, song_id) VALUES (?, ?)').run(req.user.id, songId);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Upload Endpoint ─────────────────────────────────────────────────────────
const adminRoutes = require('./admin');
router.post('/upload', requireAuth, adminRoutes.handleUpload, adminRoutes.processUpload);

module.exports = router;
