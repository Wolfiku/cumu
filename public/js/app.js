/**
 * public/js/app.js
 * Cumu SPA Main Application.
 *
 * Fully integrated with:
 *   - OAuth2 Bearer Authentication via CumuApi
 *   - Theme-specific Icon Engine via CumuIcons (klassik / coddy / material3)
 *   - Real-time cross-client state synchronization via WebSockets
 *   - Seekable HTTP Range Audio Player
 *   - Download song functionality
 *   - Settings and Admin View Controllers
 */

'use strict';

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function showToast(msg) {
  let toast = document.getElementById('cumuToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'cumuToast';
    toast.style.cssText = 'position:fixed;bottom:140px;left:50%;transform:translateX(-50%);background:var(--color-surface-dark,#222);color:var(--color-on-dark,#fff);padding:8px 16px;border-radius:20px;font-size:13px;z-index:999;box-shadow:0 2px 8px rgba(0,0,0,0.2)';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

(function () {
  // ── State ──────────────────────────────────────────────────────────────────
  let currentUser    = null;
  let currentPage    = 'home';
  let queue          = [];
  let queueIndex     = 0;
  let isSpokenWord   = false;
  let audio          = new Audio();
  let currentSong    = null;
  let isPlaying      = false;
  let playlists      = [];
  let currentTheme   = 'coddy';
  let serverVersion  = 0;

  // ── DOM References ─────────────────────────────────────────────────────────
  const main         = document.getElementById('mainContent');
  const loginModal   = document.getElementById('loginModal');
  const npBar        = document.getElementById('nowPlayingBar');
  const npInfo       = document.getElementById('npInfo');
  const npControls   = document.getElementById('npControls');
  const npSeek       = document.getElementById('npSeek');
  const npCurrent    = document.getElementById('npCurrentTime');
  const npDuration   = document.getElementById('npDuration');
  const topNav       = document.getElementById('topNav');
  const bottomNav    = document.getElementById('bottomNav');
  const settingsBtn  = document.getElementById('settingsBtn');
  const adminBtn     = document.getElementById('adminBtn');

  // ── Theme Switching ────────────────────────────────────────────────────────

  function applyTheme(theme) {
    if (!['klassik', 'coddy', 'material3'].includes(theme)) theme = 'coddy';
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cumu_theme', theme);
    CumuIcons.setTheme(theme);
    updateNavIcons();
  }
  window.applyTheme = applyTheme;

  function updateNavIcons() {
    document.querySelectorAll('.nav-icon').forEach(el => {
      const iconName = el.dataset.icon;
      if (iconName) el.innerHTML = CumuIcons.get(iconName);
    });
  }

  // ── Initialization ─────────────────────────────────────────────────────────

  async function init() {
    const loader = document.getElementById('appLoader');

    // Handle 401 unauthorized globally
    window.addEventListener('cumu:unauthorized', () => {
      showLogin();
    });

    if (CumuApi.isLoggedIn()) {
      try {
        currentUser = await CumuApi.get('/user/me');
        onLoginSuccess();
      } catch {
        showLogin();
      }
    } else {
      showLogin();
    }

    if (loader) loader.style.display = 'none';
  }

  function showLogin() {
    loginModal.style.display = 'flex';
    if (topNav)    topNav.style.display    = 'none';
    if (bottomNav) bottomNav.style.display = 'none';
    if (npBar)     npBar.style.display     = 'none';
  }

  function hideLogin() {
    loginModal.style.display = 'none';
    if (topNav)    topNav.style.display    = 'flex';
    if (bottomNav) bottomNav.style.display = 'flex';
  }

  async function onLoginSuccess() {
    hideLogin();
    const userLabel = document.getElementById('navUser');
    if (userLabel) userLabel.textContent = currentUser.username;

    if (['admin', 'creator'].includes(currentUser.role)) {
      if (adminBtn) adminBtn.classList.remove('hidden');
    } else {
      if (adminBtn) adminBtn.classList.add('hidden');
    }

    applyTheme(currentUser.theme || 'coddy');

    // Connect WebSocket for real-time state sync
    CumuApi.connectWs();
    CumuApi.onWsMessage(handleWsMessage);

    // Initial state sync restore
    await syncRestore();

    loadPlaylists();
    navigate('home');
  }

  // Login form handler
  document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('loginError');
    errEl.classList.add('hidden');

    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    try {
      const res = await CumuApi.login(username, password);
      currentUser = { username: res.username, role: res.role, theme: res.theme };
      onLoginSuccess();
    } catch (err) {
      errEl.textContent = err.message || 'Login failed';
      errEl.classList.remove('hidden');
    }
  });

  window.doLogout = async function () {
    await CumuApi.logout();
    currentUser = null;
    stopAudio();
    showLogin();
  };

  // ── State Sync ─────────────────────────────────────────────────────────────

  async function syncRestore() {
    try {
      const state = await CumuApi.get('/api/sync');
      if (state) {
        serverVersion = state.version || 0;
        if (state.theme && state.theme !== currentTheme) {
          applyTheme(state.theme);
        }
        if (state.volume !== undefined) {
          audio.volume = state.volume;
        }
      }
    } catch (_) {}
  }

  async function syncPush(updates = {}) {
    try {
      const res = await CumuApi.post('/api/sync', {
        volume: audio.volume,
        lastSongId: currentSong ? currentSong.id : null,
        lastPosition: audio.currentTime || 0,
        theme: currentTheme,
        clientVersion: serverVersion,
        ...updates,
      });

      if (res.conflict) {
        // Resolve conflict by accepting server state
        serverVersion = res.serverState.version;
        if (res.serverState.theme) applyTheme(res.serverState.theme);
      } else if (res.version) {
        serverVersion = res.version;
      }
    } catch (_) {}
  }

  function handleWsMessage(msg) {
    if (msg.type === 'state_update' && msg.state) {
      const s = msg.state;
      if (s.theme && s.theme !== currentTheme) {
        applyTheme(s.theme);
      }
      if (s.volume !== undefined && Math.abs(audio.volume - s.volume) > 0.05) {
        audio.volume = s.volume;
      }
    }
  }

  // ── Navigation Router ──────────────────────────────────────────────────────

  window.navigate = function (page, params) {
    currentPage = page;
    window._lastNavParams = params;

    // Update bottom nav tab state
    document.querySelectorAll('.nav-tab').forEach(t => {
      const isActive = t.dataset.page === page;
      t.classList.toggle('active', isActive);
      t.setAttribute('data-active', isActive ? 'true' : 'false');
    });

    const isFullscreenNP = page === 'nowplaying';
    if (topNav)    topNav.style.display    = isFullscreenNP ? 'none' : 'flex';
    if (bottomNav) bottomNav.style.display = isFullscreenNP ? 'none' : 'flex';
    if (npBar)     npBar.classList.toggle('hidden', isFullscreenNP || !currentSong);

    updateNavIcons();

    if      (page === 'home')       renderHome();
    else if (page === 'search')     renderSearch();
    else if (page === 'library')    renderLibrary();
    else if (page === 'admin')      renderAdmin();
    else if (page === 'album')      renderAlbum(params);
    else if (page === 'artist')     renderArtist(params);
    else if (page === 'playlist')   renderPlaylist(params);
    else if (page === 'song')       renderSong(params);
    else if (page === 'nowplaying') renderNowPlaying();
    else if (page === 'settings')   renderSettings();

    window.scrollTo(0, 0);
  };

  // ── Audio Player Engine ───────────────────────────────────────────────────

  function playSong(song, isAudiobook = false) {
    if (!song) return;
    currentSong = song;
    isSpokenWord = isAudiobook || !!song.is_audiobook;

    audio.src = CumuApi.streamUrl(song.id);
    audio.play().then(() => {
      isPlaying = true;
      updatePlayerUI();
      // Record play count on server
      CumuApi.post(`/api/songs/${song.id}/play`, {});
    }).catch(err => {
      console.error('[cumu] playback error:', err);
    });

    npBar.classList.remove('hidden');
    updatePlayerUI();
  }

  function playQueue(songs, startIndex = 0, isAudiobook = false) {
    queue = songs || [];
    queueIndex = startIndex;
    if (queue[queueIndex]) {
      playSong(queue[queueIndex], isAudiobook);
    }
  }

  function togglePlay() {
    if (!currentSong) return;
    if (isPlaying) {
      audio.pause();
      isPlaying = false;
    } else {
      audio.play();
      isPlaying = true;
    }
    updatePlayerUI();
  }

  function stopAudio() {
    audio.pause();
    audio.currentTime = 0;
    isPlaying = false;
    currentSong = null;
    npBar.classList.add('hidden');
  }

  function nextTrack() {
    if (!queue.length) return;
    queueIndex = (queueIndex + 1) % queue.length;
    playSong(queue[queueIndex], isSpokenWord);
  }

  function prevTrack() {
    if (!queue.length) return;
    queueIndex = (queueIndex - 1 + queue.length) % queue.length;
    playSong(queue[queueIndex], isSpokenWord);
  }

  // Audio Event Listeners
  audio.addEventListener('ended', () => {
    if (queue.length > 0) nextTrack();
    else { isPlaying = false; updatePlayerUI(); }
  });

  audio.addEventListener('timeupdate', () => {
    if (!audio.duration) return;
    const cur  = audio.currentTime;
    const dur  = audio.duration;
    const pct  = (cur / dur) * 100;

    if (npSeek)    npSeek.value = pct;
    if (npCurrent) npCurrent.textContent = formatTime(cur);
    if (npDuration) npDuration.textContent = formatTime(dur);
  });

  if (npSeek) {
    npSeek.addEventListener('input', () => {
      if (audio.duration) {
        audio.currentTime = (npSeek.value / 100) * audio.duration;
      }
    });
  }

  function updatePlayerUI() {
    if (!currentSong) return;
    if (npInfo) {
      const coverSrc = currentSong.cover ? `/stream/cover/${currentSong.cover}` : null;
      npInfo.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px">
          ${coverSrc
            ? `<img src="${coverSrc}" class="cover-thumb" alt="cover">`
            : `<div class="cover-thumb" style="display:flex;align-items:center;justify-content:center">${CumuIcons.get('home')}</div>`
          }
          <div style="overflow:hidden">
            <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(currentSong.title)}</div>
            <div class="mute caption" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(currentSong.artist_name || 'unknown artist')}</div>
          </div>
        </div>`;
    }

    if (npControls) {
      npControls.innerHTML = `
        <button class="btn-icon" onclick="CumuApp.prevTrack()" title="Previous">${CumuIcons.get('prev')}</button>
        <button class="btn-primary btn-play" onclick="CumuApp.togglePlay()" title="${isPlaying ? 'Pause' : 'Play'}">${isPlaying ? CumuIcons.get('pause') : CumuIcons.get('play')}</button>
        <button class="btn-icon" onclick="CumuApp.nextTrack()" title="Next">${CumuIcons.get('next')}</button>
        <a class="btn-icon" href="${CumuApi.downloadUrl(currentSong.id)}" download title="Download">${CumuIcons.get('download')}</a>`;
    }
  }

  // ── Views ──────────────────────────────────────────────────────────────────

  async function loadPlaylists() {
    try {
      playlists = await CumuApi.get('/api/playlists');
    } catch (_) {}
  }

  async function renderHome() {
    main.innerHTML = '<div class="page-section"><div class="spinner">loading music library…</div></div>';
    try {
      const data = await CumuApi.get('/api/home');
      let html = '';
      if (data.recentlyPlayed?.length) html += renderSection('recently played', data.recentlyPlayed);
      if (data.mostPlayed?.length)     html += renderSection('most played',      data.mostPlayed);
      if (data.newSongs?.length)       html += renderSection('new additions',    data.newSongs);

      if (!html) {
        html = `
          <div class="page-section">
            <div class="card" style="text-align:center;padding:48px 24px">
              <div style="margin-bottom:16px">${CumuIcons.get('library')}</div>
              <h2>library is empty</h2>
              <p class="mute caption" style="margin-bottom:24px">upload music using the admin panel or run a library scan.</p>
              ${['admin', 'creator'].includes(currentUser?.role) ? `<button class="btn-primary" onclick="navigate('admin')">open admin panel</button>` : ''}
            </div>
          </div>`;
      }
      main.innerHTML = html;
      bindSongRows();
    } catch (err) {
      main.innerHTML = `<div class="page-section"><div class="error-msg">${err.message || 'Error loading home'}</div></div>`;
    }
  }

  function renderSection(title, songs) {
    return `
      <div class="page-section">
        <h2>${esc(title)}</h2>
        <div class="song-list">
          ${songs.map(s => renderSongRow(s)).join('')}
        </div>
      </div>`;
  }

  function renderSongRow(s) {
    const coverSrc = s.cover ? `/stream/cover/${s.cover}` : null;
    return `
      <div class="song-item" data-song-id="${s.id}">
        ${coverSrc
          ? `<img src="${coverSrc}" class="cover-thumb" alt="cover">`
          : `<div class="cover-thumb" style="display:flex;align-items:center;justify-content:center">${CumuIcons.get('home')}</div>`
        }
        <div style="flex:1;overflow:hidden">
          <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.title)}</div>
          <div class="mute caption" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.artist_name || 'unknown')} ${s.album_title ? '&middot; ' + esc(s.album_title) : ''}</div>
        </div>
        <div class="mute caption" style="margin-right:12px">${formatTime(s.duration)}</div>
        <a class="btn-icon" href="${CumuApi.downloadUrl(s.id)}" download title="Download" onclick="event.stopPropagation()">${CumuIcons.get('download')}</a>
      </div>`;
  }

  function bindSongRows() {
    main.querySelectorAll('.song-item').forEach(row => {
      row.addEventListener('click', async () => {
        const songId = row.dataset.songId;
        const song = await CumuApi.get(`/api/songs/${songId}`);
        playSong(song);
      });
    });
  }

  let searchTimeout;
  function renderSearch() {
    main.innerHTML = `
      <div class="page-section">
        <h1>search</h1>
        <div class="form-row" style="margin-top:16px">
          <input type="search" id="searchInput" placeholder="search songs, artists, albums..." autofocus />
        </div>
        <div id="searchResults" style="margin-top:24px"></div>
      </div>`;

    document.getElementById('searchInput')?.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const q = e.target.value;
      searchTimeout = setTimeout(async () => {
        if (!q.trim()) { document.getElementById('searchResults').innerHTML = ''; return; }
        const res = await CumuApi.get(`/api/search?q=${encodeURIComponent(q)}`);
        let html = '';
        if (res.songs?.length)   html += `<h2>songs</h2><div class="song-list">${res.songs.map(renderSongRow).join('')}</div>`;
        if (res.albums?.length)  html += `<h2 style="margin-top:24px">albums</h2><div class="album-grid">${res.albums.map(renderAlbumCard).join('')}</div>`;
        if (!html) html = `<p class="mute">no results for "${esc(q)}"</p>`;
        document.getElementById('searchResults').innerHTML = html;
        bindSongRows();
      }, 300);
    });
  }

  function renderAlbumCard(a) {
    const coverSrc = a.cover ? `/stream/cover/${a.cover}` : null;
    return `
      <div class="card album-item" onclick="navigate('album','${a.id}')" style="cursor:pointer">
        ${coverSrc
          ? `<img src="${coverSrc}" style="width:100%;height:140px;object-fit:cover;border-radius:var(--radius-sm);margin-bottom:8px" alt="album cover">`
          : `<div style="width:100%;height:140px;background:var(--color-surface-soft);display:flex;align-items:center;justify-content:center;border-radius:var(--radius-sm);margin-bottom:8px">${CumuIcons.get('home')}</div>`
        }
        <div style="font-weight:600">${esc(a.title)}</div>
        <div class="mute caption">${esc(a.artist_name || 'unknown')} ${a.year ? '(' + a.year + ')' : ''}</div>
      </div>`;
  }

  async function renderLibrary() {
    main.innerHTML = '<div class="page-section"><div class="spinner">loading library…</div></div>';
    const lib = await CumuApi.get('/api/library');
    await loadPlaylists();

    main.innerHTML = `
      <div class="page-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
          <h1>my library</h1>
          <button class="btn-primary" onclick="CumuApp.createPlaylist()">+ new playlist</button>
        </div>

        ${playlists.length ? `
          <h2 style="margin-bottom:12px">playlists</h2>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-bottom:32px">
            ${playlists.map(p => `
              <div class="card" onclick="navigate('playlist','${p.id}')" style="cursor:pointer">
                <div style="font-weight:600">${esc(p.name)}</div>
                <div class="mute caption">${esc(p.description || 'playlist')}</div>
              </div>`).join('')}
          </div>` : ''
        }

        <h2>saved songs</h2>
        ${lib.songs?.length
          ? `<div class="song-list">${lib.songs.map(renderSongRow).join('')}</div>`
          : '<p class="mute">no saved songs</p>'
        }
      </div>`;
    bindSongRows();
  }

  async function createPlaylist() {
    const name = prompt('Playlist name:');
    if (!name) return;
    const description = prompt('Description (optional):') || '';
    await CumuApi.post('/api/playlists', { name, description });
    await loadPlaylists();
    navigate('library');
  }

  async function renderAlbum(albumId) {
    main.innerHTML = '<div class="page-section"><div class="spinner">loading album…</div></div>';
    const album = await CumuApi.get(`/api/albums/${albumId}`);
    const coverSrc = album.cover ? `/stream/cover/${album.cover}` : null;

    main.innerHTML = `
      <div class="page-section">
        <div style="display:flex;gap:24px;align-items:center;margin-bottom:32px">
          ${coverSrc
            ? `<img src="${coverSrc}" style="width:140px;height:140px;object-fit:cover;border-radius:var(--radius-md)" alt="cover">`
            : `<div style="width:140px;height:140px;background:var(--color-surface-soft);display:flex;align-items:center;justify-content:center;border-radius:var(--radius-md)">${CumuIcons.get('home')}</div>`
          }
          <div>
            <h1>${esc(album.title)}</h1>
            <p class="mute caption">${esc(album.artist_name || 'unknown')} ${album.year ? '&middot; ' + album.year : ''}</p>
            <button class="btn-primary" style="margin-top:16px" onclick="CumuApp.playAlbum('${album.id}')">play album</button>
          </div>
        </div>
        <h2>tracklist</h2>
        <div class="song-list">${(album.songs || []).map(renderSongRow).join('')}</div>
      </div>`;
    bindSongRows();
  }

  async function playAlbum(albumId) {
    const album = await CumuApi.get(`/api/albums/${albumId}`);
    if (album.songs?.length) {
      playQueue(album.songs, 0, album.is_audiobook);
    }
  }

  async function renderArtist(artistId) {
    main.innerHTML = '<div class="page-section"><div class="spinner">loading artist…</div></div>';
    const artist = await CumuApi.get(`/api/artists/${artistId}`);

    main.innerHTML = `
      <div class="page-section">
        <h1>${esc(artist.name)}</h1>
        <p class="mute caption" style="margin-bottom:24px">${artist.albums?.length || 0} albums &middot; ${artist.songs?.length || 0} songs</p>

        ${artist.albums?.length ? `
          <h2>albums</h2>
          <div class="album-grid" style="margin-bottom:32px">${artist.albums.map(renderAlbumCard).join('')}</div>` : ''
        }

        <h2>songs</h2>
        <div class="song-list">${(artist.songs || []).map(renderSongRow).join('')}</div>
      </div>`;
    bindSongRows();
  }

  async function renderPlaylist(playlistId) {
    main.innerHTML = '<div class="page-section"><div class="spinner">loading playlist…</div></div>';
    const pl = await CumuApi.get(`/api/playlists/${playlistId}`);

    main.innerHTML = `
      <div class="page-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
          <div>
            <h1>${esc(pl.name)}</h1>
            <p class="mute caption">${esc(pl.description || '')}</p>
          </div>
          <button class="btn-danger" onclick="CumuApp.deletePlaylist('${pl.id}')">delete playlist</button>
        </div>
        <div class="song-list">${(pl.songs || []).map(renderSongRow).join('')}</div>
      </div>`;
    bindSongRows();
  }

  async function deletePlaylist(id) {
    if (!confirm('Delete playlist?')) return;
    await CumuApi.del(`/api/playlists/${id}`);
    await loadPlaylists();
    navigate('library');
  }

  async function renderSong(songId) {
    main.innerHTML = '<div class="page-section"><div class="spinner">loading song details…</div></div>';
    const s = await CumuApi.get(`/api/songs/${songId}`);

    main.innerHTML = `
      <div class="page-section">
        <h1>${esc(s.title)}</h1>
        <p class="mute caption" style="margin-bottom:24px">${esc(s.artist_name || 'unknown')} &middot; ${esc(s.album_title || 'unknown')}</p>
        <div style="display:flex;gap:12px;margin-bottom:32px">
          <button class="btn-primary" onclick="CumuApp.playSingleSong('${s.id}')">play song</button>
          <a class="btn-secondary" href="${CumuApi.downloadUrl(s.id)}" download>download song</a>
        </div>
        <div class="card">
          <h2>metadata</h2>
          <table>
            <tr><td class="mute">duration</td><td>${formatTime(s.duration)}</td></tr>
            <tr><td class="mute">genre</td><td>${esc(s.genre || '—')}</td></tr>
            <tr><td class="mute">year</td><td>${s.year || '—'}</td></tr>
            <tr><td class="mute">play count</td><td>${s.play_count || 0}</td></tr>
            <tr><td class="mute">mime type</td><td><code>${esc(s.mime_type || '—')}</code></td></tr>
          </table>
        </div>
      </div>`;
  }

  async function playSingleSong(songId) {
    const song = await CumuApi.get(`/api/songs/${songId}`);
    playSong(song);
  }

  function renderNowPlaying() {
    if (!currentSong) { navigate('home'); return; }
    const coverSrc = currentSong.cover ? `/stream/cover/${currentSong.cover}` : null;

    main.innerHTML = `
      <div class="page-section" style="text-align:center;padding:48px 24px">
        ${coverSrc
          ? `<img src="${coverSrc}" style="width:240px;height:240px;object-fit:cover;border-radius:var(--radius-lg);margin-bottom:24px" alt="cover">`
          : `<div style="width:240px;height:240px;background:var(--color-surface-soft);display:flex;align-items:center;justify-content:center;border-radius:var(--radius-lg);margin:0 auto 24px">${CumuIcons.get('home')}</div>`
        }
        <h1>${esc(currentSong.title)}</h1>
        <p class="mute caption" style="font-size:16px;margin-bottom:32px">${esc(currentSong.artist_name || 'unknown')}</p>
        <div style="display:flex;align-items:center;justify-content:center;gap:24px;margin-bottom:32px">
          <button class="btn-icon" onclick="CumuApp.prevTrack()">${CumuIcons.get('prev')}</button>
          <button class="btn-primary btn-play" style="width:64px;height:64px;border-radius:50%" onclick="CumuApp.togglePlay()">${isPlaying ? CumuIcons.get('pause') : CumuIcons.get('play')}</button>
          <button class="btn-icon" onclick="CumuApp.nextTrack()">${CumuIcons.get('next')}</button>
        </div>
        <button class="btn-secondary" onclick="navigate('home')">back to app</button>
      </div>`;
  }

  function renderSettings() {
    if (window.initSettingsPage) window.initSettingsPage();
  }

  function renderAdmin() {
    if (!['admin', 'creator'].includes(currentUser?.role)) { navigate('home'); return; }
    main.innerHTML = CumuAdmin.renderLayout();
    CumuAdmin.switchTab('upload');
  }

  // ── Public Export ──────────────────────────────────────────────────────────
  window.CumuApp = {
    init,
    togglePlay,
    stopAudio,
    nextTrack,
    prevTrack,
    playAlbum,
    playSingleSong,
    createPlaylist,
    deletePlaylist,
  };

  // Start on DOM ready
  document.addEventListener('DOMContentLoaded', init);
})();
