/**
 * src/services/albums.js
 * Shared album bookkeeping used by uploads, library scans, song edits and the
 * metadata auto-lookup. Keep all album matching rules here so they stay in sync.
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const { isGenreValid } = require('../utils/genresList');

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
          WHERE a.title = ? AND a.artist_id IS ? AND a.id != ?
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
  if (!title) return null;

  // 0. Keep the song's current album when the title still matches. Its artist
  //    may be the album artist (e.g. "Various Artists" on compilations), which
  //    differs from the track artist the lookup returns.
  let row = null;
  if (existingAlbumId) {
    const current = db.prepare('SELECT * FROM albums WHERE id = ?').get(existingAlbumId);
    if (current && current.title && current.title.toLowerCase() === String(title).toLowerCase()) {
      row = current;
    }
  }

  // 1. Search for existing album by title and artist_id
  if (!row && artistId) {
    row = db.prepare('SELECT * FROM albums WHERE title = ? AND artist_id = ?').get(title, artistId);
  }

  // 2. Search by title where artist_id is NULL
  if (!row) {
    row = db.prepare('SELECT * FROM albums WHERE title = ? AND artist_id IS NULL').get(title);
    if (row && artistId) {
      db.prepare('UPDATE albums SET artist_id = ? WHERE id = ?').run(artistId, row.id);
      row.artist_id = artistId;
    }
  }

  // 3. Without an artist, fall back to any album with this title. Albums of
  //    other artists are never reused: different artists can share a title.
  if (!row && !artistId) {
    row = db.prepare('SELECT * FROM albums WHERE title = ?').get(title);
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
  if (current && current.title && current.title.toLowerCase() === String(title).toLowerCase()) {
    const ownedByNewArtist = (current.artist_id || null) === (artistId || null);
    const ownedByAlbumArtist = (current.artist_id || null) !== (song.artist_id || null);
    if (ownedByNewArtist || ownedByAlbumArtist) return current.id;
  }
  return getOrCreateAlbum(db, title, artistId, meta);
}

module.exports = { getOrCreateAlbum, cleanupOrphanedAlbums, resolveEditedSongAlbum };
