// cumu — Main SPA  (v2: AAC/ALAC, SVG icons, Now Playing page, 3-dot menu, English terms)
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  let currentUser = null;
  let currentPage = 'home';
  let queue       = [];
  let queueIndex  = 0;
  let isSpokenWord = false;   // formerly "audiobook / Hörspiel"
  let audio       = new Audio();
  let currentSong = null;
  let isPlaying   = false;
  let playlists   = [];

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
    play:  `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>`,
    pause: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="4" height="18"/><rect x="15" y="3" width="4" height="18"/></svg>`,
    stop:  `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`,
    prev:  `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="19,3 7,12 19,21"/><rect x="4" y="3" width="3" height="18"/></svg>`,
    next:  `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 17,12 5,21"/><rect x="17" y="3" width="3" height="18"/></svg>`,
    seek_back:  `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5V2L7 7l5 5V9a7 7 0 1 1-5.2 2.3"/><text x="6" y="19" font-size="6" fill="currentColor" stroke="none" font-family="monospace">15</text></svg>`,
    seek_fwd:   `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5V2l5 5-5 5V9a7 7 0 1 0 5.2 2.3"/><text x="6" y="19" font-size="6" fill="currentColor" stroke="none" font-family="monospace">15</text></svg>`,
    dots:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`,
    plus:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="4" x2="12" y2="20"/><line x1="4" y1="12" x2="20" y2="12"/></svg>`,
    back:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"/></svg>`,
    close: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    heart: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
    info:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    album: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>`,
    artist:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="7" r="4"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>`,
    list:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1" fill="currentColor"/><circle cx="3" cy="12" r="1" fill="currentColor"/><circle cx="3" cy="18" r="1" fill="currentColor"/></svg>`,
  };

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
    if (['admin','creator'].includes(currentUser.role)) document.getElementById('adminBtn').style.display = 'inline-flex';
    loadPlaylists();
    navigate('home');
  }

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data  = Object.fromEntries(new FormData(e.target));
    const errEl = document.getElementById('loginError');
    errEl.style.display = 'none';
    const res  = await fetch('/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
    const json = await res.json();
    if (json.success) { currentUser = json.user; onLogin(); }
    else { errEl.textContent = json.error || 'Login failed'; errEl.style.display = 'block'; }
  });

  window.logout = async function () {
    await fetch('/auth/logout', { method: 'POST' });
    currentUser = null; stopAudio(); showLogin();
  };

  async function loadPlaylists() {
    try { const r = await fetch('/api/playlists'); if (r.ok) playlists = await r.json(); } catch {}
  }

  // ── Router ─────────────────────────────────────────────────────────────────
  window.navigate = function (page, params) {
    currentPage = page;
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.page === page));
    if      (page === 'home')        renderHome();
    else if (page === 'search')      renderSearch();
    else if (page === 'library')     renderLibrary();
    else if (page === 'admin')       renderAdmin();
    else if (page === 'album')       renderAlbum(params);
    else if (page === 'artist')      renderArtist(params);
    else if (page === 'playlist')    renderPlaylist(params);
    else if (page === 'song')        renderSong(params);
    else if (page === 'nowplaying')  renderNowPlaying();
    window.scrollTo(0, 0);
  };

  // ── HOME ───────────────────────────────────────────────────────────────────
  async function renderHome() {
    main.innerHTML = '<div class="page-section"><div class="spinner"></div></div>';
    const data = await apiFetch('/api/home');
    let html = '';
    if (data.recentlyPlayed?.length) html += section('[+] recently played', renderSongList(data.recentlyPlayed, 'recent'));
    if (data.mostPlayed?.length)     html += section('[+] most played',      renderSongList(data.mostPlayed,     'popular'));
    if (data.newSongs?.length)       html += section('[+] new additions',    renderSongList(data.newSongs,       'new'));
    if (!html) html = `<div class="page-section"><div class="empty-state"><div class="big">[~]</div><p>your library is empty<br>go to the admin panel to upload music</p></div></div>`;
    main.innerHTML = html;
    bindSongRows();
  }

  // ── SEARCH ─────────────────────────────────────────────────────────────────
  let searchTimeout;
  function renderSearch() {
    main.innerHTML = `<div class="page-section"><div class="search-bar"><input type="search" id="searchInput" placeholder="search songs, albums, artists..." autofocus /></div><div id="searchResults"></div></div>`;
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
    if (data.songs?.length)     html += `<div class="section-header"><span class="section-label">songs</span></div>${renderSongList(data.songs,'search')}`;
    if (data.albums?.length)    html += `<div class="section-header" style="margin-top:16px"><span class="section-label">albums</span></div><div class="card-scroll">${data.albums.map(renderAlbumCard).join('')}</div>`;
    if (data.artists?.length)   html += `<div class="section-header" style="margin-top:16px"><span class="section-label">artists</span></div><ul class="song-list">${data.artists.map(a=>`<li class="song-row" onclick="navigate('artist','${a.id}')"><div class="song-cover">[A]</div><div class="song-meta"><div class="song-title">${esc(a.name)}</div><div class="song-sub">${a.song_count||0} songs</div></div></li>`).join('')}</ul>`;
    if (data.playlists?.length) html += `<div class="section-header" style="margin-top:16px"><span class="section-label">playlists</span></div><ul class="song-list">${data.playlists.map(p=>`<li class="song-row" onclick="navigate('playlist','${p.id}')"><div class="song-cover">[=]</div><div class="song-meta"><div class="song-title">${esc(p.name)}</div></div></li>`).join('')}</ul>`;
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
      html += playlists.map(p=>`<div class="playlist-item" onclick="navigate('playlist','${p.id}')"><div class="playlist-cover">[=]</div><div class="song-meta"><div class="song-title">${esc(p.name)}</div><div class="song-sub">${p.description||'playlist'}</div></div></div>`).join('');
      html += '</div>';
    }
    if (data.songs?.length) {
      html += `<h3 style="margin-bottom:12px">saved songs</h3>${renderSongList(data.songs,'library')}`;
    } else {
      html += '<div class="empty-state"><div class="big">[=]</div><p>no saved songs yet</p></div>';
    }
    html += '</div>';
    main.innerHTML = html;
    bindSongRows();
  }

  window.showCreatePlaylist = async function () {
    const name = prompt('playlist name:'); if (!name) return;
    const desc = prompt('description (optional):') || '';
    await apiFetch('/api/playlists', 'POST', { name, description: desc });
    await loadPlaylists(); navigate('library');
  };

  // ── NOW PLAYING FULL PAGE ──────────────────────────────────────────────────
  function renderNowPlaying() {
    if (!currentSong) { navigate('home'); return; }
    const s = currentSong;
    const coverHtml = s.cover
      ? `<img src="/stream/cover/${s.cover}" class="np-full-cover" alt="cover">`
      : `<div class="np-full-cover np-full-cover--placeholder">&#9834;</div>`;

    main.innerHTML = `
      <div class="now-playing-page">
        <!-- top bar -->
        <div class="np-page-topbar">
          <button class="np-page-back icon-btn" onclick="history.back()">${ICONS.back}</button>
          <span class="np-page-label">now playing</span>
          <button class="icon-btn" id="npDots">${ICONS.dots}</button>
        </div>

        <!-- cover -->
        <div class="np-full-cover-wrap">${coverHtml}</div>

        <!-- info -->
        <div class="np-full-info">
          <div class="np-full-title">${esc(s.title)}</div>
          <div class="np-full-artist">${esc(s.artist_name||'unknown artist')}</div>
          ${s.is_audiobook ? '<span class="badge spoken-word">spoken word</span>' : ''}
        </div>

        <!-- seek -->
        <div class="np-full-seek">
          <span id="npFullCurrent">0:00</span>
          <input type="range" id="npFullSeek" min="0" max="100" value="0" class="seek-input">
          <span id="npFullDuration">0:00</span>
        </div>

        <!-- controls -->
        <div class="np-full-controls" id="npFullControls"></div>
      </div>`;

    // Sync seek bar with audio element
    function syncSeek() {
      const cur  = document.getElementById('npFullCurrent');
      const seekR = document.getElementById('npFullSeek');
      const dur  = document.getElementById('npFullDuration');
      if (cur)   cur.textContent = formatTime(Math.floor(audio.currentTime));
      if (seekR && audio.duration) seekR.value = (audio.currentTime / audio.duration) * 100;
      if (dur)   dur.textContent = formatTime(Math.floor(audio.duration || 0));
    }
    audio.addEventListener('timeupdate', syncSeek);
    const seekEl = document.getElementById('npFullSeek');
    if (seekEl) seekEl.addEventListener('input', () => { if (audio.duration) audio.currentTime = (seekEl.value/100)*audio.duration; });

    renderNowPlayingControls();

    // 3-dot menu
    document.getElementById('npDots')?.addEventListener('click', (e) => {
      e.stopPropagation();
      showSongSheet(s);
    });
  }

  // ── SONG ACTION SHEET (3-dot menu from now-playing and song rows) ──────────
  function showSongSheet(song) {
    let sheet = document.getElementById('songSheet');
    if (sheet) sheet.remove();
    sheet = document.createElement('div');
    sheet.id = 'songSheet';
    sheet.className = 'song-sheet';
    sheet.innerHTML = `
      <div class="song-sheet-backdrop"></div>
      <div class="song-sheet-inner">
        <div class="song-sheet-header">
          <div class="song-sheet-title">${esc(song.title)}</div>
          <div class="song-sheet-sub">${esc(song.artist_name||'')}</div>
        </div>
        <button class="sheet-item" id="si-playlist">${ICONS.list} <span>add to playlist</span></button>
        <button class="sheet-item" id="si-library">${ICONS.heart} <span>save to library</span></button>
        <button class="sheet-item" id="si-info">${ICONS.info} <span>song info</span></button>
        ${song.album_id  ? `<button class="sheet-item" id="si-album">${ICONS.album} <span>view album</span></button>` : ''}
        ${song.artist_id ? `<button class="sheet-item" id="si-artist">${ICONS.artist} <span>view artist</span></button>` : ''}
        ${['admin','creator'].includes(currentUser?.role) ? `<button class="sheet-item danger" id="si-edit">[edit] <span>edit song</span></button>` : ''}
        <button class="sheet-item muted" id="si-cancel">${ICONS.close} <span>cancel</span></button>
      </div>`;
    document.body.appendChild(sheet);

    const close = () => sheet.remove();
    sheet.querySelector('.song-sheet-backdrop').addEventListener('click', close);
    sheet.querySelector('#si-cancel').addEventListener('click', close);
    sheet.querySelector('#si-playlist')?.addEventListener('click', async () => { await addSongToPlaylist(song.id); close(); });
    sheet.querySelector('#si-library')?.addEventListener('click', async () => { await apiFetch('/api/library/song','POST',{songId:song.id}); close(); });
    sheet.querySelector('#si-info')?.addEventListener('click', () => { close(); navigate('song', song.id); });
    sheet.querySelector('#si-album')?.addEventListener('click', () => { close(); navigate('album', song.album_id); });
    sheet.querySelector('#si-artist')?.addEventListener('click', () => { close(); navigate('artist', song.artist_id); });
    sheet.querySelector('#si-edit')?.addEventListener('click', () => { close(); navigate('song', 'edit:'+song.id); });
  }

  async function addSongToPlaylist(songId) {
    if (!playlists.length) { alert('create a playlist first'); return; }
    const names = playlists.map((p,i)=>`${i+1}. ${p.name}`).join('\n');
    const idx   = parseInt(prompt(`choose playlist:\n${names}`)) - 1;
    if (idx >= 0 && playlists[idx]) await apiFetch(`/api/playlists/${playlists[idx].id}/songs`,'POST',{songId});
  }

  // ── ALBUM ──────────────────────────────────────────────────────────────────
  async function renderAlbum(albumId) {
    main.innerHTML = '<div class="page-section"><div class="spinner"></div></div>';
    const album = await apiFetch(`/api/albums/${albumId}`);
    const coverSrc = album.cover ? `/stream/cover/${album.cover}` : null;
    main.innerHTML = `
      <div class="artist-hero">
        ${coverSrc ? `<img src="${coverSrc}" style="width:100px;height:100px;border-radius:4px;object-fit:cover;margin-bottom:12px">` : '<div style="font-size:60px;margin-bottom:12px">[&#9834;]</div>'}
        <h1>${esc(album.title)}</h1>
        <p class="caption">${esc(album.artist_name||'unknown')} ${album.year ? '&middot; '+album.year : ''} ${album.is_audiobook?'<span class="badge spoken-word">spoken word</span>':''}</p>
        <div style="margin-top:16px;display:flex;gap:8px">
          <button class="btn-primary" onclick="_playAlbum()">${ICONS.play} play all</button>
          ${['admin','creator'].includes(currentUser?.role) ? `<button class="btn-secondary" onclick="navigate('song','edit:${album.id}')">edit</button>` : ''}
        </div>
      </div>
      <div class="page-section">
        <div class="section-header"><span class="section-label">[+] tracklist (${album.songs?.length||0})</span></div>
        ${renderSongList(album.songs||[], 'album_'+albumId)}
      </div>`;
    bindSongRows();
    window._playAlbum = () => { if (album.songs?.length) playQueue(album.songs, 0, album.is_audiobook); };
  }

  // ── ARTIST ─────────────────────────────────────────────────────────────────
  async function renderArtist(artistId) {
    main.innerHTML = '<div class="page-section"><div class="spinner"></div></div>';
    const artist = await apiFetch(`/api/artists/${artistId}`);
    let html = `<div class="artist-hero"><div style="font-size:60px;margin-bottom:12px">[A]</div><h1>${esc(artist.name)}</h1><p class="caption">${artist.albums?.length||0} albums &middot; ${artist.songs?.length||0} songs</p></div><div class="page-section">`;
    if (artist.albums?.length) html += `<div class="section-header"><span class="section-label">[+] albums</span></div><div class="card-scroll">${artist.albums.map(renderAlbumCard).join('')}</div>`;
    if (artist.songs?.length)  html += `<div class="section-header" style="margin-top:24px"><span class="section-label">[+] all songs</span></div>${renderSongList(artist.songs,'artist')}`;
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
        <div style="font-size:60px;margin-bottom:12px">[=]</div>
        <h1>${esc(playlist.name)}</h1>
        <p class="caption">${playlist.songs?.length||0} songs</p>
        <div style="margin-top:16px;display:flex;gap:8px">
          <button class="btn-primary" onclick="_playPlaylist()">${ICONS.play} play</button>
          <button class="btn-danger" onclick="_deletePlaylist('${playlistId}')">[x] delete</button>
        </div>
      </div>
      <div class="page-section">${renderSongList(playlist.songs||[],'pl_'+playlistId)}</div>`;
    bindSongRows();
    window._playPlaylist = () => { if (playlist.songs?.length) playQueue(playlist.songs, 0, false); };
    window._deletePlaylist = async (id) => {
      if (!confirm('delete playlist?')) return;
      await apiFetch(`/api/playlists/${id}`,'DELETE'); await loadPlaylists(); navigate('library');
    };
  }

  // ── SONG INFO ──────────────────────────────────────────────────────────────
  async function renderSong(songParam) {
    if (songParam?.startsWith('edit:')) { renderSongEdit(songParam.slice(5)); return; }
    const song = await apiFetch(`/api/songs/${songParam}`);
    const coverSrc = song.cover ? `/stream/cover/${song.cover}` : null;
    main.innerHTML = `
      <div class="artist-hero">
        ${coverSrc ? `<img src="${coverSrc}" style="width:120px;height:120px;border-radius:4px;object-fit:cover;margin-bottom:12px">` : '<div style="font-size:64px;margin-bottom:12px">&#9834;</div>'}
        <h1>${esc(song.title)}</h1>
        <p class="caption">
          ${song.artist_name ? `<a href="#" onclick="navigate('artist','${song.artist_id}');return false">${esc(song.artist_name)}</a>` : 'unknown artist'}
          ${song.album_title ? ` &middot; <a href="#" onclick="navigate('album','${song.album_id}');return false">${esc(song.album_title)}</a>` : ''}
          ${song.is_audiobook ? '<span class="badge spoken-word">spoken word</span>' : ''}
        </p>
        <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-primary" onclick="playSong(_songData)">${ICONS.play} play</button>
          <button class="btn-secondary" onclick="apiFetch('/api/library/song','POST',{songId:'${song.id}'})">save to library</button>
          ${['admin','creator'].includes(currentUser?.role) ? `<button class="btn-secondary" onclick="navigate('song','edit:${song.id}')">edit</button>` : ''}
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
    if (!value) return '';
    return `<tr><td style="padding:8px 0;color:var(--mute);width:120px">${label}</td><td style="padding:8px 0">${value}</td></tr>`;
  }

  // ── SONG EDIT ──────────────────────────────────────────────────────────────
  async function renderSongEdit(id) {
    if (!['admin','creator'].includes(currentUser?.role)) { navigate('home'); return; }
    const song = await apiFetch(`/api/songs/${id}`);
    main.innerHTML = `
      <div class="page-section">
        <div class="section-header"><span class="section-label">[+] edit song</span></div>
        <form id="editSongForm">
          <div class="form-row"><label>title</label><input name="title" value="${esc(song.title)}" /></div>
          <div class="form-row"><label>genre</label><input name="genre" value="${esc(song.genre||'')}" /></div>
          <div class="form-row"><label>year</label><input name="year" type="number" value="${song.year||''}" /></div>
          <div class="form-row"><label>track #</label><input name="track_number" type="number" value="${song.track_number||''}" /></div>
          <div class="checkbox-row"><input type="checkbox" name="is_audiobook" id="isAb" ${song.is_audiobook?'checked':''}><label for="isAb">spoken word / audiobook</label></div>
          <div id="editErr" class="error-msg" style="display:none"></div>
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
      const res = await fetch(`/admin/songs/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(fd) });
      if (res.ok) navigate('song', id);
      else { document.getElementById('editErr').textContent='save failed'; document.getElementById('editErr').style.display='block'; }
    });
  }

  // ── ADMIN ──────────────────────────────────────────────────────────────────
  function renderAdmin() {
    if (!['admin','creator'].includes(currentUser?.role)) { navigate('home'); return; }
    main.innerHTML = `
      <div class="admin-grid">
        <div class="admin-sidebar">
          <button class="admin-sidebar-item active" onclick="adminTab(this,'upload')">[+] upload</button>
          <button class="admin-sidebar-item" onclick="adminTab(this,'songs')">[=] songs</button>
          <button class="admin-sidebar-item" onclick="adminTab(this,'albums')">&#9834; albums</button>
          ${currentUser.role==='admin'?`<button class="admin-sidebar-item" onclick="adminTab(this,'users')">[u] users</button>`:''}
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
    if      (tab==='upload') renderAdminUpload(m);
    else if (tab==='songs')  renderAdminSongs(m);
    else if (tab==='albums') renderAdminAlbums(m);
    else if (tab==='users')  renderAdminUsers(m);
    else if (tab==='stats')  renderAdminStats(m);
  };

  function renderAdminUpload(container) {
    container.innerHTML = `
      <h2 style="margin-bottom:24px">[+] upload music</h2>
      <form id="uploadForm" enctype="multipart/form-data">
        <div class="upload-zone" id="uploadZone">
          <input type="file" id="fileInput" name="files" multiple accept=".mp3,.m4a,.aac,.alac,.mp4,.flac,.ogg,.wav,.opus" style="display:none">
          <div class="upload-label">[+] click or drag files here</div>
          <div class="upload-sub">mp3 &bull; aac &bull; alac (m4a) &bull; flac &bull; ogg &bull; wav</div>
          <button type="button" class="btn-secondary" style="margin-top:12px" onclick="document.getElementById('fileInput').click()">choose files</button>
        </div>
        <div id="fileList" style="margin-bottom:16px"></div>
        <div class="form-section">
          <div class="section-label" style="margin-bottom:12px">[+] metadata override (optional)</div>
          <div class="form-row"><label>artist</label><input name="artist" placeholder="auto from tags" /></div>
          <div class="form-row"><label>album title</label><input name="album" placeholder="auto from tags" /></div>
          <div class="for