// cumu — Main SPA
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  let currentUser  = null;
  let currentPage  = 'home';
  let queue        = [];
  let queueIndex   = 0;
  let isSpokenWord = false;   // formerly "audiobook / Hörspiel"
  let audio        = new Audio();
  let currentSong  = null;
  let isPlaying    = false;
  let playlists    = [];

  // ── DOM ────────────────────────────────────────────────────────────────────
  const main        = document.getElementById('mainContent');
  const loginModal  = document.getElementById('loginModal');
  const npBar       = document.getElementById('nowPlayingBar');
  const npInfo      = document.getElementById('npInfo');
  const npControls  = document.getElementById('npControls');
  const npSeek      = document.getElementById('npSeek');
  const npCurrentTime = document.getElementById('npCurrentTime');
  const npDuration  = document.getElementById('npDuration');
  const contextMenu = document.getElementById('contextMenu');

  // ── SVG icon set ───────────────────────────────────────────────────────────
  // Inline SVGs — monochrome, stroke-based, consistent with the minimal design
  const ICONS = {
    play:     `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5,3 19,12 5,21"/></svg>`,
    pause:    `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="3" width="4" height="18"/><rect x="15" y="3" width="4" height="18"/></svg>`,
    stop:     `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`,
    prev:     `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="19,3 7,12 19,21"/><rect x="4" y="3" width="3" height="18"/></svg>`,
    next:     `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5,3 17,12 5,21"/><rect x="17" y="3" width="3" height="18"/></svg>`,
    seek_back:`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 5V2L7 7l5 5V9a7 7 0 1 1-5.2 2.3"/><text x="6" y="19" font-size="6" fill="currentColor" stroke="none" font-family="monospace">15</text></svg>`,
    seek_fwd: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 5V2l5 5-5 5V9a7 7 0 1 0 5.2 2.3"/><text x="6" y="19" font-size="6" fill="currentColor" stroke="none" font-family="monospace">15</text></svg>`,
    dots:     `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`,
    plus:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><line x1="12" y1="4" x2="12" y2="20"/><line x1="4" y1="12" x2="20" y2="12"/></svg>`,
    back:     `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="15,18 9,12 15,6"/></svg>`,
    close:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    heart:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
    info:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    album:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>`,
    artist:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="7" r="4"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>`,
    list:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1" fill="currentColor"/><circle cx="3" cy="12" r="1" fill="currentColor"/><circle cx="3" cy="18" r="1" fill="currentColor"/></svg>`,
  };

  // ── AAC / ALAC capability detection ───────────────────────────────────────
  // The HTML Audio element natively decodes AAC in all modern browsers.
  // ALAC (.m4a container with Apple Lossless codec) is supported in Safari
  // and Chromium-based browsers. We detect support and expose a warning if not.
  const audioCapabilities = (function () {
    const t = document.createElement('audio');
    return {
      aac:  t.canPlayType('audio/mp4; codecs="mp4a.40.2"') !== '',   // AAC-LC in MP4
      alac: t.canPlayType('audio/mp4; codecs="alac"') !== '',        // Apple Lossless
      mp3:  t.canPlayType('audio/mpeg') !== '',
      flac: t.canPlayType('audio/flac') !== '',
      ogg:  t.canPlayType('audio/ogg; codecs="vorbis"') !== '',
      opus: t.canPlayType('audio/ogg; codecs="opus"') !== '',
    };
  })();

  // ── Init ───────────────────────────────────────────────────────────────────
  async function init() {
    try {
      const res = await fetch('/auth/me');
      if (res.ok) { currentUser = await res.json(); onLogin(); }
      else showLogin();
    } catch { showLogin(); }
  }

  function showLogin() { loginModal.style.display = 'flex'; }
  function hideLogin() { loginModal.style.display = 'none'; }

  function onLogin() {
    hideLogin();
    document.getElementById('navUser').textContent = `[${currentUser.username}]`;
    if (['admin', 'creator'].includes(currentUser.role)) {
      document.getElementById('adminBtn').style.display = 'inline-flex';
    }
    loadPlaylists();
    applyTheme(currentUser.theme || 'codec');
    navigate('home');
  }

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data  = Object.fromEntries(new FormData(e.target));
    const errEl = document.getElementById('loginError');
    errEl.style.display = 'none';
    const res  = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (json.success) { currentUser = json.user; onLogin(); }
    else { errEl.textContent = json.error || 'Login failed'; errEl.style.display = 'block'; }
  });

  window.logout = async function () {
    await fetch('/auth/logout', { method: 'POST' });
    currentUser = null; stopAudio(); showLogin();
  };

  async function loadPlaylists() {
    try {
      const r = await fetch('/api/playlists');
      if (r.ok) playlists = await r.json();
    } catch {}
  }

  // ── Router ─────────────────────────────────────────────────────────────────
  window.navigate = function (page, params) {
    currentPage = page;
    document.querySelectorAll('.nav-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.page === page)
    );
    if      (page === 'home')       renderHome();
    else if (page === 'search')     renderSearch();
    else if (page === 'library')    renderLibrary();
    else if (page === 'admin')      renderAdmin();
    else if (page === 'album')      renderAlbum(params);
    else if (page === 'artist')     renderArtist(params);
    else if (page === 'playlist')   renderPlaylist(params);
    else if (page === 'song')       renderSong(params);
    else if (page === 'nowplaying') renderNowPlaying();
    else if (page === 'settings')   initSettingsPage();
    window.scrollTo(0, 0);
  };

  // ── HOME ───────────────────────────────────────────────────────────────────
  async function renderHome() {
    main.innerHTML = '<div class="page-section"><div class="spinner"></div></div>';
    const data = await apiFetch('/api/home');
    let html = '';
    if (data.recentlyPlayed?.length) html += section('[+] recently played', renderSongList(data.recentlyPlayed, 'recent'));
    if (data.mostPlayed?.length)     html += section('[+] most played',      renderSongList(data.mostPlayed, 'popular'));
    if (data.newSongs?.length)       html += section('[+] new additions',    renderSongList(data.newSongs, 'new'));
    if (!html) html = `<div class="page-section"><div class="empty-state"><div class="big">[~]</div><p>your library is empty<br>go to the admin panel to upload music</p></div></div>`;
    main.innerHTML = html;
    bindSongRows();
  }

  // ── SEARCH ─────────────────────────────────────────────────────────────────
  let searchTimeout;
  function renderSearch() {
    main.innerHTML = `<div class="page-section"><div class="search-bar"><input type="search" id="searchInput" placeholder="search songs, albums, artists..." autofocus aria-label="Search" /></div><div id="searchResults"></div></div>`;
    document.getElementById('searchInput').addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => doSearch(e.target.value), 300);
    });
  }

  async function doSearch(q) {
    const el = document.getElementById('searchResults');
    if (!el) return;
    if (!q) { el.innerHTML = ''; return; }
    const data = await apiFetch(`/api/search?q=${encodeURIComponent(q)}`);
    let html = '';
    if (data.songs?.length)     html += `<div class="section-header"><span class="section-label">songs</span></div>${renderSongList(data.songs, 'search')}`;
    if (data.albums?.length)    html += `<div class="section-header" style="margin-top:16px"><span class="section-label">albums</span></div><div class="card-scroll">${data.albums.map(renderAlbumCard).join('')}</div>`;
    if (data.artists?.length)   html += `<div class="section-header" style="margin-top:16px"><span class="section-label">artists</span></div><ul class="song-list">${data.artists.map(a => `<li class="song-row" onclick="navigate('artist','${a.id}')"><div class="song-cover">[A]</div><div class="song-meta"><div class="song-title">${esc(a.name)}</div><div class="song-sub">${a.song_count || 0} songs</div></div></li>`).join('')}</ul>`;
    if (data.playlists?.length) html += `<div class="section-header" style="margin-top:16px"><span class="section-label">playlists</span></div><ul class="song-list">${data.playlists.map(p => `<li class="song-row" onclick="navigate('playlist','${p.id}')"><div class="song-cover">[=]</div><div class="song-meta"><div class="song-title">${esc(p.name)}</div></div></li>`).join('')}</ul>`;
    if (!html) html = `<div class="empty-state"><p>no results for &ldquo;${esc(q)}&rdquo;</p></div>`;
    el.innerHTML = html;
    bindSongRows();
    el.querySelectorAll('.album-card').forEach(c => c.addEventListener('click', () => navigate('album', c.dataset.id)));
  }

  // ── LIBRARY ────────────────────────────────────────────────────────────────
  async function renderLibrary() {
    main.innerHTML = '<div class="page-section"><div class="spinner"></div></div>';
    const data = await apiFetch('/api/library');
    await loadPlaylists();
    let html = '<div class="page-section">';
    html += `<div class="section-header"><span class="section-label">[=] my library</span><button class="btn-primary" onclick="showCreatePlaylist()">${ICONS.plus} playlist</button></div>`;
    if (playlists.length) {
      html += `<div style="margin-bottom:24px"><h3 style="margin-bottom:12px">playlists</h3>`;
      html += playlists.map(p => `<div class="playlist-item" onclick="navigate('playlist','${p.id}')"><div class="playlist-cover">[=]</div><div class="song-meta"><div class="song-title">${esc(p.name)}</div><div class="song-sub">${p.description || 'playlist'}</div></div></div>`).join('');
      html += '</div>';
    }
    if (data.songs?.length) {
      html += `<h3 style="margin-bottom:12px">saved songs</h3>${renderSongList(data.songs, 'library')}`;
    } else {
      html += '<div class="empty-state"><div class="big">[=]</div><p>no saved songs yet</p></div>';
    }
    html += '</div>';
    main.innerHTML = html;
    bindSongRows();
  }

  window.showCreatePlaylist = async function () {
    const name = prompt('playlist name:');
    if (!name) return;
    const desc = prompt('description (optional):') || '';
    await apiFetch('/api/playlists', 'POST', { name, description: desc });
    await loadPlaylists();
    navigate('library');
  };

  // ── NOW PLAYING — FULL PAGE ────────────────────────────────────────────────
  function renderNowPlaying() {
    if (!currentSong) { navigate('home'); return; }
    const s = currentSong;
    const coverHtml = s.cover
      ? `<img src="/stream/cover/${s.cover}" class="np-full-cover" alt="Album cover for ${esc(s.title)}">`
      : `<div class="np-full-cover np-full-cover--placeholder" aria-hidden="true">&#9834;</div>`;

    main.innerHTML = `
      <div class="now-playing-page">
        <!-- top bar -->
        <div class="np-page-topbar">
          <button class="icon-btn np-page-back" onclick="history.back()" aria-label="Go back">${ICONS.back}</button>
          <span class="np-page-label">now playing</span>
          <button class="icon-btn" id="npDots" aria-label="More options" aria-haspopup="true">${ICONS.dots}</button>
        </div>

        <!-- cover -->
        <div class="np-full-cover-wrap">${coverHtml}</div>

        <!-- info -->
        <div class="np-full-info">
          <div class="np-full-title">${esc(s.title)}</div>
          <div class="np-full-artist">${esc(s.artist_name || 'unknown artist')}</div>
          ${s.is_audiobook ? '<span class="badge spoken-word">spoken word</span>' : ''}
        </div>

        <!-- seek -->
        <div class="np-full-seek">
          <span id="npFullCurrent">0:00</span>
          <input type="range" id="npFullSeek" min="0" max="100" value="0" class="seek-input" aria-label="Seek position">
          <span id="npFullDuration">0:00</span>
        </div>

        <!-- controls -->
        <div class="np-full-controls" id="npFullControls" role="group" aria-label="Playback controls"></div>
      </div>`;

    // Sync seek bar with the shared audio element
    function syncSeek() {
      const cur   = document.getElementById('npFullCurrent');
      const seekR = document.getElementById('npFullSeek');
      const dur   = document.getElementById('npFullDuration');
      if (cur)   cur.textContent = formatTime(Math.floor(audio.currentTime));
      if (seekR && audio.duration) seekR.value = (audio.currentTime / audio.duration) * 100;
      if (dur)   dur.textContent = formatTime(Math.floor(audio.duration || 0));
    }

    audio.addEventListener('timeupdate', syncSeek);

    const seekEl = document.getElementById('npFullSeek');
    if (seekEl) {
      seekEl.addEventListener('input', () => {
        if (audio.duration) audio.currentTime = (seekEl.value / 100) * audio.duration;
      });
    }

    // Render icon controls into the full page
    renderNowPlayingControls(document.getElementById('npFullControls'), true);

    // 3-dot menu
    document.getElementById('npDots')?.addEventListener('click', (e) => {
      e.stopPropagation();
      showSongSheet(s);
    });
  }

  // ── NOW PLAYING CONTROLS ───────────────────────────────────────────────────
  // Renders transport control buttons (SVG icons) into a given container.
  // fullPage=true uses the larger full-screen layout; false uses the compact bar layout.
  function renderNowPlayingControls(container, fullPage) {
    if (!container) container = npControls;

    if (isSpokenWord) {
      // Spoken word / audiobook mode: seek-back, play/pause, stop, seek-forward
      container.innerHTML = `
        <button class="np-btn${fullPage ? ' np-btn-lg' : ''}" id="ctrl-back" aria-label="Skip back 15 seconds" title="Back 15s">${ICONS.seek_back}</button>
        <button class="np-btn${fullPage ? ' np-btn-lg' : ''}" id="ctrl-playpause" aria-label="${isPlaying ? 'Pause' : 'Play'}" title="${isPlaying ? 'Pause' : 'Play'}">${isPlaying ? ICONS.pause : ICONS.play}</button>
        <button class="np-btn${fullPage ? ' np-btn-lg' : ''}" id="ctrl-stop" aria-label="Stop" title="Stop">${ICONS.stop}</button>
        <button class="np-btn${fullPage ? ' np-btn-lg' : ''}" id="ctrl-fwd" aria-label="Skip forward 15 seconds" title="Forward 15s">${ICONS.seek_fwd}</button>`;
      container.querySelector('#ctrl-back').addEventListener('click', () => { audio.currentTime = Math.max(0, audio.currentTime - 15); });
      container.querySelector('#ctrl-fwd').addEventListener('click',  () => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 15); });
    } else {
      // Music mode: previous, play/pause, stop, next
      container.innerHTML = `
        <button class="np-btn${fullPage ? ' np-btn-lg' : ''}" id="ctrl-prev" aria-label="Previous track" title="Previous">${ICONS.prev}</button>
        <button class="np-btn${fullPage ? ' np-btn-lg' : ''}" id="ctrl-playpause" aria-label="${isPlaying ? 'Pause' : 'Play'}" title="${isPlaying ? 'Pause' : 'Play'}">${isPlaying ? ICONS.pause : ICONS.play}</button>
        <button class="np-btn${fullPage ? ' np-btn-lg' : ''}" id="ctrl-stop" aria-label="Stop" title="Stop">${ICONS.stop}</button>
        <button class="np-btn${fullPage ? ' np-btn-lg' : ''}" id="ctrl-next" aria-label="Next track" title="Next">${ICONS.next}</button>`;
      container.querySelector('#ctrl-prev').addEventListener('click', prevTrack);
      container.querySelector('#ctrl-next').addEventListener('click', nextTrack);
    }

    container.querySelector('#ctrl-playpause').addEventListener('click', togglePlay);
    container.querySelector('#ctrl-stop').addEventListener('click', stopAudio);
  }

  // ── SONG ACTION SHEET (3-dot menu) ─────────────────────────────────────────
  function showSongSheet(song) {
    let sheet = document.getElementById('songSheet');
    if (sheet) sheet.remove();
    sheet = document.createElement('div');
    sheet.id = 'songSheet';
    sheet.className = 'song-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', `Options for ${song.title}`);
    sheet.innerHTML = `
      <div class="song-sheet-backdrop"></div>
      <div class="song-sheet-inner" role="menu">
        <div class="song-sheet-header">
          <div class="song-sheet-title">${esc(song.title)}</div>
          <div class="song-sheet-sub">${esc(song.artist_name || '')}</div>
        </div>
        <button class="sheet-item" id="si-playlist" role="menuitem">${ICONS.list} <span>add to playlist</span></button>
        <button class="sheet-item" id="si-library"  role="menuitem">${ICONS.heart} <span>save to library</span></button>
        <button class="sheet-item" id="si-info"     role="menuitem">${ICONS.info} <span>song info</span></button>
        ${song.album_id  ? `<button class="sheet-item" id="si-album"  role="menuitem">${ICONS.album} <span>view album</span></button>` : ''}
        ${song.artist_id ? `<button class="sheet-item" id="si-artist" role="menuitem">${ICONS.artist} <span>view artist</span></button>` : ''}
        ${['admin', 'creator'].includes(currentUser?.role) ? `<button class="sheet-item danger" id="si-edit" role="menuitem">[edit] <span>edit song</span></button>` : ''}
        <button class="sheet-item muted" id="si-cancel" role="menuitem">${ICONS.close} <span>cancel</span></button>
      </div>`;
    document.body.appendChild(sheet);

    const close = () => sheet.remove();
    sheet.querySelector('.song-sheet-backdrop').addEventListener('click', close);
    sheet.querySelector('#si-cancel').addEventListener('click', close);
    sheet.querySelector('#si-playlist')?.addEventListener('click', async () => { await addSongToPlaylist(song.id); close(); });
    sheet.querySelector('#si-library')?.addEventListener('click',  async () => { await apiFetch('/api/library/song', 'POST', { songId: song.id }); close(); showToast('saved to library'); });
    sheet.querySelector('#si-info')?.addEventListener('click',     () => { close(); navigate('song', song.id); });
    sheet.querySelector('#si-album')?.addEventListener('click',    () => { close(); navigate('album', song.album_id); });
    sheet.querySelector('#si-artist')?.addEventListener('click',   () => { close(); navigate('artist', song.artist_id); });
    sheet.querySelector('#si-edit')?.addEventListener('click',     () => { close(); navigate('song', 'edit:' + song.id); });
  }

  async function addSongToPlaylist(songId) {
    await loadPlaylists();
    if (!playlists.length) { alert('create a playlist first'); return; }
    const names = playlists.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
    const idx   = parseInt(prompt(`choose playlist:\n${names}`)) - 1;
    if (idx >= 0 && playlists[idx]) {
      await apiFetch(`/api/playlists/${playlists[idx].id}/songs`, 'POST', { songId });
      showToast(`added to "${playlists[idx].name}"`);
    }
  }

  // ── ALBUM ──────────────────────────────────────────────────────────────────
  async function renderAlbum(albumId) {
    main.innerHTML = '<div class="page-section"><div class="spinner"></div></div>';
    const album = await apiFetch(`/api/albums/${albumId}`);
    const coverSrc = album.cover ? `/stream/cover/${album.cover}` : null;
    main.innerHTML = `
      <div class="artist-hero">
        ${coverSrc
          ? `<img src="${coverSrc}" style="width:100px;height:100px;border-radius:4px;object-fit:cover;margin-bottom:12px" alt="Album art for ${esc(album.title)}">`
          : '<div style="font-size:60px;margin-bottom:12px" aria-hidden="true">[&#9834;]</div>'
        }
        <h1>${esc(album.title)}</h1>
        <p class="caption">${esc(album.artist_name || 'unknown')} ${album.year ? '&middot; ' + album.year : ''} ${album.is_audiobook ? '<span class="badge spoken-word">spoken word</span>' : ''}</p>
        <div style="margin-top:16px;display:flex;gap:8px">
          <button class="btn-primary" onclick="_playAlbum()" aria-label="Play all songs in ${esc(album.title)}">${ICONS.play} play all</button>
          ${['admin', 'creator'].includes(currentUser?.role) ? `<button class="btn-secondary" onclick="navigate('song','edit:${album.id}')">edit</button>` : ''}
        </div>
      </div>
      <div class="page-section">
        <div class="section-header"><span class="section-label">[+] tracklist (${album.songs?.length || 0})</span></div>
        ${renderSongList(album.songs || [], 'album_' + albumId)}
      </div>`;
    bindSongRows();
    window._playAlbum = () => { if (album.songs?.length) playQueue(album.songs, 0, album.is_audiobook); };
  }

  // ── ARTIST ─────────────────────────────────────────────────────────────────
  async function renderArtist(artistId) {
    main.innerHTML = '<div class="page-section"><div class="spinner"></div></div>';
    const artist = await apiFetch(`/api/artists/${artistId}`);
    let html = `<div class="artist-hero"><div style="font-size:60px;margin-bottom:12px" aria-hidden="true">[A]</div><h1>${esc(artist.name)}</h1><p class="caption">${artist.albums?.length || 0} albums &middot; ${artist.songs?.length || 0} songs</p></div><div class="page-section">`;
    if (artist.albums?.length) html += `<div class="section-header"><span class="section-label">[+] albums</span></div><div class="card-scroll">${artist.albums.map(renderAlbumCard).join('')}</div>`;
    if (artist.songs?.length)  html += `<div class="section-header" style="margin-top:24px"><span class="section-label">[+] all songs</span></div>${renderSongList(artist.songs, 'artist')}`;
    html += '</div>';
    main.innerHTML = html;
    bindSongRows();
    main.querySelectorAll('.album-card').forEach(c => c.addEventListener('click', () => navigate('album', c.dataset.id)));
  }

  // ── PLAYLIST ───────────────────────────────────────────────────────────────
  async function renderPlaylist(playlistId) {
    main.innerHTML = '<div class="page-section"><div class="spinner"></div></div>';
    const playlist = await apiFetch(`/api/playlists/${playlistId}`);
    main.innerHTML = `
      <div class="artist-hero">
        <div style="font-size:60px;margin-bottom:12px" aria-hidden="true">[=]</div>
        <h1>${esc(playlist.name)}</h1>
        <p class="caption">${playlist.songs?.length || 0} songs</p>
        <div style="margin-top:16px;display:flex;gap:8px">
          <button class="btn-primary" onclick="_playPlaylist()" aria-label="Play playlist ${esc(playlist.name)}">${ICONS.play} play</button>
          <button class="btn-danger" onclick="_deletePlaylist('${playlistId}')" aria-label="Delete playlist ${esc(playlist.name)}">[x] delete</button>
        </div>
      </div>
      <div class="page-section">${renderSongList(playlist.songs || [], 'pl_' + playlistId)}</div>`;
    bindSongRows();
    window._playPlaylist  = () => { if (playlist.songs?.length) playQueue(playlist.songs, 0, false); };
    window._deletePlaylist = async (id) => {
      if (!confirm('delete playlist?')) return;
      await apiFetch(`/api/playlists/${id}`, 'DELETE');
      await loadPlaylists();
      navigate('library');
    };
  }

  // ── SONG INFO ──────────────────────────────────────────────────────────────
  async function renderSong(songParam) {
    if (songParam?.startsWith('edit:')) { renderSongEdit(songParam.slice(5)); return; }
    const song = await apiFetch(`/api/songs/${songParam}`);
    const coverSrc = song.cover ? `/stream/cover/${song.cover}` : null;

    // Warn if browser cannot decode AAC/ALAC
    let codecWarning = '';
    const ext = (song.mime_type || '').includes('mp4') || (song.mime_type || '').includes('aac');
    if (ext && !audioCapabilities.aac) {
      codecWarning = `<div class="badge warning" style="margin-top:8px">your browser may not support this audio format (AAC/ALAC)</div>`;
    }

    main.innerHTML = `
      <div class="artist-hero">
        ${coverSrc
          ? `<img src="${coverSrc}" style="width:120px;height:120px;border-radius:4px;object-fit:cover;margin-bottom:12px" alt="Cover for ${esc(song.title)}">`
          : '<div style="font-size:64px;margin-bottom:12px" aria-hidden="true">&#9834;</div>'
        }
        <h1>${esc(song.title)}</h1>
        <p class="caption">
          ${song.artist_name ? `<a href="#" onclick="navigate('artist','${song.artist_id}');return false">${esc(song.artist_name)}</a>` : 'unknown artist'}
          ${song.album_title ? ` &middot; <a href="#" onclick="navigate('album','${song.album_id}');return false">${esc(song.album_title)}</a>` : ''}
          ${song.is_audiobook ? '<span class="badge spoken-word">spoken word</span>' : ''}
        </p>
        ${codecWarning}
        <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-primary" onclick="playSong(_songData)" aria-label="Play ${esc(song.title)}">${ICONS.play} play</button>
          <button class="btn-secondary" onclick="apiFetch('/api/library/song','POST',{songId:'${song.id}'})">save to library</button>
          ${['admin', 'creator'].includes(currentUser?.role) ? `<button class="btn-secondary" onclick="navigate('song','edit:${song.id}')">edit</button>` : ''}
        </div>
      </div>
      <div class="page-section">
        <div class="section-header"><span class="section-label">song info</span></div>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          ${renderInfoRow('title',    song.title)}
          ${renderInfoRow('artist',   song.artist_name)}
          ${renderInfoRow('album',    song.album_title)}
          ${renderInfoRow('genre',    song.genre)}
          ${renderInfoRow('year',     song.year)}
          ${renderInfoRow('duration', formatTime(song.duration))}
          ${renderInfoRow('plays',    song.play_count)}
          ${renderInfoRow('type',     song.is_audiobook ? 'spoken word' : 'music')}
        </table>
      </div>`;
    window._songData = song;
  }

  function renderInfoRow(label, value) {
    if (!value && value !== 0) return '';
    return `<tr><td style="padding:8px 0;color:var(--mute);width:120px">${label}</td><td style="padding:8px 0">${value}</td></tr>`;
  }

  // ── SONG EDIT ──────────────────────────────────────────────────────────────
  async function renderSongEdit(id) {
    if (!['admin', 'creator'].includes(currentUser?.role)) { navigate('home'); return; }
    const song = await apiFetch(`/api/songs/${id}`);
    main.innerHTML = `
      <div class="page-section">
        <div class="section-header"><span class="section-label">[+] edit song</span></div>
        <form id="editSongForm">
          <div class="form-row"><label for="editTitle">title</label><input id="editTitle" name="title" value="${esc(song.title)}" /></div>
          <div class="form-row"><label for="editGenre">genre</label><input id="editGenre" name="genre" value="${esc(song.genre || '')}" /></div>
          <div class="form-row"><label for="editYear">year</label><input id="editYear" name="year" type="number" value="${song.year || ''}" /></div>
          <div class="form-row"><label for="editTrack">track #</label><input id="editTrack" name="track_number" type="number" value="${song.track_number || ''}" /></div>
          <div class="checkbox-row">
            <input type="checkbox" name="is_audiobook" id="isAb" ${song.is_audiobook ? 'checked' : ''}>
            <label for="isAb">spoken word / audiobook</label>
          </div>
          <div id="editErr" class="error-msg" style="display:none" role="alert"></div>
          <div style="margin-top:16px;display:flex;gap:8px">
            <button type="submit" class="btn-primary">save</button>
            <button type="button" class="btn-secondary" onclick="history.back()">cancel</button>
          </div>
        </form>
      </div>`;
    document.getElementById('editSongForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      fd.is_audiobook = !!fd.is_audiobook;
      const res = await fetch(`/admin/songs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fd),
      });
      if (res.ok) navigate('song', id);
      else {
        document.getElementById('editErr').textContent = 'save failed';
        document.getElementById('editErr').style.display = 'block';
      }
    });
  }

  // ── ADMIN ──────────────────────────────────────────────────────────────────
  function renderAdmin() {
    if (!['admin', 'creator'].includes(currentUser?.role)) { navigate('home'); return; }
    main.innerHTML = `
      <div class="admin-grid">
        <div class="admin-sidebar" role="navigation" aria-label="Admin tabs">
          <button class="admin-sidebar-item active" onclick="adminTab(this,'upload')">[+] upload</button>
          <button class="admin-sidebar-item" onclick="adminTab(this,'songs')">[=] songs</button>
          <button class="admin-sidebar-item" onclick="adminTab(this,'albums')">&#9834; albums</button>
          ${currentUser.role === 'admin' ? `<button class="admin-sidebar-item" onclick="adminTab(this,'users')">[u] users</button>` : ''}
          <button class="admin-sidebar-item" onclick="adminTab(this,'stats')">[%] stats</button>
        </div>
        <div class="admin-main" id="adminMain"></div>
      </div>`;
    adminTab(document.querySelector('.admin-sidebar-item'), 'upload');
  }

  window.adminTab = function (el, tab) {
    document.querySelectorAll('.admin-sidebar-item').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    const m = document.getElementById('adminMain');
    if      (tab === 'upload') renderAdminUpload(m);
    else if (tab === 'songs')  renderAdminSongs(m);
    else if (tab === 'albums') renderAdminAlbums(m);
    else if (tab === 'users')  renderAdminUsers(m);
    else if (tab === 'stats')  renderAdminStats(m);
  };

  function renderAdminUpload(container) {
    container.innerHTML = `
      <h2 style="margin-bottom:24px">[+] upload music</h2>
      <form id="uploadForm" enctype="multipart/form-data">
        <div class="upload-zone" id="uploadZone">
          <input type="file" id="fileInput" name="files" multiple accept=".mp3,.m4a,.aac,.mp4,.flac,.ogg,.wav,.opus" style="display:none" aria-label="Choose audio files">
          <div class="upload-label">[+] click or drag files here</div>
          <div class="upload-sub">mp3 &bull; aac &bull; alac (m4a) &bull; flac &bull; ogg &bull; wav</div>
          <button type="button" class="btn-secondary" style="margin-top:12px" onclick="document.getElementById('fileInput').click()">choose files</button>
        </div>
        <div id="fileList" style="margin-bottom:16px"></div>
        <div class="form-section">
          <div class="section-label" style="margin-bottom:12px">[+] metadata override (optional)</div>
          <div class="form-row"><label for="uploadArtist">artist</label><input id="uploadArtist" name="artist" placeholder="auto from tags" /></div>
          <div class="form-row"><label for="uploadAlbum">album title</label><input id="uploadAlbum" name="album" placeholder="auto from tags" /></div>
          <div class="form-row"><label for="uploadTitle">song title</label><input id="uploadTitle" name="title" placeholder="auto from tags (single file)" /></div>
          <div class="form-row"><label for="uploadGenre">genre</label><input id="uploadGenre" name="genre" placeholder="auto from tags" /></div>
          <div class="form-row"><label for="uploadYear">year</label><input id="uploadYear" name="year" type="number" min="1900" max="2099" /></div>
          <div class="checkbox-row">
            <input type="checkbox" name="isAudiobook" id="uploadIsAb">
            <label for="uploadIsAb">spoken word / audiobook</label>
          </div>
        </div>
        <div class="form-section">
          <div class="section-label" style="margin-bottom:12px">[+] cover image (optional)</div>
          <div class="form-row"><label for="coverInput">cover image</label><input id="coverInput" type="file" name="cover" accept=".jpg,.jpeg,.png,.webp"></div>
        </div>
        <div id="uploadProgress"></div>
        <div id="uploadErr" class="error-msg" style="display:none" role="alert"></div>
        <button type="submit" class="btn-primary" style="margin-top:8px">[+] upload</button>
      </form>`;

    const zone  = document.getElementById('uploadZone');
    const input = document.getElementById('fileInput');
    const list  = document.getElementById('fileList');

    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      input.files = e.dataTransfer.files;
      showFileList(input.files);
    });
    input.addEventListener('change', () => showFileList(input.files));

    function showFileList(files) {
      list.innerHTML = [...files].map(f => `<div class="upload-progress">${esc(f.name)} <span class="mute">(${(f.size / 1048576).toFixed(1)} MB)</span></div>`).join('');
    }

    document.getElementById('uploadForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('uploadErr');
      const progEl = document.getElementById('uploadProgress');
      errEl.style.display = 'none';
      if (!input.files.length) { errEl.textContent = 'choose at least one audio file'; errEl.style.display = 'block'; return; }
      progEl.innerHTML = '<div class="spinner"></div>';
      const fd = new FormData(e.target);
      try {
        const res  = await fetch('/admin/upload', { method: 'POST', body: fd });
        const json = await res.json();
        if (json.success) {
          progEl.innerHTML = `<div class="badge success">[+] uploaded ${json.uploaded} file${json.uploaded !== 1 ? 's' : ''}</div>`;
          list.innerHTML = '';
        } else {
          progEl.innerHTML = '';
          errEl.textContent = json.error || 'upload failed';
          errEl.style.display = 'block';
        }
      } catch {
        progEl.innerHTML = '';
        errEl.textContent = 'upload failed (network error)';
        errEl.style.display = 'block';
      }
    });
  }

  async function renderAdminSongs(container) {
    container.innerHTML = '<div class="spinner"></div>';
    const songs = await apiFetch('/api/songs');
    if (!songs.length) { container.innerHTML = '<div class="empty-state"><p>no songs uploaded yet</p></div>'; return; }
    container.innerHTML = `
      <h2 style="margin-bottom:16px">[=] songs (${songs.length})</h2>
      <ul class="song-list">
        ${songs.map(s => `
          <li class="song-row" style="cursor:default">
            <div class="song-cover">${s.cover ? `<img src="/stream/cover/${s.cover}" alt="">` : '&#9834;'}</div>
            <div class="song-meta">
              <div class="song-title">${esc(s.title)}</div>
              <div class="song-sub">${esc(s.artist_name || '')} ${s.album_title ? '&middot; ' + esc(s.album_title) : ''}</div>
            </div>
            <button class="btn-icon" onclick="navigate('song','edit:${s.id}')" aria-label="Edit ${esc(s.title)}">edit</button>
            <button class="btn-danger" onclick="adminDeleteSong('${s.id}')" aria-label="Delete ${esc(s.title)}" style="margin-left:4px">del</button>
          </li>`).join('')}
      </ul>`;
  }

  window.adminDeleteSong = async function (id) {
    if (!confirm('permanently delete this song?')) return;
    await fetch(`/admin/songs/${id}`, { method: 'DELETE' });
    adminTab(document.querySelector('.admin-sidebar-item.active'), 'songs');
  };

  async function renderAdminAlbums(container) {
    container.innerHTML = '<div class="spinner"></div>';
    const albums = await apiFetch('/api/albums');
    if (!albums.length) { container.innerHTML = '<div class="empty-state"><p>no albums yet</p></div>'; return; }
    container.innerHTML = `
      <h2 style="margin-bottom:16px">&#9834; albums (${albums.length})</h2>
      <div class="card-scroll" style="flex-wrap:wrap">
        ${albums.map(a => `
          <div class="album-card" style="margin-bottom:16px">
            <div class="album-cover" onclick="navigate('album','${a.id}')" role="button" tabindex="0" aria-label="Open album ${esc(a.title)}" style="cursor:pointer">
              ${a.cover ? `<img src="/stream/cover/${a.cover}" alt="Cover for ${esc(a.title)}">` : '<span aria-hidden="true">&#9834;</span>'}
            </div>
            <div class="album-card-title">${esc(a.title)}</div>
            <div class="album-card-sub">${esc(a.artist_name || '')}</div>
            <button class="btn-danger" onclick="adminDeleteAlbum('${a.id}')" aria-label="Delete album ${esc(a.title)}" style="margin-top:4px;font-size:12px;height:28px;padding:2px 10px">delete album</button>
          </div>`).join('')}
      </div>`;
  }

  window.adminDeleteAlbum = async function (id) {
    if (!confirm('delete this album and all its songs?')) return;
    await fetch(`/admin/albums/${id}`, { method: 'DELETE' });
    adminTab(document.querySelector('.admin-sidebar-item.active'), 'albums');
  };

  async function renderAdminUsers(container) {
    if (currentUser.role !== 'admin') return;
    container.innerHTML = '<div class="spinner"></div>';
    const users = await apiFetch('/api/users');
    container.innerHTML = `
      <h2 style="margin-bottom:16px">[u] users</h2>
      <button class="btn-primary" onclick="adminCreateUser()" style="margin-bottom:16px">[+] new user</button>
      <ul class="song-list">
        ${users.map(u => `
          <li class="song-row" style="cursor:default">
            <div class="song-meta">
              <div class="song-title">${esc(u.username)}</div>
              <div class="song-sub">${u.role}</div>
            </div>
            ${u.id !== currentUser.id ? `<button class="btn-danger" onclick="adminDeleteUser('${u.id}')" aria-label="Delete user ${esc(u.username)}">del</button>` : '<span class="mute caption">(you)</span>'}
          </li>`).join('')}
      </ul>`;
  }

  window.adminCreateUser = async function () {
    const username = prompt('username:');
    if (!username) return;
    const password = prompt('password:');
    if (!password) return;
    const role = prompt('role (user / creator / admin):') || 'user';
    const res  = await apiFetch('/api/users', 'POST', { username, password, role });
    if (res.id) adminTab(document.querySelector('.admin-sidebar-item.active'), 'users');
    else alert(res.error || 'failed to create user');
  };

  window.adminDeleteUser = async function (id) {
    if (!confirm('delete this user?')) return;
    await fetch(`/api/users/${id}`, { method: 'DELETE' });
    adminTab(document.querySelector('.admin-sidebar-item.active'), 'users');
  };

  async function renderAdminStats(container) {
    container.innerHTML = '<div class="spinner"></div>';
    const s = await apiFetch('/api/stats');
    const usedGb  = (s.storageUsedBytes / 1073741824).toFixed(2);
    const pct     = Math.min(100, (s.storageUsedBytes / (s.maxStorageGb * 1073741824)) * 100).toFixed(1);
    container.innerHTML = `
      <h2 style="margin-bottom:24px">[%] stats</h2>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-value">${s.songs}</div><div class="stat-label">songs</div></div>
        <div class="stat-card"><div class="stat-value">${s.albums}</div><div class="stat-label">albums</div></div>
        <div class="stat-card"><div class="stat-value">${s.artists}</div><div class="stat-label">artists</div></div>
        <div class="stat-card"><div class="stat-value">${s.users}</div><div class="stat-label">users</div></div>
      </div>
      <div style="margin-top:8px;font-size:14px;color:var(--mute)">
        storage: ${usedGb} / ${s.maxStorageGb} GB
        <div class="progress-bar" style="margin-top:4px;max-width:400px">
          <div class="progress-fill" style="width:${pct}%" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"></div>
        </div>
        <span class="caption">${pct}% used</span>
      </div>`;
  }

  // ── AUDIO ENGINE ───────────────────────────────────────────────────────────
  // Supports MP3, AAC (.m4a/.aac), ALAC (.m4a), FLAC, OGG, WAV, OPUS.
  // AAC and ALAC are decoded natively by the HTML5 Audio element in all modern
  // browsers (Chrome, Firefox, Safari, Edge). No additional codec library needed.

  function playQueue(songs, idx, spokenWord) {
    queue       = songs;
    queueIndex  = idx;
    isSpokenWord = !!spokenWord;
    playSong(songs[idx]);
  }

  function playSong(song) {
    if (!song) return;
    currentSong = song;
    isSpokenWord = !!song.is_audiobook;

    audio.src  = `/stream/${song.id}`;
    audio.load();
    audio.play().catch(() => {});
    isPlaying  = true;

    apiFetch(`/api/songs/${song.id}/play`, 'POST').catch(() => {});
    updateNowPlayingBar();
    renderNowPlayingControls();

    // If now-playing full page is open, re-render it
    if (currentPage === 'nowplaying') renderNowPlaying();

    // Mark playing row
    document.querySelectorAll('.song-row').forEach(r => r.classList.remove('playing'));
    document.querySelectorAll(`[data-song-id="${song.id}"]`).forEach(r => r.classList.add('playing'));
  }

  window.playSong = playSong;

  function togglePlay() {
    if (!currentSong) return;
    if (isPlaying) {
      audio.pause();
      isPlaying = false;
    } else {
      audio.play().catch(() => {});
      isPlaying = true;
    }
    renderNowPlayingControls();
    if (currentPage === 'nowplaying') renderNowPlayingControls(document.getElementById('npFullControls'), true);
  }

  function stopAudio() {
    audio.pause();
    audio.currentTime = 0;
    isPlaying = false;
    renderNowPlayingControls();
    if (currentPage === 'nowplaying') renderNowPlayingControls(document.getElementById('npFullControls'), true);
  }

  function nextTrack() {
    if (queue.length && queueIndex < queue.length - 1) {
      queueIndex++;
      playSong(queue[queueIndex]);
    }
  }

  function prevTrack() {
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
    } else if (queue.length && queueIndex > 0) {
      queueIndex--;
      playSong(queue[queueIndex]);
    }
  }

  audio.addEventListener('ended', () => {
    if (isSpokenWord) return; // don't auto-advance in spoken word mode
    nextTrack();
  });

  audio.addEventListener('play',  () => { isPlaying = true;  renderNowPlayingControls(); });
  audio.addEventListener('pause', () => { isPlaying = false; renderNowPlayingControls(); });

  // Seek bar sync for the mini now-playing bar
  audio.addEventListener('timeupdate', () => {
    if (!audio.duration) return;
    npSeek.value           = (audio.currentTime / audio.duration) * 100;
    npCurrentTime.textContent = formatTime(Math.floor(audio.currentTime));
    npDuration.textContent    = formatTime(Math.floor(audio.duration));
  });

  npSeek.addEventListener('input', () => {
    if (audio.duration) audio.currentTime = (npSeek.value / 100) * audio.duration;
  });

  function updateNowPlayingBar() {
    if (!currentSong) return;
    npBar.style.display = 'grid';
    const coverHtml = currentSong.cover
      ? `<img src="/stream/cover/${currentSong.cover}" class="np-cover" alt="">`
      : `<div class="np-cover" aria-hidden="true">&#9834;</div>`;
    npInfo.innerHTML = `
      ${coverHtml}
      <div class="np-text">
        <div class="np-title">${esc(currentSong.title)}</div>
        <div class="np-artist">${esc(currentSong.artist_name || '')}</div>
      </div>`;
    renderNowPlayingControls();
  }

  // ── HELPERS ────────────────────────────────────────────────────────────────
  function section(label, content) {
    return `<div class="page-section"><div class="section-header"><span class="section-label">${label}</span></div>${content}</div>`;
  }

  function renderSongList(songs, context) {
    if (!songs.length) return '<div class="empty-state"><p>no songs</p></div>';
    return `<ul class="song-list" role="list">
      ${songs.map((s, i) => {
        const coverHtml = s.cover
          ? `<img src="/stream/cover/${s.cover}" class="song-cover" alt="" loading="lazy">`
          : `<div class="song-cover" aria-hidden="true">&#9834;</div>`;
        return `<li class="song-row" data-song-id="${s.id}" data-idx="${i}" data-context="${context}" role="listitem">
          ${coverHtml}
          <div class="song-meta">
            <div class="song-title">${esc(s.title)}</div>
            <div class="song-sub">${esc(s.artist_name || '')}${s.album_title ? ' &middot; ' + esc(s.album_title) : ''}</div>
          </div>
          <span class="song-duration">${formatTime(s.duration)}</span>
          <button class="song-more" data-song-id="${s.id}" aria-label="More options for ${esc(s.title)}" title="More options">${ICONS.dots}</button>
        </li>`;
      }).join('')}
    </ul>`;
  }

  function renderAlbumCard(album) {
    const coverHtml = album.cover
      ? `<img src="/stream/cover/${album.cover}" alt="Cover for ${esc(album.title)}">`
      : '<span aria-hidden="true">&#9834;</span>';
    return `<div class="album-card" data-id="${album.id}" role="button" tabindex="0" aria-label="Open album ${esc(album.title)}">
      <div class="album-cover">${coverHtml}</div>
      <div class="album-card-title">${esc(album.title)}</div>
      <div class="album-card-sub">${esc(album.artist_name || '')}</div>
    </div>`;
  }

  function bindSongRows() {
    // Click on row → play
    document.querySelectorAll('.song-row').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.song-more')) return; // handled by dots button
        const ctx    = row.dataset.context;
        const idx    = parseInt(row.dataset.idx, 10);
        const songId = row.dataset.songId;
        // Build queue from all rows in the same context
        const ctxRows = [...document.querySelectorAll(`.song-row[data-context="${ctx}"]`)];
        const ctxIdx  = ctxRows.indexOf(row);
        const songIds = ctxRows.map(r => r.dataset.songId);
        // We don't have full song objects here — play individually by ID
        apiFetch(`/api/songs/${songId}`).then(song => {
          queue      = [];  // will be rebuilt if needed
          queueIndex = 0;
          playSong(song);
        });
      });
    });

    // Dots button → show action sheet
    document.querySelectorAll('.song-more').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const songId = btn.dataset.songId;
        const song   = await apiFetch(`/api/songs/${songId}`);
        showSongSheet(song);
      });
    });
  }

  async function apiFetch(url, method = 'GET', body) {
    const opts = { method, headers: {} };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const res = await fetch(url, opts);
    if (!res.ok) return {};
    return res.json();
  }

  function esc(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatTime(secs) {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function showToast(msg) {
    let t = document.getElementById('cumuToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'cumuToast';
      t.className = 'cumu-toast';
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('visible');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('visible'), 2400);
  }

  // ── BOOT ───────────────────────────────────────────────────────────────────
  init();

})();
