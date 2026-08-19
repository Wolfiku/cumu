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
      <header class="mb-xl">
        <h1 class="font-display-xl text-display-xl text-on-surface">Admin Dashboard</h1>
      </header>
      <div class="flex gap-md border-b border-border-subtle pb-sm mb-xl overflow-x-auto no-scrollbar" id="adminTabs">
        <button class="font-body-lg text-body-lg pb-sm text-text-muted hover:text-on-surface transition-colors whitespace-nowrap" data-tab="upload" onclick="CumuAdmin.switchTab('upload')">Upload Music</button>
        <button class="font-body-lg text-body-lg pb-sm text-text-muted hover:text-on-surface transition-colors whitespace-nowrap" data-tab="stats" onclick="CumuAdmin.switchTab('stats')">Settings & Stats</button>
        <button class="font-body-lg text-body-lg pb-sm text-text-muted hover:text-on-surface transition-colors whitespace-nowrap" data-tab="scan" onclick="CumuAdmin.switchTab('scan')">Scan Library</button>
        <button class="font-body-lg text-body-lg pb-sm text-text-muted hover:text-on-surface transition-colors whitespace-nowrap" data-tab="songs" onclick="CumuAdmin.switchTab('songs')">Songs</button>
        <button class="font-body-lg text-body-lg pb-sm text-text-muted hover:text-on-surface transition-colors whitespace-nowrap" data-tab="albums" onclick="CumuAdmin.switchTab('albums')">Albums</button>
        <button class="font-body-lg text-body-lg pb-sm text-text-muted hover:text-on-surface transition-colors whitespace-nowrap" data-tab="users" onclick="CumuAdmin.switchTab('users')">Users</button>
        <button class="font-body-lg text-body-lg pb-sm text-text-muted hover:text-on-surface transition-colors whitespace-nowrap" data-tab="oauth" onclick="CumuAdmin.switchTab('oauth')">OAuth Clients</button>
        <button class="font-body-lg text-body-lg pb-sm text-text-muted hover:text-on-surface transition-colors whitespace-nowrap" data-tab="podcasts" onclick="CumuAdmin.switchTab('podcasts')">Podcasts</button>
        <button class="font-body-lg text-body-lg pb-sm text-text-muted hover:text-on-surface transition-colors whitespace-nowrap" data-tab="logs" onclick="CumuAdmin.switchTab('logs')">System Logs</button>
      </div>
      <div id="adminTabContent" class="flex flex-col gap-xl"></div>
    `;
  }

  async function switchTab(tabName) {
    activeTab = tabName;
    const buttons = document.querySelectorAll('#adminTabs button');
    buttons.forEach(btn => {
      if (btn.dataset.tab === tabName) {
        btn.classList.add('border-b-2', 'border-primary', 'text-on-surface');
        btn.classList.remove('text-text-muted');
      } else {
        btn.classList.remove('border-b-2', 'border-primary', 'text-on-surface');
        btn.classList.add('text-text-muted');
      }
    });

    const content = document.getElementById('adminTabContent');
    if (!content) return;

    content.innerHTML = '<div class="text-text-muted text-body-lg font-body-lg">Lade...</div>';

    if      (tabName === 'upload') renderUploadTab(content);
    else if (tabName === 'scan')   renderScanTab(content);
    else if (tabName === 'songs')  renderSongsTab(content);
    else if (tabName === 'albums') renderAlbumsTab(content);
    else if (tabName === 'users')  renderUsersTab(content);
    else if (tabName === 'oauth')  renderOAuthTab(content);
    else if (tabName === 'podcasts') renderPodcastsTab(content);
    else if (tabName === 'stats')  renderStatsTab(content);
    else if (tabName === 'logs')   renderLogsTab(content);
  }

  // ── 1. Upload Tab ─────────────────────────────────────────────────────────
  function renderUploadTab(container) {
    container.innerHTML = `
      <section class="flex flex-col gap-md">
        <h2 class="font-title-md text-title-md text-on-surface border-b border-border-subtle pb-sm">Musik & Audiobooks hochladen</h2>
        
        <div id="adminDropzone" class="border-2 border-dashed border-border-subtle hover:border-text-muted rounded-xl p-xl flex flex-col items-center justify-center gap-xs cursor-pointer transition-colors text-center bg-surface-bright/50 hover:bg-surface-bright">
          <span class="material-symbols-outlined text-4xl text-text-muted">cloud_upload</span>
          <span class="font-body-lg text-body-lg text-on-surface font-bold">Dateien hierher ziehen oder klicken</span>
          <span class="font-body-sm text-body-sm text-text-muted">MP3, M4A, FLAC, WAV, AAC, OGG (Max 200 Dateien)</span>
        </div>

        <form id="adminUploadForm" enctype="multipart/form-data" class="flex flex-col gap-md">
          
          <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors">
            <div class="flex flex-col gap-xs">
              <span class="font-body-lg text-body-lg text-on-surface">Audio Dateien (Max 200)</span>
              <span class="font-body-sm text-body-sm text-text-muted">Unterstützte Formate: MP3, M4A, FLAC, AAC, WAV, OGG.</span>
            </div>
            <input type="file" id="uploadFiles" name="files" multiple accept="audio/*" class="font-body-sm text-body-sm text-on-surface bg-transparent max-w-[200px]" />
          </div>

          <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors">
            <div class="flex flex-col gap-xs">
              <span class="font-body-lg text-body-lg text-on-surface">Cover Art (Optional)</span>
              <span class="font-body-sm text-body-sm text-text-muted">Unterstützte Formate: JPG, PNG.</span>
            </div>
            <input type="file" id="uploadCover" name="cover" accept="image/*" class="font-body-sm text-body-sm text-on-surface bg-transparent max-w-[200px]" />
          </div>

          <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors">
            <div class="flex flex-col gap-xs">
              <span class="font-body-lg text-body-lg text-on-surface">Interpret (Optional)</span>
              <span class="font-body-sm text-body-sm text-text-muted">Überschreibt ID3 Tags.</span>
            </div>
            <input type="text" id="uploadArtist" name="artist" placeholder="Interpret" class="font-body-lg text-body-lg text-on-surface bg-transparent border-0 border-b border-border-subtle focus:border-text-muted focus:ring-0 p-0 text-right w-48" />
          </div>

          <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors">
            <div class="flex flex-col gap-xs">
              <span class="font-body-lg text-body-lg text-on-surface">Album (Optional)</span>
              <span class="font-body-sm text-body-sm text-text-muted">Überschreibt ID3 Tags.</span>
            </div>
            <input type="text" id="uploadAlbum" name="album" placeholder="Album" class="font-body-lg text-body-lg text-on-surface bg-transparent border-0 border-b border-border-subtle focus:border-text-muted focus:ring-0 p-0 text-right w-48" />
          </div>

          <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors">
            <div class="flex flex-col gap-xs">
              <span class="font-body-lg text-body-lg text-on-surface">Genre (Optional)</span>
              <span class="font-body-sm text-body-sm text-text-muted">Überschreibt ID3 Tags. (Z.B. Ambient, Podcast)</span>
            </div>
            <input type="text" id="uploadGenre" name="genre" placeholder="Genre" class="font-body-lg text-body-lg text-on-surface bg-transparent border-0 border-b border-border-subtle focus:border-text-muted focus:ring-0 p-0 text-right w-48" />
          </div>

          <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors">
            <div class="flex flex-col gap-xs">
              <span class="font-body-lg text-body-lg text-on-surface">Als Audiobook markieren</span>
              <span class="font-body-sm text-body-sm text-text-muted">Kategorisiert als Spoken Word/Podcast.</span>
            </div>
            <label class="relative inline-flex items-center cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-200">
              <input type="checkbox" name="isAudiobook" value="true" class="sr-only peer" />
              <div class="w-11 h-6 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-text-muted"></div>
            </label>
          </div>

          <div class="flex items-center gap-md mt-sm px-md">
            <button type="submit" id="uploadSubmitBtn" class="px-md py-sm bg-text-muted text-on-primary font-body-sm text-body-sm rounded hover:scale-105 active:scale-95 transition-all duration-200">Dateien hochladen</button>
            <span id="uploadStatus" class="font-body-sm text-body-sm text-text-muted"></span>
          </div>
        </form>
      </section>`;

    const dropzone = document.getElementById('adminDropzone');
    const fileInput = document.getElementById('uploadFiles');

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('border-primary'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('border-primary'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-primary');
      if (e.dataTransfer.files?.length) {
        fileInput.files = e.dataTransfer.files;
        document.getElementById('uploadStatus').textContent = `${e.dataTransfer.files.length} Datei(en) ausgewählt. Klicke auf 'Dateien hochladen'.`;
      }
    });

    document.getElementById('adminUploadForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const statusEl = document.getElementById('uploadStatus');
      const submitBtn = document.getElementById('uploadSubmitBtn');
      statusEl.textContent = 'Upload läuft... Metadata wird extrahiert...';
      submitBtn.disabled = true;

      const formData = new FormData(e.target);
      try {
        const res = await CumuApi.postForm('/admin/upload', formData);
        if (res.success) {
          statusEl.textContent = `✅ Erfolgreich hochgeladen: ${res.uploaded} Song(s)!`;
          e.target.reset();
        } else {
          statusEl.textContent = `❌ ${res.error || 'Upload fehlgeschlagen'}`;
        }
      } catch (err) {
        statusEl.textContent = `❌ ${err.message || 'Netzwerkfehler'}`;
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  // ── 2. Scan Tab ───────────────────────────────────────────────────────────
  function renderScanTab(container) {
    container.innerHTML = `
      <section class="flex flex-col gap-md">
        <h2 class="font-title-md text-title-md text-on-surface border-b border-border-subtle pb-sm">Bibliothek Scannen</h2>
        <div class="flex flex-col gap-sm p-md rounded-lg bg-surface-container-low">
          <p class="font-body-sm text-body-sm text-text-muted">Scannt den Musikordner des Servers nach manuell kopierten Audiodateien.</p>
          <div class="flex items-center gap-md mt-sm">
            <button id="btnScanLibrary" class="px-md py-sm bg-text-muted text-on-primary font-body-sm text-body-sm rounded hover:scale-105 active:scale-95 transition-all duration-200">Scan Starten</button>
            <span id="scanResult" class="font-body-sm text-body-sm"></span>
          </div>
        </div>
      </section>`;

    document.getElementById('btnScanLibrary').addEventListener('click', async () => {
      const resEl = document.getElementById('scanResult');
      resEl.textContent = 'Scan läuft auf dem Server…';
      resEl.className = 'font-body-sm text-body-sm text-text-muted';
      try {
        const res = await CumuApi.post('/admin/scan', {});
        if (res.success) {
          resEl.innerHTML = `✅ Scan abgeschlossen! ${res.scanned} Dateien gescannt, ${res.added} neue Songs hinzugefügt.`;
          resEl.className = 'font-body-sm text-body-sm text-on-surface';
        } else {
          resEl.innerHTML = `❌ ${res.error || 'Scan fehlgeschlagen'}`;
          resEl.className = 'font-body-sm text-body-sm text-danger';
        }
      } catch (err) {
        resEl.innerHTML = `❌ ${err.message || 'Fehler beim Scan'}`;
        resEl.className = 'font-body-sm text-body-sm text-danger';
      }
    });
  }

  // ── 3. Songs Tab ──────────────────────────────────────────────────────────
  async function renderSongsTab(container) {
    const songs = await CumuApi.get('/api/songs');
    if (!songs.length) {
      container.innerHTML = '<section class="flex flex-col gap-md"><div class="p-md rounded-lg bg-surface-container-low font-body-sm text-body-sm text-text-muted">Keine Songs gefunden</div></section>';
      return;
    }
    container.innerHTML = `
      <section class="flex flex-col gap-md">
        <h2 class="font-title-md text-title-md text-on-surface border-b border-border-subtle pb-sm">Songs (${songs.length})</h2>
        <div class="w-full overflow-x-auto rounded-lg border border-border-subtle">
          <table class="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr class="border-b border-border-subtle bg-surface-bright">
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Titel</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Interpret</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Album</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Dauer</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Plays</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Aktionen</th>
              </tr>
            </thead>
            <tbody class="font-body-sm text-body-sm text-on-surface">
              ${songs.map(s => `
                <tr class="border-b border-border-subtle hover:bg-surface-bright transition-colors last:border-0">
                  <td class="p-sm"><strong class="font-bold text-on-surface">${esc(s.title)}</strong> ${s.is_audiobook ? '<span class="text-text-muted ml-1">(Spoken)</span>' : ''}</td>
                  <td class="p-sm text-text-muted">${esc(s.artist_name || '—')}</td>
                  <td class="p-sm text-text-muted">${esc(s.album_title || '—')}</td>
                  <td class="p-sm text-text-muted">${formatTime(s.duration)}</td>
                  <td class="p-sm text-text-muted">${s.play_count || 0}</td>
                  <td class="p-sm">
                    <button class="text-text-muted hover:text-on-surface transition-colors mr-sm" onclick="navigate('song','edit:${s.id}')">Bearbeiten</button>
                    <button class="text-red-400 hover:text-red-300 transition-colors" onclick="CumuAdmin.deleteSong('${s.id}')">Löschen</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  async function deleteSong(songId) {
    if (!confirm('Bist du sicher, dass du diesen Song löschen willst?')) return;
    await CumuApi.del(`/admin/songs/${songId}`);
    switchTab('songs');
  }

  // ── 4. Albums Tab ─────────────────────────────────────────────────────────
  async function renderAlbumsTab(container) {
    const albums = await CumuApi.get('/api/albums');
    if (!albums.length) {
      container.innerHTML = '<section class="flex flex-col gap-md"><div class="p-md rounded-lg bg-surface-container-low font-body-sm text-body-sm text-text-muted">Keine Alben gefunden</div></section>';
      return;
    }
    container.innerHTML = `
      <section class="flex flex-col gap-md">
        <h2 class="font-title-md text-title-md text-on-surface border-b border-border-subtle pb-sm">Alben (${albums.length})</h2>
        <div class="w-full overflow-x-auto rounded-lg border border-border-subtle">
          <table class="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr class="border-b border-border-subtle bg-surface-bright">
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Titel</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Interpret</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Jahr</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Genre</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Aktionen</th>
              </tr>
            </thead>
            <tbody class="font-body-sm text-body-sm text-on-surface">
              ${albums.map(a => `
                <tr class="border-b border-border-subtle hover:bg-surface-bright transition-colors last:border-0">
                  <td class="p-sm"><strong class="font-bold text-on-surface">${esc(a.title)}</strong></td>
                  <td class="p-sm text-text-muted">${esc(a.artist_name || '—')}</td>
                  <td class="p-sm text-text-muted">${a.year || '—'}</td>
                  <td class="p-sm text-text-muted">${esc(a.genre || '—')}</td>
                  <td class="p-sm">
                    <button class="text-text-muted hover:text-on-surface transition-colors mr-sm" onclick="navigate('album','edit:${a.id}')">Bearbeiten</button>
                    <button class="text-red-400 hover:text-red-300 transition-colors" onclick="CumuAdmin.deleteAlbum('${a.id}')">Löschen</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  async function deleteAlbum(albumId) {
    if (!confirm('Album und alle enthaltenen Songs löschen?')) return;
    await CumuApi.del(`/admin/albums/${albumId}`);
    switchTab('albums');
  }

  // ── 5. Users Tab ──────────────────────────────────────────────────────────
  async function renderUsersTab(container) {
    const users = await CumuApi.get('/admin/users');
    container.innerHTML = `
      <section class="flex flex-col gap-md mb-xl">
        <h2 class="font-title-md text-title-md text-on-surface border-b border-border-subtle pb-sm">Neuen User anlegen</h2>
        <form id="addUserForm" class="flex flex-col gap-md">
          <div class="flex flex-wrap gap-md">
            <div class="flex-1 min-w-[140px]">
              <label for="newUsername" class="font-body-sm text-body-sm text-text-muted block mb-xs">Username</label>
              <input type="text" id="newUsername" name="username" required placeholder="Username" class="w-full font-body-lg text-body-lg text-on-surface bg-transparent border-0 border-b border-border-subtle focus:border-text-muted focus:ring-0 p-0" />
            </div>
            <div class="flex-1 min-w-[140px]">
              <label for="newPassword" class="font-body-sm text-body-sm text-text-muted block mb-xs">Passwort</label>
              <input type="password" id="newPassword" name="password" required placeholder="Passwort" class="w-full font-body-lg text-body-lg text-on-surface bg-transparent border-0 border-b border-border-subtle focus:border-text-muted focus:ring-0 p-0" />
            </div>
            <div class="w-[120px]">
              <label for="newRole" class="font-body-sm text-body-sm text-text-muted block mb-xs">Rolle</label>
              <select id="newRole" name="role" class="w-full font-body-lg text-body-lg text-on-surface bg-transparent border-0 border-b border-border-subtle focus:border-text-muted focus:ring-0 p-0">
                <option value="user" class="bg-surface-container-low text-on-surface">User</option>
                <option value="admin" class="bg-surface-container-low text-on-surface">Admin</option>
              </select>
            </div>
          </div>
          <div class="mt-sm">
            <button type="submit" class="px-md py-sm bg-text-muted text-on-primary font-body-sm text-body-sm rounded hover:scale-105 active:scale-95 transition-all duration-200">User anlegen</button>
          </div>
        </form>
      </section>

      <section class="flex flex-col gap-md">
        <h2 class="font-title-md text-title-md text-on-surface border-b border-border-subtle pb-sm">User (${users.length})</h2>
        <div class="w-full overflow-x-auto rounded-lg border border-border-subtle">
          <table class="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr class="border-b border-border-subtle bg-surface-bright">
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Username</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Rolle</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Status</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Theme</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Aktionen</th>
              </tr>
            </thead>
            <tbody class="font-body-sm text-body-sm text-on-surface">
              ${users.map(u => `
                <tr class="border-b border-border-subtle hover:bg-surface-bright transition-colors last:border-0">
                  <td class="p-sm"><strong class="font-bold text-on-surface">${esc(u.username)}</strong></td>
                  <td class="p-sm text-text-muted">${u.role}</td>
                  <td class="p-sm">${u.is_blocked ? '<span class="text-red-400">Blockiert</span>' : '<span class="text-green-400">Aktiv</span>'}</td>
                  <td class="p-sm text-text-muted">${u.theme || 'standard'}</td>
                  <td class="p-sm">
                    <button class="text-text-muted hover:text-on-surface transition-colors mr-sm" onclick="CumuAdmin.toggleUserBlock('${u.id}', ${!u.is_blocked})">
                      ${u.is_blocked ? 'Entblocken' : 'Blockieren'}
                    </button>
                    <button class="text-red-400 hover:text-red-300 transition-colors" onclick="CumuAdmin.deleteUser('${u.id}')">Löschen</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>`;

    document.getElementById('addUserForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target));
      try {
        await CumuApi.post('/admin/users', body);
        switchTab('users');
      } catch (err) {
        alert(err.message || 'Konnte User nicht anlegen');
      }
    });
  }

  async function toggleUserBlock(userId, isBlocked) {
    await CumuApi.put(`/admin/users/${userId}`, { is_blocked: isBlocked });
    switchTab('users');
  }

  async function deleteUser(userId) {
    if (!confirm('User löschen?')) return;
    await CumuApi.del(`/admin/users/${userId}`);
    switchTab('users');
  }

  // ── 6. OAuth Clients Tab ──────────────────────────────────────────────────
  async function renderOAuthTab(container) {
    const clients = await CumuApi.get('/admin/oauth/clients');
    container.innerHTML = `
      <section class="flex flex-col gap-md mb-xl">
        <h2 class="font-title-md text-title-md text-on-surface border-b border-border-subtle pb-sm">Neuen OAuth Client registrieren</h2>
        <form id="addClientForm" class="flex flex-col gap-md">
          <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors">
            <div class="flex flex-col gap-xs">
              <span class="font-body-lg text-body-lg text-on-surface">Client Name</span>
              <span class="font-body-sm text-body-sm text-text-muted">z.B. Cumu Mobile App</span>
            </div>
            <input type="text" id="clientName" name="name" required placeholder="Name" class="font-body-lg text-body-lg text-on-surface bg-transparent border-0 border-b border-border-subtle focus:border-text-muted focus:ring-0 p-0 text-right w-64" />
          </div>
          <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors">
            <div class="flex flex-col gap-xs">
              <span class="font-body-lg text-body-lg text-on-surface">Redirect URIs</span>
              <span class="font-body-sm text-body-sm text-text-muted">JSON Array oder kommagetrennt</span>
            </div>
            <input type="text" id="clientUris" name="redirect_uris" placeholder='["http://localhost:8080/callback"]' class="font-body-lg text-body-lg text-on-surface bg-transparent border-0 border-b border-border-subtle focus:border-text-muted focus:ring-0 p-0 text-right w-64" />
          </div>
          <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors">
            <div class="flex flex-col gap-xs">
              <span class="font-body-lg text-body-lg text-on-surface">Scopes</span>
              <span class="font-body-sm text-body-sm text-text-muted">read, write</span>
            </div>
            <input type="text" id="clientScopes" name="scopes" value="read write" class="font-body-lg text-body-lg text-on-surface bg-transparent border-0 border-b border-border-subtle focus:border-text-muted focus:ring-0 p-0 text-right w-64" />
          </div>
          <div class="flex items-center gap-md mt-sm px-md">
            <button type="submit" class="px-md py-sm bg-text-muted text-on-primary font-body-sm text-body-sm rounded hover:scale-105 active:scale-95 transition-all duration-200">Client registrieren</button>
            <div id="newClientSecretDisplay"></div>
          </div>
        </form>
      </section>

      <section class="flex flex-col gap-md">
        <h2 class="font-title-md text-title-md text-on-surface border-b border-border-subtle pb-sm">Registrierte OAuth Clients (${clients.length})</h2>
        <div class="w-full overflow-x-auto rounded-lg border border-border-subtle">
          <table class="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr class="border-b border-border-subtle bg-surface-bright">
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Name</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Client ID</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Scopes</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Aktiv</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Aktionen</th>
              </tr>
            </thead>
            <tbody class="font-body-sm text-body-sm text-on-surface">
              ${clients.map(c => `
                <tr class="border-b border-border-subtle hover:bg-surface-bright transition-colors last:border-0">
                  <td class="p-sm"><strong class="font-bold text-on-surface">${esc(c.name)}</strong></td>
                  <td class="p-sm font-mono text-xs text-text-muted">${esc(c.client_id)}</td>
                  <td class="p-sm text-text-muted">${esc(c.scopes)}</td>
                  <td class="p-sm">${c.is_active ? '✅' : '❌'}</td>
                  <td class="p-sm">
                    ${c.is_active ? `<button class="text-red-400 hover:text-red-300 transition-colors" onclick="CumuAdmin.deactivateClient('${c.id}')">Deaktivieren</button>` : '<span class="text-text-muted">Inaktiv</span>'}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>`;

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
          <div class="font-body-sm text-body-sm text-green-400 mt-md">
            <strong>Client registriert!</strong> Client ID: <span class="font-mono">${res.clientId}</span>, Secret: <span class="font-mono">${res.clientSecret}</span> (Unbedingt speichern!)
          </div>`;
        e.target.reset();
      } catch (err) {
        alert(err.message || 'Client konnte nicht registriert werden');
      }
    });
  }

  async function deactivateClient(id) {
    if (!confirm('Client deaktivieren? Existierende Tokens werden widerrufen.')) return;
    await CumuApi.del(`/admin/oauth/clients/${id}`);
    switchTab('oauth');
  }

  // ── 7. Podcasts Tab ───────────────────────────────────────────────────────
  async function renderPodcastsTab(container) {
    const config = await CumuApi.get('/admin/config');
    const customFeeds = config.customPodcastFeeds || [];

    container.innerHTML = `
      <section class="flex flex-col gap-md mb-xl">
        <h2 class="font-title-md text-title-md text-on-surface border-b border-border-subtle pb-sm">Podcasts Konfiguration</h2>
        <form id="adminPodcastsForm" class="flex flex-col gap-md">
          
          <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors">
            <div class="flex flex-col gap-xs">
              <span class="font-body-lg text-body-lg text-on-surface">Podcasts global aktivieren</span>
              <span class="font-body-sm text-body-sm text-text-muted">Zeigt Live Sets & Podcasts auf der Startseite und in der Seitenleiste.</span>
            </div>
            <label class="relative inline-flex items-center cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-200">
              <input type="checkbox" name="enablePodcasts" class="sr-only peer" ${config.enablePodcasts !== false ? 'checked' : ''} />
              <div class="w-11 h-6 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-text-muted"></div>
            </label>
          </div>

          <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors border-t border-border-subtle mt-sm pt-md">
            <div class="flex flex-col gap-xs">
              <span class="font-body-lg text-body-lg text-on-surface">Öffentliche Podcasts (API) aktivieren</span>
              <span class="font-body-sm text-body-sm text-text-muted">Lädt beliebte Podcasts aus externen Verzeichnissen.</span>
            </div>
            <label class="relative inline-flex items-center cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-200">
              <input type="checkbox" name="enablePublicPodcasts" class="sr-only peer" ${config.enablePublicPodcasts ? 'checked' : ''} />
              <div class="w-11 h-6 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-text-muted"></div>
            </label>
          </div>

          <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors">
            <div class="flex flex-col gap-xs">
              <span class="font-body-lg text-body-lg text-on-surface">Podcast API Quelle</span>
              <span class="font-body-sm text-body-sm text-text-muted">iTunes (Standard, kein Key) oder Podcast Index (Free/Open-Source).</span>
            </div>
            <select id="podcastApiSource" name="podcastApiSource" class="w-48 font-body-lg text-body-lg text-on-surface bg-transparent border-0 border-b border-border-subtle focus:border-text-muted focus:ring-0 p-0 text-right">
              <option value="itunes" class="bg-surface-container-low text-on-surface" ${config.podcastApiSource === 'itunes' ? 'selected' : ''}>iTunes API</option>
              <option value="podcastindex" class="bg-surface-container-low text-on-surface" ${config.podcastApiSource === 'podcastindex' ? 'selected' : ''}>Podcast Index API</option>
            </select>
          </div>

          <div id="piConfigBlock" class="flex flex-col gap-md pl-xl border-l-2 border-primary ${config.podcastApiSource === 'podcastindex' ? '' : 'hidden'}">
            <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors">
              <div class="flex flex-col gap-xs">
                <span class="font-body-lg text-body-lg text-on-surface">Podcast Index API Key</span>
              </div>
              <input type="text" name="podcastIndexKey" value="${esc(config.podcastIndexKey || '')}" class="font-body-lg text-body-lg text-on-surface bg-transparent border-0 border-b border-border-subtle focus:border-text-muted focus:ring-0 p-0 text-right w-64" />
            </div>
            <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors">
              <div class="flex flex-col gap-xs">
                <span class="font-body-lg text-body-lg text-on-surface">Podcast Index API Secret</span>
              </div>
              <input type="password" name="podcastIndexSecret" value="${esc(config.podcastIndexSecret || '')}" class="font-body-lg text-body-lg text-on-surface bg-transparent border-0 border-b border-border-subtle focus:border-text-muted focus:ring-0 p-0 text-right w-64" />
            </div>
          </div>

          <div class="flex items-center gap-md mt-sm px-md">
            <button type="submit" class="px-md py-sm bg-text-muted text-on-primary font-body-sm text-body-sm rounded hover:scale-105 active:scale-95 transition-all duration-200">Einstellungen speichern</button>
          </div>
        </form>
      </section>

      <section class="flex flex-col gap-md">
        <h2 class="font-title-md text-title-md text-on-surface border-b border-border-subtle pb-sm">Eigene RSS Feeds</h2>
        <div class="w-full overflow-x-auto rounded-lg border border-border-subtle mb-sm">
          <table class="w-full text-left border-collapse whitespace-nowrap" id="customFeedsTable">
            <thead>
              <tr class="border-b border-border-subtle bg-surface-bright">
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Titel</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">RSS URL</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Aktionen</th>
              </tr>
            </thead>
            <tbody class="font-body-sm text-body-sm text-on-surface">
              ${customFeeds.map((feed, index) => `
                <tr class="border-b border-border-subtle hover:bg-surface-bright transition-colors last:border-0" data-index="${index}">
                  <td class="p-sm"><strong class="font-bold text-on-surface">${esc(feed.title)}</strong></td>
                  <td class="p-sm text-text-muted truncate max-w-xs">${esc(feed.url)}</td>
                  <td class="p-sm">
                    <button class="text-red-400 hover:text-red-300 transition-colors remove-feed-btn" data-index="${index}">Entfernen</button>
                  </td>
                </tr>`).join('')}
              ${customFeeds.length === 0 ? '<tr><td colspan="3" class="p-sm text-center text-text-muted">Keine eigenen RSS Feeds vorhanden.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
        
        <form id="addCustomFeedForm" class="flex gap-md mt-xs">
          <input type="text" id="newFeedTitle" placeholder="Podcast Titel" required class="flex-1 font-body-sm text-body-sm text-on-surface bg-transparent border-0 border-b border-border-subtle focus:border-text-muted focus:ring-0 p-xs" />
          <input type="url" id="newFeedUrl" placeholder="https://.../rss" required class="flex-2 font-body-sm text-body-sm text-on-surface bg-transparent border-0 border-b border-border-subtle focus:border-text-muted focus:ring-0 p-xs" />
          <button type="submit" class="px-md py-sm bg-surface-container-high text-on-surface font-body-sm text-body-sm rounded hover:scale-105 active:scale-95 transition-all duration-200">+ Hinzufügen</button>
        </form>
      </section>
    `;

    // Dynamic show/hide of PI config
    document.getElementById('podcastApiSource').addEventListener('change', (e) => {
      const block = document.getElementById('piConfigBlock');
      if (e.target.value === 'podcastindex') block.classList.remove('hidden');
      else block.classList.add('hidden');
    });

    // Save Settings
    document.getElementById('adminPodcastsForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target));
      body.enablePodcasts = !!body.enablePodcasts;
      body.enablePublicPodcasts = !!body.enablePublicPodcasts;
      try {
        await CumuApi.put('/admin/config', body);
        if (window.currentUser) {
          window.currentUser.enablePodcasts = body.enablePodcasts;
          if (typeof window.updateNavigation === 'function') window.updateNavigation();
        }
        alert('Podcast-Einstellungen gespeichert!');
      } catch (err) {
        alert(err.message || 'Speichern fehlgeschlagen');
      }
    });

    // Add Custom Feed
    document.getElementById('addCustomFeedForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('newFeedTitle').value.trim();
      const url = document.getElementById('newFeedUrl').value.trim();
      if (!title || !url) return;
      
      const updatedFeeds = [...customFeeds, { title, url }];
      try {
        await CumuApi.put('/admin/config', { customPodcastFeeds: updatedFeeds });
        switchTab('podcasts');
      } catch (err) {
        alert(err.message || 'Speichern fehlgeschlagen');
      }
    });

    // Remove Custom Feed
    document.querySelectorAll('.remove-feed-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        const updatedFeeds = customFeeds.filter((_, i) => i !== idx);
        try {
          await CumuApi.put('/admin/config', { customPodcastFeeds: updatedFeeds });
          switchTab('podcasts');
        } catch (err) {
          alert(err.message || 'Löschen fehlgeschlagen');
        }
      });
    });
  }

  // ── 8. Stats & Server Config Tab ─────────────────────────────────────────
  async function renderStatsTab(container) {
    const stats  = await CumuApi.get('/admin/stats');
    const config = await CumuApi.get('/admin/config');

    const usedMb = (stats.storageUsedBytes / (1024 * 1024)).toFixed(1);

    container.innerHTML = `
      <section class="flex flex-col gap-md mb-xl">
        <h2 class="font-title-md text-title-md text-on-surface border-b border-border-subtle pb-sm">Server Konfiguration</h2>
        <form id="adminConfigForm" class="flex flex-col gap-md">
          
          <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors">
            <div class="flex flex-col gap-xs">
              <span class="font-body-lg text-body-lg text-on-surface">Music Storage Path</span>
              <span class="font-body-sm text-body-sm text-text-muted">Pfad auf dem Server (z.B. /home/user/music)</span>
            </div>
            <input type="text" id="cfgMusicPath" name="musicPath" value="${esc(config.musicPath || '')}" class="font-body-lg text-body-lg text-on-surface bg-transparent border-0 border-b border-border-subtle focus:border-text-muted focus:ring-0 p-0 text-right w-64" />
          </div>

          <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors">
            <div class="flex flex-col gap-xs">
              <span class="font-body-lg text-body-lg text-on-surface">Max Storage Limit</span>
              <span class="font-body-sm text-body-sm text-text-muted">Speicherlimit in Gigabyte.</span>
            </div>
            <input type="number" id="cfgStorage" name="maxStorageGb" value="${config.maxStorageGb || 50}" class="font-body-lg text-body-lg text-on-surface bg-transparent border-0 border-b border-border-subtle focus:border-text-muted focus:ring-0 p-0 text-right w-32" />
          </div>

          <div class="flex items-center gap-md mt-sm px-md">
            <button type="submit" class="px-md py-sm bg-text-muted text-on-primary font-body-sm text-body-sm rounded hover:scale-105 active:scale-95 transition-all duration-200">Konfiguration speichern</button>
          </div>
        </form>
      </section>

      <section class="flex flex-col gap-md">
        <h2 class="font-title-md text-title-md text-on-surface border-b border-border-subtle pb-sm">Server Statistiken</h2>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-md">
          <div class="bg-surface-container-low p-md rounded-lg">
            <div class="font-body-sm text-body-sm text-text-muted">Songs</div>
            <div class="font-display-xl text-[24px] text-on-surface">${stats.songs}</div>
          </div>
          <div class="bg-surface-container-low p-md rounded-lg">
            <div class="font-body-sm text-body-sm text-text-muted">Alben</div>
            <div class="font-display-xl text-[24px] text-on-surface">${stats.albums}</div>
          </div>
          <div class="bg-surface-container-low p-md rounded-lg">
            <div class="font-body-sm text-body-sm text-text-muted">Interpreten</div>
            <div class="font-display-xl text-[24px] text-on-surface">${stats.artists}</div>
          </div>
          <div class="bg-surface-container-low p-md rounded-lg">
            <div class="font-body-sm text-body-sm text-text-muted">User</div>
            <div class="font-display-xl text-[24px] text-on-surface">${stats.users}</div>
          </div>
          <div class="bg-surface-container-low p-md rounded-lg">
            <div class="font-body-sm text-body-sm text-text-muted">Speicher</div>
            <div class="font-display-xl text-[24px] text-on-surface">${usedMb} MB</div>
          </div>
        </div>
      </section>

      <section class="flex flex-col gap-md mt-xl pt-lg border-t border-border-subtle">
        <h2 class="font-title-md text-title-md text-on-surface border-b border-border-subtle pb-sm">System Update & Version</h2>
        <div class="flex justify-between items-center p-md rounded-lg bg-surface-container-low flex-wrap gap-md">
          <div class="flex flex-col gap-xs">
            <span class="font-body-lg text-body-lg text-on-surface">Version: <strong class="font-bold">v0.2.0-alpha</strong></span>
            <span class="font-body-sm text-body-sm text-text-muted" id="adminUpdateStatusText">Automatische Updates sind aktiv.</span>
          </div>
          <button id="btnTriggerAdminUpdate" class="px-md py-sm bg-text-muted text-on-primary font-body-sm text-body-sm rounded hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer">
            Jetzt auf Updates prüfen & aktualisieren
          </button>
        </div>
      </section>
    `;

    document.getElementById('adminConfigForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target));
      body.maxStorageGb = parseInt(body.maxStorageGb, 10);
      try {
        await CumuApi.put('/admin/config', body);
        alert('Konfiguration gespeichert!');
      } catch (err) {
        alert(err.message || 'Speichern fehlgeschlagen');
      }
    });

    document.getElementById('btnTriggerAdminUpdate')?.addEventListener('click', async () => {
      const btn = document.getElementById('btnTriggerAdminUpdate');
      const statusText = document.getElementById('adminUpdateStatusText');
      btn.disabled = true;
      btn.textContent = 'Prüfe auf Updates...';
      statusText.textContent = 'Verbindung zu GitHub wird aufgebaut...';

      try {
        const res = await CumuApi.post('/admin/update', {});
        statusText.textContent = res.message || 'Update wird ausgeführt...';
        btn.textContent = 'Update Gestartet';
      } catch (err) {
        statusText.textContent = err.message || 'Update-Prüfung fehlgeschlagen.';
        btn.disabled = false;
        btn.textContent = 'Erneut Versuchen';
      }
    });
  }

  // ── 8. System Logs Tab ────────────────────────────────────────────────────
  async function renderLogsTab(container) {
    const logs = await CumuApi.get('/admin/logs');
    container.innerHTML = `
      <section class="flex flex-col gap-md">
        <h2 class="font-title-md text-title-md text-on-surface border-b border-border-subtle pb-sm">System Logs (${logs.length})</h2>
        <div class="w-full overflow-x-auto rounded-lg border border-border-subtle max-h-[500px]">
          <table class="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr class="border-b border-border-subtle bg-surface-bright sticky top-0">
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Zeit</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Level</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Kategorie</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Nachricht</th>
              </tr>
            </thead>
            <tbody class="font-body-sm text-body-sm text-on-surface">
              ${logs.map(l => `
                <tr class="border-b border-border-subtle hover:bg-surface-bright transition-colors last:border-0">
                  <td class="p-sm text-text-muted">${new Date(l.timestamp * 1000).toLocaleString()}</td>
                  <td class="p-sm"><span class="px-xs py-[2px] rounded text-xs bg-surface-container-high text-text-muted">${l.level}</span></td>
                  <td class="p-sm font-mono text-xs text-text-muted">${l.category}</td>
                  <td class="p-sm whitespace-normal break-all">${esc(l.message)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>`;
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
