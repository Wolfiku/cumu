/**
 * public/js/admin.js
 * Comprehensive Admin Dashboard Controller.
 * Tabs: Upload, Songs, Albums, Users, OAuth Clients, Server Config, Logs, Stats.
 * Uses CumuApi for OAuth2 authenticated REST calls.
 */

'use strict';

const CumuAdmin = (() => {
  let activeTab = 'upload';

  function renderLayout() {
    return `
      <div class="page-section">
        <h1>admin panel</h1>
        <p class="mute caption" style="margin-bottom:20px">manage music library, users, server settings, and oauth clients</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:24px;border-bottom:1px solid var(--color-border);padding-bottom:12px" id="adminTabs">
          <button class="btn-secondary active" data-tab="upload" onclick="CumuAdmin.switchTab('upload')">upload</button>
          <button class="btn-secondary" data-tab="scan" onclick="CumuAdmin.switchTab('scan')">scan library</button>
          <button class="btn-secondary" data-tab="songs" onclick="CumuAdmin.switchTab('songs')">songs</button>
          <button class="btn-secondary" data-tab="albums" onclick="CumuAdmin.switchTab('albums')">albums</button>
          <button class="btn-secondary" data-tab="users" onclick="CumuAdmin.switchTab('users')">users</button>
          <button class="btn-secondary" data-tab="oauth" onclick="CumuAdmin.switchTab('oauth')">oauth clients</button>
          <button class="btn-secondary" data-tab="stats" onclick="CumuAdmin.switchTab('stats')">stats & config</button>
          <button class="btn-secondary" data-tab="logs" onclick="CumuAdmin.switchTab('logs')">system logs</button>
        </div>
        <div id="adminTabContent"></div>
      </div>`;
  }

  async function switchTab(tabName) {
    activeTab = tabName;
    const buttons = document.querySelectorAll('#adminTabs button');
    buttons.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));

    const content = document.getElementById('adminTabContent');
    if (!content) return;

    content.innerHTML = '<div class="spinner">loading…</div>';

    if      (tabName === 'upload') renderUploadTab(content);
    else if (tabName === 'scan')   renderScanTab(content);
    else if (tabName === 'songs')  renderSongsTab(content);
    else if (tabName === 'albums') renderAlbumsTab(content);
    else if (tabName === 'users')  renderUsersTab(content);
    else if (tabName === 'oauth')  renderOAuthTab(content);
    else if (tabName === 'stats')  renderStatsTab(content);
    else if (tabName === 'logs')   renderLogsTab(content);
  }

  // ── 1. Upload Tab ─────────────────────────────────────────────────────────
  function renderUploadTab(container) {
    container.innerHTML = `
      <div class="card">
        <h2>upload music & audiobooks</h2>
        <p class="mute caption" style="margin-bottom:16px">upload MP3, M4A, FLAC, AAC, WAV, or OGG audio files. ID3 tags are extracted automatically.</p>
        <form id="adminUploadForm" enctype="multipart/form-data">
          <div class="form-row">
            <label for="uploadFiles">select audio files (up to 200)</label>
            <input type="file" id="uploadFiles" name="files" multiple accept="audio/*" required />
          </div>
          <div class="form-row">
            <label for="uploadCover">optional cover art (JPG / PNG)</label>
            <input type="file" id="uploadCover" name="cover" accept="image/*" />
          </div>
          <div class="form-row">
            <label for="uploadArtist">override artist name (optional)</label>
            <input type="text" id="uploadArtist" name="artist" placeholder="leave blank to read from tags" />
          </div>
          <div class="form-row">
            <label for="uploadAlbum">override album title (optional)</label>
            <input type="text" id="uploadAlbum" name="album" placeholder="leave blank to read from tags" />
          </div>
          <div style="margin-bottom:16px">
            <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" name="isAudiobook" value="true" />
              <span>mark as audiobook / spoken word</span>
            </label>
          </div>
          <div id="uploadStatus" class="mute caption" style="margin-top:8px"></div>
          <div style="margin-top:16px">
            <button type="submit" class="btn-primary" id="uploadSubmitBtn">upload files</button>
          </div>
        </form>
      </div>`;

    document.getElementById('adminUploadForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const statusEl = document.getElementById('uploadStatus');
      const submitBtn = document.getElementById('uploadSubmitBtn');
      statusEl.textContent = 'uploading and extracting metadata…';
      submitBtn.disabled = true;

      const formData = new FormData(e.target);
      try {
        const res = await CumuApi.postForm('/admin/upload', formData);
        if (res.success) {
          statusEl.textContent = `✅ Successfully uploaded ${res.uploaded} song(s)!`;
          e.target.reset();
        } else {
          statusEl.textContent = `❌ ${res.error || 'Upload failed'}`;
        }
      } catch (err) {
        statusEl.textContent = `❌ ${err.message || 'Network error'}`;
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  // ── 2. Scan Tab ───────────────────────────────────────────────────────────
  function renderScanTab(container) {
    container.innerHTML = `
      <div class="card">
        <h2>scan music directory</h2>
        <p class="mute caption" style="margin-bottom:16px">scans the server's music folder for any audio files that were manually copied to disk.</p>
        <button class="btn-primary" id="btnScanLibrary">start library scan</button>
        <div id="scanResult" style="margin-top:16px"></div>
      </div>`;

    document.getElementById('btnScanLibrary').addEventListener('click', async () => {
      const resEl = document.getElementById('scanResult');
      resEl.textContent = 'scanning files on server…';
      try {
        const res = await CumuApi.post('/admin/scan', {});
        if (res.success) {
          resEl.innerHTML = `<div class="settings-success-msg">✅ Scan complete! Scanned ${res.scanned} files, added ${res.added} new songs.</div>`;
        } else {
          resEl.innerHTML = `<div class="error-msg">❌ ${res.error || 'Scan failed'}</div>`;
        }
      } catch (err) {
        resEl.innerHTML = `<div class="error-msg">❌ ${err.message || 'Error running scan'}</div>`;
      }
    });
  }

  // ── 3. Songs Tab ──────────────────────────────────────────────────────────
  async function renderSongsTab(container) {
    const songs = await CumuApi.get('/api/songs');
    if (!songs.length) {
      container.innerHTML = '<div class="card"><p class="mute">no songs in library</p></div>';
      return;
    }
    container.innerHTML = `
      <div class="card">
        <h2>manage songs (${songs.length})</h2>
        <div style="overflow-x:auto">
          <table>
            <thead>
              <tr><th>Title</th><th>Artist</th><th>Album</th><th>Duration</th><th>Plays</th><th>Actions</th></tr>
            </thead>
            <tbody>
              ${songs.map(s => `
                <tr>
                  <td><strong>${esc(s.title)}</strong> ${s.is_audiobook ? '<span class="mute">(spoken)</span>' : ''}</td>
                  <td>${esc(s.artist_name || '—')}</td>
                  <td>${esc(s.album_title || '—')}</td>
                  <td>${formatTime(s.duration)}</td>
                  <td>${s.play_count || 0}</td>
                  <td>
                    <button class="btn-icon" onclick="navigate('song','edit:${s.id}')">edit</button>
                    <button class="btn-danger" style="padding:2px 8px;font-size:12px" onclick="CumuAdmin.deleteSong('${s.id}')">delete</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  async function deleteSong(songId) {
    if (!confirm('Are you sure you want to delete this song?')) return;
    await CumuApi.del(`/admin/songs/${songId}`);
    switchTab('songs');
  }

  // ── 4. Albums Tab ─────────────────────────────────────────────────────────
  async function renderAlbumsTab(container) {
    const albums = await CumuApi.get('/api/albums');
    if (!albums.length) {
      container.innerHTML = '<div class="card"><p class="mute">no albums in library</p></div>';
      return;
    }
    container.innerHTML = `
      <div class="card">
        <h2>manage albums (${albums.length})</h2>
        <div style="overflow-x:auto">
          <table>
            <thead>
              <tr><th>Title</th><th>Artist</th><th>Year</th><th>Genre</th><th>Actions</th></tr>
            </thead>
            <tbody>
              ${albums.map(a => `
                <tr>
                  <td><strong>${esc(a.title)}</strong></td>
                  <td>${esc(a.artist_name || '—')}</td>
                  <td>${a.year || '—'}</td>
                  <td>${esc(a.genre || '—')}</td>
                  <td>
                    <button class="btn-icon" onclick="navigate('album','edit:${a.id}')">edit</button>
                    <button class="btn-danger" style="padding:2px 8px;font-size:12px" onclick="CumuAdmin.deleteAlbum('${a.id}')">delete</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  async function deleteAlbum(albumId) {
    if (!confirm('Delete album and all its songs?')) return;
    await CumuApi.del(`/admin/albums/${albumId}`);
    switchTab('albums');
  }

  // ── 5. Users Tab ──────────────────────────────────────────────────────────
  async function renderUsersTab(container) {
    const users = await CumuApi.get('/admin/users');
    container.innerHTML = `
      <div class="card" style="margin-bottom:24px">
        <h2>add new user</h2>
        <form id="addUserForm" style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">
          <div style="flex:1;min-width:140px">
            <label for="newUsername">username</label>
            <input type="text" id="newUsername" name="username" required placeholder="username" />
          </div>
          <div style="flex:1;min-width:140px">
            <label for="newPassword">password</label>
            <input type="password" id="newPassword" name="password" required placeholder="password" />
          </div>
          <div style="width:120px">
            <label for="newRole">role</label>
            <select id="newRole" name="role">
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <button type="submit" class="btn-primary">create user</button>
        </form>
      </div>

      <div class="card">
        <h2>users (${users.length})</h2>
        <div style="overflow-x:auto">
          <table>
            <thead>
              <tr><th>Username</th><th>Role</th><th>Status</th><th>Theme</th><th>Actions</th></tr>
            </thead>
            <tbody>
              ${users.map(u => `
                <tr>
                  <td><strong>${esc(u.username)}</strong></td>
                  <td><span class="chip">${u.role}</span></td>
                  <td>${u.is_blocked ? '<span style="color:var(--color-danger)">BLOCKED</span>' : '<span style="color:var(--color-success)">Active</span>'}</td>
                  <td>${u.theme || 'coddy'}</td>
                  <td>
                    <button class="btn-secondary" style="padding:2px 8px;font-size:12px" onclick="CumuAdmin.toggleUserBlock('${u.id}', ${!u.is_blocked})">
                      ${u.is_blocked ? 'unblock' : 'block'}
                    </button>
                    <button class="btn-danger" style="padding:2px 8px;font-size:12px" onclick="CumuAdmin.deleteUser('${u.id}')">delete</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;

    document.getElementById('addUserForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target));
      try {
        await CumuApi.post('/admin/users', body);
        switchTab('users');
      } catch (err) {
        alert(err.message || 'Could not create user');
      }
    });
  }

  async function toggleUserBlock(userId, isBlocked) {
    await CumuApi.put(`/admin/users/${userId}`, { is_blocked: isBlocked });
    switchTab('users');
  }

  async function deleteUser(userId) {
    if (!confirm('Delete user?')) return;
    await CumuApi.del(`/admin/users/${userId}`);
    switchTab('users');
  }

  // ── 6. OAuth Clients Tab ──────────────────────────────────────────────────
  async function renderOAuthTab(container) {
    const clients = await CumuApi.get('/admin/oauth/clients');
    container.innerHTML = `
      <div class="card" style="margin-bottom:24px">
        <h2>register new oauth client</h2>
        <p class="mute caption" style="margin-bottom:12px">register external or custom applications (mobile app, desktop client) to authenticate via OAuth2.</p>
        <form id="addClientForm">
          <div class="form-row">
            <label for="clientName">client name</label>
            <input type="text" id="clientName" name="name" required placeholder="e.g. Cumu Mobile App" />
          </div>
          <div class="form-row">
            <label for="clientUris">redirect URIs (JSON array or comma-separated)</label>
            <input type="text" id="clientUris" name="redirect_uris" placeholder='["http://localhost:8080/callback"]' />
          </div>
          <div class="form-row">
            <label for="clientScopes">scopes</label>
            <input type="text" id="clientScopes" name="scopes" value="read write" />
          </div>
          <button type="submit" class="btn-primary">register client</button>
        </form>
        <div id="newClientSecretDisplay" style="margin-top:16px"></div>
      </div>

      <div class="card">
        <h2>registered oauth clients (${clients.length})</h2>
        <div style="overflow-x:auto">
          <table>
            <thead>
              <tr><th>Name</th><th>Client ID</th><th>Scopes</th><th>Active</th><th>Actions</th></tr>
            </thead>
            <tbody>
              ${clients.map(c => `
                <tr>
                  <td><strong>${esc(c.name)}</strong></td>
                  <td><code>${esc(c.client_id)}</code></td>
                  <td>${esc(c.scopes)}</td>
                  <td>${c.is_active ? '✅' : '❌'}</td>
                  <td>
                    ${c.is_active ? `<button class="btn-danger" style="padding:2px 8px;font-size:12px" onclick="CumuAdmin.deactivateClient('${c.id}')">deactivate</button>` : 'inactive'}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;

    document.getElementById('addClientForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('clientName').value;
      const urisRaw = document.getElementById('clientUris').value;
      const scopes = document.getElementById('clientScopes').value;

      let redirect_uris = [];
      try { redirect_uris = JSON.parse(urisRaw); } catch { redirect_uris = urisRaw.split(',').map(s => s.trim()).filter(Boolean); }

      try {
        const res = await CumuApi.post('/admin/oauth/clients', { name, redirect_uris, scopes });
        document.getElementById('newClientSecretDisplay').innerHTML = `
          <div class="settings-success-msg" style="padding:16px">
            <strong>Client Registered!</strong><br>
            Client ID: <code>${res.clientId}</code><br>
            Client Secret (save this now!): <code>${res.clientSecret}</code>
          </div>`;
        e.target.reset();
      } catch (err) {
        alert(err.message || 'Failed to register client');
      }
    });
  }

  async function deactivateClient(id) {
    if (!confirm('Deactivate client? Existing tokens will be revoked.')) return;
    await CumuApi.del(`/admin/oauth/clients/${id}`);
    switchTab('oauth');
  }

  // ── 7. Stats & Server Config Tab ─────────────────────────────────────────
  async function renderStatsTab(container) {
    const stats  = await CumuApi.get('/admin/stats');
    const config = await CumuApi.get('/admin/config');

    const usedMb = (stats.storageUsedBytes / (1024 * 1024)).toFixed(1);

    container.innerHTML = `
      <div class="card" style="margin-bottom:24px">
        <h2>server statistics</h2>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:16px;margin-top:16px">
          <div style="background:var(--color-surface-soft);padding:16px;border-radius:var(--radius-sm)">
            <div class="mute caption">songs</div>
            <div style="font-size:24px;font-weight:bold">${stats.songs}</div>
          </div>
          <div style="background:var(--color-surface-soft);padding:16px;border-radius:var(--radius-sm)">
            <div class="mute caption">albums</div>
            <div style="font-size:24px;font-weight:bold">${stats.albums}</div>
          </div>
          <div style="background:var(--color-surface-soft);padding:16px;border-radius:var(--radius-sm)">
            <div class="mute caption">artists</div>
            <div style="font-size:24px;font-weight:bold">${stats.artists}</div>
          </div>
          <div style="background:var(--color-surface-soft);padding:16px;border-radius:var(--radius-sm)">
            <div class="mute caption">users</div>
            <div style="font-size:24px;font-weight:bold">${stats.users}</div>
          </div>
          <div style="background:var(--color-surface-soft);padding:16px;border-radius:var(--radius-sm)">
            <div class="mute caption">storage used</div>
            <div style="font-size:24px;font-weight:bold">${usedMb} MB</div>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>server configuration</h2>
        <form id="adminConfigForm" style="margin-top:16px">
          <div class="form-row">
            <label for="cfgMusicPath">music storage directory</label>
            <input type="text" id="cfgMusicPath" name="musicPath" value="${esc(config.musicPath || '')}" />
          </div>
          <div class="form-row">
            <label for="cfgStorage">max storage limit (GB)</label>
            <input type="number" id="cfgStorage" name="maxStorageGb" value="${config.maxStorageGb || 50}" />
          </div>
          <button type="submit" class="btn-primary">save configuration</button>
        </form>
      </div>`;

    document.getElementById('adminConfigForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target));
      body.maxStorageGb = parseInt(body.maxStorageGb, 10);
      try {
        await CumuApi.put('/admin/config', body);
        alert('Configuration saved!');
      } catch (err) {
        alert(err.message || 'Save failed');
      }
    });
  }

  // ── 8. System Logs Tab ────────────────────────────────────────────────────
  async function renderLogsTab(container) {
    const logs = await CumuApi.get('/admin/logs');
    container.innerHTML = `
      <div class="card">
        <h2>system logs (${logs.length})</h2>
        <div style="overflow-x:auto;max-height:500px">
          <table>
            <thead>
              <tr><th>Time</th><th>Level</th><th>Category</th><th>Message</th></tr>
            </thead>
            <tbody>
              ${logs.map(l => `
                <tr>
                  <td class="mute caption" style="white-space:nowrap">${new Date(l.timestamp * 1000).toLocaleString()}</td>
                  <td><span class="chip">${l.level}</span></td>
                  <td><code>${l.category}</code></td>
                  <td>${esc(l.message)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  return {
    renderLayout,
    switchTab,
    deleteSong,
    deleteAlbum,
    toggleUserBlock,
    deleteUser,
    deactivateClient,
  };
})();

window.CumuAdmin = CumuAdmin;
