/**
 * cumu Admin Module
 * Tabs: Upload, Songs, Albums, Users, OAuth Clients, Server Config, Logs, Stats.
 */

const CumuAdmin = (function() {
  let activeTab = 'upload';

  function renderLayout(container) {
    const html = `
      <div class="flex flex-col gap-lg">
        <header class="flex justify-between items-center border-b border-border-subtle pb-md">
          <h1 class="font-headline-lg text-headline-lg lowercase text-on-surface font-bold">admin dashboard</h1>
        </header>

        <nav class="flex gap-md border-b border-border-subtle overflow-x-auto pb-xs" id="adminTabs">
          <button class="font-body-lg text-body-lg pb-sm text-on-surface border-b-2 border-primary font-bold whitespace-nowrap" data-tab="upload" onclick="CumuAdmin.switchTab('upload')">Upload</button>
          <button class="font-body-lg text-body-lg pb-sm text-text-muted hover:text-on-surface transition-colors whitespace-nowrap" data-tab="songs" onclick="CumuAdmin.switchTab('songs')">Songs</button>
          <button class="font-body-lg text-body-lg pb-sm text-text-muted hover:text-on-surface transition-colors whitespace-nowrap" data-tab="albums" onclick="CumuAdmin.switchTab('albums')">Albums</button>
          <button class="font-body-lg text-body-lg pb-sm text-text-muted hover:text-on-surface transition-colors whitespace-nowrap" data-tab="scan" onclick="CumuAdmin.switchTab('scan')">Scan Library</button>
          <button class="font-body-lg text-body-lg pb-sm text-text-muted hover:text-on-surface transition-colors whitespace-nowrap" data-tab="users" onclick="CumuAdmin.switchTab('users')">Users</button>
          <button class="font-body-lg text-body-lg pb-sm text-text-muted hover:text-on-surface transition-colors whitespace-nowrap" data-tab="oauth" onclick="CumuAdmin.switchTab('oauth')">OAuth Clients</button>
          <button class="font-body-lg text-body-lg pb-sm text-text-muted hover:text-on-surface transition-colors whitespace-nowrap" data-tab="podcasts" onclick="CumuAdmin.switchTab('podcasts')">Podcasts</button>
          <button class="font-body-lg text-body-lg pb-sm text-text-muted hover:text-on-surface transition-colors whitespace-nowrap" data-tab="agents" onclick="CumuAdmin.switchTab('agents')">AI Agents</button>
          <button class="font-body-lg text-body-lg pb-sm text-text-muted hover:text-on-surface transition-colors whitespace-nowrap" data-tab="stats" onclick="CumuAdmin.switchTab('stats')">Server Config & Stats</button>
          <button class="font-body-lg text-body-lg pb-sm text-text-muted hover:text-on-surface transition-colors whitespace-nowrap" data-tab="logs" onclick="CumuAdmin.switchTab('logs')">Logs</button>
        </nav>

        <div id="adminTabContent"></div>
      </div>`;

    if (container) {
      container.innerHTML = html;
      switchTab('upload');
    }
    return html;
  }

  function switchTab(tabName) {
    activeTab = tabName;
    document.querySelectorAll('#adminTabs button').forEach(btn => {
      if (btn.dataset.tab === tabName) {
        btn.className = 'font-body-lg text-body-lg pb-sm text-on-surface border-b-2 border-primary font-bold whitespace-nowrap';
      } else {
        btn.className = 'font-body-lg text-body-lg pb-sm text-text-muted hover:text-on-surface transition-colors whitespace-nowrap';
      }
    });

    const content = document.getElementById('adminTabContent');
    if (!content) return;
    content.innerHTML = '<div class="p-md text-text-muted">Loading...</div>';

    if (tabName === 'upload')      renderUploadTab(content);
    else if (tabName === 'songs')  renderSongsTab(content);
    else if (tabName === 'albums') renderAlbumsTab(content);
    else if (tabName === 'scan')   renderScanTab(content);
    else if (tabName === 'users')  renderUsersTab(content);
    else if (tabName === 'oauth')  renderOAuthTab(content);
    else if (tabName === 'podcasts') renderPodcastsTab(content);
    else if (tabName === 'agents') renderAgentsTab(content);
    else if (tabName === 'stats')  renderStatsTab(content);
    else if (tabName === 'logs')   renderLogsTab(content);
  }

  // ── 1. Upload Tab ─────────────────────────────────────────────────────────
  function renderUploadTab(container) {
    container.innerHTML = `
      <section class="flex flex-col gap-md">
        <h2 class="font-title-md text-title-md text-on-surface border-b border-border-subtle pb-sm">Upload Music</h2>
        
        <div id="adminDropzone" class="border-2 border-dashed border-border-subtle hover:border-text-muted rounded-xl p-xl flex flex-col items-center justify-center gap-xs cursor-pointer transition-colors text-center bg-surface-bright/50 hover:bg-surface-bright">
          <span class="material-symbols-outlined text-4xl text-text-muted">cloud_upload</span>
          <span class="font-body-lg text-body-lg text-on-surface font-bold">Drag files here or click to browse</span>
          <span class="font-body-sm text-body-sm text-text-muted">MP3, M4A, FLAC, WAV, AAC, OGG (Max 200 files)</span>
        </div>

        <form id="adminUploadForm" enctype="multipart/form-data" class="flex flex-col gap-md">
          
          <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors">
            <div class="flex flex-col gap-xs">
              <span class="font-body-lg text-body-lg text-on-surface">Audio Files (Max 200)</span>
              <span class="font-body-sm text-body-sm text-text-muted">Supported formats: MP3, M4A, FLAC, AAC, WAV, OGG.</span>
            </div>
            <input type="file" id="uploadFiles" name="files" multiple accept="audio/*" class="font-body-sm text-body-sm text-on-surface bg-transparent max-w-[200px]" />
          </div>

          <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors">
            <div class="flex flex-col gap-xs">
              <span class="font-body-lg text-body-lg text-on-surface">Cover Art (Optional)</span>
              <span class="font-body-sm text-body-sm text-text-muted">Supported formats: JPG, PNG.</span>
            </div>
            <input type="file" id="uploadCover" name="cover" accept="image/*" class="font-body-sm text-body-sm text-on-surface bg-transparent max-w-[200px]" />
          </div>

          <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors">
            <div class="flex flex-col gap-xs">
              <span class="font-body-lg text-body-lg text-on-surface">Artist (Optional)</span>
              <span class="font-body-sm text-body-sm text-text-muted">Overrides ID3 tags.</span>
            </div>
            <input type="text" id="uploadArtist" name="artist" placeholder="Artist" class="font-body-lg text-body-lg text-on-surface bg-transparent border-0 border-b border-border-subtle focus:border-text-muted focus:ring-0 p-0 text-right w-48" />
          </div>

          <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors">
            <div class="flex flex-col gap-xs">
              <span class="font-body-lg text-body-lg text-on-surface">Album (Optional)</span>
              <span class="font-body-sm text-body-sm text-text-muted">Overrides ID3 tags.</span>
            </div>
            <input type="text" id="uploadAlbum" name="album" placeholder="Album" class="font-body-lg text-body-lg text-on-surface bg-transparent border-0 border-b border-border-subtle focus:border-text-muted focus:ring-0 p-0 text-right w-48" />
          </div>

          <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors">
            <div class="flex flex-col gap-xs">
              <span class="font-body-lg text-body-lg text-on-surface">Genre (Optional)</span>
              <span class="font-body-sm text-body-sm text-text-muted">Overrides ID3 tags. (e.g. Ambient, Podcast)</span>
            </div>
            <input type="text" id="uploadGenre" name="genre" placeholder="Genre" class="font-body-lg text-body-lg text-on-surface bg-transparent border-0 border-b border-border-subtle focus:border-text-muted focus:ring-0 p-0 text-right w-48" />
          </div>

          <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors">
            <div class="flex flex-col gap-xs">
              <span class="font-body-lg text-body-lg text-on-surface">Mark as Audiobook</span>
              <span class="font-body-sm text-body-sm text-text-muted">Categorized as Spoken Word/Podcast.</span>
            </div>
            <label class="relative inline-flex items-center cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-200">
              <input type="checkbox" name="isAudiobook" value="true" class="sr-only peer" />
              <div class="w-11 h-6 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-text-muted"></div>
            </label>
          </div>

          <div class="flex items-center gap-md mt-sm px-md">
            <button type="submit" id="uploadSubmitBtn" class="px-md py-sm bg-text-muted text-on-primary font-body-sm text-body-sm rounded hover:scale-105 active:scale-95 transition-all duration-200">Upload Files</button>
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
        document.getElementById('uploadStatus').textContent = `${e.dataTransfer.files.length} file(s) selected. Click 'Upload Files'.`;
      }
    });

    document.getElementById('adminUploadForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const statusEl = document.getElementById('uploadStatus');
      const submitBtn = document.getElementById('uploadSubmitBtn');
      statusEl.textContent = 'Upload in progress... Extracting metadata...';
      submitBtn.disabled = true;

      const formData = new FormData(e.target);
      try {
        const res = await CumuApi.postForm('/admin/upload', formData);
        if (res.success) {
          statusEl.textContent = `Successfully uploaded: ${res.uploaded} song(s)!`;
          e.target.reset();
        } else {
          statusEl.textContent = `${res.error || 'Upload failed'}`;
        }
      } catch (err) {
        statusEl.textContent = `${err.message || 'Network error'}`;
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  // ── 2. Scan Tab ───────────────────────────────────────────────────────────
  function renderScanTab(container) {
    container.innerHTML = `
      <section class="flex flex-col gap-md">
        <h2 class="font-title-md text-title-md text-on-surface border-b border-border-subtle pb-sm">Scan Library</h2>
        <div class="flex flex-col gap-sm p-md rounded-lg bg-surface-container-low">
          <p class="font-body-sm text-body-sm text-text-muted">Scans the server's music folder for manually copied audio files.</p>
          <div class="flex items-center gap-md mt-sm">
            <button id="btnScanLibrary" class="px-md py-sm bg-text-muted text-on-primary font-body-sm text-body-sm rounded hover:scale-105 active:scale-95 transition-all duration-200">Start Scan</button>
            <span id="scanResult" class="font-body-sm text-body-sm"></span>
          </div>
        </div>
      </section>`;

    document.getElementById('btnScanLibrary').addEventListener('click', async () => {
      const resEl = document.getElementById('scanResult');
      resEl.textContent = 'Scan running on server…';
      resEl.className = 'font-body-sm text-body-sm text-text-muted';
      try {
        const res = await CumuApi.post('/admin/scan', {});
        if (res.success) {
          resEl.innerHTML = `Scan complete! ${res.scanned} files scanned, ${res.added} new songs added.`;
          resEl.className = 'font-body-sm text-body-sm text-on-surface';
        } else {
          resEl.innerHTML = `${res.error || 'Scan failed'}`;
          resEl.className = 'font-body-sm text-body-sm text-danger';
        }
      } catch (err) {
        resEl.innerHTML = `${err.message || 'Error during scan'}`;
        resEl.className = 'font-body-sm text-body-sm text-danger';
      }
    });
  }

  // ── 3. Songs Tab ──────────────────────────────────────────────────────────
  async function renderSongsTab(container) {
    const songs = await CumuApi.get('/api/songs?limit=200');
    if (!songs || !songs.length) {
      container.innerHTML = '<section class="flex flex-col gap-md"><div class="p-md rounded-lg bg-surface-container-low font-body-sm text-body-sm text-text-muted">No songs found</div></section>';
      return;
    }

    container.innerHTML = `
      <section class="flex flex-col gap-md">
        <h2 class="font-title-md text-title-md text-on-surface border-b border-border-subtle pb-sm">Manage Songs (${songs.length})</h2>
        <div class="w-full overflow-x-auto rounded-lg border border-border-subtle">
          <table class="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr class="border-b border-border-subtle bg-surface-bright">
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Title</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Artist</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Album</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Duration</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Actions</th>
              </tr>
            </thead>
            <tbody class="font-body-sm text-body-sm text-on-surface">
              ${songs.map(s => `
                <tr class="border-b border-border-subtle hover:bg-surface-bright transition-colors last:border-0">
                  <td class="p-sm flex items-center gap-sm">
                    <span class="material-symbols-outlined text-text-muted cursor-pointer" onclick="CumuApp.playTrack('${s.id}')">play_arrow</span>
                    <span class="font-bold text-on-surface">${esc(s.title)}</span>
                  </td>
                  <td class="p-sm text-text-muted">${esc(s.artist_name || '—')}</td>
                  <td class="p-sm text-text-muted">${esc(s.album_title || '—')}</td>
                  <td class="p-sm text-text-muted font-mono text-xs">${formatTime(s.duration)}</td>
                  <td class="p-sm">
                    <button class="text-primary hover:underline transition-colors mr-sm" onclick="CumuAdmin.lookupSong('${s.id}')" title="AI / MusicBrainz Metadata Lookup">Lookup</button>
                    <button class="text-text-muted hover:text-on-surface transition-colors mr-sm" onclick="navigate('song','edit:${s.id}')">Edit</button>
                    <button class="text-red-400 hover:text-red-300 transition-colors" onclick="CumuAdmin.deleteSong('${s.id}')">Delete</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  async function deleteSong(songId) {
    if (!confirm('Are you sure you want to delete this song?')) return;
    await CumuApi.del(`/admin/songs/${songId}`);
    switchTab('songs');
  }

  // ── 4. Albums Tab ─────────────────────────────────────────────────────────
  async function renderAlbumsTab(container) {
    const albums = await CumuApi.get('/api/albums');
    if (!albums || !albums.length) {
      container.innerHTML = '<section class="flex flex-col gap-md"><div class="p-md rounded-lg bg-surface-container-low font-body-sm text-body-sm text-text-muted">No albums found</div></section>';
      return;
    }

    container.innerHTML = `
      <section class="flex flex-col gap-md">
        <h2 class="font-title-md text-title-md text-on-surface border-b border-border-subtle pb-sm">Manage Albums (${albums.length})</h2>
        <div class="w-full overflow-x-auto rounded-lg border border-border-subtle">
          <table class="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr class="border-b border-border-subtle bg-surface-bright">
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Title</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Artist</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Year</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Tracks</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Actions</th>
              </tr>
            </thead>
            <tbody class="font-body-sm text-body-sm text-on-surface">
              ${albums.map(a => {
                const coverSrc = a.cover ? (a.cover.startsWith('http') ? a.cover : `/stream/cover/${encodeURIComponent(a.cover)}`) : null;
                const coverHtml = coverSrc
                  ? `<img src="${coverSrc}" class="w-8 h-8 rounded object-cover flex-shrink-0" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" /><div class="w-8 h-8 rounded bg-surface-container-high hidden items-center justify-center text-text-muted flex-shrink-0"><span class="material-symbols-outlined text-[18px]">album</span></div>`
                  : `<div class="w-8 h-8 rounded bg-surface-container-high flex items-center justify-center text-text-muted flex-shrink-0"><span class="material-symbols-outlined text-[18px]">album</span></div>`;
                return `
                <tr class="border-b border-border-subtle hover:bg-surface-bright transition-colors last:border-0">
                  <td class="p-sm flex items-center gap-sm">
                    ${coverHtml}
                    <span class="font-bold text-on-surface">${esc(a.title)}</span>
                  </td>
                  <td class="p-sm text-text-muted">${esc(a.artist_name || '—')}</td>
                  <td class="p-sm text-text-muted">${a.year || '—'}</td>
                  <td class="p-sm text-text-muted">${a.song_count || 0}</td>
                  <td class="p-sm">
                    <button class="text-text-muted hover:text-on-surface transition-colors mr-sm" onclick="navigate('album','edit:${a.id}')">Edit</button>
                    <button class="text-red-400 hover:text-red-300 transition-colors" onclick="CumuAdmin.deleteAlbum('${a.id}')">Delete</button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  async function deleteAlbum(albumId) {
    if (!confirm('Delete album and all contained songs?')) return;
    await CumuApi.del(`/admin/albums/${albumId}`);
    switchTab('albums');
  }

  // ── 5. Users Tab ──────────────────────────────────────────────────────────
  async function renderUsersTab(container) {
    const users = await CumuApi.get('/admin/users');
    container.innerHTML = `
      <section class="flex flex-col gap-md mb-xl">
        <h2 class="font-title-md text-title-md text-on-surface border-b border-border-subtle pb-sm">User Management (${users.length})</h2>
        <div class="w-full overflow-x-auto rounded-lg border border-border-subtle">
          <table class="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr class="border-b border-border-subtle bg-surface-bright">
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Username</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Role</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Status</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Actions</th>
              </tr>
            </thead>
            <tbody class="font-body-sm text-body-sm text-on-surface">
              ${users.map(u => `
                <tr class="border-b border-border-subtle hover:bg-surface-bright transition-colors last:border-0">
                  <td class="p-sm font-bold text-on-surface">${esc(u.username)}</td>
                  <td class="p-sm text-text-muted">${u.role}</td>
                  <td class="p-sm">
                    <span class="px-xs py-[2px] rounded text-xs ${u.is_blocked ? 'bg-red-900/40 text-red-300' : 'bg-green-900/40 text-green-300'}">
                      ${u.is_blocked ? 'Blocked' : 'Active'}
                    </span>
                  </td>
                  <td class="p-sm">
                    <button class="text-text-muted hover:text-on-surface transition-colors mr-sm" onclick="CumuAdmin.toggleUserBlock('${u.id}', ${!u.is_blocked})">
                      ${u.is_blocked ? 'Unblock' : 'Block'}
                    </button>
                    <button class="text-red-400 hover:text-red-300 transition-colors" onclick="CumuAdmin.deleteUser('${u.id}')">Delete</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>

      <section class="flex flex-col gap-md">
        <h2 class="font-title-md text-title-md text-on-surface border-b border-border-subtle pb-sm">Create New User</h2>
        <form id="addUserForm" class="flex flex-col gap-md max-w-md">
          <div class="flex flex-col gap-xs">
            <label class="font-label-caps text-label-caps text-text-muted lowercase">Username</label>
            <input type="text" id="newUsername" required class="px-md py-sm bg-background border border-border-subtle rounded-lg font-body-sm text-body-sm text-on-surface" />
          </div>
          <div class="flex flex-col gap-xs">
            <label class="font-label-caps text-label-caps text-text-muted lowercase">Password</label>
            <input type="password" id="newPassword" required class="px-md py-sm bg-background border border-border-subtle rounded-lg font-body-sm text-body-sm text-on-surface" />
          </div>
          <button type="submit" class="px-md py-sm bg-text-muted text-on-primary font-body-sm text-body-sm rounded hover:scale-105 active:scale-95 transition-all duration-200 w-fit">Create User</button>
        </form>
      </section>`;

    document.getElementById('addUserForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('newUsername').value;
      const password = document.getElementById('newPassword').value;
      try {
        await CumuApi.post('/admin/users', { username, password });
        switchTab('users');
      } catch (err) {
        alert(err.message || 'User creation failed');
      }
    });
  }

  async function toggleUserBlock(id, isBlocked) {
    await CumuApi.put(`/admin/users/${id}/block`, { is_blocked: isBlocked });
    switchTab('users');
  }

  async function deleteUser(id) {
    if (!confirm('Delete user?')) return;
    await CumuApi.del(`/admin/users/${id}`);
    switchTab('users');
  }

  // ── 6. OAuth Clients Tab ──────────────────────────────────────────────────
  async function renderOAuthTab(container) {
    const clients = await CumuApi.get('/admin/oauth/clients');
    container.innerHTML = `
      <section class="flex flex-col gap-md mb-xl">
        <h2 class="font-title-md text-title-md text-on-surface border-b border-border-subtle pb-sm">Registered OAuth Applications (${clients.length})</h2>
        <div class="w-full overflow-x-auto rounded-lg border border-border-subtle">
          <table class="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr class="border-b border-border-subtle bg-surface-bright">
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Application Name</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Client ID</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Redirect URIs</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Scopes</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Actions</th>
              </tr>
            </thead>
            <tbody class="font-body-sm text-body-sm text-on-surface">
              ${clients.map(c => `
                <tr class="border-b border-border-subtle hover:bg-surface-bright transition-colors last:border-0">
                  <td class="p-sm font-bold text-on-surface">${esc(c.name)}</td>
                  <td class="p-sm font-mono text-xs text-text-muted">${c.client_id}</td>
                  <td class="p-sm text-text-muted font-mono text-xs truncate max-w-xs">${esc(JSON.stringify(c.redirect_uris))}</td>
                  <td class="p-sm text-text-muted font-mono text-xs">${c.scopes}</td>
                  <td class="p-sm">
                    <button class="text-red-400 hover:text-red-300 transition-colors" onclick="CumuAdmin.deactivateClient('${c.client_id}')">Deactivate</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>

      <section class="flex flex-col gap-md">
        <h2 class="font-title-md text-title-md text-on-surface border-b border-border-subtle pb-sm">Register New OAuth Client</h2>
        <form id="addClientForm" class="flex flex-col gap-md max-w-md">
          <div class="flex flex-col gap-xs">
            <label class="font-label-caps text-label-caps text-text-muted lowercase">Application Name</label>
            <input type="text" id="clientName" required placeholder="e.g. Mobile App" class="px-md py-sm bg-background border border-border-subtle rounded-lg font-body-sm text-body-sm text-on-surface" />
          </div>
          <div class="flex flex-col gap-xs">
            <label class="font-label-caps text-label-caps text-text-muted lowercase">Redirect URIs (comma-separated or JSON array)</label>
            <input type="text" id="clientUris" required placeholder="https://app.example.com/callback" class="px-md py-sm bg-background border border-border-subtle rounded-lg font-body-sm text-body-sm text-on-surface" />
          </div>
          <div class="flex flex-col gap-xs">
            <label class="font-label-caps text-label-caps text-text-muted lowercase">Allowed Scopes</label>
            <input type="text" id="clientScopes" value="read write" class="px-md py-sm bg-background border border-border-subtle rounded-lg font-body-sm text-body-sm text-on-surface" />
          </div>
          <button type="submit" class="px-md py-sm bg-text-muted text-on-primary font-body-sm text-body-sm rounded hover:scale-105 active:scale-95 transition-all duration-200 w-fit">Register App</button>
        </form>
        <div id="newClientSecretDisplay"></div>
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
            <strong>Client registered!</strong> Client ID: <span class="font-mono">${res.clientId}</span>, Secret: <span class="font-mono">${res.clientSecret}</span> (Save this now!)
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

  // ── 7. Podcasts Tab ───────────────────────────────────────────────────────
  async function renderPodcastsTab(container) {
    const config = await CumuApi.get('/admin/config');
    const customFeeds = config.customPodcastFeeds || [];

    container.innerHTML = `
      <section class="flex flex-col gap-md mb-xl">
        <h2 class="font-title-md text-title-md text-on-surface border-b border-border-subtle pb-sm">Podcasts Configuration</h2>
        <form id="adminPodcastsForm" class="flex flex-col gap-md">
          
          <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors">
            <div class="flex flex-col gap-xs">
              <span class="font-body-lg text-body-lg text-on-surface">Enable podcasts globally</span>
              <span class="font-body-sm text-body-sm text-text-muted">Shows podcasts on the homepage and sidebar.</span>
            </div>
            <label class="relative inline-flex items-center cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-200">
              <input type="checkbox" name="enablePodcasts" class="sr-only peer" ${config.enablePodcasts !== false ? 'checked' : ''} />
              <div class="w-11 h-6 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-text-muted"></div>
            </label>
          </div>

          <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors border-t border-border-subtle mt-sm pt-md">
            <div class="flex flex-col gap-xs">
              <span class="font-body-lg text-body-lg text-on-surface">Enable public podcasts (API)</span>
              <span class="font-body-sm text-body-sm text-text-muted">Loads popular podcasts from external directories.</span>
            </div>
            <label class="relative inline-flex items-center cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-200">
              <input type="checkbox" name="enablePublicPodcasts" class="sr-only peer" ${config.enablePublicPodcasts ? 'checked' : ''} />
              <div class="w-11 h-6 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-text-muted"></div>
            </label>
          </div>

          <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors">
            <div class="flex flex-col gap-xs">
              <span class="font-body-lg text-body-lg text-on-surface">Podcast API Source</span>
              <span class="font-body-sm text-body-sm text-text-muted">iTunes (Default, no key) or Podcast Index (Free/Open-Source).</span>
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
            <button type="submit" class="px-md py-sm bg-text-muted text-on-primary font-body-sm text-body-sm rounded hover:scale-105 active:scale-95 transition-all duration-200">Save Settings</button>
          </div>
        </form>
      </section>

      <section class="flex flex-col gap-md">
        <h2 class="font-title-md text-title-md text-on-surface border-b border-border-subtle pb-sm">Custom RSS Feeds</h2>
        <div class="w-full overflow-x-auto rounded-lg border border-border-subtle mb-sm">
          <table class="w-full text-left border-collapse whitespace-nowrap" id="customFeedsTable">
            <thead>
              <tr class="border-b border-border-subtle bg-surface-bright">
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Title</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">RSS URL</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Actions</th>
              </tr>
            </thead>
            <tbody class="font-body-sm text-body-sm text-on-surface">
              ${customFeeds.map((feed, index) => `
                <tr class="border-b border-border-subtle hover:bg-surface-bright transition-colors last:border-0" data-index="${index}">
                  <td class="p-sm"><strong class="font-bold text-on-surface">${esc(feed.title)}</strong></td>
                  <td class="p-sm text-text-muted truncate max-w-xs">${esc(feed.url)}</td>
                  <td class="p-sm">
                    <button class="text-red-400 hover:text-red-300 transition-colors remove-feed-btn" data-index="${index}">Remove</button>
                  </td>
                </tr>`).join('')}
              ${customFeeds.length === 0 ? '<tr><td colspan="3" class="p-sm text-center text-text-muted">No custom RSS feeds found.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
        
        <form id="addCustomFeedForm" class="flex gap-md mt-xs">
          <input type="text" id="newFeedTitle" placeholder="Podcast Title" required class="flex-1 font-body-sm text-body-sm text-on-surface bg-transparent border-0 border-b border-border-subtle focus:border-text-muted focus:ring-0 p-xs" />
          <input type="url" id="newFeedUrl" placeholder="https://.../rss" required class="flex-2 font-body-sm text-body-sm text-on-surface bg-transparent border-0 border-b border-border-subtle focus:border-text-muted focus:ring-0 p-xs" />
          <button type="submit" class="px-md py-sm bg-surface-container-high text-on-surface font-body-sm text-body-sm rounded hover:scale-105 active:scale-95 transition-all duration-200">+ Add</button>
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
        alert('Podcast settings saved!');
      } catch (err) {
        alert(err.message || 'Failed to save');
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
        alert(err.message || 'Failed to save');
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
          alert(err.message || 'Failed to delete');
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
        <h2 class="font-title-md text-title-md text-on-surface border-b border-border-subtle pb-sm">Server Configuration</h2>
        <form id="adminConfigForm" class="flex flex-col gap-md">
          
          <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors">
            <div class="flex flex-col gap-xs">
              <span class="font-body-lg text-body-lg text-on-surface">Music Storage Path</span>
              <span class="font-body-sm text-body-sm text-text-muted">Path on server (e.g. /home/user/music)</span>
            </div>
            <input type="text" id="cfgMusicPath" name="musicPath" value="${esc(config.musicPath || '')}" class="font-body-lg text-body-lg text-on-surface bg-transparent border-0 border-b border-border-subtle focus:border-text-muted focus:ring-0 p-0 text-right w-64" />
          </div>

          <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors">
            <div class="flex flex-col gap-xs">
              <span class="font-body-lg text-body-lg text-on-surface">Max Storage Limit</span>
              <span class="font-body-sm text-body-sm text-text-muted">Storage limit in gigabytes.</span>
            </div>
            <input type="number" id="cfgStorage" name="maxStorageGb" value="${config.maxStorageGb || 50}" class="font-body-lg text-body-lg text-on-surface bg-transparent border-0 border-b border-border-subtle focus:border-text-muted focus:ring-0 p-0 text-right w-32" />
          </div>

          <div class="flex items-center gap-md mt-sm px-md">
            <button type="submit" class="px-md py-sm bg-text-muted text-on-primary font-body-sm text-body-sm rounded hover:scale-105 active:scale-95 transition-all duration-200">Save Configuration</button>
          </div>
        </form>
      </section>

      <section class="flex flex-col gap-md">
        <h2 class="font-title-md text-title-md text-on-surface border-b border-border-subtle pb-sm">Server Statistics</h2>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-md">
          <div class="bg-surface-container-low p-md rounded-lg">
            <div class="font-body-sm text-body-sm text-text-muted">Songs</div>
            <div class="font-display-xl text-[24px] text-on-surface">${stats.songs}</div>
          </div>
          <div class="bg-surface-container-low p-md rounded-lg">
            <div class="font-body-sm text-body-sm text-text-muted">Albums</div>
            <div class="font-display-xl text-[24px] text-on-surface">${stats.albums}</div>
          </div>
          <div class="bg-surface-container-low p-md rounded-lg">
            <div class="font-body-sm text-body-sm text-text-muted">Artists</div>
            <div class="font-display-xl text-[24px] text-on-surface">${stats.artists}</div>
          </div>
          <div class="bg-surface-container-low p-md rounded-lg">
            <div class="font-body-sm text-body-sm text-text-muted">Users</div>
            <div class="font-display-xl text-[24px] text-on-surface">${stats.users}</div>
          </div>
          <div class="bg-surface-container-low p-md rounded-lg">
            <div class="font-body-sm text-body-sm text-text-muted">Storage</div>
            <div class="font-display-xl text-[24px] text-on-surface">${usedMb} MB</div>
          </div>
        </div>
      </section>

      <section class="flex flex-col gap-md mt-xl pt-lg border-t border-border-subtle">
        <h2 class="font-title-md text-title-md text-on-surface border-b border-border-subtle pb-sm">System Update & Version</h2>
        <div class="flex justify-between items-center p-md rounded-lg bg-surface-container-low flex-wrap gap-md">
          <div class="flex flex-col gap-xs">
            <span class="font-body-lg text-body-lg text-on-surface">Version: <strong class="font-bold">v0.2.0</strong></span>
            <span class="font-body-sm text-body-sm text-text-muted" id="adminUpdateStatusText">Automatic updates are enabled.</span>
          </div>
          <button id="btnTriggerAdminUpdate" class="px-md py-sm bg-text-muted text-on-primary font-body-sm text-body-sm rounded hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer">
            Check for updates & update now
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
        alert('Configuration saved!');
      } catch (err) {
        alert(err.message || 'Failed to save');
      }
    });

    document.getElementById('btnTriggerAdminUpdate')?.addEventListener('click', async () => {
      const btn = document.getElementById('btnTriggerAdminUpdate');
      const statusText = document.getElementById('adminUpdateStatusText');
      btn.disabled = true;
      btn.textContent = 'Checking for updates...';
      statusText.textContent = 'Connecting to GitHub...';

      try {
        const res = await CumuApi.post('/admin/update', {});
        statusText.textContent = res.message || 'Executing update...';
        btn.textContent = 'Update Started';
      } catch (err) {
        statusText.textContent = err.message || 'Update check failed.';
        btn.disabled = false;
        btn.textContent = 'Try Again';
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
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Time</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Level</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Category</th>
                <th class="p-sm font-label-caps text-label-caps text-text-muted font-normal">Message</th>
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

  // ── AI AGENTS TAB ────────────────────────────────────────────────────────
  async function renderAgentsTab(container) {
    const cfg = await CumuApi.get('/admin/config');
    container.innerHTML = `
      <section class="flex flex-col gap-md mb-xl">
        <h2 class="font-title-md text-title-md text-on-surface border-b border-border-subtle pb-sm">AI Agents & Metadata Auto-Lookup</h2>
        <p class="font-body-sm text-body-sm text-text-muted">Configure the Mistral AI key and automated background metadata lookup behavior (MusicBrainz & Mistral AI).</p>
      </section>

      <!-- Card 1: Mistral AI Settings -->
      <section class="flex flex-col gap-md border border-border-subtle rounded-xl p-lg bg-surface-bright/40 mb-xl">
        <h3 class="font-title-sm text-title-sm text-on-surface font-bold">Mistral AI Agent Configuration</h3>
        <p class="font-body-sm text-body-sm text-text-muted">Used when MusicBrainz cannot find a song. The AI analyzes filenames and tags to perform corrections.</p>

        <form id="agentConfigForm" class="flex flex-col gap-md mt-sm">
          <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors flex-wrap gap-md">
            <div class="flex flex-col gap-xs">
              <span class="font-body-lg text-body-lg text-on-surface font-semibold">Mistral API Key</span>
              <span class="font-body-sm text-body-sm text-text-muted">Create an API key at console.mistral.ai</span>
            </div>
            <div class="flex items-center gap-xs">
              <input type="password" id="mistralApiKey" name="mistralApiKey" value="${esc(cfg.mistralApiKey || '')}" placeholder="Enter Mistral API Key" class="font-body-sm text-body-sm text-on-surface bg-background border border-border-subtle rounded-lg px-md py-sm w-72 focus:outline-none focus:border-text-muted" />
              <button type="button" class="p-xs text-text-muted hover:text-on-surface" onclick="const el = document.getElementById('mistralApiKey'); el.type = el.type === 'password' ? 'text' : 'password';"><span class="material-symbols-outlined text-[18px]">visibility</span></button>
            </div>
          </div>

          <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors">
            <div class="flex flex-col gap-xs">
              <span class="font-body-lg text-body-lg text-on-surface font-semibold">AI Lookup Correction</span>
              <span class="font-body-sm text-body-sm text-text-muted">Enables AI check and correction for unmatched titles.</span>
            </div>
            <label class="relative inline-block w-12 h-6 cursor-pointer flex-shrink-0">
              <input type="checkbox" id="enableAiCorrection" ${cfg.enableAiCorrection ? 'checked' : ''} class="opacity-0 w-0 h-0">
              <span id="aiCorrectionBg" class="absolute inset-0 ${cfg.enableAiCorrection ? 'bg-primary' : 'bg-border-subtle'} rounded-full transition-colors"></span>
              <span id="aiCorrectionKnob" class="absolute top-1 ${cfg.enableAiCorrection ? 'left-7' : 'left-1'} w-4 h-4 bg-white rounded-full transition-all"></span>
            </label>
          </div>

          <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors">
            <div class="flex flex-col gap-xs">
              <span class="font-body-lg text-body-lg text-on-surface font-semibold">Mistral Model</span>
              <span class="font-body-sm text-body-sm text-text-muted">Model for metadata analysis</span>
            </div>
            <select id="aiModel" class="font-body-sm text-body-sm text-on-surface bg-background border border-border-subtle rounded-lg px-md py-sm w-64">
              <option value="mistral-small-latest" ${cfg.aiModel === 'mistral-small-latest' ? 'selected' : ''}>mistral-small-latest (Recommended & Fast)</option>
              <option value="mistral-medium-latest" ${cfg.aiModel === 'mistral-medium-latest' ? 'selected' : ''}>mistral-medium-latest (Balanced)</option>
              <option value="mistral-large-latest" ${cfg.aiModel === 'mistral-large-latest' ? 'selected' : ''}>mistral-large-latest (High Precision)</option>
            </select>
          </div>

          <div class="flex items-center gap-md mt-md px-md">
            <button type="submit" class="px-md py-sm bg-text-high-contrast text-on-primary font-body-sm text-body-sm rounded-lg hover:scale-105 active:scale-95 transition-all font-bold">Save Settings</button>
            <button type="button" id="testApiKeyBtn" class="px-md py-sm border border-border-subtle text-on-surface font-body-sm text-body-sm rounded-lg hover:bg-surface-bright transition-all">Test API Key</button>
          </div>
          <div id="agentStatusMsg" class="mt-sm px-md font-body-sm text-body-sm"></div>
        </form>
      </section>

      <!-- Card 2: Auto-Lookup Trigger -->
      <section class="flex flex-col gap-md border border-border-subtle rounded-xl p-lg bg-surface-bright/40">
        <h3 class="font-title-sm text-title-sm text-on-surface font-bold">Automatic Metadata Search (Auto-Lookup)</h3>
        <p class="font-body-sm text-body-sm text-text-muted">Enables background metadata lookup (MusicBrainz -> AI fallback) for new uploads and library scans.</p>

        <div class="flex justify-between items-center p-md rounded-lg hover:bg-surface-bright transition-colors">
          <div class="flex flex-col gap-xs">
            <span class="font-body-lg text-body-lg text-on-surface font-semibold">Background Auto-Lookup</span>
            <span class="font-body-sm text-body-sm text-text-muted">Automatically enriches year, genre, album, and track details. User-edited data is NEVER overwritten.</span>
          </div>
          <label class="relative inline-block w-12 h-6 cursor-pointer flex-shrink-0">
            <input type="checkbox" id="autoLookupToggle" ${cfg.autoLookupEnabled ? 'checked' : ''} class="opacity-0 w-0 h-0">
            <span id="autoLookupBg" class="absolute inset-0 ${cfg.autoLookupEnabled ? 'bg-primary' : 'bg-border-subtle'} rounded-full transition-colors"></span>
            <span id="autoLookupKnob" class="absolute top-1 ${cfg.autoLookupEnabled ? 'left-7' : 'left-1'} w-4 h-4 bg-white rounded-full transition-all"></span>
          </label>
        </div>

        <div class="mt-md px-md flex flex-col gap-sm">
          <button type="button" id="triggerLibraryLookupBtn" class="px-md py-sm bg-primary text-on-primary font-body-sm text-body-sm rounded-lg hover:scale-105 active:scale-95 transition-all font-bold w-fit">
            Start Auto-Lookup for entire library now
          </button>
          <div id="triggerStatusMsg" class="font-body-sm text-body-sm text-text-muted"></div>
        </div>
      </section>
    `;

    // Toggle styling handlers
    const aiToggle = document.getElementById('enableAiCorrection');
    if (aiToggle) {
      aiToggle.addEventListener('change', () => {
        const bg = document.getElementById('aiCorrectionBg');
        const knob = document.getElementById('aiCorrectionKnob');
        if (bg) bg.className = `absolute inset-0 ${aiToggle.checked ? 'bg-primary' : 'bg-border-subtle'} rounded-full transition-colors`;
        if (knob) knob.style.left = aiToggle.checked ? '28px' : '4px';
      });
    }

    const autoToggle = document.getElementById('autoLookupToggle');
    if (autoToggle) {
      autoToggle.addEventListener('change', async () => {
        const bg = document.getElementById('autoLookupBg');
        const knob = document.getElementById('autoLookupKnob');
        const isChecked = autoToggle.checked;
        if (bg) bg.className = `absolute inset-0 ${isChecked ? 'bg-primary' : 'bg-border-subtle'} rounded-full transition-colors`;
        if (knob) knob.style.left = isChecked ? '28px' : '4px';
        await CumuApi.put('/admin/config', { autoLookupEnabled: isChecked });
      });
    }

    // Save agent config
    document.getElementById('agentConfigForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const apiKey = document.getElementById('mistralApiKey').value.trim();
      const enableAi = document.getElementById('enableAiCorrection').checked;
      const model = document.getElementById('aiModel').value;

      const statusEl = document.getElementById('agentStatusMsg');
      try {
        await CumuApi.put('/admin/config', {
          mistralApiKey: apiKey,
          enableAiCorrection: enableAi,
          aiModel: model
        });
        statusEl.innerHTML = 'AI Agent settings saved.';
        statusEl.className = 'mt-sm px-md font-body-sm text-body-sm text-green-600 font-bold';
      } catch (err) {
        statusEl.innerHTML = `Error saving settings: ${err.message}`;
        statusEl.className = 'mt-sm px-md font-body-sm text-body-sm text-red-500 font-bold';
      }
    });

    // Test API key
    document.getElementById('testApiKeyBtn').addEventListener('click', async () => {
      const apiKey = document.getElementById('mistralApiKey').value.trim();
      const model = document.getElementById('aiModel').value;
      const statusEl = document.getElementById('agentStatusMsg');
      statusEl.innerHTML = 'Testing connection to Mistral API...';
      statusEl.className = 'mt-sm px-md font-body-sm text-body-sm text-text-muted';

      try {
        const res = await CumuApi.post('/admin/agents/test', { apiKey, model });
        if (res.ok) {
          statusEl.innerHTML = 'Connection to Mistral AI successful!';
          statusEl.className = 'mt-sm px-md font-body-sm text-body-sm text-green-600 font-bold';
        } else {
          statusEl.innerHTML = `Error: ${res.error}`;
          statusEl.className = 'mt-sm px-md font-body-sm text-body-sm text-red-500 font-bold';
        }
      } catch (err) {
        statusEl.innerHTML = `Error: ${err.message}`;
        statusEl.className = 'mt-sm px-md font-body-sm text-body-sm text-red-500 font-bold';
      }
    });

    // Trigger library lookup
    document.getElementById('triggerLibraryLookupBtn').addEventListener('click', async () => {
      const statusEl = document.getElementById('triggerStatusMsg');
      statusEl.innerHTML = 'Starting Auto-Lookup...';
      try {
        const res = await CumuApi.post('/admin/lookup/trigger', {});
        statusEl.innerHTML = `${res.message || 'Auto-Lookup started.'}`;
        statusEl.className = 'font-body-sm text-body-sm text-green-600 font-bold';
      } catch (err) {
        statusEl.innerHTML = `Error: ${err.message}`;
        statusEl.className = 'font-body-sm text-body-sm text-red-500 font-bold';
      }
    });
  }

  async function lookupSong(songId) {
    try {
      const res = await CumuApi.post(`/admin/songs/${songId}/lookup`, {});
      if (res.ok) {
        alert(`Metadata updated successfully (${res.source})`);
      } else {
        alert(`Lookup Note: ${res.error || res.reasoning || 'No data found'}`);
      }
      switchTab('songs');
    } catch (err) {
      alert(`Lookup error: ${err.message}`);
    }
  }

  return {
    renderLayout,
    switchTab,
    deleteSong,
    deleteAlbum,
    toggleUserBlock,
    deleteUser,
    deactivateClient,
    lookupSong
  };
})();

window.CumuAdmin = CumuAdmin;
