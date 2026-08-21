/**
 * src/services/autoLookup.js
 * Automatic Metadata Lookup Service.
 * Implements: MusicBrainz -> Mistral AI Correction -> MusicBrainz retry -> AI Fallback chain.
 * Enforces strict user precedence (user-edited data is never overwritten).
 */

'use strict';

const { getDB, getConfig, log, getOrCreateArtist } = require('../db');
const { searchMusicBrainz } = require('./musicbrainz');
const { correctTrackInfo, fetchSpecificGenre } = require('./mistral');
const { isGenreValid, normalizeGenre } = require('../utils/genresList');
const { v4: uuidv4 } = require('uuid');

let isLookupRunning = false;
let lookupQueue = [];

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
          WHERE a.title = ? AND a.id != ?
          LIMIT 1
        `).get(emptyAlbum.title, emptyAlbum.id);

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


function getOrCreateAlbum(db, title, artistId, meta = {}, existingAlbumId = null) {
  if (!title) return null;

  // 1. Search for existing album by title and artist_id
  let row = null;
  if (artistId) {
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

  // 3. Search by title matching any artist (prevents creating duplicate albums for single tracks)
  if (!row) {
    row = db.prepare('SELECT * FROM albums WHERE title = ?').get(title);
    if (row && artistId && !row.artist_id) {
      db.prepare('UPDATE albums SET artist_id = ? WHERE id = ?').run(artistId, row.id);
      row.artist_id = artistId;
    }
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
 * Updates a single song's metadata when a lookup is successful.
 */
function applyMetadataToSong(songId, meta, sourceName) {
  const db = getDB();
  const song = db.prepare(`
    SELECT s.*, ar.name as artist_name, al.title as album_title 
    FROM songs s 
    LEFT JOIN artists ar ON ar.id = s.artist_id 
    LEFT JOIN albums al ON al.id = s.album_id 
    WHERE s.id = ?
  `).get(songId);

  if (!song) return false;

  // When lookup succeeds, update metadata fields with official fetched values
  const finalTitle = meta.title || song.title;
  const finalArtistName = meta.artist || song.artist_name;
  const finalAlbumTitle = meta.album || song.album_title;
  const finalYear = meta.year || song.year;
  const finalGenre = meta.genre || song.genre;
  const finalTrackNumber = meta.track_number || song.track_number;

  const artistId = getOrCreateArtist(db, finalArtistName);

  // Preserve cover from existing album if available
  const existingAlbum = song.album_id ? db.prepare('SELECT * FROM albums WHERE id = ?').get(song.album_id) : null;
  const albumMeta = {
    year: finalYear,
    genre: finalGenre,
    cover: existingAlbum?.cover || null
  };

  const albumId = getOrCreateAlbum(db, finalAlbumTitle, artistId, albumMeta, song.album_id);

  db.prepare(`
    UPDATE songs 
    SET title = ?, artist_id = ?, album_id = ?, genre = ?, year = ?, track_number = ?
    WHERE id = ?
  `).run(finalTitle, artistId, albumId, finalGenre, finalYear, finalTrackNumber, songId);

  cleanupOrphanedAlbums(db);

  log('info', 'metadata', `Auto-Lookup applied (${sourceName}) for "${finalTitle}" (${finalArtistName || 'Unbekannt'})`);
  return true;
}

/**
 * Helper to refine non-standard or generic genres via Mistral AI.
 * Forces AI to research actual song style and pick strictly from ALLOWED_GENRES.
 */
async function refineGenericGenre(meta, song, cfg) {
  const isValid = isGenreValid(meta.genre);
  if (!isValid && cfg.mistralApiKey) {
    const specificGenre = await fetchSpecificGenre({
      title: meta.title || song.title,
      artist: meta.artist || song.artist_name,
      album: meta.album || song.album_title
    }, cfg.mistralApiKey, cfg.aiModel);

    if (specificGenre && isGenreValid(specificGenre)) {
      meta.genre = specificGenre;
    }
  } else if (meta.genre) {
    const normalized = normalizeGenre(meta.genre);
    if (normalized) meta.genre = normalized;
  }
  return meta;
}

/**
 * Executes lookup logic for a specific song ID.
 */
async function processSongLookup(songId) {
  const db = getDB();
  const cfg = getConfig();
  const song = db.prepare(`
    SELECT s.*, ar.name as artist_name, al.title as album_title 
    FROM songs s 
    LEFT JOIN artists ar ON ar.id = s.artist_id 
    LEFT JOIN albums al ON al.id = s.album_id 
    WHERE s.id = ?
  `).get(songId);

  if (!song) return { ok: false, error: 'Song not found' };

  // 1. Initial MusicBrainz Lookup
  let mbResult = await searchMusicBrainz(song.title, song.artist_name || '', song.album_title || '');

  if (mbResult) {
    mbResult = await refineGenericGenre(mbResult, song, cfg);
    applyMetadataToSong(songId, mbResult, 'MusicBrainz');
    return { ok: true, source: 'MusicBrainz', metadata: mbResult };
  }

  // 2. MusicBrainz failed -> Check AI lookup configuration
  const enableAi = cfg.enableAiCorrection === true;
  const apiKey = cfg.mistralApiKey;

  if (!enableAi || !apiKey) {
    log('info', 'metadata', `Auto-Lookup: MusicBrainz match not found for "${song.title}". AI correction disabled/unconfigured.`);
    return { ok: false, error: 'MusicBrainz match not found, AI lookup disabled' };
  }

  // 3. Mistral AI Inspection & Correction
  const aiResult = await correctTrackInfo({
    title: song.title,
    artist: song.artist_name,
    album: song.album_title,
    filename: song.filename
  }, apiKey, cfg.aiModel);

  if (aiResult.status === 'match_found' && aiResult.confidence >= 0.7) {
    // 3a. Retry MusicBrainz with AI-corrected tags
    let mbResult2 = await searchMusicBrainz(
      aiResult.title || song.title,
      aiResult.artist || song.artist_name || '',
      aiResult.album || song.album_title || ''
    );

    if (mbResult2) {
      mbResult2 = await refineGenericGenre(mbResult2, song, cfg);
      applyMetadataToSong(songId, mbResult2, 'MusicBrainz (via Mistral AI)');
      return { ok: true, source: 'MusicBrainz (AI-assisted)', metadata: mbResult2 };
    }

    // 3b. MusicBrainz STILL does not list the song -> Fallback to AI metadata directly
    const refinedAi = await refineGenericGenre(aiResult, song, cfg);
    applyMetadataToSong(songId, refinedAi, 'Mistral AI (Direct Fallback)');
    return { ok: true, source: 'Mistral AI', metadata: refinedAi };
  }

  // 4. AI indicates human review is required or not found
  log('info', 'metadata', `[AI Lookup] Lied benötigt menschliche Überprüfung: "${song.title}" (${song.filename}) - ${aiResult.reasoning || 'Unklar'}`);
  return { ok: false, source: 'Needs Human Review', reasoning: aiResult.reasoning };
}

/**
 * Triggers background auto-lookup for all songs missing metadata or having generic/non-standard genre.
 */
async function triggerLibraryAutoLookup() {
  const db = getDB();
  const cfg = getConfig();

  if (cfg.autoLookupEnabled === false) {
    return { queued: 0, message: 'Auto-Lookup ist in den Einstellungen deaktiviert.' };
  }

  const allSongs = db.prepare(`
    SELECT id, genre, year, artist_id, album_id FROM songs
  `).all();

  const candidateSongs = allSongs.filter(s => {
    return !s.year || !s.artist_id || !s.album_id || !s.genre || !isGenreValid(s.genre);
  });

  for (const s of candidateSongs) {
    if (!lookupQueue.includes(s.id)) {
      lookupQueue.push(s.id);
    }
  }

  processQueue();

  return { queued: candidateSongs.length, message: `${candidateSongs.length} Lieder zur automatischen Hintergrund-Suche hinzugefügt.` };
}


/**
 * Processes queued song lookups sequentially.
 */
async function processQueue() {
  if (isLookupRunning || lookupQueue.length === 0) return;
  isLookupRunning = true;

  while (lookupQueue.length > 0) {
    const songId = lookupQueue.shift();
    try {
      await processSongLookup(songId);
    } catch (err) {
      console.error(`[cumu] AutoLookup error for ${songId}:`, err.message);
    }
  }

  isLookupRunning = false;
}

/**
 * Queues a single song for background lookup.
 */
function queueSongForLookup(songId) {
  const cfg = getConfig();
  if (cfg.autoLookupEnabled === false) return;
  if (!lookupQueue.includes(songId)) {
    lookupQueue.push(songId);
    processQueue();
  }
}

module.exports = {
  processSongLookup,
  triggerLibraryAutoLookup,
  queueSongForLookup
};
