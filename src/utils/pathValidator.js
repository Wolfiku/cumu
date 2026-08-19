'use strict';

const fs   = require('fs');
const path = require('path');

/**
 * Validates whether a music directory path:
 * 1. Is a valid non-empty string.
 * 2. Exists or can be created via recursive mkdir.
 * 3. Has READ permissions (R_OK).
 * 4. Has WRITE permissions (can create and delete a test file).
 *
 * @param {string} targetPath
 * @returns {{ ok: boolean, path?: string, error?: string }}
 */
function validateMusicPath(targetPath) {
  if (!targetPath || typeof targetPath !== 'string' || !targetPath.trim()) {
    return { ok: false, error: 'Musik-Pfad darf nicht leer sein.' };
  }

  const resolved = path.resolve(targetPath.trim());

  // 1. Ensure directory exists or can be created
  try {
    if (!fs.existsSync(resolved)) {
      fs.mkdirSync(resolved, { recursive: true });
    }
  } catch (err) {
    return {
      ok: false,
      error: `Ordner '${resolved}' konnte nicht erstellt werden: ${err.message || 'Zugriff verweigert'}. Bitte erstelle den Ordner auf dem Server oder wähle einen gültigen Pfad.`
    };
  }

  // 2. Check read permission
  try {
    fs.accessSync(resolved, fs.constants.R_OK);
  } catch (err) {
    return {
      ok: false,
      error: `Keine Leserechte für den Pfad '${resolved}' (Permission Denied). Bitte überprüfe die Ordner-Berechtigungen.`
    };
  }

  // 3. Check write permission by attempting to write and remove a temporary test file
  const testFile = path.join(resolved, `.cumu_test_perm_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  try {
    fs.writeFileSync(testFile, 'cumu_permission_test');
    fs.unlinkSync(testFile);
  } catch (err) {
    return {
      ok: false,
      error: `Keine Schreibrechte für den Pfad '${resolved}' (Permission Denied). Der Server konnte in diesem Ordner keine Dateien anlegen.`
    };
  }

  return { ok: true, path: resolved };
}

module.exports = { validateMusicPath };
