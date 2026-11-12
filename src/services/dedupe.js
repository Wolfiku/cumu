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

const path = require('path');
const { cleanupOrphanedAlbums, mainArtistKey, commonCredit, sharedParticipant, creditAlbumTo, pickAlbumToKeep } = require('./albums');

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
      mergeAlbumInto(db, db.prepare('SELECT * FROM albums WHERE id = ?').get(keep.id), dupe);
      merged++;
    }
  }
  return merged;
}

// Moves everything of album `dupe` into `keep` and deletes `dupe`. The kept
// album takes over what it lacks (cover, year, genre, MusicBrainz ids).
function mergeAlbumInto(db, keep, dupe) {
  db.prepare('UPDATE songs SET album_id = ? WHERE album_id = ?').run(keep.id, dupe.id);
  db.prepare('UPDATE library SET album_id = ? WHERE album_id = ?').run(keep.id, dupe.id);
  if (!keep.cover && dupe.cover) {
    db.prepare('UPDATE albums SET cover = ?, cover_status = ? WHERE id = ?').run(dupe.cover, dupe.cover_status || null, keep.id);
  } else if (!keep.cover && keep.cover_status !== 'removed' && dupe.cover_status !== 'removed') {
    // Neither had a cover: search again, now with the songs of both
    db.prepare('UPDATE albums SET cover_status = NULL WHERE id = ?').run(keep.id);
  }
  db.prepare(`
    UPDATE albums SET year = COALESCE(year, ?), genre = COALESCE(genre, ?),
      mb_release_id = COALESCE(mb_release_id, ?), mb_release_group_id = COALESCE(mb_release_group_id, ?)
    WHERE id = ?
  `).run(dupe.year, dupe.genre, dupe.mb_release_id || null, dupe.mb_release_group_id || null, keep.id);
  db.prepare('DELETE FROM albums WHERE id = ?').run(dupe.id);
}

/**
 * Albums that are really one album split into several, e.g. "Different World"
 * by "Alan Walker, K-391 & Corsak" and by "Alan Walker x Sofia Carson".
 * Two albums are merged only when the title is the same AND one of these
 * holds, each of which only the same album can have:
 *   - same main artist: the first artist named in both credits is the same
 *     ("Alan Walker ..." / "Alan Walker x ...", "Ich + Ich" / "Ich + Ich x ...")
 *   - same MusicBrainz release or release group (found by the song lookup)
 *   - same album folder: songs of both lie in one folder (not the music
 *     root) that holds only songs of this album title, so a mixed
 *     "Downloads" folder never counts
 * Different albums that just share a title ("Greatest Hits" by Queen and by
 * ABBA) have none of these. The merged album keeps the cover and is credited
 * to the part all credits share ("Alan Walker"); the songs keep their artist.
 */
function mergeSplitAlbums(db) {
  const albums = db.prepare(`
    SELECT a.*, ar.name AS artist_name FROM albums a LEFT JOIN artists ar ON ar.id = a.artist_id
    ORDER BY a.created_at ASC
  `).all();
  const byTitle = new Map();
  for (const album of albums) {
    const title = norm(album.title);
    if (!title) continue;
    if (!byTitle.has(title)) byTitle.set(title, []);
    byTitle.get(title).push(album);
  }
  const groups = [...byTitle.values()].filter(g => g.length > 1);
  if (!groups.length) return 0;

  // Folders and the album titles of the songs in them
  const folderTitles = new Map();
  const albumFolders = new Map();
  const rows = db.prepare('SELECT s.filename, s.album_id, al.title FROM songs s LEFT JOIN albums al ON al.id = s.album_id').all();
  for (const row of rows) {
    const dir = path.posix.dirname(String(row.filename || '').replace(/\\/g, '/'));
    if (!dir || dir === '.') continue; // the music root holds unrelated uploads side by side
    if (!folderTitles.has(dir)) folderTitles.set(dir, new Set());
    folderTitles.get(dir).add(norm(row.title));
    if (row.album_id) {
      if (!albumFolders.has(row.album_id)) albumFolders.set(row.album_id, new Set());
      albumFolders.get(row.album_id).add(dir);
    }
  }
  const sameAlbumFolder = (a, b) => {
    const dirsA = albumFolders.get(a.id), dirsB = albumFolders.get(b.id);
    if (!dirsA || !dirsB) return false;
    for (const dir of dirsA) if (dirsB.has(dir) && folderTitles.get(dir).size === 1) return true;
    return false;
  };
  const sameRelease = (a, b) => (a.mb_release_group_id && a.mb_release_group_id === b.mb_release_group_id)
    || (a.mb_release_id && a.mb_release_id === b.mb_release_id);
  const sameMainArtist = (a, b) => a.artist_name && b.artist_name && mainArtistKey(a.artist_name) === mainArtistKey(b.artist_name);
  const belongTogether = (a, b) => sameMainArtist(a, b) || sameRelease(a, b) || sameAlbumFolder(a, b);

  let merged = 0;
  for (const group of groups) {
    // Albums linked directly or through each other form one album
    const parent = new Map(group.map(a => [a.id, a.id]));
    const find = id => { while (parent.get(id) !== id) id = parent.get(id); return id; };
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (belongTogether(group[i], group[j])) parent.set(find(group[j].id), find(group[i].id));
      }
    }
    const sets = new Map();
    for (const album of group) {
      const root = find(album.id);
      if (!sets.has(root)) sets.set(root, []);
      sets.get(root).push(album);
    }

    for (const set of sets.values()) {
      if (set.length < 2) continue;
      const names = set.map(a => a.artist_name).filter(Boolean);
      const credit = names.length === set.length ? (commonCredit(names) || sharedParticipant(names)) : null;
      const keep = pickAlbumToKeep(db, set, credit);
      if (keep.artist_name) creditAlbumTo(db, keep, credit);
      for (const album of set) {
        if (album.id === keep.id) continue;
        mergeAlbumInto(db, db.prepare('SELECT * FROM albums WHERE id = ?').get(keep.id), db.prepare('SELECT * FROM albums WHERE id = ?').get(album.id));
        merged++;
      }
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
    const albums = mergeDuplicateAlbums(db) + mergeSplitAlbums(db);
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
