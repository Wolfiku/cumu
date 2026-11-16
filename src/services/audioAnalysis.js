/**
 * src/services/audioAnalysis.js
 * Background analysis of every music track, for the players:
 *
 *   intro_silence_ms / outro_silence_ms  silence at the start / end of the
 *                                        file ("void skipping")
 *   loudness_lufs, peak_db               integrated loudness (EBU R128) and
 *                                        true peak
 *   loudness_gain_db                     gain that brings the track to the
 *                                        target loudness without clipping
 *                                        ("normalize volume")
 *
 * Uses ffmpeg (silencedetect + ebur128) when it is installed. Without
 * ffmpeg only ReplayGain tags are read (no silence detection).
 * One track at a time, paused while a library scan or upload runs.
 * Audiobook chapters are skipped: they play as they are.
 */

'use strict';

const { spawn, spawnSync } = require('child_process');
// Lazy: db.js itself calls initAnalysisColumns() while it loads
const getDB = () => require('../db').getDB();

const ANALYSIS_VERSION = 1;
const TARGET_LUFS = -14;          // loudness every track is brought to
const MAX_BOOST_DB = 8;
const MAX_CUT_DB = -15;
const SILENCE_NOISE_DB = -50;     // below this counts as silence
const SILENCE_MIN_S = 0.3;
const FFMPEG_TIMEOUT_MS = 180000;

let ffmpegAvailable = null;
let running = false;
let timer = null;
let isBusy = () => false;
let findFile = () => null;
const status = { total: 0, done: 0, current: null, ffmpeg: null, lastError: null };

function hasFfmpeg() {
  if (ffmpegAvailable === null) {
    try {
      ffmpegAvailable = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore', timeout: 10000 }).status === 0;
    } catch {
      ffmpegAvailable = false;
    }
    status.ffmpeg = ffmpegAvailable;
    if (!ffmpegAvailable) console.log('[cumu] ffmpeg not found: volume normalization uses ReplayGain tags only, silence skipping is unavailable.');
  }
  return ffmpegAvailable;
}

function initAnalysisColumns(db) {
  const cols = db.prepare('PRAGMA table_info(songs)').all().map(c => c.name);
  const add = (name, type) => { if (!cols.includes(name)) db.exec(`ALTER TABLE songs ADD COLUMN ${name} ${type}`); };
  add('intro_silence_ms', 'INTEGER');
  add('outro_silence_ms', 'INTEGER');
  add('loudness_lufs', 'REAL');
  add('peak_db', 'REAL');
  add('loudness_gain_db', 'REAL');
  add('analysis_version', 'INTEGER');
  db.exec('CREATE INDEX IF NOT EXISTS idx_songs_analysis ON songs(analysis_version)');
}

/** Gain (dB) to reach the target loudness, limited so the peak stays below -1 dBTP. */
function gainFor(lufs, peakDb) {
  if (!Number.isFinite(lufs) || lufs < -70) return null;
  let gain = TARGET_LUFS - lufs;
  if (Number.isFinite(peakDb)) gain = Math.min(gain, -1 - peakDb);
  gain = Math.max(MAX_CUT_DB, Math.min(MAX_BOOST_DB, gain));
  return Math.round(gain * 100) / 100;
}

/** Parses ffmpeg's stderr of a silencedetect + ebur128 run. */
function parseFfmpegOutput(text) {
  const durMatch = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const duration = durMatch ? (+durMatch[1]) * 3600 + (+durMatch[2]) * 60 + parseFloat(durMatch[3]) : null;

  const silences = [];
  let open = null;
  for (const line of text.split('\n')) {
    let m = line.match(/silence_start:\s*(-?\d+(?:\.\d+)?)/);
    if (m) { open = { start: Math.max(0, parseFloat(m[1])), end: null }; silences.push(open); continue; }
    m = line.match(/silence_end:\s*(-?\d+(?:\.\d+)?)/);
    if (m && open) { open.end = parseFloat(m[1]); open = null; }
  }

  let intro = 0;
  let outro = 0;
  if (duration) {
    const first = silences[0];
    if (first && first.start <= 0.05 && first.end !== null) intro = first.end;
    const last = silences[silences.length - 1];
    if (last && (last.end === null || last.end >= duration - 0.15) && last.start > 0.05) outro = duration - last.start;
    // A file that is (almost) all silence, or odd values: leave it alone
    if (intro + outro > duration * 0.6) { intro = 0; outro = 0; }
  }

  // Summary block of ebur128 at the end
  const summary = text.slice(text.lastIndexOf('Summary:'));
  const iMatch = summary.match(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/);
  const pMatch = summary.match(/Peak:\s*(-?(?:\d+(?:\.\d+)?|inf))\s*dBFS/);
  const lufs = iMatch ? parseFloat(iMatch[1]) : null;
  const peak = pMatch && pMatch[1] !== '-inf' ? parseFloat(pMatch[1]) : null;

  return {
    duration,
    introMs: Math.round(intro * 1000),
    outroMs: Math.round(outro * 1000),
    lufs: Number.isFinite(lufs) ? lufs : null,
    peak: Number.isFinite(peak) ? peak : null,
  };
}

function runFfmpeg(file) {
  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner', '-nostats', '-nostdin', '-i', file, '-map', '0:a:0', '-vn',
      '-af', `silencedetect=noise=${SILENCE_NOISE_DB}dB:d=${SILENCE_MIN_S},ebur128=peak=true:framelog=quiet`,
      '-f', 'null', '-',
    ];
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', d => {
      err += d.toString();
      if (err.length > 4_000_000) err = err.slice(-1_000_000); // keep the end (summary)
    });
    const killTimer = setTimeout(() => { child.kill('SIGKILL'); }, FFMPEG_TIMEOUT_MS);
    child.on('error', e => { clearTimeout(killTimer); reject(e); });
    child.on('close', code => {
      clearTimeout(killTimer);
      if (code !== 0 && !err.includes('Summary:')) return reject(new Error(`ffmpeg exit ${code}`));
      resolve(parseFfmpegOutput(err));
    });
  });
}

/** ReplayGain tags (fallback without ffmpeg). Tags refer to -18 LUFS. */
async function readReplayGain(file) {
  try {
    const mm = require('music-metadata');
    const meta = await mm.parseFile(file, { duration: false, skipCovers: true });
    const rg = meta.common.replaygain_track_gain;
    const rgPeak = meta.common.replaygain_track_peak;
    if (!rg || !Number.isFinite(rg.dB)) return null;
    const peak = rgPeak && rgPeak.ratio > 0 ? 20 * Math.log10(rgPeak.ratio) : null;
    return { lufs: -18 - rg.dB, peak };
  } catch {
    return null;
  }
}

async function analyzeSong(db, song) {
  const file = findFile(song.filename);
  const save = db.prepare(`UPDATE songs SET intro_silence_ms = ?, outro_silence_ms = ?, loudness_lufs = ?, peak_db = ?,
    loudness_gain_db = ?, analysis_version = ? WHERE id = ?`);
  if (!file) {
    // File not reachable right now: try again with the next version run
    save.run(null, null, null, null, null, -ANALYSIS_VERSION, song.id);
    return;
  }
  let r = null;
  if (hasFfmpeg()) {
    try { r = await runFfmpeg(file); } catch (e) { status.lastError = e.message; }
  }
  if (!r || r.lufs === null) {
    const rg = await readReplayGain(file);
    r = { ...(r || { introMs: null, outroMs: null }), ...(rg || { lufs: null, peak: null }) };
  }
  save.run(r.introMs ?? null, r.outroMs ?? null, r.lufs, r.peak, gainFor(r.lufs, r.peak), ANALYSIS_VERSION, song.id);
}

async function runQueue() {
  if (running) return;
  running = true;
  try {
    const db = getDB();
    // Audiobook chapters play unchanged
    db.prepare('UPDATE songs SET analysis_version = ? WHERE is_audiobook = 1 AND analysis_version IS NULL').run(ANALYSIS_VERSION);
    const pending = db.prepare(`SELECT id, filename FROM songs
      WHERE COALESCE(is_audiobook, 0) = 0 AND (analysis_version IS NULL OR analysis_version < ?) AND COALESCE(analysis_version, 0) >= 0
      ORDER BY play_count DESC, created_at DESC`);
    const tried = new Set(); // never loop on a track whose result cannot be saved
    const next = () => pending.all(ANALYSIS_VERSION).filter(r => !tried.has(r.id));
    let rows = next();
    status.total = rows.length;
    status.done = 0;
    if (rows.length) console.log(`[cumu] Audio analysis: ${rows.length} track(s) to analyse (silence & loudness).`);
    while (rows.length) {
      for (const song of rows) {
        while (isBusy()) await new Promise(r => setTimeout(r, 15000));
        status.current = song.id;
        tried.add(song.id);
        try { await analyzeSong(db, song); } catch (e) { status.lastError = e.message; }
        status.done++;
        // Leave the CPU to playback on small servers
        await new Promise(r => setTimeout(r, 150));
      }
      rows = next();
      status.total += rows.length;
    }
    if (status.total) console.log(`[cumu] Audio analysis finished (${status.done} track(s)).`);
  } catch (e) {
    console.error('[cumu] Audio analysis error:', e.message);
  } finally {
    status.current = null;
    running = false;
  }
}

/**
 * Starts the analysis now and checks for new tracks every 10 minutes.
 * opts.isBusy(): true while a scan / upload runs. opts.findFile(name): path.
 */
function startAudioAnalysis(opts = {}) {
  if (opts.isBusy) isBusy = opts.isBusy;
  if (opts.findFile) findFile = opts.findFile;
  try { initAnalysisColumns(getDB()); } catch (e) { console.error('[cumu] Audio analysis setup error:', e.message); return; }
  hasFfmpeg();
  // Files that were missing get another chance on every start
  try { getDB().prepare('UPDATE songs SET analysis_version = NULL WHERE analysis_version < 0').run(); } catch (_) {}
  runQueue();
  clearInterval(timer);
  timer = setInterval(runQueue, 10 * 60 * 1000);
  timer.unref?.();
}

/** Analyses new tracks soon (after a scan or upload). */
function queueAnalysis() {
  setTimeout(runQueue, 5000).unref?.();
}

function analysisStatus() {
  return { ...status, running };
}

module.exports = { startAudioAnalysis, queueAnalysis, analysisStatus, initAnalysisColumns, parseFfmpegOutput, gainFor };
