/**
 * src/routes/api.js
 * Core music library API — all routes require OAuth2 Bearer auth.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB, getConfig, getOrCreateArtist } = require('../db');
const { cleanupOrphanedAlbums, resolveEditedSongAlbum } = require('../services/albums');
const { resolveSongAlias } = require('../services/dedupe');
const { requireAuth } = require('../middleware/auth');
const { fetchPodcastSearchResults } = require('./podcasts');
const { searchLibrary } = require('../services/search');

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
    FROM (
      SELECT song_id, MAX(played_at) AS last_played
      FROM play_history WHERE user_id = ?
      GROUP BY song_id ORDER BY last_played DESC LIMIT 10
    ) r
    JOIN songs s ON s.id = r.song_id
    LEFT JOIN albums al ON al.id = s.album_id
    LEFT JOIN artists ar ON ar.id = s.artist_id
    ORDER BY r.last_played DESC
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

  // Albums this user listened to most in the last 3 months. With too little
  // listening history the section shows the newest albums instead.
  const since = Math.floor(Date.now() / 1000) - 90 * 24 * 3600;
  let topAlbums = db.prepare(`
    SELECT al.*, ar.name as artist_name, COUNT(*) as plays
    FROM play_history ph
    JOIN songs s ON s.id = ph.song_id
    JOIN albums al ON al.id = s.album_id
    LEFT JOIN artists ar ON ar.id = al.artist_id
    WHERE ph.user_id = ? AND ph.played_at >= ?
    GROUP BY al.id
    HAVING plays >= 3
    ORDER BY plays DESC, MAX(ph.played_at) DESC
    LIMIT 10
  `).all(userId, since);
  let topAlbumsMode = 'mostPlayed';
  if (topAlbums.length < 3) {
    topAlbumsMode = 'new';
    topAlbums = db.prepare(`
      SELECT al.*, ar.name as artist_name
      FROM albums al
      LEFT JOIN artists ar ON ar.id = al.artist_id
      WHERE EXISTS (SELECT 1 FROM songs s WHERE s.album_id = al.id)
      ORDER BY al.created_at DESC
      LIMIT 10
    `).all();
  }

  // Everything the app's start page needs in one request (older app
  // versions ignore these fields and fetch the full lists themselves)
  const newAlbums = db.prepare(`
    SELECT al.*, ar.name as artist_name,
      (SELECT COUNT(*) FROM songs s WHERE s.album_id = al.id) as song_count
    FROM albums al
    LEFT JOIN artists ar ON ar.id = al.artist_id
    WHERE EXISTS (SELECT 1 FROM songs s WHERE s.album_id = al.id)
    ORDER BY al.created_at DESC
    LIMIT 13
  `).all();

  // Artists with a picture first, then the ones with the most songs
  const artists = db.prepare(`
    SELECT ar.*, c.song_count,
      (SELECT COUNT(*) FROM albums al WHERE al.artist_id = ar.id) as album_count
    FROM artists ar
    JOIN (SELECT artist_id, COUNT(*) AS song_count FROM songs WHERE artist_id IS NOT NULL GROUP BY artist_id) c
      ON c.artist_id = ar.id
    ORDER BY (ar.image IS NULL OR ar.image = '') ASC, c.song_count DESC
    LIMIT 12
  `).all();

  const cumuPlaylists = playlistSummaries(db, userId).filter(p => p.is_generated === 1 && p.song_count > 0);

  res.json({
    recentlyPlayed, mostPlayed, newSongs, topAlbums, topAlbumsMode,
    newAlbums, artists, cumuPlaylists, genres: genreStats(db, userId),
  });
});

// ── Shared helpers ─────────────────────────────────────────────────────────

function isGeneratedPlaylist(pl) {
  return (pl.is_generated === 1 || (pl.description && pl.description.includes('[dynamic:'))) ? 1 : 0;
}

/**
 * The user's playlists without the full song rows: count, cover and the song
 * ids (enough for lists and download badges). Two queries in total.
 */
function playlistSummaries(db, userId) {
  const rows = db.prepare('SELECT * FROM playlists WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  if (!rows.length) return [];
  const entries = db.prepare(`
    SELECT ps.playlist_id, ps.song_id, COALESCE(s.cover, al.cover) AS cover
    FROM playlists p
    JOIN playlist_songs ps ON ps.playlist_id = p.id
    JOIN songs s ON s.id = ps.song_id
    LEFT JOIN albums al ON al.id = s.album_id
    WHERE p.user_id = ?
    ORDER BY ps.playlist_id, ps.position ASC
  `).all(userId);
  const byList = new Map();
  for (const e of entries) {
    let l = byList.get(e.playlist_id);
    if (!l) byList.set(e.playlist_id, l = { ids: [], cover: null });
    l.ids.push(e.song_id);
    if (!l.cover && e.cover) l.cover = e.cover;
  }
  return rows.map(pl => {
    const l = byList.get(pl.id) || { ids: [], cover: null };
    return {
      ...pl,
      is_generated: isGeneratedPlaylist(pl),
      song_count: l.ids.length,
      song_ids: l.ids,
      cover: pl.cover || l.cover,
    };
  });
}

function readExtraSettings(db, userId) {
  const row = db.prepare('SELECT extra_settings FROM user_state WHERE user_id = ?').get(userId);
  try { return JSON.parse(row?.extra_settings || '{}') || {}; } catch { return {}; }
}

/** Favourite song ids, shared with the web app through the synced settings. */
function readFavorites(db, userId) {
  const fav = readExtraSettings(db, userId).favorites;
  return Array.isArray(fav) ? fav.filter(id => typeof id === 'string') : [];
}

function writeFavorites(db, userId, ids) {
  const exists = db.prepare('SELECT 1 FROM user_state WHERE user_id = ?').get(userId);
  if (!exists) {
    db.prepare(`INSERT INTO user_state (user_id, volume, last_song_id, last_position, theme, extra_settings, version, updated_at)
      VALUES (?, 1.0, NULL, 0, 'standard', '{}', 0, unixepoch())`).run(userId);
  }
  const extra = { ...readExtraSettings(db, userId), favorites: ids };
  db.prepare('UPDATE user_state SET extra_settings = ?, version = version + 1, updated_at = unixepoch() WHERE user_id = ?')
    .run(JSON.stringify(extra), userId);
  const st = db.prepare('SELECT * FROM user_state WHERE user_id = ?').get(userId);
  // Tell the open web tabs, so their favourites update right away
  try {
    require('../websocket').pushStateUpdate(userId, {
      volume: st.volume, lastSongId: st.last_song_id, lastPosition: st.last_position,
      theme: 'standard', extraSettings: extra, version: st.version,
    });
  } catch (_) {}
}

function genreStats(db, userId) {
  const topGenresRaw = db.prepare(`
    SELECT genre, COUNT(*) as count 
    FROM songs 
    WHERE genre IS NOT NULL AND genre != '' 
    GROUP BY genre 
    ORDER BY count DESC 
    LIMIT 3
  `).all();

  // Enrich each genre with the top artist name
  const topArtistStmt = db.prepare(`
    SELECT ar.name, COUNT(*) as cnt
    FROM songs s
    LEFT JOIN artists ar ON ar.id = s.artist_id
    WHERE LOWER(TRIM(s.genre)) = LOWER(?) AND ar.name IS NOT NULL AND ar.name != ''
    GROUP BY ar.name
    ORDER BY cnt DESC
    LIMIT 1
  `);
  const topGenres = topGenresRaw.map(g => {
    const topArtistRow = topArtistStmt.get(g.genre);
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

  return { topGenres, mostPlayedGenre: mostPlayed ? mostPlayed.genre : null };
}
// ── Genre Stats ────────────────────────────────────────────────────────────
router.get('/genres/stats', requireAuth, (req, res) => {
  res.json(genreStats(getDB(), req.user.id));
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
  const userId = req.user.id;

  const { topResult, songs, albums, artists, playlists: rankedPlaylists } = searchLibrary(db, q, userId);
  const playlists = rankedPlaylists.map(pl => {
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
  if (topResult && topResult.type === 'playlist') {
    topResult.item = playlists.find(p => p.id === topResult.item.id) || topResult.item;
  }

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

  res.json({ topResult, songs, albums, artists, playlists, podcasts });
});

// ── Songs ──────────────────────────────────────────────────────────────────
router.get('/songs', requireAuth, (req, res) => {
  const db = getDB();
  const songs = db.prepare(`SELECT s.*, al.title as album_title, al.cover, ar.name as artist_name FROM songs s LEFT JOIN albums al ON al.id=s.album_id LEFT JOIN artists ar ON ar.id=s.artist_id ORDER BY s.created_at DESC`).all();
  res.json(songs);
});

router.get('/songs/:id', requireAuth, (req, res) => {
  const db = getDB();
  const query = db.prepare(`SELECT s.*, al.title as album_title, al.cover, ar.name as artist_name FROM songs s LEFT JOIN albums al ON al.id=s.album_id LEFT JOIN artists ar ON ar.id=s.artist_id WHERE s.id=?`);
  let song = query.get(req.params.id);
  // Songs merged as duplicates answer under the id of the song they were merged into
  if (!song) {
    const aliasId = resolveSongAlias(db, req.params.id);
    if (aliasId) song = query.get(aliasId);
  }
  if (!song) return res.status(404).json({ error: 'Not found' });
  res.json(song);
});

router.post('/songs/:id/play', requireAuth, (req, res) => {
  const db = getDB();
  db.prepare('INSERT INTO play_history (user_id, song_id) VALUES (?, ?)').run(req.user.id, req.params.id);
  db.prepare('UPDATE songs SET play_count = play_count + 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});


const handleSongUpdate = (req, res) => {
  try {
    const db = getDB();
    const { title, artist, album, genre, year, track_number, is_audiobook } = req.body;
    const song = db.prepare('SELECT * FROM songs WHERE id=?').get(req.params.id);
    if (!song) return res.status(404).json({ error: 'Song not found' });

    let artistId = song.artist_id;
    if (artist !== undefined) artistId = artist ? getOrCreateArtist(db, artist) : null;
    let albumId = song.album_id;
    if (album !== undefined) albumId = album ? resolveEditedSongAlbum(db, song, album, artistId, { year, genre }) : null;

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
    cleanupOrphanedAlbums(db);

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
  // Each song carries the album's cover (and title) like in every other list,
  // so the player shows the cover when a song is started from the album page
  const songs = db.prepare(`
    SELECT s.*, al.title as album_title, COALESCE(al.cover, s.cover) as cover, ar.name as artist_name
    FROM songs s
    LEFT JOIN albums al ON al.id = s.album_id
    LEFT JOIN artists ar ON ar.id = s.artist_id
    WHERE s.album_id = ? ORDER BY s.track_number ASC
  `).all(req.params.id);
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
  const artists = db.prepare(`SELECT ar.*, (SELECT COUNT(*) FROM songs s WHERE s.artist_id=ar.id) as song_count, (SELECT COUNT(*) FROM albums al WHERE al.artist_id=ar.id) as album_count FROM artists ar ORDER BY ar.name`).all();
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

// ── Library overview (app) ─────────────────────────────────────────────────
// One light request for the app's library tab: every playlist (as summary),
// only the albums and artists heard in the last 3 months, the favourites
// and the items pinned in the web app.
router.get('/library/overview', requireAuth, (req, res) => {
  const db = getDB();
  const userId = req.user.id;
  const since = Math.floor(Date.now() / 1000) - 90 * 24 * 3600;

  const albums = db.prepare(`
    SELECT al.*, ar.name as artist_name, r.last_played, r.plays,
      (SELECT COUNT(*) FROM songs x WHERE x.album_id = al.id) as song_count
    FROM (
      SELECT s.album_id, MAX(ph.played_at) AS last_played, COUNT(*) AS plays
      FROM play_history ph
      JOIN songs s ON s.id = ph.song_id
      WHERE ph.user_id = ? AND ph.played_at >= ? AND s.album_id IS NOT NULL
      GROUP BY s.album_id
    ) r
    JOIN albums al ON al.id = r.album_id
    LEFT JOIN artists ar ON ar.id = al.artist_id
    ORDER BY r.last_played DESC
  `).all(userId, since);

  // Same rule as the albums: only artists heard in the last 3 months
  const artists = db.prepare(`
    SELECT ar.*, r.last_played, r.plays,
      (SELECT COUNT(*) FROM songs x WHERE x.artist_id = ar.id) as song_count,
      (SELECT COUNT(*) FROM albums al WHERE al.artist_id = ar.id) as album_count
    FROM (
      SELECT s.artist_id, MAX(ph.played_at) AS last_played, COUNT(*) AS plays
      FROM play_history ph
      JOIN songs s ON s.id = ph.song_id
      WHERE ph.user_id = ? AND ph.played_at >= ? AND s.artist_id IS NOT NULL
      GROUP BY s.artist_id
    ) r
    JOIN artists ar ON ar.id = r.artist_id
    ORDER BY r.last_played DESC
  `).all(userId, since);

  const extra = readExtraSettings(db, userId);
  const pinned = Array.isArray(extra.pinnedItems) ? extra.pinnedItems.filter(k => typeof k === 'string') : [];
  res.json({
    playlists: playlistSummaries(db, userId),
    albums,
    artists,
    favorites: readFavorites(db, userId),
    showFavorites: extra.showFavorites !== false,
    pinned,
  });
});

// ── Favourites ─────────────────────────────────────────────────────────────
// Stored in the synced user settings (extra_settings.favorites), the same
// place the web app keeps them, so both show the same list.
function favoriteSongs(db, ids) {
  const stmt = db.prepare(`SELECT s.*, al.title as album_title, al.cover, ar.name as artist_name FROM songs s LEFT JOIN albums al ON al.id=s.album_id LEFT JOIN artists ar ON ar.id=s.artist_id WHERE s.id=?`);
  const seen = new Set();
  const songs = [];
  for (const id of ids) {
    let song = stmt.get(id);
    if (!song) {
      const alias = resolveSongAlias(db, id);
      if (alias) song = stmt.get(alias);
    }
    if (song && !seen.has(song.id)) { seen.add(song.id); songs.push(song); }
  }
  return songs;
}

router.get('/favorites', requireAuth, (req, res) => {
  const db = getDB();
  let ids = readFavorites(db, req.user.id);
  const songs = favoriteSongs(db, ids);
  // Merged duplicates: store the id of the kept song. Ids that are no song
  // (e.g. podcast episodes favourited in the web app) stay untouched.
  const exists = db.prepare('SELECT 1 FROM songs WHERE id = ?');
  const current = [...new Set(ids.map(id => (exists.get(id) ? id : resolveSongAlias(db, id) || id)))];
  if (current.length !== ids.length || current.some((id, i) => id !== ids[i])) {
    writeFavorites(db, req.user.id, current);
    ids = current;
  }
  res.json({ ids, songs });
});

router.put('/favorites/:songId', requireAuth, (req, res) => {
  const db = getDB();
  const ids = readFavorites(db, req.user.id).filter(id => id !== req.params.songId);
  ids.push(req.params.songId);
  writeFavorites(db, req.user.id, ids);
  res.json({ success: true, ids });
});

router.delete('/favorites/:songId', requireAuth, (req, res) => {
  const db = getDB();
  const ids = readFavorites(db, req.user.id).filter(id => id !== req.params.songId);
  writeFavorites(db, req.user.id, ids);
  res.json({ success: true, ids });
});

// ── Upload Endpoint ─────────────────────────────────────────────────────────
const adminRoutes = require('./admin');
router.post('/upload', requireAuth, adminRoutes.handleUpload, adminRoutes.processUpload);

module.exports = router;
