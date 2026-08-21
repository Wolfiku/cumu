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
 * Ensures at least 1000ms between calls to respect MusicBrainz rate limit.
 */
async function enforceRateLimit() {
  const now = Date.now();
  const diff = now - lastRequestTime;
  if (diff < 1000) {
    await new Promise(res => setTimeout(res, 1000 - diff));
  }
  lastRequestTime = Date.now();
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
 */
function fetchJson(urlStr) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json'
      }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

/**
 * Extracts 4-digit year from date string (e.g. "1997-03-24" -> 1997).
 */
function parseYear(dateStr) {
  if (!dateStr) return null;
  const match = String(dateStr).match(/\b(19\d\d|20\d\d)\b/);
  return match ? parseInt(match[1], 10) : null;
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

/**
 * Searches MusicBrainz for recording metadata.
 * @param {string} title
 * @param {string} artist
 * @param {string} album
 * @returns {Promise<Object|null>}
 */
async function searchMusicBrainz(title, artist = '', album = '') {
  await enforceRateLimit();

  const cleanTitle = cleanQueryTerm(title);
  const cleanArtist = cleanQueryTerm(artist);
  const cleanAlbum = cleanQueryTerm(album);

  if (!cleanTitle && !cleanArtist) return null;

  let queryParts = [];
  if (cleanTitle) queryParts.push(`recording:"${cleanTitle}"`);
  if (cleanArtist) queryParts.push(`artist:"${cleanArtist}"`);
  if (cleanAlbum) queryParts.push(`release:"${cleanAlbum}"`);

  let query = queryParts.join(' AND ');
  let url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&limit=5`;

  let data = await fetchJson(url);

  // If strict query produced no results, try broader recording search
  if ((!data || !data.recordings || data.recordings.length === 0) && cleanTitle) {
    await enforceRateLimit();
    url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(cleanTitle)}&fmt=json&limit=5`;
    data = await fetchJson(url);
  }

  if (!data || !data.recordings || data.recordings.length === 0) {
    return null;
  }

  const rec = data.recordings[0];
  const score = rec.score || 0;

  if (score < 50) return null;

  const artistCredit = rec['artist-credit']?.[0]?.name || rec['artist-credit']?.[0]?.artist?.name || artist || null;
  const release = rec.releases?.[0];
  const albumTitle = release?.title || album || null;
  const releaseDate = release?.date || rec['first-release-date'] || null;
  const year = parseYear(releaseDate);

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
    title: rec.title || title,
    artist: artistCredit,
    album: albumTitle,
    year: year,
    genre: genre,
    track_number: isNaN(trackNumber) ? null : trackNumber,
    score: score,
    mbid: rec.id
  };
}

module.exports = { searchMusicBrainz };
