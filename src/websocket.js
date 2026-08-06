/**
 * src/websocket.js
 * WebSocket server for real-time cross-client state sync.
 *
 * Clients connect with: ws://<host>/ws?token=<access_token>
 * On successful auth, a room keyed by userId is created.
 * When any client pushes a state update via POST /api/sync, the server
 * broadcasts the new state to all other connected clients of that user.
 */

'use strict';

const { WebSocketServer, WebSocket } = require('ws');
const { getDB } = require('./db');
const { extractToken } = require('./middleware/auth');

/** Map<userId, Set<WebSocket>> */
const rooms = new Map();

function getUserIdFromToken(token) {
  if (!token) return null;
  const db = getDB();
  const now = Math.floor(Date.now() / 1000);
  const row = db.prepare(`
    SELECT t.user_id FROM oauth_tokens t
    JOIN users u ON u.id = t.user_id
    WHERE t.access_token = ? AND t.revoked = 0 AND t.access_expires_at > ? AND u.is_blocked = 0
  `).get(token, now);
  return row ? row.user_id : null;
}

function broadcast(userId, payload, excludeSocket) {
  const room = rooms.get(userId);
  if (!room) return;
  const msg = JSON.stringify(payload);
  for (const ws of room) {
    if (ws !== excludeSocket && ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

function createWsServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // Parse token from query string
    const url  = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    const userId = getUserIdFromToken(token);

    if (!userId) {
      ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
      ws.close(4001, 'Unauthorized');
      return;
    }

    // Join room
    if (!rooms.has(userId)) rooms.set(userId, new Set());
    rooms.get(userId).add(ws);

    ws.send(JSON.stringify({ type: 'connected', userId }));

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      // Accept ping messages
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      // Accept state_update messages: broadcast to other clients
      if (msg.type === 'state_update' && msg.state) {
        broadcast(userId, { type: 'state_update', state: msg.state }, ws);
      }
    });

    ws.on('close', () => {
      const room = rooms.get(userId);
      if (room) {
        room.delete(ws);
        if (room.size === 0) rooms.delete(userId);
      }
    });

    ws.on('error', (err) => {
      console.error('[ws] error for user', userId, err.message);
    });
  });

  return wss;
}

/**
 * Push a state update to all connected clients for a userId.
 * Called by sync route after a successful POST /api/sync.
 */
function pushStateUpdate(userId, state) {
  broadcast(userId, { type: 'state_update', state }, null);
}

module.exports = { createWsServer, pushStateUpdate };
