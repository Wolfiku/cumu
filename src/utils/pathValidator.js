'use strict';

const fs   = require('fs');
const path = require('path');

const AUDIO_EXTS = ['.mp3', '.m4a', '.aac', '.alac', '.mp4', '.flac', '.ogg', '.wav', '.opus'];
const COUNT_LIMIT   = 5000;  // stop counting audio files after this many
const COUNT_TIME_MS = 2000;  // ...or after this long (large NAS libraries)

const IN_DOCKER = fs.existsSync('/.dockerenv');

// Mount points of bind mounts / volumes inside the container (Linux only).
// System mounts and single-file mounts (/etc/hosts …) are not music folders.
function getDataMounts() {
  try {
    return fs.readFileSync('/proc/self/mountinfo', 'utf8')
      .split('\n')
      .map(line => (line.split(' ')[4] || '').replace(/\\040/g, ' '))
      .filter(mp => mp && mp !== '/' && !/^\/(proc|sys|dev|run|etc)(\/|$)/.test(mp))
      .filter(mp => { try { return fs.statSync(mp).isDirectory(); } catch { return false; } });
  } catch {
    return [];
  }
}

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

async function countAudioFiles(dir) {
  const deadline = Date.now() + COUNT_TIME_MS;
  let count = 0;
  let truncated = false;
  const stack = [dir];
  while (stack.length) {
    if (count >= COUNT_LIMIT || Date.now() > deadline) { truncated = true; break; }
    const current = stack.pop();
    let entries;
    try { entries = await fs.promises.readdir(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === '@eaDir' || entry.name === '#recycle') continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && AUDIO_EXTS.includes(path.extname(entry.name).toLowerCase())) count++;
    }
  }
  return { count, truncated };
}

/**
 * Checks a music folder path and explains the result in plain words.
 * Nothing is created or changed.
 *
 * status: 'ok'    — usable and contains audio files
 *         'warn'  — can be saved, but something looks off (empty, read-only, …)
 *         'error' — must not be saved
 *
 * @param {string} targetPath
 * @returns {Promise<{status:string, path?:string, message:string, details?:string,
 *           audioFiles?:number, truncated?:boolean, exists?:boolean, inDocker:boolean,
 *           suggestions:string[]}>}
 */
async function inspectMusicPath(targetPath) {
  const mounts = IN_DOCKER ? getDataMounts().filter(mp => mp !== '/app/data') : [];
  const base = { inDocker: IN_DOCKER, suggestions: mounts };
  const raw = typeof targetPath === 'string' ? targetPath.trim() : '';

  if (!raw) {
    return { ...base, status: 'error', message: 'Bitte einen Ordner angeben.' };
  }

  // A path typed without the leading slash ("volume1/music") means the folder
  // from the root, never one inside the program folder (/app in Docker)
  const absolute = path.isAbsolute(raw) ? raw : '/' + raw.replace(/^\.?[\\/]+/, '');
  const result = await inspectAbsolute(path.resolve(absolute), base, mounts);
  if (absolute !== raw && result.path) {
    result.details = [`Verwendet wird ${result.path}.`, result.details].filter(Boolean).join(' ');
  }
  return result;
}

async function inspectAbsolute(resolved, base, mounts) {
  const dockerHint = mounts.length
    ? ` Für cumu freigegeben: ${mounts.join(', ')}.`
    : ' Gib das Laufwerk im docker run / docker-compose frei, unter demselben Pfad (z. B. -v /volume1:/volume1).';

  if (IN_DOCKER && !mounts.some(mp => isInside(resolved, mp))) {
    return {
      ...base, status: 'error', path: resolved,
      message: 'Dieser Ordner ist für cumu nicht freigegeben.',
      details: 'cumu läuft im Docker-Container und sieht nur Laufwerke/Ordner, die dem Container freigegeben wurden.'
        + ' Installiere neu mit dem Installer (gibt die NAS-Laufwerke automatisch frei) oder ergänze die Freigabe.' + dockerHint,
    };
  }

  let stat = null;
  try { stat = await fs.promises.stat(resolved); } catch {}

  if (!stat) {
    return {
      ...base, status: 'warn', path: resolved, exists: false, audioFiles: 0,
      message: 'Ordner existiert noch nicht – er wird beim Speichern angelegt.',
      details: "Es liegen also noch keine Audiodateien darin. Prüfe, ob der Pfad stimmt.",
    };
  }
  if (!stat.isDirectory()) {
    return { ...base, status: 'error', path: resolved, exists: true, message: 'Das ist eine Datei, kein Ordner.' };
  }

  try {
    await fs.promises.access(resolved, fs.constants.R_OK | fs.constants.X_OK);
  } catch {
    return {
      ...base, status: 'error', path: resolved, exists: true,
      message: 'Keine Leserechte für diesen Ordner.',
      details: 'cumu darf den Ordner nicht öffnen. Prüfe die Ordnerberechtigungen auf dem Server/NAS.',
    };
  }

  let writable = true;
  try { await fs.promises.access(resolved, fs.constants.W_OK); } catch { writable = false; }

  const { count, truncated } = await countAudioFiles(resolved);
  const countText = truncated ? `mehr als ${count.toLocaleString('de-DE')}` : count.toLocaleString('de-DE');
  const writeNote = writable ? '' : ' Nur lesbar: Hochladen und Löschen über cumu ist nicht möglich.';

  if (count === 0) {
    return {
      ...base, status: 'warn', path: resolved, exists: true, writable, audioFiles: 0,
      message: 'Ordner gefunden, aber keine Audiodateien darin.',
      details: `Gesucht wurde auch in Unterordnern nach ${AUDIO_EXTS.join(', ')}.` + writeNote
        + (IN_DOCKER ? dockerHint : ''),
    };
  }

  return {
    ...base, status: writable ? 'ok' : 'warn', path: resolved, exists: true, writable,
    audioFiles: count, truncated,
    message: `${countText} Audiodatei${count === 1 && !truncated ? '' : 'en'} gefunden.`,
    details: (truncated ? 'Zählung nach kurzer Zeit abgebrochen, der Scan liest alle Dateien.' : '') + writeNote,
  };
}

/**
 * Used when saving: rejects paths inspectMusicPath marks as errors and creates
 * the folder if it does not exist yet.
 * @returns {Promise<{ ok: boolean, path?: string, error?: string, check?: object }>}
 */
async function validateMusicPath(targetPath) {
  const check = await inspectMusicPath(targetPath);
  if (check.status === 'error') {
    return { ok: false, error: [check.message, check.details].filter(Boolean).join(' '), check };
  }
  if (check.exists === false) {
    try {
      fs.mkdirSync(check.path, { recursive: true });
    } catch (err) {
      return { ok: false, error: `Ordner '${check.path}' konnte nicht angelegt werden: ${err.message}`, check };
    }
  }
  return { ok: true, path: check.path, check };
}

module.exports = { validateMusicPath, inspectMusicPath, AUDIO_EXTS };
