/**
 * src/utils/genresList.js
 * Official Genres List & Validation / Normalization Utilities.
 */

'use strict';

const ALLOWED_GENRES = [
  // Mainstream
  "Pop", "Hip-Hop/Rap", "R&B", "Rock", "EDM (Electronic Dance Music)", "Latin/Reggaeton",
  "Country", "K-Pop", "Indie Pop", "Trap", "House", "Afrobeats", "Soul", "Funk", "Disco",
  "Alternative Rock", "Pop Rock", "Dance-Pop", "Techno", "Reggae",
  // Etabliert
  "Jazz", "Blues", "Classical/Klassik", "Metal", "Heavy Metal", "Punk", "Punk Rock", "Folk",
  "Singer-Songwriter", "Indie Rock", "Grunge", "Ska", "Gospel", "Dancehall", "Drum and Bass",
  "Dubstep", "Trance", "Synthpop", "New Wave", "Emo",
  // Subgenres
  "Progressive Rock", "Progressive Metal", "Death Metal", "Black Metal", "Thrash Metal",
  "Hardcore Punk", "Hard Rock", "Soft Rock", "Lo-fi", "Chillout/Ambient", "Downtempo",
  "Deep House", "Tech House", "Future Bass", "Hardstyle", "Garage/UK Garage", "Grime",
  "Afrobeat (klassisch, Fela Kuti)", "Bossa Nova", "Samba",
  // Traditionell
  "Salsa", "Cumbia", "Bachata", "Merengue", "Flamenco", "Tango", "Bluegrass", "Americana",
  "Cajun/Zydeco", "Klezmer", "Celtic Music", "Fado", "Bollywood/Filmi", "Bhangra", "Qawwali",
  "Highlife", "Soca", "Calypso", "Bolero", "World Music",
  // Nische
  "Industrial", "Noise", "Experimental", "Post-Rock", "Math Rock", "Shoegaze", "Vaporwave",
  "Chiptune/8-Bit", "IDM (Intelligent Dance Music)", "Musical/Soundtrack",
  // Deutsche Musikgenres
  "Deutschpop", "Deutschrap", "Schlager", "Volksmusik", "Neue Deutsche Welle (NDW)",
  "Neue Deutsche Härte", "Liedermacher", "Deutschpunk", "Krautrock", "Hamburger Schule"
];

// Invalid / Non-genre terms to strictly exclude (e.g. chart names, format names)
const FORBIDDEN_GENRE_KEYWORDS = [
  "billboard", "hot 100", "chart", "charts", "top 40", "top 50", "top 100", "hits",
  "music", "musik", "soundtrack", "general", "other", "unknown", "compilation",
  "various", "single", "ep", "lp", "album"
];

/**
 * Checks if a genre string is valid and present in ALLOWED_GENRES.
 * @param {string} genre
 * @returns {boolean}
 */
function isGenreValid(genre) {
  if (!genre || typeof genre !== 'string') return false;
  const gClean = genre.trim().toLowerCase();

  // Check forbidden keywords
  if (FORBIDDEN_GENRE_KEYWORDS.some(k => gClean.includes(k))) return false;

  // Direct match or normalized match in ALLOWED_GENRES
  return ALLOWED_GENRES.some(allowed => allowed.toLowerCase() === gClean);
}

/**
 * Normalizes a genre string to match exact casing from ALLOWED_GENRES if matched.
 * Returns null if not valid.
 * @param {string} genre
 * @returns {string|null}
 */
function normalizeGenre(genre) {
  if (!genre || typeof genre !== 'string') return null;
  const gClean = genre.trim().toLowerCase();

  if (FORBIDDEN_GENRE_KEYWORDS.some(k => gClean.includes(k))) return null;

  const match = ALLOWED_GENRES.find(allowed => allowed.toLowerCase() === gClean);
  if (match) return match;

  // Partial match fallbacks
  if (gClean.includes('hip') && gClean.includes('hop')) return 'Hip-Hop/Rap';
  if (gClean.includes('synth') && gClean.includes('pop')) return 'Synthpop';
  if (gClean.includes('indie') && gClean.includes('rock')) return 'Indie Rock';
  if (gClean.includes('indie') && gClean.includes('pop')) return 'Indie Pop';
  if (gClean.includes('edm') || gClean.includes('electronic dance')) return 'EDM (Electronic Dance Music)';
  if (gClean.includes('reggaeton')) return 'Latin/Reggaeton';
  if (gClean.includes('classical') || gClean.includes('klassik')) return 'Classical/Klassik';
  if (gClean.includes('country')) return 'Country';
  if (gClean.includes('techno')) return 'Techno';
  if (gClean.includes('house')) return 'House';

  return null;
}

module.exports = {
  ALLOWED_GENRES,
  FORBIDDEN_GENRE_KEYWORDS,
  isGenreValid,
  normalizeGenre
};
