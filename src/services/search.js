/**
 * src/services/search.js
 * Typo-tolerant, ranked library search.
 *
 * Every artist, album, song and playlist gets a relevance score between 0 and 1:
 *   exact match > prefix > word prefix > substring > fuzzy (typos, missing letters,
 *   swapped letters, missing spaces / punctuation / accents).
 * Songs that only match through their artist or album score lower than the
 * artist or album itself, so searching "the weekend" puts the artist The Weeknd
 * on top instead of twenty of their songs.
 */

'use strict';

// ── Normalisation ───────────────────────────────────────────────────────────
// Library texts are normalised again on every keystroke, so results are memoised
const normCache = new Map();
function normalize(s) {
  const key = String(s || '');
  let v = normCache.get(key);
  if (v === undefined) {
    v = normalizeRaw(key);
    if (normCache.size > 100000) normCache.clear();
    normCache.set(key, v);
  }
  return v;
}

function normalizeRaw(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const compact = (n) => n.replace(/ /g, '');
const stripThe = (n) => n.replace(/^the /, '');

// Optimal string alignment distance (Levenshtein + adjacent transpositions)
function editDistance(a, b, max) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  if (!la) return lb;
  if (!lb) return la;
  let prev2 = null;
  let prev = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    const cur = new Array(lb + 1);
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[lb];
}

// Allowed typos for a query (part) of the given length
function maxTypos(len) {
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  if (len <= 9) return 2;
  return 3;
}

// Similarity 0..1 of two strings, null when too far apart
function similarity(a, b) {
  const max = maxTypos(Math.min(a.length, b.length));
  if (!max) return a === b ? 1 : null;
  const d = editDistance(a, b, max);
  if (d > max) return null;
  return 1 - d / Math.max(a.length, b.length);
}

// Fuzzy match of a (possibly half-typed) query part against a text part:
// compares the whole word and the word's beginning of the same length.
function fuzzyPart(q, t) {
  let best = similarity(q, t) || 0;
  if (t.length > q.length && q.length >= 4) {
    for (const len of [q.length - 1, q.length, q.length + 1]) {
      const s = similarity(q, t.slice(0, len));
      if (s) best = Math.max(best, s * 0.95);
    }
  }
  return best;
}

/**
 * Prepares a query once for scoring many texts.
 */
function prepareQuery(q) {
  const norm = normalize(q);
  return {
    norm,
    compact: compact(norm),
    noThe: compact(stripThe(norm)),
    tokens: norm ? norm.split(' ') : [],
  };
}

/**
 * Relevance (0..1) of a single text field for a prepared query.
 */
function scoreText(pq, text) {
  if (!pq.compact) return 0;
  const tn = normalize(text);
  if (!tn) return 0;
  const tc = compact(tn);
  const tNoThe = compact(stripThe(tn));

  if (tc === pq.compact || tNoThe === pq.noThe) return 1;
  if (tc.startsWith(pq.compact) || tNoThe.startsWith(pq.noThe)) {
    return 0.9 + 0.05 * (pq.compact.length / tc.length);
  }
  const words = tn.split(' ');
  if (words.some(w => w.startsWith(pq.tokens[0])) && pq.tokens.every(qt => tn.includes(qt))) {
    return 0.8 + 0.05 * (pq.compact.length / tc.length);
  }
  if (tc.includes(pq.compact)) return 0.7;

  if (pq.compact.length < 4) return 0;

  // Whole-string fuzzy match ("the weekend" ↔ "The Weeknd", "metalica" ↔ "Metallica")
  let fuzzy = Math.max(fuzzyPart(pq.compact, tc), fuzzyPart(pq.noThe, tNoThe));

  // Word-by-word fuzzy match ("blindng lights" ↔ "Blinding Lights")
  if (pq.tokens.length > 1 || words.length > 1) {
    let sum = 0;
    let matched = 0;
    for (const qt of pq.tokens) {
      let best = 0;
      for (const w of words) {
        if (w === qt) { best = 1; break; }
        if (w.startsWith(qt)) { best = Math.max(best, 0.95); continue; }
        best = Math.max(best, fuzzyPart(qt, w));
      }
      if (best) matched++;
      sum += best;
    }
    // Short filler words ("the", "of") may be missing without failing the match
    const meaningful = pq.tokens.filter(t => t.length > 2).length || pq.tokens.length;
    if (matched >= meaningful) fuzzy = Math.max(fuzzy, (sum / pq.tokens.length) * 0.95);
  }

  return fuzzy >= 0.7 ? fuzzy * 0.85 : 0;
}

/**
 * Relevance of a set of fields that together describe an item
 * ("blinding lights weeknd" matches the title AND the artist of a song).
 */
function scoreCombined(pq, fields) {
  if (pq.tokens.length < 2) return 0;
  const words = normalize(fields.filter(Boolean).join(' ')).split(' ');
  // At least one meaningful query word has to hit the item's own title,
  // otherwise "the weekend" would rank every album/song of the artist above
  // the artist itself
  const titleWords = normalize(fields[0]).split(' ');
  const hitsTitle = pq.tokens.some(qt => qt.length > 2 && titleWords.some(w =>
    w === qt || w.startsWith(qt) || (qt.length >= 4 && fuzzyPart(qt, w) >= 0.75)));
  if (!hitsTitle) return 0;
  let sum = 0;
  for (const qt of pq.tokens) {
    let best = 0;
    for (const w of words) {
      if (w === qt) { best = 1; break; }
      if (w.startsWith(qt)) { best = Math.max(best, 0.95); continue; }
      if (qt.length >= 4) best = Math.max(best, fuzzyPart(qt, w));
    }
    if (!best) return 0;
    sum += best;
  }
  return (sum / pq.tokens.length) * 0.85;
}

const MIN_SCORE = 0.5;

function rank(items, scoreFn, limit, minScore = MIN_SCORE) {
  return items
    .map(item => ({ item, score: scoreFn(item) }))
    .filter(r => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Searches the library. Returns ranked arrays (each item carries `_score`)
 * plus `topResult` = the single best match across all types.
 */
function searchLibrary(db, q, userId, opts = {}) {
  const pq = prepareQuery(q);
  const empty = { topResult: null, songs: [], albums: [], artists: [], playlists: [] };
  if (!pq.compact) return empty;

  const songLimit = opts.songLimit || 50;

  // Artists
  const artistRows = db.prepare('SELECT * FROM artists').all();
  const artists = rank(artistRows, a => scoreText(pq, a.name), 10);

  // Albums
  const albumRows = db.prepare(`
    SELECT al.*, ar.name as artist_name
    FROM albums al LEFT JOIN artists ar ON ar.id = al.artist_id
  `).all();
  const albums = rank(albumRows, a => Math.max(
    scoreText(pq, a.title),
    scoreText(pq, a.artist_name) * 0.7,
    scoreCombined(pq, [a.title, a.artist_name]),
  ), 10);

  // Songs (score on light rows, load full rows only for the hits)
  const songRows = db.prepare(`
    SELECT s.id, s.title, s.play_count, ar.name as artist_name, al.title as album_title
    FROM songs s
    LEFT JOIN albums al ON al.id = s.album_id
    LEFT JOIN artists ar ON ar.id = s.artist_id
  `).all();
  const rankedSongs = rank(songRows, s => {
    const base = Math.max(
      scoreText(pq, s.title),
      scoreText(pq, s.artist_name) * 0.65,
      scoreText(pq, s.album_title) * 0.6,
      scoreCombined(pq, [s.title, s.artist_name, s.album_title]),
    );
    // Within equally good matches, popular songs come first
    return base ? base + Math.min(s.play_count || 0, 100) / 100000 : 0;
  }, songLimit, 0.4);

  let songs = [];
  if (rankedSongs.length) {
    const ids = rankedSongs.map(r => r.item.id);
    const full = db.prepare(`
      SELECT s.*, al.title as album_title, al.cover, ar.name as artist_name
      FROM songs s
      LEFT JOIN albums al ON al.id = s.album_id
      LEFT JOIN artists ar ON ar.id = s.artist_id
      WHERE s.id IN (${ids.map(() => '?').join(',')})
    `).all(...ids);
    const byId = new Map(full.map(s => [s.id, s]));
    songs = rankedSongs.map(r => ({ ...byId.get(r.item.id), _score: r.score })).filter(s => s.id);
  }

  // Own playlists
  const playlistRows = userId ? db.prepare('SELECT * FROM playlists WHERE user_id = ?').all(userId) : [];
  const playlists = rank(playlistRows, p => scoreText(pq, p.name) * 0.95, 10);

  const out = {
    artists: artists.map(r => ({ ...r.item, _score: r.score })),
    albums: albums.map(r => ({ ...r.item, _score: r.score })),
    songs,
    playlists: playlists.map(r => ({ ...r.item, _score: r.score })),
  };

  // Best single match; on equal scores artists beat albums beat songs
  const candidates = [
    out.artists[0] && { type: 'artist', score: out.artists[0]._score + 0.002, item: out.artists[0] },
    out.albums[0] && { type: 'album', score: out.albums[0]._score + 0.001, item: out.albums[0] },
    out.songs[0] && { type: 'song', score: out.songs[0]._score, item: out.songs[0] },
    out.playlists[0] && { type: 'playlist', score: out.playlists[0]._score, item: out.playlists[0] },
  ].filter(Boolean).sort((a, b) => b.score - a.score);
  out.topResult = candidates[0] || null;

  // An artist as top result comes with their most played songs
  if (out.topResult && out.topResult.type === 'artist') {
    out.topResult.songs = db.prepare(`
      SELECT s.*, al.title as album_title, al.cover, ar.name as artist_name
      FROM songs s
      LEFT JOIN albums al ON al.id = s.album_id
      LEFT JOIN artists ar ON ar.id = s.artist_id
      WHERE s.artist_id = ?
      ORDER BY s.play_count DESC, s.created_at DESC
      LIMIT 4
    `).all(out.topResult.item.id);
  }

  return out;
}

module.exports = { searchLibrary, normalize, scoreText, prepareQuery, editDistance };
