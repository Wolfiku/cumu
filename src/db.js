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
      theme TEXT NOT NULL DEFAULT 'standard',
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
      is_generated INTEGER DEFAULT 0,
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
      theme TEXT NOT NULL DEFAULT 'standard',
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
  if (!userCols.includes('theme'))      db.exec("ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'standard'");
  if (!userCols.includes('is_blocked')) db.exec("ALTER TABLE users ADD COLUMN is_blocked INTEGER NOT NULL DEFAULT 0");
  if (!userCols.includes('updated_at')) db.exec("ALTER TABLE users ADD COLUMN updated_at INTEGER DEFAULT (unixepoch())");

  const songCols = db.prepare('PRAGMA table_info(songs)').all().map(c => c.name);
  if (!songCols.includes('mime_type'))      db.exec("ALTER TABLE songs ADD COLUMN mime_type TEXT");
  if (!songCols.includes('cover'))          db.exec("ALTER TABLE songs ADD COLUMN cover TEXT");
  if (!songCols.includes('is_user_edited')) db.exec("ALTER TABLE songs ADD COLUMN is_user_edited INTEGER DEFAULT 0");

  const playlistCols = db.prepare('PRAGMA table_info(playlists)').all().map(c => c.name);
  if (!playlistCols.includes('is_generated')) db.exec("ALTER TABLE playlists ADD COLUMN is_generated INTEGER DEFAULT 0");

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

  // Force update all legacy theme entries to clean 'standard' theme
  try {
    db.prepare("UPDATE users SET theme = 'standard'").run();
    db.prepare("UPDATE user_state SET theme = 'standard'").run();
  } catch {}

  cleanupOrphanedAlbums(db);
  mergeDuplicateArtists(db);

  return db;
}

function cleanupOrphanedAlbums(db) {
  try {
    const orphaned = db.prepare(`
      SELECT a.* FROM albums a
      LEFT JOIN songs s ON s.album_id = a.id
      WHERE s.id IS NULL
    `).all();

    for (const emptyAlbum of orphaned) {
      if (emptyAlbum.title) {
        const activeAlbum = db.prepare(`
          SELECT a.* FROM albums a
          JOIN songs s ON s.album_id = a.id
          WHERE a.title = ? AND a.id != ?
          LIMIT 1
        `).get(emptyAlbum.title, emptyAlbum.id);

        if (activeAlbum && !activeAlbum.cover && emptyAlbum.cover) {
          db.prepare('UPDATE albums SET cover = ? WHERE id = ?').run(emptyAlbum.cover, activeAlbum.id);
        }
      }
      db.prepare('DELETE FROM albums WHERE id = ?').run(emptyAlbum.id);
    }
  } catch (err) {
    console.error('[cumu] cleanupOrphanedAlbums error:', err.message);
  }
}

function mergeDuplicateArtists(db) {
  try {
    const allArtists = db.prepare('SELECT * FROM artists ORDER BY created_at ASC').all();
    const map = new Map();

    for (const artist of allArtists) {
      const key = (artist.name || '').trim().toLowerCase();
      if (!key) continue;

      if (!map.has(key)) {
        map.set(key, artist);
      } else {
        const primary = map.get(key);
        const duplicateId = artist.id;

        if (artist.name !== primary.name && artist.name[0] === artist.name[0].toUpperCase() && primary.name[0] !== primary.name[0].toUpperCase()) {
          db.prepare('UPDATE artists SET name = ? WHERE id = ?').run(artist.name, primary.id);
          primary.name = artist.name;
        }

        db.prepare('UPDATE songs SET artist_id = ? WHERE artist_id = ?').run(primary.id, duplicateId);
        db.prepare('UPDATE albums SET artist_id = ? WHERE artist_id = ?').run(primary.id, duplicateId);
        db.prepare('DELETE FROM artists WHERE id = ?').run(duplicateId);
        console.log(`[cumu] Merged duplicate artist "${artist.name}" (${duplicateId}) into primary (${primary.id})`);
      }
    }
  } catch (err) {
    console.error('[cumu] mergeDuplicateArtists error:', err.message);
  }
}

function getOrCreateArtist(db, name) {
  if (!name || !name.trim()) return null;
  const trimmed = name.trim();

  let row = db.prepare('SELECT id, name FROM artists WHERE LOWER(TRIM(name)) = LOWER(?)').get(trimmed);
  if (row) {
    if (row.name !== trimmed && trimmed[0] === trimmed[0].toUpperCase() && row.name[0] !== row.name[0].toUpperCase()) {
      db.prepare('UPDATE artists SET name = ? WHERE id = ?').run(trimmed, row.id);
    }
    return row.id;
  }

  const { v4: uuidv4 } = require('uuid');
  const id = uuidv4();
  db.prepare('INSERT INTO artists (id, name) VALUES (?, ?)').run(id, trimmed);
  return id;
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

module.exports = { getDB, initDB, getConfig, setConfig, log, getOrCreateArtist, mergeDuplicateArtists };

