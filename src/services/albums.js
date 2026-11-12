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
// Without an album artist tag a song's own artist names its album, so tracks
// by "Alan Walker x Ava Max" and "Alan Walker, K-391 & Corsak" would each
// start an album of their own. Albums with the same title whose credits name
// the same main artist (the first one named) are one album. It is credited to
// the part all credits share: "Alan Walker" for the two above, "Ich + Ich" for
// "Ich + Ich" and "Ich + Ich x Annette Humpe". The songs keep their own artist.

const COLLAB_SEPARATOR = /\s*[,;&+×]\s*|\s+[\(\[]?(?:feat\.?|ft\.?|featuring|x|vs\.?|with|mit)\s+/giu;

function normArtist(name) {
  return String(name || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Every leading part of a credit, longest first:
 * "Alan Walker, K-391 & Corsak" -> the full credit, "Alan Walker, K-391", "Alan Walker"
 * @returns {{key: string, display: string}[]}
 */
function creditPrefixes(name) {
  const full = String(name || '').normalize('NFKC').trim();
  if (!full) return [];
  const parts = [{ key: normArtist(full), display: full }];
  for (const m of full.matchAll(COLLAB_SEPARATOR)) {
    const display = full.slice(0, m.index).trim();
    if (display) parts.push({ key: normArtist(display), display });
  }
  const seen = new Set();
  return parts.filter(p => !seen.has(p.key) && seen.add(p.key)).sort((a, b) => b.key.length - a.key.length);
}

/** The first artist a credit names ("alan walker" for "Alan Walker x Ava Max") */
function mainArtistKey(name) {
  const parts = creditPrefixes(name);
  return parts.length ? parts[parts.length - 1].key : '';
}

/** Every artist a credit names: "Alan Walker, K-391 & Corsak" -> 3 names */
function creditParticipants(name) {
  return String(name || '').normalize('NFKC').split(COLLAB_SEPARATOR)
    .map(part => ({ key: normArtist(part), display: part.trim() }))
    .filter(part => part.key);
}

/** An artist all credits name somewhere ("K-391 & Alan Walker", "Alan Walker x Y"), or null */
function sharedParticipant(names) {
  const lists = names.map(creditParticipants);
  if (!lists.length || lists.some(l => !l.length)) return null;
  return lists[0].find(p => lists.every(l => l.some(q => q.key === p.key))) || null;
}

/** The longest leading part all credits share, or null */
function commonCredit(names) {
  const lists = names.map(creditPrefixes);
  if (!lists.length || lists.some(l => !l.length)) return null;
  return lists[0].find(p => lists.every(l => l.some(q => q.key === p.key))) || null;
}

function artistIdForName(db, name) {
  const row = db.prepare('SELECT id FROM artists WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))').get(name);
  if (row) return row.id;
  const id = uuidv4();
  db.prepare('INSERT INTO artists (id, name) VALUES (?, ?)').run(id, name.trim());
  return id;
}

/** Credits an album to `credit` ({key, display}) unless it already is. */
function creditAlbumTo(db, album, credit) {
  if (!credit || normArtist(album.artist_name) === credit.key) return;
  const artistId = artistIdForName(db, credit.display);
  db.prepare('UPDATE albums SET artist_id = ? WHERE id = ?').run(artistId, album.id);
  album.artist_id = artistId;
  album.artist_name = credit.display;
}

function albumsWithTitle(db, title) {
  return db.prepare(`
    SELECT a.*, ar.name AS artist_name FROM albums a LEFT JOIN artists ar ON ar.id = a.artist_id
    WHERE LOWER(TRIM(a.title)) = LOWER(TRIM(?))
  `).all(title);
}

// Among albums that are one: the one already credited to the shared part,
// then one with a cover, then the one with most songs, then the oldest
function pickAlbumToKeep(db, albums, credit) {
  const songCount = db.prepare('SELECT COUNT(*) AS c FROM songs WHERE album_id = ?');
  return [...albums].sort((a, b) =>
    ((normArtist(b.artist_name) === credit?.key) - (normArtist(a.artist_name) === credit?.key))
    || (!!b.cover - !!a.cover)
    || (songCount.get(b.id).c - songCount.get(a.id).c)
    || ((a.created_at || 0) - (b.created_at || 0)))[0];
}

/**
 * Album `title` of the same main artist as `artistId` under another credit
 * ("Alan Walker x Ava Max" finds the album of "Alan Walker & K-391"). The
 * album is credited to the part both share. Returns its id or null.
 */
function findCollaborationAlbum(db, title, artistId) {
  const artist = artistId ? db.prepare('SELECT name FROM artists WHERE id = ?').get(artistId) : null;
  if (!artist) return null;
  const main = mainArtistKey(artist.name);
  const candidates = albumsWithTitle(db, title)
    .filter(a => a.artist_id && a.artist_id !== artistId && mainArtistKey(a.artist_name) === main);
  if (!candidates.length) return null;
  const credit = commonCredit([artist.name, ...candidates.map(a => a.artist_name)]);
  const album = pickAlbumToKeep(db, candidates, credit);
  creditAlbumTo(db, album, credit);
  return album.id;
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

module.exports = { getOrCreateAlbum, cleanupOrphanedAlbums, resolveEditedSongAlbum, mainArtistKey, commonCredit, sharedParticipant, creditAlbumTo, pickAlbumToKeep };
