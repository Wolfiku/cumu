/**
 * src/services/live.js
 * Live playback over the WebSocket: devices and listening parties.
 *
 * Devices ("Spotify Connect" within one account)
 *   Every open client (browser tab, Android app) says `hello` with a device
 *   id and a name. The device that plays sends `device_state` (song,
 *   position, playing ...). All devices of the user get the device list and
 *   the state of the playing device, so they can show "Wiedergabe auf X"
 *   and send `device_command`s (play, pause, next, seek, play_songs,
 *   transfer, handoff ...) that the server forwards to the target device.
 *
 * Listening parties
 *   A playing device hosts a party. Guests (any user of the server with the
 *   link or an invitation) join with one of their devices and play along:
 *   the host's state is forwarded to them as `party_sync`. Guests can
 *   suggest songs (`party_queue_add`), the host's device adds them.
 *   Parties live in memory: they end when the host leaves or the server
 *   restarts.
 *
 * Nothing here is stored in the database.
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

/** userId -> Map<deviceId, { id, name, kind, ws, state, stateAt, connectedAt }> */
const devices = new Map();
/** userId -> deviceId of the device that plays (or played last) */
const active = new Map();
/** partyId -> party */
const parties = new Map();
/** "userId:deviceId" -> partyId */
const partyOf = new Map();

const key = (userId, deviceId) => `${userId}:${deviceId}`;

function send(ws, payload) {
  try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(payload)); } catch (_) {}
}

function deviceOf(userId, deviceId) {
  const m = devices.get(userId);
  return m ? m.get(deviceId) : null;
}

function username(db, userId) {
  const row = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
  return row ? row.username : '?';
}

// ── Devices ─────────────────────────────────────────────────────────────────

function deviceList(userId) {
  const m = devices.get(userId);
  if (!m) return [];
  const act = active.get(userId);
  return [...m.values()].map(d => ({
    id: d.id, name: d.name, kind: d.kind, active: d.id === act,
    state: d.state || null, stateAt: d.stateAt || null,
    party: partyOf.get(key(userId, d.id)) || null,
  })).sort((a, b) => a.name.localeCompare(b.name));
}

function broadcastDevices(userId) {
  const m = devices.get(userId);
  if (!m) return;
  const payload = { type: 'devices', devices: deviceList(userId), activeDeviceId: active.get(userId) || null };
  for (const d of m.values()) send(d.ws, payload);
}

function hello(db, userId, ws, msg) {
  const id = String(msg.deviceId || '').slice(0, 80);
  if (!id) return;
  if (!devices.has(userId)) devices.set(userId, new Map());
  const m = devices.get(userId);
  const old = m.get(id);
  // The same device reconnecting replaces its old socket
  if (old && old.ws !== ws) { try { old.ws._cumuDevice = null; old.ws.close(4002, 'replaced'); } catch (_) {} }
  m.set(id, {
    id,
    name: String(msg.name || 'Gerät').slice(0, 60),
    kind: ['web', 'android', 'mobile-web'].includes(msg.kind) ? msg.kind : 'web',
    ws,
    state: old ? old.state : null,
    stateAt: old ? old.stateAt : null,
    connectedAt: Date.now(),
  });
  ws._cumuDevice = { userId, deviceId: id };
  send(ws, { type: 'hello_ok', deviceId: id });
  broadcastDevices(userId);
  // Back in a party after a reconnect
  const pid = partyOf.get(key(userId, id));
  if (pid && parties.has(pid)) sendPartyState(db, parties.get(pid), id === parties.get(pid).hostDevice && userId === parties.get(pid).hostUser);
}

function deviceState(db, userId, ws, msg) {
  const me = ws._cumuDevice;
  if (!me || !msg.state || typeof msg.state !== 'object') return;
  const d = deviceOf(userId, me.deviceId);
  if (!d) return;
  const st = msg.state;
  d.state = {
    song: st.song && typeof st.song === 'object' ? st.song : null,
    isPlaying: !!st.isPlaying,
    position: Number(st.position) || 0,
    duration: Number(st.duration) || 0,
    volume: typeof st.volume === 'number' ? st.volume : null,
    shuffle: !!st.shuffle,
    repeat: st.repeat || null,
    hasNext: st.hasNext !== false,
    hasPrev: st.hasPrev !== false,
    queueLength: Number(st.queueLength) || 0,
  };
  d.stateAt = Date.now();
  // The device that starts playing becomes the active one
  let changed = false;
  if (d.state.isPlaying && active.get(userId) !== d.id) { active.set(userId, d.id); changed = true; }
  if (!active.get(userId) && d.state.song) { active.set(userId, d.id); changed = true; }
  if (changed) broadcastDevices(userId);
  // Other devices of the user mirror the playing device
  const m = devices.get(userId);
  for (const other of m.values()) {
    if (other.id !== d.id) send(other.ws, { type: 'device_state', deviceId: d.id, state: d.state, at: d.stateAt });
  }
  // A party host: the guests follow
  const pid = partyOf.get(key(userId, d.id));
  const party = pid && parties.get(pid);
  if (party && party.hostUser === userId && party.hostDevice === d.id) {
    party.state = d.state;
    party.stateAt = d.stateAt;
    for (const g of party.guests.values()) {
      const gd = deviceOf(g.userId, g.deviceId);
      if (gd) send(gd.ws, { type: 'party_sync', partyId: party.id, state: party.state, at: party.stateAt, serverNow: Date.now() });
    }
  }
}

const COMMANDS = ['play', 'pause', 'toggle', 'next', 'prev', 'seek', 'volume', 'play_songs', 'transfer', 'handoff', 'shuffle', 'repeat'];

function deviceCommand(db, userId, ws, msg) {
  const me = ws._cumuDevice;
  if (!me || !COMMANDS.includes(msg.command)) return;
  const target = deviceOf(userId, String(msg.target || ''));
  if (!target) { send(ws, { type: 'device_error', message: 'Das Gerät ist nicht mehr verbunden' }); return; }
  const from = deviceOf(userId, me.deviceId);
  // Handing playback over: the receiving device is the active one from now on
  if (msg.command === 'handoff') { active.set(userId, target.id); broadcastDevices(userId); }
  send(target.ws, { type: 'device_command', from: me.deviceId, fromName: from ? from.name : '', command: msg.command, args: msg.args || {} });
}

// ── Parties ─────────────────────────────────────────────────────────────────

function partyPublic(db, party) {
  const host = deviceOf(party.hostUser, party.hostDevice);
  return {
    id: party.id,
    createdAt: party.createdAt,
    host: { userId: party.hostUser, username: party.hostName, deviceName: host ? host.name : '' },
    guests: [...party.guests.values()].map(g => ({ userId: g.userId, username: g.username, deviceName: (deviceOf(g.userId, g.deviceId) || {}).name || '' })),
    state: party.state || null,
    stateAt: party.stateAt || null,
  };
}

/** Sends the party (members, state) to host and all guests. */
function sendPartyState(db, party) {
  const pub = partyPublic(db, party);
  const host = deviceOf(party.hostUser, party.hostDevice);
  if (host) send(host.ws, { type: 'party_state', party: pub, role: 'host' });
  for (const g of party.guests.values()) {
    const gd = deviceOf(g.userId, g.deviceId);
    if (gd) send(gd.ws, { type: 'party_state', party: pub, role: 'guest' });
  }
  if (devices.has(party.hostUser)) broadcastDevices(party.hostUser);
}

function endParty(db, party, reason) {
  parties.delete(party.id);
  const notify = [];
  const host = deviceOf(party.hostUser, party.hostDevice);
  if (host) notify.push(host.ws);
  partyOf.delete(key(party.hostUser, party.hostDevice));
  for (const g of party.guests.values()) {
    partyOf.delete(key(g.userId, g.deviceId));
    const gd = deviceOf(g.userId, g.deviceId);
    if (gd) notify.push(gd.ws);
  }
  for (const w of notify) send(w, { type: 'party_ended', partyId: party.id, reason: reason || 'Die Party ist vorbei' });
  if (devices.has(party.hostUser)) broadcastDevices(party.hostUser);
}

function partyCreate(db, userId, ws) {
  const me = ws._cumuDevice;
  if (!me) return;
  const existing = partyOf.get(key(userId, me.deviceId));
  if (existing && parties.has(existing)) { sendPartyState(db, parties.get(existing)); return; }
  const d = deviceOf(userId, me.deviceId);
  const party = {
    id: uuidv4(), hostUser: userId, hostDevice: me.deviceId, hostName: username(db, userId),
    createdAt: Date.now(), guests: new Map(), state: d ? d.state : null, stateAt: d ? d.stateAt : null,
  };
  parties.set(party.id, party);
  partyOf.set(key(userId, me.deviceId), party.id);
  sendPartyState(db, party);
}

function partyJoin(db, userId, ws, msg) {
  const me = ws._cumuDevice;
  if (!me) return;
  const party = parties.get(String(msg.partyId || ''));
  if (!party) { send(ws, { type: 'party_error', message: 'Diese Party ist schon vorbei' }); return; }
  if (party.hostUser === userId && party.hostDevice === me.deviceId) { sendPartyState(db, party); return; }
  if (party.hostUser !== userId && require('./social').isBlocked(db, userId, party.hostUser)) {
    send(ws, { type: 'party_error', message: 'Diese Party ist schon vorbei' });
    return;
  }
  // One party per device
  const old = partyOf.get(key(userId, me.deviceId));
  if (old && old !== party.id) leave(db, userId, me.deviceId);
  party.guests.set(key(userId, me.deviceId), { userId, deviceId: me.deviceId, username: username(db, userId), joinedAt: Date.now() });
  partyOf.set(key(userId, me.deviceId), party.id);
  sendPartyState(db, party);
  if (party.state) send(ws, { type: 'party_sync', partyId: party.id, state: party.state, at: party.stateAt, serverNow: Date.now() });
}

function leave(db, userId, deviceId) {
  const pid = partyOf.get(key(userId, deviceId));
  const party = pid && parties.get(pid);
  partyOf.delete(key(userId, deviceId));
  if (!party) return;
  if (party.hostUser === userId && party.hostDevice === deviceId) { endParty(db, party, `${party.hostName} hat die Party beendet`); return; }
  party.guests.delete(key(userId, deviceId));
  sendPartyState(db, party);
}

function partyLeave(db, userId, ws) {
  const me = ws._cumuDevice;
  if (!me) return;
  const pid = partyOf.get(key(userId, me.deviceId));
  leave(db, userId, me.deviceId);
  send(ws, { type: 'party_left', partyId: pid || null });
}

/** A guest suggests a song: the host's device adds it to its queue. */
function partyQueueAdd(db, userId, ws, msg) {
  const me = ws._cumuDevice;
  if (!me || !msg.song || typeof msg.song !== 'object') return;
  const party = parties.get(partyOf.get(key(userId, me.deviceId)));
  if (!party) return;
  const host = deviceOf(party.hostUser, party.hostDevice);
  const by = username(db, userId);
  if (host) send(host.ws, { type: 'party_queue_add', song: msg.song, by });
  send(ws, { type: 'party_notice', message: `„${msg.song.title || 'Song'}“ an ${party.hostName} geschickt` });
}

/** Invitation by name: lands in the inbox like a shared song. */
function partyInvite(db, userId, ws, msg) {
  const me = ws._cumuDevice;
  if (!me) return;
  const party = parties.get(partyOf.get(key(userId, me.deviceId)));
  if (!party) return;
  const social = require('./social');
  const r = social.createShare(db, userId, msg.username, 'party', party.id, msg.message || null);
  if (r.error) { send(ws, { type: 'party_error', message: r.error }); return; }
  const info = social.itemInfo(db, 'party', party.id, r.toUserId);
  try {
    require('../websocket').pushToUser(r.toUserId, {
      type: 'share_received',
      share: { id: r.share.id, from_username: username(db, userId), item_type: 'party', item_id: party.id, title: info && info.title },
      unread: social.unreadCount(db, r.toUserId),
      count: social.socialCount(db, r.toUserId),
    });
  } catch (_) {}
  send(ws, { type: 'party_notice', message: `${r.share.to_username} eingeladen` });
}

/**
 * A guest controls the party like the host (play, pause, next, seek, start
 * songs): forwarded to the host's device, whose state then syncs everyone.
 */
const PARTY_COMMANDS = ['play', 'pause', 'toggle', 'next', 'prev', 'seek', 'play_songs'];
function partyControl(db, userId, ws, msg) {
  const me = ws._cumuDevice;
  if (!me || !PARTY_COMMANDS.includes(msg.command)) return;
  const party = parties.get(partyOf.get(key(userId, me.deviceId)));
  if (!party) return;
  const host = deviceOf(party.hostUser, party.hostDevice);
  if (!host) return;
  send(host.ws, { type: 'device_command', from: me.deviceId, fromName: `${username(db, userId)} (Party)`, command: msg.command, args: msg.args || {}, party: true });
}

/** Title for the inbox / links. */
function partyInfo(partyId) {
  const p = parties.get(partyId);
  if (!p) return null;
  const n = p.guests.size;
  return { title: `Listening Party von ${p.hostName}`, subtitle: n ? `${n} ${n === 1 ? 'Gast' : 'Gäste'} · läuft gerade` : 'läuft gerade', cover: p.state && p.state.song ? p.state.song.cover || null : null };
}

// ── Socket hooks ────────────────────────────────────────────────────────────

/** Returns true when the message was a live message. */
function onMessage(db, userId, ws, msg) {
  switch (msg.type) {
    case 'hello': hello(db, userId, ws, msg); return true;
    case 'device_state': deviceState(db, userId, ws, msg); return true;
    case 'device_command': deviceCommand(db, userId, ws, msg); return true;
    case 'party_create': partyCreate(db, userId, ws); return true;
    case 'party_join': partyJoin(db, userId, ws, msg); return true;
    case 'party_leave': partyLeave(db, userId, ws); return true;
    case 'party_end': partyLeave(db, userId, ws); return true;
    case 'party_queue_add': partyQueueAdd(db, userId, ws, msg); return true;
    case 'party_invite': partyInvite(db, userId, ws, msg); return true;
    case 'party_control': partyControl(db, userId, ws, msg); return true;
    default: return false;
  }
}

function onClose(db, userId, ws) {
  const me = ws._cumuDevice;
  if (!me) return;
  const m = devices.get(userId);
  const d = m && m.get(me.deviceId);
  if (!d || d.ws !== ws) return; // replaced by a newer connection
  m.delete(me.deviceId);
  if (!m.size) devices.delete(userId);
  if (active.get(userId) === me.deviceId) active.delete(userId);
  leave(db, userId, me.deviceId);
  broadcastDevices(userId);
}

module.exports = { onMessage, onClose, partyInfo, deviceList };
