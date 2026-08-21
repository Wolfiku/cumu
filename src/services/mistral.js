/**
 * src/services/mistral.js
 * Mistral AI Service for song metadata correction.
 * Enforces structured output schema and high precision thresholds.
 */

'use strict';

const https = require('https');
const { ALLOWED_GENRES, isGenreValid, normalizeGenre } = require('../utils/genresList');

/**
 * Executes a chat completion call against Mistral API.
 */
function callMistralApi(apiKey, model, messages, jsonMode = true) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: model || 'mistral-small-latest',
      messages,
      temperature: 0.1,
      response_format: jsonMode ? { type: 'json_object' } : undefined
    });

    const options = {
      hostname: 'api.mistral.ai',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.message?.content;
            resolve(content);
          } catch (e) {
            reject(new Error('Invalid JSON response from Mistral API'));
          }
        } else {
          try {
            const errJson = JSON.parse(data);
            reject(new Error(errJson.message || errJson.error?.message || `Mistral HTTP ${res.statusCode}`));
          } catch {
            reject(new Error(`Mistral HTTP ${res.statusCode}`));
          }
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(payload);
    req.end();
  });
}

/**
 * Validates a Mistral API key by making a lightweight request.
 */
async function testMistralKey(apiKey, model = 'mistral-small-latest') {
  if (!apiKey) return { ok: false, error: 'API Key is empty' };
  try {
    const res = await callMistralApi(apiKey, model, [
      { role: 'user', content: 'Say OK' }
    ], false);
    return { ok: true, response: res };
  } catch (err) {
    return { ok: false, error: err.message || 'Invalid API Key or network error' };
  }
}

/**
 * Analyzes track tags and filename with Mistral AI to correct artist, title, album, year, genre.
 */
async function correctTrackInfo(songInfo, apiKey, model = 'mistral-small-latest') {
  if (!apiKey) {
    return { status: 'not_found', reasoning: 'No API key configured' };
  }

  const { title, artist, album, filename } = songInfo;

  const systemPrompt = `You are an expert music metadata verifier. Your task is to analyze dirty filenames, misspelled tags, or partial track information and determine the official Song Title, Artist Name, Album Name, Release Year, Genre, and Track Number.

STRICT GUIDELINES:
1. Return status "match_found" ONLY if you are high-confidence (confidence >= 0.8) of the real artist and title.
2. SINGLES & EPs: Many tracks are standalone Singles or EPs (for example "Self Aware" by "Temper City"). For singles or standalone releases, set the album field to the song title (e.g. "Self Aware" or "Self Aware - Single") or the official Single release title. NEVER hallucinate random unrelated artist/song mashups (such as "GuMMy†Be▲R! · Hands Hold") or fake album names.
3. GENRE SELECTION: Genre MUST be a real musical genre selected ONLY from our official allowed list below. Chart names (such as "Billboard Hot 100", "Charts", "Top 40", "Hits"), release format labels ("Single", "Compilation"), or generic labels ("Music", "Musik", "Soundtrack", "General", "Other") are NOT musical genres and are STRICTLY FORBIDDEN.
Official allowed genres:
${ALLOWED_GENRES.join(', ')}
4. PRESERVE ACCURACY: Never combine artist names into titles or invent fake artists or album names. If no full album exists, use the song title or "${title || 'Single'} - Single" as the album.
5. If the song name is ambiguous, multiple matches exist, or you are unsure, return status "needs_human_review".
6. If the input is nonsense, unidentifiable, or corrupted audio file name, return status "not_found".

Output ONLY valid JSON matching this schema:
{
  "status": "match_found" | "needs_human_review" | "not_found",
  "confidence": number between 0.0 and 1.0,
  "artist": string or null,
  "title": string or null,
  "album": string or null,
  "year": integer or null,
  "genre": string or null,
  "track_number": integer or null,
  "reasoning": "short explanation"
}`;

  const userPrompt = `Analyze this music track:
Filename: ${filename || 'N/A'}
Current Title: ${title || 'N/A'}
Current Artist: ${artist || 'N/A'}
Current Album: ${album || 'N/A'}`;

  try {
    const rawContent = await callMistralApi(apiKey, model, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], true);

    const result = JSON.parse(rawContent);

    // Sanitize hallucinated or corrupted album titles
    let cleanedAlbum = result.album || null;
    if (cleanedAlbum && (/[†▲‡§¶·•]/.test(cleanedAlbum) || (cleanedAlbum.includes('·') && !title?.includes('·')))) {
      cleanedAlbum = result.title ? `${result.title} - Single` : null;
    }

    // Sanitize & validate genre against allowed list
    let cleanedGenre = normalizeGenre(result.genre) || (isGenreValid(result.genre) ? result.genre.trim() : null);

    return {
      status: result.status || 'needs_human_review',
      confidence: result.confidence || 0,
      artist: result.artist || null,
      title: result.title || null,
      album: cleanedAlbum,
      year: typeof result.year === 'number' ? result.year : (parseInt(result.year, 10) || null),
      genre: cleanedGenre,
      track_number: typeof result.track_number === 'number' ? result.track_number : (parseInt(result.track_number, 10) || null),
      reasoning: result.reasoning || ''
    };
  } catch (err) {
    return {
      status: 'needs_human_review',
      confidence: 0,
      artist: null,
      title: null,
      album: null,
      year: null,
      genre: null,
      track_number: null,
      reasoning: `Mistral AI error: ${err.message}`
    };
  }
}

/**
 * Uses Mistral AI to research and classify a track into an official allowed genre.
 * DO NOT send un-registered/chart genre names to the AI; force AI to research real track style.
 */
async function fetchSpecificGenre(songInfo, apiKey, model = 'mistral-small-latest') {
  if (!apiKey) return null;
  const { title, artist, album } = songInfo;

  const systemPrompt = `You are an expert musical genre classifier.
Your task is to identify and classify the exact, real musical genre for a given track based strictly on its Title, Artist, and Album.

STRICT CLASSIFICATION RULES:
1. Chart names (such as "Billboard Hot 100", "Charts", "Top 40", "Hits"), release format labels ("Single", "Compilation"), or generic labels ("Music", "Musik", "Soundtrack", "General", "Other") are NOT musical genres and are STRICTLY FORBIDDEN. Do NOT use them under any circumstances.
2. You MUST research the actual musical style, rhythm, and instrumentation of the song and artist.
3. You MUST select EXACTLY ONE genre from the following official allowed list of genres:
${ALLOWED_GENRES.join(', ')}

Return ONLY valid JSON matching this schema:
{
  "genre": "Exact Allowed Genre Name"
}`;

  const userPrompt = `Research track and select the single best matching official genre:
Title: ${title || 'Unknown'}
Artist: ${artist || 'Unknown'}
Album: ${album || 'Unknown'}`;

  try {
    const rawContent = await callMistralApi(apiKey, model, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], true);

    const result = JSON.parse(rawContent);
    if (result && result.genre) {
      const normalized = normalizeGenre(result.genre) || (isGenreValid(result.genre) ? result.genre.trim() : null);
      if (normalized) return normalized;
    }
    return null;
  } catch (err) {
    return null;
  }
}

module.exports = { testMistralKey, correctTrackInfo, fetchSpecificGenre };

