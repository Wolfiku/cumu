/**
 * public/js/api-client.js
 * OAuth2 API Client for Cumu Web.
 *
 * Handles:
 *   - Token storage (localStorage)
 *   - Automatic token refresh via /oauth/token
 *   - Authenticated REST requests with Bearer header
 *   - WebSocket connection for real-time sync
 */

'use strict';

const CUMU_CLIENT_ID     = 'cumu-web';
const CUMU_CLIENT_SECRET = 'cumu-web-secret-internal';
const TOKEN_KEY          = 'cumu_access_token';
const REFRESH_KEY        = 'cumu_refresh_token';
const EXPIRES_KEY        = 'cumu_token_expires';

const CumuApi = (() => {
  let _ws = null;
  let _wsReconnectTimer = null;
  const _wsListeners = new Set();

  // ── Token Storage ──────────────────────────────────────────────────────────

  function getAccessToken()  { return localStorage.getItem(TOKEN_KEY); }
  function getRefreshToken() { return localStorage.getItem(REFRESH_KEY); }
  function getExpiry()       { return parseInt(localStorage.getItem(EXPIRES_KEY) || '0', 10); }

  function saveTokens({ access_token, refresh_token, expires_in }) {
    localStorage.setItem(TOKEN_KEY,   access_token);
    if (refresh_token) localStorage.setItem(REFRESH_KEY, refresh_token);
    localStorage.setItem(EXPIRES_KEY, String(Math.floor(Date.now() / 1000) + (expires_in || 3600)));
  }

  function clearTokens() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(EXPIRES_KEY);
  }

  function isTokenExpired() {
    const exp = getExpiry();
    if (!exp) return true;
    return Date.now() / 1000 >= exp - 30; // 30s buffer
  }

  // ── Network Helper ──────────────────────────────────────────────────────────

  async function safeFetch(url, opts) {
    try {
      return await fetch(url, opts);
    } catch (err) {
      if (err instanceof TypeError || (err.message && (err.message.includes('fetch') || err.message.includes('NetworkError') || err.message.includes('Failed to fetch')))) {
        throw new Error('Server nicht erreichbar. Bitte stelle sicher, dass der Backend-Server läuft.');
      }
      throw err;
    }
  }

  // ── OAuth2 Flow ────────────────────────────────────────────────────────────

  /**
   * Login: authorize (get code) + exchange for token.
   * Returns { ok: true, username, role, theme } or throws.
   */
  async function login(username, password) {
    // Step 1: Get authorization code
    const authRes = await safeFetch('/oauth/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CUMU_CLIENT_ID,
        redirect_uri: window.location.origin,
        scope: 'read write admin',
        response_type: 'code',
        username,
        password,
      }),
    });

    let authData;
    try {
      authData = await authRes.json();
    } catch {
      throw new Error('Ungültige Antwort vom Server erhalten');
    }
    if (!authRes.ok) throw new Error(authData.error_description || authData.error || 'Autorisierung fehlgeschlagen');

    // Step 2: Exchange code for token
    const tokenRes = await safeFetch('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: authData.code,
        redirect_uri: window.location.origin,
        client_id: CUMU_CLIENT_ID,
        client_secret: CUMU_CLIENT_SECRET,
      }),
    });

    let tokenData;
    try {
      tokenData = await tokenRes.json();
    } catch {
      throw new Error('Ungültige Token-Antwort vom Server');
    }
    if (!tokenRes.ok) throw new Error(tokenData.error_description || tokenData.error || 'Token-Austausch fehlgeschlagen');

    saveTokens(tokenData);

    // Fetch user info
    const me = await get('/user/me');
    return { ok: true, username: me.username, role: me.role, theme: me.theme };
  }

  async function refreshTokens() {
    const refresh = getRefreshToken();
    if (!refresh) throw new Error('No refresh token');

    const res = await safeFetch('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refresh,
        client_id: CUMU_CLIENT_ID,
        client_secret: CUMU_CLIENT_SECRET,
      }),
    });

    let data;
    try {
      data = await res.json();
    } catch {
      clearTokens();
      throw new Error('Server error updating session');
    }
    if (!res.ok) {
      clearTokens();
      throw new Error('Session expired — please log in again');
    }
    saveTokens(data);
  }

  async function logout() {
    const token = getAccessToken();
    if (token) {
      try {
        await safeFetch('/oauth/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, client_id: CUMU_CLIENT_ID, client_secret: CUMU_CLIENT_SECRET }),
        });
      } catch {}
    }
    clearTokens();
    disconnectWs();
  }

  function isLoggedIn() {
    return !!getAccessToken();
  }

  // ── Authenticated Requests ─────────────────────────────────────────────────

  async function getAuthHeader() {
    if (isTokenExpired() && getRefreshToken()) {
      await refreshTokens();
    }
    const token = getAccessToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  async function request(method, url, body, extraHeaders = {}) {
    const authHeader = await getAuthHeader();
    const headers = { 'Content-Type': 'application/json', ...authHeader, ...extraHeaders };

    const opts = { method, headers };
    if (body !== undefined) opts.body = JSON.stringify(body);

    const res = await safeFetch(url, opts);

    if (res.status === 401) {
      // Try refresh once
      try {
        await refreshTokens();
        const retryAuth = await getAuthHeader();
        const res2 = await safeFetch(url, {
          method, headers: { 'Content-Type': 'application/json', ...retryAuth, ...extraHeaders },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        return res2;
      } catch {
        clearTokens();
        window.dispatchEvent(new CustomEvent('cumu:unauthorized'));
        throw new Error('Session expired');
      }
    }

    return res;
  }

  async function get(url)              { return (await request('GET', url)).json(); }
  async function post(url, body)       { return (await request('POST', url, body)).json(); }
  async function put(url, body)        { return (await request('PUT', url, body)).json(); }
  async function del(url)              { return (await request('DELETE', url)).json(); }

  async function postForm(url, formData) {
    const authHeader = await getAuthHeader();
    const res = await fetch(url, { method: 'POST', headers: authHeader, body: formData });
    return res.json();
  }

  /** Build a streaming URL with token appended for <audio> src */
  function streamUrl(songId) {
    const token = getAccessToken();
    return `/stream/${encodeURIComponent(songId)}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  }

  /** Build a download URL */
  function downloadUrl(songId) {
    const token = getAccessToken();
    return `/stream/${encodeURIComponent(songId)}/download${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  }

  // ── WebSocket ──────────────────────────────────────────────────────────────

  function connectWs() {
    if (_ws && _ws.readyState <= 1) return;
    const token = getAccessToken();
    if (!token) return;

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    _ws = new WebSocket(`${protocol}//${location.host}/ws?token=${encodeURIComponent(token)}`);

    _ws.addEventListener('message', (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      _wsListeners.forEach(fn => fn(msg));
    });

    _ws.addEventListener('close', () => {
      _ws = null;
      if (isLoggedIn()) {
        _wsReconnectTimer = setTimeout(connectWs, 5000);
      }
    });

    _ws.addEventListener('error', () => {});
  }

  function disconnectWs() {
    clearTimeout(_wsReconnectTimer);
    if (_ws) { _ws.close(); _ws = null; }
  }

  function onWsMessage(fn) {
    _wsListeners.add(fn);
    return () => _wsListeners.delete(fn);
  }

  function wsPush(type, payload) {
    if (_ws && _ws.readyState === 1) {
      _ws.send(JSON.stringify({ type, ...payload }));
    }
  }

  // Public API
  return {
    login, logout, refreshTokens, isLoggedIn, clearTokens,
    get, post, put, del, postForm,
    streamUrl, downloadUrl,
    connectWs, disconnectWs, onWsMessage, wsPush,
    getAccessToken,
  };
})();

window.CumuApi = CumuApi;
