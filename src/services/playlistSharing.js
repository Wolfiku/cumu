/**
 * src/services/playlistSharing.js
 * Who may see and change a playlist (within this cumu instance).
 *
 * visibility:
 *   'private'  only the owner (default; every new playlist starts private)
 *   'public'   everyone can find it, save it to their library, download and
 *              listen; only the owner (and invited editors) change it
 *   'shared'   only the owner and the users the owner invited by user name;
 *              each invited user is a listener or may also edit
 *
 * Invited users keep their invitation when the owner switches between
 * 'shared' and 'public'; 'private' hides the playlist from all of them.
 * Playlists cumu generates itself stay private.
 */

'use strict';

const VISIBILITIES = ['private', 'public', 'shared'];

function initPlaylistSharing(db) {
  const cols = db.prepare('PRAGMA table_info(playlists)').all().map(c => c.name);
  if (!cols.includes('visibility')) db.exec("ALTER TABLE playlists ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'");
  if (!cols.includes('updated_at')) db.exec('ALTER TABLE playlists ADD COLUMN updated_at INTEGER');
  const psCols = db.prepare('PRAGMA table_info(playlist_songs)').all().map(c => c.name);
  // Who added a song (shown in playlists several people edit)
  if (!psCols.includes('added_by')) db.exec('ALTER TABLE playlist_songs ADD COLUMN added_by TEXT');
  db.exec(`
    CREATE TABLE IF NOT EXISTS playlist_members (
      playlist_id TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      can_edit    INTEGER NOT NULL DEFAULT 0,
      added_by    TEXT,
      added_at    INTEGER DEFAULT (unixepoch()),
      PRIMARY KEY (playlist_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_playlist_members_user ON playlist_members(user_id);

    CREATE TABLE IF NOT EXISTS playlist_saves (
      user_id     TEXT NOT NULL,
      playlist_id TEXT NOT NULL,
      saved_at    INTEGER DEFAULT (unixepoch()),
      PRIMARY KEY (user_id, playlist_id)
    );
    CREATE INDEX IF NOT EXISTS idx_playlist_saves_pl ON playlist_saves(playlist_id);
    CREATE INDEX IF NOT EXISTS idx_playlists_visibility ON playlists(visibility);
  `);
}

const isGenerated = (pl) => pl.is_generated === 1 || !!(pl.description && pl.description.includes('[dynamic:'));

/**
 * The user's rights on a playlist:
 * role 'owner' | 'editor' | 'listener' (invited) | 'public' (anyone) | null (no access)
 */
function accessOf(db, pl, userId) {
  if (!pl) return { role: null, canView: false, canEdit: false, saved: false };
  const saved = !!db.prepare('SELECT 1 FROM playlist_saves WHERE user_id = ? AND playlist_id = ?').get(userId, pl.id);
  if (pl.user_id === userId) return { role: 'owner', canView: true, canEdit: !isGenerated(pl), saved: false };
  const vis = pl.visibility || 'private';
  if (vis === 'private') return { role: null, canView: false, canEdit: false, saved };
  // Blocked (either way): the playlist does not exist for the other one
  if (db.prepare('SELECT 1 FROM user_blocks WHERE (user_id = ? AND blocked_id = ?) OR (user_id = ? AND blocked_id = ?)').get(userId, pl.user_id, pl.user_id, userId)) {
    return { role: null, canView: false, canEdit: false, saved };
  }
  const m = db.prepare('SELECT can_edit FROM playlist_members WHERE playlist_id = ? AND user_id = ?').get(pl.id, userId);
  if (m) return { role: m.can_edit ? 'editor' : 'listener', canView: true, canEdit: !!m.can_edit, saved };
  if (vis === 'public') return { role: 'public', canView: true, canEdit: false, saved };
  return { role: null, canView: false, canEdit: false, saved };
}

/** Sharing fields every playlist answer carries. */
function decorate(db, pl, userId, access) {
  const a = access || accessOf(db, pl, userId);
  const owner = db.prepare('SELECT username FROM users WHERE id = ?').get(pl.user_id);
  // Privacy: owners may hide their name on public playlists (invited people still see it)
  const hideName = a.role === 'public' && !showsName(db, pl.user_id);
  const counts = db.prepare(`SELECT
      (SELECT COUNT(*) FROM playlist_members WHERE playlist_id = ?) AS members,
      (SELECT COUNT(*) FROM playlist_saves WHERE playlist_id = ?) AS saves`).get(pl.id, pl.id);
  return {
    ...pl,
    visibility: pl.visibility || 'private',
    owner_id: pl.user_id,
    owner_username: owner && !hideName ? owner.username : null,
    access: a.role,
    is_owner: a.role === 'owner' ? 1 : 0,
    can_edit: a.canEdit ? 1 : 0,
    saved: a.saved ? 1 : 0,
    member_count: counts.members,
    save_count: counts.saves,
  };
}

/**
 * Every playlist in the user's library: their own, the ones shared with
 * them, and public ones they saved. Owner first, then by name.
 */
function libraryPlaylistRows(db, userId) {
  return db.prepare(`
    SELECT DISTINCT p.* FROM playlists p
    WHERE p.user_id = @u
       OR (p.visibility IN ('shared', 'public') AND p.id IN (SELECT playlist_id FROM playlist_members WHERE user_id = @u))
       OR (p.visibility = 'public' AND p.id IN (SELECT playlist_id FROM playlist_saves WHERE user_id = @u))
    ORDER BY (p.user_id = @u) DESC, p.created_at DESC
  `).all({ u: userId });
}

/** Playlists the user may open (for the search): library + every public one. */
function visiblePlaylistRows(db, userId) {
  return db.prepare(`
    SELECT DISTINCT p.* FROM playlists p
    WHERE p.user_id = @u OR (
      (p.visibility = 'public'
        OR (p.visibility = 'shared' AND p.id IN (SELECT playlist_id FROM playlist_members WHERE user_id = @u)))
      AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.user_id = @u AND b.blocked_id = p.user_id) OR (b.user_id = p.user_id AND b.blocked_id = @u)))
  `).all({ u: userId });
}

function showsName(db, userId) {
  const row = db.prepare('SELECT show_name_public FROM user_privacy WHERE user_id = ?').get(userId);
  return !row || row.show_name_public === 1;
}

/** Public playlists of other users, most saved first (optionally filtered by name). */
function discoverPublic(db, userId, q, limit = 30) {
  const like = q ? `%${String(q).trim().toLowerCase()}%` : null;
  return db.prepare(`
    SELECT p.*, CASE WHEN COALESCE(pv.show_name_public, 1) = 1 THEN u.username ELSE NULL END AS owner_username,
      (SELECT COUNT(*) FROM playlist_saves s WHERE s.playlist_id = p.id) AS save_count,
      (SELECT COUNT(*) FROM playlist_songs ps WHERE ps.playlist_id = p.id) AS song_count
    FROM playlists p JOIN users u ON u.id = p.user_id
    LEFT JOIN user_privacy pv ON pv.user_id = p.user_id
    WHERE p.visibility = 'public' AND p.user_id != @u
      -- blocked either way: hidden
      AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.user_id = @u AND b.blocked_id = p.user_id) OR (b.user_id = p.user_id AND b.blocked_id = @u))
      ${like ? "AND (LOWER(p.name) LIKE @like OR LOWER(COALESCE(p.description, '')) LIKE @like OR (COALESCE(pv.show_name_public, 1) = 1 AND LOWER(u.username) LIKE @like))" : ''}
      AND EXISTS (SELECT 1 FROM playlist_songs ps WHERE ps.playlist_id = p.id)
    ORDER BY save_count DESC, COALESCE(p.updated_at, p.created_at) DESC
    LIMIT @limit
  `).all({ u: userId, like, limit });
}

function members(db, playlistId) {
  return db.prepare(`
    SELECT m.user_id, u.username, m.can_edit, m.added_at
    FROM playlist_members m JOIN users u ON u.id = m.user_id
    WHERE m.playlist_id = ? ORDER BY u.username COLLATE NOCASE
  `).all(playlistId);
}

function touch(db, playlistId) {
  db.prepare('UPDATE playlists SET updated_at = unixepoch() WHERE id = ?').run(playlistId);
}

/** Removes everything that points at a deleted playlist. */
function forgetPlaylist(db, playlistId) {
  db.prepare('DELETE FROM playlist_members WHERE playlist_id = ?').run(playlistId);
  db.prepare('DELETE FROM playlist_saves WHERE playlist_id = ?').run(playlistId);
}

/** Removes a deleted user's invitations and saved playlists. */
function forgetUser(db, userId) {
  db.prepare('DELETE FROM playlist_members WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM playlist_saves WHERE user_id = ?').run(userId);
}

module.exports = {
  VISIBILITIES, initPlaylistSharing, accessOf, decorate, isGenerated, libraryPlaylistRows,
  visiblePlaylistRows, discoverPublic, members, touch, forgetPlaylist, forgetUser,
};
