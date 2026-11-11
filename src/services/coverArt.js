/**
 * src/services/coverArt.js
 * Album covers: where they are stored, and how missing ones are found.
 *
 * Covers live in their own folder (admin setting "coverPath", default
 * data/covers), not in the music folder. Older versions wrote them into the
 * music folder; those are still served from there and are moved over when an
 * admin sets the cover folder.
 *
 * A missing album cover is looked for in this order:
 *   1. artwork embedded in one of the album's audio files
 *   2. the Cover Art Archive (MusicBrainz' image service), using the release
 *      the metadata lookup found, or a release group search by album + artist
 * The image is downloaded once (500 px, ~50-120 KB) and served by cumu itself,
 * so clients never contact an outside service and covers work offline.
 * A cover that exists is never replaced.
 */

'use strict';

const fs    = require('fs');
const path  = require('path');
const http  = require('http');
const https = require('https');
const mm    = require('music-metadata');
const { v4: uuidv4 } = require('uuid');
const { getConfig, setConfig, getDataDir } = require('../db');
const { searchReleaseGroup } = require('./musicbrainz');

const USER_AGENT = 'cumu ( https://github.com/Wolfiku/cumu )';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_EXTS = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
// Covers cumu wrote itself are named <uuid>.<ext>; only those are ever moved
const OWN_COVER_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpe?g|png|webp|gif|bmp)$/i;

// ── Settings ─────────────────────────────────────────────────────────────────

function getDefaultCoverPath() {
  return path.join(getDataDir(), 'covers');
}

function getCoverPath() {
  return getConfig().coverPath || getDefaultCoverPath();
}

// Covers are added automatically during scans and after uploads
function isCoverAutoEnabled() {
  return getConfig().coverAutoEnabled === true;
}

// ...and may be searched for online (MusicBrainz / Cover Art Archive)
function isCoverOnlineEnabled() {
  return getConfig().coverOnlineEnabled !== false;
}

/**
 * Called once when this version first starts. A new installation gets covers
 * right away. An existing library keeps working as before until an admin
 * chooses the cover folder (one-time notice in the web client).
 */
function initCoverSettings(db) {
  const cfg = getConfig();
  if (cfg.coverFeatureIntroduced === true) return;
  const hasSongs = !!db.prepare('SELECT 1 FROM songs LIMIT 1').get();
  if (cfg.coverAutoEnabled === undefined) setConfig('coverAutoEnabled', !hasSongs);
  setConfig('coverAnnouncement', hasSongs ? 'pending' : 'done');
  setConfig('coverFeatureIntroduced', true);
}

// ── Files ────────────────────────────────────────────────────────────────────

function ensureCoverDir() {
  const dir = getCoverPath();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Folders an existing cover may be in: the cover folder first, then the
// default one and the music folders older versions wrote covers into
function coverSearchDirs() {
  const cfg = getConfig();
  return [...new Set([
    getCoverPath(),
    getDefaultCoverPath(),
    cfg.musicPath,
    process.env.MUSIC_PATH,
    path.join(process.cwd(), 'music'),
  ].filter(Boolean))];
}

function findCoverFile(filename) {
  const safe = path.basename(String(filename || ''));
  if (!safe) return null;
  for (const dir of coverSearchDirs()) {
    const filePath = path.join(dir, safe);
    try {
      if (fs.statSync(filePath).isFile()) return filePath;
    } catch {}
  }
  return null;
}

function extForFormat(format) {
  const f = String(format || '').toLowerCase();
  if (IMAGE_EXTS[f]) return IMAGE_EXTS[f];
  const sub = f.split('/')[1] || f;
  return ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(sub) ? (sub === 'jpeg' ? 'jpg' : sub) : 'jpg';
}

/** Writes an image into the cover folder and returns its file name. */
function saveCover(buffer, format) {
  const dir = ensureCoverDir();
  const filename = `${uuidv4()}.${extForFormat(format)}`;
  fs.writeFileSync(path.join(dir, filename), buffer);
  return filename;
}

// rename, or copy + delete when the folders are on different drives
async function moveFile(from, to) {
  try {
    await fs.promises.rename(from, to);
  } catch (err) {
    if (err.code !== 'EXDEV' && err.code !== 'EPERM') throw err;
    await fs.promises.copyFile(from, to);
    try { await fs.promises.unlink(from); } catch {} // read-only source: keep the copy
  }
}

/** Moves a file (e.g. an uploaded cover) into the cover folder. */
async function moveIntoCoverDir(filePath) {
  const dir = ensureCoverDir();
  const target = path.join(dir, path.basename(filePath));
  if (path.resolve(target) !== path.resolve(filePath)) await moveFile(filePath, target);
  return path.basename(target);
}

/**
 * Moves every cover the library uses into the current cover folder (after the
 * folder was changed, and covers older versions put into the music folder).
 * Only files cumu created itself are moved.
 */
async function relocateCovers(db) {
  const target = ensureCoverDir();
  const names = new Set();
  for (const table of ['albums', 'songs', 'playlists']) {
    try {
      db.prepare(`SELECT DISTINCT cover FROM ${table} WHERE cover IS NOT NULL`).all()
        .forEach(r => { if (OWN_COVER_NAME.test(r.cover)) names.add(r.cover); });
    } catch {}
  }
  const sources = coverSearchDirs().filter(dir => path.resolve(dir) !== path.resolve(target));
  let moved = 0, failed = 0;
  for (const name of names) {
    if (fs.existsSync(path.join(target, name))) continue;
    for (const dir of sources) {
      const from = path.join(dir, name);
      if (!fs.existsSync(from)) continue;
      try {
        await moveFile(from, path.join(target, name));
        moved++;
      } catch {
        failed++;
      }
      break;
    }
  }
  return { moved, failed };
}

/** Deletes a cover file if nothing in the library uses it any more. */
function deleteCoverIfUnused(db, filename) {
  if (!filename || !OWN_COVER_NAME.test(filename)) return;
  const used = db.prepare('SELECT 1 FROM albums WHERE cover = ? UNION SELECT 1 FROM songs WHERE cover = ? LIMIT 1').get(filename, filename);
  if (used) return;
  const file = path.join(getCoverPath(), filename);
  try { fs.unlinkSync(file); } catch {}
}

// ── Download ─────────────────────────────────────────────────────────────────

/**
 * GET that follows redirects (the Cover Art Archive redirects to archive.org).
 * Resolves with { status, type, body }; rejects on network errors.
 */
function httpGet(urlStr, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const client = url.protocol === 'http:' ? http : https;
    const req = client.get(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'image/*' }, timeout: 20000 }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) return reject(new Error('too many redirects'));
        return resolve(httpGet(new URL(res.headers.location, url).href, redirectsLeft - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return resolve({ status: res.statusCode, type: null, body: null });
      }
      const chunks = [];
      let size = 0;
      res.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_IMAGE_BYTES) req.destroy(new Error('image too large'));
        else chunks.push(chunk);
      });
      res.on('end', () => resolve({ status: 200, type: String(res.headers['content-type'] || '').split(';')[0].trim(), body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/**
 * Front cover of a release or release group from the Cover Art Archive.
 * Returns { buffer, type } or null when there is none; throws when the
 * archive can't be reached.
 */
async function fetchCoverArtArchive(kind, mbid) {
  for (const size of ['500', '250']) {
    const { status, type, body } = await httpGet(`https://coverartarchive.org/${kind}/${mbid}/front-${size}`);
    if (status === 200 && body?.length && String(type).startsWith('image/')) return { buffer: body, type };
    if (status === 404) continue;
    if (status === 400) return null; // invalid id
    if (status !== 200) throw new Error(`Cover Art Archive HTTP ${status}`);
  }
  return null;
}

// ── Finding a cover for an album ─────────────────────────────────────────────

async function embeddedPicture(filePath) {
  try {
    const meta = await mm.parseFile(filePath, { duration: false });
    const pics = meta.common?.picture || [];
    const front = pics.find(p => /front/i.test(p.type || '')) || pics[0];
    return front?.data?.length ? front : null;
  } catch {
    return null;
  }
}

/**
 * Looks for a cover for `album` (a row of albums, with artist_name).
 * Saves the image and returns { status: 'embedded'|'found', filename, source }
 * or { status: 'none' }. Throws when an online service could not be reached.
 *
 * opts.findSongFile(filename) -> absolute path   resolves song files
 * opts.online                                   search online (default: setting)
 */
async function findAlbumCover(db, album, opts = {}) {
  const online = opts.online ?? isCoverOnlineEnabled();

  // 1. Artwork embedded in one of the album's files
  if (opts.findSongFile) {
    const songs = db.prepare('SELECT filename FROM songs WHERE album_id = ? ORDER BY track_number, created_at LIMIT 5').all(album.id);
    for (const song of songs) {
      const filePath = opts.findSongFile(song.filename);
      const pic = filePath ? await embeddedPicture(filePath) : null;
      if (pic) return { status: 'embedded', filename: saveCover(pic.data, pic.format), source: 'embedded' };
    }
  }

  if (!online) return { status: 'none' };

  // 2. Cover Art Archive: the release found by the song lookup first, then the
  //    album across all its editions (release group)
  let failure = null;
  const tryArchive = async (kind, id) => {
    if (!id) return null;
    try {
      return await fetchCoverArtArchive(kind, id);
    } catch (err) {
      failure = err;
      return null;
    }
  };

  let image = await tryArchive('release', album.mb_release_id);
  if (!image && album.mb_release_group_id) image = await tryArchive('release-group', album.mb_release_group_id);

  if (!image && !album.mb_release_group_id && !album.is_audiobook && album.title && album.artist_name) {
    const rg = await searchReleaseGroup(album.title, album.artist_name); // throws if MusicBrainz is down
    if (rg) {
      db.prepare('UPDATE albums SET mb_release_group_id = ? WHERE id = ?').run(rg.id, album.id);
      image = await tryArchive('release-group', rg.id);
    }
  }

  if (image) return { status: 'found', filename: saveCover(image.buffer, image.type), source: 'Cover Art Archive' };
  if (failure) throw failure;
  return { status: 'none' };
}

/**
 * Searches a cover for one album and stores the result. Never replaces a
 * cover the album got in the meantime. Returns the status that was stored.
 */
async function updateAlbumCover(db, album, opts = {}) {
  let result;
  try {
    result = await findAlbumCover(db, album, opts);
  } catch (err) {
    db.prepare("UPDATE albums SET cover_status = 'error' WHERE id = ? AND cover IS NULL").run(album.id);
    throw err;
  }
  if (result.filename) {
    const changed = db.prepare('UPDATE albums SET cover = ?, cover_status = ? WHERE id = ? AND cover IS NULL')
      .run(result.filename, result.status, album.id).changes;
    if (!changed) {
      try { fs.unlinkSync(path.join(getCoverPath(), result.filename)); } catch {}
      return 'kept';
    }
  } else {
    db.prepare('UPDATE albums SET cover_status = ? WHERE id = ? AND cover IS NULL').run(result.status, album.id);
  }
  return result.status;
}

function albumWithArtist(db, albumId) {
  return db.prepare('SELECT a.*, ar.name AS artist_name FROM albums a LEFT JOIN artists ar ON ar.id = a.artist_id WHERE a.id = ?').get(albumId);
}

function coverCounts(db) {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN cover IS NOT NULL THEN 1 ELSE 0 END) AS withCover,
      SUM(CASE WHEN cover IS NULL AND cover_status IS NULL THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN cover IS NULL AND cover_status = 'none' THEN 1 ELSE 0 END) AS noMatch,
      SUM(CASE WHEN cover IS NULL AND cover_status = 'error' THEN 1 ELSE 0 END) AS failed
    FROM albums
  `).get();
  return {
    total: row.total || 0, withCover: row.withCover || 0, pending: row.pending || 0,
    noMatch: row.noMatch || 0, failed: row.failed || 0,
  };
}

module.exports = {
  getCoverPath, getDefaultCoverPath, isCoverAutoEnabled, isCoverOnlineEnabled, initCoverSettings,
  findCoverFile, saveCover, moveIntoCoverDir, relocateCovers, deleteCoverIfUnused,
  findAlbumCover, updateAlbumCover, albumWithArtist, coverCounts,
};
