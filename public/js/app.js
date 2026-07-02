// cumu — Main SPA
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  let currentUser  = null;
  let currentPage  = 'home';
  let queue        = [];
  let queueIndex   = 0;
  let isSpokenWord = false;
  let audio        = new Audio();
  let currentSong  = null;
  let isPlaying    = false;
  let playlists    = [];

  // ── DOM ────────────────────────────────────────────────────────────────────
  const main          = document.getElementById('mainContent');
  const loginModal     = document.getElementById('loginModal');
  const npBar          = document.getElementById('nowPlayingBar');
  const npInfo         = document.getElementById('npInfo');
  const npControls     = document.getElementById('npControls');
  const npSeek          = document.getElementById('npSeek');
  const npCurrentTime   = document.getElementById('npCurrentTime');
  const npDuration      = document.getElementById('npDuration');
  const contextMenu     = document.getElementById('contextMenu');
  const topNav          = document.getElementById('topNav');
  const bottomNav       = document.querySelector('.bottom-nav');
  const settingsBtn     = document.getElementById('settingsBtn');
  const adminBtn        = document.getElementById('adminBtn');

  // ── SVG icon set (used ONLY when Standard theme is active) ────────────────
  const ICONS = {
    play:      `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5,3 19,12 5,21"/></svg>`,
    pause:     `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="3" width="4" height="18"/><rect x="15" y="3" width="4" height="18"/></svg>`,
    stop:      `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`,
    prev:      `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="19,3 7,12 19,21"/><rect x="4" y="3" width="3" height="18"/></svg>`,
    next:      `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5,3 17,12 5,21"/><rect x="17" y="3" width="3" height="18"/></svg>`,
    seek_back: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 5V2L7 7l5 5V9a7 7 0 1 1-5.2 2.3"/><text x="6" y="19" font-size="6" fill="currentColor" stroke="none" font-family="monospace">15</text></svg>`,
    seek_fwd:  `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 5V2l5 5-5 5V9a7 7 0 1 0 5.2 2.3"/><text x="6" y="19" font-size="6" fill="currentColor" stroke="none" font-family="monospace">15</text></svg>`,
    dots:      `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`,
    plus:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><line x1="12" y1="4" x2="12" y2="20"/><line x1="4" y1="12" x2="20" y2="12"/></svg>`,
    back:      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="15,18 9,12 15,6"/></svg>`,
    close:     `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    heart:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
    info:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    album:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>`,
    artist:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="7" r="4"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>`,
    list:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1" fill="currentColor"/><circle cx="3" cy="12" r="1" fill="currentColor"/><circle cx="3" cy="18" r="1" fill="currentColor"/></svg>`,
    home:      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>`,
    search:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    library:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="4" height="16" rx="1"/><rect x="10" y="4" width="4" height="16" rx="1"/><path d="M17 4l4 1.5v13L17 20z"/></svg>`,
    settings:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    admin:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/></svg>`,
    edit:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`,
    trash:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
    users:     `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    stats:     `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
    note:      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
    upload:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
    empty:     `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  };

  // codec = [] text icons, standard = SVG icons
  const PLACEHOLDERS = {
    home: '[~]', search: '[?]', library: '[=]',
    settingsLabel: 'settings', adminLabel: 'admin',
  };

  function isStandardTheme() {
    return document.documentElement.getAttribute('data-theme') === 'standard';
  }

  function applyNavIconsForTheme() {
    const homeIcon    = document.querySelector('.nav-tab[data-page="home"] .nav-icon');
    const searchIcon  = document.querySelector('.nav-tab[data-page="search"] .nav-icon');
    const libraryIcon = document.querySelector('.nav-tab[data-page="library"] .nav-icon');

    if (isStandardTheme()) {
      if (homeIcon)    homeIcon.innerHTML    = ICONS.home;
      if (searchIcon)  searchIcon.innerHTML  = ICONS.search;
      if (libraryIcon) libraryIcon.innerHTML = ICONS.library;
      if (settingsBtn) { settingsBtn.innerHTML = ICONS.settings; settingsBtn.classList.add('icon-only'); }
      if (adminBtn)    { adminBtn.innerHTML    = ICONS.admin;    adminBtn.classList.add('icon-only'); }
    } else {
      if (homeIcon)    homeIcon.textContent    = PLACEHOLDERS.home;
      if (searchIcon)  searchIcon.textContent  = PLACEHOLDERS.search;
      if (libraryIcon) libraryIcon.textContent = PLACEHOLDERS.library;
      if (settingsBtn) { settingsBtn.innerHTML = PLACEHOLDERS.settingsLabel; settingsBtn.classList.remove('icon-only'); }
      if (adminBtn)    { adminBtn.innerHTML    = PLACEHOLDERS.adminLabel;    adminBtn.classList.remove('icon-only'); }
    }
  }

  function themedIcon(name, fallbackText) {
    return isStandardTheme() ? (ICONS[name] || '') : (fallbackText || '');
  }

  const audioCapabilities = (function () {
    const t = document.createElement('audio');
    return {
      aac:  t.canPlayType('audio/mp4; codecs="mp4a.40.2"') !== '',
      alac: t.canPlayType('audio/mp4; codecs="alac"') !== '',
      mp3:  t.canPlayType('audio/mpeg') !== '',
      flac: t.canPlayType('audio/flac') !== '',
      ogg:  t.canPlayType('audio/ogg; codecs="vorbis"') !== '',
      opus: t.canPlayType('audio/ogg; codecs="opus"') !== '',
    };
  })();

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
      adminBtn.style.display = 'inline-flex';
    }
    loadPlaylists();
    applyTheme(currentUser.theme || 'codec');
    applyNavIconsForTheme();
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

  const _origApplyTheme = window.applyTheme;
  window.applyTheme = function (theme) {
    if (typeof _origApplyTheme === 'function') _origApplyTheme(theme);
    else {
      if (theme === 'standard') {
        document.documentElement.setAttribute('data-theme', 'standard');
        localStorage.setItem('cumu_theme', 'standard');
      } else {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('cumu_theme', 'codec');
      }
    }
    applyNavIconsForTheme();
    if (currentPage && currentUser) navigate(currentPage, window._lastNavParams);
  };

  window.navigate = function (page, params) {
    currentPage = page;
    window._lastNavParams = params;

    document.querySelectorAll('.nav-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.page === page)
    );

    const isFullscreenNP = page === 'nowplaying';
    document.body.classList.toggle('np-fullscreen', isFullscreenNP);
    if (topNav)    topNav.style.display    = isFullscreenNP ? 'none' : '';
    if (bottomNav) bottomNav.style.display = isFullscreenNP ? 'none' : '';
    if (npBar)     npBar.style.display     = isFullscreenNP ? 'none' : (currentSong ? 'grid' : 'none');

    if      (page === 'home')       renderHome();
    else if (page === 'search')     renderSearch();
    else if (page === 'library')    renderLibrary();
    else if (page === 'admin')      renderAdmin();
    else if (page === 'album') {
      if (typeof params === 'string' && params.startsWith('edit:')) renderAlbumEdit(params.slice(5));
      else renderAlbum(params);
    }
    else if (page === 'artist')     renderArtist(params);
    else if (page === 'playlist')   renderPlaylist(params);
    else if (page === 'song')       renderSong(params);
    else if (page === 'nowplaying') renderNowPlaying();
    else if (page === 'settings')   initSettingsPage();
    window.scrollTo(0, 0);
  };

  async function renderHome() {
    main.innerHTML = '<div class="page-section"><div class="spinner"></div></div>';
    const data = await apiFetch('/api/home');
    let html = '';
    if (data.recentlyPlayed?.length) html += section(`${themedIcon('note', '[+]')} recently played`, renderSongList(data.recentlyPlayed, 'recent'));
    if (data.mostPlayed?.length)     html += section(`${themedIcon('note', '[+]')} most played`,      renderSongList(data.mostPlayed, 'popular'));
    if (data.newSongs?.length)       html += section(`${themedIcon('note', '[+]')} new additions`,    renderSongList(data.newSongs, 'new'));
    if (!html) html = `<div class="page-section"><div class="empty-state"><div class="big">${themedIcon('empty', '[~]')}</div><p>your library is empty<br>go to the admin panel to upload music</p></div></div>`;
    main.innerHTML = html;
    bindSongRows();
  }

  let searchTimeout;
  function renderSearch() {
    main.innerHTML = `
      <div class="page-section">
        <div class="section-header"><span class="section-label">${themedIcon('search', '[?]')} search</span></div>
        <div class="search-bar"><input type="search" id="searchInput" placeholder="search songs, albums, artists..." autofocus aria-label="Search" /></div>
        <div id="searchResults"></div>
      </div>`;
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
    if (data.artists?.length)   html += `<div class="section-header" style="margin-top:16px"><span class="section-label">artists</span></div><ul class="song-list">${data.artists.map(a => `<li class="song-row" onclick="navigate('artist','${a.id}')"><div class="song-cover">${themedIcon('artist', '[A]')}</div><div class="song-meta"><div class="song-title">${esc(a.name)}</div><div class="song-sub">${a.song_count || 0} songs</div></div></li>`).join('')}</ul>`;
    if (data.playlists?.length) html += `<div class="section-header" style="margin-top:16px"><span class="section-label">playlists</span></div><ul class="song-list">${data.playlists.map(p => `<li class="song-row" onclick="navigate('playlist','${p.id}')"><div class="song-cover">${themedIcon('library', '[=]')}</div><div class="song-meta"><div class="song-title">${esc(p.name)}</div></div></li>`).join('')}</ul>`;
    if (!html) html = `<div class="empty-state"><p>no results for &ldquo;${esc(q)}&rdquo;</p></div>`;
    el.innerHTML = html;
    bindSongRows();
    el.querySelectorAll('.album-card').forEach(c => c.addEventListener('click', () => navigate('album', c.dataset.id)));
  }

  async function renderLibrary() {
    main.innerHTML = '<div class="page-section"><div class="spinner"></div></div>';
    const data = await apiFetch('/api/library');
    await loadPlaylists();
    let html = '<div class="page-section">';
    html += `<div class="section-header"><span class="section-label">${themedIcon('library', '[=]')} my library</span><button class="btn-primary" onclick="showCreatePlaylist()">${themedIcon('plus', '[+]')} playlist</button></div>`;
    if (playlists.length) {
      html += `<div style="margin-bottom:24px"><h3 style="margin-bottom:12px">playlists</h3>`;
      html += playlists.map(p => `<div class="playlist-item" onclick="navigate('playlist','${p.id}')"><div class="playlist-cover">${themedIcon('library', '[=]')}</div><div class="song-meta"><div class="song-title">${esc(p.name)}</div><div class="song-sub">${p.description || 'playlist'}</div></div></div>`).join('');
      html += '</div>';
    }
    if (data.songs?.length) {
      html += `<h3 style="margin-bottom:12px">saved songs</h3>${renderSongList(data.songs, 'library')}`;
    } else {
      html += `<div class="empty-state"><div class="big">${themedIcon('empty', '[=]')}</div><p>no saved songs yet</p></div>`;
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

  function renderNowPlaying() {
    if (!currentSong) { navigate('home'); return; }
    const s = currentSong;
    const coverHtml = s.cover
      ? `<img src="/stream/cover/${s.cover}" class="np-full-cover" alt="Album cover for ${esc(s.title)}">`
      : `<div class="np-full-cover np-full-cover--placeholder" aria-hidden="true">${themedIcon('note', '&#9834;')}</div>`;

    main.innerHTML = `
      <div class="now-playing-page">
        <div class="np-page-topbar">
          <button class="icon-btn np-page-back" onclick="navigate('home')" aria-label="Close now playing">${themedIcon('back', '&larr;')}</button>
          <span class="np-page-label">now playing</span>
          <button class="icon-btn" id="npDots" aria-label="More options" aria-haspopup="true">${themedIcon('dots', '&bull;&bull;&bull;')}</button>
        </div>
        <div class="np-full-cover-wrap">${coverHtml}</div>
        <div class="np-full-info">
          <div class="np-full-title">${esc(s.title)}</div>
          <div class="np-full-artist">${esc(s.artist_name || 'unknown artist')}</div>
          ${s.is_audiobook ? '<span class="badge spoken-word">spoken word</span>' : ''}
        </div>
        <div class="np-full-seek">
          <span id="npFullCurrent">0:00</span>
          <input type="range" id="npFullSeek" min="0" max="100" value="0" class="seek-input" aria-label="Seek position">
          <span id="npFullDuration">0:00</span>
        </div>
        <div class="np-full-controls" id="npFullControls" role="group" aria-label="Playback controls"></div>
      </div>`;

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

    renderNowPlayingControls(document.getElementById('npFullControls'), true);

    document.getElementById('npDots')?.addEventListener('click', (e) => {
      e.stopPropagation();
      showSongSheet(s);
    });

    if (topNav)    topNav.style.display    = 'none';
    if (bottomNav) bottomNav.style.display = 'none';
    if (npBar)     npBar.style.display     = 'none';
    document.body.classList.add('np-fullscreen');
  }

  function renderNowPlayingControls(container, fullPage) {
    if (!container) container = npControls;

    if (isSpokenWord) {
      container.innerHTML = `
        <button class="np-btn${fullPage ? ' np-btn-lg' : ''}" id="ctrl-back" aria-label="Skip back 15 seconds" title="Back 15s">${themedIcon('seek_back', '&laquo;15')}</button>
        <button class="np-btn${fullPage ? ' np-btn-lg' : ''}" id="ctrl-playpause" aria-label="${isPlaying ? 'Pause' : 'Play'}" title="${isPlaying ? 'Pause' : 'Play'}">${isPlaying ? themedIcon('pause', 'II') : themedIcon('play', '&#9654;')}</button>
        <button class="np-btn${fullPage ? ' np-btn-lg' : ''}" id="ctrl-stop" aria-label="Stop" title="Stop">${themedIcon('stop', '[]')}</button>
        <button class="np-btn${fullPage ? ' np-btn-lg' : ''}" id="ctrl-fwd" aria-label="Skip forward 15 seconds" title="Forward 15s">${themedIcon('seek_fwd', '15&raquo;')}</button>`;
      container.querySelector('#ctrl-back').addEventListener('click', () => { audio.currentTime = Math.max(0, audio.currentTime - 15); });
      container.querySelector('#ctrl-fwd').addEventListener('click',  () => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 15); });
    } else {
      container.innerHTML = `
        <button class="np-btn${fullPage ? ' np-btn-lg' : ''}" id="ctrl-prev" aria-label="Previous track" title="Previous">${themedIcon('prev', '&#9668;&#9668;')}</button>
        <button class="np-btn${fullPage ? ' np-btn-lg' : ''}" id="ctrl-playpause" aria-label="${isPlaying ? 'Pause' : 'Play'}" title="${isPlaying ? 'Pause' : 'Play'}">${isPlaying ? themedIcon('pause', 'II') : themedIcon('play', '&#9654;')}</button>
        <button class="np-btn${fullPage ? ' np-btn-lg' : ''}" id="ctrl-stop" aria-label="Stop" title="Stop">${themedIcon('stop', '[]')}</button>
        <button class="np-btn${fullPage ? ' np-btn-lg' : ''}" id="ctrl-next" aria-label="Next track" title="Next">${themedIcon('next', '&#9658;&#9658;')}</button>`;
      container.querySelector('#ctrl-prev').addEventListener('click', prevTrack);
      container.querySelector('#ctrl-next').addEventListener('click', nextTrack);
    }

    container.querySelector('#ctrl-playpause').addEventListener('click', togglePlay);
    container.querySelector('#ctrl-stop').addEventListener('click', stopAudio);
  }

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
        <button class="sheet-item" id="si-playlist" role="menuitem">${themedIcon('list', '[=]')} <span>add to playlist</span></button>
        <button class="sheet-item" id="si-library"  role="menuitem">${themedIcon('heart', '[<3]')} <span>save to library</span></button>
        <button class="sheet-item" id="si-info"     role="menuitem">${themedIcon('info', '[i]')} <span>song info</span></button>
        ${song.album_id  ? `<button class="sheet-item" id="si-album"  role="menuitem">${themedIcon('album', '[o]')} <span>view album</span></button>` : ''}
        ${song.artist_id ? `<button class="sheet-item" id="si-artist" role="menuitem">${themedIcon('artist', '[A]')} <span>view artist</span></button>` : ''}
        ${['admin', 'creator'].includes(currentUser?.role) ? `<button class="sheet-item danger" id="si-edit" role="menuitem">${themedIcon('edit', '[edit]')} <span>edit song</span></button>` : ''}
        <button class="sheet-item muted" id="si-cancel" role="menuitem">${themedIcon('close', '[x]')} <span>cancel</span></button>
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

  async function addSongToPlaylist(songId, targetPlaylistId) {
    if (targetPlaylistId) {
      await apiFetch(`/api/playlists/${targetPlaylistId}/songs`, 'POST', { songId });
      showToast('added to playlist');
      return;
    }
    await loadPlaylists();
    if (!playlists.length) { alert('create a playlist first'); return; }
    const names = playlists.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
    const idx   = parseInt(prompt(`choose playlist:\n${names}`)) - 1;
    if (idx >= 0 && playlists[idx]) {
      await apiFetch(`/api/playlists/${playlists[idx].id}/songs`, 'POST', { songId });
      showToast(`added to "${playlists[idx].name}"`);
    }
  }

  async function renderAlbum(albumId) {
    main.innerHTML = '<div class="page-section"><div class="spinner"></div></div>';
    const album = await apiFetch(`/api/albums/${albumId}`);
    const coverSrc = album.cover ? `/stream/cover/${album.cover}` : null;
    main.innerHTML = `
      <div class="artist-hero">
        ${coverSrc
          ? `<img src="${coverSrc}" style="width:100px;height:100px;border-radius:4px;object-fit:cover;margin-bottom:12px" alt="Album art for ${esc(album.title)}">`
          : `<div style="font-size:60px;margin-bottom:12px" aria-hidden="true">${themedIcon('note', '[&#9834;]')}</div>`
        }
        <h1>${esc(album.title)}</h1>
        <p class="caption">${esc(album.artist_name || 'unknown')} ${album.year ? '&middot; ' + album.year : ''} ${album.is_audiobook ? '<span class="badge spoken-word">spoken word</span>' : ''}</p>
        <div style="margin-top:16px;display:flex;gap:8px">
          <button class="btn-primary" onclick="_playAlbum()" aria-label="Play all songs in ${esc(album.title)}">${themedIcon('play', '&#9654;')} play all</button>
          ${['admin', 'creator'].includes(currentUser?.role) ? `<button class="btn-secondary" onclick="navigate('album','edit:${album.id}')">${themedIcon('edit', '[edit]')} edit</button>` : ''}
        </div>
      </div>
      <div class="page-section">
        <div class="section-header"><span class="section-label">${themedIcon('list', '[+]')} tracklist (${album.songs?.length || 0})</span></div>
        ${renderSongList(album.songs || [], 'album_' + albumId)}
      </div>`;
    bindSongRows();
    window._playAlbum = () => { if (album.songs?.length) playQueue(album.songs, 0, album.is_audiobook); };
  }

  async function renderAlbumEdit(id) {
    if (!['admin', 'creator'].includes(currentUser?.role)) { navigate('home'); return; }
    const album = await apiFetch(`/api/albums/${id}`);
    main.innerHTML = `
      <div class="page-section">
        <div class="section-header"><span class="section-label">${themedIcon('edit', '[edit]')} edit album</span></div>
        <form id="editAlbumForm">
          <div class="form-row"><label for="editAlbumTitle">title</label><input id="editAlbumTitle" name="title" value="${esc(album.title)}" /></div>
          <div class="form-row"><label for="editAlbumArtist">artist</label><input id="editAlbumArtist" name="artist" value="${esc(album.artist_name || '')}" /></div>
          <div class="form-row"><label for="editAlbumYear">year</label><input id="editAlbumYear" name="year" type="number" value="${album.year || ''}" /></div>
          <div class="form-row"><label for="editAlbumGenre">genre</label><input id="editAlbumGenre" name="genre" value="${esc(album.genre || '')}" /></div>
          <div class="checkbox-row">
            <input type="checkbox" name="is_audiobook" id="editAlbumAb" ${album.is_audiobook ? 'checked' : ''}>
            <label for="editAlbumAb">spoken word / audiobook</label>
          </div>
          <div id="editAlbumErr" class="error-msg" style="display:none" role="alert"></div>
          <div style="margin-top:16px;display:flex;gap:8px">
            <button type="submit" class="btn-primary">save</button>
            <button type="button" class="btn-secondary" onclick="navigate('album','${id}')">cancel</button>
          </div>
        </form>
      </div>`;
    document.getElementById('editAlbumForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      fd.is_audiobook = !!fd.is_audiobook;
      try {
        const res = await fetch(`/admin/albums/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fd),
        });
        if (res.ok) navigate('album', id);
        else {
          const j = await res.json().catch(() => ({}));
          document.getElementById('editAlbumErr').textContent = j.error || 'save failed';
          document.getElementById('editAlbumErr').style.display = 'block';
        }
      } catch {
        document.getElementById('editAlbumErr').textContent = 'save failed (network error)';
        document.getElementById('editAlbumErr').style.display = 'block';
      }
    });
  }

  async function renderArtist(artistId) {
    main.innerHTML = '<div class="page-section"><div class="spinner"></div></div>';
    const artist = await apiFetch(`/api/artists/${artistId}`);
    let html = `<div class="artist-hero"><div style="font-size:60px;margin-bottom:12px" aria-hidden="true">${themedIcon('artist', '[A]')}</div><h1>${esc(artist.name)}</h1><p class="caption">${artist.albums?.length || 0} albums &middot; ${artist.songs?.length || 0} songs</p></div><div class="page-section">`;
    if (artist.albums?.length) html += `<div class="section-header"><span class="section-label">${themedIcon('album', '[+]')} albums</span></div><div class="card-scroll">${artist.albums.map(renderAlbumCard).join('')}</div>`;
    if (artist.songs?.length)  html += `<div class="section-header" style="margin-top:24px"><span class="section-label">${themedIcon('list', '[+]')} all songs</span></div>${renderSongList(artist.songs, 'artist')}`;
    html += '</div>';
    main.innerHTML = html;
    bindSongRows();
    main.querySelectorAll('.album-card').forEach(c => c.addEventListener('click', () => navigate('album', c.dataset.id)));
  }

  async function renderPlaylist(playlistId) {
    main.innerHTML = '<div class="page-section"><div class="spinner"></div></div>';
    const playlist = await apiFetch(`/api/playlists/${playlistId}`);
    main.innerHTML = `
      <div class="artist-hero">
        <div style="font-size:60px;margin-bottom:12px" aria-hidden="true">${themedIcon('library', '[=]')}</div>
        <h1>${esc(playlist.name)}</h1>
        <p class="caption">${playlist.songs?.length || 0} songs</p>
        <div style="margin-top:16px;display:flex;gap:8px">
          <button class="btn-primary" onclick="_playPlaylist()" aria-label="Play playlist ${esc(playlist.name)}">${themedIcon('play', '&#9654;')} play</button>
          <button class="btn-secondary" id="playlistAddBtn" aria-label="Add songs to ${esc(playlist.name)}">${themedIcon('plus', '[+]')} add songs</button>
          <button class="btn-danger" onclick="_deletePlaylist('${playlistId}')" aria-label="Delete playlist ${esc(playlist.name)}">${themedIcon('trash', '[x]')} delete</button>
        </div>
      </div>
      <div class="page-section" id="playlistSongsWrap">${renderSongList(playlist.songs || [], 'pl_' + playlistId)}</div>`;
    bindSongRows();
    window._playPlaylist  = () => { if (playlist.songs?.length) playQueue(playlist.songs, 0, false); };
    window._deletePlaylist = async (id) => {
      if (!confirm('delete playlist?')) return;
      await apiFetch(`/api/playlists/${id}`, 'DELETE');
      await loadPlaylists();
      navigate('library');
    };
    document.getElementById('playlistAddBtn').addEventListener('click', () => showAddSongsToPlaylistModal(playlistId));
  }

  function showAddSongsToPlaylistModal(playlistId) {
    let modal = document.getElementById('addSongsModal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'addSongsModal';
    modal.className = 'modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Add songs to playlist');
    modal.innerHTML = `
      <div class="modal" style="max-width:480px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <h3>add songs</h3>
          <button class="icon-btn" id="addSongsClose" aria-label="Close">${themedIcon('close', '[x]')}</button>
        </div>
        <div class="search-bar"><input type="search" id="addSongsInput" placeholder="search songs..." autofocus aria-label="Search songs to add" /></div>
        <div id="addSongsResults" style="max-height:360px;overflow-y:auto;margin-top:12px"></div>
      </div>`;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('#addSongsClose').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    let t;
    modal.querySelector('#addSongsInput').addEventListener('input', (e) => {
      clearTimeout(t);
      t = setTimeout(() => doAddSongsSearch(e.target.value, playlistId), 250);
    });
  }

  async function doAddSongsSearch(q, playlistId) {
    const el = document.getElementById('addSongsResults');
    if (!el) return;
    if (!q) { el.innerHTML = ''; return; }
    const data = await apiFetch(`/api/search?q=${encodeURIComponent(q)}`);
    const songs = data.songs || [];
    if (!songs.length) { el.innerHTML = '<div class="empty-state"><p>no songs found</p></div>'; return; }
    el.innerHTML = `<ul class="song-list">${songs.map(s => `
      <li class="song-row" style="cursor:default">
        <div class="song-cover">${s.cover ? `<img src="/stream/cover/${s.cover}" alt="">` : themedIcon('note', '&#9834;')}</div>
        <div class="song-meta">
          <div class="song-title">${esc(s.title)}</div>
          <div class="song-sub">${esc(s.artist_name || '')}</div>
        </div>
        <button class="btn-icon add-song-btn" data-song-id="${s.id}" aria-label="Add ${esc(s.title)} to playlist">${themedIcon('plus', '[+]')} add</button>
      </li>`).join('')}</ul>`;
    el.querySelectorAll('.add-song-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        await addSongToPlaylist(btn.dataset.songId, playlistId);
        btn.textContent = 'added';
        const playlist = await apiFetch(`/api/playlists/${playlistId}`);
        const wrap = document.getElementById('playlistSongsWrap');
        if (wrap) { wrap.innerHTML = renderSongList(playlist.songs || [], 'pl_' + playlistId); bindSongRows(); }
      });
    });
  }

  async function renderSong(songParam) {
    if (songParam?.startsWith('edit:')) { renderSongEdit(songParam.slice(5)); return; }
    const song = await apiFetch(`/api/songs/${songParam}`);
    const coverSrc = song.cover ? `/stream/cover/${song.cover}` : null;

    let codecWarning = '';
    const ext = (song.mime_type || '').includes('mp4') || (song.mime_type || '').includes('aac');
    if (ext && !audioCapabilities.aac) {
      codecWarning = `<div class="badge warning" style="margin-top:8px">your browser may not support this audio format (AAC/ALAC)</div>`;
    }

    main.innerHTML = `
      <div class="artist-hero">
        ${coverSrc
          ? `<img src="${coverSrc}" style="width:120px;height:120px;border-radius:4px;object-fit:cover;margin-bottom:12px" alt="Cover for ${esc(song.title)}">`
          : `<div style="font-size:64px;margin-bottom:12px" aria-hidden="true">${themedIcon('note', '&#9834;')}</div>`
        }
        <h1>${esc(song.title)}</h1>
        <p class="caption">
          ${song.artist_name ? `<a href="#" onclick="navigate('artist','${song.artist_id}');return false">${esc(song.artist_name)}</a>` : 'unknown artist'}
          ${song.album_title ? ` &middot; <a href="#" onclick="navigate('album','${song.album_id}');return false">${esc(song.album_title)}</a>` : ''}
          ${song.is_audiobook ? '<span class="badge spoken-word">spoken word</span>' : ''}
        </p>
        ${codecWarning}
        <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-primary" onclick="playSong(_songData)" aria-label="Play ${esc(song.title)}">${themedIcon('play', '&#9654;')} play</button>
          <button class="btn-secondary" onclick="apiFetch('/api/library/song','POST',{songId:'${song.id}'})">${themedIcon('heart', '[<3]')} save to library</button>
          ${['admin', 'creator'].includes(currentUser?.role) ? `<button class="btn-secondary" onclick="navigate('song','edit:${song.id}')">${themedIcon('edit', '[edit]')} edit</button>` : ''}
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

  async function renderSongEdit(id) {
    if (!['admin', 'creator'].includes(currentUser?.role)) { navigate('home'); return; }
    const song = await apiFetch(`/api/songs/${id}`);
    main.innerHTML = `
      <div class="page-section">
        <div class="section-header"><span class="section-label">${themedIcon('edit', '[edit]')} edit song</span></div>
        <form id="editSongForm">
          <div class="form-row"><label for="editTitle">title</label><input id="editTitle" name="title" value="${esc(song.title)}" /></div>
          <div class="form-row"><label for="editArtist">artist</label><input id="editArtist" name="artist" value="${esc(song.artist_name || '')}" placeholder="artist name" /></div>
          <div class="form-row"><label for="editAlbum">album</label><input id="editAlbum" name="album" value="${esc(song.album_title || '')}" placeholder="album title" /></div>
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
            <button type="button" class="btn-secondary" onclick="navigate('song','${id}')">cancel</button>
          </div>
        </form>
      </div>`;
    document.getElementById('editSongForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      fd.is_audiobook = !!fd.is_audiobook;
      try {
        const res = await fetch(`/admin/songs/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fd),
        });
        if (res.ok) navigate('song', id);
        else {
          const j = await res.json().catch(() => ({}));
          document.getElementById('editErr').textContent = j.error || 'save failed';
          document.getElementById('editErr').style.display = 'block';
        }
      } catch {
        document.getElementById('editErr').textContent = 'save failed (network error)';
        document.getElementById('editErr').style.display = 'block';
      }
    });
  }

  function renderAdmin() {
    if (!['admin', 'creator'].includes(currentUser?.role)) { navigate('home'); return; }
    main.innerHTML = `
      <div class="admin-grid">
        <div class="admin-sidebar" role="navigation" aria-label="Admin tabs">
          <button class="admin-sidebar-item active" onclick="adminTab(this,'upload')">${themedIcon('upload', '[+]')} upload</button>
          <button class="admin-sidebar-item" onclick="adminTab(this,'songs')">${themedIcon('list', '[=]')} songs</button>
          <button class="admin-sidebar-item" onclick="adminTab(this,'albums')">${themedIcon('album', '[o]')} albums</button>
          ${currentUser.role === 'admin' ? `<button class="admin-sidebar-item" onclick="adminTab(this,'users')">${themedIcon('users', '[u]')} users</button>` : ''}
          <button class="admin-sidebar-item" onclick="adminTab(this,'stats')">${themedIcon('stats', '[%]')} stats</button>
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
      <h2 style="margin-bottom:24px">${themedIcon('upload', '[+]')} upload music</h2>
      <form id="uploadForm" enctype="multipart/form-data">
        <div class="upload-zone" id="uploadZone">
          <input type="file" id="fileInput" name="files" multiple accept=".mp3,.m4a,.aac,.mp4,.flac,.ogg,.wav,.opus" style="display:none" aria-label="Choose audio files">
          <div class="upload-label">${themedIcon('upload', '[+]')} click or drag files here</div>
          <div class="upload-sub">mp3 &bull; aac &bull; alac (m4a) &bull; flac &bull; ogg &bull; wav</div>
          <button type="button" class="btn-secondary" style="margin-top:12px" onclick="document.getElementById('fileInput').click()">choose files</button>
        </div>
        <div id="fileList" style="margin-bottom:16px"></div>
        <div class="form-section">
          <div class="section-label" style="margin-bottom:12px">metadata override (optional)</div>
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
          <div class="section-label" style="margin-bottom:12px">cover image (optional)</div>
          <div class="form-row"><label for="coverInput">cover image</label><input id="coverInput" type="file" name="cover" accept=".jpg,.jpeg,.png,.webp"></div>
        </div>
        <div id="uploadProgress"></div>
        <div id="uploadErr" class="error-msg" style="display:none" role="alert"></div>
        <button type="submit" class="btn-primary" style="margin-top:8px">${themedIcon('upload', '[+]')} upload</button>
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
      const errEl  = document.getElementById('uploadErr');
      const progEl = document.getElementById('uploadProgress');
      errEl.style.display = 'none';
      errEl.textContent = '';
      if (!input.files.length) { errEl.textContent = 'choose at least one audio file'; errEl.style.display = 'block'; return; }

      const fd = new FormData(e.target);
      progEl.innerHTML = `<div class="upload-progress"><div class="spinner"></div> <span id="uploadPct">uploading... 0%</span></div>`;
      const pctEl = document.getElementById('uploadPct');

      try {
        const json = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/admin/upload');
          xhr.timeout = 10 * 60 * 1000;

          xhr.upload.addEventListener('progress', (ev) => {
            if (ev.lengthComputable && pctEl) {
              const pct = Math.round((ev.loaded / ev.total) * 100);
              pctEl.textContent = `uploading... ${pct}%`;
            }
          });

          xhr.addEventListener('load', () => {
            let body = {};
            try { body = JSON.parse(xhr.responseText); } catch { body = {}; }
            if (xhr.status >= 200 && xhr.status < 300) resolve(body);
            else reject(new Error(body.error || `upload failed (server responded ${xhr.status})`));
          });

          xhr.addEventListener('error', () => reject(new Error('upload failed (network error) — check your connection or server logs')));
          xhr.addEventListener('timeout', () => reject(new Error('upload failed (timed out)')));
          xhr.addEventListener('abort', () => reject(new Error('upload cancelled')));

          xhr.send(fd);
        });

        if (json.success) {
          progEl.innerHTML = `<div class="badge success">${themedIcon('upload', '[+]')} uploaded ${json.uploaded} file${json.uploaded !== 1 ? 's' : ''}</div>`;
          list.innerHTML = '';
          input.value = '';
        } else {
          progEl.innerHTML = '';
          errEl.textContent = json.error || 'upload failed';
          errEl.style.display = 'block';
        }
      } catch (err) {
        progEl.innerHTML = '';
        errEl.textContent = err.message || 'upload failed (network error)';
        errEl.style.display = 'block';
      }
    });
  }

  async function renderAdminSongs(container) {
    container.innerHTML = '<div class="spinner"></div>';
    const songs = await apiFetch('/api/songs');
    if (!songs.length) { container.innerHTML = '<div class="empty-state"><p>no songs uploaded yet</p></div>'; return; }
    container.innerHTML = `
      <h2 style="margin-bottom:16px">${themedIcon('list', '[=]')} songs (${songs.length})</h2>
      <ul class="song-list">
        ${songs.map(s => `
          <li class="song-row" style="cursor:default">
            <div class="song-cover">${s.cover ? `<img src="/stream/cover/${s.cover}" alt="">` : themedIcon('note', '&#9834;')}</div>
            <div class="song-meta">
              <div class="song-title">${esc(s.title)}</div>
              <div class="song-sub">${esc(s.artist_name || '')} ${s.album_title ? '&middot; ' + esc(s.album_title) : ''}</div>
            </div>
            <button class="btn-icon" onclick="navigate('song','edit:${s.id}')" aria-label="Edit ${esc(s.title)}">${themedIcon('edit', 'edit')}</button>
            <button class="btn-danger" onclick="adminDeleteSong('${s.id}')" aria-label="Delete ${esc(s.title)}" style="margin-left:4px">${themedIcon('trash', 'del')}</button>
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
      <h2 style="margin-bottom:16px">${themedIcon('album', '[o]')} albums (${albums.length})</h2>
      <div class="card-scroll" style="flex-wrap:wrap">
        ${albums.map(a => `
          <div class="album-card" style="margin-bottom:16px">
            <div class="album-cover" onclick="navigate('album','${a.id}')" role="button" tabindex="0" aria-label="Open album ${esc(a.title)}" style="cursor:pointer">
              ${a.cover ? `<img src="/stream/cover/${a.cover}" alt="Cover for ${esc(a.title)}">` : `<span aria-hidden="true">${themedIcon('note', '[o]')}</span>`}
            </div>
            <div class="album-card-title">${esc(a.title)}</div>
            <div class="album-card-sub">${esc(a.artist_name || '')}</div>
            <div style="display:flex;gap:4px;margin-top:4px">
              <button class="btn-icon" onclick="navigate('album','edit:${a.id}')" aria-label="Edit album ${esc(a.title)}" style="font-size:12px;height:28px;padding:2px 10px">${themedIcon('edit', 'edit')}</button>
              <button class="btn-danger" onclick="adminDeleteAlbum('${a.id}')" aria-label="Delete album ${esc(a.title)}" style="font-size:12px;height:28px;padding:2px 10px">${themedIcon('trash', 'delete album')}</button>
            </div>
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
      <h2 style="margin-bottom:16px">${themedIcon('users', '[u]')} users</h2>
      <button class="btn-primary" onclick="adminCreateUser()" style="margin-bottom:16px">${themedIcon('plus', '[+]')} new user</button>
      <ul class="song-list">
        ${users.map(u => `
          <li class="song-row" style="cursor:default">
            <div class="song-meta">
              <div class="song-title">${esc(u.username)}</div>
              <div class="song-sub">${u.role}</div>
            </div>
            ${u.id !== currentUser.id ? `<button class="btn-danger" onclick="adminDeleteUser('${u.id}')" aria-label="Delete user ${esc(u.username)}">${themedIcon('trash', 'del')}</button>` : '<span class="mute caption">(you)</span>'}
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
      <h2 style="margin-bottom:24px">${themedIcon('stats', '[%]')} stats</h2>
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

    if (currentPage === 'nowplaying') renderNowPlaying();

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
    if (isSpokenWord) return;
    nextTrack();
  });

  audio.addEventListener('play',  () => { isPlaying = true;  renderNowPlayingControls(); });
  audio.addEventListener('pause', () => { isPlaying = false; renderNowPlayingControls(); });

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
    if (currentPage === 'nowplaying') { npBar.style.display = 'none'; return; }
    npBar.style.display = 'grid';
    const coverHtml = currentSong.cover
      ? `<img src="/stream/cover/${currentSong.cover}" class="np-cover" alt="">`
      : `<div class="np-cover" aria-hidden="true">${themedIcon('note', '&#9834;')}</div>`;
    npInfo.innerHTML = `
      ${coverHtml}
      <div class="np-text">
        <div class="np-title">${esc(currentSong.title)}</div>
        <div class="np-artist">${esc(currentSong.artist_name || '')}</div>
      </div>`;
    renderNowPlayingControls();
  }

  function section(label, content) {
    return `<div class="page-section"><div class="section-header"><span class="section-label">${label}</span></div>${content}</div>`;
  }

  function renderSongList(songs, context) {
    if (!songs.length) return '<div class="empty-state"><p>no songs</p></div>';
    return `<ul class="song-list" role="list">
      ${songs.map((s, i) => {
        const coverHtml = s.cover
          ? `<img src="/stream/cover/${s.cover}" class="song-cover" alt="" loading="lazy">`
          : `<div class="song-cover" aria-hidden="true">${themedIcon('note', '&#9834;')}</div>`;
        return `<li class="song-row" data-song-id="${s.id}" data-idx="${i}" data-context="${context}" role="listitem">
          ${coverHtml}
          <div class="song-meta">
            <div class="song-title">${esc(s.title)}</div>
            <div class="song-sub">${esc(s.artist_name || '')}${s.album_title ? ' &middot; ' + esc(s.album_title) : ''}</div>
          </div>
          <span class="song-duration">${formatTime(s.duration)}</span>
          <button class="song-more" data-song-id="${s.id}" aria-label="More options for ${esc(s.title)}" title="More options">${themedIcon('dots', '&bull;&bull;&bull;')}</button>
        </li>`;
      }).join('')}
    </ul>`;
  }

  function renderAlbumCard(album) {
    const coverHtml = album.cover
      ? `<img src="/stream/cover/${album.cover}" alt="Cover for ${esc(album.title)}">`
      : `<span aria-hidden="true">${themedIcon('note', '&#9834;')}</span>`;
    return `<div class="album-card" data-id="${album.id}" role="button" tabindex="0" aria-label="Open album ${esc(album.title)}">
      <div class="album-cover">${coverHtml}</div>
      <div class="album-card-title">${esc(album.title)}</div>
      <div class="album-card-sub">${esc(album.artist_name || '')}</div>
    </div>`;
  }

  function bindSongRows() {
    document.querySelectorAll('.song-row').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.song-more')) return;
        const songId = row.dataset.songId;
        apiFetch(`/api/songs/${songId}`).then(song => {
          queue      = [];
          queueIndex = 0;
          playSong(song);
        });
      });
    });

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
      .replace(/\"/g, '&quot;')
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

  init();

})();
