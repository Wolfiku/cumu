/**
 * src/adminCode.js
 * Admin login code: every admin/creator login must include ADMIN_LOGIN_CODE.
 *
 * The code is read from the environment (.env). If it is missing, a new code is
 * generated on startup and written to the .env file, so there is never an
 * instance where admins can log in without it:
 *   - <project>/.env if it exists (bare-metal / systemd installs)
 *   - <project>/data/.env inside Docker, where data/ is the persistent volume
 *   - otherwise a new <project>/.env is created
 * If no file can be written, the code is kept in memory and printed to the log.
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

const ENV_KEY      = 'ADMIN_LOGIN_CODE';
const PROJECT_ENV  = path.join(__dirname, '../.env');
const DATA_ENV     = path.join(__dirname, '../data/.env');
const ADMIN_ROLES  = ['admin', 'creator'];

let adminCode = null;

function isAdminRole(role) {
  return ADMIN_ROLES.includes(role);
}

function generateCode() {
  // 4 groups of 4 chars, without easily confused characters (0/O, 1/I/L)
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(16);
  let code = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) code += '-';
    code += alphabet[bytes[i] % alphabet.length];
  }
  return code;
}

function writeCodeToEnv(file, code) {
  const content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const line = `${ENV_KEY}=${code}`;
  const pattern = new RegExp(`^\\s*${ENV_KEY}\\s*=.*$`, 'm');
  let next;
  if (pattern.test(content)) {
    next = content.replace(pattern, line);
  } else {
    next = content + (content && !content.endsWith('\n') ? '\n' : '') + line + '\n';
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, next, { mode: 0o600 });
}

/**
 * Load the admin code, generating and persisting one if it is missing.
 * Must run once on startup before any request is handled.
 */
function initAdminCode() {
  // server.js loads .env from the working directory; also load the project
  // .env and data/.env (where the code generated inside Docker lives).
  // Values that are already set take precedence.
  for (const file of [PROJECT_ENV, DATA_ENV]) {
    if (fs.existsSync(file)) dotenv.config({ path: file });
  }

  const fromEnv = (process.env[ENV_KEY] || '').trim();
  if (fromEnv) {
    adminCode = fromEnv;
    return adminCode;
  }

  adminCode = generateCode();
  process.env[ENV_KEY] = adminCode;

  const inDocker = fs.existsSync('/.dockerenv');
  const target = fs.existsSync(PROJECT_ENV) || !inDocker ? PROJECT_ENV : DATA_ENV;
  try {
    writeCodeToEnv(target, adminCode);
    console.log(`[cumu] ${ENV_KEY} was missing — generated a new admin login code and saved it to ${target}`);
  } catch (err) {
    console.error(`[cumu] Could not write ${ENV_KEY} to ${target}: ${err.message}`);
    console.error(`[cumu] Using a temporary admin login code until restart: ${adminCode}`);
    console.error(`[cumu] Set ${ENV_KEY} in your .env to make it permanent.`);
  }
  return adminCode;
}

function hashCode(code) {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest();
}

/** Constant-time comparison of a submitted code against ADMIN_LOGIN_CODE. */
function verifyAdminCode(submitted) {
  if (!adminCode) throw new Error('Admin login code not initialised');
  if (typeof submitted !== 'string' || !submitted) return false;
  return crypto.timingSafeEqual(hashCode(submitted), hashCode(adminCode));
}

/**
 * Fingerprint of the current code. Stored with admin sessions and tokens, so
 * changing ADMIN_LOGIN_CODE logs out every admin.
 */
function adminCodeFingerprint() {
  if (!adminCode) throw new Error('Admin login code not initialised');
  return crypto.createHmac('sha256', 'cumu-admin-code').update(hashCode(adminCode)).digest('hex').slice(0, 32);
}

/** True if a session/token of a user with `role` carrying `fingerprint` is valid. */
function adminCodeValid(role, fingerprint) {
  return !isAdminRole(role) || fingerprint === adminCodeFingerprint();
}

/**
 * Check the admin code for a login of `user`.
 * Returns null when the login may proceed, otherwise { code, message }.
 * Non-admin users never need the code.
 */
function adminCodeError(user, submitted) {
  if (!isAdminRole(user.role)) return null;
  if (!submitted) {
    return { code: 'admin_code_required', message: 'Admin login code required' };
  }
  if (!verifyAdminCode(submitted)) {
    return { code: 'admin_code_invalid', message: 'Invalid admin login code' };
  }
  return null;
}

module.exports = {
  initAdminCode, verifyAdminCode, adminCodeError, adminCodeFingerprint, adminCodeValid, isAdminRole, ENV_KEY,
};
