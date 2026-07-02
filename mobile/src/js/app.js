import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Network } from '@capacitor/network';

// ===== State =====
let serverUrl = '';
let authToken = '';
let songs = [];
let offlineSongs = {};
let currentSong = null;
let isPlaying = false;
let playlist = [];
let playIndex = 0;

const audio = document.getElementById('audio-player');

// ===== DOM =====
const screenSetup = document.getElementById('screen-setup');
const screenMain = document.getElementById('screen-main');
const inputUrl = document.getElementById('server-url');
const inputUser = document.getElementById('username');
const inputPass = document.getElementById('password');
const btnConnect = document.getElementById('btn-connect');
const setupError = document.getElementById('setup-error');
const btnLogout = document.getElementById('btn-logout');
const songListEl = document.getElementById('song-list');
const offlineListEl = document.getElementById('offline-list');
const searchInput = document.getElementById('search-input');
const playerBar = document.getElementById('player-bar');
const playerTitle = document.getElementById('player-title');
const playerArtist = document.getElementById('player-artist');
const btnPlay = document.getElementById('btn-play');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const progressFill = document.getElementById('progress-fill');

// ===== Init =====
async function init() {
  const saved = await Preferences.get({ key: 'cumu_config' });
  if (saved.value) {
    const config = JSON.parse(saved.value);
    serverUrl = config.serverUrl;
    authToken = config.authToken;
    showMain();
    loadSongs();
  } else {
    showSetup();
  }
  loadOfflineMeta();
}

function showSetup() {
  screenSetup.classList.add('active');
  screenMain.classList.remove('active');
}

function showMain() {
  screenSetup.classList.remove('active');
  screenMain.classList.add('active');
}

// ===== Setup / Login =====
btnConnect.addEventListener('click', async () => {
  const url = inputUrl.value.trim().replace(/\/$/, '');
  const user = inputUser.value.trim();
  const pass = inputPass.value;

  if (!url || !user || !pass) {
    showError('Bitte alle Felder ausfüllen.');
    return;
  }

  btnConnect.disabled = true;
  btnConnect.textContent = 'Verbinde…';
  setupError.classList.add('hidden');

  try {
    const res = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass }),
      credentials: 'include'
    });

    if (!res.ok) throw new Error('Login fehlgeschlagen. Zugangsdaten prüfen.');

    const data = await res.json();
    authToken = data.token || '';
    serverUrl = url;

    await Preferences.set({
      key: 'cumu_config',
      value: JSON.stringify({ serverUrl, authToken })
    });

    showMain();
    loadSongs();
  } catch (e) {
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
  await Preferences.remove({ key: 'cumu_config' });
  serverUrl = '';
  authToken = '';
  songs = [];
  showSetup();
});

// ===== Load Songs =====
async function loadSongs(query = '') {
  songListEl.innerHTML = '<div class="loading-spinner">Laden…</div>';
  try {
    const net = await Network.getStatus();
    if (!net.connected) {
      songListEl.innerHTML = '<p class="empty-hint">Kein Internet – zeige Offline-Lieder.</p>';
      return;
    }

    const endpoint = query
      ? `${serverUrl}/api/songs?search=${encodeURIComponent(query)}`
      : `${serverUrl}/api/songs`;

    const headers = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    const res = await fetch(endpoint, { headers, credentials: 'include' });
    if (!res.ok) throw new Error('Fehler beim Laden.');
    const data = await res.json();
    songs = data.songs || data || [];
    playlist = songs;
    renderSongList(songs, songListEl, true);
  } catch (e) {
    songListEl.innerHTML = `<p class="empty-hint">${e.message}</p>`;
  }
}

function renderSongList(list, container, showDownload = false) {
  if (!list.length) {
    container.innerHTML = '<p class="empty-hint">Keine Lieder gefunden.</p>';
    return;
  }
  container.innerHTML = list.map((s, i) => {
    const isDownloaded = !!offlineSongs[s.id];
    return `
      <div class="song-item" data-index="${i}" data-id="${s.id}">
        <div class="song-thumb">♫</div>
        <div class="song-info">
          <div class="song-title">${escHtml(s.title || s.filename || 'Unbekannt')}</div>
          <div class="song-meta">${escHtml(s.artist || '')}${s.artist && s.album ? ' · ' : ''}${escHtml(s.album || '')}</div>
        </div>
        <div class="song-actions">
          ${showDownload ? `<button class="btn-download ${isDownloaded ? 'downloaded' : ''}" data-id="${s.id}" title="Offline speichern">${isDownloaded ? '✓' : '↓'}</button>` : ''}
        </div>
      </div>`;
  }).join('');

  // Play on row click
  container.querySelectorAll('.song-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-download')) return;
      const idx = parseInt(el.dataset.index);
      playSong(idx, list);
    });
  });

  // Download
  container.querySelectorAll('.btn-download').forEach(btn => {
    btn.addEventListener('click', async (e) => {
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
  playlist = list;
  playIndex = index;
  const song = playlist[playIndex];
  if (!song) return;
  currentSong = song;

  const isOffline = !!offlineSongs[song.id];
  if (isOffline) {
    audio.src = offlineSongs[song.id].dataUrl;
  } else {
    const headers = authToken ? `?token=${encodeURIComponent(authToken)}` : '';
    audio.src = `${serverUrl}/api/songs/${song.id}/stream${headers}`;
  }

  audio.play();
  isPlaying = true;
  updatePlayerBar();
}

btnPlay.addEventListener('click', () => {
  if (!currentSong) return;
  if (isPlaying) { audio.pause(); isPlaying = false; btnPlay.textContent = '▶'; }
  else { audio.play(); isPlaying = true; btnPlay.textContent = '⏸'; }
});

btnPrev.addEventListener('click', () => {
  if (playIndex > 0) playSong(playIndex - 1, playlist);
});

btnNext.addEventListener('click', () => {
  if (playIndex < playlist.length - 1) playSong(playIndex + 1, playlist);
});

audio.addEventListener('ended', () => {
  if (playIndex < playlist.length - 1) playSong(playIndex + 1, playlist);
  else isPlaying = false;
});

audio.addEventListener('timeupdate', () => {
  if (audio.duration) {
    progressFill.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
  }
});

function updatePlayerBar() {
  if (!currentSong) return;
  playerBar.classList.remove('hidden');
  playerTitle.textContent = currentSong.title || currentSong.filename || 'Unbekannt';
  playerArtist.textContent = currentSong.artist || '';
  btnPlay.textContent = '⏸';
}

// ===== Download / Offline =====
async function loadOfflineMeta() {
  const saved = await Preferences.get({ key: 'cumu_offline_meta' });
  if (saved.value) offlineSongs = JSON.parse(saved.value);
  renderOfflineList();
}

async function downloadSong(id, btn) {
  try {
    const headers = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const res = await fetch(`${serverUrl}/api/songs/${id}/stream`, { headers, credentials: 'include' });
    if (!res.ok) throw new Error('Download fehlgeschlagen');
    const blob = await res.blob();
    const reader = new FileReader();
    reader.onload = async (e) => {
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
  renderSongList(list, offlineListEl, false);
  if (list.length) {
    offlineListEl.querySelector('.empty-hint')?.remove();
  } else {
    offlineListEl.innerHTML = '<p class="empty-hint">Noch keine Lieder heruntergeladen.<br/>Tippe auf ↓ um ein Lied zu speichern.</p>';
  }
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
