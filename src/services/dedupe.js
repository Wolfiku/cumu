/**
 * src/services/dedupe.js
 * Finds and merges duplicate albums and songs, and lets imports check for an
 * existing copy of a song before adding it again.
 *
 * This runs automatically on every start, so it only merges what is certainly
 * the same thing and never deletes files:
 *   - Albums: same artist and same title (ignoring case and surrounding spaces).
 *   - Songs:  the same file indexed twice, or a copy with identical file size,
 *             duration (±1s), title, artist and album whose track numbers
 *             don't contradict each other.
 * Merged songs leave an alias so old ids (playlists in clients, favorites)
 * keep working. Duplicate files stay on disk and are just not indexed again.
 */

'use strict';

const { cleanupOrphanedAlbums } = require('./albums');

const norm = (s) => (s || '').trim().toLowerCase();

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
    if (!norm(album.title)) continue;
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
  if (a.filename && a.filename === b.filename) return true;
  if (norm(a.title) !== norm(b.title)) return false;
  if ((a.artist_id || null) !== (b.artist_id || null)) return false;
  if ((a.album_id || null) !== (b.album_id || null)) return false;
  if (!a.file_size || a.file_size !== b.file_size) return false;
  if (Math.abs((a.duration || 0) - (b.duration || 0)) > 1) return false;
  if (a.track_number && b.track_number && a.track_number !== b.track_number) return false;
  return true;
}

/**
 * Returns an already indexed copy of the song described by `candidate`
 * ({ title, artist_id, album_id, duration, file_size, track_number }), or null.
 */
function findDuplicateSong(db, candidate) {
  if (!candidate.title) return null;
  const rows = db.prepare(`
    SELECT * FROM songs
    WHERE LOWER(TRIM(title)) = ? AND artist_id IS ? AND album_id IS ?
  `).all(norm(candidate.title), candidate.artist_id || null, candidate.album_id || null);
  return rows.find(row => isSameRecording(row, { ...candidate, filename: null })) || null;
}

function mergeSongInto(db, keep, dupe) {
  db.prepare('INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position, added_at) SELECT playlist_id, ?, position, added_at FROM playlist_songs WHERE song_id = ?').run(keep.id, dupe.id);
  db.prepare('DELETE FROM playlist_songs WHERE song_id = ?').run(dupe.id);
  db.prepare('UPDATE play_history SET song_id = ? WHERE song_id = ?').run(keep.id, dupe.id);
  db.prepare('UPDATE library SET song_id = ? WHERE song_id = ?').run(keep.id, dupe.id);
  db.prepare('UPDATE user_state SET last_song_id = ? WHERE last_song_id = ?').run(keep.id, dupe.id);
  db.prepare('UPDATE songs SET play_count = play_count + ?, cover = COALESCE(cover, ?) WHERE id = ?').run(dupe.play_count || 0, dupe.cover || null, keep.id);
  db.prepare('UPDATE song_aliases SET new_id = ? WHERE new_id = ?').run(keep.id, dupe.id);
  db.prepare('INSERT OR REPLACE INTO song_aliases (old_id, new_id) VALUES (?, ?)').run(dupe.id, keep.id);
  db.prepare('DELETE FROM songs WHERE id = ?').run(dupe.id);
}

function mergeDuplicateSongs(db, findSongFile) {
  const songs = db.prepare('SELECT * FROM songs ORDER BY created_at ASC').all();

  // Candidates: same file, or same title + artist + album
  const parent = new Map(songs.map(s => [s.id, s.id]));
  const find = (id) => { while (parent.get(id) !== id) id = parent.get(id); return id; };
  const union = (a, b) => parent.set(find(b), find(a));
  const byFile = new Map();
  const byMeta = new Map();
  for (const song of songs) {
    if (byFile.has(song.filename)) union(byFile.get(song.filename), song.id);
    else byFile.set(song.filename, song.id);
    const key = `${song.artist_id || ''}\u0000${song.album_id || ''}\u0000${norm(song.title)}`;
    if (byMeta.has(key)) union(byMeta.get(key), song.id);
    else byMeta.set(key, song.id);
  }
  const groups = new Map();
  for (const song of songs) {
    const root = find(song.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(song);
  }

  let merged = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // Prefer songs whose file exists, then user-edited, then most played, then oldest
    const ranked = group
      .map(song => ({ song, onDisk: findSongFile(song.filename) ? 1 : 0 }))
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
      // A second file with the same song stays on disk but is not indexed again
      if (song.filename !== keep.filename) {
        db.prepare('INSERT OR REPLACE INTO ignored_files (filename, duplicate_of) VALUES (?, ?)').run(song.filename, keep.id);
      }
    }
  }
  return merged;
}

/**
 * Merges all duplicate albums and songs in one transaction. Idempotent.
 * `findSongFile(filename)` returns the file's path if it exists on disk.
 */
function dedupeLibrary(db, findSongFile) {
  ensureTables(db);
  const result = db.transaction(() => {
    const albums = mergeDuplicateAlbums(db);
    const songs = mergeDuplicateSongs(db, findSongFile);
    cleanupOrphanedAlbums(db);
    return { albums, songs };
  })();

  // Each file may be indexed only once from now on
  try {
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_songs_filename ON songs(filename)');
  } catch (err) {
    console.error('[cumu] Could not create unique filename index:', err.message);
  }
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

// When a song is deleted, files that were skipped as its duplicates may be
// indexed again by the next scan.
function releaseIgnoredFiles(db, songId) {
  ensureTables(db);
  db.prepare('DELETE FROM ignored_files WHERE duplicate_of = ?').run(songId);
  db.prepare('DELETE FROM song_aliases WHERE new_id = ?').run(songId);
}

module.exports = { dedupeLibrary, findDuplicateSong, resolveSongAlias, getIgnoredFiles, ignoreFile, releaseIgnoredFiles };
