/**
 * src/services/musicbrainz.js
 * MusicBrainz API Service.
 * Implements search with 1 request/second throttling and User-Agent compliance.
 */

'use strict';

const https = require('https');

const USER_AGENT = 'cumu/0.2.0 ( https://github.com/Wolfiku/cumu )';
let lastRequestTime = 0;

/**
 * MusicBrainz allows about one request per second. Requests are queued so that
 * concurrent lookups (scan, uploads, manual lookups) keep the spacing too.
 */
const MIN_REQUEST_GAP_MS = 1100;
let requestQueue = Promise.resolve();

function enforceRateLimit() {
  const turn = requestQueue.then(async () => {
    const wait = lastRequestTime + MIN_REQUEST_GAP_MS - Date.now();
    if (wait > 0) await new Promise(res => setTimeout(res, wait));
    lastRequestTime = Date.now();
  });
  requestQueue = turn.catch(() => {});
  return turn;
}

/**
 * Cleans string for Lucene query formatting.
 */
function cleanQueryTerm(term) {
  if (!term) return '';
  return term.replace(/[\!\?\+\-\&\|\\^\~\*\:\"\/\[\]\(\)\{\}]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Performs HTTPS GET request to MusicBrainz API.
 * Resolves with { status, body }; rejects on network errors.
 */
function requestJson(urlStr) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json'
      },
      timeout: 15000
    };
    const req = https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let body = null;
        try { body = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, body });
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

const RETRY_DELAYS_MS = [2000, 5000, 10000];

/**
 * Rate-limited GET with retries. Returns the parsed body, or null when
 * MusicBrainz answers with a client error. Throws when MusicBrainz stays
 * unreachable or overloaded, so callers can tell "not found" from "failed".
 */
async function fetchJson(urlStr) {
  for (let attempt = 0; ; attempt++) {
    await enforceRateLimit();
    let failure;
    try {
      const { status, body } = await requestJson(urlStr);
      if (status >= 200 && status < 300) return body;
      if (status !== 429 && status < 500) return null;
      failure = `HTTP ${status}`;
    } catch (err) {
      failure = err.message;
    }
    if (attempt >= RETRY_DELAYS_MS.length) {
      throw new Error(`MusicBrainz not reachable (${failure})`);
    }
    await new Promise(res => setTimeout(res, RETRY_DELAYS_MS[attempt]));
  }
}

/**
 * Capitalizes genre nicely (e.g. "hip hop" -> "Hip Hop").
 */
function formatGenre(genreStr) {
  if (!genreStr) return null;
  return genreStr
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// ── Match verification ───────────────────────────────────────────────────────
// The search returns covers, remixes and parodies next to the original, often
// with a high score. A result is only used when title and artist agree with the
// song (and its length, when both are known). Anything less certain counts as
// "no match": wrong metadata would overwrite correct tags.

const MAX_DURATION_DIFF_S = 7;

// Lowercase, without accents, bracketed suffixes ("(Remastered)", "[Live]"),
// featured artists and punctuation
function normalizeName(str) {
  return String(str || '')
    .normalize('NFKD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s*[\(\[][^\)\]]*[\)\]]/g, ' ')
    .replace(/\s+(feat\.?|ft\.?|featuring)\s.*$/, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/^the\s+/, '')
    .trim();
}

function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

// Equal after normalizing, allowing a typo or two in longer names
function sameName(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return levenshtein(na, nb) / Math.max(na.length, nb.length) <= 0.1;
}

function artistMatches(rec, artist) {
  const credits = rec['artist-credit'] || [];
  const full = credits.map(c => (c.name || c.artist?.name || '') + (c.joinphrase || '')).join('');
  return sameName(full, artist) || credits.some(c => sameName(c.name || c.artist?.name, artist));
}

// When the song's length is known, the recording must have a matching one
function durationMatches(rec, durationSeconds) {
  if (!durationSeconds) return true;
  return !!rec.length && Math.abs(rec.length / 1000 - durationSeconds) <= MAX_DURATION_DIFF_S;
}

// Words that mark a different version of a song. The recording (title and
// disambiguation, e.g. "live, 1986-07-12: Wembley") and the song's own title
// must carry the same ones: no remix for the original, no studio take for a
// live file.
const VERSION_MARKERS = ['live', 'remix', 'mix', 'karaoke', 'instrumental', 'acoustic', 'demo', 'cover',
  'bootleg', 'dub', 'rework', 'excerpt', 'teaser', 'sped up', 'slowed', 'tribute', 'medley', 'reprise',
  'a cappella', 'unplugged', 'orchestral', 'broadcast', 'session', 'rehearsal', 'edit'];

function versionMarkers(str) {
  const text = ` ${String(str || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  return VERSION_MARKERS.filter(m => text.includes(` ${m} `));
}

function isSameVersion(rec, title) {
  const own = new Set(versionMarkers(title));
  const theirs = new Set(versionMarkers(`${rec.title} ${rec.disambiguation || ''}`));
  // Recordings released only live or as bootleg are live performances
  const releases = rec.releases || [];
  if (releases.length && releases.every(rel =>
    (rel['release-group']?.['secondary-types'] || []).includes('Live') || rel.status === 'Bootleg')) theirs.add('live');
  return own.size === theirs.size && [...own].every(m => theirs.has(m));
}

// Among the accepted recordings: the exact title first (so "Du hast" beats
// "Du hast (English version)"), then one on a studio album, then the oldest
function plainTitle(str) {
  return String(str || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
function recordingRank(rec, title) {
  return [
    plainTitle(rec.title) === plainTitle(title) ? 0 : 1,
    (rec.releases || []).some(isStudioAlbum) ? 0 : 1,
    rec['first-release-date'] || '9999',
  ];
}
function compareRank(a, b, title) {
  const ra = recordingRank(a, title), rb = recordingRank(b, title);
  return ra[0] - rb[0] || ra[1] - rb[1] || ra[2].localeCompare(rb[2]);
}

function isStudioAlbum(rel) {
  const group = rel['release-group'] || {};
  return rel.status === 'Official' && group['primary-type'] === 'Album' && !(group['secondary-types'] || []).length;
}

// The album a song belongs to: the earliest official studio album. Search
// results often list only compilations or singles for a recording; those are
// not used, the album then stays as it is.
function pickRelease(releases) {
  return (releases || []).filter(isStudioAlbum)
    .sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')))[0] || null;
}

/**
 * Searches MusicBrainz for recording metadata.
 * Without an artist, "Artist - Title" in the title (typical for untagged files
 * named after the song) is split up; without any artist no match is returned,
 * since it could not be verified.
 * @param {string} title
 * @param {string} artist
 * @param {string} album
 * @param {number} duration  song length in seconds (0 = unknown)
 * @returns {Promise<Object|null>}
 */
async function searchMusicBrainz(title, artist = '', album = '', duration = 0) {
  if (!artist && title) {
    const parts = String(title).split(/\s+[-–—]\s+/);
    if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
      artist = parts[0].trim();
      title = parts[1].trim();
    }
  }

  const cleanTitle = cleanQueryTerm(title);
  const cleanArtist = cleanQueryTerm(artist);

  if (!cleanTitle || !cleanArtist) return null;

  const findMatch = (data) => (data?.recordings || [])
    .filter(rec => sameName(rec.title, title) && artistMatches(rec, artist)
      && durationMatches(rec, duration) && isSameVersion(rec, title))
    .sort((a, b) => compareRank(a, b, title))[0];

  let query = `recording:"${cleanTitle}" AND artist:"${cleanArtist}"`;
  let rec = findMatch(await fetchJson(`https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&limit=50`));

  // Tags often differ slightly from MusicBrainz spelling: retry without quotes
  if (!rec) {
    query = `recording:(${cleanTitle}) AND artist:(${cleanArtist})`;
    rec = findMatch(await fetchJson(`https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&limit=50`));
  }

  if (!rec) return null;

  const credits = rec['artist-credit'] || [];
  const artistCredit = credits.map(c => (c.name || c.artist?.name || '') + (c.joinphrase || '')).join('') || artist || null;
  const release = pickRelease(rec.releases);
  const albumTitle = release?.title || album || null;

  let rawGenre = null;
  if (rec.genres && rec.genres.length > 0) {
    rawGenre = rec.genres[0].name;
  } else if (rec.tags && rec.tags.length > 0) {
    // Pick tag with highest count
    const sortedTags = [...rec.tags].sort((a, b) => (b.count || 0) - (a.count || 0));
    rawGenre = sortedTags[0].name;
  }

  const genre = formatGenre(rawGenre);
  const trackNumber = release?.media?.[0]?.track?.[0]?.number ? parseInt(release.media[0].track[0].number, 10) : null;

  return {
    // MusicBrainz names live takes etc. in the disambiguation, not the title:
    // keep "(Live)" and the like from the song's own title then
    title: versionMarkers(title).some(m => !versionMarkers(rec.title).includes(m)) ? title : (rec.title || title),
    artist: artistCredit,
    album: albumTitle,
    // No year: remasters are separate recordings with their own (later) date,
    // so a text search can't tell the original year. The song keeps its own.
    year: null,
    genre: genre,
    track_number: isNaN(trackNumber) ? null : trackNumber,
    score: rec.score || 0,
    mbid: rec.id
  };
}

module.exports = { searchMusicBrainz };
