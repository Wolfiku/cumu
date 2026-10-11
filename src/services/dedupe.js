/**
 * src/services/dedupe.js
 * Finds and merges duplicate albums and songs, and lets imports check for an
 * existing copy of a song before adding it again.
 *
 * Albums are duplicates when they share artist and title (ignoring case and
 * surrounding spaces). Songs are duplicates when they share artist, album and
 * title and their durations differ by at most a second; songs without an artist
 * must also have the same file size.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { cleanupOrphanedAlbums } = require('./albums');

const norm = (s) => (s || '').trim().toLowerCase();

// Files the app stored for uploads are named <uuid>.<ext> in the music root.
const UPLOAD_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/;

function ensureTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS song_aliases (
      old_id TEXT PRIMARY KEY,
      new_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ignored_files (
      filename TEXT PRIMARY KEY,
      duplicate_of TEXT
    );
  `);
}

// ── Albums ───────────────────────────────────────────────────────────────────

function mergeDuplicateAlbums(db) {
  const albums = db.prepare(`
    SELECT a.*, (SELECT COUNT(*) FROM songs s WHERE s.album_id = a.id) AS song_count
    FROM albums a
    ORDER BY a.created_at ASC
  `).all();

  const groups = new Map();
  for (const album of albums) {
    const key = `${album.artist_id || ''}\u0000${norm(album.title)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(album);
  }

  let merged = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // Keep the album with a cover, then the one with most songs, then the oldest
    group.sort((a, b) => (!!b.cover - !!a.cover) || (b.song_count - a.song_count));
    const [keep, ...dupes] = group;

    for (const dupe of dupes) {
      db.prepare('UPDATE songs SET album_id = ? WHERE album_id = ?').run(keep.id, dupe.id);
      db.prepare('UPDATE library SET album_id = ? WHERE album_id = ?').run(keep.id, dupe.id);
      db.prepare(`
        UPDATE albums SET
          cover = COALESCE(cover, ?), year = COALESCE(year, ?), genre = COALESCE(genre, ?)
        WHERE id = ?
      `).run(dupe.cover, dupe.year, dupe.genre, keep.id);
      db.prepare('DELETE FROM albums WHERE id = ?').run(dupe.id);
      merged++;
    }
  }
  return merged;
}

// ── Songs ────────────────────────────────────────────────────────────────────

function isSameRecording(a, b) {
  if (Math.abs((a.duration || 0) - (b.duration || 0)) > 1) return false;
  if (!a.artist_id && (a.file_size || 0) !== (b.file_size || 0)) return false;
  return true;
}

/**
 * Returns an already indexed copy of the song described by `candidate`
 * ({ title, artist_id, album_id, duration, file_size }), or null.
 */
function findDuplicateSong(db, candidate) {
  if (!candidate.title) return null;
  const rows = db.prepare(`
    SELECT * FROM songs
    WHERE LOWER(TRIM(title)) = ? AND artist_id IS ? AND album_id IS ?
  `).all(norm(candidate.title), candidate.artist_id || null, candidate.album_id || null);
  return rows.find(row => isSameRecording(row, candidate)) || null;
}

function mergeSongInto(db, keep, dupe) {
  db.prepare('INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position, added_at) SELECT playlist_id, ?, position, added_at FROM playlist_songs WHERE song_id = ?').run(keep.id, dupe.id);
  db.prepare('DELETE FROM playlist_songs WHERE song_id = ?').run(dupe.id);
  db.prepare('UPDATE play_history SET song_id = ? WHERE song_id = ?').run(keep.id, dupe.id);
  db.prepare('UPDATE library SET song_id = ? WHERE song_id = ?').run(keep.id, dupe.id);
  db.prepare('UPDATE user_state SET last_song_id = ? WHERE last_song_id = ?').run(keep.id, dupe.id);
  db.prepare('UPDATE songs SET play_count = play_count + ?, cover = COALESCE(cover, ?) WHERE id = ?').run(dupe.play_count || 0, dupe.cover || null, keep.id);
  // Old ids (e.g. in favorites stored by clients) keep resolving to the kept song
  db.prepare('UPDATE song_aliases SET new_id = ? WHERE new_id = ?').run(keep.id, dupe.id);
  db.prepare('INSERT OR REPLACE INTO song_aliases (old_id, new_id) VALUES (?, ?)').run(dupe.id, keep.id);
  db.prepare('DELETE FROM songs WHERE id = ?').run(dupe.id);
}

function mergeDuplicateSongs(db, musicPath) {
  const songs = db.prepare('SELECT * FROM songs ORDER BY created_at ASC').all();
  const groups = new Map();
  for (const song of songs) {
    const key = `${song.artist_id || ''}\u0000${song.album_id || ''}\u0000${norm(song.title)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(song);
  }

  const exists = (song) => fs.existsSync(path.join(musicPath, song.filename));
  let merged = 0;
  let filesRemoved = 0;

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // Prefer songs whose file exists, then user-edited, then most played, then oldest
    const ranked = group
      .map(song => ({ song, onDisk: exists(song) }))
      .sort((a, b) => (b.onDisk - a.onDisk)
        || ((b.song.is_user_edited || 0) - (a.song.is_user_edited || 0))
        || ((b.song.play_count || 0) - (a.song.play_count || 0)))
      .map(r => r.song);

    const kept = [];
    for (const song of ranked) {
      const keep = kept.find(k => isSameRecording(k, song));
      if (!keep) { kept.push(song); continue; }

      mergeSongInto(db, keep, song);
      merged++;

      // The removed song's file, unless the kept song uses the very same file
      if (song.filename === keep.filename) continue;
      const stillUsed = db.prepare('SELECT 1 FROM songs WHERE filename = ?').get(song.filename);
      if (stillUsed) continue;

      const filePath = path.join(musicPath, song.filename);
      if (UPLOAD_NAME.test(song.filename) && fs.existsSync(filePath)) {
        // Extra copy created by a repeated upload: safe to delete
        try { fs.unlinkSync(filePath); filesRemoved++; continue; } catch (_) {}
      }
      // A file the user put in the music folder: leave it, but don't index it again
      db.prepare('INSERT OR REPLACE INTO ignored_files (filename, duplicate_of) VALUES (?, ?)').run(song.filename, keep.id);
    }
  }
  return { merged, filesRemoved };
}

/**
 * Merges all duplicate albums and songs. Safe to run on every start.
 */
function dedupeLibrary(db, musicPath) {
  ensureTables(db);
  const result = db.transaction(() => {
    const albums = mergeDuplicateAlbums(db);
    const songs = mergeDuplicateSongs(db, musicPath);
    // Songs may have been the last ones of an album
    cleanupOrphanedAlbums(db);
    return { albums, songs: songs.merged, filesRemoved: songs.filesRemoved };
  })();
  // Each file may be indexed only once from now on
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_songs_filename ON songs(filename)');
  return result;
}

function resolveSongAlias(db, id) {
  ensureTables(db);
  const row = db.prepare('SELECT new_id FROM song_aliases WHERE old_id = ?').get(id);
  return row ? row.new_id : null;
}

function getIgnoredFiles(db) {
  ensureTables(db);
  return db.prepare('SELECT filename FROM ignored_files').all().map(r => r.filename);
}

function ignoreFile(db, filename, duplicateOf) {
  ensureTables(db);
  db.prepare('INSERT OR REPLACE INTO ignored_files (filename, duplicate_of) VALUES (?, ?)').run(filename, duplicateOf);
}

module.exports = { dedupeLibrary, findDuplicateSong, resolveSongAlias, getIgnoredFiles, ignoreFile };
