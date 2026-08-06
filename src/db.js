const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/cumu.db');

let db;

function getDB() {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDB() {
  const db = getDB();

  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      is_blocked INTEGER NOT NULL DEFAULT 0,
      theme TEXT NOT NULL DEFAULT 'coddy',
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS artists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      bio TEXT,
      image TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS albums (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      artist_id TEXT,
      cover TEXT,
      year INTEGER,
      genre TEXT,
      is_audiobook INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (artist_id) REFERENCES artists(id)
    );

    CREATE TABLE IF NOT EXISTS songs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      artist_id TEXT,
      album_id TEXT,
      filename TEXT NOT NULL,
      duration INTEGER DEFAULT 0,
      track_number INTEGER,
      genre TEXT,
      year INTEGER,
      is_audiobook INTEGER DEFAULT 0,
      file_size INTEGER DEFAULT 0,
      play_count INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (artist_id) REFERENCES artists(id),
      FOREIGN KEY (album_id) REFERENCES albums(id)
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      user_id TEXT NOT NULL,
      description TEXT,
      cover TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS playlist_songs (
      playlist_id TEXT NOT NULL,
      song_id TEXT NOT NULL,
      position INTEGER,
      added_at INTEGER DEFAULT (unixepoch()),
      PRIMARY KEY (playlist_id, song_id),
      FOREIGN KEY (playlist_id) REFERENCES playlists(id),
      FOREIGN KEY (song_id) REFERENCES songs(id)
    );

    CREATE TABLE IF NOT EXISTS play_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      song_id TEXT NOT NULL,
      played_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (song_id) REFERENCES songs(id)
    );

    CREATE TABLE IF NOT EXISTS library (
      user_id TEXT NOT NULL,
      song_id TEXT,
      album_id TEXT,
      artist_id TEXT,
      added_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- ── OAuth2 Tables ──────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS oauth_clients (
      id TEXT PRIMARY KEY,
      client_id TEXT UNIQUE NOT NULL,
      client_secret_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      redirect_uris TEXT NOT NULL DEFAULT '[]',
      scopes TEXT NOT NULL DEFAULT 'read',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS oauth_codes (
      code TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'read',
      expires_at INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS oauth_tokens (
      access_token TEXT PRIMARY KEY,
      refresh_token TEXT UNIQUE,
      client_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'read',
      access_expires_at INTEGER NOT NULL,
      refresh_expires_at INTEGER NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- ── User State Sync ────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS user_state (
      user_id TEXT PRIMARY KEY,
      volume REAL NOT NULL DEFAULT 1.0,
      last_song_id TEXT,
      last_position REAL NOT NULL DEFAULT 0,
      theme TEXT NOT NULL DEFAULT 'coddy',
      extra_settings TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- ── System Logs ────────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL DEFAULT 'info',
      category TEXT NOT NULL DEFAULT 'system',
      message TEXT NOT NULL,
      timestamp INTEGER DEFAULT (unixepoch())
    );
  `);

  // ── Migrations: add columns if missing ─────────────────────────────────────

  const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!userCols.includes('theme'))      db.exec("ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'coddy'");
  if (!userCols.includes('is_blocked')) db.exec("ALTER TABLE users ADD COLUMN is_blocked INTEGER NOT NULL DEFAULT 0");
  if (!userCols.includes('updated_at')) db.exec("ALTER TABLE users ADD COLUMN updated_at INTEGER DEFAULT (unixepoch())");

  const songCols = db.prepare('PRAGMA table_info(songs)').all().map(c => c.name);
  if (!songCols.includes('mime_type')) db.exec("ALTER TABLE songs ADD COLUMN mime_type TEXT");
  if (!songCols.includes('cover'))     db.exec("ALTER TABLE songs ADD COLUMN cover TEXT");

  // ── Seed built-in web client ───────────────────────────────────────────────

  const existing = db.prepare("SELECT id FROM oauth_clients WHERE client_id = 'cumu-web'").get();
  const BUILTIN_URIS = JSON.stringify([
    'http://localhost', 'http://localhost:3000', 'http://localhost:3001',
    'http://localhost:3002', 'http://127.0.0.1:3000',
    'http://127.0.0.1:3001', 'http://127.0.0.1:3002', 'BUILTIN',
  ]);
  if (!existing) {
    const { v4: uuidv4 } = require('uuid');
    const secret = 'cumu-web-secret-internal';
    const hash = bcrypt.hashSync(secret, 10);
    db.prepare(`
      INSERT INTO oauth_clients (id, client_id, client_secret_hash, name, redirect_uris, scopes)
      VALUES (?, 'cumu-web', ?, 'Cumu Web Client', ?, 'read write admin')
    `).run(uuidv4(), hash, BUILTIN_URIS);
  } else {
    // Update redirect_uris if the entry was created before this patch
    db.prepare("UPDATE oauth_clients SET redirect_uris = ? WHERE client_id = 'cumu-web'").run(BUILTIN_URIS);
  }

  return db;
}

function getConfig() {
  const db = getDB();
  const rows = db.prepare('SELECT key, value FROM config').all();
  const cfg = {};
  rows.forEach(r => {
    try { cfg[r.key] = JSON.parse(r.value); }
    catch { cfg[r.key] = r.value; }
  });
  return cfg;
}

function setConfig(key, value) {
  const db = getDB();
  db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
}

function log(level, category, message) {
  try {
    const db = getDB();
    db.prepare('INSERT INTO system_logs (level, category, message) VALUES (?, ?, ?)').run(level, category, message);
  } catch (e) {
    console.error('[cumu] log write error:', e.message);
  }
}

module.exports = { getDB, initDB, getConfig, setConfig, log };
