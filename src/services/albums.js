/**
 * src/services/albums.js
 * Shared album bookkeeping used by uploads, library scans, song edits and the
 * metadata auto-lookup. Keep all album matching rules here so they stay in sync.
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const { isGenreValid } = require('../utils/genresList');

// Album titles match regardless of case and surrounding spaces
function sameTitle(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

// ── Collaborations ───────────────────────────────────────────────────────────
// Without an album artist tag a song's own artist names its album, so a track
// by "Alan Walker x Ava Max" would start an album of its own next to the
// "Alan Walker" one. These helpers find the main artist of such a credit.
// A credit is only cut where an album with the same title by the shorter name
// exists, so band names like "Ich + Ich" or "Simon & Garfunkel" stay intact.

const COLLAB_SEPARATOR = /\s*[,;&+×]\s*|\s+(?:feat\.?|ft\.?|featuring|x|vs\.?|with|mit)\s+/giu;

function normArtist(name) {
  return String(name || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** "Ich + Ich x Annette Humpe" -> ["ich + ich", "ich"] (longest first) */
function collabBaseNames(name) {
  const full = String(name || '').normalize('NFKC');
  const bases = [];
  for (const m of full.matchAll(COLLAB_SEPARATOR)) {
    const base = normArtist(full.slice(0, m.index));
    if (base) bases.push(base);
  }
  return [...new Set(bases)].reverse();
}

function albumsWithTitle(db, title) {
  return db.prepare(`
    SELECT a.*, ar.name AS artist_name FROM albums a LEFT JOIN artists ar ON ar.id = a.artist_id
    WHERE LOWER(TRIM(a.title)) = LOWER(TRIM(?))
  `).all(title);
}

/**
 * Album `title` that belongs to the same main artist as `artistId`: either
 * by the main artist of a collaboration credit, or (the other way round) an
 * album that was started by a collaboration track of this artist. The latter
 * is handed over to this artist.
 */
function findCollaborationAlbum(db, title, artistId) {
  const artist = artistId ? db.prepare('SELECT name FROM artists WHERE id = ?').get(artistId) : null;
  if (!artist) return null;
  const own = normArtist(artist.name);
  const candidates = albumsWithTitle(db, title).filter(a => a.artist_id && a.artist_id !== artistId);
  if (!candidates.length) return null;

  // 1. this credit is a collaboration of an artist who has the album
  for (const base of collabBaseNames(artist.name)) {
    const hit = candidates.find(a => normArtist(a.artist_name) === base);
    if (hit) return hit.id;
  }
  // 2. the album was started by a collaboration of this artist
  const started = candidates.find(a => collabBaseNames(a.artist_name).includes(own));
  if (started) {
    db.prepare('UPDATE albums SET artist_id = ? WHERE id = ?').run(artistId, started.id);
    return started.id;
  }
  return null;
}

/**
 * Deletes albums without songs. If another album of the same artist with the
 * same title is still in use, it inherits the deleted album's cover.
 */
function cleanupOrphanedAlbums(db) {
  try {
    const orphaned = db.prepare(`
      SELECT a.* FROM albums a
      LEFT JOIN songs s ON s.album_id = a.id
      WHERE s.id IS NULL
    `).all();

    for (const emptyAlbum of orphaned) {
      if (emptyAlbum.title) {
        const activeAlbum = db.prepare(`
          SELECT a.* FROM albums a
          JOIN songs s ON s.album_id = a.id
          WHERE LOWER(TRIM(a.title)) = LOWER(TRIM(?)) AND a.artist_id IS ? AND a.id != ?
          LIMIT 1
        `).get(emptyAlbum.title, emptyAlbum.artist_id, emptyAlbum.id);

        if (activeAlbum && !activeAlbum.cover && emptyAlbum.cover) {
          db.prepare('UPDATE albums SET cover = ? WHERE id = ?').run(emptyAlbum.cover, activeAlbum.id);
        }
      }
      db.prepare('DELETE FROM albums WHERE id = ?').run(emptyAlbum.id);
    }
  } catch (err) {
    console.error('[cumu] cleanupOrphanedAlbums error:', err.message);
  }
}

/**
 * Returns the id of the album `title` by `artistId`, creating it if needed.
 * `artistId` is the album artist (albumartist tag), so compilations stay one
 * album while different artists' albums with the same title stay separate.
 * `existingAlbumId` is the song's current album when re-tagging an existing song.
 */
function getOrCreateAlbum(db, title, artistId, meta = {}, existingAlbumId = null) {
  title = String(title || '').trim();
  if (!title) return null;

  // 0. Keep the song's current album when the title still matches. Its artist
  //    may be the album artist (e.g. "Various Artists" on compilations), which
  //    differs from the track artist the lookup returns.
  let row = null;
  if (existingAlbumId) {
    const current = db.prepare('SELECT * FROM albums WHERE id = ?').get(existingAlbumId);
    if (current && sameTitle(current.title, title)) {
      row = current;
    }
  }

  // 1. Search for existing album by title and artist_id
  if (!row && artistId) {
    row = db.prepare('SELECT * FROM albums WHERE LOWER(TRIM(title)) = LOWER(?) AND artist_id = ?').get(title, artistId);
  }

  // 1b. Same album under the main artist of a collaboration ("A x B" -> "A")
  if (!row && artistId) {
    const collabId = findCollaborationAlbum(db, title, artistId);
    if (collabId) row = db.prepare('SELECT * FROM albums WHERE id = ?').get(collabId);
  }

  // 2. Search by title where artist_id is NULL
  if (!row) {
    row = db.prepare('SELECT * FROM albums WHERE LOWER(TRIM(title)) = LOWER(?) AND artist_id IS NULL').get(title);
    if (row && artistId) {
      db.prepare('UPDATE albums SET artist_id = ? WHERE id = ?').run(artistId, row.id);
      row.artist_id = artistId;
    }
  }

  // 3. Without an artist, fall back to any album with this title. Albums of
  //    other artists are never reused: different artists can share a title.
  if (!row && !artistId) {
    row = db.prepare('SELECT * FROM albums WHERE LOWER(TRIM(title)) = LOWER(?)').get(title);
  }

  if (row) {
    if (meta.year && !row.year) db.prepare('UPDATE albums SET year = ? WHERE id = ?').run(meta.year, row.id);
    if (meta.genre && (!row.genre || !isGenreValid(row.genre))) {
      db.prepare('UPDATE albums SET genre = ? WHERE id = ?').run(meta.genre, row.id);
    }
    if (meta.cover && !row.cover) db.prepare('UPDATE albums SET cover = ? WHERE id = ?').run(meta.cover, row.id);
    return row.id;
  }

  // 4. Update existingAlbumId in place if it has 1 or 0 songs
  if (existingAlbumId) {
    const existingAlbum = db.prepare('SELECT * FROM albums WHERE id = ?').get(existingAlbumId);
    if (existingAlbum) {
      const countRow = db.prepare('SELECT COUNT(*) as c FROM songs WHERE album_id = ?').get(existingAlbumId);
      if (countRow.c <= 1) {
        db.prepare('UPDATE albums SET title = ?, artist_id = COALESCE(?, artist_id), year = COALESCE(?, year), genre = COALESCE(?, genre), cover = COALESCE(?, cover) WHERE id = ?')
          .run(title, artistId, meta.year || null, meta.genre || null, meta.cover || null, existingAlbumId);
        return existingAlbumId;
      }
    }
  }

  // 5. Create new album
  const id = uuidv4();
  db.prepare('INSERT INTO albums (id, title, artist_id, year, genre, cover) VALUES (?, ?, ?, ?, ?, ?)').run(
    id, title, artistId, meta.year || null, meta.genre || null, meta.cover || null
  );
  return id;
}

/**
 * Album for a song whose album/artist fields were edited by a user.
 * The song stays in its current album when the title is unchanged and that
 * album either belongs to the new artist or to a separate album artist
 * (e.g. "Various Artists"), so editing a compilation track doesn't split the
 * compilation. Otherwise the album of the new artist is used.
 */
function resolveEditedSongAlbum(db, song, title, artistId, meta = {}) {
  if (!title) return null;
  const current = song.album_id ? db.prepare('SELECT * FROM albums WHERE id = ?').get(song.album_id) : null;
  if (current && sameTitle(current.title, title)) {
    const ownedByNewArtist = (current.artist_id || null) === (artistId || null);
    const ownedByAlbumArtist = (current.artist_id || null) !== (song.artist_id || null);
    if (ownedByNewArtist || ownedByAlbumArtist) return current.id;
  }
  return getOrCreateAlbum(db, title, artistId, meta);
}

module.exports = { getOrCreateAlbum, cleanupOrphanedAlbums, resolveEditedSongAlbum, collabBaseNames, normArtist };
