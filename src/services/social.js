/**
 * src/services/social.js
 * Privacy settings, blocked users and things users send each other.
 *
 * Privacy (per user, all on by default except where noted):
 *   allow_invites     others may invite me to their playlists
 *   allow_shares      others may send me songs, albums, playlists ...
 *   discoverable      my name is suggested when others type a name
 *   show_name_public  my name is shown on my public playlists
 *   count_in_stats    my plays count for server-wide numbers ("most played",
 *                     autoplay popularity); my own history is kept anyway
 *
 * Blocking a user hides each from the other: no invitations, no shares, no
 * name suggestions, and existing invitations between both are removed.
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

const PRIVACY_KEYS = ['allow_invites', 'allow_shares', 'discoverable', 'show_name_public', 'count_in_stats'];
const ITEM_TYPES = ['song', 'album', 'artist', 'playlist', 'audiobook'];

function initSocial(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_privacy (
      user_id          TEXT PRIMARY KEY,
      allow_invites    INTEGER NOT NULL DEFAULT 1,
      allow_shares     INTEGER NOT NULL DEFAULT 1,
      discoverable     INTEGER NOT NULL DEFAULT 1,
      show_name_public INTEGER NOT NULL DEFAULT 1,
      count_in_stats   INTEGER NOT NULL DEFAULT 1,
      updated_at       INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS user_blocks (
      user_id    TEXT NOT NULL,
      blocked_id TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      PRIMARY KEY (user_id, blocked_id)
    );
    CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_id);
    CREATE TABLE IF NOT EXISTS shares (
      id         TEXT PRIMARY KEY,
      from_user  TEXT NOT NULL,
      to_user    TEXT NOT NULL,
      item_type  TEXT NOT NULL,
      item_id    TEXT NOT NULL,
      message    TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      read_at    INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_shares_to ON shares(to_user, created_at);
  `);
}

// ── Privacy ─────────────────────────────────────────────────────────────────

function getPrivacy(db, userId) {
  const row = db.prepare('SELECT * FROM user_privacy WHERE user_id = ?').get(userId);
  const out = {};
  for (const k of PRIVACY_KEYS) out[k] = row ? row[k] === 1 : true;
  return out;
}

function setPrivacy(db, userId, changes) {
  const cur = getPrivacy(db, userId);
  for (const k of PRIVACY_KEYS) if (typeof changes[k] === 'boolean') cur[k] = changes[k];
  db.prepare(`INSERT INTO user_privacy (user_id, ${PRIVACY_KEYS.join(', ')}, updated_at)
    VALUES (?, ${PRIVACY_KEYS.map(() => '?').join(', ')}, unixepoch())
    ON CONFLICT(user_id) DO UPDATE SET ${PRIVACY_KEYS.map(k => `${k} = excluded.${k}`).join(', ')}, updated_at = unixepoch()`)
    .run(userId, ...PRIVACY_KEYS.map(k => (cur[k] ? 1 : 0)));
  return cur;
}

// ── Blocking ────────────────────────────────────────────────────────────────

/** True when one of both blocked the other. */
function isBlocked(db, a, b) {
  return !!db.prepare('SELECT 1 FROM user_blocks WHERE (user_id = ? AND blocked_id = ?) OR (user_id = ? AND blocked_id = ?)').get(a, b, b, a);
}

function blockUser(db, userId, blockedId) {
  db.prepare('INSERT OR IGNORE INTO user_blocks (user_id, blocked_id) VALUES (?, ?)').run(userId, blockedId);
  // Remove invitations in both directions and what the blocked user sent
  db.prepare('DELETE FROM playlist_members WHERE user_id = ? AND playlist_id IN (SELECT id FROM playlists WHERE user_id = ?)').run(blockedId, userId);
  db.prepare('DELETE FROM playlist_members WHERE user_id = ? AND playlist_id IN (SELECT id FROM playlists WHERE user_id = ?)').run(userId, blockedId);
  db.prepare('DELETE FROM shares WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?)').run(blockedId, userId, userId, blockedId);
}

function unblockUser(db, userId, blockedId) {
  db.prepare('DELETE FROM user_blocks WHERE user_id = ? AND blocked_id = ?').run(userId, blockedId);
}

function blockedUsers(db, userId) {
  return db.prepare(`SELECT b.blocked_id AS user_id, u.username, b.created_at FROM user_blocks b
    JOIN users u ON u.id = b.blocked_id WHERE b.user_id = ? ORDER BY u.username COLLATE NOCASE`).all(userId);
}

/** Name suggestions while typing (discoverable users, not blocked either way). */
function suggestUsers(db, userId, q, limit = 8) {
  const term = String(q || '').trim().toLowerCase();
  if (term.length < 1) return [];
  return db.prepare(`
    SELECT u.id AS user_id, u.username FROM users u
    LEFT JOIN user_privacy p ON p.user_id = u.id
    WHERE u.id != @me AND COALESCE(u.is_blocked, 0) = 0 AND COALESCE(p.discoverable, 1) = 1
      AND LOWER(u.username) LIKE @like
      AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.user_id = @me AND b.blocked_id = u.id) OR (b.user_id = u.id AND b.blocked_id = @me))
    ORDER BY (LOWER(u.username) LIKE @prefix) DESC, u.username COLLATE NOCASE
    LIMIT @limit
  `).all({ me: userId, like: `%${term}%`, prefix: `${term}%`, limit });
}

/** Finds a user by exact name (case-insensitive). */
function userByName(db, username) {
  return db.prepare('SELECT id, username, is_blocked FROM users WHERE username = ? COLLATE NOCASE').get(String(username || '').trim());
}

/**
 * Whether `fromId` may invite `toUser` to a playlist / send them something.
 * Returns null when allowed, else a message. Blocks are reported like a
 * declined setting, so nobody learns that they were blocked.
 */
function refusal(db, fromId, toUser, kind) {
  if (!toUser || toUser.is_blocked) return 'Diesen Nutzer gibt es auf diesem Server nicht';
  if (toUser.id === fromId) return kind === 'invite' ? 'Das ist deine eigene Playlist' : 'Du kannst dir nichts selbst schicken';
  const p = getPrivacy(db, toUser.id);
  const allowed = kind === 'invite' ? p.allow_invites : p.allow_shares;
  if (!allowed || isBlocked(db, fromId, toUser.id)) {
    return kind === 'invite' ? `${toUser.username} nimmt keine Einladungen zu Playlists an` : `${toUser.username} empfängt keine geteilten Inhalte`;
  }
  return null;
}

// ── Shares ──────────────────────────────────────────────────────────────────

/** Title, subtitle and cover of a shared item, or null when it is gone / not visible to `viewerId`. */
function itemInfo(db, type, id, viewerId) {
  if (type === 'song') {
    const s = db.prepare(`SELECT s.id, s.title, ar.name AS artist_name, al.title AS album_title, COALESCE(al.cover, s.cover) AS cover, s.is_audiobook
      FROM songs s LEFT JOIN artists ar ON ar.id = s.artist_id LEFT JOIN albums al ON al.id = s.album_id WHERE s.id = ?`).get(id);
    return s && { title: s.title, subtitle: [s.artist_name, s.album_title].filter(Boolean).join(' · '), cover: s.cover };
  }
  if (type === 'album') {
    const a = db.prepare('SELECT al.id, al.title, al.cover, ar.name AS artist_name FROM albums al LEFT JOIN artists ar ON ar.id = al.artist_id WHERE al.id = ?').get(id);
    return a && { title: a.title, subtitle: a.artist_name || 'Album', cover: a.cover };
  }
  if (type === 'artist') {
    const a = db.prepare('SELECT id, name, image FROM artists WHERE id = ?').get(id);
    return a && { title: a.name, subtitle: 'Künstler', cover: a.image };
  }
  if (type === 'audiobook') {
    const book = require('./audiobooks').getBook(db, id, viewerId);
    return book && { title: book.title, subtitle: book.artist_name || 'Hörbuch', cover: book.cover };
  }
  if (type === 'playlist') {
    const sharing = require('./playlistSharing');
    const pl = db.prepare('SELECT * FROM playlists WHERE id = ?').get(id);
    if (!pl || !sharing.accessOf(db, pl, viewerId).canView) return null;
    const cover = db.prepare(`SELECT COALESCE(al.cover, s.cover) AS cover FROM playlist_songs ps JOIN songs s ON s.id = ps.song_id
      LEFT JOIN albums al ON al.id = s.album_id WHERE ps.playlist_id = ? AND COALESCE(al.cover, s.cover) IS NOT NULL ORDER BY ps.position LIMIT 1`).get(id);
    const n = db.prepare('SELECT COUNT(*) AS n FROM playlist_songs WHERE playlist_id = ?').get(id).n;
    return { title: pl.name, subtitle: `Playlist · ${n} ${n === 1 ? 'Titel' : 'Titel'}`, cover: pl.cover || (cover && cover.cover) || null };
  }
  return null;
}

/**
 * Sends an item. Returns { share } or { error, status }.
 * A private playlist can only be sent once the recipient may open it.
 */
function createShare(db, fromId, toUsername, type, itemId, message) {
  if (!ITEM_TYPES.includes(type)) return { error: 'Unbekannter Typ', status: 400 };
  const to = userByName(db, toUsername);
  const why = refusal(db, fromId, to, 'share');
  if (why) return { error: why, status: to && !to.is_blocked ? 403 : 404 };
  if (!itemInfo(db, type, itemId, fromId)) return { error: 'Nicht gefunden', status: 404 };
  if (type === 'playlist' && !itemInfo(db, type, itemId, to.id)) {
    return { error: `${to.username} kann diese Playlist nicht öffnen. Mach sie öffentlich oder lade ${to.username} ein.`, status: 400, needsAccess: true };
  }
  const id = uuidv4();
  const text = message ? String(message).trim().slice(0, 500) : null;
  db.prepare('INSERT INTO shares (id, from_user, to_user, item_type, item_id, message) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, fromId, to.id, type, itemId, text || null);
  return { share: { id, to_user: to.id, to_username: to.username }, toUserId: to.id };
}

function inbox(db, userId, limit = 100) {
  const rows = db.prepare(`SELECT sh.*, u.username AS from_username FROM shares sh JOIN users u ON u.id = sh.from_user
    WHERE sh.to_user = ? ORDER BY sh.created_at DESC LIMIT ?`).all(userId, limit);
  return rows
    .filter(r => !isBlocked(db, userId, r.from_user))
    .map(r => {
      const info = itemInfo(db, r.item_type, r.item_id, userId);
      return {
        id: r.id, from_user: r.from_user, from_username: r.from_username,
        item_type: r.item_type, item_id: r.item_id, message: r.message,
        created_at: r.created_at, read: !!r.read_at,
        available: !!info, title: info ? info.title : 'Nicht mehr verfügbar',
        subtitle: info ? info.subtitle : '', cover: info ? info.cover : null,
      };
    });
}

function unreadCount(db, userId) {
  return db.prepare(`SELECT COUNT(*) AS n FROM shares sh WHERE sh.to_user = ? AND sh.read_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE b.user_id = ? AND b.blocked_id = sh.from_user)`).get(userId, userId).n;
}

function markRead(db, userId, shareId) {
  if (shareId === 'all') db.prepare('UPDATE shares SET read_at = unixepoch() WHERE to_user = ? AND read_at IS NULL').run(userId);
  else db.prepare('UPDATE shares SET read_at = COALESCE(read_at, unixepoch()) WHERE id = ? AND to_user = ?').run(shareId, userId);
}

function deleteShare(db, userId, shareId) {
  db.prepare('DELETE FROM shares WHERE id = ? AND to_user = ?').run(shareId, userId);
}

function forgetUser(db, userId) {
  db.prepare('DELETE FROM user_privacy WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM user_blocks WHERE user_id = ? OR blocked_id = ?').run(userId, userId);
  db.prepare('DELETE FROM shares WHERE from_user = ? OR to_user = ?').run(userId, userId);
}

module.exports = {
  PRIVACY_KEYS, ITEM_TYPES, initSocial, getPrivacy, setPrivacy, isBlocked, blockUser, unblockUser, blockedUsers,
  suggestUsers, userByName, refusal, itemInfo, createShare, inbox, unreadCount, markRead, deleteShare, forgetUser,
};
