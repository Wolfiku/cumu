import { Preferences } from '@capacitor/preferences';
import { Network } from '@capacitor/network';

// ===== State =====
let serverUrl = '';
let songs = [];
let offlineSongs = {};
let currentSong = null;
let isPlaying = false;
let playlist = [];
let playIndex = 0;

const audio = document.getElementById('audio-player');

// ===== DOM =====
const screenSetup = document.getElementById('screen-setup');
const screenMain  = document.getElementById('screen-main');
const inputUrl    = document.getElementById('server-url');
const inputUser   = document.getElementById('username');
const inputPass   = document.getElementById('password');
const btnConnect  = document.getElementById('btn-connect');
const setupError  = document.getElementById('setup-error');
const btnLogout   = document.getElementById('btn-logout');
const songListEl  = document.getElementById('song-list');
const offlineListEl = document.getElementById('offline-list');
const searchInput = document.getElementById('search-input');
const playerBar   = document.getElementById('player-bar');
const playerTitle = document.getElementById('player-title');
const playerArtist = document.getElementById('player-artist');
const btnPlay     = document.getElementById('btn-play');
const btnPrev     = document.getElementById('btn-prev');
const btnNext     = document.getElementById('btn-next');
const progressFill = document.getElementById('progress-fill');

// ===== Helper: fetch with session cookie =====
function apiFetch(path, options = {}) {
  return fetch(`${serverUrl}${path}`, {
    ...options,
    credentials: 'include', // sends session cookie with every request
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
}

// ===== Init =====
async function init() {
  const saved = await Preferences.get({ key: 'cumu_server' });
  if (saved.value) {
    serverUrl = saved.value;
    // verify session is still valid
    try {
      const res = await apiFetch('/auth/me');
      if (res.ok) {
        showMain();
        loadSongs();
        return;
      }
    } catch (_) {}
  }
  showSetup();
  loadOfflineMeta();
}

function showSetup() {
  screenSetup.classList.add('active');
  screenMain.classList.remove('active');
}

function showMain() {
  screenSetup.classList.remove('active');
  screenMain.classList.add('active');
  loadOfflineMeta();
}

// ===== Setup / Login =====
btnConnect.addEventListener('click', async () => {
  const url  = inputUrl.value.trim().replace(/\/$/, '');
  const user = inputUser.value.trim();
  const pass = inputPass.value;

  if (!url || !user || !pass) { showError('Bitte alle Felder ausfüllen.'); return; }

  btnConnect.disabled = true;
  btnConnect.textContent = 'Verbinde…';
  setupError.classList.add('hidden');
  serverUrl = url;

  try {
    const res = await fetch(`${url}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Login fehlgeschlagen.');
    }

    await Preferences.set({ key: 'cumu_server', value: url });
    showMain();
    loadSongs();
  } catch (e) {
    serverUrl = '';
    showError(e.message || 'Verbindung fehlgeschlagen.');
  } finally {
    btnConnect.disabled = false;
    btnConnect.textContent = 'Verbinden';
  }
});

function showError(msg) {
  setupError.textContent = msg;
  setupError.classList.remove('hidden');
}

// ===== Logout =====
btnLogout.addEventListener('click', async () => {
  try { await apiFetch('/auth/logout', { method: 'POST' }); } catch (_) {}
  await Preferences.remove({ key: 'cumu_server' });
  serverUrl = '';
  songs = [];
  showSetup();
});

// ===== Load Songs =====
async function loadSongs(query = '') {
  songListEl.innerHTML = '<div class="loading-spinner">Laden…</div>';
  try {
    const net = await Network.getStatus();
    if (!net.connected) {
      songListEl.innerHTML = '<p class="empty-hint">Kein Internet – wechsle zum Offline-Tab.</p>';
      return;
    }
    const qs = query ? `?search=${encodeURIComponent(query)}` : '';
    const res = await apiFetch(`/api/songs${qs}`);
    if (res.status === 401) { showSetup(); return; }
    if (!res.ok) throw new Error('Fehler beim Laden der Songs.');
    const data = await res.json();
    songs = data.songs || data || [];
    playlist = songs;
    renderSongList(songs, songListEl, true);
  } catch (e) {
    songListEl.innerHTML = `<p class="empty-hint">${escHtml(e.message)}</p>`;
  }
}

function renderSongList(list, container, showDownload = false) {
  if (!list.length) {
    container.innerHTML = '<p class="empty-hint">Keine Lieder gefunden.</p>';
    return;
  }
  container.innerHTML = list.map((s, i) => {
    const dl = offlineSongs[s.id];
    return `
      <div class="song-item" data-index="${i}" data-id="${s.id}">
        <div class="song-thumb">♫</div>
        <div class="song-info">
          <div class="song-title">${escHtml(s.title || s.filename || 'Unbekannt')}</div>
          <div class="song-meta">${escHtml(s.artist || '')}${s.artist && s.album ? ' · ' : ''}${escHtml(s.album || '')}</div>
        </div>
        <div class="song-actions">
          ${showDownload ? `<button class="btn-download ${dl ? 'downloaded' : ''}" data-id="${s.id}">${dl ? '✓' : '↓'}</button>` : ''}
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('.song-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.classList.contains('btn-download')) return;
      playSong(parseInt(el.dataset.index), list);
    });
  });

  container.querySelectorAll('.btn-download').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (offlineSongs[id]) return;
      btn.textContent = '⏳';
      await downloadSong(id, btn);
    });
  });
}

// ===== Playback =====
function playSong(index, list) {
  playlist  = list;
  playIndex = index;
  const song = playlist[playIndex];
  if (!song) return;
  currentSong = song;

  if (offlineSongs[song.id]) {
    audio.src = offlineSongs[song.id].dataUrl;
  } else {
    // stream route with session cookie — credentials:include on the audio element
    // We use a one-time blob URL fetched with credentials
    streamWithCreds(song.id);
    return;
  }
  audio.play();
  isPlaying = true;
  updatePlayerBar();
}

async function streamWithCreds(id) {
  try {
    const res = await apiFetch(`/stream/${id}`);
    if (!res.ok) throw new Error('Stream nicht verfügbar');
    const blob = await res.blob();
    audio.src = URL.createObjectURL(blob);
    audio.play();
    isPlaying = true;
    updatePlayerBar();
  } catch (e) {
    console.error('Stream error:', e);
  }
}

btnPlay.addEventListener('click', () => {
  if (!currentSong) return;
  if (isPlaying) { audio.pause(); isPlaying = false; btnPlay.textContent = '▶'; }
  else           { audio.play();  isPlaying = true;  btnPlay.textContent = '⏸'; }
});

btnPrev.addEventListener('click', () => { if (playIndex > 0) playSong(playIndex - 1, playlist); });
btnNext.addEventListener('click', () => { if (playIndex < playlist.length - 1) playSong(playIndex + 1, playlist); });

audio.addEventListener('ended', () => {
  if (playIndex < playlist.length - 1) playSong(playIndex + 1, playlist);
  else isPlaying = false;
});

audio.addEventListener('timeupdate', () => {
  if (audio.duration) progressFill.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
});

function updatePlayerBar() {
  if (!currentSong) return;
  playerBar.classList.remove('hidden');
  playerTitle.textContent  = currentSong.title  || currentSong.filename || 'Unbekannt';
  playerArtist.textContent = currentSong.artist || '';
  btnPlay.textContent = '⏸';
}

// ===== Download / Offline =====
async function loadOfflineMeta() {
  const saved = await Preferences.get({ key: 'cumu_offline_meta' });
  offlineSongs = saved.value ? JSON.parse(saved.value) : {};
  renderOfflineList();
}

async function downloadSong(id, btn) {
  try {
    const res = await apiFetch(`/stream/${id}`);
    if (!res.ok) throw new Error('Download fehlgeschlagen');
    const blob   = await res.blob();
    const reader = new FileReader();
    reader.onload = async e => {
      const song = songs.find(s => s.id == id) || { id };
      offlineSongs[id] = { ...song, dataUrl: e.target.result };
      await Preferences.set({ key: 'cumu_offline_meta', value: JSON.stringify(offlineSongs) });
      btn.textContent = '✓';
      btn.classList.add('downloaded');
      renderOfflineList();
    };
    reader.readAsDataURL(blob);
  } catch (e) {
    btn.textContent = '!';
    console.error(e);
  }
}

function renderOfflineList() {
  const list = Object.values(offlineSongs);
  if (!list.length) {
    offlineListEl.innerHTML = '<p class="empty-hint">Noch keine Lieder heruntergeladen.<br/>Tippe auf ↓ um ein Lied zu speichern.</p>';
    return;
  }
  renderSongList(list, offlineListEl, false);
}

// ===== Search =====
let searchDebounce;
searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => loadSongs(searchInput.value), 400);
});

// ===== Tabs =====
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

// ===== Helpers =====
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== Start =====
init();
