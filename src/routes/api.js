/**
 * src/routes/api.js
 * Core music library API — all routes require OAuth2 Bearer auth.
 */

'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB, getConfig } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

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

// ── Search ─────────────────────────────────────────────────────────────────
router.get('/search', requireAuth, (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ songs: [], albums: [], artists: [], playlists: [] });
  const db = getDB();
  const like = `%${q}%`;
  const userId = req.user.id;

  const songs     = db.prepare(`SELECT s.*, al.title as album_title, al.cover, ar.name as artist_name FROM songs s LEFT JOIN albums al ON al.id=s.album_id LEFT JOIN artists ar ON ar.id=s.artist_id WHERE s.title LIKE ? OR ar.name LIKE ? OR al.title LIKE ? LIMIT 20`).all(like, like, like);
  const albums    = db.prepare(`SELECT al.*, ar.name as artist_name FROM albums al LEFT JOIN artists ar ON ar.id=al.artist_id WHERE al.title LIKE ? OR ar.name LIKE ? LIMIT 10`).all(like, like);
  const artists   = db.prepare(`SELECT * FROM artists WHERE name LIKE ? LIMIT 10`).all(like);
  const playlists = db.prepare(`SELECT * FROM playlists WHERE user_id=? AND name LIKE ? LIMIT 10`).all(userId, like);

  res.json({ songs, albums, artists, playlists });
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

// ── Albums ─────────────────────────────────────────────────────────────────
router.get('/albums', requireAuth, (req, res) => {
  const db = getDB();
  const albums = db.prepare(`SELECT al.*, ar.name as artist_name FROM albums al LEFT JOIN artists ar ON ar.id=al.artist_id ORDER BY al.created_at DESC`).all();
  res.json(albums);
});

router.get('/albums/:id', requireAuth, (req, res) => {
  const db = getDB();
  const album = db.prepare(`SELECT al.*, ar.name as artist_name FROM albums al LEFT JOIN artists ar ON ar.id=al.artist_id WHERE al.id=?`).get(req.params.id);
  if (!album) return res.status(404).json({ error: 'Not found' });
  const songs = db.prepare(`SELECT s.*, ar.name as artist_name FROM songs s LEFT JOIN artists ar ON ar.id=s.artist_id WHERE s.album_id=? ORDER BY s.track_number ASC`).all(req.params.id);
  res.json({ ...album, songs });
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
  const playlists = db.prepare(`SELECT * FROM playlists WHERE user_id=? ORDER BY created_at DESC`).all(req.user.id);
  res.json(playlists);
});

router.post('/playlists', requireAuth, (req, res) => {
  const db = getDB();
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = uuidv4();
  db.prepare('INSERT INTO playlists (id, name, user_id, description) VALUES (?, ?, ?, ?)').run(id, name, req.user.id, description || '');
  res.json({ id, name, description });
});

router.get('/playlists/:id', requireAuth, (req, res) => {
  const db = getDB();
  const playlist = db.prepare(`SELECT * FROM playlists WHERE id=?`).get(req.params.id);
  if (!playlist) return res.status(404).json({ error: 'Not found' });
  const songs = db.prepare(`SELECT s.*, al.title as album_title, al.cover, ar.name as artist_name FROM playlist_songs ps JOIN songs s ON s.id=ps.song_id LEFT JOIN albums al ON al.id=s.album_id LEFT JOIN artists ar ON ar.id=s.artist_id WHERE ps.playlist_id=? ORDER BY ps.position ASC`).all(req.params.id);
  res.json({ ...playlist, songs });
});

router.post('/playlists/:id/songs', requireAuth, (req, res) => {
  const db = getDB();
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

router.delete('/playlists/:id/songs/:songId', requireAuth, (req, res) => {
  const db = getDB();
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
  const playlists = db.prepare(`SELECT * FROM playlists WHERE user_id=?`).all(userId);
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

module.exports = router;
