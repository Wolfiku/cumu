/**
 * Cumu Mobile App — Login-loop fix v4
 *
 * Root cause of the loop: Capacitor WebView does not reliably send session
 * cookies for cross-origin requests, so every API call after login returned
 * 401 which triggered a logout.
 *
 * Solution: store username + password in Preferences and re-login silently
 * on every cold start. This creates a fresh, valid session each time and
 * requires zero cookie/header tricks on the server.
 */
import { Preferences } from '@capacitor/preferences';
import { Network }     from '@capacitor/network';

// ══ State ════════════════════════════════════════════════════════════════════
let serverUrl    = '';
let loggedIn     = false;
let songs        = [];
let playlist     = [];
let playIndex    = 0;
let currentSong  = null;
let isPlaying    = false;
let offlineSongs = {};
let currentPlaylistId   = null;
let currentPlaylistName = '';

// ══ DOM ══════════════════════════════════════════════════════════════════════
const $     = id => document.getElementById(id);
const audio = $('audio');

const sSetup = $('screen-setup');
const sMain  = $('screen-main');
const inpUrl   = $('inp-url');
const inpUser  = $('inp-user');
const inpPass  = $('inp-pass');
const btnConn  = $('btn-connect');
const setupErr = $('setup-error');
const navTabs  = document.querySelectorAll('.nav-tab');

const listRecent  = $('list-recent');
const listMost    = $('list-most');
const listNew     = $('list-new');
const listSongs   = $('list-all-songs');
const listAlbums  = $('list-albums');
const listArtists = $('list-artists');
const listPls     = $('list-playlists');
const listPlSongs = $('list-playlist-songs');
const listOffline = $('list-offline');
const searchRes   = $('search-results');

const npBar    = $('npBar');
const npCover  = $('npCover');
const npTitle  = $('npTitle');
const npArtist = $('npArtist');
const npPlay   = $('np-play');
const npPrev   = $('np-prev');
const npNext   = $('np-next');
const npSeek   = $('np-seek');
const npCur    = $('np-cur');
const npDur    = $('np-dur');

// ══ Helpers ══════════════════════════════════════════════════════════════════
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmt(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2,'0')}`;
}
function toast(msg) {
  let el = document.querySelector('.cumu-toast');
  if (!el) { el = document.createElement('div'); el.className = 'cumu-toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 2400);
}

// api() — always sends credentials (cookies)
function api(path, opts = {}) {
  return fetch(`${serverUrl}${path}`, {
    ...opts,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
}

function coverUrl(song) {
  if (!song?.cover) return null;
  return `${serverUrl}/stream/cover/${encodeURIComponent(song.cover)}`;
}

// ══ Core login function (used by button AND auto-relogin) ═════════════════════
async function doLogin(url, username, password) {
  const r = await fetch(`${url}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || 'Login fehlgeschlagen.');
  }
  return r.json();
}

// ══ Init ═════════════════════════════════════════════════════════════════════
async function init() {
  await loadOfflineMeta();

  const [savedUrl, savedUser, savedPass] = await Promise.all([
    Preferences.get({ key: 'cumu_server' }),
    Preferences.get({ key: 'cumu_user'   }),
    Preferences.get({ key: 'cumu_pass'   }),
  ]);

  if (savedUrl.value && savedUser.value && savedPass.value) {
    serverUrl = savedUrl.value;
    try {
      // Re-login silently — creates a fresh valid session every cold start
      await doLogin(savedUrl.value, savedUser.value, savedPass.value);
      loggedIn = true;
      showMain();
      loadHome();
      return;
    } catch (_) {
      // Wrong password or server unreachable — show login
      await clearCreds();
    }
  }

  showSetup();
}

async function clearCreds() {
  serverUrl = '';
  await Promise.all([
    Preferences.remove({ key: 'cumu_server' }),
    Preferences.remove({ key: 'cumu_user'   }),
    Preferences.remove({ key: 'cumu_pass'   }),
  ]);
}

function showSetup() {
  sSetup.classList.add('active');
  sMain.classList.remove('active');
}
function showMain() {
  sSetup.classList.remove('active');
  sMain.classList.add('active');
}

// ══ Login button ════════════════════════════════════════════════════════════════
btnConn.addEventListener('click', async () => {
  const url  = inpUrl.value.trim().replace(/\/$/, '');
  const user = inpUser.value.trim();
  const pass = inpPass.value;

  if (!url || !user || !pass) { showErr('Bitte alle Felder ausfüllen.'); return; }

  btnConn.disabled    = true;
  btnConn.textContent = 'Verbinde…';
  setupErr.style.display = 'none';

  try {
    serverUrl = url;
    await doLogin(url, user, pass);

    // Persist credentials for auto-relogin
    await Promise.all([
      Preferences.set({ key: 'cumu_server', value: url  }),
      Preferences.set({ key: 'cumu_user',   value: user }),
      Preferences.set({ key: 'cumu_pass',   value: pass }),
    ]);

    loggedIn = true;
    showMain();
    loadHome();
  } catch (e) {
    serverUrl = '';
    showErr(e.message || 'Verbindungsfehler.');
  } finally {
    btnConn.disabled    = false;
    btnConn.textContent = 'Verbinden';
  }
});

function showErr(msg) {
  setupErr.textContent   = msg;
  setupErr.style.display = 'block';
}

// ══ Logout ═══════════════════════════════════════════════════════════════════
$('btn-logout').addEventListener('click', async () => {
  try { await api('/auth/logout', { method: 'POST' }); } catch (_) {}
  await clearCreds();
  loggedIn = false;
  songs    = [];
  showSetup();
});

// ══ Navigation ═══════════════════════════════════════════════════════════════
const views = ['home','library','playlists','offline'];

navTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    navTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const view = tab.dataset.view;
    views.forEach(v => {
      const el = $(`view-${v}`);
      if (el) el.style.display = v === view ? '' : 'none';
    });
    $('view-playlist-detail').style.display = 'none';
    $('search-overlay').style.display = 'none';
    if (view === 'library')   loadLibrary();
    if (view === 'playlists') loadPlaylists();
    if (view === 'offline')   renderOffline();
  });
});

$('btn-search-open').addEventListener('click', () => {
  const ov = $('search-overlay');
  const show = ov.style.display === 'none' || !ov.style.display;
  ov.style.display = show ? '' : 'none';
  if (show) $('search-input').focus();
});

let searchTimer;
$('search-input').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => doSearch($('search-input').value), 350);
});

async function doSearch(q) {
  if (!q.trim()) { searchRes.innerHTML = ''; return; }
  try {
    const r = await api(`/api/search?q=${encodeURIComponent(q)}`);
    if (!r.ok) return;
    const data = await r.json();
    let html = '';
    if (data.songs?.length) {
      html += `<div style="font-size:13px;font-weight:700;color:var(--mute);padding:8px 4px 4px">Songs</div>`;
      html += renderSongRowsHtml(data.songs);
    }
    if (data.albums?.length) {
      html += `<div style="font-size:13px;font-weight:700;color:var(--mute);padding:8px 4px 4px">Alben</div>`;
      html += data.albums.map(a => `
        <div class="song-row">
          <div class="song-cover">${a.cover ? `<img src="${esc(coverUrl(a))}" />` : '💿'}</div>
          <div class="song-meta">
            <div class="song-title">${esc(a.title)}</div>
            <div class="song-sub">${esc(a.artist_name || '')}</div>
          </div>
        </div>`).join('');
    }
    searchRes.innerHTML = html || '<div class="empty-state">Keine Ergebnisse.</div>';
    bindSongRows(searchRes, data.songs || []);
  } catch(e) { console.error(e); }
}

// ══ Home ═════════════════════════════════════════════════════════════════════
async function loadHome() {
  try {
    const r = await api('/api/home');
    if (!r.ok) return;
    const d = await r.json();
    renderSongList(d.recentlyPlayed || [], listRecent);
    renderSongList(d.mostPlayed    || [], listMost);
    renderSongList(d.newSongs      || [], listNew);
    songs = [...new Map(
      [...(d.recentlyPlayed||[]),...(d.mostPlayed||[]),...(d.newSongs||[])].map(s=>[s.id,s])
    ).values()];
  } catch (e) { console.error(e); }
}

// ══ Library ══════════════════════════════════════════════════════════════════
async function loadLibrary() {
  try {
    const [sRes, alRes, arRes] = await Promise.all([
      api('/api/songs'),
      api('/api/albums'),
      api('/api/artists'),
    ]);
    if (!sRes.ok || !alRes.ok || !arRes.ok) return;
    const [sList, alList, arList] = await Promise.all([sRes.json(), alRes.json(), arRes.json()]);
    songs = sList;
    renderSongList(sList, listSongs);
    renderAlbums(alList, listAlbums);
    renderArtists(arList, listArtists);
  } catch (e) { console.error(e); }
}

// ══ Playlists ════════════════════════════════════════════════════════════════
async function loadPlaylists() {
  try {
    const r = await api('/api/playlists');
    if (!r.ok) return;
    const list = await r.json();
    if (!list.length) {
      listPls.innerHTML = '<li class="empty-state"><div class="big">📋</div>Noch keine Playlists.</li>';
      return;
    }
    listPls.innerHTML = list.map(p => `
      <li class="playlist-item" data-pl-id="${esc(p.id)}" data-pl-name="${esc(p.name)}">
        <div class="playlist-cover">🎵</div>
        <div class="song-meta">
          <div class="song-title">${esc(p.name)}</div>
          <div class="song-sub">${esc(p.description || '')}</div>
        </div>
      </li>`).join('');
    listPls.querySelectorAll('.playlist-item').forEach(el => {
      el.addEventListener('click', () => openPlaylist(el.dataset.plId, el.dataset.plName));
    });
  } catch (e) { console.error(e); }
}

async function openPlaylist(id, name) {
  currentPlaylistId   = id;
  currentPlaylistName = name;
  $('playlist-detail-name').textContent = name;
  views.forEach(v => { const el = $(`view-${v}`); if (el) el.style.display = 'none'; });
  $('view-playlist-detail').style.display = '';
  try {
    const r = await api(`/api/playlists/${id}`);
    if (!r.ok) return;
    const pl = await r.json();
    renderSongList(pl.songs || [], listPlSongs);
  } catch (e) { console.error(e); }
}

$('btn-back-playlists').addEventListener('click', () => {
  $('view-playlist-detail').style.display = 'none';
  $('view-playlists').style.display = '';
  navTabs.forEach(t => t.classList.toggle('active', t.dataset.view === 'playlists'));
});
$('btn-new-playlist').addEventListener('click', async () => {
  const name = prompt('Playlist-Name:');
  if (!name?.trim()) return;
  try {
    const r = await api('/api/playlists', { method:'POST', body: JSON.stringify({ name }) });
    if (!r.ok) return;
    toast('Playlist erstellt');
    loadPlaylists();
  } catch (e) { console.error(e); }
});
$('btn-delete-playlist').addEventListener('click', async () => {
  if (!confirm(`Playlist "${currentPlaylistName}" löschen?`)) return;
  try {
    await api(`/api/playlists/${currentPlaylistId}`, { method: 'DELETE' });
    toast('Playlist gelöscht');
    $('view-playlist-detail').style.display = 'none';
    $('view-playlists').style.display = '';
    navTabs.forEach(t => t.classList.toggle('active', t.dataset.view === 'playlists'));
    loadPlaylists();
  } catch (e) { console.error(e); }
});

// ══ Render ════════════════════════════════════════════════════════════════════
function renderSongRowsHtml(list) {
  return list.map((s, i) => {
    const dl = offlineSongs[s.id];
    const cv = coverUrl(s);
    return `
    <li class="song-row" data-idx="${i}">
      <div class="song-cover">${cv ? `<img src="${esc(cv)}" loading="lazy" />` : '♪'}</div>
      <div class="song-meta">
        <div class="song-title">${esc(s.title || s.filename || 'Unbekannt')}</div>
        <div class="song-sub">${esc(s.artist_name||'')}${s.artist_name&&s.album_title?' · ':''}${esc(s.album_title||'')}</div>
      </div>
      ${s.duration ? `<span class="song-duration">${fmt(s.duration)}</span>` : ''}
      <button class="dl-btn ${dl?'done':''}" data-id="${esc(s.id)}">${dl?'✓':'↓'}</button>
    </li>`;
  }).join('');
}
function renderSongList(list, container) {
  if (!list.length) { container.innerHTML = '<li class="empty-state">Keine Lieder.</li>'; return; }
  container.innerHTML = renderSongRowsHtml(list);
  bindSongRows(container, list);
}
function bindSongRows(container, list) {
  container.querySelectorAll('.song-row[data-idx]').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.classList.contains('dl-btn')) return;
      playSong(parseInt(row.dataset.idx), list);
    });
  });
  container.querySelectorAll('.dl-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (offlineSongs[id]) return;
      const song = list.find(s => s.id == id);
      btn.textContent = '⏳';
      await downloadSong(song, btn);
    });
  });
}
function renderAlbums(list, container) {
  if (!list.length) { container.innerHTML = '<span class="empty-state" style="padding:16px">Keine Alben.</span>'; return; }
  container.innerHTML = list.map(a => {
    const cv = a.cover ? `${serverUrl}/stream/cover/${encodeURIComponent(a.cover)}` : null;
    return `<div class="album-card">
      <div class="album-cover">${cv ? `<img src="${esc(cv)}" loading="lazy" />` : '💿'}</div>
      <div class="album-card-title">${esc(a.title)}</div>
      <div class="album-card-sub">${esc(a.artist_name||'')}</div>
    </div>`;
  }).join('');
}
function renderArtists(list, container) {
  if (!list.length) { container.innerHTML = '<li class="empty-state">Keine Künstler.</li>'; return; }
  container.innerHTML = list.map(a => `
    <li class="song-row">
      <div class="song-cover" style="font-size:22px">🎤</div>
      <div class="song-meta">
        <div class="song-title">${esc(a.name)}</div>
        <div class="song-sub">${a.song_count||0} Songs · ${a.album_count||0} Alben</div>
      </div>
    </li>`).join('');
}

// ══ Offline ══════════════════════════════════════════════════════════════════
async function loadOfflineMeta() {
  const saved = await Preferences.get({ key: 'cumu_offline' });
  offlineSongs = saved.value ? JSON.parse(saved.value) : {};
}
async function saveOfflineMeta() {
  await Preferences.set({ key: 'cumu_offline', value: JSON.stringify(offlineSongs) });
}
async function downloadSong(song, btn) {
  try {
    const net = await Network.getStatus();
    if (!net.connected) { toast('Kein Internet'); btn.textContent = '↓'; return; }
    const r = await api(`/stream/${song.id}`);
    if (!r.ok) throw new Error('Fehler');
    const blob = await r.blob();
    const reader = new FileReader();
    reader.onload = async ev => {
      offlineSongs[song.id] = { ...song, dataUrl: ev.target.result };
      await saveOfflineMeta();
      btn.textContent = '✓'; btn.classList.add('done');
      toast(`"${song.title || song.filename}" gespeichert`);
      renderOffline();
    };
    reader.readAsDataURL(blob);
  } catch (e) { btn.textContent = '!'; toast('Download fehlgeschlagen'); console.error(e); }
}
function renderOffline() {
  const list = Object.values(offlineSongs);
  if (!list.length) {
    listOffline.innerHTML = '<li class="empty-state"><div class="big">📥</div>Noch keine Lieder heruntergeladen.<br/>Tippe auf ↓ um ein Lied zu speichern.</li>';
    return;
  }
  listOffline.innerHTML = list.map((s,i) => `
    <li class="song-row" data-off-idx="${i}">
      <div class="song-cover">♪</div>
      <div class="song-meta">
        <div class="song-title">${esc(s.title || s.filename || 'Unbekannt')}</div>
        <div class="song-sub">${esc(s.artist_name||'')}</div>
      </div>
      <button class="dl-btn" style="border-color:var(--danger);color:var(--danger)" data-del-id="${esc(s.id)}">✕</button>
    </li>`).join('');
  listOffline.querySelectorAll('.song-row[data-off-idx]').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.dataset.delId) return;
      playSong(parseInt(row.dataset.offIdx), list);
    });
  });
  listOffline.querySelectorAll('[data-del-id]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      delete offlineSongs[btn.dataset.delId];
      await saveOfflineMeta();
      renderOffline();
    });
  });
}

// ══ Playback ═════════════════════════════════════════════════════════════════
function playSong(index, list) {
  playlist  = list;
  playIndex = index;
  const song = playlist[playIndex];
  if (!song) return;
  currentSong = song;
  api(`/api/songs/${song.id}/play`, { method: 'POST' }).catch(() => {});
  if (offlineSongs[song.id]) {
    audio.src = offlineSongs[song.id].dataUrl;
    audio.play(); isPlaying = true; updateNpBar();
  } else {
    audio.src = ''; updateNpBar();
    api(`/stream/${song.id}`)
      .then(r => r.ok ? r.blob() : Promise.reject())
      .then(blob => { audio.src = URL.createObjectURL(blob); audio.play(); })
      .catch(() => toast('Stream nicht verfügbar'));
  }
}
npPlay.addEventListener('click', () => {
  if (!currentSong) return;
  if (isPlaying) { audio.pause(); isPlaying = false; npPlay.textContent = '▶'; }
  else           { audio.play();  isPlaying = true;  npPlay.textContent = '⏸'; }
});
npPrev.addEventListener('click', () => { if (playIndex > 0) playSong(playIndex-1, playlist); });
npNext.addEventListener('click', () => { if (playIndex < playlist.length-1) playSong(playIndex+1, playlist); });
audio.addEventListener('play',  () => { isPlaying = true;  npPlay.textContent = '⏸'; });
audio.addEventListener('pause', () => { isPlaying = false; npPlay.textContent = '▶'; });
audio.addEventListener('ended', () => {
  if (playIndex < playlist.length-1) playSong(playIndex+1, playlist);
  else isPlaying = false;
});
audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  npSeek.value = pct;
  npCur.textContent = fmt(audio.currentTime);
  npDur.textContent = fmt(audio.duration);
  // Drive the visual progress fill
  const fill = document.getElementById('np-progress-fill');
  if (fill) fill.style.width = pct + '%';
});
npSeek.addEventListener('input', () => {
  if (audio.duration) audio.currentTime = (npSeek.value / 100) * audio.duration;
});
function updateNpBar() {
  if (!currentSong) return;
  npBar.style.display = '';
  npTitle.textContent  = currentSong.title || currentSong.filename || 'Unbekannt';
  npArtist.textContent = currentSong.artist_name || '';
  npPlay.textContent   = '⏸';
  const cv = coverUrl(currentSong);
  npCover.innerHTML = cv
    ? `<img src="${esc(cv)}" />`
    : '<span class="np-cover-fallback">♪</span>';
}

// ══ Start ════════════════════════════════════════════════════════════════════
init();
