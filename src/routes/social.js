/**
 * src/routes/social.js
 * Sending songs / albums / playlists to other users, the inbox,
 * name suggestions, privacy settings and blocked users.
 */

'use strict';

const express = require('express');
const { getDB } = require('../db');
const { requireAuth } = require('../middleware/auth');
const social = require('../services/social');

const router = express.Router();

function notify(userId, payload) {
  try { require('../websocket').pushToUser(userId, payload); } catch (_) {}
}

// ── Name suggestions (sharing / inviting) ─────────────────────────────────
router.get('/users/suggest', requireAuth, (req, res) => {
  res.json(social.suggestUsers(getDB(), req.user.id, req.query.q));
});

// ── Sending things ─────────────────────────────────────────────────────────
// Body: { username, type: song|album|artist|playlist|audiobook, id, message? }
router.post('/shares', requireAuth, (req, res) => {
  const db = getDB();
  const { username, type, id, message } = req.body || {};
  if (!username || !type || !id) return res.status(400).json({ error: 'Empfänger und Inhalt fehlen' });
  const r = social.createShare(db, req.user.id, username, type, id, message);
  if (r.error) return res.status(r.status || 400).json({ error: r.error, needsAccess: !!r.needsAccess });
  const me = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
  const info = social.itemInfo(db, type, id, r.toUserId);
  notify(r.toUserId, {
    type: 'share_received',
    share: { id: r.share.id, from_username: me && me.username, item_type: type, item_id: id, title: info && info.title, message: message || null },
    unread: social.unreadCount(db, r.toUserId),
    count: social.socialCount(db, r.toUserId),
  });
  res.json({ success: true, share: r.share });
});

router.get('/shares/inbox', requireAuth, (req, res) => {
  const db = getDB();
  res.json({ items: social.inbox(db, req.user.id), unread: social.unreadCount(db, req.user.id) });
});

router.get('/shares/unread', requireAuth, (req, res) => {
  res.json({ unread: social.unreadCount(getDB(), req.user.id) });
});

// :id or "all"
router.post('/shares/:id/read', requireAuth, (req, res) => {
  const db = getDB();
  social.markRead(db, req.user.id, req.params.id);
  res.json({ success: true, unread: social.unreadCount(db, req.user.id) });
});

router.delete('/shares/:id', requireAuth, (req, res) => {
  const db = getDB();
  social.deleteShare(db, req.user.id, req.params.id);
  res.json({ success: true, unread: social.unreadCount(db, req.user.id) });
});

// ── Social page & friends ─────────────────────────────────────────────────
router.get('/social', requireAuth, (req, res) => {
  res.json(social.socialOverview(getDB(), req.user.id));
});

router.get('/social/count', requireAuth, (req, res) => {
  res.json({ count: social.socialCount(getDB(), req.user.id) });
});

router.get('/friends', requireAuth, (req, res) => {
  res.json(social.friendsOf(getDB(), req.user.id));
});

// Body: { username }
router.post('/friends', requireAuth, (req, res) => {
  const db = getDB();
  const r = social.requestFriend(db, req.user.id, req.body && req.body.username);
  if (r.error) return res.status(r.status).json({ error: r.error });
  notify(r.user.id, { type: 'friend_update', count: social.socialCount(db, r.user.id) });
  res.json({ success: true, accepted: !!r.accepted, ...social.friendsOf(db, req.user.id) });
});

router.post('/friends/:userId/accept', requireAuth, (req, res) => {
  const db = getDB();
  social.acceptFriend(db, req.user.id, req.params.userId);
  notify(req.params.userId, { type: 'friend_update', count: social.socialCount(db, req.params.userId) });
  res.json({ success: true, ...social.friendsOf(db, req.user.id), count: social.socialCount(db, req.user.id) });
});

router.delete('/friends/:userId', requireAuth, (req, res) => {
  const db = getDB();
  social.removeFriend(db, req.user.id, req.params.userId);
  res.json({ success: true, ...social.friendsOf(db, req.user.id), count: social.socialCount(db, req.user.id) });
});

// ── Privacy ────────────────────────────────────────────────────────────────
router.get('/me/privacy', requireAuth, (req, res) => {
  const db = getDB();
  res.json({ ...social.getPrivacy(db, req.user.id), blocked: social.blockedUsers(db, req.user.id) });
});

router.put('/me/privacy', requireAuth, (req, res) => {
  const db = getDB();
  const privacy = social.setPrivacy(db, req.user.id, req.body || {});
  res.json({ ...privacy, blocked: social.blockedUsers(db, req.user.id) });
});

// Body: { username }
router.post('/me/blocks', requireAuth, (req, res) => {
  const db = getDB();
  const user = social.userByName(db, req.body && req.body.username);
  if (!user) return res.status(404).json({ error: 'Diesen Nutzer gibt es auf diesem Server nicht' });
  if (user.id === req.user.id) return res.status(400).json({ error: 'Du kannst dich nicht selbst blockieren' });
  social.blockUser(db, req.user.id, user.id);
  res.json({ success: true, blocked: social.blockedUsers(db, req.user.id) });
});

router.delete('/me/blocks/:userId', requireAuth, (req, res) => {
  const db = getDB();
  social.unblockUser(db, req.user.id, req.params.userId);
  res.json({ success: true, blocked: social.blockedUsers(db, req.user.id) });
});

// Deletes the own listening history (recently played, own top lists).
// Server-wide play counts stay, they are not tied to a person.
router.delete('/me/history', requireAuth, (req, res) => {
  const db = getDB();
  const n = db.prepare('DELETE FROM play_history WHERE user_id = ?').run(req.user.id).changes;
  res.json({ success: true, deleted: n });
});

module.exports = router;
